// ابزارهای هوشمند — five of the seven new tools in one place: day close (with counting by a connected scale or by
// hand), liquidity forecast, price-move risk, bar identity cards and locked quotes. (The shared statement lives on
// the customer page; the locked quote is taken at the trade desk.)
import { html, raw, api, fa, $, $$, toast, store, busy } from '../core.mjs';
import * as B from '../books.mjs';
import { TRADE_COINS as COIN_TYPES } from '../coins.mjs';
import { FX_CODES, TRADE_KINDS } from '../trade.mjs';
import { booksPrefs, prefs, R, TU, G, jd, today, addDays, parseDay, timeFa, modal, confirmBox, unitName } from '../bk.mjs';
import { booksNav } from './books.mjs';
import { parseScale } from '../scale.mjs';

const TABS = [
  ['close', 'بستن روز'],
  ['forecast', 'نقدینگی فردا'],
  ['risk', 'هشدار نوسان'],
  ['bars', 'شناسنامه شمش'],
  ['quotes', 'قیمت‌های قفل‌شده'],
];
const acctName = (a, accounts = {}) => (a === 'gold' ? 'طلای آبشده (گرم ۷۵۰)' : a.startsWith('coin:') ? `سکه ${COIN_TYPES[a.slice(5)]?.short ?? a.slice(5)}` : a.startsWith('fx:') ? FX_CODES[a.slice(3)] : a.startsWith('cash:') ? `صندوق ${accounts[a] ?? ''}` : a);
const qty = (a, v) => (a === 'gold' ? G(v) : a.startsWith('cash:') ? TU(v) : fa(v));

export async function smartPage(root) {
  await booksPrefs();
  const admin = store.isAdmin();
  const tabs = admin ? TABS : TABS.filter(([k]) => ['bars', 'quotes'].includes(k));
  let tab = new URLSearchParams(location.search).get('t') ?? tabs[0][0];
  if (!tabs.some(([k]) => k === tab)) tab = tabs[0][0];
  root.innerHTML = String(html`${booksNav('smart')}<div class="sm">
    <header class="bk-head"><div><h1>ابزارهای هوشمند</h1><p class="small">بستن روز با امضای دیجیتال، نقدینگی لازم فردا، مشتریان در خطر نوسان، شناسنامه تصویری شمش و قیمت‌های قفل‌شده — همه از همین دفاتر.</p></div></header>
    <nav class="tabs" role="tablist">${tabs.map(([k, l]) => html`<button role="tab" data-tab="${k}" aria-selected="${tab === k}">${l}</button>`)}</nav>
    <div id="smBody"><div class="loading"><span></span></div></div></div>`);
  const body = () => $('#smBody', root);
  let cleanup = null;
  async function show() {
    cleanup?.();
    cleanup = null;
    $$('[data-tab]', root).forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
    history.replaceState(null, '', `${location.pathname}?t=${tab}`);
    body().innerHTML = '<div class="loading"><span></span></div>';
    try {
      cleanup = await { close: closeTab, forecast: forecastTab, risk: riskTab, bars: barsTab, quotes: quotesTab }[tab](body());
    } catch (e) {
      body().innerHTML = String(html`<p class="notice">${e.message}</p>`);
    }
  }
  root.addEventListener('click', (e) => {
    const t = e.target.closest('[data-tab]');
    if (t) {
      tab = t.dataset.tab;
      show();
    }
  });
  await show();
  return () => cleanup?.();
}

