// از بریف تا مدل و از مدل تا یافته‌ها (spec 0016): design intent → ring parameters → a CAD program; inspection →
// manufacturing findings (engineering), critique (aesthetics) and weight evaluation — kept apart, because a design
// can be beautiful and impossible, or buildable and clumsy. Weight is reduced only by a constrained search over
// the parameters a jeweller allows to change, then re-measured and re-validated.
import { MATERIALS, materialFor } from './materials.mjs';
import { diameterFromIso, shankMesh, stoneProportions } from './ring.mjs';
import { checkSetting } from './setting.mjs';
import * as G from './geometry.mjs';
import { weightOf } from './materials.mjs';

const r2 = (x) => Math.round(x * 100) / 100;
const F = (code, kind, severity, titleFa, explanationFa, ev = null, action = null, ref = null) => ({ code, kind, severity, titleFa, explanationFa, ...(ev ? { measurableEvidence: ev } : {}), ...(action ? { recommendedActionFa: action } : {}), ...(ref ? { geometryRef: ref } : {}) });

/** Ring parameters from an intent: the sizes a bench jeweller would start from for that style and stone. */
export function paramsFromIntent(intent) {
  const material = intent.material ?? materialFor(intent.targetKarat ?? 18);
  const delicate = (intent.style ?? []).some((s) => ['مینیمال', 'ظریف', 'ایتالیایی'].includes(s));
  const bold = (intent.style ?? []).includes('جسورانه');
  const dims = intent.stone?.dimensionsMm ?? [];
  const shape = intent.stone?.shape ?? (intent.stone ? 'round' : null);
  const L = dims[0] ?? (shape === 'oval' ? 7 : 5.5), W = dims[1] ?? (shape === 'round' || !dims[0] ? L : L * 0.72);
  const mat = MATERIALS[material];
  const p = {
    material,
    innerDiameter: r2(diameterFromIso(intent.ringSizeIso ?? 54)),
    widthTop: delicate ? 2.2 : bold ? 3.4 : 2.6,
    widthBottom: delicate ? 1.8 : bold ? 3.0 : 2.2,
    thickTop: Math.max(mat.minStructural + 0.3, delicate ? 1.5 : 1.7),
    thickBottom: Math.max(mat.minStructural + 0.1, delicate ? 1.25 : 1.5),
    headHeight: null,
    setting: null,
  };
  if (shape) {
    const spec = { type: intent.stone?.setting ?? 'prong', stoneShape: shape, stoneType: intent.stone?.type ?? 'diamond', stoneWidthMm: r2(Math.min(W, L)), stoneLengthMm: r2(Math.max(W, L)) };
    const { pavilion } = stoneProportions(spec);
    spec.prongCount = shape === 'round' ? 4 : Math.max(W, L) > 8 ? 6 : 4;
    spec.prongDiameterMm = r2(Math.max(mat.minProng, 0.1 * Math.max(W, L)));
    spec.seatDepthMm = r2(Math.min(spec.prongDiameterMm / 2, Math.max(0.15, spec.prongDiameterMm / 3)));
    p.setting = spec;
    p.headHeight = r2(pavilion + 0.6); // the culet clears the shank by ~0.6 mm
  }
  return p;
}

/** The CAD program of a ring: a shank, and a setting on it when there is a stone. */
export function programOf(p) {
  const ops = [{ op: 'shank', id: 'shank', innerDiameter: p.innerDiameter, widthTop: p.widthTop, widthBottom: p.widthBottom, thickTop: p.thickTop, thickBottom: p.thickBottom }];
  if (p.setting) ops.push({ op: 'stoneSetting', id: 'head', on: 'shank', spec: p.setting, headHeightMm: p.headHeight });
  return ops;
}

/**
 * Manufacturing findings from an inspection (measured) and the parameters (declared). The rules detect; a model
 * may only explain. Thresholds come from the material profile.
 */
