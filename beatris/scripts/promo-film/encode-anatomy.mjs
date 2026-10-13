// «کالبد یک دفتر طلا» (spec 0031): frames + music + sound effects → public/media/promo/beatris-anatomy.{mp4,webm,jpg}.
//   node scripts/promo-film/render.mjs anatomy 60          (frames and sfx.json in ./frames-anatomy)
//   FFMPEG=… MUSIC=nocturne.mp3 KIT=dir-of-sfx.py-output node scripts/promo-film/encode-anatomy.mjs
// The effects land where the page's clock put them (window.SFX → sfx.json); the music sits under them and the mix is
// brought to −14 LUFS with a true peak at or below −1.5 dBFS. The film is then measured: loudness, peak and frozen
// stretches (spec 0031's acceptance) — printed, and the run fails if any is out.
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(DIR, '..', '..');
const FF = process.env.FFMPEG ?? 'ffmpeg';
const MUSIC = process.env.MUSIC;
const KIT = process.env.KIT;
const FPS = 60, DUR = 30;
const frames = path.join(DIR, 'frames-anatomy');
const out = path.join(ROOT, 'public', 'media', 'promo');
if (!MUSIC || !KIT || !existsSync(path.join(frames, '00000.jpg'))) {
  console.error('needs MUSIC, KIT and the frames (render.mjs anatomy first)');
  process.exit(2);
}
const sfx = JSON.parse(readFileSync(path.join(frames, 'sfx.json'), 'utf8'));
const run = (args, quiet = true) => {
  const r = spawnSync(FF, ['-hide_banner', '-y', ...args], { encoding: 'utf8', maxBuffer: 1 << 26 });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${r.stderr.slice(-2000)}`);
  if (!quiet) process.stderr.write(r.stderr);
  return r.stderr;
};

// the mix: music under, every effect at its own time and level, one bus, mastered
const inputs = ['-framerate', String(FPS), '-i', path.join(frames, '%05d.jpg'), '-ss', '0', '-t', String(DUR + 1), '-i', MUSIC];
const parts = [`[1:a]aresample=48000,volume=-9dB,afade=t=in:st=0:d=1.2,afade=t=out:st=${DUR - 3.2}:d=3.2[m]`];
sfx.forEach((e, k) => {
  inputs.push('-i', path.join(KIT, `${e.kind}.wav`));
  const ms = Math.round(e.t * 1000);
  parts.push(`[${k + 2}:a]aresample=48000,highpass=f=160,lowpass=f=10000,volume=${e.gain}dB,adelay=${ms}|${ms}[s${k}]`);
});
parts.push(`[m]${sfx.map((_, k) => `[s${k}]`).join('')}amix=inputs=${sfx.length + 1}:normalize=0:duration=first,atrim=0:${DUR},highpass=f=35,acompressor=threshold=-20dB:ratio=2.5:attack=15:release=220:makeup=1.5,loudnorm=I=-14:TP=-1.6:LRA=9,alimiter=limit=0.83:level=false,aresample=48000[a]`);
const graph = parts.join(';');
const mp4 = path.join(out, 'beatris-anatomy.mp4'), webm = path.join(out, 'beatris-anatomy.webm'), jpg = path.join(out, 'beatris-anatomy.jpg');
run([...inputs, '-filter_complex', graph, '-map', '0:v', '-map', '[a]', '-c:v', 'libx264', '-preset', 'slow', '-profile:v', 'high', '-level:v', '4.2', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-c:a', 'aac', '-b:a', '224k', '-ar', '48000', '-movflags', '+faststart', '-t', String(DUR), mp4]);
run(['-i', mp4, '-c:v', 'libvpx-vp9', '-crf', '30', '-b:v', '0', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '3', '-c:a', 'libopus', '-b:a', '128k', webm]);
run(['-ss', '9.0', '-i', mp4, '-frames:v', '1', '-q:v', '2', jpg]);

// the measures of spec 0031
const ebu = run(['-nostats', '-i', mp4, '-filter_complex', 'ebur128=peak=true', '-f', 'null', '-']);
const I = Number(/I:\s+(-?[\d.]+) LUFS/.exec(ebu.slice(ebu.lastIndexOf('Summary')))?.[1]);
const TP = Number(/Peak:\s+(-?[\d.]+) dBFS/.exec(ebu.slice(ebu.lastIndexOf('True peak')))?.[1]);
const fz = run(['-i', mp4, '-vf', 'freezedetect=n=-60dB:d=0.6', '-map', '0:v', '-f', 'null', '-']);
const freezes = [...fz.matchAll(/freeze_start: ([\d.]+)[\s\S]*?freeze_duration: ([\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]).filter(([s]) => s < 27.6);
const probe = spawnSync(path.join(path.dirname(FF), 'ffprobe'), ['-v', 'error', '-show_entries', 'stream=codec_name,width,height,r_frame_rate,profile:format=duration', '-of', 'json', mp4], { encoding: 'utf8' });
console.log(JSON.stringify({ mp4: `${(statSync(mp4).size / 1e6).toFixed(1)} MB`, webm: `${(statSync(webm).size / 1e6).toFixed(1)} MB`, lufs: I, truePeak: TP, freezes, probe: probe.status === 0 ? JSON.parse(probe.stdout) : 'no ffprobe' }, null, 1));
if (!(I >= -15 && I <= -13) || !(TP <= -1.4) || freezes.length) process.exitCode = 1;
