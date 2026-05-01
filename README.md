# دستیار حقوقی هوشمند

## راه‌اندازی محلی
```bash
npm install
cp .env.example .env.local
# OPENAI_API_KEY را در .env.local وارد کنید
npm run dev
```

## دیپلوی روی Vercel
1. پروژه را در GitHub بارگذاری کنید
2. در Vercel وارد شوید و پروژه را import کنید
3. در تنظیمات Environment Variables اضافه کنید:
   - `OPENAI_API_KEY` = کلید API خود از platform.openai.com
4. Deploy کنید
