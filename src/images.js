import { config } from './config.js';
import { log } from './log.js';
import { processAndUpload } from './storage.js';

const MODEL = '@cf/black-forest-labs/flux-1-schnell';
const STYLE = 'professional photograph, natural light, clean composition, no text, no logos, no watermark';

const cloudflareEnabled = () => Boolean(config.cf.accountId && config.cf.apiToken);

export function imagesEnabled() {
  return true;
}

async function generateFree(prompt) {
  const seed = Math.floor(Math.random() * 1e9);
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(`${prompt}, ${STYLE}`.slice(0, 900))}?width=1024&height=1280&nologo=true&model=flux&seed=${seed}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(50000) });
  if (!res.ok || !String(res.headers.get('content-type')).startsWith('image/')) {
    throw new Error(`Free image API ${res.status}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

export function fallbackPrompts(site) {
  const what = [site.category, site.city && `in ${site.city}`].filter(Boolean).join(' ') || 'small local business';
  return [
    `Welcoming storefront and interior of a ${what}`,
    `Close-up of the products or work of a ${what}`,
    `Tools, ingredients or materials of a ${what} arranged neatly on a table`,
  ];
}

async function generate(prompt) {
  if (!cloudflareEnabled()) return generateFree(prompt);
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${config.cf.accountId}/ai/run/${MODEL}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.cf.apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prompt: `${prompt}, ${STYLE}`.slice(0, 1800), steps: 6 }),
      signal: AbortSignal.timeout(30000),
    }
  );
  if (!res.ok) throw new Error(`Image API ${res.status}: ${(await res.text()).slice(0, 160)}`);
  const body = await res.json();
  const b64 = body?.result?.image;
  if (!b64) throw new Error('Image API returned no image');
  return Buffer.from(b64, 'base64');
}

export async function generateSiteImages(prompts, ownerPhone) {
  const results = await Promise.allSettled(
    prompts.slice(0, 3).map(async (prompt) => {
      const buffer = await generate(prompt);
      return { ...(await processAndUpload(buffer, ownerPhone)), ai: true };
    })
  );
  return results.flatMap((r) => {
    if (r.status === 'fulfilled') return [r.value];
    log.warn('ai image failed', { error: r.reason?.message });
    return [];
  });
}
