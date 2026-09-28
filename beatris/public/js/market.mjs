// The Iranian gold market as the app sees it: the symbols a gold shop watches, how each is quoted, and a
// synthetic sample market for learning before a real price source is connected. The sample is internally
// consistent (mazaneh and coins follow the world ounce × the free-market dollar, coins carry a mean-reverting
// bubble) and is always labelled as sample data on screen. Shared by the browser, the server and the tests.
import { rng, MAZANEH_TO_G750 } from './calc.mjs';
import { impliedMesghal, coinIntrinsic, COIN_PURE_G } from './ta.mjs';

/** Prices are stored in toman (Iranian sources quote rials: ÷ 10), the world ounce in US dollars. */
export const SYMBOLS = [
  { id: 'mesghal', label: 'مظنه (مثقال آب‌شده ۷۰۵)', short: 'مظنه', unit: 'تومان', group: 'gold', feed: { tgju: 'mesghal', rial: true } },
  { id: 'mesghal_fwd', label: 'آب‌شده حواله (فردایی)', short: 'حواله', unit: 'تومان', group: 'gold', feed: { rial: true } },
  { id: 'geram18', label: 'طلای ۱۸ عیار (هر گرم)', short: 'گرم ۱۸', unit: 'تومان', group: 'gold', feed: { tgju: 'geram18', rial: true } },
  { id: 'geram24', label: 'طلای ۲۴ عیار (هر گرم)', short: 'گرم ۲۴', unit: 'تومان', group: 'gold', feed: { tgju: 'geram24', rial: true } },
  { id: 'sekee', label: 'سکه تمام امامی', short: 'امامی', unit: 'تومان', group: 'coin', pure: COIN_PURE_G.sekee, feed: { tgju: 'sekee', rial: true } },
  { id: 'sekeb', label: 'سکه تمام بهار آزادی', short: 'بهار', unit: 'تومان', group: 'coin', pure: COIN_PURE_G.sekeb, feed: { tgju: 'sekeb', rial: true } },
  { id: 'nim', label: 'نیم سکه', short: 'نیم', unit: 'تومان', group: 'coin', pure: COIN_PURE_G.nim, feed: { tgju: 'nim', rial: true } },
  { id: 'rob', label: 'ربع سکه', short: 'ربع', unit: 'تومان', group: 'coin', pure: COIN_PURE_G.rob, feed: { tgju: 'rob', rial: true } },
  { id: 'gerami', label: 'سکه گرمی', short: 'گرمی', unit: 'تومان', group: 'coin', pure: COIN_PURE_G.gerami, feed: { tgju: 'gerami', rial: true } },
  { id: 'usd', label: 'دلار آزاد', short: 'دلار', unit: 'تومان', group: 'fx', feed: { tgju: 'price_dollar_rl', rial: true } },
  { id: 'ons', label: 'انس جهانی طلا', short: 'انس', unit: 'دلار', group: 'world', decimals: 2, feed: { tgju: 'ons', rial: false } },
];
export const SYMBOL = Object.fromEntries(SYMBOLS.map((s) => [s.id, s]));
export const isSymbol = (id) => typeof id === 'string' && Object.hasOwn(SYMBOL, id);
export const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Round a quote the way the market shows it. */
export function roundQuote(id, v) {
  if (id === 'ons') return Math.round(v * 100) / 100;
  if (id === 'usd') return Math.round(v / 10) * 10;
  return Math.round(v / 1000) * 1000;
}

/** Check one daily bar; returns an error text or null. */
export function badBar(b) {
  if (!b || !DAY_RE.test(b.d) || Number.isNaN(Date.parse(b.d))) return 'تاریخ باید به شکل YYYY-MM-DD باشد.';
  for (const k of ['o', 'h', 'l', 'c']) if (!(Number.isFinite(b[k]) && b[k] > 0 && b[k] < 1e13)) return 'قیمت‌ها باید عدد مثبت باشند.';
  if (b.h < Math.max(b.o, b.c, b.l) || b.l > Math.min(b.o, b.c, b.h)) return 'سقف باید بزرگ‌ترین و کف کوچک‌ترین قیمت روز باشد.';
  return null;
}

