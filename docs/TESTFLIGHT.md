# Beatris — راهنمای TestFlight

این پروژه یک اپ **وب Next.js** است که با **Capacitor** داخل پوستهٔ iOS قرار می‌گیرد تا بتوانید آن را در TestFlight نصب کنید.

> از این محیط ابری نمی‌توان IPA امضاشده ساخت؛ برای آپلود به TestFlight به **مک + Xcode + حساب Apple Developer** نیاز دارید.

## پیش‌نیازها (روی مک شما)

1. [Apple Developer Program](https://developer.apple.com/programs/) (سالانه)
2. Xcode 15+ از App Store
3. Node.js 20+
4. CocoaPods: `sudo gem install cocoapods`

## ساخت سریع

```bash
git clone <repo>
cd Lucifuzi
npm install
npm run build:mobile    # خروجی static در out/ + sync به ios/
npm run cap:open        # باز شدن پروژه در Xcode
```

## در Xcode

1. Target **App** را انتخاب کنید  
2. **Signing & Capabilities** → Team اپل خودتان را بگذارید  
3. Bundle ID: `com.aryagallery.training` (یا شناسهٔ یکتای خودتان؛ اگر عوض کردید در `capacitor.config.json` هم هماهنگ کنید)  
4. منو: **Product → Archive**  
5. در Organizer: **Distribute App → App Store Connect → Upload**

## در App Store Connect

1. [appstoreconnect.apple.com](https://appstoreconnect.apple.com) → My Apps → **+**  
2. نام: Beatris · Bundle ID همان بالا  
3. بعد از پردازش بیلد (۵–۳۰ دقیقه): **TestFlight** → Internal Testing  
4. خودتان و تسترها را اضافه کنید؛ روی آیفون اپ **TestFlight** را باز کنید و نصب کنید

## نکته‌های مهم

| موضوع | توضیح |
|--------|--------|
| دمو آفلاین | داده در `localStorage` است؛ بدون سرور کار می‌کند |
| دستیار | پاسخ از دانش‌نامهٔ کلاینت؛ بدون API |
| وب معمولی | `npm run build && npm start` (بدون Capacitor) |
| آیکون/اسپلش | در Xcode: `ios/App/App/Assets.xcassets` |

## اگر فقط وب می‌خواهید (بدون TestFlight)

روی گوشی Safari می‌توانید سایت را به Home Screen اضافه کنید — این **PWA** است و جای TestFlight را نمی‌گیرد.
