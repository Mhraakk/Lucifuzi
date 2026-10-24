// spec 0045: every rounded figure of the books is the exact decimal fraction rounded once, half away from zero.
// The oracle does not use exact.mjs: halves are built from known answers in plain integer arithmetic, and the general
// case is rounded by its own long division on decimal digit strings. EXACT_N=200000 for a longer run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dec, mulDiv, quant, sum, exactMulDiv, exactSum } from '../public/js/exact.mjs';
import * as T from '../public/js/trade.mjs';
import * as B from '../public/js/books.mjs';

const N = Number(process.env.EXACT_N ?? 2000); // inputs per formula (about 20,000 in all)
let seed = Number(process.env.EXACT_SEED ?? 4501);
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
const pick = (a) => a[Math.floor(rnd() * a.length)];

/* ---------------- the oracle: decimal strings, long division, its own rounding ---------------- */
const digits = (x) => {
  const s = String(x);
  assert.ok(/^-?\d+(\.\d+)?$/.test(s), `oracle input ${s}`);
  const neg = s.startsWith('-');
  const [i, f = ''] = (neg ? s.slice(1) : s).split('.');
  return { neg, int: BigInt(i + f), scale: f.length };
};
/** Π nums ÷ Π dens rounded half away from zero to a multiple of step (an integer, or 0.01 / 0.001). */
function oracle(nums, dens = [], step = 1) {
  let top = 1n, bottom = 1n, neg = false;
  for (const x of nums) {
    const d = digits(x);
    (top *= d.int), (bottom *= 10n ** BigInt(d.scale)), (neg = neg !== d.neg);
  }
  for (const x of dens) {
    const d = digits(x);
    (bottom *= d.int), (top *= 10n ** BigInt(d.scale)), (neg = neg !== d.neg);
  }
  const st = digits(step);
  top *= 10n ** BigInt(st.scale);
  bottom *= st.int;
  const whole = top / bottom, rest = top % bottom;
  const q = rest * 2n < bottom ? whole : whole + 1n; // a half goes away from zero
  if (q === 0n) return 0;
  return (Number(neg ? -q : q) * Number(st.int)) / 10 ** st.scale;
}
const dp = (x, k) => {
  const v = (Math.round(x * 10 ** k) / 10 ** k).toFixed(k).replace(/\.?0+$/, '');
  return Number(v) > 0 ? v : '1';
};
const weight = () => dp(0.001 + rnd() * pick([1, 10, 100, 1000]), pick([0, 1, 2, 3, 3]));

test('exact.mjs: decimals read as written, rounded half away from zero', () => {
  assert.deepEqual(dec('12.50'), { m: 1250n, s: 2 });
  assert.deepEqual(dec(-0.001), { m: -1n, s: 3 });
  assert.deepEqual(dec(1e-7), { m: 1n, s: 7 });
  assert.deepEqual(dec(1.5e21), { m: 1500000000000000000000n, s: 0 });
  assert.deepEqual(dec(4096.22), { m: 409622n, s: 2 });
  assert.equal(quant(1.2345, 0.001), 1.235);
  assert.equal(quant(-1.2345, 0.001), -1.235);
  assert.equal(quant(2.5), 3);
  assert.equal(quant(-2.5), -3);
  assert.equal(quant(15000, 10000), 20000);
  assert.equal(quant(14999, 10000), 10000);
  assert.equal(mulDiv([1.047, 875], [750], 0.001), 1.222); // float: 1.221
  assert.equal(mulDiv([22069.26, 358075]), 7902450275); // float: …274
  assert.equal(sum([0.1, 0.2], 0.001), 0.3);
  assert.equal(sum([5.123, -0.1, '0.0005'], 0.001), 5.024);
  assert.equal(sum([]), 0);
  for (const bad of [NaN, Infinity, 'abc', '1.2.3', '']) assert.throws(() => dec(bad), RangeError);
  assert.throws(() => mulDiv([1], [0]), RangeError);
  assert.throws(() => quant(1, 0), RangeError);
});