export function manufacturingFindings(insp, p, { method = 'casting' } = {}) {
  const mat = MATERIALS[insp.material] ?? MATERIALS.au18y;
  const out = [];
  if (!insp.closed) out.push(F('OPEN_MESH', 'engineering', 'critical', 'مدل بسته نیست', 'سطح مدل سوراخ یا لبه باز دارد؛ چنین مدلی نه ریخته‌گری می‌شود نه چاپ.', null, 'مدل را بسته (solid) کنید.'));
  if (insp.solids > 1) out.push(F('FLOATING_PART', 'engineering', 'critical', 'قطعه جدا از بدنه', `فلز مدل ${insp.solids} تکه جدا است؛ قطعه‌ای که به بدنه وصل نیست در ریخته‌گری جدا می‌افتد یا مونتاژ جدا می‌خواهد.`, { expected: 1, actual: insp.solids, unit: 'تکه' }, 'چنگ یا گالری را به رکاب برسانید.'));
  // every measured metal body, not only an untouched shank: a shelled, scaled or modelled body is checked the same way
  const walled = insp.objects.filter((o) => o.wall).sort((a, b) => a.wall.min.value - b.wall.min.value);
  const shank = walled[0];
  if (shank) {
    const ref = shank.id;
    const t = shank.wall.min.value;
    if (t < mat.minWall) out.push(F('WALL_TOO_THIN', 'engineering', 'critical', 'ضخامت دیواره کمتر از حد ریخته‌گری', `نازک‌ترین نقطه رکاب ${r2(t)} میلی‌متر است؛ برای ${mat.fa} کمتر از ${mat.minWall} میلی‌متر فلز در قالب پر نمی‌شود.`, { expected: mat.minWall, actual: r2(t), unit: 'mm' }, 'ضخامت پایین رکاب را بیشتر کنید.', ref));
    else if (t < mat.minStructural) out.push(F('STRUCTURE_THIN', 'engineering', 'high', 'رکاب برای استفاده روزمره ضعیف است', `نازک‌ترین نقطه رکاب ${r2(t)} میلی‌متر است؛ زیر ${mat.minStructural} میلی‌متر انگشتر با فشار دست بیضی می‌شود.`, { expected: mat.minStructural, actual: r2(t), unit: 'mm' }, `ضخامت را به ${mat.minStructural} یا بیشتر برسانید.`, ref));
    if (t - 0.1 < mat.minStructural && t >= mat.minStructural) out.push(F('POLISH_ALLOWANCE', 'engineering', 'warning', 'جای پرداخت نمانده است', `پرداخت حدود ۰٫۱ میلی‌متر برمی‌دارد؛ پس از آن ضخامت ${r2(t - 0.1)} می‌شود که از حد ${mat.minStructural} کمتر است.`, { expected: r2(mat.minStructural + 0.1), actual: r2(t), unit: 'mm' }, '۰٫۱ میلی‌متر به ضخامت اضافه کنید.', ref));
  }
  if (p) {
    if (p.thickTop / p.thickBottom > 2.5) out.push(F('THICKNESS_JUMP', 'engineering', 'warning', 'تغییر ضخامت تند است', `ضخامت بالا ${p.thickTop} و پایین ${p.thickBottom} است؛ جهش بیش از ۲٫۵ برابر در ریخته‌گری جای انقباض و تخلخل می‌سازد.`, { expected: 2.5, actual: r2(p.thickTop / p.thickBottom), unit: 'نسبت' }));
    if (p.widthBottom < 1.6 && p.thickBottom < 1.3) out.push(F('DEFORMATION_RISK', 'engineering', 'warning', 'کف رکاب خم می‌شود', `پهنای ${p.widthBottom} و ضخامت ${p.thickBottom} میلی‌متر در کف حلقه با فشار روزانه تغییر شکل می‌دهد.`, null, 'یکی از پهنا یا ضخامت کف را بیشتر کنید.'));
  }
  const head = insp.objects.find((o) => o.kind === 'head');
  if (head?.measures) {
    const m = head.measures;
    if (m.culetClearanceMm < 0.3) out.push(F('STONE_CLEARANCE', 'engineering', 'high', 'نوک سنگ به رکاب یا انگشت می‌رسد', `فاصله نوک (کولت) سنگ تا روی رکاب ${m.culetClearanceMm} میلی‌متر است؛ کمتر از ۰٫۳ سنگ به انگشت فشار می‌آورد و می‌پرد.`, { expected: 0.3, actual: m.culetClearanceMm, unit: 'mm' }, 'ارتفاع سر را بیشتر کنید.', 'head'));
    if (m.prongOverCrownMm < 0.4) out.push(F('PRONG_GRIP', 'engineering', 'high', 'چنگ روی سنگ کم است', `سر چنگ ${m.prongOverCrownMm} میلی‌متر بالای کمربند است؛ کمتر از ۰٫۴ پس از پرداخت سنگ را نگه نمی‌دارد.`, { expected: 0.4, actual: m.prongOverCrownMm, unit: 'mm' }, null, 'head'));
  }
  if (p?.setting) for (const s of checkSetting(p.setting, insp.material)) out.push({ ...s, geometryRef: 'head' });
  if (method === 'casting' && insp.objects.some((o) => o.kind === 'head') && (p?.setting?.prongDiameterMm ?? 1) < 0.8) out.push(F('CASTING_FINE_DETAIL', 'engineering', 'warning', 'چنگ ریز برای ریخته‌گری', 'چنگ زیر ۰٫۸ میلی‌متر در ریخته‌گری کامل پر نمی‌شود؛ یا ضخیم‌تر کنید یا سر را جدا بسازید و لحیم کنید.', { expected: 0.8, actual: p.setting.prongDiameterMm, unit: 'mm' }));
  return out;
}

