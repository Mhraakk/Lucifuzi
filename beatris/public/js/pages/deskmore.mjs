// The base edition's other screens: روزنگار (everything that happened on a day, line by line, with the payment
// method and each customer's balance right after), گاوصندوق (what is physically held vs what customers hold with us,
// with a physical count), the sealed-bar registry (serial → who, when, where), and bank reconciliation.
import { html, raw, fa, api, store, toast, navigate, actions, $, $$, busy } from '../core.mjs';
import * as B from '../books.mjs';
import * as TR from '../trade.mjs';
import { TRADE_COINS as COIN_TYPES, shownCoins } from '../coins.mjs';
import { booksPrefs, R, G, jd, jdLong, jdInput, parseDay, today, addDays, timeFa, modal, confirmBox, balChips, unitLabel, unitAmt, describeLine, lineVerb, exportButtons, wireExport, statusChip } from '../bk.mjs';
import { booksNav } from './books.mjs';
import { hasNumber, TOLERANCES, SECTIONS, SECTION_IDS, sectionsOf, lineSection, paySection } from '../daysearch.mjs';
import { sortBy, wireSorts } from '../sorting.mjs';
import { meltDialog, countDialog } from './bookops.mjs';

const money = (v) => R(v);
const sg = (n) => (n < 0 ? raw(`<bdi dir="ltr">−${fa(-n)}</bdi>`) : fa(n));
const sgm = (v) => (v < 0 ? raw(`<bdi dir="ltr">−${R(-v).replace(' ریال', '')}</bdi> ریال`) : R(v));
const payText = (p) => [B.payMethod(p.method)?.label ?? p.method, p.account && `(${p.account})`, p.ref && `پیگیری ${fa(p.ref)}`, p.card && `کارت …${fa(p.card)}`, p.chequeNo && `چک ${fa(p.chequeNo)}`, p.due && `سررسید ${jd(p.due)}`].filter(Boolean).join(' ');
const partyLink = (p) => (p ? html`<a href="/books/party/${p.id}" data-link>${p.label}</a>` : html`<span class="small">مشتری گذری</span>`);

/* ---------------- روزنگار ---------------- */
const FILTERS = [
  ['all', 'همه'],
  ['buy', 'خرید'],
  ['sell', 'فروش'],
  ['goods', 'جنسی'],
  ['money', 'فقط وجه'],
  ['hawala', 'حواله'],
  ['convert', 'تبدیل'],
  ['melt', 'ذوب'],
  ['other', 'درآمد و هزینه'],
  ['writeoff', 'سوخت'],
  ['void', 'باطل'],
];
const entryTags = (e) => {
  const t = new Set();
  if (e.status === 'void') t.add('void');
  if (e.type === 'hawala') t.add('hawala');
  if (e.type === 'convert') t.add('convert');
  if (e.type === 'transform') t.add('melt');
  if (e.type === 'writeoff') t.add('writeoff');
  if (['income', 'expense', 'transfer'].includes(e.type)) t.add('other');
  for (const l of e.lines) {
    if (e.type !== 'trade') continue;
    if (!l.priced) t.add('goods');
    else t.add(l.dir === 'in' ? 'buy' : 'sell');
  }
  if (e.type === 'trade' && !e.lines.length) t.add('money');
  return t;
};
// the shape sectionsOf() reads (spec 0027)
const asDoc = (e) => ({ type: e.type, balances: e.balances ?? [], calc: { lines: e.lines, payments: e.payments, hawala: e.hawala, convert: e.convert, writeoff: e.writeoff, credit: e.credit } });
const inSec = (sec) => (l) => sec === 'all' || lineSection(l.kind) === sec;
const paysIn = (sec) => (p) => sec === 'all' || paySection(p.method) === sec;
/** The figures a row is sorted by, inside the section shown. */
function sortKeys(e, sec) {
  const lines = e.lines.filter(inSec(sec));
  const pays = e.payments.filter(paysIn(sec));
  const amount = Math.max(Math.abs(e.net ?? 0) * (sec === 'all' ? 1 : 0), lines.reduce((s, l) => s + (l.value || l.total || 0), 0), pays.reduce((s, p) => s + p.value, 0), Math.abs(e.convert?.value ?? 0), e.writeoff?.unit === 'IRR' ? Math.abs(e.writeoff.amount) : 0);
  const weight = lines.reduce((s, l) => s + (l.kind === 'melt' || l.kind === 'bar' || l.kind === 'used' ? l.eq750 || l.g750 || 0 : 0), 0) + (e.melt?.inputs ?? 0);
  const count = lines.reduce((s, l) => s + (l.kind === 'coin' ? l.count || 0 : 0), 0) + (e.hawala?.unit?.startsWith('COIN:') ? e.hawala.amount : 0);
  return { time: e.at ?? '', amount, weight, count, party: e.party?.label ?? e.hawala?.fromName ?? '', no: e.no ?? 0 };
}
const SORTS = [
  ['time', 'زمان (اول روز)', 'time', 1],
  ['time-desc', 'زمان (آخر روز)', 'time', -1],
  ['amount-desc', 'مبلغ (بیشترین)', 'amount', -1],
  ['amount', 'مبلغ (کمترین)', 'amount', 1],
  ['weight-desc', 'وزن ۷۵۰ (بیشترین)', 'weight', -1],
  ['weight', 'وزن ۷۵۰ (کمترین)', 'weight', 1],
  ['count-desc', 'تعداد سکه (بیشترین)', 'count', -1],
  ['party', 'مشتری (الفبا)', 'party', 1],
  ['no', 'شماره سند', 'no', 1],
];
/** The day's tiles inside one section: what came in and went out, bought and sold, and the result of that unit. */
function sectionTiles(entries, sec, t) {
  const live = entries.filter((e) => e.status === 'final');
  const tiles = [];
  const add = (b, label, cls = '') => tiles.push({ b, label, cls });
  const lines = live.filter((e) => e.type === 'trade').flatMap((e) => e.lines.filter(inSec(sec)));
  const buys = lines.filter((l) => l.priced && l.dir === 'in').reduce((s, l) => s + l.value, 0);
  const sells = lines.filter((l) => l.priced && l.dir === 'out').reduce((s, l) => s + l.value, 0);
  add(fa(live.filter((e) => sectionsOf(asDoc(e)).has(sec)).length), 'سند قطعی');
  if (sec !== 'money') {
    add(money(buys).replace(' ریال', ''), 'خرید (ریال)');
    add(money(sells).replace(' ریال', ''), 'فروش (ریال)');
  }
  const by = t.realizedBy ?? {};
  const realized = (pred) => Object.entries(by).filter(([k]) => pred(k)).reduce((s, [, v]) => s + v, 0);
  if (sec === 'melt' || sec === 'bar') {
    const io = (kind, dir) => B.r3(lines.filter((l) => l.kind === kind && l.dir === dir).reduce((s, l) => s + l.eq750, 0));
    if (sec === 'melt') add(html`<span class="dy-io"><em>ورود ${G(io('melt', 'in'))}</em><em>خروج ${G(io('melt', 'out'))}</em></span>`, 'آبشده (گرم ۷۵۰)');
    else add(`${fa(lines.filter((l) => l.dir === 'in').length)} / ${fa(lines.filter((l) => l.dir === 'out').length)}`, 'شمش ورود / خروج');
    if (sec === 'melt' && t.melts?.n) add(html`<span class="dy-io"><em>${G(t.melts.inputs)} → ${G(t.melts.outputs)}</em><em>${t.melts.wastage < 0 ? 'اضافه' : 'افت'} ${G(Math.abs(t.melts.wastage))}</em></span>`, `ذوب (${fa(t.melts.n)} سند، گرم ۷۵۰)`);
    if (store.isAdmin()) add(sgm(realized((k) => k === 'G750')), sec === 'bar' ? 'سود/زیان طلا امروز (آبشده و شمش با هم)' : 'سود/زیان طلا امروز', realized((k) => k === 'G750') < 0 ? 'bad' : 'good');
  } else if (sec === 'coin') {
    const net = {};
    for (const l of lines) net[l.coin] = (net[l.coin] ?? 0) + (l.dir === 'in' ? l.count : -l.count);
    const rows = Object.entries(net).filter(([, n]) => n);
    add(rows.length ? html`<span class="dy-io">${rows.map(([k, n]) => html`<em>${COIN_TYPES[k]?.short} ${n > 0 ? 'ورود' : 'خروج'} ${fa(Math.abs(n))}</em>`)}</span>` : '—', 'سکه (خالص)');
    if (store.isAdmin()) add(sgm(realized((k) => k.startsWith('COIN:'))), 'سود/زیان سکه امروز', realized((k) => k.startsWith('COIN:')) < 0 ? 'bad' : 'good');
  } else if (sec === 'fx') {
    const net = {};
    for (const l of lines) net[l.code] = (net[l.code] ?? 0) + (l.dir === 'in' ? l.amt : -l.amt);
    const rows = Object.entries(net).filter(([, n]) => n);
    add(rows.length ? html`<span class="dy-io">${rows.map(([k, n]) => html`<em>${TR.FX_CODES[k]} ${n > 0 ? 'ورود' : 'خروج'} ${fa(Math.abs(n))}</em>`)}</span>` : '—', 'ارز (خالص)');
    if (store.isAdmin()) add(sgm(realized((k) => k.startsWith('FX:'))), 'سود/زیان ارز امروز', realized((k) => k.startsWith('FX:')) < 0 ? 'bad' : 'good');
  } else if (sec === 'money') {
    const pays = live.flatMap((e) => e.payments.filter(paysIn('money')));
    add(money(pays.filter((p) => p.dir === 'in').reduce((s, p) => s + p.value, 0)).replace(' ریال', ''), 'دریافت (ریال)', 'good');
    add(money(pays.filter((p) => p.dir === 'out').reduce((s, p) => s + p.value, 0)).replace(' ریال', ''), 'پرداخت (ریال)', 'bad');
  }
  return tiles;
}

