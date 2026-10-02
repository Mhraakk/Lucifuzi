import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.mjs';
import { createServer } from '../server/index.mjs';
import { seedUsers } from '../server/api.mjs';

let server, base, V, A, B2, E;
const call = async (method, path, body, token) => {
  const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const ok = async (...a) => {
  const r = await call(...a);
  assert.ok(r.status < 300, `${a[0]} ${a[1]} → ${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
};

before(async () => {
  const db = openDb(':memory:');
  seedUsers(db, {}, true);
  server = createServer({ db, secret: 'test-secret-0123456789', demo: true, quiet: true, tenantsDir: ':memory:', marketOpts: { fetchImpl: async () => new Response('{}', { status: 404 }), defaultMode: 'off' } });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  V = (await ok('POST', '/api/auth/login', { phone: '09120000001', pin: '1234' })).token;
  const a = await ok('POST', '/api/vendor/tenants', { name: 'فروشگاه الف', username: 'shop.a' }, V);
  const b = await ok('POST', '/api/vendor/tenants', { name: 'فروشگاه ب', username: 'shop.b' }, V);
  A = (await ok('POST', '/api/auth/login', { login: 'shop.a', password: a.password })).token;
  B2 = (await ok('POST', '/api/auth/login', { login: 'shop.b', password: b.password })).token;
  const e = await ok('POST', `/api/vendor/tenants/${a.tenant.id}/users`, { name: 'فروشنده', username: 'shop.a.emp', role: 'employee' }, V);
  E = (await ok('POST', '/api/auth/login', { login: 'shop.a.emp', password: e.password })).token;
  await ok('POST', '/api/books/setup', { gold: { grams: 100, avgPrice: 90000000 }, coins: [{ coin: 'emami', count: 10, avgPrice: 1000000000 }], cash: [{ title: 'صندوق', amount: 5000000000 }] }, A);
});
after(() => server.close());

test('محصول سفارشی: افزودن، ویرایش، پنهان، جابه‌جایی، حذف — و جدا برای هر فروشگاه', async () => {
  const made = await ok('POST', '/api/books/products', { label: 'سکه پارسیان نیم گرمی', short: 'پارسیان ۰٫۵', weight: 0.5, fineness: 750 }, A);
  assert.match(made.id, /^u[0-9a-f]{7}$/);
  assert.equal((await call('POST', '/api/books/products', { label: 'x', weight: 1 }, E)).status, 403);
  assert.equal((await call('POST', '/api/books/products', { label: 'بی‌وزن', weight: 0 }, A)).status, 400);
  // it trades like a coin: priced from its gold when there is no market quote
  const doc = await ok('POST', '/api/books/docs', { type: 'trade', lines: [{ kind: 'coin', dir: 'in', coin: made.id, count: 4, price: 50000000 }], payments: [{ method: 'cash', dir: 'out', amount: 200000000 }] }, A);
  assert.equal(doc.calc.lines[0].value, 200000000);
  let list = await ok('GET', '/api/books/products', null, A);
  const mine = list.items.find((x) => x.id === made.id);
  assert.equal(mine.stock, 4);
  assert.equal(mine.custom, true);
  assert.ok(mine.used > 0);
  const vault = await ok('GET', '/api/books/vault', null, A);
  assert.equal(vault.coins[made.id], 4);
  const pnl = await ok('GET', '/api/books/report/pnl', null, A);
  const pos = pnl.positions.find((p) => p.key === `COIN:${made.id}`);
  assert.equal(pos.qty, 4);
  assert.ok(pos.price > 0);
  // the other shop does not know it and cannot book it
  assert.ok(!(await ok('GET', '/api/books/products', null, B2)).items.some((x) => x.id === made.id));
  assert.equal((await call('POST', '/api/books/docs', { type: 'trade', lines: [{ kind: 'coin', dir: 'in', coin: made.id, count: 1, price: 50000000 }] }, B2)).status, 400);
  // edit, manual price, rename an official coin, hide, reorder
  await ok('PUT', `/api/books/products/${made.id}`, { price: 56000000 }, A);
  assert.equal((await ok('GET', '/api/books/products', null, A)).items.find((x) => x.id === made.id).price, 56000000);
  await ok('PUT', '/api/books/products/emami', { short: 'امامی' }, A);
  await ok('PUT', '/api/books/products/halfOld', { hidden: true }, A);
  await ok('PUT', '/api/books/products', { order: [made.id, 'emami'] }, A);
  const s = await ok('GET', '/api/books/settings', null, A);
  assert.deepEqual(s.products.order, [made.id, 'emami']);
  assert.equal(s.products.labels.emami, 'امامی');
  assert.deepEqual(s.products.hidden, ['halfOld']);
  list = await ok('GET', '/api/books/products', null, A);
  assert.equal(list.items[0].id, made.id);
  assert.equal(list.items[1].short, 'امامی');
  assert.equal(list.items.find((x) => x.id === 'halfOld').hidden, true);
  // a product with history is hidden, not deleted; an unused one can go
  assert.equal((await call('DELETE', `/api/books/products/${made.id}`, null, A)).status, 409);
  assert.equal((await call('DELETE', '/api/books/products/emami', null, A)).status, 400);
  const spare = await ok('POST', '/api/books/products', { label: 'آزمایشی', weight: 1, fineness: 900 }, A);
  await ok('DELETE', `/api/books/products/${spare.id}`, null, A);
  assert.ok(!(await ok('GET', '/api/books/products', null, A)).items.some((x) => x.id === spare.id));
});

test('اصلاح موجودی: کسری با میانگین بها زیان همان روز است، اضافه با بها وارد می‌شود، شمش با کارتش', async () => {
  const before = await ok('GET', '/api/books/report/pnl', null, A);
  const realized0 = before.realizedTotal;
  // reason required, employees cannot, customer balances cannot be "adjusted"
  assert.equal((await call('POST', '/api/books/docs', { type: 'adjust', money: 'rial', balances: [{ acct: 'coin:emami', amount: -2 }] }, A)).status, 400);
  assert.equal((await call('POST', '/api/books/docs', { type: 'adjust', money: 'rial', note: 'شمارش', balances: [{ acct: 'coin:emami', amount: -2 }] }, E)).status, 403);
  const party = await ok('POST', '/api/books/parties', { name: 'مشتری' }, A);
  assert.equal((await call('POST', '/api/books/docs', { type: 'adjust', money: 'rial', note: 'شمارش', balances: [{ acct: `party:${party.id}`, amount: 5 }] }, A)).status, 400);
  const d = await ok('POST', '/api/books/docs', { type: 'adjust', money: 'rial', note: 'شمارش پایان روز', balances: [{ acct: 'coin:emami', amount: -2 }, { acct: 'gold', amount: 1.5, cost: 135000000 }, { acct: 'bar:ZR-777', amount: 1, weight: 50, fineness: 995, brand: 'زر', cost: 6000000000 }] }, A);
  assert.ok(d.track.startsWith('A'));
  const v = await ok('GET', '/api/books/vault', null, A);
  assert.equal(v.coins.emami, 8);
  assert.equal(v.gold, 101.5);
  assert.equal(v.bars.find((b) => b.serial === 'ZR-777').weight, 50);
  const after = await ok('GET', '/api/books/report/pnl', null, A);
  assert.equal(after.realizedTotal - realized0, -2000000000); // two coins at an average of 1,000,000,000
  const g = after.positions.find((p) => p.key === 'G750');
  assert.equal(g.qty, Math.round((101.5 + (50 * 995) / 750) * 1000) / 1000);
  assert.equal(g.cost, 100 * 90000000 + 135000000 + 6000000000);
  // the bar leaves by counting: it must be in the vault, and its gold leaves the position at cost
  assert.equal((await call('POST', '/api/books/docs', { type: 'adjust', money: 'rial', note: 'تکرار', balances: [{ acct: 'bar:ZR-777', amount: 1, weight: 50 }] }, A)).status, 400);
  await ok('POST', '/api/books/docs', { type: 'adjust', money: 'rial', note: 'شمش تحویل مالک شد', balances: [{ acct: 'bar:ZR-777', amount: -1 }] }, A);
  const v2 = await ok('GET', '/api/books/vault', null, A);
  assert.ok(!v2.bars.some((b) => b.serial === 'ZR-777'));
  const g2 = (await ok('GET', '/api/books/report/pnl', null, A)).positions.find((p) => p.key === 'G750');
  assert.equal(g2.qty, 101.5);
});
