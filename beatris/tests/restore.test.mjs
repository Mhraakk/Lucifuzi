// spec 0024: corrections you can read, prove and undo — the change list in the hash-chained log, a safe restore of a
// replaced or voided document with the same engine, and a simulation that names its basis and repeats exactly
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.mjs';
import { createServer } from '../server/index.mjs';
import { seedUsers } from '../server/api.mjs';
import { smsLogin } from './helpers/login.mjs';

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
const MAZ = 400000000;
const bal = async (id) => (await ok('GET', `/api/books/parties/${id}`, null, M)).balance;
const doc = (id) => ok('GET', `/api/books/docs/${id}`, null, M);

before(async () => {
  const db = openDb(':memory:');
  seedUsers(db, {}, true);
  server = createServer({ db, secret: 'test-secret-0123456789', demo: true, quiet: true, marketOpts: { fetchImpl: async () => new Response('{}', { status: 404 }), defaultMode: 'off' } });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  M = await smsLogin(base, '09120000002');
  E = await smsLogin(base, '09120000004');
  await ok('PUT', '/api/books/settings', { edition: 'base', tradeRound: 10000 }, M);
});
after(() => server.close());

let reza, bank, t1, a1;
test('an amendment writes exactly what changed into the hash-chained log, and the document page shows it', async () => {
  reza = await ok('POST', '/api/books/parties', { name: 'رضا امینی' }, M);
  bank = (await ok('GET', '/api/books/accounts', null, M)).items.find((a) => a.kind === 'bank');
  t1 = await ok('POST', '/api/books/docs', { type: 'trade', partyId: reza.id, lines: [{ kind: 'melt', dir: 'in', weight: 2, fineness: 740, mazaneh: MAZ }], payments: [{ method: 'pos', dir: 'out', amount: 100000000, account: bank.id, ref: '55' }] }, M);
  const before1 = await bal(reza.id);
  // the wrong correction: 2.5 g instead of 2 g, and the payment raised
  a1 = await ok('PUT', `/api/books/docs/${t1.id}`, { ...t1, lines: [{ kind: 'melt', dir: 'in', weight: 2.5, fineness: 740, mazaneh: MAZ }], payments: [{ method: 'pos', dir: 'out', amount: 150000000, account: bank.id, ref: '55' }], reason: 'وزن اشتباه بود' }, M);
  assert.equal(a1.amends, t1.id);
  const log = await ok('GET', `/api/books/log?ref=${t1.id}`, null, M);
  const entry = log.items.find((x) => x.action === 'doc.amend');
  const w = entry.detail.changes.find((c) => c.at === 'line' && c.field === 'weight');
  assert.deepEqual([w.from, w.to], [2, 2.5]);
  assert.deepEqual(entry.detail.changes.find((c) => c.at === 'pay' && c.field === 'amount').to, 150000000);
  assert.equal(log.chain.ok, true, 'the chain still verifies with the change list inside it');
  const page = await doc(a1.id);
  assert.equal(page.changes.from.id, t1.id);
  assert.ok(page.changes.words.some((x) => /وزن — قبل: ۲٫۰۰۰ گرم؛ بعد: ۲٫۵۰۰ گرم/.test(x)), page.changes.words.join(' | '));
  assert.ok(page.changes.words.some((x) => /مبلغ — قبل: ۱۰۰٬۰۰۰٬۰۰۰ ریال؛ بعد: ۱۵۰٬۰۰۰٬۰۰۰ ریال/.test(x)));
  // رهگیری carries the same lines on the original's timeline
  const tr = await ok('GET', `/api/books/trace?q=${t1.track}`, null, M);
  assert.ok(tr.items[0].events.find((e) => e.action === 'doc.amend').changes.some((x) => /وزن/.test(x)));
  assert.notDeepEqual(await bal(reza.id), before1);
  t1.before = before1;
});

let r1;
test('restore: the replaced original comes back as an amendment with the very same figures', async () => {
  const orig = await doc(t1.id);
  assert.equal(orig.restorable, true);
  r1 = await ok('POST', `/api/books/docs/${t1.id}/restore`, { reason: 'اصلاح قبلی اشتباه بود' }, M);
  assert.equal(r1.restores, t1.id);
  assert.equal(r1.amends, a1.id);
  assert.equal(r1.date, orig.date);
  for (const k of ['net', 'paidIn', 'paidOut', 'credit', 'buys']) assert.equal(r1.calc[k], orig.calc[k], k);
  assert.deepEqual(await bal(reza.id), t1.before, 'balances are back to what they were before the wrong amendment');
  assert.equal((await doc(t1.id)).tax.restoredBy, r1.id);
  assert.equal((await doc(a1.id)).tax.supersededBy, r1.id);
  const log = await ok('GET', `/api/books/log?ref=${t1.id}`, null, M);
  const entry = log.items.find((x) => x.action === 'doc.restore');
  assert.equal(entry.detail.to, r1.id);
  assert.deepEqual(entry.detail.changes.find((c) => c.field === 'weight') && [entry.detail.changes.find((c) => c.field === 'weight').from, entry.detail.changes.find((c) => c.field === 'weight').to], [2.5, 2]);
  assert.equal(log.chain.ok, true);
  // once is enough
  const again = await call('POST', `/api/books/docs/${t1.id}/restore`, { reason: 'دوباره' }, M);
  assert.equal(again.status, 409);
});

