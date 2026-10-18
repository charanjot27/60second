import crypto from 'node:crypto';
import { config, siteUrl } from './config.js';
import { sites, processed, payments, isDuplicateKey } from './db.js';
import { alertOwner } from './notify.js';
import { markOutcome } from './memory.js';
import { invalidate } from './site.js';
import { track } from './limits.js';
import { log } from './log.js';
import { razorpayEnabled, rzp } from './razorpay.js';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const STRIPE = 'https://api.stripe.com/v1';
const CANCELLED = new Set(['canceled', 'unpaid', 'incomplete_expired']);

function stripeEnabled() {
  return Boolean(config.billing.stripeSecret && config.billing.priceId);
}

export function billingEnabled() {
  return razorpayEnabled() || stripeEnabled();
}

export function autopayAvailable() {
  return razorpayEnabled() ? Boolean(config.razorpay.planId) : stripeEnabled();
}

export function payMethods() {
  return razorpayEnabled() ? 'UPI, card or Apple Pay' : 'card, Apple Pay or Google Pay';
}

export function priceLabel() {
  if (config.billing.priceLabel) return config.billing.priceLabel;
  const amount = config.billing.amount / 100;
  return `${config.billing.currency === 'INR' ? '₹' : `${config.billing.currency} `}${amount} a month`;
}

export const shortDate = (d) =>
  new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

export function trialsEnabled() {
  return billingEnabled() || config.billing.trialsWithoutPayment;
}

export function keepOnlineText(slug) {
  return billingEnabled()
    ? `Keep it live for ${priceLabel()}, pay by ${payMethods()}: ${payLink(slug)}`
    : 'To keep it online, reply *keep it* here and our team will activate it for you.';
}

export async function activateManually(site, by) {
  await sites.updateOne(
    { _id: site._id },
    {
      $set: { status: 'active', plan: 'paid', 'billing.status': 'manual', 'billing.paidAt': new Date(), 'billing.activatedBy': by, updatedAt: new Date() },
      $unset: { expiredAt: '', cancelledAt: '', 'billing.paidUntil': '' },
    }
  );
  invalidate(site.slug, site.customDomain);
  track(site.ownerPhone, 'paid', { slug: site.slug, manual: true });
  markOutcome(site.slug, 'converted').catch(() => {});
}

export async function extendTrial(site, hours) {
  await sites.updateOne(
    { _id: site._id },
    {
      $set: { status: 'trial', trialEndsAt: new Date(Date.now() + hours * HOUR), updatedAt: new Date() },
      $unset: { expiredAt: '', 'billing.reminderAt': '' },
    }
  );
  invalidate(site.slug, site.customDomain);
}

export async function pauseSite(site) {
  await disableSite(site, 'expired', 'paused_by_admin');
}

export function trialEndsAt(from = new Date()) {
  return new Date(from.getTime() + config.billing.trialHours * HOUR);
}

export function accessState(site, now = Date.now()) {
  if (!site) return 'missing';
  if (site.status === 'suspended') return 'suspended';
  if (site.status === 'cancelled') return 'cancelled';
  if (site.status === 'expired') return 'expired';
  if (site.status === 'trial') {
    return site.trialEndsAt && new Date(site.trialEndsAt).getTime() <= now ? 'expired' : 'trial';
  }
  const until = site.billing?.paidUntil;
  if (site.plan === 'paid' && until && new Date(until).getTime() <= now) return 'expired';
  return 'live';
}

function sign(slug) {
  return crypto.createHmac('sha256', config.linkSecret).update(`pay:${slug}`).digest('hex').slice(0, 24);
}

export function payLink(slug) {
  return `https://${config.rootDomain}/pay/${slug}?k=${sign(slug)}`;
}

export function verifyPayKey(slug, key) {
  const expected = Buffer.from(sign(slug));
  const given = Buffer.from(String(key || ''));
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

function form(params, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(params)) {
    const key = prefix ? `${prefix}[${k}]` : k;
    if (v && typeof v === 'object') form(v, key, out);
    else if (v !== undefined && v !== null) out.append(key, String(v));
  }
  return out;
}