/* ---------------- sample market ---------------- */
const ANCHOR = { usd: 235000, ons: 4200 }; // levels the sample ends at (toman per dollar, dollars per ounce)
// coin bubbles: a level, how strongly the coin follows the shared market mood, and its own noise
const BUBBLE = { sekee: [0.05, 1, 0.002], sekeb: [0.028, 1, 0.002], nim: [0.09, 1.5, 0.004], rob: [0.16, 2, 0.006], gerami: [0.28, 2.5, 0.01] };

/** Trading days (no Fridays) ending at endDay, oldest first. */
export function tradingDays(endDay, n) {
  const out = [];
  for (let t = Date.parse(`${endDay}T00:00:00Z`); out.length < n; t -= 86400000) {
    const d = new Date(t);
    if (d.getUTCDay() !== 5) out.push(d.toISOString().slice(0, 10));
  }
  return out.reverse();
}

/** A consistent synthetic market: { symbolId: [{ d, o, h, l, c }] }, deterministic for a given end day. */
export function sampleMarket(endDay, n = 780) {
  const days = tradingDays(endDay, n);
  const r = rng(1405);
  const gauss = () => {
    let u = 0;
    for (let k = 0; k < 6; k++) u += r();
    return (u - 3) / Math.SQRT1_2;
  };
  const lu = [], lo = [];
  let u = 0, o = 0;
  for (let i = 0; i < n; i++) {
    const jump = r() < 0.012 ? (r() < 0.62 ? 1 : -1) * 0.06 * r() : 0; // the free dollar moves in jumps
    u += Math.log(1.3) / 260 + 0.009 * gauss() + jump;
    o += Math.log(1.14) / 260 + 0.0085 * gauss();
    lu.push(u);
    lo.push(o);
  }
  const usd = lu.map((v) => ANCHOR.usd * Math.exp(v - u));
  const ons = lo.map((v) => ANCHOR.ons * Math.exp(v - o));
  const ou = (mean, sigma, speed) => {
    let x = mean;
    return () => (x += speed * (mean - x) + sigma * gauss());
  };
  const prem = ou(0.004, 0.0025, 0.12);
  const mood = ou(0, 0.005, 0.04);
  const own = Object.fromEntries(Object.entries(BUBBLE).map(([k, [, , s]]) => [k, ou(0, s, 0.1)]));
  const close = { mesghal: [], mesghal_fwd: [], geram18: [], geram24: [], usd, ons, sekee: [], sekeb: [], nim: [], rob: [], gerami: [] };
  for (let i = 0; i < n; i++) {
    const maz = impliedMesghal(ons[i], usd[i]) * (1 + prem());
    close.mesghal.push(maz);
    close.mesghal_fwd.push(maz * 1.004); // transfer (فردایی) usually trades a little above cash
    close.geram18.push(maz / MAZANEH_TO_G750);
    close.geram24.push((maz / MAZANEH_TO_G750) * (1000 / 750));
    const m = mood();
    for (const [k, [level, beta]] of Object.entries(BUBBLE)) close[k].push(coinIntrinsic(COIN_PURE_G[k], ons[i], usd[i]) * (1 + level + beta * m + own[k]()));
  }
  const out = {};
  for (const s of SYMBOLS) {
    const c = close[s.id], vol = s.id === 'ons' ? 0.004 : 0.005;
    out[s.id] = days.map((d, i) => {
      const cl = roundQuote(s.id, c[i]);
      const op = roundQuote(s.id, i ? c[i - 1] * (1 + 0.0015 * gauss()) : c[i]);
      const h = roundQuote(s.id, Math.max(op, cl) * (1 + Math.abs(vol * gauss())));
      const l = roundQuote(s.id, Math.min(op, cl) * (1 - Math.abs(vol * gauss())));
      return { d, o: op, h: Math.max(h, op, cl), l: Math.min(l, op, cl), c: cl };
    });
  }
  return out;
}
