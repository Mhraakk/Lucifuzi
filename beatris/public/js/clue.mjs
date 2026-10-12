// سرنخ‌یاب (spec 0032): one search for any clue a person remembers — a figure or a piece of it, part of a name, a code,
// a cheque, a phone, a serial, a day, an hour, a kind of trade. Every clue is read with a fixed rule that is shown, and
// matched against every document and customer; each result says which clue it matched, where, and how. When no
// document holds every clue, the closest ones are listed with the clue they miss. Pure and shared (server and tests).
import { normalize } from './oneline.mjs';
import { amountAt, bandsOf, isDigits, tokens, APPROX, STOP } from './daysearch.mjs';
import { toJalali, toGregorian, JALALI_MONTHS } from './ta.mjs';
import * as B from './books.mjs';
import * as TR from './trade.mjs';
import { TRADE_COINS as COIN_TYPES } from './coins.mjs';

/* ---------------- letters, days ---------------- */
/** Letters as روزنگار reads them: Persian forms, no ZWNJ or diacritics, Latin digits, lower case; آ and أ as ا. */
export const fold = (s) =>
  normalize(s)
    .replace(/[آأإٱ]/g, 'ا')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ی')
    .replace(/ء/g, '')
    .replace(/\s+/g, ' ')
    .trim();
/** Letters that sound alike in Persian folded to one: طهرانی ≈ تهرانی، صادقی ≈ سادقی، ذاکری ≈ زاکری، حسن ≈ هسن. */
export const sound = (s) => fold(s).replace(/ط/g, 'ت').replace(/[صث]/g, 'س').replace(/[ذضظ]/g, 'ز').replace(/ح/g, 'ه').replace(/غ/g, 'ق');
const digitsOf = (s) => normalize(s).replace(/\D/g, '');
const fa = (s) => B.faNum(s);
const faInt = (v) => fa(Math.round(v).toLocaleString('en-US')).replace(/,/g, '٬');
let shown = 'rial'; // the shop's money unit for what the finder writes (set by readClues and findClues)
const faMoney = (rial) => B.fmtMoney(Math.round(rial), shown);
const faG = (g) => `${B.fmtG(g)} گرم`;
const ISO = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const jIso = (jy, jm, jd) => ISO(...toGregorian(jy, jm, jd));
const jMonthEnd = (jy, jm) => addDays(jm === 12 ? jIso(jy + 1, 1, 1) : jIso(jy, jm + 1, 1), -1);
const jOf = (iso) => toJalali(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)), Number(iso.slice(8, 10)));
const jFa = (iso) => {
  const [y, m, d] = jOf(iso);
  return fa(`${d} ${JALALI_MONTHS[m - 1]} ${y}`);
};
export const tehranToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran' }).format(new Date());
const HOUR_FMT = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tehran', hour: '2-digit', hourCycle: 'h23' });
/** The hour (0–23, Tehran) of a stored time, or null. */
export const hourOf = (at) => {
  const t = Date.parse(at ?? '');
  return Number.isFinite(t) ? Number(HOUR_FMT.format(new Date(t))) % 24 : null;
};

