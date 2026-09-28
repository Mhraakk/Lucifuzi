// Base edition (نسخه پایه): the arithmetic of a coin and molten-gold dealer. Every figure is an integer RIAL;
// weights in grams (3 decimals). A trade line either converts (priced: goods ↔ money) or only moves goods
// (unpriced: the goods land on the customer's goods account — gold in grams of 750, coins by type, sealed bars
// by serial, foreign currency by code), exactly how a gold desk keeps «ته‌حساب جنسی» apart from «ته‌حساب ریالی»
// so that a moving مظنه never distorts anyone's balance.
import { MESGHAL_G, MAZANEH_FINENESS } from './calc.mjs';
import { COIN_TYPES } from './coins.mjs';
import { num, rnd, r3, digitsOnly, BookError, calcPayment, payMethod } from './books.mjs';

export const TRADE_KINDS = { melt: 'آبشده', coin: 'سکه', bar: 'شمش پلمپ', fx: 'ارز' };
export const FX_CODES = {
  USD: 'دلار آمریکا', EUR: 'یورو', AED: 'درهم امارات', GBP: 'پوند انگلیس', TRY: 'لیر ترکیه', CNY: 'یوان چین', IQD: 'دینار عراق', CAD: 'دلار کانادا',
  AUD: 'دلار استرالیا', CHF: 'فرانک سوئیس', RUB: 'روبل روسیه', JPY: 'ین ژاپن', KWD: 'دینار کویت', OMR: 'ریال عمان', SAR: 'ریال عربستان', QAR: 'ریال قطر', AFN: 'افغانی', USDT: 'تتر',
};
export const ROUND_STEPS = [1, 1000, 10000, 100000];
export const TRADE_DOCS = new Set(['trade', 'hawala', 'convert']);

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
export const roundTo =(x, step = 1) => (step > 1 ? Math.round(x / step) * step : rnd(x));

/* ---------------- gold arithmetic (rial) ---------------- */
/** Rial price of one gram of 750 from the rial مظنه (price of one mesghal of 705 gold). */
export const g750FromMazaneh = (mazR) => (num(mazR) * 750) / (MESGHAL_G * MAZANEH_FINENESS);
export const mazanehFromG750 = (g750R) => (num(g750R) * MESGHAL_G * MAZANEH_FINENESS) / 750;
/** Weight equivalents of a piece: 750-grams (the account unit), mesghals of 705, pure grams. */
export const equivalents = (w, f) => ({ eq750: r3((w * f) / 750), mesghal: r3((w * f) / MAZANEH_FINENESS / MESGHAL_G), pure: r3((w * f) / 1000) });

/** Price of gold by its basis: مظنه, price of a gram of 750, or an agreed total. */
function goldValue(l, eq750, step) {
  const basis = l.basis ?? 'mazaneh';
  if (basis === 'amount') return rnd(pos(l.amount, 'مبلغ توافقی'));
  if (basis === 'gram750') return roundTo(eq750 * pos(l.g750, 'قیمت گرم ۷۵۰'), step);
  need(basis === 'mazaneh', 'مبنای قیمت نامعتبر است.');
  return roundTo(eq750 * g750FromMazaneh(pos(l.mazaneh, 'مظنه')), step);
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
    o.weight = r3(pos(l.weight, 'وزن', 1e6));
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
        o.fee = rnd(num(l.fee));
        need(Number.isFinite(o.fee) && o.fee >= 0, 'اجرت پلمپ نامعتبر است.');
        o.value += o.fee;
      }
      o.impliedMazaneh = rnd(mazanehFromG750((o.value - o.fee) / o.eq750));
      o.basis = l.basis ?? 'mazaneh';
      if (o.basis === 'mazaneh') o.mazaneh = rnd(num(l.mazaneh)); // the rate agreed at the counter, as typed
      if (o.basis === 'gram750') o.g750Price = rnd(num(l.g750));
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
      if (basis === 'count') o.value = o.count * rnd(pos(l.price, 'قیمت هر سکه'));
      else if (basis === 'weight') {
        o.weight = r3(pos(l.weight, 'وزن سکه‌ها', 1e5));
        o.value = roundTo(o.weight * pos(l.gramPrice, 'قیمت هر گرم'), round);
      } else if (basis === 'amount') o.value = rnd(pos(l.amount, 'مبلغ توافقی'));
      else throw new BookError('مبنای قیمت سکه نامعتبر است.');
    }
  } else {
    const code = String(l.code ?? '').toUpperCase();
    need(FX_CODES[code], 'نوع ارز نامعتبر است.');
    o.code = code;
    o.amt = Math.round(pos(l.fxAmount, 'مقدار ارز', 1e12) * 100) / 100;
    o.unit = `FX:${code}`;
    o.stock = `fx:${code}`;
    if (priced) o.value = rnd(o.amt * pos(l.rate, 'نرخ ارز'));
  }
  return o;
}