export async function dayPage(root) {
  await booksPrefs();
  const qs = new URLSearchParams(location.search);
  const day = parseDay(qs.get('day') ?? '') ?? today();
  let r;
  try {
    r = await api(`/api/books/daybook?day=${day}`);
  } catch (e) {
    root.innerHTML = String(html`${booksNav('day')}<div class="notice">${e.message}</div>`);
    return;
  }
  const t = r.totals;
  const lsSort = (() => {
    try {
      return localStorage.getItem('beatris.sort.day');
    } catch {
      return null;
    }
  })();
  const state = { f: qs.get('f') ?? 'all', sec: SECTION_IDS.has(qs.get('sec') ?? '') ? qs.get('sec') : 'all', sort: SORTS.some(([k]) => k === qs.get('sort')) ? qs.get('sort') : SORTS.some(([k]) => k === lsSort) ? lsSort : 'time', q: '' };
  const go = (d) => navigate(`/books/day?day=${d}${state.sec !== 'all' ? `&sec=${state.sec}` : ''}`);
  // the view lives in the URL, so it can be bookmarked or sent (spec 0027)
  const keepUrl = () => {
    const p = new URLSearchParams(location.search);
    for (const [k, v, d] of [['sec', state.sec, 'all'], ['f', state.f, 'all'], ['sort', state.sort, 'time']]) v === d ? p.delete(k) : p.set(k, v);
    history.replaceState(history.state, '', `${location.pathname}${p.size ? `?${p}` : ''}`);
  };
  const coinTot = Object.entries(t.coins).filter(([, n]) => n);
  const fxTot = Object.entries(t.fx).filter(([, n]) => n);
  const moneyRows = B.PAY_METHODS.map((m) => [m, t.money[`${m.id}:in`] ?? 0, t.money[`${m.id}:out`] ?? 0]).filter(([, a, b]) => a || b);
  const allTiles = () => html`
      <div><b>${fa(t.docs)}</b><span>سند قطعی</span></div>
      <div><b>${money(t.buys).replace(' ریال', '')}</b><span>خرید از مشتریان (ریال)</span></div>
      <div><b>${money(t.sells).replace(' ریال', '')}</b><span>فروش به مشتریان (ریال)</span></div>
      <div><b class="dy-io"><em>ورود ${G(t.goldIn)}</em><em>خروج ${G(t.goldOut)}</em></b><span>آبشده (گرم ۷۵۰)</span></div>
      <div><b class="dy-io">${coinTot.length ? coinTot.map(([k, n]) => html`<em>${COIN_TYPES[k]?.short} ${n > 0 ? 'ورود' : 'خروج'} ${fa(Math.abs(n))}</em>`) : '—'}</b><span>سکه (خالص)</span></div>
      <div><b>${fa(t.bars.in)} / ${fa(t.bars.out)}</b><span>شمش ورود / خروج</span></div>
      ${fxTot.length ? html`<div><b class="dy-io">${fxTot.map(([k, n]) => html`<em>${TR.FX_CODES[k]} ${n > 0 ? 'ورود' : 'خروج'} ${fa(Math.abs(n))}</em>`)}</b><span>ارز</span></div>` : ''}
      ${t.melts?.n ? html`<div><b class="dy-io"><em>${G(t.melts.inputs)} → ${G(t.melts.outputs)}</em><em>${t.melts.wastage < 0 ? 'اضافه' : 'افت'} ${G(Math.abs(t.melts.wastage))}</em></b><span>ذوب (گرم ۷۵۰)</span></div>` : ''}
      ${store.isAdmin() ? html`<div class="${t.realized < 0 ? 'bad' : 'good'}"><b>${sgm(t.realized)}</b><span>سود/زیان تحقق‌یافته امروز (میانگین موزون)</span></div>` : ''}`;
  root.innerHTML = String(html`${booksNav('day')}
    <div class="bk-head dy-head"><div><h1>روزنگار</h1><span class="small">${jdLong(day)} · همه رویدادهای روز با مانده هر مشتری پس از همان سند · مبالغ به ریال</span></div>
      <div class="dy-nav"><button class="iconbtn" data-act="prev" aria-label="روز قبل">›</button><input class="input ltr sm" id="dday" value="${jdInput(day)}" aria-label="تاریخ"><button class="iconbtn" data-act="next" aria-label="روز بعد" ${day >= today() ? 'disabled' : ''}>‹</button>${day !== today() ? html`<button class="chip" data-act="today">امروز</button>` : ''}</div></div>
    <nav class="chips dy-secs" id="dysec" aria-label="بخش">${SECTIONS.map(([k, l]) => html`<button class="chip" data-sec="${k}" aria-pressed="${state.sec === k}">${l}</button>`)}</nav>
    <div class="printable pr-sheet"><h2 class="pr-only" id="dyprint">روزنگار ${jdLong(day)}</h2><div class="stats bk-stats dy-stats" id="dytiles"></div>
    <section class="tray dy-money" id="dymoney" ${moneyRows.length ? '' : 'hidden'}><h3 class="bk-h">گردش وجه به تفکیک روش</h3><div class="dy-methods">${moneyRows.map(([m, a, b]) => html`<div><span>${m.label}</span>${a ? html`<b class="in">+${money(a)}</b>` : ''}${b ? html`<b class="out">−${money(b)}</b>` : ''}</div>`)}</div></section>
    <div class="dy-tools"><div class="chips" id="dyf">${FILTERS.map(([k, l]) => html`<button class="chip" data-f="${k}" aria-pressed="${state.f === k}">${l}</button>`)}</div>
      <input class="input" id="dyq" type="search" value="${qs.get('find') ?? ''}" placeholder="نام، شماره سند، سریال… یا یک عدد برای همه روزها (۶۰۰ میلیون تومان)" aria-label="جستجو در روزنگار؛ با یک عدد، همه روزها">
      <label class="dy-sort"><span>ترتیب</span><select class="input sm" id="dysort" aria-label="ترتیب ردیف‌ها">${SORTS.map(([k, l]) => html`<option value="${k}" ${state.sort === k ? 'selected' : ''}>${l}</option>`)}</select></label>${exportButtons('dy')}</div>
    <p class="small dy-all" id="dyall" hidden></p>
    <section class="tray dy-find" id="dyfind" hidden aria-live="polite"></section>
    <ol class="dy-list" id="dyl"></ol></div>`);

  const list = $('#dyl', root);
  const secName = () => SECTIONS.find(([k]) => k === state.sec)?.[1] ?? '';
  /** The rows shown: the section, the type filter and the words; in the chosen order. */
  function shown() {
    const q = TR.normName(state.q);
    const rows = r.entries.filter(
      (e) =>
        (state.sec === 'all' || sectionsOf(asDoc(e)).has(state.sec)) &&
        (state.f === 'all' || entryTags(e).has(state.f)) &&
        (!q || TR.normName([e.party?.label, e.no, e.track, e.hawala?.fromName, e.hawala?.toName, e.note, e.category, ...e.lines.map((l) => l.serial)].join(' ')).includes(q)),
    );
    const [, , key, dir] = SORTS.find(([k]) => k === state.sort) ?? SORTS[0];
    const keys = new Map(rows.map((e) => [e, sortKeys(e, state.sec)]));
    return key === 'time' && dir === 1 ? rows : sortBy(rows, (e) => keys.get(e)[key], dir);
  }
  function draw() {
    const rows = shown();
    $('#dytiles', root).innerHTML = String(state.sec === 'all' ? allTiles() : html`${sectionTiles(r.entries, state.sec, t).map((x) => html`<div class="${x.cls}"><b>${x.b}</b><span>${x.label}</span></div>`)}`);
    $('#dymoney', root).hidden = !moneyRows.length || !['all', 'money'].includes(state.sec);
    $('#dyprint', root).textContent = `روزنگار ${jdLong(day)}${state.sec !== 'all' ? ` · ${secName()}` : ''}`;
    list.innerHTML = rows.length
      ? rows.map((e, i) => String(entry(e, i))).join('')
      : String(html`<li class="dy-empty">${r.entries.length ? `موردی${state.sec !== 'all' ? ` در بخش ${secName()}` : ''} با این فیلتر نیست.` : `در ${jd(day)} سندی ثبت نشده است.`}</li>`);
  }
  const verbOf = (e, l) => (e.type === 'transform' ? (l.dir === 'out' ? 'به ذوب' : 'از ذوب') : lineVerb(l));
  function entry(e, i) {
    const label = B.DOC_TYPES[e.type]?.label ?? e.type;
    // inside a section, a document shows only that section's lines and payments; the rest is summed in one line
    const lines = e.lines.filter(inSec(state.sec));
    const pays = e.payments.filter(paysIn(state.sec));
    const hidden = e.lines.length - lines.length + e.payments.length - pays.length;
    return html`<li class="dy-e ${e.status}" style="--i:${Math.min(i, 12)}">
      <div class="dy-time"><b>${timeFa(e.at)}</b><span>${e.by ?? ''}</span></div>
      <div class="dy-card">
        <div class="dy-top"><a class="dy-no" href="/books/doc/${e.id}" data-link>${label}</a><a class="dy-track ltr-num" href="/books/trace?q=${e.track}${state.sec !== 'all' ? `&sec=${state.sec}` : ''}" data-link title="رهگیری">${e.track}</a>${e.version > 1 ? html`<span class="bk-st">نسخه ${fa(e.version)}</span>` : ''}${e.status !== 'final' ? statusChip(e.status) : ''}${e.type !== 'hawala' ? html`<span class="dy-who">${partyLink(e.party)}${e.party?.group ? html`<em>${e.party.group}</em>` : ''}</span>` : ''}</div>
        ${e.type === 'hawala' && e.hawala ? html`<p class="dy-l"><span class="dk-tag">حواله</span> ${unitAmt(e.hawala.unit, e.hawala.amount)} از حساب <b>${e.hawala.fromName}</b> به حساب <b>${e.hawala.toName}</b></p>` : ''}
        ${e.type === 'convert' && e.convert ? html`<p class="dy-l"><span class="dk-tag">تبدیل</span> ${e.convert.amount > 0 ? 'بدهی' : 'طلب'} ${unitAmt(e.convert.unit, Math.abs(e.convert.amount))} به ریال${e.convert.mazaneh ? html` روی مظنه ${money(e.convert.mazaneh)}` : e.convert.price ? html` با نرخ ${money(e.convert.price)}` : ''} = <b>${money(Math.abs(e.convert.value))}</b></p>` : ''}
        ${e.type === 'writeoff' && e.writeoff ? html`<p class="dy-l"><span class="dk-tag">${e.writeoff.amount > 0 ? 'سوخت' : 'بخشودگی'}</span> ${unitAmt(e.writeoff.unit, Math.abs(e.writeoff.amount))} ${e.writeoff.amount > 0 ? 'از بدهی مشتری بخشیده شد' : 'از طلب مشتری رها شد'}</p>` : ''}
        ${e.type === 'trade' || e.type === 'transform'
          ? lines.map((l) => html`<p class="dy-l ${l.dir} ${l.priced ? '' : 'goods'}"><span class="dk-tag">${verbOf(e, l)}</span> <b>${TR.TRADE_KINDS[l.kind]}${l.kind === 'coin' ? ` ${COIN_TYPES[l.coin]?.short ?? ''}` : ''}</b> ${describeLine(l)}${l.src?.conditional ? ' · شرطی (منتظر آزمایشگاه)' : ''}${l.assay ? ` · عیار آزمایشگاه ${fa(l.assay.from)}←${fa(l.assay.to)}` : ''}${l.kind === 'melt' && l.priced && l.eq750 ? html` · هر گرم ۷۵۰: ${money(B.rnd(l.value / l.eq750))}` : ''}${l.priced ? html` → <strong>${money(l.value)}</strong>` : ''}</p>`)
          : !['hawala', 'convert', 'writeoff'].includes(e.type) ? html`<p class="dy-l"><span class="dk-tag">${label}</span> ${e.category ? html`<b>${e.category}</b> ` : ''}${e.lines.length ? `${fa(e.lines.length)} ردیف` : ''}${e.net ? html` · خالص ${money(Math.abs(e.net))}` : ''}${e.balances?.length ? html` · ${e.balances.map((b) => html`<span class="dy-bal">${b.acct === 'gold' ? `طلا ${G(b.amt)} گرم` : b.acct.startsWith('coin:') ? `${COIN_TYPES[b.acct.slice(5)]?.short ?? ''} ${fa(b.amt)}` : b.acct.startsWith('bar:') ? `شمش ${fa(b.acct.slice(4))} ${b.amt > 0 ? 'ورود' : 'خروج'}` : b.acct.startsWith('fx:') ? `${TR.FX_CODES[b.acct.slice(3)] ?? ''} ${fa(b.amt)}` : `${money(b.amt)}`}</span> `)}` : ''}</p>` : ''}
        ${e.melt ? html`<p class="small dy-credit">ذوب: ${G(e.melt.inputs)} گرم ۷۵۰ رفت، ${G(e.melt.outputs)} برگشت · ${e.melt.wastage < 0 ? 'اضافه' : 'افت'} <b>${G(Math.abs(e.melt.wastage))}</b>${e.melt.fee ? html` · اجرت ${money(e.melt.fee)}` : ''}</p>` : ''}
        ${pays.length ? html`<div class="dy-pays">${pays.map((p) => html`<span class="dy-pay ${p.dir}">${p.dir === 'in' ? 'دریافت' : 'پرداخت'} ${payText(p)} <b>${money(p.value)}</b></span>`)}</div>` : ''}
        ${hidden ? html`<p class="small dy-more">${fa(hidden)} ردیف دیگر این سند در بخش‌های دیگر است.</p>` : ''}
        ${e.type === 'trade' && e.credit && ['all', 'money'].includes(state.sec) ? html`<p class="small dy-credit">${e.credit > 0 ? 'به حساب بدهی مشتری رفت' : 'به حساب طلب مشتری رفت'}: <b>${money(Math.abs(e.credit))}</b></p>` : ''}
        ${e.note ? html`<p class="small">یادداشت: ${e.note}</p>` : ''}
        ${Object.entries(e.after).length ? html`<div class="dy-after">${Object.entries(e.after).map(([pid, b]) => html`<div><span>مانده ${e.type === 'hawala' ? (pid === e.hawala?.from ? e.hawala.fromName : e.hawala?.toName) : e.party?.name ?? ''} پس از این سند</span>${balChips(b)}</div>`)}</div>` : ''}
      </div></li>`;
  }
  draw();
  $('#dyf', root).addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-f]');
    if (!b) return;
    state.f = b.dataset.f;
    $$('[data-f]', root).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    keepUrl();
    draw();
  });
  $('#dysec', root).addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-sec]');
    if (!b) return;
    state.sec = b.dataset.sec;
    $$('[data-sec]', root).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    keepUrl();
    draw();
    // the number search follows the section too
    if (!findBox.hidden) find($('#dyq', root).value);
  });
  $('#dysort', root).addEventListener('change', (ev) => {
    state.sort = ev.target.value;
    try {
      localStorage.setItem('beatris.sort.day', state.sort);
    } catch {
      /* storage unavailable: the URL keeps it */
    }
    keepUrl();
    draw();
  });
  // a number in the box searches every day (spec 0023); words alone still filter the day shown
  const finder = { tol: null, unit: null, timer: 0, seq: 0 };
  const findBox = $('#dyfind', root);
  const fig = (u, v) => (u === 'IRR' || u === 'RATE' ? R(Math.round(v)) : u === 'G' ? `${G(v)} گرم` : u === 'MQ' ? `${G(v)} مثقال` : fa(v));
  async function find(q) {
    const seq = ++finder.seq;
    const p = new URLSearchParams({ q });
    if (finder.tol !== null) p.set('tol', finder.tol);
    if (finder.unit) p.set('unit', finder.unit);
    if (state.sec !== 'all') p.set('sec', state.sec);
    let r;
    try {
      r = await api(`/api/books/daybook/find?${p}`);
    } catch (e) {
      if (seq === finder.seq) findBox.innerHTML = String(html`<p class="small">${e.message}</p>`);
      return;
    }
    if (seq !== finder.seq) return;
    const free = r.bands.some((b) => (b.u === 'IRR' || b.u === 'RATE') && !b.typedUnit);
    const bandText = (b) => (b.lo === b.hi || r.tol === 0 ? `دقیقاً ${fig(b.u, b.target)}` : `${fig(b.u, b.lo)} تا ${fig(b.u, b.hi)}`);
    findBox.innerHTML = String(html`<div class="dy-find-h"><h3 class="bk-h">این عدد در همه روزها${r.sec ? ` · فقط بخش ${secName()}` : ''}</h3>
        <p class="small">${r.bands.map((b) => html`<span class="dy-band">«${fa(b.said)}»${b.money && !b.typedUnit ? ` به ${b.money === 'toman' ? 'تومان' : 'ریال'}` : ''}: <b>${bandText(b)}</b></span>`)}${r.price ? ' · فقط مظنه و قیمت‌ها' : ''}</p>
        <div class="chips" role="group" aria-label="دقت">${TOLERANCES.map((t) => html`<button class="chip" data-tol="${t}" aria-pressed="${r.tol === t}">${t ? `±${fa(t)}٪` : 'دقیق'}</button>`)}</div>
        ${free ? html`<div class="chips" role="group" aria-label="واحد عدد">${[['rial', 'ریال'], ['toman', 'تومان']].map(([k, l]) => html`<button class="chip" data-unit="${k}" aria-pressed="${r.bands.find((b) => b.money)?.money === k}">${l}</button>`)}</div>` : ''}
        ${r.words.length ? html`<p class="small">فقط اسنادی که این کلمه‌ها را دارند: ${r.words.map((w) => html`<b class="dy-word">${w}</b> `)}</p>` : ''}
        ${r.limited ? html`<p class="small">روزهای گذشته را مدیر می‌بیند؛ این نتیجه فقط امروز است.</p>` : ''}</div>
      ${r.items.length ? r.items.map((g) => html`<div class="dy-find-day"><h4><a href="/books/day?day=${g.day}${state.sec !== 'all' ? `&sec=${state.sec}` : ''}" data-link>${jdLong(g.day)}</a></h4><ul>${g.docs.map((d) => html`<li class="dy-fr ${d.status}">
          <span class="dy-fr-t">${d.at ? timeFa(d.at) : ''}</span>
          <span class="dy-fr-d"><a href="/books/doc/${d.id}" data-link>${d.typeLabel}</a> <a class="ltr-num small" href="/books/trace?q=${d.track}${state.sec !== 'all' ? `&sec=${state.sec}` : ''}" data-link>${d.track}</a> ${d.status !== 'final' ? html`<span class="bk-st void">${d.superseded ? 'جایگزین‌شده با اصلاحیه' : 'باطل'}</span>` : ''}<br><span>${d.party?.label ?? 'مشتری گذری'}</span> · <span class="small">${d.summary}</span></span>
          <span class="dy-fr-m">${d.match.label}<b>${fig(d.match.unit, d.match.value)}</b><small>${d.match.pct === 0 ? 'دقیقاً همین عدد' : `${fa(String(d.match.pct).replace('.', '٫'))}٪ ${d.match.diff > 0 ? 'بیشتر' : 'کمتر'}`}</small></span></li>`)}</ul></div>`) : html`<p class="small">در این بازه رقمی${r.sec ? ` در بخش ${secName()}` : ''} پیدا نشد.${r.tol < 10 ? ' دقت را بازتر کنید.' : ''}${free ? ' یا واحد را عوض کنید.' : ''}${r.sec ? ' یا بخش «همه» را بزنید.' : ''}</p>`}
      <p class="small dy-find-f">${fa(r.total)} سند${r.total > r.shown ? ` (${fa(r.shown)} نمایش داده شد)` : ''} · در ${fa(r.searched.docs)} سند و ${fa(r.searched.figures)} رقم · ${fa(r.ms)} میلی‌ثانیه</p>`);
  }
  function onQuery(v, now = false) {
    state.q = v;
    clearTimeout(finder.timer);
    // the same words in the whole book, with any clue (spec 0032)
    const all = $('#dyall', root);
    all.hidden = !v.trim();
    if (v.trim()) all.innerHTML = String(html`<a href="/books/find?q=${encodeURIComponent(v.trim())}${state.sec !== 'all' ? `&sec=${state.sec}` : ''}" data-link>«${v.trim()}» را در همه دفتر با سرنخ‌یاب بگرد ←</a>`);
    if (hasNumber(v)) {
      findBox.hidden = false;
      state.q = ''; // the day list stays whole under the all-days results
      draw();
      finder.timer = setTimeout(() => find(v), now ? 0 : 250);
    } else {
      findBox.hidden = true;
      findBox.innerHTML = '';
      draw();
    }
  }
  $('#dyq', root).addEventListener('input', (ev) => onQuery(ev.target.value));
  $('#dyq', root).addEventListener('keydown', (ev) => ev.key === 'Enter' && onQuery(ev.target.value, true));
  findBox.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-tol],[data-unit]');
    if (!b) return;
    if (b.dataset.tol !== undefined) finder.tol = Number(b.dataset.tol);
    if (b.dataset.unit) finder.unit = b.dataset.unit;
    find($('#dyq', root).value);
  });
  if (qs.get('find')) {
    onQuery(qs.get('find'), true);
    findBox.scrollIntoView({ block: 'start' }); // from Ctrl+K: the answer, not the day's tiles, comes first
  }
  $('#dday', root).addEventListener('change', (ev) => {
    const d = parseDay(ev.target.value);
    if (d) go(d);
    else toast('تاریخ را مثل ۱۴۰۵/۰۷/۰۶ وارد کنید.', 'error');
  });
  const map = { prev: () => go(addDays(day, -1)), next: () => go(addDays(day, 1)), today: () => go(today()) };
  // the export is what is shown: the section, the filter, the words and the order
  const exportRows = () =>
    shown().flatMap((e) => {
      const base = { time: timeFa(e.at), doc: e.track, status: e.status === 'final' ? 'قطعی' : 'باطل', party: e.type === 'hawala' ? `${e.hawala?.fromName} ← ${e.hawala?.toName}` : e.party?.label ?? 'گذری', by: e.by ?? '' };
      const out = e.lines.filter(inSec(state.sec)).map((l) => ({ ...base, what: e.type === 'trade' || e.type === 'transform' ? `${verbOf(e, l)} ${TR.TRADE_KINDS[l.kind]}` : B.DOC_TYPES[e.type]?.label, weight: l.weight || '', fineness: l.fineness || '', eq750: l.eq750 || '', mesghal: l.mesghal || '', count: l.count || '', mazaneh: l.mazaneh || l.impliedMazaneh || '', serial: l.serial ?? '', amount: l.priced ? l.value : '', method: '', ref: '' }));
      if (e.hawala) out.push({ ...base, what: `حواله ${unitLabel(e.hawala.unit)}`, count: e.hawala.amount });
      if (e.convert) out.push({ ...base, what: `تبدیل ${unitLabel(e.convert.unit)}`, count: e.convert.amount, amount: e.convert.value });
      if (e.writeoff) out.push({ ...base, what: `${e.writeoff.amount > 0 ? 'سوخت' : 'بخشودگی'} ${unitLabel(e.writeoff.unit)}`, count: e.writeoff.unit === 'IRR' ? '' : e.writeoff.amount, amount: e.writeoff.unit === 'IRR' ? e.writeoff.amount : '' });
      if (e.melt) out.push({ ...base, what: `افت ذوب (گرم ۷۵۰)`, eq750: e.melt.wastage });
      for (const p of e.payments.filter(paysIn(state.sec))) out.push({ ...base, what: p.dir === 'in' ? 'دریافت وجه' : 'پرداخت وجه', amount: p.dir === 'in' ? p.value : -p.value, method: B.payMethod(p.method)?.label, ref: [p.ref, p.card, p.chequeNo, p.account].filter(Boolean).join(' ') });
      if (!out.length) out.push({ ...base, what: [B.DOC_TYPES[e.type]?.label, e.category].filter(Boolean).join(' · ') });
      return out;
    });
  wireExport(map, 'dy', () => `roznegar-${day}${state.sec !== 'all' ? `-${state.sec}` : ''}`, exportRows, [['time', 'ساعت'], ['doc', 'سند'], ['status', 'وضعیت'], ['party', 'طرف حساب'], ['what', 'شرح'], ['weight', 'وزن'], ['fineness', 'عیار'], ['eq750', 'معادل ۷۵۰'], ['mesghal', 'مثقال'], ['count', 'تعداد/مقدار'], ['mazaneh', 'مظنه (ریال)'], ['serial', 'سریال'], ['amount', 'مبلغ (ریال)'], ['method', 'روش'], ['ref', 'پیگیری/حساب'], ['by', 'کاربر']], `روزنگار ${jd(day)}`);
  actions(root, map);
}