/* ---------------- words that name a thing ---------------- */
// [facet, value] pairs: the clue holds if the document is that thing, or if the word is in its text
const F = (facet, ...vals) => vals.map((v) => [facet, v]);
const COINS_FULL = ['emami', 'bahar'], COINS_NEW = ['emami', 'half', 'quarter'], COINS_OLD = ['bahar', 'halfOld', 'quarterOld'];
const FACETS = {
  نقد: F('method', 'cash'), نقدی: F('method', 'cash'), کارتخوان: F('method', 'pos'), کارتخوانی: F('method', 'pos'), پوز: F('method', 'pos'), pos: F('method', 'pos'),
  فیش: F('method', 'slip'), چک: F('method', 'cheque'), چکی: F('method', 'cheque'), ساتنا: F('method', 'satna'), پایا: F('method', 'paya'), درگاه: F('method', 'gateway'), اقساطی: F('method', 'bnpl'),
  خرید: F('dir', 'buy'), خریدیم: F('dir', 'buy'), خریدم: F('dir', 'buy'), خریداری: F('dir', 'buy'),
  فروش: F('dir', 'sell'), فروختیم: F('dir', 'sell'), فروختم: F('dir', 'sell'), فروخته: F('dir', 'sell'),
  دریافت: F('dir', 'in'), دریافتی: F('dir', 'in'), پرداخت: F('dir', 'out'), پرداختی: F('dir', 'out'),
  ابشده: F('kind', 'melt'), طلا: F('kind', 'melt'), سکه: F('kind', 'coin'), شمش: F('kind', 'bar'), پلمپ: F('kind', 'bar'), پلمب: F('kind', 'bar'), ارز: F('kind', 'fx'),
  امامی: F('coin', ...COINS_NEW), بهار: F('coin', ...COINS_OLD), تمام: F('coin', ...COINS_FULL), نیم: F('coin', 'half', 'halfOld'), ربع: F('coin', 'quarter', 'quarterOld'), گرمی: F('coin', 'gerami'), پارسیان: F('coin', 'parsian'),
  دلار: F('fx', 'USD'), یورو: F('fx', 'EUR'), درهم: F('fx', 'AED'), پوند: F('fx', 'GBP'), لیر: F('fx', 'TRY'), یوان: F('fx', 'CNY'), دینار: F('fx', 'IQD', 'KWD'), تتر: F('fx', 'USDT'), روبل: F('fx', 'RUB'), افغانی: F('fx', 'AFN'),
  رسید: F('type', 'receipt', 'payment'), حواله: F('type', 'hawala'), تبدیل: F('type', 'convert'), سوخت: F('type', 'writeoff'), بخشودگی: F('type', 'writeoff'), ذوب: F('type', 'transform'), هزینه: F('type', 'expense'), درامد: F('type', 'income'), افتتاحیه: F('type', 'opening'), انتقال: F('type', 'transfer'), معامله: F('type', 'trade'),
  باطل: F('status', 'void'), ابطال: F('status', 'void'), اصلاحیه: F('status', 'amended'), ویرایش: F('status', 'amended'),
  برگشتی: F('cheque', 'bounced'), وصول: F('cheque', 'cleared'), واگذار: F('cheque', 'deposited'),
};
for (const code of Object.keys(TR.FX_CODES)) FACETS[code.toLowerCase()] = F('fx', code);
const PHRASES = [
  [['کارت', 'به', 'کارت'], F('method', 'c2c'), 'کارت به کارت'],
  [['حساب', 'به', 'حساب'], F('method', 'a2a'), 'حساب به حساب'],
  [['فیش', 'بانکی'], F('method', 'slip'), 'فیش بانکی'],
  [['تسویه', 'طلایی'], F('method', 'gold'), 'تسویه طلایی'],
  [['اب', 'شده'], F('kind', 'melt'), 'آب‌شده'],
  [['بهار', 'ازادی'], F('coin', ...COINS_OLD), 'بهار آزادی'],
  [['نیم', 'سکه'], F('coin', 'half', 'halfOld'), 'نیم سکه'],
  [['ربع', 'سکه'], F('coin', 'quarter', 'quarterOld'), 'ربع سکه'],
  [['تمام', 'سکه'], F('coin', ...COINS_FULL), 'تمام سکه'],
  [['اصلاح', 'موجودی'], F('type', 'adjust'), 'اصلاح موجودی'],
  [['پیش', 'فاکتور'], F('type', 'proforma'), 'پیش‌فاکتور'],
  [['برگشت', 'از', 'فروش'], F('type', 'return'), 'برگشت از فروش'],
  [['باطل', 'شده'], F('status', 'void'), 'باطل‌شده'],
  [['اصلاح', 'شده'], F('status', 'amended'), 'اصلاح‌شده'],
  [['ویرایش', 'شده'], F('status', 'amended'), 'ویرایش‌شده'],
  [['برگشت', 'خورده'], F('cheque', 'bounced'), 'چک برگشت‌خورده'],
];
const FACET_FA = {
  method: (v) => `روش ${B.payMethod(v)?.label ?? v}`,
  dir: (v) => ({ buy: 'خرید مغازه', sell: 'فروش مغازه', in: 'دریافت پول', out: 'پرداخت پول' })[v],
  kind: (v) => ({ melt: 'آبشده', coin: 'سکه', bar: 'شمش', fx: 'ارز', money: 'وجه' })[v],
  coin: (v) => COIN_TYPES[v]?.short ?? v,
  fx: (v) => TR.FX_CODES[v] ?? v,
  type: (v) => B.DOC_TYPES[v]?.short ?? v,
  status: (v) => ({ void: 'باطل', amended: 'اصلاحیه' })[v],
  cheque: (v) => `چک ${B.CHEQUE_STATUS[v] ?? v}`,
};
const facetFa = (pairs) => [...new Set(pairs.map(([k, v]) => FACET_FA[k](v)))].join(' یا ');

/* ---------------- the clue finder's own grammar ---------------- */
const KHORDE = new Set(['خرده', 'خورده', 'اندی']);
const END_WORDS = new Set(['اخرش', 'تهش', 'ته', 'اخر', 'ختم']);
const START_WORDS = new Set(['اولش', 'اول', 'شروعش']);
const MORE_WORDS = new Set(['بیشتر', 'بیش', 'بالای', 'بالاتر']);
const LESS_WORDS = new Set(['کمتر', 'زیر', 'پایینتر']);
const DOC_WORDS = new Set(['سند', 'شماره', 'فاکتور', 'رسید', 'برگه']);
const SCALE_AFTER = { هزار: 1e3, میلیون: 1e6, ملیون: 1e6, میلیارد: 1e9 };
const UNIT_WORDS = new Set(['تومان', 'تومن', 'ریال', 'گرم', 'مثقال', 'سوت', 'تا', 'عدد', 'میلیون', 'میلیارد', 'هزار']);
const MONTHS = JALALI_MONTHS.map((m) => fold(m));
const WEEKDAYS = { شنبه: 6, یکشنبه: 0, دوشنبه: 1, سهشنبه: 2, چهارشنبه: 3, پنجشنبه: 4, جمعه: 5 };
const WEEKDAY_FA = { 6: 'شنبه', 0: 'یکشنبه', 1: 'دوشنبه', 2: 'سه‌شنبه', 3: 'چهارشنبه', 4: 'پنجشنبه', 5: 'جمعه' };
const PARTS_OF_DAY = { صبح: [5, 11], ظهر: [12, 13], بعدازظهر: [12, 17], عصر: [14, 17], شب: [18, 23] };
const PM_WORDS = new Set(['عصر', 'شب', 'بعدازظهر']);
// words that shape a clue but never narrow by text
const GRAMMAR = new Set([
  'ساعت', 'روز', 'تاریخ', 'بین', 'تا', 'از', 'کد', 'ای', 'بود', 'بودش', 'میشد', 'می', 'شد', 'شروع', 'با', 'اینا', 'ها', 'همونی', 'اونی', 'یکی', 'کسی',
  // a number word that was not read as a number («دو تا مشتری») names nothing
  'دو', 'سه', 'چهار', 'پنج', 'شش', 'هفت', 'هشت', 'نه', 'ده',
  // «اسمش …»، «موبایلش …»: a word that points at the field, not at what is in it
  'اسم', 'اسمش', 'نام', 'نامش', 'فامیل', 'فامیلش', 'فامیلی', 'فامیلیش', 'موبایل', 'موبایلش', 'تلفن', 'تلفنش', 'شمارش', 'شماره اش', 'کدش', 'مبلغش', 'وزنش', 'تاریخش', 'روزش', 'ساعتش', 'سریالش', 'سریال',
]);
const trailingZeros = (v) => {
  if (!Number.isInteger(v) || v === 0) return 0;
  let n = 0;
  for (let x = v; x % 10 === 0; x /= 10) n++;
  return n;
};
const readsNumber = (w, i) => i < w.length && !!amountAt(w, i);

