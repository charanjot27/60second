import sanitizeHtml from 'sanitize-html';
import { config } from './config.js';
import { log } from './log.js';
import { callGemini, geminiEnabled } from './gemini.js';
import { callClaude, claudeEnabled } from './claude.js';
import { escapeHtml } from './render.js';

const SEEDS = [
  'quiet luxury', 'sunlit and airy', 'bold and graphic', 'editorial magazine', 'warm and handmade', 'crisp and technical',
  'heritage and craft', 'playful and bright', 'calm and clinical', 'moody and cinematic', 'Swiss grid precision',
  'soft and organic', 'confident and modern', 'retro print', 'architectural', 'festive and rich', 'minimal monochrome with one bold colour',
  'earthy and natural', 'high-contrast poster', 'gallery-like whitespace',
];

const ART_PROMPT = `You are the creative director of a top brand studio. For one small business in India you create the art direction for its one-page website, which a designer-engineer will build next.

Every business must get its own identity. Derive the palette, typography, layout and imagery from what this business is, who its customers are and how it should feel: a property dealer, a bakery and a coaching centre must look nothing alike, and two bakeries should not look alike either. The seed moods you receive are optional nudges for variety; use one only if it suits the business.

Reply with JSON only:
{
  "concept": "the one-sentence idea behind the design",
  "audience": "who the customers are and what they care about",
  "voice": "how the copy should sound",
  "mode": "light" or "dark",
  "palette": {"bg": "#hex", "surface": "#hex", "ink": "#hex", "muted": "#hex", "line": "#hex", "accent": "#hex", "onAccent": "#hex", "support": "#hex"},
  "fonts": {"display": {"family": "Google Fonts family", "weights": "400;700"}, "body": {"family": "Google Fonts family", "weights": "400;500;600"}},
  "layout": ["one short line per section describing its composition, in page order"],
  "signature": ["the two or three memorable visual or interaction moments of this site"],
  "headline": "a hero headline written for this business",
  "imagePrompts": ["four picture briefs"]
}

Palette: accessible contrast (ink on bg at least 7:1, onAccent on accent at least 4.5:1). No purple-to-blue gradients or neon unless the business truly calls for it.
Fonts: real Google Fonts families with the weights they actually offer; a characterful display face paired with a highly readable body face. For Hindi use Noto Sans Devanagari or Mukta for body text, for Punjabi use Noto Sans Gurmukhi or Mukta Mahee.
Picture briefs: photorealistic scenes that fit this exact kind of business in its city or region, each with subject, setting, time of day, light, lens and composition, and colour grading that matches the palette. Brief 1 is the wide hero, 2 is a tall portrait, 3 is a wide atmospheric band, 4 is a square close detail. No text, signage or logos in the pictures, no identifiable faces (people seen from behind, hands or at a distance are fine), and nothing the business did not say it offers.`;

