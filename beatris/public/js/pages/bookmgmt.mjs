// Shop books management: customers and their statements, stock and labels, cash/bank/cheques, reports, settings.
import { html, raw, fa, api, store, toast, navigate, actions, $, $$, busy } from '../core.mjs';
import * as B from '../books.mjs';
import { COIN_TYPES } from '../coins.mjs';
import { barcodeSvg } from '../barcode.mjs';
import { T, TU, G, jd, jdInput, parseDay, today, addDays, modal, confirmBox, exportButtons, wireExport, download, balText, balClass, unitAmt } from '../bk.mjs';
import { booksNav } from './books.mjs';

/* ---------------- customers ---------------- */
const partyForm = (p = {}) => html`<form class="form" id="pf">
  <div class="seg" role="radiogroup"><label class="segopt"><input type="radio" name="kind" value="person" ${p.kind !== 'company' ? 'checked' : ''}><span>حقیقی</span></label><label class="segopt"><input type="radio" name="kind" value="company" ${p.kind === 'company' ? 'checked' : ''}><span>حقوقی</span></label></div>
  <label class="field">نام<input class="input" name="name" value="${p.name ?? ''}" required maxlength="120"></label>
  <div class="form cols"><label class="field">موبایل<input class="input ltr" name="mobile" value="${p.mobile ?? ''}" inputmode="tel"></label><label class="field">تلفن<input class="input ltr" name="phone" value="${p.phone ?? ''}"></label></div>
  <div class="form cols"><label class="field">کد ملی / شناسه ملی<input class="input ltr" name="nid" value="${p.nid ?? ''}" inputmode="numeric"></label><label class="field">شماره اقتصادی<input class="input ltr" name="eco" value="${p.eco ?? ''}" inputmode="numeric"></label></div>
  <div class="form cols"><label class="field">کد پستی<input class="input ltr" name="postal" value="${p.postal ?? ''}" inputmode="numeric"></label><label class="field">تاریخ تولد<input class="input ltr" name="birth" value="${jdInput(p.birth)}" placeholder="۱۳۷۰/۰۱/۰۱"></label></div>
  <label class="field">نشانی<input class="input" name="address" value="${p.address ?? ''}" maxlength="300"></label>
  <div class="form cols"><label class="field">برچسب‌ها<input class="input" name="tags" value="${p.tags ?? ''}" placeholder="همکار، VIP، عمده"></label>${store.isAdmin() ? html`<label class="field">سقف اعتبار نسیه (تومان، ۰ = بی‌سقف)<input class="input ltr" name="creditLimit" value="${p.creditLimit ? p.creditLimit / 10 : ''}" inputmode="numeric"></label>` : ''}</div>
  <label class="field">یادداشت<textarea class="input" name="note" rows="2" maxlength="600">${p.note ?? ''}</textarea></label>
  <label class="segopt"><input type="checkbox" name="sms" ${p.sms !== false ? 'checked' : ''}><span>رضایت دریافت پیامک</span></label>
  <p class="err" id="pferr" role="alert"></p>
  <div class="actions"><button class="btn">ذخیره</button><button class="btn ghost" type="button" data-close>انصراف</button></div></form>`;
