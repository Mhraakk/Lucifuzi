// سخت‌کردن تولید (spec 0054): a server on a host (Render sets RENDER, without NODE_ENV) is production — no code on
// screen, no demo accounts, no demo vendor, no fixed PIN once email works; the day close is signed by email when
// there is no SMS; an edit or void after printing is flagged; every shop and the uploaded photos are backed up; deep
// health says whether the data folder survives a redeploy; a brief never fails on a setting the engine cannot build.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openDb } from '../server/db.mjs';
import { createServer, demoFrom, rateLimitFrom } from '../server/index.mjs';
import { seedUsers } from '../server/api.mjs';
import { isProd, maskEmail } from '../server/auth.mjs';
import { createOtp } from '../server/otp.mjs';
import { storageOf } from '../server/backup.mjs';
import { smsLogin } from './helpers/login.mjs';
import { parseBrief } from '../public/js/studio/brief.mjs';
import { paramsFromIntent, programOf, manufacturingFindings } from '../public/js/studio/design.mjs';

const SECRET = 'test-secret-0123456789';
const KEY = 'sb_publishable_test_key_0123456789';
const quietMarket = { fetchImpl: async () => new Response('{}', { status: 404 }), defaultMode: 'off' };
const OWNER = { BEATRIS_OWNER_PHONE: '09121112233', BEATRIS_OWNER_NAME: 'مالک', BEATRIS_OWNER_EMAIL: 'owner@shop.ir' };
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran' }).format(new Date());

// a stand-in for Supabase Auth: it keeps the code it would have emailed
const codes = new Map();
let supa, SUPA;
const servers = [];
const temps = [];
before(async () => {
  supa = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const body = raw ? JSON.parse(raw) : {};
      const send = (status, j) => (res.writeHead(status, { 'content-type': 'application/json' }), res.end(JSON.stringify(j)));
      if (req.headers.apikey !== KEY) return send(401, { message: 'Invalid API key' });
      const p = new URL(req.url, 'http://x').pathname;
      if (p === '/auth/v1/otp') {
        codes.set(body.email, String(100000 + Math.floor(Math.random() * 899999)));
        return send(200, {});
      }
      if (p === '/auth/v1/verify') {
        if (codes.get(body.email) !== body.token) return send(403, { code: 403, error_code: 'otp_expired', msg: 'Token has expired or is invalid' });
        codes.delete(body.email);
        return send(200, { access_token: 'x.y.z', token_type: 'bearer', user: { email: body.email } });
      }
      send(404, { message: 'not found' });
    });
  });
  await new Promise((r) => supa.listen(0, '127.0.0.1', r));
  SUPA = `http://127.0.0.1:${supa.address().port}`;
});
after(() => {
  for (const s of servers) s.close();
  supa.close();
  for (const d of temps) rmSync(d, { recursive: true, force: true });
});
const temp = (name) => {
  const d = mkdtempSync(path.join(tmpdir(), `${name}-`));
  temps.push(d);
  return d;
};

