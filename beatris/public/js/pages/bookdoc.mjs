// The counter screen: one editor for every document type. Totals are computed in the browser with the same
// engine the server uses (public/js/books.mjs), so what the customer hears is what the invoice prints.
import { html, raw, fa, api, store, toast, navigate, $, $$, busy } from '../core.mjs';
import * as B from '../books.mjs';
import { MAZANEH_TO_G750 } from '../calc.mjs';
import { TRADE_COINS as COIN_TYPES, shownCoins } from '../coins.mjs';
import { T, TU, G, jd, jdInput, parseDay, today, modal, balText, balClass, EX, unitName, moneyWords, K, booksPrefs, prefs } from '../bk.mjs';
import { booksNav } from './books.mjs';
import { createHistory, mountDock } from '../undo.mjs';
import { drafts, submit } from '../outbox.mjs';

const EXPENSES = ['اجاره', 'حقوق و دستمزد', 'قبوض و شارژ', 'تعمیر و نگهداری', 'حمل و پیک', 'تبلیغات', 'کارمزد بانکی', 'مالیات و عوارض', 'بیمه', 'پذیرایی', 'سایر'];
const IN_TYPES = new Set(['sale', 'receipt']);
const COIN_BOARD = { bahar: 'sekeb', emami: 'sekee', halfOld: 'nim', half: 'nim', quarterOld: 'rob', quarter: 'rob', gerami: 'gerami' };
const DRAFT_KEY = (type) => `beatris.books.draft.${type}`;
const store_ = {
  get(k) {
    try {
      return JSON.parse(localStorage.getItem(k) ?? 'null');
    } catch {
      return null;
    }
  },
  set(k, v) {
    try {
      if (v == null) localStorage.removeItem(k);
      else localStorage.setItem(k, JSON.stringify(v));
    } catch {
      /* storage unavailable */
    }
  },
};

