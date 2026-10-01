// spec 0011: account requests from the sign-in page, approved inside the shop; the password is minted at pickup.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.mjs';
import { createServer } from '../server/index.mjs';
import { seedUsers } from '../server/api.mjs';

let server, base, db, V, MGR, EMP;
const call = async (method, path, body, token, ip) => {
  const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...(ip ? { 'x-forwarded-for': ip } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const ok = async (...a) => {
  const r = await call(...a);
  assert.ok(r.status < 300, `${a[0]} ${a[1]} → ${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
};
const login = async (phone) => (await ok('POST', '/api/auth/login', { phone, pin: '1234' })).token;

before(async () => {
  db = openDb(':memory:');
  seedUsers(db, {}, true);
  server = createServer({ db, secret: 'test-secret-0123456789', demo: true, quiet: true, tenantsDir: ':memory:', marketOpts: { fetchImpl: async () => new Response('{}', { status: 404 }), defaultMode: 'off' } });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  V = await login('09120000001'); // owner of the main shop
  MGR = await login('09120000002');
  EMP = await login('09120000004');
});
after(() => server.close());

test('کد دعوت: فقط مدیر می‌بیند؛ کد نادرست، خاموش و عوض‌شده خطای روشن دارد', async () => {
  assert.equal((await call('GET', '/api/access/admin', null, EMP)).status, 403);
  assert.equal((await call('GET', '/api/access/admin')).status, 401);
  const a = await ok('GET', '/api/access/admin', null, MGR);
  assert.match(a.code, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  // the same code for the owner; lower case, Persian digits and no dash are accepted
  assert.equal((await ok('GET', '/api/access/admin', null, V)).code, a.code);
  const shop = await ok('GET', `/api/access/shop?code=${encodeURIComponent(a.code.toLowerCase().replace('-', ' '))}`);
  assert.ok(shop.shop.length > 1);
  assert.equal((await call('GET', '/api/access/shop?code=ZZZZ-ZZZZ')).status, 400);
  await ok('POST', '/api/access/admin/code', { enabled: false }, MGR);
  assert.equal((await call('GET', `/api/access/shop?code=${a.code}`)).status, 403);
  const n = await ok('POST', '/api/access/admin/code', { enabled: true, regenerate: true }, MGR);
  assert.notEqual(n.code, a.code);
  assert.equal((await call('GET', `/api/access/shop?code=${a.code}`)).status, 400);
  assert.equal((await call('POST', '/api/access/admin/code', { regenerate: true }, EMP)).status, 403);
});

test('درخواست ← تأیید مدیر ← دستگاه درخواست‌دهنده یک بار رمز می‌گیرد و وارد می‌شود', async () => {
  const { code } = await ok('GET', '/api/access/admin', null, MGR);
  assert.equal((await call('POST', '/api/access/requests', { code, name: 'ن', phone: '09131112233' }, null, '10.0.0.1')).status, 400);
  assert.equal((await call('POST', '/api/access/requests', { code, name: 'نرگس رحیمی', phone: '0913' }, null, '10.0.0.1')).status, 400);
  assert.equal((await call('POST', '/api/access/requests', { code, name: 'نرگس رحیمی', phone: '09131112233', username: 'نرگس' }, null, '10.0.0.1')).status, 400);
  const r = await ok('POST', '/api/access/requests', { code, name: 'نرگس رحیمی', phone: '۰۹۱۳۱۱۱۲۲۳۳', role: 'owner', username: 'Narges.R', note: 'شعبه مرکزی' }, null, '10.0.0.1');
  assert.ok(r.ticket.length >= 30);
  // the same phone cannot queue twice
  assert.equal((await call('POST', '/api/access/requests', { code, name: 'نرگس رحیمی', phone: '09131112233' }, null, '10.0.0.1')).status, 409);
  // nothing secret is stored: only the hash of the ticket
  const row = db.get('SELECT * FROM access_requests WHERE phone=?', '09131112233');
  assert.notEqual(row.ticket_hash, r.ticket);
  assert.equal(row.role, 'employee'); // «owner» cannot be asked for
  // waiting
  const w = await ok('POST', '/api/access/status', { ticket: r.ticket });
  assert.equal(w.status, 'pending');
  assert.equal(w.password, undefined);
  assert.equal((await call('POST', '/api/access/status', { ticket: 'wrong' })).status, 404);
  // the manager sees it with a suggested username, an employee cannot approve
  const list = await ok('GET', '/api/access/admin', null, MGR);
  const it = list.items.find((x) => x.name === 'نرگس رحیمی');
  assert.equal(it.status, 'pending');
  assert.equal(it.suggested, 'narges.r');
  assert.ok(list.pending >= 1);
  assert.equal((await call('POST', `/api/access/admin/requests/${it.id}`, { action: 'approve' }, EMP)).status, 403);
  assert.equal((await call('POST', `/api/access/admin/requests/${it.id}`, { action: 'approve', role: 'owner' }, MGR)).status, 403);
  const ap = await ok('POST', `/api/access/admin/requests/${it.id}`, { action: 'approve', role: 'trainer' }, MGR);
  assert.equal(ap.user.username, 'narges.r');
  assert.equal(ap.user.role, 'trainer');
  assert.equal(ap.password, undefined); // the manager is not shown a password by default
  assert.equal((await call('POST', `/api/access/admin/requests/${it.id}`, { action: 'approve' }, MGR)).status, 409);
  // pickup: once
  const p = await ok('POST', '/api/access/status', { ticket: r.ticket });
  assert.equal(p.status, 'approved');
  assert.equal(p.username, 'narges.r');
  assert.equal(p.password.length, 10);
  const me = await ok('POST', '/api/auth/login', { login: 'narges.r', password: p.password });
  assert.equal((await ok('GET', '/api/me', null, me.token)).user.role, 'trainer');
  const again = await ok('POST', '/api/access/status', { ticket: r.ticket });
  assert.equal(again.password, undefined);
  assert.equal(again.handedToManager, true);
  // the password is not in the registry
  assert.ok(!JSON.stringify(db.get('SELECT * FROM access_requests WHERE id=?', it.id)).includes(p.password));
  // the manager can still issue a password by hand; that ends the pickup and the old password
  const hand = await ok('POST', `/api/access/admin/requests/${it.id}`, { action: 'password' }, MGR);
  assert.equal(hand.username, 'narges.r');
  assert.notEqual(hand.password, p.password);
  assert.equal((await call('POST', '/api/auth/login', { login: 'narges.r', password: p.password })).status, 401);
  await ok('POST', '/api/auth/login', { login: 'narges.r', password: hand.password });
});

test('مدیر «صدور رمز» بزند، تحویل روی دستگاه باطل است؛ رد درخواست؛ فروشگاه دیگر به آن دسترسی ندارد', async () => {
  const { code } = await ok('GET', '/api/access/admin', null, MGR);
  const a = await ok('POST', '/api/access/requests', { code, name: 'کاوه نادری', phone: '09132223344' }, null, '10.0.0.2');
  const b = await ok('POST', '/api/access/requests', { code, name: 'سینا مرادی', phone: '09133334455' }, null, '10.0.0.2');
  const items = (await ok('GET', '/api/access/admin', null, V)).items;
  const ia = items.find((x) => x.name === 'کاوه نادری'), ib = items.find((x) => x.name === 'سینا مرادی');
  assert.equal(ia.suggested, 'u2223344');
  await ok('POST', `/api/access/admin/requests/${ia.id}`, { action: 'approve', username: 'kaveh.n' }, V);
  const hand = await ok('POST', `/api/access/admin/requests/${ia.id}`, { action: 'password' }, V);
  const st = await ok('POST', '/api/access/status', { ticket: a.ticket });
  assert.equal(st.username, 'kaveh.n');
  assert.equal(st.password, undefined);
  assert.equal(st.handedToManager, true);
  await ok('POST', '/api/auth/login', { login: 'kaveh.n', password: hand.password });
  // rejected
  await ok('POST', `/api/access/admin/requests/${ib.id}`, { action: 'reject' }, V);
  assert.equal((await ok('POST', '/api/access/status', { ticket: b.ticket })).status, 'rejected');
  assert.equal((await call('POST', `/api/access/admin/requests/${ib.id}`, { action: 'approve' }, V)).status, 409);
  // another shop's manager: its own code, and the main shop's requests are not found
  const shop = await ok('POST', '/api/vendor/tenants', { name: 'طلافروشی دوم', username: 'second.owner', maxUsers: 2 }, V);
  const owner2 = (await ok('POST', '/api/auth/login', { login: 'second.owner', password: shop.password })).token;
  const c2 = await ok('GET', '/api/access/admin', null, owner2);
  assert.notEqual(c2.code, code);
  assert.equal(c2.items.length, 0);
  assert.equal((await call('POST', `/api/access/admin/requests/${ib.id}`, { action: 'reject' }, owner2)).status, 404);
  // the shop's own requests land in its own list, and its user cap holds
  assert.equal((await ok('GET', `/api/access/shop?code=${c2.code}`)).shop, 'طلافروشی دوم');
  const r1 = await ok('POST', '/api/access/requests', { code: c2.code, name: 'همکار یک', phone: '09134445566', username: 'hamkar1' }, null, '10.0.0.3');
  await ok('POST', '/api/access/requests', { code: c2.code, name: 'همکار دو', phone: '09135556677' }, null, '10.0.0.3');
  const l2 = (await ok('GET', '/api/access/admin', null, owner2)).items;
  assert.equal(l2.length, 2);
  await ok('POST', `/api/access/admin/requests/${l2.find((x) => x.name === 'همکار یک').id}`, { action: 'approve' }, owner2);
  assert.equal((await call('POST', `/api/access/admin/requests/${l2.find((x) => x.name === 'همکار دو').id}`, { action: 'approve' }, owner2)).status, 409); // cap of 2 users
  const got = await ok('POST', '/api/access/status', { ticket: r1.ticket });
  const t = (await ok('POST', '/api/auth/login', { login: 'hamkar1', password: got.password })).token;
  assert.equal((await ok('GET', '/api/me', null, t)).brand.shopName, 'طلافروشی دوم');
});

test('محدودیت: honeypot چیزی ثبت نمی‌کند؛ ارسال زیاد از یک نشانی متوقف می‌شود', async () => {
  const { code } = await ok('GET', '/api/access/admin', null, MGR);
  const before = db.get('SELECT COUNT(*) AS n FROM access_requests').n;
  await ok('POST', '/api/access/requests', { code, name: 'ربات', phone: '09136667788', website: 'x' }, null, '10.0.0.9');
  assert.equal(db.get('SELECT COUNT(*) AS n FROM access_requests').n, before);
  let last;
  for (let i = 0; i < 8; i++) last = await call('POST', '/api/access/requests', { code, name: `آزمون ${i}`, phone: `0913777000${i}` }, null, '10.0.0.10');
  assert.equal(last.status, 429);
});
