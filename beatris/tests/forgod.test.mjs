// forgod prices (spec 0049): rows shaped exactly like the service's answers (made-up numbers, a made-up key), read into
// the board, the currency table and the shop's base price; the fallback to the single addresses; the key kept out of
// everything the app stores or shows.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.mjs';
import { createServer } from '../server/index.mjs';
import { seedUsers } from '../server/api.mjs';
import { createMarket, parseForgod, defaultFeedMode, forgodPlan, FEED_LABEL, FORGOD_SINGLES } from '../server/market.mjs';
import { SYMBOLS, sampleMarket } from '../public/js/market.mjs';
import { MAZANEH_TO_G750 } from '../public/js/calc.mjs';
import { smsLogin } from './helpers/login.mjs';

const KEY = 'fg-test-KEY-0123456789abcdefABCDEF';
const BASE = 'https://forgod.example.com';
const NOW = new Date('2026-10-26T13:20:00Z'); // 16:50 in Tehran
const STAMP = '2026-10-26T13:18:24.790211Z'; // 16:48 in Tehran
const row = (code, name, price, time, section, extra = {}) => ({ code, name, price, change: '', time, section, ...extra });
// 18k gram 24,200,000 ≈ ounce 4,000 ÷ 31.1035 × 0.75 × dollar 250,000 (24,113,000); bitcoin = 80,000 × 250,000
const ALL = (over = {}) => ({
  sections: {
    currencies: [
      row('usd', 'دلار', '250,000', '16:48:45', 'currencies'),
      row('eur', 'یورو', '290,000', '16:48:44', 'currencies'),
      row('aed_note', 'درهم امارات', '68,000', '16:48:44', 'currencies'),
      row('try', 'لیر ترکیه', '5,000', '15:44:35', 'currencies'),
      row('jpy', 'ین ژاپن', '160,000', '16:48:44', 'currencies'),
    ],
    gold: [
      row('usd_xau', 'انس طلا', '4,000.00', '16:48:10', 'gold'),
      row('18ayar', 'طلای 18 عیار', '24,200,000', '16:48:16', 'gold'),
      row('abshodeh', 'مثقال طلا', '104,830,000', '16:48:44', 'gold'),
      row('sekkeh', 'سکه امامی', '250,000,000', '16:48:44', 'gold'),
      row('bahar', 'سکه بهار آزادی', '242,000,000', '16:48:45', 'gold'),
      row('nim', 'نیم سکه', '130,000,000', '16:40:07', 'gold'),
      row('rob', 'ربع سکه', '70,000,000', '16:27:56', 'gold'),
      row('gerami', 'سکه گرمی', '35,000,000', '23:50:06', 'gold'), // after 16:48: yesterday's last quote
    ],
    bubbles: [row('bub_sekkeh', 'حباب سکه امامی', '11,190,000', '16:48:43', 'bubbles')],
    crypto: [
      row('usd_btc', 'بیت کوین', '20,000,000,000', '16:46:44', 'crypto', { change: '391.17 (0.49%)', usd_price: '80000.00' }),
      row('usd_usdt', 'تتر', '249,500', '11:25:33', 'crypto', { usd_price: '1' }),
      row('usd_ton', 'تون‌کوین', '601,400', '26 خرداد', 'crypto', { usd_price: '2.2' }), // an old quote: a date, no clock
    ],
  },
  last_updated: STAMP,
  stale: false,
  ...over,
});
const single = (code) => {
  const r = Object.values(ALL().sections).flat().find((x) => x.code === code);
  return { ...r, last_updated: STAMP, stale: false };
};
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

