import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.mjs';
import { createServer } from '../server/index.mjs';
import { seedUsers } from '../server/api.mjs';
import { barSimilarity } from '../server/ideas.mjs';

let server, base, V, O, E, PW;
const call = async (method, path, body, token) => {
  const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const ok = async (...a) => {
  const r = await call(...a);
  assert.ok(r.status < 300, `${a[0]} ${a[1]} → ${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
};
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran' }).format(new Date());
const ago = (n) => new Date(Date.parse(`${today}T00:00:00Z`) - n * 864e5).toISOString().slice(0, 10);
let reza, pars;

before(async () => {
  const db = openDb(':memory:');
  seedUsers(db, {}, true);
  server = createServer({ db, secret: 'test-secret-0123456789', demo: true, quiet: true, tenantsDir: ':memory:', marketOpts: { fetchImpl: async () => new Response('{}', { status: 404 }), defaultMode: 'off' } });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  V = (await ok('POST', '/api/auth/login', { phone: '09120000001', pin: '1234' })).token;
  const shop = await ok('POST', '/api/vendor/tenants', { name: 'طلای نو', username: 'nou' }, V);
  PW = shop.password;
  O = (await ok('POST', '/api/auth/login', { login: 'nou', password: PW })).token;
  const emp = await ok('POST', `/api/vendor/tenants/${shop.tenant.id}/users`, { name: 'فروشنده', username: 'nou.emp', role: 'employee' }, V);
  E = (await ok('POST', '/api/auth/login', { login: 'nou.emp', password: emp.password })).token;
  await ok('POST', '/api/books/setup', {
    gold: { grams: 200, avgPrice: 90000000 },
    coins: [{ coin: 'emami', count: 10, avgPrice: 1000000000 }],
    cash: [{ title: 'صندوق', amount: 3000000000 }],
    parties: [
      { name: 'رضا وثیقه‌دار', balances: { IRR: -1000000000, G750: 10 } }, // owes 10 g, the shop holds 1,000,000,000 of his money
      { name: 'بنکداری پارس', balances: { IRR: 900000000, G750: -10 } }, // owes money, the shop holds 10 g of his gold
    ],
  }, O);
  const ps = (await ok('GET', '/api/books/parties', null, O)).items;
  reza = ps.find((p) => p.name.startsWith('رضا'));
  pars = ps.find((p) => p.name.startsWith('بنکداری'));
});
after(() => server.close());

test('۱) مظنه قفل‌شده: معامله باید دقیقاً همان قیمت را بگیرد و فقط یک بار', async () => {
  const q = await ok('POST', '/api/books/quotes', { kind: 'melt', dir: 'out', price: 400000000, minutes: 10, partyId: reza.id, qty: 5 }, E);
  assert.equal(q.status, 'open');
  assert.ok(q.secondsLeft > 590 && q.secondsLeft <= 600);
  assert.match(q.code, /^Q\d+$/);
  // wrong price, wrong customer, more than promised
  assert.equal((await call('POST', '/api/books/docs', { type: 'trade', partyId: reza.id, lines: [{ kind: 'melt', dir: 'out', weight: 2, fineness: 750, mazaneh: 410000000, quote: q.id }] }, E)).status, 400);
  assert.equal((await call('POST', '/api/books/docs', { type: 'trade', partyId: pars.id, lines: [{ kind: 'melt', dir: 'out', weight: 2, fineness: 750, mazaneh: 400000000, quote: q.id }] }, E)).status, 400);
  assert.equal((await call('POST', '/api/books/docs', { type: 'trade', partyId: reza.id, lines: [{ kind: 'melt', dir: 'out', weight: 6, fineness: 750, mazaneh: 400000000, quote: q.id }] }, E)).status, 400);
  const d = await ok('POST', '/api/books/docs', { type: 'trade', partyId: reza.id, lines: [{ kind: 'melt', dir: 'out', weight: 2, fineness: 750, mazaneh: 400000000, quote: q.id }] }, E);
  assert.equal((await ok('GET', `/api/books/quotes/${q.id}`, null, E)).status, 'used');
  assert.equal((await ok('GET', `/api/books/quotes/${q.id}`, null, E)).docId, d.id);
  // once used, never again
  const again = await call('POST', '/api/books/docs', { type: 'trade', partyId: reza.id, lines: [{ kind: 'melt', dir: 'out', weight: 1, fineness: 750, mazaneh: 400000000, quote: q.id }] }, E);
  assert.equal(again.status, 409);
  // a coin quote, cancelled
  const c = await ok('POST', '/api/books/quotes', { kind: 'coin', dir: 'in', coin: 'emami', price: 990000000, minutes: 5 }, E);
  await ok('POST', `/api/books/quotes/${c.id}/cancel`, null, E);
  assert.equal((await call('POST', '/api/books/docs', { type: 'trade', lines: [{ kind: 'coin', dir: 'in', coin: 'emami', count: 1, price: 990000000, quote: c.id }], payments: [{ method: 'cash', dir: 'out', amount: 990000000 }] }, E)).status, 409);
  const c2 = await ok('POST', '/api/books/quotes', { kind: 'coin', dir: 'in', coin: 'emami', price: 990000000, minutes: 5 }, E);
  await ok('POST', '/api/books/docs', { type: 'trade', lines: [{ kind: 'coin', dir: 'in', coin: 'emami', count: 2, price: 990000000, quote: c2.id }], payments: [{ method: 'cash', dir: 'out', amount: 1980000000 }] }, E);
  assert.equal((await call('POST', '/api/books/quotes', { kind: 'melt', dir: 'out', price: 1, minutes: 500 }, E)).status, 400);
});

test('۲) هشدار نوسان: پوشش وثیقه و قیمت شکست', async () => {
  assert.equal((await call('GET', '/api/books/risk', null, E)).status, 403);
  const r = await ok('GET', '/api/books/risk', null, O);
  const a = r.items.find((x) => x.party.id === reza.id);
  const b = r.items.find((x) => x.party.id === pars.id);
  assert.ok(a && b, JSON.stringify(r.items.map((x) => x.party.label)));
  // Reza owes 10 g against money the shop holds (less the 2 g he bought on credit under the quote)
  assert.equal(a.kind, 'short');
  assert.equal(a.goldGrams, 10);
  assert.ok(a.money < 0 && a.money > -1000000000);
  assert.equal(a.cover, Math.round((-a.money / (10 * r.p750)) * 1000) / 1000);
  assert.equal(a.breakP750, Math.round(-a.money / 10));
  assert.equal(b.kind, 'long');
  assert.equal(b.goldGrams, -10);
  assert.equal(b.breakP750, Math.round(900000000 / 10));
  assert.ok(['high', 'mid', 'low'].includes(a.sev));
});

test('۳) کارت شناسایی شمش: همان عکس می‌خواند، عکس دیگر نه', async () => {
  const blocks = Array.from({ length: 256 }, (_, i) => (i * 37) % 256);
  const other = Array.from({ length: 256 }, (_, i) => (i * 91 + 40) % 256);
  const img = 'data:image/jpeg;base64,' + Buffer.from('fake-jpeg-bytes').toString('base64');
  await ok('POST', '/api/books/docs', { type: 'adjust', money: 'rial', note: 'ورود شمش', balances: [{ acct: 'bar:BR-500', amount: 1, weight: 100, fineness: 995, cost: 12000000000 }] }, O);
  await ok('POST', '/api/books/bars/BR-500/card', { side: 'front', kind: 'entry', image: img, dhash: '0f0f0f0f0f0f0f0f', blocks }, E);
  const same = await ok('POST', '/api/books/bars/BR-500/card', { side: 'front', kind: 'check', image: img, dhash: '0f0f0f0f0f0f0f0e', blocks: blocks.map((v) => Math.min(255, v + 3)) }, E);
  assert.equal(same.result.verdict, 'match');
  const swapped = await ok('POST', '/api/books/bars/BR-500/card', { side: 'front', kind: 'check', image: img, dhash: 'f0f0f0f0f0f0f0f0', blocks: other }, E);
  assert.equal(swapped.result.verdict, 'mismatch');
  assert.equal((await call('POST', '/api/books/bars/BR-500/card', { side: 'back', kind: 'check', image: img, dhash: '0f0f0f0f0f0f0f0f', blocks }, E)).status, 400);
  assert.equal((await call('POST', '/api/books/bars/BR-500/card', { side: 'front', kind: 'entry', image: 'data:text/html;base64,AAAA', dhash: '0f0f0f0f0f0f0f0f', blocks }, E)).status, 400);
  const cards = await ok('GET', '/api/books/bars/BR-500/cards', null, E);
  assert.ok(cards.entry.front);
  assert.equal(cards.checks.length, 2);
  assert.equal(barSimilarity({ dhash: 'ffffffffffffffff', blocks }, { dhash: 'ffffffffffffffff', blocks }).score, 1);
});

test('۴) شمارش: اختلاف با دفتر', async () => {
  const c = await ok('POST', '/api/books/counts', { lines: [{ acct: 'gold', counted: 188.5, source: 'scale', gross: 1188.5, tare: 1000 }, { acct: 'coin:emami', counted: 12 }] }, E);
  const g = c.lines.find((l) => l.acct === 'gold');
  assert.equal(g.books, 198); // 200 − 2 sold under the quote
  assert.equal(g.diff, -9.5);
  assert.equal(c.lines.find((l) => l.acct === 'coin:emami').diff, 0);
  assert.equal(c.balanced, false);
  assert.equal((await call('POST', '/api/books/counts', { lines: [{ acct: 'party:x', counted: 1 }] }, E)).status, 400);
  assert.equal((await ok('GET', '/api/books/counts', null, E)).items.length, 1);
});

test('۵) برگه ته حساب اشتراکی: مشتری می‌بیند و تأیید می‌کند؛ لغو و انقضا', async () => {
  const s = await ok('POST', `/api/books/parties/${pars.id}/share`, { days: 3 }, E);
  assert.match(s.token, /^t_[0-9a-f]{12}~/);
  const v = await ok('GET', `/api/public/statement/${encodeURIComponent(s.token)}`);
  assert.equal(v.shop, 'طلای نو');
  assert.equal(v.balance.IRR, 900000000);
  assert.equal(v.balance.G750, -10);
  assert.ok(!JSON.stringify(v).includes(pars.id));
  assert.equal((await call('POST', `/api/public/statement/${encodeURIComponent(s.token)}`, { answer: 'dispute' })).status, 400);
  await ok('POST', `/api/public/statement/${encodeURIComponent(s.token)}`, { answer: 'agree' });
  assert.equal((await call('POST', `/api/public/statement/${encodeURIComponent(s.token)}`, { answer: 'agree' })).status, 409);
  const list = await ok('GET', `/api/books/parties/${pars.id}/shares`, null, E);
  assert.equal(list.items[0].answer, 'agree');
  assert.equal(list.items[0].confirmed.balance.IRR, 900000000);
  const s2 = await ok('POST', `/api/books/parties/${pars.id}/share`, { days: 1 }, E);
  await ok('POST', `/api/books/shares/${s2.id}/revoke`, null, E);
  assert.equal((await call('GET', `/api/public/statement/${encodeURIComponent(s2.token)}`)).status, 404);
  assert.equal((await call('GET', `/api/public/statement/${encodeURIComponent(s.token.replace(/.$/, 'x'))}`)).status, 404);
  assert.equal((await call('GET', '/api/public/statement/evil~abc')).status, 404);
});

test('۶) پیش‌بینی نقدینگی از همان روزهای هفته', async () => {
  // four past same-weekday days with cash paid out for buys
  const target = ago(-1);
  const seller = await ok('POST', '/api/books/parties', { name: 'فروشنده آبشده' }, O);
  for (const k of [1, 2, 3, 4]) {
    const day = new Date(Date.parse(`${target}T00:00:00Z`) - 7 * k * 864e5).toISOString().slice(0, 10);
    await ok('POST', '/api/books/docs', { type: 'trade', date: day, partyId: seller.id, lines: [{ kind: 'melt', dir: 'in', weight: 5 * k, fineness: 750, mazaneh: 400000000 }], payments: [{ method: 'cash', dir: 'out', amount: 100000000 * k }] }, O);
  }
  const f = await ok('GET', `/api/books/forecast?day=${target}`, null, O);
  assert.equal(f.target, target);
  assert.ok(f.activeSamples >= 4);
  assert.equal(f.enough, true);
  assert.ok(f.cash.p90 >= f.cash.p50 && f.cash.p50 > 0, JSON.stringify(f.cash));
  assert.equal(f.cash.max, 400000000);
  assert.ok(f.have.cash > 0);
  assert.equal((await call('GET', '/api/books/forecast', null, E)).status, 403);
});

test('۷) بستن روز با امضای دیجیتال؛ روز بسته قفل است تا مالک آن را باز کند', async () => {
  const v = await ok('GET', `/api/books/close?day=${today}`, null, O);
  assert.ok(v.checks.some((c) => c.key === 'count' && !c.ok)); // the count above is off
  assert.equal((await call('POST', '/api/books/close', { day: today, password: 'wrong-pass' }, O)).status, 403);
  const blocked = await call('POST', '/api/books/close', { day: today, password: PW }, O);
  assert.equal(blocked.status, 409);
  const open = v.checks.filter((c) => !c.ok).map((c) => c.key);
  assert.equal((await call('POST', '/api/books/close', { day: today, password: PW, ack: open }, O)).status, 400); // a note is required
  const c = await ok('POST', '/api/books/close', { day: today, password: PW, ack: open, note: 'کسری طلا فردا با مالک بررسی می‌شود' }, O);
  assert.match(c.hash, /^[0-9a-f]{64}$/);
  const ver = await ok('GET', `/api/books/close/${today}/verify`, null, O);
  assert.equal(ver.valid, true);
  // the closed day is locked for new documents, edits and voids
  const locked = await call('POST', '/api/books/docs', { type: 'trade', lines: [{ kind: 'coin', dir: 'in', coin: 'emami', count: 1, price: 990000000 }], payments: [{ method: 'cash', dir: 'out', amount: 990000000 }] }, O);
  assert.equal(locked.status, 403);
  assert.match(locked.body.error, /بسته/);
  // only the owner reopens, with a reason; then work goes on
  assert.equal((await call('POST', `/api/books/close/${today}/reopen`, { reason: 'اصلاح' }, E)).status, 403);
  await ok('POST', `/api/books/close/${today}/reopen`, { reason: 'سند جاافتاده' }, O);
  await ok('POST', '/api/books/docs', { type: 'trade', lines: [{ kind: 'coin', dir: 'in', coin: 'emami', count: 1, price: 990000000 }], payments: [{ method: 'cash', dir: 'out', amount: 990000000 }] }, O);
  assert.equal((await ok('GET', `/api/books/close?day=${today}`, null, O)).closed.reopened.reason, 'سند جاافتاده');
});
