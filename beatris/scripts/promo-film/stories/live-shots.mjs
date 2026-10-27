// spec 0051: the app's own screens for «تابلوی زنده», taken from a fresh demo server that reads forgod's real answer of
// 4 Aban 1405, 16:48 Tehran, through forgod-replay.mjs (nothing is sent to forgod), with the server's and the
// browser's clocks at 16:50 of that day. Day skin, 1920×1080 at twice the density.
//   FORGOD_ANSWER=<saved /api/all answer> node scripts/promo-film/stories/live-shots.mjs
//     → stories/shots-live/*.png (not in the repository) and stories/live-app.json (what the app worked out)
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const OUT = path.join(HERE, 'shots-live');
const ANSWER = process.env.FORGOD_ANSWER;
if (!ANSWER) throw new Error('FORGOD_ANSWER: the saved /api/all answer');
const NOW = '2026-10-26T13:20:00Z'; // 16:50 in Tehran, two minutes after the answer
const LINE = 'خرید از مریم رضایی ۱۲٫۴۵ گرم آبشده ۷۵۰ ۲۰ خط زیر مظنه نقد ثبت کن';
mkdirSync(OUT, { recursive: true });
const pw = await import(process.env.PLAYWRIGHT ?? '/opt/node22/lib/node_modules/playwright/index.mjs');
const { chromium } = pw.default ?? pw;

