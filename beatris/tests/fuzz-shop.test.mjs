// spec 0044, API level: the shop's own invoices against an independent model. Random sales, buy-backs, returns,
// receipts and payments, with every line kind of the gold pattern (jewel, coin, molten, used, service, goods) and
// payments in money, gold and coins, go through the real HTTP API with voids and invalid input between them. After
// every step the stored lines equal the model line by line; at intervals the customers' balances, the vault (gold,
// coins, till, bank) and the VAT report equal the model too, and the ledger replays clean.
// The model writes the formulas again (spec 0045: exact decimal fractions, rounded once, half away from zero).
// FUZZ_N=3000 node --test tests/fuzz-shop.test.mjs for a longer run; FUZZ_SEED picks the sequence.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.mjs';
import { createServer } from '../server/index.mjs';
import { seedUsers } from '../server/api.mjs';
import { smsLogin } from './helpers/login.mjs';

const N = Number(process.env.FUZZ_N ?? 300);
let seed = Number(process.env.FUZZ_SEED ?? 20261024);
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
const dp = (x, k) => Math.round(x * 10 ** k) / 10 ** k;

/* ---------------- the oracle ---------------- */
const D = (x) => {
  const [i, f = ''] = String(x).split('.');
  return [BigInt(i + f), f.length];
};
/** Π nums ÷ Π dens, exactly, rounded half away from zero to a multiple of step. */
function X(nums, dens = [], step = 1) {
  let n = 1n, d = 1n;
  for (const x of nums) {
    const [m, s] = D(x);
    (n *= m), (d *= 10n ** BigInt(s));
  }
  for (const x of dens) {
    const [m, s] = D(x);
    (d *= m), (n *= 10n ** BigInt(s));
  }
  const [sm, ss] = D(step);
  (n *= 10n ** BigInt(ss)), (d *= sm);
  const neg = n < 0n !== d < 0n;
  if (n < 0n) n = -n;
  if (d < 0n) d = -d;
  let q = n / d;
  if ((n % d) * 2n >= d) q += 1n;
  return (Number(neg ? -q : q) * Number(sm)) / 10 ** ss;
}
const g3 = (x) => Math.round(x * 1000) / 1000; // sums of figures already on the milligram grid
const VAT = 10;
/** One line, as the gold pattern computes it. side 'out' = the shop hands it over. */
function lineOf(l) {
  const o = { principal: 0, consfee: 0, spro: 0, bros: 0, stones: 0, discount: 0, tcpbs: 0, vat: 0, total: 0, g750: 0, count: 0 };
  if (l.kind === 'jewel') {
    const w = X([l.weight], [], 0.001), fee = X([l.p750, 10, l.fineness], [750]);
    o.principal = X([w, fee]);
    o.consfee = l.ojratMode === 'pct' ? X([o.principal, l.ojrat], [100]) : l.ojratMode === 'gram' ? X([w, l.ojrat, 10]) : X([l.ojrat, 10]);
    o.spro = X([o.principal + o.consfee, l.profitPct], [100]);
    o.bros = X([l.bros ?? 0, 10]);
    o.stones = X([l.stones ?? 0, 10]);
    o.discount = X([l.discount ?? 0, 10]);
    const fromProfit = Math.min(o.discount, o.spro);
    o.spro -= fromProfit;
    o.consfee -= o.discount - fromProfit;
    o.tcpbs = o.consfee + o.spro + o.bros;
    o.vat = X([o.tcpbs, VAT], [100]);
    o.total = o.principal + o.stones + o.tcpbs + o.vat;
  } else if (l.kind === 'coin') {
    o.count = l.count;
    o.principal = o.total = l.count * X([l.price, 10]);
  } else if (l.kind === 'melt') {
    const w = X([l.weight], [], 0.001);
    o.g750 = X([w, l.fineness], [750], 0.001);
    o.principal = o.total = X([o.g750, l.mazaneh, 750, 10], [4.6083, 705], 10000);
  } else if (l.kind === 'used') {
    const w = (Math.round(l.weight * 1000) - Math.round((l.stoneWeight ?? 0) * 1000)) / 1000;
    const gross = X([w, X([l.p750, 10, l.fineness], [750])]);
    o.discount = X([gross, l.deductPct ?? 0], [100]);
    o.principal = o.total = gross - o.discount;
    o.g750 = X([w, l.fineness], [750], 0.001);
  } else if (l.kind === 'service') {
    o.consfee = o.tcpbs = X([l.amount, 10]);
    o.vat = X([o.tcpbs, VAT], [100]);
    o.total = o.tcpbs + o.vat;
  } else if (l.kind === 'goods') {
    o.principal = X([l.qty, X([l.price, 10])]);
    o.discount = X([l.discount ?? 0, 10]);
    o.vat = X([o.principal - o.discount, VAT], [100]);
    o.total = o.principal - o.discount + o.vat;
  }
  return o;
}
function payOf(p) {
  if (p.method === 'gold') {
    const g = X([p.weight, p.fineness], [750], 0.001);
    return { g750: g, value: X([g, p.p750, 10]) };
  }
  if (p.method === 'coin') return { count: p.count, value: p.count * X([p.price, 10]) };
  return { value: X([p.amount, 10]) };
}
/** What a document moves: the party's rial, the gold box, coins, till and bank, and VAT. */
function effectOf(doc) {
  const e = { party: 0, gold: 0, coins: {}, cash: 0, bank: 0, vat: 0, lines: [], net: 0, paidIn: 0, paidOut: 0 };
  const sgn = doc.type === 'return' ? -1 : 1;
  let sales = 0, tradeIn = 0;
  for (const l of doc.lines ?? []) {
    const side = doc.type === 'buy' ? 'in' : doc.type === 'return' ? 'out' : l.side === 'in' ? 'in' : 'out';
    const o = lineOf(l);
    e.lines.push(o);
    const k = side === 'in' ? 1 : -1;
    if (l.kind === 'melt' || l.kind === 'used') e.gold = g3(e.gold + k * sgn * o.g750);
    if (l.kind === 'coin') e.coins[l.coin] = (e.coins[l.coin] ?? 0) + k * sgn * o.count;
    if (side === 'out') (e.vat += sgn * o.vat), (sales += o.total);
    else tradeIn += o.total;
  }
  e.net = doc.type === 'return' ? -sales : doc.type === 'buy' ? -tradeIn : ['sale'].includes(doc.type) ? sales - tradeIn : 0;
  e.party = e.net;
  for (const p of doc.payments ?? []) {
    const v = payOf(p), k = p.dir === 'in' ? 1 : -1;
    if (k > 0) e.paidIn += v.value;
    else e.paidOut += v.value;
    e.party -= k * v.value;
    if (p.method === 'cash') e.cash += k * v.value;
    else if (p.method === 'gold') e.gold = g3(e.gold + k * v.g750);
    else if (p.method === 'coin') e.coins[p.coin] = (e.coins[p.coin] ?? 0) + k * v.count;
    else e.bank += k * v.value;
  }
  return e;
}

