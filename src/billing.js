import crypto from 'node:crypto';
import { config, siteUrl } from './config.js';
import { sites, processed, payments, isDuplicateKey } from './db.js';
import { alertOwner } from './notify.js';
import { markOutcome } from './memory.js';
import { invalidate } from './site.js';
import { track } from './limits.js';
import { log } from './log.js';
import { razorpayEnabled, rzp } from './razorpay.js';
import { stripeEnabled, stripe } from './stripe.js';
import { plans, planById, priceLabel } from './plans.js';

export { verifyStripeSignature } from './stripe.js';
export { priceLabel } from './plans.js';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const GRACE = 2 * DAY;
const CANCELLED = new Set(['canceled', 'unpaid', 'incomplete_expired']);

export function provider() {
  const wanted = config.billing.provider;
  if (wanted === 'razorpay' && razorpayEnabled()) return 'razorpay';
  if (wanted === 'stripe' && stripeEnabled()) return 'stripe';
  if (stripeEnabled()) return 'stripe';
  return razorpayEnabled() ? 'razorpay' : null;
}

export function billingEnabled() {
  return Boolean(provider()) && plans().length > 0;
}

export function autopayAvailable(plan) {
  if (provider() === 'stripe') return true;
  if (provider() !== 'razorpay') return false;
  return plan ? Boolean(config.razorpay.plans[plan.id]) : plans().some((p) => config.razorpay.plans[p.id]);
}

