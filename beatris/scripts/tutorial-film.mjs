// Tutorial films (the business-motion-film way): each recorded chapter gets a deterministic opening card (the beam,
// the gem, the spectrum, the chapter), a spectral wipe into the screen recording, and an end card that names the next
// chapter. Chapter 18 also gets the Elliott + Fibonacci explainer from the «منشور» teaser. The sound is mixed and
// mastered here: the nocturne, a soft whoosh on every cut and a shimmer under each card, then gentle compression and
// loudness normalisation, so every chapter plays at the same level.
//   FFMPEG=… MUSIC=…/nocturne.mp3 KIT=…/kit node scripts/tutorial-film.mjs [--only=3,18]
// Inputs: the master recordings scripts/tutorial.mjs (FILM=1) leaves in RAW (default /tmp/beatris-tutorial-raw/NN.mp4,
// picture only, nearly lossless), so a film can be rebuilt without recording again. Everything is drawn at the
// chapter's own size (1920×1080, or 1080×2338 standing) and encoded once for the page (spec 0025 §5).
// KIT holds whoosh.wav and shimmer.wav from `python3 scripts/promo-film/sfx.py --kit KIT`.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveRoot } from './promo-film/serve.mjs';
import { h264, vp9, avc1 } from './screencast.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'media', 'tutorial');
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const MUSIC = process.env.MUSIC;
const KIT = process.env.KIT;
const RAW = process.env.RAW || '/tmp/beatris-tutorial-raw';
const PRISM = path.join(ROOT, 'scripts', 'promo-film', 'frames-prism'); // 60 fps frames of the teaser, if rendered
const only = (process.argv.find((a) => a.startsWith('--only='))?.slice(7) ?? '').split(',').filter(Boolean).map(Number);
if (!MUSIC || !KIT) throw new Error('MUSIC=…/nocturne.mp3 and KIT=…/kit are required');

const FPS = 25, XF = 0.5; // crossfade length at every cut (the wipe is inside the card)
const ff = (...a) => execFileSync(FFMPEG, ['-y', '-loglevel', 'error', ...a]);
const duration = (file) => {
  let out = '';
  try {
    execFileSync(FFMPEG, ['-i', file], { stdio: ['ignore', 'ignore', 'pipe'] });
  } catch (e) {
    out = String(e.stderr);
  }
  const m = /Duration: (\d+):(\d+):([\d.]+)/.exec(out);
  return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : 0;
};
const size = (file) => {
  let out = '';
  try {
    execFileSync(FFMPEG, ['-i', file], { stdio: ['ignore', 'ignore', 'pipe'] });
  } catch (e) {
    out = String(e.stderr);
  }
  const m = /Video:.*?(\d{3,4})x(\d{3,4})/.exec(out);
  return { w: +m[1], h: +m[2] };
};

const pw = await import(process.env.PLAYWRIGHT ?? '/opt/node22/lib/node_modules/playwright/index.mjs');
const { chromium } = pw.default ?? pw;
const listFile = path.join(OUT, 'chapters.json');
const list = JSON.parse(readFileSync(listFile, 'utf8'));
const srv = await serveRoot();
const browser = await chromium.launch();
// cards are drawn at the chapter's own density (1920×1080, or 1080×2337 standing), never enlarged (spec 0025)
const DSF = 1.5;
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: DSF });
const tmp = path.join(RAW, 'work');
mkdirSync(tmp, { recursive: true });

/** Render card.html (open or end) to an mp4 the size of the chapter (a phone chapter gets the standing card). The page
 *  is drawn at 1.5× (1920×1080, or 1080×2337 standing), so nothing is enlarged; a frame a pixel short is padded. */
async function card(params, file, { w, h }) {
  const vertical = w < h; // a phone chapter gets the standing card, filled to its frame
  const vp = vertical ? { width: 720, height: 1558 } : { width: 1280, height: 720 };
  await page.setViewportSize(vp);
  await page.goto(`${srv.url}/scripts/promo-film/card.html?${new URLSearchParams({ ...params, ...(vertical ? { v: '1' } : {}) })}`);
  await page.waitForFunction(() => window.READY === true);
  const dur = await page.evaluate(() => window.DUR);
  const dir = path.join(tmp, 'card');
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  for (let i = 0; i < Math.round(dur * FPS); i++) {
    await page.evaluate((t) => window.seek(t), i / FPS);
    await page.screenshot({ path: path.join(dir, `${String(i).padStart(4, '0')}.png`), type: 'png' });
  }
  const drawn = { w: Math.round(vp.width * DSF), h: Math.round(vp.height * DSF) };
  const fit = Math.abs(drawn.w - w) <= 2 && Math.abs(drawn.h - h) <= 2 ? `pad=${w}:${h}:0:0:0x07080a,crop=${w}:${h}:0:0` : `scale=${w}:${h}:force_original_aspect_ratio=increase:flags=lanczos,crop=${w}:${h}`;
  ff('-framerate', String(FPS), '-i', path.join(dir, '%04d.png'), '-vf', `${fit},format=yuv420p`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '12', '-r', String(FPS), file);
  return dur;
}

