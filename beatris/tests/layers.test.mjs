import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.mjs';
import { createServer } from '../server/index.mjs';
import { seedUsers } from '../server/api.mjs';
import { capsOf, can } from '../server/rbac.mjs';
import { createFlags } from '../server/flags.mjs';
import { backtest } from '../public/js/backtest.mjs';

let server, base, db, V, M, E;
const call = async (method, p, body, token) => {
  const r = await fetch(base + p, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const ok = async (...a) => {
  const r = await call(...a);
  assert.ok(r.status < 300, `${a[0]} ${a[1]} → ${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
};
before(async () => {
  db = openDb(':memory:');
  seedUsers(db, {}, true);
  server = createServer({ db, secret: 'test-secret-0123456789', demo: true, quiet: true, tenantsDir: ':memory:', marketOpts: { fetchImpl: async () => new Response('{}', { status: 404 }), defaultMode: 'off' } });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  V = (await ok('POST', '/api/auth/login', { phone: '09120000001', pin: '1234' })).token;
  M = (await ok('POST', '/api/auth/login', { phone: '09120000002', pin: '1234' })).token;
  E = (await ok('POST', '/api/auth/login', { phone: '09120000003', pin: '1234' })).token;
});
after(() => {
  server.close();
  server.bus.stop();
});

test('rbac: one matrix; vendor powers only for the owner of the main shop', async () => {
  assert.deepEqual(capsOf('employee'), ['books.use']);
  assert.deepEqual(capsOf('trainer'), ['books.use', 'staff.view']);
  assert.deepEqual(capsOf('manager'), ['books.use', 'staff.view', 'books.admin', 'ai.keys', 'peers.manage']);
  assert.ok(capsOf('owner', { main: true }).includes('ops.view'));
  assert.ok(!capsOf('owner').includes('ops.view'));
  assert.deepEqual(capsOf('hacker'), []);
  assert.equal(can({ role: 'manager', active: 0 }, 'books.use'), false);
  assert.ok((await ok('GET', '/api/me', null, V)).caps.includes('vendor.console'));
  assert.deepEqual((await ok('GET', '/api/me', null, E)).caps, ['books.use', 'staff.view']); // demo user 3 is a trainer
  assert.equal((await call('GET', '/api/ops/flags', null, M)).status, 403);
});

test('flags: default → global → per shop, enforced on the server', async () => {
  const f = createFlags({ db: openDb(':memory:') });
  assert.equal(f.on('t_x', 'peers'), true);
  f.set('all', 'peers', false);
  assert.equal(f.on('t_x', 'peers'), false);
  f.set('t_x', 'peers', true);
  assert.equal(f.on('t_x', 'peers'), true);
  f.set('t_x', 'peers', null);
  assert.equal(f.on('t_x', 'peers'), false);
  assert.throws(() => f.set('all', 'nope', true), /ناشناخته/);
  // through the vendor's ops API
  const shop = await ok('POST', '/api/vendor/tenants', { name: 'فروشگاه پرچم', username: 'flagshop' }, V);
  const T = (await ok('POST', '/api/auth/login', { login: 'flagshop', password: shop.password })).token;
  assert.equal((await ok('GET', '/api/me', null, T)).flags.peers, true);
  assert.equal((await call('PUT', '/api/ops/flags', { scope: 't_000000000000', key: 'peers', value: false }, V)).status, 400);
  await ok('PUT', '/api/ops/flags', { scope: shop.tenant.id, key: 'peers', value: false }, V);
  assert.equal((await ok('GET', '/api/me', null, T)).flags.peers, false);
  assert.equal((await call('GET', '/api/peers', null, T)).status, 403);
  assert.equal((await call('GET', '/api/peers', null, V)).status, 200); // the other shops are untouched
  const l = await ok('GET', '/api/ops/flags', null, V);
  assert.deepEqual(l.shops.map((s) => s.id), [shop.tenant.id]);
  assert.deepEqual(l.overrides, { [shop.tenant.id]: { peers: false } });
  await ok('PUT', '/api/ops/flags', { scope: shop.tenant.id, key: 'peers', value: null }, V);
  assert.equal((await ok('GET', '/api/me', null, T)).flags.peers, true);
});

test('replay: a clean book has no differences; a posting changed by hand is found with its document', async () => {
  const p = await ok('POST', '/api/books/parties', { name: 'مشتری بازپخش' }, E);
  const pid = p.party?.id ?? p.id;
  const d = await ok('POST', '/api/books/docs', { type: 'trade', partyId: pid, lines: [{ kind: 'melt', dir: 'in', weight: 10, fineness: 750, mazaneh: 400000000 }], payments: [{ method: 'cash', dir: 'out', amount: 500000000 }] }, E);
  await ok('POST', '/api/books/docs', { type: 'trade', partyId: pid, lines: [{ kind: 'coin', dir: 'out', coin: 'emami', count: 1, price: 1000000000 }] }, E);
  assert.equal((await call('GET', '/api/books/replay', null, E)).status, 403);
  const clean = await ok('GET', '/api/books/replay', null, M);
  assert.equal(clean.ok, true, JSON.stringify(clean.diffs));
  assert.ok(clean.docs >= 2);
  db.run("UPDATE bk_postings SET amt=amt+1 WHERE src=? AND acct='gold'", d.id);
  db.run("INSERT INTO bk_postings(src,acct,unit,amt,date) VALUES ('ghost','cash:x','IRR',5,'2026-01-01')");
  const bad = await ok('GET', '/api/books/replay', null, M);
  assert.equal(bad.ok, false);
  assert.equal(bad.count, 2);
  assert.deepEqual(bad.diffs.map((x) => [x.doc === d.id ? 'doc' : x.doc, x.acct, x.status]).sort(), [['doc', 'gold', 'final'], ['ghost', 'cash:x', 'missing']]);
  assert.equal(bad.diffs.find((x) => x.doc === d.id).track, d.track);
});

test('backtest: next-open execution, fees counted, compared with holding', async () => {
  const bars = [];
  for (let i = 0; i < 120; i++) {
    const c = 100 + (i < 40 ? -i * 0.5 : (i - 40) * 1.5);
    bars.push({ d: `2026-01-${String(i).padStart(3, '0')}`, o: c - 0.2, h: c + 1, l: c - 1, c });
  }
  const r = backtest(bars, { strategy: 'sma', fast: 5, slow: 20, fee: 0 });
  assert.ok(r.trades >= 1);
  const first = r.list[0];
  const sigDay = bars.findIndex((b) => b.d === first.in) - 1;
  assert.ok(sigDay >= 19, 'entry happens after the slow average exists');
  assert.equal(first.buy, bars[sigDay + 1].o, 'bought at the next open');
  assert.ok(r.totalReturn > 0);
  const withFee = backtest(bars, { strategy: 'sma', fast: 5, slow: 20, fee: 0.01 });
  assert.ok(withFee.totalReturn < r.totalReturn);
  assert.ok(r.maxDrawdown >= 0 && r.maxDrawdown < 1);
  assert.throws(() => backtest(bars, { strategy: 'sma', fast: 20, slow: 5 }), /بلندتر/);
  assert.throws(() => backtest(bars, { strategy: 'x' }), /ناشناخته/);
  const api = await ok('GET', '/api/market/backtest?symbol=mesghal&strategy=rsi', null, E);
  assert.equal(api.symbol, 'mesghal');
  assert.equal(api.equity.length, api.days);
  assert.equal((await call('GET', '/api/market/backtest?symbol=nope', null, E)).status, 400);
});

test('market stream: the board at once, then every tick; auth and flag enforced', async () => {
  assert.equal((await fetch(`${base}/api/market/stream`)).status, 401);
  const ctl = new AbortController();
  const r = await fetch(`${base}/api/market/stream`, { headers: { authorization: `Bearer ${E}` }, signal: ctl.signal });
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /text\/event-stream/);
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  const next = async () => {
    while (!buf.includes('\n\n')) buf += dec.decode((await reader.read()).value, { stream: true });
    const i = buf.indexOf('\n\n');
    const ev = buf.slice(0, i);
    buf = buf.slice(i + 2);
    return { event: /event: (\S+)/.exec(ev)?.[1], data: JSON.parse(/data: (.*)/.exec(ev)[1]) };
  };
  const first = await next();
  assert.equal(first.event, 'board');
  assert.ok(Array.isArray(first.data.items));
  server.bus.publish('market.tick', { at: 'x', board: { items: [{ id: 'mesghal', c: 123 }] } });
  const second = await next();
  assert.equal(second.data.items[0].c, 123);
  assert.equal(server.streams.size, 1);
  ctl.abort();
  await new Promise((res) => setTimeout(res, 50));
  assert.equal(server.streams.size, 0);
  await ok('PUT', '/api/ops/flags', { scope: 'all', key: 'market.stream', value: false }, V);
  assert.equal((await fetch(`${base}/api/market/stream`, { headers: { authorization: `Bearer ${E}` } })).status, 403);
  await ok('PUT', '/api/ops/flags', { scope: 'all', key: 'market.stream', value: null }, V);
});
