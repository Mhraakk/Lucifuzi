// Parametric jewellery generators (millimetres, Y up, rings stand upright with axis along Z).
// Every generator returns a THREE.Group whose meshes carry userData.role = 'metal' | 'gem' | 'enamel'.
// Metal parts are closed solids, so their signed volume gives the physical weight.
import { T } from './stage.mjs';
import { textShapes, heightField } from './text.mjs';

const TAU = Math.PI * 2;
const V3 = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/* ================================================================== geometry utils */

export function signedVolume(geo) {
  const p = geo.attributes.position.array;
  const idx = geo.index?.array;
  const n = idx ? idx.length : p.length / 3;
  let v = 0;
  for (let i = 0; i < n; i += 3) {
    const a = (idx ? idx[i] : i) * 3, b = (idx ? idx[i + 1] : i + 1) * 3, c = (idx ? idx[i + 2] : i + 2) * 3;
    v += p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) - p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c]) + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c]);
  }
  return v / 6;
}
export function surfaceArea(geo) {
  const p = geo.attributes.position.array;
  const idx = geo.index?.array;
  const n = idx ? idx.length : p.length / 3;
  let s = 0;
  const A = V3(), B = V3(), C = V3();
  for (let i = 0; i < n; i += 3) {
    A.fromArray(p, (idx ? idx[i] : i) * 3);
    B.fromArray(p, (idx ? idx[i + 1] : i + 1) * 3);
    C.fromArray(p, (idx ? idx[i + 2] : i + 2) * 3);
    s += B.sub(A).cross(C.sub(A)).length() / 2;
  }
  return s;
}
/** Make triangles face outward (positive volume). */
function orient(geo) {
  if (signedVolume(geo) < 0) {
    if (geo.index) {
      const a = geo.index.array;
      for (let i = 0; i < a.length; i += 3) [a[i + 1], a[i + 2]] = [a[i + 2], a[i + 1]];
      geo.index.needsUpdate = true;
    } else {
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i += 3) {
        for (let k = 0; k < 3; k++) {
          const t = p.array[(i + 1) * 3 + k];
          p.array[(i + 1) * 3 + k] = p.array[(i + 2) * 3 + k];
          p.array[(i + 2) * 3 + k] = t;
        }
      }
      p.needsUpdate = true;
    }
  }
  return geo;
}
/** Average normals of coincident vertices in [from,to) (seams of swept surfaces). */
function weldNormals(geo, from = 0, to = geo.attributes.position.count) {
  const p = geo.attributes.position.array, n = geo.attributes.normal.array;
  const map = new Map();
  const key = (i) => `${Math.round(p[i * 3] * 1e4)},${Math.round(p[i * 3 + 1] * 1e4)},${Math.round(p[i * 3 + 2] * 1e4)}`;
  for (let i = from; i < to; i++) {
    const k = key(i);
    const e = map.get(k);
    if (e) e.push(i);
    else map.set(k, [i]);
  }
  for (const list of map.values()) {
    if (list.length < 2) continue;
    let x = 0, y = 0, z = 0;
    for (const i of list) (x += n[i * 3]), (y += n[i * 3 + 1]), (z += n[i * 3 + 2]);
    const l = Math.hypot(x, y, z) || 1;
    for (const i of list) (n[i * 3] = x / l), (n[i * 3 + 1] = y / l), (n[i * 3 + 2] = z / l);
  }
  geo.attributes.normal.needsUpdate = true;
}
function build(pos, uv, idx) {
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  if (uv) g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/**
 * Sweep a closed 2-D profile [u (along n), v (along b)] along a path of frames {p, n, b}.
 * profileAt(t) may vary along the path (tapers). Open paths get flat caps.
 */
function sweep(frames, profileAt, { closed = true, uScale = 6 } = {}) {
  const N = frames.length;
  const prof0 = profileAt(0);
  const M = prof0.length;
  const rows = closed ? N + 1 : N;
  const pos = [], uv = [], idx = [];
  let s = 0;
  for (let i = 0; i < rows; i++) {
    const f = frames[i % N];
    if (i > 0) s += f.p.distanceTo(frames[(i - 1) % N].p);
    const prof = profileAt(closed ? (i % N) / N : i / (N - 1));
    for (let j = 0; j <= M; j++) {
      const [u, v] = prof[j % M];
      pos.push(f.p.x + f.n.x * u + f.b.x * v, f.p.y + f.n.y * u + f.b.y * v, f.p.z + f.n.z * u + f.b.z * v);
      uv.push(s / uScale, j / M);
    }
  }
  const C = M + 1;
  for (let i = 0; i < rows - 1; i++)
    for (let j = 0; j < M; j++) {
      const a = i * C + j, b = i * C + j + 1, c = (i + 1) * C + j + 1, d = (i + 1) * C + j;
      idx.push(a, b, d, b, c, d);
    }
  const sideCount = pos.length / 3;
  if (!closed) {
    const endCap = (row, t, flip) => {
      const prof = profileAt(t);
      const tris = T.ShapeUtils.triangulateShape(prof.map(([u, v]) => new T.Vector2(u, v)), []);
      const f = frames[row];
      const base = pos.length / 3;
      for (const [u, v] of prof) {
        pos.push(f.p.x + f.n.x * u + f.b.x * v, f.p.y + f.n.y * u + f.b.y * v, f.p.z + f.n.z * u + f.b.z * v);
        uv.push(u / uScale, v / uScale);
      }
      for (const [a, b, c] of tris) flip ? idx.push(base + a, base + c, base + b) : idx.push(base + a, base + b, base + c);
    };
    // decide cap winding from the side wall orientation
    const probe = build(pos.slice(), null, idx.slice());
    const sideSign = Math.sign(signedVolume(probe)) || 1;
    endCap(0, 0, sideSign > 0);
    endCap(N - 1, 1, sideSign < 0);
  }
  const g = orient(build(pos, uv, idx));
  g.computeVertexNormals();
  weldNormals(g, 0, sideCount);
  return g;
}

/** Frames on a circle of radius R in the XY plane (ring axis = Z). */
function circleFrames(R, a0 = 0, a1 = TAU, n = 192) {
  const closed = Math.abs(a1 - a0 - TAU) < 1e-6;
  const count = closed ? n : n + 1;
  const out = [];
  for (let i = 0; i < count; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    const c = Math.cos(a), s = Math.sin(a);
    out.push({ p: V3(R * c, R * s, 0), n: V3(c, s, 0), b: V3(0, 0, 1), a });
  }
  return out;
}

/** Frames on a closed 2-D outline lying in the XZ plane at height y (for bezels, halos). */
function outlineFrames(pts2, y) {
  const n = pts2.length;
  return pts2.map((p, i) => {
    const a = pts2[(i - 1 + n) % n], b = pts2[(i + 1) % n];
    const tx = b.x - a.x, tz = b.y - a.y;
    const l = Math.hypot(tx, tz) || 1;
    // outward normal for a CCW outline in (x,z)
    return { p: V3(p.x, y, p.y), n: V3(tz / l, 0, -tx / l), b: V3(0, 1, 0) };
  });
}

/* ================================================================== profiles */

export const PROFILES = [
  ['comfort', 'راحت'],
  ['court', 'گنبدی'],
  ['flat', 'تخت'],
  ['knife', 'تیغه‌ای'],
  ['concave', 'کاو'],
  ['bevel', 'پخ‌دار'],
  ['round', 'مفتولی'],
  ['square', 'چهارگوش'],
];

/** Closed profile, CCW in (u = radial outward from inner surface, v = axial). */
export function profile(kind, w, t, n = 28) {
  const hw = w / 2;
  const pts = [];
  if (kind === 'round') {
    for (let i = 0; i < n * 2; i++) {
      const a = (i / (n * 2)) * TAU;
      pts.push([t / 2 + (t / 2) * Math.cos(a), hw * Math.sin(a)]);
    }
    return pts;
  }
  if (kind === 'square' || kind === 'bevel' || kind === 'flat') {
    const r = kind === 'square' ? Math.min(w, t) * 0.08 : kind === 'bevel' ? Math.min(w, t) * 0.32 : Math.min(w, t) * 0.18;
    const rect = [[0, -hw], [t, -hw], [t, hw], [0, hw]];
    const corners = kind === 'bevel' ? [false, true, true, false] : [true, true, true, true];
    for (let k = 0; k < 4; k++) {
      const [x, y] = rect[k];
      const [px, py] = rect[(k + 3) % 4], [nx, ny] = rect[(k + 1) % 4];
      const d1 = [Math.sign(px - x), Math.sign(py - y)], d2 = [Math.sign(nx - x), Math.sign(ny - y)];
      const rr = corners[k] ? r : Math.min(w, t) * 0.04;
      if (kind === 'bevel' && corners[k]) {
        pts.push([x + d1[0] * rr, y + d1[1] * rr], [x + d2[0] * rr, y + d2[1] * rr]);
      } else {
        const cx = x + (d1[0] + d2[0]) * rr, cy = y + (d1[1] + d2[1]) * rr;
        const a0 = Math.atan2(y + d1[1] * rr - cy, x + d1[0] * rr - cx);
        let a1 = Math.atan2(y + d2[1] * rr - cy, x + d2[0] * rr - cx);
        while (a1 < a0) a1 += TAU;
        if (a1 - a0 > Math.PI) a1 -= TAU;
        for (let s = 0; s <= 5; s++) {
          const a = a0 + ((a1 - a0) * s) / 5;
          pts.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]);
        }
      }
    }
    return pts;
  }
  // curved families: outer(u) / inner(u), u ∈ [-1, 1] across the width
  const edge = (u) => {
    const a = Math.abs(u);
    return a > 0.82 ? ((a - 0.82) / 0.18) ** 2 : 0;
  };
  const dome = (u) => Math.sqrt(Math.max(0, 1 - u * u));
  const outer = (u) => {
    const base = kind === 'knife' ? 0.5 + 0.5 * (1 - Math.abs(u)) ** 0.8 : kind === 'concave' ? 0.78 + 0.22 * u * u : 0.52 + 0.48 * dome(u);
    return t * base - t * 0.2 * edge(u);
  };
  const inner = (u) => (kind === 'comfort' ? t * 0.18 * (1 - dome(u)) : 0) + t * 0.1 * edge(u);
  for (let i = 0; i <= n; i++) {
    const u = -Math.cos((Math.PI * i) / n);
    pts.push([outer(u), u * hw]);
  }
  for (let i = 1; i < n; i++) {
    const u = Math.cos((Math.PI * i) / n);
    pts.push([inner(u), u * hw]);
  }
  return pts;
}

