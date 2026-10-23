// spec 0044, engine level: the pure modules driven with seeded random inputs, each output checked against an oracle
// that does not use the module it checks. REPEAT_N=20000 for a longer run; REPEAT_SEED picks the sequence.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as K from '../public/js/calc.mjs';
import * as B from '../public/js/books.mjs';
import * as TA from '../public/js/ta.mjs';
import { binaryPosterior, likelihoodRatios } from '../public/js/coins.mjs';
import { normalizePhone } from '../server/auth.mjs';

const N = Number(process.env.REPEAT_N ?? 1500);
let seed = Number(process.env.REPEAT_SEED ?? 44);
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
const pick = (a) => a[Math.floor(rnd() * a.length)];
const close = (got, want, what, rel = 1e-9) => {
  const ok = (Number.isNaN(want) && Number.isNaN(got)) || Math.abs(got - want) <= rel * Math.max(1, Math.abs(want));
  assert.ok(ok, `${what}: ${got} ≠ ${want}`);
};

/* ---------------- dates: the app's Jalali calendar against the browser's own ---------------- */
test('Jalali ↔ Gregorian: every day of 1300–1500 equals Intl’s Persian calendar, and converts back', () => {
  const icu = new Intl.DateTimeFormat('en-u-ca-persian-nu-latn', { timeZone: 'UTC', year: 'numeric', month: 'numeric', day: 'numeric' });
  const parts = (t) => {
    const p = Object.fromEntries(icu.formatToParts(t).map((x) => [x.type, x.value]));
    return [Number(p.year.replace(/\D/g, '')), Number(p.month), Number(p.day)];
  };
  const pad = (n) => String(n).padStart(2, '0');
  const FA = '۰۱۲۳۴۵۶۷۸۹';
  const faDigits = (s) => s.replace(/\d/g, (d) => FA[d]);
  let days = 0;
  for (let t = Date.UTC(1921, 2, 21); t <= Date.UTC(2122, 2, 20); t += 864e5) {
    const d = new Date(t);
    const g = [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()];
    const j = TA.toJalali(...g);
    assert.deepEqual(j, parts(d), `${g.join('-')}`);
    assert.deepEqual(TA.toGregorian(...j), g, `back from ${j.join('/')}`);
    if (days++ % 37 === 0) {
      // typed as people type it: Persian digits, either separator, with or without leading zeros
      const iso = `${g[0]}-${pad(g[1])}-${pad(g[2])}`;
      const typed = pick([`${j[0]}/${pad(j[1])}/${pad(j[2])}`, `${j[0]}-${j[1]}-${j[2]}`, faDigits(`${j[0]}/${j[1]}/${j[2]}`)]);
      assert.equal(TA.isoDay(typed), iso, typed);
    }
  }
  assert.ok(days > 73000);
  // the 30th of Esfand exists only in a leap year, exactly as the browser's calendar says
  for (let jy = 1300; jy <= 1499; jy++) {
    const leap = parts(new Date(Date.UTC(...TA.toGregorian(jy, 12, 29).map((v, i) => (i === 1 ? v - 1 : v))) + 864e5))[2] === 30;
    assert.equal(TA.isoDay(`${jy}/12/30`) !== null, leap, `${jy}/12/30`);
  }
  for (const bad of ['1403/13/01', '1403/00/10', '1403/07/32', '1404/07/31', '2026-02-30', 'abc', '']) assert.equal(TA.isoDay(bad), null, bad);
});

