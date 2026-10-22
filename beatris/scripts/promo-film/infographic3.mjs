// «رؤیای طلایی» — the third infographic: a bright, surreal dreamscape (pastel skies, arches, a checkerboard floor, gold
// floating in the air) around this release's arts: email sign-in, the live sales desk and a desk for every role, then
// the whole shop, a Western classic letter in English, the numbers and the way in. Every screen is the demo shop's own
// (app-shots.mjs, day skin); every gold object is drawn by the app's studio (ig3-props.mjs); every figure on the page is
// computed here by the app's engines (books.mjs through sell.mjs).
//   node scripts/promo-film/app-shots.mjs --skin=day        → shots-day/*.jpg   (--only=sell for the new screens)
//   node scripts/promo-film/ig3-props.mjs                   → ig3/props/*.png
//   node scripts/promo-film/infographic3.mjs [--e2e=N]      → infographic3.html, public/media/promo/beatris-infographic-3.{jpg,pdf}
//   node scripts/promo-film/infographic3.mjs --preview --out=<dir>   → a quick 1300 px wide look, no PDF
import { writeFileSync, readFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as B from '../../public/js/books.mjs';
import * as S from '../../public/js/sell.mjs';
import { qrSvg } from '../../public/js/qr.mjs';
import { serveRoot } from './serve.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(DIR, '../..');
const arg = (k) => {
  const a = process.argv.find((x) => x === `--${k}` || x.startsWith(`--${k}=`));
  return a ? (a.includes('=') ? a.slice(a.indexOf('=') + 1) : true) : undefined;
};
const W = 1600;
const H = 10900;

/* ---------------- the figures, from the engines ---------------- */
const fa = (s) => String(s).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);
const R = (rial) => B.fmtMoney(rial, 'rial');
const P750 = 2400000; // toman per gram of 18k, the demo shop's day price
const ring = { id: 'demo', code: '100001', tpl: 'ring-w', title: 'انگشتر برگ زیتون', weight: 3.42, fineness: 750, ojratMode: 'pct', ojrat: 18, profitPct: 7, stones: 0 };
const cart = { lines: [S.lineFromItem(ring, P750)], tradeIns: [], payments: [] };
const base = S.totals(cart, { vatPct: 10 });
const whatIf = Object.fromEntries(S.scenarios(cart, { vatPct: 10, canDiscount: true }).map((s) => [s.id, s]));
const line = base.lines[0];
const e2e = arg('e2e') ? fa(arg('e2e')) : '۶۴۱';
const qr = qrSvg('https://beatris-production-68ac.up.railway.app', { size: 220, dark: '#2a1b47', light: '#fff8ec' });

/** The size a JPEG says it is, so a frame keeps every capture at its own proportions. */
const jpg = (file) => {
  const d = readFileSync(path.join(DIR, 'shots-day', file));
  for (let i = 2; i < d.length; ) {
    const m = d[i + 1], len = d.readUInt16BE(i + 2);
    if (m === 0xc0 || m === 0xc2) return { w: d.readUInt16BE(i + 7), h: d.readUInt16BE(i + 5) };
    i += 2 + len;
  }
  throw new Error(`no size in ${file}`);
};
const hOf = (file, w) => Math.round((w * jpg(file).h) / jpg(file).w);

/* ---------------- props of the dream ---------------- */
const at = (x, y, w, h, extra = '') => `left:${x}px;top:${y}px;width:${w}px;${h != null ? `height:${h}px;` : ''}${extra}`;
const sphere = (x, y, d, c, extra = '') => `<i class="sph" style="${at(x, y, d, d, `--c:${c};${extra}`)}"></i>`;
const shadow = (x, y, w, h, o = 0.26) => `<i class="shd" style="${at(x, y, w, h, `opacity:${o}`)}"></i>`;
const prop = (name, x, y, w, rot = 0, extra = '') => `<img class="prop" src="ig3/props/${name}.png" alt="" style="${at(x, y, w, null, `transform:rotate(${rot}deg);${extra}`)}">`;
const cloud = (x, y, w, o = 1) => `<svg class="cloud" viewBox="0 0 320 130" style="${at(x, y, w, null, `opacity:${o}`)}"><g fill="#fff"><circle cx="92" cy="78" r="46"/><circle cx="152" cy="58" r="58"/><circle cx="214" cy="76" r="44"/><circle cx="252" cy="92" r="30"/><rect x="58" y="80" width="214" height="44" rx="22"/></g></svg>`;
const arch = (x, y, w, h, a, b, rim, extra = '') => `<div class="arch" style="${at(x, y, w, h, `--a:${a};--b:${b};--rim:${rim};${extra}`)}"><i></i></div>`;
const sparkle = (x, y, s = 18, c = '#fff') => `<svg class="spark" viewBox="-10 -10 20 20" style="${at(x, y, s, s)}"><path d="M0-10C1 -2 2 -1 10 0C2 1 1 2 0 10C-1 2-2 1-10 0C-2-1-1-2 0-10Z" fill="${c}"/></svg>`;
const monitor = (file, x, y, w, extra = '') => `<figure class="mon" style="${at(x, y, w, null, extra)}"><div class="scr"><img src="shots-day/${file}" alt="" style="height:${hOf(file, w - 28)}px"></div><div class="neck"></div><div class="foot"></div></figure>`;
const laptop = (file, x, y, w, extra = '') => `<figure class="lap" style="${at(x, y, w, null, extra)}"><div class="lid"><img src="shots-day/${file}" alt="" style="height:${hOf(file, w - 40)}px"></div><div class="base"></div></figure>`;
/** a phone; `keep` is how much of the screen shows, from the bottom (the sign-in page's coin sits above its form) */
const phone = (file, x, y, w, rot = 0, keep = 1) => `<figure class="ph" style="${at(x, y, w, null, `transform:rotate(${rot}deg)`)}"><img src="shots-day/${file}" alt="" style="height:${Math.round(hOf(file, w - 20) * keep)}px;object-position:bottom"></figure>`;
/** a screen lifted out of the page; `maxh` caps a tall capture at its top part */
const lens = (file, x, y, w, rot = 0, cap = '', maxh = 0) => `<figure class="lens" style="${at(x, y, w, null, `transform:rotate(${rot}deg)`)}"><img src="shots-day/${file}" alt="" style="height:${maxh ? Math.min(maxh, hOf(file, w - 12)) : hOf(file, w - 12)}px">${cap ? `<figcaption>${cap}</figcaption>` : ''}</figure>`;
/** an interlude: one thought in Persian, its English twin beneath */
const thought = (fa, en, y, tone = '') => `<div class="thought ${tone}" style="top:${y}px"><i>✦</i><p class="fa">${fa}</p><p class="en">${en}</p></div>`;

