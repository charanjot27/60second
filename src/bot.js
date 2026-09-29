import { config, siteUrl } from './config.js';
import { sessions, sites, isDuplicateKey } from './db.js';
import { sendText, sendButtons, downloadMedia } from './whatsapp.js';
import { extractBusiness } from './ai.js';
import { processAndUpload, deletePhotos } from './storage.js';
import { isTaken, suggestSlug, parseSlugInput, slugProblem } from './slug.js';
import { invalidate } from './site.js';
import { enqueue } from './queue.js';
import { allowAiCall, allowPhoto, allowAdvanced, allowNewSite, track } from './limits.js';
import { makeDesign } from './design.js';
import { generateSiteImages, fallbackPrompts } from './images.js';
import { generateSitePage, pickDirection } from './generate.js';
import { formatPhone } from './render.js';
import { hashPhone, log } from './log.js';

const ROOT = config.rootDomain;
const MAX_PHOTOS = config.limits.maxPhotos;
const RESTART = new Set(['restart', 'reset', 'start over', 'start again']);
const DELETE = new Set(['delete', 'delete my site', 'delete site', 'delete website', 'delete my website']);
const DONE = new Set(['done', 'photos_done', 'skip', 'skip_photos', 'finish']);
const DROP_SESSION = Symbol('drop');
const photoTimers = new Map();

export async function handleMessage(msg) {
  const started = Date.now();
  const s = (await sessions.findOne({ _id: msg.from })) ?? {
    _id: msg.from,
    state: 'NEW',
    name: msg.name,
    editing: null,
    slug: null,
    draft: {},
  };
  if (msg.name) s.name = msg.name;
  const before = s.state;
  const text = (msg.text || '').trim();
  const cmd = (msg.buttonId || text).toLowerCase().replace(/\s+/g, ' ');

  let result;
  if (RESTART.has(cmd)) {
    clearPhotoTimer(s._id);
    s.state = 'NEW';
    s.draft = {};
    s.editing = null;
    result = await HANDLERS.NEW(s, msg, text, cmd);
  } else if (DELETE.has(cmd)) {
    result = await askDelete(s);
  } else {
    result = await (HANDLERS[s.state] ?? HANDLERS.NEW)(s, msg, text, cmd);
  }

  if (result === DROP_SESSION) {
    await sessions.deleteOne({ _id: s._id });
  } else {
    s.updatedAt = new Date();
    await sessions.replaceOne({ _id: s._id }, s, { upsert: true });
  }

  log.info('message handled', {
    user: hashPhone(msg.from),
    id: msg.id,
    type: msg.type,
    from: before,
    to: result === DROP_SESSION ? 'DELETED' : s.state,
    ms: Date.now() - started,
  });
}

