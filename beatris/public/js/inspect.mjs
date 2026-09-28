// Counter inspection of an unsealed coin, for a report the customer can take home: every measurement
// against the official specification, then the probability of fraud from the same test accuracies as the
// coin lab (sequential Bayes, tests independent given genuine/fake) and the lab's decision bands.
import { COIN_TYPES, COIN_CONTEXTS, coinTestAccuracy, binaryPosterior, decide } from './coins.mjs';

/** Base rates of fraud before any test: the lab's contexts plus a trusted-source case. */
export const INSPECT_CONTEXTS = {
  trusted: { label: 'مشتری ثابت یا منبع معتبر', rate: 0.02 },
  counter: { label: COIN_CONTEXTS.counter.label, rate: Math.round((1 - COIN_CONTEXTS.counter.prior.genuine) * 1000) / 1000 },
  unknown: { label: COIN_CONTEXTS.unknown.label, rate: Math.round((1 - COIN_CONTEXTS.unknown.prior.genuine) * 1000) / 1000 },
};
/** Weighing tolerance: 0.25 % of the nominal weight, never tighter than 0.01 g (0.02 g for a full coin). */
export const weightTol = (c) => Math.max(0.01, Math.round(c.weight * 0.0025 * 1000) / 1000);
export const DIAMETER_TOL = 0.15; // mm; nominal diameters are approximate
export const DENSITY_TOL = 0.4; // g/cm³

/**
 * m: { weight?, diameter?, magnet?: bool, edge?: 'ok'|'bad', ring?: 'ok'|'dull', loupe?: 'ok'|'bad', density?, xrf? }
 * Only the tests actually done enter the report and the probability.
 */
export function inspectCoin(coinId, m, rate = INSPECT_CONTEXTS.counter.rate) {
  const c = COIN_TYPES[coinId];
  const rows = [];
  const add = (test, label, measured, expected, flagged) => rows.push({ test, label, measured, expected, flagged });
  const has = (v) => v !== undefined && v !== null && v !== '' && !(typeof v === 'number' && !Number.isFinite(v));
  if (has(m.weight)) add('scale', 'وزن', m.weight, { nominal: c.weight, tol: weightTol(c), unit: 'گرم' }, Math.abs(m.weight - c.weight) > weightTol(c) + 1e-9);
  if (has(m.diameter)) add('caliper', 'قطر', m.diameter, { nominal: c.diameter, tol: DIAMETER_TOL, unit: 'میلی‌متر' }, Math.abs(m.diameter - c.diameter) > DIAMETER_TOL + 1e-9);
  if (has(m.magnet)) add('magnet', 'آهنربا', m.magnet ? 'جذب می‌شود' : 'جذب نمی‌شود', { text: 'جذب نمی‌شود' }, !!m.magnet);
  if (has(m.edge)) add('edge', 'دندانه‌های لبه', m.edge === 'bad' ? 'نامنظم یا ناقص' : 'منظم', { text: 'منظم و یکنواخت' }, m.edge === 'bad');
  if (has(m.ring)) add('ring', 'صدای ضربه', m.ring === 'dull' ? 'کوتاه یا کدر' : 'زنگ‌دار و کشیده', { text: 'زنگ‌دار و کشیده' }, m.ring === 'dull');
  if (has(m.loupe)) add('loupe', 'نقش، حروف و دانه‌های حاشیه (ذره‌بین)', m.loupe === 'bad' ? 'ناهمخوان با مرجع' : 'همخوان با مرجع', { text: 'همخوان با سکه مرجع' }, m.loupe === 'bad');
  if (has(m.density)) add('water', 'چگالی (وزن در آب)', m.density, { nominal: Math.round(c.density * 100) / 100, tol: DENSITY_TOL, unit: 'گرم بر سانتی‌متر مکعب' }, Math.abs(m.density - c.density) > DENSITY_TOL);
  if (has(m.xrf)) add('xrf', 'عیار سطح (XRF)', m.xrf, { min: c.fineness - 5, unit: 'در هزار' }, m.xrf < c.fineness - 5);
  let p = rate;
  for (const r of rows) {
    const acc = coinTestAccuracy(r.test, coinId);
    p = binaryPosterior(p, acc.sens, acc.fp, r.flagged);
    Object.assign(r, { sens: acc.sens, fp: acc.fp, after: p });
  }
  return { coinId, coin: c, rate, rows, flags: rows.filter((r) => r.flagged).length, pFraud: p, decision: decide(p) };
}
