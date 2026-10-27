// ورود با پیامک (spec 0022): number → code → session, no username, no password, no shop code. Development and demo
// servers hand the code back; a production server never does, sends a real SMS (a local stand-in for SMS.ir here), keeps
// its limits in the database, and lets only the vendor's own phone in with BEATRIS_OWNER_PIN while SMS is not set up.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { openDb } from '../server/db.mjs';
import { createServer } from '../server/index.mjs';
import { seedUsers } from '../server/api.mjs';
import { smsLogin } from './helpers/login.mjs';

const SECRET = 'test-secret-0123456789';
const quietMarket = { fetchImpl: async () => new Response('{}', { status: 404 }), defaultMode: 'off' };
const servers = [];
async function boot({ env = {}, demo = true, db = null, clock = null, smsOpts = {} } = {}) {
  const d = db ?? openDb(':memory:');
  if (!db) seedUsers(d, env, demo);
  const server = createServer({ db: d, secret: SECRET, demo, quiet: true, tenantsDir: ':memory:', env, smsOpts, otpOpts: { silentDelay: () => 0, ...(clock ? { now: () => clock.t } : {}) }, marketOpts: quietMarket });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  servers.push(server);
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, body, token) => {
    const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  const ok = async (...a) => {
    const r = await call(...a);
    assert.ok(r.status < 300, `${a[0]} ${a[1]} → ${r.status} ${JSON.stringify(r.body)}`);
    return r.body;
  };
  return { db: d, base, call, ok, server };
}

// a stand-in for SMS.ir that remembers every code it was asked to send
let sms, smsBase, smsFail = null;
const inbox = [];
before(async () => {
  sms = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const b = JSON.parse(raw || '{}');
      if (smsFail) {
        res.writeHead(400, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ status: 0, message: smsFail, data: null }));
      }
      inbox.push({ key: req.headers['x-api-key'], to: b.mobile, code: b.parameters?.[0]?.value, template: b.templateId });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 1, message: 'موفق', data: { messageId: inbox.length, cost: 1 } }));
    });
  });
  await new Promise((r) => sms.listen(0, '127.0.0.1', r));
  smsBase = `http://127.0.0.1:${sms.address().port}`;
});
after(() => {
  for (const s of servers) s.close();
  sms.close();
});
const lastCodeTo = (phone) => [...inbox].reverse().find((m) => m.to === phone)?.code;

test('کد درست وارد می‌کند؛ نادرست شمرده می‌شود؛ پنجمی باطل می‌کند؛ کد کهنه و کد خام ذخیره‌شده ممنوع', async () => {
  const clock = { t: Date.now() };
  const { call, ok, db } = await boot({ clock });
  const sent = await ok('POST', '/api/auth/code', { phone: '۰۹۱۲۰۰۰۰۰۰۲' }); // Persian digits
  assert.equal(sent.via, 'demo');
  assert.match(sent.code, /^\d{6}$/);
  assert.equal(sent.ttl, 180);
  const row = db.get("SELECT * FROM otp_codes WHERE phone='09120000002'");
  assert.ok(row && !JSON.stringify(row).includes(sent.code), 'only an HMAC of the code is kept');
  const wrong = String((Number(sent.code) + 1) % 1e6).padStart(6, '0');
  const w1 = await call('POST', '/api/auth/verify', { phone: '09120000002', code: wrong });
  assert.equal(w1.status, 401);
  assert.match(w1.body.error, /۴ بار دیگر/);
  const v = await ok('POST', '/api/auth/verify', { phone: '09120000002', code: sent.code.replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]) });
  assert.ok(v.token);
  assert.equal((await ok('GET', '/api/me', null, v.token)).user.role, 'manager');
  // the code is used up
  assert.equal((await call('POST', '/api/auth/verify', { phone: '09120000002', code: sent.code })).status, 401);
  // five wrong tries void the code, even the right one afterwards
  const s2 = await ok('POST', '/api/auth/code', { phone: '09120000003' });
  for (let i = 0; i < 4; i++) assert.equal((await call('POST', '/api/auth/verify', { phone: '09120000003', code: '000000' === s2.code ? '111111' : '000000' })).status, 401);
  const fifth = await call('POST', '/api/auth/verify', { phone: '09120000003', code: '000000' === s2.code ? '111111' : '000000' });
  assert.match(fifth.body.error, /باطل شد/);
  assert.equal((await call('POST', '/api/auth/verify', { phone: '09120000003', code: s2.code })).status, 401);
  // a code older than three minutes
  const s3 = await ok('POST', '/api/auth/code', { phone: '09120000004' });
  clock.t += 181000;
  const late = await call('POST', '/api/auth/verify', { phone: '09120000004', code: s3.code });
  assert.equal(late.status, 401);
  assert.match(late.body.error, /زمان کد گذشت/);
  assert.equal((await call('POST', '/api/auth/code', { phone: '0912' })).status, 400);
});

