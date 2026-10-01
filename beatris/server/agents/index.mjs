// سامانه عامل‌ها (spec 0015 → 0016): every agent of the shop — accounting, studio, training — on one shared platform
// (registry, runtime, delegation, approvals, memory, events) per shop database, with Open Dot-style routines (Tehran
// slots on the job queue) and triggers (learning signals → interventions), and the HTTP routes of the trainers,
// the studio coach and agent runs and approvals.
import { createTraining, TRIGGERS } from '../training.mjs';
import { createRuntime, AgentError, RUN_STATES } from '../agent-platform/runtime.mjs';
import { createRegistry } from '../agent-platform/registry.mjs';
import { NO_PROVIDER } from '../agent-platform/provider.mjs';
import { buildTools } from './tools.mjs';
import { ACCOUNTING_AGENTS } from './agents.mjs';
import { SchemaError, check } from '../../public/js/schema.mjs';
import { SKILLS, DIFFICULTIES, DIFFICULTY_FA } from '../../public/js/acct/skills.mjs';
import { TEMPLATES } from '../../public/js/acct/scenarios.mjs';
import { ACCOUNTS } from '../../public/js/acct/coa.mjs';
import { createStudioStore } from '../studio/store.mjs';
import { buildStudioTools, STUDIO_PARAMS } from '../studio/tools.mjs';
import { STUDIO_AGENTS, STUDIO_CURRICULUM } from '../studio/agents.mjs';
import { STUDIO_SKILLS, STUDIO } from '../../public/js/studio/skills.mjs';
import { STUDIO_EXERCISES, EXERCISE } from '../../public/js/studio/exercises.mjs';
import { MATERIALS } from '../../public/js/studio/materials.mjs';
import { createLocalAdapter } from '../../public/js/studio/cad.mjs';
import { programOf, manufacturingFindings, critique } from '../../public/js/studio/design.mjs';
import { tehranDay, tehranHour } from '../tz.mjs';

const WEEKDAY = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tehran', weekday: 'short' });
const DOW = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const KEY_RE = /^[A-Za-z0-9:_-]{6,96}$/;
const TRAINEES = new Set(['employee', 'trainer', 'manager']);

/** The curriculum agent gains the studio modes; everything else about it stays as defined for accounting. */
function withStudioCurriculum(defs) {
  return defs.map((d) => (d.id !== 'curriculum' ? d : { ...d, plan: (ctx) => (STUDIO_CURRICULUM[ctx.input.mode] ? STUDIO_CURRICULUM[ctx.input.mode](ctx) : d.plan(ctx)) }));
}

