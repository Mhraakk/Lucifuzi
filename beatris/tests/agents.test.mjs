// spec 0015 + 0016: the shared agent platform — registry (least privilege), typed tools, permissions, approvals that
// pause a run (four eyes), durable replay, idempotent runs, pause / resume / cancel, recovery after restart,
// delegation (allowed targets, depth, cycles, observable child runs), bounded retries, output validation, memory
// scopes, event names, and structured model outputs with bounded repair.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.mjs';
import { createRuntime, MAX_DELEGATION_DEPTH } from '../server/agent-platform/runtime.mjs';
import { createRegistry } from '../server/agent-platform/registry.mjs';
import { structured, NO_PROVIDER } from '../server/agent-platform/provider.mjs';
import { S, check } from '../public/js/schema.mjs';
import { can } from '../server/rbac.mjs';

const def = (id, allowedTools, plan, extra = {}) => ({ id, domain: 'test', name: id, fa: id, instructions: 'test', allowedTools, approvalPolicy: [], memoryScopes: [], canDelegateTo: [], plan, ...extra });

function setup({ extraAgents = [], extraTools = {} } = {}) {
  const db = openDb(':memory:');
  const add = (id, role) => db.run("INSERT INTO users(id,name,phone,role,pin_hash,created_at) VALUES (?,?,?,?, 'x', '2026-01-01')", id, id, `0912${id.padStart(7, '0')}`, role);
  add('emp', 'employee');
  add('emp2', 'employee');
  add('mgr', 'manager');
  const effects = { counter: 0, sensitive: 0, flaky: 0 };
  const tools = {
    counter: { label: 'شمارنده', input: S.obj({}), run: () => ++effects.counter },
    echo: { label: 'پژواک', input: S.obj({ n: S.int({ minimum: 0, maximum: 9 }) }), run: ({ n }) => n * 2 },
    sensitive: { label: 'کار حساس', cap: 'books.use', approver: 'books.admin', input: S.obj({ what: S.str() }), approval: ({ what }) => `انجام ${what}`, run: () => ++effects.sensitive },
    adminOnly: { label: 'کار مدیر', cap: 'books.admin', input: S.obj({}), run: () => 'ok' },
    flaky: { label: 'ناپایدار', input: S.obj({}), retry: { max: 3, on: (e) => e.code === 'E_BUSY' }, run: () => { if (++effects.flaky < 3) throw Object.assign(new Error('busy'), { code: 'E_BUSY' }); return 'done'; } },
    lying: { label: 'خروجی نادرست', input: S.obj({}), output: S.obj({ n: S.int() }), run: () => ({ n: 'x' }) },
    note: { label: 'یادداشت', input: S.obj({ kind: S.str(), key: S.str(), value: {} }), run: ({ kind, key, value }, ctx) => (ctx.memory.set(ctx.user.id, kind, key, value), true) },
    ...extraTools,
  };
  const defs = [
    def('flow', ['counter', 'sensitive', 'echo'], async (ctx) => ({ a: await ctx.tool('counter'), b: await ctx.tool('sensitive', { what: 'ثبت' }), c: await ctx.tool('echo', { n: 3 }) })),
    def('bad', ['echo'], async (ctx) => ctx.tool('echo', { n: 99 })),
    def('sneaky', ['echo'], async (ctx) => ctx.tool('counter')),
    def('boss', ['adminOnly'], async (ctx) => ctx.tool('adminOnly')),
    def('simple', ['counter'], async (ctx) => ctx.tool('counter')),
    def('policy', ['counter'], async (ctx) => ctx.tool('counter'), { approvalPolicy: ['counter'] }),
    def('retrying', ['flaky'], async (ctx) => ctx.tool('flaky')),
    def('liar', ['lying'], async (ctx) => ctx.tool('lying')),
    def('lead', ['echo'], async (ctx) => ({ mine: await ctx.tool('echo', { n: 1 }), theirs: await ctx.delegate('helper', { n: 4 }) }), { canDelegateTo: ['helper', 'gated'] }),
    def('helper', ['echo'], async (ctx) => ctx.tool('echo', { n: ctx.input.n })),
    def('gated', ['sensitive'], async (ctx) => ctx.tool('sensitive', { what: 'زیرعامل' })),
    def('waitsOnChild', [], async (ctx) => ({ child: await ctx.delegate('gated', {}) }), { canDelegateTo: ['gated'] }),
    def('rogue', [], async (ctx) => ctx.delegate('helper', { n: 1 })),
    def('ping', [], async (ctx) => ctx.delegate('pong', {}), { canDelegateTo: ['pong'] }),
    def('pong', [], async (ctx) => ctx.delegate('ping', {}), { canDelegateTo: ['ping'] }),
    def('d0', [], async (ctx) => ctx.delegate('d1', {}), { canDelegateTo: ['d1'] }),
    def('d1', [], async (ctx) => ctx.delegate('d2', {}), { canDelegateTo: ['d2'] }),
    def('d2', [], async (ctx) => ctx.delegate('d3', {}), { canDelegateTo: ['d3'] }),
    def('d3', [], async (ctx) => ctx.delegate('d4', {}), { canDelegateTo: ['d4'] }),
    def('d4', ['echo'], async (ctx) => ctx.tool('echo', { n: 1 })),
    def('trainer', ['note'], async (ctx) => ctx.tool('note', ctx.input), { memoryScopes: ['training'] }),
    ...extraAgents,
  ];
  const registry = createRegistry(defs, { tools });
  const users = (id) => db.get('SELECT * FROM users WHERE id=?', id);
  const seen = [];
  const rt = createRuntime({ db, tools, registry, can: (u, c) => can(u, c), users, onEvent: (e) => seen.push(e) });
  return { db, rt, effects, users, tools, registry, seen };
}

