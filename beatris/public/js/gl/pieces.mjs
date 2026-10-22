import { band, brilliant, volumeMm3 } from './geometry.mjs';
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