async function boot({ env = {}, demo = false, db = null, clock = null, mediaDir } = {}) {
  const d = db ?? openDb(':memory:');
  seedUsers(d, env, demo);
  const server = createServer({ db: d, secret: SECRET, demo, quiet: true, env, ...(db ? {} : { tenantsDir: ':memory:' }), ...(mediaDir ? { mediaDir } : {}), otpOpts: { silentDelay: () => 0, ...(clock ? { now: () => clock.t } : {}) }, marketOpts: quietMarket });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  servers.push(server);
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, p, body, token) => {
    const r = await fetch(base + p, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  const ok = async (...a) => {
    const r = await call(...a);
    assert.ok(r.status < 300, `${a[0]} ${a[1]} → ${r.status} ${JSON.stringify(r.body)}`);
    return r.body;
  };
  return { db: d, base, call, ok, server };
}

test('production is NODE_ENV=production, or a host (Render, Railway) unless NODE_ENV names a development or test run', () => {
  assert.equal(isProd({}), false);
  assert.equal(isProd({ NODE_ENV: 'production' }), true);
  assert.equal(isProd({ RENDER: 'true' }), true, 'Render sets RENDER and nothing sets NODE_ENV');
  assert.equal(isProd({ RAILWAY_ENVIRONMENT: 'production' }), true);
  assert.equal(isProd({ RENDER: 'true', NODE_ENV: 'development' }), false);
  assert.equal(isProd({ RENDER: 'true', NODE_ENV: 'test' }), false);
  // demo accounts only outside production; the per-IP ceiling from BEATRIS_RATE_LIMIT
  assert.deepEqual(demoFrom({ BEATRIS_DEMO: 'true' }), { asked: true, on: true });
  assert.deepEqual(demoFrom({ BEATRIS_DEMO: 'true', RENDER: 'true' }), { asked: true, on: false });
  assert.deepEqual(demoFrom({ BEATRIS_DEMO_OTP: 'true', NODE_ENV: 'production' }), { asked: true, on: false });
  assert.deepEqual(demoFrom({}), { asked: false, on: false });
  assert.equal(rateLimitFrom({}), 1500);
  assert.equal(rateLimitFrom({ BEATRIS_RATE_LIMIT: '300' }), 300);
  for (const v of ['0', '-5', 'abc', '']) assert.equal(rateLimitFrom({ BEATRIS_RATE_LIMIT: v }), 1500, v);
  // an email is shown with one letter of each part, whatever the domain
  assert.equal(maskEmail('owner@shop.ir'), 'o…@s…p.ir');
  assert.equal(maskEmail('reza.karimi@ut.ac.ir'), 'r…@u…c.ir');
});

test('on a host without NODE_ENV the sign-in code never comes back to the page (it does in development)', async () => {
  const dev = await boot({ env: OWNER });
  assert.match((await dev.ok('POST', '/api/auth/code', { phone: OWNER.BEATRIS_OWNER_PHONE })).code, /^\d{6}$/);
  const prod = await boot({ env: { ...OWNER, RENDER: 'true' } });
  for (const body of [{ phone: OWNER.BEATRIS_OWNER_PHONE }, { email: OWNER.BEATRIS_OWNER_EMAIL }]) {
    const r = await prod.call('POST', '/api/auth/code', body);
    assert.equal(r.body?.code, undefined, JSON.stringify(r.body));
  }
});

test('a demo owner is never the vendor in production, even if demo accounts were forced on', async () => {
  const dev = await boot({ demo: true });
  const D = await smsLogin(dev.base, '09120000001');
  assert.equal((await dev.ok('GET', '/api/me', null, D)).vendor, true, 'in development the demo owner tries the vendor console');
  const prod = await boot({ env: { RENDER: 'true' }, demo: true });
  const P = await smsLogin(prod.base, '09120000001');
  assert.equal((await prod.ok('GET', '/api/me', null, P)).vendor, false);
  assert.equal((await prod.call('GET', '/api/vendor/tenants', null, P)).status, 403);
  assert.equal((await prod.call('GET', '/api/ops/metrics', null, P)).status, 403);
});

test("the vendor's fixed PIN opens only while neither SMS nor email can send a code", () => {
  const pin = { NODE_ENV: 'production', BEATRIS_OWNER_PHONE: OWNER.BEATRIS_OWNER_PHONE, BEATRIS_OWNER_PIN: '135790' };
  const otp = (env) => createOtp({ db: openDb(':memory:'), secret: SECRET, env, quiet: true });
  assert.equal(otp(pin).ownerPinOpen(), true);
  assert.equal(otp({ ...pin, BEATRIS_SUPABASE_URL: 'https://abcd.supabase.co', BEATRIS_SUPABASE_KEY: KEY }).ownerPinOpen(), false);
});

test('without SMS the day close is signed with a code sent to the signer’s email; a wrong code is refused', async () => {
  const clock = { t: Date.now() };
  const { ok, call } = await boot({ env: { ...OWNER, RENDER: 'true', BEATRIS_SUPABASE_URL: SUPA, BEATRIS_SUPABASE_KEY: KEY }, clock });
  const sent = await ok('POST', '/api/auth/code', { email: OWNER.BEATRIS_OWNER_EMAIL });
  assert.equal(sent.via, 'email');
  let v = await ok('POST', '/api/auth/verify', { email: OWNER.BEATRIS_OWNER_EMAIL, code: codes.get(OWNER.BEATRIS_OWNER_EMAIL) });
  if (v.shops) v = await ok('POST', '/api/auth/finish', { ticket: v.ticket, tenant: v.shops[0].tenant });
  const O = v.token;
  clock.t += 61_000; // one code a minute per address
  const sign = await ok('POST', '/api/auth/sign-code', {}, O);
  assert.equal(sign.via, 'email');
  assert.equal(sign.email, 'o…@s…p.ir', 'the address, half-hidden');
  assert.equal(sign.code, undefined);
  const view = await ok('GET', `/api/books/close?day=${today}`, null, O);
  const ack = view.checks.filter((c) => !c.ok).map((c) => c.key);
  const body = { day: today, ack, note: 'موارد باز فردا بررسی می‌شود' };
  const right = codes.get(OWNER.BEATRIS_OWNER_EMAIL);
  const wrong = await call('POST', '/api/books/close', { ...body, code: right === '999999' ? '111111' : '999999' }, O);
  assert.equal(wrong.status, 403);
  const c = await ok('POST', '/api/books/close', { ...body, code: right }, O);
  assert.ok(c.hash);
  assert.equal((await ok('GET', `/api/books/close/${today}/verify`, null, O)).valid, true);
});

test('a void after the document was printed or sent says so in the exceptions; harness events of the desk are stored', async () => {
  const { ok, base } = await boot({ demo: true });
  const M = await smsLogin(base, '09120000002');
  const P = (await ok('POST', '/api/books/parties', { name: 'سارا احمدی' }, M)).party ?? (await ok('GET', '/api/books/parties?q=سارا', null, M)).items[0];
  const quiet = await ok('POST', '/api/books/docs', { type: 'receipt', partyId: P.id, payments: [{ method: 'cash', dir: 'in', amount: 7000 }] }, M);
  const printed = await ok('POST', '/api/books/docs', { type: 'receipt', partyId: P.id, payments: [{ method: 'cash', dir: 'in', amount: 9000 }] }, M);
  await ok('POST', `/api/books/docs/${printed.id}/event`, { kind: 'print' }, M);
  await ok('POST', `/api/books/docs/${quiet.id}/void`, { reason: 'ثبت اشتباه' }, M);
  await ok('POST', `/api/books/docs/${printed.id}/void`, { reason: 'ثبت اشتباه' }, M);
  const items = (await ok('GET', '/api/books/control/exceptions?all=1', null, M)).items;
  const a = items.find((x) => x.key === `void:${printed.id}`);
  const b = items.find((x) => x.key === `void:${quiet.id}`);
  assert.match(a.detail, /پیش از ابطال چاپ یا ارسال شده بود/);
  assert.doesNotMatch(b.detail, /چاپ/);
  assert.ok(a.p > b.p, 'printed first, then voided: more likely to matter');
  // the desk's card-reader and quote events reach the harness; an unknown kind does not
  const r = await ok('POST', '/api/books/events', { events: [{ kind: 'desk.paycard', path: '/desk', data: { amount: 1, via: 'relay' } }, { kind: 'desk.quote', path: '/desk', data: { kind: 'sell' } }, { kind: 'nope' }] }, M);
  assert.equal(r.stored, 2);
});

test('backups take every shop, a suspended one too, and the uploaded photos; deep health names the data folder', async () => {
  const dir = temp('hard');
  const media = path.join(dir, 'media');
  mkdirSync(path.join(media, 'coins'), { recursive: true });
  writeFileSync(path.join(media, 'coins', 'c_0123456789ab.jpg'), 'jpeg');
  const { ok, call, base } = await boot({ db: openDb(dir, 'main.db'), demo: true, mediaDir: media });
  const V = await smsLogin(base, '09120000001');
  const shop = await ok('POST', '/api/vendor/tenants', { name: 'فروشگاه دوم', phone: '09367000001' }, V);
  await ok('PATCH', `/api/vendor/tenants/${shop.tenant.id}`, { status: 'suspended' }, V);
  const b = await ok('POST', '/api/ops/backup', null, V);
  assert.deepEqual(b.files.map((f) => f.name), ['main', shop.tenant.id]);
  assert.deepEqual(b.files.map((f) => f.integrity), ['ok', 'ok']);
  assert.equal(b.media, 1);
  assert.ok(existsSync(path.join(b.dir, 'media', 'coins', 'c_0123456789ab.jpg')));
  const h = (await call('GET', '/api/health?deep=1')).body;
  assert.equal(typeof h.data.persistent, process.platform === 'linux' ? 'boolean' : 'object');
  // a database in memory has no folder at all
  assert.deepEqual((await (await boot()).call('GET', '/api/health?deep=1')).body.data, { mount: null, persistent: null });
});

test('the data folder is on a disk of its own only when a mount other than / holds it', () => {
  const f = path.join(temp('mounts'), 'mounts');
  writeFileSync(f, ['overlay / overlay rw 0 0', '/dev/sdb /data ext4 rw 0 0', '/dev/sdc /data2 ext4 rw 0 0', 'tmpfs /dev/shm tmpfs rw 0 0', ''].join('\n'));
  assert.deepEqual(storageOf('/data', f), { mount: '/data', persistent: true });
  assert.deepEqual(storageOf('/data/tenants', f), { mount: '/data', persistent: true });
  assert.deepEqual(storageOf('/data2', f), { mount: '/data2', persistent: true });
  assert.deepEqual(storageOf('/opt/render/project/src/beatris/data', f), { mount: '/', persistent: false });
  assert.deepEqual(storageOf('/database', f), { mount: '/', persistent: false }, 'a name that starts like a mount is not on it');
  assert.deepEqual(storageOf('/data', path.join(f, 'missing')), { mount: null, persistent: null });
});

test('studio: «رکاب» is the shank, not a bezel; a setting the engine cannot build is checked by its rules and named, never a failed run', async () => {
  assert.equal(parseBrief('انگشتر با رکاب ظریف، سنگ گرد ۵ میل').stone.setting, 'prong');
  const intent = parseBrief('انگشتر قاب‌دار با سنگ گرد ۵ میل');
  assert.equal(intent.stone.setting, 'bezel');
  const p = paramsFromIntent(intent);
  assert.deepEqual(programOf(p).map((o) => o.op), ['shank']);
  const f = manufacturingFindings({ closed: true, solids: 1, objects: [], material: p.material }, p);
  const note = f.find((x) => x.code === 'SETTING_NOT_MODELLED');
  assert.equal(note.severity, 'info');
  assert.match(note.explanationFa, /قاب‌دار/);
  assert.deepEqual(programOf(paramsFromIntent(parseBrief('انگشتر سنگ گرد ۵ میل چنگی'))).map((o) => o.op), ['shank', 'stoneSetting']);
  // the whole run, as the page asks it
  const { ok, base } = await boot({ demo: true });
  const E = await smsLogin(base, '09120000004');
  const r = await ok('POST', '/api/studio/design', { brief: 'انگشتر ۱۸ عیار قاب‌دار، سنگ گرد ۵ میل، سایز ۵۴', key: 'design-key-bezel' }, E);
  assert.ok(r.weight > 0);
  assert.ok(r.findings.engineering.some((x) => x.code === 'SETTING_NOT_MODELLED'));
});
