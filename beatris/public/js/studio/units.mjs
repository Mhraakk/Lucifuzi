// واحدها (spec 0016): every measured value of the studio carries its unit, and units change only through these
// functions. A length is never added to a volume, mm³ are never read as cm³, grams never as kilograms.

export const UNITS = {
  length: { mm: 1, cm: 10, m: 1000 },
  area: { mm2: 1, cm2: 100 },
  volume: { mm3: 1, cm3: 1000 },
  mass: { mg: 0.001, g: 1, kg: 1000, ct: 0.2 },
  density: { 'g/cm3': 1 },
};
const KIND = Object.fromEntries(Object.entries(UNITS).flatMap(([k, us]) => Object.keys(us).map((u) => [u, k])));

export class UnitError extends Error {}
export const q = (value, unit) => {
  if (!KIND[unit]) throw new UnitError(`واحد ناشناخته: ${unit}`);
  if (!Number.isFinite(value)) throw new UnitError(`مقدار نامعتبر برای ${unit}`);
  return Object.freeze({ value, unit });
};
export const kindOf = (x) => KIND[x.unit];
/** Convert within one kind; across kinds it throws. */
export function to(x, unit) {
  const k = KIND[x.unit];
  if (!k || KIND[unit] !== k) throw new UnitError(`تبدیل ${x.unit} به ${unit} ممکن نیست.`);
  return q((x.value * UNITS[k][x.unit]) / UNITS[k][unit], unit);
}
export function add(a, b) {
  if (KIND[a.unit] !== KIND[b.unit]) throw new UnitError(`جمع ${a.unit} با ${b.unit} ممکن نیست.`);
  return q(a.value + to(b, a.unit).value, a.unit);
}
export const sub = (a, b) => add(a, q(-to(b, a.unit).value, a.unit));
/** mass = volume × density (the only crossing between kinds the studio needs, and its inverse). */
export function massOf(volume, density) {
  if (KIND[volume.unit] !== 'volume' || density.unit !== 'g/cm3') throw new UnitError('جرم = حجم × چگالی (g/cm³).');
  return q(to(volume, 'cm3').value * density.value, 'g');
}
export function volumeFor(mass, density) {
  if (KIND[mass.unit] !== 'mass' || density.unit !== 'g/cm3') throw new UnitError('حجم = جرم ÷ چگالی.');
  return q(to(mass, 'g').value / density.value, 'cm3');
}
export const round = (x, d = 3) => q(Math.round(x.value * 10 ** d) / 10 ** d, x.unit);
export const fmt = (x, d = 2) => `${(Math.round(x.value * 10 ** d) / 10 ** d).toLocaleString('fa-IR')} ${{ mm: 'میلی‌متر', cm: 'سانتی‌متر', mm2: 'میلی‌متر مربع', mm3: 'میلی‌متر مکعب', cm3: 'سانتی‌متر مکعب', g: 'گرم', mg: 'میلی‌گرم', kg: 'کیلوگرم', ct: 'قیراط', 'g/cm3': 'گرم بر سانتی‌متر مکعب' }[x.unit] ?? x.unit}`;
