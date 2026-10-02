import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../public/js/trade.mjs';
import * as B from '../public/js/books.mjs';
import * as MELT from '../public/js/melt.mjs';

const MELT_BUY = { kind: 'melt', dir: 'in', weight: 2, fineness: 740, mazaneh: 400000000 };

test('آبشده به ریال: معادل ۷۵۰، مثقال، خالص و مبلغ همان قاعده دفتر', () => {
  const l = T.tradeLine(MELT_BUY);
  assert.equal(l.eq750, 1.973);
  assert.equal(l.mesghal, 0.456);
  assert.equal(l.pure, 1.48);
  assert.equal(l.value, 182190000);
  assert.equal(l.value, MELT.ledgerValue(2, 740, 40000000) * 10); // the same figure as the ledger course (toman × 10)
  for (const [w, f, m] of [[15.6, 745, 398000000], [100, 705, 412340000], [3.215, 750, 399990000], [0.5, 999, 405000000]]) assert.equal(T.tradeLine({ kind: 'melt', weight: w, fineness: f, mazaneh: m }).value, MELT.ledgerValue(w, f, m / 10) * 10);
  // other rounding steps and bases
  assert.equal(T.tradeLine(MELT_BUY, { round: 1 }).value, Math.round(1.973 * T.g750FromMazaneh(400000000)));
  assert.equal(T.tradeLine({ ...MELT_BUY, basis: 'gram750', g750: 92000000 }, { round: 1 }).value, Math.round(1.973 * 92000000));
  assert.equal(T.tradeLine({ ...MELT_BUY, basis: 'amount', amount: '۱۸۲٬۰۰۰٬۰۰۰' }).value, 182000000);
  // the مظنه a total implies is shown back to the operator
  assert.ok(Math.abs(T.tradeLine({ ...MELT_BUY, basis: 'amount', amount: 182190000 }).impliedMazaneh - 400000000) < 20000);
  assert.throws(() => T.tradeLine({ ...MELT_BUY, fineness: 1200 }), /عیار/);
  assert.throws(() => T.tradeLine({ ...MELT_BUY, mazaneh: 0 }), /مظنه/);
});

test('سکه تعدادی، وزنی و مبلغی؛ شمش پلمپ با سریال و اجرت پلمپ؛ ارز', () => {
  assert.equal(T.tradeLine({ kind: 'coin', coin: 'emami', count: 3, price: 985000000 }).value, 2955000000);
  assert.equal(T.tradeLine({ kind: 'coin', coin: 'gerami', count: 10, basis: 'weight', weight: 10.1, gramPrice: 101000000 }, { round: 1 }).value, 1020100000);
  assert.equal(T.tradeLine({ kind: 'coin', coin: 'quarter', count: 2, basis: 'amount', amount: 600000000 }).value, 600000000);
  assert.throws(() => T.tradeLine({ kind: 'coin', coin: 'emami', count: 1.5, price: 1 }), /صحیح/);
  const bar = T.tradeLine({ kind: 'bar', dir: 'out', serial: '۳۳۰۷۰۲۱', weight: 10, fineness: 750, mazaneh: 400000000, fee: 5000000 });
  assert.equal(bar.serial, '3307021');
  assert.equal(bar.unit, 'BAR:3307021');
  assert.equal(bar.eq750, 10);
  assert.equal(bar.value, T.roundTo(10 * T.g750FromMazaneh(400000000), 10000) + 5000000);
  assert.throws(() => T.tradeLine({ kind: 'bar', serial: '', weight: 10, fineness: 750, mazaneh: 1 }), /سریال/);
  const fx = T.tradeLine({ kind: 'fx', code: 'usd', fxAmount: 100.5, rate: 1050000 });
  assert.deepEqual([fx.unit, fx.amt, fx.value], ['FX:USD', 100.5, 105525000]);
});

