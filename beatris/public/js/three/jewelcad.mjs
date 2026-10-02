// طراحی طلا در حد ابزارهای جواهرسازی (spec 0007): the jewellery families of a CAD jewellery suite — shanks, gems and
// settings, pavé, trilogy, accessories, sprues — as parametric generators on top of jewelry.mjs, plus the analysis
// and manufacturing helpers (thickness, stone collisions, report, ring sizes). Millimetres; rings stand upright with
// the axis along Z and the top at +Y. Every metal part is a closed solid so its signed volume is its weight.
import { T } from './stage.mjs';
import * as J from './jewelry.mjs';

export * from './jewelry.mjs';
const { PIECES, gemGeo, pipeVar, sweep, circleFrames, profileOf, meshOf: M, mergeGeos: merge, headOf: head, shankOf: shank, ringR, sphereAt: sphere, outlinePts, orient } = J;
const TAU = Math.PI * 2;
const V3 = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z);
const smooth = (x) => x * x * (3 - 2 * x);
const lerp = (a, b, t) => a + (b - a) * t;

/** Place a stone so its table faces outward from the ring axis at angle a, centred at width offset z. */
function radialStone(st, Ro, a, z, sink = 0.12) {
  const g = st.geo.clone();
  g.translate(0, -st.top + sink, 0);
  g.rotateZ(a - Math.PI / 2);
  g.translate(Ro * Math.cos(a), Ro * Math.sin(a), z);
  return g;
}
const SIZE_PARAM = [54, 40, 75, 0.5, 'سایز (محیط mm)'];

