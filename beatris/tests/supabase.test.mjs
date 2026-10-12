// ورود با ایمیل (spec 0034): email → code (or the link in the same email) → session. Supabase sends and checks the code;
// here a local stand-in answers exactly like Supabase Auth's REST API (/auth/v1/otp, /verify, /user), so every request
// the server makes is seen and every answer Supabase can give — right, wrong, down, refused — is played back.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { openDb } from '../server/db.mjs';
import { createServer } from '../server/index.mjs';
import { seedUsers } from '../server/api.mjs';
import { supabaseFromEnv } from '../server/supabase.mjs';

const SECRET = 'test-secret-0123456789';
const KEY = 'sb_publishable_test_key_0123456789';
const quietMarket = { fetchImpl: async () => new Response('{}', { status: 404 }), defaultMode: 'off' };

/* ---------------- the stand-in for Supabase Auth ---------------- */
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const sb = { calls: [], codes: new Map(), sessions: new Set(), mode: null };
const jwt = (email, method, at = Date.now()) => {
  const t = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ aud: 'authenticated', email, role: 'authenticated', amr: [{ method, timestamp: Math.floor(at / 1000) }], exp: Math.floor(at / 1000) + 3600 })}.${b64({ sig: Math.random() })}`;
  sb.sessions.add(t);
  return t;
};
let supa, SUPA;
before(async () => {
  supa = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const url = new URL(req.url, 'http://x');
      const body = raw ? JSON.parse(raw) : null;
      sb.calls.push({ method: req.method, path: url.pathname, query: Object.fromEntries(url.searchParams), key: req.headers.apikey, auth: req.headers.authorization ?? '', body });
      const send = (status, j) => (res.writeHead(status, { 'content-type': 'application/json' }), res.end(JSON.stringify(j)));
      if (req.headers.apikey !== KEY) return send(401, { message: 'Invalid API key' });
      if (sb.mode === 'down') return res.destroy();
      if (sb.mode === 'refused') return send(400, { code: 400, error_code: 'email_address_not_authorized', msg: `Email address "${body?.email}" cannot be used as it is not authorized` });
      if (url.pathname === '/auth/v1/otp') {
        const code = String(Math.floor(Math.random() * 1e6)).padStart(6, '0');
        sb.codes.set(body.email, code);
        return send(200, {});
      }
      if (url.pathname === '/auth/v1/verify') {
        if (body.type !== 'email' || sb.codes.get(body.email) !== body.token) return send(403, { code: 403, error_code: 'otp_expired', msg: 'Token has expired or is invalid' });
        sb.codes.delete(body.email);
        return send(200, { access_token: jwt(body.email, 'otp'), token_type: 'bearer', user: { email: body.email, email_confirmed_at: new Date().toISOString() } });
      }
      if (url.pathname === '/auth/v1/user' && req.method === 'GET') {
        const t = String(req.headers.authorization ?? '').replace(/^Bearer /, '');
        if (!sb.sessions.has(t)) return send(403, { code: 403, error_code: 'bad_jwt', msg: 'invalid JWT' });
        const c = JSON.parse(Buffer.from(t.split('.')[1], 'base64url'));
        return send(200, { email: c.email, email_confirmed_at: new Date().toISOString(), aud: 'authenticated' });
      }
      send(404, { message: 'not found' });
    });
  });
  await new Promise((r) => supa.listen(0, '127.0.0.1', r));
  SUPA = `http://127.0.0.1:${supa.address().port}`;
});
const servers = [];
after(() => {
  for (const s of servers) s.close();
  supa.close();
});

