// spec 0038: each person's way of working (boss, operator, seller, staff) — defaults from the role, their own choice
// kept, a manager may set a colleague's, a profile never opens what the role does not allow.
// spec 0037: the customer's quick file for the live sales desk.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.mjs';
import { createServer } from '../server/index.mjs';
import { seedUsers } from '../server/api.mjs';
import { smsLogin } from './helpers/login.mjs';

const servers = [];
after(() => servers.forEach((s) => s.close()));
async function boot() {
  const db = openDb(':memory:');
  seedUsers(db, {}, true);
  const server = createServer({ db, secret: 'test-secret-0123456789', demo: true, quiet: true, tenantsDir: ':memory:', otpOpts: { silentDelay: () => 0 }, marketOpts: { fetchImpl: async () => new Response('{}', { status: 404 }), defaultMode: 'off' } });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  servers.push(server);
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, body, token) => {
    const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  const ok = async (...a) => {
    const r = await call(...a);
    assert.ok(r.status < 300, `${a[0]} ${a[1]} → ${r.status} ${JSON.stringify(r.body)}`);
    return r.body;
  };
  return { db, base, call, ok };
}

test('defaults come from the role; the person’s own choice is kept; a bad value is refused', async () => {
  const { base, call, ok } = await boot();
  const owner = await smsLogin(base, '09120000001');
  const seller = await smsLogin(base, '09120000004');
  const coach = await smsLogin(base, '09120000003');
  assert.deepEqual([(await ok('GET', '/api/me', null, owner)).workspace.profile, (await ok('GET', '/api/me', null, seller)).workspace.profile, (await ok('GET', '/api/me', null, coach)).workspace.profile], ['boss', 'seller', 'staff']);
  const w0 = (await ok('GET', '/api/me', null, seller)).workspace;
  assert.equal(w0.start, '/books/sell');
  assert.equal(w0.chosen, false);
  const w = (await ok('PUT', '/api/me/workspace', { profile: 'operator' }, seller)).workspace;
  assert.deepEqual([w.profile, w.density, w.start, w.chosen], ['operator', 'compact', '/books/desk', true]);
  assert.ok(w.pins.includes('desk'), 'a new profile brings its own pins');
  const w2 = (await ok('PUT', '/api/me/workspace', { density: 'comfort', pins: ['desk', 'day', 'sell'] }, seller)).workspace;
  assert.deepEqual([w2.profile, w2.density, w2.pins], ['operator', 'comfort', ['desk', 'day', 'sell']]);
  assert.deepEqual((await ok('GET', '/api/me', null, seller)).workspace.pins, ['desk', 'day', 'sell'], 'kept for the next sign-in');
  for (const bad of [{ profile: 'king' }, { density: 'tiny' }, { pins: ['desk', 'nowhere'] }, { pins: ['sell', 'screen', 'desk', 'new', 'reserved', 'parties', 'products', 'day', 'find'] }]) assert.equal((await call('PUT', '/api/me/workspace', bad, seller)).status, 400, JSON.stringify(bad));
  // back to the role's default
  assert.equal((await ok('PUT', '/api/me/workspace', { profile: null }, seller)).workspace.profile, 'seller');
});

test('a manager sets a colleague’s workspace; a seller may not; nobody but the owner sets the owner’s', async () => {
  const { db, base, call, ok } = await boot();
  const manager = await smsLogin(base, '09120000002');
  const seller = await smsLogin(base, '09120000004');
  const id = (phone) => db.get('SELECT id FROM users WHERE phone=?', phone).id;
  const set = await ok('PUT', `/api/team/${id('09120000005')}/workspace`, { profile: 'operator', density: 'compact' }, manager);
  assert.equal(set.workspace.profile, 'operator');
  assert.equal((await ok('GET', '/api/team', null, manager)).members.find((m) => m.phone === '09120000005').workspace.profile, 'operator');
  assert.equal((await call('PUT', `/api/team/${id('09120000005')}/workspace`, { profile: 'boss' }, seller)).status, 403);
  assert.equal((await call('PUT', `/api/team/${id('09120000001')}/workspace`, { profile: 'seller' }, manager)).status, 403);
  // a seller who picks the boss's layout still cannot open what a seller may not
  await ok('PUT', '/api/me/workspace', { profile: 'boss' }, seller);
  const me = await ok('GET', '/api/me', null, seller);
  assert.equal(me.workspace.profile, 'boss');
  assert.ok(!me.caps.includes('books.admin'), 'a profile grants nothing');
});

test('the customer’s quick file: purchases, favourite groups, usual weight, balance and the last pieces', async () => {
  const { ok, base } = await boot();
  const seller = await smsLogin(base, '09120000004');
  const party = await ok('POST', '/api/books/parties', { name: 'شیرین کیانی', mobile: '09121231234' }, seller);
  const pid = party.id ?? party.party?.id;
  const sale = (lines, payments = []) => ok('POST', '/api/books/docs', { type: 'sale', date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran' }).format(new Date()), partyId: pid, lines, payments, status: 'final' }, seller);
  const ring = { kind: 'jewel', tpl: 'ring-w', title: 'انگشتر زنانه', weight: 3.4, fineness: 750, p750: 2_400_000, ojratMode: 'pct', ojrat: 18, profitPct: 7 };
  const ear = { kind: 'jewel', tpl: 'er-stud', title: 'گوشواره میخی', weight: 2.2, fineness: 750, p750: 2_400_000, ojratMode: 'pct', ojrat: 20, profitPct: 7 };
  const a = await sale([ring]);
  await sale([ring, ear], [{ method: 'cash', dir: 'in', amount: 1_000_000 }]);
  const f = await ok('GET', `/api/books/parties/${pid}/profile`, null, seller);
  assert.equal(f.party.name, 'شیرین کیانی');
  assert.equal(f.purchases, 2);
  assert.equal(f.spent, a.calc.sales + (await ok('GET', '/api/books/docs?type=sale', null, seller)).items.filter((d) => d.partyId === pid && d.id !== a.id)[0].sales);
  assert.deepEqual(f.favorites.map((x) => [x.group, x.n]), [['ring', 2], ['ear', 1]]);
  assert.deepEqual(f.weightRange, [2.2, 3.4]);
  assert.equal(f.fineness, 750);
  assert.equal(f.recent.length, 3);
  assert.ok(f.balance.IRR > 0, 'what is still owed shows');
  assert.equal(f.lastVisit, a.date);
});
