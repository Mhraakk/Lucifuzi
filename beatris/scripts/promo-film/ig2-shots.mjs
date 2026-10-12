// اینفوگرافیک تذهیب: the real screens the poster shows, captured from a fresh demo server at twice the density.
//   node scripts/promo-film/ig2-shots.mjs            → scripts/promo-film/ig2/*.jpg
// The card reader is a stand-in bridge that holds each charge at «swipe the card» until the shot is taken, then approves
// it, exactly as tests/pos.test.mjs's simulated terminal answers; every amount and code on the screens is the app's own.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as TR from '../../public/js/trade.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'scripts/promo-film/ig2');
mkdirSync(OUT, { recursive: true });
const pw = await import(process.env.PLAYWRIGHT ?? '/opt/node22/lib/node_modules/playwright/index.mjs');
const { chromium } = pw.default ?? pw;

const port = 5900 + Math.floor(Math.random() * 300);
const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/index.mjs'], { cwd: ROOT, env: { ...process.env, BEATRIS_DEMO: 'true', BEATRIS_DATA_DIR: mkdtempSync(path.join(tmpdir(), 'big2-')), PORT: String(port), NODE_ENV: 'test', BEATRIS_TOKEN_SECRET: 'infographic-secret-0123456789abcdef' }, stdio: ['ignore', 'ignore', 'inherit'] });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 80 && !(await fetch(`${base}/api/health`).then((r) => r.ok).catch(() => false)); i++) await wait(250);

