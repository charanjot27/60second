import { config } from './config.js';
import { sites } from './db.js';
import { invalidate } from './site.js';
import { alertOwner } from './notify.js';
import { log } from './log.js';

const API = 'https://api.render.com/v1';
const GIVE_UP_MS = 72 * 60 * 60 * 1000;

export function domainsEnabled() {
  return Boolean(config.render.apiKey && config.render.serviceId);
}

export function normalizeDomain(input) {
  const host = String(input || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/^www\./, '')
    .replace(/\.$/, '');
  if (!/^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/.test(host)) return null;
  if (host === config.rootDomain || host.endsWith(`.${config.rootDomain}`)) return null;
  return host;
}

async function render(method, path, body) {
  const res = await fetch(`${API}/services/${config.render.serviceId}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${config.render.apiKey}`,
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const err = new Error(`Render ${res.status}: ${data?.message || text.slice(0, 160)}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export function dnsInstructions(domain) {
  const target = config.render.hostname || 'your-service.onrender.com';
  return (
    `🌐 To connect *${domain}*, open the DNS settings where you bought it (GoDaddy, Hostinger, Namecheap and so on) and add these two records:\n\n` +
    `1️⃣ Type *A* · Name *@* · Value *${config.render.apexIp}*\n` +
    `2️⃣ Type *CNAME* · Name *www* · Value *${target}*\n\n` +
    `Delete any other *A* record for *@* first.\n` +
    `• GoDaddy: My Products → your domain → DNS → Add New Record\n` +
    `• Porkbun: Domain Management → your domain → DNS\n` +
    `• Namecheap: Domain List → Manage → Advanced DNS → Add New Record\n\n` +
    `I will check every few minutes and message you here as soon as ${domain} is live (usually 15 to 60 minutes).`
  );
}

export async function connectDomain(site, domain) {
  try {
    await render('POST', '/custom-domains', { name: domain });
  } catch (err) {
    if (err.status !== 409) throw err;
  }
  await sites.updateOne({ _id: site._id }, { $set: { pendingDomain: { name: domain, addedAt: new Date() } } });
  return dnsInstructions(domain);
}

async function isVerified(domain) {
  await render('POST', `/custom-domains/${encodeURIComponent(domain)}/verify`).catch(() => {});
  const info = await render('GET', `/custom-domains/${encodeURIComponent(domain)}`);
  return String(info?.verificationStatus || '').toLowerCase() === 'verified';
}

export async function sweepDomains(now = Date.now()) {
  if (!domainsEnabled()) return;
  const pending = await sites.find({ 'pendingDomain.name': { $exists: true } }).limit(50).toArray();
  for (const site of pending) {
    const { name, addedAt } = site.pendingDomain;
    try {
      if (await isVerified(name)) {
        await sites.updateOne({ _id: site._id }, { $set: { customDomain: name }, $unset: { pendingDomain: '' } });
        invalidate(site.slug, name);
        await alertOwner(site, `🎉 Your domain is connected! Your website is now live at https://${name}`, 'Your domain is connected');
      } else if (now - new Date(addedAt).getTime() > GIVE_UP_MS) {
        await sites.updateOne({ _id: site._id }, { $unset: { pendingDomain: '' } });
        await alertOwner(
          site,
          `⚠️ I could not verify ${name} after 3 days. Please check the DNS records and send *connect domain ${name}* again.`,
          'Domain not connected yet'
        );
      }
    } catch (err) {
      log.warn('domain check failed', { domain: name, error: err.message.slice(0, 160) });
    }
  }
}