/* ---------------- گاوصندوق ---------------- */
export async function vaultPage(root) {
  await booksPrefs();
  const [v, acc] = await Promise.all([api('/api/books/vault'), api('/api/books/accounts')]);
  const admin = store.isAdmin();
  const P = v.prices.price;
  const accName = Object.fromEntries(acc.items.map((a) => [a.id, a.title]));
  const coins = Object.keys(COIN_TYPES).filter((k) => v.coins[k] || v.custody[`COIN:${k}`]);
  const goldValue = B.rnd(v.gold * (P.G750 ?? 0));
  const cashSum = Object.values(v.cash).reduce((s, x) => s + x, 0), bankSum = Object.values(v.bank).reduce((s, x) => s + x, 0);
  const cust = (u) => v.custody[u] ?? { owedByShop: 0, owedToShop: 0 };
  const netOf = (u, held) => held - cust(u).owedByShop + cust(u).owedToShop;
  root.innerHTML = String(html`${booksNav('vault')}
    <div class="bk-head"><div><h1>گاوصندوق</h1><span class="small">موجودی فیزیکی، امانت مشتریان و موقعیت خالص · ارزش به قیمت زنده (ریال) · هر جدول با کلیک روی سرستون مرتب می‌شود</span></div><div class="actions"><button class="btn small" data-act="count">شمارش فیزیکی</button>${admin ? html`<button class="btn small ghost" data-act="melt">ذوب و تبدیل جنس</button>` : ''}<a class="btn small ghost" href="/books/smart?t=close" data-link>شمارش با ترازو و بستن روز</a><a class="btn small ghost" href="/books/smart?t=bars" data-link>شناسنامه شمش</a><a class="btn small ghost" href="/books/products" data-link>محصولات</a><button class="btn small ghost" data-act="print">چاپ</button></div></div>
    <div class="printable pr-sheet"><h2 class="pr-only">گاوصندوق ${jdLong(today())}</h2><div class="vt-tiles">
      <div class="vt-tile vt-gold"><span>طلای آبشده (گرم ۷۵۰)</span><b>${G(v.gold)}</b><small>${P.G750 ? money(goldValue) : ''}</small></div>
      ${coins.map((k) => html`<div class="vt-tile vt-coin"><span>${COIN_TYPES[k].label ?? COIN_TYPES[k].short}</span><b>${sg(v.coins[k] ?? 0)}</b><small>${P[`COIN:${k}`] ? sgm((v.coins[k] ?? 0) * P[`COIN:${k}`]) : ''}</small></div>`)}
      <div class="vt-tile vt-bar"><span>شمش پلمپ</span><b>${fa(v.bars.length)}</b><small>${G(v.bars.reduce((s, b) => s + (b.weight ?? 0), 0))} گرم</small></div>
      ${Object.entries(v.fx).map(([c, n]) => html`<div class="vt-tile vt-fx"><span>${TR.FX_CODES[c]}</span><b>${fa(n)}</b></div>`)}
      <div class="vt-tile vt-cash"><span>نقد صندوق‌ها</span><b>${money(cashSum).replace(' ریال', '')}</b><small>ریال</small></div>
      <div class="vt-tile vt-bank"><span>موجودی بانک‌ها</span><b>${money(bankSum).replace(' ریال', '')}</b><small>ریال</small></div>
    </div>
    <div class="grid2 bk-grid vt-grid">
      <section class="tray"><h3 class="bk-h">موقعیت خالص (موجودی − امانت مشتری + طلب جنسی)</h3>
        <div class="scrollx"><table class="table-plain" data-sort="vault-net"><thead><tr><th>قلم</th><th>در گاوصندوق</th><th>امانت / طلب مشتریان</th><th>بدهی جنسی مشتریان</th><th>خالص ما</th></tr></thead><tbody>
          <tr><td>طلا (گرم ۷۵۰)</td><td class="num" data-v="${v.gold}">${G(v.gold)}</td><td class="num" data-v="${cust('G750').owedByShop}">${G(cust('G750').owedByShop)}</td><td class="num" data-v="${cust('G750').owedToShop}">${G(cust('G750').owedToShop)}</td><td class="num" data-v="${netOf('G750', v.gold)}"><b>${G(B.r3(netOf('G750', v.gold)))}</b></td></tr>
          ${coins.map((k) => html`<tr><td>${COIN_TYPES[k].short}</td><td class="num" data-v="${v.coins[k] ?? 0}">${sg(v.coins[k] ?? 0)}</td><td class="num" data-v="${cust(`COIN:${k}`).owedByShop}">${fa(cust(`COIN:${k}`).owedByShop)}</td><td class="num" data-v="${cust(`COIN:${k}`).owedToShop}">${fa(cust(`COIN:${k}`).owedToShop)}</td><td class="num" data-v="${netOf(`COIN:${k}`, v.coins[k] ?? 0)}"><b>${sg(netOf(`COIN:${k}`, v.coins[k] ?? 0))}</b></td></tr>`)}
          <tr><td>ریال</td><td class="num" data-v="${cashSum + bankSum}">${money(cashSum + bankSum)}</td><td class="num" data-v="${cust('IRR').owedByShop}">${money(cust('IRR').owedByShop)}</td><td class="num" data-v="${cust('IRR').owedToShop}">${money(cust('IRR').owedToShop)}</td><td class="num" data-v="${netOf('IRR', cashSum + bankSum)}"><b>${money(netOf('IRR', cashSum + bankSum))}</b></td></tr>
        </tbody></table></div>
        <p class="small">مظنه نقدی: ${v.prices.mazaneh ? money(v.prices.mazaneh) : '—'} · گرم ۷۵۰: ${P.G750 ? money(P.G750) : '—'}</p></section>
      <section class="tray"><h3 class="bk-h">صندوق‌ها و بانک‌ها</h3><div class="scrollx"><table class="table-plain" data-sort="vault-cash"><thead><tr><th>حساب</th><th>مانده</th><th data-nosort></th></tr></thead><tbody>${[...Object.entries(v.cash).map(([id, x]) => ['صندوق', id, x]), ...Object.entries(v.bank).map(([id, x]) => ['بانک', id, x])].map(([k, id, x]) => html`<tr><td>${accName[id] ?? id} <span class="small">${k}</span></td><td class="num" data-v="${x}">${money(x)}</td><td>${k === 'بانک' && admin ? html`<a class="chip" href="/books/bank/${id}" data-link>تطبیق</a>` : ''}</td></tr>`)}</tbody></table></div></section>
    </div>
    ${v.bars.length ? html`<section class="tray bk-sec"><div class="bk-head"><h3 class="bk-h">شمش‌های داخل گاوصندوق</h3><a class="chip" href="/books/bars" data-link>دفتر شمش‌ها</a></div><div class="scrollx"><table class="table-plain bk-table" data-sort="vault-bars"><thead><tr><th>سریال</th><th>ضامن</th><th>گالری</th><th>وزن</th><th>عیار</th><th>تاریخ پلمپ</th><th>ورود</th></tr></thead><tbody>${v.bars.map((b) => html`<tr><td class="ltr-num" data-v="${b.serial}"><a href="/books/bars?q=${b.serial}" data-link>${fa(b.serial)}</a></td><td>${b.brand}</td><td>${b.gallery}</td><td class="num" data-v="${b.weight ?? ''}">${G(b.weight)}</td><td class="num" data-v="${b.fineness ?? ''}">${fa(b.fineness)}</td><td data-v="${b.sealDate ?? ''}">${b.sealDate ? jd(b.sealDate) : '—'}</td><td data-v="${b.history.at(-1)?.date ?? ''}">${b.history.at(-1) ? jd(b.history.at(-1).date) : ''}</td></tr>`)}</tbody></table></div></section>` : ''}</div>`);
  wireSorts(root);
  actions(root, {
    print: () => window.print(),
    count: () => countDialog(v, { prices: P, accName, admin, onDone: () => navigate('/books/vault', { replace: true }) }),
    melt: () => meltDialog({ bars: v.bars, onDone: () => navigate('/books/vault', { replace: true }) }),
  });
  // reached from the guide, the documents page or the palette: the dialog opens by itself
  const act = new URLSearchParams(location.search).get('act');
  if (act === 'count' || (act === 'melt' && admin)) $(`[data-act="${act}"]`, root)?.click();
}