export function payMethods() {
  return provider() === 'razorpay' ? 'UPI, card or Apple Pay' : 'card, Apple Pay or Google Pay';
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

export function payLink(slug, path = '', extra = '') {
  return `https://${config.rootDomain}/pay/${slug}${path}?k=${sign(slug)}${extra}`;
}

export const payOnceLink = (slug) => payLink(slug, '', '&once=1');

export async function portalLink(site) {
  if (provider() !== 'stripe' || !site.billing?.customerId) return null;
  const session = await stripe('POST', '/billing_portal/sessions', { customer: site.billing.customerId, return_url: siteUrl(site.slug) });
  return session?.url || null;
}

export function verifyPayKey(slug, key) {
  const expected = Buffer.from(sign(slug));
  const given = Buffer.from(String(key || ''));
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

async function disableSite(site, status, reason) {
  await sites.updateOne(
    { _id: site._id },
    { $set: { status, 'billing.status': reason, [`${status}At`]: new Date(), updatedAt: new Date() } }
  );
  invalidate(site.slug, site.customDomain);
  track(site.ownerPhone, status, { slug: site.slug, reason });
}

export async function cancelSubscription(site) {
  const id = site.billing?.subscriptionId;
  if (id && site.billing?.autopay !== false) {
    if (site.billing?.provider === 'razorpay') {
      if (razorpayEnabled()) await rzp('POST', `/subscriptions/${id}/cancel`, { cancel_at_cycle_end: 0 });
    } else if (stripeEnabled()) {
      await stripe('DELETE', `/subscriptions/${id}`);
    }
  }
  await disableSite(site, 'cancelled', 'cancelled_by_owner');
}

function purchaseFor(site, kind, planId) {
  if (kind === 'domain') {
    const order = site.domainOrder;
    if (!order?.charge || Date.now() - new Date(order.at).getTime() > 2 * HOUR) return null;
    return { kind, amount: order.charge, orderId: order.id, domain: order.domain, title: `${order.domain}, 1 year` };
  }
  const plan = planById(planId) || plans()[0];
  return plan && { kind: 'service', plan, amount: plan.amount, title: `${config.brand} website, ${plan.name.toLowerCase()}: ${site.slug}.${config.rootDomain}` };
}

async function stripeCheckout(site, purchase, auto) {
  const metadata = { slug: site.slug, kind: purchase.kind, plan: purchase.plan?.id, domain: purchase.domain, orderId: purchase.orderId };
  const session = await stripe('POST', '/checkout/sessions', {
    mode: auto ? 'subscription' : 'payment',
    line_items: {
      0: {
        quantity: 1,
        price_data: {
          currency: config.billing.currency.toLowerCase(),
          unit_amount: purchase.amount,
          product_data: { name: purchase.title },
          ...(auto ? { recurring: purchase.plan.recurring } : {}),
        },
      },
    },
    client_reference_id: site.slug,
    metadata,
    ...(auto ? { subscription_data: { metadata } } : { payment_intent_data: { metadata } }),
    ...(site.billing?.customerId ? { customer: site.billing.customerId } : auto ? {} : { customer_creation: 'always' }),
    locale: 'auto',
    custom_text: {
      submit: {
        message: auto
          ? `${site.businessName || 'Your website'} stays online and renews by itself. Stop anytime by sending "cancel plan" on WhatsApp.`
          : `${site.businessName || 'Your website'} stays online for the time you pay for. Nothing is charged automatically.`,
      },
    },
    success_url: `https://${config.rootDomain}/paid?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: siteUrl(site.slug),
  });
  if (!session?.url) throw new Error('Stripe returned no checkout link');
  return session.url;
}

async function razorpayCheckout(site, purchase, auto) {
  const notes = { slug: site.slug, kind: purchase.kind, plan: purchase.plan?.id || '', domain: purchase.domain || '', orderId: purchase.orderId || '' };
  const made = auto
    ? await rzp('POST', '/subscriptions', {
        plan_id: config.razorpay.plans[purchase.plan.id],
        total_count: 60,
        quantity: 1,
        customer_notify: 1,
        notes,
        expire_by: Math.floor((Date.now() + DAY) / 1000),
      })
    : await rzp('POST', '/payment_links', {
        amount: purchase.amount,
        currency: config.billing.currency,
        accept_partial: false,
        reference_id: `${site.slug}-${Date.now().toString(36)}`.slice(0, 40),
        description: purchase.title,
        customer: { name: String(site.businessName || '').slice(0, 50), contact: `+${site.ownerPhone}` },
        notify: { sms: false, email: false },
        reminder_enable: false,
        notes,
        callback_url: `https://${config.rootDomain}/paid?site=${site.slug}`,
        callback_method: 'get',
        expire_by: Math.floor((Date.now() + 2 * HOUR) / 1000),
      });
  if (!made?.short_url) throw new Error('Razorpay returned no payment link');
  return made.short_url;
}

export async function createPayment(site, { kind = 'service', plan, auto = false } = {}) {
  const purchase = purchaseFor(site, kind, plan);
  if (!purchase) throw new Error('Nothing to pay for');
  const recurring = kind === 'service' && auto && autopayAvailable(purchase.plan);
  return provider() === 'razorpay' ? razorpayCheckout(site, purchase, recurring) : stripeCheckout(site, purchase, recurring);
}

export async function refundPayment(pay) {
  if (/^pi_/.test(pay.id || '') && stripeEnabled()) {
    await stripe('POST', '/refunds', { payment_intent: pay.id }, `refund-${pay.id}`);
    return true;
  }
  if (/^pay_/.test(pay.id || '') && razorpayEnabled()) {
    await rzp('POST', `/payments/${encodeURIComponent(pay.id)}/refund`, {});
    return true;
  }
  return false;
}

async function offerDomainAfterPayment(site) {
  const shop = await import('./domainshop.js');
  if (!shop.domainShopEnabled() && !shop.domainIdeasEnabled()) return;
  const fresh = await sites.findOne({ _id: site._id });
  if (!fresh || fresh.domain?.name || fresh.customDomain || fresh.domainOffered) return;
  await sites.updateOne({ _id: site._id }, { $set: { domainOffered: new Date() } });
  await shop.offerDomains(fresh);
}

async function claimPayment(id, record) {
  try {
    await payments.insertOne({ _id: id, ...record, at: new Date() });
    return true;
  } catch (err) {
    if (isDuplicateKey(err)) return false;
    throw err;
  }
}

const currencyOk = (currency) => String(currency || '').toUpperCase() === config.billing.currency;

async function markPaid(site, set) {
  await sites.updateOne(
    { _id: site._id },
    {
      $set: { status: 'active', plan: 'paid', 'billing.status': 'active', 'billing.paidAt': new Date(), updatedAt: new Date(), ...set },
      $unset: { expiredAt: '', cancelledAt: '', 'billing.renewReminderAt': '' },
    }
  );
  invalidate(site.slug, site.customDomain);
  track(site.ownerPhone, 'paid', { slug: site.slug });
  markOutcome(site.slug, 'converted').catch(() => {});
}

async function applyOneTime(site, pay) {
  if (!currencyOk(pay.currency)) {
    log.warn('payment currency mismatch', { slug: site.slug, currency: pay.currency });
    return null;
  }
  if (pay.kind === 'domain') {
    if (!(await claimPayment(pay.id, { slug: site.slug, kind: 'domain', amount: pay.amount, currency: pay.currency, provider: pay.provider, domain: pay.domain }))) {
      return { site, kind: 'domain' };
    }
    const { domainPaid } = await import('./domainshop.js');
    await domainPaid(site, pay);
    return { site, kind: 'domain', domain: pay.domain };
  }
  const plan = planById(pay.plan) || plans()[0];
  if (!plan || Number(pay.amount) < plan.amount) {
    log.warn('payment amount mismatch', { slug: site.slug, amount: pay.amount, plan: pay.plan });
    return null;
  }
  if (!(await claimPayment(pay.id, { slug: site.slug, kind: 'service', plan: plan.id, amount: pay.amount, currency: pay.currency, provider: pay.provider }))) {
    return { site, kind: 'service', paidUntil: site.billing?.paidUntil };
  }
  const current = site.billing?.paidUntil && accessState(site) === 'live' ? new Date(site.billing.paidUntil).getTime() : 0;
  const paidUntil = new Date(Math.max(current, Date.now()) + plan.days * DAY);
  try {
    await markPaid(site, {
      'billing.paidUntil': paidUntil,
      'billing.lastPaymentId': pay.id,
      'billing.provider': pay.provider,
      'billing.planId': plan.id,
      ...(pay.customerId ? { 'billing.customerId': pay.customerId } : {}),
    });
  } catch (err) {
    await payments.deleteOne({ _id: pay.id }).catch(() => {});
    throw err;
  }
  await alertOwner(
    site,
    `✅ Payment received, thank you! ${siteUrl(site.slug)} is live until *${shortDate(paidUntil)}*.\n\nTo pay for the next period, send *pay* anytime.`,
    'Payment received'
  );
  offerDomainAfterPayment(site).catch((err) => log.warn('domain offer failed', { error: err.message }));
  return { site, kind: 'service', paidUntil };
}

async function applySubscription(site, sub) {
  const paidUntil = new Date(sub.periodEnd * 1000 + GRACE);
  await markPaid(site, {
    'billing.paidUntil': paidUntil,
    'billing.subscriptionId': sub.id,
    'billing.autopay': true,
    'billing.provider': sub.provider,
    'billing.planId': sub.plan.id,
    ...(sub.customerId ? { 'billing.customerId': sub.customerId } : {}),
    ...(sub.paymentId ? { 'billing.lastPaymentId': sub.paymentId } : {}),
  });
  const claimed = await claimPayment(`${sub.id}:${sub.periodEnd}`, {
    slug: site.slug,
    kind: 'autopay',
    plan: sub.plan.id,
    paymentId: sub.paymentId || null,
    subscriptionId: sub.id,
    amount: sub.amount ?? sub.plan.amount,
    currency: config.billing.currency,
    provider: sub.provider,
  });
  if (claimed) {
    await alertOwner(
      site,
      `✅ Autopay payment received, thank you! ${siteUrl(site.slug)} stays live and renews by itself ${sub.plan.every} (next around *${shortDate(sub.periodEnd * 1000)}*).\n\nTo stop autopay, send *cancel plan*.`,
      'Payment received'
    );
    offerDomainAfterPayment(site).catch((err) => log.warn('domain offer failed', { error: err.message }));
  }
  return { site, kind: 'service', paidUntil };
}

async function autopayStopped(site, reason) {
  if (!site || site.status === 'cancelled' || site.billing?.autopay === false) return;
  if (!site.billing?.paidUntil) {
    await disableSite(site, 'cancelled', reason);
    await alertOwner(site, `Your ${config.brand} plan was cancelled, so ${siteUrl(site.slug)} is now offline.\n\nTo bring it back, pay here: ${payLink(site.slug)}`, 'Plan cancelled');
    return;
  }
  await sites.updateOne({ _id: site._id }, { $set: { 'billing.autopay': false, 'billing.status': reason, updatedAt: new Date() } });
  const until = site.billing.paidUntil;
  await alertOwner(
    site,
    `⚠️ Autopay for ${siteUrl(site.slug)} has stopped.` +
      (new Date(until) > new Date() ? ` Your website stays live until *${shortDate(until)}*.` : '') +
      `\n\nTo keep it online, pay here: ${payLink(site.slug)}`,
    'Autopay stopped'
  );
}

async function siteBySlug(slug) {
  const site = slug && (await sites.findOne({ slug }));
  if (!site) log.warn('payment for unknown site', { slug });
  return site || null;
}

async function stripeSubscription(id, paymentId) {
  const sub = await stripe('GET', `/subscriptions/${encodeURIComponent(id)}`);
  const item = sub.items?.data?.[0];
  const plan = planById(sub.metadata?.plan);
  const periodEnd = sub.current_period_end || item?.current_period_end;
  if (!plan || !['active', 'trialing'].includes(sub.status) || !periodEnd) return null;
  if (Number(item?.price?.unit_amount) < plan.amount || !currencyOk(item?.price?.currency)) {
    log.warn('subscription price mismatch', { id, amount: item?.price?.unit_amount });
    return null;
  }
  const site = await siteBySlug(sub.metadata?.slug);
  return site && applySubscription(site, { provider: 'stripe', id: sub.id, plan, periodEnd, paymentId, amount: item.price.unit_amount, customerId: typeof sub.customer === 'string' ? sub.customer : sub.customer?.id });
}

export async function confirmCheckout(sessionId) {
  const session = await stripe('GET', `/checkout/sessions/${encodeURIComponent(sessionId)}`);
  if (session.status !== 'complete' || session.payment_status !== 'paid') return null;
  if (session.mode === 'subscription') return session.subscription ? stripeSubscription(session.subscription) : null;
  const meta = session.metadata || {};
  const site = await siteBySlug(meta.slug);
  return (
    site &&
    applyOneTime(site, {
      id: session.payment_intent || session.id,
      kind: meta.kind === 'domain' ? 'domain' : 'service',
      plan: meta.plan,
      domain: meta.domain,
      orderId: meta.orderId,
      amount: session.amount_total,
      currency: session.currency,
      provider: 'stripe',
      customerId: typeof session.customer === 'string' ? session.customer : session.customer?.id,
    })
  );
}

async function onceEvent(key, run) {
  try {
    await processed.insertOne({ _id: key, at: new Date() });
  } catch (err) {
    if (isDuplicateKey(err)) return;
    throw err;
  }
  try {
    await run();
  } catch (err) {
    await processed.deleteOne({ _id: key }).catch(() => {});
    throw err;
  }
}

export function handleStripeEvent(event) {
  return onceEvent(`stripe:${event.id}`, async () => {
    const obj = event.data?.object || {};
    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      await confirmCheckout(obj.id);
      return;
    }
    if (event.type === 'invoice.paid') {
      const subId = obj.subscription || obj.parent?.subscription_details?.subscription;
      if (subId) await stripeSubscription(subId, obj.payment_intent || obj.id);
      return;
    }
    if (event.type === 'invoice.payment_failed') {
      const subId = obj.subscription || obj.parent?.subscription_details?.subscription;
      const site = subId && (await sites.findOne({ 'billing.subscriptionId': subId }));
      if (site) {
        const portal = await portalLink(site).catch(() => null);
        await alertOwner(
          site,
          `⚠️ This autopay payment for ${siteUrl(site.slug)} did not go through. It will be tried again automatically.` +
            (portal ? `\n\nTo use another card, tap: ${portal}` : '\n\nPlease check your card.'),
          'Payment failed'
        );
      }
      return;
    }
    if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
      const stopped = event.type === 'customer.subscription.deleted' || obj.cancel_at_period_end || CANCELLED.has(obj.status);
      if (!stopped) return;
      const site =
        (await sites.findOne({ 'billing.subscriptionId': obj.id })) ||
        (obj.metadata?.slug && (await sites.findOne({ slug: obj.metadata.slug })));
      await autopayStopped(site, obj.status || 'canceled');
    }
  });
}