/* ---------------- reading ---------------- */
/**
 * The clues in a free text. ctx: { shopMoney: 'rial'|'toman', today (ISO, Tehran), unit, tol }. Returns
 * { clues }; every clue has { kind, said, label } (label: how it was read, in Persian, shown on the page).
 */
export function readClues(text, { shopMoney = 'rial', today = tehranToday(), unit = null, tol = null } = {}) {
  shown = shopMoney === 'toman' ? 'toman' : 'rial';
  // «سه‌شنبه» and «بعد از ظهر» are one word each; everything else is read token by token
  const raw = String(text ?? '')
    .slice(0, 240)
    .replace(/(سه|پنج|چهار|یک|دو)[\s‌]+شنبه/g, '$1شنبه')
    .replace(/بعد[\s‌]*از[\s‌]*ظهر/g, 'بعدازظهر');
  const w = tokens(raw).flatMap((t) => fold(t).split(' ')).filter(Boolean);
  const ctx = { shopMoney, unit, tol };
  const clues = [];
  const push = (c) => clues.push(c);
  const [ty] = jOf(today);
  const monthAt = (k) => MONTHS.indexOf(w[k]);
  let approx = false, price = false, mod = null;
  for (let i = 0; i < w.length; ) {
    const t = w[i];
    const ph = PHRASES.find(([seq]) => seq.every((x, k) => w[i + k] === x));
    if (ph) {
      push({ kind: 'word', w: ph[0].join(' '), snd: sound(ph[0].join(' ')), facets: ph[1], said: ph[2], label: `${facetFa(ph[1])} (یا همین کلمه‌ها در متن)` });
      i += ph[0].length;
      continue;
    }
    if (APPROX.has(t) || (t === 'دور' && w[i + 1] === 'و' && w[i + 2] === 'بر')) {
      approx = true;
      i += t === 'دور' ? 3 : 1;
      continue;
    }
    if (t === 'مظنه' || t === 'نرخ' || t === 'قیمت') {
      price = true;
      i++;
      continue;
    }
    // «اول مهر»: the first day of a month
    if (t === 'اول' && monthAt(i + 1) >= 0) {
      const m = monthAt(i + 1) + 1;
      const yTyped = /^1[34]\d\d$/.test(w[i + 2] ?? '') ? Number(w[i + 2]) : null;
      let y = yTyped ?? ty;
      if (!yTyped && jIso(y, m, 1) > today) y--;
      push({ kind: 'date', from: jIso(y, m, 1), to: jIso(y, m, 1), said: w.slice(i, i + (yTyped ? 3 : 2)).join(' '), label: `روز ${jFa(jIso(y, m, 1))}` });
      i += yTyped ? 3 : 2;
      continue;
    }
    // «آخرش ۷۸۰»، «ختم به ۷۸۰»، «اولش ۴۹»: a piece of a figure or a code
    if (END_WORDS.has(t) || START_WORDS.has(t)) {
      const k = w[i + 1] === 'به' || w[i + 1] === 'با' ? i + 2 : i + 1;
      if (readsNumber(w, k)) {
        mod = END_WORDS.has(t) ? 'end' : 'start';
        i = k;
        continue;
      }
    }
    // «بیشتر از ۲ میلیارد»، «زیر ۵ گرم»
    if (MORE_WORDS.has(t) || LESS_WORDS.has(t)) {
      const k = w[i + 1] === 'از' ? i + 2 : i + 1;
      if (readsNumber(w, k)) {
        mod = MORE_WORDS.has(t) ? 'more' : 'less';
        i = k;
        continue;
      }
    }
    // a full date: ۱۴۰۵/۷/۱۲ (normalized to 1405.7.12) or 2026-10-12
    const dm = /^(\d{4})[.\-](\d{1,2})[.\-](\d{1,2})$/.exec(t);
    if (dm) {
      const [y, m, d] = dm.slice(1).map(Number);
      if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
        const iso = y < 1700 ? jIso(y, m, d) : ISO(y, m, d);
        push({ kind: 'date', from: iso, to: iso, said: t.replace(/\./g, '/'), label: `روز ${jFa(iso)}` });
        i++;
        continue;
      }
    }
    // a tracking code, whole («M1405-00012») or begun («M1405»)
    if (/^[a-z]\d{4}(-?\d{1,7})?$/.test(t)) {
      const tr = B.parseTrack(t);
      const code = tr && B.trackCode(tr.type, tr.fy, tr.no);
      if (code) push({ kind: 'code', code, said: t.toUpperCase(), label: `کد رهگیری ${code}` });
      else push({ kind: 'alnum', s: TR.normSerial(t), said: t.toUpperCase(), label: `«${t.toUpperCase()}» در کد رهگیری، سریال یا کد اصالت` });
      i++;
      continue;
    }
    // letters and digits together: a serial, a code, an authenticity code
    if (/[a-z]/.test(t) && /\d/.test(t) && t.length >= 3) {
      const s = TR.normSerial(t);
      push({ kind: 'alnum', s, said: s, label: `«${s}» در سریال شمش، کد رهگیری یا کد اصالت` });
      i++;
      continue;
    }
    // «ساعت ۱۰»، «ساعت ۵ عصر»، «ساعت ۱۰ و نیم»
    if (t === 'ساعت' && /^\d{1,2}$/.test(w[i + 1] ?? '')) {
      let h = Number(w[i + 1]), j = i + 2;
      if (w[j] === 'و' && (w[j + 1] === 'نیم' || /^\d+$/.test(w[j + 1] ?? ''))) j += 2;
      if (PM_WORDS.has(w[j]) && h < 12) (h += 12), j++;
      else if (w[j] === 'ظهر') (h += h < 4 ? 12 : 0), j++;
      else if (w[j] === 'صبح') j++;
      if (h <= 23) push({ kind: 'hour', from: h, to: h, said: w.slice(i, j).join(' '), label: `ساعت ${fa(h)}` });
      i = j;
      continue;
    }
    if (PARTS_OF_DAY[t]) {
      const [a, b] = PARTS_OF_DAY[t];
      push({ kind: 'hour', from: a, to: b, said: t === 'بعدازظهر' ? 'بعد از ظهر' : t, label: `ساعت ${fa(a)} تا ${fa(b)}` });
      i++;
      continue;
    }
    // «سند ۱۲»، «فاکتور ۱۲»: a document's number (not «رسید ۱۲ میلیون»)
    if (DOC_WORDS.has(t) && /^\d{1,7}$/.test(w[i + 1] ?? '') && !UNIT_WORDS.has(w[i + 2])) {
      push({ kind: 'docno', no: Number(w[i + 1]), said: `${t} ${w[i + 1]}`, label: `سند شماره ${fa(w[i + 1])}` });
      i += 2;
      continue;
    }
    // «کد مشتری ۳۴»
    if (t === 'کد' && w[i + 1] === 'مشتری' && /^\d{1,7}$/.test(w[i + 2] ?? '')) {
      push({ kind: 'pcode', code: Number(w[i + 2]), said: w.slice(i, i + 3).join(' '), label: `کد مشتری ${fa(w[i + 2])}` });
      i += 3;
      continue;
    }
    // a day of a month («۱۲ مهر»، «۱۲ مهر ۱۴۰۴»), a month («مهر»، «مهر ۱۴۰۴»): a month without a year is the latest begun
    if (/^\d{1,2}$/.test(t) && monthAt(i + 1) >= 0 && Number(t) >= 1 && Number(t) <= 31) {
      const m = monthAt(i + 1) + 1, d = Number(t), yTyped = /^1[34]\d\d$/.test(w[i + 2] ?? '') ? Number(w[i + 2]) : null;
      let y = yTyped ?? ty;
      if (!yTyped && jIso(y, m, d) > today) y--;
      const iso = jIso(y, m, d);
      push({ kind: 'date', from: iso, to: iso, said: w.slice(i, i + (yTyped ? 3 : 2)).join(' '), label: `روز ${jFa(iso)}` });
      i += yTyped ? 3 : 2;
      continue;
    }
    if (monthAt(i) >= 0) {
      const m = monthAt(i) + 1, yTyped = /^1[34]\d\d$/.test(w[i + 1] ?? '') ? Number(w[i + 1]) : null;
      let y = yTyped ?? ty;
      if (!yTyped && jIso(y, m, 1) > today) y--;
      push({ kind: 'date', from: jIso(y, m, 1), to: jMonthEnd(y, m), said: w.slice(i, i + (yTyped ? 2 : 1)).join(' '), label: `${JALALI_MONTHS[m - 1]} ${fa(y)}` });
      i += yTyped ? 2 : 1;
      continue;
    }
    const rel = relativeDays(w, i, today);
    if (rel) {
      push(rel.clue);
      i += rel.len;
      continue;
    }
    if (t in WEEKDAYS) {
      push({ kind: 'weekday', d: WEEKDAYS[t], said: WEEKDAY_FA[WEEKDAYS[t]], label: `روز هفته ${WEEKDAY_FA[WEEKDAYS[t]]}` });
      i++;
      continue;
    }
    // «بین ۱۰ و ۱۲ گرم»، «از ۱۰ تا ۱۲ گرم»: the first number is read up to the «و» or «تا» only
    const joint = t === 'بین' ? 'و' : t === 'از' ? 'تا' : null;
    const k = joint ? w.indexOf(joint, i + 2) : -1;
    if (k > i + 1 && k <= i + 6) {
      const a = amountAt(w.slice(0, k), i + 1);
      const b = a && a.len === k - i - 1 && readsNumber(w, k + 1) ? amountAt(w, k + 1) : null;
      if (b) {
        const kind = b.kind !== 'any' ? b.kind : a.kind, money = b.money ?? a.money;
        const [x, y] = [a.value * (b.scale && !a.scale ? b.scale : 1), b.value];
        push(rangeClue({ kind, money }, Math.min(x, y), Math.max(x, y), w.slice(i, k + 1 + b.len).join(' '), ctx, price));
        i = k + 1 + b.len;
        continue;
      }
    }
    // an amount, and what was said around it
    const a = readsNumber(w, i) ? amountAt(w, i) : null;
    if (a) {
      let j = i + a.len;
      // «۴۹ میلیون و خرده‌ای»: up to the next million; «سیصد و خرده‌ای میلیون»: up to the next hundred million
      if (w[j] === 'و' && KHORDE.has(w[j + 1])) {
        j += w[j + 2] === 'ای' ? 3 : 2;
        let lo, hi, kind = a.kind, money = a.money;
        if (a.scale) (lo = a.value), (hi = a.value + a.scale);
        else {
          const S = SCALE_AFTER[w[j]] ?? 1;
          if (S > 1) j++;
          lo = a.value * S;
          hi = (a.value + 10 ** trailingZeros(a.value)) * S;
          if (S > 1 && kind === 'any') kind = 'money';
        }
        const u = w[j];
        if (u === 'تومان' || u === 'تومن' || u === 'ریال') (kind = 'money'), (money = u === 'ریال' ? 'rial' : 'toman'), j++;
        else if (u === 'گرم') (kind = 'gram'), j++;
        else if (u === 'مثقال') (kind = 'mesghal'), j++;
        push(rangeClue({ kind, money }, lo, hi, w.slice(i, j).join(' '), ctx, price, true));
        mod = null;
        i = j;
        continue;
      }
      if (mod === 'more' || mod === 'less') {
        push(rangeClue(a, mod === 'more' ? a.value : 0, mod === 'more' ? Infinity : a.value, `${mod === 'more' ? 'بیشتر از' : 'کمتر از'} ${a.said}`, ctx, price));
        mod = null;
        i = j;
        continue;
      }
      if (mod === 'end' || mod === 'start') {
        const d = String(Math.round(a.value * (a.kind === 'gram' ? 1000 : 1)));
        push({ kind: 'digits', d, at: mod, figures: true, said: `${mod === 'end' ? 'آخرش' : 'اولش'} ${a.said}`, label: `${mod === 'end' ? 'ختم به' : 'شروع با'} «${fa(d)}» در هر مبلغ، وزن، کد یا شماره` });
        mod = null;
        i = j;
        continue;
      }
      const b = bandsOf({ amounts: [a], approx, price }, { shopMoney, unit, tol });
      if (isDigits(t) && !t.includes('.') && a.len === 1 && a.kind === 'any' && t.length >= 3) {
        // a bare run of digits: a piece of any code or number, and the number itself against every figure (spec 0023)
        push({ kind: 'digits', d: t, at: 'any', figures: t.length >= 4, bands: b.bands, said: t, label: `«${fa(t)}» در هر کد، شماره، تلفن یا سریال، یا رقمی برابر ${faInt(Number(t))}` });
      } else push({ kind: 'amount', bands: b.bands, mode: b.tol ? 'band' : 'exact', said: a.said, label: bandLabel(b.bands, b.tol) });
      i = j;
      continue;
    }
    if (FACETS[t]) {
      push({ kind: 'word', w: t, snd: sound(t), facets: FACETS[t], said: t, label: `${facetFa(FACETS[t])} (یا «${t}» در متن)` });
      i++;
      continue;
    }
    // one or two bare digits, a word that only says how, or a single letter: nothing to narrow by
    if (!/^\d+$/.test(t) && !STOP.has(t) && !GRAMMAR.has(t) && t.length >= 2) push({ kind: 'word', w: t, snd: sound(t), facets: [], said: t, label: `«${t}» در نام، لقب، شهر، یادداشت یا شرح` });
    i++;
  }
  // what was said is shown back in Persian digits; codes keep their Latin letters and digits
  for (const c of clues) if (c.kind !== 'alnum' && c.kind !== 'code') c.said = fa(c.said);
  const seen = new Set();
  return { clues: clues.filter((c) => !seen.has(`${c.kind}|${c.said}`) && seen.add(`${c.kind}|${c.said}`)) };
}

