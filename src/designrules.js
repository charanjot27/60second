export const ARCHETYPES = [
  'Swiss International: strict grid, flush-left type, oversized numerals, hairline rules',
  'Editorial magazine: serif headlines, multi-column copy, pull quotes, captions',
  'Soft brutalism: bold blocks, heavy borders, raw structure, friendly colour',
  'Japandi minimal: calm, natural textures, generous space, low contrast accents',
  'Art Deco revival: geometric ornament, symmetry, fan and step motifs, metallic accents',
  'Retro 70s print: warm rounded type, sunbursts, stacked colour bands',
  'Neo-Bauhaus: primary geometric shapes, bold composition, circles and quarter arcs',
  'Quiet luxury: restrained palette, fine lines, small caps, lots of air',
  'Organic botanical: soft curves, leaf and stem line art, blob-free natural forms',
  'Industrial workshop: stencil feel, technical labels, rivets, safety-stripe accents',
  'Playful pop: chunky shapes, sticker badges, bouncy type, cut-out frames',
  'Heritage craft: ornamental borders, traditional motifs, stamped seals',
  'Cinematic dark: deep tones, dramatic light, film grain, letterbox crops',
  'Architectural blueprint: grid lines, dimension marks, cool precision',
  'Hand-made zine: cut-paper collage, tape strips, doodles, photocopy texture',
  'Mid-century modern: atomic shapes, warm wood tones, offset layouts',
  'Gallery whitespace: museum restraint, single framed images, caption labels',
  'Tropical vibrant: lush colour, layered foliage silhouettes, sun-drenched warmth',
  'Newsprint: masthead, column rules, dateline, bold editorial headlines',
  'Futuristic clean: precise layout, luminous accent lines, technical type',
];

export const COLOR_MOODS = [
  'terracotta and clay with warm cream',
  'deep forest green and brass',
  'saffron and charcoal',
  'ink blue and bone cream',
  'sage and blush',
  'oxblood and parchment',
  'mustard and teal',
  'midnight navy and copper',
  'coral and sand',
  'olive and lemon',
  'plum and peach',
  'warm stone monochrome with one vivid accent',
  'mint and graphite',
  'rust and faded denim',
  'rose and moss',
  'turmeric and deep indigo dye',
];

export const TYPE_DIRECTIONS = [
  'high-contrast didone serif display',
  'chunky geometric grotesk display',
  'condensed industrial display',
  'rounded friendly sans display',
  'elegant script accent paired with a clean serif',
  'wide extended sans display',
  'old-style humanist serif display',
  'slab serif with character',
  'monospace-accented technical display',
  'expressive soft serif display',
];

export const HERO_LAYOUTS = [
  'split screen: text on one side, a framed image on the other overlapping the edge',
  'full-bleed image with the headline set inside a solid colour block',
  'oversized typography first, the image as a small inset',
  'asymmetric collage of two or three framed images around the headline',
  'vertical side label with a tall image and a stacked headline',
  'poster composition with one huge word behind the image',
  'big headline over a horizontal scrolling strip of images',
  'arch-shaped image beside an editorial headline',
  'bento grid: a headline tile beside image and service tiles',
  'ticker band above a bold statement headline',
];

export const MOTIONS = [
  'calm: slow fades, long gentle easing, small distances',
  'playful: springy overshoot, small wiggles and squish on press',
  'snappy: fast, precise, short distances, crisp easing',
  'cinematic: large masked reveals, wipes and slow zooms',
  'luxe: subtle, slow, elegant shimmer and fine line draws',
  'energetic: bold slides, quick staggers, confident scale',
];

export const BANNED_DISPLAY_FONTS = ['inter', 'poppins', 'montserrat', 'roboto', 'open sans', 'lato', 'raleway'];

const pick = (list, avoid, rand) => {
  const pool = list.filter((x) => !avoid.has(x));
  const from = pool.length ? pool : list;
  return from[Math.floor(rand() * from.length)];
};

const subset = (pool, allowed) => {
  if (!allowed?.length) return pool;
  const list = pool.filter((item) => allowed.some((name) => item.toLowerCase().startsWith(name.toLowerCase())));
  return list.length ? list : pool;
};

export function pickSeed(memory, rand = Math.random, industry = null) {
  const recent = (memory?.recent || []).slice(0, 6).map((d) => d.seed || {});
  const used = (key) => new Set(recent.map((s) => s[key]).filter(Boolean));
  return {
    archetype: pick(subset(ARCHETYPES, industry?.archetypes), used('archetype'), rand),
    colorMood: pick(subset(COLOR_MOODS, industry?.moods), used('colorMood'), rand),
    typeDirection: pick(subset(TYPE_DIRECTIONS, industry?.types), used('typeDirection'), rand),
    heroLayout: pick(HERO_LAYOUTS, used('heroLayout'), rand),
    motion: pick(subset(MOTIONS, industry?.motions), used('motion'), rand),
  };
}

export function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance([r, g, b]) {
  const c = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

export function contrast(a, b) {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  if (!x || !y) return null;
  const [hi, lo] = [luminance(x), luminance(y)].sort((p, q) => q - p);
  return (hi + 0.05) / (lo + 0.05);
}

export function hsl(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const [r, g, b] = rgb.map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (!d) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s, l };
}

