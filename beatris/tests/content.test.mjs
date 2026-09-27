import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../content/index.mjs';
import { COIN_TYPES, RHO, RHO_750, SEAL_TYPES, binaryPosterior } from '../public/js/coins.mjs';
import { checkNumeric, invoice, g750FromMazaneh, moltenPiecePrice, buyback, coinIntrinsic, COINS, densityFromWeighing, alloyAdjust, waxToMetal, platingMass, stoneCarat, resizeMetal, wireLength } from '../public/js/calc.mjs';

test('یکپارچگی محتوا', () => assert.deepEqual(C.validateContent(), []));
test('حجم برنامه آموزشی', () => {
  assert.equal(C.COURSES.length, 10);
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
  ok('r2q1', alloyAdjust({ weight: 100, fineness: 750, target: 585 }).add);
  ok('r2q2', alloyAdjust({ weight: 10, fineness: 585, target: 750 }).add);
  ok('r3q1', waxToMetal({ waxWeight: 1.2, metalDensity: 15.5 }).metal);
  ok('r4q1', platingMass({ areaCm2: 2, microns: 0.2, density: 12.41 }));
  ok('r5q1', stoneCarat({ cut: 'round', L: 6.5, D: 4 }));
  ok('r6q1', resizeMetal({ fromSize: 54, toSize: 56, width: 4, thickness: 1.8, density: 15.5 }).grams);
  ok('r6q2', wireLength({ weight: 1, diameter: 1, density: 15.5 }));
  const full = COIN_TYPES.emami;
  ok('k1q1', full.pure);
  ok('k1q2', coinIntrinsic(COINS[0], 9e6));
  ok('k2q1', full.volume * RHO.brass);
  ok('k2q2', full.volume * RHO_750);
  ok('k3q1', full.weight * (21.7 / 22) ** 2);
  ok('k4q1', densityFromWeighing(8.133, 7.664));
  // seals and probability — the numbers come from the same engine the coin lab uses
  const refPack = full.weight + SEAL_TYPES.bank.tare;
  assert.ok(Math.abs(refPack - 10.533) < 1e-9);
  ok('k9q2', refPack - 10.29);
  ok('k10q2', COIN_TYPES.gerami.pure - COIN_TYPES.parsian.pure);
  const p1 = binaryPosterior(0.05, 0.9, 0.05, true);
  ok('k11q1', p1 * 100);
  ok('k11q2', binaryPosterior(p1, 0.85, 0.03, true) * 100);
  ok('k11q3', binaryPosterior(0.07, 0.97, 0.005, false) * 100);
});
test('نمای عمومی پاسخ‌ها را لو نمی‌دهد', () => {
  const json = JSON.stringify([C.bootstrap(), ...[...C.LESSONS.keys()].map(C.publicLesson), ...C.SCENARIOS.map(C.publicScenario)]);
  assert.ok(!/"a":\d/.test(json));
  assert.ok(!/"why":/.test(json));
  assert.ok(!/"score":/.test(json));
});
