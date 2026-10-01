// spec 0010 — rolling-ball fillets and offsets on distance fields.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as V from '../public/js/voxel.mjs';
import { openEdges, meshVolume } from '../public/js/photoscan.mjs';

/** Closed cube of side a centred at the origin (outward winding). */
function cube(a) {
  const h = a / 2, P = [], I = [];
  const v = [[-h, -h, -h], [h, -h, -h], [h, h, -h], [-h, h, -h], [-h, -h, h], [h, -h, h], [h, h, h], [-h, h, h]];
  v.forEach((p) => P.push(...p));
  for (const [a0, b, c, d] of [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [2, 3, 7, 6], [1, 2, 6, 5], [0, 4, 7, 3]]) I.push(a0, b, c, a0, c, d);
  return { position: new Float32Array(P), index: new Uint32Array(I) };
}

test('voxelising a cube keeps its volume (< 1 %)', () => {
  const c = cube(10);
  assert.equal(meshVolume(c.position, c.index), 1000);
  const g = V.voxelize(c.position, c.index, { min: [-6, -6, -6], max: [6, 6, 6] }, 120);
  let n = 0;
  for (const o of g.occ) n += o;
  assert.ok(Math.abs((n * g.vox ** 3) / 1000 - 1) < 0.01, String(n * g.vox ** 3));
});

test('fillet r = 2 on a 10 mm cube gives the rounded box volume (< 2 % at 160 cells), closed', () => {
  const c = cube(10), r = 2, a = 10;
  const m = V.remeshDistance(c.position, c.index, 'fillet', r, 160);
  assert.equal(openEdges(m.index).naked, 0);
  const truth = (a - 2 * r) ** 3 + 6 * (a - 2 * r) ** 2 * r + 3 * Math.PI * r * r * (a - 2 * r) + (4 / 3) * Math.PI * r ** 3;
  const v = meshVolume(m.position, m.index);
  assert.ok(Math.abs(v / truth - 1) < 0.02, `${v} vs ${truth}`);
});

test('offset +1 mm of a 10 mm cube: Minkowski volume (< 3 %, half a cell on the faces); closing leaves a convex cube unchanged', () => {
  const c = cube(10);
  const m = V.remeshDistance(c.position, c.index, 'offset', 1, 120);
  const truth = 1000 + 600 + 3 * Math.PI * 10 + (4 / 3) * Math.PI;
  const v = meshVolume(m.position, m.index);
  assert.ok(Math.abs(v / truth - 1) < 0.03, `${v} vs ${truth}`);
  const k = V.remeshDistance(c.position, c.index, 'filletInner', 1.5, 100);
  assert.ok(Math.abs(meshVolume(k.position, k.index) / 1000 - 1) < 0.03);
});