const PAGE_PROMPT = `You are a principal designer-engineer. You build one-page websites for small Indian businesses that look like a top studio spent weeks on them: distinctive, confident, alive with considered motion, and unmistakably made for this business. You receive the business facts and an art direction from your creative director. Realise that direction with real craft, and improve on it wherever your judgement says so.

What great looks like
- A hero that lands in the first second on a 390px-wide phone: a strong headline, a clear offer, the WhatsApp action, and a striking visual composition.
- A deliberate type system from the art direction: fluid sizes with clamp(), tight tracking on large headings, comfortable body line-height, a clear hierarchy.
- The palette as CSS custom properties, the accent used with restraint, and depth from layering, overlaps, fine borders, soft shadows, grain or gradients made in CSS.
- Motion and interaction that feel alive but purposeful: staggered scroll reveals, hover and focus states on everything interactive, and several of the interaction hooks below where they genuinely help, plus CSS craft such as marquees, sticky or pinned sections, animated underlines, image zoom on hover, and scroll-driven effects behind @supports (animation-timeline: view()).
- Layout rhythm: every section composed differently (split, bento, full-bleed band, overlapping image and text, horizontal scroller, sticky side title, and so on), never the generic centred hero with three cards. Mobile first, then real layout upgrades at 720px and 1100px, with no horizontal overflow at 360px.
- Copy written for this business and its customers: specific, warm and concrete, in the requested language. Write the section copy and a short description for each service yourself, grounded in the facts you are given.

Honesty, never broken
- Never invent facts: no prices, years in business, customer counts, ratings, reviews, testimonials, awards, certifications, partner logos, addresses, opening hours, listings or offers. Describing what the business does and how working with it feels is fine.
- Never use: revolutionize, unlock, seamless, supercharge, elevate, "in today's fast-paced world", "welcome to our website", lorem ipsum.

OUTPUT FORMAT, exactly this with no markdown fences and nothing before or after:
===META===
{"themeColor":"#rrggbb","fonts":[{"family":"Display Font","weights":"400;700"},{"family":"Body Font","weights":"400;500;600"}]}
===CSS===
(all the CSS)
===BODY===
(the HTML fragment)
===END===

TECHNICAL CONTRACT
- BODY is an HTML fragment for inside <body>. Allowed tags: header nav main section article aside footer div span p h1-h4 ul ol li a img figure figcaption button strong em b i small mark sup br hr blockquote details summary dl dt dd address, and inline svg (path circle rect g defs linearGradient radialGradient stop line polyline polygon ellipse text tspan pattern mask clipPath use symbol). No script, style, link, form, input, iframe, video or inline style attributes: class names only.
- CSS is plain CSS: no @import, no @font-face, no url(). Use as much CSS as the design needs.
- Pictures only through the image placeholders below; never external URLs. Icons as inline SVG in one consistent style.
- Do not add the site footer, the sticky bottom contact bar or the photo lightbox: the system adds them. Leave about 90px of bottom padding on the last section for the contact bar on phones.
- Respect prefers-reduced-motion and give every interactive element a visible :focus-visible state.

INTERACTION HOOKS (a trusted script wires these up; everything must still look right without it)
- class "reveal": fades in when scrolled into view. Hide it only under .js .reveal and show it with .js .reveal.in; use transition-delay: var(--d) for the automatic stagger between siblings.
- data-split on a heading with plain text: its words become span.w with --i set; animate them under .js [data-split].in .w with a delay from --i.
- class "count" on an element that only contains a number placeholder such as {{services_count}}: counts up from zero.
- class "spot" on cards: --mx and --my follow the cursor for a spotlight made with radial-gradient in a pseudo-element.
- data-tilt on a card or picture frame: a gentle 3D tilt toward the cursor. data-magnetic on a button: it drifts toward the cursor. The script sets transform on these elements, so do not also give them reveal or a transform of your own.
- data-speed="0.15" (between -0.5 and 0.5) on a decorative element or picture for parallax; the script sets its transform.
- class "nav" on the top bar: gains "stuck" after scrolling; its in-page links gain "active" for the section in view. A button with data-menu inside it toggles "open" on the nav for a mobile menu.
- data-rotate on an element whose children are alternatives (for example words in a headline): the child in view has class "on", cycling every few seconds.
- data-tabs on a wrapper holding buttons with data-tab="x" and panels with data-panel="x": the selected ones get class "on".
- data-carousel on a wrapper holding a scroller with data-track and buttons with data-prev and data-next.
- The root element gets --scroll (0 to 1, for a progress bar with transform: scaleX(var(--scroll))) and, on desktop, --cx and --cy (cursor position, for a glow following the cursor).
- Every img gets class "loaded" once it has loaded.

PLACEHOLDERS (the system fills these safely; use them instead of real values)
Text: {{name}} {{category}} {{city}} {{tagline}} {{about}} {{phone}} {{address}} {{services_count}} {{photos_count}} {{year}}
Links, only inside href: {{wa}} (WhatsApp chat) {{tel}} {{map}}
Pictures, only inside src: {{hero_src}} {{img2_src}} {{img3_src}} {{img4_src}}, with sizes {{hero_w}} {{hero_h}} and so on, and alt texts {{hero_alt}} {{img2_alt}} {{img3_alt}} {{img4_alt}}. The hero is landscape 3:2, img2 portrait 4:5, img3 landscape 3:2, img4 square.
Repeat blocks: <template data-each="services"> ... {{item}} {{n}} ... </template> ({{n}} is 01, 02 ...), if you prefer it to writing the service cards out yourself.
Owner photo gallery, each photo written exactly as:
<template data-each="photos"><figure class="ph"><button type="button" data-i="{{i}}"><img src="{{src}}" data-lg="{{lg}}" alt="{{alt}}" width="{{w}}" height="{{h}}" loading="lazy"></button></figure></template>
You may add your own classes to that figure, and wrap the block in any layout you like.
Conditional blocks: <template data-if="KEY"> ... </template> with KEY one of: services photos hero_img img2 img3 img4 address map tagline about. Wrap every picture in its data-if so the page still works if a picture is missing. A data-each may sit inside a data-if, but never a data-if inside a data-each.

REQUIRED
- A sticky top bar with class "nav": the name, links to #about #services #contact (and #gallery when there are photos), and a WhatsApp button.
- A hero with a wrapper id="cta" holding the primary WhatsApp button (href="{{wa}}") and a Call button (href="{{tel}}").
- Sections with id="about", id="services" and id="contact"; the contact section has WhatsApp and Call buttons, {{phone}}, and {{address}} with a directions link to {{map}} inside data-if blocks.
- When the owner sent photos, a section with id="gallery" using the photo gallery block inside <template data-if="photos">.
- Anything else the art direction calls for.`;

