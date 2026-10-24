// ابزارهای استودیو (spec 0016): typed tools over the deterministic studio engine. A model never reaches geometry
// except through a validated CadOperation program; measurements, weights and findings are computed here. Saving a
// new version is free; overwriting, deleting and production exports wait for a manager's approval.
import { S } from '../../public/js/schema.mjs';
import { DESIGN_INTENT, CAD_PROGRAM, SETTING_SPEC, ASSESSMENT, FINDING } from '../../public/js/studio/schemas.mjs';
import { parseBrief } from '../../public/js/studio/brief.mjs';
import { paramsFromIntent, programOf, manufacturingFindings, weightFindings, critique, optimizeWeight } from '../../public/js/studio/design.mjs';
import { checkSetting } from '../../public/js/studio/setting.mjs';
import { createLocalAdapter, EXPORT_FORMATS } from '../../public/js/studio/cad.mjs';
import { parseInstruction, applyEdits } from '../../public/js/studio/instruct.mjs';
import { EXERCISE, STUDIO_EXERCISES, assessExercise, studioHint } from '../../public/js/studio/exercises.mjs';
import { STUDIO, SKILL_OF_FINDING } from '../../public/js/studio/skills.mjs';
import { MATERIALS, weightOf } from '../../public/js/studio/materials.mjs';
import { check } from '../../public/js/schema.mjs';
import { structured } from '../agent-platform/provider.mjs';

const ID = S.str({ pattern: '^[A-Za-z0-9_:-]{4,80}$' });
const KEY = S.str({ pattern: '^[A-Za-z0-9:_-]{6,96}$' });
const PARAMS = S.obj({
  material: S.str({ enum: Object.keys(MATERIALS) }),
  innerDiameter: S.num({ minimum: 10, maximum: 30 }), widthTop: S.num({ minimum: 0.8, maximum: 20 }), widthBottom: S.num({ minimum: 0.8, maximum: 20 }),
  thickTop: S.num({ minimum: 0.3, maximum: 6 }), thickBottom: S.num({ minimum: 0.3, maximum: 6 }),
  headHeight: { type: ['number', 'null'], minimum: 0.5, maximum: 15 }, setting: { oneOf: [{ type: 'null' }, SETTING_SPEC] },
}, ['material', 'innerDiameter', 'widthTop', 'widthBottom', 'thickTop', 'thickBottom']);
export const STUDIO_PARAMS = PARAMS;
const INSPECTION = S.obj({ material: S.str(), materialFa: S.str(), objects: S.arr({ type: 'object' }), metalVolume: { type: 'object' }, weight: S.obj({ value: S.num({ minimum: 0 }), unit: S.str({ enum: ['g'] }) }), solids: S.int({ minimum: 0 }), closed: S.bool(), bounds: { type: ['array', 'null'] }, stones: S.arr({ type: 'object' }) }, ['weight', 'solids', 'closed', 'objects']);
const FINDINGS = S.arr(FINDING, { maxItems: 80 });

