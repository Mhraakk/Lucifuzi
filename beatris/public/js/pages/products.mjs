// محصولات و موجودی — what the shop trades and how much of it sits in the vault. Add a product of its own (a
// private-mint coin, a gram piece), rename, hide from the desk, drag into the desk's order, delete one never used;
// raise or lower any stock only through a «سند اصلاح موجودی» with a reason, so the books always explain the vault.
import { html, raw, api, fa, $, $$, toast, store } from '../core.mjs';
import { booksPrefs, prefs, TU, G, unitName, modal, confirmBox } from '../bk.mjs';
import { booksNav } from './books.mjs';
import * as B from '../books.mjs';

export async function productsPage(root) {
  await booksPrefs(true);
  const admin = store.isAdmin();
  const k = prefs.money === 'rial' ? 1 : 10; // display → rial
  let data;
  root.innerHTML = String(html`${booksNav('products')}<div class="pr">
    <header class="bk-head"><div><h1>محصولات و موجودی</h1><p class="small">ترتیب همین فهرست، ترتیب دکمه‌های میز معامله است. هر کم و زیاد کردن موجودی یک «سند اصلاح موجودی» با دلیل و کد رهگیری می‌سازد.</p></div>
    ${admin ? html`<button class="btn" data-act="new">+ محصول تازه</button>` : ''}</header>
    <div id="prBody"><div class="loading"><span></span></div></div></div>`);

  async function load() {
    data = await api('/api/books/products');
    draw();
  }
  const row = (p, i, n) => html`<li class="pr-row ${p.hidden ? 'off' : ''}" data-id="${p.id}" draggable="${admin ? 'true' : 'false'}">
    ${admin ? html`<span class="pr-grip" aria-hidden="true">⋮⋮</span>` : ''}
    <div class="pr-name"><b>${p.short}</b><small>${p.label}${p.custom ? ' · محصول فروشگاه' : ''}${p.hidden ? ' · پنهان در میز' : ''}</small></div>
    <div class="pr-spec"><small>وزن × عیار</small><span class="num">${G(p.weight)} × ${fa(p.fineness)}</span></div>
    <div class="pr-price"><small>قیمت امروز${p.manualPrice ? ' (دستی)' : ''}</small><span class="num">${p.price ? TU(p.price) : '—'}</span></div>
    <div class="pr-stock"><small>موجودی</small><b class="num ${p.stock < 0 ? 'neg' : ''}">${fa(p.stock)}</b>${p.custody?.owedByShop ? html`<small>امانی نزد ما ${fa(p.custody.owedByShop)}</small>` : ''}</div>
    ${admin
      ? html`<div class="pr-act">
      <button class="iconbtn" data-adj="coin:${p.id}" data-dir="1" aria-label="افزایش موجودی ${p.short}" title="افزایش">＋</button><button class="iconbtn" data-adj="coin:${p.id}" data-dir="-1" aria-label="کاهش موجودی ${p.short}" title="کاهش">－</button>
      <button class="iconbtn" data-move="${i}" data-by="-1" ${i === 0 ? raw('disabled') : ''} aria-label="بالاتر">▲</button><button class="iconbtn" data-move="${i}" data-by="1" ${i === n - 1 ? raw('disabled') : ''} aria-label="پایین‌تر">▼</button>
      <button class="chip" data-edit="${p.id}">ویرایش</button><button class="chip" data-hide="${p.id}" data-on="${p.hidden ? 0 : 1}">${p.hidden ? 'نمایش' : 'پنهان'}</button>${p.custom && !p.used ? html`<button class="chip danger" data-del="${p.id}">حذف</button>` : ''}</div>`
      : ''}</li>`;

  function draw() {
    const items = data.items;
    $('#prBody', root).innerHTML = String(html`
      <section class="tray pr-sec"><div class="pr-h"><h2>طلای آبشده</h2>${admin ? html`<span><button class="chip" data-adj="gold" data-dir="1">＋ اضافه</button><button class="chip" data-adj="gold" data-dir="-1">－ کسری</button></span>` : ''}</div><p class="pr-big num">${G(data.gold)} <small>گرم ۷۵۰</small></p></section>
      <section class="tray pr-sec"><div class="pr-h"><h2>سکه و محصولات قطعه‌ای</h2><small>${admin ? 'بکشید و رها کنید یا با ▲▼ جابه‌جا کنید' : ''}</small></div><ol class="pr-list" id="prList">${items.map((p, i) => row(p, i, items.length))}</ol></section>
      <section class="tray pr-sec"><div class="pr-h"><h2>شمش‌های داخل گاوصندوق</h2>${admin ? html`<button class="chip" data-act="bar-in">＋ ورود شمش (اصلاح)</button>` : ''}</div>
        ${data.bars.length ? html`<ul class="pr-bars">${data.bars.map((b) => html`<li><b class="ltr-num">${fa(b.serial)}</b><span>${b.brand || '—'}</span><span class="num">${b.weight ? G(b.weight) : '—'} گرم · ${b.fineness ? fa(b.fineness) : '—'}</span>${admin ? html`<button class="chip danger" data-bar-out="${b.serial}">خروج با اصلاح</button>` : ''}</li>`)}</ul>` : html`<p class="small">شمشی در گاوصندوق نیست.</p>`}</section>
      <section class="tray pr-sec"><div class="pr-h"><h2>ارزها</h2><small>ارزی که پنهان کنید در میز معامله پیشنهاد نمی‌شود.</small></div>
        <ul class="pr-fx">${data.fx.map((f) => html`<li class="${f.hidden ? 'off' : ''}"><span>${f.label} <small class="ltr-num">${f.code}</small></span><b class="num">${f.stock ? fa(f.stock) : '—'}</b>${admin ? html`<span><button class="iconbtn" data-adj="fx:${f.code}" data-dir="1" aria-label="افزایش ${f.label}">＋</button><button class="iconbtn" data-adj="fx:${f.code}" data-dir="-1" aria-label="کاهش ${f.label}">－</button><button class="chip" data-fxhide="${f.code}">${f.hidden ? 'نمایش' : 'پنهان'}</button></span>` : ''}</li>`)}</ul></section>`);
  }
  const product = (id) => data.items.find((p) => p.id === id);
  const saveOrder = async (ids) => {
    await api('/api/books/products', { method: 'PUT', body: { order: ids } });
    await booksPrefs(true);
    await load();
  };

  function productForm(p = null) {
    const official = p && !p.custom;
    modal(
      String(html`<h3 class="bk-h">${p ? `ویرایش ${p.short}` : 'محصول تازه'}</h3><form class="form pr-form" id="pf">
        ${official ? html`<p class="small">سکه رسمی: وزن و عیار ثابت است؛ فقط نامش روی دکمه میز را می‌توانید عوض کنید.</p><label class="field">نام کوتاه روی میز<input class="input" name="short" value="${p.short}" required></label>`
          : html`<label class="field">نام کامل<input class="input" name="label" value="${p?.label ?? ''}" placeholder="مثلاً سکه پارسیان ۵۰۰ سوتی" required></label>
        <label class="field">نام کوتاه روی میز<input class="input" name="short" value="${p?.short ?? ''}" placeholder="پارسیان ۵۰۰"></label>
        <label class="field">وزن هر عدد (گرم)<input class="input ltr" name="weight" inputmode="decimal" value="${p?.weight ?? ''}" required></label>
        <label class="field">عیار (از ۱۰۰۰)<input class="input ltr" name="fineness" inputmode="numeric" value="${p?.fineness ?? 750}" required></label>
        <label class="field">قیمت دستی هر عدد (${unitName()}) — خالی = از وزن و مظنه<input class="input ltr" name="price" inputmode="decimal" value="${p?.manualPrice ? Math.round(p.manualPrice / k) : ''}"></label>`}
        <p class="err" id="pfe" role="alert"></p><div class="actions"><button class="btn">${p ? 'ذخیره' : 'افزودن'}</button><button class="btn ghost" type="button" data-close>انصراف</button></div></form>`),
      (m, close) =>
        m.querySelector('#pf').addEventListener('submit', async (e) => {
          e.preventDefault();
          const f = Object.fromEntries(new FormData(e.target));
          const body = official ? { short: f.short } : { label: f.label, short: f.short || f.label, weight: B.num(f.weight), fineness: B.num(f.fineness), price: f.price ? Math.round(B.num(f.price) * k) : '' };
          try {
            await api(p ? `/api/books/products/${p.id}` : '/api/books/products', { method: p ? 'PUT' : 'POST', body });
            close();
            toast(p ? 'ذخیره شد.' : 'محصول اضافه شد؛ در میز معامله هم آمده است.', 'ok');
            await booksPrefs(true);
            load();
          } catch (err) {
            m.querySelector('#pfe').textContent = err.message;
          }
        }),
    );
  }

  /** Raise or lower one stock line through an adjustment document with a reason. */
  function adjust(acct, dir, extra = {}) {
    const isGold = acct === 'gold', isBar = acct.startsWith('bar:'), isFx = acct.startsWith('fx:');
    const p = acct.startsWith('coin:') ? product(acct.slice(5)) : null;
    const name = isGold ? 'طلای آبشده (گرم ۷۵۰)' : isBar ? `شمش ${acct.slice(4) || 'تازه'}` : isFx ? data.fx.find((f) => f.code === acct.slice(3))?.label : p?.short;
    const unitPrice = isGold ? data.goldPrice : p?.price ?? null;
    modal(
      String(html`<h3 class="bk-h">${dir > 0 ? 'افزایش' : 'کاهش'} موجودی: ${name}</h3><p class="small">${dir > 0 ? 'اضافه شمارش یا ورود بدون خرید. بها را بنویسید تا سود و زیان فروش بعدی درست باشد.' : 'کسری شمارش، خراب شدن یا برداشت مالک. به میانگین بها، زیان همان روز ثبت می‌شود.'}</p>
        <form class="form" id="af">${isBar && dir > 0 ? html`<label class="field">سریال<input class="input ltr" name="serial" required></label><label class="field">وزن (گرم)<input class="input ltr" name="weight" inputmode="decimal" required></label><label class="field">عیار<input class="input ltr" name="fineness" value="995" inputmode="numeric"></label><label class="field">سازنده<input class="input" name="brand"></label>` : isBar ? '' : html`<label class="field">مقدار (${isGold ? 'گرم' : 'عدد'})<input class="input ltr" name="qty" inputmode="decimal" required></label>`}
        ${dir > 0 ? html`<label class="field">بهای کل (${unitName()})${unitPrice ? html` — قیمت امروز هر عدد ${TU(unitPrice)}` : ''}<input class="input ltr" name="cost" inputmode="decimal"></label>` : ''}
        <label class="field">دلیل (در سند و تاریخچه می‌ماند)<input class="input" name="reason" required placeholder="${dir > 0 ? 'مثلاً اضافه شمارش پایان روز' : 'مثلاً کسری شمارش پایان روز'}"></label>
        <p class="err" id="afe" role="alert"></p><div class="actions"><button class="btn ${dir < 0 ? 'danger' : ''}">ثبت سند اصلاح</button><button class="btn ghost" type="button" data-close>انصراف</button></div></form>`),
      (m, close) =>
        m.querySelector('#af').addEventListener('submit', async (e) => {
          e.preventDefault();
          const f = Object.fromEntries(new FormData(e.target));
          const q = isBar ? 1 : B.num(f.qty);
          if (!isBar && !(q > 0)) return (m.querySelector('#afe').textContent = 'مقدار را درست وارد کنید.');
          if (String(f.reason ?? '').trim().length < 3) return (m.querySelector('#afe').textContent = 'دلیل را بنویسید.');
          const a = isBar && dir > 0 ? `bar:${String(f.serial).trim().toUpperCase()}` : acct;
          const bal = { acct: a, amount: dir * q, ...(dir > 0 && f.cost ? { cost: Math.round(B.num(f.cost) * k) } : {}), ...(isBar && dir > 0 ? { weight: B.num(f.weight), fineness: B.num(f.fineness) || 995, brand: f.brand } : {}), ...extra };
          try {
            const d = await api('/api/books/docs', { method: 'POST', body: { type: 'adjust', money: 'rial', balances: [bal], note: String(f.reason).trim() } });
            close();
            toast(`سند اصلاح ${d.track} ثبت شد.`, 'ok');
            load();
          } catch (err) {
            m.querySelector('#afe').textContent = err.message;
          }
        }),
    );
  }

  root.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-act],[data-adj],[data-move],[data-edit],[data-hide],[data-del],[data-fxhide],[data-bar-out]');
    if (!t) return;
    try {
      if (t.dataset.act === 'new') return productForm();
      if (t.dataset.act === 'bar-in') return adjust('bar:', 1);
      if (t.dataset.barOut) return adjust(`bar:${t.dataset.barOut}`, -1);
      if (t.dataset.adj) return adjust(t.dataset.adj, Number(t.dataset.dir));
      if (t.dataset.edit) return productForm(product(t.dataset.edit));
      if (t.dataset.move) {
        const ids = data.items.map((p) => p.id), i = Number(t.dataset.move), j = i + Number(t.dataset.by);
        [ids[i], ids[j]] = [ids[j], ids[i]];
        return saveOrder(ids);
      }
      if (t.dataset.hide) {
        await api(`/api/books/products/${t.dataset.hide}`, { method: 'PUT', body: { hidden: t.dataset.on === '1' } });
        await booksPrefs(true);
        return load();
      }
      if (t.dataset.fxhide) {
        const cur = new Set(data.fx.filter((f) => f.hidden).map((f) => f.code));
        cur.has(t.dataset.fxhide) ? cur.delete(t.dataset.fxhide) : cur.add(t.dataset.fxhide);
        await api('/api/books/products', { method: 'PUT', body: { fxHidden: [...cur] } });
        await booksPrefs(true);
        return load();
      }
      if (t.dataset.del) {
        if (!(await confirmBox('حذف محصول', 'این محصول هیچ سند و موجودی ندارد و کامل حذف می‌شود.', { danger: true, ok: 'حذف' }))) return;
        await api(`/api/books/products/${t.dataset.del}`, { method: 'DELETE' });
        await booksPrefs(true);
        return load();
      }
    } catch (err) {
      toast(err.message, 'error');
    }
  });
  // drag and drop on a desktop; ▲▼ everywhere
  let dragId = null;
  root.addEventListener('dragstart', (e) => {
    const li = e.target.closest('.pr-row');
    if (!li) return;
    dragId = li.dataset.id;
    li.classList.add('drag');
    e.dataTransfer.effectAllowed = 'move';
  });
  root.addEventListener('dragover', (e) => {
    const li = e.target.closest('.pr-row');
    if (!li || !dragId) return;
    e.preventDefault();
    $$('.pr-row.over', root).forEach((x) => x.classList.remove('over'));
    li.classList.add('over');
  });
  root.addEventListener('drop', (e) => {
    const li = e.target.closest('.pr-row');
    if (!li || !dragId || li.dataset.id === dragId) return;
    e.preventDefault();
    const ids = data.items.map((p) => p.id).filter((x) => x !== dragId);
    ids.splice(ids.indexOf(li.dataset.id), 0, dragId);
    dragId = null;
    saveOrder(ids).catch((err) => toast(err.message, 'error'));
  });
  root.addEventListener('dragend', () => {
    dragId = null;
    $$('.pr-row.drag, .pr-row.over', root).forEach((x) => x.classList.remove('drag', 'over'));
  });
  await load();
}