const readPartyForm = (f) => {
  const o = Object.fromEntries(new FormData(f));
  o.sms = f.elements.sms.checked;
  if (o.birth) o.birth = parseDay(o.birth) ?? 'x';
  return o;
};
export async function partiesPage(root) {
  let rows = [];
  root.innerHTML = String(html`${booksNav('parties')}
    <div class="bk-head"><h1>مشتریان و طرف حساب‌ها</h1><div class="actions"><button class="btn small" data-act="new">+ مشتری جدید</button>${exportButtons('ex')}</div></div>
    <input class="input" id="q" placeholder="جستجو: نام، موبایل، کد ملی، کد مشتری، برچسب" autocomplete="off">
    <div class="scrollx"><table class="table-plain bk-table" id="tbl"></table></div><p class="small" id="sum"></p>`);
  const map = {
    new: () =>
      modal(String(html`<h3 class="bk-h">مشتری جدید</h3>${partyForm()}`), (m, close) =>
        $('#pf', m).addEventListener('submit', async (e) => {
          e.preventDefault();
          try {
            const p = await api('/api/books/parties', { method: 'POST', body: readPartyForm(e.target) });
            close();
            navigate(`/books/party/${p.id}`);
          } catch (err) {
            $('#pferr', m).textContent = err.message;
          }
        }),
      ),
  };
  wireExport(map, 'ex', 'moshtarian', () => rows.map((p) => ({ ...p, irr: (p.balance.IRR ?? 0) / 10, g: p.balance.G750 ?? 0 })), [['code', 'کد'], ['name', 'نام'], ['mobile', 'موبایل'], ['nid', 'کد ملی'], ['eco', 'شماره اقتصادی'], ['postal', 'کد پستی'], ['address', 'نشانی'], [(p) => (p.birth ? jd(p.birth) : ''), 'تولد'], ['tags', 'برچسب'], ['irr', 'مانده ریالی (تومان، + بدهکار)'], ['g', 'مانده طلایی (گرم ۷۵۰)']], 'مشتریان');
  actions(root, map);
  async function load(q = '') {
    rows = (await api(`/api/books/parties${q ? `?q=${encodeURIComponent(q)}` : ''}`)).items;
    const soon = new Set(rows.filter((p) => p.birth && birthdaySoon(p.birth)).map((p) => p.id));
    $('#tbl', root).innerHTML = String(html`<thead><tr><th>کد</th><th>نام</th><th>موبایل</th><th>کد ملی</th><th>برچسب</th><th>مانده</th></tr></thead><tbody>${rows.map((p) => html`<tr><td>${fa(p.code)}</td><td><a href="/books/party/${p.id}" data-link>${p.name}</a>${soon.has(p.id) ? html` <span class="bk-st tax" title="تولد نزدیک">🎂</span>` : ''}</td><td class="ltr-num">${fa(p.mobile)}</td><td class="ltr-num">${fa(p.nid)}</td><td class="small">${p.tags}</td><td class="${balClass(p.balance)}">${balText(p.balance)}</td></tr>`)}</tbody>`);
    const debt = rows.reduce((s, p) => s + Math.max(0, p.balance.IRR ?? 0), 0), cred = rows.reduce((s, p) => s + Math.min(0, p.balance.IRR ?? 0), 0);
    $('#sum', root).textContent = fa(`${rows.length} طرف حساب · طلب از مشتریان ${T(debt)} تومان · بدهی به آن‌ها ${T(-cred)} تومان`);
  }
  let t;
  $('#q', root).addEventListener('input', (e) => {
    clearTimeout(t);
    t = setTimeout(() => load(e.target.value.trim()), 200);
  });
  await load();
}
function birthdaySoon(iso) {
  const [, m, d] = iso.split('-').map(Number);
  const now = new Date();
  for (let i = 0; i < 7; i++) {
    const x = new Date(now.getTime() + i * 86400000);
    if (x.getUTCMonth() + 1 === m && x.getUTCDate() === d) return true;
  }
  return false;
}
export async function partyPage(root, { id }) {
  const r = await api(`/api/books/parties/${id}`);
  const p = r.party;
  root.innerHTML = String(html`${booksNav('parties')}
    <div class="bk-head"><h1>${p.name} <span class="small">کد ${fa(p.code)}</span></h1>
      <div class="actions"><a class="btn small" href="/books/new/sale?party=${p.id}" data-link>فروش</a><a class="btn small ghost" href="/books/new/receipt?party=${p.id}" data-link>دریافت</a><a class="btn small ghost" href="/books/new/payment?party=${p.id}" data-link>پرداخت</a><a class="btn small ghost" href="/books/new/buy?party=${p.id}" data-link>خرید از او</a><button class="btn small ghost" data-act="edit">ویرایش</button>${store.isAdmin() ? html`<button class="btn small danger" data-act="del">حذف</button>` : ''}</div></div>
    <div class="stats bk-stats"><div><b class="${balClass(r.balance)}">${r.balance.IRR ? T(Math.abs(r.balance.IRR)) : '۰'}</b><span>${(r.balance.IRR ?? 0) > 0 ? 'بدهکار (تومان)' : (r.balance.IRR ?? 0) < 0 ? 'بستانکار (تومان)' : 'مانده ریالی'}</span></div><div><b>${r.balance.G750 ? G(Math.abs(r.balance.G750)) : '۰'}</b><span>${(r.balance.G750 ?? 0) > 0 ? 'بدهکار طلا (گرم ۷۵۰)' : (r.balance.G750 ?? 0) < 0 ? 'بستانکار طلا (گرم ۷۵۰)' : 'مانده طلایی'}</span></div><div><b>${fa(r.docs.filter((d) => d.status === 'final').length)}</b><span>سند قطعی</span></div>${p.creditLimit ? html`<div><b>${T(p.creditLimit)}</b><span>سقف اعتبار</span></div>` : ''}</div>
    <p class="small">${[p.mobile && `موبایل ${fa(p.mobile)}`, p.nid && `${p.kind === 'company' ? 'شناسه ملی' : 'کد ملی'} ${fa(p.nid)}`, p.eco && `شماره اقتصادی ${fa(p.eco)}`, p.postal && `کد پستی ${fa(p.postal)}`, p.birth && `تولد ${jd(p.birth)}`, p.address, p.tags && `برچسب: ${p.tags}`].filter(Boolean).join(' · ')}</p>
    <section class="tray bk-sec printable"><div class="bk-head"><h3 class="bk-h">صورت‌حساب (ریز حساب) ${p.name}</h3>${exportButtons('st')}</div>
      <div class="scrollx"><table class="table-plain bk-table"><thead><tr><th>تاریخ</th><th>سند</th><th>واحد</th><th>بدهکار</th><th>بستانکار</th><th>مانده</th></tr></thead><tbody>${r.statement.map((x) => html`<tr><td>${jd(x.date)}</td><td>${x.doc ? html`<a href="/books/doc/${x.doc.id}" data-link>${B.DOC_TYPES[x.doc.type].short} ${fa(x.doc.no)}</a>` : x.src.startsWith('chq:') ? 'تغییر وضعیت چک' : '—'}</td><td>${x.unit === 'IRR' ? 'تومان' : 'گرم ۷۵۰'}</td><td class="num">${x.amt > 0 ? (x.unit === 'IRR' ? T(x.amt) : G(x.amt)) : ''}</td><td class="num">${x.amt < 0 ? (x.unit === 'IRR' ? T(-x.amt) : G(-x.amt)) : ''}</td><td class="num ${x.balance > 0 ? 'debt' : x.balance < 0 ? 'cred' : ''}">${x.unit === 'IRR' ? T(x.balance) : G(x.balance)}</td></tr>`)}</tbody></table></div></section>`);
  const map = {
    edit: () =>
      modal(String(html`<h3 class="bk-h">ویرایش ${p.name}</h3>${partyForm(p)}`), (m, close) =>
        $('#pf', m).addEventListener('submit', async (e) => {
          e.preventDefault();
          try {
            await api(`/api/books/parties/${p.id}`, { method: 'PUT', body: readPartyForm(e.target) });
            close();
            navigate(location.pathname, { replace: true });
          } catch (err) {
            $('#pferr', m).textContent = err.message;
          }
        }),
      ),
    del: async () => {
      if (!(await confirmBox('حذف مشتری', 'فقط مشتری بی‌مانده حذف می‌شود؛ اسناد قبلی سر جایشان می‌مانند.', { danger: true, ok: 'حذف' }))) return;
      try {
        await api(`/api/books/parties/${p.id}`, { method: 'DELETE' });
        navigate('/books/parties');
      } catch (e) {
        toast(e.message, 'error');
      }
    },
  };
  wireExport(map, 'st', `hesab-${p.code}`, () => r.statement.map((x) => ({ date: jd(x.date), doc: x.doc ? `${B.DOC_TYPES[x.doc.type].short} ${x.doc.no}` : 'چک', unit: x.unit === 'IRR' ? 'تومان' : 'گرم ۷۵۰', debit: x.amt > 0 ? (x.unit === 'IRR' ? x.amt / 10 : x.amt) : '', credit: x.amt < 0 ? (x.unit === 'IRR' ? -x.amt / 10 : -x.amt) : '', balance: x.unit === 'IRR' ? x.balance / 10 : x.balance })), [['date', 'تاریخ'], ['doc', 'سند'], ['unit', 'واحد'], ['debit', 'بدهکار'], ['credit', 'بستانکار'], ['balance', 'مانده']], p.name);
  actions(root, map);
}

