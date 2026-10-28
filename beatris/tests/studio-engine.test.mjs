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
import { diameterFromIso, shankMesh, outerAt, stoneProportions } from '../public/js/studio/ring.mjs';
import { checkSetting } from '../public/js/studio/setting.mjs';
import { paramsFromIntent, programOf, manufacturingFindings, weightFindings, critique, optimizeWeight } from '../public/js/studio/design.mjs';
import { createLocalAdapter, validateProgram } from '../public/js/studio/cad.mjs';
import { parseInstruction, applyEdits } from '../public/js/studio/instruct.mjs';
import { EXERCISE, assessExercise, studioHint } from '../public/js/studio/exercises.mjs';
import { STUDIO, STUDIO_SKILLS } from '../public/js/studio/skills.mjs';
import { check } from '../public/js/schema.mjs';
import { DESIGN_INTENT, CAD_PROGRAM, FINDING, SETTING_TYPES } from '../public/js/studio/schemas.mjs';

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
  assert.ok(codes({ type: 'bezel', stoneShape: 'round', stoneWidthMm: 6, wallMm: 0.3 }).includes('BEZEL_WALL'));
  assert.ok(codes({ type: 'pave', stoneShape: 'round', stoneWidthMm: 1.3, spacingMm: 0.05, beadsPerStone: 4 }).includes('PAVE_SPACING'));
  assert.ok(codes({ type: 'pave', stoneShape: 'round', stoneWidthMm: 3.2, spacingMm: 0.15, beadsPerStone: 4 }).includes('PAVE_SIZE'));
  assert.ok(codes({ type: 'tension', stoneShape: 'round', stoneWidthMm: 5, stoneType: 'diamond', metalDepthMm: 3, seatDepthMm: 0.1 }).includes('TENSION_GRIP'));
  assert.ok(codes({ type: 'halo', stoneShape: 'round', stoneWidthMm: 6, prongCount: 4, prongDiameterMm: 0.4, haloStoneMm: 1.2 }).includes('PRONG_THIN'), 'a halo centre answers to the prong rules');
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

/* ---------------- spec 0056: every stone setting as a measured 3D model ---------------- */
const SETTING_BRIEFS = {
  prong: 'انگشتر ۱۸ عیار، سنگ گرد ۵٫۵ میل چنگی، سایز ۵۴',
  bezel: 'انگشتر ۱۸ عیار قاب‌دار، سنگ گرد ۵٫۵ میل، سایز ۵۴',
  halo: 'انگشتر ۱۸ عیار هاله، سنگ گرد ۵٫۵ میل، سایز ۵۴',
  channel: 'انگشتر ۱۸ عیار ریلی، سنگ گرد ۲٫۵ میل، سایز ۵۴',
  pave: 'انگشتر ۱۸ عیار پاوه، سنگ گرد ۱٫۳ میل، سایز ۵۴',
  flush: 'انگشتر ۱۸ عیار دفنی، سنگ گرد ۲٫۵ میل، سایز ۵۴',
  tension: 'انگشتر ۱۸ عیار فشاری، سنگ گرد ۵ میل الماس، سایز ۵۴',
};
const built = new Map();
const buildType = async (type) => {
  if (!built.has(type)) {
    const intent = parseBrief(SETTING_BRIEFS[type]);
    const p = paramsFromIntent(intent);
    const t0 = performance.now();
    const { a, insp } = await build(p);
    built.set(type, { intent, p, a, insp, ms: performance.now() - t0 });
  }
  return built.get(type);
};

test('نگین‌گذاری سه‌بعدی: هر هفت نوع از بریف، بسته، یک تکه، با اندازه‌ها، سنگ و قیراط، وزن معقول و بی یافته‌ی جدی', async () => {
  assert.deepEqual(Object.keys(SETTING_BRIEFS).sort(), [...SETTING_TYPES].sort());
  for (const type of SETTING_TYPES) {
    const { intent, p, insp, ms } = await buildType(type);
    assert.equal(intent.stone.setting, type, type);
    assert.deepEqual(check(CAD_PROGRAM, programOf(p)), [], type);
    assert.equal(insp.closed, true, `${type} closed`);
    assert.equal(insp.solids, 1, `${type} one piece`);
    const s = insp.settings.find((x) => x.type === type);
    assert.ok(s && Object.keys(s.measures).length >= 4, `${type} measures`);
    assert.ok(insp.stones.length && insp.stones.every((x) => x.count >= 1 && x.carats > 0), `${type} stones`);
    assert.ok(insp.weight.value > 1.5 && insp.weight.value < 6, `${type} weight ${insp.weight.value}`);
    const f = [...manufacturingFindings(insp, p), ...critique(p, intent)];
    for (const x of f) assert.deepEqual(check(FINDING, x), [], `${type} ${x.code}`);
    assert.deepEqual(f.filter((x) => ['critical', 'high'].includes(x.severity)).map((x) => x.code), [], type);
    assert.ok(!f.some((x) => x.code === 'SETTING_NOT_MODELLED'), type);
    assert.ok(ms < 4000, `${type} built and measured in ${Math.round(ms)} ms`);
  }
});

