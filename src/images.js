import { config } from './config.js';
import { log } from './log.js';
import { processAndUpload } from './storage.js';

const STYLE =
  'editorial photograph, shot on a full-frame camera, natural light, true-to-life colour, sharp focus, shallow depth of field, ' +
  'realistic Indian setting, no text, no letters, no logos, no watermark, no distorted faces';

const SHAPES = {
  wide: { ratio: '3:2', w: 1536, h: 1024, openai: '1536x1024' },
  tall: { ratio: '4:5', w: 1024, h: 1280, openai: '1024x1536' },
  square: { ratio: '1:1', w: 1024, h: 1024, openai: '1024x1024' },
};
const SLOT_SHAPES = ['wide', 'tall', 'wide', 'square'];

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

const full = (prompt) => `${prompt}. ${STYLE}`.slice(0, 1800);

async function viaOpenAI(prompt, shape) {
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.images.openaiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: config.images.openaiModel, prompt: full(prompt), size: shape.openai, quality: 'high', n: 1 }),
    signal: AbortSignal.timeout(180000),
  });
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

async function viaCloudflare(prompt, shape) {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${config.cf.accountId}/ai/run/${config.images.cfModel}`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.cf.apiToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: full(prompt), steps: 8, width: shape.w, height: shape.h }),
      signal: AbortSignal.timeout(60000),
    }
  );
  if (!res.ok) throw new ProviderError(`Cloudflare image ${res.status}: ${(await res.text()).slice(0, 160)}`, res.status);
  if (String(res.headers.get('content-type')).startsWith('image/')) return Buffer.from(await res.arrayBuffer());
  const b64 = (await res.json())?.result?.image;
  if (!b64) throw new Error('Cloudflare returned no image');
  return Buffer.from(b64, 'base64');
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

async function generate(prompt, shape) {
  let lastError = null;
  for (const [name, run] of providers()) {
    if ((pausedUntil.get(name) || 0) > Date.now()) continue;
    try {
      const buffer = await run(prompt, shape);
      log.info('ai image made', { provider: name });
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

export async function generateImage(prompt, slot, ownerPhone) {
  const shape = SHAPES[SLOT_SHAPES[slot] || 'square'];
  return { ...(await processAndUpload(await generate(prompt, shape), ownerPhone)), ai: true, prompt };
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