test('اعتبارسنج schema: نوع، الزامی، اضافه، الگو، بازه و اتحاد برچسب‌دار؛ کلیدواژه ناشناخته رد می‌شود', () => {
  const sch = S.obj({ a: S.int({ minimum: 1 }), b: S.str({ pattern: '^x' }) }, ['a']);
  assert.deepEqual(check(sch, { a: 2, b: 'xy' }), []);
  assert.equal(check(sch, { b: 'xy' }).length, 1);
  assert.equal(check(sch, { a: 0 }).length, 1);
  assert.equal(check(sch, { a: 1, z: 1 }).length, 1);
  assert.equal(check(sch, { a: 1.5 }).length, 1);
  assert.equal(check(sch, { a: 1, b: 'y' }).length, 1);
  assert.throws(() => check({ type: 'string', format: 'email' }, 'a'), /not supported/);
  const u = S.union(S.obj({ op: S.lit('a'), x: S.num() }, ['op', 'x']), S.obj({ op: S.lit('b'), y: S.str() }, ['op', 'y']));
  assert.deepEqual(check(u, { op: 'a', x: 1 }), []);
  assert.match(check(u, { op: 'b', y: 2 })[0], /y/, 'the error of the branch whose tag matches');
  assert.equal(check(u, { op: 'c' }).length, 1);
});

test('رجیستری: ابزار ناشناخته، سیاست تأیید بیرون از ابزارها، مقصد واگذاری ناشناخته و تکرار شناسه رد می‌شوند', () => {
  const tools = { t: { label: 't', input: S.obj({}), run: () => 1 } };
  assert.throws(() => createRegistry([def('x', ['nope'], async () => 1)], { tools }), /unknown tool/);
  assert.throws(() => createRegistry([def('x', ['t'], async () => 1, { approvalPolicy: ['u'] })], { tools }), /approval policy/);
  assert.throws(() => createRegistry([def('x', ['t'], async () => 1, { canDelegateTo: ['ghost'] })], { tools }), /unknown ghost/);
  assert.throws(() => createRegistry([def('x', ['t'], async () => 1), def('x', ['t'], async () => 1)], { tools }), /twice/);
  assert.throws(() => createRegistry([{ id: 'x', allowedTools: [] }], { tools }), /missing/);
  const r = createRegistry([def('x', ['t'], async () => 1)], { tools });
  assert.equal(r.describe()[0].plan, undefined, 'the public description carries no code');
});