/* ================================================================== gems */

export const CUTS = [
  ['round', 'برلیان گرد'],
  ['oval', 'بیضی'],
  ['pear', 'اشکی'],
  ['marquise', 'مارکیز'],
  ['cushion', 'کوسن'],
  ['princess', 'پرنسس'],
  ['emerald', 'زمردی (پله‌ای)'],
  ['heart', 'قلب'],
];

/** Outline radius function r(θ) for a unit-width stone, and its length/width ratio. */
function outlineFn(cut, ratio) {
  switch (cut) {
    case 'oval': return { r: (a) => 1 / Math.hypot(Math.cos(a) / ratio, Math.sin(a)), k: ratio };
    case 'cushion': return { r: (a) => 1 / ((Math.abs(Math.cos(a) / ratio) ** 4 + Math.abs(Math.sin(a)) ** 4) ** 0.25), k: ratio };
    case 'princess': return { r: (a) => 1 / ((Math.abs(Math.cos(a)) ** 14 + Math.abs(Math.sin(a)) ** 14) ** (1 / 14)), k: 1 };
    case 'marquise': {
      // lens: intersection of two circles, length/width = ratio
      const L = ratio, c = (L * L - 1) / 2, rho = c + 1;
      return { r: (a) => lensR(a, c, rho), k: ratio };
    }
    case 'pear': {
      const L = ratio * 2 - 1, c = (L * L - 1) / 2, rho = c + 1;
      return { r: (a) => (Math.cos(a) >= 0 ? lensR(a, c, rho) : 1), k: ratio, shift: (ratio * 2 - 1 - 1) / 2 };
    }
    case 'heart': {
      return { r: (a) => heartR(a), k: 1 };
    }
    default: return { r: () => 1, k: 1 };
  }
}
function lensR(a, c, rho) {
  // ray from origin; circles centred at (0, ±c) radius rho; inside both → nearest exit
  const dx = Math.cos(a), dy = Math.sin(a);
  let best = Infinity;
  for (const cy of [-c, c]) {
    const b = -dy * cy, q = cy * cy - rho * rho;
    const disc = b * b - q;
    if (disc >= 0) best = Math.min(best, -b + Math.sqrt(disc));
  }
  return best;
}
let heartTable = null;
function heartR(a) {
  // classic parametric heart, tabulated to a polar radius r(θ); width normalised to 2
  if (!heartTable) {
    const pts = [];
    for (let i = 0; i < 2048; i++) {
      const t = (i / 2048) * TAU;
      const x = 16 * Math.sin(t) ** 3;
      const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t) + 2.5;
      // stone space: point of the heart along −x
      pts.push([Math.atan2(x, y), Math.hypot(x, y) / 16]);
    }
    heartTable = new Float32Array(360);
    for (let d = 0; d < 360; d++) {
      const target = (d / 360) * TAU - Math.PI;
      let best = 0, bd = Infinity;
      for (const [ang, r] of pts) {
        const diff = Math.abs(Math.atan2(Math.sin(ang - target), Math.cos(ang - target)));
        if (diff < bd) (bd = diff), (best = r);
      }
      heartTable[d] = best;
    }
  }
  const d = Math.round((((a + Math.PI) / TAU) * 360) % 360 + 360) % 360;
  return heartTable[d];
}

/**
 * Round-brilliant facet layout, optionally warped to a fancy outline.
 * Returns non-indexed geometry with table up (+Y), girdle centred at y=0.
 */
