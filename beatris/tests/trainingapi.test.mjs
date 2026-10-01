// spec 0015 (integration): the accounting trainer over HTTP — scenario → attempt → grading → mastery → triggers,
// hints and explanations, the practice book with a sentence of the counter, the audit agent, the manager's view,
// routines once per slot, permissions, and a real operation that waits for a manager's approval.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.mjs';
import { createServer } from '../server/index.mjs';
import { seedUsers } from '../server/api.mjs';
import { buildScenario } from '../public/js/acct/scenarios.mjs';

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
const answerFor = (sc) => {
  const s = buildScenario(sc.id, { date: sc.date });
  const h = s.hiddenExpectedResult;
  if (s.answerKind === 'decision') return { decision: h.decision };
  if (s.answerKind === 'findings') return { findings: h.findings };
  return { entries: h.entries.map((e) => ({ lines: e.lines, ...(e.ref ? { ref: e.ref } : {}) })) };
};

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

test('خانه آموزش: پیشرفت، گراف مهارت، قالب‌ها، کدینگ و دفتر تمرین', async () => {
  const h = await ok('GET', '/api/train/acct', null, E);
  assert.equal(h.progress.readiness, 0);
  assert.ok(h.skills.length >= 17 && h.templates.length >= 22 && h.accounts.length >= 25);
  assert.match(h.practiceBook, /^bk_/);
  assert.equal((await call('GET', '/api/train/acct', null, null)).status, 401);
});

test('سناریو → پاسخ درست: نمره کامل، تسلط بالا می‌رود، پاسخ و توضیح پس از حل؛ کلید یکتا دو بار ارزیابی نمی‌کند', async () => {
  const s = await ok('POST', '/api/train/acct/scenario', { template: 'buy_melt', difficulty: 'beginner', key: 'scen-key-001' }, E);
  assert.equal(s.run.status, 'completed');
  const sc = s.scenario;
  assert.equal(sc.template, 'buy_melt');
  assert.ok(!JSON.stringify(sc).includes('hiddenExpectedResult'));
  assert.equal((await ok('POST', '/api/train/acct/scenario', { template: 'buy_melt', key: 'scen-key-001' }, E)).scenario.rowId, sc.rowId, 'same key, same scenario');
  const lock = await ok('GET', `/api/train/acct/scenario/${sc.rowId}/explain`, null, E);
  assert.equal(lock.locked, true, 'no explanation before the first try');
  const a = await ok('POST', `/api/train/acct/scenario/${sc.rowId}/attempt`, { answer: answerFor(sc), key: 'att-key-0001' }, E);
  assert.equal(a.evaluation.score, 1);
  assert.equal(a.evaluation.done, true);
  assert.ok(a.mastery.weight.after > 0);
  assert.ok(a.explanation.text.length > 20);
  assert.match(a.feedback, /درست است/);
  const again = await ok('POST', `/api/train/acct/scenario/${sc.rowId}/attempt`, { answer: answerFor(sc), key: 'att-key-0001' }, E);
  assert.equal(again.run.id, a.run.id, 'the same attempt key replays the same run');
  const prog = await ok('GET', '/api/train/acct', null, E);
  assert.equal(prog.progress.skills.find((x) => x.id === 'weight').attempts, 1);
  // the trainee's entry is in the scenario's sandbox book, and its trial balance closes
  const book = await ok('GET', `/api/train/acct/book/${sc.bookId}`, null, E);
  assert.equal(book.trial.balanced, true);
  assert.ok(book.entries.some((e) => e.memo === 'پاسخ کارآموز'));
  assert.equal((await call('GET', `/api/train/acct/book/${sc.bookId}`, null, E2)).status, 404, 'another person cannot open it');
  assert.equal((await call('GET', `/api/train/acct/scenario/${sc.rowId}`, null, E2)).status, 404);
});

