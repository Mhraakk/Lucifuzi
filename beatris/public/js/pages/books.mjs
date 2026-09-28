// Shop books: dashboard, journal (with multi-select actions), the official invoice, the event log and the public
// authenticity page. The counter editor is in bookdoc.mjs; customers, stock, cash, reports and settings in bookmgmt.mjs.
import { html, raw, fa, api, store, toast, navigate, actions, $, $$, busy } from '../core.mjs';
import * as B from '../books.mjs';
import { COIN_TYPES } from '../coins.mjs';
import { qrSvg } from '../qr.mjs';
import { T, TU, G, jd, jdLong, jdInput, parseDay, today, addDays, timeFa, modal, confirmBox, statusChip, exportButtons, wireExport, download, balText, balClass } from '../bk.mjs';

export function booksNav(cur) {
  const admin = store.isAdmin();
  const tabs = [
    ['home', '/books', 'پیشخوان'],
    ['new', '/books/new/sale', 'فاکتور جدید'],
    ['docs', '/books/docs', 'اسناد'],
    ['parties', '/books/parties', 'مشتریان'],
    ['stock', '/books/stock', 'انبار و ویترین'],
    ['cash', '/books/cash', 'صندوق، بانک، چک'],
    ...(admin ? [['reports', '/books/reports', 'گزارش‌ها'], ['settings', '/books/settings', 'تنظیمات'], ['log', '/books/log', 'رویدادها']] : []),
  ];
  return html`<nav class="tabs bk-nav" aria-label="حسابداری">${tabs.map(([k, href, label]) => html`<a href="${href}" data-link ${cur === k ? raw('aria-current="page"') : ''}>${label}</a>`)}</nav>`;
}
const QUICK = [
  ['sale', 'فروش', 'کارساخته، سکه، آب‌شده، خدمت؛ با تعویض و پرداخت ترکیبی'],
  ['buy', 'خرید از مشتری', 'طلای مستعمل، آب‌شده و سکه'],
  ['return', 'برگشت از فروش', 'از روی فاکتور فروش (در صفحه همان فاکتور)'],
  ['receipt', 'دریافت', 'پول، چک یا طلا از طرف حساب'],
  ['payment', 'پرداخت', 'به همکار، بنکدار یا مشتری'],
  ['expense', 'هزینه', 'اجاره، حقوق، قبوض و…'],
  ['transfer', 'انتقال', 'صندوق ↔ بانک'],
  ['proforma', 'پیش‌فاکتور', 'رزرو کالا؛ بعداً یک‌کلیک فاکتور'],
];

/* ---------------- dashboard ---------------- */
export async function booksHome(root) {
  const s = await api('/api/books/summary');
  const T0 = s.totals;
  const methodIn = B.PAY_METHODS.map((m) => [m, T0.byMethod[`${m.id}:in`] ?? 0, T0.byMethod[`${m.id}:out`] ?? 0]).filter(([, a, b]) => a || b);
  root.innerHTML = String(html`${booksNav('home')}
    <div class="bk-head"><h1>پیشخوان حسابداری</h1><span class="small">${jdLong(s.from)} · قیمت گرم ۱۸: ${B.fmtRial(store.me.pricing.p750 * 10)}</span></div>
    <div class="bk-quick">${QUICK.filter(([k]) => k !== 'return').map(([k, label, hint]) => html`<a class="bk-q" href="/books/new/${k}" data-link><b>${label}</b><span>${hint}</span></a>`)}</div>
    <div class="stats bk-stats">
      <div><b>${T(T0.sales)}</b><span>فروش امروز (تومان) · ${fa(T0.count.sale ?? 0)} فاکتور</span></div>
      <div><b>${T(T0.consfee + T0.spro)}</b><span>اجرت + سود</span></div>
      <div><b>${T(T0.vat)}</b><span>مالیات بر ارزش افزوده</span></div>
      <div><b>${G(T0.soldWeight)}</b><span>گرم کارساخته فروخته</span></div>
      <div><b>${T(T0.tradeIn + T0.buys)}</b><span>خرید طلا (تعویض + خرید)</span></div>
      <div><b>${T(T0.credit)}</b><span>نسیه امروز</span></div>
    </div>
    <div class="grid2 bk-grid">
      <section class="tray"><h3 class="bk-h">گردش امروز به تفکیک روش</h3>
        ${methodIn.length ? html`<table class="table-plain"><thead><tr><th>روش</th><th>دریافت</th><th>پرداخت</th></tr></thead><tbody>${methodIn.map(([m, a, b]) => html`<tr><td>${m.label}</td><td class="num">${a ? T(a) : '—'}</td><td class="num">${b ? T(b) : '—'}</td></tr>`)}</tbody></table>` : html`<p class="small">امروز هنوز سندی ثبت نشده است.</p>`}
      </section>
      <section class="tray"><h3 class="bk-h">مانده صندوق‌ها و بانک‌ها</h3>
        <table class="table-plain"><tbody>${s.accounts.map((a) => html`<tr><td>${a.title}<span class="small"> ${a.kind === 'cash' ? 'صندوق' : a.bank || 'بانک'}</span></td><td class="num">${TU(a.balance)}</td><td class="small num">+${T(a.flow.in)} / −${T(a.flow.out)}</td></tr>`)}</tbody></table>
        <p class="small">صندوق طلا: <b>${G(s.gold)}</b> گرم ۷۵۰ · موجودی ویترین: <b>${fa(s.stock.n)}</b> قطعه، <b>${G(s.stock.w)}</b> گرم${Object.keys(s.coins).length ? html` · سکه: ${Object.entries(s.coins).map(([k, n]) => `${COIN_TYPES[k].short} ${fa(n)}`).join('، ')}` : ''}</p>
      </section>
    </div>
    ${s.dueSoon.length ? html`<section class="tray bk-sec"><h3 class="bk-h">چک‌های سررسید تا یک هفته</h3><table class="table-plain"><tbody>${s.dueSoon.map((c) => html`<tr class="${c.due < today() ? 'bad' : ''}"><td>${c.dir === 'in' ? 'دریافتی' : 'پرداختی'}</td><td>${c.partyName ?? '—'}</td><td>${fa(c.no || c.sayad)}</td><td>${jd(c.due)}</td><td class="num">${TU(c.amount)}</td><td>${B.CHEQUE_STATUS[c.status]}</td></tr>`)}</tbody></table><a class="chip" href="/books/cash" data-link>مدیریت چک‌ها</a></section>` : ''}`);
}

