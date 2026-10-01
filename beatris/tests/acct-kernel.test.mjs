// spec 0015: the training kernel — validation rules, gold-specific arithmetic and the accounting invariants under
// thousands of random operations (debit = credit, stock never negative, ledger and stock derived consistently,
// reversal and closing restore what they must, no double posting).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateEntry, createBook, post, trialBalance, inventory, movements, ledger, pnl, balanceOf, closingEntry, reconcileInventory, fine750Of, valueOf, vatOf, r3, AcctError } from '../public/js/acct/kernel.mjs';
import { buildEntry, jewelryPrice, dailyClose } from '../public/js/acct/actions.mjs';
import { ACCOUNT, TEMPORARY } from '../public/js/acct/coa.mjs';
import { rng } from '../public/js/calc.mjs';

const D = '2026-10-01';
const codes = (v) => v.errors.map((e) => e.code);
const run = (book, a) => post(book, buildEntry({ date: D, ...a }, book).entry).book;

test('اعتبارسنجی سند: هر قاعده خطای خودش را دارد', () => {
  assert.deepEqual(codes(validateEntry({ date: D, lines: [{ account: '1110', dr: 10, cr: 0 }] })), ['E_LINES', 'E_BALANCE']);
  assert.ok(codes(validateEntry({ date: D, lines: [{ account: '9999', dr: 1, cr: 0 }, { account: '1110', dr: 0, cr: 1 }] })).includes('E_ACCOUNT'));
  assert.ok(codes(validateEntry({ date: D, lines: [{ account: '1110', dr: 5, cr: 5 }, { account: '3100', dr: 0, cr: 0 }] })).includes('E_SIDE'));
  assert.ok(codes(validateEntry({ date: D, lines: [{ account: '1110', dr: 10.5, cr: 0 }, { account: '3100', dr: 0, cr: 10.5 }] })).includes('E_AMOUNT'), 'rial is whole');
  assert.ok(codes(validateEntry({ date: D, lines: [{ account: '1110', dr: -1, cr: 0 }, { account: '3100', dr: 0, cr: -1 }] })).includes('E_AMOUNT'));
  assert.ok(codes(validateEntry({ date: D, lines: [{ account: '1110', dr: 10, cr: 0 }, { account: '3100', dr: 0, cr: 9 }] })).includes('E_BALANCE'));
  assert.ok(codes(validateEntry({ date: D, lines: [{ account: '1210', dr: 10, cr: 0 }, { account: '4110', dr: 0, cr: 10 }] })).includes('E_PARTY'));
  assert.ok(codes(validateEntry({ date: D, lines: [{ account: '1310', dr: 10, cr: 0 }, { account: '1110', dr: 0, cr: 10 }] })).includes('E_WEIGHT'));
  assert.ok(codes(validateEntry({ date: D, lines: [{ account: '1310', dr: 10, cr: 0, grams: 10, fineness: 740, fine750: 10 }, { account: '1110', dr: 0, cr: 10 }] })).includes('E_FINE'));
  assert.ok(codes(validateEntry({ date: D, lines: [{ account: '1330', dr: 10, cr: 0 }, { account: '1110', dr: 0, cr: 10 }] })).includes('E_COUNT'));
  assert.ok(codes(validateEntry({ date: D, kind: 'settle_customer', lines: [{ account: '1110', dr: 10, cr: 0 }, { account: '1210', dr: 0, cr: 10, party: 'x' }] })).includes('E_REF'));
  assert.ok(codes(validateEntry({ lines: [{ account: '1110', dr: 1, cr: 0 }, { account: '3100', dr: 0, cr: 1 }] })).includes('E_DATE'));
  assert.ok(codes(validateEntry({ date: D, lines: [{ account: '1350', dr: 1, cr: 0, unit: 'IRR' }, { account: '2210', dr: 0, cr: 1, party: 'x' }] })).includes('E_UNIT'));
  // a weight account balances in grams of 750 (three decimals)
  assert.equal(validateEntry({ date: D, lines: [{ account: '1350', dr: 7.405, cr: 0 }, { account: '2210', dr: 0, cr: 7.405, party: 'x' }] }).ok, true);
  const book = run(createBook(), { type: 'capital', amount: 1_000_000 });
  assert.ok(codes(validateEntry({ date: D, lines: [{ account: '6190', dr: 1, cr: 0 }, { account: '1310', dr: 0, cr: 1, grams: 1, fineness: 750 }] }, { book })).includes('E_NEGATIVE'));
});

