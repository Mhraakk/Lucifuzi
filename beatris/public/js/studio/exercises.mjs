// تمرین‌های استودیو (spec 0016): small studio projects with a brief and measurable constraints. The trainee designs
// (parameters, step by step); the engine builds and measures; the assessment says which constraint holds and which
// does not — with hints in levels, never the finished numbers unless asked.
import { diameterFromIso } from './ring.mjs';

const r2 = (x) => Math.round(x * 100) / 100;
export const STUDIO_EXERCISES = [
  {
    id: 'solitaire-oval', title: 'انگشتر سولیتر بیضی ۱۸ عیار', difficulty: 'intermediate',
    brief: 'یک انگشتر سولیتر ۱۸ عیار با سنگ مرکزی بیضی ۸×۶ بسازید؛ وزن نهایی ۳٫۲ تا ۳٫۸ گرم، مناسب ریخته‌گری، با حداقل ضخامت سازه‌ای و راحت برای استفاده روزمره. سایز ۵۴.',
    target: { material: 'au18y', weight: [3.2, 3.8], ringSizeIso: 54, stone: { shape: 'oval', dims: [8, 6] } },
    stages: ['shank', 'setting', 'weight', 'final'],
    skills: ['cad.ring', 'set.prong', 'mfg.weight', 'mfg.constraints', 'mfg.casting'],
    start: { innerDiameter: 17.19, widthTop: 2.0, widthBottom: 1.6, thickTop: 1.3, thickBottom: 1.0, headHeight: 2.5, setting: { type: 'prong', stoneShape: 'oval', stoneWidthMm: 6, stoneLengthMm: 8, prongCount: 4, prongDiameterMm: 0.6 } },
  },
  {
    id: 'plain-band', title: 'حلقه ساده ۴ میلی‌متری', difficulty: 'beginner',
    brief: 'یک حلقه ساده ۱۸ عیار با پهنای ۴ میلی‌متر بسازید؛ وزن ۴ تا ۵ گرم، سایز ۵۶، ضخامت یکنواخت و محکم.',
    target: { material: 'au18y', weight: [4, 5], ringSizeIso: 56, width: 4 },
    stages: ['shank', 'weight', 'final'],
    skills: ['cad.ring', 'cad.parametric', 'mfg.weight'],
    start: { innerDiameter: 17.83, widthTop: 3, widthBottom: 3, thickTop: 1.2, thickBottom: 1.2, headHeight: null, setting: null },
  },
  {
    id: 'weight-cut', title: 'کاهش وزن بدون دست زدن به نگین', difficulty: 'advanced',
    brief: 'این انگشتر ۰٫۸ گرم سنگین‌تر از سفارش است. وزن را به زیر ۳٫۴ گرم برسانید، بی‌آنکه سر نگین تغییر کند یا شانه‌ها ضعیف شوند.',
    target: { material: 'au18y', weight: [0, 3.4], ringSizeIso: 54, keepSetting: true, keepShoulders: true },
    stages: ['weight', 'final'],
    skills: ['mfg.weight', 'cad.parametric', 'mfg.constraints'],
    start: { innerDiameter: 17.19, widthTop: 2.8, widthBottom: 2.8, thickTop: 1.8, thickBottom: 1.8, headHeight: 3.3, setting: { type: 'prong', stoneShape: 'oval', stoneWidthMm: 6, stoneLengthMm: 8, prongCount: 4, prongDiameterMm: 0.8, seatDepthMm: 0.27 } },
  },
  {
    id: 'thin-fix', title: 'اصلاح مدل نازک برای ریخته‌گری', difficulty: 'intermediate',
    brief: 'کارگاه ریخته‌گری این مدل را برگردانده: کف رکاب و چنگ‌ها نازک‌اند. مدل را برای ریخته‌گری ۱۸ عیار اصلاح کنید و وزن را زیر ۳٫۶ گرم نگه دارید.',
    target: { material: 'au18y', weight: [0, 3.6], ringSizeIso: 52 },
    stages: ['shank', 'setting', 'final'],
    skills: ['mfg.constraints', 'set.prong', 'mfg.casting'],
    start: { innerDiameter: 16.55, widthTop: 2.2, widthBottom: 1.5, thickTop: 1.4, thickBottom: 0.7, headHeight: 3.0, setting: { type: 'prong', stoneShape: 'round', stoneWidthMm: 6, prongCount: 4, prongDiameterMm: 0.5, seatDepthMm: 0.2 } },
  },
];
export const EXERCISE = Object.fromEntries(STUDIO_EXERCISES.map((e) => [e.id, e]));

/**
 * Grade a design against its exercise. findings: engineering/setting/weight findings of the measured model.
 * Criteria: size, weight in range, structure (no critical/high engineering), setting valid, constraints kept.
 */