/** Weight against the brief: over, under, or in range — with how far. */
export function weightFindings(insp, intent) {
  const w = insp.weight.value;
  const [lo, hi] = intent?.weightRangeGrams ?? (intent?.targetWeightGrams ? [0, intent.targetWeightGrams] : [null, null]);
  if (hi == null) return [];
  if (w > hi) return [F('WEIGHT_OVER', 'weight', 'high', 'وزن بیشتر از هدف', `وزن تخمینی ${r2(w)} گرم است؛ هدف حداکثر ${hi} گرم است (${r2(w - hi)} گرم اضافه).`, { expected: hi, actual: r2(w), unit: 'g' }, 'کاهش وزن کنترل‌شده را اجرا کنید؛ سر نگین و شانه‌ها دست نمی‌خورند.')];
  if (lo && w < lo) return [F('WEIGHT_UNDER', 'weight', 'warning', 'وزن کمتر از هدف', `وزن تخمینی ${r2(w)} گرم کمتر از ${lo} گرم مورد انتظار است.`, { expected: lo, actual: r2(w), unit: 'g' })];
  return [];
}

/** Aesthetic critique (proportion, taper, stone-to-metal, style fit). Advice, never a manufacturing verdict. */
export function critique(p, intent) {
  const out = [];
  const A = (code, sev, t, e, ev) => out.push(F(code, 'aesthetic', sev, t, e, ev));
  if (p.setting) {
    const big = Math.max(p.setting.stoneWidthMm, p.setting.stoneLengthMm ?? 0);
    const ratio = r2(big / p.widthTop);
    if (ratio < 1.8) A('STONE_SMALL_FOR_BAND', 'info', 'سنگ کنار رکاب کوچک دیده می‌شود', `نسبت سنگ به پهنای رکاب ${ratio} است؛ معمولاً ۱٫۸ تا ۳٫۵ سنگ را مرکز نگاه می‌کند.`, { expected: 1.8, actual: ratio, unit: 'نسبت' });
    if (ratio > 3.8) A('BAND_THIN_FOR_STONE', 'info', 'رکاب برای سنگ کم‌وزن دیده می‌شود', `نسبت ${ratio} یعنی سنگ روی رکاب «شناور» دیده می‌شود؛ برای تعادل، شانه‌ها را کمی پهن‌تر کنید.`, { expected: 3.5, actual: ratio, unit: 'نسبت' });
    const lowProfile = p.headHeight < 3;
    if ((intent?.style ?? []).includes('مینیمال') && p.headHeight > 4.5) A('HIGH_HEAD_FOR_MINIMAL', 'info', 'سر بلند با سبک مینیمال نمی‌خواند', 'سر بلند حضور سنگ را پررنگ می‌کند؛ برای مینیمال سر کوتاه‌تر یا رکاب‌دار هماهنگ‌تر است.');
    if (lowProfile && (intent?.constraints ?? []).some((c) => /روزمره/.test(c))) A('GOOD_DAILY_PROFILE', 'info', 'سر کوتاه برای استفاده روزمره مناسب است', 'سر کوتاه کمتر به لباس و اشیا گیر می‌کند.');
  }
  const taper = r2(p.widthTop / p.widthBottom);
  if (taper > 1.8) A('TAPER_STRONG', 'info', 'باریک‌شدن رکاب تند است', `نسبت پهنای بالا به پایین ${taper} است؛ بیش از ۱٫۸ فرم را شکسته نشان می‌دهد.`, { expected: 1.8, actual: taper, unit: 'نسبت' });
  if ((intent?.style ?? []).some((s) => s === 'مینیمال' || s === 'ظریف') && p.widthTop > 3) A('WIDE_FOR_DELICATE', 'info', 'رکاب برای سبک ظریف پهن است', `پهنای ${p.widthTop} میلی‌متر سبک ظریف/مینیمال را سنگین می‌کند؛ ۱٫۸ تا ۲٫۶ رایج‌تر است.`, { expected: 2.6, actual: p.widthTop, unit: 'mm' });
  return out;
}

