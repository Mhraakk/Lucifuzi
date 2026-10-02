// End-to-end browser test: boots a throw-away server (demo accounts, temp DB) and drives
// every page with Playwright. Any page error, console error or failed check fails the run.
//
//   npm run e2e                       # uses the globally installed playwright
//   PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs npm run e2e
//   E2E_BASE=https://... E2E_PHONE=... E2E_PIN=... npm run e2e   # smoke-test a live deploy (read-only checks)
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
let expectedError = null; // a console error a check provokes on purpose (e.g. a refused request)
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
    check(name, false, e.message.split('\n')[0]);
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
    if (/status of 401/.test(t) && page.url().includes('/login')) return; // the deliberate wrong-PIN attempt
    if (expectedError?.test(t)) return;
    errors.push(`[${label}] ${page.url()} console: ${t.slice(0, 240)}`);
  });
  page.on('response', (r) => {
    if (r.status() >= 500) errors.push(`[${label}] ${r.status()} ${r.url()}`);
  });
  return { ctx, page, label };
}
/** Answer the app's own confirm dialog (dialog.mjs) that `click` opens: the browser's dialogs are never used. */
const confirmApp = async (page, sel) => {
  await page.click(sel);
  await page.waitForSelector('.modal [data-ok]', { timeout: 5000 });
  await page.click('.modal [data-ok]');
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

async function loginUI(page) {
  await go(page, '/login', 800);
  await page.fill('input[name=login]', PHONE);
  await page.fill('input[name=password]', '0000');
  await page.click('button[type=submit]');
  await page.waitForTimeout(600);
  if (!live) check('login: wrong PIN shows an error', (await text(page, '#err')).length > 3);
  await page.fill('input[name=password]', PIN);
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
    await confirmApp(page, '[data-del]');
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
    await confirmApp(page, '#recent [data-del]');
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
    await confirmApp(page, '[data-mcp="off"]');
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
      const other = await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'username=a&password=b' });
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

  await step('account request: sign-in page → manager approves in the app → same device gets username and password', async () => {
    await go(page, '/staff', 1200);
    check('team page links to account requests', !!(await page.$('a[href="/staff/access"]')));
    await go(page, '/staff/access', 1200);
    const code = (await text(page, '#acCode')).trim();
    check('access: invite code with link and QR', /^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(code) && !!(await page.$('.ac-qr svg')), code);
    const pub = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const p3 = await pub.newPage();
    p3.on('pageerror', (e) => errors.push(`[join] pageerror: ${e.message}`));
    await p3.goto(base + '/login');
    await p3.waitForTimeout(1000);
    await p3.click('a[href="/join"]');
    await p3.waitForTimeout(800);
    await p3.fill('#jf input[name=code]', code.toLowerCase().replace('-', ''));
    await p3.waitForTimeout(900);
    check('join: the shop name appears for a right code', /فروشگاه:/.test(await text(p3, '#jshop')), await text(p3, '#jshop'));
    await p3.fill('#jf input[name=name]', 'ترانه آزمون');
    await p3.fill('#jf input[name=phone]', '۰۹۱۳۵۵۵۱۲۱۲');
    await p3.selectOption('#jf select[name=role]', 'trainer');
    await p3.fill('#jf input[name=username]', 'taraneh.test');
    await p3.click('#jf button[type=submit]');
    await p3.waitForTimeout(1200);
    check('join: request waits for the manager on this device', /در انتظار تأیید/.test(await text(p3, 'h1')));
    check('join: no sideways scroll on a phone', await p3.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await go(page, '/staff/access', 1200);
    const req = page.locator('.ac-req', { hasText: 'ترانه آزمون' });
    check('access: the request is listed with the wished username', (await req.locator('input[name=username]').inputValue()) === 'taraneh.test');
    await req.locator('button[type=submit]').click();
    await page.waitForTimeout(1200);
    check('access: approved, waiting for pickup on their device', /منتظر دریافت روی دستگاه/.test(await text(page, '#main')));
    await p3.click('[data-j=check]');
    await p3.waitForTimeout(1200);
    const pw = (await text(p3, '.vd-pw')).trim();
    check('join: the same device shows username and a fresh password once', /taraneh\.test/.test(await text(p3, '.join-cred')) && pw.length === 10, pw);
    await p3.click('[data-j=login]');
    await p3.waitForTimeout(1200);
    check('login form filled from the approved request', (await p3.inputValue('input[name=login]')) === 'taraneh.test' && (await p3.inputValue('input[name=password]')) === pw);
    await p3.click('button[type=submit]');
    await p3.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15000 }).catch(() => {});
    check('the new colleague signs in with that account', !new URL(p3.url()).pathname.startsWith('/login'), p3.url());
    await pub.close();
    await go(page, '/staff/access', 1200);
    check('access: shows the password was delivered', /تحویل شد/.test(await text(page, '#main')));
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
    await confirmApp(page, '[data-act=clear]');
    await page.waitForTimeout(200);
    check('quick entry: session ledger cleared', !(await page.$('#book tbody tr')));
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
      // goods in on account (no price): 50 g of 745 and a sealed bar with its serial
      await page.click('[data-mode=in]');
      await page.click('[data-kind=melt]');
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
      await page.fill('#stmt', `${jToday}, 500000000, 1234\n${jToday}, 200000000, 77`);
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
      await page.keyboard.press('Enter');
      await page.waitForTimeout(1500);
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
    const skinIs = (x) => page.waitForFunction((v) => document.documentElement.dataset.skin === v, x, { timeout: 3000 }).then(() => true, () => false);
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
    await page.click('#pm [data-pm=del]');
    await page.click('.modal [data-ok]');
    await page.waitForTimeout(600);
    await page.keyboard.press('Escape');
    await page.fill('[data-psearch]', 'زرنشان');
    await page.waitForTimeout(200);
    check('desk products: deleted product is gone', !(await text(page, '#dkPick')).includes('پلاک ز ۱'));
  });

  if (!live) await step('pos: card reader charge before booking (mock bridge), decline, settings, reconciliation', async () => {
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
    } finally {
      await page.evaluate(() => localStorage.removeItem('beatris.pos'));
      mock.close();
    }
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
    for (const p of ['/', '/learn', '/lesson/r5', '/tools', '/history', '/practice', '/coins', '/coins?mode=seal', '/coins?mode=real', '/coins/manage', '/tools/bayes', '/lesson/k4', '/lesson/k10', '/lesson/k11', '/learn/c-melt', '/lesson/h1', '/lesson/h2', '/lesson/h3', '/lesson/h4', '/lesson/h5', '/ledger', '/ledger?level=3', '/tools/melt', '/market', '/market?s=sekee&r=all', '/market/data', '/learn/c-market', '/lesson/mk1', '/lesson/mk6', '/intro', '/staff/leads', '/staff/settings', '/tools/inspect', '/books', '/books/new/sale', '/books/new/receipt', '/books/docs', '/books/stock', '/books/cash', '/books/parties', '/books/reports', '/books/settings', '/books/log', '/books/desk', '/books/day', '/books/vault', '/books/bars', '/books/reports?tab=pnl', '/books/audit', '/books/pulse', '/books/trace', '/books/memory', '/books/dashboard', '/books/products', '/books/ai', '/books/smart?t=close', '/books/smart?t=forecast', '/books/smart?t=risk', '/books/smart?t=bars', '/books/smart?t=quotes', '/vendor', '/books/peers', '/help', '/ops', '/books/control', '/books/control?t=exceptions', '/books/control?t=simulate', '/books/control?t=twin', '/books/control?t=lots', '/books/control?t=story', '/books/control?t=trial', '/books/control?t=forecast', '/books/control?t=approvals', '/books/control?t=periods', '/books/control?t=close', '/books/control?t=karat', '/books/elliott', '/market/elliott']) {
      await go(page, p, 1500);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      // name the widest offender so a failure is actionable
      const wide = overflow > 1 ? await page.evaluate(() => [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().left < -1 || e.getBoundingClientRect().right > innerWidth + 1).slice(-3).map((e) => `${e.tagName.toLowerCase()}.${[...e.classList].join('.')}`).join(' ')) : '';
      check(`mobile ${p}: no horizontal overflow`, overflow <= 1, `${overflow}px ${wide}`);
    }
    await go(page, '/studio', 6000);
    check('mobile studio: bottom sheet collapsed', !(await page.$eval('#panel', (p) => p.classList.contains('open'))));
    await page.click('[data-sheet]');
    await page.waitForTimeout(800);
    check('mobile studio: tap handle opens sheet', await page.$eval('#panel', (p) => p.classList.contains('open')));
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
