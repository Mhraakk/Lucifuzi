import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../content/index.mjs';
import { COIN_TYPES, RHO, RHO_750, packTare, binaryPosterior } from '../public/js/coins.mjs';
import * as MELT from '../public/js/melt.mjs';
import * as TA from '../public/js/ta.mjs';
import { checkNumeric, invoice, g750FromMazaneh, moltenPiecePrice, buyback, coinIntrinsic, COINS, densityFromWeighing, alloyAdjust, waxToMetal, platingMass, stoneCarat, resizeMetal, wireLength } from '../public/js/calc.mjs';

test('یکپارچگی محتوا', () => assert.deepEqual(C.validateContent(), []));
test('حجم برنامه آموزشی', () => {
  assert.equal(C.COURSES.length, 12);
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
  const refPack = full.weight + packTare('bank', 'emami');
  assert.ok(Math.abs(refPack - 11.133) < 1e-9 && refPack >= 10.8 && refPack <= 11.5); // market range for a vacuum-packed full coin
  ok('k9q2', refPack - 10.89);
  ok('k10q2', COIN_TYPES.gerami.pure - COIN_TYPES.parsian.pure);
  const p1 = binaryPosterior(0.05, 0.9, 0.05, true);
  ok('k11q1', p1 * 100);
  ok('k11q2', binaryPosterior(p1, 0.85, 0.03, true) * 100);
  ok('k11q3', binaryPosterior(0.07, 0.97, 0.005, false) * 100);
  // melted-gold bookkeeping — same engine as the ledger trainer and the quick-entry tool
  ok('h1q1', MELT.gram18(40e6));
  ok('h1q2', MELT.r3(MELT.eq750(12.34, 742)));
  ok('h2q1', MELT.ledgerValue(20, 740, 40e6));
  ok('h2q2', 10 * 4.6083);
  ok('h3q1', MELT.ledgerValue(15.6, 745, 39.8e6));
  const diff = MELT.r3(MELT.eq750(50, 742) - MELT.eq750(50, 750));
  ok('h4q1', Math.abs(diff));
  ok('h4q2', MELT.rT(Math.abs(diff) * MELT.gram18(40e6)));
  const settled = MELT.r3(500e6 / MELT.gram18(40e6));
  ok('h5q1', settled);
  ok('h5q2', MELT.r3(120 - settled));
  // market analysis — the same functions as the market desk
  ok('mk1q1', TA.impliedMesghal(4200, 235000));
  ok('mk1q2', TA.impliedUsdMesghal(103543000, 4213.22));
  const coin = TA.coinIntrinsic(TA.COIN_PURE_G.sekee, 4200, 235000);
  ok('mk2q1', coin);
  ok('mk2q2', TA.bubble(240505000, coin) * 100);
  ok('mk4q1', 100 - 100 / (1 + 2 / 1));
  const pv = TA.pivots(104405000, 103275000, 103543000);
  ok('mk5q1', pv.P);
  ok('mk5q2', pv.S1);
  ok('mk5q3', TA.fibLevels(90e6, 110e6).retrace.find((r) => r.r === 0.618).price);
  ok('mk6q1', 103.82 + 1.618 * (110 - 100));
  ok('mk7q1', (5e9 * 0.01) / 2e6);
  const w4 = TA.elliott([100, 110, 103.82, 120, 108, 125].map((price, i) => ({ i, price, kind: i % 2 ? 'H' : 'L' }))).find((c) => c.kind === 'impulse-done');
  assert.equal(C.QUESTIONS.get('mk6q2').a, 1);
  assert.equal(w4.rules.find((r) => r.id === 'w4').ok, false);
});
test('نمای عمومی پاسخ‌ها را لو نمی‌دهد', () => {
  const json = JSON.stringify([C.bootstrap(), ...[...C.LESSONS.keys()].map(C.publicLesson), ...C.SCENARIOS.map(C.publicScenario)]);
  assert.ok(!/"a":\d/.test(json));
  assert.ok(!/"why":/.test(json));
  assert.ok(!/"score":/.test(json));
});
