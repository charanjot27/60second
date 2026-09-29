import crypto from 'node:crypto';
import { config } from './config.js';
import { sites } from './db.js';
import { log } from './log.js';
import {
  SITE_SCRIPT,
  renderSite,
  renderLanding,
  renderNotFound,
  renderSuspended,
  renderPrivacy,
  renderTerms,
} from './render.js';
import { renderAdvanced } from './advanced.js';

const TTL = 60_000;
const MAX_ENTRIES = 5000;
const cache = new Map();

const scriptHash = crypto.createHash('sha256').update(SITE_SCRIPT).digest('base64');
const imageOrigin = config.imageBase ? new URL(config.imageBase).origin : '';

const CSP = [
  "default-src 'none'",
  `img-src 'self' data: ${imageOrigin}`.trim(),
  "style-src 'unsafe-inline' https://fonts.googleapis.com",
  'font-src https://fonts.gstatic.com',
  `script-src 'sha256-${scriptHash}'`,
  "base-uri 'none'",
  "form-action 'none'",
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

async function findSite(key, query) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.value;
  const site = await sites.findOne(query);
  const value = site
    ? { status: site.status || 'active', html: site.status === 'suspended' ? null : site.style === 'advanced' && site.design ? renderAdvanced(site) : renderSite(site) }
    : null;
  remember(key, value);
  return value;
}

function send(res, status, html, cacheSeconds = 60) {
  res
    .status(status)
    .set({
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': status === 200 ? `public, max-age=${cacheSeconds}` : 'public, max-age=30',
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
  const devSlug = !config.isProd && typeof req.query.site === 'string' ? req.query.site.toLowerCase() : null;

  try {
    if (!devSlug && isRootHost(host)) {
      if (req.path === '/') return send(res, 200, renderLanding(), 300);
      if (req.path === '/privacy') return send(res, 200, renderPrivacy(), 3600);
      if (req.path === '/terms') return send(res, 200, renderTerms(), 3600);
      return send(res, 404, renderNotFound());
    }

    let key;
    let query;
    let slug = null;
    if (devSlug) {
      slug = devSlug;
    } else if (host.endsWith(`.${config.rootDomain}`)) {
      slug = host.slice(0, -(config.rootDomain.length + 1));
      if (slug.includes('.')) return send(res, 404, renderNotFound());
    }

    if (slug) {
      key = `s:${slug}`;
      query = { slug };
    } else {
      key = `d:${host}`;
      query = { customDomain: host };
    }

    if (req.path !== '/') return send(res, 404, renderNotFound(slug));

    const found = await findSite(key, query);
    if (!found || found.status === 'deleted') return send(res, 404, renderNotFound(slug));
    if (found.status === 'suspended') return send(res, 410, renderSuspended());
    return send(res, 200, found.html);
  } catch (err) {
    log.error('site render failed', err, { host });
    return res.status(500).type('text/plain').send('Something went wrong. Please try again.');
  }
}
