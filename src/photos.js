import sharp from 'sharp';
import { config } from './config.js';
import { log } from './log.js';
import { processAndUpload } from './storage.js';
import { aiImageBuffer, cropTo, shapeOf, SLOT_SHAPES } from './images.js';
import { callClaude, claudeEnabled } from './claude.js';

const SLOT_NAMES = ['wide hero picture', 'tall portrait picture', 'wide atmospheric band', 'square close-up detail'];
const ORIENT = {
  pexels: { wide: 'landscape', tall: 'portrait', square: 'square' },
  pixabay: { wide: 'horizontal', tall: 'vertical', square: 'all' },
  unsplash: { wide: 'landscape', tall: 'portrait', square: 'squarish' },
};
const PER_PROVIDER = 2;
const UTM = () => `utm_source=${encodeURIComponent(config.images.appName)}&utm_medium=referral`;

export function stockEnabled() {
  return Boolean(config.images.pexelsKey || config.images.pixabayKey || config.images.unsplashKey);
}

async function getJson(url, headers = {}) {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`${new URL(url).hostname} ${res.status}`);
  return res.json();
}

async function getBuffer(url, headers = {}, timeoutMs = 30000) {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`download ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function searchPexels(query, kind) {
  const data = await getJson(
    `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${PER_PROVIDER}&orientation=${ORIENT.pexels[kind]}`,
    { Authorization: config.images.pexelsKey }
  );
  return (data.photos || []).map((p) => ({
    source: 'Pexels',
    thumb: p.src?.medium,
    full: p.src?.large2x || p.src?.large,
    alt: p.alt || query,
    credit: { name: p.photographer, url: p.photographer_url, source: 'Pexels', sourceUrl: 'https://www.pexels.com' },
  }));
}

async function searchPixabay(query, kind) {
  const data = await getJson(
    `https://pixabay.com/api/?key=${encodeURIComponent(config.images.pixabayKey)}&q=${encodeURIComponent(query.slice(0, 100))}&image_type=photo&orientation=${ORIENT.pixabay[kind]}&safesearch=true&per_page=3`
  );
  return (data.hits || []).slice(0, PER_PROVIDER).map((h) => ({
    source: 'Pixabay',
    thumb: h.webformatURL,
    full: h.largeImageURL,
    alt: h.tags || query,
    credit: { name: h.user, url: h.pageURL, source: 'Pixabay', sourceUrl: 'https://pixabay.com' },
  }));
}

async function searchUnsplash(query, kind) {
  const data = await getJson(
    `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=${PER_PROVIDER}&orientation=${ORIENT.unsplash[kind]}&content_filter=high`,
    { Authorization: `Client-ID ${config.images.unsplashKey}`, 'Accept-Version': 'v1' }
  );
  return (data.results || []).map((r) => ({
    source: 'Unsplash',
    thumb: r.urls?.small,
    raw: r.urls?.raw,
    download: r.links?.download_location,
    alt: r.alt_description || query,
    credit: {
      name: r.user?.name,
      url: `${r.user?.links?.html}?${UTM()}`,
      source: 'Unsplash',
      sourceUrl: `https://unsplash.com/?${UTM()}`,
    },
  }));
}

async function searchStock(query, kind) {
  const searches = [];
  if (config.images.pexelsKey) searches.push(searchPexels(query, kind));
  if (config.images.unsplashKey) searches.push(searchUnsplash(query, kind));
  if (config.images.pixabayKey) searches.push(searchPixabay(query, kind));
  const results = await Promise.allSettled(searches);
  return results.flatMap((r) => {
    if (r.status === 'fulfilled') return r.value.filter((c) => c.thumb && (c.full || c.raw));
    log.warn('stock search failed', { error: r.reason?.message });
    return [];
  });
}

async function thumbnail(buffer) {
  return (await sharp(buffer).resize({ width: 360, withoutEnlargement: true }).jpeg({ quality: 70 }).toBuffer()).toString('base64');
}

async function slotCandidates(slot, prompt, query) {
  const kind = SLOT_SHAPES[slot];
  const [stock, ai] = await Promise.all([
    query && stockEnabled() ? searchStock(query, kind) : Promise.resolve([]),
    aiImageBuffer(prompt, slot).catch((err) => {
      log.warn('ai candidate failed', { error: err.message });
      return null;
    }),
  ]);
  const list = stock.map((c) => ({ ...c }));
  if (ai) list.push({ source: 'AI', buffer: ai, alt: prompt });
  await Promise.all(
    list.map(async (c) => {
      try {
        c.preview = await thumbnail(c.buffer || (await getBuffer(c.thumb, {}, 15000)));
      } catch {
        c.preview = null;
      }
    })
  );
  return list.filter((c) => c.preview);
}

