import crypto from 'node:crypto';
import { lookup } from 'node:dns/promises';
import net from 'node:net';
import { config } from './config.js';
import { knowledge, knowledgeSources } from './db.js';
import { DEFAULT_SOURCES } from './knowledge-sources.js';
import { log } from './log.js';

const UA = `Mozilla/5.0 (compatible; site60-design-reader/1.0; +https://${config.rootDomain})`;
const CHUNK = 1100;
const OVERLAP = 160;
const PAGE_CHARS = 250000;
const SOURCE_CHUNKS = 300;
const DIMS = 256;
const SKIP_LINK = /\.(png|jpe?g|gif|webp|svg|ico|mp4|webm|zip|css|js|json|xml|rss)(\?|$)|\/(tag|tags|category|categories|author|authors|page|login|signin|sign-in|signup|sign-up|register|search|cart|account|pricing|feed|wp-json|cdn-cgi)(\/|$)/i;
const BLOCKS = /<(script|style|noscript|svg|nav|header|footer|aside|form|iframe|template|button|select)\b[\s\S]*?<\/\1>/gi;

let index = null;
let running = false;
const robotsCache = new Map();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hashOf = (text) => crypto.createHash('sha256').update(text).digest('hex').slice(0, 32);
const clean = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

export const knowledgeEnabled = () => Boolean(config.gemini.apiKey);

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', copy: '©' };

function decode(text) {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m)
    .replace(/[\u00ad\u200b]/g, '')
    .replace(/&shy;/g, '');
}

