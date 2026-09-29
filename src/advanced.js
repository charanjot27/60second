import { config, siteUrl, botLink } from './config.js';
import { FONT_PAIRS, palette } from './design.js';
import { SITE_SCRIPT, escapeHtml as e, formatPhone } from './render.js';
import { buildData, fillTemplate, sanitizeBody, pageCss } from './generate.js';

const WA_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2c-1.5 0-3-.4-4.3-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.4.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.8 11.9 11.9 0 0 0 4.6 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3Z"/></svg>';
const CALL_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z"/></svg>';

function css(d, p, font) {
  return `:root{--bg:${p.bg};--surface:${p.surface};--ink:${p.ink};--muted:${p.muted};--line:${p.line};--accent:${p.accent};--accent2:${p.accent2};--on:${p.onAccent};--r:${d.radius}px;--display:"${font.display}",${font.serif ? 'Georgia,serif' : 'system-ui,sans-serif'};--body:"${font.body}",system-ui,sans-serif;color-scheme:${p.scheme}}
*{box-sizing:border-box}html{scroll-behavior:smooth;-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:17px/1.65 var(--body);padding-top:env(safe-area-inset-top);-webkit-font-smoothing:antialiased}
img{display:block;max-width:100%}a{color:inherit}
:focus-visible{outline:3px solid var(--accent);outline-offset:3px;border-radius:8px}
h1,h2,h3{font-family:var(--display);line-height:1.05;margin:0;letter-spacing:-.02em;text-wrap:balance}
h1{font-size:clamp(40px,9vw,84px);font-weight:800}
h2{font-size:clamp(28px,5vw,44px);font-weight:700;margin-bottom:18px}
p{text-wrap:pretty;margin:0}
.wrap{max-width:1180px;margin:0 auto;padding:0 20px}
section{padding:64px 0}
.eyebrow{font-weight:600;font-size:13px;letter-spacing:.1em;text-transform:uppercase;color:var(--accent);margin-bottom:14px}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:9px;min-height:54px;padding:0 26px;border-radius:999px;font-weight:600;font-size:16px;text-decoration:none;border:2px solid var(--accent);white-space:nowrap}
.btn svg{width:21px;height:21px}
.btn.primary{background:var(--accent);color:var(--on)}
.btn.ghost{color:var(--accent);background:transparent}
.btn:active{transform:scale(.98)}
.cta{display:flex;flex-wrap:wrap;gap:12px;margin-top:28px}
.lead{font-size:clamp(18px,2.4vw,22px);color:var(--muted);max-width:40ch;margin-top:18px}
.art{width:100%;aspect-ratio:4/5;object-fit:cover;border-radius:var(--r);background:linear-gradient(140deg,var(--accent),var(--accent2))}
.ph{margin:0;position:relative}
.ph button{display:block;width:100%;padding:0;border:0;background:var(--surface);border-radius:var(--r);overflow:hidden;cursor:zoom-in}
.ph img{width:100%;height:100%;object-fit:cover}
.tag{position:absolute;left:10px;bottom:10px;font-size:11px;padding:3px 9px;border-radius:99px;background:rgba(0,0,0,.55);color:#fff}
.hero{padding:40px 0 56px}
.hero .wrap{display:grid;gap:36px;align-items:center}
.l-split .wrap{grid-template-columns:1fr}
.l-center .wrap{text-align:center;justify-items:center}
.l-center .lead{margin-inline:auto}.l-center .cta{justify-content:center}
.l-center .art{aspect-ratio:16/9;max-width:980px}
.l-full{position:relative;color:#fff;min-height:82vh;display:flex;align-items:flex-end;padding:0}
.l-full .bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;background:linear-gradient(140deg,var(--accent),var(--accent2))}
.l-full::after{content:"";position:absolute;inset:0;background:linear-gradient(0deg,rgba(0,0,0,.72),rgba(0,0,0,.15) 65%)}
.l-full .wrap{position:relative;z-index:1;padding-bottom:56px;padding-top:120px}
.l-full .lead{color:rgba(255,255,255,.86)}.l-full .eyebrow{color:#fff}
.l-full .btn.primary{background:#fff;color:#111;border-color:#fff}.l-full .btn.ghost{color:#fff;border-color:#fff}
.l-editorial .wrap{grid-template-columns:1fr}
.l-editorial h1{font-size:clamp(48px,12vw,132px);line-height:.92}
.l-editorial .art{aspect-ratio:16/8}
.about .wrap{display:grid;gap:32px;align-items:center}
.about p{font-size:19px;max-width:56ch}
.svc{list-style:none;padding:0;margin:0;display:grid;gap:14px}
.svc.cards{grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}
.svc.cards li{background:var(--surface);border:1px solid var(--line);border-radius:var(--r);padding:22px;font-weight:600}
.svc.cards li::before{content:"";display:block;width:36px;height:4px;border-radius:9px;background:var(--accent);margin-bottom:14px}
.svc.list li{padding:18px 0;border-bottom:1px solid var(--line);font-family:var(--display);font-size:24px}
.svc.numbered{counter-reset:n}
.svc.numbered li{counter-increment:n;display:flex;gap:18px;align-items:baseline;padding:16px 0;border-bottom:1px solid var(--line);font-size:20px;font-weight:600}
.svc.numbered li::before{content:counter(n,decimal-leading-zero);font-family:var(--display);color:var(--accent);font-size:28px}
.gal{display:grid;gap:12px}
.gal.grid{grid-template-columns:repeat(auto-fill,minmax(230px,1fr))}
.gal.grid .ph{aspect-ratio:1}
.gal.masonry{column-count:2;display:block;column-gap:12px}
.gal.masonry .ph{break-inside:avoid;margin-bottom:12px}
.gal.strip{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;gap:12px;scrollbar-width:none}
.gal.strip .ph{flex:0 0 78%;scroll-snap-align:center;aspect-ratio:4/5}
.band{background:var(--surface);border-block:1px solid var(--line)}
.contact .box{background:var(--accent);color:var(--on);border-radius:calc(var(--r) + 6px);padding:clamp(28px,6vw,64px);display:grid;gap:22px}
.contact h2{margin:0}
.contact a{color:inherit}
.contact .btn.primary{background:var(--on);color:var(--accent);border-color:var(--on)}
.contact .btn.ghost{color:var(--on);border-color:var(--on)}
.contact dl{margin:0;display:grid;gap:12px}.contact dt{opacity:.8;font-size:13px}.contact dd{margin:0;font-weight:600}
footer{padding:28px 20px calc(96px + env(safe-area-inset-bottom));text-align:center;color:var(--muted);font-size:14px}
footer p{margin:4px 0}footer a{color:var(--ink);font-weight:600}
.bar{position:fixed;left:0;right:0;bottom:0;z-index:10;display:flex;gap:10px;padding:10px 12px calc(10px + env(safe-area-inset-bottom));background:color-mix(in srgb,var(--bg) 88%,transparent);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border-top:1px solid var(--line);transform:translateY(110%);transition:transform .25s ease}
.bar.on{transform:none}.bar .btn{flex:1 1 0;min-height:48px}
.lb{border:0;padding:0;margin:0;width:100vw;height:100dvh;max-width:none;max-height:none;background:#000;color:#fff}
.lb::backdrop{background:#000}.lb img{width:100%;height:100%;object-fit:contain}
.lb button{position:absolute;display:grid;place-items:center;width:52px;height:52px;border:0;border-radius:999px;background:rgba(255,255,255,.16);color:#fff;font-size:30px;line-height:1;cursor:pointer}
.lb .x{top:calc(12px + env(safe-area-inset-top));right:12px}
.lb .prev,.lb .next{top:50%;transform:translateY(-50%)}.lb .prev{left:12px}.lb .next{right:12px}
.lb .n{position:absolute;left:0;right:0;bottom:calc(16px + env(safe-area-inset-bottom));margin:0;text-align:center;font-size:14px;opacity:.85}
@media (min-width:900px){
section{padding:96px 0}
.l-split .wrap{grid-template-columns:1.05fr .95fr;gap:64px}
.l-split.flip .art{order:-1}
.l-editorial .wrap{gap:48px}
.about .wrap{grid-template-columns:1fr 1fr;gap:64px}
.about.flip .art{order:2}
.gal.masonry{column-count:3}
.gal.strip .ph{flex-basis:32%}
.bar{display:none}
footer{padding-bottom:40px}
}
@media (prefers-reduced-motion:reduce){*{transition:none!important;scroll-behavior:auto!important}}`;
}

