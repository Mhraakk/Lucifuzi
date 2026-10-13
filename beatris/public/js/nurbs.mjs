// NURBS (spec 0010): exact rational B-spline curves and surfaces as in a NURBS CAD package — evaluation by
// de Boor (Piegl & Tiller A2.1–A4.3), global interpolation, knot insertion, degree-preserving rebuild,
// loft (skinning), edge surface (Coons), network (Gordon), offset solids and an IGES 5.3 writer (entities
// 126/128) so curves and surfaces open as true NURBS in other CAD software. Pure, no DOM, tested in Node.

/* ================================================================== basics */
/** Clamped uniform knot vector for n+1 control points of degree p. */
export function clampedKnots(n, p) {
  const m = n + p + 1, U = [];
  for (let i = 0; i <= m; i++) U.push(i <= p ? 0 : i >= m - p ? 1 : (i - p) / (m - 2 * p));
  return U;
}
export function findSpan(n, p, u, U) {
  if (u >= U[n + 1]) return n;
  if (u <= U[p]) return p;
  let lo = p, hi = n + 1, mid = (lo + hi) >> 1;
  while (u < U[mid] || u >= U[mid + 1]) {
    if (u < U[mid]) hi = mid;
    else lo = mid;
    mid = (lo + hi) >> 1;
  }
  return mid;
}
export function basisFuns(i, u, p, U) {
  const N = [1], left = [], right = [];
  for (let j = 1; j <= p; j++) {
    left[j] = u - U[i + 1 - j];
    right[j] = U[i + j] - u;
    let saved = 0;
    for (let r = 0; r < j; r++) {
      const tmp = N[r] / (right[r + 1] + left[j - r] || 1e-300);
      N[r] = saved + right[r + 1] * tmp;
      saved = left[j - r] * tmp;
    }
    N[j] = saved;
  }
  return N;
}
/** A curve from a file is untrusted: degree, counts, monotone knots and finite numbers are checked. */
export function checkCurve(c) {
  if (!c || !Number.isInteger(c.p) || c.p < 1 || c.p > 11 || !Array.isArray(c.P) || !Array.isArray(c.U)) return false;
  const n = c.P.length;
  if (n <= c.p || n > 5000 || c.U.length !== n + c.p + 1) return false;
  for (let i = 1; i < c.U.length; i++) if (!(c.U[i] >= c.U[i - 1]) || !Number.isFinite(c.U[i])) return false;
  if (!c.P.every((v) => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite))) return false;
  return !c.W || (c.W.length === n && c.W.every((w) => w > 0 && Number.isFinite(w)));
}
/** Curve { p, U, P: [[x,y,z]], W?: [w] }. */
export function curvePoint(c, u) {
  const n = c.P.length - 1, s = findSpan(n, c.p, u, c.U), N = basisFuns(s, u, c.p, c.U);
  let x = 0, y = 0, z = 0, w = 0;
  for (let j = 0; j <= c.p; j++) {
    const k = s - c.p + j, wk = c.W ? c.W[k] : 1, b = N[j] * wk;
    x += b * c.P[k][0];
    y += b * c.P[k][1];
    z += b * c.P[k][2];
    w += b;
  }
  return [x / w, y / w, z / w];
}
export function curveTangent(c, u, h = 1e-5) {
  const a = curvePoint(c, Math.max(0, u - h)), b = curvePoint(c, Math.min(1, u + h)), d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], l = Math.hypot(...d) || 1;
  return d.map((v) => v / l);
}
export const sampleCurve = (c, n = 64) => Array.from({ length: n + 1 }, (_, i) => curvePoint(c, i / n));
export function curveLength(c, n = 400) {
  let L = 0, a = curvePoint(c, 0);
  for (let i = 1; i <= n; i++) {
    const b = curvePoint(c, i / n);
    L += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    a = b;
  }
  return L;
}
/** Exact circle as a rational quadratic NURBS (9 control points, Rhino's own representation). */
export function circle(r = 1, [cx, cy, cz] = [0, 0, 0]) {
  const w = Math.SQRT1_2, P = [], W = [];
  const pts = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1], [1, 0]];
  pts.forEach(([x, y], i) => (P.push([cx + r * x, cy + r * y, cz]), W.push(i % 2 ? w : 1)));
  return { p: 2, U: [0, 0, 0, 0.25, 0.25, 0.5, 0.5, 0.75, 0.75, 1, 1, 1], P, W, closed: true };
}
/** A control-point curve (Rhino "Curve"): degree p clamped through the first and last point. */
export function fromControlPoints(P, p = 3) {
  const q = Math.min(p, P.length - 1);
  return { p: q, U: clampedKnots(P.length - 1, q), P: P.map((v) => [...v]) };
}

