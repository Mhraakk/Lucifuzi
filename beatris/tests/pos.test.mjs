// spec 0005: card-reader charges. Protocol core against a real captured Saman frame, the PowerShell bridge against a
// simulated SSP1126 terminal (needs pwsh: PWSH=/path or on PATH — present on GitHub's ubuntu runners), and the
// reconciliation log on the server.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { desCbc, mac, pack, unpack, fakeTerminal } from './helpers/ssp1126.mjs';
import { openDb } from '../server/db.mjs';
import { createServer } from '../server/index.mjs';
import { seedUsers } from '../server/api.mjs';

// first POS response of a real purchase, header stripped (SSP1126 log 2110104747): DE39=15, MAC D59FF4AB7C17E07F
const REAL = '030020380000028002E1000000000002104831102331353431363734313237001131302E3035342E3031504F000856312E342E302E34001030383030303030313735001032313130323331303438D59FF4AB7C17E07F';

test('DES known answer and the SSP1126 MAC of a captured terminal frame', () => {
  assert.equal(desCbc(Buffer.from('0123456789ABCDEF', 'hex'), Buffer.from('133457799BBCDFF1', 'hex')).toString('hex').toUpperCase(), '85E813540F0AB405');
  const raw = Buffer.from(REAL, 'hex');
  assert.equal(mac(raw.subarray(0, raw.length - 8)).toString('hex').toUpperCase(), 'D59FF4AB7C17E07F');
  const m = unpack(raw);
  assert.equal(m.macOk, true);
  assert.equal(m[3], '000000');
  assert.equal(m[39], '15');
  assert.equal(m[41], '41674127');
  const back = unpack(pack({ 3: '000000', 4: '1250000', 12: '104831', 13: '1023', 25: '14', 46: '300', 49: '364' }));
  assert.equal(back.macOk, true);
  assert.equal(back[4], '000001250000');
  assert.equal(back[46], '300');
});

/* ---------------- the bridge ---------------- */
const PWSH = [process.env.PWSH, 'pwsh'].find((p) => p && spawnSync(p, ['-NoProfile', '-c', 'exit 0']).status === 0);
const ORIGIN = 'https://shop.example';
let bridge, B, dataDir, term;
const get = (p, headers = {}) => fetch(B + p, { headers }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null), headers: r.headers }));
const post = (p, b, headers = {}) => fetch(B + p, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(b) }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
async function settle(id) {
  for (let i = 0; i < 100; i++) {
    const j = (await get(`/charge/${id}`)).body;
    if (!['connecting', 'waiting'].includes(j.state)) return j;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('charge did not settle');
}
const plans = new Map(); // amount → terminal behaviour
before(async () => {
  if (!PWSH) return;
  term = await fakeTerminal((m) => plans.get(Number(m[4])) ?? { rc: '00' });
  dataDir = mkdtempSync(path.join(tmpdir(), 'pos-'));
  const port = 20000 + Math.floor(Math.random() * 20000);
  B = `http://127.0.0.1:${port}`;
  bridge = spawn(PWSH, ['-NoProfile', '-File', path.resolve('desktop/windows/pos-bridge.ps1'), '-Listen', String(port), '-Origin', ORIGIN, '-DataDir', dataDir], { stdio: 'ignore' });
  for (let i = 0; i < 100; i++) {
    try {
      if ((await get('/status')).body?.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('bridge did not start');
});
after(async () => {
  bridge?.kill();
  await term?.close();
  if (dataDir) rmSync(dataDir, { recursive: true, force: true });
});
const skip = !PWSH && 'pwsh not available';
const sep = (id, amount) => post('/charge', { id, amount, driver: 'sep', host: '127.0.0.1', port: term.port });

test('bridge: approved SEP purchase returns RRN, card and terminal; the messages carry valid MACs', { skip }, async () => {
  const r = await sep('t-approve-0001', 12500000);
  assert.equal(r.status, 202);
  const j = await settle('t-approve-0001');
  assert.equal(j.state, 'approved');
  assert.equal(j.rrn, '863583063456');
  assert.equal(j.card, '1234');
  assert.equal(j.terminal, '12345678');
  // the result is final as soon as the approval arrives; the closing 17 and Dispose follow
  for (let i = 0; i < 100 && term.received.at(-1)?.[3] !== '000001'; i++) await new Promise((r) => setTimeout(r, 50));
  const sent = term.received.slice(-3);
  assert.deepEqual(sent.map((m) => m[3]), ['000000', '000004', '000001']); // purchase, ACK, dispose
  assert.ok(sent.every((m) => m.macOk));
  assert.equal(sent[0][4], '000012500000');
  assert.equal(sent[0][46], '300');
  assert.equal(sent[0][49], '364');
  assert.equal(sent[0][63], undefined, 'no DE63: an identified purchase needs separate provisioning');
  // the same id never charges twice
  const again = await sep('t-approve-0001', 12500000);
  assert.equal(again.status, 200);
  assert.equal(again.body.state, 'approved');
  assert.equal(term.received.filter((m) => m[3] === '000000' && m[4] === '000012500000').length, 1);
});

test('bridge: decline, customer cancel and a bad MAC are never approvals', { skip }, async () => {
  plans.set(510000, { rc: '51' });
  plans.set(980000, { rc: '98' });
  plans.set(770000, { rc: '00', badMac: true });
  await sep('t-decline-01', 510000);
  const d = await settle('t-decline-01');
  assert.equal(d.state, 'declined');
  assert.equal(d.code, '51');
  assert.match(d.message, /موجودی/);
  await sep('t-cancel-001', 980000);
  assert.equal((await settle('t-cancel-001')).state, 'cancelled');
  await sep('t-badmac-001', 770000);
  const b = await settle('t-badmac-001');
  assert.equal(b.state, 'unknown');
  assert.match(b.message, /MAC/);
});

test('bridge: waiting can be cancelled from the app; only one charge at a time', { skip }, async () => {
  plans.set(330000, { rc: '00', delay: 4000 });
  await sep('t-wait-0001', 330000);
  await new Promise((r) => setTimeout(r, 400));
  const busy = await sep('t-wait-0002', 440000);
  assert.equal(busy.status, 409);
  assert.equal(busy.body.id, 't-wait-0001');
  await post('/charge/t-wait-0001/cancel', {});
  const j = await settle('t-wait-0001');
  assert.equal(j.state, 'unknown'); // the terminal may still finish: the cashier checks its receipt
  await new Promise((r) => setTimeout(r, 4000)); // let the slow terminal finish its script before the next test
});

test('bridge: origin, host and input guards; Private Network preflight; connection test', { skip }, async () => {
  assert.equal((await get('/status', { origin: 'https://evil.example' })).status, 403);
  const ok = await get('/status', { origin: ORIGIN });
  assert.equal(ok.headers.get('access-control-allow-origin'), ORIGIN);
  const pre = await fetch(`${B}/charge`, { method: 'OPTIONS', headers: { origin: ORIGIN, 'access-control-request-private-network': 'true', 'access-control-request-method': 'POST' } });
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get('access-control-allow-private-network'), 'true');
  assert.equal((await post('/charge', { id: 'x', amount: 5000, driver: 'sim' })).status, 400);
  assert.equal((await post('/charge', { id: 't-amount-01', amount: 10, driver: 'sim' })).status, 400);
  assert.equal((await post('/charge', { id: 't-driver-01', amount: 5000, driver: 'shell' })).status, 400);
  assert.equal((await post('/charge', { id: 't-host-0001', amount: 5000, driver: 'sep', host: 'a b;c', port: 1197 })).status, 400);
  // DNS rebinding: a foreign Host header is refused
  const raw = await new Promise((resolve) => {
    import('node:http').then(({ request }) => {
      const rq = request(`${B}/status`, { headers: { host: 'attacker.example' } }, (res) => resolve(res.statusCode));
      rq.end();
    });
  });
  assert.equal(raw, 403);
  const t = await post('/test', { driver: 'sep', host: '127.0.0.1', port: term.port });
  assert.equal(t.body.ok, true);
  assert.equal(t.body.terminal, '12345678');
  const sim = await post('/charge', { id: 't-sim-00001', amount: 5000, driver: 'sim' });
  assert.equal(sim.status, 202);
  const s = await settle('t-sim-00001');
  assert.equal(s.state, 'approved');
  assert.match(s.rrn, /^SIM\d{9}$/);
});

/* ---------------- server: reconciliation log ---------------- */
let server, base, db, M;
const api = async (method, p, body) => {
  const r = await fetch(base + p, { method, headers: { 'content-type': 'application/json', authorization: `Bearer ${M}` }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) };
};
before(async () => {
  db = openDb(':memory:');
  seedUsers(db, {}, true);
  server = createServer({ db, secret: 'test-secret-0123456789', demo: true, quiet: true, tenantsDir: ':memory:', marketOpts: { fetchImpl: async () => new Response('{}', { status: 404 }), defaultMode: 'off' } });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  M = (await (await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ phone: '09120000002', pin: '1234' }) })).json()).token;
});
after(() => {
  server?.close();
  server?.bus?.stop();
});

