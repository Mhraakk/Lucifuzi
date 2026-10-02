// Technical analysis for the market page: indicators, chart transforms, pivots, Fibonacci, zigzag, an
// Elliott-wave rule checker and the Iranian-market relations (coin bubble, implied dollar). Pure functions over
// daily bars { d: 'YYYY-MM-DD', o, h, l, c }. Every series is aligned with its input and holds NaN while an
// indicator is still warming up. Shared by the browser, the server and the tests.
import { MESGHAL_G, MAZANEH_FINENESS } from './calc.mjs';

const fin = Number.isFinite;
const nans = (n) => new Array(n).fill(NaN);
const firstFinite = (x) => {
  let i = 0;
  while (i < x.length && !fin(x[i])) i++;
  return i;
};
export const closes = (bars) => bars.map((b) => b.c);
const highs = (bars) => bars.map((b) => b.h);
const lows = (bars) => bars.map((b) => b.l);

/* ---------------- moving averages ---------------- */
export function sma(x, n) {
  const out = nans(x.length), s0 = firstFinite(x);
  let s = 0;
  for (let i = s0; i < x.length; i++) {
    s += x[i];
    if (i - s0 >= n) s -= x[i - n];
    if (i - s0 >= n - 1) out[i] = s / n;
  }
  return out;
}
/** Exponential average seeded with the simple average of its first n values (TA-Lib convention). */
function smooth(x, n, k) {
  const out = nans(x.length), s0 = firstFinite(x);
  if (x.length - s0 < n) return out;
  let e = 0;
  for (let i = s0; i < s0 + n; i++) e += x[i];
  e /= n;
  out[s0 + n - 1] = e;
  for (let i = s0 + n; i < x.length; i++) {
    if (fin(x[i])) e = x[i] * k + e * (1 - k); // a gap in the data carries the last value forward
    out[i] = e;
  }
  return out;
}
export const ema = (x, n) => smooth(x, n, 2 / (n + 1));
/** Wilder's smoothing (RSI, ATR, ADX). */
export const rma = (x, n) => smooth(x, n, 1 / n);
export function wma(x, n) {
  const out = nans(x.length), s0 = firstFinite(x), den = (n * (n + 1)) / 2;
  for (let i = s0 + n - 1; i < x.length; i++) {
    let s = 0;
    for (let j = 0; j < n; j++) s += x[i - j] * (n - j);
    out[i] = s / den;
  }
  return out;
}
/** Rolling population standard deviation (the Bollinger convention). */
export function stdev(x, n) {
  const m = sma(x, n);
  return m.map((mu, i) => {
    if (!fin(mu)) return NaN;
    let s = 0;
    for (let j = i - n + 1; j <= i; j++) s += (x[j] - mu) ** 2;
    return Math.sqrt(s / n);
  });
}
function rolling(x, n, pick) {
  const out = nans(x.length);
  for (let i = n - 1; i < x.length; i++) {
    let m = x[i - n + 1];
    for (let j = i - n + 2; j <= i; j++) m = pick(m, x[j]);
    out[i] = m;
  }
  return out;
}
export const rollMax = (x, n) => rolling(x, n, Math.max);
export const rollMin = (x, n) => rolling(x, n, Math.min);

/* ---------------- bands and channels ---------------- */
export function bollinger(c, n = 20, k = 2) {
  const mid = sma(c, n), sd = stdev(c, n);
  const upper = mid.map((m, i) => m + k * sd[i]), lower = mid.map((m, i) => m - k * sd[i]);
  return {
    mid,
    upper,
    lower,
    pctB: c.map((v, i) => (upper[i] - lower[i] > 0 ? (v - lower[i]) / (upper[i] - lower[i]) : NaN)),
    width: mid.map((m, i) => (m > 0 ? (upper[i] - lower[i]) / m : NaN)),
  };
}
export function donchian(bars, n = 20) {
  const upper = rollMax(highs(bars), n), lower = rollMin(lows(bars), n);
  return { upper, lower, mid: upper.map((u, i) => (u + lower[i]) / 2) };
}
export function keltner(bars, n = 20, k = 2, atrN = 10) {
  const mid = ema(closes(bars), n), a = atr(bars, atrN);
  return { mid, upper: mid.map((m, i) => m + k * a[i]), lower: mid.map((m, i) => m - k * a[i]) };
}

