// Base edition (نسخه پایه): the arithmetic of a coin and molten-gold dealer. Every figure is an integer RIAL;
// weights in grams (3 decimals). A trade line either converts (priced: goods ↔ money) or only moves goods
// (unpriced: the goods land on the customer's goods account — gold in grams of 750, coins by type, sealed bars
// by serial, foreign currency by code), exactly how a gold desk keeps «ته‌حساب جنسی» apart from «ته‌حساب ریالی»
// so that a moving مظنه never distorts anyone's balance.
import { MESGHAL_G, MAZANEH_FINENESS } from './calc.mjs';
import { TRADE_COINS as COIN_TYPES, shownCoins } from './coins.mjs';
import { num, rnd, r3, digitsOnly, BookError, calcPayment, payMethod } from './books.mjs';
import { mulDiv, quant, sum } from './exact.mjs';

export const TRADE_KINDS = { melt: 'آبشده', coin: 'سکه', bar: 'شمش پلمپ', fx: 'ارز' };
export const FX_CODES = {
  USD: 'دلار آمریکا', EUR: 'یورو', AED: 'درهم امارات', GBP: 'پوند انگلیس', TRY: 'لیر ترکیه', CNY: 'یوان چین', IQD: 'دینار عراق', CAD: 'دلار کانادا',
  AUD: 'دلار استرالیا', CHF: 'فرانک سوئیس', RUB: 'روبل روسیه', JPY: 'ین ژاپن', KWD: 'دینار کویت', OMR: 'ریال عمان', SAR: 'ریال عربستان', QAR: 'ریال قطر', AFN: 'افغانی', USDT: 'تتر',
};
export const ROUND_STEPS = [1, 1000, 10000, 100000];
export const TRADE_DOCS = new Set(['trade', 'hawala', 'convert', 'writeoff', 'transform']);
/** The expense a melter's or lab's fee on a ذوب و تبدیل document is booked under. */
export const MELT_FEE_CATEGORY = 'ذوب و ری‌گیری';
/** Gold in one coin, in grams of 750, from its official weight and fineness (shop products: their own card). */
export function coinEq750(id) {
  const c = COIN_TYPES[id];
  need(c && c.weight > 0 && c.fineness > 0, 'وزن و عیار این سکه تعریف نشده است.');
  return (c.weight * c.fineness) / 750;
}

const need = (c, m) => {
  if (!c) throw new BookError(m);
};
const pos = (v, label, max = 1e15) => {
  const x = num(v);
  need(Number.isFinite(x) && x > 0 && x <= max, `${label} نامعتبر است.`);
  return x;
};
const fineness = (v) => {
  const f = num(v);
  need(Number.isFinite(f) && f >= 1 && f <= 1000, 'عیار باید بین ۱ تا ۱۰۰۰ باشد.');
  return f;
};
/** A bar serial as printed on the card: Persian/Arabic digits to Latin, no spaces, upper case. */
export const normSerial = (v) =>
  String(v ?? '')
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/\s+/g, '')
    .toUpperCase();
/** A decimal rounded half away from zero to a multiple of step, exactly (spec 0045). */
export const roundTo = (x, step = 1) => quant(x, step);

/* ---------------- gold arithmetic (rial) ---------------- */
/** Rial price of one gram of 750 from the rial مظنه (price of one mesghal of 705 gold). */
export const g750FromMazaneh = (mazR) => (num(mazR) * 750) / (MESGHAL_G * MAZANEH_FINENESS);
export const mazanehFromG750 = (g750R) => (num(g750R) * MESGHAL_G * MAZANEH_FINENESS) / 750;
/** Weight equivalents of a piece: 750-grams (the account unit), mesghals of 705, pure grams. */
export const equivalents = (w, f) => ({ eq750: mulDiv([w, f], [750], 0.001), mesghal: mulDiv([w, f], [MAZANEH_FINENESS, MESGHAL_G], 0.001), pure: mulDiv([w, f], [1000], 0.001) });

/**
 * Price of gold by its basis: مظنه, price of a gram of 750, or an agreed total. Exact (spec 0045): by مظنه the value is
 * eq750 × مظنه × 750 ÷ (4.6083 × 705), one fraction, rounded once to the step.
 */
function goldValue(l, eq750, step) {
  const basis = l.basis ?? 'mazaneh';
  if (basis === 'amount') return quant(pos(l.amount, 'مبلغ توافقی'));
  if (basis === 'gram750') return mulDiv([eq750, pos(l.g750, 'قیمت گرم ۷۵۰')], [], step);
  need(basis === 'mazaneh', 'مبنای قیمت نامعتبر است.');
  return mulDiv([eq750, pos(l.mazaneh, 'مظنه'), 750], [MESGHAL_G, MAZANEH_FINENESS], step);
}