/* ---------------- Persian numbers: what is shown is read back to the same number ---------------- */
test('numbers typed or shown in Persian, Arabic or Latin digits read back to the same value', () => {
  const FA = '۰۱۲۳۴۵۶۷۸۹', AR = '٠١٢٣٤٥٦٧٨٩';
  const group = (s) => s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  for (let i = 0; i < N * 4; i++) {
    const neg = rnd() < 0.2;
    const whole = String(int(0, 10 ** int(1, 12)));
    const frac = pick(['', '', String(int(0, 999)).padStart(3, '0').replace(/0+$/, '')]);
    const latn = `${neg ? '-' : ''}${whole}${frac ? `.${frac}` : ''}`;
    const want = Number(latn);
    const shapes = [
      latn,
      `${neg ? '-' : ''}${group(whole)}${frac ? `.${frac}` : ''}`,
      `${neg ? '−' : ''}${group(whole).replace(/,/g, '٬').replace(/\d/g, (d) => FA[d])}${frac ? `٫${frac.replace(/\d/g, (d) => FA[d])}` : ''}`,
      `${neg ? '-' : ''}${whole.replace(/\d/g, (d) => AR[d])}${frac ? `.${frac.replace(/\d/g, (d) => AR[d])}` : ''}`,
      ` ${group(whole).replace(/,/g, '،')}${frac ? `.${frac}` : ''} `.replace(/^ /, neg ? ' -' : ' '),
    ];
    for (const s of shapes) {
      assert.equal(B.num(s), want, `books num ${JSON.stringify(s)}`);
      if (!s.includes('،')) assert.equal(K.parseNum(s), want, `calc parseNum ${JSON.stringify(s)}`);
    }
    // the app's own displays read back
    const rial = (neg ? -1 : 1) * int(0, 1e13);
    assert.equal(B.num(B.fmtMoney(rial, 'rial', { unit: false })), rial, `fmtMoney ${rial}`);
    assert.equal(Math.round(B.num(B.fmtRial(rial, { unit: false })) * 10), rial, `fmtRial ${rial}`);
    const g = (neg ? -1 : 1) * int(0, 1e9) / 1000;
    assert.equal(B.num(B.fmtG(g)), g, `fmtG ${g}`);
  }
  for (const bad of ['', '۱۲a', '1.2.3', '--5', '١٢٫٣٫٤']) assert.ok(Number.isNaN(B.num(bad)), `refused: ${bad}`);
});

/* ---------------- amounts in words (the invoice's «مبلغ به حروف») ---------------- */
test('an amount in words reads back to the same amount', () => {
  const ONES = { یک: 1, دو: 2, سه: 3, چهار: 4, پنج: 5, شش: 6, هفت: 7, هشت: 8, نه: 9, ده: 10, یازده: 11, دوازده: 12, سیزده: 13, چهارده: 14, پانزده: 15, شانزده: 16, هفده: 17, هجده: 18, نوزده: 19, بیست: 20, سی: 30, چهل: 40, پنجاه: 50, شصت: 60, هفتاد: 70, هشتاد: 80, نود: 90, یکصد: 100, دویست: 200, سیصد: 300, چهارصد: 400, پانصد: 500, ششصد: 600, هفتصد: 700, هشتصد: 800, نهصد: 900 };
  const SCALE = { هزار: 1e3, میلیون: 1e6, میلیارد: 1e9 };
  const read = (s) => {
    if (s === 'صفر') return 0;
    let total = 0, group = 0;
    const toks = s.split(' و ').flatMap((p) => p.split(' '));
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i];
      if (t in ONES) group += ONES[t];
      else if (t === 'هزار' && toks[i + 1] === 'میلیارد') (total += group * 1e12), (group = 0), i++;
      else if (t === 'میلیون' && toks[i + 1] === 'میلیارد') (total += group * 1e15), (group = 0), i++;
      else if (t in SCALE) (total += group * SCALE[t]), (group = 0);
      else throw new Error(`unknown word «${t}» in «${s}»`);
    }
    return total + group;
  };
  for (let i = 0; i < N * 2; i++) {
    const n = pick([int(0, 999), int(0, 1e6), int(0, 1e9), int(0, 1e12 - 1), int(0, 1e15 - 1), int(1e15, Number.MAX_SAFE_INTEGER)]);
    assert.equal(read(B.words(n)), n, `${n}: ${B.words(n)}`);
  }
  // a document may reach 10^15 rials (each line is capped there, a document sums its lines)
  assert.equal(B.words(1e15), 'یک میلیون میلیارد');
  assert.equal(B.words(2.5e15), 'دو میلیون میلیارد و پانصد هزار میلیارد');
});

