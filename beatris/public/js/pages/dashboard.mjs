// داشبورد مدیریت — the treasury view of the house for managers: its own shell (sidebar, header with date, search,
// alerts, theme and user), the live مظنه, four KPIs, the gold position through time, receivables aging, the mix of
// operating assets, today's trades, today's cash and the stock by kind. Every number is read from the books through
// GET /api/books/dashboard; nothing on this page computes or writes accounting.
import { html, raw, fa, api, store, navigate, ROLE_FA, $, $$ } from '../core.mjs';
import { crownSvg } from '../crown.mjs';
import { openPalette } from '../palette.mjs';
import { booksPrefs, prefs, jd, jdLong, parseDay, today, unitName } from '../bk.mjs';
import { toView, money, compact, grams, pctText, weekday } from '../dash/adapters.mjs';
import { sparkSvg, positionChart, agingRows, donutSvg, cashBars, heatCalendar, returnsCalendar } from '../dash/charts.mjs';
import { jalaliOf, toGregorian, JALALI_MONTHS } from '../ta.mjs';
import { sunrise } from '../light.mjs';

const I = (d) => raw(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`);
const ICON = {
  home: I('<path d="M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1Z"/>'),
  trade: I('<path d="M7 4 3 8l4 4M3 8h13M17 20l4-4-4-4M21 16H8"/>'),
  vault: I('<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="12" cy="12" r="3.2"/><path d="M12 8.8V7M12 17v-1.8M15.2 12H17M7 12h1.8"/>'),
  people: I('<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.7-3 3-4.8 5.5-4.8s4.8 1.8 5.5 4.8"/><circle cx="17" cy="9" r="2.4"/><path d="M16.5 14.3c2 .3 3.5 1.8 4 4.7"/>'),
  ledger: I('<path d="M6 3.5h10.5a1.5 1.5 0 0 1 1.5 1.5v14.5H7.5A1.5 1.5 0 0 1 6 18Z"/><path d="M6 18a1.5 1.5 0 0 1 1.5-1.5H18M9.5 7.5h5M9.5 10.5h5"/>'),
  chart: I('<path d="M4 20V10M10 20V4M16 20v-7M21 20H3"/>'),
  gear: I('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>'),
  search: I('<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>'),
  bell: I('<path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15Z"/><path d="M10 20a2 2 0 0 0 4 0"/>'),
  cal: I('<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/>'),
  moon: I('<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/>'),
  sun: I('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  info: I('<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/>'),
  back: I('<path d="m9 6 6 6-6 6"/>'),
  trace: I('<path d="M4 6h16M4 12h10M4 18h7"/><circle cx="17.5" cy="16.5" r="2.5"/><path d="m19.3 18.3 1.7 1.7"/>'),
  shield: I('<path d="M12 3 5 6v5c0 4.4 3 8.3 7 10 4-1.7 7-5.6 7-10V6Z"/><path d="m9 12 2 2 4-4"/>'),
  exit: I('<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M10 16l-4-4 4-4M6 12h10"/>'),
  bars: I('<path d="M3 17l2.5-5h7L15 17ZM9 11l2.5-5h7L21 11Z"/>'),
  wallet: I('<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M16 14.5h2"/>'),
  pie: I('<path d="M12 3a9 9 0 1 0 9 9h-9Z"/><path d="M15 3.5A9 9 0 0 1 20.5 9H15Z"/>'),
  melt: I('<path d="M5 17h14l-2-7H7Z"/><path d="M9 10V7a3 3 0 0 1 6 0v3"/>'),
  coin: I('<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="5"/>'),
  bar: I('<path d="M4 16h16l-3-8H7Z"/><path d="M9 12h6"/>'),
  ring: I('<circle cx="12" cy="14" r="6"/><path d="m9 5 3 3 3-3"/>'),
  lock: I('<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>'),
  control: I('<path d="M3 12h4l2-6 4 12 2-6h6"/>'),
  why: I('<circle cx="12" cy="12" r="8.5"/><path d="M9.8 9.5a2.3 2.3 0 1 1 3.2 2.1c-.6.3-1 .9-1 1.6v.4M12 16.6h.01"/>'),
};
const NAV = [
  ['dashboard', '/books/dashboard', 'داشبورد', 'home'],
  ['control', '/books/control', 'کنترل', 'control'],
  ['desk', '/books/desk', 'معاملات', 'trade'],
  ['vault', '/books/vault', 'موجودی طلا', 'vault'],
  ['parties', '/books/parties', 'مشتریان', 'people'],
  ['day', '/books/day', 'حسابداری', 'ledger'],
  ['reports', '/books/reports', 'گزارش‌ها', 'chart'],
  ['settings', '/books/settings', 'تنظیمات', 'gear'],
];
const NAV2 = [
  ['trace', '/books/trace', 'رهگیری', 'trace'],
  ['audit', '/books/audit', 'ممیز و تاجیار', 'shield'],
  ['home', '/', 'خانه اپ', 'exit'],
];
const RANGES = [['today', 'امروز'], ['7', '۷ روز'], ['30', '۳۰ روز'], ['90', '۹۰ روز'], ['custom', 'بازه']];
const SERIES = [
  { key: 'physicalGold', label: 'موجودی فیزیکی', cls: 's-gold', area: true },
  { key: 'goldReceivables', label: 'طلب طلایی', cls: 's-info' },
  { key: 'goldLiabilities', label: 'تعهد طلایی', cls: 's-neg' },
  { key: 'netGoldPosition', label: 'موقعیت خالص', cls: 's-pos', area: true, strong: true },
];
const STATUS = { settled: ['تسویه شده', 'ok'], open: ['در انتظار تسویه', 'wait'], void: ['باطل', 'void'], goods: ['حساب جنسی', 'goods'] };
const THEME_KEY = 'beatris.theme';
const curTheme = () => {
  try {
    return localStorage.getItem(THEME_KEY) || 'calm';
  } catch {
    return 'calm';
  }
};

export async function dashboardPage(root) {
  await booksPrefs();
  const me = store.me.user;
  const shop = prefs.settings?.legalName || store.me.brand?.shopName || '';
  const S = { range: '7', from: '', to: '', alloc: 'market', bucket: null, hidden: new Set(), seg: null, data: null, busy: false, heat: 'docs', hday: null };
  const stopChart = [];

  root.innerHTML = String(html`<div class="gd">
    <aside class="gd-side" aria-label="ناوبری مدیریت">
      <a class="gd-brand" href="/books/dashboard" data-link aria-label="داشبورد ${shop || 'خانه سکه و شمش'}">${raw(crownSvg({ size: 40, ring: false, id: 'gdc', cls: 'crown' }))}<span><b>${shop || 'خانه سکه و شمش'}</b><small>GOLD OS · مدیریت</small></span></a>
      <nav class="gd-nav">${NAV.map(([k, href, label, ic]) => html`<a href="${href}" data-link aria-label="${label}" ${k === 'dashboard' ? raw('aria-current="page"') : ''}>${ICON[ic]}<span>${label}</span></a>`)}</nav>
      <nav class="gd-nav gd-nav2">${NAV2.map(([, href, label, ic]) => html`<a href="${href}" data-link aria-label="${label}">${ICON[ic]}<span>${label}</span></a>`)}</nav>
      <div class="gd-store"><span class="gd-store-mark">${raw(crownSvg({ size: 28, ring: false, id: 'gds', cls: 'crown' }))}</span><div><b>${shop || 'فروشگاه مرکزی'}</b><small>${prefs.settings?.address || 'شعبه اصلی'}</small></div></div>
    </aside>
    <main class="gd-main">
      <header class="gd-top">
        <div class="gd-user"><i>${(me.name ?? '؟').trim()[0]}</i><span><b>سلام، ${me.name.split(' ')[0]}</b><small>${ROLE_FA[me.role] ?? ''}</small></span></div>
        <button class="gd-ic" id="gdTheme" aria-label="تغییر پوسته">${curTheme() === 'day' ? ICON.sun : ICON.moon}</button>
        <a class="gd-ic gd-bell" id="gdBell" href="/books/audit" data-link aria-label="هشدارهای ممیز">${ICON.bell}<em hidden></em></a>
        <form class="gd-search" id="gdSearch" role="search">${ICON.search}<input name="q" placeholder="جستجو در معاملات، مشتریان، فاکتورها..." aria-label="جستجو" autocomplete="off"></form>
        <div class="gd-date">${ICON.cal}<span>${weekday(today())}، ${jdLong(today())}</span></div>
      </header>
      <section class="gd-hero">
        <div class="gd-hero-art" aria-hidden="true">${raw(heroArt())}</div>
        <div class="gd-hero-t"><h1>وضعیت کلی فروشگاه</h1><p>نگاهی سریع به مهم‌ترین شاخص‌های امروز</p></div>
        <article class="gd-price" id="gdPrice"><div class="sk sk-price"></div></article>
      </section>
      <section class="gd-kpis" id="gdKpis">${[0, 1, 2, 3].map(() => html`<div class="gd-card gd-kpi sk"></div>`)}</section>
      <section class="gd-sig" aria-label="نبض طلا و تغییرات">
        <article class="gd-card gd-pulse" id="gdPulse" aria-live="polite"><div class="sk sk-rows"></div></article>
        <article class="gd-card gd-news" id="gdChg"><div class="sk sk-rows"></div></article>
      </section>
      <section class="gd-charts">
        <article class="gd-card gd-c1" id="gdPos"><header class="gd-ch"><div><h2>موقعیت خالص طلا ${raw(`<span class="gd-i" title="موجودی فیزیکی (آبشده + شمش) + طلب طلایی از مشتریان − تعهد طلایی به مشتریان، به گرم ۷۵۰">${ICON.info}</span>`)}</h2><p>روند موجودی، مطالبات، بدهی و موقعیت خالص</p></div>
            <div class="gd-range" role="group" aria-label="بازه زمانی">${RANGES.map(([k, l]) => html`<button data-range="${k}" aria-pressed="${S.range === k}">${l}</button>`)}</div></header>
          <form class="gd-custom" id="gdCustom" hidden><label>از<input name="from" placeholder="۱۴۰۵/۰۶/۰۱" inputmode="numeric"></label><label>تا<input name="to" placeholder="${jd(today())}" inputmode="numeric"></label><button class="gd-btn">نمایش</button></form>
          <div class="gd-pos-host" id="gdPosHost" tabindex="0" role="application" aria-label="نمودار موقعیت خالص طلا؛ با کلیدهای جهت بین روزها حرکت کنید و با Enter روزنگار همان روز را باز کنید"><div class="gd-pos-svg"><div class="sk sk-chart"></div></div><div class="gd-tip" hidden></div></div>
          <div class="gd-legend" id="gdLegend">${SERIES.map((s) => html`<button data-series="${s.key}" aria-pressed="true"><i class="${s.cls}"></i>${s.label}</button>`)}</div>
          <footer><a class="gd-btn" href="/books/day" data-link>مشاهده جزئیات ${ICON.back}</a></footer></article>
        <article class="gd-card gd-c2" id="gdAging"><header class="gd-ch"><div><h2>سن مطالبات مشتریان ${raw(`<span class="gd-i" title="روش اولین‌ورود: پرداخت‌ها اول قدیمی‌ترین بدهی را تسویه می‌کنند؛ آنچه مانده، سنِ بدهی‌های تازه‌تر را دارد">${ICON.info}</span>`)}</h2><p>تفکیک مطالبات ریالی بر اساس سن بدهی</p></div></header>
          <div class="gd-age-list" id="gdAgeList"><div class="sk sk-rows"></div></div><div class="gd-cohort" id="gdCohort" hidden></div>
          <footer><a class="gd-btn" href="/books/parties" data-link>مشاهده جزئیات مطالبات ${ICON.back}</a></footer></article>
        <article class="gd-card gd-c3" id="gdAlloc"><header class="gd-ch"><div><h2>ترکیب دارایی عملیاتی ${raw(`<span class="gd-i" title="ارزش بازار با قیمت زنده؛ ارزش دفتری طلا و سکه با بهای تمام‌شده میانگین موزون">${ICON.info}</span>`)}</h2><p>سهم هر بخش از کل دارایی عملیاتی</p></div>
            <div class="gd-toggle" role="group" aria-label="مبنای ارزش"><button data-alloc="market" aria-pressed="true">ارزش بازار</button><button data-alloc="book" aria-pressed="false">ارزش دفتری</button></div></header>
          <div class="gd-donut" id="gdDonut"><div class="sk sk-donut"></div></div>
          <footer><a class="gd-btn" href="/books/reports?tab=balance" data-link>مشاهده جزئیات دارایی‌ها ${ICON.back}</a></footer></article>
      </section>
      <section class="gd-year">
        <article class="gd-card gd-heat" id="gdHeat"><header class="gd-ch"><div><h2>تپش سال ${raw(`<span class="gd-i" title="هر خانه یک روز؛ هرچه پررنگ‌تر، روز پرکارتر. فقط اسناد قطعی شمرده می‌شوند.">${ICON.info}</span>`)}</h2><p>ضرب‌آهنگ کار خانه در ۵۳ هفته اخیر</p></div>
            <div class="gd-toggle" role="group" aria-label="معیار"><button data-heat="docs" aria-pressed="true">تعداد سند</button><button data-heat="value" aria-pressed="false">ارزش معامله</button></div></header>
          <div class="gd-heat-host" id="gdHeatHost" tabindex="0" role="application" aria-label="تقویم فعالیت؛ با کلیدهای جهت بین روزها حرکت کنید و با Enter روزنگار همان روز را باز کنید"><div class="sk sk-chart"></div></div>
          <div class="gd-heat-f"><p class="gd-heat-read" id="gdHeatRead" aria-live="polite"></p><span class="gd-heat-key" aria-hidden="true">کم${[0, 1, 2, 3, 4].map((l) => html`<i class="l${l}"></i>`)}زیاد</span></div></article>
        <article class="gd-card gd-rets" id="gdRets"><header class="gd-ch"><div><h2>کارنامه ماهانه ${raw(`<span class="gd-i" title="سود و زیان تحقق‌یافته معاملات به روش میانگین موزون، همان عدد گزارش سود و زیان؛ ماه‌ها شمسی">${ICON.info}</span>`)}</h2><p>سود و زیان تحقق‌یافته هر ماه شمسی</p></div></header>
          <div class="gd-ret-host" id="gdRetHost"><div class="sk sk-rows"></div></div>
          <footer><a class="gd-btn" href="/books/reports?tab=pnl" data-link>گزارش سود و زیان ${ICON.back}</a></footer></article>
      </section>
      <section class="gd-lower">
        <article class="gd-card gd-recent"><header class="gd-ch"><h2>آخرین معاملات امروز</h2><a class="gd-btn sm" href="/books/day" data-link>مشاهده همه ${ICON.back}</a></header><div id="gdRecent"><div class="sk sk-rows"></div></div></article>
        <article class="gd-card gd-cash"><header class="gd-ch"><h2>جریان نقد امروز</h2></header><div id="gdCash"><div class="sk sk-rows"></div></div><footer><a class="gd-btn" href="/books/cash" data-link>گزارش نقدینگی ${ICON.back}</a></footer></article>
        <article class="gd-card gd-inv"><header class="gd-ch"><h2>وضعیت موجودی طلا</h2><a class="gd-btn sm" href="/books/vault" data-link>مشاهده همه ${ICON.back}</a></header><div id="gdInv"><div class="sk sk-rows"></div></div></article>
      </section>
    </main></div>`);

  /* ---------------- data ---------------- */
  async function load() {
    S.busy = true;
    root.querySelector('.gd').classList.add('is-busy');
    const q = new URLSearchParams({ range: S.range, ...(S.range === 'custom' ? { from: S.from, to: S.to } : {}) });
    try {
      S.data = toView(await api(`/api/books/dashboard?${q}`));
      drawAll();
    } catch (e) {
      const msg = e.status === 403 ? 'داشبورد مدیریت مخصوص مدیر و مالک است.' : e.message;
      for (const id of ['gdPrice', 'gdKpis', 'gdAgeList', 'gdDonut', 'gdRecent', 'gdCash', 'gdInv', 'gdHeatHost', 'gdRetHost']) $(`#${id}`, root).innerHTML = '';
      $('#gdPosHost .gd-pos-svg', root).innerHTML = String(html`<div class="gd-state err"><b>${msg}</b>${e.status === 403 ? html`<a class="gd-btn" href="/books/pulse" data-link>رفتن به «نبض»</a>` : html`<button class="gd-btn" data-retry>تلاش دوباره</button>`}</div>`);
    } finally {
      S.busy = false;
      root.querySelector('.gd')?.classList.remove('is-busy');
    }
  }
  const change = (c, goodUp) => {
    if (c == null || !Number.isFinite(c) || Math.abs(c) < 0.05) return html`<span class="gd-chg flat">—</span>`;
    const good = (c > 0) === goodUp;
    return html`<span class="gd-chg ${good ? 'good' : 'bad'}" title="نسبت به ۷ روز پیش">${c > 0 ? '↑' : '↓'} ${pctText(c)}</span>`;
  };
  function drawAll() {
    const v = S.data;
    // price
    const p = v.price;
    $('#gdPrice', root).innerHTML = String(html`<header><span class="gd-live ${p.sample ? 'off' : ''}"><i></i>${p.sample ? 'داده نمونه' : 'زنده'}</span><h3>مظنه آب‌شده</h3></header>
      <div class="gd-price-v"><b class="num">${p.mazaneh ? money(p.mazaneh) : '—'}</b>${p.pct != null ? html`<span class="gd-chg ${p.pct >= 0 ? 'good' : 'bad'}">${p.pct >= 0 ? '↑' : '↓'} ${pctText(p.pct)}</span>` : ''}</div>
      <div class="gd-price-f"><small>${unitName()} / مثقال ۷۰۵ · گرم ۱۸: ${money(p.p750)}</small>${raw(sparkSvg(p.spark, { w: 120, h: 34 }))}</div>
      <small class="gd-upd">به‌روز شده ${new Date(p.at).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tehran' })}</small>`);
    // KPIs
    $('#gdKpis', root).innerHTML = v.kpis.map((k) => String(html`<div class="gd-kpi-w"><button class="gd-why" data-explain="${k.key}" title="این عدد از کجا آمد؟" aria-label="${k.title}: این عدد از کجا آمد؟">${ICON.why}</button><a class="gd-card gd-kpi k-${k.key}" href="${k.href}" data-link>
      <span class="gd-kpi-ic">${ICON[k.icon]}</span>
      <div class="gd-kpi-b"><header><h3>${k.title}</h3>${change(k.change, k.goodWhenUp)}</header><p class="gd-kpi-v"><b class="num">${k.value}</b><small>${k.unit}</small></p><p class="gd-kpi-s">${k.sub}</p>${k.extra ? html`<p class="gd-kpi-x">${k.extra}</p>` : ''}</div>
      <span class="gd-kpi-sp">${raw(sparkSvg(k.spark, { w: 96, h: 30 }))}</span></a></div>`)).join('');
    const bell = $('#gdBell em', root);
    const n = (v.alerts.high ?? 0) + (v.alerts.mid ?? 0);
    bell.hidden = !n;
    bell.textContent = fa(n);
    $('#gdBell', root).setAttribute('aria-label', `هشدارهای ممیز: ${fa(n)}`);
    drawPosition();
    drawAging();
    drawAlloc();
    drawYear();
    drawLower();
  }
  /* ---------------- the year: activity calendar and monthly results ---------------- */
  const monthOf = (iso) => {
    const [jy, jm, jdd] = jalaliOf(iso);
    return { jy, jm, jd: jdd, name: JALALI_MONTHS[jm - 1] };
  };
  function heatLevels() {
    const days = S.data.calendar.days, key = S.heat;
    const vals = days.map((d) => d[key]).filter((x) => x > 0).sort((a, b) => a - b);
    const q = (p) => vals[Math.min(vals.length - 1, Math.floor(p * vals.length))] ?? 0;
    const cut = [q(0.25), q(0.5), q(0.75)];
    return (d) => (!d[key] ? 0 : d[key] <= cut[0] ? 1 : d[key] <= cut[1] ? 2 : d[key] <= cut[2] ? 3 : 4);
  }
  function heatRead(iso) {
    const cal = S.data.calendar;
    const d = cal.days.find((x) => x.day === iso);
    const box = $('#gdHeatRead', root);
    if (!d) {
      const act = cal.days.filter((x) => x.docs);
      const wdSum = Array(7).fill(0), wdN = Array(7).fill(0);
      for (const x of cal.days) {
        const w = (new Date(`${x.day}T12:00:00Z`).getUTCDay() + 1) % 7;
        wdSum[w] += x.docs;
        wdN[w]++;
      }
      const best = wdSum.map((s, i) => s / (wdN[i] || 1)).reduce((b, v, i, a) => (v > a[b] ? i : b), 0);
      const top = act.reduce((b, x) => (!b || x.value > b.value ? x : b), null);
      box.innerHTML = act.length
        ? String(html`<b>${fa(act.length)}</b> روز کاری · <b>${fa(act.reduce((s, x) => s + x.trades, 0))}</b> معامله · پرکارترین روز هفته: <b>${['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'][best]}</b>${top?.value ? html` · پرارزش‌ترین روز: <b>${jd(top.day)}</b> (${compact(top.value)})` : ''}`)
        : 'هنوز سند قطعی در این یک سال ثبت نشده است.';
      return;
    }
    box.innerHTML = String(html`<b>${weekday(d.day)}، ${jd(d.day)}</b> · ${d.docs ? html`${fa(d.docs)} سند · ${fa(d.trades)} معامله${d.value ? html` · ارزش ${compact(d.value)}` : ''}` : 'بدون سند'}`);
  }
  function drawYear() {
    const cal = S.data.calendar;
    const host = $('#gdHeatHost', root);
    host.innerHTML = heatCalendar(cal.days, { level: heatLevels(), monthOf, sel: S.hday });
    heatRead(S.hday);
    // keep the newest week in view on narrow screens (RTL: newest is on the left)
    host.scrollLeft = -host.scrollWidth;
    const cur = cal.year * 100 + monthOf(today()).jm;
    const years = [...new Set([cal.year, ...cal.months.map((m) => m.jy)])].sort((a, b) => b - a);
    // one scale for the whole table so the cells compare at a glance
    const disp = (r) => (prefs.money === 'rial' ? r : r / 10);
    const top = Math.max(0, ...cal.months.map((m) => Math.abs(disp(m.realized))));
    const [div, word] = top >= 1e9 ? [1e9, 'میلیارد '] : top >= 1e6 ? [1e6, 'میلیون '] : [1, ''];
    const fmt = (v) => `${v < 0 ? '−' : ''}${fa((Math.abs(disp(v)) / div).toLocaleString('en-US', { maximumFractionDigits: div > 1 ? 1 : 0 })).replace(/,/g, '٬').replace(/\./g, '٫')}`;
    $('#gdRetHost', root).innerHTML = returnsCalendar(cal.months, { years, monthNames: JALALI_MONTHS, cur, fmt }) + String(html`<p class="gd-note">ارقام به ${word}${unitName()}؛ رنگ پررنگ‌تر یعنی سود یا زیان بزرگ‌تر. هر ماه را بزنید تا گزارش همان ماه باز شود.</p>`);
  }
  const monthRange = (key) => {
    const [jy, jm] = key.split('-').map(Number);
    const iso = (y, m, d) => toGregorian(y, m, d).map((n, i) => String(n).padStart(i ? 2 : 4, '0')).join('-');
    const from = iso(jy, jm, 1);
    const next = jm === 12 ? iso(jy + 1, 1, 1) : iso(jy, jm + 1, 1);
    return { from, to: new Date(Date.parse(`${next}T00:00:00Z`) - 864e5).toISOString().slice(0, 10) };
  };
  function drawPosition() {
    const v = S.data.position;
    stopChart.splice(0).forEach((f) => f());
    const host = $('#gdPosHost', root);
    if (!v.points.length) return ($('.gd-pos-svg', host).innerHTML = String(html`<div class="gd-state">در این بازه داده‌ای نیست.</div>`));
    const val = (g) => money(Math.round(g * v.p750));
    stopChart.push(
      positionChart(host, v.points, SERIES, {
        label: 'موقعیت خالص طلا',
        hidden: S.hidden,
        fmtY: (t) => (Math.abs(t) >= 1000 ? fa(Math.round(t).toLocaleString('en-US')).replace(/,/g, '٬') : grams(t)),
        tip: (pt) => String(html`<b class="gd-tip-h">${pt.timestamp.length === 2 ? `امروز ${pt.label}` : `${weekday(pt.timestamp)}، ${jd(pt.timestamp)}`}</b>${SERIES.filter((s) => !S.hidden.has(s.key)).map((s) => html`<div class="gd-tip-r"><i class="${s.cls}"></i><span>${s.label}</span><b class="num">${grams(pt[s.key])} گرم</b><small>${val(pt[s.key])}</small></div>`)}${pt.timestamp.length > 2 ? html`<small class="gd-tip-f">کلیک یا Enter: روزنگار همین روز</small>` : ''}`),
        onPick: (pt) => pt.timestamp.length > 2 && navigate(`/books/day?day=${pt.timestamp}`),
      }),
    );
  }
  function drawAging() {
    const a = S.data.aging;
    $('#gdAgeList', root).innerHTML = a.total ? agingRows(a.buckets, (x) => money(x), pctText, S.bucket) : String(html`<div class="gd-state">مطالبه ریالی باز نیست. ✓</div>`);
    const box = $('#gdCohort', root);
    const b = a.buckets.find((x) => x.key === S.bucket);
    box.hidden = !b;
    if (b) box.innerHTML = String(html`<header><b>${b.label}</b><span>${fa(b.customers)} مشتری · ${compact(b.amount)}</span><button class="gd-x" data-bucket="${b.key}" aria-label="بستن">×</button></header><ul>${b.parties.map((p) => html`<li><a href="/books/party/${p.id}" data-link><span>${p.label}</span><b class="num">${money(p.amount)}</b><small>${fa(p.days)} روز</small></a></li>`)}</ul>`);
  }
  function drawAlloc() {
    const segs = S.data.allocation[S.alloc];
    const total = segs.reduce((s, x) => s + x.value, 0);
    const act = S.seg && segs.find((x) => x.key === S.seg);
    const phys = S.data.allocation.physical;
    $('#gdDonut', root).innerHTML = String(html`<div class="gd-donut-w"><div class="gd-donut-c">${raw(donutSvg(segs, { size: 156, stroke: 20, active: S.seg }))}<div class="gd-donut-t"><small>${act ? act.label : 'کل دارایی عملیاتی'}</small><b class="num">${compact(act ? act.value : total).replace(` ${unitName()}`, '')}</b><small>${unitName()}${act ? ` · ${pctText(act.pct)}` : ''}</small></div></div>
      <ul class="gd-leg">${segs.map((x) => html`<li><button data-seg="${x.key}" aria-pressed="${S.seg === x.key}"><i style="background:${x.color}"></i><span>${x.label}<small>${compact(x.value)}</small></span><b class="num">${pctText(x.pct)}</b></button></li>`)}</ul></div>
      ${S.alloc === 'book' && S.data.allocation.bookPartial ? html`<p class="gd-note">بخشی از موجودی بهای تمام‌شده ثبت‌شده ندارد و به قیمت روز آمده است.</p>` : ''}
      ${S.seg === 'gold' ? html`<ul class="gd-sub">${phys.map((x) => html`<li class="${x.inside ? 'in' : ''}"><span>${x.label}</span><b class="num">${grams(x.grams)} گرم${x.count ? ` · ${fa(x.count)} شمش` : ''}</b><small>${compact(x.value)}</small></li>`)}</ul>` : ''}`);
  }
  function drawLower() {
    const v = S.data;
    $('#gdRecent', root).innerHTML = v.recent.length
      ? String(html`<table class="gd-table"><thead><tr><th>زمان</th><th>نوع معامله</th><th>طرف حساب</th><th>مقدار</th><th>قیمت واحد</th><th>مبلغ (${unitName()})</th><th>وضعیت</th></tr></thead><tbody>${v.recent.map((r) => html`<tr data-track="${r.track}" tabindex="0"><td class="num" data-l="زمان">${r.time}</td><td data-l="نوع">${r.kind}</td><td data-l="طرف حساب" class="gd-party">${r.party}</td><td class="num" data-l="مقدار">${r.qty}</td><td class="num" data-l="قیمت واحد">${r.unitPrice}</td><td class="num" data-l="مبلغ">${r.amount ? money(r.amount) : '—'}</td><td data-l="وضعیت"><span class="gd-pill ${STATUS[r.status][1]}">${STATUS[r.status][0]}</span></td></tr>`)}</tbody></table>`)
      : String(html`<div class="gd-state">امروز هنوز معامله‌ای ثبت نشده است. <a href="/books/desk" data-link>معامله تازه</a></div>`);
    const c = v.cash;
    $('#gdCash', root).innerHTML = String(html`<div class="gd-cash-w"><div class="gd-cash-n ${c.net >= 0 ? 'good' : 'bad'}"><small>خالص</small><b class="num">${c.net < 0 ? '−' : ''}${money(Math.abs(c.net))}</b><small>${unitName()}</small></div>${raw(cashBars(c.byHour))}</div>
      <div class="gd-cash-io"><div class="in"><i></i><small>ورودی</small><b class="num">${money(c.in)}</b></div><div class="out"><i></i><small>خروجی</small><b class="num">${money(c.out)}</b></div></div><p class="gd-note">فقط وجه نقد و بانکی؛ جابه‌جایی طلا و سکه در موجودی می‌آید.</p>`);
    $('#gdInv', root).innerHTML = String(html`<ul class="gd-invl">${v.inventory.map((x) => html`<li><a href="${x.href}" data-link><span class="gd-inv-ic">${ICON[x.icon]}</span><span class="gd-inv-l">${x.label}${x.detail ? html`<small>${x.detail}</small>` : ''}</span><b class="num">${x.qty}</b>${x.value != null ? html`<small class="num">${compact(x.value)}</small>` : html`<small></small>`}</a></li>`)}</ul>`);
  }

  /* ---------------- interactions ---------------- */
  root.addEventListener('click', (e) => {
    const r = e.target.closest('[data-range]');
    if (r) {
      S.range = r.dataset.range;
      $$('[data-range]', root).forEach((x) => x.setAttribute('aria-pressed', String(x === r)));
      $('#gdCustom', root).hidden = S.range !== 'custom';
      if (S.range !== 'custom') load();
      else $('#gdCustom [name=from]', root).focus();
      return;
    }
    const sr = e.target.closest('[data-series]');
    if (sr && S.data) {
      const k = sr.dataset.series;
      if (S.hidden.has(k)) S.hidden.delete(k);
      else if (S.hidden.size < SERIES.length - 1) S.hidden.add(k);
      sr.setAttribute('aria-pressed', String(!S.hidden.has(k)));
      return drawPosition();
    }
    const bk = e.target.closest('[data-bucket]');
    if (bk && S.data) {
      S.bucket = S.bucket === bk.dataset.bucket ? null : bk.dataset.bucket;
      drawAging();
      return $('#gdCohort', root).hidden || $('#gdCohort', root).scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    const al = e.target.closest('[data-alloc]');
    if (al && S.data) {
      S.alloc = al.dataset.alloc;
      $$('[data-alloc]', root).forEach((x) => x.setAttribute('aria-pressed', String(x === al)));
      return drawAlloc();
    }
    const sg = e.target.closest('[data-seg]');
    if (sg && S.data) {
      S.seg = S.seg === sg.dataset.seg ? null : sg.dataset.seg;
      return drawAlloc();
    }
    const hm = e.target.closest('[data-heat]');
    if (hm && S.data) {
      S.heat = hm.dataset.heat;
      $$('[data-heat]', root).forEach((x) => x.setAttribute('aria-pressed', String(x === hm)));
      return drawYear();
    }
    const hd = e.target.closest('rect[data-day]');
    if (hd && S.data) return navigate(`/books/day?day=${hd.dataset.day}`);
    const mo = e.target.closest('[data-month]');
    if (mo) {
      const { from, to } = monthRange(mo.dataset.month);
      return navigate(`/books/reports?tab=pnl&from=${from}&to=${to}`);
    }
    const tr = e.target.closest('tr[data-track]');
    if (tr && !e.target.closest('a')) return navigate(`/books/trace?q=${encodeURIComponent(tr.dataset.track)}`);
    if (e.target.closest('[data-retry]')) return load();
    if (e.target.closest('#gdTheme')) {
      const next = curTheme() === 'day' ? 'calm' : 'day';
      const r = e.target.closest('#gdTheme').getBoundingClientRect();
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch {
        /* storage unavailable */
      }
      // the charts read the theme's colours, so they are redrawn inside the switch, before the new view is shown
      sunrise(() => {
        document.documentElement.dataset.theme = next;
        if (S.data) drawAll();
      }, r.left + r.width / 2, r.top + r.height / 2);
      $('#gdTheme', root).innerHTML = String(next === 'day' ? ICON.sun : ICON.moon);
    }
  });
  const heatHost = $('#gdHeatHost', root);
  const pickDay = (iso) => {
    S.hday = iso;
    $$('rect.hc.on', heatHost).forEach((r) => r.classList.remove('on'));
    if (iso) $(`rect[data-day="${iso}"]`, heatHost)?.classList.add('on');
    heatRead(iso);
  };
  heatHost.addEventListener('pointerover', (e) => {
    const r = e.target.closest('rect[data-day]');
    if (r) pickDay(r.dataset.day);
  });
  heatHost.addEventListener('pointerleave', () => pickDay(null));
  heatHost.addEventListener('focus', () => S.data && pickDay(S.hday ?? S.data.calendar.days.at(-1)?.day));
  heatHost.addEventListener('keydown', (e) => {
    if (!S.data) return;
    const days = S.data.calendar.days;
    let i = days.findIndex((d) => d.day === S.hday);
    if (i < 0) i = days.length - 1;
    const step = { ArrowLeft: 7, ArrowRight: -7, ArrowUp: -1, ArrowDown: 1 }[e.key]; // left = newer (RTL)
    if (step) {
      e.preventDefault();
      pickDay(days[Math.max(0, Math.min(days.length - 1, i + step))].day);
    } else if (e.key === 'Enter' && S.hday) navigate(`/books/day?day=${S.hday}`);
    else if (e.key === 'Escape') pickDay(null);
  });
  root.addEventListener('keydown', (e) => {
    const tr = e.target.closest('tr[data-track]');
    if (tr && e.key === 'Enter') navigate(`/books/trace?q=${encodeURIComponent(tr.dataset.track)}`);
    const sg = e.target.closest('circle[data-seg]');
    if (sg && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      S.seg = S.seg === sg.dataset.seg ? null : sg.dataset.seg;
      drawAlloc();
    }
  });
  $('#gdCustom', root).addEventListener('submit', (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const from = parseDay(f.get('from')), to = parseDay(f.get('to')) ?? today();
    if (!from) return $('#gdCustom [name=from]', root).focus();
    Object.assign(S, { from, to });
    load();
  });
  $('#gdSearch', root).addEventListener('submit', (e) => {
    e.preventDefault();
    const q = new FormData(e.target).get('q').trim();
    openPalette(q); // one search for the whole app: customers, documents, pages and the manual
  });
  /* ---------------- امضای داشبورد: نبض طلا + چه تغییر کرد؟ ---------------- */
  const STATE_FA = { calm: ['آرام', 'calm'], watch: ['نیاز به نگاه', 'watch'], alarm: ['هشدار', 'alarm'] };
  const pct = (x) => `${fa(Math.round(x * 100))}٪`;
  const ago = (iso) => {
    const m = Math.max(1, Math.round((Date.now() - Date.parse(iso)) / 60000));
    return m < 60 ? `${fa(m)} دقیقه پیش` : m < 1440 ? `${fa(Math.round(m / 60))} ساعت پیش` : `${fa(Math.round(m / 1440))} روز پیش`;
  };
  async function loadSignature() {
    const [p, c] = await Promise.all([api('/api/books/control/pulse').catch((e) => ({ error: e.message })), api('/api/books/control/changes').catch((e) => ({ error: e.message }))]);
    const pe = $('#gdPulse', root), ce = $('#gdChg', root);
    if (!pe || !ce) return;
    if (p.error) pe.innerHTML = String(html`<p class="gd-empty">${p.error}</p>`);
    else {
      const [label, cls] = STATE_FA[p.state];
      pe.className = `gd-card gd-pulse st-${cls}`;
      pe.innerHTML = String(html`<header class="gd-ch"><div><h2><i class="gd-beat" aria-hidden="true"></i>نبض طلا</h2><p>یک جمله برای حال همین لحظه فروشگاه</p></div><span class="gd-verdict">${label}</span></header>
        <p class="gd-sentence">${p.sentence}</p>
        <div class="gd-prob" role="img" aria-label="احتمال‌ها: آرام ${pct(p.probabilities.calm)}، نیاز به نگاه ${pct(p.probabilities.watch)}، هشدار ${pct(p.probabilities.alarm)}">${['calm', 'watch', 'alarm'].map((k) => html`<i class="p-${k}" style="--w:${Math.max(0.5, p.probabilities[k] * 100)}%" title="${STATE_FA[k][0]} ${pct(p.probabilities[k])}"></i>`)}</div>
        <div class="gd-pmeta"><span>آرام ${pct(p.probabilities.calm)} · نگاه ${pct(p.probabilities.watch)} · هشدار ${pct(p.probabilities.alarm)}</span><span title="اطمینان: فاصله از حالت «نمی‌دانم»">اطمینان ${pct(p.confidence)}</span><span title="چه سهمی از نشانه‌ها داده داشتند">پوشش داده ${pct(p.coverage)}</span></div>
        <ul class="gd-drivers">${p.drivers.filter((d) => d.available).slice(0, 3).map((d) => html`<li><a href="${d.href}" data-link><i style="--s:${d.score}"></i>${d.text}</a></li>`)}</ul>
        <footer><button class="gd-btn" data-explain="pulse">${ICON.why} چرا این حکم؟</button><a class="gd-btn" href="/books/control" data-link>مرکز کنترل ${ICON.back}</a></footer>`);
    }
    if (c.error) ce.innerHTML = String(html`<p class="gd-empty">${c.error}</p>`);
    else {
      ce.innerHTML = String(html`<header class="gd-ch"><div><h2>چه تغییر کرد؟</h2><p>${c.first ? 'در ۲۴ ساعت گذشته' : `از آخرین سر زدن شما، ${ago(c.since)}`}؛ فقط موارد مهم</p></div>${c.items.length ? html`<button class="gd-btn sm" id="gdSeen">دیدم</button>` : ''}</header>
        ${c.items.length ? html`<ol class="gd-news-list">${c.items.map((x) => html`<li class="c-${x.icon}"><a href="${x.href}" data-link><b>${x.title}</b><span>${x.detail}</span></a></li>`)}</ol>${c.more ? html`<p class="gd-more">و ${fa(c.more)} مورد کم‌اهمیت‌تر</p>` : ''}` : html`<p class="gd-empty">از آخرین سر زدن شما تغییر مهمی نبوده است.</p>`}`);
      $('#gdSeen', ce)?.addEventListener('click', async (e) => {
        e.currentTarget.disabled = true;
        await api('/api/books/control/changes/seen', { method: 'POST' }).catch(() => {});
        loadSignature();
      });
    }
  }
  // refresh the numbers every two minutes while the page is open
  const timer = setInterval(() => !S.busy && document.visibilityState === 'visible' && (load(), loadSignature()), 120000);
  loadSignature();
  await load();
  return () => {
    clearInterval(timer);
    stopChart.splice(0).forEach((f) => f());
  };
}

/** Abstract hero: fine guilloché waves over a warm metal gradient and a faint crown — no stock imagery. */
function heroArt() {
  let waves = '';
  for (let k = 0; k < 9; k++) {
    let d = '';
    for (let x = 0; x <= 900; x += 10) d += `${x ? 'L' : 'M'}${x} ${(110 + 38 * Math.sin(x / 70 + k * 0.55) * Math.cos(x / 260 + k * 0.3) + k * 6).toFixed(1)}`;
    waves += `<path d="${d}"/>`;
  }
  return `<svg viewBox="0 0 900 240" preserveAspectRatio="xMidYMid slice"><defs><radialGradient id="gdh" cx="22%" cy="60%" r="70%"><stop offset="0" class="h0"/><stop offset=".55" class="h1"/><stop offset="1" class="h2"/></radialGradient></defs><rect width="900" height="240" fill="url(#gdh)"/><g class="wv">${waves}</g><g transform="translate(330 -52) scale(2.6)" class="hc">${crownSvg({ size: 120, ring: false, id: 'gdhc', cls: '' }).replace(/^<svg[^>]*>|<\/svg>$/g, '')}</g></svg>`;
}