const J = (m, p, b, t) => fetch(base + p, { method: m, headers: { 'content-type': 'application/json', ...(t ? { authorization: `Bearer ${t}` } : {}) }, body: b ? JSON.stringify(b) : undefined }).then(async (r) => {
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
const ago = (n) => new Date(Date.parse(`${today}T00:00:00Z`) - n * 864e5).toISOString().slice(0, 10);

/* ---------------- a believable week in the shop, all through the API ---------------- */
const owner = await tokenOf('owner@demo.beatris.ir');
const names = [['رضا تهرانی', '09121234501'], ['مریم رضایی', '09121234502'], ['نیما کاشانی', '09121234503'], ['سارا امینی', '09121234504'], ['کاوه صدری', '09121234505']];
const parties = [];
for (const [name, mobile] of names) {
  const r = await J('POST', '/api/books/parties', { name, mobile }, owner);
  parties.push(r.party ?? r);
}
const pid = (i) => parties[i % parties.length].id;
const trade = async (date, partyId, lines, payMethod = 'cash') => {
  const value = lines.reduce((s, l) => s + (TR.tradeLine(l, { round: 10000 }).value || 0) * (l.dir === 'out' ? 1 : -1), 0);
  const payments = value ? [{ method: payMethod, dir: value > 0 ? 'in' : 'out', amount: Math.abs(value), ...(payMethod === 'c2c' ? { card: '6543', ref: String(5550000 + Math.abs(value) % 99999) } : {}) }] : [];
  return J('POST', '/api/books/docs', { type: 'trade', date, partyId, lines, payments }, owner).catch((e) => console.log('seed:', e.message));
};
const maz = [398000000, 401500000, 399200000, 403800000, 402600000, 405100000, 404000000];
for (let d = 6; d >= 0; d--) {
  const m = maz[6 - d];
  await trade(ago(d), pid(d), [{ kind: 'melt', dir: 'in', weight: 8.4 + d, fineness: 740, basis: 'mazaneh', mazaneh: m }]);
  await trade(ago(d), pid(d + 1), [{ kind: 'melt', dir: 'out', weight: 5.2 + d / 2, fineness: 750, basis: 'mazaneh', mazaneh: m + 2500000 }], 'c2c');
  await trade(ago(d), pid(d + 2), [{ kind: 'coin', dir: 'out', coin: 'emami', count: 1 + (d % 3), basis: 'count', price: 987650000 + d * 1500000 }]);
  if (d % 2 === 0) await trade(ago(d), pid(d + 3), [{ kind: 'coin', dir: 'in', coin: 'half', count: 2, basis: 'count', price: 520000000 + d * 900000 }]);
}
// an official sale invoice for the print shot
const inv = await J('POST', '/api/books/docs', { type: 'sale', date: today, partyId: pid(1), lines: [{ kind: 'jewel', title: 'انگشتر طلای ۱۸ عیار', weight: 10, fineness: 750, p750: 2400000, ojratMode: 'pct', ojrat: 15, profitPct: 7 }], payments: [{ method: 'pos', dir: 'in', amount: 30085200, account: 'bank-main', ref: '863583063456' }], status: 'final' }, owner).catch((e) => (console.log('invoice:', e.message), null));

/* ---------------- the stand-in card reader: holds at «swipe the card» until released ---------------- */
const jobs = new Map();
let hold = true;
const mock = createServer((req, res) => {
  const send = (code, obj) => (res.writeHead(code, { 'content-type': 'application/json', 'access-control-allow-origin': base, 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type', 'access-control-allow-private-network': 'true' }), res.end(obj ? JSON.stringify(obj) : ''));
  if (req.method === 'OPTIONS') return send(204);
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const b = body ? JSON.parse(body) : {};
    if (req.url === '/status') return send(200, { ok: true, app: 'beatris-pos', version: '1.0.0', busy: false });
    if (req.url === '/charge') {
      if (!jobs.has(b.id)) jobs.set(b.id, { id: b.id, amount: b.amount, driver: b.driver, state: 'waiting' });
      return send(202, jobs.get(b.id));
    }
    const m = req.url.match(/^\/charge\/([\w-]+)/);
    const j = m && jobs.get(m[1]);
    if (!j) return send(404, { error: 'not found' });
    if (!hold && j.state === 'waiting') Object.assign(j, { state: 'approved', code: '00', rrn: '863583063456', stan: '801912', card: '1234', terminal: '12345678', message: 'تراکنش موفق' });
    send(200, j);
  });
});
await new Promise((r) => mock.listen(0, '127.0.0.1', r));
const bport = mock.address().port;

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const shot = async (target, file, opts = {}) => {
  await target.screenshot({ path: path.join(OUT, file), type: 'jpeg', quality: 90, ...opts });
  console.log('shot', file);
};
const settle = async (page, ms = 1800) => {
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
  await wait(ms);
};
async function signIn(page, email) {
  await page.goto(`${base}/login`);
  await page.fill('#ef input[name=email]', email);
  await page.click('#ef button[type=submit]');
  await page.waitForSelector('.lg-dev', { timeout: 20000 });
  await page.click('.lg-dev');
  await Promise.race([page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20000 }), page.waitForSelector('.lg-shops [data-act=pick]', { timeout: 20000 }).then((b) => b.click())]);
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20000 });
}
const desktop = async () => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: 'dark' });
  await ctx.addInitScript(() => {
    try {
      if (!sessionStorage.getItem('ig-skin')) localStorage.setItem('beatris.theme', 'calm'), sessionStorage.setItem('ig-skin', '1');
    } catch {}
  });
  return ctx;
};
const phone = async () => browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, colorScheme: 'dark' });