test('forgod: every row lands on its symbol, in toman, with the day of its own clock time', () => {
  const r = parseForgod(ALL(), { now: NOW });
  assert.equal(r.error, null);
  assert.equal(r.stale, false);
  const p = Object.fromEntries(Object.entries(r.live).map(([id, q]) => [id, q.p]));
  assert.deepEqual(p, { mesghal: 104830000, geram18: 24200000, sekee: 250000000, sekeb: 242000000, nim: 130000000, rob: 70000000, gerami: 35000000, usd: 250000, ons: 4000, btc: 20000000000, geram24: 32267000 });
  assert.equal(r.live.geram18.d, '2026-10-26');
  assert.equal(r.live.gerami.d, '2026-10-25'); // 23:50 is after the 16:48 of the update: the day before
  assert.ok(r.skipped.includes('usd_ton'));
  // the currency table: AED from «aed_note», the yen per 100, tether from the crypto section, the old TON row left out
  assert.deepEqual(r.fx.rates.map((x) => [x.code, x.p, x.per]), [['USD', 250000, 1], ['EUR', 290000, 1], ['AED', 68000, 1], ['TRY', 5000, 1], ['JPY', 160000, 100], ['USDT', 249500, 1]]);
  assert.equal(r.fx.rates.find((x) => x.code === 'EUR').name, 'یورو');
  assert.equal(r.fx.btcUsd, 80000);
  assert.equal(r.at, new Date(STAMP).toISOString());
});

test('forgod: the gram and the mazaneh fill in for each other; one address alone reads like /api/all', () => {
  const g = parseForgod([single('18ayar')], { now: NOW }).live;
  assert.equal(g.mesghal.p, Math.round((24200000 * MAZANEH_TO_G750) / 1000) * 1000);
  assert.equal(g.geram24.p, 32267000);
  const m = parseForgod([single('abshodeh')], { now: NOW }).live;
  assert.equal(m.geram18.p, Math.round(104830000 / MAZANEH_TO_G750 / 1000) * 1000);
  const three = parseForgod(FORGOD_SINGLES.map(([, path]) => single(path)), { now: NOW });
  assert.deepEqual(Object.keys(three.live).sort(), ['btc', 'geram18', 'geram24', 'mesghal', 'usd']);
  assert.equal(three.fx, null); // a currency table only from the full answer
});

test('forgod: stale prices, a rial/toman mix-up and a wrong bitcoin are caught', () => {
  assert.equal(parseForgod(ALL({ stale: true }), { now: NOW }).stale, true);
  assert.equal(parseForgod([{ ...single('usd'), stale: true }], { now: NOW }).stale, true);
  // the same answer in rial (×10, the ounce still in dollars): the gram is ten times ounce × dollar
  const rial = ALL();
  for (const rows of Object.values(rial.sections)) for (const x of rows) if (x.code !== 'usd_xau') x.price = (Number(x.price.replace(/,/g, '')) * 10).toLocaleString('en-US');
  rial.sections.currencies[0].price = '250,000'; // even with the dollar right, the gold is ten times too high
  const u = parseForgod(rial, { now: NOW });
  assert.match(u.error, /۲۵٪/);
  assert.deepEqual(u.live, {});
  // bitcoin against its own dollar price × the dollar: off by ten, it alone is left out
  const b = ALL();
  b.sections.crypto[0].usd_price = '8000';
  const rb = parseForgod(b, { now: NOW });
  assert.equal(rb.error, null);
  assert.equal(rb.live.btc, undefined);
  assert.deepEqual(rb.dropped, ['btc']);
  assert.equal(rb.live.geram18.p, 24200000);
  // a broken price or a missing clock is skipped, never read as zero or as today
  const bad = parseForgod({ sections: { gold: [row('18ayar', 'x', 'n/a', '16:00:00', 'gold'), row('sekkeh', 'x', '250,000,000', '', 'gold')] }, last_updated: STAMP, stale: false }, { now: NOW });
  assert.deepEqual(bad.live, {});
});

test('forgod: the default mode follows the key; the sample market only gained bitcoin', () => {
  assert.equal(defaultFeedMode({ BEATRIS_FORGOD_KEY: 'k' }), 'forgod');
  assert.equal(defaultFeedMode({}), 'owner');
  assert.equal(defaultFeedMode({ NODE_ENV: 'test', BEATRIS_FORGOD_KEY: 'k' }), 'off');
  assert.equal(SYMBOLS.at(-1).id, 'btc');
  const s = sampleMarket('2026-10-26');
  assert.equal(s.btc.length, 780);
  // the end of the sample: 80,000 dollars a coin at the sample's 235,000-toman dollar
  assert.equal(s.btc.at(-1).c, 18800000000);
  assert.ok(s.btc.every((b) => b.l <= Math.min(b.o, b.c) && b.h >= Math.max(b.o, b.c)));
  // the existing symbols end where they always did (the e2e and the lessons read these)
  assert.equal(s.usd.at(-1).c, 235000);
  assert.equal(s.ons.at(-1).c, 4200);
});

