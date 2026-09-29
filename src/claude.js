import { config } from './config.js';

export function claudeEnabled() {
  return Boolean(config.ai.apiKey);
}

export async function callClaude({ model, system, user, maxTokens = 4000, temperature = 1, timeoutMs = 60000 }) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': config.ai.apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature,
      system,
      messages: [{ role: 'user', content: user }],
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`Claude API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = await res.json();
  const text = (body.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
  if (!text) throw new Error('Claude returned no text');
  return text;
}
