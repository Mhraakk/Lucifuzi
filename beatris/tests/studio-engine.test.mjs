// spec 0016: the deterministic studio engine — typed units, measured geometry (volume, area, bounds, closure,
// thickness, connectivity), material weight, brief parsing, ring and setting geometry, manufacturing / setting /
// weight findings kept apart from aesthetic critique, constrained weight optimisation, the CAD boundary and
// studio exercises with levelled hints.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { q, to, add, massOf, UnitError, fmt } from '../public/js/studio/units.mjs';
import * as G from '../public/js/studio/geometry.mjs';
import { MATERIALS, weightOf, materialFor } from '../public/js/studio/materials.mjs';
import { parseBrief } from '../public/js/studio/brief.mjs';
import { diameterFromIso, shankMesh } from '../public/js/studio/ring.mjs';
import { checkSetting } from '../public/js/studio/setting.mjs';
import { paramsFromIntent, programOf, manufacturingFindings, weightFindings, critique, optimizeWeight } from '../public/js/studio/design.mjs';
import { createLocalAdapter, validateProgram } from '../public/js/studio/cad.mjs';
import { parseInstruction, applyEdits } from '../public/js/studio/instruct.mjs';
import { EXERCISE, assessExercise, studioHint } from '../public/js/studio/exercises.mjs';
import { STUDIO, STUDIO_SKILLS } from '../public/js/studio/skills.mjs';
import { check } from '../public/js/schema.mjs';
import { DESIGN_INTENT, CAD_PROGRAM, FINDING } from '../public/js/studio/schemas.mjs';

const near = (a, b, rel, msg) => assert.ok(Math.abs(a - b) <= Math.abs(b) * rel, `${msg ?? ''} ${a} ≉ ${b} (±${rel * 100}%)`);
const build = async (params) => {
  const a = createLocalAdapter({ material: params.material });
  await a.createGeometry(programOf(params), { id: 'm' });
  return { a, insp: await a.inspectGeometry('m', { samples: 200 }) };
};

test('واحدها: تبدیل در یک نوع، جمع ناهمگون و تبدیل میان انواع خطا؛ جرم = حجم × چگالی', () => {
  assert.equal(to(q(2500, 'mm3'), 'cm3').value, 2.5);
  assert.equal(add(q(1, 'cm'), q(5, 'mm')).value, 1.5);
  assert.throws(() => add(q(1, 'mm'), q(1, 'mm3')), UnitError);
  assert.throws(() => to(q(1, 'g'), 'mm'), UnitError);
  assert.throws(() => q(1, 'inch'), UnitError);
  assert.throws(() => massOf(q(1, 'g'), q(15, 'g/cm3')), UnitError);
  assert.equal(massOf(q(1000, 'mm3'), q(15.5, 'g/cm3')).value, 15.5);
  assert.equal(to(q(1, 'ct'), 'g').value, 0.2);
  assert.match(fmt(q(2.5, 'g')), /گرم/);
});

test('هندسه: مکعب ۱۰ میلی‌متری — حجم ۱۰۰۰، مساحت ۶۰۰، بسته، یک تکه؛ دو مکعب جدا دو تکه', () => {
  const b = G.box(10, 10, 10);
  near(G.volume(b).value, 1000, 1e-6, 'volume');
  assert.equal(G.volume(b).unit, 'mm3');
  near(G.surfaceArea(b).value ?? G.surfaceArea(b), 600, 1e-6, 'area');
  assert.deepEqual(G.bounds(b).size.map((x) => Math.round(x.value ?? x)), [10, 10, 10]);
  assert.equal(G.watertight(b).closed, true);
  assert.equal(G.components(b), 1);
  assert.equal(G.solidComponents([b, G.translate(G.box(10, 10, 10), [30, 0, 0])]), 2);
  assert.equal(G.solidComponents([b, G.translate(G.box(10, 10, 10), [9, 0, 0])]), 1, 'touching parts are one solid');
});

test('هندسه: استوانه و حلقه چرخشی با فرمول دقیق؛ ضخامت دیواره با پرتو', () => {
  near(G.volume(G.cylinder(5, 10, 128)).value, Math.PI * 25 * 10, 0.005, 'cylinder');
  // a ring of rectangular section: inner r 8, wall 2, height 3 → π(10²−8²)·3
  const ring = G.revolve([[8, 0], [10, 0], [10, 3], [8, 3]], 192);
  near(G.volume(ring).value, Math.PI * (100 - 64) * 3, 0.005, 'ring');
  assert.equal(G.watertight(ring).closed, true);
  const wt = G.wallThickness(ring, { samples: 400 });
  near(wt.min.value ?? wt.min, 2, 0.03, 'wall');
});

