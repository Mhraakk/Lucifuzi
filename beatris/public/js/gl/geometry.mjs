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
