import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

process.env.WA_APP_SECRET = 'test-secret';
process.env.ROOT_DOMAIN = 'site60.in';
process.env.IMAGE_PUBLIC_BASE = 'https://img.example';
process.env.CF_ACCOUNT_ID = 'acc';
process.env.CF_AI_TOKEN = 'cf-token';
process.env.ANTHROPIC_API_KEY = 'test-anthropic';
process.env.STRIPE_SECRET_KEY = 'sk_test_x';
process.env.STRIPE_PRICE_ID = 'price_x';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
process.env.ADMIN_PASSWORD = 'pw';

const db = await import('../src/db.js');

function get(doc, path) {
  return path.split('.').reduce((v, k) => (v == null ? undefined : v[k]), doc);
}

function matches(doc, query = {}) {
  return Object.entries(query).every(([k, cond]) => {
    const v = get(doc, k);
    if (cond && typeof cond === 'object' && !(cond instanceof Date) && !(cond instanceof RegExp)) {
      if ('$exists' in cond) return cond.$exists ? v !== undefined : v === undefined;
      if ('$in' in cond) return cond.$in.includes(v);
      if ('$lte' in cond || '$gt' in cond) {
        const t = v ? new Date(v).getTime() : NaN;
        return (!('$lte' in cond) || t <= new Date(cond.$lte).getTime()) && (!('$gt' in cond) || t > new Date(cond.$gt).getTime());
      }
    }
    if (cond instanceof RegExp) return cond.test(String(v ?? ''));
    return v === cond;
  });
}

function setPath(doc, path, value) {
  const keys = path.split('.');
  let o = doc;
  for (const k of keys.slice(0, -1)) o = o[k] ??= {};
  o[keys.at(-1)] = value;
}

function applyUpdate(doc, update) {
  for (const [k, v] of Object.entries(update.$set || {})) setPath(doc, k, v);
  for (const k of Object.keys(update.$unset || {})) {
    const keys = k.split('.');
    const parent = keys.slice(0, -1).reduce((o, key) => o?.[key], doc);
    if (parent) delete parent[keys.at(-1)];
  }
  for (const [k, v] of Object.entries(update.$inc || {})) doc[k] = (doc[k] || 0) + v;
  for (const [k, v] of Object.entries(update.$push || {})) doc[k] = [...(doc[k] || []), ...(v.$each || [v])].slice(v.$slice ?? 0);
  for (const [k, v] of Object.entries(update.$pop || {})) doc[k] = v > 0 ? (doc[k] || []).slice(0, -1) : (doc[k] || []).slice(1);
  for (const [k, v] of Object.entries(update.$setOnInsert || {})) if (doc[k] === undefined) doc[k] = v;
}

function fakeCollection() {
  const docs = [];
  const cursor = (list) => {
    let out = [...list];
    const c = {
      sort(spec) {
        const [[k, dir]] = Object.entries(spec);
        out.sort((a, b) => (get(a, k) > get(b, k) ? dir : -dir));
        return c;
      },
      limit(n) {
        out = out.slice(0, n);
        return c;
      },
      toArray: async () => out,
    };
    return c;
  };
  return {
    docs,
    async findOne(q) {
      return docs.find((d) => matches(d, q)) || null;
    },
    find(q) {
      return cursor(docs.filter((d) => matches(d, q)));
    },
    async insertOne(doc) {
      if (doc._id && docs.some((d) => d._id === doc._id)) throw Object.assign(new Error('dup'), { code: 11000 });
      const stored = { _id: doc._id ?? crypto.randomUUID(), ...doc };
      docs.push(stored);
      return { insertedId: stored._id };
    },
    async replaceOne(q, doc, opts) {
      const i = docs.findIndex((d) => matches(d, q));
      if (i >= 0) docs[i] = { ...doc };
      else if (opts?.upsert) docs.push({ ...doc });
    },
    async updateOne(q, update) {
      const d = docs.find((x) => matches(x, q));
      if (d) applyUpdate(d, update);
    },
    async findOneAndUpdate(q, update, opts = {}) {
      let d = docs.find((x) => matches(x, q));
      if (!d && opts.upsert) {
        d = { ...Object.fromEntries(Object.entries(q).filter(([, v]) => typeof v !== 'object')) };
        docs.push(d);
      }
      if (d) applyUpdate(d, update);
      return d || null;
    },
    async deleteOne(q) {
      const i = docs.findIndex((d) => matches(d, q));
      if (i >= 0) docs.splice(i, 1);
    },
    aggregate: () => ({ toArray: async () => [] }),
  };
}

for (const name of ['sites', 'sessions', 'processed', 'usage', 'events', 'leads', 'designs', 'payments']) {
  Object.assign(db[name], fakeCollection());
}

function claudeStream(text) {
  const events = [
    ['message_start', { type: 'message_start', message: { id: 'm', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 5, output_tokens: 0 } } }],
    ['content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }],
    ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } }],
    ['content_block_stop', { type: 'content_block_stop', index: 0 }],
    ['message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 9 } }],
    ['message_stop', { type: 'message_stop' }],
  ];
  return new Response(events.map(([n, d]) => `event: ${n}\ndata: ${JSON.stringify(d)}\n\n`).join(''), {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });
}

const { t, LANGS, stringKeys } = await import('../src/i18n.js');
const { parseIncoming } = await import('../src/whatsapp.js');
const billing = await import('../src/billing.js');
const razorpay = await import('../src/razorpay.js');
const { parseLead } = await import('../src/leads.js');
const { summarize, bucket } = await import('../src/admin.js');
const { memoryNote, repeatsRecentFont, fingerprint } = await import('../src/memory.js');
const { normalizeDomain, dnsInstructions } = await import('../src/domains.js');
const { transcribe } = await import('../src/voice.js');
const { renderSite, SITE_SCRIPT } = await import('../src/render.js');
const { extrasHtml } = await import('../src/extras.js');
const { config } = await import('../src/config.js');

test('every language has every onboarding string', () => {
  const keys = stringKeys('en');
  for (const lang of LANGS) assert.deepEqual(stringKeys(lang).sort(), [...keys].sort(), lang);
  assert.match(t('hi', 'confirm', { name: 'X', location: 'Y', services: 'Z' }), /X[\s\S]*Y[\s\S]*Z/);
  assert.equal(t('xx', 'proceed'), t('en', 'proceed'));
});

