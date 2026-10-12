// spec 0004 #1: the books against an independent model. Hundreds of random documents (melt, coin, bar, fx; priced and
// unpriced; cash and credit), random edits, voids and invalid inputs go through the real HTTP API; after every step the
// vault, the drawer and every customer's balance must equal what a separate, deliberately simple model computes from
// the inputs alone, every line value must match the market formula, and the ledger replay must be clean.
// Spec 0026 adds melting (ذوب), write-offs (سوخت), income and expenses (some paid in gold): the period's net result and
// the one position per unit (physical + what customers owe in goods) must agree with the model too.
// FUZZ_N=3000 node --test tests/fuzz.test.mjs for a longer run; FUZZ_SEED picks the sequence.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.mjs';
import { createServer } from '../server/index.mjs';
import { seedUsers } from '../server/api.mjs';
import { smsLogin } from './helpers/login.mjs';

const N = Number(process.env.FUZZ_N ?? 400);
let seed = Number(process.env.FUZZ_SEED ?? 20260929);
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));

// the oracle: the market formulas written out again, independently of public/js
const r3 = (x) => Math.round(x * 1000) / 1000;
const meltValue = (w, f, mz, step = 10000) => {
  const eq = r3((r3(w) * f) / 750);
  return Math.round((eq * ((mz * 750) / (4.6083 * 705))) / step) * step;
};

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
  server = createServer({ db, secret: 'fuzz-secret-0123456789', demo: true, quiet: true, rateLimit: 1e9, tenantsDir: ':memory:', marketOpts: { fetchImpl: async () => new Response('{}', { status: 404 }), defaultMode: 'off' } });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  M = await smsLogin(base, '09120000002');
});
after(() => {
  server.close();
  server.bus.stop();
});

