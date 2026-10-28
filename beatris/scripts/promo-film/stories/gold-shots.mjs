// spec 0055: the real screens of «طلا، به دقت بئاتریس», captured from a fresh demo server at twice the density.
//   node scripts/promo-film/stories/gold-shots.mjs [--skin=calm]   → scripts/promo-film/stories/shots-gold/*.jpg + boxes.json
// The bar of the film is one purchase of melted gold: 10 g at 740, bought at the مظنه 39,850,000 (mid 40,000,000 less a
// 150,000 spread), exactly the quick-entry example the e2e checks. Every figure on the screens is the app's own.
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as TR from '../../../public/js/trade.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const arg = (k) => process.argv.map((a) => a.replace(/^--/, '')).find((a) => a.startsWith(`${k}=`))?.slice(k.length + 1);
const SKIN = arg('skin') ?? 'calm';
const OUT = path.join(HERE, 'shots-gold');
mkdirSync(OUT, { recursive: true });
const pw = await import(process.env.PLAYWRIGHT ?? '/opt/node22/lib/node_modules/playwright/index.mjs').catch(() => import('playwright'));
const { chromium } = pw.default ?? pw;

const port = 6300 + Math.floor(Math.random() * 300);
const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/index.mjs'], {
  cwd: ROOT,
  env: { ...process.env, NODE_ENV: 'development', BEATRIS_DEMO: 'true', BEATRIS_DATA_DIR: mkdtempSync(path.join(tmpdir(), 'beatris-gold-')), PORT: String(port) },
  stdio: 'ignore',
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 80 && !(await fetch(`${base}/api/health`).then((r) => r.ok).catch(() => false)); i++) await wait(250);

const J = (m, p, b, t) =>
  fetch(base + p, { method: m, headers: { 'content-type': 'application/json', ...(t ? { authorization: `Bearer ${t}` } : {}) }, body: b ? JSON.stringify(b) : undefined }).then(async (r) => {
    const j = await r.json();
    if (!r.ok) throw new Error(`${m} ${p}: ${j.error}`);
    return j;
  });
const tokenOf = async (email) => {
  const s = await J('POST', '/api/auth/code', { email });
  let v = await J('POST', '/api/auth/verify', { email, code: s.code });
  if (v.shops) v = await J('POST', '/api/auth/finish', { ticket: v.ticket, tenant: v.shops[0].tenant });
  return v.token;
};
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran' }).format(new Date());

/* the bar's own document: bought from a walk-in seller, paid in cash, then printed and shared, so its life has events */
const owner = await tokenOf('owner@demo.beatris.ir');
const party = await J('POST', '/api/books/parties', { name: 'فروشنده‌ی آب‌شده', mobile: '09121234599' }, owner);
// the books keep rials: the مظنه 39,850,000 toman is 398,500,000 rial, and the payment is the line's own value
const line = { kind: 'melt', dir: 'in', weight: 10, fineness: 740, basis: 'mazaneh', mazaneh: 398500000 };
const value = TR.tradeLine(line, { round: 10000 }).value;
const doc = await J('POST', '/api/books/docs', {
  type: 'trade',
  date: today,
  partyId: (party.party ?? party).id,
  lines: [line],
  payments: [{ method: 'cash', dir: 'out', amount: value }],
}, owner).catch((e) => (console.log('doc:', e.message), null));
const d = doc?.doc ?? doc;
if (d?.id) for (const kind of ['print', 'share']) await J('POST', `/api/books/docs/${d.id}/event`, { kind }, owner).catch(() => {});
console.log('bar document', d?.track ?? '(none)');

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: ['calm', 'classic'].includes(SKIN) ? 'dark' : 'light' });
await ctx.addInitScript((skin) => {
  try {
    localStorage.setItem('beatris.theme', skin);
  } catch {}
}, SKIN);
const page = await ctx.newPage();
const boxes = {};
const box = async (name, sel) => {
  const b = await page.$eval(sel, (e) => {
    const r = e.getBoundingClientRect();
    return { x: r.x + scrollX, y: r.y + scrollY, w: r.width, h: r.height }; // page coordinates: the shots are full pages
  }).catch(() => null);
  if (b) boxes[name] = b;
};
const shot = async (file, ...sels) => {
  for (const [name, sel] of sels) await box(`${file}:${name}`, sel);
  await page.screenshot({ path: path.join(OUT, `${file}.jpg`), type: 'jpeg', quality: 92, fullPage: true });
  console.log('shot', file);
};

