// End-to-end browser test: boots a throw-away server (demo accounts, temp DB) and drives
// every page with Playwright. Any page error, console error or failed check fails the run.
//
//   npm run e2e                       # uses the globally installed playwright
//   PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs npm run e2e
//   E2E_BASE=https://... E2E_EMAIL=... E2E_PIN=... npm run e2e   # smoke-test a live deploy (read-only checks; E2E_PIN is the
//                                                                 # owner's BEATRIS_OWNER_PIN while email sign-in is not set up)
//   E2E_ONLY='melted|mobile pages' npm run e2e                     # only the steps whose name matches (login always runs)
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { coinPhotos, ringPhotos } from './synthscan.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pw = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs').catch(() => import('playwright'));
const { chromium } = pw.default ?? pw;

const live = !!process.env.E2E_BASE;
let base = process.env.E2E_BASE;
let server, dataDir;
if (!live) {
  dataDir = mkdtempSync(path.join(tmpdir(), 'beatris-e2e-'));
  let port = 4100 + Math.floor(Math.random() * 800);
  if (port === 4190) port++; // fetch refuses 4190
  server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/index.mjs'], { cwd: ROOT, env: { ...process.env, BEATRIS_DEMO: 'true', BEATRIS_DATA_DIR: dataDir, PORT: String(port), NODE_ENV: 'test' }, stdio: ['ignore', 'pipe', 'pipe'] });
  base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 60; i++) {
    if (await fetch(`${base}/api/health`).then((r) => r.ok).catch(() => false)) break;
    await new Promise((r) => setTimeout(r, 250));
  }
}
const EMAIL = process.env.E2E_EMAIL || 'manager@demo.beatris.ir'; // demo manager (spec 0034)
const PIN = process.env.E2E_PIN || ''; // only for a live server whose owner signs in with BEATRIS_OWNER_PIN (spec 0022)

const results = [];
const errors = [];
let offline = false;
let expectedError = null; // a console error a check provokes on purpose (e.g. a refused request)
let signedSale = null; // the sale the customer signed at the sales desk (spec 0040), printed in a later step
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const only = process.env.E2E_ONLY ? new RegExp(process.env.E2E_ONLY) : null;
const step = async (name, fn) => {
  if (only && !/login/.test(name) && !only.test(name)) return;
  try {
    await fn();
  } catch (e) {
    check(name, false, process.env.E2E_DEBUG ? e.message.slice(0, 2000) : e.message.split('\n')[0]);
  }
};

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