/* =============================== بستن روز =============================== */
async function closeTab(box) {
  let day = today();
  let v, accounts = {}, bk = {};
  let scale = null;
  const load = async () => {
    v = await api(`/api/books/close?day=${day}`);
    accounts = Object.fromEntries((await api('/api/books/accounts')).items.map((a) => [`${a.kind}:${a.id}`, a.title]));
    bk = (await api(`/api/books/counts?day=${day}`)).books;
    draw();
  };
  function draw() {
    const counts = v.counts[0];
    const rowsK = ['gold', ...Object.keys(bk).filter((a) => a.startsWith('coin:') || a.startsWith('fx:')), ...Object.keys(bk).filter((a) => a.startsWith('cash:'))];
    box.innerHTML = String(html`<div class="cl">
      <div class="cl-day"><label class="field">روز<input class="input ltr" id="clDay" value="${jd(day)}"></label>${v.closed && !v.closed.reopened ? html`<span class="cl-badge ok">بسته و امضا شده · ${v.closed.signer} · ${timeFa(v.closed.at)}</span>` : v.closed?.reopened ? html`<span class="cl-badge warn">باز شده: ${v.closed.reopened.reason}</span>` : html`<span class="cl-badge">باز</span>`}${v.lastClosed ? html`<small>آخرین روز بسته: ${jd(v.lastClosed)}</small>` : ''}</div>
      <section class="tray cl-sum"><h3 class="bk-h">خلاصه روز</h3><dl>
        <div><dt>اسناد</dt><dd>${fa(v.entries)}</dd></div><div><dt>خرید از مشتریان</dt><dd>${R(v.totals.buys)}</dd></div><div><dt>فروش به مشتریان</dt><dd>${R(v.totals.sells)}</dd></div>
        <div><dt>آبشده ورود / خروج</dt><dd>${G(v.totals.goldIn)} / ${G(v.totals.goldOut)}</dd></div>${v.totals.realized != null ? html`<div><dt>سود/زیان تحقق‌یافته</dt><dd class="${v.totals.realized < 0 ? 'neg' : 'pos'}">${R(v.totals.realized)}</dd></div>` : ''}</dl></section>
      <section class="tray"><div class="bk-head"><h3 class="bk-h">شمارش</h3><span class="cl-scale">${'serial' in navigator ? html`<button class="chip" data-scale>${scale ? `ترازو وصل است · ${scale.last ?? '—'}` : 'اتصال ترازو (USB/سریال)'}</button>` : html`<small>اتصال مستقیم ترازو در مرورگر Chrome یا Edge روی کامپیوتر ممکن است؛ این‌جا دستی وارد کنید.</small>`}</span></div>
        <div class="scrollx"><table class="table-plain cl-count"><thead><tr><th>قلم</th><th>دفتر</th><th>شمرده‌شده</th><th>اختلاف</th></tr></thead><tbody>
        ${rowsK.map((a) => {
          const last = counts?.lines.find((l) => l.acct === a);
          return html`<tr data-acct="${a}"><td>${acctName(a, accounts)}</td><td class="num">${qty(a, bk[a] ?? 0)}</td><td><input class="input ltr sm" data-count="${a}" aria-label="شمارش واقعی ${acctName(a, accounts)}" value="${last ? last.counted : ''}" inputmode="decimal">${a === 'gold' && scale ? html`<button class="chip" data-weigh="${a}">از ترازو</button>` : ''}</td><td class="num ${last?.diff ? (last.diff > 0 ? 'pos' : 'neg') : ''}">${last ? (last.diff ? `${last.diff > 0 ? '+' : '−'}${qty(a, Math.abs(last.diff))}` : '✓') : ''}</td></tr>`;
        })}
        </tbody></table></div><div class="actions"><button class="btn small" data-save-count>ثبت شمارش</button>${counts?.lines.some((l) => l.diff) ? html`<a class="btn small ghost" href="/books/products" data-link>سند اصلاح موجودی</a>` : ''}</div>
        ${counts ? html`<p class="small">آخرین شمارش ${timeFa(counts.at)} (${counts.source === 'scale' ? 'با ترازو' : 'دستی'}).</p>` : ''}</section>
      <section class="tray"><h3 class="bk-h">وارسی پیش از بستن</h3><ul class="cl-checks">${v.checks.map((c) => html`<li class="${c.ok ? 'ok' : 'warn'}"><span>${c.ok ? '✓' : '!'}</span><div><b>${c.title}</b>${c.warn ? html`<small>${c.warn}</small>` : ''}</div>${c.ok ? '' : html`<label class="check"><input type="checkbox" data-ack="${c.key}"> باز بماند</label>`}</li>`)}</ul></section>
      ${v.closed && !v.closed.reopened
        ? html`<section class="tray cl-sign"><h3 class="bk-h">امضا</h3><p class="small ltr-num">${v.closed.hash}</p><div class="actions"><button class="btn small" data-verify>وارسی امضا</button><button class="btn small ghost" data-print>چاپ گزارش بستن</button>${store.me.user.role === 'owner' ? html`<button class="btn small danger" data-reopen>باز کردن روز</button>` : ''}</div><div id="clVer"></div></section>`
        : html`<section class="tray cl-sign"><h3 class="bk-h">بستن و امضای روز</h3><p class="small">با رمز خودتان امضا می‌کنید؛ امضا با کلید دیجیتال فروشگاه (Ed25519) ثبت و به روز قبل زنجیر می‌شود. پس از بستن، هیچ سندی در این روز ثبت یا ویرایش نمی‌شود مگر مالک آن را با دلیل باز کند.</p>
            <label class="field">توضیح (برای مواردی که باز می‌مانند)<input class="input" id="clNote" maxlength="600"></label><label class="field">رمز شما<input class="input ltr" id="clPw" type="password" autocomplete="current-password"></label><p class="err" id="clErr" role="alert"></p><button class="btn" data-close-day>بستن روز ${jd(day)}</button></section>`}</div>`);
  }
  // a connected scale over Web Serial: reads lines like «ST,GS,+  123.456 g», keeps the last stable reading
  async function connectScale() {
    try {
      const port = await navigator.serial.requestPort();
      const cfg = (await api('/api/books/counts')).scale;
      await port.open({ baudRate: cfg.baud ?? 9600 });
      scale = { port, last: null, stable: null, run: true, hist: [] };
      const reader = port.readable.pipeThrough(new TextDecoderStream()).getReader();
      scale.reader = reader;
      let buf = '';
      (async () => {
        while (scale?.run) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += value;
          const lines = buf.split(/\r?\n|\r/);
          buf = lines.pop();
          for (const ln of lines) {
            const r = parseScale(ln);
            if (!r) continue;
            scale.hist = [...scale.hist.slice(-4), r.grams];
            scale.last = `${G(r.grams)} گرم`;
            if (r.stable || (scale.hist.length >= 3 && scale.hist.slice(-3).every((x) => Math.abs(x - r.grams) < 0.0015))) scale.stable = r.grams;
            const btn = $('[data-scale]', box);
            if (btn) btn.textContent = `ترازو وصل است · ${scale.last}${scale.stable === r.grams ? ' · ثابت' : ''}`;
          }
        }
      })().catch(() => {});
      draw();
      toast('ترازو وصل شد.', 'ok');
    } catch (e) {
      toast(e.name === 'NotFoundError' ? 'ترازویی انتخاب نشد.' : `اتصال ترازو انجام نشد: ${e.message}`, 'error');
    }
  }
  box.addEventListener('change', (e) => {
    if (e.target.id === 'clDay') {
      const d = parseDay(e.target.value);
      if (d) (day = d), load();
    }
  });
  box.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    try {
      if (b.hasAttribute('data-scale')) return scale ? null : connectScale();
      if (b.dataset.weigh) {
        if (!scale?.stable && scale?.stable !== 0) return toast('منتظر عدد ثابت ترازو بمانید.', 'error');
        const tare = Number((await api('/api/books/counts')).scale.tares?.['ظرف آبشده'] ?? 0);
        $(`[data-count="${b.dataset.weigh}"]`, box).value = String(B.r3(scale.stable - tare));
        $(`[data-count="${b.dataset.weigh}"]`, box).dataset.gross = String(scale.stable);
        return;
      }
      if (b.hasAttribute('data-save-count')) {
        const lines = $$('[data-count]', box).filter((i) => i.value.trim() !== '').map((i) => ({ acct: i.dataset.count, counted: B.num(i.value) * (i.dataset.count.startsWith('cash:') && prefs.money === 'toman' ? 10 : 1), source: i.dataset.gross ? 'scale' : 'hand', ...(i.dataset.gross ? { gross: Number(i.dataset.gross) } : {}) }));
        if (!lines.length) return toast('مقدار شمرده‌شده را وارد کنید.', 'error');
        busy(b, true);
        const r = await api('/api/books/counts', { method: 'POST', body: { lines } });
        toast(r.balanced ? 'شمارش با دفتر برابر است. ✓' : `${fa(r.lines.filter((l) => l.diff).length)} قلم اختلاف دارد.`, r.balanced ? 'ok' : 'error');
        return load();
      }
      if (b.hasAttribute('data-close-day')) {
        const ack = $$('[data-ack]:checked', box).map((i) => i.dataset.ack);
        busy(b, true);
        try {
          await api('/api/books/close', { method: 'POST', body: { day, ack, note: $('#clNote', box).value, password: $('#clPw', box).value } });
          toast(`روز ${jd(day)} بسته و امضا شد.`, 'ok');
          return load();
        } catch (err) {
          $('#clErr', box).textContent = err.message;
          busy(b, false);
          return;
        }
      }
      if (b.hasAttribute('data-verify')) {
        const r = await api(`/api/books/close/${day}/verify`);
        $('#clVer', box).innerHTML = String(html`<p class="${r.valid ? 'good' : 'bad'}">${r.valid ? `امضا معتبر است: ${r.signer} · ${jd(r.at.slice(0, 10))} ${timeFa(r.at)}` : `امضا یا محتوا دست خورده است (هش: ${r.hashOk ? 'درست' : 'نادرست'}، امضا: ${r.sigOk ? 'درست' : 'نادرست'})`}</p>`);
        return;
      }
      if (b.hasAttribute('data-print')) {
        const r = await api(`/api/books/close/${day}/verify`);
        const d = r.data;
        const w = window.open('', '_blank', 'width=800,height=900');
        if (!w) return toast('پنجره چاپ باز نشد.', 'error');
        w.document.write(`<!doctype html><html lang="fa" dir="rtl"><meta charset="utf-8"><title>بستن روز ${jd(day)}</title><style>body{font:14px/1.9 Tahoma,sans-serif;padding:28px;color:#111}h1{font-size:20px}table{border-collapse:collapse;width:100%;margin:8px 0}td,th{border:1px solid #999;padding:4px 8px;text-align:right}.m{font-family:monospace;font-size:11px;direction:ltr;word-break:break-all}</style><h1>گزارش بستن روز ${jd(day)}</h1><p>${store.me.brand?.shopName ?? ''}</p><table><tr><th>اسناد</th><td>${fa(d.entries)}</td></tr><tr><th>خرید از مشتریان</th><td>${R(d.totals.buys)}</td></tr><tr><th>فروش به مشتریان</th><td>${R(d.totals.sells)}</td></tr><tr><th>آبشده ورود / خروج</th><td>${G(d.totals.goldIn)} / ${G(d.totals.goldOut)}</td></tr></table><h3>وارسی‌ها</h3><table>${d.checks.map((c) => `<tr><td>${c.ok ? '✓' : '!'}</td><td>${c.key}</td><td>${c.warn || ''}</td></tr>`).join('')}</table>${d.note ? `<p>توضیح: ${d.note}</p>` : ''}<p>امضاکننده: ${d.signer.name} · ${new Date(d.at).toLocaleString('fa-IR', { timeZone: 'Asia/Tehran' })}</p><p>وضعیت امضا: ${r.valid ? 'معتبر' : 'نامعتبر'}</p><p class="m">hash ${v.closed.hash}</p><script>print()</script>`);
        return w.document.close();
      }
      if (b.hasAttribute('data-reopen')) {
        const reason = await confirmBox(`باز کردن روز ${jd(day)}`, 'پس از باز کردن، اسناد این روز دوباره قابل ثبت و ویرایش است. دلیل در تاریخچه می‌ماند.', { danger: true, reason: true, ok: 'باز کن' });
        if (!reason) return;
        await api(`/api/books/close/${day}/reopen`, { method: 'POST', body: { reason } });
        return load();
      }
    } catch (err) {
      toast(err.message, 'error');
    }
  });
  await load();
  return () => {
    if (scale) {
      scale.run = false;
      scale.reader?.cancel().catch(() => {});
      scale.port?.close().catch(() => {});
    }
  };
}
/* =============================== نقدینگی فردا =============================== */
async function forecastTab(box) {
  let day = addDays(today(), 1);
  const load = async () => {
    const f = await api(`/api/books/forecast?day=${day}`);
    const maxH = Math.max(1, ...f.hours);
    box.innerHTML = String(html`<div class="fc">
      <div class="cl-day"><label class="field">برای روز<input class="input ltr" id="fcDay" value="${jd(day)}"></label><span class="small">${f.weekday} · از ${fa(f.samples)} ${f.weekday} گذشته (${fa(f.activeSamples)} روز کاری)</span></div>
      ${f.enough ? '' : html`<p class="notice">داده کافی نیست: دست‌کم سه ${f.weekday} کاری لازم است تا پیش‌بینی معنا داشته باشد. اعداد زیر فقط از همین چند روز است.</p>`}
      <div class="fc-grid">
        <article class="tray fc-card"><h3>نقد لازم در صندوق</h3><b class="num">${R(f.cash.p90)}</b><small>با اطمینان ۹۰٪ · معمولاً ${R(f.cash.p50)} · بیشترین ${R(f.cash.max)}</small><p>الان در صندوق‌ها: <b>${R(f.have.cash)}</b></p>${f.short.cash ? html`<p class="bad">کمبود: ${R(f.short.cash)} — پیش از باز کردن مغازه تأمین کنید.</p>` : html`<p class="good">کافی است ✓</p>`}</article>
        <article class="tray fc-card"><h3>طلای آبشده برای فروش</h3><b class="num">${G(f.gold.p90)} گرم</b><small>معمولاً ${G(f.gold.p50)} گرم</small><p>الان: <b>${G(f.have.gold)} گرم</b></p>${f.short.gold ? html`<p class="bad">کمبود: ${G(f.short.gold)} گرم</p>` : html`<p class="good">کافی است ✓</p>`}</article>
        <article class="tray fc-card"><h3>سکه برای فروش</h3>${Object.keys(f.coins).length ? html`<ul>${Object.entries(f.coins).map(([c, n]) => html`<li><span>${COIN_TYPES[c]?.short ?? c}</span><b>${fa(n.p90)} عدد</b><small>موجود ${fa(f.have.coins[c] ?? 0)}${f.short.coins[c] ? html` · <em class="bad">کمبود ${fa(f.short.coins[c])}</em>` : ''}</small></li>`)}</ul>` : html`<p class="small">در این روزها سکه‌ای فروخته نشده است.</p>`}</article>
      </div>
      <section class="tray"><h3 class="bk-h">شلوغی ساعت‌به‌ساعت ${f.weekday}ها</h3><div class="fc-hours">${f.hours.map((n, h) => (h >= 8 && h <= 21 ? html`<div title="${fa(h)}:۰۰ · ${fa(n)} سند"><i style="height:${((n / maxH) * 100).toFixed(1)}%"></i><small>${fa(h)}</small></div>` : ''))}</div><p class="small">میانگین ${fa(f.docs)} سند در روز.</p></section>
      <section class="tray"><h3 class="bk-h">این پیش‌بینی چقدر درست بوده؟</h3>${f.backtest.days.length ? html`<p>${f.backtest.hitRate != null ? html`در <b>${fa(f.backtest.hitRate)}٪</b> از ${fa(f.backtest.days.length)} ${f.weekday} گذشته، نقد پیشنهادی کافی بوده است؛ خطای میانگین ${R(f.backtest.mae)}.` : ''}</p><table class="table-plain"><thead><tr><th>روز</th><th>پیشنهاد (۹۰٪)</th><th>واقعی</th><th></th></tr></thead><tbody>${f.backtest.days.map((t) => html`<tr><td>${jd(t.day)}</td><td class="num">${R(t.p90)}</td><td class="num">${R(t.actual)}</td><td>${t.covered ? '✓' : '✗'}</td></tr>`)}</tbody></table>` : html`<p class="small">برای سنجش دقت هنوز سابقه کافی نیست.</p>`}
      <p class="small">روش: از روزهای هم‌نام هفته در ۱۲ هفته اخیر (هفته‌های نزدیک‌تر وزن بیشتر)، بیشترین برداشت نقد، طلا و سکه پیش از رسیدن دریافت‌های همان روز حساب می‌شود.</p></section></div>`);
    $('#fcDay', box).addEventListener('change', (e) => {
      const d = parseDay(e.target.value);
      if (d) (day = d), load();
    });
  };
  await load();
}

