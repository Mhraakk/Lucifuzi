// The Elliott studio's engine (spec 0003): one pure function turns daily bars into everything the studio draws —
// a large-degree count ((I)…(V) or (A)(B)(C)), its small-degree sub-waves (1…5, A B C) where they keep the rules,
// Fibonacci retracements of the counted move, the wave channel, support and target zones, a primary and an
// alternative scenario as a typed decision (spec 0002), and plain notes. Nothing is invented: every level comes
// from the same price series, and without a valid count no scenario is drawn.
import * as T from './ta.mjs';
import { typedChoice } from './typed.mjs';

const fin = Number.isFinite;
const r1 = (x) => Math.round(x * 10) / 10;
const DAY = 86400000;

/** Weekly (Saturday-based, as in Iran) or Jalali-monthly bars from daily ones; `d` is the last day of each bar. */
export function resample(bars, tf = 'D') {
  if (tf === 'D') return bars;
  const key = tf === 'W' ? (d) => Math.floor((Date.parse(d) / DAY - 2) / 7) : (d) => T.jalaliOf(d).slice(0, 2).join('-');
  const out = [];
  let k = null;
  for (const b of bars) {
    const kk = key(b.d);
    if (kk !== k) {
      out.push({ d: b.d, o: b.o, h: b.h, l: b.l, c: b.c });
      k = kk;
    } else {
      const x = out.at(-1);
      x.d = b.d;
      x.h = Math.max(x.h, b.h);
      x.l = Math.min(x.l, b.l);
      x.c = b.c;
    }
  }
  return out;
}

const KIND_BONUS = { 'impulse-done': 12, wave5: 10, 'abc-done': 6, wave3: 0 };
/** The large degree: the best valid count over a ladder of zigzag thresholds. */
function majorCount(bars, base) {
  let best = null;
  for (const k of [2.5, 3.5, 1.8, 5, 7]) {
    const pct = r1(base * k);
    const zz = T.zigzag(bars, pct);
    if (zz.length < 3) continue;
    for (const c of T.elliott(zz)) {
      if (!c.valid) continue;
      const span = (bars.length - c.points[0].i) / bars.length;
      const rank = c.score + KIND_BONUS[c.kind] + 10 * span;
      if (!best || rank > best.rank) best = { ...c, pct, rank };
    }
  }
  return best;
}

const MAJOR_LABELS = { 'impulse-done': ['', 'I', 'II', 'III', 'IV', 'V'], wave5: ['', 'I', 'II', 'III', 'IV'], wave3: ['', 'I', 'II'], 'abc-done': ['', 'A', 'B', 'C'] };
// which legs of a pattern are motive (five sub-waves) and which corrective (three)
const MOTIVE = { 'impulse-done': [1, 0, 1, 0, 1], wave5: [1, 0, 1, 0], wave3: [1, 0], 'abc-done': [1, 0, 1] };

/**
 * Split the leg a→b into 5 (motive) or 3 (corrective) sub-waves: the smallest zigzag threshold that leaves exactly
 * the right number of turning points inside the leg, kept only if that sub-count passes the Elliott rules.
 */
export function subdivide(bars, a, b, motive, lo, hi) {
  const want = motive ? 4 : 2;
  if (b.i - a.i < want * 2 + 2) return null;
  const seg = bars.slice(a.i, b.i + 1);
  const up = b.price > a.price;
  for (let pct = lo; pct <= hi; pct *= 1.2) {
    let inner = T.zigzag(seg, pct).map((p) => ({ ...p, i: p.i + a.i, confirmed: true })).filter((p) => p.i > a.i && p.i < b.i);
    while (inner.length && inner[0].kind === a.kind) inner.shift();
    while (inner.length && inner.at(-1).kind === b.kind) inner.pop();
    // a sub-wave may not reach beyond the leg's own ends
    if (inner.some((p) => (up ? p.price > b.price || p.price < a.price : p.price < b.price || p.price > a.price))) continue;
    if (inner.length < want) return null;
    if (inner.length > want) continue;
    const pts = [a, ...inner, b].map((p) => ({ i: p.i, d: p.d, price: p.price, kind: p.kind, confirmed: true }));
    const kind = motive ? 'impulse-done' : 'abc-done';
    const c = T.elliott(pts).find((x) => x.kind === kind && x.valid);
    if (!c) return null;
    const labels = motive ? ['', '1', '2', '3', '4', '5'] : ['', 'A', 'B', 'C'];
    return { motive, score: c.score, pct: r1(pct), points: pts.map((p, k) => ({ ...p, label: labels[k] })) };
  }
  return null;
}