async function boot({ env = {}, demo = false, clock = null } = {}) {
  const d = openDb(':memory:');
  seedUsers(d, env, demo);
  const server = createServer({ db: d, secret: SECRET, demo, quiet: true, tenantsDir: ':memory:', env, otpOpts: { silentDelay: () => 0, ...(clock ? { now: () => clock.t } : {}) }, marketOpts: quietMarket });
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
  /** The whole sign-in by email, the code read from the stand-in's outbox (or the page, for demo and development). */
  const emailLogin = async (email, { tenant } = {}) => {
    const sent = await ok('POST', '/api/auth/code', { email });
    const code = sent.code ?? sb.codes.get(sent.email);
    let v = await ok('POST', '/api/auth/verify', { email, code });
    if (v.shops) v = await ok('POST', '/api/auth/finish', { ticket: v.ticket, tenant: tenant ?? v.shops[0].tenant });
    assert.ok(v.token, `no session for ${email}: ${JSON.stringify(v)}`);
    return v.token;
  };
  return { db: d, base, call, ok, emailLogin };
}
const OWNER = { BEATRIS_OWNER_PHONE: '09121112233', BEATRIS_OWNER_NAME: 'مالک', BEATRIS_OWNER_EMAIL: '  Owner@Shop.IR ' };
const withSupa = (extra = {}) => ({ ...OWNER, BEATRIS_SUPABASE_URL: SUPA, BEATRIS_SUPABASE_KEY: KEY, ...extra });

test('the configuration: both variables, an https project URL (or a local stand-in), a key that is not empty', () => {
  assert.equal(supabaseFromEnv({}), null);
  assert.deepEqual(supabaseFromEnv({ BEATRIS_SUPABASE_URL: 'https://abcd.supabase.co/', BEATRIS_SUPABASE_KEY: KEY }), { url: 'https://abcd.supabase.co', key: KEY });
  assert.ok(supabaseFromEnv({ BEATRIS_SUPABASE_URL: 'http://evil.example', BEATRIS_SUPABASE_KEY: KEY }).error);
  assert.ok(supabaseFromEnv({ BEATRIS_SUPABASE_URL: 'https://abcd.supabase.co', BEATRIS_SUPABASE_KEY: 'short' }).error);
});

test('request shapes: the code goes out through /auth/v1/otp with the key and the link back to /login; a right code signs the owner in', async () => {
  const clock = { t: Date.now() };
  const { ok, base, emailLogin, db } = await boot({ env: withSupa(), clock });
  assert.equal(db.get("SELECT email FROM users WHERE phone='09121112233'").email, 'owner@shop.ir', 'BEATRIS_OWNER_EMAIL, stored lower-case');
  sb.calls.length = 0;
  const sent = await ok('POST', '/api/auth/code', { email: ' OWNER@shop.ir ' });
  assert.equal(sent.via, 'email');
  assert.equal(sent.code, undefined, 'a real send never shows the code');
  assert.equal(sent.len, 6);
  const c = sb.calls.find((x) => x.path === '/auth/v1/otp');
  assert.equal(c.method, 'POST');
  assert.equal(c.key, KEY);
  assert.deepEqual(c.body, { email: 'owner@shop.ir', create_user: true });
  assert.equal(c.query.redirect_to, `${base}/login`);
  const v = await ok('POST', '/api/auth/verify', { email: 'owner@shop.ir', code: sb.codes.get('owner@shop.ir') });
  const vc = sb.calls.find((x) => x.path === '/auth/v1/verify');
  assert.deepEqual(Object.keys(vc.body).sort(), ['email', 'token', 'type']);
  assert.equal(vc.body.type, 'email');
  assert.ok(v.token);
  const me = await ok('GET', '/api/me', null, v.token);
  assert.equal(me.user.email, 'owner@shop.ir');
  assert.equal(me.user.role, 'owner');
  clock.t += 61_000;
  assert.ok(await emailLogin('owner@shop.ir'), 'and again, a minute later');
});

