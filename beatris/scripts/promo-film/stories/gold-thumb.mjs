// spec 0055: the thumbnail and the vertical cover. The image is the owner's Nano Banana Pro render (higgsfield-
// youtube-thumbnail: an information gap, the bar on a scale whose display is blank); the Persian headline is laid over
// here, the skill's deterministic overlay path, because image models break Persian script. The «Beast» preset of the
// skill's text-overlay-bake, carried into Persian: one heavy face, a thick stroke drawn under the fill, a hard shadow,
// no letter-spacing (Persian letters join), placed on the free side the image keeps for it (the right, where RTL starts).
//   node scripts/promo-film/stories/gold-thumb.mjs --thumb=<16x9.png> --cover=<9x16.png>
//     → public/media/promo/beatris-gold-precision-thumb.jpg (1280×720) and -cover.jpg (1080×1920)
import { readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const OUT = path.join(ROOT, 'public/media/promo');
const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const pw = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs').catch(() => import('playwright'));
const { chromium } = pw.default ?? pw;

// the question the film answers: 10 g at 740 is ۹٫۸۶۷ g of 750
const HEAD = ['چند گرم', '۷۵۰؟'];
const font = (f) => `data:font/woff2;base64,${readFileSync(path.join(ROOT, 'public/fonts', f)).toString('base64')}`;
const dataUrl = (f) => `data:image/${/\.png$/i.test(f) ? 'png' : 'jpeg'};base64,${readFileSync(f).toString('base64')}`;
const page = (bg, W, H, place) => `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><style>
@font-face { font-family: 'Estedad'; src: url(${font('estedad-arabic-var.woff2')}) format('woff2'); font-weight: 100 900; }
* { margin: 0; box-sizing: border-box; }
#p { position: relative; width: ${W}px; height: ${H}px; background: url(${bg}) center / cover no-repeat; overflow: hidden; font-family: 'Estedad'; }
#p::after { content: ''; position: absolute; inset: 0; background: ${place.shade}; }
#h { position: absolute; z-index: 1; ${place.css}; text-align: ${place.align}; line-height: 1.02; }
.l { display: block; font-weight: 900; font-size: ${place.size}px; color: #f7e6b0; -webkit-text-stroke: ${Math.round(place.size * 0.11)}px #120d05;
  paint-order: stroke fill; text-shadow: 0 ${Math.round(place.size * 0.07)}px 0 rgba(0, 0, 0, 0.4), 0 ${Math.round(place.size * 0.12)}px ${Math.round(place.size * 0.2)}px rgba(0, 0, 0, 0.55); }
.l.n { color: #e3b862; }
</style></head><body><div id="p"><div id="h"><span class="l">${HEAD[0]}</span><span class="l n">${HEAD[1]}</span></div></div></body></html>`;

const browser = await chromium.launch();
try {
  mkdirSync(OUT, { recursive: true });
  const jobs = [
    arg('thumb') && { src: arg('thumb'), W: 1280, H: 720, out: 'beatris-gold-precision-thumb.jpg',
      place: { css: 'right: 64px; top: 50%; transform: translateY(-50%)', align: 'right', size: 132, shade: 'linear-gradient(270deg, rgba(8,7,5,0.55) 0%, rgba(8,7,5,0) 46%)' } },
    arg('cover') && { src: arg('cover'), W: 1080, H: 1920, out: 'beatris-gold-precision-cover.jpg',
      place: { css: 'left: 0; right: 0; top: 230px', align: 'center', size: 168, shade: 'linear-gradient(180deg, rgba(8,7,5,0.6) 0%, rgba(8,7,5,0) 38%)' } },
  ].filter(Boolean);
  for (const j of jobs) {
    const p = await browser.newPage({ viewport: { width: j.W, height: j.H } });
    await p.setContent(page(dataUrl(j.src), j.W, j.H, j.place));
    await p.evaluate(async () => {
      await document.fonts.load('900 100px Estedad', 'چند گرم ۷۵۰؟');
      await document.fonts.ready;
    });
    // the headline stays inside the frame with a margin, and readable at 120 px wide (checked by eye on the sheet)
    const r = await p.$eval('#h', (e) => e.getBoundingClientRect().toJSON());
    if (r.left < 24 || r.right > j.W - 24 || r.top < 24 || r.bottom > j.H - 24) throw new Error(`${j.out}: headline leaves the frame ${JSON.stringify(r)}`);
    await p.screenshot({ path: path.join(OUT, j.out), type: 'jpeg', quality: 90 });
    console.log('baked', j.out);
    await p.close();
  }
} finally {
  await browser.close();
}