const HANDLERS = {
  async NEW(s) {
    const existing = await ownedSite(s);
    if (existing) {
      s.state = 'LIVE';
      s.slug = existing.slug;
      s.editing = null;
      s.draft = {};
      return liveMenu(s);
    }
    s.state = 'ASK_ABOUT';
    s.startedAt = Date.now();
    s.draft = {};
    s.editing = null;
    track(s._id, 'conversation_started');
    await sendText(
      s._id,
      `Hi ${s.name || 'there'} 👋 I'll build a website for your business in about 60 seconds.\n\n` +
        `*Step 1 of 4*\nTell me about your business in one message: its name, what you sell, and your city.\n\n` +
        `_Example: "Sweet Crumbs, custom birthday cakes and cupcakes, home bakery in Ludhiana"_`
    );
  },

  async ASK_ABOUT(s, msg, text) {
    if (msg.type === 'audio') {
      return sendText(s._id, "I can't listen to voice notes yet. Please type your business name, what you sell, and your city.");
    }
    if (msg.type === 'image') {
      return sendText(s._id, 'First, tell me about your business in one message. You can send photos in the next step.');
    }
    if (text.length < 8) {
      return sendText(s._id, 'Type a sentence with your business name, what you sell, and your city.');
    }
    if (!(await allowAiCall(s._id, config.limits.aiCallsPerDay))) {
      return sendText(s._id, "You've reached today's limit for changes. Please try again tomorrow.");
    }

    const info = await extractBusiness(text, s.name);
    if (!info.allowed) {
      track(s._id, 'blocked', { reason: info.reason });
      if (s.editing) return backToLive(s, "Sorry, this service can't publish that. Your website is unchanged.");
      s.state = 'NEW';
      return sendText(s._id, "Sorry, this service can't create websites for that type of business.");
    }
    track(s._id, 'about_received');

    const { allowed, reason, slugHint, imagePrompts, ...fields } = info;
    if (s.editing === 'about') return applyEdit(s, fields, 'Details updated');

    s.draft = { ...fields, slugHint, imagePrompts, photos: [] };
    s.state = 'ASK_STYLE';
    await sendButtons(
      s._id,
      `*${info.businessName}* ✨\n\n*Step 2 of 4*\nWhich website do you want?\n\n` +
        `⚡ *Basic*: clean and simple, ready in seconds.\n\n` +
        `🎨 *Advanced*: a modern one-page website with a design made just for your business, plus AI-generated pictures.`,
      [
        { id: 'style_basic', title: 'Basic ⚡' },
        { id: 'style_pro', title: 'Advanced 🎨' },
      ]
    );
  },

  async ASK_STYLE(s, msg, text, cmd) {
    const advanced = cmd === 'style_pro' || /^(advanced|pro|good|ui)/.test(cmd);
    const basic = cmd === 'style_basic' || /^(basic|simple|60)/.test(cmd);
    if (!advanced && !basic) {
      return sendButtons(s._id, 'Please choose a style for your website.', [
        { id: 'style_basic', title: 'Basic ⚡' },
        { id: 'style_pro', title: 'Advanced 🎨' },
      ]);
    }
    s.draft.style = advanced ? 'advanced' : 'basic';
    s.state = 'ASK_PHOTOS';
    await sendButtons(
      s._id,
      `*Step 3 of 4*\nSend up to ${MAX_PHOTOS} photos of your products, work or shop. ` +
        `Select them all at once, then tap Done.`,
      [{ id: 'skip_photos', title: 'Skip photos' }]
    );
  },

  async ASK_PHOTOS(s, msg, text, cmd) {
    s.draft.photos ??= [];

    if (msg.type === 'image' && msg.mediaId) {
      if (s.draft.photos.length >= MAX_PHOTOS) return schedulePhotoAck(s._id);
      if (!(await allowPhoto(s._id, config.limits.photosPerHour))) {
        return sendText(s._id, "That's a lot of photos for one hour. Tap Done to continue with the ones I have.");
      }
      try {
        const { buffer } = await downloadMedia(msg.mediaId);
        s.draft.photos.push(await processAndUpload(buffer, s._id));
      } catch (err) {
        log.error('photo failed', err, { user: hashPhone(s._id) });
        await sendText(s._id, "One photo couldn't be read. Please send it again as a photo.");
      }
      return schedulePhotoAck(s._id);
    }

    if (DONE.has(cmd)) {
      clearPhotoTimer(s._id);
      track(s._id, 'photos_done', { count: s.draft.photos.length });
      if (s.editing === 'photos') {
        if (!s.draft.photos.length) return backToLive(s, 'Photos unchanged.');
        const site = await ownedSite(s);
        const result = await applyEdit(s, { photos: s.draft.photos }, 'Photos updated');
        deletePhotos(site?.photos).catch((err) => log.warn('old photo cleanup failed', { error: err.message }));
        return result;
      }
      return askSlug(s);
    }

    await sendButtons(s._id, 'Send your photos, or tap Done when finished.', [
      { id: 'photos_done', title: 'Done ✅' },
    ]);
  },

  async ASK_SLUG(s, msg, text, cmd) {
    if (cmd === 'slug_ok') return claimSlug(s, s.draft.slug);
    if (cmd === 'slug_change') {
      s.state = 'ASK_CUSTOM_SLUG';
      return sendText(s._id, `Type the name you want for your address.\n_Example: sweetcrumbs → sweetcrumbs.${ROOT}_`);
    }
    if (text && msg.type === 'text') {
      s.state = 'ASK_CUSTOM_SLUG';
      return HANDLERS.ASK_CUSTOM_SLUG(s, msg, text, cmd);
    }
    return askSlug(s);
  },

  async ASK_CUSTOM_SLUG(s, msg, text, cmd) {
    if (cmd.startsWith('use:')) return claimSlug(s, cmd.slice(4));
    if (!text || msg.type !== 'text') {
      return sendText(s._id, `Type the name you want, for example: sweetcrumbs`);
    }

    const { slug, domain } = parseSlugInput(text);
    const problem = slugProblem(slug);
    if (problem) {
      return sendText(s._id, `*${slug || text}* is ${problem}. Try another name.`);
    }
    if (domain) {
      s.draft.requestedDomain = domain;
      await sendText(
        s._id,
        `Connecting your own domain (${domain}) is available as an upgrade. ` +
          `Your site will go live at ${slug}.${ROOT} now, and you can move it later.`
      );
    }
    return claimSlug(s, slug);
  },

  async LIVE(s, msg, text, cmd) {
    const site = await ownedSite(s);
    if (!site) {
      s.state = 'NEW';
      s.slug = null;
      return HANDLERS.NEW(s);
    }
    s.slug = site.slug;

    if (cmd === 'edit_about') {
      s.state = 'ASK_ABOUT';
      s.editing = 'about';
      return sendText(s._id, 'Send the new description of your business in one message: name, what you sell, and your city.');
    }
    if (cmd === 'edit_photos') {
      s.state = 'ASK_PHOTOS';
      s.editing = 'photos';
      s.draft = { photos: [] };
      return sendButtons(
        s._id,
        `Send up to ${MAX_PHOTOS} new photos. They'll replace the current ones. Tap Done when finished.`,
        [{ id: 'photos_done', title: 'Done ✅' }]
      );
    }
    if (cmd === 'get_link') return sendText(s._id, siteUrl(site.slug));

    if (cmd === 'new design') {
      if (site.style !== 'advanced') {
        return sendText(s._id, 'New designs are available for Advanced websites. Send *restart* to create an Advanced site.');
      }
      if (!(await allowAdvanced(s._id, config.limits.advancedPerDay))) {
        return sendText(s._id, "You've reached today's limit for new designs. Please try again tomorrow.");
      }
      await sendText(s._id, '🎨 Creating a new design. This takes 1 to 3 minutes...');
      const design = makeDesign(site, String(Date.now()));
      const page = await generateSitePage({ ...site, design }, pickDirection(site.slug), {
        hasImages: Boolean(site.aiImages?.length || site.photos?.length),
      }).catch((err) => {
        log.warn('page generation failed', { error: err.message });
        return null;
      });
      if (!page) {
        return sendText(s._id, "⚠️ The designer AI didn't answer this time, so your site is unchanged. Please try again in a minute.");
      }
      return applyEdit(s, { design, page }, '🎨 New design ready');
    }

    if (msg.type === 'location' && msg.location?.lat != null) {
      return applyEdit(s, { location: msg.location }, '📍 Location added');
    }

    const numberMatch = text.match(/^(?:number|phone|contact)\s*[:\-]?\s*([+\d][\d\s-]{6,20})$/i);
    if (numberMatch) {
      const phone = normalizePhone(numberMatch[1]);
      if (!phone) return sendText(s._id, 'That number looks wrong. Send it like: number 9876543210');
      return applyEdit(s, { phone }, `Contact number changed to ${formatPhone(phone)}`);
    }

    return liveMenu(s);
  },

  async CONFIRM_DELETE(s, msg, text, cmd) {
    const site = await ownedSite(s);
    if (cmd === 'confirm_delete' && site) {
      await deleteSite(s, site);
      return DROP_SESSION;
    }
    s.state = site ? 'LIVE' : 'NEW';
    if (!site) return HANDLERS.NEW(s);
    return sendText(s._id, `Good, your website stays live: ${siteUrl(site.slug)}`);
  },
};

