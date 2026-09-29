// سری طلاها و ردیابی هر گرم (spec 0002 #6). Every priced purchase opens a lot named by the tracking code of its line
// (e.g. M1405-00012/L1); every priced sale takes from the oldest lots first (FIFO) and records which lot each gram came
// from. So for any lot: how much is left, where the rest went, and what it earned. Per-lot profit is FIFO; the shop's
// P&L report stays on weighted average cost (positionReport) — the two are different, honest views and are labelled.
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
  for (const e of events) {
    const c = e.calc;
    const ref = { doc: e.id, track: e.track, date: e.date, party: e.party ?? null };
    if (e.type === 'trade') {
      (c.lines ?? []).forEach((l, i) => {
        if (!l.priced) return;
        const unit = l.kind === 'melt' || l.kind === 'bar' ? 'G750' : l.unit;
        const q = l.kind === 'melt' || l.kind === 'bar' ? l.eq750 : l.amt;
        if (!(q > 0)) return;
        const value = l.value - (l.fee ?? 0);
        const line = { ...ref, track: `${e.track}/L${i + 1}`, kind: l.kind, serial: l.serial ?? null, weight: l.weight ?? null, fineness: l.fineness ?? null };
        if (l.dir === 'in') add(unit, { id: line.track, unit, date: e.date, doc: e.id, party: ref.party, kind: l.kind, serial: line.serial, weight: line.weight, fineness: line.fineness, qty: r3(q), cost: rnd(value), remaining: r3(q), realized: 0, out: [] });
        else take(unit, q, value, line);
      });
    } else if (e.type === 'opening' || e.type === 'adjust') {
      (e.data.balances ?? []).forEach((b, i) => {
        const bar = b.acct.startsWith('bar:') && b.weight ? r3((b.weight * (b.fineness ?? 995)) / 750) : 0;
        const unit = b.acct === 'gold' || bar ? 'G750' : b.acct.startsWith('coin:') ? `COIN:${b.acct.slice(5)}` : b.acct.startsWith('fx:') ? `FX:${b.acct.slice(3)}` : null;
        if (!unit) return;
        const q = bar ? bar * Math.sign(b.amt) : b.amt;
        const line = { ...ref, track: `${e.track}/L${i + 1}` };
        if (q > 0) add(unit, { id: line.track, unit, date: e.date, doc: e.id, party: null, kind: e.type, serial: bar ? b.acct.slice(4) : null, weight: b.weight ?? null, fineness: b.fineness ?? null, qty: r3(q), cost: rnd(b.cost ?? 0), remaining: r3(q), realized: 0, out: [] });
        else if (q < 0) take(unit, -q, 0, { ...line, shortage: true });
      });
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
