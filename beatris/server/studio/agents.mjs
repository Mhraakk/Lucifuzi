// عامل‌های استودیو و آموزش (spec 0016): registered definitions on the shared agent platform. Each has a narrow job,
// its own tools (least privilege) and the agents it may ask; none computes a measurement — the engine does.
//   • studio-design   — brief → typed intent → starting parameters → aesthetic critique → asks rhino-cad to build
//                       and manufacturing to check; edits and weight goals arrive as typed instructions.
//   • rhino-cad       — parameters → a validated CadOperation program → geometry through the CAD adapter → measures.
//   • manufacturing   — measured inspection → engineering, setting and weight findings; saves them on the version.
//   • training-tutor  — explains findings for a trainee, gives levelled hints, weekly studio review.
//   • assessment      — grades a studio exercise attempt on the engine and updates the shared mastery.
const fa = (n, d = 2) => Number(n).toLocaleString('fa-IR', { maximumFractionDigits: d });
const week = (iso) => {
  const d = new Date(iso);
  const start = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return `${d.getUTCFullYear()}-w${Math.ceil(((d - start) / 86400000 + start.getUTCDay() + 1) / 7)}`;
};
const ENGINEERING = new Set(['engineering', 'setting', 'weight']);
const split = (findings) => ({ engineering: findings.filter((f) => ENGINEERING.has(f.kind)), aesthetic: findings.filter((f) => f.kind === 'aesthetic') });
const blocking = (findings) => findings.filter((f) => f.kind !== 'aesthetic' && (f.severity === 'critical' || f.severity === 'high'));

/** A short, calm summary for the person (no jargon, no internals). */
function summaryOf({ weight, findings, intent }) {
  const b = blocking(findings);
  const target = intent?.weightRangeGrams;
  const w = `وزن تخمینی ${fa(weight)} گرم${target ? ` (هدف ${target[0] ? `${fa(target[0])} تا ` : 'تا '}${fa(target[1])} گرم)` : ''}.`;
  return b.length ? `${w} ${fa(b.length, 0)} مورد پیش از ساخت باید اصلاح شود.` : `${w} از نظر ساخت مانعی دیده نشد.`;
}

/** Build, measure and check one version: rhino-cad then manufacturing. */
async function buildAndCheck(ctx, { projectId, params, intent, method }) {
  ctx.stage('ساخت مدل');
  const cad = await ctx.delegate('rhino-cad', { projectId, params });
  ctx.stage('بررسی ساخت و وزن');
  const mfg = await ctx.delegate('manufacturing', { modelId: cad.modelId, params, intent, method: method ?? intent?.manufacturingMethod ?? 'casting' });
  return { cad, mfg };
}

