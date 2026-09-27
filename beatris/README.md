# بئاتریس ۲ — آموزش کارکنان گالری طلا

Node 22 · بدون وابستگی npm · `node:http` + `node:sqlite` · SPA ماژولار · موتور WebGL2 اختصاصی.

## اجرا
```bash
npm run dev        # http://localhost:3000 با حساب‌های نمایشی (رمز 1234)
npm test           # 17 تست محاسبه، محتوا و API
npm run check      # بررسی نحو همه ماژول‌ها + اعتبار محتوا
```

## متغیرهای محیطی
| متغیر | الزام | توضیح |
|---|---|---|
| `BEATRIS_TOKEN_SECRET` | در production الزامی (≥۱۶ کاراکتر) | امضای توکن ورود |
| `BEATRIS_DATA_DIR` | توصیه‌شده | مسیر Volume؛ دیتابیس `beatris-v2.db` |
| `BEATRIS_OWNER_PHONE` / `BEATRIS_OWNER_PIN` / `BEATRIS_OWNER_NAME` | برای راه‌اندازی اول | ساخت حساب مالک |
| `BEATRIS_DEMO` | اختیاری | `true` = شش حساب نمایشی |

## ساختار
- `server/` — HTTP، احراز هویت (موبایل + رمز عددی scrypt، توکن HMAC)، API، SQLite
- `content/` — ۸ دوره، ۳۱ درس، ۹۳ پرسش، ۸ سناریو، ۷ دستورالعمل، واژه‌نامه، منابع
- `public/js/calc.mjs` — موتور محاسبه مشترک سرور/مرورگر
- `public/js/gl/` — هندسه رویه‌ای با حجم دقیق مش + رندرر

## Railway
- `railway.json`: شروع با `npm start`، هلث‌چک `/api/health`.
- Volume دائمی روی `/data` و `BEATRIS_DATA_DIR=/data`.
- متغیرها: `BEATRIS_TOKEN_SECRET`، `NODE_ENV=production`، `PORT=8080`، و برای مالک `BEATRIS_OWNER_PHONE` / `BEATRIS_OWNER_PIN` (`BEATRIS_DEMO=true` فقط برای دمو).
