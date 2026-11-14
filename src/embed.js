import { config } from './config.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function embedProvider() {
  const chosen = config.embeddings.provider;
  if (chosen === 'openai' || chosen === 'gemini') return chosen;
  if (config.images.openaiKey) return 'openai';
  return config.gemini.apiKey ? 'gemini' : '';
}

export function embedModelId() {
  const provider = embedProvider();
  if (provider === 'openai') return `openai:${config.embeddings.openaiModel}:${config.embeddings.openaiDims}`;
  if (provider === 'gemini') return `gemini:${config.gemini.embedModel}:256`;
  return '';
}

export const embeddingsEnabled = () => Boolean(embedProvider());

function normalise(values, dims) {
  const v = values.slice(0, dims).map(Number);
  const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => Number((x / n).toFixed(5)));
}

async function withRetry(run) {
  for (let attempt = 0; ; attempt++) {
    const res = await run();
    if ((res.status === 429 || res.status >= 500) && attempt < 5) {
      await sleep(2000 * 2 ** attempt);
      continue;
    }
    if (!res.ok) throw new Error(`embed ${res.status}: ${(await res.text()).slice(0, 160)}`);
    return res.json();
  }
}

async function openaiBatch(texts) {
  const dims = config.embeddings.openaiDims;
  const body = await withRetry(() =>
    fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.images.openaiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: config.embeddings.openaiModel, input: texts.map((t) => t.slice(0, 8000)), dimensions: dims }),
      signal: AbortSignal.timeout(60000),
    })
  );
  return (body.data || []).sort((a, b) => a.index - b.index).map((d) => normalise(d.embedding || [], dims));
}

async function geminiBatch(texts, taskType) {
  const model = `models/${config.gemini.embedModel}`;
  const body = await withRetry(() =>
    fetch(`https://generativelanguage.googleapis.com/v1beta/${model}:batchEmbedContents`, {
      method: 'POST',
      headers: { 'x-goog-api-key': config.gemini.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests: texts.map((text) => ({ model, content: { parts: [{ text: text.slice(0, 6000) }] }, taskType, outputDimensionality: 256 })) }),
      signal: AbortSignal.timeout(60000),
    })
  );
  return (body.embeddings || []).map((e) => normalise(e.values || [], 256));
}

export async function embedTexts(texts, taskType = 'RETRIEVAL_DOCUMENT') {
  const provider = embedProvider();
  if (!provider || !texts.length) return [];
  const size = provider === 'openai' ? 100 : 50;
  const out = [];
  for (let i = 0; i < texts.length; i += size) {
    const slice = texts.slice(i, i + size);
    out.push(...(provider === 'openai' ? await openaiBatch(slice) : await geminiBatch(slice, taskType)));
    if (i + size < texts.length) await sleep(provider === 'openai' ? 200 : 700);
  }
  return out;
}
