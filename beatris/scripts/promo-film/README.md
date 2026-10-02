# تیزر و اینفوگرافیک بئاتریس

## تیزر «منشور» (۴۰ ثانیه، 1080p60) — `public/media/promo/beatris-teaser.mp4`
- `prism.html`: پرتو نور به نگین می‌خورد و طیف می‌شود. طیف خم می‌شود و نمودار قیمت می‌شود. بعد موتور ترکیبی الیوت + فیبوناچی روی همان نمودار کار می‌کند: شمارش (I) تا (V)، زیرموج‌ها، فیبوناچی از حرکتِ شمرده‌شده، مارپیچ طلایی و دو سناریو با احتمال و ابطال. نمودار به پنجره واقعی تحلیل الیوت در اپ پرواز می‌کند و نورش در گوی فکر جمع می‌شود. بعد میز معامله، مربی حسابداری و استودیو می‌آیند، با پاک‌کن طیفی بین صحنه‌ها. طیف پوسته‌ها را رنگ می‌کند و کارت پایانی نمایش داده می‌شود.
- اعداد نمودار را موتور واقعی `public/js/elliott.mjs` می‌سازد، روی همان سری نمونه‌ای که در آزمون‌ها هست. گوی‌ها هم از `public/js/orb.mjs` می‌آیند. پانویس فیلم می‌گوید داده نمونه است.
- ساخت فیلم:
  ```
  node scripts/promo-film/render.mjs prism 60                  # فریم‌ها در frames-prism (سرور محلی، چون ماژول‌ها از file:// بار نمی‌شوند)
  python3 scripts/promo-film/sfx.py sfx.wav                     # افکت‌های صوتی ساخته‌شده، بدون نمونه و بی‌مجوز لازم
  ffmpeg -framerate 60 -i scripts/promo-film/frames-prism/%05d.jpg -ss 0 -t 40 -i nocturne.mp3 -i sfx.wav \
    -filter_complex "[1:a]volume=-9dB,afade=t=in:st=0:d=1,afade=t=out:st=36.5:d=3.5,aresample=48000[m];[2:a]volume=-2dB[s];[m][s]amix=inputs=2:normalize=0,highpass=f=35,equalizer=f=3200:t=q:w=1.2:g=1.5,acompressor=threshold=-20dB:ratio=3:attack=15:release=200:makeup=2,loudnorm=I=-14:TP=-1.5:LRA=8,alimiter=limit=0.8:level=false[a]" \
    -map 0:v -map "[a]" -c:v libx264 -preset slow -crf 17 -pix_fmt yuv420p -c:a aac -b:a 224k -ar 48000 -movflags +faststart -t 40 public/media/promo/beatris-teaser.mp4
  ```
- صدا: زیر تصویر ناکتورن است. روی آن صدای عبور نرم سر برش‌ها، زنگ شیشه‌ای وقتی برچسب موج یا سطح می‌نشیند، و یک ضربه گرم وقتی نور وارد نگین می‌شود. مسترینگ با زنجیره ffmpeg انجام شده است: های‌پس، کمپرسور ملایم، loudnorm و لیمیتر. trackgleam ابزاری مرورگری است و این‌جا استفاده نشده است.
- اندازه‌گیری: بلندی ‎−14.8 LUFS، پیک واقعی ‎−1.7 dBFS.
- بازبینی را خود سازنده و با برگه تماس انجام داده است؛ منتقد مستقل این فیلم را نسنجیده است.
- `card.html`: کارت آغاز و پایان فصل‌های راهنما در همین زبان تصویری. سازنده‌اش `scripts/tutorial-film.mjs` است.

## تیزر قبلی (۳۲ ثانیه)

- `teaser.html`: فیلم ۳۲ ثانیه‌ای موشن‌گرافیک. هر فریم تابع خالص زمان است (`seek(t)`). تصویرها در `shots/` از نسخه نمایشی خود اپ با داده نمونه گرفته شده‌اند. روی فیلم هم همین نوشته شده است.
- `infographic.html`: اینفوگرافیک. اعدادش از کد اپ شمرده شده است.
- ساخت فیلم:
  ```
  node scripts/promo-film/render.mjs teaser 60
  ffmpeg -framerate 60 -i scripts/promo-film/frames/%05d.jpg -ss 0 -t 32 -i nocturne.mp3 \
    -filter_complex "[1:a]afade=t=in:st=0:d=0.6,afade=t=out:st=29.3:d=2.7,loudnorm=I=-16:TP=-1.5:LRA=11[a]" \
    -map 0:v -map "[a]" -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -c:a aac -b:a 192k -ar 48000 \
    -movflags +faststart -shortest public/media/promo/beatris-teaser.mp4
  ```
- موسیقی: شوپن، ناکتورن سل ماژور اپوس ۳۷ شماره ۲ با اجرای اولگا گورویچ (Musopen، CC0). منبع در `public/media/tutorial/MUSIC.txt` آمده است.
- اندازه‌گیری نسخه فعلی: بلندی ‎−16.4 LUFS، پیک ‎−2.2 dBFS، فریم ثابت ۰.
- بازبینی را خود سازنده انجام داده است؛ منتقد مستقل این فیلم را نسنجیده است.
