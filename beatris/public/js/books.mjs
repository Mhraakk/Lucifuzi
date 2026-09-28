// Shop books (دفتر فروشگاه): the pure, shared arithmetic of a gold shop's documents. Browser, server and tests
// use this one module, so a price seen at the counter, a printed invoice and a report agree to the last rial.
//
// Units: every stored money amount is an integer number of RIALS (the unit of the tax system); screens show
// toman (rial ÷ 10). Weights in grams (3 decimals), fineness per mille (750 = 18 k). Prices typed by staff are
// toman: p750 = toman per gram of 750 gold, mazaneh = toman per mesghal of 705 gold.
//
// Official rules applied (VAT law 1400 art. 26 note; budget law 1405; tax-system field rules for pattern 3):
//  · the principal of gold, jewels and platinum is VAT-exempt; VAT (10 % in 1405) applies only to the making
//    charge (اجرت ساخت), the seller's profit (سود فروشنده) and the commission (حق‌العمل);
//  · the tax system rejects decimals in اجرت ساخت and in «جمع کل اجرت، حق‌العمل و سود», so each is an integer rial;
//  · seller's profit is a percentage of (gold value + making charge), the market convention;
//  · a line discount reduces the taxable part (profit first, then making charge), never the gold value;
//  · buying used gold from a customer is a purchase, not a sale: no VAT, and it is not sent as a sale invoice.
import { MAZANEH_FINENESS, MESGHAL_G } from './calc.mjs';
import { COIN_TYPES } from './coins.mjs';
import { calcTrade, tradePostings, TRADE_DOCS } from './trade.mjs';

/* ---------------- numbers ---------------- */
const FA = '۰۱۲۳۴۵۶۷۸۹';
const AR = '٠١٢٣٤٥٦٧٨٩';
/** Parse user input: Persian/Arabic digits, thousands separators, Persian decimal mark. NaN when empty/invalid. */
export function num(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  const s = String(v ?? '')
    .replace(/[۰-۹]/g, (d) => String(FA.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String(AR.indexOf(d)))
    .replace(/٫/g, '.')
    .replace(/[−–]/g, '-')
    .replace(/[,٬،\s]/g, '');
  return s === '' || !/^-?\d*\.?\d*$/.test(s) ? NaN : Number(s);
}
export const digitsOnly = (v) =>
  String(v ?? '')
    .replace(/[۰-۹]/g, (d) => String(FA.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String(AR.indexOf(d)))
    .replace(/\D/g, '');
/** Round half away from zero (Math.round rounds −0.5 up, which would make refunds differ from sales by a rial). */
export const rnd = (x) => Math.sign(x) * Math.round(Math.abs(x));
export const r3 = (x) => rnd(x * 1000) / 1000;
export const toRial = (toman) => rnd(num(toman) * 10);
export const toToman = (rial) => rial / 10;

/* ---------------- identifiers (official check digits) ---------------- */
/** Iranian national code (کد ملی), 10 digits with a mod-11 check digit. */
export function validNationalCode(v) {
  const d = digitsOnly(v);
  if (!/^\d{10}$/.test(d) || /^(\d)\1{9}$/.test(d)) return false;
  let s = 0;
  for (let i = 0; i < 9; i++) s += Number(d[i]) * (10 - i);
  const r = s % 11;
  return Number(d[9]) === (r < 2 ? r : 11 - r);
}
/** Legal-entity national ID (شناسه ملی اشخاص حقوقی), 11 digits. */
export function validNationalId(v) {
  const d = digitsOnly(v);
  if (!/^\d{11}$/.test(d) || /^0+$/.test(d.slice(3, 9))) return false;
  const k = Number(d[9]) + 2;
  const coef = [29, 27, 23, 19, 17];
  let s = 0;
  for (let i = 0; i < 10; i++) s += (Number(d[i]) + k) * coef[i % 5];
  let r = s % 11;
  if (r === 10) r = 0;
  return r === Number(d[10]) && !/^0+$/.test(d);
}
/** Bank card number: 16 digits with the Luhn check. */
export function validCard(v) {
  const d = digitsOnly(v);
  if (!/^\d{16}$/.test(d)) return false;
  let s = 0;
  for (let i = 0; i < 16; i++) {
    let x = Number(d[i]);
    if (i % 2 === 0) {
      x *= 2;
      if (x > 9) x -= 9;
    }
    s += x;
  }
  return s % 10 === 0;
}
/** IBAN (شبا): IR + 24 digits, ISO 7064 mod 97 = 1. */
export function validSheba(v) {
  const t = String(v ?? '').toUpperCase().replace(/\s/g, '');
  const d = digitsOnly(t);
  const s = /^IR/.test(t) ? t : `IR${d}`;
  if (!/^IR\d{24}$/.test(s)) return false;
  const moved = s.slice(4) + '1827' + s.slice(2, 4); // I=18, R=27
  let r = 0;
  for (const c of moved) r = (r * 10 + Number(c)) % 97;
  return r === 1;
}
export const validMobile = (v) => /^09\d{9}$/.test(normalizeMobile(v));
export function normalizeMobile(v) {
  const d = digitsOnly(v);
  if (/^9809\d{9}$/.test(d)) return d.slice(2);
  if (/^989\d{9}$/.test(d)) return `0${d.slice(2)}`;
  if (/^9\d{9}$/.test(d)) return `0${d}`;
  return d;
}
export const validPostal = (v) => /^\d{10}$/.test(digitsOnly(v));
export const validSayad = (v) => /^\d{16}$/.test(digitsOnly(v));
/** Economic number (شماره اقتصادی): the national code (10), national ID (11) or the 14-digit number. */
export const validEconomic = (v) => /^(\d{10}|\d{11}|\d{12}|\d{14})$/.test(digitsOnly(v));

/* ---------------- tax-system unique invoice number (شماره منحصربه‌فرد مالیاتی) ---------------- */
const VD = [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5], [2, 3, 4, 0, 1, 7, 8, 9, 5, 6], [3, 4, 0, 1, 2, 8, 9, 5, 6, 7], [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1], [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3], [8, 7, 6, 5, 9, 3, 2, 1, 0, 4], [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]];
const VP = [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4], [5, 8, 0, 3, 7, 9, 6, 1, 4, 2], [8, 9, 1, 6, 0, 4, 3, 5, 2, 7], [9, 4, 5, 3, 1, 2, 6, 8, 7, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1], [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8]];
const VINV = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9];
export function verhoeff(numStr) {
  let c = 0;
  const n = numStr.length;
  for (let i = 0; i < n; i++) c = VD[c][VP[(i + 1) % 8][Number(numStr[n - i - 1])]];
  return VINV[c];
}
export function verhoeffValid(numStr) {
  let c = 0;
  const n = numStr.length;
  for (let i = 0; i < n; i++) c = VD[c][VP[i % 8][Number(numStr[n - i - 1])]];
  return c === 0;
}
export const validMemoryId = (v) => /^[A-Z0-9]{6}$/.test(String(v ?? ''));
/**
 * 22 characters: memory ID (6) + days since 1970-01-01 in hex (5) + serial in hex (10) + Verhoeff digit, whose
 * control text is the memory ID with letters as their char codes + days (6 digits) + serial (12 digits).
 */
