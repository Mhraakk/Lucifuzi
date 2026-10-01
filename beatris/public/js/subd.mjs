// SubD (spec 0010): a control cage of polygons refined by Catmull–Clark toward a smooth limit surface, with
// sharp (creased) edges, as in a NURBS package's SubD objects. Pure; tested in Node.
// cage = { v: [[x,y,z]], f: [[i,j,k,l,…]], crease?: ["a_b", …] } (edge keys with a < b)

const key = (a, b) => (a < b ? `${a}_${b}` : `${b}_${a}`);

/** One Catmull–Clark step. Every face becomes quads; creased edges stay creased (subdivided in two). */
export function catmullClark({ v, f, crease = [] }) {
  const sharp = new Set(crease), nv = v.length;
  const facePt = f.map((face) => {
    const p = [0, 0, 0];
    for (const i of face) for (let k = 0; k < 3; k++) p[k] += v[i][k] / face.length;
    return p;
  });
  const edges = new Map(); // key → { a, b, faces: [] }
  f.forEach((face, fi) =>
    face.forEach((a, k) => {
      const b = face[(k + 1) % face.length], kk = key(a, b);
      if (!edges.has(kk)) edges.set(kk, { a, b, faces: [] });
      edges.get(kk).faces.push(fi);
    }),
  );
  const out = v.map((p) => [...p]);
  const edgeIdx = new Map();
  for (const [kk, e] of edges) {
    const mid = [0, 1, 2].map((k) => (v[e.a][k] + v[e.b][k]) / 2);
    let p = mid;
    if (e.faces.length === 2 && !sharp.has(kk)) p = [0, 1, 2].map((k) => (v[e.a][k] + v[e.b][k] + facePt[e.faces[0]][k] + facePt[e.faces[1]][k]) / 4);
    edgeIdx.set(kk, out.length);
    out.push(p);
  }
  // vertex rules
  const vFaces = Array.from({ length: nv }, () => []), vEdges = Array.from({ length: nv }, () => []);
  f.forEach((face, fi) => face.forEach((i) => vFaces[i].push(fi)));
  for (const [kk, e] of edges) (vEdges[e.a].push(kk), vEdges[e.b].push(kk));
  for (let i = 0; i < nv; i++) {
    const es = vEdges[i];
    const hard = es.filter((kk) => sharp.has(kk) || edges.get(kk).faces.length < 2);
    if (hard.length >= 3) continue; // corner: stays
    if (hard.length === 2) {
      // crease or open boundary: 1/8 · neighbour + 6/8 · self + 1/8 · neighbour
      const nb = hard.map((kk) => {
        const e = edges.get(kk);
        return v[e.a === i ? e.b : e.a];
      });
      out[i] = [0, 1, 2].map((k) => 0.75 * v[i][k] + 0.125 * (nb[0][k] + nb[1][k]));
      continue;
    }
    const n = vFaces[i].length;
    if (!n) continue;
    const F = [0, 0, 0], R = [0, 0, 0];
    for (const fi of vFaces[i]) for (let k = 0; k < 3; k++) F[k] += facePt[fi][k] / n;
    for (const kk of es) {
      const e = edges.get(kk);
      for (let k = 0; k < 3; k++) R[k] += (v[e.a][k] + v[e.b][k]) / 2 / es.length;
    }
    out[i] = [0, 1, 2].map((k) => (F[k] + 2 * R[k] + (n - 3) * v[i][k]) / n);
  }
  const faceIdx = facePt.map((p) => (out.push(p), out.length - 1));
  const nf = [], nc = [];
  f.forEach((face, fi) =>
    face.forEach((a, k) => {
      const b = face[(k + 1) % face.length], prev = face[(k - 1 + face.length) % face.length];
      nf.push([a, edgeIdx.get(key(a, b)), faceIdx[fi], edgeIdx.get(key(prev, a))]);
    }),
  );
  for (const kk of sharp) {
    if (!edges.has(kk)) continue;
    const e = edges.get(kk), m = edgeIdx.get(kk);
    nc.push(key(e.a, m), key(m, e.b));
  }
  return { v: out, f: nf, crease: nc };
}
/** Limit-like mesh: `levels` steps, then triangles. */
export function subdivide(cage, levels = 3) {
  let c = cage;
  for (let i = 0; i < levels; i++) c = catmullClark(c);
  return toTriangles(c);
}
export function toTriangles({ v, f }) {
  const position = new Float32Array(v.flat()), idx = [];
  for (const face of f) for (let k = 1; k < face.length - 1; k++) idx.push(face[0], face[k], face[k + 1]);
  return { position, index: new Uint32Array(idx) };
}

