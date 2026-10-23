// Stages the «یک گرم، یک حساب» composition into an OpenMontage project's HyperFrames workspace:
//   OM=<OpenMontage checkout> GSAP=<gsap.min.js> MUSIC=<music-edit.wav> node scripts/promo-film/one-gram/stage.mjs
// → $OM/projects/beatris-one-gram/hyperframes/{index.html, assets/…}. Screens come from shots-gram/ (app-shots.mjs and
// showcase-shots.mjs with --out=shots-gram), coins from public/coins/photos, fonts from public/fonts, the effects from
// HyperFrames' bundled library inside OpenMontage (Pixabay Content License). GSAP and the music stay out of this repo.
import { cpSync, mkdirSync, existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const OM = process.env.OM ?? '/home/user/calesthio/openmontage';
const WS = path.join(OM, 'projects/beatris-one-gram/hyperframes');
const need = (p, what) => {
  if (!p || !existsSync(p)) throw new Error(`${what}: not found (${p ?? 'unset'})`);
  return p;
};
const GSAP = need(process.env.GSAP, 'GSAP (gsap.min.js, npm pack gsap@3.13.0)');
const MUSIC = need(process.env.MUSIC ?? path.join(OM, 'projects/beatris-one-gram/assets/music/music-edit.wav'), 'MUSIC (the 30 s edit)');
const SHOTS = path.join(ROOT, 'scripts/promo-film/shots-gram');
const SFX = path.join(OM, '.agents/skills/hyperframes-media/assets/sfx');

for (const d of ['assets/js', 'assets/fonts', 'assets/img', 'assets/audio']) mkdirSync(path.join(WS, d), { recursive: true });
cpSync(path.join(HERE, 'index.html'), path.join(WS, 'index.html'));
cpSync(GSAP, path.join(WS, 'assets/js/gsap.min.js'));
for (const f of ['markazi-arabic-400', 'markazi-arabic-600', 'markazi-arabic-700', 'markazi-latin-600', 'estedad-arabic-var', 'estedad-latin-var'])
  cpSync(path.join(ROOT, 'public/fonts', `${f}.woff2`), path.join(WS, 'assets/fonts', `${f}.woff2`));
for (const f of ['showcase-window', 'sell', 'receipt', 'daybook', 'market', 'coinlab', 'dashboard', 'work-seller', 'work-boss'])
  cpSync(need(path.join(SHOTS, `${f}.jpg`), `screen ${f}`), path.join(WS, 'assets/img', `${f}.jpg`));
const COINS = { bahar: 'bahar1358', emami: 'emami1370', half: 'halfold1358', quarter: 'quarterold1370' };
for (const [k, v] of Object.entries(COINS))
  for (const side of ['obv', 'rev']) cpSync(path.join(ROOT, 'public/coins/photos', `${v}-${side}-s.webp`), path.join(WS, 'assets/img', `${k}-${side}.webp`));
cpSync(MUSIC, path.join(WS, 'assets/audio/music-edit.wav'));
for (const f of ['sparkle', 'pop', 'whoosh-short', 'click-soft', 'chime', 'typing']) cpSync(path.join(SFX, `${f}.mp3`), path.join(WS, 'assets/audio', `${f}.mp3`));
writeFileSync(path.join(WS, 'CREDITS.md'), `# Credits\n\n- Coin photographs: M.samei, Wikimedia Commons, CC BY-SA 4.0 (the app's own reference photos).\n- Music: «Autofahren» by Mauro Urbina, Mixkit Stock Music Free License (https://mixkit.co/license/#musicFree).\n- Sound effects: HyperFrames bundled library, Pixabay Content License.\n- Fonts: Markazi Text and Estedad (SIL Open Font License).\n- GSAP 3.13.0: GreenSock standard no-charge license.\n`);
console.log('staged', WS);
