# نسخه ویندوز ۱۱ (۶۴ بیت)

`public/downloads/Beatris-Setup-x64.exe` (از صفحه ورود و راهنما دانلود می‌شود) — نصب‌کننده ۶۴ بیتی NSIS، بدون نیاز به مدیر سیستم:
- برنامه را در پنجره مستقل باز می‌کند (حالت app مرورگر Edge که روی همه ویندوزهای ۱۱ هست؛ نبود Edge → Chrome؛ نبود هر دو → مرورگر پیش‌فرض) با پروفایل جدا در `%LOCALAPPDATA%\Beatris\profile`.
- میان‌بر در منوی استارت و دسکتاپ، آیکن بئاتریس، حذف از «Apps & features».
- به همان سرور زنده وصل است؛ حساب‌ها فقط از کنسول ارائه‌دهنده. `Beatris.cmd` + `beatris.ini` برای تغییر نشانی سرور بدون نصب دوباره.

- **پل کارتخوان** (`pos-bridge.ps1`): همراه نصب می‌شود و با ورود به ویندوز (میان‌بر Startup «Beatris POS») پنهان اجرا می‌شود؛ مبلغ میز معامله را به کارتخوان سامان (PC-POS شبکه) یا برنامه رابط سداد می‌فرستد. spec `docs/specs/0005-pos-bridge.md`.

ساخت: `FFMPEG=… bash desktop/windows/build.sh [https://server]` (نیاز: `makensis` ۳ با stubهای amd64، Node، ffmpeg). آزمون: نصب/حذف بی‌صدا با Wine (`/S`) با `LANG=C.UTF-8`.

امضای دیجیتال ندارد؛ ویندوز بار اول «Windows protected your PC» نشان می‌دهد → More info → Run anyway. برای حذف این پیام گواهی Code Signing لازم است.