/* ---------------- oscillators ---------------- */
export function rsi(c, n = 14) {
  const out = nans(c.length);
  if (c.length <= n) return out;
  const val = (g, l) => (l === 0 ? (g === 0 ? 50 : 100) : 100 - 100 / (1 + g / l));
  let g = 0, l = 0;
  for (let i = 1; i <= n; i++) {
    const d = c[i] - c[i - 1];
    if (d > 0) g += d;
    else l -= d;
  }
  g /= n;
  l /= n;
  out[n] = val(g, l);
  for (let i = n + 1; i < c.length; i++) {
    const d = c[i] - c[i - 1];
    g = (g * (n - 1) + Math.max(d, 0)) / n;
    l = (l * (n - 1) + Math.max(-d, 0)) / n;
    out[i] = val(g, l);
  }
  return out;
}
export function macd(c, fast = 12, slow = 26, sig = 9) {
  const f = ema(c, fast), s = ema(c, slow);
  const line = c.map((_, i) => f[i] - s[i]);
  const signal = ema(line, sig);
  return { line, signal, hist: line.map((v, i) => v - signal[i]) };
}
export function stochastic(bars, n = 14, kSmooth = 3, dSmooth = 3) {
  const hh = rollMax(highs(bars), n), ll = rollMin(lows(bars), n);
  const raw = bars.map((b, i) => (fin(hh[i]) ? (hh[i] > ll[i] ? ((b.c - ll[i]) / (hh[i] - ll[i])) * 100 : 50) : NaN));
  const k = sma(raw, kSmooth);
  return { k, d: sma(k, dSmooth) };
}
export function williamsR(bars, n = 14) {
  const hh = rollMax(highs(bars), n), ll = rollMin(lows(bars), n);
  return bars.map((b, i) => (fin(hh[i]) ? (hh[i] > ll[i] ? ((hh[i] - b.c) / (hh[i] - ll[i])) * -100 : -50) : NaN));
}
export function cci(bars, n = 20) {
  const tp = bars.map((b) => (b.h + b.l + b.c) / 3), m = sma(tp, n);
  return tp.map((v, i) => {
    if (!fin(m[i])) return NaN;
    let md = 0;
    for (let j = i - n + 1; j <= i; j++) md += Math.abs(tp[j] - m[i]);
    md /= n;
    return md > 0 ? (v - m[i]) / (0.015 * md) : 0;
  });
}
export const roc = (c, n = 12) => c.map((v, i) => (i >= n && c[i - n] ? ((v - c[i - n]) / c[i - n]) * 100 : NaN));
export const momentum = (c, n = 10) => c.map((v, i) => (i >= n ? v - c[i - n] : NaN));

/* ---------------- volatility and trend strength ---------------- */
export const trueRange = (bars) => bars.map((b, i) => (i ? Math.max(b.h - b.l, Math.abs(b.h - bars[i - 1].c), Math.abs(b.l - bars[i - 1].c)) : b.h - b.l));
export const atr = (bars, n = 14) => rma(trueRange(bars), n);
export function adx(bars, n = 14) {
  const N = bars.length, pdm = nans(N), mdm = nans(N), tr = nans(N);
  for (let i = 1; i < N; i++) {
    const up = bars[i].h - bars[i - 1].h, dn = bars[i - 1].l - bars[i].l;
    pdm[i] = up > dn && up > 0 ? up : 0;
    mdm[i] = dn > up && dn > 0 ? dn : 0;
    tr[i] = Math.max(bars[i].h - bars[i].l, Math.abs(bars[i].h - bars[i - 1].c), Math.abs(bars[i].l - bars[i - 1].c));
  }
  const st = rma(tr, n), sp = rma(pdm, n), sm = rma(mdm, n);
  const di = (s) => st.map((t, i) => (fin(t) ? (t > 0 ? (100 * s[i]) / t : 0) : NaN));
  const pdi = di(sp), mdi = di(sm);
  const dx = pdi.map((p, i) => (fin(p) ? (p + mdi[i] > 0 ? (100 * Math.abs(p - mdi[i])) / (p + mdi[i]) : 0) : NaN));
  return { adx: rma(dx, n), pdi, mdi };
}

