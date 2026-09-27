# بئاتریس ۳ — آموزش کارکنان گالری طلا

Node 22 · Vercel Functions · Neon Postgres · SPA ماژولار فارسی RTL · موتور WebGL2 اختصاصی.

## اجرا (محلی)
```bash
npm install
npm run dev        # http://localhost:3000 با حساب‌های نمایشی (رمز 1234)
npm test           # 17 تست محاسبه، محتوا و API (روی PGlite درون‌حافظه)
npm run check      # بررسی نحو همه ماژول‌ها + اعتبار محتوا
```
بدون `DATABASE_URL`، دیتابیس محلی PGlite در پوشه `data/` ساخته می‌شود.

## متغیرهای محیطی
| متغیر | الزام | توضیح |
|---|---|---|
| `DATABASE_URL` | در Vercel الزامی | اتصال Neon (با اتصال Neon از Marketplace خودکار ست می‌شود؛ `POSTGRES_URL` هم پذیرفته است) |
| `BEATRIS_TOKEN_SECRET` | در production الزامی (≥۱۶ کاراکتر) | امضای توکن ورود |
| `BEATRIS_OWNER_PHONE` / `BEATRIS_OWNER_PIN` / `BEATRIS_OWNER_NAME` | برای راه‌اندازی اول | ساخت حساب مالک |
| `BEATRIS_DEMO` | اختیاری | `true` = شش حساب نمایشی |

## ساختار
- `api/index.mjs` — Vercel Function؛ همه `/api/*` به آن بازنویسی می‌شود
- `server/` — API، احراز هویت (موبایل + رمز عددی scrypt، توکن HMAC)، لایه Postgres
- `content/` — ۸ دوره، ۳۱ درس، ۹۳ پرسش، ۸ سناریو، ۷ دستورالعمل، واژه‌نامه، منابع
- `public/` — SPA (به‌صورت فایل ایستا از CDN ورسل سرو می‌شود)
- `vercel.json` — rewrite ها، هدرهای امنیتی

## Vercel
- Root Directory پروژه: `beatris`
- Storage → Neon Postgres را به پروژه وصل کنید، سپس Redeploy.
- جدول‌ها در اولین درخواست خودکار ساخته می‌شوند.