test('parseIncoming reads voice notes and videos', () => {
  const body = {
    entry: [{ changes: [{ value: { messages: [
      { id: 'a', from: '91', type: 'audio', audio: { id: 'au1', voice: true } },
      { id: 'b', from: '91', type: 'video', video: { id: 'vi1', caption: 'shop tour' } },
    ] } }] }],
  };
  const [voice, video] = parseIncoming(body);
  assert.equal(voice.type, 'audio');
  assert.equal(voice.mediaId, 'au1');
  assert.equal(voice.voice, true);
  assert.equal(video.type, 'video');
  assert.equal(video.text, 'shop tour');
});

test('stripe webhook signatures are verified with a time window', () => {
  const raw = Buffer.from('{"id":"evt_1"}');
  const now = Date.now();
  const ts = Math.floor(now / 1000);
  const sig = crypto.createHmac('sha256', 'whsec_test').update(`${ts}.${raw}`).digest('hex');
  assert.ok(billing.verifyStripeSignature(raw, `t=${ts},v1=${sig}`, 'whsec_test', now));
  assert.ok(!billing.verifyStripeSignature(Buffer.from('{"id":"evt_2"}'), `t=${ts},v1=${sig}`, 'whsec_test', now));
  assert.ok(!billing.verifyStripeSignature(raw, `t=${ts},v1=${sig}`, 'whsec_test', now + 10 * 60 * 1000));
  assert.ok(!billing.verifyStripeSignature(raw, `t=${ts}`, 'whsec_test', now));
});

test('access state switches trials off at expiry and cancelled sites off at once', () => {
  const now = Date.now();
  assert.equal(billing.accessState({ status: 'trial', trialEndsAt: new Date(now + 1000) }, now), 'trial');
  assert.equal(billing.accessState({ status: 'trial', trialEndsAt: new Date(now - 1000) }, now), 'expired');
  assert.equal(billing.accessState({ status: 'cancelled' }, now), 'cancelled');
  assert.equal(billing.accessState({ status: 'active', plan: 'paid' }, now), 'live');
  assert.equal(billing.accessState({ status: 'active' }, now), 'live');
  assert.ok(billing.verifyPayKey('shop', new URL(billing.payLink('shop')).searchParams.get('k')));
  assert.ok(!billing.verifyPayKey('other', new URL(billing.payLink('shop')).searchParams.get('k')));
});