const EDIT_PROMPT = `You are the designer-engineer who built this business's one-page website. The owner sent a change request on WhatsApp. Apply it faithfully, with the same craft and the same technical contract as the original build, and leave everything else as it was. If the request is vague, choose the most sensible interpretation. If part of it asks for something dishonest (made-up reviews, numbers, awards or offers) or unsafe, skip that part and say so kindly.

Reply exactly in this format, with nothing before or after:
===SUMMARY===
One or two short, friendly sentences for the owner, in the language they wrote in, saying what you changed.
===DATA===
JSON with only the business facts that change: any of "businessName", "tagline", "description", "services" (array), "city", "category". Use {} when no facts change.
===IMAGES===
JSON array of pictures to redraw, as [{"slot": 1, "prompt": "a detailed photorealistic brief"}], with slot 1 the landscape hero, 2 portrait, 3 landscape band, 4 square detail. Use [] when no pictures change.
===META===
Either NONE (when the page markup and styles need no change, for example a pure fact or picture change), or the complete updated page: the META JSON, then ===CSS=== with the full CSS, then ===BODY=== with the full HTML.
===END===

Keep every placeholder, template block, required id and hook working. Facts such as the name, phone, address and services reach the page through placeholders, so a change of fact needs only DATA.`;

function pickSeeds(salt) {
  const pool = [...SEEDS];
  let n = [...String(salt)].reduce((a, c) => a + c.charCodeAt(0), 0) + Math.floor(Math.random() * 10000);
  const out = [];
  for (let k = 0; k < 3 && pool.length; k++) {
    out.push(pool.splice(n % pool.length, 1)[0]);
    n = Math.floor(n / 7) + 13;
  }
  return out;
}

function facts(site) {
  return {
    businessName: site.businessName,
    category: site.category,
    city: site.city,
    tagline: site.tagline,
    description: site.description,
    services: site.services || [],
    language: site.language || 'en',
    ownerPhotoCount: (site.photos || []).filter((p) => !p.ai).length,
    hasAddress: Boolean(site.location?.address || site.location?.name),
    hasMap: site.location?.lat != null,
  };
}