/* ---------------- the tool calculators, each formula written again from its definition ---------------- */
test('tool calculators equal their definitions on random inputs', () => {
  const MESGHAL = 4.6083, MAZ_FIN = 705;
  for (let i = 0; i < N; i++) {
    const p750 = int(1e5, 2e7), w = int(1, 200000) / 1000, fin = pick([999, 916, 875, 750, 585, 375]);
    // مظنه ↔ گرم ۱۸: a mesghal of 705 gold costs one مظنه
    const maz = int(1e6, 1e8);
    close(K.g750FromMazaneh(maz), (maz / (MESGHAL * MAZ_FIN)) * 750, 'g750FromMazaneh');
    close(K.mazanehFromG750(K.g750FromMazaneh(maz)), maz, 'مظنه round trip');
    close(K.moltenPiecePrice(w, fin, maz), ((w * fin) / MAZ_FIN / MESGHAL) * maz, 'moltenPiecePrice');
    close(K.pricePerGramAt(p750, fin), (p750 * fin) / 750, 'pricePerGramAt');
    close(K.pureGold(w, fin), (w * fin) / 1000, 'pureGold');
    // invoice: gold, making charge (three ways), profit on gold + making, VAT on making + profit only
    const mode = pick(['percent', 'perGram', 'fixed']), oj = mode === 'percent' ? int(0, 40) : int(0, 2e6), pp = int(0, 15), vat = pick([9, 10]);
    const inv = K.invoice({ weight: w, p750, fineness: fin, ojratMode: mode, ojrat: oj, profitPct: pp, vatPct: vat });
    const gold = w * ((p750 * fin) / 750);
    const making = mode === 'percent' ? (gold * oj) / 100 : mode === 'perGram' ? w * oj : oj;
    const profit = ((gold + making) * pp) / 100;
    close(inv.goldValue, gold, 'invoice gold');
    close(inv.ojrat, making, `invoice making ${mode}`);
    close(inv.profit, profit, 'invoice profit');
    close(inv.vat, ((making + profit) * vat) / 100, 'invoice VAT');
    close(inv.total, gold + making + profit + ((making + profit) * vat) / 100, 'invoice total');
    // buying back used gold
    const ng = int(0, Math.floor(w * 500)) / 1000, ded = int(0, 20);
    const bb = K.buyback({ weight: w, p750, testedFineness: fin, deductPct: ded, nonGoldWeight: ng });
    const net = Math.max(0, w - ng), gross = net * ((p750 * fin) / 750);
    close(bb.payout, gross - (gross * ded) / 100, 'buyback payout');
    // coins: weight × 900/750 × price of a gram of 750
    for (const c of K.COINS) close(K.coinIntrinsic(c, p750), c.weight * ((p750 * c.fineness) / 750), `coin ${c.id}`);
    // density from weighing in air and water, and the fineness it suggests
    const air = int(1000, 50000) / 1000, water = air * (1 - 1 / (int(100, 2000) / 100));
    const rho = (air * 0.9982) / (air - water);
    close(K.densityFromWeighing(air, water), rho, 'density');
    const x = (1 / rho - 1 / 9.66) / (1 / 19.32 - 1 / 9.66);
    close(K.finenessFromDensity(rho), Math.max(0, Math.min(1000, x * 1000)), 'fineness from density');
    assert.ok(Number.isNaN(K.densityFromWeighing(5, 5)) && Number.isNaN(K.densityFromWeighing(0, 0)));
    // the nearest standard karat
    const f2 = int(300, 1000), near = K.KARATS.reduce((a, k) => (Math.abs(k.fineness - f2) < Math.abs(a.fineness - f2) ? k : a));
    assert.equal(K.nearestKarat(f2).fineness, near.fineness);
    // rings: ISO = inner circumference, US size from the diameter, and every way back
    const circ = int(400, 750) / 10;
    const r = K.ringFromCircumference(circ);
    close(r.diameter, circ / Math.PI, 'ring diameter');
    close(r.us, (circ / Math.PI - 11.63) / 0.8128, 'ring US');
    close(K.ringFromDiameter(r.diameter).iso, circ, 'ring via diameter');
    close(K.ringFromUS(r.us).iso, circ, 'ring via US');
    // the same model in another alloy, alloying to a target, casting, plating, stones, resizing, wire and sheet
    const [a, b] = [pick(K.ALLOYS), pick(K.ALLOYS)];
    close(K.weightInOtherAlloy(w, a.density, b.density), (w * b.density) / a.density, 'other alloy');
    const f0 = int(500, 999), target = int(300, 999), add = target < f0 ? 0 : 999.9;
    const al = K.alloyAdjust({ weight: w, fineness: f0, target, addFineness: add });
    if (target === f0) close(al.add, 0, 'no alloy needed');
    else if (target < 999.9) {
      close((w * f0 + al.add * add) / (w + al.add), target, 'alloy mass balance');
      close(al.pureAfter, ((w + al.add) * target) / 1000, 'pure after');
    }
    const wax = int(1, 5000) / 1000, md = pick([0.95, 1.12]), sp = int(0, 60) / 100;
    const cast = K.waxToMetal({ waxWeight: wax, metalDensity: a.density, modelDensity: md, sprue: sp });
    close(cast.metal, (wax * a.density) / md, 'casting metal');
    close(cast.melt, ((wax * a.density) / md) * (1 + sp), 'casting melt');
    const area = int(1, 5000) / 100, mic = int(1, 300) / 100, pd = pick(Object.values(K.PLATING));
    close(K.platingMass({ areaCm2: area, microns: mic, density: pd }), area * mic * 1e-4 * pd, 'plating');
    const cut = pick(Object.keys(K.STONE_FACTORS)), L = int(10, 200) / 10, W = int(10, 200) / 10, D = int(10, 120) / 10, sg = pick([3.52, 4, 2.72]);
    close(K.stoneCarat({ cut, L, W, D, sg }), K.STONE_FACTORS[cut].k * L * (cut === 'round' ? L : W) * D * (sg / 3.52), `stone ${cut}`);
    const from = int(40, 70), to = int(40, 70), bw = int(10, 80) / 10, bt = int(5, 30) / 10;
    close(K.resizeMetal({ fromSize: from, toSize: to, width: bw, thickness: bt, density: a.density }).grams, ((to - from) * bw * bt * a.density) / 1000, 'resize');
    const dia = int(2, 30) / 10, th = int(1, 20) / 10;
    close(K.wireLength({ weight: w, diameter: dia, density: a.density }), ((w / a.density) * 1000) / (Math.PI * (dia / 2) ** 2), 'wire');
    close(K.sheetArea({ weight: w, thickness: th, density: a.density }), ((w / a.density) * 1000) / th, 'sheet');
  }
});

