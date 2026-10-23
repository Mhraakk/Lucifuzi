// The real screens the promo pieces show (infographic, teaser), captured from a fresh demo server at twice the density.
//   node scripts/promo-film/app-shots.mjs [--skin=day] [--out=shots-day]   → scripts/promo-film/<out>/*.jpg
// The skin is the app's own (spec 0014): «day» is the ivory light one, «calm» the graphite dark one.
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
const arg = (k) => process.argv.map((a) => a.replace(/^--/, '')).find((a) => a.startsWith(`${k}=`))?.slice(k.length + 1);
const SKIN = arg('skin') ?? 'day';
const ONLY = arg('only'); // «sell»: just the live sales desk, the customer screen and the workspaces
const LIGHT = !['calm', 'classic'].includes(SKIN) && !/^dark/.test(SKIN);
const SCHEME = LIGHT ? 'light' : 'dark';
const OUT = path.join(ROOT, 'scripts/promo-film', arg('out') ?? `shots-${SKIN}`);
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
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: SCHEME });
  await skinned(ctx);
  return ctx;
};
// every page of the shoot wears the chosen skin, set before the app paints
const skinned = (ctx) =>
  ctx.addInitScript((skin) => {
    try {
      localStorage.setItem('beatris.theme', skin);
    } catch {}
  }, SKIN);
const phone = async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, colorScheme: SCHEME });
  await skinned(ctx);
  return ctx;
};