export function taxId(memoryId, when, serial) {
  if (!validMemoryId(memoryId)) throw new Error('شناسه حافظه مالیاتی باید ۶ حرف/رقم لاتین بزرگ باشد.');
  if (!(Number.isInteger(serial) && serial >= 0 && serial < 0xffffffffff)) throw new Error('سریال نامعتبر است.');
  const days = Math.floor(new Date(when).getTime() / 86400000);
  const control = memoryId.split('').map((ch) => (/\d/.test(ch) ? ch : String(ch.charCodeAt(0)))).join('') + String(days).padStart(6, '0') + String(serial).padStart(12, '0');
  return `${memoryId}${days.toString(16).padStart(5, '0')}${serial.toString(16).padStart(10, '0')}${verhoeff(control)}`.toUpperCase();
}
export function taxIdValid(id) {
  const t = String(id ?? '').toUpperCase();
  if (!/^[A-Z0-9]{6}[0-9A-F]{15}\d$/.test(t)) return false;
  const days = parseInt(t.slice(6, 11), 16), serial = parseInt(t.slice(11, 21), 16);
  const control = t.slice(0, 6).split('').map((ch) => (/\d/.test(ch) ? ch : String(ch.charCodeAt(0)))).join('') + String(days).padStart(6, '0') + String(serial).padStart(12, '0');
  return verhoeff(control) === Number(t[21]);
}

/* ---------------- catalogue of product templates (قالب‌های کالا) ---------------- */
// Default making charges are the shop's starting points, not official rates: the owner edits them per template.
export const TEMPLATE_GROUPS = [
  { id: 'ring', label: 'انگشتر و حلقه' },
  { id: 'neck', label: 'گردن' },
  { id: 'chain', label: 'زنجیر' },
  { id: 'wrist', label: 'دست' },
  { id: 'ear', label: 'گوشواره' },
  { id: 'set', label: 'سرویس و ست' },
  { id: 'kids', label: 'نوزاد و کودک' },
  { id: 'misc', label: 'سایر زیورآلات' },
  { id: 'invest', label: 'سرمایه‌ای' },
  { id: 'service', label: 'خدمات' },
  { id: 'goods', label: 'کالای غیرطلا' },
];
const J = (id, group, label, ojrat, extra = {}) => ({ id, group, label, kind: 'jewel', ojratMode: 'pct', ojrat, profitPct: 7, ...extra });
export const TEMPLATES = [
  J('ring-w', 'ring', 'انگشتر زنانه', 18),
  J('ring-m', 'ring', 'انگشتر مردانه', 15),
  J('ring-sol', 'ring', 'انگشتر سولیتر', 22),
  J('ring-band', 'ring', 'حلقه ازدواج', 12),
  J('ring-rink', 'ring', 'رینگ', 14),
  J('ring-chev', 'ring', 'انگشتر فری‌سایز / زنجیری', 16),
  J('ring-sig', 'ring', 'انگشتر شرف‌الشمس / نگین‌دار', 18),
  J('nk', 'neck', 'گردنبند', 16),
  J('nk-name', 'neck', 'گردنبند اسم', 25),
  J('nk-pend', 'neck', 'آویز', 18),
  J('nk-plak', 'neck', 'پلاک', 15),
  J('nk-medal', 'neck', 'مدال', 12),
  J('nk-choker', 'neck', 'چوکر', 18),
  J('nk-rivi', 'neck', 'گردنبند ریویرا / سنگ‌دار', 22),
  J('ch-cartier', 'chain', 'زنجیر کارتیه', 9),
  J('ch-venice', 'chain', 'زنجیر ونیزی', 9),
  J('ch-rope', 'chain', 'زنجیر طنابی', 10),
  J('ch-hasiri', 'chain', 'زنجیر حصیری', 11),
  J('ch-figaro', 'chain', 'زنجیر فیگارو', 9),
  J('ch-kati', 'chain', 'زنجیر کتی (کاتنی)', 8),
  J('ch-disco', 'chain', 'زنجیر دیسکو', 10),
  J('ch-tiffany', 'chain', 'زنجیر تیفانی', 12),
  J('ch-balls', 'chain', 'زنجیر گوی (بلبرینگی)', 10),
  J('ch-it', 'chain', 'زنجیر ایتالیایی', 14),
  J('br', 'wrist', 'دستبند', 14),
  J('br-bangle', 'wrist', 'النگو', 6),
  J('br-bangle-cnc', 'wrist', 'النگو CNC / مشبک', 9),
  J('br-cuff', 'wrist', 'بنگل', 12),
  J('br-leather', 'wrist', 'دستبند چرم و طلا', 20, { ojratMode: 'fixed', ojrat: 0 }),
  J('br-watch', 'wrist', 'ساعت طلا', 12),
  J('br-arm', 'wrist', 'بازوبند', 14),
  J('er-drop', 'ear', 'گوشواره آویز', 18),
  J('er-stud', 'ear', 'گوشواره میخی', 20),
  J('er-hoop', 'ear', 'گوشواره حلقه‌ای', 15),
  J('er-cuff', 'ear', 'ایرکاف', 20),
  J('set-full', 'set', 'سرویس کامل', 18),
  J('set-half', 'set', 'نیم‌ست', 18),
  J('set-bride', 'set', 'سرویس عروس', 20),
  J('kid-bangle', 'kids', 'النگو بچه', 10),
  J('kid-plak', 'kids', 'پلاک نوزادی (وان‌یکاد)', 18),
  J('kid-br', 'kids', 'دستبند نوزاد', 15),
  J('kid-pin', 'kids', 'سنجاق نوزادی', 18),
  J('mi-anklet', 'misc', 'پابند', 12),
  J('mi-brooch', 'misc', 'سنجاق سینه / گل سینه', 18),
  J('mi-cuff', 'misc', 'دکمه سردست', 15),
  J('mi-tie', 'misc', 'گیره کراوات', 15),
  J('mi-tiara', 'misc', 'تاج', 25),
  J('mi-tasbih', 'misc', 'تسبیح', 12),
  J('mi-key', 'misc', 'جاسوییچی', 12),
  J('mi-pierce', 'misc', 'پیرسینگ', 20),
  J('mi-quran', 'misc', 'قاب و زینتی', 15),
  J('mi-statue', 'misc', 'تندیس و مجسمه', 15),
  J('mi-gem', 'misc', 'جواهر (پایه و سنگ)', 20),
  J('inv-bar', 'invest', 'شمش', 0, { profitPct: 0 }),
  { id: 'inv-melt', group: 'invest', label: 'آب‌شده', kind: 'melt' },
  { id: 'inv-used', group: 'invest', label: 'طلای مستعمل (خرید از مشتری)', kind: 'used' },
  ...Object.entries(COIN_TYPES).map(([id, c]) => ({ id: `coin-${id}`, group: 'invest', label: c.label, kind: 'coin', coin: id })),
  { id: 'sv-repair', group: 'service', label: 'تعمیر', kind: 'service' },
  { id: 'sv-engrave', group: 'service', label: 'حکاکی', kind: 'service' },
  { id: 'sv-plate', group: 'service', label: 'آبکاری / رودیوم', kind: 'service' },
  { id: 'sv-resize', group: 'service', label: 'تغییر سایز', kind: 'service' },
  { id: 'sv-setting', group: 'service', label: 'سنگ‌گذاری', kind: 'service' },
  { id: 'gd-silver', group: 'goods', label: 'نقره', kind: 'goods', vatPct: 10 },
  { id: 'gd-watch', group: 'goods', label: 'ساعت (غیرطلا)', kind: 'goods', vatPct: 10 },
  { id: 'gd-box', group: 'goods', label: 'جعبه و بسته‌بندی', kind: 'goods', vatPct: 10 },
  { id: 'gd-other', group: 'goods', label: 'سایر کالا', kind: 'goods', vatPct: 10 },
];
export const templateById = (id) => TEMPLATES.find((t) => t.id === id) ?? null;
/** Apply the owner's overrides ({ [templateId]: { ojratMode, ojrat, profitPct, hidden } }) to the catalogue. */
export const templatesWith = (over = {}) => TEMPLATES.map((t) => ({ ...t, ...(over[t.id] ?? {}) }));