/* ---------------- stock ---------------- */
export async function stockPage(root) {
  const tpls = await api('/api/books/templates');
  const jewelTpls = tpls.items.filter((t) => t.kind === 'jewel');
  const admin = store.isAdmin();
  let rows = [];
  const sel = new Set();
  const F = { status: 'stock', q: '' };
  root.innerHTML = String(html`${booksNav('stock')}
    <div class="bk-head"><h1>انبار و ویترین</h1><div class="actions"><button class="btn small" data-act="add">+ قطعه</button><button class="btn small ghost" data-act="batch">+ چند قطعه (بارکد خودکار)</button><button class="btn small ghost" data-act="take">انبارگردانی</button>${exportButtons('ex')}</div></div>
    <form class="bk-filters" id="flt"><select class="input" name="status">${[['stock', 'موجود'], ['reserved', 'رزرو'], ['sold', 'فروخته'], ['out', 'خارج از موجودی'], ['all', 'همه']].map(([v, l]) => html`<option value="${v}">${l}</option>`)}</select><input class="input" name="q" placeholder="بارکد، شرح یا نام ویترین"><button class="btn small">نمایش</button></form>
    <div class="bk-bulk" id="bulk" hidden></div>
    <div class="scrollx"><table class="table-plain bk-table" id="tbl"></table></div><p class="small" id="sum"></p>`);
  const tplOpts = (cur) => html`${tpls.groups.filter((g) => jewelTpls.some((t) => t.group === g.id)).map((g) => html`<optgroup label="${g.label}">${jewelTpls.filter((t) => t.group === g.id).map((t) => html`<option value="${t.id}" ${cur === t.id ? 'selected' : ''}>${t.label}</option>`)}</optgroup>`)}`;
  const itemForm = (it = {}, batch = false) => html`<form class="form" id="itf">
    <label class="field">قالب<select class="input" name="tpl">${tplOpts(it.tpl ?? 'ring-w')}</select></label>
    <label class="field">شرح (اختیاری)<input class="input" name="title" value="${it.title ?? ''}" maxlength="120"></label>
    ${batch ? html`<label class="field">وزن‌ها (هر خط یا با فاصله یک قطعه؛ مثل ۵٫۲۳ ۶٫۱۰ ۴٫۸۷)<textarea class="input ltr" name="weights" rows="4" required></textarea></label>` : html`<div class="form cols"><label class="field">وزن (گرم)<input class="input ltr" name="weight" value="${it.weight ?? ''}" inputmode="decimal" required></label><label class="field">بارکد (خالی = خودکار)<input class="input ltr" name="code" value="${it.code ?? ''}" ${it.id ? 'readonly' : ''}></label></div>`}
    <div class="form cols"><label class="field">عیار<input class="input ltr" name="fineness" value="${it.fineness ?? 750}" inputmode="numeric"></label><label class="field">ویترین / کشو<input class="input" name="showcase" value="${it.showcase ?? ''}" maxlength="40"></label></div>
    <div class="form cols"><label class="field">نوع اجرت<select class="input" name="ojratMode">${[['', 'پیش‌فرض قالب'], ['pct', 'درصد'], ['gram', 'تومان هر گرم'], ['fixed', 'مبلغ ثابت']].map(([v, l]) => html`<option value="${v}" ${it.ojratMode === v && it.id ? 'selected' : ''}>${l}</option>`)}</select></label><label class="field">اجرت (خالی = پیش‌فرض قالب)<input class="input ltr" name="ojrat" value="${it.id ? it.ojrat : ''}" inputmode="decimal"></label><label class="field">سود ٪<input class="input ltr" name="profitPct" value="${it.id ? it.profitPct : ''}" inputmode="decimal"></label></div>
    <div class="form cols"><label class="field">مبلغ سنگ (تومان)<input class="input ltr" name="stones" value="${it.stones || ''}" inputmode="numeric"></label><label class="field">وزن سنگ (گرم)<input class="input ltr" name="stoneWeight" value="${it.stoneWeight || ''}" inputmode="decimal"></label><label class="field">اجرت پرداختی به سازنده (٪)<input class="input ltr" name="costOjrat" value="${it.costOjrat || ''}" inputmode="decimal"></label></div>
    <p class="err" id="iterr" role="alert"></p><div class="actions"><button class="btn">ذخیره</button><button class="btn ghost" type="button" data-close>انصراف</button></div></form>`;
  const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== ''));
  const map = {
    add: () => openItem(),
    batch: () =>
      modal(String(html`<h3 class="bk-h">ثبت چند قطعه از یک قالب</h3><p class="small">برای هر وزن یک بارکد یکتا ساخته می‌شود؛ بعد برچسب‌ها را یک‌جا چاپ کنید.</p>${itemForm({}, true)}`), (m, close) =>
        $('#itf', m).addEventListener('submit', async (e) => {
          e.preventDefault();
          const o = clean(Object.fromEntries(new FormData(e.target)));
          const weights = String(o.weights).split(/[\s,،]+/).map((w) => B.num(w)).filter((w) => w > 0);
          delete o.weights;
          if (!weights.length) return ($('#iterr', m).textContent = 'دست‌کم یک وزن معتبر بنویسید.');
          try {
            const r = await api('/api/books/items', { method: 'POST', body: { ...o, batch: weights } });
            close();
            toast(`${fa(r.items.length)} قطعه ثبت شد.`, 'ok');
            await load();
            r.items.forEach((i) => sel.add(i.id));
            draw();
          } catch (err) {
            $('#iterr', m).textContent = err.message;
          }
        }),
      ),
    take: () => stocktake(),
  };
  function openItem(it) {
    modal(String(html`<h3 class="bk-h">${it ? `ویرایش ${fa(it.code)}` : 'قطعه جدید'}</h3>${itemForm(it)}`), (m, close) =>
      $('#itf', m).addEventListener('submit', async (e) => {
        e.preventDefault();
        const o = clean(Object.fromEntries(new FormData(e.target)));
        try {
          if (it) await api(`/api/books/items/${it.id}`, { method: 'PUT', body: o });
          else await api('/api/books/items', { method: 'POST', body: o });
          close();
          await load();
        } catch (err) {
          $('#iterr', m).textContent = err.message;
        }
      }),
    );
  }
  wireExport(map, 'ex', 'anbar', () => (sel.size ? rows.filter((r) => sel.has(r.id)) : rows), [['code', 'بارکد'], ['title', 'شرح'], ['weight', 'وزن'], ['fineness', 'عیار'], ['ojrat', 'اجرت'], ['ojratMode', 'نوع اجرت'], ['profitPct', 'سود ٪'], [(r) => r.stones, 'سنگ (تومان)'], ['showcase', 'ویترین'], ['status', 'وضعیت']], 'انبار');
  actions(root, map);
  async function load() {
    rows = (await api(`/api/books/items?status=${F.status}&q=${encodeURIComponent(F.q)}`)).items;
    for (const id of [...sel]) if (!rows.some((r) => r.id === id)) sel.delete(id);
    draw();
  }
  function draw() {
    const ST = { stock: 'موجود', reserved: 'رزرو', sold: 'فروخته', out: 'خارج' };
    $('#tbl', root).innerHTML = String(html`<thead><tr><th><input type="checkbox" id="all" aria-label="انتخاب همه" ${rows.length && rows.every((r) => sel.has(r.id)) ? 'checked' : ''}></th><th>بارکد</th><th>شرح</th><th>وزن</th><th>عیار</th><th>اجرت</th><th>سود</th><th>ویترین</th><th>وضعیت</th><th></th></tr></thead><tbody>${rows.map((r) => html`<tr><td><input type="checkbox" data-row="${r.id}" ${sel.has(r.id) ? 'checked' : ''} aria-label="انتخاب"></td><td class="ltr-num">${fa(r.code)}</td><td>${r.title}</td><td class="num">${G(r.weight)}</td><td class="num">${fa(r.fineness)}</td><td class="num">${fa(r.ojrat)}${r.ojratMode === 'pct' ? '٪' : r.ojratMode === 'gram' ? ' ت/گ' : ' ت'}</td><td class="num">${fa(r.profitPct)}٪</td><td>${r.showcase}</td><td>${ST[r.status]}${r.soldDoc && r.status === 'sold' ? html` <a href="/books/doc/${r.soldDoc}" data-link>فاکتور</a>` : ''}</td><td>${r.status !== 'sold' ? html`<button class="chip" data-edit="${r.id}">ویرایش</button>` : ''}</td></tr>`)}</tbody>`);
    const w = rows.reduce((s, r) => s + r.weight, 0), w750 = rows.reduce((s, r) => s + (r.weight * r.fineness) / 750, 0);
    $('#sum', root).textContent = fa(`${rows.length} قطعه · ${G(w)} گرم (معادل ${G(w750)} گرم ۷۵۰) · ارزش طلای خام به قیمت روز ${T(B.rnd(w750 * store.me.pricing.p750 * 10))} تومان`);
    const bar = $('#bulk', root);
    bar.hidden = !sel.size;
    bar.innerHTML = String(html`<b>${fa(sel.size)} قطعه</b><button class="chip" data-bulk="labels">چاپ برچسب</button>${admin ? html`<button class="chip" data-bulk="edit">ویرایش گروهی</button><button class="chip danger" data-bulk="delete">حذف</button>` : ''}`);
  }
  function labels() {
    const items = rows.filter((r) => sel.has(r.id));
    const shop = store.me.brand?.shopName ?? '';
    modal(String(html`<h3 class="bk-h">برچسب ${fa(items.length)} قطعه</h3><p class="small">اندازه برچسب ۵۰×۳۰ میلی‌متر؛ چاپ با چاپگر برچسب یا کاغذ A4.</p><div class="actions"><button class="btn" data-print-labels>چاپ</button><button class="btn ghost" data-close>بستن</button></div><div class="bk-labels printable">${items.map((i) => html`<div class="bk-label"><b>${shop}</b><span>${i.title}</span>${raw(barcodeSvg(i.code, { module: 1, height: 34 }))}<span>${G(i.weight)} گرم · عیار ${fa(i.fineness)} · اجرت ${fa(i.ojrat)}${i.ojratMode === 'pct' ? '٪' : ''}</span></div>`)}</div>`), (m) =>
      m.querySelector('[data-print-labels]').addEventListener('click', () => {
        document.body.classList.add('print-labels');
        window.print();
        setTimeout(() => document.body.classList.remove('print-labels'), 500);
      }),
    );
  }
  function bulkEdit() {
    const ids = [...sel];
    modal(String(html`<h3 class="bk-h">ویرایش گروهی ${fa(ids.length)} قطعه</h3><p class="small">فقط فیلدهای پرشده عوض می‌شوند.</p><form class="form" id="bf"><label class="field">قالب<select class="input" name="tpl"><option value="">— بدون تغییر —</option>${tplOpts('')}</select></label><div class="form cols"><label class="field">نوع اجرت<select class="input" name="ojratMode"><option value="">— بدون تغییر —</option><option value="pct">درصد</option><option value="gram">تومان هر گرم</option><option value="fixed">ثابت</option></select></label><label class="field">اجرت<input class="input ltr" name="ojrat" inputmode="decimal"></label><label class="field">سود ٪<input class="input ltr" name="profitPct" inputmode="decimal"></label></div><div class="form cols"><label class="field">ویترین<input class="input" name="showcase"></label><label class="field">وضعیت<select class="input" name="status"><option value="">— بدون تغییر —</option><option value="stock">موجود</option><option value="reserved">رزرو</option><option value="out">خارج از موجودی</option></select></label></div><p class="err" id="bferr"></p><div class="actions"><button class="btn">اعمال</button><button class="btn ghost" type="button" data-close>انصراف</button></div></form>`), (m, close) =>
      $('#bf', m).addEventListener('submit', async (e) => {
        e.preventDefault();
        const set = clean(Object.fromEntries(new FormData(e.target)));
        try {
          const r = await api('/api/books/items/bulk', { method: 'POST', body: { ids, set } });
          close();
          toast(`${fa(r.changed)} قطعه به‌روز شد.`, 'ok');
          await load();
        } catch (err) {
          $('#bferr', m).textContent = err.message;
        }
      }),
    );
  }
  function stocktake() {
    const codes = [];
    modal(String(html`<h3 class="bk-h">انبارگردانی</h3><p class="small">بارکد قطعه‌ها را پشت سر هم اسکن کنید؛ در پایان «مقایسه» بزنید.</p><div class="form cols"><label class="field">ویترین (خالی = کل فروشگاه)<input class="input" id="tsc"></label><label class="field">بارکد<input class="input ltr" id="tcode" autocomplete="off"></label></div><p class="small" id="tcount">۰ اسکن</p><div class="actions"><button class="btn" data-cmp>مقایسه</button><button class="btn ghost" data-close>بستن</button></div><div id="tres"></div>`), (m) => {
      $('#tcode', m).addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const c = e.target.value.trim();
        if (c && !codes.includes(c)) codes.push(c);
        e.target.value = '';
        $('#tcount', m).textContent = fa(`${codes.length} اسکن`);
      });
      m.querySelector('[data-cmp]').addEventListener('click', async () => {
        try {
          const r = await api('/api/books/stocktake', { method: 'POST', body: { codes, showcase: $('#tsc', m).value.trim() } });
          $('#tres', m).innerHTML = String(html`<div class="stats"><div><b>${fa(r.found)}/${fa(r.expected)}</b><span>قطعه پیدا شد</span></div><div><b>${G(r.weightFound)}</b><span>از ${G(r.weightExpected)} گرم</span></div></div>
            ${r.missing.length ? html`<h4>کسری (در سیستم هست، اسکن نشد)</h4><ul>${r.missing.map((i) => html`<li>${fa(i.code)} · ${i.title} · ${G(i.weight)} گرم · ${i.showcase}</li>`)}</ul>` : html`<p class="notice ok">کسری ندارد.</p>`}
            ${r.extra.length ? html`<h4>مازاد (اسکن شد، در این ویترین نیست)</h4><ul>${r.extra.map((x) => html`<li>${fa(x.code)} ${x.item ? `· ${x.item.title} · ${x.item.status === 'sold' ? 'فروخته‌شده!' : x.item.showcase}` : '· در سیستم ثبت نیست'}</li>`)}</ul>` : ''}`);
        } catch (e) {
          toast(e.message, 'error');
        }
      });
    });
  }
  $('#flt', root).addEventListener('submit', (e) => {
    e.preventDefault();
    Object.assign(F, Object.fromEntries(new FormData(e.target)));
    load();
  });
  root.addEventListener('change', (e) => {
    if (e.target.id === 'all') (rows.forEach((r) => (e.target.checked ? sel.add(r.id) : sel.delete(r.id))), draw());
    else if (e.target.dataset.row) {
      if (e.target.checked) sel.add(e.target.dataset.row);
      else sel.delete(e.target.dataset.row);
      draw();
    }
  });
  root.addEventListener('click', async (e) => {
    const ed = e.target.closest('[data-edit]');
    if (ed) return openItem(rows.find((r) => r.id === ed.dataset.edit));
    const b = e.target.closest('[data-bulk]');
    if (!b) return;
    if (b.dataset.bulk === 'labels') labels();
    else if (b.dataset.bulk === 'edit') bulkEdit();
    else if (b.dataset.bulk === 'delete') {
      if (!(await confirmBox(`حذف ${fa(sel.size)} قطعه`, 'فقط قطعه‌ای که در هیچ سندی نیامده حذف می‌شود.', { danger: true, ok: 'حذف' }))) return;
      try {
        await api('/api/books/items/bulk', { method: 'POST', body: { ids: [...sel], delete: true } });
        sel.clear();
        await load();
      } catch (err) {
        toast(err.message, 'error');
      }
    }
  });
  await load();
}

