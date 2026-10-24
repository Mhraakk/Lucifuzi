// «رؤیای طلایی» — the bright teaser (32 s, 1920×1080): the infographic's dreamscape set in motion. Seven scenes:
// dawn and the name; one email, one code; the live sales desk with an engine-computed what-if; a desk for every role;
// the whole house in three pages; a letter to the jeweller with its wax seal; the way in. Every frame is seek(t): a
// pure function of the clock, so a render is repeatable (render.mjs dream --check). Figures come from sell.mjs.
//   node scripts/promo-film/dream.mjs                  → dream.html
//   node scripts/promo-film/render.mjs dream [fps]     → frames-dream/ and sfx.json
import { writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as S from '../../public/js/sell.mjs';
import { qrSvg } from '../../public/js/qr.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const fa = (s) => String(s).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);
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

/* the worked example, from the engine: the very cart on the desk's screenshots (app-shots.mjs: a ring and a pair of
   studs out, 3.1 g of old gold in, at the demo shop's 24,000,000 toman a gram), so the counter, the what-if card and
   the customer's screen all show the same figures */
const P750 = 24000000;
const piece = (id, tpl, title, weight, ojrat) => ({ id, code: id, tpl, title, weight, fineness: 750, ojratMode: 'pct', ojrat, profitPct: 7, stones: 0 });
const cart = {
  lines: [S.lineFromItem(piece('r', 'ring-w', 'انگشتر برگ زیتون', 3.42, 18), P750), S.lineFromItem(piece('e', 'er-stud', 'گوشواره میخی مروارید', 2.08, 20), P750)],
  tradeIns: [{ title: 'طلای کهنه', weight: 3.1, stoneWeight: 0, fineness: 740, p750: P750, deductPct: 0 }],
  payments: [],
};
const base = S.totals(cart, { vatPct: 10 }).net;
const disc = S.scenarios(cart, { vatPct: 10, canDiscount: true }).find((s) => s.id === 'disc3').net;
// the address on the end card: production on Render; BEATRIS_SITE names another deploy without touching the film
const SITE = process.env.BEATRIS_SITE || 'https://beatris-6u77.onrender.com';
const qr = qrSvg(SITE, { size: 200, dark: '#2a1b47', light: '#fff8ec' });

const FEATURES = [
  ['desk-pay.jpg', 'میز معامله', 'The Trade Desk', 'آبشده، سکه، شمش و ارز با صفحه‌کلید', '5% 36% 40% 0%', '#ffd2c2'],
  ['card-window.jpg', 'کارتخوان یک‌ضرب', 'One-tap Card', 'مبلغ دقیقِ باقی‌مانده، حتی از گوشی', '6% 4% 30% 4%', '#d9d2ff'],
  ['daybook.jpg', 'روزنگار', 'The Day Book', 'هر رقم امروز، بخش‌به‌بخش', '10% 31% 38% 2%', '#c9f2e4'],
  ['dashboard.jpg', 'داشبورد و نبض', 'Pulse & Dashboard', 'حال فروشگاه در یک جمله', '9% 9% 36% 22%', '#ffe9b0'],
  ['elliott.jpg', 'بازار و الیوت', 'Market & Elliott', 'موج و فیبوناچی روی همان نمودار', '22% 33% 6% 1%', '#ffd0e2'],
  ['coinlab.jpg', 'آزمایشگاه سکه', 'The Coin Lab', 'سکه‌ی واقعی و ترفندهای تقلب', '12% 24% 14% 22%', '#cfe2ff'],
  ['studio.jpg', 'استودیوی جواهر', 'Jewellery Studio', 'طراحی سه‌بعدی با وزن واقعی', '12% 32% 14% 12%', '#ffdccb'],
  ['invoice-a4.jpg', 'فاکتور رسمی و اصالت', 'Invoice & Provenance', 'مالیات فقط روی اجرت و سود', '3% 2% 66% 2%', '#e3f6c9'],
  ['learn.jpg', 'آموزش و تمرین', 'The Academy', 'از صفر تا استادی', '8% 26% 46% 8%', '#e6d8ff'],
];
const ROLES = [
  ['crown', 'رئیس', 'The Proprietor', 'نبض، تأییدها و فروش امروز', '/work', '#ffb39b', '#ffe2cf', '#f48d7a'],
  ['keys', 'اپراتور', 'The Operator', 'صفحه‌کلید، ورود تک‌خطی و صف', '/books/desk', '#9fb0ff', '#e1e3ff', '#7d8ef2'],
  ['gem', 'فروشنده', 'The Seller', 'میز فروش زنده و رزروها', '/books/sell', '#8fe3c6', '#dcf8ee', '#5cc9a6'],
  ['book', 'کارمند', 'The Apprentice', 'درس، تمرین و ابزار', '/', '#ffd77a', '#fff2c8', '#f2b947'],
];
const ICON = {
  crown: '<path d="M6 34h36l3-20-11 8-10-14-10 14-11-8z"/><path d="M8 40h32"/>',
  keys: '<rect x="4" y="12" width="40" height="24" rx="4"/><path d="M10 19h3M17 19h3M24 19h3M31 19h3M10 25h3M17 25h3M24 25h3M31 25h3M14 31h20"/>',
  gem: '<path d="M14 8h20l8 10-18 24L6 18z"/><path d="M6 18h36M18 8l-4 10 10 24 10-24-4-10"/>',
  book: '<path d="M24 12c-6-4-12-4-18-3v28c6-1 12-1 18 3 6-4 12-4 18-3V9c-6-1-12-1-18 3z"/><path d="M24 12v28"/>',
  mail: '<rect x="5" y="11" width="38" height="27" rx="4"/><path d="M6 13l18 14 18-14"/>',
  check: '<path d="M12 25l8 8 16-18"/>',
};
const icon = (k, c, s, sw = 2.4) => `<svg viewBox="0 0 48 48" width="${s}" height="${s}" fill="none" stroke="${c}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${ICON[k]}</svg>`;
const cloud = (id, w) => `<svg class="abs cloud" id="${id}" viewBox="0 0 320 130" style="width:${w}px"><g fill="#fff"><circle cx="92" cy="78" r="46"/><circle cx="152" cy="58" r="58"/><circle cx="214" cy="76" r="44"/><circle cx="252" cy="92" r="30"/><rect x="58" y="80" width="214" height="44" rx="22"/></g></svg>`;
const spark = (id, s = 22) => `<svg class="abs spark" id="${id}" viewBox="-10 -10 20 20" style="width:${s}px;height:${s}px"><path d="M0-10C1-2 2-1 10 0C2 1 1 2 0 10C-1 2-2 1-10 0C-2-1-1-2 0-10Z" fill="#fff"/></svg>`;
const prop = (id, name, w) => `<img class="abs prop" id="${id}" src="ig3/props/${name}.png" alt="" style="width:${w}px">`;
const lens = (id, file, w, maxh, cap) => `<figure class="abs lens" id="${id}"><img src="shots-day/${file}" alt="" style="height:${Math.min(maxh || 1e9, hOf(file, w - 12))}px;width:${w - 12}px">${cap ? `<figcaption>${cap}</figcaption>` : ''}</figure>`;

const SFX = [
  [0.25, 'whoosh', -12], [1.0, 'shimmer', -10], [3.45, 'whoosh', -8], [4.1, 'pop', -11], [4.65, 'whoosh', -13],
  ...[0, 1, 2, 3, 4, 5].map((i) => [5.5 + i * 0.18, 'tick', -10]), [6.95, 'shimmer', -13], [8.02, 'whoosh', -8],
  [9.8, 'pop', -10], [10.8, 'pop', -10], [12.8, 'tick', -8], [13.05, 'whoosh', -13], [14.05, 'pop', -11], [15.0, 'whoosh', -8],
  ...[0, 1, 2, 3].map((i) => [15.6 + i * 0.25, 'pop', -12]), [19.45, 'whoosh', -10], [21.4, 'whoosh', -14], [23.0, 'whoosh', -14],
  [24.42, 'whoosh', -9], [25.3, 'shimmer', -15], [27.62, 'thump', -4], [28.6, 'whoosh', -9], [29.0, 'shimmer', -10], [29.05, 'hit', -8],
].map(([t, kind, gain]) => ({ t, kind, gain }));

const css = `
@font-face{font-family:'Vazir';src:url(/fonts/vazirmatn-var.woff2) format('woff2');font-weight:100 900}
@font-face{font-family:'Estedad';src:url(/fonts/estedad-arabic-var.woff2) format('woff2');font-weight:100 900;unicode-range:U+0600-06FF,U+200C-200F,U+FB50-FDFF,U+FE70-FEFF}
@font-face{font-family:'Estedad';src:url(/fonts/estedad-latin-var.woff2) format('woff2');font-weight:100 900;unicode-range:U+0000-00FF}
${[400, 600, 700, 900].map((w) => `@font-face{font-family:'Playfair';src:url(fonts/playfair-display-latin-${w}-normal.woff2) format('woff2');font-weight:${w}}@font-face{font-family:'Playfair';src:url(fonts/playfair-display-latin-${w}-italic.woff2) format('woff2');font-weight:${w};font-style:italic}`).join('\n')}
${[400, 500, 600, 700].map((w) => `@font-face{font-family:'Jakarta';src:url(fonts/plus-jakarta-sans-latin-${w}-normal.woff2) format('woff2');font-weight:${w}}`).join('\n')}
@font-face{font-family:'Pinyon';src:url(fonts/pinyon-script-latin-400-normal.woff2) format('woff2')}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:1920px;height:1080px;overflow:hidden;background:#2a1b47}
#stage{position:relative;width:1920px;height:1080px;overflow:hidden;color:#2a1b47;font-family:'Vazir',sans-serif}
.bg,.sc{position:absolute;inset:0}
.sc{visibility:hidden}
.abs{position:absolute;left:0;top:0}
.fa{direction:rtl}
.prop{filter:drop-shadow(0 40px 34px rgba(80,40,90,.28)) drop-shadow(0 6px 8px rgba(80,40,90,.16))}
.cloud{filter:drop-shadow(0 18px 18px rgba(120,90,170,.18))}
.spark{filter:drop-shadow(0 0 6px rgba(255,255,255,.95))}
.sph{position:absolute;border-radius:50%;background:radial-gradient(circle at 32% 28%,#fff 0,var(--c) 36%,color-mix(in srgb,var(--c) 62%,#2a1b47) 100%);box-shadow:0 34px 60px -28px rgba(42,27,71,.45)}
.floor{position:absolute;left:-30%;width:160%;transform:perspective(760px) rotateX(64deg);transform-origin:50% 0;background:repeating-conic-gradient(var(--f1) 0 25%,var(--f2) 0 50%) 0 0/150px 150px;-webkit-mask-image:linear-gradient(180deg,transparent 0,#000 18%,#000 72%,transparent 100%)}
.arch{position:absolute;border-radius:9999px 9999px 0 0;background:var(--rim);box-shadow:0 60px 90px -50px rgba(42,27,71,.5)}
.arch>i{position:absolute;inset:22px 22px 0 22px;border-radius:9999px 9999px 0 0;background:linear-gradient(180deg,var(--a),var(--b));box-shadow:inset 0 40px 80px rgba(255,255,255,.35)}
.sun{position:absolute;border-radius:50%;background:radial-gradient(circle at 40% 35%,#fff7cf 0,#ffd98a 40%,#ffa77e 100%);box-shadow:0 0 140px 40px rgba(255,190,140,.45)}
.mon .scr{padding:14px;border-radius:26px;background:linear-gradient(150deg,#fff,#ece6f6);box-shadow:0 50px 90px -40px rgba(42,27,71,.55),inset 0 0 0 1px rgba(42,27,71,.06)}
.mon img{display:block;border-radius:14px}
.mon .neck{width:16%;height:70px;margin:0 auto;background:linear-gradient(90deg,#e1d9ef,#fbf8ff 50%,#d7cdea);clip-path:polygon(18% 0,82% 0,100% 100%,0 100%)}
.mon .foot{width:36%;height:16px;margin:0 auto;border-radius:12px;background:linear-gradient(#f6f1ff,#d8cdec)}
.ph{padding:10px;border-radius:48px;background:linear-gradient(150deg,#fff,#ece6f5);box-shadow:0 46px 70px -30px rgba(42,27,71,.5),inset 0 0 0 1px rgba(42,27,71,.07)}
.ph img{display:block;border-radius:38px;object-fit:cover;object-position:bottom}
.lens{padding:6px;border-radius:28px;background:#fff;box-shadow:0 40px 70px -34px rgba(42,27,71,.55)}
.lens img{display:block;border-radius:22px;object-fit:cover;object-position:top}
.lens figcaption{position:absolute;right:18px;bottom:-24px;padding:9px 18px;border-radius:999px;background:#2a1b47;color:#fff;font:600 20px/1.4 'Vazir';direction:rtl;white-space:nowrap}
.eyebrow{font:700 16px/1 'Jakarta';letter-spacing:.32em;text-transform:uppercase;color:#7a6b9c}
.h-fa{font:900 96px/1.25 'Estedad';direction:rtl}
.h-en{font:italic 600 44px/1.3 'Playfair';color:#4c3b74}
.glass{border-radius:30px;background:rgba(255,255,255,.66);backdrop-filter:blur(10px);box-shadow:0 40px 70px -40px rgba(42,27,71,.5),inset 0 0 0 1px rgba(255,255,255,.85)}
.code{display:flex;gap:16px;direction:ltr}
.code i{display:grid;place-items:center;width:92px;height:112px;border-radius:22px;background:#fff;font:800 58px/1 'Estedad';font-style:normal;box-shadow:0 22px 30px -18px rgba(42,27,71,.55)}
.card{border-radius:30px;overflow:hidden;box-shadow:0 46px 70px -40px rgba(42,27,71,.5),inset 0 0 0 1px rgba(255,255,255,.85)}
.card .win{margin:14px;border-radius:20px;overflow:hidden;background:#fff}
.card .win img{display:block;width:100%;height:300px;object-fit:cover}
.card .tx{padding:6px 28px;direction:rtl}
.card b{display:block;font:900 40px/1.35 'Estedad'}
.card small{display:block;direction:ltr;text-align:right;font:italic 500 24px/1.3 'Playfair';color:#7a6b9c}
.card p{font:400 22px/1.7 'Vazir';color:#4c3b74}
.role{text-align:center}
.role h3{margin-top:16px;font:900 58px/1.2 'Estedad';direction:rtl}
.role h4{font:italic 600 28px/1.3 'Playfair';color:#4c3b74}
.role p{margin:18px 30px 0;font:500 23px/1.6 'Vazir';direction:rtl}
.role code{display:inline-block;margin-top:18px;padding:7px 18px;border-radius:999px;background:rgba(255,255,255,.75);font:600 18px/1.4 'Jakarta';color:#4c3b74}
.paper{background:#fbf5e8;border-radius:6px;box-shadow:0 70px 120px -60px rgba(42,27,71,.7),inset 0 0 120px rgba(190,150,90,.16);color:#1d2650;font-family:'Playfair',serif}
.paper::before{content:'';position:absolute;inset:26px;border:1.5px solid #b8914a;outline:1px solid #b8914a;outline-offset:6px}
.seal{border-radius:50%;background:radial-gradient(circle at 38% 34%,#c2445f 0,#9c2440 45%,#5e1226 100%);box-shadow:0 18px 26px -10px rgba(60,10,25,.6),inset 0 -8px 18px rgba(0,0,0,.25);display:grid;place-items:center}
.seal b{font:italic 900 86px/1 'Playfair';color:rgba(255,220,200,.75)}
.cameo{border-radius:50%;background:radial-gradient(circle at 50% 40%,#2c3a7a 0,#1b2350 60%,#10163a 100%);box-shadow:0 0 0 8px #fbf5e8,0 0 0 10px #b8914a,0 0 0 14px #fbf5e8,0 0 0 15px #b8914a,0 30px 50px -20px rgba(20,20,60,.6);overflow:hidden;display:grid;place-items:center}
.gold{background:linear-gradient(100deg,#9a6610 8%,#e9b54a 28%,#fff2c4 44%,#e0a63a 58%,#b97f1e 78%,#f3cf74 92%);background-size:200% 100%;-webkit-background-clip:text;background-clip:text;color:transparent}
.gold.deep{background-image:linear-gradient(100deg,#6e4204 6%,#b0740f 26%,#efc055 42%,#c4861b 58%,#82520a 78%,#d29a35 92%)}
.url{display:inline-flex;align-items:center;padding:18px 34px;border-radius:999px;background:rgba(255,255,255,.18);box-shadow:inset 0 0 0 1px rgba(255,255,255,.5);font:600 30px/1 'Jakarta';color:#fff}
#note{position:absolute;left:28px;bottom:22px;font:500 15px/1 'Jakarta';color:rgba(42,27,71,.55);letter-spacing:.06em}
#note b{font:500 16px/1 'Vazir';margin-right:10px}
#flash{position:absolute;inset:0;background:#fff;opacity:0;pointer-events:none}
`;

const html = `<!doctype html><html lang="fa"><head><meta charset="utf-8"><title>Beatris — The Golden Dream</title><style>${css}</style></head><body><div id="stage">
<div class="bg" id="bg1" style="background:linear-gradient(180deg,#ffe9dc 0%,#ffd3c4 55%,#f9c3d8 100%)"></div>
<div class="bg" id="bg2" style="background:linear-gradient(180deg,#efe2ff 0%,#e1d6ff 50%,#d5e1ff 100%);opacity:0"></div>
<div class="bg" id="bg3" style="background:linear-gradient(160deg,#d6e4ff 0%,#dcecff 45%,#d8f6ec 100%);opacity:0"></div>
<div class="bg" id="bg4" style="background:linear-gradient(180deg,#e3f8ef 0%,#f3f9e0 45%,#fff1c9 100%);opacity:0"></div>
<div class="bg" id="bg5" style="background:linear-gradient(180deg,#fff1c9 0%,#ffe0c9 50%,#fbd2e2 100%);opacity:0"></div>
<div class="bg" id="bg6" style="background:linear-gradient(180deg,#eadcff 0%,#e3d5ff 100%);opacity:0"></div>
<div class="bg" id="bg7" style="background:linear-gradient(170deg,#ffb08e 0%,#f07aa6 45%,#7a55e0 85%,#3a2768 100%);opacity:0"></div>

<section class="sc" id="s1">
  <i class="sun" id="sun" style="width:560px;height:560px"></i>
  ${cloud('c1', 420)}${cloud('c2', 300)}${cloud('c3', 360)}
  <div class="floor" style="top:840px;height:640px;--f1:#efe3ff;--f2:#d9c6ff"></div>
  <i class="sph" id="sp1" style="width:150px;height:150px;--c:#c9b6ff"></i><i class="sph" id="sp2" style="width:80px;height:80px;--c:#9ff0d6"></i><i class="sph" id="sp3" style="width:56px;height:56px;--c:#ffe39a"></i>
  ${prop('p1', 'ring-solitaire', 380)}${prop('p2', 'coin', 300)}${prop('p3', 'ring-band', 220)}${prop('p4', 'bar', 360)}
  ${spark('k1')}${spark('k2', 16)}${spark('k3', 20)}
  <div class="abs" id="top" style="width:1920px;top:40px;display:flex;justify-content:space-between;padding:0 64px"><span class="eyebrow">Beatris · Gold Shop Operating System</span><span class="fa" style="font:700 22px/1 'Vazir';color:#4c3b74">بئاتریس · سیستم‌عامل گالری طلا</span></div>
  <h1 class="abs gold deep" id="title" style="width:1920px;top:150px;text-align:center;font:italic 900 250px/1.05 'Playfair';filter:drop-shadow(0 3px 0 rgba(110,60,10,.28)) drop-shadow(0 16px 26px rgba(150,80,30,.3))">Beatris</h1>
  <p class="abs fa" id="tag" style="width:1920px;top:450px;text-align:center;font:900 70px/1.3 'Estedad'">جایی که طلا، حسابِ خودش را نگه می‌دارد.</p>
  <p class="abs" id="tagen" style="width:1920px;top:560px;text-align:center;font:italic 500 42px/1.3 'Playfair';color:#4c3b74">Where gold keeps its own books.</p>
</section>
<div class="arch" id="portal" style="width:600px;height:760px;--a:#efe2ff;--b:#d5e1ff;--rim:#f6aebf;visibility:hidden"><i></i></div>

<section class="sc" id="s2">
  <div class="floor" style="top:820px;height:640px;--f1:#efe3ff;--f2:#d9c6ff"></div>
  ${cloud('c4', 380)}
  <figure class="abs ph" id="phone" style="width:400px"><img src="shots-day/login-code.jpg" alt="" style="width:380px;height:${Math.round(hOf('login-code.jpg', 380) * 0.62)}px"></figure>
  <div class="abs" id="mail" style="width:130px;height:130px">${icon('mail', '#7b62e6', 130, 2.2)}</div>
  <div class="abs" style="left:120px;width:1040px;top:150px;text-align:right;direction:rtl">
    <div class="eyebrow" id="m0" style="direction:ltr;text-align:right">Passwordless · ورود بی‌رمز</div>
    <h2 class="h-fa" id="m1" style="font-size:108px;margin-top:20px">یک ایمیل. یک کد.</h2>
    <p class="h-en" id="m2" style="direction:ltr;text-align:right;font-size:50px">One email. One code.</p>
    <div class="code" id="tiles" style="justify-content:flex-end;margin-top:34px">${[...'۱۱۸۴۳۵'].map((d, i) => `<i id="d${i}">${d}</i>`).join('')}</div>
    <div id="m3" style="display:flex;align-items:center;gap:20px;margin-top:44px;justify-content:flex-start"><span style="display:grid;place-items:center;width:84px;height:84px;border-radius:50%;background:#2bb38a">${icon('check', '#fff', 60, 4)}</span><b style="font:900 76px/1.2 'Estedad'">فروشگاه باز است.</b></div>
    <p id="m4" style="direction:ltr;text-align:right;margin-top:14px;font:italic 400 32px/1.3 'Playfair';color:#4c3b74">The shop is open — no password, no one to wait for.</p>
  </div>
</section>

<section class="sc" id="s3">
  <div class="floor" style="top:880px;height:600px;--f1:#e3f0ff;--f2:#c8dcff"></div>
  <div id="deskwrap" class="abs" style="width:1920px;height:1080px">
    <div class="arch" style="left:60px;top:250px;width:1180px;height:900px;--a:#bfe0ff;--b:#f1f7ff;--rim:#a9c3ff"><i></i></div>
    <figure class="abs mon" id="mon" style="left:110px;top:300px;width:1080px"><div class="scr"><img src="shots-day/sell.jpg" alt="" style="width:1052px;height:${hOf('sell.jpg', 1052)}px"></div><div class="neck"></div><div class="foot"></div></figure>
  </div>
  <div class="abs fa" id="dh" style="width:1920px;top:46px;padding:0 80px;text-align:right">
    <div class="eyebrow" style="direction:ltr;text-align:right">New in this release · The Live Sales Desk</div>
    <h2 class="h-fa" style="font-size:92px;margin-top:6px">میز فروش زنده</h2>
  </div>
  <p class="abs h-en" id="den" style="width:1920px;top:212px;padding:0 80px;text-align:right;font-size:30px">Before they ask “what if…?”, the answer is already on the desk.</p>
  ${lens('l1', 'sell-customer.jpg', 440, 430, '۱ · پرونده‌ی مشتری')}
  ${lens('l2', 'sell-whatif.jpg', 460, 320, '۲ · اگر…؟')}
  ${lens('l3', 'sell-screen.jpg', 660, 0, '۳ · صفحه‌ی مشتری')}
  ${lens('l4', 'sell-thanks.jpg', 330, 0, '۴ · سپاس از خرید')}
  <div class="abs glass" id="ctr" style="width:620px;padding:24px 34px;direction:rtl">
    <div style="display:flex;justify-content:space-between;align-items:baseline"><span id="ctrl" style="font:600 26px/1.4 'Vazir';color:#4c3b74">قابل پرداخت</span><span class="eyebrow" style="font-size:12px">Computed by the engine</span></div>
    <div id="ctrv" style="font:900 56px/1.25 'Estedad';margin-top:6px">۰</div>
    <div id="ctrd" style="display:inline-block;margin-top:8px;padding:6px 16px;border-radius:999px;background:#2bb38a;color:#fff;font:700 22px/1.4 'Vazir'"></div>
  </div>
</section>

<section class="sc" id="s4">
  <div class="floor" style="top:920px;height:560px;--f1:#fff3cf;--f2:#ffe2a8"></div>
  <div class="abs" id="rh" style="width:1920px;top:44px;text-align:center"><h2 class="h-fa" style="font-size:92px">هر نقش، میز خودش</h2><p class="h-en" style="font-size:32px;margin-top:2px">A desk for every role — and no layout opens a door the role keeps shut.</p></div>
  ${ROLES.map(([k, f, e, line, start, a, b, rim], i) => `<div class="abs" id="r${i}" style="left:${120 + i * 430}px;top:300px;width:380px;height:640px"><div class="arch" style="inset:0;--a:${a};--b:${b};--rim:${rim}"><i></i></div><div class="abs role" style="width:380px;top:110px">${icon(k, '#2a1b47', 64)}<h3>${f}</h3><h4>${e}</h4><p>${line}</p><code>${start}</code></div></div>`).join('')}
</section>

<section class="sc" id="s5">
  <div class="abs" id="fh" style="width:1920px;top:44px;text-align:center"><h2 class="h-fa" style="font-size:90px">همه‌ی گالری، یک‌جا</h2><p class="h-en" style="font-size:34px">The whole house, in one place</p></div>
  <div class="abs" id="belt" style="width:1920px;height:1080px;perspective:1800px">
    ${FEATURES.map(([file, f, e, line, box, c], i) => `<div class="abs card" id="f${i}" style="width:520px;height:580px;top:290px;background:linear-gradient(170deg,${c},rgba(255,255,255,.75))"><div class="win"><img src="shots-day/${file}" alt="" style="object-view-box:inset(${box})"></div><div class="tx"><b>${f}</b><small>${e}</small><p>${line}</p></div></div>`).join('')}
  </div>
</section>

<section class="sc" id="s6">
  ${cloud('c5', 420)}${cloud('c6', 360)}
  <div class="abs paper" id="paper" style="width:1560px;height:960px">
    <div class="abs" style="width:1560px;top:70px;text-align:center"><div style="font:700 20px/1 'Playfair';letter-spacing:.42em;color:#7a2440">THE HOUSE OF BEATRIS</div><div style="width:460px;height:8px;margin:18px auto;border-top:1.5px solid #b8914a;border-bottom:.8px solid #b8914a"></div><div style="font:italic 400 22px/1.3 'Playfair';color:#6d5a3a">A Letter to the Jeweller · Autumn MMXXVI</div></div>
    <div class="abs" id="dear" style="left:130px;top:200px;font:400 110px/1.2 'Pinyon';color:#7a2440;white-space:nowrap">Dear Jeweller,</div>
    <p class="abs" id="ln1" style="left:130px;top:390px;width:930px;font:400 38px/1.5 'Playfair'">Gold has weight. So does trust.</p>
    <p class="abs" id="ln2" style="left:130px;top:470px;width:930px;font:400 38px/1.5 'Playfair'">Nothing is ever erased:<br>a correction is a new page, signed.</p>
    <p class="abs" id="ln3" style="left:130px;top:604px;width:930px;font:400 38px/1.5 'Playfair'">And the door opens with nothing more than an email.</p>
    <div class="abs cameo" id="cam" style="left:1150px;top:210px;width:280px;height:340px"><img src="ig3/props/ring-solitaire.png" alt="" style="width:270px;filter:drop-shadow(0 18px 20px rgba(0,0,0,.45))"></div>
    <p class="abs" id="bye" style="left:130px;top:730px;font:italic 400 26px/1.4 'Playfair';color:#4a4a5e">With the respect one craftsman owes another,</p>
    <div class="abs" id="sign" style="left:120px;top:770px;font:400 124px/1.1 'Pinyon';color:#7a2440;white-space:nowrap">Beatris</div>
    <div class="abs seal" id="seal" style="left:1230px;top:690px;width:150px;height:150px"><b>B</b></div>
    <div class="abs" style="width:1560px;top:890px;text-align:center;font:700 15px/1 'Playfair';letter-spacing:.5em;color:#8a6a2f">WEIGHED · PRICED · SIGNED</div>
  </div>
</section>

<section class="sc" id="s7">
  ${prop('q1', 'coin', 250)}${prop('q2', 'ring-band', 230)}${prop('q3', 'ring-halo', 220)}${prop('q4', 'ring-solitaire', 210)}
  ${spark('k4', 22)}${spark('k5', 16)}${spark('k6', 20)}${spark('k7', 14)}
  <p class="abs fa" id="e1" style="width:1920px;top:250px;text-align:center;font:900 78px/1.3 'Estedad';color:#fff;text-shadow:0 8px 30px rgba(42,20,80,.35)">فردا صبح، گالری‌تان را با یک ایمیل باز کنید.</p>
  <p class="abs" id="e2" style="width:1920px;top:368px;text-align:center;font:italic 500 44px/1.3 'Playfair';color:#fff3f8">Tomorrow morning, open your shop with an email.</p>
  <div class="abs" id="e3" style="width:1920px;top:500px;display:flex;justify-content:center;align-items:center;gap:44px"><span class="url">${SITE.replace(/^https?:\/\//, '')}</span><div style="padding:10px;border-radius:22px;background:#fff8ec">${qr}</div></div>
  <div class="abs gold" id="e4" style="width:1920px;top:800px;text-align:center;font:italic 900 120px/1.1 'Playfair'">Beatris</div>
</section>

<div id="flash"></div>
<div id="note"><b>داده‌ی نمونه</b>Sample data · demo shop</div>
</div>
<script>
const DUR = 32;
window.DUR = DUR;
window.SFX = ${JSON.stringify(SFX)};
const BASE = ${base}, DISC = ${disc};
const $ = (id) => document.getElementById(id);
const C = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const P = (t, a, b) => C((t - a) / (b - a));
const L = (a, b, k) => a + (b - a) * k;
const o3 = (k) => 1 - (1 - k) ** 3;
const io = (k) => (k < 0.5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2);
const back = (k) => { const c = 1.70158; return 1 + (c + 1) * (k - 1) ** 3 + c * (k - 1) ** 2; };
const i3 = (k) => k ** 3;
const bob = (t, a, per, ph = 0) => a * Math.sin((2 * Math.PI * t) / per + ph);
const fmt = (n) => Math.round(n).toLocaleString('en-US').replace(/\\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]).replace(/,/g, '٬') + ' ریال';
/** place an element: x, y, scale, rotation, opacity */
function put(el, x, y, s = 1, r = 0, o = 1, extra = '') {
  el.style.transform = 'translate(' + x.toFixed(2) + 'px,' + y.toFixed(2) + 'px) rotate(' + r.toFixed(3) + 'deg) scale(' + s.toFixed(4) + ')' + extra;
  el.style.opacity = o.toFixed(3);
}
/** fade and rise into place over d seconds from a */
function rise(el, t, a, d = 0.55, dy = 34, x = 0, y = 0) {
  const k = o3(P(t, a, a + d));
  put(el, x, y + (1 - k) * dy, 1, 0, k);
}
function scene(id, t, a, b) {
  const el = $(id);
  const on = t >= a && t < b;
  el.style.visibility = on ? 'visible' : 'hidden';
  return on;
}
// a sky fades in over the one before and stays whole until the next has covered it: two half-faded skies would let the
// dark page show through and grey the crossfade
function bg(id, t, a, b, fi = 0.4) {
  $(id).style.opacity = (t < b + 0.6 ? P(t, a, a + fi) : 0).toFixed(3);
}

function seek(t) {
  // skies: each scene's own, the next one fading in over it under the transitions
  $('bg1').style.opacity = t < 4.3 ? '1' : '0';
  bg('bg2', t, 3.9, 8.5, 0.3);
  bg('bg3', t, 8.2, 15.4, 0.4);
  bg('bg4', t, 15.1, 19.9, 0.3);
  bg('bg5', t, 19.5, 25.0, 0.4);
  bg('bg6', t, 24.4, 29.1, 0.4);
  $('bg7').style.opacity = P(t, 28.6, 29.1).toFixed(3);

  /* 1 · dawn and the name */
  if (scene('s1', t, 0, 4.25)) {
    const s1o = 1 - P(t, 4.0, 4.25);
    $('s1').style.opacity = s1o;
    // the sun sets behind the right edge of the name, never behind its letters
    put($('sun'), 1400, L(1150, 110, o3(P(t, 0, 1.8))) + bob(t, 6, 5));
    put($('c1'), 960 - t * 18, 650 + bob(t, 4, 4));
    put($('c2'), 1500 - t * 10, 290 + bob(t, 3, 5, 1));
    put($('c3'), -60 + t * 14, 720 + bob(t, 4, 4.5, 2));
    const k1 = back(P(t, 0.3, 1.9));
    put($('p1'), L(-340, 60, k1), L(-260, 140, k1) + bob(t, 10, 3.2), 1, L(-40, -10, k1), C(P(t, 0.3, 0.6)));
    const k2 = o3(P(t, 0.8, 2.2));
    put($('p2'), L(2050, 1500, k2), 560 + bob(t, 12, 3.6, 1), 1, L(30, 8, k2), C(P(t, 0.8, 1.1)));
    const k3 = o3(P(t, 1.2, 2.4));
    put($('p3'), L(2000, 1520, k3), 110 + bob(t, 8, 2.8, 2), 1, 14 + t * 2, C(P(t, 1.2, 1.5)));
    const k4 = o3(P(t, 1.6, 2.6));
    put($('p4'), L(1500, 1460, k4), L(1150, 840, k4) + bob(t, 4, 4, 3), 1, -4, C(P(t, 1.6, 1.9)));
    put($('sp1'), 200, L(1100, 760, o3(P(t, 0.5, 1.8))) + bob(t, 8, 3.4));
    put($('sp2'), 1720, L(1100, 420, o3(P(t, 0.9, 2.1))) + bob(t, 6, 2.6, 1));
    put($('sp3'), 760, L(-80, 150, o3(P(t, 1.1, 2.0))) + bob(t, 5, 2.2, 2));
    put($('k1'), 1000, 120, 0.7 + 0.3 * Math.sin(t * 3), 0, 0.5 + 0.5 * Math.sin(t * 2.4));
    put($('k2'), 320, 260, 1, 0, 0.5 + 0.5 * Math.sin(t * 2.9 + 1));
    put($('k3'), 1460, 620, 1, 0, 0.5 + 0.5 * Math.sin(t * 2.1 + 2));
    rise($('top'), t, 0.4, 0.6, 12);
    const kt = o3(P(t, 0.9, 2.0));
    const title = $('title');
    title.style.clipPath = 'inset(0 ' + ((1 - kt) * 100).toFixed(2) + '% 0 0)';
    title.style.backgroundPosition = (100 - P(t, 1.0, 3.6) * 100).toFixed(2) + '% 0';
    put(title, 0, (1 - kt) * 24, L(0.96, 1, kt));
    rise($('tag'), t, 2.0, 0.7, 40);
    rise($('tagen'), t, 2.5, 0.6, 30);
  }
  // the arch opens onto the next sky
  const portal = $('portal');
  if (t >= 3.35 && t < 4.45) {
    portal.style.visibility = 'visible';
    const k = i3(P(t, 3.35, 4.15));
    put(portal, 660, 320, L(0.04, 4.6, k), 0, 1 - P(t, 4.15, 4.45));
    portal.style.transformOrigin = '50% 100%';
  } else portal.style.visibility = 'hidden';

  /* 2 · one email, one code */
  if (scene('s2', t, 3.9, 8.65)) {
    const out = io(P(t, 8.0, 8.6));
    $('s2').style.opacity = 1;
    $('s2').style.transform = 'translateX(' + (-out * 1920).toFixed(1) + 'px)';
    $('s2').style.filter = out > 0 && out < 1 ? 'blur(' + (Math.sin(out * Math.PI) * 10).toFixed(1) + 'px)' : 'none';
    put($('c4'), 80 + t * 12, 760 + bob(t, 4, 4));
    const kp = back(P(t, 4.0, 4.9));
    put($('phone'), 1300, L(1150, 170, kp) + bob(t, 6, 3.4), 1, 4);
    const km = io(P(t, 4.6, 5.5));
    const mx = (1 - km) ** 2 * 120 + 2 * (1 - km) * km * 640 + km * km * 1330, my = (1 - km) ** 2 * 230 + 2 * (1 - km) * km * -80 + km * km * 330;
    put($('mail'), mx, my, L(1, 0.45, P(t, 5.3, 5.6)), L(-18, 8, km), C(P(t, 4.6, 4.75)) * (1 - P(t, 5.45, 5.65)));
    rise($('m0'), t, 4.3, 0.5, 16);
    rise($('m1'), t, 4.5, 0.6, 40);
    rise($('m2'), t, 4.9, 0.6, 30);
    for (let i = 0; i < 6; i++) {
      const k = back(P(t, 5.5 + i * 0.18, 5.85 + i * 0.18));
      put($('d' + i), 0, (1 - C(k)) * 30, Math.max(0.001, k), 0, C(P(t, 5.5 + i * 0.18, 5.62 + i * 0.18)));
    }
    const kc = back(P(t, 6.9, 7.4));
    put($('m3'), 0, 0, Math.max(0.001, L(0.7, 1, kc)), 0, C(P(t, 6.9, 7.05)));
    $('m3').style.transformOrigin = '100% 50%';
    rise($('m4'), t, 7.3, 0.6, 24);
  } else $('s2').style.transform = '';

  /* 3 · the live sales desk */
  if (scene('s3', t, 8.0, 15.55)) {
    const inn = io(P(t, 8.0, 8.6));
    const zo = i3(P(t, 15.0, 15.5));
    $('s3').style.transform = 'translateX(' + ((1 - inn) * 1920).toFixed(1) + 'px) scale(' + L(1, 2.4, zo).toFixed(4) + ')';
    $('s3').style.transformOrigin = '640px 640px';
    $('s3').style.opacity = (1 - P(t, 15.25, 15.5)).toFixed(3);
    $('s3').style.filter = inn > 0 && inn < 1 ? 'blur(' + (Math.sin(inn * Math.PI) * 10).toFixed(1) + 'px)' : 'none';
    const dw = $('deskwrap');
    const kmon = o3(P(t, 8.4, 9.2));
    dw.style.transformOrigin = '650px 700px';
    put(dw, 0, (1 - kmon) * 120, L(1, 1.06, io(P(t, 9.2, 15.0))), 0, 1);
    rise($('dh'), t, 8.7, 0.6, 30);
    rise($('den'), t, 9.1, 0.6, 24);
    const pop = (el, a, b, x, y, r) => {
      const k = back(P(t, a, a + 0.5));
      const away = io(P(t, b, b + 0.4));
      put(el, x + away * 900, y + bob(t, 5, 3.6), Math.max(0.001, L(0.6, 1, C(k))), r, C(P(t, a, a + 0.15)) * (1 - away));
    };
    pop($('l1'), 9.8, 13.0, 1340, 250, 2.5);
    pop($('l2'), 10.8, 13.1, 1300, 640, -2);
    pop($('l3'), 13.3, 99, 1180, 300, -1.5);
    const kf = o3(P(t, 14.0, 14.5));
    put($('l4'), 1520, 720 + bob(t, 4, 3), 1, 3, C(P(t, 14.0, 14.15)), ' perspective(900px) rotateY(' + ((1 - kf) * 90).toFixed(1) + 'deg)');
    // the what-if: today's total rolls down to the 3% figure the engine gave
    const kc = io(P(t, 11.8, 12.8));
    rise($('ctr'), t, 11.2, 0.5, 30, 150, 830);
    $('ctrv').textContent = fmt(L(BASE, DISC, kc));
    $('ctrl').textContent = t < 11.8 ? 'جمع امروز' : 'با «۳٪ تخفیف»';
    const kd = C(P(t, 12.8, 13.1));
    $('ctrd').textContent = '−' + fmt(BASE - DISC);
    $('ctrd').style.opacity = kd.toFixed(3);
  } else $('s3').style.transform = '';
  $('flash').style.opacity = (0.55 * Math.max(0, 1 - Math.abs(t - 15.32) / 0.18)).toFixed(3);

  /* 4 · a desk for every role */
  if (scene('s4', t, 15.15, 19.95)) {
    $('s4').style.opacity = (P(t, 15.15, 15.35) * (1 - P(t, 19.6, 19.95))).toFixed(3);
    rise($('rh'), t, 15.4, 0.6, 30);
    for (let i = 0; i < 4; i++) {
      const k = back(P(t, 15.6 + i * 0.25, 16.3 + i * 0.25));
      const glow = Math.max(0, 1 - Math.abs(t - (17.2 + i * 0.45)) / 0.35);
      const sink = i3(P(t, 19.35 + i * 0.05, 19.85));
      const el = $('r' + i);
      put(el, 0, (1 - k) * 760 + sink * 760 + bob(t, 3, 3.2, i), 1 + glow * 0.045, 0, 1);
      el.style.filter = glow > 0 ? 'drop-shadow(0 0 ' + (glow * 40).toFixed(1) + 'px rgba(255,255,255,.9))' : 'none';
    }
  }

  /* 5 · the whole house, three pages of three */
  if (scene('s5', t, 19.5, 25.0)) {
    $('s5').style.opacity = (P(t, 19.5, 19.8) * (1 - P(t, 24.6, 25.0))).toFixed(3);
    rise($('fh'), t, 19.8, 0.6, 30);
    const off = (1 - o3(P(t, 19.7, 20.3))) * 1920 - io(P(t, 21.4, 21.8)) * 1920 - io(P(t, 23.0, 23.4)) * 1920;
    for (let i = 0; i < 9; i++) {
      const page = Math.floor(i / 3), col = i % 3;
      const x = 120 + col * 580 + page * 1920 + off;
      const ry = ((x + 260 - 960) / 960) * -14;
      const el = $('f' + i);
      if (x < -700 || x > 2000) { el.style.visibility = 'hidden'; continue; }
      el.style.visibility = ''; // inherit: an explicit «visible» would keep the card on screen after the scene hides
      put(el, x, bob(t, 6, 3.4, i), 1, [-1.2, 0.8, -0.6][col], 1, ' perspective(1800px) rotateY(' + ry.toFixed(2) + 'deg)');
    }
  }

  /* 6 · the letter */
  if (scene('s6', t, 24.4, 29.2)) {
    $('s6').style.opacity = 1;
    put($('c5'), -80 + (t - 24.4) * 20, 820);
    put($('c6'), 1560 - (t - 24.4) * 14, 860);
    const kin = o3(P(t, 24.4, 25.1));
    const kout = i3(P(t, 28.55, 29.15));
    const shake = Math.max(0, 1 - Math.abs(t - 27.68) / 0.12) * Math.sin(t * 160) * 3;
    // a slow push towards the page while it is read, so the letter never stands still after the last line lands
    const push = L(0.985, 1.025, P(t, 24.4, 28.6));
    put($('paper'), 180 + shake, L(1150, 60, kin) - kout * 1250, push, L(-1, -1, kin) + kout * 7, 1);
    const kd = o3(P(t, 25.3, 26.2));
    $('dear').style.clipPath = 'inset(0 ' + ((1 - kd) * 100).toFixed(2) + '% 0 0)';
    rise($('ln1'), t, 26.0, 0.5, 20, 0, 0);
    rise($('ln2'), t, 26.5, 0.5, 20, 0, 0);
    rise($('ln3'), t, 27.0, 0.5, 20, 0, 0);
    rise($('cam'), t, 25.6, 0.6, 30, 0, 0);
    rise($('bye'), t, 27.2, 0.5, 14, 0, 0);
    const ks = back(P(t, 27.45, 27.75));
    put($('seal'), 0, 0, Math.max(0.001, L(1.8, 1, C(ks))), L(-30, -8, C(ks)), C(P(t, 27.45, 27.55)));
    const kg = o3(P(t, 27.8, 28.5));
    $('sign').style.clipPath = 'inset(0 ' + ((1 - kg) * 100).toFixed(2) + '% 0 0)';
  }

  /* 7 · the way in */
  if (scene('s7', t, 28.7, DUR + 1)) {
    $('s7').style.opacity = P(t, 28.7, 29.0).toFixed(3);
    put($('q1'), L(-300, 150, o3(P(t, 28.8, 29.8))), 640 + bob(t, 12, 3.4), 1, -12 + bob(t, 4, 5));
    put($('q2'), L(2100, 1560, o3(P(t, 29.0, 30.0))), 700 + bob(t, 10, 3.0, 1), 1, 18 + bob(t, 5, 4.4));
    // the two rings ride above the line, clear of its first and last words
    put($('q3'), L(2100, 1650, o3(P(t, 29.2, 30.2))), 40 + bob(t, 8, 3.6, 2), 1, 22);
    put($('q4'), L(-300, 80, o3(P(t, 29.3, 30.3))), 50 + bob(t, 9, 3.2, 3), 1, -10);
    put($('k4'), 420, 160, 1, 0, 0.5 + 0.5 * Math.sin(t * 2.6));
    put($('k5'), 1400, 260, 1, 0, 0.5 + 0.5 * Math.sin(t * 3.1 + 1));
    put($('k6'), 1700, 560, 1, 0, 0.5 + 0.5 * Math.sin(t * 2.2 + 2));
    put($('k7'), 260, 520, 1, 0, 0.5 + 0.5 * Math.sin(t * 2.8 + 3));
    rise($('e1'), t, 29.0, 0.7, 40);
    rise($('e2'), t, 29.4, 0.6, 30);
    rise($('e3'), t, 29.8, 0.6, 30);
    const kl = o3(P(t, 30.2, 30.9));
    const logo = $('e4');
    logo.style.backgroundPosition = (100 - P(t, 30.2, 32) * 100).toFixed(2) + '% 0';
    put(logo, 0, (1 - kl) * 30, 1, 0, kl);
  }
  $('note').style.opacity = t > 28.8 ? '0' : '1';
}
window.seek = seek;
Promise.all([document.fonts.ready, ...[...document.images].map((i) => i.decode().catch(() => {}))]).then(() => {
  seek(0);
  window.READY = true;
});
</script></body></html>`;
writeFileSync(path.join(DIR, 'dream.html'), html);
console.log('dream.html', `what-if ${base} → ${disc}`, `${SFX.length} effects`);
