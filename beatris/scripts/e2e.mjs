// End-to-end browser test: boots a throw-away server (demo accounts, temp DB) and drives
// every page with Playwright. Any page error, console error or failed check fails the run.
//
//   npm run e2e                       # uses the globally installed playwright
//   PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs npm run e2e
//   E2E_BASE=https://... E2E_PHONE=... E2E_PIN=... npm run e2e   # smoke-test a live deploy (read-only checks)
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pw = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs').catch(() => import('playwright'));
const { chromium } = pw.default ?? pw;

const live = !!process.env.E2E_BASE;
let base = process.env.E2E_BASE;
let server, dataDir;
if (!live) {
  dataDir = mkdtempSync(path.join(tmpdir(), 'beatris-e2e-'));
  const port = 4100 + Math.floor(Math.random() * 800);
  server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/index.mjs'], { cwd: ROOT, env: { ...process.env, BEATRIS_DEMO: 'true', BEATRIS_DATA_DIR: dataDir, PORT: String(port), NODE_ENV: 'test' }, stdio: ['ignore', 'pipe', 'pipe'] });
  base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 60; i++) {
    if (await fetch(`${base}/api/health`).then((r) => r.ok).catch(() => false)) break;
    await new Promise((r) => setTimeout(r, 250));
  }
}
const PHONE = process.env.E2E_PHONE || '09120000002'; // demo manager
const PIN = process.env.E2E_PIN || '1234';

const results = [];
const errors = [];
let offline = false;
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const step = async (name, fn) => {
  try {
    await fn();
  } catch (e) {
    check(name, false, e.message.split('\n')[0]);
  }
};

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

