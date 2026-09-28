// داشبورد مدیریت — read-only aggregates for the management dashboard. Nothing here computes accounting: every number
// comes from the ledger that the books engine already wrote (bk_postings) or from the existing report handlers
// (balance, trading result, day book, audit), re-read through `call` so their permission checks and rules apply.
// Money is integer rial, gold is grams of 750; the client converts to the operator's display unit.
import * as B from '../public/js/books.mjs';
import * as TR from '../public/js/trade.mjs';
import { COIN_TYPES } from '../public/js/coins.mjs';
import { jalaliOf } from '../public/js/ta.mjs';

const SYS = { id: null, role: 'owner', name: 'داشبورد' };
const DAY = 864e5;
const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);
const tehranHour = (iso) => Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: 'Asia/Tehran' }).format(new Date(iso))) % 24;
export const AGING_BUCKETS = [
  ['d0', '۰ تا ۷ روز', 0, 7],
  ['d8', '۸ تا ۳۰ روز', 8, 30],
  ['d31', '۳۱ تا ۶۰ روز', 31, 60],
  ['d61', '۶۱ تا ۹۰ روز', 61, 90],
  ['d90', 'بیش از ۹۰ روز', 91, Infinity],
];

export function makeDashboard({ db, call, tehranDay, livePrices, market, audit }) {
  // eq-750 grams of every sealed bar ever booked (its latest recorded weight and fineness)
  function barGrams() {
    const m = new Map();
    for (const r of db.all("SELECT data_json FROM bk_docs WHERE status='final' AND type='trade' AND data_json LIKE '%\"kind\":\"bar\"%' ORDER BY date, created_at")) {
      for (const l of JSON.parse(r.data_json).lines ?? []) if (l.kind === 'bar' && l.serial) m.set(l.serial, B.r3((B.num(l.weight) * B.num(l.fineness ?? 750)) / 750));
    }
    return m;
  }

  /**
   * Gold position through time: physical (melt box + sealed bars), gold the customers owe the shop, gold the shop owes
   * them (custody, bars held for them), and the net. Rial receivables and payables ride along for the KPI lines.
   * points: ISO days (daily) or hours of today ('HH') — each point is the state at the end of that bucket.
   */
  function positionSeries(points, mode) {
    const bars = barGrams();
    const rows = db.all("SELECT p.acct, p.unit, p.amt, p.date, COALESCE(d.issued_at, d.created_at, p.date || 'T08:30:00Z') AS ts FROM bk_postings p LEFT JOIN bk_docs d ON d.id=p.src WHERE p.acct='gold' OR p.acct LIKE 'bar:%' OR (p.acct LIKE 'party:%' AND (p.unit IN ('G750','IRR') OR p.unit LIKE 'BAR:%')) ORDER BY p.date, ts");
    const today = tehranDay();
    const keyOf = (r) => (mode === 'hour' ? (r.date < today ? '' : String(tehranHour(r.ts)).padStart(2, '0')) : r.date);
    const partyG = new Map(), partyI = new Map();
    let phys = 0, rec = 0, liab = 0, recI = 0, liabI = 0;
    const bump = (map, id, d, pos, neg) => {
      const b0 = map.get(id) ?? 0, b1 = b0 + d;
      map.set(id, b1);
      return [pos + Math.max(0, b1) - Math.max(0, b0), neg + Math.max(0, -b1) - Math.max(0, -b0)];
    };
    const out = [];
    let i = 0;
    for (const pt of points) {
      while (i < rows.length && keyOf(rows[i]) <= pt) {
        const r = rows[i++];
        if (r.acct === 'gold') phys += r.amt;
        else if (r.acct.startsWith('bar:')) phys += r.amt * (bars.get(r.acct.slice(4)) ?? 0);
        else {
          const id = r.acct.slice(6);
          if (r.unit === 'IRR') [recI, liabI] = bump(partyI, id, r.amt, recI, liabI);
          else [rec, liab] = bump(partyG, id, r.unit === 'G750' ? r.amt : r.amt * (bars.get(r.unit.slice(4)) ?? 0), rec, liab);
        }
      }
      out.push({ t: pt, physicalGold: B.r3(phys), goldReceivables: B.r3(rec), goldLiabilities: B.r3(liab), netGoldPosition: B.r3(phys + rec - liab), receivables: Math.round(recI), payables: Math.round(liabI), debtors: [...partyI.values()].filter((v) => v > 0.5).length, creditors: [...partyI.values()].filter((v) => v < -0.5).length });
    }
    return out;
  }

  /** Receivables aging, first-in first-out: payments settle the oldest debt, so what is still owed is the newest. */
  function aging(today) {
    const labels = new Map(db.all('SELECT * FROM bk_parties').map((p) => [p.id, TR.partyLabel(p)]));
    const byParty = new Map();
    for (const r of db.all("SELECT p.acct, p.amt, p.date FROM bk_postings p LEFT JOIN bk_docs d ON d.id=p.src WHERE p.acct LIKE 'party:%' AND p.unit='IRR' ORDER BY p.date, COALESCE(d.issued_at, d.created_at)")) {
      const id = r.acct.slice(6);
      (byParty.get(id) ?? byParty.set(id, []).get(id)).push(r);
    }
    const buckets = AGING_BUCKETS.map(([key, label, from, to]) => ({ key, label, from, to: Number.isFinite(to) ? to : null, amount: 0, customers: 0, daySum: 0, parties: [] }));
    for (const [id, rows] of byParty) {
      let left = rows.reduce((s, r) => s + r.amt, 0);
      if (left <= 0.5) continue;
      const pieces = new Map(); // bucket → { amount, daySum }
      for (let k = rows.length - 1; k >= 0 && left > 0.5; k--) {
        if (rows[k].amt <= 0) continue;
        const take = Math.min(rows[k].amt, left);
        left -= take;
        const age = Math.max(0, daysBetween(rows[k].date, today));
        const b = buckets.find((x) => age >= x.from && (x.to == null || age <= x.to));
        const p = pieces.get(b) ?? { amount: 0, daySum: 0, oldest: 0 };
        p.amount += take;
        p.daySum += take * age;
        p.oldest = Math.max(p.oldest, age);
        pieces.set(b, p);
      }
      for (const [b, p] of pieces) {
        b.amount += p.amount;
        b.daySum += p.daySum;
        b.customers++;
        b.parties.push({ id, label: labels.get(id) ?? '—', amount: Math.round(p.amount), days: p.oldest });
      }
    }
    const total = buckets.reduce((s, b) => s + b.amount, 0);
    return { total: Math.round(total), buckets: buckets.map((b) => ({ key: b.key, label: b.label, from: b.from, to: b.to, amount: Math.round(b.amount), pct: total ? (b.amount / total) * 100 : 0, customers: b.customers, avgDays: b.amount ? Math.round(b.daySum / b.amount) : 0, parties: b.parties.sort((x, y) => y.amount - x.amount).slice(0, 25) })) };
  }

  /**
   * The year at a glance: per day, how many final documents and trades were booked and the rial value of priced trade
   * lines (both sides), read from each document's stored calculation; per Jalali month, the realized trading result
   * that the P&L report already computed (its `days`). Only counting and grouping happens here.
   */
  function calendar(today, pnlDays) {
    const start = addDays(today, -370);
    const byDay = new Map();
    for (const r of db.all("SELECT date, type, calc_json FROM bk_docs WHERE status='final' AND date>=? AND date<=?", start, today)) {
      const d = byDay.get(r.date) ?? { day: r.date, docs: 0, trades: 0, value: 0 };
      d.docs++;
      if (r.type === 'trade') {
        d.trades++;
        for (const l of JSON.parse(r.calc_json || '{}').lines ?? []) if (l.priced) d.value += Math.abs(l.value ?? 0);
      }
      byDay.set(r.date, d);
    }
    const days = Array.from({ length: 371 }, (_, k) => {
      const iso = addDays(start, k), d = byDay.get(iso);
      return d ? { ...d, value: Math.round(d.value) } : { day: iso, docs: 0, trades: 0, value: 0 };
    });
    const months = new Map();
    for (const { day, realized } of pnlDays ?? []) {
      const [jy, jm] = jalaliOf(day), k = `${jy}-${String(jm).padStart(2, '0')}`;
      const m = months.get(k) ?? { key: k, jy, jm, realized: 0, days: 0 };
      m.realized += realized;
      if (realized) m.days++;
      months.set(k, m);
    }
    const [ty] = jalaliOf(today);
    return {
      days,
      months: [...months.values()].filter((m) => m.jy > ty - 3).sort((a, b) => a.key.localeCompare(b.key)).map((m) => ({ ...m, realized: Math.round(m.realized) })),
      year: ty,
    };
  }

  function build({ range = '7', from, to } = {}) {
    const today = tehranDay();
    const lp = livePrices();
    const p750 = lp.price.G750;
    // the chart's points
    let pts, mode = 'day';
    if (range === 'today') {
      mode = 'hour';
      const h = tehranHour(new Date().toISOString());
      pts = Array.from({ length: h + 1 }, (_, k) => String(k).padStart(2, '0'));
    } else {
      const end = range === 'custom' && /^\d{4}-\d{2}-\d{2}$/.test(to ?? '') ? (to > today ? today : to) : today;
      let start = range === 'custom' && /^\d{4}-\d{2}-\d{2}$/.test(from ?? '') ? from : addDays(end, -(Number(range) || 7) + 1);
      if (daysBetween(start, end) > 366) start = addDays(end, -366);
      if (start > end) start = end;
      pts = Array.from({ length: daysBetween(start, end) + 1 }, (_, k) => addDays(start, k));
    }
    const series = positionSeries(pts, mode);
    // the KPI lines always cover the last 30 days, the change compares with 7 days ago
    const s30 = positionSeries(Array.from({ length: 30 }, (_, k) => addDays(today, k - 29)), 'day');
    const now = s30.at(-1), ago = s30.at(-8) ?? s30[0];
    const pct = (a, b) => (b ? ((a - b) / Math.abs(b)) * 100 : a ? 100 : 0);

    const bal = call('GET', '/api/books/report/balance', SYS);
    const vault = call('GET', '/api/books/vault', SYS);
    const pnl = call('GET', '/api/books/report/pnl', SYS);
    const bars = vault.bars;
    const barG = B.r3(bars.reduce((s, b) => s + (b.weight && b.fineness ? (b.weight * b.fineness) / 750 : 0), 0));
    const meltG = vault.gold;
    const physG = B.r3(meltG + barG);
    const custodyG = vault.custody?.G750?.owedByShop ?? 0;
    const fxValue = Object.entries(vault.fx).reduce((s, [c, n]) => s + n * (lp.price[`FX:${c}`] ?? 0), 0);
    const goodsOwedToUs = bal.goldReceivable + Object.entries(vault.custody ?? {}).filter(([u]) => u.startsWith('COIN:')).reduce((s, [u, c]) => s + (c.owedToShop ?? 0) * (lp.price[u] ?? 0), 0);
    const goodsOwedByUs = -bal.goldPayable + Object.entries(vault.custody ?? {}).filter(([u]) => u.startsWith('COIN:')).reduce((s, [u, c]) => s + (c.owedByShop ?? 0) * (lp.price[u] ?? 0), 0);
    const pos = Object.fromEntries(pnl.positions.map((p) => [p.key, p]));
    const bookGold = pos.G750 && pos.G750.qty > 0 ? Math.round((pos.G750.cost / pos.G750.qty) * meltG) : null;
    const bookCoins = Object.keys(COIN_TYPES).reduce((s, k) => s + (vault.coins[k] > 0 ? (pos[`COIN:${k}`]?.qty > 0 ? (pos[`COIN:${k}`].cost / pos[`COIN:${k}`].qty) * vault.coins[k] : vault.coins[k] * (lp.price[`COIN:${k}`] ?? 0)) : 0), 0);
    const marketPhys = Math.round(physG * p750);
    const alloc = (phys, coins) => [
      { key: 'gold', label: 'طلای فیزیکی', value: Math.max(0, phys) },
      { key: 'coin', label: 'سکه', value: Math.max(0, Math.round(coins)) },
      { key: 'cash', label: 'نقد و بانک', value: Math.max(0, bal.cash + bal.bank) },
      { key: 'recv', label: 'مطالبات', value: Math.max(0, bal.receivable + goodsOwedToUs) },
      { key: 'other', label: 'سایر', value: Math.max(0, bal.stockValue + bal.chequesIn + Math.round(fxValue)) },
    ];
    const day = call('GET', '/api/books/daybook', SYS, { query: { day: today } });
    const byHour = Array.from({ length: 24 }, (_, h) => ({ h, in: 0, out: 0 }));
    let cin = 0, cout = 0;
    for (const e of day.entries) {
      if (e.status !== 'final') continue;
      const h = tehranHour(e.at);
      for (const p of e.payments) {
        if (!['cash', 'bank'].includes(B.payMethod(p.method)?.acct)) continue;
        if (p.dir === 'in') (cin += p.value), (byHour[h].in += p.value);
        else (cout += p.value), (byHour[h].out += p.value);
      }
    }
    let alerts = { high: 0, mid: 0 };
    try {
      const a = audit.run(SYS);
      alerts = { high: a.count.high, mid: a.count.mid, score: a.score };
    } catch {
      /* the dashboard still works */
    }
    let spark = [], pctM = null, sample = true;
    try {
      const b = market.board();
      sample = !!b.sample;
      const m = b.items.find((x) => x.id === 'mesghal');
      pctM = m?.pct ?? null;
      spark = (market.series(['mesghal'], addDays(today, -30)).series.mesghal ?? []).map((r) => r[4] * 10);
    } catch {
      /* no market data */
    }
    return {
      day: today, at: new Date().toISOString(), range, mode,
      price: { mazaneh: lp.mazaneh, p750, pct: pctM, spark, sample },
      kpi: {
        physical: { grams: physG, meltGrams: meltG, barGrams: barG, bars: bars.length, value: marketPhys, change: pct(now.physicalGold, ago.physicalGold), spark: s30.map((x) => x.physicalGold) },
        receivables: { amount: now.receivables, debtors: now.debtors, goods: goodsOwedToUs, change: pct(now.receivables, ago.receivables), spark: s30.map((x) => x.receivables) },
        liabilities: { amount: now.payables, creditors: now.creditors, goods: goodsOwedByUs, goldGrams: now.goldLiabilities, change: pct(now.payables, ago.payables), spark: s30.map((x) => x.payables) },
        net: { grams: now.netGoldPosition, value: Math.round(now.netGoldPosition * p750), change: pct(now.netGoldPosition, ago.netGoldPosition), spark: s30.map((x) => x.netGoldPosition) },
      },
      series, p750,
      aging: aging(today),
      allocation: {
        market: alloc(marketPhys, bal.coinsValue),
        book: alloc(bookGold != null ? bookGold + Math.round(barG * p750) : marketPhys, bookCoins),
        bookPartial: bookGold == null || pnl.missingCost,
        physical: [
          { key: 'melt', label: 'آب‌شده', grams: meltG, value: Math.round(meltG * p750) },
          { key: 'bar', label: 'شمش', grams: barG, count: bars.length, value: Math.round(barG * p750) },
          { key: 'made', label: 'مصنوعات', grams: bal.stockG, value: bal.stockValue },
          { key: 'custody', label: 'طلای امانی (از همین موجودی)', grams: custodyG, value: Math.round(custodyG * p750), inside: true },
        ],
      },
      recent: day.entries.slice(-12).reverse(),
      cash: { in: cin, out: cout, net: cin - cout, byHour },
      inventory: { meltG, barG, bars: bars.length, coins: vault.coins, madeG: bal.stockG, custodyG, fx: vault.fx },
      alerts,
      calendar: calendar(today, pnl.days),
    };
  }
  return { build, positionSeries, aging, calendar };
}
