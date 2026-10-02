// مدل‌ساز آزاد در استودیو (spec 0008): a command palette in the families and names of a NURBS CAD package — every
// command has its CAD name (searchable in English or Persian), a short form for its numbers, and acts on the parts
// in the scene: curves are drawn or generated, solids are made from curves, and any part can be booleaned,
// subdivided, shelled, deformed or measured. Results are ordinary studio parts (weight, report, export all apply).
import { html, fa, toast, $, $$ } from '../core.mjs';
import { fmt } from '../calc.mjs';

const N = (k, label, d, min, max, step = 0.1) => ({ k, label, d, min, max, step });
// inputs: 'curve' (one curve), 'curve2'/'curve3' (more curves), 'curves' (two or more), 'part', 'part2'
export const COMMANDS = [
  // ---------------- curves
  { id: 'Polyline', fa: 'چندخطی (کلیک روی صفحه)', cat: 'curve', draw: 'poly' },
  { id: 'Curve', fa: 'منحنی آزاد درون‌یاب (کلیک)', cat: 'curve', draw: 'smooth' },
  { id: 'Line', fa: 'خط', cat: 'curve', gen: 'line', params: [N('length', 'طول', 20, 1, 200)] },
  { id: 'Rectangle', fa: 'مستطیل (با گوشه گرد)', cat: 'curve', gen: 'rectangle', params: [N('width', 'عرض', 20, 1, 200), N('height', 'ارتفاع', 12, 1, 200), N('radius', 'شعاع گوشه', 0, 0, 50)] },
  { id: 'Polygon', fa: 'چندضلعی / ستاره', cat: 'curve', gen: 'polygon', params: [N('sides', 'تعداد ضلع', 6, 3, 24, 1), N('radius', 'شعاع', 10, 1, 100), N('star', 'عمق ستاره (۰ = چندضلعی)', 0, 0, 0.9, 0.05)] },
  { id: 'Circle', fa: 'دایره', cat: 'curve', gen: 'circle', params: [N('radius', 'شعاع', 10, 0.2, 100)] },
  { id: 'Ellipse', fa: 'بیضی', cat: 'curve', gen: 'ellipse', params: [N('rx', 'شعاع افقی', 12, 0.2, 100), N('ry', 'شعاع عمودی', 7, 0.2, 100)] },
  { id: 'Arc', fa: 'کمان', cat: 'curve', gen: 'arc', params: [N('radius', 'شعاع', 10, 0.2, 100), N('angle', 'زاویه (درجه)', 180, 5, 359, 1)] },
  { id: 'Spiral', fa: 'مارپیچ تخت', cat: 'curve', gen: 'spiral', params: [N('r0', 'شعاع شروع', 2, 0, 50), N('r1', 'شعاع پایان', 10, 0.5, 100), N('turns', 'تعداد دور', 3, 0.5, 20, 0.5)] },
  { id: 'Helix', fa: 'فنر (هلیکس)', cat: 'curve', gen: 'helix', params: [N('radius', 'شعاع', 6, 0.5, 50), N('pitch', 'گام', 3, 0.3, 30), N('turns', 'تعداد دور', 4, 0.5, 40, 0.5)] },
  { id: 'Waves', fa: 'موج', cat: 'curve', gen: 'wave', params: [N('length', 'طول', 30, 2, 200), N('amplitude', 'دامنه', 2, 0.1, 30), N('waves', 'تعداد موج', 4, 1, 40, 1)] },
  { id: 'OffsetCrv', fa: 'موازی‌کردن منحنی', cat: 'curve', in: ['curve'], params: [N('d', 'فاصله (منفی = داخل)', 1, -30, 30)] },
  { id: 'FilletCorners', fa: 'گرد کردن گوشه‌های منحنی', cat: 'curve', in: ['curve'], params: [N('r', 'شعاع', 1, 0.05, 30)] },
  // ---------------- surfaces & solids from curves
  { id: 'ExtrudeCrv', fa: 'اکسترود منحنی', cat: 'surface', in: ['curve'], params: [N('height', 'ارتفاع', 3, 0.1, 100), N('wall', 'ضخامت دیواره (منحنی باز)', 0.6, 0.1, 10)] },
  { id: 'ExtrudeCrvTapered', fa: 'اکسترود مخروطی', cat: 'surface', in: ['curve'], params: [N('height', 'ارتفاع', 4, 0.1, 100), N('taper', 'جمع‌شدن سر (۰ تا ۰٫۹۵)', 0.4, 0, 0.95, 0.05)] },
  { id: 'ExtrudeCrvToPoint', fa: 'اکسترود تا نقطه', cat: 'surface', in: ['curve'], params: [N('height', 'ارتفاع رأس', 6, 0.1, 100)] },
  { id: 'Revolve', fa: 'دوران حول محور Y', cat: 'surface', in: ['curve'], params: [N('angle', 'زاویه (درجه)', 360, 5, 360, 1)] },
  { id: 'Sweep1', fa: 'سوییپ روی یک ریل', cat: 'surface', in: ['curve', 'curve2'], inLabels: ['مقطع (بسته)', 'ریل'], params: [N('scale0', 'مقیاس شروع', 1, 0.05, 5, 0.05), N('scale1', 'مقیاس پایان', 1, 0.05, 5, 0.05), N('twist', 'پیچش (درجه)', 0, -1080, 1080, 5)] },
  { id: 'Sweep2', fa: 'سوییپ روی دو ریل', cat: 'surface', in: ['curve', 'curve2', 'curve3'], inLabels: ['مقطع (بسته)', 'ریل اول', 'ریل دوم'] },
  { id: 'Loft', fa: 'لافت بین مقطع‌ها', cat: 'surface', in: ['curves'] },
  { id: 'Pipe', fa: 'لوله روی منحنی', cat: 'surface', in: ['curve'], params: [N('r0', 'شعاع شروع', 0.8, 0.05, 20, 0.05), N('r1', 'شعاع پایان', 0.8, 0.05, 20, 0.05)] },
  { id: 'PlanarSrf', fa: 'صفحه از منحنی بسته', cat: 'surface', in: ['curve'], params: [N('thickness', 'ضخامت', 1, 0.1, 30)] },
  // ---------------- solid primitives
  ...[
    ['Box', 'مکعب', 'box', [N('x', 'طول X', 10, 0.1, 200), N('y', 'ارتفاع Y', 6, 0.1, 200), N('z', 'عمق Z', 4, 0.1, 200)]],
    ['Sphere', 'کره', 'sphere', [N('r', 'شعاع', 5, 0.1, 100)]],
    ['Cylinder', 'استوانه', 'cylinder', [N('r', 'شعاع', 4, 0.1, 100), N('h', 'ارتفاع', 8, 0.1, 200)]],
    ['Cone', 'مخروط', 'cone', [N('r', 'شعاع', 5, 0.1, 100), N('h', 'ارتفاع', 8, 0.1, 200)]],
    ['TruncatedCone', 'مخروط ناقص', 'truncatedCone', [N('r0', 'شعاع پایین', 5, 0.1, 100), N('r1', 'شعاع بالا', 2, 0.1, 100), N('h', 'ارتفاع', 6, 0.1, 200)]],
    ['Torus', 'چنبره', 'torus', [N('R', 'شعاع بزرگ', 9, 0.5, 100), N('r', 'شعاع لوله', 1.5, 0.1, 50)]],
    ['Ellipsoid', 'بیضی‌گون', 'ellipsoid', [N('rx', 'شعاع X', 6, 0.1, 100), N('ry', 'شعاع Y', 4, 0.1, 100), N('rz', 'شعاع Z', 3, 0.1, 100)]],
    ['Tube', 'لوله ضخیم', 'tube', [N('R', 'شعاع بیرون', 6, 0.2, 100), N('r', 'شعاع درون', 4.5, 0.1, 100), N('h', 'ارتفاع', 4, 0.1, 200)]],
    ['Pyramid', 'هرم', 'pyramid', [N('r', 'شعاع قاعده', 5, 0.1, 100), N('h', 'ارتفاع', 7, 0.1, 200), N('sides', 'تعداد وجه', 4, 3, 24, 1)]],
    ['Capsule', 'کپسول', 'capsule', [N('r', 'شعاع', 3, 0.1, 50), N('h', 'طول میانی', 6, 0, 200)]],
    ['Octahedron', 'هشت‌وجهی', 'octahedron', [N('r', 'شعاع', 5, 0.1, 100)]],
    ['Dodecahedron', 'دوازده‌وجهی', 'dodecahedron', [N('r', 'شعاع', 5, 0.1, 100)]],
  ].map(([id, f, s, params]) => ({ id, fa: f, cat: 'solid', solid: s, params })),
  // ---------------- booleans
  { id: 'BooleanUnion', fa: 'اجتماع (یکی کردن)', cat: 'boolean', in: ['part', 'part2'], op: 'union' },
  { id: 'BooleanDifference', fa: 'تفاضل (بریدن)', cat: 'boolean', in: ['part', 'part2'], inLabels: ['قطعه اصلی', 'بُرنده'], op: 'difference' },
  { id: 'BooleanIntersection', fa: 'اشتراک', cat: 'boolean', in: ['part', 'part2'], op: 'intersection' },
  { id: 'BooleanSplit', fa: 'تقسیم قطعه با قطعه دیگر', cat: 'boolean', in: ['part', 'part2'], op: 'split' },
  { id: 'GemSeat', fa: 'برش نشیمن سنگ‌ها در فلز', cat: 'boolean', in: ['part'], params: [N('clearance', 'لقی (mm)', 0.05, 0, 0.5, 0.01), N('hole', 'سوراخ نور (نسبت)', 0.45, 0, 0.8, 0.05)] },
  // ---------------- mesh & SubD
  { id: 'Explode', fa: 'تبدیل به جسم آزاد (قابل ویرایش)', cat: 'mesh', in: ['part'] },
  { id: 'SubDivide', fa: 'نرم کردن SubD (تقسیم)', cat: 'mesh', in: ['part'], params: [N('levels', 'مرحله', 1, 1, 3, 1)] },
  { id: 'MeshSmooth', fa: 'صاف کردن سطح', cat: 'mesh', in: ['part'], params: [N('iterations', 'تکرار', 4, 1, 30, 1)] },
  { id: 'ReduceMesh', fa: 'کاهش مش', cat: 'mesh', in: ['part'], params: [N('cell', 'دقت (mm)', 0.3, 0.02, 5, 0.01)] },
  { id: 'Shell', fa: 'توخالی کردن (پوسته)', cat: 'mesh', in: ['part'], params: [N('thickness', 'ضخامت دیواره', 0.6, 0.1, 10, 0.05)] },
  { id: 'FillMeshHoles', fa: 'بستن سوراخ‌های مش', cat: 'mesh', in: ['part'] },
  { id: 'Weld', fa: 'جوش و تعمیر (STL)', cat: 'mesh', in: ['part'] },
  { id: 'Flip', fa: 'برگرداندن جهت سطح', cat: 'mesh', in: ['part'] },
  // ---------------- transform & deform
  { id: 'Bend', fa: 'خم کردن', cat: 'deform', in: ['part'], params: [N('angle', 'زاویه (درجه)', 90, -360, 360, 1), N('refine', 'ریزکردن پیش از آن', 1, 0, 3, 1)] },
  { id: 'Twist', fa: 'پیچاندن', cat: 'deform', in: ['part'], params: [N('angle', 'زاویه (درجه)', 180, -1440, 1440, 5), N('refine', 'ریزکردن', 1, 0, 3, 1)] },
  { id: 'Taper', fa: 'باریک کردن', cat: 'deform', in: ['part'], params: [N('factor', 'نسبت سر', 0.4, 0.02, 4, 0.02), N('refine', 'ریزکردن', 1, 0, 3, 1)] },
  { id: 'Shear', fa: 'اریب کردن', cat: 'deform', in: ['part'], params: [N('angle', 'زاویه (درجه)', 20, -70, 70, 1)] },
  { id: 'Scale1D', fa: 'کشیدن در یک جهت', cat: 'deform', in: ['part'], params: [N('factor', 'ضریب', 1.5, 0.05, 10, 0.05)], axis: true },
  { id: 'Maelstrom', fa: 'گرداب', cat: 'deform', in: ['part'], params: [N('angle', 'زاویه (درجه)', 120, -720, 720, 5), N('refine', 'ریزکردن', 1, 0, 3, 1)] },
  { id: 'Flow', fa: 'جاری کردن روی منحنی', cat: 'deform', in: ['part', 'curve'], params: [N('refine', 'ریزکردن', 1, 0, 3, 1)] },
  { id: 'ArrayCrv', fa: 'آرایه روی منحنی', cat: 'deform', in: ['part', 'curve'], params: [N('count', 'تعداد', 8, 2, 23, 1)] },
  // ---------------- NURBS (spec 0010): exact curves and surfaces, control points, IGES / 3DM
  { id: 'CurveCP', fa: 'منحنی با نقاط کنترل NURBS (کلیک)', cat: 'nurbs', draw: 'cp' },
  { id: 'InterpCrv', fa: 'منحنی درون‌یاب NURBS (کلیک)', cat: 'nurbs', draw: 'interp' },
  { id: 'CircleNurbs', fa: 'دایره دقیق (NURBS گویا)', cat: 'nurbs', params: [N('radius', 'شعاع', 10, 0.1, 100)] },
  { id: 'Rebuild', fa: 'بازسازی منحنی (تعداد نقطه و درجه)', cat: 'nurbs', in: ['curve'], params: [N('count', 'تعداد نقاط کنترل', 10, 4, 60, 1), N('degree', 'درجه', 3, 1, 5, 1)] },
  { id: 'InsertKnot', fa: 'افزودن گره (بدون تغییر شکل)', cat: 'nurbs', in: ['curve'], params: [N('u', 'محل روی منحنی (۰ تا ۱)', 0.5, 0.01, 0.99, 0.01)] },
  { id: 'PointsOn', fa: 'ویرایش نقاط کنترل (منحنی، سطح، قفس SubD)', cat: 'nurbs', edit: 'points' },
  { id: 'EdgeSrf', fa: 'سطح از چهار لبه', cat: 'nurbs', in: ['curve', 'curve2', 'curve3', 'curve4'], inLabels: ['لبه پایین', 'لبه بالا', 'لبه چپ', 'لبه راست'], params: [N('t', 'ضخامت جسم', 0.8, 0.05, 20, 0.05)] },
  { id: 'NetworkSrf', fa: 'سطح شبکه‌ای از منحنی‌های دو جهت', cat: 'nurbs', in: ['curves', 'curves2'], params: [N('t', 'ضخامت جسم', 0.8, 0.05, 20, 0.05)] },
  { id: 'LoftSrf', fa: 'لافت NURBS (سطح باز با ضخامت)', cat: 'nurbs', in: ['curves'], params: [N('t', 'ضخامت جسم', 0.8, 0.05, 20, 0.05)], open: true },
  { id: 'SrfPt', fa: 'سطح چهار نقطه', cat: 'nurbs', params: [N('w', 'عرض', 20, 1, 200), N('h', 'طول', 12, 1, 200), N('lift', 'بالا آمدن یک گوشه', 0, -50, 50), N('t', 'ضخامت جسم', 0.8, 0.05, 20, 0.05)] },
  { id: 'ExportIGES', fa: 'خروجی IGES (منحنی و سطح NURBS واقعی)', cat: 'nurbs', action: 'iges' },
  { id: 'Export3dm', fa: 'خروجی 3DM (فایل راینو)', cat: 'nurbs', action: '3dm' },
  // ---------------- fillets and offsets of solids (rolling ball on a distance field)
  { id: 'FilletEdge', fa: 'گرد کردن لبه‌های بیرونی (Fillet)', cat: 'mesh', in: ['part'], params: [N('r', 'شعاع (mm)', 0.5, 0.05, 10, 0.05), N('res', 'دقت (خانه در بلندترین ضلع)', 160, 80, 240, 10)] },
  { id: 'FilletInner', fa: 'گرد کردن گوشه‌های داخلی', cat: 'mesh', in: ['part'], params: [N('r', 'شعاع (mm)', 0.5, 0.05, 10, 0.05), N('res', 'دقت', 160, 80, 240, 10)] },
  { id: 'OffsetMesh', fa: 'ضخیم یا نازک کردن جسم (Offset)', cat: 'mesh', in: ['part'], params: [N('d', 'فاصله (منفی = نازک‌تر)', 0.2, -5, 10, 0.05), N('res', 'دقت', 160, 80, 240, 10)] },
  // ---------------- SubD and sculpting
  { id: 'SubDBox', fa: 'SubD مکعبی', cat: 'subd', subd: 'box', params: [N('x', 'طول', 10, 1, 100), N('y', 'ارتفاع', 6, 1, 100), N('z', 'عمق', 6, 1, 100)] },
  { id: 'SubDTorus', fa: 'SubD حلقه (رکاب)', cat: 'subd', subd: 'torus', params: [N('R', 'شعاع حلقه', 9, 2, 60), N('r', 'شعاع لوله', 1.5, 0.3, 10, 0.1), N('n', 'تقسیم دور', 8, 4, 24, 1)] },
  { id: 'SubDCylinder', fa: 'SubD استوانه', cat: 'subd', subd: 'cylinder', params: [N('r', 'شعاع', 5, 0.5, 60), N('h', 'ارتفاع', 10, 0.5, 100), N('n', 'تقسیم دور', 8, 3, 24, 1)] },
  { id: 'SubDEdit', fa: 'ویرایش قفس SubD (نقطه، اکسترود، لبه تیز)', cat: 'subd', edit: 'points' },
  { id: 'Sculpt', fa: 'حجاری (کشیدن، صاف کردن، باد کردن، فرو بردن)', cat: 'subd', edit: 'sculpt' },
  // ---------------- analyze
  { id: 'Check', fa: 'وارسی جسم (حجم، سطح، بسته بودن)', cat: 'analyze', in: ['part'] },
  { id: 'Length', fa: 'طول منحنی', cat: 'analyze', in: ['curve'] },
  { id: 'Distance', fa: 'فاصله مرکز دو قطعه', cat: 'analyze', in: ['part', 'part2'] },
  { id: 'BoundingBox', fa: 'ابعاد جعبه محیطی', cat: 'analyze', in: ['part'] },
];
export const CATS = [['curve', 'منحنی'], ['nurbs', 'NURBS'], ['surface', 'سطح و جسم از منحنی'], ['solid', 'احجام پایه'], ['boolean', 'بولین'], ['mesh', 'مش، گردکاری و Offset'], ['subd', 'SubD و حجاری'], ['deform', 'تبدیل و تغییر شکل'], ['analyze', 'تحلیل']];