function brilliantGeo(size, cut = 'round', ratio = 1.4) {
  const R = 1;
  const tableR = 0.57, crownH = 0.31, girdleT = 0.03, pavH = 0.86;
  const P = (r, a, z) => [r * Math.cos(a), r * Math.sin(a), z];
  const zTop = girdleT / 2 + crownH;
  const t = [], m = [], gt = [], gb = [], p = [];
  const G = 32;
  for (let i = 0; i < 8; i++) {
    t.push(P(tableR, (i * Math.PI) / 4, zTop));
    m.push(P(R * 0.8, (i * Math.PI) / 4 + Math.PI / 8, girdleT / 2 + crownH * 0.52));
    p.push(P(R * 0.52, (i * Math.PI) / 4, -girdleT / 2 - pavH * 0.52));
  }
  for (let k = 0; k < G; k++) {
    gt.push(P(R, (k * TAU) / G, girdleT / 2));
    gb.push(P(R, (k * TAU) / G, -girdleT / 2));
  }
  const culet = [0, 0, -girdleT / 2 - pavH];
  const tc = [0, 0, zTop];
  const tris = [];
  const TR = (a, b, c) => tris.push([a, b, c]);
  const q = G / 8;
  for (let i = 0; i < 8; i++) {
    const i1 = (i + 1) % 8, g0 = i * q, gm = g0 + q / 2, g1 = (g0 + q) % G;
    TR(tc, t[i], t[i1]);
    TR(t[i], m[i], t[i1]);
    for (let k = g0; k < gm; k++) TR(m[i], gt[k], gt[(k + 1) % G]);
    for (let k = gm; k < g0 + q; k++) TR(m[i], gt[k % G], gt[(k + 1) % G]);
    TR(t[i], gt[g0], m[i]);
    TR(t[i], m[(i + 7) % 8], gt[g0]);
    for (let k = g0; k < g0 + q; k++) TR(p[k < gm ? i : i1], gb[(k + 1) % G], gb[k]);
    TR(p[i], p[i1], gb[gm]);
    TR(culet, p[i1], p[i]);
  }
  for (let k = 0; k < G; k++) {
    const k1 = (k + 1) % G;
    TR(gt[k], gb[k], gb[k1]);
    TR(gt[k], gb[k1], gt[k1]);
  }
  const of = outlineFn(cut, ratio);
  const warp = ([x, y, z]) => {
    const a = Math.atan2(y, x);
    const r = Math.hypot(x, y) * of.r(a);
    return [r * Math.cos(a), r * Math.sin(a), z];
  };
  const pos = [];
  for (const tri of tris) for (const v of tri) pos.push(...warp(v));
  // scale: width = size (mm), stone space z → Y
  const g = new T.BufferGeometry();
  const arr = new Float32Array(pos);
  for (let i = 0; i < arr.length; i += 3) {
    const x = arr[i], y = arr[i + 1], z = arr[i + 2];
    arr[i] = (x * size) / 2;
    arr[i + 1] = (z * size) / 2;
    arr[i + 2] = (-y * size) / 2;
  }
  g.setAttribute('position', new T.BufferAttribute(arr, 3));
  orient(g);
  g.computeVertexNormals();
  return { geo: g, top: (zTop * size) / 2, bottom: (culet[2] * size) / 2, outline: (a) => (of.r(a) * size) / 2 };
}

/** Step (emerald) cut: octagonal rectangle with 3 crown and 3 pavilion steps. */
function emeraldGeo(size, ratio = 1.4) {
  const W = size / 2, L = (size * ratio) / 2, cc = 0.26;
  const octa = (sx, sy, z) => {
    const c = Math.min(sx, sy) * cc * 2;
    const pts = [[sx, sy - c], [sx - c, sy], [-sx + c, sy], [-sx, sy - c], [-sx, -sy + c], [-sx + c, -sy], [sx - c, -sy], [sx, -sy + c]];
    return pts.map(([x, y]) => [x, y, z]);
  };
  const rings = [
    octa(L * 0.62, W * 0.52, 0.3 * W), // table
    octa(L * 0.76, W * 0.7, 0.22 * W),
    octa(L * 0.89, W * 0.85, 0.12 * W),
    octa(L, W, 0.03 * W),
    octa(L, W, -0.03 * W),
    octa(L * 0.78, W * 0.72, -0.4 * W),
    octa(L * 0.52, W * 0.42, -0.75 * W),
    octa(L * 0.3, W * 0.04, -1.05 * W), // keel
  ];
  const tris = [];
  for (let r = 0; r < rings.length - 1; r++)
    for (let i = 0; i < 8; i++) {
      const a = rings[r][i], b = rings[r][(i + 1) % 8], c = rings[r + 1][(i + 1) % 8], d = rings[r + 1][i];
      tris.push([a, d, b], [b, d, c]);
    }
  const top = rings[0];
  for (let i = 1; i < 7; i++) tris.push([top[0], top[i + 1], top[i]]);
  const bot = rings[rings.length - 1];
  for (let i = 1; i < 7; i++) tris.push([bot[0], bot[i], bot[i + 1]]);
  const pos = [];
  for (const tri of tris) for (const [x, y, z] of tri) pos.push(x, z, -y);
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  orient(g);
  g.computeVertexNormals();
  const of = outlineFn('cushion', ratio);
  return { geo: g, top: 0.3 * W, bottom: -1.05 * W, outline: (a) => (of.r(a) * size) / 2 };
}

export function gemGeo(cut, size, ratio) {
  const r = cut === 'emerald' ? emeraldGeo(size, ratio ?? 1.4) : brilliantGeo(size, cut, ratio ?? (cut === 'marquise' ? 2 : cut === 'pear' ? 1.5 : cut === 'oval' ? 1.35 : 1.1));
  return r;
}

/** Sample a stone outline (at girdle, in XZ) as CCW Vector2 list, offset outward by d. */
function outlinePts(outline, d = 0, n = 96) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const r = outline(a) + d;
    pts.push(new T.Vector2(r * Math.cos(a), -r * Math.sin(a)));
  }
  // ensure CCW in (x, z)
  let s = 0;
  for (let i = 0; i < n; i++) s += pts[i].x * pts[(i + 1) % n].y - pts[(i + 1) % n].x * pts[i].y;
  return s < 0 ? pts.reverse() : pts;
}

/* ================================================================== meshes */

function M(geo, role, extra = {}) {
  const m = new T.Mesh(geo, undefined);
  m.userData = { role, ...extra };
  m.castShadow = true;
  m.receiveShadow = role !== 'gem';
  return m;
}
function tubeAlong(points, r, closed = false, seg = 48, radial = 14) {
  const curve = new T.CatmullRomCurve3(points, closed, 'centripetal');
  const g = new T.TubeGeometry(curve, seg, r, radial, closed);
  return g;
}
function sphere(r, p) {
  const g = new T.SphereGeometry(r, 24, 16);
  g.translate(p.x, p.y, p.z);
  return g;
}
function merge(geos) {
  const clean = geos.map((g) => {
    const x = g.index ? g : g;
    if (!x.attributes.uv) x.setAttribute('uv', new T.Float32BufferAttribute(new Float32Array(x.attributes.position.count * 2), 2));
    for (const k of Object.keys(x.attributes)) if (!['position', 'normal', 'uv'].includes(k)) x.deleteAttribute(k);
    return x.index ? x : x.toNonIndexed();
  });
  const anyIndexed = clean.some((g) => g.index);
  const list = anyIndexed ? clean.map((g) => (g.index ? g : indexify(g))) : clean;
  return T.BufferGeometryUtils.mergeGeometries(list, false);
}
function indexify(g) {
  const n = g.attributes.position.count;
  g.setIndex([...Array(n).keys()]);
  return g;
}

/** Prong basket / bezel head for a stone whose girdle sits at y = yg (table up). */
function head(stone, { yg, baseY, setting = 'prong4', prongR = 0.55, stoneSize }) {
  const geos = [];
  const pav = yg + stone.bottom; // culet y
  const crownTop = yg + stone.top;
  if (setting === 'bezel') {
    const wall = Math.max(0.5, stoneSize * 0.09);
    const out = outlinePts(stone.outline, wall * 0.5 - 0.05);
    const frames = outlineFrames(out, 0);
    const y0 = baseY, y1 = crownTop - (crownTop - yg) * 0.45;
    const prof = [[-wall / 2, y0], [wall / 2, y0], [wall / 2, y1 - wall * 0.3], [wall * 0.1, y1], [-wall / 2, y1 - wall * 0.1]];
    geos.push(sweep(frames, () => prof, { closed: true }));
    return geos;
  }
  const N = setting === 'prong6' ? 6 : 4;
  for (let k = 0; k < N; k++) {
    const a = ((k + 0.5) / N) * TAU;
    const R = stone.outline(a);
    const dir = (r, y) => V3(r * Math.cos(a), y, -r * Math.sin(a));
    const pts = [dir(Math.min(R * 0.45, 1.6), baseY - 0.3), dir(R * 0.55, (pav + baseY) / 2), dir(R * 0.92 + prongR * 0.4, yg - (yg - pav) * 0.25), dir(R + prongR * 0.45, yg + 0.05), dir(R * 0.96, yg + (crownTop - yg) * 0.55)];
    geos.push(tubeAlong(pts, prongR, false, 40, 12));
    geos.push(sphere(prongR * 1.12, pts[pts.length - 1]));
    geos.push(sphere(prongR * 1.02, pts[0]));
  }
  // gallery rails
  const rail = (ry, scale) => {
    const out = outlinePts((a) => stone.outline(a) * scale, 0);
    const r = Math.max(0.35, prongR * 0.6);
    const frames = outlineFrames(out, ry);
    const prof = [];
    for (let i = 0; i < 12; i++) prof.push([r * Math.cos((i / 12) * TAU), r * Math.sin((i / 12) * TAU)]);
    geos.push(sweep(frames, () => prof, { closed: true }));
  };
  rail(yg - (yg - pav) * 0.28, 0.86);
  if (stoneSize > 5) rail(pav + (yg - pav) * 0.2, 0.5);
  return geos;
}

