// spec 0010 — exact NURBS maths and the IGES writer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as N from '../public/js/nurbs.mjs';
import { openEdges, meshVolume } from '../public/js/photoscan.mjs';

test('the rational circle is exact (radius error < 1e-12)', () => {
  const c = N.circle(7, [1, 2, 0]);
  for (let i = 0; i <= 200; i++) {
    const [x, y] = N.curvePoint(c, i / 200);
    assert.ok(Math.abs(Math.hypot(x - 1, y - 2) - 7) < 1e-12);
  }
  assert.ok(Math.abs(N.curveLength(c, 4000) - 2 * Math.PI * 7) < 1e-4);
});

test('interpolation passes through every point; knot insertion keeps the shape', () => {
  const Q = [[0, 0, 0], [3, 4, 0], [7, 2, 1], [9, 6, 2], [12, 1, 0], [15, 5, 3]];
  const c = N.interpolate(Q, 3), t = N.chordParams(Q);
  Q.forEach((q, i) => assert.ok(Math.hypot(...N.curvePoint(c, t[i]).map((v, k) => v - q[k])) < 1e-9));
  const d = N.insertKnot(c, 0.37);
  assert.equal(d.P.length, c.P.length + 1);
  for (let i = 0; i <= 50; i++) assert.ok(Math.hypot(...N.curvePoint(c, i / 50).map((v, k) => v - N.curvePoint(d, i / 50)[k])) < 1e-9);
  const w = N.insertKnot(N.circle(3), 0.1);
  for (let i = 0; i <= 50; i++) assert.ok(Math.abs(Math.hypot(...N.curvePoint(w, i / 50).slice(0, 2)) - 3) < 1e-9);
});

test('rebuild keeps a smooth curve within 0.2 % of its size with fewer points', () => {
  const Q = Array.from({ length: 30 }, (_, i) => [i, 5 * Math.sin(i / 4), 0]);
  const c = N.interpolate(Q, 3), r = N.rebuild(c, 16, 3);
  assert.equal(r.P.length, 16);
  let err = 0;
  for (const p of N.sampleCurve(c, 100)) {
    let best = Infinity;
    for (const q of N.sampleCurve(r, 400)) best = Math.min(best, Math.hypot(p[0] - q[0], p[1] - q[1]));
    err = Math.max(err, best);
  }
  assert.ok(err < 0.06, String(err));
});

test('surfaces: interpolation is exact on the grid; edge surface keeps its edges; loft through circles', () => {
  const Q = Array.from({ length: 5 }, (_, i) => Array.from({ length: 6 }, (_, j) => [i * 2, j * 3, Math.sin(i) * Math.cos(j)]));
  const s = N.interpolateSurface(Q);
  // grid parameters are the averaged chord lengths: sample there
  const avg = (ls) => ls[0].map((_, k) => ls.reduce((a, l) => a + l[k], 0) / ls.length);
  const tu = avg(Q[0].map((_, j) => N.chordParams(Q.map((r) => r[j])))), tv = avg(Q.map((r) => N.chordParams(r)));
  for (let i = 0; i < 5; i++) for (let j = 0; j < 6; j++) assert.ok(Math.hypot(...N.surfacePoint(s, tu[i], tv[j]).map((v, k) => v - Q[i][j][k])) < 1e-9);
  const c0 = N.interpolate([[0, 0, 0], [5, 0, 1], [10, 0, 0]], 2), c1 = N.interpolate([[0, 10, 0], [5, 10, -1], [10, 10, 0]], 2);
  const d0 = N.interpolate([[0, 0, 0], [0, 5, 2], [0, 10, 0]], 2), d1 = N.interpolate([[10, 0, 0], [10, 5, 2], [10, 10, 0]], 2);
  const e = N.edgeSurface(c0, c1, d0, d1);
  for (let k = 0; k <= 10; k++) {
    const a = N.surfacePoint(e, k / 10, 0), b = N.curvePoint(c0, k / 10);
    assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 0.05, `${a} vs ${b}`);
  }
  const L = N.loft([N.circle(5), { ...N.circle(3), P: N.circle(3).P.map((p) => [p[0], p[1], 6]) }]);
  const mid = N.surfacePoint(L, 0.5, 0.3);
  assert.ok(Math.hypot(mid[0], mid[1]) > 3 && Math.hypot(mid[0], mid[1]) < 5);
});

test('thickened surface is a closed solid of area × thickness', () => {
  const s = N.srfPt([0, 0, 0], [10, 0, 0], [10, 10, 0], [0, 10, 0]);
  const m = N.thicken(s, 1, 10, 10);
  assert.equal(openEdges(m.index).naked, 0);
  assert.ok(Math.abs(meshVolume(m.position, m.index) - 100) < 1e-6); // outward winding
});

test('IGES: 80-column records and a lossless round trip of curves and surfaces', () => {
  const c = N.circle(4), s = N.interpolateSurface(Array.from({ length: 4 }, (_, i) => Array.from({ length: 4 }, (_, j) => [i, j, i * j * 0.1])));
  const txt = N.toIGES([{ curve: c }, { surface: s }]);
  for (const l of txt.trim().split('\n')) assert.equal(l.length, 80, l);
  const back = N.parseIGES(txt);
  assert.equal(back.length, 2);
  assert.deepEqual(back[0].curve.U, c.U);
  back[0].curve.P.forEach((p, i) => assert.ok(Math.hypot(...p.map((v, k) => v - c.P[i][k])) < 1e-9));
  assert.ok(Math.abs(back[0].curve.W[1] - Math.SQRT1_2) < 1e-12);
  assert.ok(Math.hypot(...N.surfacePoint(back[1].surface, 0.4, 0.7).map((v, k) => v - N.surfacePoint(s, 0.4, 0.7)[k])) < 1e-9);
});
