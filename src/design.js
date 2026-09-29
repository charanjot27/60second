import crypto from 'node:crypto';

export const FONT_PAIRS = [
  { display: 'Playfair Display', body: 'Inter', weights: 'Playfair+Display:wght@600;800', bodyQ: 'Inter:wght@400;600', serif: true },
  { display: 'Fraunces', body: 'DM Sans', weights: 'Fraunces:wght@600;800', bodyQ: 'DM+Sans:wght@400;600', serif: true },
  { display: 'Bricolage Grotesque', body: 'Inter', weights: 'Bricolage+Grotesque:wght@600;800', bodyQ: 'Inter:wght@400;600', serif: false },
  { display: 'Sora', body: 'Manrope', weights: 'Sora:wght@600;800', bodyQ: 'Manrope:wght@400;600', serif: false },
  { display: 'Cormorant Garamond', body: 'Work Sans', weights: 'Cormorant+Garamond:wght@600;700', bodyQ: 'Work+Sans:wght@400;600', serif: true },
  { display: 'Space Grotesk', body: 'DM Sans', weights: 'Space+Grotesk:wght@600;700', bodyQ: 'DM+Sans:wght@400;600', serif: false },
  { display: 'Lora', body: 'Nunito Sans', weights: 'Lora:wght@600;700', bodyQ: 'Nunito+Sans:wght@400;600', serif: true },
  { display: 'Outfit', body: 'Outfit', weights: 'Outfit:wght@600;800', bodyQ: '', serif: false },
];

const LAYOUTS = ['split', 'center', 'full', 'editorial'];
const SERVICE_STYLES = ['cards', 'list', 'numbered'];
const GALLERY_STYLES = ['grid', 'masonry', 'strip'];
const RADII = [6, 14, 24, 32];
const MODES = ['light', 'light', 'tinted', 'dark'];

const MOODS = [
  { match: /bak|cake|food|tiffin|kitchen|cafe|restaurant|sweet|catering|mithai/i, hues: [8, 42], fonts: [0, 1, 6] },
  { match: /salon|beauty|spa|makeup|parlou?r|boutique|tailor|fashion|jewel/i, hues: [300, 350], fonts: [0, 4, 1] },
  { match: /repair|mechanic|plumb|electric|garage|hardware|fitness|gym/i, hues: [195, 230], fonts: [5, 3, 2] },
  { match: /tutor|coach|class|school|academy|teach|study/i, hues: [140, 200], fonts: [7, 3, 2] },
];

function rng(seedText) {
  let h = crypto.createHash('sha256').update(seedText).digest();
  let i = 0;
  return () => {
    if (i + 4 > h.length) {
      h = crypto.createHash('sha256').update(h).digest();
      i = 0;
    }
    const n = h.readUInt32BE(i);
    i += 4;
    return n / 0x100000000;
  };
}

const pick = (r, list) => list[Math.floor(r() * list.length)];

export function makeDesign({ slug = '', businessName = '', category = '' }, salt = '') {
  const r = rng(`${slug}|${businessName}|${salt}`);
  const mood = MOODS.find((m) => m.match.test(`${category} ${businessName}`));
  const hue = mood
    ? Math.round(mood.hues[0] + r() * (mood.hues[1] - mood.hues[0]))
    : Math.round(r() * 360);
  const fontIndex = mood ? pick(r, mood.fonts) : Math.floor(r() * FONT_PAIRS.length);
  return {
    salt,
    layout: pick(r, LAYOUTS),
    services: pick(r, SERVICE_STYLES),
    gallery: pick(r, GALLERY_STYLES),
    radius: pick(r, RADII),
    mode: pick(r, MODES),
    hue,
    sat: 55 + Math.round(r() * 30),
    font: fontIndex,
    flip: r() > 0.5,
  };
}

export function palette(d) {
  const { hue: h, sat: s, mode } = d;
  const accent = `hsl(${h} ${s}% 38%)`;
  const accent2 = `hsl(${(h + 28) % 360} ${Math.min(s + 10, 90)}% 52%)`;
  if (mode === 'dark') {
    return {
      bg: `hsl(${h} 28% 8%)`,
      surface: `hsl(${h} 24% 13%)`,
      ink: `hsl(${h} 20% 94%)`,
      muted: `hsl(${h} 12% 68%)`,
      line: `hsl(${h} 18% 22%)`,
      accent: `hsl(${h} ${s}% 62%)`,
      accent2,
      onAccent: `hsl(${h} 30% 8%)`,
      scheme: 'dark',
    };
  }
  return {
    bg: mode === 'tinted' ? `hsl(${h} 45% 95%)` : `hsl(${h} 25% 99%)`,
    surface: mode === 'tinted' ? `hsl(${h} 40% 100%)` : `hsl(${h} 35% 96%)`,
    ink: `hsl(${h} 30% 10%)`,
    muted: `hsl(${h} 12% 38%)`,
    line: `hsl(${h} 25% 88%)`,
    accent,
    accent2,
    onAccent: '#fff',
    scheme: 'light',
  };
}