function relativeDays(w, i, today) {
  const t = w[i], n = w[i + 1];
  const day = (d, said) => ({ clue: { kind: 'date', from: d, to: d, said, label: `روز ${jFa(d)}` }, len: 1 });
  const range = (from, to, said, len) => ({ clue: { kind: 'date', from, to, said, label: `${jFa(from)} تا ${jFa(to)}` }, len });
  const ago = (x) => x === 'پیش' || x === 'گذشته' || x === 'قبل';
  if (t === 'امروز') return day(today, 'امروز');
  if (t === 'دیروز') return day(addDays(today, -1), 'دیروز');
  if (t === 'پریروز') return day(addDays(today, -2), 'پریروز');
  // a week runs from Saturday to Friday
  const sat = addDays(today, -((new Date(`${today}T00:00:00Z`).getUTCDay() + 1) % 7));
  if (t === 'این' && n === 'هفته') return range(sat, today, 'این هفته', 2);
  if (t === 'هفته' && ago(n)) return range(addDays(sat, -7), addDays(sat, -1), `هفته ${n}`, 2);
  const [jy, jm] = jOf(today);
  if (t === 'این' && n === 'ماه') return range(jIso(jy, jm, 1), today, 'این ماه', 2);
  if (t === 'ماه' && ago(n)) {
    const [py, pm] = jm === 1 ? [jy - 1, 12] : [jy, jm - 1];
    return range(jIso(py, pm, 1), jMonthEnd(py, pm), `ماه ${n}`, 2);
  }
  if (t === 'امسال') return range(jIso(jy, 1, 1), today, 'امسال', 1);
  if (t === 'پارسال') return range(jIso(jy - 1, 1, 1), jMonthEnd(jy - 1, 12), 'پارسال', 1);
  if (t === 'سال' && ago(n)) return range(jIso(jy - 1, 1, 1), jMonthEnd(jy - 1, 12), `سال ${n}`, 2);
  return null;
}
/** A range in the books' units: money (IRR, in the typed or the shop's unit), grams, mesghal, counts. khorde: the top excluded. */
function rangeClue(a, lo, hi, said, { shopMoney, unit }, price, khorde = false) {
  const bands = [];
  const m = a.money ?? (unit === 'toman' || unit === 'rial' ? unit : shopMoney === 'toman' ? 'toman' : 'rial');
  const k = m === 'toman' ? 10 : 1;
  const open = hi === Infinity;
  if (a.kind === 'money' || a.kind === 'any') bands.push({ u: price ? 'RATE' : 'IRR', lo: lo * k, hi: open ? Infinity : hi * k - (khorde ? 1 : 0), target: lo * k, eps: 0.5, money: m });
  if (a.kind === 'gram' || a.kind === 'any') bands.push({ u: 'G', lo, hi: open ? Infinity : hi - (khorde ? 0.001 : 0), target: lo, eps: 0.0005 });
  if (a.kind === 'mesghal') bands.push({ u: 'MQ', lo, hi: open ? Infinity : hi - (khorde ? 0.001 : 0), target: lo, eps: 0.0005 });
  if (a.kind === 'count' || (a.kind === 'any' && Number.isInteger(lo))) bands.push({ u: 'N', lo, hi: open ? Infinity : hi - (khorde ? 1 : 0), target: lo, eps: 1e-9 });
  return { kind: 'amount', bands, mode: 'range', said, label: bandLabel(bands, null) };
}
function bandLabel(bands, tol) {
  const one = (b) => {
    const f = b.u === 'IRR' || b.u === 'RATE' ? faMoney : b.u === 'G' ? faG : b.u === 'MQ' ? (x) => `${fa(B.r3(x))} مثقال` : (x) => `${faInt(x)} عدد`;
    const name = { RATE: 'نرخ', IRR: 'مبلغ', G: 'وزن', MQ: 'وزن', N: 'تعداد' }[b.u];
    if (b.hi === Infinity) return `${name} از ${f(b.lo)} به بالا`;
    if (b.lo === 0) return `${name} تا ${f(b.hi)}`;
    if (Math.abs(b.hi - b.lo) <= (b.eps ?? 0) * 2) return `${name} ${f(b.lo)}`;
    return `${name} ${f(b.lo)} تا ${f(b.hi)}`;
  };
  return `${bands.map(one).join(' یا ')}${tol ? ` (±${fa(tol)}٪)` : ''}`;
}