/* ---------------- trend overlays ---------------- */
/** Wilder's parabolic SAR. dir: 1 = long (SAR under price), -1 = short. */
export function psar(bars, step = 0.02, max = 0.2) {
  const N = bars.length, sar = nans(N), dir = new Array(N).fill(0);
  if (N < 2) return { sar, dir };
  let up = bars[1].c >= bars[0].c;
  let ep = up ? Math.max(bars[0].h, bars[1].h) : Math.min(bars[0].l, bars[1].l);
  let s = up ? Math.min(bars[0].l, bars[1].l) : Math.max(bars[0].h, bars[1].h);
  let af = step;
  sar[1] = s;
  dir[1] = up ? 1 : -1;
  for (let i = 2; i < N; i++) {
    let next = s + af * (ep - s);
    if (up) {
      next = Math.min(next, bars[i - 1].l, bars[i - 2].l);
      if (bars[i].l < next) {
        up = false;
        next = ep;
        ep = bars[i].l;
        af = step;
      } else if (bars[i].h > ep) {
        ep = bars[i].h;
        af = Math.min(af + step, max);
      }
    } else {
      next = Math.max(next, bars[i - 1].h, bars[i - 2].h);
      if (bars[i].h > next) {
        up = true;
        next = ep;
        ep = bars[i].h;
        af = step;
      } else if (bars[i].l < ep) {
        ep = bars[i].l;
        af = Math.min(af + step, max);
      }
    }
    s = next;
    sar[i] = s;
    dir[i] = up ? 1 : -1;
  }
  return { sar, dir };
}
/** Supertrend (ATR bands that only ratchet with the trend); the same rules as the common Pine script. */
export function supertrend(bars, n = 10, m = 3) {
  const a = atr(bars, n), N = bars.length, line = nans(N), dir = new Array(N).fill(0);
  let up1 = NaN, dn1 = NaN, trend = 1;
  for (let i = 0; i < N; i++) {
    if (!fin(a[i])) continue;
    const hl2 = (bars[i].h + bars[i].l) / 2, pc = i ? bars[i - 1].c : bars[i].c;
    let up = hl2 - m * a[i], dn = hl2 + m * a[i];
    if (fin(up1) && pc > up1) up = Math.max(up, up1);
    if (fin(dn1) && pc < dn1) dn = Math.min(dn, dn1);
    if (fin(up1)) {
      if (trend === -1 && bars[i].c > dn1) trend = 1;
      else if (trend === 1 && bars[i].c < up1) trend = -1;
    }
    line[i] = trend === 1 ? up : dn;
    dir[i] = trend;
    up1 = up;
    dn1 = dn;
  }
  return { line, dir };
}
/** Ichimoku. spanA/spanB are plotted `shift` bars ahead, so they are `shift` entries longer than the input. */
export function ichimoku(bars, conv = 9, base = 26, spanBn = 52, shift = 26) {
  const N = bars.length, h = highs(bars), l = lows(bars);
  const mid = (n) => {
    const hh = rollMax(h, n), ll = rollMin(l, n);
    return hh.map((v, i) => (v + ll[i]) / 2);
  };
  const tenkan = mid(conv), kijun = mid(base), b52 = mid(spanBn);
  const spanA = nans(N + shift), spanB = nans(N + shift);
  for (let i = 0; i < N; i++) {
    spanA[i + shift] = (tenkan[i] + kijun[i]) / 2;
    spanB[i + shift] = b52[i];
  }
  const chikou = bars.map((_, i) => (i + shift < N ? bars[i + shift].c : NaN));
  return { tenkan, kijun, spanA, spanB, chikou, shift };
}

/* ---------------- chart transforms ---------------- */
export function heikinAshi(bars) {
  const out = [];
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i], c = (b.o + b.h + b.l + b.c) / 4;
    const o = i ? (out[i - 1].o + out[i - 1].c) / 2 : (b.o + b.c) / 2;
    out.push({ d: b.d, o, h: Math.max(b.h, o, c), l: Math.min(b.l, o, c), c });
  }
  return out;
}
/** Renko on closes: a brick per full box; a reversal needs two boxes. Each brick keeps the index of its bar. */
export function renko(bars, box) {
  const out = [];
  if (!bars.length || !(box > 0)) return out;
  let lo = Math.floor(bars[0].c / box) * box, hi = lo;
  for (let i = 0; i < bars.length; i++) {
    const c = bars[i].c;
    while (c >= hi + box) {
      out.push({ i, d: bars[i].d, o: hi, c: hi + box, up: true });
      lo = hi;
      hi += box;
    }
    while (c <= lo - box) {
      out.push({ i, d: bars[i].d, o: lo, c: lo - box, up: false });
      hi = lo;
      lo -= box;
    }
  }
  return out;
}
/** Three-line break: a line per new closing extreme; a reversal must break the last n lines. */
export function lineBreak(bars, n = 3) {
  const out = [];
  if (!bars.length) return out;
  let ref = bars[0].c;
  for (let i = 1; i < bars.length; i++) {
    const c = bars[i].c;
    const last = out.at(-1);
    if (!last) {
      if (c !== ref) out.push({ i, d: bars[i].d, o: ref, c, up: c > ref });
      continue;
    }
    const recent = out.slice(-n);
    const top = Math.max(...recent.map((x) => Math.max(x.o, x.c))), bot = Math.min(...recent.map((x) => Math.min(x.o, x.c)));
    if (last.up) {
      if (c > last.c) out.push({ i, d: bars[i].d, o: last.c, c, up: true });
      else if (c < bot) out.push({ i, d: bars[i].d, o: last.o, c, up: false });
    } else if (c < last.c) out.push({ i, d: bars[i].d, o: last.c, c, up: false });
    else if (c > top) out.push({ i, d: bars[i].d, o: last.o, c, up: true });
    ref = c;
  }
  return out;
}

