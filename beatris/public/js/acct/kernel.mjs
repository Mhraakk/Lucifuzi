// هسته حسابداری آموزشی (spec 0015): a deterministic double-entry kernel for a gold shop, shared by the server, the
// browser and the tests. It is the only source of truth of the training ledger: the tutor and the auditor (and any
// language model behind them) may propose an operation, but every figure — amounts, weights, costs, balances, P&L —
// is computed here, and only an entry that passes validateEntry() can be posted.
//
// An entry has lines { account, dr, cr, unit } and dimensions per line: party, product, grams, fineness, fine750
// (grams of 750 = grams × fineness ÷ 750, rounded to 3 decimals — the shop's rule), pure (grams × fineness ÷ 1000),
// qty (coins). Σdr = Σcr in every unit (IRR in whole rials, G750 for weight accounts). Inventory accounts carry the
// weight (or count) as a dimension of their money line: debit = into the shop, credit = out of it.
import { ACCOUNT, TEMPORARY, accountName } from './coa.mjs';

export const r3 = (x) => Math.round(x * 1000) / 1000;
export const fine750Of = (grams, fineness) => r3((grams * fineness) / 750);
export const pureOf = (grams, fineness) => r3((grams * fineness) / 1000);
/** Value of a weight at a price per gram of 750: the 750-equivalent is rounded first, then priced (قاعده دفتر). */
export const valueOf = (grams, fineness, price750) => Math.round(fine750Of(grams, fineness) * price750);
export const VAT_RATE = 0.1; // ۱۴۰۵: only on making charge + profit (+ commission); gold itself is exempt
export const vatOf = (base) => Math.round(base * VAT_RATE);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const KEY = /^[A-Za-z0-9:_-]{6,96}$/;
export const NEEDS_REF = new Set(['settle_customer', 'settle_supplier', 'reverse', 'return_sale', 'exchange']);

export class AcctError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.code = code;
    Object.assign(this, extra);
  }
}

const unitOf = (code) => ACCOUNT[code]?.unit ?? 'IRR';
const okAmount = (unit, v) => Number.isFinite(v) && v >= 0 && (unit === 'IRR' ? Number.isSafeInteger(v) : r3(v) === v);

/** Fill the derived dimensions of a line (fine750, pure, unit) without changing what the user typed. */
export function normalizeLine(l) {
  const out = { account: String(l.account ?? ''), dr: Number(l.dr ?? 0) || 0, cr: Number(l.cr ?? 0) || 0, unit: l.unit ?? unitOf(l.account) };
  for (const k of ['party', 'product', 'memo', 'adjust']) if (l[k] != null && l[k] !== '') out[k] = String(l[k]);
  if (l.grams != null && l.grams !== '') out.grams = Number(l.grams);
  if (l.fineness != null && l.fineness !== '') out.fineness = Number(l.fineness);
  if (l.qty != null && l.qty !== '') out.qty = Number(l.qty);
  if (l.fine750 != null && l.fine750 !== '') out.fine750 = Number(l.fine750);
  if (out.fine750 == null && out.grams > 0 && out.fineness > 0) out.fine750 = fine750Of(out.grams, out.fineness);
  if (out.grams > 0 && out.fineness > 0) out.pure = pureOf(out.grams, out.fineness);
  return out;
}
export const normalizeEntry = (e) => ({ ...e, lines: (e.lines ?? []).map(normalizeLine) });

/** Totals per unit: { IRR: { dr, cr }, G750: … } */
export function totals(lines) {
  const t = {};
  for (const l of lines) {
    const u = (t[l.unit] ??= { dr: 0, cr: 0 });
    u.dr = l.unit === 'IRR' ? u.dr + l.dr : r3(u.dr + l.dr);
    u.cr = l.unit === 'IRR' ? u.cr + l.cr : r3(u.cr + l.cr);
  }
  return t;
}

/**
 * Every rule an entry must pass before it may be posted. Returns { ok, errors: [{ code, line, msg }], totals }.
 * With a book, stock may not go below zero (fine 750 per weight account, count per coin account).
 */
