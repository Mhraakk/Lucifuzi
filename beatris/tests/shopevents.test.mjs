// spec 0026: every event of a melted-gold and coin shop, recorded through the real HTTP API with the recipe the guide
// gives, lands in one chain. After each event: the hash-chained log verifies; for every unit the trading position
// equals the vault plus what customers owe in goods; the vault holds nothing negative; and every document it made is
// in روزنگار of its day, found by one of its own figures in the number search, and opened by its tracking code.
// A catalogue event without a recipe here fails the test.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.mjs';
import { createServer } from '../server/index.mjs';
import { seedUsers } from '../server/api.mjs';
import * as T from '../public/js/trade.mjs';
import { EVENTS } from '../public/js/shopevents.mjs';
import { figuresOf } from '../public/js/daysearch.mjs';
import { jalaliOf } from '../public/js/ta.mjs';
import { smsLogin } from './helpers/login.mjs';

let server, base, O, M, E;
const call = async (method, path, body, token = M) => {
  const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const ok = async (method, path, body, token = M) => {
  const r = await call(method, path, body, token);
  assert.ok(r.status < 300, `${method} ${path} → ${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
};
const doc = (body, token = M) => ok('POST', '/api/books/docs', body, token);
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran' }).format(new Date());
const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const yesterday = addDays(today, -1);
const r3 = (x) => Math.round(x * 1000) / 1000;
const MAZ = 400000000;
const valueOf = (line) => T.tradeLine(line, { round: 10000 }).value;
const bal = async (id) => (await ok('GET', `/api/books/parties/${id}`)).balance;
const P = {};
let cashId, bankId;
const S = {}; // documents one recipe leaves for another

before(async () => {
  const db = openDb(':memory:');
  seedUsers(db, {}, true);
  server = createServer({ db, secret: 'shopevents-secret-0123456789', demo: true, quiet: true, rateLimit: 1e9, marketOpts: { fetchImpl: async () => new Response('{}', { status: 404 }), defaultMode: 'off' } });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  O = await smsLogin(base, '09120000001');
  M = await smsLogin(base, '09120000002');
  E = await smsLogin(base, '09120000004');
  await ok('PUT', '/api/books/settings', { edition: 'base', tradeRound: 10000 });
  const accs = (await ok('GET', '/api/books/accounts')).items;
  cashId = accs.find((a) => a.kind === 'cash').id;
  bankId = accs.find((a) => a.kind === 'bank').id;
  for (const [k, body] of Object.entries({
    ali: { name: 'علی مشتری', mobile: '09121230001' },
    reza: { name: 'رضا مشتری', mobile: '09121230002' },
    colleague: { name: 'همکار بازار', group: 'همکار' },
    bankParty: { name: 'بانک ملی شعبه بازار' },
    lab: { name: 'آزمایشگاه عیارسنجی' },
    refinery: { name: 'پالایشگاه' },
    landlord: { name: 'صاحب‌ملک' },
    employee: { name: 'کارمند مغازه' },
    deceased: { name: 'مشتری متوفی' },
    heir: { name: 'وارث مشتری' },
    court: { name: 'توقیف دادگاه' },
  }))
    P[k] = await ok('POST', '/api/books/parties', body);
});
after(() => {
  server.close();
  server.bus?.stop?.();
});

/* ---------------- one recipe per catalogue event; each returns the documents it made ---------------- */
const melt = (dir, weight, fineness = 750, extra = {}) => ({ kind: 'melt', dir, weight, fineness, mazaneh: MAZ, ...extra });
const coin = (dir, c, count, extra = {}) => ({ kind: 'coin', dir, coin: c, count, ...extra });
const trade = (partyId, lines, payments = [], extra = {}) => doc({ type: 'trade', partyId, lines, payments, ...extra });
const cash = (dir, amount) => ({ method: 'cash', dir, amount, account: cashId });
const settle = (lines) => {
  // what the customer pays (in) or is paid (out) so nothing stays on account
  const net = lines.filter((l) => l.priced !== false).reduce((s, l) => s + (l.dir === 'out' ? 1 : -1) * valueOf(l), 0);
  return net > 0 ? [cash('in', net)] : net < 0 ? [cash('out', -net)] : [];
};
const books = (type, category, payments, extra = {}) => doc({ type, category, payments, note: category, ...extra });
const adjust = (balances, note) => doc({ type: 'adjust', money: 'rial', balances, note });
const writeoff = (partyId, unit, amount, note = 'تسویه با توافق') => doc({ type: 'writeoff', partyId, writeoff: { unit, amount }, note });
const hawala = (from, to, unit, amount) => doc({ type: 'hawala', hawala: { from, to, unit, amount } });
const transform = (lines, payments = [], note = 'ذوب در کارگاه') => doc({ type: 'transform', lines, payments, note });
const coinEq = (c, n) => r3(n * T.coinEq750(c));

const R = {
  // ---- آبشده
  'melt-buy-cash': async () => {
    const l = melt('in', 12.345, 740);
    const d = await trade(P.ali.id, [l], [cash('out', valueOf(l))]);
    assert.equal(d.calc.credit, 0);
    S.meltBuy = d;
    return [d];
  },
  'melt-sell-card': async () => {
    const l = melt('out', 5.5, 750, { mazaneh: MAZ + 2000000 });
    const d = await trade(P.reza.id, [l], [{ method: 'pos', dir: 'in', amount: valueOf(l), ref: '445566', account: bankId }]);
    assert.equal(d.calc.credit, 0);
    S.meltSell = d;
    return [d];
  },
  'melt-buy-credit': async () => {
    const before = (await bal(P.ali.id)).IRR ?? 0;
    const d = await trade(P.ali.id, [melt('in', 8, 750)]);
    assert.equal(((await bal(P.ali.id)).IRR ?? 0) - before, -d.calc.buys, 'the price goes to his rial account (we owe him)');
    return [d];
  },
  'melt-gram750': async () => {
    const d = await trade(P.ali.id, [{ kind: 'melt', dir: 'in', weight: 3.21, fineness: 750, basis: 'gram750', g750: 92000000 }], [cash('out', Math.round((3.21 * 92000000) / 10000) * 10000)]);
    assert.equal(d.calc.lines[0].value, Math.round((3.21 * 92000000) / 10000) * 10000);
    return [d];
  },
  'melt-amount': async () => {
    const d = await trade(P.reza.id, [{ kind: 'melt', dir: 'out', weight: 13, fineness: 750, basis: 'amount', amount: 1234560000 }], [cash('in', 1234560000)]);
    assert.equal(d.calc.lines[0].value, 1234560000);
    assert.ok(d.calc.lines[0].impliedMazaneh > 0, 'the implied مظنه is shown beside the line');
    return [d];
  },
  'melt-deposit': async () => {
    const d = await trade(P.reza.id, [melt('in', 20, 745, { priced: false })]);
    assert.equal((await bal(P.reza.id)).G750, -19.867);
    return [d];
  },
  'melt-deliver': async () => {
    const d = await trade(P.reza.id, [melt('out', 10, 750, { priced: false })]);
    assert.equal((await bal(P.reza.id)).G750, -9.867);
    return [d];
  },
  'melt-fix-later': async () => {
    const d = await doc({ type: 'convert', partyId: P.reza.id, convert: { unit: 'G750', amount: -5, mazaneh: MAZ } });
    const b = await bal(P.reza.id);
    assert.equal(b.G750, -4.867);
    assert.ok(d.calc.convert.value > 0);
    return [d];
  },
  'melt-conditional': async () => {
    const d = await trade(P.ali.id, [melt('in', 30, 740, { conditional: true })]);
    const v2 = await ok('POST', `/api/books/docs/${d.id}/assay`, { line: 0, fineness: 735 });
    assert.equal(v2.version, 2);
    assert.ok(v2.calc.buys < d.calc.buys);
    return [v2];
  },
  'melt-forward-sale': async () => {
    const before = (await ok('GET', '/api/books/vault')).gold;
    const lines = [melt('out', 15, 750), melt('in', 15, 750, { priced: false })];
    const d = await trade(P.reza.id, lines, settle(lines));
    assert.equal((await ok('GET', '/api/books/vault')).gold, before, 'the gold stays in the vault until delivered');
    assert.equal((await bal(P.reza.id)).G750, r3(-4.867 - 15));
    return [d];
  },
  'melt-forward-buy': async () => {
    const g0 = (await bal(P.ali.id)).G750 ?? 0;
    const lines = [melt('in', 7, 750), melt('out', 7, 750, { priced: false })];
    const d = await trade(P.ali.id, lines, settle(lines));
    assert.equal(r3(((await bal(P.ali.id)).G750 ?? 0) - g0), 7, 'he owes us the gold until he brings it');
    return [d];
  },
  'melt-diff-only': async () => {
    const lines = [melt('in', 100, 750, { mazaneh: MAZ - 1000000 }), melt('out', 100, 750, { mazaneh: MAZ + 1000000 })];
    const d = await trade(P.colleague.id, lines, settle(lines));
    assert.ok(d.calc.net > 0 && d.calc.net < 50000000, 'only the difference of the two prices moves');
    return [d];
  },
  'melt-colleague': async () => {
    const d = await trade(P.colleague.id, [melt('out', 50, 750)]);
    const owes = (await bal(P.colleague.id)).IRR;
    const weOweAli = -((await bal(P.ali.id)).IRR ?? 0);
    assert.ok(owes > 0 && weOweAli > 0);
    const h = await hawala(P.ali.id, P.colleague.id, 'IRR', Math.min(owes, weOweAli));
    assert.equal((await bal(P.colleague.id)).IRR ?? 0, owes - Math.min(owes, weOweAli));
    return [d, h];
  },
  'melt-settle-gold': async () => {
    const before = (await bal(P.colleague.id)).IRR ?? 0;
    const d = await trade(P.colleague.id, [melt('in', 2.5, 750)]);
    assert.equal(((await bal(P.colleague.id)).IRR ?? 0) - before, -d.calc.buys);
    return [d];
  },
  // ---- سکه
  'coin-buy': async () => [await trade(P.ali.id, [coin('in', 'emami', 3, { price: 980000000 })], [cash('out', 3 * 980000000)])],
  'coin-sell': async () => [await trade(P.reza.id, [coin('out', 'emami', 2, { price: 1000000000 })], [{ method: 'c2c', dir: 'in', amount: 2000000000, ref: '998877', card: '7890', account: bankId }])],
  'coin-weight': async () => {
    const l = coin('in', 'gerami', 5, { basis: 'weight', weight: 5.123, gramPrice: 95000000 });
    const d = await trade(P.ali.id, [l], [cash('out', valueOf(l))]);
    assert.equal(d.calc.lines[0].value, Math.round((5.123 * 95000000) / 10000) * 10000);
    return [d];
  },
  'coin-deposit': async () => {
    const d = await trade(P.reza.id, [coin('in', 'half', 4, { priced: false })]);
    assert.equal((await bal(P.reza.id))['COIN:half'], -4);
    return [d];
  },
  'coin-deliver': async () => {
    const d = await trade(P.reza.id, [coin('out', 'half', 2, { priced: false })]);
    assert.equal((await bal(P.reza.id))['COIN:half'], -2);
    return [d];
  },
  'coin-swap-gold': async () => {
    const lines = [coin('out', 'emami', 1, { price: 1000000000 }), melt('in', 10, 750)];
    return [await trade(P.ali.id, lines, settle(lines))];
  },
  'coin-fix': async () => {
    const d = await doc({ type: 'convert', partyId: P.reza.id, convert: { unit: 'COIN:half', amount: -2, price: 500000000 } });
    const b = await bal(P.reza.id);
    assert.equal(b['COIN:half'], undefined);
    assert.equal(d.calc.convert.value, 1000000000);
    return [d];
  },
  'coin-melt': async () => {
    const eq = coinEq('quarter', 2);
    const d = await transform([coin('out', 'quarter', 2), melt('in', r3(eq * 0.99), 750)]);
    assert.equal(d.calc.inputs, eq);
    return [d];
  },
  'coin-lost': async () => [await adjust([{ acct: 'coin:gerami', amount: -1 }], 'یک سکه گرمی تقلبی بود')],
  'coin-gift': async () => [await books('expense', 'حقوق و دستمزد', [{ method: 'coin', dir: 'out', coin: 'gerami', count: 1, price: 3000000 }])],
  // ---- شمش
  'bar-buy': async () => {
    const l = { kind: 'bar', dir: 'in', serial: 'ZB-1001', brand: 'زربد', gallery: 'رزا', weight: 100, fineness: 995, sealDate: yesterday, mazaneh: MAZ, fee: 5000000 };
    const d = await trade(P.colleague.id, [l], [{ method: 'havale', dir: 'out', amount: valueOf(l), ref: '112233', account: bankId }]);
    return [d];
  },
  'bar-sell': async () => {
    const l = { kind: 'bar', dir: 'out', serial: 'ZB-1001', weight: 100, fineness: 995, mazaneh: MAZ + 2000000 };
    const d = await trade(P.reza.id, [l], [{ method: 'pos', dir: 'in', amount: valueOf(l), ref: '332211', account: bankId }]);
    assert.equal((await ok('GET', '/api/books/bars?q=ZB-1001')).items[0].inVault, false);
    return [d];
  },
  'bar-deposit': async () => {
    const d = await trade(P.ali.id, [{ kind: 'bar', dir: 'in', serial: 'ZB-2002', weight: 50, fineness: 999.9, priced: false }]);
    assert.equal((await bal(P.ali.id))['BAR:ZB-2002'], -1);
    return [d];
  },
  'bar-duplicate': async () => {
    const r = await call('POST', '/api/books/docs', { type: 'trade', partyId: P.reza.id, lines: [{ kind: 'bar', dir: 'in', serial: 'ZB-2002', weight: 50, fineness: 999.9, mazaneh: MAZ }] });
    assert.equal(r.status, 409);
    assert.match(r.body.error, /ZB-2002/);
    const h = (await ok('GET', '/api/books/bars?q=ZB-2002')).items[0];
    assert.equal(h.history.length, 1, 'the registry shows the one real entry');
    return [];
  },
  'bar-melt': async () => {
    const buy = { kind: 'bar', dir: 'in', serial: 'ZB-3003', weight: 100, fineness: 995, mazaneh: MAZ };
    const b = await trade(P.colleague.id, [buy], [cash('out', valueOf(buy))]);
    const eq = r3((100 * 995) / 750);
    const d = await transform([{ kind: 'bar', dir: 'out', serial: 'ZB-3003', weight: 100, fineness: 995 }, melt('in', r3(eq * 0.998), 750)]);
    assert.equal(d.calc.inputs, eq);
    return [b, d];
  },
  'bar-seal': async () => {
    const w = r3((139.5 * 750) / 999.9);
    const d = await transform([melt('out', 140, 750), { kind: 'bar', dir: 'in', serial: 'NEW-4004', weight: w, fineness: 999.9, brand: 'پلمپ خودمان' }], [cash('out', 3000000)], 'پلمپ آبشده در کارگاه');
    assert.equal((await ok('GET', '/api/books/bars?q=NEW-4004')).items[0].inVault, true);
    return [d];
  },
  'bar-collateral': async () => {
    const d = await trade(P.reza.id, [{ kind: 'bar', dir: 'in', serial: 'ZB-5005', weight: 100, fineness: 995, priced: false }], [cash('out', 5000000000)]);
    const b = await bal(P.reza.id);
    assert.equal(b['BAR:ZB-5005'], -1);
    return [d];
  },
  // ---- ارز
  'fx-buy': async () => [await trade(P.ali.id, [{ kind: 'fx', dir: 'in', code: 'USD', fxAmount: 1000, rate: 820000 }], [cash('out', 820000000)])],
  'fx-sell': async () => [await trade(P.reza.id, [{ kind: 'fx', dir: 'out', code: 'EUR', fxAmount: 500, rate: 900000 }], [{ method: 'pos', dir: 'in', amount: 450000000, ref: '667788', account: bankId }])],
  'fx-pay-gold': async () => {
    const lines = [{ kind: 'fx', dir: 'in', code: 'USD', fxAmount: 2000, rate: 820000 }, melt('out', 18, 750)];
    return [await trade(P.ali.id, lines, settle(lines))];
  },
  'fx-deposit': async () => {
    const d = await trade(P.reza.id, [{ kind: 'fx', dir: 'in', code: 'AED', fxAmount: 3000, priced: false }]);
    assert.equal((await bal(P.reza.id))['FX:AED'], -3000);
    return [d];
  },
  // ---- وجه، بانک و چک
  'money-receive': async () => {
    const owes = (await bal(P.colleague.id)).IRR ?? 0;
    const amount = owes > 0 ? owes : 100000000;
    const d = await trade(P.colleague.id, [], [{ method: 'havale', dir: 'in', amount, ref: '556677', account: bankId }]);
    return [d];
  },
  'money-pay': async () => [await trade(P.colleague.id, [], [cash('out', 50000000)])],
  'money-split': async () => {
    const l = melt('out', 3, 750);
    const v = valueOf(l), half = Math.round(v / 20000) * 10000;
    const d = await trade(P.reza.id, [l], [cash('in', half), { method: 'pos', dir: 'in', amount: v - half, ref: '121212', account: bankId }]);
    assert.equal(d.calc.credit, 0);
    return [d];
  },
  'money-cheque-in': async () => {
    const before = (await bal(P.ali.id)).IRR ?? 0;
    const d = await trade(P.ali.id, [], [{ method: 'cheque', dir: 'in', amount: 200000000, chequeNo: '123456', bank: 'ملی', due: addDays(today, 30) }]);
    assert.equal(((await bal(P.ali.id)).IRR ?? 0) - before, -200000000);
    S.chequeIn = d;
    return [d];
  },
  'money-cheque-bounce': async () => {
    const before = (await bal(P.ali.id)).IRR ?? 0;
    const q = (await ok('GET', '/api/books/cheques')).items.find((c) => c.no === '123456');
    await ok('PATCH', `/api/books/cheques/${q.id}`, { status: 'deposited', accountId: bankId });
    await ok('PATCH', `/api/books/cheques/${q.id}`, { status: 'bounced' });
    assert.equal(((await bal(P.ali.id)).IRR ?? 0) - before, 200000000, 'a bounced cheque puts the debt back');
    return [S.chequeIn];
  },
  'money-cheque-endorse': async () => {
    const d = await trade(P.reza.id, [], [{ method: 'cheque', dir: 'in', amount: 150000000, chequeNo: '654321', bank: 'ملت', due: addDays(today, 20) }]);
    const q = (await ok('GET', '/api/books/cheques')).items.find((c) => c.no === '654321');
    const before = (await bal(P.colleague.id)).IRR ?? 0;
    await ok('PATCH', `/api/books/cheques/${q.id}`, { status: 'spent', toParty: P.colleague.id });
    assert.equal(((await bal(P.colleague.id)).IRR ?? 0) - before, 150000000, 'the cheque given to the colleague is paid to him');
    return [d];
  },
  'money-cheque-out': async () => {
    const d = await trade(P.colleague.id, [], [{ method: 'cheque', dir: 'out', amount: 100000000, chequeNo: '778899', bank: 'ملت', due: addDays(today, 15) }]);
    const q = (await ok('GET', '/api/books/cheques')).items.find((c) => c.no === '778899');
    await ok('PATCH', `/api/books/cheques/${q.id}`, { status: 'paid', accountId: bankId });
    return [d];
  },
  'money-transfer': async () => {
    const v0 = await ok('GET', '/api/books/vault');
    const d = await doc({ type: 'transfer', payments: [{ method: 'cash', dir: 'out', amount: 1000000, account: cashId }, { method: 'havale', dir: 'in', amount: 1000000, account: bankId, ref: '343434' }] });
    const v1 = await ok('GET', '/api/books/vault');
    assert.equal(v0.cash[cashId] - v1.cash[cashId], 10000000);
    assert.equal(v1.bank[bankId] - v0.bank[bankId], 10000000);
    return [d];
  },
  'money-pos-decline': async () => {
    // the card was declined at the terminal: nothing is saved with it; the same trade is recorded with another method
    const l = melt('out', 1.111, 750);
    return [await trade(P.reza.id, [l], [cash('in', valueOf(l))])];
  },
  'money-bank-recon': async () => {
    const bk = await ok('GET', `/api/books/bank/${bankId}`);
    const row = bk.rows.find((x) => !x.reconciled && x.refs.some((r) => String(r).includes('445566')));
    assert.ok(row, 'the card sale is on the bank account');
    const m = await ok('POST', `/api/books/bank/${bankId}/match`, { rows: [{ date: row.date, amt: row.amt, ref: '445566' }] });
    assert.ok(m.matches.length >= 1, JSON.stringify(m).slice(0, 300));
    await ok('POST', `/api/books/bank/${bankId}/recon`, { items: [{ src: m.matches[0].book?.id ?? m.matches[0].id ?? row.id, on: true, ref: 'صورتحساب ۱' }] });
    assert.ok((await ok('GET', `/api/books/bank/${bankId}`)).rows.some((x) => x.reconciled));
    return [];
  },
  // ---- طرف حساب‌ها
  'party-hawala': async () => [await hawala(P.ali.id, P.reza.id, 'IRR', 10000000)],
  'party-hawala-gold': async () => [await hawala(P.reza.id, P.ali.id, 'G750', 1.5)],
  'party-merge': async () => {
    const dup = await ok('POST', '/api/books/parties', { name: 'علی مشتری', alias: 'حساب دوم' });
    const dep = await trade(dup.id, [melt('in', 2, 750, { priced: false })]);
    const h = await hawala(dup.id, P.ali.id, 'G750', 2);
    assert.deepEqual(await bal(dup.id), {});
    await ok('DELETE', `/api/books/parties/${dup.id}`);
    return [dep, h];
  },
  'party-writeoff': async () => {
    const owes = (await bal(P.colleague.id)).IRR ?? 0;
    assert.ok(owes > 1230000, `the colleague owes ${owes}`);
    const d = await writeoff(P.colleague.id, 'IRR', 1230000);
    assert.equal((await bal(P.colleague.id)).IRR, owes - 1230000);
    const over = await call('POST', '/api/books/docs', { type: 'writeoff', partyId: P.colleague.id, writeoff: { unit: 'IRR', amount: -5 }, note: 'خلاف جهت' });
    assert.equal(over.status, 400, 'never across zero');
    return [d];
  },
  'party-leftover': async () => {
    const g = (await bal(P.reza.id)).G750;
    assert.ok(g < -0.123);
    const d = await writeoff(P.reza.id, 'G750', -0.123, 'خرده طلبی که پس نمی‌گیرد');
    assert.equal((await bal(P.reza.id)).G750, r3(g + 0.123));
    return [d];
  },
  'party-limit': async () => {
    await ok('PUT', `/api/books/parties/${P.reza.id}`, { ...P.reza, creditLimit: 1000000, money: 'rial' });
    const body = { type: 'trade', partyId: P.reza.id, lines: [melt('out', 4, 750)] };
    const refused = await call('POST', '/api/books/docs', body, E);
    assert.equal(refused.status, 409);
    assert.match(refused.body.error, /سقف اعتبار/);
    const d = await doc({ ...body, force: true });
    await ok('PUT', `/api/books/parties/${P.reza.id}`, { ...P.reza, creditLimit: 0, money: 'rial' });
    return [d];
  },
  'party-confirm': async () => {
    const s = await ok('POST', `/api/books/parties/${P.ali.id}/share`, { days: 7 });
    const v = await fetch(`${base}/api/public/statement/${s.token}`).then((r) => r.json());
    assert.ok(v.balance || v.statement || v.party, 'the customer sees his statement');
    const a = await fetch(`${base}/api/public/statement/${s.token}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ answer: 'agree' }) });
    assert.equal(a.status, 200);
    return [];
  },
  'party-same-name': async () => {
    const a = await ok('POST', '/api/books/parties', { name: 'علی کریمی' });
    const b = await ok('POST', '/api/books/parties', { name: 'علی کریمی', alias: 'علی طلا', father: 'حسن', city: 'اصفهان' });
    assert.notEqual(a.label, b.label);
    assert.equal((await call('POST', '/api/books/parties', { name: 'علي كريمي' })).status, 409, 'a third one needs a mark of its own');
    return [];
  },
  // ---- گاوصندوق و موجودی
  'vault-count': async () => [await adjust([{ acct: 'gold', amount: -0.25 }, { acct: 'coin:emami', amount: 1, cost: 950000000 }, { acct: 'fx:USD', amount: -10 }], 'شمارش آخر روز')],
  'vault-cash-short': async () => [await adjust([{ acct: `cash:${cashId}`, amount: -500000 }], 'کسری صندوق')],
  'vault-bar-missing': async () => {
    const d = await adjust([{ acct: 'bar:NEW-4004', amount: -1 }], 'شمش پیدا نشد');
    assert.equal((await ok('GET', '/api/books/bars?q=NEW-4004')).items[0].inVault, false);
    return [d];
  },
  'vault-melt-scrap': async () => {
    const eq = r3((25.5 * 585) / 750);
    const d = await transform([melt('out', 25.5, 585), melt('in', r3(eq * 0.97), 750)], [], 'ذوب خرده‌طلا');
    assert.ok(d.calc.wastage > 0);
    return [d];
  },
  'vault-lab': async () => {
    const out = await trade(P.lab.id, [melt('out', 50, 740, { priced: false })]);
    const back = await trade(P.lab.id, [melt('in', 48, 750, { priced: false })]);
    const left = (await bal(P.lab.id)).G750;
    assert.equal(left, r3(r3((50 * 740) / 750) - 48));
    const w = await writeoff(P.lab.id, 'G750', left, 'افت ری‌گیری آزمایشگاه');
    assert.deepEqual(await bal(P.lab.id), {});
    return [out, back, w];
  },
  'vault-opening': async () => [S.opening],
  'vault-close-day': async () => {
    const v = await ok('GET', `/api/books/close?day=${today}`, null, O);
    const sign = await ok('POST', '/api/auth/sign-code', {}, O);
    const open = v.checks.filter((c) => !c.ok).map((c) => c.key);
    const c = await ok('POST', '/api/books/close', { day: today, code: sign.code, ack: open, note: 'موارد باز فردا بررسی می‌شود' }, O);
    assert.match(c.hash, /^[0-9a-f]{64}$/);
    assert.equal((await ok('GET', `/api/books/close/${today}/verify`, null, O)).valid, true);
    return [];
  },
  // ---- درآمد و هزینه
  'inc-assay': async () => [await books('income', 'کارمزد عیارسنجی و ری‌گیری', [{ method: 'cash', dir: 'in', amount: 500000, account: cashId }])],
  'inc-commission': async () => {
    const before = (await bal(P.colleague.id)).IRR ?? 0;
    const d = await books('income', 'کمیسیون و حق‌الزحمه', [{ method: 'offset', dir: 'in', amount: 1000000 }], { partyId: P.colleague.id });
    assert.equal(((await bal(P.colleague.id)).IRR ?? 0) - before, 10000000, 'he owes the commission');
    return [d];
  },
  'inc-bank': async () => [await books('income', 'سود بانکی', [{ method: 'havale', dir: 'in', amount: 2500000, account: bankId, ref: '909090' }])],
  'inc-in-kind': async () => [await books('income', 'کارمزد عیارسنجی و ری‌گیری', [{ method: 'gold', dir: 'in', weight: 0.5, fineness: 750, p750: 9200000 }])],
  'exp-rent': async () => [await books('expense', 'اجاره', [{ method: 'cash', dir: 'out', amount: 20000000, account: cashId }])],
  'exp-salary': async () => [await books('expense', 'حقوق و دستمزد', [{ method: 'havale', dir: 'out', amount: 15000000, account: bankId, ref: '808080' }])],
  'exp-later': async () => {
    const d = await books('expense', 'اجاره', [{ method: 'offset', dir: 'out', amount: 20000000 }], { partyId: P.landlord.id });
    assert.equal((await bal(P.landlord.id)).IRR, -200000000, 'we owe the landlord');
    return [d];
  },
  'exp-melt-fee': async () => [await books('expense', 'ذوب و ری‌گیری', [{ method: 'cash', dir: 'out', amount: 300000, account: cashId }])],
  // ---- اصلاح، کنترل و پیدا کردن
  'fix-amend': async () => {
    const d = S.meltBuy;
    const body = { ...d, lines: [{ ...d.lines[0], weight: 12.354 }], reason: 'وزن اشتباه زده شد' };
    const a = await ok('PUT', `/api/books/docs/${d.id}`, body);
    assert.equal(a.amended, d.id);
    const t = await ok('GET', `/api/books/trace?q=${a.track}`);
    assert.ok(JSON.stringify(t.items[0].changes ?? t.items[0].events).includes('وزن'), 'the change says what changed');
    S.amended = a;
    return [a];
  },
  'fix-void': async () => {
    const d = await trade(P.ali.id, [melt('in', 0.777, 750)]);
    await ok('POST', `/api/books/docs/${d.id}/void`, { reason: 'کل سند اشتباه بود' });
    S.voided = await ok('GET', `/api/books/docs/${d.id}`);
    assert.equal(S.voided.status, 'void');
    return [S.voided];
  },
  'fix-restore': async () => {
    const r = await ok('POST', `/api/books/docs/${S.voided.id}/restore`, { reason: 'ابطال اشتباه بود' });
    const d = await ok('GET', `/api/books/docs/${r.id}`);
    assert.equal(d.calc.buys, S.voided.calc.buys, 'exactly the same figures');
    return [d];
  },
  'fix-backdate': async () => {
    const body = { type: 'trade', partyId: P.ali.id, date: yesterday, lines: [melt('in', 1.234, 750)] };
    assert.equal((await call('POST', '/api/books/docs', body, E)).status, 403, 'a seller may not back-date');
    return [await doc(body)];
  },
  'fix-approval': async () => {
    await ok('PUT', '/api/books/control/approvals/rules', { enabled: true }, O);
    const body = { type: 'trade', partyId: P.reza.id, lines: [melt('out', 10, 750, { mazaneh: 100000000 })], payments: [cash('in', valueOf(melt('out', 10, 750, { mazaneh: 100000000 })))] };
    const first = await call('POST', '/api/books/docs', body);
    assert.equal(first.status, 428, JSON.stringify(first.body));
    const ap = (await ok('GET', '/api/books/control/approvals', null, O)).items.find((a) => a.status === 'pending');
    assert.equal((await call('POST', `/api/books/control/approvals/${ap.id}/approve`, {}, M)).status, 403, 'four eyes: not by the one who asked');
    await ok('POST', `/api/books/control/approvals/${ap.id}/approve`, {}, O);
    const d = await doc(body);
    await ok('PUT', '/api/books/control/approvals/rules', { enabled: false }, O);
    return [d];
  },
  'fix-lock': async () => {
    const p = await ok('GET', '/api/books/control/periods');
    const [y, m] = p.current.split('-').map(Number);
    const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
    await ok('POST', '/api/books/control/periods/lock', { month: prev });
    // the latest day of the locked month
    let old = today;
    for (let n = 1; n < 70; n++) {
      const d = addDays(today, -n);
      const [jy, jm] = jalaliOf(d);
      if (`${jy}-${String(jm).padStart(2, '0')}` === prev) {
        old = d;
        break;
      }
    }
    assert.notEqual(old, today, 'a day of the previous month');
    const r = await call('POST', '/api/books/docs', { type: 'trade', partyId: P.ali.id, date: old, lines: [melt('in', 0.5, 750)] });
    assert.equal(r.status, 423, `a document in the locked month is refused: ${JSON.stringify(r.body)}`);
    const fix = await doc({ type: 'trade', partyId: P.ali.id, lines: [melt('in', 0.5, 750)], note: 'اصلاح ماه بسته در تاریخ باز' });
    return [fix];
  },
  'fix-find': async () => {
    const d = S.meltSell;
    const near = Math.round((d.calc.sells * 1.02) / 1e6);
    const f = await ok('GET', `/api/books/daybook/find?q=${encodeURIComponent(`حدود ${near} میلیون ریال`)}&sec=melt`);
    assert.ok(f.items.some((g) => g.docs.some((x) => x.id === d.id)), 'about the amount, inside آبشده');
    return [];
  },
  'fix-track': async () => {
    const t = await ok('GET', `/api/books/trace?q=${S.amended.track}`);
    assert.equal(t.items[0].id, S.amended.id);
    assert.ok(t.items[0].amends || t.items[0].events.length, 'its whole life');
    return [];
  },
  // ---- رویدادهای دور
  'rare-theft': async () => {
    const r = await call('POST', '/api/books/docs', { type: 'adjust', money: 'rial', balances: [{ acct: 'gold', amount: -1000000 }], note: 'بیش از موجودی' });
    assert.equal(r.status, 400, 'a count never leaves the vault below zero');
    assert.match(r.body.error, /منفی/);
    return [await adjust([{ acct: 'gold', amount: -3 }], 'سرقت')];
  },
  'rare-fake-cash': async () => [await adjust([{ acct: `cash:${cashId}`, amount: -1000000 }], 'اسکناس جعلی')],
  'rare-fake-fx': async () => [await adjust([{ acct: 'fx:USD', amount: -100 }], 'دلار تقلبی')],
  'rare-insurance': async () => [await books('income', 'بیمه و خسارت', [{ method: 'havale', dir: 'in', amount: 50000000, account: bankId, ref: '707070' }])],
  'rare-pawn': async () => {
    const d = await trade(P.ali.id, [melt('in', 40, 750, { priced: false })], [cash('out', 2000000000)]);
    return [d];
  },
  'rare-inheritance': async () => {
    const dep = await trade(P.deceased.id, [coin('in', 'emami', 2, { priced: false })]);
    const h = await hawala(P.deceased.id, P.heir.id, 'COIN:emami', 2);
    assert.deepEqual(await bal(P.deceased.id), {});
    assert.equal((await bal(P.heir.id))['COIN:emami'], -2);
    return [dep, h];
  },
  'rare-gift-in': async () => [await books('income', 'هدیه', [{ method: 'gold', dir: 'in', weight: 1, fineness: 750, p750: 9200000 }])],
  'rare-charity': async () => [await books('expense', 'خیریه و نذر', [{ method: 'coin', dir: 'out', coin: 'quarter', count: 1, price: 25000000 }])],
  'rare-rent-coin': async () => [await books('expense', 'اجاره', [{ method: 'coin', dir: 'out', coin: 'emami', count: 1, price: 100000000 }])],
  'rare-court': async () => {
    const x = (await bal(P.reza.id)).IRR ?? 0;
    assert.ok(x !== 0);
    const h = x > 0 ? await hawala(P.court.id, P.reza.id, 'IRR', x) : await hawala(P.reza.id, P.court.id, 'IRR', -x);
    assert.equal((await bal(P.reza.id)).IRR, undefined);
    assert.equal((await bal(P.court.id)).IRR, x);
    return [h];
  },
  'rare-fire': async () => {
    const a = await adjust([{ acct: 'gold', amount: -10 }, { acct: 'coin:half', amount: -1 }], 'آتش‌سوزی');
    const i = await books('income', 'بیمه و خسارت', [{ method: 'cash', dir: 'in', amount: 30000000, account: cashId }]);
    return [a, i];
  },
  'rare-refinery': async () => {
    const out = await trade(P.refinery.id, [melt('out', 100, 995, { priced: false })]);
    const back = await trade(P.refinery.id, [melt('in', 131, 750, { priced: false })]);
    const left = (await bal(P.refinery.id)).G750;
    assert.equal(left, r3(r3((100 * 995) / 750) - 131));
    const w = await writeoff(P.refinery.id, 'G750', left, 'پالایشگاه کمتر برگرداند');
    return [out, back, w];
  },
  'rare-dispute': async () => {
    const d = S.meltSell;
    const a = await ok('PUT', `/api/books/docs/${d.id}`, { ...d, lines: [{ ...d.lines[0], fineness: 745 }], reason: 'مشتری مدعی عیار کمتر شد' });
    assert.ok(a.calc.sells < d.calc.sells);
    return [a];
  },
  'rare-coin-prepay': async () => {
    const lines = [coin('in', 'emami', 5, { price: 950000000 }), coin('out', 'emami', 5, { priced: false })];
    const d = await trade(P.bankParty.id, lines, [{ method: 'havale', dir: 'out', amount: 5 * 950000000, account: bankId, ref: '606060' }]);
    assert.equal((await bal(P.bankParty.id))['COIN:emami'], 5, 'the bank owes the coins until it delivers');
    return [d];
  },
};

