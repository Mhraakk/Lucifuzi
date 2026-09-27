import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../content/index.mjs';
import { checkNumeric, invoice, g750FromMazaneh, moltenPiecePrice, buyback, coinIntrinsic, COINS, densityFromWeighing } from '../public/js/calc.mjs';

test('یکپارچگی محتوا', () => assert.deepEqual(C.validateContent(), []));
test('حجم برنامه آموزشی', () => {
  assert.equal(C.COURSES.length, 8);
  assert.ok(C.LESSONS.size >= 30);
  assert.ok(C.QUESTIONS.size >= 90);
  assert.ok(C.SCENARIOS.length >= 8);
});
test('پاسخ عددی پرسش‌ها با موتور محاسبه یکی است', () => {
  const q = (id) => C.QUESTIONS.get(id);
  const ok = (id, v) => assert.ok(checkNumeric(v, q(id).n, q(id).tol), `${id}: ${v} vs ${q(id).n}`);
  ok('f2q1', invoice({ weight: 5, p750: 8e6, ojrat: 15 }).total);
  ok('f2q2', invoice({ weight: 10, p750: 9e6, ojrat: 20 }).total);
  ok('f3q1', invoice({ weight: 3.2, p750: 8.5e6, ojratMode: 'perGram', ojrat: 6e5 }).total);
  ok('f4q1', buyback({ weight: 12, p750: 8e6, testedFineness: 740 }).payout);
  ok('m4q1', g750FromMazaneh(36e6));
  ok('m4q3', moltenPiecePrice(50, 740, 30e6));
  ok('m5q1', coinIntrinsic(COINS[0], 8e6));
  ok('a3q1', densityFromWeighing(10, 9.35));
});
test('نمای عمومی پاسخ‌ها را لو نمی‌دهد', () => {
  const json = JSON.stringify([C.bootstrap(), ...[...C.LESSONS.keys()].map(C.publicLesson), ...C.SCENARIOS.map(C.publicScenario)]);
  assert.ok(!/"a":\d/.test(json));
  assert.ok(!/"why":/.test(json));
  assert.ok(!/"score":/.test(json));
});