/* ---------------- icons (line art, one stroke) ---------------- */
const ICON = {
  crown: '<path d="M6 34h36l3-20-11 8-10-14-10 14-11-8z"/><path d="M8 40h32"/>',
  keys: '<rect x="4" y="12" width="40" height="24" rx="4"/><path d="M10 19h3M17 19h3M24 19h3M31 19h3M38 19h0M10 25h3M17 25h3M24 25h3M31 25h3M14 31h20"/>',
  gem: '<path d="M14 8h20l8 10-18 24L6 18z"/><path d="M6 18h36M18 8l-4 10 10 24 10-24-4-10"/>',
  book: '<path d="M24 12c-6-4-12-4-18-3v28c6-1 12-1 18 3 6-4 12-4 18-3V9c-6-1-12-1-18 3z"/><path d="M24 12v28"/>',
  mail: '<rect x="5" y="11" width="38" height="27" rx="4"/><path d="M6 13l18 14 18-14"/>',
  key: '<circle cx="15" cy="24" r="8"/><path d="M23 24h20M37 24v7M42 24v5"/>',
  door: '<path d="M12 42V12a12 12 0 0 1 24 0v30"/><path d="M6 42h36M28 27h2"/>',
};
const icon = (k, c = 'currentColor', s = 44) => `<svg class="ico" viewBox="0 0 48 48" width="${s}" height="${s}" fill="none" stroke="${c}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${ICON[k]}</svg>`;

const ROLES = [
  { k: 'crown', fa: 'رئیس', en: 'The Proprietor', a: '#ffb39b', b: '#ffe2cf', rim: '#f48d7a', start: '/work', items: ['نبض فروشگاه در یک جمله', 'تأییدها و استثناهای منتظر', 'فروش امروز و رزروها'], note: 'Pulse, approvals and today’s sales at a glance' },
  { k: 'keys', fa: 'اپراتور', en: 'The Operator', a: '#9fb0ff', b: '#e1e3ff', rim: '#7d8ef2', start: '/books/desk', items: ['میز معامله با صفحه‌کلید', 'ورود تک‌خطی و صف ارسال', 'صفحه‌ی فشرده'], note: 'Keyboard first, one-line entry, compact screens' },
  { k: 'gem', fa: 'فروشنده', en: 'The Seller', a: '#8fe3c6', b: '#dcf8ee', rim: '#5cc9a6', start: '/books/sell', items: ['میز فروش زنده', 'رزروها و مشتری‌های امروز', 'صفحه‌ی مشتری'], note: 'The live sales desk, reservations, today’s customers' },
  { k: 'book', fa: 'کارمند', en: 'The Apprentice', a: '#ffd77a', b: '#fff2c8', rim: '#f2b947', start: '/', items: ['درس بعدی و گواهی‌ها', 'تمرین و کارت مرور', 'ابزار و دستورالعمل‌ها'], note: 'Lessons, practice, tools and procedures' },
];

const FEATURES = [
  { f: 'desk-pay.jpg', fa: 'میز معامله', en: 'The Trade Desk', t: 'آبشده، سکه، شمش و ارز؛ ورود تک‌خطی و برگشت گام‌به‌گام', c: '#ffd2c2', box: '5% 36% 40% 0%' },
  { f: 'card-window.jpg', fa: 'کارتخوان یک‌ضرب', en: 'One-tap Card', t: 'مبلغ دقیقِ باقی‌مانده به کارتخوان؛ گوشی هم از راه پیشخوان', c: '#d9d2ff', box: '6% 4% 30% 4%' },
  { f: 'daybook.jpg', fa: 'روزنگار', en: 'The Day Book', t: 'هر رقم امروز، بخش‌به‌بخش؛ هر عدد با یک جست‌وجو', c: '#c9f2e4', box: '10% 31% 38% 2%' },
  { f: 'dashboard.jpg', fa: 'داشبورد و نبض', en: 'Pulse & Dashboard', t: 'حال فروشگاه در یک جمله، با رقم‌هایی که توضیح می‌دهند', c: '#ffe9b0', box: '9% 9% 36% 22%' },
  { f: 'elliott.jpg', fa: 'بازار و الیوت', en: 'Market & Elliott', t: 'قیمت زنده، شمارش موج و فیبوناچی روی همان نمودار', c: '#ffd0e2', box: '22% 33% 6% 1%' },
  { f: 'coinlab.jpg', fa: 'آزمایشگاه سکه', en: 'The Coin Lab', t: 'سکه‌ی واقعی، پلمب و ترفندهای تقلب در سه‌بعد', c: '#cfe2ff', box: '12% 24% 14% 22%' },
  { f: 'studio.jpg', fa: 'استودیوی جواهر', en: 'Jewellery Studio', t: 'طراحی سه‌بعدی با وزن واقعی پیش از ریخته‌گری', c: '#ffdccb', box: '12% 32% 14% 12%' },
  { f: 'invoice-a4.jpg', fa: 'فاکتور رسمی و اصالت', en: 'Invoice & Provenance', t: 'مالیات فقط روی اجرت و سود؛ کد اصالت برای مشتری', c: '#e3f6c9', box: '3% 2% 66% 2%' },
  { f: 'learn.jpg', fa: 'آموزش و تمرین', en: 'The Academy', t: 'از صفر تا استادی: درس، آزمون، گواهی و تمرین سرعت', c: '#e6d8ff', box: '8% 26% 46% 8%' },
];