test('the two examples of spec 0045', () => {
  const melt = T.tradeLine({ kind: 'melt', dir: 'in', weight: 1.047, fineness: 875, mazaneh: 30000000 }, { round: 1 });
  assert.equal(melt.eq750, 1.222);
  assert.equal(melt.value, oracle([1.222, 30000000, 750], [4.6083, 705]));
  const fx = T.tradeLine({ kind: 'fx', dir: 'in', code: 'USD', fxAmount: '22069.26', rate: 358075 });
  assert.equal(fx.value, 7902450275);
});

test('halves built from known answers land away from zero in every formula', () => {
  // the 750-equivalent: W/1000 g at fineness f is a half milligram exactly when W·f ≡ 375 (mod 750)
  let built = 0;
  for (let i = 0; built < N; i++) {
    const f = pick([875, 705, 585, 375, 625, 741, 999]);
    const W = int(1, 2_000_000);
    if ((W * f) % 750 !== 375) continue;
    built++;
    const want = (W * f + 375) / 750 / 1000; // the half, rounded up
    const w = (W / 1000).toString();
    assert.equal(T.tradeLine({ kind: 'melt', dir: 'in', weight: w, fineness: f, mazaneh: 400e6 }, { round: 1 }).eq750, want, `eq750 ${w} × ${f}`);
    assert.equal(T.equivalents(Number(w), f).eq750, want);
    assert.equal(B.calcLine({ kind: 'melt', side: 'in', weight: w, fineness: f, mazaneh: 40e6 }).g750, want);
    assert.equal(B.calcPayment({ method: 'gold', dir: 'in', weight: w, fineness: f, p750: 5e6 }).g750, want);
  }
  // money: k/100 × r is a half rial exactly when r ≡ 50 (mod 100) and k is odd
  for (let i = 0; i < N; i++) {
    const k = 2 * int(0, 5_000_000) + 1, r = 100 * int(0, 20_000) + 50;
    const want = (k * r + 50) / 100;
    const a = (k / 100).toFixed(2);
    assert.equal(T.tradeLine({ kind: 'fx', dir: 'out', code: 'EUR', fxAmount: a, rate: r }).value, want, `fx ${a} × ${r}`);
    assert.equal(B.calcLine({ kind: 'goods', side: 'out', qty: a, price: r / 10 }).principal, want, `goods ${a} × ${r / 10} toman`);
  }
  // a whole number of grams times a price with a half: (2m+1)/2 g × an odd price
  for (let i = 0; i < N; i++) {
    const m = int(0, 99_998), p = 2 * int(0, 50_000_000) + 1;
    const w = (m + 0.5).toString();
    const want = ((2 * m + 1) * p + 1) / 2;
    assert.equal(T.tradeLine({ kind: 'coin', dir: 'in', coin: 'bahar', count: 1, basis: 'weight', weight: w, gramPrice: p }, { round: 1 }).value, want);
  }
});

