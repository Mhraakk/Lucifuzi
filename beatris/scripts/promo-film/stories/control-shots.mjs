// spec 0047: the screens of film 3 «اتاق کنترل», captured from a fresh demo shop at twice the density in the app's dark
// skin: every tab of /books/control, the explain popover and the clue palette. Three weeks of trades, two cheques due
// within ten days and one odd price go in through the API first, so every tool has something true to show.
//   node scripts/promo-film/stories/control-shots.mjs [--skin=calm] [--out=shots-calm]   → stories/<out>/*.jpg
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as TR from '../../../public/js/trade.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const SKIN = arg('skin') ?? 'calm';
const OUT = path.join(HERE, arg('out') ?? `shots-${SKIN}`);
mkdirSync(OUT, { recursive: true });
const pw = await import(process.env.PLAYWRIGHT ?? '/opt/node22/lib/node_modules/playwright/index.mjs');
const { chromium } = pw.default ?? pw;

const port = 6300 + Math.floor(Math.random() * 300);
const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/index.mjs'], { cwd: ROOT, env: { ...process.env, BEATRIS_DEMO: 'true', BEATRIS_DATA_DIR: mkdtempSync(path.join(tmpdir(), 'ctl-')), PORT: String(port), NODE_ENV: 'test', BEATRIS_TOKEN_SECRET: 'control-film-secret-0123456789abcdef' }, stdio: ['ignore', 'ignore', 'inherit'] });
process.on('exit', () => server.kill()); // a failed seed must not leave the server behind
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 80 && !(await fetch(`${base}/api/health`).then((r) => r.ok).catch(() => false)); i++) await wait(250);
const J = (m, p, b, t) => fetch(base + p, { method: m, headers: { 'content-type': 'application/json', ...(t ? { authorization: `Bearer ${t}` } : {}) }, body: b ? JSON.stringify(b) : undefined }).then(async (r) => {
  const j = await r.json();
  if (!r.ok) throw new Error(`${m} ${p}: ${j.error}`);
  return j;
});
const s = await J('POST', '/api/auth/code', { email: 'owner@demo.beatris.ir' });
let v = await J('POST', '/api/auth/verify', { email: 'owner@demo.beatris.ir', code: s.code });
if (v.shops) v = await J('POST', '/api/auth/finish', { ticket: v.ticket, tenant: v.shops[0].tenant });
const owner = v.token;
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran' }).format(new Date());
const ago = (n) => new Date(Date.parse(`${today}T00:00:00Z`) - n * 864e5).toISOString().slice(0, 10);

