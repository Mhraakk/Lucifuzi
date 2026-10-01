// spec 0015: the agent runtime — typed tools only, permissions, approvals that pause a run (four eyes), durable
// replay (a step that ran is never run again), idempotent runs, pause / resume / cancel, and recovery after restart.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.mjs';
import { createRuntime } from '../server/agents/runtime.mjs';
import { S, check } from '../server/agents/schema.mjs';
import { can } from '../server/rbac.mjs';

function setup() {
  const db = openDb(':memory:');
  const add = (id, role) => db.run("INSERT INTO users(id,name,phone,role,pin_hash,created_at) VALUES (?,?,?,?, 'x', '2026-01-01')", id, id, `0912${id.padStart(7, '0')}`, role);
  add('emp', 'employee');
  add('emp2', 'employee');
  add('mgr', 'manager');
  const effects = { counter: 0, sensitive: 0 };
  const tools = {
    counter: { label: 'شمارنده', input: S.obj({}), run: () => ++effects.counter },
    echo: { label: 'پژواک', input: S.obj({ n: S.int({ minimum: 0, maximum: 9 }) }), run: ({ n }) => n * 2 },
    sensitive: { label: 'کار حساس', cap: 'books.use', approver: 'books.admin', input: S.obj({ what: S.str() }), approval: ({ what }) => `انجام ${what}`, run: () => ++effects.sensitive },
    adminOnly: { label: 'کار مدیر', cap: 'books.admin', input: S.obj({}), run: () => 'ok' },
  };
  const agents = {
    flow: { name: 'flow', tools: ['counter', 'sensitive', 'echo'], plan: async (ctx) => ({ a: await ctx.tool('counter'), b: await ctx.tool('sensitive', { what: 'ثبت' }), c: await ctx.tool('echo', { n: 3 }) }) },
    bad: { name: 'bad', tools: ['echo'], plan: async (ctx) => ctx.tool('echo', { n: 99 }) },
    sneaky: { name: 'sneaky', tools: ['echo'], plan: async (ctx) => ctx.tool('counter') },
    boss: { name: 'boss', tools: ['adminOnly'], plan: async (ctx) => ctx.tool('adminOnly') },
    simple: { name: 'simple', tools: ['counter'], plan: async (ctx) => ctx.tool('counter') },
  };
  const users = (id) => db.get('SELECT * FROM users WHERE id=?', id);
  const rt = createRuntime({ db, tools, agents, can: (u, c) => can(u, c), users });
  return { db, rt, effects, users, tools, agents };
}

test('اعتبارسنج schema: نوع، الزامی، اضافه، الگو و بازه؛ کلیدواژه ناشناخته رد می‌شود', () => {
  const sch = S.obj({ a: S.int({ minimum: 1 }), b: S.str({ pattern: '^x' }) }, ['a']);
  assert.deepEqual(check(sch, { a: 2, b: 'xy' }), []);
  assert.equal(check(sch, { b: 'xy' }).length, 1);
  assert.equal(check(sch, { a: 0 }).length, 1);
  assert.equal(check(sch, { a: 1, z: 1 }).length, 1);
  assert.equal(check(sch, { a: 1.5 }).length, 1);
  assert.equal(check(sch, { a: 1, b: 'y' }).length, 1);
  assert.throws(() => check({ type: 'string', format: 'email' }, 'a'), /not supported/);
});

test('تأیید: اجرا منتظر می‌ماند؛ درخواست‌دهنده و کارمند نمی‌توانند تأیید کنند؛ مدیر تأیید می‌کند؛ هیچ گامی دو بار اجرا نمی‌شود', async () => {
  const { rt, effects, users, db } = setup();
  const r = await rt.start('flow', { user: users('emp') });
  assert.equal(r.status, 'waiting_approval');
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
  assert.deepEqual(rt.events(r.id).map((e) => e.type), ['queued', 'running', 'step', 'approval_requested', 'waiting_approval', 'approval_decided', 'running', 'step', 'step', 'completed']);
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

test('ورودی نامعتبر، ابزار خارج از فهرست عامل و نبود دسترسی، اجرا را ناموفق می‌کند', async () => {
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
});

test('کلید یکتای اجرا، توقف، ادامه، لغو و بازیابی پس از ری‌استارت', async () => {
  const { rt, users, db, effects, tools, agents } = setup();
  const a = await rt.start('simple', { user: users('emp'), key: 'same-key-1' });
  const b = await rt.start('simple', { user: users('emp'), key: 'same-key-1' });
  assert.equal(a.id, b.id);
  assert.equal(effects.counter, 1);
  // a paused run does not move on its approval until resumed
  const w = await rt.start('flow', { user: users('emp') });
  rt.pause(w.id, users('emp'));
  const ap = rt.pendingApprovals()[0];
  const afterDecide = await rt.decide(ap.id, users('mgr'), 'approved');
  assert.equal(afterDecide.status, 'paused');
  assert.equal(effects.sensitive, 0);
  assert.equal((await rt.resume(w.id, users('emp'))).status, 'completed');
  assert.equal(effects.sensitive, 1);
  // cancel expires the pending approval
  const c = await rt.start('flow', { user: users('emp') });
  assert.equal(rt.cancel(c.id, users('emp')).status, 'cancelled');
  assert.equal(rt.pendingApprovals().length, 0);
  assert.throws(() => rt.cancel(c.id, users('emp2')), /مال شما نیست/);
  // restart: a run left «running» by a crash is queued again and finishes on the next sweep
  db.run("INSERT INTO agent_runs(id,agent,user_id,status,input_json,created_at,updated_at) VALUES ('run_crash','simple','emp','running','{}','t','t')");
  const rt2 = createRuntime({ db, tools, agents, can: (u, cap) => can(u, cap), users: (id) => db.get('SELECT * FROM users WHERE id=?', id) });
  assert.equal(rt2.view('run_crash').status, 'queued');
  await rt2.sweep();
  assert.equal(rt2.view('run_crash').status, 'completed');
});

test('حافظه دامنه از دفتر جداست: کلید/نوع، بازنویسی و فهرست', () => {
  const { rt } = setup();
  rt.memory.set('emp', 'weak_skill', 'tax', { mastery: 0.2 });
  rt.memory.set('emp', 'weak_skill', 'tax', { mastery: 0.3 });
  rt.memory.set('emp', 'style', 'explain:tax', { more: true });
  assert.deepEqual(rt.memory.get('emp', 'weak_skill', 'tax'), { mastery: 0.3 });
  assert.equal(rt.memory.list('emp').length, 2);
  assert.equal(rt.memory.list('emp', 'style').length, 1);
});
