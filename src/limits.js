import { usage, events } from './db.js';
import { hashPhone, log } from './log.js';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

async function allow(phone, kind, limit, windowMs) {
  const bucket = Math.floor(Date.now() / windowMs);
  const doc = await usage.findOneAndUpdate(
    { _id: `${kind}:${hashPhone(phone)}:${bucket}` },
    { $inc: { n: 1 }, $setOnInsert: { at: new Date() } },
    { upsert: true, returnDocument: 'after' }
  );
  return (doc?.n ?? 1) <= limit;
}

export const allowAiCall = (phone, limit) => allow(phone, 'ai', limit, DAY);
export const allowPhoto = (phone, limit) => allow(phone, 'photo', limit, HOUR);
export const allowAdvanced = (phone, limit) => allow(phone, 'adv', limit, DAY);
export const allowNewSite = (phone, limit) => allow(phone, 'site', limit, DAY);

export function track(phone, type, data = {}) {
  events
    .insertOne({ type, user: hashPhone(phone), at: new Date(), ...data })
    .catch((err) => log.warn('event write failed', { type, error: err.message }));
}