/**
 * One trade line. dir: 'in' = the customer hands it to the shop (buy when priced), 'out' = the shop hands it over.
 * Returns the money value (0 when unpriced), the goods on the customer's account and the shop's stock move.
 */
export function tradeLine(l, { round = 10000 } = {}) {
  const dir = l.dir === 'out' ? 'out' : 'in';
  need(TRADE_KINDS[l.kind], 'نوع کالا نامعتبر است.');
  const priced = l.priced !== false;
  const o = { kind: l.kind, dir, priced, value: 0, fee: 0, eq750: 0, mesghal: 0, pure: 0, weight: 0, fineness: 0, count: 0, unit: '', amt: 0, stock: '', impliedMazaneh: 0 };
  if (l.kind === 'melt' || l.kind === 'bar') {
    o.weight = quant(pos(l.weight, 'وزن', 1e6), 0.001);
    o.fineness = fineness(l.fineness ?? 750);
    Object.assign(o, equivalents(o.weight, o.fineness));
    if (l.kind === 'melt') {
      o.unit = 'G750';
      o.amt = o.eq750;
      o.stock = 'gold';
    } else {
      const serial = normSerial(l.serial);
      need(/^[A-Z0-9-]{3,30}$/.test(serial), 'سریال شمش را وارد کنید (۳ تا ۳۰ رقم یا حرف لاتین).');
      o.serial = serial;
      o.unit = `BAR:${serial}`;
      o.amt = 1;
      o.stock = `bar:${serial}`;
      o.count = 1;
    }
    if (priced) {
      o.value = goldValue(l, o.eq750, round);
      if (l.kind === 'bar' && l.fee) {
        const fee = num(l.fee);
        need(Number.isFinite(fee), 'اجرت پلمپ نامعتبر است.');
        o.fee = quant(fee);
        need(o.fee >= 0, 'اجرت پلمپ نامعتبر است.');
        o.value += o.fee;
      }
      o.impliedMazaneh = o.eq750 ? mulDiv([o.value - o.fee, MESGHAL_G, MAZANEH_FINENESS], [o.eq750, 750]) : 0;
      o.basis = l.basis ?? 'mazaneh';
      if (o.basis === 'mazaneh') o.mazaneh = quant(num(l.mazaneh)); // the rate agreed at the counter, as typed
      if (o.basis === 'gram750') o.g750Price = quant(num(l.g750));
    }
  } else if (l.kind === 'coin') {
    need(COIN_TYPES[l.coin], 'نوع سکه نامعتبر است.');
    o.coin = l.coin;
    o.count = pos(l.count, 'تعداد سکه', 1e6);
    need(Number.isInteger(o.count), 'تعداد سکه باید عدد صحیح باشد.');
    o.unit = `COIN:${l.coin}`;
    o.amt = o.count;
    o.stock = `coin:${l.coin}`;
    if (priced) {
      const basis = l.basis ?? 'count';
      if (basis === 'count') o.value = o.count * quant(pos(l.price, 'قیمت هر سکه'));
      else if (basis === 'weight') {
        o.weight = quant(pos(l.weight, 'وزن سکه‌ها', 1e5), 0.001);
        o.value = mulDiv([o.weight, pos(l.gramPrice, 'قیمت هر گرم')], [], round);
      } else if (basis === 'amount') o.value = quant(pos(l.amount, 'مبلغ توافقی'));
      else throw new BookError('مبنای قیمت سکه نامعتبر است.');
    }
  } else {
    const code = String(l.code ?? '').toUpperCase();
    need(FX_CODES[code], 'نوع ارز نامعتبر است.');
    o.code = code;
    o.amt = quant(pos(l.fxAmount, 'مقدار ارز', 1e12), 0.01);
    o.unit = `FX:${code}`;
    o.stock = `fx:${code}`;
    if (priced) o.value = mulDiv([o.amt, pos(l.rate, 'نرخ ارز')]);
  }
  return o;
}