export function paletteHtml(state) {
  const q = (state.q ?? '').trim().toLowerCase();
  const list = COMMANDS.filter((c) => (q ? `${c.id} ${c.fa}`.toLowerCase().includes(q) : c.cat === (state.cat ?? 'curve')));
  return html`<div class="grp" id="mdl">
    <h3><span>مدل‌ساز آزاد · فرمان‌های راینو</span><span class="small">${fa(COMMANDS.length)} فرمان</span></h3>
    <input class="input" id="mdlQ" value="${state.q ?? ''}" placeholder="جستجوی فرمان: Sweep2، Loft، بولین، پیچاندن…" aria-label="جستجوی فرمان" autocomplete="off">
    ${q ? '' : html`<div class="chips mdl-cats">${CATS.map(([k, l]) => html`<button class="chip" data-mcat="${k}" aria-pressed="${k === (state.cat ?? 'curve')}">${l}</button>`)}</div>`}
    <div class="mdl-cmds">${list.map((c) => html`<button class="mdl-cmd" data-cmd="${c.id}" title="${c.id}"><b>${c.fa}</b><span class="ltr">${c.id}</span></button>`)}</div>
  </div>`;
}

/**
 * Wire the palette to the studio. ctx: { T, D (modeler), J (pieces), S, cur, objs, newPart, nextId, addParts,
 * removePart, movePart, stage, scene, camera, vp, modal }
 */
