import crypto from 'node:crypto';
import { config } from './config.js';
import { log } from './log.js';
import { isDisallowedText } from './moderation.js';
import { callClaude } from './claude.js';
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
  "city": "the city if mentioned, else empty string",
  "area": "the locality, area or market within the city if mentioned, else empty string",
  "tagline": "one warm, specific line under 60 characters",
  "description": "2-3 sentences (under 320 characters) about the business, written for its customers, using only what the owner said: no invented years, awards, prices, timings or addresses",
  "services": ["only the services or products the owner actually mentioned, each under 40 characters, at most 10; never add ones they did not mention"],
  "theme": "one of rose, forest, ocean, sunset, slate, plum that suits the business",
  "slugHint": "short lowercase web name from the business name, letters and digits only",
  "imagePrompts": ["3 short English scene descriptions for illustrative photos of this kind of business, no people's faces, no text or logos"],
  "language": "en, hi or pa: the main language the owner wrote in"
}
Write the copy in the language the owner chose (given below the message); if none is given, use the language and script the owner used, or simple English for mixed messages.
The message may be a voice-note transcript with filler words or small recognition mistakes: understand what the owner meant and correct obvious mistakes in names of places.
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
    area: '',
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
    ? [...new Set(data.services.map((s) => clean(s, 40)).filter(Boolean))].slice(0, 10)
    : [];
  return {
    allowed: data.allowed !== false,
    reason: clean(data.reason, 160),
    businessName: clean(data.businessName, 60) || fb.businessName,
    category: clean(data.category, 40),
    city: clean(data.city, 40),
    area: clean(data.area, 60),
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


const LANG_NAMES = { en: 'English', hi: 'Hindi (Devanagari script)', pa: 'Punjabi (Gurmukhi script)' };

export async function extractBusiness(rawText, ownerName = '', lang = '') {
  const text = lang && LANG_NAMES[lang] ? `${rawText}\n\n[Owner chose language: ${LANG_NAMES[lang]}]` : rawText;
  const key = crypto.createHash('sha256').update(text.trim().toLowerCase()).digest('hex');
  if (cache.has(key)) return cache.get(key);

  const deadline = Date.now() + config.ai.timeoutMs;
  const attempts = [];
  if (geminiEnabled()) {
    attempts.push(['gemini', (ms) => callGemini({ system: SYSTEM_PROMPT, user: text.slice(0, 2000), maxTokens: 1500, temperature: 0.4, timeoutMs: ms, json: true }).then(parseJson)]);
  }
  if (config.ai.apiKey && config.ai.chatModel) {
    attempts.push([config.ai.chatModel, (ms) => callClaude({ model: config.ai.chatModel, system: SYSTEM_PROMPT, user: text.slice(0, 2000), maxTokens: 2000, effort: 'low', timeoutMs: ms }).then(parseJson)]);
  }
  if (geminiEnabled()) {
    attempts.push(['gemini', (ms) => callGemini({ system: SYSTEM_PROMPT, user: text.slice(0, 2000), maxTokens: 1500, temperature: 0.2, timeoutMs: ms, json: true }).then(parseJson)]);
  }
  let result = null;
  for (const [name, run] of attempts) {
    const remaining = deadline - Date.now();
    if (remaining < 1000) break;
    try {
      result = sanitize(await run(remaining), rawText, ownerName);
      break;
    } catch (err) {
      log.warn('ai call failed', { model: name, error: err.message });
    }
  }
  const final = result || fallbackCopy(rawText, ownerName);
  if (lang && LANG_NAMES[lang]) final.language = lang;

  if (isDisallowedText(rawText, final.businessName, final.category, final.tagline, final.description)) {
    final.allowed = false;
    final.reason = final.reason || 'this type of business';
  }

  if (result) {
    if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value);
    cache.set(key, final);
  }
  return final;
}