test('restore of a voided trade keeps its date and figures; the bar serial guard still stops an impossible one', async () => {
  const bar = { kind: 'bar', dir: 'in', serial: '7700123', weight: 10, fineness: 750, mazaneh: MAZ };
  const t2 = await ok('POST', '/api/books/docs', { type: 'trade', partyId: reza.id, lines: [bar] }, M);
  await ok('POST', `/api/books/docs/${t2.id}/void`, { reason: 'اشتباهی باطل شد' }, M);
  const back = await ok('POST', `/api/books/docs/${t2.id}/restore`, { reason: 'ابطال اشتباه بود' }, M);
  assert.equal(back.restores, t2.id);
  assert.equal(back.calc.buys, t2.calc.buys);
  assert.equal((await ok('GET', '/api/books/bars?q=7700123', null, M)).items[0].inVault, true);
  // the same bar cannot be restored into the vault twice
  await ok('POST', `/api/books/docs/${back.id}/void`, { reason: 'برای آزمون' }, M);
  await ok('POST', '/api/books/docs', { type: 'trade', partyId: reza.id, lines: [bar] }, M);
  const twice = await call('POST', `/api/books/docs/${back.id}/restore`, { reason: 'دوباره' }, M);
  assert.equal(twice.status, 409);
  assert.match(twice.body.error, /7700123/);
});

test('a restore that would not give the same figures saves nothing and names the difference', async () => {
  const t3 = await ok('POST', '/api/books/docs', { type: 'trade', partyId: reza.id, lines: [{ kind: 'melt', dir: 'in', weight: 2, fineness: 740, mazaneh: MAZ }] }, M);
  await ok('POST', `/api/books/docs/${t3.id}/void`, { reason: 'آزمون' }, M);
  await ok('PUT', '/api/books/settings', { tradeRound: 100000 }, M);
  const before3 = await bal(reza.id);
  const r = await call('POST', `/api/books/docs/${t3.id}/restore`, { reason: 'آزمون' }, M);
  assert.equal(r.status, 409);
  assert.match(r.body.error, /یکی نمی‌شود/);
  assert.deepEqual(await bal(reza.id), before3, 'nothing was booked');
  assert.equal((await doc(t3.id)).restorable, true, 'and it can still be restored later');
  await ok('PUT', '/api/books/settings', { tradeRound: 10000 }, M);
});

test('only a manager restores, and only with a reason', async () => {
  const t4 = await ok('POST', '/api/books/docs', { type: 'trade', partyId: reza.id, lines: [{ kind: 'melt', dir: 'in', weight: 1, fineness: 750, mazaneh: MAZ }] }, M);
  await ok('POST', `/api/books/docs/${t4.id}/void`, { reason: 'آزمون' }, M);
  assert.equal((await call('POST', `/api/books/docs/${t4.id}/restore`, { reason: 'فروشنده' }, E)).status, 403);
  assert.equal((await call('POST', `/api/books/docs/${t4.id}/restore`, { reason: '' }, M)).status, 400);
  assert.equal((await call('POST', `/api/books/docs/${t1.id.replace(/.$/, 'x')}/restore`, { reason: 'نیست' }, M)).status, 404);
  // a live document is not «restored»
  assert.equal((await call('POST', `/api/books/docs/${r1.id}/restore`, { reason: 'زنده' }, M)).status, 400);
});

test('a simulation names its basis; the same basis repeats it exactly; what moved since is counted', async () => {
  const req = { partyId: reza.id, lines: [{ kind: 'melt', dir: 'in', weight: 2, fineness: 750, mazaneh: MAZ }], payments: [] };
  const s1 = await ok('POST', '/api/books/control/simulate', req, M);
  assert.match(s1.fingerprint, /^[0-9A-F]{12}$/);
  assert.ok(s1.basis.seq > 0 && s1.basis.day);
  const basis = { day: s1.basis.day, seq: s1.basis.seq, prices: s1.basis.prices };
  const s2 = await ok('POST', '/api/books/control/simulate', { ...req, basis }, M);
  assert.deepEqual({ ...s2, since: null, basis: { ...s2.basis, pinned: false } }, { ...s1, since: null }, 'same input, same basis: the same answer');
  assert.deepEqual(s2.since, { events: 0, dayChanged: false });
  await ok('POST', '/api/books/docs', { type: 'trade', partyId: reza.id, lines: [{ kind: 'melt', dir: 'in', weight: 1, fineness: 750, mazaneh: MAZ }] }, M);
  const s3 = await ok('POST', '/api/books/control/simulate', { ...req, basis }, M);
  assert.equal(s3.since.events, 1);
  assert.notEqual(s3.fingerprint, s1.fingerprint);
  // prices pinned from a run are used instead of the live board (here a sample board, so its price check is not counted)
  assert.equal(s1.basis.prices.sample, true);
  assert.equal(s1.checks.find((c) => c.key === 'price')?.available ?? false, false);
  const s4 = await ok('POST', '/api/books/control/simulate', { ...req, basis: { ...basis, prices: { mazaneh: 380000000, price: {}, sample: false } } }, M);
  assert.equal(s4.basis.pinned, true);
  assert.equal(s4.basis.prices.mazaneh, 380000000);
  const price = s4.checks.find((c) => c.key === 'price');
  assert.equal(price.available, true);
  assert.equal(price.ok, false, 'buying 5٪ above the pinned مظنه is flagged');
});
