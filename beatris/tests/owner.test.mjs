// دیده‌بان (spec 0053): only the account the server's variables name sees the owner's dashboard; every sign-in step is
// recorded with where it came from; the screens' activity lands without ids or values; the numbers match what was
// seeded; no answer opens a document or a customer; old rows fold into daily sums; the live feed carries a sign-in.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.mjs';
import { createServer } from '../server/index.mjs';
import { seedUsers } from '../server/api.mjs';
import { foldPath, toCsv, whoOf } from '../server/owner.mjs';

const SECRET = 'test-secret-0123456789';
const ENV = { BEATRIS_OWNER_PHONE: '09121112233', BEATRIS_OWNER_NAME: 'مالک اصلی', BEATRIS_OWNER_EMAIL: 'owner@shop.ir' };
const UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36';
const XFF = '203.0.113.7, 10.1.2.3';
const CUSTOMER = 'سارا احمدیان‌فر';
let server, db, base;
const call = async (method, p, body, token, headers = {}) => {
  const r = await fetch(base + p, { method, headers: { 'content-type': 'application/json', 'user-agent': UA, 'x-forwarded-for': XFF, ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const ok = async (...a) => {
  const r = await call(...a);
  assert.ok(r.status < 300, `${a[0]} ${a[1]} → ${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
};
/** number → code → session, with the shop picked when the number has several */
async function login(phone, tenant) {
  const sent = await ok('POST', '/api/auth/code', { phone });
  let v = await ok('POST', '/api/auth/verify', { phone, code: sent.code });
  if (v.shops) v = await ok('POST', '/api/auth/finish', { ticket: v.ticket, tenant: tenant ?? v.shops[0].tenant });
  return v.token;
}
let O, D, M, T, shop;

before(async () => {
  db = openDb(':memory:');
  seedUsers(db, ENV, true);
  server = createServer({ db, secret: SECRET, demo: true, quiet: true, tenantsDir: ':memory:', env: ENV, otpOpts: { silentDelay: () => 0 }, marketOpts: { fetchImpl: async () => new Response('{}', { status: 404 }), defaultMode: 'off' } });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  O = await login(ENV.BEATRIS_OWNER_PHONE);
  D = await login('09120000001'); // the demo owner: an owner of the main shop, but not the one the variables name
  M = await login('09120000002');
  shop = await ok('POST', '/api/vendor/tenants', { name: 'گالری دوم', phone: '09367000001' }, O);
  T = await login('09367000001');
  // books: a customer, a sale and a receipt, one printed
  const p = (await ok('POST', '/api/books/parties', { name: CUSTOMER, mobile: '09125556677' }, M)).party ?? (await ok('GET', `/api/books/parties?q=${encodeURIComponent('احمدیان')}`, null, M)).items[0];
  await ok('POST', '/api/books/docs', { type: 'trade', partyId: p.id, lines: [{ kind: 'melt', dir: 'out', weight: 2, fineness: 750, mazaneh: 400000000 }], payments: [{ method: 'cash', dir: 'in', amount: 184680000 }] }, M);
  const r = await ok('POST', '/api/books/docs', { type: 'receipt', partyId: p.id, payments: [{ method: 'cash', dir: 'in', amount: 9000 }] }, M);
  await ok('POST', `/api/books/docs/${r.id}/event`, { kind: 'print' }, M);
});
after(() => {
  server.close();
  server.bus.stop();
});

const ENDPOINTS = ['overview', 'signups', 'logins', 'users', 'behavior', 'shops', 'io', 'export?what=logins', 'export?what=users', 'export?what=shops', 'export?what=signups'];

test('only the owner the variables name: no session 401; the demo owner, a manager and another shop’s owner 403', async () => {
  for (const e of ENDPOINTS) {
    assert.equal((await call('GET', `/api/owner/${e}`)).status, 401, e);
    for (const t of [D, M, T]) assert.equal((await call('GET', `/api/owner/${e}`, null, t)).status, 403, e);
    assert.equal((await call('GET', `/api/owner/${e}`, null, O)).status, 200, e);
  }
  assert.equal((await ok('GET', '/api/me', null, O)).owner, true);
  for (const t of [D, M, T]) assert.equal((await ok('GET', '/api/me', null, t)).owner, false);
  assert.equal((await call('GET', '/api/owner/nope', null, O)).status, 404);
  assert.equal((await call('GET', '/api/owner/export?what=nope', null, O)).status, 400);
  assert.equal((await call('POST', '/api/owner/overview', {}, O)).status, 405);
});

test('every sign-in step lands with the IP, the raw chain and the device; a sign-out everywhere too', async () => {
  const before = db.get('SELECT MAX(id) AS id FROM auth_log').id;
  // a wrong code; then, from another network, wrong codes until that network is stopped (blocked)
  await ok('POST', '/api/auth/code', { phone: '09120000004' });
  assert.equal((await call('POST', '/api/auth/verify', { phone: '09120000004', code: '000000' })).status, 401);
  // a network stops after 30 wrong codes (five a code, then the code is void and a new one is asked for)
  const other = { 'x-forwarded-for': '198.51.100.9' };
  for (let round = 0; round < 6; round++) {
    await ok('POST', '/api/auth/code', { phone: '09120000004' }, null, other);
    for (let i = 0; i < 5; i++) await call('POST', '/api/auth/verify', { phone: '09120000004', code: '000000' }, null, other);
  }
  assert.equal((await call('POST', '/api/auth/verify', { phone: '09120000004', code: '000000' }, null, other)).status, 429);
  // a new number with sign-up open: the code is accepted (pick), then a shop is made (signup)
  await ok('PUT', '/api/vendor/signup', { open: true, plan: 'base', trialDays: 14 }, O);
  const sent = await ok('POST', '/api/auth/code', { phone: '09351234567' });
  const v = await ok('POST', '/api/auth/verify', { phone: '09351234567', code: sent.code });
  assert.ok(v.signup);
  const made = await ok('POST', '/api/auth/finish', { ticket: v.ticket, name: 'کاوه نو', shopName: 'گالری ثبت‌نام' });
  assert.ok(made.token);
  assert.equal(made.signedUp, undefined, 'the marker stays inside the server');
  const N = made.token;
  await ok('POST', '/api/auth/logout-all', {}, N);
  const rows = db.all('SELECT * FROM auth_log WHERE id>? ORDER BY id', before);
  const kinds = rows.map((r) => `${r.kind}:${r.ok}`);
  for (const k of ['code:1', 'verify_fail:0', 'blocked:0', 'pick:1', 'signup:1', 'logout_all:1']) assert.ok(kinds.includes(k), `${k} in ${kinds.join(' ')}`);
  for (const r of rows) {
    if (r.ip === '198.51.100.9') continue;
    assert.equal(r.ip, '203.0.113.7', 'the leftmost entry, as today (spec 0054)');
    assert.equal(r.xff, XFF);
    assert.equal(r.device, 'Chrome روی اندروید');
  }
  assert.ok(rows.some((r) => r.kind === 'blocked' && r.ip === '198.51.100.9'));
  const signup = rows.find((r) => r.kind === 'signup');
  assert.match(signup.tenant_id, /^t_[0-9a-f]{12}$/);
  assert.ok(signup.user_id);
  assert.equal(rows.find((r) => r.kind === 'verify_fail').who, '0912…004', 'an unknown person is half-hidden');
  // the table names a known person by name and shop
  const l = await ok('GET', '/api/owner/logins?days=1', null, O);
  const s = l.rows.find((r) => r.kind === 'signup');
  assert.equal(s.who, 'کاوه نو');
  assert.equal(s.shop, 'گالری ثبت‌نام');
  assert.equal(l.failedByIp[0].key, '198.51.100.9');
  assert.ok(l.failedByIp[0].n >= 31);
  assert.ok(l.failedByWho.some((g) => g.key === '0912…004'));
  assert.equal(l.kinds.login.ok, 3, 'the demo owner, the manager, the second shop: the owner left out');
  assert.equal((await ok('GET', '/api/owner/logins?days=1&ok=0', null, O)).rows.every((r) => !r.ok), true);
  assert.ok((await ok('GET', `/api/owner/logins?days=1&q=${encodeURIComponent('کاوه')}`, null, O)).rows.every((r) => r.who === 'کاوه نو'));
});

test('the screens: pages without ids, presses by name, a beat a minute, nothing typed; the owner’s own steps left out unless asked', async () => {
  assert.equal(foldPath('/books/doc/0f8e2a9c-1b2d-4e5f-9a0b-1c2d3e4f5a6b/edit?x=1'), '/books/doc/:id/edit');
  assert.equal(foldPath('/staff/t_0123456789ab'), '/staff/:id');
  assert.equal((await call('POST', '/api/act', { events: [{ kind: 'view' }] })).status, 401);
  const sid = 'tab0123456789ab';
  const r = await ok('POST', '/api/act', { events: [
    { kind: 'view', path: '/books/doc/0f8e2a9c-1b2d-4e5f-9a0b-1c2d3e4f5a6b', ms: 5000, sid },
    { kind: 'act', name: 'save', path: '/books/desk', sid },
    { kind: 'error', name: 'toast', path: '/books/desk', sid },
    { kind: 'beat', path: '/books/desk', sid },
    { kind: 'beat', path: '/books/desk', sid },
    { kind: 'nope', path: '/x', sid, value: '۱۲۳٬۰۰۰ ریال' },
  ] }, M);
  assert.equal(r.stored, 4, 'the second beat of the minute and an unknown kind are dropped');
  const rows = db.all("SELECT * FROM act_events WHERE sid=? ORDER BY id", sid);
  assert.deepEqual(rows.map((x) => x.kind), ['view', 'act', 'error', 'beat']);
  assert.equal(rows[0].path, '/books/doc/:id');
  assert.equal(rows[0].ms, 5000);
  assert.ok(!JSON.stringify(rows).includes('ریال'));
  // the owner's own activity
  await ok('POST', '/api/act', { events: [{ kind: 'view', path: '/owner', ms: 1000, sid: 'owner-tab' }] }, O);
  const b = await ok('GET', '/api/owner/behavior?days=7', null, O);
  assert.ok(!b.pages.some((p) => p.path === '/owner'));
  assert.ok((await ok('GET', '/api/owner/behavior?days=7&self=1', null, O)).pages.some((p) => p.path === '/owner'));
  assert.ok(b.pages.some((p) => p.path === '/books/doc/:id' && p.ms === 5000));
  assert.ok(b.actions.some((a) => a.name === 'save'));
  assert.equal(b.heat.length, 7);
  assert.equal(b.heat[0].length, 24);
  assert.ok(b.heat.flat().reduce((s, n) => s + n, 0) >= 3);
  const u = await ok('GET', '/api/owner/users?days=7', null, O);
  const sara = u.users.find((x) => x.name === 'سارا موسوی');
  assert.equal(sara.minutes, 1);
  assert.equal(sara.sessions, 1);
  assert.deepEqual(sara.topPages[0], ['/books/doc/:id', 1]);
  assert.ok(!u.users.some((x) => x.name === 'مالک اصلی'), 'the owner is left out');
  const tl = await ok('GET', `/api/owner/users/main/${sara.id}?days=7`, null, O);
  assert.equal(tl.user.name, 'سارا موسوی');
  assert.ok(tl.events.some((e) => e.kind === 'act' && e.name === 'save'));
  assert.ok(tl.auths.some((a) => a.kind === 'login'));
  assert.equal(tl.sessions[0].sid, sid);
  assert.equal((await call('GET', '/api/owner/users/main/nobody?days=7', null, O)).status, 404);
});

test('the numbers match what was made: users, shops, documents, outputs, codes', async () => {
  const o = await ok('GET', '/api/owner/overview?days=7', null, O);
  // independent count: every active account in every shop, the owner left out
  let expect = 0;
  for (const [, sdb] of server.platform.allShops()) expect += sdb.get('SELECT COUNT(*) AS n FROM users WHERE active=1').n;
  assert.equal(o.users.total, expect - 1);
  assert.equal(o.shops.total, 2);
  assert.equal(o.docs.final, 2);
  assert.equal(o.outputs.print, 1);
  assert.ok(o.logins.ok === 4 && o.logins.failed >= 31 && o.logins.blocked >= 1, JSON.stringify(o.logins));
  assert.equal(o.dayList.length, 7);
  assert.equal(o.series.docs.at(-1), 2);
  assert.ok(o.dau >= 1 && o.online >= 1);
  const sg = await ok('GET', '/api/owner/signups?days=7', null, O);
  assert.equal(sg.totals.shops, 2);
  assert.equal(sg.totals.bySignup, 1);
  assert.deepEqual(sg.shops.map((x) => x.by).sort(), ['signup', 'vendor']);
  assert.equal(sg.shops.find((x) => x.by === 'signup').owner, 'کاوه نو');
  assert.ok(sg.shops.find((x) => x.by === 'signup').firstLogin);
  const sh = await ok('GET', '/api/owner/shops?days=7', null, O);
  const main = sh.shops.find((x) => x.main);
  assert.equal(main.docs.trade.final, 1);
  assert.equal(main.docs.receipt.final, 1);
  assert.equal(main.outputs.print, 1);
  assert.equal(main.made, 2);
  assert.equal(main.g750, 2, 'two grams of 750 sold');
  assert.ok(main.turnover > 0);
  const io = await ok('GET', '/api/owner/io?days=7', null, O);
  assert.equal(io.inputs.created, 2);
  assert.equal(io.outputs.print, 1);
  assert.ok(io.outputs.codes >= 6);
  assert.ok(io.codesByVia.length >= 1);
  assert.equal(io.series.in.at(-1), 2);
});

test('no answer opens a customer or a document’s content', async () => {
  for (const e of ENDPOINTS) {
    const r = await ok('GET', `/api/owner/${e}${e.includes('?') ? '&' : '?'}days=30&self=1`, null, O);
    const s = JSON.stringify(r);
    assert.ok(!s.includes(CUSTOMER) && !s.includes('احمدیان'), `${e} names the customer`);
    assert.ok(!s.includes('data_json') && !s.includes('09125556677'), `${e} carries document content`);
  }
});

test('rows older than 180 days fold into daily sums and go; CSV has a header and one line a row', async () => {
  const old = new Date(Date.now() - 200 * 864e5).toISOString();
  db.run("INSERT INTO act_events(at,tenant_id,user_id,sid,kind,path,name,ms) VALUES (?,?,?,?,?,?,?,?)", old, 'main', 'u-old', 's-old', 'view', '/books', '', 4000);
  db.run("INSERT INTO act_events(at,tenant_id,user_id,sid,kind,path,name,ms) VALUES (?,?,?,?,?,?,?,?)", old, 'main', 'u-old', 's-old', 'view', '/books', '', 1000);
  db.run("INSERT INTO auth_log(at,kind,user_id,tenant_id,ok) VALUES (?,?,?,?,?)", old, 'verify_fail', null, null, 0);
  const r = server.owner.prune();
  assert.ok(r.folded >= 3);
  assert.equal(db.get('SELECT COUNT(*) AS n FROM act_events WHERE at<?', r.before).n, 0);
  assert.equal(db.get('SELECT COUNT(*) AS n FROM auth_log WHERE at<?', r.before).n, 0);
  const day = old.slice(0, 10);
  assert.deepEqual({ ...db.get("SELECT n, ms FROM act_daily WHERE day=? AND user_id='u-old' AND kind='view'", day) }, { n: 2, ms: 5000 });
  assert.equal(db.get("SELECT n FROM act_daily WHERE day=? AND kind='auth.verify_fail.fail'", day).n, 1);
  const csv = await ok('GET', '/api/owner/export?what=logins&days=7', null, O);
  assert.equal(csv.mime, 'text/csv');
  assert.match(csv.filename, /^beatris-logins-7d\.csv$/);
  assert.ok(csv.text.startsWith('\uFEFFزمان,نوع'), 'a byte-order mark first, so a spreadsheet reads the Persian');
  const lines = csv.text.replace(/\r\n$/, '').split('\r\n');
  assert.equal(lines.length, (await ok('GET', '/api/owner/logins?days=7', null, O)).total + 1);
  assert.equal(toCsv(['a'], [['x,"y"']]), '\uFEFFa\r\n"x,""y"""\r\n');
  assert.equal(whoOf({ email: 'Reza@Mail.com' }), 'r…@m…l.com');
  assert.equal(whoOf({ phone: '۰۹۱۲۳۴۵۶۷۸۹' }), '0912…789');
});

test('the live feed sends a sign-in as it happens; only to the owner', async () => {
  assert.equal((await call('GET', '/api/owner/stream', null, M)).status, 403);
  const ctl = new AbortController();
  const r = await fetch(`${base}/api/owner/stream`, { headers: { authorization: `Bearer ${O}` }, signal: ctl.signal });
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /text\/event-stream/);
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  const until = async (re) => {
    const t0 = Date.now();
    while (!re.test(buf)) {
      if (Date.now() - t0 > 5000) throw new Error(`no ${re} in ${buf}`);
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
    }
  };
  await until(/event: hello/);
  await login('09120000003');
  await until(/event: auth\ndata: .*"kind":"login"/);
  assert.match(buf, /نیلوفر احمدی/);
  await ok('POST', '/api/act', { events: [{ kind: 'act', name: 'open', path: '/learn', sid: 'live-tab' }] }, M);
  await until(/event: act\ndata: .*"name":"open"/);
  ctl.abort();
});