/* ---------------- the page ---------------- */
const fonts = `
@font-face{font-family:'Vazir';src:url(/fonts/vazirmatn-var.woff2) format('woff2');font-weight:100 900}
@font-face{font-family:'Estedad';src:url(/fonts/estedad-arabic-var.woff2) format('woff2');font-weight:100 900;unicode-range:U+0600-06FF,U+200C-200F,U+FB50-FDFF,U+FE70-FEFF}
@font-face{font-family:'Estedad';src:url(/fonts/estedad-latin-var.woff2) format('woff2');font-weight:100 900;unicode-range:U+0000-00FF}
@font-face{font-family:'Markazi';src:url(/fonts/markazi-arabic-600.woff2) format('woff2');font-weight:600}
@font-face{font-family:'Markazi';src:url(/fonts/markazi-arabic-700.woff2) format('woff2');font-weight:700}
${[400, 500, 600, 700, 800, 900].map((w) => `@font-face{font-family:'Playfair';src:url(fonts/playfair-display-latin-${w}-normal.woff2) format('woff2');font-weight:${w}}@font-face{font-family:'Playfair';src:url(fonts/playfair-display-latin-${w}-italic.woff2) format('woff2');font-weight:${w};font-style:italic}`).join('\n')}
${[300, 400, 500, 600, 700, 800].map((w) => `@font-face{font-family:'Jakarta';src:url(fonts/plus-jakarta-sans-latin-${w}-normal.woff2) format('woff2');font-weight:${w}}`).join('\n')}
@font-face{font-family:'Pinyon';src:url(fonts/pinyon-script-latin-400-normal.woff2) format('woff2')}`;

