import { designs } from './db.js';
import { currentLessons, lessonsFor } from './lessons.js';

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function fingerprint(brief, page) {
  const fonts = Array.isArray(page?.fontSpec) ? page.fontSpec.map((f) => f?.family).filter(Boolean) : [];
  const m = page?.manifest || {};
  return {
    displayFont: brief?.fonts?.display?.family || m.display_font || fonts[0] || '',
    bodyFont: brief?.fonts?.body?.family || m.body_font || fonts[1] || '',
    accent: brief?.palette?.accent || m.palette?.accent || page?.themeColor || '',
    dominant: brief?.palette?.dominant || m.palette?.dominant || '',
    mode: brief?.mode || '',
    concept: String(brief?.concept || '').slice(0, 200),
    seed: brief?.seed
      ? {
          archetype: brief.seed.archetype,
          colorMood: brief.seed.colorMood,
          typeDirection: brief.seed.typeDirection,
          heroLayout: brief.seed.heroLayout,
          motion: brief.seed.motion,
        }
      : null,
    buttonStyle: String(m.button_style || brief?.buttonStyle || '').slice(0, 160),
    signature: String(m.signature_detail || brief?.signatureDetail || '').slice(0, 160),
  };
}

export async function recordDesign(site, brief, page, images = []) {
  await designs.insertOne({
    slug: site.slug || '',
    category: site.category || '',
    city: site.city || '',
    industry: brief?.industry || '',
    audience: String(brief?.brief?.audience || '').slice(0, 200),
    primaryAction: String(brief?.brief?.primaryAction || '').slice(0, 80),
    ...fingerprint(brief, page),
    images: images.map((x) => ({ slot: x.slot, source: x.ai ? 'ai' : x.stock ? x.credit?.source || 'stock' : 'owner', review: x.review || 'picked', prompt: String(x.prompt || '').slice(0, 300) })),
    qa: page?.qa ? { issues: page.qa.issues.slice(0, 12), checks: page.qa.checks } : null,
    revisions: 0,
    outcome: 'live',
    at: new Date(),
  });
}

export async function noteRevision(slug, request) {
  await designs.findOneAndUpdate(
    { slug },
    { $inc: { revisions: 1 }, $push: { requests: { $each: [String(request).slice(0, 200)], $slice: -10 } } },
    { sort: { at: -1 } }
  );
}

export async function markOutcome(slug, outcome) {
  await designs.findOneAndUpdate({ slug }, { $set: { outcome, outcomeAt: new Date() } }, { sort: { at: -1 } });
}

export async function markFeedback(slug, feedback) {
  await designs.findOneAndUpdate({ slug }, { $set: { feedback, feedbackAt: new Date() } }, { sort: { at: -1 } });
}

export async function designMemory(category, industryId) {
  const recent = await designs.find({}).sort({ at: -1 }).limit(15).toArray();
  let liked = [];
  if (category) {
    const sameKind = { category: new RegExp(`^${escapeRegex(category)}$`, 'i') };
    liked = await designs.find({ ...sameKind, outcome: 'converted' }).sort({ at: -1 }).limit(4).toArray();
  }
  const rejected = await designs.find({ outcome: 'rejected' }).sort({ at: -1 }).limit(6).toArray();
  const learned = lessonsFor(await currentLessons().catch(() => null), industryId);
  return { recent, liked, rejected, lessons: learned };
}

export function memoryNote(memory) {
  if (!memory) return '';
  const lines = [];
  const recent = memory.recent || [];
  if (recent.length) {
    const fonts = [...new Set(recent.flatMap((d) => [d.displayFont, d.bodyFont]).filter(Boolean))];
    lines.push(`Fonts already used (never reuse these display fonts): ${fonts.join(', ') || 'none yet'}`);
    lines.push('Recent design manifests:');
    for (const d of recent.slice(0, 8)) {
      lines.push(
        `- ${d.category || 'business'}: ${d.seed?.archetype?.split(':')[0] || d.concept || 'design'}; ` +
          `palette ${[d.dominant, d.accent].filter(Boolean).join(' + ') || 'unknown'}; ` +
          `fonts ${[d.displayFont, d.bodyFont].filter(Boolean).join(' + ') || 'unknown'}; ` +
          `hero ${d.seed?.heroLayout?.split(':')[0] || 'unknown'}` +
          (d.buttonStyle ? `; buttons ${d.buttonStyle}` : '') +
          (d.signature ? `; signature ${d.signature}` : '')
      );
    }
  }
  if (memory.liked?.length) {
    lines.push(
      'Designs whose owners went on to pay, a feedback signal rather than proof of design quality (learn the general principles, never copy them):',
      ...memory.liked.map((d) => `- ${d.concept} (${d.mode}, accent ${d.accent}, ${d.displayFont} + ${d.bodyFont})`)
    );
  }
  if (memory.lessons?.length) {
    lines.push(
      'LESSONS FROM EARLIER OWNERS (apply these so this website starts better than the ones before it):',
      ...memory.lessons.map((l) => `- ${l.lesson} (seen ${l.evidence} times)`)
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
