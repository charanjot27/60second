import crypto from 'node:crypto';
import { config } from './config.js';

const API = 'https://api.razorpay.com/v1';

export function razorpayEnabled() {
  return Boolean(config.razorpay.keyId && config.razorpay.keySecret);
}

export async function rzp(method, path, body) {
  const auth = Buffer.from(`${config.razorpay.keyId}:${config.razorpay.keySecret}`).toString('base64');
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Razorpay ${res.status}: ${data?.error?.description || 'request failed'}`);
  return data;
}

function signatureMatches(secret, payload, signature) {
  if (!secret || !signature) return false;
  const expected = Buffer.from(crypto.createHmac('sha256', secret).update(payload).digest('hex'));
  const given = Buffer.from(String(signature));
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

export function verifyRazorpayWebhook(rawBody, signature, secret = config.razorpay.webhookSecret) {
  return Buffer.isBuffer(rawBody) && signatureMatches(secret, rawBody, signature);
}

export function verifyLinkCallback(q, secret = config.razorpay.keySecret) {
  const parts = [q.razorpay_payment_link_id, q.razorpay_payment_link_reference_id, q.razorpay_payment_link_status, q.razorpay_payment_id];
  return parts.every(Boolean) && signatureMatches(secret, parts.join('|'), q.razorpay_signature);
}

export function verifySubscriptionCallback(q, secret = config.razorpay.keySecret) {
  return Boolean(q.razorpay_payment_id && q.razorpay_subscription_id) &&
    signatureMatches(secret, `${q.razorpay_payment_id}|${q.razorpay_subscription_id}`, q.razorpay_signature);
}