const css = `${fonts}
:root{--ink:#2a1b47;--ink2:#4c3b74;--ink3:#7a6b9c;--gold:#e2b04a;--goldd:#a8781e;--goldl:#ffe8a3;--cream:#fff8ec;--wine:#7a2440;--navy:#1d2650}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${W}px;height:${H}px;overflow:hidden}
/* html has its own background, so the body's sky is painted on the body and moves with it when the page is drawn in bands */
html{background:#3a2768}
body{position:relative;font-family:'Vazir',sans-serif;color:var(--ink);background:linear-gradient(180deg,#ffe9dc 0,#ffd6c8 900px,#fac6da 1500px,#e9d6ff 2050px,#d5e1ff 2700px,#cfe6ff 3400px,#d2f5ea 4600px,#e4f8e9 5300px,#fff1c9 6100px,#ffe0c9 7100px,#fbd2e2 8000px,#eadcff 8900px,#ddd2ff 9600px,#ff9f86 10020px,#e46ea8 10320px,#6b4bd6 10660px,#3a2768 10900px)}
body::after{content:'';position:absolute;inset:0;pointer-events:none;opacity:.07;mix-blend-mode:multiply;background:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='220'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='220' height='220' filter='url(%23n)'/%3E%3C/svg%3E")}
.abs,.sph,.shd,.prop,.cloud,.arch,.spark,.mon,.lap,.ph,.lens,.card,.chip,.floor,.sun,.thought,.blk{position:absolute}
.fa{direction:rtl;font-family:'Vazir',sans-serif}
.en{direction:ltr;font-family:'Jakarta',sans-serif}
.sph{border-radius:50%;background:radial-gradient(circle at 32% 28%,#fff 0,var(--c) 36%,color-mix(in srgb,var(--c) 62%,#2a1b47) 100%);box-shadow:0 34px 60px -28px rgba(42,27,71,.45)}
.shd{border-radius:50%;background:radial-gradient(closest-side,rgba(42,27,71,.55),rgba(42,27,71,0))}
.prop{filter:drop-shadow(0 38px 34px rgba(80,40,90,.28)) drop-shadow(0 6px 8px rgba(80,40,90,.18))}
.cloud{filter:drop-shadow(0 18px 18px rgba(120,90,170,.18))}
.spark{opacity:.95;filter:drop-shadow(0 0 6px rgba(255,255,255,.9))}
.arch{border-radius:9999px 9999px 0 0;background:var(--rim);box-shadow:0 60px 90px -50px rgba(42,27,71,.55)}
.arch>i{position:absolute;inset:22px 22px 0 22px;border-radius:9999px 9999px 0 0;background:linear-gradient(180deg,var(--a),var(--b));box-shadow:inset 0 40px 80px rgba(255,255,255,.35),inset 0 -30px 60px rgba(42,27,71,.12)}
.floor{left:-30%;width:160%;transform:perspective(760px) rotateX(64deg);transform-origin:50% 0;background:repeating-conic-gradient(var(--f1) 0 25%,var(--f2) 0 50%) 0 0/150px 150px;-webkit-mask-image:linear-gradient(180deg,transparent 0,#000 16%,#000 70%,transparent 100%)}
.sun{border-radius:50%;background:radial-gradient(circle at 40% 35%,#fff7cf 0,#ffd98a 40%,#ffa77e 100%);box-shadow:0 0 120px 30px rgba(255,190,140,.45)}
.mon .scr{padding:14px;border-radius:26px;background:linear-gradient(150deg,#ffffff,#ece6f6);box-shadow:0 50px 90px -40px rgba(42,27,71,.55),inset 0 0 0 1px rgba(42,27,71,.06)}
.mon img,.lap img,.ph img,.lens img{display:block;width:100%;object-fit:cover;object-position:top}
.mon img{border-radius:14px}
.mon .neck{width:16%;height:74px;margin:0 auto;background:linear-gradient(90deg,#e1d9ef,#fbf8ff 50%,#d7cdea);clip-path:polygon(18% 0,82% 0,100% 100%,0 100%)}
.mon .foot{width:36%;height:16px;margin:0 auto;border-radius:12px;background:linear-gradient(#f6f1ff,#d8cdec);box-shadow:0 26px 34px -16px rgba(42,27,71,.45)}
.lap .lid{padding:20px 20px 26px;border-radius:24px 24px 6px 6px;background:linear-gradient(150deg,#ffffff,#ebe5f5);box-shadow:inset 0 0 0 1px rgba(42,27,71,.06)}
.lap .lid img{border-radius:10px}
.lap .base{height:26px;margin:0 -7%;border-radius:4px 4px 22px 22px;background:linear-gradient(#f4effb,#d5cae8);box-shadow:0 30px 40px -18px rgba(42,27,71,.45)}
.ph{padding:10px;border-radius:46px;background:linear-gradient(150deg,#ffffff,#ece6f5);box-shadow:0 46px 70px -30px rgba(42,27,71,.5),inset 0 0 0 1px rgba(42,27,71,.07)}
.ph img{border-radius:36px}
.lens{padding:6px;border-radius:28px;background:#fff;box-shadow:0 40px 70px -34px rgba(42,27,71,.55)}
.lens img{border-radius:22px}
.lens figcaption{position:absolute;inset-inline-start:18px;bottom:-22px;padding:8px 16px;border-radius:999px;background:var(--ink);color:#fff;font:600 17px/1.4 'Vazir';direction:rtl;white-space:nowrap;box-shadow:0 14px 24px -12px rgba(42,27,71,.6)}
.chip{display:inline-flex;align-items:center;gap:12px;padding:12px 22px;border-radius:999px;background:rgba(255,255,255,.72);backdrop-filter:blur(8px);box-shadow:0 18px 30px -18px rgba(42,27,71,.45),inset 0 0 0 1px rgba(255,255,255,.9);white-space:nowrap}
.chip b{font:800 21px/1.3 'Estedad';direction:rtl}
.chip span{font:500 15px/1.3 'Jakarta';color:var(--ink3);letter-spacing:.06em;text-transform:uppercase}
.eyebrow{font:700 14px/1 'Jakarta';letter-spacing:.32em;text-transform:uppercase;color:var(--ink3)}
.h-fa{font:900 84px/1.25 'Estedad';direction:rtl;color:var(--ink)}
.h-en{font:italic 600 38px/1.25 'Playfair';color:var(--ink2)}
.body-fa{font:400 24px/2 'Vazir';direction:rtl;color:var(--ink2)}
.body-en{font:400 18px/1.7 'Jakarta';color:var(--ink3)}
.thought{left:0;width:${W}px;text-align:center}
.kbd{display:inline-flex;align-items:center;gap:10px;padding:8px 16px 8px 10px;border-radius:999px;background:rgba(255,255,255,.7);box-shadow:0 12px 22px -14px rgba(42,27,71,.45);font:600 18px/1.3 'Vazir';direction:rtl}
.kbd kbd{padding:4px 10px;border-radius:8px;background:var(--ink);color:#fff;font:700 15px/1.2 'Jakarta';direction:ltr}
.calc{display:flex;justify-content:space-between;gap:16px;padding:6px 0;border-bottom:1px dashed rgba(42,27,71,.16);font:400 18px/1.6 'Vazir';color:var(--ink2)}
.calc b{font:800 19px/1.6 'Estedad';color:var(--ink)}
.thought i{display:block;font-style:normal;color:var(--gold);font-size:26px;margin-bottom:10px}
.thought .fa{font:700 50px/1.6 'Markazi';color:var(--ink)}
.thought .en{margin-top:4px;font:italic 400 25px/1.4 'Playfair';color:var(--ink2)}
.thought.light .fa,.thought.light .en{color:#fff}
.card{border-radius:30px;background:rgba(255,255,255,.62);backdrop-filter:blur(10px);box-shadow:0 40px 70px -40px rgba(42,27,71,.5),inset 0 0 0 1px rgba(255,255,255,.85)}
.step{display:flex;gap:18px;align-items:flex-start;direction:rtl}
.step em{flex:none;display:grid;place-items:center;width:52px;height:52px;border-radius:50%;font:800 24px/1 'Estedad';font-style:normal;color:#fff;background:linear-gradient(140deg,#9a83ff,#ff8fb1)}
.step b{display:block;font:800 26px/1.5 'Estedad'}
.step span{display:block;font:400 18px/1.6 'Jakarta';direction:ltr;text-align:right;color:var(--ink3)}
.code{display:flex;gap:12px;direction:ltr}
.code i{display:grid;place-items:center;width:62px;height:76px;border-radius:18px;background:#fff;font:800 40px/1 'Estedad';font-style:normal;color:var(--ink);box-shadow:0 18px 26px -16px rgba(42,27,71,.5)}
.call{display:flex;gap:14px;align-items:flex-start;direction:rtl}
.call em{flex:none;display:grid;place-items:center;width:44px;height:44px;border-radius:50%;font:800 20px/1 'Estedad';font-style:normal;color:#fff;background:var(--ink)}
.call b{display:block;font:800 23px/1.45 'Estedad'}
.call p{font:400 17px/1.7 'Vazir';color:var(--ink2)}
.call small{display:block;direction:ltr;text-align:right;font:italic 400 16px/1.4 'Playfair';color:var(--ink3)}
.role{text-align:center}
.role .ico{margin:0 auto;color:var(--ink)}
.role h3{margin-top:14px;font:900 46px/1.2 'Estedad';direction:rtl}
.role h4{font:italic 600 24px/1.3 'Playfair';color:var(--ink2)}
.role ul{list-style:none;margin:22px 26px 0;direction:rtl;text-align:right}
.role li{padding:8px 0;font:500 19px/1.5 'Vazir';border-bottom:1px dashed rgba(42,27,71,.18)}
.role li::before{content:'◆';margin-left:10px;color:rgba(42,27,71,.4);font-size:12px}
.role code{display:inline-block;margin-top:20px;padding:6px 16px;border-radius:999px;background:rgba(255,255,255,.75);font:600 16px/1.4 'Jakarta';color:var(--ink2);direction:ltr}
.role p.en{margin:14px 30px 0;font:400 15px/1.5 'Jakarta';color:var(--ink3)}
.feat .win{margin:14px;border-radius:20px;overflow:hidden;background:#fff;box-shadow:inset 0 0 0 1px rgba(42,27,71,.06)}
.feat .win img{display:block;width:100%;height:220px;object-fit:cover;object-position:top}
.feat .tx{padding:6px 28px 26px;direction:rtl}
.feat b{display:block;font:900 30px/1.35 'Estedad'}
.feat small{display:block;direction:ltr;text-align:right;font:italic 500 19px/1.3 'Playfair';color:var(--ink3);margin-bottom:6px}
.feat p{font:400 18px/1.75 'Vazir';color:var(--ink2)}
/* the classic letter (English, Western, engraved) */
.letter{background:#fbf5e8;border-radius:6px;box-shadow:0 70px 120px -60px rgba(42,27,71,.7),0 0 0 1px rgba(120,90,40,.12),inset 0 0 120px rgba(190,150,90,.16);color:var(--navy);font-family:'Playfair',serif}
.letter::before{content:'';position:absolute;inset:26px;border:1.5px solid #b8914a;outline:1px solid #b8914a;outline-offset:6px;pointer-events:none}
.lt-top{text-align:center;padding-top:74px}
.lt-house{font:700 17px/1 'Playfair';letter-spacing:.42em;color:var(--wine)}
.lt-rule{width:440px;height:8px;margin:20px auto;border-top:1.5px solid #b8914a;border-bottom:.8px solid #b8914a}
.lt-sub{font:italic 400 19px/1.3 'Playfair';color:#6d5a3a;letter-spacing:.04em}
.lt-dear{font:400 74px/1.1 'Pinyon';color:var(--wine)}
.lt-body{columns:2;column-gap:48px;text-align:justify;hyphens:auto;font:400 20px/1.7 'Playfair';color:#2a2a3d}
.lt-body p{margin-bottom:16px;text-indent:1.4em}
.lt-body p.first{text-indent:0}
.lt-body p.first::first-letter{float:left;font:700 92px/.8 'Playfair';color:var(--wine);margin:10px 12px 0 0}
.lt-parts{border-top:1.5px solid #b8914a;border-bottom:1.5px solid #b8914a;padding:18px 6px}
.lt-parts h5{text-align:center;font:700 15px/1 'Playfair';letter-spacing:.38em;color:var(--wine);margin-bottom:14px}
.lt-row{display:flex;align-items:baseline;gap:8px;font:400 17px/1.95 'Playfair'}
.lt-row span:first-child{font-variant:small-caps;letter-spacing:.06em}
.lt-row i{flex:1;border-bottom:2px dotted rgba(29,38,80,.35);transform:translateY(-6px)}
.lt-row span:last-child{font-style:italic}
.lt-sign{font:400 108px/1 'Pinyon';color:var(--wine)}
.lt-motto{font:700 14px/1 'Playfair';letter-spacing:.5em;color:#8a6a2f}
.seal{border-radius:50%;background:radial-gradient(circle at 38% 34%,#c2445f 0,#9c2440 45%,#5e1226 100%);box-shadow:0 18px 26px -10px rgba(60,10,25,.6),inset 0 -8px 18px rgba(0,0,0,.25);display:grid;place-items:center}
.seal b{font:italic 900 74px/1 'Playfair';color:rgba(255,220,200,.75);text-shadow:0 -1px 0 rgba(0,0,0,.35)}
.cameo{border-radius:50%;background:radial-gradient(circle at 50% 40%,#2c3a7a 0,#1b2350 60%,#10163a 100%);box-shadow:0 0 0 8px #fbf5e8,0 0 0 10px #b8914a,0 0 0 14px #fbf5e8,0 0 0 15px #b8914a,0 30px 50px -20px rgba(20,20,60,.6);overflow:hidden;display:grid;place-items:center}
.num{display:grid;place-items:center;text-align:center;border-radius:50%;background:radial-gradient(circle at 32% 26%,rgba(255,255,255,.95) 0,rgba(255,255,255,.55) 40%,rgba(255,255,255,.2) 100%);box-shadow:0 40px 60px -30px rgba(42,27,71,.5),inset 0 0 0 1px rgba(255,255,255,.9),inset 0 -20px 40px var(--c)}
.num b{display:block;font:900 64px/1 'Estedad';color:var(--ink)}
.num span{display:block;margin-top:8px;font:700 18px/1.4 'Vazir';direction:rtl;color:var(--ink2)}
.num small{display:block;font:500 13px/1.3 'Jakarta';letter-spacing:.08em;text-transform:uppercase;color:var(--ink3)}
.cta .fa{font:900 66px/1.4 'Estedad';color:#fff;text-shadow:0 8px 30px rgba(42,20,80,.35)}
.cta .en{font:italic 500 34px/1.3 'Playfair';color:#fff3f8}
.url{display:inline-flex;align-items:center;gap:14px;padding:16px 30px;border-radius:999px;background:rgba(255,255,255,.18);backdrop-filter:blur(10px);box-shadow:inset 0 0 0 1px rgba(255,255,255,.45);font:600 26px/1 'Jakarta';color:#fff;direction:ltr}
.credits{font:400 14px/1.75 'Jakarta';color:rgba(255,255,255,.82);text-align:center}
.credits .fa{font:400 15px/1.8 'Vazir';color:rgba(255,255,255,.9)}
`;

