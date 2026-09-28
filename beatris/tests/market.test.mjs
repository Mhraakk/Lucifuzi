import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.mjs';
import { createServer } from '../server/index.mjs';
import { seedUsers } from '../server/api.mjs';
import { parseTable, parseTgjuLive, parseCustom, checkFeedUrl, parseAbshdh, parseChande, parseGoldprice } from '../server/market.mjs';
import { SYMBOLS, SYMBOL } from '../public/js/market.mjs';

// a stand-in for the price sources: tgju history/live tables and a custom JSON feed
const rial = (toman) => Math.round(toman * 10).toLocaleString('en-US');
const BASE = { mesghal: 103543000, geram18: 23902000, geram24: 31869000, sekee: 240505000, sekeb: 235240000, nim: 122500000, rob: 65000000, gerami: 34000000, usd: 235000, ons: 4213.22 };
const fmtSrc = (id, v) => (SYMBOL[id].feed.rial ? rial(v) : v.toFixed(2));
const history = (id) => ({
  data: [
    ['2026/09/27', 1],
    ['2026/09/26', 0.99],
    ['2026/09/24', 0.985],
  ].map(([d, k]) => {
    const c = BASE[id] * k;
    return [fmtSrc(id, c * 0.998), fmtSrc(id, c * 0.995), fmtSrc(id, c * 1.004), fmtSrc(id, c), '<span class="high">1</span>', '0.1%', d, '1405/07/05'];
  }),
});
let live = null;
const liveTable = (scale = 1) => ({
  current: Object.fromEntries(SYMBOLS.filter((s) => s.feed.tgju).map((s) => [s.feed.tgju, { p: fmtSrc(s.id, BASE[s.id] * scale * 1.002), h: fmtSrc(s.id, BASE[s.id] * scale * 1.01), l: fmtSrc(s.id, BASE[s.id] * scale * 0.99), ts: s.id === 'ons' ? '2026-09-28 05:14:44' : '2026-09-28 00:00:00' }])),
});
const calls = [];
const fakeFetch = async (url) => {
  calls.push(String(url));
  const u = new URL(url);
  let body = null;
  if (u.hostname === 'api.tgju.org') body = history(SYMBOLS.find((s) => s.feed.tgju && u.pathname.endsWith(`/${s.feed.tgju}`)).id);
  else if (u.hostname === 'call4.tgju.org') body = live;
  else if (u.hostname === 'feed.example.com') body = { day: '2026-09-29', prices: { mesghal: 104000000, geram18: { p: 24010000, h: 24100000, l: 23900000 }, bogus: 5, constructor: 1 } };
  return body ? new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } }) : new Response('{}', { status: 404 });
};

let server, base;
const call = async (method, path, body, token, headers = {}) => {
  const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...headers, ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json(), headers: r.headers };
};
const login = async (phone) => (await call('POST', '/api/auth/login', { phone, pin: '1234' })).body.token;