/** Fibonacci retracements of the counted move: from its start to its extreme in the count's direction. */
function fibOf(c) {
  const from = c.points[0];
  const to = c.points.reduce((m, p) => (c.up ? (p.price > m.price ? p : m) : p.price < m.price ? p : m), from);
  const d = to.price - from.price;
  return { from: { i: from.i, price: from.price }, to: { i: to.i, price: to.price }, levels: T.FIB_RETRACE.map((r) => ({ r, price: to.price - r * d })) };
}

/** The wave channel: a base line through two corrective ends, a parallel through the motive end between them. */
function channelOf(c) {
  const p = c.points;
  const pick = c.kind === 'impulse-done' || c.kind === 'wave5' ? [2, 4, 3] : c.kind === 'wave3' ? [0, 2, 1] : [0, 2, 1];
  const [a, b, m] = pick.map((k) => p[k]);
  if (!a || !b || !m || b.i === a.i) return null;
  const at = (i) => a.price + ((b.price - a.price) * (i - a.i)) / (b.i - a.i);
  return { a: { i: a.i, price: a.price }, b: { i: b.i, price: b.price }, off: m.price - at(m.i), from: p[0].i };
}

const fmtR = (r) => String(r).replace('.', '٫').replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);
const bandOf = (a, b) => ({ lo: Math.min(a, b), hi: Math.max(a, b) });

