import sanitizeHtml from 'sanitize-html';
import { config } from './config.js';
import { log } from './log.js';
import { callGemini, geminiEnabled } from './gemini.js';
import { callClaude, claudeEnabled } from './claude.js';
import { escapeHtml } from './render.js';
import { memoryNote } from './memory.js';
import { pickSeed, briefIssues } from './designrules.js';

const ART_PROMPT = `You are an award-level brand designer and creative director. You design one-of-a-kind websites for small businesses, and every site must look as if a different studio designed it. If two of your sites were placed side by side, nobody should be able to tell they came from the same system. You write the art direction for one business; a designer-engineer builds the page from it next.

STEP 1: UNDERSTAND THE BUSINESS FIRST
- What it sells and who buys it (age, income, mindset).
- The emotion a customer should feel in the first 3 seconds (trust for a clinic, appetite for a bakery, power for a gym, calm for a spa, prestige for a jeweller).
- The single most important action (usually a WhatsApp message, sometimes a call or a visit).
- Local or cultural cues from the details (city, language, festivals, traditions), used tastefully when they fit.

THE DESIGN SEED IS MANDATORY
You receive a seed: style archetype, colour mood, typography direction, hero layout and motion personality, chosen at random by the system. Follow it. The business decides how far to push it: a brutalist seed for a children's clinic becomes soft brutalism (bold structure, friendly colours, rounded type). Never let the seed produce something unsuitable for the business.

COLOUR
- A custom palette: one dominant colour, one or two supporting colours, one accent, and tinted neutrals (warm cream, cool fog, olive grey, never plain grey).
- Derive it from the colour mood, the business and, when there are photos, tones that appear in or complement them.
- It must differ clearly from every recent palette you are shown: change the hue family, not just the shade.
- Banned: purple-to-blue gradients, #6366F1-style indigo, generic tech blue, pure #000 on pure #FFF, rainbow gradients.
- Contrast: ink on background at least 4.5:1, button text on the accent at least 4.5:1.

TYPOGRAPHY
- Google Fonts only: a characterful display face that carries the personality, paired with a highly readable body face, both real families with weights they actually offer.
- Match the display face to the business (a high-contrast serif for a boutique, a chunky grotesk for a gym, a rounded sans for a kids' brand, a condensed face for streetwear).
- Never use Inter, Poppins, Montserrat, Roboto, Open Sans, Lato or Raleway as the display font, and never reuse a recent display font.
- For Hindi text use Noto Sans Devanagari or Mukta as the body face; for Punjabi use Noto Sans Gurmukhi or Mukta Mahee.

Reply with JSON only:
{
  "fundamentals": {"customers": "who buys and their mindset", "emotion": "what they should feel in 3 seconds", "whyChoose": "why choose this business, from the facts only", "primaryAction": "the single most important action", "localCues": "cultural or local cues worth using, or empty"},
  "seed": {"archetype": "as given", "colorMood": "as given", "typeDirection": "as given", "heroLayout": "as given", "motion": "as given", "adaptation": "how you adapted the seed to suit this business"},
  "concept": "the one-sentence idea behind the design",
  "voice": "how the copy should sound",
  "mode": "light" or "dark",
  "palette": {"bg": "#hex", "surface": "#hex", "ink": "#hex", "muted": "#hex", "line": "#hex", "dominant": "#hex", "supporting": ["#hex"], "accent": "#hex", "onAccent": "#hex", "neutral": "#hex"},
  "fonts": {"display": {"family": "Google Fonts family", "weights": "400;700"}, "body": {"family": "Google Fonts family", "weights": "400;500;600"}},
  "typographicMoment": "the one typographic moment (an oversized word, italic within a heading, outlined text, a vertical label, a huge number)",
  "layout": ["one short line per section describing its composition, in page order; every section different"],
  "imageTreatment": "how pictures are presented (duotone, grain, arch masks, polaroid frames, hard crops, soft shadows)",
  "decorativeSystem": "one decorative visual system that fits the business (doodles for a cafe, grid lines for an engineer, botanical line art for a florist)",
  "buttonStyle": "the special button behaviour (fill sweep, text slide-and-swap, self-drawing border, arrow nudge, glow pulse, squishy press, magnetic pull)",
  "signatureDetail": "one delight detail suited to the business (steam rising from a cup, sparkle on jewellery, a bouncing dumbbell, a custom cursor)",
  "sound": false,
  "headline": "a hero headline written for this business, never 'Welcome to ...'",
  "imagePrompts": ["four picture briefs"]
}

Sound: true only if it truly suits the business (a kids' play zone, a game cafe, a music studio, a playful bakery); false for clinics, law, finance and most services.
Picture briefs: photorealistic scenes that fit this exact kind of business in its city or region, each with subject, setting, time of day, light, lens and composition, and colour grading that matches the palette. Brief 1 is the wide hero, 2 a tall portrait, 3 a wide atmospheric band, 4 a square close detail. No text, signage or logos in the pictures, no identifiable faces (people from behind, hands or at a distance are fine), and nothing the business did not say it offers.
Before answering, ask yourself: "Could someone spot this as coming from the same generator as the recent designs?" If yes, change the palette, fonts or layout until the answer is no.`;

