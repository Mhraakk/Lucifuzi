// میز معامله — the base edition's counter for coin and molten-gold dealers. One screen: pick the customer (their
// rial, gold, coin, currency and bar balances in view), choose buy / sell / goods in / goods out, type the numbers
// (the مظنه comes from the live board with the shop's spread), take money any way it comes, save. Everything is
// in rial and computed by the same engine the server books with, so the receipt, the day book and the customer's
// statement agree to the last rial.
import { html, raw, fa, api, store, toast, navigate, $, $$, busy } from '../core.mjs';
import * as B from '../books.mjs';
import * as TR from '../trade.mjs';
import { COIN_TYPES } from '../coins.mjs';
import { booksPrefs, prefs, R, G, jd, jdInput, parseDay, today, modal, balChips, unitLabel, unitVal, unitAmt, balUnits, timeFa, describeLine } from '../bk.mjs';
import { booksNav } from './books.mjs';
import { crown } from '../invoice.mjs';

const MODES = [
  ['buy', 'خرید از مشتری', 'مشتری می‌فروشد · ما پول می‌دهیم', 'in', true],
  ['sell', 'فروش به مشتری', 'مشتری می‌خرد · پول می‌گیریم', 'out', true],
  ['in', 'دریافت جنس', 'امانت یا تسویه جنسی · بدون قیمت', 'in', false],
  ['out', 'تحویل جنس', 'پس دادن امانت یا بدهی جنسی', 'out', false],
];
const KINDS = [
  ['melt', 'آبشده'],
  ['coin', 'سکه'],
  ['bar', 'شمش پلمپ'],
  ['fx', 'ارز'],
];
const MONEY_METHODS = ['cash', 'pos', 'c2c', 'slip', 'a2a', 'satna', 'paya', 'pol', 'havale', 'cheque', 'gateway', 'offset'];
const COIN_BOARD = { bahar: 'sekeb', emami: 'sekee', halfOld: 'nim', half: 'nim', quarterOld: 'rob', quarter: 'rob', gerami: 'gerami' };
const FINENESS_QUICK = [705, 720, 730, 735, 740, 745, 750, 900, 995];
const DRAFT = 'beatris.desk.draft';
const ls = {
  get: () => {
    try {
      return JSON.parse(localStorage.getItem(DRAFT) ?? 'null');
    } catch {
      return null;
    }
  },
  set: (v) => {
    try {
      if (v) localStorage.setItem(DRAFT, JSON.stringify(v));
      else localStorage.removeItem(DRAFT);
    } catch {
      /* storage unavailable */
    }
  },
};