export function createAgentSystem({ db, books, can, phrase = null, provider = NO_PROVIDER, clock = () => new Date(), onEvent = () => {} }) {
  const training = createTraining({ db, clock, phrase, extraSkills: STUDIO_SKILLS.map((s) => ({ ...s, domain: 'studio' })) });
  const studio = createStudioStore({ db, clock });
  const tools = { ...buildTools({ training, books }), ...buildStudioTools({ store: studio, training, provider, adapter: createLocalAdapter() }) };
  const registry = createRegistry([...withStudioCurriculum(ACCOUNTING_AGENTS), ...STUDIO_AGENTS], { tools });
  const users = (id) => db.get('SELECT * FROM users WHERE id=?', id);
  const runtime = createRuntime({ db, tools, registry, can, users, clock, onEvent });
  const params = (id) => {
    const r = db.get('SELECT params_json, enabled FROM agent_triggers WHERE id=?', id);
    return r?.enabled ? JSON.parse(r.params_json) : null;
  };
  /** Fire a trigger once per key: the intervention is an agent run with origin «trigger». */
  async function fire(triggerId, user, key, agent, input) {
    const k = `trig:${triggerId}:${key}`;
    const ins = db.run('INSERT OR IGNORE INTO agent_trigger_fires(key,trigger_id,user_id,at) VALUES (?,?,?,?)', k, triggerId, user.id, clock().toISOString());
    if (!ins.changes) return null;
    const run = await runtime.start(agent, { user, input: { ...input, key: k.replace(/[^A-Za-z0-9:_-]/g, '').slice(0, 96) }, key: k, origin: 'trigger' });
    db.run('UPDATE agent_trigger_fires SET run_id=? WHERE key=?', run.id, k);
    return run;
  }
  const brief = (r) => r && { id: r.id, agent: r.agent, status: r.status, output: r.output };

  /** After every graded attempt: the learning signals that call for an intervention. */
  async function afterAttempt(user, scenarioRow, out) {
    const fired = [];
    const ev = out.evaluation;
    const m = training.masteries(user.id);
    const rep = params('repeated_mistakes');
    if (rep) for (const [skill, x] of Object.entries(out.mastery ?? {})) if (x.streakWrong === rep.n) fired.push(await fire('repeated_mistakes', user, `${user.id}:${skill}:${m[skill]?.attempts}`, 'accounting-tutor', { mode: 'remedial', skillId: skill }));
    const drop = params('mastery_drop');
    if (drop) for (const [skill, x] of Object.entries(out.mastery ?? {})) if (x.before >= drop.from && x.after < drop.below) fired.push(await fire('mastery_drop', user, `${user.id}:${skill}:${m[skill]?.attempts}`, 'accounting-tutor', { mode: 'remedial', skillId: skill }));
    const close = params('closing_wrong');
    if (close && scenarioRow.template === 'close_day' && ev.score < close.below) fired.push(await fire('closing_wrong', user, `${user.id}:${scenarioRow.id}`, 'accounting-tutor', { mode: 'closing' }));
    const aud = params('audit_repeated');
    if (aud && scenarioRow.template === 'audit_challenge') {
      const missed = new Map();
      for (const r of db.all("SELECT a.mistakes_json FROM tr_attempts a JOIN tr_scenarios s ON s.id=a.scenario_id WHERE a.user_id=? AND s.template='audit_challenge'", user.id))
        for (const x of JSON.parse(r.mistakes_json)) if (x.code === 'MISSED_FINDING') missed.set(x.finding, (missed.get(x.finding) ?? 0) + 1);
      for (const [code, n] of missed) if (n === aud.n) fired.push(await fire('audit_repeated', user, `${user.id}:${code}`, 'audit', { mode: 'challenge' }));
    }
    return fired.filter(Boolean).map(brief);
  }

  /** After every studio exercise attempt: geometry failures, weight, repeated manufacturing errors, completion, mastery. */
  async function afterStudioAttempt(user, exerciseRow, out) {
    const fired = [];
    const tries = studio.attempts(exerciseRow);
    const failures = tries.filter((t) => !t.passed).length;
    const gf = params('studio_geometry_failure');
    if (gf && !out.passed && failures === gf.n) fired.push(await fire('studio_geometry_failure', user, `${user.id}:${exerciseRow}`, 'training-tutor', { mode: 'hint', exerciseRow, level: 2 }));
    const recent = studio.userAttempts(user.id, 12);
    const wo = params('studio_weight_over');
    if (wo && recent.length >= wo.n && recent.slice(0, wo.n).every((a) => a.findings.includes('WEIGHT_OVER'))) fired.push(await fire('studio_weight_over', user, `${user.id}:${recent[wo.n - 1].id}`, 'curriculum', { mode: 'studio-weight' }));
    const mr = params('studio_mfg_repeat');
    if (mr) {
      const count = new Map();
      for (const a of recent) for (const c of new Set(a.findings)) count.set(c, (count.get(c) ?? 0) + 1);
      for (const code of out.assessment.findings.filter((f) => f.kind === 'engineering').map((f) => f.code)) if (count.get(code) === mr.n) fired.push(await fire('studio_mfg_repeat', user, `${user.id}:${code}`, 'curriculum', { mode: 'studio-mfg' }));
    }
    if (params('studio_project_completed') && out.passed && !out.replayed) fired.push(await fire('studio_project_completed', user, `${user.id}:${exerciseRow}`, 'curriculum', { mode: 'studio-next' }));
    const ms = params('studio_mastery_reached');
    if (ms) for (const [skill, x] of Object.entries(out.mastery ?? {})) if (x.before < ms.at && x.after >= ms.at) fired.push(await fire('studio_mastery_reached', user, `${user.id}:${skill}`, 'training-tutor', { mode: 'studio-review' }));
    return fired.filter(Boolean).map(brief);
  }

  /** The routines whose Tehran slot is due, and the inactivity trigger. Idempotent per slot and person. */
  async function tick(now = clock()) {
    const day = tehranDay(now), hour = tehranHour(now.toISOString()), dow = DOW[WEEKDAY.format(now)];
    const ran = [];
    for (const r of db.all('SELECT * FROM agent_routines WHERE enabled=1')) {
      if (hour < r.hour || (r.cadence === 'weekly' && r.weekday !== dow)) continue;
      const slot = `${r.id}@${day}`;
      if (r.last_slot === slot) continue;
      if (!registry.has(r.agent)) continue;
      db.run('UPDATE agent_routines SET last_slot=? WHERE id=?', slot, r.id);
      const people = r.scope === 'manager'
        ? db.all("SELECT * FROM users WHERE active=1 AND role IN ('owner','manager') ORDER BY role='owner' DESC, created_at LIMIT 1")
        : db.all('SELECT * FROM users WHERE active=1').filter((u) => TRAINEES.has(u.role));
      // studio routines only for people who work in the studio (a project or an exercise of their own)
      const inStudio = (u) => !r.mode.startsWith('studio') || !!db.get('SELECT 1 FROM st_projects WHERE user_id=? UNION SELECT 1 FROM st_exercises WHERE user_id=? LIMIT 1', u.id, u.id);
      for (const u of people.filter(inStudio)) {
        const key = `routine:${slot}:${u.id}`;
        const run = await runtime.start(r.agent, { user: u, input: { mode: r.mode, at: now.toISOString(), key: key.replace(/[^A-Za-z0-9:_-]/g, '').slice(0, 96) }, key, origin: 'routine' });
        ran.push({ routine: r.id, user: u.id, run: run.id, status: run.status });
      }
    }
    const idle = params('inactive');
    if (idle) {
      for (const u of db.all('SELECT * FROM users WHERE active=1').filter((x) => TRAINEES.has(x.role))) {
        const last = db.get('SELECT MAX(created_at) AS t FROM tr_attempts WHERE user_id=?', u.id).t ?? u.created_at;
        if (now - Date.parse(last) > idle.days * 86400000) {
          const r = await fire('inactive', u, `${u.id}:${Math.floor(now / (idle.days * 86400000))}`, 'accounting-tutor', { mode: 'next' });
          if (r) ran.push({ trigger: 'inactive', user: u.id, run: r.id });
        }
      }
    }
    await runtime.sweep();
    return ran;
  }

  return { db, training, studio, runtime, registry, tools, afterAttempt, afterStudioAttempt, tick, fire };
}

