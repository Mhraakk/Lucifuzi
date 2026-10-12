// سری طلاها و ردیابی هر گرم (spec 0002 #6). Every priced purchase opens a lot named by the tracking code of its line
// (e.g. M1405-00012/L1); every priced sale takes from the oldest lots first (FIFO) and records which lot each gram came
// from. So for any lot: how much is left, where the rest went, and what it earned. Per-lot profit is FIFO; the shop's
// P&L report stays on weighted average cost (positionReport) — the two are different, honest views and are labelled.
import { movesOf } from './trade.mjs';

const r3 = (x) => Math.round(x * 1000) / 1000;
const rnd = (x) => Math.round(x);
const EPS = 1e-9;

/** events: [{ id, track, type, date, data, calc, party }] in booking order. */
export function buildLots(events) {
  const lots = [];
  const open = {}; // unit → lots with remaining > 0, oldest first
  const sales = [];
  const shortfalls = [];
  const add = (unit, lot) => {
    lots.push(lot);
    (open[unit] ??= []).push(lot);
  };
  const take = (unit, qty, value, ref) => {
    const alloc = [];
    let left = qty;
    const q = open[unit] ?? [];
    while (left > EPS && q.length) {
      const lot = q[0];
      const use = Math.min(left, lot.remaining);
      const costShare = (lot.cost * use) / lot.qty;
      const valueShare = qty ? (value * use) / qty : 0;
      lot.remaining = r3(lot.remaining - use);
      lot.realized += valueShare - costShare;
      lot.out.push({ ...ref, qty: r3(use), value: rnd(valueShare), cost: rnd(costShare), profit: rnd(valueShare - costShare) });
      alloc.push({ lot: lot.id, qty: r3(use), cost: rnd(costShare), profit: rnd(valueShare - costShare) });
      left -= use;
      if (lot.remaining <= EPS) q.shift();
    }
    if (left > 1e-6) shortfalls.push({ ...ref, unit, qty: r3(left) });
    sales.push({ ...ref, unit, qty: r3(qty), value: rnd(value), alloc, short: left > 1e-6 ? r3(left) : 0 });
  };
  // a melting: the oldest lots of each input go into the pot at their cost; what does not come back is their loss
  const transfer = (unit, qty, keep, ref) => {
    let left = qty, carried = 0;
    const q = open[unit] ?? [];
    while (left > EPS && q.length) {
      const lot = q[0];
      const use = Math.min(left, lot.remaining);
      const costShare = (lot.cost * use) / lot.qty;
      lot.remaining = r3(lot.remaining - use);
      lot.realized += costShare * keep - costShare;
      lot.out.push({ ...ref, qty: r3(use), value: rnd(costShare * keep), cost: rnd(costShare), profit: rnd(costShare * keep - costShare), ...(ref.owed ? {} : { melted: true }) });
      carried += costShare * keep;
      left -= use;
      if (lot.remaining <= EPS) q.shift();
    }
    if (left > 1e-6) shortfalls.push({ ...ref, unit, qty: r3(left) });
    return carried;
  };
  // the same moves, in the same order, as the weighted-average result (trade.mjs movesOf): the two views never
  // disagree on what came in and what went out, only on which gram it was
  for (const e of events) {
    const ref = { doc: e.id, track: e.track, date: e.date, party: e.party ?? null };
    for (const m of movesOf(e)) {
      const line = m.line != null ? { ...ref, track: `${e.track}/L${m.line + 1}`, kind: m.kind ?? e.type, serial: m.serial ?? null, weight: m.weight ?? null, fineness: m.fineness ?? null } : { ...ref, kind: m.kind ?? e.type, serial: null, weight: null, fineness: null };
      const lot = (unit, qty, cost) => ({ id: line.track, unit, date: e.date, doc: e.id, party: e.type === 'opening' ? null : ref.party, kind: line.kind, serial: line.serial, weight: line.weight, fineness: line.fineness, qty: r3(qty), cost: rnd(cost), remaining: r3(qty), realized: 0, out: [] });
      if (m.op === 'buy') add(m.key, lot(m.key, m.q, m.value));
      else if (m.op === 'book') {
        if (m.q > 0) add(m.key, lot(m.key, m.q, m.cost));
        // what the shop owes at the opening comes out of the oldest lots at their cost, realizing nothing (spec 0026)
        else transfer(m.key, -m.q, 1, { ...line, owed: true });
      } else if (m.op === 'sell') take(m.key, m.q, m.value, line);
      else if (m.op === 'lose') take(m.key, m.q, 0, { ...line, shortage: true });
      else if (m.op === 'move') {
        const eqIn = m.inputs.reduce((s, x) => s + x.eq750, 0), eqOut = m.outputs.reduce((s, x) => s + x.q, 0);
        const keep = eqIn > 0 ? Math.min(1, eqOut / eqIn) : 1;
        let carried = 0;
        for (const x of m.inputs) carried += transfer(x.key, x.q, keep, { ...ref, kind: 'transform' });
        for (const x of m.outputs) add(x.key, lot(x.key, x.q, eqOut > 0 ? (carried * x.q) / eqOut : 0));
      }
    }
  }
  for (const l of lots) (l.realized = rnd(l.realized)), (l.avgCost = l.qty ? rnd(l.cost / l.qty) : 0), (l.remainingCost = rnd((l.cost * l.remaining) / l.qty));
  const byUnit = {};
  for (const l of lots) {
    const u = (byUnit[l.unit] ??= { unit: l.unit, lots: 0, open: 0, remaining: 0, remainingCost: 0, realized: 0 });
    u.lots++;
    if (l.remaining > EPS) (u.open++, (u.remaining = r3(u.remaining + l.remaining)), (u.remainingCost += l.remainingCost));
    u.realized += l.realized;
  }
  return { lots, sales, shortfalls, units: Object.values(byUnit) };
}
