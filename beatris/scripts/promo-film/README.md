# تیزر و اینفوگرافیک بئاتریس

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