/* ---------------- after every event ---------------- */
const fig = (d) => {
  // the most telling figure a person would type: the biggest money figure, else grams, else a count
  const f = figuresOf(d).filter((x) => x.u === 'IRR' || x.u === 'G' || x.u === 'N');
  const pick = f.filter((x) => x.u === 'IRR').sort((a, b) => b.v - a.v)[0] ?? f.filter((x) => x.u === 'G').sort((a, b) => b.v - a.v)[0] ?? f.sort((a, b) => b.v - a.v)[0];
  if (!pick) return null;
  return pick.u === 'IRR' ? `${Math.round(pick.v)} ریال` : pick.u === 'G' ? `${r3(pick.v)} گرم` : `${pick.v} عدد`;
};
async function oneChain(id, docs) {
  const log = await ok('GET', '/api/books/log', null, O);
  assert.equal(log.chain.ok, true, `${id}: the log's hash chain`);
  const [pnl, v, parties, bars] = await Promise.all([ok('GET', `/api/books/report/pnl?from=0000-01-01&to=${today}`), ok('GET', '/api/books/vault'), ok('GET', '/api/books/parties'), ok('GET', '/api/books/bars')]);
  const pos = Object.fromEntries(pnl.positions.map((x) => [x.key, x.qty]));
  const owed = (u) => parties.items.reduce((a, p) => a + (p.balance[u] ?? 0), 0);
  const eqOf = Object.fromEntries(bars.items.map((b) => [b.serial, b.weight ? r3((b.weight * (b.fineness ?? 995)) / 750) : 0]));
  const barGold = v.bars.reduce((a, b) => a + (eqOf[b.serial] ?? 0), 0) + parties.items.reduce((a, p) => a + Object.entries(p.balance).filter(([u]) => u.startsWith('BAR:')).reduce((s, [u, n]) => s + n * (eqOf[u.slice(4)] ?? 0), 0), 0);
  const gold = r3(v.gold + barGold + owed('G750'));
  assert.ok(Math.abs(r3(pos.G750 ?? 0) - gold) < 0.002, `${id}: gold position ${pos.G750} = vault + bars + customers ${gold}`);
  for (const c of new Set([...Object.keys(v.coins), ...Object.keys(pos).filter((k) => k.startsWith('COIN:')).map((k) => k.slice(5))]))
    assert.equal(Math.round(pos[`COIN:${c}`] ?? 0), (v.coins[c] ?? 0) + owed(`COIN:${c}`), `${id}: position of ${c}`);
  for (const f of new Set([...Object.keys(v.fx), ...Object.keys(pos).filter((k) => k.startsWith('FX:')).map((k) => k.slice(3))]))
    assert.ok(Math.abs((pos[`FX:${f}`] ?? 0) - ((v.fx[f] ?? 0) + owed(`FX:${f}`))) < 0.011, `${id}: position of ${f}`);
  // what cannot be negative in a real vault
  assert.ok(v.gold > -0.0005, `${id}: gold in the vault ${v.gold}`);
  for (const [k, n] of [...Object.entries(v.coins), ...Object.entries(v.fx), ...Object.entries(v.cash)]) assert.ok(n >= 0, `${id}: ${k} in the vault ${n}`);
  for (const d of docs) {
    const day = await ok('GET', `/api/books/daybook?day=${d.date}`);
    assert.ok(day.entries.some((e) => e.id === d.id), `${id}: ${d.track} in روزنگار of ${d.date}`);
    const t = await ok('GET', `/api/books/trace?q=${encodeURIComponent(d.track)}`);
    assert.equal(t.items[0]?.id, d.id, `${id}: ${d.track} opens in رهگیری`);
    const q = fig(d);
    if (q) {
      const f = await ok('GET', `/api/books/daybook/find?q=${encodeURIComponent(q)}`);
      assert.ok(f.items.some((g) => g.docs.some((x) => x.id === d.id)), `${id}: «${q}» finds ${d.track}`);
    }
  }
}

