// Distance-field operations on solids (spec 0010): rolling-ball fillets of convex edges (opening), of
// concave corners (closing), and offsets — exact in the Euclidean sense at the grid resolution. A mesh is
// voxelised by ray parity, measured with an exact Euclidean distance transform (Felzenszwalb–Huttenlocher),
// changed, and turned back into a closed mesh by surface nets on the signed distance. Pure; tested in Node.

/** Inside/outside of a closed mesh on a grid (cell centres), by counting crossings along +z per column. */
export function voxelize(position, index, { min, max }, res) {
  const ext = [0, 1, 2].map((k) => max[k] - min[k]), vox = Math.max(...ext) / res;
  const dims = ext.map((e) => Math.max(1, Math.ceil(e / vox)));
  const [nx, ny, nz] = dims, occ = new Uint8Array(nx * ny * nz);
  // bucket triangles by the columns their xy box covers
  const buckets = new Map();
  const tris = index.length / 3;
  for (let t = 0; t < tris; t++) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let k = 0; k < 3; k++) {
      const v = index[t * 3 + k] * 3;
      (x0 = Math.min(x0, position[v])), (x1 = Math.max(x1, position[v])), (y0 = Math.min(y0, position[v + 1])), (y1 = Math.max(y1, position[v + 1]));
    }
    const i0 = Math.max(0, Math.floor((x0 - min[0]) / vox - 0.5)), i1 = Math.min(nx - 1, Math.ceil((x1 - min[0]) / vox - 0.5)), j0 = Math.max(0, Math.floor((y0 - min[1]) / vox - 0.5)), j1 = Math.min(ny - 1, Math.ceil((y1 - min[1]) / vox - 0.5));
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const key = j * nx + i;
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(t);
      }
  }
  const zs = [];
  for (const [key, list] of buckets) {
    const i = key % nx, j = (key / nx) | 0;
    // a tiny irrational offset keeps rays off vertices and edges
    const px = min[0] + (i + 0.5) * vox + vox * 1.3e-4, py = min[1] + (j + 0.5) * vox + vox * 2.7e-4;
    zs.length = 0;
    for (const t of list) {
      const a = index[t * 3] * 3, b = index[t * 3 + 1] * 3, c = index[t * 3 + 2] * 3;
      const ax = position[a] - px, ay = position[a + 1] - py, bx = position[b] - px, by = position[b + 1] - py, cx = position[c] - px, cy = position[c + 1] - py;
      // barycentric test in xy
      const w0 = bx * cy - by * cx, w1 = cx * ay - cy * ax, w2 = ax * by - ay * bx;
      if ((w0 < 0 || w1 < 0 || w2 < 0) && (w0 > 0 || w1 > 0 || w2 > 0)) continue;
      const s = w0 + w1 + w2;
      if (!s) continue;
      zs.push((w0 * position[a + 2] + w1 * position[b + 2] + w2 * position[c + 2]) / s);
    }
    if (zs.length < 2) continue;
    zs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < zs.length; k += 2) {
      const k0 = Math.max(0, Math.ceil((zs[k] - min[2]) / vox - 0.5)), k1 = Math.min(nz - 1, Math.floor((zs[k + 1] - min[2]) / vox - 0.5));
      for (let kk = k0; kk <= k1; kk++) occ[(kk * ny + j) * nx + i] = 1;
    }
  }
  return { occ, dims, vox, min: [...min] };
}