/* ---------------- what can be searched ---------------- */
const textEntry = (label, v) => {
  const f = fold(v), s = sound(v);
  return { label, shown: String(v), f, s, fw: f.split(' '), sw: s.split(' ') };
};
/**
 * A document as the finder sees it. rec: the روزنگار index record { id, track, type, date, at, byId, status,
 * superseded, partyId, hawala, secs, doc: { ...data, type, calc } }; figs: figuresOf(doc); extra: { cheques: [{ no,
 * sayad, bank, owner, status }], auth (the seal's first 12 hex), version }.
 */
export function searchableDoc(rec, figs, { cheques = [], auth = '', version = 1 } = {}) {
  const d = rec.doc ?? {}, c = d.calc ?? {};
  const facets = new Set([`type:${rec.type}`]);
  const texts = [], codes = [];
  const text = (label, v) => v && String(v).trim() && texts.push(textEntry(label, v));
  const code = (label, v, alnum = false) => {
    const s = alnum ? TR.normSerial(v) : digitsOf(v);
    if (s && s.length >= (alnum ? 2 : 3)) codes.push({ label, s, alnum, shown: alnum ? String(v) : fa(String(v)) });
  };
  const base = !!B.DOC_TYPES[rec.type]?.base;
  for (const l of c.lines ?? []) {
    facets.add(`kind:${l.kind === 'used' ? 'melt' : l.kind}`);
    if (l.coin) facets.add(`coin:${l.coin}`);
    if (l.code) facets.add(`fx:${l.code}`);
    // a goods line on account is no purchase or sale; a priced one, and every line of a full-edition invoice, is
    if (!base || l.priced) facets.add((base ? l.dir : l.side) === 'in' ? 'dir:buy' : 'dir:sell');
    if (l.kind === 'coin') text('نام کالا', `سکه ${COIN_TYPES[l.coin]?.label ?? ''}`);
    else if (l.kind === 'fx') text('نام کالا', `${TR.FX_CODES[l.code] ?? ''} ${l.code ?? ''}`);
    else text('نام کالا', TR.TRADE_KINDS[l.kind] ?? B.KIND_LABEL?.[l.kind] ?? l.kind);
  }
  if (rec.type === 'sale') facets.add('dir:sell');
  if (rec.type === 'buy') facets.add('dir:buy');
  if (rec.type === 'transform') facets.add('kind:melt');
  for (const l of d.lines ?? []) {
    if (l.serial) code('سریال شمش', l.serial, true);
    text('شرح ردیف', l.title ?? l.name ?? l.desc);
  }
  for (const p of c.payments ?? []) {
    facets.add(`method:${p.method}`);
    facets.add(p.dir === 'in' ? 'dir:in' : 'dir:out');
    if (p.coin) facets.add('kind:coin').add(`coin:${p.coin}`);
    if (p.method === 'gold') facets.add('kind:melt');
  }
  for (const p of d.payments ?? []) {
    code('شماره پیگیری', p.ref);
    code('شماره کارت', p.card);
    code('شماره چک', p.chequeNo);
    code('شناسه صیادی', p.sayad);
    code('شبا', p.sheba);
    text('بانک', p.bank);
  }
  for (const q of cheques) {
    code('شماره چک', q.no);
    code('شناسه صیادی', q.sayad);
    text('بانک چک', q.bank);
    text('صاحب چک', q.owner);
    if (q.status) facets.add(`cheque:${q.status}`);
  }
  for (const s of rec.secs ?? []) facets.add(`kind:${s}`);
  text('یادداشت', d.note);
  text('دسته', d.category);
  text('نوع سند', B.DOC_TYPES[rec.type]?.label);
  code('کد رهگیری', rec.track, true);
  if (auth) code('کد اصالت', auth, true);
  if (rec.status === 'void') facets.add('status:void');
  if (rec.superseded || version > 1) facets.add('status:amended');
  const at = rec.at ?? null;
  return {
    id: rec.id, track: rec.track, no: Number(String(rec.track ?? '').split('-')[1] ?? NaN), type: rec.type, date: rec.date, at, hour: hourOf(at),
    weekday: rec.date ? new Date(`${rec.date}T00:00:00Z`).getUTCDay() : null, status: rec.status, partyIds: [rec.partyId, ...(rec.hawala ?? [])].filter(Boolean),
    byId: rec.byId ?? null, secs: rec.secs instanceof Set ? rec.secs : new Set(rec.secs ?? []), facets, figs: figs ?? [], texts, codes,
  };
}
/** A customer as the finder sees it: names and places as text, numbers as codes. */
export function searchableParty(p) {
  const texts = [], codes = [];
  const text = (label, v) => v && String(v).trim() && texts.push(textEntry(label, v));
  const code = (label, v) => {
    const s = digitsOf(v);
    if (s && s.length >= 1) codes.push({ label, s, alnum: false, shown: fa(String(v)) });
  };
  text('نام', p.name);
  text('لقب', p.alias);
  text('نام پدر', p.father);
  text('شهر', p.city);
  text('گروه', p.group ?? p.grp);
  text('برچسب', p.tags);
  text('یادداشت مشتری', p.note);
  code('موبایل', p.mobile);
  code('تلفن', p.phone);
  code('کد ملی', p.nid);
  code('کد مشتری', p.code);
  return { id: p.id, code: p.code, label: p.label ?? TR.partyLabel(p), texts, codes };
}

