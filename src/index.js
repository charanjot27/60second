import express from 'express';
import { config } from './config.js';
import { connect, close, ping, processed, isDuplicateKey } from './db.js';
import { verifySignature, parseIncoming, sendText, markRead } from './whatsapp.js';
import { handleMessage } from './bot.js';
import { serveSite, isRootHost } from './site.js';
import { sites } from './db.js';
import {
  billingEnabled,
  autopayAvailable,
  createPayment,
  confirmPaymentLink,
  confirmSubscription,
  handleRazorpayEvent,
  payMethods,
  priceLabel,
  shortDate,
  verifyPayKey,
  verifyStripeSignature,
  handleStripeEvent,
  sweepTrials,
  sweepPlans,
  accessState,
} from './billing.js';
import { razorpayEnabled, verifyRazorpayWebhook, verifyLinkCallback, verifySubscriptionCallback } from './razorpay.js';
import { sweepDomains } from './domains.js';
import { handleLead, handleTap } from './leads.js';
import { adminPage, adminCsv } from './admin.js';
import { renderMessage, renderPayPage } from './render.js';
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

app.post('/razorpay/webhook', express.raw({ type: '*/*', limit: '1mb' }), async (req, res) => {
  if (!verifyRazorpayWebhook(req.body, req.get('x-razorpay-signature'))) return res.sendStatus(400);
  let event;
  try {
    event = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.sendStatus(400);
  }
  try {
    await handleRazorpayEvent(event, req.get('x-razorpay-event-id'));
    res.sendStatus(200);
  } catch (err) {
    log.error('razorpay event failed', err, { type: event?.event });
    res.sendStatus(500);
  }
});

async function payableSite(req, res) {
  const slug = String(req.params.slug || '').toLowerCase();
  const key = req.body?.k ?? req.query.k;
  if (!billingEnabled() || !verifyPayKey(slug, key)) {
    page(res, 404, 'Link not valid', 'This payment link is not valid. Ask for a new one on WhatsApp.');
    return null;
  }
  const site = await sites.findOne({ slug });
  if (!site) page(res, 404, 'Website not found', 'This website no longer exists.');
  return site ? { site, key: String(key) } : null;
}

const paidLive = (site) => site.plan === 'paid' && accessState(site) === 'live';

app.get('/pay/:slug', rootOnly, async (req, res) => {
  const found = await payableSite(req, res);
  if (!found) return;
  const { site, key } = found;
  if (paidLive(site) && (site.billing?.autopay || !site.billing?.paidUntil)) {
    return page(res, 200, 'Your plan is active', `${site.slug}.${config.rootDomain} is live${site.billing?.autopay ? ' and renews by itself every month' : ''}. Nothing to pay right now.`);
  }
  if (!razorpayEnabled()) {
    try {
      return res.redirect(303, await createPayment(site, 'auto'));
    } catch (err) {
      log.error('checkout failed', err, { slug: site.slug });
      return page(res, 502, 'Payment unavailable', 'Payments are not available right now. Please try again in a few minutes.');
    }
  }
  const options = [{ plan: 'once', title: `Pay for 1 month`, text: `${priceLabel()}. Pay again next month when you want.`, primary: !autopayAvailable() }];
  if (autopayAvailable()) {
    options.unshift({ plan: 'auto', title: 'Autopay every month', text: `${priceLabel()}, renews by itself. Cancel anytime on WhatsApp.`, primary: true });
  }
  const note = paidLive(site) && site.billing?.paidUntil ? `Paid until ${shortDate(site.billing.paidUntil)}; paying now adds a month.` : '';
  res.set('Cache-Control', 'no-store').type('html').send(renderPayPage({ site, key, price: priceLabel(), methods: payMethods(), options, note }));
});

app.post('/pay/:slug', rootOnly, express.urlencoded({ extended: false, limit: '4kb' }), async (req, res) => {
  const found = await payableSite(req, res);
  if (!found) return;
  try {
    return res.redirect(303, await createPayment(found.site, req.body?.plan === 'auto' ? 'auto' : 'once'));
  } catch (err) {
    log.error('checkout failed', err, { slug: found.site.slug });
    return page(res, 502, 'Payment unavailable', 'Payments are not available right now. Please try again in a few minutes.');
  }
});

app.get('/paid', rootOnly, async (req, res) => {
  const q = Object.fromEntries(Object.entries(req.query).map(([k, v]) => [k, String(v)]));
  let site = null;
  try {
    if (razorpayEnabled() && verifyLinkCallback(q)) site = await confirmPaymentLink(q.razorpay_payment_link_id);
    else if (razorpayEnabled() && verifySubscriptionCallback(q)) site = await confirmSubscription(q.razorpay_subscription_id, q.razorpay_payment_id);
  } catch (err) {
    log.error('payment confirmation failed', err);
  }
  if (site?.billing?.paidUntil) {
    return page(res, 200, 'Payment received', `Thank you! ${site.slug}.${config.rootDomain} is live until ${shortDate(site.billing.paidUntil)}. A confirmation is on its way to your WhatsApp.`);
  }
  return page(res, 200, 'Thank you', 'We are confirming your payment. You will get a message on WhatsApp in a moment.');
});

app.get('/admin', rootOnly, (req, res, next) => adminPage(req, res).catch(next));
app.get('/admin/sites.csv', rootOnly, (req, res, next) => adminCsv(req, res).catch(next));

app.post('/lead', express.urlencoded({ extended: false, limit: '16kb' }), handleLead);
app.post('/t', express.text({ type: '*/*', limit: '64b' }), handleTap);

app.use(serveSite);

const SWEEP_MS = 5 * 60 * 1000;
async function sweep() {
  await sweepTrials().catch((err) => log.error('trial sweep failed', err));
  await sweepPlans().catch((err) => log.error('plan sweep failed', err));
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