function normalizePhone(input) {
  let digits = String(input).replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length === 10) digits = `91${digits}`;
  return digits.length >= 11 && digits.length <= 15 ? digits : null;
}

function ownedSite(s) {
  if (s.slug) return sites.findOne({ slug: s.slug, ownerPhone: s._id });
  return sites.findOne({ ownerPhone: s._id }, { sort: { createdAt: -1 } });
}

function clearPhotoTimer(phone) {
  clearTimeout(photoTimers.get(phone));
  photoTimers.delete(phone);
}

function schedulePhotoAck(phone) {
  clearPhotoTimer(phone);
  const timer = setTimeout(() => {
    photoTimers.delete(phone);
    enqueue(phone, async () => {
      const s = await sessions.findOne({ _id: phone });
      if (s?.state !== 'ASK_PHOTOS') return;
      const n = s.draft?.photos?.length ?? 0;
      if (!n) return;
      const body =
        n >= MAX_PHOTOS
          ? `Got ${n} photos, that's the maximum 📸 Tap Done to continue.`
          : `Got ${n} photo${n === 1 ? '' : 's'} 📸 Send more or tap Done.`;
      await sendButtons(phone, body, [{ id: 'photos_done', title: 'Done ✅' }]);
    });
  }, 2500);
  timer.unref?.();
  photoTimers.set(phone, timer);
}