/* ---------------- matching ---------------- */
// how strongly a clue holds; the page and the spec list the same table
export const STRENGTH = { exact: 100, whole: 95, word: 90, band: 80, edge: 75, facet: 70, day: 70, hour: 60, figEdge: 60, inner: 55, letters: 50, sound: 45, figInner: 40 };
const S_ = STRENGTH;
const better = (a, b) => (!a ? b : !b ? a : b.q > a.q || (b.q === a.q && (b.rel ?? 1) < (a.rel ?? 1)) ? b : a);

function textHit(c, texts) {
  let best = null;
  for (const e of texts) {
    let q = 0, how = '';
    if (e.fw.includes(c.w) || e.f === c.w) q = S_.word;
    else if (e.fw.some((x) => x.startsWith(c.w))) (q = S_.edge), (how = 'ابتدای کلمه');
    else if (c.w.length >= 3 && e.f.includes(c.w)) (q = S_.letters), (how = 'بخشی از کلمه');
    else if (c.w.length >= 3 && e.sw.some((x) => x.startsWith(c.snd))) (q = S_.sound), (how = 'هم‌آوا');
    if (q) best = better(best, { q, field: e.label, value: e.shown, how });
  }
  return best;
}
function codeHit(c, codes) {
  const needle = c.kind === 'alnum' ? c.s : c.d;
  let best = null;
  for (const e of codes) {
    if (c.kind === 'alnum' && !e.alnum) continue;
    let q = 0, how = '';
    if (e.s === needle) q = S_.whole;
    else if (c.at === 'end' ? e.s.endsWith(needle) : c.at === 'start' ? e.s.startsWith(needle) : e.s.startsWith(needle) || e.s.endsWith(needle)) (q = S_.edge), (how = e.s.endsWith(needle) ? 'انتهای عدد' : 'ابتدای عدد');
    else if (c.at !== 'end' && c.at !== 'start' && e.s.includes(needle)) (q = S_.inner), (how = 'بخشی از عدد');
    if (q) best = better(best, { q, field: e.label, value: e.shown, how });
  }
  return best;
}
const figFa = (f) => (f.u === 'IRR' || f.u === 'RATE' ? faMoney(f.v) : f.u === 'G' ? faG(f.v) : f.u === 'MQ' ? `${fa(B.r3(f.v))} مثقال` : faInt(f.v));
function figureHit(c, figs, sec) {
  let best = null;
  const inSec = (f) => !sec || f.s === sec || f.s === 'doc';
  for (const b of c.bands ?? []) {
    for (const f of figs) {
      if (f.u !== b.u || !inSec(f) || f.v < b.lo - b.eps || f.v > b.hi + b.eps) continue;
      const exact = c.mode !== 'range' && Math.abs(f.v - b.target) <= b.eps;
      const rel = b.target ? Math.abs(f.v - b.target) / b.target : 0;
      best = better(best, { q: exact ? S_.exact : S_.band, rel, field: f.label, value: figFa(f), how: exact ? 'دقیقاً' : 'در بازه' });
    }
  }
  if (c.kind === 'digits' && c.figures) {
    const tail = new RegExp(`${c.d}0*$`);
    for (const f of figs) {
      if (!inSec(f) || f.u === 'MQ') continue;
      const fd = f.u === 'G' ? String(Math.round(f.v * 1000)) : String(Math.round(f.v));
      let q = 0, how = '';
      if (c.at === 'end' && tail.test(fd)) (q = S_.figEdge), (how = 'انتهای رقم‌ها');
      else if (c.at === 'start' && fd.startsWith(c.d)) (q = S_.figEdge), (how = 'ابتدای رقم‌ها');
      else if (c.at === 'any' && c.d.length >= 4 && fd.includes(c.d)) (q = S_.figInner), (how = 'رقم‌ها در عدد');
      if (q) best = better(best, { q, field: f.label, value: figFa(f), how });
    }
  }
  return best;
}