/* ---------------- document types, payment methods ---------------- */
export const DOC_TYPES = {
  sale: { label: 'فاکتور فروش', short: 'فروش', sign: 1, prefix: 'S' },
  buy: { label: 'فاکتور خرید از مشتری', short: 'خرید', sign: -1, prefix: 'B' },
  return: { label: 'برگشت از فروش', short: 'برگشت', sign: -1, prefix: 'R' },
  proforma: { label: 'پیش‌فاکتور', short: 'پیش‌فاکتور', sign: 1, prefix: 'P' },
  receipt: { label: 'رسید دریافت', short: 'دریافت', sign: -1, prefix: 'D' },
  payment: { label: 'رسید پرداخت', short: 'پرداخت', sign: 1, prefix: 'Y' },
  expense: { label: 'سند هزینه', short: 'هزینه', sign: 1, prefix: 'E' },
  transfer: { label: 'انتقال بین صندوق و بانک', short: 'انتقال', sign: 0, prefix: 'T' },
  opening: { label: 'سند افتتاحیه (مانده اول دوره)', short: 'افتتاحیه', sign: 0, prefix: 'O' },
  trade: { label: 'سند معامله (سکه، آبشده، شمش، ارز)', short: 'معامله', sign: 0, prefix: 'M', base: true },
  hawala: { label: 'حواله بین طرف حساب‌ها', short: 'حواله', sign: 0, prefix: 'H', base: true },
  convert: { label: 'تبدیل مانده جنسی به ریال', short: 'تبدیل', sign: 0, prefix: 'C', base: true },
};
// pmt = روش پرداخت in the tax system: 1 چک، 2 تهاتر، 3 وجه نقد، 4 POS، 5 درگاه اینترنتی، 6 کارت به کارت، 7 انتقال به حساب، 8 سایر
export const PAY_METHODS = [
  { id: 'cash', label: 'نقد', pmt: 3, acct: 'cash' },
  { id: 'pos', label: 'کارتخوان', pmt: 4, acct: 'bank', ref: true },
  { id: 'c2c', label: 'کارت به کارت', pmt: 6, acct: 'bank', ref: true, card: true },
  { id: 'satna', label: 'ساتنا', pmt: 7, acct: 'bank', ref: true, sheba: true },
  { id: 'paya', label: 'پایا', pmt: 7, acct: 'bank', ref: true, sheba: true },
  { id: 'pol', label: 'پل', pmt: 7, acct: 'bank', ref: true, sheba: true },
  { id: 'havale', label: 'حواله / انتقال درون‌بانکی', pmt: 7, acct: 'bank', ref: true },
  { id: 'slip', label: 'فیش بانکی (واریز)', pmt: 7, acct: 'bank', ref: true },
  { id: 'a2a', label: 'حساب به حساب', pmt: 7, acct: 'bank', ref: true },
  { id: 'gateway', label: 'درگاه اینترنتی', pmt: 5, acct: 'bank', ref: true },
  { id: 'cheque', label: 'چک', pmt: 1, acct: 'cheque' },
  { id: 'gold', label: 'طلا (تسویه طلایی)', pmt: 2, acct: 'gold' },
  { id: 'coin', label: 'سکه', pmt: 2, acct: 'coin' },
  { id: 'bnpl', label: 'اعتباری / اقساطی (اسنپ‌پی، دیجی‌پی…)', pmt: 8, acct: 'bank', ref: true },
  { id: 'fx', label: 'ارز', pmt: 8, acct: 'cash' },
  { id: 'offset', label: 'تهاتر با مانده مشتری', pmt: 2, acct: 'party' },
];
export const payMethod = (id) => PAY_METHODS.find((m) => m.id === id) ?? null;
export const CHEQUE_STATUS = { hand: 'نزد صندوق', deposited: 'واگذار به بانک', cleared: 'وصول‌شده', bounced: 'برگشتی', returned: 'عودت به صادرکننده', spent: 'خرج‌شده', issued: 'صادره (پرداختنی)', paid: 'پاس‌شده (صادره)' };
export const UNITS = { IRR: 'ریال', G750: 'گرم طلای ۷۵۰', ...Object.fromEntries(Object.entries(COIN_TYPES).map(([id, c]) => [`COIN:${id}`, `عدد ${c.short}`])) };

