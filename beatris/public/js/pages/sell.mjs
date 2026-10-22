// میز فروش زنده (spec 0037): one screen for the seller — the customer and their file, the showcase, the cart with its
// what-ifs, the old gold taken in, a split payment, and the customer's own screen. Every figure comes from the books
// engine through sell.mjs; the document saved is the ordinary sale invoice, through the same outbox (spec 0013).
import { html, raw, fa, api, store, toast, $, $$, busy } from '../core.mjs';
import * as B from '../books.mjs';
import * as S from '../sell.mjs';
import { TU, G, today, booksPrefs, prefs, K, unitName, jd } from '../bk.mjs';
import { booksNav } from './books.mjs';
import { drafts, submit } from '../outbox.mjs';
import { posConfig, posMode, posProblem, cardWindow } from '../pos.mjs';

const CHANNEL = 'beatris-sell';
const PAYS = [
  ['cash', 'نقد'],
  ['pos', 'کارتخوان'],
  ['c2c', 'کارت به کارت'],
  ['havale', 'حواله'],
];
const toman = (display) => B.num(display) / K(); // what the seller types, in the engine's toman
const disp = (tomanV) => Math.round(B.num(tomanV) * K()); // engine toman → the shop's unit

export async function sellPage(root) {
  await booksPrefs();
  const settings = prefs.settings ?? {};
  const admin = store.isAdmin();
  const canDiscount = admin || !!settings.staffCanDiscount;
  const canPrice = admin || !!settings.staffCanEditPrice;
  const vatPct = settings.vatPct ?? 10;
  let p750 = store.me.pricing.p750;
  const [stockRes, tplRes] = await Promise.all([api('/api/books/items?status=stock'), api('/api/books/templates')]);
  let stock = stockRes.items;
  const groups = tplRes.groups.filter((g) => stock.some((it) => B.templateById(it.tpl)?.group === g.id));
  const shop = store.me.brand?.shopName || store.me.tenant?.name || '';

  /* ---------------- state (kept on this device until the sale is booked) ---------------- */
  const saved = await drafts.get('sell').catch(() => null);
  const St = {
    party: saved?.party ?? null,
    file: null,
    cart: saved?.cart ?? { lines: [], tradeIns: [], payments: [] },
    q: '',
    group: '',
    compare: new Set(),
    preview: null,
    budget: '',
    done: null,
  };
  const keep = () => drafts.set('sell', St.cart.lines.length || St.cart.tradeIns.length || St.party ? { party: St.party, cart: St.cart } : null).catch(() => {});
  const ch = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL) : null;

  root.innerHTML = String(html`${booksNav('sell')}
    <section class="sl-top">
      <div><h1>میز فروش</h1><p class="small">مشتری، کالا، قیمت لحظه‌ای، معاوضه و پرداخت — در یک صفحه. <kbd>F2</kbd> کالا · <kbd>F3</kbd> مشتری · <kbd>Ctrl+Enter</kbd> ثبت</p></div>
      <div class="sl-live" id="live"></div>
      <div class="sl-top-act"><a class="btn small ghost" href="/books/sell/screen" target="beatris-screen" data-screen>صفحه‌ی مشتری ↗</a></div>
    </section>
    <div class="sl-grid">
      <section class="sl-col sl-who" aria-label="مشتری">
        <h2 class="sl-h">مشتری</h2>
        <div id="who"></div>
        <div id="file"></div>
        <h2 class="sl-h">پیشنهاد</h2>
        <div id="sugg" class="sl-sugg"></div>
      </section>
      <section class="sl-col sl-shelf" aria-label="ویترین">
        <div class="sl-find"><input class="input" id="iq" placeholder="بارکد را بزنید یا نام کالا را بنویسید (F2)" autocomplete="off"><span class="small" id="icount"></span></div>
        <div class="sl-groups" id="groups"></div>
        <div class="sl-items" id="items"></div>
        <div id="cmp"></div>
      </section>
      <section class="sl-col sl-cart" aria-label="سبد">
        <h2 class="sl-h">سبد <span class="small" id="ccount"></span></h2>
        <div id="lines"></div>
        <details class="sl-tin" id="tin"><summary>+ معاوضه / طلای کهنه</summary>
          <div class="sl-tin-f">
            <label class="field xs">شرح<input class="input" data-t="title" value="طلای کهنه"></label>
            <label class="field xs">وزن (گرم)<input class="input ltr" data-t="weight" inputmode="decimal"></label>
            <label class="field xs">وزن سنگ<input class="input ltr" data-t="stoneWeight" inputmode="decimal" value="0"></label>
            <label class="field xs">عیار<input class="input ltr" data-t="fineness" inputmode="numeric" value="740"></label>
            <label class="field xs">گرم ۱۸ خرید (${unitName()})<input class="input ltr" data-t="p750" inputmode="decimal" value="${disp(p750)}"></label>
            <label class="field xs">کسر ٪<input class="input ltr" data-t="deductPct" inputmode="decimal" value="${store.me.pricing.buybackDeductPct ?? 0}"></label>
            <button class="btn small" data-act="tin-add">افزودن به سبد</button>
          </div>
        </details>
        <div id="tins"></div>
        <h2 class="sl-h">اگر…؟ <span class="small">هیچ‌کدام سند را عوض نمی‌کند تا «اعمال» بزنید</span></h2>
        <div id="what" class="sl-what"></div>
        <div class="sl-budget"><label class="field xs">بودجه‌ی مشتری (${unitName()})<input class="input ltr" id="bud" inputmode="decimal" placeholder="مثلاً ۱۵۰٬۰۰۰٬۰۰۰"></label><div id="budr" class="small"></div></div>
        <h2 class="sl-h">پرداخت</h2>
        <div class="sl-pays-m">${PAYS.map(([id, l]) => html`<button class="chip" data-pay="${id}">+ ${l}</button>`)}</div>
        <div id="pays"></div>
        <div class="sl-total" id="tot" aria-live="polite"></div>
        <div class="sl-act">
          <button class="btn block" data-act="sell">ثبت فروش <kbd>Ctrl+Enter</kbd></button>
          <div class="sl-act2"><button class="btn small ghost" data-act="reserve">رزرو برای مشتری</button><button class="btn small ghost" data-act="clear">سبد تازه</button></div>
        </div>
        <div id="done"></div>
      </section>
    </div>`);

  /* ---------------- figures ---------------- */
  const calc = () => {
    try {
      return { t: S.totals(St.cart, { vatPct }) };
    } catch (e) {
      return { error: e.message };
    }
  };
  const priceOf = (it) => S.priceOf(it, p750, { vatPct });
  const favorites = () => St.file?.favorites?.map((f) => f.group) ?? [];

  function drawLive() {
    $('#live', root).innerHTML = String(html`<span>گرم ۱۸ امروز</span><b>${TU(Math.round(p750 * 10))}</b><button class="chip" data-act="refresh" title="قیمت تازه">↻</button>`);
  }

  /* ---------------- the customer ---------------- */
  function drawWho() {
    const box = $('#who', root);
    if (St.party) {
      box.innerHTML = String(html`<div class="sl-party"><b>${St.party.name}</b><span class="small">کد ${fa(St.party.code)}${St.party.mobile ? html` · ${fa(St.party.mobile)}` : ''}</span><button class="chip" data-act="party-clear">تغییر</button></div>`);
      return;
    }
    box.innerHTML = String(html`<div class="sl-pfind"><input class="input" id="pq" placeholder="نام، موبایل یا کد مشتری (F3)" autocomplete="off"><div class="sl-drop" id="pdrop" hidden></div></div>
      <p class="small">فروش بی‌نام هم ممکن است، به شرط تسویه‌ی کامل.</p>`);
  }
  function drawFile() {
    const f = St.file, box = $('#file', root);
    if (!St.party || !f) return (box.innerHTML = '');
    const bal = Object.entries(f.balance ?? {});
    box.innerHTML = String(html`<div class="sl-file">
      <div class="sl-file-row"><span>خرید</span><b>${fa(f.purchases)} بار</b></div>
      <div class="sl-file-row"><span>جمع خرید</span><b>${TU(f.spent)}</b></div>
      ${f.purchases ? html`<div class="sl-file-row"><span>میانگین هر خرید</span><b>${TU(f.avgTicket)}</b></div>` : ''}
      ${f.lastVisit ? html`<div class="sl-file-row"><span>آخرین مراجعه</span><b>${jd(f.lastVisit)}</b></div>` : ''}
      ${bal.length ? html`<div class="sl-file-row"><span>مانده</span><b>${bal.map(([u, v]) => (u === 'IRR' ? `${v > 0 ? 'بدهکار' : 'بستانکار'} ${TU(Math.abs(v))}` : `${fa(B.r3(Math.abs(v)))} ${B.UNITS[u] ?? u}`)).join(' · ')}</b></div>` : ''}
      ${f.favorites.length ? html`<div class="sl-tags">${f.favorites.map((x) => html`<span class="chip">${x.label} · ${fa(x.n)}</span>`)}</div>` : html`<p class="small">مشتری تازه است؛ سلیقه‌اش با اولین خرید ثبت می‌شود.</p>`}
      ${f.weightRange ? html`<p class="small">وزن معمول: ${G(f.weightRange[0])} تا ${G(f.weightRange[1])} گرم${f.fineness ? html` · عیار ${fa(f.fineness)}` : ''}</p>` : ''}
      ${f.recent.length ? html`<ul class="sl-recent">${f.recent.slice(0, 4).map((r) => html`<li><span>${r.title}${r.weight ? html` · ${G(r.weight)} گرم` : ''}</span><em>${jd(r.date)}</em></li>`)}</ul>` : ''}
    </div>`);
  }
  async function pickParty(p) {
    St.party = { id: p.id, name: p.name, code: p.code, mobile: p.mobile };
    St.file = await api(`/api/books/parties/${p.id}/profile`).catch(() => null);
    drawWho();
    drawFile();
    drawSugg();
    changed();
  }
  let pqTimer = null;
  async function findParty(q) {
    const drop = $('#pdrop', root);
    if (!drop) return;
    if (!q.trim()) return (drop.hidden = true);
    const r = await api(`/api/books/parties?q=${encodeURIComponent(q)}`).catch(() => ({ items: [] }));
    drop.hidden = false;
    drop.innerHTML = String(html`${r.items.slice(0, 8).map((p) => html`<button data-pick="${p.id}"><b>${p.name}</b><span>${fa(p.mobile || '')} · کد ${fa(p.code)}</span></button>`)}
      <form class="sl-newp" id="np"><b>مشتری تازه</b><input class="input" name="name" placeholder="نام و نام خانوادگی" value="${/\d/.test(q) ? '' : q}" required><input class="input ltr" name="mobile" placeholder="موبایل" inputmode="tel" value="${/^[0-9۰-۹]+$/.test(q) ? q : ''}"><button class="btn small">ثبت و انتخاب</button></form>`);
    drop._items = r.items;
  }

  /* ---------------- the showcase ---------------- */
  function shown() {
    const q = St.q.trim();
    return stock.filter((it) => !St.cart.lines.some((l) => l.itemId === it.id) && (!St.group || B.templateById(it.tpl)?.group === St.group) && (!q || it.code === (B.digitsOnly(q) || q) || it.title.includes(q) || (it.showcase && it.showcase.includes(q))));
  }
  function drawShelf() {
    $('#groups', root).innerHTML = String(html`<button class="chip" data-group="" aria-pressed="${!St.group}">همه</button>${groups.map((g) => html`<button class="chip" data-group="${g.id}" aria-pressed="${St.group === g.id}">${g.label}</button>`)}`);
    const list = shown();
    $('#icount', root).textContent = `${fa(list.length)} قطعه`;
    $('#items', root).innerHTML = list.length
      ? String(html`${list.slice(0, 60).map((it) => {
          const price = priceOf(it);
          return html`<article class="sl-item ${St.compare.has(it.id) ? 'cmp' : ''}">
            <button class="sl-item-main" data-add="${it.id}"><b>${it.title}</b><span>${G(it.weight)} گرم · عیار ${fa(it.fineness)}${it.showcase ? html` · ${/^ویترین/.test(it.showcase) ? it.showcase : `ویترین ${it.showcase}`}` : ''}</span><em>${price != null ? TU(price) : '—'}</em></button>
            <label class="sl-cmpck"><input type="checkbox" data-cmp="${it.id}" ${St.compare.has(it.id) ? 'checked' : ''}> مقایسه</label>
          </article>`;
        })}`)
      : '<p class="small">قطعه‌ای با این نشانی در ویترین نیست.</p>';
    drawCompare();
  }
  function drawCompare() {
    const box = $('#cmp', root);
    const its = stock.filter((it) => St.compare.has(it.id));
    if (its.length < 2) return (box.innerHTML = its.length ? '<p class="small sl-cmp-hint">یک قطعه‌ی دیگر را هم برای مقایسه علامت بزنید.</p>' : '');
    const rows = S.compare(its, p750, { vatPct });
    box.innerHTML = String(html`<div class="sl-cmp"><h3 class="sl-h">کنار هم</h3><div class="tbl-wrap"><table class="table-plain"><thead><tr><th></th>${rows.map((r) => html`<th>${r.item.title}<small>${fa(r.item.code)}</small></th>`)}</tr></thead><tbody>
      <tr><th>وزن</th>${rows.map((r) => html`<td>${G(r.weight)}</td>`)}</tr>
      <tr><th>عیار</th>${rows.map((r) => html`<td>${fa(r.fineness)}</td>`)}</tr>
      <tr><th>ارزش طلا</th>${rows.map((r) => html`<td>${TU(r.gold)}</td>`)}</tr>
      <tr><th>اجرت و سود</th>${rows.map((r) => html`<td>${TU(r.making)}</td>`)}</tr>
      <tr><th>مالیات</th>${rows.map((r) => html`<td>${TU(r.vat)}</td>`)}</tr>
      <tr class="sl-cmp-tot"><th>جمع</th>${rows.map((r) => html`<td><b>${TU(r.total)}</b>${r.overMin ? html`<small>+${TU(r.overMin)}</small>` : html`<small>ارزان‌ترین</small>`}</td>`)}</tr>
      <tr><th></th>${rows.map((r) => html`<td><button class="chip" data-add="${r.item.id}">به سبد</button></td>`)}</tr>
    </tbody></table></div></div>`);
  }

  /* ---------------- the cart ---------------- */
  function drawLines() {
    const c = calc();
    $('#ccount', root).textContent = St.cart.lines.length ? `${fa(St.cart.lines.length)} قطعه` : '';
    $('#lines', root).innerHTML = St.cart.lines.length
      ? String(html`${St.cart.lines.map((l, i) => {
          const r = c.t?.lines?.[i];
          return html`<div class="sl-line">
            <div class="sl-line-h"><b>${l.title}</b><span class="small">${G(l.weight)} گرم · عیار ${fa(l.fineness)}${l.code ? html` · ${fa(l.code)}` : ''}</span><button class="chip" data-del="${i}" aria-label="برداشتن ${l.title}">✕</button></div>
            <div class="sl-line-f">
              <label class="field xs">اجرت ${l.ojratMode === 'pct' ? '٪' : `(${unitName()})`}<input class="input ltr" data-l="${i}" data-k="ojrat" value="${l.ojratMode === 'pct' ? l.ojrat : disp(l.ojrat)}" inputmode="decimal" ${canPrice ? '' : 'readonly'}></label>
              <label class="field xs">سود ٪<input class="input ltr" data-l="${i}" data-k="profitPct" value="${l.profitPct}" inputmode="decimal" ${canPrice ? '' : 'readonly'}></label>
              <label class="field xs">تخفیف (${unitName()})<input class="input ltr" data-l="${i}" data-k="discount" value="${l.discount ? disp(l.discount) : ''}" inputmode="decimal" ${canDiscount ? '' : 'readonly'}></label>
            </div>
            ${r ? html`<div class="sl-line-b"><span>طلا ${TU(r.principal)}</span><span>اجرت و سود ${TU(r.consfee + r.spro + r.bros)}</span><span>مالیات ${TU(r.vat)}</span><b>${TU(r.total)}</b></div>` : ''}
          </div>`;
        })}`)
      : '<p class="small sl-empty">سبد خالی است. از ویترین یک ضرب، یا بارکد را بزنید.</p>';
  }
  function drawTins() {
    const c = calc();
    const ins = c.t?.lines?.filter((l) => l.side === 'in') ?? [];
    $('#tins', root).innerHTML = St.cart.tradeIns.length
      ? String(html`${St.cart.tradeIns.map((t, i) => html`<div class="sl-line in"><div class="sl-line-h"><b>${t.title}</b><span class="small">${G(B.num(t.weight) - B.num(t.stoneWeight || 0))} گرم · عیار ${fa(t.fineness)}${B.num(t.deductPct) ? html` · کسر ${fa(t.deductPct)}٪` : ''}</span><button class="chip" data-tdel="${i}" aria-label="برداشتن معاوضه">✕</button></div>${ins[i] ? html`<div class="sl-line-b"><span>معاوضه</span><b>− ${TU(ins[i].total)}</b></div>` : ''}</div>`)}`)
      : '';
  }
  function drawWhat() {
    const box = $('#what', root);
    if (!St.cart.lines.length) return (box.innerHTML = '<p class="small">با اولین قطعه، سناریوها اینجا می‌آیند.</p>');
    let list;
    try {
      list = S.scenarios(St.cart, { vatPct, canDiscount });
    } catch {
      return (box.innerHTML = '');
    }
    box.innerHTML = String(html`${list.map((s) => html`<div class="sl-sc ${s.possible ? '' : 'off'} ${St.preview === s.id ? 'on' : ''}">
      <button class="sl-sc-b" data-sc="${s.id}" ${s.possible ? '' : 'disabled'}><b>${s.label}</b>${s.possible ? html`<span>${TU(s.net)}</span><em class="${s.delta < 0 ? 'down' : 'up'}">${s.delta < 0 ? '−' : '+'}${TU(Math.abs(s.delta))}</em>` : html`<span class="small">${s.note}</span>`}</button>
      ${s.possible && St.preview === s.id ? html`<div class="sl-sc-x">${s.note ? html`<p class="small">${s.note}</p>` : ''}${s.info ? '' : s.needsManager ? html`<p class="small warn">تخفیف دادن برای فروشنده بسته است؛ مدیر اعمال کند.</p>` : html`<button class="btn small" data-apply="${s.id}">اعمال</button>`}</div>` : ''}
    </div>`)}`);
    box._list = list;
  }
  function drawBudget() {
    const out = $('#budr', root);
    const v = toman(St.budget) * 10;
    if (!St.cart.lines.length || !(v > 0)) return (out.innerHTML = '');
    let b;
    try {
      b = S.budget(St.cart, Math.round(v), { vatPct, canDiscount });
    } catch {
      return (out.innerHTML = '');
    }
    if (!b) return (out.innerHTML = '');
    if (b.possible)
      out.innerHTML = String(html`<p>${b.delta ? html`با ${TU(-b.delta)} تخفیف از اجرت و سود، جمع می‌شود <b>${TU(b.net)}</b>${b.exact === false ? ' (نزدیک‌ترین رقم ممکن)' : ''}.` : b.note}</p>${b.delta && !b.needsManager ? html`<button class="btn small" data-act="budget-apply">اعمال</button>` : b.needsManager ? html`<p class="warn">برای این تخفیف، مدیر لازم است.</p>` : ''}`);
    else out.innerHTML = String(html`<p>${b.note} کمترین رقم ممکن: <b>${TU(b.floor)}</b> (${TU(b.gap)} بیشتر از بودجه).</p>`);
  }
  function drawSugg() {
    const box = $('#sugg', root);
    if (!St.cart.lines.length) return (box.innerHTML = '<p class="small">با اولین قطعه، مکمل و جایگزین از ویترین پیشنهاد می‌شود.</p>');
    const s = S.suggest(stock, St.cart.lines, { p750, vatPct, favorites: favorites(), limit: 3 });
    const card = (x) => html`<button class="sl-sg" data-add="${x.item.id}"><b>${x.item.title}</b><span>${G(x.item.weight)} گرم · ${TU(x.price)}</span><em>${x.reason}</em></button>`;
    box.innerHTML = String(html`${s.complement.length ? html`<h3 class="sl-h3">مکمل</h3>${s.complement.map(card)}` : ''}${s.alternative.length ? html`<h3 class="sl-h3">جایگزین</h3>${s.alternative.map(card)}` : ''}${!s.complement.length && !s.alternative.length ? html`<p class="small">پیشنهادی در ویترین نیست.</p>` : ''}`);
  }
  function drawPays() {
    $('#pays', root).innerHTML = String(html`${St.cart.payments.map((p, i) => html`<div class="sl-pay"><span>${B.payMethod(p.method)?.label}${p.dir === 'out' ? ' (پرداخت به مشتری)' : ''}</span><input class="input ltr" data-p="${i}" value="${p.amount ? disp(p.amount) : ''}" inputmode="decimal" aria-label="مبلغ ${B.payMethod(p.method)?.label}">${p.ref ? html`<small>پیگیری ${fa(p.ref)}</small>` : ''}<button class="chip" data-pdel="${i}" aria-label="برداشتن پرداخت">✕</button></div>`)}`);
    drawTotals();
  }
  // the amount to pay that changed snaps into place (spec 0039); redraws of the same moment keep the snap
  let shownNet = null;
  let netAt = -1e9;
  function drawTotals() {
    const c = calc();
    const t = c.t;
    if (t && shownNet !== null && t.net !== shownNet) netAt = performance.now();
    shownNet = t ? t.net : null;
    const snap = performance.now() - netAt < 50 ? ' snap' : '';
    $('#tot', root).innerHTML = c.error
      ? String(html`<p class="err">${c.error}</p>`)
      : t
        ? String(html`<div class="sl-tot-row"><span>جمع کالا</span><b>${TU(t.sales)}</b></div>${t.tradeIn ? html`<div class="sl-tot-row"><span>معاوضه</span><b>− ${TU(t.tradeIn)}</b></div>` : ''}
          <div class="sl-tot-row big${snap}"><span>${t.net < 0 ? 'مغازه می‌پردازد' : 'قابل پرداخت'}</span><b>${TU(Math.abs(t.net))}</b></div>
          ${t.paidIn || t.paidOut ? html`<div class="sl-tot-row"><span>پرداخت‌شده</span><b>${TU(t.paidIn - t.paidOut)}</b></div>` : ''}
          ${t.credit ? html`<div class="sl-tot-row ${St.party ? '' : 'warn'}"><span>${t.credit > 0 ? 'مانده (نسیه)' : 'مانده به نفع مشتری'}</span><b>${TU(Math.abs(t.credit))}</b></div>${!St.party && t.credit ? html`<p class="small warn">برای نسیه، مشتری را انتخاب کنید.</p>` : ''}` : ''}`)
        : '';
  }
  function broadcast() {
    if (!ch) return;
    const c = calc();
    // after a sale the customer keeps seeing the thank-you until the next piece goes into the cart
    if (!c.t || !St.cart.lines.length) return ch.postMessage(St.done?.msg ?? { type: 'idle', shop, p750, money: prefs.money });
    ch.postMessage({ type: 'cart', shop, money: prefs.money, party: St.party?.name ?? '', view: S.customerView(St.cart, c.t, { shop }) });
  }
  function changed() {
    drawLines();
    drawTins();
    drawWhat();
    drawBudget();
    drawPays();
    drawSugg();
    keep();
    broadcast();
  }
  function addItem(id) {
    const it = stock.find((x) => x.id === id);
    if (!it) return;
    if (St.cart.lines.some((l) => l.itemId === id)) return toast('این قطعه در سبد هست.', 'error');
    St.cart.lines.push(S.lineFromItem(it, p750));
    St.compare.delete(id);
    St.done = null;
    $('#done', root).innerHTML = '';
    drawShelf();
    changed();
    toast(`${it.title} · ${G(it.weight)} گرم به سبد آمد.`, 'ok');
  }
  async function addByCode(code) {
    const c = B.digitsOnly(code) || code.trim();
    const local = stock.find((x) => x.code === c);
    if (local) return addItem(local.id);
    try {
      const it = await api(`/api/books/items/code/${encodeURIComponent(c)}`);
      if (it.status !== 'stock') return toast(it.status === 'reserved' ? 'این قطعه برای مشتری دیگری رزرو است.' : 'این قطعه فروخته شده است.', 'error');
      stock.push(it);
      addItem(it.id);
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  /* ---------------- booking ---------------- */
  const remaining = () => {
    const t = calc().t;
    return t ? t.net - (t.paidIn - t.paidOut) : 0;
  };
  function bodyOf(type) {
    const doc = S.docOf(St.cart);
    return { type, date: today(), partyId: St.party?.id ?? null, lines: doc.lines, payments: type === 'proforma' ? [] : St.cart.payments.map((p) => ({ ...p })), status: 'final' };
  }
  async function book(btn) {
    if (!St.cart.lines.length) return toast('سبد خالی است.', 'error');
    const c = calc();
    if (c.error) return toast(c.error, 'error');
    if (c.t.credit && !St.party) return toast('برای مانده یا نسیه، مشتری را انتخاب کنید.', 'error');
    busy(btn, true);
    try {
      // کارتخوان (spec 0035): each open card row is charged first, at the engine's exact rial; booked only when approved
      const pc = posConfig();
      if (posMode(pc)) {
        for (const [i, p] of St.cart.payments.entries()) {
          if (p.method !== 'pos' || p.ref) continue;
          const bad = posMode(pc) === 'local' ? posProblem(pc) : '';
          if (bad) return toast(bad, 'error');
          const j = await cardWindow(pc, c.t.payments[i].value);
          if (!j) return;
          Object.assign(St.cart.payments[i], { ref: j.rrn, ...(j.card ? { card: j.card } : {}) });
          drawPays();
          keep();
        }
      }
      const r = await submit({ url: '/api/books/docs', body: bodyOf('sale'), label: 'فاکتور فروش (میز فروش)' });
      if (r.queued) {
        toast('اتصال برقرار نیست؛ فروش روی همین دستگاه در صف ماند و خودکار ثبت می‌شود.', 'info');
        return reset();
      }
      finish(r.doc, c.t);
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      busy(btn, false);
    }
  }
  function finish(doc, t) {
    const view = S.customerView(St.cart, t, { shop });
    const text = S.shareText(doc, view, { shop, money: (rial) => TU(rial) });
    St.done = { doc, text, msg: { type: 'done', shop, p750, money: prefs.money, track: doc.track ?? '', view } };
    ch?.postMessage(St.done.msg);
    $('#done', root).innerHTML = String(html`<div class="sl-done" role="status"><b>فروش ثبت شد ✓</b><span>${doc.track ? html`فاکتور ${doc.track}` : ''}${doc.verify ? html` · کد اصالت <b class="ltr-num">${doc.verify}</b>` : ''}</span>
      <div class="sl-act2"><button class="btn small" data-act="share">ارسال برای مشتری</button><a class="btn small ghost" href="/books/doc/${doc.id}" data-link>فاکتور کامل و چاپ</a></div></div>`);
    stock = stock.filter((it) => !St.cart.lines.some((l) => l.itemId === it.id));
    reset({ keepDone: true });
  }
  function reset({ keepDone = false } = {}) {
    St.cart = { lines: [], tradeIns: [], payments: [] };
    St.party = null;
    St.file = null;
    St.preview = null;
    St.budget = '';
    $('#bud', root).value = '';
    if (!keepDone) {
      St.done = null;
      $('#done', root).innerHTML = '';
    }
    drafts.set('sell', null).catch(() => {});
    drawWho();
    drawFile();
    drawShelf();
    changed();
  }
  async function reserve(btn) {
    if (!St.cart.lines.length) return toast('سبد خالی است.', 'error');
    if (!St.party) return toast('رزرو برای یک مشتری است؛ مشتری را انتخاب کنید.', 'error');
    busy(btn, true);
    try {
      const doc = await api('/api/books/docs', { method: 'POST', body: bodyOf('proforma') });
      St.done = null; // a reservation has no receipt to share; the customer screen goes back to the welcome
      $('#done', root).innerHTML = String(html`<div class="sl-done" role="status"><b>رزرو شد ✓</b><span>پیش‌فاکتور ${doc.track} برای ${St.party.name}؛ قطعه‌ها تا ثبت فروش یا ابطال کنار گذاشته شدند.</span><div class="sl-act2"><a class="btn small ghost" href="/books/doc/${doc.id}" data-link>پیش‌فاکتور</a></div></div>`);
      stock = stock.filter((it) => !St.cart.lines.some((l) => l.itemId === it.id));
      reset({ keepDone: true });
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      busy(btn, false);
    }
  }

  /* ---------------- events ---------------- */
  root.addEventListener('click', async (e) => {
    const t = e.target.closest('button, a, input[type=checkbox]');
    if (!t) return;
    if (t.matches('[data-screen]')) {
      e.preventDefault();
      window.open('/books/sell/screen', 'beatris-screen', 'popup,width=1280,height=800');
      setTimeout(broadcast, 900);
      return;
    }
    if (t.dataset.add) return addItem(t.dataset.add);
    if (t.dataset.group !== undefined && t.matches('[data-group]')) {
      St.group = t.dataset.group;
      return drawShelf();
    }
    if (t.dataset.cmp) {
      if (t.checked) {
        if (St.compare.size >= 4) {
          t.checked = false;
          return toast('تا چهار قطعه کنار هم.', 'error');
        }
        St.compare.add(t.dataset.cmp);
      } else St.compare.delete(t.dataset.cmp);
      t.closest('.sl-item')?.classList.toggle('cmp', t.checked);
      return drawCompare();
    }
    if (t.dataset.pick) {
      const p = $('#pdrop', root)?._items?.find((x) => x.id === t.dataset.pick);
      if (p) await pickParty(p);
      return;
    }
    if (t.dataset.del !== undefined) {
      St.cart.lines.splice(Number(t.dataset.del), 1);
      drawShelf();
      return changed();
    }
    if (t.dataset.tdel !== undefined) {
      St.cart.tradeIns.splice(Number(t.dataset.tdel), 1);
      return changed();
    }
    if (t.dataset.pdel !== undefined) {
      St.cart.payments.splice(Number(t.dataset.pdel), 1);
      return changed();
    }
    if (t.dataset.pay) {
      const left = remaining();
      St.cart.payments.push({ method: t.dataset.pay, dir: left < 0 ? 'out' : 'in', amount: Math.max(0, Math.abs(left)) / 10 });
      changed();
      $$('[data-p]', root).at(-1)?.select();
      return;
    }
    if (t.dataset.sc) {
      St.preview = St.preview === t.dataset.sc ? null : t.dataset.sc;
      return drawWhat();
    }
    if (t.dataset.apply) {
      const s = $('#what', root)._list?.find((x) => x.id === t.dataset.apply);
      if (!s?.lines) return;
      St.cart.lines = s.lines;
      St.preview = null;
      toast(`«${s.label}» اعمال شد.`, 'ok');
      return changed();
    }
    const act = t.dataset.act;
    if (act === 'party-clear') {
      St.party = null;
      St.file = null;
      drawWho();
      drawFile();
      drawSugg();
      changed();
      $('#pq', root)?.focus();
    } else if (act === 'tin-add') {
      const f = Object.fromEntries($$('[data-t]', root).map((x) => [x.dataset.t, x.value.trim()]));
      const tin = { title: f.title || 'طلای کهنه', weight: B.num(f.weight), stoneWeight: B.num(f.stoneWeight || 0) || 0, fineness: B.num(f.fineness || 740), p750: toman(f.p750), deductPct: B.num(f.deductPct || 0) || 0 };
      try {
        B.calcLine({ ...tin, kind: 'used', side: 'in' }, { vatPct });
      } catch (err) {
        return toast(err.message, 'error');
      }
      St.cart.tradeIns.push(tin);
      $('[data-t=weight]', root).value = '';
      $('#tin', root).open = false;
      changed();
    } else if (act === 'sell') book(t);
    else if (act === 'reserve') reserve(t);
    else if (act === 'clear') reset();
    else if (act === 'budget-apply') {
      const b = S.budget(St.cart, Math.round(toman(St.budget) * 10), { vatPct, canDiscount });
      if (b?.possible && b.lines) {
        St.cart.lines = b.lines;
        changed();
      }
    } else if (act === 'refresh') {
      const me = await api('/api/me').catch(() => null);
      if (me?.pricing?.p750) {
        p750 = me.pricing.p750;
        St.cart.lines = St.cart.lines.map((l) => ({ ...l, p750 }));
        drawLive();
        drawShelf();
        changed();
        toast('قیمت روز تازه شد.', 'ok');
      }
    } else if (act === 'share' && St.done) {
      try {
        if (navigator.share) await navigator.share({ text: St.done.text });
        else {
          await navigator.clipboard.writeText(St.done.text);
          toast('متن فاکتور کپی شد؛ در پیام‌رسان بچسبانید.', 'ok');
        }
      } catch {
        /* the person closed the share sheet */
      }
    }
  });
  root.addEventListener('submit', async (e) => {
    if (e.target.id !== 'np') return;
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    try {
      const p = await api('/api/books/parties', { method: 'POST', body: { name: f.name, mobile: f.mobile } });
      await pickParty(p.party ?? p);
      toast(`${f.name} ثبت شد.`, 'ok');
    } catch (err) {
      toast(err.message, 'error');
    }
  });
  root.addEventListener('input', (e) => {
    const t = e.target;
    if (t.id === 'iq') {
      St.q = t.value;
      return drawShelf();
    }
    if (t.id === 'pq') {
      clearTimeout(pqTimer);
      pqTimer = setTimeout(() => findParty(t.value), 180);
      return;
    }
    if (t.id === 'bud') {
      St.budget = t.value;
      drawBudget();
      return;
    }
    if (t.dataset.l !== undefined) {
      const l = St.cart.lines[Number(t.dataset.l)];
      const k = t.dataset.k;
      l[k] = k === 'discount' || (k === 'ojrat' && l.ojratMode !== 'pct') ? toman(t.value) : B.num(t.value);
      drawWhat();
      drawBudget();
      drawTotals();
      keep();
      broadcast();
      return;
    }
    if (t.dataset.p !== undefined) {
      // a payment being typed redraws the totals only, never the field under the cursor
      St.cart.payments[Number(t.dataset.p)].amount = toman(t.value);
      drawTotals();
      keep();
      broadcast();
    }
  });
  root.addEventListener('change', (e) => {
    if (e.target.dataset.l !== undefined) drawLines();
  });
  root.addEventListener('keydown', (e) => {
    if (e.target.id === 'iq' && e.key === 'Enter') {
      e.preventDefault();
      const q = e.target.value.trim();
      const list = shown();
      if (list.length === 1) addItem(list[0].id);
      else if (q) addByCode(q);
      e.target.value = '';
      St.q = '';
      drawShelf();
    }
  });
  const keys = (e) => {
    if (e.key === 'F2') {
      e.preventDefault();
      $('#iq', root)?.focus();
    } else if (e.key === 'F3') {
      e.preventDefault();
      $('#pq', root)?.focus();
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      book($('[data-act=sell]', root));
    }
  };
  document.addEventListener('keydown', keys);
  // the customer's screen asks for the cart when it opens
  if (ch) ch.onmessage = (m) => m.data?.type === 'ask' && broadcast();

  drawLive();
  drawWho();
  if (St.party) St.file = await api(`/api/books/parties/${St.party.id}/profile`).catch(() => null);
  drawFile();
  drawShelf();
  changed();
  $('#iq', root).focus();
  return () => {
    document.removeEventListener('keydown', keys);
    ch?.postMessage({ type: 'idle', shop, p750, money: prefs.money });
    ch?.close();
  };
}