test('بدون شناسه فروشگاه: شماره فروشگاه خودش را پیدا می‌کند؛ شماره دوفروشگاهی انتخاب می‌کند؛ بلیت فقط فروشگاه‌های همان شماره', async () => {
  const { call, ok, base } = await boot();
  const V = await smsLogin(base, '09120000001');
  const a = await ok('POST', '/api/vendor/tenants', { name: 'گالری الف', ownerName: 'حسن کریمی', phone: '09351112233' }, V);
  assert.equal(a.owner.phone, '09351112233');
  assert.equal(a.tenant.maxUsers, 0, 'a new shop is unlimited');
  const b = await ok('POST', '/api/vendor/tenants', { name: 'گالری ب', ownerName: 'رضا', phone: '09352223344' }, V);
  // the owner of shop A signs straight into shop A
  const O = await smsLogin(base, '09351112233');
  const me = await ok('GET', '/api/me', null, O);
  assert.equal(me.tenant.id, a.tenant.id);
  assert.equal(me.user.role, 'owner');
  // the owner adds a colleague by mobile only; the same mobile is a manager in the main shop too
  await ok('POST', '/api/team', { name: 'مینا', phone: '09120000002', role: 'employee' }, O);
  const sent = await ok('POST', '/api/auth/code', { phone: '09120000002' });
  const v = await ok('POST', '/api/auth/verify', { phone: '09120000002', code: sent.code });
  assert.ok(!v.token && v.ticket);
  assert.deepEqual(v.shops.map((s) => [s.tenant, s.role]).sort(), [['main', 'manager'], [a.tenant.id, 'employee']].sort());
  // a ticket cannot open a shop this number is not in, and a forged ticket opens nothing
  assert.equal((await call('POST', '/api/auth/finish', { ticket: v.ticket, tenant: b.tenant.id })).status, 403);
  assert.equal((await call('POST', '/api/auth/finish', { ticket: `${v.ticket}x`, tenant: a.tenant.id })).status, 401);
  const picked = await ok('POST', '/api/auth/finish', { ticket: v.ticket, tenant: a.tenant.id });
  assert.equal((await ok('GET', '/api/me', null, picked.token)).user.name, 'مینا');
  // a suspended shop says so plainly
  await ok('PATCH', `/api/vendor/tenants/${b.tenant.id}`, { status: 'suspended' }, V);
  const sb = await ok('POST', '/api/auth/code', { phone: '09352223344' });
  const blocked = await call('POST', '/api/auth/verify', { phone: '09352223344', code: sb.code });
  assert.equal(blocked.status, 403);
  assert.match(blocked.body.error, /غیرفعال/);
  // no route issues a username or a password any more
  assert.equal((await call('POST', '/api/auth/login', { phone: '09120000001', pin: '1234' })).status, 410);
  assert.equal((await call('POST', '/api/auth/pin', { current: '1234', next: '5678' }, V)).status, 404);
  assert.ok(!JSON.stringify(a).match(/password/i));
});

