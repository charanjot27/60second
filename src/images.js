import sharp from 'sharp';
import { config } from './config.js';
import { log } from './log.js';
import { processAndUpload } from './storage.js';

const STYLE =
  'Photorealistic editorial photograph, as if shot by a professional photographer on a full-frame camera: true-to-life colour and textures, natural imperfections, believable scale and perspective, ' +
  'accurate hands and anatomy, no plastic sheen, no over-saturation, no HDR glow, no watermark, no distorted faces';
const NO_TEXT = ', no text, no letters, no logos';

export const SHAPES = {
  wide: { ratio: '3:2', w: 1536, h: 1024, openai: '1536x1024' },
  tall: { ratio: '4:5', w: 1024, h: 1280, openai: '1024x1536' },
  square: { ratio: '1:1', w: 1024, h: 1024, openai: '1024x1024' },
};
export const SLOT_SHAPES = ['wide', 'tall', 'wide', 'square'];
export const shapeOf = (slot) => SHAPES[SLOT_SHAPES[slot] || 'square'];

const HOUR = 60 * 60 * 1000;
const pausedUntil = new Map();
let freeQueue = Promise.resolve();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class ProviderError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

const full = (prompt, max = 3800) => `${prompt}. ${STYLE}${/Exact text in the scene:/.test(prompt) ? '' : NO_TEXT}`.slice(0, max);

let openaiChecked = null;

async function openaiReady() {
  openaiChecked ??= fetch(`https://api.openai.com/v1/models/${encodeURIComponent(config.images.openaiModel)}`, {
    headers: { Authorization: `Bearer ${config.images.openaiKey}` },
    signal: AbortSignal.timeout(15000),
  })
    .then((res) => {
      if (res.status === 401 || res.status === 403 || res.status === 404) {
        log.warn('openai image model not available to this key', { model: config.images.openaiModel, status: res.status });
        return false;
      }
      return true;
    })
    .catch(() => {
      openaiChecked = null;
      return true;
    });
  return openaiChecked;
}

function openaiRequest(prompt, shape, quality) {
  return fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.images.openaiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: config.images.openaiModel, prompt: full(prompt), size: shape.openai, quality, n: 1 }),
    signal: AbortSignal.timeout(240000),
  });
}

const REFERENCE_NOTE =
  " Reference photos of the owner's real business are attached: match its architecture, materials, colours, decor, light and atmosphere so this picture feels like the same place, seen from a new angle or at a new moment. Never copy a reference exactly, and never invent signage or text.";

function openaiEdit(prompt, shape, quality, refs) {
  const form = new FormData();
  form.append('model', config.images.openaiModel);
  form.append('prompt', full(`${prompt}${REFERENCE_NOTE}`));
  form.append('size', shape.openai);
  form.append('quality', quality);
  form.append('n', '1');
  refs.forEach((buf, i) => form.append('image[]', new Blob([buf], { type: 'image/jpeg' }), `reference-${i + 1}.jpg`));
  return fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.images.openaiKey}` },
    body: form,
    signal: AbortSignal.timeout(240000),
  });
}

async function viaOpenAI(prompt, shape, refs = []) {
  if (!(await openaiReady())) throw new ProviderError(`OpenAI image model ${config.images.openaiModel} is not available to this key`, 403);
  if (refs.length) {
    const res = await openaiEdit(prompt, shape, config.images.openaiQuality, refs);
    if (res.ok) {
      const b64 = (await res.json())?.data?.[0]?.b64_json;
      if (b64) {
        log.info('ai image made from owner references', { references: refs.length });
        return Buffer.from(b64, 'base64');
      }
    } else {
      log.warn('openai reference image failed, drawing without references', { status: res.status, error: (await res.text()).slice(0, 160) });
    }
  }
  let res = await openaiRequest(prompt, shape, config.images.openaiQuality);
  if (res.status === 400 && config.images.openaiQuality !== 'high') {
    log.warn('openai image quality not accepted, using high', { quality: config.images.openaiQuality, error: (await res.text()).slice(0, 160) });
    res = await openaiRequest(prompt, shape, 'high');
  }
  if (!res.ok) throw new ProviderError(`OpenAI image ${res.status}: ${(await res.text()).slice(0, 160)}`, res.status);
  const b64 = (await res.json())?.data?.[0]?.b64_json;
  if (!b64) throw new Error('OpenAI returned no image');
  return Buffer.from(b64, 'base64');
}

async function viaGemini(prompt, shape) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${config.images.geminiModel}:generateContent`,
    {
      method: 'POST',
      headers: { 'x-goog-api-key': config.gemini.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: full(prompt) }] }],
        generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: shape.ratio } },
      }),
      signal: AbortSignal.timeout(120000),
    }
  );
  if (!res.ok) throw new ProviderError(`Gemini image ${res.status}: ${(await res.text()).slice(0, 160)}`, res.status);
  const parts = (await res.json())?.candidates?.[0]?.content?.parts || [];
  const data = parts.find((p) => p.inlineData?.data)?.inlineData.data;
  if (!data) throw new Error('Gemini returned no image');
  return Buffer.from(data, 'base64');
}

