import express from 'express';
import { config } from './config.js';
import { connect, close, ping, processed, isDuplicateKey } from './db.js';
import { verifySignature, parseIncoming, sendText, markRead } from './whatsapp.js';
import { handleMessage } from './bot.js';
import { serveSite, isRootHost } from './site.js';
import { enqueue, drain } from './queue.js';
import { log, hashPhone } from './log.js';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);

app.get('/healthz', async (_req, res) => {
  try {
    await ping();
    res.set('Cache-Control', 'no-store').json({ ok: true });
  } catch {
    res.status(503).json({ ok: false });
  }
});

function webhookHostAllowed(req) {
  return !config.isProd || isRootHost(String(req.hostname || '').toLowerCase());
}

app.get('/webhook', (req, res) => {
  if (!webhookHostAllowed(req)) return res.sendStatus(404);
  const ok =
    req.query['hub.mode'] === 'subscribe' &&
    config.wa.verifyToken &&
    req.query['hub.verify_token'] === config.wa.verifyToken;
  return ok ? res.status(200).type('text/plain').send(String(req.query['hub.challenge'])) : res.sendStatus(403);
});

app.post('/webhook', express.raw({ type: '*/*', limit: '1mb' }), (req, res) => {
  if (!webhookHostAllowed(req)) return res.sendStatus(404);
  if (!verifySignature(req.body, req.get('x-hub-signature-256'))) return res.sendStatus(401);

  let body;
  try {
    body = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.sendStatus(400);
  }
  res.sendStatus(200);

  for (const msg of parseIncoming(body)) {
    enqueue(msg.from, () => processMessage(msg));
  }
});

async function processMessage(msg) {
  try {
    await processed.insertOne({ _id: msg.id, at: new Date() });
  } catch (err) {
    if (isDuplicateKey(err)) return;
    throw err;
  }
  markRead(msg.id);
  try {
    await handleMessage(msg);
  } catch (err) {
    log.error('message handling failed', err, { user: hashPhone(msg.from), id: msg.id });
    await sendText(msg.from, 'Something failed on our side. Please send your last message again.').catch(() => {});
  }
}

app.use(serveSite);

await connect();
const server = app.listen(config.port, () => log.info('server started', { port: config.port }));

let stopping = false;
async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  log.info('shutting down', { signal });
  server.close();
  await drain(10000);
  await close();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (err) => log.error('unhandled rejection', err));