/** A whole trade document: lines, money received/paid, and what is left on the customer's rial account. */
export function calcTrade(doc, { round = 10000 } = {}) {
  const step = doc.round ?? round;
  need(ROUND_STEPS.includes(step), 'گام گرد کردن نامعتبر است.');
  if (doc.type === 'hawala') return calcHawala(doc);
  if (doc.type === 'convert') return calcConvert(doc, step);
  if (doc.type === 'writeoff') return calcWriteoff(doc);
  if (doc.type === 'transform') return calcTransform(doc);
  const lines = (doc.lines ?? []).map((l, i) => {
    try {
      return tradeLine(l, { round: step });
    } catch (e) {
      throw e instanceof BookError ? new BookError(`ردیف ${i + 1}: ${e.message}`) : e;
    }
  });
  need(lines.length || (doc.payments ?? []).length, 'سند معامله دست‌کم یک ردیف یا یک دریافت/پرداخت دارد.');
  const sells = lines.filter((l) => l.priced && l.dir === 'out').reduce((s, l) => s + l.value, 0);
  const buys = lines.filter((l) => l.priced && l.dir === 'in').reduce((s, l) => s + l.value, 0);
  const payments = (doc.payments ?? []).map((p, i) => {
    try {
      const m = payMethod(p.method);
      need(m && !['gold', 'coin', 'fx'].includes(m.id), 'در سند معامله طلا، سکه و ارز را به‌صورت ردیف ثبت کنید، نه روش پرداخت.');
      // payments of the base edition are typed in rial; the shared validator takes toman
      return calcPayment({ ...p, amount: num(p.amount) / 10 }, 'trade');
    } catch (e) {
      throw e instanceof BookError ? new BookError(`پرداخت ${i + 1}: ${e.message}`) : e;
    }
  });
  const paidIn = payments.filter((p) => p.dir === 'in').reduce((s, p) => s + p.value, 0);
  const paidOut = payments.filter((p) => p.dir === 'out').reduce((s, p) => s + p.value, 0);
  const net = sells - buys;
  const goods = {};
  for (const l of lines) if (!l.priced) goods[l.unit] = r(goods[l.unit], (l.dir === 'out' ? 1 : -1) * l.amt, l.unit);
  return { type: 'trade', lines, payments, sells, buys, net, paidIn, paidOut, credit: net - paidIn + paidOut, goods, round: step, sales: sells, tradeIn: buys, vat: 0, creditUnit: 'IRR', creditG: 0 };
}
const r = (a, b, unit) => sum([a ?? 0, b], unit === 'G750' ? 0.001 : 0.01);

/** Units a customer account can hold. */
export function validUnit(u) {
  return u === 'IRR' || u === 'G750' || /^COIN:\w+$/.test(u) && !!COIN_TYPES[u.slice(5)] || /^FX:[A-Z]+$/.test(u) && !!FX_CODES[u.slice(3)] || /^BAR:[A-Z0-9-]{3,30}$/.test(u);
}
const qty = (u, v, label) => {
  const x = num(v);
  need(Number.isFinite(x) && x !== 0, `${label} نامعتبر است.`);
  if (u === 'IRR') return quant(x);
  if (u === 'G750') return quant(x, 0.001);
  if (u.startsWith('COIN:') || u.startsWith('BAR:')) {
    need(Number.isInteger(x), 'تعداد باید عدد صحیح باشد.');
    return x;
  }
  return quant(x, 0.01);
};

/** حواله: one customer's balance moves to another (A becomes debtor by the amount, B creditor). */
function calcHawala(doc) {
  const h = doc.hawala ?? {};
  need(h.from && h.to && h.from !== h.to, 'مبدأ و مقصد حواله باید دو طرف حساب متفاوت باشند.');
  need(validUnit(h.unit), 'واحد حواله نامعتبر است.');
  const amount = qty(h.unit, h.amount, 'مقدار حواله');
  need(amount > 0, 'مقدار حواله باید مثبت باشد.');
  return { type: 'hawala', lines: [], payments: [], hawala: { from: h.from, to: h.to, unit: h.unit, amount }, net: 0, paidIn: 0, paidOut: 0, credit: 0, sales: 0, tradeIn: 0, vat: 0, creditUnit: 'IRR', creditG: 0 };
}

/**
 * تبدیل مانده: settle a goods balance in money at a price. amount > 0 = the customer's goods debt becomes a rial
 * debt (as if the shop sold it); amount < 0 = the shop's goods debt to the customer becomes a rial debt of the shop.
 */