/* ================================================================== linear algebra */
function solve(A, B) {
  // Gaussian elimination with partial pivoting; B is n × k
  const n = A.length, k = B[0].length, M = A.map((r, i) => [...r, ...B[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    [M[c], M[piv]] = [M[piv], M[c]];
    const d = M[c][c];
    if (Math.abs(d) < 1e-14) throw new Error('singular');
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / d;
      if (f) for (let j = c; j < n + k; j++) M[r][j] -= f * M[c][j];
    }
  }
  return M.map((r, i) => r.slice(n).map((v) => v / M[i][i]));
}

/* ================================================================== interpolation */
/** Chord-length parameters of points. */
export function chordParams(Q) {
  const d = [0];
  for (let i = 1; i < Q.length; i++) d.push(d[i - 1] + Math.hypot(Q[i][0] - Q[i - 1][0], Q[i][1] - Q[i - 1][1], Q[i][2] - Q[i - 1][2]));
  const L = d[d.length - 1] || 1;
  return d.map((v) => v / L);
}
const averagedKnots = (t, p) => {
  const n = t.length - 1, U = [];
  for (let i = 0; i <= p; i++) U.push(0);
  for (let j = 1; j <= n - p; j++) {
    let s = 0;
    for (let i = j; i < j + p; i++) s += t[i];
    U.push(s / p);
  }
  for (let i = 0; i <= p; i++) U.push(1);
  return U;
};
/** Global interpolation (Rhino InterpCrv): the curve passes exactly through every point. */
export function interpolate(Q, p = 3, t = chordParams(Q)) {
  const n = Q.length - 1, q = Math.min(p, n);
  const U = averagedKnots(t, q);
  const A = Array.from({ length: n + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= n; i++) {
    const s = findSpan(n, q, t[i], U), N = basisFuns(s, t[i], q, U);
    for (let j = 0; j <= q; j++) A[i][s - q + j] = N[j];
  }
  return { p: q, U, P: solve(A, Q.map((v) => [...v])) };
}
/** Rebuild (Rhino Rebuild): same shape with `count` control points of degree p. */
export function rebuild(c, count, p = 3) {
  const Q = sampleCurve(c, Math.max(count * 4, 40)), t = chordParams(Q);
  // least squares fit with clamped uniform knots
  const n = count - 1, U = clampedKnots(n, p), m = Q.length;
  const N = Q.map((_, i) => {
    const row = new Array(n + 1).fill(0), s = findSpan(n, p, t[i], U), b = basisFuns(s, t[i], p, U);
    for (let j = 0; j <= p; j++) row[s - p + j] = b[j];
    return row;
  });
  // ends fixed: solve the normal equations for the interior points
  const P = Array.from({ length: n + 1 }, () => [0, 0, 0]);
  P[0] = [...Q[0]];
  P[n] = [...Q[m - 1]];
  if (n >= 2) {
    const k = n - 1, A = Array.from({ length: k }, () => new Array(k).fill(0)), B = Array.from({ length: k }, () => [0, 0, 0]);
    for (let i = 1; i < m - 1; i++) {
      const R = [0, 1, 2].map((d) => Q[i][d] - N[i][0] * Q[0][d] - N[i][n] * Q[m - 1][d]);
      for (let a = 1; a < n; a++) {
        if (!N[i][a]) continue;
        for (let b = 1; b < n; b++) A[a - 1][b - 1] += N[i][a] * N[i][b];
        for (let d = 0; d < 3; d++) B[a - 1][d] += N[i][a] * R[d];
      }
    }
    for (let a = 0; a < k; a++) A[a][a] += 1e-12;
    solve(A, B).forEach((v, i) => (P[i + 1] = v));
  }
  return { p, U, P };
}
/** Knot insertion (Boehm, A5.1): the same curve with one more control point. */
export function insertKnot(c, u) {
  const n = c.P.length - 1, p = c.p, k = findSpan(n, p, u, c.U);
  const Pw = c.P.map((v, i) => {
    const w = c.W ? c.W[i] : 1;
    return [v[0] * w, v[1] * w, v[2] * w, w];
  });
  const Q = [];
  for (let i = 0; i <= n + 1; i++) {
    if (i <= k - p) Q.push(Pw[i]);
    else if (i > k) Q.push(Pw[i - 1]);
    else {
      const a = (u - c.U[i]) / (c.U[i + p] - c.U[i]);
      Q.push(Pw[i].map((v, d) => a * v + (1 - a) * Pw[i - 1][d]));
    }
  }
  const U = [...c.U.slice(0, k + 1), u, ...c.U.slice(k + 1)];
  return { p, U, P: Q.map((q) => [q[0] / q[3], q[1] / q[3], q[2] / q[3]]), ...(c.W ? { W: Q.map((q) => q[3]) } : {}) };
}

/* ================================================================== surfaces */
/** Surface { p, q, U, V, P: [row u][col v] = [x,y,z], W? }. */
export function surfacePoint(s, u, v) {
  const n = s.P.length - 1, m = s.P[0].length - 1;
  const su = findSpan(n, s.p, u, s.U), sv = findSpan(m, s.q, v, s.V), Nu = basisFuns(su, u, s.p, s.U), Nv = basisFuns(sv, v, s.q, s.V);
  let x = 0, y = 0, z = 0, w = 0;
  for (let a = 0; a <= s.p; a++)
    for (let b = 0; b <= s.q; b++) {
      const i = su - s.p + a, j = sv - s.q + b, wt = s.W ? s.W[i][j] : 1, f = Nu[a] * Nv[b] * wt;
      x += f * s.P[i][j][0];
      y += f * s.P[i][j][1];
      z += f * s.P[i][j][2];
      w += f;
    }
  return [x / w, y / w, z / w];
}
/** Interpolating surface through a grid Q[i][j] (Rhino-style fit): exact at every grid point. */
export function interpolateSurface(Q, p = 3, q = 3) {
  const nu = Q.length, nv = Q[0].length;
  // parameters: averages of the chord parameters of all rows / columns
  const avg = (lists) => lists[0].map((_, k) => lists.reduce((s, l) => s + l[k], 0) / lists.length);
  const tu = avg(Array.from({ length: nv }, (_, j) => chordParams(Q.map((r) => r[j])))), tv = avg(Q.map((r) => chordParams(r)));
  const rows = Q.map((r) => interpolate(r, q, tv)); // along v
  const pu = Math.min(p, nu - 1);
  const cols = rows[0].P.map((_, j) => interpolate(rows.map((r) => r.P[j]), pu, tu));
  return { p: pu, q: rows[0].p, U: cols[0].U, V: rows[0].U, P: cols[0].P.map((_, i) => cols.map((c) => c.P[i])) };
}
/** Loft (skinning) through section curves: sections are sampled to a common point count and interpolated. */
export function loft(curves, { samples = 32, p = 3 } = {}) {
  const grid = curves.map((c) => sampleCurve(c, samples));
  return interpolateSurface(grid, Math.min(p, curves.length - 1), 3);
}
/** Edge surface (Rhino EdgeSrf): bilinearly blended Coons patch from 4 boundary curves, fitted as NURBS. */
export function edgeSurface(c0, c1, d0, d1, n = 16) {
  // c0(u) bottom, c1(u) top, d0(v) left, d1(v) right; directions are made to agree
  const P00 = curvePoint(c0, 0), P10 = curvePoint(c0, 1), P01 = curvePoint(c1, 0), P11 = curvePoint(c1, 1);
  const Q = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n, row = [];
    for (let j = 0; j <= n; j++) {
      const v = j / n, a = curvePoint(c0, u), b = curvePoint(c1, u), c = curvePoint(d0, v), d = curvePoint(d1, v);
      row.push([0, 1, 2].map((k) => (1 - v) * a[k] + v * b[k] + (1 - u) * c[k] + u * d[k] - ((1 - u) * (1 - v) * P00[k] + u * (1 - v) * P10[k] + (1 - u) * v * P01[k] + u * v * P11[k])));
    }
    Q.push(row);
  }
  return interpolateSurface(Q);
}
/** Network surface (Rhino NetworkSrf): Gordon surface from u-curves and v-curves that cross each other. */
export function networkSurface(us, vs, n = 24) {
  // intersections: for each pair, the closest pair of samples
  const S = 200, su = us.map((c) => sampleCurve(c, S)), sv = vs.map((c) => sampleCurve(c, S));
  const X = us.map((_, i) =>
    vs.map((_, j) => {
      let best = Infinity, at = null;
      for (let a = 0; a <= S; a++)
        for (let b = 0; b <= S; b++) {
          const d = (su[i][a][0] - sv[j][b][0]) ** 2 + (su[i][a][1] - sv[j][b][1]) ** 2 + (su[i][a][2] - sv[j][b][2]) ** 2;
          if (d < best) (best = d), (at = [0, 1, 2].map((k) => (su[i][a][k] + sv[j][b][k]) / 2));
        }
      return at;
    }),
  );
  const Lu = loft(us, { samples: n }), Lv = loft(vs, { samples: n }), T = interpolateSurface(X, Math.min(3, us.length - 1), Math.min(3, vs.length - 1));
  const Q = [];
  for (let i = 0; i <= n; i++) {
    const row = [];
    for (let j = 0; j <= n; j++) {
      const u = i / n, v = j / n, a = surfacePoint(Lv, v, u), b = surfacePoint(Lu, u, v), t = surfacePoint(T, u, v);
      row.push([0, 1, 2].map((k) => a[k] + b[k] - t[k]));
    }
    Q.push(row);
  }
  return interpolateSurface(Q);
}
/** Surface from 4 corner points (Rhino SrfPt), bilinear degree 1. */
export const srfPt = (a, b, c, d) => ({ p: 1, q: 1, U: [0, 0, 1, 1], V: [0, 0, 1, 1], P: [[a, d], [b, c]] });

/* ================================================================== tessellation and solids */
/** Mesh of a surface: positions (Float32Array) and indices; normals by finite differences. */
export function tessellate(s, nu = 48, nv = 48) {
  const pos = new Float32Array((nu + 1) * (nv + 1) * 3), idx = [];
  for (let i = 0; i <= nu; i++)
    for (let j = 0; j <= nv; j++) pos.set(surfacePoint(s, i / nu, j / nv), (i * (nv + 1) + j) * 3);
  for (let i = 0; i < nu; i++)
    for (let j = 0; j < nv; j++) {
      const a = i * (nv + 1) + j, b = a + nv + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  return { position: pos, index: new Uint32Array(idx), nu, nv };
}
function gridNormals(pos, nu, nv) {
  const N = new Float32Array(pos.length), at = (i, j) => (Math.min(nu, Math.max(0, i)) * (nv + 1) + Math.min(nv, Math.max(0, j))) * 3;
  for (let i = 0; i <= nu; i++)
    for (let j = 0; j <= nv; j++) {
      const a = at(i + 1, j), b = at(i - 1, j), c = at(i, j + 1), d = at(i, j - 1);
      const du = [pos[a] - pos[b], pos[a + 1] - pos[b + 1], pos[a + 2] - pos[b + 2]], dv = [pos[c] - pos[d], pos[c + 1] - pos[d + 1], pos[c + 2] - pos[d + 2]];
      const n = [du[1] * dv[2] - du[2] * dv[1], du[2] * dv[0] - du[0] * dv[2], du[0] * dv[1] - du[1] * dv[0]], l = Math.hypot(...n) || 1;
      N.set(n.map((v) => v / l), at(i, j));
    }
  return N;
}
/**
 * Thicken a surface into a closed solid (Rhino OffsetSrf with Solid): the surface and its offset by
 * `thickness` along the normal, stitched along the four borders. Returns an indexed mesh (outward winding
 * when thickness > 0 offsets to the back of the normal).
 */
export function thicken(s, thickness = 1, nu = 48, nv = 48) {
  const t = tessellate(s, nu, nv), N = gridNormals(t.position, nu, nv), cnt = (nu + 1) * (nv + 1);
  const pos = new Float32Array(cnt * 6);
  pos.set(t.position);
  for (let k = 0; k < cnt * 3; k++) pos[cnt * 3 + k] = t.position[k] - N[k] * thickness;
  const idx = [];
  for (let i = 0; i < nu; i++)
    for (let j = 0; j < nv; j++) {
      const a = i * (nv + 1) + j, b = a + nv + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1); // front
      idx.push(cnt + a, cnt + a + 1, cnt + b, cnt + a + 1, cnt + b + 1, cnt + b); // back (reversed)
    }
  // borders: walk the boundary of the (u, v) grid in order and stitch front to back
  const ring = [];
  for (let j = 0; j < nv; j++) ring.push(j); // i = 0
  for (let i = 0; i < nu; i++) ring.push(i * (nv + 1) + nv); // j = nv
  for (let j = nv; j > 0; j--) ring.push(nu * (nv + 1) + j); // i = nu
  for (let i = nu; i > 0; i--) ring.push(i * (nv + 1)); // j = 0
  for (let k = 0; k < ring.length; k++) {
    const a = ring[k], b = ring[(k + 1) % ring.length];
    idx.push(a, b, cnt + a, b, cnt + b, cnt + a);
  }
  return { position: pos, index: new Uint32Array(idx) };
}

/* ================================================================== IGES 5.3 writer */
const igesNum = (v) => {
  if (Number.isInteger(v)) return String(v);
  const s = v.toExponential(12).replace('e', 'D');
  return s;
};
/**
 * IGES file with NURBS curves (type 126) and surfaces (type 128), millimetres. items: [{ curve } | { surface }].
 */
export function toIGES(items, { name = 'beatris', author = 'Beatris studio' } = {}) {
  const S = [`${name} — NURBS from Beatris studio (spec 0010)`];
  const now = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15).replace('T', '.');
  const hs = (t) => `${t.length}H${t}`;
  const G = ['1H,', '1H;', hs(name), hs(`${name}.igs`), hs('Beatris'), hs('Beatris'), '32', '308', '15', '308', '15', hs(name), '1.0', '2', hs('MM'), '1', '0.01', hs(now), '0.0001', '1000.0', hs(author), hs('Beatris'), '11', '0', hs(now)].join(',') + ';';
  const D = [], P = [];
  const params = [];
  for (const it of items) {
    if (it.curve) {
      const c = it.curve, K = c.P.length - 1, M = c.p;
      const W = c.W ?? c.P.map(() => 1), planar = c.P.every((v) => Math.abs(v[2] - c.P[0][2]) < 1e-9) ? 1 : 0;
      const rational = c.W && c.W.some((w) => Math.abs(w - 1) > 1e-12) ? 0 : 1;
      params.push({ type: 126, list: [126, K, M, planar, c.closed ? 1 : 0, rational, 0, ...c.U, ...W, ...c.P.flat(), c.U[0], c.U[c.U.length - 1], 0, 0, 1] });
    } else if (it.surface) {
      const s = it.surface, K1 = s.P.length - 1, K2 = s.P[0].length - 1;
      const W = [], pts = [];
      // IGES orders control points with the first index (u) varying fastest
      for (let j = 0; j <= K2; j++)
        for (let i = 0; i <= K1; i++) {
          W.push(s.W ? s.W[i][j] : 1);
          pts.push(...s.P[i][j]);
        }
      params.push({ type: 128, list: [128, K1, K2, s.p, s.q, 0, 0, s.W ? 0 : 1, 0, 0, ...s.U, ...s.V, ...W, ...pts, s.U[0], s.U[s.U.length - 1], s.V[0], s.V[s.V.length - 1]] });
    }
  }
  const pad = (s, n) => s.padEnd(n).slice(0, n);
  const num8 = (v) => String(v).padStart(8);
  let pLine = 1;
  params.forEach((e, k) => {
    const dLine = 2 * k + 1;
    // parameter data: free format, 64 columns, then the D pointer
    const text = e.list.map((v) => (typeof v === 'number' ? igesNum(v) : v)).join(',') + ';';
    const lines = [];
    let cur = '';
    for (const tok of text.split(/(?<=[,;])/)) {
      if ((cur + tok).length > 64) (lines.push(cur), (cur = ''));
      cur += tok;
    }
    if (cur) lines.push(cur);
    const start = pLine;
    for (const l of lines) P.push(`${pad(l, 64)}${num8(dLine)}P${String(pLine++).padStart(7)}`);
    D.push(`${num8(e.type)}${num8(start)}${num8(0)}${num8(0)}${num8(0)}${num8(0)}${num8(0)}${num8(0)}${'00000000'}D${String(dLine).padStart(7)}`);
    D.push(`${num8(e.type)}${num8(0)}${num8(0)}${num8(lines.length)}${num8(0)}${' '.repeat(8)}${' '.repeat(8)}${pad('NURBS', 8)}${num8(0)}D${String(dLine + 1).padStart(7)}`);
  });
  const block = (arr, letter) => {
    const out = [];
    let i = 1;
    for (const s of arr) {
      for (let k = 0; k < Math.max(1, Math.ceil(s.length / 72)); k++) out.push(`${pad(s.slice(k * 72, k * 72 + 72), 72)}${letter}${String(i++).padStart(7)}`);
    }
    return out;
  };
  const Sl = block(S, 'S'), Gl = block([G], 'G');
  const T = `${'S' + String(Sl.length).padStart(7)}${'G' + String(Gl.length).padStart(7)}${'D' + String(D.length).padStart(7)}${'P' + String(P.length).padStart(7)}`;
  return [...Sl, ...Gl, ...D, ...P, `${pad(T, 72)}T${String(1).padStart(7)}`].join('\n') + '\n';
}
/** Parse the NURBS entities of an IGES file written by toIGES (round-trip check). */
export function parseIGES(text) {
  const lines = text.split('\n').filter(Boolean);
  const P = lines.filter((l) => l[72] === 'P');
  const byEntity = new Map();
  for (const l of P) {
    const d = Number(l.slice(64, 72));
    byEntity.set(d, (byEntity.get(d) ?? '') + l.slice(0, 64));
  }
  const out = [];
  for (const s of byEntity.values()) {
    const v = s.replace(/;.*$/, '').split(',').map((x) => Number(x.trim().replace('D', 'e')));
    if (v[0] === 126) {
      const K = v[1], M = v[2], nK = K + M + 2, U = v.slice(7, 7 + nK), W = v.slice(7 + nK, 7 + nK + K + 1), pts = v.slice(7 + nK + K + 1, 7 + nK + K + 1 + 3 * (K + 1));
      out.push({ curve: { p: M, U, W, P: Array.from({ length: K + 1 }, (_, i) => pts.slice(i * 3, i * 3 + 3)) } });
    } else if (v[0] === 128) {
      const [, K1, K2, M1, M2] = v, a = 10, nU = K1 + M1 + 2, nV = K2 + M2 + 2, U = v.slice(a, a + nU), V = v.slice(a + nU, a + nU + nV), nW = (K1 + 1) * (K2 + 1), b = a + nU + nV, W = v.slice(b, b + nW), pts = v.slice(b + nW, b + nW + 3 * nW);
      const Pg = Array.from({ length: K1 + 1 }, (_, i) => Array.from({ length: K2 + 1 }, (_, j) => pts.slice((j * (K1 + 1) + i) * 3, (j * (K1 + 1) + i) * 3 + 3)));
      const Wg = Array.from({ length: K1 + 1 }, (_, i) => Array.from({ length: K2 + 1 }, (_, j) => W[j * (K1 + 1) + i]));
      out.push({ surface: { p: M1, q: M2, U, V, P: Pg, W: Wg } });
    }
  }
  return out;
}
