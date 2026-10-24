// The gold the third infographic floats in its sky: rings, a coin and a bar drawn by the app's own studio
// (public/js/three: jewelry.mjs pieces, materials.mjs alloys, stage.mjs light tent and supersampled stills), each on a
// transparent background so the page can cast its own soft shadows. The coin wears the licensed photographs the coin
// lab uses (M.samei, CC BY-SA 4.0, Wikimedia Commons).
//   node scripts/promo-film/ig3-props.mjs            → scripts/promo-film/ig3/props/*.png
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveRoot } from './serve.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(DIR, 'ig3', 'props');
mkdirSync(OUT, { recursive: true });
const pw = await import(process.env.PLAYWRIGHT ?? '/opt/node22/lib/node_modules/playwright/index.mjs');
const { chromium } = pw.default ?? pw;

// what to draw, and from where: yaw/pitch in radians around the piece, size in output pixels
const ONLY = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const ENV = process.argv.find((a) => a.startsWith('--env='))?.slice(6);
const ALL = [
  { name: 'ring-solitaire', piece: 'solitaire', metal: 'au18y', params: { stone: 7.2 }, yaw: 0.5, pitch: 0.32, spin: [0.2, 0, -0.18] },
  { name: 'ring-halo', piece: 'halo', metal: 'au18r', params: {}, yaw: -0.6, pitch: 0.42, spin: [0.35, 0, 0.25] },
  { name: 'ring-band', piece: 'band', metal: 'au18y', params: { width: 6, thickness: 2.1 }, yaw: 0.9, pitch: 0.55, spin: [0.9, 0.2, 0.3] },
  { name: 'bar', piece: 'bar', metal: 'au24', params: { line1: '', line2: '۹۹۹٫۹' }, yaw: 0.55, pitch: 0.62, spin: [0, 0.4, 0] },
  { name: 'coin', coin: 'emami1370', yaw: 0.35, pitch: 0.25, spin: [-0.45, 0.35, 0.1] },
];
const JOBS = ALL.filter((j) => !ONLY.length || ONLY.includes(j.name)).map((j) => (ENV ? { ...j, env: ENV } : j));

const srv = await serveRoot();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 900 }, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => sessionStorage.setItem('beatris.quality', 'high'));
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error('pageerror', e.message));
  page.on('console', (m) => m.type() === 'error' && console.error('console', m.text()));
  await page.goto(`${srv.url}/coins/photos/manifest.json`); // any same-origin page: the modules load from /js and /vendor
  // the bar's hallmark is engraved from the Markazi letters, as in the studio
  await page.setContent(`<!doctype html><html><head><style>@font-face{font-family:'Markazi';src:url(/fonts/markazi-arabic-700.woff2) format('woff2');font-weight:700}</style></head><body style="margin:0;background:transparent"><div id="host" style="width:900px;height:900px"></div></body></html>`);
  await page.evaluate(() => document.fonts.load("700 50px 'Markazi'", 'طلای ناب ۹۹۹٫۹'));
  for (const job of JOBS) {
    const b64 = await page.evaluate(async (job) => {
      const { createStage, T } = await import('/js/three/stage.mjs');
      const J = await import('/js/three/jewelry.mjs');
      const Mt = await import('/js/three/materials.mjs');
      const host = document.querySelector('#host');
      host.innerHTML = '';
      const stage = createStage(host, { controls: false, transparent: true, env: job.env ?? 'studio', bloom: true, exposure: job.env === 'white' ? 1 : 1.08 });
      stage.floor.visible = false;
      const group = new T.Group();
      if (job.coin) {
        const C3 = await import('/js/three/coins3d.mjs');
        const { makeSpecimen } = await import('/js/coins.mjs');
        const man = await (await fetch('/coins/photos/manifest.json')).json();
        const item = man.items.find((i) => i.id === job.coin);
        const pc = await C3.photoCoin(item, makeSpecimen(item.coin, 'genuine', 7), { quality: 2, anisotropy: 16 });
        group.add(pc.mesh);
      } else {
        const P = J.PIECES[job.piece];
        const p = { ...Object.fromEntries(Object.entries(P.params).map(([k, v]) => [k, v[0]])), ...(P.opts ?? {}), ...job.params };
        for (const m of await P.build(p)) {
          const role = m.userData.role;
          m.material = role === 'gem' ? Mt.gemMaterial(p.gem ?? 'diamond') : role === 'enamel' ? Mt.enamelMaterial() : Mt.metalMaterial(job.metal, 'polish');
          group.add(m);
        }
      }
      group.rotation.set(...job.spin);
      stage.root.add(group);
      stage.frame(stage.root, { yaw: job.yaw, pitch: job.pitch, pad: 1.08, instant: true });
      await new Promise((r) => setTimeout(r, 400));
      const { blob } = await stage.snapshot({ width: 1400, height: 1400, transparent: true });
      const buf = new Uint8Array(await blob.arrayBuffer());
      let s = '';
      for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      stage.dispose();
      return btoa(s);
    }, job);
    writeFileSync(path.join(OUT, `${job.name}.png`), Buffer.from(b64, 'base64'));
    console.log('prop', job.name);
  }
} finally {
  await browser.close();
  srv.close();
}
