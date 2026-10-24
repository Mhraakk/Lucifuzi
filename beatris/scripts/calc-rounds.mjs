// spec 0044, browser level: the tool calculators used the way a person uses them, again and again. Random values are
// typed into the real forms (Persian or Latin digits, with or without separators), options are picked, and every
// figure the page shows is read back and compared with the formula written again here. Nothing from public/js is
// imported for the oracle.
//   node scripts/calc-rounds.mjs [--rounds=200] [--seed=7]
// Starts a fresh demo server, signs in, and exits non-zero on any difference.
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];
const ROUNDS = Number(arg('rounds') ?? 200);
let seed = Number(arg('seed') ?? 7);
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
const pick = (a) => a[Math.floor(rnd() * a.length)];
const pw = await import(process.env.PLAYWRIGHT ?? '/opt/node22/lib/node_modules/playwright/index.mjs');
const { chromium } = pw.default ?? pw;

/* ---------------- typing and reading numbers ---------------- */
const FA = '۰۱۲۳۴۵۶۷۸۹';
/** A number as a person might type it: Latin, Persian digits, thousands separators, a Persian decimal mark. */
function typed(x) {
  const s = String(x);
  const [i, f] = s.split('.');
  const style = int(0, 3);
  const grp = (t, sep) => t.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
  if (style === 0) return s;
  if (style === 1) return `${grp(i, ',')}${f ? `.${f}` : ''}`;
  const fa = (t) => t.replace(/\d/g, (d) => FA[d]);
  return `${fa(style === 3 ? grp(i, '٬') : i)}${f ? `٫${fa(f)}` : ''}`;
}
/** The first number in a shown figure («۱۲٬۳۴۵٫۶ گرم», «− ۵۰ تومان»), or NaN. */
function shown(t) {
  const s = String(t).replace(/[۰-۹]/g, (d) => FA.indexOf(d)).replace(/٬/g, '').replace(/٫/g, '.').replace(/[−–]/g, '-');
  const m = /-?\s*\d+(\.\d+)?/.exec(s);
  return m ? Number(m[0].replace(/\s/g, '')) : NaN;
}

/* ---------------- the formulas, written again ---------------- */
const MESGHAL = 4.6083, MAZ = 705;
const KARATS = [999, 916, 875, 750, 585, 375];
const ALLOYS = { au24: [999, 19.3], au22: [916, 17.8], au21: [875, 17.2], au18y: [750, 15.5], au18r: [750, 15.1], au18w: [750, 15.9], au14y: [585, 13.4], ag925: [0, 10.4], pt950: [0, 20.5] };
const STONE = { round: 0.0061, oval: 0.0062, princess: 0.0083, emerald: 0.0092, cushion: 0.0081, pear: 0.0059, marquise: 0.00565, heart: 0.0059 };
const COINS = [8.133, 4.0665, 2.03325];
/** Π nums ÷ Π dens as an exact fraction, rounded once, half away from zero, to a multiple of step (spec 0045). */
function exact(nums, dens = [], step = 1) {
  const D = (x) => {
    const [i, f = ''] = String(x).split('.');
    return [BigInt(i + f), f.length];
  };
  let n = 1n, d = 1n;
  for (const x of nums) {
    const [m, k] = D(x);
    (n *= m), (d *= 10n ** BigInt(k));
  }
  for (const x of dens) {
    const [m, k] = D(x);
    (d *= m), (n *= 10n ** BigInt(k));
  }
  const [sm, sk] = D(step);
  (n *= 10n ** BigInt(sk)), (d *= sm);
  let q = n / d;
  if ((n % d) * 2n >= d) q += 1n;
  return (Number(q) * Number(sm)) / 10 ** sk;
}