const TAGS = [
  'header', 'nav', 'main', 'section', 'article', 'aside', 'footer', 'div', 'span', 'p', 'h1', 'h2', 'h3', 'h4',
  'ul', 'ol', 'li', 'a', 'img', 'figure', 'figcaption', 'button', 'strong', 'em', 'b', 'i', 'br', 'hr',
  'blockquote', 'details', 'summary', 'dl', 'dt', 'dd', 'address', 'small', 'mark', 'sup',
  'svg', 'path', 'circle', 'rect', 'g', 'defs', 'linearGradient', 'radialGradient', 'stop', 'line', 'polyline',
  'polygon', 'ellipse', 'text', 'tspan', 'pattern', 'mask', 'clipPath', 'use', 'symbol',
];
const HOOK_ATTRS = [
  'data-tilt', 'data-magnetic', 'data-speed', 'data-rotate', 'data-tabs', 'data-tab', 'data-panel',
  'data-carousel', 'data-track', 'data-prev', 'data-next', 'data-split', 'data-menu',
];
const SVG_ATTRS = [
  'viewBox', 'd', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray',
  'stroke-dashoffset', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'dx', 'dy', 'width', 'height', 'points', 'x1', 'y1',
  'x2', 'y2', 'offset', 'stop-color', 'stop-opacity', 'opacity', 'fill-opacity', 'stroke-opacity', 'transform',
  'preserveAspectRatio', 'fill-rule', 'clip-rule', 'id', 'gradientUnits', 'gradientTransform', 'patternUnits',
  'clip-path', 'mask', 'text-anchor', 'font-size', 'font-weight', 'letter-spacing', 'href', 'fx', 'fy',
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
  return sanitizeHtml(String(html || '').slice(0, 160000), {
    allowedTags: TAGS,
    allowedAttributes: {
      '*': ['class', 'id', 'aria-label', 'aria-hidden', 'aria-labelledby', 'aria-expanded', 'aria-controls', 'aria-selected', 'aria-live', 'role', 'title', 'tabindex', ...HOOK_ATTRS],
      a: ['href', 'target', 'rel', 'class', 'id', 'aria-label', ...HOOK_ATTRS],
      img: ['src', 'srcset', 'sizes', 'alt', 'width', 'height', 'loading', 'decoding', 'fetchpriority', 'data-lg', 'class', 'id'],
      button: ['type', 'data-i', 'class', 'id', 'aria-label', 'aria-expanded', 'aria-controls', 'aria-selected', ...HOOK_ATTRS],
      details: ['open', 'class', 'id'],
      svg: ['xmlns', 'class', 'id', 'aria-hidden', 'role', ...SVG_ATTRS],
      path: ['class', ...SVG_ATTRS],
      text: ['class', ...SVG_ATTRS],
      tspan: ['class', ...SVG_ATTRS],
      pattern: ['class', ...SVG_ATTRS],
      mask: ['class', ...SVG_ATTRS],
      clipPath: ['class', ...SVG_ATTRS],
      use: ['class', ...SVG_ATTRS],
      symbol: ['class', ...SVG_ATTRS],
      circle: ['class', ...SVG_ATTRS],
      rect: ['class', ...SVG_ATTRS],
      g: ['class', ...SVG_ATTRS],
      defs: [],
      linearGradient: ['id', 'x1', 'y1', 'x2', 'y2', 'gradientUnits', 'gradientTransform'],
      radialGradient: ['id', 'cx', 'cy', 'r', 'fx', 'fy', 'gradientUnits', 'gradientTransform'],
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
      use: (tag, attribs) => {
        const next = { ...attribs };
        if (!/^#[\w-]+$/.test(next.href || '')) delete next.href;
        return { tagName: 'use', attribs: next };
      },
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
  let out = String(css || '').slice(0, 120000);
  out = out.replace(/\/\*[\s\S]*?\*\//g, '');
  out = out.replace(/@import[^;]*;?/gi, '');
  out = out.replace(/@font-face\s*\{[^}]*\}/gi, '');
  out = out.replace(/url\s*\([^)]*\)/gi, 'none');
  out = out.replace(/expression\s*\(|javascript:|behavior\s*:|-moz-binding|<\/?style|<script/gi, '');
  return out;
}

function fontLink(fonts) {
  const families = (Array.isArray(fonts) ? fonts : [])
    .slice(0, 3)
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
  const img4 = ai[3] || own[3] || img3;
  const gallery = own.length ? own : ai;
  const phone = String(site.phone || site.ownerPhone || '').replace(/\D/g, '');
  const address = site.location?.address || site.location?.name || '';
  const map =
    site.location?.lat != null && site.location?.lng != null
      ? `https://www.google.com/maps/search/?api=1&query=${site.location.lat},${site.location.lng}`
      : '';
  const img = (p, prefix, what) => ({
    [`${prefix}_src`]: p?.lg || '',
    [`${prefix}_w`]: p?.w || 1200,
    [`${prefix}_h`]: p?.h || 1200,
    [`${prefix}_alt`]: [site.businessName, what].filter(Boolean).join(', '),
  });
  return {
    flags: {
      services: site.services || [],
      photos: gallery,
      hero_img: hero,
      img2: img2,
      img3: img3,
      img4: img4,
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
      year: new Date().getFullYear(),
      ...img(hero, 'hero', site.category),
      ...img(img2, 'img2', site.city),
      ...img(img3, 'img3', site.category),
      ...img(img4, 'img4', 'detail'),
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
  return page.body.length > 3000 && page.css.length > 2500 && page.body.includes('{{wa}}');
}

function toPage(meta, css, body) {
  return {
    themeColor: /^#[0-9a-f]{6}$/i.test(meta.themeColor || '') ? meta.themeColor : '#222222',
    fonts: fontLink(meta.fonts),
    fontSpec: meta.fonts,
    css,
    body,
  };
}

function parseJsonLoose(raw) {
  const text = String(raw || '');
  const start = text.search(/[[{]/);
  const end = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'));
  if (start < 0 || end < start) throw new Error('No JSON found');
  return JSON.parse(text.slice(start, end + 1));
}

function providers() {
  const list = [];
  if (claudeEnabled()) list.push('claude');
  if (geminiEnabled()) list.push('gemini');
  return list;
}

function ask(provider, { system, user, maxTokens, effort, timeoutMs, json }) {
  if (provider === 'claude') {
    return callClaude({ model: config.ai.designModel, system, user, maxTokens, effort, timeoutMs });
  }
  return callGemini({ system, user, maxTokens: Math.min(maxTokens, 60000), temperature: 1, timeoutMs, json });
}

export function designerEnabled() {
  return providers().length > 0;
}

function cleanBrief(brief) {
  const prompts = Array.isArray(brief?.imagePrompts)
    ? brief.imagePrompts.map((p) => String(p || '').trim().slice(0, 900)).filter(Boolean).slice(0, 4)
    : [];
  return { ...brief, imagePrompts: prompts };
}

export async function createArtDirection(site) {
  const user = `Business facts:\n${JSON.stringify(facts(site), null, 2)}\n\nSeed moods: ${pickSeeds(site.slug || site.businessName).join(', ')}`;
  for (const provider of providers()) {
    try {
      const raw = await ask(provider, { system: ART_PROMPT, user, maxTokens: 16000, effort: 'medium', timeoutMs: 180000, json: true });
      return cleanBrief(parseJsonLoose(raw));
    } catch (err) {
      log.warn('art direction failed', { provider, error: err.message });
    }
  }
  return null;
}

export async function generateSitePage(site, brief) {
  const user =
    `Business facts:\n${JSON.stringify(facts(site), null, 2)}\n\n` +
    `Art direction:\n${JSON.stringify(brief ? { ...brief, imagePrompts: undefined } : { note: 'Create your own art direction for this business.' }, null, 2)}\n\n` +
    'Build the website now.';
  let lastError = null;
  for (const provider of providers()) {
    for (const retry of [false, true]) {
      try {
        const raw = await ask(provider, {
          system: PAGE_PROMPT,
          user: retry ? `${user}\nYour previous answer could not be used. Follow the output format exactly and return the complete page.` : user,
          maxTokens: 64000,
          effort: 'high',
          timeoutMs: provider === 'claude' ? 900000 : 180000,
        });
        const { meta, css, body } = parseSections(raw);
        const page = toPage(meta, css, body);
        if (!validPage(page)) throw new Error(`Generated page too small (${body.length} html, ${css.length} css)`);
        return { ...page, concept: brief?.concept || '' };
      } catch (err) {
        lastError = err;
        log.warn('page attempt failed', { provider, error: err.message });
      }
    }
  }
  if (lastError) throw lastError;
  return null;
}

function section(text, name, next) {
  const m = new RegExp(`===${name}===([\\s\\S]*?)(?:===${next}===|$)`).exec(text);
  return m ? m[1].trim() : '';
}

export function parseEdit(raw) {
  const text = String(raw || '').replace(/^```[a-z]*\n?|```$/gim, '');
  const summary = section(text, 'SUMMARY', 'DATA');
  let data = {};
  let images = [];
  try {
    data = parseJsonLoose(section(text, 'DATA', 'IMAGES') || '{}');
  } catch {
    data = {};
  }
  try {
    images = parseJsonLoose(section(text, 'IMAGES', 'META') || '[]');
  } catch {
    images = [];
  }
  let page = null;
  const metaStart = text.indexOf('===META===');
  if (metaStart >= 0 && !/^\s*NONE\b/i.test(text.slice(metaStart + 10, metaStart + 40))) {
    const { meta, css, body } = parseSections(text.slice(metaStart));
    const candidate = toPage(meta, css, body);
    if (validPage(candidate)) page = candidate;
  }
  const allowed = ['businessName', 'tagline', 'description', 'services', 'city', 'category'];
  const fields = {};
  for (const key of allowed) {
    if (data?.[key] == null) continue;
    if (key === 'services') {
      if (Array.isArray(data.services)) fields.services = data.services.map((x) => String(x).trim().slice(0, 60)).filter(Boolean).slice(0, 12);
    } else {
      fields[key] = String(data[key]).trim().slice(0, key === 'description' ? 700 : 120);
    }
  }
  const redraw = (Array.isArray(images) ? images : [])
    .map((x) => ({ slot: Number(x?.slot), prompt: String(x?.prompt || '').trim().slice(0, 900) }))
    .filter((x) => x.slot >= 1 && x.slot <= 4 && x.prompt)
    .slice(0, 4);
  return { summary: summary.slice(0, 600), fields, images: redraw, page };
}

export async function editSite(site, request) {
  const current = site.page?.body
    ? `Current page:\n===META===\n${JSON.stringify({ themeColor: site.page.themeColor, fonts: site.page.fontSpec || [] })}\n===CSS===\n${site.page.css}\n===BODY===\n${site.page.body}\n===END===`
    : 'This website uses the standard layout, so only business facts and nothing else can change: always answer META with NONE and IMAGES with [].';
  const pictures = (site.aiImages || []).map((x, i) => `slot ${i + 1}: ${x.prompt || 'no brief saved'}`).join('\n');
  const user =
    `Business facts:\n${JSON.stringify(facts(site), null, 2)}\n\n` +
    (pictures ? `Current AI pictures:\n${pictures}\n\n` : '') +
    `${current}\n\nOwner's request:\n"""${String(request).slice(0, 1500)}"""`;
  let lastError = null;
  for (const provider of providers()) {
    try {
      const raw = await ask(provider, {
        system: EDIT_PROMPT,
        user,
        maxTokens: 64000,
        effort: 'high',
        timeoutMs: provider === 'claude' ? 900000 : 180000,
      });
      const result = parseEdit(raw);
      if (!site.page?.body) {
        result.page = null;
        result.images = [];
      }
      return result;
    } catch (err) {
      lastError = err;
      log.warn('edit attempt failed', { provider, error: err.message });
    }
  }
  throw lastError || new Error('No designer AI configured');
}

export function pageCss(css) {
  return sanitizeCss(css);
}