export const STUDIO_AGENTS = [
  {
    id: 'studio-design',
    domain: 'studio',
    name: 'StudioDesignAgent',
    fa: 'طراح استودیو',
    instructions: 'Turn a jewellery brief into a typed design intent and starting parameters, critique the aesthetics, and coordinate CAD and manufacturing checks. Never produce geometry or numbers yourself; never mix aesthetic opinion with engineering findings.',
    approvalPolicy: [],
    memoryScopes: ['preference', 'technical'],
    canDelegateTo: ['rhino-cad', 'manufacturing'],
    allowedTools: ['studio.createDesignIntent', 'studio.paramsFromIntent', 'studio.critique', 'studio.saveProject', 'studio.getProject', 'studio.inspectDesign', 'studio.parseInstruction', 'studio.applyEdits', 'studio.optimizeWeight', 'memory.note'],
    async plan(ctx) {
      const i = ctx.input;
      if (i.mode === 'review') {
        const { project, model } = await ctx.tool('studio.getProject', { projectId: i.projectId });
        if (!model) return { projectId: project.id, message: 'هنوز مدلی ساخته نشده است.' };
        const d = await ctx.tool('studio.inspectDesign', { modelId: model.id });
        return { projectId: project.id, ...d, message: d.mustFix ? `${fa(d.mustFix, 0)} نکته پیش از ساخت نیاز به اصلاح دارد.` : 'برای ساخت مانعی دیده نشد.' };
      }
      if (i.mode === 'brief') {
        ctx.stage('خواندن بریف');
        const { intent, confidence, source } = await ctx.tool('studio.createDesignIntent', { brief: i.brief, useModel: i.useModel === true });
        if (intent.style.length) await ctx.tool('memory.note', { kind: 'pref_style', key: 'style', value: { style: intent.style } });
        if (intent.material || intent.targetKarat) await ctx.tool('memory.note', { kind: 'pref_material', key: 'material', value: { material: intent.material ?? null, karat: intent.targetKarat ?? null } });
        ctx.stage('پارامترهای شروع');
        const params = await ctx.tool('studio.paramsFromIntent', { intent });
        const aesthetic = await ctx.tool('studio.critique', { params, intent });
        const project = await ctx.tool('studio.saveProject', { title: i.title ?? i.brief.slice(0, 60), brief: i.brief, intent, params });
        const { cad, mfg } = await buildAndCheck(ctx, { projectId: project.id, params, intent, method: i.method });
        ctx.stage('آماده');
        const findings = [...mfg.findings, ...aesthetic];
        return { projectId: project.id, modelId: cad.modelId, version: cad.version, intent, confidence, source, params, weight: mfg.weight, findings: split(findings), summary: summaryOf({ weight: mfg.weight, findings, intent }) };
      }
      if (i.mode === 'edit' || i.mode === 'reduce') {
        ctx.stage('خواندن طرح');
        const { project, model } = await ctx.tool('studio.getProject', { projectId: i.projectId });
        let params = project.params;
        let edits;
        if (i.mode === 'reduce') edits = [{ action: i.targetGrams ? 'targetWeight' : 'reduceWeight', grams: i.targetGrams ?? i.grams, keepSetting: true, keepShoulders: i.keepShoulders !== false }];
        else {
          const parsed = await ctx.tool('studio.parseInstruction', { text: i.text });
          if (!parsed.understood) return { understood: false, projectId: project.id, message: 'این دستور به تغییر مشخصی در طرح نرسید. مثلاً بنویسید «ضخامت کف ۱٫۲» یا «وزن را ۰٫۵ گرم کم کن».' };
          edits = parsed.edits;
        }
        const plain = edits.filter((e) => e.param);
        if (plain.length) params = await ctx.tool('studio.applyEdits', { params, edits: plain });
        let optimization = null;
        const w = edits.find((e) => e.action);
        if (w) {
          ctx.stage('بهینه‌سازی وزن');
          const current = model?.weightG ?? 0;
          const targetGrams = w.action === 'targetWeight' ? w.grams : Math.max(0.1, Math.round((current - w.grams) * 1000) / 1000);
          optimization = await ctx.tool('studio.optimizeWeight', { params, ...(model?.inspection ? { inspection: model.inspection } : {}), targetGrams, free: ['widthBottom', 'thickBottom'], lockShoulders: w.keepShoulders !== false });
          params = optimization.params;
          if (!optimization.feasible) await ctx.tool('memory.note', { kind: 'tech_overweight', key: project.id, value: { target: targetGrams, reachable: optimization.after } });
        }
        const { cad, mfg } = await buildAndCheck(ctx, { projectId: project.id, params, intent: project.intent });
        const aesthetic = await ctx.tool('studio.critique', { params, intent: project.intent });
        ctx.stage('آماده');
        const findings = [...mfg.findings, ...aesthetic];
        return { understood: true, projectId: project.id, modelId: cad.modelId, version: cad.version, edits, optimization, params, previousWeight: model?.weightG ?? null, weight: mfg.weight, findings: split(findings), summary: summaryOf({ weight: mfg.weight, findings, intent: project.intent }) };
      }
      throw new Error('حالت طراح شناخته نیست.');
    },
  },
  {
    id: 'rhino-cad',
    domain: 'studio',
    name: 'RhinoCadAgent',
    fa: 'مدل‌ساز CAD',
    instructions: 'Translate design parameters into a validated CadOperation program and run it through the CAD adapter (local engine; a Rhino adapter sits behind the same boundary). Measure what was built. Never send free text to the CAD engine.',
    approvalPolicy: [],
    memoryScopes: ['technical'],
    canDelegateTo: ['manufacturing'],
    allowedTools: ['studio.programOf', 'cad.createGeometry', 'cad.modifyGeometry', 'cad.inspectGeometry', 'cad.exportModel', 'studio.deleteModel', 'studio.overwriteModel', 'studio.getProject'],
    async plan(ctx) {
      const i = ctx.input;
      if (i.mode === 'modify') {
        // a trainee's own CAD steps: typed operations on a new version, then the geometry is checked and explained
        ctx.stage('ساخت هندسه');
        const { project } = await ctx.tool('studio.getProject', { projectId: i.projectId });
        const built = await ctx.tool('cad.modifyGeometry', { projectId: i.projectId, operations: i.operations });
        ctx.stage('بررسی ساخت و وزن');
        const mfg = await ctx.delegate('manufacturing', { modelId: built.modelId, params: project.params, intent: project.intent, explain: true });
        return { modelId: built.modelId, version: built.version, weight: mfg.weight, findings: split(mfg.findings), explanation: mfg.explanation ?? null, summary: summaryOf({ weight: mfg.weight, findings: mfg.findings, intent: project.intent }) };
      }
      if (i.mode === 'export') {
        const r = await ctx.tool('cad.exportModel', { modelId: i.modelId, format: i.format, production: i.production === true });
        return r?.denied ? { exported: false, message: `مدیر رد کرد: ${r.reason}` } : { exported: true, format: r.format, mime: r.mime, bytes: r.bytes, text: r.text };
      }
      if (i.mode === 'delete') {
        const r = await ctx.tool('studio.deleteModel', { projectId: i.projectId });
        return r?.denied ? { deleted: false, message: `مدیر رد کرد: ${r.reason}` } : { deleted: true };
      }
      if (i.mode === 'finalize') {
        const r = await ctx.tool('studio.overwriteModel', { projectId: i.projectId });
        return r?.denied ? { final: false, message: `مدیر رد کرد: ${r.reason}` } : { final: true };
      }
      ctx.stage('برنامه CAD');
      const program = await ctx.tool('studio.programOf', { params: i.params });
      ctx.stage('ساخت هندسه');
      const built = await ctx.tool('cad.createGeometry', { projectId: i.projectId, program, params: i.params });
      ctx.stage('اندازه‌گیری');
      const inspection = await ctx.tool('cad.inspectGeometry', { modelId: built.modelId });
      return { modelId: built.modelId, version: built.version, program, inspection };
    },
  },
  {
    id: 'manufacturing',
    domain: 'studio',
    name: 'ManufacturingAgent',
    fa: 'کارشناس ساخت',
    instructions: 'Check a measured model for manufacturability (wall and structural thickness, closed solid, floating parts, setting, casting, weight) with the deterministic rules; save structured findings on the model version. Rules detect; you only report.',
    approvalPolicy: [],
    memoryScopes: ['technical'],
    canDelegateTo: ['training-tutor'],
    allowedTools: ['cad.inspectGeometry', 'manufacturing.validate', 'studio.weightFindings', 'studio.saveFindings', 'memory.note'],
    async plan(ctx) {
      const i = ctx.input;
      ctx.stage('اندازه‌گیری');
      const inspection = await ctx.tool('cad.inspectGeometry', { modelId: i.modelId });
      ctx.stage('قواعد ساخت');
      const mfg = await ctx.tool('manufacturing.validate', { modelId: i.modelId, inspection, params: i.params, method: i.method ?? 'casting' });
      const wf = i.intent ? await ctx.tool('studio.weightFindings', { inspection, intent: i.intent }) : [];
      const findings = [...mfg, ...wf];
      await ctx.tool('studio.saveFindings', { modelId: i.modelId, inspection, findings });
      for (const f of blocking(findings).slice(0, 4)) {
        const kind = f.kind === 'setting' ? 'tech_setting_error' : f.kind === 'weight' ? 'tech_overweight' : 'tech_mistake';
        await ctx.tool('memory.note', { kind, key: f.code, value: { model: i.modelId, severity: f.severity, evidence: f.measurableEvidence ?? null } });
      }
      const explanation = i.explain && blocking(findings).length ? await ctx.delegate('training-tutor', { mode: 'explain', findings: blocking(findings) }) : null;
      return { modelId: i.modelId, weight: inspection.weight.value, solids: inspection.solids, closed: inspection.closed, findings, blocking: blocking(findings).length, ...(explanation ? { explanation } : {}) };
    },
  },
  {
    id: 'training-tutor',
    domain: 'training',
    name: 'TrainingTutorAgent',
    fa: 'مربی آموزش',
    instructions: 'Teach from real results: explain findings in plain Persian, give hints by level (what fails → which parameters → the rule), never the final numbers; review weekly studio progress.',
    approvalPolicy: [],
    memoryScopes: ['training', 'technical'],
    canDelegateTo: [],
    allowedTools: ['training.explainFindings', 'training.studioHint', 'training.studioProgress', 'memory.note'],
    async plan(ctx) {
      const i = ctx.input;
      if (i.mode === 'hint') return ctx.tool('training.studioHint', { exerciseRow: i.exerciseRow, level: i.level ?? 1 });
      if (i.mode === 'explain') return ctx.tool('training.explainFindings', { findings: i.findings });
      if (i.mode === 'studio-review') {
        const p = await ctx.tool('training.studioProgress');
        const weak = p.skills.filter((s) => s.attempts && s.mastery < 0.5).map((s) => s.fa);
        await ctx.tool('memory.note', { kind: 'progress', key: `studio:${week(i.at ?? new Date().toISOString())}`, value: { readiness: p.readiness, weak } });
        return { readiness: p.readiness, weak, message: `آمادگی استودیو ${fa(Math.round(p.readiness * 100), 0)}٪.${weak.length ? ` نیازمند تمرین: ${weak.join('، ')}.` : ''}` };
      }
      throw new Error('حالت مربی آموزش شناخته نیست.');
    },
  },
  {
    id: 'assessment',
    domain: 'training',
    name: 'AssessmentAgent',
    fa: 'ارزیاب',
    instructions: 'Grade a practical studio attempt on the engine against the exercise constraints, update the shared mastery once per attempt, and record repeated technical mistakes. Never grade by opinion.',
    approvalPolicy: [],
    memoryScopes: ['training', 'technical'],
    canDelegateTo: ['training-tutor'],
    allowedTools: ['training.evaluateCadExercise', 'training.updateStudioMastery', 'memory.note'],
    async plan(ctx) {
      const i = ctx.input;
      const ev = await ctx.tool('training.evaluateCadExercise', { exerciseRow: i.exerciseRow, params: i.params, key: i.key });
      const mastery = ev.replayed ? null : await ctx.tool('training.updateStudioMastery', { skills: ev.assessment.skills, key: `sm-${i.key}` });
      const bad = ev.assessment.findings.filter((f) => f.kind !== 'aesthetic' && ['critical', 'high'].includes(f.severity));
      for (const f of bad.slice(0, 3)) await ctx.tool('memory.note', { kind: 'tech_mistake', key: f.code, value: { exerciseRow: i.exerciseRow, severity: f.severity } });
      const explanation = bad.length ? await ctx.delegate('training-tutor', { mode: 'explain', findings: bad }) : null;
      return { ...ev, mastery, explanation };
    },
  },
];

