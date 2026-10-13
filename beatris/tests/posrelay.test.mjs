// spec 0035: a phone or tablet without a card reader asks the counter computer, through the server, to charge an exact
// amount. The counter claims requests one at a time, reports each step, and only it may; an approval is final and lands
// in the reconciliation log under the person who asked; time limits never turn a possible payment into «declined».
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
  // the seller on a phone (demo employee) and the counter computer (demo manager)
  const seller = await smsLogin(base, '09120000004');
  const counter = await smsLogin(base, '09120000002');
  return { db, call, ok, seller, counter };
}
const STATION = 'station-counter-1';
const rid = (n) => `relay-req-${String(n).padStart(4, '0')}`;

test('no counter online → refused at once; a counter seen in the last seconds → the request waits for it', async () => {
  const { call, ok, seller, counter } = await boot();
  const no = await call('POST', '/api/books/pos/requests', { id: rid(1), amount: 25_000_000 }, seller);
  assert.equal(no.status, 409);
  assert.match(no.body.error, /پیشخوان روشن نیست/);
  const hb = await ok('POST', '/api/books/pos/station', { id: STATION, name: 'پیشخوان اصلی', driver: 'sep', take: false }, counter);
  assert.equal(hb.request, null);
  assert.equal((await ok('GET', '/api/books/pos/station', null, seller)).online[0].name, 'پیشخوان اصلی');
  const r = await ok('POST', '/api/books/pos/requests', { id: rid(1), amount: 25_000_000 }, seller);
  assert.equal(r.state, 'pending');
  assert.equal(r.amount, 25_000_000);
  // the same id is the same request, never a second one
  const again = await ok('POST', '/api/books/pos/requests', { id: rid(1), amount: 99_000 }, seller);
  assert.equal(again.amount, 25_000_000);
  for (const [i, bad] of [999, 12.5, -5000, 'ده هزار', 1e13, null].entries()) assert.equal((await call('POST', '/api/books/pos/requests', { id: rid(2 + i), amount: bad }, seller)).status, 400, String(bad));
  assert.equal((await call('POST', '/api/books/pos/requests', { id: 'x', amount: 5000 }, seller)).status, 400);
});

test('the counter claims one request at a time, oldest first; every step reaches the phone; the approval is final and logged under the seller', async () => {
  const { db, call, ok, seller, counter } = await boot();
  await ok('POST', '/api/books/pos/station', { id: STATION, name: 'پیشخوان', take: false }, counter);
  await ok('POST', '/api/books/pos/requests', { id: rid(10), amount: 12_500_000 }, seller);
  await ok('POST', '/api/books/pos/requests', { id: rid(11), amount: 3_000_000 }, seller);
  const first = await ok('POST', '/api/books/pos/station', { id: STATION, name: 'پیشخوان' }, counter);
  assert.equal(first.request.id, rid(10), 'oldest first');
  assert.equal(first.request.amount, 12_500_000, 'the exact amount');
  assert.equal(first.request.state, 'connecting');
  // while one is open, the counter takes no second request
  const busy = await ok('POST', '/api/books/pos/station', { id: STATION, name: 'پیشخوان' }, counter);
  assert.equal(busy.request, null);
  assert.equal(busy.active.id, rid(10));
  assert.equal((await ok('GET', `/api/books/pos/requests/${rid(11)}`, null, seller)).state, 'pending');
  // only the counter that claimed it may report on it
  assert.equal((await call('POST', `/api/books/pos/requests/${rid(10)}/result`, { station: 'station-other-99', state: 'approved', rrn: '1' }, seller)).status, 409);
  await ok('POST', `/api/books/pos/requests/${rid(10)}/result`, { station: STATION, state: 'waiting' }, counter);
  assert.equal((await ok('GET', `/api/books/pos/requests/${rid(10)}`, null, seller)).state, 'waiting');
  const done = await ok('POST', `/api/books/pos/requests/${rid(10)}/result`, { station: STATION, state: 'approved', rrn: '863583063456', stan: '801912', card: '6037-****-****-1234', terminal: '12345678', code: '00', message: 'تراکنش موفق', driver: 'sep' }, counter);
  assert.equal(done.state, 'approved');
  const seen = await ok('GET', `/api/books/pos/requests/${rid(10)}`, null, seller);
  assert.deepEqual([seen.state, seen.rrn, seen.card, seen.terminal, seen.station], ['approved', '863583063456', '1234', '12345678', 'پیشخوان']);
  // final is final: a later report changes nothing
  await ok('POST', `/api/books/pos/requests/${rid(10)}/result`, { station: STATION, state: 'declined', code: '51' }, counter);
  assert.equal((await ok('GET', `/api/books/pos/requests/${rid(10)}`, null, seller)).state, 'approved');
  // the reconciliation log: the approved amount and RRN, under the seller, no document yet
  const log = await ok('GET', '/api/books/pos', null, seller);
  const row = log.items.find((x) => x.id === rid(10));
  const sellerId = db.get("SELECT id FROM users WHERE phone='09120000004'").id;
  assert.deepEqual([row.state, row.amount, row.rrn, row.userId, row.orphan], ['approved', 12_500_000, '863583063456', sellerId, true]);
  assert.ok(db.get("SELECT 1 FROM bk_log WHERE action='pos.approved' AND ref=?", rid(10)), 'the approval is in the event chain');
  // the next one is claimed now
  assert.equal((await ok('POST', '/api/books/pos/station', { id: STATION, name: 'پیشخوان' }, counter)).request.id, rid(11));
});

