// Quick entry for melted-gold trades at the counter: type weight and fineness, pick buy or sell, press Enter.
// Every line uses the same fixed pattern (750-equivalent to 3 decimals, then money rounded to 1,000 toman) and
// lands in a session ledger that totals the gold and money columns and exports to CSV for the accounting app.
import { html, fa, store, toast, $, $$ } from '../core.mjs';
import { back } from '../ui.mjs';
import { fmt, parseNum, MAZANEH_TO_G750 } from '../calc.mjs';
import { eq750, gram18, r3, ledgerValue, AYAR_FACTORS } from '../melt.mjs';
import { confirmBox } from '../dialog.mjs';

const KEY = 'beatris.melt.session';
const SPREAD_KEY = 'beatris.melt.spread';
// Stored with Latin digits so the CSV imports cleanly into accounting software; the screen shows them in Persian.
const jalali = (d) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('fa-IR-u-ca-persian-nu-latn', { year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}/${p.month}/${p.day}`;
};
const clock = (d) => d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });

export function meltToolPage(root) {
  const p750 = store.me.pricing.p750;
  const mid = Math.round((p750 * MAZANEH_TO_G750) / 10000) * 10000;
  let rows = [];
  let spread = 150000;
  try {
    rows = JSON.parse(localStorage.getItem(KEY)) || [];
    spread = Number(localStorage.getItem(SPREAD_KEY)) || spread;
  } catch {
    rows = [];
  }
  const save = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(rows));
      localStorage.setItem(SPREAD_KEY, String(spread));
    } catch {
      /* storage unavailable: the session still works until the page closes */
    }
  };
  let side = 'buy';

  root.innerHTML = String(html`${back('/tools', 'ابزار')}
    <h1>ثبت سریع معامله آب‌شده</h1>
    <p class="lead">وزن و عیار را بزنید، خرید یا فروش را انتخاب کنید و Enter. هر سطر با الگوی ثابت دفتر حساب و به دفتر جلسه اضافه می‌شود؛ آخر شیفت خروجی CSV را به نرم‌افزار حسابداری ببرید.</p>
    <form class="tray" id="mf" autocomplete="off">
      <div class="seg" role="group" aria-label="طرف معامله" style="margin-bottom:12px"><button type="button" data-side="buy" aria-pressed="true">خرید از مشتری</button><button type="button" data-side="sell" aria-pressed="false">فروش به مشتری</button></div>
      <div class="form cols">
        <label class="field">وزن (گرم)<input class="input ltr" name="w" inputmode="decimal" required></label>
        <label class="field">عیار ری‌گیری<input class="input ltr" name="ayar" inputmode="decimal" value="${fa(740)}" required></label>
        <label class="field">مظنه میانگین روز (تومان)<input class="input ltr" name="mid" inputmode="decimal" value="${fmt(mid)}"></label>
        <label class="field">فاصله خرید/فروش از میانگین<input class="input ltr" name="spread" inputmode="decimal" value="${fmt(spread)}"></label>
        <label class="field">طرف حساب (اختیاری)<input class="input" name="who" maxlength="40"></label>
      </div>
      <div class="calc-out" id="live" aria-live="polite"></div>
      <div class="actions"><button class="btn" type="submit">افزودن به دفتر (Enter)</button></div>
      <details style="margin-top:10px"><summary class="small">ضریب‌های ثابت عیار</summary><div class="ledger">${AYAR_FACTORS.map((a) => html`<div><span>عیار ${fa(a.ayar)}</span><span class="num">× ${fmt(a.factor, 4)}</span></div>`)}</div></details>
    </form>
    <h2>دفتر این جلسه</h2>
    <div id="book"></div>
    <div class="actions"><button class="btn small ghost" data-act="csv">خروجی CSV</button><button class="btn small ghost" data-act="print">چاپ</button><button class="btn small ghost" data-act="clear">پاک کردن دفتر جلسه</button></div>`);

  const form = $('#mf', root);
  const v = (n) => parseNum(form.elements[n].value);
  const current = () => {
    const w = v('w'), ayar = v('ayar'), m = v('mid'), sp = v('spread');
    if (!(w > 0 && ayar > 0 && ayar <= 1000 && m > 0 && sp >= 0 && sp < m)) return null;
    const maz = side === 'buy' ? m - sp : m + sp;
    const eq = r3(eq750(w, ayar));
    return { side, w, ayar, maz, eq, g: gram18(maz), value: ledgerValue(w, ayar, maz) };
  };
  const live = () => {
    const c = current();
    const warn = v('ayar') > 0 && v('ayar') < 100 ? html`<p class="small" style="color:var(--carn)">عیار سه‌رقمی است (مثلاً ۷۴۲)؛ ${fa(v('ayar'))} احتمالاً اشتباه تایپی است.</p>` : '';
    $('#live', root).innerHTML = String(
      c
        ? html`<div class="ledger"><div><span>مظنه ${c.side === 'buy' ? 'خرید' : 'فروش'}</span><span class="num">${fmt(c.maz)}</span></div><div><span>گرم ۱۸ = مظنه ÷ ۴٫۳۳۱۸</span><span class="num">${fmt(Math.round(c.g))}</span></div><div><span>معادل ۷۵۰ = وزن × عیار ÷ ۷۵۰</span><span class="num">${fmt(c.eq, 3)} گرم</span></div><div><span>مبلغ (گرد به هزار)</span><span class="num">${fmt(c.value)} تومان</span></div><div><span>ستون طلا / ستون پول</span><span class="num">${c.side === 'buy' ? '+' : '−'}${fmt(c.eq, 3)} گرم · ${c.side === 'buy' ? '−' : '+'}${fmt(c.value)}</span></div></div>${warn}`
        : html`<p class="small">وزن و عیار را وارد کنید.</p>${warn}`,
    );
  };
  const book = () => {
    const gold = r3(rows.reduce((s, r) => s + (r.side === 'buy' ? r.eq : -r.eq), 0));
    const cash = rows.reduce((s, r) => s + (r.side === 'buy' ? -r.value : r.value), 0);
    $('#book', root).innerHTML = String(
      rows.length
        ? html`<div class="tablewrap" tabindex="0"><table><thead><tr><th>#</th><th>ساعت</th><th>طرف</th><th>طرف حساب</th><th>وزن</th><th>عیار</th><th>مظنه</th><th>معادل ۷۵۰</th><th>مبلغ</th><th></th></tr></thead><tbody>${rows.map((r, i) => html`<tr><td>${fa(i + 1)}</td><td>${fa(r.time)}</td><td>${r.side === 'buy' ? 'خرید' : 'فروش'}</td><td>${r.who || '—'}</td><td>${fmt(r.w, 2)}</td><td>${fa(r.ayar)}</td><td>${fmt(r.maz)}</td><td>${fmt(r.eq, 3)}</td><td>${fmt(r.value)}</td><td><button class="iconbtn" data-del="${i}" aria-label="حذف سطر">×</button></td></tr>`)}</tbody></table></div>
          <div class="ledger" style="margin-top:10px"><div><span>خالص ستون طلا (گرم ۷۵۰)</span><span class="num">${gold >= 0 ? '+' : '−'}${fmt(Math.abs(gold), 3)}</span></div><div><span>خالص ستون پول (تومان)</span><span class="num">${cash >= 0 ? '+' : '−'}${fmt(Math.abs(cash))}</span></div></div>`
        : html`<p class="small">هنوز سطری ثبت نشده است. دفتر جلسه روی همین دستگاه می‌ماند تا خودتان پاکش کنید.</p>`,
    );
  };

  form.addEventListener('input', () => {
    spread = v('spread') >= 0 ? v('spread') : spread;
    live();
  });
  form.addEventListener('click', (e) => {
    const b = e.target.closest('[data-side]');
    if (!b) return;
    side = b.dataset.side;
    $$('[data-side]', form).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    live();
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const c = current();
    if (!c) return toast('وزن، عیار و مظنه را درست وارد کنید.', 'error');
    if (c.ayar < 100) return toast('عیار باید سه‌رقمی باشد (مثلاً ۷۴۲).', 'error');
    const now = new Date();
    rows.push({ ...c, who: form.elements.who.value.trim(), date: jalali(now), time: clock(now) });
    save();
    book();
    form.elements.w.value = '';
    form.elements.who.value = '';
    form.elements.w.focus();
    live();
  });
  root.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.del) {
      rows.splice(Number(b.dataset.del), 1);
      save();
      book();
    } else if (b.dataset.act === 'clear') {
      if (!rows.length || !(await confirmBox('پاک کردن دفتر', 'دفتر این جلسه پاک شود؟', { danger: true, ok: 'پاک کن' }))) return;
      rows = [];
      save();
      book();
    } else if (b.dataset.act === 'print') window.print();
    else if (b.dataset.act === 'csv') {
      const head = ['row', 'date_jalali', 'time', 'side', 'party', 'weight_g', 'fineness', 'mazaneh', 'eq750_g', 'amount_toman', 'gold_delta_g', 'cash_delta_toman'];
      const q = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
      const lines = rows.map((r, i) => [i + 1, r.date, r.time, r.side, r.who, r.w, r.ayar, r.maz, r.eq, r.value, r.side === 'buy' ? r.eq : -r.eq, r.side === 'buy' ? -r.value : r.value].map(q).join(','));
      const blob = new Blob(['﻿' + [head.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `melt-ledger-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }
  });
  live();
  book();
  form.elements.w.focus();
}
