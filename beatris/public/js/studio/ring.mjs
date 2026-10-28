// انگشتر پارامتری (spec 0016، 0056): the shank and the stone settings of a ring as closed meshes from numbers a
// jeweller uses. Axis convention: the finger runs along y, the top of the ring is +z, the ring lies in the xz plane.
// Every value here is in millimetres. Each setting builder returns { parts, stones, measures, shank? }: closed metal
// parts (no two pieces inside one part overlap, so voxel counts stay exact), the stone groups with their carats, the
// measures the rules read (all from the geometry as built), and for tension the open band that replaces the shank.
import { sweep, revolve, scale, translate, rotate, merge, ellipsoid } from './geometry.mjs';

const TAU = Math.PI * 2;
/** Inner diameter from an ISO size (inner circumference in mm) or a US size. */
export const diameterFromIso = (iso) => iso / Math.PI;
export const diameterFromUs = (us) => 11.63 + 0.8128 * us;

/** How much of the top's width and thickness the band keeps at angle θ from the top (1 at the top, 0 at the palm). */
export const taper = (th) => ((1 + Math.cos(th)) / 2) ** 1.5;
/** The band's section at angle θ from the top: inner radius, width and thickness (the taper of the shank). */
export function bandAt({ innerDiameter, widthTop, widthBottom, thickTop, thickBottom }, th) {
  const f = taper(th);
  return { R: innerDiameter / 2, w: widthBottom + (widthTop - widthBottom) * f, t: thickBottom + (thickTop - thickBottom) * f };
}
/** Radius of the band's outer surface at angle θ and across-position y (the superellipse of the section). */
export function outerAt(shank, th, y = 0) {
  const { R, w, t } = bandAt(shank, th);
  const v = Math.min(1, Math.abs((2 * y) / w));
  return R + t / 2 + (t / 2) * (1 - v ** 4) ** 0.25;
}

/**
 * The shank: a closed band whose section (a rounded rectangle) changes from the bottom of the ring to the top —
 * widthTop/thickTop at the shoulders under the head, widthBottom/thickBottom at the palm side. With `gap` (a half
 * angle in radians) the band is open at the top between two flat ends, as a tension ring is.
 */
export function shankMesh(shank, { segments = 128, section = 20, gap = 0 } = {}) {
  const open = gap > 0, rings = open ? segments + 1 : segments;
  const at = (s) => (open ? gap + ((TAU - 2 * gap) * s) / segments : (TAU * s) / segments); // 0 = top
  const P = [], I = [];
  for (let s = 0; s < rings; s++) {
    const th = at(s), { R, w, t } = bandAt(shank, th);
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
    const s1 = (s + 1) % rings;
    for (let k = 0; k < section; k++) {
      const k1 = (k + 1) % section, a = s * section + k, b = s * section + k1, c = s1 * section + k1, d = s1 * section + k;
      I.push(a, b, c, a, c, d);
    }
  }
  if (open)
    // the two flat ends, each a fan from the section's centre, wound against the side faces they meet
    for (const [s, last] of [[0, false], [rings - 1, true]]) {
      const th = at(s), { R, t } = bandAt(shank, th), o = P.length / 3;
      P.push((R + t / 2) * Math.sin(th), 0, (R + t / 2) * Math.cos(th));
      for (let k = 0; k < section; k++) {
        const a = s * section + k, b = s * section + ((k + 1) % section);
        last ? I.push(o, a, b) : I.push(o, b, a);
      }
    }
  return fixWinding({ position: Float32Array.from(P), index: Uint32Array.from(I) });
}

/** Depths of a cut stone from its width (common proportions; a measured height overrides). */
export function stoneProportions(spec) {
  const W = spec.stoneWidthMm, L = spec.stoneLengthMm ?? W;
  const depth = spec.stoneHeightMm ?? Math.round(0.6 * W * 100) / 100;
  return { W, L, depth, crown: depth * 0.25, pavilion: depth * 0.75 };
}
/** Unrounded carats: the gemmological L×W×D×k formula (k by shape) for diamond, scaled by specific gravity. */
function caratRaw(spec) {
  const { W, L, depth } = stoneProportions(spec);
  const k = { round: 0.0061, oval: 0.0062, pear: 0.0059, marquise: 0.0058, emerald: 0.008, princess: 0.0083, cushion: 0.0081, heart: 0.0059 }[spec.stoneShape] ?? 0.0062;
  const sg = { diamond: 3.52, ruby: 4.0, sapphire: 4.0, emerald: 2.72, cz: 5.7 }[spec.stoneType ?? 'diamond'] ?? 3.52;
  return (spec.stoneShape === 'round' ? W * W * depth * k : L * W * depth * k) * (sg / 3.52);
}
/** Estimated carats of one stone. */
export const caratOf = (spec) => round2(caratRaw(spec));
const group = (name, meshes, spec) => ({ name, mesh: merge(meshes), spec, count: meshes.length, carats: round2(meshes.length * caratRaw(spec)) });