async function stripe(method, path, params) {
  const res = await fetch(`${STRIPE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${config.billing.stripeSecret}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params ? form(params) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Stripe ${res.status}: ${body?.error?.message || 'request failed'}`);
  return body;
}

export async function createCheckout(site) {
  const session = await stripe('POST', '/checkout/sessions', {
    mode: 'subscription',
    line_items: { 0: { price: config.billing.priceId, quantity: 1 } },
    client_reference_id: site.slug,
    metadata: { slug: site.slug },
    subscription_data: { metadata: { slug: site.slug } },
    allow_promotion_codes: 'true',
    success_url: `https://${config.rootDomain}/paid?site=${site.slug}`,
    cancel_url: siteUrl(site.slug),
  });
  return session.url;
}

export async function cancelSubscription(site) {
  const id = site.billing?.subscriptionId;
  if (id && site.billing?.provider === 'razorpay') {
    if (razorpayEnabled() && site.billing.autopay) await rzp('POST', `/subscriptions/${id}/cancel`, { cancel_at_cycle_end: 0 });
  } else if (id && stripeEnabled()) {
    await stripe('DELETE', `/subscriptions/${id}`);
  }
  await disableSite(site, 'cancelled', 'cancelled_by_owner');
}

const PENDING_MS = 20 * 60 * 1000;

async function razorpayLink(site, plan) {
  const reuse = site.billing?.pending?.[plan];
  if (reuse?.url && Date.now() - new Date(reuse.at).getTime() < PENDING_MS) return reuse.url;
  const notes = { slug: site.slug, plan };
  const made =
    plan === 'auto'
      ? await rzp('POST', '/subscriptions', {
          plan_id: config.razorpay.planId,
          total_count: 60,
          quantity: 1,
          customer_notify: 1,
          notes,
          expire_by: Math.floor((Date.now() + DAY) / 1000),
        })
      : await rzp('POST', '/payment_links', {
          amount: config.billing.amount,
          currency: config.billing.currency,
          accept_partial: false,
          reference_id: `${site.slug}-${Date.now().toString(36)}`,
          description: `${config.brand} website, ${config.billing.periodDays} days: ${site.slug}.${config.rootDomain}`,
          customer: { name: String(site.businessName || '').slice(0, 50), contact: `+${site.ownerPhone}` },
          notify: { sms: false, email: false },
          reminder_enable: false,
          notes,
          callback_url: `https://${config.rootDomain}/paid?site=${site.slug}`,
          callback_method: 'get',
          expire_by: Math.floor((Date.now() + 2 * HOUR) / 1000),
        });
  if (!made?.short_url) throw new Error('Razorpay returned no payment link');
  await sites.updateOne({ _id: site._id }, { $set: { [`billing.pending.${plan}`]: { id: made.id, url: made.short_url, at: new Date() } } });
  return made.short_url;
}

export async function createPayment(site, plan) {
  if (razorpayEnabled()) {
    if (plan === 'auto' && !config.razorpay.planId) plan = 'once';
    return razorpayLink(site, plan === 'auto' ? 'auto' : 'once');
  }
  return createCheckout(site);
}

async function claimPayment(paymentId, record) {
  try {
    await payments.insertOne({ _id: paymentId, ...record, at: new Date() });
    return true;
  } catch (err) {
    if (isDuplicateKey(err)) return false;
    throw err;
  }
}

function priceMatches(amount, currency) {
  return Number(amount) >= config.billing.amount && String(currency).toUpperCase() === config.billing.currency;
}

async function markPaid(site, set) {
  await sites.updateOne(
    { _id: site._id },
    {
      $set: { status: 'active', plan: 'paid', 'billing.provider': 'razorpay', 'billing.status': 'active', 'billing.paidAt': new Date(), updatedAt: new Date(), ...set },
      $unset: { expiredAt: '', cancelledAt: '', 'billing.renewReminderAt': '' },
    }
  );
  invalidate(site.slug, site.customDomain);
  track(site.ownerPhone, 'paid', { slug: site.slug });
  markOutcome(site.slug, 'converted').catch(() => {});
}

