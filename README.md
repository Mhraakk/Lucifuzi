# آریا آموزش — سامانه آموزش عملیاتی طلافروشی

پلتفرم فارسی RTL برای آموزش کارکنان فروشگاه‌های طلا و جواهر در ایران.

## ایده محصول

یک LMS عمومی نیست. سیستم شایستگی عملیاتی است:

- دانش آزمون ≠ مجوز انجام کار
- مجوز کار مستقل فقط پس از **ارزیابی عملی مدیر**
- مسیر یادگیری بر اساس نقش شغلی
- SOP، سناریو فروش/تقلب، شبیه‌ساز محاسبه قیمت

## اجرای محلی

```bash
npm install
npm run dev
```

باز کردن: [http://localhost:3000](http://localhost:3000)

ورود دمو از `/login` با کاربران نمونه «گالری طلای آریا».

اختیاری: `OPENAI_API_KEY` برای غنی‌سازی دستیار آموزشی (بدون کلید هم پاسخ‌های دانش‌نامه کار می‌کند).

### اسکلت ۲۰ لایه پلتفرم

مستندات: [`docs/PLATFORM_20_LAYERS.md`](docs/PLATFORM_20_LAYERS.md) · کنسول: `/ops`

```bash
npm run test:double      # تست ×۲
npm run gates            # release gates
npm run worker:market    # worker بازار طلا
npm run platform:verify  # tsc + double-test + gates
```

## ساختار

- `app/` — صفحات کارمند و مدیر + `/ops`
- `app/api/platform/` — BFF لایه‌ها
- `platform/` — ۲۰ لایه (spec … flags/storage/ai/…)
- `workers/` — market worker پایدار
- `supabase/migrations/` — Postgres + vector + RLS
- `components/` — پوسته، کارت‌ها، UI
- `lib/` — دامنه آموزش، store، محاسبه، مجوزها

## نقش‌ها

مالک / مدیر شعبه / مربی / کارمند — با داشبورد و ناوبری جدا.

## TestFlight (iOS)

پوستهٔ Capacitor آماده است. روی مک:

```bash
npm install
npm run build:mobile
npm run cap:open
```

سپس در Xcode: Signing → Archive → Upload به App Store Connect → TestFlight.

جزئیات کامل: [`docs/TESTFLIGHT.md`](docs/TESTFLIGHT.md)

## وب / PWA (الان)

```bash
npm run build:pwa
npx serve out
```

روی آیفون: Safari → Share → **Add to Home Screen**.
Manifest و Service Worker برای نصب مثل اپ آماده است.
