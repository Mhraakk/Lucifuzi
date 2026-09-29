// راهنما — the zero-to-100 video course of the app: one recorded chapter per part (vendor, setup, trade desk, goods
// accounts, daybook, customers, vault and products, bank, dashboard, audit, smart tools, phone). Chapters, posters and
// written steps come from /media/tutorial/chapters.json, written by scripts/tutorial.mjs next to the videos.
import { html, fa, $, $$ } from '../core.mjs';

const KEY = 'beatris.help';
const load = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') || {};
  } catch {
    return {};
  }
};
const save = (s) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable: progress simply isn't remembered */
  }
};
const clock = (s) => `${fa(Math.floor(s / 60))}:${fa(String(Math.round(s % 60)).padStart(2, '0'))}`;

export async function helpPage(root, { ch } = {}) {
  let list;
  try {
    const r = await fetch('/media/tutorial/chapters.json', { cache: 'no-cache' });
    if (!r.ok) throw new Error();
    list = (await r.json()).chapters ?? [];
    if (!list.length) throw new Error();
  } catch {
    root.innerHTML = String(html`<section class="hlp"><h1>راهنمای تصویری</h1><p class="small">فیلم‌های آموزشی هنوز روی این سرور قرار نگرفته‌اند.</p></section>`);
    return;
  }
  const state = load();
  state.seen ??= {};
  const want = Number(ch ?? new URLSearchParams(location.search).get('ch'));
  let cur = list.find((c) => c.n === want) ?? list.find((c) => !state.seen[c.n]) ?? list[0];
  const total = list.reduce((a, c) => a + c.seconds, 0);

  root.innerHTML = String(html`<section class="hlp">
    <header class="hlp-head"><div><h1>راهنمای تصویری از صفر تا صد</h1><p class="small">${fa(list.length)} فصل · ${clock(total)} دقیقه · هر فصل با نمونه واقعی ثبت می‌شود؛ هر جا خواستید مکث کنید و همان کار را در برنامه انجام دهید.</p><p class="small"><a href="/downloads/Beatris-Setup-x64.exe" download>دانلود نسخه ویندوز ۱۱ (۶۴ بیت)</a>: پنجره مستقل، آیکن روی دسکتاپ و منوی استارت، بدون نیاز به مدیر سیستم.</p></div><div class="hlp-prog" id="hpProg"></div></header>
    <div class="hlp-grid">
      <div class="hlp-main">
        <div class="hlp-stage" id="hpStage"><video id="hpVideo" controls playsinline preload="metadata"><source id="hpMp4" type="video/mp4; codecs=avc1.64001F"><source id="hpWebm" type="video/webm; codecs=vp9"></video></div>
        <div class="hlp-bar"><button class="btn ghost sm" id="hpPrev">فصل قبل</button><label class="hlp-auto"><input type="checkbox" id="hpAuto" ${state.auto !== false ? 'checked' : ''}> پخش خودکار فصل بعد</label><span class="hlp-speed" role="group" aria-label="سرعت پخش">${[1, 1.25, 1.5].map((r) => html`<button class="chip" data-rate="${r}">${fa(r)}×</button>`)}</span><button class="btn ghost sm" id="hpNext">فصل بعد</button></div>
        <article class="hlp-notes" id="hpNotes"></article>
      </div>
      <ol class="hlp-list" id="hpList">${list.map((c) => html`<li><button data-ch="${c.n}"><img src="${c.poster}" alt="" loading="lazy" width="112" height="${c.vertical ? 112 : 63}"><span><b>${fa(c.n)}. ${c.title}</b><small>${c.sub}</small><em>${clock(c.seconds)}</em></span><i class="hlp-tick" aria-hidden="true"></i></button></li>`)}</ol>
    </div></section>`);

  const video = $('#hpVideo', root);
  const rate = () => Number(state.rate) || 1;
  const paint = () => {
    const seen = list.filter((c) => state.seen[c.n]).length;
    $('#hpProg', root).innerHTML = String(html`<b>${fa(seen)}/${fa(list.length)}</b><span>فصل دیده‌شده</span><i style="--p:${(seen / list.length) * 100}%"></i>`);
    for (const b of $$('#hpList button', root)) {
      const n = Number(b.dataset.ch);
      b.classList.toggle('on', n === cur.n);
      b.classList.toggle('seen', !!state.seen[n]);
      if (n === cur.n) b.setAttribute('aria-current', 'true');
      else b.removeAttribute('aria-current');
    }
    for (const b of $$('[data-rate]', root)) b.setAttribute('aria-pressed', String(Number(b.dataset.rate) === rate()));
    $('#hpPrev', root).disabled = cur === list[0];
    $('#hpNext', root).disabled = cur === list.at(-1);
  };
  const open = (c, play = false) => {
    cur = c;
    $('#hpStage', root).classList.toggle('vertical', !!c.vertical);
    video.poster = c.poster;
    $('#hpMp4', root).src = c.file;
    $('#hpWebm', root).src = c.webm ?? c.file.replace(/\.mp4$/, '.webm');
    video.load();
    video.playbackRate = rate();
    $('#hpNotes', root).innerHTML = String(html`<h2>فصل ${fa(c.n)} · ${c.title}</h2><p class="small">${c.sub}</p><ol>${c.steps.map((s) => html`<li>${s}</li>`)}</ol>`);
    history.replaceState(null, '', `/help?ch=${c.n}`);
    paint();
    if (play) video.play().catch(() => {});
  };
  video.addEventListener('ratechange', () => {
    state.rate = video.playbackRate;
    save(state);
    paint();
  });
  video.addEventListener('timeupdate', () => {
    if (!state.seen[cur.n] && video.duration && video.currentTime / video.duration > 0.9) {
      state.seen[cur.n] = true;
      save(state);
      paint();
    }
  });
  video.addEventListener('ended', () => {
    const i = list.indexOf(cur);
    if ($('#hpAuto', root).checked && i < list.length - 1) open(list[i + 1], true);
  });
  $('#hpAuto', root).addEventListener('change', (e) => {
    state.auto = e.target.checked;
    save(state);
  });
  $('#hpList', root).addEventListener('click', (e) => {
    const b = e.target.closest('[data-ch]');
    if (b) open(list.find((c) => c.n === Number(b.dataset.ch)), true);
  });
  root.querySelector('.hlp-speed').addEventListener('click', (e) => {
    const b = e.target.closest('[data-rate]');
    if (b) video.playbackRate = Number(b.dataset.rate);
  });
  $('#hpPrev', root).addEventListener('click', () => open(list[list.indexOf(cur) - 1], true));
  $('#hpNext', root).addEventListener('click', () => open(list[list.indexOf(cur) + 1], true));
  open(cur);
  return () => video.pause();
}
