// Number search in روزنگار (spec 0023): a remembered figure is read with fixed rules and compared with every figure
// of every document. Nothing is guessed: the band searched, the unit and the words that narrow it are all shown.
// Pure and shared: the server indexes documents with figuresOf() and reads queries with readQuery()/bandsOf().
import { normalize, readNumber } from './oneline.mjs';
import * as B from './books.mjs';
import * as TR from './trade.mjs';
import { TRADE_COINS as COIN_TYPES } from './coins.mjs';

export const TOLERANCES = [0, 1, 5, 10]; // percent
const SCALES = new Set(['هزار', 'میلیون', 'ملیون', 'میلیارد']);
const SMALL = new Set(['صفر', 'یک', 'یه', 'دو', 'سه', 'چهار', 'پنج', 'شش', 'شیش', 'هفت', 'هشت', 'نه', 'ده', 'یازده', 'دوازده', 'سیزده', 'چهارده', 'پانزده', 'پونزده', 'شانزده', 'شونزده', 'هفده', 'هیفده', 'هجده', 'هیجده', 'نوزده', 'بیست', 'سی', 'چهل', 'پنجاه', 'شصت', 'هفتاد', 'هشتاد', 'نود', 'صد', 'یکصد', 'دویست', 'سیصد', 'چهارصد', 'پانصد', 'پونصد', 'ششصد', 'هفتصد', 'هشتصد', 'نهصد']);
const BIG_WORD = (t) => SMALL.has(t) && !['صفر', 'یک', 'یه', 'دو', 'سه', 'چهار', 'پنج', 'شش', 'شیش', 'هفت', 'هشت', 'نه'].includes(t);
const APPROX = new Set(['حدود', 'حدودا', 'حدودای', 'تقریبا', 'تقریبی', 'نزدیک', 'نزدیکه', 'حوالی', 'حول', 'حوش', 'دوروبر', '~', '≈']);
const GRAM = new Set(['گرم', 'گ', 'g', 'gr']);
const COUNT = new Set(['تا', 'عدد', 'دونه', 'دانه', 'سکه', 'قطعه']);
const PRICE = new Set(['مظنه', 'نرخ', 'قیمت']);
// words that say how, not who: they never narrow the results
const STOP = new Set([
  'یه', 'یک', 'چیزی', 'چیز', 'پول', 'مبلغ', 'وجه', 'رقم', 'عدد', 'بود', 'بوده', 'شد', 'شده', 'هست', 'است', 'بودیم', 'کردیم', 'کردم', 'کرد', 'کرده', 'کرده‌ایم',
  'زدیم', 'زدم', 'زد', 'زده', 'دادیم', 'دادم', 'داد', 'داده', 'گرفتیم', 'گرفتم', 'گرفت', 'ریختیم', 'ریختم', 'ریخت', 'واریز', 'پرداخت', 'پرداختیم', 'دریافت', 'فرستادیم', 'فرستاد',
  'خریدیم', 'خرید', 'فروختیم', 'فروش', 'برای', 'واسه', 'به', 'از', 'با', 'که', 'و', 'را', 'رو', 'در', 'تو', 'توی', 'این', 'اون', 'آن', 'همین', 'همون', 'یادم', 'یادمه', 'نمیاد',
  'نیست', 'ما', 'من', 'آقای', 'آقا', 'خانم', 'حاج', 'حاجی', 'جناب', 'تومان', 'تومن', 'ریال', 'میلیون', 'ملیون', 'میلیارد', 'هزار', 'گرم', 'مثقال', 'سوت', 'تا', 'حدود', 'دور', 'بر',
  'پیش', 'قبل', 'سند', 'مشتری', 'طرف', 'حساب', 'بابت', 'مال', 'موقع', 'بهش', 'براش', 'ازش', 'اینا', 'اونا', 'یا', 'هم', 'دیگه', 'فکر', 'کنم', 'شاید', 'ت', 'ر', 'م',
]);

