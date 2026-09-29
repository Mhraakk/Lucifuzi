// Calibration (ported from typesafe-local's ots/calibration.py, spec 0002 #3). A risk score is calibrated when, of all
// the cases it called 0.8, about 80 % turn out to be real. Measure first (AUC: is there any signal? ECE: is it on the
// right scale?), then fix the scale with Platt scaling fitted on labelled cases, and judge the fix on held-out cases.
// Rules: check AUC before ECE — high AUC + bad ECE is a scale problem two numbers fix; AUC ≈ 0.5 means no signal and
// rescaling cannot help. A calibration belongs to the rules it was fitted on; applying it to other rules is refused.

export const sigmoid = (x) => 1 / (1 + Math.exp(-Math.max(-60, Math.min(60, x))));
const logaddexp0 = (z) => (z > 0 ? z + Math.log1p(Math.exp(-z)) : Math.log1p(Math.exp(z)));

/**
 * p = sigmoid(a·x + b) by Platt (1999) / Lin-Lin-Weng (2007): smoothed targets (so near-separable data does not
 * push the coefficients to infinity) and Newton steps with a backtracking line search.
 */
export function fitPlatt(xs, labels, iters = 100) {
  const pos = labels.filter((y) => y >= 0.5).length;
  const neg = labels.length - pos;
  const hi = (pos + 1) / (pos + 2);
  const lo = 1 / (neg + 2);
  const t = labels.map((y) => (y >= 0.5 ? hi : lo));
  let w = [0, -Math.log((neg + 1) / (pos + 1))];
  const nll = (v) => xs.reduce((s, x, i) => {
    const z = v[0] * x + v[1];
    return s + t[i] * logaddexp0(-z) + (1 - t[i]) * logaddexp0(z);
  }, 0);
  let cur = nll(w);
  for (let k = 0; k < iters; k++) {
    let g0 = 0, g1 = 0, h00 = 1e-10, h01 = 0, h11 = 1e-10;
    for (let i = 0; i < xs.length; i++) {
      const p = sigmoid(w[0] * xs[i] + w[1]);
      const d = p - t[i];
      g0 += d * xs[i];
      g1 += d;
      const c = Math.max(1e-12, p * (1 - p));
      h00 += c * xs[i] * xs[i];
      h01 += c * xs[i];
      h11 += c;
    }
    if (Math.max(Math.abs(g0), Math.abs(g1)) < 1e-7) break;
    const det = h00 * h11 - h01 * h01;
    const s0 = (h11 * g0 - h01 * g1) / det;
    const s1 = (h00 * g1 - h01 * g0) / det;
    let scale = 1, moved = false;
    for (let j = 0; j < 50; j++) {
      const cand = [w[0] - scale * s0, w[1] - scale * s1];
      const v = nll(cand);
      if (v < cur) {
        w = cand;
        cur = v;
        moved = true;
        break;
      }
      scale /= 2;
    }
    if (!moved) break;
  }
  return { a: w[0], b: w[1] };
}

/** Area under ROC; tied scores share the average of their ranks (no signal → 0.5, never an artefact of order). */
export function auc(scores, labels) {
  const n = scores.length;
  const order = [...scores.keys()].sort((i, j) => scores[i] - scores[j]);
  const ranks = new Array(n);
  let start = 0;
  for (let i = 1; i <= n; i++) {
    if (i === n || scores[order[i]] !== scores[order[start]]) {
      const avg = (start + 1 + i) / 2;
      for (let k = start; k < i; k++) ranks[order[k]] = avg;
      start = i;
    }
  }
  let nPos = 0, sum = 0;
  for (let i = 0; i < n; i++) if (labels[i] >= 0.5) (nPos++, (sum += ranks[i]));
  const nNeg = n - nPos;
  if (!nPos || !nNeg) return NaN;
  return (sum - (nPos * (nPos + 1)) / 2) / (nPos * nNeg);
}

export const brier = (p, y) => p.reduce((s, x, i) => s + (x - y[i]) ** 2, 0) / p.length;
export const accuracy = (p, y) => p.filter((x, i) => (x >= 0.5) === (y[i] >= 0.5)).length / p.length;

/** Confidence buckets from 0.5 to 1 (confidence = max(p, 1−p)); one definition shared by ece and the table. */
export function reliability(p, y, nBins = 10, keepEmpty = false) {
  const conf = p.map((x) => (x >= 0.5 ? x : 1 - x));
  const correct = p.map((x, i) => ((x >= 0.5) === (y[i] >= 0.5) ? 1 : 0));
  const out = [];
  for (let b = 0; b < nBins; b++) {
    const lo = 0.5 + (0.5 * b) / nBins, hi = 0.5 + (0.5 * (b + 1)) / nBins;
    const idx = conf.map((c, i) => [c, i]).filter(([c]) => (b === 0 ? c >= lo : c > lo) && c <= hi).map(([, i]) => i);
    if (!idx.length) {
      if (keepEmpty) out.push({ lo, hi, n: 0, share: 0, said: 0, actual: 0 });
      continue;
    }
    out.push({ lo, hi, n: idx.length, share: idx.length / p.length, said: idx.reduce((s, i) => s + conf[i], 0) / idx.length, actual: idx.reduce((s, i) => s + correct[i], 0) / idx.length });
  }
  return out;
}
export const ece = (p, y, nBins = 10) => reliability(p, y, nBins).reduce((s, r) => s + r.share * Math.abs(r.actual - r.said), 0);

export function report(p, y) {
  return { n: p.length, auc: auc(p, y), accuracy: accuracy(p, y), ece: ece(p, y), brier: brier(p, y), meanP: p.reduce((a, b) => a + b, 0) / p.length, baseRate: y.filter((v) => v >= 0.5).length / y.length, table: reliability(p, y, 5, true) };
}

/**
 * Fit on one half, judge on the other (a deterministic split so a re-run gives the same answer). xs are raw scores
 * (logits); returns the fitted {a, b} and before/after reports on the held-out half.
 */
export function calibrate(xs, labels, { seed = 1 } = {}) {
  const idx = [...xs.keys()];
  let s = seed;
  for (let i = idx.length - 1; i > 0; i--) {
    s = (s * 16807) % 2147483647;
    const j = s % (i + 1);
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  const half = Math.floor(idx.length / 2);
  const train = idx.slice(0, half), test = idx.slice(half);
  const fit = fitPlatt(train.map((i) => xs[i]), train.map((i) => labels[i]));
  const yt = test.map((i) => labels[i]);
  const before = report(test.map((i) => sigmoid(xs[i])), yt);
  const after = report(test.map((i) => sigmoid(fit.a * xs[i] + fit.b)), yt);
  return { ...fit, train: train.length, test: test.length, before, after, helped: after.ece < before.ece };
}
