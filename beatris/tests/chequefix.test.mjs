// spec 0026 (found by the one-chain test): a cheque in a base-edition document is money in rial. It used to be stored
// ten times its amount (as if typed in toman), so a bounce or a clearing moved ten times the money. New cheques are
// stored as typed; an old one is repaired when the server starts, its postings rebuilt and the repair logged.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.mjs';
import { createServer } from '../server/index.mjs';
import { seedUsers } from '../server/api.mjs';
import { smsLogin } from './helpers/login.mjs';

const opts = (db) => ({ db, secret: 'chequefix-secret-0123456789', demo: true, quiet: true, rateLimit: 1e9, marketOpts: { fetchImpl: async () => new Response('{}', { status: 404 }), defaultMode: 'off' } });
async function start(db) {
  const server = createServer(opts(db));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const M = await smsLogin(base, '09120000002');
  const call = async (method, path, body) => {
    const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', authorization: `Bearer ${M}` }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => null);
    assert.ok(r.status < 300, `${method} ${path} → ${r.status} ${JSON.stringify(j)}`);
    return j;
  };
  return { server, call, stop: () => (server.close(), server.bus?.stop?.()) };
}
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran' }).format(new Date());
const due = new Date(Date.parse(`${today}T00:00:00Z`) + 30 * 864e5).toISOString().slice(0, 10);

test('a base-edition cheque is kept in rial, and one stored ten times by the old rule is repaired at start', async () => {
  const db = openDb(':memory:');
  seedUsers(db, {}, true);
  let s = await start(db);
  await s.call('PUT', '/api/books/settings', { edition: 'base' });
  const p = await s.call('POST', '/api/books/parties', { name: 'مشتری چک' });
  await s.call('POST', '/api/books/docs', { type: 'trade', partyId: p.id, lines: [], payments: [{ method: 'cheque', dir: 'in', amount: 200000000, chequeNo: '123', bank: 'ملی', due }] });
  const q = (await s.call('GET', '/api/books/cheques')).items[0];
  assert.equal(q.amount, 200000000, 'stored as typed, in rial');
  assert.equal((await s.call('GET', `/api/books/parties/${p.id}`)).balance.IRR, -200000000);
  // the old rule: ten times
  db.run('UPDATE bk_cheques SET amount=amount*10');
  s.stop();
  s = await start(db);
  assert.equal((await s.call('GET', '/api/books/cheques')).items[0].amount, 200000000, 'repaired at start');
  assert.ok((await s.call('GET', '/api/books/log')).items.some((x) => x.action === 'cheque.repair' && x.detail.from === 2000000000 && x.detail.to === 200000000), 'the repair is in the log');
  // and it moves exactly its amount
  await s.call('PATCH', `/api/books/cheques/${q.id}`, { status: 'deposited', accountId: (await s.call('GET', '/api/books/accounts')).items.find((a) => a.kind === 'bank').id });
  await s.call('PATCH', `/api/books/cheques/${q.id}`, { status: 'bounced' });
  assert.equal((await s.call('GET', `/api/books/parties/${p.id}`)).balance.IRR, undefined, 'a bounced cheque puts back exactly what it settled');
  // a second start changes nothing
  s.stop();
  s = await start(db);
  assert.equal((await s.call('GET', '/api/books/log')).items.filter((x) => x.action === 'cheque.repair').length, 1);
  assert.equal((await s.call('GET', '/api/books/log')).chain.ok, true);
  s.stop();
});
