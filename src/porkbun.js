import { config } from './config.js';

const API = 'https://api.porkbun.com/api/json/v3';

export function porkbunEnabled() {
  return Boolean(config.porkbun.apiKey && config.porkbun.secretKey);
}

export async function porkbun(path, body = {}, idempotencyKey) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': config.porkbun.apiKey,
      'X-Secret-API-Key': config.porkbun.secretKey,
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.status !== 'SUCCESS') {
    const err = new Error(`Porkbun ${res.status}: ${data.code || ''} ${data.message || 'request failed'}`.trim());
    err.code = data.code;
    throw err;
  }
  return data;
}

export const usdCents = (price) => Math.round(Number(price) * 100);
