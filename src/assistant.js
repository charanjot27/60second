import { config } from './config.js';
import { callClaude, claudeEnabled } from './claude.js';
import { callGemini, geminiEnabled } from './gemini.js';
import { log } from './log.js';

function parseJson(text) {
  const raw = String(text || '');
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('No JSON in reply');
  return JSON.parse(raw.slice(start, end + 1));
}

export function cheapEnabled() {
  return geminiEnabled() || (claudeEnabled() && Boolean(config.ai.chatModel));
}

export async function cheapJson({ system, user, maxTokens = 1500, timeoutMs = 30000 }) {
  const attempts = [];
  if (geminiEnabled()) attempts.push(['gemini', () => callGemini({ system, user, maxTokens, temperature: 0.3, timeoutMs, json: true })]);
  if (claudeEnabled() && config.ai.chatModel) {
    attempts.push([config.ai.chatModel, () => callClaude({ model: config.ai.chatModel, system, user, maxTokens, effort: 'low', timeoutMs })]);
  }
  let lastError = new Error('No small AI model configured');
  for (const [name, run] of attempts) {
    try {
      return parseJson(await run());
    } catch (err) {
      lastError = err;
      log.warn('small model failed', { model: name, error: err.message.slice(0, 200) });
    }
  }
  throw lastError;
}

const ROUTER_PROMPT = `You sort WhatsApp messages that a small-business owner sends to the bot that made their website.
Decide what the owner wants:
- "question": they ask something (price, payment, how long, what you can do, how to get a domain, status of the site). Answer briefly and kindly from CONTEXT only; if the answer is not there, say the team will help.
- "chat": greetings, thanks, "ok", small talk. Reply in one short friendly line.
- "images": they want only pictures redrawn or changed, nothing else. Give one detailed photorealistic brief per picture to redraw: slot 1 = hero (wide), 2 = about (tall), 3 = services (wide), 4 = detail (square).
- "change": anything else that changes the website: wording, colours, fonts, layout, sections, facts, services, adding or removing things.
When unsure between "change" and anything else, choose "change".
Reply in the owner's language with JSON only:
{"intent":"question|chat|images|change","answer":"reply for question or chat, else empty","images":[{"slot":1,"prompt":"brief"}],"summary":"for images: one short sentence for the owner"}`;

export async function routeMessage(text, context) {
  const out = await cheapJson({ system: ROUTER_PROMPT, user: `CONTEXT:\n${JSON.stringify(context)}\n\nOWNER MESSAGE:\n"""${String(text).slice(0, 1200)}"""`, maxTokens: 1200 });
  const intent = ['question', 'chat', 'images', 'change'].includes(out.intent) ? out.intent : 'change';
  const images = (Array.isArray(out.images) ? out.images : [])
    .map((x) => ({ slot: Number(x?.slot), prompt: String(x?.prompt || '').trim().slice(0, 900) }))
    .filter((x) => x.slot >= 1 && x.slot <= 4 && x.prompt)
    .slice(0, 4);
  return {
    intent: intent === 'images' && !images.length ? 'change' : intent,
    answer: String(out.answer || '').trim().slice(0, 700),
    images,
    summary: String(out.summary || '').trim().slice(0, 300),
  };
}
