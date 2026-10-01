// Studio parts of spec 0010: «nsurf» (a NURBS surface thickened into a solid) and «subd» (a SubD cage shown at
// its smooth limit). Data in opts are JSON strings, untrusted like any project file: sizes are checked.
import { T } from './stage.mjs';
import { PIECES } from './jewelcad.mjs';
import * as N from '../nurbs.mjs';
import * as Sd from '../subd.mjs';

const finiteDeep = (a) => (Array.isArray(a) ? a.every(finiteDeep) : Number.isFinite(a));
/** Validate a NURBS surface object from a project file. */
export function checkSurface(s) {
  if (!s || !Number.isInteger(s.p) || !Number.isInteger(s.q) || s.p < 1 || s.q < 1 || s.p > 7 || s.q > 7) return false;
  const n = s.P?.length, m = s.P?.[0]?.length;
  if (!(n > s.p && m > s.q && n <= 200 && m <= 200)) return false;
  if (s.U?.length !== n + s.p + 1 || s.V?.length !== m + s.q + 1) return false;
  for (const K of [s.U, s.V]) for (let i = 1; i < K.length; i++) if (!(K[i] >= K[i - 1])) return false;
  if (!s.P.every((r) => r.length === m && r.every((p) => p.length === 3)) || !finiteDeep(s.P) || !finiteDeep(s.U) || !finiteDeep(s.V)) return false;
  return !s.W || (s.W.length === n && s.W.every((r) => r.length === m && r.every((w) => w > 0)));
}
export function checkCage(c) {
  if (!c || !Array.isArray(c.v) || !Array.isArray(c.f) || c.v.length > 20000 || c.f.length > 20000) return false;
  if (!c.v.every((p) => p.length === 3 && p.every(Number.isFinite))) return false;
  return c.f.every((f) => Array.isArray(f) && f.length >= 3 && f.length <= 64 && f.every((i) => Number.isInteger(i) && i >= 0 && i < c.v.length));
}
const meshOf = (position, index, role = 'metal', smooth = true) => {
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.BufferAttribute(position, 3));
  g.setIndex(new T.BufferAttribute(index, 1));
  if (smooth) g.computeVertexNormals();
  const m = new T.Mesh(g, new T.MeshStandardMaterial());
  m.castShadow = m.receiveShadow = true;
  m.userData.role = role;
  return m;
};

PIECES.nsurf = {
  label: 'سطح NURBS',
  params: {},
  opts: { srf: '', name: '' },
  free: true,
  build: (p) => {
    const d = JSON.parse(p.srf || 'null');
    if (!d || !checkSurface(d.s)) throw new Error('surface');
    const t = Math.min(30, Math.max(0.05, Number(d.t) || 0.8));
    const res = Math.min(96, Math.max(8, Number(d.res) || 48));
    const m = N.thicken(d.s, t, res, res);
    const mesh = meshOf(m.position, m.index);
    mesh.userData.nurbs = d.s;
    return [mesh];
  },
};
PIECES.subd = {
  label: 'SubD',
  params: {},
  opts: { cage: '', name: '' },
  free: true,
  build: (p) => {
    const d = JSON.parse(p.cage || 'null');
    if (!d || !checkCage(d)) throw new Error('cage');
    let levels = Math.min(4, Math.max(1, Number(d.levels) || 3));
    while (levels > 1 && d.f.length * 4 ** levels > 300000) levels--; // keep the limit mesh in budget
    const m = Sd.subdivide(d, levels);
    const mesh = meshOf(m.position, m.index);
    mesh.userData.cage = d;
    return [mesh];
  },
};
