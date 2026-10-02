import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.mjs';
import { createServer } from '../server/index.mjs';
import { seedUsers } from '../server/api.mjs';
import * as T from '../public/js/trade.mjs';

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
const bal = async (id) => (await ok('GET', `/api/books/parties/${id}`, null, M)).balance;
const MAZ = 400000000;

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

let mehran, mehran2, bonak, bank;
test('مشتریان هم‌نام فقط با لقب، نام پدر، شهر یا موبایل متفاوت؛ گروه و جستجو', async () => {
  mehran = await ok('POST', '/api/books/parties', { name: 'مهران رضایی', mobile: '09121112233', group: 'خرده' }, E);
  const twin = await call('POST', '/api/books/parties', { name: 'مهران  رضايي' }, E); // ی/ک and spaces normalized
  assert.equal(twin.status, 409);
  assert.match(twin.body.error, /هم‌نام/);
  mehran2 = await ok('POST', '/api/books/parties', { name: 'مهران رضایی', alias: 'مهران طلا', father: 'علی', city: 'شهرکرد', group: 'همکار' }, E);
  assert.equal(mehran2.label, 'مهران رضایی («مهران طلا»، فرزند علی، شهرکرد)');
  assert.notEqual(mehran.label, mehran2.label);
  bonak = await ok('POST', '/api/books/parties', { name: 'بنکداری نور', group: 'همکار' }, M);
  assert.equal((await ok('GET', `/api/books/parties?group=${encodeURIComponent('همکار')}`, null, E)).items.length, 2);
  assert.equal((await ok('GET', `/api/books/parties?q=${encodeURIComponent('مهران طلا')}`, null, E)).items[0].id, mehran2.id);
  bank = (await ok('GET', '/api/books/accounts', null, M)).items.find((a) => a.kind === 'bank');
  const st = await ok('PUT', '/api/books/settings', { edition: 'base', tradeRound: 10000, spreadBuy: 500000, groups: { همکار: { spreadBuy: 100000, spreadSell: 100000 } } }, M);
  assert.deepEqual([st.edition, st.money, st.groups['همکار'].spreadSell], ['base', 'rial', 100000]);
});

let t1;
test('معامله: مهران ۲ گرم آبشده ۷۴۰ می‌فروشد و یک تمام می‌خرد؛ کارتخوان + فیش؛ مانده ریالی', async () => {
  t1 = await ok('POST', '/api/books/docs', {
    type: 'trade', partyId: mehran.id,
    lines: [{ kind: 'melt', dir: 'in', weight: 2, fineness: 740, mazaneh: MAZ }, { kind: 'coin', dir: 'out', coin: 'emami', count: 1, price: 985000000 }],
    payments: [{ method: 'pos', dir: 'in', amount: 500000000, account: bank.id, ref: '1234' }, { method: 'slip', dir: 'in', amount: 200000000, account: bank.id, ref: '77' }],
  }, E);
  assert.equal(t1.round, 10000);
  assert.equal(t1.calc.buys, 182190000);
  assert.equal(t1.calc.credit, 102810000);
  assert.deepEqual(await bal(mehran.id), { IRR: 102810000 });
  // an operator may not force a walk-in trade to leave goods on account
  assert.equal((await call('POST', '/api/books/docs', { type: 'trade', lines: [{ kind: 'melt', dir: 'in', weight: 1, fineness: 750, priced: false }] }, E)).status, 400);
});

test('ورود جنس امانی، شمش پلمپ با سریال؛ سریال تکراری و خروج شمش ناموجود رد می‌شود', async () => {
  await ok('POST', '/api/books/docs', { type: 'trade', partyId: mehran2.id, lines: [{ kind: 'melt', dir: 'in', weight: 50, fineness: 745, priced: false }, { kind: 'coin', dir: 'in', coin: 'half', count: 3, priced: false }] }, E);
  const b = await bal(mehran2.id);
  assert.deepEqual([b.G750, b['COIN:half'], b.IRR], [-49.667, -3, undefined]);
  const barLine = { kind: 'bar', dir: 'in', serial: '۳۳۰۷۰۲۱', brand: 'زربد', gallery: 'رزا', weight: 10, fineness: 750, sealDate: '2024-09-11', mazaneh: MAZ };
  await ok('POST', '/api/books/docs', { type: 'trade', partyId: bonak.id, lines: [barLine] }, E);
  const dup = await call('POST', '/api/books/docs', { type: 'trade', partyId: bonak.id, lines: [barLine] }, E);
  assert.equal(dup.status, 409);
  assert.match(dup.body.error, /3307021/);
  const ghost = await call('POST', '/api/books/docs', { type: 'trade', partyId: mehran.id, lines: [{ ...barLine, serial: '999999', dir: 'out' }] }, E);
  assert.equal(ghost.status, 409);
  const bars = await ok('GET', '/api/books/bars?q=3307', null, E);
  assert.equal(bars.items[0].serial, '3307021');
  assert.equal(bars.items[0].inVault, true);
  assert.equal(bars.items[0].brand, 'زربد');
  assert.equal(bars.items[0].history.length, 1);
});

