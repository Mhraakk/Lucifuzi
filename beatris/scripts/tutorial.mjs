// فیلم آموزش از صفر تا صد — drives the real app on a fresh server (a new shop issued by the vendor, set up, trading,
// accounting, reports, the smart tools), records every chapter with an on-screen Persian narration, a visible cursor
// and highlighted clicks, and writes H.264 MP4 files plus a chapter list for the help page.
//   FFMPEG=/path/to/ffmpeg node scripts/tutorial.mjs [--only 3,4]
// Output: public/media/tutorial/NN.mp4, NN.jpg (poster) and chapters.json
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readdirSync, renameSync, statSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'media', 'tutorial');
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const only = (process.argv.find((a) => a.startsWith('--only='))?.slice(7) ?? '').split(',').filter(Boolean).map(Number);
mkdirSync(OUT, { recursive: true });
const pw = await import(process.env.PLAYWRIGHT ?? '/opt/node22/lib/node_modules/playwright/index.mjs');
const { chromium } = pw.default ?? pw;

const dataDir = mkdtempSync(path.join(tmpdir(), 'btut-'));
const rawDir = mkdtempSync(path.join(tmpdir(), 'btut-raw-'));
const port = 5600 + Math.floor(Math.random() * 300);
const server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/index.mjs'], { cwd: ROOT, env: { ...process.env, BEATRIS_DEMO: 'true', BEATRIS_DATA_DIR: dataDir, PORT: String(port), NODE_ENV: 'test', BEATRIS_TOKEN_SECRET: 'tutorial-secret-0123456789abcdef' }, stdio: ['ignore', 'ignore', 'inherit'] });
const base = `http://127.0.0.1:${port}`;
const J = (m, p, b, t) => fetch(base + p, { method: m, headers: { 'content-type': 'application/json', ...(t ? { authorization: `Bearer ${t}` } : {}) }, body: b ? JSON.stringify(b) : undefined }).then(async (r) => {
  const j = await r.json();
  if (!r.ok) throw new Error(`${m} ${p}: ${j.error}`);
  return j;
});
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran' }).format(new Date());
const ago = (n) => new Date(Date.parse(`${today}T00:00:00Z`) - n * 864e5).toISOString().slice(0, 10);

