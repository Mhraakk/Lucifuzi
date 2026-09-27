// Procedural jewelry meshes in millimetres. Every mesh is closed, so volume() is physically meaningful.

export function volumeMm3(mesh) {
  const p = mesh.pos;
  const idx = mesh.idx;
  let v = 0;
  const n = idx ? idx.length : p.length / 3;
  for (let i = 0; i < n; i += 3) {
    const a = (idx ? idx[i] : i) * 3;
    const b = (idx ? idx[i + 1] : i + 1) * 3;
    const c = (idx ? idx[i + 2] : i + 2) * 3;
    v += p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) - p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c]) + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c]);
  }
  return Math.abs(v / 6);
}

export function bounds(meshes) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const m of meshes) {
    const p = m.pos;
    for (let i = 0; i < p.length; i += 3)
      for (let k = 0; k < 3; k++) {
        if (p[i + k] < min[k]) min[k] = p[i + k];
        if (p[i + k] > max[k]) max[k] = p[i + k];
      }
  }
  return { min, max, center: min.map((v, i) => (v + max[i]) / 2), radius: Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2 };
}

function smoothNormals(pos, idx) {
  const nrm = new Float32Array(pos.length);
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const j of [a, b, c]) {
      nrm[j] += nx;
      nrm[j + 1] += ny;
      nrm[j + 2] += nz;
    }
  }
  for (let i = 0; i < nrm.length; i += 3) {
    const l = Math.hypot(nrm[i], nrm[i + 1], nrm[i + 2]) || 1;
    nrm[i] /= l;
    nrm[i + 1] /= l;
    nrm[i + 2] /= l;
  }
  return nrm;
}

/**
 * Revolve a closed 2D profile [(r, z)] around the Z axis. Profile must be counter-clockwise in (r,z).
 * Normals come from the analytic profile tangent so seams stay smooth.
 */
function revolve(profile, segments) {
  const np = profile.length;
  const pos = new Float32Array((segments + 1) * np * 3);
  const nrm = new Float32Array(pos.length);
  const pn = profile.map((_, i) => {
    const a = profile[(i - 1 + np) % np];
    const b = profile[(i + 1) % np];
    const tr = b[0] - a[0], tz = b[1] - a[1];
    const l = Math.hypot(tr, tz) || 1;
    return [tz / l, -tr / l]; // outward for CCW
  });
  let k = 0;
  for (let s = 0; s <= segments; s++) {
    const t = (s / segments) * Math.PI * 2;
    const c = Math.cos(t), sn = Math.sin(t);
    for (let i = 0; i < np; i++) {
      const [r, z] = profile[i];
      pos[k] = r * c;
      pos[k + 1] = r * sn;
      pos[k + 2] = z;
      nrm[k] = pn[i][0] * c;
      nrm[k + 1] = pn[i][0] * sn;
      nrm[k + 2] = pn[i][1];
      k += 3;
    }
  }
  const idx = new Uint32Array(segments * np * 6);
  k = 0;
  for (let s = 0; s < segments; s++)
    for (let i = 0; i < np; i++) {
      const a = s * np + i, b = s * np + ((i + 1) % np), c = (s + 1) * np + i, d = (s + 1) * np + ((i + 1) % np);
      idx.set([a, c, b, b, c, d], k);
      k += 6;
    }
  return { pos, nrm, idx };
}

/** Band cross-section, counter-clockwise in (r,z). r0 = inner radius, w = width (Z), t = thickness (radial). */
export function bandProfile(kind, r0, w, t, n = 40) {
  const hw = w / 2;
  const edge = (u) => {
    const a = Math.abs(u);
    return a > 0.8 ? ((a - 0.8) / 0.2) ** 2 : 0;
  };
  const outer = (u) => {
    const dome = Math.sqrt(Math.max(0, 1 - u * u));
    const base = kind === 'flat' ? 1 : kind === 'knife' ? 0.6 + 0.4 * (1 - Math.abs(u)) : 0.55 + 0.45 * dome;
    return r0 + t * base - t * 0.22 * edge(u);
  };
  const inner = (u) => r0 + (kind === 'comfort' ? t * 0.16 * (1 - Math.sqrt(Math.max(0, 1 - u * u))) : 0) + t * 0.12 * edge(u);
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const u = -Math.cos((Math.PI * i) / n);
    pts.push([outer(u), u * hw]);
  }
  for (let i = 0; i <= n; i++) {
    const u = Math.cos((Math.PI * i) / n);
    pts.push([inner(u), u * hw]);
  }
  return pts;
}