before(async () => {
  const db = openDb(':memory:');
  seedUsers(db, {}, true);
  server = createServer({ db, secret: 'test-secret-0123456789', demo: true, quiet: true, marketOpts: { fetchImpl: fakeFetch, pause: async () => {}, envMode: undefined, defaultMode: 'off' } });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

test('بازار: تا اولین قیمت واقعی، داده نمونه با برچسب سرو می‌شود', async () => {
  const t = await login('09120000004');
  const b = (await call('GET', '/api/market', null, t)).body;
  assert.equal(b.sample, true);
  assert.equal(b.source.mode, 'sample');
  assert.equal(b.items.length, SYMBOLS.length);
  for (const it of b.items) assert.ok(it.c > 0 && it.spark.length === 60 && Number.isFinite(it.pct), it.id);
  const s = await call('GET', '/api/market/series?symbols=sekee,ons&from=2026-01-01', null, t, { 'accept-encoding': 'gzip' });
  assert.equal(s.status, 200);
  assert.equal(s.headers.get('content-encoding'), 'gzip');
  assert.ok(s.body.series.sekee.length > 100 && s.body.series.sekee.every((r) => r[0] >= '2026-01-01' && r.length === 5));
  for (const q of ['symbols=constructor', 'symbols=sekee,__proto__', 'symbols=', 'symbols=sekee&from=1405-07-01x']) assert.equal((await call('GET', `/api/market/series?${q}`, null, t)).status, 400, q);
  assert.equal((await call('GET', '/api/market')).status, 401);
});

test('بازار: فقط مدیر قیمت ثبت می‌کند؛ قیمت تکی، جدول شمسی، خطای سطر و حذف', async () => {
  const emp = await login('09120000004');
  const m = await login('09120000002');
  assert.equal((await call('POST', '/api/market/bars', { symbol: 'sekee', price: 1 }, emp)).status, 403);
  assert.equal((await call('POST', '/api/market/bars', { symbol: 'hasOwnProperty', price: 1 }, m)).status, 400);
  assert.equal((await call('POST', '/api/market/bars', { symbol: 'sekee', price: -5 }, m)).status, 400);
  const one = await call('POST', '/api/market/bars', { symbol: 'sekee', day: '۱۴۰۵/۰۷/۰۵', price: 240505000 }, m);
  assert.equal(one.status, 200);
  assert.equal(one.body.from, '2026-09-27');
  await call('POST', '/api/market/bars', { symbol: 'sekee', day: '1405/07/05', price: 241000000 }, m);
  const b = (await call('GET', '/api/market', null, emp)).body;
  assert.equal(b.sample, false);
  const sekee = b.items.find((x) => x.id === 'sekee');
  assert.deepEqual([sekee.o, sekee.h, sekee.l, sekee.c], [240505000, 241000000, 240505000, 241000000]);
  assert.ok(b.items.find((x) => x.id === 'nim').empty);
  const tbl = await call('POST', '/api/market/bars', { symbol: 'usd', table: 'تاریخ\tقیمت\n1405/07/01\t233,500\n1405/07/02\t234,100\n1405/07/05\t235,000' }, m);
  assert.equal(tbl.status, 200);
  assert.equal(tbl.body.saved, 3);
  const err = await call('POST', '/api/market/bars', { symbol: 'usd', table: '1405/07/06,1\n1405/13/01,2\n2026-09-30;5;4;6;5' }, m);
  assert.equal(err.status, 400);
  assert.match(err.body.error, /سطر ۲|سطر 2/);
  const usd = (await call('GET', '/api/market/series?symbols=usd', null, emp)).body.series.usd;
  assert.deepEqual(usd.map((r) => r[0]), ['2026-09-23', '2026-09-24', '2026-09-27']);
  assert.equal((await call('DELETE', '/api/market/bars/usd/2026-09-24', null, m)).status, 200);
  assert.equal((await call('DELETE', '/api/market/bars/usd/2026-09-24', null, m)).status, 404);
});

test('بازار: فید اختصاصی فقط https عمومی؛ توکن هرگز برنمی‌گردد؛ ورود دستی بر فید مقدم است', async () => {
  const m = await login('09120000002');
  for (const url of ['http://feed.example.com/p', 'https://127.0.0.1/p', 'https://localhost/p', 'https://api.railway.internal/p', 'https://u:p@feed.example.com/p', 'https://[::1]/p', 'nope'])
    assert.equal((await call('PUT', '/api/market/feed', { mode: 'json', url }, m)).status, 400, url);
  const put = await call('PUT', '/api/market/feed', { mode: 'json', url: 'https://feed.example.com/prices', token: 's3cret', syncPrice: true, interval: 2 }, m);
  assert.equal(put.status, 200);
  assert.equal(put.body.config.token, '••••');
  assert.equal(put.body.config.interval, 5);
  const st = await server.market.sync();
  assert.equal(st.ok, true, st.error);
  assert.equal(st.quotes, 2);
  const emp = await login('09120000004');
  const series = (await call('GET', '/api/market/series?symbols=geram18,mesghal', null, emp)).body.series;
  assert.deepEqual(series.geram18.at(-1), ['2026-09-29', 24010000, 24100000, 23900000, 24010000]);
  // "follow the market": the shop's gram-of-750 price is now the live 18k quote
  assert.equal((await call('GET', '/api/me', null, emp)).body.pricing.p750, 24010000);
  const g = await call('GET', '/api/market/feed', null, m);
  assert.ok(!JSON.stringify(g.body).includes('s3cret'));
  // a manager's own price for a day is never overwritten by a feed
  await call('POST', '/api/market/bars', { symbol: 'mesghal', day: '2026-09-29', price: 100000000 }, m);
  await server.market.sync();
  const maz = (await call('GET', '/api/market/series?symbols=mesghal', null, emp)).body.series.mesghal.at(-1);
  assert.equal(maz[4], 100000000);
});

test('بازار: tgju — بارگیری سابقه، ادغام قیمت زنده در روز، رد پرش‌های غیرعادی', async () => {
  const m = await login('09120000002');
  live = liveTable();
  calls.length = 0;
  await call('PUT', '/api/market/feed', { mode: 'tgju', syncPrice: false }, m);
  const st = await server.market.sync();
  assert.equal(st.ok, true, st.error);
  assert.equal(calls.filter((u) => u.includes('api.tgju.org')).length, SYMBOLS.filter((x) => x.feed.tgju).length); // history once per symbol
  const emp = await login('09120000004');
  const s = (await call('GET', '/api/market/series?symbols=sekee,ons', null, emp)).body.series;
  assert.deepEqual(s.sekee.map((r) => r[0]).slice(-4), ['2026-09-24', '2026-09-26', '2026-09-27', '2026-09-28']);
  const today = s.sekee.at(-1);
  assert.equal(today[4], Math.round((BASE.sekee * 1.002) / 1000) * 1000);
  assert.ok(today[2] >= today[4] && today[3] <= today[4]);
  assert.equal(s.ons.at(-1)[4], Number((BASE.ons * 1.002).toFixed(2)));
  // the next poll does not reload history; a 50 % jump is a data error and is not booked
  calls.length = 0;
  live = liveTable(1.5);
  const st2 = await server.market.sync();
  assert.equal(calls.filter((u) => u.includes('api.tgju.org')).length, 0);
  assert.equal(st2.ok, false);
  assert.equal(st2.rejected.length, SYMBOLS.filter((x) => x.feed.tgju).length);
  assert.equal((await call('GET', '/api/market/series?symbols=sekee', null, emp)).body.series.sekee.at(-1)[4], today[4]);
  await call('PUT', '/api/market/feed', { mode: 'off' }, m);
});

test('بازار: تجزیه جدول، قیمت زنده tgju و فید اختصاصی', () => {
  const t = parseTable('Date,Close\n"1405/07/05","240,505,000"\n2026-09-20\t1000\t1100\t990\t1050\n\n');
  assert.deepEqual(t.errors, []);
  assert.deepEqual(t.bars.map((b) => [b.d, b.c]), [['2026-09-20', 1050], ['2026-09-27', 240505000]]);
  assert.equal(parseTable('1405/07/05,1,2').errors.length, 1);
  const l = parseTgjuLive({ current: { sekee: { p: '2,405,050,000', h: '2,405,100,000', l: '2,394,800,000', ts: '2026-09-27 00:00:00' }, ons: { p: '4,213.22', ts: 'bad' }, mesghal: { p: '-', ts: '2026-09-27' } } });
  assert.deepEqual(l, { sekee: { d: '2026-09-27', p: 240505000, h: 240510000, l: 239480000 } });
  assert.deepEqual(Object.keys(parseCustom({ prices: { usd: 235000, toString: 1, ons: -1 } }, '2026-09-28')), ['usd']);
  assert.equal(checkFeedUrl('https://prices.goldsuite.example/api/latest'), null);
});

test('منابع فروشگاه: کانال آب‌شده، چنده و goldprice.org درست خوانده می‌شوند', () => {
  const day = (d) => d.toISOString().slice(0, 10);
  const post = (text, t) => `<div class="tgme_widget_message_text js-message_text" dir="auto">${text}</div><a class="x"><time datetime="${t}" class="time">10:22</time></a>`;
  const html = post('🔺#ابشـده‌حواله 104,600,000<br/><br/>🔺#گرم‌طلا: 24,147,563', '2026-09-28T06:52:10+00:00') + post('🔻#آبشده‌امروزی ۱۰۴٬۱۴۰٬۰۰۰<br/>🔻#گرم‌طلا: 24,041,369', '2026-09-28T06:52:34+00:00') + post('🔻#ابشـده‌حواله 104,570,000', '2026-09-28T06:53:00+00:00') + post('#سکه‌حواله: 🔺 241,400,000 🔺', '2026-09-28T06:53:10+00:00');
  const a = parseAbshdh(html, day);
  assert.equal(a.mesghal.p, 104140000);
  assert.equal(a.mesghal_fwd.p, 104570000); // the newest transfer quote wins
  assert.equal(Object.keys(a).length, 2);
  const sse = 'event: connected\ndata: {"prices": {"USD": {"price_sell": 2359000, "price_buy": 2358000, "updated_at": "2026-09-28T06:52:43.265619"}, "COIN_EMAMI": {"price_sell": 2420000000, "price_buy": 2385000000, "updated_at": "2026-09-28T06:52:43"}, "GOLD_24K": {"price_usd": 4173.26, "updated_at": "2026-09-28T06:52:48"}}}\n\n';
  const c = parseChande(sse, day);
  assert.equal(c.usd.p, 235850); // mid of buy and sell, rial → toman
  assert.equal(c.sekee.p, 240250000);
  assert.equal(c.ons.p, 4173.26);
  assert.deepEqual(parseChande('garbage', day), {});
  assert.equal(parseGoldprice({ items: [{ xauPrice: 4190.55 }] }, day).ons.p, 4190.55);
  assert.deepEqual(parseGoldprice({ items: [{ xauPrice: 'x' }] }, day), {});
});
