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
const go = async (page, p, wait = 1200) => {
  await page.goto(base + p);
  await page.waitForTimeout(wait);
};
const text = (page, sel) => page.$eval(sel, (e) => e.innerText).catch(() => '');
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
    page.once('dialog', (d) => d.accept());
    await page.click('[data-del]');
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
    check('coin lab: genuine full coin weighs ≈8.13 g', /۸٫۱۳/.test(w), w.split('\n')[0]);
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
    page.once('dialog', (d) => d.accept());
    await page.click('#recent [data-del]');
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
    page.once('dialog', (d) => d.accept());
    await page.click('[data-mcp="off"]');
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
    check('intro: slides, ticker, 9 features, 3 packages, no invented prices', (await p2.$$eval('.lux-slide', (x) => x.length)) === 4 && (await p2.$$eval('.lux-ticker .tk', (x) => x.length)) >= 8 && (await p2.$$eval('.intro-feat', (x) => x.length)) === 9 && (await p2.$$eval('.intro-pack', (x) => x.length)) === 3 && !/تومان/.test(await text(p2, '.intro')));
    await p2.click('.intro-pack.hi a');
    await p2.fill('#lf input[name=name]', 'مریم کاظمی');
    await p2.fill('#lf input[name=shop]', 'گالری آزمون خودکار');
    await p2.fill('#lf input[name=city]', 'اصفهان');
    await p2.fill('#lf input[name=phone]', '۰۹۱۳۱۲۳۴۵۶۷');
    await p2.click('#lf button[type=submit]');
    await p2.waitForTimeout(1200);
    check('intro: demo request accepted', /ثبت شد/.test(await text(p2, '#lmsg')));
    await pub.close();
    await go(page, '/staff/leads', 1500);
    check('owner sees the demo request with the chosen package', /گالری آزمون خودکار/.test(await text(page, '#main')) && /حرفه‌ای/.test(await text(page, '#main')));
    await page.click('[data-status="contacted"]');
    await page.waitForTimeout(800);
    check('owner marks the request as contacted', (await page.$eval('[data-status="contacted"]', (b) => b.getAttribute('aria-pressed'))) === 'true');
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
    page.once('dialog', (d) => d.accept());
    await page.click('[data-act=clear]');
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
      // edit with a reason → version 2; rounding lands on a round thousand toman
      await page.click('a:has-text("ویرایش")');
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
      check('books: edit makes version 2 and the total is round', v2.version === 2 && v2.calc.sales % 10000 === 0 && v2.versions[0].reason === 'گرد کردن مبلغ', `${v2.version} ${v2.calc.sales}`);
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
      await go(page, '/books/desk', 1500);
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
    for (const p of ['/', '/learn', '/lesson/r5', '/tools', '/history', '/practice', '/coins', '/coins?mode=seal', '/coins?mode=real', '/coins/manage', '/tools/bayes', '/lesson/k4', '/lesson/k10', '/lesson/k11', '/learn/c-melt', '/lesson/h1', '/lesson/h2', '/lesson/h3', '/lesson/h4', '/lesson/h5', '/ledger', '/ledger?level=3', '/tools/melt', '/market', '/market?s=sekee&r=all', '/market/data', '/learn/c-market', '/lesson/mk1', '/lesson/mk6', '/intro', '/staff/leads', '/staff/settings', '/tools/inspect', '/books', '/books/new/sale', '/books/new/receipt', '/books/docs', '/books/stock', '/books/cash', '/books/parties', '/books/reports', '/books/settings', '/books/log', '/books/desk', '/books/day', '/books/vault', '/books/bars', '/books/reports?tab=pnl', '/books/audit', '/books/pulse', '/books/trace', '/books/memory', '/books/dashboard', '/books/products', '/books/ai', '/books/smart?t=close', '/books/smart?t=forecast', '/books/smart?t=risk', '/books/smart?t=bars', '/books/smart?t=quotes', '/vendor', '/books/peers', '/help', '/ops', '/books/control', '/books/control?t=exceptions', '/books/control?t=simulate', '/books/control?t=twin', '/books/control?t=lots', '/books/control?t=story', '/books/control?t=trial', '/books/control?t=forecast', '/books/control?t=approvals', '/books/control?t=periods', '/books/control?t=close', '/books/control?t=karat']) {
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
