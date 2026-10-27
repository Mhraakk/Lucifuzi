# بئاتریس ۲ — آموزش کارکنان گالری طلا

Node 22 · بدون وابستگی npm · `node:http` + `node:sqlite` · SPA ماژولار · موتور WebGL2 اختصاصی.

## اجرا
```bash
npm run dev        # http://localhost:3000 با حساب‌های نمایشی (کد ورود روی همان صفحه)
npm test           # همه آزمون‌های واحد، محتوا و API
npm run check      # بررسی نحو همه ماژول‌ها + اعتبار محتوا
npm run gate       # check + test + eval؛ پیش از هر commit
npm run e2e        # تست سرتاسری مرورگر (Playwright) روی سرور موقت
```

## متغیرهای محیطی
| متغیر | الزام | توضیح |
|---|---|---|
| `BEATRIS_TOKEN_SECRET` | در production الزامی (≥۱۶ کاراکتر) | امضای توکن ورود |
| `BEATRIS_DATA_DIR` | در production الزامی | پوشه‌ی داده روی دیسک ماندگار (`/data`): `beatris-v2.db`، `tenants/`، `media/`، `backups/` |
| `NODE_ENV` | — | `production` یا میزبان (`RENDER`، `RAILWAY_ENVIRONMENT`) یعنی تولید: کد ورود روی صفحه نمی‌آید و حساب‌های نمایشی خاموش‌اند (spec 0054) |
| `BEATRIS_OWNER_PHONE` / `_NAME` / `_EMAIL` | برای راه‌اندازی اول | حساب مالک اصلی (ارائه‌دهنده) |
| `BEATRIS_SUPABASE_URL` / `_KEY` | برای ورود با ایمیل | Supabase Auth کد ورود و کد امضای روز را می‌فرستد (spec 0034) |
| `BEATRIS_OWNER_PIN` | فقط تا ورود راه بیفتد | تا وقتی نه ایمیل و نه پیامک کار می‌کند، فقط مالک با این رمز وارد می‌شود |
| `BEATRIS_SMS_PROVIDER` / `_API_KEY` / `_TEMPLATE` | اختیاری (یا از کنسول) | پنل پیامک: `smsir`، `kavenegar`، `ippanel`، `ghasedak`، `melipayamak`؛ و `_SENDER`، `_PARAM`، `_USERNAME`، `_PASSWORD`، `_BASE_URL` (spec 0022) |
| `BEATRIS_PUBLIC_URL` | توصیه‌شده | نشانی عمومی سرور برای پیوند ایمیل و MCP |
| `BEATRIS_FORGOD_KEY` | اختیاری | قیمت زنده forgod (spec 0049)؛ `BEATRIS_FORGOD_URL`، `BEATRIS_FORGOD_DAILY`، `BEATRIS_MARKET_FEED` |
| `BEATRIS_RATE_LIMIT` | اختیاری | سقف درخواست هر IP در دقیقه (پیش‌فرض ۱۵۰۰) |
| `BEATRIS_DEMO` | فقط توسعه | `true` = شش حساب نمایشی؛ در تولید نادیده گرفته می‌شود |

فهرست کامل متغیرها: `docs/ARCHITECTURE.md` (بخش «متغیرهای سرور»).

## ساختار
- `server/` — HTTP، احراز هویت (ایمیل یا موبایل + کد یک‌بارمصرف، توکن HMAC)، API، SQLite
- `content/` — دوره‌ها، درس‌ها، پرسش‌ها، سناریوها، دستورالعمل‌ها، واژه‌نامه، منابع
- `public/js/calc.mjs` — موتور محاسبه مشترک سرور/مرورگر
- `public/js/gl/` — هندسه رویه‌ای با حجم دقیق مش + رندرر

## استقرار
- **Render** (پروداکشن): `../render.yaml` همین سرویس را توصیف می‌کند؛ build `cd beatris && npm install --omit=dev`، start `cd beatris && npm start`، سلامت `/api/health`.
  - دیسک ماندگار روی `/data` و `BEATRIS_DATA_DIR=/data`؛ بی دیسک، هر دیپلوی همه‌ی داده را پاک می‌کند (`/api/health?deep=1` → `data.persistent`).
  - راهنمای کامل: `docs/PRODUCTION.md`.
- **Railway** (پیشین): `railway.json` با `npm start` و هلث‌چک `/api/health`؛ volume `/data` آن حذف یا جابه‌جا نشود.
