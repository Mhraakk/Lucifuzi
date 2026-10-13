// spec 0032: سرنخ‌یاب — the smallest clue a person remembers finds the document, the trade or the customer, by rules
// that are shown; a memory wrong in one detail still finds its document among «نزدیک‌ترین‌ها».
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { openDb } from '../server/db.mjs';
import { createServer } from '../server/index.mjs';
import { seedUsers } from '../server/api.mjs';
import { readClues, findClues, searchableDoc, searchableParty, fold, sound } from '../public/js/clue.mjs';
import { figuresOf, sectionsOf } from '../public/js/daysearch.mjs';
import * as B from '../public/js/books.mjs';
import { smsLogin } from './helpers/login.mjs';

const TODAY = '2026-10-12'; // ۲۰ مهر ۱۴۰۵, a Monday
const read = (q, o = {}) => readClues(q, { today: TODAY, ...o }).clues;
const kinds = (q, o) => read(q, o).map((c) => c.kind);
const band = (q, o) => read(q, o)[0].bands.map((b) => [b.u, b.lo, b.hi]);

test('reading: every kind of clue, with the rule it was read by', () => {
  // amounts as روزنگار reads them, ranges, pieces of figures
  assert.deepEqual(band('۴۹ میلیون و خرده‌ای تومان'), [['IRR', 490000000, 499999999]]);
  assert.deepEqual(band('سیصد و خرده‌ای میلیون تومان'), [['IRR', 3000000000, 3999999999]]);
  assert.deepEqual(band('بیشتر از ۲ میلیارد ریال'), [['IRR', 2000000000, Infinity]]);
  assert.deepEqual(band('زیر ۵ گرم'), [['G', 0, 5]]);
  assert.deepEqual(band('بین ۱۰ و ۱۲ گرم'), [['G', 10, 12]]);
  assert.deepEqual(band('از ۱۰ تا ۱۲ گرم'), [['G', 10, 12]]);
  assert.deepEqual(band('حدود ۶۰۰ میلیون تومان'), [['IRR', 5.7e9, 6.3e9]]);
  assert.deepEqual(band('۶۰۰ میلیون', { shopMoney: 'toman' }), [['IRR', 6e9, 6e9]]);
  const tail = read('آخرش ۷۸۰ بود')[0];
  assert.deepEqual([tail.kind, tail.d, tail.at], ['digits', '780', 'end']);
  assert.deepEqual(read('اولش ۴۹').map((c) => [c.kind, c.d, c.at]), [['digits', '49', 'start']]);
  // a bare run of digits is a piece of any code, and the number itself against every figure
  const bare = read('۸۸۹۱')[0];
  assert.deepEqual([bare.kind, bare.d, bare.at, bare.figures], ['digits', '8891', 'any', true]);
  assert.ok(bare.bands.some((b) => b.u === 'IRR' && b.lo === 8891));
  // codes, serials, document and customer numbers
  assert.deepEqual(read('M1405-00012').map((c) => [c.kind, c.code]), [['code', 'M1405-00012']]);
  assert.deepEqual(read('همون شمش hr12').map((c) => c.kind), ['word', 'alnum']);
  assert.equal(read('همون شمش hr12')[1].s, 'HR12');
  assert.deepEqual(read('سند ۱۲').map((c) => [c.kind, c.no]), [['docno', 12]]);
  assert.deepEqual(read('کد مشتری ۳۴').map((c) => [c.kind, c.code]), [['pcode', 34]]);
  assert.deepEqual(kinds('رسید ۱۲ میلیون'), ['word', 'amount'], 'a document word followed by an amount is an amount');
  // days and hours
  const d = (q) => read(q).filter((c) => c.kind === 'date').map((c) => [c.from, c.to]);
  assert.deepEqual(d('دیروز'), [['2026-10-11', '2026-10-11']]);
  assert.deepEqual(d('۱۲ مهر'), [['2026-10-04', '2026-10-04']]);
  assert.deepEqual(d('۱۴۰۵/۷/۱۲'), [['2026-10-04', '2026-10-04']]);
  assert.deepEqual(d('اول مهر'), [['2026-09-23', '2026-09-23']]);
  assert.deepEqual(d('مهر ۱۴۰۴'), [['2025-09-23', '2025-10-22']]);
  assert.deepEqual(d('آبان'), [['2025-10-23', '2025-11-21']], 'a month not yet begun this year is last year’s');
  assert.deepEqual(d('هفته پیش'), [['2026-10-03', '2026-10-09']], 'Saturday to Friday');
  assert.deepEqual(d('ماه پیش'), [['2026-08-23', '2026-09-22']]);
  assert.deepEqual(read('سه‌شنبه ساعت ۵ عصر').map((c) => [c.kind, c.d ?? c.from]), [['weekday', 2], ['hour', 17]]);
  assert.deepEqual(read('صبح').map((c) => [c.from, c.to]), [[5, 11]]);
  // words: what names a thing also means the thing; words that only point at a field narrow nothing
  const w = read('دیروز عصر سکه امامی');
  assert.deepEqual(w.map((c) => c.kind), ['date', 'hour', 'word', 'word']);
  assert.deepEqual(w[3].facets.map(([k, v]) => `${k}:${v}`), ['coin:emami', 'coin:half', 'coin:quarter']);
  assert.deepEqual(read('فروش به رضا کارت به کارت').map((c) => c.said), ['فروش', 'رضا', 'کارت به کارت']);
  assert.deepEqual(read('اسمش رض… بود، موبایلش ۴۵۶۷').map((c) => c.said), ['رض', '۴۵۶۷']);
  // letters fold as روزنگار folds them, and sounds fold for «هم‌آوا»
  assert.equal(fold('علي‌آقا'), 'علی اقا');
  assert.equal(sound('طهرانی'), sound('تهرانی'));
  assert.equal(sound('صادقی'), sound('سادقی'));
  // every clue says how it was read
  for (const q of ['۴۹ میلیون و خرده‌ای تومان', 'آخرش ۷۸۰', 'hr12', 'دیروز', 'ساعت ۱۰', 'رض', 'سکه']) assert.ok(read(q)[0].label.length > 3, q);
});