test('معامله کامل: خرید آبشده + فروش سکه، کارتخوان و فیش بانکی؛ نسیه ریالی روی حساب مشتری', () => {
  const doc = {
    type: 'trade', partyId: 'p1',
    lines: [MELT_BUY, { kind: 'coin', coin: 'emami', dir: 'out', count: 1, price: 985000000 }],
    payments: [{ method: 'pos', dir: 'in', amount: 500000000, account: 'b1', ref: '1234' }, { method: 'slip', dir: 'in', amount: '۲۰۰٬۰۰۰٬۰۰۰', account: 'b1', ref: '77' }],
  };
  const c = B.calcDoc(doc);
  assert.equal(c.sells, 985000000);
  assert.equal(c.buys, 182190000);
  assert.equal(c.net, 802810000);
  assert.equal(c.paidIn, 700000000);
  assert.equal(c.credit, 102810000);
  const b = B.balances(B.postings(doc, c));
  assert.equal(b['party:p1'].IRR, 102810000);
  assert.equal(b.gold.G750, 1.973);
  assert.equal(b['coin:emami'].COUNT, -1);
  assert.equal(b['bank:b1'].IRR, 700000000);
  assert.throws(() => B.calcDoc({ ...doc, payments: [{ method: 'gold', weight: 1, p750: 1 }] }), /ردیف ثبت کنید/);
});

test('ورود و خروج جنس بدون قیمت: ته‌حساب طلایی و سکه‌ای جدا از ریالی می‌ماند', () => {
  const inGold = { type: 'trade', partyId: 'p1', lines: [{ ...MELT_BUY, priced: false }] };
  const c1 = B.calcDoc(inGold);
  assert.equal(c1.net, 0);
  assert.deepEqual(c1.goods, { G750: -1.973 });
  const b1 = B.balances(B.postings(inGold, c1));
  assert.equal(b1['party:p1'].G750, -1.973); // the shop now owes the customer 1.973 g of 750
  assert.equal(b1['party:p1'].IRR, undefined);
  assert.equal(b1.gold.G750, 1.973);
  const outCoins = { type: 'trade', partyId: 'p1', lines: [{ kind: 'coin', coin: 'half', dir: 'out', count: 2, priced: false }] };
  assert.equal(B.balances(B.postings(outCoins, B.calcDoc(outCoins)))['party:p1']['COIN:half'], 2);
  const bar = { type: 'trade', partyId: 'p1', lines: [{ kind: 'bar', serial: 'Z10', weight: 10, fineness: 750, priced: false }] };
  const bb = B.balances(B.postings(bar, B.calcDoc(bar)));
  assert.deepEqual([bb['party:p1']['BAR:Z10'], bb['bar:Z10'].COUNT], [-1, 1]);
});

test('حواله بین دو مشتری و تبدیل مانده طلایی به ریال', () => {
  const h = { type: 'hawala', hawala: { from: 'a', to: 'b', unit: 'G750', amount: '۵٫۲۵' } };
  const bh = B.balances(B.postings(h, B.calcDoc(h)));
  assert.deepEqual([bh['party:a'].G750, bh['party:b'].G750], [5.25, -5.25]);
  assert.throws(() => B.calcDoc({ type: 'hawala', hawala: { from: 'a', to: 'a', unit: 'IRR', amount: 1 } }), /متفاوت/);
  assert.throws(() => B.calcDoc({ type: 'hawala', hawala: { from: 'a', to: 'b', unit: 'XYZ', amount: 1 } }), /واحد/);
  // the customer owes 10 g; settled into money at 400,000,000 مظنه
  const cv = { type: 'convert', partyId: 'p', convert: { unit: 'G750', amount: 10, mazaneh: 400000000 } };
  const c = B.calcDoc(cv);
  assert.equal(c.convert.value, T.roundTo(10 * T.g750FromMazaneh(400000000), 10000));
  const b = B.balances(B.postings(cv, c));
  assert.deepEqual([b['party:p'].G750, b['party:p'].IRR], [-10, c.convert.value]);
  const back = { type: 'convert', partyId: 'p', convert: { unit: 'COIN:emami', amount: -2, price: 980000000 } };
  const b2 = B.balances(B.postings(back, B.calcDoc(back)));
  assert.deepEqual([b2['party:p']['COIN:emami'], b2['party:p'].IRR], [2, -1960000000]);
});