export async function deskPage(root) {
  await booksPrefs();
  const s = prefs.settings ?? {};
  const [acc, cond] = await Promise.all([api('/api/books/accounts'), api('/api/books/conditional').catch(() => ({ items: [] }))]);
  let board = await api('/api/market').catch(() => null);
  const cash = acc.items.filter((a) => a.kind === 'cash' && a.active), banks = acc.items.filter((a) => a.kind === 'bank' && a.active);
  const liveOf = (id) => {
    const x = board?.items?.find((i) => i.id === id);
    return x && !x.empty ? x.c * 10 : null;
  };
  const spread = () => {
    const g = S.party?.group && s.groups?.[S.party.group];
    return { buy: g?.spreadBuy || s.spreadBuy || 0, sell: g?.spreadSell || s.spreadSell || 0, cBuy: s.coinSpreadBuy ?? 0, cSell: s.coinSpreadSell ?? 0 };
  };
  const mazFor = (dir) => {
    const m = liveOf('mesghal');
    return m ? m + (dir === 'in' ? -spread().buy : spread().sell) : '';
  };
  const coinFor = (id, dir) => {
    const c = liveOf(COIN_BOARD[id]);
    return c ? c + (dir === 'in' ? -spread().cBuy : spread().cSell) : '';
  };

  /* ---------------- state ---------------- */
  const S = { party: null, mode: 'buy', kind: 'melt', f: {}, lines: [], payments: [], note: '' };
  const mode = () => MODES.find((m) => m[0] === S.mode);
  const dir = () => mode()[3];
  const priced = () => mode()[4];
  const resetForm = () => {
    const d = dir();
    S.f = {
      melt: { weight: '', fineness: S.f.melt?.fineness ?? 740, basis: 'mazaneh', mazaneh: mazFor(d), g750: '', amount: '', conditional: false },
      coin: { coin: S.f.coin?.coin ?? 'emami', count: 1, basis: 'count', price: coinFor(S.f.coin?.coin ?? 'emami', d), weight: '', gramPrice: '', amount: '' },
      bar: { serial: '', brand: S.f.bar?.brand ?? 'زربد', gallery: '', weight: '', fineness: 750, sealDate: '', basis: 'mazaneh', mazaneh: mazFor(d), amount: '', fee: '' },
      fx: { code: S.f.fx?.code ?? 'USD', fxAmount: '', rate: S.f.fx?.code === 'USD' || !S.f.fx ? liveOf('usd') ?? '' : '' },
    };
  };
  resetForm();
  const draft = ls.get();

  root.innerHTML = String(html`${booksNav('desk')}
    <section class="dk-prices" id="prices" aria-label="قیمت‌های زنده"></section>
    ${cond.items.length ? html`<button class="notice dk-cond" data-act="cond">⚖ ${fa(cond.items.length)} آبشده شرطی منتظر عیار آزمایشگاه است — ثبت عیار</button>` : ''}
    ${draft?.lines?.length || draft?.payments?.length ? html`<div class="notice dk-draft">سند ناتمامی از ${fa(new Date(draft.at).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }))} مانده است. <button class="chip" data-act="restore">ادامه</button><button class="chip" data-act="drop">دور بریز</button></div>` : ''}
    <div class="dk">
      <div class="dk-main">
        <section class="tray dk-party" id="party"></section>
        <section class="dk-modes" role="radiogroup" aria-label="نوع معامله">${MODES.map(([k, t, sub]) => html`<button class="dk-mode ${k}" data-mode="${k}" role="radio" aria-checked="${S.mode === k}"><b>${t}</b><span>${sub}</span></button>`)}</section>
        <section class="tray dk-form">
          <nav class="dk-kinds" role="tablist">${KINDS.map(([k, t]) => html`<button role="tab" data-kind="${k}" aria-selected="${S.kind === k}">${t}</button>`)}</nav>
          <div id="form"></div>
          <div class="dk-live" id="live" aria-live="polite"></div>
          <div class="dk-add"><button class="btn" data-act="add">افزودن به سند <kbd>Enter</kbd></button></div>
        </section>
        <section class="dk-lines" id="lines"></section>
        <section class="tray dk-pay"><h3 class="bk-h">دریافت و پرداخت وجه</h3><div class="bk-methods">${MONEY_METHODS.map((m) => html`<button class="chip" data-pm="${m}">${B.payMethod(m).label}</button>`)}</div><div id="pays"></div>
          <label class="field">یادداشت<input class="input" id="note" maxlength="600" placeholder="مثلاً: تحویل فردا، آزمایشگاه عیار…"></label></section>
        <section class="dk-more"><button class="btn ghost small" data-act="hawala">حواله بین دو طرف حساب</button><button class="btn ghost small" data-act="convert">تبدیل مانده جنسی به ریال</button><a class="btn ghost small" href="/books/day" data-link>روزنگار امروز</a><a class="btn ghost small" href="/books/vault" data-link>گاوصندوق</a></section>
      </div>
      <aside class="dk-side"><div class="tray dk-sum" id="sum"></div><div class="dk-save"><button class="btn block" data-act="save">ثبت سند <kbd>Ctrl+Enter</kbd></button></div></aside>
    </div>
    <div class="dk-bar" id="bar"></div>`);

  /* ---------------- prices ---------------- */
  function drawPrices() {
    const tiles = [
      ['mesghal', 'مظنه نقدی', 'maz'],
      ['mesghal_fwd', 'مظنه حواله', 'maz'],
      ['geram18', 'گرم ۱۸', 'g750'],
      ['sekee', 'تمام امامی', 'coin:emami'],
      ['sekeb', 'تمام بهار', 'coin:bahar'],
      ['nim', 'نیم', 'coin:half'],
      ['rob', 'ربع', 'coin:quarter'],
      ['gerami', 'گرمی', 'coin:gerami'],
      ['usd', 'دلار', 'fx:USD'],
    ];
    $('#prices', root).innerHTML = String(html`${tiles.map(([id, label, use]) => {
      const v = liveOf(id);
      const x = board?.items?.find((i) => i.id === id);
      return v ? html`<button class="dk-price" data-use="${use}" data-v="${v}" title="بگذار در فرم"><span>${label}</span><b>${R(v).replace(' ریال', '')}</b>${x?.pct ? html`<em class="${x.pct > 0 ? 'up' : 'down'}">${x.pct > 0 ? '▲' : '▼'}${fa(Math.abs(x.pct).toFixed(2))}٪</em>` : ''}</button>` : '';
    })}<span class="dk-src">${board?.sample ? 'داده نمونه (قیمت زنده وصل نیست)' : 'ریال · منبع: ' + (board?.source?.label ?? '')}</span>`);
  }

  /* ---------------- customer ---------------- */
  function drawParty() {
    const box = $('#party', root);
    if (!S.party) {
      box.innerHTML = String(html`<div class="dk-find"><input class="input" id="pq" placeholder="مشتری: نام، لقب، نام پدر، شهر، موبایل، کد (F2)" autocomplete="off"><button class="btn small ghost" data-act="pnew">+ مشتری جدید</button><div class="bk-drop" id="pdrop" hidden></div></div><p class="small">معامله نقدی کامل بدون مشتری هم ثبت می‌شود؛ برای مانده، امانت و جنس، مشتری لازم است.</p>`);
      return;
    }
    const p = S.party;
    box.innerHTML = String(html`<div class="dk-who"><div><b>${p.label}</b><span class="small">کد ${fa(p.code)}${p.mobile ? html` · ${fa(p.mobile)}` : ''}${p.group ? html` · گروه ${p.group}` : ''}</span></div><div class="dk-who-a"><a class="chip" href="/books/party/${p.id}" data-link>ریز حساب</a><button class="chip" data-act="pclear">تغییر مشتری</button></div></div><div class="dk-bal">${balChips(p.balance ?? {})}</div>`);
  }
  let pqT;
  async function findParty(q) {
    const drop = $('#pdrop', root);
    if (!q.trim()) return (drop.hidden = true);
    const r = await api(`/api/books/parties?q=${encodeURIComponent(q)}`);
    drop.hidden = false;
    drop._items = r.items;
    drop.innerHTML = r.items.length ? r.items.slice(0, 15).map((p) => String(html`<button data-pick="${p.id}"><b>${p.label}</b><span>کد ${fa(p.code)}${p.group ? ` · ${p.group}` : ''}</span><em>${balChips(p.balance)}</em></button>`)).join('') : '<p class="small">پیدا نشد؛ «مشتری جدید» را بزنید.</p>';
  }
  async function pickParty(p) {
    const full = await api(`/api/books/parties/${p.id}`);
    S.party = { ...full.party, balance: full.balance };
    resetForm();
    drawParty();
    drawForm();
    recalc();
  }
  function newParty() {
    modal(
      String(html`<h3 class="bk-h">مشتری جدید</h3><form class="form" id="np"><label class="field">نام و نام خانوادگی<input class="input" name="name" required maxlength="120"></label>
        <div class="form cols"><label class="field">موبایل<input class="input ltr" name="mobile" inputmode="tel"></label><label class="field">لقب / شهرت<input class="input" name="alias"></label></div>
        <div class="form cols"><label class="field">نام پدر<input class="input" name="father"></label><label class="field">شهر<input class="input" name="city"></label><label class="field">گروه<input class="input" name="group" list="dk-groups"></label></div>
        <datalist id="dk-groups">${Object.keys(s.groups ?? {}).map((g) => html`<option value="${g}">`)}</datalist>
        <label class="field">کد ملی<input class="input ltr" name="nid" inputmode="numeric"></label>
        <p class="err" id="nperr" role="alert"></p><div class="actions"><button class="btn">ثبت و انتخاب</button><button class="btn ghost" type="button" data-close>انصراف</button></div></form>`),
      (m, close) =>
        $('#np', m).addEventListener('submit', async (e) => {
          e.preventDefault();
          try {
            const p = await api('/api/books/parties', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) });
            close();
            pickParty(p);
          } catch (err) {
            $('#nperr', m).textContent = err.message;
          }
        }),
    );
  }

  /* ---------------- the line form ---------------- */
  const inp = (k, v, label, { ltr = true, ph = '', list = '', w = '' } = {}) => html`<label class="field dk-f ${w}"><span>${label}</span><input class="input ${ltr ? 'ltr' : ''}" data-f="${k}" value="${v ?? ''}" placeholder="${ph}" ${ltr ? raw('inputmode="decimal"') : ''} ${list ? raw(`list="${list}"`) : ''} autocomplete="off"></label>`;
  const seg = (k, v, opts) => html`<div class="seg dk-seg">${opts.map(([val, label]) => html`<button type="button" data-seg="${k}" data-v="${val}" aria-pressed="${v === val}">${label}</button>`)}</div>`;
  function drawForm() {
    const f = S.f[S.kind];
    const P = priced();
    let body;
    if (S.kind === 'melt')
      body = html`<div class="dk-grid">${inp('weight', f.weight, 'وزن (گرم)', { ph: '۰٫۰۰۰', w: 'big' })}${inp('fineness', f.fineness, 'عیار (ری‌گیری)', { w: 'big' })}</div>
        <div class="chips dk-quick">${FINENESS_QUICK.map((q) => html`<button type="button" class="chip" data-fq="${q}" aria-pressed="${Number(f.fineness) === q}">${fa(q)}</button>`)}</div>
        ${P ? html`${seg('basis', f.basis, [['mazaneh', 'مظنه'], ['gram750', 'قیمت گرم ۷۵۰'], ['amount', 'مبلغ توافقی']])}<div class="dk-grid">${f.basis === 'mazaneh' ? inp('mazaneh', f.mazaneh, 'مظنه (ریال هر مثقال ۷۰۵)', { w: 'big' }) : f.basis === 'gram750' ? inp('g750', f.g750, 'قیمت هر گرم ۷۵۰ (ریال)', { w: 'big' }) : inp('amount', f.amount, 'مبلغ کل توافقی (ریال)', { w: 'big' })}</div>` : ''}
        ${dir() === 'in' ? html`<label class="segopt dk-check"><input type="checkbox" data-f="conditional" ${f.conditional ? 'checked' : ''}><span>آبشده شرطی — عیار نهایی بعد از آزمایشگاه ثبت می‌شود</span></label>` : ''}`;
    else if (S.kind === 'coin')
      body = html`<div class="dk-coins">${Object.entries(COIN_TYPES).map(([id, c]) => html`<button type="button" data-coin="${id}" aria-pressed="${f.coin === id}"><b>${c.short}</b><small>${fa(c.weight)} گرم · ${fa(c.fineness)}</small></button>`)}</div>
        <div class="dk-grid"><div class="field dk-f big"><span>تعداد</span><div class="dk-step"><button type="button" data-step="-1" aria-label="کم">−</button><input class="input ltr" data-f="count" value="${f.count}" inputmode="numeric"><button type="button" data-step="1" aria-label="زیاد">+</button></div></div>
        ${P ? (f.basis === 'count' ? inp('price', f.price, 'قیمت هر سکه (ریال)', { w: 'big' }) : f.basis === 'weight' ? html`${inp('weight', f.weight, 'وزن کل (گرم)')}${inp('gramPrice', f.gramPrice, 'قیمت هر گرم (ریال)')}` : inp('amount', f.amount, 'مبلغ کل (ریال)', { w: 'big' })) : ''}</div>
        ${P ? seg('basis', f.basis, [['count', 'تعدادی'], ['weight', 'وزنی'], ['amount', 'مبلغی']]) : ''}`;
    else if (S.kind === 'bar')
      body = html`<div class="dk-grid">${inp('serial', f.serial, 'سریال شمش', { ph: 'مثلاً ۳۳۰۷۰۲۱', w: 'big' })}${inp('brand', f.brand, 'ضامن / برند', { ltr: false, list: 'dk-brands' })}${inp('gallery', f.gallery, 'گالری / کد پلمپ‌کننده', { ltr: false })}</div>
        <datalist id="dk-brands"><option value="زربد"></option><option value="بدون پلمپ"></option></datalist>
        <div class="dk-grid">${inp('weight', f.weight, 'وزن خالص (گرم)')}${inp('fineness', f.fineness, 'عیار')}${inp('sealDate', f.sealDate, 'تاریخ پلمپ', { ph: '۱۴۰۳/۰۶/۲۱' })}</div>
        ${P ? html`${seg('basis', f.basis, [['mazaneh', 'مظنه'], ['amount', 'مبلغ توافقی']])}<div class="dk-grid">${f.basis === 'mazaneh' ? inp('mazaneh', f.mazaneh, 'مظنه (ریال)') : inp('amount', f.amount, 'مبلغ کل (ریال)')}${inp('fee', f.fee, 'اجرت پلمپ (ریال، اختیاری)')}</div>` : ''}`;
    else
      body = html`<div class="dk-grid"><label class="field dk-f"><span>ارز</span><select class="input" data-f="code">${Object.entries(TR.FX_CODES).map(([c, n]) => html`<option value="${c}" ${f.code === c ? 'selected' : ''}>${n} (${c})</option>`)}</select></label>${inp('fxAmount', f.fxAmount, 'مقدار', { w: 'big' })}${P ? inp('rate', f.rate, 'نرخ هر واحد (ریال)', { w: 'big' }) : ''}</div>`;
    $('#form', root).innerHTML = String(body);
    $$('[data-kind]', root).forEach((b) => b.setAttribute('aria-selected', String(b.dataset.kind === S.kind)));
    $$('[data-mode]', root).forEach((b) => b.setAttribute('aria-checked', String(b.dataset.mode === S.mode)));
    liveLine();
  }
  const lineFromForm = () => {
    const f = S.f[S.kind];
    const o = { kind: S.kind, dir: dir(), priced: priced() };
    if (S.kind === 'melt') Object.assign(o, { weight: f.weight, fineness: f.fineness, conditional: !!f.conditional && dir() === 'in' });
    if (S.kind === 'coin') Object.assign(o, { coin: f.coin, count: f.count });
    if (S.kind === 'bar') Object.assign(o, { serial: f.serial, brand: f.brand, gallery: f.gallery, weight: f.weight, fineness: f.fineness, sealDate: parseDay(f.sealDate) ?? '' });
    if (S.kind === 'fx') Object.assign(o, { code: f.code, fxAmount: f.fxAmount });
    if (o.priced) {
      if (S.kind === 'melt') Object.assign(o, { basis: f.basis, mazaneh: f.mazaneh, g750: f.g750, amount: f.amount });
      if (S.kind === 'coin') Object.assign(o, { basis: f.basis, price: f.price, weight: f.weight, gramPrice: f.gramPrice, amount: f.amount });
      if (S.kind === 'bar') Object.assign(o, { basis: f.basis, mazaneh: f.mazaneh, amount: f.amount, fee: f.fee || undefined });
      if (S.kind === 'fx') o.rate = f.rate;
    }
    return o;
  };
  const describe = describeLine;
  function liveLine() {
    const box = $('#live', root);
    const raw_ = lineFromForm();
    const f = S.f[S.kind];
    if ((S.kind === 'melt' || S.kind === 'bar') && !f.weight) return (box.innerHTML = '<span class="small">وزن را وارد کنید؛ معادل ۷۵۰، مثقال و مبلغ همین‌جا حساب می‌شود.</span>');
    try {
      const l = TR.tradeLine(raw_, { round: s.tradeRound ?? 10000 });
      const cells = [];
      if (l.eq750) cells.push(['معادل ۷۵۰', `${G(l.eq750)} گرم`], ['مثقال (۷۰۵)', G(l.mesghal)], ['طلای خالص', `${G(l.pure)} گرم`]);
      if (l.priced && (l.kind === 'melt' || l.kind === 'bar') && l.eq750) cells.push(['گرم ۷۵۰', R(Math.round((l.value - l.fee) / l.eq750))]);
      if (l.priced) cells.push([l.dir === 'in' ? 'مبلغ خرید' : 'مبلغ فروش', R(l.value), 'big']);
      else cells.push(['روی حساب جنسی مشتری', `${l.dir === 'in' ? 'بستانکار' : 'بدهکار'} ${unitAmt(l.unit, l.amt)}`, 'big']);
      box.innerHTML = String(html`${cells.map(([k, v, c]) => html`<div class="${c ?? ''}"><span>${k}</span><b>${v}</b></div>`)}`);
    } catch (e) {
      box.innerHTML = String(html`<span class="err">${e.message}</span>`);
    }
  }
  function addLine() {
    const l = lineFromForm();
    try {
      TR.tradeLine(l, { round: s.tradeRound ?? 10000 });
    } catch (e) {
      return toast(e.message, 'error');
    }
    if (!priced() && !S.party) return toast('ورود و خروج جنس روی حساب مشتری است؛ اول مشتری را انتخاب کنید.', 'error');
    S.lines.push(l);
    const keep = S.f[S.kind];
    resetForm();
    if (S.kind === 'melt') S.f.melt.fineness = keep.fineness;
    if (S.kind === 'coin') S.f.coin.coin = keep.coin;
    drawForm();
    drawLines(true);
    recalc();
    $('[data-f=weight], [data-f=count], [data-f=serial], [data-f=fxAmount]', $('#form', root))?.focus();
  }
  function drawLines(anim = false) {
    const box = $('#lines', root);
    if (!S.lines.length) return (box.innerHTML = '');
    const rows = S.lines.map((l) => {
      try {
        return TR.tradeLine(l, { round: s.tradeRound ?? 10000 });
      } catch (e) {
        return { error: e.message, ...l };
      }
    });
    box.innerHTML = String(html`${rows.map((l, i) => html`<div class="dk-line ${l.dir} ${l.priced ? '' : 'goods'} ${anim && i === rows.length - 1 ? 'new' : ''}">
      <span class="dk-tag">${l.priced ? (l.dir === 'in' ? 'خرید' : 'فروش') : l.dir === 'in' ? 'دریافت جنس' : 'تحویل جنس'}</span>
      <div><b>${TR.TRADE_KINDS[l.kind]}${l.kind === 'coin' ? ` ${COIN_TYPES[l.coin]?.short ?? ''}` : ''}${S.lines[i].conditional ? ' · شرطی' : ''}</b><small>${l.error ? l.error : describe(l)}</small></div>
      <strong>${l.error ? '' : l.priced ? R(l.value) : unitAmt(l.unit, l.amt)}</strong><button class="iconbtn" data-del="${i}" aria-label="حذف ردیف">✕</button></div>`)}`);
  }

  /* ---------------- money ---------------- */
  function payHtml(p, i) {
    const m = B.payMethod(p.method);
    const acc_ = m.acct === 'cash' ? cash : m.acct === 'bank' ? banks : null;
    return html`<div class="bk-pay ${p.dir === 'out' ? 'out' : ''}"><div class="bk-pay-h"><b>${m.label}</b><select class="input bk-dir" data-p="${i}" data-k="dir"><option value="in" ${p.dir !== 'out' ? 'selected' : ''}>دریافت از مشتری</option><option value="out" ${p.dir === 'out' ? 'selected' : ''}>پرداخت به مشتری</option></select><button class="chip" data-fill="${i}">باقی‌مانده</button><button class="iconbtn" data-pdel="${i}" aria-label="حذف">✕</button></div>
      <div class="bk-line-f"><label class="field xs">مبلغ (ریال)<input class="input ltr" data-p="${i}" data-k="amount" value="${p.amount ?? ''}" inputmode="numeric"></label>
      ${acc_ ? html`<label class="field xs">${m.acct === 'cash' ? 'صندوق' : 'حساب بانکی'}<select class="input" data-p="${i}" data-k="account">${acc_.map((a) => html`<option value="${a.id}" ${p.account === a.id ? 'selected' : ''}>${a.title}</option>`)}</select></label>` : ''}
      ${m.ref ? html`<label class="field xs">شماره پیگیری / فیش<input class="input ltr" data-p="${i}" data-k="ref" value="${p.ref ?? ''}"></label>` : ''}
      ${m.card ? html`<label class="field xs">کارت پرداخت‌کننده<input class="input ltr" data-p="${i}" data-k="card" value="${p.card ?? ''}" placeholder="۴ رقم آخر"></label>` : ''}
      ${m.id === 'cheque' ? html`<label class="field xs">شماره چک<input class="input ltr" data-p="${i}" data-k="chequeNo" value="${p.chequeNo ?? ''}"></label><label class="field xs">صیادی<input class="input ltr" data-p="${i}" data-k="sayad" value="${p.sayad ?? ''}"></label><label class="field xs">بانک<input class="input" data-p="${i}" data-k="bank" value="${p.bank ?? ''}"></label><label class="field xs">سررسید<input class="input ltr" data-p="${i}" data-k="dueJ" value="${p.dueJ ?? ''}" placeholder="۱۴۰۵/۰۸/۱۵"></label>` : ''}</div></div>`;
  }
  const drawPays = () => ($('#pays', root).innerHTML = S.payments.map((p, i) => String(payHtml(p, i))).join(''));
  function body() {
    return { type: 'trade', partyId: S.party?.id ?? null, lines: S.lines, payments: S.payments.map((p) => ({ ...p, due: p.dueJ ? parseDay(p.dueJ) ?? '' : undefined })), note: S.note };
  }
  function calc() {
    try {
      return { c: B.calcDoc(body(), { round: s.tradeRound ?? 10000 }) };
    } catch (e) {
      return { err: e.message };
    }
  }
  function fill(i) {
    const others = { ...body(), payments: body().payments.filter((_, j) => j !== i) };
    let c;
    try {
      c = B.calcDoc(others, { round: s.tradeRound ?? 10000 });
    } catch {
      return;
    }
    if (!c.credit) return;
    S.payments[i].dir = c.credit > 0 ? 'in' : 'out';
    S.payments[i].amount = String(Math.abs(c.credit));
    drawPays();
    recalc();
  }

  /* ---------------- summary: before and after ---------------- */
  let lastNet = 0;
  function recalc() {
    const { c, err } = calc();
    const box = $('#sum', root);
    const bar = $('#bar', root);
    if (!c) {
      box.innerHTML = String(html`<p class="err">${err}</p>`);
      bar.innerHTML = '';
      return null;
    }
    const pid = S.party?.id ?? 'X';
    const delta = B.balances(B.postings({ ...body(), partyId: pid }, c))[`party:${pid}`] ?? {};
    const before = S.party?.balance ?? {};
    const after = {};
    for (const u of new Set([...Object.keys(before), ...Object.keys(delta)])) {
      const v = (before[u] ?? 0) + (delta[u] ?? 0);
      if (Math.abs(v) > 1e-9) after[u] = u === 'G750' ? B.r3(v) : u.startsWith('FX:') ? Math.round(v * 100) / 100 : Math.round(v);
    }
    const row = (k, v, cls = '') => html`<div class="kv ${cls}"><span>${k}</span><b>${v}</b></div>`;
    box.innerHTML = String(html`
      ${row('خرید از مشتری', R(c.buys))}${row('فروش به مشتری', R(c.sells))}
      ${row(c.net >= 0 ? 'خالص: مشتری باید بپردازد' : 'خالص: ما باید بپردازیم', R(Math.abs(c.net)), 'big')}
      ${row('دریافت‌شده', R(c.paidIn))}${row('پرداخت‌شده', R(c.paidOut))}
      ${row(c.credit === 0 ? 'تسویه ریالی کامل' : c.credit > 0 ? 'می‌ماند به بدهی ریالی مشتری' : 'می‌ماند به طلب ریالی مشتری', c.credit === 0 ? '✓' : R(Math.abs(c.credit)), c.credit ? 'warn' : 'ok')}
      ${Object.keys(c.goods).length ? html`<div class="kv"><span>جابه‌جایی جنسی</span><b>${Object.entries(c.goods).map(([u, v]) => `${v > 0 ? 'بدهکار' : 'بستانکار'} ${unitAmt(u, Math.abs(v))}`).join(' · ')}</b></div>` : ''}
      ${S.party ? html`<div class="dk-after"><span>مانده ${S.party.name} پس از این سند</span>${balChips(after)}</div>` : ''}`);
    bar.innerHTML = String(html`<span>${c.net >= 0 ? 'دریافتنی' : 'پرداختنی'} <b>${R(Math.abs(c.net))}</b>${c.credit ? html` · مانده ${R(Math.abs(c.credit))}` : ''}</span><button class="btn small" data-act="save">ثبت</button>`);
    if (c.net !== lastNet) box.classList.remove('flash'), void box.offsetWidth, box.classList.add('flash');
    lastNet = c.net;
    ls.set(S.lines.length || S.payments.length ? { at: Date.now(), partyId: S.party?.id ?? null, lines: S.lines, payments: S.payments, note: S.note } : null);
    return c;
  }

  /* ---------------- save and receipt ---------------- */
  async function save(btn) {
    const { c, err } = calc();
    if (!c) return toast(err, 'error');
    if (!S.lines.length && !S.payments.length) return toast('سند خالی است.', 'error');
    if (c.credit && !S.party) return toast('برای ماندن مبلغ روی حساب، مشتری را انتخاب کنید یا کامل تسویه کنید.', 'error');
    busy(btn, true);
    try {
      const doc = await api('/api/books/docs', { method: 'POST', body: body() });
      ls.set(null);
      const party = S.party ? await api(`/api/books/parties/${S.party.id}`) : null;
      receipt(doc, party);
      S.lines = [];
      S.payments = [];
      S.note = '';
      $('#note', root).value = '';
      if (party) S.party = { ...party.party, balance: party.balance };
      resetForm();
      drawParty();
      drawForm();
      drawLines();
      drawPays();
      recalc();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      busy(btn, false);
    }
  }
  function receipt(doc, party) {
    const c = doc.calc;
    const shop = s.legalName || store.me.brand?.shopName || '';
    const text = [
      `${shop} — رسید معامله ${fa(doc.no)} · ${jd(doc.date)} ${timeFa(doc.issuedAt)}`,
      party ? `مشتری: ${party.party.label}` : '',
      ...c.lines.map((l) => `${l.priced ? (l.dir === 'in' ? 'خرید' : 'فروش') : l.dir === 'in' ? 'دریافت جنس' : 'تحویل جنس'} ${TR.TRADE_KINDS[l.kind]}: ${describe(l)}${l.priced ? ` = ${R(l.value)}` : ''}`),
      ...c.payments.map((p, i) => `${p.dir === 'in' ? 'دریافت' : 'پرداخت'} ${B.payMethod(p.method).label}: ${R(p.value)}${doc.payments[i]?.ref ? ` (پیگیری ${fa(doc.payments[i].ref)})` : ''}`),
      party ? `مانده حساب: ${balUnits(party.balance).map((u) => `${party.balance[u] > 0 ? 'بدهکار' : 'بستانکار'} ${unitAmt(u, Math.abs(party.balance[u]))}`).join(' · ') || 'بی‌حساب'}` : '',
      `کد اصالت: ${doc.verify}`,
    ].filter(Boolean).join('\n');
    modal(
      String(html`<div class="printable dk-receipt"><div class="dk-r-head">${crown({ size: 56 })}<b>${shop}</b><span>رسید معامله ${fa(doc.no)} · ${jd(doc.date)} ${timeFa(doc.issuedAt)}</span></div>
        ${party ? html`<p><b>مشتری:</b> ${party.party.label} · کد ${fa(party.party.code)}</p>` : ''}
        <table class="table-plain">${c.lines.map((l) => html`<tr><td>${l.priced ? (l.dir === 'in' ? 'خرید' : 'فروش') : l.dir === 'in' ? 'دریافت جنس' : 'تحویل جنس'} ${TR.TRADE_KINDS[l.kind]}<small>${describe(l)}</small></td><td class="num">${l.priced ? R(l.value) : unitAmt(l.unit, l.amt)}</td></tr>`)}
        ${c.payments.map((p, i) => html`<tr><td>${p.dir === 'in' ? 'دریافت' : 'پرداخت'} · ${B.payMethod(p.method).label}${doc.payments[i]?.ref ? html`<small>پیگیری ${fa(doc.payments[i].ref)}</small>` : ''}</td><td class="num">${R(p.value)}</td></tr>`)}</table>
        ${party ? html`<div class="dk-after"><span>مانده حساب پس از این سند</span>${balChips(party.balance)}</div>` : ''}
        <p class="small ltr-num">کد اصالت ${doc.verify}</p></div>
        <div class="actions"><button class="btn" data-r="print">چاپ رسید</button><button class="btn ghost" data-r="share">ارسال / کپی متن</button><a class="btn ghost" href="/books/doc/${doc.id}" data-link data-close>سند کامل</a><button class="btn ghost" data-close>معامله بعدی</button></div>`),
      (m) =>
        m.addEventListener('click', async (e) => {
          const b = e.target.closest('[data-r]');
          if (!b) return;
          if (b.dataset.r === 'print') window.print();
          else if (navigator.share) navigator.share({ text }).catch(() => {});
          else {
            await navigator.clipboard?.writeText(text).catch(() => {});
            toast('متن رسید کپی شد.', 'ok');
          }
        }),
    );
  }

  /* ---------------- hawala, convert, conditional ---------------- */
  async function partySelect(name) {
    const list = (await api('/api/books/parties')).items;
    return html`<select class="input" name="${name}" required><option value="">— انتخاب —</option>${list.map((p) => html`<option value="${p.id}">${p.label} · کد ${fa(p.code)}</option>`)}</select>`;
  }
  const unitOptions = () => html`<option value="IRR">ریال</option><option value="G750">گرم طلای ۷۵۰</option>${Object.entries(COIN_TYPES).map(([id, c]) => html`<option value="COIN:${id}">سکه ${c.short}</option>`)}${Object.entries(TR.FX_CODES).map(([c, n]) => html`<option value="FX:${c}">${n}</option>`)}`;
  async function hawala() {
    modal(
      String(html`<h3 class="bk-h">حواله بین دو طرف حساب</h3><p class="small">مثال: مهران می‌گوید ۱۰ گرم طلای من را به حساب بنکدار نور بزن. «از» بدهکار می‌شود، «به» بستانکار.</p>
        <form class="form" id="hw"><label class="field">از حساب${await partySelect('from')}</label><label class="field">به حساب${await partySelect('to')}</label>
        <div class="form cols"><label class="field">واحد<select class="input" name="unit">${unitOptions()}</select></label><label class="field">مقدار<input class="input ltr" name="amount" required inputmode="decimal"></label></div>
        <label class="field">یادداشت<input class="input" name="note"></label><p class="err" id="hwerr"></p><div class="actions"><button class="btn">ثبت حواله</button><button class="btn ghost" type="button" data-close>انصراف</button></div></form>`),
      (m, close) =>
        $('#hw', m).addEventListener('submit', async (e) => {
          e.preventDefault();
          const f = Object.fromEntries(new FormData(e.target));
          try {
            const d = await api('/api/books/docs', { method: 'POST', body: { type: 'hawala', hawala: { from: f.from, to: f.to, unit: f.unit, amount: f.amount }, note: f.note } });
            close();
            toast(`حواله ${fa(d.no)} ثبت شد.`, 'ok');
            if (S.party && [f.from, f.to].includes(S.party.id)) pickParty(S.party);
          } catch (err) {
            $('#hwerr', m).textContent = err.message;
          }
        }),
    );
  }
  function convert() {
    if (!S.party) return toast('اول مشتری را انتخاب کنید.', 'error');
    const b = S.party.balance ?? {};
    const units = balUnits(b).filter((u) => u !== 'IRR' && !u.startsWith('BAR:'));
    if (!units.length) return toast('این مشتری مانده جنسی ندارد.', 'error');
    const priceOf = (u) => (u === 'G750' ? mazFor(b[u] > 0 ? 'out' : 'in') : u.startsWith('COIN:') ? coinFor(u.slice(5), b[u] > 0 ? 'out' : 'in') : u === 'FX:USD' ? liveOf('usd') ?? '' : '');
    modal(
      String(html`<h3 class="bk-h">تبدیل مانده جنسی به ریال — ${S.party.label}</h3><p class="small">مانده جنسی با نرخ روز به مانده ریالی تبدیل می‌شود (مثل فروش یا خرید همان مقدار روی حساب).</p>
        <form class="form" id="cv"><label class="field">مانده<select class="input" name="unit">${units.map((u) => html`<option value="${u}" data-amt="${b[u]}">${b[u] > 0 ? 'بدهکار' : 'بستانکار'} ${unitAmt(u, Math.abs(b[u]))}</option>`)}</select></label>
        <div class="form cols"><label class="field">مقدار (مثبت = بدهی جنسی مشتری)<input class="input ltr" name="amount" value="${b[units[0]]}" inputmode="decimal"></label><label class="field" id="cvp">${units[0] === 'G750' ? 'مظنه (ریال)' : 'نرخ هر واحد (ریال)'}<input class="input ltr" name="price" value="${priceOf(units[0])}" inputmode="numeric"></label></div>
        <p class="dk-live" id="cvout"></p><p class="err" id="cverr"></p><div class="actions"><button class="btn">ثبت تبدیل</button><button class="btn ghost" type="button" data-close>انصراف</button></div></form>`),
      (m, close) => {
        const f = $('#cv', m);
        const show = () => {
          const u = f.elements.unit.value;
          try {
            const c = B.calcDoc({ type: 'convert', partyId: S.party.id, convert: u === 'G750' ? { unit: u, amount: f.elements.amount.value, mazaneh: f.elements.price.value } : { unit: u, amount: f.elements.amount.value, price: f.elements.price.value } }, { round: s.tradeRound ?? 10000 });
            $('#cvout', m).textContent = `${c.net > 0 ? 'بدهی ریالی مشتری' : 'طلب ریالی مشتری'}: ${R(Math.abs(c.net))}`;
          } catch (e) {
            $('#cvout', m).textContent = e.message;
          }
        };
        f.elements.unit.addEventListener('change', () => {
          const u = f.elements.unit.value;
          f.elements.amount.value = b[u];
          f.elements.price.value = priceOf(u);
          show();
        });
        f.addEventListener('input', show);
        show();
        f.addEventListener('submit', async (e) => {
          e.preventDefault();
          const u = f.elements.unit.value;
          try {
            const d = await api('/api/books/docs', { method: 'POST', body: { type: 'convert', partyId: S.party.id, convert: u === 'G750' ? { unit: u, amount: f.elements.amount.value, mazaneh: f.elements.price.value } : { unit: u, amount: f.elements.amount.value, price: f.elements.price.value } } });
            close();
            toast(`تبدیل ${fa(d.no)} ثبت شد.`, 'ok');
            pickParty(S.party);
          } catch (err) {
            $('#cverr', m).textContent = err.message;
          }
        });
      },
    );
  }
  async function conditional() {
    const r = await api('/api/books/conditional');
    modal(
      String(html`<h3 class="bk-h">آبشده شرطی</h3><p class="small">عیار آزمایشگاه را وارد کنید؛ سند نسخه جدید می‌گیرد و مانده مشتری خودکار اصلاح می‌شود.</p>
        <table class="table-plain">${r.items.map((x) => html`<tr><td>${jd(x.date)} · سند ${fa(x.no)}<small> ${x.party ?? ''}</small></td><td>${G(x.weight)} گرم · عیار موقت ${fa(x.fineness)}</td><td><input class="input ltr sm" data-assay="${x.doc}" data-line="${x.line}" placeholder="عیار نهایی" inputmode="decimal"></td><td><button class="chip" data-set="${x.doc}" data-line="${x.line}">ثبت</button></td></tr>`)}</table><div class="actions"><button class="btn ghost" data-close>بستن</button></div>`),
      (m) =>
        m.addEventListener('click', async (e) => {
          const b = e.target.closest('[data-set]');
          if (!b) return;
          const v = $(`[data-assay="${b.dataset.set}"][data-line="${b.dataset.line}"]`, m).value;
          try {
            await api(`/api/books/docs/${b.dataset.set}/assay`, { method: 'POST', body: { line: Number(b.dataset.line), fineness: v } });
            toast('عیار ثبت شد و مانده اصلاح شد.', 'ok');
            b.closest('tr').remove();
          } catch (err) {
            toast(err.message, 'error');
          }
        }),
    );
  }

  /* ---------------- events ---------------- */
  root.addEventListener('input', (e) => {
    const el = e.target;
    if (el.id === 'pq') {
      clearTimeout(pqT);
      pqT = setTimeout(() => findParty(el.value), 180);
    } else if (el.dataset.f) {
      const f = S.f[S.kind];
      f[el.dataset.f] = el.type === 'checkbox' ? el.checked : el.value;
      if (el.dataset.f === 'code') (f.rate = el.value === 'USD' ? liveOf('usd') ?? '' : ''), drawForm();
      else liveLine();
    } else if (el.dataset.p !== undefined) {
      S.payments[Number(el.dataset.p)][el.dataset.k] = el.value;
      if (el.dataset.k === 'dir') drawPays();
      recalc();
    } else if (el.id === 'note') {
      S.note = el.value;
      recalc();
    }
  });
  // money typed as bare digits is hard to read: show it grouped, in rial and toman, right under the box
  const MONEY_KEYS = new Set(['mazaneh', 'g750', 'amount', 'price', 'gramPrice', 'rate', 'fee']);
  function hint(el) {
    if (!(MONEY_KEYS.has(el.dataset.f) || el.dataset.k === 'amount')) return;
    const box = el.closest('label, .field');
    if (!box) return;
    let h = box.querySelector('.dk-hint');
    if (!h) box.append((h = Object.assign(document.createElement('small'), { className: 'dk-hint' })));
    const v = B.num(el.value);
    const t = el.value && Number.isFinite(v) && v > 0 ? `${R(v)} = ${B.fmtMoney(Math.round(v / 10), 'rial', { unit: false })} تومان` : '';
    if (h.textContent !== t) h.textContent = t; // unchanged text must not re-trigger the observer
  }
  const hintAll = () => $$('[data-f], [data-k=amount]', root).forEach(hint);
  new MutationObserver(hintAll).observe(root, { childList: true, subtree: true });
  root.addEventListener('input', (e) => e.target.dataset && hint(e.target));
  root.addEventListener('change', (e) => {
    if (e.target.matches('select[data-f], select[data-p], input[type=checkbox][data-f]')) e.target.dispatchEvent(new Event('input', { bubbles: true }));
  });
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.closest('#form') && !e.ctrlKey) {
      e.preventDefault();
      addLine();
    }
  });
  const onKey = (e) => {
    if (e.key === 'F2') {
      e.preventDefault();
      $('#pq', root)?.focus();
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      save($('.dk-save [data-act=save]', root));
    }
  };
  document.addEventListener('keydown', onKey);
  root.addEventListener('click', async (e) => {
    const b = e.target.closest('button, [data-pick]');
    if (!b) return;
    if (b.dataset.pick) return pickParty($('#pdrop', root)._items.find((x) => x.id === b.dataset.pick));
    if (b.dataset.mode) {
      S.mode = b.dataset.mode;
      resetForm();
      return drawForm();
    }
    if (b.dataset.kind) {
      S.kind = b.dataset.kind;
      return drawForm();
    }
    if (b.dataset.seg) {
      S.f[S.kind][b.dataset.seg] = b.dataset.v;
      return drawForm();
    }
    if (b.dataset.fq) {
      S.f.melt.fineness = Number(b.dataset.fq);
      return drawForm();
    }
    if (b.dataset.coin) {
      S.f.coin.coin = b.dataset.coin;
      S.f.coin.price = coinFor(b.dataset.coin, dir());
      return drawForm();
    }
    if (b.dataset.step) {
      S.f.coin.count = Math.max(1, (Number(B.num(S.f.coin.count)) || 0) + Number(b.dataset.step));
      return drawForm();
    }
    if (b.dataset.use) {
      const v = Number(b.dataset.v);
      if (b.dataset.use === 'maz') {
        if (S.kind === 'melt') Object.assign(S.f.melt, { basis: 'mazaneh', mazaneh: v });
        else if (S.kind === 'bar') Object.assign(S.f.bar, { basis: 'mazaneh', mazaneh: v });
        else return toast('مظنه برای آبشده و شمش است.');
      } else if (b.dataset.use === 'g750' && S.kind === 'melt') Object.assign(S.f.melt, { basis: 'gram750', g750: v });
      else if (b.dataset.use.startsWith('coin:')) {
        S.kind = 'coin';
        Object.assign(S.f.coin, { coin: b.dataset.use.slice(5), basis: 'count', price: v });
      } else if (b.dataset.use.startsWith('fx:')) {
        S.kind = 'fx';
        Object.assign(S.f.fx, { code: b.dataset.use.slice(3), rate: v });
      }
      return drawForm();
    }
    if (b.dataset.del !== undefined) {
      S.lines.splice(Number(b.dataset.del), 1);
      drawLines();
      return recalc();
    }
    if (b.dataset.pm) {
      const m = B.payMethod(b.dataset.pm);
      if (m.id === 'offset' && !S.party) return toast('تهاتر با مانده مشتری است؛ مشتری را انتخاب کنید.', 'error');
      S.payments.push({ method: m.id, dir: 'in', account: m.acct === 'cash' ? cash[0]?.id : m.acct === 'bank' ? banks[0]?.id : undefined, amount: '' });
      drawPays();
      fill(S.payments.length - 1);
      $(`[data-p="${S.payments.length - 1}"][data-k=amount]`, root)?.focus();
      return recalc();
    }
    if (b.dataset.pdel !== undefined) {
      S.payments.splice(Number(b.dataset.pdel), 1);
      drawPays();
      return recalc();
    }
    if (b.dataset.fill !== undefined) return fill(Number(b.dataset.fill));
    const act = b.dataset.act;
    if (act === 'add') addLine();
    else if (act === 'save') save(b);
    else if (act === 'pnew') newParty();
    else if (act === 'pclear') {
      S.party = null;
      resetForm();
      drawParty();
      drawForm();
      recalc();
      $('#pq', root)?.focus();
    } else if (act === 'hawala') hawala();
    else if (act === 'convert') convert();
    else if (act === 'cond') conditional();
    else if (act === 'restore') {
      Object.assign(S, { lines: draft.lines ?? [], payments: draft.payments ?? [], note: draft.note ?? '' });
      if (draft.partyId) await pickParty({ id: draft.partyId }).catch(() => {});
      $('.dk-draft', root)?.remove();
      $('#note', root).value = S.note;
      drawLines();
      drawPays();
      recalc();
    } else if (act === 'drop') {
      ls.set(null);
      $('.dk-draft', root)?.remove();
    }
  });
  // live prices refresh every minute while the desk is open
  const timer = setInterval(async () => {
    board = (await api('/api/market').catch(() => null)) ?? board;
    drawPrices();
  }, 60000);
  drawPrices();
  drawParty();
  drawForm();
  drawLines();
  drawPays();
  recalc();
  $('#pq', root)?.focus();
  return () => {
    clearInterval(timer);
    document.removeEventListener('keydown', onKey);
  };
}
