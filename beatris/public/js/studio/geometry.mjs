// موتور هندسه قطعی استودیو (spec 0016): closed triangle meshes in millimetres and the measurements the studio
// trusts — volume, surface area, bounds, connected parts, watertightness, wall thickness — plus the operations the
// CAD intermediate representation can ask for. Booleans, offsets, shells and fillets run on distance fields (the
// tested public/js/voxel.mjs), so they are exact to the grid resolution, never guessed. Pure; runs in Node and in
// the browser. A mesh is { position: Float32Array (xyz…), index: Uint32Array (abc…) } with outward winding.
import { voxelize, signedDistance, surfaceNetsField, boxAround, remeshDistance } from '../voxel.mjs';
import { q } from './units.mjs';

const TAU = Math.PI * 2;
export const mesh = (position, index) => ({ position: Float32Array.from(position), index: Uint32Array.from(index) });

/* ---------------- primitives ---------------- */
/** Revolve a closed (r, z) profile (counter-clockwise) about the z axis: a ring-like solid. */
export function revolve(profile, segments = 96, { start = 0, sweep = TAU } = {}) {
  const n = profile.length, full = Math.abs(sweep - TAU) < 1e-9;
  const rings = full ? segments : segments + 1;
  const P = [], I = [];
  for (let s = 0; s < rings; s++) {
    const a = start + (sweep * s) / segments, c = Math.cos(a), si = Math.sin(a);
    for (const [r, z] of profile) P.push(r * c, r * si, z);
  }
  for (let s = 0; s < segments; s++) {
    const s1 = full ? (s + 1) % segments : s + 1;
    for (let i = 0; i < n; i++) {
      const i1 = (i + 1) % n, a = s * n + i, b = s * n + i1, c = s1 * n + i1, d = s1 * n + i;
      I.push(a, d, c, a, c, b);
    }
  }
  if (!full) {
    // caps at both ends of a partial revolve
    const cap = triangulate(profile);
    const c0 = P.length / 3;
    for (const [r, z] of profile) P.push(r * Math.cos(start), r * Math.sin(start), z);
    for (const [a, b, c] of cap) I.push(c0 + a, c0 + b, c0 + c);
    const c1 = P.length / 3, e = start + sweep;
    for (const [r, z] of profile) P.push(r * Math.cos(e), r * Math.sin(e), z);
    for (const [a, b, c] of cap) I.push(c1 + a, c1 + c, c1 + b);
  }
  return orient(mesh(P, I));
}
/** Extrude a closed polygon in the xy plane (any winding) by `height` along +z. */
export function extrude(polygon, height) {
  const pts = area2(polygon) < 0 ? [...polygon].reverse() : polygon;
  const n = pts.length, P = [], I = [];
  for (const [x, y] of pts) P.push(x, y, 0);
  for (const [x, y] of pts) P.push(x, y, height);
  for (const [a, b, c] of triangulate(pts)) I.push(a, c, b), I.push(n + a, n + b, n + c);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    I.push(i, j, n + j, i, n + j, n + i);
  }
  return orient(mesh(P, I));
}
/** A circular tube of `radius` along a polyline path (closed or with flat end caps). */
export function sweep(path, radius, { closed = false, sides = 16 } = {}) {
  const n = path.length, P = [], I = [];
  const frames = pathFrames(path, closed);
  for (let i = 0; i < n; i++) {
    const [p, N, B] = [path[i], frames[i][0], frames[i][1]];
    for (let s = 0; s < sides; s++) {
      const a = (TAU * s) / sides, c = Math.cos(a), si = Math.sin(a);
      P.push(p[0] + radius * (N[0] * c + B[0] * si), p[1] + radius * (N[1] * c + B[1] * si), p[2] + radius * (N[2] * c + B[2] * si));
    }
  }
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const i1 = (i + 1) % n;
    for (let s = 0; s < sides; s++) {
      const s1 = (s + 1) % sides, a = i * sides + s, b = i * sides + s1, c = i1 * sides + s1, d = i1 * sides + s;
      I.push(a, b, c, a, c, d);
    }
  }
  if (!closed) {
    const c0 = P.length / 3;
    P.push(...path[0]);
    const c1 = P.length / 3;
    P.push(...path[n - 1]);
    for (let s = 0; s < sides; s++) {
      const s1 = (s + 1) % sides;
      I.push(c0, s1, s);
      I.push(c1, (n - 1) * sides + s, (n - 1) * sides + s1);
    }
  }
  return orient(mesh(P, I));
}
export const cylinder = (r, h, sides = 32) => extrude(Array.from({ length: sides }, (_, i) => [r * Math.cos((TAU * i) / sides), r * Math.sin((TAU * i) / sides)]), h);
export const box = (x, y, z) => translate(extrude([[0, 0], [x, 0], [x, y], [0, y]], z), [-x / 2, -y / 2, -z / 2]);
/** An ellipsoid with semi-axes a, b, c (a stone's volume stand-in for clearance checks). */
export function ellipsoid(a, b, c, nu = 32, nv = 16) {
  const P = [], I = [];
  P.push(0, 0, -c);
  for (let j = 1; j < nv; j++) {
    const v = -Math.PI / 2 + (Math.PI * j) / nv;
    for (let i = 0; i < nu; i++) {
      const u = (TAU * i) / nu;
      P.push(a * Math.cos(v) * Math.cos(u), b * Math.cos(v) * Math.sin(u), c * Math.sin(v));
    }
  }
  P.push(0, 0, c);
  const top = P.length / 3 - 1, at = (j, i) => 1 + (j - 1) * nu + (i % nu);
  for (let i = 0; i < nu; i++) I.push(0, at(1, i + 1), at(1, i));
  for (let j = 1; j < nv - 1; j++) for (let i = 0; i < nu; i++) I.push(at(j, i), at(j, i + 1), at(j + 1, i + 1), at(j, i), at(j + 1, i + 1), at(j + 1, i));
  for (let i = 0; i < nu; i++) I.push(top, at(nv - 1, i), at(nv - 1, i + 1));
  return orient(mesh(P, I));
}