async function session(viewport) {
  const ctx = await browser.newContext({ viewport, acceptDownloads: true });
  // CI runners draw WebGL in software on 2 shared cores: the 3D labs need more than Playwright's 30 s per action there
  ctx.setDefaultTimeout(process.env.CI ? 120000 : 30000);
  const page = await ctx.newPage();
  const label = `${viewport.width}px`;
  page.on('pageerror', (e) => errors.push(`[${label}] ${page.url()} pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error' || offline) return;
    const t = m.text();
    if (/favicon|preload/.test(t)) return;
    if (/status of 401/.test(t) && page.url().includes('/login')) return; // the deliberate wrong code
    if (expectedError?.test(t)) return;
    errors.push(`[${label}] ${page.url()} console: ${t.slice(0, 240)}`);
  });
  page.on('response', (r) => {
    if (r.status() >= 500) errors.push(`[${label}] ${r.status()} ${r.url()}`);
  });
  return { ctx, page, label };
}
/** A [data-hold] button acts only when held (spec 0040): press, keep it down past the fill, let go. */
const holdApp = async (page, sel) => {
  const el = await page.waitForSelector(sel, { timeout: 5000 });
  await el.scrollIntoViewIfNeeded();
  const r = await el.boundingBox();
  await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(1400); // the fill takes 900 ms; the rest is room for a busy machine
  await page.mouse.up();
};
const go = async (page, p, wait = 1200) => {
  await page.goto(base + p);
  await page.waitForTimeout(wait);
};
const text = (page, sel) => page.$eval(sel, (e) => e.innerText).catch(() => '');
/** The trade desk keeps unfinished work by itself (spec 0013); a step that needs an empty desk clears it first. */
const freshDesk = async (page) => {
  await go(page, '/books/desk', 1500);
  const f = await page.$('[data-act=fresh]');
  if (f) {
    await f.click();
    await page.waitForTimeout(300);
  }
};
const noBadNumbers = (s) => !/NaN|undefined|Infinity/.test(s);
/** From now on, count the redraws of `box` that show its changed figure snapping into place (spec 0039). */
const watchSnap = (page, sel, box) =>
  page.evaluate(([s, b]) => {
    window.__snap = 0;
    new MutationObserver(() => document.querySelector(s) && window.__snap++).observe(document.querySelector(b), { childList: true, subtree: true });
  }, [sel, box]);
const snaps = (page) => page.evaluate(() => window.__snap);

/** Sign in the way people do (spec 0034): the email, then the code. Demo accounts see their code on the page. */
async function loginUI(page, email = EMAIL) {
  await go(page, '/login', 800);
  await page.fill('#ef input[name=email]', email);
  await page.click('#ef button[type=submit]');
  await page.waitForSelector('#cf', { timeout: 15000 });
  const dev = await page.$('.lg-dev');
  if (dev) {
    const code = (await page.$eval('.lg-dev', (b) => b.dataset.code)).trim();
    if (!live) {
      // a wrong code: an error under the cells, the row shakes and empties
      await page.fill('.otp-input', code === '000000' ? '111111' : '000000');
      await page.waitForTimeout(700);
      check('login: a wrong code shows an error and empties the cells', (await text(page, '#err')).length > 3 && (await page.$eval('.otp-input', (i) => i.value)) === '' && !!(await page.$('.otp.bad')));
    }
    await dev.click(); // the demo chip types the code; six digits sign in by themselves
  } else if (await page.$('#cf input[type=password]')) {
    await page.fill('#cf input[name=code]', PIN);
    await page.click('#cf button[type=submit]');
  } else throw new Error('no code on the page: a live server with Supabase needs a real inbox');
  // an email in several shops picks one after the code (spec 0034): the first is the main shop
  await Promise.race([page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15000 }), page.waitForSelector('.lg-shops [data-act=pick]', { timeout: 15000 }).then((b) => b.click())]);
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15000 });
  check('login: email → code reaches home', true);
}

/* ======================================================= desktop, full walk */
{
  const { page, ctx } = await session({ width: 1440, height: 900 });
  await step('login', async () => {
    await loginUI(page);
    // spec 0044: the sign-up form reads a mobile typed with the international 00 prefix the way it reads +98
    const ph = await page.evaluate(async () => {
      const m = await import('/js/pages/login.mjs');
      return ['۰۰۹۸ ۹۱۲ ۱۲۳ ۴۵۶۷', '+98 912 123 4567', '۹۱۲۱۲۳۴۵۶۷', '09121234567'].map(m.phoneOf);
    });
    check('login: a mobile typed as ۰۰۹۸…, +98…, without its 0 or as is is one number', ph.every((x) => x === '09121234567'), JSON.stringify(ph));
  });

  await step('home', async () => {
    // spec 0038: a manager's workspace is the boss's, so sign-in lands on their own desk; the classic home is one tap away
    if (!live) {
      await page.waitForURL((u) => u.pathname !== '/start', { timeout: 8000 }).catch(() => {});
      check('workspace: the manager signs in to their own desk (/work)', new URL(page.url()).pathname === '/work', page.url());
    }
    await go(page, '/', 1000);
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
    check('learn: 12 courses listed', n === 12, String(n));
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
    check('tools: 15 calculators listed', ids.length === 15, String(ids.length));
    for (const id of ids.filter((x) => x !== 'melt' && x !== 'inspect')) {
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
    const eras = await page.$$eval('.od-era', (x) => x.length);
    check('history: 9 eras', eras === 9, String(eras));
    await page.waitForFunction(() => document.querySelectorAll('.od-era img').length >= 2, null, { timeout: 90000 });
    check('history: artefacts rendered by the 3D engine, each with its shifted strip', await page.$eval('.od-era .od-art', (f) => !!f.querySelector('img') && /url\(/.test(f.style.getPropertyValue('--src'))));
    // spec 0043: the counter follows the era on screen
    const counter = () => text(page, '.od-sticky .od-count');
    const first = await counter();
    await page.$eval('#era-4', (el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
    await page.waitForTimeout(500);
    const fifth = await counter();
    check('history: the counter reads «۱ : ۹» at the top and follows the era on screen', /۱\s*:\s*۹/.test(first) && /۵\s*:\s*۹/.test(fifth), JSON.stringify({ first, fifth }));
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
    check('studio: 24 piece types offered (with the jewel CAD set)', types.length === 24, String(types.length));
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

  await step('hostile URL parameters fall back safely', async () => {
    await go(page, '/tools/toString', 800);
    check('/tools/toString → tools list', new URL(page.url()).pathname === '/tools');
    await go(page, '/drill?k=constructor', 1200);
    check('/drill?k=constructor → default drill', (await page.$eval('[data-k="invoice"]', (b) => b.getAttribute('aria-pressed')).catch(() => null)) === 'true');
    await go(page, '/coins?kind=__proto__&coin=toString&seal=valueOf&scenario=hasOwnProperty', 5000);
    check('/coins with prototype keys → genuine full coin', /تمام امامی/.test(await text(page, '#ltitle')));
  });

  await step('real coins: built-in photos, 3D viewer, 4K textures, photo specimens', async () => {
    await go(page, '/coins?mode=real', 12000);
    const chips = await page.$$eval('[data-photo]', (x) => x.length);
    check('real coins: 4 built-in reference coins listed', chips >= 4, String(chips));
    await page.waitForFunction(() => /۴۰۹۶ × ۴۰۹۶/.test(document.querySelector('#panel')?.innerText ?? ''), null, { timeout: 90000 }).catch(() => {});
    check('real coins: 4K textures load on desktop', /۴۰۹۶ × ۴۰۹۶/.test(await text(page, '#panel')));
    check('real coins: front = bank emblem side for the old design', /جلوی سکه/.test(await text(page, '#panel')) && /بانک ملی ایران/.test(await text(page, '#panel')));
    for (const t of ['flip', 'loupe', 'rake', 'edge']) {
      await page.click(`.lab-tools [data-tool="${t}"]`);
      await page.waitForTimeout(1500);
    }
    check('real coins: flip shows the back', /پشت سکه/.test(await text(page, '#panel')));
    check('real coins: licence credit and true source resolution shown', /CC BY-SA/.test(await text(page, '#panel')) && /پیکسل در قطر/.test(await text(page, '#panel')));
    await go(page, '/coins?coin=emami&kind=plugged&seed=3', 3000);
    await page.waitForFunction(() => /از عکس واقعی ساخته شده/.test(document.querySelector('#panel')?.innerText ?? ''), null, { timeout: 90000 }).catch(() => {});
    check('coin lab: specimen rendered from the real photograph', /از عکس واقعی ساخته شده/.test(await text(page, '#panel')));
    await page.click('[data-photomode="0"]');
    await page.waitForTimeout(6000);
    check('coin lab: stylised design on request', (await page.$eval('[data-photomode="0"]', (b) => b.getAttribute('aria-pressed'))) === 'true');
    await page.click('[data-photomode="1"]');
    await page.waitForTimeout(4000);
  });

  await step('coin photo pipeline + uploader: detect, build 4K, save, delete', async () => {
    // two gold discs on a light background, drawn inside the page (CSP forbids eval, so no code strings)
    const det = await page.evaluate(async () => {
      const P = await import('/js/coinphoto.mjs');
      const c = document.createElement('canvas');
      c.width = 1400;
      c.height = 700;
      const g = c.getContext('2d');
      g.fillStyle = '#f4f4f4';
      g.fillRect(0, 0, 1400, 700);
      for (const [x, t] of [[360, 'جلو'], [1040, 'پشت']]) {
        const gr = g.createRadialGradient(x - 80, 270, 20, x, 350, 300);
        gr.addColorStop(0, '#fff1b8');
        gr.addColorStop(1, '#c8962f');
        g.fillStyle = gr;
        g.beginPath();
        g.arc(x, 350, 290, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#8a6418';
        g.font = 'bold 120px sans-serif';
        g.textAlign = 'center';
        g.fillText(t, x, 390);
      }
      window.__coinsPng = c.toDataURL('image/png').split(',')[1];
      return P.detectCoins(c).map((f) => [f.cx, f.cy, f.r]);
    });
    check('photo pipeline: both coins found, centre and radius within 1 %', det.length === 2 && Math.abs(det[0][0] - 360) < 4 && Math.abs(det[1][0] - 1040) < 4 && det.every((d) => Math.abs(d[1] - 350) < 4 && Math.abs(d[2] - 290) < 3), JSON.stringify(det.map((d) => d.map((v) => Math.round(v)))));
    const png = await page.evaluate(() => window.__coinsPng);
    await go(page, '/coins/manage', 2500);
    const before = await page.$$eval('.photo-item', (x) => x.length);
    await page.setInputFiles('input[name=files]', { name: 'coins.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
    await page.waitForFunction(() => /سکه پیدا شد/.test(document.querySelector('#msg')?.textContent ?? ''), null, { timeout: 30000 });
    check('uploader: coins detected and previews drawn', /۲ سکه پیدا شد/.test(await text(page, '#msg')));
    await page.fill('input[name=source]', 'آزمون خودکار');
    await page.click('#save');
    await page.waitForFunction((n) => document.querySelectorAll('.photo-item').length > n, before, { timeout: 300000 });
    const after = await page.$$eval('.photo-item', (x) => x.length);
    check('uploader: 4K set built in the browser and stored', after === before + 1, `${before} → ${after}`);
    await holdApp(page, '[data-del]');
    await page.waitForFunction((n) => document.querySelectorAll('.photo-item').length === n, before, { timeout: 15000 }).catch(() => {});
    check('uploader: uploaded photo deleted', (await page.$$eval('.photo-item', (x) => x.length)) === before);
  });

  await step('coin lab: study, tools, seal, game, course link', async () => {
    const geoCheck = await page.evaluate(async () => {
      const [C3, K] = await Promise.all([import('/js/three/coins3d.mjs'), import('/js/coins.mjs')]);
      return ['emami', 'half', 'quarter', 'gerami'].map((id) => {
        const s = K.makeSpecimen(id, 'genuine', 2);
        const g = C3.coinGeometry(s);
        return { id, vol: g.userData.volume, grams: (g.userData.volume / 1000) * K.COIN_TYPES[id].density, weight: s.weight };
      });
    });
    for (const g of geoCheck) check(`coin mesh ${g.id}: outward closed solid, volume ≈ weight`, g.vol > 0 && Math.abs(g.grams - g.weight) / g.weight < 0.15, `${g.grams.toFixed(3)} g vs ${g.weight}`);
    await go(page, '/coins', 8000);
    await page.click('[data-tool="scale"]');
    await page.waitForTimeout(500);
    const w = await text(page, '#readout');
    // a real reference specimen may read a milligram off the nominal 8.133 g on the 0.001 g scale
    const grams = Number(w.replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace('٫', '.').match(/\d+\.\d+/)?.[0]);
    check('coin lab: genuine full coin weighs ≈8.13 g', Math.abs(grams - 8.133) < 0.01, w.split('\n')[0]);
    await page.click('[data-kind="brass"]');
    await page.waitForTimeout(5000);
    await page.click('[data-tool="scale"]');
    await page.waitForTimeout(500);
    const wb = await text(page, '#readout');
    check('coin lab: brass fake weighs ≈4 g', /^[۳۴]٫/.test(wb.trim()), wb.split('\n')[0]);
    for (const t of ['caliper', 'water', 'magnet', 'ring', 'xrf', 'loupe', 'edge', 'rake', 'flip']) {
      await page.click(`[data-tool="${t}"]`);
      await page.waitForTimeout(t === 'loupe' || t === 'edge' ? 1500 : 700);
    }
    const table = await text(page, '.kv');
    check('coin lab: all measurements listed without bad numbers', /چگالی/.test(table) && /XRF/.test(table) && /دندانه/.test(table) && noBadNumbers(table));
    check('coin lab: red flags shown for the fake in study mode', (await page.$$eval('.dot.bad', (x) => x.length)) >= 2);
    const pfBrass = Number(await page.$eval('[data-pf]', (b) => b.dataset.pf));
    check('coin lab meter: brass fake after all tools → fraud ≥ 99 %', pfBrass >= 0.99, String(pfBrass));
    // probability meter must equal the engine exactly (sealed pack, fixed seed)
    for (const [sc, seed] of [['S0', 11], ['S3', 12], ['S6', 13], ['S4', 14]]) {
      await go(page, `/coins?mode=seal&scenario=${sc}&seed=${seed}`, 6000);
      for (const t of ['holo', 'seam', 'swell', 'print', 'match', 'weight', 'magnet', 'link', 'serial']) {
        await page.click(`.lab-tools [data-tool="${t}"]`);
        await page.waitForTimeout(250);
      }
      const shown = Number(await page.$eval('[data-pf]', (b) => b.dataset.pf));
      const want = await page.evaluate(async ([sc, seed]) => {
        const K = await import('/js/coins.mjs');
        const p = K.makePack('bank', sc, seed);
        return 1 - K.bayes(K.sealPrior('market', 'bank'), K.sealLikelihood('bank'), K.packEvidence(p)).S0;
      }, [sc, seed]);
      check(`seal lab ${sc}: meter equals engine (${(want * 100).toFixed(2)} %)`, Math.abs(shown - want) < 1e-5, `${shown} vs ${want}`);
      if (sc === 'S0') check('seal lab S0: all clear → below 1 % and «قابل پذیرش»', shown < 0.01 && /قابل پذیرش/.test(await text(page, '#meter')));
      const tbl = await text(page, '.kv');
      check(`seal lab ${sc}: results table complete`, /استعلام/.test(tbl) && /وزن کل/.test(tbl) && noBadNumbers(tbl));
    }
    await page.$eval('[data-rate]', (r) => {
      r.value = '-0.5';
      r.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForTimeout(300);
    check('seal lab: base-rate slider re-computes the meter', /۳۲٪|۳۱٪/.test(await text(page, '#meter .ctx')), await text(page, '#meter .ctx .lbl'));
    await page.click('[data-stype="maker"]');
    await page.waitForTimeout(4000);
    check('seal lab: maker pack offers only its 5 scenarios', (await page.$$eval('[data-scen]', (x) => x.length)) === 5);
    const sealBefore = await page.evaluate(async () => (await (await fetch('/api/me', { headers: { authorization: `Bearer ${localStorage.getItem('beatris.token')}` } })).json()).progress.drills.total);
    await page.click('[data-game="1"]');
    await page.waitForTimeout(5000);
    check('seal game: pack hidden before answering', /ناشناس/.test(await text(page, '#ltitle')) && !(await page.$('#meter')));
    await page.click('.lab-tools [data-tool="serial"]');
    await page.waitForTimeout(300);
    await page.click('[data-verdict="S0"]');
    await page.waitForTimeout(1200);
    check('seal game: verdict + probability explanation', !!(await page.$('.verdict')) && /سنجه/.test(await text(page, '.verdict')) && !!(await page.$('#meter')));
    const sealAfter = await page.evaluate(async () => (await (await fetch('/api/me', { headers: { authorization: `Bearer ${localStorage.getItem('beatris.token')}` } })).json()).progress.drills.total);
    check('seal game: result recorded (unless the trick was invisible)', sealAfter === sealBefore + 1 || /پیدا نبود/.test(await text(page, '.verdict')), `${sealBefore} → ${sealAfter}`);
    await go(page, '/tools/bayes', 1200);
    check('bayes tool: 7 % base, hologram flag (85/3) → 68 %', /۶۸٪/.test(await text(page, '#out')), await text(page, '#out'));
    await page.click('[data-preset="seal"]');
    await page.waitForTimeout(300);
    check('bayes tool: seal preset loads 9 tests', (await page.$$eval('.brow', (x) => x.length)) === 9);
    await go(page, '/coins', 6000);
    const before = await page.evaluate(async () => (await (await fetch('/api/me', { headers: { authorization: `Bearer ${localStorage.getItem('beatris.token')}` } })).json()).progress.drills.total);
    await page.click('[data-game="1"]');
    await page.waitForTimeout(6000);
    check('coin lab game: specimen hidden before answering', /ناشناس/.test(await text(page, '#ltitle')));
    await page.click('[data-tool="scale"]');
    await page.click('[data-verdict="genuine"]');
    await page.waitForTimeout(1500);
    check('coin lab game: verdict revealed', !!(await page.$('.verdict')));
    const after = await page.evaluate(async () => (await (await fetch('/api/me', { headers: { authorization: `Bearer ${localStorage.getItem('beatris.token')}` } })).json()).progress.drills.total);
    check('coin lab game: result recorded on the server', after === before + 1, `${before} → ${after}`);
    await page.click('[data-act="next"]');
    await page.waitForTimeout(5000);
    check('coin lab game: next coin loads hidden', /ناشناس/.test(await text(page, '#ltitle')));
    await go(page, '/learn/c-coins', 1200);
    check('course c-coins: 11 lessons', (await page.$$eval('a.course-row', (a) => a.length)) === 11);
    await go(page, '/lesson/k8', 1500);
    check('lesson k8 links into the coin game', !!(await page.$('a[href="/coins?mode=game"]')));
    await go(page, '/lesson/k10', 1500);
    check('lesson k10 (seal tricks) renders its table and links the seal game', /بازپلمپ/.test(await text(page, '#main')) && !!(await page.$('a[href="/coins?mode=sealgame"]')));
    await go(page, '/lesson/k11', 1500);
    check('lesson k11 links the probability calculator', !!(await page.$('a[href="/tools/bayes"]')));
  });

  await step('market desk: board, chart, indicators, hunt, Elliott, analytics, alerts, data entry', async () => {
    await go(page, '/market', 3500);
    check('market: 11 price tiles with sparklines', (await page.$$eval('.mk-tile canvas', (x) => x.length)) === 11);
    check('market: sample data clearly labelled', /داده نمونه آموزشی/.test(await text(page, '#notice')) && /داده نمونه/.test(await text(page, '#src')));
    const board = await text(page, '#board');
    check('market: board numbers are clean', noBadNumbers(board) && /[۰-۹]/.test(board));
    check('market: main chart drawn', !!(await page.$('#chart canvas.chart-top')));
    // indicators and chart types must never throw
    for (const id of ['sma200', 'ema21', 'ichimoku', 'supertrend', 'psar', 'donchian', 'keltner', 'pivots', 'fib', 'zigzag']) await page.click(`[data-ov="${id}"]`);
    for (const id of ['stoch', 'atr', 'adx', 'cci', 'wr', 'roc']) await page.click(`[data-pane="${id}"]`);
    await page.waitForTimeout(500);
    check('market: all 13 overlays and 8 panes switch on', (await page.$$eval('[data-ov][aria-pressed="true"], [data-pane][aria-pressed="true"]', (x) => x.length)) === 21);
    const box = await page.$eval('#chart', (e) => {
      const r = e.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    });
    await page.mouse.move(box.x + box.w * 0.5, box.y + 120);
    await page.mouse.wheel(0, -400);
    await page.mouse.down();
    await page.mouse.move(box.x + box.w * 0.3, box.y + 140, { steps: 5 });
    await page.mouse.up();
    await page.mouse.dblclick(box.x + box.w * 0.5, box.y + 120);
    for (const t of ['ohlc', 'line', 'area', 'heikin', 'renko', 'linebreak', 'candle']) {
      await page.selectOption('#type', t);
      await page.waitForTimeout(250);
    }
    for (const r of ['1m', '1y', 'all', '6m']) {
      await page.click(`[data-range="${r}"]`);
      await page.waitForTimeout(500);
    }
    check('market: chart types, ranges, zoom and pan run without errors', true);
    // turn the extra indicators off again so the rest of the walk is light
    for (const id of ['sma200', 'ema21', 'ichimoku', 'supertrend', 'psar', 'donchian', 'keltner', 'pivots', 'fib', 'zigzag']) await page.click(`[data-ov="${id}"]`);
    for (const id of ['stoch', 'atr', 'adx', 'cci', 'wr', 'roc']) await page.click(`[data-pane="${id}"]`);
    const hunt = await text(page, '#hunt');
    const nums = await page.$$eval('.hunt-pair b', (b) => b.map((x) => Number(x.textContent.replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٬,]/g, ''))));
    const close = await page.$eval('.ladder .now .num', (x) => Number(x.textContent.replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٬,]/g, '')));
    check('market hunt: patient bid below and ask above the close', nums.length === 2 && nums[0] <= close && nums[1] >= close && noBadNumbers(hunt), `${nums[0]} ≤ ${close} ≤ ${nums[1]}`);
    check('market hunt: fair value from ounce × dollar shown for mazaneh', /ارزش از انس × دلار/.test(hunt));
    check('market Elliott: counts listed with rules and a verdict', (await page.$$eval('.wave-card', (x) => x.length)) >= 1 && /قواعد قطعی/.test(await text(page, '#wave')));
    await page.click('.mk-tile[data-sym="sekee"]');
    await page.waitForTimeout(1500);
    check('market: tile switches the chart to the emami coin', (await page.$eval('#sym', (s) => s.value)) === 'sekee' && /حباب/.test(await text(page, '#hunt')));
    check('market: four charts at once', (await page.$$eval('.mk-mini canvas.chart-top', (x) => x.length)) === 4);
    const [png] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.click('#png')]);
    const pngSize = (await (await import('node:fs')).promises.stat(await png.path())).size;
    check('market: chart PNG export', pngSize > 20000, `${pngSize} bytes`);
    await page.$eval('#lab', (e) => e.scrollIntoView());
    await page.waitForTimeout(2500);
    for (const tab of ['bubble', 'dollar', 'perf', 'corr', 'risk', 'dist', 'season', 'ratio']) {
      await page.click(`[data-lab="${tab}"]`);
      await page.waitForTimeout(900);
      const t = await text(page, '#labbody');
      const drawn = await page.$$eval('#labbody canvas', (x) => x.length);
      check(`market analytics ${tab}: rendered`, drawn >= 1 && noBadNumbers(t), `${drawn} canvases`);
    }
    await page.selectOption('#af select[name=symbol]', 'usd');
    await page.selectOption('#af select[name=op]', 'above');
    await page.fill('#af input[name=price]', '۱۰۰');
    await page.click('#af button[type=submit]');
    await page.click('#reload');
    await page.waitForTimeout(1500);
    check('market alerts: a crossed alert fires and is marked', /رسید/.test(await text(page, '#alerts')));
    await page.click('[data-delalert="0"]');
    // manager enters a real price: the desk leaves sample mode; deleting it brings the sample back
    await go(page, '/market/data', 1500);
    await page.click('[data-mode="json"]');
    await page.fill('#ff input[name=url]', 'http://prices.example.com/latest');
    expectedError = /status of 400/;
    await page.click('#ff button[type=submit]');
    await page.waitForTimeout(800);
    expectedError = null;
    check('market data: insecure feed URL refused', /https/.test(await page.$eval('#toasts', (t) => t.innerText).catch(() => '')));
    await go(page, '/market/data', 1200);
    await page.selectOption('#one select[name=symbol]', 'sekee');
    await page.fill('#one input[name=price]', '۲۴۰٬۵۰۵٬۰۰۰');
    await page.click('#one button[type=submit]');
    await page.waitForTimeout(1200);
    check('market data: manual price stored', (await page.$$eval('#recent tbody tr', (x) => x.length)) === 1 && /۲۴۰٬۵۰۵٬۰۰۰/.test(await text(page, '#recent')));
    await go(page, '/market', 3000);
    check('market: real price replaces the sample on the board', !(await page.$('#notice .notice')) && /۲۴۰٬۵۰۵٬۰۰۰/.test(await text(page, '#board')));
    await go(page, '/market/data?s=sekee', 1500);
    await page.click('#recent [data-del]');
    await page.waitForTimeout(500);
    check('hold to delete (spec 0040): a tap deletes nothing and says to hold the button', (await page.$$eval('#recent tbody tr', (x) => x.length)) === 1 && /نگه دارید/.test(await text(page, '#toasts')), await text(page, '#toasts'));
    await holdApp(page, '#recent [data-del]');
    await page.waitForTimeout(1000);
    await go(page, '/market', 2500);
    check('market: deleting the only real price restores the labelled sample', /داده نمونه آموزشی/.test(await text(page, '#notice')));
    // the course
    await go(page, '/learn/c-market', 1200);
    check('course c-market: 7 lessons', (await page.$$eval('a.course-row', (a) => a.length)) === 7);
    await go(page, '/lesson/mk4', 3500);
    check('lesson mk4: market chart with RSI and MACD panes', !!(await page.$('.vz-chart canvas.chart-top')) && /داده نمونه آموزشی/.test(await text(page, '.vz-chart')));
    check('lesson mk4 links the market desk', !!(await page.$('a[href="/market?s=mesghal&r=6m"]')));
  });

  await step('MCP: owner creates a token, an AI client lists and calls tools, token revoked', async () => {
    await go(page, '/staff/settings', 1800);
    await page.click('[data-mcp="new"]');
    await page.waitForSelector('[data-copy]', { timeout: 10000 });
    const tok = await page.$eval('[data-copy]', (i) => i.value);
    check('MCP: token shown once with setup commands', /^btr_/.test(tok) && /claude mcp add/.test(await text(page, '#mcp')));
    const res = await page.evaluate(async (t) => {
      const post = (body) => fetch('/mcp', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${t}` }, body: JSON.stringify(body) }).then((r) => r.json());
      const init = await post({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'e2e', version: '1' } } });
      const list = await post({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
      const gold = await post({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'gold_value', arguments: { weight: 10, fineness: 750 } } });
      return { v: init.result?.protocolVersion, n: list.result?.tools?.length, value: gold.result?.structuredContent?.value };
    }, tok);
    check('MCP: same-origin client initialises, lists 13 tools and prices gold', res.v === '2025-06-18' && res.n === 13 && res.value > 0, JSON.stringify(res));
    await holdApp(page, '[data-mcp="off"]');
    await page.waitForTimeout(800);
    expectedError = /status of 401/;
    const after = await page.evaluate((t) => fetch('/mcp', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${t}` }, body: '{"jsonrpc":"2.0","id":1,"method":"ping"}' }).then((r) => r.status), tok);
    await page.waitForTimeout(300);
    expectedError = null;
    check('MCP: revoked token is refused', after === 401, String(after));
  });

  await step('product page: public intro, demo request reaches the owner', async () => {
    const pub = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    const p2 = await pub.newPage();
    p2.on('pageerror', (e) => errors.push(`[intro] pageerror: ${e.message}`));
    await p2.goto(base + '/intro');
    await p2.waitForTimeout(1500);
    check('intro: opens without login, with real content counts', /مغز دوم طلافروشی/.test(await text(p2, 'h1')) && /۱۲/.test(await text(p2, '.lux-stats')));
    check('intro: slides, ticker, 3 feature cards, 3 packages, no invented prices', (await p2.$$eval('.lux-slide', (x) => x.length)) === 4 && (await p2.$$eval('.lux-ticker .tk', (x) => x.length)) >= 8 && (await p2.$$eval('.intro-feat', (x) => x.length)) === 3 && (await p2.$$eval('.intro-pack', (x) => x.length)) === 3 && !/تومان/.test(await text(p2, '.intro')));
    // spec 0043: one paper chapter in the Odyssée manner: the statement's first line indented, four chapter tabs, one chosen
    const od = await p2.evaluate(() => ({ indent: parseFloat(getComputedStyle(document.querySelector('.od-intro .od-big')).textIndent), tabs: document.querySelectorAll('#odWhy [role=tab]').length, chosen: document.querySelectorAll('#odWhy [role=tab][aria-selected=true]').length }));
    check('intro: the paper chapter: an indented statement, four chapter tabs, one chosen', od.indent > 20 && od.tabs === 4 && od.chosen === 1, JSON.stringify(od));
    await p2.click('#odWhy-t2');
    const third = await p2.evaluate(() => ({ text: document.querySelector('#odWhy-p').textContent, col: document.querySelector('#odWhy').style.getPropertyValue('--col'), count: document.querySelector('#odWhy .od-count').textContent }));
    await p2.keyboard.press('ArrowLeft'); // in RTL, left is the next chapter
    const fourth = await p2.evaluate(() => ({ on: document.activeElement?.id, chosen: document.querySelector('#odWhy [aria-selected=true]')?.id }));
    check('intro: a chapter tab shows its text under it; the left arrow goes to the next one', /آب‌شده/.test(third.text) && third.col === '3' && /۳/.test(third.count) && fourth.on === 'odWhy-t3' && fourth.chosen === 'odWhy-t3', JSON.stringify({ third, fourth }));
    check('intro: nav items are real pages, not same-page anchors', (await p2.$$eval('#luxNav a', (a) => a.map((x) => x.getAttribute('href')).join(' '))) === '/intro /intro/features /intro/packages /intro/demo' && (await p2.$eval('#luxNav a[aria-current=page]', (a) => a.getAttribute('href')).catch(() => '')) === '/intro');
    await p2.click('#luxNav a[href="/intro/features"]');
    await p2.waitForTimeout(1000);
    check('intro/features: own page with all 9 features and its own title', new URL(p2.url()).pathname === '/intro/features' && (await p2.$$eval('.intro-feat', (x) => x.length)) === 9 && /^امکانات · بئاتریس$/.test(await p2.title()) && (await p2.$eval('#luxNav a[aria-current=page]', (a) => a.getAttribute('href'))) === '/intro/features');
    await p2.click('#luxNav a[href="/intro/packages"]');
    await p2.waitForTimeout(1000);
    check('intro/packages: 3 packages and a comparison table', (await p2.$$eval('.intro-pack', (x) => x.length)) === 3 && (await p2.$$eval('.lux-compare tbody tr', (x) => x.length)) >= 10 && (await p2.$$eval('.lux-compare .yes', (x) => x.length)) > 0);
    await p2.goBack();
    await p2.waitForTimeout(800);
    check('intro: browser back returns to the previous page', new URL(p2.url()).pathname === '/intro/features');
    await p2.goto(base + '/intro/packages');
    await p2.waitForTimeout(1200);
    await p2.click('.intro-pack.hi a');
    await p2.waitForTimeout(1000);
    check('intro/demo: the form posts (not GET) and the chosen package is filled in', new URL(p2.url()).pathname === '/intro/demo' && (await p2.$eval('#lf', (f) => f.method)) === 'post' && (await p2.$eval('#lf select[name=pack]', (s) => s.value)) === 'حرفه‌ای');
    await p2.fill('#lf input[name=name]', 'مریم کاظمی');
    await p2.fill('#lf input[name=shop]', 'گالری آزمون خودکار');
    await p2.fill('#lf input[name=city]', 'اصفهان');
    await p2.fill('#lf input[name=phone]', '۰۹۱۳۱۲۳۴۵۶۷');
    await p2.click('#lf button[type=submit]');
    await p2.waitForTimeout(1200);
    check('intro: demo request accepted, nothing in the address bar', /ثبت شد/.test(await text(p2, '#lmsg')) && !/name=|phone=/.test(p2.url()));
    // without JavaScript the browser posts the form itself: urlencoded body, answered by a redirect back to the page
    const plain = await p2.evaluate(async () => {
      const r = await fetch('/api/leads', { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ name: 'سارا بی‌اسکریپت', shop: 'گالری فرم ساده', phone: '09131234568', branches: '۲', pack: 'زنجیره‌ای', website: '' }) });
      const other = await fetch('/api/auth/code', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'phone=09120000002' });
      return { type: r.type, other: other.status };
    });
    check('intro: plain form post is redirected (303), other form posts refused (415)', plain.type === 'opaqueredirect' && plain.other === 415, JSON.stringify(plain));
    await p2.goto(base + '/intro/demo?lead=ok');
    await p2.waitForTimeout(1000);
    check('intro: result shown after the redirect, then cleaned from the address', /ثبت شد/.test(await text(p2, '#lmsg')) && new URL(p2.url()).search === '');
    await p2.setViewportSize({ width: 390, height: 800 });
    await p2.waitForTimeout(400);
    const navHidden = await p2.$eval('#luxNav', (n) => getComputedStyle(n).display === 'none');
    await p2.click('.lux-menu');
    await p2.waitForTimeout(300);
    const navOpen = await p2.$eval('#luxNav', (n) => getComputedStyle(n).display !== 'none' && n.getBoundingClientRect().height > 100);
    check('intro: phone menu opens the page list', navHidden && navOpen && (await p2.$eval('.lux-menu', (b) => b.getAttribute('aria-expanded'))) === 'true');
    check('intro: no sideways scroll on a phone', await p2.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await p2.goto(base + '/login');
    await p2.waitForTimeout(1200);
    const brand = await p2.evaluate(() => ({ title: document.title, n: document.querySelectorAll('.bn').length, small: [...document.querySelectorAll('.bn')].some((e) => parseFloat(getComputedStyle(e).fontSize) < 15), wrong: /بناتریس/.test(document.body.innerText) }));
    check('login: brand always «بئاتریس», legible (≥15px), title not doubled', brand.n > 0 && !brand.small && !brand.wrong && (brand.title.match(/بئاتریس/g) ?? []).length === 1, JSON.stringify(brand));
    await pub.close();
    await go(page, '/staff/leads', 1500);
    check('owner sees the demo request with the chosen package', /گالری آزمون خودکار/.test(await text(page, '#main')) && /حرفه‌ای/.test(await text(page, '#main')));
    check('owner sees the plain form post too (Persian digits, package)', /گالری فرم ساده/.test(await text(page, '#main')) && /زنجیره‌ای/.test(await text(page, '#main')));
    await page.click('[data-status="contacted"]');
    await page.waitForTimeout(800);
    check('owner marks the request as contacted', (await page.$eval('[data-status="contacted"]', (b) => b.getAttribute('aria-pressed'))) === 'true');
  });

  if (!live) await step('sign-in by email (spec 0034): a colleague added by email, a new shop by sign-up, two shops, the email link, the vendor console', async () => {
    // the manager adds a colleague with an email and a mobile — no username, no password
    await go(page, '/staff', 1200);
    check('team: no account-request page any more', !(await page.$('a[href="/staff/access"]')));
    await page.fill('#add input[name=name]', 'ترانه آزمون');
    await page.fill('#add input[name=email]', ' Taraneh@Mail.com ');
    await page.fill('#add input[name=phone]', '۰۹۱۳۵۵۵۱۲۱۲');
    await page.selectOption('#add select[name=role]', 'trainer');
    check('team: the add form asks for no password', !(await page.$('#add input[name=pin]')));
    await page.click('#add button[type=submit]');
    await page.waitForTimeout(1200);
    check('team: the colleague is listed', /ترانه آزمون/.test(await text(page, '#main')));
    // she signs in on her phone with that email and the code
    const pub = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const p3 = await pub.newPage();
    p3.on('pageerror', (e) => errors.push(`[sms] pageerror: ${e.message}`));
    p3.on('console', (m) => m.type() === 'error' && !/status of 40[13]|status of 503/.test(m.text()) && errors.push(`[sms] console: ${m.text().slice(0, 200)}`));
    await p3.goto(base + '/join');
    await p3.waitForTimeout(900);
    check('old /join links land on the sign-in page', new URL(p3.url()).pathname === '/login');
    check('login: one field, the email, no password and no mobile anywhere', !!(await p3.$('#ef input[name=email][type=email]')) && !(await p3.$('input[type=password]')) && !(await p3.$('input[name=phone]')) && !(await p3.$('a[href="/join"]')));
    await p3.fill('#ef input[name=email]', 'not-an-email');
    await p3.click('#ef button[type=submit]');
    await p3.waitForTimeout(300);
    check('login: a malformed email is stopped on the page', /ایمیل/.test(await text(p3, '#err')) && !(await p3.$('#cf')));
    await p3.fill('#ef input[name=email]', 'TARANEH@mail.com');
    await p3.click('#ef button[type=submit]');
    await p3.waitForSelector('#cf', { timeout: 10000 });
    check('code step: six cells, the email shown, a resend timer, where to look', (await p3.$$eval('.otp-cells i', (x) => x.length)) === 6 && (await text(p3, '.lg-mail')) === 'taraneh@mail.com' && /ارسال دوباره تا/.test(await text(p3, '[data-act=resend]')) && /هرزنامه/.test(await text(p3, '.lg-step')));
    check('code step: no sideways scroll on a phone', await p3.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    const code = await p3.$eval('.lg-dev', (b) => b.dataset.code);
    await p3.fill('.otp-input', [...code].map((d) => '۰۱۲۳۴۵۶۷۸۹'[d]).join('')); // Persian digits are fine
    await p3.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15000 }).catch(() => {});
    const her = await p3.evaluate(async () => (await (await fetch('/api/me', { headers: { authorization: `Bearer ${localStorage.getItem('beatris.token')}` } })).json()).user);
    check('the new colleague is in, with her own email and number', !new URL(p3.url()).pathname.startsWith('/login') && her.email === 'taraneh@mail.com' && her.phone === '09135551212', JSON.stringify(her));
    await pub.close();
    // the link in the email: Supabase sends the person back with the session in the address; this server has no
    // Supabase, so the page says so plainly — and the session never stays in the address bar
    const lCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const pl = await lCtx.newPage();
    pl.on('pageerror', (e) => errors.push(`[link] pageerror: ${e.message}`));
    await pl.goto(`${base}/#access_token=aaa.bbb.ccc&expires_in=3600&refresh_token=x&token_type=bearer&type=magiclink`);
    await pl.waitForSelector('#ef', { timeout: 10000 });
    await pl.waitForTimeout(400);
    check('email link: taken from the address, checked on the server, then gone from the address bar', new URL(pl.url()).pathname === '/login' && !pl.url().includes('access_token') && /Supabase|ایمیل/.test(await text(pl, '#err')), `${pl.url()} ${await text(pl, '#err')}`);
    await pl.goto(`${base}/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired`);
    await pl.waitForSelector('#ef', { timeout: 10000 });
    check('email link: an expired link says so and asks for a fresh code', /گذشته/.test(await text(pl, '#err')) && !pl.url().includes('error'));
    await lCtx.close();
    // an email with no account opens its own shop (the mobile too: the account's key inside the shop)
    const sCtx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    const p4 = await sCtx.newPage();
    p4.on('pageerror', (e) => errors.push(`[signup] pageerror: ${e.message}`));
    await p4.goto(base + '/login');
    await p4.waitForTimeout(900);
    await p4.fill('#ef input[name=email]', 'kaveh@mail.com');
    await p4.click('#ef button[type=submit]');
    await p4.waitForSelector('.lg-dev', { timeout: 10000 });
    await p4.click('.lg-dev');
    await p4.waitForSelector('#sf', { timeout: 10000 });
    check('sign-up: an unknown email is offered its own shop, and asked for a mobile', /حسابی ندارد/.test(await text(p4, '.lg-step')) && !!(await p4.$('#sf input[name=phone]')));
    await p4.fill('#sf input[name=name]', 'کاوه آزمون');
    await p4.fill('#sf input[name=shopName]', 'گالری ثبت‌نام');
    await p4.click('#sf button[type=submit]');
    await p4.waitForTimeout(400);
    check('sign-up: no mobile, no shop', /موبایل/.test(await text(p4, '#err')) && new URL(p4.url()).pathname === '/login');
    await p4.fill('#sf input[name=phone]', '۰۹۱۳۵۵۵۰۰۰۰');
    await p4.click('#sf button[type=submit]');
    await p4.waitForURL((u) => u.pathname === '/setup', { timeout: 15000 }).catch(() => {});
    check('sign-up: the new owner lands in the setup wizard of the new shop', new URL(p4.url()).pathname === '/setup', p4.url());
    // the new owner adds the demo manager's email: that email now has two shops
    const added = await p4.evaluate(async () => (await fetch('/api/team', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${localStorage.getItem('beatris.token')}` }, body: JSON.stringify({ name: 'سارا در گالری دوم', phone: '09120000002', email: 'manager@demo.beatris.ir', role: 'manager' }) })).status);
    check('sign-up: the new owner adds staff by email', added === 200, String(added));
    await sCtx.close();
    const two = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const p5 = await two.newPage();
    p5.on('pageerror', (e) => errors.push(`[two shops] pageerror: ${e.message}`));
    await p5.goto(base + '/login');
    await p5.waitForTimeout(900);
    await p5.fill('#ef input[name=email]', 'manager@demo.beatris.ir');
    await p5.click('#ef button[type=submit]');
    await p5.waitForSelector('.lg-dev', { timeout: 10000 });
    await p5.click('.lg-dev');
    await p5.waitForSelector('.lg-shops', { timeout: 10000 });
    const shops = await p5.$$eval('.lg-shops [data-act=pick]', (b) => b.map((x) => x.innerText));
    check('two shops: the email picks one after the code', shops.length === 2 && shops.some((x) => /گالری ثبت‌نام/.test(x)), shops.join(' | '));
    await p5.click('.lg-shops [data-act=pick]:has-text("گالری ثبت‌نام")');
    await p5.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15000 }).catch(() => {});
    check('two shops: the picked shop opens', !new URL(p5.url()).pathname.startsWith('/login') && (await p5.evaluate(async () => (await (await fetch('/api/me', { headers: { authorization: `Bearer ${localStorage.getItem('beatris.token')}` } })).json()).tenant.name)) === 'گالری ثبت‌نام');
    await two.close();
    // the vendor console: the email card, the SMS card, a shop made with its owner's email, and the owner signs in
    const vCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const pv = await vCtx.newPage();
    pv.on('pageerror', (e) => errors.push(`[vendor] pageerror: ${e.message}`));
    await loginUI(pv, 'owner@demo.beatris.ir');
    await go(pv, '/vendor', 1500);
    check('vendor: the email card says Supabase is not set up yet and how to set it', /ورود با ایمیل/.test(await text(pv, '#vdMail')) && /BEATRIS_SUPABASE_URL/.test(await text(pv, '#vdMail')) && (await pv.$eval('#vdMail details', (d) => d.textContent)).includes('{{ .Token }}'));
    check('vendor: the SMS card says no panel is set (development shows the code on the page)', /پیامک ورود/.test(await text(pv, '#vdSms')) && !!(await pv.$('#smsF select[name=provider]')) && /محیط توسعه/.test(await text(pv, '#vdSms')));
    await pv.selectOption('#smsF select[name=provider]', 'smsir');
    await pv.waitForTimeout(300);
    check('vendor: choosing SMS.ir shows its own fields and hint', !!(await pv.$('#smsF input[name=key]')) && !!(await pv.$('#smsF input[name=template]')) && /#Code#/.test(await text(pv, '#vdSms')));
    await pv.selectOption('#smsF select[name=provider]', '');
    await pv.click('[data-act=new]');
    await pv.waitForSelector('#sf');
    check('vendor: a new shop asks for no username or password', !(await pv.$('#sf input[name=username]')) && !(await pv.$('#sf input[name=password]')));
    await pv.fill('#sf input[name=name]', 'زرگری موبایلی');
    await pv.fill('#sf input[name=ownerName]', 'امید آزمون');
    await pv.fill('#sf input[name=ownerEmail]', 'omid@mail.com');
    await pv.fill('#sf input[name=phone]', '09136660000');
    await pv.click('#sf button:not([type=button])');
    await pv.waitForSelector('.vd-hand pre', { timeout: 10000 });
    const hand = await text(pv, '.vd-hand pre');
    check('vendor: the hand-over text has the sign-in address and the email, no password', /\/login/.test(hand) && /omid@mail\.com/.test(hand) && !/رمز:/.test(hand), hand.replace(/\n/g, ' | '));
    await pv.click('.modal [data-close]');
    const oCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const po = await oCtx.newPage();
    await loginUI(po, 'omid@mail.com');
    await po.waitForURL((u) => u.pathname === '/setup', { timeout: 15000 }).catch(() => {});
    check('vendor: the new shop owner signs in with that email', new URL(po.url()).pathname === '/setup', po.url());
    // the vendor gives an account a new email in «کاربران»; the account signs in with it
    await go(pv, '/vendor', 1500);
    const tid = await pv.evaluate(async () => (await (await fetch('/api/vendor/tenants', { headers: { authorization: `Bearer ${localStorage.getItem('beatris.token')}` } })).json()).items.find((t) => t.name === 'زرگری موبایلی')?.id);
    check('vendor: the new shop is listed', !!tid && !!(await pv.$(`[data-act=users][data-id="${tid}"]`)), `${tid} ${pv.url()}`);
    await pv.click(`[data-act=users][data-id="${tid}"]`);
    await pv.waitForSelector(`#u-${tid} [data-act=email]`, { timeout: 10000 });
    await pv.click(`#u-${tid} [data-act=email]`);
    await pv.waitForSelector('.modal input', { timeout: 5000 });
    await pv.fill('.modal input', 'Omid.New@Mail.com');
    await pv.click('.modal [data-ask] button[type=submit]');
    await pv.waitForTimeout(1500);
    check('vendor: the account shows its new email', /omid\.new@mail\.com/.test(await text(pv, `#u-${tid}`)), await text(pv, `#u-${tid}`));
    await vCtx.close();
    await loginUI(po, 'omid.new@mail.com');
    await po.waitForURL((u) => u.pathname === '/setup', { timeout: 15000 }).catch(() => {});
    check('vendor: the account signs in with the email the vendor set', new URL(po.url()).pathname === '/setup', po.url());
    await oCtx.close();
    // signing the day close is a fresh code to the signer's own mobile
    await go(page, '/books/smart?t=close', 1800);
    const sign = await page.$('[data-sign-code]');
    if (sign) {
      await sign.click();
      await page.waitForTimeout(900);
      check('day close: «گرفتن کد امضا» brings a six-digit code (shown for a demo account)', /^[0-9۰-۹]{6}$/.test(await page.inputValue('#clCode')) && /کد حساب نمایشی/.test(await text(page, '#clSent')), await page.inputValue('#clCode'));
      check('day close: the code sits in the same six cells as the sign-in (spec 0040)', (await page.$$eval('.cl-code .otp-cells i.full', (x) => x.length)) === 6);
    } else check('day close: the day is open with a sign-by-code form', false, 'no [data-sign-code]');
  });

  if (!live) await step('a new deploy reaches open pages (spec 0036): the sign-in page reloads itself, a working page offers it', async () => {
    const next = (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, build: 'e2e-next-build' }) });
    const loaded = (p) => p.waitForEvent('load', { timeout: 10000 }).then(() => true).catch(() => false);
    const pub = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const p = await pub.newPage();
    p.on('pageerror', (e) => errors.push(`[fresh] pageerror: ${e.message}`));
    await p.goto(base + '/login');
    await p.waitForSelector('#ef input[name=email]');
    await p.waitForTimeout(800);
    await p.route('**/api/health', next);
    const again = loaded(p);
    await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    check('fresh: the untouched sign-in page reloads itself on a new build', await again);
    await pub.close();
    await go(page, '/books/desk', 1500);
    await page.route('**/api/health', next);
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.waitForSelector('.fresh-bar', { timeout: 6000 }).catch(() => null);
    check('fresh: a working page offers the new build and stays put', /نسخه‌ی تازه/.test(await text(page, '.fresh-bar')) && new URL(page.url()).pathname === '/books/desk');
    await page.unroute('**/api/health', next);
    const reloaded = loaded(page);
    await page.click('.fresh-bar button');
    check('fresh: «به‌روزرسانی» reloads the page', await reloaded);
    await page.waitForTimeout(1500);
  });

  await step('light layer: hand light, ripple, sunrise theme switch, stillness when asked (spec 0012)', async () => {
    await go(page, '/books/desk', 1500);
    await page.mouse.move(600, 400, { steps: 6 });
    await page.mouse.move(640, 420, { steps: 6 });
    await page.waitForTimeout(500);
    check('light: the hand light follows a mouse', (await page.$$eval('.lt-lamp', (x) => x.length)) === 1 && (await page.evaluate(() => document.documentElement.classList.contains('lt-hand'))));
    const b = await page.evaluate(() => {
      const el = [...document.querySelectorAll('.btn.ghost, .chip')].find((x) => { const r = x.getBoundingClientRect(); return r.width > 30 && r.top > 80 && r.bottom < innerHeight - 20; });
      el.dataset.ltTest = '1';
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, text: el.innerText };
    });
    await page.mouse.move(b.x, b.y);
    await page.mouse.down();
    await page.waitForTimeout(80);
    const during = await page.$$eval('[data-lt-test] .lt-rip-box', (x) => x.length);
    await page.mouse.move(5, 5); // release away from the control: a press, not a click (nothing opens)
    await page.mouse.up();
    await page.waitForTimeout(1300);
    check('light: a ripple of light appears where pressed and is gone afterwards; the label is untouched', during === 1 && (await page.$$eval('.lt-rip-box', (x) => x.length)) === 0 && (await page.$eval('[data-lt-test]', (e) => e.innerText)) === b.text, String(during));
    await page.evaluate(() => document.querySelector('[data-lt-test]')?.removeAttribute('data-lt-test'));
    const t0 = await page.evaluate(() => document.documentElement.dataset.theme);
    const themeIs = (t) => page.waitForFunction((x) => document.documentElement.dataset.theme === x, t, { timeout: 5000 }).then(() => true, () => false);
    await page.click('#themeBtn');
    await page.click('[data-pick=day]');
    const t1 = await themeIs('day');
    // two quick picks, the second during the first sunrise: the last one wins and is kept (day → classic → calm)
    await page.click('[data-pick=classic]');
    await page.click('[data-pick=calm]', { force: true });
    const back = await themeIs('calm');
    await page.keyboard.press('Escape');
    check('light: skin switches through the sunrise; quick picks are not lost', t0 === 'calm' && t1 && back && (await page.evaluate(() => localStorage.getItem('beatris.theme'))) === 'calm', `${t0} ${t1} ${back}`);
    // asked for less motion: nothing follows, nothing ripples
    const still = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
    const ps = await still.newPage();
    ps.on('pageerror', (e) => errors.push(`[still] pageerror: ${e.message}`));
    await ps.goto(base + '/login');
    await ps.waitForTimeout(1000);
    await ps.mouse.move(400, 300, { steps: 8 });
    await ps.mouse.move(420, 320, { steps: 8 });
    const sb = await (await ps.$('button[type=submit]')).boundingBox();
    await ps.mouse.move(sb.x + 10, sb.y + 10);
    await ps.mouse.down();
    await ps.waitForTimeout(60);
    const quiet = await ps.evaluate(() => ({ lamp: document.querySelectorAll('.lt-lamp').length, rip: document.querySelectorAll('.lt-rip-box').length, amb: getComputedStyle(document.body, '::after').animationName }));
    await ps.mouse.up();
    check('light: with reduced motion there is no hand light, no ripple, no breathing glow', quiet.lamp === 0 && quiet.rip === 0 && quiet.amb === 'none', JSON.stringify(quiet));
    await still.close();
  });

  await step('coin inspection report: flags a light, magnetic coin and prints for the customer', async () => {
    await go(page, '/tools/inspect', 1200);
    await page.fill('#ins input[name=weight]', '۸٫۱۲۰');
    await page.check('#ins input[name=magnet][value="0"]', { force: true });
    await page.waitForTimeout(300);
    check('inspection: full coin 0.013 g light is within tolerance, low fraud', /✓ همخوان/.test(await text(page, '#rep')) && !/✗/.test(await text(page, '#rep')));
    await page.fill('#ins input[name=weight]', '8.05');
    await page.check('#ins input[name=magnet][value="1"]', { force: true });
    await page.waitForTimeout(300);
    const rep = await text(page, '#rep');
    check('inspection: light + magnetic → reject', /✗ ناهمخوان/.test(rep) && /رد یا ارجاع/.test(rep) && noBadNumbers(rep));
  });

  await step('melted gold: course, lesson diagrams, ledger trainer, quick entry', async () => {
    await go(page, '/learn/c-melt', 1200);
    check('course c-melt: 6 lessons', (await page.$$eval('a.course-row', (a) => a.length)) === 6);
    await go(page, '/lesson/h1', 1500);
    check('lesson h1: unit ladder drawn', (await page.$$eval('.blk-viz .vz-bar', (x) => x.length)) === 4);
    const t1 = await text(page, '.blk-viz .vz-total');
    await page.fill('.blk-viz [name=w]', '۲۰');
    await page.waitForTimeout(200);
    const t2 = await text(page, '.blk-viz .vz-total');
    const want = await page.evaluate(async () => {
      const [M, C] = await Promise.all([import('/js/melt.mjs'), import('/js/calc.mjs')]);
      const b = JSON.parse(document.querySelector('.blk-viz').dataset.viz);
      return C.fmt(M.ledgerValue(20, b.ayar, b.maz));
    });
    check('lesson h1: ladder recomputes with the ledger rule', t1 !== t2 && t2.includes(want) && noBadNumbers(t2), `${want} in «${t2.replace(/\s+/g, ' ')}»`);
    await go(page, '/lesson/h3', 1500);
    for (let i = 0; i < 6; i++) await page.click('.blk-viz [data-vz=next]');
    const tacc = await text(page, '.blk-viz .vz-t');
    check('lesson h3: the trade lands in both ledger columns', /\+/.test(tacc) && /−/.test(tacc) && noBadNumbers(tacc), tacc.replace(/\s+/g, ' '));
    await go(page, '/lesson/h4', 1500);
    const setAssay = (v) =>
      page.$eval(
        '.blk-viz [name=measured]',
        (r, v) => {
          r.value = v;
          r.dispatchEvent(new Event('input', { bubbles: true }));
        },
        v,
      );
    await setAssay('760');
    const high = !(await page.$('.blk-viz .vz-total b.neg'));
    await setAssay('730');
    check('lesson h4: assay slider flips the difference sign', high && !!(await page.$('.blk-viz .vz-total b.neg')));
    await go(page, '/lesson/h5', 1500);
    for (let i = 0; i < 4; i++) await page.click('.blk-viz [data-vz=next]');
    const last = await page.$$eval('.blk-viz tbody tr', (r) => r.at(-1).innerText);
    check('lesson h5: a week with the wholesaler ends with zero gold debt', (await page.$$eval('.blk-viz tbody tr', (r) => r.length)) === 5 && /\t۰ گرم/.test(last), last.replace(/\s+/g, ' '));

    // ledger trainer: exact answers typed in Persian digits, Enter walks the fields and submits
    const faNum = (s) => s.replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]).replace('.', '٫').replace('-', '−');
    const answers = () =>
      page.evaluate(async () => {
        const [M, C] = await Promise.all([import('/js/melt.mjs'), import('/js/core.mjs')]);
        const f = document.querySelector('#lf');
        return M.makeTrade(Number(f.dataset.seed), Number(f.dataset.level), C.store.me.pricing.p750).fields.map((x) => [x.id, x.answer, x.unit]);
      });
    await go(page, '/ledger', 1500);
    const drillsBefore = await page.evaluate(async () => (await (await fetch('/api/me', { headers: { authorization: `Bearer ${localStorage.getItem('beatris.token')}` } })).json()).progress.drills.total);
    const ans = await answers();
    for (const [id, a, unit] of ans) await page.fill(`input[data-f="${id}"]`, faNum(unit === 'گرم' ? a.toFixed(3) : String(Math.round(a))));
    await page.focus('input[data-f]');
    for (let i = 0; i < ans.length; i++) await page.keyboard.press('Enter');
    await page.waitForTimeout(600);
    const fb = await page.$$eval('.ledger-fb', (x) => x.map((e) => e.textContent));
    check('ledger trainer: exact entry graded all correct', fb.length === ans.length && fb.every((t) => t.includes('✓')), `${fb.filter((t) => t.includes('✓')).length}/${ans.length}`);
    check('ledger trainer: session score counts the row', /۱<\/b> درست از <b>۱</.test(await page.$eval('.ledger-stats', (e) => e.innerHTML)));
    const drillsAfter = await page.evaluate(async () => (await (await fetch('/api/me', { headers: { authorization: `Bearer ${localStorage.getItem('beatris.token')}` } })).json()).progress.drills.total);
    check('ledger trainer: result recorded on the server', drillsAfter === drillsBefore + 1, `${drillsBefore} → ${drillsAfter}`);
    const seed1 = await page.$eval('#lf', (f) => f.dataset.seed);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(400);
    check('ledger trainer: Enter deals the next row', (await page.$eval('#lf', (f) => f.dataset.seed)) !== seed1 && !(await page.$('.ledger-fb')));
    const ans2 = await answers();
    for (const [id] of ans2) await page.fill(`input[data-f="${id}"]`, '1');
    await page.click('#lf button[type=submit]');
    await page.waitForTimeout(400);
    const bad = await page.$$eval('#lf .field.bad', (x) => x.length);
    check('ledger trainer: wrong entry shows the right value and the method', bad === ans2.length && /✗ درست/.test(await text(page, '#lf')) && noBadNumbers(await text(page, '#lf')), `${bad} red of ${ans2.length}`);
    await page.click('[data-level="3"]');
    await page.waitForTimeout(400);
    check('ledger trainer: level 3 deals a level-3 row', page.url().endsWith('/ledger?level=3') && (await page.$eval('#lf', (f) => f.dataset.level)) === '3');
    await page.click('[data-act=hint]');
    await page.waitForTimeout(200);
    check('ledger trainer: hint shows the fixed pattern', (await page.$$eval('.ledger-hint > div', (x) => x.length)) >= 2);

    // quick entry at the counter
    await page.evaluate(() => localStorage.removeItem('beatris.melt.session'));
    await go(page, '/tools/melt', 1200);
    await page.fill('#mf [name=mid]', '40000000');
    await page.fill('#mf [name=spread]', '150000');
    await page.fill('#mf [name=ayar]', '74');
    await page.fill('#mf [name=w]', '۱۰');
    check('quick entry: two-digit fineness flagged as a typo', /اشتباه تایپی/.test(await text(page, '#live')));
    await page.press('#mf [name=w]', 'Enter');
    await page.waitForTimeout(300);
    check('quick entry: typo is not booked', !(await page.$('#book tbody tr')));
    await page.fill('#mf [name=ayar]', '740');
    const exp = await page.evaluate(async () => {
      const [M, C] = await Promise.all([import('/js/melt.mjs'), import('/js/calc.mjs')]);
      const buy = M.ledgerValue(10, 740, 39850000), sell = M.ledgerValue(10, 740, 40150000);
      return { eq: C.fmt(M.r3(M.eq750(10, 740)), 3), buy: C.fmt(buy), cash: C.fmt(sell - buy) };
    });
    const liveOut = await text(page, '#live');
    check('quick entry: live line uses the ledger rule', liveOut.includes(exp.eq) && liveOut.includes(exp.buy), liveOut.replace(/\s+/g, ' '));
    await page.press('#mf [name=w]', 'Enter');
    await page.waitForTimeout(300);
    check('quick entry: weight cleared and focused for the next piece', (await page.$eval('#mf [name=w]', (i) => i.value === '' && document.activeElement === i)));
    await page.click('#mf [data-side="sell"]');
    await page.fill('#mf [name=w]', '10');
    await page.press('#mf [name=w]', 'Enter');
    await page.waitForTimeout(300);
    const rowsN = await page.$$eval('#book tbody tr', (x) => x.length);
    const totals = await text(page, '#book .ledger');
    check('quick entry: buy + sell booked; gold nets to zero, till keeps the spread', rowsN === 2 && /[+−]۰(\s|$)/.test(totals) && totals.includes(`+${exp.cash}`), `${rowsN} rows · ${totals.replace(/\s+/g, ' ')}`);
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.click('[data-act=csv]')]);
    const csv = (await (await import('node:fs')).promises.readFile(await dl.path(), 'utf8')).replace(/^﻿/, '').trim().split('\n');
    check('quick entry: CSV has the header and both booked rows', csv.length === 3 && csv[0].startsWith('row,date_jalali,time,side') && /^"1","14\d\d\/\d\d\/\d\d","\d\d:\d\d","buy"/.test(csv[1]) && csv[1].includes('"9.867"') && csv[2].includes('"sell"') && csv[2].includes('"-9.867"'), csv.join(' | '));
    await go(page, '/tools/melt', 1000);
    check('quick entry: session ledger survives a reload', (await page.$$eval('#book tbody tr', (x) => x.length)) === 2);
    await page.focus('[data-act=clear]');
    await page.keyboard.down('Enter');
    await page.waitForTimeout(300);
    await page.keyboard.up('Enter');
    await page.waitForTimeout(300);
    check('quick entry: Enter let go early clears nothing (spec 0040)', (await page.$$eval('#book tbody tr', (x) => x.length)) === 2);
    await page.keyboard.down('Enter');
    await page.waitForTimeout(1400);
    await page.keyboard.up('Enter');
    await page.waitForTimeout(300);
    check('quick entry: session ledger cleared by holding Enter', !(await page.$('#book tbody tr')));
  });

  if (!live)
    await step('shop books: stock, counter invoice, official print, verify, edit, cheque, reports, exports', async () => {
      const fs = (await import('node:fs')).promises;
      const dl = async (sel) => {
        const [d] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.click(sel)]);
        return fs.readFile(await d.path(), 'utf8');
      };
      // stock: three pieces from one template with automatic barcodes, labels
      await go(page, '/books/stock', 1200);
      await page.click('[data-act=batch]');
      await page.selectOption('#itf [name=tpl]', 'ring-w');
      await page.fill('#itf [name=weights]', '۵٫۲۳ 6.10 4.87');
      await page.click('#itf button:not([type])');
      await page.waitForSelector('#bulk:not([hidden])');
      check('books: batch of 3 pieces gets barcodes', (await page.$$eval('#tbl tbody tr', (r) => r.length)) === 3);
      await page.click('[data-bulk=labels]');
      await page.waitForSelector('.bk-label svg');
      check('books: labels carry a Code128 barcode', (await page.$$('.bk-label svg')).length === 3);
      await page.keyboard.press('Escape');
      const xls = await dl('[data-act=ex-xls]');
      check('books: stock exports to Excel', xls.includes('<Workbook') && xls.includes('100001') && xls.includes('DisplayRightToLeft'));
      // counter: new customer, scan, coin from the catalogue, trade-in, card payment of the remainder
      await go(page, '/books/new/sale', 1200);
      await page.click('[data-act=party-new]');
      await page.fill('#np [name=name]', 'مریم رضایی');
      await page.fill('#np [name=mobile]', '09351234567');
      await page.fill('#np [name=nid]', '0499370899');
      await page.click('#np button:not([type])');
      await page.waitForSelector('.bk-party-sel');
      await page.fill('#scan', '100001');
      await page.press('#scan', 'Enter');
      await page.waitForSelector('[data-line="0"]');
      await page.click('[data-act=catalog]');
      await page.fill('#tq', 'ربع');
      await page.click('[data-tpl=coin-quarter]');
      await page.click('[data-act=add-used]');
      await page.fill('[data-l="2"][data-k=weight]', '3');
      await page.click('[data-add-pay=pos]');
      await page.fill('[data-p="0"][data-k=ref]', '123456');
      check('books: payment fills the remainder, invoice settles', /تسویه کامل/.test(await text(page, '#totals')));
      await page.click('[data-act=save]');
      await page.waitForURL(/\/books\/doc\//, { timeout: 15000 });
      await page.waitForSelector('.bk-paper');
      const std = await text(page, '.bk-paper');
      check('books: default print is the standard official form (seller, buyer, goods table, terms, signatures)', !!(await page.$('.bk-paper.std .sf-items')) && std.includes('صورتحساب فروش کالا و خدمات') && std.includes('مشخصات خریدار') && std.includes('جمع مالیات و عوارض') && std.includes('نقدی') && noBadNumbers(std));
      await page.click('[data-fmt=a4]');
      await page.waitForSelector('.bk-paper.a4');
      const inv = await text(page, '.bk-paper');
      const exp = await page.evaluate(async () => {
        const B = await import('/js/books.mjs');
        const id = location.pathname.split('/').pop();
        const d = await (await fetch(`/api/books/docs/${id}`, { headers: { Authorization: `Bearer ${localStorage.getItem('beatris.token')}` } })).json();
        const c = B.calcDoc(d);
        return { sales: B.fmtMoney(c.sales, 'rial', { unit: false }), vat: B.fmtMoney(c.vat, 'rial', { unit: false }), net: B.fmtMoney(c.net, 'rial', { unit: false }), same: c.sales === d.calc.sales && c.net === d.calc.net };
      });
      check('books: printed totals equal the engine (sales, VAT, net) and the stored calc', exp.same && inv.includes(exp.sales) && inv.includes(exp.vat) && inv.includes(exp.net), JSON.stringify(exp));
      check('books: official invoice carries buyer code, QR and authenticity code', /۰۴۹۹۳۷۰۸۹۹/.test(inv) && !!(await page.$('.bk-p-verify svg')) && /کد اصالت/.test(inv) && noBadNumbers(inv));
      const code = (await text(page, '.bk-p-verify b')).trim();
      const pub = await ctx.newPage();
      await pub.goto(`${base}/verify/${code}`);
      await pub.waitForSelector('.bk-v-res');
      check('books: public page verifies the printed code', !!(await pub.$('.bk-v-res.ok')) && !(await pub.innerText('body')).includes('مریم'));
      await pub.close();
      await page.click('[data-fmt=r80]');
      check('books: 80 mm roll layout', !!(await page.$('.bk-paper.r80 .bk-p-table.roll')));
      await page.click('[data-fmt=a4]');
      const mj = JSON.parse(await dl('[data-act=moadian]'));
      check('books: tax-system file uses the gold pattern with integer making charge', mj[0].header.inp === 3 && mj[0].body.every((r) => Number.isInteger(r.consfee) && r.tcpbs === r.consfee + r.spro + r.bros));
      // a final invoice is corrected by an amendment (spec 0013): a new document; rounding lands on a round thousand toman
      const origId = await page.evaluate(() => location.pathname.split('/').pop());
      await page.click('a:has-text("اصلاح (اصلاحیه)")');
      await page.waitForSelector('[name=reason]');
      await page.click('[data-act=round]');
      await page.click('[data-fill="0"]');
      await page.fill('[name=reason]', 'گرد کردن مبلغ');
      await page.click('[data-act=save]');
      await page.waitForURL(/\/books\/doc\/[^/?]+(\?.*)?$/, { timeout: 15000 });
      await page.waitForSelector('.bk-paper');
      const v2 = await page.evaluate(async () => {
        const id = location.pathname.split('/').pop();
        return (await (await fetch(`/api/books/docs/${id}`, { headers: { Authorization: `Bearer ${localStorage.getItem('beatris.token')}` } })).json());
      });
      const orig = await page.evaluate(async (id) => (await (await fetch(`/api/books/docs/${id}`, { headers: { Authorization: `Bearer ${localStorage.getItem('beatris.token')}` } })).json()), origId);
      check('books: the correction is an amendment with a round total; the original is superseded, not changed', v2.amends === origId && v2.id !== origId && v2.calc.sales % 10000 === 0 && orig.status === 'void' && orig.tax?.supersededBy === v2.id, `${v2.amends} ${v2.calc.sales} ${orig.status}`);
      // credit sale with a cheque, then the cheque is deposited
      await go(page, '/books/new/sale', 1200);
      await page.fill('#pq', 'مریم');
      await page.waitForSelector('[data-pick]');
      await page.click('[data-pick]');
      await page.fill('#scan', '100002');
      await page.press('#scan', 'Enter');
      await page.waitForSelector('[data-line="0"]');
      await page.click('[data-add-pay=cheque]');
      await page.fill('[data-p="0"][data-k=amount]', '5000000');
      await page.fill('[data-p="0"][data-k=chequeNo]', '445566');
      await page.fill('[data-p="0"][data-k=dueJ]', '1405/08/15');
      check('books: the unpaid part shows as credit', /نسیه/.test(await text(page, '#totals')));
      await page.click('[data-act=save]');
      await page.waitForURL(/\/books\/doc\//, { timeout: 15000 });
      await go(page, '/books/cash', 1200);
      await page.click('[data-to=deposited]');
      await page.click('#cf button:not([type])');
      await page.waitForSelector('text=واگذار به بانک');
      check('books: cheque moves to the bank', true);
      await go(page, '/books/parties', 1200);
      check('books: customer shows a debit balance', !!(await page.$('#tbl .bk-bchip.debt')));
      // journal: select all, bulk bar; reports render real numbers
      await go(page, '/books/docs', 1200);
      await page.check('#all');
      check('books: journal multi-select', !!(await page.$('#bulk:not([hidden])')) && (await page.$eval('#all', (x) => x.checked)));
      for (const t of ['balance', 'day', 'vat', 'sales']) {
        await go(page, `/books/reports?tab=${t}`, 1500);
        const r = await text(page, '#rep');
        check(`books: report ${t} has numbers`, r.length > 40 && noBadNumbers(r), r.slice(0, 80).replace(/\s+/g, ' '));
      }
      await go(page, '/books/log', 1200);
      check('books: event chain is intact', !!(await page.$('.notice.ok')));
    });

  // spec 0013's amendment: the draft goes before the page leaves, and carries the client key, so a draft that outlives
  // its booking (a reload in that instant) can never book the sale a second time
  if (!live)
    await step('drafts: a booked sale never comes back as unfinished work, and a stale draft books nothing twice', async () => {
      const latest = () => page.evaluate(async () => (await (await fetch('/api/books/docs?limit=1', { headers: { Authorization: `Bearer ${localStorage.getItem('beatris.token')}` } })).json()).items[0]?.id);
      const store = (value) =>
        page.evaluate(
          (v) =>
            new Promise((ok) => {
              const r = indexedDB.open('beatris-local');
              r.onerror = () => ok('no database');
              r.onsuccess = () => {
                const t = r.result.transaction('drafts', v === undefined ? 'readonly' : 'readwrite');
                const s = t.objectStore('drafts');
                if (v === undefined) {
                  const g = s.get('doc:sale');
                  g.onsuccess = () => ok(g.result ?? null);
                } else {
                  s.put(v, 'doc:sale');
                  t.oncomplete = () => ok(true);
                }
              };
            }),
          value,
        );
      await go(page, '/books/new/sale', 1200);
      if (await page.$('.bk-draft')) await page.click('[data-act=drop]');
      await page.click('[data-act=party-new]');
      await page.fill('#np [name=name]', 'پیش‌نویس دوباره');
      await page.fill('#np [name=mobile]', '09121113344');
      await page.click('#np button:not([type])');
      await page.waitForSelector('.bk-party-sel');
      await page.click('[data-act=catalog]');
      await page.fill('#tq', 'ربع');
      await page.click('[data-tpl=coin-quarter]');
      await page.click('[data-add-pay=cash]');
      const kept = await store();
      check('drafts: the unfinished sale is kept on this device with its client key', !!kept?.S?.clientKey && kept.S.lines.length === 1, JSON.stringify({ key: kept?.S?.clientKey, lines: kept?.S?.lines?.length }));
      await page.click('[data-act=save]');
      await page.waitForURL(/\/books\/doc\//, { timeout: 15000 });
      const id = new URL(page.url()).pathname.split('/').pop();
      check('drafts: when the document page appears the draft is already gone', (await store()) === null);
      // what an interrupted page would have left: the draft as it stood before the booking
      await store(kept);
      await go(page, '/books/new/sale', 1200);
      check('drafts: a draft left behind comes back as unfinished work', !!(await page.$('.bk-draft')) && !!(await page.$('.bk-party-sel')));
      await page.click('[data-act=save]');
      await page.waitForURL(/\/books\/doc\//, { timeout: 15000 });
      const again = new URL(page.url()).pathname.split('/').pop();
      const said = await page.$$eval('#toasts .toast', (t) => t.map((x) => x.textContent).join(' | '));
      check('drafts: booking it again opens the same document and makes no second one', again === id && (await latest()) === id && /پیش‌تر ثبت شده بود/.test(said), JSON.stringify({ id, again, said: said.slice(0, 160) }));
      check('drafts: and the draft is gone again', (await store()) === null);
    });

  if (!live)
    await step('base edition: trade desk, receipt, day book, bars, vault, P&L, bank reconciliation', async () => {
      const auth = (path, opt = {}) => page.evaluate(async ([p, o]) => (await fetch(p, { ...o, headers: { 'content-type': 'application/json', Authorization: `Bearer ${localStorage.getItem('beatris.token')}` } })).json(), [path, opt]);
      await freshDesk(page);
      // a new customer from the desk
      await page.click('[data-act=pnew]');
      await page.fill('#np [name=name]', 'مهران رضایی');
      await page.fill('#np [name=mobile]', '09121112233');
      await page.fill('#np [name=group]', 'خرده');
      await page.click('#np button:not([type])');
      await page.waitForSelector('.dk-who');
      // buy 2 g of 740 melt on a مظنه of 400,000,000 rial
      await page.fill('[data-f=weight]', '2');
      await page.fill('[data-f=fineness]', '740');
      await page.fill('[data-f=mazaneh]', '400000000');
      await page.waitForTimeout(150);
      const live750 = await text(page, '#live');
      check('desk: live panel shows the 750 equivalent, mesghal and amount', live750.includes('۱٫۹۷۳') && live750.includes('۰٫۴۵۶') && live750.includes('۱۸۲٬۱۹۰٬۰۰۰'), live750.replace(/\s+/g, ' '));
      await page.click('[data-act=add]');
      // sell one emami coin
      await page.click('[data-mode=sell]');
      await page.click('[data-kind=coin]');
      await page.click('[data-coin=emami]');
      await page.fill('[data-f=count]', '1');
      await page.fill('[data-f=price]', '985000000');
      await page.click('[data-act=add]');
      check('desk: two lines on the document', (await page.$$('.dk-line')).length === 2);
      // card reader + bank slip
      await page.click('[data-pm=pos]');
      await page.fill('[data-p="0"][data-k=amount]', '500000000');
      await page.fill('[data-p="0"][data-k=ref]', '1234');
      await page.click('[data-pm=slip]');
      await page.fill('[data-p="1"][data-k=amount]', '200000000');
      await page.fill('[data-p="1"][data-k=ref]', '77');
      await page.waitForTimeout(150);
      const sum = await text(page, '#sum');
      check('desk: net 802,810,000 and 102,810,000 left on the customer (rial)', sum.includes('۸۰۲٬۸۱۰٬۰۰۰') && sum.includes('۱۰۲٬۸۱۰٬۰۰۰') && noBadNumbers(sum), sum.replace(/\s+/g, ' ').slice(0, 200));
      await page.click('.dk-save [data-act=save]');
      await page.waitForSelector('.dk-receipt');
      const rc = await text(page, '.dk-receipt');
      check('desk: receipt with lines, payments, balance after and authenticity code', rc.includes('۱۸۲٬۱۹۰٬۰۰۰') && rc.includes('۹۸۵٬۰۰۰٬۰۰۰') && rc.includes('کارتخوان') && rc.includes('۱۰۲٬۸۱۰٬۰۰۰') && /کد اصالت/.test(rc));
      await page.keyboard.press('Escape');
      // goods in on account (no price): 50 g of 745 and a sealed bar with its serial. A field taken right after the kind
      // button keeps the focus: the form's own focus comes a frame later, and on a slow machine it pulled the next keys
      // («745») into the weight («50745» g)
      await page.click('[data-mode=in]');
      const kept = await page.evaluate(async () => {
        document.querySelector('[data-kind=melt]').click();
        document.querySelector('#form [data-f=fineness]').focus();
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        return document.activeElement?.dataset.f ?? document.activeElement?.tagName;
      });
      check('desk: a field taken right after the kind button keeps the focus', kept === 'fineness', kept);
      await page.fill('[data-f=weight]', '50');
      await page.fill('[data-f=fineness]', '745');
      await page.click('[data-act=add]');
      await page.click('[data-kind=bar]');
      await page.fill('[data-f=serial]', '3307021');
      await page.fill('[data-f=weight]', '10');
      await page.fill('[data-f=gallery]', 'رزا');
      await page.click('[data-act=add]');
      await page.click('.dk-save [data-act=save]');
      await page.waitForSelector('.dk-receipt');
      await page.keyboard.press('Escape');
      const bal = await text(page, '.dk-bal');
      check('desk: balances kept apart by material (rial, gold, bar)', bal.includes('۱۰۲٬۸۱۰٬۰۰۰') && bal.includes('۴۹٫۶۶۷') && bal.includes('شمش'), bal.replace(/\s+/g, ' '));
      // the same serial cannot come in twice
      expectedError = /409/;
      await page.fill('[data-f=serial]', '3307021');
      await page.fill('[data-f=weight]', '10');
      await page.click('[data-act=add]');
      await page.click('.dk-save [data-act=save]');
      await page.waitForTimeout(800);
      const dupMsg = await text(page, '#toasts');
      check('desk: a duplicate bar serial is refused', !(await page.$('.dk-receipt')) && /3307021|۳۳۰۷۰۲۱/.test(dupMsg), dupMsg);
      expectedError = null;
      // روزنگار
      await go(page, '/books/day', 1500);
      const day = await text(page, '#dyl');
      check('day book: who, what, weight, fineness, 750, mesghal, مظنه, method, ref and balance after', day.includes('مهران رضایی') && day.includes('۱٫۹۷۳') && day.includes('۰٫۴۵۶') && day.includes('۴۰۰٬۰۰۰٬۰۰۰') && day.includes('کارتخوان') && day.includes('فیش بانکی') && day.includes('پیگیری ۱۲۳۴') && day.includes('۱۰۲٬۸۱۰٬۰۰۰') && noBadNumbers(day), day.slice(0, 160).replace(/\s+/g, ' '));
      await page.click('[data-f=goods]');
      check('day book: filter shows only goods-on-account documents', (await page.$$('.dy-e')).length === 1);
      const dx = await (async () => {
        const [d] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.click('[data-act=dy-csv]')]);
        return (await import('node:fs')).promises.readFile(await d.path(), 'utf8');
      })();
      check('day book: CSV export has the lines', dx.includes('مظنه (ریال)') && dx.includes('3307021'));
      // bars, vault, P&L
      await go(page, '/books/bars?q=3307', 1200);
      check('bars: serial registry shows the bar in the vault with its history', (await text(page, '.br-list')).includes('در گاوصندوق') && (await text(page, '.br-list')).includes('مهران'));
      await go(page, '/books/vault', 1500);
      const vt = await text(page, '.vt-tiles');
      check('vault: gold, coins and bars counted', vt.includes('طلای آبشده') && vt.includes('شمش') && noBadNumbers(vt), vt.replace(/\s+/g, ' ').slice(0, 160));
      // customer page: ته حساب in market words, ریز حساب by document and by unit
      const parties = await auth('/api/books/parties?q=%D9%85%D9%87%D8%B1%D8%A7%D9%86');
      await go(page, `/books/party/${parties.items[0].id}`, 1500);
      const tb = await text(page, '.tb');
      check('customer: ته حساب says بدهکار مالی and بستانکار جنسی separately', tb.includes('بدهکار مالی') && tb.includes('بستانکار جنسی') && tb.includes('مطالبه ما') && noBadNumbers(tb), tb.replace(/\s+/g, ' ').slice(0, 160));
      check('customer: ریز حساب lists each document with what happened', (await page.$$('.rz-e')).length >= 2 && (await text(page, '#rz')).includes('کارتخوان'));
      await page.click('#rzt [data-u="G750"]');
      check('customer: gold ledger has a running balance and a بد/بس column', !!(await page.$('.rz-table tfoot')) && (await text(page, '.rz-table')).includes('بس'));
      // ممیز and the assistant (books engine: no model needed)
      await go(page, '/books/audit', 2000);
      check('audit: score and findings render', !!(await page.$('.au-ring')) && (await page.$$('.au-f')).length >= 1 && noBadNumbers(await text(page, '#board')));
      await page.click('[data-q="بدهکاران"]');
      await page.waitForSelector('.au-m.assistant:not(.typing)');
      check('assistant: answers «بدهکاران» from the books', (await text(page, '#msgs')).includes('مهران'));
      await page.fill('#aq', 'محاسبه ۲ گرم عیار ۷۴۰ مظنه ۴۰۰۰۰۰۰۰۰');
      await page.press('#aq', 'Enter');
      await page.waitForFunction(() => document.querySelectorAll('.au-m.assistant:not(.typing)').length >= 2);
      check('assistant: melt calculation matches the desk', (await text(page, '#msgs')).includes('۱۸۲٬۱۹۰٬۰۰۰'));
      // نبض, رهگیری and حافظه
      await go(page, '/books/pulse', 2000);
      const pl = await text(page, '#main');
      check('pulse: dashboard shows today, gold position, health and activity', !!(await page.$('.pl-meter')) && (await page.$$('.pl-feed li')).length >= 1 && pl.includes('نبض امروز') && noBadNumbers(pl));
      const tr = await page.$eval('.pl-feed .rz-track', (a) => a.textContent.trim());
      await page.click('.pl-feed .rz-track');
      await page.waitForSelector('.tc-doc');
      check('trace: a tracking code opens the document life (lines, payments, postings, history)', (await text(page, '.tc-doc')).includes(tr) && (await page.$$('.tc-tl li')).length >= 1 && (await page.$$('.tc-post tr')).length >= 1);
      await go(page, '/books/memory', 1500);
      check('memory: replay accuracy, rhythm and notes render', (await page.$$('.mm-acc')).length === 3 && noBadNumbers(await text(page, '#main')));
      // management dashboard: KPIs, the three charts and their interactions
      await go(page, '/books/dashboard', 2500);
      await page.waitForSelector('.gd-kpi b');
      check('dashboard: four KPIs, price card and the three charts', (await page.$$('.gd-kpi')).length === 4 && !!(await page.$('.gd-pos')) && (await page.$$('.gd-age')).length === 5 && !!(await page.$('.gd-donut-svg')) && noBadNumbers(await text(page, '.gd-main')));
      await page.focus('#gdPosHost');
      await page.keyboard.press('ArrowRight');
      check('dashboard: keyboard crosshair shows a financial tooltip', await page.$eval('.gd-tip', (t) => !t.hidden && t.innerText.includes('موقعیت خالص')));
      await page.click('[data-range="30"]');
      await page.waitForFunction(() => !document.querySelector('.gd.is-busy') && document.querySelectorAll('.gd-pos .xl text').length >= 3);
      check('dashboard: range switch reloads the position series', true);
      const bucket = await page.$('.gd-age:not([disabled])');
      if (bucket) {
        await bucket.click();
        check('dashboard: an aging bucket opens its customer cohort', !!(await page.$('#gdCohort:not([hidden]) li a')));
      }
      await page.click('[data-alloc=book]');
      await page.click('.gd-leg [data-seg=gold]');
      check('dashboard: book/market toggle and the physical-gold breakdown', (await text(page, '.gd-sub')).includes('آب‌شده'));
      // the year: activity calendar (371 days, today is lit) and monthly results
      check('dashboard: activity calendar has 371 days and today is active', (await page.$$('.gd-heat-svg rect.hc')).length === 371 && !(await page.$eval('.gd-heat-svg rect.hc:last-of-type', (r) => r.classList.contains('l0'))));
      await page.focus('#gdHeatHost');
      await page.keyboard.press('ArrowRight');
      check('dashboard: keyboard moves through the activity calendar', (await text(page, '#gdHeatRead')).includes('سند') && !!(await page.$('.gd-heat-svg rect.hc.on')));
      await page.click('[data-heat=value]');
      check('dashboard: value metric redraws the calendar', (await page.$$('.gd-heat-svg rect.hc')).length === 371);
      check('dashboard: monthly results table covers 12 Jalali months', (await page.$$('.gd-ret thead th')).length === 14 && noBadNumbers(await text(page, '#gdRetHost')));
      const mcell = await page.$('.gd-ret .rc');
      if (mcell) {
        await mcell.click();
        await page.waitForURL(/tab=pnl&from=/);
        check('dashboard: a month opens its P&L report', (await text(page, '#rep')).includes('میانگین'));
      }
      await go(page, '/books/reports?tab=pnl', 1500);
      check('reports: trading P&L renders', noBadNumbers(await text(page, '#rep')) && (await text(page, '#rep')).includes('میانگین'));
      // bank reconciliation from a pasted statement
      const accs = await auth('/api/books/accounts');
      const bank = accs.items.find((a) => a.kind === 'bank');
      await go(page, `/books/bank/${bank.id}`, 1500);
      const jToday = await page.evaluate(async () => {
        const K = await import('/js/bk.mjs');
        return K.jd(K.today());
      });
      // the bank's export dropped on the page (spec 0040): its text lands in the box as if pasted (BOM and CRLF dropped)
      const stmt = `${jToday}, 500000000, 1234\n${jToday}, 200000000, 77`;
      const dt = await page.evaluateHandle((t) => {
        const d = new DataTransfer();
        d.items.add(new File([`\uFEFF${t.replace(/\n/g, '\r\n')}\r\n`], 'statement.csv', { type: 'text/csv' }));
        return d;
      }, stmt);
      for (const ev of ['dragenter', 'dragover', 'drop']) await page.dispatchEvent('.u-dz', ev, { dataTransfer: dt });
      await page.waitForFunction((t) => document.querySelector('#stmt')?.value === t, stmt, { timeout: 5000 }).catch(() => {});
      check('bank: a CSV dropped on the page fills the statement box', (await page.inputValue('#stmt')) === stmt, await page.inputValue('#stmt'));
      const stray = await page.evaluate(() => {
        const d = new DataTransfer();
        d.items.add(new File(['x'], 'stray.csv', { type: 'text/csv' }));
        const ev = new DragEvent('drop', { dataTransfer: d, bubbles: true, cancelable: true });
        document.querySelector('h1, .bk-h')?.dispatchEvent(ev);
        return ev.defaultPrevented;
      });
      check('bank: a file dropped beside the box is ignored, not opened in place of the app', stray);
      await page.click('[data-act=match]');
      await page.waitForSelector('#mres p');
      check('bank: statement rows matched by amount and reference', (await text(page, '#mres')).includes('۲ ردیف جفت شد'), await text(page, '#mres'));
      await page.click('[data-act=save]');
      await page.waitForTimeout(1200);
      check('bank: reconciliation saved', (await page.$$eval('[data-rc]:checked', (x) => x.length)) >= 2);
    });

  await step('control: pulse, what changed, explain, palette, safe sale, exceptions, twin, lots, trial, forecast, karat', async () => {
    await go(page, '/books/dashboard', 2500);
    await page.waitForSelector('.gd-pulse .gd-sentence', { timeout: 20000 });
    const sentence = await text(page, '.gd-sentence');
    check('control: gold pulse sentence above the charts', sentence.length > 15 && /^(فروشگاه آرام است|به چند مورد نگاه کنید|هشدار)/.test(sentence), sentence);
    check('control: what-changed list beside it', (await page.$$('.gd-news-list li, .gd-news .gd-empty')).length > 0);
    const order = await page.evaluate(() => { const s = document.querySelector('.gd-sig'), c = document.querySelector('.gd-charts'); return !!(s && c && (s.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING)); });
    check('control: the signature sits right above the three charts', order);
    await page.click('.gd-kpi-w .gd-why');
    await page.waitForSelector('.xp-s');
    check('control: explain this number opens with a sentence and a formula', (await text(page, '.xp-s')).length > 20 && (await text(page, '.xp-f')).includes('فرمول'));
    await page.keyboard.press('Escape');
    await page.keyboard.press('Control+k');
    await page.waitForSelector('.pal');
    await page.keyboard.type('فروش امن');
    await page.waitForTimeout(400);
    const first = await text(page, '.pal-list li.on');
    check('control: command palette finds a tool by two words', first.includes('فروش امن'), first);
    await page.keyboard.press('Enter');
    await page.waitForURL(/t=simulate/);
    await page.waitForSelector('#simF');
    await page.fill('#simF [name=weight]', '1');
    await page.click('#simF [data-act=run]');
    await page.waitForSelector('.ctl-verdict h2');
    const v = await text(page, '.ctl-verdict');
    check('control: safe-sale verdict with probabilities and before/after', /امن است|با احتیاط|ثبت نکنید/.test(v) && v.includes('اطمینان') && (await page.$$('.ctl-ba tbody tr')).length >= 3, v.slice(0, 80));
    for (const [t, sel, name] of [['exceptions', '.ctl-exc, .ctl-empty', 'exceptions centre'], ['twin', '.ctl-twin .ctl-tw', 'digital twin'], ['lots', '.ctl-lots, .ctl-empty', 'gold lots'], ['trial', '.ctl-trial', 'dual trial balance'], ['forecast', '.ctl-fc svg', '10-day forecast'], ['approvals', '.ctl-ap, .ctl-empty', 'approvals'], ['periods', '.ctl-months', 'period lock'], ['close', '.ctl-recon, .ctl-empty', 'auto close'], ['karat', '.ctl-twin .ctl-tw', 'karat engine']]) {
      await go(page, `/books/control?t=${t}`, 900);
      const shown = await page.waitForSelector(sel, { timeout: 15000 }).then(() => true, () => false);
      check(`control: ${name} renders`, shown && noBadNumbers(await text(page, '#ctlBody')), shown ? '' : (await text(page, '#ctlBody')).slice(0, 160));
    }
    await go(page, '/books/control?t=twin', 900);
    await page.waitForSelector('.ctl-tw .ctl-why');
    await page.click('.ctl-tw .ctl-why');
    await page.waitForSelector('.xp-s');
    check('control: twin numbers explain themselves', (await text(page, '.xp-s')).length > 10);
    await page.keyboard.press('Escape');
  });
  await step('jewel cad: every piece × setting is a closed solid, pavé without overlaps, thickness, sizes, tools, report', async () => {
    await go(page, '/studio', 2500);
    const r = await page.evaluate(async () => {
      const J = await import('/js/three/jewelcad.mjs');
      const bad = [], counts = {};
      for (const [k, def] of Object.entries(J.PIECES)) {
        if (def.free) continue; // free-modeller parts (spec 0008) have their own step
        const params = Object.fromEntries(Object.entries(def.params).map(([a, v]) => [a, v[0]]));
        for (const st of 'setting' in def.opts ? J.SETTINGS.map(([x]) => x) : [undefined]) {
          const ms = await def.build({ ...params, ...def.opts, ...(st ? { setting: st } : {}) });
          const metal = ms.filter((m) => m.userData.role === 'metal').reduce((s, m) => s + J.signedVolume(m.geometry), 0);
          if (!def.noMetal && !(metal > 0)) bad.push(`${k}:${st} metal ${metal}`);
          const stones = ms.filter((m) => m.userData.role === 'gem').flatMap((g) => J.stonesOf(g));
          if (J.collisions(stones).length) bad.push(`${k}:${st} collisions`);
          counts[k] = stones.length;
        }
      }
      for (const [c] of J.CUTS) if (!(J.signedVolume(J.gemGeo(c, 6).geo) > 0)) bad.push(`cut ${c}`);
      const band = (await J.PIECES.band.build({ size: 54, width: 4, thickness: 1.8, profile: 'flat' }))[0];
      const th = J.thickness(band, { samples: 1200 });
      return { bad, counts, min: th.min, us7: J.ringSize.fromUS(7).iso, n: Object.values(J.PIECES).filter((d) => !d.free).length, settings: J.SETTINGS.length, cuts: J.CUTS.length };
    });
    check(`jewel cad: ${r.n} pieces, ${r.settings} settings, ${r.cuts} cuts all build closed solids without stone overlaps`, r.bad.length === 0 && r.n >= 24 && r.settings >= 10 && r.cuts >= 11, r.bad.slice(0, 4).join(' | '));
    check('jewel cad: pavé band and pavé plate place many stones', r.counts.pave >= 20 && r.counts.pavePlate >= 40, JSON.stringify({ pave: r.counts.pave, plate: r.counts.pavePlate }));
    check('jewel cad: wall thickness of a 1.8 mm band reads 1.8 mm (±10%)', Math.abs(r.min - 1.8) < 0.18, String(r.min));
    check('jewel cad: US 7 = ISO 54.4 mm', Math.abs(r.us7 - 54.41) < 0.05, String(r.us7));
    // the UI: pick cathedral, change setting, set size by US, run tools and the report
    await page.evaluate(() => localStorage.removeItem('beatris.studio.v1'));
    await go(page, '/studio', 2500);
    await page.click('[data-type="cathedral"]');
    await page.waitForTimeout(1200);
    await page.click('[data-opt="setting"][data-val="trellis"]');
    await page.waitForTimeout(800);
    await page.fill('[data-us]', '8');
    await page.dispatchEvent('[data-us]', 'input');
    await page.waitForTimeout(800);
    const size = await page.$eval('[data-param="size"]', (e) => Number(e.value));
    check('jewel cad: US size input sets the ISO size', Math.abs(size - 57) < 0.6, String(size));
    await page.click('[data-act="thick"]');
    await page.waitForFunction(() => /ضخامت/.test(document.querySelector('#cadOut')?.textContent ?? ''), null, { timeout: 30000 });
    check('jewel cad: thickness analysis reports a minimum', /کمترین ضخامت/.test(await text(page, '#cadOut')), await text(page, '#cadOut'));
    await page.click('[data-act="coll"]');
    await page.waitForTimeout(500);
    check('jewel cad: stone collision check runs', /سنگ/.test(await text(page, '#cadOut')), await text(page, '#cadOut'));
    await page.click('[data-act="sprue"]');
    await page.waitForTimeout(1200);
    await page.click('[data-act="pair"]');
    await page.waitForTimeout(1500);
    check('jewel cad: sprue and pair add parts', (await page.$$('.parts li')).length >= 3, String((await page.$$('.parts li')).length));
    await page.click('[data-act="report"]');
    await page.waitForSelector('[data-rp="csv"]');
    const rep = await text(page, '.modal');
    check('jewel cad: report lists metal grams and stones', rep.includes('گرم') && rep.includes('الماس'), rep.replace(/\s+/g, ' ').slice(0, 120));
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-rp="csv"]')]);
    check('jewel cad: report downloads as CSV', dl.suggestedFilename().endsWith('.csv'));
    await page.click('[data-rp="close"]');
    await page.evaluate(() => localStorage.removeItem('beatris.studio.v1'));
  });

  await step('free modeller: curves, solids from curves, booleans, mesh tools, deforms, seats — closed solids, then in the studio UI', async () => {
    await go(page, '/studio', 2500);
    const r = await page.evaluate(async () => {
      const D = await import('/js/three/modeler.mjs');
      const { COMMANDS } = await import('/js/pages/studiomodel.mjs');
      const A = (g) => D.analyze(g);
      const bad = [];
      for (const k of Object.keys(D.SOLIDS)) if (!A(D.solid(k, {})).closed) bad.push(`solid ${k}`);
      const box = D.solid('box', { x: 10, y: 6, z: 4 }), cyl = D.solid('cylinder', { r: 2, h: 10 }), sph = D.solid('sphere', { r: 4 });
      const res = {
        revolve: A(D.revolve(D.curve([[3, 0], [5, 0], [5, 2], [3, 2]], true))),
        torus: A(D.sweep1(D.CURVES.circle({ radius: 1 }), D.CURVES.circle({ radius: 10 }))),
        loft: A(D.loft([D.CURVES.circle({ radius: 5 }), { ...D.CURVES.rectangle({ width: 6, height: 6 }), pts: D.CURVES.rectangle({ width: 6, height: 6 }).pts.map(([x, y]) => [x, y, 8]) }])),
        sweep2: A(D.sweep2(D.curve([[0, 0], [10, 0], [10, 1], [0, 1]], true), D.CURVES.line({ length: 20 }), D.curve([[-10, 8, 0], [10, 4, 0]]))),
        cyldiff: A(D.boolean(box, cyl, 'difference')),
        sphdiff: A(D.boolean(box, sph, 'difference')),
        sphint: A(D.boolean(box, sph, 'intersection')),
        sphuni: A(D.boolean(box, sph, 'union')),
        shell: A(D.shell(D.solid('sphere', { r: 5 }), { thickness: 0.6 })),
        twist: A(D.DEFORMS.twist(box, { angle: 90 })),
      };
      for (const [k, a] of Object.entries(res)) if (!a.closed || a.nonManifold) bad.push(`${k} open ${a.naked}/${a.nonManifold}`);
      const rt = A(D.decodeGeo(D.encodeGeo(D.boolean(box, sph, 'difference'))));
      const SD = (await import('/js/three/jewelcad.mjs')).PIECES.solitaire;
      const sol = await SD.build({ ...Object.fromEntries(Object.entries(SD.params).map(([a, v]) => [a, v[0]])), ...SD.opts });
      sol.forEach((m) => m.updateMatrixWorld(true)); // built outside the scene: world matrices must be current for the cutters
      const metal = D.merge(sol.filter((m) => m.userData.role === 'metal').map((m) => m.geometry.clone().applyMatrix4(m.matrixWorld)));
      const cut = sol.filter((m) => m.userData.role === 'gem').flatMap((g) => D.seatCutters(g, {}));
      const t0 = performance.now();
      const seated = A(D.differenceByPiece(metal, cut[0]));
      const pieces = D.splitComponents(metal);
      if (!pieces.every((g) => A(g).closed)) bad.push('solitaire has an open piece');
      return { bad, n: COMMANDS.length, revolve: res.revolve.volume, torus: res.torus.volume, cyldiff: res.cyldiff.volume, sum: res.sphdiff.volume + res.sphint.volume, int: res.sphint.volume, uni: res.sphuni.volume, sph: A(sph).volume, rt: [rt.closed, rt.volume], seat: [A(metal).volume - seated.volume, cut.length, performance.now() - t0] };
    });
    check(`free modeller: ${r.n} commands; every primitive, sweep, loft, revolve, boolean, shell and deform is a closed manifold solid`, r.n >= 55 && r.bad.length === 0, r.bad.join(' | '));
    check('free modeller: volumes are exact — revolve π(5²−3²)·2, swept torus 2π²·10·1, box − cylinder', Math.abs(r.revolve - 100.53) < 0.5 && Math.abs(r.torus - 197.4) < 2 && Math.abs(r.cyldiff - 164.6) < 0.5, JSON.stringify([r.revolve, r.torus, r.cyldiff]));
    check('free modeller: box−sphere + box∩sphere = box, and box∪sphere = box + sphere − overlap', Math.abs(r.sum - 240) < 0.05 && Math.abs(r.uni - (240 + r.sph - r.int)) < 0.05, JSON.stringify([r.sum, r.uni, r.sph, r.int]));
    check('free modeller: a stored solid reloads closed with the same volume', r.rt[0] && Math.abs(r.rt[1] - (r.sum - r.int)) < 0.05, JSON.stringify(r.rt));
    check('free modeller: a gem seat cuts metal from a solitaire in seconds', r.seat[0] > 0.05 && r.seat[1] === 1 && r.seat[2] < 20000, JSON.stringify(r.seat));
    // the UI: draw, generate, extrude, boolean, check, seat, reload
    await page.evaluate(() => localStorage.removeItem('beatris.studio.v1'));
    await go(page, '/studio', 2500);
    const parts = () => page.evaluate(() => JSON.parse(localStorage.getItem('beatris.studio.v1') ?? '{"parts":[]}').parts.map((x) => ({ id: x.id, type: x.type, name: x.opts.name ?? '' })));
    const idOf = async (name) => String((await parts()).filter((x) => x.name === name).at(-1)?.id);
    const cmd = async (id, vals = {}, sel = {}) => {
      await page.fill('#mdlQ', id);
      await page.click(`[data-cmd="${id}"]`);
      await page.waitForSelector('#mdlF');
      for (const [k, v] of Object.entries(vals)) await page.fill(`#mdlF [name="${k}"]`, String(v));
      for (const [k, v] of Object.entries(sel)) await page.selectOption(`#mdlF [name="${k}"]`, v);
      await page.click('#mdlF button.btn:not(.ghost)');
      await page.waitForFunction(() => !document.querySelector('#mdlF') || /[^…]$/.test(document.querySelector('#mdlMsg')?.textContent || '…'), null, { timeout: 60000 });
      const err = await page.$('#mdlF') ? await text(page, '#mdlMsg') : '';
      if (err) await page.click('#mdlF [data-close]');
      return err;
    };
    await page.fill('#mdlQ', 'Polyline');
    await page.click('[data-cmd="Polyline"]');
    const vb = await page.$eval('#vp canvas', (c) => { const r = c.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
    for (const [dx, dy] of [[-60, -20], [40, -40], [70, 40], [-30, 60]]) await page.mouse.click(vb[0] + dx, vb[1] + dy), await page.waitForTimeout(60);
    await page.keyboard.press('c');
    await page.waitForTimeout(800);
    check('free modeller: clicking on the plane draws a closed polyline part', (await parts()).some((x) => x.type === 'curve'), JSON.stringify(await parts()));
    const errs = [];
    errs.push(await cmd('Circle', { radius: 6 }));
    errs.push(await cmd('ExtrudeCrv', { height: 3 }));
    errs.push(await cmd('Box', {}));
    errs.push(await cmd('Cylinder', { r: 2, h: 10 }));
    errs.push(await cmd('BooleanDifference', {}, { part: await idOf('مکعب'), part2: await idOf('استوانه') }));
    check('free modeller: circle → extrude → box − cylinder run without errors', errs.every((e) => !e), errs.join(' | '));
    const pl = await parts();
    check('free modeller: the boolean replaced its inputs with one solid', pl.some((x) => x.name.startsWith('تفاضل')) && !pl.some((x) => x.name === 'مکعب' || x.name === 'استوانه'), JSON.stringify(pl.map((x) => x.name)));
    await page.fill('#mdlQ', 'Check');
    await page.click('[data-cmd="Check"]');
    await page.waitForSelector('#mdlF');
    await page.click('#mdlF button.btn:not(.ghost)');
    await page.waitForFunction(() => [...document.querySelectorAll('.toast')].some((t) => t.textContent.includes('mm³')), null, { timeout: 30000 });
    const chk = await page.evaluate(() => [...document.querySelectorAll('.toast')].find((t) => t.textContent.includes('mm³')).textContent);
    check('free modeller: Check reports the boolean result closed (ready to print)', chk.includes('بسته'), chk);
    check('free modeller: the readout weighs the new solid in gold', /گرم/.test(await text(page, '#readout')));
    await page.click('[data-act=add]');
    await page.click('[data-add=solitaire]');
    await page.waitForTimeout(1500);
    const seatErr = await cmd('GemSeat', {});
    check('free modeller: GemSeat turns a solitaire into metal-with-seat + stones', !seatErr && (await parts()).some((x) => x.type === 'meshGem'), seatErr);
    const before = (await parts()).length;
    await page.reload();
    await page.waitForSelector('#mdl');
    await page.waitForTimeout(2500);
    check('free modeller: free curves and solids survive a reload', (await page.$$('.parts li')).length === before, `${(await page.$$('.parts li')).length} vs ${before}`);
    await page.evaluate(() => localStorage.removeItem('beatris.studio.v1'));
  });

  await step('photo scan: coin from 8 lit photos and a ring from turntable photos become closed, weighed, inspectable parts', async () => {
    await page.evaluate(() => localStorage.removeItem('beatris.studio.v1'));
    await go(page, '/studio', 2500);
    const analyse = (id) => page.evaluate(async (id) => {
      const D = await import('/js/three/modeler.mjs');
      const st = JSON.parse(localStorage.getItem('beatris.studio.v1'));
      const p = st.parts?.find((x) => x.id === id);
      const sc = await import('/js/three/scan3d.mjs');
      const ms = await sc.buildScan(p.opts.scan);
      const a = D.analyze(D.merge(ms.map((m) => m.geometry.clone())));
      ms[0].geometry.computeBoundingBox();
      const bb = new (await import('/js/three/stage.mjs')).T.Box3();
      ms.forEach((m) => (m.geometry.computeBoundingBox(), bb.union(m.geometry.boundingBox)));
      return { closed: a.closed, naked: a.naked, volume: a.volume, size: [bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z], info: JSON.parse(p.opts.scan).info };
    }, id);
    const lastScan = async () => page.evaluate(() => JSON.parse(localStorage.getItem('beatris.studio.v1')).parts.filter((x) => x.type === 'scan').at(-1)?.id);
    // 1) coin: 8 photos, light from the clock directions
    await page.click('[data-act="scan"]');
    await page.waitForSelector('#scR');
    await page.selectOption('#scR [name=coin]', 'bahar');
    await page.setInputFiles('#scR [name=front]', coinPhotos());
    await page.click('#scR button.btn:not(.ghost)');
    await page.waitForSelector('#scan', { state: 'detached', timeout: 120000 });
    const cid = await lastScan();
    const c = await analyse(cid);
    check('photo scan: the coin scan is a closed solid', c.closed, JSON.stringify({ naked: c.naked }));
    check('photo scan: the coin is 22 mm across (scale from the nominal diameter)', Math.abs(c.size[0] - 22) < 0.6 && Math.abs(c.size[1] - 22) < 0.6, JSON.stringify(c.size));
    check('photo scan: the coin relief stands out of the field', c.size[2] > c.info.thickness + 0.3, JSON.stringify({ z: c.size[2], t: c.info.thickness }));
    check('photo scan: photo look renders the scan with its own texture', /رنگ واقعی/.test(await text(page, '#lab')));
    // the lab: weighing a genuine-like coin, view tools
    await page.fill('#labWa', '8.133');
    await page.fill('#labWw', String((8.133 - 8.133 / 17.18 * 0.9982).toFixed(3)));
    await page.click('[data-lab="weigh"]');
    await page.waitForTimeout(400);
    const lab = await text(page, '#labOut');
    check('photo scan: the true volume (Archimedes) sets the thickness the photos cannot see', /ضخامت مدل/.test(lab) && /ارشمیدس/.test(lab), lab.replace(/\s+/g, ' ').slice(0, 200));
    check('photo scan: weighing gives density, karat and the coin fraud probability', /چگالی/.test(lab) && /عیار/.test(lab) && /احتمال تقلب/.test(lab), lab.replace(/\s+/g, ' ').slice(0, 200));
    await page.click('[data-lab="rake"]');
    await page.click('[data-lab="heat"]');
    await page.waitForTimeout(300);
    check('photo scan: height map reports the relief range', /نقشه ارتفاع/.test(await text(page, '#labOut')));
    await page.click('[data-lab="heat"]');
    await page.click('[data-lab="rake"]');
    // 2) ring on the turntable mat: two loops of 18 photos
    await page.click('[data-act="scan"]');
    await page.click('[data-stab="hull"]');
    await page.fill('#scH [name=step]', '20');
    await page.selectOption('#scH [name=res]', '120');
    await page.setInputFiles('#scH [name=photos]', ringPhotos());
    await page.waitForTimeout(1500);
    check('photo scan: the mat ring is found in the first photo (preview)', /زاویه دوربین/.test(await text(page, '#shMsg')), await text(page, '#shMsg'));
    await page.click('#scH button.btn:not(.ghost)');
    await page.waitForSelector('#scan', { state: 'detached', timeout: 240000 });
    const rid = await lastScan();
    const r = await analyse(rid);
    const truth = 2 * Math.PI ** 2 * 9 * 1.5 ** 2;
    check('photo scan: the ring hull is a closed mesh', r.closed, JSON.stringify({ naked: r.naked }));
    check('photo scan: ring size from the mat ring (21 × 3 × 21 mm ±1)', Math.abs(r.size[0] - 21) < 1.2 && Math.abs(r.size[2] - 21) < 1.2 && r.size[1] < 4.5, JSON.stringify(r.size));
    check('photo scan: ring volume close to the true ring (hull ≥ object)', r.volume > truth * 0.85 && r.volume < truth * 1.6, `${r.volume.toFixed(1)} vs ${truth.toFixed(1)}`);
    // measuring two points on the model surface
    await page.click('[data-lab="measure"]');
    const vb = await page.$eval('#vp canvas', (cv) => { const b = cv.getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; });
    await page.click('[data-act="frame"]');
    await page.waitForTimeout(600);
    await page.keyboard.press('Escape');
    const before = (await page.$$('.parts li')).length;
    await page.reload();
    await page.waitForSelector('#mdl');
    await page.waitForTimeout(3500);
    check('photo scan: scans survive a reload (IndexedDB for large projects)', (await page.$$('.parts li')).length === before, `${(await page.$$('.parts li')).length} vs ${before}`);
    void vb;
    await page.evaluate(() => localStorage.removeItem('beatris.studio.v1'));
  });

  await step('rhino tools 2: NURBS, IGES and 3DM, surfaces with control points, SubD cage, fillets and offsets, sculpting', async () => {
    await page.evaluate(() => localStorage.removeItem('beatris.studio.v1'));
    await go(page, '/studio', 2500);
    // large projects live in IndexedDB: read the live state through the studio's test hook
    const parts = () => page.evaluate(() => globalThis.__beatrisStudio.state().parts.map((x) => ({ id: x.id, type: x.type, name: x.opts.name ?? '', data: x.opts.data ?? x.opts.srf ?? x.opts.cage ?? '' })));
    const cmd = async (id, vals = {}, sel = {}) => {
      await page.fill('#mdlQ', id);
      await page.click(`[data-cmd="${id}"]`);
      await page.waitForSelector('#mdlF');
      for (const [k, v] of Object.entries(vals)) await page.fill(`#mdlF [name="${k}"]`, String(v));
      for (const [k, v] of Object.entries(sel)) await page.selectOption(`#mdlF [name="${k}"]`, v);
      await page.click('#mdlF button.btn:not(.ghost)');
      await page.waitForFunction(() => !document.querySelector('#mdlF') || /[^…]$/.test(document.querySelector('#mdlMsg')?.textContent || '…'), null, { timeout: 90000 });
      const err = (await page.$('#mdlF')) ? await text(page, '#mdlMsg') : '';
      if (err) await page.click('#mdlF [data-close]');
      return err;
    };
    const volOf = (id) => page.evaluate(async (id) => {
      const D = await import('/js/three/modeler.mjs');
      const p = globalThis.__beatrisStudio.state().parts.find((x) => x.id === id);
      const def = (await import('/js/three/jewelcad.mjs')).PIECES[p.type];
      await import('/js/three/cad2.mjs');
      try {
        const ms = await def.build({ ...p.params, ...p.opts });
        const a = D.analyze(D.merge(ms.filter((m) => m.isMesh).map((m) => m.geometry.clone())));
        return { v: a.volume, closed: a.closed };
      } catch (e) {
        return { v: NaN, closed: false, err: `${p.type}: ${e.stack}`.slice(0, 400) };
      }
    }, id);
    const last = async (type) => (await parts()).filter((x) => x.type === type).at(-1);
    // exact circle, rebuild, knot insertion
    const errs = [await cmd('CircleNurbs', { radius: 8 })];
    const circ = JSON.parse((await last('curve')).data);
    check('rhino 2: the circle is an exact rational NURBS (9 points, weights √½)', circ.nurbs?.P.length === 9 && Math.abs(circ.nurbs.W[1] - Math.SQRT1_2) < 1e-12, JSON.stringify(circ.nurbs?.W));
    errs.push(await cmd('InsertKnot', { u: 0.3 }));
    check('rhino 2: inserting a knot adds a control point and keeps the circle', JSON.parse((await last('curve')).data).nurbs?.P.length === 10);
    errs.push(await cmd('Rebuild', { count: 12, degree: 3 }));
    check('rhino 2: rebuild gives 12 control points of degree 3', JSON.parse((await last('curve')).data).nurbs?.P.length === 12 && JSON.parse((await last('curve')).data).nurbs?.p === 3);
    // a NURBS surface thickened to a solid, then its control points edited
    errs.push(await cmd('SrfPt', { w: 20, h: 12, lift: 0, t: 0.8 }));
    const sp = await last('nsurf'), sv = await volOf(sp.id);
    check('rhino 2: a four-point surface 20 × 12 thickened 0.8 mm is a closed 192 mm³ solid', sv.closed && Math.abs(sv.v - 192) < 0.5, JSON.stringify(sv));
    await page.fill('#mdlQ', 'PointsOn');
    await page.click('[data-cmd="PointsOn"]');
    await page.waitForSelector('.edit-bar');
    await page.evaluate(() => globalThis.__beatrisStudio.editor.movePoint(3, [0, 4, 0]));
    await page.waitForTimeout(400);
    const moved = JSON.parse((await last('nsurf')).data);
    check('rhino 2: moving a surface control point changes the NURBS and the solid', Math.abs(moved.s.P[1][1][1] - 4) < 1e-6 && (await volOf(sp.id)).closed, JSON.stringify(moved.s.P[1][1]));
    await page.keyboard.press('Escape');
    // SubD ring: extrude a cage face
    errs.push(await cmd('SubDTorus', { R: 9, r: 1.5, n: 8 }));
    const sd = await last('subd'), v0 = await volOf(sd.id);
    check('rhino 2: SubD ring is a closed smooth solid', v0.closed && v0.v > 300, JSON.stringify(v0));
    await page.fill('#mdlQ', 'SubDEdit');
    await page.click('[data-cmd="SubDEdit"]');
    await page.waitForSelector('.edit-bar');
    await page.evaluate(() => globalThis.__beatrisStudio.editor.faceOp('extrude', 2, 3));
    await page.waitForTimeout(500);
    const sd2 = JSON.parse((await last('subd')).data), v1 = await volOf(sd.id);
    check('rhino 2: extruding a cage face adds 4 faces and volume, still closed', sd2.f.length === 32 + 4 && v1.v > v0.v && v1.closed, JSON.stringify({ f: sd2.f.length, v0: v0.v, v1: v1.v }));
    await page.keyboard.press('Escape');
    // fillet and offset of a box
    errs.push(await cmd('Box', { x: 10, y: 6, z: 4 }));
    errs.push(await cmd('FilletEdge', { r: 1, res: 100 }));
    const fb = await last('mesh'), fv = await volOf(fb.id);
    const rounded = 4 * 8 * 2 + 2 * (8 * 4 + 4 * 2 + 8 * 2) + Math.PI * (8 + 4 + 2) + (4 / 3) * Math.PI; // (a−2r)(b−2r)(c−2r) + faces·r + edges·πr²/4·4 + sphere
    check('rhino 2: fillet r = 1 on a 10 × 6 × 4 box gives the rounded-box volume (±3 %), closed', fv.closed && Math.abs(fv.v / rounded - 1) < 0.03, JSON.stringify({ v: fv.v, rounded }));
    errs.push(await cmd('OffsetMesh', { d: 0.5, res: 100 }));
    const ov = await volOf((await last('mesh')).id);
    check('rhino 2: offset +0.5 mm grows the solid', ov.closed && ov.v > fv.v * 1.2, JSON.stringify(ov));
    // sculpting a dent into the box
    await page.fill('#mdlQ', 'Sculpt');
    await page.click('[data-cmd="Sculpt"]');
    await page.waitForSelector('.edit-bar');
    await page.click('[data-act="frame"]');
    await page.waitForTimeout(500);
    const before = (await volOf((await last('mesh')).id)).v;
    const vb = await page.$eval('#vp canvas', (cv) => { const b = cv.getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; });
    await page.mouse.move(vb[0] - 10, vb[1]);
    await page.mouse.down();
    for (let i = 0; i < 10; i++) await page.mouse.move(vb[0] - 10 + i * 3, vb[1] + i), await page.waitForTimeout(30);
    await page.mouse.up();
    await page.click('.edit-bar [data-eb="done"]');
    await page.waitForTimeout(800);
    const after = (await volOf((await last('mesh')).id)).v;
    check('rhino 2: a sculpt stroke changes the solid and is saved', Math.abs(after - before) > 0.01, JSON.stringify({ before, after }));
    check('rhino 2: every command ran without an error', errs.every((e) => !e), errs.join(' | '));
    // exports
    const [ig] = await Promise.all([page.waitForEvent('download'), (async () => { await page.fill('#mdlQ', 'ExportIGES'); await page.click('[data-cmd="ExportIGES"]'); })()]);
    const igs = await (await import('node:fs/promises')).readFile(await ig.path(), 'utf8');
    check('rhino 2: IGES has NURBS curve (126) and surface (128) entities in 80-column records', /^ {5}126/m.test(igs) && /^ {5}128/m.test(igs) && igs.trim().split('\n').every((l) => l.length === 80), igs.slice(0, 80));
    const [r3] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), (async () => { await page.fill('#mdlQ', 'Export3dm'); await page.click('[data-cmd="Export3dm"]'); })()]);
    const head = (await (await import('node:fs/promises')).readFile(await r3.path())).subarray(0, 32).toString('latin1');
    check('rhino 2: the .3dm file is a Rhino 3D model', head.startsWith('3D Geometry File Format') && r3.suggestedFilename().endsWith('.3dm'), head);
    await page.evaluate(() => localStorage.removeItem('beatris.studio.v1'));
  });

  if (!live)
    await step('operator desk (spec 0013): one-line entry, quick undo to the field, restore, repeat, macro, amendment, offline queue', async () => {
      const auth = (path, opt = {}) => page.evaluate(async ([p, o]) => (await fetch(p, { ...o, headers: { 'content-type': 'application/json', Authorization: `Bearer ${localStorage.getItem('beatris.token')}` } })).json(), [path, opt]);
      await auth('/api/books/parties', { method: 'POST', body: JSON.stringify({ name: 'کاظم اپراتوری' }) });
      await freshDesk(page);
      await page.keyboard.press('F3');
      check('operator: F3 lands in the one-line box', await page.evaluate(() => document.activeElement?.id === 'dkLine'));
      await page.keyboard.type('خرید - کاظم اپراتوری - دوازده ممیز چهل و پنج گرم - عیار هفتصد و پنجاه - نقد');
      await page.waitForTimeout(300);
      check('operator: the line is understood before it is applied', /۱۲٫۴۵ گرم/.test(await text(page, '#dkLineOut')) && !(await page.$('.dk-part.unknown')), await text(page, '#dkLineOut'));
      await watchSnap(page, '#sum .kv.big.snap', '#sum');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(1500);
      check('operator: the net that changed snaps into place (spec 0039)', (await snaps(page)) > 0);
      const one = await page.evaluate(() => ({ lines: document.querySelectorAll('.dk-line').length, pays: document.querySelectorAll('.bk-pay').length, who: document.querySelector('.dk-who b')?.textContent ?? '', s: document.querySelector('#dkSentence')?.textContent ?? '' }));
      check('operator: one line becomes customer + line + payment', one.lines === 1 && one.pays === 1 && one.who.includes('کاظم') && /۱۲٫۴۵۰ گرم آبشده ۷۵۰/.test(one.s), JSON.stringify(one));
      // a slip of the finger, taken back at once with the cursor on the same field
      await page.fill('[data-f=weight]', '3');
      await page.waitForTimeout(1400);
      await page.keyboard.press('Control+z');
      await page.waitForTimeout(300);
      const u1 = await page.evaluate(() => ({ w: document.querySelector('[data-f=weight]')?.value, focus: document.activeElement?.dataset?.f ?? '' }));
      check('operator: Ctrl+Z takes the weight back and the cursor lands on it', u1.w === '' && u1.focus === 'weight', JSON.stringify(u1));
      await page.click('.ud-back');
      await page.waitForTimeout(400);
      check('operator: the fixed back button takes the whole one-line entry back', (await page.$$('.dk-line')).length === 0);
      await page.keyboard.press('Control+Shift+z');
      await page.waitForTimeout(400);
      check('operator: Ctrl+Shift+Z brings it forward again', (await page.$$('.dk-line')).length === 1);
      // nothing is lost on a refresh
      await page.reload();
      await page.waitForTimeout(2200);
      check('operator: after a refresh the unfinished work is back by itself', (await page.$$('.dk-line')).length === 1 && /کار ناتمام/.test(await text(page, '.dk-draft')));
      await page.keyboard.press('Control+Enter');
      await page.waitForSelector('.dk-receipt', { timeout: 15000 });
      const track1 = (await text(page, '.dk-r-track b')).trim();
      check('operator: Ctrl+Enter books it; receipt beside the work, desk empty for the next call', /^M\d{4}-\d{5}$/.test(track1) && (await page.$$('.dk-line')).length === 0, track1);
      // «مثل معامله قبلی» for the same customer, with today's price
      await page.keyboard.press('Alt+KeyR');
      await page.waitForTimeout(700);
      check('operator: Alt+R repeats the customer\'s last trade', (await page.$$('.dk-line')).length === 1 && /۱۲٫۴۵۰/.test(await text(page, '#lines')));
      await page.click('[data-act=fresh]');
      await page.waitForTimeout(300);
      // a macro: sell coins, made from the current setup, run by its number in the one-line box
      await page.keyboard.press('Alt+Digit2');
      await page.keyboard.press('Alt+Digit6');
      await page.waitForTimeout(300);
      await page.click('[data-act=macro-new]');
      await page.fill('#dkMacroName', 'فروش سکه');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(300);
      check('operator: a macro chip is made from the current setup', /فروش سکه/.test(await text(page, '#dkQuick')));
      await page.keyboard.press('Alt+Digit1');
      await page.keyboard.press('Alt+Digit5');
      await page.keyboard.press('F3');
      await page.keyboard.type('1');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(400);
      check('operator: «1» + Enter runs the macro (sell, coins)', (await page.$eval('[data-mode=sell]', (b) => b.getAttribute('aria-checked'))) === 'true' && (await page.$eval('[data-kind=coin]', (b) => b.getAttribute('aria-selected'))) === 'true');
      await page.click('[data-macro-del="0"]');
      const fr = await page.$('[data-act=fresh]'); // only shown when there is something to clear
      if (fr) await fr.click();
      // an amendment: the saved document is corrected by a new one; the original keeps its number and figures
      await page.click('[data-act=amend-last]');
      await page.waitForSelector('.dk-amend', { timeout: 8000 });
      await page.click('[data-del="0"]');
      await page.click('[data-mode=buy]');
      await page.click('[data-kind=melt]');
      await page.fill('[data-f=weight]', '10');
      await page.fill('[data-f=fineness]', '750');
      await page.click('[data-act=add]');
      await page.click('[data-fill="0"]');
      await page.fill('#dkAmendReason', 'وزن اشتباه خوانده شد');
      await page.keyboard.press('Control+Enter');
      await page.waitForSelector('.dk-receipt', { timeout: 15000 });
      const rp = await text(page, '#dkReceipt');
      const docs = (await auth('/api/books/docs?limit=20')).items;
      const orig = docs.find((d) => d.track === track1);
      check('operator: the correction is an amendment; the original is superseded, not changed', /اصلاحیه ثبت شد/.test(rp) && orig?.status === 'void', `${rp.slice(0, 60)} ${orig?.status}`);
      await page.keyboard.press('Escape');
      // the network goes away: the document waits on this device and is booked once when it comes back
      const n0 = (await auth('/api/books/docs?limit=200')).items.length;
      offline = true; // the failed requests while the network is away are the point of this check
      await ctx.setOffline(true);
      await page.keyboard.press('F3');
      await page.keyboard.type('خرید ۲ گرم عیار ۷۴۰ نقد');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(600);
      await page.keyboard.press('Control+Enter');
      await page.waitForSelector('.dk-queued', { timeout: 10000 });
      check('operator: offline, the document waits in the queue with a provisional slip', /در صف ارسال/.test(await text(page, '#dkReceipt')) && /صف ارسال/.test(await text(page, '#netPill')));
      await ctx.setOffline(false);
      await page.waitForSelector('.dk-receipt', { timeout: 20000 });
      await page.waitForTimeout(800);
      offline = false;
      const n1 = (await auth('/api/books/docs?limit=200')).items.length;
      check('operator: back online, it is booked exactly once and the slip becomes the receipt', n1 === n0 + 1 && /^M\d{4}-\d{5}$/.test((await text(page, '.dk-r-track b')).trim()), `${n0} → ${n1}`);
      await page.keyboard.press('Escape');
      await page.keyboard.press('F1');
      check('operator: the shortcut sheet opens in place (no window)', !(await page.$('#dkHelp[hidden]')) && /Ctrl\+Z/.test(await text(page, '#dkHelp')));
      await page.keyboard.press('Escape');
    });

  if (!live)
    await step('market language (spec 0020): «بیست خط زیر مظنه ۱۰۹ میلیون» becomes the exact مظنه, the line and the document', async () => {
      const auth = (path, opt = {}) => page.evaluate(async ([p, o]) => (await fetch(p, { ...o, headers: { 'content-type': 'application/json', Authorization: `Bearer ${localStorage.getItem('beatris.token')}` } })).json(), [path, opt]);
      await auth('/api/books/parties', { method: 'POST', body: JSON.stringify({ name: 'مهران خطی' }) });
      await freshDesk(page);
      await page.keyboard.press('F3');
      // a خط without up or down is asked, not guessed
      await page.keyboard.type('خرید ۱۰ گرم ۷۵۰ ۲۰ خط مظنه ۱۰۹ میلیون');
      await page.waitForTimeout(300);
      check('market language: «۲۰ خط» with no up or down is a question', /زیر.*بالای|بالای.*زیر/.test(await text(page, '.dk-cmd-price')), await text(page, '.dk-cmd-price'));
      await page.fill('#dkLine', '');
      const said = 'خرید از مهران خطی ۱۲٫۴۵ گرم آبشده ۷۵۰ بیست خط زیر مظنه بازار ۱۰۹ میلیون نقد ثبت کن';
      await page.keyboard.type(said);
      await page.waitForTimeout(400);
      const pv = await text(page, '#dkLineOut');
      check('market language: the agreed مظنه is spelled out before anything is applied', /(۱۰۸٬۸۰۰٬۰۰۰ تومان|۱٬۰۸۸٬۰۰۰٬۰۰۰ ریال)/.test(pv) && /۲۰ خط/.test(pv) && !(await page.$('.dk-part.unknown')), pv);
      const t0 = Date.now();
      await page.keyboard.press('Enter');
      await page.waitForSelector('.dk-receipt', { timeout: 15000 });
      check('market language: «ثبت کن» books the whole sentence at once', /^M\d{4}-\d{5}$/.test((await text(page, '.dk-r-track b')).trim()), `${Date.now() - t0} ms`);
      const list = await auth(`/api/books/docs?q=${encodeURIComponent('مهران خطی')}&limit=1`);
      const doc = await auth(`/api/books/docs/${list.items[0].id}`);
      const js = JSON.stringify(doc);
      check('market language: the document carries مظنه 1,088,000,000 rial (109,000,000 − 20 × 10,000 toman)', js.includes('"mazaneh":1088000000') || js.includes('"mazaneh":"1088000000"'), js.match(/"mazaneh":"?\d+"?/)?.[0] ?? 'no mazaneh');
      // «ثبت کن» with no payment books nothing and says what is missing
      await page.keyboard.press('Escape');
      await freshDesk(page);
      await page.keyboard.press('F3');
      await page.keyboard.type('فروش به مهران خطی ۵ گرم ۷۵۰ پنج خط بالای مظنه ۱۰۹ میلیون ثبت کن');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(1200);
      check('market language: an incomplete «ثبت کن» books nothing and names what is missing', !(await page.$('.dk-receipt')) && /روش پرداخت/.test(await text(page, '#toasts')), await text(page, '#toasts'));
      await freshDesk(page);
    });

  if (!live)
    await step('corrections and day search (specs 0023, 0024): a figure found on any day, what an amendment changed, a safe restore, a repeatable simulation', async () => {
      const auth = (path, opt = {}) => page.evaluate(async ([p, o]) => (await fetch(p, { ...o, headers: { 'content-type': 'application/json', Authorization: `Bearer ${localStorage.getItem('beatris.token')}` } })).json(), [path, opt]);
      const todayIso = await page.evaluate(() => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran' }).format(new Date()));
      const back = new Date(Date.parse(`${todayIso}T00:00:00Z`) - 45 * 86400000).toISOString().slice(0, 10);
      const party = await auth('/api/books/parties', { method: 'POST', body: JSON.stringify({ name: 'یوسف یادآوری' }) });
      const bank = (await auth('/api/books/accounts')).items.find((a) => a.kind === 'bank');
      const orig = await auth('/api/books/docs', { method: 'POST', body: JSON.stringify({ type: 'trade', date: back, partyId: party.id, payments: [{ method: 'c2c', dir: 'out', amount: 6000000000, account: bank.id }] }) });
      // a remembered figure, typed in روزنگار, found 45 days back with the band in plain sight
      await page.goto(`${base}/books/day`);
      await page.waitForSelector('#dyq', { timeout: 15000 }).catch(async (e) => {
        throw new Error(`no search box at ${page.url()}: ${(await text(page, 'main')).slice(0, 200).replace(/\n/g, ' ')}`);
      });
      await page.fill('#dyq', '۶۰۰ میلیون تومان');
      await page.waitForFunction(() => /یوسف یادآوری/.test(document.querySelector('#dyfind')?.textContent ?? ''), null, { timeout: 8000 });
      const f1 = await text(page, '#dyfind');
      check('day search: «۶۰۰ میلیون تومان» finds the payment on its own day, months back', /دقیقاً ۶٬۰۰۰٬۰۰۰٬۰۰۰ ریال/.test(f1) && /پرداخت کارت به کارت/.test(f1) && /دقیقاً همین عدد/.test(f1), f1.slice(0, 160));
      await page.click('#dyfind [data-tol="5"]');
      await page.waitForFunction(() => /۵٬۷۰۰٬۰۰۰٬۰۰۰ ریال تا ۶٬۳۰۰٬۰۰۰٬۰۰۰ ریال/.test(document.querySelector('#dyfind')?.textContent ?? ''), null, { timeout: 8000 });
      check('day search: ±۵٪ shows its band and keeps the same payment first', /یوسف یادآوری/.test(await text(page, '#dyfind .dy-fr')));
      // a wrong amendment says exactly what it changed
      const amended = await auth(`/api/books/docs/${orig.id}`, { method: 'PUT', body: JSON.stringify({ ...orig, payments: [{ method: 'c2c', dir: 'out', amount: 5400000000, account: bank.id }], reason: 'رقم اشتباه' }) });
      await page.goto(`${base}/books/doc/${amended.id}`);
      await page.waitForSelector('.bk-amend');
      check('corrections: the amendment lists the change with before and after', /مبلغ — قبل: ۶٬۰۰۰٬۰۰۰٬۰۰۰ ریال؛ بعد: ۵٬۴۰۰٬۰۰۰٬۰۰۰ ریال/.test(await text(page, '.bk-amend')), await text(page, '.bk-amend'));
      // and the original comes back in one step, with the same figures
      await page.goto(`${base}/books/doc/${orig.id}`);
      await page.click('[data-act=restore]');
      await page.fill('.modal [name=reason]', 'اصلاحیه اشتباه بود');
      await page.click('.modal [data-ok]');
      await page.waitForFunction((id) => location.pathname.startsWith('/books/doc/') && !location.pathname.endsWith(id), orig.id, { timeout: 10000 });
      await page.waitForSelector('.bk-amend');
      const restored = await page.evaluate(() => location.pathname.split('/').pop());
      const rdoc = await auth(`/api/books/docs/${restored}`);
      check('corrections: the restore is an amendment with the original figures', rdoc.restores === orig.id && rdoc.calc.paidOut === 6000000000 && /برگرداندهٔ/.test(await text(page, 'main')), `${rdoc.restores} ${rdoc.calc?.paidOut}`);
      // a simulation names its basis and repeats exactly
      await page.goto(`${base}/books/control?t=simulate`);
      await page.waitForSelector('#simF');
      await page.fill('#simF [name=mazaneh]', '400000000');
      await page.click('#simF [data-act=run]');
      await page.waitForSelector('.ctl-basis [data-repeat]', { timeout: 10000 });
      const fp = /اثر انگشت ([0-9A-F]{12})/.exec(await text(page, '.ctl-basis'))?.[1];
      await page.click('.ctl-basis [data-repeat]');
      await page.waitForFunction(() => /همان مبنا، همان نتیجه/.test(document.querySelector('.ctl-basis')?.textContent ?? ''), null, { timeout: 10000 });
      check('simulation: the same basis gives the same answer and fingerprint', !!fp && (await text(page, '.ctl-basis')).includes(fp));
      // Ctrl+K: a figure goes to the day search
      await page.keyboard.press('Control+k');
      await page.waitForSelector('#palQ');
      await page.keyboard.type('۵۴۰ میلیون تومان');
      await page.waitForTimeout(300);
      check('palette: a figure offers «در روزنگار همه روزها»', /در روزنگار همه روزها/.test(await text(page, '#palL')));
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => /یوسف یادآوری/.test(document.querySelector('#dyfind')?.textContent ?? ''), null, { timeout: 8000 });
      check('palette → روزنگار: the amendment of 540 million is found, the replaced one marked', /جایگزین‌شده با اصلاحیه/.test(await text(page, '#dyfind')) || /۵٬۴۰۰٬۰۰۰٬۰۰۰/.test(await text(page, '#dyfind')));
    });

  if (!live)
    await step('every shop event in one chain (specs 0026, 0027): روزنگار by section with search and tracking, sorting, the guide, melting, write-off, the whole count, income, the net result', async () => {
      const auth = (path, opt = {}) => page.evaluate(async ([p, o]) => (await fetch(p, { ...o, headers: { 'content-type': 'application/json', Authorization: `Bearer ${localStorage.getItem('beatris.token')}` } })).json(), [path, opt]);
      const post = (body) => auth('/api/books/docs', { method: 'POST', body: JSON.stringify(body) });
      const party = await auth('/api/books/parties', { method: 'POST', body: JSON.stringify({ name: 'سامان بخش‌ها' }) });
      const cashId = (await auth('/api/books/accounts')).items.find((a) => a.kind === 'cash').id;
      // money in the box first, so every count below is of a real, positive box: whatever earlier steps paid out, an
      // income (typed in toman) brings it to at least 2,000,000,000 rial
      const box0 = (await auth('/api/books/vault')).cash?.[cashId] ?? 0;
      await post({ type: 'income', category: 'سایر', payments: [{ method: 'cash', dir: 'in', amount: Math.max(100000000, Math.ceil((2000000000 - box0) / 10)), account: cashId }], note: 'موجودی صندوق آزمون' });
      // a melted-gold line and a coin line worth the same 777,770,000 rial
      const meltDoc = await post({ type: 'trade', partyId: party.id, lines: [{ kind: 'melt', dir: 'in', weight: 3.333, fineness: 750, basis: 'amount', amount: 777770000 }], payments: [{ method: 'cash', dir: 'out', amount: 777770000, account: cashId }] });
      const coinDoc = await post({ type: 'trade', partyId: party.id, lines: [{ kind: 'coin', dir: 'out', coin: 'emami', count: 1, price: 777770000 }] });
      check('setup: two documents of one amount, one in each section', !!meltDoc.track && !!coinDoc.track, `${JSON.stringify(meltDoc).slice(0, 120)} ${JSON.stringify(coinDoc).slice(0, 120)}`);
      // روزنگار, آبشده only
      await go(page, '/books/day?sec=melt', 1500);
      const rows = await text(page, '#dyl');
      check('روزنگار آبشده: the melted-gold document is listed, the coin one is not', rows.includes(meltDoc.track) && !rows.includes(coinDoc.track), rows.slice(0, 160).replace(/\s+/g, ' '));
      check('روزنگار: the section chip is pressed and the URL keeps the section', (await page.$eval('#dysec [data-sec=melt]', (b) => b.getAttribute('aria-pressed'))) === 'true' && page.url().includes('sec=melt'));
      await page.fill('#dyq', '۷۷۷٬۷۷۰٬۰۰۰ ریال');
      await page.waitForFunction((t) => (document.querySelector('#dyfind')?.textContent ?? '').includes(t), meltDoc.track, { timeout: 8000 });
      const fm = await text(page, '#dyfind');
      check('number search inside آبشده: finds the melted-gold line, not the coin line of the same amount', fm.includes(meltDoc.track) && !fm.includes(coinDoc.track) && /فقط بخش آبشده/.test(fm), fm.slice(0, 200).replace(/\s+/g, ' '));
      await page.click('#dysec [data-sec=coin]');
      await page.waitForFunction((t) => (document.querySelector('#dyfind')?.textContent ?? '').includes(t), coinDoc.track, { timeout: 8000 });
      check('number search inside سکه: the same figure now finds the coin line only', !(await text(page, '#dyfind')).includes(meltDoc.track));
      await page.click('#dysec [data-sec=melt]');
      await page.fill('#dyq', '');
      const href = await page.$eval('#dyl a.dy-track', (a) => a.getAttribute('href'));
      check('روزنگار: a row\'s tracking link keeps the section', href.includes('sec=melt'), href);
      await page.click('#dyl a.dy-track');
      await page.waitForSelector('.tc-doc');
      check('رهگیری: the document opens, inside the same section', (await page.$eval('#tsec [data-sec=melt]', (b) => b.getAttribute('aria-pressed'))) === 'true' && page.url().includes('sec=melt'));
      // روزنگار in amount order: the first row is the biggest document of the day, by the same rule
      const day = await auth(`/api/books/daybook?day=${meltDoc.date}`);
      const amountOf = (e) => Math.max(Math.abs(e.net ?? 0), e.lines.reduce((s, l) => s + (l.value || l.total || 0), 0), e.payments.reduce((s, p) => s + p.value, 0), Math.abs(e.convert?.value ?? 0), e.writeoff?.unit === 'IRR' ? Math.abs(e.writeoff.amount) : 0);
      const biggest = day.entries.reduce((b, e) => (amountOf(e) > amountOf(b) ? e : b), day.entries[0]);
      await go(page, '/books/day', 1200);
      await page.selectOption('#dysort', 'amount-desc');
      await page.waitForTimeout(200);
      check('روزنگار: «مبلغ (بیشترین)» puts the biggest document first and keeps the order in the URL', (await page.$eval('#dyl .dy-e a.dy-track', (a) => a.textContent.trim())) === biggest.track && page.url().includes('sort=amount-desc'), `${biggest.track}`);
      await page.selectOption('#dysort', 'time');
      // tables sort by their headers: value order both ways, aria-sort says which
      const sortCol = async (sel, col) => {
        await page.click(`${sel} thead tr:last-child th:nth-child(${col}) .th-sort`);
        const a = await page.$$eval(`${sel} tbody tr:not([data-fixed])`, (rs, c) => rs.map((r) => r.cells[c - 1]?.dataset.v), col);
        const s1 = await page.$eval(`${sel} thead tr:last-child th:nth-child(${col})`, (th) => th.getAttribute('aria-sort'));
        await page.click(`${sel} thead tr:last-child th:nth-child(${col}) .th-sort`);
        const d = await page.$$eval(`${sel} tbody tr:not([data-fixed])`, (rs, c) => rs.map((r) => r.cells[c - 1]?.dataset.v), col);
        const s2 = await page.$eval(`${sel} thead tr:last-child th:nth-child(${col})`, (th) => th.getAttribute('aria-sort'));
        await page.click(`${sel} thead tr:last-child th:nth-child(${col}) .th-sort`); // back to the natural order
        const n = (xs) => xs.filter((x) => x !== '' && x != null).map(Number);
        const up = n(a), down = n(d);
        return { ok: s1 === 'ascending' && s2 === 'descending' && up.every((v, i) => !i || up[i - 1] <= v) && down.every((v, i) => !i || down[i - 1] >= v), up, down };
      };
      await go(page, '/books/vault', 1500);
      const vs = await sortCol('table[data-sort="vault-cash"]', 2);
      check('گاوصندوق: cash and bank sort by balance, up and down', vs.ok, JSON.stringify(vs));
      await page.keyboard.press('Escape');
      // a second customer with another balance, so the column has something to order whatever ran before this step
      const party2 = await auth('/api/books/parties', { method: 'POST', body: JSON.stringify({ name: 'رامین بخش‌ها' }) });
      await post({ type: 'trade', partyId: party2.id, lines: [], payments: [{ method: 'cash', dir: 'in', amount: 300000000, account: cashId }] });
      await go(page, '/books/parties', 1500);
      const ps = await sortCol('#tbl', 7);
      check('مشتریان: «مانده» sorts by the whole balance at today\'s prices', ps.ok && ps.up.length >= 2, JSON.stringify(ps).slice(0, 200));
      await go(page, '/books/stock', 1500);
      if (await page.$('#tbl tbody tr')) {
        const ss = await sortCol('#tbl', 4);
        check('انبار و ویترین: pieces sort by weight', ss.ok, JSON.stringify(ss));
      }
      // the guide: every event, a search, and its button opens the right screen
      await go(page, '/books/events', 1200);
      check('guide: every catalogued event is listed', (await page.$$('.ev-e')).length === 90, String((await page.$$('.ev-e')).length));
      // the one-chain figure (spec 0028): drawn, moving, a section lights its links, tampering breaks the chain where it says
      await page.waitForSelector('#evFig svg.iso-svg', { timeout: 15000 });
      const drawn = await page.$eval('#evFig svg.iso-svg', (s) => s.querySelectorAll('path').length);
      check('figure: the one-chain machine is drawn (300+ paths)', drawn >= 300, String(drawn));
      const r1 = await text(page, '#evFig [data-readout]');
      await page.waitForTimeout(4200);
      const r2 = await text(page, '#evFig [data-readout]');
      check('figure: the readout follows the tour', r1 !== r2 && /سند/.test(r2), `${r1} → ${r2}`);
      await page.hover('#evFig .oc-key[data-sec="melt"]');
      await page.waitForTimeout(150);
      const lit = await page.$$eval('#evFig .oc-link .oc-plate[data-lit]', (xs) => xs.length);
      check('figure: آبشده lights its four links and names itself', lit === 4 && /آبشده: ۴ سند/.test(await text(page, '#evFig [data-readout]')), `${lit} · ${await text(page, '#evFig [data-readout]')}`);
      await page.mouse.move(5, 5);
      await page.click('#evFig [data-act="tamper"]');
      await page.waitForFunction(() => document.querySelectorAll('#evFig .oc-link[data-broken]').length > 0, null, { timeout: 5000 });
      const broken = await page.$$eval('#evFig .oc-link[data-broken]', (xs) => xs.map((x) => x.dataset.link));
      check('figure: tampering with link 4 breaks the chain from link 4, and says so', broken[0] === '4' && broken.length === 5 && /حلقه ۴ شکسته/.test(await text(page, '#evFig [data-readout]')), `${broken} · ${await text(page, '#evFig [data-readout]')}`);
      await page.click('#evFig [data-act="mend"]');
      await page.waitForFunction(() => !document.querySelector('#evFig .oc-link[data-broken]'), null, { timeout: 5000 });
      check('figure: «درست کن» makes the chain whole', !(await page.$('#evFig .oc-link[data-broken]')));
      await page.fill('#evq', 'ذوب');
      const melts = (await page.$$('.ev-e')).length;
      check('guide: «ذوب» narrows to the melting events', melts >= 3 && melts < 20, String(melts));
      await page.click('#ev-vault-melt-scrap a[data-link]');
      await page.waitForSelector('.modal #mo-ins', { timeout: 10000 });
      check('guide → vault: «ثبت این اتفاق» opens the melting dialog', page.url().includes('/books/vault'));
      // a melting from the vault: wastage as it is typed, then one ذوب document
      await page.fill('.modal .mo-row[data-side=ins] [data-k=weight]', '20');
      await page.fill('.modal .mo-row[data-side=ins] [data-k=fineness]', '740');
      await page.fill('.modal .mo-row[data-side=outs] [data-k=weight]', '19.5');
      await page.waitForTimeout(150);
      const ms = await text(page, '.modal #mo-sum');
      check('melt: the wastage is computed as it is typed (19.733 → 19.500)', ms.includes('۱۹٫۷۳۳') && ms.includes('۱۹٫۵۰۰') && /افت/.test(ms), ms);
      await page.fill('.modal [name=note]', 'ذوب آزمون مرورگر');
      await page.click('.modal [data-save]');
      await page.waitForSelector('.modal #mo-ins', { state: 'detached', timeout: 10000 });
      const tx = (await auth('/api/books/docs?type=transform&limit=5')).items[0];
      check('melt: saved as one ذوب document', tx?.type === 'transform', JSON.stringify(tx).slice(0, 120));
      await go(page, `/books/doc/${tx.id}`, 1500);
      if (await page.$('[data-fmt=std]')) await page.click('[data-fmt=std]');
      const paper = await text(page, '.bk-paper');
      check('melt: the paper shows its rows, 750-equivalents and the wastage, with no buyer', paper.includes('اقلام ذوب و تبدیل') && paper.includes('۱۹٫۷۳۳') && /افت ذوب/.test(paper) && !/قابل پرداخت خریدار/.test(paper), paper.slice(0, 200).replace(/\s+/g, ' '));
      // a write-off from the customer's page
      await go(page, `/books/party/${party.id}`, 1500);
      await page.click('[data-act=writeoff]');
      await page.waitForSelector('.modal [name=unit]');
      await page.selectOption('.modal [name=unit]', 'IRR');
      await page.fill('.modal [name=amount]', '770000');
      await page.fill('.modal [name=note]', 'تخفیف تسویه آزمون');
      await page.click('.modal [data-save]');
      await page.waitForSelector('.modal [name=unit]', { state: 'detached', timeout: 10000 });
      const pb = (await auth(`/api/books/parties/${party.id}`)).balance;
      check('write-off: the customer\'s rial debt is lower by exactly the amount', pb.IRR === 777770000 - 770000, JSON.stringify(pb));
      // the whole count, with a cash box short by 100,000 rial
      await go(page, '/books/vault', 1500);
      const cashBook = await page.evaluate(async (id) => (await (await fetch('/api/books/vault', { headers: { Authorization: `Bearer ${localStorage.getItem('beatris.token')}` } })).json()).cash[id], cashId);
      await page.click('[data-act=count]');
      await page.waitForSelector(`.modal tr[data-k="cash:${cashId}"] input`);
      await page.fill(`.modal tr[data-k="cash:${cashId}"] input`, String(cashBook - 100000));
      await page.waitForTimeout(100);
      check('count: the cash box shows its shortage', cashBook > 100000 && /کسری/.test(await text(page, `.modal tr[data-k="cash:${cashId}"] .vt-diff`)), String(cashBook));
      await page.click('.modal [data-adj]');
      await page.waitForSelector('.modal [data-adj]', { state: 'detached', timeout: 10000 });
      const cashNow = await page.evaluate(async (id) => (await (await fetch('/api/books/vault', { headers: { Authorization: `Bearer ${localStorage.getItem('beatris.token')}` } })).json()).cash[id], cashId);
      check('count: the adjustment brings the box to what was counted', cashNow === cashBook - 100000, `${cashBook} → ${cashNow}`);
      // income from صندوق، بانک، چک
      await go(page, '/books/cash', 1200);
      await page.click('a[href="/books/new/income"]');
      await page.waitForSelector('[name=category]');
      await page.selectOption('[name=category]', 'کارمزد عیارسنجی و ری‌گیری');
      await page.click('[data-add-pay=cash]');
      await page.fill('[data-p="0"][data-k=amount]', '5000000');
      await page.click('[data-act=save]');
      await page.waitForURL(/\/books\/doc\//, { timeout: 15000 });
      await page.waitForSelector('.bk-paper');
      check('income: saved as «سند درآمد» with its category', /سند درآمد/.test(await text(page, 'main')) && /کارمزد عیارسنجی/.test(await text(page, '.bk-paper')), (await text(page, '.bk-paper')).slice(0, 160).replace(/\s+/g, ' '));
      // the period's net result: trading + income − expenses − write-offs
      await go(page, '/books/reports?tab=pnl', 2000);
      const pr = await text(page, '.pl-result');
      check('P&L: the net result lists income by category, the write-off and the net', /درآمد · کارمزد عیارسنجی و ری‌گیری/.test(pr) && /سوخت بدهی ریالی/.test(pr) && /نتیجه خالص/.test(pr) && !!(await page.$('#pl-net')) && noBadNumbers(pr), pr.slice(0, 200).replace(/\s+/g, ' '));
      // the vault at a laptop's width, with bars, currencies and coins in it: nothing slides sideways (found by the
      // hundred rounds, spec 0029: the cash and bank table was wider than its column at 1280–1366 px)
      const vp = page.viewportSize();
      await page.setViewportSize({ width: 1280, height: 800 });
      await go(page, '/books/vault', 1500);
      check('vault at 1280 px: no sideways scroll', (await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 1);
      await page.setViewportSize(vp);
      // the documents page offers every kind; the palette finds an event by its story
      await go(page, '/books/docs', 1200);
      check('documents: «ثبت تازه» offers melting, the count and the guide', !!(await page.$('.bk-newdocs a[href="/books/vault?act=melt"]')) && !!(await page.$('.bk-newdocs a[href="/books/events"]')));
      await page.keyboard.press('Control+k');
      await page.waitForSelector('#palQ');
      await page.keyboard.type('چک برگشت');
      await page.waitForTimeout(300);
      check('palette: «چک برگشت» finds the event and where to record it', /چک برگشت خورد/.test(await text(page, '#palL')), (await text(page, '#palL')).slice(0, 160));
      await page.keyboard.press('Escape');
    });

  if (!live)
    await step('سرنخ‌یاب (spec 0032): a name fragment and an amount tail find the trade; Ctrl+K and روزنگار reach the same engine', async () => {
      const auth = (path, opt = {}) => page.evaluate(async ([p, o]) => (await fetch(p, { ...o, headers: { 'content-type': 'application/json', Authorization: `Bearer ${localStorage.getItem('beatris.token')}` } })).json(), [path, opt]);
      const party = await auth('/api/books/parties', { method: 'POST', body: JSON.stringify({ name: 'کامران سرنخی', mobile: '09127654321', city: 'یزد' }) });
      const bankId = (await auth('/api/books/accounts')).items.find((a) => a.kind === 'bank').id;
      const doc = await auth('/api/books/docs', { method: 'POST', body: JSON.stringify({ type: 'trade', partyId: party.id, lines: [{ kind: 'coin', dir: 'out', coin: 'emami', count: 1, price: 987650000 }], payments: [{ method: 'c2c', dir: 'in', amount: 987650000, account: bankId, card: '6543', ref: '5550123' }] }) });
      check('clue finder: the trade to find is saved', !!doc.track, JSON.stringify(doc).slice(0, 160));
      await go(page, `/books/find?q=${encodeURIComponent('کامر آخرش ۶۵۰')}`, 600);
      await page.waitForSelector('.cf-doc', { timeout: 15000 });
      const clues = await text(page, '.cf-clues');
      check('clue finder: it shows how each clue was read', /کامر/.test(clues) && /ختم به/.test(clues), clues.slice(0, 160));
      check('clue finder: a name fragment and the amount’s tail find the trade first', (await page.$eval('.cf-doc', (a) => a.dataset.doc)) === doc.id && /همه سرنخ‌ها/.test(await text(page, '.cf-docs .bk-h')));
      check('clue finder: the customer is listed with why', /کامران سرنخی/.test(await text(page, '.cf-people')) && /ابتدای کلمه/.test(await text(page, '.cf-people')));
      // a detail remembered wrong: the closest document is still listed, with the clue it misses
      await page.fill('#cfQ', 'پریروز کامران چک');
      await page.waitForSelector('.cf-near .cf-doc', { timeout: 8000 });
      check('clue finder: «نزدیک‌ترین‌ها» names the missed clues', /بدون:/.test(await text(page, '.cf-near')));
      // Ctrl+K from anywhere: people and documents from the same engine, and the way to the whole list
      await go(page, '/books/desk', 800);
      await page.keyboard.press('Control+k');
      await page.waitForSelector('#palQ');
      await page.keyboard.type('۴۳۲۱ ۷۶۵');
      await page.waitForTimeout(900);
      await page.fill('#palQ', '۶۵۴۳۲۱');
      await page.waitForFunction(() => /سرنخ‌یاب/.test(document.querySelector('#palL')?.textContent ?? ''), null, { timeout: 8000 });
      const pal = await text(page, '#palL');
      check('palette: a mobile’s last digits find the customer, and offer سرنخ‌یاب', /کامران سرنخی/.test(pal) && /همه نتیجه‌ها در سرنخ‌یاب/.test(pal), pal.slice(0, 200));
      await page.keyboard.press('Escape');
      // روزنگار and رهگیری hand a word they cannot place to سرنخ‌یاب
      await go(page, '/books/day', 900);
      await page.fill('#dyq', 'کامران');
      await page.waitForSelector('#dyall:not([hidden]) a[href^="/books/find"]', { timeout: 5000 });
      check('روزنگار: a word offers the whole book in سرنخ‌یاب', true);
      await go(page, `/books/trace?q=${encodeURIComponent('کامران سرنخی')}`, 1200);
      check('رهگیری: a name that is no code points to سرنخ‌یاب', !!(await page.$('#tr a[href^="/books/find"]')));
    });

  if (!live)
    await step('accounting trainer (spec 0015): a case, the right entry, graded by the kernel; manager view', async () => {
      await go(page, '/train/accounting', 1500);
      check('trainer: the page opens with the tutor\'s suggestion', /یک رویداد، یک سند/.test(await text(page, '.at-head')));
      await page.selectOption('#atTpl', 'buy_melt');
      await page.waitForSelector('.at-case');
      const sc = await page.evaluate(async () => (await (await fetch('/api/train/acct', { headers: { authorization: `Bearer ${localStorage.getItem('beatris.token')}` } })).json()).progress.open[0]);
      const lines = await page.evaluate(async (s) => (await import('/js/acct/scenarios.mjs')).buildScenario(s.id, { date: s.date }).hiddenExpectedResult.entries[0].lines, sc);
      for (let j = 0; j < lines.length; j++) {
        if (j >= 2) await page.click('[data-addline="0"]');
        const l = lines[j];
        await page.selectOption(`[data-e="0"][data-l="${j}"][data-f=account]`, l.account);
        if (l.dr) await page.fill(`[data-e="0"][data-l="${j}"][data-f=dr]`, String(l.dr));
        if (l.cr) await page.fill(`[data-e="0"][data-l="${j}"][data-f=cr]`, String(l.cr));
        if (l.grams) {
          await page.fill(`[data-e="0"][data-l="${j}"][data-f=grams]`, String(l.grams));
          await page.fill(`[data-e="0"][data-l="${j}"][data-f=fineness]`, String(l.fineness));
        }
      }
      check('trainer: the entry balances as it is typed', /متوازن/.test(await text(page, '.at-entry tfoot')));
      await page.click('[data-act=check]');
      await page.waitForSelector('.at-result');
      check('trainer: the kernel grades the right entry 100% and explains it', /۱۰۰٪/.test(await text(page, '.at-score')) && /اثر روی دفتر/.test(await text(page, '.at-result')));
      check('trainer: no horizontal overflow', (await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 1);
      await go(page, '/train/team', 1500);
      check('trainer: the manager sees the quiet columns and other competencies', (await page.$$eval('.at-team th', (t) => t.length)) === 9);
    });

  if (!live)
    await step('studio coach (spec 0016): brief → measured design, sentence edit, exercise with hint and check', async () => {
      await go(page, '/studio/coach', 1500);
      check('studio coach: the page opens', /از بریف تا مدلی/.test(await text(page, '.at-head')));
      await page.fill('#scBrief', 'انگشتر ۱۸ عیار مینیمال، سنگ بیضی ۸×۶، زیر ۴ گرم، مناسب ریخته‌گری');
      await page.click('[data-act=design]');
      await page.waitForSelector('.sc-result', { timeout: 30000 });
      check('studio coach: a measured weight and a calm summary', /گرم/.test(await text(page, '.sc-weight')) && /وزن تخمینی/.test(await text(page, '.sc-summary')));
      check('studio coach: making issues apart from aesthetic notes', /پیش از ساخت/.test(await text(page, '.sc-result')));
      await page.fill('#scEdit', 'ضخامت کف ۱٫۴');
      await page.click('[data-act=edit]');
      await page.waitForFunction(() => /نسخه ۲/.test(document.querySelector('.sc-result .at-kicker')?.textContent ?? ''), null, { timeout: 30000 });
      check('studio coach: a sentence makes version 2', true);
      await page.click('[data-tab=practice]');
      await page.selectOption('#scEx', 'thin-fix');
      await page.click('[data-act=exNext]');
      await page.waitForSelector('.sc-grid');
      await page.click('[data-act=check]');
      await page.waitForSelector('.sc-assess', { timeout: 30000 });
      check('studio coach: the thin model is not yet accepted', /هنوز نه/.test(await text(page, '.sc-assess')));
      await page.click('[data-act=hint]');
      await page.waitForSelector('.sc-hint');
      check('studio coach: a level-1 hint without numbers', !/[0-9۰-۹]/.test(await text(page, '.sc-hint')));
      check('studio coach: no horizontal overflow', (await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 1);
    });

  await step('skins (spec 0014): live preview, Esc returns, click keeps, survives reload, clean skin, automatic mode, dashboard switch', async () => {
    await go(page, '/', 1200);
    const skin = () => page.evaluate(() => document.documentElement.dataset.skin);
    const before = await skin();
    await page.click('#themeBtn');
    await page.waitForSelector('.sk-pop');
    check('skins: every skin has a card with a miniature', (await page.$$eval('.sk-pop [data-pick]', (b) => b.length)) >= 15);
    await page.hover('[data-pick=lapis]');
    check('skins: hovering previews the whole app', (await skin()) === 'lapis');
    await page.keyboard.press('Escape');
    check('skins: Esc returns to the current skin and closes', (await skin()) === before && !(await page.$('.sk-pop')));
    await page.click('#themeBtn');
    await page.click('[data-pick=clean]');
    await page.waitForTimeout(900);
    check('skins: a click keeps the clean skin', (await skin()) === 'clean');
    await page.reload();
    await page.waitForTimeout(1200);
    check('skins: the choice survives a reload', (await skin()) === 'clean');
    check('skins: the clean skin is a white panel on a grey frame', await page.evaluate(() => getComputedStyle(document.body).backgroundColor === 'rgb(237, 237, 237)'));
    check('skins: no horizontal overflow in the clean skin', (await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 1);
    await page.click('#themeBtn');
    await page.click('[data-mode=os]');
    await page.click('[data-pick=cleannight]');
    // the media-change event reaches the page on its next frame, which a headless browser may delay
    const skinIs = (x) => page.waitForFunction((v) => document.documentElement.dataset.skin === v, x, { timeout: 10000 }).then(() => true, () => false);
    await page.emulateMedia({ colorScheme: 'dark' });
    check('skins: with the device, a dark device gets the dark member of the pair', await skinIs('cleannight'));
    await page.emulateMedia({ colorScheme: 'light' });
    check('skins: and a light device the light member', await skinIs('clean'));
    await page.keyboard.press('Escape');
    await page.evaluate(() => { localStorage.setItem('beatris.theme', 'calm'); });
    await page.reload();
    await page.waitForTimeout(1000);
    check('skins: the old key still means a fixed skin', (await skin()) === 'calm');
  });

  if (!live) await step('desk products: template builder, search, pick, edit, delete', async () => {
    await go(page, '/books/desk', 1500);
    await page.click('[data-kind=coin]');
    await page.waitForSelector('[data-psearch]');
    check('desk products: the coin tab is «سکه و محصولات» with a search box', (await text(page, '[data-kind=coin]')).includes('محصولات'));
    await page.click('[data-prod=tpl]');
    await page.waitForSelector('#tp');
    await page.fill('#tp [name=brand]', 'زردیس');
    await page.selectOption('#tp [name=kind]', 'شمش');
    await page.waitForTimeout(150);
    check('desk products: the builder previews one product per weight', (await text(page, '#tpPrev')).includes('شمش زردیس ۲٫۵ گرم') && (await text(page, '#tpPrev')).includes('شمش زردیس ۵ گرم'));
    await page.click('#tp button:not([type])');
    await page.waitForSelector('#tp', { state: 'detached' });
    await page.fill('[data-psearch]', 'زردیس 2.5');
    await page.waitForTimeout(250);
    const hits = await page.$$eval('#dkPick [data-coin]', (b) => b.map((x) => x.innerText));
    check('desk products: «زردیس 2.5» finds exactly the 2.5 g Zardis bar', hits.length === 1 && hits[0].includes('۲٫۵'), JSON.stringify(hits));
    await page.press('[data-psearch]', 'Enter');
    await page.waitForTimeout(200);
    check('desk products: Enter picks the match', !!(await page.$('#dkPick [data-coin][aria-pressed="true"]')));
    await page.fill('[data-psearch]', 'نیستمحصول');
    await page.waitForTimeout(200);
    check('desk products: no match says so', (await text(page, '#dkPick')).includes('محصولی با'));
    // new product, then edit and delete it from the desk
    await page.click('[data-prod=new]');
    await page.fill('#pm [name=label]', 'پلاک زرنشان ۱ گرم');
    await page.fill('#pm [name=group]', 'زرنشان');
    await page.fill('#pm [name=weight]', '1');
    await page.fill('#pm [name=fineness]', '750');
    await page.click('#pm button:not([type])');
    await page.waitForSelector('#pm', { state: 'detached' });
    await page.fill('[data-psearch]', 'زرنشان');
    await page.waitForTimeout(200);
    check('desk products: a product made at the desk is selected and searchable', (await text(page, '#dkPick')).includes('پلاک زرنشان') && !!(await page.$('#dkPick [data-coin][aria-pressed="true"]')));
    await page.hover('#dkPick .dk-pc');
    await page.click('#dkPick .dk-pe');
    await page.fill('#pm [name=short]', 'پلاک ز ۱');
    await page.click('#pm button:not([type])');
    await page.waitForSelector('#pm', { state: 'detached' });
    check('desk products: edited name shows', (await text(page, '#dkPick')).includes('پلاک ز ۱'));
    await page.click('#dkPick .dk-pe');
    await holdApp(page, '#pm [data-pm=del]');
    await page.waitForTimeout(600);
    await page.keyboard.press('Escape');
    await page.fill('[data-psearch]', 'زرنشان');
    await page.waitForTimeout(200);
    check('desk products: deleted product is gone', !(await text(page, '#dkPick')).includes('پلاک ز ۱'));
  });

  if (!live) await step('pos: card reader charge before booking (mock bridge), decline, one tap, phone through the counter, invoice, reconciliation', async () => {
    const auth = (path) => page.evaluate(async (p) => (await fetch(p, { headers: { Authorization: `Bearer ${localStorage.getItem('beatris.token')}` } })).json(), path);
    // a stand-in for desktop/windows/pos-bridge.ps1 (the real bridge is tested against a simulated terminal in tests/pos.test.mjs)
    const { createServer } = await import('node:http');
    const jobs = new Map();
    const origin = new URL(base).origin;
    const mock = createServer((req, res) => {
      const send = (code, obj) => {
        res.writeHead(code, { 'content-type': 'application/json', 'access-control-allow-origin': origin, 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type', 'access-control-allow-private-network': 'true' });
        res.end(obj ? JSON.stringify(obj) : '');
      };
      if (req.method === 'OPTIONS') return send(204);
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        const b = body ? JSON.parse(body) : {};
        if (req.url === '/status') return send(200, { ok: true, app: 'beatris-pos', version: '1.0.0', busy: false });
        if (req.url === '/test') return send(200, { ok: true, terminal: '12345678', message: 'کارتخوان آماده است.' });
        if (req.url === '/charge') {
          if (!jobs.has(b.id)) jobs.set(b.id, { id: b.id, amount: b.amount, driver: b.driver, state: 'connecting', polls: 0 });
          return send(202, jobs.get(b.id));
        }
        const m = req.url.match(/^\/charge\/([\w-]+)/);
        const j = m && jobs.get(m[1]);
        if (!j) return send(404, { error: 'not found' });
        if (++j.polls === 1) j.state = 'waiting';
        else if (j.polls >= 3 && j.state === 'waiting') {
          if (j.amount === 999000) Object.assign(j, { state: 'declined', code: '51', message: 'موجودی کافی نیست' });
          else Object.assign(j, { state: 'approved', code: '00', rrn: '863583063456', stan: '801912', card: '1234', terminal: '12345678', message: 'تراکنش موفق' });
        }
        send(200, j);
      });
    });
    await new Promise((r) => mock.listen(0, '127.0.0.1', r));
    const bport = mock.address().port;
    try {
      await go(page, '/books/settings', 1500);
      await page.check('#posF [name=on]');
      await page.selectOption('#posF [name=driver]', 'sep');
      await page.fill('#posF [name=host]', '192.168.1.50');
      await page.fill('#posF [name=bridge]', String(bport));
      await page.click('#posF button:not([type])');
      await page.waitForTimeout(500);
      check('pos settings: saved for this computer and the bridge is found', (await text(page, '#posBridge')).includes('فعال'), await text(page, '#posBridge'));
      await page.click('[data-pos=test]');
      await page.waitForFunction(() => /آماده/.test(document.querySelector('#posOut')?.textContent ?? ''));
      check('pos settings: connection test reports the terminal', (await text(page, '#posOut')).includes('12345678'));
      await freshDesk(page);
      await page.click('[data-act=pnew]');
      await page.fill('#np [name=name]', 'سارا کارتخوانی');
      await page.fill('#np [name=mobile]', '09121119988');
      await page.click('#np button:not([type])');
      await page.waitForSelector('.dk-who');
      await page.click('[data-pm=pos]');
      await page.fill('[data-p="0"][data-k=amount]', '25000000');
      await page.click('.dk-save [data-act=save]');
      await page.waitForSelector('.pos-box');
      check('pos desk: the amount goes to the card reader before booking', (await text(page, '.pos-box')).includes('۲۵٬۰۰۰٬۰۰۰'));
      await page.waitForSelector('.dk-receipt', { timeout: 15000 });
      const rc = await text(page, '.dk-receipt');
      check('pos desk: approved → document booked with the terminal RRN', rc.includes('۸۶۳۵۸۳۰۶۳۴۵۶'), rc.replace(/\s+/g, ' ').slice(0, 160));
      await page.keyboard.press('Escape');
      // a declined card books nothing
      const before = (await auth('/api/books/docs?limit=5')).items?.length ?? 0;
      await page.click('[data-pm=pos]');
      await page.fill('[data-p="0"][data-k=amount]', '999000');
      await page.click('.dk-save [data-act=save]');
      await page.waitForSelector('.pos-st.declined', { timeout: 15000 });
      check('pos desk: decline is shown with the bank reason', (await text(page, '.pos-box')).includes('موجودی'));
      await page.click('.pos-box [data-close]');
      await page.waitForTimeout(400);
      check('pos desk: a declined card books no document', !(await page.$('.dk-receipt')) && ((await auth('/api/books/docs?limit=5')).items?.length ?? 0) === before);
      const log = await auth('/api/books/pos');
      const ok = log.items.find((x) => x.state === 'approved');
      check('pos log: approval linked to its document, decline recorded, no orphans', !!ok?.docId && ok.card === '1234' && log.items.some((x) => x.state === 'declined' && x.code === '51') && log.orphans.length === 0, JSON.stringify(log.items.map((x) => [x.state, !!x.docId])));

      // one tap (spec 0035): the amount is known; «پرداخت با کارتخوان» sends exactly what is left and books the document
      const fresh = () => [...jobs.values()].filter((j) => !seen.has(j.id));
      let seen = new Set(jobs.keys());
      await freshDesk(page);
      await page.click('[data-act=pnew]');
      await page.fill('#np [name=name]', 'نگار یک‌ضرب');
      await page.fill('#np [name=mobile]', '09121119977');
      await page.click('#np button:not([type])');
      await page.waitForSelector('.dk-who');
      await page.click('[data-mode=sell]');
      await page.click('[data-kind=coin]');
      await page.click('[data-coin=emami]');
      await page.fill('[data-f=count]', '1');
      await page.fill('[data-f=price]', '987650000');
      await page.click('[data-act=add]');
      await page.click('[data-pm=cash]');
      await page.fill('[data-p="0"][data-k=amount]', '7650000');
      await page.waitForTimeout(250);
      check('one tap: the button shows the exact amount left (987,650,000 − 7,650,000 cash)', (await text(page, '.dk-save [data-act=paycard]')).includes('۹۸۰٬۰۰۰٬۰۰۰') && !!(await page.$('#bar [data-act=paycard]')), await text(page, '.dk-save [data-act=paycard]'));
      await page.click('.dk-save [data-act=paycard]');
      await page.waitForSelector('.pos-box');
      check('one tap: the card window shows that amount', (await text(page, '.pos-box')).includes('۹۸۰٬۰۰۰٬۰۰۰'));
      await page.waitForSelector('.dk-receipt', { timeout: 15000 });
      check('one tap: the card reader got exactly the remaining rial, once', fresh().length === 1 && fresh()[0].amount === 980000000, JSON.stringify(fresh()));
      const lastDoc = async () => {
        const id = (await auth('/api/books/docs?limit=1')).items[0].id;
        return auth(`/api/books/docs/${id}`);
      };
      const d1 = await lastDoc();
      const pos1 = d1.payments.find((p) => p.method === 'pos');
      check('one tap: booked, settled to the rial, the RRN on the card row', d1.calc.credit === 0 && pos1?.ref === '863583063456' && d1.calc.payments.find((p) => p.method === 'pos').value === 980000000, JSON.stringify({ credit: d1.calc.credit, pos: pos1 }));
      await page.keyboard.press('Escape');

      // phones and tablets (spec 0035): this computer becomes the counter; a phone with no card reader sends its sale here
      await go(page, '/books/settings', 1500);
      await page.check('#posF [name=station]');
      await page.fill('#posF [name=stationName]', 'پیشخوان آزمون');
      await page.click('#posF button:not([type])');
      await page.waitForSelector('.pos-station', { timeout: 8000 });
      check('counter: the badge says it is ready', /آماده/.test(await text(page, '.pos-station')));
      await freshDesk(page); // the counter page stays open on the desk, as at a real counter
      const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      const pp = await phone.newPage();
      pp.on('pageerror', (e) => errors.push(`[relay phone] pageerror: ${e.message}`));
      await loginUI(pp, 'owner@demo.beatris.ir');
      await pp.evaluate(() => localStorage.setItem('beatris.pos', JSON.stringify({ relay: true })));
      await freshDesk(pp);
      await pp.click('[data-act=pnew]');
      await pp.fill('#np [name=name]', 'کیان از گوشی');
      await pp.fill('#np [name=mobile]', '09121119966');
      await pp.click('#np button:not([type])');
      await pp.waitForSelector('.dk-who');
      await pp.click('[data-mode=sell]');
      await pp.click('[data-kind=coin]');
      await pp.click('[data-coin=emami]');
      await pp.fill('[data-f=count]', '2');
      await pp.fill('[data-f=price]', '987650000');
      await pp.click('[data-act=add]');
      await pp.waitForSelector('#bar [data-act=paycard]');
      seen = new Set(jobs.keys());
      await pp.click('#bar [data-act=paycard]');
      await pp.waitForSelector('.pos-box');
      check('relay: the phone says the counter will take the card', /پیشخوان/.test(await text(pp, '.pos-box')));
      const busyBadge = await page.waitForFunction(() => /کارت را بکشید/.test(document.querySelector('.pos-station')?.textContent ?? ''), null, { timeout: 15000 }).then(() => true, () => false);
      check('relay: the counter computer shows the amount and «swipe the card»', busyBadge);
      await pp.waitForSelector('.dk-receipt', { timeout: 25000 });
      check('relay: the counter charged exactly the phone sale (2 × 987,650,000), once', fresh().length === 1 && fresh()[0].amount === 1975300000, JSON.stringify(fresh()));
      const d2 = await pp.evaluate(async () => {
        const h = { headers: { Authorization: `Bearer ${localStorage.getItem('beatris.token')}` } };
        const id = (await (await fetch('/api/books/docs?limit=1', h)).json()).items[0].id;
        return (await fetch(`/api/books/docs/${id}`, h)).json();
      });
      check('relay: the phone booked its document, settled, with the RRN from the counter', d2.calc.credit === 0 && d2.payments.find((p) => p.method === 'pos')?.ref === '863583063456', JSON.stringify(d2.payments));
      const rlog = await auth('/api/books/pos');
      const rrow = rlog.items.find((x) => x.amount === 1975300000);
      check('relay: the reconciliation log has it approved and linked to the phone document', rrow?.state === 'approved' && rrow.docId === d2.id, JSON.stringify(rrow));
      await phone.close();
      await page.waitForFunction(() => /آماده/.test(document.querySelector('.pos-station')?.textContent ?? ''), null, { timeout: 8000 }).catch(() => {});
      check('counter: ready again after the charge', /آماده/.test(await text(page, '.pos-station')));

      // the invoice editor: one tap charges the invoice total and books the final invoice
      await go(page, '/books/new/sale', 1200);
      await page.click('[data-act=party-new]');
      await page.fill('#np [name=name]', 'فاکتور یک‌ضرب');
      await page.fill('#np [name=mobile]', '09121119955');
      await page.click('#np button:not([type])');
      await page.waitForSelector('.bk-party-sel');
      await page.click('[data-act=catalog]');
      await page.fill('#tq', 'ربع');
      await page.click('[data-tpl=coin-quarter]');
      await page.waitForSelector('#totals [data-act=paycard]');
      seen = new Set(jobs.keys());
      await page.click('#totals [data-act=paycard]');
      await page.waitForURL(/\/books\/doc\//, { timeout: 20000 });
      const d3 = await page.evaluate(async () => (await fetch(`/api/books/docs/${location.pathname.split('/').pop()}`, { headers: { Authorization: `Bearer ${localStorage.getItem('beatris.token')}` } })).json());
      const p3v = d3.calc.payments.find((p) => p.method === 'pos')?.value;
      check('invoice: one tap charged exactly the invoice total and booked it final and settled', d3.status === 'final' && d3.calc.credit === 0 && fresh().length === 1 && fresh()[0].amount === p3v && p3v === d3.calc.sales && d3.payments.find((p) => p.method === 'pos')?.ref === '863583063456', JSON.stringify({ status: d3.status, credit: d3.calc.credit, sales: d3.calc.sales, charged: fresh().map((j) => j.amount) }));
    } finally {
      await page.evaluate(() => localStorage.removeItem('beatris.pos'));
      mock.close();
    }
  });

  if (!live) await step('live sales desk (spec 0037) and workspaces (spec 0038): the customer file, showcase, compare, what-ifs, old gold, split payment, the sale, a reservation, the customer screen; each person starts at their own desk', async () => {
    const auth = (path, opt = {}) => page.evaluate(async ([p, o]) => (await fetch(p, { ...o, headers: { 'content-type': 'application/json', Authorization: `Bearer ${localStorage.getItem('beatris.token')}` } })).json(), [path, opt]);
    const en = (s) => Number(String(s).replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[^\d]/g, ''));
    const lastToast = () => page.$$eval('#toasts .toast', (t) => t.at(-1)?.textContent ?? '');
    const p750 = (await auth('/api/me')).pricing.p750;
    // the showcase: two rings and a pair of earrings; a customer who bought a ring before and still owes for it
    const rings = (await auth('/api/books/items', { method: 'POST', body: JSON.stringify({ tpl: 'ring-w', title: 'انگشتر ویترین آینه', showcase: 'آ۱', batch: [{ weight: 3.2 }, { weight: 3.6, title: 'انگشتر ویترین آینه دو' }] }) })).items;
    const ear = (await auth('/api/books/items', { method: 'POST', body: JSON.stringify({ tpl: 'er-stud', title: 'گوشواره ویترین آینه', weight: 2.1, showcase: 'آ۲' }) })).items[0];
    const cust = await auth('/api/books/parties', { method: 'POST', body: JSON.stringify({ name: 'مهسا پیشخوانی', mobile: '09127778899' }) });
    await auth('/api/books/docs', { method: 'POST', body: JSON.stringify({ type: 'sale', partyId: cust.id, lines: [{ kind: 'jewel', tpl: 'ring-w', title: 'انگشتر زنانه', weight: 2.9, fineness: 750, p750, ojratMode: 'pct', ojrat: 18, profitPct: 7 }], payments: [], status: 'final' }) });
    await go(page, '/books/sell', 1800);
    if (await page.$('#lines .sl-line')) await page.click('[data-act=clear]');
    check('sales desk: one screen — the customer, the showcase, the cart and today’s price', !!(await page.$('.sl-who #who')) && !!(await page.$('.sl-shelf #items')) && !!(await page.$('.sl-cart #tot')) && /[۰-۹]/.test(await text(page, '#live')), await text(page, '#live'));
    // F3: the customer by a piece of the name; the quick file opens
    await page.keyboard.press('F3');
    await page.keyboard.type('پیشخوانی');
    await page.waitForSelector(`#pdrop [data-pick="${cust.id}"]`, { timeout: 8000 });
    await page.click(`#pdrop [data-pick="${cust.id}"]`);
    await page.waitForSelector('.sl-file', { timeout: 8000 });
    const file = await text(page, '#file');
    check('sales desk: the customer file — one purchase, rings, the usual weight, what is owed', /۱ بار/.test(file) && /انگشتر/.test(file) && /۲٫۹/.test(file) && /بدهکار/.test(file), file.replace(/\s+/g, ' ').slice(0, 220));
    // the showcase by name, two rings side by side
    await page.fill('#iq', 'ویترین آینه');
    await page.waitForTimeout(300);
    check('sales desk: the showcase finds the pieces by name, each with its price', (await page.$$('.sl-item')).length === 3 && /[۰-۹]/.test(await text(page, '.sl-item em')), String((await page.$$('.sl-item')).length));
    await page.check(`[data-cmp="${rings[0].id}"]`);
    await page.check(`[data-cmp="${rings[1].id}"]`);
    await page.waitForSelector('.sl-cmp table', { timeout: 5000 });
    const cmp = await text(page, '.sl-cmp');
    check('sales desk: two rings side by side, the cheaper one named', /ارزان‌ترین/.test(cmp) && cmp.includes('انگشتر ویترین آینه دو'), cmp.replace(/\s+/g, ' ').slice(0, 200));
    // a tap on the card, then a barcode and Enter
    await page.click(`.sl-item-main[data-add="${rings[0].id}"]`);
    await page.waitForSelector('#lines .sl-line');
    const sugg = await text(page, '#sugg');
    check('sales desk: suggestions — a piece to go with it and an alternative ring', /مکمل/.test(sugg) && /جایگزین/.test(sugg), sugg.replace(/\s+/g, ' ').slice(0, 200));
    await page.fill('#iq', ear.code);
    await page.press('#iq', 'Enter');
    await page.waitForFunction(() => document.querySelectorAll('#lines .sl-line').length === 2, null, { timeout: 5000 });
    check('sales desk: a barcode and Enter put the piece in the cart', (await text(page, '#lines')).includes('گوشواره ویترین آینه'));
    // «اگر سه درصد تخفیف بدهم چه می‌شود؟» — seen first, applied on request
    const total = async () => en(await text(page, '.sl-tot-row.big b'));
    const t0 = await total();
    await page.click('[data-sc=disc3]');
    await page.waitForSelector('[data-apply=disc3]', { timeout: 5000 });
    check('sales desk: «۳٪ تخفیف» shows its total and changes nothing until applied', t0 === (await total()) && /[۰-۹]/.test(await text(page, '.sl-sc.on')), (await text(page, '.sl-sc.on')).replace(/\s+/g, ' '));
    await watchSnap(page, '#tot .sl-tot-row.big.snap', '#tot');
    await page.click('[data-apply=disc3]');
    await page.waitForTimeout(300);
    const t1 = await total();
    check('sales desk: applied, the total falls by about three percent', t1 < t0 && t1 > t0 * 0.95, `${t0} → ${t1}`);
    check('sales desk: the amount to pay that changed snaps into place (spec 0039)', (await snaps(page)) > 0);
    // the customer's old gold in the same step
    await page.click('#tin summary');
    await page.fill('[data-t=weight]', '2.5');
    await page.click('[data-act=tin-add]');
    await page.waitForSelector('#tins .sl-line.in', { timeout: 5000 });
    const t2 = await total();
    check('sales desk: the old gold comes off what is to pay', t2 < t1 && /معاوضه/.test(await text(page, '#tot')), `${t1} → ${t2}`);
    // half in cash, the rest card to card
    await page.click('[data-pay=cash]');
    await page.waitForSelector('[data-p="0"]');
    await watchSnap(page, '#tot .sl-tot-row.big.snap', '#tot');
    await page.fill('[data-p="0"]', String(Math.round(en(await page.inputValue('[data-p="0"]')) / 2)));
    check('sales desk: half in cash leaves the rest open', /مانده/.test(await text(page, '#tot')), await text(page, '#tot'));
    check('sales desk: a payment typed redraws the totals, and the amount to pay stays still (spec 0039)', (await snaps(page)) === 0);
    await page.click('[data-pay=c2c]');
    await page.waitForSelector('[data-p="1"]');
    check('sales desk: the second method takes exactly what is left', !/مانده/.test(await text(page, '#tot')) && en(await page.inputValue('[data-p="1"]')) > 0, (await text(page, '#tot')).replace(/\s+/g, ' '));
    // the customer's own screen, on a second window of the same computer
    const scr = await ctx.newPage();
    scr.on('pageerror', (e) => errors.push(`[screen] pageerror: ${e.message}`));
    await scr.goto(base + '/books/sell/screen');
    await scr.waitForSelector('.ss-lines .ss-line', { timeout: 8000 });
    const shown = await text(scr, '.ss');
    check('customer screen: the pieces, «اجرت و سود» as one figure, the old gold, what is paid — no profit rate', shown.includes('انگشتر ویترین آینه') && shown.includes('گوشواره ویترین آینه') && /اجرت و سود/.test(shown) && /معاوضه/.test(shown) && /پرداخت‌شده/.test(shown) && !/٪/.test(shown), shown.replace(/\s+/g, ' ').slice(0, 260));
    // Ctrl+Enter books it: the ordinary sale invoice, through the same outbox
    await page.evaluate(() => Object.defineProperty(navigator, 'share', { value: undefined, configurable: true }));
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(base).origin });
    await page.keyboard.press('Control+Enter');
    await page.waitForSelector('#done .sl-done a[href^="/books/doc/"]', { timeout: 15000 });
    const id = await page.$eval('#done .sl-done a[href^="/books/doc/"]', (a) => a.getAttribute('href').split('/').pop());
    const doc = await auth(`/api/books/docs/${id}`);
    const jewels = doc.lines.filter((l) => l.kind === 'jewel');
    check('sales desk: booked as the ordinary sale — two pieces with the discount, the old gold, cash and card to card, the customer, settled', doc.type === 'sale' && doc.status === 'final' && doc.partyId === cust.id && jewels.length === 2 && jewels.every((l) => l.discount > 0) && doc.lines.some((l) => l.kind === 'used' && l.side === 'in') && doc.payments.map((p) => p.method).sort().join() === 'c2c,cash' && Math.abs(doc.calc.credit) < 10, JSON.stringify({ t: doc.type, s: doc.status, n: doc.lines.length, p: doc.payments.map((p) => p.method), c: doc.calc.credit }));
    await scr.waitForSelector('.ss-thanks', { timeout: 5000 }).catch(() => null);
    check('customer screen: «سپاس از خرید شما» with the invoice number', /سپاس از خرید شما/.test(await text(scr, '.ss')) && /فاکتور/.test(await text(scr, '.ss')), (await text(scr, '.ss')).replace(/\s+/g, ' '));
    await page.click('#done [data-act=share]');
    await page.waitForTimeout(400);
    const shared = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
    check('sales desk: «ارسال برای مشتری» gives the invoice as text — the pieces, the total, settled, the authenticity code', shared.includes('انگشتر ویترین آینه') && /جمع:/.test(shared) && /تسویه شد/.test(shared) && shared.includes(doc.verify), shared.replace(/\n/g, ' | ').slice(0, 260));
    check('sales desk: the sold pieces leave the showcase', (await auth(`/api/books/items/code/${ear.code}`)).status === 'sold' && !(await page.$(`.sl-item-main[data-add="${rings[0].id}"]`)));
    // امضای مشتری (spec 0040): signed at the counter right after the sale, kept beside the invoice, printed in its box
    await page.click('#done [data-act=sign]');
    const pad = await page.waitForSelector('.modal [data-sign-pad]');
    check('signature: nothing to save until the customer signs', await page.$eval('.modal [data-sign-save]', (b) => b.disabled));
    await page.waitForTimeout(400);
    const pr = await pad.boundingBox();
    await page.mouse.move(pr.x + pr.width * 0.2, pr.y + pr.height * 0.6);
    await page.mouse.down();
    for (let i = 1; i <= 24; i++) await page.mouse.move(pr.x + pr.width * (0.2 + i * 0.025), pr.y + pr.height * (0.6 - 0.25 * Math.sin(i / 3)), { steps: 2 });
    await page.mouse.up();
    await page.click('.modal [data-sign-save]');
    await page.waitForSelector('.modal', { state: 'detached', timeout: 8000 }).catch(() => {});
    const signed = await auth(`/api/books/docs/${id}`);
    check('signature: kept beside the sale as a PNG with its hash; the invoice itself unchanged', /^data:image\/png;base64,/.test(signed.signature?.png ?? '') && /^[0-9a-f]{64}$/.test(signed.signature?.hash ?? '') && signed.hash === doc.hash && signed.version === doc.version, JSON.stringify({ hash: signed.signature?.hash, same: signed.hash === doc.hash }));
    check('signature: the counter says the customer signed', /امضای مشتری ثبت شد/.test(await text(page, '#done')), await text(page, '#done'));
    if (signed.signature) signedSale = id;
    // گرم ۱۸ امروز (spec 0040): a new price rolls only the digits that changed, and the figure is read once
    const fig750 = () => page.$eval('#live [data-fig] .sr', (e) => e.textContent).catch(() => '');
    const before750 = await fig750();
    await page.evaluate(() => {
      window.__rolled = [];
      document.querySelector('#live').addEventListener('transitionrun', (e) => {
        const col = e.target.closest?.('.u-roll-s');
        if (col) window.__rolled.push([...document.querySelectorAll('#live .u-roll-s')].indexOf(col));
      });
    });
    await page.route('**/api/me', async (r) => {
      const res = await r.fetch();
      const j = await res.json();
      j.pricing.p750 += 3;
      await r.fulfill({ response: res, json: j });
    }, { times: 1 });
    await page.click('#live [data-act=refresh]');
    await page.waitForFunction((b) => document.querySelector('#live [data-fig] .sr')?.textContent !== b, before750, { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(500);
    const after750 = await fig750();
    const digitsOf = (f) => [...f].filter((c) => /[0-9۰-۹]/.test(c));
    const want = digitsOf(after750).map((c, i) => (c !== digitsOf(before750)[i] ? i : -1)).filter((i) => i >= 0);
    const rolled = await page.evaluate(() => [...new Set(window.__rolled)].sort((a, b) => a - b));
    check('sales desk: a new price of the day rolls only the digits that changed, and reads once', after750 !== before750 && want.length > 0 && JSON.stringify(rolled) === JSON.stringify(want) && (await text(page, '#live')).split(after750).length === 2, JSON.stringify({ before750, after750, want, rolled }));
    await page.click('#live [data-act=refresh]'); // back to the real price before the next sale
    await page.waitForFunction((b) => document.querySelector('#live [data-fig] .sr')?.textContent === b, before750, { timeout: 8000 }).catch(() => {});
    // a reservation is for a customer: refused without one, then the piece is set aside on a proforma
    await page.fill('#iq', 'ویترین آینه دو');
    await page.waitForTimeout(250);
    await page.click(`.sl-item-main[data-add="${rings[1].id}"]`);
    await page.waitForSelector('#lines .sl-line');
    await page.click('[data-act=reserve]');
    await page.waitForTimeout(300);
    check('sales desk: no customer, no reservation', /مشتری را انتخاب کنید/.test(await lastToast()) && (await auth(`/api/books/items/code/${rings[1].code}`)).status === 'stock', await lastToast());
    await page.keyboard.press('F3');
    await page.keyboard.type('پیشخوانی');
    await page.waitForSelector(`#pdrop [data-pick="${cust.id}"]`, { timeout: 8000 });
    await page.click(`#pdrop [data-pick="${cust.id}"]`);
    await page.waitForSelector('.sl-file', { timeout: 8000 });
    check('sales desk: the file already counts today’s sale', /۲ بار/.test(await text(page, '#file')), (await text(page, '#file')).replace(/\s+/g, ' ').slice(0, 120));
    await page.click('[data-act=reserve]');
    await page.waitForFunction(() => /رزرو شد/.test(document.querySelector('#done')?.innerText ?? ''), null, { timeout: 10000 });
    check('sales desk: «رزرو برای مشتری» sets the piece aside on a proforma', (await auth(`/api/books/items/code/${rings[1].code}`)).status === 'reserved' && (await auth('/api/books/docs?type=proforma&status=final')).items.some((d) => d.partyId === cust.id));
    await scr.close();
    // spec 0038: the boss's desk — the pulse, the pins, and the reservation just made
    await go(page, '/work', 2000);
    await page.waitForSelector('.wk-card', { timeout: 10000 });
    const desk = await text(page, '.wk');
    check('workspace: the boss’s desk — pulse, pins, today and the reservation', /میز کار رئیس/.test(desk) && /نبض فروشگاه/.test(desk) && desk.includes('مهسا پیشخوانی') && (await page.$$('.wk-pin')).length >= 6, desk.replace(/\s+/g, ' ').slice(0, 220));
    await page.click('.tb-work > summary');
    check('workspace: the same pins one tap away in the top bar', (await page.$$('.tb-work-m a')).length >= 7);
    await page.click('.tb-work > summary');
    // a seller signs in straight to the sales desk, makes the operator's way their own, and a boss's layout opens nothing more
    const sCtx = await browser.newContext({ viewport: { width: 1366, height: 860 } });
    const ps = await sCtx.newPage();
    ps.on('pageerror', (e) => errors.push(`[seller] pageerror: ${e.message}`));
    ps.on('console', (m) => m.type() === 'error' && !/favicon|status of 401/.test(m.text()) && errors.push(`[seller] console: ${m.text().slice(0, 200)}`));
    await loginUI(ps, 'nima@demo.beatris.ir');
    await ps.waitForURL((u) => u.pathname === '/books/sell', { timeout: 15000 }).catch(() => {});
    check('workspace: the seller signs in straight to the sales desk', new URL(ps.url()).pathname === '/books/sell' && !!(await ps.waitForSelector('.sl-grid', { timeout: 10000 }).catch(() => null)), ps.url());
    await go(ps, '/start', 1500);
    check('workspace: /start always opens the profile’s own place', new URL(ps.url()).pathname === '/books/sell', ps.url());
    await go(ps, '/me#workspace', 1500);
    await ps.waitForSelector('#wsf .wsf-card', { timeout: 10000 });
    await ps.click('#wsf .wsf-card:has(input[value=operator])');
    await ps.click('#wsf button.btn:not(.ghost)');
    await ps.waitForTimeout(700);
    const ws = await ps.evaluate(async () => (await (await fetch('/api/me', { headers: { authorization: `Bearer ${localStorage.getItem('beatris.token')}` } })).json()).workspace);
    check('workspace: «من» — the seller takes the operator’s way: compact, keyboard pins, kept on the server', ws.profile === 'operator' && ws.density === 'compact' && ws.pins.includes('desk') && (await ps.evaluate(() => document.body.classList.contains('dense'))), JSON.stringify(ws));
    await go(ps, '/work', 1800);
    await ps.waitForSelector('.wk-card', { timeout: 10000 });
    check('workspace: the operator’s home — the send queue and the keys, compact on every page', /صف ارسال/.test(await text(ps, '.wk')) && /Ctrl\+Enter/.test(await text(ps, '.wk')) && (await ps.evaluate(() => document.body.classList.contains('dense'))));
    await ps.evaluate(() => fetch('/api/me/workspace', { method: 'PUT', headers: { 'content-type': 'application/json', authorization: `Bearer ${localStorage.getItem('beatris.token')}` }, body: JSON.stringify({ profile: 'boss' }) }));
    await go(ps, '/work', 1800);
    await ps.waitForSelector('.wk-card', { timeout: 10000 });
    check('workspace: a seller on the boss’s layout still sees nothing a seller may not', /میز کار رئیس/.test(await text(ps, '.wk')) && !(await ps.$('.wk-pins a[href="/books/dashboard"], .wk-pins a[href="/staff"], .wk-pins a[href="/books/control"], .tb-work-m a[href="/books/dashboard"]')) && !(await ps.$('.wk-sentence')), (await text(ps, '.wk-pins')).replace(/\s+/g, ' '));
    await sCtx.close();
    // the manager sets a colleague's way of working from «تیم»
    const zahra = (await auth('/api/team')).members.find((m) => m.phone === '09120000005');
    await go(page, `/staff/${zahra.id}`, 1800);
    await page.waitForSelector('#wsf .wsf-card', { timeout: 10000 });
    await page.click('#wsf .wsf-card:has(input[value=staff])');
    await page.click('#wsf button.btn:not(.ghost)');
    await page.waitForTimeout(700);
    check('workspace: the manager sets a colleague’s workspace in «تیم»', (await auth('/api/team')).members.find((m) => m.id === zahra.id).workspace.profile === 'staff');
  });

  await step('web app: installable PWA (manifest, service worker, shortcuts, screenshots) and the install guide', async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const p = await ctx.newPage();
    const host = base.replace('127.0.0.1', 'localhost'); // a secure context for the service worker
    await p.goto(host + '/login');
    await p.waitForTimeout(2000);
    await p.reload();
    await p.waitForTimeout(1200);
    const cdp = await ctx.newCDPSession(p);
    const man = await cdp.send('Page.getAppManifest');
    const inst = await cdp.send('Page.getInstallabilityErrors');
    check('web app: manifest parses without errors', man.errors.length === 0, JSON.stringify(man.errors));
    check('web app: Chromium finds it installable', inst.installabilityErrors.length === 0, JSON.stringify(inst.installabilityErrors));
    check('web app: the service worker controls the page', await p.evaluate(() => !!navigator.serviceWorker.controller));
    const m = JSON.parse(man.data);
    check('web app: shortcuts and wide + narrow screenshots', m.shortcuts?.length >= 3 && m.screenshots?.some((x) => x.form_factor === 'wide') && m.screenshots?.some((x) => x.form_factor === 'narrow'));
    await p.click('[data-act=install]');
    check('web app: install guide opens', await p.waitForSelector('.ins', { timeout: 5000 }).then(() => true, () => false));
    check('web app: Windows installer is downloadable', (await fetch(`${base}/downloads/Beatris-Setup-x64.exe`, { method: 'HEAD' })).headers.get('content-type')?.includes('portable-executable'));
    await ctx.close();
  });
  await step('elliott studio: multi-degree count, fib, scenarios, panes, cards (books and market)', async () => {
    await go(page, '/books/elliott', 2500);
    await page.waitForSelector('.ew-cv');
    await page.waitForSelector('#ewScen h3');
    const box = await page.locator('.ew-cv').boundingBox();
    check('elliott: the chart canvas is large on a PC screen', box && box.width > 700 && box.height > 500, box ? `${Math.round(box.width)}×${Math.round(box.height)}` : 'none');
    const painted = await page.evaluate(() => { const c = document.querySelector('.ew-cv'), g = c.getContext('2d'), d = g.getImageData(c.width / 2, 0, 1, c.height).data; let n = 0; for (let k = 0; k < d.length; k += 4) if (d[k] + d[k + 1] + d[k + 2] > 150) n++; return n; });
    check('elliott: the chart is painted (candles, levels, labels)', painted > 5, String(painted));
    const scen = await text(page, '#ewScen');
    check('elliott: scenarios with probabilities, or an honest note', /سناریوی اصلی[\s\S]*٪[\s\S]*سناریوی جایگزین/.test(scen) || scen.includes('سناریو ساخته نمی‌شود'), scen.slice(0, 120));
    check('elliott: header price card', (await text(page, '#ewStats')).includes('قیمت فعلی'));
    check('elliott: five corrective patterns and the Fibonacci table', (await page.$$('.ew-pats figure')).length === 5 && (await page.$$('.ew-fib tr')).length >= 6);
    check('elliott: rules of the count listed', (await page.$$('.ew-notes li')).length >= 1);
    // spec 0030: the wave rig under the chart, judged by the studio's own engine
    await page.waitForSelector('#ewRig .wv-svg', { timeout: 15000 });
    const rigOut = () => text(page, '#ewRig [data-readout]');
    check('elliott rig: drawn under the chart (six sliders, three stops)', (await page.$$('#ewRig .wv-slider')).length === 6 && (await page.$$('#ewRig .wv-stop')).length === 3);
    await page.click('#ewRig [data-ex="valid"]');
    await page.waitForTimeout(1300);
    check('elliott rig: the textbook count holds every rule and scores 100', /قواعد ۴ از ۴، امتیاز ۱۰۰/.test(await rigOut()) && !(await page.$('#ewRig [data-bad]')), await rigOut());
    await page.click('#ewRig [data-ex="deep2"]');
    await page.waitForTimeout(1300);
    check('elliott rig: «موج ۲ عمیق» lights the stop on rail 2 and names wave 2', !!(await page.$('#ewRig .wv-stop[data-rule="w2"][data-bad]')) && !(await page.$('#ewRig .wv-stop[data-rule="w4"][data-bad]')) && (await rigOut()).includes('شکسته: موج ۲'), await rigOut());
    await page.click('#ewRig [data-ex="short3"]');
    await page.waitForTimeout(1300);
    check('elliott rig: «موج ۳ کوتاه» turns the wave-3 rod red and no stop', !!(await page.$('#ewRig .wv-rodg[data-n="1"][data-bad]')) && !(await page.$('#ewRig .wv-stop[data-bad]')), await rigOut());
    // a drag: the slider on rail 4 pulled down into wave 1's range lights the wave-4 stop, live
    await page.click('#ewRig [data-ex="valid"]');
    await page.waitForTimeout(1300);
    await page.locator('#ewRig').scrollIntoViewIfNeeded();
    const s4 = await page.locator('#ewRig .wv-slider[data-rail="4"] .wv-block').boundingBox();
    const rigBox = await page.locator('#ewRig .wv-svg').boundingBox();
    await page.mouse.move(s4.x + s4.width / 2, s4.y + s4.height / 2);
    await page.mouse.down();
    await page.mouse.move(s4.x + s4.width / 2, s4.y + s4.height / 2 + rigBox.height * 0.22, { steps: 8 });
    const dragging = await rigOut();
    await page.mouse.up();
    check('elliott rig: dragging P4 into wave 1 lights the wave-4 stop', !!(await page.$('#ewRig .wv-stop[data-rule="w4"][data-bad]')) && /^نقطه ۴ = /.test(dragging) && dragging.includes('شکسته: موج ۴'), dragging);
    await page.click('#ewRig [data-act="studio"]');
    await page.waitForTimeout(1300);
    const fromChart = await rigOut();
    check("elliott rig: «شمارش همین نمودار» takes the studio's impulse or says why not", fromChart.startsWith('شمارش همین نمودار') || /پنج موج کامل نیست|شمارش معتبری ندارد/.test(fromChart), fromChart.slice(0, 160));
    await page.click('[data-tf=W]');
    await page.waitForTimeout(1200);
    check('elliott: weekly bars from the daily series', (await text(page, '#ewSub')).includes('1W'));
    await page.click('[data-deg="1.5"]');
    await page.waitForTimeout(600);
    await page.click('[data-tf=D]');
    await page.click('[data-deg="1"]');
    await page.waitForTimeout(1200);
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.3);
    await page.mouse.wheel(0, -300);
    await page.waitForTimeout(300);
    await page.goto(base + '/market/elliott?s=mesghal');
    await page.waitForSelector('#ewScen h3');
    check('elliott: also under the market with any symbol', (await text(page, '#ewSym')).includes('مظنه'));
    check('elliott: linked from the books menu', (await page.goto(base + '/books/control').then(() => page.waitForSelector('.bk-nav a[href="/books/elliott"]', { timeout: 15000 }).then(() => true, () => false))));
  });

  if (!live) {
    // the full-feature pass (2026-10-12): the four pages no other step opened
    await step('pages no other step opens: a document corrected in its own editor, a shared statement answered, an SOP acknowledged, the agents page', async () => {
      const auth = (path, opt = {}) => page.evaluate(async ([p, o]) => (await fetch(p, { ...o, headers: { 'content-type': 'application/json', Authorization: `Bearer ${localStorage.getItem('beatris.token')}` } })).json(), [path, opt]);
      const cash = (await auth('/api/books/accounts')).items.find((a) => a.kind === 'cash');
      // 1) /books/doc/:id/edit — a final expense corrected from its own form: a new document replaces it, both stay
      const orig = await auth('/api/books/docs', { method: 'POST', body: JSON.stringify({ type: 'expense', category: 'سایر', note: 'قبض آب گذرگاه', payments: [{ method: 'cash', dir: 'out', amount: 4500000, account: cash.id }] }) });
      await go(page, `/books/doc/${orig.id}/edit`, 1500);
      check('doc editor: a final document opens in its form with a required reason', !!(await page.$('[name=reason]')) && /اصلاحیه/.test(await text(page, '[data-act=save]')), await text(page, '[data-act=save]'));
      await page.fill('[name=note]', 'قبض آب گذرگاه، شماره اشتراک درست');
      await page.click('[data-act=save]');
      await page.waitForTimeout(500);
      check('doc editor: no reason, no correction', page.url().includes(`/books/doc/${orig.id}/edit`));
      await page.fill('[name=reason]', 'شماره اشتراک جا افتاده بود');
      await page.click('[data-act=save]');
      await page.waitForURL((u) => /^\/books\/doc\/[^/]+$/.test(u.pathname) && !u.pathname.endsWith(orig.id), { timeout: 15000 });
      const newId = new URL(page.url()).pathname.split('/').pop();
      const [v2, v1] = await Promise.all([auth(`/api/books/docs/${newId}`), auth(`/api/books/docs/${orig.id}`)]);
      check('doc editor: the correction is a new document that amends the original; the original is void, not changed', v2.amends === orig.id && v2.note === 'قبض آب گذرگاه، شماره اشتراک درست' && v1.status === 'void' && v1.note === 'قبض آب گذرگاه', `${v2.amends} ${v1.status}`);
      // 2) /s/:token — the customer's own statement, opened without signing in, answered from the page
      const pt = await auth('/api/books/parties', { method: 'POST', body: JSON.stringify({ name: 'پریا برگه‌دار', mobile: '09125556677' }) });
      await auth('/api/books/docs', { method: 'POST', body: JSON.stringify({ type: 'payment', partyId: pt.id, payments: [{ method: 'cash', dir: 'out', amount: 20000000, account: cash.id }] }) });
      const share = await auth(`/api/books/parties/${pt.id}/share`, { method: 'POST', body: JSON.stringify({ days: 3 }) });
      const guest = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const gp = await guest.newPage();
      gp.on('pageerror', (e) => errors.push(`[guest] ${gp.url()} pageerror: ${e.message}`));
      let wrongLink = false; // the deliberately wrong link below answers 404, and the browser logs that request
      gp.on('console', (m) => m.type() === 'error' && !/favicon/.test(m.text()) && !(wrongLink && /status of 404/.test(m.text())) && errors.push(`[guest] ${gp.url()} console: ${m.text().slice(0, 240)}`));
      await gp.goto(base + share.path);
      await gp.waitForSelector('.st-card h1', { timeout: 15000 });
      const sheet = await gp.$eval('.st-card', (e) => e.innerText);
      check('shared statement: the customer sees their name and what they owe, signed out', sheet.includes('پریا برگه‌دار') && /بدهکار|بدهی/.test(sheet) && /[۰-۹]/.test(sheet) && noBadNumbers(sheet), sheet.replace(/\s+/g, ' ').slice(0, 160));
      await gp.click('#stf button[value=agree]');
      await gp.waitForSelector('.st-done.agree', { timeout: 10000 });
      const shares = await auth(`/api/books/parties/${pt.id}/shares`);
      check('shared statement: «تأیید» from the page reaches the shop', shares.items?.[0]?.answer === 'agree', JSON.stringify(shares.items?.[0] ?? {}).slice(0, 160));
      wrongLink = true;
      await gp.goto(base + '/s/not-a-real-token');
      await gp.waitForSelector('.st-card h1', { timeout: 15000 });
      check('shared statement: a wrong link says so and shows nothing', /در دسترس نیست/.test(await gp.$eval('.st-card', (e) => e.innerText)));
      await guest.close();
      // 3) /sop/:id — a procedure read and acknowledged; it says so after a reload
      await go(page, '/sop/sop-open', 1200);
      const ackBtn = await page.$('[data-act=ack]');
      if (ackBtn) {
        await ackBtn.click();
        await page.waitForFunction(() => /تأیید ثبت شد/.test(document.querySelector('#main')?.innerText ?? ''), null, { timeout: 8000 });
      }
      await go(page, '/sop/sop-open', 1200);
      const sop = await auth('/api/sops/sop-open');
      check('SOP: acknowledged at its own version, and the page says so', sop.ack?.version === sop.sop.version && /تأیید کرده‌اید/.test(await text(page, '#main')) && !(await page.$('[data-act=ack]')), `v${sop.ack?.version}/${sop.sop.version}`);
      // 4) /agents — the registry, the tools and the recent runs
      await go(page, '/agents', 1500);
      const rows = await page.$$eval('.at-journal tbody tr', (r) => r.length);
      check('agents page: the registry lists the agents with their tools', /عامل‌ها/.test(await text(page, '.at-head h1')) && rows >= 2, `${rows} rows`);
    });

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
// one address for every page (spec 0039): the phone walk opens ROUTES, the walk of both widths and both skins opens
// ROUTES and MORE_ROUTES (the patterns with an id get a real one there)
const ROUTES = ['/', '/work', '/books/sell', '/books/sell/screen', '/learn', '/lesson/r5', '/tools', '/history', '/practice', '/coins', '/coins?mode=seal', '/coins?mode=real', '/coins/manage', '/coins/showcase', '/tools/bayes', '/lesson/k4', '/lesson/k10', '/lesson/k11', '/learn/c-melt', '/lesson/h1', '/lesson/h2', '/lesson/h3', '/lesson/h4', '/lesson/h5', '/ledger', '/ledger?level=3', '/tools/melt', '/market', '/market?s=sekee&r=all', '/market/data', '/learn/c-market', '/lesson/mk1', '/lesson/mk6', '/intro', '/staff/leads', '/staff/settings', '/tools/inspect', '/books', '/books/new/sale', '/books/new/receipt', '/books/docs', '/books/stock', '/books/cash', '/books/parties', '/books/reports', '/books/settings', '/books/log', '/books/desk', '/books/day', '/books/vault', '/books/bars', '/books/reports?tab=pnl', '/books/audit', '/books/pulse', '/books/trace', '/books/find', '/books/events', '/books/memory', '/books/dashboard', '/books/products', '/books/ai', '/books/smart?t=close', '/books/smart?t=forecast', '/books/smart?t=risk', '/books/smart?t=bars', '/books/smart?t=quotes', '/vendor', '/books/peers', '/help', '/ops', '/books/control', '/books/control?t=exceptions', '/books/control?t=simulate', '/books/control?t=twin', '/books/control?t=lots', '/books/control?t=story', '/books/control?t=trial', '/books/control?t=forecast', '/books/control?t=approvals', '/books/control?t=periods', '/books/control?t=close', '/books/control?t=karat', '/books/elliott', '/market/elliott'];
const MORE_ROUTES = ['/intro/features', '/start', '/train/accounting', '/train/team', '/scenario/sc-ojrat', '/cards', '/drill', '/tools/invoice', '/tools/mazaneh', '/setup', '/studio', '/studio/coach', '/agents', '/library', '/sop/sop-open', '/me', '/staff', '/staff/queue', '/staff/access'];
{
  const { page, ctx } = await session({ width: 390, height: 844 });
  await step('mobile login', () => loginUI(page));
  await step('mobile pages', async () => {
    for (const p of ROUTES) {
      await go(page, p, 1500);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      // name the widest offender so a failure is actionable
      const wide = overflow > 1 ? await page.evaluate(() => [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().left < -1 || e.getBoundingClientRect().right > innerWidth + 1).slice(-3).map((e) => `${e.tagName.toLowerCase()}.${[...e.classList].join('.')}`).join(' ')) : '';
      check(`mobile ${p}: no horizontal overflow`, overflow <= 1, `${overflow}px ${wide}`);
    }
    // the top bar's search button: the same search on a phone, with no keyboard shortcut
    await go(page, '/books/desk', 1200);
    await page.click('#palBtn');
    check('mobile: the search button opens the clue search', !!(await page.waitForSelector('#palQ', { timeout: 5000 }).catch(() => null)));
    await page.keyboard.press('Escape');
    // the wave rig on a phone: whole, inside the page, with sliders a finger can take
    await go(page, '/books/elliott', 2500);
    await page.waitForSelector('#ewRig .wv-svg', { timeout: 15000 });
    const hit = await page.$$eval('#ewRig .wv-hit', (hs) => hs.map((h) => { const r = h.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }));
    check('mobile elliott rig: six sliders, each a touch target of at least 24 px', hit.length === 6 && hit.every(([w, h]) => w >= 24 && h >= 24), JSON.stringify(hit));
    check('mobile elliott rig: no horizontal overflow', (await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 1);
    await go(page, '/studio', 6000);
    check('mobile studio: bottom sheet collapsed', !(await page.$eval('#panel', (p) => p.classList.contains('open'))));
    await page.click('[data-sheet]');
    await page.waitForTimeout(800);
    check('mobile studio: tap handle opens sheet', await page.$eval('#panel', (p) => p.classList.contains('open')));
  });
  if (!live) await step('touch phone (spec 0040): a tap never books — the desk books when the handle is slid to the end; a computer keeps its button; the signature prints', async () => {
    await freshDesk(page);
    check('slide: a computer keeps the ordinary «ثبت سند» button', await page.$eval('.dk-save', (s) => getComputedStyle(s.querySelector('[data-act=save]')).display !== 'none' && s.querySelector('.u-slide').hidden));
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const pp = await phone.newPage();
    pp.on('pageerror', (e) => errors.push(`[touch phone] pageerror: ${e.message}`));
    try {
      await loginUI(pp, 'owner@demo.beatris.ir');
      await freshDesk(pp);
      check('slide: a touch phone gets the handle in place of the button', await pp.$eval('.dk-save', (s) => getComputedStyle(s.querySelector('[data-act=save]')).display === 'none' && !s.querySelector('.u-slide').hidden && !!s.querySelector('.u-slide-k[aria-label]')));
      await pp.click('[data-act=pnew]');
      await pp.fill('#np [name=name]', 'سارا از گوشی لمسی');
      await pp.fill('#np [name=mobile]', '09124400400'); // a number no other step gives a customer
      await pp.click('#np button:not([type])');
      await pp.waitForSelector('.dk-who');
      await pp.click('[data-mode=buy]');
      await pp.click('[data-kind=coin]');
      await pp.click('[data-coin=emami]');
      await pp.fill('[data-f=count]', '1');
      await pp.fill('[data-f=price]', '985000000');
      await pp.click('[data-act=add]');
      await pp.waitForSelector('#bar [data-act=save]');
      await pp.evaluate(() => scrollTo(0, 0));
      await pp.waitForTimeout(600);
      const cover = await pp.evaluate(() => {
        const a = document.querySelector('.ud-dock.on')?.getBoundingClientRect();
        const b = document.querySelector('#bar')?.getBoundingClientRect();
        return { dock: !!a, overlap: !!a && !!b && a.top < b.bottom && b.top < a.bottom && a.left < b.right && b.left < a.right };
      });
      check('phone desk: the «برگشت» dock does not cover the bottom bar', cover.dock && !cover.overlap, JSON.stringify(cover));
      const booked = async () => !!(await pp.$('.dk-receipt'));
      await pp.$eval('.dk-save .u-slide', (e) => e.scrollIntoView({ block: 'center' }));
      await pp.tap('.dk-save .u-slide-k');
      await pp.waitForTimeout(1200);
      check('slide: a tap on the handle books nothing', !(await booked()));
      await pp.tap('#bar [data-act=save]');
      await pp.waitForTimeout(900);
      check('slide: «ثبت» in the bottom bar brings the handle, it does not book', !(await booked()) && /دستگیره/.test(await text(pp, '#toasts')), await text(pp, '#toasts'));
      const cdp = await phone.newCDPSession(pp);
      const drag = async (share) => {
        await pp.$eval('.dk-save .u-slide', (e) => e.scrollIntoView({ block: 'center' }));
        await pp.waitForTimeout(300);
        const k = await (await pp.$('.dk-save .u-slide-k')).boundingBox();
        const t = await (await pp.$('.dk-save .u-slide')).boundingBox();
        const y = k.y + k.height / 2;
        const x0 = k.x + k.width / 2;
        const x1 = x0 - (t.width - k.width) * share; // RTL: the handle starts at the right and travels left
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y }] });
        for (let i = 1; i <= 16; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + ((x1 - x0) * i) / 16, y }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      };
      await drag(0.6);
      await pp.waitForTimeout(1200);
      check('slide: let go before the end, the handle springs back and nothing is booked', !(await booked()));
      await drag(1);
      const ok = await pp.waitForSelector('.dk-receipt', { timeout: 15000 }).then(() => true, () => false);
      check('slide: slid to the end, the document is booked', ok && /کد اصالت/.test(await text(pp, '.dk-receipt')));
    } finally {
      await phone.close();
    }
    // the signature on the printed paper, in both kinds of paper
    if (!signedSale) return check('signature: a signed sale to print', false, 'the sales desk step signed none');
    await go(page, `/books/doc/${signedSale}`, 1500);
    const was = await page.$eval('[data-fmt][aria-pressed="true"]', (b) => b.dataset.fmt).catch(() => 'a4');
    const shows = (sel) => page.$eval(sel, (i) => i.complete && i.naturalWidth > 0 && i.src.startsWith('data:image/png')).catch(() => false);
    await page.click('[data-fmt=a4]');
    check('signature: the A4 paper shows it in the customer box', await shows('.i-foot .sign .sig-img'));
    await page.click('[data-fmt=std]');
    check('signature: the standard form shows it in the customer box', await shows('.sf-foot .sig-img'));
    check('signature: once signed, an owner is offered to replace it', /جایگزینی امضای مشتری/.test(await text(page, '.bk-head .actions')));
    await page.click(`[data-fmt=${was}]`);
  });

  if (!live) await step('coin showcase (spec 0041): real photos from this origin, the ring in RTL, drag, a card into the window and back, next follows, the alert pill, drift and its pause, reduced motion still', async () => {
    const outside = [];
    const watch = (r) => !r.url().startsWith(base) && !/^(data|blob):/.test(r.url()) && outside.push(r.url());
    page.on('request', watch);
    await go(page, '/coins/showcase', 2600);
    page.off('request', watch);
    const ring = () =>
      page.evaluate(() => {
        const s = document.querySelector('#csStage').getBoundingClientRect();
        const mid = s.left + s.width / 2;
        return [...document.querySelectorAll('.cs-card')].map((c) => {
          const r = c.getBoundingClientRect();
          return { k: +c.dataset.k, x: r.left + r.width / 2 - mid, copy: c.hasAttribute('aria-hidden') };
        });
      });
    const middle = async () => (await ring()).reduce((a, b) => (Math.abs(b.x) < Math.abs(a.x) ? b : a));
    // wait for the ring (a slow software-drawn page moves it in fewer frames); give back the last reading either way
    const until = async (read, ok, ms) => {
      const end = Date.now() + ms;
      let v = await read();
      while (!ok(v) && Date.now() < end) await page.waitForTimeout(150), (v = await read());
      return v;
    };
    // the carousel is the phone's second screen: bring it up at once (the page scrolls smoothly, and a click into a
    // moving page lands wherever the page has gone), then let the header settle
    const toStage = async () => {
      await page.evaluate(() => document.querySelector('#csStage').scrollIntoView({ block: 'center', behavior: 'instant' }));
      await page.waitForTimeout(700);
    };
    const cards = await ring();
    const imgs = await page.$$eval('.cs-face > .cs-coin', (x) => x.map((i) => i.getAttribute('src')));
    check('showcase: a hero, and both faces of the four coins as cards (copies fill the ring)', /از نزدیک/.test(await text(page, '#csTitle')) && cards.length >= 8 && cards.filter((c) => !c.copy).length === 8, `${cards.length} cards`);
    check('showcase: the small round photos, and nothing from outside this origin', imgs.every((s) => /^\/coins\/photos\/[a-z0-9]+-(obv|rev)-s\.webp$/.test(s)) && outside.length === 0, JSON.stringify({ img: imgs[0], outside }));
    const at0 = cards.find((c) => c.k === 0), at1 = cards.find((c) => c.k === 1);
    check('showcase: the first card rests in the middle and the next one is on the left (RTL)', Math.abs(at0.x) < 6 && at1.x < -100, JSON.stringify({ c0: Math.round(at0.x), c1: Math.round(at1.x) }));
    // drag a card's worth to the right and hold still before letting go (no throw): the ring follows the hand and
    // settles on the next card
    await toStage();
    const stage = await (await page.$('#csStage')).boundingBox();
    const y = stage.y + stage.height / 2;
    await page.mouse.move(stage.x + 40, y);
    await page.mouse.down();
    for (let i = 1; i <= 20; i++) await page.mouse.move(stage.x + 40 + i * 14, y, { steps: 1 });
    await page.waitForTimeout(150);
    await page.mouse.up();
    await page.mouse.move(2, 2);
    await page.waitForTimeout(1800);
    const after = await middle();
    check('showcase: a drag moves the ring and it settles exactly on another card', after.k !== 0 && Math.abs(after.x) < 2, JSON.stringify(after));
    // the middle card opens into the window: the coin's facts and its photo credit. A tap where the card is on the screen
    // (the browser's own hit test, as for a hand), not a locator click, which scrolls and re-tries around 3D elements
    const at = await page.$eval(`.cs-card[data-k="${after.k}"]`, (c) => { const r = c.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await page.mouse.click(at.x, at.y);
    await page.waitForSelector('.cs-box[role=dialog]', { timeout: 5000 });
    await page.waitForTimeout(900);
    const win = await text(page, '.cs-box');
    check('showcase: the window gives weight, fineness, diameter, today’s price and the photo credit', /گرم/.test(win) && /عیار ۹۰۰/.test(win) && /قطر/.test(win) && /CC BY-SA 4\.0/.test(win) && /مشاهده‌ی سه‌بعدی/.test(win), win.replace(/\s+/g, ' ').slice(0, 220));
    const kicker = await text(page, '.cs-kicker');
    await page.click('.cs-next');
    const now = await until(middle, (c) => c.k === (after.k + 1) % cards.length && Math.abs(c.x) < 2, 6000);
    check('showcase: «next» shows the next face and the ring behind follows', (await text(page, '.cs-kicker')) !== kicker && now.k === (after.k + 1) % cards.length && Math.abs(now.x) < 2, JSON.stringify({ kicker, now }));
    await page.keyboard.press('Escape');
    await page.waitForSelector('.cs-layer', { state: 'detached', timeout: 5000 }).catch(() => {});
    const focused = await page.evaluate(() => document.activeElement?.closest('.cs-card')?.dataset.k ?? document.activeElement?.id);
    check('showcase: Esc closes the window and focus lands on the card now in the middle', !(await page.$('.cs-layer')) && +focused === now.k, `focus on ${focused}`);
    // the alert pill: an alert for the coin in the middle, kept with the market page's own alerts
    const before = await page.evaluate(() => JSON.parse(localStorage.getItem('beatris.market.alerts') ?? '[]').length);
    await page.fill('#csAlert input', '۹۹۹٬۰۰۰٬۰۰۰');
    await page.press('#csAlert input', 'Enter');
    await page.waitForTimeout(300);
    const kept = await page.evaluate(() => JSON.parse(localStorage.getItem('beatris.market.alerts') ?? '[]'));
    check('showcase: «خبرم کن» keeps an alert for the coin in the middle', kept.length === before + 1 && ['sekee', 'sekeb', 'nim', 'rob'].includes(kept.at(-1).symbol) && kept.at(-1).price > 0, JSON.stringify(kept.at(-1)));
    await go(page, '/market', 2200);
    check('showcase: the market page lists that alert', (await page.$$eval('#alerts .ledger > div', (x) => x.length)) === kept.length);
    await page.evaluate((n) => localStorage.setItem('beatris.market.alerts', JSON.stringify(JSON.parse(localStorage.getItem('beatris.market.alerts')).slice(0, n))), before);
    // idle, it drifts on by itself; paused, it stays; under «حرکت کمتر» it never drifts
    await go(page, '/coins/showcase', 1500);
    await toStage();
    await page.mouse.move(2, 2);
    const pos = async () => (await ring()).find((c) => c.k === 0).x;
    const p0 = await pos();
    const p1 = await until(pos, (p) => Math.abs(p - p0) > 20, 12000);
    await page.click('#csPause');
    await page.mouse.move(2, 2);
    // paused, it settles on the nearest card, then stays
    const rest = await until(middle, (c) => Math.abs(c.x) < 1, 8000);
    const p2 = await pos();
    await page.waitForTimeout(3000);
    const p3 = await pos();
    check('showcase: idle, the ring drifts by itself; «توقف حرکت» stops it on a card', Math.abs(p1 - p0) > 20 && Math.abs(rest.x) < 1 && Math.abs(p3 - p2) < 1 && (await page.getAttribute('#csPause', 'aria-pressed')) === 'true', JSON.stringify({ p0, p1, rest, p2, p3 }));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await go(page, '/coins/showcase', 1500);
    const q0 = await pos();
    await page.waitForTimeout(4200);
    check('showcase: with «حرکت کمتر» the ring stands still', Math.abs((await pos()) - q0) < 1);
    await page.emulateMedia({ reducedMotion: null });
  });

  await step('light mode (روز): ivory page, white surfaces, no overflow on phone', async () => {
    await page.evaluate(() => localStorage.setItem('beatris.theme', 'day'));
    for (const p of ['/books/desk', '/books/day', '/books/parties', '/books/reports?tab=pnl', '/books/settings', '/books/dashboard', '/']) {
      await go(page, p, 1500);
      const st = await page.evaluate(() => ({ theme: document.documentElement.dataset.theme, bg: getComputedStyle(document.body).backgroundColor, ov: document.documentElement.scrollWidth - innerWidth }));
      check(`light ${p}: day theme applied, no horizontal overflow`, st.theme === 'day' && st.bg === 'rgb(247, 244, 239)' && st.ov <= 1, JSON.stringify(st));
    }
    await go(page, '/books/dashboard', 2000);
    await page.waitForSelector('.gd-kpi b');
    check('light dashboard: white cards, charcoal figures', await page.$eval('.gd-kpi', (k) => getComputedStyle(k).backgroundColor === 'rgb(255, 255, 255)' && getComputedStyle(k.querySelector('.gd-kpi-v b')).color === 'rgb(29, 26, 21)'));
    await page.click('#gdTheme');
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'calm', null, { timeout: 3000 }).catch(() => {}); // the switch is animated (spec 0012)
    check('light dashboard: theme toggle returns to dark and persists', await page.evaluate(() => document.documentElement.dataset.theme === 'calm' && localStorage.getItem('beatris.theme') === 'calm'));
  });
  // Every route on a phone and a desktop, in the light and the dark skin (spec 0039): no sideways scroll, and any
  // console error fails the run as everywhere. The phone in the dark skin has walked ROUTES above. Not opened here:
  // /login and /join (the sign-in steps, both widths), /exam/:id (the exam step: its 409 before the course is done is
  // by design), /s/:token, /verify/:code and /staff/:id, /books/bank/:id (each from its own step, with its own link).
  await step('every route at both widths in both skins (spec 0039): no sideways scroll, no console error', async () => {
    const token = await page.evaluate(() => localStorage.getItem('beatris.token'));
    const ids = await page.evaluate(async () => {
      const get = (p) => fetch(p, { headers: { authorization: `Bearer ${localStorage.getItem('beatris.token')}` } }).then((r) => r.json());
      const first = (x) => (Array.isArray(x) ? x : Object.values(x ?? {}).find(Array.isArray))?.[0]?.id;
      return { doc: first(await get('/api/books/docs')), party: first(await get('/api/books/parties')) };
    });
    const byId = [...(ids.doc ? [`/books/doc/${ids.doc}`, `/books/doc/${ids.doc}/edit`] : []), ...(ids.party ? [`/books/party/${ids.party}`] : [])];
    check('every route: a real document and a real customer to open', byId.length === 3, JSON.stringify(ids));
    const all = [...ROUTES, ...MORE_ROUTES, ...byId];
    const walks = [
      { width: 390, height: 844, theme: 'calm', routes: [...MORE_ROUTES, ...byId] },
      { width: 390, height: 844, theme: 'day', routes: all },
      { width: 1440, height: 900, theme: 'calm', routes: all },
      { width: 1440, height: 900, theme: 'day', routes: all },
    ];
    // the four walks run side by side; each closes its own window, and a walk that breaks fails the step
    const done = await Promise.allSettled(
      walks.map(async ({ theme, routes, ...viewport }) => {
        const w = await session(viewport);
        try {
          await w.ctx.addInitScript(([t, th]) => (localStorage.setItem('beatris.token', t), localStorage.setItem('beatris.theme', th)), [token, theme]);
          const wide = [];
          for (const p of routes) {
            await go(w.page, p, 1500);
            const st = await w.page.evaluate(() => ({ theme: document.documentElement.dataset.theme, ov: document.documentElement.scrollWidth - innerWidth }));
            if (st.ov > 1 || st.theme !== theme) wide.push(`${p} ${st.ov}px ${st.theme}`);
          }
          check(`every route, ${viewport.width} px, ${theme === 'day' ? 'light' : 'dark'} skin: ${routes.length} pages, none scrolls sideways`, wide.length === 0, wide.join(' · '));
        } finally {
          await w.ctx.close();
        }
      }),
    );
    const broke = done.find((d) => d.status === 'rejected');
    if (broke) throw broke.reason;
  });
  await ctx.close();
}

/* ======================================================= visual quality (spec 0025) */
// The software GPU here would be the «standard» tier; the checks pin «high», as a support call can with ?quality=high.
await step('visual quality (spec 0025): full density, the GPU\'s own MSAA, a supersampled still, dense charts', async () => {
  const open = async (opts) => {
    const ctx = await browser.newContext({ reducedMotion: 'reduce', ...opts });
    ctx.setDefaultTimeout(process.env.CI ? 120000 : 30000);
    await ctx.addInitScript(() => sessionStorage.setItem('beatris.quality', 'high'));
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`[quality] ${page.url()} pageerror: ${e.message}`));
    return { ctx, page };
  };
  const stage = (page) =>
    page
      .waitForFunction(() => {
        const c = document.querySelector('canvas[data-quality]');
        return c?.dataset.samples ? { tier: c.dataset.quality, samples: Number(c.dataset.samples), w: c.width, h: c.height, cw: c.clientWidth, ch: c.clientHeight } : null;
      }, null, { timeout: 60000 })
      .then((h) => h.jsonValue());
  for (const [label, opts, k] of [
    ['2× screen', { viewport: { width: 700, height: 900 }, deviceScaleFactor: 2 }, 2],
    ['3× phone', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, 3],
  ]) {
    const { ctx, page } = await open(opts);
    await page.goto(base + '/login');
    const c = await stage(page);
    check(`quality ${label}: the login coin's canvas is ${k}× its CSS size`, c.tier === 'high' && c.w === Math.round(c.cw * k) && c.h === Math.round(c.ch * k), JSON.stringify(c));
    check(`quality ${label}: MSAA samples are the GPU's own (2–4 here)`, c.samples >= 2 && c.samples <= 4, String(c.samples));
    // reduced motion keeps the coin still; the still frame is drawn again at twice the density each way
    const still = await page.waitForFunction(() => document.querySelector('canvas[data-quality]')?.dataset.scale === '2', null, { timeout: 120000 }).then(() => true, () => false);
    check(`quality ${label}: the still coin is redrawn with 2×2 supersampling`, still);
    await ctx.close();
  }
  const { ctx, page } = await open({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
  await loginUI(page);
  const session = await page.evaluate(() => localStorage.getItem('beatris.token'));
  await go(page, '/market', 2500);
  const charts = await page.$$eval('canvas', (cs) => cs.filter((c) => c.clientWidth > 0).map((c) => [c.width, c.clientWidth, c.height, c.clientHeight]));
  check('quality: market charts are drawn at 2× their CSS size', charts.length >= 2 && charts.every(([w, cw, h, ch]) => w === Math.round(cw * 2) && h === Math.round(ch * 2)), JSON.stringify(charts.slice(0, 3)));
  await go(page, '/books/elliott', 2500);
  const ew = await page.$eval('.ew-cv', (c) => [c.width, c.clientWidth]);
  check('quality: the Elliott chart is drawn at 2× its CSS size', ew[0] === Math.round(ew[1] * 2), JSON.stringify(ew));
  await ctx.close();
  // 8K (spec 0025, amendment 1): 1920×1080 CSS at 4× — charts at the screen's density, an 8K picture, no overflow
  const k8 = await open({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 4, acceptDownloads: true });
  // the same session (sign-in is tested above): the sign-in page's 3D coin at 4× on a software GPU is not what is measured
  await k8.ctx.addInitScript((t) => localStorage.setItem('beatris.token', t), session);
  await go(k8.page, '/market', 3000);
  const big = await k8.page.$$eval('canvas', (cs) => cs.filter((c) => c.clientWidth > 0).map((c) => [c.width, c.clientWidth, c.height, c.clientHeight]));
  // a chart's CSS height can be fractional (688.75 px is shown as 689): one CSS pixel of rounding is allowed
  check('8K: the market charts are drawn at 4× their CSS size (within the canvas area cap)', big.length >= 2 && big.every(([w, cw, h, ch]) => {
    const d = Math.min(4, Math.sqrt(16700000 / (cw * ch)));
    return Math.abs(w - cw * d) <= d && Math.abs(h - ch * d) <= d;
  }), JSON.stringify(big.filter(([w, cw, h, ch]) => Math.abs(w - cw * Math.min(4, Math.sqrt(16700000 / (cw * ch)))) > 1).slice(0, 3)));
  const [dl] = await Promise.all([k8.page.waitForEvent('download', { timeout: 30000 }), k8.page.click('#png')]);
  const png = await (await import('node:fs/promises')).readFile(await dl.path());
  check('8K: the chart picture is 7680 px wide, drawn at that size', png.readUInt32BE(16) === 7680 && png.readUInt32BE(20) > 1000, `${png.readUInt32BE(16)}×${png.readUInt32BE(20)}`);
  for (const p of ['/books/day', '/books/vault', '/books/reports?tab=pnl', '/books/events']) {
    await go(k8.page, p, 1500);
    const ov = await k8.page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    check(`8K ${p}: no horizontal overflow`, ov <= 1, `${ov}px`);
  }
  // the films (amendment 2): full HD, the phone chapter standing at 1080×2338, the exact H.264 named on the source
  // (a browser without H.264 plays the VP9 copy: the same size)
  const film = (nn) =>
    k8.page
      .waitForFunction((n) => {
        const v = document.querySelector('#hpVideo');
        return v?.currentSrc.includes(`/${n}.`) && v.videoWidth ? { w: v.videoWidth, h: v.videoHeight, type: document.querySelector('#hpMp4').type } : null;
      }, nn, { timeout: 30000 })
      .then((h) => h.jsonValue(), () => ({}));
  await go(k8.page, '/help?ch=1', 1500);
  const f1 = await film('01');
  check('films: chapter 1 is 1920×1080, its source names H.264 High level 4.0', f1.w === 1920 && f1.h === 1080 && f1.type?.includes('avc1.640028'), JSON.stringify(f1));
  await k8.page.click('#hpList [data-ch="12"]');
  const f12 = await film('12');
  check('films: the phone chapter is 1080×2338 standing, its source names level 5.0', f12.w === 1080 && f12.h === 2338 && f12.type?.includes('avc1.640032'), JSON.stringify(f12));
  // the teaser above the chapters («یک گرم، یک حساب», spec 0042): its file answers as a video, its picture is full HD
  check('teaser: the help centre lists «یک گرم، یک حساب»', /یک گرم، یک حساب/.test(await text(k8.page, '#hpTeaser summary')));
  const tz = await k8.page.evaluate(async () => {
    const r = await fetch('/media/promo/beatris-one-gram.mp4', { method: 'HEAD' });
    const v = document.querySelector('#hpTeaserV');
    v.preload = 'metadata';
    v.load();
    await new Promise((ok) => (v.readyState >= 1 ? ok() : v.addEventListener('loadedmetadata', ok, { once: true })));
    return { ok: r.ok, type: r.headers.get('content-type'), w: v.videoWidth, h: v.videoHeight, d: Math.round(v.duration) };
  });
  check('teaser: the film is a 30 s full-HD video/mp4', tz.ok && /video\/mp4/.test(tz.type ?? '') && tz.w === 1920 && tz.h === 1080 && tz.d === 30, JSON.stringify(tz));
  await k8.ctx.close();
});

/* ======================================================= motion (spec 0039) */
// One motion system: a dialog arrives the same way everywhere, nothing on a work page loops for its own sake, and
// «حرکت کمتر» settles every layer at once.
await step('motion (spec 0039): a dialog arrives, nothing loops on a work page, reduced motion settles every layer', async () => {
  const open = async (opts = {}) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, ...opts });
    ctx.setDefaultTimeout(process.env.CI ? 120000 : 30000);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`[motion] ${page.url()} pageerror: ${e.message}`));
    return { ctx, page };
  };
  const loops = (page) => page.evaluate(() => document.getAnimations().filter((a) => a.effect?.getTiming?.().iterations === Infinity && a.playState === 'running').map((a) => a.animationName || 'script'));
  // the app's own dialog, opened as any page opens it
  const dialog = (page) =>
    page.evaluate(async () => {
      const { confirmBox } = await import('/js/dialog.mjs');
      confirmBox('آزمون حرکت', 'این پنجره برای سنجش حرکت باز شده است.');
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const cs = getComputedStyle(document.querySelector('.modal > div'));
      return { name: cs.animationName, s: parseFloat(cs.animationDuration) };
    });
  const live = await open();
  await loginUI(live.page);
  const session = await live.page.evaluate(() => localStorage.getItem('beatris.token'));
  await go(live.page, '/work', 1800);
  const running = await loops(live.page);
  check('motion: on a work page only the living light loops (the crown coin turns on hover, not every six seconds)', running.every((n) => n === 'lt-breathe'), JSON.stringify(running));
  const d = await dialog(live.page);
  check('motion: a dialog rises out of a slight scale in panel time', d.name === 'u-dialog' && Math.abs(d.s - 0.32) < 0.001, JSON.stringify(d));
  await live.page.keyboard.press('Escape');
  await live.ctx.close();
  const still = await open({ reducedMotion: 'reduce' });
  await still.ctx.addInitScript((t) => localStorage.setItem('beatris.token', t), session);
  await go(still.page, '/work', 1500);
  const page = await still.page.$eval('#main > .page', (el) => parseFloat(getComputedStyle(el).animationDuration));
  const sd = await dialog(still.page);
  const stillLoops = await loops(still.page);
  check('motion: with «حرکت کمتر» the page and the dialog arrive at once and nothing loops', page <= 0.01 && sd.s <= 0.01 && stillLoops.length === 0, JSON.stringify({ page, dialog: sd, loops: stillLoops }));
  // the day book's rows arrive one after another (one stagger, spec 0039); with «حرکت کمتر» they are all there at once
  await go(still.page, '/books/day', 1500);
  const rows = await still.page.$$eval('.dy-e', (es) => es.map((e) => { const cs = getComputedStyle(e); return Math.max(...cs.animationDuration.split(',').map(parseFloat)) + Math.max(...cs.animationDelay.split(',').map(parseFloat)); }));
  check('motion: with «حرکت کمتر» a list arrives whole: every row of the day book is there at once', rows.length > 0 && rows.every((s) => s <= 0.01), JSON.stringify({ rows: rows.length, slowest: Math.max(0, ...rows) }));
  await still.ctx.close();
});

await browser.close();
if (server) {
  server.kill();
  rmSync(dataDir, { recursive: true, force: true });
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed, ${errors.length} browser errors`);
for (const e of [...new Set(errors)]) console.log('  ! ' + e);
process.exit(failed.length || errors.length ? 1 : 0);