const isDigits = (t) => /^\d+(\.\d+)?$/.test(t);
const tokens = (text) =>
  normalize(text)
    .replace(/[«»"'()[\]{}،,;:!?؟…|]/g, ' ')
    .split(/\s+/)
    .map((t) => t.replace(/^[.\-–—]+|[.\-–—]+$/g, ''))
    .filter(Boolean);

/**
 * What was typed: { amounts: [{ value, kind: 'money'|'gram'|'mesghal'|'count'|'any', money: 'toman'|'rial'|null, said }],
 * words, approx, price }. A money figure needs its unit or a scale word; a bare number is compared with everything.
 */
export function readQuery(text) {
  const w = tokens(String(text ?? '').slice(0, 200));
  const out = { amounts: [], words: [], approx: false, price: false };
  for (let i = 0; i < w.length; ) {
    const t = w[i];
    if (APPROX.has(t) || (t === 'دور' && w[i + 1] === 'و' && w[i + 2] === 'بر')) {
      out.approx = true;
      i += t === 'دور' ? 3 : 1;
      continue;
    }
    if (PRICE.has(t)) {
      out.price = true;
      i++;
      continue;
    }
    const startsNumber = isDigits(t) || (SMALL.has(t) && (BIG_WORD(t) || SCALES.has(w[i + 1]) || isDigits(w[i + 1] ?? '') || SMALL.has(w[i + 1]) || w[i + 1] === 'و'));
    const n = startsNumber ? readNumber(w, i, { price: true }) : null;
    if (n && n.value > 0) {
      let j = i + n.len, value = n.value, kind = 'any', money = null;
      const scaled = w.slice(i, j).some((x) => SCALES.has(x));
      const u = w[j];
      if (u === 'تومان' || u === 'تومن' || u === 'ت') (kind = 'money'), (money = 'toman'), j++;
      else if (u === 'ریال' || u === 'ر') (kind = 'money'), (money = 'rial'), j++;
      else if (u === 'م' && isDigits(t)) {
        // «۶۰۰م» is six hundred million in a quick note
        value *= 1e6;
        j++;
        kind = 'money';
        if (w[j] === 'تومان' || w[j] === 'تومن') (money = 'toman'), j++;
        else if (w[j] === 'ریال') (money = 'rial'), j++;
      } else if (GRAM.has(u)) {
        kind = 'gram';
        j++;
        // «۴ گرم و ۳۵۰ سوت»
        if (w[j] === 'و' && isDigits(w[j + 1] ?? '') && w[j + 2] === 'سوت') (value += Number(w[j + 1]) / 1000), (j += 3);
      } else if (u === 'سوت') (kind = 'gram'), (value /= 1000), j++;
      else if (u === 'مثقال') (kind = 'mesghal'), j++;
      else if (COUNT.has(u)) {
        kind = 'count';
        j++;
        if (u === 'تا' && w[j] === 'سکه') j++; // «۳ تا سکه»: the word سکه stays in the reading, not in the filter
      }
      else if (scaled) kind = 'money';
      out.amounts.push({ value, kind, money, said: w.slice(i, j).join(' ') });
      i = j;
      continue;
    }
    if (!STOP.has(t) && t.length >= 2 && !/^\d/.test(t)) out.words.push(t);
    i++;
  }
  return out;
}

/** true when the text holds a number this search can read (the روزنگار box then searches every day). */
export const hasNumber = (text) => readQuery(text).amounts.length > 0;

/**
 * The bands searched, in the books' units: IRR (rial), G (grams), MQ (mesghal), N (count). A money figure typed
 * without a unit is read in `unit` (the switch on the page) or the shop's unit. tol: percent, or the default (5 with
 * «حدود», else 0). The bands are what the page shows, so the rule is never hidden.
 */
export function bandsOf(q, { shopMoney = 'rial', unit = null, tol = null } = {}) {
  const asked = tol === null || tol === undefined || tol === '' ? NaN : Number(tol);
  const pct = TOLERANCES.includes(asked) ? asked : q.approx ? 5 : 0;
  const bands = [];
  // the bounds are shown as they are (whole rials, grams to 3 decimals); eps only absorbs storage rounding
  const band = (u, target, said, extra = {}) => {
    const money = u === 'IRR' || u === 'RATE';
    const r = (x) => (money ? Math.round(x) : Math.round(x * 1000) / 1000);
    bands.push({ u, target, lo: r((target * (100 - pct)) / 100), hi: r((target * (100 + pct)) / 100), eps: money ? 0.5 : u === 'N' ? 1e-9 : 0.0005, said, ...extra });
  };
  const moneyUnit = (a) => a.money ?? (unit === 'toman' || unit === 'rial' ? unit : shopMoney === 'toman' ? 'toman' : 'rial');
  for (const a of q.amounts) {
    if (a.kind === 'money' || a.kind === 'any') {
      const m = moneyUnit(a);
      band(q.price ? 'RATE' : 'IRR', Math.round(a.value * (m === 'toman' ? 10 : 1)), a.said, { money: m, typedUnit: !!a.money });
    }
    if (a.kind === 'gram' || a.kind === 'any') band('G', a.value, a.said);
    if (a.kind === 'mesghal') band('MQ', a.value, a.said);
    if ((a.kind === 'count' || a.kind === 'any') && Number.isInteger(a.value)) band('N', a.value, a.said);
  }
  return { tol: pct, bands };
}

/**
 * Every figure of one document a person may remember, with its name: [{ u, v, label }]. u: IRR (rial), G (grams), MQ
 * (mesghal), N (count), RATE (rial per unit: مظنه, price). Values are positive; the same figure is listed once.
 */
export function figuresOf(d) {
  const out = [];
  const seen = new Set();
  const add = (u, v, label) => {
    const x = Math.abs(Number(v));
    if (!Number.isFinite(x) || x <= 0) return;
    const key = `${u}|${u === 'G' || u === 'MQ' ? B.r3(x) : Math.round(x * 100) / 100}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ u, v: x, label });
  };
  const c = d.calc ?? {};
  const base = !!B.DOC_TYPES[d.type]?.base;
  for (const p of c.payments ?? []) {
    const m = B.payMethod(p.method)?.label ?? p.method;
    add('IRR', p.value, `${p.dir === 'in' ? 'دریافت' : 'پرداخت'} ${m}`);
    add('G', p.g750, 'طلای تسویه (گرم ۷۵۰)');
    add('N', p.count, `سکه تسویه${p.coin ? ` ${COIN_TYPES[p.coin]?.short ?? ''}` : ''}`);
  }
  for (const l of c.lines ?? []) {
    const name = l.kind === 'coin' ? `سکه ${COIN_TYPES[l.coin]?.short ?? ''}`.trim() : TR.TRADE_KINDS[l.kind] ?? B.KIND_LABEL[l.kind] ?? l.kind;
    if (base) {
      add('IRR', l.value, `ارزش ${name}`);
      add('IRR', l.fee, 'اجرت پلمپ');
      add('RATE', l.mazaneh || l.impliedMazaneh, 'مظنه');
      add('RATE', l.g750Price, 'قیمت گرم ۷۵۰');
      if (l.kind === 'coin' && l.priced && l.count) add('RATE', l.value / l.count, `قیمت هر ${name}`);
      if (l.kind === 'fx') add('N', l.amt, `مقدار ${TR.FX_CODES[l.code] ?? l.code}`);
      if (l.kind === 'fx' && l.priced && l.amt) add('RATE', l.value / l.amt, 'نرخ ارز');
    } else {
      add('IRR', l.total, `مبلغ ${name}`);
      add('IRR', l.principal, `اصل ${name}`);
      add('IRR', l.consfee, 'اجرت');
      add('IRR', l.spro, 'سود');
      add('IRR', l.vat, 'مالیات');
      add('IRR', l.discount, 'تخفیف');
      add('IRR', l.stones, 'سنگ');
      add('RATE', l.fee, `قیمت واحد ${name}`);
    }
    add('G', l.weight, `وزن ${name}`);
    add('G', l.eq750 || l.g750, 'معادل ۷۵۰');
    add('MQ', l.mesghal, 'مثقال');
    if (l.kind === 'coin' || l.kind === 'goods') add('N', l.count || l.am, `تعداد ${name}`);
  }
  const pays = c.payments ?? [];
  if (pays.filter((p) => p.dir === 'in').length > 1) add('IRR', c.paidIn, 'جمع دریافت‌ها');
  if (pays.filter((p) => p.dir === 'out').length > 1) add('IRR', c.paidOut, 'جمع پرداخت‌ها');
  add('IRR', c.net, 'جمع سند');
  add('IRR', c.sells, 'جمع فروش');
  add('IRR', c.buys, 'جمع خرید');
  add('IRR', c.sales, 'جمع فاکتور');
  add('IRR', c.tradeIn, 'جمع طلای دریافتی');
  add('IRR', c.vat, 'جمع مالیات');
  add('IRR', c.credit, 'مانده روی حساب مشتری');
  if (c.hawala) add(c.hawala.unit === 'IRR' ? 'IRR' : c.hawala.unit === 'G750' ? 'G' : 'N', c.hawala.amount, 'مقدار حواله');
  if (c.convert) {
    add(c.convert.unit === 'G750' ? 'G' : 'N', c.convert.amount, 'مقدار تبدیل');
    add('IRR', c.convert.value, 'مبلغ تبدیل');
  }
  for (const b of d.balances ?? []) add(b.unit === 'IRR' ? 'IRR' : b.unit === 'G750' ? 'G' : 'N', b.amt, d.type === 'opening' ? 'مانده اول دوره' : 'اصلاح موجودی');
  return out;
}

/** One line that says what a document was, for a search result. */
export function summaryOf(d) {
  const c = d.calc ?? {};
  const money = (v) => B.fmtMoney(Math.round(v), 'rial');
  if (c.hawala) return `حواله ${c.hawala.unit === 'IRR' ? money(c.hawala.amount) : c.hawala.unit === 'G750' ? `${B.fmtG(c.hawala.amount)} گرم` : B.faNum(c.hawala.amount)}`;
  if (c.convert) return `تبدیل مانده به ${money(Math.abs(c.convert.value))}`;
  const bits = [];
  for (const l of (c.lines ?? []).slice(0, 3)) {
    const name = l.kind === 'coin' ? `سکه ${COIN_TYPES[l.coin]?.short ?? ''}`.trim() : TR.TRADE_KINDS[l.kind] ?? B.KIND_LABEL[l.kind] ?? l.kind;
    const verb = B.DOC_TYPES[d.type]?.base ? (l.priced ? (l.dir === 'in' ? 'خرید' : 'فروش') : l.dir === 'in' ? 'دریافت' : 'تحویل') : '';
    const qty = l.kind === 'coin' || l.kind === 'goods' ? `${B.faNum(l.count || l.am || 0)} عدد` : l.weight ? `${B.fmtG(l.weight)} گرم` : '';
    bits.push([verb, name, qty].filter(Boolean).join(' '));
  }
  if ((c.lines ?? []).length > 3) bits.push(`و ${B.faNum(c.lines.length - 3)} ردیف دیگر`);
  for (const p of (c.payments ?? []).slice(0, 2)) bits.push(`${p.dir === 'in' ? 'دریافت' : 'پرداخت'} ${B.payMethod(p.method)?.label ?? p.method}`);
  return bits.join(' · ') || B.DOC_TYPES[d.type]?.label || d.type;
}
