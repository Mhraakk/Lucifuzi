# Beatris — دستور کار Claude Code

## الزام‌آور
- **Spec Coach** (`docs/spec-coach.md`): هر کار غیرساده → اول spec در `docs/specs/` (What، Acceptance، Constraints)، بعد تکه‌های کوچک آزمون‌پذیر، بازبینی، و `npm run gate` پیش از «تمام شد».
- جزئیات هر ماژول: `docs/ARCHITECTURE.md` — پیش از تغییر هر بخش، بند همان بخش را بخوانید.

## پشته
Node 22، `node:http` + `node:sqlite`، **بدون وابستگی runtime**؛ SPA فارسی RTL بدون فریم‌ورک (`public/js`، قالب `html```). CSP بدون eval و handler درون‌خطی.

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

## استقرار
پروداکشن: Render، https://beatris-6u77.onrender.com، service `beatris` (`srv-dbd36u7avr4c7399qkf0`)، شاخه `claude/vercel-deployment-pj3uux`؛ push فقط وقتی دیپلوی می‌شود که GitHub در Render وصل باشد (Git Deployment Credentials)، وگرنه Manual Deploy؛ build `cd beatris && npm install --omit=dev`، start `cd beatris && npm start` (`render.yaml` همین سرویس را توصیف می‌کند). متغیرها: `BEATRIS_DATA_DIR` (دیسک `/data`)، `BEATRIS_TOKEN_SECRET`، `NODE_ENV=production`، `BEATRIS_SUPABASE_URL`/`_KEY`، `BEATRIS_OWNER_PHONE`/`_NAME`/`_EMAIL`؛ پیامک ورود از کنسول یا `BEATRIS_SMS_PROVIDER`/`_API_KEY`/`_TEMPLATE` (`_SENDER`، `_PARAM`، `_USERNAME`، `_BASE_URL`). ردپای هوش مصنوعی (اختیاری، spec 0048): `LANGFUSE_PUBLIC_KEY`/`_SECRET_KEY`/`_BASE_URL`، `TRACELOOP_API_KEY`، `AGENTOPS_API_KEY`، `BEATRIS_OTEL_ENDPOINT`/`_HEADERS`، `BEATRIS_OTEL_CONTENT=1`. پس از دیپلوی: `build` در `/api/health` = commit، و `/api/health?deep=1`. Railway (Root `/beatris`، volume `/data`) پیشین است: ساخت `600938a` با داده‌ی خودش.
