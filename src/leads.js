import { config, siteUrl } from './config.js';
import { leads } from './db.js';
import { siteForRequest } from './site.js';
import { accessState } from './billing.js';
import { notifyOwner } from './notify.js';
import { allowLead, allowTapAlert, track } from './limits.js';
import { formatPhone } from './render.js';
import { log } from './log.js';

const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

export function parseLead(body) {
  if (!body || typeof body !== 'object') return null;
  if (clean(body.website, 200)) return null;
  const name = clean(body.name, 80);
  const phone = clean(body.phone, 20).replace(/[^\d+]/g, '');
  const message = clean(body.message, 1000);
  if (!name || phone.replace(/\D/g, '').length < 7) return null;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(body.date || '')) ? body.date : '';
  const time = /^\d{2}:\d{2}$/.test(String(body.time || '')) ? body.time : '';
  const guests = Number.isInteger(Number(body.guests)) && Number(body.guests) > 0 && Number(body.guests) <= 500 ? Number(body.guests) : 0;
  const need = clean(body.need, 200);
  return { name, phone, message, ...(date && { date }), ...(time && { time }), ...(guests && { guests }), ...(need && { need }) };
}

async function liveSite(req) {
  const found = await siteForRequest(req);
  if (!found?.site) return null;
  const state = accessState(found.site);
  return state === 'live' || state === 'trial' ? found.site : null;
}

export async function handleLead(req, res) {
  try {
    const site = await liveSite(req);
    if (!site) return res.status(404).type('text/plain').send('Not found');
    const lead = parseLead(req.body);
    if (!lead) return res.redirect(303, '/#enquiry');
    if (!(await allowLead(req.ip || 'unknown'))) return res.redirect(303, '/thanks');

    await leads.insertOne({ slug: site.slug, ...lead, at: new Date() });
    track(site.ownerPhone, 'lead', { slug: site.slug });
    const digits = lead.phone.replace(/\D/g, '');
    const text =
      `📩 *New enquiry from your website*\n\n` +
      `👤 ${lead.name}\n📞 ${formatPhone(digits) || lead.phone}\n` +
      (lead.need ? `🔎 ${lead.need}\n` : '') +
      (lead.date ? `📅 ${lead.date}${lead.time ? ` at ${lead.time}` : ''}\n` : lead.time ? `🕒 ${lead.time}\n` : '') +
      (lead.guests ? `👥 ${lead.guests} people\n` : '') +
      (lead.message ? `💬 ${lead.message}\n` : '') +
      `\nReply on WhatsApp: https://wa.me/${digits}`;
    notifyOwner(site, {
      text,
      subject: `New enquiry for ${site.businessName}`,
      template: config.wa.leadTemplate,
      params: [site.businessName, lead.name, lead.phone, lead.message || '-'],
    }).catch((err) => log.warn('lead notify failed', { error: err.message }));
    return res.redirect(303, '/thanks');
  } catch (err) {
    log.error('lead failed', err);
    return res.status(500).type('text/plain').send('Something went wrong. Please try again.');
  }
}

export async function handleTap(req, res) {
  res.status(204).end();
  try {
    const kind = String(req.body || '').trim();
    if (kind !== 'call' && kind !== 'whatsapp') return;
    const site = await liveSite(req);
    if (!site) return;
    track(site.ownerPhone, 'tap', { slug: site.slug, kind });
    if (kind === 'call' && (await allowTapAlert(site.slug))) {
      await notifyOwner(site, {
        text: `📞 Someone just tapped *Call* on your website ${siteUrl(site.slug)}. Keep your phone close!`,
        subject: `Someone tapped Call on ${site.businessName}`,
        template: config.wa.alertTemplate,
        params: [site.businessName, 'Someone just tapped Call on your website.'],
      });
    }
  } catch (err) {
    log.warn('tap failed', { error: err.message });
  }
}
