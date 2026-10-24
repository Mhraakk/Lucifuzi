// سنگ‌گذاری (spec 0016): what makes a setting spec valid, as rules with the measured or declared value beside the
// expected one. Thresholds are common bench practice for gold (a shop may tighten them); each rule says why.
import { MATERIALS } from './materials.mjs';
import { stoneProportions } from './ring.mjs';

const HARD = new Set(['diamond', 'sapphire', 'ruby', 'cz']);
const f = (code, severity, titleFa, explanationFa, ev, recommendedActionFa) => ({ code, kind: 'setting', severity, titleFa, explanationFa, ...(ev ? { measurableEvidence: ev } : {}), ...(recommendedActionFa ? { recommendedActionFa } : {}) });

/** Findings for a StoneSettingSpec on a material (empty = valid). */
export function checkSetting(spec, material = 'au18y') {
  const mat = typeof material === 'string' ? MATERIALS[material] : material;
  const out = [];
  const { W, L, depth } = stoneProportions(spec);
  const big = Math.max(W, L);
  if (spec.type === 'prong') {
    const minCount = spec.stoneShape === 'round' ? 3 : spec.stoneShape === 'pear' || spec.stoneShape === 'marquise' || spec.stoneShape === 'heart' ? 3 : 4;
    const n = spec.prongCount ?? 0;
    if (n < minCount) out.push(f('PRONG_COUNT', 'high', 'تعداد چنگ کم است', `سنگ ${spec.stoneShape} با ${n} چنگ پایدار نمی‌ماند؛ دست‌کم ${minCount} چنگ لازم است تا سنگ در هر جهت مهار شود.`, { expected: minCount, actual: n, unit: 'عدد' }, `تعداد چنگ را به ${minCount} یا بیشتر برسانید.`));
    if ((spec.stoneShape === 'pear' || spec.stoneShape === 'marquise' || spec.stoneShape === 'heart') && n < 5) out.push(f('POINT_PROTECTION', 'warning', 'نوک تیز سنگ محافظت ندارد', 'نوک‌های تیز اشکی، مارکیز و قلب ضربه‌پذیرترین نقطه سنگ‌اند و معمولاً یک چنگ V یا چنگ جدا برای هر نوک می‌خواهند.', null, 'برای هر نوک یک چنگ V بگذارید.'));
    if (big > 8 && n < 6 && spec.stoneShape !== 'round') out.push(f('PRONG_COUNT_LARGE', 'warning', 'برای سنگ بزرگ چنگ بیشتر بهتر است', `سنگ ${big} میلی‌متری با ${n} چنگ اگر یک چنگ خم شود می‌افتد؛ ۶ چنگ اطمینان بیشتری دارد.`, { expected: 6, actual: n, unit: 'عدد' }));
    const minD = Math.max(mat.minProng, Math.round(0.1 * big * 100) / 100);
    const d = spec.prongDiameterMm ?? 0;
    if (d < minD) out.push(f('PRONG_THIN', d < mat.minProng ? 'critical' : 'high', 'چنگ نازک است', `قطر چنگ ${d} میلی‌متر است؛ برای این فلز و سنگ ${big} میلی‌متری دست‌کم ${minD} لازم است، وگرنه در پرداخت و استفاده می‌ساید یا باز می‌شود.`, { expected: minD, actual: d, unit: 'mm' }, `قطر چنگ را به ${minD} میلی‌متر برسانید.`));
    const seat = spec.seatDepthMm;
    const maxSeat = Math.round(((spec.prongDiameterMm ?? 0.8) / 2) * 100) / 100;
    if (seat != null && (seat < 0.15 || seat > maxSeat)) out.push(f('SEAT_DEPTH', 'warning', 'عمق شیار نشیمن مناسب نیست', `شیار نشیمن ${seat} میلی‌متر است؛ کمتر از ۰٫۱۵ کمربند سنگ را نمی‌گیرد و بیش از نصف قطر چنگ (${maxSeat}) چنگ را از همان‌جا می‌شکند.`, { expected: seat < 0.15 ? 0.15 : maxSeat, actual: seat, unit: 'mm' }));
  }
  if (spec.type === 'bezel') {
    const wall = spec.wallMm ?? 0, need = Math.max(0.5, Math.round(0.06 * big * 100) / 100);
    if (wall < need) out.push(f('BEZEL_WALL', 'high', 'دیواره رکاب نازک است', `دیواره ${wall} میلی‌متر هنگام خواباندن روی سنگ چروک یا ترک می‌خورد؛ برای این سنگ دست‌کم ${need} لازم است.`, { expected: need, actual: wall, unit: 'mm' }));
    const over = spec.seatDepthMm ?? 0;
    if (over < 0.4) out.push(f('BEZEL_GRIP', 'warning', 'لبه رکاب سنگ را کم می‌گیرد', 'لبه رکاب باید دست‌کم ۰٫۴ میلی‌متر از کمربند سنگ بالاتر برود تا پس از خواباندن، سنگ را بگیرد.', { expected: 0.4, actual: over, unit: 'mm' }));
  }
  if (spec.type === 'channel' && big > 4) out.push(f('CHANNEL_SIZE', 'high', 'سنگ برای ریل بزرگ است', 'در کار ریلی سنگ‌ها فقط از دو لبه گرفته می‌شوند؛ بالای ۴ میلی‌متر لبه‌ها باید آن‌قدر بلند شوند که ظاهر و استحکام هر دو آسیب می‌بیند.', { expected: 4, actual: big, unit: 'mm' }));
  if (spec.type === 'pave') {
    if (big > 2.5) out.push(f('PAVE_SIZE', 'high', 'سنگ برای پاوه بزرگ است', 'پاوه برای سنگ‌های ریز است؛ دانه‌های فلز نمی‌توانند سنگ بزرگ‌تر از ۲٫۵ میلی‌متر را نگه دارند.', { expected: 2.5, actual: big, unit: 'mm' }));
    if ((spec.spacingMm ?? 0) < 0.1) out.push(f('PAVE_SPACING', 'warning', 'فاصله سنگ‌ها کم است', 'سنگ‌های پاوه به فاصله دست‌کم ۰٫۱ میلی‌متر برای دانه فلز نیاز دارند؛ سنگ چسبیده به سنگ لب‌پر می‌شود.', { expected: 0.1, actual: spec.spacingMm ?? 0, unit: 'mm' }));
    if ((spec.beadsPerStone ?? 0) < 3) out.push(f('PAVE_BEADS', 'warning', 'دانه نگه‌دارنده کم است', 'هر سنگ پاوه با دست‌کم سه دانه (مشترک با همسایه‌ها) مهار می‌شود.', { expected: 3, actual: spec.beadsPerStone ?? 0, unit: 'عدد' }));
  }
  if (spec.type === 'flush') {
    if (big > 3) out.push(f('FLUSH_SIZE', 'warning', 'سنگ برای کار خوابیده درشت است', 'کار خوابیده برای سنگ‌های تا حدود ۳ میلی‌متر مطمئن است؛ سنگ درشت‌تر فلز ضخیم و سنگین می‌خواهد.', { expected: 3, actual: big, unit: 'mm' }));
    const md = spec.metalDepthMm ?? 0;
    if (md < depth + 0.3) out.push(f('FLUSH_DEPTH', 'high', 'فلز برای نشاندن سنگ کم‌عمق است', `سنگ ${depth} میلی‌متر عمق دارد و کولت آن باید دست‌کم ۰٫۳ میلی‌متر در فلز بنشیند؛ فلز ${md} میلی‌متری کافی نیست.`, { expected: Math.round((depth + 0.3) * 100) / 100, actual: md, unit: 'mm' }));
  }
  if (spec.type === 'tension') {
    if (!HARD.has(spec.stoneType ?? 'diamond')) out.push(f('TENSION_STONE', 'critical', 'این سنگ برای تنشن مناسب نیست', 'در تنشن فقط فشار فلز سنگ را نگه می‌دارد؛ سنگ نرم‌تر از یاقوت زیر این فشار می‌شکند.', null, 'رکاب یا چنگ انتخاب کنید.'));
    if ((spec.metalDepthMm ?? 0) < 1.8) out.push(f('TENSION_METAL', 'high', 'فلز تنشن کم است', 'بدنه تنشن باید دست‌کم ۱٫۸ میلی‌متر و از آلیاژ سخت‌شده باشد تا فشار را نگه دارد.', { expected: 1.8, actual: spec.metalDepthMm ?? 0, unit: 'mm' }));
  }
  if (spec.type === 'halo' && (spec.haloStoneMm ?? 0) > 1.5) out.push(f('HALO_STONES', 'warning', 'سنگ‌های هاله درشت‌اند', 'هاله با سنگ‌های تا ۱٫۵ میلی‌متر سنگ مرکزی را بزرگ‌تر نشان می‌دهد؛ درشت‌ترشان با سنگ اصلی رقابت می‌کند و دیواره را پهن می‌کند.', { expected: 1.5, actual: spec.haloStoneMm, unit: 'mm' }));
  return out;
}
