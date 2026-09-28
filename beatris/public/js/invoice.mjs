// The printed invoice: a gold-house document with a modern faceted crown emblem, guilloché borders like a
// banknote, the make-up of the price as charts, and every official field of the tax system's gold pattern.
// Pure markup + SVG (no images to load), so it prints identically on screen, PDF and paper.
import { crownSvg } from './crown.mjs';
import { html, raw, fa } from './core.mjs';
import * as B from './books.mjs';
import { COIN_TYPES } from './coins.mjs';
import { qrSvg } from './qr.mjs';
import { T, TU, G, jd, timeFa, EX, unitName, moneyWords, K, booksPrefs, prefs, lineVerb, unitAmt, unitVal } from './bk.mjs';
import { TRADE_KINDS, FX_CODES } from './trade.mjs';

export const THEMES = [
  ['royal', 'سلطنتی'],
  ['noir', 'شب طلایی'],
  ['ivory', 'کم‌جوهر'],
];

/* ---------------- art ---------------- */
let uid = 0;
/** The crown emblem: faceted body, pearl tips, a jewelled band, inside a double medallion ring. */
export function crown({ size = 88, ring = true, id = `cr${++uid}` } = {}) {
  return raw(crownSvg({ size, ring, id }));
}
/** A guilloché band: phase-shifted sine waves, the security engraving of banknotes and share certificates. */
function guilloche(w = 800, h = 22, n = 7) {
  let d = '';
  for (let k = 0; k < n; k++) {
    const ph = (k / n) * Math.PI * 2;
    let p = '';
    for (let x = 0; x <= w; x += 4) p += `${x ? 'L' : 'M'}${x} ${(h / 2 + (h / 2 - 1.5) * Math.sin(x / 11 + ph) * Math.cos(x / 97 + ph / 2)).toFixed(2)}`;
    d += `<path d="${p}"/>`;
  }
  return raw(`<svg class="guil" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width=".5">${d}</g></svg>`);
}
/** Corner ornament: a quarter rosette with a filigree scroll; rotated for the four corners. */
const corner = (pos) =>
  raw(`<svg class="corner ${pos}" viewBox="0 0 60 60" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width=".9"><path d="M2 58 V14 Q2 2 14 2 H58"/><path d="M8 58 V18 Q8 8 18 8 H58" stroke-width=".5"/><path d="M14 30 Q14 14 30 14" /><circle cx="14" cy="14" r="4"/><path d="M14 20 C22 20 20 30 28 30 M20 14 C20 22 30 20 30 28" stroke-width=".6"/></g><circle cx="14" cy="14" r="1.6" fill="currentColor"/></svg>`);
