// spec 0047: records one story film. The page draws a frame from the time alone (window.seek(t)); this steps through
// every frame in a headless browser and pipes JPEG frames into ffmpeg. The sound is laid separately by mix.mjs.
//   node scripts/promo-film/stories/render.mjs <counter|capacity|control|live|gold> [--fps=60] [--out=<picture.mp4>]
//     → the picture, and next to it <picture>.json with the film's length, sound cues and music edit (for mix.mjs)
//   node scripts/promo-film/stories/render.mjs <film> --stills=0.5,4,9 [--out=<dir>]   → PNG stills for a review round
//   node scripts/promo-film/stories/render.mjs <film> --sheet [--out=<sheet.jpg>]      → a contact sheet, a frame a second
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveRoot } from '../serve.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const film = process.argv[2];
if (!['counter', 'capacity', 'control', 'live', 'gold'].includes(film)) throw new Error('usage: render.mjs <counter|capacity|control|live|gold> [--fps=60] [--out=…] [--stills=…] [--sheet]');
const opt = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const FPS = Number(opt('fps') ?? 60);
const pw = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs').catch(() => import('playwright'));
const { chromium } = pw.default ?? pw;

const srv = await serveRoot();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(`${srv.url}/scripts/promo-film/stories/${film}.html`);
await page.waitForFunction(() => window.READY === true, null, { timeout: 60000 });
const DUR = await page.evaluate(() => window.DUR);
const seek = (t) => page.evaluate((x) => window.seek(x), t);

try {
  if (opt('stills')) {
    const out = opt('out') ?? path.join(HERE, 'out', `${film}-stills`);
    mkdirSync(out, { recursive: true });
    for (const t of opt('stills').split(',').map(Number)) {
      await seek(t);
      await page.screenshot({ path: path.join(out, `${film}-${t.toFixed(2)}.png`) });
    }
    console.log('stills in', out);
  } else if (process.argv.includes('--sheet')) {
    const out = opt('out') ?? path.join(HERE, 'out', `${film}-sheet.jpg`);
    mkdirSync(path.dirname(out), { recursive: true });
    const n = Math.floor(DUR);
    const ff = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'image2pipe', '-c:v', 'mjpeg', '-i', '-', '-vf', `scale=480:-1,tile=6x${Math.ceil(n / 6)}:padding=4:color=white`, '-frames:v', '1', out], { stdio: ['pipe', 'inherit', 'inherit'] });
    for (let i = 0; i < n; i++) {
      await seek(i + 0.5);
      ff.stdin.write(await page.screenshot({ type: 'jpeg', quality: 80 }));
    }
    ff.stdin.end();
    await new Promise((r) => ff.on('close', r));
    console.log('sheet', out);
  } else {
    const out = opt('out') ?? path.join(HERE, 'out', `${film}-picture.mp4`);
    mkdirSync(path.dirname(out), { recursive: true });
    const ff = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
    const N = Math.round(DUR * FPS);
    const t0 = Date.now();
    for (let i = 0; i < N; i++) {
      await seek(i / FPS);
      const buf = await page.screenshot({ type: 'jpeg', quality: 95 });
      if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
      if (i % 300 === 0) console.log(`… ${i}/${N} frames, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    }
    ff.stdin.end();
    await new Promise((r) => ff.on('close', r));
    const meta = await page.evaluate(() => ({ DUR: window.DUR, EV: window.EV ?? [], MUSIC: window.MUSIC ?? null }));
    writeFileSync(out.replace(/\.mp4$/, '.json'), `${JSON.stringify(meta, null, 1)}\n`);
    console.log(`picture ${out}: ${N} frames at ${FPS} fps, ${DUR.toFixed(2)} s; ${meta.EV.length} sound cues`);
  }
} finally {
  await browser.close();
  srv.close();
}
if (errors.length) {
  console.error('page errors:', errors.slice(0, 5));
  process.exit(1);
}