/* section y origins */
const Y = { hero: 0, mail: 1700, desk: 2720, roles: 4740, shop: 6440, letter: 8250, nums: 9690, cta: 10060 };

const hero = `
<i class="sun" style="${at(1010, 150, 470, 470)}"></i>
${cloud(860, 470, 380, 0.95)}${cloud(1240, 300, 260, 0.9)}${cloud(40, 560, 300, 0.85)}${cloud(1330, 980, 240, 0.8)}
<div class="floor" style="top:1180px;height:780px;--f1:#efe3ff;--f2:#d9c6ff"></div>
${arch(370, 560, 860, 960, '#9fb2ff', '#f0e2ff', '#f6aebf')}
${monitor('sell.jpg', 452, 760, 696, 'transform:rotate(-1.5deg)')}
${shadow(430, 1446, 740, 70, 0.3)}
${prop('ring-solitaire', 60, 330, 400, -10)}
${prop('ring-band', 1290, 690, 230, 12)}
${prop('coin', 1185, 940, 300, 8)}
${shadow(1210, 1420, 260, 46, 0.22)}
${prop('ring-halo', 150, 900, 260, -6)}
${prop('bar', 1120, 1290, 380, -4)}
${shadow(1150, 1560, 330, 50, 0.3)}
${sphere(90, 1290, 170, '#c9b6ff')}${shadow(70, 1520, 220, 40, 0.25)}
${sphere(1430, 1180, 92, '#9ff0d6')}${sphere(520, 470, 62, '#ffe39a')}${sphere(1225, 610, 40, '#ff9fbd')}
${sparkle(980, 120, 22)}${sparkle(300, 250, 16)}${sparkle(1450, 560, 20)}${sparkle(660, 520, 14)}
<div class="abs" style="${at(0, 52, W, null, 'display:flex;justify-content:space-between;padding:0 70px;align-items:center')}">
  <span class="eyebrow">Beatris · Gold Shop Operating System</span>
  <span class="eyebrow" style="letter-spacing:.2em">Vol. III · Autumn 2026</span>
  <span class="fa" style="font:700 20px/1 'Vazir';color:var(--ink2)">بئاتریس · سیستم‌عامل گالری طلا · پاییز ۱۴۰۵</span>
</div>
<h1 class="abs" style="${at(0, 104, W, null, "text-align:center;font:italic 900 230px/1 'Playfair';background:linear-gradient(100deg,#9a6610 8%,#e9b54a 28%,#fff2c4 44%,#e0a63a 58%,#b97f1e 78%,#f3cf74 92%);-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 14px 24px rgba(160,90,40,.28))")}">Beatris</h1>
<p class="abs fa" style="${at(0, 352, W, null, "text-align:center;font:900 58px/1.3 'Estedad';color:var(--ink)")}">جایی که طلا، حسابِ خودش را نگه می‌دارد.</p>
<p class="abs en" style="${at(0, 438, W, null, "text-align:center;font:italic 500 32px/1.3 'Playfair';color:var(--ink2)")}">Where gold keeps its own books.</p>
<div class="abs" style="${at(0, 1600, W, null, 'display:flex;justify-content:center;gap:22px')}">
  <span class="chip" style="position:static"><b>ورود با ایمیل</b><span>Email sign-in</span></span>
  <span class="chip" style="position:static"><b>میز فروش زنده</b><span>Live sales desk</span></span>
  <span class="chip" style="position:static"><b>میز هر نقش</b><span>A desk for every role</span></span>
</div>`;

