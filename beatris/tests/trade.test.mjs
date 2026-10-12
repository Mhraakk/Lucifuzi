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

/* ---------------- spec 0026: income, write-off, melting, and one position for every move ---------------- */
import { buildLots } from '../public/js/lots.mjs';
const ev = (type, doc, date = '2026-10-01', i = 0) => {
  const d = { type, ...doc };
  return { id: `${type}${i}`, track: `${type}-${i}`, type, date, data: d, calc: B.calcDoc(d, { round: 10000 }), partyId: d.partyId ?? null };
};
const post = (e) => B.postings({ ...e.data, partyId: e.partyId }, e.calc);
const amt = (ps, acct, unit) => ps.filter((p) => p.acct === acct && (!unit || p.unit === unit)).reduce((s, p) => s + p.amt, 0);

test('سند درآمد: وجه، طلا یا روی حساب مشتری؛ فقط دریافت', () => {
  const cash = ev('income', { category: 'کارمزد عیارسنجی و ری‌گیری', payments: [{ method: 'cash', dir: 'in', amount: 500000 }] });
  assert.equal(cash.calc.paidIn, 5000000);
  assert.deepEqual([amt(post(cash), 'cash:main'), amt(post(cash), 'inc:کارمزد عیارسنجی و ری‌گیری')], [5000000, -5000000]);
  const gold = ev('income', { category: 'کمیسیون و حق‌الزحمه', payments: [{ method: 'gold', dir: 'in', weight: 1, fineness: 750, p750: 9000000 }] });
  assert.deepEqual([amt(post(gold), 'gold', 'G750'), amt(post(gold), 'inc:کمیسیون و حق‌الزحمه')], [1, -90000000]);
  // gold received as income is bought at the value the income gives it
  assert.deepEqual(T.movesOf(gold), [{ op: 'buy', key: 'G750', q: 1, value: 90000000 }]);
  const owed = ev('income', { partyId: 'p1', category: 'اجاره دریافتی', payments: [{ method: 'offset', dir: 'in', amount: 300000 }] });
  assert.deepEqual([amt(post(owed), 'party:p1'), amt(post(owed), 'inc:اجاره دریافتی')], [3000000, -3000000]);
  assert.throws(() => ev('income', { payments: [{ method: 'cash', dir: 'out', amount: 1 }] }), /درآمد/);
  assert.throws(() => ev('income', { payments: [] }), /درآمد/);
  assert.ok(B.INCOME_CATS.length >= 6 && B.EXPENSE_CATS.includes(T.MELT_FEE_CATEGORY));
});

test('سوخت یا بخشودگی مانده: هر واحد و هر جهت؛ بدهی بخشیده‌شده زیان به بها، طلب رهاشده با بهای صفر', () => {
  const w = (unit, amount, extra = {}) => ev('writeoff', { partyId: 'p1', writeoff: { unit, amount, ...extra } });
  const irr = w('IRR', 500000);
  assert.deepEqual([amt(post(irr), 'party:p1', 'IRR'), amt(post(irr), 'wo', 'IRR'), irr.calc.writeoff.value], [-500000, 500000, 500000]);
  assert.deepEqual(T.movesOf(irr), []);
  const g = w('G750', 2.5);
  assert.deepEqual([amt(post(g), 'party:p1', 'G750'), amt(post(g), 'wo', 'G750')], [-2.5, 2.5]);
  assert.deepEqual(T.movesOf(g), [{ op: 'lose', key: 'G750', q: 2.5 }]);
  assert.deepEqual(T.movesOf(w('G750', -0.01)), [{ op: 'buy', key: 'G750', q: 0.01, value: 0 }]);
  assert.deepEqual(T.movesOf(w('COIN:emami', 1)), [{ op: 'lose', key: 'COIN:emami', q: 1 }]);
  assert.deepEqual(T.movesOf(w('FX:USD', -20)), [{ op: 'buy', key: 'FX:USD', q: 20, value: 0 }]);
  assert.deepEqual(T.movesOf(w('BAR:ABC123', 1, { eq750: 133.32 })), [{ op: 'lose', key: 'G750', q: 133.32 }]);
  assert.throws(() => w('BAR:ABC123', 2), /شمش/);
  assert.throws(() => w('KG', 1), /واحد/);
  assert.throws(() => w('IRR', 0), /مقدار/);
});