async function session(viewport) {
  const ctx = await browser.newContext({ viewport, acceptDownloads: true });
  const page = await ctx.newPage();
  const label = `${viewport.width}px`;
  page.on('pageerror', (e) => errors.push(`[${label}] ${page.url()} pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error' || offline) return;
    const t = m.text();
    if (/favicon|preload/.test(t)) return;
    if (/status of 401/.test(t) && page.url().includes('/login')) return; // the deliberate wrong-PIN attempt
    errors.push(`[${label}] ${page.url()} console: ${t.slice(0, 240)}`);
  });
  page.on('response', (r) => {
    if (r.status() >= 500) errors.push(`[${label}] ${r.status()} ${r.url()}`);
  });
  return { ctx, page, label };
}
const go = async (page, p, wait = 1200) => {
  await page.goto(base + p);
  await page.waitForTimeout(wait);
};
const text = (page, sel) => page.$eval(sel, (e) => e.innerText).catch(() => '');
const noBadNumbers = (s) => !/NaN|undefined|Infinity/.test(s);

async function loginUI(page) {
  await go(page, '/login', 800);
  await page.fill('input[name=phone]', PHONE);
  await page.fill('input[name=pin]', '0000');
  await page.click('button[type=submit]');
  await page.waitForTimeout(600);
  if (!live) check('login: wrong PIN shows an error', (await text(page, '#err')).length > 3);
  await page.fill('input[name=pin]', PIN);
  await page.click('button[type=submit]');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15000 });
  check('login: correct PIN reaches home', true);
}

/* ======================================================= desktop, full walk */
{
  const { page, ctx } = await session({ width: 1440, height: 900 });
  await step('login', () => loginUI(page));

  await step('home', async () => {
    await page.waitForTimeout(4000);
    const w = await text(page, '#w');
    check('home: hero weight computed from 3D model', /[۰-۹]/.test(w) && noBadNumbers(w), w);
    check('home: hero canvas present', !!(await page.$('.home-hero canvas')));
    await page.click('[data-act=alloy][data-id=au24]');
    await page.waitForTimeout(400);
    const w24 = await text(page, '#w');
    check('home: alloy switch changes weight', w24 !== w, `${w} → ${w24}`);
  });

  await step('learn', async () => {
    await go(page, '/learn');
    const n = await page.$$eval('a.row[href^="/learn/"]', (a) => a.length);
    check('learn: 9 courses listed', n === 9, String(n));
    await go(page, '/learn/c-rare');
    const lessons = await page.$$eval('a.course-row', (a) => a.length);
    check('course c-rare: 6 lessons', lessons === 6, String(lessons));
  });

  await step('lesson + quiz', async () => {
    await go(page, '/lesson/r1', 1500);
    const first = await page.$('[data-act=choose]');
    await first.click();
    await page.waitForTimeout(700);
    const marked = await page.$$eval('.opt.right, .opt.wrong', (x) => x.length);
    check('lesson: choice question is graded by the server', marked > 0);
    await go(page, '/lesson/r2', 1500);
    const form = await page.$('[data-numq="r2q1"]');
    await form.$eval('input', (i) => (i.value = '۲۸٫۲۰۵'));
    await form.$eval('button', (b) => b.click());
    await page.waitForTimeout(800);
    check('lesson: numeric answer in Persian digits accepted as correct', /right/.test(await page.$eval('[data-numq="r2q1"]', (f) => f.parentElement.innerHTML)));
    await page.click('[data-act=complete]');
    await page.waitForTimeout(1200);
    check('lesson: complete → next lesson', page.url().endsWith('/lesson/r3'), page.url());
  });

  await step('exam', async () => {
    const token = await page.evaluate(() => localStorage.getItem('beatris.token'));
    for (const id of ['r1', 'r2', 'r3', 'r4', 'r5', 'r6']) await page.evaluate(([id, t]) => fetch(`/api/lessons/${id}/complete`, { method: 'POST', headers: { authorization: `Bearer ${t}` } }), [id, token]);
    await go(page, '/exam/c-rare', 1500);
    const qs = await page.$$eval('[data-q]', (x) => new Set(x.map((e) => e.dataset.q)).size);
    check('exam: 12 or fewer questions drawn after all lessons', qs > 0 && qs <= 12, String(qs));
  });

  await step('tools', async () => {
    await go(page, '/tools');
    const ids = await page.$$eval('a.tool-card[href^="/tools/"]', (a) => a.map((x) => x.getAttribute('href').split('/').pop()));
    check('tools: 12 calculators listed', ids.length === 12, String(ids.length));
    for (const id of ids) {
      await go(page, `/tools/${id}`, 700);
      const out = await text(page, '#out');
      check(`tool ${id}: renders a clean result`, out.length > 10 && noBadNumbers(out));
    }
    await go(page, '/tools/alloy', 600);
    await page.fill('input[name=weight]', '100');
    await page.fill('input[name=fin]', '750');
    await page.fill('input[name=target]', '585');
    await page.fill('input[name=addf]', '0');
    await page.waitForTimeout(200);
    check('tool alloy: 100 g 750→585 needs ≈28.2 g', /۲۸٫۲/.test(await text(page, '#out')));
  });

  await step('practice', async () => {
    await go(page, '/practice');
    const scen = await page.$('a.row[href^="/scenario/"]');
    await scen.click();
    await page.waitForTimeout(1200);
    await page.click('[data-act=start]');
    for (let i = 0; i < 8; i++) {
      await page.waitForTimeout(500);
      const pick = await page.$('[data-act=pick]:not(:disabled)');
      if (!pick) break;
      await pick.click();
      await page.waitForTimeout(900);
      const nxt = await page.$('[data-act=next], [data-act=finish]');
      if (!nxt) break;
      const fin = await nxt.getAttribute('data-act');
      await nxt.click();
      if (fin === 'finish') break;
    }
    await page.waitForTimeout(1200);
    check('scenario: reaches a score', /٪/.test(await text(page, '#main')));
    await go(page, '/drill', 1000);
    check('drill: question rendered', !!(await page.$('.numq, [data-numq], form')));
    await go(page, '/cards', 1200);
    check('cards page renders', (await text(page, '#main')).length > 20);
  });

  await step('history', async () => {
    await go(page, '/history', 1000);
    const eras = await page.$$eval('.era-item', (x) => x.length);
    check('history: 9 eras', eras === 9, String(eras));
    await page.waitForFunction(() => document.querySelectorAll('.era-item img').length >= 2, null, { timeout: 90000 });
    check('history: artefacts rendered by the 3D engine', true);
  });

  await step('library + me + staff', async () => {
    await go(page, '/library');
    check('library renders', (await text(page, '#main')).length > 50);
    await go(page, '/me');
    check('me renders', (await text(page, '#main')).length > 50);
    await go(page, '/staff', 1500);
    const members = await page.$$eval('a[href^="/staff/"]', (a) => a.length);
    check('staff: team table renders', members > 2, String(members));
    await go(page, '/staff/queue');
    await go(page, '/staff/settings');
    check('staff settings renders', /قیمت/.test(await text(page, '#main')));
  });

  await step('studio', async () => {
    await page.evaluate(() => localStorage.removeItem('beatris.studio.v1'));
    await go(page, '/studio', 7000);
    const types = await page.$$eval('.piece-grid [data-type]', (b) => b.map((x) => x.dataset.type));
    check('studio: 15 piece types offered', types.length === 15, String(types.length));
    for (const t of types) {
      await page.click(`.piece-grid [data-type="${t}"]`);
      await page.waitForTimeout(t === 'chain' || t === 'relief' || t === 'coin' ? 5000 : 2600);
      const r = await text(page, '#readout');
      const val = r.split('\n')[0];
      check(`studio ${t}: builds with a positive weight/carat`, /[۱-۹]/.test(val) && noBadNumbers(r), val);
    }
    // text-driven piece: name plate reacts to typing
    await page.click('.piece-grid [data-type="name"]');
    await page.waitForTimeout(2500);
    const w1 = await text(page, '#readout');
    await page.fill('[data-text="text"]', 'فاطمه زهرا');
    await page.waitForTimeout(3000);
    const w2 = await text(page, '#readout');
    check('studio name: longer name → different weight', w1 !== w2);
    // parameters, materials, add part, undo
    await page.click('.piece-grid [data-type="band"]');
    await page.waitForTimeout(2500);
    const before = await text(page, '#readout');
    await page.$eval('[data-param="width"]', (i) => { i.value = '8'; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); });
    await page.waitForTimeout(2000);
    check('studio: wider band is heavier', (await text(page, '#readout')) !== before);
    await page.click('[data-alloy="pt950"]');
    await page.waitForTimeout(2000);
    check('studio: platinum readout', /پلاتین/.test(await text(page, '#readout')));
    const partsBefore = await page.$$eval('.parts li', (x) => x.length);
    await page.click('[data-act="add"]');
    await page.waitForTimeout(500);
    await page.click('[data-add="gem"]');
    await page.waitForTimeout(3000);
    check('studio: add part', (await page.$$eval('.parts li', (x) => x.length)) === partsBefore + 1);
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(3000);
    check('studio: undo removes the added part', (await page.$$eval('.parts li', (x) => x.length)) === partsBefore);
    // exports
    for (const x of ['stl', 'glb', 'png']) {
      await page.click('.toolbar [data-act="export"]');
      await page.waitForTimeout(400);
      if (x === 'png') await page.click('[data-res="1080"]');
      const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.click(`[data-x="${x}"]`)]);
      const size = (await (await import('node:fs')).promises.stat(await dl.path())).size;
      check(`studio export ${x.toUpperCase()}`, size > 2000, `${size} bytes`);
      await page.keyboard.press('Escape');
      await page.$eval('.modal', (m) => m.remove()).catch(() => {});
    }
  });
  await step('studio extras: invoice link, spec card, team gallery', async () => {
    await page.click('.piece-grid [data-type="solitaire"]');
    await page.waitForTimeout(3000);
    await page.click('[data-alloy="au18y"]');
    await page.waitForTimeout(2500);
    const href = await page.$eval('a[href^="/tools/invoice?weight="]', (a) => a.getAttribute('href'));
    check('studio: invoice link carries the model weight', /weight=\d+\.\d{3}&fineness=750/.test(href), href);
    await page.click('[data-act="card"]');
    await page.waitForTimeout(400);
    const [card] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.click('[data-mk]')]);
    const cardSize = (await (await import('node:fs')).promises.stat(await card.path())).size;
    check('studio: spec card PNG', cardSize > 50000, `${cardSize} bytes`);
    await page.click('[data-act="publish"]');
    await page.waitForTimeout(400);
    await page.fill('#dtitle', 'تک‌نگین آزمایشی');
    await page.click('[data-pub]');
    await page.waitForTimeout(4000);
    await page.click('[data-act="gallery"]');
    await page.waitForTimeout(1500);
    const n = await page.$$eval('.gallery figure', (f) => f.length);
    check('studio: design appears in team gallery', n >= 1, String(n));
    await page.click('.gallery figure');
    await page.waitForTimeout(5000);
    check('studio: design opens from gallery', /تک‌نگین/.test(await text(page, '.parts')));
    await go(page, href, 1000);
    const out = await text(page, '#out');
    check('invoice prefilled from studio', noBadNumbers(out) && out.length > 20);
  });

  if (!live) {
    await step('PWA: service worker + offline shell', async () => {
      await go(page, '/', 2000);
      await page.evaluate(() => navigator.serviceWorker.ready);
      await page.reload();
      await page.waitForTimeout(1500);
      check('PWA: page is controlled by the service worker', await page.evaluate(() => !!navigator.serviceWorker.controller));
      offline = true;
      await ctx.setOffline(true);
      await page.goto(base + '/tools').catch(() => {});
      await page.waitForTimeout(1500);
      check('PWA: app shell opens offline', !!(await page.$('#main')));
      await ctx.setOffline(false);
      offline = false;
    });
  }
  await ctx.close();
}

/* ======================================================= phone */
{
  const { page, ctx } = await session({ width: 390, height: 844 });
  await step('mobile login', () => loginUI(page));
  await step('mobile pages', async () => {
    for (const p of ['/', '/learn', '/lesson/r5', '/tools', '/history', '/practice']) {
      await go(page, p, 1500);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      check(`mobile ${p}: no horizontal overflow`, overflow <= 1, `${overflow}px`);
    }
    await go(page, '/studio', 6000);
    check('mobile studio: bottom sheet collapsed', !(await page.$eval('#panel', (p) => p.classList.contains('open'))));
    await page.click('[data-sheet]');
    await page.waitForTimeout(800);
    check('mobile studio: tap handle opens sheet', await page.$eval('#panel', (p) => p.classList.contains('open')));
  });
  await ctx.close();
}

await browser.close();
if (server) {
  server.kill();
  rmSync(dataDir, { recursive: true, force: true });
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed, ${errors.length} browser errors`);
for (const e of [...new Set(errors)]) console.log('  ! ' + e);
process.exit(failed.length || errors.length ? 1 : 0);
