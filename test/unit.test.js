import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

process.env.WA_APP_SECRET = 'test-secret';
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
