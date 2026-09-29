import { config, siteUrl, botLink } from './config.js';

const THEME_COLORS = {
  rose: { accent: '#be185d', soft: '#fdf1f6', darkAccent: '#f472b6', darkSoft: '#2a1620' },
  forest: { accent: '#2f7d4f', soft: '#eef7f1', darkAccent: '#6fcf97', darkSoft: '#13241a' },
  ocean: { accent: '#0b6e99', soft: '#edf6fa', darkAccent: '#5cc2f0', darkSoft: '#0f2230' },
  sunset: { accent: '#c2410c', soft: '#fff3eb', darkAccent: '#fb923c', darkSoft: '#2a1a10' },
  slate: { accent: '#334155', soft: '#f1f3f6', darkAccent: '#cbd5e1', darkSoft: '#1c2129' },
  plum: { accent: '#7e22ce', soft: '#f6effc', darkAccent: '#c084fc', darkSoft: '#221630' },
};

const FONT_URL =
  'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700&display=swap';

const ICONS = {
  whatsapp:
    '<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2c-1.5 0-3-.4-4.3-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.4.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.8 11.9 11.9 0 0 0 4.6 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3Z"/></svg>',
  call: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z"/></svg>',
};

export const SITE_SCRIPT = `(()=>{const d=document,b=d.getElementById("bar"),c=d.getElementById("cta");if(b&&c){const v=()=>b.classList.toggle("on",c.getBoundingClientRect().bottom<0);addEventListener("scroll",v,{passive:!0});v()}const l=d.getElementById("lb");if(!l||!l.showModal)return;const m=l.querySelector("img"),n=l.querySelector(".n"),p=[...d.querySelectorAll("[data-i]")];let i=0,x=null;const s=k=>{i=(k+p.length)%p.length;const g=p[i].querySelector("img");m.src=g.dataset.lg;m.alt=g.alt;n.textContent=i+1+" / "+p.length};p.forEach((e,k)=>e.addEventListener("click",()=>{s(k);l.showModal()}));const q=(c,f)=>{const e=l.querySelector(c);e&&e.addEventListener("click",f)};q(".x",()=>l.close());q(".prev",()=>s(i-1));q(".next",()=>s(i+1));l.addEventListener("keydown",e=>{e.key==="ArrowLeft"&&s(i-1);e.key==="ArrowRight"&&s(i+1)});l.addEventListener("click",e=>{e.target===l&&l.close()});l.addEventListener("touchstart",e=>{x=e.touches[0].clientX},{passive:!0});l.addEventListener("touchend",e=>{if(x===null)return;const t=e.changedTouches[0].clientX-x;Math.abs(t)>40&&p.length>1&&s(i+(t<0?1:-1));x=null})})();`;

export const ENHANCE_SCRIPT = `(()=>{const d=document,r=d.documentElement;r.classList.add("js");const rm=matchMedia("(prefers-reduced-motion: reduce)").matches;const run=()=>{const cnt=e=>{const t=parseInt(e.textContent,10);if(!(t>0)||rm)return;const s=performance.now();const f=n=>{const p=Math.min((n-s)/700,1);e.textContent=Math.round(t*(1-Math.pow(1-p,3)));if(p<1)requestAnimationFrame(f)};e.textContent="0";requestAnimationFrame(f)};const io="IntersectionObserver"in window&&!rm?new IntersectionObserver(es=>es.forEach(x=>{if(x.isIntersecting){x.target.classList.add("in");if(x.target.classList.contains("count"))cnt(x.target);io.unobserve(x.target)}}),{threshold:.15,rootMargin:"0px 0px -6% 0px"}):null;d.querySelectorAll(".reveal,.count").forEach((e,i)=>{e.style.setProperty("--d",(i%5)*70+"ms");if(io)io.observe(e);else e.classList.add("in")});d.querySelectorAll(".spot").forEach(e=>e.addEventListener("pointermove",x=>{const b=e.getBoundingClientRect();e.style.setProperty("--mx",x.clientX-b.left+"px");e.style.setProperty("--my",x.clientY-b.top+"px")}));const nav=d.querySelector(".nav");if(nav){const u=()=>nav.classList.toggle("stuck",scrollY>24);addEventListener("scroll",u,{passive:true});u()}};if(d.readyState==="loading")d.addEventListener("DOMContentLoaded",run);else run()})();`;