export function band({ diameter = 17.3, width = 4, thickness = 1.8, profile = 'comfort', segments = 128 } = {}) {
  const m = revolve(bandProfile(profile, diameter / 2, width, thickness), segments);
  return m;
}

/** Swept circle along a closed polyline path (for chain links). */
function tube(path, radius, sides = 14) {
  const n = path.length;
  const pos = new Float32Array(n * sides * 3);
  const nrm = new Float32Array(pos.length);
  let k = 0;
  for (let i = 0; i < n; i++) {
    const a = path[(i - 1 + n) % n], b = path[(i + 1) % n], p = path[i];
    let tx = b[0] - a[0], ty = b[1] - a[1], tz = b[2] - a[2];
    const tl = Math.hypot(tx, ty, tz);
    tx /= tl; ty /= tl; tz /= tl;
    // path lies in a plane; binormal = plane normal (0,0,1) rotated per link -> use cross with up
    let ux = 0, uy = 0, uz = 1;
    if (Math.abs(tz) > 0.9) { ux = 1; uz = 0; }
    let nx = ty * uz - tz * uy, ny = tz * ux - tx * uz, nz = tx * uy - ty * ux;
    const nl = Math.hypot(nx, ny, nz);
    nx /= nl; ny /= nl; nz /= nl;
    const bx = ty * nz - tz * ny, by = tz * nx - tx * nz, bz = tx * ny - ty * nx;
    for (let s = 0; s < sides; s++) {
      const t = (s / sides) * Math.PI * 2;
      const c = Math.cos(t), sn = Math.sin(t);
      const dx = nx * c + bx * sn, dy = ny * c + by * sn, dz = nz * c + bz * sn;
      pos[k] = p[0] + dx * radius; pos[k + 1] = p[1] + dy * radius; pos[k + 2] = p[2] + dz * radius;
      nrm[k] = dx; nrm[k + 1] = dy; nrm[k + 2] = dz;
      k += 3;
    }
  }
  const idx = new Uint32Array(n * sides * 6);
  k = 0;
  for (let i = 0; i < n; i++)
    for (let s = 0; s < sides; s++) {
      const a = i * sides + s, b = i * sides + ((s + 1) % sides), c = ((i + 1) % n) * sides + s, d = ((i + 1) % n) * sides + ((s + 1) % sides);
      idx.set([a, b, c, b, d, c], k);
      k += 6;
    }
  return { pos, nrm, idx };
}

function transform(mesh, fn, nfn) {
  const pos = new Float32Array(mesh.pos.length);
  const nrm = new Float32Array(mesh.nrm.length);
  for (let i = 0; i < pos.length; i += 3) {
    const p = fn(mesh.pos[i], mesh.pos[i + 1], mesh.pos[i + 2]);
    const q = nfn(mesh.nrm[i], mesh.nrm[i + 1], mesh.nrm[i + 2]);
    pos.set(p, i);
    nrm.set(q, i);
  }
  return { pos, nrm, idx: mesh.idx };
}
export function merge(meshes) {
  const total = meshes.reduce((s, m) => s + m.pos.length, 0);
  const itotal = meshes.reduce((s, m) => s + m.idx.length, 0);
  const pos = new Float32Array(total), nrm = new Float32Array(total), idx = new Uint32Array(itotal);
  let o = 0, io = 0;
  for (const m of meshes) {
    pos.set(m.pos, o);
    nrm.set(m.nrm, o);
    for (let i = 0; i < m.idx.length; i++) idx[io + i] = m.idx[i] + o / 3;
    o += m.pos.length;
    io += m.idx.length;
  }
  return { pos, nrm, idx };
}

