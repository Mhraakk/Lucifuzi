// The market desk: the whole Iranian gold market on one screen. A live board of ten prices, a professional
// chart (7 chart types, 13 overlays, 8 indicator panes, log scale), a "price hunt" with next-session levels,
// an Elliott-wave rule checker, four charts side by side, the Iranian-market analytics (coin bubble, hidden
// dollar, relative performance, correlation, risk, seasonality, ratios), price alerts and a chart guide.
import { html, fa, api, store, toast, $, $$ } from '../core.mjs';
import { ICON } from '../ui.mjs';
import { fmt, parseNum, MAZANEH_TO_G750, MAZANEH_TO_G1000 } from '../calc.mjs';
import * as T from '../ta.mjs';
import { SYMBOLS, SYMBOL, isSymbol, roundQuote } from '../market.mjs';
import { createChart, sparkline, barChart, heatmap, jDate, PALETTE } from '../charts.mjs';
import { OVERLAYS, PANES, niceBox } from '../indicators.mjs';

const PREFS = 'beatris.market.prefs';
const ALERTS = 'beatris.market.alerts';
const RANGES = [['1m', '۱ ماه', 22], ['3m', '۳ ماه', 66], ['6m', '۶ ماه', 130], ['1y', '۱ سال', 260], ['3y', '۳ سال', 780], ['all', 'همه', Infinity]];
const TYPES = [['candle', 'شمعی'], ['ohlc', 'میله‌ای OHLC'], ['line', 'خطی'], ['area', 'سطحی'], ['heikin', 'هیکن‌آشی'], ['renko', 'رنکو'], ['linebreak', 'سه‌خط شکست']];
const fin = Number.isFinite;
// signed numbers are isolated left-to-right so the sign stays in front of the digits inside Persian text
const pct = (v, d = 1) => (fin(v) ? `\u2066${v >= 0 ? '+' : '−'}${fmt(Math.abs(v), d)}٪\u2069` : '—');
const priceOf = (id) => (v) => (fin(v) ? fmt(v, SYMBOL[id]?.decimals ?? 0) : '—');
/** Derived prices (levels, targets) are shown the way the market quotes: toman to the thousand. */
const levelOf = (id) => (v) => (fin(v) ? fmt(roundQuote(id, v), SYMBOL[id]?.decimals ?? 0) : '—');
const load = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
};
const keep = (key, v) => {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* private mode: preferences last for this visit */
  }
};
const toBars = (rows) => rows.map(([d, o, h, l, c]) => ({ d, o, h, l, c }));
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

/* ---------------- a guide to every chart on this page ---------------- */
const GUIDE = [
  ['نمودار شمعی', 'هر شمع یک روز: بدنه از باز تا پایانی، سایه‌ها سقف و کف. سبز یعنی پایانی بالاتر از باز.'],
  ['میله‌ای OHLC', 'همان اطلاعات شمع با یک خط عمودی؛ تیک چپ باز و تیک راست پایانی.'],
  ['خطی', 'فقط قیمت پایانی؛ برای دیدن روند بی‌سروصدا.'],
  ['سطحی', 'خط پایانی با سطح زیر آن؛ برای مقایسه سریع سطح قیمت.'],
  ['هیکن‌آشی', 'شمع‌های میانگین‌گیری‌شده؛ روند را صاف‌تر نشان می‌دهد ولی قیمت واقعی نیست.'],
  ['رنکو', 'هر آجر یک جابه‌جایی ثابت (برابر ATR)؛ زمان حذف می‌شود و فقط حرکت‌های معنادار می‌ماند.'],
  ['سه‌خط شکست', 'خط تازه فقط با سقف یا کف پایانی تازه؛ برگشت باید سه خط قبلی را بشکند.'],
  ['میانگین متحرک ساده ۲۰/۵۰/۲۰۰', 'میانگین پایانی‌ها؛ قیمت بالای میانگین‌های صعودی یعنی روند صعودی.'],
  ['میانگین متحرک نمایی ۲۱', 'به قیمت‌های تازه وزن بیشتری می‌دهد و زودتر می‌چرخد.'],
  ['باند بولینگر', 'میانگین ۲۰ ± دو انحراف معیار؛ فشردگی باند اغلب پیش از حرکت بزرگ است.'],
  ['ابر ایچیموکو', 'ابر ۲۶ روز جلوتر رسم می‌شود؛ قیمت بالای ابر سبز یعنی روند صعودی.'],
  ['سوپرترند', 'خط حمایت/مقاومت بر پایه ATR که فقط هم‌جهت روند جابه‌جا می‌شود.'],
  ['سار سهموی', 'نقطه‌های زیر یا بالای قیمت؛ جای حد ضرر دنباله‌دار.'],
  ['کانال دونچیان', 'سقف و کف ۲۰ روز؛ شکست سقف کانال یعنی قدرت خریدار.'],
  ['کانال کلتنر', 'میانگین نمایی ± دو ATR؛ نسبت به بولینگر آرام‌تر است.'],
  ['نقاط پیوت', 'P = (سقف + کف + پایانی) ÷ ۳ روز قبل؛ R و S سطح‌های مقاومت و حمایت امروزند.'],
  ['فیبوناچی اصلاحی', 'سطح‌های ۲۳٫۶ تا ۷۸٫۶ درصد آخرین موج؛ ۶۱٫۸٪ مهم‌ترین است.'],
  ['زیگزاگ و امواج الیوت', 'نوسان‌های کوچک‌تر از آستانه حذف می‌شوند؛ شمارش پنج‌موجی با قواعد الیوت سنجیده می‌شود.'],
  ['RSI', 'قدرت نسبی ۱۴ روزه؛ بالای ۷۰ اشباع خرید، زیر ۳۰ اشباع فروش.'],
  ['MACD', 'اختلاف میانگین نمایی ۱۲ و ۲۶ و خط سیگنال ۹؛ هیستوگرام شتاب را نشان می‌دهد.'],
  ['استوکاستیک', 'جای پایانی در محدوده ۱۴ روز؛ بالای ۸۰ و زیر ۲۰ مناطق حساس‌اند.'],
  ['ATR', 'میانگین دامنه واقعی؛ انتظار نوسان یک روز. برای فاصله خرید و فروش و حد ضرر.'],
  ['ADX / DMI', 'قدرت روند (بالای ۲۵ قوی) و جهت آن (+DI در برابر −DI).'],
  ['CCI', 'فاصله قیمت از میانگین به واحد انحراف؛ ±۱۰۰ مرزهای معمول.'],
  ['ویلیامز ٪R', 'مانند استوکاستیک، معکوس؛ بالای −۲۰ اشباع خرید.'],
  ['مومنتوم (ROC)', 'درصد تغییر نسبت به ۱۲ روز قبل؛ عبور از صفر تغییر شتاب است.'],
  ['حباب سکه', 'قیمت سکه ÷ ارزش طلای آن (انس × دلار) منهای یک؛ حباب بالا یعنی سکه گران‌تر از طلایش.'],
  ['دلار مستتر', 'دلاری که قیمت آب‌شده یا سکه با انس جهانی پنهان کرده است؛ فاصله آن با دلار بازار، گرانی یا ارزانی طلا را نشان می‌دهد.'],
  ['عملکرد نسبی', 'همه دارایی‌ها از ۱۰۰ شروع می‌شوند؛ کدام بیشتر رشد کرده؟'],
  ['نقشه همبستگی', 'همبستگی بازده روزانه یک سال؛ نزدیک ۱ یعنی هم‌جهت.'],
  ['افت از سقف', 'فاصله قیمت از بالاترین سقف قبلی؛ ریسک واقعی نگه‌داشتن موجودی.'],
  ['نوسان تاریخی', 'انحراف معیار سالانه بازده ۲۰ روزه؛ دوره‌های پرریسک را جدا می‌کند.'],
  ['توزیع بازده', 'هیستوگرام بازده روزانه؛ دنباله‌های بلند یعنی جهش‌های نادر ولی بزرگ.'],
  ['فصلی بودن ماه‌های شمسی', 'میانگین بازده هر ماه شمسی در سال‌های گذشته؛ الگو نه قانون.'],
  ['نقشه بازده ماهانه', 'بازده هر ماه هر سال در یک نگاه.'],
  ['نسبت‌ها', 'سکه به مظنه، نیم و ربع به تمام، طلای ۱۸ به دلار؛ برای انتخاب ارزان‌ترین راه خرید طلا.'],
];

