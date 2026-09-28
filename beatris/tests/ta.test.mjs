import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../public/js/ta.mjs';

const near = (a, b, eps, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} ${a} ≉ ${b}`);
const day = (i) => new Date(Date.UTC(2024, 0, 1) + i * 86400000).toISOString().slice(0, 10);
const barsOf = (closes, spread = 0) => closes.map((c, i) => ({ d: day(i), o: i ? closes[i - 1] : c, h: Math.max(c, i ? closes[i - 1] : c) + spread, l: Math.min(c, i ? closes[i - 1] : c) - spread, c }));

test('میانگین‌ها: ساده، نمایی (بذر = میانگین ساده) و وزنی', () => {
  const x = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  assert.deepEqual(T.sma(x, 3).slice(2), [2, 3, 4, 5, 6, 7, 8, 9]);
  assert.ok(Number.isNaN(T.sma(x, 3)[1]));
  const e = T.ema([1, 2, 3, 4, 5], 3);
  assert.deepEqual(e.slice(2), [2, 3, 4]);
  near(T.wma([1, 2, 3], 3)[2], (1 + 4 + 9) / 6, 1e-12);
  // a gap inside an indicator series does not poison the rest
  const g = T.ema([1, 2, 3, NaN, 5, 6], 3);
  assert.ok(Number.isFinite(g.at(-1)));
});

test('RSI وایلدر: مثال مرجع StockCharts', () => {
  const c = [44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28, 46.0, 46.03, 46.41, 46.22, 45.64, 46.21, 46.25, 45.71, 46.45, 45.78, 45.35, 44.03, 44.18, 44.22, 44.57, 43.42, 42.66, 43.13];
  const r = T.rsi(c, 14);
  assert.ok(Number.isNaN(r[13]));
  const want = [70.53, 66.32, 66.55, 69.41, 66.36, 57.97, 62.93, 63.26, 56.06, 62.38, 54.71, 50.42, 39.99, 41.46, 41.87, 45.46, 37.3, 33.08, 37.77];
  // the published table rounds its first averages (0.24 / 0.10); exact arithmetic stays within 0.07 of it
  want.forEach((w, k) => near(r[14 + k], w, 0.08, `RSI[${14 + k}]`));
  near(r[14], 100 - 100 / (1 + 3.34 / 1.4), 1e-9); // exact: gains 3.34, losses 1.40 over the first 14 changes
});

test('MACD روی شیب ثابت به تأخیر نظری (۲۶−۱۲)÷۲ = ۷ می‌رسد؛ هیستوگرام صفر', () => {
  const c = Array.from({ length: 400 }, (_, i) => 100 + i);
  const m = T.macd(c);
  near(m.line.at(-1), 7, 1e-6);
  near(m.hist.at(-1), 0, 1e-6);
});

test('بولینگر، ATR، استوکاستیک، ویلیامز و CCI در حالت‌های مرزی', () => {
  const flat = Array(30).fill(100);
  const b = T.bollinger(flat);
  assert.equal(b.upper.at(-1), 100);
  assert.equal(b.width.at(-1), 0);
  const x = Array.from({ length: 40 }, (_, i) => 100 + (i % 2 ? 2 : -2));
  const bb = T.bollinger(x, 20, 2);
  near(bb.upper.at(-1) - bb.lower.at(-1), 4 * 2, 1e-9); // σ = 2
  const bars = Array.from({ length: 40 }, (_, i) => ({ d: day(i), o: 100, h: 101, l: 99, c: 100 }));
  near(T.atr(bars, 14).at(-1), 2, 1e-9);
  const up = barsOf(Array.from({ length: 30 }, (_, i) => 100 + i));
  near(T.stochastic(up).k.at(-1), 100, 1e-9);
  near(T.williamsR(up).at(-1), 0, 1e-9);
  assert.ok(T.cci(up).at(-1) > 100);
  near(T.roc([100, 110], 1)[1], 10, 1e-9);
});

test('ADX، سوپرترند و سار سهموی روند صعودی و نزولی را درست می‌خوانند', () => {
  const rising = barsOf(Array.from({ length: 120 }, (_, i) => 100 * 1.01 ** i), 0.2);
  const falling = barsOf(Array.from({ length: 120 }, (_, i) => 100 * 0.99 ** i), 0.2);
  const a = T.adx(rising);
  assert.ok(a.pdi.at(-1) > a.mdi.at(-1) && a.adx.at(-1) > 25);
  assert.equal(T.supertrend(rising).dir.at(-1), 1);
  assert.equal(T.supertrend(falling).dir.at(-1), -1);
  const p = T.psar(rising);
  assert.equal(p.dir.at(-1), 1);
  assert.ok(p.sar.at(-1) < rising.at(-1).l);
  assert.equal(T.psar(falling).dir.at(-1), -1);
  const ich = T.ichimoku(rising);
  assert.equal(ich.spanA.length, rising.length + 26);
  assert.ok(ich.tenkan.at(-1) > ich.kijun.at(-1));
});

test('نقاط پیوت کلاسیک، فیبوناچی و کاماریلا', () => {
  const p = T.pivots(110, 90, 100);
  assert.deepEqual([p.P, p.R1, p.S1, p.R2, p.S2, p.R3, p.S3], [100, 110, 90, 120, 80, 130, 70]);
  const f = T.pivots(110, 90, 100, 'fib');
  near(f.R1, 107.64, 1e-9);
  const k = T.pivots(110, 90, 100, 'camarilla');
  near(k.R3, 105.5, 1e-9);
  const lv = T.fibLevels(100, 200);
  near(lv.retrace.find((x) => x.r === 0.618).price, 138.2, 1e-9);
  near(lv.extend.find((x) => x.r === 1.618).price, 261.8, 1e-9);
});

test('هیکن‌آشی، رنکو و سه‌خط شکست', () => {
  const ha = T.heikinAshi([{ d: day(0), o: 10, h: 12, l: 9, c: 11 }, { d: day(1), o: 11, h: 13, l: 10, c: 12 }]);
  near(ha[0].c, 10.5, 1e-12);
  near(ha[1].o, (ha[0].o + ha[0].c) / 2, 1e-12);
  const r = T.renko(barsOf([100, 103, 106, 99, 95]), 2);
  assert.deepEqual(r.map((b) => [b.o, b.c]), [[100, 102], [102, 104], [104, 106], [104, 102], [102, 100], [100, 98], [98, 96]]);
  const lb = T.lineBreak(barsOf([10, 11, 12, 13, 12.5, 9.5]));
  assert.deepEqual(lb.map((x) => [x.o, x.c, x.up]), [[10, 11, true], [11, 12, true], [12, 13, true], [12, 9.5, false]]);
});

// swing prices of a textbook impulse: w2 = 0.618 w1, w3 = 1.618 w1, w4 = 0.382 w3, w5 = w1
const IMPULSE = [100, 110, 103.82, 120, 113.82, 123.82, 116];
function barsThrough(points, steps = 8) {
  const c = [];
  for (let k = 0; k < points.length - 1; k++) for (let s = 0; s < steps; s++) c.push(points[k] + ((points[k + 1] - points[k]) * s) / steps);
  c.push(points.at(-1));
  return c.map((v, i) => ({ d: day(i), o: v, h: v, l: v, c: v }));
}

test('زیگزاگ نقاط چرخش را با آستانه درصدی پیدا می‌کند', () => {
  const z = T.zigzag(barsThrough([100, 120, 105, 130, 110]), 5);
  assert.deepEqual(z.map((p) => [p.kind, p.price, p.confirmed]), [['L', 100, true], ['H', 120, true], ['L', 105, true], ['H', 130, true], ['L', 110, false]]);
});

test('الیوت: موج ایده‌آل همه قواعد را پاس می‌کند و نقض قاعده موج ۴ رد می‌شود', () => {
  const z = T.zigzag(barsThrough(IMPULSE), 3);
  assert.deepEqual(z.map((p) => p.price), IMPULSE);
  const five = T.elliott(z.slice(0, 6));
  const top = five[0];
  assert.equal(top.kind, 'impulse-done');
  assert.ok(top.valid && top.score >= 90, String(top.score));
  near(top.targets[2].price, 123.82 - 0.618 * 23.82, 1e-9);
  const w5 = T.elliott(z.slice(0, 5)).find((c) => c.kind === 'wave5');
  assert.ok(w5.valid);
  near(w5.targets.find((t) => t.label === 'موج ۵ = موج ۱').price, 123.82, 1e-9);
  // wave 4 dips into wave 1 → the impulse count is invalid
  const bad = [100, 110, 103.82, 120, 108, 125].map((price, i) => ({ i, price, kind: i % 2 ? 'H' : 'L', confirmed: true }));
  const c = T.elliott(bad).find((x) => x.kind === 'impulse-done');
  assert.equal(c.valid, false);
  assert.equal(c.rules.find((r) => r.id === 'w4').ok, false);
  // a down impulse is the mirror image
  const down = IMPULSE.slice(0, 6).map((v, i) => ({ i, price: 300 - v, kind: i % 2 ? 'L' : 'H', confirmed: true }));
  const dc = T.elliott(down).find((x) => x.kind === 'impulse-done');
  assert.ok(dc.valid && !dc.up);
  near(dc.targets[2].price, 300 - 123.82 + 0.618 * 23.82, 1e-9);
});

test('آمار: بازده، افت از سقف، نوسان، همبستگی، هیستوگرام و فصلی', () => {
  const c = [100, 120, 90, 110];
  assert.deepEqual(T.drawdown(c), [0, 0, -0.25, 110 / 120 - 1]);
  assert.equal(T.maxDrawdown(c), -0.25);
  const g = Array.from({ length: 60 }, (_, i) => 100 * 1.01 ** i);
  near(T.histVol(g, 20).at(-1), 0, 1e-6);
  const a = barsOf(Array.from({ length: 50 }, (_, i) => 100 + Math.sin(i) * 5 + i));
  const inv = a.map((b) => ({ ...b, c: 1000 / b.c }));
  const m = T.corrMatrix({ a, b: a, inv });
  near(m.m[0][1], 1, 1e-12);
  assert.ok(m.m[0][2] < -0.99);
  const h = T.histogram([1, 2, 2, 3, 3, 3], 3);
  assert.deepEqual(h.counts, [1, 2, 3]);
  // two Jalali years of +1 %/day in Farvardin only
  const bars = [];
  let p = 100;
  for (let t = Date.UTC(2023, 2, 1); t < Date.UTC(2025, 2, 1); t += 86400000) {
    const d = new Date(t).toISOString().slice(0, 10);
    if (T.jalaliOf(d)[1] === 1) p *= 1.01;
    bars.push({ d, o: p, h: p, l: p, c: p });
  }
  const s = T.seasonality(bars);
  assert.ok(s.byMonth[0].avg > 0.3 && s.byMonth[0].up === 1);
  assert.equal(s.byMonth[5].avg, 0);
  assert.ok(T.perYear(bars) >= 360 && T.perYear(bars) <= 370);
});

test('تقویم شمسی و روابط بازار ایران (مظنه ضمنی، دلار مستتر، حباب سکه)', () => {
  assert.deepEqual(T.jalaliOf('2026-09-27'), [1405, 7, 5]);
  assert.deepEqual(T.jalaliOf('2025-03-21'), [1404, 1, 1]);
  const ons = 4213.22, usd = 235000;
  const maz = T.impliedMesghal(ons, usd);
  near(maz, 103.42e6, 0.01e6);
  near(T.impliedUsdMesghal(maz, ons), usd, 1e-6);
  const v = T.coinIntrinsic(T.COIN_PURE_G.sekee, ons, usd);
  near(v, 233.0e6, 0.1e6);
  near(T.impliedUsdCoin(v, ons, T.COIN_PURE_G.sekee), usd, 1e-6);
  near(T.bubble(240.505e6, v), 240.505 / (v / 1e6) - 1, 1e-12);
  // a coin priced exactly at its gold in mazaneh has no domestic bubble
  near(T.bubble(T.coinDomestic(T.COIN_PURE_G.sekee, maz), T.coinIntrinsic(T.COIN_PURE_G.sekee, ons, usd)), 0, 1e-12);
});

test('خوانش بازار: سطوح مرتب، خرید صبورانه زیر و فروش صبورانه بالای قیمت، روند درست', () => {
  const up = barsOf(Array.from({ length: 300 }, (_, i) => 100 * 1.004 ** i * (1 + 0.03 * Math.sin(i / 6))), 0.3);
  const r = T.marketRead(up);
  assert.ok(r.pivots.S2 < r.pivots.S1 && r.pivots.S1 < r.pivots.R1 && r.pivots.R1 < r.pivots.R2);
  assert.ok(r.bid <= r.close && r.ask >= r.close && r.range.lo < r.close && r.range.hi > r.close);
  assert.ok(r.support.every((p) => p < r.close) && r.resist.every((p) => p > r.close));
  assert.ok(r.swingPct >= 1.5 && r.swingPct <= 12);
  const steady = barsOf(Array.from({ length: 300 }, (_, i) => 100 * 1.006 ** i), 0.2);
  assert.equal(T.marketRead(steady).trend, 'up');
  const fall = barsOf(Array.from({ length: 300 }, (_, i) => 100 * 0.994 ** i), 0.2);
  const f = T.marketRead(fall);
  assert.equal(f.trend, 'down');
  assert.equal(f.momentum, 'oversold');
  assert.equal(T.marketRead(up.slice(0, 40)), null);
});
