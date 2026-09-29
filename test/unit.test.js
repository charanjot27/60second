import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

process.env.WA_APP_SECRET = 'test-secret';
process.env.GEMINI_API_KEY = 'test-key';
process.env.ROOT_DOMAIN = 'site60.in';

const { slugify, isValidSlug, parseSlugInput, slugProblem } = await import('../src/slug.js');
const { sanitize, fallbackCopy } = await import('../src/ai.js');
const { escapeHtml, renderSite, renderNotFound, renderLanding } = await import('../src/render.js');
const { parseIncoming, verifySignature } = await import('../src/whatsapp.js');
const { isDisallowedText, isBrandLike } = await import('../src/moderation.js');

test('slugify', () => {
  assert.equal(slugify('Sweet Crumbs'), 'sweet-crumbs');
  assert.equal(slugify("Avneet's Café & Bakes!"), 'avneets-cafe-and-bakes');
  assert.equal(slugify('ਸਵੀਟ ਕਰੰਬਸ'), '');
  assert.equal(slugify('a'.repeat(40)).length, 30);
});

test('isValidSlug', () => {
  assert.ok(isValidSlug('sweetcrumbs'));
  assert.ok(isValidSlug('sweet-crumbs-99'));
  assert.ok(!isValidSlug('ab'));
  assert.ok(!isValidSlug('-sweet'));
  assert.ok(!isValidSlug('sweet--crumbs'));
  assert.ok(!isValidSlug('www'));
  assert.ok(!isValidSlug('admin'));
  assert.ok(!isValidSlug('hdfc-bank'));
  assert.ok(!isValidSlug('paytmhelp'));
  assert.ok(!isValidSlug('amazom'));
  assert.ok(isValidSlug('metalworks'));
  assert.ok(isValidSlug('unisex-salon'));
});

test('slugProblem explains why', () => {
  assert.match(slugProblem('ab'), /short/);
  assert.match(slugProblem('login'), /reserved/);
  assert.match(slugProblem('sbi-kyc'), /brand/);
  assert.equal(slugProblem('sweetcrumbs'), null);
});

test('parseSlugInput', () => {
  assert.deepEqual(parseSlugInput('Sweet Crumbs'), { slug: 'sweet-crumbs', domain: null });
  assert.deepEqual(parseSlugInput('sweetcrumbs.site60.in'), { slug: 'sweetcrumbs', domain: null });
  assert.deepEqual(parseSlugInput('https://www.sweetcrumbs.com/'), { slug: 'sweetcrumbs', domain: 'sweetcrumbs.com' });
  assert.deepEqual(parseSlugInput('sweetcrumbs.com'), { slug: 'sweetcrumbs', domain: 'sweetcrumbs.com' });
});

test('moderation', () => {
  assert.ok(isDisallowedText('Lucky casino and betting in Goa'));
  assert.ok(isDisallowedText('call  girls available'));
  assert.ok(!isDisallowedText('Unisex salon and spa in Mohali'));
  assert.ok(!isDisallowedText('Gunjan tailoring shop'));
  assert.ok(isBrandLike('icici-support'));
  assert.ok(!isBrandLike('sweetcrumbs'));
});

test('sanitize clamps AI output', () => {
  const out = sanitize(
    {
      allowed: true,
      businessName: '  Sweet   Crumbs ',
      tagline: 'x'.repeat(200),
      services: ['Cakes', 'Cakes', '', 'Cupcakes', 'a', 'b', 'c', 'd', 'e'],
      theme: 'neon',
      slugHint: 'Sweet Crumbs!',
    },
    'Sweet Crumbs, cakes'
  );
  assert.equal(out.businessName, 'Sweet Crumbs');
  assert.equal(out.tagline.length, 80);
  assert.deepEqual(out.services, ['Cakes', 'Cupcakes', 'a', 'b', 'c', 'd']);
  assert.equal(out.theme, 'slate');
  assert.equal(out.slugHint, 'sweetcrumbs');
  assert.equal(sanitize({ allowed: false }, 'x').allowed, false);
  assert.equal(sanitize(null, 'Sweet Crumbs, cakes').businessName, 'Sweet Crumbs');
});

