// محصولات میز معامله: everything sold by count — official coins, a brand's small bars and plates, private-mint pieces —
// found by typing, and made, changed or removed without leaving the desk. A template builder adds a whole range at once
// («زردیس · شمش · ۹۹۵ · ۰٫۵، ۱، ۲٫۵، ۵ گرم» → four products); the operator picks brand, kind, fineness and weights.
import { html, fa, api, toast, store, $ } from './core.mjs';
import { TRADE_COINS as COIN_TYPES, shownCoins } from './coins.mjs';
import { booksPrefs, modal, confirmBox } from './bk.mjs';

const toEn = (s) => String(s ?? '').replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٫,]/g, '.');
const faN = (n) => fa(n).replace('.', '٫');
const norm = (s) => String(s ?? '').replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/[‌\s]+/g, ' ').trim().toLowerCase();
export const BRANDS = ['زربد', 'زردیس', 'زرنشان', 'بانک مرکزی', 'پارسیان'];
export const KINDS = ['شمش', 'پلاک', 'سکه گرمی', 'سکه'];
export const WEIGHTS = [0.1, 0.2, 0.25, 0.5, 1, 1.5, 2, 2.5, 5, 10, 20, 50, 100];
export const FINENESS = [999.9, 995, 900, 750];

/** Products matching a search (name, short name or brand), in the shop's order, hidden ones left out. */
export function findProducts(q) {
  const words = norm(toEn(q)).split(' ').filter(Boolean);
  return shownCoins().filter(([, c]) => {
    const hay = norm(toEn(`${c.label} ${c.short} ${c.group ?? ''} ${c.weight}`));
    return words.every((w) => hay.includes(w));
  });
}
/** Template builder: one product per weight, named «<brand> <kind> <weight> گرم». */
export function templateProducts({ brand, kind, fineness, weights }) {
  return weights.map((w) => {
    const label = `${kind} ${brand} ${faN(w)} گرم`;
    return { label, short: `${kind === 'سکه گرمی' ? 'سکه' : kind} ${brand} ${faN(w)}`, group: brand, weight: w, fineness };
  });
}

export const pickerHtml = (f, q, admin) => {
  const list = findProducts(q);
  return html`<div class="dk-pfind"><input class="input" data-psearch value="${q}" placeholder="جستجوی محصول: زردیس، پلاک، ربع، ۲٫۵ گرم…" aria-label="جستجوی محصول" autocomplete="off">
      ${admin ? html`<button type="button" class="btn ghost small" data-prod="new">+ محصول</button><button type="button" class="btn ghost small" data-prod="tpl">قالب‌ساز</button>` : ''}</div>
    <div class="dk-coins">${list.length ? list.map(([id, c]) => html`<span class="dk-pc"><button type="button" data-coin="${id}" aria-pressed="${f.coin === id}"><b>${c.short}</b><small>${faN(c.weight)} گرم · ${faN(c.fineness)}</small></button>${admin && c.custom ? html`<button type="button" class="dk-pe" data-prod="edit" data-id="${id}" aria-label="ویرایش ${c.short}">✎</button>` : ''}</span>`) : html`<p class="small dk-pnone">محصولی با «${q}» نیست.${admin ? ' با «+ محصول» بسازید.' : ''}</p>`}</div>`;
};