/** 1-D squared distance transform (lower envelope of parabolas). */
function edt1(f, n, d, v, z) {
  let k = 0;
  v[0] = 0;
  z[0] = -Infinity;
  z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s;
    for (;;) {
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      if (s <= z[k]) k--;
      else break;
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    d[q] = (q - v[k]) ** 2 + f[v[k]];
  }
}
/** Squared Euclidean distance (in voxels) from every cell to the nearest cell where target[i] is set. */
export function edt(target, [nx, ny, nz]) {
  const INF = 1e20, D = new Float32Array(nx * ny * nz); // float32 halves memory; squared voxel distances are exact integers
  for (let i = 0; i < D.length; i++) D[i] = target[i] ? 0 : INF;
  const m = Math.max(nx, ny, nz), f = new Float64Array(m), d = new Float64Array(m), v = new Int32Array(m), z = new Float64Array(m + 1);
  for (let k = 0; k < nz; k++)
    for (let j = 0; j < ny; j++) {
      const o = (k * ny + j) * nx;
      for (let i = 0; i < nx; i++) f[i] = D[o + i];
      edt1(f, nx, d, v, z);
      for (let i = 0; i < nx; i++) D[o + i] = d[i];
    }
  for (let k = 0; k < nz; k++)
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < ny; j++) f[j] = D[(k * ny + j) * nx + i];
      edt1(f, ny, d, v, z);
      for (let j = 0; j < ny; j++) D[(k * ny + j) * nx + i] = d[j];
    }
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      for (let k = 0; k < nz; k++) f[k] = D[(k * ny + j) * nx + i];
      edt1(f, nz, d, v, z);
      for (let k = 0; k < nz; k++) D[(k * ny + j) * nx + i] = d[k];
    }
  return D;
}
/** Signed distance in mm (positive inside) of a voxelised solid. */
export function signedDistance({ occ, dims, vox }) {
  const out = new Uint8Array(occ.length);
  for (let i = 0; i < occ.length; i++) out[i] = occ[i] ? 0 : 1;
  const dIn = edt(out, dims), dOut = edt(occ, dims), S = new Float32Array(occ.length);
  // boundary at half a voxel between an inside and an outside cell
  for (let i = 0; i < occ.length; i++) S[i] = occ[i] ? (Math.sqrt(dIn[i]) - 0.5) * vox : -(Math.sqrt(dOut[i]) - 0.5) * vox;
  return S;
}
/** Squared distance from p to triangle abc (Ericson, closest point on triangle). */
function triDist2(px, py, pz, P, a, b, c) {
  const ax = P[a], ay = P[a + 1], az = P[a + 2], abx = P[b] - ax, aby = P[b + 1] - ay, abz = P[b + 2] - az, acx = P[c] - ax, acy = P[c + 1] - ay, acz = P[c + 2] - az;
  const apx = px - ax, apy = py - ay, apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
  const sq = (x, y, z) => x * x + y * y + z * z;
  if (d1 <= 0 && d2 <= 0) return sq(apx, apy, apz);
  const bpx = px - P[b], bpy = py - P[b + 1], bpz = pz - P[b + 2], d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) return sq(bpx, bpy, bpz);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    return sq(apx - v * abx, apy - v * aby, apz - v * abz);
  }
  const cpx = px - P[c], cpy = py - P[c + 1], cpz = pz - P[c + 2], d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) return sq(cpx, cpy, cpz);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    return sq(apx - w * acx, apy - w * acy, apz - w * acz);
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
    return sq(px - (P[b] + w * (P[c] - P[b])), py - (P[b + 1] + w * (P[c + 1] - P[b + 1])), pz - (P[b + 2] + w * (P[c + 2] - P[b + 2])));
  }
  const den = 1 / (va + vb + vc), v = vb * den, w = vc * den;
  return sq(apx - abx * v - acx * w, apy - aby * v - acy * w, apz - abz * v - acz * w);
}
/**
 * Exact signed distance (mm, positive inside) for the cells within `band` cells of the surface; other cells
 * keep the voxel estimate. Triangles are hashed in blocks of 2 cells so each cell checks only its neighbours.
 */