test('قاعده دفتر طلا: معادل ۷۵۰ گرد به سه رقم، سپس مبلغ؛ مالیات فقط بر اجرت و سود', () => {
  assert.equal(fine750Of(12.45, 740), 12.284);
  assert.equal(valueOf(12.45, 740, 80_000_000), 982_720_000);
  const p = jewelryPrice({ grams: 10, fineness: 750, price750: 82_000_000, making: 15_000_000, profitPct: 7 });
  assert.deepEqual([p.gold, p.making, p.profit, p.vat, p.total], [820_000_000, 15_000_000, 58_450_000, 7_345_000, 900_795_000]);
  assert.equal(p.vat, vatOf(p.making + p.profit), 'gold itself is VAT-exempt');
  const d = jewelryPrice({ grams: 10, fineness: 750, price750: 82_000_000, making: 15_000_000, profitPct: 7, discount: 795_000 });
  assert.equal(d.total, 900_000_000);
});

test('ثبت: شماره، تغییرناپذیری و کلید یکتا (دوبار ثبت نمی‌شود)', () => {
  let b = createBook();
  const e = buildEntry({ date: D, type: 'capital', amount: 5_000_000, key: 'cap-key-1' }, b).entry;
  const r1 = post(b, e);
  b = r1.book;
  const r2 = post(b, e);
  assert.equal(r2.replayed, true);
  assert.equal(r2.book.entries.length, 1);
  assert.throws(() => {
    r1.entry.lines[0].dr = 1;
  }, TypeError, 'a posted line is frozen');
  assert.throws(() => post(b, { date: D, lines: [{ account: '1110', dr: 1, cr: 0 }, { account: '3100', dr: 0, cr: 2 }] }), AcctError);
});

test('هر عملیات پیشخوان یک سند متوازن می‌سازد و اثرش درست است', () => {
  let b = createBook();
  b = run(b, { type: 'capital', amount: 30_000_000_000 });
  b = run(b, { type: 'buy_supplier', party: 'S', grams: 100, fineness: 750, price750: 80_000_000, making: 50_000_000, pay: 'credit' });
  assert.equal(balanceOf(b, '2110', 'S'), 8_050_000_000);
  b = run(b, { type: 'buy_melt', grams: 20, fineness: 740, price750: 80_000_000 });
  const sale = buildEntry({ date: D, type: 'sell_jewelry', party: 'C', grams: 10, fineness: 750, price750: 82_000_000, making: 15_000_000, profitPct: 7, pay: [{ method: 'cash', amount: 500_000_000 }] }, b);
  assert.equal(sale.calc.cost, 805_000_000, 'cost at the moving average of the stock (8050000000 / 100 g)');
  b = post(b, sale.entry).book;
  assert.equal(balanceOf(b, '1210', 'C'), 400_795_000, 'the unpaid part stays on the customer');
  b = run(b, { type: 'settle_customer', party: 'C', amount: 400_795_000, pay: 'bank', ref: 'R-1' });
  assert.equal(balanceOf(b, '1210', 'C'), 0);
  assert.throws(() => buildEntry({ date: D, type: 'settle_customer', party: 'C', amount: 1, ref: 'R-2' }, b), /بیشتر از بدهی/);
  b = run(b, { type: 'settle_supplier', party: 'S', amount: 8_050_000_000, pay: 'bank', ref: 'H-1' });
  b = run(b, { type: 'commission_paid', amount: 5_000_000 });
  b = run(b, { type: 'commission_earned', amount: 10_000_000, pay: 'cash' });
  b = run(b, { type: 'prepayment', party: 'P', amount: 100_000_000 });
  b = run(b, { type: 'sell_jewelry', party: 'P', grams: 3, fineness: 750, price750: 82_000_000, making: 3_000_000, profitPct: 7, prepaymentUsed: 100_000_000, pay: 'cash' });
  assert.equal(balanceOf(b, '2120', 'P'), 0, 'the prepayment is used up by the sale');
  b = run(b, { type: 'buy_coin', qty: 5, unitPrice: 900_000_000 });
  b = run(b, { type: 'sell_coin', qty: 2, unitPrice: 950_000_000 });
  b = run(b, { type: 'gold_deposit', party: 'G', grams: 10, fineness: 740 });
  assert.equal(balanceOf(b, '2210', 'G'), 9.867);
  b = run(b, { type: 'expense', amount: 2_000_000 });
  const tb = trialBalance(b);
  assert.equal(tb.balanced, true);
  assert.equal(inventory(b)['1330'].qty, 3);
  assert.ok(pnl(b).realized > 0);
});