/* ---------------- line arithmetic ---------------- */
export class BookError extends Error {}
const need = (cond, msg) => {
  if (!cond) throw new BookError(msg);
};
const pos = (v, label, { zero = false, max = 1e7 } = {}) => {
  const x = num(v);
  need(Number.isFinite(x) && (zero ? x >= 0 : x > 0) && x <= max, `${label} نامعتبر است.`);
  return x;
};
const opt = (v, d = 0) => (v === undefined || v === null || v === '' ? d : num(v));
const fin = (v, label) => {
  const f = pos(v, `عیار ${label}`, { max: 1000 });
  need(f >= 1, `عیار ${label} باید بین ۱ تا ۱۰۰۰ باشد.`);
  return f;
};

/** Rial price of one gram at a fineness from the toman price of one gram of 750. */
export const feePerGram = (p750, fineness) => rnd((num(p750) * 10 * num(fineness)) / 750);
/** Molten gold, the ledger's order: 750-equivalent rounded to 3 decimals, priced, rounded to 1000 toman. */
export const meltValueRial = (w, fineness, mazaneh) => {
  const eq = r3((num(w) * num(fineness)) / 750);
  const g18 = (num(mazaneh) * 750) / (MESGHAL_G * MAZANEH_FINENESS);
  return Math.round((eq * g18) / 1000) * 10000;
};

/**
 * One line of a document. side: 'out' = the shop gives it (a sale), 'in' = the shop receives it (a purchase or
 * trade-in). Returns integer rials and the stock movement. Throws BookError with a Persian message on bad input.
 */
export function calcLine(line, { vatPct = 10 } = {}) {
  const kind = line.kind;
  const side = line.side === 'in' ? 'in' : 'out';
  const o = { kind, side, principal: 0, consfee: 0, spro: 0, bros: 0, tcpbs: 0, vat: 0, vra: 0, stones: 0, discount: 0, total: 0, g750: 0, coin: null, count: 0, weight: 0, fineness: 0, fee: 0, am: 0 };
  const vatRate = opt(line.vatPct, vatPct);
  need(vatRate >= 0 && vatRate <= 100, 'نرخ مالیات نامعتبر است.');
  if (kind === 'jewel') {
    need(side === 'out', 'کارساخته فقط فروخته می‌شود؛ خرید آن را «طلای مستعمل» ثبت کنید.');
    const w = pos(line.weight, 'وزن', { max: 1e5 });
    const f = fin(line.fineness ?? 750, 'کالا');
    const p750 = pos(line.p750, 'قیمت هر گرم ۱۸ عیار', { max: 1e11 });
    o.weight = r3(w);
    o.fineness = f;
    o.fee = feePerGram(p750, f);
    o.am = o.weight;
    o.principal = rnd(o.weight * o.fee);
    const mode = line.ojratMode ?? 'pct';
    const oj = opt(line.ojrat, 0);
    need(Number.isFinite(oj) && oj >= 0, 'اجرت نامعتبر است.');
    if (mode === 'pct') {
      need(oj <= 300, 'درصد اجرت بیش از ۳۰۰٪ است.');
      o.consfee = rnd((o.principal * oj) / 100);
    } else if (mode === 'gram') o.consfee = rnd(o.weight * oj * 10);
    else if (mode === 'fixed') o.consfee = rnd(oj * 10);
    else throw new BookError('نوع اجرت نامعتبر است.');
    const pp = opt(line.profitPct, 7);
    need(Number.isFinite(pp) && pp >= 0 && pp <= 100, 'درصد سود نامعتبر است.');
    o.spro = rnd(((o.principal + o.consfee) * pp) / 100);
    o.bros = rnd(opt(line.bros, 0) * 10);
    need(o.bros >= 0, 'حق‌العمل نامعتبر است.');
    o.stones = rnd(opt(line.stones, 0) * 10);
    need(o.stones >= 0, 'مبلغ سنگ نامعتبر است.');
    o.discount = rnd(opt(line.discount, 0) * 10);
    need(o.discount >= 0, 'تخفیف نامعتبر است.');
    need(o.discount <= o.spro + o.consfee, 'تخفیف بیش از اجرت و سود است؛ ارزش طلا را نمی‌توان تخفیف داد.');
    const fromProfit = Math.min(o.discount, o.spro);
    o.spro -= fromProfit;
    o.consfee -= o.discount - fromProfit;
    o.tcpbs = o.consfee + o.spro + o.bros;
    o.vra = vatRate;
    o.vat = rnd((o.tcpbs * vatRate) / 100);
    o.total = o.principal + o.stones + o.tcpbs + o.vat;
  } else if (kind === 'coin') {
    const c = COIN_TYPES[line.coin];
    need(c, 'نوع سکه نامعتبر است.');
    const n = pos(line.count, 'تعداد سکه', { max: 1e6 });
    need(Number.isInteger(n), 'تعداد سکه باید عدد صحیح باشد.');
    const price = pos(line.price, 'قیمت هر سکه', { max: 1e11 });
    o.coin = line.coin;
    o.count = n;
    o.am = n;
    o.fee = rnd(price * 10);
    o.principal = n * o.fee;
    o.total = o.principal;
  } else if (kind === 'melt') {
    const w = pos(line.weight, 'وزن', { max: 1e6 });
    const f = fin(line.fineness, 'آب‌شده');
    const maz = pos(line.mazaneh, 'مظنه', { max: 1e12 });
    o.weight = r3(w);
    o.fineness = f;
    o.am = o.weight;
    o.principal = meltValueRial(o.weight, f, maz);
    o.fee = o.weight ? rnd(o.principal / o.weight) : 0;
    o.g750 = r3((o.weight * f) / 750);
    o.total = o.principal;
  } else if (kind === 'used') {
    need(side === 'in', 'طلای مستعمل فقط خریده می‌شود.');
    const w = pos(line.weight, 'وزن', { max: 1e6 });
    const sw = opt(line.stoneWeight, 0);
    need(Number.isFinite(sw) && sw >= 0 && sw < w, 'وزن سنگ باید کمتر از وزن کل باشد.');
    const f = fin(line.fineness ?? 750, 'ری‌گیری');
    const p750 = pos(line.p750, 'قیمت خرید هر گرم ۱۸', { max: 1e11 });
    const ded = opt(line.deductPct, 0);
    need(Number.isFinite(ded) && ded >= 0 && ded < 100, 'درصد کسر نامعتبر است.');
    o.weight = r3(w - sw);
    o.fineness = f;
    o.am = o.weight;
    o.fee = feePerGram(p750, f);
    const gross = rnd(o.weight * o.fee);
    o.discount = rnd((gross * ded) / 100);
    o.principal = gross - o.discount;
    o.g750 = r3((o.weight * f) / 750);
    o.total = o.principal;
  } else if (kind === 'service') {
    const amt = pos(line.amount, 'مبلغ خدمت', { max: 1e11 });
    need(side === 'out', 'خدمت فقط فروخته می‌شود.');
    o.am = 1;
    o.consfee = rnd(amt * 10); // a service is labour: it is the making-charge field of the gold pattern
    o.tcpbs = o.consfee;
    o.vra = vatRate;
    o.vat = rnd((o.tcpbs * vatRate) / 100);
    o.total = o.tcpbs + o.vat;
  } else if (kind === 'goods') {
    const q = pos(line.qty ?? 1, 'تعداد', { max: 1e6 });
    const price = pos(line.price, 'قیمت واحد', { max: 1e11 });
    o.am = q;
    o.fee = rnd(price * 10);
    o.principal = rnd(q * o.fee);
    o.discount = rnd(opt(line.discount, 0) * 10);
    need(o.discount >= 0 && o.discount <= o.principal, 'تخفیف نامعتبر است.');
    o.vra = vatRate;
    o.vat = rnd(((o.principal - o.discount) * vatRate) / 100); // ordinary goods: VAT on the whole price
    o.total = o.principal - o.discount + o.vat;
  } else throw new BookError('نوع ردیف نامعتبر است.');
  return o;
}