export async function marketPage(root) {
  const q = new URLSearchParams(location.search);
  const prefs = { symbol: 'mesghal', range: '6m', type: 'candle', log: false, overlays: ['sma20', 'sma50', 'bb'], panes: ['rsi', 'macd'], grid: ['mesghal', 'sekee', 'usd', 'ons'], ...load(PREFS, {}) };
  const S = {
    symbol: isSymbol(q.get('s')) ? q.get('s') : isSymbol(prefs.symbol) ? prefs.symbol : 'mesghal',
    range: RANGES.some((r) => r[0] === q.get('r')) ? q.get('r') : RANGES.some((r) => r[0] === prefs.range) ? prefs.range : '6m',
    type: TYPES.some((t) => t[0] === prefs.type) ? prefs.type : 'candle',
    log: !!prefs.log,
    overlays: new Set(prefs.overlays.filter((id) => OVERLAYS.some((o) => o[0] === id))),
    panes: new Set(prefs.panes.filter((id) => PANES.some((p) => p[0] === id))),
    grid: prefs.grid.filter(isSymbol).slice(0, 4),
    board: null,
    bars: [],
    ctx: {},
    all: null,
    lab: 'bubble',
    wave: null,
  };
  while (S.grid.length < 4) S.grid.push(SYMBOLS[S.grid.length].id);
  const save = () => keep(PREFS, { symbol: S.symbol, range: S.range, type: S.type, log: S.log, overlays: [...S.overlays], panes: [...S.panes], grid: S.grid });
  const charts = [];
  const statics = [];

  root.innerHTML = String(html`<div class="market">
    <div class="mk-head">
      <div><span class="eyebrow">میز بازار</span><h1>بازار طلا، سکه و ارز</h1></div>
      <div class="mk-src" id="src"></div>
    </div>
    <div id="notice"></div>
    <div class="mk-board" id="board" aria-label="تابلوی قیمت‌ها"><div class="loading"><span></span></div></div>
    <section class="tray mk-main">
      <div class="mk-bar">
        <label class="mk-sel"><span class="sr">نماد</span><select id="sym">${SYMBOLS.map((s) => html`<option value="${s.id}" ${s.id === S.symbol ? 'selected' : ''}>${s.label}</option>`)}</select></label>
        <div class="seg mk-seg" role="group" aria-label="بازه">${RANGES.map(([id, l]) => html`<button data-range="${id}" aria-pressed="${id === S.range}">${l}</button>`)}</div>
        <label class="mk-sel"><span class="sr">نوع نمودار</span><select id="type">${TYPES.map(([id, l]) => html`<option value="${id}" ${id === S.type ? 'selected' : ''}>${l}</option>`)}</select></label>
        <button class="chip" id="log" aria-pressed="${S.log}">لگاریتمی</button>
        <button class="iconbtn" id="png" title="ذخیره تصویر نمودار">${ICON.camera}</button>
      </div>
      <details class="mk-ind" ${matchMedia('(min-width: 720px)').matches ? 'open' : ''}><summary>شاخص‌ها و ابزار تحلیل <span class="small" id="indn"></span></summary>
        <div class="chips">${OVERLAYS.map(([id, l]) => html`<button class="chip" data-ov="${id}" aria-pressed="${S.overlays.has(id)}">${l}</button>`)}</div>
        <div class="chips" style="margin-top:8px">${PANES.map(([id, l]) => html`<button class="chip pane" data-pane="${id}" aria-pressed="${S.panes.has(id)}">${l}</button>`)}</div>
      </details>
      <div id="chart" class="mk-chart"></div>
      <p class="small mk-help">کشیدن: جابه‌جایی · چرخ ماوس یا دو انگشت: بزرگ‌نمایی · دوبار کلیک: کل بازه · کلیدهای جهت و +/−</p>
    </section>
    <div class="mk-cols">
      <section class="tray" id="hunt"></section>
      <section class="tray" id="wave"></section>
    </div>
    <section class="tray">
      <h2 class="mk-h">چند نمودار همزمان</h2>
      <div class="mk-grid" id="grid">${S.grid.map((id, k) => html`<div class="mk-cell"><select data-cell="${k}" aria-label="نماد نمودار ${fa(k + 1)}">${SYMBOLS.map((s) => html`<option value="${s.id}" ${s.id === id ? 'selected' : ''}>${s.short}</option>`)}</select><div class="mk-mini" id="cell${k}"></div></div>`)}</div>
    </section>
    <section class="tray" id="lab">
      <h2 class="mk-h">تحلیل‌های ویژه بازار ایران</h2>
      <div class="chips" role="tablist">${[['bubble', 'حباب سکه'], ['dollar', 'دلار مستتر'], ['perf', 'عملکرد نسبی'], ['corr', 'همبستگی'], ['risk', 'افت و نوسان'], ['dist', 'توزیع بازده'], ['season', 'فصلی'], ['ratio', 'نسبت‌ها']].map(([id, l]) => html`<button class="chip" role="tab" data-lab="${id}" aria-pressed="${id === S.lab}">${l}</button>`)}</div>
      <div id="labbody" class="mk-lab"><div class="loading"><span></span></div></div>
    </section>
    <section class="tray" id="alerts"></section>
    <details class="tray mk-guide"><summary><h2 class="mk-h" style="display:inline">راهنمای ${fa(GUIDE.length)} نمودار و شاخص این صفحه</h2></summary><dl>${GUIDE.map(([t, d]) => html`<dt>${t}</dt><dd>${d}</dd>`)}</dl></details>
    <p class="small mk-legal">این صفحه برای آموزش و تصمیم‌گیری آگاهانه است، نه توصیه خرید یا فروش. تحلیل تکنیکال و امواج الیوت احتمال را نشان می‌دهند نه قطعیت؛ همیشه با حد ضرر و به اندازه توان مالی معامله کنید.</p>
  </div>`);

  const chart = createChart($('#chart', root), { label: 'نمودار قیمت' });
  charts.push(chart);

  /* ---------------- data ---------------- */
  async function loadBoard() {
    S.board = await api('/api/market');
    drawBoard();
    checkAlerts();
  }
  function drawBoard() {
    const b = S.board;
    $('#src', root).innerHTML = String(html`<span class="stamp ${b.sample ? 'warn' : ''}">${b.source.label}</span>${b.source.at && !b.sample ? html`<span class="small">به‌روزرسانی ${fa(new Date(b.source.at).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }))}</span>` : ''}<button class="iconbtn" id="reload" title="به‌روزرسانی">${ICON.rotate}</button>${store.isAdmin() ? html`<a class="btn small ghost" href="/market/data" data-link>مدیریت داده بازار</a>` : ''}`);
    $('#notice', root).innerHTML = b.sample
      ? String(html`<p class="notice">این قیمت‌ها <b>داده نمونه آموزشی</b>اند (شبیه‌سازی سازگار با انس و دلار، نه قیمت واقعی). ${store.isAdmin() ? html`برای قیمت واقعی از <a href="/market/data" data-link>مدیریت داده بازار</a> منبع زنده را وصل یا قیمت روز را وارد کنید.` : 'مدیر فروشگاه می‌تواند قیمت واقعی را وصل کند.'}</p>`)
      : b.source.error
        ? String(html`<p class="notice">آخرین به‌روزرسانی خودکار ناموفق بود: ${b.source.error}</p>`)
        : '';
    $('#board', root).innerHTML = String(html`${b.items.map((it) => {
      const s = SYMBOL[it.id];
      if (it.empty) return html`<button class="mk-tile empty" data-sym="${it.id}"><span class="t">${s.short}</span><span class="small">بدون داده</span></button>`;
      return html`<button class="mk-tile ${it.id === S.symbol ? 'on' : ''}" data-sym="${it.id}" aria-pressed="${it.id === S.symbol}"><span class="t">${s.short}</span><b class="num">${priceOf(it.id)(it.c)}</b><span class="chg ${it.pct >= 0 ? 'up' : 'down'}">${fa(pct(it.pct, 2))}</span><canvas data-spark="${it.id}" width="120" height="34" aria-hidden="true"></canvas><span class="small">${jDate(it.d, 'day')}</span></button>`;
    })}`);
    for (const cv of $$('[data-spark]', root)) sparkline(cv, b.items.find((x) => x.id === cv.dataset.spark).spark);
  }
  const rangeBars = () => RANGES.find((r) => r[0] === S.range)[2];
  async function series(ids, from) {
    const r = await api(`/api/market/series?symbols=${ids.join(',')}${from ? `&from=${from}` : ''}`);
    return Object.fromEntries(Object.entries(r.series).map(([k, v]) => [k, toBars(v)]));
  }
  async function loadMain() {
    const n = rangeBars();
    // ~320 extra trading days warm up the slow indicators (SMA 200, Ichimoku); a year of ounce and dollar
    // prices feeds the fair-value check
    const from = fin(n) ? daysAgo(Math.max(400, Math.ceil((n + 320) * 1.45))) : null;
    const ids = [...new Set([S.symbol, 'ons', 'usd', 'mesghal'])];
    const data = await series(ids, from);
    S.bars = data[S.symbol] ?? [];
    S.ctx = data;
    drawWave();
    drawMain();
    drawHunt();
  }

  /* ---------------- main chart ---------------- */
  function drawMain({ keepView = false } = {}) {
    const real = S.bars;
    const sym = SYMBOL[S.symbol];
    $('#indn', root).textContent = fa(`${S.overlays.size + S.panes.size} فعال`);
    if (real.length < 2) {
      chart.set({ bars: [], type: 'none', overlays: [], panes: [], height: 300 });
      return;
    }
    let calc = real, display = real, type = S.type;
    if (S.type === 'heikin') ((display = T.heikinAshi(real)), (type = 'candle'));
    else if (S.type === 'renko' || S.type === 'linebreak') {
      const bricks = S.type === 'renko' ? T.renko(real, niceBox(T.atr(real, 14).at(-1))) : T.lineBreak(real, 3);
      calc = display = bricks.map((k) => ({ d: k.d, o: k.o, c: k.c, h: Math.max(k.o, k.c), l: Math.min(k.o, k.c) }));
      type = 'bricks';
    }
    const c = T.closes(calc), f = priceOf(S.symbol);
    // the Elliott count shown on the chart is the one the wave panel chose (daily bars only)
    const wave = calc === real ? S.wave : null;
    const overlays = OVERLAYS.filter(([id]) => S.overlays.has(id)).flatMap(([, , build]) => (calc.length > 3 ? build(calc, c, levelOf(S.symbol), wave) : []));
    const panes = PANES.filter(([id]) => S.panes.has(id)).map(([, , build]) => ({ ...build(calc, c), height: 96 }));
    const n = rangeBars();
    const startDay = fin(n) && real.length > n ? real[real.length - n].d : real[0].d;
    const shown = display.filter((b) => b.d >= startDay).length;
    const future = S.overlays.has('ichimoku') && type !== 'bricks' ? 26 : 0;
    chart.set({ bars: display, type, overlays, panes, future, log: S.log, decimals: sym.decimals ?? 0, unit: sym.unit, format: f, view: Math.max(2, shown) + future, height: Math.min(520, Math.max(320, innerHeight * 0.46)) + panes.length * 96 }, { keepView });
  }

  /* ---------------- price hunt ---------------- */
  function fairValue() {
    const { ons, usd, mesghal } = S.ctx;
    const sym = SYMBOL[S.symbol];
    const needs = ['mesghal', 'mesghal_fwd', 'geram18', 'geram24', 'usd'].includes(S.symbol) || sym.pure;
    if (!needs) return null;
    // the world value needs a real ounce and a real dollar from (nearly) the same day as the price it judges
    const lastDay = S.bars.at(-1)?.d;
    const age = (bars) => (bars?.length && lastDay ? Math.abs(Date.parse(lastDay) - Date.parse(bars.at(-1).d)) / 86400000 : Infinity);
    if (!ons?.length || !usd?.length || age(ons) > 3 || age(usd) > 3)
      return { missing: `برای این سنجش قیمت انس جهانی و دلار آزاد هم‌روز لازم است؛ ${!ons?.length || age(ons) > 3 ? 'انس' : 'دلار'} ${!ons?.length || !usd?.length ? 'ثبت نشده' : 'قدیمی است'}. هیچ عدد تخمینی جای آن گذاشته نمی‌شود.` };
    const last = (bars) => bars.at(-1)?.c;
    const o = last(ons), u = last(usd);
    const basis = `انس ${fa(fmt(o, 2))} دلار (${jDate(ons.at(-1).d)}) × دلار ${fa(fmt(u))} تومان (${jDate(usd.at(-1).d)})`;
    if (['mesghal', 'mesghal_fwd', 'geram18', 'geram24'].includes(S.symbol)) {
      const maz = T.impliedMesghal(o, u);
      const fair = S.symbol === 'geram18' ? maz / MAZANEH_TO_G750 : S.symbol === 'geram24' ? maz / MAZANEH_TO_G1000 : maz;
      return { label: 'ارزش از انس × دلار', fair, gap: T.bubble(last(S.bars), fair), note: basis };
    }
    if (sym.pure) {
      const fair = T.coinIntrinsic(sym.pure, o, u);
      const al = T.align({ c: S.bars, ons, usd });
      const hist = al.dates.map((d, i) => T.bubble(al.values.c[i], T.coinIntrinsic(sym.pure, al.values.ons[i], al.values.usd[i]))).slice(-260);
      const now = T.bubble(last(S.bars), fair);
      const rank = hist.length ? hist.filter((x) => x < now).length / hist.length : NaN;
      return { label: 'ارزش طلای سکه (انس × دلار)', fair, gap: now, rank, note: `${fa(fmt(sym.pure, 4))} گرم طلای خالص · ${basis}` };
    }
    if (S.symbol === 'usd' && mesghal?.length) {
      const hidden = T.impliedUsdMesghal(last(mesghal), o);
      return { label: 'دلار مستتر در مظنه', fair: hidden, gap: T.bubble(last(S.bars), hidden), note: `دلاری که مظنه ${fa(fmt(last(mesghal)))} با ${basis.split(' × ')[0]} نشان می‌دهد` };
    }
    return null;
  }
  const TREND = { up: 'صعودی', down: 'نزولی', side: 'خنثی / درون محدوده' };
  const MOM = { overbought: 'اشباع خرید (RSI بالای ۷۰)', oversold: 'اشباع فروش (RSI زیر ۳۰)', rising: 'شتاب مثبت و رو به افزایش', fading: 'شتاب مثبت ولی رو به کاهش', falling: 'شتاب منفی و رو به افزایش', recovering: 'شتاب منفی ولی رو به بهبود' };
  function verdict(r) {
    if (r.trend === 'up' && r.momentum === 'overbought') return 'روند صعودی است ولی بازار داغ است؛ اصلاح کوتاه محتمل است. بخشی از موجودی را نزدیک قیمت فروش صبورانه بفروشید و خرید تازه را به اصلاح بسپارید.';
    if (r.trend === 'up') return 'روند صعودی است؛ خرید روی اصلاح تا حوالی قیمت خرید صبورانه منطقی‌تر از خرید در سقف است. تا روند نشکسته، فروش عجولانه موجودی لازم نیست.';
    if (r.trend === 'down' && r.momentum === 'oversold') return 'روند نزولی است ولی فروش افراطی شده؛ برگشت کوتاه محتمل است. اگر می‌خرید پله‌ای و نزدیک حمایت‌ها بخرید.';
    if (r.trend === 'down') return 'روند نزولی است؛ برای خرید عجله نکنید، موجودی سنگین را نزدیک قیمت فروش صبورانه سبک کنید و منتظر نشانه برگشت (عبور از میانگین ۲۰ یا سبز شدن سوپرترند) بمانید.';
    return 'بازار در محدوده نوسان می‌کند؛ نزدیک کف محدوده بخرید و نزدیک سقف آن بفروشید و فاصله خرید و فروش را دست‌کم یک ATR بگیرید.';
  }
  function drawHunt() {
    const el = $('#hunt', root), sym = SYMBOL[S.symbol], f = levelOf(S.symbol);
    const r = T.marketRead(S.bars);
    if (!r) {
      el.innerHTML = String(html`<h2 class="mk-h">شکار قیمت</h2><p class="small">برای تحلیل دست‌کم ۶۰ روز قیمت لازم است.</p>`);
      return;
    }
    const fv = fairValue();
    const dist = (p) => pct((p / r.close - 1) * 100, 2);
    const levels = [
      ...['R2', 'R1'].map((k) => [k === 'R2' ? 'مقاومت پیوت ۲' : 'مقاومت پیوت ۱', r.pivots[k], 'res']),
      ...r.resist.map((p) => ['سقف نوسان قبلی', p, 'res']),
      ['باند بالای بولینگر', r.bands.upper, 'res'],
      ['قیمت پایانی', r.close, 'now'],
      ['باند پایین بولینگر', r.bands.lower, 'sup'],
      ...r.support.map((p) => ['کف نوسان قبلی', p, 'sup']),
      ...['S1', 'S2'].map((k) => [k === 'S1' ? 'حمایت پیوت ۱' : 'حمایت پیوت ۲', r.pivots[k], 'sup']),
    ].filter(([, p]) => fin(p)).sort((a, b) => b[1] - a[1]);
    el.innerHTML = String(html`<h2 class="mk-h">شکار قیمت: ${sym.short}</h2>
      <p class="small">بر پایه پایانی ${jDate(r.d)} · سطح‌ها برای جلسه بعد</p>
      <div class="hunt-pair"><div class="buy"><span>خرید صبورانه</span><b class="num">${f(r.bid)}</b><span class="small">${fa(dist(r.bid))}</span></div><div class="sell"><span>فروش صبورانه</span><b class="num">${f(r.ask)}</b><span class="small">${fa(dist(r.ask))}</span></div></div>
      <p class="small">محدوده مورد انتظار یک روز (± ATR): ${f(r.range.lo)} تا ${f(r.range.hi)} · ATR = ${fa(fmt(r.atrPct, 2))}٪ قیمت</p>
      <div class="ladder">${levels.map(([l, p, k]) => html`<div class="${k}"><span>${l}</span><span class="num">${f(p)}</span><span class="small">${k === 'now' ? '' : fa(dist(p))}</span></div>`)}</div>
      ${fv?.missing ? html`<p class="notice">${fv.missing}</p>` : fv ? html`<div class="fair"><div><span>${fv.label}</span><b class="num">${f(fv.fair)}</b></div><div><span>${sym.pure ? 'حباب' : 'فاصله با ارزش'}</span><b class="${fv.gap >= 0 ? 'hot' : 'cold'}">${fa(pct(fv.gap * 100, 2))}</b></div>${fin(fv.rank) ? html`<div><span>جایگاه حباب در یک سال</span><b>${fa(fmt(fv.rank * 100, 0))}٪ روزها کمتر</b></div>` : ''}<p class="small">${fv.note}</p></div>` : ''}
      <ul class="reasons">
        <li>روند: <b>${TREND[r.trend]}</b> (پایانی ${r.close > r.ema.e20 ? 'بالای' : 'زیر'} میانگین ۲۰ و ۲۰ ${r.ema.e20 > r.ema.e50 ? 'بالای' : 'زیر'} ۵۰)؛ قدرت روند ADX = ${fa(fmt(r.adx, 0))} (${r.strength === 'strong' ? 'قوی' : r.strength === 'weak' ? 'ضعیف' : 'متوسط'})</li>
        <li>شتاب: <b>${MOM[r.momentum]}</b> · RSI = ${fa(fmt(r.rsi, 0))}</li>
        <li>نوسان: <b>${r.vol === 'high' ? 'بالاتر از معمول' : r.vol === 'low' ? 'کمتر از معمول' : 'عادی'}</b> (ATR ${fa(fmt(r.atrPct, 2))}٪ در برابر میانه ${fa(fmt(r.atrMedPct, 2))}٪)${r.vol === 'high' ? ' — فاصله خرید و فروش را بیشتر بگیرید.' : ''}</li>
        ${fv && !fv.missing && sym.pure ? html`<li>${fv.gap > 0.08 ? 'حباب سکه بالاست؛ برای پس‌انداز طلا، آب‌شده یا سکه کم‌حباب‌تر ارزان‌تر است.' : fv.gap < 0.02 ? 'حباب سکه کم است؛ سکه نسبت به طلایش ارزان است.' : 'حباب سکه در محدوده معمول است.'}</li>` : ''}
        ${fv && !fv.missing && !sym.pure && fin(fv.gap) ? html`<li>${Math.abs(fv.gap) < 0.01 ? 'قیمت با انس و دلار هم‌خوان است.' : fv.gap > 0 ? `قیمت داخلی ${fa(fmt(fv.gap * 100, 1))}٪ بالاتر از ارزش جهانی است؛ اگر دلار ثابت بماند فشار کاهشی دارد.` : `قیمت داخلی ${fa(fmt(-fv.gap * 100, 1))}٪ زیر ارزش جهانی است؛ فرصت خرید نسبی.`}</li>` : ''}
      </ul>
      <p class="verdict-line">${verdict(r)}</p>
      <p class="small">روش: خرید صبورانه = میانگین «حمایت پیوت ۱» و «پایانی − نیم ATR»؛ فروش صبورانه = میانگین «مقاومت پیوت ۱» و «پایانی + نیم ATR». آموزشی است، نه توصیه معامله.</p>`);
  }

  /* ---------------- Elliott waves ---------------- */
  const KIND = { 'impulse-done': 'پنج موج کامل', wave5: 'در آستانه موج ۵', wave3: 'در آستانه موج ۳', 'abc-done': 'اصلاح A-B-C کامل' };
  // waves are fractal: the same rules are tried at several swing sizes (degrees) and the best counts kept
  function waveCounts(bars) {
    const base = T.swingPct(bars);
    const degrees = [base, base * 1.6, base * 2.5, base * 0.65].map((x) => Math.round(x * 10) / 10);
    const all = degrees.flatMap((pct) => {
      const zz = T.zigzag(bars, pct);
      return T.elliott(zz).map((c) => ({ ...c, pct, zz }));
    });
    const valid = all.filter((c) => c.valid).sort((a, b) => b.score - a.score);
    const seen = new Set();
    const uniq = valid.filter((c) => {
      const k = `${c.kind}:${c.points.map((p) => p.i).join(',')}`;
      return !seen.has(k) && seen.add(k);
    });
    // a count that keeps the rules but misses every Fibonacci guideline is possible, not convincing
    const good = uniq.filter((c) => c.score >= 40);
    return { base, good: good.slice(0, 3), weak: good.length ? [] : uniq.slice(0, 2), fallback: all.filter((c) => c.pct === degrees[0]).slice(0, 2) };
  }
  function drawWave() {
    const el = $('#wave', root), f = levelOf(S.symbol);
    if (S.bars.length < 60) {
      el.innerHTML = String(html`<h2 class="mk-h">امواج الیوت</h2><p class="small">داده کافی نیست.</p>`);
      return;
    }
    const w = waveCounts(S.bars);
    S.wave = w.good[0] ?? null;
    const cands = w.good.length ? w.good : w.weak.length ? w.weak : w.fallback;
    el.innerHTML = String(html`<h2 class="mk-h">امواج الیوت: شمارش‌های ممکن</h2>
      <p class="small">زیگزاگ در چهار درجه (پایه ${fa(fmt(w.base, 1))}٪ = سه برابر دامنه روزانه معمول)؛ بهترین شمارش‌هایی که همه قواعد را پاس می‌کنند.</p>
      ${w.good.length ? '' : w.weak.length ? html`<p class="notice">شمارش قانع‌کننده‌ای نیست: الگوهای زیر قواعد را نقض نمی‌کنند ولی نسبت‌های فیبوناچی‌شان دور از معمول است. به آن‌ها تکیه نکنید و سطح‌های «شکار قیمت» را مبنا بگیرید.</p>` : html`<p class="notice">در هیچ درجه‌ای الگوی پایه‌ای با همه قواعد الیوت نمی‌خواند؛ بازار احتمالاً در یک اصلاح پیچیده است. در این حالت به سطح‌های «شکار قیمت» تکیه کنید.</p>`}
      ${cands.map((c) => html`<div class="wave-card ${c.valid ? 'ok' : 'bad'}">
        <div class="wave-head"><b>${KIND[c.kind]} ${c.up ? '(صعودی)' : '(نزولی)'}</b><span class="stamp">${c.valid ? `امتیاز ${fa(c.score)} از ۱۰۰${c.score < 40 ? ' · ضعیف' : ''}` : 'نقض قاعده'}</span></div>
        <p class="small">درجه موج: زیگزاگ ${fa(fmt(c.pct, 1))}٪${c.live ? ' · آخرین نقطه هنوز در حال شکل‌گیری است' : ''}</p>
        <p class="small">${c.points.map((pt) => `${pt.label}: ${f(pt.price)}`).join(' ← ')}</p>
        <ul class="rules">${c.rules.map((r) => html`<li class="${r.ok ? 'ok' : 'bad'}">${r.ok ? '✓' : '✗'} ${r.text}</li>`)}</ul>
        <div class="ledger">${c.guides.map((g) => html`<div><span>${g.label} (مطلوب ${fa(fmt(g.lo, 3))} تا ${fa(fmt(g.hi, 3))})</span><span class="num ${g.ok ? '' : 'warn'}">${fa(fmt(g.ratio, 3))}</span></div>`)}</div>
        ${c.valid ? html`<p><b>${c.next}</b></p><div class="ledger">${c.targets.map((t) => html`<div><span>${t.label}</span><span class="num">${f(t.price)}</span></div>`)}</div><p class="small">ابطال: ${f(c.invalid)} — ${c.invalidText}</p>` : ''}
      </div>`)}
      <div class="actions"><a class="btn small" href="/market/elliott?s=${S.symbol}" data-link>استودیوی تحلیل جامع الیوت</a><button class="btn small ghost" id="showwave">${S.overlays.has('zigzag') ? 'نمایش روی نمودار فعال است' : 'نمایش زیگزاگ و شمارش روی نمودار'}</button></div>
      <p class="small">قواعد قطعی: موج ۲ از شروع موج ۱ پایین‌تر نمی‌رود، موج ۳ کوتاه‌ترین موج محرک نیست، موج ۴ وارد محدوده موج ۱ نمی‌شود (جز در مثلث‌های قطری). نسبت‌های فیبوناچی رهنمودند نه قانون؛ هر شمارش با یک قیمت ابطال همراه است.</p>`);
  }

  /* ---------------- four charts at once ---------------- */
  async function loadGrid() {
    const data = await series([...new Set(S.grid)], daysAgo(200));
    S.grid.forEach((id, k) => {
      let c = charts[k + 1];
      if (!c) charts[k + 1] = c = createChart($(`#cell${k}`, root), { height: 210, label: `نمودار ${SYMBOL[id].short}` });
      const bars = data[id] ?? [];
      const cl = T.closes(bars);
      c.set({ bars, type: 'candle', overlays: bars.length > 20 ? [{ kind: 'line', values: T.ema(cl, 20), color: '#5aa9e6', label: 'EMA ۲۰' }] : [], panes: [], decimals: SYMBOL[id].decimals ?? 0, unit: SYMBOL[id].unit, format: priceOf(id), view: Math.min(bars.length, 110), height: 210 });
    });
  }

  /* ---------------- analytics ---------------- */
  async function loadAll() {
    if (!S.all) S.all = await series(SYMBOLS.map((s) => s.id));
    return S.all;
  }
  function labChart(host, spec) {
    const c = createChart(host, { height: spec.height ?? 300 });
    c.set(spec);
    statics.push(c);
    return c;
  }
  async function drawLab() {
    const body = $('#labbody', root);
    statics.splice(0).forEach((c) => c.destroy());
    body.innerHTML = '<div class="loading"><span></span></div>';
    const all = await loadAll();
    const L = S.lab;
    const pctFmt = (v) => `${fa(fmt(v, 1))}٪`;
    const lineSpec = (dates, lines, extra = {}) => ({ bars: dates.map((d) => ({ d, o: 0, h: 0, l: 0, c: 0 })), type: 'none', overlays: lines, panes: [], ...extra });
    if (L === 'bubble' || L === 'dollar' || L === 'ratio') {
      const coins = SYMBOLS.filter((s) => s.pure);
      if (!all.ons?.length || !all.usd?.length) return (body.innerHTML = String(html`<p class="notice">این تحلیل بدون قیمت واقعی انس جهانی و دلار آزاد انجام نمی‌شود؛ هیچ عدد تخمینی جای آن‌ها گذاشته نمی‌شود.</p>`));
      const al = T.align(Object.fromEntries([...coins.map((s) => [s.id, all[s.id]]), ['ons', all.ons], ['usd', all.usd], ['mesghal', all.mesghal], ['geram18', all.geram18]].filter(([, v]) => v?.length)));
      if (al.dates.length < 20) return (body.innerHTML = String(html`<p class="notice">برای این تحلیل قیمت سکه‌ها، انس، دلار و مظنه در دست‌کم ۲۰ روز مشترک لازم است (هر روز با انس و دلار همان روز سنجیده می‌شود).</p>`));
      const V = al.values, D = al.dates;
      if (L === 'bubble') {
        const lines = coins.filter((s) => V[s.id]).map((s, k) => ({ kind: 'line', label: s.short, color: PALETTE[k], values: V[s.id].map((p, i) => T.bubble(p, T.coinIntrinsic(s.pure, V.ons[i], V.usd[i])) * 100), format: pctFmt }));
        const rows = lines.map((l) => {
          const v = l.values, now = v.at(-1), yr = v.slice(-260), avg = yr.reduce((a, b) => a + b, 0) / yr.length;
          return html`<div><span>${l.label}</span><span class="num">${fa(pct(now, 1))} · میانگین سال ${fa(pct(avg, 1))} · ${fa(fmt((yr.filter((x) => x < now).length / yr.length) * 100, 0))}٪ روزها کمتر</span></div>`;
        });
        body.innerHTML = String(html`<p class="small">حباب = قیمت سکه ÷ (طلای خالص سکه × انس ÷ ۳۱٫۱۰۳۵ × دلار) − ۱. سکه‌های کوچک‌تر همیشه حباب بیشتری دارند (هزینه ضرب و تقاضای هدیه).</p><div id="lc"></div><div class="ledger">${rows}</div>`);
        labChart($('#lc', body), lineSpec(D, lines, { format: pctFmt, zero: true, view: Math.min(D.length, 520) }));
      } else if (L === 'dollar') {
        const lines = [
          { kind: 'line', label: 'دلار بازار', color: '#d9d2c3', values: V.usd, width: 1.8 },
          { kind: 'line', label: 'دلار مستتر در مظنه', color: '#e3b862', values: V.mesghal ? V.mesghal.map((m, i) => T.impliedUsdMesghal(m, V.ons[i])) : [] },
          { kind: 'line', label: 'دلار مستتر در سکه امامی', color: '#e0605e', values: V.sekee ? V.sekee.map((p, i) => T.impliedUsdCoin(p, V.ons[i], SYMBOL.sekee.pure)) : [] },
        ];
        const now = (k) => lines[k].values.at(-1);
        body.innerHTML = String(html`<p class="small">دلار مستتر = قیمت داخلی ÷ ارزش دلاری طلای آن به قیمت انس جهانی. اگر دلار مستتر از دلار بازار بالاتر باشد، طلا در داخل گران‌تر از دلار است.</p><div id="lc"></div>
          <div class="ledger"><div><span>دلار بازار</span><span class="num">${fmt(now(0))}</span></div><div><span>دلار مستتر در مظنه</span><span class="num">${fmt(now(1))} (${fa(pct((now(1) / now(0) - 1) * 100, 2))})</span></div><div><span>دلار مستتر در سکه امامی</span><span class="num">${fmt(now(2))} (${fa(pct((now(2) / now(0) - 1) * 100, 2))})</span></div></div>`);
        labChart($('#lc', body), lineSpec(D, lines, { format: (v) => fmt(v), unit: 'تومان', view: Math.min(D.length, 520) }));
      } else {
        const lines = [
          V.sekee && V.mesghal && { kind: 'line', label: 'سکه امامی ÷ مظنه', color: '#e3b862', values: V.sekee.map((p, i) => p / V.mesghal[i]) },
          V.nim && V.sekee && { kind: 'line', label: '۲ × نیم ÷ تمام', color: '#5aa9e6', values: V.nim.map((p, i) => (2 * p) / V.sekee[i]) },
          V.rob && V.sekee && { kind: 'line', label: '۴ × ربع ÷ تمام', color: '#b388eb', values: V.rob.map((p, i) => (4 * p) / V.sekee[i]) },
        ].filter(Boolean);
        const g18usd = V.geram18 ? V.geram18.map((p, i) => p / V.usd[i]) : [], world = V.ons.map((o) => (o / T.TROY_OUNCE_G) * 0.75);
        body.innerHTML = String(html`<p class="small">نسبت‌ها ارزان‌ترین راه خرید طلا را نشان می‌دهند: اگر «۴ × ربع ÷ تمام» بالای ۱ باشد، چهار ربع گران‌تر از یک تمام است.</p><div id="lc"></div><h3>طلای ۱۸ عیار به دلار در برابر قیمت جهانی</h3><div id="lc2"></div>`);
        labChart($('#lc', body), lineSpec(D, lines, { format: (v) => fa(fmt(v, 3)), view: Math.min(D.length, 520) }));
        labChart($('#lc2', body), lineSpec(D, [{ kind: 'line', label: 'گرم ۱۸ داخلی به دلار', color: '#e3b862', values: g18usd, format: (v) => fa(fmt(v, 2)) }, { kind: 'line', label: 'گرم ۱۸ جهانی (انس × ۰٫۷۵ ÷ ۳۱٫۱)', color: '#5aa9e6', values: world, format: (v) => fa(fmt(v, 2)) }], { format: (v) => fa(fmt(v, 2)), unit: 'دلار', view: Math.min(D.length, 520), height: 240 }));
      }
      return;
    }
    const pick = html`<label class="mk-sel"><span class="sr">نماد</span><select id="labsym">${SYMBOLS.map((s) => html`<option value="${s.id}" ${s.id === S.symbol ? 'selected' : ''}>${s.label}</option>`)}</select></label>`;
    const bars = all[S.symbol] ?? [];
    if (L === 'perf') {
      const since = daysAgo(365);
      const al = T.align(Object.fromEntries(SYMBOLS.filter((s) => all[s.id]?.length).map((s) => [s.id, all[s.id].filter((b) => b.d >= since)])));
      const lines = Object.keys(al.values).map((id, k) => ({ kind: 'line', label: SYMBOL[id].short, color: PALETTE[k % PALETTE.length], values: al.values[id].map((v) => (v / al.values[id][0]) * 100), format: (v) => fa(fmt(v, 1)) }));
      const rank = lines.map((l) => [l.label, l.values.at(-1)]).sort((a, b) => b[1] - a[1]);
      body.innerHTML = String(html`<p class="small">یک سال اخیر، همه از ۱۰۰ شروع می‌شوند (روزهای مشترک).</p><div id="lc"></div><div class="ledger">${rank.map(([l, v]) => html`<div><span>${l}</span><span class="num">${fa(pct(v - 100, 1))}</span></div>`)}</div>`);
      labChart($('#lc', body), lineSpec(al.dates, lines, { format: (v) => fa(fmt(v, 1)), height: 320 }));
    } else if (L === 'corr') {
      const since = daysAgo(365);
      const m = T.corrMatrix(Object.fromEntries(SYMBOLS.filter((s) => all[s.id]?.length > 30).map((s) => [s.id, all[s.id].filter((b) => b.d >= since)])));
      body.innerHTML = String(html`<p class="small">همبستگی بازده روزانه در یک سال (${fa(m.n)} روز مشترک). سبز: هم‌جهت، قرمز: خلاف جهت.</p><div id="hm"></div>`);
      statics.push(heatmap($('#hm', body), { rows: m.keys.map((k) => SYMBOL[k].short), cols: m.keys.map((k) => SYMBOL[k].short), values: m.m, format: (v) => fmt(v, 2), title: 'نقشه همبستگی' }));
    } else if (L === 'risk') {
      const c = T.closes(bars), dd = T.drawdown(c).map((v) => v * 100), hv = T.histVol(c, 20, T.perYear(bars));
      body.innerHTML = String(html`${pick}<p class="small">بیشترین افت از سقف: <b>${fa(pct(Math.min(...dd), 1))}</b> · نوسان سالانه فعلی: <b>${fa(fmt(hv.at(-1), 1))}٪</b></p><div id="lc"></div>`);
      labChart($('#lc', body), { ...lineSpec(bars.map((b) => b.d), [{ kind: 'line', label: 'افت از سقف ٪', color: '#e0605e', values: dd, format: pctFmt }], { format: pctFmt, height: 360, view: Math.min(bars.length, 780) }), panes: [{ title: 'نوسان تاریخی سالانه ٪ (۲۰ روزه)', format: (v) => fmt(v, 0), height: 110, series: [{ kind: 'line', values: hv, color: '#b388eb', label: 'نوسان' }] }] });
    } else if (L === 'dist') {
      const r = T.pctReturns(T.closes(bars)).map((v) => v * 100).filter(fin).slice(-780);
      const h = T.histogram(r, 31), mean = r.reduce((a, b) => a + b, 0) / r.length, sd = Math.sqrt(r.reduce((a, b) => a + (b - mean) ** 2, 0) / (r.length - 1));
      body.innerHTML = String(html`${pick}<div class="ledger"><div><span>میانگین بازده روزانه</span><span class="num">${fa(pct(mean, 3))}</span></div><div><span>انحراف معیار روزانه</span><span class="num">${fa(fmt(sd, 2))}٪</span></div><div><span>روزهای مثبت</span><span class="num">${fa(fmt((r.filter((x) => x > 0).length / r.length) * 100, 0))}٪</span></div><div><span>بدترین و بهترین روز</span><span class="num">${fa(pct(Math.min(...r), 1))} · ${fa(pct(Math.max(...r), 1))}</span></div></div><div id="bc"></div>`);
      statics.push(barChart($('#bc', body), { labels: h.edges.slice(0, -1).map((e, i) => fmt((e + h.edges[i + 1]) / 2, 1)), values: h.counts, colors: h.edges.slice(0, -1).map((e, i) => ((e + h.edges[i + 1]) / 2 >= 0 ? 'rgba(63,178,127,0.8)' : 'rgba(224,96,94,0.8)')), format: (v) => fmt(v, 0), title: 'تعداد روزها در هر بازه بازده ٪', tip: (i) => `${fa(fmt(h.edges[i], 2))} تا ${fa(fmt(h.edges[i + 1], 2))}٪: ${fa(h.counts[i])} روز` }));
    } else if (L === 'season') {
      const s = T.seasonality(bars);
      const years = [...new Set(s.months.map((m) => m.jy))].slice(-8);
      body.innerHTML = String(html`${pick}<p class="small">میانگین بازده هر ماه شمسی (${fa(years.length)} سال اخیر در نقشه). الگوی فصلی احتمال است نه قانون؛ تعداد سال‌ها را ببینید.</p><div id="bc"></div><h3>بازده ماهانه هر سال</h3><div id="hm"></div>`);
      statics.push(barChart($('#bc', body), { labels: s.byMonth.map((m) => m.name), values: s.byMonth.map((m) => m.avg * 100), format: (v) => fmt(v, 1), title: 'میانگین بازده ماه ٪', tip: (i) => `${s.byMonth[i].name}: ${fa(pct(s.byMonth[i].avg * 100, 2))} · ${fa(s.byMonth[i].n)} سال · ${fa(fmt(s.byMonth[i].up * 100, 0))}٪ مثبت` }));
      const vals = years.map((y) => T.JALALI_MONTHS.map((_, k) => s.months.find((m) => m.jy === y && m.jm === k + 1)?.ret * 100));
      statics.push(heatmap($('#hm', body), { rows: years.map(String), cols: T.JALALI_MONTHS.map((m) => m.slice(0, 3)), values: vals, format: (v) => fmt(v, 0), domain: [-10, 10], title: 'بازده ماهانه' }));
    }
    $('#labsym', body)?.addEventListener('change', (e) => {
      setSymbol(e.target.value, { scroll: false });
    });
  }

  /* ---------------- price alerts ---------------- */
  let alerts = load(ALERTS, []).filter((a) => isSymbol(a.symbol) && fin(a.price));
  function drawAlerts() {
    const el = $('#alerts', root);
    el.innerHTML = String(html`<h2 class="mk-h">هشدار قیمت</h2>
      <p class="small">وقتی این صفحه باز است، هر دقیقه قیمت‌ها بررسی می‌شود. هشدارها روی همین دستگاه ذخیره می‌شوند.</p>
      <form class="mk-alert" id="af" autocomplete="off">
        <select name="symbol" aria-label="نماد">${SYMBOLS.map((s) => html`<option value="${s.id}" ${s.id === S.symbol ? 'selected' : ''}>${s.short}</option>`)}</select>
        <select name="op" aria-label="شرط"><option value="above">بالاتر از</option><option value="below">پایین‌تر از</option></select>
        <input class="input ltr" name="price" inputmode="decimal" placeholder="قیمت" required aria-label="قیمت هشدار">
        <button class="btn small" type="submit">افزودن</button>
      </form>
      ${alerts.length ? html`<div class="ledger">${alerts.map((a, i) => html`<div class="${a.hit ? 'hit' : ''}"><span>${SYMBOL[a.symbol].short} ${a.op === 'above' ? 'بالاتر از' : 'پایین‌تر از'} ${priceOf(a.symbol)(a.price)}${a.hit ? ` — رسید (${jDate(a.hit)})` : ''}</span><button class="iconbtn" data-delalert="${i}" aria-label="حذف هشدار">×</button></div>`)}</div>` : ''}`);
  }
  function checkAlerts() {
    if (!S.board) return;
    let changed = false;
    for (const a of alerts) {
      const it = S.board.items.find((x) => x.id === a.symbol);
      if (a.hit || !it || it.empty) continue;
      if ((a.op === 'above' && it.c >= a.price) || (a.op === 'below' && it.c <= a.price)) {
        a.hit = it.d;
        changed = true;
        const msg = `${SYMBOL[a.symbol].short} به ${priceOf(a.symbol)(it.c)} رسید`;
        toast(msg, 'info');
        try {
          if ('Notification' in window && Notification.permission === 'granted') new Notification('هشدار قیمت بئاتریس', { body: msg });
        } catch {
          /* notifications unavailable */
        }
      }
    }
    if (changed) {
      keep(ALERTS, alerts);
      drawAlerts();
    }
  }

  /* ---------------- events ---------------- */
  function setSymbol(id, { scroll = true } = {}) {
    if (!isSymbol(id)) return;
    S.symbol = id;
    $('#sym', root).value = id;
    history.replaceState({}, '', `/market?s=${id}&r=${S.range}`);
    save();
    for (const t of $$('.mk-tile', root)) {
      t.classList.toggle('on', t.dataset.sym === id);
      t.setAttribute('aria-pressed', String(t.dataset.sym === id));
    }
    loadMain().catch((e) => toast(e.message, 'error'));
    if (S.all && ['risk', 'dist', 'season'].includes(S.lab)) drawLab();
    if (scroll) $('.mk-main', root).scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  root.addEventListener('click', (e) => {
    const t = e.target.closest('button, [data-sym]');
    if (!t) return;
    if (t.dataset.sym) setSymbol(t.dataset.sym);
    else if (t.dataset.range) {
      S.range = t.dataset.range;
      for (const b of $$('[data-range]', root)) b.setAttribute('aria-pressed', String(b === t));
      if (['3y', 'all'].includes(S.range) && !S.log) {
        S.log = true;
        $('#log', root).setAttribute('aria-pressed', 'true');
      }
      history.replaceState({}, '', `/market?s=${S.symbol}&r=${S.range}`);
      save();
      loadMain().catch((err) => toast(err.message, 'error'));
    } else if (t.dataset.ov || t.dataset.pane) {
      const set = t.dataset.ov ? S.overlays : S.panes, id = t.dataset.ov ?? t.dataset.pane;
      if (set.has(id)) set.delete(id);
      else set.add(id);
      t.setAttribute('aria-pressed', String(set.has(id)));
      save();
      drawMain({ keepView: true });
    } else if (t.id === 'log') {
      S.log = !S.log;
      t.setAttribute('aria-pressed', String(S.log));
      save();
      drawMain({ keepView: true });
    } else if (t.id === 'png') {
      chart.toBlob().then((blob) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `beatris-${S.symbol}-${new Date().toISOString().slice(0, 10)}.png`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      });
    } else if (t.id === 'reload') {
      S.all = null;
      Promise.all([loadBoard(), loadMain(), loadGrid()]).then(() => toast('قیمت‌ها به‌روز شد.'), (err) => toast(err.message, 'error'));
    } else if (t.id === 'showwave') {
      S.overlays.add('zigzag');
      $('[data-ov="zigzag"]', root)?.setAttribute('aria-pressed', 'true');
      save();
      drawMain({ keepView: true });
      drawWave();
      $('.mk-main', root).scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (t.dataset.lab) {
      S.lab = t.dataset.lab;
      for (const b of $$('[data-lab]', root)) b.setAttribute('aria-pressed', String(b === t));
      drawLab().catch((err) => toast(err.message, 'error'));
    } else if (t.dataset.delalert) {
      alerts.splice(Number(t.dataset.delalert), 1);
      keep(ALERTS, alerts);
      drawAlerts();
    }
  });
  root.addEventListener('change', (e) => {
    if (e.target.id === 'sym') setSymbol(e.target.value, { scroll: false });
    else if (e.target.id === 'type') {
      S.type = e.target.value;
      save();
      drawMain();
    } else if (e.target.dataset.cell) {
      S.grid[Number(e.target.dataset.cell)] = e.target.value;
      save();
      loadGrid().catch((err) => toast(err.message, 'error'));
    }
  });
  root.addEventListener('submit', (e) => {
    if (e.target.id !== 'af') return;
    e.preventDefault();
    const f = e.target.elements, price = parseNum(f.price.value);
    if (!(price > 0)) return toast('قیمت هشدار را درست وارد کنید.', 'error');
    alerts.push({ symbol: f.symbol.value, op: f.op.value, price, created: new Date().toISOString() });
    keep(ALERTS, alerts);
    drawAlerts();
    toast('هشدار ثبت شد.');
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
  });

  drawAlerts();
  await Promise.all([loadBoard(), loadMain()]);
  loadGrid().catch((e) => toast(e.message, 'error'));
  // the analytics need every series; they load when the section first comes into view
  const io = new IntersectionObserver((es) => {
    if (!es.some((x) => x.isIntersecting)) return;
    io.disconnect();
    drawLab().catch((e) => toast(e.message, 'error'));
  });
  io.observe($('#lab', root));
  const timer = setInterval(() => {
    if (document.visibilityState === 'visible') loadBoard().catch(() => {});
  }, 60000);
  return () => {
    io.disconnect();
    clearInterval(timer);
    charts.forEach((c) => c?.destroy());
    statics.forEach((c) => c?.destroy());
  };
}