test('a wrong code counts tries; the fifth voids it; the code is asked of Supabase only when it has the right shape', async () => {
  const clock = { t: Date.now() };
  const { ok, call } = await boot({ env: withSupa(), clock });
  await ok('POST', '/api/auth/code', { email: 'owner@shop.ir' });
  const right = sb.codes.get('owner@shop.ir');
  const wrong = String((Number(right) + 1) % 1e6).padStart(6, '0');
  sb.calls.length = 0;
  const bad = await call('POST', '/api/auth/verify', { email: 'owner@shop.ir', code: 'abc' });
  assert.equal(bad.status, 401);
  assert.equal(sb.calls.length, 0, 'a code that is not digits never reaches Supabase');
  for (let i = 0; i < 3; i++) assert.match((await call('POST', '/api/auth/verify', { email: 'owner@shop.ir', code: wrong })).body.error, /درست نیست/);
  const fifth = await call('POST', '/api/auth/verify', { email: 'owner@shop.ir', code: wrong });
  assert.match(fifth.body.error, /باطل/);
  const late = await call('POST', '/api/auth/verify', { email: 'owner@shop.ir', code: right });
  assert.equal(late.status, 401, 'a voided code stays void even though Supabase would still take it');
  // the next code needs the minute between sends
  assert.equal((await call('POST', '/api/auth/code', { email: 'owner@shop.ir' })).status, 429);
  clock.t += 61_000;
  assert.equal((await call('POST', '/api/auth/code', { email: 'owner@shop.ir' })).status, 200);
});

test('Supabase down, or refusing an address its mailer does not serve: a plain sentence, never a session', async () => {
  const down = await boot({ env: withSupa({ BEATRIS_SUPABASE_URL: 'http://127.0.0.1:1' }) });
  const r = await down.call('POST', '/api/auth/code', { email: 'owner@shop.ir' });
  assert.equal(r.status, 502);
  assert.match(r.body.error, /در دسترس نیست/);
  const { call } = await boot({ env: withSupa() });
  sb.mode = 'refused';
  try {
    const x = await call('POST', '/api/auth/code', { email: 'owner@shop.ir' });
    assert.equal(x.status, 502);
    assert.match(x.body.error, /SMTP/);
  } finally {
    sb.mode = null;
  }
  const health = await (await fetch(`${(await boot({ env: withSupa() })).base}/api/health?deep=1`)).json();
  assert.equal(health.email, 'supabase');
});

test('an email nobody may sign in with gets the same answer, and nothing is sent; sign-up by email asks for the mobile', async () => {
  const clock = { t: Date.now() };
  const { ok, call, emailLogin } = await boot({ env: withSupa(), clock });
  const owner = await emailLogin('owner@shop.ir');
  await ok('PUT', '/api/vendor/signup', { open: false }, owner);
  sb.calls.length = 0;
  const silent = await ok('POST', '/api/auth/code', { email: 'stranger@mail.com' });
  assert.equal(silent.via, 'email');
  assert.equal(sb.calls.length, 0, 'nothing went to Supabase');
  await ok('PUT', '/api/vendor/signup', { open: true }, owner);
  clock.t += 61_000;
  await ok('POST', '/api/auth/code', { email: 'New.Shop@Mail.com' });
  const v = await ok('POST', '/api/auth/verify', { email: 'new.shop@mail.com', code: sb.codes.get('new.shop@mail.com') });
  assert.equal(v.signup, true);
  assert.equal(v.email, 'new.shop@mail.com');
  const noPhone = await call('POST', '/api/auth/finish', { ticket: v.ticket, name: 'سارا نو', shopName: 'گالری نو' });
  assert.equal(noPhone.status, 400);
  assert.match(noPhone.body.error, /موبایل/);
  const s = await ok('POST', '/api/auth/finish', { ticket: v.ticket, name: 'سارا نو', shopName: 'گالری نو', phone: '۰۹۱۳۴۴۴۵۵۶۶' });
  const me = await ok('GET', '/api/me', null, s.token);
  assert.equal(me.user.email, 'new.shop@mail.com');
  assert.equal(me.user.phone, '09134445566');
  assert.equal(me.user.role, 'owner');
});