export function escapeHtml(value) {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
}

const e = escapeHtml;

function jsonLd(data) {
  return JSON.stringify(data).replace(/</g, '\\u003c').replace(/\u2028|\u2029/g, '');
}

export function formatPhone(phone) {
  const d = String(phone || '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) return `+91 ${d.slice(2, 7)} ${d.slice(7)}`;
  return d ? `+${d}` : '';
}

function themeCss(theme) {
  const t = THEME_COLORS[theme] || THEME_COLORS.slate;
  return `:root{--accent:${t.accent};--soft:${t.soft};--on-accent:#fff}@media (prefers-color-scheme:dark){:root{--accent:${t.darkAccent};--soft:${t.darkSoft};--on-accent:#111215}}`;
}

const BASE_CSS = `:root{--paper:#fcfcfb;--ink:#17191e;--muted:#5d6068;--line:#e6e6e2;--card:#fff;--display:"Bricolage Grotesque",ui-sans-serif,system-ui,sans-serif;--body:system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans","Noto Sans Gurmukhi","Noto Sans Devanagari",sans-serif;color-scheme:light dark}
@media (prefers-color-scheme:dark){:root{--paper:#111215;--ink:#eceef2;--muted:#a1a5ae;--line:#2a2c32;--card:#18191d}}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.6 var(--body);padding:env(safe-area-inset-top) env(safe-area-inset-right) 0 env(safe-area-inset-left);-webkit-font-smoothing:antialiased}
img{display:block;max-width:100%}a{color:inherit}
:focus-visible{outline:3px solid var(--accent);outline-offset:3px;border-radius:8px}
h1,h2,h3{font-family:var(--display);line-height:1.1;text-wrap:balance;margin:0;letter-spacing:-.015em}
h1{font-size:clamp(40px,11vw,76px);font-weight:700;line-height:.95;letter-spacing:-.035em;font-variation-settings:"opsz" 96}
h2{font-size:24px;font-weight:500;letter-spacing:-.01em;margin-bottom:10px}
p{text-wrap:pretty}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:52px;padding:0 22px;border-radius:999px;font-weight:600;font-size:16px;text-decoration:none;white-space:nowrap}
.btn svg{width:20px;height:20px;flex:none}
.btn.primary{background:var(--accent);color:var(--on-accent);border:2px solid var(--accent)}
.btn.ghost{border:2px solid var(--accent);color:var(--accent)}
.btn:active{transform:scale(.98)}
.eyebrow{margin:0 0 8px;color:var(--accent);font-weight:600;font-size:13px;letter-spacing:.06em;text-transform:uppercase}
.muted{color:var(--muted)}
footer{padding:28px 20px calc(28px + env(safe-area-inset-bottom));text-align:center;color:var(--muted);font-size:14px;border-top:1px solid var(--line)}
footer p{margin:4px 0}footer a{color:var(--ink);font-weight:600;text-underline-offset:3px}
@media (prefers-reduced-motion:reduce){*,*::before,*::after{transition:none!important;animation:none!important;scroll-behavior:auto!important}}`;

const SITE_CSS = `.wrap{max-width:1200px;margin:0 auto}
.gallery{padding-top:12px}
.strip{display:flex;gap:10px;overflow-x:auto;scroll-snap-type:x mandatory;padding:0 16px;scrollbar-width:none;overscroll-behavior-x:contain}
.strip::-webkit-scrollbar{display:none}
.ph{flex:0 0 84%;scroll-snap-align:center;margin:0}
.ph:only-child{flex-basis:100%}
.ph button{display:block;width:100%;padding:0;border:0;cursor:zoom-in;border-radius:18px;overflow:hidden;background:var(--soft)}
.ph img{width:100%;height:auto;aspect-ratio:4/5;object-fit:cover}
.mono{margin:12px 16px 0;border-radius:18px;aspect-ratio:16/10;background:linear-gradient(140deg,var(--accent),var(--soft));display:grid;place-items:center;color:var(--on-accent);font:700 clamp(72px,22vw,160px)/1 var(--display)}
.info{padding:24px 20px 40px}
.tagline{font-size:20px;line-height:1.4;color:var(--muted);margin:14px 0 0;max-width:32ch}
.cta{display:flex;flex-wrap:wrap;gap:10px;margin:24px 0 0}
.cta .btn,.bar .btn{flex:1 1 110px}
.cta .primary{flex:2 1 220px}
.block{margin-top:40px}
.about p{margin:0;max-width:60ch}
.services{list-style:none;padding:0;margin:0;display:flex;flex-wrap:wrap;gap:8px}
.services li{background:var(--soft);border-radius:10px;padding:8px 14px;font-size:15px}
.contact{background:var(--soft);border-radius:18px;padding:22px}
.contact dl{margin:0 0 18px;display:grid;gap:14px}
.contact dt{font-size:13px;color:var(--muted)}
.contact dd{margin:0;font-weight:600}
.contact a{text-decoration-color:var(--accent);text-underline-offset:3px}
.contact .btn{width:100%}
.site-footer{padding-bottom:calc(96px + env(safe-area-inset-bottom))}
.bar{position:fixed;left:0;right:0;bottom:0;z-index:10;display:flex;gap:10px;padding:10px 12px calc(10px + env(safe-area-inset-bottom));background:color-mix(in srgb,var(--paper) 88%,transparent);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);border-top:1px solid var(--line);transform:translateY(110%);transition:transform .25s ease}
.bar.on{transform:none}
.lb{border:0;padding:0;margin:0;width:100vw;height:100dvh;max-width:none;max-height:none;background:#000;color:#fff}
.lb::backdrop{background:#000}
.lb img{width:100%;height:100%;object-fit:contain}
.lb button{position:absolute;display:grid;place-items:center;width:52px;height:52px;border:0;border-radius:999px;background:rgba(255,255,255,.16);color:#fff;font-size:30px;line-height:1;cursor:pointer}
.lb .x{top:calc(12px + env(safe-area-inset-top));right:12px}
.lb .prev,.lb .next{top:50%;transform:translateY(-50%)}
.lb .prev{left:12px}.lb .next{right:12px}
.lb .n{position:absolute;left:0;right:0;bottom:calc(16px + env(safe-area-inset-bottom));margin:0;text-align:center;font-size:14px;opacity:.85}
@media (min-width:900px){
.wrap{display:grid;grid-template-columns:minmax(0,1fr) 420px;gap:48px;align-items:start;padding:32px 32px 0}
.gallery{padding:0}
.strip{display:grid;grid-template-columns:1fr 1fr;gap:12px;overflow:visible;padding:0}
.ph:first-child,.ph:nth-child(even):last-child{grid-column:1/-1}
.ph img{aspect-ratio:1}
.ph:first-child img,.ph:nth-child(even):last-child img{aspect-ratio:4/3}
.mono{margin:0;aspect-ratio:4/3}
.info{position:sticky;top:32px;padding:0 0 32px}
.info h1{font-size:62px}
.bar{display:none}
.site-footer{margin-top:48px;padding-bottom:32px}
}`;

function page({ title, description = '', canonical = '', head = '', css = '', body, lang = 'en', font = true, robots }) {
  return `<!doctype html>
<html lang="${e(lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${e(title)}</title>
${description ? `<meta name="description" content="${e(description)}">` : ''}
${canonical ? `<link rel="canonical" href="${e(canonical)}">` : ''}
${robots ? `<meta name="robots" content="${e(robots)}">` : ''}
${font ? `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONT_URL}">` : ''}
${head}
<style>${BASE_CSS}${css}</style>
</head>
<body>
${body}
</body>
</html>`;
}

function siteTitle(site) {
  const what = [site.category, site.city].filter(Boolean);
  if (site.category && site.city) return `${site.businessName}, ${site.category} in ${site.city}`;
  return what.length ? `${site.businessName}, ${what[0]}` : site.businessName;
}

function mapsUrl(site) {
  if (site.location?.lat != null && site.location?.lng != null) {
    return `https://www.google.com/maps/search/?api=1&query=${site.location.lat},${site.location.lng}`;
  }
  return '';
}

