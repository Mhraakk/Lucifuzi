// انگشتر پارامتری (spec 0016): the shank and the head of a ring as closed meshes from numbers a jeweller uses.
// Axis convention: the finger runs along y, the top of the ring is +z, the ring lies in the xz plane.
// Every value here is in millimetres; the builders return geometry plus the analytic measures the rules need.
import { sweep, revolve, scale, translate, merge } from './geometry.mjs';

const TAU = Math.PI * 2;
/** Inner diameter from an ISO size (inner circumference in mm) or a US size. */
export const diameterFromIso = (iso) => iso / Math.PI;
export const diameterFromUs = (us) => 11.63 + 0.8128 * us;

/**
 * The shank: a closed band whose section (a rounded rectangle) changes from the bottom of the ring to the top —
 * widthTop/thickTop at the shoulders under the head, widthBottom/thickBottom at the palm side.
 */
export function shankMesh({ innerDiameter, widthTop, widthBottom, thickTop, thickBottom }, { segments = 128, section = 20 } = {}) {
  const R = innerDiameter / 2;
  const P = [], I = [];
  for (let s = 0; s < segments; s++) {
    const th = (TAU * s) / segments; // 0 = top
    const f = ((1 + Math.cos(th)) / 2) ** 1.5;
    const w = widthBottom + (widthTop - widthBottom) * f, t = thickBottom + (thickTop - thickBottom) * f;
    const rx = Math.sin(th), rz = Math.cos(th); // outward radial direction in xz
    for (let k = 0; k < section; k++) {
      const a = (TAU * k) / section, c = Math.cos(a), si = Math.sin(a);
      // superellipse (exponent 4): flat sides, rounded corners — the usual court/flat band section
      const u = Math.sign(c) * Math.abs(c) ** 0.5, v = Math.sign(si) * Math.abs(si) ** 0.5;
      const r = R + t / 2 + (u * t) / 2, y = (v * w) / 2;
      P.push(r * rx, y, r * rz);
    }
  }
  for (let s = 0; s < segments; s++) {
    const s1 = (s + 1) % segments;
    for (let k = 0; k < section; k++) {
      const k1 = (k + 1) % section, a = s * section + k, b = s * section + k1, c = s1 * section + k1, d = s1 * section + k;
      I.push(a, b, c, a, c, d);
    }
  }
  const m = { position: Float32Array.from(P), index: Uint32Array.from(I) };
  return fixWinding(m);
}

/** Depths of a cut stone from its width (common proportions; a measured height overrides). */
export function stoneProportions(spec) {
  const W = spec.stoneWidthMm, L = spec.stoneLengthMm ?? W;
  const depth = spec.stoneHeightMm ?? Math.round(0.6 * W * 100) / 100;
  return { W, L, depth, crown: depth * 0.25, pavilion: depth * 0.75 };
}
/** Estimated carats: the gemmological L×W×D×k formula (k by shape) for diamond, scaled by specific gravity. */
export function caratOf(spec) {
  const { W, L, depth } = stoneProportions(spec);
  const k = { round: 0.0061, oval: 0.0062, pear: 0.0059, marquise: 0.0058, emerald: 0.008, princess: 0.0083, cushion: 0.0081, heart: 0.0059 }[spec.stoneShape] ?? 0.0062;
  const sg = { diamond: 3.52, ruby: 4.0, sapphire: 4.0, emerald: 2.72, cz: 5.7 }[spec.stoneType ?? 'diamond'] ?? 3.52;
  const base = spec.stoneShape === 'round' ? W * W * depth * k : L * W * depth * k;
  return Math.round(base * (sg / 3.52) * 100) / 100;
}

/**
 * A prong head on the shank's top: n prongs from the shoulders to over the stone's crown, joined by a gallery
 * wire under the girdle; the stone sits with its girdle `headHeight` above the shank's top surface.
 */
export function prongHead(shank, spec, headHeight) {
  const { W, L, crown, pavilion } = stoneProportions(spec);
  const R = shank.innerDiameter / 2, top = R + shank.thickTop;
  const zg = top + headHeight;
  const n = spec.prongCount ?? (spec.stoneShape === 'round' ? 4 : 6);
  const pr = (spec.prongDiameterMm ?? 0.8) / 2;
  const prongs = [];
  for (let i = 0; i < n; i++) {
    const a = (TAU * (i + 0.5)) / n;
    const ex = (W / 2) * Math.cos(a), ey = (L / 2) * Math.sin(a);
    const out = 1 + (pr * 0.8) / Math.max(W, L) * 2;
    const bx = ex * 0.45, by = Math.max(-shank.widthTop / 2 + pr, Math.min(shank.widthTop / 2 - pr, ey * 0.45));
    const bz = Math.sqrt(Math.max(0, top * top - bx * bx)) - pr * 0.6;
    const path = [
      [bx, by, bz],
      [ex * 0.75, ey * 0.75, zg - pavilion * 0.7],
      [ex * out, ey * out, zg - pavilion * 0.15],
      [ex * out, ey * out, zg + crown * 0.35],
      [ex * 0.9, ey * 0.9, zg + crown * 0.62],
    ];
    prongs.push(sweep(smooth(path, 6), pr, { sides: 12 }));
  }
  const gz = zg - pavilion * 0.45, gw = Math.max(0.3, pr * 0.85);
  const ring = [];
  for (let i = 0; i < 64; i++) {
    const a = (TAU * i) / 64;
    ring.push([(W / 2) * 0.78 * Math.cos(a), (L / 2) * 0.78 * Math.sin(a), gz]);
  }
  const gallery = sweep(ring, gw, { closed: true, sides: 10 });
  const stone = stoneMesh(spec, zg);
  const prongTip = zg + crown * 0.62;
  return {
    metal: merge([...prongs, gallery]),
    stone,
    measures: {
      girdleZ: zg,
      culetClearanceMm: round2(zg - pavilion - top),
      prongOverCrownMm: round2(prongTip - zg),
      prongCount: n,
      prongDiameterMm: pr * 2,
      headHeightMm: headHeight,
      stoneDepthMm: round2(crown + pavilion),
    },
  };
}
/** A brilliant-like stone: a revolved profile scaled to W × L, girdle at height zg. */
export function stoneMesh(spec, zg) {
  const { W, L, crown, pavilion } = stoneProportions(spec);
  const prof = [[0.001, -pavilion], [0.5, -0.01], [0.5, 0.02], [0.3, crown], [0.001, crown]];
  return translate(scale(revolve(prof, 48), [W, L, 1]), [0, 0, zg]);
}

function smooth(path, k) {
  // Catmull–Rom through the control points: k samples per span
  const out = [];
  for (let i = 0; i < path.length - 1; i++) {
    const p0 = path[Math.max(0, i - 1)], p1 = path[i], p2 = path[i + 1], p3 = path[Math.min(path.length - 1, i + 2)];
    for (let j = 0; j < k; j++) {
      const t = j / k, t2 = t * t, t3 = t2 * t;
      out.push([0, 1, 2].map((d) => 0.5 * (2 * p1[d] + (-p0[d] + p2[d]) * t + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * t2 + (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * t3)));
    }
  }
  out.push(path[path.length - 1]);
  return out;
}
const round2 = (x) => Math.round(x * 100) / 100;
function fixWinding(m) {
  let v = 0;
  const p = m.position, idx = m.index;
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
    v += p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) - p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c]) + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c]);
  }
  if (v >= 0) return m;
  for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
  return m;
}