/* ---------------- the model ---------------- */
const model = { gold: 0, coins: {}, fx: {}, bars: {}, barEq: {}, barW: {}, cash: 0, party: {}, income: 0, expense: 0, woIRR: 0 };
const barsIn = () => Object.keys(model.bars).filter((k) => model.bars[k] > 0);
const docs = new Map(); // id → { effect, body }
const trace = []; // bar moves, printed if the bars ever disagree
const addTo = (o, k, v, r = (x) => x) => {
  o[k] = r((o[k] ?? 0) + v);
  if (Math.abs(o[k]) < 1e-9) delete o[k];
};
function effectOf(body) {
  // what the document does, computed from its inputs only
  const e = { gold: 0, coins: {}, fx: {}, barsIn: [], barsOut: [], cash: 0, party: {}, other: {}, income: 0, expense: 0, woIRR: 0 };
  const P = body.partyId;
  const eqOf = (w, f) => r3((r3(w) * f) / 750);
  if (body.type === 'writeoff') {
    // the balance shrinks toward zero; nothing physical moves
    const w = body.writeoff;
    addTo(e.party, w.unit, -w.amount, w.unit === 'G750' ? r3 : (x) => x);
    if (w.unit === 'IRR') e.woIRR = w.amount;
    return { e, P };
  }
  if (body.type === 'transform') {
    // the vault: melted gold and bars in and out, coins out; the melter's fee from the drawer
    for (const l of body.lines) {
      const k = l.dir === 'in' ? 1 : -1;
      if (l.kind === 'melt') e.gold = r3(e.gold + k * eqOf(l.weight, l.fineness));
      else if (l.kind === 'coin') addTo(e.coins, l.coin, k * l.count);
      else if (l.kind === 'bar') (k > 0 ? e.barsIn : e.barsOut).push(l.serial);
    }
    for (const p of body.payments) (e.cash -= p.amount), (e.expense += p.amount); // the fee is an expense («ذوب و ری‌گیری»)
    return { e, P: null };
  }
  if (body.type === 'income' || body.type === 'expense') {
    // money in toman (×10), or gold at the settlement price
    for (const p of body.payments) {
      const k = p.dir === 'in' ? 1 : -1;
      if (p.method === 'gold') {
        const g = eqOf(p.weight, p.fineness);
        e.gold = r3(e.gold + k * g);
        e[body.type] += Math.round(g * p.p750 * 10);
      } else {
        e.cash += k * p.amount * 10;
        e[body.type] += p.amount * 10;
      }
    }
    return { e, P: null };
  }
  if (body.type === 'hawala') {
    // the debt moves: «from» owes it now, «to» is owed it
    const h = body.hawala, rr = h.unit === 'G750' ? r3 : (x) => x;
    addTo(e.party, h.unit, h.amount, rr);
    addTo(e.other, h.unit, -h.amount, rr);
    return { e, P: h.from, Q: h.to };
  }
  if (body.type === 'convert') {
    const c = body.convert, s = Math.sign(c.amount);
    const value = Math.round((Math.abs(c.amount) * ((c.mazaneh * 750) / (4.6083 * 705))) / 10000) * 10000;
    addTo(e.party, 'G750', -c.amount, r3);
    addTo(e.party, 'IRR', s * value);
    return { e, P };
  }
  let net = 0;
  for (const l of body.lines) {
    const k = l.dir === 'in' ? 1 : -1;
    if (l.kind === 'melt') {
      const eq = r3((r3(l.weight) * l.fineness) / 750);
      e.gold = r3(e.gold + k * eq);
      if (l.priced === false) addTo(e.party, 'G750', -k * eq, r3);
      else net += -k * meltValue(l.weight, l.fineness, l.mazaneh);
    } else if (l.kind === 'coin') {
      addTo(e.coins, l.coin, k * l.count);
      if (l.priced === false) addTo(e.party, `COIN:${l.coin}`, -k * l.count);
      else net += -k * l.count * l.price;
    } else if (l.kind === 'fx') {
      addTo(e.fx, l.code, k * l.fxAmount, (x) => Math.round(x * 100) / 100);
      net += -k * Math.round(l.fxAmount * l.rate);
    } else if (l.kind === 'bar') {
      (k > 0 ? e.barsIn : e.barsOut).push(l.serial);
      net += -k * meltValue(l.weight, l.fineness, l.mazaneh);
    }
  }
  // net > 0: the customer owes for what they took
  for (const p of body.payments) {
    const k = p.dir === 'in' ? 1 : -1;
    e.cash += k * p.amount;
    net -= k * p.amount;
  }
  if (net) addTo(e.party, 'IRR', net);
  return { e, P };
}
function apply({ e, P, Q }, sign) {
  model.gold = r3(model.gold + sign * e.gold);
  for (const [c, n] of Object.entries(e.coins)) addTo(model.coins, c, sign * n);
  for (const [c, n] of Object.entries(e.fx)) addTo(model.fx, c, sign * n, (x) => Math.round(x * 100) / 100);
  for (const s of e.barsIn) model.bars[s] = (model.bars[s] ?? 0) + sign;
  for (const s of e.barsOut) model.bars[s] = (model.bars[s] ?? 0) - sign;
  model.cash += sign * e.cash;
  model.income += sign * (e.income ?? 0);
  model.expense += sign * (e.expense ?? 0);
  model.woIRR += sign * (e.woIRR ?? 0);
  if (!P) return;
  const acct = (model.party[P] ??= {});
  for (const [u, v] of Object.entries(e.party)) addTo(acct, u, sign * v, u === 'G750' ? r3 : (x) => x);
  if (Q) {
    const q = (model.party[Q] ??= {});
    for (const [u, v] of Object.entries(e.other)) addTo(q, u, sign * v, u === 'G750' ? r3 : (x) => x);
  }
}