/**
 * Round an invoice down to a target total (e.g. the nearest 1000 toman) the lawful way: a discount on the
 * seller's profit (then making charge) of one piece, so VAT falls with it and the gold value is untouched.
 * Returns the discount in toman to put on that line, or null when its taxable part cannot absorb it.
 * docTotal and target are rials; the line is the jewel line that receives the discount.
 */
export function discountForTarget(line, docTotal, target, { vatPct = 10 } = {}) {
  const base = calcLine({ ...line, discount: 0 }, { vatPct });
  if (docTotal <= target) return 0;
  const rest = docTotal - base.total; // the other lines, unchanged
  const room = base.spro + base.consfee;
  // the line total falls by d plus the VAT on d: search around d = gap ÷ (1 + rate) and land exactly on the target (rial steps). VAT rounding skips an occasional value; then the next round
  // figure down is used (step = the rounding unit), so the printed total is always round.
  const step = 10000; // 1000 toman
  for (let k = 0; k < 4; k++) {
    const tg = target - k * step;
    const g = Math.floor((docTotal - tg) / (1 + (base.vra || 0) / 100));
    for (let d = Math.max(0, g - 3); d <= g + 12 && d <= room; d++) if (rest + calcLine({ ...line, discount: d / 10 }, { vatPct }).total === tg) return d / 10;
  }
  return null;
}

/* ---------------- a whole document ---------------- */
const SALE_KINDS = new Set(['jewel', 'coin', 'melt', 'service', 'goods']);
const BUY_KINDS = new Set(['used', 'melt', 'coin']);

/**
 * Totals of a document from its lines and payments. Sign convention: net > 0 = the party owes the shop.
 * payments: [{ method, dir: 'in'|'out', amount (toman) | grams+fineness+p750 (gold) | coin+count+price (coin) }].
 * The part neither paid nor refunded is credit (نسیه) on the party's account, in rial or in grams of 750.
 */
export function calcDoc(doc, { vatPct = 10, round = 10000 } = {}) {
  const t = DOC_TYPES[doc.type];
  need(t, 'نوع سند نامعتبر است.');
  if (TRADE_DOCS.has(doc.type)) return calcTrade(doc, { round });
  const lines = (doc.lines ?? []).map((l, i) => {
    try {
      const side = doc.type === 'buy' ? 'in' : doc.type === 'return' ? 'out' : l.side === 'in' ? 'in' : 'out';
      if (['sale', 'proforma', 'return'].includes(doc.type)) need(side === 'in' ? BUY_KINDS.has(l.kind) : SALE_KINDS.has(l.kind), 'این نوع کالا در این سند مجاز نیست.');
      if (doc.type === 'buy') need(BUY_KINDS.has(l.kind), 'در سند خرید فقط طلای مستعمل، آب‌شده و سکه مجاز است.');
      return calcLine({ ...l, side }, { vatPct });
    } catch (e) {
      throw e instanceof BookError ? new BookError(`ردیف ${i + 1}: ${e.message}`) : e;
    }
  });
  if (['sale', 'buy', 'return', 'proforma'].includes(doc.type)) need(lines.length, 'سند باید دست‌کم یک ردیف داشته باشد.');
  if (['receipt', 'payment', 'expense', 'transfer'].includes(doc.type)) need(!lines.length, 'این سند ردیف کالا ندارد.');
  const sum = (arr, k) => arr.reduce((s, x) => s + x[k], 0);
  const outL = lines.filter((l) => l.side === 'out'), inL = lines.filter((l) => l.side === 'in');
  const S = {
    principal: sum(outL, 'principal'),
    stones: sum(outL, 'stones'),
    consfee: sum(outL, 'consfee'),
    spro: sum(outL, 'spro'),
    bros: sum(outL, 'bros'),
    tcpbs: sum(outL, 'tcpbs'),
    vat: sum(outL, 'vat'),
    discount: sum(outL, 'discount'),
    sales: sum(outL, 'total'),
    tradeIn: sum(inL, 'total'),
  };
  // the document's value from the party's side (rial): what the shop hands over minus what it takes in
  let net;
  if (doc.type === 'return') net = -S.sales;
  else if (doc.type === 'buy') net = -S.tradeIn;
  else if (['sale', 'proforma'].includes(doc.type)) net = S.sales - S.tradeIn;
  else if (doc.type === 'receipt' || doc.type === 'payment' || doc.type === 'expense') net = 0;
  else net = 0;
  const pays = (doc.payments ?? []).map((p, i) => {
    try {
      return calcPayment(p, doc.type);
    } catch (e) {
      throw e instanceof BookError ? new BookError(`پرداخت ${i + 1}: ${e.message}`) : e;
    }
  });
  if (doc.type === 'proforma') need(!pays.length, 'پیش‌فاکتور پرداخت ندارد.');
  const paidIn = pays.filter((p) => p.dir === 'in').reduce((s, p) => s + p.value, 0);
  const paidOut = pays.filter((p) => p.dir === 'out').reduce((s, p) => s + p.value, 0);
  let credit = 0;
  if (['sale', 'buy', 'return'].includes(doc.type)) credit = net - paidIn + paidOut;
  else if (doc.type === 'receipt') {
    need(paidIn > 0 && paidOut === 0, 'رسید دریافت فقط دریافت دارد.');
    credit = -paidIn; // the party's debt falls
  } else if (doc.type === 'payment') {
    need(paidOut > 0 && paidIn === 0, 'رسید پرداخت فقط پرداخت دارد.');
    credit = paidOut;
  } else if (doc.type === 'expense') {
    need(paidOut > 0 && paidIn === 0, 'هزینه فقط پرداخت دارد.');
    credit = 0;
  } else if (doc.type === 'transfer') {
    need(pays.length === 2 && pays.some((p) => p.dir === 'out') && pays.some((p) => p.dir === 'in'), 'انتقال یک مبدأ و یک مقصد دارد.');
    need(paidIn === paidOut, 'مبلغ مبدأ و مقصد انتقال باید برابر باشد.');
    need(pays.every((p) => ['cash', 'havale', 'satna', 'paya', 'pol'].includes(p.method)), 'انتقال فقط بین صندوق و حساب‌های بانکی (نقد، حواله، ساتنا، پایا، پل) است.');
  }
  const creditUnit = doc.creditUnit === 'G750' ? 'G750' : 'IRR';
  let creditG = 0;
  if (credit && creditUnit === 'G750') {
    const p = pos(doc.creditP750, 'قیمت گرم ۱۸ برای تبدیل نسیه به طلا', { max: 1e11 });
    creditG = r3(credit / (p * 10));
  }
  // tax-system settlement: setm 1 cash, 2 credit, 3 both; cap/insp are the paid and unpaid parts of the bill
  const bill = doc.type === 'sale' ? S.sales : 0;
  const onCredit = doc.type === 'sale' ? Math.max(0, Math.min(bill, credit)) : 0;
  const setm = !bill ? null : onCredit === 0 ? 1 : onCredit >= bill ? 2 : 3;
  return { type: doc.type, lines, payments: pays, ...S, net, paidIn, paidOut, credit, creditUnit, creditG, setm, cap: bill - onCredit, insp: onCredit };
}