try {
  /* 1. sign-in by email, on a phone */
  {
    const ctx = await phone();
    const p = await ctx.newPage();
    await p.goto(`${base}/login`);
    await settle(p, 3500);
    await p.fill('#ef input[name=email]', 'owner@demo.beatris.ir');
    await shot(p, 'login-email.jpg');
    await p.click('#ef button[type=submit]');
    await p.waitForSelector('.lg-dev');
    await wait(900);
    const code = await p.$eval('.lg-dev', (b) => b.dataset.code);
    await p.fill('.otp-input', code.slice(0, 4)); // four of six digits: the cells mid-typing
    await wait(500);
    await shot(p, 'login-code.jpg');
    await ctx.close();
  }
  /* 2. the coin of the sign-in page, large */
  {
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2, colorScheme: 'dark' });
    const p = await ctx.newPage();
    await p.goto(`${base}/login`);
    await settle(p, 7000);
    // the coin alone: a square around the centre of the turning-coin area
    const a = await (await p.$('#art')).boundingBox();
    const side = Math.round(Math.min(a.width, a.height) * 0.62);
    await shot(p, 'coin-hero.jpg', { clip: { x: Math.round(a.x + a.width / 2 - side / 2), y: Math.round(a.y + a.height / 2 - side / 2), width: side, height: side } });
    await ctx.close();
  }
  /* 3. the counter computer: its card reader, the one-tap button, the card window, the receipt; the vendor's email card */
  const dctx = await desktop();
  const d = await dctx.newPage();
  await signIn(d, 'owner@demo.beatris.ir');
  await d.evaluate((b) => localStorage.setItem('beatris.pos', JSON.stringify({ on: true, driver: 'sep', host: '192.168.1.50', port: 1197, bridge: b, station: true, stationName: 'پیشخوان اصلی' })), bport);
  await d.goto(`${base}/vendor`);
  await settle(d);
  await d.$eval('#vdMail details', (x) => (x.open = true)).catch(() => {});
  // the card names the address it runs on; this film-set server shows the one customers really use
  await d.evaluate(() => document.querySelectorAll('#vdMail code').forEach((c) => (c.textContent = c.textContent.replace(/https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/, 'https://beatris-production-68ac.up.railway.app'))));
  await wait(400);
  await shot(await d.$('#vdMail'), 'vendor-email.jpg');
  await d.goto(`${base}/books/desk`);
  await settle(d, 2200);
  const fresh = await d.$('[data-act=fresh]');
  if (fresh) await fresh.click();
  await d.click('[data-act=pnew]');
  await d.fill('#np [name=name]', 'نگار شریفی');
  await d.fill('#np [name=mobile]', '09121119977');
  await d.click('#np button:not([type])');
  await d.waitForSelector('.dk-who');
  await d.click('[data-mode=sell]');
  await d.click('[data-kind=coin]');
  await d.click('[data-coin=emami]');
  await d.fill('[data-f=count]', '1');
  await d.fill('[data-f=price]', '987650000');
  await d.click('[data-act=add]');
  await d.click('[data-pm=cash]');
  await d.fill('[data-p="0"][data-k=amount]', '7650000');
  await wait(900);
  await shot(d, 'desk-pay.jpg');
  await shot(await d.$('.dk-side'), 'desk-side.jpg');
  await d.click('.dk-save [data-act=paycard]');
  await d.waitForFunction(() => /کارت را بکشید/.test(document.querySelector('.pos-box')?.textContent ?? ''), null, { timeout: 15000 });
  await wait(700);
  await shot(await d.$('.modal [role=dialog]'), 'card-window.jpg');
  hold = false;
  await d.waitForSelector('.dk-receipt', { timeout: 20000 });
  await wait(1200);
  await shot(await d.$('.dk-receipt'), 'receipt.jpg');
  // the whole slip, down to the card line with its bank reference: let the dialog grow instead of scrolling
  await d.$eval('.dk-receipt', (el) => {
    for (let n = el; n && n !== document.body; n = n.parentElement) { n.style.maxHeight = 'none'; n.style.overflow = 'visible'; }
    // the app bar floats over a tall slip; it is not part of the receipt
    for (const x of document.querySelectorAll('body *')) if (/fixed|sticky/.test(getComputedStyle(x).position) && !x.contains(el)) x.style.visibility = 'hidden';
  });
  await wait(300);
  await shot(await d.$('.dk-receipt'), 'receipt-full.jpg');
  await d.keyboard.press('Escape');
  /* 4. a phone without a card reader sends its sale to this counter */
  hold = true;
  await d.goto(`${base}/books/desk`);
  await settle(d, 1500);
  await d.waitForSelector('.pos-station', { timeout: 10000 });
  const pctx = await phone();
  const ph = await pctx.newPage();
  await signIn(ph, 'manager@demo.beatris.ir');
  await ph.evaluate(() => localStorage.setItem('beatris.pos', JSON.stringify({ relay: true })));
  await ph.goto(`${base}/books/desk`);
  await settle(ph, 2000);
  const f2 = await ph.$('[data-act=fresh]');
  if (f2) await f2.click();
  await ph.click('[data-act=pnew]');
  await ph.fill('#np [name=name]', 'کیان مقدم');
  await ph.fill('#np [name=mobile]', '09121119966');
  await ph.click('#np button:not([type])');
  await ph.waitForSelector('.dk-who');
  await ph.click('[data-mode=sell]');
  await ph.click('[data-kind=coin]');
  await ph.click('[data-coin=emami]');
  await ph.fill('[data-f=count]', '2');
  await ph.fill('[data-f=price]', '987650000');
  await ph.click('[data-act=add]');
  await ph.waitForSelector('#bar [data-act=paycard]');
  await wait(600);
  await shot(ph, 'phone-desk.jpg');
  await ph.click('#bar [data-act=paycard]');
  await d.waitForFunction(() => /کارت را بکشید/.test(document.querySelector('.pos-station')?.textContent ?? ''), null, { timeout: 20000 });
  await ph.waitForFunction(() => /پیشخوان/.test(document.querySelector('.pos-box')?.textContent ?? ''), null, { timeout: 20000 });
  await wait(900);
  await shot(ph, 'phone-relay.jpg');
  await shot(d, 'counter-badge.jpg');
  await shot(await d.$('.pos-station'), 'counter-pill.jpg');
  hold = false;
  await ph.waitForSelector('.dk-receipt', { timeout: 25000 });
  await wait(1000);
  await shot(ph, 'phone-receipt.jpg');
  await pctx.close();
  /* 5. the rest of the shop's day */
  for (const [url, file, ms] of [
    ['/books/pulse', 'pulse.jpg', 3500],
    ['/books/dashboard', 'dashboard.jpg', 3500],
    ['/books/day', 'daybook.jpg', 2500],
    ['/market', 'market.jpg', 4500],
    ['/books/elliott', 'elliott.jpg', 5000],
    ['/books/smart?t=close', 'close.jpg', 3000],
    ['/books/reports?tab=pnl', 'pnl.jpg', 3000],
    ['/coins?mode=seal', 'coinlab.jpg', 9000],
    ['/studio', 'studio.jpg', 9000],
  ]) {
    await d.goto(base + url);
    await settle(d, ms);
    await shot(d, file);
  }
  if (inv) {
    const id = inv.id ?? inv.doc?.id;
    await d.goto(`${base}/books/doc/${id}`);
    await settle(d, 2500);
    let paper = await d.$('.bk-paper');
    if (paper) await shot(paper, 'invoice.jpg');
    const a4 = await d.$('[data-fmt=a4]');
    if (a4) {
      await a4.click();
      await d.waitForSelector('.bk-paper.a4', { timeout: 8000 }).catch(() => {});
      await wait(800);
      paper = await d.$('.bk-paper');
      if (paper) await shot(paper, 'invoice-a4.jpg');
    }
    const code = paper ? (await d.$eval('.bk-p-verify b', (b) => b.textContent.trim()).catch(() => '')) : '';
    if (code) {
      const vctx = await phone();
      const v = await vctx.newPage();
      await v.goto(`${base}/verify/${code}`);
      await settle(v, 2000);
      await shot(v, 'verify.jpg');
      await vctx.close();
    }
  }
  await dctx.close();
} finally {
  await browser.close();
  mock.close();
  server.kill();
}
