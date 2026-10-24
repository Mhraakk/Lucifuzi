// میز کار من (spec 0038): each profile's own home. The boss sees the shop's pulse and what waits for them; the operator
// sees the queue and the keys; the seller sees today's sales and reservations; staff see their learning. The pins are
// the person's own; what the role may not open never shows, whatever the profile.
import { html, fa, api, store } from '../core.mjs';
import { TU, G, jd, today, booksPrefs } from '../bk.mjs';
import { PROFILES, ACTIONS, reachable } from '../workspace.mjs';
import { nextLesson } from '../ui.mjs';
import { pending } from '../outbox.mjs';

const greet = () => {
  const h = new Date().getHours();
  return h < 12 ? 'صبح بخیر' : h < 17 ? 'روز بخیر' : 'عصر بخیر';
};
const tile = (k) => {
  const a = ACTIONS[k];
  return html`<a class="wk-pin" href="${a.href}" ${a.blank ? html`target="beatris-screen"` : html`data-link`}><b>${a.label}</b><span>${a.hint}</span></a>`;
};

export async function workPage(root) {
  await booksPrefs();
  const me = store.me;
  const w = me.workspace ?? { profile: 'staff', pins: PROFILES.staff.pins };
  const P = PROFILES[w.profile] ?? PROFILES.staff;
  const admin = store.isAdmin();
  const pins = reachable(w.pins, { admin });
  const first = me.user.name.split(' ')[0];
  root.innerHTML = String(html`<section class="wk">
    <header class="wk-head"><div><span class="eyebrow">${greet()}، ${first}</span><h1>میز کار ${P.label}</h1><p class="small">${P.note}</p></div>
      <a class="chip" href="/me#workspace" data-link>تغییر فضای کار</a></header>
    <div class="wk-pins">${pins.map(tile)}</div>
    <div class="wk-body" id="wkb"><div class="loading" aria-busy="true"></div></div>
  </section>`);
  const body = root.querySelector('#wkb');
  const day = today();
  const sum = await api(`/api/books/summary?from=${day}&to=${day}`).catch(() => null);
  const card = (title, inner, cls = '') => html`<section class="wk-card ${cls}"><h2>${title}</h2>${inner}</section>`;
  const todayCard = sum
    ? card('امروز', html`<div class="wk-nums"><div><b>${fa(sum.count?.sale ?? 0)}</b><span>فروش</span></div><div><b>${TU(sum.sales ?? 0)}</b><span>جمع فروش</span></div><div><b>${G(sum.soldWeight ?? 0)}</b><span>گرم کارساخته</span></div>${sum.tradeIn ? html`<div><b>${TU(sum.tradeIn)}</b><span>معاوضه</span></div>` : ''}</div>`)
    : '';
  const cards = [todayCard];
  if (w.profile === 'boss' && admin) {
    const pulse = await api('/api/books/control/pulse').catch(() => null);
    if (pulse)
      cards.unshift(card('نبض فروشگاه', html`<p class="wk-sentence ${pulse.state}">${pulse.sentence}</p><ul class="wk-list">${pulse.drivers.filter((d) => d.available && d.score > 0.15).slice(0, 4).map((d) => html`<li><a href="${d.href}" data-link>${d.text}</a></li>`)}</ul>`, 'wide'));
  }
  if (w.profile === 'seller' || w.profile === 'boss') {
    const [mine, held] = await Promise.all([api(`/api/books/docs?type=sale&from=${day}&to=${day}&status=final&limit=200`).catch(() => ({ items: [] })), api('/api/books/docs?type=proforma&status=final&limit=8').catch(() => ({ items: [] }))]);
    const myName = me.user.name;
    const my = mine.items.filter((d) => d.createdBy === myName);
    if (w.profile === 'seller') cards.push(card('فروش امروز من', my.length ? html`<div class="wk-nums"><div><b>${fa(my.length)}</b><span>فاکتور</span></div><div><b>${TU(my.reduce((a, d) => a + d.sales, 0))}</b><span>جمع</span></div></div><ul class="wk-list">${my.slice(0, 5).map((d) => html`<li><a href="/books/doc/${d.id}" data-link>${d.partyName ?? 'مشتری گذری'} · ${TU(d.sales)}</a></li>`)}</ul>` : html`<p class="small">هنوز فروشی ثبت نکرده‌اید. <a href="/books/sell" data-link>میز فروش</a></p>`));
    cards.push(card('رزروها', held.items.length ? html`<ul class="wk-list">${held.items.map((d) => html`<li><a href="/books/doc/${d.id}" data-link>${d.partyName ?? '—'} · ${TU(d.sales)} · ${jd(d.date)}</a></li>`)}</ul>` : html`<p class="small">قطعه‌ای رزرو نیست.</p>`));
  }
  if (w.profile === 'operator') {
    const q = await pending().catch(() => []);
    cards.push(card('صف ارسال', q.length ? html`<p>${fa(q.length)} سند روی همین دستگاه منتظر ارسال است؛ با وصل شدن خودکار ثبت می‌شود.</p>` : html`<p class="small">صف خالی است؛ همه‌چیز ثبت شده.</p>`));
    cards.push(card('کلیدها', html`<dl class="wk-keys"><div><dt><kbd>Ctrl+Enter</kbd></dt><dd>ثبت سند</dd></div><div><dt><kbd>Ctrl+Z</kbd></dt><dd>برگشت گام‌به‌گام</dd></div><div><dt><kbd>Ctrl+K</kbd></dt><dd>جست‌وجوی همه‌جا</dd></div><div><dt><kbd>F2</kbd></dt><dd>میدان کالا یا بارکد</dd></div><div><dt><kbd>Alt+K</kbd></dt><dd>پرداخت با کارتخوان</dd></div></dl><p class="small">ورود تک‌خطی: «خرید رضایی ۱۲٫۴۵ گرم عیار ۷۵۰ نقد» در میز معامله.</p>`));
  }
  if (w.profile === 'staff') {
    const next = nextLesson();
    const p = me.progress;
    cards.unshift(card('آموزش', html`<div class="wk-nums"><div><b>${fa(p.overall)}٪</b><span>آمادگی</span></div><div><b>${fa(p.lessonsDone.length)}</b><span>درس خوانده</span></div><div><b>${fa(p.certificates.length)}</b><span>گواهی</span></div></div>${next ? html`<a class="btn" href="/lesson/${next.lesson.id}" data-link>ادامه: ${next.lesson.title}</a>` : html`<a class="btn ghost" href="/learn" data-link>مرور دوره‌ها</a>`}`, 'wide'));
    if (p.sopMissing?.length) cards.push(card('دستورالعمل‌ها', html`<p>${fa(p.sopMissing.length)} دستورالعمل هنوز تأیید نشده است.</p><a class="chip" href="/learn" data-link>دیدن</a>`));
  }
  cards.push(card('قیمت روز', html`<div class="wk-nums"><div><b>${TU(Math.round(me.pricing.p750 * 10))}</b><span>هر گرم ۱۸</span></div></div><a class="chip" href="/market" data-link>بازار</a>`));
  body.innerHTML = String(html`${cards}`);
}