/* ---------------- fraud probability: posterior odds = prior odds × likelihood ratio ---------------- */
test('the fraud probability follows Bayes’ rule for any prior, test and result', () => {
  for (let i = 0; i < N * 4; i++) {
    const prior = int(1, 999) / 1000, sens = int(1, 999) / 1000, fp = int(1, 999) / 1000, flagged = rnd() < 0.5;
    const lr = flagged ? sens / fp : (1 - sens) / (1 - fp);
    const odds = (prior / (1 - prior)) * lr;
    close(binaryPosterior(prior, sens, fp, flagged), odds / (1 + odds), 'posterior');
    close(likelihoodRatios(sens, fp)[flagged ? 'pos' : 'neg'], lr, 'likelihood ratio');
  }
});

/* ---------------- indicators: plain loops written from their definitions ---------------- */
test('indicators equal their textbook definitions on random price series', () => {
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const emaRef = (x, n, k = 2 / (n + 1)) => {
    const out = x.map(() => NaN);
    let e = mean(x.slice(0, n));
    out[n - 1] = e;
    for (let i = n; i < x.length; i++) out[i] = e = x[i] * k + e * (1 - k);
    return out;
  };
  for (let s = 0; s < Math.max(30, N / 25); s++) {
    const len = int(60, 300);
    let p = int(1e6, 1e8);
    const bars = [];
    for (let i = 0; i < len; i++) {
      const o = p, c = Math.max(1, o * (1 + (rnd() - 0.5) * 0.06));
      const h = Math.max(o, c) * (1 + rnd() * 0.02), l = Math.min(o, c) * (1 - rnd() * 0.02);
      bars.push({ d: `d${i}`, o, h, l, c });
      p = c;
    }
    const c = bars.map((b) => b.c);
    const n = int(2, 30);
    const sma = TA.sma(c, n), ema = TA.ema(c, n), sd = TA.stdev(c, n);
    const eref = emaRef(c, n);
    for (let i = 0; i < len; i++) {
      if (i < n - 1) {
        assert.ok(Number.isNaN(sma[i]) && Number.isNaN(ema[i]), 'warm-up holds NaN');
        continue;
      }
      const win = c.slice(i - n + 1, i + 1), m = mean(win);
      close(sma[i], m, `sma(${n})[${i}]`);
      close(ema[i], eref[i], `ema(${n})[${i}]`);
      close(sd[i], Math.sqrt(mean(win.map((v) => (v - m) ** 2))), `stdev(${n})[${i}]`);
    }
    // Wilder's RSI: the first average of gains and losses is simple, then (prev × (n−1) + now) ÷ n
    const rn = int(2, 20), rsi = TA.rsi(c, rn);
    let g = 0, l = 0;
    for (let i = 1; i <= rn; i++) (g += Math.max(0, c[i] - c[i - 1])), (l += Math.max(0, c[i - 1] - c[i]));
    (g /= rn), (l /= rn);
    for (let i = rn; i < len; i++) {
      if (i > rn) (g = (g * (rn - 1) + Math.max(0, c[i] - c[i - 1])) / rn), (l = (l * (rn - 1) + Math.max(0, c[i - 1] - c[i])) / rn);
      close(rsi[i], l === 0 ? (g === 0 ? 50 : 100) : 100 - 100 / (1 + g / l), `rsi(${rn})[${i}]`);
    }
    // MACD 12/26/9: the signal is the EMA of the line from its first value
    const m = TA.macd(c);
    const line = emaRef(c, 12).map((v, i) => v - emaRef(c, 26)[i]);
    const sig = emaRef(line.slice(25), 9);
    for (let i = 25; i < len; i++) {
      close(m.line[i], line[i], `macd line[${i}]`);
      if (i >= 33) close(m.signal[i], sig[i - 25], `macd signal[${i}]`);
    }
    // Bollinger 20/2, true range and Wilder's ATR
    const bb = TA.bollinger(c, 20, 2);
    for (let i = 19; i < len; i++) {
      const win = c.slice(i - 19, i + 1), mu = mean(win), sdv = Math.sqrt(mean(win.map((v) => (v - mu) ** 2)));
      close(bb.upper[i], mu + 2 * sdv, `bollinger upper[${i}]`);
      close(bb.lower[i], mu - 2 * sdv, `bollinger lower[${i}]`);
    }
    const tr = bars.map((b, i) => (i ? Math.max(b.h - b.l, Math.abs(b.h - bars[i - 1].c), Math.abs(b.l - bars[i - 1].c)) : b.h - b.l));
    const an = int(2, 20), atr = TA.atr(bars, an), aref = emaRef(tr, an, 1 / an);
    for (let i = an - 1; i < len; i++) close(atr[i], aref[i], `atr(${an})[${i}]`);
    // stochastic %K (raw) and Williams %R over the high-low range
    const wn = int(3, 20), wr = TA.williamsR(bars, wn);
    for (let i = wn - 1; i < len; i++) {
      const hh = Math.max(...bars.slice(i - wn + 1, i + 1).map((b) => b.h)), ll = Math.min(...bars.slice(i - wn + 1, i + 1).map((b) => b.l));
      close(wr[i], hh > ll ? ((hh - c[i]) / (hh - ll)) * -100 : -50, `williams %R[${i}]`);
    }
  }
});

