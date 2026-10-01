// spec 0016 (integration): the studio agents over HTTP on the shared platform — brief → StudioDesignAgent →
// RhinoCadAgent → ManufacturingAgent (observable child runs), versioned models, a Persian edit and a weight goal,
// production export behind a manager's approval, studio exercises graded on the engine with shared mastery,
// levelled hints, triggers and routines, ownership, and the admin's registry view.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.mjs';
import { createServer } from '../server/index.mjs';
import { seedUsers } from '../server/api.mjs';
import { EXERCISE } from '../public/js/studio/exercises.mjs';

let server, base, E, E2, M, O;
const call = async (method, path, body, token) => {
  const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const ok = async (...a) => {
  const r = await call(...a);
  assert.ok(r.status < 300, `${a[0]} ${a[1]} → ${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
};
const login = async (phone) => (await call('POST', '/api/auth/login', { phone, pin: '1234' })).body.token;

before(async () => {
  const db = openDb(':memory:');
  seedUsers(db, {}, true);
  server = createServer({ db, secret: 'test-secret-0123456789', demo: true, quiet: true, marketOpts: { fetchImpl: async () => new Response('{}', { status: 404 }), defaultMode: 'off' } });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  O = await login('09120000001');
  M = await login('09120000002');
  E = await login('09120000004');
  E2 = await login('09120000005');
});
after(() => server.close());

let projectId, firstWeight;
test('بریف → طراح → مدل‌ساز → کارشناس ساخت: مدل نسخه ۱، وزن، یافته‌های جدا، اجراهای فرزند دیدنی', async () => {
  const r = await ok('POST', '/api/studio/design', { brief: 'انگشتر ۱۸ عیار مینیمال، سنگ بیضی ۸×۶، زیر ۴ گرم، مناسب ریخته‌گری', key: 'design-key-01' }, E);
  assert.equal(r.run.status, 'completed');
  assert.equal(r.version, 1);
  assert.equal(r.intent.productType, 'ring');
  assert.ok(r.confidence >= 0.8);
  assert.ok(r.weight > 1.5 && r.weight < 4);
  assert.ok(Array.isArray(r.findings.engineering) && Array.isArray(r.findings.aesthetic));
  assert.ok(r.findings.aesthetic.every((f) => f.kind === 'aesthetic'));
  assert.match(r.summary, /وزن تخمینی/);
  projectId = r.projectId;
  firstWeight = r.weight;
  const view = (await ok('GET', `/api/agents/runs/${r.run.id}`, null, E)).run;
  const kids = view.steps.filter((s) => s.tool.startsWith('delegate:')).map((s) => s.tool);
  assert.deepEqual(kids, ['delegate:rhino-cad', 'delegate:manufacturing']);
  const cad = (await ok('GET', `/api/agents/runs/${view.steps.find((s) => s.tool === 'delegate:rhino-cad').child}`, null, E));
  assert.deepEqual(cad.run.chain, ['studio-design', 'rhino-cad']);
  assert.ok(cad.events.some((e) => e.type === 'studio.geometry.created'));
  // the same key returns the same run (idempotent)
  assert.equal((await ok('POST', '/api/studio/design', { brief: 'هر چیز', key: 'design-key-01' }, E)).projectId, projectId);
  const p = await ok('GET', `/api/studio/projects/${projectId}`, null, E);
  assert.equal(p.models.length, 1);
  assert.equal(p.latest.inspection.solids, 1);
  assert.equal((await call('GET', `/api/studio/projects/${projectId}`, null, E2)).status, 404, 'another person cannot see it');
});

test('دستور فارسی: نسخه تازه با پارامتر تغییرکرده؛ نسخه قبلی دست‌نخورده؛ جمله نامفهوم چیزی نمی‌سازد', async () => {
  const r = await ok('POST', `/api/studio/projects/${projectId}/edit`, { text: 'ضخامت کف ۱٫۴', key: 'edit-key-001' }, E);
  assert.equal(r.understood, true);
  assert.equal(r.version, 2);
  assert.equal(r.params.thickBottom, 1.4);
  const no = await ok('POST', `/api/studio/projects/${projectId}/edit`, { text: 'قشنگ‌ترش کن', key: 'edit-key-002' }, E);
  assert.equal(no.understood, false);
  const p = await ok('GET', `/api/studio/projects/${projectId}`, null, E);
  assert.equal(p.models.length, 2);
  assert.notEqual(p.models[0].params.thickBottom, 1.4);
});

test('هدف وزن: کاهش کنترل‌شده، نگین و شانه ثابت، وزن دوباره اندازه‌گیری و اعتبارسنجی می‌شود', async () => {
  const before = (await ok('GET', `/api/studio/projects/${projectId}`, null, E)).latest;
  const r = await ok('POST', `/api/studio/projects/${projectId}/edit`, { grams: 0.2, key: 'reduce-key-01' }, E);
  assert.equal(r.version, 3);
  assert.ok(r.optimization.feasible, JSON.stringify(r.optimization));
  assert.ok(r.weight < before.weightG, `${r.weight} < ${before.weightG}`);
  assert.deepEqual(r.params.setting, before.params.setting);
  assert.equal(r.params.widthTop, before.params.widthTop);
  assert.ok(firstWeight > 0);
});

test('خروجی: STL آزمایشی آزاد است؛ خروجی تولیدی منتظر تأیید مدیر (نه خود درخواست‌دهنده)', async () => {
  const draft = await ok('POST', `/api/studio/projects/${projectId}/export`, { format: 'stl', key: 'exp-key-0001' }, E);
  assert.equal(draft.exported, true);
  assert.match(draft.text, /^solid beatris/);
  const prod = await ok('POST', `/api/studio/projects/${projectId}/export`, { format: 'stl', production: true, key: 'exp-key-0002' }, E);
  assert.equal(prod.run.status, 'waiting_for_approval');
  assert.equal(prod.waiting, true);
  const ap = (await ok('GET', '/api/agents/approvals', null, M)).approvals.find((a) => a.tool === 'cad.exportModel');
  assert.match(ap.summary, /تولیدی/);
  assert.equal((await call('POST', `/api/agents/approvals/${ap.id}`, { decision: 'approved' }, E)).status, 403);
  const done = await ok('POST', `/api/agents/approvals/${ap.id}`, { decision: 'approved' }, M);
  assert.equal(done.run.status, 'completed');
  assert.equal(done.run.output.exported, true);
  // deletion also waits; denied leaves the project
  const del = await ok('POST', `/api/studio/projects/${projectId}/delete`, { key: 'del-key-0001' }, E);
  assert.equal(del.run.status, 'waiting_for_approval');
  const ap2 = (await ok('GET', '/api/agents/approvals', null, O)).approvals.find((a) => a.tool === 'studio.deleteModel');
  await ok('POST', `/api/agents/approvals/${ap2.id}`, { decision: 'denied', note: 'نگه دار' }, O);
  assert.equal((await ok('GET', `/api/studio/projects/${projectId}`, null, E)).project.status, 'draft');
});

test('تمرین استودیو: شروع، تلاش نادرست با یافته، راهنمایی سطح‌بندی، تلاش درست، تسلط مشترک، رویداد تکمیل', async () => {
  const home = await ok('GET', '/api/studio/coach', null, E);
  assert.ok(home.exercises.length >= 4 && home.skills.length >= 15);
  const s = await ok('POST', '/api/studio/exercises', { exerciseId: 'thin-fix', key: 'sx-key-0001' }, E);
  const row = s.exercise.id;
  const start = { material: 'au18y', ...EXERCISE['thin-fix'].start };
  const bad = await ok('POST', `/api/studio/exercises/${row}/attempt`, { params: start, key: 'sat-key-0001' }, E);
  assert.equal(bad.passed, false);
  assert.ok(bad.assessment.findings.some((f) => f.code === 'WALL_TOO_THIN' || f.code === 'STRUCTURE_THIN'));
  assert.ok(bad.explanation?.lines?.length, 'the tutor explains the blocking findings');
  const h = await ok('POST', `/api/studio/exercises/${row}/hint`, { level: 2 }, E);
  assert.equal(h.level, 2);
  assert.doesNotMatch(h.text, /1[.٫]2/, 'no final numbers in a hint');
  const fixed = { ...start, thickBottom: 1.2, widthBottom: 1.6, setting: { ...start.setting, prongDiameterMm: 0.75, seatDepthMm: 0.3 } };
  const good = await ok('POST', `/api/studio/exercises/${row}/attempt`, { params: fixed, key: 'sat-key-0002' }, E);
  assert.equal(good.passed, true, JSON.stringify(good.assessment.criteria));
  assert.equal(good.exercise.status, 'done');
  assert.ok(Object.keys(good.mastery).includes('mfg.constraints'));
  assert.ok(good.interventions.some((i) => i.agent === 'curriculum'), 'completion asks the curriculum for the next task');
  const replay = await ok('POST', `/api/studio/exercises/${row}/attempt`, { params: fixed, key: 'sat-key-0002' }, E);
  assert.equal(replay.attemptId, good.attemptId);
  const prog = (await ok('GET', '/api/studio/coach', null, E)).progress;
  assert.ok(prog.skills.find((x) => x.id === 'mfg.constraints').mastery > 0);
  assert.equal((await call('GET', `/api/studio/exercises/${row}`, null, E2)).status, 404);
});

test('ماشه: سه تلاش ناموفق پیاپی در یک تمرین، مربی را یک بار با راهنمایی سطح ۲ صدا می‌زند', async () => {
  const s = await ok('POST', '/api/studio/exercises', { exerciseId: 'thin-fix', key: 'sx-key-0002' }, E2);
  const start = { material: 'au18y', ...EXERCISE['thin-fix'].start };
  let fired = [];
  for (let k = 1; k <= 4; k++) {
    const r = await ok('POST', `/api/studio/exercises/${s.exercise.id}/attempt`, { params: start, key: `sat-fail-00${k}` }, E2);
    fired = fired.concat(r.interventions.filter((i) => i.agent === 'training-tutor'));
  }
  assert.equal(fired.length, 1);
  assert.equal(fired[0].output.level, 2);
});

test('پیش‌نمایش پارامترها بدون ذخیره؛ پارامتر نامعتبر رد می‌شود', async () => {
  const p = { material: 'au18y', ...EXERCISE['plain-band'].start };
  const r = await ok('POST', '/api/studio/preview', { params: p }, E);
  assert.ok(r.weight > 2 && r.solids === 1);
  assert.equal((await call('POST', '/api/studio/preview', { params: { ...p, thickBottom: 99 } }, E)).status, 400);
});

test('نمای مدیر سیستم: رجیستری با ابزارهای مجاز، آمار اجراها و واگذاری‌ها؛ برای کارمند بسته است', async () => {
  const r = await ok('GET', '/api/agents/registry', null, O);
  const ids = r.agents.map((a) => a.id).sort();
  assert.deepEqual(ids, ['accounting-tutor', 'assessment', 'audit', 'curriculum', 'manufacturing', 'rhino-cad', 'studio-design', 'training-tutor']);
  assert.ok(!r.agents.find((a) => a.id === 'manufacturing').allowedTools.includes('cad.exportModel'), 'least privilege');
  assert.ok(r.stats.delegations >= 2);
  assert.ok(r.stats.tools.some((t) => t.tool === 'cad.createGeometry'));
  assert.equal((await call('GET', '/api/agents/registry', null, E)).status, 403);
});
