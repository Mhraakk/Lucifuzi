import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.mjs';
import { createServer } from '../server/index.mjs';
import { seedUsers } from '../server/api.mjs';

let server, base, M, E;
const call = async (method, path, body, token) => {
  const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const ok = async (...a) => {
  const r = await call(...a);
  assert.ok(r.status < 300, `${a[0]} ${a[1]} → ${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
};
const login = async (phone) => (await call('POST', '/api/auth/login', { phone, pin: '1234' })).body.token;
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran' }).format(new Date());
const ago = (n) => new Date(Date.parse(`${today}T00:00:00Z`) - n * 864e5).toISOString().slice(0, 10);

before(async () => {
  const db = openDb(':memory:');
  seedUsers(db, {}, true);
  server = createServer({ db, secret: 'test-secret-0123456789', demo: true, quiet: true, marketOpts: { fetchImpl: async () => new Response('{}', { status: 404 }), defaultMode: 'off' } });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  M = await login('09120000002');
  E = await login('09120000004');
});
after(() => server.close());

test('داشبورد: سن مطالبات به روش اولین‌ورود، سری موقعیت طلا و ترکیب دارایی از همان دفاتر', async () => {
  const a = await ok('POST', '/api/books/parties', { name: 'علی نادری' }, M);
  const b = await ok('POST', '/api/books/parties', { name: 'رضا امینی' }, M);
  // 40 days ago: one coin sold on credit; 5 days ago 400,000,000 paid; today another 100,000,000 on credit
  await ok('POST', '/api/books/docs', { type: 'trade', date: ago(40), partyId: a.id, lines: [{ kind: 'coin', dir: 'out', coin: 'emami', count: 1, price: 985000000 }] }, M);
  await ok('POST', '/api/books/docs', { type: 'trade', date: ago(5), partyId: a.id, payments: [{ method: 'cash', dir: 'in', amount: 400000000 }] }, M);
  await ok('POST', '/api/books/docs', { type: 'trade', partyId: a.id, lines: [{ kind: 'coin', dir: 'out', coin: 'half', count: 1, price: 100000000 }] }, M);
  // 3 days ago 10 g of 750 left in custody; today 2 g bought and paid by card
  await ok('POST', '/api/books/docs', { type: 'trade', date: ago(3), partyId: b.id, lines: [{ kind: 'melt', dir: 'in', weight: 10, fineness: 750, priced: false }] }, M);
  await ok('POST', '/api/books/docs', { type: 'trade', partyId: b.id, lines: [{ kind: 'melt', dir: 'in', weight: 2, fineness: 750, mazaneh: 400000000 }], payments: [{ method: 'cash', dir: 'out', amount: 184400000 }] }, M);

  const d = await ok('GET', '/api/books/dashboard?range=7', null, M);
  // aging: the 400,000,000 settled the oldest debt; 585,000,000 of it is 40 days old, today's 100,000,000 is fresh
  const byKey = Object.fromEntries(d.aging.buckets.map((x) => [x.key, x]));
  assert.equal(d.aging.total, 685000000);
  assert.deepEqual([byKey.d0.amount, byKey.d31.amount, byKey.d8.amount], [100000000, 585000000, 0]);
  assert.equal(byKey.d31.avgDays, 40);
  assert.equal(byKey.d31.parties[0].id, a.id);
  assert.equal(Math.round(d.aging.buckets.reduce((s, x) => s + x.pct, 0)), 100);
  // series: seven daily points; custody 10 g from 3 days ago, the 2 g bought today
  assert.equal(d.series.length, 7);
  assert.equal(d.series.at(-1).t, today);
  const threeAgo = d.series.find((x) => x.t === ago(3));
  assert.deepEqual([threeAgo.physicalGold, threeAgo.goldLiabilities, threeAgo.netGoldPosition], [10, 10, 0]);
  assert.deepEqual([d.series.at(-1).physicalGold, d.series.at(-1).netGoldPosition], [12, 2]);
  // KPIs agree with the vault and the customers' balances
  const v = await ok('GET', '/api/books/vault', null, M);
  assert.equal(d.kpi.physical.grams, v.gold);
  assert.equal(d.kpi.receivables.amount, 685000000);
  assert.equal(d.kpi.receivables.debtors, 1);
  assert.equal(d.kpi.net.grams, 2);
  assert.equal(d.kpi.physical.spark.length, 30);
  // allocation: five segments, the physical breakdown names the custody gold inside the stock
  assert.deepEqual(d.allocation.market.map((x) => x.key), ['gold', 'coin', 'cash', 'recv', 'other']);
  assert.equal(d.allocation.market.find((x) => x.key === 'recv').value, 685000000);
  assert.equal(d.allocation.physical.find((x) => x.key === 'custody').grams, 10);
  // today: hourly points; custom range; recent trades; managers only
  const t = await ok('GET', '/api/books/dashboard?range=today', null, M);
  assert.equal(t.mode, 'hour');
  assert.equal(t.series.at(-1).physicalGold, 12);
  const c = await ok('GET', `/api/books/dashboard?range=custom&from=${ago(45)}&to=${ago(30)}`, null, M);
  assert.equal(c.series.length, 16);
  assert.equal(c.series.at(-1).receivables, 985000000);
  assert.ok(d.recent.length >= 2 && d.recent[0].track);
  assert.equal((await call('GET', '/api/books/dashboard', null, E)).status, 403);
  // the year: one square per day for 53 weeks, counts and priced value from the stored documents
  const cal = d.calendar;
  assert.equal(cal.days.length, 371);
  assert.equal(cal.days.at(-1).day, today);
  assert.deepEqual(cal.days.find((x) => x.day === ago(40)), { day: ago(40), docs: 1, trades: 1, value: 985000000 });
  assert.deepEqual(cal.days.find((x) => x.day === ago(3)), { day: ago(3), docs: 1, trades: 1, value: 0 }); // custody: not priced
  const t0 = cal.days.at(-1);
  assert.equal(t0.docs, 2);
  assert.ok(t0.value > 100000000);
  // monthly results are the P&L report's own days, grouped by Jalali month
  const pnl = await ok('GET', '/api/books/report/pnl', null, M);
  assert.equal(cal.months.reduce((s, m) => s + m.realized, 0), pnl.days.reduce((s, x) => s + x.realized, 0));
  assert.ok(cal.year >= 1405);
});