const PAGE_PROMPT = `You are an award-level web designer and front-end developer. You build one-of-a-kind one-page websites for small businesses, and every site must look as if a different studio designed it. You receive the business facts and an art direction (with a mandatory design seed) from your creative director. Realise it with real craft and improve on it wherever your judgement says so.

LAYOUT
- Follow the hero layout in the art direction. The hero lands in the first second on a 390px phone: the headline, a clear offer, the WhatsApp action and a striking composition.
- Avoid the generic template rhythm (centred hero, three icon cards, testimonials, footer). Vary the structure: asymmetric grids, overlapping images, full-bleed bands, sticky side panels, horizontal scroll strips, bento grids, editorial columns. Every section looks different from the one before it while sharing one visual language.
- Mobile first and still designed on phones, then real layout upgrades at 720px and 1100px, with no horizontal overflow at 360px.
- Sections, adapted to the business: hero, about or story, products or services, gallery when there are photos, a trust section built only from real facts, location with a map link only when an address exists, and a strong contact section with WhatsApp and Call buttons.

COLOUR AND TYPE
- The palette as CSS custom properties exactly from the art direction; tinted neutrals; never the same box-shadow on everything.
- A deliberate type scale: very large headlines with clamp(), tight letter-spacing on display text, body line-height 1.5 to 1.7, and the typographic moment from the art direction.

IMAGERY
- The owner's photos come first, presented with the image treatment from the art direction, with object-fit so nothing distorts.
- Add the decorative visual system from the art direction (inline SVG or CSS).
- When a picture block is empty, compose premium visuals from CSS and inline SVG in the palette (refined iconography, typographic art, abstract shapes, patterns), never empty boxes or cartoon clip art.

INTERACTION AND MOTION (follow the motion personality)
- Buttons feel special: build the button style from the art direction in CSS (a fill sweeping in, text sliding up and swapping, a border that draws itself, an arrow that moves, a glow pulse, a squishy press), and add data-magnetic where a magnetic pull suits it.
- One standout hero entrance animation.
- Scroll reveals that are staggered and never all the same: combine class "reveal" with your own variant classes (from-left, scale-in, mask-up, blur-in and so on) styled under .js.
- Hover and focus states on every interactive element.
- The signature delight detail from the art direction (CSS keyframes and SVG, or the cursor hook).
- Animate transform and opacity only. Respect prefers-reduced-motion. Nothing may block reading or delay the call to action.

SOUND
- Only when the art direction sets sound to true: add one small, elegant button with data-sound-toggle (sound is off until the visitor turns it on) and style its pressed state with [aria-pressed="true"]. The trusted script plays soft generated clicks on buttons and links; add data-sound="chime" to the one or two elements that deserve a little chime. Otherwise add no sound at all.

COPY
- Warm, specific copy in the tone of the business and in the requested language (English plus their language if they mix). Write real section copy and a short description for each service, grounded in the facts.
- Never use: "Welcome to ...", "We provide the best quality services", revolutionize, unlock, seamless, supercharge, elevate, "in today's fast-paced world", lorem ipsum.

HONESTY, NEVER BROKEN
- Never invent facts: no prices, years in business, customer counts, ratings, reviews, testimonials, awards, certifications, partner logos, addresses, opening hours or timings, email addresses, social media handles, listings or offers. A trust section uses only what the owner actually said.
- Only show an address or a map when the matching placeholder block has data, never write one yourself.

ANTI-PATTERNS THAT MAKE A SITE LOOK GENERATED
Glassmorphism cards on a gradient blob background, emoji or icon bullets in a row of three, identical rounded cards everywhere, the same shadow on everything, centred text in every section, a footer that repeats the nav.

OUTPUT FORMAT, exactly this with no markdown fences and nothing before or after:
===META===
{"themeColor":"#rrggbb","fonts":[{"family":"Display Font","weights":"400;700"},{"family":"Body Font","weights":"400;500;600"}],"manifest":{"style_archetype":"","palette":{"dominant":"","supporting":[],"accent":"","neutral":""},"display_font":"","body_font":"","hero_layout":"","button_style":"","signature_detail":"","sound":false}}
===CSS===
(all the CSS)
===BODY===
(the HTML fragment)
===END===

TECHNICAL CONTRACT
- BODY is an HTML fragment for inside <body>. Allowed tags: header nav main section article aside footer div span p h1-h4 ul ol li a img figure figcaption button strong em b i small mark sup br hr blockquote details summary dl dt dd address, and inline svg (path circle rect g defs linearGradient radialGradient stop line polyline polygon ellipse text tspan pattern mask clipPath use symbol). No script, style, link, form, input, iframe, video or inline style attributes: class names only. JavaScript is not allowed; all behaviour comes from the hooks below.
- CSS is plain CSS: no @import, no @font-face, no url(). Use as much CSS as the design needs.
- Pictures only through the image placeholders below, never external URLs (no Unsplash). Icons as inline SVG in one consistent style.
- The system adds the page title, meta description, Open Graph tags, a favicon, the site footer, the sticky bottom contact bar, the photo lightbox, an enquiry form and a videos section. Do not add them yourself. Leave about 90px of bottom padding on the last section for the contact bar on phones.
- Give every interactive element a visible :focus-visible state.

INTERACTION HOOKS (a trusted script wires these up; everything must still look right without it)
- class "reveal": appears when scrolled into view. Hide it only under .js .reveal (and your variant classes) and show it with .in; use transition-delay: var(--d) for the automatic stagger between siblings.
- data-split on a heading with plain text: its words become span.w with --i set; animate them under .js [data-split].in .w with a delay from --i.
- class "count" on an element that only contains a number placeholder such as {{services_count}}: counts up from zero.
- class "spot" on cards: --mx and --my follow the cursor for a spotlight made with radial-gradient in a pseudo-element.
- data-tilt on a card or picture frame: a gentle 3D tilt toward the cursor. data-magnetic on a button: it drifts toward the cursor. The script sets transform on these elements, so do not also give them reveal or a transform of your own.
- data-speed="0.15" (between -0.5 and 0.5) on a decorative element or picture for parallax; the script sets its transform.
- data-cursor on one decorative element (for example a small circle or an icon): on desktop it follows the pointer as a custom cursor and gains class "hover" over links and buttons. Give it position:fixed, pointer-events:none and a high z-index; it stays hidden on touch screens.
- class "nav" on the top bar: gains "stuck" after scrolling; its in-page links gain "active" for the section in view. A button with data-menu inside it toggles "open" on the nav for a mobile menu.
- data-rotate on an element whose children are alternatives (for example words in a headline): the child in view has class "on", cycling every few seconds.
- data-tabs on a wrapper holding buttons with data-tab="x" and panels with data-panel="x": the selected ones get class "on".
- data-carousel on a wrapper holding a scroller with data-track and buttons with data-prev and data-next.
- data-sound-toggle and data-sound="chime" as described under SOUND.
- The root element gets --scroll (0 to 1, for a progress bar with transform: scaleX(var(--scroll))) and, on desktop, --cx and --cy (cursor position, for a glow following the cursor).
- Every img gets class "loaded" once it has loaded.

PLACEHOLDERS (the system fills these safely; use them instead of real values)
Text: {{name}} {{category}} {{city}} {{tagline}} {{about}} {{phone}} {{address}} {{services_count}} {{photos_count}} {{year}}
Links, only inside href: {{wa}} (WhatsApp chat) {{tel}} {{map}}
Pictures, only inside src: {{hero_src}} {{img2_src}} {{img3_src}} {{img4_src}}, with sizes {{hero_w}} {{hero_h}} and so on, and alt texts {{hero_alt}} {{img2_alt}} {{img3_alt}} {{img4_alt}}. Give every img loading="lazy" except the hero. The hero is landscape 3:2, img2 portrait 4:5, img3 landscape 3:2, img4 square.
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

Before finishing, check yourself: "Could someone spot this as coming from the same generator as the recent designs?" If yes, change the palette, fonts or layout until the answer is no. Then fill in the manifest truthfully.`;

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