export function calcPayment(p, docType) {
  const m = payMethod(p.method);
  need(m, 'روش پرداخت نامعتبر است.');
  const dir = p.dir === 'out' ? 'out' : 'in';
  const o = { method: m.id, dir, value: 0, pmt: m.pmt, g750: 0, coin: null, count: 0 };
  if (m.id === 'gold') {
    const w = pos(p.weight, 'وزن طلا', { max: 1e6 });
    const f = fin(p.fineness ?? 750, 'طلا');
    const p750 = pos(p.p750, 'قیمت گرم ۱۸ تسویه', { max: 1e11 });
    o.g750 = r3((w * f) / 750);
    o.value = rnd(o.g750 * p750 * 10);
  } else if (m.id === 'coin') {
    need(COIN_TYPES[p.coin], 'نوع سکه نامعتبر است.');
    const n = pos(p.count, 'تعداد سکه', { max: 1e6 });
    need(Number.isInteger(n), 'تعداد سکه باید صحیح باشد.');
    const price = pos(p.price, 'قیمت هر سکه', { max: 1e11 });
    o.coin = p.coin;
    o.count = n;
    o.value = n * rnd(price * 10);
  } else {
    o.value = rnd(pos(p.amount, 'مبلغ', { max: 1e12 }) * 10);
  }
  if (m.card && p.card) need(validCard(p.card) || /^\d{4}$/.test(digitsOnly(p.card)), 'شماره کارت نامعتبر است (۱۶ رقم یا ۴ رقم آخر).');
  if (m.sheba && p.sheba) need(validSheba(p.sheba), 'شماره شبا نامعتبر است.');
  if (m.id === 'cheque') {
    need(String(p.chequeNo ?? '').trim() || p.sayad, 'شماره یا شناسه صیادی چک را وارد کنید.');
    if (p.sayad) need(validSayad(p.sayad), 'شناسه صیادی ۱۶ رقم است.');
    need(/^\d{4}-\d{2}-\d{2}$/.test(String(p.due ?? '')), 'تاریخ سررسید چک نامعتبر است.');
  }
  if (docType === 'expense' && dir === 'in') throw new BookError('هزینه دریافت ندارد.');
  return o;
}

/* ---------------- postings: what each final document moves ---------------- */
/**
 * Postings { acct, unit, amt } derived from a document. Accounts: party:<id>, cash:<id>, bank:<id>, chq:<id>,
 * gold (the shop's raw-gold box, grams of 750), coin:<type> (count), vat (payable), walkin (must net to zero).
 * Signs: + on an asset account = the shop has more; + on party = the party owes the shop more; + on vat = owed.
 */
export function postings(doc, calc) {
  if (TRADE_DOCS.has(doc.type)) return tradePostings(doc, calc);
  const out = [];
  const add = (acct, unit, amt) => amt && out.push({ acct, unit, amt });
  const party = doc.partyId ? `party:${doc.partyId}` : 'walkin';
  // goods and gold moving because of the lines
  const sgn = doc.type === 'return' ? -1 : 1;
  for (const l of calc.lines) {
    if (doc.type === 'proforma') break;
    const k = l.side === 'in' ? 1 : -1; // in = into the shop
    if (l.kind === 'melt' || l.kind === 'used') add('gold', 'G750', k * sgn * l.g750);
    if (l.kind === 'coin') add(`coin:${l.coin}`, 'COUNT', k * sgn * l.count);
    if (l.side === 'out') add('vat', 'IRR', sgn * l.vat);
  }
  if (doc.type === 'proforma') return [];
  add(party, 'IRR', calc.net);
  for (const [i, p] of calc.payments.entries()) {
    const src = doc.payments[i];
    const k = p.dir === 'in' ? 1 : -1;
    const m = payMethod(p.method);
    if (doc.type !== 'transfer' && doc.type !== 'expense') add(party, 'IRR', -k * p.value);
    if (m.acct === 'cash') add(`cash:${src.account || 'main'}`, 'IRR', k * p.value);
    else if (m.acct === 'bank') add(`bank:${src.account || 'main'}`, 'IRR', k * p.value);
    else if (m.acct === 'cheque') add(`chq:${src.chequeId || 'new'}`, 'IRR', k * p.value);
    else if (m.acct === 'gold') add('gold', 'G750', k * p.g750);
    else if (m.acct === 'coin') add(`coin:${p.coin}`, 'COUNT', k * p.count);
    else if (m.acct === 'party') add(party, 'IRR', k * p.value); // offset: moves nothing but the party's balance (cancels the line above)
  }
  if (doc.type === 'expense') add(`exp:${doc.category || 'other'}`, 'IRR', calc.paidOut);
  if (calc.credit && calc.creditUnit === 'G750') {
    add(party, 'IRR', -calc.credit);
    add(party, 'G750', calc.creditG);
  }
  // opening balances: { balances: [{ acct, unit, amt }] } are posted as given (amt in rial / grams / count)
  if (doc.type === 'opening') for (const b of doc.balances ?? []) add(b.acct, b.unit, b.amt);
  // merge duplicates so a statement shows one line per account and unit
  const m = new Map();
  for (const p of out) m.set(`${p.acct}|${p.unit}`, (m.get(`${p.acct}|${p.unit}`) ?? 0) + p.amt);
  return [...m].map(([k, amt]) => {
    const [acct, unit] = k.split('|');
    return { acct, unit, amt: unit === 'G750' ? r3(amt) : amt };
  }).filter((p) => p.amt !== 0);
}

