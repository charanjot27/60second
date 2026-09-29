import crypto from 'node:crypto';
import { config } from './config.js';
import { log } from './log.js';
import { isDisallowedText } from './moderation.js';
import { callGemini, geminiEnabled } from './gemini.js';

export const THEMES = ['rose', 'forest', 'ocean', 'sunset', 'slate', 'plum'];

const SYSTEM_PROMPT = `You write website copy for small local businesses in India.
The owner sends one short WhatsApp message describing their business, in English, Hindi, Punjabi or a mix.
Reply with ONE JSON object and nothing else, using exactly these keys:
{
  "allowed": true,
  "reason": "",
  "businessName": "the business name as the owner wrote it, properly capitalised",
  "category": "2-3 word business type, e.g. Home Bakery, Tailor, Unisex Salon",
  "city": "city or area if mentioned, else empty string",
  "tagline": "one warm, specific line under 60 characters",
  "description": "2-3 sentences (under 320 characters) about the business, written for its customers, no invented facts such as years, awards or prices",
  "services": ["3 to 6 short items the business offers, each under 32 characters"],
  "theme": "one of rose, forest, ocean, sunset, slate, plum that suits the business",
  "slugHint": "short lowercase web name from the business name, letters and digits only",
  "imagePrompts": ["3 short English scene descriptions for illustrative photos of this kind of business, no people's faces, no text or logos"],
  "language": "en, hi or pa: the main language the owner wrote in"
}
Write the copy in the same language and script the owner used; use simple English if the message mixes languages.
Set "allowed" to false and give a short "reason" if the business involves illegal goods, weapons, drugs, adult or sexual services, gambling or betting, get-rich-quick or investment schemes, loans without checks, fake documents, or impersonates a bank, government body or well-known brand.
If no business name is given, create a plain descriptive one from what they sell and the city.`;

const cache = new Map();
const CACHE_LIMIT = 500;

function clean(value, max) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
    .trim();
}

function firstLine(text) {
  return clean(String(text || '').split(/[\n,.|–-]/)[0], 60);
}

export function fallbackCopy(text, ownerName = '') {
  const businessName = firstLine(text) || clean(ownerName, 60) || 'My Business';
  return {
    allowed: true,
    reason: '',
    businessName,
    category: '',
    city: '',
    tagline: '',
    description: clean(text, 320),
    services: [],
    theme: 'slate',
    slugHint: '',
    imagePrompts: [],
    language: 'en',
  };
}

export function sanitize(data, rawText, ownerName) {
  const fb = fallbackCopy(rawText, ownerName);
  if (!data || typeof data !== 'object') return fb;
  const services = Array.isArray(data.services)
    ? [...new Set(data.services.map((s) => clean(s, 32)).filter(Boolean))].slice(0, 6)
    : [];
  return {
    allowed: data.allowed !== false,
    reason: clean(data.reason, 160),
    businessName: clean(data.businessName, 60) || fb.businessName,
    category: clean(data.category, 40),
    city: clean(data.city, 40),
    tagline: clean(data.tagline, 80),
    description: clean(data.description, 400) || fb.description,
    services,
    theme: THEMES.includes(data.theme) ? data.theme : 'slate',
    slugHint: clean(data.slugHint, 30).toLowerCase().replace(/[^a-z0-9]/g, ''),
    imagePrompts: Array.isArray(data.imagePrompts)
      ? data.imagePrompts.map((p) => clean(p, 200)).filter(Boolean).slice(0, 3)
      : [],
    language: ['en', 'hi', 'pa'].includes(data.language) ? data.language : 'en',
  };
}

function parseJson(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('No JSON in AI response');
  return JSON.parse(text.slice(start, end + 1));
}

async function callModel(model, text, timeoutMs) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': config.ai.apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 700,
      temperature: 0.4,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: text.slice(0, 2000) }],
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`AI API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = await res.json();
  const out = (body.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
  return parseJson(out);
}

export async function extractBusiness(text, ownerName = '') {
  const key = crypto.createHash('sha256').update(text.trim().toLowerCase()).digest('hex');
  if (cache.has(key)) return cache.get(key);

  const deadline = Date.now() + config.ai.timeoutMs;
  const attempts = [];
  if (config.ai.apiKey) {
    for (const model of [config.ai.model, config.ai.fallbackModel].filter(Boolean)) {
      attempts.push([model, (ms) => callModel(model, text, ms)]);
    }
  }
  if (geminiEnabled()) {
    attempts.push(['gemini', (ms) => callGemini({ system: SYSTEM_PROMPT, user: text.slice(0, 2000), maxTokens: 1200, temperature: 0.5, timeoutMs: ms, json: true }).then(parseJson)]);
    attempts.push(['gemini', (ms) => callGemini({ system: SYSTEM_PROMPT, user: text.slice(0, 2000), maxTokens: 1200, temperature: 0.3, timeoutMs: ms, json: true }).then(parseJson)]);
  }
  let result = null;
  for (const [name, run] of attempts) {
    const remaining = deadline - Date.now();
    if (remaining < 1000) break;
    try {
      result = sanitize(await run(remaining), text, ownerName);
      break;
    } catch (err) {
      log.warn('ai call failed', { model: name, error: err.message });
    }
  }
  const final = result || fallbackCopy(text, ownerName);

  if (isDisallowedText(text, final.businessName, final.category, final.tagline, final.description)) {
    final.allowed = false;
    final.reason = final.reason || 'this type of business';
  }

  if (result) {
    if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value);
    cache.set(key, final);
  }
  return final;
}