export function validateEntry(entry, { book = null } = {}) {
  const errors = [];
  const err = (code, msg, line = null) => errors.push({ code, msg, line });
  const e = normalizeEntry(entry ?? {});
  if (!e.date || !DATE.test(e.date)) err('E_DATE', 'تاریخ سند (YYYY-MM-DD) لازم است.');
  if (e.key != null && !KEY.test(String(e.key))) err('E_KEY', 'کلید یکتای سند نامعتبر است.');
  if (NEEDS_REF.has(e.kind) && !e.ref) err('E_REF', 'این نوع سند باید به سند یا مدرک مرجع ارجاع دهد.');
  if (e.lines.length < 2) err('E_LINES', 'سند دوطرفه دست‌کم دو ردیف دارد.');
  e.lines.forEach((l, i) => {
    const a = ACCOUNT[l.account];
    if (!a) return err('E_ACCOUNT', `حساب «${l.account}» در کدینگ نیست.`, i);
    if (l.unit !== a.unit) err('E_UNIT', `واحد ردیف ${i + 1} باید ${a.unit === 'IRR' ? 'ریال' : 'گرم ۷۵۰'} باشد.`, i);
    if (!okAmount(l.unit, l.dr) || !okAmount(l.unit, l.cr)) err('E_AMOUNT', `مبلغ ردیف ${i + 1} نامعتبر است${l.unit === 'IRR' ? ' (ریال صحیح و نامنفی)' : ''}.`, i);
    if ((l.dr > 0) === (l.cr > 0)) err('E_SIDE', `ردیف ${i + 1} باید فقط بدهکار یا فقط بستانکار باشد.`, i);
    if (a.party && !l.party) err('E_PARTY', `حساب «${a.fa}» طرف حساب (مشتری یا تأمین‌کننده) می‌خواهد.`, i);
    if (a.measure === 'weight') {
      const purity = l.adjust === 'purity';
      if (!(l.fine750 > 0)) err('E_WEIGHT', `ردیف ${i + 1} (${a.fa}) وزن و عیار می‌خواهد.`, i);
      else if (!purity && !(l.grams > 0 && l.fineness > 0 && l.fineness <= 1000)) err('E_WEIGHT', `ردیف ${i + 1}: وزن (گرم) و عیار (تا ۱۰۰۰) لازم است.`, i);
      else if (!purity && fine750Of(l.grams, l.fineness) !== l.fine750) err('E_FINE', `ردیف ${i + 1}: معادل ۷۵۰ باید ${fine750Of(l.grams, l.fineness)} گرم باشد.`, i);
    }
    if (a.measure === 'count' && !(Number.isSafeInteger(l.qty) && l.qty > 0)) err('E_COUNT', `ردیف ${i + 1} (${a.fa}) تعداد صحیح می‌خواهد.`, i);
  });
  const t = totals(e.lines);
  for (const [u, s] of Object.entries(t)) if (s.dr !== s.cr) err('E_BALANCE', `جمع بدهکار و بستانکار (${u === 'IRR' ? 'ریال' : u}) برابر نیست: ${s.dr} ≠ ${s.cr}.`);
  if (book && !errors.length) {
    const inv = inventory(book);
    const move = new Map();
    for (const l of e.lines) {
      const a = ACCOUNT[l.account];
      if (!a?.measure) continue;
      const m = move.get(l.account) ?? { fine750: 0, qty: 0 };
      const s = l.dr > 0 ? 1 : -1;
      m.fine750 = r3(m.fine750 + s * (l.fine750 ?? 0));
      m.qty += s * (l.qty ?? 0);
      move.set(l.account, m);
    }
    for (const [code, m] of move) {
      const cur = inv[code] ?? { fine750: 0, qty: 0 };
      if (r3(cur.fine750 + m.fine750) < 0 || cur.qty + m.qty < 0) err('E_NEGATIVE', `موجودی «${accountName(code)}» منفی می‌شود.`);
    }
  }
  return { ok: !errors.length, errors, totals: t, entry: e };
}

/* ---------------- the book: an append-only journal and everything derived from it ---------------- */
export const createBook = (entries = []) => ({ entries: entries.map((x) => ({ ...x, lines: x.lines.map(normalizeLine) })) });

/**
 * Post an entry: validated, numbered, immutable. A key that was already posted returns that entry (no double
 * posting). Returns { book, entry, replayed }. Throws AcctError with the validation errors otherwise.
 */
export function post(book, entry, { id = null } = {}) {
  if (entry.key) {
    const seen = book.entries.find((x) => x.key === entry.key);
    if (seen) return { book, entry: seen, replayed: true };
  }
  const v = validateEntry(entry, { book });
  if (!v.ok) throw new AcctError('E_INVALID', v.errors[0].msg, { errors: v.errors });
  const no = book.entries.length + 1;
  const posted = Object.freeze({ ...v.entry, id: id ?? `J${String(no).padStart(5, '0')}`, no, lines: Object.freeze(v.entry.lines.map((l) => Object.freeze(l))) });
  return { book: { ...book, entries: [...book.entries, posted] }, entry: posted, replayed: false };
}