/**
 * A prong head on the shank's top: n prongs from the shoulders to over the stone's crown, joined by a gallery
 * wire under the girdle; the stone sits with its girdle `headHeight` above the shank's top surface.
 */
export function prongHead(shank, spec, headHeight) {
  const { W, L, crown, pavilion } = stoneProportions(spec);
  headHeight ??= round2(pavilion + 0.6);
  const R = shank.innerDiameter / 2, top = R + shank.thickTop;
  const zg = top + headHeight;
  const n = spec.prongCount ?? (spec.stoneShape === 'round' ? 4 : 6);
  const pr = (spec.prongDiameterMm ?? 0.8) / 2;
  const out = prongOut(spec);
  const prongs = [];
  for (let i = 0; i < n; i++) {
    const a = (TAU * (i + 0.5)) / n;
    const ex = (W / 2) * Math.cos(a), ey = (L / 2) * Math.sin(a);
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
  const prongTip = zg + crown * 0.62;
  return {
    parts: [merge(prongs), gallery],
    stones: [group('stone', [stoneMesh(spec, zg)], spec)],
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
/** How far out of the girdle outline the prongs stand (a ratio of the outline, as prongHead places them). */
const prongOut = (spec) => {
  const { W, L } = stoneProportions(spec);
  return 1 + (((spec.prongDiameterMm ?? 0.8) / 2) * 0.8 * 2) / Math.max(W, L);
};

/**
 * A bezel: a collar around the girdle outline whose wall is exactly `wallMm` along the outline's normal, a bearing
 * ledge under the girdle, and a lip `seatDepthMm` above it (as cast, before the setter burnishes it over the crown).
 * Under the girdle the cup narrows with the pavilion (never as steeply, so it stays clear of the stone), and its
 * base follows the band's curve, 0.3 mm into it.
 */
export function bezelHead(shank, spec, headHeight) {
  const { W, L, crown, pavilion } = stoneProportions(spec);
  headHeight ??= round2(pavilion + 0.6);
  const R = shank.innerDiameter / 2, top = R + shank.thickTop, zg = top + headHeight;
  const wall = spec.wallMm ?? 0.6, lip = spec.seatDepthMm ?? 0.5;
  const bear = Math.min(0.4, Math.max(0.25, 0.06 * Math.min(W, L)));
  const k = 0.35; // the cup's inward slope under the girdle (a pavilion falls about 1.1 mm per mm)
  const surface = (x) => Math.sqrt(Math.max(0, top * top - x * x)) - 0.3;
  let zbMin = Infinity;
  const collarMesh = collar(W, L, (ex, ey, nx) => {
    // where the base lands depends on how far the cone has narrowed by then: one refinement settles it
    const zb = surface(Math.abs(ex + (wall - k * (zg - surface(Math.abs(ex + wall * nx)))) * nx));
    const h = zg - zb;
    zbMin = Math.min(zbMin, zb);
    return [[-bear - k * h, zb], [wall - k * h, zb], [wall, zg], [wall, zg + lip], [0, zg + lip], [0, zg], [-bear, zg]];
  });
  return {
    parts: [collarMesh],
    stones: [group('stone', [stoneMesh(spec, zg)], spec)],
    measures: {
      girdleZ: zg,
      culetClearanceMm: round2(zg - pavilion - top),
      wallMm: wall,
      thinWallMm: wall,
      lipOverGirdleMm: lip,
      bearingMm: round2(bear),
      collarHeightMm: round2(zg + lip - zbMin),
      headHeightMm: headHeight,
      stoneDepthMm: round2(crown + pavilion),
    },
  };
}

/**
 * A halo: the centre stone in its prongs, and a frame around it carrying a ring of small stones. The frame overlaps
 * the prongs by 0.3 mm (that is what holds it), the small stones stand 0.1 mm clear of them, and a bead sits on the
 * inner and the outer rim between every two small stones. The outer rim is the casting minimum wide.
 */
export function haloHead(shank, spec, headHeight, { minWall = 0.6 } = {}) {
  const c = prongHead(shank, spec, headHeight);
  const { W, L } = stoneProportions(spec);
  const zg = c.measures.girdleZ, pr = c.measures.prongDiameterMm / 2;
  const dP = (prongOut(spec) - 1) * (Math.max(W, L) / 2) + pr; // the prongs' outer face, out of the girdle outline
  const hs = spec.haloStoneMm ?? 1.2, gap = spec.spacingMm ?? 0.15;
  const melee = { type: 'halo', stoneShape: 'round', stoneType: spec.stoneType ?? 'diamond', stoneWidthMm: hs };
  const mp = stoneProportions(melee);
  const dF0 = dP - 0.3, dM0 = dP + 0.1, dF1 = dM0 + hs + minWall, dm = dM0 + hs / 2;
  const zh = zg - 0.1, depth = Math.max(0.8, mp.pavilion + 0.35);
  const frame = collar(W, L, () => [[dF0, zh - depth], [dF1, zh - depth], [dF1, zh + 0.05], [dF0, zh + 0.05]]);
  const path = arcTable(W, L, dm);
  const N = Math.max(6, Math.floor(path.P / (hs + gap))), pitch = path.P / N;
  const rb = 0.26, stones = [], beads = [];
  for (let i = 0; i < N; i++) {
    const f = ellipseFrame(W, L, path.tAt((i + 0.5) * pitch));
    stones.push(translate(stoneMesh(melee, zh, 24), [f.x + dm * f.nx, f.y + dm * f.ny, 0]));
    const g = ellipseFrame(W, L, path.tAt(i * pitch));
    for (const d of [dm - 0.38 * hs, dm + 0.38 * hs]) beads.push(translate(ellipsoid(rb, rb, rb, 12, 6), [g.x + d * g.nx, g.y + d * g.ny, zh + 0.05]));
  }
  return {
    parts: [...c.parts, frame, merge(beads)],
    stones: [...c.stones, group('halo', stones, melee)],
    measures: {
      ...c.measures,
      haloCount: N,
      haloStoneMm: hs,
      haloSpacingMm: round2(pitch - hs),
      frameWidthMm: round2(dF1 - dF0),
      frameDepthMm: round2(depth + 0.05),
      beadDiameterMm: rb * 2,
      thinWallMm: minWall,
    },
  };
}

/** A channel's half arc from the top to the outer face of its end bar, in radians. */
export function channelArc(shank, spec) {
  const { W } = stoneProportions(spec);
  const n = spec.stoneCount ?? 5, s = spec.spacingMm ?? 0.05, r0 = outerAt(shank, 0, 0);
  return (((n - 1) / 2) * (W + s) + W / 2 + s + (spec.wallMm ?? 0.6)) / r0;
}
/**
 * A channel: `stoneCount` stones in one row along the top of the band, girdles level with its surface, between two
 * rails swept about the finger axis. Each rail is `wallMm` thick, takes the girdle `seatDepthMm` deep and sits 0.3 mm
 * into the band; a bar closes each end.
 */
export function channelHead(shank, spec) {
  const { W, L, crown, pavilion } = stoneProportions(spec);
  const n = spec.stoneCount ?? 5, s = spec.spacingMm ?? 0.05, wall = spec.wallMm ?? 0.6, groove = spec.seatDepthMm ?? 0.2;
  const R = shank.innerDiameter / 2, r0 = outerAt(shank, 0, 0);
  const dth = (W + s) / r0, bar = wall / r0, half = channelArc(shank, spec) - bar;
  const yIn = L / 2 - groove, yOut = yIn + wall;
  let base = Infinity;
  for (const th of [0, half + bar]) for (const y of [yIn, yOut]) base = Math.min(base, outerAt(shank, th, y));
  base -= 0.3;
  const rTop = r0 + crown + 0.05;
  const rails = merge([bandBlock(-half - bar, half + bar, base, rTop, yIn, yOut), bandBlock(-half - bar, half + bar, base, rTop, -yOut, -yIn)]);
  const bars = merge([bandBlock(half, half + bar, base, rTop, -yOut, yOut), bandBlock(-half - bar, -half, base, rTop, -yOut, yOut)]);
  const stones = [];
  let floor = Infinity;
  for (let i = 0; i < n; i++) {
    const th = (i - (n - 1) / 2) * dth, rg = outerAt(shank, th, 0);
    stones.push(placeStone(spec, th, 0, rg));
    floor = Math.min(floor, rg - pavilion - R);
  }
  return {
    parts: [rails, bars],
    stones: [group('stones', stones, spec)],
    measures: {
      stoneCount: n,
      railWallMm: wall,
      thinWallMm: wall,
      grooveMm: groove,
      railOverTableMm: 0.05,
      floorUnderCuletMm: round2(floor),
      // how far inside the band's edge the rails' outer faces stand where the channel ends (the band tapers)
      railMarginMm: round2(bandAt(shank, half + bar).w / 2 - yOut),
      arcDeg: round2(((2 * (half + bar)) * 180) / Math.PI),
      stoneDepthMm: round2(crown + pavilion),
    },
  };
}

/**
 * Pavé: rows × columns of small stones over the band's top (the band's width sets the rows), girdles 0.05 mm under
 * the surface; a bead at every corner of a stone's cell, so each stone is held by four shared beads (a grain
 * pattern). The beads along the field's two long edges stand 0.3 of a pitch from their row, closer than a cell
 * corner, and every bead is just big enough to reach over the girdles it holds.
 */
export function paveHead(shank, spec) {
  const { W, L, crown, pavilion } = stoneProportions(spec);
  const d = Math.max(W, L), s = spec.spacingMm ?? 0.15, p = d + s;
  const rows = spec.rowCount ?? Math.max(1, Math.min(3, Math.floor((shank.widthTop - 0.4) / p)));
  const cols = spec.stoneCount ?? 9;
  const R = shank.innerDiameter / 2, r0 = outerAt(shank, 0, 0), sink = 0.05;
  const beadR = (dy) => Math.min(0.45, Math.max(0.2, Math.hypot(p / 2, dy) - d / 2 + 0.05));
  let rbMax = 0;
  const stones = [], beads = [];
  let floor = Infinity;
  for (let i = 0; i < cols; i++)
    for (let j = 0; j < rows; j++) {
      const th = ((i - (cols - 1) / 2) * p) / r0, y = (j - (rows - 1) / 2) * p, rg = outerAt(shank, th, y) - sink;
      stones.push(placeStone(spec, th, y, rg));
      floor = Math.min(floor, rg - pavilion - R);
    }
  for (let i = 0; i <= cols; i++)
    for (let j = 0; j <= rows; j++) {
      const edge = j === 0 || j === rows, dy = edge ? 0.3 * p : p / 2;
      const th = ((i - cols / 2) * p) / r0, y = edge ? Math.sign(j - rows / 2) * ((rows - 1) / 2 * p + dy) : (j - rows / 2) * p;
      const r = outerAt(shank, th, y), rb = beadR(dy);
      rbMax = Math.max(rbMax, rb);
      beads.push(translate(ellipsoid(rb, rb, rb, 12, 6), [r * Math.sin(th), y, r * Math.cos(th)]));
    }
  return {
    parts: [merge(beads)],
    stones: [group('stones', stones, spec)],
    measures: {
      stoneCount: rows * cols,
      rows,
      columns: cols,
      spacingMm: s,
      beadsPerStone: 4,
      beadDiameterMm: round2(rbMax * 2),
      floorUnderCuletMm: round2(floor),
      fieldArcDeg: round2((((cols * p) / r0) * 180) / Math.PI),
      stoneDepthMm: round2(crown + pavilion),
    },
  };
}

/**
 * Flush: one stone sunk into the band with its table level with the metal; no metal is added. The band's rounded
 * edge falls away from the top, so the girdle's ends across the band must still be under metal.
 */
export function flushHead(shank, spec) {
  const { L, crown, pavilion } = stoneProportions(spec);
  const R = shank.innerDiameter / 2, r0 = outerAt(shank, 0, 0), rg = r0 - crown;
  return {
    parts: [],
    stones: [group('stone', [placeStone(spec, 0, 0, rg)], spec)],
    measures: { girdleZ: rg, metalDepthMm: round2(r0 - R), floorUnderCuletMm: round2(rg - pavilion - R), edgeCoverMm: round2(outerAt(shank, 0, L / 2) - rg), stoneDepthMm: round2(crown + pavilion) },
  };
}

const TENSION_LIP = 0.6; // metal over the girdle's notch in each end
/** Half angle of a tension ring's opening: the ends' faces reach `seatDepthMm` into the girdle. */
export function tensionGap(shank, spec) {
  const { W } = stoneProportions(spec);
  return Math.atan((W / 2 - (spec.seatDepthMm ?? 0.35)) / (outerAt(shank, 0, 0) - TENSION_LIP));
}
/** Tension: the band opens at the top; the stone's girdle sits in a notch in each flat end, 0.6 mm under its top. */
export function tensionHead(shank, spec) {
  const { crown, pavilion } = stoneProportions(spec);
  const R = shank.innerDiameter / 2, rg = outerAt(shank, 0, 0) - TENSION_LIP;
  const gap = tensionGap(shank, spec), jaw = bandAt(shank, gap).t;
  return {
    parts: [],
    shank: shankMesh(shank, { gap }),
    stones: [group('stone', [placeStone(spec, 0, 0, rg)], spec)],
    measures: {
      girdleZ: rg,
      gapMm: round2(2 * rg * Math.tan(gap)),
      grooveMm: spec.seatDepthMm ?? 0.35,
      jawDepthMm: round2(jaw),
      metalDepthMm: round2(jaw),
      lipOverGirdleMm: TENSION_LIP,
      culetClearanceMm: round2(rg - pavilion - R),
      stoneDepthMm: round2(crown + pavilion),
    },
  };
}

/** Every setting type and its builder. */
export const SETTING_BUILDERS = { prong: prongHead, bezel: bezelHead, halo: haloHead, channel: channelHead, pave: paveHead, flush: flushHead, tension: tensionHead };
/** The setting types built with the stone raised above the band (they take a head height). */
export const RAISED_SETTINGS = new Set(['prong', 'bezel', 'halo']);

/** A brilliant-like stone: a revolved profile scaled to W × L, girdle at height zg. */
export function stoneMesh(spec, zg, segments = 48) {
  const { W, L, crown, pavilion } = stoneProportions(spec);
  const prof = [[0.001, -pavilion], [0.5, -0.01], [0.5, 0.02], [0.3, crown], [0.001, crown]];
  return translate(scale(revolve(prof, segments), [W, L, 1]), [0, 0, zg]);
}
/** A stone on the band: girdle centre at angle θ, across-position y and radius r, table facing outward. */
function placeStone(spec, th, y, r) {
  return translate(rotate(stoneMesh(spec, 0, 24), 'y', (th * 180) / Math.PI), [r * Math.sin(th), y, r * Math.cos(th)]);
}
/** A block swept about the finger axis between band angles th0..th1 (from the top), r in [r0, r1], y in [y0, y1]. */
function bandBlock(th0, th1, r0, r1, y0, y1) {
  const steps = Math.max(2, Math.ceil((th1 - th0) / (Math.PI / 90)));
  // revolve about z, then turn z into the finger axis: (x, y, z) → (x, z, −y), so angle a = θ − 90° lands at θ
  return rotate(revolve([[r0, y0], [r1, y0], [r1, y1], [r0, y1]], steps, { start: th0 - Math.PI / 2, sweep: th1 - th0 }), 'x', -90);
}
/** The girdle ellipse (W × L) at parameter t: its point and outward unit normal. */
function ellipseFrame(W, L, t) {
  const a = W / 2, b = L / 2, c = Math.cos(t), s = Math.sin(t);
  const nx = c / a, ny = s / b, l = Math.hypot(nx, ny);
  return { x: a * c, y: b * s, nx: nx / l, ny: ny / l };
}
/** A ring around the girdle ellipse: each profile point (d, z) sits d along the outline's outward normal. */
function collar(W, L, profileAt, segments = 64) {
  const P = [], I = [];
  let n = 0;
  for (let s = 0; s < segments; s++) {
    const f = ellipseFrame(W, L, (TAU * s) / segments), prof = profileAt(f.x, f.y, f.nx, f.ny);
    n = prof.length;
    for (const [d, z] of prof) P.push(f.x + d * f.nx, f.y + d * f.ny, z);
  }
  for (let s = 0; s < segments; s++) {
    const s1 = (s + 1) % segments;
    for (let i = 0; i < n; i++) {
      const i1 = (i + 1) % n, a = s * n + i, b = s * n + i1, c = s1 * n + i1, d = s1 * n + i;
      I.push(a, d, c, a, c, b);
    }
  }
  return fixWinding({ position: Float32Array.from(P), index: Uint32Array.from(I) });
}
/** Arc length along the girdle ellipse offset by d: the perimeter, and the ellipse parameter at a given length. */
function arcTable(W, L, d, K = 1440) {
  const us = [0];
  let prev = null;
  for (let i = 0; i <= K; i++) {
    const f = ellipseFrame(W, L, (TAU * i) / K), p = [f.x + d * f.nx, f.y + d * f.ny];
    if (prev) us.push(us[i - 1] + Math.hypot(p[0] - prev[0], p[1] - prev[1]));
    prev = p;
  }
  const P = us[K];
  const tAt = (u) => {
    u = ((u % P) + P) % P;
    let lo = 0, hi = K;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      us[mid] <= u ? (lo = mid) : (hi = mid);
    }
    return (TAU * (lo + (u - us[lo]) / (us[hi] - us[lo] || 1))) / K;
  };
  return { P, tAt };
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
