import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.mjs';
import { createServer } from '../server/index.mjs';
import { seedUsers } from '../server/api.mjs';

let server, base, V;
const call = async (method, path, body, token, ua) => {
  const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...(ua ? { 'user-agent': ua } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const ok = async (...a) => {
  const r = await call(...a);
  assert.ok(r.status < 300, `${a[0]} ${a[1]} → ${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
};
const tomorrow = new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10);

before(async () => {
  const db = openDb(':memory:');
  seedUsers(db, {}, true);
  server = createServer({ db, secret: 'test-secret-0123456789', demo: true, quiet: true, tenantsDir: ':memory:', marketOpts: { fetchImpl: async () => new Response('{}', { status: 404 }), defaultMode: 'off' } });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  V = (await ok('POST', '/api/auth/login', { phone: '09120000001', pin: '1234' })).token; // the vendor = owner of the main shop
});
after(() => server.close());

test('ارائه‌دهنده فروشگاه می‌سازد؛ مالک با نام کاربری و رمز روی هر دستگاه وارد می‌شود و داده‌ها جدا هستند', async () => {
  // only the vendor may open the console
  const mgr = (await ok('POST', '/api/auth/login', { phone: '09120000002', pin: '1234' })).token;
  assert.equal((await call('GET', '/api/vendor/tenants', null, mgr)).status, 403);
  const made = await ok('POST', '/api/vendor/tenants', { name: 'طلافروشی نمونه', plan: 'base', ownerName: 'حسن کریمی', username: 'Hassan.K', expiresAt: tomorrow }, V);
  assert.equal(made.owner.username, 'hassan.k');
  assert.ok(made.password.length >= 10);
  // the same account on a phone and on a desktop: two sessions, both valid
  const phone = await ok('POST', '/api/auth/login', { login: 'hassan.k', password: made.password }, null, 'Mozilla/5.0 (Linux; Android 14) Chrome/130');
  const desk = await ok('POST', '/api/auth/login', { login: ' HASSAN.K ', password: made.password }, null, 'Mozilla/5.0 (Windows NT 10.0) Chrome/130');
  const me = await ok('GET', '/api/me', null, phone.token);
  assert.equal(me.tenant.main, false);
  assert.equal(me.brand.shopName, 'طلافروشی نمونه');
  assert.equal(me.user.role, 'owner');
  assert.equal(me.vendor, false);
  assert.equal(me.setupDone, false);
  assert.equal((await ok('GET', '/api/me', null, desk.token)).user.id, me.user.id);
  // a new shop starts empty: no customers, no documents, its own edition
  assert.equal((await ok('GET', '/api/books/parties', null, phone.token)).items.length, 0);
  assert.equal((await ok('GET', '/api/books/settings', null, phone.token)).edition, 'base');
  await ok('POST', '/api/books/parties', { name: 'مشتری فروشگاه دوم' }, phone.token);
  // …and the main shop does not see it
  assert.ok(!(await ok('GET', '/api/books/parties', null, V)).items.some((p) => p.name === 'مشتری فروشگاه دوم'));
  // accounts, passwords, the price feed and MCP stay with the vendor
  assert.equal((await call('POST', '/api/team', { name: 'کارمند', phone: '09121112233', role: 'employee', pin: '1234' }, phone.token)).status, 403);
  assert.equal((await call('POST', '/api/auth/pin', { current: made.password, next: 'newpass-123' }, phone.token)).status, 403);
  assert.equal((await call('PUT', '/api/market/feed', { mode: 'off' }, phone.token)).status, 403);
  assert.equal((await call('GET', '/api/mcp', null, phone.token)).status, 403);
  assert.equal((await call('GET', '/api/vendor/tenants', null, phone.token)).status, 403);
  // prices are shared: the new shop reads the same board
  assert.ok((await ok('GET', '/api/market', null, phone.token)).items.length > 0);
  // the vendor adds an employee; the password is issued once
  const emp = await ok('POST', `/api/vendor/tenants/${made.tenant.id}/users`, { name: 'مینا صادقی', username: 'mina', role: 'employee' }, V);
  const empTok = (await ok('POST', '/api/auth/login', { login: 'mina', password: emp.password })).token;
  assert.equal((await ok('GET', '/api/me', null, empTok)).user.role, 'employee');
  assert.equal((await call('POST', `/api/vendor/tenants/${made.tenant.id}/users`, { name: 'تکراری', username: 'mina' }, V)).status, 409);
  // wrong password
  assert.equal((await call('POST', '/api/auth/login', { login: 'mina', password: 'nope-nope' })).status, 401);
  // a password reset signs every device out
  const reset = await ok('PATCH', `/api/vendor/tenants/${made.tenant.id}/users/${emp.user.id}`, { resetPassword: true }, V);
  assert.equal((await call('GET', '/api/me', null, empTok)).status, 401);
  assert.equal((await call('POST', '/api/auth/login', { login: 'mina', password: emp.password })).status, 401);
  await ok('POST', '/api/auth/login', { login: 'mina', password: reset.password });
  // the console lists the shop with its numbers and the last device
  const list = await ok('GET', '/api/vendor/tenants', null, V);
  const row = list.items.find((t) => t.id === made.tenant.id);
  assert.equal(row.stats.parties, 1);
  assert.equal(row.stats.users, 2);
  const users = await ok('GET', `/api/vendor/tenants/${made.tenant.id}/users`, null, V);
  assert.equal(users.items.find((u) => u.username === 'hassan.k').lastDevice, 'Chrome روی ویندوز');
  // a token of one shop never opens another shop
  const forged = phone.token;
  assert.equal((await ok('GET', '/api/me', null, forged)).tenant.id, made.tenant.id);
  // suspension and expiry lock the shop out, with a plain reason after the right password
  await ok('PATCH', `/api/vendor/tenants/${made.tenant.id}`, { status: 'suspended' }, V);
  assert.equal((await call('GET', '/api/me', null, phone.token)).status, 403);
  const blocked = await call('POST', '/api/auth/login', { login: 'hassan.k', password: made.password });
  assert.equal(blocked.status, 403);
  assert.match(blocked.body.error, /غیرفعال/);
  await ok('PATCH', `/api/vendor/tenants/${made.tenant.id}`, { status: 'active', expiresAt: '2020-01-01' }, V);
  assert.match((await call('POST', '/api/auth/login', { login: 'hassan.k', password: made.password })).body.error, /اشتراک/);
  await ok('PATCH', `/api/vendor/tenants/${made.tenant.id}`, { expiresAt: tomorrow, allowPasswordChange: true }, V);
  // with the vendor's permission the owner may change the password
  const t2 = (await ok('POST', '/api/auth/login', { login: 'hassan.k', password: made.password })).token;
  const changed = await ok('POST', '/api/auth/pin', { current: made.password, next: 'my-own-pass-9' }, t2);
  assert.ok(changed.token);
  await ok('POST', '/api/auth/login', { login: 'hassan.k', password: 'my-own-pass-9' });
  // the main shop still signs in with its mobile number
  assert.ok((await ok('POST', '/api/auth/login', { login: '۰۹۱۲۰۰۰۰۰۰۲', password: '1234' })).token);
});

test('کد اصالت فاکتور هر فروشگاه در صفحه عمومی پیدا می‌شود', async () => {
  const made = await ok('POST', '/api/vendor/tenants', { name: 'گالری دوم', plan: 'full', username: 'gallery2' }, V);
  const tok = (await ok('POST', '/api/auth/login', { login: 'gallery2', password: made.password })).token;
  const doc = await ok('POST', '/api/books/docs', { type: 'trade', lines: [{ kind: 'coin', dir: 'out', coin: 'emami', count: 1, price: 985000000 }], payments: [{ method: 'cash', dir: 'in', amount: 985000000 }] }, tok);
  const v = await ok('GET', `/api/verify/${doc.verify}`);
  assert.equal(v.shop, 'گالری دوم');
  assert.equal((await call('GET', '/api/verify/0123456789ab')).status, 404);
  assert.equal((await call('POST', '/api/vendor/tenants', { name: 'بی‌نام', username: '1bad' }, V)).status, 400);
});
