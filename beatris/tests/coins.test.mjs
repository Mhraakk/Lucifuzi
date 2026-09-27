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

/* ---------------- probability engine ---------------- */
import { rng } from '../public/js/calc.mjs';

test('بیز: پسین جمعش ۱ است و با محاسبه دستی می‌خواند', () => {
  const prior = { a: 0.9, b: 0.1 };
  const lik = (h) => (h === 'a' ? 0.05 : 0.9);
  const p = K.bayes(prior, lik, { t: true });
  near(p.a + p.b, 1, 1e-12);
  near(p.b, (0.1 * 0.9) / (0.1 * 0.9 + 0.9 * 0.05), 1e-12);
  near(K.binaryPosterior(0.05, 0.9, 0.05, true), 0.045 / (0.045 + 0.0475), 1e-12);
  near(K.binaryPosterior(0.05, 0.9, 0.05, false), (0.05 * 0.1) / (0.05 * 0.1 + 0.95 * 0.95), 1e-12);
  const lr = K.likelihoodRatios(0.9, 0.05);
  near(lr.pos, 18, 1e-9);
  near(K.withFraudRate({ S0: 0.9, S1: 0.06, S2: 0.04 }, 'S0', 0.2).S1, 0.12, 1e-12);
});

test('پلمپ: وزن کل بسته و آهنربا دقیقاً با ناهنجاری‌های قرعه‌کشی‌شده سازگارند', () => {
  for (const [type, T] of Object.entries(K.SEAL_TYPES))
    for (const sc of T.scenarios)
      for (let seed = 1; seed <= 300; seed++) {
        const p = K.makePack(type, sc, seed);
        const ev = K.packEvidence(p);
        assert.equal(ev.weight, p.anomalies.weight, `${type}/${sc}#${seed} weight ${p.packWeight} vs ${p.expectedWeight} (${p.note})`);
        assert.equal(ev.magnet, p.anomalies.magnet, `${type}/${sc}#${seed} magnet`);
        assert.ok(T.coins.includes(p.card));
        if (sc === 'S0') assert.ok(Object.values(ev).every((v) => !v) && p.coin.kind === 'genuine' && p.coin.coinId === p.card);
        if (p.anomalies.match) assert.notEqual(p.coin.coinId, p.card);
        else assert.equal(p.coin.coinId, p.card);
        if (['S1', 'S3', 'S5', 'S6'].includes(sc)) assert.notEqual(p.coin.kind, 'genuine');
        if (sc === 'S2' || sc === 'S4') assert.ok(!p.coin.magnetic && ['genuine', 'shaved'].includes(p.coin.kind));
        assert.deepEqual(K.makePack(type, sc, seed), p);
      }
});

test('پلمپ: پسین موتور با فراوانی واقعی شبیه‌ساز می‌خواند (کالیبراسیون مونت‌کارلو)', () => {
  const type = 'bank';
  const prior = K.sealPrior('online', type);
  const lik = K.sealLikelihood(type);
  const tests = ['holo', 'seam', 'weight', 'serial'];
  const r = rng(12345);
  const groups = new Map();
  const N = 60000;
  for (let i = 0; i < N; i++) {
    let u = r(), sc = 'S0';
    for (const [h, p] of Object.entries(prior)) if ((u -= p) < 0) { sc = h; break; }
    const ev = K.packEvidence(K.makePack(type, sc, i + 1), tests);
    const obs = {};
    for (const t of tests) {
      const acc = K.sealAccuracy(t, type);
      obs[t] = r() < (ev[t] ? acc.sens : acc.fp); // imperfect operator
    }
    const key = tests.map((t) => (obs[t] ? 1 : 0)).join('');
    const g = groups.get(key) ?? { n: 0, fraud: 0, obs };
    g.n++;
    g.fraud += sc !== 'S0' ? 1 : 0;
    groups.set(key, g);
  }
  let checked = 0;
  for (const g of groups.values()) {
    if (g.n < 800) continue;
    const pf = 1 - K.bayes(prior, lik, g.obs).S0;
    const freq = g.fraud / g.n;
    const se = Math.sqrt((pf * (1 - pf)) / g.n);
    assert.ok(Math.abs(freq - pf) < 4 * se + 0.004, `${JSON.stringify(g.obs)}: engine ${pf.toFixed(4)} vs sim ${freq.toFixed(4)} (n=${g.n})`);
    checked++;
  }
  assert.ok(checked >= 4);
});

