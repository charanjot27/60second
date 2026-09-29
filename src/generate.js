import sanitizeHtml from 'sanitize-html';
import { config } from './config.js';
import { log } from './log.js';
import { callGemini, geminiEnabled } from './gemini.js';
import { callClaude, claudeEnabled } from './claude.js';
import { escapeHtml } from './render.js';

const DIRECTIONS = [
  'Calm editorial: warm off-white paper (#FAFAF9), near-black text, Instrument Serif display with Inter body, generous whitespace, thin rules, one muted terracotta accent.',
  'Swiss precise: strict 12-column grid, Inter Tight display with Inter body, large numerals, hairline borders, cool off-white base, one deep blue-green accent.',
  'Dark technical: near-black (#0A0A0A) base, Inter Tight with Inter, subtle 1px borders at 8% white, faint grid texture, one amber accent used sparingly.',
  'Warm craft: cream base, Fraunces display with Figtree body, soft rounded cards, faint paper grain, one deep green accent, welcoming and human.',
  'Modern minimal: Manrope headings with IBM Plex Sans body, light grey base, large type, asymmetric layout, one confident coral accent.',
  'Editorial dark serif: charcoal base, Instrument Serif display with Inter body, generous margins, elegant thin dividers, one soft gold accent.',
  'Fresh clinical: white base, Manrope with IBM Plex Sans, crisp cards with soft shadows, airy spacing, one calm teal accent.',
  'Bold poster: off-white base, oversized Inter Tight headlines, black borders, tight grid, one vivid red-orange accent, confident and direct.',
];

