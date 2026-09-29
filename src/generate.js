import sanitizeHtml from 'sanitize-html';
import { config } from './config.js';
import { log } from './log.js';
import { callGemini, geminiEnabled } from './gemini.js';
import { escapeHtml } from './render.js';

const DIRECTIONS = [
  'Editorial magazine: oversized serif headlines, generous white space, thin rules, asymmetric grid, one bold accent colour.',
  'Bold neo-brutalist: chunky borders, hard offset shadows, flat vivid colours, huge type, playful stickers made from CSS shapes.',
  'Soft glassmorphism: layered gradient mesh background, frosted translucent cards, rounded shapes, gentle floating blobs.',
  'Luxury dark: near-black background, warm metallic accent, elegant serif display type, subtle glows, refined spacing.',
  'Playful pastel: rounded blobs, friendly sans-serif display type, sticker-like badges, bouncy hover effects.',
  'Swiss minimal: strict grid, one typeface family, big numbers, black and white with a single vivid accent.',
  'Retro poster: halftone-style patterns from CSS gradients, bold condensed headlines, limited 3-colour palette, ticket-like cards.',
  'Organic natural: earthy tones, soft curved dividers, hand-crafted feel, warm serif headlines, paper-like textures from CSS gradients.',
  'Modern tech gradient: vibrant gradient hero, bento-grid cards, sharp sans-serif, glowing borders, subtle grid pattern background.',
  'Warm storefront: cosy colours, big friendly headline, rounded cards, scalloped or wavy section dividers, welcoming tone.',
];

const SYSTEM_PROMPT = `You are the creative director and lead front-end engineer of an award-winning design studio. You are building a bespoke, premium, single-page website for ONE small local business in India. The result must look like a custom agency site that would cost thousands: never like a template, never plain, never generic.

OUTPUT FORMAT (exactly this, no JSON, no markdown fences, no commentary):
===META===
{"themeColor":"#rrggbb","fonts":[{"family":"Font Name","weights":"400;600;800"}]}
===CSS===
(all the CSS)
===BODY===
(the HTML fragment)
===END===

TECHNICAL RULES
- fonts: 1 or 2 Google Fonts families chosen for the direction (a distinctive display face plus a readable body face). Use them in CSS via font-family.
- CSS: plain CSS only. No @import, no @font-face, no url(...), no external resources. Write a real design system: :root variables for colours, radii, shadows, spacing and fluid type with clamp(); a consistent spacing rhythm; at least 300 lines of considered CSS. Mobile-first at 360px width with no horizontal scroll (use overflow-x:clip on the page wrapper), then @media (min-width:900px) upgrades with real layout changes (asymmetric grids, sticky elements, overlapping images).
- BODY: an HTML fragment for inside <body>, wrapped in one <div class="page">. Allowed tags: header nav main section article aside footer div span p h1-h4 ul ol li a img figure figcaption button strong em br hr blockquote details summary dl dt dd address small svg with path circle rect g defs linearGradient radialGradient stop line polyline polygon ellipse. NO script, style, link, form, input, iframe, object and NO inline style attributes: class names only.
- Motion is CSS-only: keyframes, hover and focus effects, marquee strips, floating shapes, gradient shifts, details/summary accordions, and scroll-driven reveals guarded by @supports (animation-timeline: view()). Everything must be fully visible if animation does not run: never start an element at opacity:0 unless its animation ends visible with animation-fill-mode:both. Respect prefers-reduced-motion.
- Contrast at least 4.5:1 for text. Tap targets at least 48px. Visible :focus-visible styles.
- Never invent facts: no prices, years in business, awards, statistics, addresses, opening hours, certifications, testimonials, reviews or client names. Use only the facts given. Generic microcopy is fine.
- Write ALL visible copy in the business language and script (given as language: en, hi or pa). Keep the English placeholders exactly as written.
- Copy quality: short, confident, specific to this kind of business, with a clear benefit in each headline. No lorem ipsum, no filler, no cliches such as "welcome to our website". Use at most one or two emojis, or none.
- Do NOT include the site footer, the sticky bottom contact bar, or the photo lightbox: the system adds them.

PLACEHOLDERS (the system fills them safely, use them instead of real values)
Text: {{name}} {{category}} {{city}} {{tagline}} {{about}} {{phone}} {{address}}
Links (inside href): {{wa}} {{tel}} {{map}}
Images (inside src): {{hero_src}} {{img2_src}} {{img3_src}} with sizes {{hero_w}} {{hero_h}} {{img2_w}} {{img2_h}} {{img3_w}} {{img3_h}}
Repeat block: <template data-each="services"> ... {{item}} {{n}} ... </template>   ({{n}} is 01, 02, 03 ...)
Repeat block for gallery, each photo written exactly as:
<template data-each="photos"><figure class="ph"><button type="button" data-i="{{i}}"><img src="{{src}}" data-lg="{{lg}}" alt="{{alt}}" width="{{w}}" height="{{h}}" loading="lazy"></button></figure></template>
Conditional block: <template data-if="KEY"> ... </template> with KEY one of: services photos hero_img img2 img3 address map tagline about. A data-each may sit inside a data-if, but never put data-if inside data-each.

REQUIRED SECTIONS, in this order, each with a clearly different layout but one shared visual language
1. Sticky top navigation (blurred translucent bar) with the name, anchor links to #about #services #gallery #contact, and a WhatsApp button (href="{{wa}}").
2. Hero: a huge expressive headline built from {{name}} and {{tagline}} with a typographic twist (gradient or outlined word, mixed weights), supporting line, primary WhatsApp button (href="{{wa}}") and secondary Call button (href="{{tel}}"). The wrapper of these buttons must have id="cta". Show {{hero_src}} inside data-if="hero_img" in a striking frame (mask, clip-path, rotated card, arch, or overlapping layers) with floating decorative shapes and a small badge built from {{category}} and {{city}}. Without an image, build a rich graphic hero from CSS gradients and SVG.
3. A continuously scrolling marquee strip of the services (or category words) in large type.
4. About (id="about"): {{about}} with {{img2_src}} when available, an editorial layout with a pull-quote style line taken from {{tagline}}.
5. Services (id="services"): a bento grid or staggered card layout of every service, each card with {{n}}, an inline SVG icon or shape, and hover lift.
6. A full-width image band or parallax-style block using {{img3_src}} with an overlaid short statement (only inside data-if="img3").
7. Gallery (id="gallery"): the photos repeat block in a masonry or mosaic layout with hover zoom, only inside data-if="photos".
8. How it works: three connected steps (message on WhatsApp, tell us what you need, we take care of it) with a drawn connector line.
9. FAQ: 3 to 4 details/summary items with generic questions (how do I order or book, can I ask before deciding, how do I reach you) answered only with given facts or by pointing to WhatsApp.
10. Contact (id="contact"): a bold closing panel with a very large call to action, WhatsApp and Call buttons, {{phone}}, and {{address}} and a directions link ({{map}}) inside data-if.

QUALITY BAR
Deliberate palette (one dominant, one accent, neutrals) that fits the business and direction, with layered backgrounds (gradient meshes, blurred blobs, grain-like patterns from gradients, subtle grids), confident typographic hierarchy with tight leading on display type, generous whitespace, soft shadows and borders, glass or solid cards as the direction demands, animated details (floating shapes, shimmering gradient text, underline sweeps, button glows), and pixel-clean alignment. Make sure it feels expensive and unique, and that a shop owner would be proud to show it.`;