/* ---------------- the overlay: narration bar, chapter title, cursor, click ring ---------------- */
const OVERLAY = () => {
  const css = `#tt-cap{position:fixed;inset-inline:0;bottom:0;z-index:2147483646;padding:14px 28px 18px;background:linear-gradient(0deg,rgba(10,10,12,.94),rgba(10,10,12,.82));color:#fff;font:500 21px/1.75 Estedad,Vazirmatn,Tahoma,sans-serif;direction:rtl;text-align:right;box-shadow:0 -8px 30px rgba(0,0,0,.35);transition:opacity .25s;pointer-events:none}#tt-cap b{display:block;font-size:14px;color:#e8c887;font-weight:700;letter-spacing:0}#tt-cap:empty{opacity:0}#tt-cur{position:fixed;z-index:2147483647;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;background:rgba(232,200,135,.55);border:2px solid #fff;box-shadow:0 2px 10px rgba(0,0,0,.5);pointer-events:none;transition:left .55s cubic-bezier(.3,.8,.3,1),top .55s cubic-bezier(.3,.8,.3,1);left:50%;top:40%}#tt-ring{position:fixed;z-index:2147483645;pointer-events:none;border:3px solid #e8c887;border-radius:12px;box-shadow:0 0 0 9999px rgba(0,0,0,.18);transition:all .35s;opacity:0}.tt-title{position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;background:radial-gradient(circle at 50% 40%,#2a2419,#0c0b09 70%);color:#fff;font-family:Estedad,Vazirmatn,Tahoma,sans-serif;direction:rtl;text-align:center;pointer-events:none}.tt-title small{display:block;color:#e8c887;font-size:18px;margin-bottom:10px}.tt-title h1{margin:0;font-size:44px;font-weight:800}.tt-title p{margin:12px 0 0;color:#cbbd9f;font-size:20px}`;
  const boot = () => {
    if (document.getElementById('tt-cap')) return;
    const st = document.createElement('style');
    st.textContent = css;
    document.head.append(st);
    const cap = Object.assign(document.createElement('div'), { id: 'tt-cap' });
    const cur = Object.assign(document.createElement('div'), { id: 'tt-cur' });
    const ring = Object.assign(document.createElement('div'), { id: 'tt-ring' });
    document.body.append(cap, cur, ring);
    const saved = sessionStorage.getItem('tt-cap');
    if (saved) cap.innerHTML = saved;
    const pos = JSON.parse(sessionStorage.getItem('tt-cur') ?? 'null');
    if (pos) Object.assign(cur.style, { left: `${pos[0]}px`, top: `${pos[1]}px` });
  };
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', boot);
  else boot();
  window.__tt = {
    say(title, text) {
      boot();
      const html = text ? `<b>${title}</b>${text}` : '';
      document.getElementById('tt-cap').innerHTML = html;
      sessionStorage.setItem('tt-cap', html);
    },
    move(x, y) {
      boot();
      Object.assign(document.getElementById('tt-cur').style, { left: `${x}px`, top: `${y}px` });
      sessionStorage.setItem('tt-cur', JSON.stringify([x, y]));
    },
    ring(r) {
      const el = document.getElementById('tt-ring');
      if (!r) return (el.style.opacity = '0');
      Object.assign(el.style, { left: `${r.x - 6}px`, top: `${r.y - 6}px`, width: `${r.w + 12}px`, height: `${r.h + 12}px`, opacity: '1' });
    },
    title(n, t, sub) {
      const d = document.createElement('div');
      d.className = 'tt-title';
      d.innerHTML = `<div><small>فصل ${n}</small><h1>${t}</h1><p>${sub}</p></div>`;
      document.body.append(d);
      setTimeout(() => d.remove(), 3200);
    },
  };
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
function director(page, title) {
  const say = async (text, ms = 4600) => {
    await page.evaluate(([t, x]) => window.__tt.say(t, x), [title, text]);
    await wait(ms);
  };
  const point = async (sel, { ring = true } = {}) => {
    const el = typeof sel === 'string' ? page.locator(sel).first() : sel;
    await el.scrollIntoViewIfNeeded().catch(() => {});
    const b = await el.boundingBox();
    if (!b) return el;
    await page.evaluate(([x, y]) => window.__tt.move(x, y), [b.x + b.width / 2, b.y + b.height / 2]);
    if (ring) await page.evaluate((r) => window.__tt.ring(r), { x: b.x, y: b.y, w: b.width, h: b.height });
    await wait(650);
    return el;
  };
  const click = async (sel, after = 700) => {
    const el = await point(sel);
    await el.click();
    await page.evaluate(() => window.__tt.ring(null));
    await wait(after);
  };
  const type = async (sel, value, after = 350) => {
    const el = await point(sel);
    await el.click();
    await el.fill('');
    await el.pressSequentially(String(value), { delay: 55 });
    await page.evaluate(() => window.__tt.ring(null));
    await wait(after);
  };
  const go = async (p, after = 1400) => {
    await page.goto(base + p);
    await page.waitForLoadState('networkidle').catch(() => {});
    await wait(after);
  };
  const scroll = async (y, after = 900) => {
    await page.evaluate((yy) => window.scrollBy({ top: yy, behavior: 'smooth' }), y);
    await wait(after);
  };
  return { say, point, click, type, go, scroll };
}

/* ---------------- the story ---------------- */
const S = {}; // shared state between chapters
const CHAPTERS = [
  {
    n: 1, slug: 'vendor', title: 'ورود و صدور حساب فروشگاه', sub: 'ارائه‌دهنده برای هر خریدار نام کاربری و رمز می‌سازد',
    steps: ['در صفحه ورود نام کاربری یا موبایل و رمز را بزنید.', 'ارائه‌دهنده در «کنسول ارائه‌دهنده» فروشگاه تازه می‌سازد: نام، نسخه، نام کاربری مدیر و پایان اشتراک.', 'رمز فقط یک بار نمایش داده می‌شود؛ آن را کپی یا «برگه تحویل» را چاپ کنید.', 'همین حساب روی گوشی، تبلت و کامپیوتر کار می‌کند؛ تعلیق، تمدید، رمز تازه و خروج از همه دستگاه‌ها هم همین‌جاست.'],
    async run(page, d) {
      await d.go('/login', 800);
      await d.say('به نرم‌افزار حسابداری طلا، سکه و شمش خوش آمدید. ورود فقط با نام کاربری و رمزی است که ارائه‌دهنده صادر می‌کند.');
      await d.type('input[name=login]', '09120000001');
      await d.type('input[name=password]', '1234');
      await d.say('ارائه‌دهنده (فروشنده نرم‌افزار) وارد می‌شود تا برای یک مغازه خریدار حساب بسازد.', 2600);
      await d.click('button[type=submit]', 1500);
      await d.go('/vendor');
      await d.say('این «کنسول ارائه‌دهنده» است: همه فروشگاه‌ها، وضعیت اشتراک، تعداد کاربران و اسناد هر کدام.');
      await d.click('[data-act=new]');
      await d.type('#sf [name=name]', 'طلا و سکه امید');
      await d.say('نسخه پایه برای مغازه‌های سکه، آبشده، شمش و ارز است؛ نسخه کامل فروش مصنوعات را هم دارد.', 3200);
      await d.type('#sf [name=ownerName]', 'امید رحیمی');
      await d.type('#sf [name=username]', 'omid.rahimi');
      await d.say('رمز را خالی بگذارید تا خودکار یک رمز ۱۰ نویسه‌ای محکم ساخته شود.', 3000);
      await d.type('#sf [name=expires]', '۱۴۰۶/۰۷/۰۶');
      await d.click('#sf button.btn:not(.ghost)', 1500);
      S.password = (await page.textContent('.vd-pw')).trim();
      await d.point('.vd-cred');
      await d.say('رمز فقط همین یک بار دیده می‌شود. «کپی» یا «چاپ برگه تحویل» را بزنید و به صاحب مغازه بدهید. با همین نام کاربری و رمز، روی گوشی و کامپیوتر وارد می‌شود.', 6000);
      await d.click('.modal [data-close]');
      await d.click('.vd-shop:not(:first-child) [data-act=users]', 1200);
      await d.say('کاربران هر فروشگاه، آخرین ورود و دستگاه‌شان. «رمز تازه»، «خروج از همه دستگاه‌ها» و «غیرفعال» هم همین‌جاست. فروشگاه‌ها خودشان کاربر یا رمز نمی‌سازند.', 6000);
    },
  },
  {
    n: 2, slug: 'setup', title: 'راه‌اندازی فروشگاه', sub: 'وضعیت واقعی امروز مغازه، یک بار و درست',
    steps: ['مدیر فروشگاه تازه بعد از اولین ورود به «راه‌اندازی» می‌رود.', 'مشخصات فروشگاه، واحد پول و تاریخ شروع دفتر.', 'صندوق‌های نقد و حساب‌های بانکی با موجودی امروز.', 'طلای آبشده، سکه‌ها، شمش‌های پلمپ و ارز با میانگین بهای خرید (یا «قیمت امروز»).', 'مشتریان و مانده مالی و جنسی هر کدام؛ از اکسل هم می‌شود چسباند.', 'بازبینی و ثبت: یک «سند افتتاحیه» با کد رهگیری ساخته می‌شود و همه داشبوردها از همین نقطه شروع می‌کنند.'],
    async run(page, d) {
      await d.go('/login', 600);
      await d.say('صاحب مغازه با نام کاربری و رمزی که گرفته وارد می‌شود.', 2600);
      await d.type('input[name=login]', 'omid.rahimi');
      await d.type('input[name=password]', S.password);
      await d.click('button[type=submit]', 2500);
      await d.say('اولین بار، نرم‌افزار مستقیم به «راه‌اندازی فروشگاه» می‌رود تا وضعیت واقعی امروز مغازه ثبت شود. هیچ عدد ساختگی در کار نیست.');
      await d.type('[data-path="identity.address"]', 'تهران، بازار بزرگ، راسته زرگرها');
      await d.type('[data-path="identity.phone"]', '02155667788');
      await d.click('[data-act=next]');
      await d.say('صندوق‌های نقد و حساب‌های بانکی با موجودی امروز. مثال: صندوق اصلی ۱٫۵ میلیارد ریال و حساب ملت ۸ میلیارد ریال.', 3500);
      await d.type('[data-path="cash.0.amount"]', '1500000000');
      await d.type('[data-path="banks.0.title"]', 'ملت جاری');
      await d.type('[data-path="banks.0.bank"]', 'ملت');
      await d.type('[data-path="banks.0.amount"]', '8000000000');
      await d.click('[data-act=next]');
      await d.say('موجودی گاوصندوق: ۲۵۰٫۵ گرم آبشده. «میانگین بها» همان قیمت خرید شماست تا سود و زیان هر فروش درست حساب شود. اگر نمی‌دانید «قیمت امروز» را بزنید.', 5200);
      await d.type('[data-path="gold.grams"]', '250.5');
      await d.click('[data-live=gold]');
      await d.type('[data-path="coins.1.count"]', '12');
      await d.click('[data-live=coin][data-i="1"]');
      await d.click('[data-add=bars]');
      await d.type('[data-path="bars.0.serial"]', 'NV-10021');
      await d.type('[data-path="bars.0.weight"]', '100');
      await d.type('[data-path="bars.0.brand"]', 'نوین');
      await d.type('[data-path="bars.0.cost"]', '12000000000');
      await d.click('[data-act=next]');
      await d.say('مشتریان و مانده‌شان. «بدهکار» یعنی مشتری به شما بدهکار است، «بستانکار» یعنی شما به او. مانده جنسی (طلا و سکه) جدا از مانده مالی است.', 5000);
      await d.type('[data-path="parties.0.name"]', 'رضا تهرانی');
      await d.type('[data-path="parties.0.mobile"]', '09121234567');
      await d.type('[data-path="parties.0.irr"]', '300000000');
      await d.type('[data-path="parties.0.g"]', '10');
      await page.selectOption('[data-path="parties.0.gSide"]', 'c');
      await d.say('رضا ۳۰۰ میلیون ریال بدهکار است و ۱۰ گرم طلای امانی نزد مغازه دارد (بستانکار جنسی).', 3800);
      await d.click('.su-paste summary');
      await d.type('#suPaste', 'بنکداری پارس، ، -1200000000، 0');
      await d.click('[data-act=paste]');
      await d.click('[data-act=next]', 1500);
      await d.say('بازبینی: جمع نقد، بانک، طلا، سکه، شمش، مطالبات و تعهدات و برآورد ارزش خالص با قیمت امروز. با «ثبت نهایی» یک سند افتتاحیه با کد رهگیری ساخته می‌شود.', 6000);
      await d.click('[data-act=next]', 2500);
      await d.say('دفتر باز شد. از این لحظه هر عدد داشبورد، گاوصندوق و ریز حساب از همین وضعیت واقعی شروع می‌شود.', 4000);
      S.token = await page.evaluate(() => localStorage.getItem('beatris.token'));
      // some history for the charts of the next chapters (through the API, like weeks of real work)
      const seller = await J('POST', '/api/books/parties', { name: 'علی کریمی', mobile: '09129998877' }, S.token);
      let seed = 5;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      // the drawer and the vault stay realistic: never below 1 billion rial in cash or 120 g of gold
      let cash = 1500000000, gold = 250.5;
      for (let dd = 40; dd >= 1; dd--) {
        if (new Date(`${ago(dd)}T12:00:00Z`).getUTCDay() === 5) continue;
        for (let k = 0; k < 1 + Math.floor(rnd() * 3); k++) {
          const w = 5 + Math.round(rnd() * 25), mz = 400000000 + (40 - dd) * 400000;
          const amount = Math.round((w * mz) / 4.331802 / 1e4) * 1e4;
          let buy = rnd() < 0.5;
          if (buy && cash - amount < 1e9) buy = false;
          if (!buy && gold - w < 120) buy = cash - amount >= 1e9;
          if (!buy && gold - w < 120) continue;
          cash += buy ? -amount : amount;
          gold += buy ? w : -w;
          await J('POST', '/api/books/docs', { type: 'trade', date: ago(dd), partyId: seller.id, lines: [{ kind: 'melt', dir: buy ? 'in' : 'out', weight: w, fineness: 750, mazaneh: mz }], payments: [{ method: 'cash', dir: buy ? 'out' : 'in', amount }] }, S.token).catch(() => {});
        }
      }
    },
  },
  {
    n: 3, slug: 'trade', title: 'میز معامله', sub: 'خرید آبشده، فروش سکه، پرداخت ترکیبی و رسید',
    steps: ['مشتری را جستجو یا «مشتری جدید» بسازید (هم‌نام‌ها با لقب، نام پدر، شهر یا موبایل جدا می‌شوند).', 'نوع معامله: خرید از مشتری، فروش به مشتری، دریافت یا تحویل جنس.', 'آبشده: وزن، عیار و مظنه؛ معادل ۷۵۰، مثقال و مبلغ زنده حساب می‌شود.', 'سکه: نوع، تعداد و قیمت هر عدد.', 'دریافت و پرداخت: نقد، کارتخوان، کارت به کارت، فیش، چک… هر مقدار کم باشد روی حساب مشتری می‌ماند.', '«ثبت سند» رسید با کد رهگیری، بارکد، QR و مانده پس از سند می‌دهد.'],
    async run(page, d) {
      await d.go('/books/desk', 1800);
      await d.say('میز معامله: همه خرید و فروش‌ها این‌جا ثبت می‌شود. اول مشتری را پیدا کنید؛ این‌جا یک مشتری تازه می‌سازیم.');
      await d.click('[data-act=pnew]');
      await d.type('#np [name=name]', 'مهران رضایی');
      await d.type('#np [name=mobile]', '09121112233');
      await d.click('#np button:not([type])', 1200);
      await d.say('مثال: مهران ۲ گرم آبشده عیار ۷۴۰ می‌فروشد، با مظنه ۴۰۰ میلیون ریال.', 3200);
      await d.click('[data-mode=buy]');
      await d.type('[data-f=weight]', '2');
      await d.type('[data-f=fineness]', '740');
      await d.type('[data-f=mazaneh]', '400000000');
      await d.point('#live');
      await d.say('همین‌جا معادل ۷۵۰ (۱٫۹۷۳ گرم)، مثقال و مبلغ خرید (۱۸۲٬۱۹۰٬۰۰۰ ریال) حساب می‌شود؛ با همان قاعده دفتر بازار.', 5200);
      await d.click('[data-act=add]');
      await d.say('در همان سند یک سکه امامی هم به او می‌فروشیم.', 2600);
      await d.click('[data-mode=sell]');
      await d.click('[data-kind=coin]');
      await d.click('[data-coin=emami]');
      await d.type('[data-f=price]', '985000000');
      await d.click('[data-act=add]');
      await d.say('خالص سند: مهران ۸۰۲٬۸۱۰٬۰۰۰ ریال باید بپردازد. ۵۰۰ میلیون با کارتخوان می‌دهد؛ بقیه روی حساب او می‌ماند.', 4600);
      await d.click('[data-pm=pos]');
      await d.type('[data-p="0"][data-k=amount]', '500000000');
      await d.type('[data-p="0"][data-k=ref]', '1234');
      await d.point('#sum');
      await d.say('جمع سند و «مانده روی حساب مشتری» پیش از ثبت دیده می‌شود.', 3600);
      await d.click('.dk-save [data-act=save]', 2200);
      await d.say('رسید رسمی: کد رهگیری سند، کد هر ردیف و پرداخت، بارکد، QR اصالت و مانده مشتری پس از همین سند. می‌توانید چاپ یا ارسال کنید.', 6000);
      await page.keyboard.press('Escape');
      await wait(800);
    },
  },
  {
    n: 4, slug: 'goods', title: 'امانت، حواله، تبدیل و قیمت قفل‌شده', sub: 'حساب جنسی مشتریان و قیمت تضمینی',
    steps: ['«دریافت جنس» بدون قیمت: طلا روی حساب جنسی مشتری می‌رود (بستانکار جنسی).', '«حواله»: جنس یا پول از حساب یک مشتری به حساب دیگری.', '«تبدیل مانده جنسی به ریال» با نرخ روز.', '«قفل همین قیمت»: قیمت برای چند دقیقه تضمین می‌شود؛ کد Q و شمارش معکوس دارد و سند فقط با همان قیمت ثبت می‌شود.'],
    async run(page, d) {
      await d.go('/books/desk', 1600);
      await d.type('#pq', 'مهران');
      await d.click('[data-pick]', 1200);
      await d.say('مهران ۵۰ گرم آبشده عیار ۷۴۵ به امانت می‌گذارد؛ قیمتی در کار نیست، پس «دریافت جنس».', 3800);
      await d.click('[data-mode=in]');
      await d.type('[data-f=weight]', '50');
      await d.type('[data-f=fineness]', '745');
      await d.click('[data-act=add]');
      await d.click('.dk-save [data-act=save]', 2000);
      await page.keyboard.press('Escape');
      await wait(600);
      await d.point('.dk-bal');
      await d.say('حالا ته حساب مهران دو بخش دارد: بدهکار مالی (ریال) و بستانکار جنسی (۴۹٫۶۶۷ گرم ۷۵۰). این دو هرگز با هم قاطی نمی‌شوند.', 5500);
      await d.say('قیمت قفل‌شده: مشتری تلفنی قیمت می‌پرسد. مظنه را بنویسید و «قفل همین قیمت» را بزنید.', 3800);
      await d.click('[data-mode=sell]');
      await d.click('[data-kind=melt]');
      await d.type('[data-f=mazaneh]', '401500000');
      await d.click('[data-quote-lock]', 1500);
      await d.point('.dk-qon');
      await d.say('قیمت با کد Q برای ۱۰ دقیقه قفل شد؛ شمارش معکوس می‌بینید و «برگه مشتری» چاپی دارد. سند فقط با همین قیمت، همین جهت و همین مشتری ثبت می‌شود.', 6000);
      await d.click('[data-quote-clear]');
      await d.click('[data-act=hawala]', 1200);
      await d.say('«حواله»: مثلاً مهران می‌گوید ۱۰ گرم از طلای من را به حساب بنکدار بزن. «از» بدهکار و «به» بستانکار می‌شود.', 5000);
      await page.keyboard.press('Escape');
      await wait(500);
      await d.click('[data-act=convert]', 1200);
      await d.say('«تبدیل مانده جنسی به ریال»: مانده طلای مشتری با نرخ روز به مانده ریالی تبدیل می‌شود، مثل فروش روی حساب.', 4500);
      await page.keyboard.press('Escape');
      await wait(500);
    },
  },
  {
    n: 5, slug: 'daybook', title: 'روزنگار، رهگیری و اسناد', sub: 'همه رویدادهای روز با مانده پس از هر سند',
    steps: ['روزنگار: هر سند با زمان، مشتری، ردیف‌ها، روش پرداخت و مانده پس از آن.', 'فیلتر خرید، فروش، جنسی، حواله… و خروجی اکسل، CSV، PDF.', 'رهگیری: با کد رهگیری، کد اصالت، شماره پیگیری بانک، سریال شمش یا موبایل مشتری سرگذشت کامل سند.', 'سند قطعی حذف نمی‌شود: ویرایش با دلیل نسخه تازه می‌سازد و ابطال در تاریخچه می‌ماند.'],
    async run(page, d) {
      await d.go('/books/day', 1800);
      await d.say('روزنگار: همه اسناد امروز، به ترتیب زمان، با مشتری، جزئیات هر ردیف، روش پرداخت و مانده مشتری پس از همان سند.');
      await d.scroll(400);
      await d.click('[data-f=goods]');
      await d.say('فیلترها: فقط اسناد جنسی، فقط خرید، فقط فروش… و خروجی اکسل، CSV، JSON یا PDF.', 3800);
      await d.click('[data-f=all]').catch(() => {});
      const code = await page.$eval('.dy-track, .rz-track', (a) => a.textContent.trim()).catch(() => '');
      await d.go(`/books/trace?q=${encodeURIComponent(code)}`, 1800);
      await d.say('رهگیری: با کد رهگیری، کد اصالت روی فاکتور، شماره پیگیری بانک، سریال شمش یا موبایل مشتری، سرگذشت کامل سند: ثبت، ویرایش، چاپ، ارسال، تطبیق بانک و اثر روی هر حساب.', 6500);
      await d.scroll(500, 1500);
    },
  },
  {
    n: 6, slug: 'customers', title: 'مشتریان و برگه ته حساب آنلاین', sub: 'ته حساب با زبان بازار، ریز حساب و تأیید مشتری',
    steps: ['فهرست مشتریان با مانده هر واحد.', 'صفحه مشتری: ته حساب (بدهکار/بستانکار مالی و جنسی، مطالبه و تعهد) و ریز حساب به تفکیک سند یا واحد.', '«نامه تأیید مانده» چاپی.', '«برگه ته حساب آنلاین»: لینک تاریخ‌دار با QR برای واتساپ یا پیامک؛ مشتری روی گوشی می‌بیند و تأیید یا مغایرت اعلام می‌کند.'],
    async run(page, d) {
      await d.go('/books/parties', 1600);
      await d.say('مشتریان با مانده هر کدام: قرمز یعنی بدهکار، سبز یعنی بستانکار؛ مالی و جنسی جدا.', 3800);
      await d.click('a[href^="/books/party/"]:has-text("مهران")', 1800);
      await d.say('ته حساب با اصطلاح بازار: مهران بدهکار مالی و بستانکار جنسی است. پایین‌تر ریز حساب هر سند و مانده پس از آن.', 5200);
      await d.click('[data-act=share]', 1200);
      await d.click('[data-sh-make]', 1600);
      await d.point('.sh-link');
      await d.say('لینک برگه ته حساب با QR، کپی، واتساپ و پیامک. معتبر برای مدت مشخص و هر وقت لازم شد قابل لغو.', 5000);
      const url = await page.inputValue('.sh-link input');
      await d.go(new URL(url).pathname, 1600);
      await d.say('مشتری روی گوشی همین را می‌بیند: مانده، گردش ۶۰ روز اخیر و دکمه «تأیید می‌کنم» یا «مغایرت دارم». پاسخ با تاریخ در دفتر رویداد ثبت می‌شود.', 6000);
      await d.click('button[value=agree]', 1800);
      await wait(800);
    },
  },
  {
    n: 7, slug: 'vault', title: 'گاوصندوق، محصولات و شمش', sub: 'موجودی، کم و زیاد با سند، محصول اختصاصی و شناسنامه شمش',
    steps: ['گاوصندوق: آبشده، سکه، شمش، ارز، نقد و بانک با ارزش روز؛ امانت مشتریان و موقعیت خالص.', 'محصولات: افزودن محصول اختصاصی (مثلاً پارسیان ۵۰۰ سوتی)، ویرایش نام، پنهان کردن، جابه‌جایی، حذف محصول بی‌سابقه.', 'کم و زیاد کردن موجودی فقط با «سند اصلاح موجودی» و دلیل؛ کسری به میانگین بها زیان همان روز است.', 'شناسنامه شمش: عکس روی و پشت هنگام ورود و مقایسه هنگام خروج.'],
    async run(page, d) {
      await d.go('/books/vault', 1800);
      await d.say('گاوصندوق: همه موجودی فیزیکی با ارزش روز، طلای امانی مشتریان و موقعیت خالص طلای مغازه.', 4600);
      await d.go('/books/products', 1600);
      await d.say('محصولات: ترتیب همین فهرست، ترتیب دکمه‌های میز معامله است. محصول اختصاصی خودتان را اضافه کنید.', 4200);
      await d.click('[data-act=new]');
      await d.type('#pf [name=label]', 'سکه پارسیان ۵۰۰ سوتی');
      await d.type('#pf [name=short]', 'پارسیان ۵۰۰');
      await d.type('#pf [name=weight]', '0.5');
      await d.click('#pf button.btn:not(.ghost)', 1500);
      await d.say('محصول تازه اضافه شد و در میز معامله هم آمد. با ▲▼ یا کشیدن جابه‌جا می‌شود؛ «پنهان» آن را از میز برمی‌دارد.', 4600);
      await d.click('.pr-row[data-id=emami] [data-dir="-1"]', 1000);
      await d.type('#af [name=qty]', '1');
      await d.type('#af [name=reason]', 'کسری شمارش پایان روز');
      await d.say('کسری یک سکه امامی: فقط با «سند اصلاح موجودی» و دلیل. به میانگین بها، زیان همان روز ثبت می‌شود و کد رهگیری دارد.', 5200);
      await d.click('#af button.btn', 1800);
      await d.go('/books/smart?t=bars', 1600);
      await d.say('شناسنامه شمش: هنگام ورود از روی و پشت شمش عکس بگیرید؛ هنگام خروج دوباره. نرم‌افزار دو عکس را مقایسه و شمش جابه‌جاشده را مشخص می‌کند.', 6000);
    },
  },
  {
    n: 8, slug: 'bank', title: 'بانک و تطبیق', sub: 'هر پرداخت یک ردیف؛ صورت‌حساب بانک را بچسبانید',
    steps: ['صفحه بانک هر حساب: هر پرداخت کارتخوان، کارت به کارت و فیش یک ردیف با کد رهگیری.', 'صورت‌حساب بانک را بچسبانید؛ ردیف‌های هم‌مبلغ و هم‌روز با شماره پیگیری خودکار تطبیق می‌شوند.', 'مانده دفتر و مانده تطبیق‌شده کنار هم.'],
    async run(page, d) {
      const accs = await J('GET', '/api/books/accounts', null, S.token);
      const bank = accs.items.find((a) => a.kind === 'bank');
      await d.go(`/books/bank/${bank.id}`, 1800);
      await d.say('بانک: هر پرداخت یک ردیف با کد رهگیری. برای تطبیق، صورت‌حساب بانک را این‌جا بچسبانید: تاریخ، مبلغ، شماره پیگیری.', 5000);
      const jdToday = await page.evaluate(async () => (await import('/js/bk.mjs')).jd((await import('/js/bk.mjs')).today()));
      await d.type('#stmt', `${jdToday}, 500000000, 1234`);
      await d.click('[data-act=match]').catch(() => {});
      await wait(1500);
      await d.say('ردیف هم‌مبلغ و هم‌روز با همان شماره پیگیری پیدا و تطبیق شد. ردیف‌های مانده را دستی بررسی کنید.', 4500);
    },
  },
  {
    n: 9, slug: 'reports', title: 'داشبورد و گزارش‌ها', sub: 'موقعیت طلا، سن مطالبات، ترکیب دارایی، سود و زیان',
    steps: ['داشبورد مدیریت: مظنه، موجودی طلای فیزیکی، مطالبات، بدهی‌ها و موقعیت خالص.', 'نمودار موقعیت خالص طلا، سن مطالبات (روش اولین‌ورود) و ترکیب دارایی.', 'تپش سال (فعالیت روزانه) و کارنامه ماهانه سود و زیان.', 'گزارش سود و زیان معاملات به روش میانگین موزون و تراز دارایی.'],
    async run(page, d) {
      await d.go('/books/dashboard', 2600);
      await d.say('داشبورد مدیریت: همه اعداد از همین دفاتر است. مظنه زنده، موجودی طلای فیزیکی، مطالبات مشتریان، بدهی‌ها و موقعیت خالص طلا.', 5200);
      await d.scroll(520, 1500);
      await d.say('موقعیت خالص طلا در بازه دلخواه، سن مطالبات به روش اولین‌ورود (روی هر بازه بزنید تا مشتریانش بیایند) و ترکیب دارایی.', 5200);
      await d.scroll(700, 1500);
      await d.say('تپش سال: هر خانه یک روز کاری. کارنامه ماهانه: سود و زیان تحقق‌یافته هر ماه شمسی.', 4600);
      await d.go('/books/reports?tab=pnl', 1800);
      await d.say('گزارش سود و زیان: بهای تمام‌شده میانگین موزون، سود تحقق‌یافته و تحقق‌نیافته با قیمت روز. خروجی اکسل هم دارد.', 5000);
    },
  },
  {
    n: 10, slug: 'assistant', title: 'ممیز و تاجیار', sub: 'وارسی خودکار دفاتر و دستیار هوشمند با کلید هر سرویس',
    steps: ['ممیز: هر بار کل دفاتر را وارسی می‌کند (زنجیره رویداد، موجودی منفی، قیمت دور از تابلو، سند تکراری، سقف اعتبار، چک سررسید…).', 'تاجیار: بپرسید «بدهکاران»، «مانده مهران»، «محاسبه ۲ گرم عیار ۷۴۰»؛ فقط می‌خواند و حساب می‌کند.', 'کلیدهای هوش مصنوعی: Claude، ChatGPT، Gemini، Grok، Qwen، OpenCode، DeepSeek و… با ترتیب و جایگزینی خودکار.'],
    async run(page, d) {
      await d.go('/books/audit', 2400);
      await d.say('ممیز: امتیاز سلامت دفاتر و یافته‌ها با شدت. روی هر یافته بزنید تا به همان سند بروید.', 4200);
      await d.click('[data-q="بدهکاران"]', 2200);
      await d.say('تاجیار مستقیم از دفاتر جواب می‌دهد. هیچ سندی را ثبت یا تغییر نمی‌دهد.', 3800);
      await d.type('#aq', 'محاسبه ۲ گرم عیار ۷۴۰ مظنه ۴۰۰۰۰۰۰۰۰');
      await page.press('#aq', 'Enter');
      await wait(2200);
      await d.go('/books/ai', 1600);
      await d.say('کلیدهای هوش مصنوعی: کلید Claude، ChatGPT، Gemini، Grok، Qwen، OpenCode یا هر سرویس دیگر را اضافه کنید. کلید رمزشده روی سرور می‌ماند؛ به ترتیب امتحان می‌شوند و اگر همه قطع باشند تاجیار از خود دفاتر جواب می‌دهد.', 7000);
      await d.click('[data-act=add]', 1200);
      await d.say('سرویس را انتخاب کنید، نام مدل را از پنل همان سرویس بنویسید و کلید را بچسبانید؛ «آزمون اتصال» فوراً می‌گوید درست است یا نه.', 5200);
      await page.keyboard.press('Escape');
      await wait(500);
    },
  },
  {
    n: 11, slug: 'smart', title: 'ابزارهای هوشمند و بستن روز', sub: 'نقدینگی فردا، هشدار نوسان و امضای دیجیتال روز',
    steps: ['نقدینگی فردا: نقد، طلا و سکه لازم با اطمینان ۹۰٪ از روزهای هم‌نام هفته، با سنجش دقت.', 'هشدار نوسان: مشتریانی که با بالا یا پایین رفتن قیمت، وثیقه‌شان بدهی را پوشش نمی‌دهد و قیمت شکست.', 'بستن روز: شمارش (با ترازوی متصل یا دستی)، وارسی بانک، ممیز و موارد باز، سپس امضا با رمز؛ روز بسته قفل می‌شود.'],
    async run(page, d) {
      await d.go('/books/smart?t=forecast', 2200);
      await d.say('نقدینگی فردا: از همین روز هفته در ۱۲ هفته اخیر، چقدر نقد، طلا و سکه باید صبح آماده باشد؛ کمبود را هم می‌گوید و دقت پیش‌بینی‌های قبلی را نشان می‌دهد.', 6000);
      await d.click('[data-tab=risk]', 1800);
      await d.say('هشدار نوسان: مثلاً رضا ۱۰ گرم طلای امانی دارد و ۳۰۰ میلیون بدهکار است؛ اگر قیمت پایین بیاید طلا بدهی را پوشش نمی‌دهد. «قیمت شکست» هم نمایش داده می‌شود.', 6000);
      await d.click('[data-tab=close]', 2000);
      await d.say('بستن روز: شمارش گاوصندوق و صندوق نقد (با ترازوی متصل به کامپیوتر یا دستی)، وارسی تطبیق بانک، ممیز، پیش‌نویس‌ها و قیمت‌های قفل‌شده باز.', 6000);
      await d.scroll(500, 1200);
      await d.say('در پایان با رمز خودتان امضا می‌کنید؛ امضای دیجیتال فروشگاه ثبت و روز قفل می‌شود. فقط مالک می‌تواند روز بسته را با دلیل دوباره باز کند.', 5600);
    },
  },
  {
    n: 12, slug: 'phone', title: 'روی گوشی و پوسته روشن', sub: 'همان حساب، همان داده‌ها؛ طراحی مخصوص صفحه کوچک',
    viewport: { width: 390, height: 844 },
    steps: ['با همان نام کاربری و رمز روی گوشی وارد شوید.', 'نبض، میز معامله و گاوصندوق برای صفحه کوچک چیده شده‌اند.', 'دکمه پوسته بالای صفحه: «شب آرام» برای ساعت‌های طولانی و «روز» برای مغازه روشن.'],
    async run(page, d) {
      await d.go('/login', 600);
      await d.type('input[name=login]', 'omid.rahimi');
      await d.type('input[name=password]', S.password);
      await d.click('button[type=submit]', 2200);
      await d.go('/books/pulse', 2000);
      await d.say('روی گوشی با همان حساب: نبض امروز، قیمت‌ها و آخرین رویدادها.', 4200);
      await d.go('/books/desk', 1800);
      await d.say('میز معامله روی گوشی.', 2600);
      await d.click('#themeBtn', 1600);
      await d.say('پوسته «روز» برای مغازه پرنور؛ «شب آرام» برای کار طولانی. انتخاب شما روی همین دستگاه می‌ماند.', 4600);
      await d.go('/books/dashboard', 2400);
      await d.say('پایان. هر فصل را می‌توانید دوباره از صفحه «راهنما» ببینید.', 3600);
    },
  },
];

try {
  for (let i = 0; i < 80; i++) {
    if (await fetch(`${base}/api/health`).then((r) => r.ok).catch(() => false)) break;
    await wait(250);
  }
  const browser = await chromium.launch();
  const out = [];
  for (const ch of CHAPTERS) {
    if (only.length && !only.includes(ch.n)) continue;
    const vp = ch.viewport ?? { width: 1280, height: 720 };
    const dir = path.join(rawDir, String(ch.n));
    mkdirSync(dir, { recursive: true });
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, recordVideo: { dir, size: vp }, ...(ch.viewport ? { isMobile: true, hasTouch: true } : {}) });
    await ctx.addInitScript(OVERLAY);
    await ctx.addInitScript((t) => {
      try {
        if (t) localStorage.setItem('beatris.token', t);
        localStorage.setItem('beatris.theme', 'calm');
      } catch {
        /* no storage */
      }
    }, ch.n >= 3 && ch.n < 12 ? S.token : null);
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    await page.goto(base + (ch.n >= 3 && ch.n < 12 ? '/books/pulse' : '/login'));
    await page.evaluate(([n, t, s]) => window.__tt.title(n, t, s), [ch.n, ch.title, ch.sub]);
    await wait(3400);
    const d = director(page, `فصل ${ch.n} · ${ch.title}`);
    const t0 = Date.now();
    await ch.run(page, d);
    await page.evaluate(() => window.__tt.say('', ''));
    await wait(600);
    const dur = Math.round((Date.now() - t0) / 1000 + 4);
    const video = page.video();
    await ctx.close();
    const webm = await video.path();
    const mp4 = path.join(OUT, `${String(ch.n).padStart(2, '0')}.mp4`);
    const jpg = path.join(OUT, `${String(ch.n).padStart(2, '0')}.jpg`);
    execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-i', webm, '-c:v', 'libx264', '-preset', 'slow', '-crf', ch.viewport ? '28' : '26', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-r', '25', mp4]);
    execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-ss', '5', '-i', mp4, '-frames:v', '1', '-q:v', '4', jpg]);
    // a VP9 copy for browsers built without H.264 (Chromium builds, some Linux Firefox): the page offers both
    execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-i', mp4, '-c:v', 'libvpx-vp9', '-crf', '40', '-b:v', '0', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '4', '-an', mp4.replace(/\.mp4$/, '.webm')]);
    out.push({ n: ch.n, slug: ch.slug, title: ch.title, sub: ch.sub, steps: ch.steps, file: `/media/tutorial/${path.basename(mp4)}`, webm: `/media/tutorial/${path.basename(mp4, '.mp4')}.webm`, poster: `/media/tutorial/${path.basename(jpg)}`, seconds: dur, vertical: !!ch.viewport, bytes: statSync(mp4).size });
    console.log(`chapter ${ch.n} ${ch.title}: ${dur}s, ${(statSync(mp4).size / 1e6).toFixed(1)} MB${errs.length ? ` — page errors: ${errs.join(' | ')}` : ''}`);
  }
  await browser.close();
  // keep chapters generated earlier when only some were rebuilt
  const listFile = path.join(OUT, 'chapters.json');
  let prev = [];
  try {
    prev = JSON.parse((await import('node:fs')).readFileSync(listFile, 'utf8')).chapters ?? [];
  } catch {
    /* first run */
  }
  const merged = [...prev.filter((c) => !out.some((o) => o.n === c.n)), ...out].sort((a, b) => a.n - b.n);
  writeFileSync(listFile, JSON.stringify({ made: new Date().toISOString(), chapters: merged }, null, 1));
} finally {
  server.kill();
  rmSync(dataDir, { recursive: true, force: true });
  rmSync(rawDir, { recursive: true, force: true });
}