/** Line icons for the kinds of piece on the invoice. */
const ICONS = {
  ring: '<circle cx="12" cy="14.5" r="6"/><path d="M9.5 8.5 8 5.2l4-2 4 2-1.5 3.3"/>',
  neck: '<path d="M4 4c1 7 4 10 8 10s7-3 8-10"/><path d="M12 14v2"/><path d="m12 16 2.5 3L12 22l-2.5-3Z"/>',
  chain: '<rect x="3" y="9" width="7" height="6" rx="3"/><rect x="8.5" y="9" width="7" height="6" rx="3"/><rect x="14" y="9" width="7" height="6" rx="3"/>',
  wrist: '<ellipse cx="12" cy="12" rx="9" ry="5"/><ellipse cx="12" cy="12" rx="6" ry="2.6"/>',
  ear: '<path d="M12 3v4"/><circle cx="12" cy="9" r="2"/><path d="M12 11c-3 3-3 7 0 10 3-3 3-7 0-10Z"/>',
  set: '<path d="M4 5c1 5 4 7 8 7s7-2 8-7"/><circle cx="12" cy="15" r="2"/><circle cx="5" cy="18" r="1.6"/><circle cx="19" cy="18" r="1.6"/>',
  kids: '<path d="M12 4 13.8 8l4.2.4-3.2 2.8 1 4.3L12 13.2 8.2 15.5l1-4.3L6 8.4 10.2 8Z"/><path d="M12 15.5V20"/>',
  misc: '<path d="M12 3 20 9l-8 12L4 9Z"/><path d="M4 9h16M9 9l3 12 3-12M8 3.5 9 9m7-5.5L15 9"/>',
  coin: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="5.5"/><path d="M12 9v6M10 10.5h4M10 13.5h4"/>',
  bar: '<path d="M3 17 6 8h12l3 9Z"/><path d="M6 8l2 9M18 8l-2 9M8.5 12.5h7"/>',
  service: '<path d="M14 6a4 4 0 0 0-5 5l-5 5 3 3 5-5a4 4 0 0 0 5-5l-2.5 2.5-2-.5-.5-2Z"/>',
  goods: '<path d="M4 8 12 4l8 4v8l-8 4-8-4Z"/><path d="m4 8 8 4 8-4M12 12v8"/>',
  used: '<path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 4v5h-5"/><circle cx="12" cy="12" r="2.5"/>',
};
const iconFor = (kind, tplId) => {
  const t = tplId ? B.templateById(tplId) : null;
  const k = kind === 'coin' ? 'coin' : kind === 'melt' ? 'bar' : kind === 'used' ? 'used' : kind === 'service' ? 'service' : kind === 'goods' ? 'goods' : t?.id === 'inv-bar' ? 'bar' : t?.group && ICONS[t.group] ? t.group : 'ring';
  return raw(`<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[k]}</svg>`);
};
const PAY_ICON = { cash: 'M3 7h18v10H3Z M12 12m-2.5 0a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0', pos: 'M6 3h12v18H6Z M9 7h6v4H9Z M9 14h1 M12 14h1 M15 14h0 M9 17h1 M12 17h1', c2c: 'M3 6h18v12H3Z M3 10h18 M6 15h5', cheque: 'M3 7h18v10H3Z M6 11h7 M6 14h4 M15 14l3-3', gold: 'M3 17 6 8h12l3 9Z', coin: 'M12 12m-8 0a8 8 0 1 0 16 0a8 8 0 1 0 -16 0', default: 'M4 12h16 M14 6l6 6-6 6' };
const payIcon = (m) => raw(`<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="${PAY_ICON[m] ?? (['satna', 'paya', 'pol', 'havale', 'gateway', 'bnpl'].includes(m) ? 'M4 9h13l-3-3 M20 15H7l3 3' : PAY_ICON.default)}"/></svg>`);

/* ---------------- charts ---------------- */
const SERIES = [
  ['principal', 'ارزش طلا (معاف)', 'var(--c-gold)'],
  ['stones', 'سنگ و جواهر (معاف)', 'var(--c-lapis)'],
  ['consfee', 'اجرت ساخت', 'var(--c-carn)'],
  ['spro', 'سود فروشنده', 'var(--c-turq)'],
  ['bros', 'حق‌العمل', 'var(--c-amethyst)'],
  ['vat', 'مالیات بر ارزش افزوده', 'var(--c-ink)'],
];
const pct = (v, total) => (total ? (v / total) * 100 : 0);
const pctFa = (v, total) => `${fa((Math.round(pct(v, total) * 10) / 10).toString().replace('.', '٫'))}٪`;
/** Donut of the invoice's make-up. */
function donut(parts, total, size = 150) {
  const r = 52, C = 2 * Math.PI * r;
  let off = 0;
  const segs = parts
    .filter((p) => p.v > 0)
    .map((p) => {
      const len = (p.v / total) * C;
      const s = `<circle cx="70" cy="70" r="${r}" fill="none" stroke="${p.color}" stroke-width="20" stroke-dasharray="${len.toFixed(2)} ${(C - len).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" transform="rotate(-90 70 70)"/>`;
      off += len;
      return s;
    })
    .join('');
  return raw(`<svg class="donut" viewBox="0 0 140 140" width="${size}" height="${size}" aria-hidden="true"><circle cx="70" cy="70" r="${r}" fill="none" stroke="var(--line)" stroke-width="20"/>${segs}<circle cx="70" cy="70" r="40" fill="none" stroke="var(--gold)" stroke-width=".6" opacity=".6"/></svg>`);
}
/** One line's make-up as a thin stacked bar. */
const miniBar = (l) => {
  const tot = l.principal + l.stones + l.consfee + l.spro + l.bros + l.vat;
  if (!tot) return '';
  return raw(`<span class="mbar" aria-hidden="true">${SERIES.map(([k, , c]) => (l[k] > 0 ? `<i style="width:${pct(l[k], tot).toFixed(2)}%;background:${c}"></i>` : '')).join('')}</span>`);
};

