// Shared helpers of the shop-books screens: Jalali dates, money display, exports (CSV, Excel, JSON), a modal.
import { html, raw, esc, fa, $ } from './core.mjs';
import { fmtRial, fmtG, faNum } from './books.mjs';
import { jalaliOf, isoDay, JALALI_MONTHS } from './ta.mjs';

export const T = (rial) => fmtRial(rial, { unit: false });
export const TU = (rial) => fmtRial(rial);
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
export const unitAmt = (unit, v) => (unit === 'IRR' ? TU(v) : unit === 'G750' ? `${G(v)} گرم ۷۵۰` : `${fa(v)} ${unit.startsWith('COIN:') ? 'عدد' : ''}`);
export const balText = (b) => {
  const parts = [];
  if (b?.IRR) parts.push(`${b.IRR > 0 ? 'بدهکار' : 'بستانکار'} ${TU(Math.abs(b.IRR))}`);
  if (b?.G750) parts.push(`${b.G750 > 0 ? 'بدهکار' : 'بستانکار'} ${G(Math.abs(b.G750))} گرم`);
  return parts.length ? parts.join(' · ') : 'بی‌حساب';
};
export const balClass = (b) => (b?.IRR > 0 || b?.G750 > 0 ? 'debt' : b?.IRR < 0 || b?.G750 < 0 ? 'cred' : '');