export function exactBand(position, index, grid, S, band = 2.5) {
  const { dims: [nx, ny, nz], vox, min, occ } = grid, h = 2 * vox, reach = band * vox;
  const key = (i, j, k) => `${i},${j},${k}`, hash = new Map();
  for (let t = 0; t < index.length; t += 3) {
    const a = index[t] * 3, b = index[t + 1] * 3, c = index[t + 2] * 3;
    const lo = [0, 1, 2].map((d) => Math.floor((Math.min(position[a + d], position[b + d], position[c + d]) - reach - min[d]) / h));
    const hi = [0, 1, 2].map((d) => Math.floor((Math.max(position[a + d], position[b + d], position[c + d]) + reach - min[d]) / h));
    for (let k = lo[2]; k <= hi[2]; k++)
      for (let j = lo[1]; j <= hi[1]; j++)
        for (let i = lo[0]; i <= hi[0]; i++) {
          const kk = key(i, j, k);
          if (!hash.has(kk)) hash.set(kk, []);
          hash.get(kk).push(a, b, c);
        }
  }
  const out = Float32Array.from(S);
  for (let k = 0; k < nz; k++)
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const id = (k * ny + j) * nx + i;
        if (Math.abs(S[id]) > reach) continue;
        const px = min[0] + (i + 0.5) * vox, py = min[1] + (j + 0.5) * vox, pz = min[2] + (k + 0.5) * vox;
        const list = hash.get(key(Math.floor((px - min[0]) / h), Math.floor((py - min[1]) / h), Math.floor((pz - min[2]) / h)));
        if (!list) continue;
        let best = Infinity;
        for (let t = 0; t < list.length; t += 3) best = Math.min(best, triDist2(px, py, pz, position, list[t], list[t + 1], list[t + 2]));
        if (best < Infinity) out[id] = occ[id] ? Math.sqrt(best) : -Math.sqrt(best);
      }
  return out;
}
/**
 * Rolling-ball operations on a solid (signed distances in mm):
 *  - 'fillet' (opening): convex edges rounded with radius r, nothing grows
 *  - 'filletInner' (closing): concave corners filled with radius r
 *  - 'offset': the surface moved outward by r (negative r: inward)
 * Returns a scalar field (positive inside) for surfaceNetsField.
 */