/* ---------------- the document ---------------- */
export function invoicePaper({ d, s, shop, format = 'a4', theme = 'royal', verifyUrl, brandName = '' }) {
  const c = d.calc;
  const t = B.DOC_TYPES[d.type];
  const party = d.party;
  const official = ['sale', 'return', 'proforma'].includes(d.type);
  const rows = c.lines.map((l, i) => ({ l, src: d.lines[i] }));
  const out = rows.filter(({ l }) => l.side === 'out'), inn = rows.filter(({ l }) => l.side === 'in');
  const title = official && d.type !== 'proforma' ? (d.type === 'return' ? 'صورتحساب برگشت از فروش' : 'صورتحساب فروش کالا و خدمات') : t.label;
  const typeNote = official && d.type !== 'proforma' ? `الگوی طلا، جواهر و پلاتین · ${party?.nid || party?.eco ? 'نوع اول' : 'نوع دوم'}` : '';
  const weight = out.reduce((a, { l }) => a + (l.kind === 'jewel' || l.kind === 'melt' ? l.weight : 0), 0);
  const w750 = out.reduce((a, { l }) => a + (l.kind === 'jewel' ? (l.weight * l.fineness) / 750 : l.kind === 'melt' ? l.g750 : 0), 0);
  const p750 = d.lines.find((l) => l.kind === 'jewel' && l.p750)?.p750;
  const amount = Math.abs(c.net || c.paidIn || c.paidOut);
  const parts = SERIES.map(([k, label, color]) => ({ k, label, color, v: c[k] ?? 0 })).map((p) => (p.k === 'principal' ? { ...p, v: c.principal } : p));
  const partsTotal = parts.reduce((a, p) => a + Math.max(0, p.v), 0);
  const flag = d.status !== 'final' ? (d.status === 'void' ? 'باطل شده' : 'پیش‌نویس · معتبر نیست') : '';
  const payLabel = (p, i) => {
    const src = d.payments[i];
    const bits = [];
    if (src.ref) bits.push(`پیگیری ${fa(src.ref)}`);
    if (src.card) bits.push(`کارت ${fa(String(src.card).slice(-4))}`);
    if (p.method === 'cheque') bits.push(`چک ${fa(src.chequeNo || src.sayad || '')} · سررسید ${jd(src.due)}`);
    if (p.method === 'gold') bits.push(`${G(p.g750)} گرم ۷۵۰`);
    if (p.method === 'coin') bits.push(`${fa(p.count)} ${COIN_TYPES[p.coin].short}`);
    return bits.join(' · ');
  };
  const sellerLines = [s.address, [s.phone && `تلفن ${fa(s.phone)}`, s.postal && `کد پستی ${fa(s.postal)}`].filter(Boolean).join(' · '), [s.economicCode && `شماره اقتصادی ${fa(s.economicCode)}`, s.nationalId && `شناسه/کد ملی ${fa(s.nationalId)}`, s.regNo && `ثبت ${fa(s.regNo)}`].filter(Boolean).join(' · ')].filter(Boolean);
  const verify = html`<div class="bk-p-verify">${raw(qrSvg(verifyUrl, { size: format === 'r80' ? 92 : 86, dark: theme === 'noir' ? '#f3dca0' : '#1a140a', light: theme === 'noir' ? '#15110b' : '#ffffff' }))}<span>کد اصالت<br><b class="ltr-num">${d.verify}</b><br><small class="ltr-num">${verifyUrl.replace(/^https?:\/\//, '')}</small></span></div>`;

  /* ---- 80 mm roll: the same identity, compact ---- */
  if (format === 'r80')
    return html`<article class="bk-paper r80 inv ${theme} printable" dir="rtl">
      <header class="r-head">${crown({ size: 64 })}<b class="shop">${shop}</b><span class="r-title">${title}</span>${typeNote ? html`<small>${typeNote}</small>` : ''}${flag ? html`<em class="bk-p-flag">${flag}</em>` : ''}
        <div class="r-meta"><span>شماره <b>${fa(d.fy)}-${fa(String(d.no).padStart(5, '0'))}</b></span><span>${jd(d.date)} ${d.issuedAt ? timeFa(d.issuedAt) : ''}</span>${d.tax?.taxId ? html`<span class="ltr-num">${d.tax.taxId}</span>` : ''}</div></header>
      ${guilloche(300, 12, 5)}
      ${party || official ? html`<p class="r-party"><b>${d.type === 'buy' ? 'فروشنده' : 'خریدار'}:</b> ${party ? html`${party.name}${party.nid ? ` · ${fa(party.nid)}` : ''}` : 'مصرف‌کننده نهایی'}</p>` : ''}
      ${out.length ? html`<table class="bk-p-table roll"><tbody>${out.map(({ l, src }) => html`<tr><td>${src.title || B.KIND_LABEL[l.kind]}<small>${l.weight ? ` · ${G(l.weight)} گرم` : ''}${l.fineness ? ` · عیار ${fa(l.fineness)}` : ''}${l.kind === 'coin' ? ` · ${fa(l.count)} عدد` : ''}${l.kind === 'jewel' ? ` · طلا ${T(l.principal)} · اجرت ${T(l.consfee)} · سود ${T(l.spro)}${l.stones ? ` · سنگ ${T(l.stones)}` : ''} · مالیات ${T(l.vat)}` : l.vat ? ` · مالیات ${T(l.vat)}` : ''}</small>${miniBar(l)}</td><td class="num"><b>${T(l.total)}</b></td></tr>`)}</tbody><tfoot><tr><td>جمع (${unitName()}) · مالیات ${T(c.vat)}</td><td class="num"><b>${T(c.sales)}</b></td></tr></tfoot></table>` : ''}
      ${d.type === 'trade' ? html`<table class="bk-p-table roll"><tbody>${c.lines.map((l, i) => html`<tr><td>${lineVerb(l)} · ${l.kind === 'coin' ? `سکه ${COIN_TYPES[l.coin]?.short ?? ''}` : l.kind === 'fx' ? FX_CODES[l.code] : TRADE_KINDS[l.kind]}<small>${l.weight ? ` · ${G(l.weight)} گرم` : ''}${l.fineness ? ` · عیار ${fa(l.fineness)}` : ''}${l.eq750 ? ` · ۷۵۰: ${G(l.eq750)}` : ''}${l.kind === 'bar' ? ` · سریال ${fa(l.serial)}` : ''}${l.kind === 'coin' ? ` · ${fa(l.count)} عدد` : ''}${l.mazaneh ? ` · مظنه ${T(l.mazaneh)}` : ''}</small></td><td class="num"><b>${l.priced ? T(l.value) : unitAmt(l.unit, l.amt)}</b></td></tr>`)}</tbody></table>` : ''}
      ${inn.length ? html`<table class="bk-p-table roll in"><tbody>${inn.map(({ l, src }) => html`<tr><td>↺ ${src.title || B.KIND_LABEL[l.kind]}<small>${l.weight ? ` · ${G(l.weight)} گرم` : ''}${l.fineness ? ` · عیار ${fa(l.fineness)}` : ''}</small></td><td class="num">${T(l.total)}</td></tr>`)}</tbody></table>` : ''}
      <div class="r-total"><span>${c.net >= 0 ? 'قابل پرداخت' : 'پرداختی به مشتری'}</span><b>${TU(amount)}</b></div>
      ${c.payments.length ? html`<ul class="r-pay">${c.payments.map((p, i) => html`<li>${B.payMethod(p.method).label} <b>${T(p.value)}</b></li>`)}</ul>` : ''}
      ${c.credit ? html`<p class="r-credit">${c.credit > 0 ? 'نسیه' : 'بستانکار'}: ${c.creditUnit === 'G750' ? `${G(Math.abs(c.creditG))} گرم ۷۵۰` : TU(Math.abs(c.credit))}</p>` : ''}
      ${verify}
      <p class="r-foot">${official ? 'مالیات فقط بر اجرت، سود و حق‌العمل؛ اصل طلا معاف. ' : ''}${s.footer ?? ''}</p>
    </article>`;

  /* ---- A4 / A5 ---- */
  const trade = d.type === 'trade';
  const tl = trade ? c.lines.map((l, i) => ({ l, src: d.lines[i] ?? {} })) : [];
  const sumEq = (dir) => B.r3(tl.filter(({ l }) => l.dir === dir && l.eq750).reduce((a, { l }) => a + l.eq750, 0));
  const tradeKpis = trade && [
    sumEq('in') && ['طلای ورودی (معادل ۷۵۰)', `${G(sumEq('in'))} گرم`],
    sumEq('out') && ['طلای خروجی (معادل ۷۵۰)', `${G(sumEq('out'))} گرم`],
    tl.some(({ l }) => l.kind === 'coin') && ['سکه', tl.filter(({ l }) => l.kind === 'coin').map(({ l }) => `${l.dir === 'in' ? '↓' : '↑'}${fa(l.count)} ${COIN_TYPES[l.coin]?.short}`).join(' · ')],
    [c.net >= 0 ? 'قابل دریافت از مشتری' : 'قابل پرداخت به مشتری', TU(amount)],
  ].filter(Boolean);
  const kpis = trade ? tradeKpis : [
    out.some(({ l }) => l.weight) && ['وزن طلا', `${G(weight)} گرم`],
    w750 && ['معادل ۱۸ عیار', `${G(B.r3(w750))} گرم`],
    p750 && ['نرخ روز گرم ۱۸', TU(B.rnd(p750 * 10))],
    out.length && ['تعداد اقلام', fa(out.length)],
    [c.net >= 0 ? 'قابل پرداخت' : 'پرداختی به مشتری', TU(amount)],
  ].filter(Boolean);
  const paidIn = c.paidIn, credit = Math.max(0, c.credit);
  return html`<article class="bk-paper ${format} inv ${theme} printable" dir="rtl">
    ${corner('tr')}${corner('tl')}${corner('br')}${corner('bl')}
    <div class="wm" aria-hidden="true">${crown({ size: 380, ring: true })}</div>
    ${flag ? html`<div class="stamp-flag">${flag}</div>` : ''}
    <header class="i-band">
      <div class="i-brand">${crown({ size: format === 'a5' ? 70 : 92 })}<div><b class="shop">${shop}</b><span class="tag">${B.DOC_TYPES[d.type]?.base ? 'سکه · طلای آبشده · شمش · ارز' : 'طلا و جواهر'}</span></div></div>
      <div class="i-title"><span class="latin">${d.type === 'return' ? 'CREDIT NOTE' : d.type === 'proforma' ? 'PRO-FORMA' : official ? 'TAX INVOICE · GOLD' : 'VOUCHER'}</span><h2>${title}</h2>${typeNote ? html`<small>${typeNote}</small>` : ''}</div>
      <div class="i-meta"><div><span>شماره</span><b>${fa(d.fy)}-${fa(String(d.no).padStart(5, '0'))}</b></div><div><span>تاریخ</span><b>${jd(d.date)}</b>${d.issuedAt ? html`<em>${timeFa(d.issuedAt)}</em>` : ''}</div>${d.serial ? html`<div><span>سریال</span><b>${fa(d.serial)}</b></div>` : ''}${d.version > 1 ? html`<div><span>نسخه</span><b>${fa(d.version)}</b></div>` : ''}</div>
      ${guilloche(1000, 18, 7)}
    </header>
    ${d.tax?.taxId ? html`<div class="i-taxid"><span>شماره منحصربه‌فرد مالیاتی</span><b class="ltr-num">${d.tax.taxId}</b></div>` : ''}
    <section class="i-kpis">${kpis.map(([k, v], i) => html`<div class="${i === kpis.length - 1 ? 'hl' : ''}"><span>${k}</span><b>${v}</b></div>`)}</section>
    ${d.type !== 'transfer' && d.type !== 'expense' && d.type !== 'opening'
      ? html`<section class="i-parties">
          <div class="icard"><h4>فروشنده</h4><b>${shop}</b>${sellerLines.map((x) => html`<span>${x}</span>`)}</div>
          <div class="icard"><h4>${d.type === 'buy' ? 'فروشنده کالا (مشتری)' : trade ? 'طرف معامله' : 'خریدار'}</h4>${party ? html`<b>${party.name}</b>${party.nid ? html`<span>${party.kind === 'company' ? 'شناسه ملی' : 'کد ملی'} ${fa(party.nid)}</span>` : ''}${party.eco ? html`<span>شماره اقتصادی ${fa(party.eco)}</span>` : ''}<span>${[party.mobile && fa(party.mobile), party.postal && `کد پستی ${fa(party.postal)}`].filter(Boolean).join(' · ')}</span>${party.address ? html`<span>${party.address}</span>` : ''}` : html`<b>مصرف‌کننده نهایی</b><span>فروش بی‌نام (صورتحساب نوع دوم)</span>`}</div>
        </section>`
      : ''}
    ${out.length
      ? html`<table class="bk-p-table i-items"><thead><tr><th>ردیف</th><th>شرح کالا / خدمت</th><th>وزن (گرم)</th><th>عیار</th><th>مبلغ واحد</th><th>ارزش اصل</th><th>اجرت ساخت</th><th>سود فروشنده</th><th>حق‌العمل</th><th>مالیات</th><th>مبلغ کل</th></tr></thead>
          <tbody>${out.map(({ l, src }, i) => html`<tr><td class="n">${fa(i + 1)}</td><td class="desc"><span class="ic">${iconFor(l.kind, src.tpl)}</span><span class="dt"><b>${src.title || B.KIND_LABEL[l.kind]}</b><small>${[src.code && `بارکد ${fa(src.code)}`, l.kind === 'coin' && `${fa(l.count)} عدد`, l.kind === 'jewel' && src.ojratMode && `اجرت ${src.ojratMode === 'pct' ? `${fa(src.ojrat)}٪` : src.ojratMode === 'gram' ? `${fa(src.ojrat)} ت/گرم` : 'ثابت'}`, l.discount && l.kind === 'jewel' && `تخفیف ${T(l.discount)}`].filter(Boolean).join(' · ')}</small>${miniBar(l)}</span></td><td class="num">${l.weight ? G(l.weight) : '—'}</td><td class="num">${l.fineness ? fa(l.fineness) : '—'}</td><td class="num">${l.fee ? T(l.fee) : '—'}</td><td class="num">${T(l.principal + l.stones - (l.kind === 'goods' ? l.discount : 0))}</td><td class="num">${T(l.consfee)}</td><td class="num">${T(l.spro)}</td><td class="num">${l.bros ? T(l.bros) : '—'}</td><td class="num">${T(l.vat)}</td><td class="num tot">${T(l.total)}</td></tr>`)}</tbody>
          <tfoot><tr><td colspan="5">جمع (${unitName()})</td><td class="num">${T(c.principal + c.stones)}</td><td class="num">${T(c.consfee)}</td><td class="num">${T(c.spro)}</td><td class="num">${T(c.bros)}</td><td class="num">${T(c.vat)}</td><td class="num tot">${T(c.sales)}</td></tr></tfoot></table>`
      : ''}
    ${inn.length
      ? html`<table class="bk-p-table in"><caption>${d.type === 'buy' ? 'اقلام خریداری‌شده' : 'طلای دریافتی از مشتری (تعویض)'}</caption><thead><tr><th>ردیف</th><th>شرح</th><th>وزن خالص</th><th>عیار</th><th>معادل ۷۵۰</th><th>فی هر گرم</th><th>کسر</th><th>مبلغ</th></tr></thead><tbody>${inn.map(({ l, src }, i) => html`<tr><td>${fa(i + 1)}</td><td class="desc"><span class="ic">${iconFor(l.kind, src.tpl)}</span><b>${src.title || B.KIND_LABEL[l.kind]}</b>${l.kind === 'coin' ? html`<small> · ${fa(l.count)} عدد</small>` : ''}</td><td class="num">${l.weight ? G(l.weight) : '—'}</td><td class="num">${l.fineness ? fa(l.fineness) : '—'}</td><td class="num">${l.g750 ? G(l.g750) : '—'}</td><td class="num">${l.fee ? T(l.fee) : '—'}</td><td class="num">${l.discount ? T(l.discount) : '—'}</td><td class="num tot">${T(l.total)}</td></tr>`)}</tbody></table>`
      : ''}
    ${trade && tl.length
      ? html`<table class="bk-p-table i-items i-trade"><thead><tr><th>ردیف</th><th>معامله</th><th>کالا و مشخصات</th><th>وزن (گرم)</th><th>عیار</th><th>معادل ۷۵۰</th><th>مثقال</th><th>تعداد / مقدار</th><th>مظنه / نرخ</th><th>مبلغ (${unitName()})</th></tr></thead>
          <tbody>${tl.map(({ l, src }, i) => html`<tr class="${l.dir} ${l.priced ? '' : 'goods'}"><td class="n">${fa(i + 1)}</td><td><span class="i-verb ${l.dir}">${lineVerb(l)}</span></td>
            <td class="desc"><b>${l.kind === 'coin' ? `سکه ${COIN_TYPES[l.coin]?.short ?? ''}` : l.kind === 'fx' ? FX_CODES[l.code] : TRADE_KINDS[l.kind]}</b><small>${[l.kind === 'bar' && `سریال ${fa(l.serial)}`, src.brand, src.gallery && `گالری ${src.gallery}`, src.sealDate && `پلمپ ${jd(src.sealDate)}`, src.conditional && 'شرطی (عیار موقت)', l.assay && `عیار آزمایشگاه ${fa(l.assay.to)}`, l.fee && `اجرت پلمپ ${T(l.fee)}`].filter(Boolean).join(' · ')}</small></td>
            <td class="num">${l.weight ? G(l.weight) : '—'}</td><td class="num">${l.fineness ? fa(l.fineness) : '—'}</td><td class="num">${l.eq750 ? G(l.eq750) : '—'}</td><td class="num">${l.mesghal ? G(l.mesghal) : '—'}</td>
            <td class="num">${l.kind === 'coin' || l.kind === 'bar' ? fa(l.count) : l.kind === 'fx' ? unitVal(l.unit, l.amt) : '—'}</td>
            <td class="num">${l.mazaneh ? T(l.mazaneh) : l.g750Price ? `گرم ۷۵۰: ${T(l.g750Price)}` : l.priced && l.kind === 'coin' ? `هر عدد ${T(Math.round(l.value / l.count))}` : l.priced && l.kind === 'fx' ? T(Math.round(l.value / l.amt)) : l.impliedMazaneh ? T(l.impliedMazaneh) : '—'}</td>
            <td class="num tot">${l.priced ? T(l.value) : html`<small>روی حساب جنسی: ${unitAmt(l.unit, l.amt)}</small>`}</td></tr>`)}</tbody>
          <tfoot><tr><td colspan="9">فروش به مشتری</td><td class="num tot">${T(c.sells)}</td></tr><tr><td colspan="9">خرید از مشتری</td><td class="num tot">${T(c.buys)}</td></tr></tfoot></table>`
      : ''}
    ${d.type === 'hawala' && c.hawala ? html`<p class="i-note">حواله ${unitAmt(c.hawala.unit, c.hawala.amount)} از حساب طرف اول به حساب طرف دوم؛ مانده ریالی هیچ‌کدام تغییر نمی‌کند.</p>` : ''}
    ${d.type === 'convert' && c.convert ? html`<p class="i-note">تبدیل ${unitAmt(c.convert.unit, Math.abs(c.convert.amount))} مانده جنسی به ${T(Math.abs(c.convert.value))} ${unitName()}${c.convert.mazaneh ? ` روی مظنه ${T(c.convert.mazaneh)}` : ''}.</p>` : ''}
    ${d.type === 'opening' ? html`<table class="bk-p-table"><thead><tr><th>حساب</th><th>مقدار</th></tr></thead><tbody>${(d.balances ?? []).map((b) => html`<tr><td>${b.acct}</td><td class="num">${b.unit === 'IRR' ? T(b.amt) : fa(b.amt)} ${b.unit === 'IRR' ? `${unitName()}` : b.unit === 'G750' ? 'گرم' : 'عدد'}</td></tr>`)}</tbody></table>` : ''}
    <section class="i-analysis">
      ${partsTotal && out.length
        ? html`<div class="icard i-chart"><h4>ترکیب مبلغ فاکتور</h4><div class="i-donut">${donut(parts, partsTotal, format === 'a5' ? 120 : 140)}<div class="center"><small>جمع</small><b>${T(c.sales)}</b><small>${unitName()}</small></div></div>
            <ul class="legend">${parts.filter((p) => p.v > 0).map((p) => html`<li><i style="background:${p.color}"></i><span>${p.label}</span><b>${T(p.v)}</b><em>${pctFa(p.v, partsTotal)}</em></li>`)}</ul></div>
          <div class="icard i-tax"><h4>محاسبه مالیات</h4>
            <div class="eq"><span>پایه مشمول (اجرت + سود + حق‌العمل)</span><b>${T(c.tcpbs)}</b></div>
            <div class="eq"><span>× نرخ ${fa(c.lines.find((l) => l.vra)?.vra ?? s.vatPct ?? 10)}٪</span><b>${T(c.vat)}</b></div>
            <div class="eq muted"><span>اصل طلا، سنگ و سکه (معاف)</span><b>${T(c.principal + c.stones)}</b></div>
            <p>مالیات بر ارزش افزوده طبق قانون فقط بر اجرت ساخت، سود فروشنده و حق‌العمل محاسبه شده است.</p></div>`
        : ''}
      <div class="icard i-total">
        ${c.sales ? html`<div class="row"><span>${trade ? 'فروش به مشتری' : 'جمع فاکتور'}</span><b>${TU(c.sales)}</b></div>` : ''}
        ${c.tradeIn && d.type !== 'buy' ? html`<div class="row"><span>${trade ? 'کسر: خرید از مشتری' : 'کسر: طلای دریافتی'}</span><b>− ${TU(c.tradeIn)}</b></div>` : ''}
        ${d.type === 'buy' ? html`<div class="row"><span>جمع خرید</span><b>${TU(c.tradeIn)}</b></div>` : ''}
        <div class="grand"><span>${c.net >= 0 ? (trade ? 'قابل دریافت از مشتری' : 'قابل پرداخت خریدار') : 'قابل پرداخت به مشتری'}</span><b>${TU(amount)}</b></div>
        <small class="words">${moneyWords(amount)}</small>
      </div>
    </section>
    ${c.payments.length || c.credit
      ? html`<section class="i-pay"><h4>تسویه</h4>
          ${c.sales && d.type === 'sale' ? html`<div class="settle" aria-hidden="true"><i class="paid" style="width:${pct(Math.min(c.sales, c.sales - credit), c.sales).toFixed(2)}%"></i><i class="cred" style="width:${pct(credit, c.sales).toFixed(2)}%"></i></div>` : ''}
          <div class="chips">${c.payments.map((p, i) => html`<div class="pchip ${p.dir}">${payIcon(p.method)}<span><b>${B.payMethod(p.method).label}</b><small>${p.dir === 'in' ? 'دریافت' : 'پرداخت'}${payLabel(p, i) ? ` · ${payLabel(p, i)}` : ''}</small></span><em>${T(p.value)}</em></div>`)}${c.credit ? html`<div class="pchip credit"><span><b>${c.credit > 0 ? 'مانده بدهی (نسیه)' : 'مانده بستانکاری'}</b><small>${c.creditUnit === 'G750' ? 'به حساب طلایی' : 'به حساب ریالی'}</small></span><em>${c.creditUnit === 'G750' ? `${G(Math.abs(c.creditG))} گرم` : T(Math.abs(c.credit))}</em></div>` : ''}</div>
          ${paidIn && !c.credit && d.type === 'sale' ? html`<p class="ok">✓ تسویه کامل</p>` : ''}</section>`
      : ''}
    ${d.note ? html`<p class="i-note">یادداشت: ${d.note}</p>` : ''}
    <footer class="bk-p-foot i-foot">
      <div class="sign"><div><span>مهر و امضای فروشنده</span><i class="seal">${crown({ size: 54, ring: true })}</i></div><div><span>امضای ${d.type === 'buy' ? 'فروشنده (مشتری)' : 'خریدار'}</span></div></div>
      ${verify}
      <p class="legal">${s.footer ?? ''}${d.seller ? ` · فروشنده: ${d.seller}` : ''}</p>
      <div class="made">${guilloche(1000, 10, 4)}<span>${brandName ? `${brandName} · ` : ''}صادرشده با بئاتریس — هر نسخه با اثر انگشت دیجیتال ثبت و با کد اصالت قابل استعلام است</span></div>
    </footer>
  </article>`;
}
