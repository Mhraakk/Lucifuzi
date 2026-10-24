// پروفایل فلزها (spec 0016): density and casting minimums per material instead of one constant. Densities are the
// usual published values for each alloy family (the exact recipe changes them a little; a shop can add a custom
// alloy with its measured density). Minimum thicknesses are common casting practice, editable per shop.
import { q, massOf, round } from './units.mjs';
import { ALLOYS } from '../calc.mjs';

const FROM_CALC = Object.fromEntries(ALLOYS.map((a) => [a.id, a]));
/** id, Persian name, fineness (per mille of gold; 0 for non-gold), density g/cm³, casting minimums in mm. */
export const MATERIALS = {
  au18y: { fa: '۱۸ عیار زرد', karat: 18, fineness: 750, density: FROM_CALC.au18y.density, minWall: 0.6, minStructural: 1.0, minProng: 0.7 },
  au18w: { fa: '۱۸ عیار سفید', karat: 18, fineness: 750, density: FROM_CALC.au18w.density, minWall: 0.6, minStructural: 1.0, minProng: 0.7 },
  au18r: { fa: '۱۸ عیار رز', karat: 18, fineness: 750, density: FROM_CALC.au18r.density, minWall: 0.6, minStructural: 1.0, minProng: 0.7 },
  au22: { fa: '۲۲ عیار', karat: 22, fineness: 916, density: FROM_CALC.au22.density, minWall: 0.8, minStructural: 1.2, minProng: 0.9 },
  au24: { fa: '۲۴ عیار', karat: 24, fineness: 999, density: FROM_CALC.au24.density, minWall: 1.0, minStructural: 1.5, minProng: 1.1 },
  ag925: { fa: 'نقره ۹۲۵', karat: null, fineness: 0, density: FROM_CALC.ag925.density, minWall: 0.7, minStructural: 1.1, minProng: 0.8 },
  pt950: { fa: 'پلاتین ۹۵۰', karat: null, fineness: 0, density: FROM_CALC.pt950.density, minWall: 0.5, minStructural: 0.9, minProng: 0.6 },
};
export const materialFor = (karat, color = 'y') => (karat === 22 ? 'au22' : karat === 24 ? 'au24' : `au18${color === 'w' ? 'w' : color === 'r' ? 'r' : 'y'}`);
/** A custom alloy: a name and a measured density are required, minimums default to 18 k values. */
export function customMaterial({ fa, density, karat = null, fineness = 0, minWall = 0.6, minStructural = 1.0, minProng = 0.7 }) {
  if (!(density > 1 && density < 25)) throw new Error('چگالی آلیاژ باید بین ۱ و ۲۵ گرم بر سانتی‌متر مکعب باشد.');
  return { fa, karat, fineness, density, minWall, minStructural, minProng, custom: true };
}
export const densityOf = (m) => q((typeof m === 'string' ? MATERIALS[m] : m).density, 'g/cm3');
/** Estimated weight of a metal volume: volume × density, in grams (3 decimals). */
export const weightOf = (volume, material) => round(massOf(volume, densityOf(material)), 3);
