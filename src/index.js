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
  confirmCheckout,
  confirmPaymentLink,
  confirmSubscription,
  handleRazorpayEvent,
  payMethods,
  provider,
  shortDate,
  verifyPayKey,
  verifyStripeSignature,
  handleStripeEvent,
  sweepTrials,
  sweepPlans,
  accessState,
} from './billing.js';
import { plans, money, priceLabel } from './plans.js';
import { domainShopEnabled, quoteRenewal, sweepDomainRenewals, sweepOwnedDomains } from './domainshop.js';
import { distillLessons } from './lessons.js';
import { verifyRazorpayWebhook, verifyLinkCallback, verifySubscriptionCallback } from './razorpay.js';
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
const processor = () => (provider() === 'razorpay' ? 'Razorpay' : 'Stripe');
const unavailable = (res) => page(res, 502, 'Payment unavailable', 'Payments are not available right now. Please try again in a few minutes.');

app.get('/pay/:slug', rootOnly, async (req, res) => {
  const found = await payableSite(req, res);
  if (!found) return;
  const { site, key } = found;
  if (paidLive(site) && (site.billing?.autopay || !site.billing?.paidUntil)) {
    return page(res, 200, 'Your plan is active', `${site.slug}.${config.rootDomain} is live${site.billing?.autopay ? ' and renews by itself' : ''}. Nothing to pay right now.`);
  }
  const only = plans().length === 1 ? plans()[0] : null;
  if (only && provider() === 'stripe') {
    if (/whatsapp|facebookexternalhit|bot|crawler|preview/i.test(req.get('user-agent') || '')) {
      return page(res, 200, 'Keep your website online', `${site.businessName}: ${priceLabel()}. Pay securely by ${payMethods()}.`);
    }
    try {
      return res.redirect(303, await createPayment(site, { kind: 'service', plan: only.id, auto: req.query.once !== '1' }));
    } catch (err) {
      log.error('checkout failed', err, { slug: site.slug });
      return unavailable(res);
    }
  }
  const options = plans().flatMap((p) => [
    ...(autopayAvailable(p) ? [{ plan: `${p.id}-auto`, title: `${p.name} · autopay`, text: `${money(p.amount)} ${p.every}, renews by itself. Cancel anytime on WhatsApp.` }] : []),
    { plan: `${p.id}-once`, title: `${p.name} · pay once`, text: `${money(p.amount)} for ${p.days} days. No automatic charges.` },
  ]);
  options[0].primary = true;
  const until = paidLive(site) && site.billing?.paidUntil ? ` Paid until ${shortDate(site.billing.paidUntil)}; paying now adds more time.` : '';
  res
    .set('Cache-Control', 'no-store')
    .type('html')
    .send(
      renderPayPage({
        site,
        key,
        heading: 'Keep your website online',
        summary: `${site.slug}.${config.rootDomain} · ${priceLabel()}. Pay by ${payMethods()}.${until}`,
        processor: processor(),
        options,
      })
    );
});

app.get('/pay/:slug/domain', rootOnly, async (req, res) => {
  const found = await payableSite(req, res);
  if (!found) return;
  const { site, key } = found;
  if (!domainShopEnabled()) return page(res, 404, 'Not available', 'Domains are not available right now. Message us on WhatsApp.');
  let order = site.domainOrder;
  const fresh = order && !order.status && Date.now() - new Date(order.at).getTime() < 60 * 60 * 1000;
  if (!fresh && site.domain?.name) {
    if (new Date(site.domain.expiresAt).getTime() - Date.now() > 60 * 24 * 60 * 60 * 1000) {
      return page(res, 200, 'Your domain is paid', `${site.domain.name} is paid until ${shortDate(site.domain.expiresAt)}. Nothing to pay right now.`);
    }
    order = await quoteRenewal(site).catch((err) => log.warn('renewal quote failed', { error: err.message }));
  } else if (!fresh) {
    order = null;
  }
  if (!order) return page(res, 410, 'Price expired', 'This domain price has expired. Send *domain* on WhatsApp to get a fresh one.');
  res
    .set('Cache-Control', 'no-store')
    .type('html')
    .send(
      renderPayPage({
        site,
        key,
        heading: order.type === 'renew' ? 'Renew your domain' : 'Get your domain',
        summary: `${order.domain} for 1 year. Pay by ${payMethods()}.`,
        processor: processor(),
        options: [{ plan: 'domain', title: `Pay ${money(order.charge)}`, text: `${order.domain}, 1 year, set up for you automatically.`, primary: true }],
      })
    );
});

app.post('/pay/:slug', rootOnly, express.urlencoded({ extended: false, limit: '4kb' }), async (req, res) => {
  const found = await payableSite(req, res);
  if (!found) return;
  const [plan, mode] = String(req.body?.plan || '').split('-');
  try {
    const url =
      plan === 'domain'
        ? await createPayment(found.site, { kind: 'domain' })
        : await createPayment(found.site, { kind: 'service', plan, auto: mode === 'auto' });
    return res.redirect(303, url);
  } catch (err) {
    log.error('checkout failed', err, { slug: found.site.slug });
    return unavailable(res);
  }
});

app.get('/paid', rootOnly, async (req, res) => {
  const q = Object.fromEntries(Object.entries(req.query).map(([k, v]) => [k, String(v)]));
  let done = null;
  try {
    if (provider() === 'stripe' && /^cs_[A-Za-z0-9_]+$/.test(q.session_id || '')) done = await confirmCheckout(q.session_id);
    else if (provider() === 'razorpay' && verifyLinkCallback(q)) done = await confirmPaymentLink(q.razorpay_payment_link_id);
    else if (provider() === 'razorpay' && verifySubscriptionCallback(q)) done = await confirmSubscription(q.razorpay_subscription_id, q.razorpay_payment_id);
  } catch (err) {
    log.error('payment confirmation failed', err);
  }
  if (done?.kind === 'domain') {
    return page(res, 200, 'Payment received', `Thank you! We are setting up ${done.domain || 'your domain'} now. You will get a message on WhatsApp when it is live.`);
  }
  if (done?.paidUntil) {
    return page(res, 200, 'Payment received', `Thank you! ${done.site.slug}.${config.rootDomain} is live until ${shortDate(done.paidUntil)}. A confirmation is on its way to your WhatsApp.`);
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
  await sweepDomainRenewals().catch((err) => log.error('domain renewal sweep failed', err));
  await sweepOwnedDomains().catch((err) => log.error('owned domain sweep failed', err));
  await distillLessons().catch((err) => log.warn('lesson update failed', { error: err.message }));
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
