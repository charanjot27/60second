import { config } from './config.js';
import { sendText, sendTemplate, isWindowClosed } from './whatsapp.js';
import { log, hashPhone } from './log.js';

async function email(to, subject, text) {
  if (!config.email.resendKey || !config.email.from || !to) return false;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.email.resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: config.email.from, to: [to], subject, text }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Email ${res.status}: ${(await res.text()).slice(0, 160)}`);
  return true;
}

export async function notifyOwner(site, { text, subject, template, params = [] }) {
  const to = site.ownerPhone;
  let delivered = false;
  try {
    await sendText(to, text);
    delivered = true;
  } catch (err) {
    if (template && isWindowClosed(err)) {
      try {
        await sendTemplate(to, template, config.wa.templateLang, params);
        delivered = true;
      } catch (tplErr) {
        log.warn('owner template failed', { user: hashPhone(to), error: tplErr.message.slice(0, 200) });
      }
    } else {
      log.warn('owner message failed', { user: hashPhone(to), error: err.message.slice(0, 200) });
    }
  }
  if (site.notifyEmail) {
    try {
      delivered = (await email(site.notifyEmail, subject || `${config.brand}: ${site.businessName}`, text)) || delivered;
    } catch (err) {
      log.warn('owner email failed', { error: err.message.slice(0, 200) });
    }
  }
  return delivered;
}

export function alertOwner(site, text, subject) {
  return notifyOwner(site, {
    text,
    subject,
    template: config.wa.alertTemplate,
    params: [site.businessName, text.replace(/\s+/g, ' ').slice(0, 900)],
  });
}