test('fallback copy uses the owner text', () => {
  const fb = fallbackCopy('Sweet Crumbs - birthday cakes in Ludhiana');
  assert.equal(fb.businessName, 'Sweet Crumbs');
  assert.match(fb.description, /birthday cakes/);
});

test('escapeHtml', () => {
  assert.equal(escapeHtml(`<a href="x">'&'</a>`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
});

const baseSite = {
  slug: 'sweetcrumbs',
  ownerPhone: '919812345678',
  phone: '919812345678',
  businessName: 'Sweet <Crumbs>',
  category: 'Home Bakery',
  tagline: 'Custom birthday cakes',
  description: 'Handmade cakes </script><script>alert(1)</script>',
  city: 'Ludhiana',
  services: ['Birthday cakes'],
  theme: 'rose',
};
const photo = (i) => ({ lg: `https://img/${i}-lg.webp`, sm: `https://img/${i}-sm.webp`, w: 1200, h: 1500 });

test('renderSite escapes user content', () => {
  const html = renderSite({ ...baseSite, photos: [photo(1)] });
  assert.ok(html.includes('Sweet &lt;Crumbs&gt;'));
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(!/"description":"[^"]*<\/script>/.test(html));
  assert.ok(html.includes('og:image'));
  assert.ok(html.includes('application/ld+json'));
  assert.ok(html.includes('https://sweetcrumbs.site60.in/'));
});

test('renderSite handles 0, 1, 2 and 6 photos', () => {
  for (const n of [0, 1, 2, 6]) {
    const photos = Array.from({ length: n }, (_, i) => photo(i));
    const html = renderSite({ ...baseSite, photos });
    assert.equal((html.match(/data-i="/g) || []).length, n);
    assert.equal(html.includes('<dialog'), n > 0);
    assert.equal(html.includes('class="next"'), n > 1);
    assert.equal(html.includes('fetchpriority="high"'), n > 0);
    assert.ok(Buffer.byteLength(html) < 30 * 1024);
  }
});

test('renderSite works for every theme and non-Latin text', () => {
  for (const theme of ['rose', 'forest', 'ocean', 'sunset', 'slate', 'plum', 'unknown']) {
    const html = renderSite({ ...baseSite, theme, businessName: 'ਮਿੱਠੀ ਬੇਕਰੀ', photos: [] });
    assert.ok(html.includes('ਮਿੱਠੀ ਬੇਕਰੀ'));
  }
});

test('landing and 404 render', () => {
  assert.match(renderLanding(), /Start on WhatsApp/);
  assert.match(renderNotFound('freeslug'), /freeslug\.site60\.in is free/);
  assert.doesNotMatch(renderNotFound('<x>'), /<x>/);
});

test('verifySignature', () => {
  const body = Buffer.from('{"a":1}');
  const sig = 'sha256=' + crypto.createHmac('sha256', 'test-secret').update(body).digest('hex');
  assert.ok(verifySignature(body, sig));
  assert.ok(!verifySignature(body, 'sha256=deadbeef'));
  assert.ok(!verifySignature(body, undefined));
});

test('parseIncoming normalises Meta payloads', () => {
  const body = {
    entry: [
      {
        changes: [
          {
            value: {
              contacts: [{ wa_id: '911', profile: { name: 'Avneet' } }],
              messages: [
                { id: 'm1', from: '911', type: 'text', text: { body: 'Hi' } },
                { id: 'm2', from: '911', type: 'image', image: { id: 'img1', caption: 'cake' } },
                { id: 'm3', from: '911', type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'slug_ok', title: 'Use this' } } },
                { id: 'm4', from: '911', type: 'document', document: { id: 'doc1', mime_type: 'image/jpeg' } },
                { id: 'm5', from: '911', type: 'location', location: { latitude: 30.9, longitude: 75.8, name: 'Shop' } },
              ],
            },
          },
        ],
      },
    ],
  };
  const [text, image, button, doc, loc] = parseIncoming(body);
  assert.equal(text.text, 'Hi');
  assert.equal(text.name, 'Avneet');
  assert.equal(image.mediaId, 'img1');
  assert.equal(button.type, 'button');
  assert.equal(button.buttonId, 'slug_ok');
  assert.equal(doc.type, 'image');
  assert.equal(doc.mediaId, 'doc1');
  assert.equal(loc.location.lat, 30.9);
  assert.deepEqual(parseIncoming({ entry: [{ changes: [{ value: { statuses: [{}] } }] }] }), []);
});

const { makeDesign, palette } = await import('../src/design.js');
const { renderAdvanced } = await import('../src/advanced.js');

test('makeDesign is stable per salt and varies across sites', () => {
  const a = { slug: 'sweetcrumbs', businessName: 'Sweet Crumbs', category: 'Home Bakery' };
  assert.deepEqual(makeDesign(a, '1'), makeDesign(a, '1'));
  const variants = new Set();
  for (let i = 0; i < 30; i++) {
    const d = makeDesign({ slug: `shop${i}`, businessName: `Shop ${i}`, category: 'Cafe' }, String(i));
    variants.add(`${d.layout}-${d.font}-${d.mode}-${d.hue}`);
    assert.match(palette(d).accent, /^hsl\(/);
  }
  assert.ok(variants.size > 15);
});

test('renderAdvanced escapes content and handles every layout', () => {
  const base = {
    slug: 'sweetcrumbs',
    ownerPhone: '919812345678',
    phone: '919812345678',
    businessName: 'Sweet <Crumbs>',
    category: 'Home Bakery',
    city: 'Ludhiana',
    tagline: 'Fresh cakes',
    description: 'Cakes </script><script>alert(1)</script>',
    services: ['Cakes', 'Cupcakes'],
    style: 'advanced',
    photos: [photo(1), photo(2)],
    aiImages: [{ ...photo(3), ai: true }, { ...photo(4), ai: true }],
  };
  for (const layout of ['split', 'center', 'full', 'editorial']) {
    for (const withPhotos of [true, false]) {
      const site = {
        ...base,
        photos: withPhotos ? base.photos : [],
        aiImages: withPhotos ? base.aiImages : [],
        design: { ...makeDesign(base, 'x'), layout },
      };
      const html = renderAdvanced(site);
      assert.ok(html.includes('Sweet &lt;Crumbs&gt;'));
      assert.ok(!html.includes('<script>alert(1)</script>'));
      assert.ok(html.includes('id="cta"'));
    }
  }
});

const { fillTemplate, sanitizeBody, sanitizeCss, buildData } = await import('../src/generate.js');

test('sanitizeBody strips scripts, forms, external images and bad links', () => {
  const out = sanitizeBody(
    '<section class="a" onclick="x()" style="color:red"><script>alert(1)</script><form><input></form>' +
      '<img src="https://evil.example/x.png"><a href="javascript:alert(1)">x</a>' +
      '<a href="https://evil.example/">y</a><a href="https://wa.me/919812345678">wa</a><iframe src="https://x"></iframe></section>'
  );
  assert.ok(!/script|form|input|onclick|style=|evil|javascript|iframe/i.test(out.replace('wa.me', '')));
  assert.ok(out.includes('https://wa.me/919812345678'));
});

test('sanitizeCss removes imports, urls and font faces', () => {
  const out = sanitizeCss('@import url(https://x/y.css);@font-face{src:url(a)}a{background:url(https://evil/x.png);color:red}');
  assert.ok(!/import|font-face|url|evil/i.test(out));
  assert.ok(out.includes('color:red'));
});

test('fillTemplate handles conditionals, nested loops and escaping', () => {
  const site = {
    businessName: 'Sweet <b>Crumbs',
    category: 'Bakery',
    city: 'Ludhiana',
    tagline: '',
    description: 'Cakes',
    services: ['Cakes', 'Pies'],
    phone: '919812345678',
    photos: [photo(1), photo(2)],
    aiImages: [],
  };
  const data = buildData(site, { formatPhone: (p) => `+${p}` });
  const html = fillTemplate(
    '<h1>{{name}}</h1><template data-if="tagline"><p>{{tagline}}</p></template><template data-if="services"><ul><template data-each="services"><li>{{n}} {{item}}</li></template></ul></template>' +
      '<template data-if="photos"><template data-each="photos"><i data-i="{{i}}">{{alt}}</i></template></template><a href="{{wa}}">go</a>',
    data
  );
  assert.ok(html.includes('Sweet &lt;b&gt;Crumbs'));
  assert.ok(!html.includes('<p>'));
  assert.ok(html.includes('<li>01 Cakes</li><li>02 Pies</li>'));
  assert.ok(html.includes('data-i="1"'));
  assert.ok(html.includes('https://wa.me/919812345678'));
});

test('generated pages render through the shell', async () => {
  const body =
    '<header class="top"><a href="{{wa}}">WhatsApp</a></header><section id="cta"><h1>{{name}}</h1><a class="b" href="{{tel}}">Call</a></section>' +
    '<template data-if="hero_img"><img src="{{hero_src}}" width="{{hero_w}}" height="{{hero_h}}" alt=""></template>' +
    '<template data-if="photos"><div id="gallery"><template data-each="photos"><figure class="ph"><button type="button" data-i="{{i}}"><img src="{{src}}" data-lg="{{lg}}" alt="{{alt}}" width="{{w}}" height="{{h}}"></button></figure></template></div></template>'.padEnd(900, ' ');
  const site = {
    slug: 'sweetcrumbs',
    ownerPhone: '919812345678',
    phone: '919812345678',
    businessName: 'Sweet Crumbs',
    category: 'Bakery',
    city: 'Ludhiana',
    description: 'Cakes',
    services: ['Cakes'],
    photos: [photo(1)],
    aiImages: [{ ...photo(2), ai: true }],
    style: 'advanced',
    page: { themeColor: '#aa3355', fonts: 'https://fonts.googleapis.com/css2?family=Sora:wght@400;700&display=swap', css: 'h1{color:red}'.padEnd(500, ' '), body },
  };
  const { renderAdvanced: render } = await import('../src/advanced.js');
  const html = render(site);
  assert.ok(html.includes('<h1>Sweet Crumbs</h1>'));
  assert.ok(html.includes('https://img/2-lg.webp'));
  assert.ok(html.includes('data-i="0"'));
  assert.ok(html.includes('AI-generated illustrations'));
  assert.ok(html.includes('id="lb"'));
});

function claudeStream(text, model = 'claude-opus-5-5') {
  const events = [
    ['message_start', { type: 'message_start', message: { id: 'msg_1', type: 'message', role: 'assistant', model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 5, output_tokens: 0 } } }],
    ['content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }],
    ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } }],
    ['content_block_stop', { type: 'content_block_stop', index: 0 }],
    ['message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 42 } }],
    ['message_stop', { type: 'message_stop' }],
  ];
  const body = events.map(([name, data]) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`).join('');
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

const goodPage = (color) => {
  const css = 'h1{color:red}\n'.repeat(250);
  const body = '<div class="page"><a href="{{wa}}">{{name}}</a>' + '<p>text</p>'.repeat(400) + '</div>';
  return `===META===\n{"themeColor":"${color}","fonts":[{"family":"Sora","weights":"400;700"}]}\n===CSS===\n${css}\n===BODY===\n${body}\n===END===`;
};

test('generateSitePage parses Gemini sections and retries once', async () => {
  const { generateSitePage } = await import('../src/generate.js');
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    calls.push(1);
    const text = calls.length === 1 ? 'nonsense' : goodPage('#112233');
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }) };
  };
  try {
    const page = await generateSitePage({ businessName: 'Study Room', category: 'Library', services: [], photos: [] }, null);
    assert.equal(calls.length, 2);
    assert.equal(page.themeColor, '#112233');
    assert.match(page.fonts, /family=Sora:wght@400;700/);
    assert.ok(page.body.includes('{{wa}}'));
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('Claude designs with adaptive thinking, effort, streaming and no temperature', async () => {
  const { config } = await import('../src/config.js');
  const { generateSitePage } = await import('../src/generate.js');
  config.ai.apiKey = 'test-anthropic';
  const requests = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), body: JSON.parse(init.body) });
    return claudeStream(goodPage('#445566'));
  };
  try {
    const page = await generateSitePage({ businessName: 'Study Room', services: [], photos: [] }, { concept: 'quiet focus' });
    const { url, body } = requests[0];
    assert.ok(url.startsWith('https://api.anthropic.com/v1/messages'));
    assert.equal(body.model, 'claude-opus-5-5');
    assert.equal(body.stream, true);
    assert.deepEqual(body.thinking, { type: 'adaptive' });
    assert.equal(body.output_config.effort, 'high');
    assert.equal(body.fallbacks, 'default');
    assert.equal(body.temperature, undefined);
    assert.equal(page.themeColor, '#445566');
    assert.equal(page.concept, 'quiet focus');
  } finally {
    globalThis.fetch = realFetch;
    config.ai.apiKey = '';
  }
});

test('art direction returns a per-business brief with picture prompts', async () => {
  const { config } = await import('../src/config.js');
  const { createArtDirection } = await import('../src/generate.js');
  config.ai.apiKey = 'test-anthropic';
  const brief = { concept: 'Trust in brick and light', palette: { accent: '#b4532a' }, imagePrompts: ['a', 'b', 'c', 'd', 'e'] };
  const realFetch = globalThis.fetch;
  let sent;
  globalThis.fetch = async (url, init) => {
    sent = JSON.parse(init.body);
    return claudeStream('Here it is:\n' + JSON.stringify(brief));
  };
  try {
    const out = await createArtDirection({ businessName: 'Guru Kirpa Dealers', category: 'Real estate', city: 'Amritsar', slug: 'gk' });
    assert.equal(out.concept, 'Trust in brick and light');
    assert.equal(out.imagePrompts.length, 4);
    assert.match(sent.messages[0].content, /Guru Kirpa Dealers/);
    assert.match(sent.messages[0].content, /Seed moods: /);
  } finally {
    globalThis.fetch = realFetch;
    config.ai.apiKey = '';
  }
});

test('parseEdit reads summary, facts, pictures and an optional page', async () => {
  const { parseEdit } = await import('../src/generate.js');
  const factsOnly = parseEdit(
    '===SUMMARY===\nAdded home loans.\n===DATA===\n{"services":["Buying","Home loans"],"price":"1 cr"}\n===IMAGES===\n[{"slot":1,"prompt":"modern house at dusk"},{"slot":9,"prompt":"x"}]\n===META===\nNONE\n===END==='
  );
  assert.equal(factsOnly.summary, 'Added home loans.');
  assert.deepEqual(factsOnly.fields, { services: ['Buying', 'Home loans'] });
  assert.deepEqual(factsOnly.images, [{ slot: 1, prompt: 'modern house at dusk' }]);
  assert.equal(factsOnly.page, null);

  const withPage = parseEdit(`===SUMMARY===\nNew colours.\n===DATA===\n{}\n===IMAGES===\n[]\n${goodPage('#0a3d2e')}`);
  assert.equal(withPage.page.themeColor, '#0a3d2e');
  assert.deepEqual(withPage.fields, {});
});

test('sanitizer keeps interaction hooks and drops external svg references', async () => {
  const { sanitizeBody } = await import('../src/generate.js');
  const out = sanitizeBody(
    '<div data-tilt data-speed="0.2"><button data-menu aria-expanded="false">Menu</button><svg><use href="#i"></use><use href="https://evil/x.svg#a"></use></svg><div onclick="x()" data-carousel><div data-track></div></div></div>'
  );
  assert.ok(out.includes('data-tilt') && out.includes('data-speed="0.2"') && out.includes('data-menu'));
  assert.ok(out.includes('href="#i"'));
  assert.ok(!out.includes('evil') && !out.includes('onclick'));
});

test('enhance script is valid and wired into generated pages', async () => {
  const { ENHANCE_SCRIPT } = await import('../src/enhance.js');
  assert.doesNotThrow(() => new Function(ENHANCE_SCRIPT));
  for (const hook of ['.reveal', '.spot', '.nav', '[data-tilt]', '[data-speed]', '[data-rotate]', '[data-tabs]', '[data-carousel]', '[data-split]', '[data-menu]']) {
    assert.ok(ENHANCE_SCRIPT.includes(hook), hook);
  }
});

test('free pictures are fetched one at a time and retried, a billing-blocked provider is paused', async () => {
  const { config } = await import('../src/config.js');
  const images = await import('../src/images.js');
  const storage = await import('../src/storage.js');
  config.gemini.apiKey = 'test-gemini';
  config.images.geminiModel = 'test-image-model';
  const sharp = (await import('sharp')).default;
  const square = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#888' } }).jpeg().toBuffer();
  let active = 0;
  let peak = 0;
  let geminiCalls = 0;
  const freeCalls = [];
  const realFetch = globalThis.fetch;
  const realSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (fn) => realSetTimeout(fn, 0);
  globalThis.fetch = async (url) => {
    if (String(url).includes('generativelanguage')) {
      geminiCalls++;
      return new Response('{"error":{"code":429}}', { status: 429 });
    }
    freeCalls.push(url);
    active++;
    peak = Math.max(peak, active);
    await new Promise((r) => realSetTimeout(r, 5));
    active--;
    if (freeCalls.length === 2) return new Response('busy', { status: 402 });
    return new Response(square, { status: 200, headers: { 'content-type': 'image/jpeg' } });
  };
  try {
    const results = await Promise.allSettled([0, 1, 2, 3].map((slot) => images.generateImage('a shop', slot, '919999999999')));
    assert.equal(peak, 1);
    assert.equal(freeCalls.length, 5);
    assert.ok(results.every((r) => r.status === 'rejected' || r.value));
    const before = geminiCalls;
    await images.generateImage('a shop', 0, '919999999999').catch(() => {});
    assert.equal(geminiCalls, before);
  } finally {
    globalThis.fetch = realFetch;
    globalThis.setTimeout = realSetTimeout;
    config.gemini.apiKey = '';
    config.images.geminiModel = '';
  }
});

test('square pictures are cropped to the slot shape', async () => {
  const { config } = await import('../src/config.js');
  const images = await import('../src/images.js');
  const sharp = (await import('sharp')).default;
  const square = await sharp({ create: { width: 300, height: 300, channels: 3, background: '#468' } }).png().toBuffer();
  config.cf.accountId = 'acc';
  config.cf.apiToken = 'tok';
  const bodies = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    bodies.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ result: { image: square.toString('base64') } }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const out = await images.generateImage('a shop', 0, '919999999999').catch((err) => err);
    assert.equal(bodies[0].width, undefined);
    assert.equal(bodies[0].height, undefined);
    assert.ok(out instanceof Error || out.w / out.h > 1.4);
  } finally {
    globalThis.fetch = realFetch;
    config.cf.accountId = '';
    config.cf.apiToken = '';
  }
});
