import { config } from './config.js';
import { log } from './log.js';
import { processAndUpload } from './storage.js';

const MODEL = '@cf/black-forest-labs/flux-1-schnell';
const STYLE = 'professional photograph, natural light, clean composition, no text, no logos, no watermark';

export function imagesEnabled() {
  return Boolean(config.cf.accountId && config.cf.apiToken);
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
  if (!imagesEnabled()) return [];
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