test('اشتباه تکراری: راهنمایی بدون لو دادن، سه اشتباه پشت‌سرهم ← مداخله جبرانی (یک بار)', async () => {
  const fired = [];
  for (let i = 0; i < 3; i++) {
    const sc = (await ok('POST', '/api/train/acct/scenario', { template: 'cash_shortage', difficulty: 'intermediate' }, E2)).scenario;
    if (i === 0) {
      const h1 = await ok('POST', `/api/train/acct/scenario/${sc.rowId}/hint`, { level: 1 }, E2);
      assert.match(h1.text, /صندوق/);
      const h4 = await ok('POST', `/api/train/acct/scenario/${sc.rowId}/hint`, { level: 4 }, E2);
      assert.ok(!h4.reveal, 'level 4 needs an explicit request for the answer');
    }
    const wrong = { entries: [{ lines: [{ account: '1110', dr: 1000, cr: 0 }, { account: '6120', dr: 0, cr: 1000 }] }] };
    const a = await ok('POST', `/api/train/acct/scenario/${sc.rowId}/attempt`, { answer: wrong, key: `wrong-${i}-abcdef` }, E2);
    assert.ok(a.evaluation.score < 0.5);
    assert.ok(a.evaluation.mistakes.some((m) => m.code === 'WRONG_SIDE'));
    fired.push(...a.interventions);
  }
  const remedial = fired.filter((r) => r.output?.scenario);
  assert.ok(remedial.length >= 1, JSON.stringify(fired));
  assert.equal(remedial[0].status, 'completed');
  assert.ok(['beginner', 'intermediate'].includes(remedial[0].output.scenario.difficulty));
  const runs = await ok('GET', '/api/agents/runs', null, E2);
  assert.ok(runs.runs.some((r) => r.origin === 'trigger'));
  const reveal = await ok('POST', `/api/train/acct/scenario/${remedial[0].output.scenario.rowId}/hint`, { level: 4, reveal: true }, E2);
  assert.equal(reveal.reveal, true);
});

test('دفتر تمرین: جمله پیشخوان ← عملیات تایپ‌شده ← سند موتور؛ ثبت با کلید یکتا؛ حسابرس دفتر را بررسی می‌کند', async () => {
  await ok('POST', '/api/train/acct/practice/entry', { key: 'practice-cap-1', entry: { date: '2026-10-01', kind: 'capital', lines: [{ account: '1110', dr: 50_000_000_000, cr: 0 }, { account: '3100', dr: 0, cr: 50_000_000_000 }] } }, E);
  const p = await ok('POST', '/api/train/acct/practice/intent', { text: 'خرید - رضایی - دوازده ممیز چهل و پنج گرم - عیار هفتصد و پنجاه - نقد', price750: 80_000_000, post: true, key: 'intent-key-01' }, E);
  assert.equal(p.action.type, 'buy_melt');
  assert.equal(p.proposal.calc.value, 996_000_000);
  assert.equal(p.check.ok, true);
  assert.ok(p.posted.id);
  assert.equal(p.book.inventory['1310'].fine750, 12.45);
  const dup = await ok('POST', '/api/train/acct/practice/entry', { key: 'practice-cap-1', entry: { date: '2026-10-01', lines: [{ account: '1110', dr: 1, cr: 0 }, { account: '3100', dr: 0, cr: 1 }] } }, E);
  assert.equal(dup.posted.replayed, true);
  const bad = await call('POST', '/api/train/acct/practice/entry', { key: 'practice-bad-1', entry: { date: '2026-10-01', lines: [{ account: '1110', dr: 2, cr: 0 }, { account: '3100', dr: 0, cr: 1 }] } }, E);
  assert.equal(bad.status, 400);
  const au = await ok('POST', '/api/train/acct/audit', {}, E);
  assert.equal(au.score, 100);
  assert.match(au.message, /پاک/);
});

test('چالش حسابرسی: عامل حسابرس یافته‌ها را با قواعد پیدا و توضیح می‌دهد', async () => {
  const sc = (await ok('POST', '/api/train/acct/scenario', { template: 'audit_challenge' }, E)).scenario;
  assert.ok(sc.journal.length > 4);
  const au = await ok('POST', '/api/train/acct/audit', { scenarioId: sc.rowId }, E);
  assert.ok(au.findings.length >= 1 && au.findings[0].text.length > 10);
  const a = await ok('POST', `/api/train/acct/scenario/${sc.rowId}/attempt`, { answer: answerFor(sc), key: 'audit-att-01' }, E);
  assert.equal(a.evaluation.score, 1);
});