/** Each calculator: the values to type (name → value), the options to pick, and the figures it must show, in order. */
const CALCS = {
  invoice: () => {
    const v = { weight: int(100, 99999) / 1000, p750: int(100, 30000) * 1000, ojrat: 0, profit: int(0, 15), vat: pick([9, 10]) };
    const sel = { fineness: String(pick(KARATS)), mode: pick(['percent', 'perGram', 'fixed']) };
    v.ojrat = sel.mode === 'percent' ? int(0, 40) : int(0, 3000000);
    const gold = v.weight * ((v.p750 * Number(sel.fineness)) / 750);
    const oj = sel.mode === 'percent' ? (gold * v.ojrat) / 100 : sel.mode === 'perGram' ? v.weight * v.ojrat : v.ojrat;
    const profit = ((gold + oj) * v.profit) / 100, tax = ((oj + profit) * v.vat) / 100;
    return { v, sel, want: [[gold, 0], [oj, 0], [profit, 0], [oj + profit, 0], [tax, 0], [gold + oj + profit + tax, 0]] };
  },
  mazaneh: () => {
    const v = { m: int(10, 300) * 100000 + int(0, 99999), aw: int(100, 200000) / 1000, af: int(500, 999) };
    const g = (v.m * 750) / (MESGHAL * MAZ);
    return { v, sel: {}, want: [[g, 0], [v.m / ((MESGHAL * MAZ) / 1000), 0], [g * MESGHAL, 0], [((v.aw * v.af) / MAZ / MESGHAL) * v.m, 0]] };
  },
  buyback: () => {
    const v = { weight: int(500, 90000) / 1000, nongold: 0, fin: int(500, 999), p750: int(100, 30000) * 1000, deduct: int(0, 20) };
    v.nongold = int(0, Math.floor(v.weight * 300)) / 1000;
    const net = Math.max(0, v.weight - v.nongold), gross = net * ((v.p750 * v.fin) / 750), d = (gross * v.deduct) / 100;
    return { v, sel: {}, want: [[net, 2], [gross, 0], [d, 0], [gross - d, 0]] };
  },
  coin: () => {
    const v = { p750: int(100, 30000) * 1000 };
    return { v, sel: {}, want: COINS.map((w) => [w * ((v.p750 * 900) / 750), 0]) };
  },
  density: () => {
    const air = int(2000, 40000) / 1000, rho = int(1100, 1950) / 100;
    const water = Math.round((air - (air * 0.9982) / rho) * 1000) / 1000;
    const d = (air * 0.9982) / (air - water);
    const x = Math.max(0, Math.min(1000, ((1 / d - 1 / 9.66) / (1 / 19.32 - 1 / 9.66)) * 1000));
    return { v: { air, water }, sel: {}, want: [[d, 2], [x, 0]] };
  },
  karat: () => {
    const w = int(100, 50000) / 1000, from = pick(Object.keys(ALLOYS)), to = pick(Object.keys(ALLOYS));
    const [f, a] = ALLOYS[from], [, b] = ALLOYS[to];
    return { v: { weight: w }, sel: { from, to }, want: [[f ? (w * f) / 1000 : NaN, 3], [(w * b) / a, 2]] };
  },
  alloy: () => {
    const w = int(1000, 500000) / 1000, fin = int(400, 999), target = int(300, 999);
    const addf = target < fin ? 0 : 999.9;
    const add = (w * (target - fin)) / (addf - target);
    const ok = target !== addf && (target - fin) * (addf - target) >= 0;
    return { v: { weight: w, fin, target, addf }, sel: {}, want: ok ? [[add, 3], [w + add, 3], [(w * fin) / 1000, 3], [((w + add) * target) / 1000, 3]] : [] };
  },
  casting: () => {
    const wax = int(100, 20000) / 1000, metal = pick(Object.keys(ALLOYS)), model = pick(['0.95', '1.12']), sprue = int(0, 60);
    const ratio = ALLOYS[metal][1] / Number(model), m = wax * ratio;
    return { v: { wax, sprue }, sel: { metal, model }, want: [[ratio, 2], [m, 3], [m * (1 + sprue / 100), 2]] };
  },
  plating: () => {
    const area = int(10, 5000) / 100, mic = int(1, 500) / 100, pm = pick(['12.41', '19.32', '12.02', '10.49']);
    const g = area * mic * 1e-4 * Number(pm);
    return { v: { area, mic }, sel: { pm }, want: [[g * 1000, 3], [g, 6]] };
  },
  stone: () => {
    const cut = pick(Object.keys(STONE)), L = int(10, 200) / 10, W = int(10, 200) / 10, D = int(10, 120) / 10, sg = pick(['3.52', '4.00', '2.72', '2.65']);
    const ct = STONE[cut] * L * (cut === 'round' ? L : W) * D * (Number(sg) / 3.52);
    const dia = STONE[cut] * L * (cut === 'round' ? L : W) * D;
    return { v: { L, W, D }, sel: { cut, sg }, want: [[ct, 2], [ct * 0.2, 3], [dia, 2]] };
  },
  ring: () => {
    const mode = pick(['iso', 'd', 'us']);
    const v = mode === 'iso' ? int(400, 750) / 10 : mode === 'd' ? int(1300, 2400) / 100 : int(0, 52) / 4;
    const circ = mode === 'iso' ? v : mode === 'd' ? v * Math.PI : (11.63 + 0.8128 * v) * Math.PI;
    const us = (circ / Math.PI - 11.63) / 0.8128;
    return { v: { v }, sel: {}, click: [`#tf [data-mode=${mode}]`], want: [[circ, 1], [circ / Math.PI, 2], [Math.round(us * 4) / 4, 2]] };
  },
  bayes: () => {
    const prior = int(1, 99), sens = int(1, 100), fp = int(1, 99), res = pick(['flag', 'clear']);
    const p = prior / 100, s1 = sens / 100, f1 = fp / 100;
    const odds = (p / (1 - p)) * (res === 'flag' ? s1 / f1 : (1 - s1) / (1 - f1));
    const post = odds / (1 + odds);
    // shown as «کمتر از ۰٫۱٪», «بیش از ۹۹٫۹٪», or a percent with one decimal near the ends
    const say = (x) => (x < 0.001 ? [0.1, 1] : x > 0.999 ? [99.9, 1] : [x * 100, x < 0.1 || x > 0.9 ? 1 : 0]);
    return { v: { prior, sens, fp }, sel: { res }, want: [say(p), say(post), say(post)], rowsFrom: 0 };
  },
  melt: () => {
    const side = pick(['buy', 'sell']), w = int(100, 120000) / 1000, ayar = int(600, 999), mid = int(30, 60) * 1000000 + int(0, 99) * 10000, spread = int(0, 50) * 10000;
    const maz = side === 'buy' ? mid - spread : mid + spread;
    const eq = exact([w, ayar], [750], 0.001);
    return { v: { w, ayar, mid, spread }, sel: {}, click: [`#mf [data-side=${side}]`], form: '#mf', out: '#live', want: [[maz, 0], [(maz * 750) / (MESGHAL * MAZ), 0], [eq, 3], [exact([eq, maz, 750], [MESGHAL, MAZ], 1000), 0]] };
  },
  resize: () => {
    const from = int(40, 70), to = int(40, 70), w = int(10, 80) / 10, t = int(5, 30) / 10, metal = pick(Object.keys(ALLOYS));
    const gw = int(100, 20000) / 1000, dia = int(2, 30) / 10, th = int(1, 20) / 10;
    const rho = ALLOYS[metal][1];
    const grams = ((to - from) * w * t * rho) / 1000;
    return { v: { from, to, w, t, gw, dia, th }, sel: { metal }, want: [[Math.abs(grams), 3], [((gw / rho) * 1000) / (Math.PI * (dia / 2) ** 2), 1], [((gw / rho) * 1000) / th, 1]] };
  },
};