/* ---------------- cash, banks, cheques ---------------- */
export async function cashPage(root) {
  const admin = store.isAdmin();
  const [acc, chq] = await Promise.all([api('/api/books/accounts'), api('/api/books/cheques')]);
  const NEXT = { in: { hand: ['deposited', 'cleared', 'spent', 'returned'], deposited: ['cleared', 'bounced', 'hand'], bounced: ['deposited', 'hand', 'returned'], spent: ['bounced'] }, out: { issued: ['paid', 'bounced'], bounced: ['issued', 'paid'] } };
  root.innerHTML = String(html`${booksNav('cash')}
    <div class="bk-head"><h1>صندوق، بانک و چک</h1><div class="actions"><a class="btn small ghost" href="/books/new/transfer" data-link>انتقال</a><a class="btn small ghost" href="/books/new/expense" data-link>هزینه</a>${admin ? html`<button class="btn small" data-act="acc">+ حساب</button>` : ''}</div></div>
    <div class="bk-accs">${acc.items.map((a) => html`<div class="tray bk-acc ${a.active ? '' : 'off'}"><span class="small">${a.kind === 'cash' ? 'صندوق' : a.bank || 'بانک'}</span><b>${a.title}</b><strong class="${a.balance < 0 ? 'debt' : ''}">${TU(a.balance)}</strong>${a.card || a.sheba ? html`<span class="small ltr-num">${fa(a.card)} ${a.sheba}</span>` : ''}${admin ? html`<button class="chip" data-acc="${a.id}">ویرایش</button>` : ''}</div>`)}</div>
    <section class="tray bk-sec"><div class="bk-head"><h3 class="bk-h">چک‌ها</h3>${exportButtons('cq')}</div>
      <div class="scrollx"><table class="table-plain bk-table"><thead><tr><th>نوع</th><th>طرف حساب</th><th>شماره / صیادی</th><th>بانک</th><th>سررسید</th><th>مبلغ</th><th>وضعیت</th><th></th></tr></thead><tbody>${chq.items.map((c) => html`<tr class="${['hand', 'deposited', 'issued'].includes(c.status) && c.due < today() ? 'bad' : ''}"><td>${c.dir === 'in' ? 'دریافتی' : 'پرداختی'}</td><td>${c.partyName ?? '—'}</td><td class="ltr-num">${fa(c.no)} ${fa(c.sayad)}</td><td>${c.bank}</td><td>${jd(c.due)}</td><td class="num">${T(c.amount)}</td><td>${B.CHEQUE_STATUS[c.status]}</td><td>${admin ? (NEXT[c.dir][c.status] ?? []).map((s) => html`<button class="chip" data-cq="${c.id}" data-to="${s}">${B.CHEQUE_STATUS[s]}</button>`) : ''}</td></tr>`)}</tbody></table></div></section>`);
  const map = {
    acc: () => accModal(),
  };
  wireExport(map, 'cq', 'check', () => chq.items.map((c) => ({ ...c, dir: c.dir === 'in' ? 'دریافتی' : 'پرداختی', due: jd(c.due), amount: c.amount / 10, status: B.CHEQUE_STATUS[c.status] })), [['dir', 'نوع'], ['partyName', 'طرف حساب'], ['no', 'شماره'], ['sayad', 'صیادی'], ['bank', 'بانک'], ['due', 'سررسید'], ['amount', 'مبلغ (تومان)'], ['status', 'وضعیت']], 'چک‌ها');
  actions(root, map);
  function accModal(a = null) {
    modal(String(html`<h3 class="bk-h">${a ? 'ویرایش حساب' : 'حساب جدید'}</h3><form class="form" id="af">${a ? '' : html`<div class="seg"><label class="segopt"><input type="radio" name="kind" value="bank" checked><span>بانک</span></label><label class="segopt"><input type="radio" name="kind" value="cash"><span>صندوق</span></label></div>`}<label class="field">نام<input class="input" name="title" value="${a?.title ?? ''}" required></label><div class="form cols"><label class="field">بانک<input class="input" name="bank" value="${a?.bank ?? ''}"></label><label class="field">شماره حساب<input class="input ltr" name="number" value="${a?.number ?? ''}"></label></div><div class="form cols"><label class="field">شماره کارت<input class="input ltr" name="card" value="${a?.card ?? ''}"></label><label class="field">شبا<input class="input ltr" name="sheba" value="${a?.sheba ?? ''}" placeholder="IR…"></label></div>${a ? html`<label class="segopt"><input type="checkbox" name="active" ${a.active ? 'checked' : ''}><span>فعال</span></label>` : ''}<p class="err" id="aferr"></p><div class="actions"><button class="btn">ذخیره</button><button class="btn ghost" type="button" data-close>انصراف</button></div></form>`), (m, close) =>
      $('#af', m).addEventListener('submit', async (e) => {
        e.preventDefault();
        const o = Object.fromEntries(new FormData(e.target));
        if (a) o.active = e.target.elements.active.checked;
        try {
          await api(a ? `/api/books/accounts/${a.id}` : '/api/books/accounts', { method: a ? 'PUT' : 'POST', body: o });
          close();
          navigate(location.pathname, { replace: true });
        } catch (err) {
          $('#aferr', m).textContent = err.message;
        }
      }),
    );
  }
  root.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-acc]');
    if (a) return accModal(acc.items.find((x) => x.id === a.dataset.acc));
    const b = e.target.closest('[data-cq]');
    if (!b) return;
    const to = b.dataset.to;
    const banks = acc.items.filter((x) => x.kind === 'bank' && x.active);
    const needBank = ['deposited', 'cleared', 'paid'].includes(to);
    const parties = to === 'spent' ? (await api('/api/books/parties')).items : [];
    modal(String(html`<h3 class="bk-h">چک ← ${B.CHEQUE_STATUS[to]}</h3><form class="form" id="cf">${needBank ? html`<label class="field">حساب بانکی<select class="input" name="accountId">${banks.map((x) => html`<option value="${x.id}">${x.title}</option>`)}</select></label>` : ''}${to === 'spent' ? html`<label class="field">به چه کسی داده شد؟<select class="input" name="toParty">${parties.map((p) => html`<option value="${p.id}">${p.name}</option>`)}</select></label>` : ''}<label class="field">تاریخ<input class="input ltr" name="day" value="${jdInput(today())}"></label><label class="field">یادداشت<input class="input" name="note"></label><div class="actions"><button class="btn">ثبت</button><button class="btn ghost" type="button" data-close>انصراف</button></div></form>`), (m, close) =>
      $('#cf', m).addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const o = Object.fromEntries(new FormData(ev.target));
        o.day = parseDay(o.day) ?? today();
        try {
          await api(`/api/books/cheques/${b.dataset.cq}`, { method: 'PATCH', body: { ...o, status: to } });
          close();
          navigate(location.pathname, { replace: true });
        } catch (err) {
          toast(err.message, 'error');
        }
      }),
    );
  });
}