async function refresh() {
  await booksPrefs(true);
}
/** New or edit: name, short name, brand, weight, fineness, optional fixed price (rial). Resolves the id or null. */
export function productModal(id = null) {
  const c = id ? COIN_TYPES[id] : {};
  return new Promise((resolve) => {
    let done = null;
    const close = modal(
      String(html`<h3 class="bk-h">${id ? 'ویرایش محصول' : 'محصول تازه'}</h3><form class="form" id="pm">
        <label class="field">نام کامل<input class="input" name="label" value="${c.label ?? ''}" required maxlength="80" placeholder="مثلاً شمش زردیس ۲٫۵ گرم"></label>
        <div class="form cols"><label class="field">نام کوتاه روی دکمه<input class="input" name="short" value="${c.short ?? ''}" maxlength="30"></label><label class="field">برند / گروه<input class="input" name="group" value="${c.group ?? ''}" list="pm-brands" maxlength="40"></label></div>
        <datalist id="pm-brands">${BRANDS.map((b) => html`<option value="${b}"></option>`)}</datalist>
        <div class="form cols"><label class="field">وزن هر عدد (گرم)<input class="input ltr" name="weight" value="${c.weight ?? ''}" inputmode="decimal" required></label><label class="field">عیار<input class="input ltr" name="fineness" value="${c.fineness ?? 995}" inputmode="decimal" required></label><label class="field">قیمت ثابت (ریال، اختیاری)<input class="input ltr" name="price" value="${c.price ?? ''}" inputmode="numeric"></label></div>
        <div class="actions"><button class="btn">${id ? 'ذخیره' : 'افزودن'}</button>${id ? html`<button type="button" class="btn ghost" data-pm="hide">پنهان از میز</button><button type="button" class="btn ghost danger" data-pm="del">حذف</button>` : ''}<button type="button" class="btn ghost" data-close>انصراف</button></div></form>`),
      (m, close_) => {
        $('#pm', m).addEventListener('submit', async (e) => {
          e.preventDefault();
          const body = Object.fromEntries(new FormData(e.target));
          for (const k of ['weight', 'fineness', 'price']) body[k] = toEn(body[k]);
          if (!body.short.trim()) body.short = body.label.trim().slice(0, 30);
          try {
            const r = await api(id ? `/api/books/products/${id}` : '/api/books/products', { method: id ? 'PUT' : 'POST', body });
            await refresh();
            done = id ?? r.id;
            toast(id ? 'محصول ذخیره شد.' : 'محصول اضافه شد.', 'ok');
            close_();
          } catch (err) {
            toast(err.message, 'error');
          }
        });
        m.addEventListener('click', async (e) => {
          const a = e.target.closest('[data-pm]')?.dataset.pm;
          if (!a) return;
          try {
            if (a === 'hide') await api(`/api/books/products/${id}`, { method: 'PUT', body: { hidden: true } });
            else {
              if (!(await confirmBox('حذف محصول', `«${c.label}» حذف شود؟ اگر در سندی آمده باشد، به‌جای حذف پنهانش کنید.`, { danger: true, ok: 'حذف' }))) return;
              await api(`/api/books/products/${id}`, { method: 'DELETE' });
            }
            await refresh();
            toast(a === 'hide' ? 'از میز پنهان شد (در «محصولات و موجودی» برمی‌گردد).' : 'حذف شد.', 'ok');
            close_();
          } catch (err) {
            toast(err.message, 'error');
          }
        });
      },
      () => resolve(done),
    );
    void close;
  });
}
/** Template builder: brand × kind × fineness × weights → products, skipping the ones the shop already has. */
export function templateModal() {
  return new Promise((resolve) => {
    let added = 0;
    modal(
      String(html`<h3 class="bk-h">قالب‌ساز محصول</h3><p class="small">برند، نوع و عیار را انتخاب کنید و وزن‌هایی را که می‌فروشید تیک بزنید؛ برای هر وزن یک محصول ساخته می‌شود. عیار و وزن را با برگه خود محصول تطبیق دهید.</p>
        <form class="form" id="tp"><div class="form cols"><label class="field">برند<input class="input" name="brand" list="tp-brands" required value="زردیس"></label><label class="field">نوع<select class="input" name="kind">${KINDS.map((k) => html`<option>${k}</option>`)}</select></label><label class="field">عیار<select class="input" name="fineness">${FINENESS.map((v) => html`<option value="${v}" ${v === 995 ? 'selected' : ''}>${faN(v)}</option>`)}</select></label></div>
        <datalist id="tp-brands">${BRANDS.map((b) => html`<option value="${b}"></option>`)}</datalist>
        <fieldset class="tp-w"><legend>وزن‌ها (گرم)</legend>${WEIGHTS.map((w) => html`<label class="segopt"><input type="checkbox" name="w" value="${w}" ${[0.5, 1, 2.5, 5].includes(w) ? 'checked' : ''}><span>${faN(w)}</span></label>`)}</fieldset>
        <label class="field">وزن دیگر (با ویرگول جدا کنید)<input class="input ltr" name="more" placeholder="۰٫۷۵، ۳"></label>
        <p class="small" id="tpPrev" aria-live="polite"></p>
        <div class="actions"><button class="btn">افزودن به محصولات</button><button type="button" class="btn ghost" data-close>انصراف</button></div></form>`),
      (m, close) => {
        const f = $('#tp', m);
        const read = () => {
          const d = new FormData(f);
          const weights = [...new Set([...d.getAll('w').map(Number), ...toEn(d.get('more')).split(/[،;\s]+/).map(Number).filter((x) => x > 0 && x < 10000)])].sort((a, b) => a - b);
          return { brand: String(d.get('brand') ?? '').trim(), kind: d.get('kind'), fineness: Number(d.get('fineness')), weights };
        };
        const prev = () => {
          const t = templateProducts(read());
          $('#tpPrev', m).textContent = t.length ? `ساخته می‌شود: ${t.map((p) => p.label).join('، ')}` : 'دست‌کم یک وزن انتخاب کنید.';
        };
        f.addEventListener('input', prev);
        prev();
        f.addEventListener('submit', async (e) => {
          e.preventDefault();
          const spec = read();
          if (spec.brand.length < 2 || !spec.weights.length) return toast('برند و دست‌کم یک وزن لازم است.', 'error');
          const have = new Set(shownCoins().map(([, c]) => norm(c.label)));
          try {
            for (const p of templateProducts(spec)) {
              if (have.has(norm(p.label))) continue;
              await api('/api/books/products', { method: 'POST', body: p });
              added++;
            }
            await refresh();
            toast(added ? `${fa(added)} محصول اضافه شد.` : 'همه این محصولات از قبل بودند.', 'ok');
            close();
          } catch (err) {
            toast(err.message, 'error');
          }
        });
      },
      () => resolve(added),
    );
  });
}
export const canManageProducts = () => store.isAdmin();