export async function confirmPaymentLink(linkId) {
  const link = await rzp('GET', `/payment_links/${encodeURIComponent(linkId)}`);
  if (link.status !== 'paid') return null;
  const site = link.notes?.slug && (await sites.findOne({ slug: link.notes.slug }));
  if (!site) {
    log.warn('payment for unknown site', { slug: link.notes?.slug });
    return null;
  }
  const paymentId = link.payments?.find((p) => p.status === 'captured')?.payment_id || link.payments?.[0]?.payment_id || link.id;
  if (!priceMatches(link.amount_paid, link.currency)) {
    log.warn('payment amount mismatch', { slug: site.slug, amount: link.amount_paid, currency: link.currency });
    return null;
  }
  if (!(await claimPayment(paymentId, { slug: site.slug, kind: 'once', amount: link.amount_paid, currency: link.currency, linkId: link.id }))) return site;
  const current = site.billing?.paidUntil && accessState(site) === 'live' ? new Date(site.billing.paidUntil).getTime() : Date.now();
  const paidUntil = new Date(Math.max(current, Date.now()) + config.billing.periodDays * DAY);
  try {
    await markPaid(site, { 'billing.paidUntil': paidUntil, 'billing.lastPaymentId': paymentId, 'billing.pending.once': null });
  } catch (err) {
    await payments.deleteOne({ _id: paymentId }).catch(() => {});
    throw err;
  }
  await alertOwner(
    site,
    `✅ Payment received, thank you! ${siteUrl(site.slug)} is live until *${shortDate(paidUntil)}*.

To pay for the next month, send *pay* anytime.`,
    'Payment received'
  );
  return { ...site, billing: { ...site.billing, paidUntil } };
}

export async function confirmSubscription(subscriptionId, paymentId) {
  const sub = await rzp('GET', `/subscriptions/${encodeURIComponent(subscriptionId)}`);
  if (sub.plan_id !== config.razorpay.planId || sub.status !== 'active' || !sub.current_end) return null;
  const site = sub.notes?.slug && (await sites.findOne({ slug: sub.notes.slug }));
  if (!site) {
    log.warn('subscription for unknown site', { slug: sub.notes?.slug });
    return null;
  }
  const paidUntil = new Date(sub.current_end * 1000 + 2 * DAY);
  await markPaid(site, {
    'billing.paidUntil': paidUntil,
    'billing.subscriptionId': sub.id,
    'billing.autopay': true,
    'billing.pending.auto': null,
    ...(paymentId ? { 'billing.lastPaymentId': paymentId } : {}),
  });
  const claimed = await claimPayment(`${sub.id}:${sub.current_end}`, {
    slug: site.slug,
    kind: 'autopay',
    paymentId: paymentId || null,
    subscriptionId: sub.id,
    amount: config.billing.amount,
    currency: config.billing.currency,
  });
  if (!claimed) return site;
  await alertOwner(
    site,
    `✅ Autopay is on, thank you! ${siteUrl(site.slug)} stays live and renews by itself every month (next around *${shortDate(sub.current_end * 1000)}*).

To stop autopay, send *cancel plan*.`,
    'Payment received'
  );
  return site;
}

async function autopayStopped(subscription, reason) {
  const site = await sites.findOne({ 'billing.subscriptionId': subscription.id });
  if (!site || site.status === 'cancelled' || !site.billing?.autopay) return;
  await sites.updateOne({ _id: site._id }, { $set: { 'billing.autopay': false, 'billing.status': reason, updatedAt: new Date() } });
  const until = site.billing.paidUntil;
  await alertOwner(
    site,
    `⚠️ Autopay for ${siteUrl(site.slug)} has stopped.` +
      (until && new Date(until) > new Date() ? ` Your website stays live until *${shortDate(until)}*.` : '') +
      `

To keep it online, pay here: ${payLink(site.slug)}`,
    'Autopay stopped'
  );
}