/* ---------------- the feed itself ---------------- */
function stubService({ all = () => json(ALL()), singles = (p) => json(single(p)) } = {}) {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    const u = new URL(url);
    if (u.hostname === 'api.tgju.org') return u.pathname.endsWith('/geram18') ? json({ data: [['233,000,000', '231,000,000', '236,000,000', '235,000,000', '1', '0.1%', '2026/10/25', '1405/08/03']] }) : new Response('{}', { status: 404 });
    if (u.hostname !== 'forgod.example.com') return new Response('{}', { status: 404 });
    const path = u.pathname.replace('/api/', '');
    return path === 'all' ? all(url) : singles(path, url);
  };
  return { calls, fetchImpl, forgod: () => calls.filter((c) => c.startsWith(BASE)) };
}
const market = (svc, opts = {}) => {
  const prices = [];
  const m = createMarket({ db: openDb(':memory:'), fetchImpl: svc.fetchImpl, clock: () => NOW, envMode: 'forgod', forgod: { key: KEY, base: BASE }, pause: async () => {}, onPrice: (p, label) => prices.push([p, label]), ...opts });
  return { m, prices };
};

test('forgod sync: one request with the key, history once, the board, the currency table and the base price', async () => {
  const svc = stubService();
  const { m, prices } = market(svc);
  const st = await m.sync();
  assert.equal(st.ok, true, st.error);
  assert.equal(svc.forgod().length, 1);
  const u = new URL(svc.forgod()[0]);
  assert.equal(u.pathname, '/api/all');
  assert.deepEqual([...u.searchParams.keys()], ['api_key']);
  assert.equal(u.searchParams.get('api_key'), KEY);
  assert.equal(svc.calls.filter((c) => c.includes('api.tgju.org')).length, SYMBOLS.filter((s) => s.feed.tgju).length);
  assert.equal(st.quotes, 11);
  assert.equal(st.fx, 6);
  assert.deepEqual(st.sources, { forgod: 'ok' });
  assert.deepEqual(prices, [[24200000, FEED_LABEL.forgod]]);
  const b = m.board();
  const item = (id) => b.items.find((x) => x.id === id);
  assert.equal(b.sample, false);
  assert.equal(b.source.mode, 'forgod');
  assert.equal(item('btc').c, 20000000000);
  assert.equal(item('usd').c, 250000);
  // tgju's close of yesterday (23,500,000 toman) is the reference for today's change
  assert.equal(item('geram18').prev, 23500000);
  assert.equal(b.fx.rates.length, 6);
  assert.equal(b.fx.btcUsd, 80000);
  assert.equal(m.health().mode, 'forgod');
  // two days stored: tgju's yesterday (and the late gerami quote) and today
  assert.deepEqual({ ...m.health(), at: null }, { mode: 'forgod', ok: true, quotes: 11, at: null, fx: 6, quota: { used: 1, daily: 50 }, days: 2 });
  // the next update: one request again, no history
  svc.calls.length = 0;
  assert.equal((await m.sync()).ok, true);
  assert.deepEqual(svc.calls.map((c) => new URL(c).pathname), ['/api/all']);
});

test('forgod sync: when /api/all fails, the dollar, the 18k gram and bitcoin come from their own addresses', async () => {
  const svc = stubService({ all: () => json({ error: 'busy' }, 503) });
  const { m } = market(svc);
  const st = await m.sync();
  assert.equal(st.ok, true, st.error);
  assert.deepEqual(svc.forgod().map((c) => new URL(c).pathname), ['/api/all', '/api/usd', '/api/18ayar', '/api/usd_btc']);
  assert.match(st.sources.forgod, /503/);
  assert.equal(st.sources.forgod_usd, 'ok');
  assert.equal(st.sources.forgod_btc, 'ok');
  assert.equal(st.quotes, 5); // usd, gram 18, mazaneh and gram 24 from it, bitcoin
  assert.equal(m.board().fx, null); // no currency table without /api/all
  // a stale or inconsistent full answer is not «failed»: the single addresses are not asked
  const svc2 = stubService({ all: () => json(ALL({ stale: true })) });
  const st2 = await market(svc2).m.sync();
  assert.equal(st2.ok, false);
  assert.match(st2.error, /stale/);
  assert.equal(svc2.forgod().length, 1);
});