export async function docEditorPage(root, params) {
  const qs = new URLSearchParams(location.search);
  const editing = params.id ? await api(`/api/books/docs/${params.id}`) : null;
  const type = editing?.type ?? params.type;
  if (!B.DOC_TYPES[type]) return navigate('/books', { replace: true });
  const [settings, accounts, board, tpls] = await Promise.all([api('/api/books/settings'), api('/api/books/accounts'), api('/api/market').catch(() => null), api('/api/books/templates')]);
  const admin = store.isAdmin();
  await booksPrefs();
  // the operator types money in the shop's unit (rial by default); documents keep the engine's toman inputs
  const k = K();
  const LINE_MONEY = ['p750', 'price', 'mazaneh', 'stones', 'bros', 'discount', 'amount'];
  const PAY_MONEY = ['amount', 'p750', 'price', 'fxRate'];
  const scale = (o, keys, f) => {
    const x = { ...o };
    for (const key of [...keys, ...(o.kind === 'jewel' && ['gram', 'fixed'].includes(o.ojratMode) ? ['ojrat'] : [])]) if (x[key] !== undefined && x[key] !== '' && Number.isFinite(B.num(x[key]))) x[key] = f(B.num(x[key]));
    return x;
  };
  const toDisp = (o, keys) => scale(o, keys, (v) => v * k);
  const toEngine = (o, keys) => scale(o, keys, (v) => v / k);
  const p750Live = store.me.pricing.p750 * k;
  const coinPrice = (id) => {
    const x = board?.items?.find((i) => i.id === COIN_BOARD[id]);
    return (x && !x.empty ? x.c : Math.round((COIN_TYPES[id].weight * COIN_TYPES[id].fineness * store.me.pricing.p750) / 750 / 1000) * 1000) * k;
  };
  const maz = Math.round((store.me.pricing.p750 * MAZANEH_TO_G750) / 1000) * 1000 * k;
  const cash = accounts.items.filter((a) => a.kind === 'cash' && a.active), banks = accounts.items.filter((a) => a.kind === 'bank' && a.active);
  const lockPrice = !admin && !settings.staffCanEditPrice;

  /* ---------------- state ---------------- */
  const S = editing
    ? { type, date: editing.date, partyId: editing.partyId, party: editing.party, lines: editing.lines.map((l) => toDisp(l, LINE_MONEY)), payments: editing.payments.map((p) => toDisp(p, PAY_MONEY)), creditUnit: editing.creditUnit ?? 'IRR', creditP750: editing.creditP750 != null ? editing.creditP750 * k : p750Live, note: editing.note ?? '', category: editing.category ?? '', ref: editing.ref ?? null, balances: editing.balances ?? [], seller: editing.seller }
    : { type, date: today(), partyId: null, party: null, lines: [], payments: [], creditUnit: 'IRR', creditP750: p750Live, note: '', category: '', ref: null, balances: [] };
  const selected = new Set();
  // start a return from its sale invoice, or a receipt/sale for a customer
  if (!editing && qs.get('ref') && type === 'return') {
    const src = await api(`/api/books/docs/${qs.get('ref')}`);
    Object.assign(S, { ref: src.id, partyId: src.partyId, party: src.party, lines: src.lines.filter((l) => l.side !== 'in').map((l) => ({ ...l })) });
  }
  if (!editing && qs.get('party')) {
    const p = await api(`/api/books/parties/${qs.get('party')}`).catch(() => null);
    if (p) Object.assign(S, { partyId: p.party.id, party: { ...p.party, balance: p.balance } });
  }
  if (!editing && type === 'transfer') S.payments = [{ method: 'cash', dir: 'out', account: cash[0]?.id, amount: '' }, { method: 'havale', dir: 'in', account: banks[0]?.id, amount: '' }];
  // spec 0013: no document exists before the final save — the work is kept on this device (and comes back by itself)
  const legacyDraft = !editing && !qs.get('ref') ? store_.get(DRAFT_KEY(type)) : null;
  const draft = !editing && !qs.get('ref') ? (await drafts.get(`doc:${type}`)) ?? (legacyDraft ? { S: legacyDraft.S, at: legacyDraft.at } : null) : null;
  store_.set(DRAFT_KEY(type), null);

  const t = B.DOC_TYPES[type];
  const hasLines = ['sale', 'buy', 'return', 'proforma'].includes(type);
  const hasPays = !['proforma', 'opening'].includes(type);
  root.innerHTML = String(html`${booksNav('new')}
    <div class="bk-head"><h1>${editing ? (editing.status === 'final' && type !== 'proforma' ? html`اصلاحیه ${t.label} شماره ${fa(editing.no)}` : html`ویرایش ${t.label} شماره ${fa(editing.no)}`) : t.label}</h1>
      <div class="bk-head-f">
        <label class="field sm">تاریخ<input class="input ltr" name="date" value="${jdInput(S.date)}" inputmode="numeric" ${!admin && !settings.staffBackdate ? 'readonly' : ''}></label>
        ${type !== 'transfer' && type !== 'expense' && type !== 'opening' ? html`<div class="field sm bk-party"><span>طرف حساب</span><div class="bk-party-box" id="partyBox"></div></div>` : ''}
        ${type === 'expense' ? html`<label class="field sm">نوع هزینه<select class="input" name="category">${EXPENSES.map((c) => html`<option ${S.category === c ? 'selected' : ''}>${c}</option>`)}</select></label>` : ''}
      </div>
    </div>
    ${draft?.S ? html`<div class="notice bk-draft" role="status">کار ناتمام از ساعت ${fa(new Date(draft.at).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }))} همان‌طور که بود برگشت. <button class="chip" data-act="drop">شروع تازه</button></div>` : ''}
    ${editing?.status === 'final' && type !== 'proforma' ? html`<p class="notice">ثبت، <b>اصلاحیه</b> می‌سازد: سند تازه‌ای با شماره خودش که جای این سند را می‌گیرد؛ این سند با همان شماره و ارقام در تاریخچه می‌ماند.</p>` : ''}
    <div class="bk-editor">
      <div class="bk-main">
        ${hasLines
          ? html`<section class="tray bk-sec">
              <div class="bk-scan"><input class="input ltr" id="scan" placeholder="بارکد را اسکن یا تایپ کنید (F2)" autocomplete="off" inputmode="numeric"><button class="btn small" data-act="scan">افزودن</button><button class="btn small ghost" data-act="catalog">قالب‌ها</button>${type === 'sale' || type === 'proforma' ? html`<button class="btn small ghost" data-act="add-used">+ طلای مستعمل (تعویض)</button>` : ''}</div>
              <div class="bk-bulkline" id="bulkline" hidden></div>
              <div id="lines"></div>
            </section>`
          : ''}
        ${type === 'opening' ? html`<section class="tray bk-sec"><h3 class="bk-h">مانده‌های اول دوره</h3><p class="small">بدهکاری مشتری مثبت، بستانکاری منفی. طلا به گرم ۷۵۰ و سکه به عدد.</p><div id="bals"></div><button class="btn small ghost" data-act="add-bal">+ ردیف مانده</button></section>` : ''}
        ${hasPays
          ? html`<section class="tray bk-sec">
              <h3 class="bk-h">${type === 'transfer' ? 'از حساب ← به حساب' : 'دریافت و پرداخت'}</h3>
              ${type !== 'transfer' ? html`<div class="bk-methods">${B.PAY_METHODS.filter((m) => type !== 'expense' || !['gold', 'coin', 'offset'].includes(m.id)).map((m) => html`<button class="chip" data-add-pay="${m.id}">${m.label}</button>`)}</div>` : ''}
              <div id="pays"></div>
            </section>`
          : ''}
        <section class="tray bk-sec"><label class="field">یادداشت روی سند<textarea class="input" name="note" rows="2" maxlength="600">${S.note}</textarea></label>
          ${editing?.status === 'final' ? html`<label class="field">دلیل اصلاح (اجباری؛ در تاریخچه هر دو سند می‌ماند)<input class="input" name="reason" maxlength="300"></label>` : ''}</section>
      </div>
      <aside class="bk-side"><div class="tray bk-totals" id="totals" aria-live="polite"></div>
        <div class="bk-save">
          <button class="btn block" data-act="save">${type === 'proforma' ? 'ثبت پیش‌فاکتور' : editing?.status === 'final' ? 'ثبت اصلاحیه' : 'ثبت قطعی'} <kbd>Ctrl+Enter</kbd></button>
          <p class="small bk-autosave">بدون دکمه ذخیره: هر تغییر همین لحظه روی این دستگاه می‌ماند و با <kbd>Ctrl+Z</kbd> برمی‌گردد.</p>
        </div>
      </aside>
    </div>`);

  /* ---------------- party picker ---------------- */
  function drawParty() {
    const box = $('#partyBox', root);
    if (!box) return;
    box.innerHTML = S.party
      ? String(html`<div class="bk-party-sel"><b>${S.party.name}</b><span class="small">کد ${fa(S.party.code)}${S.party.mobile ? html` · ${fa(S.party.mobile)}` : ''}</span>${S.party.balance ? html`<span class="bk-bal ${balClass(S.party.balance)}">${balText(S.party.balance)}</span>` : ''}<button class="chip" data-act="party-clear">تغییر</button></div>`)
      : String(html`<div class="bk-party-find"><input class="input" id="pq" placeholder="نام، موبایل، کد ملی یا کد مشتری" autocomplete="off"><button class="chip" data-act="party-new">+ مشتری جدید</button><div class="bk-drop" id="pdrop" hidden></div></div>`);
  }
  let pqTimer = null;
  async function findParty(q) {
    const drop = $('#pdrop', root);
    if (!q.trim()) return (drop.hidden = true);
    const r = await api(`/api/books/parties?q=${encodeURIComponent(q)}`);
    drop.hidden = false;
    drop.innerHTML = r.items.length ? r.items.slice(0, 12).map((p) => String(html`<button data-pick="${p.id}"><b>${p.name}</b><span>${fa(p.mobile || p.nid || '')} · کد ${fa(p.code)}</span><em class="${balClass(p.balance)}">${balText(p.balance)}</em></button>`)).join('') : '<p class="small">پیدا نشد؛ «مشتری جدید» را بزنید.</p>';
    drop._items = r.items;
  }
  function newPartyModal() {
    modal(
      String(html`<h3 class="bk-h">مشتری جدید</h3><form class="form" id="np">
        <div class="seg" role="radiogroup"><label class="segopt"><input type="radio" name="kind" value="person" checked><span>حقیقی</span></label><label class="segopt"><input type="radio" name="kind" value="company"><span>حقوقی</span></label></div>
        <label class="field">نام و نام خانوادگی / نام شرکت<input class="input" name="name" required maxlength="120"></label>
        <div class="form cols"><label class="field">موبایل<input class="input ltr" name="mobile" inputmode="tel"></label><label class="field">کد ملی / شناسه ملی<input class="input ltr" name="nid" inputmode="numeric"></label></div>
        <div class="form cols"><label class="field">کد پستی<input class="input ltr" name="postal" inputmode="numeric"></label><label class="field">تاریخ تولد (برای تبریک)<input class="input ltr" name="birth" placeholder="۱۳۷۰/۰۱/۰۱"></label></div>
        <label class="field">نشانی<input class="input" name="address" maxlength="300"></label>
        <p class="err" id="nperr" role="alert"></p>
        <div class="actions"><button class="btn">ثبت و انتخاب</button><button class="btn ghost" type="button" data-close>انصراف</button></div></form>`),
      (m, close) =>
        $('#np', m).addEventListener('submit', async (e) => {
          e.preventDefault();
          const f = Object.fromEntries(new FormData(e.target));
          if (f.birth) f.birth = parseDay(f.birth) ?? 'x';
          try {
            const p = await api('/api/books/parties', { method: 'POST', body: f });
            Object.assign(S, { partyId: p.id, party: p });
            close();
            drawParty();
            recalc();
            commit(`طرف حساب: ${p.name}`, { focus: '#pq' });
          } catch (err) {
            $('#nperr', m).textContent = err.message;
          }
        }),
    );
  }

  /* ---------------- lines ---------------- */
  const defaults = (kind, tpl = null) => {
    const base = { kind, tpl: tpl?.id };
    if (kind === 'jewel') return { ...base, title: tpl?.label ?? 'کارساخته', weight: '', fineness: 750, p750: p750Live, ojratMode: tpl?.ojratMode ?? 'pct', ojrat: tpl?.ojrat ?? 0, profitPct: tpl?.profitPct ?? 7, stones: '', bros: '', discount: '' };
    if (kind === 'coin') return { ...base, coin: tpl?.coin ?? 'emami', count: 1, price: coinPrice(tpl?.coin ?? 'emami'), title: COIN_TYPES[tpl?.coin ?? 'emami'].label };
    if (kind === 'melt') return { ...base, title: 'آب‌شده', weight: '', fineness: 740, mazaneh: maz, side: type === 'buy' ? 'in' : 'out' };
    if (kind === 'used') return { ...base, title: 'طلای مستعمل', side: 'in', weight: '', stoneWeight: '', fineness: 740, p750: p750Live, deductPct: store.me.pricing.buybackDeductPct ?? 0 };
    if (kind === 'service') return { ...base, title: tpl?.label ?? 'خدمت', amount: '' };
    return { ...base, title: tpl?.label ?? 'کالا', qty: 1, price: '', discount: '', vatPct: tpl?.vatPct ?? settings.vatPct };
  };
  const inp = (i, k, v, { ltr = true, ro = false, w = '', list = '' } = {}) => html`<input class="input ${ltr ? 'ltr' : ''} ${w}" data-l="${i}" data-k="${k}" value="${v ?? ''}" ${ro ? 'readonly' : ''} ${ltr ? raw('inputmode="decimal"') : ''} ${list ? raw(`list="${list}"`) : ''} autocomplete="off">`;
  const lab = (label, input) => html`<label class="field xs">${label}${input}</label>`;
  function lineHtml(l, i) {
    const ro = lockPrice && !!l.itemId;
    let f;
    if (l.kind === 'jewel')
      f = html`${lab('وزن (گرم)', inp(i, 'weight', l.weight, { ro: !!l.itemId }))}${lab('عیار', inp(i, 'fineness', l.fineness, { ro: !!l.itemId }))}${lab(`قیمت گرم ۱۸ (${unitName()})`, inp(i, 'p750', l.p750))}
        <label class="field xs">نوع اجرت<select class="input" data-l="${i}" data-k="ojratMode" ${ro ? 'disabled' : ''}>${[['pct', 'درصد'], ['gram', `${unitName()} هر گرم`], ['fixed', `مبلغ ثابت (${unitName()})`]].map(([v, t2]) => html`<option value="${v}" ${l.ojratMode === v ? 'selected' : ''}>${t2}</option>`)}</select></label>
        ${lab('اجرت', inp(i, 'ojrat', l.ojrat, { ro }))}${lab('سود فروشنده ٪', inp(i, 'profitPct', l.profitPct, { ro }))}${lab(`سنگ (${unitName()})`, inp(i, 'stones', l.stones, { ro: !!l.itemId }))}${lab(`حق‌العمل (${unitName()})`, inp(i, 'bros', l.bros))}${lab(`تخفیف (${unitName()})`, inp(i, 'discount', l.discount, { ro: !admin && !settings.staffCanDiscount }))}`;
    else if (l.kind === 'coin')
      f = html`<label class="field xs">سکه<select class="input" data-l="${i}" data-k="coin">${shownCoins().map(([id, c]) => html`<option value="${id}" ${l.coin === id ? 'selected' : ''}>${c.label}</option>`)}</select></label>${lab('تعداد', inp(i, 'count', l.count))}${lab(`قیمت هر سکه (${unitName()})`, inp(i, 'price', l.price))}`;
    else if (l.kind === 'melt') f = html`${lab('وزن (گرم)', inp(i, 'weight', l.weight))}${lab('عیار ری‌گیری', inp(i, 'fineness', l.fineness))}${lab(`مظنه (${unitName()})`, inp(i, 'mazaneh', l.mazaneh))}`;
    else if (l.kind === 'used') f = html`${lab('وزن کل (گرم)', inp(i, 'weight', l.weight))}${lab('وزن سنگ و ناخالصی', inp(i, 'stoneWeight', l.stoneWeight))}${lab('عیار ری‌گیری', inp(i, 'fineness', l.fineness))}${lab('قیمت خرید گرم ۱۸', inp(i, 'p750', l.p750))}${lab('کسر / افت ٪', inp(i, 'deductPct', l.deductPct))}`;
    else if (l.kind === 'service') f = html`${lab(`مبلغ خدمت (${unitName()}، بدون مالیات)`, inp(i, 'amount', l.amount))}`;
    else f = html`${lab('تعداد', inp(i, 'qty', l.qty))}${lab(`قیمت واحد (${unitName()})`, inp(i, 'price', l.price))}${lab(`تخفیف (${unitName()})`, inp(i, 'discount', l.discount))}${lab('مالیات ٪', inp(i, 'vatPct', l.vatPct))}`;
    return html`<div class="bk-line ${l.side === 'in' ? 'in' : ''}" data-line="${i}">
      <div class="bk-line-h"><label class="bk-ck"><input type="checkbox" data-sel="${i}" ${selected.has(i) ? 'checked' : ''} aria-label="انتخاب ردیف"></label><b>${fa(i + 1)}</b>
        <input class="input bk-title" data-l="${i}" data-k="title" value="${l.title ?? ''}" maxlength="120" aria-label="شرح">
        <span class="bk-kind">${l.side === 'in' ? 'دریافتی از مشتری · ' : ''}${B.KIND_LABEL[l.kind]}${l.code ? html` · بارکد ${fa(l.code)}` : ''}</span>
        <button class="iconbtn" data-del-line="${i}" aria-label="حذف ردیف" title="حذف">✕</button></div>
      <div class="bk-line-f">${f}</div>
      <div class="bk-line-c" data-lcalc="${i}"></div>
    </div>`;
  }
  function drawLines() {
    const box = $('#lines', root);
    if (!box) return;
    box.innerHTML = S.lines.length ? S.lines.map((l, i) => String(lineHtml(l, i))).join('') : String(html`<p class="small bk-empty">بارکد را اسکن کنید یا از «قالب‌ها» کالا انتخاب کنید.</p>`);
    drawBulk();
  }
  function drawBulk() {
    const bar = $('#bulkline', root);
    if (!bar) return;
    bar.hidden = selected.size < 1;
    bar.innerHTML = String(html`<b>${fa(selected.size)} ردیف انتخاب شد</b>
      <label>قیمت گرم ۱۸<input class="input ltr" id="bl-p750" inputmode="decimal"></label>
      ${lockPrice ? '' : html`<label>اجرت ٪<input class="input ltr" id="bl-oj" inputmode="decimal"></label><label>سود ٪<input class="input ltr" id="bl-pr" inputmode="decimal"></label>`}
      <button class="btn small" data-act="bulk-apply">اعمال روی انتخاب‌ها</button><button class="chip" data-act="bulk-live">قیمت روز روی همه</button><button class="chip" data-act="bulk-del">حذف انتخاب‌ها</button>`);
  }
  async function addByCode(code) {
    code = B.digitsOnly(code) || code.trim();
    if (!code) return;
    try {
      const it = await api(`/api/books/items/code/${encodeURIComponent(code)}`);
      if (type !== 'return' && it.status === 'sold') return toast(`کالای ${code} قبلاً فروخته شده است.`, 'error');
      if (S.lines.some((l) => l.itemId === it.id)) return toast('این کالا در همین فاکتور هست.', 'error');
      S.lines.push({ kind: 'jewel', itemId: it.id, code: it.code, tpl: it.tpl, title: it.title, weight: it.weight, fineness: it.fineness, p750: p750Live, ojratMode: it.ojratMode, ojrat: it.ojrat, profitPct: it.profitPct, stones: it.stones || '', bros: '', discount: '' });
      drawLines();
      recalc();
      commit(`کالا: ${it.title}`, { focus: '#scan' });
      toast(`${it.title} · ${G(it.weight)} گرم افزوده شد.`, 'ok');
    } catch (e) {
      toast(e.message, 'error');
    }
  }
  function catalogModal() {
    const groups = tpls.groups.filter((g) => tpls.items.some((x) => x.group === g.id && !x.hidden && allowedKind(x.kind)));
    modal(
      String(html`<h3 class="bk-h">قالب کالا</h3><input class="input" id="tq" placeholder="جستجو: انگشتر، زنجیر کارتیه، ربع…"><div class="bk-cat" id="tc">${groups.map((g) => html`<h4>${g.label}</h4><div class="bk-cat-g">${tpls.items.filter((x) => x.group === g.id && !x.hidden && allowedKind(x.kind)).map((x) => html`<button data-tpl="${x.id}">${x.label}${x.kind === 'jewel' ? html`<small>${fa(x.ojrat)}${x.ojratMode === 'pct' ? '٪' : ''}</small>` : ''}</button>`)}</div>`)}</div>`),
      (m, close) => {
        $('#tq', m).addEventListener('input', (e) => {
          const q = e.target.value.trim();
          $$('[data-tpl]', m).forEach((b) => (b.hidden = !!q && !b.textContent.includes(q)));
        });
        m.addEventListener('click', (e) => {
          const b = e.target.closest('[data-tpl]');
          if (!b) return;
          const tpl = tpls.items.find((x) => x.id === b.dataset.tpl);
          S.lines.push(defaults(tpl.kind, tpl));
          close();
          drawLines();
          recalc();
          commit(`ردیف: ${tpl.label}`);
          $(`[data-l="${S.lines.length - 1}"][data-k="${tpl.kind === 'coin' ? 'count' : tpl.kind === 'service' ? 'amount' : 'weight'}"]`, root)?.focus();
        });
      },
    );
  }
  const allowedKind = (k) => (type === 'buy' ? ['used', 'melt', 'coin'].includes(k) : type === 'return' ? ['jewel', 'coin', 'melt', 'service', 'goods'].includes(k) : k !== 'used');

  /* ---------------- payments ---------------- */
  const acctSel = (i, p, kind) => html`<label class="field xs">${kind === 'cash' ? 'صندوق' : 'حساب بانکی'}<select class="input" data-p="${i}" data-k="account">${(kind === 'cash' ? cash : banks).map((a) => html`<option value="${a.id}" ${p.account === a.id ? 'selected' : ''}>${a.title}</option>`)}</select></label>`;
  const pin = (i, k, v, label, { ltr = true, ph = '' } = {}) => html`<label class="field xs">${label}<input class="input ${ltr ? 'ltr' : ''}" data-p="${i}" data-k="${k}" value="${v ?? ''}" placeholder="${ph}" ${ltr ? raw('inputmode="decimal"') : ''} autocomplete="off"></label>`;
  function payHtml(p, i) {
    const m = B.payMethod(p.method);
    let f = '';
    if (m.id === 'gold') f = html`${pin(i, 'weight', p.weight, 'وزن')}${pin(i, 'fineness', p.fineness, 'عیار')}${pin(i, 'p750', p.p750, 'قیمت گرم ۱۸ تسویه')}`;
    else if (m.id === 'coin') f = html`<label class="field xs">سکه<select class="input" data-p="${i}" data-k="coin">${shownCoins().map(([id, c]) => html`<option value="${id}" ${p.coin === id ? 'selected' : ''}>${c.short}</option>`)}</select></label>${pin(i, 'count', p.count, 'تعداد')}${pin(i, 'price', p.price, 'قیمت هر سکه')}`;
    else if (m.id === 'fx') f = html`${pin(i, 'fxCode', p.fxCode, 'ارز', { ltr: false, ph: 'دلار' })}${pin(i, 'fxAmount', p.fxAmount, 'مقدار ارز')}${pin(i, 'fxRate', p.fxRate, `نرخ (${unitName()})`)}${pin(i, 'amount', p.amount, `معادل (${unitName()})`)}${acctSel(i, p, 'cash')}`;
    else {
      f = html`${pin(i, 'amount', p.amount, `مبلغ (${unitName()})`)}`;
      if (m.acct === 'cash' || m.acct === 'bank') f = html`${f}${acctSel(i, p, m.acct)}`;
      if (m.ref) f = html`${f}${pin(i, 'ref', p.ref, m.id === 'pos' ? 'شماره پیگیری / مرجع' : 'شماره پیگیری')}`;
      if (m.card) f = html`${f}${pin(i, 'card', p.card, 'کارت پرداخت‌کننده (۱۶ یا ۴ رقم آخر)')}`;
      if (m.sheba) f = html`${f}${pin(i, 'sheba', p.sheba, 'شبای مبدأ/مقصد', { ph: 'IR…' })}`;
      if (m.id === 'cheque') f = html`${f}${pin(i, 'chequeNo', p.chequeNo, 'شماره چک')}${pin(i, 'sayad', p.sayad, 'شناسه صیادی (۱۶ رقم)')}${pin(i, 'bank', p.bank, 'بانک', { ltr: false })}${pin(i, 'dueJ', p.due ? jd(p.due) : '', 'سررسید (۱۴۰۵/۰۸/۱۵)')}${pin(i, 'owner', p.owner, 'صاحب حساب', { ltr: false })}`;
    }
    return html`<div class="bk-pay ${p.dir === 'out' ? 'out' : ''}" data-pay="${i}">
      <div class="bk-pay-h"><b>${m.label}</b>${type === 'transfer' ? html`<span class="small">${p.dir === 'out' ? 'مبدأ (برداشت)' : 'مقصد (واریز)'}</span>` : html`<select class="input bk-dir" data-p="${i}" data-k="dir"><option value="in" ${p.dir !== 'out' ? 'selected' : ''}>دریافت از طرف حساب</option><option value="out" ${p.dir === 'out' ? 'selected' : ''}>پرداخت به طرف حساب</option></select>`}
        ${type !== 'transfer' && !['gold', 'coin'].includes(m.id) ? html`<button class="chip" data-fill="${i}">باقی‌مانده</button>` : ''}${type !== 'transfer' ? html`<button class="iconbtn" data-del-pay="${i}" aria-label="حذف پرداخت">✕</button>` : ''}</div>
      <div class="bk-line-f">${type === 'transfer' ? html`<label class="field xs">نوع<select class="input" data-p="${i}" data-k="method">${['cash', 'havale', 'satna', 'paya', 'pol'].map((x) => html`<option value="${x}" ${p.method === x ? 'selected' : ''}>${B.payMethod(x).label}</option>`)}</select></label>` : ''}${f}</div></div>`;
  }
  function drawPays() {
    const box = $('#pays', root);
    if (!box) return;
    box.innerHTML = S.payments.length ? S.payments.map((p, i) => String(payHtml(p, i))).join('') : String(html`<p class="small bk-empty">${type === 'sale' ? 'روش پرداخت را از بالا بزنید؛ هرچه پرداخت نشود نسیه روی حساب مشتری می‌رود.' : 'روش دریافت یا پرداخت را انتخاب کنید.'}</p>`);
  }
  const defaultDir = () => (IN_TYPES.has(type) ? 'in' : 'out');
  function addPay(method) {
    const m = B.payMethod(method);
    const p = { method, dir: defaultDir() };
    if (m.acct === 'cash') p.account = cash[0]?.id;
    if (m.acct === 'bank') p.account = banks[0]?.id;
    if (method === 'gold') Object.assign(p, { weight: '', fineness: 750, p750: p750Live });
    if (method === 'coin') Object.assign(p, { coin: 'emami', count: 1, price: coinPrice('emami') });
    if (method === 'cheque') p.due = today();
    S.payments.push(p);
    if (!['gold', 'coin'].includes(method)) fillRemaining(S.payments.length - 1, false);
    drawPays();
    recalc();
    $(`[data-p="${S.payments.length - 1}"][data-k="${method === 'gold' ? 'weight' : method === 'coin' ? 'count' : 'amount'}"]`, root)?.focus();
  }
  function fillRemaining(i, redraw = true) {
    const c = safeCalc({ ...docBody(), payments: S.payments.filter((_, j) => j !== i) }).calc;
    if (!c) return;
    const rem = type === 'receipt' || type === 'payment' || type === 'expense' ? 0 : c.credit;
    const p = S.payments[i];
    if (rem === 0) return;
    p.dir = rem > 0 ? 'in' : 'out';
    p.amount = String((Math.abs(rem) / 10) * k);
    if (redraw) {
      drawPays();
      recalc();
    }
  }

  /* ---------------- opening balances ---------------- */
  let partyList = null;
  async function drawBals() {
    const box = $('#bals', root);
    if (!box) return;
    partyList ??= (await api('/api/books/parties')).items;
    const opts = [...partyList.map((p) => [`party:${p.id}`, `مشتری: ${p.name}`]), ...cash.map((a) => [`cash:${a.id}`, `صندوق: ${a.title}`]), ...banks.map((a) => [`bank:${a.id}`, `بانک: ${a.title}`]), ['gold', 'صندوق طلا (گرم ۷۵۰)'], ...Object.entries(COIN_TYPES).map(([id, c]) => [`coin:${id}`, `سکه: ${c.short}`])];
    box.innerHTML = S.balances.map((b, i) => String(html`<div class="bk-line-f bk-balrow"><label class="field xs">حساب<select class="input" data-b="${i}" data-k="acct">${opts.map(([v, l]) => html`<option value="${v}" ${b.acct === v ? 'selected' : ''}>${l}</option>`)}</select></label>
      ${String(b.acct ?? '').startsWith('party:') ? html`<label class="field xs">واحد<select class="input" data-b="${i}" data-k="unit"><option value="IRR" ${b.unit !== 'G750' ? 'selected' : ''}>${unitName()}</option><option value="G750" ${b.unit === 'G750' ? 'selected' : ''}>گرم ۷۵۰</option></select></label>` : ''}
      <label class="field xs">مقدار (${unitName()} / گرم / عدد)<input class="input ltr" data-b="${i}" data-k="amount" value="${b.amount ?? ''}" inputmode="decimal"></label><button class="iconbtn" data-del-bal="${i}" aria-label="حذف">✕</button></div>`)).join('');
  }

  /* ---------------- totals ---------------- */
  function docBody() {
    const pays = S.payments.map((p) => ({ ...p, due: p.dueJ !== undefined ? parseDay(p.dueJ) ?? p.dueJ : p.due }));
    return { type, date: S.date, partyId: S.partyId, lines: S.lines.map((l) => toEngine(l, LINE_MONEY)), payments: pays.map((p) => toEngine(p, PAY_MONEY)), creditUnit: S.creditUnit, creditP750: B.num(S.creditP750) / k, note: S.note, category: S.category || undefined, ref: S.ref, balances: S.balances, money: prefs.money, seller: S.seller };
  }
  function safeCalc(body) {
    try {
      return { calc: B.calcDoc(body, { vatPct: settings.vatPct }) };
    } catch (e) {
      return { error: e.message };
    }
  }
  function recalc() {
    const body = docBody();
    // per-line figures first, so one bad line does not hide the others
    S.lines.forEach((l, i) => {
      const el = $(`[data-lcalc="${i}"]`, root);
      if (!el) return;
      try {
        const side = type === 'buy' ? 'in' : type === 'return' ? 'out' : l.side === 'in' ? 'in' : 'out';
        const c = B.calcLine({ ...toEngine(l, LINE_MONEY), side }, { vatPct: settings.vatPct });
        el.className = 'bk-line-c';
        el.innerHTML = String(
          c.kind === 'jewel'
            ? html`<span>طلا ${T(c.principal)}</span><span>اجرت ${T(c.consfee)}</span><span>سود ${T(c.spro)}</span>${c.bros ? html`<span>حق‌العمل ${T(c.bros)}</span>` : ''}${c.stones ? html`<span>سنگ ${T(c.stones)}</span>` : ''}<span>مالیات ${T(c.vat)}</span><b>${TU(c.total)}</b>`
            : c.kind === 'used' || c.kind === 'melt'
              ? html`<span>معادل ۷۵۰: ${G(c.g750)} گرم</span>${c.discount ? html`<span>کسر ${T(c.discount)}</span>` : ''}<b>${TU(c.total)}</b>`
              : html`${c.vat ? html`<span>مالیات ${T(c.vat)}</span>` : ''}<b>${TU(c.total)}</b>`,
        );
      } catch (e) {
        el.className = 'bk-line-c err';
        el.textContent = e.message;
      }
    });
    const { calc, error } = safeCalc(body);
    const box = $('#totals', root);
    if (!calc) {
      box.innerHTML = String(html`<p class="err">${error}</p>`);
      return null;
    }
    const row = (k, v, cls = '') => html`<div class="kv ${cls}"><span>${k}</span><b>${v}</b></div>`;
    const credit = calc.credit;
    box.innerHTML = String(html`
      ${hasLines ? html`${row('ارزش طلا (اصل، معاف)', T(calc.principal))}${calc.stones ? row('سنگ و جواهر (اصل)', T(calc.stones)) : ''}${row('اجرت ساخت', T(calc.consfee))}${row('سود فروشنده', T(calc.spro))}${calc.bros ? row('حق‌العمل', T(calc.bros)) : ''}${calc.discount ? row('تخفیف', T(calc.discount)) : ''}${row(`مالیات بر ارزش افزوده (${fa(settings.vatPct)}٪ اجرت و سود)`, T(calc.vat))}${row(type === 'buy' ? 'جمع خرید' : 'جمع فاکتور', TU(type === 'buy' ? calc.tradeIn : calc.sales), 'big')}${calc.tradeIn && type !== 'buy' ? row('طلای دریافتی (تعویض)', `− ${T(calc.tradeIn)}`) : ''}` : ''}
      ${hasLines && calc.tradeIn && type !== 'buy' ? row(calc.net >= 0 ? 'خالص قابل دریافت' : 'خالص قابل پرداخت به مشتری', TU(Math.abs(calc.net)), 'big') : ''}
      ${hasPays ? html`${row('دریافت‌شده', T(calc.paidIn))}${row('پرداخت‌شده', T(calc.paidOut))}` : ''}
      ${['sale', 'buy', 'return'].includes(type) ? row(credit === 0 ? 'تسویه کامل' : credit > 0 ? 'مانده بدهی طرف حساب (نسیه)' : 'مانده بستانکاری طرف حساب', credit === 0 ? '✓' : TU(Math.abs(credit)), credit ? 'warn' : 'ok') : ''}
      ${['sale', 'buy', 'return', 'receipt'].includes(type) && S.partyId
        ? html`<div class="bk-cu"><span>مانده به حساب</span><div class="seg"><button data-cu="IRR" aria-pressed="${S.creditUnit === 'IRR'}">ریالی</button><button data-cu="G750" aria-pressed="${S.creditUnit === 'G750'}">طلایی (گرم ۷۵۰)</button></div>${S.creditUnit === 'G750' ? html`<label class="field xs">قیمت گرم ۱۸ تبدیل<input class="input ltr" data-cp value="${S.creditP750}" inputmode="decimal"></label><b>${G(calc.creditG)} گرم</b>` : ''}</div>`
        : ''}
      ${type === 'sale' && calc.sales % 10000 && S.lines.some((l) => l.kind === 'jewel') ? html`<button class="chip" data-act="round">گرد کردن به هزار ${unitName()} (تخفیف از سود)</button>` : ''}
      ${type === 'sale' && calc.sales ? html`<p class="small">مبلغ به حروف: ${moneyWords(calc.sales)}</p>` : ''}`);
    return calc;
  }

  /* ---------------- save ---------------- */
  async function save(status, btn) {
    const body = docBody();
    const d = parseDay($('[name=date]', root).value);
    if (!d) return toast('تاریخ را درست وارد کنید (مثلاً ۱۴۰۵/۰۷/۰۶).', 'error');
    body.date = d;
    body.status = status;
    for (const p of body.payments) if (p.method === 'cheque' && !/^\d{4}-\d{2}-\d{2}$/.test(p.due ?? '')) return toast('سررسید چک را به تاریخ شمسی وارد کنید.', 'error');
    if (editing?.status === 'final') {
      body.reason = $('[name=reason]', root).value.trim();
      if (body.reason.length < 3) return (toast('دلیل ویرایش را بنویسید.', 'error'), $('[name=reason]', root).focus());
    }
    const { error } = safeCalc(body);
    if (error) return toast(error, 'error');
    busy(btn, true);
    try {
      let doc;
      if (editing) doc = await api(`/api/books/docs/${editing.id}`, { method: 'PUT', body });
      else {
        const r = await submit({ url: '/api/books/docs', body, label: `${B.DOC_TYPES[type].label}` });
        if (r.queued) {
          drafts.set(`doc:${type}`, null);
          hist.reset();
          toast('اتصال برقرار نیست؛ سند روی همین دستگاه در صف ماند و به‌محض وصل شدن خودکار ثبت می‌شود (دو بار ثبت نمی‌شود).', 'info');
          return navigate('/books');
        }
        doc = r.doc;
      }
      drafts.set(`doc:${type}`, null);
      toast(doc.amends ? `اصلاحیه ثبت شد: ${B.DOC_TYPES[doc.type].short} شماره ${fa(doc.no)} جای سند قبلی را گرفت.` : `${B.DOC_TYPES[doc.type].short} شماره ${fa(doc.no)} ثبت شد.`, 'ok');
      for (const w of doc.warnings ?? []) toast(w);
      navigate(`/books/doc/${doc.id}${doc.status === 'final' && ['sale', 'buy', 'return', 'proforma', 'receipt', 'payment'].includes(doc.type) ? '?print=1' : ''}`);
    } catch (e) {
      toast(e.message, 'error');
      if (e.status === 409 && /سقف اعتبار/.test(e.message) && admin) {
        if (confirm('سقف اعتبار رد شود و سند ثبت شود؟')) {
          try {
            const doc = await api('/api/books/docs', { method: 'POST', body: { ...body, force: true } });
            drafts.set(`doc:${type}`, null);
            navigate(`/books/doc/${doc.id}?print=1`);
          } catch (e2) {
            toast(e2.message, 'error');
          }
        }
      }
    } finally {
      busy(btn, false);
    }
  }

  /* ---------------- events ---------------- */
  const numKeys = new Set(['weight', 'fineness', 'p750', 'ojrat', 'profitPct', 'stones', 'bros', 'discount', 'count', 'price', 'mazaneh', 'stoneWeight', 'deductPct', 'amount', 'qty', 'vatPct', 'fxAmount', 'fxRate']);
  root.addEventListener('input', (e) => {
    const el = e.target;
    if (el.dataset.l !== undefined) {
      const l = S.lines[Number(el.dataset.l)];
      l[el.dataset.k] = el.value;
      if (el.dataset.k === 'coin') (l.price = coinPrice(el.value)), (l.title = COIN_TYPES[el.value].label), drawLines();
      recalc();
    } else if (el.dataset.p !== undefined) {
      const p = S.payments[Number(el.dataset.p)];
      p[el.dataset.k] = el.value;
      if (el.dataset.k === 'dueJ') p.due = parseDay(el.value) ?? '';
      if (el.dataset.k === 'coin') {
        p.price = coinPrice(el.value);
        drawPays();
      }
      if ((el.dataset.k === 'fxAmount' || el.dataset.k === 'fxRate') && B.num(p.fxAmount) > 0 && B.num(p.fxRate) > 0) {
        p.amount = String(Math.round(B.num(p.fxAmount) * B.num(p.fxRate)));
        const a = $(`[data-p="${el.dataset.p}"][data-k="amount"]`, root);
        if (a) a.value = p.amount;
      }
      if (type === 'transfer' && el.dataset.k === 'amount') {
        for (const q of S.payments) q.amount = el.value;
        $$('[data-k="amount"]', root).forEach((x) => x !== el && (x.value = el.value));
      }
      if (el.dataset.k === 'method' || el.dataset.k === 'dir') drawPays();
      recalc();
    } else if (el.dataset.b !== undefined) {
      S.balances[Number(el.dataset.b)][el.dataset.k] = el.value;
      if (el.dataset.k === 'acct') drawBals();
    } else if (el.dataset.cp !== undefined) {
      S.creditP750 = el.value;
      recalc();
    } else if (el.name === 'note') S.note = el.value;
    else if (el.name === 'category') S.category = el.value;
    else if (el.name === 'date') S.date = parseDay(el.value) ?? S.date;
    else if (el.id === 'pq') {
      clearTimeout(pqTimer);
      pqTimer = setTimeout(() => findParty(el.value), 200);
    } else if (el.dataset.sel !== undefined) {
      if (el.checked) selected.add(Number(el.dataset.sel));
      else selected.delete(Number(el.dataset.sel));
      drawBulk();
    }
    void numKeys;
  });
  root.addEventListener('change', (e) => {
    if (e.target.matches('select[data-l], select[data-p], select[data-b], [name=category]')) e.target.dispatchEvent(new Event('input', { bubbles: true }));
  });
  root.addEventListener('keydown', (e) => {
    if (e.target.id === 'scan' && e.key === 'Enter') {
      e.preventDefault();
      addByCode(e.target.value);
      e.target.value = '';
    }
  });
  const onKey = (e) => {
    if (e.key === 'F2') {
      e.preventDefault();
      $('#scan', root)?.focus();
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      save('final', $('[data-act=save]', root));
    }
  };
  document.addEventListener('keydown', onKey);
  root.addEventListener('click', async (e) => {
    const b = e.target.closest('button, [data-pick]');
    if (!b) return;
    if (b.dataset.pick) {
      const p = $('#pdrop', root)._items.find((x) => x.id === b.dataset.pick);
      Object.assign(S, { partyId: p.id, party: p });
      drawParty();
      recalc();
      commit(`طرف حساب: ${p.name}`, { focus: '#pq' });
      return;
    }
    if (b.dataset.delLine !== undefined) {
      S.lines.splice(Number(b.dataset.delLine), 1);
      selected.clear();
      drawLines();
      return recalc();
    }
    if (b.dataset.addPay) return addPay(b.dataset.addPay);
    if (b.dataset.delPay !== undefined) {
      S.payments.splice(Number(b.dataset.delPay), 1);
      drawPays();
      return recalc();
    }
    if (b.dataset.fill !== undefined) return fillRemaining(Number(b.dataset.fill));
    if (b.dataset.delBal !== undefined) {
      S.balances.splice(Number(b.dataset.delBal), 1);
      return drawBals();
    }
    if (b.dataset.cu) {
      S.creditUnit = b.dataset.cu;
      return recalc();
    }
    const act = b.dataset.act;
    if (act === 'scan') {
      addByCode($('#scan', root).value);
      $('#scan', root).value = '';
    } else if (act === 'catalog') catalogModal();
    else if (act === 'add-used') {
      S.lines.push(defaults('used'));
      drawLines();
      recalc();
    } else if (act === 'party-clear') {
      Object.assign(S, { partyId: null, party: null });
      drawParty();
      recalc();
      $('#pq', root)?.focus();
    } else if (act === 'party-new') newPartyModal();
    else if (act === 'add-bal') {
      S.balances.push({ acct: 'gold', amount: '' });
      drawBals();
    } else if (act === 'bulk-apply') {
      const v = (id) => $(id, root)?.value.trim();
      for (const i of selected) {
        const l = S.lines[i];
        if (!l) continue;
        if (v('#bl-p750') && (l.kind === 'jewel' || l.kind === 'used')) l.p750 = v('#bl-p750');
        if (v('#bl-oj') && l.kind === 'jewel') (l.ojratMode = 'pct'), (l.ojrat = v('#bl-oj'));
        if (v('#bl-pr') && l.kind === 'jewel') l.profitPct = v('#bl-pr');
      }
      drawLines();
      recalc();
    } else if (act === 'bulk-live') {
      for (const l of S.lines) {
        if (l.kind === 'jewel' || l.kind === 'used') l.p750 = p750Live;
        if (l.kind === 'melt') l.mazaneh = maz;
        if (l.kind === 'coin') l.price = coinPrice(l.coin);
      }
      drawLines();
      recalc();
      toast('قیمت روز روی همه ردیف‌ها نشست.', 'ok');
    } else if (act === 'bulk-del') {
      S.lines = S.lines.filter((_, i) => !selected.has(i));
      selected.clear();
      drawLines();
      recalc();
    } else if (act === 'round') {
      const c = safeCalc(docBody()).calc;
      if (!c) return;
      // the piece with the largest taxable part takes the rounding
      let best = -1;
      c.lines.forEach((l, i) => l.kind === 'jewel' && l.side === 'out' && (best < 0 || l.tcpbs > c.lines[best].tcpbs) && (best = i));
      const target = Math.floor(c.sales / 10000) * 10000;
      const src = S.lines[best];
      const others = c.sales - c.lines[best].total;
      const cur = B.num(src.discount) || 0;
      const eng = toEngine({ ...src, discount: 0 }, LINE_MONEY);
      const d = B.discountForTarget(eng, others + B.calcLine({ ...eng, side: 'out' }, { vatPct: settings.vatPct }).total, target, { vatPct: settings.vatPct });
      if (d == null || (!admin && !settings.staffCanDiscount)) return toast('این ردیف اجرت و سود کافی برای گرد کردن ندارد یا تخفیف مجاز نیست.', 'error');
      src.discount = String(Math.max(cur, d * k));
      drawLines();
      recalc();
      toast(`تخفیف ${TU(B.rnd(d * 10))} روی «${src.title}» نشست؛ جمع گرد شد.`, 'ok');
    } else if (act === 'save') save('final', b);
    else if (act === 'drop') {
      Object.assign(S, { partyId: null, party: null, lines: [], payments: [], note: '', balances: [], ref: null });
      $('.bk-draft', root)?.remove();
      drawAll();
      commit('شروع تازه (کار قبلی با Ctrl+Z برمی‌گردد)');
    }
    // every click that changed the document is one step back
    else if (b.dataset.addPay || b.dataset.delPay !== undefined || b.dataset.delLine !== undefined || b.dataset.fill !== undefined || b.dataset.cu || b.dataset.delBal !== undefined || ['add-used', 'party-clear', 'add-bal', 'bulk-apply', 'bulk-live', 'bulk-del', 'round'].includes(act)) commit(STEP_FA[act] ?? (b.dataset.addPay ? `پرداخت: ${B.payMethod(b.dataset.addPay)?.label}` : b.dataset.delPay !== undefined ? 'حذف پرداخت' : b.dataset.delLine !== undefined ? 'حذف ردیف' : b.dataset.fill !== undefined ? 'باقی‌مانده در پرداخت' : b.dataset.cu ? 'واحد مانده' : 'تغییر'));
  });
  function drawAll() {
    drawParty();
    drawLines();
    drawPays();
    drawBals();
    recalc();
    const d = $('[name=date]', root);
    if (d) d.value = jdInput(S.date);
  }
  // برگشت سریع (spec 0013) for every document form
  const STEP_FA = { 'add-used': 'طلای مستعمل (تعویض)', 'party-clear': 'طرف حساب برداشته شد', 'add-bal': 'ردیف مانده', 'bulk-apply': 'اعمال روی ردیف‌های انتخابی', 'bulk-live': 'قیمت روز روی همه', 'bulk-del': 'حذف ردیف‌های انتخابی', round: 'گرد کردن جمع' };
  const KEY_FA = { weight: 'وزن', fineness: 'عیار', p750: 'قیمت گرم ۱۸', ojratMode: 'نوع اجرت', ojrat: 'اجرت', profitPct: 'سود', stones: 'سنگ', bros: 'حق‌العمل', discount: 'تخفیف', coin: 'سکه', count: 'تعداد', price: 'قیمت', mazaneh: 'مظنه', stoneWeight: 'وزن سنگ', deductPct: 'کسر', amount: 'مبلغ', qty: 'تعداد', vatPct: 'مالیات', title: 'شرح', account: 'حساب', ref: 'پیگیری', card: 'کارت', dir: 'جهت', method: 'روش', chequeNo: 'شماره چک', sayad: 'صیادی', bank: 'بانک', dueJ: 'سررسید', owner: 'صاحب حساب', fxCode: 'ارز', fxAmount: 'مقدار ارز', fxRate: 'نرخ', acct: 'حساب' };
  const hist = createHistory({ get: () => ({ ...S }), set: (v) => (Object.assign(S, v), drawAll()) });
  const commit = (label, opts) => hist.commit(label, opts);
  if (!editing) hist.on(() => drafts.set(`doc:${type}`, S.lines.length || S.payments.length || S.partyId || S.balances.length ? { S: { ...S }, at: Date.now() } : null));
  const stopDock = mountDock(hist, { root });
  root.addEventListener('input', (e) => {
    const el = e.target;
    const k = el.dataset.k;
    if (el.dataset.l !== undefined) commit(`ردیف ${fa(Number(el.dataset.l) + 1)} — ${KEY_FA[k] ?? k}: ${fa(el.value || '—')}`, { key: `l${el.dataset.l}.${k}`, focus: `[data-l="${el.dataset.l}"][data-k="${k}"]` });
    else if (el.dataset.p !== undefined) commit(`${B.payMethod(S.payments[Number(el.dataset.p)]?.method)?.label ?? 'پرداخت'} — ${KEY_FA[k] ?? k}: ${fa(el.value || '—')}`, { key: `p${el.dataset.p}.${k}`, focus: `[data-p="${el.dataset.p}"][data-k="${k}"]` });
    else if (el.dataset.b !== undefined) commit(`مانده — ${KEY_FA[k] ?? k}`, { key: `b${el.dataset.b}.${k}`, focus: `[data-b="${el.dataset.b}"][data-k="${k}"]` });
    else if (el.name === 'note') commit('یادداشت سند', { key: 'note', focus: '[name=note]' });
    else if (el.name === 'date') commit(`تاریخ ${fa(el.value)}`, { key: 'date', focus: '[name=date]' });
    else if (el.dataset.cp !== undefined) commit('قیمت تبدیل مانده طلایی', { key: 'cp', focus: '[data-cp]' });
  });
  if (draft?.S) Object.assign(S, draft.S, { type });
  drawAll();
  hist.reset();
  if (hasLines) $('#scan', root)?.focus();
  else $('#pq', root)?.focus();
  if (S.party && !S.party.balance && S.partyId) api(`/api/books/parties/${S.partyId}`).then((r) => ((S.party = { ...S.party, balance: r.balance }), drawParty())).catch(() => {});
  return () => {
    document.removeEventListener('keydown', onKey);
    stopDock();
  };
}