test('حواله طلایی بین دو مشتری و تبدیل مانده طلایی به ریال', async () => {
  await ok('POST', '/api/books/docs', { type: 'hawala', hawala: { from: mehran2.id, to: bonak.id, unit: 'G750', amount: 9.667 } }, M);
  assert.equal((await bal(mehran2.id)).G750, -40);
  assert.equal((await bal(bonak.id)).G750, -9.667);
  const cv = await ok('POST', '/api/books/docs', { type: 'convert', partyId: mehran2.id, convert: { unit: 'G750', amount: -10, mazaneh: MAZ } }, M);
  const b = await bal(mehran2.id);
  assert.equal(b.G750, -30);
  assert.equal(b.IRR, -cv.calc.convert.value); // the shop owes him the money now
  assert.equal((await call('POST', '/api/books/docs', { type: 'hawala', hawala: { from: mehran.id, to: mehran.id, unit: 'IRR', amount: 1 } }, M)).status, 400);
});

test('آبشده شرطی: خرید با عیار موقت، ثبت عیار آزمایشگاه = نسخه جدید و اصلاح خودکار مانده', async () => {
  const d = await ok('POST', '/api/books/docs', { type: 'trade', partyId: bonak.id, lines: [{ kind: 'melt', dir: 'in', weight: 100, fineness: 740, conditional: true, mazaneh: MAZ }] }, E);
  const before = (await bal(bonak.id)).IRR;
  const list = await ok('GET', '/api/books/conditional', null, E);
  assert.equal(list.items.length, 1);
  const v2 = await ok('POST', `/api/books/docs/${d.id}/assay`, { line: 0, fineness: 735 }, E);
  assert.equal(v2.version, 2);
  assert.equal(v2.lines[0].assay.from, 740);
  const after = (await bal(bonak.id)).IRR;
  assert.equal(after - before, d.calc.buys - v2.calc.buys); // lower fineness → the shop owes less
  assert.equal((await ok('GET', '/api/books/conditional', null, E)).items.length, 0);
});

test('روزنگار: هر سند با جزئیات، روش پرداخت و مانده مشتری پس از همان سند', async () => {
  const r = await ok('GET', `/api/books/daybook?day=${today}`, null, M);
  const e = r.entries.find((x) => x.id === t1.id);
  assert.equal(e.party.name, 'مهران رضایی');
  assert.equal(e.lines[0].eq750, 1.973);
  assert.equal(e.lines[0].mesghal, 0.456);
  assert.deepEqual(e.payments.map((p) => [p.method, p.ref]), [['pos', '1234'], ['slip', '77']]);
  assert.deepEqual(e.after[mehran.id], { IRR: 102810000 });
  const hw = r.entries.find((x) => x.type === 'hawala');
  assert.ok(hw.hawala.fromName.includes('مهران طلا'));
  assert.equal(hw.after[mehran2.id].G750, -40);
  assert.equal(r.totals.coins.emami, -1);
  assert.ok(r.totals.money['pos:in'] === 500000000);
});

test('سود و زیان، گاوصندوق و تطبیق بانک', async () => {
  const p = await ok('GET', '/api/books/report/pnl', null, M);
  assert.ok(p.positions.some((x) => x.key === 'G750' && x.qty > 0), JSON.stringify(p.positions));
  const v = await ok('GET', '/api/books/vault', null, E);
  assert.equal(v.gold, 149.64); // 1.973 + 49.667 + 98 (100 g at the lab's 735)
  assert.ok(v.coins.emami === -1 && v.bars.length === 1);
  assert.ok(v.custody.G750.owedByShop > 0);
  const led = await ok('GET', `/api/books/bank/${bank.id}`, null, M);
  assert.equal(led.book, 700000000);
  assert.equal(led.open, 2); // the card swipe and the slip are two statement lines
  assert.deepEqual(led.rows.map((r) => r.amt), [500000000, 200000000]);
  const m = await ok('POST', `/api/books/bank/${bank.id}/match`, { rows: [{ date: today, amt: 200000000, ref: '77' }, { date: today, amt: 500000000, ref: '' }, { date: today, amt: 5, ref: '' }] }, M);
  assert.equal(m.matches.length, 2);
  assert.ok(m.matches[0].byRef);
  assert.deepEqual(m.unmatchedStatement, [2]);
  await ok('POST', `/api/books/bank/${bank.id}/recon`, { items: m.matches.map((x) => ({ src: x.book, on: true, ref: 'S-1' })) }, M);
  const led2 = await ok('GET', `/api/books/bank/${bank.id}`, null, M);
  assert.deepEqual([led2.open, led2.reconciledBalance], [0, 700000000]);
  assert.equal((await call('GET', `/api/books/bank/${bank.id}`, null, E)).status, 403);
  assert.ok(T.FX_CODES.USD);
});
