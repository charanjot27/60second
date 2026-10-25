import { config, siteUrl } from './config.js';
import { sessions, sites, leads, isDuplicateKey } from './db.js';
import { sendText, sendButtons, sendList, downloadMedia } from './whatsapp.js';
import { extractBusiness } from './ai.js';
import { processAndUpload, uploadVideo, deletePhotos, deleteVideos } from './storage.js';
import { isTaken, suggestSlug, parseSlugInput, slugProblem } from './slug.js';
import { invalidate } from './site.js';
import { enqueue } from './queue.js';
import { allowAiCall, allowPhoto, allowAdvanced, allowNewSite, allowEdit, allowVoice, track } from './limits.js';
import { makeDesign } from './design.js';
import { generateImage, fallbackPrompts } from './images.js';
import { sourceSiteImages } from './photos.js';
import { classifyIndustry, industryAction } from './industry.js';
import { inspectPhotos, arrangeOwnPhotos } from './assets.js';
import { callClaudeRaw, claudeEnabled } from './claude.js';
import { cheapEnabled, routeMessage } from './assistant.js';
import { createArtDirection, generateSitePage, editSite } from './generate.js';
import { designMemory, recordDesign, markOutcome, markFeedback, noteRevision } from './memory.js';
import { currentLessons } from './lessons.js';
import { transcribe } from './voice.js';
import {
  billingEnabled,
  trialsEnabled,
  trialEndsAt,
  accessState,
  payLink,
  cancelSubscription,
  activateManually,
  extendTrial,
  pauseSite,
  payMethods,
  priceLabel,
  autopayAvailable,
  shortDate,
  createPayment,
} from './billing.js';
import { domainsEnabled, normalizeDomain, connectDomain } from './domains.js';
import { domainShopEnabled, domainIdeasEnabled, findDomains, quoteDomain, domainPaid, domainPayLink, offerText, domainRows, priceText, buyLinks } from './domainshop.js';
import { money } from './plans.js';
import { t, LANGS, WELCOME, LANG_BUTTONS } from './i18n.js';
import { formatPhone } from './render.js';
import { isDisallowedText } from './moderation.js';
import { hashPhone, log } from './log.js';

