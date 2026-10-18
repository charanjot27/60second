import { designs } from './db.js';

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function fingerprint(brief, page) {
  const fonts = Array.isArray(page?.fontSpec) ? page.fontSpec.map((f) => f?.family).filter(Boolean) : [];
  return {
    displayFont: brief?.fonts?.display?.family || fonts[0] || '',
    bodyFont: brief?.fonts?.body?.family || fonts[1] || '',
    accent: brief?.palette?.accent || page?.themeColor || '',
    mode: brief?.mode || '',
    concept: String(brief?.concept || '').slice(0, 200),
  };
}

export async function recordDesign(site, brief, page) {
  await designs.insertOne({
    slug: site.slug || '',
    category: site.category || '',
    city: site.city || '',
    ...fingerprint(brief, page),
    outcome: 'live',
    at: new Date(),
  });
}

export async function markOutcome(slug, outcome) {
  await designs.findOneAndUpdate({ slug }, { $set: { outcome, outcomeAt: new Date() } }, { sort: { at: -1 } });
}

export async function designMemory(category) {
  const recent = await designs.find({}).sort({ at: -1 }).limit(15).toArray();
  let liked = [];
  if (category) {
    const sameKind = { category: new RegExp(`^${escapeRegex(category)}$`, 'i') };
    liked = await designs.find({ ...sameKind, outcome: 'converted' }).sort({ at: -1 }).limit(4).toArray();
  }
  const rejected = await designs.find({ outcome: 'rejected' }).sort({ at: -1 }).limit(6).toArray();
  return { recent, liked, rejected };
}

export function memoryNote(memory) {
  if (!memory) return '';
  const lines = [];
  const recent = memory.recent || [];
  if (recent.length) {
    const fonts = [...new Set(recent.flatMap((d) => [d.displayFont, d.bodyFont]).filter(Boolean))];
    const accents = [...new Set(recent.map((d) => d.accent).filter(Boolean))];
    lines.push(
      'Recently used on other sites, so do NOT reuse these font families or near-identical accent colours:',
      `- fonts: ${fonts.join(', ') || 'none yet'}`,
      `- accents: ${accents.join(', ') || 'none yet'}`,
      `- concepts: ${recent.map((d) => d.concept).filter(Boolean).slice(0, 6).join(' | ') || 'none yet'}`
    );
  }
  if (memory.liked?.length) {
    lines.push(
      'Designs that turned similar businesses into paying customers (learn the principles, never copy them):',
      ...memory.liked.map((d) => `- ${d.concept} (${d.mode}, accent ${d.accent}, ${d.displayFont} + ${d.bodyFont})`)
    );
  }
  if (memory.rejected?.length) {
    lines.push(
      'Designs owners rejected and asked to redo (avoid these directions):',
      ...memory.rejected.map((d) => `- ${d.concept}`)
    );
  }
  return lines.join('\n');
}

export function repeatsRecentFont(brief, memory, window = 10) {
  const display = String(brief?.fonts?.display?.family || '').toLowerCase();
  if (!display) return false;
  return (memory?.recent || []).slice(0, window).some((d) => String(d.displayFont || '').toLowerCase() === display);
}