test('ثبت‌نام باز: شماره تازه فروشگاه خودش را می‌سازد و همکار را با موبایل اضافه می‌کند؛ سقف کاربران؛ عوض کردن موبایل خروج می‌دهد', async () => {
  const { call, ok, base } = await boot();
  const phone = '09171234567';
  const sent = await ok('POST', '/api/auth/code', { phone });
  const v = await ok('POST', '/api/auth/verify', { phone, code: sent.code });
  assert.equal(v.signup, true);
  assert.equal((await call('POST', '/api/auth/finish', { ticket: v.ticket, name: 'ن', shopName: 'طلای نیما' })).status, 400);
  const made = await ok('POST', '/api/auth/finish', { ticket: v.ticket, name: 'نیما صالحی', shopName: 'طلای نیما' });
  const me = await ok('GET', '/api/me', null, made.token);
  assert.equal(me.user.role, 'owner');
  assert.equal(me.tenant.name, 'طلای نیما');
  assert.equal(me.tenant.maxUsers, 0);
  // a second tap with the same ticket signs into the shop just made, it does not make another
  const again = await ok('POST', '/api/auth/finish', { ticket: v.ticket, name: 'نیما صالحی', shopName: 'طلای نیما' });
  assert.equal(again.tenant, made.tenant);
  // the new owner adds staff by mobile, no password anywhere
  const emp = await ok('POST', '/api/team', { name: 'زهرا', phone: '09181112222', role: 'employee' }, made.token);
  assert.equal(emp.user.phone, '09181112222');
  const E = await smsLogin(base, '09181112222');
  assert.equal((await ok('GET', '/api/me', null, E)).tenant.id, made.tenant);
  assert.equal((await call('POST', '/api/team', { name: 'تکراری', phone: '09181112222' }, made.token)).status, 409);
  // the vendor puts a cap of 2 on this shop: the third active person is refused
  const V = await smsLogin(base, '09120000001');
  await ok('PATCH', `/api/vendor/tenants/${made.tenant}`, { maxUsers: 2 }, V);
  const full = await call('POST', '/api/team', { name: 'سوم', phone: '09181113333' }, made.token);
  assert.equal(full.status, 409);
  assert.match(full.body.error, /سقف/);
  // the mobile is the key: correcting it signs the old sessions out
  const O = made.token;
  await ok('PATCH', `/api/team/${emp.user.id}`, { phone: '09181119999' }, O);
  assert.equal((await call('GET', '/api/me', null, E)).status, 401);
  assert.ok(await smsLogin(base, '09181119999'));
  assert.equal((await call('PATCH', `/api/team/${me.user.id}`, { phone: '09180000000' }, O)).status, 400, 'not your own number from here');
});

test('ثبت‌نام بسته: شماره ناشناس همان پاسخ را می‌گیرد، کدی ساخته و فرستاده نمی‌شود، ورود ممکن نیست', async () => {
  const { call, ok, base, db } = await boot();
  const V = await smsLogin(base, '09120000001');
  const s = await ok('PUT', '/api/vendor/signup', { open: false }, V);
  assert.equal(s.signup.open, false);
  const known = await ok('POST', '/api/auth/code', { phone: '09120000005' });
  const unknown = await ok('POST', '/api/auth/code', { phone: '09170000001' });
  assert.equal(unknown.via, 'sms');
  assert.deepEqual(Object.keys(unknown).sort(), ['ok', 'phone', 'resend', 'ttl', 'via']);
  assert.equal(known.via, 'demo');
  assert.equal(db.get("SELECT COUNT(*) AS n FROM otp_codes WHERE phone='09170000001'").n, 0);
  assert.equal((await call('POST', '/api/auth/verify', { phone: '09170000001', code: '123456' })).status, 401);
  // open again: the vendor's plan and trial days apply to shops made by sign-up
  await ok('PUT', '/api/vendor/signup', { open: true, plan: 'full', trialDays: 14 }, V);
  const t = await smsLogin(base, '09170000001').catch((e) => e.message);
  assert.match(String(t), /no session/); // the helper stops at the sign-up step
  const sent = await ok('POST', '/api/auth/code', { phone: '09170000001' });
  const v = await ok('POST', '/api/auth/verify', { phone: '09170000001', code: sent.code });
  const made = await ok('POST', '/api/auth/finish', { ticket: v.ticket, name: 'کاوه', shopName: 'گالری کاوه' });
  const shop = (await ok('GET', '/api/vendor/tenants', null, V)).items.find((x) => x.id === made.tenant);
  assert.equal(shop.plan, 'full');
  assert.ok(shop.expiresAt && shop.selfMade);
});