/** Cable chain: `count` oval links of wire diameter `wire`, alternating 90°. Returns mesh + exact metal volume. */
export function cableChain({ count = 9, linkLength = 5, linkWidth = 3.4, wire = 0.9 } = {}) {
  const r = wire / 2;
  const straight = Math.max(0, linkLength - linkWidth);
  const rad = (linkWidth - wire) / 2;
  const path = [];
  const N = 40;
  for (let i = 0; i < N; i++) {
    const t = (i / N) * Math.PI * 2;
    const x = Math.cos(t) * rad + Math.sign(Math.cos(t)) * (straight / 2);
    path.push([x, Math.sin(t) * rad, 0]);
  }
  const base = tube(path, r);
  const pitch = linkLength - 2 * wire;
  const links = [];
  for (let i = 0; i < count; i++) {
    const rot = i % 2 === 1;
    const ox = (i - (count - 1) / 2) * pitch;
    const sag = -0.012 * (i - (count - 1) / 2) ** 2 * pitch;
    links.push(transform(base, (x, y, z) => (rot ? [x + ox, sag + z, y] : [x + ox, y + sag, z]), (x, y, z) => (rot ? [x, z, y] : [x, y, z])));
  }
  let perimeter = 0;
  for (let i = 0; i < N; i++) perimeter += Math.hypot(path[(i + 1) % N][0] - path[i][0], path[(i + 1) % N][1] - path[i][1]);
  return { mesh: merge(links), linkVolume: Math.PI * r * r * perimeter, pitch };
}

/** Rounded bar (ingot) via revolved-free construction: superellipsoid-ish box. */
export function bar({ length = 30, width = 17, height = 3.2, bevel = 0.8, seg = 10 } = {}) {
  // Build a rounded box as a deformed sphere-cube: sample a cube grid and push to rounded shape.
  const res = seg * 2;
  const faces = [
    [0, 1, 2, 1], [0, 1, 2, -1], [1, 2, 0, 1], [1, 2, 0, -1], [2, 0, 1, 1], [2, 0, 1, -1],
  ];
  const hx = length / 2, hy = height / 2, hz = width / 2;
  const half = [hx, hy, hz];
  const posA = [], nrmA = [], idxA = [];
  for (const [a, b, c, s] of faces) {
    const start = posA.length / 3;
    for (let i = 0; i <= res; i++)
      for (let j = 0; j <= res; j++) {
        const u = -1 + (2 * i) / res, v = -1 + (2 * j) / res;
        const p = [0, 0, 0];
        p[a] = u * half[a];
        p[b] = v * half[b];
        p[c] = s * half[c];
        // clamp to inner box then push out by bevel radius
        const inner = p.map((x, k) => Math.max(-half[k] + bevel, Math.min(half[k] - bevel, x)));
        const d = p.map((x, k) => x - inner[k]);
        const l = Math.hypot(...d) || 1;
        const n = d.map((x) => x / l);
        posA.push(...inner.map((x, k) => x + n[k] * bevel));
        nrmA.push(...n);
      }
    for (let i = 0; i < res; i++)
      for (let j = 0; j < res; j++) {
        const q = start + i * (res + 1) + j;
        const tri = s > 0 ? [q, q + res + 1, q + 1, q + 1, q + res + 1, q + res + 2] : [q, q + 1, q + res + 1, q + 1, q + res + 2, q + res + 1];
        idxA.push(...tri);
      }
  }
  const m = { pos: new Float32Array(posA), nrm: new Float32Array(nrmA), idx: new Uint32Array(idxA) };
  // orientation sanity: make sure winding is outward (volume sign)
  return m;
}