/* ---------------- journal ---------------- */
export async function docsPage(root) {
  const qs = new URLSearchParams(location.search);
  const F = { type: qs.get('type') ?? '', status: qs.get('status') ?? '', from: qs.get('from') ?? addDays(today(), -30), to: qs.get('to') ?? today(), q: qs.get('q') ?? '' };
  const admin = store.isAdmin();
  let rows = [];
  const sel = new Set();
  root.innerHTML = String(html`${booksNav('docs')}
    <div class="bk-head"><h1>اسناد</h1>${exportButtons('ex')}</div>
    <form class="bk-filters" id="flt">
      <select class="input" name="type"><option value="">همه انواع</option>${Object.entries(B.DOC_TYPES).map(([k, v]) => html`<option value="${k}" ${F.type === k ? 'selected' : ''}>${v.label}</option>`)}</select>
      <select class="input" name="status"><option value="">همه وضعیت‌ها</option><option value="final" ${F.status === 'final' ? 'selected' : ''}>قطعی</option><option value="draft" ${F.status === 'draft' ? 'selected' : ''}>پیش‌نویس</option><option value="void" ${F.status === 'void' ? 'selected' : ''}>باطل</option></select>
      <input class="input ltr" name="from" value="${jdInput(F.from)}" aria-label="از تاریخ" placeholder="از ۱۴۰۵/۰۱/۰۱"><input class="input ltr" name="to" value="${jdInput(F.to)}" aria-label="تا تاریخ" placeholder="تا">
      <input class="input" name="q" value="${F.q}" placeholder="نام، موبایل، شماره، بارکد، شرح">
      <button class="btn small">نمایش</button></form>
    ${admin ? html`<div class="bk-bulk" id="bulk" hidden></div>` : ''}
    <div class="scrollx"><table class="table-plain bk-table" id="tbl"></table></div>
    <p class="small" id="sum"></p>`);
  const cols = [['type', 'نوع'], ['no', 'شماره'], [(r) => jd(r.date), 'تاریخ'], ['partyName', 'طرف حساب'], [(r) => r.sales / 10, 'جمع فاکتور (تومان)'], [(r) => r.net / 10, 'خالص (تومان)'], [(r) => r.vat / 10, 'مالیات (تومان)'], [(r) => r.credit / 10, 'نسیه (تومان)'], ['status', 'وضعیت'], ['createdBy', 'ثبت‌کننده']];
  const map = {};
  wireExport(map, 'ex', `asnad-${F.from}-${F.to}`, () => (sel.size ? rows.filter((r) => sel.has(r.id)) : rows).map((r) => ({ ...r, type: B.DOC_TYPES[r.type].label })), cols, 'اسناد');
  actions(root, map);
  async function load() {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(F)) if (v) p.set(k, v);
    history.replaceState({}, '', `/books/docs?${p}`);
    rows = (await api(`/api/books/docs?${p}&limit=2000`)).items;
    sel.clear();
    draw();
  }
  function draw() {
    $('#tbl', root).innerHTML = String(html`<thead><tr>${admin ? html`<th><input type="checkbox" id="all" aria-label="انتخاب همه" ${rows.length && rows.every((r) => sel.has(r.id)) ? 'checked' : ''}></th>` : ''}<th>سند</th><th>تاریخ</th><th>طرف حساب</th><th>جمع</th><th>خالص</th><th>نسیه</th><th>وضعیت</th><th></th></tr></thead>
      <tbody>${rows.map((r) => html`<tr class="${r.status}">${admin ? html`<td><input type="checkbox" data-row="${r.id}" ${sel.has(r.id) ? 'checked' : ''} aria-label="انتخاب"></td>` : ''}<td><a href="/books/doc/${r.id}" data-link>${B.DOC_TYPES[r.type].short} ${fa(r.no)}</a>${r.version > 1 ? html`<span class="small"> نسخه ${fa(r.version)}</span>` : ''}</td><td>${jd(r.date)}</td><td>${r.partyName ?? html`<span class="small">گذری</span>`}</td><td class="num">${r.sales ? T(r.sales) : '—'}</td><td class="num">${T(r.net)}</td><td class="num ${r.credit > 0 ? 'debt' : ''}">${r.credit ? T(r.credit) : '—'}</td><td>${statusChip(r.status)}${r.tax ? html` <span class="bk-st tax">${{ sent: 'ارسال‌شده', accepted: 'تأیید مودیان', rejected: 'رد مودیان' }[r.tax] ?? ''}</span>` : ''}</td><td class="small">${r.createdBy ?? ''}</td></tr>`)}</tbody>`);
    const tot = rows.filter((r) => r.status === 'final' && r.type === 'sale').reduce((s, r) => ({ n: s.n + 1, sales: s.sales + r.sales, vat: s.vat + r.vat }), { n: 0, sales: 0, vat: 0 });
    $('#sum', root).textContent = fa(`${rows.length} سند · فروش قطعی: ${tot.n} فاکتور، ${T(tot.sales)} تومان، مالیات ${T(tot.vat)} تومان`);
    drawBulk();
  }
  function drawBulk() {
    const bar = $('#bulk', root);
    if (!bar) return;
    bar.hidden = !sel.size;
    bar.innerHTML = String(html`<b>${fa(sel.size)} سند انتخاب شد</b><button class="chip" data-bulk="party">تغییر طرف حساب</button><button class="chip" data-bulk="seller">تغییر فروشنده</button><button class="chip" data-bulk="note">یادداشت</button><button class="chip" data-bulk="date">تاریخ</button><button class="chip" data-bulk="tax">وضعیت سامانه مودیان</button><button class="chip danger" data-bulk="void">ابطال</button>`);
  }
  $('#flt', root).addEventListener('submit', (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    Object.assign(F, f, { from: parseDay(f.from) ?? '', to: parseDay(f.to) ?? '' });
    load().catch((err) => toast(err.message, 'error'));
  });
  root.addEventListener('change', (e) => {
    if (e.target.id === 'all') {
      rows.forEach((r) => (e.target.checked ? sel.add(r.id) : sel.delete(r.id)));
      draw();
    } else if (e.target.dataset.row) {
      if (e.target.checked) sel.add(e.target.dataset.row);
      else sel.delete(e.target.dataset.row);
      drawBulk();
    }
  });
  root.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-bulk]');
    if (!b) return;
    const op = b.dataset.bulk;
    const ids = [...sel];
    if (op === 'void') {
      const reason = await confirmBox(`ابطال ${fa(ids.length)} سند`, 'اسناد باطل می‌مانند و شماره‌شان دوباره استفاده نمی‌شود؛ اثرشان از حساب‌ها برداشته می‌شود.', { danger: true, reason: true, ok: 'ابطال' });
      if (!reason) return;
      return run({ ids, op, reason });
    }
    if (op === 'tax') {
      modal(String(html`<h3 class="bk-h">وضعیت در سامانه مودیان</h3><div class="actions">${[['sent', 'ارسال شد'], ['accepted', 'تأیید شد'], ['rejected', 'رد شد'], ['none', 'پاک کردن']].map(([v, l]) => html`<button class="btn small ghost" data-v="${v}">${l}</button>`)}</div>`), (m, close) =>
        m.addEventListener('click', (ev) => {
          const x = ev.target.closest('[data-v]');
          if (x) (close(), run({ ids, op, value: x.dataset.v }));
        }),
      );
      return;
    }
    let field;
    if (op === 'party') {
      const list = (await api('/api/books/parties')).items;
      field = html`<select class="input" name="value"><option value="">— بدون طرف حساب (گذری) —</option>${list.map((p) => html`<option value="${p.id}">${p.name} · ${fa(p.mobile || p.code)}</option>`)}</select>`;
    } else if (op === 'date') field = html`<input class="input ltr" name="value" value="${jdInput(today())}">`;
    else field = html`<input class="input" name="value" maxlength="${op === 'note' ? 600 : 60}">`;
    modal(String(html`<h3 class="bk-h">ویرایش گروهی ${fa(ids.length)} سند</h3><form class="form" id="bf">${field}<label class="field">دلیل (در تاریخچه هر سند می‌ماند)<input class="input" name="reason" required minlength="3"></label><div class="actions"><button class="btn">اعمال</button><button class="btn ghost" type="button" data-close>انصراف</button></div></form>`), (m, close) =>
      $('#bf', m).addEventListener('submit', (ev) => {
        ev.preventDefault();
        const f = Object.fromEntries(new FormData(ev.target));
        if (op === 'date') f.value = parseDay(f.value);
        close();
        run({ ids, op, ...f });
      }),
    );
  });
  async function run(body) {
    try {
      const r = await api('/api/books/docs/bulk', { method: 'POST', body });
      toast(`${fa(r.changed)} سند به‌روز شد.`, 'ok');
      await load();
    } catch (e) {
      toast(e.message, 'error');
    }
  }
  await load();
}

