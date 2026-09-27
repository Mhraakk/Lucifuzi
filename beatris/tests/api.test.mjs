import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.mjs';
import { createServer } from '../server/index.mjs';
import { seedUsers } from '../server/api.mjs';
import { QUESTIONS } from '../content/index.mjs';

let server, base;
const call = async (method, path, body, token) => {
  const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json() };
};
const login = async (phone) => (await call('POST', '/api/auth/login', { phone, pin: '۱۲۳۴' })).body.token;

before(async () => {
  const db = openDb(':memory:');
  seedUsers(db, {}, true);
  server = createServer({ db, secret: 'test-secret-0123456789', demo: true, quiet: true });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

test('ورود: رمز غلط ۴۰۱، ارقام فارسی پذیرفته', async () => {
  assert.equal((await call('POST', '/api/auth/login', { phone: '09120000004', pin: '0000' })).status, 401);
  assert.ok(await login('۰۹۱۲۰۰۰۰۰۰۴'));
  assert.equal((await call('GET', '/api/me')).status, 401);
});
test('پرسش درس: بررسی سمت سرور', async () => {
  const t = await login('09120000004');
  const l = await call('GET', '/api/lessons/f2', null, t);
  assert.equal(l.status, 200);
  assert.equal(l.body.lesson.quiz[0].n, undefined);
  const r = await call('POST', '/api/quiz/answer', { questionId: 'f2q1', answer: '۵۰٬۱۴۲٬۰۰۰' }, t);
  assert.equal(r.body.correct, true);
  const w = await call('POST', '/api/quiz/answer', { questionId: 'f2q3', answer: 0 }, t);
  assert.equal(w.body.correct, false);
  assert.equal(w.body.answer, 2);
});
test('آزمون: قفل تا پایان درس‌ها، برگه امضاشده، گواهی', async () => {
  const t = await login('09120000005');
  assert.equal((await call('GET', '/api/exams/c-price', null, t)).status, 409);
  for (const id of ['f1', 'f2', 'f3', 'f4']) await call('POST', `/api/lessons/${id}/complete`, null, t);
  const ex = (await call('GET', '/api/exams/c-price', null, t)).body;
  const answers = Object.fromEntries(ex.questions.map((q) => { const Q = QUESTIONS.get(q.id); return [q.id, Q.o ? Q.a : Q.n]; }));
  const bad = await call('POST', '/api/exams/c-price', { token: ex.token + 'x', answers }, t);
  assert.equal(bad.status, 400);
  const r = (await call('POST', '/api/exams/c-price', { token: ex.token, answers }, t)).body;
  assert.equal(r.score, 100);
  assert.match(r.certificate, /^BTR-/);
  const other = await login('09120000006');
  assert.equal((await call('POST', '/api/exams/c-price', { token: ex.token, answers }, other)).status, 400);
});
test('نقش‌ها: فروشنده به تیم دسترسی ندارد؛ مربی نمی‌تواند کاربر بسازد', async () => {
  const e = await login('09120000004');
  assert.equal((await call('GET', '/api/team', null, e)).status, 403);
  const tr = await login('09120000003');
  assert.equal((await call('GET', '/api/team', null, tr)).status, 200);
  assert.equal((await call('POST', '/api/team', { name: 'x y', phone: '09121111111', role: 'employee', pin: '1111' }, tr)).status, 403);
  const m = await login('09120000002');
  assert.equal((await call('POST', '/api/team', { name: 'همکار تازه', phone: '09121111111', role: 'owner', pin: '1111' }, m)).status, 403);
  assert.equal((await call('POST', '/api/team', { name: 'همکار تازه', phone: '09121111111', role: 'employee', pin: '1111' }, m)).status, 200);
});
test('کار عملی: درخواست، عدم تأیید خود، تأیید مدیر', async () => {
  const e = await login('09120000004');
  await call('POST', '/api/floor/ft-scale', { note: 'انجام شد' }, e);
  const m = await login('09120000002');
  const q = (await call('GET', '/api/floor-queue', null, m)).body.items;
  const it = q.find((x) => x.taskId === 'ft-scale');
  assert.ok(it);
  assert.equal((await call('POST', `/api/floor-queue/${it.userId}/ft-scale`, { verdict: 'verified' }, m)).status, 200);
  const me = (await call('GET', '/api/me', null, e)).body;
  assert.equal(me.progress.floor.find((f) => f.taskId === 'ft-scale').status, 'verified');
});
test('غیرفعال‌سازی و تغییر رمز توکن قبلی را باطل می‌کند', async () => {
  const m = await login('09120000002');
  const t = await login('09120000006');
  const team = (await call('GET', '/api/team', null, m)).body.members;
  const ali = team.find((x) => x.phone === '09120000006');
  await call('PATCH', `/api/team/${ali.id}`, { pin: '5678' }, m);
  assert.equal((await call('GET', '/api/me', null, t)).status, 401);
});
test('سناریو و کارت و تنظیمات', async () => {
  const t = await login('09120000004');
  const s = await call('POST', '/api/scenarios/sc-switch/submit', { choices: { s1: 'b', s2: 'a', s3: 'a' } }, t);
  assert.equal(s.body.violations, 1);
  const cards = (await call('GET', '/api/cards/due', null, t)).body.cards;
  assert.ok(cards.length > 0);
  const rv = await call('POST', '/api/cards/review', { cardId: cards[0].id, grade: 'good' }, t);
  assert.equal(rv.body.box, 1);
  const m = await login('09120000002');
  const p = await call('PUT', '/api/settings/pricing', { p750: 9_100_000, vatPct: 10 }, m);
  assert.equal(p.body.pricing.p750, 9_100_000);
  assert.equal((await call('PUT', '/api/settings/pricing', { p750: 1 }, t)).status, 403);
});
test('رمز تا ۱۲ رقم؛ خاموش شدن دمو حساب‌های نمایشی را غیرفعال می‌کند', async () => {
  const db = openDb(':memory:');
  seedUsers(db, {}, true);
  seedUsers(db, { BEATRIS_OWNER_PHONE: '+989121234567', BEATRIS_OWNER_PIN: '123456789' }, false);
  const s = createServer({ db, secret: 'test-secret-0123456789', demo: false, quiet: true });
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  const b = `http://127.0.0.1:${s.address().port}`;
  const post = (body) => fetch(b + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.status);
  assert.equal(await post({ phone: '09121234567', pin: '123456789' }), 200);
  assert.equal(await post({ phone: '09120000001', pin: '1234' }), 401);
  s.close();
});
test('گالری طرح: ذخیره، فهرست، باز کردن، حذف با مجوز', async () => {
  const e = await login('09120000004');
  const m = await login('09120000002');
  const thumb = 'data:image/png;base64,iVBORw0KGgo=';
  const project = { parts: [{ type: 'band', params: { size: 54 } }], scene: {} };
  assert.equal((await call('POST', '/api/designs', { title: 'x', thumb, project }, e)).status, 400);
  assert.equal((await call('POST', '/api/designs', { title: 'حلقه نمونه', thumb: 'javascript:alert(1)', project }, e)).status, 400);
  assert.equal((await call('POST', '/api/designs', { title: 'حلقه نمونه', thumb, project: { parts: [] } }, e)).status, 400);
  const c = await call('POST', '/api/designs', { title: 'حلقه نمونه', summary: '۵ گرم', thumb, project }, e);
  assert.equal(c.status, 200);
  const list = (await call('GET', '/api/designs', null, m)).body.designs;
  assert.ok(list.some((d) => d.id === c.body.id && d.author));
  const one = (await call('GET', `/api/designs/${c.body.id}`, null, m)).body;
  assert.equal(one.project.parts[0].type, 'band');
  const other = await login('09120000005');
  assert.equal((await call('DELETE', `/api/designs/${c.body.id}`, null, other)).status, 403);
  assert.equal((await call('DELETE', `/api/designs/${c.body.id}`, null, m)).status, 200);
  assert.equal((await call('GET', `/api/designs/${c.body.id}`, null, m)).status, 404);
});