/* ================================================================== pieces */

const ringR = (size) => size / (2 * Math.PI); // ISO size = inner circumference (mm)
const taperFn = (a, k) => k ** (0.5 * (1 + Math.sin(a)) ** 1.6); // 1 at the bottom → k at the top

function shank({ size, width, thickness, prof = 'comfort', taperW = 1, taperT = 1, a0, a1 }) {
  const R = ringR(size);
  const frames = circleFrames(R, a0 ?? -Math.PI / 2, a1 ?? (a0 ?? -Math.PI / 2) + TAU, 256);
  return sweep(frames, (t) => {
    const a = (a0 ?? -Math.PI / 2) + t * ((a1 ?? (a0 ?? -Math.PI / 2) + TAU) - (a0 ?? -Math.PI / 2));
    return profile(prof, width * taperFn(a, taperW), thickness * taperFn(a, taperT));
  }, { closed: a1 === undefined });
}

export const PIECES = {
  band: {
    label: 'حلقه',
    params: { size: [54, 40, 75, 0.5, 'سایز (محیط mm)'], width: [4, 1.5, 14, 0.1, 'پهنا'], thickness: [1.8, 0.8, 4, 0.05, 'ضخامت'] },
    opts: { profile: 'comfort' },
    build: (p) => [M(shank({ size: p.size, width: p.width, thickness: p.thickness, prof: p.profile }), 'metal')],
  },
  solitaire: {
    label: 'تک‌نگین',
    params: { size: [54, 40, 75, 0.5, 'سایز (محیط mm)'], width: [2.2, 1.4, 5, 0.05, 'پهنای رکاب'], thickness: [1.6, 1, 3, 0.05, 'ضخامت رکاب'], taper: [0.8, 0.5, 1.6, 0.05, 'باریک‌شدن به بالا'], stone: [6.5, 3, 12, 0.1, 'قطر سنگ'], prong: [0.55, 0.35, 1, 0.01, 'قطر پنجه'] },
    opts: { profile: 'court', cut: 'round', setting: 'prong4', gem: 'diamond' },
    build: (p) => {
      const R = ringR(p.size);
      const top = R + p.thickness * p.taper;
      const st = gemGeo(p.cut, p.stone);
      const yg = top - st.bottom + 0.35;
      const metal = [shank({ size: p.size, width: p.width, thickness: p.thickness, prof: p.profile, taperW: p.taper, taperT: p.taper }), ...head(st, { yg, baseY: top - 0.2, setting: p.setting, prongR: p.prong, stoneSize: p.stone })];
      const gem = st.geo.clone().translate(0, yg, 0);
      return [M(merge(metal), 'metal'), M(gem, 'gem', { stone: p.cut, size: p.stone })];
    },
  },
  halo: {
    label: 'هاله (هالو)',
    params: { size: [54, 40, 75, 0.5, 'سایز (محیط mm)'], width: [2, 1.4, 4, 0.05, 'پهنای رکاب'], thickness: [1.6, 1, 3, 0.05, 'ضخامت رکاب'], stone: [6, 3, 11, 0.1, 'سنگ مرکزی'], melee: [1.3, 0.8, 2.5, 0.05, 'سنگ ریز'], gap: [0.35, 0, 1.5, 0.05, 'فاصله هاله'] },
    opts: { profile: 'court', cut: 'round', gem: 'diamond', gem2: 'diamond' },
    build: (p) => {
      const R = ringR(p.size);
      const top = R + p.thickness * 0.85;
      const st = gemGeo(p.cut, p.stone);
      const yg = top - st.bottom + 0.35;
      const metal = [shank({ size: p.size, width: p.width, thickness: p.thickness, prof: p.profile, taperT: 0.85 }), ...head(st, { yg, baseY: top - 0.2, prongR: 0.5, stoneSize: p.stone })];
      const mel = gemGeo('round', p.melee);
      const off = p.gap + p.melee / 2 + 0.15;
      const path = outlinePts(st.outline, off, 256);
      let per = 0;
      for (let i = 0; i < path.length; i++) per += path[i].distanceTo(path[(i + 1) % path.length]);
      const count = Math.max(8, Math.floor(per / (p.melee + 0.22)));
      const yh = yg - 0.35;
      // halo frame (under the melee)
      const fw = p.melee * 1.05, fh = p.melee * 0.75;
      metal.push(sweep(outlineFrames(path, yh + mel.bottom * 0.4), () => [[-fw / 2, -fh], [fw / 2, -fh], [fw / 2, 0], [-fw / 2, 0]], { closed: true }));
      const gems = [];
      // place melee evenly by arc length, beads between them
      const cum = [0];
      for (let i = 1; i <= path.length; i++) cum.push(cum[i - 1] + path[i % path.length].distanceTo(path[i - 1]));
      const at = (s) => {
        s = ((s % per) + per) % per;
        let i = cum.findIndex((c) => c > s) - 1;
        if (i < 0) i = 0;
        const t = (s - cum[i]) / (cum[i + 1] - cum[i] || 1);
        return path[i].clone().lerp(path[(i + 1) % path.length], t);
      };
      for (let k = 0; k < count; k++) {
        const c = at((k / count) * per);
        gems.push(mel.geo.clone().translate(c.x, yh, c.y));
        const b = at(((k + 0.5) / count) * per);
        const dir = new T.Vector2(b.x, b.y).normalize();
        for (const s of [-1, 1]) metal.push(sphere(p.melee * 0.2, V3(b.x + dir.x * s * p.melee * 0.33, yh + mel.top * 0.6, b.y + dir.y * s * p.melee * 0.33)));
      }
      return [M(merge(metal), 'metal'), M(st.geo.clone().translate(0, yg, 0), 'gem', { stone: p.cut, size: p.stone }), M(merge(gems), 'gem', { stone: 'round', size: p.melee, count, slot: 'gem2' })];
    },
  },
  eternity: {
    label: 'رکاب نگین‌دار (اترنیتی)',
    params: { size: [54, 40, 75, 0.5, 'سایز (محیط mm)'], width: [3, 2, 6, 0.1, 'پهنا'], thickness: [2.2, 1.5, 4, 0.05, 'ضخامت'], stone: [2.2, 1, 4, 0.05, 'قطر سنگ'], cover: [180, 60, 360, 10, 'پوشش (درجه)'] },
    opts: { profile: 'flat', style: 'prong', gem: 'diamond' },
    build: (p) => {
      const R = ringR(p.size);
      const Ro = R + p.thickness;
      const metal = [shank({ size: p.size, width: p.width, thickness: p.thickness, prof: p.profile })];
      const st = gemGeo('round', p.stone);
      const span = (Math.min(p.cover, 360) * Math.PI) / 180;
      const pitch = (p.stone + 0.2) / Ro;
      const count = Math.max(1, Math.floor((span - (p.cover >= 360 ? 0 : pitch * 0.5)) / pitch));
      const aStart = Math.PI / 2 - ((count - 1) * pitch) / 2;
      const gems = [];
      for (let k = 0; k < count; k++) {
        const a = aStart + k * pitch;
        const g = st.geo.clone();
        // table outward: stone +Y → radial direction
        g.translate(0, -st.top + 0.12, 0);
        g.rotateZ(a - Math.PI / 2);
        g.translate(Ro * Math.cos(a), Ro * Math.sin(a), 0);
        gems.push(g);
        if (p.style === 'prong') {
          const b = a + pitch / 2;
          if (k < count - 1 || p.cover >= 360)
            for (const s of [-1, 1]) metal.push(sphere(p.stone * 0.2, V3((Ro + 0.05) * Math.cos(b), (Ro + 0.05) * Math.sin(b), s * p.stone * 0.34)));
        }
      }
      if (p.style === 'channel') {
        const a0 = aStart - pitch / 2, a1 = aStart + (count - 0.5) * pitch;
        const rail = (s) => {
          const v0 = s < 0 ? -p.width / 2 : p.width / 2 - 0.45;
          return sweep(circleFrames(Ro - 0.1, a0, Math.min(a1, a0 + TAU - 1e-3), 128), () => [[0, v0], [0.5, v0], [0.5, v0 + 0.45], [0, v0 + 0.45]], { closed: false });
        };
        metal.push(rail(-1), rail(1));
      }
      return [M(merge(metal), 'metal'), M(merge(gems), 'gem', { stone: 'round', size: p.stone, count })];
    },
  },
  signet: {
    label: 'انگشتر مهری (شرف‌الشمس)',
    params: { size: [58, 40, 75, 0.5, 'سایز (محیط mm)'], width: [3.2, 2.2, 8, 0.1, 'پهنای رکاب'], thickness: [1.6, 1.1, 3.5, 0.05, 'ضخامت رکاب'], faceW: [13, 8, 22, 0.5, 'عرض صفحه'], faceH: [11, 7, 20, 0.5, 'طول صفحه'], relief: [0.5, 0.2, 1.5, 0.05, 'برجستگی نقش'] },
    opts: { face: 'oval', text: 'م', font: 'Markazi', mirror: false },
    build: async (p) => {
      const R = ringR(p.size);
      const metal = [shank({ size: p.size, width: p.width, thickness: p.thickness, prof: 'court', taperW: Math.max(1, (p.faceW * 0.55) / p.width), taperT: 1.3 })];
      const topY = R + p.thickness * 1.3;
      const plateT = 1.2;
      const sh = faceShape(p.face, p.faceW, p.faceH);
      const plate = new T.ExtrudeGeometry(sh, { depth: plateT, bevelEnabled: true, bevelThickness: 0.5, bevelSize: 0.6, bevelSegments: 6, curveSegments: 72 });
      plate.rotateX(-Math.PI / 2);
      plate.translate(0, topY - 0.6, 0);
      metal.push(plate);
      const out = [M(merge(metal), 'metal')];
      if (p.text) {
        const ts = await textShapes(p.text, { family: p.font, weight: 700, heightMm: Math.min(p.faceW, p.faceH) * 0.62 });
        if (ts.shapes.length) {
          const g = new T.ExtrudeGeometry(ts.shapes, { depth: p.relief, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.06, bevelSegments: 2, curveSegments: 12 });
          if (p.mirror) g.scale(-1, 1, 1);
          g.rotateX(-Math.PI / 2);
          g.translate(0, topY - 0.6 + plateT + 0.5 - 0.02, 0);
          out.push(M(orient(g), 'metal', { detail: 'relief' }));
        }
      }
      return out;
    },
  },
  bangle: {
    label: 'النگو / دستبند باز',
    params: { diameter: [62, 50, 75, 0.5, 'قطر داخلی'], width: [5, 2, 25, 0.1, 'پهنا'], thickness: [2.2, 1, 5, 0.05, 'ضخامت'], gap: [0, 0, 60, 1, 'دهانه (درجه) — ۰ = بسته'] },
    opts: { profile: 'court' },
    build: (p) => {
      const R = p.diameter / 2;
      if (p.gap <= 0) return [M(sweep(circleFrames(R, 0, TAU, 256), () => profile(p.profile, p.width, p.thickness)), 'metal')];
      const g = (p.gap * Math.PI) / 180;
      const a0 = -Math.PI / 2 + g / 2, a1 = -Math.PI / 2 + TAU - g / 2;
      const geo = sweep(circleFrames(R, a0, a1, 256), () => profile(p.profile, p.width, p.thickness), { closed: false });
      const knob = (a) => sphere(Math.max(p.thickness, p.width * 0.35) * 0.7, V3((R + p.thickness / 2) * Math.cos(a), (R + p.thickness / 2) * Math.sin(a), 0));
      return [M(merge([geo, knob(a0), knob(a1)]), 'metal')];
    },
  },
  pendant: {
    label: 'آویز',
    params: { size: [18, 8, 40, 0.5, 'اندازه'], thickness: [1.4, 0.6, 4, 0.05, 'ضخامت'], bevel: [0.35, 0, 1.2, 0.05, 'گردی لبه'], stone: [0, 0, 8, 0.1, 'سنگ مرکزی (۰ = ندارد)'] },
    opts: { shape: 'shamseh', gem: 'ruby', text: '' , font: 'Markazi' },
    build: async (p) => {
      const sh = pendantShape(p.shape, p.size, { hole: !(p.stone > 0) });
      const gy = p.shape === 'boteh' ? (-5 * p.size) / 32 : 0; // where the stone sits
      const bev = Math.min(p.bevel, p.thickness * 0.45);
      const geo = new T.ExtrudeGeometry(sh, { depth: Math.max(0.1, p.thickness - bev * 2), bevelEnabled: bev > 0, bevelThickness: bev, bevelSize: bev, bevelSegments: 6, curveSegments: 96 });
      geo.translate(0, 0, -(p.thickness - bev * 2) / 2);
      const box = new T.Box3().setFromBufferAttribute(geo.attributes.position);
      const metal = [geo];
      // bail: jump ring perpendicular to the pendant, so the chain runs left–right
      const bailR = Math.max(1.6, p.size * 0.1);
      const bail = new T.TorusGeometry(bailR, Math.max(0.45, p.thickness * 0.35), 16, 48);
      bail.rotateY(Math.PI / 2);
      bail.translate(0, box.max.y + bailR * 0.8, 0);
      metal.push(bail);
      const out = [];
      if (p.stone > 0) {
        const st = gemGeo('round', p.stone);
        const g = st.geo.clone();
        g.rotateX(Math.PI / 2); // table → +Z
        g.translate(0, gy, p.thickness / 2 + 0.5);
        const bz = head(st, { yg: 0, baseY: st.bottom - 0.2, setting: 'bezel', stoneSize: p.stone });
        bz.forEach((b) => b.rotateX(Math.PI / 2).translate(0, gy, p.thickness / 2 + 0.5));
        metal.push(...bz);
        out.push(M(g, 'gem', { stone: 'round', size: p.stone }));
      }
      if (p.text) {
        const ts = await textShapes(p.text, { family: p.font, weight: 700, heightMm: p.size * 0.28 });
        if (ts.shapes.length) {
          const tg = new T.ExtrudeGeometry(ts.shapes, { depth: 0.35, bevelEnabled: false, curveSegments: 12 });
          tg.translate(0, p.stone > 0 ? -p.size * 0.3 : 0, p.thickness / 2 - 0.05);
          metal.push(orient(tg));
        }
      }
      out.unshift(M(merge(metal), 'metal'));
      return out;
    },
  },
  name: {
    label: 'پلاک اسم',
    params: { height: [9, 5, 20, 0.5, 'ارتفاع حروف'], thickness: [1, 0.5, 2.5, 0.05, 'ضخامت'], bar: [0.9, 0, 2, 0.05, 'نوار اتصال زیر (۰ = ندارد)'] },
    opts: { text: 'مریم', font: 'Vazirmatn' },
    build: async (p) => {
      const font = { Vazirmatn: 900, Markazi: 700, Kufi: 700 }[p.font] ?? 800;
      const ts = await textShapes(p.text || 'نام', { family: p.font, weight: font, heightMm: p.height });
      const bev = Math.min(0.2, p.thickness * 0.2);
      const metal = [];
      if (ts.shapes.length) {
        const g = new T.ExtrudeGeometry(ts.shapes, { depth: p.thickness - bev * 2, bevelEnabled: true, bevelThickness: bev, bevelSize: bev * 0.6, bevelSegments: 3, curveSegments: 16 });
        g.translate(0, 0, -(p.thickness - bev * 2) / 2);
        metal.push(orient(g));
      }
      const box = new T.Box3();
      metal.forEach((g) => box.union(new T.Box3().setFromBufferAttribute(g.attributes.position)));
      if (p.bar > 0) {
        const bw = box.max.x - box.min.x;
        const rr = new T.Shape();
        const h = p.bar, x0 = box.min.x + 0.2, y0 = box.min.y + p.height * 0.02;
        roundRect(rr, x0, y0, bw - 0.4, h, h / 2);
        const bg = new T.ExtrudeGeometry(rr, { depth: p.thickness * 0.8, bevelEnabled: false, curveSegments: 16 });
        bg.translate(0, 0, -p.thickness * 0.4);
        metal.push(bg);
      }
      // jump rings on both ends for the chain
      const ringRad = 1.3;
      for (const x of [box.min.x - ringRad * 0.6, box.max.x + ringRad * 0.6]) {
        const jr = new T.TorusGeometry(ringRad, 0.38, 14, 36);
        jr.translate(x, (box.min.y + box.max.y) / 2 + p.height * 0.1, 0);
        metal.push(jr);
      }
      return [M(merge(metal), 'metal')];
    },
  },
  coin: {
    label: 'سکه / مدال',
    params: { diameter: [22, 12, 45, 0.5, 'قطر'], thickness: [1.6, 0.8, 4, 0.05, 'ضخامت'], rim: [1, 0.3, 2.5, 0.05, 'پهنای لبه'], relief: [0.35, 0.1, 1.2, 0.05, 'عمق نقش'] },
    opts: { design: 'rosette', text: 'بئاتریس', font: 'Markazi', image: null },
    build: async (p) => {
      const R = p.diameter / 2;
      const field = p.thickness - p.relief * 0.6;
      const lathe = [[0, 0], [R - 0.2, 0], [R, 0.2], [R, p.thickness - 0.15], [R - 0.15, p.thickness], [R - p.rim, p.thickness], [R - p.rim - 0.25, field], [0, field]].map(([x, y]) => new T.Vector2(x, y));
      const body = new T.LatheGeometry(lathe, 160);
      body.rotateX(Math.PI / 2); // face → +Z
      const metal = [orient(body)];
      const inner = R - p.rim - 0.3;
      if (p.design === 'image' && p.image) {
        metal.push(reliefDisc(heightField(p.image), inner, p.relief, field));
      } else if (p.design === 'text') {
        const ts = await textShapes(p.text || ' ', { family: p.font, weight: 700, heightMm: inner * 0.5 });
        if (ts.shapes.length) {
          const s = Math.min(1, (inner * 1.7) / Math.max(ts.width, 1));
          const g = new T.ExtrudeGeometry(ts.shapes, { depth: p.relief, bevelEnabled: false, curveSegments: 12 });
          g.scale(s, s, 1).translate(0, 0, field - 0.02);
          metal.push(orient(g));
        }
      } else {
        metal.push(rosetteRelief(inner * 0.92, p.relief, field - 0.02));
      }
      const grp = merge(metal);
      grp.rotateX(0);
      return [M(grp, 'metal')];
    },
  },
  bar: {
    label: 'شمش',
    view: { pitch: 0.75, yaw: 0.35 },
    params: { length: [30, 10, 80, 0.5, 'طول'], width: [17, 6, 45, 0.5, 'عرض'], thickness: [2, 0.8, 10, 0.1, 'ضخامت'] },
    opts: { line1: 'طلای ناب', line2: '۹۹۹٫۹', font: 'Markazi' },
    build: async (p) => {
      const sh = new T.Shape();
      const r = Math.min(p.width, p.length) * 0.12;
      roundRect(sh, -p.length / 2, -p.width / 2, p.length, p.width, r);
      const bev = Math.min(0.5, p.thickness * 0.25);
      const g = new T.ExtrudeGeometry(sh, { depth: p.thickness - bev * 2, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 5, curveSegments: 24 });
      g.rotateX(-Math.PI / 2);
      g.translate(0, bev, 0);
      const metal = [orient(g)];
      const top = p.thickness - 0.02;
      // raised hallmark frame
      const fr = new T.Shape();
      roundRect(fr, -p.length / 2 + 1.1, -p.width / 2 + 1.1, p.length - 2.2, p.width - 2.2, r * 0.7);
      const hole = new T.Path();
      roundRect(hole, -p.length / 2 + 1.5, -p.width / 2 + 1.5, p.length - 3, p.width - 3, r * 0.55);
      fr.holes.push(hole);
      const fg = new T.ExtrudeGeometry(fr, { depth: 0.18, bevelEnabled: false, curveSegments: 24 });
      fg.rotateX(-Math.PI / 2);
      fg.translate(0, top, 0);
      metal.push(orient(fg));
      const lines = [p.line1, p.line2].filter(Boolean);
      for (let i = 0; i < lines.length; i++) {
        const ts = await textShapes(lines[i], { family: p.font, weight: 700, heightMm: Math.min(p.width * 0.24, p.length * 0.3) });
        if (!ts.shapes.length) continue;
        const k = Math.min(1, (p.length * 0.78) / Math.max(1, ts.width));
        const tg = new T.ExtrudeGeometry(ts.shapes, { depth: 0.22, bevelEnabled: false, curveSegments: 12 });
        tg.scale(k, k, 1);
        tg.rotateX(-Math.PI / 2);
        tg.translate(0, top, lines.length === 1 ? 0 : (i === 0 ? -1 : 1) * p.width * 0.2);
        metal.push(orient(tg));
      }
      return [M(merge(metal), 'metal')];
    },
  },
  chain: {
    label: 'زنجیر',
    view: { pitch: 1.05, yaw: 0 },
    params: { length: [45, 35, 70, 1, 'طول (سانتی‌متر)'], wire: [0.8, 0.3, 2, 0.05, 'قطر مفتول'], link: [4.5, 2, 12, 0.1, 'طول حلقه'] },
    opts: { style: 'cable' },
    build: (p) => {
      const L = p.length * 10;
      const R = L / TAU;
      const style = p.style;
      const pattern = style === 'figaro' ? [1, 1, 1, 2.4] : [1];
      const lw = style === 'box' ? p.link * 0.85 : p.link * (style === 'curb' ? 0.72 : 0.62);
      const linkGeo = {};
      const makeLink = (len) => {
        const key = len.toFixed(3);
        if (linkGeo[key]) return linkGeo[key];
        const inL = len, inW = lw;
        const pts = [];
        const n = 48;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU;
          let x, y;
          if (style === 'box') {
            const c = Math.cos(a), s = Math.sin(a);
            const k = 1 / ((Math.abs(c) ** 6 + Math.abs(s) ** 6) ** (1 / 6));
            x = (c * k * inL) / 2;
            y = (s * k * inW) / 2;
          } else {
            // stadium (racetrack) link
            const r = inW / 2, straight = Math.max(0, inL / 2 - r);
            const u = (i / n) * 4;
            if (u < 1) (x = straight - 2 * straight * u), (y = r);
            else if (u < 2) (x = -straight - r * Math.sin((u - 1) * Math.PI)), (y = r * Math.cos((u - 1) * Math.PI));
            else if (u < 3) (x = -straight + 2 * straight * (u - 2)), (y = -r);
            else (x = straight + r * Math.sin((u - 3) * Math.PI)), (y = -r * Math.cos((u - 3) * Math.PI));
          }
          pts.push(V3(x, y, style === 'curb' ? Math.sin(a) * p.wire * 0.9 : 0));
        }
        const g = new T.TubeGeometry(new T.CatmullRomCurve3(pts, true), 64, p.wire / 2, 10, true);
        if (style === 'curb') g.scale(1, 1, 0.75);
        linkGeo[key] = g;
        return g;
      };
      const geos = [];
      let s = 0, k = 0;
      const step = (len) => (style === 'curb' || style === 'figaro' ? len * 0.78 : len - p.wire * 1.05);
      while (s < L - p.link) {
        const len = p.link * pattern[k % pattern.length];
        const mid = s + step(len) / 2;
        const a = mid / R;
        const g = makeLink(len).clone();
        // lay flat on the table (XZ plane), tangent along the circle
        const twist = style === 'curb' || style === 'figaro' ? 0 : k % 2 ? Math.PI / 2 : 0;
        g.rotateX(twist + Math.PI / 2);
        if (style === 'curb' || style === 'figaro') g.rotateX(((k % 2 ? 1 : -1) * Math.PI) / 9);
        g.rotateY(a + Math.PI / 2);
        g.translate(R * Math.cos(a), p.wire / 2 + (twist ? lw / 2 : 0), -R * Math.sin(a));
        geos.push(g);
        s += step(len);
        k++;
      }
      // lobster-style clasp approximation
      const clasp = new T.CapsuleGeometry(p.wire * 1.5, p.link * 1.4, 8, 16);
      clasp.rotateZ(Math.PI / 2);
      clasp.translate(R, p.wire * 1.6, 0);
      geos.push(clasp);
      return [M(merge(geos), 'metal', { links: k })];
    },
  },
  hoop: {
    label: 'گوشواره حلقه‌ای',
    params: { diameter: [22, 8, 60, 0.5, 'قطر'], width: [2.5, 0.8, 8, 0.1, 'پهنا'], thickness: [1.6, 0.6, 4, 0.05, 'ضخامت'] },
    opts: { profile: 'round' },
    build: (p) => {
      const R = p.diameter / 2 - p.thickness;
      const gap = 0.14;
      const g = sweep(circleFrames(R, Math.PI / 2 + gap, Math.PI / 2 + TAU - gap, 192), () => profile(p.profile, p.width, p.thickness), { closed: false });
      const post = new T.CylinderGeometry(0.4, 0.4, 2 * R * Math.sin(gap) + p.thickness, 12);
      post.rotateZ(Math.PI / 2);
      post.translate(0, R + p.thickness / 2, 0);
      return [M(merge([g, post]), 'metal')];
    },
  },
  stud: {
    label: 'گوشواره میخی',
    params: { stone: [5, 2.5, 10, 0.1, 'قطر سنگ'], prong: [0.5, 0.3, 0.9, 0.01, 'قطر پنجه'] },
    opts: { cut: 'round', setting: 'prong4', gem: 'diamond' },
    build: (p) => {
      const st = gemGeo(p.cut, p.stone);
      const metal = head(st, { yg: 0, baseY: st.bottom - 0.6, setting: p.setting, prongR: p.prong, stoneSize: p.stone });
      const post = new T.CylinderGeometry(0.42, 0.42, 11, 16);
      post.translate(0, st.bottom - 0.6 - 5.5, 0);
      metal.push(post);
      const cup = new T.CylinderGeometry(Math.min(1.6, p.stone * 0.28), 0.6, 1.2, 24);
      cup.translate(0, st.bottom - 0.9, 0);
      metal.push(cup);
      const all = merge(metal);
      all.rotateX(Math.PI / 2);
      const gem = st.geo.clone().rotateX(Math.PI / 2);
      return [M(all, 'metal'), M(gem, 'gem', { stone: p.cut, size: p.stone })];
    },
  },
  gem: {
    label: 'سنگ تنها',
    params: { stone: [8, 1, 20, 0.1, 'عرض سنگ'], ratio: [1.4, 1, 2.4, 0.05, 'نسبت طول به عرض'] },
    opts: { cut: 'round', gem: 'diamond' },
    noMetal: true,
    build: (p) => {
      const st = gemGeo(p.cut, p.stone, ['round', 'princess', 'heart'].includes(p.cut) ? undefined : p.ratio);
      return [M(st.geo.clone().translate(0, -st.bottom, 0), 'gem', { stone: p.cut, size: p.stone })];
    },
  },
  relief: {
    label: 'نقش برجسته از تصویر',
    params: { size: [30, 10, 80, 0.5, 'اندازه'], thickness: [1.5, 0.6, 5, 0.05, 'ضخامت پایه'], relief: [0.8, 0.1, 3, 0.05, 'عمق نقش'] },
    opts: { shape: 'disc', image: null, invert: false },
    build: (p) => {
      const R = p.size / 2;
      const metal = [];
      const base = p.shape === 'disc' ? new T.CylinderGeometry(R, R, p.thickness, 128) : new T.BoxGeometry(p.size, p.thickness, p.size);
      base.rotateX(Math.PI / 2);
      metal.push(base);
      const hf = p.image ? heightField(p.image, { invert: p.invert }) : (u, v) => rosetteField(u, v);
      metal.push(p.shape === 'disc' ? reliefDisc(hf, R - 0.4, p.relief, p.thickness / 2 - 0.02) : reliefRect(hf, p.size - 0.8, p.relief, p.thickness / 2 - 0.02));
      return [M(merge(metal), 'metal')];
    },
  },
};