export function rollingBall(grid, op, r, exact = null) {
  const { occ, dims, vox } = grid, rv = r / vox;
  const S = signedDistance(grid), SE = exact ? exact(S) : S;
  if (op === 'offset') return SE.map((s) => s + r);
  if (op === 'fillet') {
    // erode by r, then grow back by r: the result is the union of all balls of radius r inside the solid
    const core = new Uint8Array(occ.length);
    for (let i = 0; i < occ.length; i++) core[i] = S[i] > r ? 1 : 0;
    const d = edt(core, dims), F = new Float32Array(occ.length);
    // the balls reach up to a cell beyond the core's centres; never outside the solid itself, whose exact
    // distance keeps flat faces where they were (only edges and corners are rounded)
    for (let i = 0; i < occ.length; i++) F[i] = Math.min((rv + 0.5 - Math.sqrt(d[i])) * vox, SE[i]);
    return F;
  }
  if (op === 'filletInner') {
    // grow by r, then erode by r: concave corners are filled by balls rolling outside
    const grown = new Uint8Array(occ.length);
    for (let i = 0; i < occ.length; i++) grown[i] = S[i] > -r ? 0 : 1; // grown[i] = 1 where outside the grown solid
    const d = edt(grown, dims), F = new Float32Array(occ.length);
    for (let i = 0; i < occ.length; i++) F[i] = Math.max((Math.sqrt(d[i]) - rv - 1) * vox, SE[i]);
    return F;
  }
  throw new Error(op);
}
/** Surface nets on a scalar field (inside where field > iso), padded outside; closed mesh in mm, outward winding. */
export function surfaceNetsField(field, [nx, ny, nz], vox, min, iso = 0) {
  const X = nx + 2, Y = ny + 2, Z = nz + 2, OUT = -1e9;
  const g = new Float32Array(X * Y * Z).fill(OUT);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) g[((k + 1) * Y + j + 1) * X + i + 1] = field[(k * ny + j) * nx + i] - iso;
  const val = (i, j, k) => g[(k * Y + j) * X + i];
  const vid = new Int32Array(X * Y * Z).fill(-1), pos = [];
  const C = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const E = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  for (let k = 0; k < Z - 1; k++)
    for (let j = 0; j < Y - 1; j++)
      for (let i = 0; i < X - 1; i++) {
        const vs = C.map(([a, b, c]) => val(i + a, j + b, k + c));
        let ins = 0;
        for (const v of vs) if (v > 0) ins++;
        if (!ins || ins === 8) continue;
        let sx = 0, sy = 0, sz = 0, n = 0;
        for (const [a, b] of E) {
          const va = vs[a], vb = vs[b];
          if (va > 0 === vb > 0) continue;
          // the padding value is huge: clamp the crossing to the middle of a padded edge
          const t = va < -1e8 || vb < -1e8 ? 0.5 : va / (va - vb);
          sx += C[a][0] + (C[b][0] - C[a][0]) * t;
          sy += C[a][1] + (C[b][1] - C[a][1]) * t;
          sz += C[a][2] + (C[b][2] - C[a][2]) * t;
          n++;
        }
        vid[(k * Y + j) * X + i] = pos.length / 3;
        pos.push(min[0] + (i + sx / n - 0.5) * vox, min[1] + (j + sy / n - 0.5) * vox, min[2] + (k + sz / n - 0.5) * vox);
      }
  const idx = [], cell = (i, j, k) => vid[(k * Y + j) * X + i];
  const quad = (a, b, c, d, flip) => (flip ? idx.push(a, c, b, a, d, c) : idx.push(a, b, c, a, c, d));
  for (let k = 0; k < Z - 1; k++)
    for (let j = 0; j < Y - 1; j++)
      for (let i = 0; i < X - 1; i++) {
        const v0 = val(i, j, k) > 0;
        if (j > 0 && k > 0 && v0 !== val(i + 1, j, k) > 0) quad(cell(i, j - 1, k - 1), cell(i, j, k - 1), cell(i, j, k), cell(i, j - 1, k), !v0);
        if (i > 0 && k > 0 && v0 !== val(i, j + 1, k) > 0) quad(cell(i - 1, j, k - 1), cell(i - 1, j, k), cell(i, j, k), cell(i, j, k - 1), !v0);
        if (i > 0 && j > 0 && v0 !== val(i, j, k + 1) > 0) quad(cell(i - 1, j - 1, k), cell(i, j - 1, k), cell(i, j, k), cell(i - 1, j, k), !v0);
      }
  return { position: new Float32Array(pos), index: new Uint32Array(idx) };
}
/** Grid box around a mesh with room for an outward offset. */
export function boxAround(position, pad) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < position.length; i += 3) for (let k = 0; k < 3; k++) (min[k] = Math.min(min[k], position[i + k])), (max[k] = Math.max(max[k], position[i + k]));
  return { min: min.map((v) => v - pad), max: max.map((v) => v + pad) };
}
/** One call: mesh in, rounded/offset closed mesh out. res = cells on the longest side. */
export function remeshDistance(position, index, op, r, res = 160) {
  const b0 = boxAround(position, 0), ext = Math.max(...[0, 1, 2].map((k) => b0.max[k] - b0.min[k]));
  const grow = Math.max(0, op === 'offset' || op === 'filletInner' ? r : 0), vox = (ext + 2 * grow) / res;
  const box = boxAround(position, grow + 3 * vox); // empty cells all round so every distance sees the outside
  const grid = voxelize(position, index, box, res);
  // exact distances near the original surface (and, for small offsets, out to the offset surface)
  const band = op === 'offset' ? Math.min(12, Math.abs(r) / grid.vox + 2.5) : 2.5;
  const F = rollingBall(grid, op, r, (S) => exactBand(position, index, grid, S, band));
  return { ...surfaceNetsField(F, grid.dims, grid.vox, grid.min, 0), vox: grid.vox };
}