/* ---------------- levels ---------------- */
/** Floor pivots from the previous period's high, low and close. */
export function pivots(h, l, c, kind = 'classic') {
  const P = (h + l + c) / 3, r = h - l;
  if (kind === 'fib') return { P, R1: P + 0.382 * r, R2: P + 0.618 * r, R3: P + r, S1: P - 0.382 * r, S2: P - 0.618 * r, S3: P - r };
  if (kind === 'camarilla') {
    const k = (f) => (r * 1.1) / f;
    return { P, R1: c + k(12), R2: c + k(6), R3: c + k(4), R4: c + k(2), S1: c - k(12), S2: c - k(6), S3: c - k(4), S4: c - k(2) };
  }
  return { P, R1: 2 * P - l, S1: 2 * P - h, R2: P + r, S2: P - r, R3: h + 2 * (P - l), S3: l - 2 * (h - P) };
}
export const FIB_RETRACE = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
export const FIB_EXTEND = [1.272, 1.618, 2, 2.618];
/** Retracements of the swing a→b (measured back from b) and extensions projected from a. */
export function fibLevels(a, b) {
  const d = b - a;
  return { retrace: FIB_RETRACE.map((r) => ({ r, price: b - r * d })), extend: FIB_EXTEND.map((r) => ({ r, price: a + r * d })) };
}

/* ---------------- zigzag and Elliott waves ---------------- */
/**
 * Swing points that reverse by at least pct %. Returns [{ i, d, price, kind: 'H' | 'L', confirmed }]; the last
 * point is the running extreme and stays unconfirmed until price turns by pct from it.
 */
export function zigzag(bars, pct = 5) {
  const out = [], th = pct / 100;
  if (bars.length < 2) return out;
  const P = (i, kind, confirmed = true) => ({ i, d: bars[i].d, price: kind === 'H' ? bars[i].h : bars[i].l, kind, confirmed });
  let dir = 0, hiI = 0, loI = 0, cand = 0;
  for (let i = 1; i < bars.length; i++) {
    const b = bars[i];
    if (dir === 0) {
      if (b.h > bars[hiI].h) hiI = i;
      if (b.l < bars[loI].l) loI = i;
      if (loI < hiI && bars[hiI].h >= bars[loI].l * (1 + th)) {
        out.push(P(loI, 'L'));
        dir = 1;
        cand = hiI;
      } else if (hiI < loI && bars[loI].l <= bars[hiI].h * (1 - th)) {
        out.push(P(hiI, 'H'));
        dir = -1;
        cand = loI;
      }
    } else if (dir === 1) {
      if (b.h >= bars[cand].h) cand = i;
      else if (b.l <= bars[cand].h * (1 - th)) {
        out.push(P(cand, 'H'));
        dir = -1;
        cand = i;
      }
    } else if (b.l <= bars[cand].l) cand = i;
    else if (b.h >= bars[cand].l * (1 + th)) {
      out.push(P(cand, 'L'));
      dir = 1;
      cand = i;
    }
  }
  if (dir) out.push(P(cand, dir === 1 ? 'H' : 'L', false));
  return out;
}

const within = (x, lo, hi) => x >= lo && x <= hi;
const closeness = (x, ideal, tol) => Math.max(0, 1 - Math.abs(x - ideal) / tol);
/**
 * Candidate Elliott counts that end at the latest swing point. Each candidate lists the hard rules (all must
 * hold), Fibonacci guidelines with the measured ratios, a 0–100 score, what the pattern implies next (targets)
 * and the price that invalidates it. Counts are interpretations, not forecasts.
 */
