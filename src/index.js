import express from 'express';
import { config } from './config.js';
import { connect, close, ping, processed, isDuplicateKey } from './db.js';
import { verifySignature, parseIncoming, sendText, markRead } from './whatsapp.js';
import { handleMessage } from './bot.js';
import { serveSite, isRootHost } from './site.js';
import { sites } from './db.js';
import { billingEnabled, createCheckout, verifyPayKey, verifyStripeSignature, handleStripeEvent, sweepTrials, accessState } from './billing.js';
import { sweepDomains } from './domains.js';
import { handleLead, handleTap } from './leads.js';
import { adminPage, adminCsv } from './admin.js';
import { renderMessage } from './render.js';
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

const rootOnly = (req, res, next) => (isRootHost(String(req.hostname || '').toLowerCase()) || !config.isProd ? next() : res.sendStatus(404));
const page = (res, status, title, text) => res.status(status).set('Cache-Control', 'no-store').type('html').send(renderMessage(title, text));

app.post('/stripe/webhook', express.raw({ type: '*/*', limit: '1mb' }), async (req, res) => {
  if (!verifyStripeSignature(req.body, req.get('stripe-signature'))) return res.sendStatus(400);
  let event;
  try {
    event = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.sendStatus(400);
  }
  try {
    await handleStripeEvent(event);
    res.sendStatus(200);
  } catch (err) {
    log.error('stripe event failed', err, { type: event?.type });
    res.sendStatus(500);
  }
});

app.get('/pay/:slug', rootOnly, async (req, res) => {
  const slug = String(req.params.slug || '').toLowerCase();
  if (!billingEnabled() || !verifyPayKey(slug, req.query.k)) return page(res, 404, 'Link not valid', 'This payment link is not valid. Ask for a new one on WhatsApp.');
  const site = await sites.findOne({ slug });
  if (!site) return page(res, 404, 'Website not found', 'This website no longer exists.');
  if (site.plan === 'paid' && accessState(site) === 'live') return res.redirect(303, `https://${slug}.${config.rootDomain}`);
  try {
    return res.redirect(303, await createCheckout(site));
  } catch (err) {
    log.error('checkout failed', err, { slug });
    return page(res, 502, 'Payment unavailable', 'Payments are not available right now. Please try again in a few minutes.');
  }
});

app.get('/paid', rootOnly, (_req, res) =>
  page(res, 200, 'Payment received', 'Thank you! Your website stays live. You will get a confirmation on WhatsApp in a moment.')
);

app.get('/admin', rootOnly, (req, res, next) => adminPage(req, res).catch(next));
app.get('/admin/sites.csv', rootOnly, (req, res, next) => adminCsv(req, res).catch(next));

app.post('/lead', express.urlencoded({ extended: false, limit: '16kb' }), handleLead);
app.post('/t', express.text({ type: '*/*', limit: '64b' }), handleTap);

app.use(serveSite);

const SWEEP_MS = 5 * 60 * 1000;
async function sweep() {
  await sweepTrials().catch((err) => log.error('trial sweep failed', err));
  await sweepDomains().catch((err) => log.error('domain sweep failed', err));
}

await connect();
const server = app.listen(config.port, () => log.info('server started', { port: config.port }));
setInterval(sweep, SWEEP_MS).unref();
setTimeout(sweep, 20_000).unref();

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
