// spec 0037: the live sales desk's what-ifs, suggestions, comparison and customer view are exact consequences of the
// books engine — a scenario never invents a price, a discount never touches the gold, the customer never sees margins.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as B from '../public/js/books.mjs';
import * as S from '../public/js/sell.mjs';

const P750 = 2_400_000; // toman per gram of 18k
let n = 0;
const item = (tpl, weight, extra = {}) => ({ id: `it${++n}`, code: String(100000 + n), tpl, title: B.templateById(tpl).label, weight, fineness: 750, stones: 0, ojratMode: 'pct', ojrat: B.templateById(tpl).ojrat, profitPct: 7, status: 'stock', ...extra });
const STOCK = [item('ring-w', 3.5), item('ring-w', 4.1), item('ring-w', 5.6), item('er-stud', 2.1), item('nk', 4.8), item('ch-cartier', 6.2), item('br', 7.9), item('ring-m', 6), item('er-drop', 3.3, { status: 'reserved' })];
const cartOf = (...its) => ({ lines: its.map((it) => S.lineFromItem(it, P750)), tradeIns: [], payments: [] });

test('a piece is priced by the books engine itself, and the cart is the sale document the invoice would make', () => {
  const it = STOCK[0];
  assert.equal(S.priceOf(it, P750), B.calcLine(S.lineFromItem(it, P750)).total);
  const cart = { ...cartOf(STOCK[0], STOCK[3]), tradeIns: [{ title: 'انگشتر کهنه', weight: 3, stoneWeight: 0, fineness: 740, p750: P750, deductPct: 2 }] };
  const doc = S.docOf(cart);
  assert.deepEqual(doc.lines.map((l) => [l.kind, l.side ?? 'out']), [['jewel', 'out'], ['jewel', 'out'], ['used', 'in']]);
  const t = S.totals(cart);
  assert.equal(t.net, t.sales - t.tradeIn);
  assert.ok(t.tradeIn > 0 && t.net < t.sales, 'the old gold comes off the bill');
});

test('what-ifs: 3% off, half making charge, no profit, a round million — never below the gold, tax falls with them', () => {
  const cart = cartOf(STOCK[0], STOCK[4]);
  const base = S.totals(cart);
  const sc = Object.fromEntries(S.scenarios(cart).map((s) => [s.id, s]));
  // 3% of the bill, taken from profit and making charge only
  assert.ok(sc.disc3.possible);
  assert.ok(Math.abs(sc.disc3.net - Math.round(base.sales * 0.97)) <= 20, `${sc.disc3.net} vs ${Math.round(base.sales * 0.97)}`);
  for (const l of sc.disc3.lines) {
    const c = B.calcLine(l);
    const full = B.calcLine({ ...l, discount: 0 });
    assert.equal(c.principal, full.principal, 'the gold value is untouched');
    assert.ok(c.vat < full.vat, 'tax falls with the discount');
  }
  assert.ok(sc.ojratHalf.possible && sc.ojratHalf.delta < 0);
  assert.ok(sc.noProfit.possible && sc.noProfit.delta < 0 && sc.noProfit.net < sc.ojratHalf.net === sc.noProfit.delta < sc.ojratHalf.delta);
  // round: the net lands exactly on the million below when the tax rounding allows it
  assert.ok(sc.round.possible);
  assert.equal(sc.round.net % 1_000_000, 0, String(sc.round.net));
  assert.ok(sc.round.net < base.net && base.net - sc.round.net < 1_000_000);
  // what-ifs change nothing until they are applied
  assert.equal(S.totals(cart).net, base.net);
  // gold moves are for the conversation only, and they move the old gold too
  assert.ok(sc.goldUp.info && sc.goldUp.delta > 0 && sc.goldDown.delta < 0);
  // a seller who may not discount sees the figures, flagged for a manager
  const locked = Object.fromEntries(S.scenarios(cart, { canDiscount: false }).map((s) => [s.id, s]));
  assert.equal(locked.disc3.needsManager, true);
  assert.equal(locked.goldUp.needsManager, undefined);
});

