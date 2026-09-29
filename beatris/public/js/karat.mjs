// موتور تبدیل عیار (spec 0002 #12): any piece of gold — weight and fineness in any common spelling — to the units the
// market speaks: pure gold, grams of 750, mesghal of 705 (the مظنه unit), karat, and its value at a مظنه. The same
// rules as the desk: the 750-equivalent is rounded to 3 decimals first (قاعده دفتر).
import { MESGHAL_G, MAZANEH_TO_G750 } from './calc.mjs';

const r3 = (x) => Math.round(x * 1000) / 1000;
const faDigits = (s) => String(s ?? '').replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[٫,]/g, '.').replace(/٬/g, '');

/**
 * Fineness per mille from what people type: «750», «18k», «18 عیار», «0.75», «24», «995», «999.9».
 * A bare number ≤ 24 is karat, ≤ 1 is a fraction, otherwise per mille. Returns null when it is not a fineness.
 */
export function parseFineness(input) {
  const s = faDigits(input).trim().toLowerCase();
  const m = /^(\d+(?:\.\d+)?)\s*(k|kt|karat|قیراط|عیار)?$/.exec(s);
  if (!m) return null;
  const v = Number(m[1]);
  if (!(v > 0)) return null;
  let f;
  if (m[2] && m[2] !== 'عیار') f = (v / 24) * 1000;
  else if (v <= 1) f = v * 1000;
  else if (v <= 24) f = (v / 24) * 1000;
  else f = v;
  return f > 0 && f <= 1000 ? Math.round(f * 10) / 10 : null;
}

/** Everything about one piece. weight in grams, fineness per mille, mazaneh (optional) in rial per mesghal of 705. */
export function convert(weight, fineness, { mazaneh = null } = {}) {
  const w = Number(weight), f = Number(fineness);
  if (!(w > 0) || !(f > 0 && f <= 1000)) throw new Error('وزن و عیار باید مثبت باشند (عیار حداکثر ۱۰۰۰).');
  const g750 = r3((w * f) / 750);
  const out = {
    weight: r3(w),
    fineness: f,
    karat: Math.round(((f * 24) / 1000) * 100) / 100,
    pure: r3((w * f) / 1000),
    g750,
    mesghal705: r3((w * f) / 705 / MESGHAL_G),
    at: (target) => r3((w * f) / target), // the weight this gold would weigh at another fineness
  };
  if (mazaneh > 0) out.value = Math.round((g750 * mazaneh) / MAZANEH_TO_G750);
  return out;
}

/** Many pieces → one total in pure and 750 (each piece rounded first, like the ledger). */
export function totalOf(pieces) {
  let pure = 0, g750 = 0, weight = 0;
  for (const p of pieces) {
    const c = convert(p.weight, p.fineness);
    pure += c.pure;
    g750 += c.g750;
    weight += c.weight;
  }
  return { weight: r3(weight), pure: r3(pure), g750: r3(g750), avgFineness: weight ? Math.round((pure / weight) * 10000) / 10 : 0 };
}