try {
  if (ONLY !== 'sell') {
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
  /* 2. the entrance (spec 0046): the liquid gold sculpture, at rest, drawn by its engine */
  {
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2, colorScheme: SCHEME });
    await skinned(ctx);
    const p = await ctx.newPage();
    await p.goto(`${base}/login`);
    await p.waitForFunction(() => document.querySelector('.sh-root')?.dataset.gl, null, { timeout: 30000 }).catch(() => {});
    await settle(p, 1500);
    await shot(p, 'entrance.jpg');
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
  await d.evaluate(() => document.querySelectorAll('#vdMail code').forEach((c) => (c.textContent = c.textContent.replace(/https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/, 'https://beatris-6u77.onrender.com'))));
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
    ['/', 'home.jpg', 3000],
    ['/learn', 'learn.jpg', 2500],
    ['/books/desk', 'desk-empty.jpg', 2500],
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
  }
  /* 6. the live sales desk (spec 0037), the customer's screen and each role's own desk (spec 0038) */
  {
    const p750 = 2400000;
    const items = async (tpl, title, showcase, batch) => (await J('POST', '/api/books/items', { tpl, title, showcase, batch }, owner)).items;
    const rings = await items('ring-w', 'انگشتر برگ زیتون', 'ویترین ۱', [{ weight: 3.42 }, { weight: 3.86, title: 'انگشتر برگ زیتون پهن' }, { weight: 4.15, title: 'انگشتر سولیتر نگین‌دار', tpl: 'ring-sol' }]);
    const ears = await items('er-stud', 'گوشواره میخی مروارید', 'ویترین ۲', [{ weight: 2.08 }, { weight: 1.84, title: 'گوشواره حلقه‌ای ریز', tpl: 'er-hoop' }]);
    await items('nk-pend', 'آویز ماه و ستاره', 'ویترین ۳', [{ weight: 2.62 }, { weight: 4.9, title: 'گردنبند ریویرا', tpl: 'nk-rivi' }]);
    await items('br-bangle', 'النگو ساده', 'ویترین ۴', [{ weight: 8.1 }, { weight: 7.6 }]);
    const mary = parties[1];
    // what she bought before: the desk reads her taste from these
    for (const [date, line] of [
      [ago(40), { kind: 'jewel', tpl: 'ring-w', title: 'انگشتر زنانه', weight: 3.1, fineness: 750, p750: 2280000, ojratMode: 'pct', ojrat: 18, profitPct: 7 }],
      [ago(12), { kind: 'jewel', tpl: 'er-drop', title: 'گوشواره آویز', weight: 2.4, fineness: 750, p750: 2350000, ojratMode: 'pct', ojrat: 18, profitPct: 7 }],
    ])
      await J('POST', '/api/books/docs', { type: 'sale', date, partyId: mary.id, lines: [line], payments: [], status: 'final' }, owner).catch((e) => console.log('history:', e.message));
    const sctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2, colorScheme: SCHEME });
    await skinned(sctx);
    const s = await sctx.newPage();
    await signIn(s, 'nima@demo.beatris.ir'); // a seller lands on the sales desk by himself
    await s.waitForURL((u) => u.pathname === '/books/sell', { timeout: 15000 });
    await settle(s, 1500);
    await s.click('#pq');
    await s.keyboard.type('رضایی', { delay: 40 });
    await s.waitForSelector(`#pdrop [data-pick="${mary.id}"]`);
    await s.click(`#pdrop [data-pick="${mary.id}"]`);
    await s.waitForSelector('.sl-file');
    await s.click(`.sl-item-main[data-add="${rings[0].id}"]`);
    await s.fill('#iq', ears[0].code);
    await s.press('#iq', 'Enter');
    await s.waitForFunction(() => document.querySelectorAll('#lines .sl-line').length === 2);
    await s.check(`[data-cmp="${rings[1].id}"]`);
    await s.check(`[data-cmp="${rings[2].id}"]`);
    await s.click('#tin summary');
    await s.fill('[data-t=weight]', '3.1');
    await s.click('[data-act=tin-add]');
    await s.click('[data-sc=disc3]');
    await s.click('[data-pay=cash]');
    const due = Number(await s.inputValue('[data-p="0"]'));
    await s.fill('[data-p="0"]', String(Math.round(due / 2 / 10000) * 10000));
    await s.click('[data-pay=c2c]');
    await s.evaluate(() => document.activeElement?.blur());
    await s.evaluate(() => document.querySelectorAll('#toasts .toast').forEach((t) => t.remove()));
    await s.evaluate(() => window.scrollTo(0, 0));
    await s.$eval('.sl-cart', (c) => (c.scrollTop = 0));
    await wait(700);
    await shot(s, 'sell.jpg');
    await s.$eval('.sl-cart', (c) => (c.scrollTop = 0));
    await wait(300);
    await shot(await s.$('.sl-cart'), 'sell-cart.jpg');
    await shot(await s.$('.sl-who'), 'sell-customer.jpg');
    await shot(await s.$('#what'), 'sell-whatif.jpg');
    // the customer's own screen, a second window of the same computer
    const scr = await sctx.newPage();
    await scr.setViewportSize({ width: 1280, height: 800 });
    await scr.goto(`${base}/books/sell/screen`);
    await scr.waitForSelector('.ss-lines .ss-line', { timeout: 10000 });
    await wait(800);
    await shot(scr, 'sell-screen.jpg');
    await s.bringToFront();
    await s.keyboard.press('Control+Enter');
    await s.waitForSelector('#done .sl-done', { timeout: 15000 });
    await scr.waitForSelector('.ss-thanks', { timeout: 10000 }).catch(() => {});
    await wait(800);
    await shot(scr, 'sell-thanks.jpg');
    await shot(await s.$('#done .sl-done'), 'sell-done.jpg');
    await scr.close();
    await s.goto(`${base}/work`);
    await s.waitForSelector('.wk-card', { timeout: 10000 });
    await settle(s, 1500);
    await shot(s, 'work-seller.jpg');
    await sctx.close();
    // the boss's desk, and the chooser in «من»
    const bctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2, colorScheme: SCHEME });
    await skinned(bctx);
    const b = await bctx.newPage();
    await signIn(b, 'manager@demo.beatris.ir');
    await b.waitForURL((u) => u.pathname === '/work', { timeout: 15000 });
    await b.waitForSelector('.wk-card', { timeout: 10000 });
    await settle(b, 2000);
    await shot(b, 'work-boss.jpg');
    await b.goto(`${base}/me#workspace`);
    await b.waitForSelector('#wsf .wsf-card');
    await settle(b, 800);
    await shot(await b.$('#wsf'), 'workspace.jpg');
    await bctx.close();
    // the same desk on a phone
    const mctx = await phone();
    const m = await mctx.newPage();
    await signIn(m, 'nima@demo.beatris.ir');
    await m.waitForURL((u) => u.pathname === '/books/sell', { timeout: 15000 });
    await settle(m, 1500);
    await m.click(`.sl-item-main[data-add="${rings[1].id}"]`).catch(() => {});
    await m.evaluate(() => document.querySelectorAll('#toasts .toast').forEach((t) => t.remove()));
    await wait(500);
    await shot(m, 'phone-sell.jpg');
    await mctx.close();
  }
} finally {
  await browser.close();
  mock.close();
  server.kill();
}
