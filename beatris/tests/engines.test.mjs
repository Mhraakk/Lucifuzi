import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { typedChoice, choiceConfidence, scoreConfidence, softmax, noul } from '../public/js/typed.mjs';
import { fitPlatt, auc, ece, brier, sigmoid, calibrate } from '../public/js/calibration.mjs';
import { parseFineness, convert, totalOf } from '../public/js/karat.mjs';
import { buildLots } from '../public/js/lots.mjs';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} vs ${b}`);

test('typed: only legal options, probabilities sum to 1, the published confidence formulas', () => {
  const r = typedChoice(['calm', 'watch', 'alarm'], [2, 0, -1], { coverage: 0.8 });
  assert.equal(r.choice, 'calm');
  near(Object.values(r.probabilities).reduce((a, b) => a + b, 0), 1, 0.002);
  const p = softmax([2, 0, -1]);
  near(r.confidence, (Math.max(...p) - 1 / 3) / (1 - 1 / 3), 0.001);
  assert.equal(r.coverage, 0.8);
  assert.equal(choiceConfidence([1 / 3, 1 / 3, 1 / 3]), 0); // uniform → no confidence
  assert.equal(choiceConfidence([1, 0, 0]), 1);
  assert.equal(scoreConfidence([0, 1, 0]), 1);
  assert.equal(scoreConfidence([1 / 3, 1 / 3, 1 / 3]) < 0.01, true);
  assert.throws(() => typedChoice(['a'], [1, 2]));
  assert.deepEqual(noul(0.9), { type: 'noul', noul: 0.9, confidence: 0.8, coverage: 1 });
});

test('calibration: identical to typesafe-local\'s Python on the same data (Platt fit, AUC with ties, ECE, Brier)', () => {
  const f = JSON.parse(readFileSync(new URL('./fixtures-calibration.json', import.meta.url), 'utf8'));
  const fit = fitPlatt(f.gaps, f.labels);
  near(fit.a, f.a, 1e-4, 'a');
  near(fit.b, f.b, 1e-4, 'b');
  near(auc(f.gaps, f.labels), f.auc, 1e-12, 'auc');
  const pRaw = f.gaps.map(sigmoid);
  near(ece(pRaw, f.labels), f.ece, 1e-9, 'ece');
  near(brier(pRaw, f.labels), f.brier, 1e-9, 'brier');
  assert.equal(auc([1, 1, 1, 1], [1, 0, 1, 0]), f.tie_auc); // no signal is 0.5, not an artefact of order
  // biased scores (they say yes too much): AUC is unchanged by calibration, ECE improves on held-out data
  const c = calibrate(f.gaps, f.labels);
  near(c.before.auc, c.after.auc, 1e-12, 'auc unchanged');
  assert.ok(c.after.ece < c.before.ece, `ece ${c.before.ece} → ${c.after.ece}`);
  assert.equal(c.helped, true);
});

test('karat engine: every spelling, pure, 750, mesghal of 705, value at a مظنه', () => {
  assert.equal(parseFineness('750'), 750);
  assert.equal(parseFineness('18k'), 750);
  assert.equal(parseFineness('۱۸ قیراط'), 750);
  assert.equal(parseFineness('0.75'), 750);
  assert.equal(parseFineness('24'), 1000);
  assert.equal(parseFineness('999.9'), 999.9);
  assert.equal(parseFineness('۷۴۰ عیار'), 740);
  assert.equal(parseFineness('abc'), null);
  const c = convert(2, 740, { mazaneh: 400000000 });
  assert.equal(c.g750, 1.973); // the desk's number
  assert.equal(c.pure, 1.48);
  assert.equal(c.mesghal705, 0.456);
  assert.equal(c.karat, 17.76);
  assert.equal(c.at(750), 1.973);
  assert.equal(c.value, Math.round((1.973 * 400000000) / 4.331802));
  assert.throws(() => convert(-1, 750));
  assert.deepEqual(totalOf([{ weight: 10, fineness: 750 }, { weight: 10, fineness: 995 }]), { weight: 20, pure: 17.45, g750: 23.267, avgFineness: 872.5 });
});

test('lots: FIFO lots from purchases, sales traced to the lots they came from, per-lot profit', () => {
  const buy = (id, date, q, value) => ({ id, track: id, type: 'trade', date, data: {}, calc: { lines: [{ kind: 'melt', priced: true, dir: 'in', eq750: q, value, weight: q, fineness: 750 }] } });
  const sell = (id, date, q, value) => ({ id, track: id, type: 'trade', date, data: {}, calc: { lines: [{ kind: 'melt', priced: true, dir: 'out', eq750: q, value }] } });
  const r = buildLots([
    { id: 'o', track: 'O1', type: 'opening', date: '2026-01-01', data: { balances: [{ acct: 'gold', amt: 5, cost: 400 }] }, calc: {} },
    buy('b1', '2026-01-02', 10, 1000),
    buy('b2', '2026-01-03', 10, 1200),
    sell('s1', '2026-01-04', 12, 1800), // 5 from O1 (cost 400) + 7 from b1 (cost 700) → profit 1800-1100
    { id: 'a', track: 'A1', type: 'adjust', date: '2026-01-05', data: { balances: [{ acct: 'gold', amt: -1 }] }, calc: {} },
    sell('s2', '2026-01-06', 20, 2000), // 2 from b1 + 10 from b2 = 12, 8 short
  ]);
  const lot = (id) => r.lots.find((l) => l.id === id);
  assert.equal(lot('O1/L1').remaining, 0);
  assert.equal(lot('b1/L1').remaining, 0);
  assert.equal(lot('b2/L1').remaining, 0);
  assert.equal(r.sales[0].alloc.map((a) => `${a.lot}:${a.qty}`).join(','), 'O1/L1:5,b1/L1:7');
  assert.equal(r.sales[0].alloc.reduce((s, a) => s + a.profit, 0), 700);
  assert.equal(r.sales[1].alloc.map((a) => `${a.lot}:${a.qty}`).join(','), 'b1/L1:1'); // the counted shortage leaves from the oldest lot
  assert.equal(r.sales[1].alloc[0].profit, -100); // at no price: its cost is the loss
  assert.equal(r.sales[2].alloc.map((a) => `${a.lot}:${a.qty}`).join(','), 'b1/L1:2,b2/L1:10');
  assert.equal(r.sales[2].short, 8);
  assert.equal(r.shortfalls.length, 1);
  assert.equal(lot('b1/L1').out.length, 3);
  assert.deepEqual(r.units[0], { unit: 'G750', lots: 3, open: 0, remaining: 0, remainingCost: 0, realized: r.lots.reduce((s, l) => s + l.realized, 0) });
});