test('تولید بدون سرویس پیامک: شماره واقعی خطای روشن، فقط تلفن مالک با BEATRIS_OWNER_PIN؛ کد هرگز به صفحه برنمی‌گردد', async () => {
  const env = { NODE_ENV: 'production', BEATRIS_OWNER_PHONE: '09121111111', BEATRIS_OWNER_PIN: '4321' };
  const { call, ok } = await boot({ env, demo: false });
  const pinSent = await ok('POST', '/api/auth/code', { phone: '09121111111' });
  assert.equal(pinSent.via, 'owner-pin');
  assert.equal(pinSent.code, undefined);
  assert.equal((await call('POST', '/api/auth/verify', { phone: '09121111111', code: '1234' })).status, 401);
  const V = (await ok('POST', '/api/auth/verify', { phone: '09121111111', code: '۴۳۲۱' })).token;
  assert.equal((await ok('GET', '/api/me', null, V)).vendor, true);
  await ok('POST', '/api/team', { name: 'فروشنده واقعی', phone: '09122222222', role: 'employee' }, V);
  const r = await call('POST', '/api/auth/code', { phone: '09122222222' });
  assert.equal(r.status, 503);
  assert.match(r.body.error, /هنوز راه نیفتاده/);
  const view = await ok('GET', '/api/vendor/sms', null, V);
  assert.equal(view.ready, false);
  assert.equal(view.ownerPin, true);
  assert.equal(view.prod, true);
});

test('تولید با SMS.ir: پیامک واقعی می‌رود، کلید برنمی‌گردد، محدودیت‌ها در پایگاه داده و پس از راه‌اندازی دوباره هم برقرارند', async () => {
  const env = { NODE_ENV: 'production', BEATRIS_OWNER_PHONE: '09121111111', BEATRIS_OWNER_PIN: '4321' };
  const clock = { t: Date.now() };
  const { call, ok, db } = await boot({ env, demo: false, clock, smsOpts: { baseUrl: smsBase } });
  await ok('POST', '/api/auth/code', { phone: '09121111111' });
  const V = (await ok('POST', '/api/auth/verify', { phone: '09121111111', code: '4321' })).token;
  // the vendor sets the panel up; the key is sealed and never comes back
  assert.equal((await call('PUT', '/api/vendor/sms', { provider: 'smsir', key: 'SECRET-KEY-XYZ', template: 'abc' }, V)).status, 400);
  const saved = await ok('PUT', '/api/vendor/sms', { provider: 'smsir', key: 'SECRET-KEY-XYZ', template: '777' }, V);
  assert.equal(saved.ready, true);
  assert.equal(saved.ownerPin, false, 'the PIN stops once SMS works');
  assert.ok(!JSON.stringify(saved).includes('SECRET-KEY-XYZ'));
  assert.ok(!db.get("SELECT value_json FROM settings WHERE key='sms'").value_json.includes('SECRET-KEY-XYZ'));
  // an empty key keeps the sealed one
  await ok('PUT', '/api/vendor/sms', { provider: 'smsir', key: '', template: '778' }, V);
  // the test button: a real send through the panel
  const t = await ok('POST', '/api/vendor/sms/test', { phone: '09125550000' }, V);
  assert.equal(t.ok, true);
  assert.equal(inbox.at(-1).key, 'SECRET-KEY-XYZ');
  assert.equal(inbox.at(-1).template, 778);
  // the owner now gets a real SMS like everyone, and the PIN no longer opens
  clock.t += 61000;
  const s = await ok('POST', '/api/auth/code', { phone: '09121111111' });
  assert.equal(s.via, 'sms');
  assert.equal(s.code, undefined, 'production never returns the code');
  assert.equal((await call('POST', '/api/auth/verify', { phone: '09121111111', code: '4321' })).status, 401);
  assert.ok((await ok('POST', '/api/auth/verify', { phone: '09121111111', code: lastCodeTo('09121111111') })).token);
  // one number: again only after 60 seconds, five an hour
  const p = '09123334444';
  await ok('POST', '/api/team', { name: 'آزمون محدودیت', phone: p }, V);
  await ok('POST', '/api/auth/code', { phone: p });
  const soon = await call('POST', '/api/auth/code', { phone: p });
  assert.equal(soon.status, 429);
  assert.ok(soon.body.retryAfter > 0 && soon.body.retryAfter <= 60);
  for (let i = 0; i < 4; i++) {
    clock.t += 61000;
    await ok('POST', '/api/auth/code', { phone: p });
  }
  clock.t += 61000;
  const sixth = await call('POST', '/api/auth/code', { phone: p });
  assert.equal(sixth.status, 429);
  assert.match(sixth.body.error, /یک ساعت/);
  // the limits live in the database: a restarted server (same database) still refuses
  const again = await boot({ env, demo: false, db, clock, smsOpts: { baseUrl: smsBase } });
  assert.equal((await again.call('POST', '/api/auth/code', { phone: p })).status, 429);
  // a panel failure: a calm message for the person, the panel's own words for the vendor
  smsFail = 'اعتبار کافی نیست';
  clock.t += 3600 * 1000;
  const failed = await call('POST', '/api/auth/code', { phone: p });
  smsFail = null;
  assert.equal(failed.status, 502);
  assert.ok(!/اعتبار/.test(failed.body.error));
  const view = await ok('GET', '/api/vendor/sms', null, V);
  assert.match(view.stats.lastError.error, /SMS\.ir: اعتبار کافی نیست/);
  assert.equal(view.config.provider, 'smsir');
  assert.equal(view.config.hasKey, true);
  // the server's variables win and lock the console
  const envSms = { ...env, BEATRIS_SMS_PROVIDER: 'smsir', BEATRIS_SMS_API_KEY: 'ENV-KEY', BEATRIS_SMS_TEMPLATE: '5' };
  const e = await boot({ env: envSms, demo: false, smsOpts: { baseUrl: smsBase } });
  await e.ok('POST', '/api/auth/code', { phone: '09121111111' });
  assert.equal(inbox.at(-1).key, 'ENV-KEY');
  const EV = (await e.ok('POST', '/api/auth/verify', { phone: '09121111111', code: lastCodeTo('09121111111') })).token;
  assert.equal((await e.call('PUT', '/api/vendor/sms', { provider: 'kavenegar', key: 'x', template: 't' }, EV)).status, 409);
  assert.equal((await e.ok('GET', '/api/vendor/sms', null, EV)).config.fromEnv, true);
});

