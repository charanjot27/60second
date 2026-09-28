import { config } from './config.js';
import { sites } from './db.js';
import { isBrandLike } from './moderation.js';

const RESERVED = new Set([
  'www', 'api', 'app', 'admin', 'administrator', 'root', 'login', 'logout', 'signin', 'signup', 'register',
  'account', 'accounts', 'auth', 'oauth', 'secure', 'security', 'verify', 'verification', 'password',
  'mail', 'email', 'smtp', 'imap', 'pop', 'ftp', 'ns1', 'ns2', 'dns', 'mx', 'cdn', 'img', 'images', 'static',
  'assets', 'media', 'files', 'download', 'downloads', 'help', 'support', 'status', 'blog', 'docs', 'dev',
  'staging', 'test', 'demo', 'webhook', 'webhooks', 'dashboard', 'billing', 'pay', 'payment', 'payments',
  'checkout', 'bank', 'banking', 'wallet', 'kyc', 'abuse', 'report', 'privacy', 'terms', 'legal', 'about',
  'contact', 'official', 'site60', 'bot', 'whatsapp', 'wa',
]);

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/;

export function slugify(input) {
  return String(input || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30)
    .replace(/-+$/g, '');
}

export function isValidSlug(slug) {
  return (
    typeof slug === 'string' &&
    SLUG_RE.test(slug) &&
    !slug.includes('--') &&
    !RESERVED.has(slug) &&
    slug !== config.brand.toLowerCase() &&
    !isBrandLike(slug)
  );
}

export function slugProblem(slug) {
  if (!slug || slug.length < 3) return 'too short (3–30 letters or numbers)';
  if (slug.length > 30) return 'too long (3–30 letters or numbers)';
  if (RESERVED.has(slug) || slug === config.brand.toLowerCase()) return 'reserved';
  if (isBrandLike(slug)) return 'too close to a well-known brand';
  if (!isValidSlug(slug)) return 'not allowed (use letters, numbers and hyphens)';
  return null;
}

export async function isTaken(slug) {
  return Boolean(await sites.findOne({ slug }, { projection: { _id: 1 } }));
}

export function parseSlugInput(text) {
  const raw = String(text || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/^www\./, '');
  const root = `.${config.rootDomain}`;
  if (raw.endsWith(root)) return { slug: slugify(raw.slice(0, -root.length)), domain: null };
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(raw)) {
    return { slug: slugify(raw.split('.')[0]), domain: raw };
  }
  return { slug: slugify(raw), domain: null };
}

async function firstFree(candidates) {
  for (const c of candidates) {
    if (isValidSlug(c) && !(await isTaken(c))) return c;
  }
  return null;
}

export async function suggestSlug(name, city, hint) {
  const bases = [...new Set([slugify(hint), slugify(name)].filter((s) => s.length >= 3))];
  const cityPart = slugify(city);
  const candidates = [];
  for (const base of bases) {
    candidates.push(base, base.replace(/-/g, ''));
    if (cityPart) candidates.push(`${base}-${cityPart}`.slice(0, 30).replace(/-+$/, ''));
  }
  const found = await firstFree([...new Set(candidates)]);
  if (found) return found;

  const base = (bases[0] || 'shop').slice(0, 27).replace(/-+$/, '');
  for (let i = 0; i < 20; i++) {
    const n = String(10 + Math.floor(Math.random() * 90));
    const c = await firstFree([`${base}${n}`]);
    if (c) return c;
  }
  return firstFree([`${base}-${Date.now().toString(36).slice(-5)}`]);
}