// documents built with the books' own engine, seen by the finder as the server sees them
let n = 0;
const P = {
  reza: searchableParty({ id: 'p-reza', code: 11, name: 'رضا تهرانی', mobile: '09121234567', city: 'تهران' }),
  bahar: searchableParty({ id: 'p-bahar', code: 12, name: 'بهار احمدی', mobile: '09350001122' }),
  ali: searchableParty({ id: 'p-ali', code: 13, name: 'علی کریمی', alias: 'علی طلا' }),
};
function docOf(partyId, date, data, { at = `${date}T06:30:00Z`, status = 'final' } = {}) {
  const doc = { type: 'trade', ...data };
  doc.calc = B.calcDoc(doc);
  n++;
  const rec = { id: `d${n}`, track: `M1405-${String(n).padStart(5, '0')}`, type: 'trade', date, at, byId: 'u1', status, partyId, hawala: null, secs: sectionsOf({ type: 'trade', calc: doc.calc }), doc };
  return searchableDoc(rec, figuresOf(doc));
}
const D = {
  // a sale of one تمام امامی to رضا, paid card to card: 49,780,000 toman
  sale: docOf('p-reza', '2026-10-09', { lines: [{ kind: 'coin', dir: 'out', coin: 'emami', count: 1, price: 497800000 }], payments: [{ method: 'c2c', dir: 'in', amount: 497800000, card: '4321', ref: '889912' }] }),
  // 50,100,000 toman to بهار, by cheque
  cheque: docOf('p-bahar', '2026-10-11', { lines: [], payments: [{ method: 'cheque', dir: 'in', amount: 501000000, chequeNo: '7788991', bank: 'ملت', due: '2026-11-11' }] }),
  // three بهار آزادی coins bought from علی
  bahar: docOf('p-ali', '2026-10-10', { lines: [{ kind: 'coin', dir: 'in', coin: 'bahar', count: 3, price: 980000000 }], payments: [{ method: 'cash', dir: 'out', amount: 2940000000 }] }),
};
const ALL = { docs: Object.values(D), parties: Object.values(P), users: [{ id: 'u1', name: 'سارا احمدی' }] };
const find = (q, o = {}) => findClues(read(q, o), { ...ALL, ...o });
const ids = (r) => r.items.map((x) => x.id);