/* ---------------- transforms ---------------- */
function mapPoints(m, f, flip = false) {
  const p = new Float32Array(m.position.length);
  for (let i = 0; i < p.length; i += 3) p.set(f(m.position[i], m.position[i + 1], m.position[i + 2]), i);
  const idx = Uint32Array.from(m.index);
  if (flip) for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
  return { position: p, index: idx };
}
export const translate = (m, [dx, dy, dz]) => mapPoints(m, (x, y, z) => [x + dx, y + dy, z + dz]);
export function scale(m, [sx, sy, sz], c = [0, 0, 0]) {
  const neg = (sx < 0) ^ (sy < 0) ^ (sz < 0);
  return mapPoints(m, (x, y, z) => [c[0] + (x - c[0]) * sx, c[1] + (y - c[1]) * sy, c[2] + (z - c[2]) * sz], !!neg);
}
export function rotate(m, axis, deg, c = [0, 0, 0]) {
  const a = (deg * Math.PI) / 180, co = Math.cos(a), si = Math.sin(a);
  return mapPoints(m, (x, y, z) => {
    const [u, v, w] = [x - c[0], y - c[1], z - c[2]];
    const r = axis === 'x' ? [u, v * co - w * si, v * si + w * co] : axis === 'y' ? [u * co + w * si, v, -u * si + w * co] : [u * co - v * si, u * si + v * co, w];
    return [r[0] + c[0], r[1] + c[1], r[2] + c[2]];
  });
}
/** Mirror across the plane through the origin normal to `axis` (winding is flipped so the solid stays outward). */
export const mirror = (m, axis) => scale(m, [axis === 'x' ? -1 : 1, axis === 'y' ? -1 : 1, axis === 'z' ? -1 : 1]);
export function merge(meshes) {
  const P = [], I = [];
  for (const m of meshes) {
    const o = P.length / 3;
    P.push(...m.position);
    for (const k of m.index) I.push(o + k);
  }
  return mesh(P, I);
}
/** Copies: linear (step vector) or polar (about z). */
export function array(m, { count, step = null, polar = false }) {
  const out = [];
  for (let i = 0; i < count; i++) out.push(polar ? rotate(m, 'z', (360 * i) / count) : translate(m, step.map((s) => s * i)));
  return merge(out);
}