export function buildStudioTools({ store, training, provider = null, adapter = createLocalAdapter() }) {
  const own = (ctx, pid) => {
    const p = store.project(pid);
    if (!p || p.userId !== ctx.user.id) throw Object.assign(new Error('پروژه پیدا نشد.'), { status: 404 });
    return p;
  };
  // the adapter keeps meshes in memory: only the most recent models stay; any other is rebuilt from its program
  const live = [];
  const remember = (id) => {
    const at = live.indexOf(id);
    if (at >= 0) live.splice(at, 1);
    live.push(id);
    while (live.length > 24) adapter.drop(live.shift());
  };
  /** A stored model is rebuilt into the adapter from its program (deterministic), once per process. */
  const ensure = async (m) => {
    if (!adapter.model(m.id)) await adapter.createGeometry(m.program, { id: m.id, material: m.material });
    remember(m.id);
    return m;
  };
  const ownModel = async (ctx, mid) => {
    const m = store.model(mid);
    if (!m) throw Object.assign(new Error('مدل پیدا نشد.'), { status: 404 });
    own(ctx, m.projectId);
    return ensure(m);
  };
  return {
    'studio.createDesignIntent': {
      label: 'خواندن بریف', input: S.obj({ brief: S.str({ minLength: 4, maxLength: 2000 }), useModel: S.bool() }, ['brief']),
      async run({ brief, useModel }) {
        const intent = parseBrief(brief);
        // confidence: how much of the brief the rules could read (type, stone, karat, weight, method)
        const fields = [intent.productType !== 'other', !!intent.stone?.shape, !!intent.targetKarat || !!intent.material, !!intent.weightRangeGrams, !!intent.manufacturingMethod];
        const confidence = Math.round((fields.filter(Boolean).length / fields.length) * 100) / 100;
        let source = 'rules';
        if (useModel && provider?.available?.()) {
          // the model may only add words to the aesthetic description and styles; numbers stay the rules'
          const r = await structured(provider, { system: 'تو دستیار طراح جواهر هستی.', prompt: `بریف: ${brief}\nفقط این دو را بده: style (فهرست صفت‌های سبک فارسی) و aestheticIntent (یک جمله).`, schema: S.obj({ style: S.arr(S.str({ maxLength: 40 }), { maxItems: 8 }), aestheticIntent: S.str({ maxLength: 600 }) }), retries: 2 });
          if (r.ok) {
            intent.style = [...new Set([...intent.style, ...r.value.style])];
            intent.aestheticIntent = r.value.aestheticIntent;
            source = 'rules+model';
          }
        }
        const errs = check(DESIGN_INTENT, intent, 'intent');
        if (errs.length) throw Object.assign(new Error(errs.join(' ')), { code: 'E_SCHEMA' });
        return { intent, confidence, source };
      },
    },
    'studio.paramsFromIntent': { label: 'پارامترهای شروع', input: S.obj({ intent: DESIGN_INTENT }), output: PARAMS, run: ({ intent }) => paramsFromIntent(intent) },
    'studio.critique': { label: 'نقد زیبایی', input: S.obj({ params: PARAMS, intent: DESIGN_INTENT }, ['params']), output: FINDINGS, run: ({ params, intent }) => critique(params, intent) },
    'studio.saveProject': {
      label: 'ذخیره پروژه', input: S.obj({ projectId: ID, title: S.str({ maxLength: 120 }), brief: S.str({ maxLength: 2000 }), intent: DESIGN_INTENT, params: PARAMS }, ['params']),
      run: ({ projectId, title, brief, intent, params }, ctx) => (projectId ? (own(ctx, projectId), { id: projectId }) : store.createProject(ctx.user.id, { title: title ?? 'طرح تازه', brief, intent: intent ?? { productType: 'ring', style: [], constraints: [], aestheticIntent: '' }, params })),
    },
    'studio.programOf': { label: 'برنامه CAD از پارامترها', input: S.obj({ params: PARAMS }), output: CAD_PROGRAM, run: ({ params }) => programOf(params) },
    'studio.parseInstruction': { label: 'فهم دستور ویرایش', input: S.obj({ text: S.str({ minLength: 2, maxLength: 400 }) }), run: ({ text }) => parseInstruction(text) },
    'studio.applyEdits': { label: 'اعمال ویرایش پارامترها', input: S.obj({ params: PARAMS, edits: S.arr({ type: 'object' }, { maxItems: 20 }) }), output: PARAMS, run: ({ params, edits }) => applyEdits(params, edits) },
    'studio.optimizeWeight': {
      label: 'کاهش وزن کنترل‌شده', input: S.obj({ params: PARAMS, inspection: INSPECTION, targetGrams: S.num({ minimum: 0.1 }), free: S.arr(S.str({ enum: ['widthBottom', 'thickBottom', 'widthTop', 'thickTop'] }), { maxItems: 4 }), lockShoulders: S.bool() }, ['params', 'targetGrams']),
      run: (a) => {
        // the head is not touched: its measured metal weight is a constant of the search
        const head = a.inspection?.objects.find((o) => o.kind === 'head');
        const headWeight = head ? weightOf(head.volume, a.params.material).value : 0;
        return optimizeWeight(a.params, { headWeight, targetGrams: a.targetGrams, free: a.free ?? ['widthBottom', 'thickBottom'], lockShoulders: a.lockShoulders !== false });
      },
    },
    'studio.getProject': {
      label: 'خواندن پروژه', input: S.obj({ projectId: ID }),
      run: ({ projectId }, ctx) => ({ project: own(ctx, projectId), model: store.latestModel(projectId) }),
    },
    /* CAD boundary (the local engine; a Rhino adapter would sit behind the same calls) */
    'cad.createGeometry': {
      label: 'ساخت هندسه', input: S.obj({ projectId: ID, program: CAD_PROGRAM, params: PARAMS }),
      async run({ projectId, program, params }, ctx) {
        own(ctx, projectId);
        const m = store.addModel(projectId, { program, params, material: params.material });
        const summary = await adapter.createGeometry(program, { id: m.id, material: params.material });
        remember(m.id);
        ctx.emit?.('studio.geometry.created', { model: m.id, version: m.version });
        return { modelId: m.id, version: m.version, objects: summary.objects };
      },
    },
    'cad.modifyGeometry': {
      label: 'ویرایش هندسه', input: S.obj({ projectId: ID, operations: CAD_PROGRAM }),
      async run({ projectId, operations }, ctx) {
        const p = own(ctx, projectId);
        const prev = store.latestModel(projectId);
        if (!prev) throw Object.assign(new Error('هنوز مدلی برای ویرایش نیست.'), { status: 400 });
        await ensure(prev);
        // the operations run on a copy first: an invalid step fails here and nothing is stored
        const trial = createLocalAdapter({ material: prev.material });
        await trial.createGeometry(prev.program, { id: 'try', material: prev.material });
        await trial.modifyGeometry('try', operations);
        const m = store.addModel(projectId, { program: [...prev.program, ...operations], params: p.params, material: prev.material });
        const summary = await adapter.createGeometry(m.program, { id: m.id, material: m.material });
        remember(m.id);
        ctx.emit?.('studio.geometry.modified', { model: m.id, version: m.version, from: prev.version, ops: operations.length });
        return { modelId: m.id, version: m.version, objects: summary.objects };
      },
    },
    'studio.inspectDesign': {
      label: 'بررسی طرح', input: S.obj({ modelId: ID }),
      async run({ modelId }, ctx) {
        const m = await ownModel(ctx, modelId);
        const insp = await adapter.inspectGeometry(modelId, { samples: 120 });
        const f = m.findings ?? [];
        return { version: m.version, weight: insp.weight.value, solids: insp.solids, closed: insp.closed, bounds: insp.bounds, mustFix: f.filter((x) => x.kind !== 'aesthetic' && ['critical', 'high'].includes(x.severity)).length, notes: f.filter((x) => x.kind === 'aesthetic').length, checked: m.findings != null };
      },
    },
    'cad.inspectGeometry': {
      label: 'اندازه‌گیری هندسه', input: S.obj({ modelId: ID }), output: INSPECTION,
      async run({ modelId }, ctx) {
        await ownModel(ctx, modelId);
        const insp = await adapter.inspectGeometry(modelId);
        return insp;
      },
    },
    'studio.estimateWeight': { label: 'وزن تخمینی', input: S.obj({ modelId: ID }), async run({ modelId }, ctx) {
      await ownModel(ctx, modelId);
      const i = await adapter.inspectGeometry(modelId, { samples: 60 });
      return { weight: i.weight, metalVolume: i.metalVolume, material: i.material };
    } },
    'cad.exportModel': {
      label: 'خروجی مدل', input: S.obj({ modelId: ID, format: S.str({ enum: EXPORT_FORMATS }), production: S.bool() }, ['modelId', 'format']),
      approver: 'books.admin',
      approval: ({ production, format }) => (production ? `انتشار فایل تولیدی ${format.toUpperCase()} برای ساخت` : null),
      async run({ modelId, format, production }, ctx) {
        await ownModel(ctx, modelId);
        const e = await adapter.exportModel(modelId, format);
        store.recordExport(modelId, format, !!production, e.text.length, ctx.user.id);
        return { format, mime: e.mime, bytes: e.text.length, text: e.text };
      },
    },
    'studio.deleteModel': {
      label: 'حذف پروژه', input: S.obj({ projectId: ID }), approver: 'books.admin',
      approval: ({ projectId }) => `حذف پروژه طراحی ${projectId}`,
      run: ({ projectId }, ctx) => (own(ctx, projectId), store.softDelete(projectId), { deleted: projectId }),
    },
    'studio.overwriteModel': {
      label: 'جایگزینی نسخه نهایی', input: S.obj({ projectId: ID }), approver: 'books.admin',
      approval: ({ projectId }) => `نهایی کردن (جایگزینی مشخصات تولید) پروژه ${projectId}`,
      run: ({ projectId }, ctx) => (own(ctx, projectId), store.finalize(projectId), ctx.emit?.('studio.project.completed', { project: projectId }), { final: projectId }),
    },
    /* manufacturing rules (detect) */
    'manufacturing.validate': {
      label: 'بررسی قابلیت ساخت', input: S.obj({ modelId: ID, inspection: INSPECTION, params: PARAMS, method: S.str({ enum: ['casting', 'handmade', 'cnc', 'printing', 'mixed'] }) }, ['inspection', 'params']), output: FINDINGS,
      run: ({ inspection, params, method }) => manufacturingFindings(inspection, params, { method: method ?? 'casting' }),
    },
    'manufacturing.checkThickness': { label: 'بررسی ضخامت', input: S.obj({ inspection: INSPECTION, params: PARAMS }), output: FINDINGS, run: ({ inspection, params }) => manufacturingFindings(inspection, params).filter((f) => /WALL|STRUCTURE|POLISH|DEFORMATION|THICKNESS/.test(f.code)) },
    'manufacturing.checkSetting': { label: 'بررسی نگین‌گذاری', input: S.obj({ spec: SETTING_SPEC, material: S.str({ enum: Object.keys(MATERIALS) }) }, ['spec']), output: FINDINGS, run: ({ spec, material }) => checkSetting(spec, material ?? 'au18y') },
    'manufacturing.checkCasting': { label: 'بررسی ریخته‌گری', input: S.obj({ inspection: INSPECTION, params: PARAMS }), output: FINDINGS, run: ({ inspection, params }) => manufacturingFindings(inspection, params, { method: 'casting' }).filter((f) => /CASTING|OPEN|FLOATING|THICKNESS|WALL/.test(f.code)) },
    'studio.weightFindings': { label: 'مقایسه با وزن هدف', input: S.obj({ inspection: INSPECTION, intent: DESIGN_INTENT }), output: FINDINGS, run: ({ inspection, intent }) => weightFindings(inspection, intent) },
    'studio.saveFindings': {
      label: 'ثبت نتیجه بررسی', input: S.obj({ modelId: ID, inspection: INSPECTION, findings: FINDINGS }),
      async run({ modelId, inspection, findings }, ctx) {
        await ownModel(ctx, modelId);
        store.setInspection(modelId, inspection, findings);
        if (findings.some((f) => f.severity === 'critical' || f.severity === 'high')) ctx.emit?.('studio.validation.failed', { model: modelId, codes: findings.map((f) => f.code) });
        if (findings.some((f) => f.code === 'WEIGHT_OVER')) ctx.emit?.('studio.weight.exceeded', { model: modelId });
        return { saved: true };
      },
    },
    /* studio training (shared skill graph) */
    'training.generateStudioExercise': {
      label: 'ساخت تمرین استودیو', input: S.obj({ exerciseId: S.str({ enum: STUDIO_EXERCISES.map((e) => e.id) }), reason: S.str({ maxLength: 120 }) }, []),
      run({ exerciseId, reason }, ctx) {
        let ex = exerciseId;
        if (!ex) {
          const focus = STUDIO.nextFocus(training.masteries(ctx.user.id));
          const fit = STUDIO_EXERCISES.filter((e) => e.skills.includes(focus.skillId));
          ex = (fit.find((e) => e.difficulty === focus.difficulty) ?? fit[0] ?? STUDIO_EXERCISES[0]).id;
        }
        const row = store.addExercise(ctx.user.id, ex, EXERCISE[ex].start, { assignedBy: ctx.origin === 'user' ? 'tutor' : ctx.origin, reason: reason ?? null });
        return { ...row, title: EXERCISE[ex].title, brief: EXERCISE[ex].brief, stages: EXERCISE[ex].stages };
      },
    },
    'training.evaluateCadExercise': {
      label: 'ارزیابی تمرین CAD', input: S.obj({ exerciseRow: ID, params: PARAMS, key: KEY }), output: S.obj({ assessment: ASSESSMENT, attemptId: S.str(), replayed: S.bool(), weight: S.num(), passed: S.bool(), attempts: S.int() }),
      async run({ exerciseRow, params, key }, ctx) {
        const row = store.exercise(exerciseRow);
        if (!row || row.userId !== ctx.user.id) throw Object.assign(new Error('تمرین پیدا نشد.'), { status: 404 });
        const seen = store.attemptByKey(key);
        if (seen) return { assessment: seen.assessment, attemptId: seen.id, replayed: true, weight: 0, passed: seen.passed, attempts: row.attempts };
        const ex = EXERCISE[row.exerciseId];
        const local = createLocalAdapter({ material: params.material });
        await local.createGeometry(programOf(params), { id: 'x' });
        const insp = await local.inspectGeometry('x');
        const intent = { weightRangeGrams: ex.target.weight };
        const findings = [...manufacturingFindings(insp, params), ...weightFindings(insp, intent)];
        const assessment = assessExercise(ex, params, insp, findings);
        const errs = check(ASSESSMENT, assessment, 'assessment');
        if (errs.length) throw Object.assign(new Error(errs.join(' ')), { code: 'E_SCHEMA' });
        const attemptId = store.addAttempt(exerciseRow, ctx.user.id, { key, params, assessment, weightG: insp.weight.value });
        if (assessment.passed) ctx.emit?.('training.exercise.completed', { exercise: row.exerciseId });
        return { assessment, attemptId, replayed: false, weight: insp.weight.value, passed: assessment.passed, attempts: row.attempts + 1 };
      },
    },
    'training.updateStudioMastery': {
      label: 'به‌روزرسانی تسلط استودیو', input: S.obj({ skills: { type: 'object' }, key: KEY }),
      run: ({ skills, key }, ctx) => {
        const out = training.applyMastery(ctx.user.id, Object.fromEntries(Object.entries(skills).filter(([k, v]) => STUDIO.SKILL[k] && typeof v === 'number' && v >= 0 && v <= 1)), key);
        ctx.emit?.('training.skill.updated', { skills: Object.keys(out) });
        return out;
      },
    },
    'training.studioHint': {
      label: 'راهنمایی تمرین', input: S.obj({ exerciseRow: ID, level: S.int({ minimum: 1, maximum: 3 }) }),
      run: ({ exerciseRow, level }, ctx) => {
        const row = store.exercise(exerciseRow);
        if (!row || row.userId !== ctx.user.id) throw Object.assign(new Error('تمرین پیدا نشد.'), { status: 404 });
        store.hint(exerciseRow);
        const last = store.attempts(exerciseRow).at(-1)?.assessment ?? null;
        return studioHint(EXERCISE[row.exerciseId], last, level);
      },
    },
    'training.explainFindings': {
      label: 'توضیح آموزشی یافته‌ها', input: S.obj({ findings: FINDINGS }),
      run: ({ findings }) => ({ lines: findings.slice(0, 8).map((f) => ({ code: f.code, kind: f.kind, text: `${f.titleFa}: ${f.explanationFa}${f.recommendedActionFa ? ` پیشنهاد: ${f.recommendedActionFa}` : ''}`, skill: SKILL_OF_FINDING[f.code] ?? null })) }),
    },
    'training.studioProgress': {
      label: 'پیشرفت استودیو', input: S.obj({}),
      run: (_a, ctx) => {
        const m = training.masteries(ctx.user.id);
        return { readiness: STUDIO.readiness(m), next: STUDIO.nextFocus(m), skills: STUDIO.LEAF.map((id) => ({ id, fa: STUDIO.SKILL[id].fa, mastery: m[id]?.mastery ?? 0, attempts: m[id]?.attempts ?? 0 })), open: store.openExercises(ctx.user.id).map((e) => store.exercise(e)), recent: store.userAttempts(ctx.user.id, 10) };
      },
    },
    'training.openStudioWork': { label: 'کارهای باز استودیو', input: S.obj({}), run: (_a, ctx) => ({ exercises: store.openExercises(ctx.user.id).length, projects: store.projects(ctx.user.id).filter((p) => p.status === 'draft').length }) },
  };
}
