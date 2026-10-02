import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as K from '../public/js/calc.mjs';

const near = (a, b, eps = 1) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);

test('مظنه ↔ گرم ۱۸ با ضریب ۴٫۳۳۱۸', () => {
  near(K.MAZANEH_TO_G750, 4.3318, 1e-4);
  near(K.g750FromMazaneh(40_000_000), 9_234_032, 2);
  near(K.mazanehFromG750(K.g750FromMazaneh(36_000_000)), 36_000_000, 1e-6);
});
test('فاکتور: مالیات فقط بر اجرت و سود', () => {
  const r = K.invoice({ weight: 5, p750: 8_000_000, ojrat: 15, profitPct: 7, vatPct: 10 });
  assert.equal(r.goldValue, 40_000_000);
  assert.equal(r.ojrat, 6_000_000);
  near(r.profit, 3_220_000, 1e-6);
  near(r.vat, 922_000, 1e-6);
  near(r.total, 50_142_000, 1e-6);
  const g = K.invoice({ weight: 3.2, p750: 8_500_000, ojratMode: 'perGram', ojrat: 600_000 });
  near(g.total, 31_554_240, 1e-3);
});
test('خرید مستعمل بدون مالیات و با کسر', () => {
  near(K.buyback({ weight: 12, p750: 8e6, testedFineness: 740 }).payout, 94_720_000, 1e-6);
  near(K.buyback({ weight: 10, p750: 1e6, deductPct: 2, nonGoldWeight: 1 }).payout, 8_820_000, 1e-6);
});
test('سکه، چگالی، سایز', () => {
  near(K.coinIntrinsic(K.COINS[0], 8e6), 78_076_800, 1e-3);
  near(K.densityFromWeighing(10, 9.35), 15.357, 0.01);
  assert.equal(K.nearestKarat(K.finenessFromDensity(15.5)).karat, 18);
  assert.equal(K.nearestKarat(K.finenessFromDensity(17.8)).karat, 22);
  near(K.ringFromUS(7).iso, 54.4, 0.1);
  assert.ok(Number.isNaN(K.densityFromWeighing(5, 6)));
});
test('ورودی با ارقام فارسی و جداکننده', () => {
  assert.equal(K.parseNum('۱۲٬۳۴۵٫۵'), 12345.5);
  assert.equal(K.parseNum('1,200'), 1200);
  assert.ok(Number.isNaN(K.parseNum('')));
});
test('تمرین‌های تولیدی قطعی و قابل حل‌اند', () => {
  for (const kind of Object.keys(K.DRILL_KINDS))
    for (let s = 1; s < 40; s++) {
      const a = K.makeDrill(kind, s);
      const b = K.makeDrill(kind, s);
      assert.equal(a.prompt, b.prompt);
      assert.ok(Number.isFinite(a.answer) && a.answer > 0, `${kind}/${s}`);
      assert.ok(K.checkNumeric(a.answer, a.answer, a.tol));
    }
});

test('کارگاه: آلیاژسازی، ریخته‌گری، آبکاری، وزن سنگ، سایز', () => {
  // 100 g of 750 lowered to 585 with master alloy (fineness 0)
  const lo = K.alloyAdjust({ weight: 100, fineness: 750, target: 585 });
  near(lo.add, 28.205, 0.01);
  near(lo.pureAfter, 75, 1e-9);
  // 10 g of 585 raised to 750 with 999.9 fine gold
  near(K.alloyAdjust({ weight: 10, fineness: 585, target: 750 }).add, 6.6027, 0.001);
  assert.ok(Number.isNaN(K.alloyAdjust({ weight: 10, fineness: 750, target: 800, addFineness: 0 }).add));
  // 1 g wax → 18k yellow (15.5) ≈ 16.3 g metal
  near(K.waxToMetal({ waxWeight: 1, metalDensity: 15.5 }).metal, 16.316, 0.01);
  // 2 cm² rhodium, 0.2 µm → 0.000496 g
  near(K.platingMass({ areaCm2: 2, microns: 0.2, density: 12.41 }), 0.00049640, 1e-8);
  // 6.5 mm round, 4.0 mm deep ≈ 1.03 ct
  near(K.stoneCarat({ cut: 'round', L: 6.5, D: 4 }), 1.0309, 0.001);
  // ruby (sg 4.0) of the same size is heavier
  assert.ok(K.stoneCarat({ cut: 'round', L: 6.5, D: 4, sg: 4 }) > 1.1);
  // resize 54 → 56 on a 4 × 1.8 band in 18k = 0.2232 g
  near(K.resizeMetal({ fromSize: 54, toSize: 56, width: 4, thickness: 1.8, density: 15.5 }).grams, 0.2232, 1e-4);
  // 1 g of 18k as 1 mm wire ≈ 82.1 mm
  near(K.wireLength({ weight: 1, diameter: 1, density: 15.5 }), 82.14, 0.05);
});