/* ---------------- one document: the official invoice ---------------- */
const FORMAT_KEY = 'beatris.books.format';
export async function docPage(root, { id }) {
  const [d, s] = await Promise.all([api(`/api/books/docs/${id}`), api('/api/books/settings')]);
  const admin = store.isAdmin();
  const shop = s.legalName || store.me.brand?.shopName || 'فروشگاه طلا و جواهر';
  let format = (() => {
    try {
      return localStorage.getItem(FORMAT_KEY) || 'a4';
    } catch {
      return 'a4';
    }
  })();
  const t = B.DOC_TYPES[d.type];
  const c = d.calc;
  const verifyUrl = `${location.origin}/verify/${d.verify}`;
  const party = d.party;
  const official = ['sale', 'return', 'proforma'].includes(d.type);
  const lineRows = c.lines.map((l, i) => ({ l, src: d.lines[i] }));
  const outRows = lineRows.filter(({ l }) => l.side === 'out'), inRows = lineRows.filter(({ l }) => l.side === 'in');
  const payLabel = (p, i) => {
    const src = d.payments[i];
    const m = B.payMethod(p.method);
    const bits = [m.label];
    if (src.ref) bits.push(`پیگیری ${fa(src.ref)}`);
    if (src.card) bits.push(`کارت ${fa(String(src.card).slice(-4))}`);
    if (p.method === 'cheque') bits.push(`چک ${fa(src.chequeNo || src.sayad || '')} سررسید ${jd(src.due)}`);
    if (p.method === 'gold') bits.push(`${G(p.g750)} گرم ۷۵۰`);
    if (p.method === 'coin') bits.push(`${fa(p.count)} ${COIN_TYPES[p.coin].short}`);
    return bits.join(' · ');
  };
  const paper = () => html`<article class="bk-paper ${format} printable" dir="rtl">
    <header class="bk-p-head">
      <div class="bk-p-shop"><b>${shop}</b>${s.address ? html`<span>${s.address}</span>` : ''}<span>${[s.phone && `تلفن ${fa(s.phone)}`, s.postal && `کد پستی ${fa(s.postal)}`].filter(Boolean).join(' · ')}</span>${s.economicCode || s.nationalId ? html`<span>${s.economicCode ? `شماره اقتصادی ${fa(s.economicCode)}` : ''}${s.nationalId ? ` · شناسه/کد ملی ${fa(s.nationalId)}` : ''}${s.regNo ? ` · ثبت ${fa(s.regNo)}` : ''}</span>` : ''}</div>
      <div class="bk-p-title"><h2>${official && d.type !== 'proforma' ? (d.type === 'return' ? 'صورتحساب برگشت از فروش' : 'صورتحساب فروش کالا و خدمات') : t.label}</h2>${official && d.type !== 'proforma' ? html`<span>الگوی طلا، جواهر و پلاتین${party?.nid || party?.eco ? ' · نوع اول' : ' · نوع دوم'}</span>` : ''}${d.status !== 'final' ? html`<em class="bk-p-flag">${d.status === 'void' ? 'باطل شده' : 'پیش‌نویس — معتبر نیست'}</em>` : ''}</div>
      <div class="bk-p-meta"><span>شماره: <b>${fa(d.fy)}-${fa(String(d.no).padStart(5, '0'))}</b></span><span>تاریخ: <b>${jd(d.date)}</b>${d.issuedAt ? ` ساعت ${timeFa(d.issuedAt)}` : ''}</span>${d.serial ? html`<span>سریال: ${fa(d.serial)}</span>` : ''}${d.tax?.taxId ? html`<span class="ltr-num">شماره منحصربه‌فرد مالیاتی: ${d.tax.taxId}</span>` : ''}${d.version > 1 ? html`<span>نسخه ${fa(d.version)}</span>` : ''}</div>
    </header>
    ${d.type !== 'transfer' && d.type !== 'expense' && d.type !== 'opening'
      ? html`<section class="bk-p-party"><b>${d.type === 'buy' ? 'فروشنده (مشتری)' : 'خریدار'}:</b> ${party ? html`${party.name}${party.nid ? ` · ${party.kind === 'company' ? 'شناسه ملی' : 'کد ملی'} ${fa(party.nid)}` : ''}${party.eco ? ` · شماره اقتصادی ${fa(party.eco)}` : ''}${party.mobile ? ` · ${fa(party.mobile)}` : ''}${party.postal ? ` · کد پستی ${fa(party.postal)}` : ''}${party.address ? ` · ${party.address}` : ''}` : 'مصرف‌کننده نهایی (گذری)'}</section>`
      : ''}
    ${outRows.length && format === 'r80'
      ? html`<table class="bk-p-table roll"><tbody>${outRows.map(({ l, src }) => html`<tr><td>${src.title || B.KIND_LABEL[l.kind]}<small>${l.weight ? ` · ${G(l.weight)} گرم` : ''}${l.fineness ? ` · عیار ${fa(l.fineness)}` : ''}${l.kind === 'coin' ? ` · ${fa(l.count)} عدد` : ''}${l.kind === 'jewel' ? ` · طلا ${T(l.principal)} · اجرت ${T(l.consfee)} · سود ${T(l.spro)}${l.stones ? ` · سنگ ${T(l.stones)}` : ''} · مالیات ${T(l.vat)}` : l.vat ? ` · مالیات ${T(l.vat)}` : ''}</small></td><td class="num"><b>${T(l.total)}</b></td></tr>`)}</tbody><tfoot><tr><td>جمع (تومان) · مالیات ${T(c.vat)}</td><td class="num"><b>${T(c.sales)}</b></td></tr></tfoot></table>`
      : outRows.length
      ? html`<table class="bk-p-table"><thead><tr><th>ردیف</th><th>شرح کالا / خدمت</th><th>وزن (گرم)</th><th>عیار</th><th>مبلغ واحد</th><th>ارزش اصل</th><th>اجرت ساخت</th><th>سود فروشنده</th><th>حق‌العمل</th><th>مالیات</th><th>مبلغ کل</th></tr></thead>
          <tbody>${outRows.map(({ l, src }, i) => html`<tr><td>${fa(i + 1)}</td><td>${src.title || B.KIND_LABEL[l.kind]}${src.code ? html`<small> · ${fa(src.code)}</small>` : ''}${l.kind === 'coin' ? html`<small> · ${fa(l.count)} عدد</small>` : ''}${l.discount && l.kind === 'jewel' ? html`<small> · تخفیف ${T(l.discount)}</small>` : ''}</td><td class="num">${l.weight ? G(l.weight) : '—'}</td><td class="num">${l.fineness ? fa(l.fineness) : '—'}</td><td class="num">${l.fee ? T(l.fee) : '—'}</td><td class="num">${T(l.principal + l.stones - (l.kind === 'goods' ? l.discount : 0))}</td><td class="num">${T(l.consfee)}</td><td class="num">${T(l.spro)}</td><td class="num">${l.bros ? T(l.bros) : '—'}</td><td class="num">${T(l.vat)}</td><td class="num"><b>${T(l.total)}</b></td></tr>`)}</tbody>
          <tfoot><tr><td colspan="5">جمع (تومان)</td><td class="num">${T(c.principal + c.stones)}</td><td class="num">${T(c.consfee)}</td><td class="num">${T(c.spro)}</td><td class="num">${T(c.bros)}</td><td class="num">${T(c.vat)}</td><td class="num"><b>${T(c.sales)}</b></td></tr></tfoot></table>`
      : ''}
    ${inRows.length
      ? html`<table class="bk-p-table in"><caption>${d.type === 'buy' ? 'اقلام خریداری‌شده' : 'طلای دریافتی از مشتری (تعویض)'}</caption><thead><tr><th>ردیف</th><th>شرح</th><th>وزن خالص</th><th>عیار</th><th>معادل ۷۵۰</th><th>فی هر گرم</th><th>کسر</th><th>مبلغ</th></tr></thead><tbody>${inRows.map(({ l, src }, i) => html`<tr><td>${fa(i + 1)}</td><td>${src.title || B.KIND_LABEL[l.kind]}${l.kind === 'coin' ? html`<small> · ${fa(l.count)} عدد</small>` : ''}</td><td class="num">${l.weight ? G(l.weight) : '—'}</td><td class="num">${l.fineness ? fa(l.fineness) : '—'}</td><td class="num">${l.g750 ? G(l.g750) : '—'}</td><td class="num">${l.fee ? T(l.fee) : '—'}</td><td class="num">${l.discount ? T(l.discount) : '—'}</td><td class="num"><b>${T(l.total)}</b></td></tr>`)}</tbody></table>`
      : ''}
    ${d.type === 'opening' ? html`<table class="bk-p-table"><thead><tr><th>حساب</th><th>مقدار</th></tr></thead><tbody>${(d.balances ?? []).map((b) => html`<tr><td>${b.acct}</td><td class="num">${b.unit === 'IRR' ? T(b.amt) : fa(b.amt)} ${b.unit === 'IRR' ? 'تومان' : b.unit === 'G750' ? 'گرم' : 'عدد'}</td></tr>`)}</tbody></table>` : ''}
    <section class="bk-p-sum">
      <div class="bk-p-pay">${c.payments.length ? html`<b>تسویه:</b><ul>${c.payments.map((p, i) => html`<li>${p.dir === 'in' ? 'دریافت' : 'پرداخت'} · ${payLabel(p, i)} · <b>${T(p.value)}</b></li>`)}</ul>` : ''}${c.credit ? html`<p><b>${c.credit > 0 ? 'مانده بدهی (نسیه)' : 'مانده بستانکاری'}:</b> ${c.creditUnit === 'G750' ? `${G(Math.abs(c.creditG))} گرم طلای ۷۵۰` : TU(Math.abs(c.credit))}</p>` : ''}${d.note ? html`<p class="small">یادداشت: ${d.note}</p>` : ''}</div>
      <div class="bk-p-tot">${c.sales ? html`<div><span>جمع فاکتور</span><b>${TU(c.sales)}</b></div>` : ''}${c.tradeIn && d.type !== 'buy' ? html`<div><span>کسر: طلای دریافتی</span><b>${TU(c.tradeIn)}</b></div>` : ''}${d.type === 'buy' ? html`<div><span>جمع خرید</span><b>${TU(c.tradeIn)}</b></div>` : ''}<div class="net"><span>${c.net >= 0 ? 'قابل پرداخت خریدار' : 'قابل پرداخت به مشتری'}</span><b>${TU(Math.abs(c.net || c.paidIn || c.paidOut))}</b></div><small>${B.words(Math.abs(c.net || c.paidIn || c.paidOut) / 10)} تومان</small></div>
    </section>
    <footer class="bk-p-foot">
      <div class="bk-p-sign"><span>مهر و امضای فروشنده</span><span>امضای ${d.type === 'buy' ? 'فروشنده (مشتری)' : 'خریدار'}</span></div>
      <div class="bk-p-verify">${raw(qrSvg(verifyUrl, { size: format === 'r80' ? 96 : 84 }))}<span>کد اصالت<br><b class="ltr-num">${d.verify}</b><br><small class="ltr-num">${verifyUrl.replace(/^https?:\/\//, '')}</small></span></div>
      <p class="small">${official ? 'مالیات بر ارزش افزوده فقط بر اجرت ساخت، سود فروشنده و حق‌العمل محاسبه شده و اصل طلا، سنگ و سکه معاف است. ' : ''}${s.footer ?? ''} · فروشنده: ${d.seller ?? ''}</p>
    </footer>
  </article>`;
  const draw = () => {
    root.innerHTML = String(html`${booksNav('docs')}
      <div class="bk-head noprint"><h1>${t.label} ${fa(d.no)} ${statusChip(d.status)}</h1>
        <div class="actions">
          <div class="seg" role="group" aria-label="قالب چاپ">${[['a4', 'A4'], ['a5', 'A5'], ['r80', 'رول ۸۰ میلی‌متری']].map(([k, l]) => html`<button data-fmt="${k}" aria-pressed="${format === k}">${l}</button>`)}</div>
          <button class="btn small" data-act="print">چاپ / PDF</button>
          ${d.status !== 'void' && (admin || d.status === 'draft') ? html`<a class="btn small ghost" href="/books/doc/${d.id}/edit" data-link>ویرایش</a>` : ''}
          ${d.status === 'draft' ? html`<button class="btn small ghost" data-act="finalize">قطعی کن</button>` : ''}
          ${d.type === 'proforma' && d.status === 'final' && !d.tax?.convertedTo ? html`<button class="btn small ghost" data-act="finalize">تبدیل به فاکتور فروش</button>` : ''}
          ${d.type === 'sale' && d.status === 'final' ? html`<a class="btn small ghost" href="/books/new/return?ref=${d.id}" data-link>برگشت از فروش</a>` : ''}
          ${official && d.status === 'final' && d.type !== 'proforma' ? html`<button class="btn small ghost" data-act="moadian">فایل سامانه مودیان</button>` : ''}
          <button class="btn small ghost" data-act="json">JSON سند</button>
          ${admin && d.status !== 'void' ? html`<button class="btn small danger" data-act="void">ابطال</button>` : ''}
        </div></div>
      ${d.tax?.pending ? html`<p class="notice noprint">این فاکتور پیش‌تر به سامانه مودیان رفته و ${d.tax.pending === 'cancel' ? 'باطل شده؛ صورتحساب «ابطالی»' : 'تغییر کرده؛ صورتحساب «اصلاحی»'} باید ارسال شود.</p>` : ''}
      ${d.tax?.convertedTo ? html`<p class="notice noprint">به <a href="/books/doc/${d.tax.convertedTo}" data-link>فاکتور فروش</a> تبدیل شده است.</p>` : ''}
      ${d.returns?.length ? html`<p class="notice noprint">برگشت‌ها: ${d.returns.map((r) => html`<a href="/books/doc/${r.id}" data-link>${fa(r.no)}</a>${r.status === 'void' ? ' (باطل)' : ''} `)}</p>` : ''}
      ${paper()}
      <section class="tray bk-sec noprint"><h3 class="bk-h">تاریخچه نسخه‌ها</h3><table class="table-plain"><tbody>${d.versions.map((v) => html`<tr><td>نسخه ${fa(v.version)}</td><td>${statusChip(v.status)}</td><td>${jd(v.at)} ${timeFa(v.at)}</td><td>${v.by ?? ''}</td><td>${v.reason || '—'}</td><td class="ltr-num small">${v.hash.slice(0, 12).toUpperCase()}</td><td>${v.version !== d.version ? html`<button class="chip" data-ver="${v.version}">مشاهده</button>` : html`<span class="small">فعلی</span>`}</td></tr>`)}</tbody></table>
        ${d.cheques?.length ? html`<h3 class="bk-h">چک‌های این سند</h3><table class="table-plain"><tbody>${d.cheques.map((q) => html`<tr><td>${fa(q.no || q.sayad)}</td><td>${q.bank}</td><td>${jd(q.due)}</td><td class="num">${TU(q.amount)}</td><td>${B.CHEQUE_STATUS[q.status]}</td></tr>`)}</tbody></table>` : ''}
        <p class="small">ثبت: ${d.createdByName ?? ''} ${jd(d.createdAt)} ${timeFa(d.createdAt)}${d.updatedAt !== d.createdAt ? ` · آخرین تغییر: ${d.updatedByName ?? ''} ${jd(d.updatedAt)} ${timeFa(d.updatedAt)}` : ''}</p></section>`);
  };
  draw();
  root.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.fmt) {
      format = b.dataset.fmt;
      try {
        localStorage.setItem(FORMAT_KEY, format);
      } catch {
        /* storage unavailable */
      }
      return draw();
    }
    if (b.dataset.ver) {
      const v = await api(`/api/books/docs/${d.id}/versions/${b.dataset.ver}`);
      const diff = [['تاریخ', jd(v.date), jd(d.date)], ['جمع فاکتور', T(v.calc.sales), T(c.sales)], ['خالص', T(v.calc.net), T(c.net)], ['مالیات', T(v.calc.vat), T(c.vat)], ['نسیه', T(v.calc.credit), T(c.credit)], ['تعداد ردیف', fa(v.lines.length), fa(d.lines.length)], ['پرداخت‌ها', fa(v.payments.length), fa(d.payments.length)], ['یادداشت', v.note || '—', d.note || '—']];
      modal(String(html`<h3 class="bk-h">نسخه ${fa(v.version)} در برابر نسخه فعلی</h3><p class="small">${jd(v.at)} ${timeFa(v.at)} · ${v.reason || ''}</p><table class="table-plain"><thead><tr><th></th><th>نسخه ${fa(v.version)}</th><th>فعلی</th></tr></thead><tbody>${diff.map(([k, a, b2]) => html`<tr class="${a !== b2 ? 'chg' : ''}"><td>${k}</td><td>${a}</td><td>${b2}</td></tr>`)}</tbody></table><div class="actions"><button class="btn ghost" data-close>بستن</button></div>`));
      return;
    }
    const act = b.dataset.act;
    if (act === 'print') window.print();
    else if (act === 'json') download(`${d.type}-${d.fy}-${d.no}.json`, 'application/json', JSON.stringify(d, null, 2));
    else if (act === 'moadian') {
      try {
        const m = await api(`/api/books/docs/${d.id}/moadian`);
        if (m.missing.length) toast(`برای ارسال کامل کم است: ${m.missing.join('، ')} (تنظیمات حسابداری)`, 'error');
        download(`moadian-${d.fy}-${d.no}.json`, 'application/json', JSON.stringify(m.invoices, null, 2));
      } catch (err) {
        toast(err.message, 'error');
      }
    } else if (act === 'void') {
      const reason = await confirmBox('ابطال سند', 'سند باطل در دفتر می‌ماند، شماره‌اش دوباره داده نمی‌شود و اثرش از حساب‌ها، موجودی و چک‌ها برداشته می‌شود.', { danger: true, reason: true, ok: 'ابطال' });
      if (!reason) return;
      try {
        await api(`/api/books/docs/${d.id}/void`, { method: 'POST', body: { reason } });
        toast('سند باطل شد.', 'ok');
        navigate(location.pathname, { replace: true });
      } catch (err) {
        toast(err.message, 'error');
      }
    } else if (act === 'finalize') {
      busy(b, true);
      try {
        const r = await api(`/api/books/docs/${d.id}/finalize`, { method: 'POST', body: {} });
        toast('ثبت شد.', 'ok');
        navigate(`/books/doc/${r.id}`);
      } catch (err) {
        toast(err.message, 'error');
        busy(b, false);
      }
    }
  });
  if (new URLSearchParams(location.search).get('print') === '1') {
    history.replaceState({}, '', `/books/doc/${d.id}`);
    setTimeout(() => $('[data-act=print]', root)?.focus(), 50);
  }
}