function photoMarkup(site) {
  const photos = site.photos || [];
  if (!photos.length) {
    const initial = [...(site.businessName || '?').trim()][0]?.toUpperCase() || '?';
    return `<div class="mono" aria-hidden="true">${e(initial)}</div>`;
  }
  const items = photos
    .map((p, i) => {
      const first = i === 0;
      return `<figure class="ph"><button type="button" data-i="${i}" aria-label="Open photo ${i + 1} of ${photos.length}"><img src="${e(p.sm)}" srcset="${e(p.sm)} 480w, ${e(p.lg)} 1200w" sizes="(min-width: 900px) 60vw, 84vw" width="${Number(p.w) || 1200}" height="${Number(p.h) || 1500}" alt="${e(`${site.businessName} photo ${i + 1}`)}" data-lg="${e(p.lg)}" ${first ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async"></button></figure>`;
    })
    .join('');
  return `<div class="strip">${items}</div>`;
}

export function renderSite(site) {
  const url = site.customDomain ? `https://${site.customDomain}` : siteUrl(site.slug);
  const title = siteTitle(site);
  const description = site.tagline || site.description?.slice(0, 160) || title;
  const phone = String(site.phone || site.ownerPhone || '').replace(/\D/g, '');
  const waText = `Hi ${site.businessName}, I saw your website and would like to know more.`;
  const waHref = `https://wa.me/${phone}?text=${encodeURIComponent(waText)}`;
  const telHref = `tel:+${phone}`;
  const photos = site.photos || [];
  const cover = photos[0];
  const map = mapsUrl(site);
  const eyebrow = [site.category, site.city].filter(Boolean).join(' · ');
  const address = site.location?.address || site.location?.name || '';

  const ld = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: site.businessName,
    description: site.description || undefined,
    url,
    telephone: phone ? `+${phone}` : undefined,
    image: photos.map((p) => p.lg),
    address: site.city || address
      ? { '@type': 'PostalAddress', addressLocality: site.city || undefined, streetAddress: address || undefined, addressCountry: 'IN' }
      : undefined,
    geo: map ? { '@type': 'GeoCoordinates', latitude: site.location.lat, longitude: site.location.lng } : undefined,
  };

  const head = `<meta name="theme-color" content="${(THEME_COLORS[site.theme] || THEME_COLORS.slate).accent}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${e(site.businessName)}">
<meta property="og:title" content="${e(title)}">
<meta property="og:description" content="${e(description)}">
<meta property="og:url" content="${e(url)}">
${cover ? `<meta property="og:image" content="${e(cover.lg)}">
<meta property="og:image:width" content="${Number(cover.w) || 1200}">
<meta property="og:image:height" content="${Number(cover.h) || 1500}">` : ''}
<meta name="twitter:card" content="${cover ? 'summary_large_image' : 'summary'}">
<meta name="twitter:title" content="${e(title)}">
<meta name="twitter:description" content="${e(description)}">
${cover ? `<meta name="twitter:image" content="${e(cover.lg)}">` : ''}
<script type="application/ld+json">${jsonLd(ld)}</script>`;

  const buttons = (waLabel) =>
    `<a class="btn primary" href="${e(waHref)}">${ICONS.whatsapp}${waLabel}</a><a class="btn ghost" href="${e(telHref)}">${ICONS.call}Call</a>`;

  const services = site.services?.length
    ? `<section class="block"><h2>What we offer</h2><ul class="services">${site.services.map((s) => `<li>${e(s)}</li>`).join('')}</ul></section>`
    : '';

  const lightbox = photos.length
    ? `<dialog class="lb" id="lb" aria-label="Photos"><img alt=""><button type="button" class="x" aria-label="Close">×</button>${
        photos.length > 1
          ? '<button type="button" class="prev" aria-label="Previous photo">‹</button><button type="button" class="next" aria-label="Next photo">›</button>'
          : ''
      }<p class="n" aria-live="polite"></p></dialog>`
    : '';

  const body = `<main class="wrap">
<section class="gallery" aria-label="Photos">${photoMarkup(site)}</section>
<div class="info">
${eyebrow ? `<p class="eyebrow">${e(eyebrow)}</p>` : ''}
<h1>${e(site.businessName)}</h1>
${site.tagline ? `<p class="tagline">${e(site.tagline)}</p>` : ''}
<div class="cta" id="cta">${buttons('Message on WhatsApp')}</div>
${site.description ? `<section class="block about"><h2>About us</h2><p>${e(site.description)}</p></section>` : ''}
${services}
<section class="block contact"><h2>Get in touch</h2><dl>
${phone ? `<div><dt>Phone and WhatsApp</dt><dd><a href="${e(telHref)}">${e(formatPhone(phone))}</a></dd></div>` : ''}
${address || site.city ? `<div><dt>Location</dt><dd>${e(address || site.city)}${address && site.city && !address.includes(site.city) ? `, ${e(site.city)}` : ''}</dd></div>` : ''}
${map ? `<div><dt>Directions</dt><dd><a href="${e(map)}" rel="noopener">Open in Google Maps</a></dd></div>` : ''}
</dl><a class="btn primary" href="${e(waHref)}">${ICONS.whatsapp}Message us on WhatsApp</a></section>
</div>
</main>
<footer class="site-footer">
<p>Made on WhatsApp in 60 seconds with ${e(config.brand)}. <a href="${e(botLink(`Hi, I want a website like ${site.slug}`))}">Make yours</a></p>
<p><a href="mailto:${e(config.abuseEmail)}?subject=${encodeURIComponent(`Report ${site.slug}`)}">Report this site</a></p>
</footer>
<nav class="bar" id="bar" aria-label="Contact">${buttons('WhatsApp')}</nav>
${lightbox}
<script>${SITE_SCRIPT}</script>`;

  return page({
    title,
    description,
    canonical: `${url}/`,
    head,
    css: themeCss(site.theme) + SITE_CSS,
    body,
    lang: site.language || 'en',
  });
}