/* ---------------- دفتر شمش‌ها ---------------- */
export async function barsPage(root) {
  await booksPrefs();
  const q = new URLSearchParams(location.search).get('q') ?? '';
  const r = await api(`/api/books/bars${q ? `?q=${encodeURIComponent(q)}` : ''}`);
  const statusText = (b) => (b.inVault ? 'در گاوصندوق' : b.custodyOf ? `امانت ${b.custodyOf}` : 'خارج شده');
  const status = (b) => (b.inVault ? html`<span class="bk-st final">در گاوصندوق</span>` : b.custodyOf ? html`<span class="bk-st draft">امانت ${b.custodyOf}</span>` : html`<span class="bk-st void">خارج شده</span>`);
  const moveText = (h) => (h.transform ? (h.dir === 'in' ? 'از ذوب و پلمپ آمد' : 'به ذوب رفت') : h.adjust ? (h.dir === 'in' ? 'اضافه شمارش' : 'کسری شمارش') : h.opening ? 'مانده اول دوره' : `${h.dir === 'in' ? (h.priced ? 'خرید از' : 'دریافت امانی از') : h.priced ? 'فروش به' : 'تحویل به'} ${h.party ?? 'مشتری گذری'}`);
  // sorted by any of its facts (spec 0027); the choice is kept for this viewer
  const BSORT = [['serial', 'سریال', (b) => b.serial, 1], ['weight', 'وزن (بیشترین)', (b) => b.weight ?? NaN, -1], ['fineness', 'عیار (بیشترین)', (b) => b.fineness ?? NaN, -1], ['brand', 'ضامن', (b) => b.brand || '', 1], ['status', 'وضعیت', (b) => statusText(b), 1], ['last', 'آخرین جابه‌جایی (تازه‌ترین)', (b) => b.history.at(-1)?.date ?? '', -1], ['seal', 'تاریخ پلمپ', (b) => b.sealDate ?? '', 1]];
  let bsort = (() => {
    try {
      return localStorage.getItem('beatris.sort.bars') ?? 'serial';
    } catch {
      return 'serial';
    }
  })();
  const ordered = () => {
    const [, , key, dir] = BSORT.find(([k]) => k === bsort) ?? BSORT[0];
    return sortBy(r.items, (b) => { const x = key(b); return Number.isNaN(x) ? '' : x; }, dir);
  };
  const cards = () =>
    r.items.length
      ? ordered().map((b, i) => html`<details class="tray br-card" style="--i:${Math.min(i, 12)}" ${r.items.length === 1 ? raw('open') : ''}><summary><b class="ltr-num">${fa(b.serial)}</b><span>${b.brand || '—'}${b.gallery ? ` · ${b.gallery}` : ''}</span><span>${b.weight != null ? `${G(b.weight)} گرم · ${fa(b.fineness)}` : ''}</span>${status(b)}</summary>
          <p class="small">تاریخ پلمپ: ${b.sealDate ? jd(b.sealDate) : '—'}</p>
          <ol class="br-hist">${b.history.map((h) => html`<li class="${h.dir}"><b>${jd(h.date)}</b> ${moveText(h)} · <a class="ltr-num" href="/books/trace?q=${encodeURIComponent(h.track)}&sec=bar" data-link>${h.track}</a></li>`)}</ol></details>`)
      : html`<p class="notice">${q ? 'شمشی با این سریال ثبت نشده است.' : 'هنوز شمشی ثبت نشده است؛ در میز معامله گزینه «شمش پلمپ» را بزنید.'}</p>`;
  root.innerHTML = String(html`${booksNav('bars')}
    <div class="bk-head"><div><h1>دفتر شمش‌های پلمپ</h1><span class="small">هر سریال فقط یک بار وارد گاوصندوق می‌شود؛ سیر کامل ورود و خروج هر شمش.</span></div>${exportButtons('br')}</div>
    <form class="bk-filters" id="bq"><input class="input ltr" name="q" value="${q}" placeholder="سریال (بخشی از آن کافی است)" autofocus><button class="btn small">جستجو</button>${q ? html`<a class="chip" href="/books/bars" data-link>همه</a>` : ''}
      <label class="dy-sort"><span>ترتیب</span><select class="input sm" id="brsort" aria-label="ترتیب شمش‌ها">${BSORT.map(([k, l]) => html`<option value="${k}" ${bsort === k ? 'selected' : ''}>${l}</option>`)}</select></label></form>
    <div class="br-list printable pr-sheet" id="brl">${cards()}</div>`);
  $('#brsort', root).addEventListener('change', (e) => {
    bsort = e.target.value;
    try {
      localStorage.setItem('beatris.sort.bars', bsort);
    } catch {
      /* storage unavailable */
    }
    $('#brl', root).innerHTML = String(cards());
  });
  $('#bq', root).addEventListener('submit', (e) => {
    e.preventDefault();
    const v = new FormData(e.target).get('q');
    navigate(`/books/bars${v ? `?q=${encodeURIComponent(v)}` : ''}`);
  });
  const map = {};
  wireExport(map, 'br', 'shemsh', () => ordered().map((b) => ({ serial: b.serial, brand: b.brand, gallery: b.gallery, weight: b.weight, fineness: b.fineness, sealDate: b.sealDate ? jd(b.sealDate) : '', status: b.inVault ? 'در گاوصندوق' : b.custodyOf ? `امانت ${b.custodyOf}` : 'خارج شده', last: b.history.at(-1) ? `${jd(b.history.at(-1).date)} ${b.history.at(-1).party ?? ''}` : '' })), [['serial', 'سریال'], ['brand', 'ضامن'], ['gallery', 'گالری'], ['weight', 'وزن'], ['fineness', 'عیار'], ['sealDate', 'تاریخ پلمپ'], ['status', 'وضعیت'], ['last', 'آخرین رویداد']], 'شمش‌ها');
  actions(root, map);
}