export function htmlToText(html, base = '') {
  const raw = String(html || '');
  const title = clean(decode((raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/<[^>]+>/g, '')), 200);
  const links = [];
  if (base) {
    for (const m of raw.matchAll(/<a\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
      const href = m[1] ?? m[2] ?? m[3] ?? '';
      if (!href || href.startsWith('#') || /^(mailto|tel|javascript):/i.test(href)) continue;
      try {
        links.push(new URL(decode(href), base).href.split('#')[0]);
      } catch {}
    }
  }
  let body = raw.replace(/<!--[\s\S]*?-->/g, '').replace(/<head\b[\s\S]*?<\/head>|<title\b[\s\S]*?<\/title>/gi, '');
  const main = body.match(/<(main|article)\b[^>]*>([\s\S]*)<\/\1>/i)?.[2];
  if (main && main.length > 2000) body = main;
  const text = decode(
    body
      .replace(BLOCKS, ' ')
      .replace(/<h([1-4])\b[^>]*>/gi, (_, n) => `\n\n${'#'.repeat(Number(n))} `)
      .replace(/<\/h[1-4]>/gi, '\n')
      .replace(/<li\b[^>]*>/gi, '\n- ')
      .replace(/<(p|div|section|article|br|tr|blockquote|pre|dd|dt|figcaption)\b[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/[ \t\f\v ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { title, text, links: [...new Set(links)] };
}

function useful(chunk) {
  const words = chunk.split(/\s+/).filter((w) => /[a-z]{2,}/i.test(w));
  if (words.length < 45) return false;
  const lines = chunk.split('\n').filter(Boolean);
  const listy = lines.filter((l) => l.length < 40).length / lines.length;
  return listy < 0.7;
}

export function chunkText(text, size = CHUNK, overlap = OVERLAP) {
  const paras = String(text || '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const chunks = [];
  let current = '';
  let heading = '';
  const push = () => {
    const body = current.trim();
    if (body) chunks.push(heading && !body.startsWith('#') ? `${heading}\n${body}` : body);
    current = body.length > overlap ? body.slice(-overlap).replace(/^\S*\s/, '') : '';
  };
  for (const para of paras) {
    if (/^#{1,4} /.test(para)) heading = para.split('\n')[0].slice(0, 120);
    const pieces = para.length > size ? para.match(new RegExp(`[\\s\\S]{1,${size}}(?=\\s|$)`, 'g')) || [para] : [para];
    for (const piece of pieces) {
      if (current.length + piece.length + 2 > size && current.trim()) push();
      current = current ? `${current}\n\n${piece}` : piece;
    }
  }
  if (current.trim().length > overlap) push();
  return chunks.filter(useful);
}

function normalise(values) {
  const v = values.slice(0, DIMS).map(Number);
  const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => Number((x / n).toFixed(5)));
}

export async function embedBatch(texts, taskType = 'RETRIEVAL_DOCUMENT') {
  const model = `models/${config.gemini.embedModel}`;
  const out = [];
  for (let i = 0; i < texts.length; i += 50) {
    const slice = texts.slice(i, i + 50);
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/${model}:batchEmbedContents`, {
        method: 'POST',
        headers: { 'x-goog-api-key': config.gemini.apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ requests: slice.map((text) => ({ model, content: { parts: [{ text: text.slice(0, 6000) }] }, taskType, outputDimensionality: DIMS })) }),
        signal: AbortSignal.timeout(60000),
      });
      if (res.status === 429 && attempt < 5) {
        await sleep(2000 * 2 ** attempt);
        continue;
      }
      if (!res.ok) throw new Error(`embed ${res.status}: ${(await res.text()).slice(0, 160)}`);
      const body = await res.json();
      out.push(...(body.embeddings || []).map((e) => normalise(e.values || [])));
      break;
    }
    if (i + 50 < texts.length) await sleep(700);
  }
  return out;
}

async function publicHost(hostname) {
  if (/^(localhost|.*\.local|.*\.internal)$/i.test(hostname)) return false;
  const addresses = net.isIP(hostname) ? [{ address: hostname }] : await lookup(hostname, { all: true }).catch(() => []);
  return addresses.every(({ address }) => !/^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1|f[cd]|fe80)/i.test(address));
}

export function robotsAllows(robots, path) {
  let applies = false;
  const rules = [];
  for (const line of String(robots || '').split('\n')) {
    const [key, ...rest] = line.split(':');
    const value = rest.join(':').trim();
    const k = key.trim().toLowerCase();
    if (k === 'user-agent') applies = value === '*' || /site60/i.test(value);
    else if (applies && (k === 'disallow' || k === 'allow') && value) rules.push([k, value]);
  }
  const fits = (pattern) => new RegExp(`^${pattern.replace(/[.+?^{}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$')}`).test(path);
  const match = rules.filter(([, v]) => fits(v)).sort((a, b) => b[1].length - a[1].length)[0];
  return !match || match[0] === 'allow';
}

async function allowed(url) {
  const u = new URL(url);
  if (!robotsCache.has(u.origin)) {
    const robots = await fetch(`${u.origin}/robots.txt`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10000) })
      .then((r) => (r.ok ? r.text() : ''))
      .catch(() => '');
    robotsCache.set(u.origin, robots);
  }
  return robotsAllows(robotsCache.get(u.origin), u.pathname);
}

async function pdfText(buffer) {
  const { extractText, getDocumentProxy } = await import('unpdf');
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: false });
  return (Array.isArray(text) ? text : [text]).join('\n\n');
}

const HIG = /^https:\/\/developer\.apple\.com(\/design\/human-interface-guidelines(?:\/[\w-]+)*)\/?$/;

function docText(node, refs) {
  if (!node) return '';
  if (Array.isArray(node)) return node.map((n) => docText(n, refs)).join('');
  switch (node.type) {
    case 'text':
      return node.text || '';
    case 'codeVoice':
      return node.code || '';
    case 'reference':
      return refs[node.identifier]?.title || '';
    case 'heading':
      return `\n\n${'#'.repeat(Math.min(4, node.level || 2))} ${node.text}\n\n`;
    case 'paragraph':
      return `${docText(node.inlineContent, refs)}\n\n`;
    case 'unorderedList':
    case 'orderedList':
      return `${(node.items || []).map((item) => `- ${docText(item.content, refs).trim()}`).join('\n')}\n\n`;
    case 'aside':
      return `${docText(node.content, refs)}\n\n`;
    case 'table':
      return `${(node.rows || []).map((row) => row.map((cell) => docText(cell, refs).trim()).join(' | ')).join('\n')}\n\n`;
    default:
      return docText(node.inlineContent || node.content, refs);
  }
}

async function appleGuidelines(path) {
  const res = await fetch(`https://developer.apple.com/tutorials/data${path}.json`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`page ${res.status}`);
  const doc = await res.json();
  const refs = doc.references || {};
  const text = [docText(doc.abstract, refs), ...(doc.primaryContentSections || []).map((sec) => docText(sec.content, refs))].join('\n\n');
  const links = Object.values(refs)
    .map((r) => r.url)
    .filter((u) => typeof u === 'string' && u.startsWith('/design/human-interface-guidelines/'))
    .map((u) => `https://developer.apple.com${u}`);
  return { kind: 'html', title: `Apple HIG: ${doc.metadata?.title || path.split('/').pop()}`, text: text.replace(/\n{3,}/g, '\n\n').slice(0, PAGE_CHARS), links: [...new Set(links)] };
}

function githubReadme(url) {
  const m = url.match(/^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/?$/);
  return m ? `https://raw.githubusercontent.com/${m[1]}/${m[2]}/HEAD/README.md` : null;
}

export async function fetchDocument(url) {
  const u = new URL(url);
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('Only web addresses can be read');
  if (!(await publicHost(u.hostname))) throw new Error('That address cannot be read');
  const hig = url.match(HIG);
  if (hig) return appleGuidelines(hig[1]);
  const readme = githubReadme(url);
  const target = readme || url;
  if (!readme && !(await allowed(target))) throw new Error('The site does not allow automatic reading of this page');
  const res = await fetch(target, { headers: { 'User-Agent': UA, Accept: 'text/html,application/pdf,text/plain' }, redirect: 'follow', signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`page ${res.status}`);
  const type = String(res.headers.get('content-type') || '');
  const buffer = Buffer.from(await res.arrayBuffer());
  if (type.includes('pdf') || /\.pdf($|\?)/i.test(url)) {
    if (!buffer.subarray(0, 5).toString().startsWith('%PDF')) throw new Error('not a PDF');
    return { kind: 'pdf', title: decodeURIComponent(u.pathname.split('/').pop() || u.hostname), text: (await pdfText(buffer)).slice(0, PAGE_CHARS * 3), links: [] };
  }
  const body = buffer.toString('utf8');
  if (readme || type.startsWith('text/plain') || type.includes('markdown')) {
    return { kind: 'text', title: readme ? url.replace('https://github.com/', '') : u.pathname, text: body.slice(0, PAGE_CHARS), links: [] };
  }
  const { title, text, links } = htmlToText(body, res.url || url);
  return { kind: 'html', title, text: text.slice(0, PAGE_CHARS), links };
}

function nextLinks(links, source, seen) {
  const root = new URL(source);
  const prefix = root.pathname.endsWith('/') ? root.pathname : root.pathname.replace(/[^/]*$/, '');
  return links.filter((href) => {
    try {
      const u = new URL(href);
      return u.host === root.host && u.pathname.startsWith(prefix) && !u.search && !SKIP_LINK.test(u.pathname) && !seen.has(u.href) && u.pathname.split('/').filter(Boolean).length >= 1;
    } catch {
      return false;
    }
  });
}

async function store(source, page, doc) {
  const chunks = chunkText(doc.text).slice(0, SOURCE_CHUNKS);
  if (!chunks.length) return 0;
  const fresh = [];
  for (const text of chunks) {
    const hash = hashOf(`${source}|${text}`);
    if (!(await knowledge.findOne({ hash }))) fresh.push({ text, hash });
  }
  if (!fresh.length) return 0;
  const vectors = await embedBatch(fresh.map((c) => `${doc.title}\n${c.text}`));
  let added = 0;
  for (let i = 0; i < fresh.length; i++) {
    if (!vectors[i]?.length) continue;
    await knowledge.insertOne({ source, url: page, title: clean(doc.title, 200), kind: doc.kind, text: fresh[i].text, hash: fresh[i].hash, embedding: vectors[i], at: new Date() }).catch((err) => {
      if (err?.code !== 11000) throw err;
    });
    added++;
  }
  index = null;
  return added;
}

export async function ingestSource(url, { maxPages = config.knowledge.pagesPerSource } = {}) {
  if (!(await knowledgeSources.findOne({ url }))) await knowledgeSources.insertOne({ url, topic: '', status: 'reading', at: new Date() });
  const queue = [url];
  const seen = new Set();
  let pages = 0;
  let chunks = 0;
  let lastError = '';
  while (queue.length && pages < maxPages && chunks < SOURCE_CHUNKS) {
    const page = queue.shift();
    if (seen.has(page)) continue;
    seen.add(page);
    try {
      const doc = await fetchDocument(page);
      pages++;
      chunks += await store(url, page, doc);
      if (pages < maxPages) queue.push(...nextLinks(doc.links, url, seen).slice(0, 40));
    } catch (err) {
      lastError = err.message.slice(0, 200);
      if (page === url) break;
    }
    await sleep(900);
  }
  const total = await countFor(url);
  await knowledgeSources.updateOne(
    { url },
    { $set: { status: total ? 'ready' : 'failed', pages, chunks: total, added: chunks, error: total ? '' : lastError || 'no readable text', at: new Date() } }
  );
  log.info('knowledge source read', { url, pages, added: chunks, total, error: total ? undefined : lastError });
  return { pages, added: chunks, total, error: total ? '' : lastError || 'no readable text' };
}

async function countFor(source) {
  return knowledge.countDocuments({ source });
}

export async function addSource(url, topic = '', pages) {
  const existing = await knowledgeSources.findOne({ url });
  if (existing) await knowledgeSources.updateOne({ url }, { $set: { status: 'pending', ...(topic ? { topic } : {}) } });
  else await knowledgeSources.insertOne({ url, topic, ...(pages ? { pages } : {}), status: 'pending', at: new Date() });
}

export async function ingestText({ title, text, source, kind = 'text' }) {
  const id = source || `note:${hashOf(text)}`;
  const existing = await knowledgeSources.findOne({ url: id });
  if (!existing) await knowledgeSources.insertOne({ url: id, topic: clean(title, 80), status: 'pending', at: new Date() });
  const added = await store(id, id, { kind, title: title || 'Owner note', text });
  const total = await countFor(id);
  await knowledgeSources.updateOne({ url: id }, { $set: { status: total ? 'ready' : 'failed', chunks: total, pages: 1, error: total ? '' : 'no readable text', at: new Date() } });
  return { added, total, source: id };
}

export async function ingestPdf(buffer, name) {
  if (!Buffer.from(buffer).subarray(0, 5).toString().startsWith('%PDF')) throw new Error('This file is not a PDF');
  const text = await pdfText(buffer);
  return ingestText({ title: name || 'PDF', text, source: `pdf:${clean(name, 80) || hashOf(text)}`, kind: 'pdf' });
}

export async function forgetSource(url) {
  const chunks = await knowledge.find({ source: url }).toArray();
  for (const c of chunks) await knowledge.deleteOne({ _id: c._id });
  await knowledgeSources.deleteOne({ url });
  index = null;
  return chunks.length;
}

export async function processPending() {
  if (running || !knowledgeEnabled()) return 0;
  running = true;
  let done = 0;
  const awake = config.isProd
    ? setInterval(() => fetch(`https://${config.rootDomain}/healthz`, { signal: AbortSignal.timeout(10000) }).catch(() => {}), 4 * 60 * 1000)
    : null;
  try {
    for (const def of DEFAULT_SOURCES) {
      if (!(await knowledgeSources.findOne({ url: def.url }))) {
        await knowledgeSources.insertOne({ url: def.url, topic: def.topic, ...(def.pages ? { pages: def.pages } : {}), status: 'pending', at: new Date() });
      }
    }
    const pending = (await knowledgeSources.find({}).toArray()).filter((s) => (s.status === 'pending' || s.status === 'reading') && /^https?:/.test(s.url));
    for (const s of pending) {
      await knowledgeSources.updateOne({ url: s.url }, { $set: { status: 'reading' } });
      await ingestSource(s.url, { maxPages: s.pages || config.knowledge.pagesPerSource }).catch(async (err) => {
        await knowledgeSources.updateOne({ url: s.url }, { $set: { status: 'failed', error: err.message.slice(0, 200), at: new Date() } });
      });
      done++;
    }
  } finally {
    running = false;
    if (awake) clearInterval(awake);
  }
  return done;
}

export async function relearnAll() {
  const all = await knowledgeSources.find({}).toArray();
  for (const s of all) if (/^https?:/.test(s.url)) await knowledgeSources.updateOne({ url: s.url }, { $set: { status: 'pending' } });
  processPending().catch((err) => log.warn('knowledge refresh failed', { error: err.message }));
  return all.length;
}

export async function knowledgeStatus() {
  const sources = await knowledgeSources.find({}).toArray();
  const by = (status) => sources.filter((s) => s.status === status);
  return {
    sources: sources.length,
    ready: by('ready').length,
    pending: by('pending').length + by('reading').length,
    failed: by('failed').map((s) => ({ url: s.url, error: s.error })),
    chunks: sources.reduce((n, s) => n + (s.chunks || 0), 0),
    running,
  };
}

async function loadIndex() {
  if (index) return index;
  const rows = await knowledge.find({}).toArray();
  index = rows.filter((r) => r.embedding?.length).map((r) => ({ source: r.source, url: r.url, title: r.title, text: r.text, v: r.embedding }));
  return index;
}

const dot = (a, b) => {
  let s = 0;
  for (let i = 0; i < a.length && i < b.length; i++) s += a[i] * b[i];
  return s;
};

export async function retrieve(queries, { k = 8, perSource = 2, minScore = 0.45 } = {}) {
  if (!knowledgeEnabled()) return [];
  const rows = await loadIndex();
  if (!rows.length) return [];
  const vectors = await embedBatch(queries, 'RETRIEVAL_QUERY');
  const ranked = vectors.map((q) => rows.map((r) => ({ r, score: dot(q, r.v) })).filter((x) => x.score >= minScore).sort((a, b) => b.score - a.score));
  const picked = [];
  const perCount = new Map();
  const taken = new Set();
  for (let depth = 0; picked.length < k && depth < 50; depth++) {
    let any = false;
    for (const list of ranked) {
      const hit = list[depth];
      if (!hit) continue;
      any = true;
      if (taken.has(hit.r) || (perCount.get(hit.r.source) || 0) >= perSource) continue;
      taken.add(hit.r);
      perCount.set(hit.r.source, (perCount.get(hit.r.source) || 0) + 1);
      picked.push({ ...hit.r, score: Number(hit.score.toFixed(3)) });
      if (picked.length >= k) break;
    }
    if (!any) break;
  }
  return picked;
}

export function knowledgeNote(chunks) {
  if (!chunks?.length) return '';
  return [
    'DESIGN KNOWLEDGE (excerpts retrieved from respected design, UX, accessibility and front-end references for this exact task; apply the principles, never copy their wording, and follow the rules of this prompt where they differ):',
    ...chunks.map((c, i) => `[${i + 1}] ${c.title || c.source} (${c.url})\n${c.text}`),
  ].join('\n\n');
}

export async function designKnowledge(site, industryName = '') {
  if (!knowledgeEnabled()) return null;
  const what = [site.category || industryName, site.city && `in ${site.city}`].filter(Boolean).join(' ') || 'local business';
  const services = (site.services || []).slice(0, 5).join(', ');
  const plan = [
    `Brand and visual design for a ${what} website: colour palette, contrast, typography pairing and hierarchy`,
    `Landing page layout, hero section, visual hierarchy and trust for a ${what} offering ${services}`,
    `Choosing photography and imagery that builds trust for a ${what}`,
  ];
  const build = [
    'Responsive layout with CSS grid and flexbox, spacing scale, fluid type with clamp, mobile first',
    'Accessible buttons, links, focus states, touch targets, colour contrast and headings (WCAG 2.2)',
    `Micro-interactions, motion and transitions that feel good without hurting performance, reduced motion`,
    `Call to action, contact section, forms and footer design for a ${what} website`,
    'Fast loading web pages: Core Web Vitals, images, fonts and CSS performance',
  ];
  try {
    const [art, page] = await Promise.all([retrieve(plan, { k: 6 }), retrieve(build, { k: 9 })]);
    if (art.length || page.length) log.info('design knowledge retrieved', { art: art.length, page: page.length, sources: [...new Set([...art, ...page].map((c) => c.source))].length });
    return { art, page };
  } catch (err) {
    log.warn('design knowledge lookup failed', { error: err.message.slice(0, 160) });
    return null;
  }
}