/* ---------------- the live sales desk (spec 0037): every what-if on random carts ---------------- */
test('sales desk what-ifs on random carts: the gold is never discounted, a round figure is met to the rial', async () => {
  const S = await import('../public/js/sell.mjs');
  const tpls = B.TEMPLATES.filter((t) => t.group && !t.id.startsWith('inv-')).map((t) => t.id);
  for (let i = 0; i < Math.max(60, N / 5); i++) {
    const p750 = int(18, 32) * 100000;
    const lines = Array.from({ length: int(1, 4) }, (_, k) => S.lineFromItem({ id: `c${i}-${k}`, code: String(k), tpl: pick(tpls), title: 'قطعه', weight: int(800, 25000) / 1000, fineness: pick([750, 740]), ojratMode: 'pct', ojrat: int(5, 30), profitPct: int(0, 10), stones: rnd() < 0.2 ? int(1, 3000000) : 0 }, p750));
    const cart = { lines, tradeIns: rnd() < 0.3 ? [{ title: 'کهنه', weight: int(1000, 8000) / 1000, stoneWeight: 0, fineness: 740, p750, deductPct: 2 }] : [], payments: [] };
    const base = S.totals(cart);
    const baseLines = lines.map((l) => B.calcLine({ ...l, discount: 0 }));
    for (const s of S.scenarios(cart)) {
      if (!s.possible || !s.discount) continue;
      s.lines.forEach((l, k) => {
        const c = B.calcLine(l);
        assert.equal(c.principal, baseLines[k].principal, `${s.id}: the gold of line ${k + 1} is untouched`);
        assert.ok(c.vat <= baseLines[k].vat, `${s.id}: tax does not rise`);
      });
      if (s.id === 'round') {
        const target = Math.floor(base.net / 1e6) * 1e6;
        if (s.note) assert.ok(s.net <= target && target - s.net < 40, `round (nearest): ${s.net} vs ${target}`);
        else assert.equal(s.net, target, 'round lands on the million below');
      }
      if (s.id === 'disc3') assert.ok(Math.abs(s.net - Math.round(base.sales * 0.97) + base.tradeIn) <= 20 * lines.length, `3%: ${s.net} vs ${Math.round(base.sales * 0.97) - base.tradeIn}`);
    }
    // a budget is met to the rial, or reported out of reach with the lowest possible figure
    const target = Math.round(base.net * (0.85 + rnd() * 0.2));
    const b = target > 0 ? S.budget(cart, target) : { possible: true };
    if (b.possible && target > 0 && target < base.net) {
      if (b.exact) assert.equal(b.net, target, 'budget met exactly');
      else assert.ok(b.net <= target && target - b.net < 40, `budget nearest: ${b.net} vs ${target}`);
    } else if (!b.possible) assert.ok(b.floor > target, 'out of reach means even the full discount stays above the budget');
    // what the customer sees adds up and never shows the seller's margin apart
    const v = S.customerView(cart, base);
    assert.equal(v.lines.reduce((a, l) => a + l.total, 0), base.sales);
    assert.equal(v.left, base.net - (base.paidIn - base.paidOut));
    assert.ok(v.lines.every((l) => !('spro' in l) && !('consfee' in l)));
  }
});