test('تأیید: اجرا منتظر می‌ماند؛ درخواست‌دهنده و کارمند نمی‌توانند تأیید کنند؛ مدیر تأیید می‌کند؛ هیچ گامی دو بار اجرا نمی‌شود', async () => {
  const { rt, effects, users, db, seen } = setup();
  const r = await rt.start('flow', { user: users('emp') });
  assert.equal(r.status, 'waiting_for_approval');
  assert.equal(effects.counter, 1);
  assert.equal(effects.sensitive, 0);
  const [ap] = rt.pendingApprovals();
  assert.equal(ap.summary, 'انجام ثبت');
  await assert.rejects(rt.decide(ap.id, users('emp'), 'approved'), /تأیید این کار با مدیر/);
  db.run("UPDATE users SET role='manager' WHERE id='emp'");
  await assert.rejects(rt.decide(ap.id, users('emp'), 'approved'), /چهار چشم/);
  db.run("UPDATE users SET role='employee' WHERE id='emp'");
  const done = await rt.decide(ap.id, users('mgr'), 'approved');
  assert.equal(done.status, 'completed');
  assert.deepEqual(done.output, { a: 1, b: 1, c: 6 });
  assert.equal(effects.counter, 1, 'the first step was replayed from its record, not run again');
  assert.equal(effects.sensitive, 1);
  await assert.rejects(rt.decide(ap.id, users('mgr'), 'approved'), /قبلاً بررسی/);
  assert.deepEqual(rt.events(r.id).map((e) => e.type), [
    'agent.run.started', 'agent.run.running', 'agent.tool.started', 'agent.tool.completed', 'agent.approval.requested', 'agent.run.waiting_for_approval',
    'agent.approval.resolved', 'agent.run.running', 'agent.tool.started', 'agent.tool.completed', 'agent.tool.started', 'agent.tool.completed', 'agent.run.completed',
  ]);
  assert.ok(seen.every((e) => !('args' in (e.data ?? {}))), 'events carry no tool arguments');
});

test('سیاست تأیید عامل: ابزار بی‌خطر هم برای این عامل منتظر تأیید می‌ماند', async () => {
  const { rt, users, effects } = setup();
  const r = await rt.start('policy', { user: users('emp') });
  assert.equal(r.status, 'waiting_for_approval');
  assert.equal(effects.counter, 0);
  assert.equal((await rt.decide(rt.pendingApprovals()[0].id, users('mgr'), 'approved')).status, 'completed');
});

test('رد درخواست: ابزار اجرا نمی‌شود و عامل نتیجه «رد شد» را می‌گیرد', async () => {
  const { rt, effects, users } = setup();
  const r = await rt.start('flow', { user: users('emp') });
  const done = await rt.decide(rt.pendingApprovals()[0].id, users('mgr'), 'denied', 'مدرک ندارد');
  assert.equal(done.status, 'completed');
  assert.deepEqual(done.output.b, { denied: true, reason: 'مدرک ندارد' });
  assert.equal(effects.sensitive, 0);
  assert.equal(rt.view(r.id).steps.find((s) => s.tool === 'sensitive').status, 'denied');
});

test('ورودی نامعتبر، ابزار خارج از فهرست عامل، نبود دسترسی و خروجی نامعتبر، اجرا را ناموفق می‌کند', async () => {
  const { rt, users } = setup();
  const bad = await rt.start('bad', { user: users('emp') });
  assert.equal(bad.status, 'failed');
  assert.match(bad.error, /حداکثر 9/);
  const sneaky = await rt.start('sneaky', { user: users('emp') });
  assert.equal(sneaky.status, 'failed');
  assert.match(sneaky.error, /مجاز نیست/);
  const boss = await rt.start('boss', { user: users('emp') });
  assert.equal(boss.status, 'failed');
  assert.match(boss.error, /اجازه/);
  assert.equal((await rt.start('boss', { user: users('mgr') })).status, 'completed');
  const liar = await rt.start('liar', { user: users('emp') });
  assert.equal(liar.status, 'failed');
  assert.match(liar.error, /خروجی lying/);
  await assert.rejects(rt.start('nobody', { user: users('emp') }), /شناخته نیست/);
});

test('تلاش دوباره محدود: فقط خطای قابل‌تکرار، حداکثر سه بار، با رویداد و شمار تلاش', async () => {
  const { rt, users, effects } = setup();
  const r = await rt.start('retrying', { user: users('emp') });
  assert.equal(r.status, 'completed');
  assert.equal(r.output, 'done');
  assert.equal(effects.flaky, 3);
  assert.equal(r.steps[0].attempts, 3);
  assert.equal(rt.events(r.id).filter((e) => e.type === 'agent.tool.retry').length, 2);
  assert.equal(rt.stats().tools.find((t) => t.tool === 'flaky').retries, 2);
});