async function askSlug(s) {
  s.draft.slug = await suggestSlug(s.draft.businessName, s.draft.city, s.draft.slugHint);
  if (!s.draft.slug) {
    s.state = 'ASK_CUSTOM_SLUG';
    return sendText(s._id, `*Step 4 of 4*\nType a short name for your website address.\n_Example: sweetcrumbs → sweetcrumbs.${ROOT}_`);
  }
  s.state = 'ASK_SLUG';
  await sendButtons(s._id, `*Step 4 of 4*\nYour website address will be:\n\n🌐 *${s.draft.slug}.${ROOT}*`, [
    { id: 'slug_ok', title: 'Use this ✅' },
    { id: 'slug_change', title: 'Pick another ✏️' },
  ]);
}

async function claimSlug(s, slug) {
  if (slugProblem(slug)) {
    s.state = 'ASK_CUSTOM_SLUG';
    return sendText(s._id, 'That name is not allowed. Type another name.');
  }
  if (await isTaken(slug)) return offerAlternative(s, slug);
  s.draft.slug = slug;
  track(s._id, 'slug_chosen');
  return publish(s);
}

async function offerAlternative(s, slug) {
  s.state = 'ASK_CUSTOM_SLUG';
  const alt = await suggestSlug(slug, s.draft.city);
  if (!alt) return sendText(s._id, `*${slug}.${ROOT}* is taken. Type another name.`);
  return sendButtons(
    s._id,
    `*${slug}.${ROOT}* is taken.\n\nHow about 🌐 *${alt}.${ROOT}*? Or type another name.`,
    [{ id: `use:${alt}`, title: 'Use this ✅' }]
  );
}

