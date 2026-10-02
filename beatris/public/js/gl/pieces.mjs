import { band, brilliant, cableChain, bar, rod, volumeMm3, merge } from './geometry.mjs';
import { rotX, translate, compose } from './viewer.mjs';
import { alloyById } from '../calc.mjs';

const GEM_WHITE = [0.97, 0.98, 1.0];
export const GEM_COLORS = { diamond: GEM_WHITE, ruby: [1.0, 0.25, 0.32], sapphire: [0.3, 0.45, 1.0], emerald: [0.25, 0.9, 0.55] };

const mm3ToGrams = (v, density) => (v / 1000) * density;

/** Plain band. Axis is Z so the ring stands facing the camera. */
export function ringScene({ alloy = 'au18y', diameter = 17.3, width = 4, thickness = 1.8, profile = 'comfort' } = {}) {
  const a = alloyById(alloy);
  const mesh = band({ diameter, width, thickness, profile });
  const volume = volumeMm3(mesh);
  return { items: [{ mesh, kind: 'metal', color: a.color, rough: 0.1 }], volume, grams: mm3ToGrams(volume, a.density), alloy: a };
}

/** Solitaire: tapered band + four prongs + round brilliant on top. */
export function solitaireScene({ alloy = 'au18y', diameter = 17.3, gemMm = 6.5, gem = 'diamond' } = {}) {
  const a = alloyById(alloy);
  const shank = band({ diameter, width: 2.2, thickness: 1.7, profile: 'court' });
  const g = brilliant(gemMm);
  const r0 = diameter / 2 + 1.7;
  const seat = r0 + 1.2 + (-g.zBottom);
  const R = gemMm / 2;
  const prongs = [];
  for (let i = 0; i < 4; i++) {
    const ang = Math.PI / 4 + (i * Math.PI) / 2;
    const cx = Math.cos(ang), cz = Math.sin(ang);
    const base = [cx * 1.1, r0 - 0.3, cz * 1.1];
    const tip = [cx * (R * 0.98), seat + g.zTop * 0.55, cz * (R * 0.98)];
    prongs.push(rod(base, tip, 0.42));
  }
  const head = merge(prongs);
  const metalVolume = volumeMm3(shank) + prongs.reduce((s, p) => s + volumeMm3(p), 0);
  const gemModel = compose(translate(0, seat, 0), rotX(-Math.PI / 2));
  const carat = (volumeMm3(g.mesh) / 1000) * 3.52 * 5;
  return {
    items: [
      { mesh: shank, kind: 'metal', color: a.color, rough: 0.1 },
      { mesh: head, kind: 'metal', color: a.color, rough: 0.12 },
      { mesh: g.mesh, kind: 'gem', color: GEM_COLORS[gem] ?? GEM_WHITE, model: gemModel },
    ],
    volume: metalVolume,
    grams: mm3ToGrams(metalVolume, a.density),
    carat,
    alloy: a,
  };
}

/** Loose round brilliant with anatomy anchors. */
export function gemScene({ gemMm = 8, gem = 'diamond' } = {}) {
  const g = brilliant(gemMm);
  const model = compose(translate(0, -g.zBottom, 0), rotX(-Math.PI / 2));
  const tf = (p) => [p[0], p[2] - g.zBottom, -p[1]];
  const labels = [
    { text: 'تِیبل', pos: tf(g.anchors.table) },
    { text: 'تاج', pos: tf(g.anchors.crown) },
    { text: 'کمربند', pos: tf(g.anchors.girdle) },
    { text: 'پاویون', pos: tf(g.anchors.pavilion) },
    { text: 'کولت', pos: tf(g.anchors.culet) },
  ];
  return { items: [{ mesh: g.mesh, kind: 'gem', color: GEM_COLORS[gem] ?? GEM_WHITE, model }], labels, carat: (volumeMm3(g.mesh) / 1000) * 3.52 * 5 };
}

export function bangleScene({ alloy = 'au18y', diameter = 62, width = 5, thickness = 2.2, profile = 'court' } = {}) {
  const a = alloyById(alloy);
  const mesh = band({ diameter, width, thickness, profile, segments: 180 });
  const volume = volumeMm3(mesh);
  return { items: [{ mesh, kind: 'metal', color: a.color, rough: 0.12 }], volume, grams: mm3ToGrams(volume, a.density), alloy: a };
}

/** Cable chain: weight is computed for the full `lengthCm`, while only a short segment is drawn. */
export function chainScene({ alloy = 'au18y', wire = 0.9, linkLength = 5, lengthCm = 45 } = {}) {
  const a = alloyById(alloy);
  const c = cableChain({ count: 9, linkLength, linkWidth: linkLength * 0.68, wire });
  const links = Math.round((lengthCm * 10) / c.pitch);
  const volume = c.linkVolume * links;
  return { items: [{ mesh: c.mesh, kind: 'metal', color: a.color, rough: 0.1 }], volume, grams: mm3ToGrams(volume, a.density), links, alloy: a };
}

export function barScene({ alloy = 'au24', length = 30, width = 17, height = 3.2 } = {}) {
  const a = alloyById(alloy);
  const mesh = bar({ length, width, height });
  const volume = volumeMm3(mesh);
  return { items: [{ mesh, kind: 'metal', color: a.color, rough: 0.16 }], volume, grams: mm3ToGrams(volume, a.density), alloy: a };
}