test('every booked figure equals the oracle on random inputs', () => {
  for (let i = 0; i < N; i++) {
    // base edition lines, every rounding step
    const step = pick(T.ROUND_STEPS);
    const w = weight(), f = pick(['750', '740', '705', '900', '995', '585', '999.9', '741.5']);
    const maz = String(int(30, 600) * pick([1e6, 1e5, 1e3]));
    const melt = T.tradeLine({ kind: 'melt', dir: 'out', weight: w, fineness: f, mazaneh: maz }, { round: step });
    const eq = oracle([w, f], [750], 0.001);
    assert.equal(melt.eq750, eq, `eq750 ${w} × ${f}`);
    assert.equal(melt.mesghal, oracle([w, f], [705, 4.6083], 0.001));
    assert.equal(melt.pure, oracle([w, f], [1000], 0.001));
    assert.equal(melt.value, oracle([eq, maz, 750], [4.6083, 705], step), `melt ${w} ${f} ${maz} step ${step}`);
    const g = String(int(1, 9e4) * pick([1000, 10, 25, 1]));
    assert.equal(T.tradeLine({ kind: 'bar', dir: 'in', serial: 'EX-1', weight: w, fineness: f, basis: 'gram750', g750: g }, { round: step }).value, oracle([eq, g], [], step));
    assert.equal(T.tradeLine({ kind: 'coin', dir: 'in', coin: 'half', count: 2, basis: 'weight', weight: w, gramPrice: g }, { round: step }).value, oracle([oracle([w], [], 0.001), g], [], step));
    const a = dp(0.01 + rnd() * pick([10, 1e3, 1e5]), 2), rate = String(int(1, 2e6) * pick([1, 5, 25]));
    assert.equal(T.tradeLine({ kind: 'fx', dir: 'in', code: 'AED', fxAmount: a, rate }).value, oracle([a, rate]), `fx ${a} × ${rate}`);
    const amt = (rnd() < 0.5 ? '-' : '') + dp(0.001 + rnd() * 50, 3);
    const conv = T.calcTrade({ type: 'convert', partyId: 'p', convert: { unit: 'G750', amount: amt, mazaneh: maz } });
    assert.equal(conv.convert.value, oracle([amt.replace('-', ''), maz, 750], [4.6083, 705], 10000), `convert ${amt} at ${maz}`);
    // shop books: a jewel, every way of charging the making
    const p750 = String(int(100, 9000) * pick([1000, 10, 1])), vat = pick([10, 9]);
    const mode = pick(['pct', 'gram', 'fixed']);
    const oj = mode === 'pct' ? dp(rnd() * 40, pick([0, 1, 2])) : String(int(0, 5e6));
    const pp = dp(rnd() * 15, pick([0, 1, 2]));
    const J = B.calcLine({ kind: 'jewel', side: 'out', weight: w, fineness: '750', p750, ojratMode: mode, ojrat: oj, profitPct: pp }, { vatPct: vat });
    const wr = oracle([w], [], 0.001), fee = oracle([p750, 10, 750], [750]);
    const principal = oracle([wr, fee]);
    const making = mode === 'pct' ? oracle([principal, oj], [100]) : mode === 'gram' ? oracle([wr, oj, 10]) : oracle([oj, 10]);
    const profit = oracle([String(principal + making), pp], [100]);
    assert.deepEqual([J.fee, J.principal, J.consfee, J.spro, J.vat], [fee, principal, making, profit, oracle([String(making + profit), String(vat)], [100])], `jewel ${JSON.stringify({ w, p750, mode, oj, pp })}`);
    // used gold: the stones' weight off, then the deduction
    const sw = dp(rnd() * Number(w) * 0.5, 3), ded = dp(rnd() * 20, pick([0, 1, 2]));
    if (Number(sw) < Number(w)) {
      const U = B.calcLine({ kind: 'used', side: 'in', weight: w, stoneWeight: sw, fineness: '740', p750, deductPct: ded });
      const net = (Math.round(Number(w) * 1000) - Math.round(Number(sw) * 1000)) / 1000; // both have three decimals at most
      const ufee = oracle([p750, 10, 740], [750]);
      const gross = oracle([String(net), ufee]);
      assert.deepEqual([U.weight, U.discount, U.principal], [net, oracle([gross, ded], [100]), gross - oracle([gross, ded], [100])], `used ${w} − ${sw}`);
    }
    // molten gold in the shop books: toman مظنه, to the nearest 1000 toman
    const mz = String(int(3, 60) * pick([1e6, 1e5]));
    assert.equal(B.calcLine({ kind: 'melt', side: 'out', weight: w, fineness: f, mazaneh: mz }).principal, oracle([eq, mz, 750, 10], [4.6083, 705], 10000));
    // goods with a decimal quantity, service, coins, payments
    const q = dp(0.1 + rnd() * 100, pick([0, 1, 2, 3])), price = dp(rnd() * 1e6, pick([0, 1, 2]));
    const G = B.calcLine({ kind: 'goods', side: 'out', qty: q, price });
    assert.equal(G.principal, oracle([q, oracle([price, 10])]), `goods ${q} × ${price}`);
    assert.equal(G.vat, oracle([String(G.principal), '10'], [100]));
    assert.equal(B.calcLine({ kind: 'service', side: 'out', amount: price }).consfee, oracle([price, 10]));
    assert.equal(B.toRial(price), oracle([price, 10]));
    const gp = B.calcPayment({ method: 'gold', dir: 'in', weight: w, fineness: f, p750 });
    assert.equal(gp.value, oracle([eq, p750, 10]), `gold payment ${w} ${f} ${p750}`);
    assert.equal(B.calcPayment({ method: 'coin', dir: 'in', coin: 'bahar', count: 3, price }).value, 3 * oracle([price, 10]));
    assert.equal(B.calcPayment({ method: 'cash', dir: 'in', amount: price }).value, oracle([price, 10]));
  }
});