/* ---------------- three weeks of a counter, all through the API ---------------- */
const names = [['رضا تهرانی', '09121234501'], ['مریم رضایی', '09121234502'], ['نیما کاشانی', '09121234503'], ['سارا امینی', '09121234504'], ['کاوه صدری', '09121234505'], ['لیلا مرادی', '09121234506']];
const parties = [];
for (const [name, mobile] of names) parties.push((r => r.party ?? r)(await J('POST', '/api/books/parties', { name, mobile }, owner)));
const pid = (i) => parties[i % parties.length].id;
const trade = (date, partyId, lines, payments) => {
  const value = lines.reduce((x, l) => x + TR.tradeLine(l, { round: 10000 }).value * (l.dir === 'out' ? 1 : -1), 0);
  const pays = payments ?? (value ? [{ method: 'cash', dir: value > 0 ? 'in' : 'out', amount: Math.abs(value) }] : []);
  return J('POST', '/api/books/docs', { type: 'trade', date, partyId, lines, payments: pays }, owner).catch((e) => console.log('seed:', e.message));
};
for (let d = 20; d >= 0; d--) {
  const m = 398000000 + Math.round(Math.sin(d / 3) * 4000000) + (20 - d) * 350000;
  await trade(ago(d), pid(d), [{ kind: 'melt', dir: 'in', weight: 6.2 + (d % 5) * 1.7, fineness: 740, basis: 'mazaneh', mazaneh: m }]);
  await trade(ago(d), pid(d + 1), [{ kind: 'melt', dir: 'out', weight: 4.1 + (d % 4) * 1.3, fineness: 750, basis: 'mazaneh', mazaneh: m + 2500000 }]);
  if (d % 2 === 0) await trade(ago(d), pid(d + 2), [{ kind: 'coin', dir: 'out', coin: 'emami', count: 1 + (d % 3), basis: 'count', price: 987650000 + d * 1500000 }]);
  if (d % 3 === 0) await trade(ago(d), pid(d + 3), [{ kind: 'coin', dir: 'in', coin: 'half', count: 2, basis: 'count', price: 520000000 + d * 900000 }]);
}
// gold left on a customer's account (no price: a balance in grams), and two cheques due within ten days
await trade(ago(4), pid(2), [{ kind: 'melt', dir: 'in', weight: 12.5, fineness: 750, priced: false }], []);
// (a receipt is a toman document: its figures are tomans, the books keep rials)
for (const [k, days, amt, no] of [[0, 3, 145000000, '4410217'], [4, 8, 98000000, '7788991']])
  await J('POST', '/api/books/docs', { type: 'receipt', date: ago(1), partyId: pid(k), payments: [{ method: 'cheque', dir: 'in', amount: amt, chequeNo: no, bank: 'ملت', due: ago(-days) }] }, owner).catch((e) => console.log('cheque:', e.message));
// one odd price: a sale far under the day's مظنه, the kind of thing «استثناها» is for
await trade(today, pid(5), [{ kind: 'melt', dir: 'out', weight: 9.8, fineness: 750, basis: 'mazaneh', mazaneh: 352000000 }]);

/* ---------------- the screens ---------------- */
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: ['calm', 'classic'].includes(SKIN) || /^dark/.test(SKIN) ? 'dark' : 'light' });
await ctx.addInitScript((skin) => {
  try {
    localStorage.setItem('beatris.theme', skin);
  } catch {}
}, SKIN);
const page = await ctx.newPage();
await page.goto(`${base}/login`);
await page.fill('#ef input[name=email]', 'owner@demo.beatris.ir');
await page.click('#ef button[type=submit]');
await page.waitForSelector('.lg-dev', { timeout: 20000 });
await page.click('.lg-dev');
await Promise.race([page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20000 }), page.waitForSelector('.lg-shops [data-act=pick]', { timeout: 20000 }).then((b) => b.click())]);
await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20000 });
const shot = async (file, target = page) => {
  await target.screenshot({ path: path.join(OUT, file), type: 'jpeg', quality: 90 });
  console.log('shot', file);
};
const settle = async (ms = 2200) => {
  await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {});
  await wait(ms);
};
try {
  for (const t of ['overview', 'exceptions', 'simulate', 'twin', 'lots', 'story', 'trial', 'forecast', 'approvals', 'periods', 'close', 'karat']) {
    await page.goto(`${base}/books/control?t=${t}`);
    await settle();
    await shot(`control-${t}.jpg`);
  }
  // the explain popover on the first «؟» of the overview
  await page.goto(`${base}/books/control`);
  await settle();
  const why = await page.$('.ctl-why');
  if (why) {
    await why.click();
    await wait(1500);
    await shot('control-explain.jpg');
  }
  // the clue palette with a name and a figure
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+k');
  await wait(600);
  await page.keyboard.type('کاشانی', { delay: 60 });
  await wait(1500);
  await shot('control-palette.jpg');
  await page.keyboard.press('Escape');
  await page.goto(`${base}/books/pulse`);
  await settle(3000);
  await shot('pulse.jpg');
  await page.goto(`${base}/books/dashboard`);
  await settle(3500);
  await shot('dashboard.jpg');
} finally {
  await browser.close();
  server.kill();
}