test('سقف کل سرور در ساعت و سقف هر شبکه', async () => {
  const env = { NODE_ENV: 'production', BEATRIS_OWNER_PHONE: '09121111111', BEATRIS_SMS_PROVIDER: 'smsir', BEATRIS_SMS_API_KEY: 'K', BEATRIS_SMS_TEMPLATE: '1', BEATRIS_SMS_HOURLY_CAP: '3' };
  const { call, ok } = await boot({ env, demo: false, smsOpts: { baseUrl: smsBase } });
  for (const p of ['09121111111', '09130000001', '09130000002']) await ok('POST', '/api/auth/code', { phone: p }); // sign-up is open: unknown numbers get a real code
  const capped = await call('POST', '/api/auth/code', { phone: '09130000003' });
  assert.equal(capped.status, 503);
  assert.match(capped.body.error, /سقف/);
  // one network: 20 real codes an hour, whatever the numbers
  const env2 = { ...env, BEATRIS_SMS_HOURLY_CAP: '' };
  const n = await boot({ env: env2, demo: false, smsOpts: { baseUrl: smsBase } });
  for (let i = 0; i < 20; i++) await n.ok('POST', '/api/auth/code', { phone: `0913100${String(i).padStart(4, '0')}` });
  const net = await n.call('POST', '/api/auth/code', { phone: '09131009999' });
  assert.equal(net.status, 429);
  assert.match(net.body.error, /این شبکه/);
});

test('ساخت فروشگاه با ثبت‌نام: سه بار در روز از یک شبکه و سقف روزانه کل سرور', async () => {
  const { call, ok } = await boot({ env: { BEATRIS_SIGNUP_DAILY_CAP: '10' } });
  const make = async (phone) => {
    const sent = await ok('POST', '/api/auth/code', { phone });
    const v = await ok('POST', '/api/auth/verify', { phone, code: sent.code });
    return call('POST', '/api/auth/finish', { ticket: v.ticket, name: 'آزمون ثبت‌نام', shopName: `فروشگاه ${phone.slice(-2)}` });
  };
  for (const p of ['09150000001', '09150000002', '09150000003']) assert.equal((await make(p)).status, 200);
  const fourth = await make('09150000004');
  assert.equal(fourth.status, 429);
  assert.match(fourth.body.error, /این شبکه/);
  const capped = await boot({ env: { BEATRIS_SIGNUP_DAILY_CAP: '1' } });
  const one = async (phone) => {
    const sent = await capped.ok('POST', '/api/auth/code', { phone });
    const v = await capped.ok('POST', '/api/auth/verify', { phone, code: sent.code });
    return capped.call('POST', '/api/auth/finish', { ticket: v.ticket, name: 'آزمون سقف', shopName: 'فروشگاه سقف' });
  };
  assert.equal((await one('09160000001')).status, 200);
  const over = await one('09160000002');
  assert.equal(over.status, 429);
  assert.match(over.body.error, /سقف/);
});