function calcConvert(doc, step) {
  const c = doc.convert ?? {};
  need(validUnit(c.unit) && c.unit !== 'IRR', 'واحد تبدیل نامعتبر است.');
  need(!c.unit.startsWith('BAR:'), 'شمش پلمپ را با ردیف فروش یا خرید تبدیل کنید.');
  const amount = qty(c.unit, c.amount, 'مقدار');
  let value;
  if (c.unit === 'G750') value = c.basis === 'gram750' ? mulDiv([Math.abs(amount), pos(c.g750, 'قیمت گرم ۷۵۰')], [], step) : mulDiv([Math.abs(amount), pos(c.mazaneh, 'مظنه'), 750], [MESGHAL_G, MAZANEH_FINENESS], step);
  else value = mulDiv([Math.abs(amount), pos(c.price, 'نرخ')]);
  const s = Math.sign(amount);
  return { type: 'convert', lines: [], payments: [], convert: { unit: c.unit, amount, value }, net: s * value, paidIn: 0, paidOut: 0, credit: s * value, sales: 0, tradeIn: 0, vat: 0, creditUnit: 'IRR', creditG: 0 };
}

/**
 * سوخت یا بخشودگی مانده: part or all of one customer's balance in one unit is cleared. amount has the sign of the
 * balance it clears: > 0 = the customer owed the shop (a loss), < 0 = the shop owed the customer (a gain). A sealed bar
 * carries its card's 750-equivalent (eq750) so the trading result knows its gold.
 */
function calcWriteoff(doc) {
  const w = doc.writeoff ?? {};
  need(validUnit(w.unit), 'واحد مانده نامعتبر است.');
  const amount = qty(w.unit, w.amount, 'مقدار');
  const o = { unit: w.unit, amount };
  if (w.unit === 'IRR') o.value = amount;
  if (w.unit.startsWith('BAR:')) {
    need(Math.abs(amount) === 1, 'هر شمش یک عدد است.');
    if (num(w.eq750) > 0) o.eq750 = quant(num(w.eq750), 0.001);
  }
  return { type: 'writeoff', lines: [], payments: [], writeoff: o, net: 0, paidIn: 0, paidOut: 0, credit: 0, sales: 0, tradeIn: 0, vat: 0, creditUnit: 'IRR', creditG: 0 };
}

/**
 * ذوب و تبدیل جنس: what leaves the vault (dir out: melted gold, sealed bars, coins) and what comes back (dir in: melted
 * gold, new sealed bars). wastage = 750-equivalent out − 750-equivalent in (> 0 a loss, < 0 a better assay). A coin's
 * gold is its official weight × fineness. An optional fee (payments out, in rial) is the melter's or lab's.
 */
function calcTransform(doc) {
  const lines = (doc.lines ?? []).map((l, i) => {
    try {
      const o = tradeLine({ ...l, priced: false });
      need(o.kind !== 'fx', 'ارز ذوب نمی‌شود.');
      if (o.dir === 'in') need(o.kind !== 'coin', 'از ذوب، آبشده یا شمش بیرون می‌آید، نه سکه.');
      if (o.kind === 'coin') o.eq750 = mulDiv([o.count, COIN_TYPES[o.coin].weight, COIN_TYPES[o.coin].fineness], [750], 0.001);
      return o;
    } catch (e) {
      throw e instanceof BookError ? new BookError(`ردیف ${i + 1}: ${e.message}`) : e;
    }
  });
  const inputs = sum(lines.filter((l) => l.dir === 'out').map((l) => l.eq750), 0.001);
  const outputs = sum(lines.filter((l) => l.dir === 'in').map((l) => l.eq750), 0.001);
  need(inputs > 0, 'آنچه به ذوب می‌رود (خروج از گاوصندوق) را وارد کنید.');
  need(outputs > 0, 'آنچه از ذوب برمی‌گردد (ورود به گاوصندوق) را وارد کنید.');
  // a melting neither doubles gold nor loses half of it: such a figure is a typing mistake
  need(outputs >= inputs * 0.5 && outputs <= inputs * 1.5, 'اختلاف ورودی و خروجی ذوب بیش از نصف است؛ وزن و عیارها را بازبینی کنید.');
  const payments = (doc.payments ?? []).map((p, i) => {
    try {
      const m = payMethod(p.method);
      need(m && !['gold', 'coin', 'fx'].includes(m.id), 'اجرت ذوب را با وجه بپردازید.');
      const x = calcPayment({ ...p, amount: num(p.amount) / 10 }, 'transform');
      need(x.dir === 'out', 'در سند ذوب فقط اجرت پرداخت می‌شود.');
      return x;
    } catch (e) {
      throw e instanceof BookError ? new BookError(`پرداخت ${i + 1}: ${e.message}`) : e;
    }
  });
  const paidOut = payments.reduce((s, p) => s + p.value, 0);
  return { type: 'transform', lines, payments, inputs, outputs, wastage: sum([inputs, -outputs], 0.001), fee: paidOut, net: 0, paidIn: 0, paidOut, credit: 0, sales: 0, tradeIn: 0, vat: 0, creditUnit: 'IRR', creditG: 0 };
}