test('emails are case-insensitive, checked, and one account per email in a shop (the same email may hold accounts in two shops)', async () => {
  const { ok, call, emailLogin } = await boot({ env: withSupa() });
  const owner = await emailLogin('owner@shop.ir');
  const shop = await ok('POST', '/api/vendor/tenants', { name: 'شعبه دوم', plan: 'full', phone: '09125556677', ownerName: 'همان مالک', ownerEmail: 'OWNER@shop.ir' }, owner);
  assert.equal(shop.owner.email, 'owner@shop.ir', 'the same email may open accounts in different shops');
  const dup = await call('POST', '/api/team', { name: 'دو', phone: '09120001111', email: 'Owner@SHOP.ir' }, owner);
  assert.equal(dup.status, 409, 'the owner already holds this email in the main shop');
  const a = await ok('POST', '/api/team', { name: 'نیما', phone: '09120002222', email: 'Nima@Mail.com' }, owner);
  assert.equal(a.user.email, 'nima@mail.com');
  assert.equal((await call('POST', '/api/team', { name: 'نیما ۲', phone: '09120003333', email: 'nima@MAIL.com' }, owner)).status, 409);
  assert.equal((await call('POST', '/api/team', { name: 'بد', phone: '09120004444', email: 'not-an-email' }, owner)).status, 400);
  const users = await ok('GET', `/api/vendor/tenants/${shop.tenant.id}/users`, null, owner);
  assert.equal(users.items[0].email, 'owner@shop.ir');
});

test('the shop picker: an email with accounts in two shops chooses one after the code', async () => {
  const clock = { t: Date.now() };
  const { ok, emailLogin } = await boot({ env: withSupa(), clock });
  const owner = await emailLogin('owner@shop.ir');
  const shop = await ok('POST', '/api/vendor/tenants', { name: 'شعبه دوم', plan: 'full', phone: '09125556677', ownerEmail: 'owner@shop.ir' }, owner);
  clock.t += 61_000;
  await ok('POST', '/api/auth/code', { email: 'owner@shop.ir' });
  const v = await ok('POST', '/api/auth/verify', { email: 'owner@shop.ir', code: sb.codes.get('owner@shop.ir') });
  assert.equal(v.shops.length, 2);
  const s = await ok('POST', '/api/auth/finish', { ticket: v.ticket, tenant: shop.tenant.id });
  assert.equal(s.tenant, shop.tenant.id);
  const me = await ok('GET', '/api/me', null, s.token);
  assert.equal(me.user.email, 'owner@shop.ir');
});

test('the team page and the vendor set emails; the person signs in with it; a changed email signs out the old sessions', async () => {
  const clock = { t: Date.now() };
  const { ok, call, emailLogin } = await boot({ env: withSupa(), clock });
  const owner = await emailLogin('owner@shop.ir');
  const { user } = await ok('POST', '/api/team', { name: 'زهرا', phone: '09120005555', role: 'employee', email: 'zahra@mail.com' }, owner);
  const z1 = await emailLogin('zahra@mail.com');
  assert.equal((await ok('GET', '/api/me', null, z1)).user.name, 'زهرا');
  await ok('PATCH', `/api/team/${user.id}`, { email: 'Zahra.New@Mail.com' }, owner);
  assert.equal((await call('GET', '/api/me', null, z1)).status, 401, 'the session of the old email is closed');
  clock.t += 61_000;
  assert.ok(await emailLogin('zahra.new@mail.com'));
  // the vendor console, for any shop
  const shop = await ok('POST', '/api/vendor/tenants', { name: 'شعبه سوم', plan: 'base', phone: '09126667788' }, owner);
  const staff = await ok('POST', `/api/vendor/tenants/${shop.tenant.id}/users`, { name: 'علی', phone: '09126660000', email: 'ali@mail.com' }, owner);
  assert.equal(staff.user.email, 'ali@mail.com');
  const patched = await ok('PATCH', `/api/vendor/tenants/${shop.tenant.id}/users/${staff.user.id}`, { email: 'ALI2@mail.com' }, owner);
  assert.equal(patched.user.email, 'ali2@mail.com');
  const s = await emailLogin('ali2@mail.com');
  assert.equal((await ok('GET', '/api/me', null, s)).user.name, 'علی');
  // the main owner's email follows Railway, as the mobile does
  const me = await ok('GET', '/api/me', null, owner);
  const own = await call('PATCH', `/api/vendor/tenants/main/users/${me.user.id}`, { email: 'other@mail.com' }, owner);
  assert.equal(own.status, 400);
  assert.match(own.body.error, /BEATRIS_OWNER_EMAIL/);
});