export function pickDirection(salt = '') {
  const n = [...String(salt)].reduce((a, c) => a + c.charCodeAt(0), 0) + Math.floor(Math.random() * 1000);
  return DIRECTIONS[n % DIRECTIONS.length];
}

const TAGS = [
  'header', 'nav', 'main', 'section', 'article', 'aside', 'footer', 'div', 'span', 'p', 'h1', 'h2', 'h3', 'h4',
  'ul', 'ol', 'li', 'a', 'img', 'figure', 'figcaption', 'button', 'strong', 'em', 'b', 'i', 'br', 'hr',
  'blockquote', 'details', 'summary', 'dl', 'dt', 'dd', 'address', 'small',
  'svg', 'path', 'circle', 'rect', 'g', 'defs', 'linearGradient', 'radialGradient', 'stop', 'line', 'polyline',
  'polygon', 'ellipse',
];
const SVG_ATTRS = [
  'viewBox', 'd', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'cx', 'cy', 'r', 'rx', 'ry',
  'x', 'y', 'width', 'height', 'points', 'x1', 'y1', 'x2', 'y2', 'offset', 'stop-color', 'stop-opacity', 'opacity',
  'transform', 'preserveAspectRatio', 'fill-rule', 'clip-rule', 'id', 'gradientUnits',
];

function imageAllowed(src) {
  if (!src) return false;
  if (config.imageBase && src.startsWith(`${config.imageBase}/`)) return true;
  return false;
}