test('واگذاری: اجرای فرزند دیدنی است، عمق و زنجیره ثبت می‌شود، مقصد غیرمجاز رد می‌شود', async () => {
  const { rt, users } = setup();
  const r = await rt.start('lead', { user: users('emp') });
  assert.equal(r.status, 'completed');
  assert.deepEqual(r.output, { mine: 2, theirs: 8 });
  const step = r.steps.find((s) => s.tool === 'delegate:helper');
  const child = rt.view(step.child);
  assert.equal(child.parentRunId, r.id);
  assert.equal(child.depth, 1);
  assert.deepEqual(child.chain, ['lead', 'helper']);
  assert.equal(child.userId, 'emp', 'the child acts as the same person, with the same permissions');
  assert.ok(rt.events(r.id).some((e) => e.type === 'agent.delegation.completed'));
  const rogue = await rt.start('rogue', { user: users('emp') });
  assert.equal(rogue.status, 'failed');
  assert.match(rogue.error, /اجازه واگذاری/);
});

test('واگذاری: چرخه و عمق بیش از حد رد می‌شود', async () => {
  const { rt, users } = setup();
  const cyc = await rt.start('ping', { user: users('emp') });
  assert.equal(cyc.status, 'failed');
  assert.match(cyc.error, /چرخه|pong/);
  const deep = await rt.start('d0', { user: users('emp') });
  assert.equal(deep.status, 'failed');
  assert.match(deep.error, new RegExp(`${MAX_DELEGATION_DEPTH}`));
});

test('واگذاری منتظر: فرزند منتظر تأیید، والد را در waiting_for_tool نگه می‌دارد؛ پس از تأیید هر دو تمام می‌شوند', async () => {
  const { rt, users, effects } = setup();
  const r = await rt.start('waitsOnChild', { user: users('emp') });
  assert.equal(r.status, 'waiting_for_tool');
  const ap = rt.pendingApprovals()[0];
  assert.equal(ap.agent, 'gated');
  await rt.decide(ap.id, users('mgr'), 'approved');
  const after = rt.view(r.id);
  assert.equal(after.status, 'completed');
  assert.deepEqual(after.output, { child: 1 });
  assert.equal(effects.sensitive, 1);
  // cancelling a parent cancels its waiting children
  const r2 = await rt.start('waitsOnChild', { user: users('emp') });
  rt.cancel(r2.id, users('emp'));
  const childId = rt.view(r2.id).steps[0].child;
  assert.equal(rt.view(childId).status, 'cancelled');
});

test('کلید یکتای اجرا، توقف، ادامه، لغو و بازیابی پس از ری‌استارت', async () => {
  const { rt, users, db, effects, tools, registry } = setup();
  const a = await rt.start('simple', { user: users('emp'), key: 'same-key-1' });
  const b = await rt.start('simple', { user: users('emp'), key: 'same-key-1' });
  assert.equal(a.id, b.id);
  assert.equal(effects.counter, 1);
  const w = await rt.start('flow', { user: users('emp') });
  rt.pause(w.id, users('emp'));
  const afterDecide = await rt.decide(rt.pendingApprovals()[0].id, users('mgr'), 'approved');
  assert.equal(afterDecide.status, 'paused');
  assert.equal(effects.sensitive, 0);
  assert.equal((await rt.resume(w.id, users('emp'))).status, 'completed');
  assert.equal(effects.sensitive, 1);
  const c = await rt.start('flow', { user: users('emp') });
  assert.equal(rt.cancel(c.id, users('emp')).status, 'cancelled');
  assert.equal(rt.pendingApprovals().length, 0);
  assert.throws(() => rt.cancel(c.id, users('emp2')), /مال شما نیست/);
  db.run("INSERT INTO agent_runs(id,agent,user_id,status,input_json,created_at,updated_at) VALUES ('run_crash','simple','emp','running','{}','t','t')");
  const rt2 = createRuntime({ db, tools, registry, can: (u, cap) => can(u, cap), users: (id) => db.get('SELECT * FROM users WHERE id=?', id) });
  assert.equal(rt2.view('run_crash').status, 'queued');
  await rt2.sweep();
  assert.equal(rt2.view('run_crash').status, 'completed');
});