/**
 * Postings of a base-edition document. Party + = the customer owes (money or goods); stock accounts are what the
 * shop physically holds: gold (grams of 750), coin:<type>, bar:<serial>, fx:<code>, cash:<id>, bank:<id>, chq:<id>.
 */
export function tradePostings(doc, calc) {
  const out = [];
  const add = (acct, unit, amt) => amt && out.push({ acct, unit, amt });
  const party = doc.partyId ? `party:${doc.partyId}` : 'walkin';
  if (calc.type === 'hawala') {
    add(`party:${calc.hawala.from}`, calc.hawala.unit, calc.hawala.amount);
    add(`party:${calc.hawala.to}`, calc.hawala.unit, -calc.hawala.amount);
    return out;
  }
  if (calc.type === 'convert') {
    add(party, calc.convert.unit, -calc.convert.amount);
    add(party, 'IRR', calc.net);
    return out;
  }
  if (calc.type === 'writeoff') {
    // the customer's balance falls by what is cleared; «wo» keeps the same amount, so every write-off is summable
    add(party, calc.writeoff.unit, -calc.writeoff.amount);
    add('wo', calc.writeoff.unit, calc.writeoff.amount);
    return out;
  }
  if (calc.type === 'transform') {
    for (const l of calc.lines) add(l.stock, l.unit === 'G750' ? 'G750' : 'COUNT', (l.dir === 'in' ? 1 : -1) * l.amt);
    for (const [i, p] of calc.payments.entries()) {
      const src = doc.payments[i];
      const m = payMethod(p.method);
      if (m.acct === 'cash') add(`cash:${src.account || 'main'}`, 'IRR', -p.value);
      else if (m.acct === 'bank') add(`bank:${src.account || 'main'}`, 'IRR', -p.value);
      else if (m.acct === 'cheque') add(`chq:${src.chequeId || 'new'}`, 'IRR', -p.value);
      else if (m.acct === 'party') add(party, 'IRR', -p.value); // owed to the melter
      add(`exp:${MELT_FEE_CATEGORY}`, 'IRR', p.value);
    }
    return mergePostings(out);
  }
  for (const l of calc.lines) {
    const k = l.dir === 'in' ? 1 : -1;
    const stockUnit = l.unit === 'G750' ? 'G750' : l.unit.startsWith('FX:') ? 'FX' : 'COUNT';
    add(l.stock, stockUnit, k * l.amt);
    if (l.priced) add(party, 'IRR', -k * l.value);
    else add(party, l.unit, -k * l.amt);
  }
  for (const [i, p] of calc.payments.entries()) {
    const src = doc.payments[i];
    const k = p.dir === 'in' ? 1 : -1;
    const m = payMethod(p.method);
    add(party, 'IRR', -k * p.value);
    if (m.acct === 'cash') add(`cash:${src.account || 'main'}`, 'IRR', k * p.value);
    else if (m.acct === 'bank') add(`bank:${src.account || 'main'}`, 'IRR', k * p.value);
    else if (m.acct === 'cheque') add(`chq:${src.chequeId || 'new'}`, 'IRR', k * p.value);
    else if (m.acct === 'party') add(party, 'IRR', k * p.value);
  }
  return mergePostings(out);
}
/** One line per account and unit. */
function mergePostings(out) {
  const m = new Map();
  for (const p of out) m.set(`${p.acct}|${p.unit}`, (m.get(`${p.acct}|${p.unit}`) ?? 0) + p.amt);
  return [...m].map(([key, amt]) => {
    const [acct, unit] = key.split('|');
    return { acct, unit, amt: unit === 'G750' ? r3(amt) : unit === 'FX' || unit.startsWith('FX:') ? Math.round(amt * 100) / 100 : amt };
  }).filter((p) => p.amt !== 0);
}

/* ---------------- trading result: average cost, realized and open position ---------------- */
/**
 * Positions the shop owns (physical stock + goods owed to it − goods it owes), at weighted-average cost, and the
 * realized profit of every priced trade. events: final documents in time order as { date, type, calc, data }.
 * Unpriced moves change what the shop holds and owes equally, so they do not touch the position.
 */