test('هندسه: بولی تفاضل، offset و اکسترود چندضلعی مقعر', () => {
  const diff = G.boolean('difference', G.box(10, 10, 10), G.translate(G.cylinder(2, 14, 64), [0, 0, -7]), 120);
  near(G.volume(diff).value, 1000 - Math.PI * 4 * 10, 0.03, 'difference');
  assert.equal(G.watertight(diff).closed, true);
  const L = G.extrude([[0, 0], [4, 0], [4, 1], [1, 1], [1, 4], [0, 4]], 2);
  near(G.volume(L).value, 7 * 2, 1e-6, 'L-extrude');
});

test('آلیاژها: چگالی و وزن؛ ۱۸ عیار زرد ≈ ۱۵٫۵؛ نقره ۹۲۵ سبک‌تر؛ انتخاب آلیاژ از عیار و رنگ', () => {
  assert.equal(materialFor(18, 'w'), 'au18w');
  assert.equal(materialFor(22), 'au22');
  assert.ok(MATERIALS.au18y.density > 15 && MATERIALS.au18y.density < 16.5);
  assert.ok(MATERIALS.ag925.density < MATERIALS.au18y.density && MATERIALS.pt950.density > MATERIALS.au18y.density);
  const w = weightOf(q(200, 'mm3'), 'au18y');
  assert.equal(w.unit, 'g');
  near(w.value, 0.2 * MATERIALS.au18y.density, 1e-3);
});

test('بریف: محصول، سبک، عیار، وزن، سنگ، ابعاد، روش ساخت و سایز خوانده می‌شود و طرح معتبر است', () => {
  const i = parseBrief('انگشتر ۱۸ عیار مینیمال، سنگ بیضی ۸×۶ چنگی، زیر ۴ گرم، مناسب ریخته‌گری، سایز ۵۴');
  assert.equal(i.productType, 'ring');
  assert.ok(i.style.includes('مینیمال'));
  assert.equal(i.targetKarat, 18);
  assert.deepEqual(i.weightRangeGrams, [0, 4]);
  assert.equal(i.stone.shape, 'oval');
  assert.deepEqual(i.stone.dimensionsMm, [8, 6]);
  assert.equal(i.stone.setting, 'prong');
  assert.equal(i.manufacturingMethod, 'casting');
  assert.equal(i.ringSizeIso, 54);
  assert.deepEqual(check(DESIGN_INTENT, i), []);
  const silver = parseBrief('دستبند نقره ظریف');
  assert.equal(silver.productType, 'bracelet');
  assert.equal(silver.material, 'ag925');
});

test('انگشتر از بریف: یک تکه، بسته، وزن معقول، بدون یافته مهندسی؛ برنامه CAD معتبر', async () => {
  const intent = parseBrief('انگشتر ۱۸ عیار مینیمال، سنگ بیضی ۸×۶، زیر ۴ گرم، ریخته‌گری');
  const p = paramsFromIntent(intent);
  near(p.innerDiameter, diameterFromIso(54), 0.01);
  const prog = programOf(p);
  assert.deepEqual(check(CAD_PROGRAM, prog), []);
  const { insp } = await build(p);
  assert.equal(insp.solids, 1);
  assert.equal(insp.closed, true);
  assert.ok(insp.weight.value > 1.5 && insp.weight.value < 4, `weight ${insp.weight.value}`);
  const f = [...manufacturingFindings(insp, p), ...weightFindings(insp, intent)];
  for (const x of f) assert.deepEqual(check(FINDING, x), []);
  assert.deepEqual(f.filter((x) => ['critical', 'high'].includes(x.severity)).map((x) => x.code), []);
  const head = insp.objects.find((o) => o.kind === 'head');
  assert.ok(head.measures.culetClearanceMm >= 0.3, 'the culet clears the shank');
});