/* ================================================================== 2-D motifs */

function roundRect(s, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

function faceShape(kind, w, h) {
  const s = new T.Shape();
  if (kind === 'rect') return roundRect(s, -w / 2, -h / 2, w, h, Math.min(w, h) * 0.18);
  if (kind === 'octagon') {
    const c = Math.min(w, h) * 0.28;
    const pts = [[w / 2, h / 2 - c], [w / 2 - c, h / 2], [-w / 2 + c, h / 2], [-w / 2, h / 2 - c], [-w / 2, -h / 2 + c], [-w / 2 + c, -h / 2], [w / 2 - c, -h / 2], [w / 2, -h / 2 + c]];
    s.setFromPoints(pts.map(([x, y]) => new T.Vector2(x, y)));
    return s;
  }
  s.absellipse(0, 0, w / 2, h / 2, 0, TAU, false, 0);
  return s;
}

export const PENDANT_SHAPES = [
  ['shamseh', 'شمسه (ستاره هشت‌پر)'],
  ['boteh', 'بته‌جقه'],
  ['disc', 'دایره'],
  ['heart', 'قلب'],
  ['drop', 'اشک'],
  ['crescent', 'هلال'],
  ['hexagon', 'شش‌ضلعی'],
];

function pendantShape(kind, size, { hole = true } = {}) {
  const s = new T.Shape();
  const R = size / 2;
  switch (kind) {
    case 'disc':
      s.absarc(0, 0, R, 0, TAU, false);
      return s;
    case 'hexagon': {
      const pts = [];
      for (let i = 0; i < 6; i++) pts.push(new T.Vector2(R * Math.cos((i / 6) * TAU + Math.PI / 6), R * Math.sin((i / 6) * TAU + Math.PI / 6)));
      s.setFromPoints(pts);
      return s;
    }
    case 'heart': {
      const k = size / 32;
      s.moveTo(0, -14 * k);
      s.bezierCurveTo(-4 * k, -10 * k, -16 * k, -2 * k, -16 * k, 6 * k);
      s.bezierCurveTo(-16 * k, 13 * k, -8 * k, 16 * k, 0, 9 * k);
      s.bezierCurveTo(8 * k, 16 * k, 16 * k, 13 * k, 16 * k, 6 * k);
      s.bezierCurveTo(16 * k, -2 * k, 4 * k, -10 * k, 0, -14 * k);
      return s;
    }
    case 'drop': {
      s.moveTo(0, R);
      s.bezierCurveTo(R * 0.25, R * 0.55, R * 0.72, R * 0.05, R * 0.72, -R * 0.32);
      s.absarc(0, -R * 0.32, R * 0.72, 0, Math.PI, true);
      s.bezierCurveTo(-R * 0.72, R * 0.05, -R * 0.25, R * 0.55, 0, R);
      return s;
    }
    case 'crescent': {
      s.absarc(0, 0, R, Math.PI * 0.22, Math.PI * 1.78, false);
      s.absarc(R * 0.42, 0, R * 0.78, Math.PI * 1.62, Math.PI * 0.38, true);
      return s;
    }
    case 'boteh': {
      // Persian paisley (بته‌جقه): leaning drop whose tip curls over
      const k = size / 32;
      s.moveTo(10 * k, 16 * k);
      s.bezierCurveTo(4 * k, 15 * k, -1 * k, 10 * k, -2 * k, 6 * k);
      s.bezierCurveTo(-8 * k, 5 * k, -13 * k, -1 * k, -12 * k, -7 * k);
      s.bezierCurveTo(-11 * k, -14 * k, -3 * k, -17 * k, 3 * k, -15 * k);
      s.bezierCurveTo(10 * k, -13 * k, 13 * k, -6 * k, 11 * k, 1 * k);
      s.bezierCurveTo(9.5 * k, 6 * k, 8 * k, 9 * k, 9 * k, 12 * k);
      s.bezierCurveTo(9.5 * k, 14 * k, 11 * k, 15 * k, 10 * k, 16 * k);
      const h = new T.Path();
      h.absellipse(0, -5 * k, 4.5 * k, 5.5 * k, 0, TAU, true, -0.5);
      if (hole) s.holes.push(h);
      return s;
    }
    default: {
      // shamseh: eight-point star made from two overlapping squares
      const pts = [];
      for (let i = 0; i < 16; i++) {
        const r = i % 2 === 0 ? R : R * 0.76;
        const a = (i / 16) * TAU + Math.PI / 2;
        pts.push(new T.Vector2(r * Math.cos(a), r * Math.sin(a)));
      }
      s.setFromPoints(pts);
      const h = new T.Path();
      h.absarc(0, 0, R * 0.26, 0, TAU, true);
      if (hole) s.holes.push(h);
      return s;
    }
  }
}

/** Twelve-petal Persepolis rosette as raised geometry (face +Z, starting at z0). */
function rosetteRelief(R, depth, z0) {
  const geos = [];
  for (let i = 0; i < 12; i++) {
    const s = new T.Shape();
    s.moveTo(0, R * 0.2);
    s.bezierCurveTo(R * 0.16, R * 0.45, R * 0.12, R * 0.82, 0, R * 0.95);
    s.bezierCurveTo(-R * 0.12, R * 0.82, -R * 0.16, R * 0.45, 0, R * 0.2);
    const g = new T.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: depth * 0.3, bevelSize: R * 0.02, bevelSegments: 3, curveSegments: 24 });
    g.rotateZ((i / 12) * TAU);
    geos.push(g);
  }
  const c = new T.CylinderGeometry(R * 0.16, R * 0.16, depth * 1.3, 48);
  c.rotateX(Math.PI / 2);
  c.translate(0, 0, (depth * 1.3) / 2);
  geos.push(c);
  const ring = new T.TorusGeometry(R * 1.02, depth * 0.35, 10, 128);
  ring.translate(0, 0, depth * 0.3);
  geos.push(ring);
  const g = merge(geos);
  g.translate(0, 0, z0);
  return g;
}
function rosetteField(u, v) {
  const x = u * 2 - 1, y = v * 2 - 1;
  const r = Math.hypot(x, y), a = Math.atan2(y, x);
  const petal = Math.max(0, Math.cos(6 * a)) ** 3 * Math.max(0, 1 - Math.abs(r - 0.55) / 0.35);
  const hub = Math.max(0, 1 - r / 0.18);
  const rim = Math.max(0, 1 - Math.abs(r - 0.92) / 0.04);
  return Math.min(1, petal + hub + rim);
}

