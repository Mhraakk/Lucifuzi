import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.mjs';
import { createServer } from '../server/index.mjs';
import { seedUsers } from '../server/api.mjs';
import { smsLogin } from './helpers/login.mjs';

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
  V = (await smsLogin(base, '09120000001')); // the vendor = owner of the main shop
});
after(() => server.close());

test('ارائه‌دهنده فروشگاه را فقط با موبایل مالک می‌سازد؛ مالک با کد پیامکی روی هر دستگاه وارد می‌شود و داده‌ها جدا هستند', async () => {
  // only the vendor may open the console
  const mgr = (await smsLogin(base, '09120000002'));
  assert.equal((await call('GET', '/api/vendor/tenants', null, mgr)).status, 403);
  const made = await ok('POST', '/api/vendor/tenants', { name: 'طلافروشی نمونه', plan: 'base', ownerName: 'حسن کریمی', phone: '۰۹۳۵۱۱۱۲۲۳۳', expiresAt: tomorrow }, V);
  assert.equal(made.owner.phone, '09351112233');
  assert.equal(made.owner.username, null);
  assert.ok(!('password' in made), 'no password is ever issued');
  // the same account on a phone and on a desktop: two sessions, both valid
  const phone = await smsLogin(base, '09351112233', { ua: 'Mozilla/5.0 (Linux; Android 14) Chrome/130' });
  const desk = await smsLogin(base, '09351112233', { ua: 'Mozilla/5.0 (Windows NT 10.0) Chrome/130' });
  const me = await ok('GET', '/api/me', null, phone);
  assert.equal(me.tenant.main, false);
  assert.equal(me.brand.shopName, 'طلافروشی نمونه');
  assert.equal(me.user.role, 'owner');
  assert.equal(me.vendor, false);
  assert.equal(me.setupDone, false);
  assert.equal((await ok('GET', '/api/me', null, desk)).user.id, me.user.id);
  // a new shop starts empty: no customers, no documents, its own edition
  assert.equal((await ok('GET', '/api/books/parties', null, phone)).items.length, 0);
  assert.equal((await ok('GET', '/api/books/settings', null, phone)).edition, 'base');
  await ok('POST', '/api/books/parties', { name: 'مشتری فروشگاه دوم' }, phone);
  // …and the main shop does not see it
  assert.ok(!(await ok('GET', '/api/books/parties', null, V)).items.some((p) => p.name === 'مشتری فروشگاه دوم'));
  // the price feed, MCP and the console stay with the vendor
  assert.equal((await call('PUT', '/api/market/feed', { mode: 'off' }, phone)).status, 403);
  assert.equal((await call('GET', '/api/mcp', null, phone)).status, 403);
  assert.equal((await call('GET', '/api/vendor/tenants', null, phone)).status, 403);
  // prices are shared: the new shop reads the same board
  assert.ok((await ok('GET', '/api/market', null, phone)).items.length > 0);
  // the shop's owner adds a colleague by mobile; the vendor can too
  const emp = await ok('POST', '/api/team', { name: 'مینا صادقی', phone: '09121112233', role: 'employee' }, phone);
  const empTok = await smsLogin(base, '09121112233');
  assert.equal((await ok('GET', '/api/me', null, empTok)).user.role, 'employee');
  assert.equal((await call('POST', `/api/vendor/tenants/${made.tenant.id}/users`, { name: 'تکراری', phone: '09121112233' }, V)).status, 409);
  assert.equal((await call('POST', '/api/team', { name: 'مالک دوم', phone: '09121112244', role: 'owner' }, empTok)).status, 403);
  // «خروج از همه دستگاه‌ها» from the console
  await ok('PATCH', `/api/vendor/tenants/${made.tenant.id}/users/${emp.user.id}`, { logoutAll: true }, V);
  assert.equal((await call('GET', '/api/me', null, empTok)).status, 401);
  // the console lists the shop with its numbers and the last device
  const list = await ok('GET', '/api/vendor/tenants', null, V);
  const row = list.items.find((t) => t.id === made.tenant.id);
  assert.equal(row.stats.parties, 1);
  assert.equal(row.stats.users, 2);
  assert.equal(row.stats.noPhone, 0);
  const users = await ok('GET', `/api/vendor/tenants/${made.tenant.id}/users`, null, V);
  assert.equal(users.items.find((u) => u.phone === '09351112233').lastDevice, 'Chrome روی ویندوز');
  // a token of one shop never opens another shop
  assert.equal((await ok('GET', '/api/me', null, phone)).tenant.id, made.tenant.id);
  // suspension and expiry lock the shop out, with a plain reason after the right code
  await ok('PATCH', `/api/vendor/tenants/${made.tenant.id}`, { status: 'suspended' }, V);
  assert.equal((await call('GET', '/api/me', null, phone)).status, 403);
  const blocked = await smsLogin(base, '09351112233').catch((e) => e.message);
  assert.match(blocked, /403 حساب این فروشگاه غیرفعال/);
  await ok('PATCH', `/api/vendor/tenants/${made.tenant.id}`, { status: 'active', expiresAt: '2020-01-01' }, V);
  assert.match(await smsLogin(base, '09351112233').catch((e) => e.message), /اشتراک/);
  await ok('PATCH', `/api/vendor/tenants/${made.tenant.id}`, { expiresAt: tomorrow }, V);
  assert.ok(await smsLogin(base, '09351112233'));
  // the main shop signs in the same way
  assert.ok(await smsLogin(base, '۰۹۱۲۰۰۰۰۰۰۲'));
});

test('کد اصالت فاکتور هر فروشگاه در صفحه عمومی پیدا می‌شود', async () => {
  await ok('POST', '/api/vendor/tenants', { name: 'گالری دوم', plan: 'full', phone: '09352223344' }, V);
  const tok = await smsLogin(base, '09352223344');
  const doc = await ok('POST', '/api/books/docs', { type: 'trade', lines: [{ kind: 'coin', dir: 'out', coin: 'emami', count: 1, price: 985000000 }], payments: [{ method: 'cash', dir: 'in', amount: 985000000 }] }, tok);
  const v = await ok('GET', `/api/verify/${doc.verify}`);
  assert.equal(v.shop, 'گالری دوم');
  assert.equal((await call('GET', '/api/verify/0123456789ab')).status, 404);
  assert.equal((await call('POST', '/api/vendor/tenants', { name: 'بی‌موبایل', phone: '1234' }, V)).status, 400);
});
