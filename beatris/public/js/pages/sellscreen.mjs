// صفحه‌ی مشتری (spec 0037): the second screen that faces the customer. It asks the sales desk on this device for the
// cart (BroadcastChannel) and shows what the customer may see — each piece's gold value, «اجرت و سود» as one figure,
// tax, the old gold taken in, what is paid and what is left. It fetches nothing and keeps nothing.
import { html, fa } from '../core.mjs';
import * as B from '../books.mjs';
import { crown } from '../invoice.mjs';

export function sellScreenPage(root) {
  document.body.classList.add('sl-screen-body');
  let money = 'rial';
  const M = (rial) => B.fmtMoney(rial, money);
  const welcome = (shop, p750) =>
    html`<div class="ss-idle"><div class="ss-crown">${crown({ size: 96 })}</div><h1>${shop ? html`به ${shop} خوش آمدید` : 'خوش آمدید'}</h1>
      ${p750 ? html`<p>قیمت هر گرم طلای ۱۸ عیار امروز<b>${M(Math.round(p750 * 10))}</b></p>` : ''}<p class="ss-note">هر رقم این صفحه را همان موتوری حساب می‌کند که فاکتور را می‌سازد.</p></div>`;
  let back = null; // the thank-you stays a while, then the screen welcomes the next customer
  const draw = (m) => {
    clearTimeout(back);
    money = m.money === 'toman' ? 'toman' : 'rial';
    if (m.type === 'idle') return (root.innerHTML = String(html`<main class="ss">${welcome(m.shop, m.p750)}</main>`));
    if (m.type === 'done') {
      back = setTimeout(() => draw({ type: 'idle', shop: m.shop, p750: m.p750, money: m.money }), 45000);
      return (root.innerHTML = String(html`<main class="ss"><div class="ss-idle ss-thanks"><div class="ss-crown">${crown({ size: 96 })}</div><h1>سپاس از خرید شما</h1>${m.track ? html`<p>فاکتور <b class="ltr-num">${m.track}</b></p>` : ''}<p class="ss-note">رسید و کد اصالت برایتان فرستاده می‌شود.</p></div></main>`));
    }
    const v = m.view;
    root.innerHTML = String(html`<main class="ss">
      <header class="ss-head"><span class="ss-crown sm">${crown({ size: 44 })}</span><b>${v.shop}</b>${m.party ? html`<span>${m.party}</span>` : ''}</header>
      <section class="ss-lines">${v.lines.map(
        (l) => html`<article class="ss-line"><h2>${l.title}</h2><p>${l.weight ? html`${B.fmtG(l.weight)} گرم · عیار ${fa(l.fineness)}` : ''}</p>
          <dl><div><dt>ارزش طلا</dt><dd>${M(l.gold)}</dd></div><div><dt>اجرت و سود</dt><dd>${M(l.making)}</dd></div>${l.stones ? html`<div><dt>سنگ</dt><dd>${M(l.stones)}</dd></div>` : ''}${l.discount ? html`<div><dt>تخفیف</dt><dd>−${M(l.discount)}</dd></div>` : ''}<div><dt>مالیات (فقط اجرت و سود)</dt><dd>${M(l.vat)}</dd></div></dl>
          <b class="ss-amt">${M(l.total)}</b></article>`,
      )}
      ${v.tradeIns.map((t) => html`<article class="ss-line in"><h2>${t.title}</h2><p>${B.fmtG(t.weight)} گرم · معاوضه</p><b class="ss-amt">−${M(t.value)}</b></article>`)}</section>
      <footer class="ss-foot"><div><span>${v.net < 0 ? 'مغازه می‌پردازد' : 'قابل پرداخت'}</span><b>${M(Math.abs(v.net))}</b></div>${v.paid ? html`<div class="sm"><span>پرداخت‌شده</span><b>${M(v.paid)}</b></div><div class="sm"><span>مانده</span><b>${M(v.left)}</b></div>` : ''}</footer>
    </main>`);
  };
  draw({ type: 'idle' });
  if (typeof BroadcastChannel === 'undefined') return;
  const ch = new BroadcastChannel('beatris-sell');
  ch.onmessage = (e) => e.data && ['idle', 'cart', 'done'].includes(e.data.type) && draw(e.data);
  ch.postMessage({ type: 'ask' });
  return () => {
    clearTimeout(back);
    ch.close();
    document.body.classList.remove('sl-screen-body');
  };
}