const hueGap = (a, b) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));

export const SCRIPT_FONTS = {
  pa: ['Noto Sans Gurmukhi', 'Noto Serif Gurmukhi', 'Mukta Mahee', 'Baloo Paaji 2', 'Anek Gurmukhi', 'Tiro Gurmukhi'],
  hi: ['Noto Sans Devanagari', 'Noto Serif Devanagari', 'Mukta', 'Hind', 'Tiro Devanagari Hindi', 'Baloo 2', 'Anek Devanagari', 'Martel', 'Martel Sans', 'Rozha One', 'Yatra One', 'Kalam', 'Karma', 'Khand', 'Rajdhani', 'Teko', 'Poppins', 'Amita', 'Eczar', 'Sura', 'Biryani', 'Sarala', 'Palanquin'],
};

export function supportsScript(families, language) {
  const list = SCRIPT_FONTS[language];
  if (!list) return true;
  return families.some((f) => list.some((x) => x.toLowerCase() === String(f || '').trim().toLowerCase()));
}

const close = (a, b, gap) => {
  const x = hsl(a);
  const y = hsl(b);
  return Boolean(x && y && x.s > 0.2 && y.s > 0.2 && hueGap(x.h, y.h) < gap);
};

export function similarity(brief, d) {
  const same = (a, b) => Boolean(a && b) && String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
  const shared = [];
  if (same(brief?.fonts?.display?.family, d.displayFont)) shared.push(['display font', 2]);
  if (same(brief?.fonts?.body?.family, d.bodyFont)) shared.push(['body font', 1]);
  if (close(brief?.palette?.accent, d.accent, 18)) shared.push(['accent hue', 1.5]);
  if (close(brief?.palette?.dominant, d.dominant, 18)) shared.push(['dominant hue', 1]);
  if (same(brief?.seed?.heroLayout, d.seed?.heroLayout)) shared.push(['hero layout', 1]);
  if (same(brief?.seed?.archetype, d.seed?.archetype)) shared.push(['style archetype', 1]);
  if (same(brief?.mode, d.mode)) shared.push(['light or dark mode', 0.5]);
  return { score: shared.reduce((n, [, w]) => n + w, 0), shared: shared.map(([k]) => k) };
}

export function briefIssues(brief, memory, { language } = {}) {
  const issues = [];
  const display = String(brief?.fonts?.display?.family || '').trim();
  if (BANNED_DISPLAY_FONTS.includes(display.toLowerCase())) {
    issues.push(`${display} is not allowed as the display font; choose a characterful display face.`);
  }
  const p = brief?.palette || {};
  const ratio = contrast(p.ink, p.bg);
  if (ratio !== null && ratio < 4.5) issues.push(`ink ${p.ink} on background ${p.bg} has contrast ${ratio.toFixed(1)}:1, it must be at least 4.5:1.`);
  const muted = contrast(p.muted, p.bg);
  if (muted !== null && muted < 4.5) issues.push(`secondary text ${p.muted} on background ${p.bg} has contrast ${muted.toFixed(1)}:1, it must be at least 4.5:1.`);
  const btn = contrast(p.onAccent, p.accent);
  if (btn !== null && btn < 4.5) issues.push(`button text ${p.onAccent} on accent ${p.accent} has contrast ${btn.toFixed(1)}:1, it must be at least 4.5:1.`);
  if (/^#?0{6}$/i.test(String(p.ink || '')) && /^#?f{6}$/i.test(String(p.bg || ''))) {
    issues.push('pure black on pure white is not allowed; use a tinted ink and background.');
  }
  const bgRgb = hexToRgb(p.bg);
  if (bgRgb && bgRgb[0] === bgRgb[1] && bgRgb[1] === bgRgb[2]) {
    issues.push(`the background ${p.bg} is a plain grey; neutrals must be tinted (warm cream, cool fog, olive grey).`);
  }
  const accent = hsl(p.accent);
  if (accent && accent.h >= 228 && accent.h <= 258 && accent.s > 0.45 && accent.l > 0.4 && accent.l < 0.75) {
    issues.push(`the accent ${p.accent} is generic tech indigo or blue; pick another hue family.`);
  }
  const families = [brief?.fonts?.display?.family, brief?.fonts?.body?.family, brief?.fonts?.script?.family];
  if (!supportsScript(families, language)) {
    issues.push(`the page has ${language === 'pa' ? 'Punjabi (Gurmukhi)' : 'Hindi (Devanagari)'} text, but none of the fonts contain that script; add "script" with one of: ${SCRIPT_FONTS[language].slice(0, 6).join(', ')}.`);
  }
  for (const d of (memory?.recent || []).slice(0, 10)) {
    const { score, shared } = similarity(brief, d);
    if (score >= 3.5) {
      issues.push(`the design repeats a recent ${d.category || 'site'} (same ${shared.join(', ')}); change at least two of the palette hue family, the fonts and the hero layout.`);
      break;
    }
  }
  return issues;
}