const LANDING_CSS = `${themeCss('forest')}
.land{max-width:1040px;margin:0 auto;padding:40px 20px 56px}
.hero{display:grid;gap:28px;align-items:center}
.hero h1{font-size:clamp(44px,10vw,84px);letter-spacing:-.04em}
.hero p.lead{font-size:20px;line-height:1.5;color:var(--muted);margin:16px 0 28px;max-width:34ch}
.phone{border-radius:28px;background:var(--soft);padding:22px;display:grid;gap:10px;font-size:15px;line-height:1.4;max-width:380px}
.msg{padding:10px 14px;border-radius:16px;max-width:85%;background:var(--card);border:1px solid var(--line)}
.msg.me{justify-self:end;background:var(--accent);color:var(--on-accent);border:0}
.steps{display:grid;gap:14px;margin:64px 0 0;padding:0;list-style:none;counter-reset:s}
.steps li{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:22px;counter-increment:s}
.steps li::before{content:counter(s);display:grid;place-items:center;width:36px;height:36px;border-radius:50%;background:var(--accent);color:var(--on-accent);font:700 17px var(--display);margin-bottom:14px}
.steps h3{font-size:20px;margin-bottom:6px}.steps p{margin:0;color:var(--muted)}
.gets{margin-top:64px}.gets ul{padding-left:20px;margin:0;display:grid;gap:6px}
.doc{max-width:720px;margin:0 auto;padding:40px 20px 56px}.doc h2{margin-top:32px;font-size:21px}.doc p,.doc li{color:var(--ink)}
.center{min-height:70vh;display:grid;place-items:center;text-align:center;padding:40px 20px}.center p{color:var(--muted);max-width:40ch;margin:14px auto 26px}
@media (min-width:900px){.hero{grid-template-columns:1.2fr 1fr}.steps{grid-template-columns:repeat(3,1fr)}}`;

