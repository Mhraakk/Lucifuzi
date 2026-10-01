// مقایسه بئاتریس با نسخه پایه مارکیز — a narrated comparison video: sourced comparison slides, then the real app on a
// fresh server showing each Beatris point. Marquise facts come only from its public pages (no trial was run); anything
// not stated there is marked «ذکر نشده», never «ندارد».
//   FFMPEG=/path/to/ffmpeg node scripts/compare-video.mjs   → public/media/compare/beatris-vs-marquise.mp4 (+ .jpg)
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, readdirSync, renameSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'media', 'compare');
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
mkdirSync(OUT, { recursive: true });
const pw = await import(process.env.PLAYWRIGHT ?? '/opt/node22/lib/node_modules/playwright/index.mjs');
const { chromium } = pw.default ?? pw;

const dataDir = mkdtempSync(path.join(tmpdir(), 'bcmp-'));
const rawDir = mkdtempSync(path.join(tmpdir(), 'bcmp-raw-'));
const port = 6100 + Math.floor(Math.random() * 300);
const server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/index.mjs'], { cwd: ROOT, env: { ...process.env, BEATRIS_DEMO: 'true', BEATRIS_DATA_DIR: dataDir, PORT: String(port), NODE_ENV: 'test' }, stdio: 'ignore' });
const base = `http://127.0.0.1:${port}`;
for (let i = 0; i < 60; i++) {
  try {
    if ((await fetch(base + '/api/health')).ok) break;
  } catch {}
  await new Promise((r) => setTimeout(r, 200));
}

