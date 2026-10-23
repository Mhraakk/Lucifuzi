// spec 0044, browser level: the counter's sale invoice filled again and again. Each round opens a new sale, adds one to
// three pieces from the catalogue and sometimes old gold taken in, types random weights, prices, making charges, profit,
// stones, commission and discounts (in the shop's unit, Persian or Latin digits), and reads the totals panel back. Every
// figure is compared with the gold pattern written again here (spec 0045: exact decimal fractions, rounded once).
//   node scripts/invoice-rounds.mjs [--rounds=200] [--seed=11]
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];
const ROUNDS = Number(arg('rounds') ?? 200);
let seed = Number(arg('seed') ?? 11);
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
const pick = (a) => a[Math.floor(rnd() * a.length)];
const pw = await import(process.env.PLAYWRIGHT ?? '/opt/node22/lib/node_modules/playwright/index.mjs');
const { chromium } = pw.default ?? pw;

const FA = '۰۱۲۳۴۵۶۷۸۹';
const typed = (x) => {
  const s = String(x);
  return rnd() < 0.5 ? s : s.replace(/\d/g, (d) => FA[d]).replace('.', '٫');
};
const shown = (t) => {
  const s = String(t).replace(/[۰-۹]/g, (d) => FA.indexOf(d)).replace(/٬/g, '').replace(/٫/g, '.').replace(/[−–]/g, '-');
  const m = /-?\s*\d+(\.\d+)?/.exec(s);
  return m ? Number(m[0].replace(/\s/g, '')) : NaN;
};