/* ---------------- random inputs ---------------- */
const COINS = ['emami', 'bahar', 'half', 'quarter', 'gerami'];
const FX = ['USD', 'EUR', 'AED'];
let barNo = 0;
function randomDoc(parties) {
  const lines = [];
  const n = int(1, 3);
  for (let i = 0; i < n; i++) {
    const kind = pick(['melt', 'melt', 'melt', 'coin', 'coin', 'fx', 'bar']);
    const dir = pick(['in', 'out']);
    if (kind === 'melt') lines.push({ kind, dir, weight: Math.round((0.1 + rnd() * 80) * 1000) / 1000, fineness: pick([750, 740, 705, 900, 995, 585]), mazaneh: int(300, 520) * 1e6, ...(rnd() < 0.2 ? { priced: false } : {}) });
    else if (kind === 'coin') lines.push({ kind, dir, coin: pick(COINS), count: int(1, 6), price: int(100, 1200) * 1e6, ...(rnd() < 0.15 ? { priced: false } : {}) });
    else if (kind === 'fx') lines.push({ kind, dir, code: pick(FX), fxAmount: Math.round(rnd() * 5000 * 100) / 100 + 1, rate: int(400000, 900000) });
    else if (dir === 'in' || !barsIn().length) {
      const weight = pick([100, 50, 250]);
      model.barEq[`FZ-${++barNo}`] = r3((weight * 995) / 750);
      model.barW[`FZ-${barNo}`] = weight;
      lines.push({ kind, dir: 'in', serial: `FZ-${barNo}`, weight, fineness: 995, mazaneh: int(300, 520) * 1e6 });
    }
    else {
      const s = pick(barsIn());
      if (lines.some((l) => l.serial === s)) continue;
      lines.push({ kind, dir, serial: s, weight: model.barW[s], fineness: 995, mazaneh: int(300, 520) * 1e6 }); // at its card
    }
  }
  // a bar sold must be in the vault, once
  const payments = [];
  if (rnd() < 0.8) payments.push({ method: 'cash', dir: pick(['in', 'out']), amount: int(1, 5000) * 1e5 });
  return { type: 'trade', date: ago(int(0, 30)), partyId: pick(parties), lines, payments };
}
/** A melting: gold (and maybe a bar or a coin) out of the vault, melted gold or a new bar back, 0–5 % lost. */
function randomMelt() {
  const lines = [];
  let eqIn = 0;
  if (barsIn().length && rnd() < 0.3) {
    const s = pick(barsIn());
    lines.push({ kind: 'bar', dir: 'out', serial: s, weight: model.barW[s], fineness: 995 });
    eqIn += model.barEq[s];
  }
  const w = Math.round((5 + rnd() * 120) * 1000) / 1000, f = pick([750, 740, 705, 900, 585]);
  lines.push({ kind: 'melt', dir: 'out', weight: w, fineness: f });
  eqIn += r3((r3(w) * f) / 750);
  if (eqIn >= 30 && rnd() < 0.3) lines.push({ kind: 'coin', dir: 'out', coin: pick(COINS), count: 1 });
  const back = r3(eqIn * (0.95 + rnd() * 0.05));
  if (back >= 60 && rnd() < 0.4) {
    // a new sealed bar of 995 holding what came back
    const bw = Math.round(((back * 750) / 995) * 1000) / 1000;
    model.barEq[`FZ-${++barNo}`] = r3((r3(bw) * 995) / 750);
    model.barW[`FZ-${barNo}`] = bw;
    lines.push({ kind: 'bar', dir: 'in', serial: `FZ-${barNo}`, weight: bw, fineness: 995, brand: 'آزمون' });
  } else lines.push({ kind: 'melt', dir: 'in', weight: back, fineness: 750 });
  const payments = rnd() < 0.5 ? [{ method: 'cash', dir: 'out', amount: int(1, 50) * 1e5 }] : [];
  return { type: 'transform', date: ago(int(0, 30)), lines, payments, note: 'ذوب در آزمون' };
}
/** Income or an expense: cash in toman, an expense sometimes paid with gold. */
function randomOther() {
  const type = pick(['income', 'expense', 'expense']);
  const gold = type === 'expense' && rnd() < 0.3;
  const payments = [gold ? { method: 'gold', dir: 'out', weight: Math.round((0.2 + rnd() * 5) * 1000) / 1000, fineness: pick([750, 740]), p750: int(3000, 9000) * 1000 } : { method: 'cash', dir: type === 'income' ? 'in' : 'out', amount: int(1, 300) * 1e4 }];
  return { type, date: ago(int(0, 30)), category: pick(type === 'income' ? ['کارمزد عیارسنجی و ری‌گیری', 'اجاره دریافتی', 'سایر'] : ['اجاره', 'حقوق و دستمزد', 'ذوب و ری‌گیری', 'سایر']), payments, note: 'آزمون' };
}
const INVALID = [
  (d) => ({ ...d, lines: [{ ...d.lines[0], kind: 'melt', weight: -5, fineness: 750, mazaneh: 4e8 }] }),
  (d) => ({ ...d, lines: [{ kind: 'melt', dir: 'in', weight: 10, fineness: 1200, mazaneh: 4e8 }] }),
  (d) => ({ ...d, lines: [{ kind: 'melt', dir: 'in', weight: 'abc', fineness: 750, mazaneh: 4e8 }] }),
  (d) => ({ ...d, lines: [{ kind: 'coin', dir: 'in', coin: 'emami', count: 1.5, price: 1e9 }] }),
  (d) => ({ ...d, lines: [{ kind: 'coin', dir: 'in', coin: 'nope', count: 1, price: 1e9 }] }),
  (d) => ({ ...d, lines: [{ kind: 'fx', dir: 'in', code: 'XXX', fxAmount: 10, rate: 1 }] }),
  (d) => ({ ...d, lines: [{ kind: 'melt', dir: 'in', weight: 1e9, fineness: 750, mazaneh: 4e8 }] }),
  (d) => ({ ...d, lines: [], payments: [] }),
  (d) => ({ ...d, lines: [{ kind: 'melt', dir: 'in', weight: 10, fineness: 750, mazaneh: 4e8 }], payments: [{ method: 'cash', dir: 'in', amount: -100 }] }),
  (d) => ({ ...d, date: '2026-13-45' }),
];

