// Shared helpers of the shop-books screens: Jalali dates, money display, exports (CSV, Excel, JSON), a modal.
import { html, raw, esc, fa, $ } from './core.mjs';
import { fmtMoney, fmtG, faNum, words } from './books.mjs';
import { jalaliOf, isoDay, JALALI_MONTHS } from './ta.mjs';
import { COIN_TYPES } from './coins.mjs';
import { FX_CODES } from './trade.mjs';
import { api } from './core.mjs';

/* ---------------- shop preferences: edition and money unit (rial by default, as the trade keeps its books) ---------------- */
export const prefs = { money: 'rial', edition: 'full', loaded: false, settings: null };
export async function booksPrefs(force = false) {
  if (prefs.loaded && !force) return prefs;
  try {
    const s = await api('/api/books/settings');
    Object.assign(prefs, { money: s.money === 'toman' ? 'toman' : 'rial', edition: s.edition === 'base' ? 'base' : 'full', settings: s, loaded: true });
  } catch {
    /* keep defaults */
  }
  return prefs;
}
/** Money as the shop reads it (rial by default); T without the unit word, TU with it. */
export const T = (rial) => fmtMoney(rial, prefs.money, { unit: false });
export const TU = (rial) => fmtMoney(rial, prefs.money);
export const R = (rial) => fmtMoney(rial, 'rial');
export const unitName = () => (prefs.money === 'rial' ? 'ریال' : 'تومان');
/** Stored toman inputs of the full edition ↔ what the operator types (×10 in rial mode). */
export const K = () => (prefs.money === 'rial' ? 10 : 1);
/** An export cell in the display unit. */
export const EX = (rial) => (prefs.money === 'rial' ? rial : rial / 10);
export const moneyWords = (rial) => `${words(prefs.money === 'rial' ? rial : rial / 10)} ${unitName()}`;
export const G = fmtG;
export const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran' }).format(new Date());
export const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
/** ISO day → «۱۴۰۵/۰۷/۰۶». */
export function jd(iso) {
  if (!iso) return '—';
  const [y, m, d] = jalaliOf(iso.slice(0, 10));
  return faNum(`${y}/${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}`);
}
export const jdLong = (iso) => {
  const [y, m, d] = jalaliOf(iso.slice(0, 10));
  return faNum(`${d} ${JALALI_MONTHS[m - 1]} ${y}`);
};
export const jdInput = (iso) => (iso ? jd(iso) : '');
/** A date typed as Jalali (۱۴۰۵/۷/۶) or Gregorian → ISO day, or null. */
export const parseDay = (v) => isoDay(String(v ?? '').trim());
export const timeFa = (isoTs) => (isoTs ? new Date(isoTs).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tehran' }) : '');

/* ---------------- exports ---------------- */
export function download(name, mime, content) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  setTimeout(() => (URL.revokeObjectURL(a.href), a.remove()), 1000);
}
const cell = (v) => (v == null ? '' : typeof v === 'number' ? v : String(v));
/** CSV in UTF-8 with a BOM so Excel opens Persian text correctly. cols: [[key|fn, title]] */
export function toCsv(rows, cols) {
  const q = (v) => {
    const s = String(cell(v));
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [cols.map(([, t]) => q(t)).join(','), ...rows.map((r) => cols.map(([k]) => q(typeof k === 'function' ? k(r) : r[k])).join(','))];
  return `﻿${lines.join('\r\n')}`;
}
/** Excel workbook (SpreadsheetML 2003): opens in Excel and LibreOffice with right-to-left sheet and number cells. */
export function toXls(rows, cols, title = 'گزارش') {
  const x = (s) => esc(String(s)).replace(/\n/g, '&#10;');
  const row = (vals, style) => `<Row>${vals.map((v) => (typeof v === 'number' && Number.isFinite(v) ? `<Cell${style ? ` ss:StyleID="${style}"` : ''}><Data ss:Type="Number">${v}</Data></Cell>` : `<Cell${style ? ` ss:StyleID="${style}"` : ''}><Data ss:Type="String">${x(cell(v))}</Data></Cell>`)).join('')}</Row>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet" xmlns:x="urn:schemas-microsoft-com:office:excel">
<Styles><Style ss:ID="h"><Font ss:Bold="1"/><Interior ss:Color="#F0E2BE" ss:Pattern="Solid"/></Style></Styles>
<Worksheet ss:Name="${x(title).slice(0, 30)}"><Table>
${row(cols.map(([, t]) => t), 'h')}
${rows.map((r) => row(cols.map(([k]) => (typeof k === 'function' ? k(r) : r[k])))).join('\n')}
</Table><WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><DisplayRightToLeft/><FreezePanes/><FrozenNoSplit/><SplitHorizontal>1</SplitHorizontal><TopRowBottomPane>1</TopRowBottomPane></WorksheetOptions></Worksheet>
</Workbook>`;
}
/** Export menu: the same rows as CSV, Excel, JSON or print. */
export function exportButtons(prefix = 'exp') {
  return html`<div class="bk-export" role="group" aria-label="خروجی"><span class="small">خروجی:</span><button class="chip" data-act="${prefix}-xls">اکسل</button><button class="chip" data-act="${prefix}-csv">CSV</button><button class="chip" data-act="${prefix}-json">JSON</button><button class="chip" data-act="${prefix}-print">چاپ / PDF</button></div>`;
}
export function wireExport(map, prefix, name, getRows, cols, title) {
  map[`${prefix}-xls`] = () => download(`${name}.xls`, 'application/vnd.ms-excel', toXls(getRows(), cols, title));
  map[`${prefix}-csv`] = () => download(`${name}.csv`, 'text/csv;charset=utf-8', toCsv(getRows(), cols));
  map[`${prefix}-json`] = () => download(`${name}.json`, 'application/json', JSON.stringify(getRows(), null, 2));
  map[`${prefix}-print`] = () => window.print();
}

/* ---------------- modal ---------------- */
export function modal(inner, wire, onClose) {
  const m = document.createElement('div');
  m.className = 'modal';
  m.innerHTML = `<div class="tray" role="dialog" aria-modal="true">${inner}</div>`;
  let open = true;
  const close = () => {
    if (!open) return;
    open = false;
    m.remove();
    document.removeEventListener('keydown', onKey);
    onClose?.();
  };
  const onKey = (e) => e.key === 'Escape' && close();
  document.addEventListener('keydown', onKey);
  m.addEventListener('click', (e) => {
    if (e.target === m || e.target.closest('[data-close]')) close();
  });
  document.body.append(m);
  wire?.(m, close);
  $('input:not([type=hidden]), select, textarea', m)?.focus();
  return close;
}
/** Resolves true (or the typed reason) on confirm, false on cancel. */
export const confirmBox = (title, body, { danger = false, reason = false, ok = 'تأیید' } = {}) =>
  new Promise((resolve) => {
    let result = false;
    modal(
      String(html`<h3 class="bk-h">${title}</h3><p class="small">${body}</p>${reason ? html`<label class="field">دلیل (در تاریخچه سند می‌ماند)<input class="input" name="reason" maxlength="300"></label>` : ''}<div class="actions"><button class="btn ${danger ? 'danger' : ''}" data-ok>${ok}</button><button class="btn ghost" data-close>انصراف</button></div>`),
      (m, close) =>
        m.querySelector('[data-ok]').addEventListener('click', () => {
          const r = m.querySelector('[name=reason]')?.value.trim() ?? '';
          if (reason && r.length < 3) return m.querySelector('[name=reason]').focus();
          result = reason ? r : true;
          close();
        }),
      () => resolve(result),
    );
  });

export const statusChip = (s) => raw(`<span class="bk-st ${s}">${{ draft: 'پیش‌نویس', final: 'قطعی', void: 'باطل' }[s] ?? s}</span>`);
/** A customer-account unit in words, and an amount of it. */
export const unitLabel = (u) => (u === 'IRR' ? unitName() : u === 'G750' ? 'گرم طلای ۷۵۰' : u.startsWith('COIN:') ? (COIN_TYPES[u.slice(5)]?.short ?? u) : u.startsWith('FX:') ? (FX_CODES[u.slice(3)] ?? u) : u.startsWith('BAR:') ? `شمش ${fa(u.slice(4))}` : u);
export const unitVal = (u, v) => (u === 'IRR' ? T(v) : u === 'G750' ? G(v) : u.startsWith('FX:') ? faNum(v.toLocaleString('en-US', { maximumFractionDigits: 2 })).replace(/,/g, '٬').replace('.', '٫') : fa(v));
export const unitAmt = (u, v) => (u === 'IRR' ? TU(v) : u === 'G750' ? `${G(v)} گرم ۷۵۰` : u.startsWith('COIN:') ? `${fa(v)} ${unitLabel(u)}` : u.startsWith('FX:') ? `${unitVal(u, v)} ${unitLabel(u)}` : unitLabel(u));
const UNIT_ORDER = (u) => (u === 'IRR' ? 0 : u === 'G750' ? 1 : u.startsWith('COIN:') ? 2 : u.startsWith('FX:') ? 3 : 4);
export const balUnits = (b) => Object.keys(b ?? {}).filter((u) => b[u]).sort((a, c) => UNIT_ORDER(a) - UNIT_ORDER(c));
/** Every balance of a customer as words: «بدهکار ۲٬۰۰۰٬۰۰۰ ریال · بستانکار ۱٫۹۷۳ گرم ۷۵۰ · …». */
export const balText = (b) => {
  const parts = balUnits(b).map((u) => (u.startsWith('BAR:') ? `${b[u] < 0 ? 'امانت نزد ما' : 'بدهکار'}: ${unitLabel(u)}` : `${b[u] > 0 ? 'بدهکار' : 'بستانکار'} ${unitAmt(u, Math.abs(b[u]))}`));
  return parts.length ? parts.join(' · ') : 'بی‌حساب';
};
/** Balance chips (one per unit), coloured by who owes whom. */
export const balChips = (b) => html`<span class="bk-chips">${balUnits(b).map((u) => html`<span class="bk-bchip ${b[u] > 0 ? 'debt' : 'cred'}" data-unit="${u}"><small>${unitLabel(u)} · ${u.startsWith('BAR:') ? (b[u] > 0 ? 'نزد مشتری' : 'امانت نزد ما') : b[u] > 0 ? 'بدهکار' : 'بستانکار'}</small><b>${u.startsWith('BAR:') ? '۱ عدد' : unitVal(u, Math.abs(b[u]))}</b></span>`)}${balUnits(b).length ? '' : html`<span class="bk-bchip zero"><b>بی‌حساب</b></span>`}</span>`;
/** A trade line in words: «۲٫۰۰۰ گرم · عیار ۷۴۰ · معادل ۷۵۰: ۱٫۹۷۳ · مثقال: ۰٫۴۵۶ · مظنه …». */
export function describeLine(l) {
  const bits = [];
  if (l.kind === 'melt' || l.kind === 'bar') {
    if (l.kind === 'bar') bits.push(`سریال ${fa(l.serial)}`);
    bits.push(`${G(l.weight)} گرم`, `عیار ${fa(l.fineness)}`, `معادل ۷۵۰: ${G(l.eq750)}`, `مثقال: ${G(l.mesghal)}`);
    if (l.priced && l.mazaneh) bits.push(`مظنه ${R(l.mazaneh).replace(' ریال', '')}`);
    else if (l.priced && l.g750Price) bits.push(`گرم ۷۵۰ ${R(l.g750Price).replace(' ریال', '')}`);
    else if (l.priced && l.impliedMazaneh) bits.push(`مظنه معادل ${R(l.impliedMazaneh).replace(' ریال', '')}`);
    if (l.fee) bits.push(`اجرت پلمپ ${R(l.fee)}`);
  } else if (l.kind === 'coin') bits.push(`${fa(l.count)} عدد ${COIN_TYPES[l.coin]?.short ?? l.coin}`);
  else if (l.kind === 'fx') bits.push(`${unitVal(l.unit, l.amt)} ${FX_CODES[l.code] ?? l.code}`);
  return bits.join(' · ');
}
export const lineVerb = (l) => (l.priced ? (l.dir === 'in' ? 'خرید از مشتری' : 'فروش به مشتری') : l.dir === 'in' ? 'دریافت جنس' : 'تحویل جنس');
export const balClass = (b) => (balUnits(b).some((u) => b[u] > 0) ? 'debt' : balUnits(b).some((u) => b[u] < 0) ? 'cred' : '');
