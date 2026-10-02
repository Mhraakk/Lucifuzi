// «تحلیل جامع امواج الیوت» (spec 0003): a full-width trading-terminal studio, reachable from the books
// (/books/elliott) and the market (/market/elliott). Header cards, the wave chart with its legend, then the four
// panels of the reference design: common corrective patterns, Fibonacci ratios, the typed scenarios, key notes.
import { html, raw, api, fa, $, $$ } from '../core.mjs';
import { fmt } from '../calc.mjs';
import { SYMBOLS, SYMBOL, isSymbol } from '../market.mjs';
import { waveMap, resample } from '../elliott.mjs';
import { createElliottView } from '../elliott-view.mjs';
import { booksNav } from './books.mjs';

const PREF = 'beatris.elliott';
const TF = [['D', '1D', 'روزانه'], ['W', '1W', 'هفتگی'], ['M', '1M', 'ماهانه']];
const DEG = [['0.7', 'ریز'], ['1', 'خودکار'], ['1.5', 'درشت']];
const TITLE = { ons: ['طلا', 'XAUUSD'], mesghal: ['مظنه آب‌شده', 'MESGHAL'], geram18: ['طلای ۱۸', 'GOLD18'], sekee: ['سکه امامی', 'EMAMI'], usd: ['دلار آزاد', 'USDIRR'] };
const fin = Number.isFinite;
const load = () => {
  try {
    return JSON.parse(localStorage.getItem(PREF)) ?? {};
  } catch {
    return {};
  }
};
const keep = (v) => {
  try {
    localStorage.setItem(PREF, JSON.stringify(v));
  } catch {
    /* private mode */
  }
};
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

// mini diagrams of the corrective patterns (points in a 120×70 box, y down)
const PATTERNS = [
  ['Zigzag (5-3-5)', 'زیگزاگ', [[6, 10], [40, 48], [62, 30], [112, 62]], ['', 'A', 'B', 'C']],
  ['Flat (3-3-5)', 'مسطح', [[6, 14], [40, 50], [70, 12], [112, 56]], ['', 'A', 'B', 'C']],
  ['Triangle (3-3-3-3-3)', 'مثلث', [[6, 8], [26, 58], [46, 18], [66, 50], [86, 26], [110, 42]], ['', 'A', 'B', 'C', 'D', 'E']],
  ['Double Three (W-X-Y)', 'سه‌گانه دوتایی', [[6, 12], [26, 40], [40, 28], [60, 50], [78, 30], [96, 46], [112, 62]], ['', '', 'W', '', 'X', '', 'Y']],
  ['Combination (W-X-Y-X-Z)', 'ترکیبی', [[6, 10], [22, 36], [34, 24], [50, 46], [64, 30], [80, 52], [94, 38], [112, 62]], ['', '', 'W', 'X', '', 'Y', 'X', 'Z']],
];
const patternSvg = (pts, labels) => raw(`<svg viewBox="0 0 120 72" aria-hidden="true"><polyline points="${pts.map((p) => p.join(',')).join(' ')}" fill="none" stroke="#ef4444" stroke-width="2" stroke-linejoin="round"/>${pts.map((p, k) => (labels[k] ? `<text x="${p[0]}" y="${p[1] + (k % 2 ? 10 : -4)}" fill="#fca5a5" font-size="9" font-weight="700" text-anchor="middle">${labels[k]}</text>` : '')).join('')}</svg>`);
const FIBS = [
  ['۰٫۲۳۶', 'اصلاح سطحی', '#f87171'],
  ['۰٫۳۸۲', 'اصلاح معمول (موج ۴)', '#fbbf24'],
  ['۰٫۵', 'اصلاح نیمه', '#facc15'],
  ['۰٫۶۱۸', 'اصلاح طلایی (موج ۲)', '#4ade80'],
  ['۰٫۷۸۶', 'اصلاح عمیق', '#60a5fa'],
  ['۱ – ۱٫۶۱۸', 'امتداد موج ۱ و ۵', '#cbd5e1'],
  ['۱٫۶۱۸ – ۲٫۶۱۸', 'امتداد موج ۳', '#cbd5e1'],
  ['۲٫۶۱۸ – ۴٫۲۳۶', 'امتداد بلند موج ۳ یا ۵', '#cbd5e1'],
];
const TIPS = [
  'موج ۳ معمولاً طولانی‌ترین و قوی‌ترین موج است و هرگز کوتاه‌ترین نیست.',
  'موج ۲ نباید کمتر از شروع موج ۱ بیاید؛ موج ۴ وارد محدوده موج ۱ نمی‌شود.',
  'از فیبوناچی برای شناسایی محدوده احتمالی پایان موج استفاده کنید، نه نقطه دقیق.',
  'همیشه سناریوی جایگزین و قیمت ابطال داشته باشید.',
  'شمارش را با ابزارهای دیگر (RSI، MACD، کانال) تأیید کنید؛ موج‌شماری قطعیت نیست.',
];