test('stripe events activate, then cancel and disable a site', async () => {
  const realFetch = globalThis.fetch;
  const sent = [];
  globalThis.fetch = async (url, init) => {
    sent.push({ url: String(url), body: init?.body });
    return new Response('{"messages":[{"id":"x"}]}', { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    await db.sites.insertOne({ slug: 'paidshop', ownerPhone: '919000000001', businessName: 'Paid Shop', status: 'trial', plan: 'trial', trialEndsAt: new Date(Date.now() + 3600e3) });
    await billing.handleStripeEvent({ id: 'evt_a', type: 'checkout.session.completed', data: { object: { metadata: { slug: 'paidshop' }, customer: 'cus_1', subscription: 'sub_1' } } });
    let site = await db.sites.findOne({ slug: 'paidshop' });
    assert.equal(site.status, 'active');
    assert.equal(site.plan, 'paid');
    assert.equal(bucket(site), 'paying');
    await billing.handleStripeEvent({ id: 'evt_a', type: 'checkout.session.completed', data: { object: { metadata: { slug: 'paidshop' } } } });
    await billing.handleStripeEvent({ id: 'evt_b', type: 'customer.subscription.updated', data: { object: { id: 'sub_1', status: 'active', cancel_at_period_end: true } } });
    site = await db.sites.findOne({ slug: 'paidshop' });
    assert.equal(site.status, 'cancelled');
    assert.equal(billing.accessState(site), 'cancelled');
    assert.ok(sent.some((s) => String(s.body).includes('Payment received')));
    assert.ok(sent.some((s) => String(s.body).includes('now offline')));
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('trial sweep reminds, then disables expired trials', async () => {
  const realFetch = globalThis.fetch;
  const bodies = [];
  globalThis.fetch = async (url, init) => {
    bodies.push(String(init?.body));
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const now = new Date();
    await db.sites.insertOne({ slug: 'soon', ownerPhone: '919000000002', businessName: 'Soon', status: 'trial', trialEndsAt: new Date(now.getTime() + 2 * 3600e3) });
    await db.sites.insertOne({ slug: 'gone', ownerPhone: '919000000003', businessName: 'Gone', status: 'trial', trialEndsAt: new Date(now.getTime() - 60e3) });
    await billing.sweepTrials(now);
    assert.equal((await db.sites.findOne({ slug: 'gone' })).status, 'expired');
    assert.ok((await db.sites.findOne({ slug: 'soon' })).billing.reminderAt);
    assert.ok(bodies.some((b) => b.includes('goes offline in a few hours')));
    assert.ok(bodies.some((b) => b.includes('free trial has ended')));
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('leads need a name and phone and drop bots', () => {
  assert.deepEqual(parseLead({ name: ' Ravi ', phone: '+91 98765-43210', message: 'Need a 2 BHK' }), { name: 'Ravi', phone: '+919876543210', message: 'Need a 2 BHK' });
  assert.equal(parseLead({ name: 'Bot', phone: '9876543210', website: 'spam.com' }), null);
  assert.equal(parseLead({ name: 'Ravi', phone: '12' }), null);
});

test('admin summary counts paying, trial, unpaid demos and cancellations', () => {
  const now = Date.now();
  const list = [
    { status: 'active', plan: 'paid', trialEndsAt: new Date(now - 1), billing: { paidAt: new Date() } },
    { status: 'trial', trialEndsAt: new Date(now + 1e6) },
    { status: 'trial', trialEndsAt: new Date(now - 1e6) },
    { status: 'expired', trialEndsAt: new Date(now - 1e6) },
    { status: 'cancelled', trialEndsAt: new Date(now - 1e6), billing: { paidAt: new Date() } },
    { status: 'active' },
  ];
  const c = summarize(list, now);
  assert.equal(c.paying, 1);
  assert.equal(c.trial, 1);
  assert.equal(c.unpaid, 2);
  assert.equal(c.cancelled, 1);
  assert.equal(c.free, 1);
  assert.equal(c.conversion, 40);
});

test('design memory steers away from recently used fonts and colours', () => {
  const memory = {
    recent: [{ displayFont: 'Fraunces', bodyFont: 'Inter', accent: '#b4532a', concept: 'Warm brick' }],
    liked: [{ concept: 'Calm trust', mode: 'light', accent: '#14532d', displayFont: 'Sora', bodyFont: 'Inter' }],
    rejected: [{ concept: 'Neon party' }],
  };
  const note = memoryNote(memory);
  assert.match(note, /Fraunces/);
  assert.match(note, /#b4532a/);
  assert.match(note, /Calm trust/);
  assert.match(note, /Neon party/);
  assert.ok(repeatsRecentFont({ fonts: { display: { family: 'fraunces' } } }, memory));
  assert.ok(!repeatsRecentFont({ fonts: { display: { family: 'Syne' } } }, memory));
  const fp = fingerprint(
    { fonts: { display: { family: 'A' }, body: { family: 'B' } }, palette: { accent: '#111111', dominant: '#222222' }, mode: 'dark', concept: 'c', seed: { archetype: 'Swiss', heroLayout: 'split' } },
    { manifest: { button_style: 'fill sweep', signature_detail: 'steam' } }
  );
  assert.equal(fp.displayFont, 'A');
  assert.equal(fp.dominant, '#222222');
  assert.equal(fp.seed.archetype, 'Swiss');
  assert.equal(fp.buttonStyle, 'fill sweep');
  assert.equal(fp.signature, 'steam');
});

test('art direction retries once when it repeats a recent font', async () => {
  const { createArtDirection } = await import('../src/generate.js');
  const realFetch = globalThis.fetch;
  const replies = [{ concept: 'one', fonts: { display: { family: 'Fraunces' } } }, { concept: 'two', fonts: { display: { family: 'Syne' } } }];
  const prompts = [];
  globalThis.fetch = async (url, init) => {
    prompts.push(JSON.parse(init.body).messages[0].content);
    return claudeStream(JSON.stringify(replies.shift()));
  };
  try {
    const brief = await createArtDirection({ businessName: 'Bakes', category: 'Bakery', slug: 'bakes' }, { recent: [{ displayFont: 'Fraunces' }] });
    assert.equal(brief.concept, 'two');
    assert.equal(prompts.length, 2);
    assert.match(prompts[0], /DESIGN SEED \(mandatory\)/);
    assert.match(prompts[0], /RECENTLY USED DESIGNS/);
    assert.match(prompts[1], /display font Fraunces was already used/);
    assert.ok(brief.seed.archetype && brief.seed.heroLayout && brief.seed.motion);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('domains are normalised and get clear DNS steps', () => {
  assert.equal(normalizeDomain('https://www.GuruKirpa.com/'), 'gurukirpa.com');
  assert.equal(normalizeDomain('shop.site60.in'), null);
  assert.equal(normalizeDomain('not a domain'), null);
  assert.match(dnsInstructions('gurukirpa.com'), /216\.24\.57\.1/);
});

test('voice notes fall back from Cloudflare to Gemini', async () => {
  const realFetch = globalThis.fetch;
  config.gemini.apiKey = 'g';
  const hits = [];
  globalThis.fetch = async (url) => {
    hits.push(String(url));
    if (String(url).includes('cloudflare')) return new Response('boom', { status: 500 });
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Guru Kirpa Properties in Amritsar' }] } }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  try {
    assert.equal(await transcribe(Buffer.from('ogg'), 'audio/ogg; codecs=opus', 'pa'), 'Guru Kirpa Properties in Amritsar');
    assert.equal(hits.length, 2);
  } finally {
    globalThis.fetch = realFetch;
    config.gemini.apiKey = '';
  }
});

test('every site gets the enquiry form, videos and tap tracking', () => {
  const site = { slug: 'shop', businessName: 'Shop', phone: '919876543210', language: 'hi', photos: [], videos: [{ url: 'https://img.example/v/a.mp4' }] };
  const html = renderSite(site);
  assert.ok(html.includes('action="/lead"'));
  assert.ok(html.includes('पूछताछ भेजें'));
  assert.ok(html.includes('<video controls'));
  assert.ok(SITE_SCRIPT.includes('sendBeacon("/t"'));
  assert.ok(!extrasHtml({ slug: 's', videos: [] }).includes('<video'));
});

test('a voice-note customer gets an acknowledgement before any website is built', async () => {
  const realFetch = globalThis.fetch;
  const sent = [];
  const extracted = {
    allowed: true,
    businessName: 'Guru Kirpa Properties',
    category: 'Real Estate Agent',
    city: 'Amritsar',
    area: 'Ranjit Avenue',
    tagline: 'Homes found with care',
    description: 'We help families buy, sell and rent homes.',
    services: ['Buying', 'Selling', 'Renting'],
    theme: 'forest',
    slugHint: 'gurukirpa',
    imagePrompts: [],
    language: 'pa',
  };
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    if (u.includes('/messages') && u.includes('graph.facebook.com')) {
      sent.push(JSON.parse(init.body));
      return new Response('{"messages":[{"id":"w"}]}', { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (u.includes('graph.facebook.com')) {
      return new Response(JSON.stringify({ url: 'https://media.example/voice', mime_type: 'audio/ogg', file_size: 10 }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (u.startsWith('https://media.example')) return new Response(Buffer.from('ogg-bytes'), { status: 200 });
    if (u.includes('whisper')) {
      return new Response(JSON.stringify({ result: { text: 'Guru Kirpa Properties, Ranjit Avenue Amritsar, buying selling renting' } }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (u.includes('api.anthropic.com')) return claudeStream(JSON.stringify(extracted));
    throw new Error(`unexpected fetch ${u}`);
  };
  const { handleMessage } = await import('../src/bot.js');
  const from = '919811111111';
  const say = (m) => handleMessage({ id: crypto.randomUUID(), from, name: 'Param', type: 'text', text: '', ...m });
  const last = () => sent.at(-1);
  const lastText = () => last()?.text?.body || last()?.interactive?.body?.text || '';
  const buttons = () => (last()?.interactive?.action?.buttons || []).map((b) => b.reply.id);
  try {
    await say({ text: 'Hi' });
    assert.deepEqual(buttons(), ['lang_en', 'lang_hi', 'lang_pa']);
    await say({ type: 'button', buttonId: 'lang_pa', text: 'ਪੰਜਾਬੀ' });
    assert.deepEqual(buttons(), ['mode_text', 'mode_voice']);
    assert.match(lastText(), /ਕਾਰੋਬਾਰ/);
    await say({ type: 'button', buttonId: 'mode_voice' });
    assert.match(lastText(), /ਵੌਇਸ ਨੋਟ/);
    await say({ type: 'audio', mediaId: 'au1' });
    assert.match(lastText(), /Guru Kirpa Properties/);
    assert.match(lastText(), /Ranjit Avenue, Amritsar/);
    assert.match(lastText(), /Buying, Selling, Renting/);
    assert.deepEqual(buttons(), ['proceed', 'redo_voice']);
    assert.equal(db.sites.docs.filter((d) => d.ownerPhone === from).length, 0);
    await say({ type: 'button', buttonId: 'proceed' });
    assert.deepEqual(buttons(), ['style_basic', 'style_pro']);
    await say({ type: 'button', buttonId: 'style_basic' });
    assert.deepEqual(buttons(), ['no_photos']);
    await say({ type: 'button', buttonId: 'no_photos' });
    assert.deepEqual(buttons(), ['slug_ok', 'slug_change']);
    await say({ type: 'button', buttonId: 'slug_ok' });
    const site = db.sites.docs.find((d) => d.ownerPhone === from);
    assert.equal(site.businessName, 'Guru Kirpa Properties');
    assert.equal(site.language, 'pa');
    assert.equal(site.status, 'trial');
    assert.ok(new Date(site.trialEndsAt) > new Date());
    assert.match(lastText(), /free for 24 hours/);
    assert.match(lastText(), /\/pay\//);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('typed answers can be corrected, and live voice edits are confirmed first', async () => {
  const realFetch = globalThis.fetch;
  const sent = [];
  const anthropicBodies = [];
  let extracted = {
    allowed: true, businessName: 'Sweet Crumbs', category: 'Home Bakery', city: 'Ludhiana', area: '',
    tagline: 'Fresh cakes', description: 'Cakes made at home.', services: ['Cakes'], theme: 'rose', slugHint: 'sweetcrumbs', imagePrompts: [], language: 'en',
  };
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    if (u.includes('/messages') && u.includes('graph.facebook.com')) {
      sent.push(JSON.parse(init.body));
      return new Response('{"messages":[{"id":"w"}]}', { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (u.includes('graph.facebook.com')) {
      return new Response(JSON.stringify({ url: 'https://media.example/v', mime_type: 'audio/ogg', file_size: 10 }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (u.startsWith('https://media.example')) return new Response(Buffer.from('ogg'), { status: 200 });
    if (u.includes('whisper')) return new Response(JSON.stringify({ result: { text: 'make the colours dark blue' } }), { status: 200, headers: { 'content-type': 'application/json' } });
    if (u.includes('api.anthropic.com')) {
      anthropicBodies.push(JSON.parse(init.body).messages[0].content);
      return claudeStream(JSON.stringify(extracted));
    }
    throw new Error(`unexpected fetch ${u}`);
  };
  const { handleMessage } = await import('../src/bot.js');
  const from = '919822222222';
  const say = (m) => handleMessage({ id: crypto.randomUUID(), from, name: 'Avneet', type: 'text', text: '', ...m });
  const last = () => sent.at(-1);
  const lastText = () => last()?.text?.body || last()?.interactive?.body?.text || '';
  const buttons = () => (last()?.interactive?.action?.buttons || []).map((b) => b.reply.id);
  try {
    await say({ text: 'hello' });
    await say({ type: 'button', buttonId: 'lang_en' });
    await say({ type: 'button', buttonId: 'mode_text' });
    assert.match(lastText(), /business name/);
    await say({ text: 'Sweet Crumbs' });
    assert.match(lastText(), /city and area/);
    await say({ text: 'Ludhiana' });
    assert.match(lastText(), /services or products/);
    await say({ text: 'cakes' });
    assert.match(anthropicBodies.at(-1), /Business name: Sweet Crumbs[\s\S]*Location: Ludhiana[\s\S]*Services or products: cakes/);
    assert.deepEqual(buttons(), ['proceed', 'redo_text']);
    extracted = { ...extracted, services: ['Cakes', 'Cupcakes'] };
    await say({ text: 'we also make cupcakes' });
    assert.match(anthropicBodies.at(-1), /Correction from the owner: we also make cupcakes/);
    assert.match(lastText(), /Cakes, Cupcakes/);
    await say({ type: 'button', buttonId: 'proceed' });
    await say({ type: 'button', buttonId: 'style_basic' });
    await say({ type: 'button', buttonId: 'no_photos' });
    await say({ type: 'button', buttonId: 'slug_ok' });
    const site = db.sites.docs.find((d) => d.ownerPhone === from);
    assert.deepEqual(site.services, ['Cakes', 'Cupcakes']);
    const calls = anthropicBodies.length;
    await say({ type: 'audio', mediaId: 'au2' });
    assert.match(lastText(), /make the colours dark blue/);
    assert.deepEqual(buttons(), ['apply_edit', 'cancel_edit']);
    assert.equal(anthropicBodies.length, calls);
    await say({ type: 'button', buttonId: 'cancel_edit' });
    assert.match(lastText(), /nothing changed/);
    assert.equal(anthropicBodies.length, calls);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('demo mode: trials without payment, owner asks to keep it, admin extends and activates', async () => {
  const saved = { ...config.billing };
  config.billing.stripeSecret = '';
  config.billing.priceId = '';
  config.billing.trialsWithoutPayment = true;
  config.adminNumbers.push('919999900000');
  const realFetch = globalThis.fetch;
  const sent = [];
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    if (u.includes('graph.facebook.com')) {
      sent.push(JSON.parse(init.body));
      return new Response('{"messages":[{"id":"w"}]}', { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (u.includes('api.anthropic.com')) {
      return claudeStream(JSON.stringify({ allowed: true, businessName: 'Demo Cafe', category: 'Cafe', city: 'Mohali', services: ['Coffee'], slugHint: 'democafe', language: 'en' }));
    }
    throw new Error(`unexpected fetch ${u}`);
  };
  const { handleMessage } = await import('../src/bot.js');
  const owner = '919833333333';
  const admin = '919999900000';
  const say = (from, m) => handleMessage({ id: crypto.randomUUID(), from, name: 'X', type: 'text', text: '', ...m });
  const textTo = (to) => sent.filter((m) => m.to === to).map((m) => m.text?.body || m.interactive?.body?.text || '').at(-1) || '';
  try {
    await say(owner, { text: 'hi' });
    await say(owner, { type: 'button', buttonId: 'lang_en' });
    await say(owner, { type: 'button', buttonId: 'mode_text' });
    await say(owner, { text: 'Demo Cafe' });
    await say(owner, { text: 'Mohali' });
    await say(owner, { text: 'coffee' });
    await say(owner, { type: 'button', buttonId: 'proceed' });
    await say(owner, { type: 'button', buttonId: 'style_basic' });
    await say(owner, { type: 'button', buttonId: 'no_photos' });
    await say(owner, { type: 'button', buttonId: 'slug_ok' });
    const site = db.sites.docs.find((d) => d.ownerPhone === owner);
    assert.equal(site.status, 'trial');
    assert.match(textTo(owner), /free for 24 hours/);
    assert.match(textTo(owner), /keep it/);
    assert.doesNotMatch(textTo(owner), /\/pay\//);

    await say(owner, { text: 'keep it' });
    assert.match(textTo(owner), /Our team will contact you/);
    assert.match(textTo(admin), new RegExp(`activate ${site.slug}`));

    await say(admin, { text: `extend ${site.slug} 2` });
    assert.match(textTo(admin), /ends in 2 hours/);
    assert.ok(new Date(site.trialEndsAt) - Date.now() < 2.1 * 3600e3);

    await say(admin, { text: `activate ${site.slug}` });
    assert.equal(site.status, 'active');
    assert.equal(site.plan, 'paid');
    assert.equal(billing.accessState(site), 'live');
    assert.match(textTo(owner), /activated/);

    await say(admin, { text: `pause ${site.slug}` });
    assert.equal(billing.accessState(site), 'expired');
  } finally {
    globalThis.fetch = realFetch;
    Object.assign(config.billing, saved);
    config.adminNumbers.pop();
  }
});

test('design rules reject banned fonts, weak contrast, plain greys, indigo and repeated hues', async () => {
  const { briefIssues, contrast, pickSeed, ARCHETYPES } = await import('../src/designrules.js');
  const clean = { fonts: { display: { family: 'Syne' } }, palette: { bg: '#f6f1e7', ink: '#1f1a14', accent: '#b4532a', onAccent: '#ffffff' } };
  assert.deepEqual(briefIssues(clean, { recent: [] }), []);
  assert.ok(contrast('#000000', '#ffffff') > 20);
  const join = (b, m = { recent: [] }) => briefIssues(b, m).join(' | ');
  assert.match(join({ ...clean, fonts: { display: { family: 'Poppins' } } }), /not allowed as the display font/);
  assert.match(join({ ...clean, palette: { ...clean.palette, ink: '#cfc6b8' } }), /must be at least 4\.5:1/);
  assert.match(join({ ...clean, palette: { ...clean.palette, bg: '#eeeeee' } }), /plain grey/);
  assert.match(join({ ...clean, palette: { ...clean.palette, accent: '#6366f1' } }), /tech indigo/);
  assert.match(join({ ...clean, palette: { ...clean.palette, bg: '#ffffff', ink: '#000000' } }), /pure black on pure white/);
  assert.match(join(clean, { recent: [{ accent: '#c0582f' }] }), /same hue family/);
  const recent = Array.from({ length: 6 }, () => ({ seed: { archetype: ARCHETYPES[0] } }));
  for (let i = 0; i < 20; i++) assert.notEqual(pickSeed({ recent }).archetype, ARCHETYPES[0]);
});

test('page manifest is parsed, and sound and cursor hooks survive the sanitizer', async () => {
  const { parseEdit, sanitizeBody } = await import('../src/generate.js');
  const { ENHANCE_SCRIPT } = await import('../src/enhance.js');
  const css = 'h1{color:red}\n'.repeat(250);
  const body = '<div><a href="{{wa}}">{{name}}</a>' + '<p>text</p>'.repeat(400) + '</div>';
  const meta = { themeColor: '#123456', fonts: [], manifest: { style_archetype: 'Newsprint', palette: { dominant: '#123456', supporting: ['#abcdef', 'bad'], accent: '#ff5500', neutral: '#f4efe6' }, display_font: 'Syne', body_font: 'Figtree', hero_layout: 'poster', button_style: 'fill sweep', signature_detail: 'ink splash', sound: true } };
  const out = parseEdit(`===SUMMARY===\nok\n===DATA===\n{}\n===IMAGES===\n[]\n===META===\n${JSON.stringify(meta)}\n===CSS===\n${css}\n===BODY===\n${body}\n===END===`);
  assert.equal(out.page.manifest.style_archetype, 'Newsprint');
  assert.deepEqual(out.page.manifest.palette.supporting, ['#abcdef']);
  assert.equal(out.page.manifest.sound, true);
  const html = sanitizeBody('<button data-sound-toggle aria-pressed="false">Sound</button><span data-cursor></span><a data-sound="chime" href="#x">x</a>');
  assert.ok(html.includes('data-sound-toggle') && html.includes('data-cursor') && html.includes('data-sound="chime"'));
  assert.ok(ENHANCE_SCRIPT.includes('[data-sound-toggle]') && ENHANCE_SCRIPT.includes('[data-cursor]') && ENHANCE_SCRIPT.includes('AudioContext'));
});

test('every site gets a favicon with its business-class icon in its brand colour', async () => {
  const { INDUSTRIES } = await import('../src/industry.js');
  const svgOf = (html) => decodeURIComponent(html.match(/data:image\/svg\+xml,([^"]+)/)[1]);
  const clinic = svgOf(renderSite({ slug: 'c', businessName: 'Dr Mehta', category: 'Doctor', phone: '919876543210', photos: [], theme: 'ocean' }));
  const bakery = svgOf(renderSite({ slug: 'b', businessName: 'Sweet Crumbs', category: 'Home Bakery', phone: '919876543210', photos: [], theme: 'rose' }));
  assert.ok(clinic.includes('M9 3h6v6h6v6h-6v6H9v-6H3V9h6z'), 'medical cross');
  assert.ok(bakery.includes('M5 21v-8h14v8'), 'cake');
  assert.ok(INDUSTRIES.every((i) => i.imagery.length === 4));
});

test('businesses map to the right class, and unknown ones to the closest class', async () => {
  const { classifyIndustry } = await import('../src/industry.js');
  const cases = {
    Doctor: 'healthcare', Medico: 'healthcare', 'Skin care clinic': 'healthcare', 'Dental clinic': 'dental',
    'Real Estate Agent': 'real-estate', 'Home Bakery': 'bakery', 'Study Room': 'education', 'Unisex Salon': 'beauty',
    'Gold Jewellers': 'jewellery', 'Car service': 'automotive', 'AC repair': 'home-services', 'Tea stall': 'restaurant',
  };
  for (const [category, id] of Object.entries(cases)) assert.equal(classifyIndustry({ category }).id, id, category);
  assert.equal(classifyIndustry({ category: 'Pet grooming' }).id, 'beauty');
  assert.equal(classifyIndustry({ category: 'Something unusual' }).id, 'general');
  assert.equal(classifyIndustry({ category: 'Team building', description: 'our team' }).id, 'general');
});

test('seeds stay within the themes that suit the business class', async () => {
  const { pickSeed } = await import('../src/designrules.js');
  const { classifyIndustry } = await import('../src/industry.js');
  const clinic = classifyIndustry({ category: 'Doctor' });
  for (let i = 0; i < 30; i++) {
    const seed = pickSeed(null, Math.random, clinic);
    assert.ok(clinic.archetypes.some((a) => seed.archetype.startsWith(a)), seed.archetype);
    assert.ok(clinic.moods.includes(seed.colorMood), seed.colorMood);
    assert.ok(clinic.motions.some((m) => seed.motion.startsWith(m)), seed.motion);
  }
});

test('owner photos come first, and are always shown even if the AI page forgot the gallery', async () => {
  const { buildData } = await import('../src/generate.js');
  const { renderAdvanced } = await import('../src/advanced.js');
  const pic = (n, extra = {}) => ({ lg: `https://img.example/${n}-lg.webp`, sm: `https://img.example/${n}-sm.webp`, w: 1200, h: 800, ...extra });
  const site = {
    slug: 'clinic', businessName: 'Dr Mehta', category: 'Doctor', phone: '919876543210', ownerPhone: '919876543210',
    photos: [pic('own1')],
    aiImages: [pic('band', { slot: 2, stock: true }), pic('detail', { slot: 3, ai: true })],
  };
  const d = buildData(site, { formatPhone: (x) => x });
  assert.equal(d.scalars.hero_src, 'https://img.example/own1-lg.webp');
  assert.equal(d.scalars.img3_src, 'https://img.example/band-lg.webp');
  assert.equal(d.scalars.img4_src, 'https://img.example/detail-lg.webp');
  const body = '<div class="nav"><a href="{{wa}}">{{name}}</a></div><section id="cta"><a href="{{tel}}">Call</a></section>' + '<p>copy</p>'.repeat(400);
  const html = renderAdvanced({ ...site, style: 'advanced', design: {}, page: { themeColor: '#2a6f5b', fonts: '', css: 'p{}', body } });
  assert.ok(html.includes('id="gallery"') && html.includes('own1-sm.webp') && html.includes('data-i="0"'));
  assert.ok(html.includes('id="lb"'));
});

test('slots covered by owner photos are not re-sourced', async () => {
  const { sourceSiteImages } = await import('../src/photos.js');
  const realFetch = globalThis.fetch;
  const sharp = (await import('sharp')).default;
  const jpeg = await sharp({ create: { width: 32, height: 24, channels: 3, background: '#468' } }).jpeg().toBuffer();
  let aiCalls = 0;
  globalThis.fetch = async (url) => {
    if (String(url).includes('/ai/run/')) {
      aiCalls++;
      return new Response(JSON.stringify({ result: { image: jpeg.toString('base64') } }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    throw new Error(`unexpected fetch ${url}`);
  };
  try {
    await sourceSiteImages({ prompts: ['a', 'b', 'c', 'd'], ownerPhone: '91', skip: [0, 1] }).catch(() => []);
    assert.equal(aiCalls, 2);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('the photo editor sees stock and AI candidates as images and its picks are used', async () => {
  const sharp = (await import('sharp')).default;
  const jpeg = await sharp({ create: { width: 64, height: 48, channels: 3, background: '#a85' } }).jpeg().toBuffer();
  const { sourceSiteImages } = await import('../src/photos.js');
  const { creditsHtml } = await import('../src/extras.js');
  config.images.pexelsKey = 'p';
  config.images.unsplashKey = 'u';
  const realFetch = globalThis.fetch;
  let pickRequest = null;
  const pinged = [];
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    const json = (o) => new Response(JSON.stringify(o), { status: 200, headers: { 'content-type': 'application/json' } });
    if (u.startsWith('https://api.pexels.com')) {
      return json({ photos: [1, 2].map((n) => ({ alt: 'house', photographer: `P${n}`, photographer_url: 'https://pexels.com/@p', src: { medium: 'https://px.example/t.jpg', large2x: 'https://px.example/l.jpg' } })) });
    }
    if (u.startsWith('https://api.unsplash.com/search')) {
      return json({ results: [1, 2].map((n) => ({ alt_description: 'villa', urls: { small: 'https://un.example/s.jpg', raw: `https://images.unsplash.com/photo-${n}?ixid=x` }, links: { download_location: `https://api.unsplash.com/photos/${n}/download` }, user: { name: `U${n}`, links: { html: 'https://unsplash.com/@u' } } })) });
    }
    if (u.startsWith('https://api.unsplash.com/photos/')) {
      pinged.push(u);
      return json({});
    }
    if (u.startsWith('https://px.example') || u.startsWith('https://un.example')) return new Response(jpeg, { status: 200 });
    if (u.includes('/ai/run/')) return json({ result: { image: jpeg.toString('base64') } });
    if (u.includes('api.anthropic.com')) {
      pickRequest = JSON.parse(init.body);
      return claudeStream(JSON.stringify({ picks: [1, 2, 3, 4].map((slot) => ({ slot, choice: `${slot}C`, why: 'fits' })) }));
    }
    throw new Error(`unexpected fetch ${u}`);
  };
  try {
    const images = await sourceSiteImages({
      prompts: ['hero house', 'portrait', 'band', 'detail'],
      queries: ['indian house', 'living room', 'street', 'keys'],
      context: { business: { name: 'Guru Kirpa' } },
      ownerPhone: '919800000000',
    });
    const content = pickRequest.messages[0].content;
    assert.equal(content.filter((c) => c.type === 'image').length, 20);
    assert.ok(content.some((c) => c.type === 'text' && c.text.includes('Candidate 1E (AI image)')));
    assert.equal(images.length, 4);
    assert.ok(images.every((x) => x.stock && x.credit.source === 'Unsplash' && x.lg.startsWith('https://images.unsplash.com/photo-1')));
    assert.match(images[0].lg, /w=1200&h=800&fit=crop/);
    assert.equal(pinged.length, 4);
    const credits = creditsHtml(images);
    assert.match(credits, /Photos by <a [^>]+>U1<\/a> on <a [^>]+>Unsplash<\/a>/);
    assert.doesNotMatch(credits, /AI-generated/);
  } finally {
    globalThis.fetch = realFetch;
    config.images.pexelsKey = '';
    config.images.unsplashKey = '';
  }
});

test('the better Cloudflare model is tried first and falls back to FLUX when refused', async () => {
  const images = await import('../src/images.js');
  const sharp = (await import('sharp')).default;
  const png = await sharp({ create: { width: 300, height: 200, channels: 3, background: '#468' } }).png().toBuffer();
  config.cf.accountId = 'acc';
  config.cf.apiToken = 'tok';
  const saved = config.images.cfModels;
  config.images.cfModels = ['@cf/leonardo/lucid-origin', '@cf/black-forest-labs/flux-1-schnell'];
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ model: String(url).split('/run/')[1], body });
    if (String(url).includes('lucid-origin')) return new Response('{"errors":[{"message":"bad input"}]}', { status: 400 });
    return new Response(JSON.stringify({ result: { image: png.toString('base64') } }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const buffer = await images.aiImageBuffer('a clinic', 0);
    assert.ok(buffer.length > 0);
    assert.equal(calls[0].model, '@cf/leonardo/lucid-origin');
    assert.equal(calls[0].body.width, 1536);
    assert.equal(calls[1].model, '@cf/black-forest-labs/flux-1-schnell');
    assert.equal(calls[1].body.width, undefined);
    await images.aiImageBuffer('again', 0);
    assert.equal(calls.filter((c) => c.model.includes('lucid')).length, 1, 'refused model is paused');
  } finally {
    globalThis.fetch = realFetch;
    config.images.cfModels = saved;
    config.cf.accountId = '';
    config.cf.apiToken = '';
  }
});

function withRazorpay(routes) {
  const saved = { ...config.razorpay };
  Object.assign(config.razorpay, { keyId: 'rzp_test_k', keySecret: 'rzp_secret', webhookSecret: 'rzp_hook', planId: 'plan_m' });
  const realFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    calls.push({ url: u, method: init?.method || 'GET', body: init?.body ? String(init.body) : '' });
    const hit = Object.entries(routes).find(([k]) => u.includes(k));
    const body = hit ? (typeof hit[1] === 'function' ? hit[1](u, init) : hit[1]) : { messages: [{ id: 'x' }] };
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  return {
    calls,
    restore() {
      globalThis.fetch = realFetch;
      Object.assign(config.razorpay, saved);
    },
  };
}

test('razorpay webhook and checkout callback signatures are checked', () => {
  const raw = Buffer.from('{"event":"payment_link.paid"}');
  const sig = crypto.createHmac('sha256', 'rzp_hook').update(raw).digest('hex');
  assert.ok(razorpay.verifyRazorpayWebhook(raw, sig, 'rzp_hook'));
  assert.ok(!razorpay.verifyRazorpayWebhook(Buffer.from('{"event":"x"}'), sig, 'rzp_hook'));
  assert.ok(!razorpay.verifyRazorpayWebhook(raw, sig, ''));
  assert.ok(!razorpay.verifyRazorpayWebhook(raw, 'abc', 'rzp_hook'));

  const q = { razorpay_payment_link_id: 'plink_1', razorpay_payment_link_reference_id: 'shop-1', razorpay_payment_link_status: 'paid', razorpay_payment_id: 'pay_1' };
  q.razorpay_signature = crypto.createHmac('sha256', 'rzp_secret').update('plink_1|shop-1|paid|pay_1').digest('hex');
  assert.ok(razorpay.verifyLinkCallback(q, 'rzp_secret'));
  assert.ok(!razorpay.verifyLinkCallback({ ...q, razorpay_payment_link_status: 'created' }, 'rzp_secret'));
  const sq = { razorpay_payment_id: 'pay_2', razorpay_subscription_id: 'sub_9' };
  sq.razorpay_signature = crypto.createHmac('sha256', 'rzp_secret').update('pay_2|sub_9').digest('hex');
  assert.ok(razorpay.verifySubscriptionCallback(sq, 'rzp_secret'));
  assert.ok(!razorpay.verifySubscriptionCallback({ ...sq, razorpay_subscription_id: 'sub_8' }, 'rzp_secret'));
});

test('one-month payments are confirmed with razorpay, counted once and stack', async () => {
  const links = {
    plink_1: { id: 'plink_1', status: 'paid', amount_paid: config.billing.amount, currency: 'INR', notes: { slug: 'upishop' }, payments: [{ payment_id: 'pay_1', status: 'captured' }] },
    plink_2: { id: 'plink_2', status: 'paid', amount_paid: config.billing.amount, currency: 'INR', notes: { slug: 'upishop' }, payments: [{ payment_id: 'pay_2', status: 'captured' }] },
    plink_low: { id: 'plink_low', status: 'paid', amount_paid: 100, currency: 'INR', notes: { slug: 'upishop' }, payments: [{ payment_id: 'pay_low', status: 'captured' }] },
    plink_open: { id: 'plink_open', status: 'created', amount_paid: 0, currency: 'INR', notes: { slug: 'upishop' }, payments: [] },
  };
  const rz = withRazorpay({ '/payment_links/': (u) => links[u.split('/').pop()] });
  try {
    await db.sites.insertOne({ slug: 'upishop', ownerPhone: '919000000011', businessName: 'UPI Shop', status: 'trial', plan: 'trial', trialEndsAt: new Date(Date.now() + 3600e3) });
    const event = (id) => ({ event: 'payment_link.paid', payload: { payment_link: { entity: { id } } } });

    await billing.handleRazorpayEvent(event('plink_open'), 'e0');
    await billing.handleRazorpayEvent(event('plink_low'), 'e1');
    assert.equal((await db.sites.findOne({ slug: 'upishop' })).status, 'trial');

    await billing.handleRazorpayEvent(event('plink_1'), 'e2');
    let site = await db.sites.findOne({ slug: 'upishop' });
    assert.equal(site.status, 'active');
    assert.equal(site.plan, 'paid');
    const first = new Date(site.billing.paidUntil).getTime();
    assert.ok(Math.abs(first - (Date.now() + 30 * 864e5)) < 60e3);
    assert.equal(billing.accessState(site), 'live');
    assert.equal(bucket(site), 'paying');

    await billing.handleRazorpayEvent(event('plink_1'), 'e3');
    await billing.confirmPaymentLink('plink_1');
    site = await db.sites.findOne({ slug: 'upishop' });
    assert.equal(new Date(site.billing.paidUntil).getTime(), first);

    await billing.handleRazorpayEvent(event('plink_2'), 'e4');
    site = await db.sites.findOne({ slug: 'upishop' });
    assert.ok(Math.abs(new Date(site.billing.paidUntil).getTime() - (first + 30 * 864e5)) < 5e3);
    assert.equal(rz.calls.filter((c) => c.body.includes('Payment received')).length, 2);
    assert.ok(await db.payments.findOne({ _id: 'pay_1' }));
    assert.ok(!(await db.payments.findOne({ _id: 'pay_low' })));
  } finally {
    rz.restore();
  }
});

test('payment links carry the price, the site and are reused while open', async () => {
  const rz = withRazorpay({ '/payment_links': { id: 'plink_new', short_url: 'https://rzp.io/i/abc' }, '/subscriptions': { id: 'sub_new', short_url: 'https://rzp.io/i/sub' } });
  try {
    await db.sites.insertOne({ slug: 'linkshop', ownerPhone: '919000000012', businessName: 'Link Shop', status: 'trial', plan: 'trial', trialEndsAt: new Date(Date.now() + 3600e3) });
    let site = await db.sites.findOne({ slug: 'linkshop' });
    assert.equal(await billing.createPayment(site, 'once'), 'https://rzp.io/i/abc');
    const made = JSON.parse(rz.calls.find((c) => c.url.endsWith('/payment_links')).body);
    assert.equal(made.amount, config.billing.amount);
    assert.equal(made.currency, 'INR');
    assert.equal(made.notes.slug, 'linkshop');
    assert.equal(made.accept_partial, false);
    site = await db.sites.findOne({ slug: 'linkshop' });
    assert.equal(await billing.createPayment(site, 'once'), 'https://rzp.io/i/abc');
    assert.equal(rz.calls.filter((c) => c.url.endsWith('/payment_links')).length, 1);
    assert.equal(await billing.createPayment(site, 'auto'), 'https://rzp.io/i/sub');
    assert.equal(JSON.parse(rz.calls.find((c) => c.url.endsWith('/subscriptions')).body).plan_id, 'plan_m');
    assert.equal(billing.payMethods(), 'UPI, card or Apple Pay');
  } finally {
    rz.restore();
  }
});

test('autopay subscriptions keep a site live, a stopped mandate is reported', async () => {
  const end = Math.floor(Date.now() / 1000) + 30 * 86400;
  const subs = {
    sub_ok: { id: 'sub_ok', plan_id: 'plan_m', status: 'active', current_end: end, notes: { slug: 'autoshop' } },
    sub_bad: { id: 'sub_bad', plan_id: 'plan_cheap', status: 'active', current_end: end, notes: { slug: 'autoshop' } },
  };
  const rz = withRazorpay({ '/subscriptions/': (u) => subs[u.split('/').pop()] });
  try {
    await db.sites.insertOne({ slug: 'autoshop', ownerPhone: '919000000013', businessName: 'Auto Shop', status: 'trial', plan: 'trial', trialEndsAt: new Date(Date.now() + 3600e3) });
    const ev = (name, id, pay) => ({ event: name, payload: { subscription: { entity: { id } }, ...(pay ? { payment: { entity: { id: pay } } } : {}) } });

    await billing.handleRazorpayEvent(ev('subscription.activated', 'sub_bad'), 's0');
    assert.equal((await db.sites.findOne({ slug: 'autoshop' })).status, 'trial');

    await billing.handleRazorpayEvent(ev('subscription.activated', 'sub_ok', 'pay_a'), 's1');
    await billing.handleRazorpayEvent(ev('subscription.charged', 'sub_ok', 'pay_a'), 's2');
    let site = await db.sites.findOne({ slug: 'autoshop' });
    assert.equal(site.status, 'active');
    assert.equal(site.billing.autopay, true);
    assert.equal(site.billing.subscriptionId, 'sub_ok');
    assert.equal(new Date(site.billing.paidUntil).getTime(), end * 1000 + 2 * 864e5);
    assert.equal(rz.calls.filter((c) => c.body.includes('Autopay is on')).length, 1);

    await billing.handleRazorpayEvent(ev('subscription.halted', 'sub_ok'), 's3');
    site = await db.sites.findOne({ slug: 'autoshop' });
    assert.equal(site.billing.autopay, false);
    assert.equal(billing.accessState(site), 'live');
    assert.ok(rz.calls.some((c) => c.body.includes('Autopay for')));

    await billing.cancelSubscription(site);
    assert.ok(!rz.calls.some((c) => c.url.endsWith('/cancel')));
    assert.equal((await db.sites.findOne({ slug: 'autoshop' })).status, 'cancelled');
  } finally {
    rz.restore();
  }
});

test('paid months remind before they end and switch the site off after', async () => {
  const rz = withRazorpay({});
  try {
    const now = new Date();
    await db.sites.insertOne({ slug: 'endsoon', ownerPhone: '919000000014', businessName: 'Ends Soon', status: 'active', plan: 'paid', billing: { provider: 'razorpay', paidUntil: new Date(now.getTime() + 2 * 864e5) } });
    await db.sites.insertOne({ slug: 'autorenew', ownerPhone: '919000000015', businessName: 'Auto', status: 'active', plan: 'paid', billing: { provider: 'razorpay', autopay: true, paidUntil: new Date(now.getTime() + 2 * 864e5) } });
    await db.sites.insertOne({ slug: 'lapsed', ownerPhone: '919000000016', businessName: 'Lapsed', status: 'active', plan: 'paid', billing: { provider: 'razorpay', paidUntil: new Date(now.getTime() - 60e3) } });
    assert.equal(billing.accessState(await db.sites.findOne({ slug: 'lapsed' })), 'expired');
    await billing.sweepPlans(now);
    assert.ok((await db.sites.findOne({ slug: 'endsoon' })).billing.renewReminderAt);
    assert.ok(!(await db.sites.findOne({ slug: 'autorenew' })).billing.renewReminderAt);
    assert.equal((await db.sites.findOne({ slug: 'lapsed' })).status, 'expired');
    assert.equal(bucket(await db.sites.findOne({ slug: 'lapsed' })), 'unpaid');
    assert.ok(rz.calls.some((c) => c.body.includes('ends on')));
    assert.ok(rz.calls.some((c) => c.body.includes('paid month has ended')));
  } finally {
    rz.restore();
  }
});
