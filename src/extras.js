import { t } from './i18n.js';
import { classifyIndustry, industryAction } from './industry.js';

const e = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const EXTRAS_CSS = `.sx{max-width:1120px;margin:0 auto;padding:56px 20px;color:inherit}
.sx h2{font-size:clamp(26px,4vw,38px);line-height:1.1;margin:0 0 20px;letter-spacing:-.01em}
.sx-gallery{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(220px,1fr))}
.sx-gallery figure{margin:0}.sx-gallery button{display:block;width:100%;padding:0;border:0;background:none;cursor:zoom-in;border-radius:14px;overflow:hidden}
.sx-gallery img{width:100%;aspect-ratio:1;object-fit:cover;display:block;transition:transform .4s ease}.sx-gallery button:hover img{transform:scale(1.04)}
.sx-videos{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}
.sx-videos video{display:block;width:100%;max-height:72vh;border-radius:16px;background:#000;object-fit:contain}
.sx-form{display:grid;gap:14px;max-width:560px}
.sx-form label{display:grid;gap:6px;font-weight:600;font-size:15px}
.sx-form input,.sx-form textarea{min-height:48px;font:inherit;font-weight:400;color:inherit;background:transparent;padding:14px 16px;border-radius:12px;border:1.5px solid currentColor;width:100%}
.sx-form textarea{min-height:120px;resize:vertical}
.sx-form button{justify-self:start;transition:opacity .16s ease,transform .16s ease;font:inherit;font-weight:700;color:inherit;background:transparent;min-height:52px;padding:0 30px;border-radius:999px;border:2px solid currentColor;cursor:pointer}
.sx-form button:hover{opacity:.85}.sx-form button:active{transform:scale(.98)}.sx-form :focus-visible{outline:3px solid currentColor;outline-offset:3px}
.sx-hp{position:absolute!important;left:-9999px!important;width:1px;height:1px;overflow:hidden}`;

export function creditsHtml(images = []) {
  const ai = images.some((x) => x?.ai);
  const seen = new Set();
  const credits = images
    .filter((x) => x?.credit?.name && x.credit.url)
    .filter((x) => {
      const key = `${x.credit.name}|${x.credit.source}`;
      return !seen.has(key) && seen.add(key);
    })
    .map((x) => `<a href="${e(x.credit.url)}" rel="noopener">${e(x.credit.name)}</a> on <a href="${e(x.credit.sourceUrl)}" rel="noopener">${e(x.credit.source)}</a>`);
  return (
    (credits.length ? `<p>Photos by ${credits.join(', ')}.</p>` : '') +
    (ai ? '<p>Some pictures are AI-generated illustrations.</p>' : '')
  );
}

function galleryHtml(site, photos) {
  if (!photos?.length) return '';
  return `<section class="sx" id="gallery"><h2>${e(site.businessName)}</h2><div class="sx-gallery">${photos
    .map(
      (p, i) =>
        `<figure><button type="button" data-i="${i}" aria-label="Open photo ${i + 1} of ${photos.length}"><img src="${e(p.src)}" data-lg="${e(p.lg)}" alt="${e(p.alt)}" width="${Number(p.w) || 1200}" height="${Number(p.h) || 1200}" loading="lazy" decoding="async"></button></figure>`
    )
    .join('')}</div></section>`;
}

export function extrasHtml(site, { gallery = [] } = {}) {
  const lang = site.language || 'en';
  const videos = (site.videos || []).filter((v) => v?.url);
  const videoBlock = videos.length
    ? `<section class="sx" id="videos" aria-label="${e(t(lang, 'videos_title'))}"><h2>${e(t(lang, 'videos_title'))}</h2><div class="sx-videos">${videos
        .map((v) => `<video controls playsinline preload="metadata" src="${e(v.url)}"></video>`)
        .join('')}</div></section>`
    : '';
  const action = industryAction(classifyIndustry(site));
  const title = lang === 'en' ? action.form : t(lang, 'form_title');
  const fields = action.fields
    .map((f) => {
      const label = e(t(lang, `form_${f}`));
      if (f === 'date') return `<label>${label}<input type="date" name="date"></label>`;
      if (f === 'time') return `<label>${label}<input type="time" name="time"></label>`;
      if (f === 'guests') return `<label>${label}<input type="number" name="guests" min="1" max="500" inputmode="numeric"></label>`;
      return `<label>${label}<input name="need" maxlength="200"></label>`;
    })
    .join('\n');
  const form = `<section class="sx" id="enquiry"><h2>${e(title)}</h2>
<form class="sx-form" method="post" action="/lead">
<label>${e(t(lang, 'form_name'))}<input name="name" required maxlength="80" autocomplete="name"></label>
<label>${e(t(lang, 'form_phone'))}<input name="phone" type="tel" required inputmode="tel" maxlength="20" autocomplete="tel"></label>
${fields}
<label>${e(t(lang, 'form_message'))}<textarea name="message" maxlength="1000"></textarea></label>
<div class="sx-hp" aria-hidden="true"><label>Website<input name="website" tabindex="-1" autocomplete="off"></label></div>
<button type="submit">${e(t(lang, 'form_send'))}</button>
</form></section>`;
  return galleryHtml(site, gallery) + videoBlock + form;
}
