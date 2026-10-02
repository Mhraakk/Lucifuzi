# Beatris — دستور کار Claude Code

## الزام‌آور
- **Spec Coach** (`docs/spec-coach.md`): هر کار غیرساده → اول spec در `docs/specs/` (What، Acceptance، Constraints)، بعد تکه‌های کوچک آزمون‌پذیر، بازبینی، و `npm run gate` پیش از «تمام شد».
- جزئیات هر ماژول: `docs/ARCHITECTURE.md` — پیش از تغییر هر بخش، بند همان بخش را بخوانید.

## پشته
Node 22، `node:http` + `node:sqlite`، **بدون وابستگی runtime**؛ SPA فارسی RTL بدون فریم‌ورک (`public/js`، قالب `html```). CSP بدون eval و handler درون‌خطی.

## فرمان‌ها
- `npm test` واحد · `npm run check` ماژول‌ها و محتوا · `npm run gate` check + test + eval (لازم پیش از commit)
- `npm run e2e` مرورگر (پیش از دیپلوی؛ `E2E_ONLY='…'` برای چند مرحله)
- `npm run dev` → http://localhost:3000 (دمو 09120000001 / 1234)

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
- هر فروشگاه دیتابیس جدا (`tenants/<id>.db`)؛ حساب‌ها فقط از `/vendor`.

## استقرار
Railway، service `beatris`، Root `/beatris`، push روی شاخه متصل = دیپلوی. متغیرها: `BEATRIS_DATA_DIR=/data`، `BEATRIS_TOKEN_SECRET`، `NODE_ENV=production`، `PORT=8080`. پس از دیپلوی: هش فایل زنده و `/api/health?deep=1`.