const SOURCES = [
  'marquise-co.com/basic-software — معرفی رسمی «نرم‌افزار پایه» مارکیز',
  'marquise-co.com — صفحه اصلی و نسخه‌های فروشگاهی، وب، پایه و کارگاهی',
  'hesabis.ir و tgju.org — معرفی‌های عمومی نرم‌افزارهای حسابداری طلا (۱۴۰۴–۱۴۰۵)',
];
// [موضوع، بئاتریس، مارکیز پایه، منبع/توضیح]  ✓ دارد · — ذکر نشده · ✕ ندارد (فقط درباره بئاتریس، که کدش را دیده‌ایم)
const SLIDES = [
  {
    title: 'پایه حسابداری',
    rows: [
      ['خرید و فروش سکه، ارز، آبشده و جنس', '✓', '✓', 'هر دو'],
      ['حساب جنسی و ریالی مشتری تا تسویه', '✓ هر واحد جدا: طلای ۷۵۰، هر سکه، هر ارز، هر شمش', '✓', 'معرفی پایه مارکیز'],
      ['تراکنش‌های بانکی و صندوق', '✓ با تطبیق بانک', '✓', 'معرفی پایه مارکیز'],
      ['موجودی لحظه‌ای به تفکیک آبشده، سکه، ارز', '✓ گاوصندوق', '✓', 'معرفی پایه مارکیز'],
      ['ثبت عکس روی سند (آبشده، سکه، ارز)', '✕ فقط کارت شناسایی عکس‌دار شمش', '✓', 'برتری مارکیز'],
    ],
  },
  {
    title: 'اتصال و سخت‌افزار',
    rows: [
      ['کارتخوان (پرداخت خودکار پس از تأیید معامله)', '✓ سامان مستقیم؛ سداد با رابط رسمی', '✓ اتصال کارتخوان', 'معرفی‌های عمومی مارکیز'],
      ['ترازوی دیجیتال', '✓ از مرورگر (Web Serial)', '✓', 'معرفی‌های عمومی مارکیز'],
      ['بارکد', '✓ برچسب و خواندن', '✓', 'هر دو'],
      ['سامانه مودیان', '✓ شناسه یکتا و فایل استاندارد؛ ارسال مستقیم ندارد', '✓ اتصال', 'معرفی‌های عمومی مارکیز'],
      ['قفل سخت‌افزاری', '✕ رویکرد دیگر: حساب کاربری ابری با نقش‌ها', '✓', 'معرفی‌های عمومی مارکیز'],
    ],
  },
  {
    title: 'دسترسی و یکپارچگی',
    rows: [
      ['نسخه ویندوز', '✓ نصب‌کننده ۶۴ بیتی ویندوز ۱۱', '✓', 'هر دو'],
      ['وب و گوشی', '✓ همان یک اپ: وب + اپ نصبی + ویندوز، یک داده', '✓ نسخه «وب» جداگانه', 'مارکیز: چهار نسخه جدا'],
      ['چند شعبه / چند فروشگاه', '✓ هر فروشگاه پایگاه داده جدا', '✓ چند شعبه', 'معرفی‌های عمومی مارکیز'],
      ['خروجی اکسل، CSV، PDF', '✓ در همه گزارش‌ها', '—', 'در معرفی پایه ذکر نشده'],
    ],
  },
  {
    title: 'آنچه در معرفی نسخه پایه مارکیز ذکر نشده',
    rows: [
      ['قیمت زنده و مظنه پیشنهادی با فاصله خرید و فروش', '✓', '—', ''],
      ['کاتالوگ محصول جستجوپذیر و قالب‌ساز (زربد، زردیس، زرنشان…)', '✓', '—', ''],
      ['مرکز کنترل: نبض، استثناها، توضیح هر عدد', '✓', '—', ''],
      ['قفل دوره و تأیید دونفره سندهای حساس', '✓', '—', ''],
      ['زنجیره رویداد ضد دستکاری + کد اصالت رسید', '✓', '—', ''],
      ['ممیز خودکار و دستیار هوشمند', '✓', '—', ''],
      ['تحلیل بازار و الیوت، آموزش و آزمایشگاه سکه', '✓', '—', ''],
    ],
  },
  {
    title: 'آنچه مارکیز دارد و باید منصفانه گفت',
    rows: [
      ['سابقه', '—', 'از ۱۳۷۹، بیش از دو دهه', 'سایت رسمی مارکیز'],
      ['نسخه کارگاهی (ساخت و ریخته‌گری)', '✕', '✓ نسخه جدا', 'سایت رسمی مارکیز'],
      ['عکس روی هر سند', '✕', '✓', 'معرفی پایه مارکیز'],
      ['قفل سخت‌افزاری', '✕', '✓', 'معرفی‌های عمومی'],
    ],
  },
];
// live segments: [caption, path, action]
const LIVE = [
  ['یک میز معامله: مشتری، نوع معامله، جنس، پول — همه در یک صفحه، با قیمت زنده', '/books/desk', async (p) => {
    await p.click('[data-kind=coin]');
    await p.waitForTimeout(600);
  }],
  ['محصول را تایپ کنید: «ربع»، «زردیس ۲٫۵»… و با قالب‌ساز یک‌جا بسازید', '/books/desk', async (p) => {
    await p.click('[data-kind=coin]');
    await p.waitForTimeout(400);
    await p.click('[data-prod=tpl]');
    await p.waitForTimeout(1600);
    await p.click('#tp button:not([type])');
    await p.waitForTimeout(800);
    await p.click('[data-psearch]');
    for (const ch of 'زردیس 2.5') {
      await p.keyboard.type(ch);
      await p.waitForTimeout(90);
    }
    await p.waitForTimeout(900);
  }],
  ['کارتخوان این رایانه: مبلغ پیش از ثبت سند به دستگاه می‌رود و شماره پیگیری خودکار می‌نشیند', '/books/settings', async (p) => {
    await p.evaluate(() => document.getElementById('posSec')?.scrollIntoView({ block: 'center', behavior: 'instant' }));
    await p.waitForTimeout(800);
  }],
  ['مرکز کنترل: به‌جای غرق شدن در عدد، فقط آنچه امروز مهم است', '/books/control', async (p) => {
    await p.waitForTimeout(600);
  }],
  ['روزنگار با خروجی اکسل، CSV و PDF', '/books/day', async (p) => {
    await p.waitForTimeout(600);
  }],
  ['همان حساب روی گوشی', '/books/desk', null, { width: 390, height: 844 }],
];

