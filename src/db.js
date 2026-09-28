import { MongoClient } from 'mongodb';
import { config } from './config.js';

const client = new MongoClient(config.mongo.url, { maxPoolSize: 20 });
const db = client.db(config.mongo.db);

export const sites = db.collection('sites');
export const sessions = db.collection('sessions');
export const processed = db.collection('processed');
export const usage = db.collection('usage');
export const events = db.collection('events');

export async function connect() {
  await client.connect();
  await Promise.all([
    sites.createIndex({ slug: 1 }, { unique: true }),
    sites.createIndex({ customDomain: 1 }, { unique: true, sparse: true }),
    sites.createIndex({ ownerPhone: 1 }),
    sessions.createIndex({ updatedAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 }),
    processed.createIndex({ at: 1 }, { expireAfterSeconds: 60 * 60 * 24 }),
    usage.createIndex({ at: 1 }, { expireAfterSeconds: 60 * 60 * 48 }),
    events.createIndex({ type: 1, at: -1 }),
  ]);
}

export async function ping() {
  await db.command({ ping: 1 });
}

export async function close() {
  await client.close();
}

export function isDuplicateKey(err) {
  return err?.code === 11000;
}