test('مرجوعی، تعویض و سند معکوس اثر را برمی‌گردانند', () => {
  let b = createBook();
  b = run(b, { type: 'capital', amount: 30_000_000_000 });
  b = run(b, { type: 'buy_supplier', party: 'S', grams: 50, fineness: 750, price750: 80_000_000, making: 0, pay: 'cash' });
  const b0 = b;
  const before = { inv: inventory(b)['1320'].fine750, cost: inventory(b)['1320'].cost, cash: balanceOf(b, '1110') };
  const r = post(b, buildEntry({ date: D, type: 'sell_jewelry', party: 'C', grams: 6, fineness: 750, price750: 82_000_000, making: 9_000_000, profitPct: 7, pay: 'cash' }, b).entry);
  b = r.book;
  const back = run(b, { type: 'return_sale', ref: r.entry.id, pay: 'cash' });
  assert.equal(inventory(back)['1320'].fine750, before.inv);
  assert.equal(inventory(back)['1320'].cost, before.cost);
  assert.equal(balanceOf(back, '1110'), before.cash, 'the refund equals what was received');
  assert.equal(pnl(back).realized, 0, 'a full return leaves no result');
  const ex = buildEntry({ date: D, type: 'exchange', ref: r.entry.id, party: 'C', pay: 'cash', next: { grams: 8, fineness: 750, price750: 82_000_000, making: 12_000_000, profitPct: 7 } }, b);
  assert.equal(ex.calc.difference, ex.calc.newTotal - ex.calc.refund);
  const ex2 = post(b, ex.entry).book;
  assert.equal(inventory(ex2)['1320'].fine750, r3(before.inv - 8));
  // reversal: every balance back to where it was before the sale
  const rev = run(b, { type: 'reverse', ref: r.entry.id });
  for (const code of Object.keys(ACCOUNT)) assert.equal(balanceOf(rev, code), balanceOf(b0, code), code);
  assert.throws(() => buildEntry({ date: D, type: 'reverse', ref: r.entry.id }, run(b, { type: 'reverse', ref: r.entry.id })), /قبلاً معکوس/);
});

test('مغایرت صندوق، وزن و عیار؛ بستن روز پیشنهاد سند می‌دهد', () => {
  let b = createBook();
  b = run(b, { type: 'capital', amount: 10_000_000_000 });
  b = run(b, { type: 'buy_melt', grams: 50, fineness: 740, price750: 80_000_000 });
  const fine = inventory(b)['1310'].fine750;
  const wc = buildEntry({ date: D, type: 'weight_count', account: '1310', grams: 49.5, fineness: 740 }, b);
  assert.equal(wc.calc.diff, r3(fine750Of(49.5, 740) - fine));
  const as = buildEntry({ date: D, type: 'assay', grams: 50, declared: 740, actual: 735 }, b);
  assert.equal(as.calc.diff, r3(fine750Of(50, 740) - fine750Of(50, 735)));
  b = post(b, as.entry).book;
  assert.equal(inventory(b)['1310'].fine750, r3(fine - as.calc.diff));
  assert.equal(inventory(b)['1310'].grams, 50, 'a purity loss changes fine gold, not the weight on the scale');
  const close = dailyClose(b, { date: D, cashCounted: balanceOf(b, '1110') - 3_000_000, counts: { 1310: { grams: 49, fineness: 735 } } });
  assert.deepEqual(close.issues.map((i) => i.code), ['CASH_DIFF', 'WEIGHT_DIFF']);
  assert.equal(close.proposals[0].lines.find((l) => l.account === '6120').dr, 3_000_000);
  const rec = reconcileInventory(b, { 1310: { fine750: inventory(b)['1310'].fine750 } });
  assert.equal(rec.matched, true);
});