/* ---------------- distance-field operations ---------------- */
const RES = 140;
function gridFor(meshes, pad, res) {
  const all = merge(meshes);
  const b0 = boxAround(all.position, 0);
  const ext = Math.max(...[0, 1, 2].map((k) => b0.max[k] - b0.min[k]));
  const vox = (ext + 2 * pad) / res;
  return boxAround(all.position, pad + 3 * vox);
}
/** union | difference | intersection of solids, by occupancy on one shared grid, re-meshed by surface nets. */
export function boolean(op, a, b, res = RES) {
  const box = gridFor([a, b], 0, res);
  const ga = voxelize(a.position, a.index, box, res), gb = voxelize(b.position, b.index, box, res);
  const occ = new Uint8Array(ga.occ.length);
  for (let i = 0; i < occ.length; i++) occ[i] = op === 'union' ? ga.occ[i] | gb.occ[i] : op === 'difference' ? ga.occ[i] & (gb.occ[i] ^ 1) : ga.occ[i] & gb.occ[i];
  const S = signedDistance({ occ, dims: ga.dims, vox: ga.vox });
  return surfaceNetsField(S, ga.dims, ga.vox, ga.min, 0);
}
/** Offset the surface by d mm (negative: inward). */
export const offset = (m, d, res = RES) => strip(remeshDistance(m.position, m.index, 'offset', d, res));
/** Round convex edges with a rolling ball of radius r. */
export const fillet = (m, r, res = RES) => strip(remeshDistance(m.position, m.index, 'fillet', r, res));
/** Hollow a solid leaving a wall of thickness t (the inner solid is removed). */
export function shell(m, t, res = RES) {
  const inner = offset(m, -t, res);
  return boolean('difference', m, inner, res);
}
const strip = (r) => ({ position: r.position, index: r.index });

/* ---------------- measurements ---------------- */
export const volume = (m) => q(Math.abs(signedVol(m)), 'mm3');
function signedVol({ position: p, index: idx }) {
  let v = 0;
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
    v += p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) - p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c]) + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c]);
  }
  return v / 6;
}
export function surfaceArea({ position: p, index: idx }) {
  let s = 0;
  for (let i = 0; i < idx.length; i += 3) {
    const [a, b, c] = [idx[i] * 3, idx[i + 1] * 3, idx[i + 2] * 3];
    const u = [p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]], v = [p[c] - p[a], p[c + 1] - p[a + 1], p[c + 2] - p[a + 2]];
    s += Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) / 2;
  }
  return q(s, 'mm2');
}
export function bounds({ position: p }) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.length; i += 3) for (let k = 0; k < 3; k++) (min[k] = Math.min(min[k], p[i + k])), (max[k] = Math.max(max[k], p[i + k]));
  return { min, max, size: [0, 1, 2].map((k) => q(max[k] - min[k], 'mm')) };
}
/** Edges used by one triangle (open) or more than two (non-manifold), on welded vertices. */
export function watertight(m) {
  const w = weld(m);
  const e = new Map();
  for (let i = 0; i < w.length; i += 3)
    for (let k = 0; k < 3; k++) {
      const a = w[i + k], b = w[i + ((k + 1) % 3)];
      if (a === b) continue;
      const key = a < b ? `${a},${b}` : `${b},${a}`;
      e.set(key, (e.get(key) ?? 0) + 1);
    }
  let open = 0, nonManifold = 0;
  for (const c of e.values()) c === 1 ? open++ : c > 2 && nonManifold++;
  return { closed: open === 0, open, nonManifold };
}
/** Connected parts (welded): a separate floating part cannot be cast as one piece. */
export function components(m) {
  const w = weld(m), parent = new Map();
  const find = (x) => {
    while (parent.get(x) !== x) {
      parent.set(x, parent.get(parent.get(x)));
      x = parent.get(x);
    }
    return x;
  };
  for (const v of w) if (!parent.has(v)) parent.set(v, v);
  for (let i = 0; i < w.length; i += 3) {
    const a = find(w[i]);
    for (const v of [w[i + 1], w[i + 2]]) {
      const b = find(v);
      if (a !== b) parent.set(b, a);
    }
  }
  return new Set([...parent.keys()].map(find)).size;
}
function weld({ position: p, index: idx }, tol = 1e-4) {
  const map = new Map(), id = new Uint32Array(p.length / 3);
  for (let i = 0; i < p.length; i += 3) {
    const k = `${Math.round(p[i] / tol)},${Math.round(p[i + 1] / tol)},${Math.round(p[i + 2] / tol)}`;
    if (!map.has(k)) map.set(k, map.size);
    id[i / 3] = map.get(k);
  }
  return Array.from(idx, (v) => id[v]);
}

