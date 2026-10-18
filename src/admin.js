import crypto from 'node:crypto';
import { config, siteUrl } from './config.js';
import { sites, leads } from './db.js';
import { accessState } from './billing.js';
import { escapeHtml as e, formatPhone } from './render.js';

const FILTERS = {
  all: 'All',
  paying: 'Paying',
  trial: 'On free trial',
  unpaid: 'Demo, not purchased',
  cancelled: 'Cancelled',
  free: 'Free / legacy',
};

export function bucket(site, now = Date.now()) {
  const state = accessState(site, now);
  if (state === 'cancelled') return 'cancelled';
  if (state === 'expired') return 'unpaid';
  if (state === 'trial') return 'trial';
  if (state === 'suspended') return 'suspended';
  return site.plan === 'paid' ? 'paying' : 'free';
}

export function summarize(list, now = Date.now()) {
  const counts = { all: list.length, paying: 0, trial: 0, unpaid: 0, cancelled: 0, free: 0, suspended: 0 };
  let trials = 0;
  let converted = 0;
  for (const site of list) {
    counts[bucket(site, now)]++;
    if (site.trialEndsAt) trials++;
    if (site.billing?.paidAt) converted++;
  }
  counts.conversion = trials ? Math.round((converted / trials) * 100) : 0;
  return counts;
}

function authorized(req) {
  if (!config.adminPassword) return false;
  const header = String(req.get('authorization') || '');
  if (!header.startsWith('Basic ')) return false;
  const [, password = ''] = Buffer.from(header.slice(6), 'base64').toString('utf8').split(':');
  const a = Buffer.from(crypto.createHash('sha256').update(password).digest('hex'));
  const b = Buffer.from(crypto.createHash('sha256').update(config.adminPassword).digest('hex'));
  return crypto.timingSafeEqual(a, b);
}

function guard(req, res) {
  if (!config.adminPassword) {
    res.sendStatus(404);
    return false;
  }
  if (!authorized(req)) {
    res.set('WWW-Authenticate', 'Basic realm="admin", charset="UTF-8"').sendStatus(401);
    return false;
  }
  return true;
}

const date = (d) => (d ? new Date(d).toISOString().slice(0, 16).replace('T', ' ') : '');

async function load() {
  const list = await sites
    .find({}, { projection: { page: 0, history: 0, design: 0 } })
    .sort({ createdAt: -1 })
    .limit(2000)
    .toArray();
  const leadCounts = Object.fromEntries(
    (await leads.aggregate([{ $group: { _id: '$slug', n: { $sum: 1 } } }]).toArray()).map((x) => [x._id, x.n])
  );
  return { list, leadCounts };
}

const CSS = `body{margin:0;font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;background:#ececed;color:#0e1116}
main{max-width:1280px;margin:0 auto;padding:28px 20px 60px}h1{margin:0 0 4px;font-size:26px}.sub{color:#5a6270;margin:0 0 22px}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:22px}
.kpi{background:#fff;border:1px solid #d4d6da;border-radius:12px;padding:14px 16px;text-decoration:none;color:inherit}
.kpi b{display:block;font-size:28px;line-height:1.1}.kpi span{color:#5a6270;font-size:13px}.kpi.on{border:2px solid #15803d}
table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #d4d6da;border-radius:12px;overflow:hidden}
th,td{text-align:left;padding:9px 10px;border-bottom:1px solid #e6e7ea;vertical-align:top}th{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#5a6270;background:#f7f7f8}
.pill{display:inline-block;padding:2px 9px;border-radius:99px;font-size:12px;font-weight:600}
.paying{background:#dcfce7;color:#166534}.trial{background:#e0f2fe;color:#075985}.unpaid{background:#fef3c7;color:#92400e}
.cancelled{background:#fee2e2;color:#991b1b}.free{background:#f1f5f9;color:#334155}.suspended{background:#e5e7eb;color:#111}
a{color:#15803d}.bar{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}.scroll{overflow-x:auto}`;

