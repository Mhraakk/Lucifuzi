// Strategy backtest (spec 0001 #7 #17) on daily bars, shared by the server, MCP and the browser. Long-only, honest by
// construction: a signal seen on a day's close is executed at the NEXT day's open (no look-ahead), every entry and
// exit pays the fee, and the result is compared with simply holding. Teaching tool, not advice.
import { sma, rsi } from './ta.mjs';

export const STRATEGIES = {
  sma: { label: 'تقاطع میانگین متحرک', params: { fast: 10, slow: 30 } },
  rsi: { label: 'RSI اشباع خرید و فروش', params: { n: 14, lo: 30, hi: 70 } },
};

/** bars: [{d, o, h, l, c}] oldest first. Returns trades, equity and summary metrics (fractions, not percents). */
export function backtest(bars, { strategy = 'sma', fee = 0.002, ...p } = {}) {
  if (!STRATEGIES[strategy]) throw new Error('راهبرد ناشناخته است.');
  const P = { ...STRATEGIES[strategy].params, ...Object.fromEntries(Object.entries(p).filter(([, v]) => Number.isFinite(v))) };
  const c = bars.map((b) => b.c);
  const o = bars.map((b) => (Number.isFinite(b.o) && b.o > 0 ? b.o : b.c));
  // want[i]: after day i's close, should we hold?
  const want = new Array(bars.length).fill(null);
  if (strategy === 'sma') {
    if (!(P.fast >= 1 && P.slow > P.fast)) throw new Error('میانگین کند باید از تند بلندتر باشد.');
    const f = sma(c, P.fast), s = sma(c, P.slow);
    for (let i = 0; i < c.length; i++) if (Number.isFinite(f[i]) && Number.isFinite(s[i])) want[i] = f[i] > s[i];
  } else {
    const r = rsi(c, P.n);
    let hold = false;
    for (let i = 0; i < c.length; i++) {
      if (!Number.isFinite(r[i])) continue;
      if (!hold && r[i] < P.lo) hold = true;
      else if (hold && r[i] > P.hi) hold = false;
      want[i] = hold;
    }
  }
  let cash = 1, units = 0, entry = null;
  const trades = [];
  const equity = [];
  for (let i = 0; i < bars.length; i++) {
    const sig = i > 0 ? want[i - 1] : null; // decided yesterday, executed at today's open
    if (sig === true && units === 0) {
      units = (cash * (1 - fee)) / o[i];
      cash = 0;
      entry = { d: bars[i].d, price: o[i] };
    } else if (sig === false && units > 0) {
      cash = units * o[i] * (1 - fee);
      trades.push({ in: entry.d, out: bars[i].d, buy: entry.price, sell: o[i], ret: (o[i] * (1 - fee) * (1 - fee)) / entry.price - 1 });
      units = 0;
      entry = null;
    }
    equity.push(cash + units * c[i]);
  }
  if (units > 0 && bars.length) trades.push({ in: entry.d, out: null, buy: entry.price, sell: c.at(-1), ret: (c.at(-1) * (1 - fee)) / entry.price - 1, open: true });
  let peak = -Infinity, maxDD = 0;
  for (const e of equity) {
    peak = Math.max(peak, e);
    maxDD = Math.max(maxDD, 1 - e / peak);
  }
  const closed = trades.filter((t) => !t.open);
  return {
    strategy,
    label: STRATEGIES[strategy].label,
    params: P,
    fee,
    days: bars.length,
    totalReturn: equity.length ? equity.at(-1) - 1 : 0,
    holdReturn: bars.length ? c.at(-1) / o[0] - 1 : 0,
    maxDrawdown: maxDD,
    trades: trades.length,
    winRate: closed.length ? closed.filter((t) => t.ret > 0).length / closed.length : null,
    exposure: bars.length ? want.filter(Boolean).length / bars.length : 0,
    list: trades.slice(-50),
    equity: equity.map((e, i) => [bars[i].d, Math.round(e * 10000) / 10000]),
  };
}
