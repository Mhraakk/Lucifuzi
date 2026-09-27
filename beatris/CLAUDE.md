# Beatris — دستور کار برای Claude Code

## پروژه
اپ آموزش کارکنان گالری طلا. Node 22، بدون وابستگی runtime سرور (`node:http` + `node:sqlite`)، SPA فارسی RTL.
- تست: `npm test` (باید ۱۹/۱۹ پاس شود)
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
