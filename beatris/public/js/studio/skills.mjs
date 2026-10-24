// گراف مهارت استودیو (spec 0016): CAD, setting and manufacturing skills on the shared skill graph — the same mastery
// model as accounting, under the competencies «طراحی و CAD»، «سنگ‌گذاری» and «ساخت».
import { createGraph } from '../skillgraph.mjs';

export const STUDIO_SKILLS = [
  { id: 'cad.fund', fa: 'مبانی CAD جواهر', parent: null, needs: [], competency: 'cad' },
  { id: 'cad.curves', fa: 'منحنی‌ها', parent: 'cad.fund', needs: [], competency: 'cad' },
  { id: 'cad.surfaces', fa: 'سطح‌ها', parent: 'cad.fund', needs: ['cad.curves'], competency: 'cad' },
  { id: 'cad.solids', fa: 'حجم‌ها', parent: 'cad.fund', needs: ['cad.surfaces'], competency: 'cad' },
  { id: 'cad.boolean', fa: 'عملیات بولی', parent: 'cad.fund', needs: ['cad.solids'], competency: 'cad' },
  { id: 'cad.sweep', fa: 'سوییپ', parent: 'cad.fund', needs: ['cad.curves'], competency: 'cad' },
  { id: 'cad.loft', fa: 'لافت', parent: 'cad.fund', needs: ['cad.curves'], competency: 'cad' },
  { id: 'cad.revolve', fa: 'ریوالو', parent: 'cad.fund', needs: ['cad.curves'], competency: 'cad' },
  { id: 'cad.fillet', fa: 'فیلت', parent: 'cad.fund', needs: ['cad.solids'], competency: 'cad' },
  { id: 'cad.symmetry', fa: 'تقارن', parent: 'cad.fund', needs: [], competency: 'cad' },
  { id: 'cad.parametric', fa: 'مدل‌سازی پارامتری', parent: 'cad.fund', needs: ['cad.solids'], competency: 'cad' },
  { id: 'cad.ring', fa: 'ساخت انگشتر', parent: 'cad.fund', needs: [], competency: 'cad' },
  { id: 'set.stone', fa: 'سنگ‌گذاری', parent: 'cad.fund', needs: ['cad.ring'], competency: 'setting' },
  { id: 'set.prong', fa: 'چنگ', parent: 'cad.fund', needs: ['set.stone'], competency: 'setting' },
  { id: 'set.bezel', fa: 'رکاب‌دار', parent: 'cad.fund', needs: ['set.stone'], competency: 'setting' },
  { id: 'set.pave', fa: 'پاوه', parent: 'cad.fund', needs: ['set.stone'], competency: 'setting' },
  { id: 'mfg.weight', fa: 'بهینه‌سازی وزن', parent: 'cad.fund', needs: ['cad.ring'], competency: 'manufacturing' },
  { id: 'mfg.constraints', fa: 'محدودیت‌های ساخت', parent: 'cad.fund', needs: ['cad.ring'], competency: 'manufacturing' },
  { id: 'mfg.casting', fa: 'آماده‌سازی ریخته‌گری', parent: 'cad.fund', needs: ['mfg.constraints'], competency: 'manufacturing' },
  { id: 'mfg.cleanup', fa: 'پاک‌سازی مدل', parent: 'cad.fund', needs: ['cad.solids'], competency: 'manufacturing' },
  { id: 'mfg.export', fa: 'آماده‌سازی خروجی', parent: 'cad.fund', needs: ['mfg.cleanup'], competency: 'manufacturing' },
];
export const STUDIO = createGraph(STUDIO_SKILLS, { domain: 'studio', start: 'cad.ring' });
/** Which skill a finding code exercises (for mastery and for remedial exercises). */
export const SKILL_OF_FINDING = {
  WALL_TOO_THIN: 'mfg.constraints', STRUCTURE_THIN: 'mfg.constraints', POLISH_ALLOWANCE: 'mfg.casting', THICKNESS_JUMP: 'mfg.casting', DEFORMATION_RISK: 'mfg.constraints',
  OPEN_MESH: 'mfg.cleanup', FLOATING_PART: 'mfg.cleanup', STONE_CLEARANCE: 'set.stone', PRONG_GRIP: 'set.prong', PRONG_COUNT: 'set.prong', PRONG_COUNT_LARGE: 'set.prong',
  PRONG_THIN: 'set.prong', SEAT_DEPTH: 'set.prong', POINT_PROTECTION: 'set.prong', BEZEL_WALL: 'set.bezel', BEZEL_GRIP: 'set.bezel', PAVE_SIZE: 'set.pave', PAVE_SPACING: 'set.pave',
  PAVE_BEADS: 'set.pave', CASTING_FINE_DETAIL: 'mfg.casting', WEIGHT_OVER: 'mfg.weight', WEIGHT_UNDER: 'mfg.weight',
};
