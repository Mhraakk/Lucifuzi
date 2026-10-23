// spec 0044: every saved document is found by its own figures. Random trades go in through the API; then, for a random
// sample, روزنگار's number search is asked for one of the document's own figures (a line's value, a payment, a weight,
// a count; in rial or toman, Persian or Latin digits, with or without separators) and the clue finder for its code and
// for a piece of its customer's name with the tail of its amount. The document must be among the answers every time.
// FIND_N=1500 node --test tests/findall.test.mjs for a longer run; FIND_SEED picks the sequence.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.mjs';
import { createServer } from '../server/index.mjs';
import { seedUsers } from '../server/api.mjs';
import { smsLogin } from './helpers/login.mjs';

const N = Number(process.env.FIND_N ?? 160);
let seed = Number(process.env.FIND_SEED ?? 23);
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
const FA = '۰۱۲۳۴۵۶۷۸۹';
const fa = (s) => String(s).replace(/\d/g, (d) => FA[d]);
const grouped = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

let server, base, db, M;
const call = async (method, p, body) => {
  const r = await fetch(base + p, { method, headers: { 'content-type': 'application/json', authorization: `Bearer ${M}` }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran' }).format(new Date());
const ago = (n) => new Date(Date.parse(`${today}T00:00:00Z`) - n * 864e5).toISOString().slice(0, 10);

before(async () => {
  db = openDb(':memory:');
  seedUsers(db, {}, true);
  server = createServer({ db, secret: 'findall-secret-0123456789', demo: true, quiet: true, rateLimit: 1e9, tenantsDir: ':memory:', marketOpts: { fetchImpl: async () => new Response('{}', { status: 404 }), defaultMode: 'off' } });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  M = await smsLogin(base, '09120000002');
});
after(() => {
  server.close();
  server.bus.stop();
});

test(`every one of ${N} random documents is found by its own figures, its code and its customer`, { timeout: 900000 }, async () => {
  // no surname's first three letters appear in another name, and no mobile ends in a run of zeros
  const NAMES = ['امیر محمدی', 'مهران کریمی', 'سارا احمدی', 'بهرام رضایی', 'زهرا موسوی', 'کیوان حسینی', 'نرگس طاهری'];
  const parties = [];
  for (const [i, name] of NAMES.entries()) {
    const r = await call('POST', '/api/books/parties', { name, mobile: `0913${String(2318467 + i * 1543)}` });
    parties.push({ id: r.body.party?.id ?? r.body.id, name });
  }
  const docs = [];
  let barNo = 0;
  for (let i = 0; i < N; i++) {
    const p = pick(parties);
    const lines = [];
    for (let k = int(1, 2); k > 0; k--) {
      const kind = pick(['melt', 'melt', 'coin', 'fx', 'bar']);
      const dir = pick(['in', 'out']);
      if (kind === 'melt') lines.push({ kind, dir, weight: int(500, 90000) / 1000, fineness: pick([750, 740, 705, 900]), mazaneh: int(300, 520) * 1e6 + int(0, 99) * 1e4 });
      else if (kind === 'coin') lines.push({ kind, dir, coin: pick(['emami', 'bahar', 'half', 'quarter']), count: int(1, 9), price: int(100, 1200) * 1e6 + int(0, 9) * 1e5 });
      else if (kind === 'fx') lines.push({ kind, dir, code: pick(['USD', 'EUR', 'AED']), fxAmount: int(100, 500000) / 100, rate: int(400000, 900000) });
      else lines.push({ kind, dir: 'in', serial: `FA-${++barNo}`, weight: pick([50, 100, 250]), fineness: 995, mazaneh: int(300, 520) * 1e6 });
    }
    const payments = rnd() < 0.8 ? [{ method: 'cash', dir: pick(['in', 'out']), amount: int(1, 9000) * 1e5 + int(0, 9) * 1e4 }] : [];
    const r = await call('POST', '/api/books/docs', { type: 'trade', date: ago(int(0, 40)), partyId: p.id, lines, payments });
    assert.ok(r.status < 300, `create: ${r.status} ${JSON.stringify(r.body)}`);
    docs.push({ id: r.body.id, track: r.body.track, party: p, calc: r.body.calc, lines, payments });
  }
  const found = (res, id) => (res.items ?? []).some((d) => d.id === id || (d.docs ?? []).some((x) => x.id === id));
  let asked = 0, clued = 0;
  for (const d of docs) {
    // one of its own figures, said the way people say it
    const figs = [];
    for (const [k, l] of d.calc.lines.entries()) {
      if (l.value) figs.push({ q: pick([`${l.value} ریال`, `${fa(grouped(l.value))} ریال`, ...(l.value % 10 === 0 ? [`${fa(l.value / 10)} تومان`] : [])]), what: `line ${k + 1} value` });
      if (l.kind === 'melt') figs.push({ q: `${fa(String(l.weight).replace('.', '٫'))} گرم`, what: `line ${k + 1} weight` });
      if (l.kind === 'coin') figs.push({ q: `${fa(l.count)} تا سکه`, what: `line ${k + 1} count` });
    }
    for (const p of d.payments) figs.push({ q: pick([`${p.amount} ریال`, `${fa(grouped(p.amount))} ریال`]), what: 'payment' });
    const f = pick(figs);
    const r = await call('GET', `/api/books/daybook/find?q=${encodeURIComponent(f.q)}&tol=0`);
    assert.equal(r.status, 200, `${f.q}: ${JSON.stringify(r.body)}`);
    assert.ok(found(r.body, d.id), `روزنگار did not find ${d.track} by its ${f.what} «${f.q}» (${r.body.total} answers)`);
    // its tracking code opens it; a piece of the name with the tail of a figure points to it
    const byCode = await call('GET', `/api/books/find?q=${encodeURIComponent(pick([d.track, d.track.toLowerCase(), fa(d.track)]))}&limit=100`);
    assert.ok(found(byCode.body, d.id), `the clue finder did not open ${d.track} by its code`);
    // three letters of the surname and the whole figure as the tail: when no more than a page of documents holds both,
    // this one must be on it
    const amount = d.calc.lines.map((l) => l.value).find(Boolean);
    if (amount) {
      const q = `${d.party.name.split(' ').at(-1).slice(0, 3)} آخرش ${fa(amount)}`;
      const byClue = await call('GET', `/api/books/find?q=${encodeURIComponent(q)}&limit=100`);
      if (byClue.body.all <= 100) (clued++, assert.ok(found(byClue.body, d.id), `the clue finder did not find ${d.track} by «${q}» (${byClue.body.all} hold every clue)`));
    }
    asked++;
  }
  assert.equal(asked, N);
  assert.ok(clued > N * 0.6, `the clue check ran for ${clued} of ${N}`);
});