const ROOT = config.rootDomain;
const MAX_PHOTOS = config.limits.maxPhotos;
const MAX_VIDEOS = config.limits.maxVideos;
const RESTART = new Set(['restart', 'reset', 'start over', 'start again']);
const NEW_SITE = new Set(['new website', 'new site', 'another website', 'another site', 'create new website', 'make new website', 'make a new website', 'new business', 'add business', 'add website']);
const MY_SITES = new Set(['my websites', 'my sites', 'websites', 'sites', 'switch']);
const SWITCH = /^(?:switch|open|use)\s+(?:to\s+)?([a-z0-9-]{3,30})$/;
const DELETE = new Set(['delete', 'delete my site', 'delete site', 'delete website', 'delete my website']);
const CHAT = new Set(['hi', 'hii', 'hello', 'hey', 'menu', 'help', 'ok', 'okay', 'thanks', 'thank you', 'namaste', 'sat sri akal', 'start']);
const PAY = new Set(['pay', 'subscribe', 'activate', 'reactivate', 'upgrade', 'buy', 'plan', 'keep it', 'keep', 'keep my site']);
const ADMIN_CMD = /^(activate|extend|pause|status)\s+([a-z0-9-]{3,30})(?:\s+(\d+(?:\.\d+)?))?$/;
const DOMAIN_MENU = new Set(['domain', 'domains', 'get domain', 'buy domain', 'own domain', 'my domain', 'new domain', 'renew domain', 'website address', 'get a domain', 'domain_menu']);
const DOMAIN_WORDS = /\b(domains?|web ?address|website address|own address|dot ?com|डोमेन|ਡੋਮੇਨ)\b/i;
const wantsDomain = (text) => DOMAIN_WORDS.test(text) && !/\b[a-z0-9-]+\.[a-z]{2,}\b/i.test(text) && !/^(?:connect|transfer|move)\b/i.test(text.trim());
const DOMAIN_CHECK = /^(?:buy|check|get)\s+(?:domain\s+)?(\S+\.\S+)$/i;
const CANCEL = new Set(['cancel', 'cancel plan', 'cancel my plan', 'cancel subscription', 'cancel my subscription', 'unsubscribe']);
const LANG_WORDS = { english: 'en', hindi: 'hi', 'हिंदी': 'hi', punjabi: 'pa', 'ਪੰਜਾਬੀ': 'pa' };
const HISTORY = 5;
const DONE = new Set(['done', 'photos_done', 'skip', 'skip_photos', 'finish', 'no_photos']);
const DROP_SESSION = Symbol('drop');
const mediaTimers = new Map();

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
  const isAdmin = config.adminNumbers.includes(String(msg.from));
  if (cmd === 'model check' && isAdmin) {
    result = await modelCheck(s);
  } else if (cmd === 'lessons' && isAdmin) {
    result = await showLessons(s);
  } else if (isAdmin && ADMIN_CMD.test(cmd)) {
    result = await adminCommand(s, cmd);
  } else if (NEW_SITE.has(cmd)) {
    result = await startNewSite(s);
  } else if (MY_SITES.has(cmd)) {
    result = await listSites(s);
  } else if (SWITCH.test(cmd)) {
    result = await switchSite(s, cmd.match(SWITCH)[1]);
  } else if (RESTART.has(cmd)) {
    clearMediaTimer(s._id);
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

async function adminCommand(s, cmd) {
  const [, action, slug, num] = cmd.match(ADMIN_CMD);
  const site = await sites.findOne({ slug });
  if (!site) return sendText(s._id, `No site called ${slug}.`);
  const url = siteUrl(slug);
  if (action === 'activate') {
    await activateManually(site, s._id);
    await sendText(site.ownerPhone, `✅ Your website is activated and stays live:\n${url}`).catch(() => {});
    return sendText(s._id, `✅ ${slug} activated. The owner has been told.`);
  }
  if (action === 'extend') {
    const hours = Math.min(Math.max(Number(num) || 24, 0.05), 24 * 90);
    await extendTrial(site, hours);
    await sendText(site.ownerPhone, `🎁 Your free trial is extended. ${url} stays live for another ${hours} hours.`).catch(() => {});
    return sendText(s._id, `⏳ ${slug} trial now ends in ${hours} hours.`);
  }
  if (action === 'pause') {
    await pauseSite(site);
    return sendText(s._id, `⏸ ${slug} is now offline. Send *activate ${slug}* or *extend ${slug} 24* to bring it back.`);
  }
  const state = accessState(site);
  const left = site.trialEndsAt ? ` · trial ends ${new Date(site.trialEndsAt).toISOString().slice(0, 16).replace('T', ' ')} UTC` : '';
  return sendText(s._id, `${slug}: ${state} · plan ${site.plan || 'free'}${left}\n${url}`);
}

async function showLessons(s) {
  const doc = await currentLessons();
  if (!doc) return sendText(s._id, 'No lessons yet. They are written once a day after at least 3 new websites.');
  return sendText(
    s._id,
    `🧠 Design lessons v${doc.version} (from ${doc.basedOn} websites, ${new Date(doc.at).toISOString().slice(0, 10)}):\n\n` +
      doc.lessons.map((l, i) => `${i + 1}. ${l.lesson}${l.appliesTo !== 'all' ? ` [${l.appliesTo}]` : ''} (${l.evidence}×)`).join('\n')
  );
}

async function modelCheck(s) {
  if (!claudeEnabled()) return sendText(s._id, '❌ ANTHROPIC_API_KEY is not set.');
  const started = Date.now();
  try {
    const r = await callClaudeRaw({
      model: config.ai.designModel,
      system: 'Reply with one short sentence.',
      user: 'Say hello.',
      maxTokens: 2000,
      effort: 'low',
      timeoutMs: 60000,
    });
    return sendText(
      s._id,
      `✅ Claude works.\nRequested: ${config.ai.designModel}\nAnswered by: ${r.model}\nTokens: ${r.usage?.input_tokens} in, ${r.usage?.output_tokens} out\nTime: ${Date.now() - started} ms`
    );
  } catch (err) {
    return sendText(s._id, `❌ ${err.message}`);
  }
}

const lang = (s) => s.lang || 'en';

async function hearVoice(s, msg) {
  if (!(await allowVoice(s._id, config.limits.voicePerDay))) {
    await sendText(s._id, "You've sent a lot of voice notes today. Please type instead.");
    return '';
  }
  await sendText(s._id, t(lang(s), 'listening'));
  try {
    const { buffer, mimeType } = await downloadMedia(msg.mediaId);
    return await transcribe(buffer, mimeType, lang(s));
  } catch (err) {
    log.warn('voice download failed', { user: hashPhone(s._id), error: err.message });
    return '';
  }
}

async function answerOf(s, msg, text) {
  if (msg.type === 'audio' && msg.mediaId) return hearVoice(s, msg);
  return msg.type === 'text' || msg.type === 'button' ? text : '';
}

function askMode(s) {
  s.state = 'ASK_MODE';
  return sendButtons(s._id, t(lang(s), 'mode'), [
    { id: 'mode_text', title: t(lang(s), 'mode_text') },
    { id: 'mode_voice', title: t(lang(s), 'mode_voice') },
  ]);
}

function askName(s) {
  s.state = 'ASK_NAME';
  s.draft = { answers: {} };
  return sendText(s._id, t(lang(s), 'ask_name'));
}

function askVoice(s) {
  s.state = 'ASK_VOICE';
  s.draft = {};
  return sendButtons(s._id, t(lang(s), 'ask_voice'), [{ id: 'mode_text', title: t(lang(s), 'mode_text') }]);
}

async function understand(s, words, viaVoice) {
  if (!(await allowAiCall(s._id, config.limits.aiCallsPerDay))) {
    return sendText(s._id, "You've reached today's limit for changes. Please try again tomorrow.");
  }
  const info = await extractBusiness(words, s.name, lang(s));
  if (!info.allowed) {
    track(s._id, 'blocked', { reason: info.reason });
    s.state = 'NEW';
    return sendText(s._id, "Sorry, this service can't create websites for that type of business.");
  }
  track(s._id, 'about_received', { voice: viaVoice });
  const { allowed, reason, slugHint, imagePrompts, ...fields } = info;
  s.draft = { ...fields, slugHint, imagePrompts, ownerWords: words, viaVoice, photos: [], videos: [] };
  s.state = 'CONFIRM';
  const l = lang(s);
  const location = [fields.area, fields.city].filter(Boolean).join(', ') || t(l, 'none');
  return sendButtons(
    s._id,
    t(l, 'confirm', {
      name: fields.businessName,
      location,
      services: fields.services?.length ? fields.services.join(', ') : t(l, 'none'),
    }),
    [
      { id: 'proceed', title: t(l, 'proceed') },
      viaVoice ? { id: 'redo_voice', title: t(l, 'redo_voice') } : { id: 'redo_text', title: t(l, 'redo_text') },
    ]
  );
}

function askPhotos(s) {
  s.state = 'ASK_PHOTOS';
  return sendButtons(s._id, t(lang(s), 'photos', { photos: MAX_PHOTOS, videos: MAX_VIDEOS }), [
    { id: 'no_photos', title: t(lang(s), 'no_photos') },
  ]);
}

const HANDLERS = {
  async NEW(s) {
    const existing = s.fresh ? null : await ownedSite(s);
    if (existing) {
      s.state = 'LIVE';
      s.slug = existing.slug;
      s.editing = null;
      s.draft = {};
      return liveMenu(s, existing);
    }
    s.state = 'ASK_LANG';
    s.startedAt = Date.now();
    s.draft = {};
    s.editing = null;
    track(s._id, 'conversation_started');
    await sendButtons(s._id, WELCOME.replace('{name}', s.name || 'there'), LANG_BUTTONS);
  },

  async ASK_LANG(s, msg, text, cmd) {
    const picked = cmd.startsWith('lang_') ? cmd.slice(5) : LANG_WORDS[cmd];
    if (!LANGS.includes(picked)) {
      return sendButtons(s._id, WELCOME.replace('{name}', s.name || 'there'), LANG_BUTTONS);
    }
    s.lang = picked;
    return askMode(s);
  },

  async ASK_MODE(s, msg, text, cmd) {
    if (msg.type === 'audio' && msg.mediaId) {
      s.state = 'ASK_VOICE';
      return HANDLERS.ASK_VOICE(s, msg, text, cmd);
    }
    if (cmd === 'mode_voice' || /voice|वॉइस|ਵੌਇਸ/.test(cmd)) return askVoice(s);
    if (cmd === 'mode_text' || /type|text|लिख|ਲਿਖ/.test(cmd)) return askName(s);
    return askMode(s);
  },

  async ASK_VOICE(s, msg, text, cmd) {
    if (cmd === 'mode_text') return askName(s);
    if (msg.type === 'audio' && msg.mediaId) {
      const words = await hearVoice(s, msg);
      if (!words) {
        return sendButtons(s._id, t(lang(s), 'voice_failed'), [{ id: 'mode_text', title: t(lang(s), 'mode_text') }]);
      }
      return understand(s, words, true);
    }
    if (msg.type === 'text' && text.length >= 15) return understand(s, text, false);
    return sendButtons(s._id, t(lang(s), 'voice_only'), [{ id: 'mode_text', title: t(lang(s), 'mode_text') }]);
  },

  async ASK_NAME(s, msg, text) {
    const answer = await answerOf(s, msg, text);
    if (answer.length < 2) return sendText(s._id, t(lang(s), 'ask_name'));
    s.draft.answers = { ...(s.draft.answers || {}), name: answer.slice(0, 200) };
    s.state = 'ASK_LOCATION';
    return sendText(s._id, t(lang(s), 'ask_location'));
  },

  async ASK_LOCATION(s, msg, text) {
    const answer = await answerOf(s, msg, text);
    if (answer.length < 2) return sendText(s._id, t(lang(s), 'ask_location'));
    s.draft.answers.location = answer.slice(0, 300);
    s.state = 'ASK_SERVICES';
    return sendText(s._id, t(lang(s), 'ask_services'));
  },

  async ASK_SERVICES(s, msg, text) {
    const answer = await answerOf(s, msg, text);
    if (answer.length < 3) return sendText(s._id, t(lang(s), 'ask_services'));
    const a = { ...s.draft.answers, services: answer.slice(0, 1000) };
    const words = `Business name: ${a.name}\nLocation: ${a.location}\nServices or products: ${a.services}`;
    return understand(s, words, false);
  },

  async CONFIRM(s, msg, text, cmd) {
    if (cmd === 'proceed' || /^(yes|ok|okay|proceed|correct|haan|ha|ਹਾਂ|हाँ|हां)$/.test(cmd)) {
      track(s._id, 'confirmed', { voice: s.draft.viaVoice });
      s.draft.style = 'advanced';
      return askPhotos(s);
    }
    if (cmd === 'redo_voice') return askVoice(s);
    if (cmd === 'redo_text' || cmd === 'mode_text') return askName(s);
    const correction = await answerOf(s, msg, text);
    if (correction.length >= 2) {
      return understand(s, `${s.draft.ownerWords}\n\nCorrection from the owner: ${correction}`, s.draft.viaVoice);
    }
    return sendButtons(s._id, t(lang(s), 'too_short'), [{ id: 'proceed', title: t(lang(s), 'proceed') }]);
  },

  async ASK_STYLE(s) {
    s.draft.style = 'advanced';
    return askPhotos(s);
  },

  async ASK_PHOTOS(s, msg, text, cmd) {
    s.draft.photos ??= [];
    s.draft.videos ??= [];

    if ((msg.type === 'image' || msg.type === 'video') && msg.mediaId) {
      const isVideo = msg.type === 'video';
      const list = isVideo ? s.draft.videos : s.draft.photos;
      if (list.length >= (isVideo ? MAX_VIDEOS : MAX_PHOTOS)) return scheduleMediaAck(s._id);
      if (!(await allowPhoto(s._id, config.limits.photosPerHour))) {
        return sendText(s._id, "That's a lot of uploads for one hour. Tap Done to continue with the ones I have.");
      }
      try {
        const { buffer, mimeType } = await downloadMedia(msg.mediaId);
        list.push(isVideo ? await uploadVideo(buffer, mimeType, s._id) : await processAndUpload(buffer, s._id));
      } catch (err) {
        log.error('media failed', err, { user: hashPhone(s._id), type: msg.type });
        await sendText(
          s._id,
          isVideo
            ? "That video couldn't be saved. Please send an MP4 video under 16 MB."
            : "One photo couldn't be read. Please send it again as a photo."
        );
      }
      return scheduleMediaAck(s._id);
    }

    if (DONE.has(cmd)) {
      clearMediaTimer(s._id);
      track(s._id, 'photos_done', { photos: s.draft.photos.length, videos: s.draft.videos.length });
      if (s.editing === 'photos') {
        const site = await ownedSite(s);
        const update = {};
        if (s.draft.photos.length) update.photos = await inspectPhotos(s.draft.photos, { name: site?.businessName, category: site?.category, city: site?.city });
        if (s.draft.videos.length) update.videos = s.draft.videos;
        if (!Object.keys(update).length) return backToLive(s, 'Photos unchanged.');
        const result = await applyEdit(s, update, 'Photos updated');
        if (update.photos) deletePhotos(site?.photos).catch((err) => log.warn('old photo cleanup failed', { error: err.message }));
        if (update.videos) deleteVideos(site?.videos).catch((err) => log.warn('old video cleanup failed', { error: err.message }));
        return result;
      }
      return askSlug(s);
    }

    await sendButtons(s._id, t(lang(s), 'photos', { photos: MAX_PHOTOS, videos: MAX_VIDEOS }), [
      { id: 'photos_done', title: t(lang(s), 'done') },
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
        `Great, you can connect ${domain} after your site is live: just send *connect domain ${domain}*. ` +
          `For now your site goes live at ${slug}.${ROOT}.`
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
    const state = accessState(site);
    const active = state === 'live' || state === 'trial';

    if (PAY.has(cmd)) return sendPayLink(s, site);
    if (CANCEL.has(cmd)) return askCancel(s, site);

    const emailMatch = text.match(/^e-?mail\s*[:\-]?\s*([^\s@]+@[^\s@]+\.[a-z]{2,})$/i);
    if (emailMatch) return applyEdit(s, { notifyEmail: emailMatch[1].toLowerCase() }, `📧 Enquiry alerts will also go to ${emailMatch[1]}`);

    if (cmd === 'leads' || cmd === 'enquiries') return showLeads(s, site);

    if (cmd.startsWith('dom:')) return offerDomain(s, site, cmd.slice(4));
    if (cmd.startsWith('bought:')) return handleDomain(s, site, cmd.slice(7));
    if (/^(transfer|move) (my )?domain$/.test(cmd)) return requestTransfer(s, site);
    if (DOMAIN_MENU.has(cmd) || wantsDomain(text)) return domainMenu(s, site, /renew/.test(cmd));
    if (cmd === 'domain_find') return showDomainIdeas(s, site);
    if (cmd === 'domain_have') return sendText(s._id, 'Great! Send it like this and I will guide you: *connect domain yourname.com*');
    if (cmd === 'domain_skip') return sendText(s._id, `👍 You'll keep ${siteUrl(site.slug)}. Send *domain* anytime to get your own.`);
    const checkMatch = text.match(DOMAIN_CHECK);
    if (checkMatch) return offerDomain(s, site, checkMatch[1]);

    const domainMatch = text.match(/^(?:connect\s+)?(?:my\s+)?domain\s*[:\-]?\s*(\S+)$/i);
    if (domainMatch) return handleDomain(s, site, domainMatch[1]);

    if (!active) return liveMenu(s, site);

    if (cmd === 'edit_about' && site.page?.body) {
      return sendText(
        s._id,
        'Just type or send a voice note with what you want to change. For example:\n' +
          '• _Make the colours dark green and gold_\n' +
          '• _Add home loans to our services_\n' +
          '• _Make the headline shorter and bolder_\n' +
          '• _Change the top picture to a modern house at night_'
      );
    }
    if (cmd === 'edit_about') {
      return sendText(s._id, 'Type or send a voice note with what you want to change, for example: _add home delivery to our services_.');
    }
    if (cmd === 'edit_photos') {
      s.state = 'ASK_PHOTOS';
      s.editing = 'photos';
      s.draft = { photos: [], videos: [] };
      return sendButtons(
        s._id,
        `Send up to ${MAX_PHOTOS} new photos or ${MAX_VIDEOS} videos. They'll replace the current ones. Tap Done when finished.`,
        [{ id: 'photos_done', title: 'Done ✅' }]
      );
    }
    if (cmd === 'get_link') return sendText(s._id, site.customDomain ? `https://${site.customDomain}` : siteUrl(site.slug));

    if (cmd === 'new design') {
      if (!(await allowAdvanced(s._id, config.limits.advancedPerDay))) {
        return sendText(s._id, "You've reached today's limit for new designs. Please try again tomorrow.");
      }
      await sendText(s._id, '🎨 Creating a completely new design with new pictures. This takes 3 to 5 minutes...');
      markOutcome(site.slug, 'rejected').catch(() => {});
      const made = await designSite(site, s._id);
      if (!made.page) {
        return sendText(s._id, "⚠️ The designer AI didn't answer this time, so your site is unchanged. Please try again in a minute.");
      }
      await saveHistory(site);
      return applyEdit(
        s,
        { style: 'advanced', design: made.design, page: made.page, photos: site.photos, ...(made.brief ? { brief: made.brief } : {}), ...(made.aiImages.length ? { aiImages: made.aiImages } : {}) },
        '🎨 New design ready (send *undo* to go back)'
      );
    }

    if (cmd === 'undo') return undoEdit(s, site);

    if (msg.type === 'location' && msg.location?.lat != null) {
      return applyEdit(s, { location: msg.location }, '📍 Location added');
    }

    const numberMatch = text.match(/^(?:number|phone|contact)\s*[:\-]?\s*([+\d][\d\s-]{6,20})$/i);
    if (numberMatch) {
      const phone = normalizePhone(numberMatch[1]);
      if (!phone) return sendText(s._id, 'That number looks wrong. Send it like: number 9876543210');
      return applyEdit(s, { phone }, `Contact number changed to ${formatPhone(phone)}`);
    }

    if (msg.type === 'audio' && msg.mediaId) {
      const heard = await hearVoice(s, msg);
      if (!heard) return sendText(s._id, t(lang(s), 'voice_failed'));
      s.state = 'CONFIRM_EDIT';
      s.draft = { request: heard };
      return sendButtons(s._id, `🎧 I heard:\n\n_“${heard.slice(0, 700)}”_\n\nShould I make this change?`, [
        { id: 'apply_edit', title: 'Yes, change it ✅' },
        { id: 'cancel_edit', title: 'No' },
      ]);
    }

    if (msg.type === 'text' && !CHAT.has(cmd) && text.length >= 6 && /\s/.test(text)) {
      return liveText(s, site, text);
    }

    return liveMenu(s, site);
  },

  async CONFIRM_EDIT(s, msg, text, cmd) {
    const site = await ownedSite(s);
    const request = s.draft?.request;
    s.state = 'LIVE';
    s.draft = {};
    if (!site) return HANDLERS.NEW(s);
    if (cmd === 'apply_edit' && request) return chatEdit(s, site, request);
    if (cmd === 'cancel_edit') return sendText(s._id, 'OK, nothing changed. Type or send a voice note when you are ready.');
    return HANDLERS.LIVE(s, msg, text, cmd);
  },

  async PICK_DOMAIN(s, msg, text, cmd) {
    const site = await ownedSite(s);
    const choices = s.draft?.domains || [];
    s.state = site ? 'LIVE' : 'NEW';
    if (!site) return HANDLERS.NEW(s);
    const n = Number(cmd);
    if (cmd.startsWith('dom:')) return offerDomain(s, site, cmd.slice(4));
    if (cmd.startsWith('bought:')) return handleDomain(s, site, cmd.slice(7));
    if (Number.isInteger(n) && n >= 1 && n <= choices.length) return offerDomain(s, site, choices[n - 1]);
    const typed = normalizeDomain(text);
    if (typed && /\./.test(text)) return offerDomain(s, site, typed);
    s.draft = {};
    return HANDLERS.LIVE(s, msg, text, cmd);
  },

  async CONFIRM_CANCEL(s, msg, text, cmd) {
    const site = await ownedSite(s);
    s.state = site ? 'LIVE' : 'NEW';
    if (!site) return HANDLERS.NEW(s);
    if (cmd !== 'confirm_cancel') return sendText(s._id, `Good, your plan continues and ${siteUrl(site.slug)} stays live.`);
    try {
      await cancelSubscription(site);
    } catch (err) {
      log.error('cancel failed', err, { user: hashPhone(s._id) });
      return sendText(s._id, "I couldn't cancel right now. Please try again in a minute.");
    }
    return sendText(
      s._id,
      `Your plan is cancelled and ${siteUrl(site.slug)} is now offline. Your design is saved, so send *pay* anytime to bring it back.`
    );
  },

  async CONFIRM_DELETE(s, msg, text, cmd) {
    const site = await ownedSite(s);
    if (cmd === 'confirm_delete' && site) {
      await deleteSite(s, site);
      return DROP_SESSION;
    }
    s.state = site ? 'LIVE' : 'NEW';
    if (!site) return HANDLERS.NEW(s);
    return sendText(s._id, `Good, your website stays: ${siteUrl(site.slug)}`);
  },

  ASK_ABOUT(s) {
    return HANDLERS.NEW(s);
  },
};

function normalizePhone(input) {
  let digits = String(input).replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length === 10) digits = `91${digits}`;
  return digits.length >= 11 && digits.length <= 15 ? digits : null;
}

async function startNewSite(s) {
  const owned = await sites.find({ ownerPhone: s._id }).sort({ createdAt: -1 }).limit(20).toArray();
  const allowed = isAdminPhone(s._id) || !owned.length || owned.every((x) => x.plan === 'paid' && accessState(x) === 'live');
  if (!allowed) {
    return sendText(s._id, `You can make another website once your current one is on a paid plan. Send *pay* to keep ${siteUrl(owned[0].slug)} online.`);
  }
  clearMediaTimer(s._id);
  s.fresh = true;
  s.slug = null;
  s.state = 'NEW';
  s.draft = {};
  s.editing = null;
  return HANDLERS.NEW(s);
}

async function listSites(s) {
  const owned = await sites.find({ ownerPhone: s._id }).sort({ createdAt: -1 }).limit(20).toArray();
  if (!owned.length) return sendText(s._id, "You don't have a website yet. Send *hi* to make one.");
  const current = s.slug || owned[0].slug;
  return sendText(
    s._id,
    `🌐 Your websites:\n\n${owned.map((x) => `${x.slug === current ? '👉' : '•'} *${x.slug}* (${x.businessName}) · ${accessState(x)}`).join('\n')}\n\n` +
      'Send *switch name* to work on another one, or *new website* to make one more.'
  );
}

async function switchSite(s, slug) {
  const site = await sites.findOne({ slug, ownerPhone: s._id });
  if (!site) return sendText(s._id, `I couldn't find a website called *${slug}* on your number. Send *my websites* to see them.`);
  clearMediaTimer(s._id);
  s.fresh = false;
  s.slug = site.slug;
  s.state = 'LIVE';
  s.draft = {};
  s.editing = null;
  return liveMenu(s, site);
}

function ownedSite(s) {
  if (s.slug) return sites.findOne({ slug: s.slug, ownerPhone: s._id });
  return sites.findOne({ ownerPhone: s._id }, { sort: { createdAt: -1 } });
}

function clearMediaTimer(phone) {
  clearTimeout(mediaTimers.get(phone));
  mediaTimers.delete(phone);
}

function scheduleMediaAck(phone) {
  clearMediaTimer(phone);
  const timer = setTimeout(() => {
    mediaTimers.delete(phone);
    enqueue(phone, async () => {
      const s = await sessions.findOne({ _id: phone });
      if (s?.state !== 'ASK_PHOTOS') return;
      const p = s.draft?.photos?.length ?? 0;
      const v = s.draft?.videos?.length ?? 0;
      if (!p && !v) return;
      const parts = [p && `${p} photo${p === 1 ? '' : 's'}`, v && `${v} video${v === 1 ? '' : 's'}`].filter(Boolean).join(' and ');
      const full = p >= MAX_PHOTOS && (v >= MAX_VIDEOS || !v);
      const body = full ? `Got ${parts}, that's the maximum 📸 Tap Done to continue.` : `Got ${parts} 📸 Send more or tap Done.`;
      await sendButtons(phone, body, [{ id: 'photos_done', title: t(s.lang, 'done') }]);
    });
  }, 2500);
  timer.unref?.();
  mediaTimers.set(phone, timer);
}

async function askSlug(s) {
  s.draft.slug = await suggestSlug(s.draft.businessName, s.draft.city, s.draft.slugHint);
  if (!s.draft.slug) {
    s.state = 'ASK_CUSTOM_SLUG';
    return sendText(s._id, `Type a short name for your website address.\n_Example: sweetcrumbs → sweetcrumbs.${ROOT}_`);
  }
  s.state = 'ASK_SLUG';
  await sendButtons(s._id, `Your website address will be:\n\n🌐 *${s.draft.slug}.${ROOT}*`, [
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

function onTrial(phone) {
  return trialsEnabled() && !config.adminNumbers.includes(String(phone));
}

async function publish(s) {
  if (!(await allowNewSite(s._id, config.limits.sitesPerDay))) {
    return sendText(s._id, "You've created the maximum number of websites for today. Please try again tomorrow.");
  }
  const d = s.draft;
  const now = new Date();
  let style = d.style === 'advanced' ? 'advanced' : 'basic';
  let extras = {};
  let brief = null;
  let designFailed = false;
  if (style === 'advanced') {
    if (!(await allowAdvanced(s._id, config.limits.advancedPerDay))) {
      style = 'basic';
      await sendText(s._id, "You've reached today's limit for designed websites, so I'll publish a simpler layout today. Send *new design* tomorrow for the full design.");
    } else {
      await sendText(s._id, '🎨 Designing your website and creating its pictures. This takes 3 to 5 minutes, I will send the link here...');
      const made = await designSite({ ...d, language: s.lang || d.language }, s._id);
      extras = { design: made.design, aiImages: made.aiImages, ...(made.page ? { page: made.page } : {}), ...(made.brief ? { brief: made.brief } : {}) };
      designFailed = !made.page;
      brief = made.brief;
    }
  }
  const trial = onTrial(s._id);
  const site = {
    slug: d.slug,
    ownerPhone: s._id,
    phone: s._id,
    status: trial ? 'trial' : 'active',
    plan: trial ? 'trial' : 'free',
    ...(trial ? { trialEndsAt: trialEndsAt(now) } : {}),
    businessName: d.businessName,
    industry: classifyIndustry(d).id,
    category: d.category,
    tagline: d.tagline,
    description: d.description,
    city: d.city,
    area: d.area || '',
    services: d.services ?? [],
    theme: d.theme,
    language: s.lang || d.language,
    ownerWords: d.ownerWords || '',
    photos: d.photos ?? [],
    videos: d.videos ?? [],
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
  track(s._id, 'published', { seconds: secs, trial });
  s.state = 'LIVE';
  s.slug = d.slug;
  s.fresh = false;
  s.draft = {};
  s.editing = null;

  const action = industryAction(classifyIndustry(site)).label;
  const missing = (brief?.missing || []).slice(0, 3);
  await sendText(
    s._id,
    `🎉 Your website is live${secs ? ` (built in ${secs} seconds)` : ''}!\n\n${siteUrl(d.slug)}\n\n` +
      (designFailed
        ? `⚠️ The designer AI was busy, so I used a simpler layout. Send *new design* in a minute for the full design.\n\n`
        : brief?.direction
          ? `🎨 ${brief.direction}\n\n`
          : '') +
      `👉 Visitors tap *${action}* to message you on WhatsApp, and website enquiries arrive right here.\n\n` +
      (missing.length ? `📝 To make it even better, send me: ${missing.join('; ')}.\n` : '') +
      `📍 Share your location pin to add a map. Your number ${formatPhone(s._id)} is on the buttons (send *number 98xxxxxxxx* to change it).\n\n` +
      (trial
        ? `⏳ It's *free for ${config.billing.trialHours} hours*, then it goes offline automatically.\n` +
          (billingEnabled()
            ? `To keep it online: *${priceLabel()}*. Pay by ${payMethods()}${autopayAvailable() ? ', with autopay or one period at a time' : ''}:\n${payLink(d.slug)}\n\n`
            : `To keep it online, just reply *keep it* here.\n\n`)
        : '') +
      `✏️ Want changes? Just type or send a voice note, for example _"make the colours warmer"_. Send *undo* to go back or *new design* for a fresh look.`
  );
}

async function designSite(site, ownerPhone) {
  const design = makeDesign(site, String(Date.now()));
  const industry = classifyIndustry(site);
  const memory = await designMemory(site.category, industry.id).catch(() => null);
  site.photos = await inspectPhotos(site.photos, { name: site.businessName, category: site.category, city: site.city, services: site.services });
  const brief = await createArtDirection(site, memory);
  const prompts =
    brief?.imagePrompts?.length === 4
      ? brief.imagePrompts
      : industry.id !== 'general'
        ? industry.imagery.map((what) => `${what}, for ${site.businessName}, a ${site.category || industry.name} in ${site.city || 'India'}`)
        : fallbackPrompts(site);
  const queries = [0, 1, 2, 3].map(
    (i) => brief?.searchQueries?.[i] || industry.queries[i] || [site.category, ['', 'interior', 'work', 'detail'][i]].filter(Boolean).join(' ')
  );
  const arranged = arrangeOwnPhotos(site.photos);
  const skip = [arranged.hero && 0, arranged.about && 1, arranged.services && 2].filter((x) => x !== false && x !== null);
  const context = {
    businessClass: industry.name,
    business: { name: site.businessName, category: site.category, city: site.city, services: site.services },
    concept: brief?.concept,
    palette: brief?.palette,
    imageTreatment: brief?.imageTreatment,
    acceptance: (brief?.images || []).map((r) => r.acceptance_criteria),
  };
  const [aiImages, page] = await Promise.all([
    sourceSiteImages({ prompts, queries, context, ownerPhone, skip }),
    generateSitePage({ ...site, design }, brief).catch((err) => {
      log.warn('page generation failed', { error: err.message });
      return null;
    }),
  ]);
  if (page) recordDesign(site, brief, page, aiImages).catch((err) => log.warn('design memory failed', { error: err.message }));
  return { design, aiImages, page, brief: briefSummary(brief) };
}

function briefSummary(brief) {
  if (!brief) return null;
  const list = (v) => (Array.isArray(v) ? v.map((x) => String(x).slice(0, 160)).slice(0, 6) : []);
  return {
    ...(brief.brief && typeof brief.brief === 'object' ? { business: { ...brief.brief, facts: list(brief.brief.facts), assumptions: list(brief.brief.assumptions), missing: list(brief.brief.missing) } } : {}),
    direction: String(brief.presentation?.direction || brief.concept || '').slice(0, 300),
    missing: list(brief.brief?.missing),
    images: brief.images || [],
    seed: brief.seed || null,
    industry: brief.industry || '',
  };
}

function snapshot(site) {
  const keys = ['style', 'businessName', 'tagline', 'description', 'services', 'city', 'category', 'design', 'page', 'aiImages', 'brief'];
  return Object.fromEntries(keys.filter((k) => site[k] !== undefined).map((k) => [k, site[k]]));
}

async function saveHistory(site) {
  await sites.updateOne(
    { _id: site._id },
    { $push: { history: { $each: [{ at: new Date(), ...snapshot(site) }], $slice: -HISTORY } } }
  );
}

async function undoEdit(s, site) {
  const last = site.history?.at(-1);
  if (!last) return sendText(s._id, 'There is nothing to undo.');
  const { at, ...fields } = last;
  await sites.updateOne({ _id: site._id }, { $pop: { history: 1 } });
  return applyEdit(s, fields, '↩️ Previous version restored');
}

function routeContext(site) {
  return {
    business: site.businessName,
    website: site.customDomain ? `https://${site.customDomain}` : siteUrl(site.slug),
    status: accessState(site),
    trialEnds: site.trialEndsAt || null,
    paidUntil: site.billing?.paidUntil || null,
    price: billingEnabled() ? priceLabel() : 'free while we are in demo',
    payment: billingEnabled() ? `send "pay" for the payment link (${payMethods()})` : 'reply "keep it" and the team activates it',
    commands: 'pay, cancel plan, domain (find and buy a new domain), connect domain name.com (only for a domain they already own), leads, new design, undo, number 98xxxxxxxx, email you@example.com, delete my site; share a location pin to add a map; type or voice-note any change',
    pictures: (site.aiImages || []).map((x, i) => ({ slot: (Number.isInteger(x.slot) ? x.slot : i) + 1, brief: String(x.prompt || '').slice(0, 200) })),
  };
}

async function liveText(s, site, text) {
  let route = null;
  if (cheapEnabled()) {
    route = await routeMessage(text, routeContext(site)).catch((err) => {
      log.warn('message routing failed', { error: err.message });
      return null;
    });
  }
  if (route?.feedback === 'positive' || route?.feedback === 'negative') markFeedback(site.slug, route.feedback).catch(() => {});
  if (route && (route.intent === 'question' || route.intent === 'chat') && route.answer) {
    track(s._id, 'answered', { intent: route.intent });
    return sendText(s._id, route.answer);
  }
  if (route?.intent === 'domain') return domainMenu(s, site);
  if (route?.intent === 'images' && site.page?.body) return redrawOnly(s, site, route);
  if (!route) {
    s.state = 'CONFIRM_EDIT';
    s.draft = { request: text };
    return sendButtons(s._id, `Should I change your website like this?\n\n_“${text.slice(0, 500)}”_`, [
      { id: 'apply_edit', title: 'Yes, change it ✅' },
      { id: 'cancel_edit', title: 'No' },
    ]);
  }
  return chatEdit(s, site, text);
}

async function redrawImages(site, images, ownerPhone) {
  const aiImages = (site.aiImages || []).map((x, i) => ({ ...x, slot: Number.isInteger(x.slot) ? x.slot : i }));
  const made = await Promise.allSettled(images.map((x) => generateImage(x.prompt, x.slot - 1, ownerPhone)));
  made.forEach((r, i) => {
    if (r.status !== 'fulfilled') return log.warn('ai image failed', { error: r.reason?.message });
    const slot = images[i].slot - 1;
    const at = aiImages.findIndex((x) => x.slot === slot);
    if (at >= 0) aiImages[at] = { ...r.value, slot };
    else aiImages.push({ ...r.value, slot });
  });
  return { aiImages, count: made.filter((r) => r.status === 'fulfilled').length };
}

async function redrawOnly(s, site, route) {
  if (!(await allowEdit(s._id, config.limits.editsPerDay))) {
    return sendText(s._id, "You've reached today's limit for changes. Please try again tomorrow.");
  }
  if (isDisallowedText(...route.images.map((x) => x.prompt))) return sendText(s._id, "Sorry, I can't add that to your website.");
  await sendText(s._id, '🖼 Creating the new pictures. This takes about a minute...');
  noteRevision(site.slug, route.images.map((x) => x.prompt).join(' | ')).catch(() => {});
  const { aiImages, count } = await redrawImages(site, route.images, s._id);
  if (!count) return sendText(s._id, "⚠️ I couldn't make new pictures right now. Your website is unchanged, please try again in a minute.");
  await saveHistory(site);
  track(s._id, 'chat_edit', { fields: ['aiImages'] });
  return applyEdit(s, { aiImages }, `${route.summary || 'New pictures added'}\n\nSend *undo* to go back`);
}

async function chatEdit(s, site, request) {
  if (!(await allowEdit(s._id, config.limits.editsPerDay))) {
    return sendText(s._id, "You've reached today's limit for changes. Please try again tomorrow.");
  }
  if (isDisallowedText(request)) {
    return sendText(s._id, "Sorry, I can't add that to your website.");
  }
  await sendText(s._id, site.page?.body ? '✏️ Working on your change. This takes 1 to 4 minutes...' : '✏️ Updating your website...');
  let result;
  noteRevision(site.slug, request).catch(() => {});
  try {
    result = await editSite(site, request);
  } catch (err) {
    log.warn('chat edit failed', { error: err.message });
    return sendText(s._id, "⚠️ I couldn't make that change right now. Your website is unchanged, please try again in a minute.");
  }
  const { summary, fields, images, page } = result;
  if (isDisallowedText(...Object.values(fields).flat())) {
    return sendText(s._id, "Sorry, I can't add that to your website.");
  }
  const update = { ...fields };
  if (page) update.page = { ...site.page, ...page };
  if (images.length) update.aiImages = (await redrawImages(site, images, s._id)).aiImages;
  if (!Object.keys(update).length) {
    return sendText(s._id, summary || "I couldn't find anything to change. Tell me in a few words what you'd like different.");
  }
  await saveHistory(site);
  track(s._id, 'chat_edit', { fields: Object.keys(update) });
  return applyEdit(s, update, `${summary || 'Done'}\n\nSend *undo* to go back`);
}

async function applyEdit(s, fields, label) {
  const site = await sites.findOneAndUpdate(
    { slug: s.slug, ownerPhone: s._id },
    { $set: { ...fields, updatedAt: new Date() } },
    { returnDocument: 'after' }
  );
  invalidate(s.slug, site?.customDomain);
  track(s._id, 'edited', { fields: Object.keys(fields) });
  return backToLive(s, `✅ ${label}\n\n${site?.customDomain ? `https://${site.customDomain}` : siteUrl(s.slug)}`);
}

async function backToLive(s, message) {
  s.state = 'LIVE';
  s.editing = null;
  s.draft = {};
  await sendText(s._id, message);
}

async function sendPayLink(s, site) {
  if (!billingEnabled()) {
    if (!trialsEnabled() || (site.plan === 'paid' && accessState(site) === 'live')) {
      return sendText(s._id, `Your website is live: ${siteUrl(site.slug)}`);
    }
    track(s._id, 'wants_to_keep', { slug: site.slug });
    for (const admin of config.adminNumbers) {
      await sendText(
        admin,
        `🔔 ${site.businessName} wants to keep their website.\n${siteUrl(site.slug)}\nOwner: +${site.ownerPhone}\n\nSend *activate ${site.slug}* or *extend ${site.slug} 24*.`
      ).catch((err) => log.warn('admin alert failed', { error: err.message }));
    }
    return sendText(s._id, `🙌 Thank you! Our team will contact you shortly to activate ${siteUrl(site.slug)}.`);
  }
  if (site.plan === 'paid' && accessState(site) === 'live') {
    if (site.billing?.autopay || !site.billing?.paidUntil) {
      return sendText(s._id, `✅ Your plan is active${site.billing?.autopay ? ' and autopay renews it by itself' : ''}. To cancel, send *cancel plan*.`);
    }
    return sendText(
      s._id,
      `✅ Paid until *${shortDate(site.billing.paidUntil)}*. To add more time now (${priceLabel()}):\n${payLink(site.slug)}`
    );
  }
  return sendText(
    s._id,
    `💳 Keep ${siteUrl(site.slug)} online: *${priceLabel()}*. Pay by ${payMethods()}${autopayAvailable() ? ', with autopay or one period at a time' : ''}:\n${payLink(site.slug)}`
  );
}

function askCancel(s, site) {
  if (site.plan !== 'paid' || accessState(site) !== 'live') {
    return sendText(s._id, "You don't have an active plan to cancel.");
  }
  if (!site.billing?.autopay && site.billing?.paidUntil) {
    return sendText(
      s._id,
      `You're not on autopay, so nothing more will be charged. ${siteUrl(site.slug)} simply goes offline on *${shortDate(site.billing.paidUntil)}* unless you pay again.\n\nTo remove it now, send *delete my site*.`
    );
  }
  s.state = 'CONFIRM_CANCEL';
  return sendButtons(
    s._id,
    `Cancelling stops autopay and takes ${siteUrl(site.slug)} offline right away. Are you sure?`,
    [
      { id: 'confirm_cancel', title: 'Yes, cancel' },
      { id: 'keep_plan', title: 'No, keep it' },
    ]
  );
}

const isAdminPhone = (phone) => config.adminNumbers.includes(String(phone));

function domainAllowed(s, site) {
  return isAdminPhone(s._id) || !billingEnabled() || (site.plan === 'paid' && accessState(site) === 'live');
}

async function domainMenu(s, site, renewing) {
  if (!domainShopEnabled() && !domainIdeasEnabled()) {
    return sendText(s._id, 'To use your own domain, send: *connect domain yourname.com*');
  }
  if (site.domain?.name && !site.domain.expired && !renewing) {
    return sendText(
      s._id,
      `🌐 Your domain is *${site.domain.name}*, paid until *${shortDate(site.domain.expiresAt)}*. I'll remind you before it expires. To renew early: ${domainPayLink(site.slug)}`
    );
  }
  if (site.domain?.name && domainShopEnabled()) return sendText(s._id, `🌐 Renew *${site.domain.name}* for 1 year here:\n${domainPayLink(site.slug)}`);
  if (site.customDomain && !renewing) {
    return sendText(s._id, `🌐 Your website is on *${site.customDomain}*. To use a different domain, send *connect domain newname.com*.`);
  }
  return sendButtons(
    s._id,
    `🌐 Want your own web address instead of ${site.slug}.${ROOT}?\n\nPick a new one and I'll set everything up, or connect one you already own.`,
    [
      { id: 'domain_find', title: 'Find a new domain' },
      { id: 'domain_have', title: 'I have a domain' },
      { id: 'domain_skip', title: 'Keep free address' },
    ]
  );
}

async function requestTransfer(s, site) {
  if (!site.domain?.name) return sendText(s._id, "You don't have a domain bought through us. Send *domain* to get one.");
  for (const admin of config.adminNumbers) {
    await sendText(admin, `🔁 ${site.businessName} wants to move ${site.domain.name} to their own registrar account. Owner: +${site.ownerPhone}. Unlock it in Porkbun and send them the transfer code.`).catch(() => {});
  }
  return sendText(s._id, `👍 *${site.domain.name}* is yours. Our team will send you its transfer code here within 1 working day so you can move it to any registrar you like.`);
}

async function showDomainIdeas(s, site) {
  if (!domainShopEnabled() && !domainIdeasEnabled()) return domainMenu(s, site);
  if (!domainAllowed(s, site)) {
    return sendText(s._id, `🌐 Your own domain comes with a paid plan. Keep your site online first, then send *domain* again:\n${payLink(site.slug)}`);
  }
  await sendText(s._id, '🔎 Checking which names are free...');
  let list = [];
  try {
    list = await findDomains(site);
  } catch (err) {
    log.error('domain search failed', err);
    return sendText(s._id, "I couldn't check domains right now. Please try again in a minute.");
  }
  if (!list.length) {
    return sendText(s._id, 'I could not find a free name that fits. Type one you like, for example: *check mybusiness.com*');
  }
  s.state = 'PICK_DOMAIN';
  s.draft = { domains: list.map((d) => d.domain) };
  return sendList(
    s._id,
    `🌐 These are free right now:\n\n${list.map((d, i) => `${i + 1}. *${d.domain}* · ${priceText(d)}`).join('\n')}\n\n` +
      'Tap *See names* and pick one, reply with its number, or type another name, for example: *mybusiness.com*',
    'See names',
    domainRows(list)
  );
}

async function offerDomain(s, site, input) {
  const domain = normalizeDomain(input);
  if (!domain) return sendText(s._id, 'That name looks wrong. Send it like: *check mybusiness.com*');
  if (!domainShopEnabled()) return selfBuy(s, site, domain);
  if (!domainAllowed(s, site)) {
    return sendText(s._id, `🌐 Your own domain comes with a paid plan. Keep your site online first, then send *domain* again:\n${payLink(site.slug)}`);
  }
  s.state = 'LIVE';
  s.draft = {};
  let order = null;
  try {
    order = await quoteDomain(site, domain);
  } catch (err) {
    log.error('domain quote failed', err, { domain });
    return sendText(s._id, "I couldn't check that name right now. Please try again in a minute.");
  }
  if (!order) {
    return sendText(s._id, `😕 *${domain}* is taken or not available. Send *domain* to see other names, or type another one.`);
  }
  if (isAdminPhone(s._id)) {
    await sendText(s._id, `🛠 Admin: registering *${domain}* now...`);
    await domainPaid(site, { id: `admin-${order.id}`, orderId: order.id, amount: order.charge, domain });
    return;
  }
  let checkout = domainPayLink(site.slug);
  try {
    checkout = await createPayment(await sites.findOne({ _id: site._id }), { kind: 'domain' });
  } catch (err) {
    log.warn('domain checkout failed', { error: err.message });
  }
  return sendText(
    s._id,
    `${offerText(order)}\n\n👉 Tap to pay by ${payMethods()}. I'll buy it, set it up and connect it for you; if anything goes wrong you get a full refund:\n${checkout}`
  );
}

async function selfBuy(s, site, domain) {
  if (!domainIdeasEnabled()) return handleDomain(s, site, domain);
  if (!domainAllowed(s, site)) {
    return sendText(s._id, `🌐 Your own domain comes with a paid plan. Keep your site online first, then send *domain* again:\n${payLink(site.slug)}`);
  }
  s.state = 'LIVE';
  s.draft = {};
  await sendText(
    s._id,
    `🌐 Buy *${domain}* in your own name, paid directly to the domain company, from any of these (usually about $10 to $15 a year):\n\n` +
      buyLinks(domain).map((l) => `• ${l.name}: ${l.url}`).join('\n') +
      `\n\nIt stays yours, and you renew it with them each year. When you have bought it, tap the button and I'll connect it to your website.`
  );
  return sendButtons(s._id, `Bought *${domain}*?`, [
    { id: `bought:${domain}`, title: 'I bought it ✅' },
    { id: 'domain_find', title: 'Pick another name' },
  ]);
}

async function handleDomain(s, site, input) {
  const domain = normalizeDomain(input);
  if (!domain) return sendText(s._id, 'That domain looks wrong. Send it like: *connect domain mybusiness.com*');
  if (billingEnabled() && site.plan !== 'paid') {
    return sendText(s._id, `🌐 Your own domain is part of the paid plan. Subscribe first, then send *connect domain ${domain}* again:\n${payLink(site.slug)}`);
  }
  if (!domainsEnabled()) {
    await sites.updateOne({ _id: site._id }, { $set: { requestedDomain: domain } });
    return sendText(s._id, `Thanks! I've noted ${domain}. Our team will connect it for you and message you here.`);
  }
  try {
    return sendText(s._id, await connectDomain(site, domain));
  } catch (err) {
    log.error('domain connect failed', err, { domain });
    return sendText(s._id, `I couldn't add ${domain} right now. Please check the spelling and try again in a few minutes.`);
  }
}

async function showLeads(s, site) {
  const list = await leads.find({ slug: site.slug }).sort({ at: -1 }).limit(5).toArray();
  if (!list.length) return sendText(s._id, 'No enquiries yet. They will arrive here as soon as someone fills in the form on your website.');
  return sendText(
    s._id,
    `📩 *Latest enquiries*\n\n${list
      .map((l) => `👤 ${l.name} · 📞 ${l.phone}${l.message ? `\n💬 ${l.message.slice(0, 200)}` : ''}`)
      .join('\n\n')}`
  );
}

async function askDelete(s) {
  clearMediaTimer(s._id);
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
  if (site.plan === 'paid' && site.billing?.subscriptionId) {
    await cancelSubscription(site).catch((err) => log.warn('subscription cancel failed', { error: err.message }));
  }
  await deletePhotos(site.photos).catch((err) => log.warn('photo delete failed', { error: err.message }));
  await deleteVideos(site.videos).catch((err) => log.warn('video delete failed', { error: err.message }));
  await sites.deleteOne({ _id: site._id });
  invalidate(site.slug, site.customDomain);
  track(s._id, 'deleted');
  await sendText(s._id, 'Your website, photos and details have been deleted. Message me anytime to make a new one.');
}

function liveMenu(s, site) {
  const state = accessState(site);
  const url = site?.customDomain ? `https://${site.customDomain}` : siteUrl(s.slug);
  if (state === 'expired' || state === 'cancelled') {
    return sendText(
      s._id,
      `⏸ Your website ${url} is offline because ${state === 'cancelled' ? 'the plan was cancelled' : site.plan === 'paid' ? 'the paid time ended' : 'the free trial ended'}.\n\n` +
        (billingEnabled() ? `Bring it back instantly for ${priceLabel()}, pay by ${payMethods()}:\n${payLink(s.slug)}` : 'Reply *keep it* and our team will bring it back for you.')
    );
  }
  const trialNote =
    state === 'trial' && site.trialEndsAt
      ? `🎁 Free trial: about ${Math.max(1, Math.round((new Date(site.trialEndsAt) - Date.now()) / 3600000))} hours left. Send *${billingEnabled() ? 'pay' : 'keep it'}* to keep it online.\n\n`
      : '';
  return sendButtons(
    s._id,
    `Your website: ${url}\n\n${trialNote}To change anything, type it or send a voice note, for example _"make the colours dark blue"_.\n\n` +
      `More: *new design*, *undo*, *leads*, *domain*, *email you@example.com*, *number 98xxxxxxxx*, *pay*, *cancel plan*, *my websites*, *new website*, *delete my site*`,
    [
      { id: 'edit_about', title: 'Edit details' },
      { id: 'edit_photos', title: 'Change photos' },
      { id: 'get_link', title: 'Get my link' },
    ]
  );
}