const SLIDE_CSS = `body{margin:0;background:#101317;color:#ece7dc;font-family:Estedad,Vazirmatn,Tahoma,sans-serif;direction:rtl}
.s{height:100vh;display:grid;align-content:center;padding:0 72px;gap:18px}.k{color:#d5b36f;font-size:20px;font-weight:700}h1{margin:0;font-size:46px;font-weight:800}h2{margin:0;font-size:36px;font-weight:800}
p{margin:0;font-size:22px;line-height:1.9;color:#c9c3b7}table{width:100%;border-collapse:collapse;font-size:20px}th{text-align:start;color:#a9b0b8;font-weight:650;font-size:17px;padding:10px 12px;border-bottom:1px solid #2b323b}
td{padding:12px;border-bottom:1px solid #20262e;vertical-align:top}td:nth-child(2){color:#9fd8c4}td:nth-child(3){color:#e8d6a8}td:nth-child(4){color:#8b929c;font-size:15px}.foot{font-size:15px;color:#8b929c}`;
const b64 = (f) => `data:font/woff2;base64,${readFileSync(path.join(ROOT, 'public', 'fonts', f)).toString('base64')}`;
const fontFace = `@font-face{font-family:Estedad;src:url(${b64('estedad-arabic-var.woff2')});font-weight:100 900}@font-face{font-family:Estedad;src:url(${b64('estedad-latin-var.woff2')});font-weight:100 900;unicode-range:U+0000-00FF,U+2000-206F,U+2713,U+2715}`;
const slideHtml = (inner) => `<!doctype html><html lang="fa" dir="rtl"><meta charset="utf-8"><style>${fontFace}${SLIDE_CSS}</style><div class="s">${inner}</div>`;
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

const CAPTION = (text) => {
  let el = document.getElementById('cmp-cap');
  if (!el) {
    el = document.createElement('div');
    el.id = 'cmp-cap';
    el.style.cssText = 'position:fixed;inset-inline:0;bottom:0;z-index:2147483647;padding:16px 28px 20px;background:rgba(10,12,15,.92);color:#fff;font:600 21px/1.7 Estedad,Vazirmatn,Tahoma,sans-serif;direction:rtl;text-align:right;pointer-events:none';
    document.body.append(el);
  }
  el.textContent = text;
};

const TOKEN = (await (await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ phone: '09120000002', pin: '1234' }) })).json()).token;
async function record(name, viewport, fn) {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ viewport, recordVideo: { dir: rawDir, size: viewport }, deviceScaleFactor: 1 });
  // signed in before the first frame: the clip opens on the page itself, not on the login screen
  await ctx.addInitScript((t) => {
    try {
      localStorage.setItem('beatris.token', t);
    } catch {}
  }, TOKEN);
  const p = await ctx.newPage();
  await fn(p);
  await ctx.close();
  await browser.close();
  const f = readdirSync(rawDir).filter((x) => x.endsWith('.webm') && !x.startsWith('seg-')).map((x) => path.join(rawDir, x))[0];
  const seg = path.join(rawDir, `seg-${name}.webm`);
  renameSync(f, seg);
  return seg;
}
const login = async (p) => {
  await p.goto(base + '/login');
  await p.fill('input[name=login]', '09120000002');
  await p.fill('input[name=password]', '1234');
  await p.click('button[type=submit]');
  await p.waitForURL((u) => !u.pathname.startsWith('/login'));
};