test('نگین‌گذاری سه‌بعدی: واقعیت هندسی هر نوع از مدل ساخته‌شده خوانده می‌شود', async () => {
  // bezel: the collar's wall is the declared wall, the lip holds, the stone clears the band
  const bz = await buildType('bezel');
  const bm = bz.insp.settings[0].measures;
  assert.equal(bm.wallMm, bz.p.setting.wallMm);
  assert.ok(bm.lipOverGirdleMm >= 0.4 && bm.culetClearanceMm >= 0.3);
  const head = bz.insp.objects.find((o) => o.kind === 'head');
  near(head.size[0].value, bz.p.setting.stoneWidthMm + 2 * bm.wallMm, 0.02, 'the collar is the stone and two walls wide');
  // halo: N small stones and two beads between every two of them
  const hl = await buildType('halo');
  const hm = hl.insp.settings[0].measures;
  const melee = hl.insp.stones.find((x) => x.id === 'head_halo');
  assert.ok(hm.haloCount >= 12 && melee.count === hm.haloCount);
  assert.ok(hm.haloSpacingMm >= hl.p.setting.spacingMm);
  assert.equal(hl.a.model('m').objects.head.meta.parts.length, 4, 'prongs, gallery, frame and beads');
  // channel: the stones in a row, metal enough under every culet
  const ch = await buildType('channel');
  const cm = ch.insp.settings[0].measures;
  assert.equal(ch.insp.stones[0].count, cm.stoneCount);
  assert.ok(cm.floorUnderCuletMm >= 0.3 && cm.grooveMm > 0);
  // pavé: rows × columns, four beads per stone
  const pv = await buildType('pave');
  const pm = pv.insp.settings[0].measures;
  assert.equal(pv.insp.stones[0].count, pm.rows * pm.columns);
  assert.equal(pm.beadsPerStone, 4);
  assert.ok(pm.beadDiameterMm > 0 && pm.beadDiameterMm <= 0.9);
  // flush: the table level with the band, no metal added, the depth as built
  const fl = await buildType('flush');
  const fm = fl.insp.settings[0].measures;
  const { crown } = stoneProportions(fl.p.setting);
  assert.ok(Math.abs(fm.girdleZ + crown - outerAt(fl.p, 0, 0)) < 0.02);
  assert.equal(fm.metalDepthMm, fl.p.thickTop);
  assert.ok(!fl.insp.objects.some((o) => o.kind === 'head'));
  // tension: the band itself opens; the gap is the stone less its two notches; the culet clears the finger
  const tn = await buildType('tension');
  const tm = tn.insp.settings[0].measures;
  near(tm.gapMm, tn.p.setting.stoneWidthMm - 2 * tn.p.setting.seatDepthMm, 0.01, 'gap');
  assert.ok(tm.culetClearanceMm >= 0.3);
  // the ends are radial faces: no band vertex lies at a smaller angle from the top than the opening's half angle
  const shank = tn.a.model('m').objects.shank.mesh.position, half = Math.atan(tm.gapMm / 2 / tm.girdleZ);
  let inGap = 0;
  for (let i = 0; i < shank.length; i += 3) if (shank[i + 2] > 0 && Math.atan2(Math.abs(shank[i]), shank[i + 2]) < half - 1e-4) inGap++;
  assert.equal(inGap, 0, 'no band metal inside the opening');
  const closedBand = G.volume(shankMesh(tn.p)).value;
  assert.ok(tn.insp.objects.find((o) => o.kind === 'shank').volume.value < closedBand, 'the opening takes metal out');
});

