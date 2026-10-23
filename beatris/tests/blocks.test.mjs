// spec 0040: the pure parts of the interaction blocks — how far a slide has gone and when it books, which digits of a
// figure roll, which dropped files a place takes, and the pen's width and the box around the ink.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slideProgress, SLIDE_AT, rollPlan, isFigure, acceptFile, penWidth, inkBounds } from '../public/js/blockmath.mjs';

test('slide: progress runs from the inline start (right to left in RTL), clamped to 0..1', () => {
  assert.equal(slideProgress(300, 300, 200), 0);
  assert.equal(slideProgress(200, 300, 200), 0.5);
  assert.equal(slideProgress(100, 300, 200), 1);
  assert.equal(slideProgress(40, 300, 200), 1, 'past the end is still the end');
  assert.equal(slideProgress(350, 300, 200), 0, 'backwards is nothing');
  assert.equal(slideProgress(150, 100, 100, false), 0.5, 'left to right when not RTL');
  assert.equal(slideProgress(100, 300, 0), 0, 'no track, no progress');
});

test('slide: only the last tenth of the way books', () => {
  assert.equal(SLIDE_AT, 0.9);
  assert.ok(slideProgress(121, 300, 200) < SLIDE_AT, 'a long nudge (89.5%) springs back');
  assert.ok(slideProgress(120, 300, 200) >= SLIDE_AT, '90% books');
});

test('rolling figure: only the digits that changed roll, separators stay', () => {
  const plan = rollPlan('۱۰٬۲۳۴٬۰۰۰', '۱۰٬۲۹۴٬۵۰۰');
  assert.deepEqual(plan.filter((c) => c.rolls).map((c) => [c.from, c.d]), [[3, 9], [0, 5]]);
  assert.deepEqual(plan.filter((c) => 'ch' in c).map((c) => c.ch), ['٬', '٬']);
  assert.equal(plan.length, 10);
});

test('rolling figure: a figure that changed shape is set at once, and the first value never rolls', () => {
  assert.ok(rollPlan('۹٬۹۹۹', '۱۰٬۰۰۰').every((c) => !c.rolls), 'one more digit: nothing rolls to a wrong place');
  assert.ok(rollPlan(null, '۱۲۳').every((c) => !c.rolls), 'the first value is set');
  assert.ok(rollPlan('۱۲۳', '۱۲۳').every((c) => !c.rolls), 'the same value');
  assert.deepEqual(rollPlan('120', '125').map((c) => c.rolls), [false, false, true], 'Latin digits roll too');
});

test('rolling figure: only a figure is cut into columns; a unit or a word is not', () => {
  for (const f of ['۱۰٬۲۳۴٬۰۰۰', '−۱٫۲۵', '۱۲٪', '120,500', '۱۴۰۵/۰۸/۰۱', '']) assert.ok(isFigure(f), f);
  for (const f of ['۱۲٬۳۴۵ تومان', '۱۲ ریال', 'abc', null]) assert.equal(isFigure(f), f == null, String(f));
});

test('drop: a place takes files by extension or type, under its size limit', () => {
  const f = (name, type, size = 10) => ({ name, type, size });
  assert.ok(acceptFile(f('bank.CSV', 'text/csv'), '.csv,.txt'));
  assert.ok(acceptFile(f('statement.txt', ''), '.csv,.txt'), 'by extension when the type is empty');
  assert.ok(!acceptFile(f('statement.xlsx', 'application/vnd.ms-excel'), '.csv,.txt'));
  assert.ok(acceptFile(f('coin.jpg', 'image/jpeg'), 'image/*'));
  assert.ok(!acceptFile(f('coin.pdf', 'application/pdf'), 'image/*'));
  assert.ok(acceptFile(f('any.bin', 'application/octet-stream'), ''), 'no accept: anything');
  assert.ok(!acceptFile(f('coin.jpg', 'image/jpeg', 30e6), 'image/*', 20e6), 'over the limit');
  assert.ok(!acceptFile(null, 'image/*'));
});

test('signature: the pen is fuller when steady, finer when fast, never under 1.4 px', () => {
  assert.equal(penWidth(0), 3.2);
  assert.ok(penWidth(1) < penWidth(0.2));
  assert.ok(Math.abs(penWidth(50) - 1.4) < 1e-9 && penWidth(50) >= 1.4);
  assert.equal(penWidth(-1), 3.2);
});

test('signature: the saved picture is cropped to the ink with a margin', () => {
  assert.equal(inkBounds([]), null);
  assert.deepEqual(inkBounds([[{ x: 10, y: 20, w: 2 }, { x: 110, y: 60, w: 4 }]], 8), { x: 1, y: 11, w: 119, h: 59 });
});