/* =============================== هشدار نوسان =============================== */
async function riskTab(box) {
  const r = await api('/api/books/risk');
  const SEV = { high: 'بی‌پوشش', mid: 'نزدیک مرز', low: 'امن' };
  box.innerHTML = String(html`<div class="rk">
    <p class="small">گرم ۷۵۰ امروز ${R(r.p750)}${r.sample ? ' (قیمت نمونه)' : ''}. «پوشش» یعنی پول یا طلایی که از مشتری نزد شماست، تقسیم بر ارزش بدهی مخالفش. زیر ${fa(100 + r.marginPct)}٪ هشدار داده می‌شود.</p>
    ${r.items.length ? html`<ul class="rk-list">${r.items.map((x) => html`<li class="tray rk-row ${x.sev}"><div class="rk-p"><a href="/books/party/${x.party.id}" data-link><b>${x.party.label}</b></a><small>${x.kind === 'short' ? 'بدهکار جنسی با پول نزد ما' : x.kind === 'long' ? 'بدهکار مالی با طلای امانی نزد ما' : 'بدهکار جنسی بی‌وثیقه'}</small></div>
      <div><small>پوشش</small><b class="num">${x.kind === 'naked' ? '۰٪' : `${fa(Math.round(x.cover * 100))}٪`}</b></div>
      <div><small>قیمت شکست گرم ۷۵۰</small><b class="num">${x.breakP750 ? R(x.breakP750) : '—'}</b>${x.movePct != null ? html`<small>${x.movePct > 0 ? '▲' : '▼'} ${fa(Math.abs(x.movePct))}٪ تا مرز</small>` : ''}</div>
      <div class="rk-t"><span class="rk-sev">${SEV[x.sev]}</span><small>${x.text}</small></div></li>`)}</ul>` : html`<section class="empty tray"><p>هیچ مشتری‌ای بدهی جنسی یا مالیِ پوشش‌داده‌شده با کالای مخالف ندارد. ✓</p></section>`}</div>`);
}

