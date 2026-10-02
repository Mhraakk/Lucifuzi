// قواعد حسابرسی (spec 0015): deterministic checks over a journal — the AuditAgent runs these and only *explains*
// what they found. Each finding names its rule, its severity, the entry and the evidence (numbers), so the same
// journal always yields the same findings.
import { ACCOUNT } from './coa.mjs';
import { r3, fine750Of, totals, normalizeEntry, NEEDS_REF, VAT_RATE } from './kernel.mjs';

export const RULES = {
  UNBALANCED: { fa: 'سند نامتوازن', sev: 'high' },
  DUPLICATE: { fa: 'سند تکراری', sev: 'high' },
  SUSPICIOUS_AMOUNT: { fa: 'مبلغ مشکوک', sev: 'medium' },
  WEIGHT_MISMATCH: { fa: 'مغایرت وزن', sev: 'high' },
  PURITY_MISMATCH: { fa: 'مغایرت عیار', sev: 'high' },
  INVENTORY_MISMATCH: { fa: 'مغایرت موجودی', sev: 'high' },
  NEGATIVE_INVENTORY: { fa: 'موجودی منفی ناممکن', sev: 'high' },
  ACCOUNT_MAPPING: { fa: 'حساب نادرست', sev: 'medium' },
  INCORRECT_SETTLEMENT: { fa: 'تسویه نادرست', sev: 'high' },
  MISSING_REFERENCE: { fa: 'مرجع ناقص', sev: 'low' },
  UNEXPECTED_PNL: { fa: 'حرکت غیرعادی سود و زیان', sev: 'medium' },
  CASH_DISCREPANCY: { fa: 'مغایرت صندوق', sev: 'high' },
  OPERATOR_BEHAVIOR: { fa: 'رفتار غیرعادی اپراتور', sev: 'medium' },
};
export const SEV_RANK = { high: 3, medium: 2, low: 1 };
const CASH_LIMIT = 2_000_000_000; // ۲۰۰ میلیون تومان نقد در یک سند: باید دیده شود
const FINENESS_OK = (f) => f > 0 && f <= 999.9;

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const sig = (e) => e.lines.map((l) => `${l.account}|${l.dr}|${l.cr}|${l.party ?? ''}`).sort().join(';');

/**
 * Run every rule. journal: entries in posting order (they may be faulty — that is the point). ctx: { cashCounted,
 * counts: { account: { fine750 | qty } }, assays: { entryId: actualFineness } }.
 */