try {
  await page.goto(`${base}/login`);
  await page.fill('#ef input[name=email]', 'owner@demo.beatris.ir');
  await page.click('#ef button[type=submit]');
  await page.waitForSelector('.lg-dev', { timeout: 20000 });
  await page.click('.lg-dev');
  await Promise.race([page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20000 }), page.waitForSelector('.lg-shops [data-act=pick]', { timeout: 20000 }).then((b) => b.click())]);
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20000 });

  /* the quick entry at the counter: the bar typed in, its line, booked, then the same bar sold back */
  await page.evaluate(() => localStorage.removeItem('beatris.melt.session'));
  await page.goto(`${base}/tools/melt`);
  await page.waitForSelector('#mf [name=w]');
  await wait(1500);
  await page.fill('#mf [name=mid]', '40000000');
  await page.fill('#mf [name=spread]', '150000');
  await page.fill('#mf [name=ayar]', ''); // the field opens on 740; the film types it
  await page.click('#mf [name=w]');
  await wait(600);
  // the live line's rows: مظنه, گرم ۱۸, معادل ۷۵۰, مبلغ, the two columns
  const rowsOf = (pre, sel, n) => Array.from({ length: n }, (_, i) => [`${pre}${i + 1}`, `${sel} > div:nth-child(${i + 1})`]);
  const form = [['form', '#mf'], ['w', '#mf [name=w]'], ['ayar', '#mf [name=ayar]'], ['mid', '#mf [name=mid]'], ['live', '#live'], ['book', '#book'], ...rowsOf('live', '#live .ledger', 6)];
  await shot('melt-0-empty', ...form);
  await page.type('#mf [name=w]', '10', { delay: 60 });
  await wait(400);
  await shot('melt-1-weight', ...form);
  await page.type('#mf [name=ayar]', '740', { delay: 60 });
  await wait(700);
  await shot('melt-2-live', ...form);
  await page.press('#mf [name=w]', 'Enter');
  await wait(700);
  await shot('melt-3-booked', ...form, ['row1', '#book tbody tr:first-child'], ['totals', '#book .ledger'], ...rowsOf('total', '#book .ledger', 2));
  await page.click('#mf [data-side="sell"]');
  await page.fill('#mf [name=w]', '10');
  await page.press('#mf [name=w]', 'Enter');
  await wait(700);
  await shot('melt-4-sold', ...form, ['row2', '#book tbody tr:nth-child(2)'], ['totals', '#book .ledger'], ...rowsOf('total', '#book .ledger', 2));

  /* the trace page: the bar's tracking code answers with its document's whole life */
  if (d?.track) {
    await page.goto(`${base}/books/trace?q=${encodeURIComponent(d.track)}`);
    await page.waitForSelector('#tr > *', { timeout: 20000 });
    await wait(1800);
    // the parts of the answer (headings, tables, lists), so the film's camera can find the document's life on the page
    boxes['trace:parts'] = await page.$$eval('#tr h2, #tr h3, #tr h4, #tr table, #tr ol, #tr ul, #tr section', (els) =>
      els.map((e) => {
        const r = e.getBoundingClientRect();
        return { tag: e.tagName.toLowerCase(), text: e.textContent.trim().replace(/\s+/g, ' ').slice(0, 60), x: r.x + scrollX, y: r.y + scrollY, w: r.width, h: r.height };
      }));
    await shot('trace', ['find', '#tf'], ['result', '#tr']);
  }
  writeFileSync(path.join(OUT, 'boxes.json'), `${JSON.stringify({ skin: SKIN, scale: 2, viewport: [1440, 900], track: d?.track ?? null, boxes }, null, 1)}\n`);
} finally {
  await browser.close();
  server.kill();
}
