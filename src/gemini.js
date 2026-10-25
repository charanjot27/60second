import { config } from './config.js';

export function geminiEnabled() {
  return Boolean(config.gemini.apiKey);
}

function toParts(user) {
  if (!Array.isArray(user)) return [{ text: String(user) }];
  return user.map((block) =>
    block.type === 'image'
      ? { inline_data: { mime_type: block.source.media_type, data: block.source.data } }
      : { text: String(block.text || '') }
  );
}

export async function callGemini({ system, user, maxTokens = 2000, temperature = 0.7, timeoutMs = 30000, json = false, model = config.gemini.model, think = false }) {
  const generationConfig = {
    temperature,
    maxOutputTokens: maxTokens,
    ...(think ? {} : { thinkingConfig: { thinkingBudget: 0 } }),
  };
  if (json) generationConfig.responseMimeType = 'application/json';

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: { 'x-goog-api-key': config.gemini.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: toParts(user) }],
        generationConfig,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    }
  );
  if (!res.ok) throw new Error(`Gemini API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = await res.json();
  const text = (body.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
  if (!text) throw new Error('Gemini returned no text');
  return text;
}