/* ---------------- تطبیق بانک ---------------- */
export async function bankPage(root, { id }) {
  await booksPrefs();
  let r;
  try {
    r = await api(`/api/books/bank/${id}`);
  } catch (e) {
    root.innerHTML = String(html`${booksNav('cash')}<div class="notice">${e.message}</div>`);
    return;
  }
  const a = r.account;
  const pend = new Map(); // src -> {on, ref}
  root.innerHTML = String(html`${booksNav('cash')}
    <div class="bk-head"><div><h1>تطبیق بانک: ${a.title}</h1><span class="small">${a.bank ?? ''} ${a.number ? fa(a.number) : ''}</span></div>${exportButtons('bn')}</div>
    <div class="stats bk-stats"><div><b>${money(r.book)}</b><span>مانده دفتر</span></div><div><b>${money(r.reconciledBalance)}</b><span>مانده تطبیق‌شده با صورتحساب</span></div><div class="${r.open ? 'bad' : 'good'}"><b>${fa(r.open)}</b><span>ردیف تطبیق‌نشده</span></div></div>
    <section class="tray bk-sec"><h3 class="bk-h">چسباندن صورتحساب بانک</h3><p class="small">هر سطر: تاریخ، مبلغ (ریال؛ برداشت با منفی)، شماره پیگیری — با کاما، تب یا | جدا. مثال: <span class="ltr-num">۱۴۰۵/۰۷/۰۶, 500000000, 1234</span></p>
      <textarea class="input ltr" id="stmt" rows="4"></textarea><div class="actions"><button class="btn small" data-act="match">تطبیق خودکار</button></div><div id="mres"></div></section>
    <section class="tray bk-sec printable pr-sheet"><div class="bk-head"><h3 class="bk-h">گردش حساب در دفتر ${a.title}</h3><button class="btn small" data-act="save" disabled id="rsave">ذخیره تطبیق</button></div>
      <div class="scrollx"><table class="table-plain bk-table" data-sort="bank"><thead><tr><th data-nosort>تطبیق</th><th>تاریخ</th><th>سند</th><th>طرف حساب</th><th>روش / پیگیری</th><th>واریز</th><th>برداشت</th><th>مانده</th></tr></thead><tbody>${r.rows.map((x) => html`<tr data-src="${x.id}" class="${x.reconciled ? 'ok' : ''}"><td><input type="checkbox" data-rc="${x.id}" ${x.reconciled ? 'checked' : ''} aria-label="تطبیق"></td><td data-v="${x.date}">${jd(x.date)}</td><td>${x.doc ? html`<a class="ltr-num" href="/books/trace?q=${encodeURIComponent(x.track)}" data-link>${x.track}</a>` : ''}</td><td>${x.party ?? '—'}</td><td class="small">${x.refs.join('، ')}${x.reconRef ? html` · صورتحساب ${fa(x.reconRef)}` : ''}</td><td class="num" data-v="${x.amt > 0 ? x.amt : ''}">${x.amt > 0 ? money(x.amt) : ''}</td><td class="num" data-v="${x.amt < 0 ? -x.amt : ''}">${x.amt < 0 ? money(-x.amt) : ''}</td><td class="num" data-v="${x.balance}">${money(x.balance)}</td></tr>`)}</tbody></table></div></section>`);
  wireSorts(root);
  const refresh = () => ($('#rsave', root).disabled = !pend.size);
  root.addEventListener('change', (e) => {
    const c = e.target.closest('[data-rc]');
    if (!c) return;
    pend.set(c.dataset.rc, { on: c.checked, ref: pend.get(c.dataset.rc)?.ref ?? '' });
    refresh();
  });
  const map = {
    match: async (btn) => {
      const { rows, errors } = TR.parseStatement($('#stmt', root).value, parseDay);
      const box = $('#mres', root);
      if (!rows.length) return (box.innerHTML = String(html`<p class="err">سطر معتبری پیدا نشد${errors.length ? ` (${errors.join('، ')})` : ''}.</p>`));
      busy(btn, true);
      try {
        const m = await api(`/api/books/bank/${id}/match`, { method: 'POST', body: { rows } });
        for (const x of m.matches) {
          pend.set(x.book, { on: true, ref: m.rows[x.stmt].ref });
          const cb = $(`[data-rc="${x.book}"]`, root);
          if (cb) {
            cb.checked = true;
            cb.closest('tr').classList.add('hit');
          }
        }
        box.innerHTML = String(html`<p class="small">${fa(m.matches.length)} ردیف جفت شد (${fa(m.matches.filter((x) => x.byRef).length)} با شماره پیگیری). ${m.unmatchedStatement.length ? html`<b class="bad">${fa(m.unmatchedStatement.length)} سطر صورتحساب در دفتر نیست:</b> ${m.unmatchedStatement.map((i) => `${jd(m.rows[i].date)} ${money(m.rows[i].amt)}`).join('، ')}` : ''} ${errors.length ? `سطرهای ناخوانا: ${errors.join('، ')}` : ''} برای ثبت «ذخیره تطبیق» را بزنید.</p>`);
        refresh();
      } catch (err) {
        toast(err.message, 'error');
      } finally {
        busy(btn, false);
      }
    },
    save: async (btn) => {
      busy(btn, true);
      try {
        await api(`/api/books/bank/${id}/recon`, { method: 'POST', body: { items: [...pend].map(([src, x]) => ({ src, ...x })) } });
        toast('تطبیق ذخیره شد.', 'ok');
        navigate(location.pathname, { replace: true });
      } catch (err) {
        toast(err.message, 'error');
        busy(btn, false);
      }
    },
  };
  wireExport(map, 'bn', `bank-${a.title}`, () => r.rows.map((x) => ({ date: jd(x.date), doc: x.track ?? '', party: x.party ?? '', refs: x.refs.join(' '), amt: x.amt, balance: x.balance, rec: x.reconciled ? 'بله' : '' })), [['date', 'تاریخ'], ['doc', 'سند'], ['party', 'طرف حساب'], ['refs', 'روش/پیگیری'], ['amt', 'مبلغ (ریال)'], ['balance', 'مانده'], ['rec', 'تطبیق']], 'بانک');
  actions(root, map);
}
