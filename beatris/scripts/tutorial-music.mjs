// Background music for the tutorial chapters: Chopin, Nocturne in G major Op. 37 No. 2, played by Olga Gurevich
// (Musopen, CC0 — https://archive.org/details/parso-1c53a71e4ef6f47591ab605d801bc3780b27824a). Each chapter gets the
// nocturne from its start, soft (−14 dB), faded in over 1.5 s and out over the last 3 s. The picture is copied as is.
//   MUSIC=/path/to/nocturne.mp3 FFMPEG=/path/to/ffmpeg node scripts/tutorial-music.mjs
import { execFileSync } from 'node:child_process';
import { readdirSync, renameSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'public', 'media', 'tutorial');
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const MUSIC = process.env.MUSIC;

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

export function addMusic(mp4) {
  if (!MUSIC || !existsSync(MUSIC)) throw new Error('MUSIC=/path/to/nocturne.mp3 is required');
  const d = duration(mp4);
  if (!d) throw new Error(`no duration: ${mp4}`);
  const fade = `volume=-14dB,afade=t=in:st=0:d=1.5,afade=t=out:st=${Math.max(0, d - 3).toFixed(2)}:d=3`;
  const tmp = mp4.replace(/\.mp4$/, '.tmp.mp4');
  // video stream only from the chapter (re-runs never stack music), the nocturne looped if a chapter is longer
  execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-i', mp4, '-stream_loop', '-1', '-i', MUSIC, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-af', fade, '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-t', d.toFixed(2), '-movflags', '+faststart', tmp]);
  renameSync(tmp, mp4);
  const webm = mp4.replace(/\.mp4$/, '.webm');
  if (existsSync(webm)) {
    const tw = webm.replace(/\.webm$/, '.tmp.webm');
    execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-i', webm, '-i', mp4, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'libopus', '-b:a', '96k', '-t', d.toFixed(2), tw]);
    renameSync(tw, webm);
  }
  return d;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const f of readdirSync(DIR).filter((x) => /^\d+\.mp4$/.test(x)).sort()) {
    const d = addMusic(path.join(DIR, f));
    console.log(`♪ ${f} (${d.toFixed(1)} s)`);
  }
}