export async function handleRazorpayEvent(event, eventId) {
  const key = eventId ? `rzp:${eventId}` : null;
  if (key) {
    try {
      await processed.insertOne({ _id: key, at: new Date() });
    } catch (err) {
      if (isDuplicateKey(err)) return;
      throw err;
    }
  }
  try {
    const payload = event?.payload || {};
    const sub = payload.subscription?.entity;
    if (event.event === 'payment_link.paid' && payload.payment_link?.entity?.id) {
      await confirmPaymentLink(payload.payment_link.entity.id);
    } else if (['subscription.activated', 'subscription.charged', 'subscription.resumed'].includes(event.event) && sub?.id) {
      await confirmSubscription(sub.id, payload.payment?.entity?.id);
    } else if (event.event === 'subscription.pending' && sub?.id) {
      const site = await sites.findOne({ 'billing.subscriptionId': sub.id });
      if (site) {
        await alertOwner(site, `⚠️ This month's autopay for ${siteUrl(site.slug)} did not go through. Razorpay will retry, please keep money in the linked account or card.`, 'Payment failed');
      }
    } else if (['subscription.halted', 'subscription.cancelled', 'subscription.completed', 'subscription.paused'].includes(event.event) && sub?.id) {
      await autopayStopped(sub, event.event.split('.')[1]);
    }
  } catch (err) {
    if (key) await processed.deleteOne({ _id: key }).catch(() => {});
    throw err;
  }
}

export function verifyStripeSignature(rawBody, header, secret = config.billing.webhookSecret, now = Date.now()) {
  if (!secret || !header || !Buffer.isBuffer(rawBody)) return false;
  const parts = Object.fromEntries(
    String(header)
      .split(',')
      .map((p) => p.split('='))
      .filter((p) => p.length === 2 && p[0] !== 'v1')
  );
  const signatures = String(header)
    .split(',')
    .filter((p) => p.startsWith('v1='))
    .map((p) => p.slice(3));
  const t = Number(parts.t);
  if (!t || Math.abs(now / 1000 - t) > 300 || !signatures.length) return false;
  const expected = Buffer.from(
    crypto.createHmac('sha256', secret).update(`${t}.`).update(rawBody).digest('hex')
  );
  return signatures.some((sig) => {
    const given = Buffer.from(sig);
    return given.length === expected.length && crypto.timingSafeEqual(given, expected);
  });
}

async function disableSite(site, status, reason) {
  await sites.updateOne(
    { _id: site._id },
    { $set: { status, 'billing.status': reason, [`${status}At`]: new Date(), updatedAt: new Date() } }
  );
  invalidate(site.slug, site.customDomain);
  track(site.ownerPhone, status, { slug: site.slug, reason });
}