/** The two scenarios the count implies, each a path into the future, a target band and a trigger. */
function scenariosOf(c, bars, fib, ctx) {
  const n = bars.length, lastI = n - 1, cl = bars[lastI].c;
  const p = c.points.map((x) => x.price);
  const legs = c.points.slice(1).map((x, k) => x.i - c.points[k].i);
  const L = Math.max(8, Math.round(legs.reduce((a, b) => a + b, 0) / legs.length));
  const s = c.up ? 1 : -1;
  const lvl = (r) => fib.levels.find((x) => x.r === r).price;
  // the retracement band still ahead of the price in direction dir (−1 = below)
  const zoneAhead = (dir, pair = 2) => {
    const ahead = fib.levels.filter((x) => (dir < 0 ? x.price < cl : x.price > cl) && x.r > 0).sort((a, b) => Math.abs(a.price - cl) - Math.abs(b.price - cl));
    if (!ahead.length) return null;
    const two = ahead.slice(0, pair);
    return { ...bandOf(two[0].price, two.at(-1).price), levels: two.map((x) => x.r) };
  };
  const walk = (target, { pull = 0.38 } = {}) => {
    const mid = cl + (target - cl) * 0.62, back = mid - (mid - cl) * pull;
    return [{ i: lastI, price: cl }, { i: lastI + Math.round(L * 0.45), price: mid }, { i: lastI + Math.round(L * 0.7), price: back, tag: true }, { i: lastI + L, price: target }];
  };
  const abcPath = (A, B, C) => [{ i: lastI, price: cl }, { i: lastI + Math.round(L * 0.45), price: A, tag: 'A' }, { i: lastI + Math.round(L * 0.7), price: B, tag: 'B' }, { i: lastI + L, price: C, tag: 'C' }];
  let primary, alternative;
  if (c.kind === 'impulse-done') {
    const z = zoneAhead(-s) ?? bandOf(lvl(0.382), lvl(0.618));
    const A = (z.hi + z.lo) / 2, C = s > 0 ? z.lo : z.hi;
    primary = {
      title: s > 0 ? 'اصلاح A-B-C پس از پنج موج صعودی' : 'برگشت A-B-C پس از پنج موج نزولی',
      dir: -s, band: z, path: abcPath(A, A + (cl - A) * 0.5, C),
      lines: [`پایان موج (V) در ${ctx.f(p[5])}`, `اصلاح تا محدوده ${ctx.f(z.lo)} – ${ctx.f(z.hi)} (فیبوناچی ${z.levels ? z.levels.map(fmtR).join(' و ') : '۰٫۳۸۲ تا ۰٫۶۱۸'})`, `تأیید: ${s > 0 ? 'شکست کف' : 'عبور از سقف'} موج (IV) در ${ctx.f(p[4])}`],
      trigger: p[4],
    };
    const ext = p[5] + s * 0.618 * Math.abs(p[5] - p[4]);
    alternative = {
      title: 'امتداد موج (V)', dir: s, band: bandOf(p[5], ext), path: walk(ext),
      lines: [`${s > 0 ? 'عبور از سقف' : 'شکست کف'} ${ctx.f(p[5])} یعنی موج (V) تمام نشده`, `هدف امتداد تا ${ctx.f(ext)} (۰٫۶۱۸ × موج (IV)→(V))`],
      trigger: p[5],
    };
  } else if (c.kind === 'wave5') {
    const ts = c.targets.map((t) => t.price).filter(fin);
    const band = bandOf(Math.min(...ts), Math.max(...ts));
    const T5 = s > 0 ? band.hi : band.lo;
    primary = {
      title: `شروع موج (V) ${s > 0 ? 'صعودی' : 'نزولی'}`, dir: s, band, path: walk(T5),
      lines: [`تکمیل موج (IV) در ${ctx.f(p[4])}`, `هدف موج (V): ${ctx.f(band.lo)} – ${ctx.f(band.hi)}`, `${s > 0 ? 'عبور از سقف' : 'شکست کف'} موج (III) در ${ctx.f(p[3])} تأیید است`],
      trigger: p[3],
    };
    const deep = bandOf(lvl(0.618), lvl(0.786));
    alternative = {
      title: 'اصلاح عمیق‌تر (شمارش باطل)', dir: -s, band: deep, path: abcPath((cl + (s > 0 ? deep.hi : deep.lo)) / 2, cl - (cl - (s > 0 ? deep.hi : deep.lo)) * 0.25, s > 0 ? deep.lo : deep.hi),
      lines: [`${s > 0 ? 'شکست' : 'عبور از'} ${ctx.f(c.invalid)} (سقف/کف موج (I)) شمارش را باطل می‌کند`, `اصلاح تا ${ctx.f(deep.lo)} – ${ctx.f(deep.hi)} (فیبوناچی ۰٫۶۱۸ تا ۰٫۷۸۶)`],
      trigger: c.invalid,
    };
  } else if (c.kind === 'wave3') {
    const ts = c.targets.map((t) => t.price).filter(fin).slice(0, 2);
    const band = bandOf(ts[0], ts[1]);
    primary = {
      title: `موج (III) ${s > 0 ? 'صعودی' : 'نزولی'} — معمولاً قوی‌ترین`, dir: s, band, path: walk(s > 0 ? band.hi : band.lo),
      lines: [`تکمیل موج (II) در ${ctx.f(p[2])}`, `هدف موج (III): ${ctx.f(band.lo)} – ${ctx.f(band.hi)} (۱ تا ۱٫۶۱۸ × موج (I))`, `${s > 0 ? 'عبور از سقف' : 'شکست کف'} موج (I) در ${ctx.f(p[1])} تأیید است`],
      trigger: p[1],
    };
    const beyond = p[0] - s * 0.382 * Math.abs(p[1] - p[0]);
    alternative = {
      title: 'شکست آغاز روند', dir: -s, band: bandOf(p[0], beyond), path: abcPath((cl + p[0]) / 2, cl - (cl - p[0]) * 0.2, beyond),
      lines: [`${s > 0 ? 'شکست کف' : 'عبور از سقف'} ${ctx.f(p[0])} یعنی این دو موج آغاز روند نبوده‌اند`, `ادامه تا حوالی ${ctx.f(beyond)}`],
      trigger: p[0],
    };
  } else {
    // a finished A-B-C against the prior move; c.up is the direction of the correction itself
    const ts = c.targets.map((t) => t.price).filter(fin);
    const band = bandOf(ts[1], ts[2]);
    primary = {
      title: 'پایان اصلاح و آغاز روند تازه', dir: -s, band, path: walk(s > 0 ? band.lo : band.hi),
      lines: [`تکمیل موج (C) در ${ctx.f(p[3])}`, `برگشت تا ${ctx.f(band.lo)} – ${ctx.f(band.hi)} (۰٫۶۱۸ تا ۱ از کل اصلاح)`, `${s > 0 ? 'شکست کف' : 'عبور از سقف'} موج (B) در ${ctx.f(p[2])} تأیید است`],
      trigger: p[2],
    };
    const ext = p[2] + s * 1.618 * Math.abs(p[1] - p[0]);
    alternative = {
      title: 'امتداد موج (C)', dir: s, band: bandOf(p[3], ext), path: walk(ext, { pull: 0.3 }),
      lines: [`${s > 0 ? 'عبور از سقف' : 'شکست کف'} ${ctx.f(p[3])} یعنی اصلاح ادامه دارد`, `موج (C) = ۱٫۶۱۸ × (A) تا ${ctx.f(ext)}`],
      trigger: p[3],
    };
  }
  // the typed decision: count quality and three independent signals that agree with one path or the other
  const lastRsi = ctx.rsi.at(-1), hist = ctx.macd.hist.at(-1), e = ctx.ema55;
  const slope = fin(e.at(-1)) && fin(e.at(-11)) ? Math.sign(e.at(-1) - e.at(-11)) : NaN;
  let lp = 0.6 + 2.2 * (c.score / 100), la = 0.8, have = 1;
  const d = primary.dir;
  if (fin(slope)) {
    have++;
    slope === d ? (lp += 0.5) : (la += 0.5);
  }
  if (fin(lastRsi)) {
    have++;
    if ((d > 0 && lastRsi > 72) || (d < 0 && lastRsi < 28)) la += 0.45;
    else lp += 0.3;
  }
  if (fin(hist)) {
    have++;
    Math.sign(hist) === d ? (lp += 0.3) : (la += 0.3);
  }
  if (c.live) la += 0.2;
  const decision = typedChoice(['primary', 'alternative'], [lp, la], { coverage: have / 4 });
  return { decision, primary: { ...primary, p: decision.probabilities.primary }, alternative: { ...alternative, p: decision.probabilities.alternative }, horizon: L };
}