test('matching: ranges, pieces of figures and of codes, names and sounds, things and their names', () => {
  // «۴۹ میلیون و خرده‌ای» covers 49,780,000 toman and not 50,100,000
  let r = find('۴۹ میلیون و خرده‌ای تومان');
  assert.deepEqual(ids(r), [D.sale.id]);
  assert.match(r.items[0].why[0].how, /بازه/);
  // «آخرش ۷۸۰» reads the same in a rial shop and a toman shop
  for (const shopMoney of ['rial', 'toman']) assert.equal(find('آخرش ۷۸۰', { shopMoney }).items[0].id, D.sale.id, shopMoney);
  // part of a cheque number, part of a card, part of a payment reference
  assert.equal(find('۸۸۹۹۱').items[0].id, D.cheque.id);
  assert.equal(find('۴۳۲۱').items[0].why[0].field, 'شماره کارت');
  // a name by its start, by its sound, by its mobile's last digits; the customer is listed too
  r = find('طهرانی');
  assert.deepEqual(ids(r), [D.sale.id]);
  assert.equal(r.items[0].why[0].how, 'هم‌آوا');
  r = find('رض');
  assert.equal(r.people[0].id, 'p-reza');
  r = find('۴۵۶۷');
  assert.equal(r.people[0].id, 'p-reza');
  assert.equal(r.people[0].why[0].field, 'موبایل');
  assert.ok(ids(r).includes(D.sale.id));
  // «بهار» is a coin and a customer's name: both are found
  r = find('بهار');
  assert.ok(ids(r).includes(D.bahar.id) && ids(r).includes(D.cheque.id), ids(r).join());
  // the one who entered it
  assert.equal(find('سارا').items.length, 3);
  // things: a sale paid card to card to رضا holds every clue
  r = find('فروش به رضا کارت به کارت');
  assert.equal(r.items[0].id, D.sale.id);
  assert.equal(r.items[0].matched, 3);
  assert.equal(r.all, 1);
});

test('a memory wrong in one detail: the document is among «نزدیک‌ترین‌ها», with the clue it misses', () => {
  // the sale was three days ago, not yesterday
  const r = find('دیروز رضا ۴۹ میلیون و خرده‌ای تومان');
  assert.equal(r.all, 0);
  assert.equal(r.items[0].id, D.sale.id);
  assert.equal(r.items[0].matched, 2);
  assert.deepEqual(r.items[0].missing, ['دیروز']);
});

test('the same query gives the same list in the same order', () => {
  for (const q of ['سکه', '۴۹ میلیون و خرده‌ای تومان', 'بهار', 'رض']) assert.deepEqual(find(q), find(q), q);
});