/* ---------------- reports ---------------- */
export async function reportsPage(root) {
  const qs = new URLSearchParams(location.search);
  const tab = qs.get('tab') ?? 'balance';
  const from = parseDay(qs.get('from') ?? '') ?? addDays(today(), -30), to = parseDay(qs.get('to') ?? '') ?? today();
  const by = qs.get('by') ?? 'tpl';
  const TABS = [['balance', 'تراز دارایی و وضعیت طلا'], ['day', 'گزارش روز (بستن صندوق)'], ['vat', 'مالیات بر ارزش افزوده'], ['sales', 'تحلیل فروش']];
  root.innerHTML = String(html`${booksNav('reports')}<div class="bk-head"><h1>گزارش‌ها</h1></div>
    <nav class="tabs">${TABS.map(([k, l]) => html`<a href="/books/reports?tab=${k}" data-link ${tab === k ? raw('aria-current="page"') : ''}>${l}</a>`)}</nav><div id="rep"></div>`);
  const box = $('#rep', root);
  const map = {};
  const range = (extra = '') => html`<form class="bk-filters" id="rng"><input class="input ltr" name="from" value="${jdInput(from)}" aria-label="از"><input class="input ltr" name="to" value="${jdInput(to)}" aria-label="تا">${extra}<button class="btn small">نمایش</button></form>`;
  const wireRange = () =>
    $('#rng', box)?.addEventListener('submit', (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      const p = new URLSearchParams({ tab, from: parseDay(f.from) ?? from, to: parseDay(f.to) ?? to, ...(f.by ? { by: f.by } : {}) });
      navigate(`/books/reports?${p}`);
    });
  if (tab === 'balance') {
    const r = await api('/api/books/report/balance');
    const rows = [['نقد در صندوق‌ها', r.cash], ['موجودی بانک‌ها', r.bank], ['چک‌های دریافتی نزد صندوق/بانک', r.chequesIn], [`صندوق طلا (${G(r.goldBoxG)} گرم ۷۵۰)`, r.goldBox], [`سکه‌ها (${Object.entries(r.coins).map(([k, n]) => `${COIN_TYPES[k].short} ${fa(n)}`).join('، ') || '۰'})`, r.coinsValue], [`کالای ویترین (${G(r.stockG)} گرم ۷۵۰ + سنگ)`, r.stockValue], ['طلب ریالی از مشتریان', r.receivable], [`طلب طلایی از مشتریان (${G(r.goldReceivableG)} گرم)`, r.goldReceivable]];
    const liab = [['بدهی ریالی به مشتریان و همکاران', -r.payable], [`بدهی طلایی (${G(-r.goldPayableG)} گرم)`, -r.goldPayable], ['چک‌های پرداختی پاس‌نشده', -r.chequesOut], ['مالیات بر ارزش افزوده پرداختنی', r.vatPayable]];
    box.innerHTML = String(html`<p class="small">ارزش‌گذاری به قیمت امروز: گرم ۱۸ = ${B.fmtRial(r.p750 * 10)}؛ سکه‌ها به قیمت تابلوی بازار.</p>
      <div class="grid2"><section class="tray"><h3 class="bk-h">دارایی‌ها</h3><table class="table-plain">${rows.map(([k, v]) => html`<tr><td>${k}</td><td class="num">${T(v)}</td></tr>`)}<tr class="big"><td>جمع دارایی</td><td class="num">${T(r.assets)}</td></tr></table></section>
      <section class="tray"><h3 class="bk-h">بدهی‌ها</h3><table class="table-plain">${liab.map(([k, v]) => html`<tr><td>${k}</td><td class="num">${T(v)}</td></tr>`)}<tr class="big"><td>جمع بدهی</td><td class="num">${T(r.liabilities)}</td></tr></table></section></div>
      <div class="stats bk-stats"><div><b>${T(r.net)}</b><span>ارزش خالص (تومان)</span></div><div><b>${G(r.goldPositionG)}</b><span>موقعیت خالص طلا (گرم ۷۵۰): با هر ۱۰۰ هزار تومان تغییر گرم ۱۸، ارزش خالص ${T(B.rnd(r.goldPositionG * 1000000))} تومان جابه‌جا می‌شود</span></div></div>${exportButtons('bl')}`);
    wireExport(map, 'bl', 'taraz', () => [...rows.map(([k, v]) => ({ k, v: v / 10, side: 'دارایی' })), ...liab.map(([k, v]) => ({ k, v: v / 10, side: 'بدهی' })), { k: 'ارزش خالص', v: r.net / 10, side: '' }], [['side', 'بخش'], ['k', 'شرح'], ['v', 'تومان']], 'تراز');
  } else if (tab === 'day') {
    const day = parseDay(qs.get('day') ?? '') ?? today();
    const s = await api(`/api/books/summary?from=${day}&to=${day}`);
    const t0 = s.totals;
    const m = B.PAY_METHODS.map((x) => [x.label, t0.byMethod[`${x.id}:in`] ?? 0, t0.byMethod[`${x.id}:out`] ?? 0]).filter(([, a, b]) => a || b);
    box.innerHTML = String(html`<form class="bk-filters" id="dayf"><input class="input ltr" name="day" value="${jdInput(day)}"><button class="btn small">نمایش</button></form>
      <section class="tray printable bk-z"><h3 class="bk-h">گزارش پایان روز ${jd(day)} · ${store.me.brand?.shopName ?? ''}</h3>
      <table class="table-plain"><tr><td>فاکتور فروش</td><td class="num">${fa(t0.count.sale ?? 0)}</td></tr><tr><td>جمع فروش</td><td class="num">${TU(t0.sales)}</td></tr><tr><td>ارزش طلا / سنگ</td><td class="num">${T(t0.principal)} / ${T(t0.stones)}</td></tr><tr><td>اجرت / سود / حق‌العمل</td><td class="num">${T(t0.consfee)} / ${T(t0.spro)} / ${T(t0.bros)}</td></tr><tr><td>مالیات</td><td class="num">${TU(t0.vat)}</td></tr><tr><td>طلای تعویضی + خرید</td><td class="num">${TU(t0.tradeIn + t0.buys)}</td></tr><tr><td>برگشت از فروش</td><td class="num">${TU(t0.returns)}</td></tr><tr><td>هزینه‌ها</td><td class="num">${TU(t0.expenses)}</td></tr><tr><td>نسیه</td><td class="num">${TU(t0.credit)}</td></tr><tr><td>گرم کارساخته فروخته</td><td class="num">${G(t0.soldWeight)}</td></tr></table>
      <h4>به تفکیک روش</h4><table class="table-plain"><thead><tr><th>روش</th><th>دریافت</th><th>پرداخت</th></tr></thead>${m.map(([l, a, b]) => html`<tr><td>${l}</td><td class="num">${T(a)}</td><td class="num">${T(b)}</td></tr>`)}</table>
      <h4>گردش حساب‌ها</h4><table class="table-plain"><thead><tr><th>حساب</th><th>ورود</th><th>خروج</th><th>مانده فعلی</th></tr></thead>${s.accounts.map((a) => html`<tr><td>${a.title}</td><td class="num">${T(a.flow.in)}</td><td class="num">${T(a.flow.out)}</td><td class="num">${T(a.balance)}</td></tr>`)}</table>
      <p class="small">شمارش فیزیکی صندوق را با «مانده فعلی» صندوق مقایسه و امضا کنید. ............................</p></section><button class="btn small" data-act="p">چاپ</button>`);
    map.p = () => window.print();
    $('#dayf', box).addEventListener('submit', (e) => {
      e.preventDefault();
      navigate(`/books/reports?tab=day&day=${parseDay(new FormData(e.target).get('day')) ?? today()}`);
    });
  } else if (tab === 'vat') {
    const r = await api(`/api/books/report/vat?from=${from}&to=${to}`);
    const cols = [['month', 'ماه'], ['invoices', 'فاکتور'], ['returns', 'برگشت'], [(x) => x.principal / 10, 'اصل طلا و سنگ (معاف)'], [(x) => x.consfee / 10, 'اجرت ساخت'], [(x) => x.spro / 10, 'سود فروشنده'], [(x) => x.bros / 10, 'حق‌العمل'], [(x) => x.tcpbs / 10, 'پایه مشمول (اجرت+سود+حق‌العمل)'], [(x) => x.goodsBase / 10, 'پایه کالای غیرطلا'], [(x) => x.vat / 10, 'مالیات']];
    box.innerHTML = String(html`${range()}<p class="small">پایه مالیات طلا فقط اجرت ساخت، سود فروشنده و حق‌العمل است. عددها به تومان؛ برگشت‌ها کسر شده‌اند.</p>
      <div class="scrollx"><table class="table-plain bk-table"><thead><tr>${cols.map(([, t]) => html`<th>${t}</th>`)}</tr></thead><tbody>${[...r.rows, ...(r.rows.length ? [r.total] : [])].map((x) => html`<tr class="${x.month === 'جمع' ? 'big' : ''}">${cols.map(([k]) => {
        const v = typeof k === 'function' ? k(x) : x[k];
        return html`<td class="num">${typeof v === 'number' ? (k === 'invoices' || k === 'returns' ? fa(v) : T(v * 10)) : fa(String(v).replace('-', '/'))}</td>`;
      })}</tr>`)}</tbody></table></div>${exportButtons('vt')}`);
    wireExport(map, 'vt', `vat-${from}-${to}`, () => [...r.rows, r.total], cols, 'مالیات');
    wireRange();
  } else {
    const r = await api(`/api/books/report/sales?from=${from}&to=${to}&by=${by}`);
    const BY = [['tpl', 'قالب کالا'], ['kind', 'نوع'], ['seller', 'فروشنده'], ['day', 'روز'], ['party', 'مشتری'], ['method', 'روش پرداخت']];
    const cols = [['label', 'گروه'], ['count', 'تعداد'], ['weight', 'وزن'], [(x) => x.principal / 10, 'اصل'], [(x) => x.consfee / 10, 'اجرت'], [(x) => x.spro / 10, 'سود'], [(x) => x.vat / 10, 'مالیات'], [(x) => x.total / 10, 'جمع']];
    const max = Math.max(1, ...r.rows.map((x) => Math.abs(x.total)));
    box.innerHTML = String(html`${range(html`<select class="input" name="by">${BY.map(([k, l]) => html`<option value="${k}" ${by === k ? 'selected' : ''}>${l}</option>`)}</select>`)}
      <div class="scrollx"><table class="table-plain bk-table"><thead><tr><th>${BY.find(([k]) => k === by)[1]}</th><th>تعداد</th><th>وزن</th><th>اجرت + سود</th><th>مالیات</th><th>جمع</th><th></th></tr></thead><tbody>${r.rows.map((x) => html`<tr><td>${by === 'day' ? jd(x.label) : x.label}</td><td class="num">${fa(x.count)}</td><td class="num">${x.weight ? G(x.weight) : '—'}</td><td class="num">${T(x.consfee + x.spro)}</td><td class="num">${T(x.vat)}</td><td class="num">${T(x.total)}</td><td style="min-width:120px"><div class="bar"><i style="width:${(Math.abs(x.total) / max) * 100}%"></i></div></td></tr>`)}</tbody></table></div>${exportButtons('sl')}`);
    wireExport(map, 'sl', `forush-${by}-${from}-${to}`, () => r.rows, cols, 'فروش');
    wireRange();
  }
  actions(root, map);
}

