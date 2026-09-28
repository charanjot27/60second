import crypto from 'node:crypto';
import { config } from './config.js';
import { log } from './log.js';

const GRAPH = 'https://graph.facebook.com';
const MAX_MEDIA_BYTES = 16 * 1024 * 1024;

export function verifySignature(rawBody, header) {
  if (!config.wa.appSecret || !header || !Buffer.isBuffer(rawBody)) return false;
  const expected =
    'sha256=' + crypto.createHmac('sha256', config.wa.appSecret).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(header));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function parseIncoming(body) {
  const out = [];
  for (const entry of body?.entry || []) {
    for (const change of entry?.changes || []) {
      const value = change?.value;
      if (!value?.messages) continue;
      const names = new Map(
        (value.contacts || []).map((c) => [c.wa_id, c.profile?.name || ''])
      );
      for (const m of value.messages) {
        const msg = {
          id: m.id,
          from: m.from,
          name: names.get(m.from) || '',
          type: m.type,
          text: '',
          mediaId: null,
          buttonId: null,
          location: null,
        };
        switch (m.type) {
          case 'text':
            msg.text = m.text?.body || '';
            break;
          case 'image':
            msg.mediaId = m.image?.id || null;
            msg.text = m.image?.caption || '';
            break;
          case 'document':
            if (String(m.document?.mime_type || '').startsWith('image/')) {
              msg.type = 'image';
              msg.mediaId = m.document.id;
            }
            msg.text = m.document?.caption || '';
            break;
          case 'interactive':
            msg.type = 'button';
            msg.buttonId = m.interactive?.button_reply?.id || m.interactive?.list_reply?.id || null;
            msg.text = m.interactive?.button_reply?.title || m.interactive?.list_reply?.title || '';
            break;
          case 'button':
            msg.buttonId = m.button?.payload || null;
            msg.text = m.button?.text || '';
            break;
          case 'location':
            msg.location = {
              lat: m.location?.latitude,
              lng: m.location?.longitude,
              name: m.location?.name || '',
              address: m.location?.address || '',
            };
            break;
        }
        out.push(msg);
      }
    }
  }
  return out;
}

async function graph(path, payload, attempt = 0) {
  const res = await fetch(`${GRAPH}/${config.wa.apiVersion}/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.wa.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10000),
  });
  if (res.ok) return res.json();
  if ((res.status === 429 || res.status >= 500) && attempt < 2) {
    await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
    return graph(path, payload, attempt + 1);
  }
  const detail = await res.text();
  throw new Error(`WhatsApp API ${res.status}: ${detail.slice(0, 300)}`);
}

function send(to, message) {
  return graph(`${config.wa.phoneNumberId}/messages`, {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    ...message,
  });
}

export function sendText(to, body) {
  return send(to, { type: 'text', text: { body: body.slice(0, 4096), preview_url: true } });
}

export function sendButtons(to, body, buttons) {
  return send(to, {
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: body.slice(0, 1024) },
      action: {
        buttons: buttons.slice(0, 3).map((b) => ({
          type: 'reply',
          reply: { id: b.id, title: b.title.slice(0, 20) },
        })),
      },
    },
  });
}

export async function downloadMedia(mediaId) {
  const auth = { Authorization: `Bearer ${config.wa.token}` };
  const metaRes = await fetch(`${GRAPH}/${config.wa.apiVersion}/${mediaId}`, {
    headers: auth,
    signal: AbortSignal.timeout(10000),
  });
  if (!metaRes.ok) throw new Error(`Media lookup failed: ${metaRes.status}`);
  const meta = await metaRes.json();
  if (meta.file_size && meta.file_size > MAX_MEDIA_BYTES) throw new Error('Media too large');

  const fileRes = await fetch(meta.url, { headers: auth, signal: AbortSignal.timeout(20000) });
  if (!fileRes.ok) throw new Error(`Media download failed: ${fileRes.status}`);
  const buffer = Buffer.from(await fileRes.arrayBuffer());
  if (buffer.length > MAX_MEDIA_BYTES) throw new Error('Media too large');
  return { buffer, mimeType: meta.mime_type };
}

export function markRead(messageId) {
  return graph(`${config.wa.phoneNumberId}/messages`, {
    messaging_product: 'whatsapp',
    status: 'read',
    message_id: messageId,
  }).catch((err) => log.warn('mark read failed', { error: err.message }));
}