test('پلمپ: بسته سالم با همه آزمون‌های منفی در بازار زیر ۱٪ ریسک دارد؛ استعلام بهترین آزمون اول است', () => {
  for (const type of Object.keys(K.SEAL_TYPES)) {
    const prior = K.sealPrior('market', type);
    const lik = K.sealLikelihood(type);
    const ev = K.packEvidence(K.makePack(type, 'S0', 5));
    const pf = 1 - K.bayes(prior, lik, ev).S0;
    assert.ok(pf < 0.01, `${type}: ${pf}`);
    assert.equal(K.decide(pf).key, 'accept');
    const rank = K.rankTests(prior, lik, {}, Object.keys(K.SEAL_TESTS), 'S0');
    assert.ok(rank.every((x, i) => x.gain >= 0 && (i === 0 || rank[i - 1].gain >= x.gain)));
    if (type === 'bank') assert.equal(rank[0].test, 'serial');
  }
  // the phishing QR fools the printed-link lookup but not the official inquiry
  const p = K.makePack('bank', 'S6', 3);
  assert.ok(['valid', 'notfound'].includes(K.inquire(p).status));
  for (let seed = 1; seed < 60; seed++) {
    const q = K.makePack('bank', 'S5', seed);
    if (q.anomalies.serial) assert.equal(K.inquire(q).status, 'duplicate');
    const o = K.makePack('bank', 'S3', seed);
    assert.equal(K.inquire(o).status, 'valid'); // resealed original: the serial is real
  }
});

test('سکه بدون پلمپ: ماتریس ناهنجاری از شبیه‌ساز، و تقلب آشکار احتمال بالا می‌گیرد', () => {
  for (const id of Object.keys(K.COIN_TYPES)) {
    const A = K.coinAnomalies(id);
    for (const t of Object.keys(K.COIN_TESTS)) assert.equal(A.genuine[t], 0, `${id}/${t}`);
    assert.equal(A.steel.magnet, 1);
  }
  const lik = K.coinLikelihood('emami');
  const prior = K.COIN_CONTEXTS.counter.prior;
  const brass = K.bayes(prior, lik, K.coinEvidence(K.makeSpecimen('emami', 'brass', 4), ['scale', 'water']));
  assert.ok(1 - brass.genuine > 0.99);
  const ok = K.bayes(prior, lik, K.coinEvidence(K.makeSpecimen('emami', 'genuine', 4)));
  assert.ok(1 - ok.genuine < 0.01);
  // tungsten passes the scale: only the ring test moves the needle
  const w = K.bayes(prior, lik, K.coinEvidence(K.makeSpecimen('emami', 'tungsten', 4), ['scale', 'ring']));
  assert.ok(w.tungsten > prior.tungsten * 5);
  // the coin game prior is exactly what pickSpecimen draws
  for (const L of K.LEVELS) {
    const pr = K.levelPrior(L.id);
    near(Object.values(pr).reduce((a, b) => a + b, 0), 1, 1e-12);
    const counts = {};
    for (let seed = 1; seed <= 6000; seed++) counts[K.pickSpecimen(L.id, seed).kind] = (counts[K.pickSpecimen(L.id, seed).kind] ?? 0) + 1;
    for (const [k, p] of Object.entries(pr)) near((counts[k] ?? 0) / 6000, p, 0.03);
  }
});

test('بازی پلمپ: توزیع بسته‌ها همان پیشین «آزمون آموزشی» است', () => {
  let s0 = 0;
  const N = 4000;
  for (let seed = 1; seed <= N; seed++) {
    const p = K.pickPack(seed);
    assert.ok(K.SEAL_TYPES[p.type].scenarios.includes(p.scenario));
    if (p.scenario === 'S0') s0++;
  }
  near(s0 / N, 0.4 * 0.75 + (0.4 / 0.8) * 0.25, 0.03);
});