test('away from halves nothing moved: the old float figure differs only on an exact half', () => {
  const oldR3 = (x) => Math.sign(x) * Math.round(Math.abs(x * 1000)) / 1000;
  const oldRnd = (x) => Math.sign(x) * Math.round(Math.abs(x));
  const half = (top, bottom) => (2n * (top % bottom) === bottom); // top/bottom sits exactly on a half
  let diffs = 0;
  for (let i = 0; i < N * 5; i++) {
    const W = int(1, 1_000_000), F = pick([750, 740, 705, 900, 995, 585, 875]);
    const w = W / 1000;
    const eq = T.equivalents(w, F).eq750;
    if (eq !== oldR3((w * F) / 750)) {
      diffs++;
      assert.ok(half(BigInt(W) * BigInt(F), 750n), `eq750 moved off a half: ${w} × ${F}`);
    }
    const k = int(1, 10_000_000), r = int(1, 2_000_000);
    const v = T.tradeLine({ kind: 'fx', dir: 'in', code: 'USD', fxAmount: (k / 100).toFixed(2), rate: r }).value;
    if (v !== oldRnd((k / 100) * r)) {
      diffs++;
      assert.ok(half(BigInt(k) * BigInt(r), 100n), `fx moved off a half: ${k / 100} × ${r}`);
    }
  }
  assert.ok(diffs > 0, 'the sample reaches some halves, where the float figure was wrong');
});

test('the float shortcut gives the BigInt answer on every input, near halves too', () => {
  for (let i = 0; i < N * 5; i++) {
    const cases = [
      [[(Math.round(rnd() * 1e7) / 10 ** int(0, 4)), pick([750, 740, 705, 875, 999.9])], [750], 0.001],
      [[int(0, 1e6) + 0.5, 2 * int(0, 1e7) + 1], [], 1],
      [[(2 * int(0, 5e6) + 1) / 100, 100 * int(0, 2e4) + 50], [], 1],
      [[(6 * int(0, 3e5) + 3) / 1000, 875], [750], 0.001],
      [[Math.round(rnd() * 5e5) / 1000, int(30, 600) * 1e6, 750], [4.6083, 705], pick([1, 1000, 10000, 100000])],
      [[int(-1e9, 1e9), Math.round(rnd() * 3000) / 100], [100], 1],
    ];
    for (const [nums, dens, step] of cases) assert.equal(mulDiv(nums, dens, step), exactMulDiv(nums, dens, step), JSON.stringify({ nums, dens, step }));
    const xs = Array.from({ length: int(1, 6) }, () => Math.round((rnd() - 0.5) * 1e7) / 1000);
    assert.equal(sum(xs, 0.001), exactSum(xs, 0.001), JSON.stringify(xs));
  }
  assert.equal(mulDiv(['12.345', 875], [750], 0.001), 14.403); // strings are read as written, by the BigInt path
});
