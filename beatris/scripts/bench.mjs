// spec 0004 #3: how fast the heavy screens answer on a busy shop. Builds a shop with BENCH_DOCS documents (default
// 20 000: a few years of a large counter) through the real API, then times every heavy endpoint several times.
//   node scripts/bench.mjs            → table of p50 / p95 / max in ms
//   BENCH_DOCS=5000 node scripts/bench.mjs
import { openDb } from '../server/db.mjs';
import { createServer } from '../server/index.mjs';
import { seedUsers } from '../server/api.mjs';

const N = Number(process.env.BENCH_DOCS ?? 20000);
const RUNS = Number(process.env.BENCH_RUNS ?? 7);
let seed = 11;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pick = (a) => a[Math.floor(rnd() * a.length)];

const db = openDb(':memory:');
seedUsers(db, {}, true);
const server = createServer({ db, secret: 'bench-secret-0123456789', demo: true, quiet: true, rateLimit: 1e9, tenantsDir: ':memory:', marketOpts: { fetchImpl: async () => new Response('{}', { status: 404 }), defaultMode: 'off' } });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const M = (await (await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ phone: '09120000002', pin: '1234' }) })).json()).token;
const call = async (method, p, body) => {
  const r = await fetch(base + p, { method, headers: { 'content-type': 'application/json', authorization: `Bearer ${M}` }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => null);
  if (r.status >= 300) throw new Error(`${method} ${p}: ${r.status} ${j?.error}`);
  return j;
};
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran' }).format(new Date());
const ago = (n) => new Date(Date.parse(`${today}T00:00:00Z`) - n * 864e5).toISOString().slice(0, 10);

const t0 = Date.now();
const parties = [];
for (let i = 0; i < 300; i++) parties.push((await call('POST', '/api/books/parties', { name: `مشتری ${i + 1}`, mobile: `0913${String(1000000 + i * 3571).padStart(7, '0')}` })).id);
await call('POST', '/api/books/docs', { type: 'trade', date: ago(1100), partyId: parties[0], lines: [{ kind: 'melt', dir: 'in', weight: 5000, fineness: 750, mazaneh: 3e8 }], payments: [] });
for (let i = 0; i < N; i++) {
  const day = Math.floor(1095 * (1 - i / N));
  const dir = rnd() < 0.5 ? 'in' : 'out';
  const k = rnd();
  const line = k < 0.6 ? { kind: 'melt', dir, weight: Math.round(rnd() * 50000) / 1000 + 0.1, fineness: pick([750, 740, 705]), mazaneh: 3e8 + Math.round(rnd() * 200) * 1e6 } : k < 0.9 ? { kind: 'coin', dir, coin: pick(['emami', 'bahar', 'half', 'quarter']), count: 1 + Math.floor(rnd() * 4), price: 5e8 + Math.round(rnd() * 500) * 1e6 } : { kind: 'fx', dir, code: pick(['USD', 'EUR']), fxAmount: 100 + Math.round(rnd() * 900), rate: 800000 };
  await call('POST', '/api/books/docs', { type: 'trade', date: ago(day), partyId: pick(parties), lines: [line], payments: rnd() < 0.8 ? [{ method: 'cash', dir: dir === 'in' ? 'out' : 'in', amount: (1 + Math.round(rnd() * 3000)) * 1e6 }] : [] });
  if ((i + 1) % 5000 === 0) console.error(`… ${i + 1} documents`);
}
console.log(`shop built: ${N} documents, 300 customers in ${Math.round((Date.now() - t0) / 1000)} s`);

const P = parties[7];
const ENDPOINTS = [
  '/api/books/dashboard', '/api/books/vault', '/api/books/summary', '/api/books/daybook', '/api/books/docs?limit=50', '/api/books/parties', `/api/books/parties/${P}`,
  '/api/books/report/pnl', '/api/books/report/balance', '/api/books/audit', '/api/books/replay',
  '/api/books/control/pulse', '/api/books/control/changes', '/api/books/control/exceptions', '/api/books/control/twin', `/api/books/control/twin?day=${ago(200)}&compare=${ago(400)}`,
  '/api/books/control/trial', '/api/books/control/lots', `/api/books/control/story?party=${P}`, '/api/books/control/forecast10', '/api/books/control/explain?metric=cash', '/api/books/control/explain?metric=net', '/api/books/control/find?q=مشتری',
];
if (process.env.BENCH_COLD) {
  // the first view after a sale: one write, then the heavy screens once each
  for (const ep of ['/api/books/control/pulse', '/api/books/dashboard', '/api/books/control/changes']) {
    await call('POST', '/api/books/docs', { type: 'trade', date: today, partyId: parties[3], lines: [{ kind: 'melt', dir: 'in', weight: 1, fineness: 750, mazaneh: 4e8 }], payments: [] });
    const s = performance.now();
    await call('GET', ep);
    console.log(`cold ${ep}: ${Math.round(performance.now() - s)} ms`);
  }
}
const rows = [];
for (const ep of ENDPOINTS) {
  const ms = [];
  for (let r = 0; r < RUNS; r++) {
    const s = performance.now();
    try {
      await call('GET', ep);
    } catch (e) {
      ms.push(NaN);
      console.error(e.message);
      break;
    }
    ms.push(performance.now() - s);
  }
  const sorted = ms.filter(Number.isFinite).sort((a, b) => a - b);
  const q = (p) => Math.round(sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? NaN);
  rows.push({ endpoint: ep.replace(/[0-9a-f-]{36}/, ':id').replace(/\d{4}-\d{2}-\d{2}/g, 'D'), p50: q(0.5), p95: q(0.95), max: Math.round(sorted.at(-1) ?? NaN) });
}
console.table(rows);
server.close();
server.bus.stop();
process.exit(0);
