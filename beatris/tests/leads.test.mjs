import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.mjs';
import { createServer } from '../server/index.mjs';
import { seedUsers } from '../server/api.mjs';

let server, base;
const call = async (method, path, body, token, headers = {}) => {
  const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...headers, ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json() };
};
const login = async (phone) => (await call('POST', '/api/auth/login', { phone, pin: '1234' })).body.token;

before(async () => {
  const db = openDb(':memory:');
  seedUsers(db, {}, true);
  server = createServer({ db, secret: 'test-secret-0123456789', demo: true, quiet: true });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

test('صفحه معرفی: شمارش واقعی محتوا بدون ورود', async () => {
  const r = await call('GET', '/api/intro');
  assert.equal(r.status, 200);
  assert.ok(r.body.courses >= 12 && r.body.lessons >= 60 && r.body.questions >= 180);
});

test('درخواست نمایش: ثبت عمومی با اعتبارسنجی، تله ربات، فهرست و وضعیت فقط برای مدیر', async () => {
  const ip = { 'x-forwarded-for': '203.0.113.7' };
  assert.equal((await call('POST', '/api/leads', { name: 'ع', shop: 'گالری', phone: '09121234567' }, null, ip)).status, 400);
  assert.equal((await call('POST', '/api/leads', { name: 'علی', shop: 'گالری', phone: '12345' }, null, ip)).status, 400);
  const bot = await call('POST', '/api/leads', { name: 'bot', shop: 'bot', phone: '09121234567', website: 'http://spam' }, null, ip);
  assert.equal(bot.status, 200);
  const ok = await call('POST', '/api/leads', { name: 'علی رضایی', shop: 'طلای نمونه', city: 'تهران', phone: '۰۹۱۲۱۲۳۴۵۶۷', branches: 3, message: 'بسته مورد نظر: حرفه‌ای' }, null, ip);
  assert.equal(ok.status, 200);
  const emp = await login('09120000004');
  assert.equal((await call('GET', '/api/leads', null, emp)).status, 403);
  const m = await login('09120000002');
  const list = (await call('GET', '/api/leads', null, m)).body.items;
  assert.equal(list.length, 1); // the honeypot submission was dropped
  assert.deepEqual([list[0].shop, list[0].phone, list[0].branches, list[0].status], ['طلای نمونه', '09121234567', 3, 'new']);
  assert.equal((await call('PATCH', `/api/leads/${list[0].id}`, { status: 'hacked' }, m)).status, 400);
  assert.equal((await call('PATCH', `/api/leads/${list[0].id}`, { status: 'contacted' }, m)).status, 200);
  assert.equal((await call('GET', '/api/leads', null, m)).body.items[0].status, 'contacted');
  assert.equal((await call('DELETE', `/api/leads/${list[0].id}`, null, m)).status, 200);
  assert.equal((await call('DELETE', `/api/leads/${list[0].id}`, null, m)).status, 404);
  // five real submissions an hour per address
  for (let i = 0; i < 4; i++) await call('POST', '/api/leads', { name: 'مشتری', shop: `فروشگاه ${i}`, phone: '09121234567' }, null, ip);
  assert.equal((await call('POST', '/api/leads', { name: 'مشتری', shop: 'زیادی', phone: '09121234567' }, null, ip)).status, 429);
});

test('نام فروشگاه: فقط مدیر، پاک‌سازی ورودی، نمایش روی صفحه ورود و در پروفایل', async () => {
  assert.equal((await call('PUT', '/api/settings/brand', { shopName: 'x' }, await login('09120000004'))).status, 403);
  const m = await login('09120000002');
  const r = await call('PUT', '/api/settings/brand', { shopName: '  طلای <b>آفتاب</b>  ' }, m);
  assert.equal(r.body.brand.shopName, 'طلای bآفتاب/b');
  assert.equal((await call('GET', '/api/config')).body.shopName, 'طلای bآفتاب/b');
  assert.equal((await call('GET', '/api/me', null, m)).body.brand.shopName, 'طلای bآفتاب/b');
});