function siteFooter() {
  return `<footer>
<p>${e(config.brand)} · Websites for local businesses, made on WhatsApp.</p>
<p><a href="/privacy">Privacy</a> · <a href="/terms">Terms</a> · <a href="mailto:${e(config.contactEmail)}">Contact</a> · <a href="mailto:${e(config.abuseEmail)}">Report abuse</a></p>
</footer>`;
}

export function renderLanding() {
  const example = `sweetcrumbs.${config.rootDomain}`;
  const body = `<main class="land">
<section class="hero">
<div>
<p class="eyebrow">${e(config.brand)}</p>
<h1>Your business website in 60 seconds, right inside WhatsApp.</h1>
<p class="lead">Send one message about your business, a few photos, and pick a name. Get a live link like <strong>${e(example)}</strong>. No app, no signup, no forms.</p>
<a class="btn primary" href="${e(botLink('Hi'))}">${ICONS.whatsapp}Start on WhatsApp</a>
</div>
<div class="phone" aria-hidden="true">
<div class="msg">Step 1 of 3: tell me your business name, what you sell and your city.</div>
<div class="msg me">Sweet Crumbs, birthday cakes, home bakery in Ludhiana</div>
<div class="msg">Step 2 of 3: send up to 6 photos.</div>
<div class="msg me">📷 📷 📷</div>
<div class="msg">Your website is live: ${e(example)} ✨</div>
</div>
</section>
<ol class="steps">
<li><h3>Say what you do</h3><p>One line is enough. Type it in English, Hindi or Punjabi.</p></li>
<li><h3>Send your photos</h3><p>Your cakes, shop, work or menu. Up to 6 photos.</p></li>
<li><h3>Pick your address</h3><p>Tap to accept the suggested name, or choose your own.</p></li>
</ol>
<section class="gets">
<h2>What your customers get</h2>
<ul>
<li>A fast, beautiful page that works on every phone</li>
<li>One-tap WhatsApp and Call buttons</li>
<li>Your photos, services and location</li>
<li>A link that shows a rich preview when shared on WhatsApp and Instagram</li>
<li>Edit anytime by chatting with the bot</li>
</ul>
</section>
</main>
${siteFooter()}`;
  return page({
    title: `${config.brand}: your business website in 60 seconds on WhatsApp`,
    description: 'Get a mobile website for your small business in 60 seconds, built entirely inside WhatsApp. Free.',
    canonical: `https://${config.rootDomain}/`,
    head: `<meta property="og:title" content="${e(config.brand)}: your website in 60 seconds on WhatsApp"><meta property="og:description" content="Send a message and a few photos, get a live website link. Free."><meta property="og:url" content="https://${e(config.rootDomain)}/"><meta property="og:type" content="website">`,
    css: LANDING_CSS,
    body,
  });
}