/* ---------------- shanks ---------------- */
const NEW = {
  advanced: {
    label: 'رکاب پیشرفته',
    params: { size: SIZE_PARAM, wB: [2.4, 1.2, 10, 0.1, 'پهنا پایین'], wS: [3, 1.2, 10, 0.1, 'پهنا کنار'], wT: [5, 1.2, 14, 0.1, 'پهنا بالا'], tB: [1.5, 0.8, 4, 0.05, 'ضخامت پایین'], tS: [1.7, 0.8, 4, 0.05, 'ضخامت کنار'], tT: [2.3, 0.8, 5, 0.05, 'ضخامت بالا'] },
    opts: { profile: 'court' },
    build: (p) => {
      const R = ringR(p.size);
      const at = (t, b, s, top) => {
        const a = -Math.PI / 2 + t * TAU;
        const u = (1 + Math.sin(a)) / 2; // 0 bottom → 1 top
        return u < 0.5 ? lerp(b, s, smooth(u * 2)) : lerp(s, top, smooth((u - 0.5) * 2));
      };
      const geo = sweep(circleFrames(R, -Math.PI / 2, -Math.PI / 2 + TAU, 256), (t) => profileOf(p.profile, at(t, p.wB, p.wS, p.wT), at(t, p.tB, p.tS, p.tT)));
      return [M(geo, 'metal')];
    },
  },
  cathedral: {
    label: 'کلیسایی (کتدرال)',
    params: { size: SIZE_PARAM, width: [2.2, 1.4, 5, 0.05, 'پهنای رکاب'], thickness: [1.6, 1, 3, 0.05, 'ضخامت رکاب'], stone: [6.5, 3, 12, 0.1, 'قطر سنگ'], rise: [2.6, 1, 6, 0.1, 'ارتفاع شانه'], prong: [0.55, 0.35, 1, 0.01, 'قطر پنجه'] },
    opts: { profile: 'court', cut: 'round', setting: 'prong4', gem: 'diamond' },
    build: (p) => {
      const R = ringR(p.size);
      const top = R + p.thickness;
      const st = gemGeo(p.cut, p.stone);
      const baseY = top + p.rise;
      const yg = baseY - st.bottom + 0.2;
      const metal = [shank({ size: p.size, width: p.width, thickness: p.thickness, prof: p.profile })];
      // the shoulders leave the shank about 40° each side of the top and sweep up into the head
      for (const s of [-1, 1]) {
        const a = Math.PI / 2 - s * 0.7; // s = +1: the right shoulder (x > 0)
        const P0 = V3((R + p.thickness * 0.5) * Math.cos(a), (R + p.thickness * 0.5) * Math.sin(a), 0);
        const P1 = V3(s * p.stone * 0.42, top + p.rise * 0.45, 0);
        const P2 = V3(s * Math.max(0.8, p.stone * 0.18), baseY + 0.15, 0);
        metal.push(pipeVar([P0, P1, P2], (t) => [p.thickness * lerp(0.5, 0.42, t), p.width * lerp(0.5, 0.36, t)], { seg: 48, radial: 18 }));
      }
      metal.push(...head(st, { yg, baseY, setting: p.setting, prongR: p.prong, stoneSize: p.stone }));
      return [M(merge(metal), 'metal'), M(st.geo.clone().translate(0, yg, 0), 'gem', { stone: p.cut, size: p.stone })];
    },
  },
  trilogy: {
    label: 'سه‌نگین (تریلوژی)',
    params: { size: SIZE_PARAM, width: [2.2, 1.4, 5, 0.05, 'پهنای رکاب'], thickness: [1.6, 1, 3, 0.05, 'ضخامت رکاب'], stone: [6, 3, 11, 0.1, 'سنگ وسط'], ratio: [0.7, 0.4, 1, 0.05, 'نسبت سنگ کنار'], gap: [0.3, 0, 1.5, 0.05, 'فاصله سنگ‌ها'] },
    opts: { profile: 'court', cut: 'round', setting: 'prong4', gem: 'diamond', gem2: 'diamond' },
    build: (p) => {
      const R = ringR(p.size);
      const top = R + p.thickness * 0.85;
      const metal = [shank({ size: p.size, width: p.width, thickness: p.thickness, prof: p.profile, taperT: 0.85 })];
      const c = gemGeo(p.cut, p.stone), sd = p.stone * p.ratio, sGem = gemGeo(p.cut === 'round' ? 'round' : p.cut, sd);
      const ygC = top - c.bottom + 0.35;
      metal.push(...head(c, { yg: ygC, baseY: top - 0.2, setting: p.setting, prongR: 0.5, stoneSize: p.stone }));
      const gems = [];
      for (const s of [-1, 1]) {
        const x = s * (c.outline(0) + sGem.outline(0) + p.gap);
        const ang = Math.asin(Math.min(0.9, x / (R + p.thickness))); // follow the ring's curve
        const yB = Math.sqrt(Math.max(0, (R + p.thickness * 0.85) ** 2 - x * x)) - 0.2;
        const ygS = yB - sGem.bottom + 0.3 - 0.4;
        const hs = head(sGem, { yg: ygS, baseY: yB, setting: p.setting === 'bezel' ? 'bezel' : 'prong4', prongR: 0.42, stoneSize: sd });
        const g = sGem.geo.clone().translate(0, ygS, 0);
        for (const h of [...hs, g]) {
          h.translate(0, -yB, 0);
          h.rotateZ(-ang * 0.6);
          h.translate(x, yB, 0);
        }
        metal.push(...hs);
        gems.push(g);
      }
      return [M(merge(metal), 'metal'), M(c.geo.clone().translate(0, ygC, 0), 'gem', { stone: p.cut, size: p.stone }), M(merge(gems), 'gem', { stone: p.cut, size: sd, count: 2, slot: 'gem2' })];
    },
  },
  /* ---------------- pavé ---------------- */
  pave: {
    label: 'پاوه رکابی',
    params: { size: SIZE_PARAM, width: [4, 2, 12, 0.1, 'پهنا'], thickness: [2, 1.4, 4, 0.05, 'ضخامت'], stone: [1.3, 0.8, 3, 0.05, 'قطر سنگ'], rows: [2, 1, 6, 1, 'تعداد ردیف'], gap: [0.15, 0.05, 0.6, 0.01, 'فاصله سنگ‌ها'], cover: [140, 40, 360, 10, 'پوشش (درجه)'] },
    opts: { profile: 'flat', layout: 'honeycomb', gem: 'diamond' },
    build: (p) => {
      const R = ringR(p.size), Ro = R + p.thickness;
      const pitch = p.stone + p.gap;
      const rowPitch = p.layout === 'honeycomb' ? pitch * 0.866 : pitch;
      const need = (p.rows - 1) * rowPitch + p.stone + 0.9;
      const width = Math.max(p.width, need);
      const metal = [shank({ size: p.size, width, thickness: p.thickness, prof: p.profile })];
      const st = gemGeo('round', p.stone);
      const span = (Math.min(p.cover, 360) * Math.PI) / 180;
      const aPitch = pitch / Ro;
      const gems = [], stones = [], beads = new Map();
      const bead = (a, z) => {
        const k = `${Math.round(a * 1e3)},${Math.round(z * 1e2)}`;
        if (!beads.has(k)) beads.set(k, V3((Ro + 0.05) * Math.cos(a), (Ro + 0.05) * Math.sin(a), z));
      };
      for (let r = 0; r < p.rows; r++) {
        const z = (r - (p.rows - 1) / 2) * rowPitch;
        const off = p.layout === 'honeycomb' && r % 2 ? aPitch / 2 : 0;
        const n = Math.max(1, Math.floor((span - (p.cover >= 360 ? 0 : aPitch * 0.6)) / aPitch));
        const a0 = Math.PI / 2 - ((n - 1) * aPitch) / 2 + off;
        for (let k = 0; k < n; k++) {
          const a = a0 + k * aPitch;
          if (p.cover < 360 && Math.abs(a - Math.PI / 2) > span / 2) continue;
          gems.push(radialStone(st, Ro, a, z));
          stones.push({ c: [Ro * Math.cos(a), Ro * Math.sin(a), z], r: p.stone / 2 });
          // shared beads: between neighbours along the row, and on the outer rows' edges
          for (const s of [-1, 1]) bead(a + s * aPitch / 2, z + p.stone * 0.32), bead(a + s * aPitch / 2, z - p.stone * 0.32);
        }
      }
      for (const c of beads.values()) metal.push(sphere(p.stone * 0.19, c));
      return [M(merge(metal), 'metal'), M(merge(gems), 'gem', { stone: 'round', size: p.stone, count: gems.length, stones })];
    },
  },
  pavePlate: {
    label: 'پاوه روی سطح',
    params: { size: [16, 6, 40, 0.5, 'اندازه'], thickness: [1.4, 0.8, 4, 0.05, 'ضخامت صفحه'], stone: [1.2, 0.7, 3, 0.05, 'قطر سنگ'], gap: [0.15, 0.05, 0.6, 0.01, 'فاصله سنگ‌ها'], margin: [0.5, 0.2, 2, 0.05, 'لبه'] },
    opts: { shape: 'disc', gem: 'diamond' },
    build: (p) => {
      const pts = plateOutline(p.shape, p.size);
      const shp = new T.Shape(pts);
      const plate = new T.ExtrudeGeometry(shp, { depth: p.thickness, bevelEnabled: true, bevelThickness: 0.25, bevelSize: 0.25, bevelSegments: 3, curveSegments: 48 });
      plate.rotateX(-Math.PI / 2);
      plate.translate(0, -p.thickness, 0); // top face at y ≈ 0
      const metal = [plate];
      const st = gemGeo('round', p.stone);
      const pitch = p.stone + p.gap, rowH = pitch * 0.866;
      const inside = (x, y, inset) => pointInPoly(x, y, pts) && distToPoly(x, y, pts) >= inset;
      const gems = [], stones = [];
      const ext = p.size;
      const lattice = [];
      for (let j = -Math.ceil(ext / rowH); j <= Math.ceil(ext / rowH); j++)
        for (let i = -Math.ceil(ext / pitch); i <= Math.ceil(ext / pitch); i++) lattice.push([i * pitch + (j % 2 ? pitch / 2 : 0), j * rowH]);
      const keep = new Set();
      lattice.forEach(([x, y], i) => {
        if (!inside(x, y, p.stone / 2 + p.margin)) return;
        keep.add(i);
        gems.push(st.geo.clone().translate(x, 0.25 - st.top + 0.12 + 0.25, -y));
        stones.push({ c: [x, 0.25, -y], r: p.stone / 2 });
      });
      // a bead at the centre of every triangle of three neighbouring stones
      const seen = new Set();
      for (const [x, y] of lattice.filter((_, i) => keep.has(i)))
        for (const [dx, dy] of [[pitch / 2, rowH / 3], [0, (2 * rowH) / 3], [-pitch / 2, rowH / 3], [pitch / 2, -rowH / 3], [0, (-2 * rowH) / 3], [-pitch / 2, -rowH / 3]]) {
          const bx = x + dx, by = y + dy, key = `${Math.round(bx * 50)},${Math.round(by * 50)}`;
          if (seen.has(key) || !inside(bx, by, p.margin * 0.5)) continue;
          seen.add(key);
          metal.push(sphere(Math.max(0.16, p.gap / 2 + p.stone * 0.1), V3(bx, 0.32, -by)));
        }
      return [M(merge(metal), 'metal'), M(merge(gems.length ? gems : [new T.BufferGeometry().setAttribute('position', new T.Float32BufferAttribute([], 3))]), 'gem', { stone: 'round', size: p.stone, count: gems.length, stones })];
    },
  },
  /* ---------------- accessories ---------------- */
  bail: {
    label: 'آویزگیر (بیل)',
    params: { height: [6, 3, 14, 0.1, 'ارتفاع'], width: [3.2, 1.5, 8, 0.1, 'دهانه'], wire: [1, 0.5, 2.5, 0.05, 'ضخامت'], band: [1.8, 0.8, 5, 0.05, 'پهنای نوار'] },
    opts: {},
    build: (p) => {
      const pts = [];
      for (let i = 0; i < 32; i++) {
        const a = (i / 32) * TAU;
        pts.push(V3((p.width / 2 + p.wire / 2) * Math.cos(a), (p.height / 2) * Math.sin(a) + p.height / 2, 0));
      }
      return [M(pipeVar(pts, () => [p.wire / 2, p.band / 2], { closed: true, seg: 96 }), 'metal')];
    },
  },
  bead: {
    label: 'مهره سوراخ‌دار',
    params: { diameter: [8, 2, 20, 0.1, 'قطر'], hole: [1.6, 0.4, 5, 0.05, 'قطر سوراخ'] },
    opts: {},
    build: (p) => {
      const r = p.diameter / 2, h = Math.min(p.hole / 2, r * 0.7);
      const y = Math.sqrt(r * r - h * h);
      const prof = [];
      for (let i = 0; i <= 48; i++) {
        const a = -Math.asin(y / r) + (i / 48) * 2 * Math.asin(y / r);
        prof.push(new T.Vector2(r * Math.cos(a), r * Math.sin(a)));
      }
      prof.push(new T.Vector2(h, y), new T.Vector2(h, -y), prof[0].clone());
      const g = new T.LatheGeometry(prof, 64).toNonIndexed();
      g.translate(0, r, 0);
      return [M(orient(g), 'metal')];
    },
  },
  rope: {
    label: 'حلقه طنابی (تابیده)',
    params: { size: SIZE_PARAM, wire: [1, 0.5, 2.2, 0.05, 'قطر رشته'], strands: [2, 2, 4, 1, 'تعداد رشته'], lay: [4, 2, 10, 0.5, 'گام تاب (mm)'] },
    opts: {},
    build: (p) => {
      const k = p.strands, rw = p.wire / 2;
      const rr = k === 2 ? rw : rw / Math.sin(Math.PI / k);
      const R = ringR(p.size) + rr + rw;
      const twists = Math.max(4, Math.round((TAU * R) / p.lay));
      const out = [];
      for (let j = 0; j < k; j++) {
        const pts = [];
        const n = twists * 10;
        for (let i = 0; i < n; i++) {
          const f = (i / n) * TAU, th = twists * f + (j / k) * TAU;
          const rad = R + rr * Math.cos(th);
          pts.push(V3(rad * Math.cos(f), rad * Math.sin(f), rr * Math.sin(th)));
        }
        out.push(pipeVar(pts, () => [rw, rw], { closed: true, seg: n, radial: 12 }));
      }
      return [M(merge(out), 'metal')];
    },
  },
  sprue: {
    label: 'راهگاه ریخته‌گری',
    params: { diameter: [2.5, 1, 6, 0.1, 'قطر تنه'], length: [8, 3, 25, 0.5, 'طول تنه'], button: [10, 0, 20, 0.5, 'قطر دکمه (۰ = بدون)'] },
    opts: {},
    build: (p) => {
      const trunk = new T.CylinderGeometry(p.diameter / 2 * 0.85, p.diameter / 2, p.length, 24);
      trunk.translate(0, -p.length / 2, 0);
      const parts = [trunk];
      if (p.button > 0) {
        const b = new T.CylinderGeometry(p.diameter / 2, p.button / 2, p.button * 0.45, 32);
        b.translate(0, -p.length - p.button * 0.225, 0);
        parts.push(b);
      }
      return [M(merge(parts.map((g) => g.toNonIndexed())), 'metal', { detail: 'sprue' })];
    },
  },
};