/* ---------------- settings ---------------- */
export async function settingsPage(root) {
  const [s, tpls] = await Promise.all([api('/api/books/settings'), api('/api/books/templates')]);
  const jewel = tpls.items.filter((t) => t.kind === 'jewel');
  const f = (name, label, v, extra = '') => html`<label class="field">${label}<input class="input ${extra}" name="${name}" value="${v ?? ''}"></label>`;
  root.innerHTML = String(html`${booksNav('settings')}<div class="bk-head"><h1>تنظیمات حسابداری</h1></div>
    <form class="tray form bk-sec" id="sf">
      <h3 class="bk-h">مشخصات رسمی فروشنده (روی فاکتور)</h3>
      <div class="form cols">${f('legalName', 'نام فروشگاه / شخص حقوقی', s.legalName)}${f('economicCode', 'شماره اقتصادی', s.economicCode, 'ltr')}${f('nationalId', 'کد ملی / شناسه ملی', s.nationalId, 'ltr')}${f('regNo', 'شماره ثبت / پروانه کسب', s.regNo, 'ltr')}</div>
      <div class="form cols">${f('phone', 'تلفن', s.phone, 'ltr')}${f('postal', 'کد پستی', s.postal, 'ltr')}${f('branchCode', 'کد شعبه', s.branchCode, 'ltr')}</div>
      ${f('address', 'نشانی', s.address)}
      <label class="field">متن پای فاکتور<textarea class="input" name="footer" rows="2">${s.footer}</textarea></label>
      <h3 class="bk-h">سامانه مودیان</h3>
      <p class="small">${s.taxReady ? '✓ آماده ساخت شماره منحصربه‌فرد مالیاتی و فایل سامانه مودیان.' : 'برای ساخت شماره منحصربه‌فرد مالیاتی، شناسه یکتای حافظه (از کارپوشه سامانه مودیان) و شماره اقتصادی را وارد کنید.'} ارسال مستقیم به سامانه با کلید خصوصی خود مؤدی یا از طریق شرکت معتمد انجام می‌شود؛ این نرم‌افزار فایل استاندارد (الگوی طلا، جواهر و پلاتین) را می‌سازد.</p>
      <div class="form cols">${f('memoryId', 'شناسه یکتای حافظه مالیاتی (۶ کاراکتر)', s.memoryId, 'ltr')}${f('sstid.jewel', 'شناسه کالا: کارساخته (۱۳ رقم)', s.sstid.jewel, 'ltr')}${f('sstid.coin', 'شناسه کالا: سکه', s.sstid.coin, 'ltr')}${f('sstid.melt', 'شناسه کالا: آب‌شده', s.sstid.melt, 'ltr')}${f('sstid.stone', 'شناسه کالا: سنگ', s.sstid.stone, 'ltr')}${f('sstid.service', 'شناسه خدمت', s.sstid.service, 'ltr')}${f('sstid.goods', 'شناسه کالای غیرطلا', s.sstid.goods, 'ltr')}${f('mu.gram', 'کد واحد: گرم', s.mu.gram, 'ltr')}${f('mu.count', 'کد واحد: عدد', s.mu.count, 'ltr')}</div>
      <h3 class="bk-h">دسترسی فروشنده‌ها</h3>
      ${[['staffCanDiscount', 'فروشنده می‌تواند تخفیف بدهد'], ['staffCanEditPrice', 'فروشنده می‌تواند اجرت و سود کالای انبار را تغییر دهد'], ['staffCanEditFinal', 'فروشنده سند قطعی امروز خودش را ویرایش کند'], ['staffBackdate', 'فروشنده سند با تاریخ گذشته ثبت کند']].map(([k, l]) => html`<label class="segopt"><input type="checkbox" name="${k}" ${s[k] ? 'checked' : ''}><span>${l}</span></label>`)}
      <p class="small">نرخ مالیات بر ارزش افزوده: ${fa(s.vatPct)}٪ (از تنظیمات قیمت‌گذاری تیم).</p>
      <div class="actions"><button class="btn">ذخیره تنظیمات</button><button class="btn ghost" type="button" data-act="backup">پشتیبان کامل (JSON)</button></div></form>
    <section class="tray bk-sec"><div class="bk-head"><h3 class="bk-h">اجرت و سود پیش‌فرض قالب‌ها</h3><div class="actions"><input class="input ltr sm" id="allOj" placeholder="اجرت ٪ برای انتخاب‌ها" inputmode="decimal"><button class="chip" data-act="applyAll">اعمال روی انتخاب‌ها</button></div></div>
      <div class="scrollx"><table class="table-plain bk-table"><thead><tr><th><input type="checkbox" id="tall"></th><th>قالب</th><th>نوع اجرت</th><th>اجرت</th><th>سود ٪</th><th>پنهان</th></tr></thead><tbody>${jewel.map((t) => html`<tr data-t="${t.id}"><td><input type="checkbox" data-tsel></td><td>${t.label}</td><td><select class="input sm" data-f="ojratMode">${[['pct', 'درصد'], ['gram', 'هر گرم'], ['fixed', 'ثابت']].map(([v, l]) => html`<option value="${v}" ${t.ojratMode === v ? 'selected' : ''}>${l}</option>`)}</select></td><td><input class="input ltr sm" data-f="ojrat" value="${t.ojrat}" inputmode="decimal"></td><td><input class="input ltr sm" data-f="profitPct" value="${t.profitPct}" inputmode="decimal"></td><td><input type="checkbox" data-f="hidden" ${t.hidden ? 'checked' : ''}></td></tr>`)}</tbody></table></div>
      <div class="actions"><button class="btn" data-act="saveT">ذخیره قالب‌ها</button></div></section>`);
  $('#sf', root).addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target));
    const body = { sstid: {}, mu: {} };
    for (const [k, v] of Object.entries(fd)) {
      if (k.startsWith('sstid.')) body.sstid[k.slice(6)] = v;
      else if (k.startsWith('mu.')) body.mu[k.slice(3)] = v;
      else body[k] = v;
    }
    for (const k of ['staffCanDiscount', 'staffCanEditPrice', 'staffCanEditFinal', 'staffBackdate']) body[k] = e.target.elements[k].checked;
    const btn = e.submitter;
    busy(btn, true);
    try {
      await api('/api/books/settings', { method: 'PUT', body });
      toast('ذخیره شد.', 'ok');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      busy(btn, false);
    }
  });
  actions(root, {
    backup: async () => {
      const d = await api('/api/books/export');
      download(`beatris-books-${today()}.json`, 'application/json', JSON.stringify(d));
    },
    applyAll: () => {
      const v = $('#allOj', root).value;
      $$('tr[data-t]', root).forEach((tr) => {
        if ($('[data-tsel]', tr).checked && v) {
          $('[data-f=ojratMode]', tr).value = 'pct';
          $('[data-f=ojrat]', tr).value = v;
        }
      });
    },
    saveT: async () => {
      const templates = {};
      for (const tr of $$('tr[data-t]', root)) templates[tr.dataset.t] = { ojratMode: $('[data-f=ojratMode]', tr).value, ojrat: $('[data-f=ojrat]', tr).value, profitPct: $('[data-f=profitPct]', tr).value, hidden: $('[data-f=hidden]', tr).checked };
      try {
        await api('/api/books/settings', { method: 'PUT', body: { templates } });
        toast('قالب‌ها ذخیره شد.', 'ok');
      } catch (err) {
        toast(err.message, 'error');
      }
    },
  });
  $('#tall', root).addEventListener('change', (e) => $$('[data-tsel]', root).forEach((c) => (c.checked = e.target.checked)));
}
