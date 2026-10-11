// spec 0024: what changed between two contents of a document, exact and in a fixed order
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { docDiff, changeText } from '../public/js/docdiff.mjs';
import * as B from '../public/js/books.mjs';

const doc = (over = {}) => {
  const d = {
    type: 'trade', date: '2026-10-01', partyId: 'p1', note: '',
    lines: [{ kind: 'melt', dir: 'in', weight: 12.45, fineness: 740, mazaneh: 400000000 }, { kind: 'coin', dir: 'out', coin: 'emami', count: 1, price: 985000000 }],
    payments: [{ method: 'pos', dir: 'in', amount: 500000000, ref: '1234' }],
    ...over,
  };
  d.calc = B.calcDoc(d);
  return d;
};
const at = (list, where, field) => list.find((c) => c.at === where && c.field === field);

test('weight, مظنه, payment amount and customer: each named with before and after', () => {
  const a = doc();
  const b = doc({
    partyId: 'p2',
    lines: [{ kind: 'melt', dir: 'in', weight: 12.54, fineness: 740, mazaneh: 401000000 }, a.lines[1]],
    payments: [{ method: 'pos', dir: 'in', amount: 450000000, ref: '1234' }],
  });
  const d = docDiff(a, b);
  assert.deepEqual(at(d, 'head', 'partyId'), { at: 'head', n: 0, field: 'partyId', label: 'طرف حساب', type: 'PARTY', from: 'p1', to: 'p2', kind: 'changed' });
  assert.equal(at(d, 'line', 'weight').from, 12.45);
  assert.equal(at(d, 'line', 'weight').to, 12.54);
  assert.equal(at(d, 'line', 'mazaneh').to, 401000000);
  assert.deepEqual([at(d, 'pay', 'amount').from, at(d, 'pay', 'amount').to], [500000000, 450000000]);
  // the totals follow: what was received, and what is left on the account
  assert.equal(at(d, 'total', 'paidIn').to, 450000000);
  assert.ok(at(d, 'total', 'credit'));
  assert.match(changeText(at(d, 'line', 'weight')), /ردیف ۱ \(آبشده\)، وزن — قبل: ۱۲٫۴۵۰ گرم؛ بعد: ۱۲٫۵۴۰ گرم/);
  assert.match(changeText(at(d, 'head', 'partyId'), { party: (id) => (id === 'p1' ? 'رضایی' : 'محمدی') }), /طرف حساب — قبل: رضایی؛ بعد: محمدی/);
});

test('an inserted line is one «added», not every later line changed', () => {
  const a = doc();
  const b = doc({ lines: [a.lines[0], { kind: 'bar', dir: 'in', serial: '3307021', weight: 10, fineness: 750, mazaneh: 400000000 }, a.lines[1]] });
  const lines = docDiff(a, b).filter((c) => c.at === 'line');
  assert.deepEqual(lines.map((c) => [c.kind, c.n, c.what]), [['added', 2, 'شمش پلمپ']]);
  // and a removed line is one «removed» at its old place
  const back = docDiff(b, a).filter((c) => c.at === 'line');
  assert.deepEqual(back.map((c) => [c.kind, c.n]), [['removed', 2]]);
});

test('a changed payment method is one changed row, not a removal and an addition', () => {
  const a = doc();
  const b = doc({ payments: [{ method: 'c2c', dir: 'in', amount: 500000000, ref: '1234' }] });
  const pays = docDiff(a, b).filter((c) => c.at === 'pay');
  assert.deepEqual(pays.map((c) => [c.kind, c.field, c.from, c.to]), [['changed', 'method', 'pos', 'c2c']]);
});

test('toman inputs of a full-edition invoice are compared in rial', () => {
  const s1 = { type: 'sale', date: '2026-10-01', partyId: 'p1', lines: [{ kind: 'coin', side: 'out', coin: 'emami', count: 1, price: 98500000 }], payments: [{ method: 'cash', dir: 'in', amount: 98500000 }] };
  const s2 = structuredClone(s1);
  s2.payments[0].amount = 90000000;
  s1.calc = B.calcDoc(s1);
  s2.calc = B.calcDoc(s2);
  const d = docDiff(s1, s2);
  assert.deepEqual([at(d, 'pay', 'amount').from, at(d, 'pay', 'amount').to], [985000000, 900000000]);
  // the part left on account appears with its side named, not as a sign
  assert.match(changeText(at(d, 'total', 'credit')), /قبل: صفر \(تسویه\)؛ بعد: ۸۵٬۰۰۰٬۰۰۰ ریال بدهی مشتری/);
});

test('identical contents give nothing; the same pair always gives the same list', () => {
  const a = doc();
  assert.deepEqual(docDiff(a, structuredClone(a)), []);
  const b = doc({ note: 'اصلاح وزن', lines: [{ ...a.lines[0], weight: 13 }, a.lines[1]] });
  assert.deepEqual(docDiff(a, b), docDiff(structuredClone(a), structuredClone(b)));
  assert.deepEqual(docDiff(a, b).map((c) => c.at), ['head', 'line', 'total', 'total']);
});

test('hawala amounts are read by their unit', () => {
  const h = (amount, unit = 'G750') => {
    const d = { type: 'hawala', date: '2026-10-01', hawala: { from: 'p1', to: 'p2', unit, amount } };
    d.calc = B.calcDoc(d);
    return d;
  };
  const d = docDiff(h(10), h(12.5));
  assert.deepEqual([at(d, 'hawala', 'amount').type, at(d, 'hawala', 'amount').from, at(d, 'hawala', 'amount').to], ['G', 10, 12.5]);
});