test('ساخت: کف نازک → WALL_TOO_THIN بحرانی با شواهد اندازه‌گیری؛ وزن بیش از هدف → WEIGHT_OVER', async () => {
  const p = { ...paramsFromIntent(parseBrief('انگشتر ۱۸ عیار سنگ گرد ۵')), thickBottom: 0.5 };
  const { insp } = await build(p);
  const f = manufacturingFindings(insp, p);
  const thin = f.find((x) => x.code === 'WALL_TOO_THIN');
  assert.ok(thin, f.map((x) => x.code).join());
  assert.equal(thin.severity, 'critical');
  assert.equal(thin.kind, 'engineering');
  assert.ok(thin.measurableEvidence.actual < thin.measurableEvidence.expected);
  const heavy = weightFindings(insp, { weightRangeGrams: [0, 1] });
  assert.equal(heavy[0].code, 'WEIGHT_OVER');
  assert.equal(heavy[0].kind, 'weight');
});

test('نگین‌گذاری: چنگ نازک، تعداد کم برای سنگ بزرگ، نوک بی‌حفاظ، رکاب و پاوه بررسی می‌شوند', () => {
  const codes = (spec) => checkSetting(spec, 'au18y').map((f) => f.code);
  assert.ok(codes({ type: 'prong', stoneShape: 'round', stoneWidthMm: 6, prongCount: 4, prongDiameterMm: 0.4 }).includes('PRONG_THIN'));
  assert.ok(codes({ type: 'prong', stoneShape: 'round', stoneWidthMm: 6, prongCount: 2, prongDiameterMm: 0.8 }).includes('PRONG_COUNT'));
  assert.ok(codes({ type: 'prong', stoneShape: 'pear', stoneWidthMm: 6, stoneLengthMm: 9, prongCount: 4, prongDiameterMm: 0.9 }).includes('POINT_PROTECTION'));
  assert.ok(codes({ type: 'bezel', stoneShape: 'round', stoneWidthMm: 6, bezelWallMm: 0.3 }).includes('BEZEL_WALL'));
  assert.ok(codes({ type: 'pave', stoneShape: 'round', stoneWidthMm: 3.2, stoneSpacingMm: 0.05 }).some((c) => c.startsWith('PAVE')));
  assert.deepEqual(codes({ type: 'prong', stoneShape: 'round', stoneWidthMm: 6, prongCount: 4, prongDiameterMm: 0.8, seatDepthMm: 0.27 }), []);
  for (const f of checkSetting({ type: 'prong', stoneShape: 'round', stoneWidthMm: 6, prongCount: 4, prongDiameterMm: 0.4 })) assert.equal(f.kind, 'setting');
});

test('نقد زیبایی جدا از یافته مهندسی است و هرگز شدت بحرانی ندارد', () => {
  const p = { ...paramsFromIntent(parseBrief('انگشتر مینیمال ظریف سنگ گرد ۵')), headHeight: 8 };
  const c = critique(p, parseBrief('انگشتر مینیمال ظریف'));
  assert.ok(c.length > 0);
  assert.ok(c.every((f) => f.kind === 'aesthetic' && f.severity !== 'critical' && f.severity !== 'high'));
});

test('بهینه‌سازی وزن: فقط کف رکاب تغییر می‌کند، شانه و نگین دست‌نخورده، زیر حداقل‌ها نمی‌رود؛ هدف ناممکن با دلیل', async () => {
  const p = EXERCISE['weight-cut'].start;
  const full = { material: 'au18y', ...p };
  const { insp } = await build(full);
  const head = insp.objects.find((o) => o.kind === 'head');
  const headWeight = weightOf(head.volume, 'au18y').value;
  const target = insp.weight.value - 0.6;
  const o = optimizeWeight(full, { headWeight, targetGrams: target });
  assert.equal(o.feasible, true);
  assert.equal(o.params.widthTop, full.widthTop);
  assert.equal(o.params.thickTop, full.thickTop);
  assert.deepEqual(o.params.setting, full.setting);
  assert.ok(o.params.thickBottom >= MATERIALS.au18y.minStructural + 0.1 - 1e-9);
  const { insp: after } = await build(o.params);
  assert.ok(after.weight.value <= target + 0.08, `re-measured ${after.weight.value} vs target ${target}`);
  const impossible = optimizeWeight(full, { headWeight, targetGrams: 0.5 });
  assert.equal(impossible.feasible, false);
  assert.match(impossible.reason, /حداقل/);
});