const PICK_PROMPT = `You are the photo editor of an award-winning design studio, choosing pictures for one small business's website.
For every slot, look at the candidates and choose the single best one for that slot, the brief and the art direction.
Reject any candidate with visible text, watermarks or logos, distorted faces or hands, the wrong subject, a setting that does not fit the business and its region, poor quality, or colours that clash with the palette.
Prefer real photographs when they truly fit; choose the AI image when it fits the brief better. Never pick the same picture for two slots.
Reply with JSON only: {"picks":[{"slot":1,"choice":"1A","why":"short reason"}]}. Use "choice": null when no candidate is good enough.`;

async function pickBest(slots, context) {
  const content = [{ type: 'text', text: `Business and art direction:\n${JSON.stringify(context, null, 2)}` }];
  slots.forEach((cands, i) => {
    content.push({ type: 'text', text: `\nSLOT ${i + 1}: ${SLOT_NAMES[i]}. Brief: ${context.briefs[i] || ''}` });
    cands.forEach((c, j) => {
      content.push({ type: 'text', text: `Candidate ${i + 1}${String.fromCharCode(65 + j)} (${c.source === 'AI' ? 'AI image' : `${c.source} photo`}):` });
      content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: c.preview } });
    });
  });
  const raw = await callClaude({ model: config.ai.designModel, system: PICK_PROMPT, user: content, maxTokens: 4000, effort: 'low', timeoutMs: 120000 });
  const json = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
  const picks = new Map();
  for (const p of json.picks || []) {
    const slot = Number(p.slot) - 1;
    const m = /^(\d)([A-Z])$/.exec(String(p.choice || ''));
    if (m && Number(m[1]) - 1 === slot) picks.set(slot, m[2].charCodeAt(0) - 65);
    else if (p.choice === null) picks.set(slot, -1);
  }
  return picks;
}

function defaultPick(cands) {
  const stock = cands.findIndex((c) => c.source !== 'AI');
  return stock >= 0 ? stock : cands.findIndex((c) => c.source === 'AI');
}

async function finalize(c, slot, ownerPhone, prompt) {
  const shape = shapeOf(slot);
  if (c.source === 'AI') return { ...(await processAndUpload(c.buffer, ownerPhone)), ai: true, prompt };
  if (c.source === 'Unsplash') {
    getBuffer(c.download, { Authorization: `Client-ID ${config.images.unsplashKey}` }, 10000).catch(() => {});
    const url = (w, h) => `${c.raw}${c.raw.includes('?') ? '&' : '?'}w=${w}&h=${h}&fit=crop&crop=entropy&q=80&auto=format`;
    const lgH = Math.round((1200 * shape.h) / shape.w);
    return { lg: url(1200, lgH), sm: url(480, Math.round((480 * shape.h) / shape.w)), w: 1200, h: lgH, stock: true, credit: c.credit, prompt, alt: c.alt };
  }
  const buffer = await cropTo(await getBuffer(c.full), shape);
  return { ...(await processAndUpload(buffer, ownerPhone)), stock: true, credit: c.credit, prompt, alt: c.alt };
}

export async function sourceSiteImages({ prompts, queries = [], context = {}, ownerPhone }) {
  const briefs = prompts.slice(0, 4);
  const slots = await Promise.all(briefs.map((prompt, i) => slotCandidates(i, prompt, queries[i])));
  let picks = new Map();
  const hasChoice = slots.some((c) => c.length > 1);
  if (hasChoice && claudeEnabled()) {
    try {
      picks = await pickBest(slots, { ...context, briefs });
    } catch (err) {
      log.warn('photo pick failed', { error: err.message });
    }
  }
  const results = await Promise.allSettled(
    slots.map(async (cands, i) => {
      if (!cands.length) return null;
      let index = picks.has(i) ? picks.get(i) : defaultPick(cands);
      if (index === -1) {
        index = cands.findIndex((c) => c.source === 'AI');
        if (index === -1) return null;
      }
      const chosen = cands[index] || cands[defaultPick(cands)];
      if (!chosen) return null;
      log.info('picture chosen', { slot: i + 1, source: chosen.source });
      return finalize(chosen, i, ownerPhone, briefs[i]);
    })
  );
  return results.flatMap((r) => {
    if (r.status === 'fulfilled' && r.value) return [r.value];
    if (r.status === 'rejected') log.warn('picture failed', { error: r.reason?.message });
    return [];
  });
}
