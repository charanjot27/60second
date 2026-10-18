import crypto from 'node:crypto';
import { config } from './config.js';
import { sites } from './db.js';
import { log } from './log.js';
import { ENHANCE_SCRIPT } from './enhance.js';
import {
  SITE_SCRIPT,
  renderSite,
  renderLanding,
  renderNotFound,
  renderSuspended,
  renderPaused,
  renderThanks,
  renderPrivacy,
  renderTerms,
} from './render.js';
import { renderAdvanced } from './advanced.js';
import { accessState } from './billing.js';

const TTL = 60_000;
const MAX_ENTRIES = 5000;
const cache = new Map();

const hashOf = (code) => `'sha256-${crypto.createHash('sha256').update(code).digest('base64')}'`;
const scriptSources = `${hashOf(SITE_SCRIPT)} ${hashOf(ENHANCE_SCRIPT)}`;
const imageOrigin = config.imageBase ? new URL(config.imageBase).origin : '';

const CSP = [
  "default-src 'none'",
  `img-src 'self' data: ${imageOrigin} https://images.unsplash.com`.replace(/\s+/g, ' '),
  `media-src ${imageOrigin || "'self'"}`,
  "style-src 'unsafe-inline' https://fonts.googleapis.com",
  'font-src https://fonts.gstatic.com',
  `script-src ${scriptSources}`,
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

export function invalidate(slug, customDomain) {
  cache.delete(`s:${slug}`);
  if (customDomain) cache.delete(`d:${customDomain}`);
}

function remember(key, value) {
  if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value);
  cache.set(key, { value, at: Date.now() });
}

function render(site) {
  return site.style === 'advanced' && site.design ? renderAdvanced(site) : renderSite(site);
}

export function hostQuery(host) {
  if (host.endsWith(`.${config.rootDomain}`)) {
    const slug = host.slice(0, -(config.rootDomain.length + 1));
    if (!slug || slug.includes('.')) return null;
    return { key: `s:${slug}`, query: { slug }, slug };
  }
  const bare = host.replace(/^www\./, '');
  return { key: `d:${bare}`, query: { customDomain: bare }, slug: null };
}

async function findSite(key, query) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.value;
  const site = await sites.findOne(query);
  const value = site
    ? {
        site: {
          _id: site._id,
          slug: site.slug,
          status: site.status || 'active',
          trialEndsAt: site.trialEndsAt,
          businessName: site.businessName,
          language: site.language,
          ownerPhone: site.ownerPhone,
          notifyEmail: site.notifyEmail,
          customDomain: site.customDomain,
        },
        html: site.status === 'suspended' ? null : render(site),
      }
    : null;
  remember(key, value);
  return value;
}

export async function siteForRequest(req) {
  const host = String(req.hostname || '').toLowerCase();
  const devSlug = !config.isProd && typeof req.query?.site === 'string' ? req.query.site.toLowerCase() : null;
  if (!devSlug && isRootHost(host)) return null;
  const target = devSlug ? { key: `s:${devSlug}`, query: { slug: devSlug }, slug: devSlug } : hostQuery(host);
  if (!target) return null;
  const found = await findSite(target.key, target.query);
  return found ? { ...found, slug: target.slug } : { site: null, html: null, slug: target.slug };
}

function send(res, status, html, cacheSeconds = 60) {
  res
    .status(status)
    .set({
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': status === 200 ? `public, max-age=${cacheSeconds}` : 'no-store',
      'Content-Security-Policy': CSP,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    })
    .send(html);
}

export function isRootHost(host) {
  return host === config.rootDomain || host === `www.${config.rootDomain}`;
}

export async function serveSite(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return res.sendStatus(405);
  if (req.path === '/robots.txt') {
    return res.type('text/plain').set('Cache-Control', 'public, max-age=3600').send('User-agent: *\nAllow: /\n');
  }
  if (req.path === '/favicon.ico') return res.status(204).end();

  const host = String(req.hostname || '').toLowerCase();
  const devSlug = !config.isProd && typeof req.query.site === 'string';

  try {
    if (!devSlug && isRootHost(host)) {
      if (req.path === '/') return send(res, 200, renderLanding(), 300);
      if (req.path === '/privacy') return send(res, 200, renderPrivacy(), 3600);
      if (req.path === '/terms') return send(res, 200, renderTerms(), 3600);
      return send(res, 404, renderNotFound());
    }

    const found = await siteForRequest(req);
    if (!found) return send(res, 404, renderNotFound());
    if (!found.site) return send(res, 404, renderNotFound(found.slug));
    if (req.path === '/thanks') return send(res, 200, renderThanks(found.site), 0);
    if (req.path !== '/') return send(res, 404, renderNotFound(found.slug));

    const state = accessState(found.site);
    if (state === 'suspended') return send(res, 410, renderSuspended());
    if (state === 'expired' || state === 'cancelled') return send(res, 402, renderPaused(found.site));
    return send(res, 200, found.html, state === 'trial' ? 30 : 60);
  } catch (err) {
    log.error('site render failed', err, { host });
    return res.status(500).type('text/plain').send('Something went wrong. Please try again.');
  }
}
