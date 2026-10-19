import crypto from 'node:crypto';
import { config, siteUrl } from './config.js';
import { sites } from './db.js';
import { porkbun, porkbunEnabled, usdCents } from './porkbun.js';
import { connectDomain, domainsEnabled } from './domains.js';
import { alertOwner } from './notify.js';
import { sendText } from './whatsapp.js';
import { invalidate } from './site.js';
import { classifyIndustry } from './industry.js';
import { billingEnabled, payLink, shortDate } from './billing.js';
import { money } from './plans.js';
import { log } from './log.js';

const DAY = 24 * 60 * 60 * 1000;
const YEAR = 365 * DAY;
const QUOTE_MS = 2 * 60 * 60 * 1000;
const REMIND_DAYS = [30, 7, 1];

const BASE_TLDS = ['com', 'in', 'co', 'net', 'online', 'site'];
const INDUSTRY_TLDS = {
  healthcare: ['clinic', 'health', 'care'],
  dental: ['dental', 'clinic'],
  'real-estate': ['properties', 'realty', 'homes'],
  bakery: ['cafe', 'shop'],
  restaurant: ['restaurant', 'cafe', 'kitchen'],
  beauty: ['salon', 'beauty'],
  fitness: ['fitness', 'gym'],
  education: ['academy', 'school', 'education'],
  fashion: ['boutique', 'fashion', 'store'],
  jewellery: ['jewelry', 'store'],
  automotive: ['auto', 'cars'],
  'home-services': ['services', 'pro'],
  professional: ['pro', 'consulting'],
  travel: ['travel', 'tours'],
  events: ['events'],
  retail: ['store', 'shop'],
  tech: ['tech', 'io'],
  garden: ['garden'],
  general: ['store', 'biz'],
};

export function domainShopEnabled() {
  return porkbunEnabled() && domainsEnabled() && billingEnabled();
}

