import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.mjs';
import { createServer } from '../server/index.mjs';
import { seedUsers } from '../server/api.mjs';

let server, base, V, O, E;
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
  const shop = await ok('POST', '/api/vendor/tenants', { name: 'زرگری امید', plan: 'base', username: 'omid', ownerName: 'امید' }, V);
  O = (await ok('POST', '/api/auth/login', { login: 'omid', password: shop.password })).token;
  const emp = await ok('POST', `/api/vendor/tenants/${shop.tenant.id}/users`, { name: 'کارمند', username: 'omid.emp', role: 'employee' }, V);
  E = (await ok('POST', '/api/auth/login', { login: 'omid.emp', password: emp.password })).token;
});
after(() => server.close());

const FORM = {
  identity: { shopName: 'زرگری امید', legalName: 'زرگری امید', address: 'تهران، بازار بزرگ', phone: '02155667788', postal: '1234567890' },
  cash: [{ title: 'صندوق ویترین', amount: 1500000000 }, { title: 'صندوق پشت', amount: 200000000 }],
  banks: [{ title: 'ملت جاری', bank: 'ملت', amount: 8000000000 }],
  gold: { grams: 250.5, avgPrice: 90000000 },
  coins: [{ coin: 'emami', count: 12, avgPrice: 980000000 }, { coin: 'half', count: 5, avgPrice: 520000000 }],
  bars: [{ serial: 'nm-1001', weight: 100, fineness: 995, brand: 'نوین', cost: 12000000000 }],
  fx: [{ code: 'USD', amount: 500, rate: 900000 }],
  parties: [
    { name: 'رضا تهرانی', mobile: '09121234567', balances: { IRR: 300000000, G750: -10 } },
    { name: 'بنکداری پارس', balances: { IRR: -1200000000, 'COIN:emami': 2 } },
    { name: 'رضا تهرانی', father: 'حسن', balances: { G750: 3.2 } },
  ],
};

test('راه‌اندازی: وضعیت واقعی مغازه یک بار ثبت می‌شود و همه گزارش‌ها همان را نشان می‌دهند', async () => {
  const info = await ok('GET', '/api/books/setup', null, O);
  assert.equal(info.canRun, true);
  assert.equal((await ok('GET', '/api/me', null, O)).setupDone, false);
  // an employee cannot run it; a broken form writes nothing
  assert.equal((await call('POST', '/api/books/setup', FORM, E)).status, 403);
  const broken = await call('POST', '/api/books/setup', { ...FORM, bars: [...FORM.bars, { serial: 'NM-1001', weight: 50 }] }, O);
  assert.equal(broken.status, 400);
  assert.match(broken.body.error, /دو بار/);
  assert.equal((await ok('GET', '/api/books/parties', null, O)).items.length, 0);
  const dup = await call('POST', '/api/books/setup', { ...FORM, parties: [FORM.parties[0], { name: 'رضا تهرانی', mobile: '09121234567' }] }, O);
  assert.equal(dup.status, 400);

  const r = await ok('POST', '/api/books/setup', FORM, O);
  assert.ok(r.doc.track.startsWith('O'));
  assert.equal(r.counts.parties, 3);
  assert.equal((await ok('GET', '/api/me', null, O)).setupDone, true);
  assert.equal((await call('POST', '/api/books/setup', FORM, O)).status, 409);

  // accounts: the starter boxes were renamed, not left empty beside the real ones
  const accs = (await ok('GET', '/api/books/accounts', null, O)).items;
  assert.deepEqual(accs.map((a) => a.title).sort(), ['صندوق پشت', 'صندوق ویترین', 'ملت جاری'].sort());
  // the vault
  const v = await ok('GET', '/api/books/vault', null, O);
  assert.equal(v.gold, 250.5);
  assert.equal(v.coins.emami, 12);
  assert.equal(v.coins.half, 5);
  assert.equal(v.fx.USD, 500);
  assert.equal(v.bars.length, 1);
  assert.equal(v.bars[0].serial, 'NM-1001');
  assert.equal(v.bars[0].weight, 100);
  assert.equal(v.bars[0].fineness, 995);
  assert.equal(v.bars[0].brand, 'نوین');
  assert.equal(Object.values(v.cash).reduce((s, x) => s + x, 0), 1700000000);
  assert.equal(Object.values(v.bank).reduce((s, x) => s + x, 0), 8000000000);
  assert.equal(v.custody.G750.owedByShop, 10);
  // customers, with the same-name rule honoured
  const parties = (await ok('GET', '/api/books/parties', null, O)).items;
  assert.equal(parties.length, 3);
  const reza = parties.find((p) => p.mobile === '09121234567');
  const acct = await ok('GET', `/api/books/parties/${reza.id}`, null, O);
  assert.equal(acct.balance?.IRR ?? acct.party?.balance?.IRR ?? acct.balances?.IRR, 300000000, JSON.stringify(Object.keys(acct)));
  // the trading result knows the cost of everything: no «missing cost» warning
  const pnl = await ok('GET', '/api/books/report/pnl', null, O);
  assert.equal(pnl.missingCost, false);
  const g = pnl.positions.find((p) => p.key === 'G750');
  // the sealed bar is gold too: its 750-equivalent and its cost join the melt position
  assert.equal(g.qty, 383.167);
  assert.equal(g.cost, Math.round(250.5 * 90000000) + 12000000000);
  // the dashboard reads the same state
  const d = await ok('GET', '/api/books/dashboard?range=7', null, O);
  assert.equal(d.kpi.physical.meltGrams, 250.5);
  assert.equal(d.kpi.physical.bars, 1);
  assert.equal(d.kpi.physical.barGrams, Math.round(((100 * 995) / 750) * 1000) / 1000);
  assert.equal(d.kpi.receivables.amount, 300000000);
  assert.equal(d.kpi.liabilities.amount, 1200000000);
  // the auditor finds nothing negative or unexplained
  const a = await ok('GET', '/api/books/audit', null, O);
  assert.ok(!a.findings.some((x) => x.code === 'stock.neg' || x.code === 'cash.neg'), JSON.stringify(a.findings.map((x) => x.code)));
});

test('رد کردن راه‌اندازی و مغازه اصلی', async () => {
  const shop = await ok('POST', '/api/vendor/tenants', { name: 'دفتر خالی', username: 'empty.shop' }, V);
  const t = (await ok('POST', '/api/auth/login', { login: 'empty.shop', password: shop.password })).token;
  await ok('POST', '/api/books/setup/skip', null, t);
  assert.equal((await ok('GET', '/api/me', null, t)).setupDone, true);
  assert.equal((await ok('GET', '/api/me', null, V)).setupDone, true);
});