/**
 * Wall thickness: from sample points on the surface, a ray goes inward along the face normal to the opposite
 * surface. Returns the minimum, the 5th percentile and where the thinnest wall is (deterministic sampling).
 */
export function wallThickness(m, { samples = 600 } = {}) {
  const { position: p, index: idx } = m, T = idx.length / 3;
  const tri = (t) => [idx[t * 3] * 3, idx[t * 3 + 1] * 3, idx[t * 3 + 2] * 3];
  const areas = new Float64Array(T);
  let total = 0;
  for (let t = 0; t < T; t++) {
    const [a, b, c] = tri(t);
    const u = [p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]], v = [p[c] - p[a], p[c + 1] - p[a + 1], p[c + 2] - p[a + 2]];
    areas[t] = Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) / 2;
    total += areas[t];
  }
  // stratified by area: every triangle gets its share of samples, at its centroid (deterministic)
  const out = [];
  const step = total / samples;
  let acc = step / 2;
  let run = 0;
  for (let t = 0; t < T && out.length < samples; t++) {
    run += areas[t];
    if (run < acc) continue;
    acc += step;
    const [a, b, c] = tri(t);
    const o = [0, 1, 2].map((k) => (p[a + k] + p[b + k] + p[c + k]) / 3);
    const u = [p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]], v = [p[c] - p[a], p[c + 1] - p[a + 1], p[c + 2] - p[a + 2]];
    let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const l = Math.hypot(...n) || 1;
    n = n.map((x) => -x / l); // inward
    const d = rayHit(p, idx, T, o.map((x, k) => x + n[k] * 1e-4), n, t);
    if (d < Infinity) out.push({ d, at: o });
  }
  if (!out.length) return null;
  out.sort((x, y) => x.d - y.d);
  return { min: q(out[0].d, 'mm'), p05: q(out[Math.floor(out.length * 0.05)].d, 'mm'), median: q(out[out.length >> 1].d, 'mm'), at: out[0].at.map((x) => Math.round(x * 100) / 100), samples: out.length };
}
function rayHit(p, idx, T, o, d, skip) {
  let best = Infinity;
  for (let t = 0; t < T; t++) {
    if (t === skip) continue;
    const a = idx[t * 3] * 3, b = idx[t * 3 + 1] * 3, c = idx[t * 3 + 2] * 3;
    const e1 = [p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]], e2 = [p[c] - p[a], p[c + 1] - p[a + 1], p[c + 2] - p[a + 2]];
    const h = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]];
    const det = e1[0] * h[0] + e1[1] * h[1] + e1[2] * h[2];
    if (Math.abs(det) < 1e-12) continue;
    const f = 1 / det, s = [o[0] - p[a], o[1] - p[a + 1], o[2] - p[a + 2]];
    const u = f * (s[0] * h[0] + s[1] * h[1] + s[2] * h[2]);
    if (u < 0 || u > 1) continue;
    const qv = [s[1] * e1[2] - s[2] * e1[1], s[2] * e1[0] - s[0] * e1[2], s[0] * e1[1] - s[1] * e1[0]];
    const v = f * (d[0] * qv[0] + d[1] * qv[1] + d[2] * qv[2]);
    if (v < 0 || u + v > 1) continue;
    const dist = f * (e2[0] * qv[0] + e2[1] * qv[1] + e2[2] * qv[2]);
    if (dist > 1e-5 && dist < best) best = dist;
  }
  return best;
}