const SYSTEM_PROMPT = `You are a senior product designer and front-end engineer who has shipped sites for companies like Linear, Stripe, Vercel and Arc. Build a production-quality, highly interactive one-page website for ONE small local business in India. It must look like a real design team spent weeks on it, not like AI generated it.

OUTPUT FORMAT (exactly this, no JSON, no markdown fences, no commentary):
===META===
{"themeColor":"#rrggbb","fonts":[{"family":"Font Name","weights":"400;500;600"}]}
===CSS===
(all the CSS)
===BODY===
(the HTML fragment)
===END===

TYPOGRAPHY (strict)
- Use a professional Google Fonts pairing, max 2 families. Choose from: Inter Tight (headings) + Inter (body); Instrument Serif (display, weight 400 only) + Inter (body); Manrope (headings) + IBM Plex Sans (body); Fraunces (display) + Figtree (body). For Hindi or Punjabi text add the matching Noto Sans (Devanagari or Gurmukhi) as the body fallback.
- Tight letter-spacing on large headings (-0.02em to -0.04em), body line-height 1.6, clear type scale (roughly 72/48/32/20/16/14px with clamp()), headings in sentence case.

COLOUR (strict)
- Restrained palette defined as CSS variables: one neutral base (off-white like #FAFAF9 or near-black like #0A0A0A), two or three grays, and ONE accent colour used sparingly (buttons, highlights, links). Pick the accent from the business and design direction.
- NO purple-to-blue gradients, NO neon glows, NO rainbow gradients, NO heavy glassmorphism. Depth only through 1px borders at 8 to 10 percent opacity, soft shadows, and an optional faint grain made from gradients.
- Support light and dark mode: define the variables for light, and override them inside @media (prefers-color-scheme: dark).

IMAGERY AND ICONS
- Use only the provided image placeholders. No external URLs, no cartoon illustrations, no 3D blobs, no emoji as icons, no stock clichés. When there is no picture, compose a refined typographic or geometric hero from CSS instead.
- Show pictures in clean frames: rounded corners, a 1px border, a soft shadow, slightly layered or offset for depth.
- Icons: inline SVG only, one consistent set style (Lucide-like, 24px grid, stroke-width 1.5, round caps and joins, currentColor).
- Do not invent "trusted by" logos, clients or testimonials.

INTERACTIVITY (priority). Use these ready-made hooks, a small script wires them up. Everything must also work without the script.
- class "reveal" on any element you want to fade and slide up when it scrolls into view. Only hide it inside the selector .js .reveal (opacity 0, translateY 16px, transition 500ms ease-out) and show it with .js .reveal.in. The script sets a --d variable you can use as transition-delay to stagger siblings. Use it for headings, paragraphs, cards and images.
- class "spot" on cards: the script sets --mx and --my (cursor position inside the card). Build a subtle spotlight border or glow with radial-gradient(circle at var(--mx) var(--my), ...) in a ::before layer, visible on :hover.
- class "nav" on the top navigation bar: the script adds "stuck" after scrolling. Style .nav.stuck to shrink the padding and gain a blurred translucent background with a 1px bottom border. Keep the nav position:sticky.
- class "count" on an element containing only a number from the placeholders {{services_count}} or {{photos_count}}: it animates from 0. Use it only where the number is truthful, for example "{{services_count}} things we do".
- Pure CSS: marquee strips that pause on hover, hover lift on buttons (translateY(-1px) with a shadow), border highlights, a pinned section using position:sticky where a visual stays while step cards scroll past, details/summary FAQ with a smooth open animation (use interpolate-size: allow-keywords and ::details-content transitions as progressive enhancement), and scroll-driven animation guarded by @supports (animation-timeline: view()).
- Animations 200 to 600ms with ease-out curves. Nothing bouncy or gimmicky. Respect prefers-reduced-motion.

LAYOUT
- Avoid "centered hero, three cards, CTA". Use asymmetric grids, a bento grid for services, and varied section rhythm with generous whitespace. Max content width about 1200px, an 8px spacing system, mobile-first at 360px with no horizontal scroll, then @media (min-width:900px) upgrades with real layout changes.
- Contrast at least AA (4.5:1), tap targets at least 48px, visible :focus-visible states.

COPY
- Specific, human copy for this kind of business, in the business language and script (language is given: en, hi or pa). Keep English placeholders exactly as written.
- Never use: revolutionize, unlock, seamless, supercharge, elevate, "in today's fast-paced world", "welcome to our website", lorem ipsum.
- Be concrete, but NEVER invent facts: no prices, statistics, percentages, years in business, awards, addresses, hours, certifications, testimonials, reviews or client names. Use only what you are given. Generic microcopy such as "Message us on WhatsApp" is fine.

TECHNICAL RULES
- BODY is an HTML fragment for inside <body>, wrapped in one <div class="page">. Allowed tags: header nav main section article aside footer div span p h1-h4 ul ol li a img figure figcaption button strong em br hr blockquote details summary dl dt dd address small svg with path circle rect g defs linearGradient radialGradient stop line polyline polygon ellipse. NO script, style, link, form, input, iframe, object, and NO inline style attributes: class names only. The classes reveal, spot, nav and count are the hooks above.
- CSS: plain CSS, no @import, no @font-face, no url(...). At least 300 lines of considered CSS.
- Do NOT include the site footer, the sticky bottom contact bar, or the photo lightbox: the system adds them.

PLACEHOLDERS (the system fills them safely, use them instead of real values)
Text: {{name}} {{category}} {{city}} {{tagline}} {{about}} {{phone}} {{address}} {{services_count}} {{photos_count}}
Links (inside href): {{wa}} {{tel}} {{map}}
Images (inside src): {{hero_src}} {{img2_src}} {{img3_src}} with sizes {{hero_w}} {{hero_h}} {{img2_w}} {{img2_h}} {{img3_w}} {{img3_h}}
Repeat block: <template data-each="services"> ... {{item}} {{n}} ... </template>   ({{n}} is 01, 02, 03 ...)
Repeat block for the gallery, each photo written exactly as:
<template data-each="photos"><figure class="ph"><button type="button" data-i="{{i}}"><img src="{{src}}" data-lg="{{lg}}" alt="{{alt}}" width="{{w}}" height="{{h}}" loading="lazy"></button></figure></template>
Conditional block: <template data-if="KEY"> ... </template> with KEY one of: services photos hero_img img2 img3 address map tagline about. A data-each may sit inside a data-if, but never put data-if inside data-each.

REQUIRED SECTIONS in this order, each with a clearly different layout but one shared visual language
1. Sticky navigation (class nav): the name, anchor links to #about #services #gallery #contact, and a WhatsApp button (href="{{wa}}").
2. Hero: a large sentence-case headline built from {{name}} and {{tagline}}, a supporting line, primary WhatsApp button (href="{{wa}}") and secondary Call button (href="{{tel}}"). The wrapper of the two buttons must have id="cta". Show {{hero_src}} inside data-if="hero_img" in a framed, layered composition with a small badge from {{category}} and {{city}}.
3. A slow marquee strip of the services or category words in large type, pausing on hover.
4. About (id="about"): {{about}} in an editorial layout with {{img2_src}} when available.
5. Services (id="services"): a bento grid where every service is a spot card with {{n}} and a small SVG icon.
6. Optional full-width picture band with {{img3_src}} inside data-if="img3" and a short statement.
7. Gallery (id="gallery"): the photos repeat block in a masonry or mosaic layout, inside data-if="photos".
8. How it works: three connected steps in a pinned or sticky arrangement (message on WhatsApp, tell us what you need, we take care of it).
9. FAQ: 3 to 4 details/summary items with generic questions answered only from given facts or by pointing to WhatsApp.
10. Contact (id="contact"): a bold closing panel with WhatsApp and Call buttons, {{phone}}, and {{address}} and a directions link ({{map}}) inside data-if.

QUALITY BAR
Confident typographic hierarchy, deliberate restrained palette, pixel-clean alignment, consistent spacing rhythm, tasteful reveal and hover motion, and details a design team would sweat. It should feel expensive, calm and unmistakably made for this business.`;

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
      services_count: (site.services || []).length,
      photos_count: gallery.length,
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