/* ---------------- identifiers: the official check digits, written again ---------------- */
test('national code, legal ID, card, IBAN and mobile checks equal their published rules on random numbers', () => {
  const digits = (n) => Array.from({ length: n }, () => int(0, 9)).join('');
  const nationalCode = (d) => {
    if (!/^\d{10}$/.test(d) || /^(\d)\1{9}$/.test(d)) return false;
    const s = [...d.slice(0, 9)].reduce((a, c, i) => a + Number(c) * (10 - i), 0) % 11;
    return Number(d[9]) === (s < 2 ? s : 11 - s);
  };
  const legalId = (d) => {
    if (!/^\d{11}$/.test(d) || /^0+$/.test(d) || /^0+$/.test(d.slice(3, 9))) return false;
    const add = Number(d[9]) + 2, coef = [29, 27, 23, 19, 17, 29, 27, 23, 19, 17];
    const r = [...d.slice(0, 10)].reduce((a, c, i) => a + (Number(c) + add) * coef[i], 0) % 11;
    return (r === 10 ? 0 : r) === Number(d[10]);
  };
  const luhn = (d) => /^\d{16}$/.test(d) && [...d].reverse().reduce((a, c, i) => a + (i % 2 ? ((x) => (x > 9 ? x - 9 : x))(2 * Number(c)) : Number(c)), 0) % 10 === 0;
  const iban = (t) => /^IR\d{24}$/.test(t) && BigInt(t.slice(4) + '1827' + t.slice(2, 4)) % 97n === 1n;
  const mutate = (d) => {
    const i = int(0, d.length - 1);
    return d.slice(0, i) + String((Number(d[i]) + int(1, 9)) % 10) + d.slice(i + 1);
  };
  for (let i = 0; i < N * 4; i++) {
    // built valid, then one digit changed, then pure noise: the app agrees with the rule every time
    let nc = digits(9);
    const s = [...nc].reduce((a, c, k) => a + Number(c) * (10 - k), 0) % 11;
    nc += String(s < 2 ? s : 11 - s);
    for (const d of [nc, mutate(nc), digits(10)]) assert.equal(B.validNationalCode(d), nationalCode(d), `national code ${d}`);
    const lid = digits(11);
    for (const d of [lid, mutate(lid)]) assert.equal(B.validNationalId(d), legalId(d), `legal ID ${d}`);
    let card = digits(15);
    for (let c = 0; c < 10; c++) if (luhn(card + c)) (card += c), (c = 10);
    for (const d of [card, mutate(card), digits(16)]) assert.equal(B.validCard(d), luhn(d), `card ${d}`);
    const bban = digits(22); // IR + two check digits + 22 digits
    const check = String(98n - (BigInt(bban + '182700') % 97n)).padStart(2, '0');
    const sheba = `IR${check}${bban}`;
    for (const t of [sheba, `IR${mutate(sheba.slice(2))}`, `IR${digits(24)}`]) assert.equal(B.validSheba(t), iban(t), `IBAN ${t}`);
    assert.equal(B.validSheba(sheba.slice(2)), true, 'the digits alone, without IR');
    const mob = `09${digits(9)}`;
    for (const [typed, want] of [[mob, mob], [`+98${mob.slice(1)}`, mob], [`0098${mob.slice(1)}`, mob], [mob.slice(1), mob], [mob.replace(/\d/g, (x) => '۰۱۲۳۴۵۶۷۸۹'[x]), mob], [`۰۰۹۸${mob.slice(1)}`.replace(/\d/g, (x) => '۰۱۲۳۴۵۶۷۸۹'[x]), mob]]) {
      assert.equal(B.normalizeMobile(typed), want, `mobile ${typed}`);
      assert.equal(normalizePhone(typed), want, `sign-in mobile ${typed}`); // the server's own reader (server/auth.mjs)
    }
  }
});