/* ---------------- random documents ---------------- */
const COINS = ['emami', 'bahar', 'half', 'quarter', 'gerami'];
const price750 = () => int(70, 120) * 100000 + int(0, 99999) * pick([0, 1]);
const outLine = () => {
  const kind = pick(['jewel', 'jewel', 'jewel', 'coin', 'melt', 'service', 'goods']);
  if (kind === 'jewel') {
    const mode = pick(['pct', 'pct', 'gram', 'fixed']);
    const l = { kind, weight: dp(0.3 + rnd() * 60, pick([2, 3, 3])), fineness: pick([750, 750, 740, 585, 916]), p750: price750(), ojratMode: mode, ojrat: mode === 'pct' ? dp(rnd() * 30, pick([0, 0, 1, 2])) : int(0, 1500000), profitPct: dp(rnd() * 10, pick([0, 0, 1])) };
    if (rnd() < 0.2) l.stones = int(1, 50000000);
    if (rnd() < 0.15) l.bros = int(1, 2000000);
    if (rnd() < 0.2) {
      const room = lineOf(l).consfee + lineOf(l).spro;
      if (room > 10) l.discount = int(0, Math.floor(room / 10));
    }
    return l;
  }
  if (kind === 'coin') return { kind, coin: pick(COINS), count: int(1, 4), price: int(300, 1300) * 100000 };
  if (kind === 'melt') return { kind, weight: dp(0.5 + rnd() * 80, 3), fineness: pick([750, 740, 705, 900]), mazaneh: int(35, 55) * 1000000 + int(0, 99) * 10000 };
  if (kind === 'service') return { kind, amount: int(1, 300) * 10000 + pick([0, 5, 1250]) };
  return { kind, qty: dp(0.5 + rnd() * 20, pick([0, 1, 2])), price: int(1, 200) * 10000 + pick([0, 5, 35]), ...(rnd() < 0.3 ? { discount: int(0, 10000) } : {}) };
};
const inLine = () => {
  const kind = pick(['used', 'used', 'melt', 'coin']);
  if (kind === 'used') {
    const weight = dp(1 + rnd() * 40, pick([2, 3]));
    return { kind, side: 'in', weight, ...(rnd() < 0.3 ? { stoneWeight: dp(rnd() * weight * 0.3, 3) } : {}), fineness: pick([740, 750, 730, 585]), p750: price750(), deductPct: dp(rnd() * 5, pick([0, 1, 2])) };
  }
  if (kind === 'melt') return { kind, side: 'in', weight: dp(0.5 + rnd() * 80, 3), fineness: pick([750, 740, 705]), mazaneh: int(35, 55) * 1000000 };
  return { kind, side: 'in', coin: pick(COINS), count: int(1, 3), price: int(300, 1300) * 100000 };
};
const payment = (dir) => {
  const m = pick(['cash', 'cash', 'pos', 'c2c', 'gold', 'coin']);
  if (m === 'gold') return { method: 'gold', dir, weight: dp(0.2 + rnd() * 10, 3), fineness: pick([750, 740]), p750: price750() };
  if (m === 'coin') return { method: 'coin', dir, coin: pick(COINS), count: int(1, 2), price: int(300, 1300) * 100000 };
  return { method: m, dir, amount: int(1, 5000) * 10000 + pick([0, 0, 5, 3.5]), ...(m === 'pos' ? { account: 'bank-main', ref: String(int(1000, 9999)) } : m === 'c2c' ? { account: 'bank-main', card: '5892', ref: String(int(10, 99)) } : {}) };
};
function randomDoc(parties) {
  const type = pick(['sale', 'sale', 'sale', 'buy', 'receipt', 'payment']);
  const partyId = pick(parties);
  const money = (method, dir, amount) => ({ method, dir, amount, ...(method === 'cash' ? {} : { account: 'bank-main', ref: String(int(1000, 9999)), ...(method === 'c2c' ? { card: '5892' } : {}) }) });
  if (type === 'receipt') return { type, partyId, payments: [money(pick(['cash', 'pos']), 'in', int(1, 3000) * 10000 + pick([0, 5]))] };
  if (type === 'payment') return { type, partyId, payments: [{ method: 'cash', dir: 'out', amount: int(1, 3000) * 10000 }] };
  if (type === 'buy') return { type, partyId, lines: Array.from({ length: int(1, 2) }, inLine), payments: rnd() < 0.7 ? [money(pick(['cash', 'c2c']), 'out', int(1, 3000) * 10000)] : [] };
  const lines = Array.from({ length: int(1, 3) }, outLine);
  if (rnd() < 0.3) lines.push(inLine());
  const payments = Array.from({ length: int(0, 2) }, () => payment('in'));
  return { type, partyId, lines, payments };
}
const INVALID = [
  (d) => ({ ...d, type: 'sale', lines: [{ kind: 'jewel', weight: -1, fineness: 750, p750: 9e6 }] }),
  (d) => ({ ...d, type: 'sale', lines: [{ kind: 'jewel', weight: 2, fineness: 1200, p750: 9e6 }] }),
  (d) => ({ ...d, type: 'sale', lines: [{ kind: 'jewel', weight: 2, fineness: 750, p750: 9e6, ojrat: 400 }] }),
  (d) => ({ ...d, type: 'sale', lines: [{ kind: 'jewel', weight: 2, fineness: 750, p750: 9e6, ojrat: 10, discount: 1e12 }] }),
  (d) => ({ ...d, type: 'sale', lines: [{ kind: 'coin', coin: 'emami', count: 1.5, price: 1e8 }] }),
  (d) => ({ ...d, type: 'sale', lines: [{ kind: 'used', side: 'in', weight: 2, stoneWeight: 3, fineness: 740, p750: 9e6 }] }),
  (d) => ({ ...d, type: 'sale', lines: [{ kind: 'goods', qty: 1, price: 'abc' }] }),
  (d) => ({ ...d, type: 'buy', lines: [{ kind: 'jewel', weight: 2, fineness: 750, p750: 9e6 }] }),
  (d) => ({ ...d, type: 'sale', lines: [], payments: [] }),
  (d) => ({ ...d, type: 'sale', lines: [{ kind: 'service', amount: 1000 }], payments: [{ method: 'nope', amount: 1 }] }),
  (d) => ({ ...d, type: 'receipt', lines: [], payments: [{ method: 'cash', dir: 'out', amount: 5 }] }),
];

