import crypto from 'node:crypto';
import { config, siteUrl } from './config.js';
import { sites, processed, isDuplicateKey } from './db.js';
import { alertOwner } from './notify.js';
import { markOutcome } from './memory.js';
import { invalidate } from './site.js';
import { track } from './limits.js';
import { log } from './log.js';

const HOUR = 60 * 60 * 1000;
const STRIPE = 'https://api.stripe.com/v1';
const CANCELLED = new Set(['canceled', 'unpaid', 'incomplete_expired']);

export function billingEnabled() {
  return Boolean(config.billing.stripeSecret && config.billing.priceId);
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
  if (id && billingEnabled()) await stripe('DELETE', `/subscriptions/${id}`);
  await disableSite(site, 'cancelled', 'cancelled_by_owner');
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

export async function sweepTrials(now = new Date()) {
  if (!billingEnabled()) return;
  const soon = new Date(now.getTime() + 4 * HOUR);
  const reminders = await sites
    .find({ status: 'trial', trialEndsAt: { $gt: now, $lte: soon }, 'billing.reminderAt': { $exists: false } })
    .limit(200)
    .toArray();
  for (const site of reminders) {
    await sites.updateOne({ _id: site._id }, { $set: { 'billing.reminderAt': now } });
    await alertOwner(
      site,
      `⏳ Your free website ${siteUrl(site.slug)} goes offline in a few hours.\n\nKeep it live${config.billing.priceLabel ? ` for ${config.billing.priceLabel}` : ''}: ${payLink(site.slug)}`,
      'Your free trial ends soon'
    );
  }

  const expired = await sites.find({ status: 'trial', trialEndsAt: { $lte: now } }).limit(200).toArray();
  for (const site of expired) {
    await disableSite(site, 'expired', 'trial_ended');
    await alertOwner(
      site,
      `Your 24-hour free trial has ended, so ${siteUrl(site.slug)} is now offline.\n\nSubscribe to bring it back instantly: ${payLink(site.slug)}`,
      'Your free trial has ended'
    );
  }
}
