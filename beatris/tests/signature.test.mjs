// spec 0040: the customer's signature beside a final document. A PNG only, at most 200 KB, on a final document only;
// anyone at the counter takes the first one, only a manager replaces it; each signing is a link in the event chain with
// the picture's hash, and the document itself (figures, version, hash) is not touched.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { openDb } from '../server/db.mjs';
import { createServer } from '../server/index.mjs';
import { seedUsers } from '../server/api.mjs';
import { smsLogin } from './helpers/login.mjs';

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const url = (b64) => `data:image/png;base64,${b64}`;
const sha = (b64) => createHash('sha256').update(Buffer.from(b64, 'base64')).digest('hex');
const sale = { type: 'sale', lines: [{ kind: 'service', amount: 500000, title: 'تعمیر' }], payments: [{ method: 'cash', amount: 550000 }] };

test('a final document takes the customer signature as a PNG; the rules hold and the document is untouched', async () => {
  const db = openDb(':memory:');
  seedUsers(db, {}, true);
  const server = createServer({ db, secret: 'signature-secret-0123456789', demo: true, quiet: true, rateLimit: 1e9, marketOpts: { fetchImpl: async () => new Response('{}', { status: 404 }), defaultMode: 'off' } });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const M = await smsLogin(base, '09120000002'); // manager
  const E = await smsLogin(base, '09120000004'); // employee
  const call = async (method, path, body, who = M) => {
    const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', authorization: `Bearer ${who}` }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  const ok = async (...a) => {
    const r = await call(...a);
    assert.ok(r.status < 300, `${a[0]} ${a[1]} → ${r.status} ${JSON.stringify(r.body)}`);
    return r.body;
  };
  try {
    const doc = await ok('POST', '/api/books/docs', sale, E);
    assert.equal(doc.status, 'final');
    const before = await ok('GET', `/api/books/docs/${doc.id}`, null, E);
    assert.equal(before.signature, null, 'no signature yet');

    // what is refused
    const sign = (id, png, who = E) => call('PUT', `/api/books/docs/${id}/signature`, { png }, who);
    assert.equal((await sign(doc.id, 'data:image/jpeg;base64,/9j/4AAQ')).status, 400, 'not a PNG data URL');
    assert.equal((await sign(doc.id, url(Buffer.from('GIF89a-not-a-png').toString('base64')))).status, 400, 'PNG label, other bytes');
    assert.equal((await sign(doc.id, '')).status, 400, 'nothing');
    const big = Buffer.concat([Buffer.from(PNG, 'base64').subarray(0, 8), Buffer.alloc(210 * 1024)]).toString('base64');
    const tooBig = await sign(doc.id, url(big));
    assert.equal(tooBig.status, 400, 'over 200 KB');
    assert.match(tooBig.body.error, /۲۰۰ کیلوبایت/);
    assert.equal((await sign('no-such-doc', url(PNG))).status, 404);
    const draft = await ok('POST', '/api/books/docs', { ...sale, status: 'draft' }, E);
    assert.equal(draft.status, 'draft');
    assert.equal((await sign(draft.id, url(PNG))).status, 400, 'a draft is not signed');
    const voided = await ok('POST', '/api/books/docs', sale, E);
    await ok('POST', `/api/books/docs/${voided.id}/void`, { reason: 'اشتباه ثبت شد' }, M);
    assert.equal((await sign(voided.id, url(PNG))).status, 400, 'a void document is not signed');

    // the first signature: anyone at the counter
    const first = await sign(doc.id, url(PNG));
    assert.equal(first.status, 200, JSON.stringify(first.body));
    assert.equal(first.body.signature.hash, sha(PNG));
    const after = await ok('GET', `/api/books/docs/${doc.id}`, null, E);
    assert.equal(after.signature.png, url(PNG), 'kept and returned with the document');
    assert.equal(after.signature.hash, sha(PNG));
    assert.ok(after.signature.byName, 'who took it');
    assert.equal(after.hash, before.hash, 'the document hash is not touched');
    assert.equal(after.version, before.version, 'nor its version');
    assert.deepEqual(after.calc, before.calc, 'nor its figures');

    // replacing: a manager only
    const other = Buffer.concat([Buffer.from(PNG, 'base64'), Buffer.from([0])]).toString('base64');
    assert.equal((await sign(doc.id, url(other))).status, 403, 'an employee does not replace a signature');
    assert.equal((await ok('GET', `/api/books/docs/${doc.id}`, null, E)).signature.hash, sha(PNG), 'the first one stays');
    assert.equal((await sign(doc.id, url(other), M)).status, 200, 'a manager does');
    assert.equal((await ok('GET', `/api/books/docs/${doc.id}`, null, M)).signature.hash, sha(other));

    // the event chain: each signing with the picture's hash, the replaced one named
    const log = await ok('GET', `/api/books/log?ref=${doc.id}`, null, M);
    const signs = log.items.filter((x) => x.action === 'doc.sign').reverse();
    assert.deepEqual(signs.map((x) => x.detail), [{ hash: sha(PNG) }, { hash: sha(other), replaced: sha(PNG) }]);
    assert.equal(log.chain.ok, true, 'the chain still verifies');
    assert.equal((await ok('GET', `/api/books/docs/${doc.id}`, null, M)).hash, before.hash, 'still the same document');
  } finally {
    server.close();
    server.bus?.stop?.();
  }
});