export async function adminPage(req, res) {
  if (!guard(req, res)) return;
  const filter = FILTERS[req.query.status] ? req.query.status : 'all';
  const { list, leadCounts } = await load();
  const now = Date.now();
  const counts = summarize(list, now);
  const rows = list.filter((s) => filter === 'all' || bucket(s, now) === filter);
  const kpi = (key) =>
    `<a class="kpi${filter === key ? ' on' : ''}" href="/admin?status=${key}"><b>${counts[key]}</b><span>${e(FILTERS[key])}</span></a>`;
  const body = rows
    .map((s) => {
      const b = bucket(s, now);
      const when =
        b === 'paying'
          ? `Paid ${date(s.billing?.paidAt)}${s.billing?.paidUntil ? ` · until ${date(s.billing.paidUntil)}` : ''}${s.billing?.autopay ? ' · autopay' : ''}`
          : b === 'trial'
            ? `Ends ${date(s.trialEndsAt)}`
            : b === 'unpaid'
              ? `Ended ${date(s.billing?.paidUntil || s.trialEndsAt)}`
              : b === 'cancelled'
                ? `Cancelled ${date(s.cancelledAt)}`
                : '';
      return `<tr><td><a href="${e(siteUrl(s.slug))}">${e(s.slug)}</a>${s.customDomain ? `<br><small>${e(s.customDomain)}</small>` : ''}</td>
<td>${e(s.businessName)}<br><small>${e([s.category, s.city].filter(Boolean).join(' · '))}</small></td>
<td><a href="https://wa.me/${e(s.ownerPhone)}">${e(formatPhone(s.ownerPhone))}</a></td>
<td><span class="pill ${b}">${e(FILTERS[b] || b)}</span></td><td>${e(s.style || 'basic')}</td>
<td>${e(date(s.createdAt))}</td><td>${e(when)}</td><td>${leadCounts[s.slug] || 0}</td></tr>`;
    })
    .join('');
  res
    .set({ 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'" })
    .type('html')
    .send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${e(config.brand)} admin</title><style>${CSS}</style></head><body><main>
<h1>${e(config.brand)} admin</h1><p class="sub">${counts.all} websites · ${counts.conversion}% of free trials converted to paid</p>
<div class="kpis">${['paying', 'trial', 'unpaid', 'cancelled', 'free', 'all'].map(kpi).join('')}</div>
<div class="bar"><b>${e(FILTERS[filter])} (${rows.length})</b><a href="/admin/sites.csv">Download CSV</a></div>
<div class="scroll"><table><thead><tr><th>Website</th><th>Business</th><th>Owner</th><th>Status</th><th>Style</th><th>Created</th><th>Billing</th><th>Leads</th></tr></thead><tbody>${body}</tbody></table></div>
</main></body></html>`);
}

const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

export async function adminCsv(req, res) {
  if (!guard(req, res)) return;
  const { list, leadCounts } = await load();
  const now = Date.now();
  const header = ['slug', 'business', 'category', 'city', 'owner', 'status', 'style', 'created', 'trial_ends', 'paid_at', 'paid_until', 'autopay', 'cancelled_at', 'custom_domain', 'leads'];
  const lines = list.map((s) =>
    [s.slug, s.businessName, s.category, s.city, s.ownerPhone, bucket(s, now), s.style || 'basic', date(s.createdAt), date(s.trialEndsAt), date(s.billing?.paidAt), date(s.billing?.paidUntil), s.billing?.autopay ? 'yes' : '', date(s.cancelledAt), s.customDomain, leadCounts[s.slug] || 0]
      .map(csvCell)
      .join(',')
  );
  res
    .set({ 'Cache-Control': 'no-store', 'Content-Disposition': 'attachment; filename="sites.csv"' })
    .type('text/csv')
    .send([header.join(','), ...lines].join('\n'));
}