const rnd3 = (x) => Math.round(x * 1000) / 1000;
const BOOK_DOCS = new Set(['sale', 'buy', 'return', 'receipt', 'payment', 'expense', 'income']);
const goodsKey = (unit) => (unit === 'G750' ? 'G750' : /^(COIN|FX):/.test(unit) ? unit : null);
const balanceKey = (b) => {
  // a sealed bar is gold: its 750-equivalent joins the G750 position (when its card is known)
  const bar = b.acct.startsWith('bar:') && b.weight ? rnd3((b.weight * (b.fineness ?? 995)) / 750) : 0;
  if (b.acct === 'gold' || bar) return { key: 'G750', q: bar ? bar * Math.sign(b.amt) : b.amt };
  if (b.acct.startsWith('coin:')) return { key: `COIN:${b.acct.slice(5)}`, q: b.amt };
  if (b.acct.startsWith('fx:')) return { key: `FX:${b.acct.slice(3)}`, q: b.amt };
  // what a customer owes in goods (or is owed) at the opening is part of what the shop owns
  if (b.acct.startsWith('party:') && goodsKey(b.unit)) return { key: goodsKey(b.unit), q: b.amt };
  return null;
};

/**
 * What one final document does to the goods the shop owns (physical + owed to it − owed by it), in the order the
 * trading result and the FIFO lots replay it. The one place that knows which documents move a position:
 *   buy  — enters at a value (a purchase, gold or coins taken as payment, a gold credit);
 *   sell — leaves at a value (a sale, gold or coins given as payment), realizing against cost;
 *   lose — leaves at no value (a count shortage, a forgiven goods debt), a realized loss at cost;
 *   book — an opening balance, at its cost, never realizing;
 *   move — a melting: inputs leave at cost, outputs carry it on, wastage is a loss.
 */
export function movesOf(e) {
  const c = e.calc ?? {};
  const out = [];
  if (e.type === 'trade') {
    (c.lines ?? []).forEach((l, i) => {
      if (!l.priced) return;
      const gold = l.kind === 'melt' || l.kind === 'bar';
      out.push({ op: l.dir === 'in' ? 'buy' : 'sell', key: gold ? 'G750' : l.unit, q: gold ? l.eq750 : l.amt, value: l.value - (l.fee ?? 0), line: i, kind: l.kind, serial: l.serial ?? null, weight: l.weight ?? null, fineness: l.fineness ?? null });
    });
  } else if (e.type === 'convert') {
    const { unit, amount, value } = c.convert;
    out.push({ op: amount > 0 ? 'sell' : 'buy', key: unit, q: Math.abs(amount), value });
  } else if (e.type === 'writeoff') {
    const { unit, amount, eq750 } = c.writeoff;
    const key = unit.startsWith('BAR:') ? (eq750 ? 'G750' : null) : goodsKey(unit);
    // a forgiven goods debt leaves at no value; goods the customer leaves us come in at no cost (a gain when sold)
    if (key) out.push(amount > 0 ? { op: 'lose', key, q: unit.startsWith('BAR:') ? eq750 : amount } : { op: 'buy', key, q: unit.startsWith('BAR:') ? eq750 : -amount, value: 0 });
  } else if (e.type === 'transform') {
    const ins = (c.lines ?? []).filter((l) => l.dir === 'out').map((l) => ({ key: l.kind === 'coin' ? l.unit : 'G750', q: l.kind === 'coin' ? l.amt : l.eq750, eq750: l.eq750 }));
    const outs = (c.lines ?? []).filter((l) => l.dir === 'in').map((l, i) => ({ key: 'G750', q: l.eq750, line: i, kind: l.kind, serial: l.serial ?? null, weight: l.weight ?? null, fineness: l.fineness ?? null }));
    out.push({ op: 'move', inputs: ins, outputs: outs });
  } else if (e.type === 'opening' || e.type === 'adjust') {
    const rows = (e.data?.balances ?? []).map((b, i) => ({ b, i, k: balanceKey(b), party: b.acct.startsWith('party:') })).filter((x) => x.k && x.k.q);
    // a customer's goods at the opening carry no price of their own: they are valued at the average cost of the same
    // goods the shop holds in this opening, so grams owed either way neither add nor hide profit (spec 0026); they come
    // after the shop's own rows, so what the shop owes is taken from lots that exist
    const avg = {};
    for (const { b, k, party } of rows) if (!party && b.cost && k.q > 0) (avg[k.key] ??= { q: 0, c: 0 }), (avg[k.key].q += k.q), (avg[k.key].c += b.cost);
    for (const { b, i, k, party } of [...rows.filter((x) => !x.party), ...rows.filter((x) => x.party)]) {
      if (e.type === 'opening') {
        const cost = b.cost ?? (party && avg[k.key] ? rnd((k.q * avg[k.key].c) / avg[k.key].q) : 0);
        out.push({ op: 'book', key: k.key, q: k.q, cost, line: i, serial: b.acct.startsWith('bar:') ? b.acct.slice(4) : null, weight: b.weight ?? null, fineness: b.fineness ?? null });
      } else if (party) continue;
      else if (k.q > 0) out.push({ op: 'buy', key: k.key, q: k.q, value: b.cost ?? 0, line: i, serial: b.acct.startsWith('bar:') ? b.acct.slice(4) : null });
      // a shortage found by counting leaves at no price: its average cost is the loss of that day
      else out.push({ op: 'lose', key: k.key, q: -k.q, line: i });
    }
  }
  if (BOOK_DOCS.has(e.type)) {
    for (const l of c.lines ?? []) {
      const side = e.type === 'return' ? l.side === 'out' : l.side === 'in';
      if (l.kind === 'melt' || l.kind === 'used') out.push({ op: side ? 'buy' : 'sell', key: 'G750', q: l.g750, value: l.total });
      if (l.kind === 'coin') out.push({ op: side ? 'buy' : 'sell', key: `COIN:${l.coin}`, q: l.count, value: l.total });
    }
    // gold and coins taken or given as payment are bought or sold at the value the document gives them
    for (const p of c.payments ?? []) {
      if (p.method === 'gold' && p.g750) out.push({ op: p.dir === 'in' ? 'buy' : 'sell', key: 'G750', q: p.g750, value: p.value });
      if (p.method === 'coin' && p.count) out.push({ op: p.dir === 'in' ? 'buy' : 'sell', key: `COIN:${p.coin}`, q: p.count, value: p.value });
    }
    // a balance left as gold (نسیه طلایی): the grams owed are bought, or the grams the shop owes are sold, at its value
    if (c.creditUnit === 'G750' && c.credit && c.creditG) out.push({ op: c.credit > 0 ? 'buy' : 'sell', key: 'G750', q: Math.abs(c.creditG), value: Math.abs(c.credit) });
  }
  // an opening balance may be negative (goods the shop owes); every other move carries a positive quantity
  return out.filter((m) => (m.op === 'move' ? true : m.op === 'book' ? m.q !== 0 : m.q > 0));
}