/** Closed relief slab over a disc: top = height field, bottom flat at z0, facing +Z. */
function reliefDisc(hf, R, depth, z0, rings = 140, segs = 280) {
  const pos = [], idx = [];
  const top = [], bot = [];
  const vtx = (x, y, z) => (pos.push(x, y, z), pos.length / 3 - 1);
  const h = (x, y) => {
    const r = Math.hypot(x, y) / R;
    const fade = r > 0.97 ? Math.max(0, (1 - r) / 0.03) : 1;
    return hf(x / (2 * R) + 0.5, 0.5 - y / (2 * R)) * depth * fade;
  };
  const zb = z0;
  top.push(vtx(0, 0, zb + h(0, 0)));
  bot.push(vtx(0, 0, zb));
  for (let i = 1; i <= rings; i++) {
    const r = (R * i) / rings;
    for (let j = 0; j < segs; j++) {
      const a = (j / segs) * TAU;
      const x = r * Math.cos(a), y = r * Math.sin(a);
      top.push(vtx(x, y, zb + (i === rings ? 0 : h(x, y))));
      bot.push(vtx(x, y, zb));
    }
  }
  const at = (arr, i, j) => (i === 0 ? arr[0] : arr[1 + (i - 1) * segs + (j % segs)]);
  for (let i = 0; i < rings; i++)
    for (let j = 0; j < segs; j++) {
      if (i === 0) {
        idx.push(at(top, 0, 0), at(top, 1, j), at(top, 1, j + 1));
        idx.push(at(bot, 0, 0), at(bot, 1, j + 1), at(bot, 1, j));
      } else {
        const a = at(top, i, j), b = at(top, i, j + 1), c = at(top, i + 1, j + 1), d = at(top, i + 1, j);
        idx.push(a, d, c, a, c, b);
        const a2 = at(bot, i, j), b2 = at(bot, i, j + 1), c2 = at(bot, i + 1, j + 1), d2 = at(bot, i + 1, j);
        idx.push(a2, c2, d2, a2, b2, c2);
      }
    }
  const g = orient(build(pos, null, idx));
  g.computeVertexNormals();
  return g;
}
function reliefRect(hf, S, depth, z0, n = 260) {
  const pos = [], idx = [];
  const zb = z0;
  for (let layer = 0; layer < 2; layer++)
    for (let i = 0; i <= n; i++)
      for (let j = 0; j <= n; j++) {
        const u = j / n, v = i / n;
        const edge = i === 0 || j === 0 || i === n || j === n;
        pos.push((u - 0.5) * S, (0.5 - v) * S, zb + (layer === 0 && !edge ? hf(u, v) * depth : 0));
      }
  const off = (n + 1) * (n + 1);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const a = i * (n + 1) + j, b = a + 1, c = a + n + 2, d = a + n + 1;
      idx.push(a, d, c, a, c, b);
      idx.push(off + a, off + c, off + d, off + a, off + b, off + c);
    }
  const g = orient(build(pos, null, idx));
  g.computeVertexNormals();
  return g;
}
