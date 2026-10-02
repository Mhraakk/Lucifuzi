import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.mjs';
import { createServer } from '../server/index.mjs';
import { seedUsers } from '../server/api.mjs';
import { comparePeer, normCode } from '../server/peers.mjs';

let server, base, V;
const call = async (method, path, body, token) => {
  const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const ok = async (...a) => {
  const r = await call(...a);
  assert.ok(r.status < 300, `${a[0]} ${a[1]} → ${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
};

before(async () => {
  const db = openDb(':memory:');
  seedUsers(db, {}, true);
  server = createServer({ db, secret: 'test-secret-0123456789', demo: true, quiet: true, tenantsDir: ':memory:', marketOpts: { fetchImpl: async () => new Response('{}', { status: 404 }), defaultMode: 'off' } });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  V = (await ok('POST', '/api/auth/login', { phone: '09120000001', pin: '1234' })).token;
});
after(() => server.close());

test('pairing: opposite amounts of the same unit within the date window', () => {
  const mine = { balance: { G750: 10, IRR: 2e9 }, lines: [{ date: '2026-09-01', unit: 'G750', amt: 10 }, { date: '2026-09-02', unit: 'IRR', amt: 2e9 }] };
  const theirs = { balance: { G750: -10.0004 }, lines: [{ date: '2026-09-03', unit: 'G750', amt: -10.0004 }] };
  const c = comparePeer(mine, theirs);
  assert.equal(c.agree, false);
  assert.equal(c.matched, 1);
  assert.deepEqual(c.units.find((u) => u.unit === 'G750').diff, 0); // within rounding of the gram rule
  assert.equal(c.units.find((u) => u.unit === 'IRR').diff, 2e9);
  assert.equal(c.onlyMine.length, 1);
  assert.equal(c.onlyMine[0].unit, 'IRR');
  // more than three days apart: not the same entry
  assert.equal(comparePeer({ balance: {}, lines: [{ date: '2026-09-01', unit: 'IRR', amt: 5 }] }, { balance: {}, lines: [{ date: '2026-09-09', unit: 'IRR', amt: -5 }] }).matched, 0);
  assert.equal(normCode(' abcd-efgh '), 'ABCDEFGH');
});

test('تطبیق با همکار: دو فروشگاه حساب متقابل را زنده مقایسه می‌کنند', async () => {
  const made = await ok('POST', '/api/vendor/tenants', { name: 'زرگری الماس', plan: 'base', ownerName: 'نادر', username: 'nader' }, V);
  const T = (await ok('POST', '/api/auth/login', { login: 'nader', password: made.password })).token;
  const p1 = (await ok('POST', '/api/books/parties', { name: 'زرگری الماس (همکار)' }, V)).party ?? (await ok('GET', '/api/books/parties', null, V)).items.find((p) => p.name === 'زرگری الماس (همکار)');
  const p2 = (await ok('POST', '/api/books/parties', { name: 'خانه تاج (همکار)' }, T)).party ?? (await ok('GET', '/api/books/parties', null, T)).items.find((p) => p.name === 'خانه تاج (همکار)');
  assert.ok(p1?.id && p2?.id);

  // only owner/manager; the code is made in one shop and typed in the other
  const emp = (await ok('POST', '/api/auth/login', { phone: '09120000003', pin: '1234' })).token;
  assert.equal((await call('POST', '/api/peers/invite', { partyId: p1.id }, emp)).status, 403);
  assert.equal((await call('GET', '/api/peers', null)).status, 401);
  const inv = await ok('POST', '/api/peers/invite', { partyId: p1.id }, V);
  assert.match(inv.code, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.equal((await call('POST', '/api/peers/accept', { code: inv.code, partyId: p1.id }, V)).status, 400);
  assert.equal((await call('POST', '/api/peers/accept', { code: 'AAAA-BBBB', partyId: p2.id }, T)).status, 404);
  const link = await ok('POST', '/api/peers/accept', { code: inv.code.toLowerCase(), partyId: p2.id }, T);
  assert.equal(link.peerShop, 'خانه سکه و شمش تاج');
  assert.equal(link.compare.agree, true);
  assert.equal((await call('POST', '/api/peers/accept', { code: inv.code, partyId: p2.id }, T)).status, 404); // used once
  assert.equal((await call('POST', '/api/peers/invite', { partyId: p1.id }, V)).status, 409); // already linked

  // the main shop gives 10 g as goods on account; the other shop books receiving it: the books agree
  await ok('POST', '/api/books/docs', { type: 'trade', partyId: p1.id, lines: [{ kind: 'melt', dir: 'out', weight: 10, fineness: 750, priced: false }] }, V);
  await ok('POST', '/api/books/docs', { type: 'trade', partyId: p2.id, lines: [{ kind: 'melt', dir: 'in', weight: 10, fineness: 750, priced: false }] }, T);
  let mine = (await ok('GET', '/api/peers', null, V)).items[0];
  assert.equal(mine.compare.agree, true);
  assert.deepEqual(mine.compare.units.map((u) => [u.unit, u.mine, u.theirs, u.diff]), [['G750', 10, -10, 0]]);

  // the main shop sells two coins on credit; the other shop has not booked the purchase yet
  await ok('POST', '/api/books/docs', { type: 'trade', partyId: p1.id, lines: [{ kind: 'coin', dir: 'out', coin: 'emami', count: 2, price: 1000000000 }] }, V);
  const full = await ok('GET', `/api/peers/${mine.id}`, null, V);
  assert.equal(full.compare.agree, false);
  assert.equal(full.compare.units.find((u) => u.unit === 'IRR').diff, 2000000000);
  assert.equal(full.compare.matched, 1);
  assert.equal(full.compare.onlyMine.length, 1);
  assert.equal(full.compare.onlyMine[0].amt, 2000000000);
  assert.match(full.compare.onlyMine[0].track, /^M\d{4}-\d{5}$/);
  // …seen from the other side: the missing entry is in the colleague's book
  const theirs = await ok('GET', `/api/peers/${mine.id}`, null, T);
  assert.equal(theirs.compare.onlyTheirs.length, 1);
  assert.equal(theirs.compare.units.find((u) => u.unit === 'IRR').diff, 2000000000); // mine + theirs: the same gap seen from both sides
  // booked: agree again
  await ok('POST', '/api/books/docs', { type: 'trade', partyId: p2.id, lines: [{ kind: 'coin', dir: 'in', coin: 'emami', count: 2, price: 1000000000 }] }, T);
  assert.equal((await ok('GET', `/api/peers/${mine.id}`, null, T)).compare.agree, true);

  // either side can end the link
  await ok('DELETE', `/api/peers/${mine.id}`, null, T);
  assert.equal((await ok('GET', '/api/peers', null, V)).items.length, 0);
  assert.equal((await call('GET', `/api/peers/${mine.id}`, null, V)).status, 404);
});