test('سود و زیان: میانگین موزون، سود تحقق‌یافته و موقعیت باز؛ جابه‌جایی بدون قیمت اثری ندارد', () => {
  const ev = (date, doc) => ({ date, type: doc.type, calc: B.calcDoc(doc, { round: 1 }), data: doc });
  const events = [
    ev('2026-09-01', { type: 'trade', lines: [{ kind: 'melt', dir: 'in', weight: 10, fineness: 750, basis: 'gram750', g750: 90000000 }] }),
    ev('2026-09-02', { type: 'trade', lines: [{ kind: 'melt', dir: 'in', weight: 10, fineness: 750, basis: 'gram750', g750: 94000000 }] }),
    ev('2026-09-03', { type: 'trade', lines: [{ kind: 'melt', dir: 'out', weight: 5, fineness: 750, basis: 'gram750', g750: 96000000 }, { kind: 'melt', dir: 'in', weight: 50, fineness: 750, priced: false }] }),
    ev('2026-09-03', { type: 'trade', lines: [{ kind: 'coin', coin: 'emami', dir: 'in', count: 2, price: 900000000 }, { kind: 'coin', coin: 'emami', dir: 'out', count: 1, price: 950000000 }] }),
  ];
  const r = T.positionReport(events);
  assert.equal(r.positions.G750.qty, 15);
  assert.equal(r.positions.G750.cost, 15 * 92000000);
  assert.equal(r.positions.G750.realized, 5 * (96000000 - 92000000));
  assert.equal(r.positions['COIN:emami'].realized, 50000000);
  assert.equal(r.byDay['2026-09-03'], 20000000 + 50000000);
  // short then cover
  const s = T.positionReport([ev('2026-09-04', { type: 'trade', lines: [{ kind: 'coin', coin: 'half', dir: 'out', count: 2, price: 500000000 }] }), ev('2026-09-05', { type: 'trade', lines: [{ kind: 'coin', coin: 'half', dir: 'in', count: 2, price: 480000000 }] })]);
  assert.deepEqual([s.positions['COIN:half'].qty, s.positions['COIN:half'].realized], [0, 40000000]);
});

test('تطبیق صورتحساب بانک: مبلغ و جهت برابر، تاریخ نزدیک، شماره پیگیری برنده است', () => {
  const book = [{ id: 'a', date: '2026-09-10', amt: 50000000, ref: '111' }, { id: 'b', date: '2026-09-10', amt: 50000000, ref: '222' }, { id: 'c', date: '2026-09-11', amt: -3000000, ref: '' }, { id: 'd', date: '2026-09-01', amt: 7000000, ref: '' }];
  const stmt = [{ date: '2026-09-11', amt: 50000000, ref: '۲۲۲' }, { date: '2026-09-12', amt: -3000000, ref: '' }, { date: '2026-09-10', amt: 9, ref: '' }];
  const m = T.matchStatement(book, stmt);
  assert.deepEqual(m.matches.map((x) => [x.stmt, x.book, x.byRef]), [[0, 'b', true], [1, 'c', false]]);
  assert.deepEqual(m.unmatchedStatement, [2]);
  assert.deepEqual(m.unmatchedBook.sort(), ['a', 'd']);
  const p = T.parseStatement('1405/06/19, 50,000,000, 222\n۱۴۰۵/۰۶/۲۰;−۳٬۰۰۰٬۰۰۰\nnonsense', (s) => (/^1405\/06\/19$/.test(s) ? '2026-09-10' : /۱۴۰۵/.test(s) ? '2026-09-11' : null));
  assert.equal(p.rows.length, 2);
  assert.deepEqual(p.rows[1], { date: '2026-09-11', amt: -3000000, ref: '' });
  assert.equal(p.errors.length, 1);
});

test('نام: یکسان‌سازی ی/ک و برچسب تمایز مشتریان هم‌نام', () => {
  assert.equal(T.normName('علي  كريمي'), 'علی کریمی');
  assert.equal(T.partyLabel({ name: 'علی کریمی', alias: 'علی طلا', father: 'حسن', mobile: '09121234567' }), 'علی کریمی («علی طلا»، فرزند حسن، …۴۵۶۷)');
  assert.equal(B.fmtMoney(2000000), '۲٬۰۰۰٬۰۰۰ ریال');
  assert.equal(B.fmtMoney(2000000, 'toman'), '۲۰۰٬۰۰۰ تومان');
});
