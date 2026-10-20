import { designs, lessons } from './db.js';
import { cheapEnabled, cheapJson } from './assistant.js';
import { log } from './log.js';

const DAY = 24 * 60 * 60 * 1000;
const MIN_NEW = 3;

const DISTILL_PROMPT = `You are the head of design at a studio that makes websites for small businesses through WhatsApp.
You receive anonymous records of recent websites: business class, style, palette and fonts, how the owner reacted (paid, liked, asked for a new design, how many changes and what they asked for), and what the automatic audit found.
Write the general lessons that should change how the next websites are designed, so each new owner gets a better first version than the last ones did.
- Base every lesson on a pattern seen in several records, and count them in "evidence".
- Lessons are design principles ("hero photos need more room on phones", "bakery owners keep asking for bigger product photos"), never copies of one site.
- No names, phone numbers, addresses or anything that identifies a customer.
- A paid or liked site is a positive signal but not proof of design quality; repeated change requests and new-design requests are stronger negative signals.
- Keep lessons that still hold from the previous list, drop ones the new data contradicts.
Reply with JSON only: {"lessons":[{"lesson":"one sentence","appliesTo":"all or a business class id","evidence":3}]} with at most 12 lessons.`;

function record(d) {
  return {
    class: d.industry || d.category || '',
    style: d.seed?.archetype?.split(':')[0] || '',
    hero: d.seed?.heroLayout?.split(':')[0] || '',
    fonts: [d.displayFont, d.bodyFont].filter(Boolean).join(' + '),
    palette: [d.dominant, d.accent].filter(Boolean).join(' + '),
    outcome: d.outcome,
    feedback: d.feedback || '',
    changes: d.revisions || 0,
    asked: (d.requests || []).slice(-5),
    audit: d.qa?.issues?.slice(0, 4) || [],
    pictures: (d.images || []).map((x) => `${x.source}${x.review === 'redrawn' ? ' (redrawn)' : ''}`).join(', '),
  };
}

export async function currentLessons() {
  return (await lessons.find({}).sort({ at: -1 }).limit(1).toArray())[0] || null;
}

export async function distillLessons(now = new Date()) {
  if (!cheapEnabled()) return null;
  const last = await currentLessons();
  if (last && now - new Date(last.at) < DAY) return null;
  const since = last?.at ? new Date(last.at) : new Date(0);
  const fresh = await designs.find({ at: { $gt: since } }).limit(200).toArray();
  if (fresh.length < MIN_NEW) return null;
  const recent = await designs.find({}).sort({ at: -1 }).limit(60).toArray();
  const out = await cheapJson({
    system: DISTILL_PROMPT,
    user: `Previous lessons:\n${JSON.stringify(last?.lessons || [])}\n\nRecent websites:\n${JSON.stringify(recent.map(record))}`,
    maxTokens: 2500,
  });
  const list = (Array.isArray(out.lessons) ? out.lessons : [])
    .map((l) => ({
      lesson: String(l?.lesson || '').trim().slice(0, 240),
      appliesTo: String(l?.appliesTo || 'all').trim().slice(0, 40) || 'all',
      evidence: Math.max(1, Math.min(200, Number(l?.evidence) || 1)),
    }))
    .filter((l) => l.lesson && l.evidence >= 2)
    .slice(0, 12);
  if (!list.length) return null;
  const doc = { lessons: list, basedOn: recent.length, version: (last?.version || 0) + 1, at: now };
  await lessons.insertOne(doc);
  log.info('design lessons updated', { version: doc.version, count: list.length });
  return doc;
}

export function lessonsFor(doc, industryId) {
  return (doc?.lessons || []).filter((l) => l.appliesTo === 'all' || l.appliesTo === industryId);
}