export function elliott(points) {
  const out = [];
  const pts = points.filter((p) => fin(p.price));
  const tail = (k) => (pts.length >= k ? pts.slice(-k) : null);
  // five waves: P0..P5 alternate; up impulse starts at a low
  const imp = tail(6);
  if (imp && alternates(imp)) {
    const up = imp[0].kind === 'L', s = up ? 1 : -1, p = imp.map((x) => x.price * s);
    const w1 = p[1] - p[0], w2 = p[1] - p[2], w3 = p[3] - p[2], w4 = p[3] - p[4], w5 = p[5] - p[4];
    const rules = [
      { id: 'w2', ok: p[2] > p[0], text: 'موج ۲ بیشتر از ۱۰۰٪ موج ۱ را برنمی‌گرداند' },
      { id: 'w3end', ok: p[3] > p[1], text: 'موج ۳ از انتهای موج ۱ فراتر می‌رود' },
      { id: 'w3short', ok: !(w3 < w1 && w3 < w5), text: 'موج ۳ کوتاه‌ترین موج محرک نیست' },
      { id: 'w4', ok: p[4] > p[1], text: 'موج ۴ وارد محدوده قیمتی موج ۱ نمی‌شود' },
    ];
    const g = [
      guide('موج ۲ ÷ موج ۱', w2 / w1, 0.382, 0.786, 0.618, 0.25),
      guide('موج ۳ ÷ موج ۱', w3 / w1, 1.382, 2.618, 1.618, 0.6),
      guide('موج ۴ ÷ موج ۳', w4 / w3, 0.236, 0.5, 0.382, 0.2),
      guide('موج ۵ ÷ موج ۱', w5 / w1, 0.618, 1.618, 1, 0.5),
    ];
    const range = p[5] - p[0];
    out.push(candidate('impulse-done', up, imp, ['۰', '۱', '۲', '۳', '۴', '۵'], rules, g, {
      next: up ? 'پایان پنج موج صعودی: انتظار اصلاح سه‌موجی (A-B-C)' : 'پایان پنج موج نزولی: انتظار برگشت سه‌موجی (A-B-C)',
      targets: [0.382, 0.5, 0.618].map((r) => ({ label: `اصلاح ${fmtR(r)}`, price: (p[5] - r * range) * s })),
      invalid: imp[5].price,
      invalidText: up ? 'عبور قیمت از سقف موج ۵ یعنی موج ۵ هنوز تمام نشده است.' : 'شکستن کف موج ۵ یعنی موج ۵ هنوز تمام نشده است.',
    }));
  }
  // waves 1–4 done, wave 5 under way (the running point is the start of wave 5)
  const four = tail(5);
  if (four && alternates(four)) {
    const up = four[0].kind === 'L', s = up ? 1 : -1, p = four.map((x) => x.price * s);
    const w1 = p[1] - p[0], w2 = p[1] - p[2], w3 = p[3] - p[2], w4 = p[3] - p[4];
    const rules = [
      { id: 'w2', ok: p[2] > p[0], text: 'موج ۲ بیشتر از ۱۰۰٪ موج ۱ را برنمی‌گرداند' },
      { id: 'w3end', ok: p[3] > p[1], text: 'موج ۳ از انتهای موج ۱ فراتر می‌رود' },
      { id: 'w4', ok: p[4] > p[1], text: 'موج ۴ وارد محدوده قیمتی موج ۱ نمی‌شود' },
    ];
    const g = [guide('موج ۲ ÷ موج ۱', w2 / w1, 0.382, 0.786, 0.618, 0.25), guide('موج ۳ ÷ موج ۱', w3 / w1, 1.382, 2.618, 1.618, 0.6), guide('موج ۴ ÷ موج ۳', w4 / w3, 0.236, 0.5, 0.382, 0.2)];
    // wave 3 may not end up the shortest: after a wave 3 shorter than wave 1, wave 5 is capped at wave 3
    const cap = w3 < w1 ? w3 : Infinity;
    const t = [
      { label: 'موج ۵ = ۰٫۶۱۸ × موج ۱', v: 0.618 * w1 },
      { label: 'موج ۵ = موج ۱', v: w1 },
      { label: 'موج ۵ = ۰٫۶۱۸ × (۰ تا ۳)', v: 0.618 * (p[3] - p[0]) },
    ].filter((x) => x.v <= cap);
    if (fin(cap)) t.push({ label: 'سقف موج ۵ = طول موج ۳ (موج ۳ کوتاه‌تر از ۱ بوده)', v: cap });
    out.push(candidate('wave5', up, four, ['۰', '۱', '۲', '۳', '۴'], rules, g, {
      next: up ? 'موج ۴ کامل: احتمال موج ۵ صعودی' : 'موج ۴ کامل: احتمال موج ۵ نزولی',
      targets: t.map((x) => ({ label: x.label, price: (p[4] + x.v) * s })),
      invalid: four[1].price,
      invalidText: up ? 'بسته شدن زیر سقف موج ۱ شمارش را باطل می‌کند.' : 'بسته شدن بالای کف موج ۱ شمارش را باطل می‌کند.',
    }));
  }
  // waves 1–2 done, wave 3 under way
  const two = tail(3);
  if (two && alternates(two)) {
    const up = two[0].kind === 'L', s = up ? 1 : -1, p = two.map((x) => x.price * s);
    const w1 = p[1] - p[0], w2 = p[1] - p[2];
    const rules = [{ id: 'w2', ok: p[2] > p[0], text: 'موج ۲ بیشتر از ۱۰۰٪ موج ۱ را برنمی‌گرداند' }];
    const g = [guide('موج ۲ ÷ موج ۱', w2 / w1, 0.382, 0.786, 0.618, 0.25)];
    out.push(candidate('wave3', up, two, ['۰', '۱', '۲'], rules, g, {
      next: up ? 'موج ۲ کامل: احتمال موج ۳ صعودی (معمولاً بلندترین موج)' : 'موج ۲ کامل: احتمال موج ۳ نزولی',
      targets: [1, 1.618, 2.618].map((r) => ({ label: `موج ۳ = ${fmtR(r)} × موج ۱`, price: (p[2] + r * w1) * s })),
      invalid: two[0].price,
      invalidText: up ? 'شکستن کف موج ۰ یعنی این دو موج آغاز روند صعودی نبوده‌اند.' : 'عبور از سقف موج ۰ یعنی آغاز روند نزولی نبوده است.',
    }));
  }
  // a finished A-B-C correction against the prior move
  const abc = tail(4);
  if (abc && alternates(abc)) {
    const down = abc[0].kind === 'H', s = down ? -1 : 1, p = abc.map((x) => x.price * s);
    const A = p[1] - p[0], B = p[1] - p[2], Cw = p[3] - p[2];
    const rules = [
      { id: 'b', ok: B < A, text: 'موج B کمتر از تمام موج A را برمی‌گرداند (اصلاح زیگزاگ)' },
      { id: 'c', ok: p[3] > p[1], text: 'موج C از انتهای موج A فراتر می‌رود' },
    ];
    const g = [guide('B ÷ A', B / A, 0.382, 0.886, 0.618, 0.3), guide('C ÷ A', Cw / A, 0.618, 1.618, 1, 0.5)];
    out.push(candidate('abc-done', !down, abc, ['۰', 'A', 'B', 'C'], rules, g, {
      next: down ? 'اصلاح نزولی A-B-C کامل: احتمال شروع روند صعودی تازه' : 'اصلاح صعودی A-B-C کامل: احتمال ادامه روند نزولی',
      targets: [0.382, 0.618, 1].map((r) => ({ label: `برگشت ${fmtR(r)} از کل اصلاح`, price: (p[3] - r * (p[3] - p[0])) * s })),
      invalid: abc[3].price,
      invalidText: down ? 'شکستن کف C یعنی اصلاح هنوز ادامه دارد.' : 'عبور از سقف C یعنی اصلاح هنوز ادامه دارد.',
    }));
  }
  return out.sort((a, b) => b.valid - a.valid || b.score - a.score);
}
const alternates = (pts) => pts.every((p, i) => !i || p.kind !== pts[i - 1].kind);
const fmtR = (r) => String(r).replace('.', '٫').replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);
function guide(label, ratio, lo, hi, ideal, tol) {
  return { label, ratio, lo, hi, ideal, ok: fin(ratio) && within(ratio, lo, hi), fit: fin(ratio) ? closeness(ratio, ideal, tol) : 0 };
}
function candidate(kind, up, pts, labels, rules, guides, rest) {
  const valid = rules.every((r) => r.ok);
  const score = valid ? Math.round((100 * guides.reduce((s, g) => s + (g.ok ? 0.5 : 0) + 0.5 * g.fit, 0)) / guides.length) : 0;
  return { kind, up, points: pts.map((p, i) => ({ ...p, label: labels[i] })), rules, guides, valid, score, live: pts.at(-1).confirmed === false, ...rest };
}