/**
 * Everything the studio draws, from daily (or resampled) bars. opts.degree scales the swing threshold
 * (0.7 = finer waves, 1.5 = coarser); opts.format prints prices in sentences.
 */
export function waveMap(bars, { degree = 1, format = (v) => String(Math.round(v)) } = {}) {
  const n = bars.length;
  if (n < 40) return { enough: false, n };
  const c = T.closes(bars);
  const base = r1(T.swingPct(bars) * degree);
  const rsi = T.rsi(c, 14), macd = T.macd(c), ema21 = T.ema(c, 21), ema55 = T.ema(c, 55), bb = T.bollinger(c, 20, 2);
  const last = bars[n - 1], prev = bars[n - 2];
  const stats = { d: last.d, last: last.c, chg: last.c - prev.c, chgPct: (last.c / prev.c - 1) * 100, hi: last.h, lo: last.l, hi52: Math.max(...bars.slice(-260).map((b) => b.h)), lo52: Math.min(...bars.slice(-260).map((b) => b.l)) };
  const major = majorCount(bars, base);
  const out = { enough: true, n, base, stats, rsi, macd, ema21, ema55, bb, major: null, minor: [], fib: null, channel: null, scenarios: null, zones: [], notes: [] };
  const atr = T.atr(bars, 14).at(-1);
  if (!major) {
    const zz = T.zigzag(bars, base * 2.5);
    if (zz.length >= 2) {
      const a = zz.at(-2), b = zz.at(-1);
      out.fib = { from: { i: a.i, price: a.price }, to: { i: b.i, price: b.price }, levels: T.fibLevels(a.price, b.price).retrace };
    }
    out.zigzag = zz;
    out.notes.push('در هیچ درجه‌ای شمارشی که همه قواعد الیوت را پاس کند پیدا نشد؛ بازار احتمالاً در یک اصلاح پیچیده (W-X-Y) است. سناریو ساخته نمی‌شود؛ فقط سطوح فیبوناچی آخرین نوسان نشان داده شده است.');
    return out;
  }
  const labels = MAJOR_LABELS[major.kind];
  out.major = { ...major, points: major.points.map((p, k) => ({ ...p, label: labels[k] })) };
  const lo = Math.max(1, base * 0.45), hi = major.pct * 0.8;
  MOTIVE[major.kind].forEach((m, k) => {
    const sub = subdivide(bars, major.points[k], major.points[k + 1], !!m, lo, hi);
    if (sub) out.minor.push({ leg: k, ...sub });
  });
  out.fib = fibOf(out.major);
  out.channel = channelOf(out.major);
  const f = format;
  out.scenarios = scenariosOf(out.major, bars, out.fib, { f, rsi, macd, ema55 });
  const pr = out.scenarios.primary, al = out.scenarios.alternative;
  // zones: where the primary path turns (support if it then rises, resistance if it falls) and the alternative's target
  const turn = pr.path[2]?.price;
  if (fin(turn) && fin(atr)) {
    const near = out.fib.levels.reduce((m, x) => (Math.abs(x.price - turn) < Math.abs(m.price - turn) ? x : m));
    out.zones.push({ kind: pr.dir > 0 ? 'support' : 'resist', lo: near.price - atr * 0.6, hi: near.price + atr * 0.6, from: major.points.at(-2).i, label: `${pr.dir > 0 ? 'حمایت' : 'مقاومت'} ${fmtR(near.r)}` });
  }
  out.zones.push({ kind: 'target', lo: al.band.lo, hi: al.band.hi, from: n - 1, label: 'هدف جایگزین' });
  // notes: the count's own rules and ratios, then what would prove it wrong
  for (const r of major.rules) out.notes.push(`${r.ok ? '✓' : '✗'} ${r.text}`);
  for (const g of major.guides) out.notes.push(`${g.label} = ${fmtR(Math.round(g.ratio * 1000) / 1000)} (معمول ${fmtR(g.lo)} تا ${fmtR(g.hi)})${g.ok ? '' : ' — دور از معمول'}`);
  out.notes.push(`ابطال شمارش: ${f(major.invalid)} — ${major.invalidText}`);
  if (major.live) out.notes.push('آخرین نقطه شمارش هنوز در حال شکل‌گیری است؛ تا برگشت به اندازه آستانه، قطعی نیست.');
  return out;
}

/** Circled and bracketed labels in standard Elliott notation. */
export const majorText = (label) => (label ? `(${label})` : '');