function galleryItem(p, i, total, name, tag) {
  return `<figure class="ph"><button type="button" data-i="${i}" aria-label="Open photo ${i + 1} of ${total}"><img src="${e(p.sm)}" srcset="${e(p.sm)} 480w, ${e(p.lg)} 1200w" sizes="(min-width:900px) 33vw, 90vw" width="${Number(p.w) || 1200}" height="${Number(p.h) || 1200}" alt="${e(`${name} photo ${i + 1}`)}" data-lg="${e(p.lg)}" loading="lazy" decoding="async"></button>${tag ? '<span class="tag">AI illustration</span>' : ''}</figure>`;
}

const SHELL_CSS = `*,*::before,*::after{box-sizing:border-box}html{scroll-behavior:smooth;-webkit-text-size-adjust:100%}
body{margin:0;-webkit-font-smoothing:antialiased;padding-top:env(safe-area-inset-top)}img{max-width:100%;display:block}
.sys-footer{padding:28px 20px calc(96px + env(safe-area-inset-bottom));text-align:center;font-size:14px;opacity:.85}
.sys-footer p{margin:4px 0}.sys-footer a{font-weight:600}
.bar{position:fixed;left:0;right:0;bottom:0;z-index:50;display:flex;gap:10px;padding:10px 12px calc(10px + env(safe-area-inset-bottom));background:rgba(255,255,255,.92);color:#111;backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border-top:1px solid rgba(0,0,0,.12);transform:translateY(110%);transition:transform .25s ease}
.bar.on{transform:none}
.bar a{flex:1 1 0;display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:48px;border-radius:999px;font-weight:600;text-decoration:none;border:2px solid #111;color:#111}
.bar a:first-child{background:#111;color:#fff}.bar svg{width:20px;height:20px}
.lb{border:0;padding:0;margin:0;width:100vw;height:100dvh;max-width:none;max-height:none;background:#000;color:#fff}
.lb::backdrop{background:#000}.lb img{width:100%;height:100%;object-fit:contain}
.lb button{position:absolute;display:grid;place-items:center;width:52px;height:52px;border:0;border-radius:999px;background:rgba(255,255,255,.16);color:#fff;font-size:30px;line-height:1;cursor:pointer}
.lb .x{top:calc(12px + env(safe-area-inset-top));right:12px}
.lb .prev,.lb .next{top:50%;transform:translateY(-50%)}.lb .prev{left:12px}.lb .next{right:12px}
.lb .n{position:absolute;left:0;right:0;bottom:calc(16px + env(safe-area-inset-bottom));margin:0;text-align:center;font-size:14px;opacity:.85}
@media (min-width:900px){.bar{display:none}.sys-footer{padding-bottom:40px}}
@media (prefers-reduced-motion:reduce){*{animation-duration:.01ms!important;animation-iteration-count:1!important;transition:none!important;scroll-behavior:auto!important}}`;

