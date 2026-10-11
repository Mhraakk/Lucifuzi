// spec 0023: a remembered figure, typed in روزنگار, is found on any day by fixed and visible rules
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { openDb } from '../server/db.mjs';
import { createServer } from '../server/index.mjs';
import { seedUsers } from '../server/api.mjs';
import { readQuery, bandsOf, figuresOf, hasNumber } from '../public/js/daysearch.mjs';
import * as B from '../public/js/books.mjs';
import { smsLogin } from './helpers/login.mjs';

const band = (text, opts) => bandsOf(readQuery(text), opts);
const targets = (text, opts) => band(text, opts).bands.map((b) => [b.u, b.target]);

test('reading: units, scales, market forms and «حدود»', () => {
  assert.deepEqual(targets('حدود ۶۰۰ میلیون تومان برای احمد سلطانی زدیم'), [['IRR', 6e9]]);
  assert.equal(band('حدود ۶۰۰ میلیون تومان').tol, 5);
  assert.equal(band('۶۰۰ میلیون تومان').tol, 0);
  assert.equal(band('حدود ۶۰۰ میلیون تومان', { tol: '1' }).tol, 1, 'the switch on the page wins');
  assert.deepEqual(readQuery('حدود ۶۰۰ میلیون تومان برای احمد سلطانی زدیم').words, ['احمد', 'سلطانی']);
  // a money figure without a unit is read in the shop's unit, or in the unit chosen on the page
  assert.deepEqual(targets('۶۰۰ میلیون'), [['IRR', 6e8]]);
  assert.deepEqual(targets('۶۰۰ میلیون', { shopMoney: 'toman' }), [['IRR', 6e9]]);
  assert.deepEqual(targets('۶۰۰ میلیون', { unit: 'toman' }), [['IRR', 6e9]]);
  for (const t of ['۱/۲ میلیارد ریال', 'یک میلیارد و دویست میلیون ریال', '۱٬۲۰۰٬۰۰۰٬۰۰۰ ریال', '1,200,000,000 ریال']) assert.deepEqual(targets(t), [['IRR', 1.2e9]], t);
  assert.deepEqual(targets('۵۹۸/۵ میلیون تومان'), [['IRR', 5.985e9]]);
  assert.deepEqual(targets('۱۲۰ گرم'), [['G', 120]]);
  assert.deepEqual(targets('۴ گرم و ۳۵۰ سوت'), [['G', 4.35]]);
  assert.deepEqual(targets('۱۰ مثقال'), [['MQ', 10]]);
  assert.deepEqual(targets('۳ تا سکه'), [['N', 3]]);
  assert.deepEqual(readQuery('۳ تا سکه').words, []);
  // a bare number is compared, as written, with every kind of figure
  assert.deepEqual(targets('۶۰۰'), [['IRR', 600], ['G', 600], ['N', 600]]);
  assert.deepEqual(targets('مظنه ۱۰۹ میلیون تومان'), [['RATE', 1.09e9]]);
  assert.equal(hasNumber('رضایی'), false);
  assert.equal(hasNumber('یه چک داده بودیم'), false);
  // the band is the rule, shown as is
  const b = band('حدود ۶۰۰ میلیون تومان').bands[0];
  assert.deepEqual([Math.round(b.lo), Math.round(b.hi)], [5.7e9, 6.3e9]);
});

test('figures of a document: payments, line value, weights, مظنه, totals — each named, each once', () => {
  const d = { type: 'trade', lines: [{ kind: 'melt', dir: 'in', weight: 2, fineness: 740, mazaneh: 400000000 }], payments: [{ method: 'c2c', dir: 'out', amount: 100000000 }] };
  d.calc = B.calcDoc(d);
  const f = figuresOf(d);
  const has = (u, v) => f.find((x) => x.u === u && Math.abs(x.v - v) < 1e-6);
  assert.match(has('IRR', 100000000).label, /پرداخت کارت به کارت/);
  assert.match(has('IRR', d.calc.lines[0].value).label, /ارزش آبشده/);
  assert.ok(has('G', 2) && has('G', d.calc.lines[0].eq750) && has('MQ', d.calc.lines[0].mesghal));
  assert.equal(has('RATE', 400000000).label, 'مظنه');
  const keys = f.map((x) => `${x.u}|${x.v}`);
  assert.equal(new Set(keys).size, keys.length);
});

