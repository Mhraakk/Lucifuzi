import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openDb } from '../server/db.mjs';
import { backupAll, listBackups } from '../server/backup.mjs';
import { createMetrics, routeKey, quantile } from '../server/metrics.mjs';
import { createCache } from '../server/cache.mjs';

test('backup: a consistent, checked copy of each database; only the newest are kept', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bk-'));
  try {
    const a = openDb(':memory:');
    a.run("INSERT INTO settings(key,value_json,updated_at) VALUES ('probe','{\"v\":42}','2026-01-01')");
    const b = openDb(':memory:');
    let t = Date.parse('2026-09-01T10:00:00Z');
    for (let i = 0; i < 4; i++) {
      const r = backupAll({ dbs: [['main', a], ['t_0123456789ab', b]], dir, keep: 3, clock: () => t });
      assert.deepEqual(r.files.map((f) => [f.name, f.integrity]), [['main', 'ok'], ['t_0123456789ab', 'ok']]);
      t += 864e5;
    }
    const list = listBackups(dir);
    assert.equal(list.length, 3);
    assert.equal(list[0].stamp, '20260904T100000Z');
    const copy = new DatabaseSync(path.join(dir, list[0].stamp, 'main.db'), { readOnly: true });
    assert.equal(JSON.parse(copy.prepare("SELECT value_json FROM settings WHERE key='probe'").get().value_json).v, 42);
    copy.close();
    assert.throws(() => backupAll({ dbs: [['../x', a]], dir }), /bad backup name/);
    assert.ok(readdirSync(dir).length >= 3);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('metrics: ids folded, percentiles, error counts', () => {
  assert.equal(routeKey('GET', '/api/books/parties/3f2a9b1c-1111-4222-8333-944455556666'), 'GET /api/books/parties/:id');
  assert.equal(routeKey('GET', '/api/books/close/2026-09-01/verify'), 'GET /api/books/close/2026-09-01/verify');
  assert.equal(routeKey('GET', '/api/public/statement/main~abcdefghijklmnopqrstuvwx'), 'GET /api/public/statement/:id');
  assert.equal(quantile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.95), 10);
  assert.equal(quantile([1, 2, 3, 4], 0.5), 2);
  const m = createMetrics();
  for (let i = 1; i <= 100; i++) m.record('GET', `/api/books/docs/${i}`, i === 7 ? 500 : i < 5 ? 404 : 200, i);
  m.inc('ai.calls', 2);
  const s = m.snapshot();
  assert.equal(s.routes[0].route, 'GET /api/books/docs/:id');
  assert.equal(s.routes[0].count, 100);
  assert.equal(s.routes[0].p50, 50);
  assert.equal(s.routes[0].p95, 95);
  assert.equal(s.routes[0].errors5xx, 1);
  assert.equal(s.routes[0].errors4xx, 4);
  assert.equal(s.errorRate5xx, 0.01);
  assert.equal(s.counters['ai.calls'], 2);
});

test('cache: ttl expiry and LRU bound', () => {
  let t = 0;
  const c = createCache({ max: 2, ttl: 100, clock: () => t });
  c.set('a', 1);
  c.set('b', 2);
  assert.equal(c.get('a'), 1); // a is now the newest
  c.set('c', 3); // evicts b
  assert.equal(c.get('b'), undefined);
  t = 150;
  assert.equal(c.get('a'), undefined);
  let built = 0;
  assert.equal(c.wrap('k', () => ++built), 1);
  assert.equal(c.wrap('k', () => ++built), 1);
  assert.equal(built, 1);
});

test('gateway + ops: request id, timing, per-IP ceiling, deep health, vendor-only ops, backup of every shop', async () => {
  const { createServer } = await import('../server/index.mjs');
  const { seedUsers } = await import('../server/api.mjs');
  const dir = mkdtempSync(path.join(tmpdir(), 'ops-'));
  const db = openDb(dir, 'main.db');
  seedUsers(db, {}, true);
  const server = createServer({ db, secret: 'test-secret-0123456789', demo: true, quiet: true, rateLimit: 40, marketOpts: { fetchImpl: async () => new Response('{}', { status: 404 }), defaultMode: 'off' } });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, p, body, token, headers = {}) => {
    const r = await fetch(base + p, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
    return { r, body: await r.json().catch(() => null) };
  };
  try {
    const V = (await call('POST', '/api/auth/login', { phone: '09120000001', pin: '1234' })).body.token;
    const M = (await call('POST', '/api/auth/login', { phone: '09120000002', pin: '1234' })).body.token;
    // request id: echoed when well-formed, generated otherwise; also in error bodies
    const a = await call('GET', '/api/me', null, V, { 'x-request-id': 'trace-12345678' });
    assert.equal(a.r.headers.get('x-request-id'), 'trace-12345678');
    assert.match(a.r.headers.get('server-timing'), /^app;dur=\d+(\.\d)?$/);
    const e = await call('GET', '/api/books/docs/nope', null, V, { 'x-request-id': 'bad id!' });
    assert.equal(e.r.status, 404);
    assert.match(e.body.requestId, /^[0-9a-f-]{36}$/);
    assert.equal(e.r.headers.get('x-request-id'), e.body.requestId);
    // deep health
    const h = await call('GET', '/api/health?deep=1');
    assert.equal(h.r.status, 200);
    assert.equal(h.body.db, 'ok');
    assert.equal(h.body.feed, 'off');
    assert.equal(h.body.backup, null);
    // ops: vendor only
    assert.equal((await call('GET', '/api/ops/metrics', null, M)).r.status, 403);
    assert.equal((await call('GET', '/api/ops/metrics')).r.status, 401);
    const shop = await call('POST', '/api/vendor/tenants', { name: 'فروشگاه دوم', username: 'second' }, V);
    const T = (await call('POST', '/api/auth/login', { login: 'second', password: shop.body.password })).body.token;
    assert.equal((await call('GET', '/api/ops/metrics', null, T)).r.status, 403);
    const b = await call('POST', '/api/ops/backup', null, V);
    assert.equal(b.r.status, 200);
    assert.deepEqual(b.body.files.map((f) => f.integrity), ['ok', 'ok']);
    assert.equal(b.body.files[1].name, shop.body.tenant.id);
    const met = await call('GET', '/api/ops/metrics', null, V);
    assert.equal(met.body.health.backup.files, 2);
    assert.ok(met.body.metrics.routes.some((r) => r.route === 'GET /api/books/docs/nope' || r.route === 'GET /api/books/docs/:id'));
    assert.equal(met.body.metrics.counters['backup.ok'], 1);
    // the per-IP ceiling (health is exempt)
    let last;
    for (let i = 0; i < 45; i++) last = await call('GET', '/api/content', null, V);
    assert.equal(last.r.status, 429);
    assert.equal(last.r.headers.get('retry-after'), '60');
    assert.equal((await call('GET', '/api/health')).r.status, 200);
  } finally {
    server.close();
    server.bus.stop();
    rmSync(dir, { recursive: true, force: true });
  }
});