const mail = `
${thought('هر گرم روایتی دارد؛ بئاتریس آن را بی‌کم‌وکاست تعریف می‌کند.', 'Every gram has a story. Beatris tells it — exactly.', Y.mail + 10)}
${cloud(20, Y.mail + 780, 440)}${cloud(330, Y.mail + 820, 300, 0.95)}
${phone('login-email.jpg', 70, Y.mail + 300, 300, -7, 0.6)}
${phone('login-code.jpg', 330, Y.mail + 340, 300, 6, 0.6)}
<svg class="abs" style="${at(560, Y.mail + 300, 200, 200)}" viewBox="0 0 200 200" fill="none"><path d="M6 190 C 50 130, 110 160, 130 96 S 170 30, 196 12" stroke="#9a83ff" stroke-width="3" stroke-dasharray="2 12" stroke-linecap="round"/></svg>
<div class="abs" style="${at(620, Y.mail + 210, 110, 90, 'transform:rotate(-12deg)')}">${icon('mail', '#7b62e6', 104)}</div>
${sphere(650, Y.mail + 690, 64, '#ffb3c8')}${sparkle(600, Y.mail + 250, 18)}${sparkle(735, Y.mail + 420, 14)}
<div class="card" style="${at(780, Y.mail + 200, 750, 700)}">
  <div style="padding:46px 54px 0;direction:rtl">
    <span class="eyebrow" style="direction:ltr;display:block;text-align:right">Passwordless · ورود بی‌رمز</span>
    <h2 class="h-fa" style="font-size:64px;margin-top:14px">یک ایمیل. یک کد.<br>فروشگاه باز است.</h2>
    <p class="h-en" style="direction:ltr;text-align:right;font-size:30px;margin-top:6px">One email. One code. The shop is open.</p>
    <div class="code" style="margin:28px 0 28px;justify-content:flex-end">${[...'۴۸۲۹۱۷'].map((d) => `<i>${d}</i>`).join('')}</div>
    <div style="display:grid;gap:18px">
      <div class="step"><em>۱</em><div><b>ایمیل‌تان را بنویسید</b><span>Type your email — nothing else</span></div></div>
      <div class="step"><em>۲</em><div><b>کد شش‌رقمی به صندوق‌تان می‌رسد</b><span>A six-digit code arrives in your inbox</span></div></div>
      <div class="step"><em>۳</em><div><b>ایمیل تازه، فروشگاه تازه؛ منتظر کسی نمی‌مانید</b><span>A new email opens its own shop — no one to wait for</span></div></div>
    </div>
  </div>
</div>`;

const deskY = Y.desk;
const desk = `
${thought('پیش از آنکه مشتری بپرسد «اگر…؟»، جوابش روی میز است.', 'Before the customer asks “what if…?”, the answer is already on the desk.', deskY - 10)}
<div class="abs" style="${at(70, deskY + 200, 1460, null, 'direction:rtl;text-align:right')}">
  <span class="eyebrow" style="direction:ltr;display:block;text-align:right">New in this release · The Live Sales Desk</span>
  <h2 class="h-fa" style="font-size:96px;margin-top:8px">میز فروش زنده</h2>
  <p class="h-en" style="direction:ltr;text-align:right">Customer, showcase, what-ifs, old gold and payment — on one calm screen.</p>
  <div style="display:flex;gap:14px;justify-content:flex-start;margin-top:22px;direction:rtl">
    <span class="kbd"><kbd>F2</kbd>بارکد یا نام کالا</span><span class="kbd"><kbd>F3</kbd>مشتری و سلیقه‌اش</span><span class="kbd"><kbd>Ctrl+Enter</kbd>ثبت فروش</span>
  </div>
</div>
<div class="floor" style="top:${deskY + 1260}px;height:640px;--f1:#e3f0ff;--f2:#c8dcff"></div>
${arch(70, deskY + 560, 960, 900, '#bfe0ff', '#f1f7ff', '#a9c3ff')}
${monitor('sell.jpg', 110, deskY + 700, 880)}
${shadow(100, deskY + 1430, 900, 80, 0.32)}
${lens('sell-customer.jpg', 1090, deskY + 560, 440, 2.5, '۱ · پرونده‌ی مشتری', 470)}
${lens('sell-whatif.jpg', 1100, deskY + 1090, 430, -2, '۲ · اگر…؟ بی‌آنکه سند عوض شود', 360)}
${lens('sell-screen.jpg', 70, deskY + 1530, 580, -1.5, '۳ · صفحه‌ی مشتری: سود شما پیدا نیست')}
${lens('sell-thanks.jpg', 690, deskY + 1590, 330, 2.5, '۴ · سپاس از خرید')}
${sphere(1000, deskY + 520, 84, '#ffd27a')}${sphere(30, deskY + 660, 56, '#b9a6ff')}${sparkle(1050, deskY + 500, 20)}
<div class="card" style="${at(1070, deskY + 1530, 460, 322)}">
  <div style="padding:28px 32px;direction:rtl">
    <span class="eyebrow" style="direction:ltr;display:block;text-align:right">Computed by the engine</span>
    <p style="font:800 22px/1.6 'Estedad';margin-top:12px">انگشتر ${fa('3٫42')} گرم، اجرت ${fa(18)}٪، سود ${fa(7)}٪</p>
    <p class="calc"><span>جمع امروز</span><b>${R(base.net)}</b></p>
    <p class="calc"><span>با «${fa(3)}٪ تخفیف»</span><b>${R(whatIf.disc3.net)}</b></p>
    <p class="calc"><span>با «اجرت نصف»</span><b>${R(whatIf.ojratHalf.net)}</b></p>
    <p style="margin-top:10px;font:400 16px/1.8 'Vazir';color:var(--ink3)">ارزش طلا (${R(line.principal)}) دست نمی‌خورد؛ مالیات فقط روی اجرت و سود است.</p>
  </div>
</div>
${prop('ring-solitaire', 960, deskY + 1440, 190, 16)}`;