/* =============================== شناسنامه شمش =============================== */
async function barsTab(box) {
  const vault = await api('/api/books/vault');
  let serial = vault.bars[0]?.serial ?? '';
  const draw = async () => {
    const cards = serial ? await api(`/api/books/bars/${encodeURIComponent(serial)}/cards`) : null;
    box.innerHTML = String(html`<div class="bc">
      <p class="small">هنگام ورود شمش، از روی و پشت آن داخل کادر عکس بگیرید. هنگام خروج یا هر وقت شک دارید دوباره عکس بگیرید تا با کارت ورود مقایسه شود. نتیجه کمکی است؛ سریال و دو عکس را کنار هم با چشم هم نگاه کنید.</p>
      <label class="field">شمش<select class="input" id="bcSerial"><option value="">— انتخاب —</option>${vault.bars.map((b) => html`<option value="${b.serial}" ${b.serial === serial ? 'selected' : ''}>${fa(b.serial)} · ${b.brand || ''} · ${b.weight ? G(b.weight) : '?'} گرم</option>`)}</select></label>
      ${serial ? html`<div class="bc-sides">${['front', 'back'].map((side) => {
        const e = cards.entry[side];
        const last = cards.checks.filter((c) => c.side === side).at(-1);
        return html`<article class="tray bc-side"><h3>${side === 'front' ? 'روی شمش' : 'پشت شمش'}</h3>
          <div class="bc-imgs"><figure>${e ? html`<img src="${e.image}" alt="کارت ورود">` : html`<div class="bc-empty">بدون کارت ورود</div>`}<figcaption>کارت ورود${e ? ` · ${jd(e.created_at.slice(0, 10))}` : ''}</figcaption></figure>${last ? html`<figure><img src="${last.image}" alt="آخرین وارسی"><figcaption>وارسی ${jd(last.created_at.slice(0, 10))} ${timeFa(last.created_at)}</figcaption></figure>` : ''}</div>
          ${last ? html`<p class="bc-v ${last.verdict}">${last.verdict === 'match' ? 'همان شمش است' : last.verdict === 'unsure' ? 'مطمئن نیست؛ با دقت بیشتر عکس بگیرید و با چشم مقایسه کنید' : 'با کارت ورود نمی‌خواند؛ شمش را کنار بگذارید و بررسی کنید'} · شباهت ${fa(Math.round(last.score * 100))}٪</p>` : ''}
          <label class="btn small ${e ? 'ghost' : ''} bc-cam">${e ? 'عکس وارسی' : 'عکس کارت ورود'}<input type="file" accept="image/*" capture="environment" data-side="${side}" data-kind="${e ? 'check' : 'entry'}" hidden></label>
          ${e ? html`<label class="chip bc-cam">کارت ورود تازه<input type="file" accept="image/*" capture="environment" data-side="${side}" data-kind="entry" hidden></label>` : ''}</article>`;
      })}</div>` : html`<p class="small">${vault.bars.length ? 'یک شمش را انتخاب کنید.' : 'شمشی در گاوصندوق نیست.'}</p>`}</div>`);
  };
  box.addEventListener('change', async (e) => {
    if (e.target.id === 'bcSerial') {
      serial = e.target.value;
      return draw();
    }
    const input = e.target.closest('input[type=file]');
    if (!input?.files?.[0]) return;
    try {
      toast('در حال پردازش عکس…');
      const fp = await fingerprint(input.files[0]);
      const r = await api(`/api/books/bars/${encodeURIComponent(serial)}/card`, { method: 'POST', body: { side: input.dataset.side, kind: input.dataset.kind, ...fp } });
      if (r.result) toast(r.result.verdict === 'match' ? `همان شمش است (${fa(Math.round(r.result.score * 100))}٪)` : r.result.verdict === 'unsure' ? 'نتیجه قطعی نیست؛ دوباره عکس بگیرید.' : 'با کارت ورود نمی‌خواند!', r.result.verdict === 'match' ? 'ok' : 'error');
      else toast('کارت ورود ثبت شد.', 'ok');
      draw();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
  await draw();
}
/** The face of a bar: central crop, 720 px JPEG, a 64-bit difference hash and a contrast-stretched 16×16 grey map. */
export async function fingerprint(file) {
  const bmp = await createImageBitmap(file);
  const cw = Math.round(bmp.width * 0.7), ch = Math.round(bmp.height * 0.7), sx = Math.round((bmp.width - cw) / 2), sy = Math.round((bmp.height - ch) / 2);
  const W = 720, H = Math.round((W * ch) / cw);
  const c = new OffscreenCanvas(W, H), x = c.getContext('2d');
  x.drawImage(bmp, sx, sy, cw, ch, 0, 0, W, H);
  const blob = await c.convertToBlob({ type: 'image/jpeg', quality: 0.82 });
  const image = await new Promise((res) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.readAsDataURL(blob);
  });
  const grey = (w, h) => {
    const s = new OffscreenCanvas(w, h), sx2 = s.getContext('2d');
    sx2.drawImage(c, 0, 0, w, h);
    const d = sx2.getImageData(0, 0, w, h).data;
    const g = [];
    for (let i = 0; i < d.length; i += 4) g.push(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
    return g;
  };
  const g9 = grey(9, 8);
  let bits = '';
  for (let r = 0; r < 8; r++) for (let q = 0; q < 8; q++) bits += g9[r * 9 + q] > g9[r * 9 + q + 1] ? '1' : '0';
  const dhash = BigInt(`0b${bits}`).toString(16).padStart(16, '0');
  const g16 = grey(16, 16);
  const lo = Math.min(...g16), hi = Math.max(...g16);
  const blocks = g16.map((v) => Math.round(((v - lo) / (hi - lo || 1)) * 255));
  return { image, dhash, blocks };
}

/* =============================== قیمت‌های قفل‌شده =============================== */
async function quotesTab(box) {
  let timer;
  const draw = async () => {
    const list = (await api('/api/books/quotes')).items;
    const ST = { open: 'باز', used: 'استفاده شد', expired: 'منقضی', cancelled: 'لغو' };
    box.innerHTML = String(html`<p class="small">قیمت را در میز معامله برای مشتری قفل کنید («قفل همین قیمت»). این فهرست همه قیمت‌های قفل‌شده و سرنوشت‌شان است.</p>
      ${list.length ? html`<table class="table-plain qt"><thead><tr><th>کد</th><th>کالا</th><th>قیمت</th><th>مشتری</th><th>مانده</th><th>وضعیت</th><th></th></tr></thead><tbody>${list.map((q) => html`<tr><td class="ltr-num">${q.code}</td><td>${q.dir === 'in' ? 'خرید' : 'فروش'} ${q.kind === 'coin' ? COIN_TYPES[q.coin]?.short : q.kind === 'fx' ? FX_CODES[q.fxCode] : TRADE_KINDS[q.kind]}</td><td class="num">${R(q.price)}</td><td>${q.party?.label ?? '—'}</td><td class="num" data-left="${q.status === 'open' ? q.expiresAt : ''}"></td><td><span class="qt-st ${q.status}">${ST[q.status]}</span>${q.docId ? html` <a href="/books/doc/${q.docId}" data-link>سند</a>` : ''}</td><td>${q.status === 'open' ? html`<button class="chip danger" data-cancel="${q.id}">لغو</button>` : ''}</td></tr>`)}</tbody></table>` : html`<section class="empty tray"><p>هنوز قیمتی قفل نشده است.</p></section>`}`);
    clearInterval(timer);
    const tick = () => {
      for (const td of $$('[data-left]', box)) {
        if (!td.dataset.left) continue;
        const s = Math.max(0, Math.round((Date.parse(td.dataset.left) - Date.now()) / 1000));
        td.textContent = s ? `${fa(Math.floor(s / 60))}:${fa(String(s % 60).padStart(2, '0'))}` : 'تمام';
      }
    };
    tick();
    timer = setInterval(tick, 1000);
  };
  box.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-cancel]');
    if (!b) return;
    await api(`/api/books/quotes/${b.dataset.cancel}/cancel`, { method: 'POST' }).catch((err) => toast(err.message, 'error'));
    draw();
  });
  await draw();
  return () => clearInterval(timer);
}