/** The best way one clue holds for one customer (names, places, numbers), or null. */
export function partyHit(c, p) {
  if (c.kind === 'word') return textHit(c, p.texts);
  if (c.kind === 'digits') return codeHit(c, p.codes);
  if (c.kind === 'pcode') return Number(p.code) === c.code ? { q: S_.whole, field: 'کد مشتری', value: fa(p.code), how: '' } : null;
  return null;
}

/**
 * Every document and customer against the clues. docs: searchableDoc[]; parties: searchableParty[]; users: [{ id,
 * name }]; sec: a section (spec 0027) or null; money: the shop's unit for figures written in a result. Returns { items:
 * [{ id, matched, of, score, why, missing }], people, total, all } — all: how many documents hold every clue.
 */
export function findClues(clues, { docs = [], parties = [], users = [], sec = null, limit = 60, money = 'rial' } = {}) {
  shown = money === 'toman' ? 'toman' : 'rial';
  const n = clues.length;
  if (!n) return { items: [], people: [], total: 0, all: 0 };
  const userTexts = users.map((u) => ({ id: u.id, texts: [textEntry('ثبت‌کننده', u.name)] }));
  // the customers and the users that hold each clue, once
  const pHits = clues.map((c) => {
    const m = new Map();
    for (const p of parties) {
      const h = partyHit(c, p);
      if (h) m.set(p.id, h);
    }
    return m;
  });
  const uHits = clues.map((c) => {
    const m = new Map();
    if (c.kind === 'word') for (const u of userTexts) {
      const h = textHit(c, u.texts);
      if (h) m.set(u.id, h);
    }
    return m;
  });
  const viaParty = (h, p) => h && { ...h, field: `${h.field} مشتری`, value: h.field === 'نام' ? h.value : `${h.value} (${p})` };
  const labels = new Map(parties.map((p) => [p.id, p.label]));
  const out = [];
  for (const d of docs) {
    if (sec && !d.secs.has(sec)) continue;
    const why = [], missing = [];
    let score = 0, rel = 1;
    clues.forEach((c, i) => {
      let h = null;
      if (c.kind === 'word') {
        h = textHit(c, d.texts);
        const own = c.facets.filter(([k, v]) => d.facets.has(`${k}:${v}`));
        if (own.length) h = better(h, { q: S_.facet, field: 'نوع', value: facetFa(own), how: '' });
        for (const id of d.partyIds) h = better(h, viaParty(pHits[i].get(id), labels.get(id)));
        if (d.byId) h = better(h, uHits[i].get(d.byId));
      } else if (c.kind === 'digits') {
        h = codeHit(c, d.codes);
        for (const id of d.partyIds) h = better(h, viaParty(pHits[i].get(id), labels.get(id)));
        h = better(h, figureHit(c, d.figs, sec));
      } else if (c.kind === 'alnum') h = codeHit(c, d.codes);
      else if (c.kind === 'code') h = d.track === c.code ? { q: S_.exact, field: 'کد رهگیری', value: d.track, how: '' } : null;
      else if (c.kind === 'docno') h = d.no === c.no ? { q: S_.whole, field: 'شماره سند', value: d.track, how: '' } : null;
      else if (c.kind === 'pcode') for (const id of d.partyIds) h = better(h, viaParty(pHits[i].get(id), labels.get(id)));
      else if (c.kind === 'amount') h = figureHit(c, d.figs, sec);
      else if (c.kind === 'date') h = d.date >= c.from && d.date <= c.to ? { q: S_.day, field: 'روز', value: jFa(d.date), how: '' } : null;
      else if (c.kind === 'weekday') h = d.weekday === c.d ? { q: S_.hour, field: 'روز هفته', value: WEEKDAY_FA[d.weekday], how: '' } : null;
      else if (c.kind === 'hour') h = d.hour != null && d.hour >= c.from && d.hour <= c.to ? { q: S_.hour, field: 'ساعت', value: fa(d.hour), how: '' } : null;
      if (h) {
        why.push({ clue: i, said: c.said, field: h.field, value: h.value, how: h.how });
        score += h.q;
        if (h.rel != null) rel = Math.min(rel, h.rel);
      } else missing.push(c.said);
    });
    if (why.length) out.push({ id: d.id, matched: why.length, of: n, score, rel, date: d.date ?? '', at: d.at ?? '', why, missing });
  }
  out.sort((a, b) => b.matched - a.matched || b.score - a.score || a.rel - b.rel || b.date.localeCompare(a.date) || String(b.at).localeCompare(String(a.at)) || a.id.localeCompare(b.id));
  // customers that hold the name, phone or code clues, most clues first
  const personal = clues.map((c, i) => [c, i]).filter(([c]) => c.kind === 'word' || c.kind === 'digits' || c.kind === 'pcode');
  const people = [];
  for (const p of personal.length ? parties : []) {
    const why = [];
    let score = 0;
    for (const [c, i] of personal) {
      const h = pHits[i].get(p.id);
      if (h) (why.push({ clue: i, said: c.said, field: h.field, value: h.value, how: h.how }), (score += h.q));
    }
    if (why.length) people.push({ id: p.id, code: p.code, label: p.label, matched: why.length, of: personal.length, score, why });
  }
  people.sort((a, b) => b.matched - a.matched || b.score - a.score || String(a.label).localeCompare(String(b.label), 'fa') || a.id.localeCompare(b.id));
  return { items: out.slice(0, limit), people: people.slice(0, 8), total: out.length, all: out.filter((x) => x.matched === n).length };
}