/* ---------------- tax-system (سامانه مودیان) invoice ---------------- */
/**
 * Official codes of the tax system, as published (checked against two independent copies of the tables).
 * Units: گرم 1622, عدد 1627 (note: 164 is کیلوگرم), قیراط 1678, مثقال 16127.
 * General product IDs (شناسه عمومی) of gold goods from stuffid.tax.gov.ir; a shop's own (اختصاصی) code set
 * in settings is used only where no product-specific general ID exists.
 */
export const TAX_UNITS = { gram: '1622', count: '1627', carat: '1678', mesghal: '16127' };
export const GOLD_STUFF_IDS = {
  ring: ['2720000044672', 'انگشتر طلا'],
  cufflink: ['2710000188314', 'دکمه سردست طلا'],
  crown: ['2710000188307', 'تاج طلا'],
  set: ['2720000044733', 'سرویس طلا'],
  anklet: ['2710000188291', 'پابند طلا'],
  bangle: ['2710000044665', 'النگو طلا'],
  earring: ['2710000044726', 'گوشواره طلا'],
  bracelet: ['2720000044689', 'دستبند طلا'],
  chain: ['2720000044702', 'زنجیر طلا'],
  pendant: ['2720000044696', 'آویز گردنبند طلا'],
  plaque: ['2720000044740', 'پلاک طلا'],
  necklace: ['2720000044719', 'گردنبند طلا'],
  melt: ['2720000260362', 'طلای آب شده'],
  broken: ['2720000260324', 'طلای شکسته'],
  used: ['2720000260317', 'طلای مستعمل'],
  coinEmami: ['2720000170500', 'سکه طلا، تمام بهار آزادی طرح جدید'],
  coinBahar: ['2720000170494', 'سکه طلا، تمام بهار آزادی طرح قدیم'],
  coinHalf: ['2720000170487', 'سکه طلا، نیم بهار آزادی'],
  coinQuarter: ['2720000170470', 'سکه طلا، ربع بهار آزادی'],
  coinParsian: ['2720000019366', 'سکه طلا مسکوکات داخلی (پارسیان)'],
};
const TPL_STUFF = {
  'ring-w': 'ring', 'ring-m': 'ring', 'ring-sol': 'ring', 'ring-band': 'ring', 'ring-rink': 'ring', 'ring-chev': 'ring', 'ring-sig': 'ring',
  nk: 'necklace', 'nk-name': 'necklace', 'nk-choker': 'necklace', 'nk-rivi': 'necklace', 'nk-pend': 'pendant', 'nk-plak': 'plaque', 'nk-medal': 'plaque', 'kid-plak': 'plaque',
  br: 'bracelet', 'br-cuff': 'bracelet', 'br-leather': 'bracelet', 'br-arm': 'bracelet', 'kid-br': 'bracelet', 'br-bangle': 'bangle', 'br-bangle-cnc': 'bangle', 'kid-bangle': 'bangle',
  'er-drop': 'earring', 'er-stud': 'earring', 'er-hoop': 'earring', 'er-cuff': 'earring', 'set-full': 'set', 'set-half': 'set', 'set-bride': 'set',
  'mi-anklet': 'anklet', 'mi-cuff': 'cufflink', 'mi-tiara': 'crown', 'inv-melt': 'melt', 'inv-used': 'used',
};
const COIN_STUFF = { emami: 'coinEmami', bahar: 'coinBahar', half: 'coinHalf', halfOld: 'coinHalf', quarter: 'coinQuarter', quarterOld: 'coinQuarter', parsian: 'coinParsian' };
/** General product ID for a line, or null when the tax system has none for it (then the shop's code is used). */
export function stuffIdFor(kind, tpl, coin) {
  if (kind === 'coin') return GOLD_STUFF_IDS[COIN_STUFF[coin]]?.[0] ?? null;
  if (kind === 'melt') return GOLD_STUFF_IDS.melt[0];
  if (kind === 'jewel' && tpl?.startsWith('ch-')) return GOLD_STUFF_IDS.chain[0];
  return GOLD_STUFF_IDS[TPL_STUFF[tpl]]?.[0] ?? null;
}

/**
 * The electronic invoice of a final sale or return in the tax system's JSON shape (header / body / payments).
 * Gold lines use pattern 3 (طلا، جواهر و پلاتین); ordinary goods go on a separate pattern-1 invoice, because an
 * invoice has one pattern. Amounts are rials. Stones are their own row (exempt principal, no making charge).
 * shop: { economicCode, memoryId, branchCode, sstid: { [kind]: code13 }, mu: { gram, count } }.
 */