async function publish(s) {
  if (!(await allowNewSite(s._id, config.limits.sitesPerDay))) {
    return sendText(s._id, "You've created the maximum number of websites for today. Please try again tomorrow.");
  }
  const d = s.draft;
  const now = new Date();
  let style = d.style === 'advanced' ? 'advanced' : 'basic';
  let extras = {};
  let designFailed = false;
  if (style === 'advanced') {
    if (!(await allowAdvanced(s._id, config.limits.advancedPerDay))) {
      style = 'basic';
      await sendText(s._id, "You've reached today's limit for advanced designs, so I'll publish the basic version.");
    } else {
      await sendText(s._id, '🎨 Designing your website and creating pictures. This takes 1 to 3 minutes...');
      const prompts = d.imagePrompts?.length ? d.imagePrompts : fallbackPrompts(d);
      const design = makeDesign(d, String(Date.now()));
      const [aiImages, page] = await Promise.all([
        generateSiteImages(prompts, s._id),
        generateSitePage({ ...d, design }, pickDirection(d.slug), { hasImages: true }).catch((err) => {
          log.warn('page generation failed', { error: err.message });
          return null;
        }),
      ]);
      extras = { design, aiImages, ...(page ? { page } : {}) };
      designFailed = !page;
    }
  }
  const site = {
    slug: d.slug,
    ownerPhone: s._id,
    phone: s._id,
    status: 'active',
    plan: 'free',
    businessName: d.businessName,
    category: d.category,
    tagline: d.tagline,
    description: d.description,
    city: d.city,
    services: d.services ?? [],
    theme: d.theme,
    language: d.language,
    photos: d.photos ?? [],
    style,
    ...extras,
    createdAt: now,
    updatedAt: now,
  };
  if (d.requestedDomain) site.requestedDomain = d.requestedDomain;

  try {
    await sites.insertOne(site);
  } catch (err) {
    if (isDuplicateKey(err)) return offerAlternative(s, d.slug);
    throw err;
  }

  invalidate(d.slug);
  const secs = s.startedAt ? Math.round((Date.now() - s.startedAt) / 1000) : null;
  track(s._id, 'published', { seconds: secs });
  s.state = 'LIVE';
  s.slug = d.slug;
  s.draft = {};
  s.editing = null;

  await sendText(
    s._id,
    `🎉 Your website is live${secs ? ` (built in ${secs} seconds)` : ''}!\n\n${siteUrl(d.slug)}\n\n` +
      `Put it in your WhatsApp status, Instagram bio and Google Maps listing.\n\n` +
      `ℹ️ Your number ${formatPhone(s._id)} is shown on the site for the WhatsApp and Call buttons. ` +
      `To show a different number, send: *number 9876543210*\n` +
      `📍 Share your location pin here to add a map.\n` +
      (style === 'advanced'
        ? designFailed
          ? `⚠️ The designer AI was busy, so I used a simpler layout. Send *new design* in a minute to try again.\n`
          : `🎨 Not happy with the look? Send *new design* for a fresh one.\n`
        : '') +
      `\nMessage me anytime to edit your site.`
  );
}

async function applyEdit(s, fields, label) {
  const site = await sites.findOneAndUpdate(
    { slug: s.slug, ownerPhone: s._id },
    { $set: { ...fields, updatedAt: new Date() } },
    { returnDocument: 'after' }
  );
  invalidate(s.slug, site?.customDomain);
  track(s._id, 'edited', { fields: Object.keys(fields) });
  return backToLive(s, `✅ ${label}: ${siteUrl(s.slug)}`);
}

async function backToLive(s, message) {
  s.state = 'LIVE';
  s.editing = null;
  s.draft = {};
  await sendText(s._id, message);
}

async function askDelete(s) {
  clearPhotoTimer(s._id);
  const site = await ownedSite(s);
  if (!site) {
    return sendText(s._id, "You don't have a website yet. Send *hi* to make one.");
  }
  s.slug = site.slug;
  s.state = 'CONFIRM_DELETE';
  s.editing = null;
  s.draft = {};
  await sendButtons(
    s._id,
    `This permanently deletes ${siteUrl(site.slug)} and all its photos. Are you sure?`,
    [
      { id: 'confirm_delete', title: 'Yes, delete' },
      { id: 'cancel_delete', title: 'No, keep it' },
    ]
  );
}

async function deleteSite(s, site) {
  await deletePhotos(site.photos).catch((err) => log.warn('photo delete failed', { error: err.message }));
  await sites.deleteOne({ _id: site._id });
  invalidate(site.slug, site.customDomain);
  track(s._id, 'deleted');
  await sendText(s._id, 'Your website, photos and details have been deleted. Message me anytime to make a new one.');
}

function liveMenu(s) {
  return sendButtons(s._id, `Your website: ${siteUrl(s.slug)}\n\nWhat would you like to change?`, [
    { id: 'edit_about', title: 'Edit details' },
    { id: 'edit_photos', title: 'Change photos' },
    { id: 'get_link', title: 'Get my link' },
  ]);
}