const segs = [];
const W = { width: 1280, height: 720 };
segs.push(
  await record('slides', W, async (p) => {
    await p.setContent(slideHtml(`<span class="k">مقایسه همه‌جانبه</span><h1>بئاتریس در برابر نسخه پایه مارکیز</h1><p>حسابداری سکه، آبشده، شمش و ارز — یک‌دست، متصل و آنلاین</p>`));
    await p.waitForTimeout(4200);
    await p.setContent(slideHtml(`<span class="k">روش</span><h2>مقایسه منصفانه</h2><p>اطلاعات مارکیز فقط از سایت رسمی و معرفی‌های عمومی (مهر ۱۴۰۵) است؛ نسخه آزمایشی مارکیز اجرا نشده. هر قابلیتی که در آن منابع نیامده «ذکر نشده» نوشته شده، نه «ندارد».</p><p>بئاتریس: نسخه زنده همین امروز، با آزمون خودکار ۳۶۰+ بررسی مرورگری.</p>`));
    await p.waitForTimeout(6500);
    for (const s of SLIDES) {
      await p.setContent(slideHtml(`<h2>${esc(s.title)}</h2><table><thead><tr><th>موضوع</th><th>بئاتریس</th><th>مارکیز پایه</th><th>منبع / توضیح</th></tr></thead><tbody>${s.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table><p class="foot">✓ دارد · ✕ ندارد · — در منابع عمومی ذکر نشده</p>`));
      await p.waitForTimeout(3000 + s.rows.length * 1700);
    }
    await p.setContent(slideHtml(`<span class="k">در عمل</span><h2>حالا خود بئاتریس را ببینیم</h2>`));
    await p.waitForTimeout(2500);
  }),
);
for (const [i, [cap, url, act, vp]] of LIVE.entries()) {
  segs.push(
    await record(`live${i}`, vp ?? W, async (p) => {
      await p.goto(base + url);
      await p.waitForTimeout(1500);
      await p.evaluate(CAPTION, cap);
      if (act) await act(p);
      await p.evaluate(CAPTION, cap);
      await p.waitForTimeout(3800);
    }),
  );
}
segs.push(
  await record('end', W, async (p) => {
    await p.setContent(slideHtml(`<span class="k">جمع‌بندی</span><h2>هر دو حسابداری جنسی و ریالی کامل دارند</h2><p>مارکیز: سابقه طولانی، نسخه کارگاهی، عکس روی سند و قفل سخت‌افزاری.</p><p>بئاتریس: یک اپ برای وب، گوشی و ویندوز؛ قیمت زنده، کاتالوگ محصول جستجوپذیر، کارتخوان، مرکز کنترل، ضد دستکاری و هوش.</p>`));
    await p.waitForTimeout(8000);
    await p.setContent(slideHtml(`<span class="k">منابع</span>${SOURCES.map((s) => `<p>${esc(s)}</p>`).join('')}<p class="foot">نام «مارکیز» متعلق به صاحبش است؛ این ویدیو مقایسه مستقل بر پایه اطلاعات عمومی است.</p>`));
    await p.waitForTimeout(6000);
  }),
);

// join: every segment scaled to 1280×720 (the phone shot centred on a dark field), H.264
const list = path.join(rawDir, 'list.txt');
const norm = [];
for (const [i, s] of segs.entries()) {
  const o = path.join(rawDir, `n${i}.mp4`);
  execFileSync(FFMPEG, ['-loglevel', 'error', '-y', '-i', s, '-vf', 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=0x101317,fps=25,format=yuv420p', '-c:v', 'libx264', '-preset', 'medium', '-crf', '24', '-an', o]);
  norm.push(o);
}
writeFileSync(list, norm.map((n) => `file '${n}'`).join('\n'));
const mp4 = path.join(OUT, 'beatris-vs-marquise.mp4');
execFileSync(FFMPEG, ['-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', mp4]);
execFileSync(FFMPEG, ['-loglevel', 'error', '-y', '-ss', '2', '-i', mp4, '-frames:v', '1', '-q:v', '3', path.join(OUT, 'beatris-vs-marquise.jpg')]);
server.kill();
rmSync(dataDir, { recursive: true, force: true });
rmSync(rawDir, { recursive: true, force: true });
console.log('wrote', mp4);