test('نگین‌گذاری سه‌بعدی: نشیمن سنگ و هم‌پوشانی فلز از وزن کم می‌شود', async () => {
  const fl = await buildType('flush');
  // the flush stone sits almost wholly in metal: its seat is about its own volume
  const stone = G.volume(fl.a.model('m').objects.head_stone.mesh).value;
  near(fl.insp.seatVolume.value, stone, 0.15, 'seat ≈ the stone');
  const sum = fl.insp.objects.reduce((s, o) => s + o.volume.value, 0);
  near(fl.insp.metalVolume.value, sum - fl.insp.seatVolume.value - fl.insp.overlapVolume.value, 1e-3, 'metal = meshes − seat − overlap');
  // a bezel's collar dips into the band: that metal is counted once
  const bz = await buildType('bezel');
  assert.ok(bz.insp.overlapVolume.value > 0 && bz.insp.seatVolume.value > 0);
});

test('نگین‌گذاری سه‌بعدی: مقدار نادرست با یافته‌ی اندازه‌گیری‌شده رد می‌شود', async () => {
  const codes = async (type, edit) => {
    const { p } = await buildType(type);
    const q2 = edit(structuredClone(p));
    const { insp } = await build(q2);
    return manufacturingFindings(insp, q2);
  };
  const thinBezel = await codes('bezel', (p) => ((p.setting.wallMm = 0.4), p));
  assert.ok(thinBezel.some((x) => x.code === 'BEZEL_WALL'));
  const hw = thinBezel.find((x) => x.code === 'HEAD_WALL_THIN');
  assert.equal(hw.severity, 'critical');
  assert.equal(hw.measurableEvidence.actual, 0.4);
  const thinFlush = await codes('flush', (p) => ((p.thickTop = 1.4), p));
  const fd = thinFlush.find((x) => x.code === 'FLUSH_DEPTH');
  assert.equal(fd.measurableEvidence.actual, 1.4, 'the depth as built, not as declared');
  const narrowFlush = await codes('flush', (p) => ((p.widthTop = 2.6), p));
  assert.ok(narrowFlush.find((x) => x.code === 'STONE_EDGE_EXPOSED')?.measurableEvidence.actual < 0.1, 'a 2.5 mm stone on a 2.6 mm band shows at the sides');
  const soft = await codes('tension', (p) => ((p.setting.stoneType = 'turquoise'), p));
  assert.equal(soft.find((x) => x.code === 'TENSION_STONE').severity, 'critical');
  const bigChannel = await codes('channel', (p) => ((p.setting.stoneWidthMm = p.setting.stoneLengthMm = 5), p));
  assert.ok(bigChannel.some((x) => x.code === 'CHANNEL_SIZE'));
  const longChannel = await codes('channel', (p) => ((p.setting.stoneCount = 13), p));
  assert.ok(longChannel.find((x) => x.code === 'RAIL_OFF_BAND')?.measurableEvidence.actual < 0, 'the tapering band is narrower than the rails at the channel ends');
  const thinPave = await codes('pave', (p) => ((p.thickTop = 0.9), (p.thickBottom = 0.9), p));
  const fu = thinPave.find((x) => x.code === 'FLOOR_UNDER_STONE');
  assert.ok(fu && fu.measurableEvidence.actual < 0.3);
});

test('نگین‌گذاری سه‌بعدی: کاهش وزن قاب‌دار به نگین دست نمی‌زند و دوباره‌سنجی زیر هدف است', async () => {
  const { p, insp } = await buildType('bezel');
  const shank = insp.objects.find((o) => o.kind === 'shank');
  const headWeight = insp.weight.value - weightOf(shank.volume, p.material).value;
  const target = insp.weight.value - 0.4;
  const o = optimizeWeight(p, { headWeight, targetGrams: target });
  assert.equal(o.feasible, true);
  assert.deepEqual(o.params.setting, p.setting);
  assert.equal(o.params.headHeight, p.headHeight);
  const { insp: after } = await build(o.params);
  assert.ok(after.weight.value <= target + 0.05, `re-measured ${after.weight.value} vs target ${target}`);
});

test('نگین‌گذاری سه‌بعدی: دستور «دیواره» و «۱۱ سنگ» نگین را ویرایش می‌کند', () => {
  const e = parseInstruction('دیواره ۰٫۸ و ۱۱ سنگ');
  assert.ok(e.edits.some((x) => x.param === 'wallMm' && x.value === 0.8));
  assert.ok(e.edits.some((x) => x.param === 'stoneCount' && x.value === 11));
  const p = applyEdits({ thickTop: 1.7, setting: { type: 'channel', wallMm: 0.6, stoneCount: 5 } }, e.edits);
  assert.equal(p.setting.wallMm, 0.8);
  assert.equal(p.setting.stoneCount, 11);
  assert.equal(p.wallMm, undefined, 'setting numbers stay in the setting');
});
