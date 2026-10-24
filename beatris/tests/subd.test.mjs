// spec 0010 — SubD: Catmull–Clark with creases, cages and face extrusion.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../public/js/subd.mjs';
import { openEdges, meshVolume } from '../public/js/photoscan.mjs';

test('one Catmull–Clark step: V + E + F points, all quads, closed', () => {
  const c = S.catmullClark(S.boxCage(10, 10, 10));
  assert.equal(c.v.length, 8 + 12 + 6);
  assert.equal(c.f.length, 24);
  assert.ok(c.f.every((f) => f.length === 4));
  const m = S.toTriangles(c);
  assert.equal(openEdges(m.index).naked, 0);
  assert.ok(meshVolume(m.position, m.index) > 0);
});

test('a smooth cube cage shrinks toward a rounded solid; fully creased it stays the cube', () => {
  const m = S.subdivide(S.boxCage(10, 10, 10), 3), v = meshVolume(m.position, m.index);
  assert.ok(v > 250 && v < 600, String(v)); // the cube limit is a rounded blob well inside the cage
  const cage = S.boxCage(10, 10, 10);
  const all = { ...cage, crease: [...new Set(cage.f.flatMap((f) => f.map((a, k) => (a < f[(k + 1) % 4] ? `${a}_${f[(k + 1) % 4]}` : `${f[(k + 1) % 4]}_${a}`))))] };
  const k = S.subdivide(all, 3);
  assert.ok(Math.abs(meshVolume(k.position, k.index) - 1000) < 1e-6);
});

test('torus cage and face extrusion stay closed; extrusion adds 4 sides per quad', () => {
  const t = S.subdivide(S.torusCage(9, 1.5), 3);
  assert.equal(openEdges(t.index).naked, 0);
  const vol = meshVolume(t.position, t.index), truth = 2 * Math.PI ** 2 * 9 * 1.5 ** 2;
  assert.ok(vol > truth * 0.85 && vol < truth * 1.15, `${vol} vs ${truth}`);
  const b = S.boxCage(10, 10, 10), e = S.extrudeFace(b, 1, 5);
  assert.equal(e.f.length, 6 + 4);
  const m = S.toTriangles(e);
  assert.equal(openEdges(m.index).naked, 0);
  assert.ok(Math.abs(meshVolume(m.position, m.index) - 1500) < 1e-6);
  const cy = S.subdivide(S.cylinderCage(5, 10, 8), 2);
  assert.equal(openEdges(cy.index).naked, 0);
});