/* ---------------- on a real shop, through the API ---------------- */
let server, base, db, M, E, today, reza, bahar, mehran, p1, p2, p3, p4, p5;
const call = async (method, path, body, token) => {
  const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json() };
};
const ok = async (method, path, body, token) => {
  const r = await call(method, path, body, token);
  assert.ok(r.status < 300, `${method} ${path} → ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
  return r.body;
};
const addDays = (iso, k) => new Date(Date.parse(`${iso}T00:00:00Z`) + k * 86400000).toISOString().slice(0, 10);
const findApi = (q, token = M) => ok('GET', `/api/books/find?q=${encodeURIComponent(q)}`, null, token);
const apiIds = (r) => r.items.map((x) => x.id);

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
  reza = await ok('POST', '/api/books/parties', { name: 'رضا تهرانی', mobile: '09121234567', city: 'تهران' }, M);
  bahar = await ok('POST', '/api/books/parties', { name: 'بهار احمدی', mobile: '09350001122' }, M);
  mehran = await ok('POST', '/api/books/parties', { name: 'مهران صادقی' }, M);
  const accts = (await ok('GET', '/api/books/accounts', null, M)).items;
  const bank = accts.find((a) => a.kind === 'bank'), cash = accts.find((a) => a.kind === 'cash');
  const doc = (body) => ok('POST', '/api/books/docs', { type: 'trade', ...body }, M);
  // money for the purchases below
  await ok('POST', '/api/books/docs', { type: 'income', date: addDays(today, -10), category: 'سایر', payments: [{ method: 'cash', amount: 1000000000, account: cash.id }] }, M);
  p1 = await doc({ date: addDays(today, -3), partyId: reza.id, lines: [{ kind: 'coin', dir: 'out', coin: 'emami', count: 1, price: 497800000 }], payments: [{ method: 'c2c', dir: 'in', amount: 497800000, account: bank.id, card: '4321', ref: '889912' }] });
  p2 = await doc({ date: addDays(today, -1), partyId: mehran.id, lines: [{ kind: 'coin', dir: 'in', coin: 'emami', count: 3, price: 980000000 }], payments: [{ method: 'cash', dir: 'out', amount: 2940000000, account: cash.id }] });
  p3 = await doc({ date: today, partyId: bahar.id, lines: [], payments: [{ method: 'cheque', dir: 'in', amount: 200000000, chequeNo: '7788991', bank: 'ملت', due: addDays(today, 30) }] });
  const bar = { kind: 'bar', serial: 'HR12345', brand: 'زربد', weight: 10, fineness: 750, mazaneh: 400000000 };
  p4 = await doc({ date: addDays(today, -2), partyId: mehran.id, lines: [{ ...bar, dir: 'in' }] });
  p5 = await doc({ date: today, partyId: reza.id, lines: [{ ...bar, dir: 'out' }] });
});
after(() => server?.close());

test('API: a name fragment, a mobile’s last digits, a cheque, a serial, a code, a tail, a day with a coin, a sentence', async () => {
  let r = await findApi('رض');
  assert.equal(r.people[0].id, reza.id);
  assert.ok(apiIds(r).includes(p1.id) && apiIds(r).includes(p5.id));
  assert.ok(r.clues[0].label.includes('رض'));
  r = await findApi('۴۵۶۷');
  assert.equal(r.people[0].id, reza.id);
  assert.ok(apiIds(r).includes(p1.id));
  r = await findApi('چک ۸۸۹۹');
  assert.equal(r.items[0].id, p3.id);
  assert.equal(r.items[0].matched, 2);
  r = await findApi('hr123');
  assert.deepEqual(new Set(apiIds(r).slice(0, 2)), new Set([p4.id, p5.id]));
  assert.match(r.items[0].why[0].field, /سریال/);
  r = await findApi(p2.track.split('-')[1]);
  assert.equal(r.items[0].id, p2.id);
  r = await findApi(p2.track);
  assert.equal(r.items[0].id, p2.id);
  assert.equal(r.items[0].why[0].how, '');
  r = await findApi('آخرش ۷۸۰');
  assert.equal(r.items[0].id, p1.id);
  r = await findApi('۴۹ میلیون و خرده‌ای تومان');
  assert.equal(r.items[0].id, p1.id);
  r = await findApi('دیروز سکه امامی');
  assert.equal(r.items[0].id, p2.id);
  assert.equal(r.items[0].matched, 3);
  r = await findApi('فروش به رضا کارت به کارت');
  assert.equal(r.items[0].id, p1.id);
  assert.equal(r.all >= 1, true);
  // each result names its document as روزنگار does
  assert.equal(r.items[0].track, p1.track);
  assert.equal(r.items[0].party.id, reza.id);
  assert.ok(r.items[0].summary.length > 3);
});

test('API: a seller without back-dating finds today only; nothing typed finds nothing', async () => {
  const r = await findApi('رض', E);
  assert.equal(r.limited, true);
  assert.deepEqual(apiIds(r), [p5.id]);
  assert.deepEqual((await findApi('')).items, []);
});

test('speed: 3,000 documents, a search after the first in well under 150 ms', async () => {
  const ins = db.raw.prepare('INSERT INTO bk_docs(id,type,fy,no,status,version,date,party_id,data_json,calc_json,tax_json,hash,created_by,created_at,updated_at,issued_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
  for (let i = 0; i < 3000; i++) {
    const doc = { type: 'trade', lines: [{ kind: 'melt', dir: i % 2 ? 'in' : 'out', weight: 1 + (i % 50) / 10, fineness: 740, mazaneh: 400000000 + i * 1000 }], payments: [{ method: 'cash', dir: i % 2 ? 'out' : 'in', amount: 10000000 + i * 3700, account: 'main', ref: String(100000 + i) }], note: i % 7 ? '' : `یادداشت ${i}` };
    const calc = B.calcDoc(doc);
    const at = new Date(Date.now() - i * 3600e3).toISOString();
    ins.run(randomUUID(), 'trade', 1405, 10000 + i, 'final', 1, addDays(today, -(i % 300)), i % 2 ? reza.id : mehran.id, JSON.stringify({ ...doc, partyId: reza.id }), JSON.stringify(calc), '{}', 'x', null, at, at, at);
  }
  await ok('POST', '/api/books/parties', { name: 'برای تازه کردن دفتر' }, M); // a write moves the ledger revision
  await findApi('رضا'); // the first search builds the index
  const times = [];
  for (const q of ['رضا ۱۲ میلیون و خرده‌ای ریال', 'آخرش ۷۰۰', '۱۰۰۲۳', 'دیروز آبشده', 'صادقی نقد']) {
    const t0 = performance.now();
    const r = await findApi(q);
    times.push(performance.now() - t0);
    assert.ok(r.searched.docs >= 3000);
  }
  assert.ok(Math.max(...times) < 150, `searches took ${times.map((t) => t.toFixed(0)).join(', ')} ms`);
});