export function positionReport(events) {
  const P = {};
  const byDay = {};
  const byDayKey = {}; // day → unit → realized: what روزنگار shows inside one section (spec 0027)
  const realize = (date, key, v) => {
    byDay[date] = (byDay[date] ?? 0) + v;
    const d = (byDayKey[date] ??= {});
    d[key] = (d[key] ?? 0) + v;
  };
  const pos_ = (k) => (P[k] ??= { qty: 0, cost: 0, realized: 0, bought: 0, sold: 0 });
  const trade = (key, q, value, date, dir) => {
    const p = pos_(key);
    let realized = 0;
    if (dir === 'in') {
      if (p.qty < 0) {
        // buying back a short position realizes against its average
        const cover = Math.min(q, -p.qty), avg = p.cost / p.qty;
        realized = avg * cover - (value * cover) / q;
        p.cost -= avg * cover;
        p.qty += cover;
        const rest = q - cover;
        if (rest > 0) (p.qty += rest), (p.cost += (value * rest) / q);
      } else (p.qty += q), (p.cost += value);
      p.bought += q;
    } else {
      if (p.qty > 0) {
        const sell = Math.min(q, p.qty), avg = p.cost / p.qty;
        realized = (value * sell) / q - avg * sell;
        p.cost -= avg * sell;
        p.qty -= sell;
        const rest = q - sell;
        if (rest > 0) (p.qty -= rest), (p.cost -= (value * rest) / q);
      } else (p.qty -= q), (p.cost -= value);
      p.sold += q;
    }
    if (Math.abs(p.qty) < 1e-9) (p.qty = 0), (p.cost = 0);
    p.realized += realized;
    realize(date, key, realized);
  };
  for (const e of events)
    for (const m of movesOf(e)) {
      if (m.op === 'buy') trade(m.key, m.q, m.value, e.date, 'in');
      else if (m.op === 'sell') trade(m.key, m.q, m.value, e.date, 'out');
      else if (m.op === 'lose') trade(m.key, m.q, 0, e.date, 'out');
      else if (m.op === 'book') {
        // an opening balance is a fact at a cost, not a trade: it never realizes, whatever the order of its rows
        const p = pos_(m.key);
        p.qty += m.q;
        p.cost += m.cost;
        if (m.q > 0) p.bought += m.q;
        if (Math.abs(p.qty) < 1e-9) (p.qty = 0), (p.cost = 0);
      } else if (m.op === 'move') {
        // a melting: each input leaves at its average cost (nothing realized), the outputs carry that cost on; the
        // part of the gold that did not come back (wastage) is a loss at cost on the day
        let cost = 0, eqIn = 0;
        for (const x of m.inputs) {
          const p = pos_(x.key);
          const own = Math.min(x.q, Math.max(0, p.qty));
          const c = own > 0 ? (p.cost / p.qty) * own : 0;
          p.cost -= c;
          p.qty -= x.q;
          if (Math.abs(p.qty) < 1e-9) (p.qty = 0), (p.cost = 0);
          cost += c;
          eqIn += x.eq750;
        }
        const eqOut = m.outputs.reduce((s, x) => s + x.q, 0);
        const keep = eqIn > 0 ? Math.min(1, eqOut / eqIn) : 1;
        for (const x of m.outputs) {
          const p = pos_(x.key);
          p.qty += x.q;
          p.cost += eqOut > 0 ? (cost * keep * x.q) / eqOut : 0;
        }
        const loss = cost * (1 - keep);
        if (loss) {
          pos_('G750').realized -= loss;
          realize(e.date, 'G750', -loss);
        }
      }
    }
  for (const p of Object.values(P)) (p.cost = rnd(p.cost)), (p.realized = rnd(p.realized)), (p.qty = Math.round(p.qty * 1000) / 1000);
  return { positions: P, byDay: Object.fromEntries(Object.entries(byDay).map(([d, v]) => [d, rnd(v)])), byDayKey: Object.fromEntries(Object.entries(byDayKey).map(([d, o]) => [d, Object.fromEntries(Object.entries(o).map(([k, v]) => [k, rnd(v)]))])) };
}