async function attempt(site, direction, opts, provider, timeoutMs, note) {
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
  const user = `Design the website for this business.${note ? ` ${note}` : ''}\n${JSON.stringify(brief, null, 2)}`;
  const raw =
    provider === 'claude'
      ? await callClaude({ model: config.ai.designModel, system: SYSTEM_PROMPT, user, maxTokens: 24000, temperature: 1, timeoutMs })
      : await callGemini({ system: SYSTEM_PROMPT, user, maxTokens: 30000, temperature: 1, timeoutMs });
  const { meta, css, body } = parseSections(raw);
  const page = {
    themeColor: /^#[0-9a-f]{6}$/i.test(meta.themeColor || '') ? meta.themeColor : '#222222',
    fonts: fontLink(meta.fonts),
    fontSpec: meta.fonts,
    css,
    body,
    direction,
  };
  if (!validPage(page)) throw new Error(`Generated page too small (${body.length} html, ${css.length} css)`);
  return page;
}

const REVIEW_PROMPT = `You are the art director reviewing a one-page website draft written by a junior designer. Audit it hard against the original brief rules, then return an improved, complete replacement.

Check and fix: weak or generic headline and copy; banned buzzwords; invented facts, prices, stats or reviews; inconsistent spacing, type scale or icon style; more than one accent colour; poor contrast; cramped or oversized mobile layout; missing sections; missing hover, focus or reveal states; images without alt text or without border-radius and aspect-ratio; placeholders left unfilled; anything that looks templated. Then raise the craft: sharper copy, stronger hierarchy, more considered whitespace, more refined details.

Keep every {{placeholder}}, <template data-each> and <template data-if> block working. Keep the same output format exactly (===META=== ... ===CSS=== ... ===BODY=== ... ===END===) and return the whole page, not a diff.`;

async function refine(site, page, direction, timeoutMs) {
  const user = `Original rules:\n${SYSTEM_PROMPT}\n\nDirection: ${direction}\nBusiness: ${site.businessName}, ${site.category}, ${site.city}\n\nDraft to review:\n===META===\n${JSON.stringify({ themeColor: page.themeColor, fonts: page.fontSpec })}\n===CSS===\n${page.css}\n===BODY===\n${page.body}\n===END===`;
  const raw = await callClaude({ model: config.ai.designModel, system: REVIEW_PROMPT, user, maxTokens: 24000, temperature: 0.8, timeoutMs });
  const { meta, css, body } = parseSections(raw);
  const improved = {
    themeColor: /^#[0-9a-f]{6}$/i.test(meta.themeColor || '') ? meta.themeColor : page.themeColor,
    fonts: meta.fonts ? fontLink(meta.fonts) : page.fonts,
    fontSpec: meta.fonts || page.fontSpec,
    css,
    body,
    direction,
  };
  return validPage(improved) ? improved : page;
}

export function designerEnabled() {
  return claudeEnabled() || geminiEnabled();
}

export async function generateSitePage(site, direction, opts = {}) {
  const providers = [];
  if (claudeEnabled()) providers.push(['claude', 240000]);
  if (geminiEnabled()) providers.push(['gemini', 110000]);
  const note = 'Your previous answer was rejected. Follow the output format exactly and make the page rich and complete.';
  let lastError = null;
  for (const [provider, timeoutMs] of providers) {
    for (const tries of [0, 1]) {
      try {
        const draft = await attempt(site, direction, opts, provider, timeoutMs, tries ? note : '');
        if (provider !== 'claude') return draft;
        try {
          return await refine(site, draft, direction, timeoutMs);
        } catch (err) {
          log.warn('page review failed', { error: err.message });
          return draft;
        }
      } catch (err) {
        lastError = err;
        log.warn('page attempt failed', { provider, error: err.message });
      }
    }
  }
  if (lastError) throw lastError;
  return null;
}

export function pageCss(css) {
  return sanitizeCss(css);
}