const signed = (code, l) => (ACCOUNT[code].normal === 'dr' ? l.dr - l.cr : l.cr - l.dr);

/** The general ledger: per account its rows with a running balance (in the account's normal side). */
export function ledger(book, code = null) {
  const out = {};
  for (const e of book.entries)
    for (const l of e.lines) {
      if (code && l.account !== code) continue;
      const acc = (out[l.account] ??= { account: l.account, name: accountName(l.account), unit: l.unit, rows: [], balance: 0, fine750: 0, qty: 0 });
      acc.balance = l.unit === 'IRR' ? acc.balance + signed(l.account, l) : r3(acc.balance + signed(l.account, l));
      const s = l.dr > 0 ? 1 : -1;
      if (l.fine750) acc.fine750 = r3(acc.fine750 + s * l.fine750);
      if (l.qty) acc.qty += s * l.qty;
      acc.rows.push({ entry: e.id, date: e.date, memo: e.memo ?? '', dr: l.dr, cr: l.cr, balance: acc.balance, party: l.party ?? null, fine750: l.fine750 ?? null, qty: l.qty ?? null });
    }
  return code ? out[code] ?? { account: code, name: accountName(code), unit: unitOf(code), rows: [], balance: 0, fine750: 0, qty: 0 } : out;
}

/** Trial balance: totals per account and unit; balanced when Σdr = Σcr in every unit. */
export function trialBalance(book) {
  const rows = new Map();
  for (const e of book.entries)
    for (const l of e.lines) {
      const r = rows.get(l.account) ?? { account: l.account, name: accountName(l.account), unit: l.unit, dr: 0, cr: 0 };
      r.dr = l.unit === 'IRR' ? r.dr + l.dr : r3(r.dr + l.dr);
      r.cr = l.unit === 'IRR' ? r.cr + l.cr : r3(r.cr + l.cr);
      rows.set(l.account, r);
    }
  const list = [...rows.values()].sort((a, b) => a.account.localeCompare(b.account)).map((r) => ({ ...r, balance: r.unit === 'IRR' ? r.dr - r.cr : r3(r.dr - r.cr) }));
  const sum = {};
  for (const r of list) {
    const s = (sum[r.unit] ??= { dr: 0, cr: 0 });
    s.dr = r.unit === 'IRR' ? s.dr + r.dr : r3(s.dr + r.dr);
    s.cr = r.unit === 'IRR' ? s.cr + r.cr : r3(s.cr + r.cr);
  }
  return { rows: list, totals: sum, balanced: Object.values(sum).every((s) => s.dr === s.cr) };
}

/** Balance of one account (normal side positive), optionally for one party. */
export function balanceOf(book, code, party = null) {
  let b = 0;
  for (const e of book.entries) for (const l of e.lines) if (l.account === code && (!party || l.party === party)) b += signed(code, l);
  return unitOf(code) === 'IRR' ? b : r3(b);
}

/** Stock per inventory account: weight (fine 750, grams by fineness), count, carrying cost and average cost. */
export function inventory(book) {
  const out = {};
  for (const e of book.entries)
    for (const l of e.lines) {
      const a = ACCOUNT[l.account];
      if (a?.tag !== 'inventory') continue;
      const s = l.dr > 0 ? 1 : -1;
      const x = (out[l.account] ??= { account: l.account, name: a.fa, measure: a.measure, fine750: 0, grams: 0, qty: 0, cost: 0 });
      x.cost += l.dr - l.cr;
      if (l.fine750) x.fine750 = r3(x.fine750 + s * l.fine750);
      if (l.grams && l.adjust !== 'purity') x.grams = r3(x.grams + s * l.grams);
      if (l.qty) x.qty += s * l.qty;
    }
  for (const x of Object.values(out)) x.avg = x.measure === 'count' ? (x.qty > 0 ? x.cost / x.qty : 0) : x.fine750 > 0 ? x.cost / x.fine750 : 0;
  return out;
}

/** Inventory movements (the weight ledger): one row per inventory line, signed into the shop. */
export function movements(book) {
  const out = [];
  for (const e of book.entries)
    for (const l of e.lines)
      if (ACCOUNT[l.account]?.tag === 'inventory') {
        const s = l.dr > 0 ? 1 : -1;
        out.push({ entry: e.id, date: e.date, account: l.account, product: l.product ?? null, grams: l.adjust === 'purity' ? 0 : s * (l.grams ?? 0), fineness: l.fineness ?? null, fine750: s * (l.fine750 ?? 0), qty: s * (l.qty ?? 0), value: l.dr - l.cr });
      }
  return out;
}