const rolesY = Y.roles;
const roles = `
${thought('هر نقش، میز خودش؛ هیچ نیمرخی دری را که نقش بسته باز نمی‌کند.', 'Every role, its own desk. No layout opens a door the role keeps shut.', rolesY - 20)}
<div class="abs" style="${at(70, rolesY + 190, 1460, null, 'direction:rtl;text-align:right')}">
  <span class="eyebrow" style="direction:ltr;display:block;text-align:right">New · A desk for every role</span>
  <h2 class="h-fa" style="font-size:90px;margin-top:8px">هر کس، به سلیقه‌ی کار خودش</h2>
  <p class="h-en" style="direction:ltr;text-align:right">The proprietor, the operator, the seller and the apprentice each open their own day.</p>
</div>
<div class="floor" style="top:${rolesY + 1040}px;height:520px;--f1:#fff3cf;--f2:#ffe2a8"></div>
${ROLES.map((r, i) => `${arch(70 + i * 372, rolesY + 470, 348, 640, r.a, r.b, r.rim)}
<div class="abs role" style="${at(70 + i * 372, rolesY + 590, 348, null)}">${icon(r.k, '#2a1b47', 54)}<h3>${r.fa}</h3><h4>${r.en}</h4><ul>${r.items.map((x) => `<li>${x}</li>`).join('')}</ul><code>${r.start}</code><p class="en">${r.note}</p></div>`).join('')}
${lens('work-boss.jpg', 90, rolesY + 1190, 780, -1.2, 'میز کار رئیس · /work', 450)}
${lens('workspace.jpg', 930, rolesY + 1200, 600, 2, 'انتخاب نیمرخ، تراکم و میان‌برها', 400)}
${sphere(1480, rolesY + 450, 70, '#ff9fbd')}${sparkle(60, rolesY + 450, 18)}`;

const shopY = Y.shop;
const shop = `
${thought('طلا وزن دارد؛ اعتماد هم.', 'Gold has weight. So does trust.', shopY + 20)}
<div class="abs" style="${at(70, shopY + 240, 1460, null, 'direction:rtl;text-align:right')}">
  <span class="eyebrow" style="direction:ltr;display:block;text-align:right">The whole house, in one place</span>
  <h2 class="h-fa" style="font-size:86px;margin-top:8px">همه‌ی گالری، یک‌جا</h2>
</div>
${FEATURES.map((f, i) => {
  const col = i % 3, row = Math.floor(i / 3);
  const x = 70 + col * 492, y = shopY + 480 + row * 430;
  return `<div class="card feat" style="${at(x, y, 476, 404, `transform:rotate(${[-1.2, 0.8, -0.6][(i + row) % 3]}deg);background:linear-gradient(170deg,${f.c},rgba(255,255,255,.7))`)}"><div class="win"><img src="shots-day/${f.f}" alt="" style="object-view-box:inset(${f.box})"></div><div class="tx"><b>${f.fa}</b><small>${f.en}</small><p>${f.t}</p></div></div>`;
}).join('')}
${sphere(1500, shopY + 430, 60, '#a5e7ff')}${sphere(26, shopY + 900, 48, '#ffcf8f')}${sparkle(1520, shopY + 1300, 18)}`;

const ltY = Y.letter;
const LETTER = [
  `For as long as there have been goldsmiths, there have been two ledgers: the one kept in the drawer, and the one kept in the customer’s memory. Beatris was made so that the two never disagree.`,
  `It weighs as you weigh, to the thousandth of a gram. It prices a piece the moment it leaves the showcase — the gold, the making charge and the profit each in its place, and the tax laid on the making alone, as the law of 1405 asks.`,
  `When a customer wonders aloud what three per cent would do, the answer is already on the desk, and nothing changes until you say so. When they bring an old bracelet, it is taken in the same breath as the new ring.`,
  `It remembers what they chose last spring, and what is still owed. It gives your seller a counter, your operator a keyboard, and the master of the house a single page that says how the day is going.`,
  `Nothing in its books is ever rubbed out. A correction is a new page that names the one it amends, and every page is sealed, so that years from now any figure can be traced to the hand that wrote it.`,
  `And the door opens with nothing more than an email.`,
];
const PARTS = [
  ['Weights', 'to the milligram'],
  ['Prices', 'from the day’s gold'],
  ['Tax', 'making & profit only'],
  ['Corrections', 'amended, never erased'],
  ['Sign-in', 'a code by email'],
  ['Each shop', 'its own database'],
  ['Offline', 'queued, then booked'],
  ['Roles', 'four desks'],
];
const letter = `
${thought('حساب را پاک نمی‌کنیم؛ اصلاح می‌کنیم، و امضا می‌کنیم.', 'We never erase. We amend — and sign.', ltY - 20)}
${sphere(40, ltY + 260, 90, '#ffc6d9')}${cloud(-60, ltY + 1180, 360, 0.9)}${cloud(1300, ltY + 1240, 330, 0.9)}
<div class="abs letter" style="${at(130, ltY + 190, 1340, 1180, 'transform:rotate(-0.6deg)')}">
  <div class="lt-top">
    <div class="lt-house">THE HOUSE OF BEATRIS</div>
    <div class="lt-rule"></div>
    <div class="lt-sub">A Letter to the Jeweller · Autumn MMXXVI</div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 330px;gap:54px;padding:34px 92px 0">
    <div>
      <div class="lt-dear">Dear Jeweller,</div>
      <div class="lt-body" style="margin-top:20px">${LETTER.map((p, i) => `<p class="${i ? '' : 'first'}">${p}</p>`).join('')}</div>
    </div>
    <div style="padding-top:18px">
      <div class="cameo" style="width:250px;height:300px;margin:0 auto"><img src="ig3/props/ring-solitaire.png" alt="" style="width:250px;filter:drop-shadow(0 18px 20px rgba(0,0,0,.45))"></div>
      <div class="lt-parts" style="margin-top:46px"><h5>PARTICULARS</h5>${PARTS.map(([a, b]) => `<div class="lt-row"><span>${a}</span><i></i><span>${b}</span></div>`).join('')}</div>
    </div>
  </div>
  <div style="text-align:center;padding-top:30px">
    <p style="font:italic 400 21px/1.5 'Playfair';color:#4a4a5e">With the respect one craftsman owes another,</p>
    <div class="lt-sign" style="margin-top:4px">Beatris</div>
    <div class="lt-motto" style="margin-top:16px">WEIGHED · PRICED · SIGNED</div>
  </div>
  <div class="seal" style="position:absolute;right:70px;bottom:64px;width:120px;height:120px;transform:rotate(-8deg)"><b>B</b></div>
</div>
${prop('ring-halo', 1290, ltY + 110, 250, 22)}`;