/** The Elliott + Fibonacci explainer: the teaser's analysis beat (5.6 s → 16.4 s), at the chapter's size and rate. */
function explainer(file, { w, h }) {
  if (!existsSync(path.join(PRISM, '00336.jpg'))) throw new Error('render the teaser first: node scripts/promo-film/render.mjs prism 60');
  ff('-framerate', '60', '-start_number', '336', '-i', path.join(PRISM, '%05d.jpg'), '-frames:v', String(Math.round((16.4 - 5.6) * 60)), '-vf', `fps=${FPS},scale=${w}:${h}:flags=lanczos,format=yuv420p`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '12', file);
  return 16.4 - 5.6;
}

for (const ch of list.chapters) {
  if (only.length && !only.includes(ch.n)) continue;
  const nn = String(ch.n).padStart(2, '0');
  const mp4 = path.join(OUT, `${nn}.mp4`);
  const raw = path.join(RAW, `${nn}.mp4`);
  // the master from scripts/tutorial.mjs; a chapter recorded the older way (straight into the page's folder) is used as
  // it is, but a finished film is never taken for a recording (it would get its cards twice)
  if (!existsSync(raw)) {
    if (ch.film) throw new Error(`chapter ${ch.n}: no recording in ${RAW} — record it first: FILM=1 node scripts/tutorial.mjs --only=${ch.n}`);
    copyFileSync(mp4, raw);
  }
  const dim = size(raw);
  const next = list.chapters.find((c) => c.n === ch.n + 1);
  const parts = [];
  parts.push({ file: path.join(tmp, 'open.mp4'), dur: await card({ kind: 'open', n: ch.n, title: ch.title, sub: ch.sub }, path.join(tmp, 'open.mp4'), dim) });
  if (ch.slug === 'elliott') parts.push({ file: path.join(tmp, 'explain.mp4'), dur: explainer(path.join(tmp, 'explain.mp4'), dim), shimmer: true });
  // the recording itself, straight from the master (no extra generation); every part is set to 25 fps in the graph
  parts.push({ file: raw, dur: duration(raw) });
  parts.push({ file: path.join(tmp, 'end.mp4'), dur: await card({ kind: 'end', n: ch.n, next: next?.title ?? '' }, path.join(tmp, 'end.mp4'), dim) });

  // picture: crossfade every cut
  const inputs = parts.flatMap((p) => ['-i', p.file]);
  let chain = parts.map((p, k) => `[${k}:v]fps=${FPS},format=yuv420p,setsar=1[p${k}];`).join(''), last = '[p0]', t = 0;
  const cuts = [];
  for (let k = 1; k < parts.length; k++) {
    t += parts[k - 1].dur - XF;
    cuts.push(t);
    const out = k === parts.length - 1 ? '[v]' : `[x${k}]`;
    chain += `${last}[p${k}]xfade=transition=fade:duration=${XF}:offset=${t.toFixed(3)}${out};`;
    last = out;
  }
  const total = t + parts.at(-1).dur;
  // sound: the nocturne, a whoosh on each cut, a shimmer as each card opens; then the master chain
  const n = parts.length;
  const sfx = [`[${n}:a]volume=-15dB,afade=t=in:st=0:d=1.2,afade=t=out:st=${(total - 3).toFixed(2)}:d=3[m]`];
  const mixIn = ['[m]'];
  const add = (idx, at, gain, label) => {
    sfx.push(`[${idx}:a]adelay=${Math.round(at * 1000)}|${Math.round(at * 1000)},volume=${gain}[${label}]`);
    mixIn.push(`[${label}]`);
  };
  const audio = ['-stream_loop', '-1', '-i', MUSIC];
  const kit = (f) => audio.push('-i', path.join(KIT, f));
  kit('shimmer.wav'); add(n + 1, 0.85, 0.5, 's0');
  cuts.forEach((c, k) => { kit('whoosh.wav'); add(n + 2 + k, Math.max(0, c - 0.35), 0.45, `w${k}`); });
  kit('shimmer.wav'); add(n + 2 + cuts.length, cuts.at(-1) + 0.6, 0.35, 's1');
  const master = `${mixIn.join('')}amix=inputs=${mixIn.length}:normalize=0,highpass=f=40,acompressor=threshold=-24dB:ratio=2.5:attack=20:release=250:makeup=2,loudnorm=I=-18:TP=-1.5:LRA=9,aresample=48000[a]`;
  const film = path.join(tmp, 'film.mp4');
  const frame = { width: dim.w, height: dim.h };
  ff(...inputs, ...audio, '-filter_complex', `${chain}${sfx.join(';')};${master}`, '-map', '[v]', '-map', '[a]', '-t', total.toFixed(2), ...h264(frame), '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', film);
  copyFileSync(film, mp4);
  ff('-i', mp4, ...vp9, '-c:a', 'libopus', '-b:a', '128k', mp4.replace(/\.mp4$/, '.webm'));
  ff('-ss', '2.6', '-i', mp4, '-frames:v', '1', '-q:v', '2', path.join(OUT, `${nn}.jpg`)); // the poster is the opening card
  const made = size(mp4);
  Object.assign(ch, { seconds: Math.round(total), bytes: statSync(mp4).size, width: made.w, height: made.h, codec: avc1({ width: made.w, height: made.h }), film: true });
  writeFileSync(listFile, JSON.stringify({ ...list, made: new Date().toISOString() }, null, 1));
  console.log(`film ${nn} ${ch.title}: ${total.toFixed(1)} s, ${made.w}×${made.h}, ${(ch.bytes / 1e6).toFixed(1)} MB`);
}
await browser.close();
srv.close();
rmSync(tmp, { recursive: true, force: true });