/* ---------------- milgrain on the plain band ---------------- */
const bandBuild = PIECES.band.build;
PIECES.band.opts = { ...PIECES.band.opts, milgrain: false };
PIECES.band.build = (p) => {
  const out = bandBuild(p);
  if (!p.milgrain) return out;
  const R = ringR(p.size), Ro = R + p.thickness * 0.92, r = Math.max(0.18, Math.min(0.35, p.width * 0.06));
  const n = Math.floor((TAU * Ro) / (2 * r * 1.08));
  const beads = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    for (const s of [-1, 1]) beads.push(sphere(r, V3(Ro * Math.cos(a), Ro * Math.sin(a), s * (p.width / 2 - r * 0.9))));
  }
  return [M(merge([out[0].geometry, ...beads]), 'metal')];
};
Object.assign(PIECES, NEW);
// every ring with a head can take every setting
for (const k of ['solitaire', 'cathedral', 'trilogy']) PIECES[k].opts.setting ??= 'prong4';

/* ---------------- plate outlines and polygon helpers ---------------- */
export const PLATE_SHAPES = [['disc', 'گرد'], ['oval', 'بیضی'], ['heart', 'قلب'], ['drop', 'اشک'], ['square', 'مربع']];
function plateOutline(kind, size) {
  const R = size / 2, pts = [];
  const N = 96;
  for (let i = 0; i < N; i++) {
    const t = (i / N) * TAU;
    let x, y;
    if (kind === 'oval') (x = R * 0.72 * Math.cos(t)), (y = R * Math.sin(t));
    else if (kind === 'heart') {
      x = 16 * Math.sin(t) ** 3;
      y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
      (x *= R / 17), (y *= R / 17);
    } else if (kind === 'drop') {
      x = R * 0.75 * Math.sin(t) * (1 - 0.45 * Math.cos(t) - 0.05);
      y = -R * Math.cos(t);
    } else if (kind === 'square') {
      const c = Math.cos(t), s = Math.sin(t), k = 1 / Math.max(Math.abs(c), Math.abs(s));
      (x = R * 0.86 * c * k), (y = R * 0.86 * s * k);
    } else (x = R * Math.cos(t)), (y = R * Math.sin(t));
    pts.push(new T.Vector2(x, y));
  }
  return T.ShapeUtils.isClockWise(pts) ? pts.reverse() : pts;
}
function pointInPoly(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
function distToPoly(x, y, pts) {
  let d = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const dx = b.x - a.x, dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    d = Math.min(d, Math.hypot(x - a.x - t * dx, y - a.y - t * dy));
  }
  return d;
}

