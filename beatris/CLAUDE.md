# Beatris — دستور کار برای Claude Code

## پروژه
اپ آموزش کارکنان گالری طلا. Node 22، استقرار روی Vercel (Function در `api/`، فایل‌های ایستا در `public/`)، دیتابیس Neon Postgres (`@neondatabase/serverless`)؛ محلی و تست روی PGlite.
- تست: `npm test` (باید ۱۷/۱۷ پاس شود)
- اجرای محلی: `npm run dev` → http://localhost:3000 (دمو: 09120000001، رمز 1234)
- SQL با placeholder `?` نوشته می‌شود؛ `server/db.mjs` آن را به `$n` تبدیل می‌کند. aliasهای camelCase باید در `"..."` باشند.

## قواعد
- UI کاملاً فارسی و RTL؛ ارقام فارسی در نمایش.
- مالیات ۱۴۰۵ = ۱۰٪ فقط روی اجرت + سود؛ اصل طلا معاف.
- وابستگی runtime اضافه نکن مگر ضروری.