/* ---------------------------------------------------------------- primitives (outward-wound cages) */
export function boxCage(x = 10, y = 10, z = 10) {
  const a = x / 2, b = y / 2, c = z / 2;
  return {
    v: [[-a, -b, -c], [a, -b, -c], [a, b, -c], [-a, b, -c], [-a, -b, c], [a, -b, c], [a, b, c], [-a, b, c]],
    f: [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [2, 3, 7, 6], [1, 2, 6, 5], [0, 4, 7, 3]],
    crease: [],
  };
}
/** A ring-shaped cage (torus of n × m quads): the natural SubD start for a band or shank. */
export function torusCage(R = 9, r = 1.5, n = 8, m = 4) {
  const v = [], f = [];
  for (let i = 0; i < n; i++)
    for (let j = 0; j < m; j++) {
      const t = (i / n) * 2 * Math.PI, p = (j / m) * 2 * Math.PI + Math.PI / m;
      // a square tube section scaled so the limit roughly keeps radius r
      const k = r * 1.68;
      v.push([(R + k * Math.cos(p)) * Math.cos(t), k * Math.sin(p), (R + k * Math.cos(p)) * Math.sin(t)]);
    }
  for (let i = 0; i < n; i++)
    for (let j = 0; j < m; j++) {
      const a = i * m + j, b = ((i + 1) % n) * m + j, c = ((i + 1) % n) * m + ((j + 1) % m), d = i * m + ((j + 1) % m);
      f.push([a, d, c, b]);
    }
  return { v, f, crease: [] };
}
export function cylinderCage(r = 5, h = 10, n = 8) {
  const v = [], f = [];
  for (const y of [-h / 2, h / 2]) for (let i = 0; i < n; i++) v.push([r * Math.cos((i / n) * 2 * Math.PI), y, r * Math.sin((i / n) * 2 * Math.PI)]);
  for (let i = 0; i < n; i++) f.push([i, (i + 1) % n, n + ((i + 1) % n), n + i]);
  f.push(Array.from({ length: n }, (_, i) => i));
  f.push(Array.from({ length: n }, (_, i) => 2 * n - 1 - i));
  return { v, f, crease: [] };
}

/** Face normal (Newell) and centre. */
export function faceFrame({ v }, face) {
  const n = [0, 0, 0], c = [0, 0, 0];
  face.forEach((a, k) => {
    const p = v[a], q = v[face[(k + 1) % face.length]];
    n[0] += (p[1] - q[1]) * (p[2] + q[2]);
    n[1] += (p[2] - q[2]) * (p[0] + q[0]);
    n[2] += (p[0] - q[0]) * (p[1] + q[1]);
    for (let k2 = 0; k2 < 3; k2++) c[k2] += p[k2] / face.length;
  });
  const l = Math.hypot(...n) || 1;
  return { n: n.map((x) => x / l), c };
}
/** Extrude one face along its normal (the basic SubD modelling move). */
export function extrudeFace(cage, fi, dist, scale = 1) {
  const v = cage.v.map((p) => [...p]), f = cage.f.map((x) => [...x]), face = f[fi];
  const { n, c } = faceFrame(cage, face);
  const top = face.map((a) => {
    v.push([0, 1, 2].map((k) => c[k] + (cage.v[a][k] - c[k]) * scale + n[k] * dist));
    return v.length - 1;
  });
  face.forEach((a, k) => {
    const b = face[(k + 1) % face.length];
    f.push([a, b, top[(k + 1) % face.length], top[k]]);
  });
  f[fi] = top;
  return { v, f, crease: [...(cage.crease ?? [])] };
}
/** Toggle crease on every edge of a face (sharp detail). */
export function creaseFace(cage, fi) {
  const face = cage.f[fi], set = new Set(cage.crease ?? []);
  const keys = face.map((a, k) => key(a, face[(k + 1) % face.length]));
  const all = keys.every((k) => set.has(k));
  for (const k of keys) all ? set.delete(k) : set.add(k);
  return { ...cage, crease: [...set] };
}
