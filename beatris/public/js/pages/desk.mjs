// میز معامله — the base edition's counter for coin and molten-gold dealers. One screen: pick the customer (their
// rial, gold, coin, currency and bar balances in view), choose buy / sell / goods in / goods out, type the numbers
// (the مظنه comes from the live board with the shop's spread), take money any way it comes, save. Everything is
// in rial and computed by the same engine the server books with, so the receipt, the day book and the customer's
// statement agree to the last rial.
import { liveBoard } from '../stream.mjs';
import { html, raw, esc, fa, api, store, toast, navigate, $, $$, busy } from '../core.mjs';
import * as B from '../books.mjs';
import * as TR from '../trade.mjs';
import { TRADE_COINS as COIN_TYPES, shownCoins } from '../coins.mjs';
import { booksPrefs, prefs, R, G, jd, jdInput, parseDay, today, modal, balChips, unitLabel, unitVal, unitAmt, balUnits, timeFa, describeLine, lineVerb, balSentence, shownFx } from '../bk.mjs';
import { booksNav } from './books.mjs';
import { crown } from '../invoice.mjs';
import { track } from '../harness.mjs';
import { barcodeSvg } from '../barcode.mjs';
import { qrSvg } from '../qr.mjs';
import { pickerHtml, productModal, templateModal, canManageProducts } from '../deskproducts.mjs';
import { posConfig, posProblem, startCharge, newChargeId, logCharge, linkCharge, STATE_TEXT, chargeLine } from '../pos.mjs';
import { createHistory, mountDock } from '../undo.mjs';
import { morphText } from '../motion.mjs';
import { parseLine, describe as describeParsed, resolveMazaneh, explainMazaneh, missing as missingOf } from '../oneline.mjs';
import { drafts, submit, onOutbox, take } from '../outbox.mjs';

