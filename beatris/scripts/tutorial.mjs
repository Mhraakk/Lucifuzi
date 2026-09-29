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
let pace = 1; // chapters outside --only still run (they build the shop's state) but unrecorded and fast
function director(page, title) {
  const wait = (ms) => new Promise((r) => setTimeout(r, Math.max(120, ms * pace)));
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
// what chapters 13–17 need: a second manager (four eyes), a document to void, dated history, a sale below cost,
// a large round cash receipt and a cheque due within ten days — all through the API, like real work
async function prepControl() {
  const { toJalali } = await import('../public/js/ta.mjs');
  const faD = (iso) => toJalali(+iso.slice(0, 4), +iso.slice(5, 7), +iso.slice(8, 10)).map((x, i) => String(x).padStart(i ? 2 : 4, '0')).join('/').replace(/\d/g, (x) => '۰۱۲۳۴۵۶۷۸۹'[x]);
  S.pastDayFa = faD(ago(10));
  S.pastDay2Fa = faD(ago(20));
  const vendor = (await J('POST', '/api/auth/login', { login: '09120000001', password: '1234' })).token;
  const shop = (await J('GET', '/api/vendor/tenants', null, vendor)).items.find((t) => t.name === 'طلا و سکه امید');
  const pw = 'Sara-manager-2026';
  await J('POST', `/api/vendor/tenants/${shop.id}/users`, { name: 'سارا احمدی', username: 'sara.ahmadi', password: pw, role: 'manager' }, vendor);
  S.managerToken = (await J('POST', '/api/auth/login', { login: 'sara.ahmadi', password: pw })).token;
  const parties = (await J('GET', '/api/books/parties?q=', null, S.token)).items;
  const reza = parties.find((p) => p.name === 'رضا تهرانی') ?? parties[0];
  const doc = await J('POST', '/api/books/docs', { type: 'trade', date: today, partyId: reza.id, lines: [{ kind: 'melt', dir: 'in', weight: 1.2, fineness: 750, mazaneh: 405000000 }], payments: [{ method: 'cash', dir: 'out', amount: 112190000 }] }, S.token);
  S.voidDoc = doc.id ?? doc.doc?.id;
  await J('POST', '/api/books/docs', { type: 'trade', date: today, partyId: reza.id, lines: [{ kind: 'melt', dir: 'out', weight: 3, fineness: 750, mazaneh: 300000000 }], payments: [{ method: 'cash', dir: 'in', amount: 207770000 }] }, S.token).catch((e) => console.log('below-cost seed:', e.message));
  await J('POST', '/api/books/docs', { type: 'trade', date: today, partyId: reza.id, lines: [], payments: [{ method: 'cash', dir: 'in', amount: 5000000000 }] }, S.token).catch((e) => console.log('round cash seed:', e.message));
  await J('POST', '/api/books/docs', { type: 'trade', date: today, partyId: reza.id, lines: [], payments: [{ method: 'cheque', dir: 'in', amount: 900000000, chequeNo: '778899', bank: 'ملت', due: ago(-6) }] }, S.token).catch((e) => console.log('cheque seed:', e.message));
}
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
  {
    n: 13, slug: 'pulse', title: 'نبض طلا و «چه تغییر کرد؟»', sub: 'امضای داشبورد: حال فروشگاه در یک جمله',
    steps: ['بالای سه نمودار داشبورد، «نبض طلا» حال همین لحظه فروشگاه را در یک جمله می‌گوید: آرام، نیاز به نگاه یا هشدار.', 'نوار رنگی احتمال هر حالت است؛ «اطمینان» فاصله از «نمی‌دانم» و «پوشش داده» سهم نشانه‌هایی است که داده داشتند.', '«چرا این حکم؟» همه نشانه‌ها را با وزن و امتیازشان نشان می‌دهد.', '«چه تغییر کرد؟» فقط تغییرات مهم از آخرین سر زدن شما را می‌آورد؛ «دیدم» نقطه را جلو می‌برد.', 'روی «؟» هر عدد بزنید تا بگوید از کجا آمده: جمله، فرمول، اجزا و اسناد.', 'Ctrl+K (یا دکمه ذره‌بین بالای صفحه): با چند کلمه هر مشتری، سند، ابزار یا راهنمایی را پیدا کنید.'],
    async run(page, d) {
      await d.go('/books/dashboard', 3200);
      await d.say('داشبورد مدیریت؛ حالا بالای همان سه نمودار، امضای برنامه آمده است: «نبض طلا» و «چه تغییر کرد؟».', 5200);
      await d.point('.gd-pulse');
      await d.say('نبض طلا در یک جمله می‌گوید فروشگاه الان آرام است، نیاز به نگاه دارد یا هشدار است؛ و مهم‌ترین دلیلش را هم می‌گوید.', 6000);
      await d.point('.gd-prob');
      await d.say('این حکم «نوع‌دار» است: فقط یکی از سه حالت مجاز، با احتمال هر کدام، «اطمینان» و «پوشش داده» یعنی چه سهمی از نشانه‌ها واقعاً داده داشتند.', 7000);
      await d.click('.gd-pulse [data-explain=pulse]', 1800);
      await d.say('«چرا این حکم؟»: هر نشانه با امتیاز و وزنش؛ استثناها، نقد فردا، پوشش طلای امانی، نوسان قیمت، روز بسته‌نشده و درخواست‌های تأیید.', 7000);
      await page.keyboard.press('Escape');
      await d.point('.gd-news');
      await d.say('«چه تغییر کرد؟» فقط تغییرات مهم از آخرین باری که سر زدید: معامله‌های بزرگ، ابطال‌ها، استثناهای تازه، تغییر نقد و طلا و مظنه.', 6500);
      await d.click('#gdSeen', 1500);
      await d.say('با «دیدم»، دفعه بعد فقط تغییرات تازه‌تر نشان داده می‌شود.', 3200);
      await d.click('.gd-kpi-w .gd-why', 1800);
      await d.say('روی «؟» هر عدد مهم بزنید تا به زبان ساده بگوید از کجا آمده: جمله، فرمول، اجزا و آخرین اسنادی که آن را ساخته‌اند. این اعتماد می‌سازد.', 7500);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
      await page.keyboard.press('Control+k');
      await page.waitForTimeout(800);
      await d.say('فرمان سریع: Ctrl و K در هر صفحه. با چند کلمه هر چیزی را پیدا کنید.', 3600);
      await page.keyboard.type('رضا', { delay: 120 });
      await page.waitForTimeout(1600);
      await d.say('مشتری، کد رهگیری سند، سریال شمش، نام هر ابزار یا یک پاسخ از راهنما. با Enter باز می‌شود.', 5000);
      await page.keyboard.press('Escape');
      await d.go('/books/control', 2400);
      await d.say('و این «کنترل» است: نبض و تغییرات، به‌علاوه همه ابزارهای کنترلی با یک توضیح یک‌خطی و فیلم هر کدام.', 6000);
      await d.scroll(700, 1400);
    },
  },
  {
    n: 14, slug: 'simulate', title: 'شبیه‌ساز معامله و محاسبه فروش امن', sub: 'قبل از ثبت ببینید نقد، موجودی و بدهی چه می‌شود',
    steps: ['کنترل ← «شبیه‌ساز و فروش امن».', 'مشتری، جهت، کالا، وزن، عیار، مظنه و پرداخت را مثل میز معامله وارد کنید؛ هیچ چیزی ثبت نمی‌شود.', 'حکم «امن / با احتیاط / ثبت نکنید» با احتمال‌ها و دلایل: موجودی، زیر بها، حاشیه سود، فاصله از تابلو، نقد فردا، سقف اعتبار، روز و ماه قفل.', 'جدول «الان / پس از معامله / تغییر» برای نقد، بانک، طلا، سکه و مانده مشتری.', 'سود تقریبی همان فروش از روی سری‌های خرید (اولین‌ورود).'],
    async run(page, d) {
      await d.go('/books/control?t=simulate', 2200);
      await d.say('قبل از هر معامله بزرگ بپرسید: «اگه این‌قدر بفروشم یا بخرم، نقد و موجودی و بدهی چی می‌شه؟» این‌جا جوابش را می‌گیرید و هیچ سندی ثبت نمی‌شود.', 7000);
      await d.type('#simF [name=pq]', 'رضا');
      await page.waitForSelector('#simPicks [data-pid]', { timeout: 8000 });
      await d.click('#simPicks [data-pid]', 900);
      await d.type('#simF [name=weight]', '8');
      await d.say('مثال: ۸ گرم آبشده ۷۵۰ به رضا تهرانی، با مظنه تابلو، روی حساب.', 3600);
      await d.click('#simF [data-act=run]', 2200);
      await d.point('.ctl-verdict');
      await d.say('حکم «نوع‌دار» با احتمال سه حالت. پایینش همه دلایل: موجودی کافی است؟ زیر بها نیست؟ حاشیه سود؟ فاصله از تابلو؟ نقد فردا؟ سقف اعتبار مشتری؟', 7500);
      await d.scroll(520, 1400);
      await d.say('و جدول «الان، پس از معامله، تغییر»: نقد، بانک، طلا و مانده مشتری؛ با همان موتوری که سند را ثبت می‌کند.', 5500);
      await d.scroll(-520, 900);
      await d.type('#simF [name=weight]', '900');
      await d.say('حالا ۹۰۰ گرم؛ بیش از موجودی گاوصندوق.', 2600);
      await d.click('#simF [data-act=run]', 2200);
      await d.point('.ctl-verdict');
      await d.say('«ثبت نکنید»: موجودی کافی نیست. این یعنی «محاسبه فروش امن»؛ قبل از اشتباه، نه بعد از آن.', 5500);
    },
  },
  {
    n: 15, slug: 'exceptions', title: 'مرکز استثناها، موتور تأیید و کنترل چهار چشم', sub: 'فقط چیزهای عجیب و خطرناک؛ کارهای حساس با تأیید مدیر دیگر',
    steps: ['کنترل ← «استثناها»: موجودی یا صندوق منفی، فروش زیر بها، تخفیف غیرعادی، نقد کلان گرد، چند معامله هم‌روز یک مشتری، سند با تاریخ گذشته، ویرایش پس از چاپ، ابطال، عبور از سقف اعتبار، اختلاف دفتر با اسناد.', 'کنار هر مورد احتمال «واقعاً مشکل است»؛ با «واقعی بود / هشدار کاذب» داوری کنید.', 'با ۲۰ داوری، کالیبراسیون (روش typesafe): اول AUC و ECE سنجیده می‌شوند و اصلاح فقط اگر روی نیمه آزمون بهتر شد اعمال می‌شود.', '«تأییدها»: مالک قواعد را روشن می‌کند (ابطال، فروش زیر بها، تخفیف بالا، باز کردن دوره).', 'کنترل چهار چشم: درخواست‌کننده نمی‌تواند خودش تأیید کند؛ پس از تأیید مدیر دیگر، همان کار دوباره انجام می‌شود.'],
    async run(page, d) {
      await d.go('/books/control?t=exceptions', 2400);
      await d.say('مرکز استثناها: صاحب طلافروشی لازم نیست در همه‌چیز غرق شود؛ فقط این‌ها را ببیند.', 5000);
      await d.point('.ctl-exc li');
      await d.say('کنار هر مورد احتمال «واقعاً مشکل است» آمده. شرحش سند و مبلغ را می‌گوید و «باز کردن» مستقیم به همان سند می‌رود.', 6000);
      await d.click('.ctl-exc li [data-label="1"]', 1200);
      await d.say('با «واقعی بود» یا «هشدار کاذب» داوری کنید. همین داوری‌ها احتمال‌ها را با خود فروشگاه شما کالیبره می‌کنند.', 5500);
      await d.click('.ctl-cal summary', 1200);
      await d.say('روش کالیبراسیون از پروژه typesafe آمده: اول قدرت تمایز (AUC) و خطای مقیاس (ECE) سنجیده می‌شود؛ اصلاح دوعددی فقط اگر روی داده آزمون بهتر شد، اعمال می‌شود.', 7500);
      await d.go('/books/control?t=approvals', 1800);
      await d.say('موتور تأیید: مالک مشخص می‌کند کدام کارها تأیید مدیر دیگر را لازم دارد.', 4200);
      await d.click('#apR [name=enabled]', 600);
      await d.click('#apR button.btn', 1400);
      await d.say('روشن شد: ابطال سند، فروش زیر بها، تخفیف بالاتر از حد و باز کردن دوره قفل.', 4200);
      // the manager tries to void a document
      await page.evaluate((t) => localStorage.setItem('beatris.token', t), S.managerToken);
      await d.go(`/books/doc/${S.voidDoc}`, 2000);
      await d.say('حالا سارا، مدیر فروشگاه، می‌خواهد یک سند را باطل کند.', 3400);
      await d.click('[data-act=void]', 900);
      await d.type('.modal [name=reason]', 'ثبت تکراری');
      await d.click('.modal [data-ok]', 2200);
      await d.say('ابطال انجام نشد؛ درخواست تأیید ثبت شد. سارا خودش نمی‌تواند آن را تأیید کند: کنترل چهار چشم.', 5500);
      await page.evaluate((t) => localStorage.setItem('beatris.token', t), S.token);
      await d.go('/books/control?t=approvals', 2000);
      await d.say('مالک درخواست را با خلاصه‌اش می‌بیند و تأیید یا با دلیل رد می‌کند.', 3800);
      await d.click('.ctl-ap [data-ap=approve]', 1600);
      await page.evaluate((t) => localStorage.setItem('beatris.token', t), S.managerToken);
      await d.go(`/books/doc/${S.voidDoc}`, 1800);
      await d.click('[data-act=void]', 900);
      await d.type('.modal [name=reason]', 'ثبت تکراری');
      await d.click('.modal [data-ok]', 2400);
      await d.say('پس از تأیید، سارا همان ابطال را دوباره می‌زند و انجام می‌شود. تأیید فقط یک بار و فقط برای همان محتوا معتبر است.', 6000);
      await page.evaluate((t) => localStorage.setItem('beatris.token', t), S.token);
      await d.go('/books/control?t=approvals', 1400);
      await d.click('#apR [name=enabled]', 500);
      await d.click('#apR button.btn', 1000);
    },
  },
  {
    n: 16, slug: 'twin', title: 'دوقلوی دیجیتال، ماشین زمان، سری‌ها و تایم‌لاین', sub: 'وضعیت هر روز، مسیر هر گرم و داستان هر مشتری',
    steps: ['کنترل ← «دوقلو و ماشین زمان»: وضعیت زنده فروشگاه یا دقیقاً پایان هر روز گذشته، با مقایسه دو روز.', 'نقد، بانک، طلای فیزیکی، طلای خالص، موقعیت خالص، مطالبات و بدهی، ارزش خالص و سود همان روز؛ هر کدام «؟» دارد.', '«سری‌ها»: هر خرید یک سری با کد رهگیری؛ مانده، بها و سود هر سری و اینکه هر گرم به کدام فروش رفت.', '«تایم‌لاین»: داستان مشتری در یک جمله (سابقه، روش پرداخت، زمان تسویه، بدهی فعلی) و همه فاکتورها، تحویل‌ها، پرداخت‌ها و اصلاحیه‌ها به ترتیب.', 'تایم‌لاین کالا: هر ورود و خروج طلای آبشده یا هر سکه با مانده بعد از آن.'],
    async run(page, d) {
      await d.go('/books/control?t=twin', 2200);
      await d.say('دوقلوی دیجیتال: کل فروشگاه زنده مدل می‌شود، نه فقط گزارش. همه عددها از همان دفاتر می‌آیند.', 5500);
      await d.type('#twF [name=day]', S.pastDayFa);
      await d.type('#twF [name=cmp]', S.pastDay2Fa);
      await d.click('#twF button.btn:not(.ghost)', 2200);
      await d.say('ماشین زمان: وضعیت دقیق پایان آن روز، و تغییر هر عدد نسبت به روز دیگر.', 5000);
      await d.click('.ctl-tw .ctl-why', 1800);
      await d.say('و باز هم «؟»: این عدد از کجا آمده.', 3000);
      await page.keyboard.press('Escape');
      await d.go('/books/control?t=lots', 2000);
      await d.say('سری طلاها: هر خرید یک سری با کد رهگیری همان ردیف. مانده هر سری و سودش را می‌بینید.', 5000);
      await d.click('.ctl-lots details summary', 1500);
      await d.say('ردیابی هر گرم: این سری به کدام فروش‌ها رفت، به چه مبلغ و با چه سودی.', 4500);
      await d.go('/books/control?t=story', 1600);
      await d.type('#stF [name=pq]', 'رضا');
      await page.waitForSelector('#stPicks [data-pid]', { timeout: 8000 });
      await d.click('#stPicks [data-pid]', 2200);
      await d.say('تایم‌لاین هوشمند مشتری: نه فقط فهرست فاکتور؛ داستان رابطه در یک جمله، عادت پرداخت، زمان تسویه و بدهی فعلی.', 6500);
      await d.scroll(500, 1400);
      await d.say('و همه رویدادها به ترتیب: فاکتور، تحویل، پرداخت، چک، اصلاحیه و ابطال، هر کدام با کد رهگیری.', 5000);
    },
  },
  {
    n: 17, slug: 'accounting-control', title: 'تراز دوتایی، پیش‌بینی ۱۰ روزه، قفل دوره، بستن خودکار و تبدیل عیار', sub: 'کنترل‌های حسابداری که معمولاً نیست',
    steps: ['«تراز دوتایی»: هر حساب دو بعد جدا دارد: وزنی (گرم ۷۵۰ و خالص) و ریالی؛ هرگز قاطی نمی‌شوند.', '«پیش‌بینی ۱۰ روزه»: نقد و طلا روز به روز با چک‌های سررسید و بازه ۸۰٪.', '«قفل دوره»: پس از بستن ماه، ثبت، ویرایش یا ابطال با تاریخ آن ماه ممنوع است؛ فقط سند اصلاحی در تاریخ باز. باز کردن فقط با مالک و دلیل.', '«بستن خودکار»: هر شب حساب‌ها خودکار تطبیق داده می‌شوند و فقط مغایرت‌ها نشان داده می‌شوند؛ اگر پاک بود، روز با امضای فروشگاه بسته می‌شود.', '«تبدیل عیار»: هر وزن و عیار (۷۵۰، ۱۸k، ۰٫۷۵…) به خالص، ۷۵۰، مثقال ۷۰۵ و ارزش با مظنه.'],
    async run(page, d) {
      await d.go('/books/control?t=trial', 2200);
      await d.say('تراز دوتایی: ستون‌های طلایی وزن‌اند (گرم ۷۵۰ و خالص)، ستون آبی ریال. هیچ‌وقت با هم جمع نمی‌شوند.', 6000);
      await d.go('/books/control?t=forecast', 2400);
      await d.say('پیش‌بینی ساده ۱۰ روزه: با سررسیدهای فعلی و میانگین جریان روزانه، ۱۰ روز دیگر تقریباً چقدر نقد و طلا دارید؛ نوار روشن بازه ۸۰٪ است.', 7000);
      await d.scroll(520, 1400);
      await d.say('چک‌های سررسید همین ۱۰ روز هم فهرست شده‌اند.', 3000);
      await d.go('/books/control?t=periods', 1800);
      await d.say('قفل دوره مالی: ماه تمام‌شده را قفل کنید. از آن به بعد تغییر مستقیم ممنوع است؛ فقط سند اصلاحی.', 5500);
      await d.click('.ctl-months [data-lock]', 1000);
      await d.click('.modal [data-ok]', 1600);
      await d.say('قفل شد. هر ثبت یا ابطالی با تاریخ این ماه رد می‌شود. باز کردن فقط با مالک و با نوشتن دلیل است.', 5500);
      await d.go('/books/control?t=close', 1800);
      await d.say('بستن خودکار روز مالی: شب که می‌بندید، برنامه خودش حساب‌ها را تطبیق می‌دهد و فقط مغایرت‌ها را نشان می‌دهد.', 6000);
      await d.click('[data-act=recon]', 2200);
      await d.say('نتیجه تطبیق: مغایرت‌ها با پیوند مستقیم. اگر هیچ مغایرتی نبود و بستن خودکار روشن بود، روز با امضای دیجیتال فروشگاه بسته می‌شود.', 7000);
      await d.go('/books/control?t=karat', 1600);
      await d.type('#kF [name=w]', '12.5');
      await d.type('#kF [name=f]', '18k');
      await d.say('موتور تبدیل عیار: ۱۲٫۵ گرم ۱۸ عیار؛ خالص، معادل ۷۵۰ به قاعده دفتر، مثقال ۷۰۵ و قیراط، همه در یک نگاه.', 6000);
    },
  },
  {
    n: 18, slug: 'elliott', title: 'تحلیل جامع امواج الیوت', sub: 'شمارش دو درجه‌ای، فیبوناچی، کانال و دو سناریو روی یک نمودار', standalone: true,
    steps: ['حسابداری ← «تحلیل الیوت» (یا بازار ← «استودیوی تحلیل جامع الیوت»). نماد، بازه ۱ روزه، هفتگی یا ماهانه و درجه موج را انتخاب کنید.', 'درجه بزرگ نارنجی: (I) تا (V) یا (A)(B)(C). درجه کوچک: ۱ تا ۵ آبی و A B C قرمز؛ فقط وقتی زیرموج‌ها خودشان قواعد را پاس کنند.', 'سطوح فیبوناچی با قیمت، کانال موج، ناحیه حمایت یا مقاومت و ناحیه هدف جایگزین.', 'سناریوی اصلی (سبز) و جایگزین (قرمز) با مسیر، هدف و احتمال؛ پایین صفحه جمله‌های هر سناریو و قیمت ابطال.', 'RSI و MACD زیر نمودار؛ کشیدن، چرخ ماوس و دوبار کلیک برای جابه‌جایی و بزرگ‌نمایی؛ دکمه «تصویر» برای ذخیره.'],
    async run(page, d) {
      await d.go('/books/elliott', 3200);
      await d.say('تحلیل جامع امواج الیوت، داخل همان منوی حسابداری. همه چیز از قیمت‌های واقعی همین نماد حساب می‌شود، نه عدد ساختگی.', 6500);
      await d.point('#ewStats');
      await d.say('سربرگ: قیمت فعلی، تغییر، سقف و کف همین شمع و ۵۲ هفته.', 4200);
      await d.point('.ew-legend');
      await d.say('راهنمای موج‌ها: درجه بزرگ با پرانتز نارنجی، زیرموج‌ها در دایره؛ آبی حرکتی و قرمز اصلاحی.', 5500);
      await d.point('.ew-chart');
      await d.say('شمارش درجه بزرگ بهترین شمارشی است که همه قواعد را پاس می‌کند. هر پاره فقط وقتی زیرموج می‌گیرد که خودش هم قواعد را رعایت کند.', 7500);
      const box = await page.locator('.ew-cv').boundingBox();
      await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.35, { steps: 12 });
      await d.say('خطوط فیبوناچی با قیمت، کانال موج خط‌چین، ناحیه آبی حمایت یا مقاومت و ناحیه قرمز هدف سناریوی جایگزین.', 7000);
      await page.mouse.move(box.x + box.width * 0.88, box.y + box.height * 0.4, { steps: 12 });
      await d.say('سبز خط‌چین سناریوی اصلی است و قرمز جایگزین؛ هر کدام با هدف قیمتی روی نمودار.', 5500);
      await page.mouse.wheel(0, -400);
      await page.waitForTimeout(900);
      await d.say('با چرخ ماوس بزرگ‌نمایی کنید و با کشیدن جابه‌جا شوید؛ دوبار کلیک کل شمارش را برمی‌گرداند.', 4800);
      await page.mouse.dblclick(box.x + box.width * 0.5, box.y + box.height * 0.3);
      await page.waitForTimeout(800);
      await d.click('[data-tf=W]', 1800);
      await d.say('بازه هفتگی از همان داده روزانه ساخته می‌شود؛ درجه موج بزرگ‌تر دیده می‌شود.', 4500);
      await d.click('[data-tf=D]', 1500);
      await d.click('[data-deg="1.5"]', 1500);
      await d.say('«درشت» یا «ریز» آستانه موج‌ها را عوض می‌کند تا شمارش درجه دیگری را ببینید.', 4500);
      await d.click('[data-deg="1"]', 1200);
      await d.scroll(760, 1400);
      await d.point('#ewScen');
      await d.say('سناریوهای احتمالی: احتمال هر کدام از کیفیت شمارش، شیب میانگین، RSI و MACD؛ با اطمینان و پوشش نشانه‌ها.', 7000);
      await d.point('.ew-pats');
      await d.say('الگوهای رایج اصلاحی و جدول نسبت‌های فیبوناچی برای یادآوری سریع.', 4500);
      await d.scroll(520, 1400);
      await d.point('#ewCount');
      await d.say('شمارش و قواعد: هر قاعده با تیک یا ضربدر، نسبت‌های اندازه‌گیری‌شده و قیمت ابطال. آموزشی است، نه توصیه معامله.', 7000);
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
  const last = only.length ? Math.max(...only) : Infinity;
  for (const ch of CHAPTERS) {
    if (ch.n > last) break;
    const rec = !only.length || only.includes(ch.n);
    // chapters marked standalone only need the shop from chapters 1–2
    if (!rec && ch.n > 2 && only.length && only.every((n) => CHAPTERS.find((c) => c.n === n)?.standalone)) continue;
    pace = rec ? 1 : 0.25;
    if (ch.n === 13) await prepControl();
    const vp = ch.viewport ?? { width: 1280, height: 720 };
    const dir = path.join(rawDir, String(ch.n));
    mkdirSync(dir, { recursive: true });
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, ...(rec ? { recordVideo: { dir, size: vp } } : {}), ...(ch.viewport ? { isMobile: true, hasTouch: true } : {}) });
    await ctx.addInitScript(OVERLAY);
    await ctx.addInitScript((t) => {
      try {
        if (t) localStorage.setItem('beatris.token', t);
        localStorage.setItem('beatris.theme', 'calm');
      } catch {
        /* no storage */
      }
    }, ch.n >= 3 && ch.n !== 12 ? S.token : null);
    const page = await ctx.newPage();
    page.setDefaultTimeout(30000);
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    await page.goto(base + (ch.n >= 3 && ch.n !== 12 ? '/books/pulse' : '/login'));
    await page.evaluate(([n, t, s]) => window.__tt.title(n, t, s), [ch.n, ch.title, ch.sub]);
    await wait(rec ? 3400 : 300);
    const d = director(page, `فصل ${ch.n} · ${ch.title}`);
    const t0 = Date.now();
    try {
      await ch.run(page, d);
    } catch (e) {
      await page.screenshot({ path: path.join(tmpdir(), `tut-fail-${ch.n}.png`) }).catch(() => {});
      throw new Error(`chapter ${ch.n}: ${e.message.split('\n')[0]}`);
    }
    if (!rec) {
      await ctx.close();
      console.log(`chapter ${ch.n}: run (not recorded)${errs.length ? ` — page errors: ${errs.join(' | ')}` : ''}`);
      continue;
    }
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
