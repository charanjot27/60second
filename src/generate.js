import sanitizeHtml from 'sanitize-html';
import { config } from './config.js';
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

const SYSTEM_PROMPT = `You are a senior web designer who builds award-winning, distinctive single-page websites for small local businesses in India.
You are given facts about ONE business and a design direction. Produce a complete, beautiful, mobile-first one-page website as an HTML fragment plus CSS.
Reply with ONE JSON object only: {"themeColor":"#rrggbb","fonts":[{"family":"Font Name","weights":"400;700"}],"css":"...","body":"..."}

HARD RULES
- "fonts": 1 or 2 Google Fonts families that suit the direction, weights as semicolon-separated numbers. Use them in the CSS.
- "css": plain CSS only. No @import, no @font-face, no url(...). Use CSS variables, clamp() for type, grid/flex, gradients, CSS shapes and inline SVG for decoration. Mobile-first with @media (min-width:900px) upgrades.
- "body": an HTML fragment for inside <body>. Allowed: header nav main section article aside footer div span p h1-h4 ul ol li a img figure figcaption button strong em br hr blockquote details summary dl dt dd address small svg and its shapes. NO script, style, link, form, input, iframe, object, or inline style attributes. Use classes only.
- Interactivity must be CSS-only (details/summary accordions, :hover, :focus-visible, keyframes, marquee strips, and scroll-driven animation guarded with @supports (animation-timeline: view())). Content must be fully visible even if animations do not run: never start elements at opacity:0 without an animation-fill that ends visible.
- Never invent facts: no prices, years in business, awards, statistics, addresses, opening hours, certifications, testimonials or reviews. Write persuasive copy only from the given description. Generic microcopy such as "Say hello on WhatsApp" is fine.
- Write all visible copy in the business's language and script (language code is given: en, hi or pa). Keep English placeholders exactly as written.
- Contrast must be at least 4.5:1 for body text. Tap targets at least 48px. Respect prefers-reduced-motion.
- Do not include the site footer, the sticky contact bar or the photo lightbox: the system adds them.

PLACEHOLDERS (the system fills them safely; use them instead of real values)
Text: {{name}} {{category}} {{city}} {{tagline}} {{about}} {{phone}} {{address}}
Links (use inside href): {{wa}} {{tel}} {{map}}
Images (use inside src): {{hero_src}} {{img2_src}} {{img3_src}} with sizes {{hero_w}} {{hero_h}} {{img2_w}} {{img2_h}} {{img3_w}} {{img3_h}}
Repeat block: <template data-each="services">...{{item}} {{n}}...</template> ({{n}} is 01, 02, ...)
Repeat block: <template data-each="photos">...</template> where each photo must be written exactly as:
<figure class="ph"><button type="button" data-i="{{i}}"><img src="{{src}}" data-lg="{{lg}}" alt="{{alt}}" width="{{w}}" height="{{h}}" loading="lazy"></button></figure>
Conditional block: <template data-if="KEY">...</template> where KEY is one of services, photos, hero_img, img2, img3, address, map, tagline, about. Templates may nest one level (a data-each inside a data-if) but data-if inside data-each is not allowed.

REQUIRED CONTENT AND ORDER
1. Sticky top navigation with the business name and anchor links (#about #services #gallery #contact) and a WhatsApp button (href="{{wa}}").
2. Hero with a striking headline built from {{name}} and {{tagline}}, primary WhatsApp button (href="{{wa}}") and a Call button (href="{{tel}}"). The hero cta wrapper must have id="cta". Use {{hero_src}} inside data-if="hero_img"; otherwise make a strong graphic hero from CSS and SVG.
3. A short decorative marquee or badge strip (CSS animation) using the services or category.
4. About section (id="about") using {{about}} with {{img2_src}} when available.
5. Services section (id="services") as an eye-catching grid or bento layout of the services, each with {{n}} or a small SVG icon.
6. Gallery section (id="gallery") using the photos repeat block, only inside data-if="photos". Add a decorative image band using {{img3_src}} when available.
7. A "How it works" section with three generic steps (contact on WhatsApp, tell us what you need, we take care of it).
8. A short FAQ using details/summary with generic questions answered only with facts you were given, or by pointing to WhatsApp.
9. Contact section (id="contact") with big WhatsApp and Call buttons, {{phone}}, and {{address}} / a directions link ({{map}}) inside conditionals.

QUALITY BAR
Make it look like a custom agency design, not a template: confident typographic hierarchy, deliberate colour palette matched to the business and direction, layered backgrounds, tasteful hover and entrance animations, consistent spacing rhythm, and polished details. Every section must feel different in layout while sharing one visual language.`;

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

function validPage(page) {
  return (
    page &&
    typeof page.body === 'string' &&
    typeof page.css === 'string' &&
    page.body.length > 800 &&
    page.css.length > 400 &&
    page.body.includes('{{wa}}') &&
    /\{\{\s*name\s*\}\}/.test(page.body)
  );
}

export async function generateSitePage(site, direction, opts = {}) {
  if (!geminiEnabled()) return null;
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
    user: `Design the website for this business.\n${JSON.stringify(brief, null, 2)}`,
    maxTokens: 24000,
    temperature: 1,
    timeoutMs: 90000,
    json: true,
  });
  const parsed = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
  const page = {
    themeColor: /^#[0-9a-f]{6}$/i.test(parsed.themeColor || '') ? parsed.themeColor : '#222222',
    fonts: fontLink(parsed.fonts),
    css: String(parsed.css || ''),
    body: String(parsed.body || ''),
    direction,
  };
  if (!validPage(page)) throw new Error('Generated page failed validation');
  return page;
}

export function pageCss(css) {
  return sanitizeCss(css);
}