test('کنسول ارائه‌دهنده: فروشگاه فقط با موبایل؛ کاربر قدیمی بی‌موبایل علامت می‌خورد و موبایل می‌گیرد', async () => {
  const { call, ok, base, server } = await boot();
  const V = await smsLogin(base, '09120000001');
  assert.equal((await call('POST', '/api/vendor/tenants', { name: 'بی‌موبایل', ownerName: 'الف' }, V)).status, 400);
  const shop = await ok('POST', '/api/vendor/tenants', { name: 'گالری قدیمی', ownerName: 'مالک', phone: '09140000001', maxUsers: 5 }, V);
  // a username-era account (no mobile) in that shop
  server.platform.handleFor(shop.tenant.id).db.run("INSERT INTO users(id,name,phone,role,branch,pin_hash,created_at,username) VALUES ('legacy','کاربر قدیمی','u:legacy','employee','','s1$x$y',?, 'legacy')", new Date().toISOString());
  const users = (await ok('GET', `/api/vendor/tenants/${shop.tenant.id}/users`, null, V)).items;
  const legacy = users.find((u) => u.id === 'legacy');
  assert.equal(legacy.noPhone, true);
  assert.equal(legacy.phone, '');
  assert.equal((await ok('GET', '/api/vendor/tenants', null, V)).items.find((t) => t.id === shop.tenant.id).stats.noPhone, 1);
  assert.equal((await call('PATCH', `/api/vendor/tenants/${shop.tenant.id}/users/legacy`, { phone: '09140000001' }, V)).status, 409);
  await ok('PATCH', `/api/vendor/tenants/${shop.tenant.id}/users/legacy`, { phone: '09140000002' }, V);
  assert.ok(await smsLogin(base, '09140000002'));
  const added = await ok('POST', `/api/vendor/tenants/${shop.tenant.id}/users`, { name: 'فروشنده', phone: '09140000003', role: 'employee' }, V);
  assert.equal(added.user.username, null);
  assert.equal((await call('POST', `/api/vendor/tenants/${shop.tenant.id}/users`, { name: 'بی‌شماره', role: 'employee' }, V)).status, 400);
  // retired account requests answer plainly
  assert.equal((await call('GET', '/api/access/shop?code=ABCD1234')).status, 410);
});

test('شماره مالک اصلی فقط از متغیرهای سرور عوض می‌شود؛ بلیت کهنه فروشگاه تعلیق‌شده را دور نمی‌زند', async () => {
  const env = { BEATRIS_OWNER_PHONE: '09121111111' };
  const { call, ok, base } = await boot({ env });
  const V = await smsLogin(base, '09121111111');
  const me = (await ok('GET', '/api/me', null, V)).user;
  const r = await call('PATCH', `/api/vendor/tenants/main/users/${me.id}`, { phone: '09121111112' }, V);
  assert.equal(r.status, 400);
  assert.match(r.body.error, /متغیر سرور BEATRIS_OWNER_PHONE/);
  // a vendor-made shop: its owner verifies, then the shop is suspended before the shop is picked
  const shop = await ok('POST', '/api/vendor/tenants', { name: 'گالری معلق', phone: '09170001111' }, V);
  await ok('POST', '/api/team', { name: 'دوشغله', phone: '09170001111', role: 'employee' }, V); // the same number in the main shop
  const sent = await ok('POST', '/api/auth/code', { phone: '09170001111' });
  const v = await ok('POST', '/api/auth/verify', { phone: '09170001111', code: sent.code });
  assert.equal(v.shops.length, 2);
  await ok('PATCH', `/api/vendor/tenants/${shop.tenant.id}`, { status: 'suspended' }, V);
  assert.equal((await call('POST', '/api/auth/finish', { ticket: v.ticket, tenant: shop.tenant.id })).status, 403);
  // with the main-shop account gone too, the stale ticket must not open a new shop
  const emp = (await ok('GET', '/api/team', null, V)).members.find((m) => m.phone === '09170001111');
  await ok('PATCH', `/api/team/${emp.id}`, { active: false }, V);
  const stale = await call('POST', '/api/auth/finish', { ticket: v.ticket, name: 'دور زدن', shopName: 'فروشگاه دوم' });
  assert.equal(stale.status, 403);
  assert.match(stale.body.error, /غیرفعال/);
});
