// مدل‌ساز آزاد (spec 0008): the general modelling families of a NURBS CAD package, built as exact polygon geometry —
// curves (line, polyline, interpolated curve, rectangle, polygon, circle, ellipse, arc, spiral, helix, offset,
// fillet corners), surfaces and solids from curves (extrude straight/tapered/to point, revolve, rail revolve,
// sweep 1 rail, sweep 2 rails, loft, pipe, cap), solid primitives, booleans (union, difference, intersection,
// split — BSP CSG), mesh and SubD tools (subdivide, smooth, reduce, shell/offset, weld, flip, fill holes), deforms
// (bend, twist, taper, flow along curve, shear, scale 1-D, maelstrom, array along curve), and analysis.
// Everything is in millimetres; curves lie in the XY construction plane (z = 0) unless a command says otherwise.
import * as N from '../nurbs.mjs';
import { T } from './stage.mjs';
import * as J from './jewelcad.mjs';

const { PIECES, sweep, pipeVar, signedVolume, surfaceArea, orient, meshOf: M } = J;
const TAU = Math.PI * 2;
const V3 = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z);
const lerp = (a, b, t) => a + (b - a) * t;
const U = T.BufferGeometryUtils;

/* ================================================================== encoding (project files, history) */
const b64 = (u8) => {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
};
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
/** Indexed float32 geometry as base64, compact enough to keep in a project file. Older 16-bit quantised data still loads. */
export function encodeGeo(geo) {
  // positions stay float32: quantizing would fuse the near-coincident vertices a boolean seam leaves and open the solid
  const g = toIndexed(geo);
  return JSON.stringify({ f: b64(new Uint8Array(new Float32Array(g.attributes.position.array).buffer)), i: b64(new Uint8Array(new Uint32Array(g.index.array).buffer)) });
}
export function decodeGeo(s) {
  const o = typeof s === 'string' ? JSON.parse(s) : s;
  const idx = new Uint32Array(unb64(o.i).buffer);
  let p;
  if (o.f) p = new Float32Array(unb64(o.f).buffer);
  else {
    const q = new Uint16Array(unb64(o.p).buffer);
    p = new Float32Array(q.length);
    for (let i = 0; i < q.length; i++) p[i] = o.b[i % 3] + (q[i] / 65535) * o.b[3 + (i % 3)];
  }
  const n = p.length / 3;
  if (!Number.isInteger(n) || idx.some((i) => i >= n) || p.some((v) => !Number.isFinite(v))) throw new Error('هندسه ذخیره‌شده معتبر نیست.');
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.BufferAttribute(p, 3));
  g.setIndex(new T.BufferAttribute(idx, 1));
  return finish(g);
}
/** Normals that keep hard edges hard (boxes, facets) and soft surfaces soft. */
export function finish(g) {
  const ni = g.index ? g : toIndexed(g);
  const out = U.toCreasedNormals ? U.toCreasedNormals(ni, (35 * Math.PI) / 180) : ni.toNonIndexed();
  if (!out.attributes.normal) out.computeVertexNormals();
  return out;
}
export function toIndexed(geo) {
  const g = new T.BufferGeometry();
  const src = geo.index ? geo.toNonIndexed() : geo;
  g.setAttribute('position', src.attributes.position.clone());
  return U.mergeVertices(g, 1e-4);
}
const nonIndexed = (geo) => (geo.index ? geo.toNonIndexed() : geo);
/** Drop zero-area triangles (poles of spheres, axis points of revolves). */
export function clean(geo) {
  const g = toIndexed(geo);
  const P = g.attributes.position.array, I = g.index.array, out = [];
  const A = V3(), B = V3(), C = V3();
  for (let i = 0; i < I.length; i += 3) {
    const a = I[i], b = I[i + 1], c = I[i + 2];
    if (a === b || b === c || a === c) continue;
    A.fromArray(P, a * 3);
    B.fromArray(P, b * 3);
    C.fromArray(P, c * 3);
    if (B.clone().sub(A).cross(C.clone().sub(A)).lengthSq() < 1e-14) continue;
    out.push(a, b, c);
  }
  g.setIndex(out);
  return g;
}
/**
 * Repair T-junctions (a vertex lying on another triangle's edge — what BSP booleans leave behind) by splitting that
 * triangle, so the result is a watertight mesh a slicer accepts.
 */
export function repairT(geo, passes = 6) {
  let g = clean(geo);
  for (let pass = 0; pass < passes; pass++) {
    const P = g.attributes.position.array, I = Array.from(g.index.array);
    const count = new Map();
    for (let i = 0; i < I.length; i += 3) for (let k = 0; k < 3; k++) {
      const key = edgeKey(I[i + k], I[i + ((k + 1) % 3)]);
      count.set(key, (count.get(key) ?? 0) + 1);
    }
    const nakedVerts = new Set();
    for (const [key, c] of count) if (c === 1) key.split('_').forEach((v) => nakedVerts.add(+v));
    if (!nakedVerts.size) break;
    const verts = [...nakedVerts];
    const grid = new Map(), cell = 0.5;
    const ck = (x, y, z) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
    for (const v of verts) {
      const k = ck(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]);
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(v);
    }
    const out = [];
    let changed = false;
    const A = V3(), B = V3(), X = V3();
    for (let i = 0; i < I.length; i += 3) {
      const tri = [I[i], I[i + 1], I[i + 2]];
      let done = false;
      for (let k = 0; k < 3 && !done; k++) {
        const a = tri[k], b = tri[(k + 1) % 3], c = tri[(k + 2) % 3];
        if (count.get(edgeKey(a, b)) !== 1) continue;
        A.fromArray(P, a * 3);
        B.fromArray(P, b * 3);
        const ab = B.clone().sub(A), L2 = ab.lengthSq();
        if (L2 < 1e-12) continue;
        // candidate vertices in the cells the edge crosses
        const steps = Math.ceil(Math.sqrt(L2) / cell) + 1, seen = new Set(), on = [];
        for (let s2 = 0; s2 <= steps; s2++) {
          const q = A.clone().addScaledVector(ab, s2 / steps);
          for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
            for (const v of grid.get(ck(q.x + dx * cell, q.y + dy * cell, q.z + dz * cell)) ?? []) {
              if (v === a || v === b || seen.has(v)) continue;
              seen.add(v);
              X.fromArray(P, v * 3);
              const t = X.clone().sub(A).dot(ab) / L2;
              if (t <= 1e-4 || t >= 1 - 1e-4) continue;
              if (A.clone().addScaledVector(ab, t).distanceToSquared(X) > 1e-8) continue;
              on.push([t, v]);
            }
          }
        }
        if (on.length) {
          // fan the triangle through every vertex lying on its open edge (a boolean seam can leave many)
          const chain = [a, ...on.sort((x, y) => x[0] - y[0]).map(([, v]) => v), b];
          for (let j = 0; j < chain.length - 1; j++) out.push(chain[j], chain[j + 1], c);
          done = changed = true;
        }
      }
      if (!done) out.push(...tri);
    }
    g.setIndex(out);
    if (!changed) break;
  }
  return g;
}