test('forgod sync: without a key nothing is asked; the key is in no status, setting, board or error', async () => {
  const svc = stubService();
  const { m } = market(svc, { forgod: { key: '', base: BASE } });
  const st = await m.sync();
  assert.equal(st.ok, false);
  assert.match(st.error, /BEATRIS_FORGOD_KEY/);
  assert.equal(svc.forgod().length, 0);
  // a service whose errors echo the address with the key in it
  const leak = stubService({ all: (url) => Promise.reject(new Error(`connect ECONNREFUSED ${url}`)), singles: (p, url) => Promise.reject(new Error(`getaddrinfo ENOTFOUND ${url}`)) });
  const { m: m2 } = market(leak);
  const st2 = await m2.sync();
  assert.equal(st2.ok, false);
  const seen = JSON.stringify([st2, m2.status(), m2.board(), m2.stored(), m2.forgodView(), m2.health()]);
  assert.ok(!seen.includes(KEY), seen.slice(0, 300));
  assert.ok(seen.includes('••••'));
  const view = m2.forgodView();
  assert.deepEqual([view.key, view.host, view.daily, view.used], [true, 'forgod.example.com', 50, 4]);
});

/* ---------------- through the API ---------------- */
const servers = [];
after(() => servers.forEach((s) => s.close()));
async function serve(forgod) {
  const db = openDb(':memory:');
  seedUsers(db, {}, true);
  const svc = stubService();
  const server = createServer({ db, secret: 'test-secret-0123456789', demo: true, quiet: true, marketOpts: { fetchImpl: svc.fetchImpl, pause: async () => {}, clock: () => NOW, envMode: undefined, defaultMode: 'off', forgod } });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  servers.push(server);
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, body, token) => {
    const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: await r.json() };
  };
  return { server, svc, call, login: (phone) => smsLogin(base, phone) };
}

test('forgod API: a manager switches to it, the board carries bitcoin and the currencies, the key never shows', async () => {
  const { server, call, login } = await serve({ key: KEY, base: BASE });
  const boss = await login('09120000002');
  const g = await call('GET', '/api/market/feed', null, boss);
  assert.deepEqual([g.body.forgod.key, g.body.forgod.host, g.body.forgod.daily, g.body.forgod.reserve, g.body.forgod.dayEvery, g.body.forgod.nightEvery], [true, 'forgod.example.com', 50, 6, 20, 165]);
  assert.ok(g.body.modes.some((x) => x.id === 'forgod'));
  const put = await call('PUT', '/api/market/feed', { mode: 'forgod', syncPrice: true, interval: 10 }, boss);
  assert.equal(put.status, 200);
  assert.equal(put.body.config.mode, 'forgod');
  const st = await server.market.sync();
  assert.equal(st.ok, true, st.error);
  const staff = await login('09120000004');
  const b = (await call('GET', '/api/market', null, staff)).body;
  assert.equal(b.items.find((x) => x.id === 'btc').c, 20000000000);
  assert.equal(b.fx.rates.find((x) => x.code === 'JPY').per, 100);
  assert.equal((await call('GET', '/api/me', null, staff)).body.pricing.p750, 24200000); // «follow the market»
  const h = (await call('GET', '/api/health?deep=1')).body;
  assert.equal(h.market.mode, 'forgod');
  assert.equal(h.market.ok, true);
  assert.equal(h.market.fx, 6);
  const shown = JSON.stringify([g.body, put.body, b, h, (await call('GET', '/api/market/feed', null, boss)).body]);
  assert.ok(!shown.includes(KEY));
});