/* ---------------- statistics ---------------- */
export const logReturns = (c) => c.map((v, i) => (i && c[i - 1] > 0 && v > 0 ? Math.log(v / c[i - 1]) : NaN));
export const pctReturns = (c) => c.map((v, i) => (i && c[i - 1] ? v / c[i - 1] - 1 : NaN));
export function drawdown(c) {
  let peak = -Infinity;
  return c.map((v) => {
    peak = Math.max(peak, v);
    return peak > 0 ? v / peak - 1 : 0;
  });
}
export const maxDrawdown = (c) => Math.min(0, ...drawdown(c));
/** Bars per year observed in the data (the Iranian week has 5–6 market days). */
export function perYear(bars) {
  if (bars.length < 2) return 260;
  const days = (Date.parse(bars.at(-1).d) - Date.parse(bars[0].d)) / 86400000;
  return days > 30 ? Math.round(((bars.length - 1) / days) * 365.25) : 260;
}
/** Annualised historical volatility in % from log returns (sample deviation over n bars). */
export function histVol(c, n = 20, year = 260) {
  const r = logReturns(c), out = nans(c.length);
  for (let i = n; i < c.length; i++) {
    let s = 0, s2 = 0;
    for (let j = i - n + 1; j <= i; j++) {
      s += r[j];
      s2 += r[j] * r[j];
    }
    const v = (s2 - (s * s) / n) / (n - 1);
    out[i] = Math.sqrt(Math.max(v, 0) * year) * 100;
  }
  return out;
}
export function correlation(a, b) {
  let n = 0, sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
  for (let i = 0; i < a.length; i++) {
    if (!fin(a[i]) || !fin(b[i])) continue;
    n++;
    sa += a[i];
    sb += b[i];
    saa += a[i] * a[i];
    sbb += b[i] * b[i];
    sab += a[i] * b[i];
  }
  if (n < 3) return NaN;
  const cov = sab - (sa * sb) / n, va = saa - (sa * sa) / n, vb = sbb - (sb * sb) / n;
  return va > 0 && vb > 0 ? cov / Math.sqrt(va * vb) : NaN;
}
/** Closes of several series on the dates they share. */
export function align(series) {
  const keys = Object.keys(series);
  if (!keys.length) return { dates: [], values: {} };
  const maps = keys.map((k) => new Map(series[k].map((b) => [b.d, b.c])));
  const dates = [...maps[0].keys()].filter((d) => maps.every((m) => m.has(d))).sort();
  return { dates, values: Object.fromEntries(keys.map((k, j) => [k, dates.map((d) => maps[j].get(d))])) };
}
/** Correlation of daily log returns between every pair of series. */
export function corrMatrix(series) {
  const { dates, values } = align(series);
  const keys = Object.keys(values), r = Object.fromEntries(keys.map((k) => [k, logReturns(values[k])]));
  return { keys, n: dates.length, m: keys.map((a) => keys.map((b) => (a === b ? 1 : correlation(r[a], r[b])))) };
}
export function histogram(values, bins = 30) {
  const v = values.filter(fin);
  if (!v.length) return { edges: [], counts: [] };
  let lo = Math.min(...v), hi = Math.max(...v);
  if (hi === lo) hi = lo + 1;
  const w = (hi - lo) / bins, counts = new Array(bins).fill(0);
  for (const x of v) counts[Math.min(bins - 1, Math.floor((x - lo) / w))]++;
  return { edges: Array.from({ length: bins + 1 }, (_, i) => lo + i * w), counts, n: v.length };
}

