// «هر اتفاق، کجا ثبت می‌شود» (spec 0026): every event of a melted-gold and coin shop, from the everyday to the very
// unlikely, with the exact way to record it and a button that opens that screen. The list is shopevents.mjs — the
// same one the palette searches and the test records through the real API.
import { html, fa, $, $$, store } from '../core.mjs';
import { booksPrefs } from '../bk.mjs';
import { booksNav } from './books.mjs';
import { EVENTS, EVENT_GROUPS, findEvents } from '../shopevents.mjs';

// screens a seller cannot open: the event is shown with who records it
const ADMIN_ONLY = /^\/books\/(control|vault\?act=melt|parties)|^\/setup/;

export async function eventsPage(root) {
  await booksPrefs();
  const admin = store.isAdmin();
  const qs = new URLSearchParams(location.search);
  let g = EVENT_GROUPS.some(([k]) => k === qs.get('g')) ? qs.get('g') : 'all';
  root.innerHTML = String(html`${booksNav('events')}
    <div class="bk-head"><div><h1>هر اتفاق، کجا ثبت می‌شود</h1><span class="small">${fa(EVENTS.length)} رویداد یک فروشگاه آبشده و سکه، از هر روز تا بسیار نادر؛ هر کدام با راه دقیق ثبت و دکمه همان صفحه. همه در یک زنجیره: یک شماره‌گذاری، یک دفتر رویداد، یک روزنگار.</span></div></div>
    <div class="ev-tools"><input class="input" id="evq" type="search" value="${qs.get('q') ?? ''}" placeholder="بنویسید چه شد: «چک برگشت»، «ذوب»، «اجاره با سکه»، «گرو»…" aria-label="جستجوی رویداد">
      <nav class="chips" id="evg" aria-label="گروه">${[['all', 'همه'], ...EVENT_GROUPS].map(([k, l]) => html`<button class="chip" data-g="${k}" aria-pressed="${g === k}">${l}</button>`)}</nav></div>
    <div id="evl" class="ev-list"></div>`);
  const list = $('#evl', root);
  function draw() {
    const q = $('#evq', root).value;
    const items = findEvents(q).filter((e) => g === 'all' || e.g === g);
    const groups = EVENT_GROUPS.filter(([k]) => items.some((e) => e.g === k));
    list.innerHTML = items.length
      ? groups
          .map(([k, label]) => String(html`<section class="ev-g"><h2 class="bk-h">${label}</h2><ol>${items.filter((e) => e.g === k).map((e) => html`<li class="tray ev-e" id="ev-${e.id}">
              <h3>${e.t}</h3><p>${e.how}</p><p class="small ev-m">چه چیزی جابه‌جا می‌شود: ${e.m}</p>
              ${!admin && ADMIN_ONLY.test(e.to) ? html`<span class="small">با مدیر</span>` : html`<a class="btn small" href="${e.to}" data-link>ثبت این اتفاق</a>`}</li>`)}</ol></section>`))
          .join('')
      : String(html`<p class="notice">رویدادی با این کلمه‌ها پیدا نشد. کلمه‌های دیگری بنویسید یا «همه» را بزنید.</p>`);
  }
  $('#evq', root).addEventListener('input', draw);
  $('#evg', root).addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-g]');
    if (!b) return;
    g = b.dataset.g;
    $$('[data-g]', root).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    draw();
  });
  draw();
  if (location.hash) $(location.hash, root)?.scrollIntoView({ block: 'center' });
}