test('مهاجرت: پایگاه spec 0015 (waiting_approval، tutor) به نام‌های تازه ارتقا می‌یابد', () => {
  const db = openDb(':memory:');
  db.raw.exec(`CREATE TABLE agent_runs (id TEXT PRIMARY KEY, agent TEXT NOT NULL, user_id TEXT, idem_key TEXT UNIQUE, origin TEXT NOT NULL DEFAULT 'user',
    status TEXT NOT NULL CHECK (status IN ('queued','running','waiting_approval','paused','completed','failed','cancelled')), input_json TEXT NOT NULL DEFAULT '{}', output_json TEXT, error TEXT, steps INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE agent_steps (id TEXT PRIMARY KEY, run_id TEXT NOT NULL, n INTEGER NOT NULL, tool TEXT NOT NULL, args_json TEXT NOT NULL, result_json TEXT, status TEXT NOT NULL, error TEXT, created_at TEXT NOT NULL, UNIQUE (run_id, n));
    INSERT INTO agent_runs VALUES ('r1','tutor','u',NULL,'user','waiting_approval','{}',NULL,NULL,1,'t','t');`);
  const registry = createRegistry([def('accounting-tutor', [], async () => 1)], { tools: {} });
  const rt = createRuntime({ db, tools: {}, registry, can: () => true, users: () => null });
  const v = rt.view('r1');
  assert.equal(v.status, 'waiting_for_approval');
  assert.equal(v.agent, 'accounting-tutor');
  assert.ok(db.all('PRAGMA table_info(agent_steps)').some((c) => c.name === 'child_run_id'));
});

test('حافظه: هر عامل فقط به حوزه‌های اعلام‌شده دسترسی دارد؛ حافظه هر نفر جداست', async () => {
  const { rt, users } = setup();
  assert.equal((await rt.start('trainer', { user: users('emp'), input: { kind: 'weak_skill', key: 'tax', value: { m: 0.2 } } })).status, 'completed');
  const denied = await rt.start('trainer', { user: users('emp'), input: { kind: 'tech_mistake', key: 'WALL', value: 1 } });
  assert.equal(denied.status, 'failed');
  assert.match(denied.error, /دسترسی ندارد/);
  assert.deepEqual(rt.memory.get('emp', 'weak_skill', 'tax'), { m: 0.2 });
  assert.equal(rt.memory.get('emp2', 'weak_skill', 'tax'), null);
  rt.memory.set('emp', 'weak_skill', 'tax', { m: 0.3 });
  rt.memory.set('emp', 'style', 'explain:tax', { more: true });
  assert.equal(rt.memory.list('emp').length, 2);
  assert.equal(rt.memory.list('emp', 'style').length, 1);
});

test('خروجی ساختاریافته: JSON معتبر پذیرفته، نامعتبر با خطا ترمیم، و پس از سقف تلاش رد می‌شود', async () => {
  const schema = S.obj({ style: S.arr(S.str()), score: S.num({ minimum: 0, maximum: 1 }) }, ['style', 'score']);
  const scripted = (answers) => {
    const asked = [];
    return { asked, provider: { name: 'fake', available: () => true, run: async ({ prompt }) => (asked.push(prompt), answers.shift() ?? null) } };
  };
  let f = scripted(['```json\n{"style":["مینیمال"],"score":0.8}\n```']);
  assert.deepEqual(await structured(f.provider, { system: 's', prompt: 'p', schema }), { ok: true, value: { style: ['مینیمال'], score: 0.8 }, attempts: 1 });
  f = scripted(['{"style":"x","score":2}', 'نه', '{"style":[],"score":0.5}']);
  const r = await structured(f.provider, { system: 's', prompt: 'p', schema, retries: 2 });
  assert.equal(r.ok, true);
  assert.equal(r.attempts, 3);
  assert.match(f.asked[1], /خطا/, 'the repair round carries the validator errors');
  f = scripted(['{}', '{}', '{}', '{"style":[],"score":0}']);
  const bad = await structured(f.provider, { system: 's', prompt: 'p', schema, retries: 2 });
  assert.equal(bad.ok, false);
  assert.equal(bad.attempts, 3, 'bounded: no fourth call');
  assert.equal((await structured(NO_PROVIDER, { system: 's', prompt: 'p', schema })).ok, false);
});
