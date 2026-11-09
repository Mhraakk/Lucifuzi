# Beatris — دستور کار Claude Code

## الزام‌آور
- **Spec Coach** (`docs/spec-coach.md`): هر کار غیرساده → اول spec در `docs/specs/` (What، Acceptance، Constraints)، بعد تکه‌های کوچک آزمون‌پذیر، بازبینی، و `npm run gate` پیش از «تمام شد».
- جزئیات هر ماژول: `docs/ARCHITECTURE.md` — پیش از تغییر هر بخش، بند همان بخش را بخوانید.

## پشته
Node 22، `node:http` + `node:sqlite`، **بدون وابستگی runtime**؛ SPA فارسی RTL بدون فریم‌ورک (`public/js`، قالب `html```)، جز `/owner` (spec 0053): React + glisse + htm در یک بسته‌ی `public/vendor/glisse`. CSP بدون eval و handler درون‌خطی.

## فرمان‌ها
- `npm test` واحد · `npm run check` ماژول‌ها و محتوا · `npm run gate` check + test + eval (لازم پیش از commit)
- `npm run e2e` مرورگر (پیش از دیپلوی؛ `E2E_ONLY='…'` برای چند مرحله)
- `npm run dev` → http://localhost:3000 (دمو: owner@demo.beatris.ir؛ کد ورود روی همان صفحه نشان داده می‌شود)

## ممنوع (do not)
- منطق حسابداری (`public/js/books.mjs`، `trade.mjs`، `server/books.mjs`) را بدون spec و تست تغییر نده؛ سند قطعی حذف نمی‌شود.
- ظاهر یکدست (spec 0006) برای هر دو پوسته در لایه آخر `app.css`؛ رنگ فقط با توکن؛ صفحه حسابداری با `booksNav`.
- وابستگی runtime، CDN، کلید یا راز در مخزن؛ شناسه مدل در کد.
- letter-spacing روی متن فارسی.
- volume `/data` روی Railway را حذف یا جابه‌جا نکن.

## قواعد دامنه
- UI فارسی RTL، ارقام فارسی. مبالغ ذخیره‌شده ریال صحیح.
- مالیات ۱۴۰۵ = ۱۰٪ فقط روی اجرت + سود (+ حق‌العمل)؛ اصل طلا، سنگ و سکه معاف.
- معادل ۷۵۰ گرد به ۳ رقم، سپس مبلغ؛ `MAZANEH_TO_G750 = 4.331802`.
- هر فروشگاه دیتابیس جدا (`tenants/<id>.db`)؛ حساب = نام + موبایل + ایمیل؛ ورود فقط با کد یا پیوند ایمیل از Supabase (spec 0034)؛ نام کاربری و رمز صادر نمی‌شود.
- کارتخوان: «پرداخت با کارتخوان» مبلغ باقی‌مانده را دقیق می‌فرستد؛ گوشی از راه پیشخوان (spec 0005، 0035).
- دیده‌بان `/owner` (spec 0053): فقط حسابی که `BEATRIS_OWNER_PHONE`/`_EMAIL` نام می‌برد؛ از فروشگاه‌ها فقط شمار و جمع، هرگز سند یا مشتری.

## استقرار
پروداکشن (spec 0057): Fly.io، https://beatris.fly.dev، app `beatris` در فرانکفورت (`fra`)، شاخه `claude/vercel-deployment-pj3uux`. job ‏`fly` در `.github/workflows/beatris.yml` پس از gate و e2e سبز دیپلوی می‌کند (secret مخزن `FLY_API_TOKEN`؛ بی آن job رد می‌شود؛ دستی: workflow_dispatch). image از `beatris/Dockerfile`، پیکربندی غیرمحرمانه در `beatris/fly.toml`؛ داده روی volume ‏`beatris_data` در `/data` (حذف یا جابه‌جا نشود). secretها فقط در Fly: `BEATRIS_TOKEN_SECRET` (job بار اول می‌سازد)، `BEATRIS_SUPABASE_URL`/`_KEY`، `BEATRIS_FORGOD_KEY`، `BEATRIS_OWNER_PHONE`/`_NAME`/`_EMAIL`؛ بقیه: ARCHITECTURE «متغیرهای سرور». پس از دیپلوی: `build` در `/api/health` = commit، و `/api/health?deep=1` → `data.persistent: true`. پیشین: Render (`srv-dbd36u7avr4c7399qkf0`، https://beatris-6u77.onrender.com، دیسک موقت؛ این نشانی در QR تیزرها و نصب‌کننده‌ی ویندوز هست، پس Render بی تصمیم مالک خاموش نشود) و Railway (Root `/beatris`، volume `/data`، ساخت `600938a`).