/* ---------------- event log ---------------- */
const ACTION_FA = { 'doc.create': 'ثبت سند', 'doc.update': 'ویرایش سند', 'doc.void': 'ابطال سند', 'doc.tax': 'وضعیت مودیان', 'party.create': 'مشتری جدید', 'party.update': 'ویرایش مشتری', 'party.delete': 'حذف مشتری', 'item.create': 'کالای جدید', 'item.update': 'ویرایش کالا', 'item.bulk': 'ویرایش گروهی کالا', 'item.delete': 'حذف کالا', stocktake: 'انبارگردانی', 'cheque.status': 'وضعیت چک', 'account.create': 'حساب جدید', 'account.update': 'ویرایش حساب', settings: 'تنظیمات', export: 'پشتیبان‌گیری' };
export async function logPage(root) {
  const r = await api('/api/books/log');
  root.innerHTML = String(html`${booksNav('log')}
    <div class="bk-head"><h1>دفتر رویدادها</h1>${exportButtons('lg')}</div>
    <p class="notice ${r.chain.ok ? 'ok' : 'bad'}">${r.chain.ok ? html`زنجیره سالم است: ${fa(r.chain.checked)} رویداد، هر کدام با اثر انگشت رویداد قبلی. هیچ ردیفی بی‌صدا تغییر نکرده است.` : html`هشدار: زنجیره در رویداد ${fa(r.chain.brokenAt)} شکسته است؛ یعنی کسی مستقیم در پایگاه داده دست برده است.`}</p>
    <div class="scrollx"><table class="table-plain bk-table"><thead><tr><th>#</th><th>زمان</th><th>کاربر</th><th>رویداد</th><th>جزئیات</th></tr></thead><tbody>${r.items.map((x) => html`<tr><td>${fa(x.seq)}</td><td>${jd(x.at)} ${timeFa(x.at)}</td><td>${x.user ?? '—'}</td><td>${ACTION_FA[x.action] ?? x.action}</td><td class="small">${x.detail.type ? `${B.DOC_TYPES[x.detail.type]?.short ?? ''} ${fa(x.detail.no ?? '')} ` : ''}${x.detail.reason ? `· ${x.detail.reason}` : ''}${x.detail.name ? x.detail.name : ''}${x.detail.n ? `· ${fa(x.detail.n)} مورد` : ''}${x.detail.to ? `· ${B.CHEQUE_STATUS[x.detail.to]}` : ''}</td></tr>`)}</tbody></table></div>`);
  const map = {};
  wireExport(map, 'lg', 'rooydad', () => r.items.map((x) => ({ ...x, action: ACTION_FA[x.action] ?? x.action, detail: JSON.stringify(x.detail) })), [['seq', '#'], ['at', 'زمان'], ['user', 'کاربر'], ['action', 'رویداد'], ['ref', 'مرجع'], ['detail', 'جزئیات'], ['hash', 'اثر انگشت']], 'رویدادها');
  actions(root, map);
}

