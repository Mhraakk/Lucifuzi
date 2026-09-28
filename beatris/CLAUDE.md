# Beatris — دستور کار برای Claude Code

## پروژه
اپ آموزش کارکنان گالری طلا. Node 22، بدون وابستگی runtime سرور (`node:http` + `node:sqlite`)، SPA فارسی RTL.
- تست واحد: `npm test` (همه باید پاس شوند)
- آزمایشگاه سکه: مدل دامنه در `public/js/coins.mjs` (مشترک سرور/مرورگر، با تست در `tests/coins.test.mjs`)، موتور سه‌بعدی در `public/js/three/coins3d.mjs`، صفحه `/coins`. طرح‌ها «نمونه آموزشی» و سبک‌سازی‌شده‌اند؛ طرح رسمی ضرب را بازتولید نکنید. قطرها تقریبی‌اند؛ وزن و عیار رسمی از `calc.mjs`.
- موتور احتمال (بیز) و مدل پلمپ هم در `coins.mjs` است: `SEAL_TYPES`، سناریوهای `S0`–`S6`، `SEAL_TESTS` (حساسیت/هشدار کاذب)، `SEAL_ANOMALY`، `SEAL_CONTEXTS`، `makePack`، `bayes`، `rankTests`. بسته‌ها با همان نرخ‌های ناهنجاری ساخته می‌شوند تا پسین دقیق باشد؛ تست مونت‌کارلو کالیبراسیون را می‌سنجد. با تغییر ضرایب، تست‌ها و پاسخ‌های عددی درس‌های k9–k11 را دوباره اجرا کنید. ضرایب آموزشی‌اند، نه آمار رسمی.
- مجموعه سکه‌ها مطابق جدول بازار است (تمام قدیم/امامی، نیم قدیم/امامی، ربع قدیم/امامی و ۱۴۰۳، گرمی، پارسیان) با فیلد `years`؛ «جلو» در طرح قدیم = نشان بانک، «پشت» = بارگاه.
- سکه واقعی (عکس): `public/js/coinphoto.mjs` (یافتن دایره، برش، 4K، نقشه برجستگی؛ هرگز جزئیات ساختگی نمی‌سازد و وضوح واقعی منبع را اعلام می‌کند)، مدل سه‌بعدی `photoCoin` در `coins3d.mjs`. مجموعه داخلی از `assets/coin-photos/` با `node scripts/coin-photos.mjs` در `public/coins/photos/` ساخته می‌شود (مجوز CC BY-SA 4.0، اعتبار M.samei روی صفحه و خروجی‌ها). بارگذاری مدیر در `/coins/manage`؛ فایل‌ها در `$BEATRIS_DATA_DIR/media` و سرو از `/media/coins/` (نام فقط با `MEDIA_NAME`).
- آب‌شده و دفتر: `public/js/melt.mjs` (حساب، `PATTERNS`، `makeTrade`/`gradeTrade`)، دوره `content/courses-melt.mjs` (درس‌های h1–h6)، نمودارهای تعاملی درس در `public/js/viz.mjs` (بلوک `{ t: 'viz', kind }`)، صفحه‌های `/ledger` (تمرین‌گر) و `/tools/melt` (ثبت سریع + CSV با تاریخ شمسی). قاعده دفتر: اول معادل ۷۵۰ گرد به ۳ رقم، بعد مبلغ گرد به هزار تومان؛ `MAZANEH_TO_G750 = 4.331802`. پاسخ‌های عددی درس‌ها در `tests/content.test.mjs` با همین توابع وارسی می‌شوند.
- بازار (`/market`، مدیریت داده `/market/data`): تحلیل تکنیکال خالص و تست‌شده در `public/js/ta.mjs` (میانگین‌ها، RSI/MACD/ADX/ATR به روش وایلدر، بولینگر، ایچیموکو، سوپرترند، SAR، رنکو، سه‌خط شکست، پیوت، فیبوناچی، زیگزاگ، قواعد الیوت، آمار، تقویم شمسی، حباب سکه و دلار مستتر، `marketRead`)؛ نمادها و بازار نمونه در `public/js/market.mjs`؛ موتور نمودار کانواس بدون وابستگی در `public/js/charts.mjs`؛ فهرست شاخص‌های مشترک صفحه و درس در `public/js/indicators.mjs`. سرور: `server/market.mjs` (جدول `market_bars`، API `/api/market*`). تا اولین قیمت واقعی، «داده نمونه آموزشی» با برچسب سرو می‌شود. منبع پیش‌فرض تولید `owner` است (خواسته مالک): مظنه نقدی و حواله از کانال عمومی `t.me/s/abshdh` (منبع اپ goldsuite-price مالک)، دلار و سکه‌ها از استریم `chande.net/api/v1/sse/prices` (میانگین خرید و فروش، ریال ÷ ۱۰)، انس از `goldprice.org` و در نبودش `GOLD_24K.price_usd` چنده؛ گرم ۱۸ و ۲۴ از مظنه محاسبه می‌شوند؛ سابقه روزانه یک بار از tgju. در `NODE_ENV=test` پیش‌فرض `off` است. حباب و ارزش جهانی فقط با انس و دلار واقعیِ هم‌روز (حداکثر ۳ روز فاصله) حساب می‌شوند و در نبودشان عدد تخمینی نشان داده نمی‌شود. `json` فقط https عمومی. ورود دستی مدیر هرگز با فید بازنویسی نمی‌شود؛ پرش بیش از ۳۰٪ رد می‌شود. دوره `c-market` (درس‌های mk1–mk7) و بلوک `{ t: 'viz', kind: 'chart' }` روی بازار نمونه با روز ثابت.
- تست سرتاسری مرورگر: `npm run e2e` (Playwright؛ سرور موقت با دیتابیس موقت می‌سازد؛ باید همه بررسی‌ها پاس و خطای مرورگر صفر باشد). فقط چند مرحله: `E2E_ONLY='melted|mobile pages' npm run e2e`. CSP اجازه eval نمی‌دهد؛ در تست کد را به‌صورت تابع به `page.evaluate` بدهید، نه رشته.
- PWA: `public/sw.js` — API هرگز کش نمی‌شود؛ با تغییر فهرست پیش‌کش یا راهبرد، نام `CACHE` را بالا ببرید.
- سه‌بعدی: three.js به‌صورت یک فایل باندل در `public/vendor/three.bundle.js` (ورودی: `scripts/three-entry.js`، ساخت با esbuild: `esbuild scripts/three-entry.js --bundle --format=esm --minify --outfile=public/vendor/three.bundle.js`). کد استودیو در `public/js/three/` و `public/js/pages/studio3d.mjs`؛ موتور قدیمی `public/js/gl/` فقط برای مدل‌های درون درس.
- فونت‌ها محلی در `public/fonts/` (بدون CDN؛ برای دسترس‌پذیری در ایران). روی متن فارسی letter-spacing نگذارید (اتصال حروف می‌شکند).
- اجرای محلی: `npm run dev` → http://localhost:3000 (دمو: 09120000001، رمز 1234)

## استقرار (Railway — سرور دائمی، نه serverless)
- project `goldsuite`: `5fe1b94c-fe29-469e-83d0-4bc600a92d69`، service `beatris`: `f9c9c93a-747c-42df-96c6-64ad1c69e08d`
- سرویس به ریپوی `Mhraakk/Lucifuzi` با Root Directory `/beatris` وصل است؛ هر push روی شاخه متصل خودکار دیپلوی می‌شود.
- Volume دائمی روی `/data` (دیتابیس `beatris-v2.db`)؛ هرگز حذف نشود.
- متغیرها: `BEATRIS_DATA_DIR=/data`، `BEATRIS_TOKEN_SECRET`، `NODE_ENV=production`، `PORT=8080`.

## قواعد
- UI کاملاً فارسی و RTL؛ ارقام فارسی در نمایش.
- مالیات ۱۴۰۵ = ۱۰٪ فقط روی اجرت + سود؛ اصل طلا معاف.
- وابستگی runtime اضافه نکن مگر ضروری.