/* ---------------- the run ---------------- */
let server, base, db, M;
const call = async (method, p, body) => {
  const r = await fetch(base + p, { method, headers: { 'content-type': 'application/json', authorization: `Bearer ${M}` }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran' }).format(new Date());

before(async () => {
  db = openDb(':memory:');
  seedUsers(db, {}, true);
  server = createServer({ db, secret: 'fuzz-shop-secret-0123456789', demo: true, quiet: true, rateLimit: 1e9, tenantsDir: ':memory:', marketOpts: { fetchImpl: async () => new Response('{}', { status: 404 }), defaultMode: 'off' } });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  M = await smsLogin(base, '09120000002');
});
after(() => {
  server.close();
  server.bus.stop();
});

test(`fuzz: ${N} shop invoices, buy-backs, returns and payments through the API equal an independent model`, { timeout: 900000 }, async () => {
  const parties = [];
  for (let i = 0; i < 6; i++) {
    const r = await call('POST', '/api/books/parties', { name: `مشتری فاکتور ${i + 1}`, mobile: `0912${String(4000000 + i * 7333).padStart(7, '0')}` });
    parties.push(r.body.party?.id ?? r.body.id);
  }
  const model = { party: {}, gold: 0, coins: {}, cash: 0, bank: 0, vat: 0 };
  const apply = (e, partyId, s) => {
    if (partyId) model.party[partyId] = (model.party[partyId] ?? 0) + s * e.party;
    model.gold = g3(model.gold + s * e.gold);
    for (const [c, n] of Object.entries(e.coins)) model.coins[c] = (model.coins[c] ?? 0) + s * n;
    model.cash += s * e.cash;
    model.bank += s * e.bank;
    model.vat += s * e.vat;
  };
  const docs = new Map(); // id → { body, effect }
  const sales = []; // sale ids that can still be returned
  let made = 0, voided = 0, returned = 0, rejected = 0;
  const check = async (step) => {
    const v = (await call('GET', '/api/books/vault')).body;
    assert.equal(v.gold, model.gold, `step ${step}: gold box`);
    const coins = Object.fromEntries(Object.entries(model.coins).filter(([, n]) => n));
    assert.deepEqual(v.coins, coins, `step ${step}: coins`);
    assert.equal(v.cash.main ?? 0, model.cash, `step ${step}: till`);
    assert.equal(v.bank['bank-main'] ?? 0, model.bank, `step ${step}: bank`);
    for (const P of parties) {
      const b = (await call('GET', `/api/books/parties/${P}`)).body.balance ?? {};
      assert.equal(b.IRR ?? 0, model.party[P] ?? 0, `step ${step}: party ${P}`);
    }
    const vat = (await call('GET', `/api/books/report/vat?from=0000-01-01&to=${today}`)).body.total;
    assert.equal(vat.vat ?? 0, model.vat, `step ${step}: VAT report`);
    const rep = (await call('GET', '/api/books/replay')).body;
    assert.equal(rep.ok, true, `step ${step}: replay ${JSON.stringify(rep.diffs?.slice(0, 2))}`);
  };
  for (let step = 1; step <= N; step++) {
    const roll = rnd();
    const live = [...docs.keys()];
    if (roll < 0.08 && live.length) {
      // void: everything the document did is undone
      const id = pick(live), d = docs.get(id);
      const r = await call('POST', `/api/books/docs/${id}/void`, { reason: 'ابطال در آزمون' });
      if (r.status === 409) continue; // a returned sale or a cheque in motion keeps its document
      assert.equal(r.status, 200, `void ${id}: ${JSON.stringify(r.body)}`);
      apply(d.effect, d.body.partyId, -1);
      docs.delete(id);
      voided++;
    } else if (roll < 0.14 && sales.length) {
      // a return of a whole earlier sale's outgoing lines, refunded in cash
      const id = sales.splice(Math.floor(rnd() * sales.length), 1)[0], d = docs.get(id);
      if (!d) continue;
      const lines = d.body.lines.filter((l) => l.side !== 'in').map(({ side, ...l }) => l);
      if (!lines.length) continue;
      const body = { type: 'return', partyId: d.body.partyId, ref: id, lines, payments: rnd() < 0.5 ? [{ method: 'cash', dir: 'out', amount: int(1, 1000) * 10000 }] : [] };
      const r = await call('POST', '/api/books/docs', body);
      assert.ok(r.status < 300, `return: ${r.status} ${JSON.stringify(r.body)}`);
      const effect = effectOf(body);
      apply(effect, body.partyId, 1);
      docs.set(r.body.id, { body, effect });
      returned++;
    } else if (roll < 0.24) {
      const bad = pick(INVALID)(randomDoc(parties));
      const r = await call('POST', '/api/books/docs', bad);
      assert.ok(r.status >= 400 && r.status < 500, `invalid input answered ${r.status}: ${JSON.stringify(bad).slice(0, 240)}`);
      assert.ok(r.body?.error, 'a Persian message');
      rejected++;
    } else {
      const body = randomDoc(parties);
      const r = await call('POST', '/api/books/docs', body);
      assert.ok(r.status < 300, `create: ${r.status} ${JSON.stringify(r.body)} ← ${JSON.stringify(body).slice(0, 400)}`);
      const effect = effectOf(body);
      // every stored line equals the model, field by field
      effect.lines.forEach((o, i) => {
        const got = r.body.calc.lines[i];
        for (const k of ['principal', 'consfee', 'spro', 'bros', 'stones', 'discount', 'tcpbs', 'vat', 'total', 'g750']) assert.equal(got[k] ?? 0, o[k], `line ${i + 1} ${k} of ${JSON.stringify(body.lines[i])}`);
      });
      assert.equal(r.body.calc.net, effect.net, 'net');
      assert.equal(r.body.calc.paidIn, effect.paidIn, 'paid in');
      assert.equal(r.body.calc.paidOut, effect.paidOut, 'paid out');
      apply(effect, body.partyId, 1);
      docs.set(r.body.id, { body, effect });
      if (body.type === 'sale') sales.push(r.body.id);
      made++;
    }
    if (step % 20 === 0 || step === N) await check(step);
  }
  assert.ok(made > N * 0.5 && voided > 3 && returned > 2 && rejected > 5, `mix: ${made} made, ${voided} voided, ${returned} returned, ${rejected} rejected`);
});