/* ---------------- public authenticity check ---------------- */
export async function verifyPage(root, { code }) {
  let r = null, err = null;
  try {
    r = await api(`/api/verify/${encodeURIComponent(code)}`);
  } catch (e) {
    err = e.message;
  }
  root.innerHTML = String(html`<section class="bk-verify tray">
    <h1>استعلام اصالت فاکتور</h1><p class="small ltr-num">کد: ${String(code).toUpperCase()}</p>
    ${r
      ? html`<div class="bk-v-res ${r.latest ? 'ok' : 'warn'}"><b>${r.latest ? '✓ این سند در دفتر فروشگاه ثبت است' : r.status === 'void' ? '⚠ این سند باطل شده است' : '⚠ این نسخه با نسخه جدیدتری جایگزین شده است'}</b></div>
         <dl class="kv-list"><dt>فروشگاه</dt><dd>${r.shop || '—'}</dd><dt>نوع</dt><dd>${r.type}</dd><dt>شماره</dt><dd>${fa(r.fy)}-${fa(r.no)}</dd><dt>تاریخ</dt><dd>${jd(r.date)}</dd><dt>مبلغ</dt><dd>${TU(r.total)}</dd><dt>مالیات</dt><dd>${TU(r.vat)}</dd><dt>نسخه</dt><dd>${fa(r.version)} از ${fa(r.currentVersion)}</dd></dl>`
      : html`<div class="bk-v-res bad"><b>✕ ${err}</b></div>`}
    <p class="small">این صفحه فقط اطلاعات عمومی سند را نشان می‌دهد؛ مشخصات خریدار نمایش داده نمی‌شود.</p></section>`);
}