/** Volume and weight of the parameters without building the full head again (used by the optimiser). */
function shankWeight(p) {
  return weightOf(G.volume(shankMesh(p, { segments: 96, section: 16 })), p.material).value;
}

/**
 * Reduce (or reach) a weight under constraints: only the listed parameters move, each never below its minimum;
 * the setting is never touched. A bisection on one scale factor shared by the free parameters (weight is monotone
 * in it). Returns the new parameters and the measured weights, or the closest feasible with a reason.
 */
export function optimizeWeight(p, { headWeight = 0, targetGrams, free = ['widthBottom', 'thickBottom'], lockShoulders = true }) {
  const mat = MATERIALS[p.material] ?? MATERIALS.au18y;
  const mins = { widthBottom: 1.5, thickBottom: mat.minStructural + 0.1, widthTop: lockShoulders ? p.widthTop : 1.6, thickTop: lockShoulders ? p.thickTop : mat.minStructural + 0.2 };
  const vars = free.filter((k) => !(lockShoulders && (k === 'widthTop' || k === 'thickTop')));
  if (!vars.length) return { feasible: false, reason: 'هیچ پارامتری برای تغییر آزاد نیست.', params: p };
  const at = (s) => {
    const q2 = { ...p };
    for (const k of vars) q2[k] = Math.max(mins[k], r2(p[k] * s));
    return q2;
  };
  const total = (q2) => shankWeight(q2) + headWeight;
  const before = total(p);
  if (before <= targetGrams) return { feasible: true, params: p, before: r2(before), after: r2(before), changed: [] };
  const floor = total(at(0));
  if (floor > targetGrams) return { feasible: false, reason: `با حفظ حداقل‌های ساخت (${vars.map((k) => `${k} ≥ ${mins[k]}`).join('، ')}) وزن به کمتر از ${r2(floor)} گرم نمی‌رسد.`, params: at(0), before: r2(before), after: r2(floor), changed: vars };
  let lo = 0, hi = 1;
  for (let i = 0; i < 28; i++) {
    const mid = (lo + hi) / 2;
    total(at(mid)) > targetGrams ? (hi = mid) : (lo = mid);
  }
  const out = at(lo);
  return { feasible: true, params: out, before: r2(before), after: r2(total(out)), changed: vars.map((k) => ({ param: k, from: p[k], to: out[k] })) };
}