export function runAuditRules(journal, ctx = {}) {
  const entries = journal.map((e) => normalizeEntry(e));
  const out = [];
  const add = (code, entry, detail, evidence = {}) => out.push({ code, fa: RULES[code].fa, severity: RULES[code].sev, entry: entry?.id ?? null, detail, evidence });
  const stock = {};
  const recv = {};
  const seen = new Map();
  const irr = [];
  for (const e of entries) {
    // balance per unit
    for (const [u, t] of Object.entries(totals(e.lines))) if (t.dr !== t.cr) add('UNBALANCED', e, `جمع بدهکار و بستانکار (${u}) برابر نیست.`, { unit: u, dr: t.dr, cr: t.cr });
    // duplicate: same key, or the same lines on the same day
    const k = e.key ? `key:${e.key}` : `${e.date}#${sig(e)}`;
    if (seen.has(k) && e.kind !== 'reverse') add('DUPLICATE', e, `همان سند ${seen.get(k)} دوباره ثبت شده است.`, { of: seen.get(k) });
    else seen.set(k, e.id);
    if (NEEDS_REF.has(e.kind) && !e.ref) add('MISSING_REFERENCE', e, 'سند بدون ارجاع به سند یا مدرک مرجع.', { kind: e.kind });
    let cashIn = 0;
    for (const l of e.lines) {
      const a = ACCOUNT[l.account];
      if (!a) continue;
      if (a.unit === 'IRR' && e.kind !== 'capital') irr.push(l.dr || l.cr);
      if (a.tag === 'cash') cashIn += l.dr + l.cr;
      if (a.measure === 'weight' && l.adjust !== 'purity') {
        if (!FINENESS_OK(l.fineness ?? 0)) add('PURITY_MISMATCH', e, `عیار ${l.fineness} ممکن نیست.`, { fineness: l.fineness });
        else if (l.grams > 0 && l.fine750 != null && fine750Of(l.grams, l.fineness) !== l.fine750) add('WEIGHT_MISMATCH', e, `معادل ۷۵۰ ثبت‌شده ${l.fine750} است ولی ${l.grams} گرم عیار ${l.fineness} برابر ${fine750Of(l.grams, l.fineness)} است.`, { recorded: l.fine750, expected: fine750Of(l.grams, l.fineness) });
        const actual = ctx.assays?.[e.id];
        if (actual && l.dr > 0 && actual !== l.fineness) add('PURITY_MISMATCH', e, `عیار اعلامی ${l.fineness} ولی ری‌گیری ${actual}.`, { declared: l.fineness, actual, diff750: r3(fine750Of(l.grams, l.fineness) - fine750Of(l.grams, actual)) });
      }
      if (a.measure) {
        const s = (stock[l.account] ??= { fine750: 0, qty: 0 });
        const k2 = l.dr > 0 ? 1 : -1;
        s.fine750 = r3(s.fine750 + k2 * (l.fine750 ?? 0));
        s.qty += k2 * (l.qty ?? 0);
        if (s.fine750 < 0 || s.qty < 0) add('NEGATIVE_INVENTORY', e, `موجودی «${a.fa}» پس از این سند منفی است.`, { account: l.account, fine750: s.fine750, qty: s.qty });
      }
      if (a.tag === 'receivable') {
        const p = l.party ?? '?';
        const before = recv[p] ?? 0;
        recv[p] = before + l.dr - l.cr;
        if (e.kind === 'settle_customer' && l.cr > before) add('INCORRECT_SETTLEMENT', e, `تسویه ${l.cr} بیشتر از بدهی مشتری (${before}) است.`, { party: p, owed: before, paid: l.cr });
      }
    }
    if (cashIn >= CASH_LIMIT && e.kind !== 'capital') add('SUSPICIOUS_AMOUNT', e, 'جابه‌جایی نقدی بسیار بزرگ در یک سند.', { cash: cashIn, limit: CASH_LIMIT });
    // mapping: what a sale must contain and how its VAT is computed
    if (e.kind === 'sell_jewelry' || e.kind === 'sell_coin') {
      const sum = (code, side) => e.lines.filter((l) => l.account === code).reduce((s, l) => s + l[side], 0);
      if (sum('4110', 'dr') > 0 || !(sum('4110', 'cr') > 0)) add('ACCOUNT_MAPPING', e, 'فروش باید «فروش طلا» را بستانکار کند.', {});
      if (!(sum('5110', 'dr') > 0)) add('ACCOUNT_MAPPING', e, 'بهای تمام‌شده فروش ثبت نشده است.', {});
      const base = sum('4120', 'cr') + sum('4130', 'cr');
      const vat = sum('2130', 'cr');
      if (Math.abs(vat - Math.round(base * VAT_RATE)) > 1) add('ACCOUNT_MAPPING', e, `مالیات ${vat} است؛ ۱۰٪ اجرت و سود (${base}) می‌شود ${Math.round(base * VAT_RATE)}.`, { vat, expected: Math.round(base * VAT_RATE) });
      const rev = sum('4110', 'cr') + base - sum('4190', 'dr');
      if (sum('5110', 'dr') > rev) add('UNEXPECTED_PNL', e, 'فروش زیر بهای تمام‌شده.', { revenue: rev, cost: sum('5110', 'dr') });
    }
    for (const l of e.lines) {
      const a = ACCOUNT[l.account];
      if (a && a.type === 'expense' && e.kind?.startsWith('buy_')) add('ACCOUNT_MAPPING', e, `خرید کالا به حساب هزینه «${a.fa}» رفته است.`, { account: l.account });
    }
  }
  // outliers: an IRR amount far beyond the shop's usual (median + 8 × MAD), once there is enough history
  if (irr.length >= 8) {
    const m = median(irr);
    const mad = median(irr.map((x) => Math.abs(x - m))) || 1;
    for (const e of entries) {
      if (e.kind === 'capital') continue;
      const big = Math.max(...e.lines.map((l) => l.dr || l.cr));
      if (big > m + 8 * mad * 1.4826 && !out.some((f) => f.entry === e.id && f.code === 'SUSPICIOUS_AMOUNT')) add('SUSPICIOUS_AMOUNT', e, 'مبلغ بسیار بیشتر از معمول این دفتر.', { amount: big, median: m });
    }
  }
  if (ctx.cashCounted != null) {
    const cash = entries.reduce((s, e) => s + e.lines.filter((l) => l.account === '1110').reduce((t, l) => t + l.dr - l.cr, 0), 0);
    if (cash !== ctx.cashCounted) add('CASH_DISCREPANCY', null, `صندوق شمرده‌شده ${ctx.cashCounted} ولی دفتر ${cash} است.`, { book: cash, counted: ctx.cashCounted, diff: ctx.cashCounted - cash });
  }
  for (const [code, c] of Object.entries(ctx.counts ?? {})) {
    const s = stock[code] ?? { fine750: 0, qty: 0 };
    const isCount = ACCOUNT[code]?.measure === 'count';
    const diff = isCount ? (c.qty ?? 0) - s.qty : r3((c.fine750 ?? 0) - s.fine750);
    if (diff) add('INVENTORY_MISMATCH', null, `شمارش «${ACCOUNT[code]?.fa}» با دفتر ${diff > 0 ? 'بیشتر' : 'کمتر'} است.`, { account: code, book: isCount ? s.qty : s.fine750, counted: isCount ? c.qty : c.fine750, diff });
  }
  // operators: reversals and discounts far above the others
  const ops = {};
  for (const e of entries) {
    if (!e.operator) continue;
    const o = (ops[e.operator] ??= { n: 0, odd: 0 });
    o.n++;
    if (e.kind === 'reverse' || e.lines.some((l) => l.account === '4190')) o.odd++;
  }
  const list = Object.entries(ops);
  if (list.length >= 2) {
    for (const [op, o] of list) {
      const others = list.filter(([k]) => k !== op).reduce((s, [, x]) => ({ n: s.n + x.n, odd: s.odd + x.odd }), { n: 0, odd: 0 });
      const rate = o.odd / o.n, base = others.n ? others.odd / others.n : 0;
      if (o.odd >= 3 && rate > 2 * base + 0.1) add('OPERATOR_BEHAVIOR', null, `سهم سندهای معکوس و تخفیف اپراتور ${op} (${Math.round(rate * 100)}٪) بسیار بیشتر از بقیه (${Math.round(base * 100)}٪) است.`, { operator: op, rate: r3(rate), others: r3(base) });
    }
  }
  return out.sort((a, b) => SEV_RANK[b.severity] - SEV_RANK[a.severity]);
}

/** Audit score 0–100: each finding costs by severity. */
export const auditScore = (findings) => Math.max(0, 100 - findings.reduce((s, f) => s + (f.severity === 'high' ? 15 : f.severity === 'medium' ? 7 : 3), 0));
