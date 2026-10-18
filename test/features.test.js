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
  for (const k of Object.keys(update.$unset || {})) delete doc[k];
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

for (const name of ['sites', 'sessions', 'processed', 'usage', 'events', 'leads', 'designs']) {
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

test('every site gets an inline SVG favicon in its brand colour', () => {
  const html = renderSite({ slug: 'shop', businessName: 'Zara Tailors', phone: '919876543210', photos: [], theme: 'forest' });
  assert.match(html, /<link rel="icon" href="data:image\/svg\+xml,/);
  assert.ok(decodeURIComponent(html.match(/data:image\/svg\+xml,([^"]+)/)[1]).includes('>Z</text>'));
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