/* ================================================================== analysis and manufacturing */

/** Ring sizes: ISO 8653 size = inner circumference (mm); US d = 11.63 + 0.8128·US (mm). */
export const ringSize = {
  fromISO: (c) => ({ iso: c, diameter: c / Math.PI, us: (c / Math.PI - 11.63) / 0.8128 }),
  fromUS: (us) => ({ iso: (11.63 + 0.8128 * us) * Math.PI, diameter: 11.63 + 0.8128 * us, us }),
};

/** Triangle groups of a merged geometry: each separate closed piece (a stone of a pavé, a bead, a prong). */
function triangleGroups(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const p = g.attributes.position.array, nTri = p.length / 9;
  const parent = Array.from({ length: nTri }, (_, i) => i);
  const find = (i) => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]];
    return i;
  };
  const owner = new Map();
  for (let t = 0; t < nTri; t++)
    for (let v = 0; v < 3; v++) {
      const o = (t * 3 + v) * 3;
      const k = `${Math.round(p[o] * 1e3)},${Math.round(p[o + 1] * 1e3)},${Math.round(p[o + 2] * 1e3)}`;
      const prev = owner.get(k);
      if (prev === undefined) owner.set(k, t);
      else parent[find(t)] = find(prev);
    }
  const groups = new Map();
  for (let t = 0; t < nTri; t++) {
    const r = find(t);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(t);
  }
  return { g, p, groups: [...groups.values()] };
}
/** Vertex positions of each separate closed piece of a merged geometry (Float32Array per piece). */
export function componentPoints(geo) {
  const { p, groups } = triangleGroups(geo);
  return groups.map((tris) => {
    const out = new Float32Array(tris.length * 9);
    tris.forEach((t, i) => out.set(p.subarray(t * 9, t * 9 + 9), i * 9));
    return out;
  });
}
/** Bounding boxes of the separate closed pieces of a merged geometry. */
export function components(geo) {
  const { p, groups } = triangleGroups(geo);
  return groups.map((tris) => {
    const b = new T.Box3();
    for (const t of tris) for (let v = 0; v < 3; v++) b.expandByPoint(V3(p[(t * 3 + v) * 3], p[(t * 3 + v) * 3 + 1], p[(t * 3 + v) * 3 + 2]));
    return b;
  });
}
/** Stones in world space: centre and girdle radius, from the builder's list or from the geometry itself. */
export function stonesOf(mesh) {
  mesh.updateWorldMatrix(true, false);
  const s = mesh.matrixWorld.getMaxScaleOnAxis();
  if (mesh.userData.stones?.length) return mesh.userData.stones.map((x) => ({ c: V3(...x.c).applyMatrix4(mesh.matrixWorld), r: x.r * s }));
  return components(mesh.geometry).map((b) => {
    const size = b.getSize(V3());
    const dims = [size.x, size.y, size.z].sort((a, c) => a - c);
    return { c: b.getCenter(V3()).applyMatrix4(mesh.matrixWorld), r: (dims[1] / 2) * s };
  });
}
/** Pairs of stones closer than they may be (overlap > tolerance mm). */
export function collisions(stones, tol = 0.02) {
  const hits = [];
  for (let i = 0; i < stones.length; i++)
    for (let j = i + 1; j < stones.length; j++) {
      const d = stones[i].c.distanceTo(stones[j].c);
      if (d < stones[i].r + stones[j].r - tol) hits.push({ i, j, overlap: stones[i].r + stones[j].r - d, at: stones[i].c.clone().lerp(stones[j].c, 0.5) });
    }
  return hits;
}
/**
 * Wall thickness: from sample points on the surface, cast a ray inward (against the normal) and measure the distance
 * to where it leaves the metal. Returns the minimum, the 5th percentile and the thin spots below `limit` mm.
 */
