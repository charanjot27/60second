import crypto from 'node:crypto';
import { config } from './config.js';

const API = 'https://api.stripe.com/v1';

export function stripeEnabled() {
  return Boolean(config.billing.stripeSecret);
}

function form(params, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(params)) {
    const key = prefix ? `${prefix}[${k}]` : k;
    if (v && typeof v === 'object') form(v, key, out);
    else if (v !== undefined && v !== null) out.append(key, String(v));
  }
  return out;
}

export async function stripe(method, path, params, idempotencyKey) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${config.billing.stripeSecret}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
    body: params ? form(params) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Stripe ${res.status}: ${body?.error?.message || 'request failed'}`);
  return body;
}

export function verifyStripeSignature(rawBody, header, secret = config.billing.webhookSecret, now = Date.now()) {
  if (!secret || !header || !Buffer.isBuffer(rawBody)) return false;
  const pairs = String(header)
    .split(',')
    .map((p) => p.split('='))
    .filter((p) => p.length === 2);
  const t = Number(pairs.find(([k]) => k === 't')?.[1]);
  const signatures = pairs.filter(([k]) => k === 'v1').map(([, v]) => v);
  if (!t || Math.abs(now / 1000 - t) > 300 || !signatures.length) return false;
  const expected = Buffer.from(crypto.createHmac('sha256', secret).update(`${t}.`).update(rawBody).digest('hex'));
  return signatures.some((sig) => {
    const given = Buffer.from(sig);
    return given.length === expected.length && crypto.timingSafeEqual(given, expected);
  });
}