const word = (text) =>
  String(text || '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

export function domainIdeas(site) {
  const name = word(site.businessName).filter((w) => !['the', 'and', 'pvt', 'ltd', 'private', 'limited'].includes(w));
  const full = name.join('');
  const short = name.slice(0, 2).join('');
  const city = word(site.city).join('');
  const kind = word(site.category).slice(-1).join('');
  const labels = [...new Set([short, full, city && `${short}${city}`, kind && !short.endsWith(kind) && `${short}${kind}`, full.replace(/s$/, '')])]
    .filter((l) => l && l.length >= 3 && l.length <= 30);
  const tlds = [...new Set([...BASE_TLDS.slice(0, 2), ...(INDUSTRY_TLDS[classifyIndustry(site).id] || []), ...BASE_TLDS.slice(2)])];
  const ideas = [];
  for (const tld of tlds) for (const label of labels) ideas.push(`${label}.${tld}`);
  const ranked = [...labels.flatMap((l) => [`${l}.com`, `${l}.in`]), ...ideas];
  return [...new Set(ranked)].slice(0, 25);
}

function priced(domain, info) {
  if (info?.avail !== 'yes' || info.premium === 'yes') return null;
  const first = usdCents(info.price);
  const renew = usdCents(info.additional?.renewal?.price ?? info.regularPrice ?? info.price);
  const max = config.billing.domainMaxUsd * 100;
  if (!first || !renew || first > max || renew > max) return null;
  return { domain, cost: first, renewCost: renew, charge: chargeFor(first), renewCharge: chargeFor(renew) };
}

export function chargeFor(usd) {
  return Math.ceil((usd * config.billing.usdRate + config.billing.domainMargin) / 100) * 100;
}

export async function findDomains(site, limit = 6) {
  const ideas = domainIdeas(site);
  const res = await porkbun('/domain/checkDomain', { domains: ideas });
  return ideas
    .map((domain) => priced(domain, res.domains?.[domain]))
    .filter(Boolean)
    .slice(0, limit);
}

export async function checkOne(domain) {
  const res = await porkbun(`/domain/checkDomain/${encodeURIComponent(domain)}`);
  return res.response || null;
}

export async function quoteDomain(site, domain) {
  const offer = priced(domain, await checkOne(domain));
  if (!offer) return null;
  const order = { id: crypto.randomBytes(8).toString('hex'), type: 'register', ...offer, at: new Date() };
  await sites.updateOne({ _id: site._id }, { $set: { domainOrder: order } });
  return order;
}

export async function quoteRenewal(site) {
  const name = site.domain?.name;
  if (!name) return null;
  const info = await checkOne(name);
  const renew = usdCents(info?.additional?.renewal?.price ?? info?.regularPrice);
  if (!renew) return null;
  const order = { id: crypto.randomBytes(8).toString('hex'), type: 'renew', domain: name, cost: renew, renewCost: renew, charge: chargeFor(renew), at: new Date() };
  await sites.updateOne({ _id: site._id }, { $set: { domainOrder: order } });
  return order;
}

export const domainPayLink = (slug) => payLink(slug, '/domain');

export function offerText(order) {
  return `🌐 *${order.domain}*: ${money(order.charge)} for 1 year (renews at about ${money(chargeFor(order.renewCost))} a year).`;
}

async function tellAdmins(text) {
  for (const admin of config.adminNumbers) {
    await sendText(admin, text).catch((err) => log.warn('admin alert failed', { error: err.message }));
  }
}

async function pointDns(domain) {
  const target = config.render.hostname;
  const { records = [] } = await porkbun(`/dns/retrieve/${domain}`);
  const names = new Set([domain, `www.${domain}`, `*.${domain}`]);
  for (const r of records) {
    if (names.has(r.name) && ['A', 'AAAA', 'ALIAS', 'CNAME'].includes(r.type)) {
      await porkbun(`/dns/delete/${domain}/${r.id}`);
    }
  }
  await porkbun(`/dns/create/${domain}`, { name: '', type: 'A', content: config.render.apexIp, ttl: 600 });
  if (target) await porkbun(`/dns/create/${domain}`, { name: 'www', type: 'CNAME', content: target, ttl: 600 });
}

async function register(site, order, paymentId) {
  const info = await checkOne(order.domain);
  const cost = usdCents(info?.price);
  if (info?.avail !== 'yes' || !cost || cost > order.cost) {
    throw Object.assign(new Error(info?.avail !== 'yes' ? 'domain is no longer available' : `price went up to $${cost / 100}`), { hold: true });
  }
  await porkbun(`/domain/create/${order.domain}`, { cost, agreeToTerms: 'yes', whoisPrivacy: true }, `register-${paymentId}`);
  await porkbun(`/domain/updateAutoRenew/${order.domain}`, { status: 'off' }).catch((err) => log.warn('auto-renew off failed', { error: err.message }));
  await pointDns(order.domain);
  await connectDomain(site, order.domain);
  await sites.updateOne(
    { _id: site._id },
    {
      $set: { domain: { name: order.domain, registeredAt: new Date(), expiresAt: new Date(Date.now() + YEAR), renewCost: order.renewCost, provider: 'porkbun' } },
      $unset: { domainOrder: '' },
    }
  );
  await alertOwner(
    site,
    `✅ *${order.domain}* is registered to your website! I'm connecting it now; it is usually live within 15 to 60 minutes and I'll message you here.`,
    'Your domain is registered'
  );
  await tellAdmins(`💰 Domain bought: ${order.domain} for ${site.businessName} (${siteUrl(site.slug)}), cost $${cost / 100}.`);
}

async function renew(site, order, paymentId) {
  const info = await checkOne(order.domain);
  const cost = usdCents(info?.additional?.renewal?.price ?? info?.regularPrice);
  if (!cost || cost > order.cost) throw Object.assign(new Error(`renewal price went up to $${cost / 100}`), { hold: true });
  const res = await porkbun(`/domain/renew/${order.domain}`, { cost }, `renew-${paymentId}`);
  const base = Math.max(Date.now(), new Date(site.domain.expiresAt).getTime());
  const expiresAt = res.expirationDate ? new Date(`${res.expirationDate}T00:00:00Z`) : new Date(base + YEAR);
  await sites.updateOne(
    { _id: site._id },
    { $set: { 'domain.expiresAt': expiresAt, 'domain.renewCost': cost, 'domain.expired': false }, $unset: { domainOrder: '', 'domain.reminded': '' } }
  );
  if (site.domain.expired && !site.customDomain) await connectDomain(site, order.domain);
  await alertOwner(site, `✅ *${order.domain}* is renewed until *${shortDate(expiresAt)}*. Thank you!`, 'Your domain is renewed');
  await tellAdmins(`💰 Domain renewed: ${order.domain} for ${site.businessName}, cost $${cost / 100}.`);
}

export async function domainPaid(site, pay) {
  const fresh = (await sites.findOne({ _id: site._id })) || site;
  const order = fresh.domainOrder;
  if (!order || order.id !== pay.orderId || Number(pay.amount) < order.charge) {
    log.warn('domain payment does not match the order', { slug: site.slug, orderId: pay.orderId });
    await tellAdmins(`⚠️ ${site.businessName} paid ${money(Number(pay.amount) || 0)} for ${pay.domain || 'a domain'}, but it does not match the current order. Please check and refund or set it up by hand. Site: ${siteUrl(site.slug)}`);
    return;
  }
  try {
    if (order.type === 'renew') await renew(fresh, order, pay.id);
    else await register(fresh, order, pay.id);
  } catch (err) {
    log.error('domain purchase failed', err, { domain: order.domain });
    await sites.updateOne({ _id: site._id }, { $set: { 'domainOrder.status': 'failed', 'domainOrder.error': err.message.slice(0, 200) } });
    await alertOwner(
      site,
      `Your payment for *${order.domain}* is received. ${err.hold ? 'The domain changed before we could buy it, so' : 'Setting it up is taking longer than usual, so'} our team will message you shortly to sort it out or refund you.`,
      'About your domain'
    );
    await tellAdmins(`⚠️ Domain ${order.type} failed for ${order.domain} (${site.businessName}, paid ${money(order.charge)}): ${err.message}`);
  }
}

export async function sweepDomainRenewals(now = new Date()) {
  if (!porkbunEnabled()) return;
  const soon = new Date(now.getTime() + REMIND_DAYS[0] * DAY);
  const due = await sites.find({ 'domain.expiresAt': { $lte: soon }, 'domain.expired': { $ne: true } }).limit(200).toArray();
  for (const site of due) {
    const left = (new Date(site.domain.expiresAt).getTime() - now.getTime()) / DAY;
    if (left <= 0) {
      await sites.updateOne({ _id: site._id }, { $set: { 'domain.expired': true }, $unset: { customDomain: '' } });
      invalidate(site.slug, site.customDomain);
      await alertOwner(
        site,
        `⚠️ *${site.domain.name}* has expired, so your website is back on ${siteUrl(site.slug)}.\n\nRenew it soon, before someone else can buy it: ${domainPayLink(site.slug)}`,
        'Your domain has expired'
      );
      continue;
    }
    const stage = REMIND_DAYS.filter((d) => left <= d).at(-1);
    if (!stage || (site.domain.reminded && site.domain.reminded <= stage)) continue;
    await sites.updateOne({ _id: site._id }, { $set: { 'domain.reminded': stage } });
    await alertOwner(
      site,
      `🌐 Your domain *${site.domain.name}* expires on *${shortDate(site.domain.expiresAt)}*.\n\nRenew it for 1 year (about ${money(chargeFor(site.domain.renewCost))}): ${domainPayLink(site.slug)}`,
      'Your domain expires soon'
    );
  }
}
