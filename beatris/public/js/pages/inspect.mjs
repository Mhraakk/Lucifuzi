// Counter coin inspection with a printable report for the customer: each measurement against the official
// specification, the probability of fraud (same test accuracies as the coin lab) and the decision band.
import { html, fa, store, $ } from '../core.mjs';
import { back } from '../ui.mjs';
import { fmt, parseNum } from '../calc.mjs';
import { COIN_TYPES } from '../coins.mjs';
import { inspectCoin, INSPECT_CONTEXTS } from '../inspect.mjs';

const seg = (name, opts) => html`<div class="seg" role="radiogroup">${opts.map(([v, l], i) => html`<label class="segopt"><input type="radio" name="${name}" value="${v}" ${i === 0 ? 'checked' : ''}><span>${l}</span></label>`)}</div>`;

export function inspectPage(root) {
  const coins = Object.entries(COIN_TYPES).filter(([, c]) => c.legal);
  root.innerHTML = String(html`${back('/tools', 'ابزار')}
    <h1>برگه بازرسی سکه</h1>
    <p class="lead">اندازه‌ها را پشت پیشخوان وارد کنید؛ هر عدد با مشخصات رسمی سنجیده می‌شود و احتمال تقلب با همان ضرایب آزمایشگاه سکه حساب می‌شود. برگه را برای مشتری چاپ کنید.</p>
    <div class="insp">
      <form class="tray form" id="ins" autocomplete="off">
        <label class="field">نوع سکه<select class="input" name="coin">${coins.map(([id, c]) => html`<option value="${id}">${c.label}</option>`)}</select></label>
        <label class="field">منبع سکه (نرخ پایه تقلب)<select class="input" name="ctx">${Object.entries(INSPECT_CONTEXTS).map(([k, c], i) => html`<option value="${k}" ${i === 1 ? 'selected' : ''}>${c.label} — ${fa(fmt(c.rate * 100, 1))}٪</option>`)}</select></label>
        <div class="form cols">
          <label class="field">وزن (گرم، ترازوی ۰٫۰۰۱)<input class="input ltr" name="weight" inputmode="decimal"></label>
          <label class="field">قطر (میلی‌متر، کولیس)<input class="input ltr" name="diameter" inputmode="decimal"></label>
          <label class="field">چگالی (وزن در آب، اختیاری)<input class="input ltr" name="density" inputmode="decimal"></label>
          <label class="field">عیار XRF (اختیاری)<input class="input ltr" name="xrf" inputmode="decimal"></label>
        </div>
        <div class="field">آهنربا${seg('magnet', [['', 'انجام نشد'], ['0', 'جذب نمی‌شود'], ['1', 'جذب می‌شود']])}</div>
        <div class="field">دندانه لبه${seg('edge', [['', 'انجام نشد'], ['ok', 'منظم'], ['bad', 'نامنظم']])}</div>
        <div class="field">صدای ضربه${seg('ring', [['', 'انجام نشد'], ['ok', 'زنگ‌دار'], ['dull', 'کدر']])}</div>
        <div class="field">ذره‌بین (نقش و حروف)${seg('loupe', [['', 'انجام نشد'], ['ok', 'همخوان'], ['bad', 'ناهمخوان']])}</div>
        <label class="field">نام مشتری (اختیاری، روی برگه)<input class="input" name="customer" maxlength="60"></label>
      </form>
      <section class="insp-report" id="rep" aria-live="polite"></section>
    </div>`);
  const f = $('#ins', root);
  const draw = () => {
    const v = (n) => f.elements[n].value;
    const num = (n) => (v(n).trim() ? parseNum(v(n)) : null);
    const m = { weight: num('weight'), diameter: num('diameter'), density: num('density'), xrf: num('xrf'), magnet: v('magnet') === '' ? null : v('magnet') === '1', edge: v('edge') || null, ring: v('ring') || null, loupe: v('loupe') || null };
    const r = inspectCoin(v('coin'), m, INSPECT_CONTEXTS[v('ctx')].rate);
    const exp = (e) => (e.text ? e.text : e.min != null ? `حداقل ${fa(e.min)}` : `${fa(fmt(e.nominal, 3))} ± ${fa(fmt(e.tol, 3))} ${e.unit}`);
    const shown = (x) => (typeof x === 'number' ? fa(fmt(x, 3)) : x);
    const now = new Date();
    $('#rep', root).innerHTML = String(html`<div class="insp-paper">
      <div class="insp-head"><b>${store.me?.brand?.shopName || 'گزارش بازرسی سکه'}</b><span>${fa(now.toLocaleDateString('fa-IR'))} · ${fa(now.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }))}</span></div>
      <p>سکه: <b>${r.coin.label}</b> — مشخصات رسمی: ${fa(r.coin.weight)} گرم، عیار ${fa(r.coin.fineness)}${v('customer') ? html` · مشتری: ${v('customer')}` : ''}</p>
      ${r.rows.length
        ? html`<table><thead><tr><th>آزمون</th><th>اندازه</th><th>مرجع</th><th>نتیجه</th></tr></thead><tbody>${r.rows.map((x) => html`<tr class="${x.flagged ? 'bad' : ''}"><td>${x.label}</td><td>${shown(x.measured)}</td><td>${exp(x.expected)}</td><td>${x.flagged ? '✗ ناهمخوان' : '✓ همخوان'}</td></tr>`)}</tbody></table>
          <div class="insp-verdict ${r.decision.key}"><span>احتمال تقلب پس از ${fa(r.rows.length)} آزمون</span><b>${fa(fmt(r.pFraud * 100, r.pFraud < 0.01 ? 2 : 1))}٪</b><span>${r.decision.label}: ${r.decision.note}</span></div>`
        : html`<p class="small">هنوز آزمونی وارد نشده است. نرخ پایه: ${fa(fmt(r.rate * 100, 1))}٪.</p>`}
      <p class="insp-foot">بازرس: ${store.me?.user?.name ?? ''} · این برگه نتیجه بازرسی فروشگاه است، نه گواهی رسمی بانک مرکزی. برای سکه پلمپ، استعلام را از درگاه رسمی انجام دهید.</p>
    </div>
    <div class="actions"><button class="btn" type="button" data-print>چاپ برگه</button></div>`);
  };
  root.addEventListener('click', (e) => e.target.closest('[data-print]') && window.print());
  f.addEventListener('input', draw);
  f.addEventListener('change', draw);
  draw();
}