async function checkAll(step) {
  const v = (await call('GET', '/api/books/vault')).body;
  assert.equal(v.gold, model.gold, `step ${step}: vault gold`);
  assert.deepEqual(v.coins, model.coins, `step ${step}: coins`);
  assert.deepEqual(v.fx, model.fx, `step ${step}: fx`);
  assert.equal(v.cash.main ?? 0, model.cash, `step ${step}: drawer`);
  assert.deepEqual(v.bars.map((b) => b.serial).sort(), barsIn().sort(), `step ${step}: bars\n${trace.join('\n')}`);
}

test(`fuzz: ${N} random operations through the API equal an independent model`, { timeout: 600000 }, async () => {
  const parties = [];
  for (let i = 0; i < 8; i++) {
    const r = await call('POST', '/api/books/parties', { name: `مشتری آزمون ${i + 1}`, mobile: `0912${String(3000000 + i * 7919).padStart(7, '0')}` });
    parties.push(r.body.party?.id ?? r.body.id);
  }
  let made = 0, voided = 0, edited = 0, rejected = 0;
  for (let step = 1; step <= N; step++) {
    const roll = rnd();
    const live = [...docs.keys()];
    if (roll < 0.1 && live.length) {
      // void: everything the document did is undone
      const id = pick(live);
      const d = docs.get(id);
      if ((d.body.lines ?? []).some((l) => l.kind === 'bar' && l.dir === 'in' && !(model.bars[l.serial] > 0))) continue; // that bar was sold on
      const r = await call('POST', `/api/books/docs/${id}/void`, { reason: 'آزمون ابطال' });
      assert.equal(r.status, 200, `void ${id}: ${JSON.stringify(r.body)}`);
      apply(d.effect, -1);
      trace.push(`void ${id} ${JSON.stringify(d.effect.e.barsIn)} ${JSON.stringify(d.effect.e.barsOut)}`);
      docs.delete(id);
      voided++;
    } else if (roll < 0.2 && live.length) {
      // edit: change the first melt line's weight; the old effect goes, the new one comes
      const id = pick(live);
      const d = docs.get(id);
      const i = d.body.type === 'trade' ? (d.body.lines ?? []).findIndex((l) => l.kind === 'melt') : -1;
      if (i < 0) continue;
      const body = structuredClone(d.body);
      body.lines[i].weight = Math.round((0.1 + rnd() * 50) * 1000) / 1000;
      const r = await call('PUT', `/api/books/docs/${id}`, { ...body, reason: 'اصلاح وزن در آزمون' });
      assert.ok(r.status < 300, `edit ${id}: ${r.status} ${JSON.stringify(r.body)}`);
      // spec 0013: the correction is a new document (amendment); the original leaves the ledger
      assert.equal(r.body.amended, id, 'an edit of a final document is an amendment');
      apply(d.effect, -1);
      const effect = effectOf(body);
      apply(effect, 1);
      docs.delete(id);
      docs.set(r.body.id, { body, effect });
      trace.push(`edit ${id} ${JSON.stringify(effect.e.barsIn)} ${JSON.stringify(effect.e.barsOut)}`);
      edited++;
    } else if (roll < 0.3) {
      // invalid input: a clear 4xx, never a 5xx, and nothing changes
      const bad = pick(INVALID)(randomDoc(parties));
      const r = await call('POST', '/api/books/docs', bad);
      assert.ok(r.status >= 400 && r.status < 500, `invalid input answered ${r.status}: ${JSON.stringify(bad).slice(0, 200)}`);
      assert.ok(r.body?.error, 'an error message in Persian');
      rejected++;
    } else {
      const kind = rnd();
      let body;
      if (kind < 0.08) {
        const [a, b] = [pick(parties), pick(parties)];
        if (a === b) continue;
        const unit = pick(['IRR', 'G750']);
        body = { type: 'hawala', date: ago(int(0, 30)), hawala: { from: a, to: b, unit, amount: unit === 'IRR' ? int(1, 900) * 1e6 : Math.round(rnd() * 40 * 1000) / 1000 + 0.001 } };
      } else if (kind < 0.13) {
        body = { type: 'convert', date: ago(int(0, 30)), partyId: pick(parties), convert: { unit: 'G750', amount: (rnd() < 0.5 ? -1 : 1) * (Math.round(rnd() * 20 * 1000) / 1000 + 0.001), mazaneh: int(300, 520) * 1e6 } };
      } else if (kind < 0.17) {
        // سوخت: part or all of one customer's balance in one unit, toward zero
        const cand = parties.flatMap((p) => Object.entries(model.party[p] ?? {}).filter(([u, v]) => ['IRR', 'G750'].includes(u) || u.startsWith('COIN:') ? Math.abs(v) >= (u === 'G750' ? 0.002 : 1) : false).map(([u, v]) => [p, u, v]));
        if (!cand.length) continue;
        const [p, unit, bal] = pick(cand), frac = pick([1, 0.5, 0.25]);
        const amount = unit === 'G750' ? r3(bal * frac) || Math.sign(bal) * 0.001 : unit === 'IRR' ? Math.round(bal * frac) || Math.sign(bal) : Math.trunc(bal * frac) || Math.sign(bal);
        body = { type: 'writeoff', date: today, partyId: p, writeoff: { unit, amount }, note: 'سوخت در آزمون' };
      } else if (kind < 0.21) body = randomMelt();
      else if (kind < 0.25) body = randomOther();
      else body = randomDoc(parties);
      if (body.type === 'trade' && !body.lines.length) continue;
      const r = await call('POST', '/api/books/docs', body);
      assert.ok(r.status < 300, `create: ${r.status} ${JSON.stringify(r.body)} ← ${JSON.stringify(body).slice(0, 300)}`);
      // every priced gold line is worth exactly what the market formula says
      if (body.type === 'trade') body.lines.forEach((l, k) => {
        if ((l.kind === 'melt' || l.kind === 'bar') && l.priced !== false) assert.equal(r.body.calc.lines[k].value, meltValue(l.weight, l.fineness, l.mazaneh), `line value ${JSON.stringify(l)}`);
        if (l.kind === 'coin' && l.priced !== false) assert.equal(r.body.calc.lines[k].value, l.count * l.price);
      });
      const effect = effectOf(body);
      apply(effect, 1);
      docs.set(r.body.id, { body, effect });
      if (effect.e.barsIn.length || effect.e.barsOut.length) trace.push(`make ${r.body.id} ${JSON.stringify(effect.e.barsIn)} ${JSON.stringify(effect.e.barsOut)}`);
      made++;
    }
    if (step % 25 === 0 || step === N) await checkAll(step);
  }
  // customers: every balance equals the model, unit by unit
  for (const P of parties) {
    const r = (await call('GET', `/api/books/parties/${P}`)).body;
    const want = Object.fromEntries(Object.entries(model.party[P] ?? {}).filter(([, v]) => Math.abs(v) > 1e-9));
    const got = Object.fromEntries(Object.entries(r.balance ?? {}).filter(([, v]) => Math.abs(v) > 1e-9));
    assert.deepEqual(got, want, `party ${P}`);
    // the statement's running balance ends where the balance is
    for (const [u, v] of Object.entries(got)) {
      const last = r.statement.filter((s) => s.unit === u).at(-1);
      assert.equal(last.balance, v, `statement end ${u}`);
    }
  }
  // the period's net result (spec 0026): income, expenses and money write-offs exactly as the model
  const pnl = (await call('GET', `/api/books/report/pnl?from=0000-01-01&to=${today}`)).body;
  assert.equal(pnl.result.income, model.income, 'net result: income');
  assert.equal(pnl.result.expense, model.expense, 'net result: expenses');
  assert.equal(pnl.result.writeoff, model.woIRR, 'net result: money write-offs');
  assert.equal(pnl.result.net, pnl.result.trading + model.income - model.expense - model.woIRR, 'net result adds up');
  // one position per unit: what the vault holds plus what customers owe in goods (a bar at its card weight)
  const pos = Object.fromEntries(pnl.positions.map((x) => [x.key, x.qty]));
  const owed = (u) => parties.reduce((a, P) => a + (model.party[P]?.[u] ?? 0), 0);
  const goldPos = r3(model.gold + barsIn().reduce((a, s2) => a + (model.barEq[s2] ?? 0), 0) + owed('G750'));
  assert.ok(Math.abs(r3(pos.G750 ?? 0) - goldPos) < 0.0015, `position G750: ${pos.G750} vs ${goldPos}`);
  for (const c of COINS) assert.equal(Math.round(pos[`COIN:${c}`] ?? 0), (model.coins[c] ?? 0) + owed(`COIN:${c}`), `position COIN:${c}`);
  for (const f of FX) assert.ok(Math.abs((pos[`FX:${f}`] ?? 0) - (model.fx[f] ?? 0)) < 0.011, `position FX:${f}`);
  const rep = (await call('GET', '/api/books/replay')).body;
  assert.equal(rep.ok, true, `replay: ${JSON.stringify(rep.diffs?.slice(0, 3))}`);
  // the same numbers wherever they are shown
  const dash = (await call('GET', '/api/books/dashboard')).body;
  const ex = (await call('GET', '/api/books/control/explain?metric=cash')).body;
  const twin = (await call('GET', '/api/books/control/twin')).body;
  assert.equal(ex.value, model.cash, 'explain cash');
  const tc = twin.now?.cash ?? twin.cash;
  assert.equal(Array.isArray(tc) ? tc.reduce((a, x) => a + x.amount, 0) : tc, model.cash, 'twin cash');
  assert.ok(dash, 'dashboard answers');
  assert.ok(made > N * 0.5 && voided > 5 && edited > 5 && rejected > 5, `mix: ${made} made, ${voided} voided, ${edited} edited, ${rejected} rejected`);
});