function hrefAllowed(href) {
  if (!href) return false;
  return (
    /^#[\w-]*$/.test(href) ||
    href.startsWith('tel:+') ||
    href.startsWith('https://wa.me/') ||
    href.startsWith('https://www.google.com/maps/') ||
    href.startsWith('mailto:')
  );
}

export function sanitizeBody(html) {
  return sanitizeHtml(String(html || '').slice(0, 90000), {
    allowedTags: TAGS,
    allowedAttributes: {
      '*': ['class', 'id', 'aria-label', 'aria-hidden', 'aria-labelledby', 'role', 'title'],
      a: ['href', 'target', 'rel', 'class', 'id', 'aria-label'],
      img: ['src', 'srcset', 'sizes', 'alt', 'width', 'height', 'loading', 'decoding', 'fetchpriority', 'data-lg', 'class', 'id'],
      button: ['type', 'data-i', 'class', 'id', 'aria-label'],
      details: ['open', 'class', 'id'],
      svg: ['xmlns', 'class', 'id', 'aria-hidden', 'role', ...SVG_ATTRS],
      path: ['class', ...SVG_ATTRS],
      circle: ['class', ...SVG_ATTRS],
      rect: ['class', ...SVG_ATTRS],
      g: ['class', ...SVG_ATTRS],
      defs: [],
      linearGradient: ['id', 'x1', 'y1', 'x2', 'y2', 'gradientUnits'],
      radialGradient: ['id', 'cx', 'cy', 'r', 'gradientUnits'],
      stop: ['offset', 'stop-color', 'stop-opacity'],
      line: ['class', ...SVG_ATTRS],
      polyline: ['class', ...SVG_ATTRS],
      polygon: ['class', ...SVG_ATTRS],
      ellipse: ['class', ...SVG_ATTRS],
    },
    parser: { lowerCaseTags: false, lowerCaseAttributeNames: false },
    allowedSchemes: ['https', 'tel', 'mailto'],
    allowProtocolRelative: false,
    transformTags: {
      a: (tag, attribs) => {
        const next = { ...attribs };
        if (!hrefAllowed(next.href)) delete next.href;
        if (next.href && !next.href.startsWith('#')) {
          next.target = '_blank';
          next.rel = 'noopener noreferrer';
        } else {
          delete next.target;
          delete next.rel;
        }
        return { tagName: 'a', attribs: next };
      },
    },
    exclusiveFilter: (frame) => frame.tag === 'img' && !imageAllowed(frame.attribs.src),
  });
}

export function sanitizeCss(css) {
  let out = String(css || '').slice(0, 60000);
  out = out.replace(/\/\*[\s\S]*?\*\//g, '');
  out = out.replace(/@import[^;]*;?/gi, '');
  out = out.replace(/@font-face\s*\{[^}]*\}/gi, '');
  out = out.replace(/url\s*\([^)]*\)/gi, 'none');
  out = out.replace(/expression\s*\(|javascript:|behavior\s*:|-moz-binding|<\/?style|<script/gi, '');
  return out;
}

function fontLink(fonts) {
  const families = (Array.isArray(fonts) ? fonts : [])
    .slice(0, 2)
    .filter((f) => /^[A-Za-z0-9 ]{2,40}$/.test(f?.family || ''))
    .map((f) => {
      const weights = /^[0-9;]{3,30}$/.test(f.weights || '') ? f.weights : '400;700';
      return `family=${f.family.trim().replace(/ /g, '+')}:wght@${weights}`;
    });
  return families.length
    ? `https://fonts.googleapis.com/css2?${families.join('&')}&display=swap`
    : '';
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function truthy(v) {
  return Array.isArray(v) ? v.length > 0 : Boolean(v);
}

export function fillTemplate(tpl, data) {
  const blockRe = /<template\s+data-(if|each)="([a-z0-9_]+)">((?:(?!<template)[\s\S])*?)<\/template>/i;
  let out = String(tpl || '');
  for (let guard = 0; guard < 200; guard++) {
    const m = blockRe.exec(out);
    if (!m) break;
    const [whole, kind, key, inner] = m;
    let replacement = '';
    if (kind === 'if') {
      replacement = truthy(data.flags[key]) ? inner : '';
    } else {
      const items = data.lists[key] || [];
      replacement = items.map((item, i) => fillScalars(inner, { ...item, i, n: pad(i + 1) })).join('');
    }
    out = out.slice(0, m.index) + replacement + out.slice(m.index + whole.length);
  }
  return fillScalars(out, data.scalars);
}

function fillScalars(text, values) {
  return text.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_, key) => escapeHtml(values[key] ?? ''));
}