function renderGenerated(site) {
  const page = site.page;
  const url = site.customDomain ? `https://${site.customDomain}` : siteUrl(site.slug);
  const data = buildData(site, { formatPhone });
  const body = sanitizeBody(fillTemplate(page.body, data));
  const own = (site.photos || []).filter((x) => !x.ai);
  const ai = (site.aiImages || []).filter((x) => x.lg);
  const og = ai[0] || own[0];
  const title = site.category && site.city
    ? `${site.businessName}, ${site.category} in ${site.city}`
    : site.businessName;
  const description = site.tagline || site.description?.slice(0, 160) || title;
  const phone = data.scalars.tel.slice(4);
  const hasCta = body.includes('id="cta"');
  const gallery = data.lists.photos;
  const lightbox = gallery.length
    ? `<dialog class="lb" id="lb" aria-label="Photos"><img alt=""><button type="button" class="x" aria-label="Close">×</button>${
        gallery.length > 1
          ? '<button type="button" class="prev" aria-label="Previous photo">‹</button><button type="button" class="next" aria-label="Next photo">›</button>'
          : ''
      }<p class="n" aria-live="polite"></p></dialog>`
    : '';
  const ld = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: site.businessName,
    description: site.description || undefined,
    url,
    telephone: phone,
    image: own.map((x) => x.lg),
    address: site.city ? { '@type': 'PostalAddress', addressLocality: site.city, addressCountry: 'IN' } : undefined,
  })
    .replace(/</g, '\u003c')
    .replace(/\u2028|\u2029/g, '');

  return `<!doctype html>
<html lang="${e(site.language || 'en')}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${e(title)}</title>
<meta name="description" content="${e(description)}">
<link rel="canonical" href="${e(url)}/">
<meta name="theme-color" content="${e(page.themeColor || '#222222')}">
<meta property="og:type" content="website">
<meta property="og:title" content="${e(title)}">
<meta property="og:description" content="${e(description)}">
<meta property="og:url" content="${e(url)}">
${og ? `<meta property="og:image" content="${e(og.lg)}">` : ''}
<meta name="twitter:card" content="${og ? 'summary_large_image' : 'summary'}">
${page.fonts ? `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="${e(page.fonts)}">` : ''}
<script type="application/ld+json">${ld}</script>
<style>${SHELL_CSS}${pageCss(page.css)}</style>
</head>
<body>
${body}
<footer class="sys-footer">
<p>Made on WhatsApp in 60 seconds with ${e(config.brand)}. <a href="${e(botLink(`Hi, I want a website like ${site.slug}`))}">Make yours</a></p>
${ai.length ? '<p>Some pictures are AI-generated illustrations.</p>' : ''}
<p><a href="mailto:${e(config.abuseEmail)}?subject=${encodeURIComponent(`Report ${site.slug}`)}">Report this site</a></p>
</footer>
<nav class="bar${hasCta ? '' : ' on'}" id="bar" aria-label="Contact"><a href="${e(data.scalars.wa)}">${WA_ICON}WhatsApp</a><a href="${e(data.scalars.tel)}">${CALL_ICON}Call</a></nav>
${lightbox}
<script>${SITE_SCRIPT}</script>
</body>
</html>`;
}