/**
 * Result of the period: realized P&L from the temporary accounts (revenue − returns − discounts − COGS − expenses)
 * and the unrealized gain of the gold still in stock at a mark price (per gram of 750 / per coin).
 */
export function pnl(book, { from = null, to = null, price750 = null, coinPrice = null } = {}) {
  const inRange = (d) => (!from || d >= from) && (!to || d <= to);
  const by = {};
  for (const e of book.entries) {
    if (!inRange(e.date) || e.kind === 'close_period') continue;
    for (const l of e.lines) if (TEMPORARY.has(l.account)) by[l.account] = (by[l.account] ?? 0) + signed(l.account, l);
  }
  const sum = (type) => Object.entries(by).filter(([c]) => ACCOUNT[c].type === type).reduce((s, [, v]) => s + v, 0);
  const revenue = sum('revenue'), contra = sum('contra'), expense = sum('expense');
  const cogs = by['5110'] ?? 0;
  const realized = revenue - contra - expense;
  let unrealized = null;
  if (price750 != null || coinPrice != null) {
    unrealized = 0;
    for (const x of Object.values(inventory(book))) {
      if (x.measure === 'weight' && price750 != null) unrealized += Math.round(x.fine750 * price750) - x.cost;
      if (x.measure === 'count' && coinPrice != null) unrealized += x.qty * coinPrice - x.cost;
    }
  }
  return { byAccount: by, revenue, contra, cogs, expense, grossProfit: revenue - contra - cogs, realized, unrealized };
}

/** Compare the book's stock with a physical count: { account: { fine750 | qty } }. */
export function reconcileInventory(book, counted) {
  const inv = inventory(book);
  const rows = [];
  for (const [code, c] of Object.entries(counted ?? {})) {
    const x = inv[code] ?? { fine750: 0, qty: 0, avg: 0, measure: ACCOUNT[code]?.measure };
    const diff = x.measure === 'count' ? (c.qty ?? 0) - x.qty : r3((c.fine750 ?? 0) - x.fine750);
    rows.push({ account: code, name: accountName(code), book: x.measure === 'count' ? x.qty : x.fine750, counted: x.measure === 'count' ? c.qty ?? 0 : c.fine750 ?? 0, diff, value: Math.round(diff * x.avg) });
  }
  return { rows, matched: rows.every((r) => r.diff === 0) };
}

/** Effect of one entry on the book: what changes in cash, bank, receivables, payables, stock, VAT and result. */
export function effects(book, entry) {
  const before = snapshotOf(book);
  const after = snapshotOf({ ...book, entries: [...book.entries, normalizeEntry({ ...entry, id: 'preview' })] });
  const delta = {};
  for (const k of Object.keys(after)) delta[k] = typeof after[k] === 'number' ? (k.endsWith('Fine') ? r3(after[k] - before[k]) : after[k] - before[k]) : null;
  return { before, after, delta };
}
function snapshotOf(book) {
  const inv = inventory(book);
  const p = pnl(book);
  return {
    cash: balanceOf(book, '1110'),
    bank: balanceOf(book, '1120'),
    receivable: balanceOf(book, '1210'),
    payable: balanceOf(book, '2110'),
    deposits: balanceOf(book, '2120'),
    vat: balanceOf(book, '2130'),
    goldFine: r3((inv['1310']?.fine750 ?? 0) + (inv['1320']?.fine750 ?? 0)),
    goldCost: (inv['1310']?.cost ?? 0) + (inv['1320']?.cost ?? 0),
    coins: inv['1330']?.qty ?? 0,
    result: p.realized,
  };
}

/** Closing the period: every temporary account to zero against retained earnings (one entry). */
export function closingEntry(book, date) {
  const p = pnl(book);
  const lines = [];
  for (const [code, v] of Object.entries(p.byAccount)) {
    if (!v) continue;
    const normalDr = ACCOUNT[code].normal === 'dr';
    // bring the balance to zero: a debit-normal account is credited, a credit-normal one debited
    lines.push(normalDr === v > 0 ? { account: code, dr: 0, cr: Math.abs(v) } : { account: code, dr: Math.abs(v), cr: 0 });
  }
  if (!lines.length) return null;
  const t = totals(lines.map(normalizeLine)).IRR;
  const diff = t.dr - t.cr;
  if (diff) lines.push(diff > 0 ? { account: '3200', dr: 0, cr: diff } : { account: '3200', dr: -diff, cr: 0 });
  return { date, kind: 'close_period', memo: 'بستن حساب‌های موقت به سود انباشته', lines };
}