test('ذوب و تبدیل جنس: افت، بهتر شدن عیار، سکه به آبشده، شمش به آبشده و آبشده به شمش؛ اجرت', () => {
  const t = (lines, payments = []) => ev('transform', { lines, payments });
  const bar = t([{ kind: 'bar', dir: 'out', weight: 100, fineness: 999.9, serial: 'ABC123' }, { kind: 'melt', dir: 'in', weight: 133, fineness: 750 }]);
  assert.deepEqual([bar.calc.inputs, bar.calc.outputs, bar.calc.wastage], [133.32, 133, 0.32]);
  assert.deepEqual([amt(post(bar), 'bar:ABC123'), amt(post(bar), 'gold', 'G750')], [-1, 133]);
  const coins = t([{ kind: 'coin', dir: 'out', coin: 'emami', count: 2 }, { kind: 'melt', dir: 'in', weight: 19.4, fineness: 750 }]);
  assert.deepEqual([coins.calc.inputs, coins.calc.wastage], [19.519, 0.119]);
  const seal = t([{ kind: 'melt', dir: 'out', weight: 133.5, fineness: 750 }, { kind: 'bar', dir: 'in', weight: 100, fineness: 999.9, serial: 'NEW-77' }], [{ method: 'cash', dir: 'out', amount: 2000000 }]);
  assert.equal(seal.calc.wastage, 0.18);
  assert.deepEqual([amt(post(seal), 'bar:NEW-77'), amt(post(seal), 'cash:main'), amt(post(seal), `exp:${T.MELT_FEE_CATEGORY}`)], [1, -2000000, 2000000]);
  assert.equal(t([{ kind: 'melt', dir: 'out', weight: 10, fineness: 740 }, { kind: 'melt', dir: 'in', weight: 10, fineness: 745 }]).calc.wastage, -0.066);
  assert.throws(() => t([{ kind: 'melt', dir: 'in', weight: 10, fineness: 750 }]), /ذوب/);
  assert.throws(() => t([{ kind: 'melt', dir: 'out', weight: 10, fineness: 750 }, { kind: 'coin', dir: 'in', coin: 'emami', count: 1 }]), /سکه/);
  assert.throws(() => t([{ kind: 'melt', dir: 'out', weight: 10, fineness: 750 }, { kind: 'melt', dir: 'in', weight: 120, fineness: 750 }]), /نصف/);
  assert.throws(() => t([{ kind: 'melt', dir: 'out', weight: 10, fineness: 750 }, { kind: 'melt', dir: 'in', weight: 9, fineness: 750 }], [{ method: 'cash', dir: 'in', amount: 1 }]), /اجرت/);
});

test('ذوب در نتیجه معاملات: بها به خروجی می‌رود، افت زیان به میانگین بهاست؛ سکه بهایش را به طلا می‌دهد', () => {
  const buy = { id: 'b', track: 'M-1', type: 'trade', date: '2026-10-01', data: {}, calc: T.calcTrade({ lines: [{ kind: 'melt', dir: 'in', weight: 100, fineness: 750, basis: 'amount', amount: 900000000 }, { kind: 'coin', dir: 'in', coin: 'emami', count: 2, price: 1000000000 }] }) };
  const melt = { ...ev('transform', { lines: [{ kind: 'melt', dir: 'out', weight: 100, fineness: 750 }, { kind: 'melt', dir: 'in', weight: 99.5, fineness: 750 }] }, '2026-10-02'), id: 'f1', track: 'F-1' };
  const coins = { ...ev('transform', { lines: [{ kind: 'coin', dir: 'out', coin: 'emami', count: 2 }, { kind: 'melt', dir: 'in', weight: 19.4, fineness: 750 }] }, '2026-10-03'), id: 'f2', track: 'F-2' };
  const r = T.positionReport([buy, melt, coins]);
  assert.equal(r.byDay['2026-10-02'], -4500000); // 0.5 g lost at 9,000,000 a gram
  assert.equal(r.positions['COIN:emami'].qty, 0);
  assert.equal(r.positions.G750.qty, 118.9);
  const keep = 19.4 / 19.519;
  assert.equal(r.byDay['2026-10-03'], Math.round(-2000000000 * (1 - keep)));
  assert.equal(r.positions.G750.cost, Math.round(895500000 + 2000000000 * keep));
  // FIFO lots replay the same moves: the same quantity left, and the same realized minus remaining cost
  const L = buildLots([buy, melt, coins]);
  const g = L.units.find((u) => u.unit === 'G750');
  assert.equal(g.remaining, 118.9);
  const lotNet = L.units.reduce((s, u) => s + u.realized - u.remainingCost, 0);
  const avgNet = Object.values(r.positions).reduce((s, p) => s + p.realized - p.cost, 0);
  assert.ok(Math.abs(lotNet - avgNet) <= 2, `${lotNet} vs ${avgNet}`);
});