test('server: charges are logged, an approval stays an approval, the document links, orphans are listed', async () => {
  const id = 'srv-pos-00001';
  assert.equal((await api('POST', '/api/books/pos', { id, state: 'approved', amount: 12500000, driver: 'sep', rrn: '863583063456', card: '603799******1234', terminal: '12345678' })).status, 200);
  let list = (await api('GET', '/api/books/pos')).body;
  assert.equal(list.orphans.length, 1);
  assert.equal(list.items[0].card, '1234');
  assert.equal(list.approved, 12500000);
  // a late "unknown" from a retry cannot downgrade it
  assert.equal((await api('POST', '/api/books/pos', { id, state: 'unknown', amount: 12500000 })).body.state, 'approved');
  const party = (await api('POST', '/api/books/parties', { name: 'مشتری کارتخوان' })).body;
  const doc = (await api('POST', '/api/books/docs', { type: 'receipt', partyId: party.id ?? party.party?.id, payments: [{ method: 'pos', dir: 'in', amount: 1250000, ref: '863583063456', card: '1234', terminal: '12345678' }] })).body;
  assert.ok(doc.id, JSON.stringify(doc));
  assert.equal(doc.payments[0].ref, '863583063456');
  const linked = (await api('POST', '/api/books/pos', { id, docId: doc.id })).body;
  assert.equal(linked.docId, doc.id);
  assert.equal(linked.orphan, false);
  list = (await api('GET', '/api/books/pos')).body;
  assert.equal(list.orphans.length, 0);
  assert.equal((await api('POST', '/api/books/pos', { id: 'srv-pos-00002', docId: 'nope' })).status, 404);
  assert.equal((await api('POST', '/api/books/pos', { id: 'bad', state: 'approved', amount: 5000 })).status, 400);
  assert.equal((await api('POST', '/api/books/pos', { id: 'srv-pos-00003', state: 'paid', amount: 5000 })).status, 400);
  assert.equal((await api('POST', '/api/books/pos', { id: 'srv-pos-00004', state: 'declined', amount: 1.5 })).status, 400);
  const chain = (await api('GET', '/api/books/log?limit=5')).body;
  assert.ok(JSON.stringify(chain).includes('pos.approved'));
});
