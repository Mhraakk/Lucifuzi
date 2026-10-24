// حافظه — what the machine has learned, in plain view: how often its learned habits would have predicted the next
// trade (a replay over the real books), the shop's rhythm, each operator's pace and the errors they meet, and every
// note people asked it to remember (with who and when). Nothing here is hidden and anything can be forgotten.
import { html, fa, api, store, toast, navigate, $ } from '../core.mjs';
import { booksPrefs, jd, timeFa } from '../bk.mjs';
import { booksNav } from './books.mjs';

const DAYS = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'];
const bars = (arr, labels) => {
  const max = Math.max(1, ...arr);
  return html`<div class="mm-bars">${arr.map((v, i) => html`<div title="${labels[i]}: ${fa(v)}"><i style="height:${Math.max(2, (v / max) * 100)}%"></i><span>${labels[i]}</span></div>`)}</div>`;
};

export async function memoryPage(root) {
  await booksPrefs();
  const r = await api('/api/books/learn');
  const acc = (x, label) => html`<div class="mm-acc"><div class="au-ring ${x.pct == null ? '' : x.pct >= 70 ? '' : x.pct >= 45 ? 'warn' : 'bad'}" style="--p:${x.pct ?? 0}"><b>${x.pct == null ? '—' : `${fa(x.pct)}٪`}</b><span>${x.n ? `${fa(x.hit)} از ${fa(x.n)}` : 'داده کم'}</span></div><span>${label}</span></div>`;
  root.innerHTML = String(html`${booksNav('memory')}
    <div class="bk-head"><div><h1>حافظه</h1><span class="small">ماشین از روی اسناد واقعی و کارهای اپراتورها یاد می‌گیرد؛ هیچ‌وقت در دفاتر چیزی نمی‌نویسد، فقط پیشنهاد و هشدار می‌دهد و مدرکش را نشان می‌دهد.</span></div></div>
    <section class="tray bk-sec"><h3 class="bk-h">دقت یادگیری (بازپخش روی تاریخچه واقعی)</h3><p class="small">برای هر معامله، فقط با معامله‌های قبلی همان مشتری پیش‌بینی شد و با آنچه واقعاً رخ داد مقایسه شد.</p>
      <div class="mm-accs">${acc(r.replay.pay, 'روش و حساب پرداخت')}${acc(r.replay.fineness, 'عیار آبشده')}${acc(r.replay.coin, 'نوع سکه')}</div></section>
    <div class="grid2 bk-grid">
      <section class="tray"><h3 class="bk-h">ریتم مغازه (۹۰ روز)</h3><h4 class="mm-h">ساعت‌های شلوغ</h4>${bars(r.rhythm.hours.slice(8, 22), Array.from({ length: 14 }, (_, i) => fa(i + 8)))}<h4 class="mm-h">روزهای هفته</h4>${bars(r.rhythm.week, DAYS)}</section>
      <section class="tray"><h3 class="bk-h">${store.isAdmin() ? 'اپراتورها (۳۰ روز)' : 'کار شما (۳۰ روز)'}</h3>${r.operators.length ? r.operators.map((o) => html`<div class="mm-op"><b>${o.name}</b><span>${fa(o.events)} کنش · ${fa(o.saves)} سند${o.medianSeconds ? ` · میانه ثبت هر معامله ${fa(Math.round(o.medianSeconds))} ثانیه` : ''}</span>${o.topErrors.length ? html`<small>خطاهای پرتکرار: ${o.topErrors.map(([m, n]) => `${m} (${fa(n)})`).join('، ')}</small>` : ''}${o.topActions.length ? html`<small>کارهای پرتکرار: ${o.topActions.map(([a, n]) => `${a} ${fa(n)}`).join('، ')}</small>` : ''}</div>`) : html`<p class="small">هنوز کنشی ثبت نشده است.</p>`}</section>
    </div>
    <section class="tray bk-sec"><div class="bk-head"><h3 class="bk-h">یادداشت‌ها (${fa(r.memory.length)})</h3></div>
      <form class="mm-add" id="mf"><input class="input" name="text" maxlength="400" placeholder="یادداشت مغازه: مثلاً «پنجشنبه‌ها بانک ملت تا ساعت ۱۲ است»"><button class="btn small">به خاطر بسپار</button></form>
      <p class="small">یادداشت مشتری را از میز معامله («+ یادداشت») یا از دستیار («یادت باشه مهران …») بسازید.</p>
      <ul class="mm-list">${r.memory.map((m) => html`<li><div><b>${m.about || 'مغازه'}</b><p>${m.text}</p><small>${m.by} · ${jd(m.at)} ${timeFa(m.at)}</small></div><button class="chip" data-forget="${m.id}">فراموش کن</button></li>`)}</ul></section>`);
  $('#mf', root).addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = new FormData(e.target).get('text').trim();
    if (!text) return;
    try {
      await api('/api/books/memory', { method: 'POST', body: { scope: 'shop', text } });
      navigate('/books/memory', { replace: true });
    } catch (err) {
      toast(err.message, 'error');
    }
  });
  root.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-forget]');
    if (!b) return;
    try {
      await api(`/api/books/memory/${b.dataset.forget}`, { method: 'DELETE' });
      b.closest('li').remove();
      toast('فراموش شد (در دفتر رویدادها ثبت شد).', 'ok');
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}