/** A whole trade document: lines, money received/paid, and what is left on the customer's rial account. */
export function calcTrade(doc, { round = 10000 } = {}) {
  const step = doc.round ?? round;
  need(ROUND_STEPS.includes(step), 'گام گرد کردن نامعتبر است.');
  if (doc.type === 'hawala') return calcHawala(doc);
  if (doc.type === 'convert') return calcConvert(doc, step);
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
const r = (a, b, unit) => (unit === 'G750' ? r3((a ?? 0) + b) : Math.round(((a ?? 0) + b) * 100) / 100);

/** Units a customer account can hold. */
export function validUnit(u) {
  return u === 'IRR' || u === 'G750' || /^COIN:\w+$/.test(u) && !!COIN_TYPES[u.slice(5)] || /^FX:[A-Z]+$/.test(u) && !!FX_CODES[u.slice(3)] || /^BAR:[A-Z0-9-]{3,30}$/.test(u);
}
const qty = (u, v, label) => {
  const x = num(v);
  need(Number.isFinite(x) && x !== 0, `${label} نامعتبر است.`);
  if (u === 'IRR') return rnd(x);
  if (u === 'G750') return r3(x);
  if (u.startsWith('COIN:') || u.startsWith('BAR:')) {
    need(Number.isInteger(x), 'تعداد باید عدد صحیح باشد.');
    return x;
  }
  return Math.round(x * 100) / 100;
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
  if (c.unit === 'G750') value = c.basis === 'gram750' ? roundTo(Math.abs(amount) * pos(c.g750, 'قیمت گرم ۷۵۰'), step) : roundTo(Math.abs(amount) * g750FromMazaneh(pos(c.mazaneh, 'مظنه')), step);
  else value = rnd(Math.abs(amount) * pos(c.price, 'نرخ'));
  const s = Math.sign(amount);
  return { type: 'convert', lines: [], payments: [], convert: { unit: c.unit, amount, value }, net: s * value, paidIn: 0, paidOut: 0, credit: s * value, sales: 0, tradeIn: 0, vat: 0, creditUnit: 'IRR', creditG: 0 };
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
export function positionReport(events) {
  const P = {};
  const byDay = {};
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
    byDay[date] = (byDay[date] ?? 0) + realized;
  };
  for (const e of events) {
    const c = e.calc;
    if (e.type === 'trade') {
      for (const l of c.lines) {
        if (!l.priced) continue;
        const key = l.kind === 'melt' || l.kind === 'bar' ? 'G750' : l.unit;
        const q = l.kind === 'melt' || l.kind === 'bar' ? l.eq750 : l.amt;
        trade(key, q, l.value - (l.fee ?? 0), e.date, l.dir);
      }
    } else if (e.type === 'convert') {
      const { unit, amount, value } = c.convert;
      trade(unit, Math.abs(amount), value, e.date, amount > 0 ? 'out' : 'in');
    } else if (['sale', 'buy', 'return'].includes(e.type)) {
      for (const l of c.lines) {
        if (l.kind === 'melt' || l.kind === 'used') trade('G750', l.g750, l.total, e.date, (e.type === 'return' ? l.side === 'out' : l.side === 'in') ? 'in' : 'out');
        if (l.kind === 'coin') trade(`COIN:${l.coin}`, l.count, l.total, e.date, (e.type === 'return' ? l.side === 'out' : l.side === 'in') ? 'in' : 'out');
      }
    } else if (e.type === 'opening') {
      for (const b of e.data.balances ?? []) {
        const key = b.acct === 'gold' ? 'G750' : b.acct.startsWith('coin:') ? `COIN:${b.acct.slice(5)}` : b.acct.startsWith('fx:') ? `FX:${b.acct.slice(3)}` : null;
        if (key && b.amt > 0) trade(key, b.amt, b.cost ?? 0, e.date, 'in');
      }
    }
  }
  for (const p of Object.values(P)) (p.cost = rnd(p.cost)), (p.realized = rnd(p.realized)), (p.qty = Math.round(p.qty * 1000) / 1000);
  return { positions: P, byDay: Object.fromEntries(Object.entries(byDay).map(([d, v]) => [d, rnd(v)])) };
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