test('forgod API: without a key on the server, the mode is refused with the variable to set', async () => {
  const { call, login } = await serve({ key: '', base: BASE });
  const boss = await login('09120000002');
  const fv = (await call('GET', '/api/market/feed', null, boss)).body.forgod;
  assert.deepEqual([fv.key, fv.host], [false, 'forgod.example.com']);
  const put = await call('PUT', '/api/market/feed', { mode: 'forgod' }, boss);
  assert.equal(put.status, 400);
  assert.match(put.body.error, /BEATRIS_FORGOD_KEY/);
});

/* ---------------- 50 requests a day (spec 0049) ---------------- */
test('forgod allowance: 50 a day is 6 kept back, every 20 minutes in market hours and every 165 at night', () => {
  assert.deepEqual(forgodPlan(50), { daily: 50, reserve: 6, auto: 44, dayEvery: 20, nightEvery: 165 });
  // whatever the number, the automatic part never exceeds what is left after the reserve
  for (const n of [1, 2, 5, 10, 30, 50, 100, 1000]) {
    const p = forgodPlan(n);
    assert.ok(p.reserve + p.auto <= n || n === 1, JSON.stringify(p));
    assert.ok(Math.floor(780 / p.dayEvery) + Math.floor(660 / p.nightEvery) <= Math.max(p.auto, 2), JSON.stringify(p));
  }
});

test('forgod allowance: 48 hours of automatic updates stay within 44 in every 24 hours, by day every 20 minutes', async () => {
  let now = Date.parse('2026-10-26T00:00:00Z'); // 03:30 in Tehran
  const sent = [];
  const svc = stubService();
  const fetchImpl = async (url, opt) => {
    if (String(url).startsWith(BASE)) sent.push(now);
    return svc.fetchImpl(url, opt);
  };
  // every answer is «now»: the stub's last_updated moves with the clock, so each update is fresh
  const m = createMarket({ db: openDb(':memory:'), fetchImpl, clock: () => new Date(now), envMode: 'forgod', forgod: { key: KEY, base: BASE, daily: 50 }, pause: async () => {} });
  for (let k = 0; k < 48 * 60; k++, now += 60000) {
    const run = m.poll();
    if (run) await run;
  }
  const most = Math.max(...sent.map((t) => sent.filter((u) => u >= t && u < t + 86400000).length));
  assert.ok(most <= 44, `${most} in one 24 hours`);
  assert.ok(sent.length >= 80, `${sent.length} in 48 hours`); // the allowance is used, not left idle
  // the gaps: 20 minutes in market hours, 165 at night (by the Tehran clock)
  const tehran = (t) => ((new Date(t).getUTCHours() * 60 + new Date(t).getUTCMinutes() + 210) % 1440);
  const gaps = sent.slice(1).map((t, i) => [tehran(t), (t - sent[i]) / 60000]);
  assert.ok(gaps.filter(([at]) => at > 9 * 60 + 30 && at < 22 * 60).every(([, g]) => g === 20), JSON.stringify(gaps.slice(0, 12)));
  assert.ok(gaps.filter(([at]) => at > 60 && at < 8 * 60).every(([, g]) => g === 165), JSON.stringify(gaps.filter(([at]) => at < 9 * 60)));
});