function facts(site) {
  return {
    businessName: site.businessName,
    category: site.category,
    city: site.city,
    area: site.area || '',
    tagline: site.tagline,
    description: site.description,
    services: site.services || [],
    ownerWords: String(site.ownerWords || '').slice(0, 1500),
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
  'data-carousel', 'data-track', 'data-prev', 'data-next', 'data-split', 'data-menu', 'data-cursor',
  'data-sound-toggle', 'data-sound', 'aria-pressed',
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

function cleanManifest(m) {
  if (!m || typeof m !== 'object') return null;
  const str = (v) => String(v ?? '').slice(0, 200);
  const hex = (v) => (/^#[0-9a-f]{6}$/i.test(String(v || '')) ? String(v) : '');
  return {
    style_archetype: str(m.style_archetype),
    palette: {
      dominant: hex(m.palette?.dominant),
      supporting: (Array.isArray(m.palette?.supporting) ? m.palette.supporting : []).map(hex).filter(Boolean).slice(0, 3),
      accent: hex(m.palette?.accent),
      neutral: hex(m.palette?.neutral),
    },
    display_font: str(m.display_font),
    body_font: str(m.body_font),
    hero_layout: str(m.hero_layout),
    button_style: str(m.button_style),
    signature_detail: str(m.signature_detail),
    sound: m.sound === true,
  };
}

function toPage(meta, css, body) {
  return {
    themeColor: /^#[0-9a-f]{6}$/i.test(meta.themeColor || '') ? meta.themeColor : '#222222',
    fonts: fontLink(meta.fonts),
    fontSpec: meta.fonts,
    ...(cleanManifest(meta.manifest) ? { manifest: cleanManifest(meta.manifest) } : {}),
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

function seedText(seed) {
  return (
    'DESIGN SEED (mandatory):\n' +
    `- Style archetype: ${seed.archetype}\n` +
    `- Colour mood: ${seed.colorMood}\n` +
    `- Typography direction: ${seed.typeDirection}\n` +
    `- Hero layout: ${seed.heroLayout}\n` +
    `- Motion personality: ${seed.motion}`
  );
}

export async function createArtDirection(site, memory = null) {
  const seed = pickSeed(memory);
  const note = memoryNote(memory);
  const base =
    `Business facts:\n${JSON.stringify(facts(site), null, 2)}\n\n${seedText(seed)}` +
    (note ? `\n\nRECENTLY USED DESIGNS (do not resemble any of these in palette, fonts or layout):\n${note}` : '');
  for (const provider of providers()) {
    try {
      let brief = null;
      let issues = [];
      for (let attempt = 0; attempt < 3; attempt++) {
        const user = attempt
          ? `${base}\n\nYour last art direction broke these rules, fix all of them:\n- ${issues.join('\n- ')}`
          : base;
        const raw = await ask(provider, { system: ART_PROMPT, user, maxTokens: 16000, effort: 'medium', timeoutMs: 180000, json: true });
        brief = cleanBrief(parseJsonLoose(raw));
        issues = briefIssues(brief, memory);
        if (!issues.length) break;
        log.info('art direction revised', { issues: issues.length });
      }
      if (issues.length) log.warn('art direction kept with issues', { issues });
      return { ...brief, seed: { ...seed, adaptation: brief?.seed?.adaptation || '' } };
    } catch (err) {
      log.warn('art direction failed', { provider, error: err.message });
    }
  }
  return null;
}

export async function generateSitePage(site, brief) {
  const user =
    `Business facts:\n${JSON.stringify(facts(site), null, 2)}\n\n` +
    (brief
      ? `Art direction:\n${JSON.stringify({ ...brief, imagePrompts: undefined }, null, 2)}\n\n`
      : `${seedText(pickSeed(null))}\n\nNo art direction is available, so create your own from the business and this seed.\n\n`) +
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