/* ---------------- helpers ---------------- */
function area2(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x0, y0] = poly[i], [x1, y1] = poly[(i + 1) % poly.length];
    a += x0 * y1 - x1 * y0;
  }
  return a / 2;
}
/** Ear clipping of a simple polygon (counter-clockwise result). */
export function triangulate(poly) {
  const idx = poly.map((_, i) => i);
  if (area2(poly) < 0) idx.reverse();
  const out = [];
  const cross = (a, b, c) => (poly[b][0] - poly[a][0]) * (poly[c][1] - poly[a][1]) - (poly[b][1] - poly[a][1]) * (poly[c][0] - poly[a][0]);
  const inside = (pt, a, b, c) => cross(a, b, pt) >= 0 && cross(b, c, pt) >= 0 && cross(c, a, pt) >= 0;
  let guard = 0;
  while (idx.length > 3 && guard++ < 10000) {
    let cut = false;
    for (let i = 0; i < idx.length; i++) {
      const a = idx[(i + idx.length - 1) % idx.length], b = idx[i], c = idx[(i + 1) % idx.length];
      if (cross(a, b, c) <= 0) continue;
      if (idx.some((k) => k !== a && k !== b && k !== c && inside(k, a, b, c))) continue;
      out.push([a, b, c]);
      idx.splice(i, 1);
      cut = true;
      break;
    }
    if (!cut) break;
  }
  if (idx.length === 3) out.push(idx);
  return out;
}
function pathFrames(path, closed) {
  const n = path.length, T = [];
  for (let i = 0; i < n; i++) {
    const a = path[closed ? (i - 1 + n) % n : Math.max(0, i - 1)], b = path[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
    const t = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], l = Math.hypot(...t) || 1;
    T.push(t.map((x) => x / l));
  }
  // parallel transport of a normal along the path (no twisting)
  let N = Math.abs(T[0][2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = T[i];
    const dot = N[0] * t[0] + N[1] * t[1] + N[2] * t[2];
    N = [N[0] - dot * t[0], N[1] - dot * t[1], N[2] - dot * t[2]];
    const l = Math.hypot(...N) || 1;
    N = N.map((x) => x / l);
    const B = [t[1] * N[2] - t[2] * N[1], t[2] * N[0] - t[0] * N[2], t[0] * N[1] - t[1] * N[0]];
    out.push([N, B]);
  }
  return out;
}
/** Make the winding outward (positive volume). */
function orient(m) {
  if (signedVol(m) >= 0) return m;
  const idx = Uint32Array.from(m.index);
  for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
  return { position: m.position, index: idx };
}

/**
 * How many separate solids several meshes form once they are put together (touching or overlapping parts count as
 * one): voxel occupancy of the union, 6-connected flood fill. A floating prong or gallery shows up as a second solid.
 */
export function solidComponents(meshes, res = 110) {
  const all = merge(meshes);
  const b0 = boxAround(all.position, 0);
  const ext = Math.max(...[0, 1, 2].map((k) => b0.max[k] - b0.min[k]));
  const box = boxAround(all.position, (3 * ext) / res);
  let occ = null, dims = null;
  for (const m of meshes) {
    const g = voxelize(m.position, m.index, box, res);
    dims = g.dims;
    if (!occ) occ = Uint8Array.from(g.occ);
    else for (let i = 0; i < occ.length; i++) occ[i] |= g.occ[i];
  }
  const [nx, ny, nz] = dims, seen = new Uint8Array(occ.length);
  let count = 0;
  const stack = [];
  for (let s = 0; s < occ.length; s++) {
    if (!occ[s] || seen[s]) continue;
    count++;
    seen[s] = 1;
    stack.push(s);
    while (stack.length) {
      const c = stack.pop(), i = c % nx, j = ((c / nx) | 0) % ny, k = (c / (nx * ny)) | 0;
      for (const [di, dj, dk] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
        const a = i + di, b = j + dj, d = k + dk;
        if (a < 0 || b < 0 || d < 0 || a >= nx || b >= ny || d >= nz) continue;
        const n = (d * ny + b) * nx + a;
        if (occ[n] && !seen[n]) (seen[n] = 1), stack.push(n);
      }
    }
  }
  return count;
}
