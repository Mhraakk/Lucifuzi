import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as K from '../public/js/coins.mjs';

const near = (a, b, eps) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);

test('سکه: چگالی آلیاژ ۹۰۰ طلا-مس و ۷۵۰', () => {
  near(K.coinAlloyDensity(900), 17.32, 0.02);
  near(K.RHO_750, 15.45, 0.1);
  near(K.COIN_TYPES.emami.pure, 7.3197, 1e-4);
  near(K.COIN_TYPES.half.weight * 2, K.COIN_TYPES.emami.weight, 1e-9);
});
test('سکه اصل: هیچ پرچم قرمزی ندارد (همه سکه‌ها، بذرهای متعدد)', () => {
  for (const id of Object.keys(K.COIN_TYPES)) for (let seed = 1; seed <= 25; seed++) assert.deepEqual(K.assessCoin(K.makeSpecimen(id, 'genuine', seed)), [], `${id}#${seed}`);
});
test('هر نوع تقلب نشانه مشخص خودش را دارد', () => {
  const expect = { brass: ['weight', 'density'], steel: ['magnet', 'weight'], lowkarat: ['weight', 'xrf'], shaved: ['diameter', 'reeds'], cast: ['detail'], plugged: ['plug', 'ring'], tungsten: ['ring'], wrongdie: ['die', 'reeds'] };
  for (const [kind, keys] of Object.entries(expect))
    for (const id of ['emami', 'half', 'quarter', 'gerami']) {
      const flags = K.assessCoin(K.makeSpecimen(id, kind, 3)).map((f) => f.key);
      for (const k of keys) assert.ok(flags.includes(k), `${kind}/${id}: missing ${k} in ${flags}`);
    }
  // the tungsten fake is built to pass the scale — only sound (and the lab) expose it
  for (let seed = 1; seed <= 20; seed++) assert.ok(!K.assessCoin(K.makeSpecimen('emami', 'tungsten', seed)).some((f) => f.key === 'weight'));
});
test('وزن در آب با چگالی سازگار است', () => {
  const s = K.makeSpecimen('emami', 'genuine', 7);
  near(s.density, K.COIN_TYPES.emami.density, 0.35);
  const brass = K.makeSpecimen('emami', 'brass', 7);
  assert.ok(brass.weight < 4.6 && brass.density < 9);
});
test('بازی: سطح‌ها فقط تقلب‌های مجاز خودشان را می‌دهند و قطعی‌اند', () => {
  for (const L of K.LEVELS)
    for (let seed = 1; seed < 80; seed++) {
      const s = K.pickSpecimen(L.id, seed);
      assert.ok(L.kinds.includes(s.kind), `${L.id}: ${s.kind}`);
      assert.deepEqual(K.pickSpecimen(L.id, seed), s);
    }
});