/* ---------------- the run ---------------- */
const dataDir = mkdtempSync(path.join(tmpdir(), 'calc-'));
const port = 6700 + Math.floor(Math.random() * 300);
const server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/index.mjs'], { cwd: ROOT, env: { ...process.env, BEATRIS_DEMO: 'true', BEATRIS_DATA_DIR: dataDir, PORT: String(port), NODE_ENV: 'test', BEATRIS_RATE_LIMIT: '1000000' }, stdio: ['ignore', 'ignore', 'inherit'] });
const base = `http://127.0.0.1:${port}`;
for (let i = 0; i < 120 && !(await fetch(`${base}/api/health`).then((r) => r.ok).catch(() => false)); i++) await new Promise((r) => setTimeout(r, 250));
const browser = await chromium.launch();
const failures = [], errors = [];
const tally = {};
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(`${base}/login`);
  await page.fill('#ef input[name=email]', 'owner@demo.beatris.ir');
  await page.click('#ef button[type=submit]');
  await page.waitForSelector('.lg-dev');
  await page.click('.lg-dev');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20000 });
  for (const [id, make] of Object.entries(CALCS)) {
    await page.goto(`${base}/tools/${id}`);
    await page.waitForSelector(make().form ?? '#tf');
    const t = (tally[id] = { tries: 0, figures: 0, fail: 0 });
    for (let r = 0; r < ROUNDS; r++) {
      const c = make();
      const form = c.form ?? '#tf';
      for (const sel of c.click ?? []) await page.click(sel);
      for (const [k, v] of Object.entries(c.sel)) await page.selectOption(`${form} [name=${k}]`, v);
      for (const [k, v] of Object.entries(c.v)) await page.fill(`${form} [name=${k}]`, typed(v));
      const rows = await page.$$eval(`${c.out ?? '#out'} .ledger > div`, (ds) => ds.map((d) => [...d.children].map((x) => x.textContent.trim())));
      t.tries++;
      c.want.forEach(([want, digits], i) => {
        const got = shown(rows[i]?.[1] ?? '');
        const unit = 10 ** -digits;
        const ok = Number.isNaN(want) ? !/\d/.test(rows[i]?.[1] ?? '') : Math.abs(got - want) <= unit / 2 + 1e-9 * Math.max(1, Math.abs(want)) + 1e-12;
        t.figures++;
        if (!ok) {
          t.fail++;
          if (failures.length < 40) failures.push({ calc: id, round: r + 1, row: rows[i]?.[0], shown: rows[i]?.[1], want, digits, inputs: { ...c.v, ...c.sel } });
        }
      });
    }
    console.log(`${t.fail ? '✗' : '✓'} ${id.padEnd(8)} ${t.tries} rounds · ${t.figures} figures · ${t.fail} wrong`);
  }
} finally {
  await browser.close();
  server.kill();
}
for (const f of failures) console.log('✗', JSON.stringify(f));
if (errors.length) console.log('page errors:', JSON.stringify(errors.slice(0, 10)));
const total = Object.values(tally).reduce((a, t) => a + t.figures, 0);
console.log(`${Object.keys(tally).length} calculators · ${total} figures read back · ${failures.length ? 'differences found' : 'all equal'}`);
process.exit(failures.length || errors.length ? 1 : 0);