const port = 6300 + Math.floor(Math.random() * 300);
const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', '--import', path.join(HERE, 'forgod-replay.mjs'), 'server/index.mjs'], {
  cwd: ROOT,
  env: { ...process.env, BEATRIS_DEMO: 'true', BEATRIS_DATA_DIR: mkdtempSync(path.join(tmpdir(), 'live-film-')), PORT: String(port), NODE_ENV: 'test', BEATRIS_TOKEN_SECRET: 'live-film-secret-0123456789abcdef', BEATRIS_MARKET_FEED: 'forgod', BEATRIS_FORGOD_KEY: 'film-capture-no-real-key', FORGOD_ANSWER: ANSWER, FAKE_NOW: NOW },
  stdio: ['ignore', 'ignore', 'inherit'],
});
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
const browser = await chromium.launch();
const app = {};
try {
  const owner = await tokenOf('owner@demo.beatris.ir');
  await J('POST', '/api/books/parties', { name: 'مریم رضایی', mobile: '09121234502' }, owner);
  const st = (await J('POST', '/api/market/sync', {}, owner)).status ?? {};
  const board = await J('GET', '/api/market', null, owner);
  const feed = await J('GET', '/api/market/feed', null, owner);
  const item = (id) => board.items.find((x) => x.id === id);
  Object.assign(app, {
    now: NOW,
    sync: { ok: st.ok, quotes: st.quotes, fx: st.fx, sources: st.sources },
    today: board.today,
    source: board.source,
    board: Object.fromEntries(board.items.filter((x) => !x.empty).map((x) => [x.id, { d: x.d, c: x.c }])),
    fx: board.fx,
    quota: { used: feed.forgod?.used, daily: feed.forgod?.daily, reserve: feed.forgod?.reserve, auto: feed.forgod?.auto, dayEvery: feed.forgod?.dayEvery, nightEvery: feed.forgod?.nightEvery },
  });
  if (!st.ok || item('geram18')?.c !== 26459000 || board.fx?.rates?.length !== 25) throw new Error(`the replayed answer did not land: ${JSON.stringify(app.sync)}`);

  // a shop in Iran: the browser keeps Tehran time, as the shop's own computer does
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2, colorScheme: 'light', timezoneId: 'Asia/Tehran', locale: 'fa-IR' });
  await ctx.clock.setFixedTime(new Date(Date.parse(NOW) + 30000));
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('beatris.theme', 'day');
    } catch {}
  });
  const p = await ctx.newPage();
  const shot = async (target, name) => {
    await (target ?? p).screenshot({ path: path.join(OUT, name), ...(target ? {} : { fullPage: false }) });
    console.log('shot', name);
  };
  // where things sit on each screen (CSS px of the 1920 × 1080 window), so the film's marks land on them
  app.boxes = {};
  const box = async (shotName, name, sel) => {
    const r = await p.$eval(sel, (e) => { const b = e.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; }).catch(() => null);
    (app.boxes[shotName] ??= {})[name] = r;
  };
  const go = async (route, ms = 2200) => {
    await p.goto(base + route, { waitUntil: 'domcontentloaded' });
    await wait(ms);
  };
  // sign in as the shop's owner (the demo shows the code)
  await p.goto(`${base}/login`);
  await p.fill('#ef input[name=email]', 'owner@demo.beatris.ir');
  await p.click('#ef button[type=submit]');
  await p.waitForSelector('.lg-dev', { timeout: 20000 });
  await p.click('.lg-dev');
  await Promise.race([p.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20000 }), p.waitForSelector('.lg-shops [data-act=pick]', { timeout: 20000 }).then((b) => b.click())]);
  await p.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20000 });

  /* the market page: the board with bitcoin, and the currency table */
  await go('/market', 3000);
  await p.waitForSelector('#fx .mk-fx', { timeout: 15000 });
  await shot(null, 'market-top.png');
  for (const [n, sel] of [['board', '#board'], ['btc', '#board [data-sym=btc]'], ['geram18', '#board [data-sym=geram18]'], ['usd', '#board [data-sym=usd]'], ['fx', '#fx'], ['eur', '#fx .mk-fx div:nth-child(2)'], ['source', '#src'], ['badge', '#src .stamp']]) await box('market-top', n, sel);
  await shot(await p.$('#board'), 'market-board.png');
  await shot(await p.$('#fx'), 'market-fx.png');
  app.fxText = (await p.innerText('#fx')).replace(/\s+/g, ' ').slice(0, 400);

  /* the data page: forgod, its allowance and plan */
  await go('/market/data', 2500);
  await shot(null, 'marketdata-top.png');
  await box('marketdata-top', 'fgbox', '#fgbox');
  const fg = await p.$('#fgbox');
  if (fg) {
    await fg.scrollIntoViewIfNeeded();
    await shot(fg, 'marketdata-forgod.png');
    app.forgodText = (await fg.innerText()).replace(/\s+/g, ' ').slice(0, 600);
  }

  /* the desk: a euro line starts at the live euro rate, in rial */
  await go('/books/desk', 2500);
  const fresh = await p.$('[data-act=fresh]');
  if (fresh) await fresh.click(), await wait(400);
  await p.click('[data-kind=fx]');
  await p.selectOption('[data-f=code]', 'EUR');
  await wait(500);
  await p.fill('[data-f=fxAmount]', '۱۰۰۰'); // a thousand euros: the line has its amount, so the form shows no warning
  await wait(700);
  app.euroRate = await p.$eval('[data-f=rate]', (i) => i.value);
  await shot(null, 'desk-euro.png');
  for (const [n, sel] of [['rate', '[data-f=rate]'], ['code', '[data-f=code]'], ['amount', '[data-f=fxAmount]']]) await box('desk-euro', n, sel);
  const form = await p.$('[data-f=rate]').then((h) => h?.evaluateHandle((i) => i.closest('form, .dk-form, .dk-line, section') ?? i.parentElement));
  if (form) await shot(form.asElement(), 'desk-euro-form.png');

  /* the desk in the market's own words: the sentence, its parts, the مظنه from the board, then the booked document */
  await go('/books/desk', 2500);
  const fresh2 = await p.$('[data-act=fresh]');
  if (fresh2) await fresh2.click(), await wait(400);
  await p.keyboard.press('F3');
  await p.keyboard.type(LINE, { delay: 12 });
  await wait(900);
  app.line = LINE;
  app.lineOut = (await p.innerText('#dkLineOut')).replace(/\s+/g, ' ').slice(0, 500);
  await shot(null, 'desk-line.png');
  for (const [n, sel] of [['line', '#dkLine'], ['out', '#dkLineOut'], ['parts', '#dkLineOut .dk-cmd-parts'], ['price', '#dkLineOut .dk-cmd-price'], ['strip', '.dk-prices, .dk-strip']]) await box('desk-line', n, sel);
  const bar = await p.$('#dkLine').then((h) => h?.evaluateHandle((i) => i.closest('.dk-cmd, form, section') ?? i.parentElement));
  if (bar) await shot(bar.asElement(), 'desk-line-bar.png');
  await shot(await p.$('#dkLineOut'), 'desk-line-out.png');
  await p.keyboard.press('Enter');
  await p.waitForSelector('.dk-receipt', { timeout: 15000 });
  await wait(1200);
  app.track = (await p.innerText('.dk-r-track b')).trim();
  app.receiptText = (await p.innerText('.dk-receipt')).replace(/\s+/g, ' ').slice(0, 500);
  await shot(null, 'desk-receipt.png');
  for (const [n, sel] of [['receipt', '.dk-receipt'], ['track', '.dk-r-track']]) await box('desk-receipt', n, sel);
  await shot(await p.$('.dk-receipt'), 'desk-receipt-card.png');
  const list = await J('GET', `/api/books/docs?q=${encodeURIComponent('مریم رضایی')}&limit=1`, null, owner);
  const doc = await J('GET', `/api/books/docs/${list.items[0].id}`, null, owner);
  app.doc = { id: doc.id, date: doc.date, lines: doc.lines?.map((l) => ({ kind: l.kind, dir: l.dir, weight: l.weight, fineness: l.fineness, mazaneh: l.mazaneh, value: l.value })), calc: doc.calc, payments: doc.payments?.map((x) => ({ method: x.method, dir: x.dir, amount: x.amount })) };
  await ctx.close();
} finally {
  await browser.close();
  server.kill();
}
writeFileSync(path.join(HERE, 'live-app.json'), `${JSON.stringify(app, null, 1)}\n`);
console.log('live-app.json:', JSON.stringify({ euroRate: app.euroRate, track: app.track, quota: app.quota, sync: app.sync }));