export function buildData(site, helpers) {
  const own = (site.photos || []).filter((p) => !p.ai);
  const ai = (site.aiImages || []).filter((p) => p.lg);
  const hero = ai[0] || own[0];
  const img2 = ai[1] || own[1] || hero;
  const img3 = ai[2] || own[2] || img2;
  const gallery = own.length ? own : ai;
  const phone = String(site.phone || site.ownerPhone || '').replace(/\D/g, '');
  const address = site.location?.address || site.location?.name || '';
  const map =
    site.location?.lat != null && site.location?.lng != null
      ? `https://www.google.com/maps/search/?api=1&query=${site.location.lat},${site.location.lng}`
      : '';
  const img = (p, prefix) => ({
    [`${prefix}_src`]: p?.lg || '',
    [`${prefix}_w`]: p?.w || 1200,
    [`${prefix}_h`]: p?.h || 1200,
  });
  return {
    flags: {
      services: site.services || [],
      photos: gallery,
      hero_img: hero,
      img2: img2,
      img3: img3,
      address,
      map,
      tagline: site.tagline,
      about: site.description,
    },
    lists: {
      services: (site.services || []).map((item) => ({ item })),
      photos: gallery.map((p, i) => ({
        src: p.sm || p.lg,
        lg: p.lg,
        w: p.w || 1200,
        h: p.h || 1200,
        alt: `${site.businessName} photo ${i + 1}`,
      })),
    },
    scalars: {
      name: site.businessName,
      category: site.category,
      city: site.city,
      tagline: site.tagline,
      about: site.description,
      phone: helpers.formatPhone(phone),
      address,
      wa: `https://wa.me/${phone}?text=${encodeURIComponent(`Hi ${site.businessName}, I saw your website and would like to know more.`)}`,
      tel: `tel:+${phone}`,
      map,
      ...img(hero, 'hero'),
      ...img(img2, 'img2'),
      ...img(img3, 'img3'),
    },
  };
}

export function parseSections(raw) {
  const text = String(raw || '').replace(/^```[a-z]*\n?|```$/gim, '');
  const meta = /===META===([\s\S]*?)===CSS===/.exec(text)?.[1];
  const css = /===CSS===([\s\S]*?)===BODY===/.exec(text)?.[1];
  const bodyMatch = /===BODY===([\s\S]*?)(?:===END===|$)/.exec(text)?.[1];
  if (!meta || !css || !bodyMatch) throw new Error('Generated page missing sections');
  const parsedMeta = JSON.parse(meta.slice(meta.indexOf('{'), meta.lastIndexOf('}') + 1));
  return { meta: parsedMeta, css: css.trim(), body: bodyMatch.trim() };
}

function validPage(page) {
  return (
    page.body.length > 2500 &&
    page.css.length > 2500 &&
    page.body.includes('{{wa}}') &&
    /\{\{\s*name\s*\}\}/.test(page.body)
  );
}

async function attempt(site, direction, opts, timeoutMs, note) {
  const brief = {
    businessName: site.businessName,
    category: site.category,
    city: site.city,
    tagline: site.tagline,
    description: site.description,
    services: site.services,
    language: site.language || 'en',
    hasHeroPicture: opts.hasImages ?? Boolean((site.aiImages || []).length || (site.photos || []).length),
    photoCount: (site.photos || []).length,
    designDirection: direction,
    accentHueHint: site.design?.hue,
  };
  const raw = await callGemini({
    system: SYSTEM_PROMPT,
    user: `Design the website for this business.${note ? ` ${note}` : ''}\n${JSON.stringify(brief, null, 2)}`,
    maxTokens: 30000,
    temperature: 1,
    timeoutMs,
  });
  const { meta, css, body } = parseSections(raw);
  const page = {
    themeColor: /^#[0-9a-f]{6}$/i.test(meta.themeColor || '') ? meta.themeColor : '#222222',
    fonts: fontLink(meta.fonts),
    css,
    body,
    direction,
  };
  if (!validPage(page)) throw new Error(`Generated page too small (${body.length} html, ${css.length} css)`);
  return page;
}

export async function generateSitePage(site, direction, opts = {}) {
  if (!geminiEnabled()) return null;
  try {
    return await attempt(site, direction, opts, 110000, '');
  } catch (err) {
    log.warn('page attempt failed, retrying', { error: err.message });
    return attempt(site, direction, opts, 80000, 'Your previous answer was rejected. Follow the output format exactly and make the page rich and complete.');
  }
}

export function pageCss(css) {
  return sanitizeCss(css);
}