const NUMS = [
  ['۴۲۱', 'آزمون واحد، همه سبز', 'unit tests, all green', '#c9b6ff'],
  [e2e, 'بررسی در مرورگر', 'browser checks', '#ffc2d4'],
  ['۱۰٪', 'مالیات، فقط اجرت و سود', 'tax on making & profit', '#ffe39a'],
  ['۴', 'میز برای چهار نقش', 'role desks', '#9ff0d6'],
  ['۰', 'رمز عبور', 'passwords to forget', '#b3d1ff'],
];
const nums = `${NUMS.map(([n, f, e, c], i) => `<div class="abs num" style="${at(70 + i * 300, Y.nums + (i % 2 ? 70 : 0), 260, 260, `--c:${c}`)}"><div><b>${n}</b><span>${f}</span><small>${e}</small></div></div>`).join('')}`;

const cta = `
<div class="abs cta" style="${at(0, Y.cta + 120, W, null, 'text-align:center')}">
  <p class="fa">فردا صبح، گالری‌تان را با یک ایمیل باز کنید.</p>
  <p class="en">Tomorrow morning, open your shop with an email.</p>
</div>
<div class="abs" style="${at(0, Y.cta + 330, W, null, 'display:flex;justify-content:center;align-items:center;gap:40px')}">
  <span class="url">beatris-production-68ac.up.railway.app</span>
  <div style="padding:10px;border-radius:22px;background:#fff8ec;box-shadow:0 20px 40px -20px rgba(20,10,50,.6)">${qr}</div>
</div>
${prop('coin', 110, Y.cta + 230, 200, -12)}${prop('ring-band', 1300, Y.cta + 250, 200, 18)}${sparkle(300, Y.cta + 40, 20)}${sparkle(1290, Y.cta + 70, 16)}
<div class="abs credits" style="${at(160, Y.cta + 640, W - 320, null)}">
  <p class="fa">صفحه‌ها از فروشگاه نمایشی خود اپ و با داده‌ی نمونه‌اند؛ هر رقمِ این برگه را موتورهای خود بئاتریس حساب کرده‌اند.</p>
  <p>Screens: the app’s demo shop with sample data. Gold objects drawn by the Beatris studio. Coin photograph: M.samei, CC BY-SA 4.0, Wikimedia Commons. Type: Vazirmatn, Estedad, Markazi, Playfair Display, Plus Jakarta Sans, Pinyon Script (SIL Open Font License).</p>
</div>`;

const html = `<!doctype html><html lang="fa"><head><meta charset="utf-8"><title>Beatris — The Golden Dream</title><style>${css}</style></head>
<body>${hero}${mail}${desk}${roles}${shop}${letter}${nums}${cta}</body></html>`;
writeFileSync(path.join(DIR, 'infographic3.html'), html);
console.log('html written', `net ${base.net}`, `3% ${whatIf.disc3.net}`, `half ${whatIf.ojratHalf.net}`);

/* ---------------- render ---------------- */
// The page is drawn in ten bands and stitched: one very tall capture can lose composited layers (glass, shadows)
// and even whole headings, while a band the size of a screen is always drawn complete.
const FF = process.env.FFMPEG ?? 'ffmpeg';
async function shoot(page, dpr, file, q) {
  const n = 10, band = H / n;
  const dir = mkdtempSync(path.join(tmpdir(), 'ig3-'));
  try {
    await page.setViewportSize({ width: W, height: band });
    for (let i = 0; i < n; i++) {
      await page.evaluate((y) => (document.body.style.transform = `translateY(${-y}px)`), i * band);
      await page.waitForTimeout(200);
      await page.screenshot({ path: path.join(dir, `b${i}.png`) });
    }
    const ins = Array.from({ length: n }, (_, i) => ['-i', path.join(dir, `b${i}.png`)]).flat();
    const r = spawnSync(FF, ['-loglevel', 'error', '-y', ...ins, '-filter_complex', `vstack=inputs=${n}`, '-q:v', String(q), file]);
    if (r.status !== 0) throw new Error(`ffmpeg: ${r.stderr}`);
    await page.evaluate(() => (document.body.style.transform = ''));
    await page.setViewportSize({ width: W, height: H });
    console.log('jpg', file, `${Math.round(W * dpr)}×${Math.round(H * dpr)}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
async function open(browser, url, dpr) {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: dpr });
  page.on('pageerror', (e) => console.error('pageerror', e.message));
  page.on('requestfailed', (r) => console.error('missing', r.url()));
  await page.goto(url, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0), null, { timeout: 30000 });
  await page.waitForTimeout(600);
  return page;
}
if (!arg('html-only')) {
  const pw = await import(process.env.PLAYWRIGHT ?? '/opt/node22/lib/node_modules/playwright/index.mjs');
  const { chromium } = pw.default ?? pw;
  const preview = !!arg('preview');
  const out = arg('out') ? path.resolve(String(arg('out'))) : path.join(ROOT, 'public/media/promo');
  mkdirSync(out, { recursive: true });
  const srv = await serveRoot();
  const url = `${srv.url}/scripts/promo-film/infographic3.html`;
  const browser = await chromium.launch();
  try {
    if (preview) {
      const page = await open(browser, url, 1300 / W);
      await shoot(page, 1300 / W, path.join(out, 'ig3-preview.jpg'), 4);
    } else {
      // print size: 1.5× (2400 px wide), the PDF in vectors, and a copy under 8000 px for chats and phones
      const page = await open(browser, url, 1.5);
      await shoot(page, 1.5, path.join(out, 'beatris-infographic-3.jpg'), 3);
      await page.pdf({ path: path.join(out, 'beatris-infographic-3.pdf'), width: `${W}px`, height: `${H}px`, printBackground: true, pageRanges: '1' });
      const small = await open(browser, url, 7990 / H);
      await shoot(small, 7990 / H, path.join(out, 'beatris-infographic-3-preview.jpg'), 3);
      console.log('pdf + preview written');
    }
  } finally {
    await browser.close();
    srv.close();
  }
}
