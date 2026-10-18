import { config } from './config.js';
import { log } from './log.js';

const LANG_NAMES = { en: 'English', hi: 'Hindi', pa: 'Punjabi' };

function clean(text) {
  return String(text || '').replace(/\s+/g, ' ').trim().slice(0, 3000);
}

async function viaCloudflare(buffer, lang) {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${config.cf.accountId}/ai/run/${config.cf.whisperModel}`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.cf.apiToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ audio: buffer.toString('base64'), task: 'transcribe', language: lang }),
      signal: AbortSignal.timeout(60000),
    }
  );
  if (!res.ok) throw new Error(`Cloudflare speech ${res.status}: ${(await res.text()).slice(0, 160)}`);
  const body = await res.json();
  return clean(body?.result?.text);
}

async function viaGemini(buffer, mimeType, lang) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${config.gemini.model}:generateContent`,
    {
      method: 'POST',
      headers: { 'x-goog-api-key': config.gemini.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { inline_data: { mime_type: String(mimeType || 'audio/ogg').split(';')[0], data: buffer.toString('base64') } },
              {
                text:
                  `Transcribe this voice note word for word. The speaker most likely uses ${LANG_NAMES[lang] || 'English'}, ` +
                  'possibly mixed with English. Reply with the transcript only, no comments.',
              },
            ],
          },
        ],
        generationConfig: { temperature: 0, maxOutputTokens: 2000, thinkingConfig: { thinkingBudget: 0 } },
      }),
      signal: AbortSignal.timeout(60000),
    }
  );
  if (!res.ok) throw new Error(`Gemini speech ${res.status}: ${(await res.text()).slice(0, 160)}`);
  const body = await res.json();
  return clean((body?.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join(' '));
}

export function voiceEnabled() {
  return Boolean((config.cf.accountId && config.cf.apiToken) || config.gemini.apiKey);
}

export async function transcribe(buffer, mimeType, lang = 'en') {
  const providers = [];
  if (config.cf.accountId && config.cf.apiToken) providers.push(['cloudflare', () => viaCloudflare(buffer, lang)]);
  if (config.gemini.apiKey) providers.push(['gemini', () => viaGemini(buffer, mimeType, lang)]);
  for (const [name, run] of providers) {
    try {
      const text = await run();
      if (text) {
        log.info('voice transcribed', { provider: name, chars: text.length });
        return text;
      }
    } catch (err) {
      log.warn('voice provider failed', { provider: name, error: err.message.slice(0, 200) });
    }
  }
  return '';
}