/* ---------------- levels and the market's relations ---------------- */
test('Fibonacci levels, pivots and the world-price relations equal their formulas; coins agree across modules', async () => {
  const { COIN_TYPES } = await import('../public/js/coins.mjs');
  for (const [k, id] of Object.entries({ sekee: 'emami', sekeb: 'bahar', nim: 'half', rob: 'quarter', gerami: 'gerami' })) close(TA.COIN_PURE_G[k], (COIN_TYPES[id].weight * COIN_TYPES[id].fineness) / 1000, `pure gold of ${k} is the books' coin`);
  for (const c of K.COINS) close(c.weight, COIN_TYPES[{ full: 'emami', half: 'half', quarter: 'quarter' }[c.id]].weight, `calculator coin ${c.id}`);
  for (let i = 0; i < N; i++) {
    const a = int(1e6, 1e8), b = int(1e6, 1e8), d = b - a;
    const f = TA.fibLevels(a, b);
    f.retrace.forEach(({ r, price }) => close(price, b - r * d, `retrace ${r}`));
    f.extend.forEach(({ r, price }) => close(price, a + r * d, `extend ${r}`));
    const l = int(1e6, 5e7), h = l + int(0, 5e6), c = int(l, h), P = (h + l + c) / 3;
    const pc = TA.pivots(h, l, c);
    close(pc.P, P, 'pivot');
    close(pc.R1, 2 * P - l, 'R1');
    close(pc.S1, 2 * P - h, 'S1');
    close(pc.R2, P + (h - l), 'R2');
    close(pc.S2, P - (h - l), 'S2');
    const ons = int(1500, 5000), usd = int(30000, 120000);
    const pure = (ons * usd) / 31.1034768;
    close(TA.worldPureGram(ons, usd), pure, 'world price of a pure gram');
    close(TA.impliedMesghal(ons, usd), pure * 4.6083 * 0.705, 'implied مظنه');
    close(TA.impliedUsdMesghal(TA.impliedMesghal(ons, usd), ons), usd, 'implied dollar from the مظنه');
    const price = int(1e7, 1e9), value = int(1e7, 1e9);
    close(TA.bubble(price, value), price / value - 1, 'bubble');
    assert.ok(Number.isNaN(TA.bubble(price, 0)), 'no bubble without a value');
  }
});
