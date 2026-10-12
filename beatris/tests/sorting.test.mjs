// spec 0027: one exact order for every stock and day table
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cellValue, compareCells, sortBy, nextSort, normText } from '../public/js/sorting.mjs';

test('a cell is read as what it is: figures with their units, dates, names, empty', () => {
  assert.deepEqual(cellValue('−۲٬۴۱۰٬۴۱۰٬۰۰۰ ریال'), { t: 'num', v: -2410410000 });
  assert.deepEqual(cellValue('۱۲٫۴۵۰ گرم'), { t: 'num', v: 12.45 });
  assert.deepEqual(cellValue('٤٪'), { t: 'num', v: 4 });
  assert.deepEqual(cellValue('1,250,000'), { t: 'num', v: 1250000 });
  assert.deepEqual(cellValue('+3'), { t: 'num', v: 3 });
  assert.deepEqual(cellValue('۱۴۰۵/۰۷/۰۶'), { t: 'date', v: 14050706 });
  assert.deepEqual(cellValue('2026-10-12'), { t: 'date', v: 20261012 });
  assert.deepEqual(cellValue('—'), { t: 'empty' });
  assert.deepEqual(cellValue('  '), { t: 'empty' });
  assert.equal(cellValue('۱۸ زرد').t, 'text', 'a name that starts with a digit is a name');
  assert.equal(cellValue('علي كريمي').v, normText('علی کریمی'), 'Arabic ي and ك are the Persian letters');
});

test('numbers by value, not by their Persian text; names by Persian order; empty last both ways', () => {
  const vals = ['۹٬۰۰۰', '۱۰٬۰۰۰', '—', '−۵۰۰', '۹۰۰'];
  assert.deepEqual(sortBy(vals, (x) => x, 1), ['−۵۰۰', '۹۰۰', '۹٬۰۰۰', '۱۰٬۰۰۰', '—']);
  assert.deepEqual(sortBy(vals, (x) => x, -1), ['۱۰٬۰۰۰', '۹٬۰۰۰', '۹۰۰', '−۵۰۰', '—']);
  const names = ['یاسر', 'آرش', 'بهرام', 'پرویز', 'كاوه', 'گلاره'];
  assert.deepEqual(sortBy(names, (x) => x, 1), ['آرش', 'بهرام', 'پرویز', 'كاوه', 'گلاره', 'یاسر']);
  assert.deepEqual(sortBy(['۱۴۰۵/۰۱/۰۲', '۱۴۰۴/۱۲/۲۹', '۱۴۰۵/۰۱/۰۱'], (x) => x, 1), ['۱۴۰۴/۱۲/۲۹', '۱۴۰۵/۰۱/۰۱', '۱۴۰۵/۰۱/۰۲']);
  // a raw number key (data-v) wins over the text
  assert.deepEqual(sortBy([{ v: 3 }, { v: 1 }, { v: 2 }], (x) => x.v, 1).map((x) => x.v), [1, 2, 3]);
  assert.equal(compareCells({ t: 'num', v: 1 }, { t: 'text', v: 'الف' }, 1) < 0, true, 'numbers before words');
});

test('stable: equal keys keep their natural order; dir 0 is the natural order', () => {
  const rows = [{ k: 2, n: 'a' }, { k: 1, n: 'b' }, { k: 2, n: 'c' }, { k: 1, n: 'd' }];
  assert.deepEqual(sortBy(rows, (r) => r.k, 1).map((r) => r.n), ['b', 'd', 'a', 'c']);
  assert.deepEqual(sortBy(rows, (r) => r.k, -1).map((r) => r.n), ['a', 'c', 'b', 'd']);
  assert.deepEqual(sortBy(rows, (r) => r.k, 0).map((r) => r.n), ['a', 'b', 'c', 'd']);
});

test('three clicks: ascending, descending, natural; another column starts ascending', () => {
  let s = { col: -1, dir: 0 };
  s = nextSort(s, 2);
  assert.deepEqual(s, { col: 2, dir: 1 });
  s = nextSort(s, 2);
  assert.deepEqual(s, { col: 2, dir: -1 });
  s = nextSort(s, 2);
  assert.deepEqual(s, { col: 2, dir: 0 });
  assert.deepEqual(nextSort({ col: 2, dir: -1 }, 4), { col: 4, dir: 1 });
});