export async function elliottPage(root) {
  const inBooks = location.pathname.startsWith('/books');
  const q = new URLSearchParams(location.search);
  const pref = load();
  const S = {
    symbol: isSymbol(q.get('s')) ? q.get('s') : isSymbol(pref.symbol) ? pref.symbol : 'ons',
    tf: TF.some((t) => t[0] === pref.tf) ? pref.tf : 'D',
    deg: DEG.some((d) => d[0] === pref.deg) ? pref.deg : '1',
    daily: [],
    sample: false,
    map: null,
  };
  const save = () => keep({ symbol: S.symbol, tf: S.tf, deg: S.deg });
  const wide = matchMedia('(min-width: 1100px)').matches;

  root.innerHTML = String(html`${inBooks ? booksNav('elliott') : ''}<section class="ew" dir="rtl">
    <header class="ew-head">
      <div class="ew-id">
        <div class="ew-sym"><svg viewBox="0 0 40 26" aria-hidden="true"><path d="M4 22 9 8h22l5 14Z" fill="#d4a017"/><path d="M9 8h22l-3 5H12Z" fill="#f5c542"/><path d="M4 22h32l-2 3H6Z" fill="#a37b0c"/></svg><b id="ewSym"></b></div>
        <h1>تحلیل جامع امواج الیوت</h1>
        <p id="ewSub"></p>
      </div>
      <div class="ew-stats" id="ewStats"></div>
      <div class="ew-ctl">
        <label class="ew-sel"><span class="sr">نماد</span><select id="ewS">${SYMBOLS.map((s) => html`<option value="${s.id}" ${s.id === S.symbol ? 'selected' : ''}>${s.label}</option>`)}</select></label>
        <div class="ew-seg" role="group" aria-label="بازه زمانی">${TF.map(([k, t, l]) => html`<button data-tf="${k}" aria-pressed="${k === S.tf}" title="${l}">${t}</button>`)}</div>
        <div class="ew-seg" role="group" aria-label="درجه موج">${DEG.map(([k, l]) => html`<button data-deg="${k}" aria-pressed="${k === S.deg}">${l}</button>`)}</div>
        <button class="ew-btn" id="ewPng" title="ذخیره تصویر">تصویر</button>
      </div>
    </header>
    <div id="ewNote"></div>
    <div class="ew-chart-wrap">
      <div class="ew-chart" id="ewChart"></div>
      <details class="ew-legend" ${wide ? 'open' : ''}><summary>راهنمای موج‌ها</summary>
        <h4 class="b">موج‌های حرکتی (Impulse)</h4>
        <ul>${[['1', 'موج ۱'], ['2', 'موج ۲ (اصلاح)'], ['3', 'موج ۳ (قوی‌ترین)'], ['4', 'موج ۴ (اصلاح)'], ['5', 'موج ۵ (پایان)']].map(([n, t]) => html`<li><i class="c b">${n}</i>${t}</li>`)}</ul>
        <h4 class="r">موج‌های اصلاحی (Corrective)</h4>
        <ul>${['A', 'B', 'C'].map((n) => html`<li><i class="c r">${n}</i>موج ${n}</li>`)}</ul>
        <h4 class="o">موج‌های درجه بزرگ</h4>
        <p><span class="o">(I) (II) (III) (IV) (V)</span> حرکتی</p><p><span class="o">(A) (B) (C)</span> اصلاحی</p>
        <h4>سبک خطوط</h4>
        <ul class="ln"><li><i class="l k-ch"></i>کانال موج</li><li><i class="l k-fb"></i>سطوح فیبوناچی</li><li><i class="l k-zn"></i>ناحیه حمایت / هدف</li><li><i class="l k-pg"></i>سناریوی اصلی</li><li><i class="l k-pr"></i>سناریوی جایگزین</li></ul>
      </details>
    </div>
    <p class="ew-help">کشیدن: جابه‌جایی · چرخ ماوس یا دو انگشت: بزرگ‌نمایی · دوبار کلیک: کل شمارش · کلیدهای جهت و +/− · <a href="/help?ch=18" data-link>فیلم آموزش این بخش</a></p>
    <div class="ew-cards">
      <section class="ew-card"><h3>الگوهای رایج اصلاحی</h3><div class="ew-pats">${PATTERNS.map(([en, fa2, pts, lb]) => html`<figure><figcaption><b>${en}</b><small>${fa2}</small></figcaption>${patternSvg(pts, lb)}</figure>`)}</div></section>
      <section class="ew-card"><h3>نسبت‌های فیبوناچی مهم</h3><table class="ew-fib"><tbody>${FIBS.map(([r, t, c]) => html`<tr><td style="color:${c}" class="num">${r}</td><td>${t}</td></tr>`)}</tbody></table></section>
      <section class="ew-card ew-sc" id="ewScen"></section>
      <section class="ew-card"><h3>نکات کلیدی</h3><ul class="ew-tips">${TIPS.map((t) => html`<li>${t}</li>`)}</ul></section>
    </div>
    <section class="ew-card ew-count" id="ewCount"></section>
    <p class="ew-legal">آموزشی است، نه توصیه خرید یا فروش. شمارش امواج احتمال را نشان می‌دهد نه قطعیت؛ هر شمارش قیمت ابطال دارد و سناریوها از همین قیمت‌ها حساب شده‌اند، نه پیش‌بینی قطعی.</p>
  </section>`);

  const chart = createElliottView($('#ewChart', root));
  const legend = $('.ew-legend', root);
  const legendRoom = () => (legend.open && innerWidth >= 860 ? legend.offsetWidth + 16 : 0);
  legend.addEventListener('toggle', () => chart.inset(legendRoom()));
  const dec = () => SYMBOL[S.symbol]?.decimals ?? 0;
  const f = (v) => (fin(v) ? fa(fmt(v, dec())) : '—');

  async function loadData() {
    $('#ewNote', root).innerHTML = '';
    const r = await api(`/api/market/series?symbols=${S.symbol}&from=${daysAgo(S.tf === 'M' ? 4000 : S.tf === 'W' ? 2200 : 1100)}`);
    S.sample = !!r.sample;
    S.daily = (r.series[S.symbol] ?? []).map(([d, o, h, l, c]) => ({ d, o, h, l, c }));
    render();
  }
  function render() {
    const bars = resample(S.daily, S.tf);
    const [name, code] = TITLE[S.symbol] ?? [SYMBOL[S.symbol].short, S.symbol.toUpperCase()];
    $('#ewSym', root).textContent = `${name} (${code})`;
    const tfl = TF.find((t) => t[0] === S.tf);
    $('#ewSub', root).textContent = `تایم فریم: ${tfl[1]} (${tfl[2]}) · ${SYMBOL[S.symbol].unit}${S.sample ? ' · داده نمونه آموزشی' : ''}`;
    if (S.sample) $('#ewNote', root).innerHTML = String(html`<p class="ew-warn">این سری <b>داده نمونه آموزشی</b> است، نه قیمت واقعی. مدیر فروشگاه می‌تواند در «مدیریت داده بازار» منبع زنده را وصل کند.</p>`);
    const m = (S.map = waveMap(bars, { degree: Number(S.deg), format: f }));
    if (!m.enough) {
      $('#ewStats', root).innerHTML = '';
      $('#ewScen', root).innerHTML = String(html`<h3>سناریوهای احتمالی</h3><p class="ew-dim">برای این بازه دست‌کم ۴۰ شمع لازم است (${fa(m.n)} موجود).</p>`);
      $('#ewCount', root).innerHTML = '';
      chart.set({ bars, map: null, format: f, symbol: code, tf: tfl[1] });
      return;
    }
    const st = m.stats, up = st.chg >= 0;
    $('#ewStats', root).innerHTML = String(html`<div><span>قیمت فعلی</span><b class="num">${f(st.last)}</b><small class="${up ? 'up' : 'down'} num">${fa(`${up ? '+' : '−'}${fmt(Math.abs(st.chg), dec())} (${up ? '+' : '−'}${fmt(Math.abs(st.chgPct), 2)}٪)`)}</small></div>
      <div><span>بالاترین ${S.tf === 'D' ? 'روز' : S.tf === 'W' ? 'هفته' : 'ماه'}</span><b class="num">${f(st.hi)}</b><small class="ew-dim">۵۲ هفته: ${f(st.hi52)}</small></div>
      <div><span>پایین‌ترین ${S.tf === 'D' ? 'روز' : S.tf === 'W' ? 'هفته' : 'ماه'}</span><b class="num">${f(st.lo)}</b><small class="ew-dim">۵۲ هفته: ${f(st.lo52)}</small></div>`);
    chart.set({ bars, map: m, format: f, symbol: code, tf: tfl[1], inset: legendRoom() });
    const sc = m.scenarios;
    $('#ewScen', root).innerHTML = sc
      ? String(html`<h3>سناریوهای احتمالی</h3>
        ${[[sc.primary, 'g', 'سناریوی اصلی'], [sc.alternative, 'r', 'سناریوی جایگزین']].map(([s, k, t]) => html`<div class="ew-s ${k}"><div class="ew-s-h"><b>${t} (${s.dir > 0 ? 'صعودی' : 'نزولی'})</b><span class="num">${fa(Math.round(s.p * 100))}٪</span></div><p>${s.title}</p><ul>${s.lines.map((l) => html`<li>${l}</li>`)}</ul></div>`)}
        <p class="ew-dim ew-conf">اطمینان ${fa(Math.round(sc.decision.confidence * 100))}٪ · پوشش نشانه‌ها ${fa(Math.round(sc.decision.coverage * 100))}٪ (کیفیت شمارش، شیب میانگین ۵۵، RSI و MACD)</p>`)
      : String(html`<h3>سناریوهای احتمالی</h3><p class="ew-dim">شمارش معتبری پیدا نشد؛ سناریو ساخته نمی‌شود. درجه موج را «ریز» یا «درشت» کنید یا بازه دیگری را ببینید.</p>`);
    const mj = m.major;
    const KIND = { 'impulse-done': 'پنج موج کامل', wave5: 'در موج (V)', wave3: 'در موج (III)', 'abc-done': 'اصلاح (A)(B)(C) کامل' };
    $('#ewCount', root).innerHTML = String(html`<h3>شمارش و قواعد</h3>
      ${mj ? html`<p><b>${KIND[mj.kind]} ${mj.up ? 'صعودی' : 'نزولی'}</b> · امتیاز فیبوناچی ${fa(mj.score)} از ۱۰۰ · آستانه زیگزاگ درجه بزرگ ${fa(fmt(mj.pct, 1))}٪ · زیرموج‌های تأییدشده: ${fa(m.minor.length)} از ${fa(mj.points.length - 1)} پاره</p>
        <p class="ew-dim">${mj.points.filter((p) => p.label).map((p) => `(${p.label}) ${f(p.price)}`).join(' ← ')}</p>` : ''}
      <ul class="ew-notes">${m.notes.map((n) => html`<li class="${n.startsWith('✓') ? 'ok' : n.startsWith('✗') ? 'bad' : ''}">${n}</li>`)}</ul>
      <p class="ew-dim">زیرموج‌ها فقط وقتی برچسب می‌گیرند که خودشان قواعد الیوت را پاس کنند؛ پاره‌ای بدون برچسب یعنی ساختار داخلی‌اش روشن نیست.</p>`);
  }

  root.addEventListener('change', (e) => {
    if (e.target.id !== 'ewS') return;
    S.symbol = e.target.value;
    save();
    loadData();
  });
  root.addEventListener('click', (e) => {
    const tf = e.target.closest('[data-tf]'), dg = e.target.closest('[data-deg]');
    if (tf) {
      S.tf = tf.dataset.tf;
      for (const b of $$('[data-tf]', root)) b.setAttribute('aria-pressed', String(b === tf));
      save();
      loadData();
    } else if (dg) {
      S.deg = dg.dataset.deg;
      for (const b of $$('[data-deg]', root)) b.setAttribute('aria-pressed', String(b === dg));
      save();
      render();
    } else if (e.target.closest('#ewPng')) {
      const a = document.createElement('a');
      a.href = chart.png();
      a.download = `elliott-${S.symbol}-${S.tf}.png`;
      a.click();
    }
  });
  await loadData();
  return () => chart.destroy();
}