test('مرز CAD: عملیات ناشناخته و ارجاع ناموجود رد می‌شوند؛ ویرایش روی نسخه تازه؛ خروجی STL', async () => {
  assert.throws(() => validateProgram([{ op: 'explode' }]));
  const a = createLocalAdapter();
  await assert.rejects(a.createGeometry([{ op: 'fillet', id: 'x', target: 'ghost', radius: 1 }], { id: 'r' }), /ghost/);
  const p = paramsFromIntent(parseBrief('حلقه ساده ۱۸ عیار'));
  await a.createGeometry(programOf(p), { id: 'b' });
  const stl = await a.exportModel('b', 'stl');
  assert.match(stl.text, /^solid beatris/);
  await assert.rejects(a.exportModel('b', '3dm'), /3dm/);
});

test('دستور ویرایش: پارامترها و هدف وزن خوانده می‌شود؛ جمله نامفهوم چیزی را تغییر نمی‌دهد', () => {
  const e = parseInstruction('ضخامت کف ۱٫۲ و وزن را ۰٫۵ گرم کم کن');
  assert.ok(e.edits.some((x) => x.param === 'thickBottom' && x.value === 1.2));
  assert.ok(e.edits.some((x) => x.action === 'reduceWeight' && x.grams === 0.5));
  assert.equal(parseInstruction('قشنگ‌ترش کن').understood, false);
  const p = applyEdits({ thickBottom: 1, setting: { prongCount: 4 } }, [{ param: 'thickBottom', value: 1.2 }, { param: 'prongCount', value: 6 }]);
  assert.equal(p.thickBottom, 1.2);
  assert.equal(p.setting.prongCount, 6);
});

test('تمرین استودیو: شروع نازک رد، اصلاح‌شده قبول؛ راهنمایی سطح‌بندی‌شده بدون عدد پاسخ', async () => {
  const ex = EXERCISE['thin-fix'];
  const start = { material: 'au18y', ...ex.start };
  const { insp } = await build(start);
  const f = [...manufacturingFindings(insp, start), ...weightFindings(insp, { weightRangeGrams: ex.target.weight })];
  const a = assessExercise(ex, start, insp, f);
  assert.equal(a.passed, false);
  assert.equal(a.criteria.structure, 0);
  const h1 = studioHint(ex, a, 1), h3 = studioHint(ex, a, 3);
  assert.match(h1.text, /برقرار نیست/);
  assert.match(h3.text, /قاعده/);
  const fixed = { ...start, thickBottom: 1.2, widthBottom: 1.6, setting: { ...start.setting, prongDiameterMm: 0.75, seatDepthMm: 0.3 } };
  const { insp: i2 } = await build(fixed);
  const f2 = [...manufacturingFindings(i2, fixed), ...weightFindings(i2, { weightRangeGrams: ex.target.weight })];
  const a2 = assessExercise(ex, fixed, i2, f2);
  assert.equal(a2.passed, true, JSON.stringify({ c: a2.criteria, f: f2.map((x) => x.code), w: i2.weight.value }));
  for (const s of ex.skills) assert.ok(a2.skills[s] >= 0.9);
});

test('گراف مهارت استودیو روی همان زیرساخت: مهارت‌های والد/پیش‌نیاز معتبر و تمرکز بعدی', () => {
  for (const s of STUDIO_SKILLS) for (const n of s.needs) assert.ok(STUDIO.SKILL[n], `${s.id} needs ${n}`);
  const first = STUDIO.nextFocus({});
  assert.ok(STUDIO.unlocked({}).includes(first.skillId));
  assert.equal(first.reason, 'new-skill');
  assert.equal(STUDIO.readiness({}), 0);
  assert.ok(STUDIO.unlocked({}).includes('cad.ring') && !STUDIO.unlocked({}).includes('mfg.casting'));
});

test('حلقه: قطر داخلی از سایز و حجم رکاب یکنواخت با فرمول بیضوی-مستطیلی نزدیک است', () => {
  const d = diameterFromIso(54);
  const m = shankMesh({ innerDiameter: d, widthTop: 3, widthBottom: 3, thickTop: 1.5, thickBottom: 1.5 }, { segments: 160, section: 24 });
  assert.equal(G.watertight(m).closed, true);
  const v = G.volume(m).value;
  const outer = Math.PI * ((d / 2 + 1.5) ** 2 - (d / 2) ** 2) * 3; // a plain rectangular band: an upper bound
  assert.ok(v < outer && v > outer * 0.8, `${v} vs ${outer}`);
});