async function viaCloudflareModel(model, prompt, shape) {
  const fast = /flux-1-schnell/.test(model);
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${config.cf.accountId}/ai/run/${model}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.cf.apiToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(fast ? { prompt: full(prompt, 2000), steps: 8 } : { prompt: full(prompt, 2000), width: shape.w, height: shape.h }),
    signal: AbortSignal.timeout(90000),
  });
  if (!res.ok) throw new ProviderError(`Cloudflare ${model} ${res.status}: ${(await res.text()).slice(0, 160)}`, res.status);
  if (String(res.headers.get('content-type')).startsWith('image/')) return Buffer.from(await res.arrayBuffer());
  const b64 = (await res.json())?.result?.image;
  if (!b64) throw new Error('Cloudflare returned no image');
  return Buffer.from(b64, 'base64');
}

async function viaCloudflare(prompt, shape) {
  let lastError = null;
  for (const model of config.images.cfModels) {
    if ((pausedUntil.get(`cf:${model}`) || 0) > Date.now()) continue;
    try {
      const buffer = await viaCloudflareModel(model, prompt, shape);
      log.info('cloudflare image model', { model });
      return buffer;
    } catch (err) {
      lastError = err;
      if ([400, 403, 404, 429].includes(err.status)) pausedUntil.set(`cf:${model}`, Date.now() + 6 * HOUR);
      log.warn('cloudflare image model failed', { model, error: err.message.slice(0, 200) });
    }
  }
  throw lastError || new ProviderError('All Cloudflare image models are paused', 429);
}

async function freeOnce(prompt, shape) {
  const seed = Math.floor(Math.random() * 1e9);
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(full(prompt).slice(0, 900))}?width=${shape.w}&height=${shape.h}&nologo=true&model=flux&seed=${seed}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(90000) });
  if (!res.ok || !String(res.headers.get('content-type')).startsWith('image/')) {
    throw new ProviderError(`Free image API ${res.status}`, res.status);
  }
  return Buffer.from(await res.arrayBuffer());
}

async function freeWithRetry(prompt, shape) {
  let lastError = null;
  for (const wait of [0, 4000, 10000, 20000]) {
    if (wait) await sleep(wait);
    try {
      return await freeOnce(prompt, shape);
    } catch (err) {
      lastError = err;
      if (![402, 429, 500, 502, 503].includes(err.status)) break;
    }
  }
  throw lastError;
}

function viaFree(prompt, shape) {
  const job = freeQueue.then(() => freeWithRetry(prompt, shape));
  freeQueue = job.catch(() => {});
  return job;
}

function providers() {
  const list = [];
  if (config.images.openaiKey) list.push(['openai', viaOpenAI]);
  if (config.gemini.apiKey && config.images.geminiModel) list.push(['gemini', viaGemini]);
  if (config.cf.accountId && config.cf.apiToken) list.push(['cloudflare', viaCloudflare]);
  list.push(['free', viaFree]);
  return list;
}

export async function cropTo(buffer, shape) {
  const { width, height } = await sharp(buffer).metadata();
  if (!width || !height) return buffer;
  const target = shape.w / shape.h;
  if (Math.abs(width / height - target) < 0.02) return buffer;
  const w = width / height > target ? Math.round(height * target) : width;
  const h = width / height > target ? height : Math.round(width / target);
  return sharp(buffer)
    .extract({ left: Math.floor((width - w) / 2), top: Math.floor((height - h) / 2), width: w, height: h })
    .toBuffer();
}

async function generate(prompt, shape, refs = []) {
  let lastError = null;
  for (const [name, run] of providers()) {
    if ((pausedUntil.get(name) || 0) > Date.now()) continue;
    try {
      const buffer = await cropTo(await run(prompt, shape, refs), shape);
      log.info('ai image made', { provider: name });
      buffer.provider = name;
      return buffer;
    } catch (err) {
      lastError = err;
      if (name !== 'free' && [401, 402, 403, 429].includes(err.status)) pausedUntil.set(name, Date.now() + 6 * HOUR);
      log.warn('ai image provider failed', { provider: name, error: err.message.slice(0, 200) });
    }
  }
  throw lastError;
}

export function fallbackPrompts(site) {
  const what = [site.category, site.city && `in ${site.city}`].filter(Boolean).join(' ') || 'small local business';
  return [
    `Wide establishing view of a welcoming, well-kept ${what}, golden hour light`,
    `Close-up detail of the products or work of a ${what}, rich texture`,
    `The everyday atmosphere inside a ${what}, candid, warm light`,
    `Tools, materials or signature items of a ${what} arranged with care on a clean surface`,
  ];
}

export function aiImageBuffer(prompt, slot, refs = []) {
  return generate(prompt, shapeOf(slot), refs);
}

export async function referenceBuffers(photos = [], max = 3) {
  const own = photos.filter((p) => !p.ai && p.lg && (!p.asset || p.asset.usable)).slice(0, max);
  const loaded = await Promise.all(
    own.map(async (p) => {
      try {
        const res = await fetch(p.lg, { signal: AbortSignal.timeout(20000) });
        if (!res.ok) return null;
        return await sharp(Buffer.from(await res.arrayBuffer())).resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
      } catch {
        return null;
      }
    })
  );
  return loaded.filter(Boolean);
}

export const paidImages = () => Boolean(config.images.openaiKey);

export async function generateImage(prompt, slot, ownerPhone) {
  return { ...(await processAndUpload(await aiImageBuffer(prompt, slot), ownerPhone)), ai: true, prompt };
}

export async function generateSiteImages(prompts, ownerPhone) {
  const results = await Promise.allSettled(
    prompts.slice(0, 4).map((prompt, slot) => generateImage(prompt, slot, ownerPhone))
  );
  return results.flatMap((r) => {
    if (r.status === 'fulfilled') return [r.value];
    log.warn('ai image failed', { error: r.reason?.message });
    return [];
  });
}
