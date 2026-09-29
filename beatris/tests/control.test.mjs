import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.mjs';
import { createServer } from '../server/index.mjs';
import { seedUsers } from '../server/api.mjs';

let server, base, db, O, M, E;
const call = async (method, p, body, token) => {
  const r = await fetch(base + p, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const ok = async (...a) => {
  const r = await call(...a);
  assert.ok(r.status < 300, `${a[0]} ${a[1]} → ${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
};
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran' }).format(new Date());
const ago = (n) => new Date(Date.parse(`${today}T00:00:00Z`) - n * 864e5).toISOString().slice(0, 10);
const MZ = 400000000; // rial per mesghal of 705
let P, Q, sellDoc;

before(async () => {
  db = openDb(':memory:');
  seedUsers(db, {}, true);
  server = createServer({ db, secret: 'test-secret-0123456789', demo: true, quiet: true, tenantsDir: ':memory:', marketOpts: { fetchImpl: async () => new Response('{}', { status: 404 }), defaultMode: 'off' } });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  const login = async (phone) => (await ok('POST', '/api/auth/login', { phone, pin: '1234' })).token;
  [O, M, E] = [await login('09120000001'), await login('09120000002'), await login('09120000004')];
  const cap = await ok('POST', '/api/books/parties', { name: 'صاحب سرمایه' }, M);
  P = (await ok('POST', '/api/books/parties', { name: 'مهران رضایی', mobile: '09121234567' }, M)).party ?? null;
  P ??= (await ok('GET', '/api/books/parties?q=مهران', null, M)).items[0];
  Q = (await ok('GET', '/api/books/parties?q=سرمایه', null, M)).items[0];
  void cap;
  // capital into the drawer, then two purchases (lots) on different days and one sale
  await ok('POST', '/api/books/docs', { type: 'receipt', date: ago(10), partyId: Q.id, payments: [{ method: 'cash', dir: 'in', amount: 1000000000 }] }, M); // 10 bn rial
  await ok('POST', '/api/books/docs', { type: 'trade', date: ago(9), partyId: P.id, lines: [{ kind: 'melt', dir: 'in', weight: 10, fineness: 750, mazaneh: MZ }], payments: [{ method: 'cash', dir: 'out', amount: 923400000 }] }, M);
  await ok('POST', '/api/books/docs', { type: 'trade', date: ago(5), partyId: P.id, lines: [{ kind: 'melt', dir: 'in', weight: 10, fineness: 750, mazaneh: 420000000 }], payments: [{ method: 'cash', dir: 'out', amount: 969600000 }] }, M);
  sellDoc = await ok('POST', '/api/books/docs', { type: 'trade', date: ago(2), partyId: P.id, lines: [{ kind: 'melt', dir: 'out', weight: 12, fineness: 750, mazaneh: 450000000 }], payments: [{ method: 'cash', dir: 'in', amount: 1246600000 }] }, M);
});
after(() => {
  server.close();
  server.bus.stop();
});

test('lots: each purchase is a lot; the sale takes FIFO and each lot knows its profit', async () => {
  const r = await ok('GET', '/api/books/control/lots', null, M);
  const lots = [...r.lots].reverse();
  assert.equal(lots.length, 2);
  assert.deepEqual(lots.map((l) => [l.qty, l.remaining]), [[10, 0], [10, 8]]);
  const [l1, l2] = lots;
  // independent check: the sale's value split by grams, minus each lot's own cost share
  const sale = sellDoc.calc?.lines?.[0]?.value ?? (await ok('GET', `/api/books/docs/${sellDoc.id}`, null, M)).calc.lines[0].value;
  assert.equal(l1.realized, Math.round((sale * 10) / 12 - l1.cost));
  assert.equal(l2.realized, Math.round((sale * 2) / 12 - (l2.cost * 2) / 10));
  assert.equal(l1.out[0].track, `${sellDoc.track}/L1`);
  assert.equal(r.units[0].remaining, 8);
  assert.equal((await call('GET', '/api/books/control/lots', null, E)).status, 403);
});

test('twin and time machine: the state of any past day, and today equals the vault', async () => {
  const now = await ok('GET', '/api/books/control/twin', null, M);
  const vault = await ok('GET', '/api/books/vault', null, M);
  assert.equal(now.gold, vault.gold);
  assert.equal(now.cashTotal, Object.values(vault.cash).reduce((a, b) => a + b, 0));
  const then = await ok('GET', `/api/books/control/twin?day=${ago(6)}`, null, M); // after the first purchase only
  assert.equal(then.gold, 10);
  assert.equal(then.cashTotal, 10000000000 - 923400000 * 1);
  assert.equal(then.live, false);
  const before = await ok('GET', `/api/books/control/twin?day=${ago(20)}`, null, M);
  assert.equal(before.gold, 0);
  assert.equal(before.cashTotal, 0);
  assert.equal((await call('GET', `/api/books/control/twin?day=2999-01-01`, null, M)).status, 400);
  const cmp = await ok('GET', `/api/books/control/twin?compare=${ago(6)}`, null, M);
  assert.equal(cmp.compare.gold, 10);
});

test('explain: every number says where it comes from, and matches the dashboard', async () => {
  const dash = await ok('GET', '/api/books/dashboard?range=7', null, M);
  const net = await ok('GET', '/api/books/control/explain?metric=net', null, M);
  assert.equal(net.value, dash.kpi.net.grams);
  assert.match(net.sentence, /طلای فیزیکی/);
  const phys = await ok('GET', '/api/books/control/explain?metric=physical', null, M);
  assert.equal(phys.value, dash.kpi.physical.grams);
  assert.equal(phys.parts[0].value, 8);
  const cash = await ok('GET', '/api/books/control/explain?metric=cash', null, M);
  assert.equal(cash.value, cash.parts.reduce((s, p) => s + p.value, 0));
  assert.ok(cash.recent.some((r) => r.label.startsWith(sellDoc.track)));
  const pnl = await ok('GET', `/api/books/control/explain?metric=pnl&day=${ago(2)}`, null, M);
  const report = await ok('GET', `/api/books/report/pnl?from=${ago(2)}&to=${ago(2)}`, null, M);
  assert.equal(pnl.value, report.realizedTotal);
  const party = await ok('GET', `/api/books/control/explain?metric=party:${P.id}`, null, M);
  assert.match(party.sentence, /معامله/);
  assert.equal((await call('GET', '/api/books/control/explain?metric=nope', null, M)).status, 400);
});

test('dual trial balance: weight and rial kept apart and consistent with the twin', async () => {
  const t = await ok('GET', '/api/books/control/trial', null, M);
  const gold = t.rows.find((r) => r.acct === 'gold');
  assert.equal(gold.g750, 8);
  assert.equal(gold.pure, 6);
  assert.equal(gold.rial, 0);
  const twin = await ok('GET', '/api/books/control/twin', null, M);
  assert.equal(t.rows.filter((r) => r.group === 'money').reduce((s, r) => s + r.rial, 0), twin.cashTotal + twin.bankTotal);
});

test('story: the customer\'s relationship in words and every event in order', async () => {
  const s = await ok('GET', `/api/books/control/story?party=${P.id}`, null, M);
  assert.equal(s.behaviour.trades, 3);
  assert.match(s.story, /۳ معامله/);
  assert.match(s.story, /نقد/);
  assert.match(s.story, /[۰-۹]{4}\/[۰-۹]{2}\/[۰-۹]{2}/); // Jalali, never the stored Gregorian
  assert.ok(!/\d{4}-\d\d-\d\d/.test(s.story));
  assert.deepEqual([...new Set(s.events.map((e) => e.kind))].sort(), ['invoice', 'payment']);
  const item = await ok('GET', '/api/books/control/story?unit=G750', null, M);
  assert.deepEqual(item.events.map((e) => e.balance), [10, 20, 8]);
});

test('simulator + safe sale: before/after from the booking engine, typed verdict, nothing saved', async () => {
  const docsBefore = db.get('SELECT COUNT(*) AS n FROM bk_docs').n;
  const good = await ok('POST', '/api/books/control/simulate', { partyId: P.id, lines: [{ kind: 'melt', dir: 'out', weight: 2, fineness: 750, mazaneh: 470000000 }], payments: [{ method: 'cash', dir: 'in', amount: 217000000 }] }, M);
  assert.equal(good.saved, false);
  assert.equal(good.after.gold, 6);
  assert.equal(good.delta.gold, -2);
  assert.equal(good.after.cash - good.before.cash, 217000000);
  assert.ok(['safe', 'caution'].includes(good.verdict.choice));
  assert.ok(good.profit.profit > 0);
  assert.equal(good.checks.find((c) => c.key === 'stock').ok, true);
  const sum = Object.values(good.verdict.probabilities).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 0.005);
  // selling more than the vault holds, below cost: stop
  const bad = await ok('POST', '/api/books/control/simulate', { lines: [{ kind: 'melt', dir: 'out', weight: 9, fineness: 750, mazaneh: 300000000 }] }, M);
  assert.equal(bad.verdict.choice, 'stop');
  assert.equal(bad.checks.find((c) => c.key === 'stock').ok, false);
  assert.equal(bad.checks.find((c) => c.key === 'unpaid')?.ok, false); // no customer, no payment: the money lands on nobody
  const low = await ok('POST', '/api/books/control/simulate', { lines: [{ kind: 'melt', dir: 'out', weight: 1, fineness: 750, mazaneh: 300000000 }] }, M);
  assert.equal(low.checks.find((c) => c.key === 'cost').ok, false);
  assert.equal(low.verdict.choice, 'stop');
  assert.equal(db.get('SELECT COUNT(*) AS n FROM bk_docs').n, docsBefore);
  assert.equal((await call('POST', '/api/books/control/simulate', {}, M)).status, 400);
});

test('exceptions: only the unusual, with probabilities; labels, calibration refused until ready', async () => {
  // a sale below cost appears
  const loss = await ok('POST', '/api/books/docs', { type: 'trade', partyId: P.id, lines: [{ kind: 'melt', dir: 'out', weight: 1, fineness: 750, mazaneh: 300000000 }], payments: [{ method: 'cash', dir: 'in', amount: 69300000 }] }, M);
  const ex = await ok('GET', '/api/books/control/exceptions', null, M);
  const below = ex.items.find((x) => x.rule === 'below-cost');
  assert.ok(below, JSON.stringify(ex.items.map((x) => x.rule)));
  assert.match(below.detail, new RegExp(loss.track));
  assert.ok(below.p > 0 && below.p < 1);
  // the setup's back-dated documents (10, 9 and 5 days back; 2 days is within tolerance) are one item, not three
  const back = ex.items.filter((x) => x.rule === 'backdated');
  assert.equal(back.length, 1);
  assert.match(back[0].title, /۳ سند/);
  assert.equal(ex.calibrated, false);
  await ok('POST', '/api/books/control/exceptions/label', { key: below.key, real: true, status: 'resolved' }, M);
  assert.ok(!(await ok('GET', '/api/books/control/exceptions', null, M)).items.some((x) => x.key === below.key));
  assert.ok((await ok('GET', '/api/books/control/exceptions?all=1', null, M)).items.some((x) => x.key === below.key && x.label === 1));
  const cal = await ok('GET', '/api/books/control/exceptions/calibration', null, M);
  assert.equal(cal.labels, 1);
  assert.equal(cal.ready, false);
  assert.equal((await call('POST', '/api/books/control/exceptions/calibration', null, M)).status, 400);
  assert.equal((await call('GET', '/api/books/control/exceptions', null, E)).status, 403);
});

test('calibration: fitted on the owner\'s verdicts, applied only if it helps on held-out cases, and only to its own rules', async () => {
  // 40 labelled verdicts with a biased raw score (the rules over-alarm): write them directly, like 40 real reviews
  let s = 3;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 40; i++) {
    const real = rnd() < 0.35 ? 1 : 0;
    const raw = 1.5 + (real ? 2.2 : 0.4) + (rnd() - 0.5) * 2;
    db.run("INSERT INTO ctl_exc(key,status,label,raw,rules,by,at) VALUES (?,?,?,?,?,?,?)", `test:${i}`, 'resolved', real, raw, 'exc-1', 'x', new Date().toISOString());
  }
  const r = await ok('POST', '/api/books/control/exceptions/calibration', null, M);
  assert.ok(r.before.auc > 0.6);
  assert.equal(r.applied, r.helped);
  assert.equal(r.applied, true, 'these verdicts carry signal and a biased scale: the correction must help'); // double check it really ran
  if (r.applied) {
    assert.ok(r.after.ece < r.before.ece);
    const ex = await ok('GET', '/api/books/control/exceptions', null, M);
    assert.equal(ex.calibrated, true);
  }
  // a calibration fitted on other rules is refused, never applied
  db.run("UPDATE settings SET value_json=json_set(value_json,'$.rules','exc-0') WHERE key='excCalibration'");
  const v = await ok('GET', '/api/books/control/exceptions/calibration', null, M);
  if (r.applied) assert.match(v.refused, /exc-0/);
  assert.equal((await ok('GET', '/api/books/control/exceptions', null, M)).calibrated, false);
});

test('pulse: one typed sentence with probabilities, confidence and coverage', async () => {
  const p = await ok('GET', '/api/books/control/pulse', null, M);
  assert.ok(['calm', 'watch', 'alarm'].includes(p.state));
  const sum = Object.values(p.probabilities).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 0.005);
  assert.ok(p.coverage > 0 && p.coverage <= 1);
  assert.ok(p.confidence >= 0 && p.confidence <= 1);
  assert.ok(p.sentence.length > 10 && !/\d{4}-\d\d-\d\d/.test(p.sentence));
  assert.ok(p.drivers.length >= 5);
});

test('what changed: since the last visit, ranked, and "seen" moves the point', async () => {
  const c = await ok('GET', '/api/books/control/changes', null, M);
  assert.equal(c.first, true);
  assert.ok(c.items.length >= 2);
  assert.ok(c.items.every((x, i) => i === 0 || c.items[i - 1].weight >= x.weight));
  await ok('POST', '/api/books/control/changes/seen', null, M);
  const c2 = await ok('GET', '/api/books/control/changes', null, M);
  assert.equal(c2.first, false);
  assert.ok(c2.items.length < c.items.length || c2.items.every((x) => !['doc', 'big'].includes(x.icon)));
});

test('forecast10: ten days of cash and gold with bands', async () => {
  const f = await ok('GET', '/api/books/control/forecast10', null, M);
  assert.equal(f.days.length, 10);
  assert.ok(f.days.every((d) => d.moneyLow <= d.money && d.money <= d.moneyHigh));
});

test('find: customers, documents by tracking code, and the manual', async () => {
  const f = await ok('GET', `/api/books/control/find?q=${encodeURIComponent(sellDoc.track)}`, null, E);
  assert.ok(f.items.some((x) => x.kind === 'doc' && x.href.endsWith(sellDoc.id)));
  const g = await ok('GET', `/api/books/control/find?q=${encodeURIComponent('مهران')}`, null, E);
  assert.ok(g.items.some((x) => x.kind === 'party'));
});

test('period lock: a closed month cannot be changed; only the owner reopens it with a reason', async () => {
  const p = await ok('GET', '/api/books/control/periods', null, M);
  const prevMonth = p.months.find((m) => !m.current)?.month ?? (() => {
    const [y, mm] = p.current.split('-').map(Number);
    return mm === 1 ? `${y - 1}-12` : `${y}-${String(mm - 1).padStart(2, '0')}`;
  })();
  assert.equal((await call('POST', '/api/books/control/periods/lock', { month: p.current }, M)).status, 400);
  await ok('POST', '/api/books/control/periods/lock', { month: prevMonth }, M);
  // a date inside the locked month: 40 days ago is always in an earlier month
  const lockedDay = ago(40);
  const ctl = await ok('GET', '/api/books/control/periods', null, M);
  const monthOfLocked = ctl.months.find((m) => m.locked)?.month;
  assert.equal(monthOfLocked, prevMonth);
  const probe = await call('POST', '/api/books/docs', { type: 'receipt', date: lockedDay, partyId: Q.id, payments: [{ method: 'cash', dir: 'in', amount: 1000 }] }, M);
  // 40 days ago may fall one month further back than the locked one: then it must pass, else be refused with 423
  const lockedMonthDays = probe.status === 423;
  if (!lockedMonthDays) assert.ok(probe.status < 300);
  const inLocked = await call('POST', '/api/books/docs', { type: 'receipt', date: ago(35), partyId: Q.id, payments: [{ method: 'cash', dir: 'in', amount: 1000 }] }, M);
  assert.ok([201, 200, 423].includes(inLocked.status));
  assert.equal((await call('POST', '/api/books/control/periods/unlock', { month: prevMonth, reason: 'اصلاح' }, M)).status, 403);
  assert.equal((await call('POST', '/api/books/control/periods/unlock', { month: prevMonth }, O)).status, 400);
  await ok('POST', '/api/books/control/periods/unlock', { month: prevMonth, reason: 'اصلاح سند اشتباه' }, O);
  assert.ok(!(await ok('GET', '/api/books/control/periods', null, M)).months.some((m) => m.locked));
});

test('period lock refuses exactly the dates inside the locked month', async () => {
  const p = await ok('GET', '/api/books/control/periods', null, M);
  const prevMonth = (() => {
    const [y, mm] = p.current.split('-').map(Number);
    return mm === 1 ? `${y - 1}-12` : `${y}-${String(mm - 1).padStart(2, '0')}`;
  })();
  await ok('POST', '/api/books/control/periods/lock', { month: prevMonth }, M);
  // find a day that belongs to the locked month by asking the server's own month mapping through twin/periods
  let hit = null;
  for (let n = 1; n <= 62 && !hit; n++) {
    const r = await call('POST', '/api/books/docs', { type: 'receipt', date: ago(n), partyId: Q.id, payments: [{ method: 'cash', dir: 'in', amount: 1000 }], status: 'draft' }, M);
    if (r.status === 423) hit = ago(n);
  }
  assert.ok(hit, 'some day of the previous month is refused');
  const r = await call('POST', '/api/books/docs', { type: 'receipt', date: hit, partyId: Q.id, payments: [{ method: 'cash', dir: 'in', amount: 1000 }] }, M);
  assert.equal(r.status, 423);
  assert.match(r.body.error, /قفل/);
  await ok('POST', '/api/books/control/periods/unlock', { month: prevMonth, reason: 'پایان آزمون' }, O);
});

test('approvals + four eyes: a void needs another manager; the requester cannot approve; one use only', async () => {
  const cash = await ok('POST', '/api/books/docs', { type: 'receipt', partyId: Q.id, payments: [{ method: 'cash', dir: 'in', amount: 5000 }] }, M);
  assert.equal((await call('PUT', '/api/books/control/approvals/rules', { enabled: true }, M)).status, 403); // owner only
  await ok('PUT', '/api/books/control/approvals/rules', { enabled: true, void: true }, O);
  const first = await call('POST', `/api/books/docs/${cash.id}/void`, { reason: 'ثبت اشتباه' }, M);
  assert.equal(first.status, 428);
  const id = first.body.approval.id;
  assert.ok(id);
  // asking again for the same thing reuses the open request
  assert.equal((await call('POST', `/api/books/docs/${cash.id}/void`, { reason: 'ثبت اشتباه' }, M)).body.approval.id, id);
  // four eyes
  const self = await call('POST', `/api/books/control/approvals/${id}/approve`, {}, M);
  assert.equal(self.status, 403);
  assert.match(self.body.error, /چهار چشم/);
  assert.equal((await call('POST', `/api/books/control/approvals/${id}/approve`, {}, E)).status, 403); // an employee cannot approve
  // not approved yet → still stopped
  assert.equal((await call('POST', `/api/books/docs/${cash.id}/void`, { reason: 'ثبت اشتباه', approval: id }, M)).status, 428);
  await ok('POST', `/api/books/control/approvals/${id}/approve`, { note: 'درست است' }, O);
  // someone else cannot use it
  assert.equal((await call('POST', `/api/books/docs/${cash.id}/void`, { reason: 'ثبت اشتباه', approval: id }, O)).status, 403);
  const v = await ok('POST', `/api/books/docs/${cash.id}/void`, { reason: 'ثبت اشتباه', approval: id }, M);
  assert.equal(v.status, 'void');
  const list = await ok('GET', '/api/books/control/approvals', null, O);
  assert.equal(list.items.find((a) => a.id === id).status, 'used');
  // below cost needs approval too, bound to the same content
  const lossy = { type: 'trade', partyId: P.id, lines: [{ kind: 'melt', dir: 'out', weight: 0.5, fineness: 750, mazaneh: 300000000 }], payments: [{ method: 'cash', dir: 'in', amount: 34650000 }] };
  const q = await call('POST', '/api/books/docs', lossy, M);
  assert.equal(q.status, 428);
  await ok('POST', `/api/books/control/approvals/${q.body.approval.id}/approve`, {}, O);
  const changed = await call('POST', '/api/books/docs', { ...lossy, lines: [{ ...lossy.lines[0], weight: 0.6 }], approval: q.body.approval.id }, M);
  assert.equal(changed.status, 409); // approval was for other content
  const booked = await call('POST', '/api/books/docs', { ...lossy, approval: q.body.approval.id }, M);
  assert.ok(booked.status < 300, JSON.stringify(booked.body));
  const rej = await call('POST', `/api/books/docs/${booked.body.id}/void`, { reason: 'آزمون رد' }, M);
  assert.equal((await call('POST', `/api/books/control/approvals/${rej.body.approval.id}/reject`, {}, O)).status, 400); // a reason is required
  await ok('POST', `/api/books/control/approvals/${rej.body.approval.id}/reject`, { note: 'این سند درست است' }, O);
  assert.equal((await call('POST', `/api/books/docs/${booked.body.id}/void`, { reason: 'آزمون رد', approval: rej.body.approval.id }, M)).status, 403);
  await ok('PUT', '/api/books/control/approvals/rules', { enabled: false }, O);
});

test('auto close: reconciles the day, shows only mismatches, closes with the shop key when clean', async () => {
  const r = await ok('POST', '/api/books/control/recon', { day: ago(9) }, M);
  assert.ok(Array.isArray(r.issues));
  assert.equal(r.closed, false); // a manager's manual run never closes
  const clean = await ok('POST', '/api/books/control/recon', { day: ago(9), close: true }, O);
  if (!clean.issues.length) {
    assert.equal(clean.closed, true);
    const v = await ok('GET', `/api/books/close/${ago(9)}/verify`, null, M);
    assert.equal(v.valid, true);
    assert.equal(v.signer, 'بستن خودکار');
  } else assert.equal(clean.closed, false);
  // the nightly tick is off until the owner switches it on
  assert.equal((await ok('GET', '/api/books/control/autoclose', null, M)).rules.enabled, false);
  assert.equal((await call('PUT', '/api/books/control/autoclose', { enabled: true, at: '25:00' }, O)).status, 400);
  await ok('PUT', '/api/books/control/autoclose', { enabled: true, at: '00:00' }, O);
  const books = server.platform.handleFor('main').books;
  const tick = books.autoClose();
  assert.ok(tick && tick.day === today);
  assert.equal(books.autoClose(), null); // once per night
  const rep = await ok('GET', '/api/books/control/autoclose', null, M);
  assert.ok(rep.reports.some((x) => x.day === today && x.auto));
  await ok('PUT', '/api/books/control/autoclose', { enabled: false }, O);
});
