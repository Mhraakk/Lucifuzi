# راه‌اندازی و نگهداری در پروداکشن

## وضعیت
- نشانی: https://beatris-6u77.onrender.com — Render، service `beatris` (`srv-dbd36u7avr4c7399qkf0`، فرانکفورت)، شاخه `claude/vercel-deployment-pj3uux`. داده روی دیسک `/data` (حذف یا جابه‌جا نشود). تا دیسک وصل نشده، `BEATRIS_DATA_DIR` موقت است و هر دیپلوی داده را پاک می‌کند.
- پیشین: https://beatris-production-68ac.up.railway.app — Railway، ساخت `600938a` با داده‌ی خودش روی volume `/data` (حذف یا جابه‌جا نشود).
- متغیرها: `BEATRIS_DATA_DIR=/data`، `BEATRIS_TOKEN_SECRET`، `NODE_ENV=production`، `BEATRIS_OWNER_NAME`/`_PHONE`/`_EMAIL` (حساب مالک)، `BEATRIS_SUPABASE_URL`/`_KEY` (ورود و کد امضای روز با ایمیل)، `BEATRIS_PUBLIC_URL`. `BEATRIS_OWNER_PIN` فقط تا وقتی نه ایمیل و نه پیامک کار می‌کند راه ورود مالک است. پنل پیامک (اختیاری): کنسول ← «پیامک ورود» یا `BEATRIS_SMS_PROVIDER`/`_API_KEY`/`_TEMPLATE` (و `_SENDER`، `_PARAM`، `_USERNAME`، `_BASE_URL`). `BEATRIS_DEMO` در تولید نادیده گرفته می‌شود.
- تولید یعنی `NODE_ENV=production` یا میزبان (`RENDER`، `RAILWAY_ENVIRONMENT`) بی `NODE_ENV` توسعه/آزمون (spec 0054): کد ورود هرگز روی صفحه نمی‌آید.
- سرآیندهای امنیتی: CSP بدون eval، `X-Frame-Options: DENY`، `nosniff`، `Referrer-Policy`، `Permissions-Policy` و در تولید `Strict-Transport-Security`. سقف درخواست هر IP: ۱۵۰۰ در دقیقه (`BEATRIS_RATE_LIMIT`).

## کارهای مالک در داشبورد Render (یک بار)
1. **Disks:** دیسک ماندگار با Mount Path `/data`، و متغیر `BEATRIS_DATA_DIR=/data`. بی آن هر دیپلوی همه‌ی فروشگاه‌ها و پشتیبان‌ها را پاک می‌کند؛ سرور هنگام شروع هشدار می‌دهد و `/api/health?deep=1` → `data.persistent: false`.
2. **Environment:** `BEATRIS_OWNER_PHONE`، `BEATRIS_OWNER_NAME`، `BEATRIS_OWNER_EMAIL`، و `BEATRIS_SUPABASE_URL`/`_KEY`. مقدارها فقط در Render، نه در مخزن یا گفتگو.
3. **Settings ← Health Check Path:** `/api/health`.
4. کلیدی که جایی دیده شده (مثلاً `BEATRIS_FORGOD_KEY`) را نزد صادرکننده عوض کنید و مقدار تازه را در Render بگذارید.

## شروع کار (فروش به یک مغازه)
1. در `/login` ایمیل مالک (`BEATRIS_OWNER_EMAIL`) را بزنید و کدی را که Supabase می‌فرستد وارد کنید ← `/vendor`. تا ایمیل یا پیامک راه نیفتاده، `BEATRIS_OWNER_PIN` به جای کد پذیرفته می‌شود.
2. «پیامک ورود» (اختیاری): پنل پیامک را وصل کنید و «پیامک آزمایشی» بفرستید (از سرور بیرون ایران، در آزمایش ۱۹ مهر ۱۴۰۵ فقط `api.sms.ir` پاسخ داد؛ بقیه پنل‌ها اتصال را بستند — یا `BEATRIS_SMS_BASE_URL` را روی یک واسط داخل ایران بگذارید).
3. «فروشگاه تازه»: نام، نسخه، نام، ایمیل و موبایل مدیر، پایان اشتراک؛ نشانی ورود را برای مدیر بفرستید. نام کاربری و رمزی صادر نمی‌شود.
4. مدیر هر فروشگاه همکارانش را در «تیم» با نام، ایمیل و موبایل اضافه می‌کند (سقف کاربران با ارائه‌دهنده؛ ۰ = نامحدود). با «ثبت‌نام آزاد»، ایمیل یا موبایل تازه پس از کد ورود فروشگاه خودش را می‌سازد.
5. مدیر فروشگاه اولین بار به «راه‌اندازی» می‌رود و وضعیت واقعی امروز را ثبت می‌کند.
6. نصب: وب‌اپ (دکمه «نصب وب‌اپ» در ورود/راهنما) یا نصب‌کننده ۶۴ بیتی `/downloads/Beatris-Setup-Win11-x64.exe` برای ویندوز ۱۱ و `/downloads/Beatris-Setup-Win10-x64.exe` برای ویندوز ۱۰ (`Beatris-Setup-x64.exe` همان نسخه ۱۱ با نام قبلی).

## پایش
- `GET /api/health?deep=1`: دیتابیس، فید قیمت، صف کارها، آخرین پشتیبان، ایمیل، و پوشه‌ی داده (`data.mount`، `data.persistent`). `/ops` (فقط ارائه‌دهنده): متریک‌ها، پشتیبان دستی، پرچم‌ها.
- هر فروشگاه: «کنترل» ← نبض، استثناها، بستن خودکار شبانه (فقط مغایرت‌ها).

## پشتیبان و بازیابی
- خودکار روزانه در `/data/backups/<stamp>/` (۱۴ نسخه آخر، با `integrity_check`): همه‌ی فروشگاه‌ها، تعلیق‌شده و منقضی هم، و عکس‌های بارگذاری‌شده در `media/`. پشتیبان روی همان دیسک است؛ نسخه‌ای بیرون از سرور را جداگانه نگه دارید.
- بازیابی: سرویس را متوقف کنید، `main.db` را روی `beatris-v2.db`، `t_….db` را روی `tenants/t_….db` و `media/` را روی `/data/media/` کپی کنید، دوباره راه بیندازید، `/api/health?deep=1` و «وارسی دفتر» (بازپخش) را ببینید.

## به‌روزرسانی
1. `npm run gate` (check + همه‌ی آزمون‌های واحد + eval، شامل fuzz دفاتر) و `npm run e2e` (همه‌ی بررسی‌های مرورگر سبز، خطای مرورگر صفر).
2. push روی شاخه = دیپلوی، به شرط آنکه GitHub در Render وصل باشد (Account Settings ← Git Deployment Credentials)؛ وگرنه Manual Deploy. پس از آن `build` در `/api/health` = commit، و `/api/health?deep=1`.
3. نصب‌کننده ویندوز فقط وقتی نشانی سرور عوض شود دوباره ساخته می‌شود (`desktop/windows/build.sh`).

## محدودیت‌های شناخته‌شده
- نصب‌کننده ویندوز امضای دیجیتال ندارد (هشدار SmartScreen بار اول).
- قیمت زنده به فید بیرونی وابسته است؛ اگر قطع شود سلامت `feed: stale` می‌دهد و صفحه‌ها صریح «داده قدیمی/نمونه» نشان می‌دهند.