/* ---------------- HTTP ---------------- */
export function registerAgentRoutes({ on, sys, HttpError, can }) {
  const { training: T, runtime: R } = sys;
  const wrap = (fn) => async (req) => {
    try {
      return await fn(req);
    } catch (e) {
      if (e instanceof HttpError) throw e;
      if (e instanceof SchemaError) throw new HttpError(400, e.message);
      if (e instanceof AgentError) throw new HttpError(e.status ?? 400, e.message);
      if (e?.status) throw new HttpError(e.status, e.message);
      if (e?.code?.startsWith?.('E_')) throw new HttpError(e.code === 'E_CONFLICT' ? 409 : 400, e.message);
      throw e;
    }
  };
  const route = (m, p, g, fn) => on(m, p, g, wrap(fn));
  const key = (k) => {
    if (k == null) return null;
    if (!KEY_RE.test(String(k))) throw new HttpError(400, 'کلید یکتای درخواست نامعتبر است.');
    return String(k);
  };
  const runOut = (run) => {
    if (run.status === 'failed') throw new HttpError(400, run.error ?? 'اجرای عامل ناموفق بود.');
    return run;
  };

  route('GET', '/api/train/acct', 'auth', ({ user }) => ({
    progress: T.progress(user),
    skills: SKILLS.map((s) => ({ id: s.id, fa: s.fa, parent: s.parent, needs: s.needs })),
    templates: TEMPLATES.map((t) => ({ id: t.id, title: t.title, skills: t.skills, difficulties: t.diff.map((i) => DIFFICULTIES[i]) })),
    difficulties: DIFFICULTIES.map((d) => ({ id: d, fa: DIFFICULTY_FA[d] })),
    accounts: ACCOUNTS.map((a) => ({ code: a.code, fa: a.fa, type: a.type, normal: a.normal, unit: a.unit ?? 'IRR', measure: a.measure ?? null, party: a.party ?? null })),
    findings: T.findingChoices,
    practiceBook: T.store.practiceBook(user.id),
  }));
  route('POST', '/api/train/acct/scenario', 'auth', async ({ user, body }) => {
    const input = { mode: body.remedial ? 'remedial' : 'next', ...(body.template ? { template: String(body.template) } : {}), ...(body.difficulty ? { difficulty: String(body.difficulty) } : {}), ...(body.skillId ? { skillId: String(body.skillId) } : {}) };
    const k = key(body.key);
    if (k) input.key = k;
    const run = runOut(await R.start('accounting-tutor', { user, input, key: k ? `scen:${user.id}:${k}` : null }));
    return { run: { id: run.id, status: run.status, steps: run.steps }, scenario: run.output?.scenario, message: run.output?.message };
  });
  route('GET', '/api/train/acct/scenario/:id', 'auth', ({ user, params }) => ({ scenario: T.scenario(user, params.id) }));
  route('POST', '/api/train/acct/scenario/:id/attempt', 'auth', async ({ user, params, body }) => {
    const k = key(body.key) ?? `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const run = runOut(await R.start('accounting-tutor', { user, input: { mode: 'check', scenarioId: params.id, answer: body.answer ?? {}, key: k }, key: `att:${user.id}:${k}` }));
    const out = run.output;
    const interventions = out && !out.evaluation.replayed ? await sys.afterAttempt(user, T.scenarioRow(params.id), out) : [];
    return { run: { id: run.id, status: run.status, steps: run.steps }, ...out, interventions };
  });
  route('POST', '/api/train/acct/scenario/:id/hint', 'auth', ({ user, params, body }) => T.hint(user, params.id, body.level, { reveal: body.reveal === true }));
  route('GET', '/api/train/acct/scenario/:id/explain', 'auth', ({ user, params }) => T.explain(user, params.id));
  route('GET', '/api/train/acct/book/:id', 'auth', ({ user, params }) => T.bookView(user, params.id));
  route('GET', '/api/train/acct/practice', 'auth', ({ user }) => T.bookView(user, T.store.practiceBook(user.id)));
  route('POST', '/api/train/acct/practice/intent', 'auth', async ({ user, body }) => {
    const k = key(body.key);
    const bookId = T.store.practiceBook(user.id);
    const run = runOut(await R.start('accounting-tutor', { user, input: { mode: 'intent', text: String(body.text ?? '').slice(0, 400), bookId, ...(body.price750 ? { price750: Number(body.price750) } : {}), post: body.post === true && !!k, ...(k ? { key: k } : {}) }, key: k ? `intent:${user.id}:${k}` : null }));
    return { run: { id: run.id, status: run.status }, ...run.output, book: T.bookView(user, bookId) };
  });
  route('POST', '/api/train/acct/practice/entry', 'auth', ({ user, body }) => {
    const k = key(body.key);
    if (!k) throw new HttpError(400, 'کلید یکتای سند لازم است.');
    const bookId = T.store.practiceBook(user.id);
    const r = R.tools['accounting.postTrainingEntry'].run({ bookId, entry: body.entry ?? {}, key: k }, { user });
    return { posted: r, book: T.bookView(user, bookId) };
  });
  route('POST', '/api/train/acct/audit', 'auth', async ({ user, body }) => {
    const input = body.scenarioId ? { mode: 'check', scenarioId: String(body.scenarioId) } : { mode: 'check', bookId: String(body.bookId ?? T.store.practiceBook(user.id)) };
    const run = runOut(await R.start('audit', { user, input }));
    return { run: { id: run.id, status: run.status }, ...run.output };
  });
  route('GET', '/api/train/acct/team', 'staff', ({ user }) => ({
    team: T.team(),
    reports: sys.db.all("SELECT key, value_json, updated_at FROM agent_memory WHERE kind='report' ORDER BY updated_at DESC LIMIT 6").map((m) => ({ key: m.key, at: m.updated_at, ...JSON.parse(m.value_json) })),
    approvals: can(user, 'books.admin') ? R.pendingApprovals().length : null,
  }));

  /* agent runs, approvals, routines, triggers */
  route('GET', '/api/agents/runs', 'auth', ({ user, url }) => ({ runs: R.list({ userId: url.searchParams.get('all') === '1' && can(user, 'books.admin') ? null : user.id }), states: RUN_STATES }));
  route('GET', '/api/agents/runs/:id', 'auth', ({ user, params }) => {
    const r = R.view(params.id);
    if (!r || (r.userId !== user.id && !can(user, 'books.admin'))) throw new HttpError(404, 'اجرا پیدا نشد.');
    return { run: r, events: R.events(params.id) };
  });
  route('POST', '/api/agents/runs/:id/pause', 'auth', ({ user, params }) => R.pause(params.id, user));
  route('POST', '/api/agents/runs/:id/resume', 'auth', ({ user, params }) => R.resume(params.id, user));
  route('POST', '/api/agents/runs/:id/cancel', 'auth', ({ user, params }) => R.cancel(params.id, user));
  route('POST', '/api/agents/real', 'auth', async ({ user, body }) => {
    const k = key(body.key);
    if (!k) throw new HttpError(400, 'کلید یکتای درخواست لازم است.');
    const run = await R.start('accounting-tutor', { user, input: { mode: 'real', doc: body.doc ?? {}, summary: String(body.summary ?? 'سند پیشنهادی دستیار').slice(0, 300) }, key: `real:${user.id}:${k}` });
    return { run };
  });
  route('GET', '/api/agents/approvals', 'auth', ({ user }) => {
    if (!can(user, 'books.admin')) throw new HttpError(403, 'تأییدها با مدیر است.');
    return { approvals: R.pendingApprovals() };
  });
  route('POST', '/api/agents/approvals/:id', 'auth', async ({ user, params, body }) => ({ run: await R.decide(params.id, user, body.decision, body.note ? String(body.note).slice(0, 300) : null) }));
  route('GET', '/api/agents/routines', 'staff', () => ({ routines: sysRoutines(sys), triggers: sysTriggers(sys) }));
  route('PUT', '/api/agents/routines/:id', 'admin', ({ params, body }) => {
    sysSet(sys, 'agent_routines', params.id, body);
    return { routines: sysRoutines(sys), triggers: sysTriggers(sys) };
  });
  route('PUT', '/api/agents/triggers/:id', 'admin', ({ params, body }) => {
    sysSet(sys, 'agent_triggers', params.id, body);
    return { routines: sysRoutines(sys), triggers: sysTriggers(sys) };
  });

  /* ---------------- studio coach (spec 0016): every change goes through the studio agents ---------------- */
  const S = sys.studio;
  const ownProject = (user, id) => {
    const p = S.project(id);
    if (!p || p.userId !== user.id) throw new HttpError(404, 'طرح پیدا نشد.');
    return p;
  };
  const ownExercise = (user, id) => {
    const e = S.exercise(id);
    if (!e || e.userId !== user.id) throw new HttpError(404, 'تمرین پیدا نشد.');
    return e;
  };
  const runBrief = (run) => ({ id: run.id, status: run.status, stage: run.stage, approvals: run.approvals.filter((a) => a.status === 'pending').length });
  const tool = (name, args, user) => R.tools[name].run(args, { user, origin: 'user', emit: () => {} });
  const exerciseOut = (row) => {
    const ex = EXERCISE[row.exerciseId];
    return { ...row, title: ex.title, brief: ex.brief, difficulty: ex.difficulty, stages: ex.stages, target: ex.target, start: ex.start, attemptsList: S.attempts(row.id).map((a) => ({ id: a.id, score: a.score, passed: a.passed, weightG: a.weightG, criteria: a.assessment.criteria, at: a.createdAt })) };
  };
  route('GET', '/api/studio/coach', 'auth', ({ user }) => ({
    progress: tool('training.studioProgress', {}, user),
    skills: STUDIO.SKILLS.filter((s) => s.parent).map((s) => ({ id: s.id, fa: s.fa, competency: s.competency, needs: s.needs })),
    exercises: STUDIO_EXERCISES.map((e) => ({ id: e.id, title: e.title, difficulty: e.difficulty, difficultyFa: DIFFICULTY_FA[e.difficulty], brief: e.brief })),
    projects: S.projects(user.id).map((p) => ({ id: p.id, title: p.title, version: p.version, status: p.status, updatedAt: p.updatedAt, weightG: S.latestModel(p.id)?.weightG ?? null })),
    materials: Object.entries(MATERIALS).map(([id, m]) => ({ id, fa: m.fa })),
  }));
  route('POST', '/api/studio/design', 'auth', async ({ user, body }) => {
    const k = key(body.key);
    const text = String(body.brief ?? '').trim();
    if (text.length < 4) throw new HttpError(400, 'بریف طرح را بنویسید.');
    const run = runOut(await R.start('studio-design', { user, input: { mode: 'brief', brief: text.slice(0, 2000), useModel: body.useModel === true, ...(body.method ? { method: String(body.method) } : {}) }, key: k ? `design:${user.id}:${k}` : null }));
    return { run: runBrief(run), ...run.output };
  });
  route('GET', '/api/studio/projects/:id', 'auth', ({ user, params }) => {
    const p = ownProject(user, params.id);
    const models = S.models(p.id).map((m) => ({ id: m.id, version: m.version, weightG: m.weightG, findings: m.findings, params: m.params, createdAt: m.createdAt }));
    return { project: p, models, latest: S.latestModel(p.id) };
  });
  route('POST', '/api/studio/projects/:id/edit', 'auth', async ({ user, params, body }) => {
    ownProject(user, params.id);
    const k = key(body.key);
    const reduce = body.targetGrams != null || body.grams != null;
    const input = reduce
      ? { mode: 'reduce', projectId: params.id, ...(body.targetGrams != null ? { targetGrams: Number(body.targetGrams) } : { grams: Number(body.grams) }) }
      : { mode: 'edit', projectId: params.id, text: String(body.text ?? '').slice(0, 400) };
    const run = runOut(await R.start('studio-design', { user, input, key: k ? `edit:${user.id}:${k}` : null }));
    return { run: runBrief(run), ...run.output };
  });
  for (const [path, mode] of [['export', 'export'], ['finalize', 'finalize'], ['delete', 'delete']])
    route('POST', `/api/studio/projects/:id/${path}`, 'auth', async ({ user, params, body }) => {
      ownProject(user, params.id);
      const k = key(body.key);
      if (!k) throw new HttpError(400, 'کلید یکتای درخواست لازم است.');
      const latest = S.latestModel(params.id);
      if (mode === 'export' && !latest) throw new HttpError(400, 'هنوز مدلی ساخته نشده است.');
      const input = mode === 'export' ? { mode, modelId: latest.id, format: String(body.format ?? 'stl'), production: body.production === true } : { mode, projectId: params.id };
      const run = runOut(await R.start('rhino-cad', { user, input, key: `${mode}:${user.id}:${k}` }));
      return { run: runBrief(run), ...(run.output ?? { waiting: true, message: 'درخواست برای تأیید مدیر فرستاده شد.' }) };
    });
  route('POST', '/api/studio/preview', 'auth', async ({ body }) => {
    // a quick measure of parameters without saving (the same engine; nothing stored)
    const p = body.params;
    const errs = check(STUDIO_PARAMS, p, 'پارامترها');
    if (errs.length) throw new HttpError(400, errs.slice(0, 3).join(' '));
    const a = createLocalAdapter({ material: p.material });
    await a.createGeometry(programOf(p), { id: 'preview' });
    const insp = await a.inspectGeometry('preview', { samples: 120 });
    const findings = [...manufacturingFindings(insp, p), ...critique(p, null)];
    return { weight: insp.weight.value, solids: insp.solids, closed: insp.closed, bounds: insp.bounds, findings: { engineering: findings.filter((f) => f.kind !== 'aesthetic'), aesthetic: findings.filter((f) => f.kind === 'aesthetic') } };
  });
  route('POST', '/api/studio/exercises', 'auth', async ({ user, body }) => {
    const k = key(body.key);
    const run = runOut(await R.start('curriculum', { user, input: { mode: 'studio-start', ...(body.exerciseId ? { exerciseId: String(body.exerciseId) } : {}) }, key: k ? `sx:${user.id}:${k}` : null }));
    return { run: runBrief(run), exercise: exerciseOut(S.exercise(run.output.exercise.id)), message: run.output.message };
  });
  route('GET', '/api/studio/exercises/:id', 'auth', ({ user, params }) => ({ exercise: exerciseOut(ownExercise(user, params.id)) }));
  route('POST', '/api/studio/exercises/:id/attempt', 'auth', async ({ user, params, body }) => {
    ownExercise(user, params.id);
    const k = key(body.key) ?? `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const run = runOut(await R.start('assessment', { user, input: { exerciseRow: params.id, params: body.params ?? {}, key: k }, key: `sat:${user.id}:${k}` }));
    const out = run.output;
    const interventions = out && !out.replayed ? await sys.afterStudioAttempt(user, params.id, out) : [];
    return { run: runBrief(run), ...out, exercise: exerciseOut(S.exercise(params.id)), interventions };
  });
  route('POST', '/api/studio/exercises/:id/hint', 'auth', async ({ user, params, body }) => {
    ownExercise(user, params.id);
    const level = Math.max(1, Math.min(3, Number(body.level) || 1));
    const run = runOut(await R.start('training-tutor', { user, input: { mode: 'hint', exerciseRow: params.id, level } }));
    return run.output;
  });

  /* ---------------- the platform, for the admin's debug view ---------------- */
  route('GET', '/api/agents/registry', 'admin', () => ({ agents: R.registry.describe(), stats: R.stats(), states: RUN_STATES }));
}
const sysRoutines = (sys) => sys.db.all('SELECT id, name, agent, mode, cadence, hour, weekday, scope, enabled, last_slot FROM agent_routines ORDER BY scope, cadence, hour').map((r) => ({ ...r, enabled: !!r.enabled }));
const sysTriggers = (sys) => sys.db.all('SELECT id, name, params_json, enabled FROM agent_triggers').map((t) => ({ id: t.id, name: t.name, params: JSON.parse(t.params_json), enabled: !!t.enabled, fires: sys.db.get('SELECT COUNT(*) AS n FROM agent_trigger_fires WHERE trigger_id=?', t.id).n }));
function sysSet(sys, table, id, body) {
  const row = sys.db.get(`SELECT * FROM ${table} WHERE id=?`, id);
  if (!row) throw Object.assign(new Error('پیدا نشد.'), { status: 404 });
  if (typeof body.enabled === 'boolean') sys.db.run(`UPDATE ${table} SET enabled=? WHERE id=?`, body.enabled ? 1 : 0, id);
  if (table === 'agent_triggers' && body.params && typeof body.params === 'object') {
    const def = TRIGGERS.find((t) => t.id === id)?.params ?? {};
    const next = { ...JSON.parse(row.params_json) };
    for (const [k, v] of Object.entries(body.params)) if (k in def && typeof v === 'number' && v >= 0 && v <= 365) next[k] = v;
    sys.db.run('UPDATE agent_triggers SET params_json=? WHERE id=?', JSON.stringify(next), id);
  }
  if (table === 'agent_routines' && Number.isInteger(body.hour) && body.hour >= 0 && body.hour <= 23) sys.db.run('UPDATE agent_routines SET hour=? WHERE id=?', body.hour, id);
}
