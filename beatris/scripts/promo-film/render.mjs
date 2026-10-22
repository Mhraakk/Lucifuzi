// تیزر و اینفوگرافیک بئاتریس — deterministic motion: every frame of teaser.html is seek(t), so a render is repeatable.
//   node scripts/promo-film/render.mjs teaser [fps=60]   → frames in ./frames, then encode with ffmpeg (see README.md)
//   node scripts/promo-film/render.mjs prism [fps=60] [from] [to] → «منشور» frames in ./frames-prism (served over http so
//                                                         the app's own modules — Elliott engine, thinking orb — load)
//   node scripts/promo-film/render.mjs anatomy [fps=60]    → «کالبد یک دفتر طلا» (spec 0031) frames in ./frames-anatomy;
//   node scripts/promo-film/render.mjs anatomy --check     → a frame reached by two seek paths must be the same picture
//                                                         (raster rounding of ±2/255 at most)
//   node scripts/promo-film/render.mjs anatomy --stills=3.5,7,26.5 [--out=dir] → PNG stills for a review round
//   node scripts/promo-film/render.mjs dream [fps|--check|--stills=…] → «رؤیای طلایی» (dream.mjs writes dream.html) the same way
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { serveRoot } from './serve.mjs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const pw = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs').catch(() => import('playwright'));
const { chromium } = pw.default ?? pw;
const what = process.argv[2] ?? 'teaser';
const b = await chromium.launch();
if (what === 'prism') {
  const srv = await serveRoot();
  const fps = Number(process.argv[3] ?? 60);
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  p.on('pageerror', (e) => console.error('page error:', e.message));
  await p.goto(`${srv.url}/scripts/promo-film/prism.html`);
  await p.waitForFunction(() => window.READY === true);
  const frames = path.join(DIR, 'frames-prism');
  const dur = await p.evaluate(() => window.DUR);
  const from = Number(process.argv[4] ?? 0), to = Number(process.argv[5] ?? dur);
  if (!process.argv[4]) rmSync(frames, { recursive: true, force: true });
  mkdirSync(frames, { recursive: true });
  for (let i = Math.round(from * fps); i < Math.round(to * fps); i++) {
    await p.evaluate((t) => window.seek(t), i / fps);
    await p.screenshot({ path: path.join(frames, `${String(i).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 94 });
  }
  console.log(`frames ${from}–${to}s in ${frames}`);
  srv.close();
} else if (what === 'anatomy' || what === 'dream') {
  const srv = await serveRoot();
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  p.on('pageerror', (e) => console.error('page error:', e.message));
  await p.goto(`${srv.url}/scripts/promo-film/${what}.html`);
  await p.waitForFunction(() => window.READY === true, null, { timeout: 60000 });
  if (process.argv.includes('--check')) {
    // the clock is the only clock: a frame reached from anywhere is the same picture
    const shot = async (t) => (await p.evaluate((x) => window.seek(x), t), await p.screenshot({ type: 'png' }));
    // Chromium may re-raster a scaled layer at another scale when it is reached by another path: a level or two of
    // rounding (≤ 2/255) is that, not a clock that leaked; anything more is a real difference
    const cmp = await b.newPage();
    const diff = (x, y) => cmp.evaluate(async ([u, v]) => {
      const load = (s) => new Promise((ok, no) => Object.assign(new Image(), { onload() { ok(this); }, onerror: no, src: `data:image/png;base64,${s}` }));
      const px = (img) => {
        const c = new OffscreenCanvas(img.width, img.height).getContext('2d');
        c.drawImage(img, 0, 0);
        return c.getImageData(0, 0, img.width, img.height).data;
      };
      const [a, b] = (await Promise.all([load(u), load(v)])).map(px);
      let n = 0, m = 0;
      for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) (n++, (m = Math.max(m, Math.abs(a[k] - b[k]))));
      return { n, m };
    }, [x.toString('base64'), y.toString('base64')]);
    const pairs = [];
    for (const t of [3.1, 9.0, 15.2, 19.0, 23.9, 28.9]) {
      const a = await shot(t);
      await shot(t > 10 ? 1.7 : 26.3);
      const c = await shot(t);
      pairs.push([t, a.equals(c) ? { n: 0, m: 0 } : await diff(a, c)]);
    }
    console.log(pairs.map(([t, d]) => `${t}s ${!d.n ? 'same' : d.m <= 2 ? `same within ±${d.m} (${d.n} values)` : `DIFFERENT (±${d.m}, ${d.n} values)`}`).join(' · '));
    if (!pairs.every(([, d]) => d.m <= 2)) process.exitCode = 1;
  } else if (process.argv.some((a) => a.startsWith('--stills='))) {
    // stills for a review round: --stills=3.5,7,26.5 [--out=dir] writes one PNG per time
    const opt = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
    const out = path.resolve(opt('out') ?? path.join(DIR, `stills-${what}`));
    mkdirSync(out, { recursive: true });
    for (const t of opt('stills').split(',').map(Number)) {
      await p.evaluate((x) => window.seek(x), t);
      await p.screenshot({ path: path.join(out, `t${t.toFixed(2)}.png`), type: 'png' });
    }
    console.log(`stills in ${out}`);
  } else {
    const fps = Number(process.argv[3] ?? 60);
    const frames = path.join(DIR, `frames-${what}`);
    rmSync(frames, { recursive: true, force: true });
    mkdirSync(frames, { recursive: true });
    const dur = await p.evaluate(() => window.DUR);
    for (let i = 0; i < Math.round(dur * fps); i++) {
      await p.evaluate((t) => window.seek(t), i / fps);
      await p.screenshot({ path: path.join(frames, `${String(i).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 95 });
    }
    writeFileSync(path.join(frames, 'sfx.json'), JSON.stringify(await p.evaluate(() => window.SFX)));
    console.log(`${Math.round(dur * fps)} frames in ${frames}`);
  }
  srv.close();
} else {
  const fps = Number(process.argv[3] ?? 60);
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  await p.goto(pathToFileURL(path.join(DIR, 'teaser.html')).href);
  await p.evaluate(() => document.fonts.ready);
  const frames = path.join(DIR, 'frames');
  rmSync(frames, { recursive: true, force: true });
  mkdirSync(frames, { recursive: true });
  const n = Math.round((await p.evaluate(() => window.DUR)) * fps);
  for (let i = 0; i < n; i++) {
    await p.evaluate((t) => window.seek(t), i / fps);
    await p.screenshot({ path: path.join(frames, `${String(i).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 94 });
  }
  console.log(`${n} frames in ${frames}`);
}
await b.close();