test('یک موقعیت برای همه: طلا و سکه به‌جای وجه، نسیه طلایی و مانده جنسی افتتاحیه همان قاعده گاوصندوق', () => {
  // physical + what customers owe in goods − what the shop owes them = the position, for every unit
  const owned = (events) => {
    const s = {};
    for (const e of events)
      for (const p of B.postings({ ...e.data, partyId: e.partyId }, e.calc)) {
        const key = p.acct === 'gold' ? 'G750' : p.acct.startsWith('coin:') ? `COIN:${p.acct.slice(5)}` : p.acct.startsWith('fx:') ? `FX:${p.acct.slice(3)}` : p.acct.startsWith('party:') && p.unit !== 'IRR' ? p.unit : null;
        if (key) s[key] = Math.round(((s[key] ?? 0) + p.amt) * 1000) / 1000;
      }
    return s;
  };
  const opening = { id: 'o', track: 'O-1', type: 'opening', date: '2026-09-30', partyId: null, data: { type: 'opening', balances: [{ acct: 'party:p1', unit: 'G750', amt: -30 }, { acct: 'gold', unit: 'G750', amt: 100, cost: 900000000 }, { acct: 'party:p2', unit: 'COIN:emami', amt: 2 }] } };
  opening.calc = B.calcDoc(opening.data);
  const events = [
    opening,
    ev('receipt', { partyId: 'p1', payments: [{ method: 'gold', dir: 'in', weight: 3, fineness: 740, p750: 9000000 }] }, '2026-10-01', 1),
    ev('expense', { category: 'اجاره', payments: [{ method: 'coin', dir: 'out', coin: 'emami', count: 1, price: 100000000 }] }, '2026-10-01', 2),
    ev('sale', { partyId: 'p2', creditUnit: 'G750', creditP750: 9000000, lines: [{ kind: 'coin', coin: 'emami', count: 1, price: 100000000 }] }, '2026-10-01', 3),
  ];
  const r = T.positionReport(events);
  const s = owned(events);
  for (const key of new Set([...Object.keys(s), ...Object.keys(r.positions)])) assert.equal(r.positions[key]?.qty ?? 0, s[key] ?? 0, key);
  // opening rows realize nothing, whatever their order
  assert.equal(T.positionReport([opening]).byDay['2026-09-30'] ?? 0, 0);
});

test('مانده جنسی مشتری در افتتاحیه به میانگین بهای همان کالا در افتتاحیه؛ سود نه اضافه می‌شود نه پنهان؛ لات‌ها همان را می‌گویند', () => {
  // 100 g at 9,000,000 a gram; a customer we owe 10 g, another who owes us 4 g; the party rows come first in the form
  const opening = { id: 'o', track: 'O-1', type: 'opening', date: '2026-09-30', partyId: null, data: { type: 'opening', balances: [{ acct: 'party:p1', unit: 'G750', amt: -10 }, { acct: 'party:p2', unit: 'G750', amt: 4 }, { acct: 'gold', unit: 'G750', amt: 100, cost: 900000000 }] } };
  opening.calc = B.calcDoc(opening.data);
  const moves = T.movesOf(opening);
  assert.deepEqual(moves.map((m) => [m.q, m.cost]), [[100, 900000000], [-10, -90000000], [4, 36000000]], 'the shop’s rows first, customers’ at its average cost');
  const r = T.positionReport([opening]);
  assert.deepEqual([r.positions.G750.qty, r.positions.G750.cost], [94, 846000000]);
  // we deliver the 10 g we owe (no price), the other customer brings his 4 g (no price), and all that is left is sold
  // at 9,500,000 a gram: the profit is exactly 0.5 million a gram on the 94 g the shop owned
  const out = { ...ev('trade', { partyId: 'p1', lines: [{ kind: 'melt', dir: 'out', weight: 10, fineness: 750, priced: false }] }, '2026-10-01', 1) };
  const inn = { ...ev('trade', { partyId: 'p2', lines: [{ kind: 'melt', dir: 'in', weight: 4, fineness: 750, priced: false }] }, '2026-10-01', 2) };
  const sell = { ...ev('trade', { lines: [{ kind: 'melt', dir: 'out', weight: 94, fineness: 750, basis: 'amount', amount: 893000000 }] }, '2026-10-02', 3) };
  const all = [opening, out, inn, sell];
  const p = T.positionReport(all);
  assert.equal(p.byDay['2026-10-02'], 47000000);
  assert.equal(p.positions.G750.qty, 0);
  // FIFO lots: what the shop owes at the opening comes out of the oldest lot at cost, so nothing is short and the
  // realized result is the same
  const L = buildLots(all);
  assert.deepEqual(L.shortfalls, []);
  const g = L.units.find((u) => u.unit === 'G750');
  assert.equal(g.remaining, 0);
  assert.equal(g.realized, 47000000);
});