export function wirePalette(panel, ctx) {
  const { T, D } = ctx;
  const st = { cat: 'curve', q: '' };
  const curves = () => ctx.S.parts.filter((p) => p.type === 'curve');
  const solids = () => ctx.S.parts.filter((p) => p.type !== 'curve');
  const isClosed = (p) => {
    try {
      return !!JSON.parse(p.opts.data).closed;
    } catch {
      return false;
    }
  };
  const label = (p) => `${p.opts?.name || ctx.J.PIECES[p.type].label} #${fa(p.id)}${p.type === 'curve' ? (isClosed(p) ? ' (بسته)' : ' (باز)') : ''}`;
  /** A curve part in world space. */
  const worldCurve = (p) => {
    const c = JSON.parse(p.opts.data);
    const o = ctx.objs.get(p.id);
    if (!o) return c;
    o.group.updateMatrixWorld(true);
    const tf = (q) => new T.Vector3(...q).applyMatrix4(o.group.matrixWorld).toArray();
    return { ...c, pts: c.pts.map(tf), ...(c.nurbs ? { nurbs: { ...c.nurbs, P: c.nurbs.P.map(tf) } } : {}) };
  };
  /** A part's metal geometry in world space (merged). */
  const worldGeo = (p, role = 'metal') => {
    const o = ctx.objs.get(p.id);
    if (!o) throw new Error('قطعه آماده نیست.');
    o.group.updateMatrixWorld(true);
    const geos = [];
    o.group.traverse((m) => m.isMesh && (role === 'any' ? m.userData.role !== 'curve' : m.userData.role === role) && geos.push(m.geometry.clone().applyMatrix4(m.matrixWorld)));
    if (!geos.length) throw new Error(role === 'metal' ? 'این قطعه فلز ندارد.' : 'این قطعه سنگ ندارد.');
    return D.merge(geos);
  };
  /** A NURBS curve part: the exact definition plus a preview polyline. */
  const nurbsCurve = (nc, closed = false) => ({ pts: ctx.NB.sampleCurve(nc, 64), closed, smooth: false, nurbs: nc });
  const addSrf = (s, t, from, name) => ctx.addParts([ctx.newPart('nsurf', { alloy: from?.alloy, opts: { srf: JSON.stringify({ s, t, res: 48 }), name } })]);
  const toNurbs = (c) => c.nurbs ?? (c.closed ? ctx.NB.interpolate([...D.resample(c, 48).map((p) => p.toArray()), D.resample(c, 48)[0].toArray()]) : ctx.NB.interpolate(D.resample(c, 32).map((p) => p.toArray())));
  const addCurve = (c, name) => ctx.addParts([{ ...ctx.newPart('curve', { opts: { data: JSON.stringify(c), name } }) }]);
  const addSolid = (geo, from, name, gem = false) => {
    const np = ctx.newPart(gem ? 'meshGem' : 'mesh', { alloy: from?.alloy, opts: { geo: D.encodeGeo(geo), name, ...(gem && from ? { gem: from.gem } : {}) } });
    if (gem && from) np.gem = from.gem;
    return np;
  };

  panel.addEventListener('input', (e) => {
    if (e.target.id !== 'mdlQ') return;
    st.q = e.target.value;
    const box = $('#mdl', panel);
    box.outerHTML = String(paletteHtml(st));
    const i = $('#mdlQ', panel);
    i.focus();
    i.setSelectionRange(i.value.length, i.value.length);
  });
  panel.addEventListener('click', (e) => {
    const c = e.target.closest('[data-mcat]');
    if (c) {
      st.cat = c.dataset.mcat;
      $('#mdl', panel).outerHTML = String(paletteHtml(st));
      return;
    }
    const b = e.target.closest('[data-cmd]');
    if (b) openCommand(COMMANDS.find((x) => x.id === b.dataset.cmd));
  });

  function openCommand(cmd) {
    if (cmd.draw) return startDraw(cmd);
    if (cmd.edit) return ctx.edit(cmd.edit);
    if (cmd.action) return ctx.exportCAD(cmd.action);
    const need = cmd.in ?? [];
    const pick = (slot, i) => {
      const isCurve = slot.startsWith('curve');
      const list = isCurve ? curves() : solids();
      const lab = cmd.inLabels?.[i] ?? (isCurve ? 'منحنی' : i ? 'قطعه دوم' : 'قطعه');
      if (slot === 'curves' || slot === 'curves2') {
        const legend = cmd.id === 'NetworkSrf' ? (slot === 'curves' ? 'منحنی‌های جهت اول (به ترتیب)' : 'منحنی‌های جهت دوم (به ترتیب)') : cmd.open ? 'مقطع‌ها به ترتیب (باز یا بسته)' : 'مقطع‌ها به ترتیب (دست‌کم دو منحنی بسته)';
        return html`<fieldset class="mdl-pick"><legend>${legend}</legend>${list.map((p) => html`<label class="segopt"><input type="checkbox" name="${slot}" value="${p.id}" ${cmd.id === 'NetworkSrf' || cmd.open ? '' : isClosed(p) ? 'checked' : ''}><span>${label(p)}</span></label>`)}</fieldset>`;
      }
      const sel = ctx.cur();
      let dflt;
      if (!isCurve) dflt = i === 0 ? sel?.id : list.find((p) => p.id !== sel?.id)?.id;
      else if (cmd.inLabels?.[0]?.startsWith('مقطع')) {
        // sweeps: the profile is the newest closed curve, the rails the newest other curves (open ones first)
        const prof = [...list].reverse().find(isClosed) ?? list[list.length - 1];
        const rails = [...list].reverse().filter((p) => p !== prof).sort((x, y) => isClosed(x) - isClosed(y));
        dflt = i === 0 ? prof?.id : rails[i - 1]?.id;
      } else if (cmd.id === 'EdgeSrf') dflt = list[list.length - 4 + i]?.id ?? list[i]?.id;
      else dflt = sel?.type === 'curve' ? sel.id : list[list.length - 1]?.id;
      return html`<label class="field">${lab}<select class="input" name="${slot}">${list.map((p) => html`<option value="${p.id}" ${p.id === dflt ? 'selected' : ''}>${label(p)}</option>`)}</select></label>`;
    };
    const needCurves = (slot) => (slot.startsWith('curves') ? 2 : Number(slot.slice(5)) || 1);
    const missing = need.some((slot) => (slot.startsWith('curve') ? curves().length < needCurves(slot) : solids().length < (slot === 'part2' ? 2 : 1)));
    if (missing) return toast(need.some((x) => x.startsWith('curve')) ? 'اول منحنی(های) لازم را بکشید یا بسازید (دسته «منحنی»).' : 'برای این فرمان قطعه(های) کافی در صحنه نیست.', 'error');
    ctx.modal(
      String(html`<h3 class="bk-h">${cmd.fa} <span class="small ltr">${cmd.id}</span></h3><form class="form" id="mdlF">
        ${need.map((slot, i) => pick(slot, i))}
        ${cmd.axis ? html`<label class="field">جهت<select class="input" name="axis"><option value="x">X</option><option value="y">Y</option><option value="z">Z</option></select></label>` : ''}
        ${(cmd.params ?? []).map((p) => html`<label class="field">${p.label}<input class="input ltr" name="${p.k}" type="number" value="${p.d}" min="${p.min}" max="${p.max}" step="${p.step}"></label>`)}
        ${cmd.cat === 'boolean' && cmd.op ? html`<label class="small" style="display:flex;gap:8px"><input type="checkbox" name="keep"> نگه داشتن قطعه‌های ورودی</label>` : ''}
        <p class="small" id="mdlMsg" aria-live="polite"></p>
        <div class="actions"><button class="btn">اجرا</button><button type="button" class="btn ghost" data-close>انصراف</button></div></form>`),
      (m, close) => {
        $('#mdlF', m).addEventListener('submit', async (ev) => {
          ev.preventDefault();
          const fd = new FormData(ev.target);
          const v = Object.fromEntries((cmd.params ?? []).map((p) => [p.k, Math.min(p.max, Math.max(p.min, Number(fd.get(p.k)) || p.d))]));
          const part = (k) => ctx.S.parts.find((p) => p.id === Number(fd.get(k)));
          const btn = ev.submitter;
          btn.classList.add('is-busy');
          $('#mdlMsg', m).textContent = 'در حال محاسبه…';
          await new Promise((r) => setTimeout(r, 30));
          try {
            const byIds = (k) => fd.getAll(k).map((id) => ctx.S.parts.find((p) => p.id === Number(id))).filter(Boolean);
            const msg = await run(cmd, v, { part, fd, axis: fd.get('axis'), keep: fd.get('keep') === 'on', curves: byIds('curves'), curves2: byIds('curves2') });
            close();
            if (msg) toast(msg, 'ok');
          } catch (err) {
            if (!/[\u0600-\u06FF]/.test(err?.message ?? '')) console.error(err);
            $('#mdlMsg', m).textContent = err.message || 'این فرمان با این ورودی ممکن نشد.';
          } finally {
            btn.classList.remove('is-busy');
          }
        });
      },
    );
  }

  async function run(cmd, v, { part, axis, keep, curves: cs, curves2: cs2 }) {
    if (cmd.gen) return addCurve(D.CURVES[cmd.gen](v), cmd.fa);
    if (cmd.subd) {
      const S = ctx.SD, cage = cmd.subd === 'box' ? S.boxCage(v.x, v.y, v.z) : cmd.subd === 'torus' ? S.torusCage(v.R, v.r, v.n, 4) : S.cylinderCage(v.r, v.h, v.n);
      return ctx.addParts([ctx.newPart('subd', { alloy: ctx.cur()?.alloy, opts: { cage: JSON.stringify({ ...cage, levels: 3 }), name: cmd.fa } })]);
    }
    const NB = ctx.NB;
    switch (cmd.id) {
      case 'CircleNurbs': return addCurve(nurbsCurve(NB.circle(v.radius), true), cmd.fa);
      case 'SrfPt': return addSrf(NB.srfPt([-v.w / 2, 0, -v.h / 2], [v.w / 2, 0, -v.h / 2], [v.w / 2, v.lift, v.h / 2], [-v.w / 2, 0, v.h / 2]), v.t, ctx.cur(), cmd.fa);
    }
    const c1n = () => toNurbs(worldCurve(part('curve')));
    switch (cmd.id) {
      case 'Rebuild': {
        const A = part('curve'), c = toNurbs(worldCurve(A)), r = NB.rebuild(c, Math.round(v.count), Math.round(v.degree));
        ctx.removePart(A.id);
        await addCurve(nurbsCurve(r, worldCurve(A).closed), `${A.opts.name || 'منحنی'} (بازسازی)`);
        return `منحنی با ${fa(Math.round(v.count))} نقطه کنترل و درجه ${fa(Math.round(v.degree))} بازسازی شد.`;
      }
      case 'InsertKnot': {
        const A = part('curve'), c = NB.insertKnot(c1n(), v.u);
        ctx.removePart(A.id);
        await addCurve(nurbsCurve(c, worldCurve(A).closed), A.opts.name || 'منحنی');
        return `گره افزوده شد؛ نقاط کنترل: ${fa(c.P.length)}، شکل بی‌تغییر.`;
      }
      case 'EdgeSrf': {
        const cs4 = ['curve', 'curve2', 'curve3', 'curve4'].map((k) => toNurbs(worldCurve(part(k))));
        // orient: the top edge and the right edge run like the bottom and the left
        const near = (a, b) => Math.hypot(...a.map((x, k) => x - b[k]));
        const rev = (c) => ({ ...c, U: c.U.map((u) => 1 - u).reverse(), P: [...c.P].reverse(), ...(c.W ? { W: [...c.W].reverse() } : {}) });
        let [b, t, l, r] = cs4;
        if (near(NB.curvePoint(t, 0), NB.curvePoint(b, 0)) > near(NB.curvePoint(t, 1), NB.curvePoint(b, 0))) t = rev(t);
        if (near(NB.curvePoint(l, 0), NB.curvePoint(b, 0)) > near(NB.curvePoint(l, 1), NB.curvePoint(b, 0))) l = rev(l);
        if (near(NB.curvePoint(r, 0), NB.curvePoint(b, 1)) > near(NB.curvePoint(r, 1), NB.curvePoint(b, 1))) r = rev(r);
        return addSrf(NB.edgeSurface(b, t, l, r), v.t, ctx.cur(), cmd.fa);
      }
      case 'NetworkSrf': {
        if (cs.length < 2 || cs2.length < 2) throw new Error('در هر جهت دست‌کم دو منحنی لازم است.');
        return addSrf(NB.networkSurface(cs.map((c) => toNurbs(worldCurve(c))), cs2.map((c) => toNurbs(worldCurve(c)))), v.t, ctx.cur(), cmd.fa);
      }
      case 'LoftSrf': {
        if (cs.length < 2) throw new Error('دست‌کم دو منحنی لازم است.');
        return addSrf(NB.loft(cs.map((c) => toNurbs(worldCurve(c)))), v.t, ctx.cur(), cmd.fa);
      }
    }
    if (cmd.solid) return ctx.addParts([addSolid(D.solid(cmd.solid, v), ctx.cur(), cmd.fa)]);
    const c1 = () => worldCurve(part('curve')), c2 = () => worldCurve(part('curve2')), c3 = () => worldCurve(part('curve3'));
    switch (cmd.id) {
      case 'OffsetCrv': return addCurve(D.offsetCurve(c1(), v.d), 'منحنی موازی');
      case 'FilletCorners': return addCurve(D.filletCorners(c1(), v.r), 'منحنی گوشه‌گرد');
      case 'ExtrudeCrv': return ctx.addParts([addSolid(D.extrude(c1(), v), ctx.cur(), cmd.fa)]);
      case 'ExtrudeCrvTapered': return ctx.addParts([addSolid(D.extrude(c1(), v), ctx.cur(), cmd.fa)]);
      case 'ExtrudeCrvToPoint': return ctx.addParts([addSolid(D.extrude(c1(), { ...v, toPoint: true }), ctx.cur(), cmd.fa)]);
      case 'Revolve': return ctx.addParts([addSolid(D.revolve(c1(), v), ctx.cur(), cmd.fa)]);
      case 'Sweep1': {
        if (!c1().closed) throw new Error('مقطع باید منحنی بسته باشد.');
        return ctx.addParts([addSolid(D.sweep1(c1(), c2(), v), ctx.cur(), cmd.fa)]);
      }
      case 'Sweep2': return ctx.addParts([addSolid(D.sweep2(c1(), c2(), c3()), ctx.cur(), cmd.fa)]);
      case 'Loft': {
        const list = cs.filter(Boolean).map(worldCurve);
        if (list.length < 2 || list.some((c) => !c.closed)) throw new Error('دست‌کم دو منحنی بسته لازم است.');
        return ctx.addParts([addSolid(D.loft(list), ctx.cur(), cmd.fa)]);
      }
      case 'Pipe': return ctx.addParts([addSolid(D.pipe(c1(), v), ctx.cur(), cmd.fa)]);
      case 'PlanarSrf': {
        if (!c1().closed) throw new Error('برای صفحه، منحنی باید بسته باشد.');
        return ctx.addParts([addSolid(D.cap(c1(), v), ctx.cur(), cmd.fa)]);
      }
      case 'Length': return `طول منحنی: ${fmt(D.curveLength(c1()), 2)} mm`;
    }
    const A = part('part');
    if (!A) throw new Error('قطعه را انتخاب کنید.');
    if (cmd.cat === 'boolean' && cmd.op) {
      const B = part('part2');
      if (!B || B.id === A.id) throw new Error('دو قطعه متفاوت انتخاب کنید.');
      const ga = worldGeo(A), gb = worldGeo(B);
      const out = cmd.op === 'split' ? D.split(ga, gb) : [D.boolean(ga, gb, cmd.op)];
      const made = out.filter((g) => g.attributes.position.count).map((g, i) => addSolid(g, A, cmd.op === 'split' ? `${cmd.fa} ${fa(i + 1)}` : cmd.fa));
      if (!made.length) throw new Error('نتیجه خالی است؛ دو قطعه هم‌پوشانی ندارند.');
      if (!keep) [A, B].forEach((p) => ctx.removePart(p.id));
      await ctx.addParts(made);
      return `${cmd.fa} انجام شد؛ وزن تازه در خوانش پایین صفحه است.`;
    }
    if (cmd.id === 'GemSeat') {
      const o = ctx.objs.get(A.id);
      const gems = [];
      o.group.traverse((m) => m.isMesh && m.userData.role === 'gem' && gems.push(m));
      if (!gems.length) throw new Error('این قطعه سنگ ندارد.');
      const cutters = gems.flatMap((g) => D.seatCutters(g, { clearance: v.clearance, hole: v.hole }));
      if (cutters.length > 24) throw new Error(`برای ${fa(cutters.length)} سنگ زیاد است (حداکثر ۲۴ در یک بار).`);
      let metal = worldGeo(A);
      for (const ct of cutters) metal = D.differenceByPiece(metal, ct); // each closed piece (shank, head, prong) on its own
      const gemPart = addSolid(D.merge(gems.map((g) => g.geometry.clone().applyMatrix4(g.matrixWorld))), A, 'سنگ‌ها', true);
      ctx.removePart(A.id);
      await ctx.addParts([addSolid(metal, A, `${ctx.J.PIECES[A.type].label} با نشیمن`), gemPart]);
      return `نشیمن ${fa(cutters.length)} سنگ بریده شد.`;
    }
    if (cmd.id === 'Distance') {
      const B = part('part2');
      const ca = new T.Box3().setFromObject(ctx.objs.get(A.id).group).getCenter(new T.Vector3()), cb = new T.Box3().setFromObject(ctx.objs.get(B.id).group).getCenter(new T.Vector3());
      return `فاصله مرکزها: ${fmt(ca.distanceTo(cb), 2)} mm`;
    }
    if (cmd.id === 'BoundingBox') {
      const s = new T.Box3().setFromObject(ctx.objs.get(A.id).group).getSize(new T.Vector3());
      return `ابعاد: ${fmt(s.x, 2)} × ${fmt(s.y, 2)} × ${fmt(s.z, 2)} mm`;
    }
    if (cmd.id === 'Check') {
      const a = D.analyze(worldGeo(A, 'any'));
      return `حجم ${fmt(a.volume, 2)} mm³ · سطح ${fmt(a.area, 1)} mm² · ${fa(a.triangles)} مثلث · ${a.closed ? 'بسته (آماده چاپ)' : `${fa(a.naked)} لبه باز`}${a.nonManifold ? ` · ${fa(a.nonManifold)} لبه نامنیفلد` : ''}`;
    }
    if (cmd.id === 'ArrayCrv') {
      const rail = c1();
      const at = D.arrayAlong(rail, v.count);
      if (ctx.S.parts.length + at.length - 1 > 24) throw new Error('با این تعداد از سقف ۲۴ قطعه صحنه می‌گذرد.');
      ctx.movePart(A, at[0].pos, at[0].rot);
      await ctx.addParts(at.slice(1).map((t) => ({ ...JSON.parse(JSON.stringify(A)), id: ctx.nextId(), pos: t.pos, rot: t.rot })));
      return `${fa(at.length)} نسخه روی منحنی چیده شد.`;
    }
    // geometry edits on one part: the result replaces it (gems of a parametric part are kept as their own part)
    let g = worldGeo(A);
    let gemsOut = null;
    if (A.type !== 'mesh' && A.type !== 'meshGem') {
      try {
        gemsOut = addSolid(worldGeo(A, 'gem'), A, 'سنگ‌ها', true);
      } catch {
        /* no stones */
      }
    }
    switch (cmd.id) {
      case 'Explode': break;
      case 'SubDivide': g = D.subdivide(g, { levels: v.levels }); break;
      case 'MeshSmooth': g = D.smoothMesh(g, v); break;
      case 'ReduceMesh': g = D.reduceMesh(g, v); break;
      case 'Shell': g = D.shell(g, v); break;
      case 'FillMeshHoles': g = D.fillHoles(g); break;
      case 'Weld': g = D.repairT(g); break;
      case 'Flip': g = D.flip(g); break;
      case 'Bend': g = D.DEFORMS.bend(g, v); break;
      case 'Twist': g = D.DEFORMS.twist(g, v); break;
      case 'Taper': g = D.DEFORMS.taper(g, v); break;
      case 'Shear': g = D.DEFORMS.shear(g, v); break;
      case 'Scale1D': g = D.DEFORMS.scale1d(g, { ...v, axis }); break;
      case 'Maelstrom': g = D.DEFORMS.maelstrom(g, v); break;
      case 'Flow': g = D.flowAlong(g, c1(), v); break;
      case 'FilletEdge':
      case 'FilletInner':
      case 'OffsetMesh': {
        const idx = D.toIndexed(g), op = { FilletEdge: 'fillet', FilletInner: 'filletInner', OffsetMesh: 'offset' }[cmd.id];
        const m = ctx.VX.remeshDistance(idx.attributes.position.array, idx.index.array, op, cmd.id === 'OffsetMesh' ? v.d : v.r, Math.round(v.res));
        if (!m.index.length) throw new Error('چیزی باقی نماند؛ شعاع یا فاصله برای این قطعه زیاد است.');
        const sm = ctx.PS.taubin(m.position, m.index, 2);
        g = new T.BufferGeometry();
        g.setAttribute('position', new T.BufferAttribute(sm, 3));
        g.setIndex(new T.BufferAttribute(m.index, 1));
        g = D.finish(g);
        break;
      }
    }
    const np = addSolid(g, A, A.opts?.name || ctx.J.PIECES[A.type].label);
    ctx.removePart(A.id);
    await ctx.addParts(gemsOut && cmd.id === 'Explode' ? [np, gemsOut] : [np]);
    return `${cmd.fa} انجام شد.`;
  }

  /* ---------------- drawing curves by clicking on the construction plane (XY, z = 0) ---------------- */
  let draw = null;
  function startDraw(cmd) {
    if (draw) return;
    const hint = document.createElement('div');
    hint.className = 'mdl-hint';
    hint.innerHTML = String(html`<b>${cmd.fa}</b> · روی صفحه کلیک کنید (گام ۰٫۵ mm؛ با Alt آزاد) · Enter یا دوبار کلیک: پایان · C: بستن منحنی · Backspace: حذف آخرین نقطه · Esc: انصراف`);
    ctx.vp.append(hint);
    const line = new T.Line(new T.BufferGeometry(), new T.LineBasicMaterial({ color: 0xf0c75e }));
    const dots = new T.Points(new T.BufferGeometry(), new T.PointsMaterial({ color: 0xffffff, size: 6, sizeAttenuation: false }));
    ctx.scene.add(line, dots);
    draw = { cmd, pts: [], hover: null, hint, line, dots, closed: false };
    ctx.stage.grid.visible = true;
    ctx.stage.invalidate();
  }
  const planePoint = (e, free) => {
    const r = ctx.stage.renderer.domElement.getBoundingClientRect();
    const ray = new T.Raycaster();
    ray.setFromCamera(new T.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), ctx.camera);
    const hit = new T.Vector3();
    if (!ray.ray.intersectPlane(new T.Plane(new T.Vector3(0, 0, 1), 0), hit)) return null;
    if (!free) (hit.x = Math.round(hit.x * 2) / 2), (hit.y = Math.round(hit.y * 2) / 2);
    return hit;
  };
  const redraw = () => {
    const pts = [...draw.pts, ...(draw.hover ? [draw.hover] : [])];
    const c = { pts: pts.map((p) => p.toArray()), closed: false, smooth: draw.cmd.draw === 'smooth' };
    let shown = pts.length > 1 ? D.curvePoints(c, 120) : pts;
    if (pts.length > 1 && (draw.cmd.draw === 'cp' || draw.cmd.draw === 'interp')) {
      const q = pts.map((p) => p.toArray()), nc = draw.cmd.draw === 'cp' ? ctx.NB.fromControlPoints(q, 3) : ctx.NB.interpolate(q, 3);
      shown = ctx.NB.sampleCurve(nc, 120).map((p) => new T.Vector3(...p));
    }
    draw.line.geometry.dispose();
    draw.line.geometry = new T.BufferGeometry().setFromPoints(shown);
    draw.dots.geometry.dispose();
    draw.dots.geometry = new T.BufferGeometry().setFromPoints(draw.pts);
    ctx.stage.invalidate();
  };
  const endDraw = async (commit) => {
    if (!draw) return;
    const d = draw;
    draw = null;
    d.hint.remove();
    ctx.scene.remove(d.line, d.dots);
    d.line.geometry.dispose();
    d.dots.geometry.dispose();
    ctx.stage.invalidate();
    const pts = d.pts.filter((p, i) => !i || p.distanceTo(d.pts[i - 1]) > 1e-6); // a double click lands twice
    const arr = pts.map((p) => p.toArray());
    const closed = d.closed && pts.length >= 3;
    let c = { pts: arr, closed, smooth: d.cmd.draw === 'smooth' };
    if (commit && pts.length >= 2 && (d.cmd.draw === 'cp' || d.cmd.draw === 'interp')) {
      const NB = ctx.NB, q = closed ? [...arr, arr[0]] : arr;
      c = nurbsCurve(d.cmd.draw === 'cp' ? NB.fromControlPoints(q, 3) : NB.interpolate(q, 3), closed);
    }
    if (commit && pts.length >= 2) await addCurve(c, d.cmd.fa).catch((err) => toast(err.message, 'error'));
    else if (commit) toast('دست‌کم دو نقطه لازم است.', 'error');
  };
  const canvas = ctx.stage.renderer.domElement;
  let downAt = null;
  canvas.addEventListener('pointerdown', (e) => draw && (downAt = [e.clientX, e.clientY]), true);
  canvas.addEventListener('pointerup', (e) => {
    if (!draw || !downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 4) return;
    e.stopImmediatePropagation();
    const p = planePoint(e, e.altKey);
    if (p) draw.pts.push(p), redraw();
  }, true);
  canvas.addEventListener('pointermove', (e) => {
    if (!draw) return;
    draw.hover = planePoint(e, e.altKey);
    redraw();
  });
  canvas.addEventListener('dblclick', (e) => {
    if (!draw) return;
    e.preventDefault();
    endDraw(true);
  });
  const onKey = (e) => {
    if (!draw || e.target.closest?.('input, textarea, select')) return;
    const k = e.key.toLowerCase();
    if (k === 'enter') endDraw(true);
    else if (k === 'escape') endDraw(false);
    else if (k === 'backspace') (draw.pts.pop(), redraw());
    else if (k === 'c' && draw.pts.length >= 3) ((draw.closed = true), endDraw(true));
    else return;
    e.preventDefault();
    e.stopImmediatePropagation(); // the studio's own shortcuts (W/E/R, Esc) wait while drawing
  };
  addEventListener('keydown', onKey, true);
  return { state: st, cancel: () => endDraw(false), isDrawing: () => !!draw, dispose: () => (endDraw(false), removeEventListener('keydown', onKey, true)) };
}