function docPage(title, html) {
  return page({
    title: `${title} · ${config.brand}`,
    canonical: `https://${config.rootDomain}/${title.toLowerCase()}`,
    css: LANDING_CSS,
    font: false,
    body: `<main class="doc"><p class="eyebrow"><a href="/">${e(config.brand)}</a></p><h1>${e(title)}</h1>${html}</main>${siteFooter()}`,
  });
}

export function renderPrivacy() {
  const b = e(config.brand);
  return docPage(
    'Privacy',
    `<p class="muted">How ${b} handles your information.</p>
<h2>What we collect</h2>
<ul><li>Your WhatsApp number and profile name, so the bot can talk to you and link you to your site.</li><li>The business details and photos you send us, to build your website.</li><li>A location pin, only if you choose to share one.</li></ul>
<h2>What is public</h2>
<p>Your website is public. It shows your business name, description, photos, city and the phone number used for the WhatsApp and Call buttons. By default this is the number you chat with us from. You can change it at any time by sending <strong>number</strong> followed by the number you want to show.</p>
<h2>How photos are handled</h2>
<p>We resize your photos and remove hidden data such as GPS location before publishing them.</p>
<h2>Who we share it with</h2>
<p>We use service providers to run ${b}: Meta (WhatsApp), Anthropic (to write your website text), MongoDB (database) and Cloudflare (hosting and image storage). We do not sell your data.</p>
<h2>Deleting your data</h2>
<p>Send <strong>delete my site</strong> to the bot at any time. We remove your website, your photos and your chat details. You can also email <a href="mailto:${e(config.contactEmail)}">${e(config.contactEmail)}</a>.</p>
<h2>Your rights</h2>
<p>Under the Digital Personal Data Protection Act, 2023 you can ask us to access, correct or erase your personal data. Contact <a href="mailto:${e(config.contactEmail)}">${e(config.contactEmail)}</a>.</p>`
  );
}