/* ---------------- bank reconciliation ---------------- */
/**
 * Match a bank statement against the book's bank movements: same amount and direction, dates at most `days`
 * apart; an equal reference wins, otherwise the closest date. Each side is used once.
 * book: [{ id, date, amt (rial, + in), ref }], stmt: [{ date, amt, ref }]
 */
export function matchStatement(book, stmt, { days = 3 } = {}) {
  const used = new Set();
  const dd = (a, b) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000;
  const clean = (s) => digitsOnly(s);
  const matches = [], unmatched = [];
  for (const [i, s] of stmt.entries()) {
    const cands = book.filter((b) => !used.has(b.id) && b.amt === s.amt && dd(b.date, s.date) <= days);
    const best = cands.find((b) => s.ref && b.ref && clean(b.ref) && clean(b.ref) === clean(s.ref)) ?? cands.sort((a, b) => dd(a.date, s.date) - dd(b.date, s.date))[0];
    if (best) {
      used.add(best.id);
      matches.push({ stmt: i, book: best.id, byRef: !!(s.ref && best.ref && clean(best.ref) === clean(s.ref)) });
    } else unmatched.push(i);
  }
  return { matches, unmatchedStatement: unmatched, unmatchedBook: book.filter((b) => !used.has(b.id)).map((b) => b.id) };
}

/** Parse pasted statement rows: «date, amount, ref» per line (Jalali or Gregorian dates, Persian digits, − for out). */
export function parseStatement(text, toIso) {
  const rows = [], errors = [];
  for (const [i, raw] of String(text).split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (!line) continue;
    const parts = line.split(/[\t,;|]+/).map((x) => x.trim()).filter(Boolean);
    const date = toIso(parts[0]);
    const amt = num(String(parts[1] ?? '').replace(/[()]/g, ''));
    if (!date || !Number.isFinite(amt) || amt === 0) {
      errors.push(`سطر ${i + 1}`);
      continue;
    }
    rows.push({ date, amt: rnd(amt), ref: parts[2] ?? '' });
  }
  return { rows, errors };
}

/* ---------------- names: telling same-name customers apart ---------------- */
export const normName = (s) =>
  String(s ?? '')
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[‌‏‎]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
/** The label that separates two «علی کریمی»s: code, alias, father, city, last digits of mobile. */
export function partyLabel(p) {
  const bits = [p.alias && `«${p.alias}»`, p.father && `فرزند ${p.father}`, p.city, p.mobile && `…${String(p.mobile).slice(-4).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d])}`].filter(Boolean);
  return `${p.name}${bits.length ? ` (${bits.join('، ')})` : ''}`;
}