/** Studio modes of the curriculum agent (routines): next exercise, weekly challenge, manufacturing challenge, unfinished work. */
export const STUDIO_CURRICULUM = {
  'studio-next': async (ctx) => {
    const p = await ctx.tool('training.studioProgress');
    if (p.open.length) return { exercise: null, message: 'یک تمرین استودیوی باز دارید؛ همان را تمام کنید.' };
    const ex = await ctx.tool('training.generateStudioExercise', { reason: `routine:${p.next.reason}:${p.next.skillId}` });
    return { exercise: ex, message: `تمرین «${ex.title}» برای امروز آماده است.` };
  },
  'studio-challenge': async (ctx) => {
    const ex = await ctx.tool('training.generateStudioExercise', { exerciseId: 'solitaire-oval', reason: 'routine:weekly-design' });
    return { exercise: ex, message: 'چالش هفتگی طراحی آماده است.' };
  },
  'studio-mfg': async (ctx) => {
    const ex = await ctx.tool('training.generateStudioExercise', { exerciseId: 'thin-fix', reason: 'routine:weekly-mfg' });
    return { exercise: ex, message: 'چالش هفتگی ساخت آماده است.' };
  },
  'studio-weight': async (ctx) => {
    const ex = await ctx.tool('training.generateStudioExercise', { exerciseId: 'weight-cut', reason: 'trigger:weight-over' });
    return { exercise: ex, message: 'وزن طرح‌ها چند بار از هدف گذشته؛ تمرین «کاهش وزن کنترل‌شده» آماده است.' };
  },
  'studio-start': async (ctx) => {
    const ex = await ctx.tool('training.generateStudioExercise', ctx.input.exerciseId ? { exerciseId: ctx.input.exerciseId, reason: 'chosen' } : {});
    return { exercise: ex, message: `تمرین «${ex.title}» آماده است.` };
  },
  'studio-unfinished': async (ctx) => {
    const w = await ctx.tool('training.openStudioWork');
    return { ...w, message: w.exercises || w.projects ? `${fa(w.exercises, 0)} تمرین و ${fa(w.projects, 0)} طرح ناتمام دارید.` : 'کار ناتمامی در استودیو ندارید.' };
  },
};