let server, base, db, M, E, today;
const call = async (method, path, body, token) => {
  const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const ok = async (...a) => {
  const r = await call(...a);
  assert.ok(r.status < 300, `${a[0]} ${a[1]} → ${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
};
const find = (q, token = M, extra = '') => ok('GET', `/api/books/daybook/find?q=${encodeURIComponent(q)}${extra}`, null, token);
const flat = (r) => r.items.flatMap((g) => g.docs.map((d) => ({ ...d, day: g.day })));
const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

let ahmad, reza, mehran, d1, d2, d3, d4, a4;
before(async () => {
  db = openDb(':memory:');
  seedUsers(db, {}, true);
  server = createServer({ db, secret: 'test-secret-0123456789', demo: true, quiet: true, marketOpts: { fetchImpl: async () => new Response('{}', { status: 404 }), defaultMode: 'off' } });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  M = await smsLogin(base, '09120000002');
  E = await smsLogin(base, '09120000004');
  today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran' }).format(new Date());
  await ok('PUT', '/api/books/settings', { edition: 'base', tradeRound: 10000 }, M);
  ahmad = await ok('POST', '/api/books/parties', { name: 'احمد سلطانی' }, M);
  reza = await ok('POST', '/api/books/parties', { name: 'رضا محمدی' }, M);
  mehran = await ok('POST', '/api/books/parties', { name: 'مهران رضایی' }, M);
  const bank = (await ok('GET', '/api/books/accounts', null, M)).items.find((a) => a.kind === 'bank');
  const pay = (party, amount, date, method = 'c2c') => ok('POST', '/api/books/docs', { type: 'trade', date, partyId: party.id, payments: [{ method, dir: 'out', amount, account: bank.id }] }, M);
  d1 = await pay(ahmad, 6000000000, addDays(today, -130));
  d2 = await pay(reza, 5985000000, addDays(today, -88), 'satna');
  d3 = await ok('POST', '/api/books/docs', { type: 'trade', date: addDays(today, -60), partyId: mehran.id, lines: [{ kind: 'melt', dir: 'in', weight: 120, fineness: 750, priced: false }] }, M);
  d4 = await pay(reza, 6000000000, addDays(today, -40));
  a4 = await ok('PUT', `/api/books/docs/${d4.id}`, { ...d4, payments: [{ method: 'c2c', dir: 'out', amount: 5400000000, account: bank.id }], reason: 'مبلغ اشتباه بود' }, M);
  for (let i = 0; i < 20; i++) await pay(i % 2 ? reza : mehran, 1000000 * (i + 7), addDays(today, -i));
});
after(() => server.close());

test('an exact figure finds its payment on its own day, months back', async () => {
  const r = await find('۶۰۰ میلیون تومان');
  assert.equal(r.tol, 0);
  assert.deepEqual(r.bands.map((b) => [b.u, b.target, b.money]), [['IRR', 6e9, 'toman']]);
  const hits = flat(r);
  const one = hits.find((h) => h.id === d1.id);
  assert.equal(one.day, d1.date);
  assert.equal(one.match.pct, 0);
  assert.match(one.match.label, /پرداخت کارت به کارت/);
  assert.equal(one.party.label.includes('احمد سلطانی'), true);
  assert.ok(!hits.some((h) => h.id === d2.id), 'دقیق does not take 598.5');
  // the original of a corrected document is found, marked as replaced
  const orig = hits.find((h) => h.id === d4.id);
  assert.equal(orig.status, 'void');
  assert.equal(orig.superseded, a4.id);
  assert.ok(!hits.some((h) => h.id === a4.id), 'the 540 million amendment is not 600');
});

test('«حدود» takes ±۵٪: the nearest comes first, then the newest', async () => {
  const hits = flat(await find('حدود ۶۰۰ میلیون تومان'));
  const order = hits.map((h) => h.id);
  assert.ok(order.includes(d2.id));
  // exact matches first (newest first among them), then 598.5 (0.25 ٪ less)
  assert.deepEqual(order.slice(0, 3), [d4.id, d1.id, d2.id]);
  assert.equal(hits[2].match.pct, 0.25);
  assert.ok(hits[2].match.diff < 0);
  assert.ok(!order.includes(a4.id), 'ten per cent off is outside ±۵٪');
  const wide = flat(await find('حدود ۶۰۰ میلیون تومان', M, '&tol=10')).map((h) => h.id);
  assert.ok(wide.includes(a4.id));
});

test('598.5 million is exact; 120 g finds the deposit; words narrow to one customer', async () => {
  assert.deepEqual(flat(await find('۵۹۸/۵ میلیون تومان')).map((h) => h.id), [d2.id]);
  const g = flat(await find('۱۲۰ گرم'));
  assert.deepEqual(g.map((h) => h.id), [d3.id]);
  assert.match(g[0].match.label, /وزن/);
  const named = flat(await find('۶۰۰ میلیون تومان سلطانی')).map((h) => h.id);
  assert.deepEqual(named, [d1.id]);
});

test('the same query twice gives the same list in the same order', async () => {
  const a = await find('حدود ۶۰۰ میلیون تومان');
  const b = await find('حدود ۶۰۰ میلیون تومان');
  assert.deepEqual({ ...a, ms: 0 }, { ...b, ms: 0 });
});

test('a money figure without a unit follows the shop unit, and the switch on the page', async () => {
  assert.ok(!flat(await find('۶۰۰ میلیون')).some((h) => h.id === d1.id), 'a rial shop reads 600 million rial');
  assert.ok(flat(await find('۶۰۰ میلیون', M, '&unit=toman')).some((h) => h.id === d1.id));
  await ok('PUT', '/api/books/settings', { money: 'toman' }, M);
  assert.ok(flat(await find('۶۰۰ میلیون')).some((h) => h.id === d1.id), 'a toman shop reads 600 million toman');
  await ok('PUT', '/api/books/settings', { money: 'rial' }, M);
});

test('a seller without back-dating sees only today, as in روزنگار', async () => {
  const r = await find('۷ میلیون ریال', E);
  assert.equal(r.limited, true);
  assert.ok(flat(r).every((h) => h.day === today));
  assert.equal(flat(await find('۶۰۰ میلیون تومان', E)).length, 0);
  assert.equal((await find('۶۰۰ میلیون تومان', M)).limited, false);
  assert.equal((await call('GET', '/api/books/daybook/find?q=رضایی', null, M)).status, 400, 'no number, no all-days search');
});

test('speed: 3,000 documents, a search after the first in well under 150 ms', async () => {
  const ins = db.raw.prepare('INSERT INTO bk_docs(id,type,fy,no,status,version,date,party_id,data_json,calc_json,tax_json,hash,created_by,created_at,updated_at,issued_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
  for (let i = 0; i < 3000; i++) {
    const doc = { type: 'trade', lines: [{ kind: 'melt', dir: i % 2 ? 'in' : 'out', weight: 1 + (i % 50) / 10, fineness: 740, mazaneh: 400000000 + i * 1000 }], payments: [{ method: 'cash', dir: i % 2 ? 'out' : 'in', amount: 10000000 + i * 3700, account: 'main' }] };
    const calc = B.calcDoc(doc);
    const at = new Date(Date.now() - i * 3600e3).toISOString();
    ins.run(randomUUID(), 'trade', 1405, 10000 + i, 'final', 1, addDays(today, -(i % 300)), reza.id, JSON.stringify({ ...doc, partyId: reza.id }), JSON.stringify(calc), '{}', 'x', null, at, at, at);
  }
  await ok('POST', '/api/books/parties', { name: 'برای تازه کردن دفتر' }, M); // a write moves the ledger revision
  await find('حدود ۱۲ میلیون ریال'); // the first search builds the index
  const times = [];
  for (const q of ['حدود ۱۲ میلیون ریال', '۶۰۰ میلیون تومان', '۲ گرم', 'حدود ۴۰۰ میلیون ریال مظنه']) {
    const t0 = performance.now();
    const r = await find(q);
    times.push(performance.now() - t0);
    assert.ok(r.searched.docs >= 3000);
  }
  assert.ok(Math.max(...times) < 150, `searches took ${times.map((t) => t.toFixed(0)).join(', ')} ms`);
});
