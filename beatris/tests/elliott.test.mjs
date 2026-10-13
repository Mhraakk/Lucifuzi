// spec 0003: the Elliott studio engine — multi-degree count, sub-waves only when they keep the rules, Fibonacci of the
// counted move, the channel, typed scenarios and resampling
import test from 'node:test';
import assert from 'node:assert/strict';
import { waveMap, resample, subdivide } from '../public/js/elliott.mjs';

// a clean up impulse whose five legs are themselves 5-3-5-3-5
function impulse() {
  const path = [100];
  const W = (to, n) => {
    const a = path.at(-1);
    for (let k = 1; k <= n; k++) path.push(a + ((to - a) * k) / n);
  };
  W(115, 6); W(108, 4); W(135, 8); W(127, 4); W(145, 6);
  W(125, 5); W(133, 4); W(118, 6);
  W(150, 6); W(138, 4); W(200, 10); W(185, 5); W(225, 7);
  W(200, 5); W(210, 4); W(192, 5);
  W(215, 6); W(205, 4); W(240, 7); W(230, 4); W(252, 6);
  return path.map((c, i) => {
    const o = i ? path[i - 1] : c;
    return { d: new Date(Date.UTC(2024, 0, 1) + i * 864e5).toISOString().slice(0, 10), o, h: Math.max(o, c) * 1.002, l: Math.min(o, c) * 0.998, c };
  });
}

test('the large degree is the five-wave impulse and every leg subdivides 5-3-5-3-5', () => {
  const m = waveMap(impulse());
  assert.equal(m.major.kind, 'impulse-done');
  assert.equal(m.major.up, true);
  assert.deepEqual(m.major.points.map((p) => p.label), ['', 'I', 'II', 'III', 'IV', 'V']);
  assert.deepEqual(m.minor.map((x) => `${x.leg}:${x.points.map((p) => p.label).join('')}`), ['0:12345', '1:ABC', '2:12345', '3:ABC', '4:12345']);
  assert.ok(m.major.rules.every((r) => r.ok));
});

test('Fibonacci runs from the start of the count to its extreme; the channel passes through waves 2 and 4', () => {
  const b = impulse(), m = waveMap(b);
  const lv = Object.fromEntries(m.fib.levels.map((x) => [x.r, x.price]));
  assert.equal(lv[0], m.major.points[5].price);
  assert.ok(Math.abs(lv[1] - m.major.points[0].price) < 1e-9);
  assert.ok(Math.abs(lv[0.5] - (lv[0] + lv[1]) / 2) < 1e-9);
  assert.equal(m.channel.a.i, m.major.points[2].i);
  assert.equal(m.channel.b.i, m.major.points[4].i);
  assert.ok(Math.abs(m.channel.off - (m.major.points[3].price - (m.channel.a.price + ((m.channel.b.price - m.channel.a.price) * (m.major.points[3].i - m.channel.a.i)) / (m.channel.b.i - m.channel.a.i)))) < 1e-9);
});

test('scenarios are a typed decision with paths into the future and bands from the same prices', () => {
  const b = impulse(), m = waveMap(b, { format: (v) => v.toFixed(1) });
  const sc = m.scenarios;
  assert.deepEqual(Object.keys(sc.decision.probabilities), ['primary', 'alternative']);
  assert.ok(Math.abs(sc.primary.p + sc.alternative.p - 1) < 0.002);
  assert.ok(sc.decision.coverage > 0 && sc.decision.coverage <= 1);
  // after five waves up: primary is a correction down into the retracement zone, alternative an extension up
  assert.equal(sc.primary.dir, -1);
  assert.equal(sc.alternative.dir, 1);
  assert.ok(sc.primary.band.hi < b.at(-1).c);
  assert.equal(sc.alternative.band.lo, m.major.points[5].price);
  for (const s of [sc.primary, sc.alternative]) {
    assert.equal(s.path[0].i, b.length - 1);
    assert.ok(s.path.at(-1).i > b.length - 1);
    assert.ok(s.lines.length >= 2);
  }
  assert.ok(m.zones.some((z) => z.kind === 'target'));
});

test('a sub-count that breaks the rules gets no labels', () => {
  const b = impulse(), m = waveMap(b);
  const [a, z] = [m.major.points[0], m.major.points[1]];
  // ask for three sub-waves in a leg that really has five: no threshold leaves exactly two valid inner points
  const sub = subdivide(b, a, z, false, 0.5, 3);
  assert.ok(sub === null || sub.points.length === 4);
  assert.equal(subdivide(b, a, { ...a, i: a.i + 3 }, true, 0.5, 3), null);
});

test('no valid count: fib of the last swing, a plain note and no scenario', () => {
  const bars = Array.from({ length: 120 }, (_, i) => {
    const c = 100 + 8 * Math.sin(i / 3) + (i % 7);
    return { d: new Date(Date.UTC(2024, 0, 1) + i * 864e5).toISOString().slice(0, 10), o: c - 0.5, h: c + 1, l: c - 1, c };
  });
  const m = waveMap(bars);
  if (!m.major) {
    assert.equal(m.scenarios, null);
    assert.ok(m.notes[0].includes('سناریو ساخته نمی‌شود'));
  } else assert.ok(m.major.valid);
  assert.equal(waveMap(bars.slice(0, 20)).enough, false);
});

test('resample: Saturday weeks and Jalali months keep open, high, low and close', () => {
  const b = impulse();
  const w = resample(b, 'W');
  assert.ok(w.length < b.length && w.length > 10);
  assert.equal(w[0].o, b[0].o);
  assert.equal(w.at(-1).c, b.at(-1).c);
  assert.equal(Math.max(...w.map((x) => x.h)), Math.max(...b.map((x) => x.h)));
  const mo = resample(b, 'M');
  assert.ok(mo.length >= 4 && mo.length <= 6);
  assert.equal(resample(b, 'D'), b);
});