test('cancel: a pending request is cancelled at once; an open one passes the cancel to the counter', async () => {
  const { ok, seller, counter } = await boot();
  await ok('POST', '/api/books/pos/station', { id: STATION, name: 'پیشخوان', take: false }, counter);
  await ok('POST', '/api/books/pos/requests', { id: rid(20), amount: 5_000_000 }, seller);
  assert.equal((await ok('POST', `/api/books/pos/requests/${rid(20)}/cancel`, null, seller)).state, 'cancelled');
  assert.equal((await ok('POST', '/api/books/pos/station', { id: STATION, name: 'پیشخوان' }, counter)).request, null, 'a cancelled request is never claimed');
  await ok('POST', '/api/books/pos/requests', { id: rid(21), amount: 7_000_000 }, seller);
  await ok('POST', '/api/books/pos/station', { id: STATION, name: 'پیشخوان' }, counter);
  await ok('POST', `/api/books/pos/requests/${rid(21)}/result`, { station: STATION, state: 'waiting' }, counter);
  const asked = await ok('POST', `/api/books/pos/requests/${rid(21)}/cancel`, null, seller);
  assert.equal(asked.state, 'waiting', 'the terminal may already have the card: only the counter can stop it');
  const hb = await ok('POST', '/api/books/pos/station', { id: STATION, name: 'پیشخوان' }, counter);
  assert.equal(hb.active.cancel, true, 'the counter sees the cancel');
  const r = await ok('POST', `/api/books/pos/requests/${rid(21)}/result`, { station: STATION, state: 'cancelled', message: 'لغو روی کارتخوان' }, counter);
  assert.equal(r.state, 'cancelled');
});

test('time: an unclaimed request expires; a counter that goes silent leaves «unknown», never «declined»', async () => {
  const { db, ok, seller, counter } = await boot();
  await ok('POST', '/api/books/pos/station', { id: STATION, name: 'پیشخوان', take: false }, counter);
  await ok('POST', '/api/books/pos/requests', { id: rid(30), amount: 2_000_000 }, seller);
  db.run('UPDATE bk_pos_req SET expires_at=? WHERE id=?', Date.now() - 1, rid(30));
  const ex = await ok('GET', `/api/books/pos/requests/${rid(30)}`, null, seller);
  assert.equal(ex.state, 'expired');
  assert.match(ex.message, /برنداشت/);
  await ok('POST', '/api/books/pos/requests', { id: rid(31), amount: 4_000_000 }, seller);
  await ok('POST', '/api/books/pos/station', { id: STATION, name: 'پیشخوان' }, counter);
  db.run('UPDATE bk_pos_req SET updated_at=? WHERE id=?', Date.now() - 46_000, rid(31));
  const lost = await ok('GET', `/api/books/pos/requests/${rid(31)}`, null, seller);
  assert.equal(lost.state, 'unknown');
  assert.match(lost.message, /رسید کارتخوان/);
  const log = await ok('GET', '/api/books/pos', null, seller);
  assert.equal(log.items.find((x) => x.id === rid(31)).state, 'unknown', 'the log keeps it as unknown for reconciliation');
  // a counter not seen for a while is offline: new requests are refused plainly
  db.run('UPDATE bk_pos_station SET seen_at=?', Date.now() - 9_000);
  const off = await (await fetch(`${'http://127.0.0.1:' + servers.at(-1).address().port}/api/books/pos/requests`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${seller}` }, body: JSON.stringify({ id: rid(32), amount: 5000 }) })).json();
  assert.match(off.error, /پیشخوان روشن نیست/);
});