export function renderTerms() {
  const b = e(config.brand);
  return docPage(
    'Terms',
    `<p class="muted">By using ${b} you agree to these terms.</p>
<h2>Your content</h2>
<p>You own the text and photos you send. You give ${b} permission to host and display them on your website. Only send content you have the right to use.</p>
<h2>Not allowed</h2>
<p>Illegal goods or services, weapons, drugs, adult services, gambling or betting, investment or loan schemes, fake documents, and anything that pretends to be a bank, government body or another brand. We remove such sites without notice.</p>
<h2>Service</h2>
<p>${b} is provided as is. We work to keep sites online but cannot guarantee uninterrupted service. We may change or suspend sites that break these terms or receive valid complaints.</p>
<h2>Reporting</h2>
<p>To report a site, email <a href="mailto:${e(config.abuseEmail)}">${e(config.abuseEmail)}</a> with the site address.</p>`
  );
}

export function renderNotFound(slug) {
  const claim = slug && /^[a-z0-9-]{3,30}$/.test(slug);
  return page({
    title: `Not found · ${config.brand}`,
    css: LANDING_CSS,
    robots: 'noindex',
    body: `<main class="center"><div>
<p class="eyebrow">${e(config.brand)}</p>
<h1>${claim ? `${e(slug)}.${e(config.rootDomain)} is free` : 'Page not found'}</h1>
<p>${claim ? 'This address could be your business website. Make it on WhatsApp in 60 seconds.' : 'There is nothing here. Make a website for your business on WhatsApp in 60 seconds.'}</p>
<a class="btn primary" href="${e(botLink(claim ? `Hi, I want ${slug}.${config.rootDomain}` : 'Hi'))}">${ICONS.whatsapp}Make a website</a>
</div></main>`,
  });
}

export function renderSuspended() {
  return page({
    title: 'Site unavailable',
    css: LANDING_CSS,
    robots: 'noindex',
    font: false,
    body: `<main class="center"><div><h1>This site is unavailable</h1><p>This website is not available right now.</p></div></main>`,
  });
}