test('مدیر: نمای تیم خلوت؛ کارمند نمی‌بیند؛ روال‌ها هر بازه یک بار؛ تنظیم فقط با مدیر', async () => {
  assert.equal((await call('GET', '/api/train/acct/team', null, E)).status, 403);
  const t = await ok('GET', '/api/train/acct/team', null, M);
  const me = t.team.find((p) => p.name === 'نیما صالحی');
  assert.ok(me.readiness > 0 && me.completion > 0);
  for (const k of ['readiness', 'mastery', 'weak', 'repeated', 'completion', 'audit', 'closing']) assert.ok(k in me, k);
  // routines: the daily exercise for each trainee, once per Tehran day
  const sys = [...server.platform.all()][0][1].agents;
  const at = new Date('2026-10-03T08:00:00Z'); // 11:30 Tehran, Saturday
  const r1 = await sys.tick(at);
  const r2 = await sys.tick(at);
  assert.ok(r1.some((x) => x.routine === 'daily_exercise'));
  assert.ok(r1.some((x) => x.routine === 'weekly_review') && r1.some((x) => x.routine === 'weekly_staff_summary'));
  assert.equal(r2.filter((x) => x.routine).length, 0, 'a slot runs once');
  const t2 = await ok('GET', '/api/train/acct/team', null, M);
  assert.ok(t2.reports.some((r) => r.title === 'خلاصه هفتگی مهارت کارکنان'));
  assert.equal((await call('PUT', '/api/agents/routines/daily_exercise', { enabled: false }, E)).status, 403);
  const rt = await ok('PUT', '/api/agents/triggers/inactive', { params: { days: 3 }, enabled: true }, M);
  assert.equal(rt.triggers.find((x) => x.id === 'inactive').params.days, 3);
});

test('عملیات واقعی: سند پیشنهادی منتظر تأیید مدیر می‌ماند؛ خود کارمند نمی‌تواند؛ پس از تأیید در دفاتر واقعی ثبت می‌شود', async () => {
  const party = await ok('POST', '/api/books/parties', { name: 'مشتری تأییدی' }, E);
  const before = (await ok('GET', `/api/books/docs?party=${party.id}`, null, E)).items.length;
  const doc = { type: 'trade', partyId: party.id, lines: [{ kind: 'melt', dir: 'in', weight: 3, fineness: 750, mazaneh: 400000000 }], payments: [] };
  const r = await ok('POST', '/api/agents/real', { doc, summary: 'خرید ۳ گرم آبشده', key: 'real-op-0001' }, E);
  assert.equal(r.run.status, 'waiting_approval');
  assert.equal((await ok('GET', `/api/books/docs?party=${party.id}`, null, E)).items.length, before, 'nothing in the real books before approval');
  assert.equal((await call('GET', '/api/agents/approvals', null, E)).status, 403);
  const ap = (await ok('GET', '/api/agents/approvals', null, M)).approvals.find((x) => x.runId === r.run.id);
  assert.match(ap.summary, /خرید ۳ گرم/);
  assert.equal((await call('POST', `/api/agents/approvals/${ap.id}`, { decision: 'approved' }, E)).status, 403);
  const done = await ok('POST', `/api/agents/approvals/${ap.id}`, { decision: 'approved' }, M);
  assert.equal(done.run.status, 'completed');
  assert.equal((await ok('GET', `/api/books/docs?party=${party.id}`, null, E)).items.length, before + 1);
  const view = await ok('GET', `/api/agents/runs/${r.run.id}`, null, E);
  assert.ok(view.events.some((e) => e.type === 'approval_decided'));
  assert.equal((await call('GET', `/api/agents/runs/${r.run.id}`, null, E2)).status, 404);
  // denied: still nothing posted
  const r2 = await ok('POST', '/api/agents/real', { doc, summary: 'دوباره', key: 'real-op-0002' }, E);
  const ap2 = (await ok('GET', '/api/agents/approvals', null, O)).approvals.find((x) => x.runId === r2.run.id);
  const d2 = await ok('POST', `/api/agents/approvals/${ap2.id}`, { decision: 'denied', note: 'مدرک ناقص' }, O);
  assert.equal(d2.run.output.posted, false);
  assert.equal((await ok('GET', `/api/books/docs?party=${party.id}`, null, E)).items.length, before + 1);
});