test('the link in the email: a session Supabase made from this sign-in opens the shop once; a password session or a stale link never', async () => {
  const clock = { t: Date.now() };
  const { ok, call } = await boot({ env: withSupa(), clock });
  // no sign-in was asked for this email yet: a link (even a real one) is refused
  const early = await call('POST', '/api/auth/verify', { accessToken: jwt('owner@shop.ir', 'otp') });
  assert.equal(early.status, 401);
  await ok('POST', '/api/auth/code', { email: 'owner@shop.ir' });
  const pw = await call('POST', '/api/auth/verify', { accessToken: jwt('owner@shop.ir', 'password') });
  assert.equal(pw.status, 401, 'a password session proves nothing about the inbox');
  const forged = await call('POST', '/api/auth/verify', { accessToken: `${b64({ alg: 'none' })}.${b64({ aud: 'authenticated', email: 'owner@shop.ir', amr: [{ method: 'otp', timestamp: Math.floor(Date.now() / 1000) }] })}.x` });
  assert.equal(forged.status, 401, 'a token Supabase did not issue');
  const old = await call('POST', '/api/auth/verify', { accessToken: jwt('owner@shop.ir', 'otp', Date.now() - 3_600_000) });
  assert.equal(old.status, 401, 'a session from before this sign-in');
  const link = jwt('owner@shop.ir', 'magiclink');
  const v = await ok('POST', '/api/auth/verify', { accessToken: link });
  assert.ok(v.token);
  assert.equal((await ok('GET', '/api/me', null, v.token)).user.email, 'owner@shop.ir');
  assert.equal((await call('POST', '/api/auth/verify', { accessToken: link })).status, 401, 'one link, one sign-in');
});

test('demo and development show the code on the page; production without Supabase is plain about it and keeps the owner PIN door', async () => {
  const demo = await boot({ demo: true });
  const d = await demo.ok('POST', '/api/auth/code', { email: 'Owner@Demo.Beatris.ir' });
  assert.equal(d.via, 'demo');
  assert.match(d.code, /^\d{6}$/);
  assert.ok(await demo.emailLogin('nima@demo.beatris.ir'));
  const cfg = await demo.ok('GET', '/api/config');
  assert.ok(cfg.demoAccounts.every((a) => /@demo\.beatris\.ir$/.test(a.email)), 'every demo account has its email');
  const dev = await boot({ env: OWNER });
  const x = await dev.ok('POST', '/api/auth/code', { email: 'owner@shop.ir' });
  assert.equal(x.via, 'dev');
  assert.ok(await dev.emailLogin('owner@shop.ir'));
  const prod = await boot({ env: { ...OWNER, NODE_ENV: 'production' } });
  const off = await prod.call('POST', '/api/auth/code', { email: 'someone@mail.com' });
  assert.equal(off.status, 503);
  assert.match(off.body.error, /Supabase/);
  const pinned = await boot({ env: { ...OWNER, NODE_ENV: 'production', BEATRIS_OWNER_PIN: '482913' } });
  const p = await pinned.ok('POST', '/api/auth/code', { email: 'owner@shop.ir' });
  assert.equal(p.via, 'owner-pin');
  assert.equal(p.code, undefined);
  assert.equal((await pinned.call('POST', '/api/auth/verify', { email: 'owner@shop.ir', code: '111111' })).status, 401);
  assert.ok((await pinned.ok('POST', '/api/auth/verify', { email: 'owner@shop.ir', code: '482913' })).token);
  const other = await pinned.call('POST', '/api/auth/code', { email: 'someone@mail.com' });
  assert.equal(other.status, 503, 'the PIN door is the owner email only');
});