export async function confirmPaymentLink(linkId) {
  const link = await rzp('GET', `/payment_links/${encodeURIComponent(linkId)}`);
  if (link.status !== 'paid') return null;
  const notes = link.notes || {};
  const site = await siteBySlug(notes.slug);
  if (!site) return null;
  const paymentId = link.payments?.find((p) => p.status === 'captured')?.payment_id || link.payments?.[0]?.payment_id || link.id;
  return applyOneTime(site, {
    id: paymentId,
    kind: notes.kind === 'domain' ? 'domain' : 'service',
    plan: notes.plan || 'monthly',
    domain: notes.domain,
    orderId: notes.orderId,
    amount: link.amount_paid,
    currency: link.currency,
    provider: 'razorpay',
  });
}

export async function confirmSubscription(subscriptionId, paymentId) {
  const sub = await rzp('GET', `/subscriptions/${encodeURIComponent(subscriptionId)}`);
  const plan = plans().find((p) => config.razorpay.plans[p.id] && config.razorpay.plans[p.id] === sub.plan_id);
  if (!plan || sub.status !== 'active' || !sub.current_end) return null;
  const site = await siteBySlug(sub.notes?.slug);
  return site && applySubscription(site, { provider: 'razorpay', id: sub.id, plan, periodEnd: sub.current_end, paymentId });
}