const MODES = [
  ['buy', 'خرید از مشتری', 'مشتری می‌فروشد · ما پول می‌دهیم', 'in', true],
  ['sell', 'فروش به مشتری', 'مشتری می‌خرد · پول می‌گیریم', 'out', true],
  ['in', 'دریافت جنس', 'امانت یا تسویه جنسی · بدون قیمت', 'in', false],
  ['out', 'تحویل جنس', 'پس دادن امانت یا بدهی جنسی', 'out', false],
];
const KINDS = [
  ['melt', 'آبشده'],
  ['coin', 'سکه و محصولات'],
  ['bar', 'شمش پلمپ'],
  ['fx', 'ارز'],
];
const MONEY_METHODS = ['cash', 'pos', 'c2c', 'slip', 'a2a', 'satna', 'paya', 'pol', 'havale', 'cheque', 'gateway', 'offset'];
const COIN_BOARD = { bahar: 'sekeb', emami: 'sekee', halfOld: 'nim', half: 'nim', quarterOld: 'rob', quarter: 'rob', gerami: 'gerami' };
const FINENESS_QUICK = [705, 720, 730, 735, 740, 745, 750, 900, 995];
const DRAFT = 'beatris.desk.draft'; // legacy (localStorage) draft, migrated once into the local store
const FIELD_FA = { weight: 'وزن', fineness: 'عیار', mazaneh: 'مظنه', g750: 'قیمت گرم ۷۵۰', amount: 'مبلغ', count: 'تعداد', price: 'قیمت هر سکه', gramPrice: 'قیمت هر گرم', serial: 'سریال', brand: 'ضامن', gallery: 'گالری', sealDate: 'تاریخ پلمپ', fee: 'اجرت پلمپ', code: 'ارز', fxAmount: 'مقدار ارز', rate: 'نرخ', conditional: 'شرطی' };
const PAYK_FA = { amount: 'مبلغ', account: 'حساب', ref: 'پیگیری', card: 'کارت', dir: 'جهت', chequeNo: 'شماره چک', sayad: 'صیادی', bank: 'بانک', dueJ: 'سررسید' };
const KIND_FA = Object.fromEntries(KINDS);
const MODE_FA = Object.fromEntries(MODES.map((m) => [m[0], m[1]]));
const BASIS_FA = { mazaneh: 'مظنه', gram750: 'گرم ۷۵۰', amount: 'مبلغ توافقی', count: 'تعدادی', weight: 'وزنی' };
const lsj = {
  get(k, d) {
    try {
      return JSON.parse(localStorage.getItem(k) ?? 'null') ?? d;
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {
      /* storage unavailable */
    }
  },
};
const LAST_KEY = 'beatris.desk.lastByMode', MACRO_KEY = 'beatris.desk.macros', LASTDOC_KEY = 'beatris.desk.lastDoc';

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
    const c = liveOf(COIN_BOARD[id]) ?? COIN_TYPES[id]?.price ?? null;
    return c ? c + (dir === 'in' ? -spread().cBuy : spread().cSell) : '';
  };

  /* ---------------- state ---------------- */
  const S = { party: null, mode: 'buy', kind: 'melt', f: {}, lines: [], payments: [], note: '', amend: null, sugg: {} };
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

  root.innerHTML = String(html`${booksNav('desk')}
    <section class="dk-prices" id="prices" aria-label="قیمت‌های زنده"></section>
    <div id="posOrphans"></div>
    ${cond.items.length ? html`<button class="notice dk-cond" data-act="cond">⚖ ${fa(cond.items.length)} آبشده شرطی منتظر عیار آزمایشگاه است — ثبت عیار</button>` : ''}
    <div id="dkNotice"></div>
    <section class="dk-cmd" id="dkCmd" aria-label="ورود سریع">
      <div class="dk-cmd-f"><span class="dk-cmd-ic" aria-hidden="true">⌘</span><input class="input" id="dkLine" data-caret autocomplete="off" spellcheck="false" aria-keyshortcuts="F3" placeholder="یک خط بنویسید: خرید رضایی ۱۲٫۴۵ گرم عیار ۷۵۰ نقد — Enter (F3)"></div>
      <div class="dk-cmd-out" id="dkLineOut" aria-live="polite"></div>
      <div class="dk-quick-row" id="dkQuick"></div>
      <div class="dk-help" id="dkHelp" hidden></div>
    </section>
    <div class="dk">
      <div class="dk-main">
        <div id="dkAmend"></div>
        <section class="tray dk-party" id="party"></section>
        <section class="dk-modes" role="radiogroup" aria-label="نوع معامله">${MODES.map(([k, t, sub]) => html`<button class="dk-mode ${k}" data-mode="${k}" role="radio" aria-checked="${S.mode === k}"><b>${t}</b><span>${sub}</span></button>`)}</section>
        <section class="tray dk-form">
          <nav class="dk-kinds" role="tablist">${KINDS.map(([k, t]) => html`<button role="tab" data-kind="${k}" aria-selected="${S.kind === k}">${t}</button>`)}</nav>
          <div id="form"></div>
          <div class="dk-quote" id="dkQuote"></div>
          <div class="dk-live" id="live" aria-live="polite"></div>
          <div class="dk-add"><button class="btn" data-act="add">افزودن به سند <kbd>Enter</kbd></button></div>
        </section>
        <section class="dk-lines" id="lines"></section>
        <section class="tray dk-pay"><h3 class="bk-h">دریافت و پرداخت وجه</h3><div class="bk-methods">${MONEY_METHODS.map((m) => html`<button class="chip" data-pm="${m}">${B.payMethod(m).label}</button>`)}</div><div id="pays"></div>
          <label class="field">یادداشت<input class="input" id="note" maxlength="600" placeholder="مثلاً: تحویل فردا، آزمایشگاه عیار…"></label></section>
        <section class="dk-more"><button class="btn ghost small" data-act="hawala">حواله بین دو طرف حساب</button><button class="btn ghost small" data-act="convert">تبدیل مانده جنسی به ریال</button><a class="btn ghost small" href="/books/day" data-link>روزنگار امروز</a><a class="btn ghost small" href="/books/vault" data-link>گاوصندوق</a></section>
      </div>
      <aside class="dk-side"><section class="dk-rpanel" id="dkReceipt" hidden aria-label="رسید سند ثبت‌شده"></section><p class="dk-sentence" id="dkSentence" aria-live="polite"></p><div class="tray dk-sum" id="sum"></div><div class="dk-save"><button class="btn block" data-act="save">ثبت سند <kbd>Ctrl+Enter</kbd></button></div></aside>
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
    // four prices in view (what the counter quotes from); the rest one click away — fewer numbers on the screen
    const allP = (() => { try { return localStorage.getItem('beatris.desk.allPrices') === '1'; } catch { return false; } })();
    const shown = allP ? tiles : tiles.filter(([id]) => ['mesghal', 'geram18', 'sekee', 'rob'].includes(id));
    $('#prices', root).innerHTML = String(html`${shown.map(([id, label, use]) => {
      const v = liveOf(id);
      const x = board?.items?.find((i) => i.id === id);
      return v ? html`<button class="dk-price" data-use="${use}" data-v="${v}" title="بگذار در فرم"><span>${label}</span><b>${R(v).replace(' ریال', '')}</b>${x?.pct ? html`<em class="${x.pct > 0 ? 'up' : 'down'}">${x.pct > 0 ? '▲' : '▼'}${fa(Math.abs(x.pct).toFixed(2))}٪</em>` : ''}</button>` : '';
    })}<button type="button" class="dk-pmore" data-pmore aria-expanded="${allP}">${allP ? 'قیمت‌های کمتر' : 'همه قیمت‌ها'}</button><span class="dk-src">${board?.sample ? 'داده نمونه (قیمت زنده وصل نیست)' : 'ریال · منبع: ' + (board?.source?.label ?? '')}</span>`);
  }

  /* ---------------- customer ---------------- */
  // the customer box opens its own small forms in place (new customer, a note to remember): no windows on top
  let partyForm = null;
  const newPartyHtml = () => html`<form class="form dk-inform" id="np" autocomplete="off"><h3 class="bk-h">مشتری جدید</h3><label class="field">نام و نام خانوادگی<input class="input" name="name" required maxlength="120"></label>
      <div class="form cols"><label class="field">موبایل<input class="input ltr" name="mobile" inputmode="tel"></label><label class="field">لقب / شهرت<input class="input" name="alias"></label></div>
      <div class="form cols"><label class="field">نام پدر<input class="input" name="father"></label><label class="field">شهر<input class="input" name="city"></label><label class="field">گروه<input class="input" name="group" list="dk-groups"></label></div>
      <datalist id="dk-groups">${Object.keys(s.groups ?? {}).map((g) => html`<option value="${g}">`)}</datalist>
      <label class="field">کد ملی<input class="input ltr" name="nid" inputmode="numeric"></label>
      <p class="err" id="nperr" role="alert"></p><div class="actions"><button class="btn">ثبت و انتخاب</button><button class="btn ghost" type="button" data-act="pcancel">انصراف <kbd>Esc</kbd></button></div></form>`;
  const noteHtml = () => html`<form class="form dk-inform" id="nf"><p class="small">هر بار این مشتری انتخاب شود نشان داده می‌شود (مثلاً «فقط با کارت ملت می‌پردازد»).</p><textarea class="input" name="text" rows="2" maxlength="400" required></textarea><p class="err" id="nferr"></p><div class="actions"><button class="btn small">به خاطر بسپار</button><button class="btn small ghost" type="button" data-act="pcancel">انصراف</button></div></form>`;
  function drawParty() {
    const box = $('#party', root);
    if (!S.party) {
      box.innerHTML = String(html`<div class="dk-find"><input class="input" id="pq" placeholder="مشتری: نام، لقب، نام پدر، شهر، موبایل، کد (F2)" autocomplete="off" aria-keyshortcuts="F2" role="combobox" aria-controls="pdrop" aria-expanded="false"><button class="btn small ghost" data-act="pnew" aria-keyshortcuts="Alt+N">+ مشتری جدید</button><div class="bk-drop" id="pdrop" role="listbox" hidden></div></div>
        ${partyForm === 'new' ? newPartyHtml() : html`<p class="small">معامله نقدی کامل بدون مشتری هم ثبت می‌شود؛ برای مانده، امانت و جنس، مشتری لازم است.</p>`}`);
      if (partyForm === 'new') $('#np [name=name]', box)?.focus();
      return;
    }
    const p = S.party;
    const h = S.habits;
    const habit = h && (h.pay || h.fineness || h.coin || h.weight || h.memory?.length)
      ? html`<div class="dk-mem"><span class="dk-mem-t">حافظه${h.trades ? ` · از ${fa(h.trades)} معامله` : ''}</span>
          ${h.pay ? html`<button class="chip" data-act="habitpay" title="افزودن همین روش پرداخت (Alt+P)">${B.payMethod(h.pay.method)?.label}${h.pay.accountTitle ? ` · ${h.pay.accountTitle}` : ''} <small>${fa(h.pay.n)}/${fa(h.pay.of)}</small></button>` : ''}
          ${h.fineness ? html`<span class="chip">عیار ${fa(h.fineness.value)} <small>${fa(h.fineness.n)}/${fa(h.fineness.of)}</small></span>` : ''}
          ${h.coin ? html`<span class="chip">${COIN_TYPES[h.coin.value]?.short}</span>` : ''}
          ${h.weight ? html`<span class="chip">معمولاً ${G(h.weight.p10)}–${G(h.weight.p90)} گرم</span>` : ''}
          ${(h.memory ?? []).map((m) => html`<p class="dk-note">📌 ${m.text} <small>${m.by}</small></p>`)}
          <button class="chip ghost" data-act="note">+ یادداشت برای این مشتری</button></div>`
      : html`<div class="dk-mem"><button class="chip ghost" data-act="note">+ یادداشت برای این مشتری</button></div>`;
    box.innerHTML = String(html`<div class="dk-who"><div><b>${p.label}</b><span class="small">کد ${fa(p.code)}${p.mobile ? html` · ${fa(p.mobile)}` : ''}${p.group ? html` · گروه ${p.group}` : ''}</span></div><div class="dk-who-a"><a class="chip" href="/books/party/${p.id}" data-link>ریز حساب</a><button class="chip" data-act="pclear">تغییر مشتری</button></div></div><div class="dk-bal">${balChips(p.balance ?? {})}</div>${habit}${partyForm === 'note' ? noteHtml() : ''}`);
    if (partyForm === 'note') $('#nf textarea', box)?.focus();
  }
  let pqT;
  async function findParty(q) {
    const drop = $('#pdrop', root);
    if (!drop) return;
    if (!q.trim()) return (drop.hidden = true), $('#pq', root)?.setAttribute('aria-expanded', 'false');
    const r = await api(`/api/books/parties?q=${encodeURIComponent(q)}`);
    if (!drop.isConnected) return;
    drop.hidden = false;
    $('#pq', root)?.setAttribute('aria-expanded', 'true');
    drop._items = r.items;
    drop.innerHTML = r.items.length ? r.items.slice(0, 15).map((p, i) => String(html`<button data-pick="${p.id}" role="option" class="${i ? '' : 'on'}" tabindex="-1"><b>${p.label}</b><span>کد ${fa(p.code)}${p.group ? ` · ${p.group}` : ''}</span><em>${balChips(p.balance)}</em></button>`)).join('') : '<p class="small">پیدا نشد؛ «مشتری جدید» را بزنید (Alt+N).</p>';
  }
  /** Arrow keys walk the list in place, Enter takes the highlighted one: no page, no window. */
  function dropNav(e) {
    const drop = $('#pdrop', root);
    const items = drop && !drop.hidden ? [...drop.querySelectorAll('[data-pick]')] : [];
    if (!items.length) return false;
    const i = items.findIndex((x) => x.classList.contains('on'));
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const j = Math.max(0, Math.min(items.length - 1, (i < 0 ? -1 : i) + (e.key === 'ArrowDown' ? 1 : -1)));
      items.forEach((x, k) => x.classList.toggle('on', k === j));
      items[j].scrollIntoView({ block: 'nearest' });
      return true;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      (items[i] ?? items[0]).click();
      return true;
    }
    return false;
  }
  async function pickParty(p, { keepForm = false, silent = false } = {}) {
    const [full, habits] = await Promise.all([api(`/api/books/parties/${p.id}`), api(`/api/books/learn/party/${p.id}`).catch(() => null)]);
    S.party = { ...full.party, balance: full.balance };
    S.habits = habits;
    partyForm = null;
    track('desk.party', { trades: habits?.trades ?? 0 });
    if (!keepForm) {
      resetForm();
      applyDefaults();
    }
    drawParty();
    drawForm();
    recalc();
    if (!silent) step(`مشتری: ${S.party.label}`, { focus: '#pq' });
    if (!keepForm) focusFirst();
  }
  /** Fresh balances and habits for the customer already on the desk (after a restore), the form untouched. */
  async function refreshParty() {
    if (!S.party) return;
    try {
      const [full, habits] = await Promise.all([api(`/api/books/parties/${S.party.id}`), api(`/api/books/learn/party/${S.party.id}`).catch(() => null)]);
      S.party = { ...full.party, balance: full.balance };
      S.habits = habits;
      drawParty();
      recalc();
      hist.sync();
    } catch {
      /* offline: the stored copy stays */
    }
  }
  /**
   * پیش‌فرض هوشمند (spec 0013): per customer and trade type — what this customer usually brings or takes for this
   * direction (kind, fineness, coin, price basis) and how money moves (method + account). Without a customer, what
   * this device last used for the same trade type. Every filled-in value says «پیشنهاد» until it is touched.
   */
  function applyDefaults() {
    S.sugg = {};
    const d = dir();
    const h = S.habits?.byDir?.[d];
    const dev = lsj.get(LAST_KEY, {})[S.mode] ?? null;
    const strong = (m) => m && m.n >= 2 && m.n / m.of >= 0.5;
    if (!S.lines.length && !kindTouched) {
      const kind = strong(h?.kind) ? h.kind.value : dev?.kind;
      if (kind && KIND_FA[kind] && kind !== S.kind) (S.kind = kind), (S.sugg.kind = true);
    }
    const fin = h?.fineness?.value ?? dev?.fineness;
    if (fin) (S.f.melt.fineness = fin), (S.sugg.fineness = true);
    const coin = h?.coin?.value ?? dev?.coin;
    if (coin && COIN_TYPES[coin]) Object.assign(S.f.coin, { coin, price: coinFor(coin, d) }), (S.sugg.coin = true);
    const basis = h?.basis?.value ?? dev?.basis;
    if (priced() && basis) {
      if (S.kind === 'melt' && ['mazaneh', 'gram750', 'amount'].includes(basis)) (S.f.melt.basis = basis), (S.sugg.basis = true);
      if (S.kind === 'coin' && ['count', 'weight', 'amount'].includes(basis)) (S.f.coin.basis = basis), (S.sugg.basis = true);
    }
    S.defPay = h?.pay ?? dev?.pay ?? null;
  }
  const FIRST = '[data-f=weight], [data-f=count], [data-f=serial], [data-f=fxAmount]';
  const focusFirst = () => requestAnimationFrame(() => $(FIRST, $('#form', root))?.focus());

  /* ---------------- the line form ---------------- */
  const sg = (k) => (S.sugg?.[k] ? html`<i class="dk-sg" title="از معاملات قبلی همین مشتری یا همین دستگاه">پیشنهاد</i>` : '');
  const inp = (k, v, label, { ltr = true, ph = '', list = '', w = '' } = {}) => html`<label class="field dk-f ${w} ${S.sugg?.[k] ? 'dk-sugg' : ''}"><span>${label}${sg(k)}</span><input class="input ${ltr ? 'ltr' : ''}" data-f="${k}" value="${v ?? ''}" placeholder="${ph}" ${ltr ? raw('inputmode="decimal"') : ''} ${list ? raw(`list="${list}"`) : ''} autocomplete="off"></label>`;
  const seg = (k, v, opts) => html`<div class="seg dk-seg ${S.sugg?.[k] ? 'dk-sugg' : ''}">${opts.map(([val, label]) => html`<button type="button" data-seg="${k}" data-v="${val}" aria-pressed="${v === val}">${label}</button>`)}${sg(k)}</div>`;
  /** The fields a line cannot do without, in the order they are typed (the «next step» is the first empty one). */
  function required() {
    const f = S.f[S.kind];
    const P = priced();
    if (S.kind === 'melt') return ['weight', 'fineness', ...(P ? [f.basis === 'mazaneh' ? 'mazaneh' : f.basis === 'gram750' ? 'g750' : 'amount'] : [])];
    if (S.kind === 'coin') return ['count', ...(P ? [f.basis === 'count' ? 'price' : f.basis === 'weight' ? 'weight' : 'amount'] : [])].concat(P && f.basis === 'weight' ? ['gramPrice'] : []);
    if (S.kind === 'bar') return ['serial', 'weight', 'fineness', ...(P ? [f.basis === 'mazaneh' ? 'mazaneh' : 'amount'] : [])];
    return ['fxAmount', ...(P ? ['rate'] : [])];
  }
  const nextEmpty = () => required().map((k) => $(`[data-f="${k}"]`, $('#form', root))).find((el) => el && !String(el.value).trim()) ?? null;
  const lineReady = () => required().every((k) => String(S.f[S.kind][k] ?? '').trim() !== '');
  function markNext() {
    $$('.dk-next', root).forEach((x) => x.classList.remove('dk-next'));
    const el = nextEmpty();
    (el?.closest('label, .field') ?? (formTouched && lineReady() ? $('.dk-add', root) : null))?.classList.add('dk-next');
  }
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
      body = html`<div id="dkPick">${pickerHtml(f, S.psearch ?? '', canManageProducts())}</div>
        <div class="dk-grid"><div class="field dk-f big"><span>تعداد</span><div class="dk-step"><button type="button" data-step="-1" aria-label="کم">−</button><input class="input ltr" data-f="count" value="${f.count}" inputmode="numeric"><button type="button" data-step="1" aria-label="زیاد">+</button></div></div>
        ${P ? (f.basis === 'count' ? inp('price', f.price, 'قیمت هر سکه (ریال)', { w: 'big' }) : f.basis === 'weight' ? html`${inp('weight', f.weight, 'وزن کل (گرم)')}${inp('gramPrice', f.gramPrice, 'قیمت هر گرم (ریال)')}` : inp('amount', f.amount, 'مبلغ کل (ریال)', { w: 'big' })) : ''}</div>
        ${P ? seg('basis', f.basis, [['count', 'تعدادی'], ['weight', 'وزنی'], ['amount', 'مبلغی']]) : ''}`;
    else if (S.kind === 'bar')
      body = html`<div class="dk-grid">${inp('serial', f.serial, 'سریال شمش', { ph: 'مثلاً ۳۳۰۷۰۲۱', w: 'big' })}${inp('brand', f.brand, 'ضامن / برند', { ltr: false, list: 'dk-brands' })}${inp('gallery', f.gallery, 'گالری / کد پلمپ‌کننده', { ltr: false })}</div>
        <datalist id="dk-brands"><option value="زربد"></option><option value="بدون پلمپ"></option></datalist>
        <div class="dk-grid">${inp('weight', f.weight, 'وزن خالص (گرم)')}${inp('fineness', f.fineness, 'عیار')}${inp('sealDate', f.sealDate, 'تاریخ پلمپ', { ph: '۱۴۰۳/۰۶/۲۱' })}</div>
        ${P ? html`${seg('basis', f.basis, [['mazaneh', 'مظنه'], ['amount', 'مبلغ توافقی']])}<div class="dk-grid">${f.basis === 'mazaneh' ? inp('mazaneh', f.mazaneh, 'مظنه (ریال)') : inp('amount', f.amount, 'مبلغ کل (ریال)')}${inp('fee', f.fee, 'اجرت پلمپ (ریال، اختیاری)')}</div>` : ''}`;
    else
      body = html`<div class="dk-grid"><label class="field dk-f"><span>ارز</span><select class="input" data-f="code">${shownFx().map(([c, n]) => html`<option value="${c}" ${f.code === c ? 'selected' : ''}>${n} (${c})</option>`)}</select></label>${inp('fxAmount', f.fxAmount, 'مقدار', { w: 'big' })}${P ? inp('rate', f.rate, 'نرخ هر واحد (ریال)', { w: 'big' }) : ''}</div>`;
    $('#form', root).innerHTML = String(body);
    drawQuote();
    $$('[data-kind]', root).forEach((b) => (b.setAttribute('aria-selected', String(b.dataset.kind === S.kind)), b.classList.toggle('dk-sugg', !!S.sugg?.kind && b.dataset.kind === S.kind)));
    $$('[data-mode]', root).forEach((b) => b.setAttribute('aria-checked', String(b.dataset.mode === S.mode)));
    liveLine();
    markNext();
  }
  /* ---------------- مظنه قفل‌شده: lock today's price for the customer, or apply a lock by its code ---------------- */
  let quoteTimer = null;
  function drawQuote() {
    const box = $('#dkQuote', root);
    if (!box) return;
    clearInterval(quoteTimer);
    if (!priced()) return (box.innerHTML = '');
    const q = S.quote;
    if (q && q.kind === S.kind && q.dir === dir()) {
      const tick = () => {
        const left = Math.max(0, Math.round((Date.parse(q.expiresAt) - Date.now()) / 1000));
        const el = $('#dkQLeft', root);
        if (el) el.textContent = left ? `${fa(Math.floor(left / 60))}:${fa(String(left % 60).padStart(2, '0'))}` : 'منقضی شد';
        if (!left) clearInterval(quoteTimer);
      };
      box.innerHTML = String(html`<div class="dk-qon"><b>قیمت قفل‌شده ${q.code}</b><span>${R(q.price)}${q.party ? ` · ${q.party.label}` : ''}</span><span class="dk-qleft" id="dkQLeft"></span><button type="button" class="chip" data-quote-print>برگه مشتری</button><button type="button" class="chip" data-quote-clear>برداشتن</button></div>`);
      tick();
      quoteTimer = setInterval(tick, 1000);
      return;
    }
    box.innerHTML = String(html`<div class="dk-qoff"><button type="button" class="chip" data-quote-lock>قفل همین قیمت برای مشتری</button><label class="dk-qmin">به مدت<select class="input" id="dkQMin">${[5, 10, 15, 30, 60].map((m) => html`<option value="${m}" ${m === 10 ? 'selected' : ''}>${fa(m)} دقیقه</option>`)}</select></label><input class="input ltr" id="dkQCode" placeholder="Q…" aria-label="کد قیمت قفل‌شده"><button type="button" class="chip" data-quote-use>اعمال کد</button></div>`);
  }
  function applyQuote(q) {
    if (q.status !== 'open') return toast(`قیمت ${q.code} ${q.status === 'expired' ? 'منقضی شده' : q.status === 'used' ? 'استفاده شده' : 'لغو شده'} است.`, 'error');
    S.mode = MODES.find((m) => m[3] === q.dir && m[4])[0];
    S.kind = q.kind;
    resetForm();
    const f = S.f[S.kind];
    if (q.kind === 'melt' || q.kind === 'bar') Object.assign(f, { basis: 'mazaneh', mazaneh: String(q.price) });
    if (q.kind === 'coin') Object.assign(f, { coin: q.coin, basis: 'count', price: String(q.price) });
    if (q.kind === 'fx') Object.assign(f, { code: q.fxCode, rate: String(q.price) });
    S.quote = q;
    $$('[data-mode]', root).forEach((b) => b.setAttribute('aria-checked', String(b.dataset.mode === S.mode)));
    drawForm();
  }
  function quotePrice() {
    const f = S.f[S.kind];
    if (S.kind === 'melt' || S.kind === 'bar') return f.basis === 'mazaneh' ? B.num(f.mazaneh) : 0;
    if (S.kind === 'coin') return f.basis === 'count' ? B.num(f.price) : 0;
    return B.num(f.rate);
  }
  function printQuote(q) {
    const w = window.open('', '_blank', 'width=420,height=620');
    if (!w) return toast('پنجره چاپ باز نشد.', 'error');
    const what = q.kind === 'coin' ? `سکه ${COIN_TYPES[q.coin]?.short ?? ''}` : q.kind === 'fx' ? TR.FX_CODES[q.fxCode] : TR.TRADE_KINDS[q.kind];
    w.document.write(`<!doctype html><html lang="fa" dir="rtl"><meta charset="utf-8"><title>${q.code}</title><style>body{font:15px/1.9 Tahoma,sans-serif;padding:18px;color:#111}h1{font-size:18px;margin:0}.big{font-size:22px;font-weight:bold}.box{border:1.5px dashed #555;border-radius:10px;padding:12px;margin:10px 0}small{color:#555}</style><h1>${esc(prefs.settings?.legalName || store.me?.brand?.shopName || '')}</h1><small>برگه قیمت تضمینی</small><div class="box"><div>کد: <b>${q.code}</b></div><div>${q.dir === 'in' ? 'خرید از مشتری' : 'فروش به مشتری'} · ${esc(what)}</div><div class="big">${R(q.price)}${q.basis === 'mazaneh' ? ' (مظنه)' : ''}</div>${q.qty ? `<div>تا ${fa(q.qty)} ${q.kind === 'coin' ? 'عدد' : 'گرم'}</div>` : ''}${q.party ? `<div>برای: ${esc(q.party.label)}</div>` : ''}<div>معتبر تا ساعت <b>${new Date(q.expiresAt).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tehran' })}</b> امروز</div></div><small>پس از این ساعت، قیمت روز ملاک است.</small><script>print()</script>`);
    w.document.close();
  }

  const lineFromForm = () => {
    const f = S.f[S.kind];
    const o = { kind: S.kind, dir: dir(), priced: priced() };
    if (S.kind === 'melt') Object.assign(o, { weight: f.weight, fineness: f.fineness, conditional: !!f.conditional && dir() === 'in' });
    if (S.kind === 'coin') Object.assign(o, { coin: f.coin, count: f.count });
    if (S.kind === 'bar') Object.assign(o, { serial: f.serial, brand: f.brand, gallery: f.gallery, weight: f.weight, fineness: f.fineness, sealDate: parseDay(f.sealDate) ?? '' });
    if (S.kind === 'fx') Object.assign(o, { code: f.code, fxAmount: f.fxAmount });
    // a locked price travels with the line; the server checks it is exactly what was promised
    if (o.priced && S.quote && S.quote.kind === S.kind && S.quote.dir === o.dir) o.quote = S.quote.id;
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
    let calcL;
    try {
      calcL = TR.tradeLine(l, { round: s.tradeRound ?? 10000 });
    } catch (e) {
      toast(e.message, 'error');
      const el = nextEmpty();
      if (el) el.focus();
      return false;
    }
    if (!priced() && !S.party) return toast('ورود و خروج جنس روی حساب مشتری است؛ اول مشتری را انتخاب کنید.', 'error'), false;
    // what the machine learned about this customer: flag the unusual before it is saved
    const h = S.habits;
    if (h && l.kind === 'melt') {
      const w = B.num(l.weight), f = B.num(l.fineness);
      if (h.weight?.n >= 3 && w > Math.max(h.weight.p90 * 3, h.weight.p90 + 20)) toast(`وزن ${G(w)} گرم بیش از سه برابر معمول این مشتری است (معمولاً تا ${G(h.weight.p90)} گرم). دوباره بخوانید.`, 'error');
      if (h.fineness?.n >= 3 && Math.abs(f - h.fineness.value) >= 15) toast(`عیار ${fa(f)} با عیار همیشگی این مشتری (${fa(h.fineness.value)}) فرق دارد.`, 'info');
    }
    S.lines.push(l);
    if (l.quote) S.quote = null; // a lock serves one line
    track('desk.add', { kind: l.kind, dir: l.dir, priced: l.priced !== false });
    const keep = S.f[S.kind];
    resetForm();
    if (S.kind === 'melt') S.f.melt.fineness = keep.fineness;
    if (S.kind === 'coin') S.f.coin.coin = keep.coin;
    if (S.kind === 'melt' || S.kind === 'bar') S.f[S.kind].basis = keep.basis;
    formTouched = false;
    drawForm();
    drawLines(true);
    recalc();
    step(`ردیف ${S.lines.length}: ${lineVerb(calcL)} ${l.kind === 'coin' ? `سکه ${COIN_TYPES[l.coin]?.short ?? ''}` : TR.TRADE_KINDS[l.kind]} ${describe(calcL)}`, { focus: FIRST });
    $(FIRST, $('#form', root))?.focus();
    return true;
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
  /** Add a payment row: the given amount, or what is left to settle (the direction follows the balance). */
  function addPayment(method, { account, amount = null, label = true } = {}) {
    const m = B.payMethod(method);
    if (!m) return false;
    if (m.id === 'offset' && !S.party) return toast('تهاتر با مانده مشتری است؛ مشتری را انتخاب کنید.', 'error'), false;
    S.payments.push({ method: m.id, dir: 'in', account: account ?? (m.acct === 'cash' ? cash[0]?.id : m.acct === 'bank' ? banks[0]?.id : undefined), amount: '' });
    const i = S.payments.length - 1;
    drawPays();
    if (amount != null) {
      const c = calc().c;
      S.payments[i].amount = String(amount);
      // the money goes the way the document needs it
      if (c) S.payments[i].dir = c.net >= 0 ? 'in' : 'out';
      drawPays();
    } else fill(i);
    recalc();
    if (label) step(`پرداخت: ${m.label}${S.payments[i].amount ? ` ${R(Number(S.payments[i].amount))}` : ''}`, { focus: `[data-p="${i}"][data-k=amount]` });
    $(`[data-p="${i}"][data-k=amount]`, root)?.focus();
    return true;
  }
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
    sentence(c);
    return c;
  }
  const sentenceText = () => { const el = $('#dkSentence', root); return el?.dataset.morph ?? el?.textContent ?? ''; };
  /** تمرکز: the whole document in one sentence, always in view. */
  function sentence(c) {
    const el = $('#dkSentence', root);
    if (!el) return;
    const rows = c?.lines ?? [];
    const what = rows.map((l) => `${lineVerb(l)} ${l.kind === 'coin' ? `${fa(l.count ?? l.amt)} سکه ${COIN_TYPES[l.coin]?.short ?? ''}` : l.kind === 'fx' ? `${fa(l.fxAmount ?? l.amt)} ${TR.FX_CODES?.[l.code] ?? l.code ?? ''}` : `${G(l.weight ?? 0)} گرم ${TR.TRADE_KINDS[l.kind]}${l.fineness ? ` ${fa(l.fineness)}` : ''}`}`.replace(/\s+/g, ' ').trim());
    const pays = S.payments.map((p) => B.payMethod(p.method)?.label).filter(Boolean);
    // the sentence morphs word by word as the document changes (spec 0021)
    morphText(el, what.length || pays.length ? `${S.amend ? `اصلاحیه ${S.amend.track}: ` : ''}${what.join('، ')}${S.party ? ` — ${S.party.name}` : ''}${pays.length ? ` — ${pays.join(' + ')}` : ''}` : S.party ? `${S.party.name}: ${MODE_FA[S.mode]}، ${KIND_FA[S.kind]}` : `${MODE_FA[S.mode]}، ${KIND_FA[S.kind]} — مشتری را انتخاب کنید (F2) یا یک خط بنویسید (F3)`);
  }

  /* ---------------- save and receipt ---------------- */
  async function save(btn) {
    const { c, err } = calc();
    if (!c) return toast(err, 'error');
    if (!S.lines.length && !S.payments.length) return toast('سند خالی است.', 'error');
    if (c.credit && !S.party) return toast('برای ماندن مبلغ روی حساب، مشتری را انتخاب کنید یا کامل تسویه کنید.', 'error');
    busy(btn, true);
    try {
      // کارتخوان (spec 0005): each card-reader receipt without a reference goes to the terminal first; the document is
      // booked only when every one is approved (an approved one keeps its RRN, so a retry never charges twice)
      const pc = posConfig();
      if (pc.on) {
        for (const [i, p] of S.payments.entries()) {
          if (p.posId && p.posAmount !== c.payments[i].value) return toast(`مبلغ ردیف کارتخوان با مبلغی که از کارت کم شد (${R(p.posAmount)}) فرق دارد؛ همان مبلغ را بنویسید و مابقی را ردیف جدا کنید.`, 'error');
          if (p.method !== 'pos' || p.dir === 'out' || String(p.ref ?? '').trim()) continue;
          const bad = posProblem(pc);
          if (bad) return toast(bad, 'error');
          const j = await chargeModal(pc, c.payments[i].value);
          if (!j) return;
          Object.assign(S.payments[i], { ref: j.rrn, card: j.card || undefined, terminal: j.terminal || undefined, posId: j.id, posAmount: c.payments[i].value });
          drawPays();
          recalc(); // keeps the draft (with the RRN) in this browser until the document is booked
        }
      }
      const b = body();
      let doc = null, queued = null;
      if (S.amend) {
        const reason = ($('#dkAmendReason', root)?.value ?? '').trim();
        if (reason.length < 3) return toast('دلیل اصلاح را بنویسید؛ در تاریخچه هر دو سند می‌ماند.', 'error'), $('#dkAmendReason', root)?.focus();
        doc = await api(`/api/books/docs/${S.amend.id}`, { method: 'PUT', body: { ...b, reason } });
      } else {
        const r = await submit({ url: '/api/books/docs', body: b, label: sentenceText() });
        doc = r.doc ?? null;
        if (r.queued) queued = r.key;
      }
      remember(b);
      const was = { party: S.party, sentence: sentenceText(), c };
      S.lines = [];
      S.payments = [];
      S.note = '';
      S.amend = null;
      kindTouched = false;
      formTouched = false;
      $('#note', root).value = '';
      if (queued) {
        track('desk.save', { lines: b.lines.length, pays: b.payments.length, party: !!b.partyId, queued: true });
        queuedReceipt(queued, was);
      } else {
        Promise.all(b.payments.filter((p) => p.posId).map((p) => linkCharge(p.posId, doc.id))).then(orphans);
        track('desk.save', { lines: b.lines.length, pays: b.payments.length, party: !!b.partyId }, doc.track);
        const [party, check] = await Promise.all([was.party ? api(`/api/books/parties/${was.party.id}`).catch(() => null) : null, api(`/api/books/audit?doc=${doc.id}`).catch(() => ({ findings: [] }))]);
        receipt(doc, party, check.findings);
        if (party) S.party = { ...party.party, balance: party.balance };
        refreshParty(); // habits and «the last trade» now include this one
        lsj.set(LASTDOC_KEY, { id: doc.id, track: doc.track, type: doc.type, date: doc.date, lines: b.lines.map(({ quote, ...l }) => l), payments: b.payments.map((p) => ({ method: p.method, dir: p.dir, account: p.account ?? null })) });
      }
      resetForm();
      applyDefaults();
      drawParty();
      drawForm();
      drawLines();
      drawPays();
      drawAmend();
      recalc();
      hist.reset();
      drafts.set('desk', null);
      $('#dkNotice', root)?.querySelectorAll('.dk-draft').forEach((x) => x.remove());
      drawQuick();
      $('#pq', root)?.focus();
    } catch (e) {
      // 428: a manager's approval was requested; the same save goes through once it is approved (four eyes)
      toast(e.message, e.status === 428 ? 'info' : 'error');
      track('desk.error', { msg: e.message.slice(0, 120) });
    } finally {
      busy(btn, false);
    }
  }
  /** The card-reader window: follows one charge; resolves the approved charge, or null (declined, cancelled, closed). */
  function chargeModal(pc, amount) {
    return new Promise((resolve) => {
      const id = newChargeId();
      let run = null, result = null, retrying = false, last = { id, amount, driver: pc.driver, state: 'connecting' };
      const close = modal(
        String(html`<div class="pos-box" role="status"><h3 class="bk-h">کارتخوان</h3><div class="pos-amt">${R(amount)}</div>
          <div class="pos-st connecting" id="posSt" aria-live="assertive"><i class="pos-dot"></i><span>${STATE_TEXT.connecting}</span></div>
          <p class="small pos-msg" id="posMsg">${pc.driver === 'sim' ? 'شبیه‌ساز: پولی جابه‌جا نمی‌شود.' : ''}</p>
          <div class="pos-manual" id="posManual" hidden><label class="field">شماره پیگیری روی رسید کارتخوان<input class="input ltr" id="posRrn" inputmode="numeric" maxlength="20"></label></div>
          <div class="actions" id="posAct"><button class="btn ghost" data-pos="cancel">انصراف</button></div></div>`),
        (m) =>
          m.addEventListener('click', (e) => {
            const b = e.target.closest('[data-pos]');
            if (!b) return;
            const a = b.dataset.pos;
            if (a === 'cancel') {
              if (run && !result) {
                run.cancel();
                show({ ...last, state: last.state }, 'در حال لغو… اگر کارت کشیده شده، صبر کنید.');
              } else close();
            } else if (a === 'retry') {
              retrying = true;
              close();
              chargeModal(pc, amount).then(resolve);
            } else if (a === 'manual') {
              const rrn = $('#posRrn', m).value.replace(/[^\d۰-۹]/g, '').replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
              if (rrn.length < 6) return toast('شماره پیگیری رسید کارتخوان را کامل وارد کنید.', 'error');
              result = { ...last, state: 'approved', rrn, message: 'ثبت دستی از روی رسید کارتخوان' };
              logCharge(result);
              close();
            }
          }),
        () => {
          if (run && !result && !['declined', 'cancelled', 'error', 'unknown'].includes(last.state)) run.cancel();
          if (!retrying) resolve(result?.state === 'approved' ? result : null);
        },
      );
      const show = (j, extra) => {
        const st = document.getElementById('posSt');
        if (!st) return;
        st.className = `pos-st ${j.state}`;
        st.innerHTML = `<i class="pos-dot"></i><span>${String(chargeLine(j))}</span>`;
        document.getElementById('posMsg').textContent = extra ?? (j.state === 'approved' ? '' : j.message || '');
        const act = document.getElementById('posAct');
        if (['declined', 'cancelled', 'error'].includes(j.state)) act.innerHTML = String(html`<button class="btn" data-pos="retry">دوباره بفرست</button><button class="btn ghost" data-close>بستن</button>`);
        if (j.state === 'unknown') {
          document.getElementById('posManual').hidden = false;
          act.innerHTML = String(html`<button class="btn" data-pos="manual">پرداخت شده؛ ثبت با این شماره</button><button class="btn ghost" data-pos="retry">دوباره بفرست</button><button class="btn ghost" data-close>بستن</button>`);
        }
      };
      run = startCharge(pc, { id, amount }, (j) => {
        last = j;
        show(j);
      });
      run.done
        .then((j) => {
          last = j;
          show(j);
          logCharge(j);
          if (j.state === 'approved') {
            result = j;
            setTimeout(close, 900);
          }
        })
        .catch((e) => {
          last = { ...last, state: 'error', message: e.message };
          show(last);
        });
    });
  }
  async function orphans() {
    const r = await api('/api/books/pos').catch(() => null);
    const box = $('#posOrphans', root);
    if (!box || !r?.orphans?.length) return box && (box.innerHTML = '');
    box.innerHTML = String(html`<div class="notice pos-orphan" role="alert"><b>پرداخت کارتخوانِ تأییدشده بدون سند:</b> ${r.orphans.map((o) => html`<span class="chip">${R(o.amount)} · پیگیری <b class="ltr-num">${fa(o.rrn)}</b> · ${timeFa(o.at)}</span>`)}<small>پول از کارت مشتری کم شده است؛ سندش را با همین شماره پیگیری ثبت کنید (روی ردیف کارتخوان بنویسید) تا این هشدار برود.</small></div>`);
  }

  // one receipt for every kind of base-edition document: tracking code with barcode, authenticity QR, each line and
  // payment with its own code, the balance after; printing and sharing are written to the document's history
  function receipt(doc, party, warn = [], extra = []) {
    const c = doc.calc;
    const shop = s.legalName || store.me.brand?.shopName || '';
    const kindTitle = doc.type === 'hawala' ? 'رسید حواله' : doc.type === 'convert' ? 'رسید تبدیل مانده' : 'رسید معامله';
    const verifyUrl = `${location.origin}/verify/${doc.verify}`;
    const lineTxt = (l) => `${lineVerb(l)} ${TR.TRADE_KINDS[l.kind]}: ${describe(l)}${l.priced ? ` = ${R(l.value)}` : ''}`;
    const body = [
      ...(c.lines ?? []).map((l, i) => [`${doc.track}/L${i + 1}`, `${lineVerb(l)} ${l.kind === 'coin' ? `سکه ${COIN_TYPES[l.coin]?.short ?? ''}` : TR.TRADE_KINDS[l.kind]}`, describe(l), l.priced ? R(l.value) : unitAmt(l.unit, l.amt)]),
      ...(c.payments ?? []).map((p, i) => [`${doc.track}/P${i + 1}`, `${p.dir === 'in' ? 'دریافت' : 'پرداخت'} · ${B.payMethod(p.method).label}`, doc.payments[i]?.ref ? `پیگیری ${fa(doc.payments[i].ref)}` : '', R(p.value)]),
      ...(c.hawala ? [[doc.track, 'حواله', `از ${extra[0]?.label ?? ''} به ${extra[1]?.label ?? ''}`, unitAmt(c.hawala.unit, c.hawala.amount)]] : []),
      ...(c.convert ? [[doc.track, 'تبدیل مانده جنسی', `${unitAmt(c.convert.unit, Math.abs(c.convert.amount))}${c.convert.mazaneh ? ` روی مظنه ${R(c.convert.mazaneh)}` : c.convert.price ? ` با نرخ ${R(c.convert.price)}` : ''}`, R(Math.abs(c.convert.value))]] : []),
    ];
    const who = [party, ...extra.filter((x) => x?.balance)].filter(Boolean);
    const text = [
      `${shop} — ${kindTitle}`,
      `کد رهگیری: ${doc.track} · ${jd(doc.date)} ${timeFa(doc.issuedAt)}`,
      party ? `مشتری: ${party.party.label}` : '',
      ...(c.lines ?? []).map(lineTxt),
      ...body.filter((r) => r[0].includes('/P') || !c.lines?.length).map((r) => `${r[1]} ${r[2]} ${r[3]}`.trim()),
      party ? `مانده حساب: ${balSentence(party.party.name, party.balance)}` : '',
      `کد اصالت: ${doc.verify} — ${verifyUrl}`,
    ].filter(Boolean).join('\n');
    const note = (kind) => api(`/api/books/docs/${doc.id}/event`, { method: 'POST', body: { kind, format: 'receipt' } }).catch(() => {});
    const panel = $('#dkReceipt', root);
    panel.hidden = false;
    panel.dataset.doc = doc.id;
    panel.innerHTML = String(html`<div class="dk-rp-h"><b>${doc.amends ? 'اصلاحیه ثبت شد' : 'ثبت شد'} ✓</b>${doc.amends ? html`<span class="small">جایگزین سند قبلی؛ اصل با همان شماره در تاریخچه می‌ماند.</span>` : ''}<button type="button" class="iconbtn" data-close aria-label="بستن رسید (Esc)">✕</button></div>
      <div class="printable dk-receipt"><div class="dk-r-head">${crown({ size: 56 })}<b>${shop}</b><span>${kindTitle} · ${jd(doc.date)} ${timeFa(doc.issuedAt)}</span></div>
        <div class="dk-r-track"><div><span>کد رهگیری</span><b class="ltr-num">${doc.track}</b>${raw(barcodeSvg(doc.track, { module: 1.5, height: 30, label: false }))}</div>${raw(qrSvg(verifyUrl, { size: 74 }))}</div>
        ${party ? html`<p><b>مشتری:</b> ${party.party.label} · کد ${fa(party.party.code)}</p>` : ''}
        <table class="table-plain dk-r-t">${body.map((r) => html`<tr><td><em class="ltr-num">${r[0].replace(doc.track, '') || '—'}</em>${r[1]}<small>${r[2]}</small></td><td class="num">${r[3]}</td></tr>`)}</table>
        ${who.map((x) => html`<div class="dk-after"><span>مانده ${x.party?.name ?? x.label} پس از این سند</span>${balChips(x.balance)}</div>`)}
        <p class="small ltr-num">کد اصالت ${doc.verify}</p></div>
      ${warn.length ? html`<div class="dk-warn" role="alert"><b>ممیز:</b>${warn.map((f) => html`<p class="${f.sev}">${f.sev === 'high' ? '⛔' : '⚠'} ${f.title} — ${f.detail}</p>`)}</div>` : ''}
      <div class="actions"><button class="btn small" data-r="print">چاپ رسید</button><button class="btn small ghost" data-r="share">ارسال / کپی متن</button>${doc.type === 'trade' ? html`<button class="btn small ghost" data-r="amend" title="سند تازه‌ای می‌سازد که جای این سند را می‌گیرد">اصلاح این سند</button>` : ''}<a class="btn small ghost" href="/books/trace?q=${doc.track}" data-link>رهگیری</a><a class="btn small ghost" href="/books/doc/${doc.id}" data-link>سند کامل</a></div>`);
    panel._share = { text, note };
    panel.classList.remove('in');
    void panel.offsetWidth;
    panel.classList.add('in');
  }
  /** A document waiting in the queue: a provisional slip, replaced by the real receipt once it is booked. */
  function queuedReceipt(key, was) {
    const panel = $('#dkReceipt', root);
    panel.hidden = false;
    panel.dataset.key = key;
    delete panel.dataset.doc;
    panel.innerHTML = String(html`<div class="dk-rp-h"><b>در صف ارسال ⏳</b><button type="button" class="iconbtn" data-close aria-label="بستن">✕</button></div>
      <div class="dk-queued"><p>اتصال به سرور برقرار نیست. سند روی همین دستگاه ماند و <b>به‌محض وصل شدن خودکار ثبت می‌شود</b>؛ دو بار ثبت نمی‌شود.</p>
      <p class="dk-sentence">${was.sentence}</p>${was.c ? html`<p class="small">${was.c.net >= 0 ? 'دریافتنی' : 'پرداختنی'}: ${R(Math.abs(was.c.net))}</p>` : ''}<p class="small">شناسه موقت: <span class="ltr-num">${key.slice(0, 8)}</span> — کد رهگیری پس از ثبت می‌آید.</p></div>`);
  }
  function closeReceipt() {
    const panel = $('#dkReceipt', root);
    if (!panel || panel.hidden) return false;
    panel.hidden = true;
    panel.innerHTML = '';
    delete panel.dataset.doc;
    delete panel.dataset.key;
    return true;
  }

  /* ---------------- hawala, convert, conditional ---------------- */
  async function partySelect(name) {
    const list = (await api('/api/books/parties')).items;
    return html`<select class="input" name="${name}" required><option value="">— انتخاب —</option>${list.map((p) => html`<option value="${p.id}">${p.label} · کد ${fa(p.code)}</option>`)}</select>`;
  }
  const unitOptions = () => html`<option value="IRR">ریال</option><option value="G750">گرم طلای ۷۵۰</option>${shownCoins().map(([id, c]) => html`<option value="COIN:${id}">سکه ${c.short}</option>`)}${shownFx().map(([c, n]) => html`<option value="FX:${c}">${n}</option>`)}`;
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
            const [pa, pb] = await Promise.all([api(`/api/books/parties/${f.from}`), api(`/api/books/parties/${f.to}`)]);
            receipt(d, null, [], [{ label: pa.party.label, party: pa.party, balance: pa.balance }, { label: pb.party.label, party: pb.party, balance: pb.balance }]);
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
            receipt(d, await api(`/api/books/parties/${S.party.id}`));
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

  /* ---------------- برگشت سریع، ذخیره محلی، ماکرو، ورود تک‌خطی (spec 0013) ---------------- */
  let kindTouched = false, formTouched = false, batching = false;
  const SNAP = ['party', 'habits', 'mode', 'kind', 'f', 'lines', 'payments', 'note', 'quote', 'amend', 'sugg', 'defPay'];
  const snapshot = () => Object.fromEntries(SNAP.map((k) => [k, S[k] ?? null]));
  function drawAll() {
    drawParty();
    drawForm();
    drawLines();
    drawPays();
    const n = $('#note', root);
    if (n) n.value = S.note ?? '';
    drawAmend();
    recalc();
  }
  const hist = createHistory({ get: snapshot, set: (v) => (Object.assign(S, v), drawAll()) });
  const persist = (() => {
    let t = 0;
    return () => {
      clearTimeout(t);
      t = setTimeout(() => drafts.set('desk', S.lines.length || S.payments.length || S.party || S.amend || S.note ? { state: snapshot() } : null), 200);
    };
  })();
  hist.on(persist);
  hist.on(() => drawQuick());
  /** Record a change already made to S as one step (typing in one field is grouped by key). */
  function step(label, opts) {
    if (batching) return;
    hist.commit(label, opts);
  }
  const stopDock = mountDock(hist, { root, restore: () => drawQuick() });

  /** What this device used last for each trade type: the fallback defaults when the customer has no history. */
  function remember(b) {
    const all = lsj.get(LAST_KEY, {});
    for (const l of b.lines) {
      const mode_ = MODES.find((m) => m[3] === l.dir && m[4] === (l.priced !== false))?.[0];
      if (!mode_) continue;
      const pay = b.payments[0];
      all[mode_] = { kind: l.kind, fineness: l.kind === 'melt' ? Number(B.num(l.fineness)) || undefined : all[mode_]?.fineness, coin: l.kind === 'coin' ? l.coin : all[mode_]?.coin, basis: l.basis ?? all[mode_]?.basis, pay: pay ? { method: pay.method, account: pay.account ?? null } : all[mode_]?.pay };
    }
    lsj.set(LAST_KEY, all);
  }

  /* the amendment banner: a saved document being corrected; saving makes a new document that replaces it */
  function drawAmend() {
    const box = $('#dkAmend', root);
    if (!box) return;
    box.innerHTML = S.amend
      ? String(html`<div class="notice dk-amend" role="status"><b>در حال اصلاح سند ${S.amend.track}</b><span>با ثبت، سند تازه‌ای (اصلاحیه) ساخته می‌شود و سند قبلی با همان شماره و ارقام در تاریخچه می‌ماند.</span>
          <label class="field xs">دلیل اصلاح<input class="input" id="dkAmendReason" maxlength="300" placeholder="مثلاً: وزن اشتباه خوانده شد" value="${S.amend.reason ?? ''}"></label><button class="chip" data-act="amend-cancel">انصراف از اصلاح</button></div>`)
      : '';
  }
  async function amendDoc(id) {
    try {
      const d = await api(`/api/books/docs/${id}`);
      if (d.type !== 'trade') return navigate(`/books/doc/${id}/edit`);
      if (d.status !== 'final') return toast(d.status === 'void' ? (d.tax?.supersededBy ? 'این سند قبلاً اصلاحیه گرفته است؛ اصلاحیه را اصلاح کنید.' : 'سند باطل‌شده اصلاح نمی‌شود.') : 'فقط سند قطعی اصلاحیه می‌گیرد.', 'error');
      closeReceipt();
      batching = true;
      if (d.partyId) await pickParty({ id: d.partyId }, { keepForm: true, silent: true });
      else (S.party = null), (S.habits = null);
      S.lines = (d.lines ?? []).map(({ quote, ...l }) => ({ ...l, ...(quote ? { quote } : {}) }));
      S.payments = (d.payments ?? []).map((p) => ({ ...p, dueJ: p.due ? jd(p.due) : undefined }));
      S.note = d.note ?? '';
      S.amend = { id: d.id, track: d.track, no: d.no, date: d.date };
      batching = false;
      drawAll();
      step(`اصلاح سند ${d.track}`, { focus: '#pq' });
      $('#dkAmendReason', root)?.focus();
    } catch (e) {
      batching = false;
      toast(e.message, 'error');
    }
  }

  /* quick row: «مثل معامله قبلی»، ماکروها، میان‌بُرها، وضعیت اتصال */
  const macros = () => lsj.get(MACRO_KEY, []);
  let macroNaming = false;
  function drawQuick() {
    const box = $('#dkQuick', root);
    if (!box) return;
    const ms = macros();
    const last = lsj.get(LASTDOC_KEY, null);
    box.innerHTML = String(html`<button type="button" class="chip" data-act="repeat" aria-keyshortcuts="Alt+R" title="آخرین معامله ${S.party ? 'همین مشتری' : 'همین دستگاه'} با قیمت روز (Alt+R)">↻ مثل معامله قبلی</button>
      ${last?.id && last.type === 'trade' ? html`<button type="button" class="chip" data-act="amend-last" title="اصلاحیه برای آخرین سندی که از این دستگاه ثبت شد">✎ اصلاح آخرین سند ${last.track ? html`<small class="ltr-num">${last.track}</small>` : ''}</button>` : ''}
      ${ms.map((m, i) => html`<span class="dk-macro"><button type="button" class="chip dk-macro-b" data-macro="${i}" title="ماکرو ${fa(i + 1)} — در خط سریع عدد ${fa(i + 1)} و Enter">${fa(i + 1)} · ${m.name}</button><button type="button" class="dk-macro-x" data-macro-del="${i}" aria-label="حذف ماکرو ${m.name}">×</button></span>`)}
      ${macroNaming ? html`<span class="dk-macro-new"><input class="input" id="dkMacroName" maxlength="40" placeholder="نام ماکرو، مثلاً «خرید آبشده ۷۴۰ نقد»"><button type="button" class="chip" data-act="macro-save">ذخیره</button></span>` : html`<button type="button" class="chip ghost" data-act="macro-new" title="ترکیب فعلی (نوع معامله، کالا، عیار، مبنای قیمت، روش پرداخت) یک دکمه شود">+ ماکرو از همین تنظیم</button>`}
      <button type="button" class="chip ghost" data-act="help" aria-keyshortcuts="F1" aria-expanded="${!$('#dkHelp', root)?.hidden}">میان‌بُرها <kbd>?</kbd></button>
      ${S.lines.length || S.payments.length || S.party || S.amend ? html`<button type="button" class="chip ghost" data-act="fresh" title="میز خالی می‌شود؛ با Ctrl+Z برمی‌گردد">✕ میز تازه</button>` : ''}`);
    if (macroNaming) $('#dkMacroName', root)?.focus();
  }
  function saveMacro() {
    const name = ($('#dkMacroName', root)?.value ?? '').trim();
    if (name.length < 2) return toast('برای ماکرو یک نام بنویسید.', 'error');
    const f = S.f[S.kind];
    const pay = S.payments[0] ?? (S.defPay ? { method: S.defPay.method, account: S.defPay.account } : null);
    const m = { name, mode: S.mode, kind: S.kind, fineness: S.kind === 'melt' ? f.fineness : undefined, basis: f.basis, coin: S.kind === 'coin' ? f.coin : undefined, code: S.kind === 'fx' ? f.code : undefined, pay: pay ? { method: pay.method, account: pay.account ?? null } : null };
    lsj.set(MACRO_KEY, [...macros(), m].slice(0, 9));
    macroNaming = false;
    drawQuick();
    toast(`ماکرو «${name}» ساخته شد.`, 'ok');
  }
  function runMacro(i) {
    const m = macros()[i];
    if (!m) return false;
    S.mode = m.mode;
    S.kind = m.kind;
    kindTouched = true;
    resetForm();
    const f = S.f[S.kind];
    if (m.fineness) f.fineness = m.fineness;
    if (m.basis) f.basis = m.basis;
    if (m.coin) Object.assign(f, { coin: m.coin, price: coinFor(m.coin, dir()) });
    if (m.code) Object.assign(f, { code: m.code, rate: m.code === 'USD' ? liveOf('usd') ?? '' : '' });
    if (m.pay) S.defPay = m.pay;
    S.sugg = {};
    drawForm();
    step(`ماکرو: ${m.name}`, { focus: FIRST });
    focusFirst();
    return true;
  }
  /** «مثل معامله قبلی»: the customer's last trade (or this device's), with today's prices. */
  function repeatLast() {
    const src = S.party ? S.habits?.lastTrade : lsj.get(LASTDOC_KEY, null);
    if (!src?.lines?.length) return toast(S.party ? 'این مشتری هنوز معامله‌ای ندارد.' : 'معامله قبلی روی این دستگاه نیست.', 'info');
    S.lines = src.lines.map((l0) => {
      const l = { ...l0 };
      delete l.quote;
      if (l.priced === false) return l;
      if ((l.kind === 'melt' || l.kind === 'bar') && (l.basis ?? 'mazaneh') === 'mazaneh') l.mazaneh = mazFor(l.dir) || l.mazaneh;
      if (l.kind === 'coin' && (l.basis ?? 'count') === 'count') l.price = coinFor(l.coin, l.dir) || l.price;
      if (l.kind === 'fx' && l.code === 'USD') l.rate = liveOf('usd') ?? l.rate;
      return l;
    });
    S.payments = (src.payments ?? []).map((p) => ({ method: p.method, dir: p.dir ?? 'in', account: p.account ?? undefined, amount: '' }));
    drawLines(true);
    drawPays();
    if (S.payments.length) fill(S.payments.length - 1);
    recalc();
    step(`مثل معامله قبلی (${jd(src.date)})`, { focus: '#lines' });
    toast(`معامله ${jd(src.date)} با قیمت امروز گذاشته شد؛ وزن‌ها را با مشتری چک کنید.`, 'ok');
  }

  /* ورود تک‌خطی */
  let pendingLine = null;
  const moneyOf = (v, unit) => (v == null ? '' : String(Math.round(v * ((unit ?? (prefs.money === 'toman' ? 'toman' : 'rial')) === 'toman' ? 10 : 1))));
  /** The مظنه a sentence agreed (spec 0020): its own number or the market board's, then ± its «خط». */
  /** The parser's words come back with Latin digits; the desk shows Persian ones, like every page. */
  const faText = (t) => String(t).replace(/(\d)\.(\d)/g, '$1٫$2').replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);
  const lineMazaneh = (p) => resolveMazaneh(p.price, { liveRial: liveOf('mesghal'), shopUnit: prefs.money === 'toman' ? 'toman' : 'rial' });
  function drawLineOut(p, choices = null) {
    const out = $('#dkLineOut', root);
    if (!out) return;
    if (!p) return (out.innerHTML = '');
    const mz = p.price?.basis === 'mazaneh' ? lineMazaneh(p) : null;
    const need = p.mode || p.kind || p.weight != null ? missingOf(p, { doc: p.commit }).filter((x) => !(x === 'مشتری' && S.party)) : [];
    const ROLE = { offset: 'فاصله از مظنه', commit: 'ثبت', mode: 'نوع', party: 'مشتری', kind: 'کالا', coin: 'سکه', count: 'تعداد', weight: 'وزن', fineness: 'عیار', price: 'قیمت', pay: 'پرداخت', fx: 'ارز', serial: 'سریال', note: 'یادداشت' };
    out.innerHTML = String(html`<div class="dk-cmd-parts">${p.parts.map((x) => html`<span class="dk-part ${x.role}"><small>${ROLE[x.role] ?? ''}</small>${faText(x.text)}</span>`)}${p.unknown.map((x) => html`<span class="dk-part unknown" title="این بخش فهمیده نشد"><small>؟</small>${faText(x)}</span>`)}</div>
      ${choices ? html`<div class="dk-cmd-choose"><span>کدام «${p.party}»؟</span>${choices.slice(0, 6).map((c, i) => html`<button type="button" class="chip" data-line-party="${c.id}">${fa(i + 1)}. ${c.label}</button>`)}</div>` : html`<p class="dk-cmd-say">${describeParsed(p) || 'چیزی فهمیده نشد.'} ${p.unknown.length ? html`<b class="dk-cmd-warn">— بخش‌های «؟» فهمیده نشد</b> <button type="button" class="chip" data-line-ai data-think="composing">از دستیار بپرس</button>` : ''} <kbd>Enter</kbd></p>`}
      ${p.rewritten ? html`<p class="dk-cmd-need">بازنویسی دستیار از جمله شما؛ عددها همان عددهای شماست. Enter برای اعمال.</p>` : ''}
      ${mz ? html`<p class="dk-cmd-price ${mz.ok ? (mz.far ? 'warn' : 'ok') : 'bad'}">${mz.ok ? html`<b>${explainMazaneh(p.price, mz, prefs.money === 'toman' ? 'toman' : 'rial')}</b>${mz.steps.length ? html`<small>${mz.steps.join('؛ ')}</small>` : ''}${mz.far ? html`<small>این مظنه از مظنه بازار خیلی دور است؛ دوباره نگاه کنید.</small>` : ''}` : mz.error}</p>` : ''}
      ${need.length ? html`<p class="dk-cmd-need">${p.commit ? 'برای ثبت سند' : 'برای افزودن ردیف'} هنوز لازم است: ${need.join('، ')}</p>` : ''}`);
  }
  async function applyOneLine(text, chosen = null) {
    const p = typeof text === 'string' ? parseLine(text) : text;
    const t = (typeof text === 'string' ? text : '').trim();
    // a macro by its number: «۱» + Enter
    if (/^\d$/.test(t.replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))) {
      if (runMacro(Number(t.replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))) - 1)) ($('#dkLine', root).value = ''), drawLineOut(null);
      return;
    }
    if (!p.mode && !p.kind && !p.party && !p.pays.length && !p.weight) return toast('چیزی از این خط فهمیده نشد.', 'error');
    let added = false;
    batching = true;
    try {
      if (p.party && !chosen) {
        const r = await api(`/api/books/parties?q=${encodeURIComponent(p.party)}`).catch(() => ({ items: [] }));
        const exact = r.items.filter((x) => x.name === p.party || x.alias === p.party || x.label === p.party);
        const one = exact.length === 1 ? exact[0] : r.items.length === 1 ? r.items[0] : null;
        if (!one && r.items.length) {
          pendingLine = p;
          batching = false;
          return drawLineOut(p, r.items);
        }
        if (one) await pickParty(one, { silent: true, keepForm: true });
        else toast(`مشتری «${p.party}» پیدا نشد؛ بدون مشتری ادامه می‌دهیم.`, 'info');
      } else if (chosen) await pickParty({ id: chosen }, { silent: true, keepForm: true });
      if (p.mode) S.mode = p.mode;
      if (p.kind) (S.kind = p.kind), (kindTouched = true);
      resetForm();
      applyDefaults();
      if (p.kind) S.kind = p.kind;
      const f = S.f[S.kind];
      if (S.kind === 'melt') {
        if (p.weight != null) f.weight = String(p.weight);
        if (p.fineness) f.fineness = p.fineness;
      } else if (S.kind === 'bar') {
        if (p.serial) f.serial = p.serial;
        if (p.weight != null) f.weight = String(p.weight);
        if (p.fineness) f.fineness = p.fineness;
      } else if (S.kind === 'coin') {
        if (p.coin) Object.assign(f, { coin: p.coin, price: coinFor(p.coin, dir()) });
        if (p.count) f.count = p.count;
      } else if (S.kind === 'fx' && p.fx) {
        if (p.fx.code) f.code = p.fx.code;
        if (p.fx.amount != null) f.fxAmount = String(p.fx.amount);
        if (p.fx.rate != null) f.rate = moneyOf(p.fx.rate, p.fx.unit);
        else if (f.code === 'USD') f.rate = liveOf('usd') ?? '';
      }
      if (p.price && priced()) {
        const v = p.price.value == null ? '' : moneyOf(p.price.value, p.price.unit);
        // a مظنه price: its own number or the board's, ± the «خط»s, always in rial (spec 0020)
        const mz = p.price.basis === 'mazaneh' && (S.kind === 'melt' || S.kind === 'bar') ? lineMazaneh(p) : null;
        if (mz && !mz.ok) throw Object.assign(new Error(mz.error), { userFacing: true });
        if (S.kind === 'melt') {
          const b = p.price.basis === 'g750' ? 'gram750' : p.price.basis === 'amount' ? 'amount' : 'mazaneh';
          Object.assign(f, { basis: b, [b === 'gram750' ? 'g750' : b]: b === 'mazaneh' ? String(mz.rial) : v });
        } else if (S.kind === 'bar') Object.assign(f, p.price.basis === 'amount' ? { basis: 'amount', amount: v } : { basis: 'mazaneh', mazaneh: String(mz.rial) });
        else if (S.kind === 'coin') Object.assign(f, p.price.basis === 'amount' ? { basis: 'amount', amount: v } : { basis: 'count', price: v });
        else if (S.kind === 'fx') f.rate = v;
      }
      S.sugg = {};
      drawForm();
      if (lineReady() && (p.weight != null || p.count || p.serial || p.fx?.amount != null)) added = addLine();
      for (const pay of p.pays) if (pay.method !== 'credit') addPayment(pay.method, { amount: pay.amount != null ? moneyOf(pay.amount, pay.unit) : null, label: false });
      if (p.note) {
        S.note = [S.note, p.note].filter(Boolean).join(' — ');
        $('#note', root).value = S.note;
      }
    } catch (e) {
      if (!e.userFacing) throw e;
      batching = false;
      return toast(e.message, 'error'); // nothing was applied that the operator did not see
    } finally {
      batching = false;
    }
    drawAll();
    step(`ورود تک‌خطی: ${describeParsed(p)}`, { focus: '#dkLine' });
    $('#dkLine', root).value = '';
    pendingLine = null;
    drawLineOut(null);
    // «… ثبت کن»: a whole sentence (customer, line, payment) is booked at once; anything missing is said, not guessed
    if (p.commit) {
      const need = missingOf(p, { doc: true }).filter((x) => !(x === 'مشتری' && S.party));
      if (!added || need.length) return toast(`سند ثبت نشد؛ هنوز لازم است: ${need.length ? need.join('، ') : 'یک ردیف کامل'}`, 'error');
      return save($('.dk-save [data-act=save]', root));
    }
    if (!added) (nextEmpty() ?? $(FIRST, $('#form', root)))?.focus();
  }
  function drawHelp(open) {
    const box = $('#dkHelp', root);
    box.hidden = !open;
    if (!open) return drawQuick();
    const K = [
      ['F2', 'جستجوی مشتری (فلش و Enter برای انتخاب)'], ['F3 یا /', 'ورود تک‌خطی'], ['Alt+N', 'مشتری جدید در همین صفحه'],
      ['Alt+1 … Alt+4', 'خرید، فروش، دریافت جنس، تحویل جنس'], ['Alt+5 … Alt+8', 'آبشده، سکه، شمش، ارز'],
      ['Enter', 'خانه ضروری بعدی؛ وقتی ردیف کامل است: افزودن به سند؛ در فرم خالی: رفتن به پرداخت'], ['Alt+P', 'پرداخت پیشنهادی با باقی‌مانده'],
      ['Alt+R', 'مثل معامله قبلی'], ['۱ … ۹ در خط سریع', 'اجرای ماکرو'], ['Ctrl+Z', 'برگشت یک گام (مکان‌نما روی همان خانه)'], ['Ctrl+Shift+Z', 'جلو'],
      ['Ctrl+Enter', 'ثبت نهایی'], ['Esc', 'بستن رسید یا فرم کوچک'], ['? یا F1', 'همین راهنما'],
    ];
    box.innerHTML = String(html`<dl class="dk-keys">${K.map(([k, d]) => html`<div><dt><kbd>${k}</kbd></dt><dd>${d}</dd></div>`)}</dl>`);
    drawQuick();
  }
  const isTyping = (el) => el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
  function setMode(m) {
    if (S.mode === m) return;
    S.mode = m;
    resetForm();
    applyDefaults();
    drawForm();
    recalc();
    step(`نوع معامله: ${MODE_FA[m]}`, { focus: `[data-mode="${m}"]` });
  }
  function setKind(k) {
    if (S.kind === k) return;
    S.kind = k;
    kindTouched = true;
    S.sugg = { ...S.sugg, kind: false };
    drawForm();
    step(`کالا: ${KIND_FA[k]}`, { focus: `[data-kind="${k}"]` });
    focusFirst();
  }
  /** At the end of the lines, Enter goes to the money: the usual way this customer pays, for what is left. */
  function goPay() {
    if (!S.lines.length) return false;
    if (!S.payments.length) {
      const d = S.defPay ?? S.habits?.pay ?? null;
      return addPayment(d?.method ?? 'cash', { account: d?.account ?? undefined });
    }
    $('.dk-save [data-act=save]', root)?.focus();
    return true;
  }

  /* ---------------- events ---------------- */
  root.addEventListener('input', (e) => {
    const el = e.target;
    if (el.dataset.psearch !== undefined) {
      S.psearch = el.value;
      const box = $('#dkPick', root);
      box.innerHTML = String(pickerHtml(S.f.coin, S.psearch, canManageProducts()));
      const i = $('[data-psearch]', box);
      i.focus();
      i.setSelectionRange(i.value.length, i.value.length);
      return;
    }
    if (el.id === 'dkLine') {
      const v = el.value.trim();
      drawLineOut(v && !/^\d$/.test(v) ? parseLine(v) : null);
      return;
    }
    if (el.id === 'dkMacroName' || el.closest('#np, #nf')) return;
    if (el.id === 'dkAmendReason') {
      if (S.amend) S.amend.reason = el.value;
      return persist();
    }
    if (el.id === 'pq') {
      clearTimeout(pqT);
      pqT = setTimeout(() => findParty(el.value), 180);
    } else if (el.dataset.f) {
      const f = S.f[S.kind];
      const k = el.dataset.f;
      f[k] = el.type === 'checkbox' ? el.checked : el.value;
      formTouched = true;
      if (S.sugg?.[k]) (S.sugg[k] = false), el.closest('.dk-sugg')?.classList.remove('dk-sugg'), el.closest('label')?.querySelector('.dk-sg')?.remove();
      if (k === 'code') (f.rate = el.value === 'USD' ? liveOf('usd') ?? '' : ''), drawForm();
      else liveLine(), markNext();
      step(`${FIELD_FA[k] ?? k}: ${el.type === 'checkbox' ? (el.checked ? 'بله' : 'خیر') : fa(el.value || '—')}`, { key: `f:${S.kind}.${k}`, focus: `[data-f="${k}"]` });
    } else if (el.dataset.p !== undefined) {
      const i = Number(el.dataset.p);
      S.payments[i][el.dataset.k] = el.value;
      if (el.dataset.k === 'dir') drawPays();
      recalc();
      step(`${B.payMethod(S.payments[i].method)?.label ?? 'پرداخت'} — ${PAYK_FA[el.dataset.k] ?? el.dataset.k}: ${el.tagName === 'SELECT' ? el.selectedOptions[0]?.textContent ?? '' : fa(el.value || '—')}`, { key: `p:${i}.${el.dataset.k}`, focus: `[data-p="${i}"][data-k="${el.dataset.k}"]` });
    } else if (el.id === 'note') {
      S.note = el.value;
      recalc();
      step('یادداشت سند', { key: 'note', focus: '#note' });
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
  root.addEventListener('submit', async (e) => {
    const f = e.target;
    if (f.id === 'np') {
      e.preventDefault();
      try {
        const p = await api('/api/books/parties', { method: 'POST', body: Object.fromEntries(new FormData(f)) });
        partyForm = null;
        await pickParty(p);
      } catch (err) {
        $('#nperr', root).textContent = err.message;
      }
    } else if (f.id === 'nf') {
      e.preventDefault();
      try {
        await api('/api/books/memory', { method: 'POST', body: { scope: 'party', ref: S.party.id, text: new FormData(f).get('text') } });
        partyForm = null;
        await refreshParty();
        toast('به خاطر سپرده شد.', 'ok');
      } catch (err) {
        $('#nferr', root).textContent = err.message;
      }
    }
  });
  root.addEventListener('keydown', (e) => {
    if (e.target.id === 'pq' && dropNav(e)) return;
    if (e.target.id === 'pq' && e.key === 'ArrowDown') return;
    if (e.key === 'Enter' && e.target.id === 'dkLine') {
      e.preventDefault();
      if (pendingLine) return;
      return applyOneLine(e.target.value);
    }
    if (e.key === 'Enter' && e.target.id === 'dkMacroName') {
      e.preventDefault();
      return saveMacro();
    }
    if (e.key === 'Enter' && e.target.dataset.psearch !== undefined) {
      // Enter in the product search picks the first match instead of adding a line
      e.preventDefault();
      $('#dkPick [data-coin]', root)?.click();
      return;
    }
    if (e.key === 'Enter' && e.target.closest('#form') && !e.ctrlKey && !e.metaKey) {
      // ورود مرحله‌ای: to the next empty field; a complete line goes on the document; an untouched form → money
      e.preventDefault();
      if (!formTouched && S.lines.length) return goPay();
      const nxt = nextEmpty();
      if (nxt && nxt !== e.target) return nxt.focus(), nxt.select?.();
      addLine();
    } else if (e.key === 'Enter' && e.target.matches('[data-p][data-k=amount], [data-p][data-k=ref]') && !e.ctrlKey) {
      e.preventDefault();
      $('.dk-save [data-act=save]', root)?.focus();
    }
  });
  const onKey = (e) => {
    if (!root.isConnected) return;
    if (e.key === 'F2') {
      e.preventDefault();
      if (!S.party) $('#pq', root)?.focus();
      else $('[data-act=pclear]', root)?.focus();
    } else if (e.key === 'F3' || (e.key === '/' && !isTyping(e.target))) {
      e.preventDefault();
      $('#dkLine', root)?.focus();
    } else if (e.key === 'F1' || (e.key === '?' && !isTyping(e.target))) {
      e.preventDefault();
      drawHelp($('#dkHelp', root).hidden);
    } else if (e.key === 'Escape') {
      if (pendingLine) (pendingLine = null), drawLineOut(null);
      else if (partyForm) (partyForm = null), drawParty();
      else if (!$('#dkHelp', root).hidden) drawHelp(false);
      else if (macroNaming) (macroNaming = false), drawQuick();
      else closeReceipt();
    } else if (e.altKey && !e.ctrlKey && !e.metaKey && /^Digit[1-8]$/.test(e.code)) {
      e.preventDefault();
      const n = Number(e.code.slice(5));
      if (n <= 4) setMode(MODES[n - 1][0]);
      else setKind(KINDS[n - 5][0]);
    } else if (e.altKey && !e.ctrlKey && e.code === 'KeyR') {
      e.preventDefault();
      repeatLast();
    } else if (e.altKey && !e.ctrlKey && e.code === 'KeyN') {
      e.preventDefault();
      if (S.party) S.party = null;
      partyForm = 'new';
      drawParty();
    } else if (e.altKey && !e.ctrlKey && e.code === 'KeyP') {
      e.preventDefault();
      const d = S.defPay ?? S.habits?.pay ?? null;
      addPayment(d?.method ?? 'cash', { account: d?.account ?? undefined });
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
    if (b.dataset.lineAi !== undefined) {
      // spec 0020: the shop's language engine rewrites the sentence in the desk's words; numbers it did not see are refused
      const inp = $('#dkLine', root);
      busy(b, true);
      try {
        const r = await api('/api/books/oneline/understand', { method: 'POST', body: { text: inp.value } });
        if (!r.ok) return toast(r.reason, 'error');
        inp.value = r.canonical;
        drawLineOut({ ...parseLine(r.canonical), rewritten: r.source === 'model' });
        inp.focus();
      } catch (err) {
        toast(err.message, 'error');
      } finally {
        if (b.isConnected) busy(b, false);
      }
      return;
    }
    if (b.dataset.lineParty) {
      const p = pendingLine;
      pendingLine = null;
      return p && applyOneLine(p, b.dataset.lineParty);
    }
    if (b.dataset.macro !== undefined) return runMacro(Number(b.dataset.macro));
    if (b.dataset.macroDel !== undefined) {
      const ms = macros();
      ms.splice(Number(b.dataset.macroDel), 1);
      lsj.set(MACRO_KEY, ms);
      return drawQuick();
    }
    if (b.closest('#dkReceipt')) {
      if (b.hasAttribute('data-close')) return closeReceipt();
      const panel = $('#dkReceipt', root);
      if (b.dataset.r === 'print') {
        panel._share?.note('print');
        return window.print();
      }
      if (b.dataset.r === 'share') {
        panel._share?.note('share');
        if (navigator.share) return navigator.share({ text: panel._share.text }).catch(() => {});
        await navigator.clipboard?.writeText(panel._share?.text ?? '').catch(() => {});
        return toast('متن رسید کپی شد.', 'ok');
      }
      if (b.dataset.r === 'amend') return amendDoc(panel.dataset.doc);
      return;
    }
    if (b.hasAttribute('data-quote-lock')) {
      const price = quotePrice();
      if (!(price > 0)) return toast('اول قیمت (مظنه، قیمت هر سکه یا نرخ ارز) را وارد کنید.', 'error');
      const f = S.f[S.kind];
      try {
        const q = await api('/api/books/quotes', { method: 'POST', body: { kind: S.kind, dir: dir(), price, coin: f.coin, code: f.code, minutes: Number($('#dkQMin', root).value), partyId: S.party?.id } });
        S.quote = q;
        toast(`قیمت با کد ${q.code} قفل شد.`, 'ok');
        track('desk.quote', { kind: q.kind });
        drawQuote();
        return step(`قیمت قفل شد: ${q.code}`);
      } catch (err) {
        return toast(err.message, 'error');
      }
    }
    if (b.hasAttribute('data-quote-use')) {
      const code = $('#dkQCode', root).value.trim();
      if (!code) return $('#dkQCode', root).focus();
      try {
        applyQuote(await api(`/api/books/quotes/${encodeURIComponent(code.replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))}`));
        return step(`قیمت قفل‌شده ${code}`, { focus: '#dkQCode' });
      } catch (err) {
        return toast(err.message, 'error');
      }
    }
    if (b.hasAttribute('data-quote-clear')) {
      S.quote = null;
      drawQuote();
      return step('قیمت قفل برداشته شد');
    }
    if (b.hasAttribute('data-quote-print')) return S.quote && printQuote(S.quote);
    if (b.dataset.mode) return setMode(b.dataset.mode);
    if (b.dataset.kind) return setKind(b.dataset.kind);
    if (b.dataset.seg) {
      S.f[S.kind][b.dataset.seg] = b.dataset.v;
      S.sugg = { ...S.sugg, [b.dataset.seg]: false };
      drawForm();
      return step(`مبنای قیمت: ${BASIS_FA[b.dataset.v] ?? b.dataset.v}`, { focus: `[data-seg="${b.dataset.seg}"][data-v="${b.dataset.v}"]` });
    }
    if (b.dataset.fq) {
      S.f.melt.fineness = Number(b.dataset.fq);
      S.sugg = { ...S.sugg, fineness: false };
      formTouched = true;
      drawForm();
      return step(`عیار ${fa(b.dataset.fq)}`, { key: 'f:melt.fineness', focus: '[data-f="fineness"]' });
    }
    if (b.hasAttribute('data-pmore')) {
      try {
        localStorage.setItem('beatris.desk.allPrices', b.getAttribute('aria-expanded') === 'true' ? '0' : '1');
      } catch {}
      return drawPrices();
    }
    if (b.dataset.prod) {
      const a = b.dataset.prod;
      (a === 'tpl' ? templateModal() : productModal(a === 'edit' ? b.dataset.id : null)).then((r) => {
        if (typeof r === 'string' && COIN_TYPES[r]) Object.assign(S.f.coin, { coin: r, price: coinFor(r, dir()) });
        drawForm();
      });
      return;
    }
    if (b.dataset.coin) {
      S.f.coin.coin = b.dataset.coin;
      S.f.coin.price = coinFor(b.dataset.coin, dir());
      S.sugg = { ...S.sugg, coin: false };
      formTouched = true;
      drawForm();
      return step(`سکه: ${COIN_TYPES[b.dataset.coin]?.short ?? b.dataset.coin}`, { focus: '[data-f="count"]' });
    }
    if (b.dataset.step) {
      S.f.coin.count = Math.max(1, (Number(B.num(S.f.coin.count)) || 0) + Number(b.dataset.step));
      formTouched = true;
      drawForm();
      return step(`تعداد ${fa(S.f.coin.count)}`, { key: 'f:coin.count', focus: '[data-f="count"]' });
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
      drawForm();
      return step(`قیمت از تابلو: ${R(v)}`);
    }
    if (b.dataset.del !== undefined) {
      const [gone] = S.lines.splice(Number(b.dataset.del), 1);
      drawLines();
      recalc();
      return step(`حذف ردیف ${TR.TRADE_KINDS[gone?.kind] ?? ''}`, { focus: '#lines' });
    }
    if (b.dataset.pm) return addPayment(b.dataset.pm);
    if (b.dataset.pdel !== undefined) {
      const [gone] = S.payments.splice(Number(b.dataset.pdel), 1);
      drawPays();
      recalc();
      return step(`حذف پرداخت ${B.payMethod(gone?.method)?.label ?? ''}`);
    }
    if (b.dataset.fill !== undefined) {
      fill(Number(b.dataset.fill));
      return step('باقی‌مانده در پرداخت', { focus: `[data-p="${b.dataset.fill}"][data-k=amount]` });
    }
    const act = b.dataset.act;
    if (act === 'add') addLine();
    else if (act === 'save') save(b);
    else if (act === 'pnew') {
      partyForm = partyForm === 'new' ? null : 'new';
      drawParty();
    } else if (act === 'pcancel') {
      partyForm = null;
      drawParty();
    } else if (act === 'pclear') {
      S.party = null;
      S.habits = null;
      resetForm();
      applyDefaults();
      drawParty();
      drawForm();
      recalc();
      step('مشتری برداشته شد', { focus: '#pq' });
      $('#pq', root)?.focus();
    } else if (act === 'habitpay' && S.habits?.pay) addPayment(S.habits.pay.method, { account: S.habits.pay.account ?? undefined });
    else if (act === 'note' && S.party) {
      partyForm = partyForm === 'note' ? null : 'note';
      drawParty();
    } else if (act === 'hawala') hawala();
    else if (act === 'convert') convert();
    else if (act === 'cond') conditional();
    else if (act === 'repeat') repeatLast();
    else if (act === 'amend-last') {
      const last = lsj.get(LASTDOC_KEY, null);
      if (last?.id) amendDoc(last.id);
    } else if (act === 'amend-cancel') {
      S.amend = null;
      S.lines = [];
      S.payments = [];
      drawAll();
      step('انصراف از اصلاح');
    } else if (act === 'macro-new') {
      macroNaming = true;
      drawQuick();
    } else if (act === 'macro-save') saveMacro();
    else if (act === 'help') drawHelp($('#dkHelp', root).hidden);
    else if (act === 'fresh') {
      Object.assign(S, { party: null, habits: null, lines: [], payments: [], note: '', amend: null, quote: null });
      resetForm();
      applyDefaults();
      drawAll();
      $('#dkNotice', root).innerHTML = '';
      step('شروع تازه (کار قبلی با Ctrl+Z برمی‌گردد)', { focus: '#pq' });
    } else if (act === 'outbox-take') {
      const it = await take(b.dataset.key);
      b.closest('.notice')?.remove();
      if (!it) return;
      const d = it.body;
      batching = true;
      if (d.partyId) await pickParty({ id: d.partyId }, { keepForm: true, silent: true }).catch(() => {});
      Object.assign(S, { lines: d.lines ?? [], payments: d.payments ?? [], note: d.note ?? '' });
      batching = false;
      drawAll();
      step('سند برگشتی از صف', { focus: '#lines' });
    }
  });
  // the queue: a document booked later says so; a refused one comes back to this desk for correction
  const stopOutbox = onOutbox((ev) => {
    if (!root.isConnected) return;
    if (ev.type === 'sent') {
      toast(`سند صف ثبت شد: ${ev.doc.track}`, 'ok');
      const panel = $('#dkReceipt', root);
      if (panel?.dataset.key === ev.key) receipt(ev.doc, null, []);
      lsj.set(LASTDOC_KEY, { ...lsj.get(LASTDOC_KEY, {}), id: ev.doc.id, track: ev.doc.track, type: ev.doc.type, date: ev.doc.date });
      drawQuick();
      refreshParty();
    } else if (ev.type === 'failed') {
      $('#dkNotice', root).insertAdjacentHTML('beforeend', String(html`<div class="notice dk-qfail" role="alert"><b>سندی از صف ثبت نشد:</b> ${ev.error} <button class="chip" data-act="outbox-take" data-key="${ev.key}">برگرداندن به میز برای اصلاح</button></div>`));
    }
  });
  // live prices refresh every minute while the desk is open
  const timer = setInterval(async () => {
    board = (await api('/api/market').catch(() => null)) ?? board;
    drawPrices();
  }, 60000);
  // …and at once when the feed ticks (live stream; the minute poll stays as the fallback)
  const stopLive = liveBoard((b) => {
    if (b?.items) {
      board = b;
      drawPrices();
    }
  });
  drawPrices();
  // ذخیره محلی: unfinished work comes back by itself, after a refresh, a crash or a trip to another page
  let saved = await drafts.get('desk');
  const legacy = (() => {
    try {
      return JSON.parse(localStorage.getItem(DRAFT) ?? 'null');
    } catch {
      return null;
    }
  })();
  if (!saved && legacy && (legacy.lines?.length || legacy.payments?.length)) saved = { state: { lines: legacy.lines ?? [], payments: legacy.payments ?? [], note: legacy.note ?? '' }, at: legacy.at, partyId: legacy.partyId };
  try {
    localStorage.removeItem(DRAFT);
  } catch {}
  const amendQ = new URLSearchParams(location.search).get('amend');
  if (saved?.state && !amendQ) {
    const st = saved.state;
    Object.assign(S, Object.fromEntries(Object.entries(st).filter(([k]) => SNAP.includes(k) && st[k] != null)));
    if (!S.f?.melt) resetForm();
    if (saved.partyId && !S.party) await pickParty({ id: saved.partyId }, { keepForm: true, silent: true }).catch(() => {});
    const what = (S.lines?.length ? `${fa(S.lines.length)} ردیف` : '') + (S.payments?.length ? `${S.lines?.length ? ' و ' : ''}${fa(S.payments.length)} پرداخت` : '');
    if (S.lines?.length || S.payments?.length || S.party || S.amend)
      $('#dkNotice', root).innerHTML = String(html`<div class="notice dk-draft" role="status">کار ناتمام${what ? ` (${what})` : ''}${saved.at ? ` از ساعت ${fa(new Date(saved.at).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }))}` : ''} همان‌طور که بود برگشت. <button class="chip" data-act="fresh">شروع تازه</button></div>`);
  } else applyDefaults();
  drawAll();
  drawQuick();
  hist.reset();
  refreshParty();
  if (posConfig().on) orphans();
  $('#pq', root)?.focus();
  // «معامله در میز» from a customer's page arrives with ?party=; «اصلاح در میز» with ?amend=
  track('desk.open');
  const pre = new URLSearchParams(location.search).get('party');
  if (pre) await pickParty({ id: pre }).catch(() => toast('این مشتری پیدا نشد.', 'error'));
  if (amendQ) await amendDoc(amendQ);
  return () => {
    clearInterval(timer);
    stopLive();
    stopDock();
    stopOutbox();
    document.removeEventListener('keydown', onKey);
    persist();
  };
}
