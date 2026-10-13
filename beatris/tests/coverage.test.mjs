// The full-feature pass (2026-10-12): every API route a person can reach is called by some test. These are the ones no
// other test called: sign out everywhere, drills, SOPs, attendance, course assignments, a manual market sync, the
// desk's product templates, the one-line understanding and the scale settings. Each is checked for its answer, for its
// effect where the app reads it back, and for who may call it.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.mjs';
import { createServer } from '../server/index.mjs';
import { seedUsers } from '../server/api.mjs';
import * as C from '../content/index.mjs';
import { smsLogin } from './helpers/login.mjs';

let server, base, OWNER, MANAGER, TRAINER, EMP;
const PHONE = { owner: '09120000001', manager: '09120000002', trainer: '09120000003', emp: '09120000004', emp2: '09120000005', emp3: '09120000006' };
const call = async (method, path, body, token) => {
  const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const ok = async (...a) => {
  const r = await call(...a);
  assert.ok(r.status < 300, `${a[0]} ${a[1]} → ${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
};
const status = async (...a) => (await call(...a)).status;
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran' }).format(new Date());

before(async () => {
  const db = openDb(':memory:');
  seedUsers(db, {}, true);
  server = createServer({ db, secret: 'coverage-secret-0123456789', demo: true, quiet: true, tenantsDir: ':memory:', marketOpts: { fetchImpl: async () => new Response('{}', { status: 404 }), defaultMode: 'off' } });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  [OWNER, MANAGER, TRAINER, EMP] = await Promise.all([PHONE.owner, PHONE.manager, PHONE.trainer, PHONE.emp].map((p) => smsLogin(base, p)));
});
after(() => server.close());

test('sign out everywhere: every session of that person stops at once, and a fresh sign-in works', async () => {
  const a = await smsLogin(base, PHONE.emp2), b = await smsLogin(base, PHONE.emp2);
  assert.equal(await status('GET', '/api/me', null, a), 200);
  assert.equal(await status('GET', '/api/me', null, b), 200);
  assert.deepEqual(await ok('POST', '/api/auth/logout-all', {}, a), { ok: true });
  assert.equal(await status('GET', '/api/me', null, a), 401, 'the session that asked');
  assert.equal(await status('GET', '/api/me', null, b), 401, 'the other session too');
  assert.equal(await status('GET', '/api/me', null, await smsLogin(base, PHONE.emp2)), 200);
  assert.equal(await status('GET', '/api/me', null, OWNER), 200, 'nobody else is signed out');
  assert.equal(await status('POST', '/api/auth/logout-all', {}), 401);
});

test('drills: a valid kind counts in the person’s progress, an unknown kind is refused', async () => {
  await ok('POST', '/api/drills', { kind: 'invoice', correct: true }, EMP);
  await ok('POST', '/api/drills', { kind: 'mazaneh', correct: false }, EMP);
  assert.deepEqual((await ok('GET', '/api/me', null, EMP)).progress.drills, { total: 2, correct: 1 });
  assert.equal(await status('POST', '/api/drills', { kind: 'nope', correct: true }, EMP), 400);
  assert.deepEqual((await ok('GET', '/api/me', null, EMP)).progress.drills, { total: 2, correct: 1 }, 'a refused drill is not counted');
});

test('SOPs: read one, acknowledge it, and it leaves the person’s missing list at its own version', async () => {
  const s = C.SOPS[0];
  const first = await ok('GET', `/api/sops/${s.id}`, null, EMP);
  assert.equal(first.sop.id, s.id);
  assert.equal(first.ack, null);
  assert.ok((await ok('GET', '/api/me', null, EMP)).progress.sopMissing.includes(s.id));
  assert.deepEqual(await ok('POST', `/api/sops/${s.id}/ack`, {}, EMP), { ok: true, version: s.version });
  assert.equal((await ok('GET', `/api/sops/${s.id}`, null, EMP)).ack.version, s.version);
  const p = (await ok('GET', '/api/me', null, EMP)).progress;
  assert.ok(!p.sopMissing.includes(s.id));
  assert.equal(p.acks[s.id], s.version);
  assert.equal(await status('GET', '/api/sops/no-such-sop', null, EMP), 404);
  assert.equal(await status('POST', '/api/sops/no-such-sop/ack', {}, EMP), 404);
});

test('attendance: in once, then out once, in that order; staff see the day on the person’s page', async () => {
  const T = await smsLogin(base, PHONE.emp3);
  const me = (await ok('GET', '/api/me', null, T)).user;
  assert.equal(await status('POST', '/api/attendance', { type: 'out' }, T), 409, 'out before in');
  const inn = await ok('POST', '/api/attendance', { type: 'in' }, T);
  assert.ok(inn.inAt && inn.outAt == null);
  assert.equal(await status('POST', '/api/attendance', { type: 'in' }, T), 409, 'in twice');
  const out = await ok('POST', '/api/attendance', { type: 'out' }, T);
  assert.equal(out.inAt, inn.inAt);
  assert.ok(out.outAt >= out.inAt);
  assert.equal(await status('POST', '/api/attendance', { type: 'out' }, T), 409, 'out twice');
  assert.equal(await status('POST', '/api/attendance', { type: 'lunch' }, T), 400);
  assert.deepEqual((await ok('GET', '/api/me', null, T)).attendance, { inAt: out.inAt, outAt: out.outAt });
  const page = await ok('GET', `/api/team/${me.id}`, null, MANAGER);
  assert.equal(page.attendance[0].day, today);
  assert.equal(page.attendance[0].in_at, out.inAt);
  assert.equal(await status('GET', `/api/team/${me.id}`, null, T), 403, 'an employee does not see the team');
});

test('course assignments: staff set and remove them, the learner sees them, an employee cannot assign', async () => {
  const emp = (await ok('GET', '/api/me', null, EMP)).user;
  const course = C.COURSES[0].id;
  assert.equal(await status('POST', '/api/assignments', { userId: emp.id, courseId: course }, EMP), 403);
  await ok('POST', '/api/assignments', { userId: emp.id, courseId: course, dueDate: '2026-12-01', note: 'پیش از پایان آذر' }, TRAINER);
  let mine = (await ok('GET', '/api/me', null, EMP)).progress.assignments;
  assert.equal(mine.length, 1);
  assert.deepEqual({ courseId: mine[0].courseId, dueDate: mine[0].dueDate, note: mine[0].note }, { courseId: course, dueDate: '2026-12-01', note: 'پیش از پایان آذر' });
  // the same course again moves its date; it is not a second assignment
  await ok('POST', '/api/assignments', { userId: emp.id, courseId: course, dueDate: '2026-12-15' }, MANAGER);
  mine = (await ok('GET', '/api/me', null, EMP)).progress.assignments;
  assert.equal(mine.length, 1);
  assert.equal(mine[0].dueDate, '2026-12-15');
  assert.equal(await status('POST', '/api/assignments', { userId: emp.id, courseId: 'no-such-course' }, TRAINER), 400);
  assert.equal(await status('POST', '/api/assignments', { userId: 'no-such-user', courseId: course }, TRAINER), 404);
  assert.equal(await status('DELETE', `/api/assignments/${mine[0].id}`, null, EMP), 403);
  await ok('DELETE', `/api/assignments/${mine[0].id}`, null, TRAINER);
  assert.deepEqual((await ok('GET', '/api/me', null, EMP)).progress.assignments, []);
});

test('manual market sync: the shop’s managers only, and once in 15 seconds', async () => {
  assert.equal(await status('POST', '/api/market/sync', {}, EMP), 403);
  const v = await ok('POST', '/api/market/sync', {}, OWNER);
  assert.ok(v.config && v.status && Array.isArray(v.modes) && v.modes.length, JSON.stringify(v).slice(0, 200));
  assert.equal(v.config.mode, 'off');
  assert.equal(await status('POST', '/api/market/sync', {}, MANAGER), 429, 'a second press right away');
});

test('desk templates: every product the desk offers belongs to one of its groups', async () => {
  const t = await ok('GET', '/api/books/templates', null, EMP);
  assert.ok(t.groups.length && t.items.length);
  const groups = new Set(t.groups.map((g) => g.id));
  for (const it of t.items) assert.ok(it.label && it.group && groups.has(it.group), `${it.label ?? it.id}: group ${it.group}`);
  assert.equal(await status('GET', '/api/books/templates'), 401);
});

test('one-line understanding: the desk’s own rules when every word is known; never a guess without an assistant', async () => {
  const r = await ok('POST', '/api/books/oneline/understand', { text: 'خرید ۱۲ گرم عیار ۷۵۰ مظنه ۱۰۹ میلیون نقد' }, EMP);
  assert.equal(r.ok, true);
  assert.equal(r.source, 'rules');
  assert.equal(r.parsed.weight, 12);
  assert.equal(r.parsed.fineness, 750);
  assert.deepEqual(await ok('POST', '/api/books/oneline/understand', { text: '   ' }, EMP), { ok: false, reason: 'جمله‌ای نیامده است.' });
  // words the rules do not know, and no assistant key in this shop: a reason, never an invented line
  const loose = await ok('POST', '/api/books/oneline/understand', { text: 'امروز از آقای رضایی دوازده گرم هفتصد و پنجاهی گرفتیم' }, EMP);
  assert.equal(loose.ok, false);
  assert.ok(loose.reason && !loose.parsed);
});

test('scale settings: managers set the baud and the tares, the count page reads them back, nonsense falls back', async () => {
  assert.equal(await status('PUT', '/api/books/scale', { baud: 19200 }, EMP), 403);
  assert.deepEqual(await ok('PUT', '/api/books/scale', { baud: 19200, tares: { 'سینی بزرگ': 12.3456, 'جعبه': '3.2' } }, MANAGER), { baud: 19200, tares: { 'سینی بزرگ': 12.346, 'جعبه': 3.2 } });
  const counts = await ok('GET', '/api/books/counts', null, EMP);
  assert.deepEqual(counts.scale, { baud: 19200, tares: { 'سینی بزرگ': 12.346, 'جعبه': 3.2 } });
  const odd = await ok('PUT', '/api/books/scale', { baud: 1234, tares: { 'منفی': -1, '': 5, 'سنگین': 1e6 } }, OWNER);
  assert.deepEqual(odd, { baud: 9600, tares: {} }, 'an unknown speed is 9600; a negative, nameless or absurd tare is dropped');
});

test('training scenarios: a step’s answer comes back with its score and the best choice; time out scores 0', async () => {
  const s = C.SCENARIOS[0];
  const st = s.steps[0];
  const best = st.choices.reduce((a, b) => (b.score > a.score ? b : a));
  const worst = st.choices.reduce((a, b) => (b.score < a.score ? b : a));
  const r = await ok('POST', `/api/scenarios/${s.id}/reveal`, { stepId: st.id, choiceId: worst.id }, EMP);
  assert.deepEqual({ score: r.score, fb: r.fb, bestId: r.bestId }, { score: worst.score, fb: worst.fb, bestId: best.id });
  const late = await ok('POST', `/api/scenarios/${s.id}/reveal`, { stepId: st.id }, EMP);
  assert.equal(late.score, 0);
  assert.equal(late.bestId, best.id);
  assert.equal(await status('POST', `/api/scenarios/${s.id}/reveal`, { stepId: 'no-such-step' }, EMP), 404);
  assert.equal(await status('POST', '/api/scenarios/no-such/reveal', { stepId: st.id }, EMP), 404);
});

test('cash and bank accounts: managers rename and switch them off; the kind never changes; a bad card is refused', async () => {
  const acct = await ok('POST', '/api/books/accounts', { kind: 'bank', title: 'ملت جاری', bank: 'ملت' }, MANAGER);
  assert.equal(await status('PUT', `/api/books/accounts/${acct.id}`, { title: 'حساب دیگر' }, EMP), 403);
  const r = await ok('PUT', `/api/books/accounts/${acct.id}`, { title: 'ملت جاری شعبه', bank: 'ملت', kind: 'cash', active: true }, MANAGER);
  assert.deepEqual({ title: r.title, kind: r.kind, active: r.active }, { title: 'ملت جاری شعبه', kind: 'bank', active: true });
  assert.equal(await status('PUT', `/api/books/accounts/${acct.id}`, { title: 'ملت', card: '1234567812345678' }, MANAGER), 400);
  assert.equal(await status('PUT', `/api/books/accounts/${acct.id}`, { title: 'م' }, MANAGER), 400, 'a name of one letter');
  await ok('PUT', `/api/books/accounts/${acct.id}`, { title: 'ملت جاری شعبه', bank: 'ملت', active: false }, MANAGER);
  const listed = (await ok('GET', '/api/books/accounts', null, EMP)).items.find((a) => a.id === acct.id);
  assert.equal(listed.active, false);
  assert.equal(await status('PUT', '/api/books/accounts/no-such-account', { title: 'حساب' }, MANAGER), 404);
});

test('stock items: a piece is corrected in place, unchanged fields stay, and the change is in the log', async () => {
  const { items: [it] } = await ok('POST', '/api/books/items', { tpl: 'ring-w', title: 'انگشتر آزمون پوشش', weight: 3.2, fineness: 750, ojratMode: 'pct', ojrat: 18, profitPct: 7 }, EMP);
  const r = await ok('PUT', `/api/books/items/${it.id}`, { weight: 3.25, ojrat: 20 }, EMP);
  assert.deepEqual({ title: r.title, weight: r.weight, fineness: r.fineness, ojrat: r.ojrat, profitPct: r.profitPct, code: r.code }, { title: 'انگشتر آزمون پوشش', weight: 3.25, fineness: 750, ojrat: 20, profitPct: 7, code: it.code });
  assert.equal(await status('PUT', `/api/books/items/${it.id}`, { weight: -1 }, EMP), 400);
  assert.equal(await status('PUT', `/api/books/items/${it.id}`, { stoneWeight: 4 }, EMP), 400, 'stones heavier than the piece');
  assert.equal(await status('PUT', '/api/books/items/no-such-item', { weight: 2 }, EMP), 404);
  const log = (await ok('GET', `/api/books/log?ref=${encodeURIComponent(it.code)}`, null, MANAGER)).items.find((l) => l.action === 'item.update');
  assert.ok(log, 'the correction is in the event log');
  assert.deepEqual([log.detail.before.weight, log.detail.after.weight], [3.2, 3.25]);
});

test('memory notes: the shop, a customer or oneself; the note is listed, and only its writer or a manager removes it', async () => {
  const party = await ok('POST', '/api/books/parties', { name: 'نسرین یادداشتی' }, EMP);
  const shop = await ok('POST', '/api/books/memory', { scope: 'shop', text: 'شنبه‌ها بازرسی اتحادیه می‌آید' }, EMP);
  const note = await ok('POST', '/api/books/memory', { scope: 'party', ref: party.id, text: 'فقط سکه امامی می‌خرد' }, EMP);
  assert.equal(note.ref, party.id);
  assert.equal(await status('POST', '/api/books/memory', { scope: 'shop', text: 'هی' }, EMP), 400, 'too short');
  assert.equal(await status('POST', '/api/books/memory', { scope: 'party', ref: 'no-such', text: 'یادداشت بی‌صاحب' }, EMP), 400);
  assert.equal(await status('POST', '/api/books/memory', { scope: 'planet', text: 'دامنه ناشناخته' }, EMP), 400);
  const all = (await ok('GET', '/api/books/learn', null, EMP)).memory;
  assert.ok([shop.id, note.id].every((id) => JSON.stringify(all).includes(id)), 'both notes are listed');
  const other = await smsLogin(base, PHONE.emp3);
  assert.equal(await status('DELETE', `/api/books/memory/${shop.id}`, null, other), 400, 'another employee cannot remove it');
  await ok('DELETE', `/api/books/memory/${shop.id}`, null, MANAGER);
  await ok('DELETE', `/api/books/memory/${note.id}`, null, EMP);
  assert.ok(!JSON.stringify((await ok('GET', '/api/books/learn', null, EMP)).memory).includes(note.id));
});