export function assessExercise(ex, params, insp, findings) {
  const crit = {};
  const bad = (sev) => findings.filter((f) => f.kind !== 'aesthetic' && (sev === 'all' ? ['critical', 'high'].includes(f.severity) : f.severity === sev));
  const dSize = Math.abs(params.innerDiameter - diameterFromIso(ex.target.ringSizeIso));
  crit.size = dSize <= 0.1 ? 1 : 0;
  const w = insp.weight.value, [lo, hi] = ex.target.weight;
  crit.weight = w >= lo && w <= hi ? 1 : Math.max(0, 1 - Math.min(Math.abs(w - lo), Math.abs(w - hi)) / 1.5);
  crit.structure = bad('all').filter((f) => f.kind === 'engineering').length ? 0 : 1;
  if (ex.target.stone || params.setting) crit.setting = findings.some((f) => f.kind === 'setting' && ['critical', 'high'].includes(f.severity)) ? 0 : 1;
  if (ex.target.width) crit.width = Math.abs(params.widthTop - ex.target.width) <= 0.1 && Math.abs(params.widthBottom - ex.target.width) <= 0.1 ? 1 : 0;
  if (ex.target.keepSetting) crit.keepSetting = JSON.stringify(params.setting) === JSON.stringify(ex.start.setting) && params.headHeight === ex.start.headHeight ? 1 : 0;
  if (ex.target.keepShoulders) crit.keepShoulders = params.widthTop >= ex.start.widthTop && params.thickTop >= ex.start.thickTop ? 1 : 0;
  const vals = Object.values(crit);
  const score = r2(vals.reduce((s, v) => s + v, 0) / vals.length);
  const skills = {};
  for (const s of ex.skills) {
    const own = s === 'mfg.weight' ? crit.weight : s.startsWith('set.') ? crit.setting ?? 1 : s === 'mfg.constraints' || s === 'mfg.casting' ? crit.structure : score;
    skills[s] = r2((own + score) / 2);
  }
  return { score, passed: vals.every((v) => v === 1), criteria: crit, findings, skills };
}

/** Hints in levels from the failing criteria: 1 what fails, 2 which parameters move it, 3 the rule; never numbers to type. */
export function studioHint(ex, lastAssessment, level = 1) {
  const failing = Object.entries(lastAssessment?.criteria ?? {}).filter(([, v]) => v < 1).map(([k]) => k);
  if (!failing.length) return { level, text: lastAssessment ? 'همه شرط‌ها برقرار است؛ ثبت نهایی کنید.' : 'اول یک طرح بسازید و بررسی کنید.' };
  const WHAT = { size: 'سایز انگشتر', weight: 'وزن', structure: 'استحکام و ریخته‌گری', setting: 'نگین‌گذاری', width: 'پهنای حلقه', keepSetting: 'سر نگین نباید تغییر کند', keepShoulders: 'شانه‌ها نباید ضعیف شوند' };
  const HOW = { size: 'قطر داخلی', weight: 'پهنا و ضخامت پایین رکاب (کف حلقه) بیشترین اثر را بر وزن دارند', structure: 'ضخامت کف رکاب و پهنای آن', setting: 'تعداد و قطر چنگ و ارتفاع سر', width: 'پهنای بالا و پایین', keepSetting: 'پارامترهای نگین و ارتفاع سر را به حالت اول برگردانید', keepShoulders: 'پهنا و ضخامت بالا (شانه‌ها) را کم نکنید' };
  const RULE = { size: 'قطر داخلی = محیط سایز ISO ÷ π', weight: 'وزن = حجم فلز × چگالی آلیاژ (۱۸ عیار زرد ≈ ۱۵٫۵ گرم بر سانتی‌متر مکعب)', structure: 'ضخامت سازه‌ای ۱۸ عیار دست‌کم ۱٫۰ و جای پرداخت ۰٫۱ میلی‌متر', setting: 'قطر چنگ دست‌کم ۰٫۷ میلی‌متر یا ۱۰٪ بزرگ‌ترین بعد سنگ؛ کولت دست‌کم ۰٫۳ میلی‌متر بالای رکاب', width: 'پهنای ثابت در همه حلقه', keepSetting: 'بهینه‌سازی وزن فقط روی کف رکاب', keepShoulders: 'شانه‌ها بار سر نگین را می‌برند' };
  const f = failing[0];
  return { level, text: level <= 1 ? `هنوز برقرار نیست: ${failing.map((k) => WHAT[k]).join('، ')}.` : level === 2 ? `برای «${WHAT[f]}»: ${HOW[f]}.` : `قاعده: ${RULE[f]}.` };
}