export async function handleRazorpayEvent(event, eventId) {
  const run = async () => {
    const payload = event?.payload || {};
    const sub = payload.subscription?.entity;
    if (event.event === 'payment_link.paid' && payload.payment_link?.entity?.id) {
      await confirmPaymentLink(payload.payment_link.entity.id);
    } else if (['subscription.activated', 'subscription.charged', 'subscription.resumed'].includes(event.event) && sub?.id) {
      await confirmSubscription(sub.id, payload.payment?.entity?.id);
    } else if (event.event === 'subscription.pending' && sub?.id) {
      const site = await sites.findOne({ 'billing.subscriptionId': sub.id });
      if (site) {
        await alertOwner(site, `⚠️ This autopay payment for ${siteUrl(site.slug)} did not go through. Razorpay will retry, please keep money in the linked account or card.`, 'Payment failed');
      }
    } else if (['subscription.halted', 'subscription.cancelled', 'subscription.completed', 'subscription.paused'].includes(event.event) && sub?.id) {
      await autopayStopped(await sites.findOne({ 'billing.subscriptionId': sub.id }), event.event.split('.')[1]);
    }
  };
  return eventId ? onceEvent(`rzp:${eventId}`, run) : run();
}

export async function sweepPlans(now = new Date()) {
  if (!billingEnabled()) return;
  const soon = new Date(now.getTime() + 2 * DAY + GRACE);
  const ending = await sites
    .find({ status: 'active', plan: 'paid', 'billing.paidUntil': { $gt: now, $lte: soon }, 'billing.renewReminderAt': { $exists: false } })
    .limit(200)
    .toArray();
  for (const site of ending) {
    const until = new Date(site.billing.paidUntil);
    if (site.billing?.autopay) {
      const chargeAt = new Date(until.getTime() - GRACE);
      if (chargeAt - now > DAY) continue;
      await sites.updateOne({ _id: site._id }, { $set: { 'billing.renewReminderAt': now } });
      await alertOwner(
        site,
        `🔔 Friendly reminder: your website plan renews automatically on *${shortDate(chargeAt)}* (${priceLabel()}). Nothing to do. To stop autopay, send *cancel plan*.`,
        'Your plan renews soon'
      );
      continue;
    }
    if (until - now > 2 * DAY) continue;
    await sites.updateOne({ _id: site._id }, { $set: { 'billing.renewReminderAt': now } });
    await alertOwner(
      site,
      `⏳ Your website ${siteUrl(site.slug)} is paid until *${shortDate(until)}*.\n\nTo keep it online (${priceLabel()}), tap: ${payLink(site.slug)}`,
      'Your plan ends soon'
    );
  }

  const ended = await sites.find({ status: 'active', plan: 'paid', 'billing.paidUntil': { $lte: now } }).limit(200).toArray();
  for (const site of ended) {
    await disableSite(site, 'expired', 'period_ended');
    await alertOwner(
      site,
      `Your paid time has ended, so ${siteUrl(site.slug)} is now offline.\n\nPay ${priceLabel()} by ${payMethods()} to bring it back instantly: ${payLink(site.slug)}`,
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