test('forgod allowance: a manager still has the reserve, the 51st request is never sent, a restart keeps the count', async () => {
  let now = Date.parse('2026-10-26T06:30:00Z'); // 10:00 in Tehran
  const svc = stubService();
  const db = openDb(':memory:');
  const make = () => createMarket({ db, fetchImpl: svc.fetchImpl, clock: () => new Date(now), envMode: 'forgod', forgod: { key: KEY, base: BASE, daily: 50 }, pause: async () => {} });
  let m = make();
  for (let k = 0; k < 44; k++, now += 60000) assert.equal((await m.sync({ auto: true })).ok, true);
  // the automatic part is used up: an automatic update sends nothing and leaves no failed run behind
  now += 30 * 60000;
  assert.equal(m.poll(), null);
  const auto = await m.sync({ auto: true });
  assert.equal(auto.ok, false);
  assert.match(auto.error, /سهمیه به‌روزرسانی خودکار forgod پر است/);
  assert.equal(svc.forgod().length, 44);
  // a restart (the same database) keeps the count
  m = make();
  assert.equal(m.forgodView().used, 44);
  // the manager's six
  for (let k = 0; k < 6; k++, now += 60000) assert.equal((await m.sync()).ok, true);
  const over = await m.sync();
  assert.equal(over.ok, false);
  assert.match(over.error, /سهمیه روزانه forgod پر است \(۵۰ از ۵۰/);
  assert.equal(svc.forgod().length, 50);
  assert.equal(m.forgodView().left, 0);
  // the window rolls, it does not reset at midnight: a day and a minute after the first request only the two that are
  // 24 hours old or more have left it, so the automatic part is still full while the manager has room
  now = Date.parse('2026-10-27T06:31:00Z');
  assert.equal((await m.sync({ auto: true })).ok, false);
  assert.equal((await m.sync()).ok, true);
  assert.equal(svc.forgod().length, 51);
  // nine minutes on, eleven of the automatic requests have left the window and the automatic updates resume
  now = Date.parse('2026-10-27T06:40:00Z');
  assert.equal(m.forgodView().used, 40);
  assert.equal((await m.sync({ auto: true })).ok, true);
  assert.equal(svc.forgod().length, 52);
});

test('forgod allowance: the single addresses only when there is room for all three; a 429 stops it for an hour', async () => {
  let now = Date.parse('2026-10-26T06:30:00Z');
  // a small allowance: 6 a day, 2 kept back
  const down = stubService({ all: () => json({ error: 'busy' }, 503) });
  const m = createMarket({ db: openDb(':memory:'), fetchImpl: down.fetchImpl, clock: () => new Date(now), envMode: 'forgod', forgod: { key: KEY, base: BASE, daily: 6 }, pause: async () => {} });
  assert.deepEqual(forgodPlan(6), { daily: 6, reserve: 2, auto: 4, dayEvery: 260, nightEvery: 660 });
  const first = await m.sync(); // /api/all fails: 3 single addresses fit (4 of 6)
  assert.equal(first.ok, true, first.error);
  assert.equal(down.forgod().length, 4);
  now += 60000;
  const second = await m.sync(); // /api/all fails again (5 of 6): one left, not enough for three
  assert.equal(second.ok, false);
  assert.match(second.error, /سهمیه برای سه نشانی تکی کافی نیست/);
  assert.equal(down.forgod().length, 5);
  // forgod says «too many»: nothing more is sent for an hour, and the status says until when
  const busy = stubService({ all: () => json({ error: 'quota' }, 429) });
  const m2 = createMarket({ db: openDb(':memory:'), fetchImpl: busy.fetchImpl, clock: () => new Date(now), envMode: 'forgod', forgod: { key: KEY, base: BASE, daily: 50 }, pause: async () => {} });
  assert.match((await m2.sync()).error, /429/);
  now += 59 * 60000;
  const held = await m2.sync();
  assert.match(held.error, /نپذیرفت؛ تا ساعت/);
  assert.equal(busy.forgod().length, 1);
  assert.ok(m2.forgodView().blockedUntil);
  now += 2 * 60000;
  await m2.sync();
  assert.equal(busy.forgod().length, 2);
});

test('forgod allowance: the time between updates follows the Tehran clock and never undercuts the manager', () => {
  let now = Date.parse('2026-10-26T06:30:00Z'); // 10:00 in Tehran
  const db = openDb(':memory:');
  const m = createMarket({ db, fetchImpl: async () => json({}), clock: () => new Date(now), envMode: 'forgod', forgod: { key: KEY, base: BASE, daily: 50 }, pause: async () => {} });
  assert.equal(m.everyMs(), 20 * 60000);
  now = Date.parse('2026-10-25T22:30:00Z'); // 02:00 in Tehran
  assert.equal(m.everyMs(), 165 * 60000);
  m.save('market', { interval: 60 }, 'test'); // a manager who wants fewer updates gets them
  assert.equal(m.everyMs(), 165 * 60000);
  now = Date.parse('2026-10-26T06:30:00Z');
  assert.equal(m.everyMs(), 60 * 60000);
  // other feeds keep the manager's number
  m.save('market', { mode: 'owner', interval: 10 }, 'test');
  assert.equal(m.everyMs(), 10 * 60000);
});