export function renderAdvanced(site) {
  if (site.page?.body) return renderGenerated(site);
  const d = site.design;
  const p = palette(d);
  const font = FONT_PAIRS[d.font] || FONT_PAIRS[0];
  const url = site.customDomain ? `https://${site.customDomain}` : siteUrl(site.slug);
  const phone = String(site.phone || site.ownerPhone || '').replace(/\D/g, '');
  const waHref = `https://wa.me/${phone}?text=${encodeURIComponent(`Hi ${site.businessName}, I saw your website and would like to know more.`)}`;
  const telHref = `tel:+${phone}`;
  const own = (site.photos || []).filter((x) => !x.ai);
  const ai = (site.aiImages || []).filter((x) => x.lg);
  const hero = ai[0] || own[0];
  const aside = ai[1] || own[1] || ai[0] || own[0];
  const gallery = own.length ? own : ai.slice(1);
  const eyebrow = [site.category, site.city].filter(Boolean).join(' · ');
  const title = site.category && site.city
    ? `${site.businessName}, ${site.category} in ${site.city}`
    : site.businessName;
  const description = site.tagline || site.description?.slice(0, 160) || title;
  const address = site.location?.address || site.location?.name || '';
  const map = site.location?.lat != null && site.location?.lng != null
    ? `https://www.google.com/maps/search/?api=1&query=${site.location.lat},${site.location.lng}`
    : '';

  const img = (x, cls, eager) =>
    x
      ? `<img class="${cls}" src="${e(x.lg)}" srcset="${e(x.sm)} 480w, ${e(x.lg)} 1200w" sizes="(min-width:900px) 50vw, 100vw" width="${Number(x.w) || 1200}" height="${Number(x.h) || 1500}" alt="${e(site.businessName)}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">`
      : `<div class="${cls}" role="presentation"></div>`;

  const buttons = (label) =>
    `<a class="btn primary" href="${e(waHref)}">${WA_ICON}${label}</a><a class="btn ghost" href="${e(telHref)}">${CALL_ICON}Call</a>`;

  const heroText = `<div><p class="eyebrow">${e(eyebrow)}</p><h1>${e(site.businessName)}</h1>${site.tagline ? `<p class="lead">${e(site.tagline)}</p>` : ''}<div class="cta" id="cta">${buttons('Message on WhatsApp')}</div></div>`;
  const heroBlock =
    d.layout === 'full'
      ? `<header class="hero l-full">${hero ? img(hero, 'bg', true) : '<div class="bg"></div>'}<div class="wrap">${heroText}</div></header>`
      : `<header class="hero l-${d.layout}${d.flip ? ' flip' : ''}"><div class="wrap">${heroText}${img(hero, 'art', true)}</div></header>`;

  const services = site.services?.length
    ? `<section class="band"><div class="wrap"><h2>What we offer</h2><ul class="svc ${e(d.services)}">${site.services.map((s) => `<li>${e(s)}</li>`).join('')}</ul></div></section>`
    : '';

  const galleryBlock = gallery.length
    ? `<section><div class="wrap"><h2>Gallery</h2><div class="gal ${e(d.gallery)}">${gallery.map((x, i) => galleryItem(x, i, gallery.length, site.businessName, x.ai)).join('')}</div></div></section>`
    : '';

  const lightbox = gallery.length
    ? `<dialog class="lb" id="lb" aria-label="Photos"><img alt=""><button type="button" class="x" aria-label="Close">×</button>${
        gallery.length > 1
          ? '<button type="button" class="prev" aria-label="Previous photo">‹</button><button type="button" class="next" aria-label="Next photo">›</button>'
          : ''
      }<p class="n" aria-live="polite"></p></dialog>`
    : '';

  const ld = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: site.businessName,
    description: site.description || undefined,
    url,
    telephone: phone ? `+${phone}` : undefined,
    image: own.map((x) => x.lg),
    address: site.city ? { '@type': 'PostalAddress', addressLocality: site.city, addressCountry: 'IN' } : undefined,
  })
    .replace(/</g, '\\u003c')
    .replace(/\u2028|\u2029/g, '');

  const fontUrl = `https://fonts.googleapis.com/css2?family=${font.weights}${font.bodyQ ? `&family=${font.bodyQ}` : ''}&display=swap`;
  const og = hero || own[0];

  return `<!doctype html>
<html lang="${e(site.language || 'en')}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${e(title)}</title>
<meta name="description" content="${e(description)}">
<link rel="canonical" href="${e(url)}/">
<meta name="theme-color" content="${e(p.accent)}">
<meta property="og:type" content="website">
<meta property="og:title" content="${e(title)}">
<meta property="og:description" content="${e(description)}">
<meta property="og:url" content="${e(url)}">
${og ? `<meta property="og:image" content="${e(og.lg)}">` : ''}
<meta name="twitter:card" content="${og ? 'summary_large_image' : 'summary'}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${e(fontUrl)}">
<script type="application/ld+json">${ld}</script>
<style>${css(d, p, font)}</style>
</head>
<body>
${heroBlock}
<main>
${site.description ? `<section class="about${d.flip ? ' flip' : ''}"><div class="wrap"><div><h2>About us</h2><p>${e(site.description)}</p></div>${aside ? img(aside, 'art') : ''}</div></section>` : ''}
${services}
${galleryBlock}
<section class="contact"><div class="wrap"><div class="box"><h2>Let's talk</h2><dl>${phone ? `<div><dt>Phone and WhatsApp</dt><dd><a href="${e(telHref)}">${e(formatPhone(phone))}</a></dd></div>` : ''}${address || site.city ? `<div><dt>Location</dt><dd>${e(address || site.city)}</dd></div>` : ''}${map ? `<div><dt>Directions</dt><dd><a href="${e(map)}" rel="noopener">Open in Google Maps</a></dd></div>` : ''}</dl><div class="cta">${buttons('WhatsApp us')}</div></div></div></section>
</main>
<footer>
<p>Made on WhatsApp in 60 seconds with ${e(config.brand)}. <a href="${e(botLink(`Hi, I want a website like ${site.slug}`))}">Make yours</a></p>
<p><a href="mailto:${e(config.abuseEmail)}?subject=${encodeURIComponent(`Report ${site.slug}`)}">Report this site</a></p>
</footer>
<nav class="bar" id="bar" aria-label="Contact">${buttons('WhatsApp')}</nav>
${lightbox}
<script>${SITE_SCRIPT}</script>
</body>
</html>`;
}
