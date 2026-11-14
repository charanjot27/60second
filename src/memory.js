import { designs } from './db.js';
import { currentLessons, lessonsFor } from './lessons.js';
import { log } from './log.js';
import { embedTexts, embedModelId, embeddingsEnabled } from './embed.js';
import { currentInspirations } from './inspirations.js';

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

const strip = (html) => String(html || '').replace(/<[^>]+>/g, ' ').replace(/\{\{[^}]+\}\}/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();

export function pageOutline(body) {
  const html = String(body || '').replace(/<template[^>]*>|<\/template>/gi, '').replace(/<svg[\s\S]*?<\/svg>/gi, '<svg></svg>');
  const blocks = [];
  const re = /<(section|header|footer)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
  let m;
  while ((m = re.exec(html)) && blocks.length < 16) {
    const attrs = m[2];
    const id = attrs.match(/\bid="([^"]+)"/)?.[1] || '';
    const hooks = [...new Set([...m[0].matchAll(/\b(data-[a-z-]+)(?==|\s|>)/g)].map((x) => x[1]).filter((x) => !/^data-(?:if|each|i|lg|d|panel|tab)$/.test(x)))];
    const heading = strip(m[3].match(/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/i)?.[1] || '').slice(0, 90);
    const parts = [...new Set([...m[3].matchAll(/<(article|figure|ul|ol|dl|details|blockquote|nav|address|img|button|a)\b/gi)].map((x) => x[1].toLowerCase()))];
    blocks.push({ tag: m[1].toLowerCase(), id, heading, parts, hooks: hooks.slice(0, 8) });
  }
  return blocks;
}

function footerOutline(body) {
  const html = String(body || '');
  const at = html.search(/<footer\b(?![\s\S]*<footer\b)/i);
  if (at < 0) return '';
  return html
    .slice(at)
    .replace(/<svg[\s\S]*?<\/svg>/gi, '<svg/>')
    .replace(/>\s*([^<]{60,})</g, (_, t) => `>${t.slice(0, 60)}…<`)
    .replace(/\s+/g, ' ')
    .slice(0, 1800);
}

export function profileText(site, brief) {
  return [
    site.category,
    brief?.industry || site.industry,
    site.city,
    (site.services || []).join(', '),
    String(site.description || '').slice(0, 300),
  ]
    .filter(Boolean)
    .join('. ');
}

export async function embedText(text) {
  if (!embeddingsEnabled() || !text) return null;
  try {
    const [vector] = await embedTexts([String(text).slice(0, 4000)], 'SEMANTIC_SIMILARITY');
    return vector?.length ? vector : null;
  } catch (err) {
    log.warn('embedding failed', { error: err.message.slice(0, 160) });
    return null;
  }
}

export function cosine(a, b) {
  if (!a?.length || a.length !== b?.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

const words = (text) => new Set(String(text || '').toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || []);

export function overlap(a, b) {
  const x = words(a);
  const y = words(b);
  if (!x.size || !y.size) return 0;
  let shared = 0;
  for (const w of x) if (y.has(w)) shared++;
  return shared / Math.min(x.size, y.size);
}

export async function similarDesigns(site, industryId, k = 3) {
  const profile = profileText(site, { industry: industryId });
  const [vector, pool] = await Promise.all([embedText(profile), designs.find({}).sort({ at: -1 }).limit(400).toArray()]);
  const scored = pool
    .filter((d) => d.outline?.length && d.slug !== site.slug && d.outcome !== 'rejected' && d.feedback !== 'negative')
    .map((d) => {
      const semantic = vector && d.embedding && (d.embeddingModel || 'gemini:gemini-embedding-001:256') === embedModelId() ? cosine(vector, d.embedding) : 0;
      const lexical = overlap(profile, d.profile || d.category);
      const sameIndustry = industryId && d.industry === industryId && industryId !== 'general';
      const match = Math.max(semantic, lexical) + (sameIndustry ? 0.15 : 0);
      const quality = (d.outcome === 'converted' ? 0.1 : 0) + (d.feedback === 'positive' ? 0.1 : 0) - Math.min(0.1, (d.revisions || 0) * 0.02);
      return { d, match, score: match + quality };
    })
    .filter((x) => x.match >= (vector ? 0.62 : 0.3))
    .sort((a, b) => b.score - a.score);
  const seen = new Set();
  return scored
    .filter(({ d }) => !seen.has(d.slug) && seen.add(d.slug))
    .slice(0, k)
    .map(({ d, match }) => ({ ...d, match: Number(match.toFixed(2)) }));
}

export function referenceNote(memory) {
  const refs = memory?.references || [];
  if (!refs.length) return '';
  const reaction = (d) =>
    d.outcome === 'converted' ? 'the owner went on to pay' : d.feedback === 'positive' ? 'the owner liked it' : d.revisions ? `${d.revisions} changes requested: ${(d.requests || []).slice(-3).join('; ')}` : 'live';
  return [
    'REFERENCE LIBRARY (retrieved from earlier websites built for similar businesses; use them like a senior designer uses a swipe file):',
    'Learn what worked for this kind of business: which sections and features visitors needed, the order, the depth of content, how the footer was composed and what owners asked to change. Then design something new that is better. Never copy their palette, fonts, wording or layout one to one.',
    ...refs.map(
      (d, i) =>
        `\nReference ${i + 1}: ${d.category || 'business'}${d.city ? ` in ${d.city}` : ''} (similarity ${d.match}; ${reaction(d)})\n` +
        `Concept: ${d.concept || 'unknown'}\n` +
        `Sections: ${d.outline
          .map((b) => `${b.tag}${b.id ? `#${b.id}` : ''}${b.heading ? ` "${b.heading}"` : ''}${b.parts?.length ? ` [${b.parts.join(' ')}]` : ''}${b.hooks?.length ? ` {${b.hooks.join(' ')}}` : ''}`)
          .join(' → ')}` +
        (d.footer ? `\nFooter markup outline: ${d.footer}` : '')
    ),
  ].join('\n');
}

export async function recordDesign(site, brief, page, images = [], spend = null) {
  const profile = profileText(site, brief);
  const embedding = await embedText(profile);
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
    profile,
    ...(embedding ? { embedding, embeddingModel: embedModelId() } : {}),
    outline: pageOutline(page?.body),
    footer: footerOutline(page?.body),
    revisions: 0,
    ...(spend ? { spend: { claudeUsd: spend.claudeUsd, imageUsd: spend.imageUsd, calls: spend.calls.slice(0, 20) } } : {}),
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

export async function designMemory(category, industryId, site = null) {
  const recent = await designs.find({}).sort({ at: -1 }).limit(15).toArray();
  let liked = [];
  if (category) {
    const sameKind = { category: new RegExp(`^${escapeRegex(category)}$`, 'i') };
    liked = await designs.find({ ...sameKind, outcome: 'converted' }).sort({ at: -1 }).limit(4).toArray();
  }
  const rejected = await designs.find({ outcome: 'rejected' }).sort({ at: -1 }).limit(6).toArray();
  const learned = lessonsFor(await currentLessons().catch(() => null), industryId);
  const references = site ? await similarDesigns(site, industryId).catch((err) => (log.warn('reference lookup failed', { error: err.message }), [])) : [];
  if (references.length) log.info('reference designs found', { count: references.length, matches: references.map((d) => `${d.slug}:${d.match}`) });
  const inspirations = await currentInspirations();
  return { recent, liked, rejected, lessons: learned, references, inspirations };
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