/* ================================================================== curves */
// a curve: { pts: [[x,y,z]...], closed, smooth }  (smooth = interpolated through the points)
export const curve = (pts, closed = false, smooth = false) => ({ pts: pts.map((p) => [+p[0], +p[1], +(p[2] ?? 0)]), closed, smooth });
export const CURVES = {
  line: ({ length = 20 }) => curve([[-length / 2, 0], [length / 2, 0]]),
  rectangle: ({ width = 20, height = 12, radius = 0 }) => {
    const w = width / 2, h = height / 2, r = Math.min(radius, w, h);
    if (r <= 0) return curve([[-w, -h], [w, -h], [w, h], [-w, h]], true);
    const pts = [];
    for (const [cx, cy, a0] of [[w - r, -h + r, -Math.PI / 2], [w - r, h - r, 0], [-w + r, h - r, Math.PI / 2], [-w + r, -h + r, Math.PI]])
      for (let i = 0; i <= 8; i++) pts.push([cx + r * Math.cos(a0 + (i / 8) * (Math.PI / 2)), cy + r * Math.sin(a0 + (i / 8) * (Math.PI / 2))]);
    return curve(pts, true);
  },
  polygon: ({ sides = 6, radius = 10, star = 0 }) => {
    const pts = [];
    const n = Math.max(3, Math.round(sides));
    for (let i = 0; i < n * (star > 0 ? 2 : 1); i++) {
      const a = (i / (n * (star > 0 ? 2 : 1))) * TAU + Math.PI / 2;
      const r = star > 0 && i % 2 ? radius * (1 - star) : radius;
      pts.push([r * Math.cos(a), r * Math.sin(a)]);
    }
    return curve(pts, true);
  },
  circle: ({ radius = 10 }) => curve(Array.from({ length: 96 }, (_, i) => [radius * Math.cos((i / 96) * TAU), radius * Math.sin((i / 96) * TAU)]), true),
  ellipse: ({ rx = 12, ry = 7 }) => curve(Array.from({ length: 96 }, (_, i) => [rx * Math.cos((i / 96) * TAU), ry * Math.sin((i / 96) * TAU)]), true),
  arc: ({ radius = 10, angle = 180 }) => {
    const n = Math.max(4, Math.round(angle / 4));
    return curve(Array.from({ length: n + 1 }, (_, i) => {
      const a = Math.PI / 2 - ((angle * Math.PI) / 360) + (i / n) * ((angle * Math.PI) / 180);
      return [radius * Math.cos(a), radius * Math.sin(a)];
    }));
  },
  spiral: ({ r0 = 2, r1 = 10, turns = 3 }) => {
    const n = Math.round(turns * 48);
    return curve(Array.from({ length: n + 1 }, (_, i) => {
      const t = i / n, a = t * turns * TAU, r = lerp(r0, r1, t);
      return [r * Math.cos(a), r * Math.sin(a)];
    }));
  },
  helix: ({ radius = 6, pitch = 3, turns = 4 }) => {
    const n = Math.round(turns * 48);
    return curve(Array.from({ length: n + 1 }, (_, i) => {
      const t = i / n, a = t * turns * TAU;
      return [radius * Math.cos(a), radius * Math.sin(a), t * turns * pitch];
    }));
  },
  wave: ({ length = 30, amplitude = 2, waves = 4 }) => {
    const n = Math.round(waves * 24);
    return curve(Array.from({ length: n + 1 }, (_, i) => [-length / 2 + (i / n) * length, amplitude * Math.sin((i / n) * waves * TAU)]));
  },
};
/** Points along a curve: exact corners for polylines, evenly spaced for interpolated curves. */
export function curvePoints(c, n = 160) {
  // a true NURBS curve (spec 0010) is evaluated exactly; pts then only hold a preview polyline
  if (c.nurbs) {
    const out = [];
    for (let i = 0; i <= n; i++) out.push(V3(...N.curvePoint(c.nurbs, i / n)));
    if (c.closed) out.pop();
    return out;
  }
  const pts = c.pts.map((p) => V3(...p));
  if (!c.smooth || pts.length < 3) return pts;
  const cc = new T.CatmullRomCurve3(pts, c.closed, 'centripetal');
  const out = cc.getSpacedPoints(n);
  if (c.closed) out.pop();
  return out;
}
/** Evenly spaced points by arc length (for loft, flow and arrays). */
export function resample(c, n) {
  const pts = curvePoints(c, Math.max(n * 2, 200));
  const ring = c.closed ? [...pts, pts[0]] : pts;
  const cum = [0];
  for (let i = 1; i < ring.length; i++) cum.push(cum[i - 1] + ring[i].distanceTo(ring[i - 1]));
  const L = cum[cum.length - 1], out = [];
  const m = c.closed ? n : n - 1;
  for (let k = 0; k < n; k++) {
    const s = (k / m) * L;
    let i = cum.findIndex((x) => x >= s);
    if (i <= 0) i = 1;
    const t = (s - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
    out.push(ring[i - 1].clone().lerp(ring[i], t));
  }
  return out;
}
export const curveLength = (c) => {
  const p = curvePoints(c);
  let L = 0;
  for (let i = 1; i < p.length; i++) L += p[i].distanceTo(p[i - 1]);
  return c.closed ? L + p[p.length - 1].distanceTo(p[0]) : L;
};
/** Offset a planar (XY) curve sideways by d (positive = left of the direction of travel). */
export function offsetCurve(c, d) {
  const p = curvePoints(c);
  const n = p.length;
  return curve(p.map((q, i) => {
    const a = p[c.closed ? (i - 1 + n) % n : Math.max(0, i - 1)], b = p[c.closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
    const tx = b.x - a.x, ty = b.y - a.y, l = Math.hypot(tx, ty) || 1;
    return [q.x - (ty / l) * d, q.y + (tx / l) * d, q.z];
  }), c.closed, false);
}
/** Round every corner of a polyline with radius r. */
export function filletCorners(c, r) {
  const p = c.pts.map((q) => V3(...q));
  const n = p.length, out = [];
  for (let i = 0; i < n; i++) {
    if (!c.closed && (i === 0 || i === n - 1)) {
      out.push(p[i]);
      continue;
    }
    const a = p[(i - 1 + n) % n], b = p[i], d = p[(i + 1) % n];
    const u = a.clone().sub(b).normalize(), v = d.clone().sub(b).normalize();
    const ang = Math.acos(Math.max(-1, Math.min(1, u.dot(v))));
    const t = Math.min(r / Math.tan(ang / 2), a.distanceTo(b) / 2, d.distanceTo(b) / 2);
    const p0 = b.clone().addScaledVector(u, t), p1 = b.clone().addScaledVector(v, t);
    for (let k = 0; k <= 6; k++) {
      const s = k / 6; // quadratic Bézier with the corner as control point
      out.push(p0.clone().multiplyScalar((1 - s) ** 2).addScaledVector(b, 2 * s * (1 - s)).addScaledVector(p1, s * s));
    }
  }
  return curve(out.map((q) => [q.x, q.y, q.z]), c.closed, false);
}
const signedArea2 = (pts) => {
  let s = 0;
  for (let i = 0; i < pts.length; i++) s += pts[i].x * pts[(i + 1) % pts.length].y - pts[(i + 1) % pts.length].x * pts[i].y;
  return s / 2;
};

/* ================================================================== surfaces and solids from curves */
/** Extrude a closed curve along +Z; taper shrinks the top (0–0.95); toPoint closes it to an apex. Open curves get a wall. */
export function extrude(c, { height = 3, taper = 0, wall = 0.6, toPoint = false } = {}) {
  let pts = curvePoints(c).map((p) => new T.Vector2(p.x, p.y));
  if (!c.closed) {
    const a = offsetCurve(c, wall / 2), b = offsetCurve(c, -wall / 2);
    pts = [...a.pts.map((p) => new T.Vector2(p[0], p[1])), ...b.pts.reverse().map((p) => new T.Vector2(p[0], p[1]))];
  }
  if (signedArea2(pts) < 0) pts.reverse();
  if (toPoint) {
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length, cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    const pos = [], n = pts.length;
    const tris = T.ShapeUtils.triangulateShape(pts, []);
    for (const [a, b, d] of tris) pos.push(pts[a].x, pts[a].y, 0, pts[d].x, pts[d].y, 0, pts[b].x, pts[b].y, 0);
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      pos.push(a.x, a.y, 0, b.x, b.y, 0, cx, cy, height);
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    return orient(g);
  }
  const g = new T.ExtrudeGeometry(new T.Shape(pts), { depth: height, bevelEnabled: false, curveSegments: 1, steps: 1 });
  if (taper > 0) {
    const p = g.attributes.position;
    const cx = pts.reduce((s, q) => s + q.x, 0) / pts.length, cy = pts.reduce((s, q) => s + q.y, 0) / pts.length;
    for (let i = 0; i < p.count; i++) {
      const k = 1 - Math.min(0.95, taper) * (p.getZ(i) / height);
      p.setXY(i, cx + (p.getX(i) - cx) * k, cy + (p.getY(i) - cy) * k);
    }
  }
  return orient(nonIndexed(g));
}
/** Revolve a profile in the XY plane about the Y axis (x = radius). Closed profiles make solids; open ones are closed to the axis. */
export function revolve(c, { angle = 360, segments = 96 } = {}) {
  let pts = curvePoints(c).map((p) => new T.Vector2(Math.max(0, Math.abs(p.x)), p.y));
  if (!c.closed) {
    // an open profile is closed back along the axis so the result is a solid of revolution
    pts = [new T.Vector2(0, pts[0].y), ...pts, new T.Vector2(0, pts[pts.length - 1].y)];
  }
  pts.push(pts[0].clone());
  const full = angle >= 359.9;
  const g = nonIndexed(clean(new T.LatheGeometry(pts, segments, 0, (Math.min(360, angle) * Math.PI) / 180)));
  if (full) return orient(g);
  const caps = [];
  const prof = pts.slice(0, -1);
  if (Math.abs(signedArea2(prof)) < 1e-9) return orient(g);
  const tris = T.ShapeUtils.triangulateShape(prof, []);
  const a1 = (Math.min(360, angle) * Math.PI) / 180;
  for (const ang of [0, a1]) {
    const pos = [];
    for (const t of tris) for (const k of t) pos.push(prof[k].x * Math.sin(ang), prof[k].y, prof[k].x * Math.cos(ang));
    const cg = new T.BufferGeometry();
    cg.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    caps.push(cg);
  }
  return fixOrientation(merge([g, ...caps]));
}
/** Rotation-minimising frames along points (no flips on straight or planar rails). */
export function rmFrames(pts, closed) {
  const n = pts.length;
  const tan = pts.map((p, i) => {
    const a = pts[closed ? (i - 1 + n) % n : Math.max(0, i - 1)], b = pts[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
    return b.clone().sub(a).normalize();
  });
  let ref = Math.abs(tan[0].z) < 0.9 ? V3(0, 0, 1) : V3(1, 0, 0);
  let nrm = ref.clone().sub(tan[0].clone().multiplyScalar(ref.dot(tan[0]))).normalize();
  const frames = [];
  for (let i = 0; i < n; i++) {
    if (i > 0) {
      // double reflection (Wang et al.)
      const v1 = pts[i].clone().sub(pts[i - 1]), c1 = v1.dot(v1) || 1e-12;
      const rL = nrm.clone().sub(v1.clone().multiplyScalar((2 / c1) * v1.dot(nrm)));
      const tL = tan[i - 1].clone().sub(v1.clone().multiplyScalar((2 / c1) * v1.dot(tan[i - 1])));
      const v2 = tan[i].clone().sub(tL), c2 = v2.dot(v2) || 1e-12;
      nrm = rL.sub(v2.clone().multiplyScalar((2 / c2) * v2.dot(rL))).normalize();
    }
    frames.push({ p: pts[i].clone(), n: nrm.clone(), b: tan[i].clone().cross(nrm).normalize(), t: tan[i] });
  }
  return frames;
}
/** Sweep a closed profile (its XY shape, centred) along a rail; scale may change from start to end. */
export function sweep1(profile, rail, { scale0 = 1, scale1 = 1, twist = 0 } = {}) {
  const pp = profile.pts.length > 64 || profile.smooth ? resample({ ...profile, closed: true }, 64) : curvePoints(profile);
  const cx = pp.reduce((s, p) => s + p.x, 0) / pp.length, cy = pp.reduce((s, p) => s + p.y, 0) / pp.length;
  let prof = pp.map((p) => [p.x - cx, p.y - cy]);
  if (signedArea2(prof.map(([x, y]) => new T.Vector2(x, y))) < 0) prof.reverse();
  const rp = rail.smooth ? curvePoints(rail, 200) : resample(rail, Math.min(240, Math.max(32, rail.pts.length * 6)));
  const frames = rmFrames(rp, rail.closed);
  return sweep(frames, (t) => {
    const k = lerp(scale0, scale1, t), a = twist * t * (Math.PI / 180);
    return prof.map(([u, v]) => [k * (u * Math.cos(a) - v * Math.sin(a)), k * (u * Math.sin(a) + v * Math.cos(a))]);
  }, { closed: rail.closed });
}
/** Sweep along two rails: the profile spans the gap between them and stretches with it. */
export function sweep2(profile, railA, railB, { samples = 120 } = {}) {
  const A = resample(railA, samples), B = resample(railB, samples);
  const pp = curvePoints(profile);
  const xs = pp.map((p) => p.x), x0 = Math.min(...xs), x1 = Math.max(...xs), w = x1 - x0 || 1;
  const cy = pp.reduce((s, p) => s + p.y, 0) / pp.length;
  const frames = A.map((a, i) => {
    const b = B[i], mid = a.clone().add(b).multiplyScalar(0.5);
    const across = b.clone().sub(a);
    const span = across.length() || 1e-6;
    const fwd = (i < A.length - 1 ? A[i + 1].clone().add(B[i + 1]).multiplyScalar(0.5) : mid.clone().add(mid.clone().sub(A[i - 1].clone().add(B[i - 1]).multiplyScalar(0.5)))).sub(mid).normalize();
    const nrm = across.clone().normalize();
    return { p: mid, n: nrm, b: fwd.clone().cross(nrm).normalize(), span };
  });
  const prof = (t) => {
    const f = frames[Math.min(frames.length - 1, Math.round(t * (frames.length - 1)))];
    return pp.map((p) => [((p.x - x0) / w - 0.5) * f.span, p.y - cy]);
  };
  return sweep(frames, prof, { closed: false });
}
/** Loft through closed sections (in order); the ends are capped so the result is a solid. */
export function loft(curves, { samples = 96 } = {}) {
  if (curves.length < 2) throw new Error('حداقل دو منحنی بسته لازم است.');
  const rings = curves.map((c) => {
    const r = resample({ ...c, closed: true }, samples);
    // same winding for every section
    const area = signedArea2(r.map((p) => new T.Vector2(p.x, p.y)));
    return area < 0 ? r.reverse() : r;
  });
  // align each ring's start with the previous ring's start
  for (let k = 1; k < rings.length; k++) {
    let best = 0, bd = Infinity;
    rings[k].forEach((p, i) => {
      const d = p.distanceToSquared(rings[k - 1][0]);
      if (d < bd) (bd = d), (best = i);
    });
    rings[k] = [...rings[k].slice(best), ...rings[k].slice(0, best)];
  }
  const pos = [];
  const push = (a, b, c) => pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  for (let k = 0; k < rings.length - 1; k++)
    for (let i = 0; i < samples; i++) {
      const a = rings[k][i], b = rings[k][(i + 1) % samples], c = rings[k + 1][(i + 1) % samples], d = rings[k + 1][i];
      push(a, b, c);
      push(a, c, d);
    }
  for (const [ring, flip] of [[rings[0], true], [rings[rings.length - 1], false]]) {
    const ctr = ring.reduce((s, p) => s.add(p), V3()).multiplyScalar(1 / ring.length);
    for (let i = 0; i < samples; i++) (flip ? push(ctr, ring[(i + 1) % samples], ring[i]) : push(ctr, ring[i], ring[(i + 1) % samples]));
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  return orient(g);
}
export const pipe = (rail, { r0 = 0.8, r1 = 0.8, sides = 20 } = {}) => {
  const pts = rail.smooth ? curvePoints(rail, 200) : resample(rail, Math.min(240, Math.max(32, rail.pts.length * 6)));
  return pipeVar(pts, (t) => [lerp(r0, r1, t), lerp(r0, r1, t)], { closed: rail.closed, seg: Math.min(400, pts.length * 2), radial: sides });
};
/** A flat plate from a closed curve (Rhino: PlanarSrf + thickness). */
export const cap = (c, { thickness = 1 } = {}) => extrude(c, { height: thickness });

/* ================================================================== solid primitives (closed, mm) */
export const SOLIDS = {
  box: ({ x = 10, y = 6, z = 4 }) => new T.BoxGeometry(x, y, z),
  sphere: ({ r = 5 }) => new T.SphereGeometry(r, 40, 24),
  cylinder: ({ r = 4, h = 8 }) => new T.CylinderGeometry(r, r, h, 64),
  cone: ({ r = 5, h = 8 }) => new T.ConeGeometry(r, h, 64),
  truncatedCone: ({ r0 = 5, r1 = 2, h = 6 }) => new T.CylinderGeometry(r1, r0, h, 64),
  torus: ({ R = 9, r = 1.5 }) => new T.TorusGeometry(R, r, 32, 128),
  ellipsoid: ({ rx = 6, ry = 4, rz = 3 }) => new T.SphereGeometry(1, 40, 24).scale(rx, ry, rz),
  tube: ({ R = 6, r = 4.5, h = 4 }) => new T.LatheGeometry([new T.Vector2(r, -h / 2), new T.Vector2(R, -h / 2), new T.Vector2(R, h / 2), new T.Vector2(r, h / 2), new T.Vector2(r, -h / 2)], 96),
  pyramid: ({ r = 5, h = 7, sides = 4 }) => new T.ConeGeometry(r, h, Math.max(3, Math.round(sides))),
  capsule: ({ r = 3, h = 6 }) => new T.CapsuleGeometry(r, h, 12, 48),
  octahedron: ({ r = 5 }) => new T.OctahedronGeometry(r),
  dodecahedron: ({ r = 5 }) => new T.DodecahedronGeometry(r),
};
export const solid = (k, p) => orient(nonIndexed(clean(SOLIDS[k](p))));

/* ================================================================== booleans: BSP CSG (after Evan Wallace's csg.js) */
const EPS = 1e-5;
class Pl {
  constructor(n, w) {
    this.n = n;
    this.w = w;
  }
  static from(a, b, c) {
    const n = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
    return new Pl(n, n.dot(a));
  }
  flip() {
    this.n.negate();
    this.w = -this.w;
  }
  split(poly, cf, cb, f, b) {
    let type = 0;
    const types = poly.v.map((v) => {
      const t = this.n.dot(v) - this.w;
      const k = t < -EPS ? 2 : t > EPS ? 1 : 0;
      type |= k;
      return k;
    });
    if (type === 0) (this.n.dot(poly.pl.n) > 0 ? cf : cb).push(poly);
    else if (type === 1) f.push(poly);
    else if (type === 2) b.push(poly);
    else {
      const fv = [], bv = [];
      for (let i = 0; i < poly.v.length; i++) {
        const j = (i + 1) % poly.v.length, ti = types[i], tj = types[j], vi = poly.v[i], vj = poly.v[j];
        if (ti !== 2) fv.push(vi);
        if (ti !== 1) bv.push(ti !== 2 ? vi.clone() : vi);
        if ((ti | tj) === 3) {
          const t = (this.w - this.n.dot(vi)) / this.n.dot(vj.clone().sub(vi));
          const v = vi.clone().lerp(vj, t);
          fv.push(v);
          bv.push(v.clone());
        }
      }
      if (fv.length >= 3) f.push(new Po(fv, poly.pl));
      if (bv.length >= 3) b.push(new Po(bv, poly.pl));
    }
  }
}
class Po {
  constructor(v, pl) {
    this.v = v;
    this.pl = pl ?? Pl.from(v[0], v[1], v[2]);
  }
  flip() {
    this.v.reverse();
    this.pl = new Pl(this.pl.n.clone().negate(), -this.pl.w);
  }
}
class Node {
  constructor(polys) {
    this.pl = null;
    this.f = null;
    this.b = null;
    this.polys = [];
    if (polys) this.build(polys);
  }
  invert() {
    const st = [this];
    while (st.length) {
      const n = st.pop();
      n.polys.forEach((p) => p.flip());
      if (n.pl) n.pl = new Pl(n.pl.n.clone().negate(), -n.pl.w);
      [n.f, n.b] = [n.b, n.f];
      if (n.f) st.push(n.f);
      if (n.b) st.push(n.b);
    }
  }
  clipPolygons(polys) {
    // iterative: [node, polygons] work list; polygons that fall behind a leaf are dropped
    const out = [];
    const st = [[this, polys]];
    while (st.length) {
      const [n, ps] = st.pop();
      if (!n.pl) {
        out.push(...ps);
        continue;
      }
      let f = [], b = [];
      for (const p of ps) n.pl.split(p, f, b, f, b);
      if (n.f) st.push([n.f, f]);
      else out.push(...f);
      if (n.b) st.push([n.b, b]);
    }
    return out;
  }
  clipTo(bsp) {
    const st = [this];
    while (st.length) {
      const n = st.pop();
      n.polys = bsp.clipPolygons(n.polys);
      if (n.f) st.push(n.f);
      if (n.b) st.push(n.b);
    }
  }
  all() {
    const out = [], st = [this];
    while (st.length) {
      const n = st.pop();
      out.push(...n.polys);
      if (n.f) st.push(n.f);
      if (n.b) st.push(n.b);
    }
    return out;
  }
  build(polys) {
    const st = [[this, polys]];
    while (st.length) {
      const [n, ps] = st.pop();
      if (!ps.length) continue;
      if (!n.pl) n.pl = pickPlane(ps);
      const f = [], b = [];
      for (const p of ps) n.pl.split(p, n.polys, n.polys, f, b);
      if (f.length) st.push([(n.f ??= new Node()), f]);
      if (b.length) st.push([(n.b ??= new Node()), b]);
    }
  }
}
/** Splitting plane: of a few sampled candidates, the one that cuts the fewest polygons and splits most evenly
 * (the first polygon's plane, as in csg.js, cuts a dense jewellery mesh into hundreds of thousands of pieces). */
function pickPlane(ps) {
  if (ps.length < 8) return new Pl(ps[0].pl.n.clone(), ps[0].pl.w);
  const K = 12, probe = Math.min(ps.length, 200), step = ps.length / probe;
  let best = null, bestScore = Infinity;
  for (let c = 0; c < K; c++) {
    const pl = ps[Math.floor(((c + 0.5) / K) * ps.length)].pl;
    let f = 0, b = 0, sp = 0;
    for (let i = 0; i < probe; i++) {
      let type = 0;
      for (const v of ps[Math.floor(i * step)].v) {
        const t = pl.n.dot(v) - pl.w;
        type |= t < -EPS ? 2 : t > EPS ? 1 : 0;
      }
      if (type === 3) sp++;
      else if (type === 1) f++;
      else if (type === 2) b++;
    }
    const score = sp * 8 + Math.abs(f - b);
    if (score < bestScore) (bestScore = score), (best = pl);
  }
  return new Pl(best.n.clone(), best.w);
}
const polyBox = (p) => {
  const bx = new T.Box3();
  for (const v of p.v) bx.expandByPoint(v);
  return bx;
};
const boxOf = (polys) => {
  const bx = new T.Box3();
  for (const p of polys) for (const v of p.v) bx.expandByPoint(v);
  return bx;
};
/** Ray-parity point-in-solid test (closed mesh); a slightly skewed ray avoids grazing edges. */
function inside(polys, pt) {
  const d = V3(1, 0.000123, 0.000271).normalize(), e1 = V3(), e2 = V3(), h = V3(), s = V3(), q = V3();
  let n = 0;
  for (const p of polys)
    for (let i = 1; i < p.v.length - 1; i++) {
      const a = p.v[0];
      e1.subVectors(p.v[i], a);
      e2.subVectors(p.v[i + 1], a);
      h.crossVectors(d, e2);
      const det = e1.dot(h);
      if (Math.abs(det) < 1e-12) continue;
      s.subVectors(pt, a);
      const u = s.dot(h) / det;
      if (u < 0 || u > 1) continue;
      q.crossVectors(s, e1);
      const w = d.dot(q) / det;
      if (w < 0 || u + w > 1) continue;
      if (e2.dot(q) / det > 1e-9) n++;
    }
  return n % 2 === 1;
}
const toPolys = (geo) => {
  const g = nonIndexed(geo), p = g.attributes.position.array, out = [];
  for (let i = 0; i < p.length; i += 9) {
    const a = V3(p[i], p[i + 1], p[i + 2]), b = V3(p[i + 3], p[i + 4], p[i + 5]), c = V3(p[i + 6], p[i + 7], p[i + 8]);
    if (b.clone().sub(a).cross(c.clone().sub(a)).lengthSq() < 1e-14) continue;
    out.push(new Po([a, b, c]));
  }
  return out;
};
const fromPolys = (polys) => {
  const pos = [];
  for (const p of polys) for (let i = 1; i < p.v.length - 1; i++) for (const v of [p.v[0], p.v[i], p.v[i + 1]]) pos.push(v.x, v.y, v.z);
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  return g;
};
export const MAX_BOOLEAN_TRIS = 60000;
/** op: 'union' | 'difference' | 'intersection'. Geometries in the same (world) space. */
export function boolean(ga, gb, op) {
  const ta = nonIndexed(ga).attributes.position.count / 3, tb = nonIndexed(gb).attributes.position.count / 3;
  if (ta + tb > MAX_BOOLEAN_TRIS) throw new Error(`قطعه‌ها برای بولین زیادی ریزند (${Math.round(ta + tb)} مثلث). اول «کاهش مش» بزنید.`);
  const PA = toPolys(ga), PB = toPolys(gb);
  // Only polygons near the other solid take part; the rest are classified by the bounding box alone
  // (a polygon outside B's box is outside B). This keeps a seat cut in a ring local and fast.
  const boxA = boxOf(PA).expandByScalar(1e-3), boxB = boxOf(PB).expandByScalar(1e-3);
  const Ain = [], Aout = [], Bin = [], Bout = [];
  for (const p of PA) (polyBox(p).intersectsBox(boxB) ? Ain : Aout).push(p);
  for (const p of PB) (polyBox(p).intersectsBox(boxA) ? Bin : Bout).push(p);
  const flipped = (ps) => ps.map((p) => (p = new Po(p.v.map((v) => v.clone()), p.pl), p.flip(), p));
  const done = (ps) => orient(nonIndexed(repairT(fromPolys(ps))));
  const keepOut = { union: [...Aout, ...Bout], difference: Aout, intersection: [] }[op];
  if (!Ain.length || !Bin.length) {
    // the surfaces do not meet: one solid is wholly inside the other, or they are apart
    const bInA = PB.length && Bin.length && inside(PA, PB[0].v[0]);
    const aInB = !bInA && PA.length && Ain.length && inside(PB, PA[0].v[0]);
    if (op === 'union') return done(bInA ? PA : aInB ? PB : [...PA, ...PB]);
    if (op === 'difference') return done(bInA ? [...PA, ...flipped(PB)] : aInB ? [] : PA);
    return done(bInA ? PB : aInB ? PA : []);
  }
  const a = new Node(Ain), b = new Node(Bin);
  if (op === 'union') {
    a.clipTo(b);
    b.clipTo(a);
    b.invert();
    b.clipTo(a);
    b.invert();
    a.build(b.all());
  } else if (op === 'difference') {
    a.invert();
    a.clipTo(b);
    b.clipTo(a);
    b.invert();
    b.clipTo(a);
    b.invert();
    a.build(b.all());
    a.invert();
  } else {
    a.invert();
    b.clipTo(a);
    b.invert();
    a.clipTo(b);
    b.clipTo(a);
    a.build(b.all());
    a.invert();
  }
  return done([...keepOut, ...a.all()]);
}
/** Split: the parts of A inside and outside B (Rhino: BooleanSplit). */
export const split = (ga, gb) => [boolean(ga, gb, 'difference'), boolean(ga, gb, 'intersection')];

/* ================================================================== mesh and SubD tools */
const adjacency = (g) => {
  const idx = g.index.array, n = g.attributes.position.count;
  const nb = Array.from({ length: n }, () => new Set());
  for (let i = 0; i < idx.length; i += 3)
    for (let k = 0; k < 3; k++) {
      const a = idx[i + k], b = idx[i + ((k + 1) % 3)];
      nb[a].add(b);
      nb[b].add(a);
    }
  return nb;
};
const edgeKey = (a, b) => (a < b ? `${a}_${b}` : `${b}_${a}`);
/** Loop subdivision: each triangle → 4, positions smoothed (SubD-like rounding). smooth=false keeps the shape (linear). */
export function subdivide(geo, { levels = 1, smooth = true } = {}) {
  let g = toIndexed(geo);
  for (let L = 0; L < levels; L++) {
    const P = g.attributes.position.array, idx = g.index.array, nv = P.length / 3;
    const v = (i) => V3(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
    const faces = new Map(); // edge → opposite vertices
    for (let i = 0; i < idx.length; i += 3)
      for (let k = 0; k < 3; k++) {
        const a = idx[i + k], b = idx[i + ((k + 1) % 3)], c = idx[i + ((k + 2) % 3)];
        const key = edgeKey(a, b);
        if (!faces.has(key)) faces.set(key, { a, b, opp: [] });
        faces.get(key).opp.push(c);
      }
    const newPos = [];
    const edgeVert = new Map();
    let next = nv;
    for (const [key, e] of faces) {
      let p;
      if (smooth && e.opp.length === 2) p = v(e.a).add(v(e.b)).multiplyScalar(3 / 8).add(v(e.opp[0]).add(v(e.opp[1])).multiplyScalar(1 / 8));
      else p = v(e.a).add(v(e.b)).multiplyScalar(0.5);
      edgeVert.set(key, next++);
      newPos.push(p);
    }
    const nb = adjacency(g);
    const boundary = new Set();
    for (const e of faces.values()) if (e.opp.length < 2) boundary.add(e.a), boundary.add(e.b);
    const old = [];
    for (let i = 0; i < nv; i++) {
      if (!smooth || boundary.has(i)) {
        old.push(v(i));
        continue;
      }
      const n = nb[i].size, beta = n === 3 ? 3 / 16 : 3 / (8 * n);
      const s = V3();
      nb[i].forEach((j) => s.add(v(j)));
      old.push(v(i).multiplyScalar(1 - n * beta).add(s.multiplyScalar(beta)));
    }
    const all = [...old, ...newPos];
    const P2 = new Float32Array(all.length * 3);
    all.forEach((p, i) => P2.set([p.x, p.y, p.z], i * 3));
    const I2 = [];
    for (let i = 0; i < idx.length; i += 3) {
      const a = idx[i], b = idx[i + 1], c = idx[i + 2];
      const ab = edgeVert.get(edgeKey(a, b)), bc = edgeVert.get(edgeKey(b, c)), ca = edgeVert.get(edgeKey(c, a));
      I2.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
    }
    g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(P2, 3));
    g.setIndex(I2);
  }
  return g;
}
/** Taubin smoothing (shrink-free): λ/μ steps. */
export function smoothMesh(geo, { iterations = 4, lambda = 0.5, mu = -0.53 } = {}) {
  const g = toIndexed(geo);
  const P = g.attributes.position.array, nb = adjacency(g);
  const step = (f) => {
    const D = new Float32Array(P.length);
    nb.forEach((set, i) => {
      if (!set.size) return;
      let x = 0, y = 0, z = 0;
      set.forEach((j) => ((x += P[j * 3]), (y += P[j * 3 + 1]), (z += P[j * 3 + 2])));
      D[i * 3] = (x / set.size - P[i * 3]) * f;
      D[i * 3 + 1] = (y / set.size - P[i * 3 + 1]) * f;
      D[i * 3 + 2] = (z / set.size - P[i * 3 + 2]) * f;
    });
    for (let i = 0; i < P.length; i++) P[i] += D[i];
  };
  for (let k = 0; k < iterations; k++) step(lambda), step(mu);
  return g;
}
/** Reduce (vertex clustering on a grid of `cell` mm). */
export function reduceMesh(geo, { cell = 0.3 } = {}) {
  const g = toIndexed(geo);
  const P = g.attributes.position.array, idx = g.index.array;
  const map = new Map(), rep = [], acc = [];
  const id = new Int32Array(P.length / 3);
  for (let i = 0; i < P.length / 3; i++) {
    const k = `${Math.floor(P[i * 3] / cell)},${Math.floor(P[i * 3 + 1] / cell)},${Math.floor(P[i * 3 + 2] / cell)}`;
    let c = map.get(k);
    if (c === undefined) map.set(k, (c = rep.length)), rep.push(0), acc.push([0, 0, 0]);
    id[i] = c;
    rep[c]++;
    acc[c][0] += P[i * 3];
    acc[c][1] += P[i * 3 + 1];
    acc[c][2] += P[i * 3 + 2];
  }
  const NP = new Float32Array(rep.length * 3);
  acc.forEach((a, c) => NP.set([a[0] / rep[c], a[1] / rep[c], a[2] / rep[c]], c * 3));
  const NI = [];
  for (let i = 0; i < idx.length; i += 3) {
    const a = id[idx[i]], b = id[idx[i + 1]], c = id[idx[i + 2]];
    if (a !== b && b !== c && a !== c) NI.push(a, b, c);
  }
  const out = new T.BufferGeometry();
  out.setAttribute('position', new T.BufferAttribute(NP, 3));
  out.setIndex(NI);
  return out;
}
/** Shell / offset mesh: a wall of thickness t inward (closed meshes become hollow; open ones get side walls). */
export function shell(geo, { thickness = 0.6 } = {}) {
  const g = toIndexed(geo);
  g.computeVertexNormals();
  const P = g.attributes.position.array, N = g.attributes.normal.array, idx = Array.from(g.index.array), n = P.length / 3;
  const P2 = new Float32Array(P.length * 2);
  P2.set(P);
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) P2[(n + i) * 3 + k] = P[i * 3 + k] - N[i * 3 + k] * thickness;
  const I = [...idx];
  for (let i = 0; i < idx.length; i += 3) I.push(idx[i] + n, idx[i + 2] + n, idx[i + 1] + n);
  const count = new Map();
  for (let i = 0; i < idx.length; i += 3)
    for (let k = 0; k < 3; k++) {
      const a = idx[i + k], b = idx[i + ((k + 1) % 3)], key = edgeKey(a, b);
      const e = count.get(key);
      count.set(key, e ? { ...e, c: e.c + 1 } : { a, b, c: 1 });
    }
  for (const { a, b, c } of count.values()) if (c === 1) I.push(a, b, b + n, a, b + n, a + n);
  const out = new T.BufferGeometry();
  out.setAttribute('position', new T.BufferAttribute(P2, 3));
  out.setIndex(I);
  return orient(nonIndexed(out));
}
/** Fill holes: every boundary loop gets a fan from its centre (Rhino: FillMeshHoles). */
export function fillHoles(geo) {
  const g = toIndexed(geo);
  const P = g.attributes.position.array, idx = Array.from(g.index.array);
  const count = new Map();
  for (let i = 0; i < idx.length; i += 3)
    for (let k = 0; k < 3; k++) {
      const a = idx[i + k], b = idx[i + ((k + 1) % 3)], key = edgeKey(a, b);
      count.set(key, count.has(key) ? null : [a, b]);
    }
  const nextOf = new Map();
  for (const e of count.values()) if (e) nextOf.set(e[1], e[0]); // boundary edges walked against the face winding
  const pos = Array.from(P), seen = new Set();
  let filled = 0;
  for (const start of nextOf.keys()) {
    if (seen.has(start)) continue;
    const loop = [];
    let v = start;
    while (v !== undefined && !seen.has(v)) (seen.add(v), loop.push(v), (v = nextOf.get(v)));
    if (loop.length < 3) continue;
    const c = loop.reduce((s, i) => s.add(V3(P[i * 3], P[i * 3 + 1], P[i * 3 + 2])), V3()).multiplyScalar(1 / loop.length);
    const ci = pos.length / 3;
    pos.push(c.x, c.y, c.z);
    for (let i = 0; i < loop.length; i++) idx.push(loop[i], loop[(i + 1) % loop.length], ci);
    filled++;
  }
  const out = new T.BufferGeometry();
  out.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  out.setIndex(idx);
  return Object.assign(orient(nonIndexed(out)), { filled });
}
export function flip(geo) {
  const g = nonIndexed(geo).clone(), p = g.attributes.position.array;
  for (let i = 0; i < p.length; i += 9) for (let k = 0; k < 3; k++) [p[i + 3 + k], p[i + 6 + k]] = [p[i + 6 + k], p[i + 3 + k]];
  return g;
}
const fixOrientation = (g) => orient(nonIndexed(g));
export const merge = (geos) => U.mergeGeometries(geos.map((g) => {
  const x = new T.BufferGeometry();
  x.setAttribute('position', nonIndexed(g).attributes.position.clone());
  return x;
}), false);

/* ================================================================== deforms (in the object's own bounding box) */
function deformBy(geo, fn, axis = 'y') {
  const g = nonIndexed(geo).clone();
  g.computeBoundingBox();
  const { min, max } = g.boundingBox;
  const p = g.attributes.position, v = V3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    fn(v, { min, max, L: max.getComponent('xyz'.indexOf(axis)) - min.getComponent('xyz'.indexOf(axis)) || 1 });
    p.setXYZ(i, v.x, v.y, v.z);
  }
  return g;
}
const refined = (geo, refine) => (refine > 0 ? subdivide(geo, { levels: refine, smooth: false }) : geo);
export const DEFORMS = {
  bend: (geo, { angle = 90, refine = 1 }) => {
    const th = (angle * Math.PI) / 180;
    if (Math.abs(th) < 1e-6) return geo;
    return deformBy(refined(geo, refine), (v, { min, L }) => {
      const R = L / th, phi = (v.y - min.y) / R;
      const x = v.x;
      v.x = R - (R - x) * Math.cos(phi);
      v.y = min.y + (R - x) * Math.sin(phi);
    });
  },
  twist: (geo, { angle = 180, refine = 1 }) => deformBy(refined(geo, refine), (v, { min, max, L }) => {
    const cx = (min.x + max.x) / 2, cz = (min.z + max.z) / 2, a = ((angle * Math.PI) / 180) * ((v.y - min.y) / L);
    const x = v.x - cx, z = v.z - cz;
    v.x = cx + x * Math.cos(a) - z * Math.sin(a);
    v.z = cz + x * Math.sin(a) + z * Math.cos(a);
  }),
  taper: (geo, { factor = 0.4, refine = 1 }) => deformBy(refined(geo, refine), (v, { min, max, L }) => {
    const cx = (min.x + max.x) / 2, cz = (min.z + max.z) / 2, k = lerp(1, factor, (v.y - min.y) / L);
    v.x = cx + (v.x - cx) * k;
    v.z = cz + (v.z - cz) * k;
  }),
  shear: (geo, { angle = 20 }) => deformBy(geo, (v, { min }) => (v.x += (v.y - min.y) * Math.tan((angle * Math.PI) / 180))),
  scale1d: (geo, { axis = 'x', factor = 1.5 }) => deformBy(geo, (v, { min, max }) => {
    const k = 'xyz'.indexOf(axis), c = (min.getComponent(k) + max.getComponent(k)) / 2;
    v.setComponent(k, c + (v.getComponent(k) - c) * factor);
  }),
  maelstrom: (geo, { angle = 120, refine = 1 }) => deformBy(refined(geo, refine), (v, { min, max }) => {
    const cx = (min.x + max.x) / 2, cz = (min.z + max.z) / 2, R = Math.max(max.x - min.x, max.z - min.z) / 2 || 1;
    const x = v.x - cx, z = v.z - cz, r = Math.hypot(x, z), a = ((angle * Math.PI) / 180) * Math.max(0, 1 - r / R);
    v.x = cx + x * Math.cos(a) - z * Math.sin(a);
    v.z = cz + x * Math.sin(a) + z * Math.cos(a);
  }),
};
/** Flow along a curve: the object's height (Y) is laid along the curve; X and Z follow the curve's frames. */
export function flowAlong(geo, rail, { refine = 1, stretch = true } = {}) {
  const g = nonIndexed(refined(geo, refine)).clone();
  g.computeBoundingBox();
  const { min, max } = g.boundingBox;
  const pts = resample(rail, 400), fr = rmFrames(pts, rail.closed);
  const cx = (min.x + max.x) / 2, cz = (min.z + max.z) / 2, H = max.y - min.y || 1, L = curveLength(rail);
  const p = g.attributes.position, v = V3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const s = stretch ? (v.y - min.y) / H : Math.min(1, (v.y - min.y) / L);
    const f = fr[Math.min(fr.length - 1, Math.round(s * (fr.length - 1)))];
    const q = f.p.clone().addScaledVector(f.n, v.x - cx).addScaledVector(f.b, v.z - cz);
    p.setXYZ(i, q.x, q.y, q.z);
  }
  return g;
}
/** Copies along a curve, each oriented to the curve (Rhino: ArrayCrv). Returns transforms. */
export function arrayAlong(rail, count) {
  const pts = resample(rail, count), fr = rmFrames(resample(rail, Math.max(count * 4, 64)), rail.closed);
  return pts.map((p, i) => {
    const f = fr[Math.round((i / Math.max(1, count - (rail.closed ? 0 : 1))) * (fr.length - 1)) % fr.length];
    const m = new T.Matrix4().makeBasis(f.n, f.t, f.b);
    const e = new T.Euler().setFromRotationMatrix(m);
    return { pos: [p.x, p.y, p.z], rot: [e.x, e.y, e.z] };
  });
}

/* ================================================================== stone seats (cutters) */
/**
 * A seat cutter for every stone of a gem mesh: the stone's axis is the smallest principal direction of its points
 * (stones are wider than deep) pointing from the culet to the table; the cutter is a cylinder over the girdle, a cone
 * for the pavilion and a light hole under the culet. World coordinates in, world coordinates out.
 */
export function seatCutters(gemMesh, { clearance = 0.05, hole = 0.45 } = {}) {
  gemMesh.updateWorldMatrix(true, false);
  return J.componentPoints(gemMesh.geometry).map((arr) => {
    const pts = [];
    for (let i = 0; i < arr.length; i += 3) pts.push(V3(arr[i], arr[i + 1], arr[i + 2]).applyMatrix4(gemMesh.matrixWorld));
    const c = pts.reduce((s, q) => s.add(q), V3()).multiplyScalar(1 / pts.length);
    // covariance → smallest-variance axis by power iteration on (trace·I − C)
    let xx = 0, xy = 0, xz = 0, yy = 0, yz = 0, zz = 0;
    for (const q of pts) {
      const d = q.clone().sub(c);
      (xx += d.x * d.x), (xy += d.x * d.y), (xz += d.x * d.z), (yy += d.y * d.y), (yz += d.y * d.z), (zz += d.z * d.z);
    }
    const tr = xx + yy + zz;
    let ax = V3(0.3, 1, 0.2).normalize();
    for (let k = 0; k < 60; k++) ax = V3((tr - xx) * ax.x - xy * ax.y - xz * ax.z, -xy * ax.x + (tr - yy) * ax.y - yz * ax.z, -xz * ax.x - yz * ax.y + (tr - zz) * ax.z).normalize();
    // the culet is the farthest point along the axis: the table faces the other way
    let lo = Infinity, hi = -Infinity, far = 0;
    for (const q of pts) {
      const t = q.clone().sub(c).dot(ax);
      lo = Math.min(lo, t);
      hi = Math.max(hi, t);
    }
    if (Math.abs(lo) > Math.abs(hi)) far = lo;
    else (ax.negate(), (far = -hi));
    // girdle: the widest section — the mean axial position of the points at the full radius
    let r = 0;
    const rad = pts.map((q) => {
      const d = q.clone().sub(c);
      const rr = d.clone().sub(ax.clone().multiplyScalar(d.dot(ax))).length();
      r = Math.max(r, rr);
      return [rr, d.dot(ax)];
    });
    const rim = rad.filter(([rr]) => rr > r * 0.97);
    const tg = rim.reduce((s2, [, t]) => s2 + t, 0) / (rim.length || 1);
    const girdle = c.clone().addScaledVector(ax, tg);
    const depth = Math.abs(far - tg) + 0.2;
    const top = nonIndexed(new T.CylinderGeometry(r + clearance, r + clearance, 3, 32));
    top.translate(0, 1.5 - 0.05, 0);
    const cone = nonIndexed(new T.ConeGeometry(r + clearance, depth, 32));
    cone.rotateX(Math.PI);
    cone.translate(0, -depth / 2, 0);
    let g = boolean(top, cone, 'union');
    if (hole > 0) {
      const h = nonIndexed(new T.CylinderGeometry(r * hole, r * hole, depth + 4, 20));
      h.translate(0, -(depth + 4) / 2 + 0.2, 0);
      g = boolean(g, h, 'union');
    }
    const q = new T.Quaternion().setFromUnitVectors(V3(0, 1, 0), ax);
    const m = new T.Matrix4().compose(girdle, q, V3(1, 1, 1));
    return nonIndexed(g).applyMatrix4(m);
  });
}

/* ================================================================== analysis */
export function analyze(geo) {
  const g = nonIndexed(geo);
  g.computeBoundingBox();
  const s = g.boundingBox.getSize(V3());
  const idx = toIndexed(g), edges = new Map(), I = idx.index.array;
  for (let i = 0; i < I.length; i += 3) for (let k = 0; k < 3; k++) {
    const key = edgeKey(I[i + k], I[i + ((k + 1) % 3)]);
    edges.set(key, (edges.get(key) ?? 0) + 1);
  }
  let naked = 0, nonManifold = 0;
  for (const c of edges.values()) c === 1 ? naked++ : c > 2 && nonManifold++;
  return { volume: Math.abs(signedVolume(g)), area: surfaceArea(g), size: [s.x, s.y, s.z], triangles: g.attributes.position.count / 3, closed: naked === 0, naked, nonManifold };
}

/* ================================================================== part types: free curves and free solids */
const curveLine = (c) => {
  if (c.nurbs && !N.checkCurve(c.nurbs)) delete c.nurbs;
  const pts = curvePoints(c, 200);
  const g = new T.BufferGeometry().setFromPoints(c.closed ? [...pts, pts[0]] : pts);
  const line = new T.Line(g, undefined);
  line.userData = { role: 'curve' };
  return line;
};
PIECES.curve = {
  label: 'منحنی',
  params: {},
  opts: { data: '' },
  noMetal: true,
  free: true,
  build: (p) => [curveLine(JSON.parse(p.data || '{"pts":[[0,0,0],[10,0,0]]}'))],
};
PIECES.mesh = {
  label: 'جسم آزاد',
  params: {},
  opts: { geo: '' },
  free: true,
  build: (p) => [M(p.geo ? decodeGeo(p.geo) : finish(solid('box', {})), 'metal')],
};
PIECES.meshGem = {
  label: 'سنگ آزاد',
  params: {},
  opts: { geo: '', gem: 'diamond' },
  noMetal: true,
  free: true,
  build: (p) => [M(p.geo ? decodeGeo(p.geo) : finish(solid('octahedron', {})), 'gem', { stone: 'free' })],
};