/* ---------------- Jalali calendar ---------------- */
/** Gregorian → Jalali (the jdf algorithm; exact for 1800–2200). */
export function toJalali(gy, gm, gd) {
  const gdm = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  const gy2 = gm > 2 ? gy + 1 : gy;
  let days = 355666 + 365 * gy + Math.floor((gy2 + 3) / 4) - Math.floor((gy2 + 99) / 100) + Math.floor((gy2 + 399) / 400) + gd + gdm[gm - 1];
  let jy = -1595 + 33 * Math.floor(days / 12053);
  days %= 12053;
  jy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    jy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  return days < 186 ? [jy, 1 + Math.floor(days / 31), 1 + (days % 31)] : [jy, 7 + Math.floor((days - 186) / 30), 1 + ((days - 186) % 30)];
}
export const jalaliOf = (iso) => toJalali(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)), Number(iso.slice(8, 10)));
/** Jalali → Gregorian (the inverse jdf algorithm). */
export function toGregorian(jy, jm, jd) {
  jy += 1595;
  let days = -355668 + 365 * jy + Math.floor(jy / 33) * 8 + Math.floor(((jy % 33) + 3) / 4) + jd + (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186);
  let gy = 400 * Math.floor(days / 146097);
  days %= 146097;
  if (days > 36524) {
    days--;
    gy += 100 * Math.floor(days / 36524);
    days %= 36524;
    if (days >= 365) days++;
  }
  gy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    gy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  let gd = days + 1, gm = 1;
  const len = [31, (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  while (gm <= 12 && gd > len[gm - 1]) gd -= len[gm++ - 1];
  return [gy, gm, gd];
}
const pad2 = (n) => String(n).padStart(2, '0');
/** '1405/07/05' or '1405-7-5' → '2026-09-27'; Gregorian dates pass through; anything else → null. */
export function isoDay(text) {
  const t0 = String(text ?? '')
    .trim()
    .replace(/[۰-۹]/g, (c) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c)))
    .replace(/[٠-٩]/g, (c) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(c)));
  const m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(t0);
  if (!m) return null;
  let [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 1700) {
    const j = [y, mo, d];
    [y, mo, d] = toGregorian(y, mo, d);
    if (toJalali(y, mo, d).join() !== j.join()) return null; // e.g. Esfand 30 of a common year
  }
  const iso = `${y}-${pad2(mo)}-${pad2(d)}`;
  const t = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === iso ? iso : null;
}
export const JALALI_MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
/** Return of every Jalali month (last close ÷ previous month's last close) and the average per calendar month. */
export function seasonality(bars) {
  const months = [];
  let key = null, prevClose = NaN, lastClose = NaN;
  for (const b of bars) {
    const [jy, jm] = jalaliOf(b.d), k = jy * 100 + jm;
    if (k !== key) {
      if (key !== null && fin(prevClose)) months.push({ jy: Math.floor(key / 100), jm: key % 100, ret: lastClose / prevClose - 1 });
      prevClose = lastClose;
      key = k;
    }
    lastClose = b.c;
  }
  if (key !== null && fin(prevClose)) months.push({ jy: Math.floor(key / 100), jm: key % 100, ret: lastClose / prevClose - 1, partial: true });
  const byMonth = JALALI_MONTHS.map((name, i) => {
    const r = months.filter((m) => m.jm === i + 1 && !m.partial).map((m) => m.ret);
    return { jm: i + 1, name, n: r.length, avg: r.length ? r.reduce((a, b) => a + b, 0) / r.length : NaN, up: r.length ? r.filter((x) => x > 0).length / r.length : NaN };
  });
  return { months, byMonth };
}