export function thickness(mesh, { samples = 2500, limit = 0.6 } = {}) {
  // each closed piece is measured on its own: a prong pushed into the shank is not a 0.01 mm wall
  mesh.updateWorldMatrix(true, false);
  const { p, groups } = triangleGroups(mesh.geometry);
  const total = p.length / 9;
  const ray = new T.Raycaster();
  const values = [], thin = [];
  const A = V3(), B = V3(), C = V3(), P = V3(), N = V3();
  for (const tris of groups) {
    const pos = new Float32Array(tris.length * 9);
    tris.forEach((t, i) => pos.set(p.subarray(t * 9, t * 9 + 9), i * 9));
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    geo.applyMatrix4(mesh.matrixWorld);
    const part = new T.Mesh(geo, new T.MeshBasicMaterial({ side: T.DoubleSide }));
    const want = Math.max(4, Math.round((samples * tris.length) / total));
    const step = Math.max(1, Math.floor(tris.length / want));
    const arr = geo.attributes.position.array;
    for (let i = 0; i < tris.length; i += step) {
      A.fromArray(arr, i * 9);
      B.fromArray(arr, i * 9 + 3);
      C.fromArray(arr, i * 9 + 6);
      N.subVectors(B, A).cross(C.clone().sub(A));
      if (N.lengthSq() < 1e-12) continue;
      N.normalize();
      P.copy(A).add(B).add(C).multiplyScalar(1 / 3);
      ray.set(P.clone().addScaledVector(N, -0.002), N.clone().negate());
      ray.far = 50;
      const hit = ray.intersectObject(part, false).find((h) => h.distance > 0.01);
      if (!hit) continue;
      values.push(hit.distance);
      if (hit.distance < limit) thin.push({ at: P.clone(), d: hit.distance });
    }
    geo.dispose();
  }
  values.sort((a, b) => a - b);
  return { min: values[0] ?? null, p5: values[Math.floor(values.length * 0.05)] ?? null, median: values[Math.floor(values.length / 2)] ?? null, samples: values.length, thin };
}