test('ناوردا (هزاران عملیات تصادفی): بدهکار = بستانکار، موجودی منفی نمی‌شود، دفتر و موجودی از روزنامه مشتق‌اند، بستن دوره', () => {
  const r = rng(20261001);
  const pick = (a) => a[Math.floor(r() * a.length)];
  let b = run(createBook(), { type: 'capital', amount: 500_000_000_000 });
  const parties = ['A', 'B', 'C'];
  let posted = 0, refused = 0;
  for (let i = 0; i < 1500; i++) {
    const price = 70_000_000 + Math.floor(r() * 30_000_000);
    const kind = pick(['buy_melt', 'buy_supplier', 'sell_jewelry', 'sell_jewelry', 'buy_coin', 'sell_coin', 'settle_customer', 'expense', 'cash_count', 'assay', 'reverse', 'commission_earned', 'prepayment']);
    const a = { type: kind, party: pick(parties) };
    if (kind === 'buy_melt') Object.assign(a, { grams: Math.round(r() * 5000) / 100 + 0.01, fineness: pick([705, 740, 750, 900]), price750: price, pay: pick(['cash', 'bank']) });
    if (kind === 'buy_supplier') Object.assign(a, { grams: Math.round(r() * 3000) / 100 + 0.01, fineness: 750, price750: price, making: Math.floor(r() * 50_000_000), pay: pick(['cash', 'credit']) });
    if (kind === 'sell_jewelry') Object.assign(a, { grams: Math.round(r() * 2000) / 100 + 0.01, fineness: 750, price750: price, making: Math.floor(r() * 20_000_000), profitPct: pick([0, 5, 7]), discount: pick([0, 0, 100_000]), pay: pick(['cash', 'bank', 'credit', [{ method: 'cash', amount: 1_000_000 }]]) });
    if (kind === 'buy_coin' || kind === 'sell_coin') Object.assign(a, { qty: 1 + Math.floor(r() * 4), unitPrice: 800_000_000 + Math.floor(r() * 200_000_000) });
    if (kind === 'settle_customer') Object.assign(a, { amount: 1 + Math.floor(r() * 50_000_000), ref: `R${i}` });
    if (kind === 'expense') Object.assign(a, { amount: 1 + Math.floor(r() * 9_000_000) });
    if (kind === 'cash_count') Object.assign(a, { counted: balanceOf(b, '1110') + Math.floor(r() * 2_000_000) - 1_000_000 });
    if (kind === 'assay') Object.assign(a, { grams: 1 + Math.floor(r() * 5), declared: 740, actual: 735 });
    if (kind === 'reverse') a.ref = pick(b.entries).id;
    if (kind === 'commission_earned') a.amount = 1 + Math.floor(r() * 5_000_000);
    if (kind === 'prepayment') a.amount = 1 + Math.floor(r() * 5_000_000);
    try {
      b = post(b, buildEntry({ date: D, ...a }, b).entry).book;
      posted++;
    } catch (e) {
      assert.ok(e instanceof AcctError, e.message);
      refused++;
    }
    if (i % 50 === 0 || i === 1499) {
      const tb = trialBalance(b);
      assert.equal(tb.balanced, true, `trial balance after ${i}`);
      const inv = inventory(b);
      for (const x of Object.values(inv)) {
        assert.ok(x.fine750 >= 0 && x.qty >= 0, 'stock never negative');
        assert.equal(x.cost, balanceOf(b, x.account), 'stock cost = ledger balance of the inventory account');
        const mv = movements(b).filter((m) => m.account === x.account);
        assert.equal(r3(mv.reduce((s, m) => s + m.fine750, 0)), x.fine750, 'stock weight = sum of movements');
      }
      const L = ledger(b);
      for (const [code, acc] of Object.entries(L)) assert.equal(acc.balance, balanceOf(b, code));
    }
  }
  assert.ok(posted > 900 && refused > 0, `${posted} posted, ${refused} refused`);
  const close = closingEntry(b, D);
  const closed = post(b, close).book;
  for (const code of TEMPORARY) assert.equal(balanceOf(closed, code), 0, `${code} closed`);
  assert.equal(balanceOf(closed, '3200'), pnl(b).realized, 'the period result lands in retained earnings');
  assert.equal(trialBalance(closed).balanced, true);
});