/* ---------------- Iranian market relations ---------------- */
export const TROY_OUNCE_G = 31.1034768;
/** Pure gold in each coin (weight × 0.900). */
export const COIN_PURE_G = { sekee: 8.133 * 0.9, sekeb: 8.133 * 0.9, nim: 4.0665 * 0.9, rob: 2.0332 * 0.9, gerami: 1.01 * 0.9 };
/** Toman per gram of pure gold at the world price: ounce (USD) × dollar (toman) ÷ 31.1035. */
export const worldPureGram = (ons, usd) => (ons * usd) / TROY_OUNCE_G;
/** The mazaneh the world price implies: one mesghal (4.6083 g) of 705 gold. */
export const impliedMesghal = (ons, usd) => worldPureGram(ons, usd) * MESGHAL_G * (MAZANEH_FINENESS / 1000);
/** The dollar rate hidden in a domestic price ("دلار مستتر"). */
export const impliedUsdMesghal = (mesghal, ons) => mesghal / ((ons / TROY_OUNCE_G) * MESGHAL_G * (MAZANEH_FINENESS / 1000));
export const impliedUsdCoin = (price, ons, pureG) => price / ((ons / TROY_OUNCE_G) * pureG);
/** Coin value of its gold at the world price, and the bubble over it. */
export const coinIntrinsic = (pureG, ons, usd) => pureG * worldPureGram(ons, usd);
/** Coin value of its gold at the domestic melted-gold price (mazaneh). */
export const coinDomestic = (pureG, mesghal) => (pureG * mesghal) / (MESGHAL_G * (MAZANEH_FINENESS / 1000));
export const bubble = (price, value) => (value > 0 ? price / value - 1 : NaN);

/* ---------------- a plain reading of the chart ---------------- */
const median = (a) => {
  const s = a.filter(fin).sort((x, y) => x - y);
  return s.length ? s[Math.floor(s.length / 2)] : NaN;
};
/** Zigzag threshold that suits this market: three typical daily ranges, between 1.5 % and 12 %. */
export function swingPct(bars) {
  const r = median(bars.slice(-120).map((b) => ((b.h - b.l) / b.c) * 100));
  return Math.min(12, Math.max(1.5, fin(r) && r > 0 ? r * 3 : 4));
}
/**
 * Levels for the next session and the state of the market, from daily bars: classic pivots of the last bar,
 * the ATR range, Bollinger bands, the nearest swing highs and lows, trend, momentum and volatility, and two
 * "patient" prices (bid below, ask above the close). Rules are simple and printed with their reasons.
 */
export function marketRead(bars) {
  const n = bars.length;
  if (n < 60) return null;
  const c = closes(bars), last = bars[n - 1], close = last.c;
  const e20 = ema(c, 20)[n - 1], e50 = ema(c, 50)[n - 1], e200 = n >= 200 ? ema(c, 200)[n - 1] : NaN;
  const r = rsi(c, 14)[n - 1], m = macd(c), hist = m.hist[n - 1], histPrev = m.hist[n - 2];
  const a = atr(bars, 14), atrNow = a[n - 1];
  const bb = bollinger(c, 20, 2), st = supertrend(bars).dir[n - 1], dx = adx(bars).adx[n - 1];
  const piv = pivots(last.h, last.l, last.c);
  const pct = swingPct(bars);
  const from = Math.max(0, n - 260);
  const zz = zigzag(bars.slice(from), pct).map((p) => ({ ...p, i: p.i + from }));
  const conf = zz.filter((p) => p.confirmed);
  const resist = [...new Set(conf.filter((p) => p.kind === 'H' && p.price > close).map((p) => p.price))].sort((x, y) => x - y).slice(0, 3);
  const support = [...new Set(conf.filter((p) => p.kind === 'L' && p.price < close).map((p) => p.price))].sort((x, y) => y - x).slice(0, 3);
  const atrPct = (atrNow / close) * 100;
  const atrMed = median(a.slice(-120).map((v, k) => (v / c[n - 120 + k]) * 100));
  const trend = close > e20 && e20 > e50 && st === 1 ? 'up' : close < e20 && e20 < e50 && st === -1 ? 'down' : 'side';
  const strength = dx >= 25 ? 'strong' : dx < 20 ? 'weak' : 'normal';
  const momentum = r >= 70 ? 'overbought' : r <= 30 ? 'oversold' : hist > 0 ? (hist >= histPrev ? 'rising' : 'fading') : hist <= histPrev ? 'falling' : 'recovering';
  const vol = atrPct > atrMed * 1.3 ? 'high' : atrPct < atrMed * 0.75 ? 'low' : 'normal';
  const bid = (piv.S1 + (close - 0.5 * atrNow)) / 2, ask = (piv.R1 + (close + 0.5 * atrNow)) / 2;
  return {
    close,
    d: last.d,
    ema: { e20, e50, e200 },
    rsi: r,
    macdHist: hist,
    adx: dx,
    atr: atrNow,
    atrPct,
    atrMedPct: atrMed,
    pivots: piv,
    bands: { upper: bb.upper[n - 1], mid: bb.mid[n - 1], lower: bb.lower[n - 1], pctB: bb.pctB[n - 1] },
    range: { lo: close - atrNow, hi: close + atrNow },
    resist,
    support,
    swings: zz,
    swingPct: pct,
    trend,
    strength,
    momentum,
    vol,
    bid: Math.min(bid, close),
    ask: Math.max(ask, close),
  };
}