export async function handleStripeEvent(event) {
  try {
    await processed.insertOne({ _id: `stripe:${event.id}`, at: new Date() });
  } catch (err) {
    if (isDuplicateKey(err)) return;
    throw err;
  }
  const obj = event.data?.object || {};

  if (event.type === 'checkout.session.completed') {
    const slug = obj.metadata?.slug || obj.client_reference_id;
    const site = slug && (await sites.findOne({ slug }));
    if (!site) return log.warn('payment for unknown site', { slug });
    await sites.updateOne(
      { _id: site._id },
      {
        $set: {
          status: 'active',
          plan: 'paid',
          'billing.customerId': obj.customer || null,
          'billing.subscriptionId': obj.subscription || null,
          'billing.status': 'active',
          'billing.paidAt': new Date(),
          updatedAt: new Date(),
        },
        $unset: { expiredAt: '', cancelledAt: '' },
      }
    );
    invalidate(site.slug, site.customDomain);
    track(site.ownerPhone, 'paid', { slug: site.slug });
    markOutcome(site.slug, 'converted').catch(() => {});
    await alertOwner(site, `✅ Payment received, thank you! Your website stays live:\n${siteUrl(site.slug)}`, 'Payment received');
    return;
  }

  if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
    const site =
      (await sites.findOne({ 'billing.subscriptionId': obj.id })) ||
      (obj.metadata?.slug && (await sites.findOne({ slug: obj.metadata.slug })));
    if (!site) return;
    const cancelled = event.type === 'customer.subscription.deleted' || obj.cancel_at_period_end || CANCELLED.has(obj.status);
    if (cancelled) {
      if (site.status === 'cancelled') return;
      await disableSite(site, 'cancelled', obj.status || 'canceled');
      await alertOwner(
        site,
        `Your ${config.brand} plan was cancelled, so ${siteUrl(site.slug)} is now offline.\n\nTo bring it back, subscribe again: ${payLink(site.slug)}`,
        'Plan cancelled'
      );
      return;
    }
    if (obj.status === 'past_due') {
      await sites.updateOne({ _id: site._id }, { $set: { 'billing.status': 'past_due' } });
      await alertOwner(site, `⚠️ Your last payment for ${siteUrl(site.slug)} did not go through. Please check your card; we will retry automatically.`, 'Payment failed');
      return;
    }
    if (obj.status === 'active') {
      await sites.updateOne({ _id: site._id }, { $set: { 'billing.status': 'active' } });
    }
  }
}

export async function sweepPlans(now = new Date()) {
  if (!billingEnabled()) return;
  const soon = new Date(now.getTime() + 3 * DAY);
  const ending = await sites
    .find({ status: 'active', plan: 'paid', 'billing.paidUntil': { $gt: now, $lte: soon }, 'billing.renewReminderAt': { $exists: false } })
    .limit(200)
    .toArray();
  for (const site of ending.filter((x) => !x.billing?.autopay)) {
    await sites.updateOne({ _id: site._id }, { $set: { 'billing.renewReminderAt': now } });
    await alertOwner(
      site,
      `⏳ Your paid month for ${siteUrl(site.slug)} ends on *${shortDate(site.billing.paidUntil)}*.

Pay for the next month (${priceLabel()}) by ${payMethods()}: ${payLink(site.slug)}`,
      'Your plan ends soon'
    );
  }

  const ended = await sites.find({ status: 'active', plan: 'paid', 'billing.paidUntil': { $lte: now } }).limit(200).toArray();
  for (const site of ended) {
    await disableSite(site, 'expired', 'period_ended');
    await alertOwner(
      site,
      `Your paid month has ended, so ${siteUrl(site.slug)} is now offline.

Pay ${priceLabel()} by ${payMethods()} to bring it back instantly: ${payLink(site.slug)}`,
      'Your plan has ended'
    );
  }
}

export async function sweepTrials(now = new Date()) {
  if (!trialsEnabled()) return;
  const soon = new Date(now.getTime() + 4 * HOUR);
  const reminders = await sites
    .find({ status: 'trial', trialEndsAt: { $gt: now, $lte: soon }, 'billing.reminderAt': { $exists: false } })
    .limit(200)
    .toArray();
  for (const site of reminders) {
    await sites.updateOne({ _id: site._id }, { $set: { 'billing.reminderAt': now } });
    await alertOwner(
      site,
      `⏳ Your free website ${siteUrl(site.slug)} goes offline in a few hours.\n\n${keepOnlineText(site.slug)}`,
      'Your free trial ends soon'
    );
  }

  const expired = await sites.find({ status: 'trial', trialEndsAt: { $lte: now } }).limit(200).toArray();
  for (const site of expired) {
    await disableSite(site, 'expired', 'trial_ended');
    await alertOwner(
      site,
      `Your free trial has ended, so ${siteUrl(site.slug)} is now offline.\n\n${billingEnabled() ? `Pay ${priceLabel()} by ${payMethods()} to bring it back instantly: ${payLink(site.slug)}` : 'Reply *keep it* here and our team will bring it back for you.'}`,
      'Your free trial has ended'
    );
  }
}