/* ---------------- the gold pattern, written again ---------------- */
function X(nums, dens = [], step = 1) {
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
/** A jewel line from what was typed in the shop's unit: the editor hands the engine typed ÷ k toman (k = 10 for rial). */
function jewel(l, k, vat) {
  const t = (v) => X([v], [k], 0.0001);
  const w = X([l.weight], [], 0.001), fee = X([t(l.p750), 10, l.fineness], [750]);
  const o = { principal: X([w, fee]) };
  o.consfee = l.ojratMode === 'pct' ? X([o.principal, l.ojrat], [100]) : l.ojratMode === 'gram' ? X([w, t(l.ojrat), 10]) : X([t(l.ojrat), 10]);
  o.spro = X([o.principal + o.consfee, l.profitPct], [100]);
  o.bros = X([t(l.bros), 10]);
  o.stones = X([t(l.stones), 10]);
  o.discount = X([t(l.discount), 10]);
  const fromProfit = Math.min(o.discount, o.spro);
  o.spro -= fromProfit;
  o.consfee -= o.discount - fromProfit;
  o.vat = X([o.consfee + o.spro + o.bros, vat], [100]);
  o.total = o.principal + o.stones + o.consfee + o.spro + o.bros + o.vat;
  return o;
}
function used(l, k) {
  const t = (v) => X([v], [k], 0.0001);
  const w = (Math.round(l.weight * 1000) - Math.round(l.stoneWeight * 1000)) / 1000;
  const gross = X([w, X([t(l.p750), 10, l.fineness], [750])]);
  return gross - X([gross, l.deductPct], [100]);
}

/* ---------------- the run ---------------- */
const dataDir = mkdtempSync(path.join(tmpdir(), 'inv-'));
const port = 7000 + Math.floor(Math.random() * 300);
const server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/index.mjs'], { cwd: ROOT, env: { ...process.env, BEATRIS_DEMO: 'true', BEATRIS_DATA_DIR: dataDir, PORT: String(port), NODE_ENV: 'test', BEATRIS_RATE_LIMIT: '1000000' }, stdio: ['ignore', 'ignore', 'inherit'] });
const base = `http://127.0.0.1:${port}`;
for (let i = 0; i < 120 && !(await fetch(`${base}/api/health`).then((r) => r.ok).catch(() => false)); i++) await new Promise((r) => setTimeout(r, 250));
const browser = await chromium.launch();
const failures = [], errors = [];
let figures = 0;
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(`${base}/login`);
  await page.fill('#ef input[name=email]', 'owner@demo.beatris.ir');
  await page.click('#ef button[type=submit]');
  await page.waitForSelector('.lg-dev');
  await page.click('.lg-dev');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20000 });
  const TPLS = ['ring-w', 'ring-m', 'nk', 'ch-cartier', 'br', 'er-stud', 'set-half', 'br-bangle'];
  for (let r = 1; r <= ROUNDS; r++) {
    // a new sale: the editor keeps an unfinished invoice as a draft (spec 0013), so the last round's lines are removed
    await page.goto(`${base}/books/new/sale`);
    await page.waitForSelector('#totals');
    while (await page.$('[data-del-line]')) {
      const n = await page.$$eval('[data-line]', (es) => es.length);
      await page.click(`[data-del-line="${n - 1}"]`);
      await page.waitForFunction((m) => document.querySelectorAll('[data-line]').length < m, n);
    }
    const unitRial = await page.$eval('body', (b) => !/تومان/.test(b.textContent.match(/جمع فاکتور[^\n]*|قیمت گرم ۱۸ \([^)]+\)/)?.[0] ?? ''));
    const k = unitRial ? 10 : 1; // what is typed ÷ k is the engine's toman
    const lines = [];
    for (let i = int(1, 3); i > 0; i--) {
      await page.click('[data-act=catalog]');
      await page.click(`[data-tpl=${pick(TPLS)}]`);
      await page.waitForSelector(`[data-l="${lines.length}"][data-k=weight]`);
      const mode = pick(['pct', 'pct', 'gram', 'fixed']);
      const l = { weight: int(300, 60000) / 1000, fineness: pick([750, 740, 585]), p750: int(60, 120) * 1000000 * (k / 10) + pick([0, 0, 5, 50]) * (k / 10 >= 1 ? 1 : 0), ojratMode: mode, ojrat: mode === 'pct' ? int(0, 30) : int(0, 2000) * 1000 * (k / 10 || 1), profitPct: int(0, 10), stones: rnd() < 0.2 ? int(1, 5000) * 10000 : 0, bros: rnd() < 0.15 ? int(1, 900) * 1000 : 0, discount: 0 };
      if (rnd() < 0.25) {
        const room = jewel({ ...l, discount: 0 }, k, 10);
        l.discount = Math.floor((int(0, room.consfee + room.spro) * k) / 10); // in the unit typed, never past the room
      }
      const i0 = lines.length;
      if ((await page.$$eval('[data-line]', (es) => es.length)) !== i0 + 1) throw new Error(`round ${r}: expected ${i0 + 1} lines on the invoice`);
      await page.selectOption(`[data-l="${i0}"][data-k=ojratMode]`, mode);
      for (const f of ['weight', 'fineness', 'p750', 'ojrat', 'profitPct', 'stones', 'bros', 'discount']) await page.fill(`[data-l="${i0}"][data-k=${f}]`, typed(l[f]));
      lines.push({ kind: 'jewel', ...l });
    }
    if (rnd() < 0.35) {
      await page.click('[data-act=add-used]');
      const i0 = lines.length;
      await page.waitForSelector(`[data-l="${i0}"][data-k=weight]`);
      const weight = int(1000, 30000) / 1000;
      const l = { weight, stoneWeight: rnd() < 0.3 ? int(0, Math.floor(weight * 300)) / 1000 : 0, fineness: pick([740, 750, 730]), p750: int(60, 120) * 1000000 * (k / 10), deductPct: int(0, 5) };
      for (const f of ['weight', 'stoneWeight', 'fineness', 'p750', 'deductPct']) await page.fill(`[data-l="${i0}"][data-k=${f}]`, typed(l[f]));
      lines.push({ kind: 'used', ...l });
    }
    await page.waitForTimeout(60);
    const rows = Object.fromEntries(await page.$$eval('#totals .kv', (ds) => ds.map((d) => [d.children[0].textContent.trim(), d.children[1].textContent.trim()])));
    const vatRow = Object.keys(rows).find((x) => x.startsWith('مالیات بر ارزش افزوده'));
    const vat = shown(vatRow ?? '10');
    // the model
    const js = lines.filter((l) => l.kind === 'jewel').map((l) => jewel(l, k, vat));
    const sum = (f) => js.reduce((a, o) => a + o[f], 0);
    const tradeIn = lines.filter((l) => l.kind === 'used').reduce((a, l) => a + used(l, k), 0);
    const want = { 'ارزش طلا (اصل، معاف)': sum('principal'), 'اجرت ساخت': sum('consfee'), 'سود فروشنده': sum('spro'), 'جمع فاکتور': sum('total') };
    if (sum('stones')) want['سنگ و جواهر (اصل)'] = sum('stones');
    if (sum('bros')) want['حق‌العمل'] = sum('bros');
    if (sum('discount')) want['تخفیف'] = sum('discount');
    if (tradeIn) want['طلای دریافتی (تعویض)'] = tradeIn;
    for (const [label, rial] of [...Object.entries(want), [vatRow, sum('vat')]]) {
      figures++;
      const got = shown(rows[label] ?? '');
      const expect = unitRial ? rial : rial / 10;
      if (!(Math.abs(Math.abs(got) - expect) < 1e-6)) failures.push({ round: r, label, shown: rows[label], want: expect, lines });
    }
    if (failures.length > 20) break;
    if (r % 25 === 0) console.log(`… ${r} invoices, ${figures} figures, ${failures.length} wrong`);
  }
} finally {
  await browser.close();
  server.kill();
}
for (const f of failures.slice(0, 10)) console.log('✗', JSON.stringify(f));
if (errors.length) console.log('page errors:', JSON.stringify(errors.slice(0, 10)));
console.log(`${figures} figures on ${ROUNDS} invoices · ${failures.length ? `${failures.length} wrong` : 'all equal'}`);
process.exit(failures.length || errors.length ? 1 : 0);