export function moadianInvoices(doc, calc, shop, party = null) {
  need(doc.type === 'sale' || doc.type === 'return', 'فقط فاکتور فروش و برگشت به سامانه مودیان ارسال می‌شود.');
  const when = new Date(doc.issuedAt ?? `${doc.date}T12:00:00+03:30`).getTime();
  const typeOne = !!(party && (party.nid || party.eco));
  const hdrBase = {
    indatim: when,
    Indati2m: when,
    inty: typeOne ? 1 : 2,
    inno: String(doc.serial ?? '').padStart(10, '0').slice(-10),
    ins: doc.type === 'return' ? 4 : doc.corrects ? 2 : 1,
    irtaxid: doc.refTaxId ?? null,
    tins: digitsOnly(shop.economicCode),
    tob: party ? (party.kind === 'company' ? 2 : 1) : null,
    bid: party?.nid ? digitsOnly(party.nid) : null,
    tinb: party?.eco ? digitsOnly(party.eco) : party?.nid ? digitsOnly(party.nid) : null,
    bpc: party?.postal ? digitsOnly(party.postal) : null,
    sbc: shop.branchCode || null,
  };
  const sst = shop.sstid ?? {};
  const mu = { ...TAX_UNITS, ...(shop.mu ?? {}) };
  // a product's own general ID first, then the shop's code for that kind
  const sidOf = (l, src) => stuffIdFor(l.kind, src.tpl, l.coin) ?? sst[l.kind] ?? null;
  const goldRows = [], goodsRows = [];
  calc.lines.forEach((l, i) => {
    if (l.side !== 'out') return;
    const src = doc.lines[i];
    const title = src.title || KIND_LABEL[l.kind];
    if (l.kind === 'goods') {
      goodsRows.push({ sstid: sst.goods ?? null, sstt: title, mu: mu.count ?? null, am: l.am, fee: l.fee, prdis: l.principal, dis: l.discount, adis: l.principal - l.discount, vra: l.vra, vam: l.vat, tsstam: l.total });
      return;
    }
    const row = { sstid: sidOf(l, src), sstt: title, mu: (l.kind === 'coin' || l.kind === 'service' ? mu.count : mu.gram) ?? null, am: l.am, nw: l.weight || null, fee: l.kind === 'service' ? 0 : l.fee, prdis: l.principal, dis: 0, adis: l.principal, consfee: l.consfee, spro: l.spro, bros: l.bros, tcpbs: l.tcpbs, vra: l.tcpbs ? l.vra : 0, vam: l.vat, tsstam: l.principal + l.tcpbs + l.vat };
    goldRows.push(row);
    if (l.stones) goldRows.push({ sstid: sst.stone ?? null, sstt: `سنگ ${title}`, mu: mu.count ?? null, am: 1, fee: l.stones, prdis: l.stones, dis: 0, adis: l.stones, consfee: 0, spro: 0, bros: 0, tcpbs: 0, vra: 0, vam: 0, tsstam: l.stones });
  });
  const pays = calc.payments
    .map((p, i) => ({ p, src: doc.payments[i] }))
    .filter(({ p }) => p.dir === (doc.type === 'return' ? 'out' : 'in'))
    .map(({ p, src }) => ({ pmt: p.pmt, pv: p.value, trn: src?.ref || null, pcn: digitsOnly(src?.card) || null, pdt: when }));
  if (calc.tradeIn) pays.push({ pmt: 2, pv: calc.tradeIn, trn: null, pcn: null, pdt: when }); // used gold taken in part-payment = تهاتر
  const make = (rows, inp) => {
    const tprdis = rows.reduce((s, r) => s + r.prdis, 0), tdis = rows.reduce((s, r) => s + r.dis, 0), tvam = rows.reduce((s, r) => s + r.vam, 0), tbill = rows.reduce((s, r) => s + r.tsstam, 0);
    const insp = Math.min(tbill, calc.insp), cap = tbill - insp;
    return {
      header: { ...hdrBase, inp, tprdis, tdis, tadis: tprdis - tdis, tvam, todam: 0, tbill, tonw: r3(rows.reduce((s, r) => s + (r.nw ?? 0), 0)) || null, setm: insp === 0 ? 1 : cap === 0 ? 2 : 3, cap, insp },
      body: rows,
      payments: pays,
    };
  };
  const res = [];
  if (goldRows.length) res.push(make(goldRows, 3));
  if (goodsRows.length) res.push(make(goodsRows, 1));
  return res;
}
export const KIND_LABEL = { jewel: 'کارساخته', coin: 'سکه', melt: 'آب‌شده', used: 'طلای مستعمل', service: 'خدمات', goods: 'کالا' };

/* ---------------- hash chain (tamper evidence) ---------------- */
/** Canonical JSON: keys sorted at every level, so the same content always hashes the same. */
export function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
  return JSON.stringify(v ?? null);
}

/* ---------------- balances ---------------- */
/** Sum postings into { [acct]: { [unit]: amount } }. */
export function balances(list) {
  const b = {};
  for (const p of list) {
    b[p.acct] ??= {};
    b[p.acct][p.unit] = (b[p.acct][p.unit] ?? 0) + p.amt;
  }
  for (const a of Object.values(b)) for (const u of Object.keys(a)) a[u] = u === 'G750' ? r3(a[u]) : a[u];
  return b;
}

/* ---------------- formatting ---------------- */
export const faNum = (s) => String(s).replace(/\d/g, (d) => FA[Number(d)]);
/** Money in the chosen display unit: rial (whole numbers) or toman. */
export { SHOP_NAME } from './crown.mjs';
export function fmtMoney(rial, money = 'rial', { unit = true } = {}) {
  if (money !== 'rial') return fmtRial(rial, { unit });
  if (!Number.isFinite(rial)) return '—';
  return faNum(`${rial < 0 ? '−' : ''}${Math.abs(Math.round(rial)).toLocaleString('en-US')}`).replace(/,/g, '٬') + (unit ? ' ریال' : '');
}
export function fmtRial(rial, { unit = true } = {}) {
  if (!Number.isFinite(rial)) return '—';
  const t = rial / 10;
  const whole = Number.isInteger(t);
  const s = Math.abs(t).toLocaleString('en-US', { maximumFractionDigits: whole ? 0 : 1 });
  return faNum(`${t < 0 ? '−' : ''}${s}`).replace(/,/g, '٬').replace('.', '٫') + (unit ? ' تومان' : '');
}
export const fmtG = (g) => (Number.isFinite(g) ? faNum(`${g < 0 ? '−' : ''}${Math.abs(g).toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`).replace(/,/g, '٬').replace('.', '٫') : '—');
/** Amount in Persian words (for the «مبلغ به حروف» line of an invoice). */
export function words(n) {
  n = Math.round(Math.abs(n));
  if (n === 0) return 'صفر';
  const ones = ['', 'یک', 'دو', 'سه', 'چهار', 'پنج', 'شش', 'هفت', 'هشت', 'نه'];
  const teens = ['ده', 'یازده', 'دوازده', 'سیزده', 'چهارده', 'پانزده', 'شانزده', 'هفده', 'هجده', 'نوزده'];
  const tens = ['', '', 'بیست', 'سی', 'چهل', 'پنجاه', 'شصت', 'هفتاد', 'هشتاد', 'نود'];
  const hundreds = ['', 'یکصد', 'دویست', 'سیصد', 'چهارصد', 'پانصد', 'ششصد', 'هفتصد', 'هشتصد', 'نهصد'];
  const scales = ['', 'هزار', 'میلیون', 'میلیارد', 'هزار میلیارد'];
  const three = (x) => {
    const p = [];
    if (x >= 100) p.push(hundreds[Math.floor(x / 100)]);
    const r = x % 100;
    if (r >= 20) {
      p.push(tens[Math.floor(r / 10)]);
      if (r % 10) p.push(ones[r % 10]);
    } else if (r >= 10) p.push(teens[r - 10]);
    else if (r) p.push(ones[r]);
    return p.join(' و ');
  };
  const parts = [];
  for (let i = 0; n > 0; i++, n = Math.floor(n / 1000)) {
    const g = n % 1000;
    if (g) parts.unshift(`${three(g)}${scales[i] ? ` ${scales[i]}` : ''}`);
  }
  return parts.join(' و ');
}