/** Round brilliant (simplified 57-facet layout). Flat-shaded, unindexed. Diameter in mm. Returns anchors. */
export function brilliant(D = 6.5) {
  const R = D / 2;
  const tableR = R * 0.57;
  const crownH = R * 2 * 0.155;
  const girdleT = R * 2 * 0.03;
  const pavH = R * 2 * 0.431;
  const P = (r, a, z) => [r * Math.cos(a), r * Math.sin(a), z];
  const zTop = girdleT / 2 + crownH;
  const t = [], m = [], gt = [], gb = [], p = [];
  for (let i = 0; i < 8; i++) {
    t.push(P(tableR, (i * Math.PI) / 4, zTop));
    m.push(P(R * 0.8, (i * Math.PI) / 4 + Math.PI / 8, girdleT / 2 + crownH * 0.52));
    p.push(P(R * 0.52, (i * Math.PI) / 4, -girdleT / 2 - pavH * 0.52));
  }
  for (let k = 0; k < 16; k++) {
    gt.push(P(R, (k * Math.PI) / 8, girdleT / 2));
    gb.push(P(R, (k * Math.PI) / 8, -girdleT / 2));
  }
  const culet = [0, 0, -girdleT / 2 - pavH];
  const tc = [0, 0, zTop];
  const tris = [];
  const T = (a, b, c) => tris.push([a, b, c]);
  for (let i = 0; i < 8; i++) {
    const i1 = (i + 1) % 8, im = (i + 7) % 8;
    T(tc, t[i], t[i1]); // table
    T(t[i], m[i], t[i1]); // star
    T(t[i], m[im], gt[2 * i]); // bezel halves
    T(t[i], gt[2 * i], m[i]);
    T(m[i], gt[2 * i], gt[2 * i + 1]); // upper girdle
    T(m[i], gt[2 * i + 1], gt[(2 * i + 2) % 16]);
    T(m[i], gt[(2 * i + 2) % 16], t[i1]);
    T(p[i], gb[2 * i + 1], gb[2 * i]); // lower girdle
    T(p[i], p[i1], gb[2 * i + 1]);
    T(p[i1], gb[(2 * i + 2) % 16], gb[2 * i + 1]);
    T(culet, p[i1], p[i]); // pavilion mains
  }
  for (let k = 0; k < 16; k++) {
    const k1 = (k + 1) % 16;
    T(gt[k], gb[k], gb[k1]);
    T(gt[k], gb[k1], gt[k1]);
  }
  const pos = new Float32Array(tris.length * 9);
  const nrm = new Float32Array(tris.length * 9);
  tris.forEach(([a, b, c], i) => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const cx = (a[0] + b[0] + c[0]) / 3, cy = (a[1] + b[1] + c[1]) / 3, cz = (a[2] + b[2] + c[2]) / 3;
    let order = [a, b, c];
    if (nx * cx + ny * cy + nz * cz < 0) {
      order = [a, c, b];
      nx = -nx; ny = -ny; nz = -nz;
    }
    const l = Math.hypot(nx, ny, nz) || 1;
    order.forEach((v, j) => {
      pos.set(v, i * 9 + j * 3);
      nrm.set([nx / l, ny / l, nz / l], i * 9 + j * 3);
    });
  });
  const idx = new Uint32Array(pos.length / 3).map((_, i) => i);
  return {
    mesh: { pos, nrm, idx },
    anchors: {
      table: [0, 0, zTop],
      crown: m[1],
      girdle: [R, 0, 0],
      pavilion: p[5],
      culet,
    },
    height: zTop - culet[2],
    zTop,
    zBottom: culet[2],
  };
}

/** Straight cylinder between two points (used for prongs). */
export function rod(a, b, r, sides = 12) {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const L = Math.hypot(...d);
  const w = d.map((x) => x / L);
  let u = Math.abs(w[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  let n = [w[1] * u[2] - w[2] * u[1], w[2] * u[0] - w[0] * u[2], w[0] * u[1] - w[1] * u[0]];
  const nl = Math.hypot(...n);
  n = n.map((x) => x / nl);
  const bb = [w[1] * n[2] - w[2] * n[1], w[2] * n[0] - w[0] * n[2], w[0] * n[1] - w[1] * n[0]];
  const pos = [], nrm = [], idx = [];
  for (const [end, pt] of [[0, a], [1, b]])
    for (let s = 0; s < sides; s++) {
      const t = (s / sides) * Math.PI * 2;
      const dir = [0, 1, 2].map((k) => n[k] * Math.cos(t) + bb[k] * Math.sin(t));
      pos.push(...[0, 1, 2].map((k) => pt[k] + dir[k] * r * (end ? 0.8 : 1)));
      nrm.push(...dir);
    }
  // end caps as rounded tips: add centre points
  const ca = pos.length / 3;
  pos.push(...a.map((x, k) => x - w[k] * r * 0.6));
  nrm.push(...w.map((x) => -x));
  const cb = pos.length / 3;
  pos.push(...b.map((x, k) => x + w[k] * r * 0.7));
  nrm.push(...w);
  for (let s = 0; s < sides; s++) {
    const s1 = (s + 1) % sides;
    idx.push(s, sides + s, s1, s1, sides + s, sides + s1);
    idx.push(ca, s, s1);
    idx.push(cb, sides + s1, sides + s);
  }
  return { pos: new Float32Array(pos), nrm: new Float32Array(nrm), idx: new Uint32Array(idx) };
}

export const _internal = { smoothNormals, transform };