test('every catalogue event has a recipe', () => {
  const missing = EVENTS.map((e) => e.id).filter((id) => !R[id]);
  assert.deepEqual(missing, [], 'events without a recipe');
  assert.deepEqual(Object.keys(R).filter((id) => !EVENTS.some((e) => e.id === id)), [], 'recipes without an event');
});

test(`all ${EVENTS.length} events of the shop, one by one, in one chain`, { timeout: 600000 }, async () => {
  // the shop opens first: stock with its cost, money in the boxes, and one customer who owes grams from before
  S.opening = await doc({ type: 'opening', money: 'rial', note: 'افتتاحیه', balances: [
    { acct: 'gold', amount: 500, cost: 500 * 90000000 },
    { acct: 'coin:emami', amount: 20, cost: 20 * 900000000 },
    { acct: 'coin:half', amount: 10, cost: 10 * 480000000 },
    { acct: 'coin:quarter', amount: 10, cost: 10 * 260000000 },
    { acct: 'coin:gerami', amount: 10, cost: 10 * 110000000 },
    { acct: 'fx:USD', amount: 5000, cost: 5000 * 800000 },
    { acct: 'fx:EUR', amount: 2000, cost: 2000 * 880000 },
    { acct: `cash:${cashId}`, amount: 100000000000 },
    { acct: `bank:${bankId}`, amount: 50000000000 },
    { acct: `party:${P.ali.id}`, unit: 'G750', amount: 5 },
  ] });
  // closing the day locks it, so it comes last
  const order = [...EVENTS.map((e) => e.id).filter((id) => id !== 'vault-close-day'), 'vault-close-day'];
  const done = [];
  for (const id of order) {
    const docs = await R[id]();
    await oneChain(id, docs.filter(Boolean));
    done.push(id);
  }
  assert.equal(done.length, EVENTS.length);
  const rep = await ok('GET', '/api/books/replay');
  assert.equal(rep.ok, true, `replay: ${JSON.stringify(rep.diffs?.slice(0, 3))}`);
});