test('a budget: met to the rial by a lawful discount, or plainly out of reach with the lowest possible figure', () => {
  const cart = cartOf(STOCK[4]);
  const base = S.totals(cart);
  const near = Math.floor((base.net * 0.96) / 10_000) * 10_000;
  const b = S.budget(cart, near);
  assert.ok(b.possible);
  assert.equal(b.net, near, 'exactly the customer’s figure');
  const far = Math.round(base.net * 0.5);
  const x = S.budget(cart, far);
  assert.equal(x.possible, false);
  assert.ok(x.floor > far && x.gap === x.floor - far);
  const t = S.totals({ ...cart, lines: cart.lines.map((l) => ({ ...l, discount: (B.calcLine({ ...l, discount: 0 }).spro + B.calcLine({ ...l, discount: 0 }).consfee) / 10 })) });
  assert.equal(x.floor, t.net, 'the floor is the bill with the whole profit and making charge given away');
});

test('suggestions: complements from the groups that go together, alternatives of the same kind within ±25% — only from stock', () => {
  const ring = STOCK[1]; // ring-w 4.1 g
  const s = S.suggest(STOCK, cartOf(ring).lines, { p750: P750 });
  const groups = s.complement.map((x) => B.templateById(x.item.tpl).group);
  assert.ok(groups.length && groups.every((g) => S.COMPLEMENT.ring.includes(g)), groups.join(','));
  assert.ok(!s.complement.some((x) => x.item.status !== 'stock'), 'a reserved piece is never offered');
  assert.deepEqual(s.alternative.map((x) => x.item.id).sort(), [STOCK[0].id].sort(), 'only the 3.5 g ring is within ±25%; the 5.6 g is not');
  assert.equal(s.alternative[0].reason, 'سبک‌تر، ارزان‌تر');
  // the customer's favourite group comes first
  const fav = S.suggest(STOCK, cartOf(ring).lines, { p750: P750, favorites: ['wrist'] });
  assert.equal(B.templateById(fav.complement[0].item.tpl).group, 'wrist');
  // a budget keeps every offer within it
  const cheap = S.suggest(STOCK, cartOf(ring).lines, { p750: P750, maxPrice: S.priceOf(STOCK[3], P750) });
  assert.ok(cheap.complement.every((x) => x.price <= S.priceOf(STOCK[3], P750)));
});

test('side by side: the same columns from the engine and the distance from the cheapest', () => {
  const rows = S.compare([STOCK[0], STOCK[1], STOCK[2]], P750);
  assert.equal(rows.length, 3);
  for (const r of rows) assert.equal(r.total, r.gold + r.making + r.stones + r.vat);
  assert.equal(Math.min(...rows.map((r) => r.overMin)), 0);
  assert.ok(rows[2].overMin > rows[1].overMin && rows[1].overMin > 0);
});

test('the customer’s screen: gold, «اجرت و سود» as one figure, tax, old gold, paid and left — never the profit apart', () => {
  const cart = { ...cartOf(STOCK[0]), tradeIns: [{ title: 'النگوی کهنه', weight: 2, fineness: 740, p750: P750, deductPct: 0 }], payments: [{ method: 'cash', dir: 'in', amount: 5_000_000 }] };
  const calc = S.totals(cart);
  const v = S.customerView(cart, calc, { shop: 'نمونه' });
  assert.deepEqual(Object.keys(v.lines[0]).sort(), ['discount', 'fineness', 'gold', 'making', 'stones', 'title', 'total', 'vat', 'weight']);
  assert.equal(v.lines[0].making, calc.lines[0].consfee + calc.lines[0].spro + calc.lines[0].bros);
  assert.equal(v.tradeIns[0].title, 'النگوی کهنه');
  assert.equal(v.paid, 50_000_000);
  assert.equal(v.left, calc.net - 50_000_000);
  assert.ok(!JSON.stringify(v).includes('spro') && !JSON.stringify(v).includes('profit'));
  const text = S.shareText({ track: 'S1405-00007', verify: 'ABC123' }, v, { shop: 'نمونه', money: (r) => `${r} ریال` });
  assert.match(text, /S1405-00007/);
  assert.match(text, /معاوضه النگوی کهنه/);
  assert.match(text, /کد اصالت: ABC123/);
});
