// Exact rounding for the books (spec 0045). A typed number is the decimal it was written as: a Number reads as its
// shortest decimal, which is what was typed. A product or quotient of decimals is an exact fraction of BigInts, rounded
// once, half away from zero (the books' `rnd`), to a multiple of a step. Binary floating point cannot hold most
// decimals, so an exact half (1.047 × 875 ÷ 750 = 1.2215) could fall on the wrong side; here it never does.
//
// Speed: the float result is used whenever it is provably on the same side of the half as the exact one. Its error is
// a few units in the last place (about 2e-15 relative). Only a result within 1e-12 of a half takes the BigInt path.
// `exactMulDiv` and `exactSum` are that path alone (tests compare the two).

const TEN = [1n];
const pow10 = (k) => TEN[k] ?? (TEN[k] = 10n ** BigInt(k));
const TOL = 1e-12; // relative margin around a half, far wider than the float error

/** A decimal x = m × 10^-s, m a BigInt. Accepts a finite Number, a BigInt or a numeric string ("12.5", "1e-7"). */
export function dec(x) {
  if (typeof x === 'bigint') return { m: x, s: 0 };
  if (typeof x === 'number') {
    if (!Number.isFinite(x)) throw new RangeError(`not a finite number: ${x}`);
    if (Number.isSafeInteger(x)) return { m: BigInt(x), s: 0 };
  }
  let t = String(x).trim();
  let neg = false;
  if (t[0] === '-' || t[0] === '+') (neg = t[0] === '-'), (t = t.slice(1));
  let exp = 0;
  const e = t.search(/e/i);
  if (e >= 0) (exp = Number(t.slice(e + 1))), (t = t.slice(0, e));
  const dot = t.indexOf('.');
  const digits = dot < 0 ? t : t.slice(0, dot) + t.slice(dot + 1);
  if (!/^\d+$/.test(digits) || !Number.isInteger(exp)) throw new RangeError(`not a decimal: ${x}`);
  let s = (dot < 0 ? 0 : t.length - dot - 1) - exp;
  let m = BigInt(digits);
  if (s < 0) (m *= pow10(-s)), (s = 0);
  return { m: neg ? -m : m, s };
}

/** A step, read once: step = m × 10^-s with a positive integer m. */
const STEPS = new Map();
function stepOf(step) {
  let st = STEPS.get(step);
  if (!st) {
    const d = dec(step);
    if (d.m <= 0n) throw new RangeError(`step must be positive: ${step}`);
    st = { m: d.m, s: d.s, mn: Number(d.m), div: 10 ** d.s, f: Number(step) };
    if (STEPS.size < 64) STEPS.set(step, st);
  }
  return st;
}

/** Round the fraction n/d (d > 0) half away from zero to a multiple of the step; the result as a Number. */
function roundFraction(n, d, st) {
  // q = n / (d × step) = n × 10^s / (d × m)
  const N = n * pow10(st.s);
  const D = d * st.m;
  const a = N < 0n ? -N : N;
  let q = (2n * a + D) / (2n * D);
  if (N < 0n) q = -q;
  const v = q * st.m;
  return st.s ? Number(v) / st.div : Number(v);
}

/** The float quotient q (of size `scale`) rounded half away from zero, or undefined when q is too near a half to trust. */
function fast(q, scale, st) {
  const a = Math.abs(q);
  if (!(a < 2 ** 50)) return undefined; // too large to keep its fraction, or not a number
  const whole = Math.floor(a);
  const r = a - whole;
  if (Math.abs(r - 0.5) <= scale * TOL + 1e-300) return undefined;
  const n = r > 0.5 ? whole + 1 : whole;
  if (n === 0) return 0;
  const v = (q < 0 ? -n : n) * st.mn;
  return st.s ? v / st.div : v;
}

/** Π nums ÷ Π dens, exactly, rounded half away from zero to a multiple of step; BigInt arithmetic only. */
export function exactMulDiv(nums, dens = [], step = 1) {
  let n = 1n;
  let d = 1n;
  for (const x of nums) {
    const v = dec(x);
    n *= v.m;
    d *= pow10(v.s);
  }
  for (const x of dens) {
    const v = dec(x);
    if (v.m === 0n) throw new RangeError('division by zero');
    d *= v.m;
    n *= pow10(v.s);
  }
  if (d < 0n) (n = -n), (d = -d);
  return roundFraction(n, d, stepOf(step));
}

/** Π nums ÷ Π dens rounded half away from zero to a multiple of step (default: a whole unit). Equal to exactMulDiv. */
export function mulDiv(nums, dens = [], step = 1) {
  const st = stepOf(step);
  let f = 1;
  for (const x of nums) {
    if (typeof x !== 'number') return exactMulDiv(nums, dens, step); // a string or BigInt: read it as written
    f *= x;
  }
  for (const x of dens) {
    if (typeof x !== 'number') return exactMulDiv(nums, dens, step);
    f /= x;
  }
  const q = f / st.f;
  const out = fast(q, Math.abs(q), st);
  return out === undefined ? exactMulDiv(nums, dens, step) : out;
}

/** One decimal rounded half away from zero to a multiple of step: quant(1.2345, 0.001) = 1.235. */
export const quant = (x, step = 1) => mulDiv([x], [], step);

/** The exact sum of decimals (a minus sign subtracts), rounded half away from zero to a multiple of step; BigInt only. */
export function exactSum(xs, step = 1) {
  const ds = xs.map(dec);
  const s = Math.max(0, ...ds.map((v) => v.s));
  let n = 0n;
  for (const v of ds) n += v.m * pow10(s - v.s);
  return roundFraction(n, pow10(s), stepOf(step));
}

/** The sum of decimals rounded half away from zero to a multiple of step. Equal to exactSum. */
export function sum(xs, step = 1) {
  const st = stepOf(step);
  let f = 0;
  let size = 0;
  for (const x of xs) {
    if (typeof x !== 'number') return exactSum(xs, step);
    f += x;
    size += Math.abs(x);
  }
  const out = fast(f / st.f, (size / st.f) * (xs.length + 1), st);
  return out === undefined ? exactSum(xs, step) : out;
}
