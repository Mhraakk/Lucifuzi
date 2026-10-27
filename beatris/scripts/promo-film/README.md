# تیزر و اینفوگرافیک بئاتریس

## «تابلوی زنده» (۳۵ ثانیه، 1080p60، آبان ۱۴۰۵) — `public/media/promo/beatris-live-market.{mp4,webm,jpg}` (spec 0051)
- قابلیت تازه‌ی قیمت و بازار (spec 0049) و ورود معامله به زبان بازار (spec 0020)، در ۱۴ نما روی میزان‌های موسیقی:
  - تابلوی LED صرافی؛
  - صفحه‌ی واقعی بازار؛
  - یک درخواست که چهار بخش بازار را می‌آورد؛
  - بررسی هر به‌روزرسانی (گرم ۱۸ در برابر اونس × دلار)؛
  - دیوار ۲۵ نرخ ارز و یورو که روی میز معامله می‌نشیند؛
  - برنامه‌ی ۵۰ درخواست در روز؛
  - تحلیل روی همین قیمت؛
  - جمله‌ای که تایپ می‌شود و با مظنه‌ی تابلو سند می‌شود.
- **هر عدد راست است:**
  - قیمت‌ها پاسخ واقعی forgod در ۴ آبان ۱۴۰۵، ساعت ۱۶:۴۸ است. این پاسخ بیرون از مخزن نگه داشته می‌شود و کلیدی در آن نیست.
  - `stories/live-data.mjs` آن را با کد خود اپ حساب می‌کند و در `live-data.json` می‌نویسد.
  - صفحه‌ها از یک سرور نمایشی تازه گرفته می‌شوند (`stories/live-shots.mjs`). شبکه‌ی این سرور `stories/forgod-replay.mjs` است: پاسخ ذخیره‌شده را برمی‌گرداند، کلیدش ساختگی است و هیچ درخواستی به forgod نمی‌رود.
- **موسیقی** (آبان ۱۴۰۵، به خواست مالک): موتسارت، سمفونی شماره‌ی ۴۰ در سل مینور (K. 550)، موومان چهارم (Allegro assai).
  - ضبط آن از Musopen است و پروانه‌ی CC0 دارد (`MusopenKickstarterRecordings` در archive.org). خود ضبط در مخزن نیست.
  - این موومان از میان چهار ضبط CC0 موتسارت با سنجش انتخاب شد. ضربش (۱۳۱٫۷ نیم‌نت در دقیقه) به شبکه‌ی فیلم نزدیک‌تر بود و پایه‌اش از همه یکنواخت‌تر.
  - هر جمله‌ی دومیزانی آن، موشک پیانو و پاسخ فورته به نوبت، یک میزان فیلم است.
  - `stories/warp-music.py` هر جمله را با کش زمانی rubberband (۰٫۹۹ تا ۱٫۰۶) دقیقاً به یک میزان فیلم (۱۲۸ ضرب) می‌رساند، طبق نقشه‌ی `live-music.json`.
  - کودای خود موومان روی کارت پایانی می‌آید و آکورد پایانی روی میزان ۱۸، با برق تاج.
  - سطح هر افکت جدا جدا حل شده است، چون پیانو و فورته‌ی ارکستر ۲۰ dB فاصله دارند. صداهای زیروبم‌دار به سل مینور کوک شده‌اند (`p` در هر نشانه).
  - نسخه‌ی پیشین فیلم «Rising Forest» (Mixkit) را داشت.
- **`mix.mjs`:**
  - برای `MUSIC` بی `end` یک تکه‌ی پیوسته می‌برد؛
  - `MUSIC_FROM` و `MUSIC_TEMPO` آهنگ دیگری را زیر همان تصویر می‌گذارند؛
  - `p` در هر نشانه صدای آن را چند نیم‌پرده جابه‌جا می‌کند (rubberband) تا با کلید موسیقی بخواند؛
  - `--music-only` نسخه‌ی بی‌افکت را می‌سازد؛
  - شروع هر افکت اکنون جایی است که ضربه‌اش آغاز می‌شود (۲۰ dB زیر اوج خودش)، نه پایان سکوت. پیش از این، pop کتابخانه ۹۰ میلی‌ثانیه دیر می‌نشست.
- ساخت:
  ```
  FORGOD_ANSWER=…/all.json node scripts/promo-film/stories/live-shots.mjs   # صفحه‌ها و live-app.json
  FORGOD_ANSWER=…/all.json node scripts/promo-film/stories/live-data.mjs    # live-data.json
  node scripts/promo-film/stories/render.mjs live                            # و --sheet یا --stills=…
  python3 -I scripts/promo-film/stories/warp-music.py …/K550-IV-Allegro-assai.mp3 scripts/promo-film/stories/live-music.json mozart.wav
  MUSIC=mozart.wav SFX=…/sfx node scripts/promo-film/stories/mix.mjs scripts/promo-film/stories/out/live-picture.mp4 out.mp4
  ffmpeg -i out.mp4 -map 0 -c:v libx264 -preset slow -crf 20 -profile:v high -pix_fmt yuv420p -c:a copy -movflags +faststart public/media/promo/beatris-live-market.mp4
  ffmpeg -i out.mp4 -c:v libvpx-vp9 -crf 32 -b:v 0 -row-mt 1 -deadline good -cpu-used 3 -c:a libopus -b:a 128k public/media/promo/beatris-live-market.webm
  ```
- **سنجه‌ها:**
  - ۱۳٫۱ مگابایت، 1080p60، ۳۵٫۰۰ ثانیه؛
  - −۱۶٫۳ LUFS با اوج واقعی −۱٫۷ dBTP؛
  - هیچ فریم سیاه یا ایستایی ۰٫۵ ثانیه‌ای ندارد؛
  - کنتراست خط‌ها ۴٫۶:۱ یا بیشتر است؛
  - حمله‌ی هر جمله‌ی فورته‌ی موسیقی تا ۱۷ میلی‌ثانیه (یک فریم) با خط میزانش هم‌زمان است؛
  - هر ضربه‌ی افکت تا ۱۵ میلی‌ثانیه با رویداد تصویرش هم‌زمان است.

  جزئیات در spec 0051 است.
- بازبینی را خود سازنده با برگه‌های فریم و سنجه‌ها انجام داده است. منتقد مستقل فیلم را نسنجیده و کسی آن را گوش نداده است.

## سه داستان: «یک روز پشت پیشخوان»، «ظرفیت»، «اتاق کنترل» (هر کدام ۳۴ ثانیه، 1080p60، آبان ۱۴۰۵) — `public/media/promo/beatris-{counter,capacity,control}.{mp4,jpg}` (spec 0047)
- سه فیلم با سه طراحی، روی یک موسیقی («Autofahren»، همان موسیقی تیزر پیشین). الگو فیلم «Payroll» شرکت Mercury بود، فقط در دستور زبان حرکت: محصول واقعی، خط‌های کوتاهی که محو می‌آیند و می‌روند، دوربینی که روی کلیک جلو می‌رود، جدولی که پر می‌شود و عددی که می‌شمارد. رابط، رنگ، قلم و واژه‌هایش برداشته نشده است.
  1. **یک روز پشت پیشخوان** (پوسته‌ی روز، صفحه‌نمایش زنده): غبار طلا تاج ورودی را می‌سازد؛ بعد یک روز مغازه روی صفحه‌های خود اپ: قیمت‌های نمونه‌ی بازار، میز فروش و کلیک مقایسه، جمع سطر سبد (مالیات فقط روی اجرت و سود)، «اگر…؟»، فروش ثبت‌شده و صفحه‌ی مشتری، یک کلیک تا کارتخوان، رسید، روزنگار، نبض، هشدار داشبورد و بستن روز.
  2. **ظرفیت** (شبکه‌ی سوئیسی): هفت عدد راست با منبع هر کدام در پانویس: ۹۰ رویداد، ۱۴ ماشین‌حساب، ۲۰۰٬۰۰۰ ورودی و صفر اختلاف، ۲۰۱ سال تقویم، ۱۰۰ دور کار، ۴ میز و یک دیتابیس برای هر فروشگاه، ۴۸۶ آزمون.
  3. **اتاق کنترل** (صحنه‌ی تیره، پوسته‌ی آرام): عددی که می‌گوید از کجا آمده («؟» نبض طلا)، نمای کلی، استثناها با احتمال، ماشین زمان، پیش‌بینی ده روزه با چک‌های سررسید، جست‌وجوی Ctrl+K و دیوار دوازده ابزار.
- هر فیلم یک صفحه است که هر فریمش فقط تابع زمان است (`window.seek(t)`)؛ ابزارهای مشترک در `stories/kit.mjs` هستند و کتابخانه‌ی انیمیشنی در کار نیست. هر فیلم هنگام بار شدن زمان خواندن خط‌هایش را می‌سنجد (حرف‌ها ÷ ۱۵ + ۱٫۵ ثانیه) و اگر کوتاه باشد ضبط شکست می‌خورد.
- صفحه‌ها از فروشگاه‌های نمایشی تازه با دو برابر تراکم گرفته می‌شوند و در مخزن نیستند:
  - پوسته‌ی روز با `app-shots.mjs --out=stories/shots-day`؛
  - برگه‌های کنترل در پوسته‌ی آرام با `stories/control-shots.mjs`، پس از سه هفته معامله، دو چک سررسید و یک قیمت عجیب که از راه API ثبت می‌شوند.
- موسیقی روی میزان‌های خودش بریده شده است (۱۱۷٫۱۴ ضرب، هر میزان ۲٫۰۴۹ ثانیه): هر فیلم پانزده میزان از بخش دیگری از آهنگ، و پایان خود آهنگ زیر کارت پایانی. افکت‌ها از کتابخانه‌ی HyperFrames (مجوز Pixabay) روی رویدادهای تصویر می‌نشینند و سکوت ابتدای هر پرونده کنار گذاشته می‌شود تا صدا با فریم هم‌زمان باشد. هر فیلم −۱۶ LUFS با سقف −۱ dBTP است.
- نُه منبعی که مالک نام برد (lemo-opuscar، mg-styles-15، pdoom-video، ClaudeAnimationBase، awesome-claude-5-5-videos، opus-video-prompts، video-alchemy، claude-video-skills، claude-code-video-editing) بیرون از مخزن خوانده شدند و روش، معیار و فهرست‌های بازبینی‌شان به کار رفت. هیچ کدی از آن‌ها در مخزن نیست؛ جدول مجوزها در spec 0047 است.
- ساخت:
  ```
  node scripts/promo-film/app-shots.mjs --skin=day --out=stories/shots-day
  node scripts/promo-film/stories/control-shots.mjs
  node scripts/promo-film/stories/render.mjs counter     # و capacity و control؛ کنار هر تصویر پرونده‌ی json رویدادهای صدا
  MUSIC=…/autofahren.mp3 SFX=…/sfx node scripts/promo-film/stories/mix.mjs scripts/promo-film/stories/out/counter-picture.mp4 public/media/promo/beatris-counter.mp4
  node scripts/promo-film/stories/render.mjs counter --sheet   # برگه‌ی فریم‌ها برای بازبینی
  ```
- بازبینی را خود سازنده با برگه‌های فریم و سنجه‌ها (ebur128، blackdetect، freezedetect) انجام داده است. منتقد مستقل فیلم‌ها را نسنجیده و کسی آن‌ها را گوش نداده است.

## تیزر «یک گرم، یک حساب» (۳۰ ثانیه، 1080p60، آبان ۱۴۰۵) — `public/media/promo/beatris-one-gram.{mp4,webm,jpg}` (spec 0042)
- با OpenMontage ساخته شده است: خط تولید animation (پژوهش، پیشنهاد، فیلم‌نامه، نقشه‌ی صحنه، دارایی‌ها، تدوین، ترکیب، انتشار) و موتور HyperFrames آن.
  - OpenMontage مجوز AGPL دارد و فقط ابزار است. هیچ کدی از آن در این مخزن نیست.
  - پرونده‌های پیش‌تولید (پژوهش، پیشنهاد، دفتر تصمیم‌ها) در پروژه‌ی `beatris-one-gram` همان OpenMontage می‌مانند.
- یک سکه‌ی واقعی، تمام بهار آزادی با عکس خود اپ، داستان را از وزن و عیارش تا نشانی اپ می‌برد. صحنه‌ها روی میزان‌های موسیقی (۱۱۷٫۱ ضرب در دقیقه) چیده شده‌اند:
  1. واقعیت‌های سکه؛
  2. قیمت امروز، رقم به رقم؛
  3. حلقه‌ی ویترین و پنجره‌ی سکه (spec 0041)؛
  4. میز فروش زنده (spec 0037)؛
  5. «بکشید تا ثبت شود» و امضای مشتری (spec 0040)؛
  6. روزنگار؛
  7. قاعده‌ی مالیات؛
  8. بازار و هشدار قیمت؛
  9. آزمایشگاه سکه؛
  10. میز هر نقش (spec 0038)؛
  11. کارت پایانی.
- پرونده‌ها در `one-gram/`:
  - `index.html` ترکیب است: یک تایم‌لاین متوقف GSAP که هر مقدارش تابع زمان است؛
  - `stage.mjs` آن را با قلم‌ها، صفحه‌ها، عکس سکه‌ها، موسیقی و افکت‌ها در پروژه‌ی OpenMontage می‌چیند؛
  - `mix.mjs` صدا را از روی خود تگ‌های `<audio>` ترکیب می‌سازد، آن را به −۱۶ LUFS با سقف −۱ dBTP می‌رساند و زیر تصویر HyperFrames می‌گذارد. ویدیو دوباره رمزگذاری نمی‌شود.
- صفحه‌ها را `app-shots.mjs --out=shots-gram` و `showcase-shots.mjs` از یک فروشگاه نمایشی با پوسته‌ی روز می‌گیرند. فقط نُه صفحه‌ای که فیلم به کار می‌برد در `shots-gram/` نگه داشته شده است.
- قیمت‌ها نمونه‌اند و هم صحنه‌ی قیمت و هم کارت پایانی این را می‌گویند. وزن، عیار و قطر سکه از `coins.mjs` می‌آیند.
- موسیقی «Autofahren» از Mauro Urbina است (Mixkit، مجوز رایگان موسیقی Mixkit). برشی ۳۰ ثانیه‌ای روی میزان‌های خودش دارد و در مخزن نیست.
- افکت‌ها از کتابخانه‌ی HyperFrames هستند (مجوز Pixabay):
  - یک whoosh نرم روی هر جابه‌جایی پهلویی؛
  - pop روی واقعیت‌های سکه، مهر و میدان هشدار؛
  - click روی ضربه‌ها و فشار دکمه؛
  - یک chime روی «ثبت شد»؛
  - sparkle روی درخشش سکه و نوار مالیات؛
  - صدای تایپ روی رقم هدف هشدار.
- افکت‌ها طوری شروع می‌شوند که صدای شنیدنی‌شان با رویداد تصویر هم‌زمان باشد؛ سکوت ابتدای پرونده‌ها با `data-playback-start` کنار گذاشته می‌شود.
- بلندی هر افکت در باند فرکانسی خودش در برابر موسیقی حل شده است. این موسیقی تیره است و در ۲ تا ۸ کیلوهرتز تقریباً خاموش است، برای همین کف −۳۰ dB برای سطح و برای این باند گذاشته شد. صداهای تکراری هم‌سطح نگه داشته شده‌اند.
- GSAP 3.13.0 (مجوز رایگان GreenSock) از `npm pack gsap@3.13.0` می‌آید و در مخزن نیست.
- ساخت:
  ```
  node scripts/promo-film/app-shots.mjs --skin=day --out=shots-gram
  node scripts/promo-film/showcase-shots.mjs
  GSAP=…/gsap.min.js MUSIC=…/music-edit.wav node scripts/promo-film/one-gram/stage.mjs
  cd $OM/projects/beatris-one-gram/hyperframes
  npx hyperframes lint . && npx hyperframes validate .
  npx hyperframes render . -o ../renders/final-60.mp4 --fps 60 --quality high
  cd -   # بازگشت به beatris
  node scripts/promo-film/one-gram/mix.mjs $OM/projects/beatris-one-gram/renders/final-60.mp4 public/media/promo/beatris-one-gram.mp4 --crf=18
  ffmpeg -i public/media/promo/beatris-one-gram.mp4 -c:v libvpx-vp9 -crf 30 -b:v 0 -row-mt 1 -deadline good -cpu-used 3 -c:a libopus -b:a 128k public/media/promo/beatris-one-gram.webm
  ffmpeg -ss 3.8 -i public/media/promo/beatris-one-gram.mp4 -frames:v 1 -q:v 2 public/media/promo/beatris-one-gram.jpg
  ```
- بازبینی را خود سازنده با برگه‌های فریم و سنجه‌ها انجام داده است. سنجه‌ها `frozen-time.sh` و `loudness.sh` از مهارت business-motion-film بودند. منتقد مستقل فیلم را نسنجیده است و کسی هم آن را گوش نداده است.

## اینفوگرافیک «رؤیای طلایی» (۱۶۰۰×۱۰۹۰۰، مهر ۱۴۰۵) — `public/media/promo/beatris-infographic-3.{jpg,pdf}`
- جای دو اینفوگرافیک تیره‌ی قبلی را گرفته است. منظره‌ای روشن و سوررئال دارد: آسمان پاستلی، طاق‌ها، کف شطرنجی و طلایی که در هوا معلق است. بخش‌ها:
  - **ورود با ایمیل** (spec 0034)؛
  - **میز فروش زنده** (spec 0037): صفحه‌ی اصلی، پرونده‌ی مشتری، سناریوهای «اگر…؟»، صفحه‌ی مشتری و رسید؛ نمونه‌ی محاسبه را خود `sell.mjs` با قیمت روزِ عکس میز (۲۴۰٬۰۰۰٬۰۰۰ ریال) حساب می‌کند؛
  - **میز هر نقش** (spec 0038)؛
  - **همه‌ی گالری** در نُه کارت؛
  - **نامه‌ی کلاسیک انگلیسی** «A Letter to the Jeweller»، تمام انگلیسی و به سلیقه‌ی غربی؛
  - **عددها** و **دعوت پایانی** با QR.
- میان بخش‌ها یک جمله‌ی فارسی می‌آید با برگردان انگلیسی‌اش.
- قلم‌ها: Vazirmatn، Estedad و Markazi (فارسی)؛ Playfair Display، Plus Jakarta Sans و Pinyon Script (لاتین، در `fonts/` با مجوز OFL).
- تصویرها:
  - صفحه‌ها از حساب نمایشی، با پوسته‌ی روز، کار `app-shots.mjs` هستند و در `shots-day/` قرار دارند. `--only=sell` فقط صفحه‌های تازه را می‌گیرد: میز فروش، صفحه‌ی مشتری و فضای کار.
  - طلاها را استودیوی خود اپ می‌کشد: `ig3-props.mjs` با `jewelry.mjs` و `stage.mjs` کار می‌کند و خروجی را در `ig3/props/` می‌گذارد.
  - عکس سکه از M.samei است (CC BY-SA 4.0، ویکی‌مدیا کامنز).
- ساخت:
  ```
  node scripts/promo-film/app-shots.mjs --skin=day [--only=sell]
  node scripts/promo-film/ig3-props.mjs
  FFMPEG=… node scripts/promo-film/infographic3.mjs --e2e=<شمار بررسی‌های e2e>   # JPG ۲۴۰۰ پیکسلی، PDF و نسخه‌ی زیر ۸۰۰۰ پیکسل
  FFMPEG=… node scripts/promo-film/infographic3.mjs --preview --out=<dir>        # نگاه سریع
  ```
- صفحه در ده نوار کشیده و به هم دوخته می‌شود. دلیلش این است که یک عکس بلند گاهی لایه‌ها، و حتی یک تیتر، را جا می‌انداخت.
- بازبینی را خود سازنده با برش‌های صفحه انجام داده است؛ منتقد مستقل آن را نسنجیده است.

## تیزر «رؤیای طلایی» (۳۲ ثانیه، 1080p60، مهر ۱۴۰۵) — `public/media/promo/beatris-dream.{mp4,webm,jpg}`
- منظره‌ی اینفوگرافیک، این بار در حرکت. هفت صحنه دارد:
  1. سپیده و نام؛
  2. «یک ایمیل. یک کد.» (spec 0034)؛
  3. میز فروش زنده (spec 0037): پرونده‌ی مشتری، «اگر…؟»، شمارنده‌ای که از «قابل پرداخت» تا رقم «۳٪ تخفیف» پایین می‌آید، صفحه‌ی مشتری و سپاس؛
  4. میز هر نقش (spec 0038)؛
  5. همه‌ی گالری در سه صفحه؛
  6. نامه‌ی انگلیسی با مهر لاک؛
  7. کارت پایانی با نشانی و QR.
- اعداد صحنه‌ی میز فروش را `sell.mjs` حساب می‌کند، برای همان سبدی که در عکس‌های میز است:
  - انگشتر ۳٫۴۲ گرم و گوشواره ۲٫۰۸ گرم؛
  - ۳٫۱ گرم طلای کهنه؛
  - قیمت روز ۲۴۰٬۰۰۰٬۰۰۰ ریال.

  برای همین شمارنده، کارت «اگر…؟» و صفحه‌ی مشتری یک رقم نشان می‌دهند. کدِ ورود هم همان کدِ عکس صفحه‌ی ورود است.
- موسیقی را `music.py` خودش می‌سازد: ر ماژور، ۱۰۴ ضرب در دقیقه، بدون نمونه‌ی صوتی و بدون مجوز.
- افکت‌ها را `sfx.py --kit` می‌سازد.
- نشانی و QR کارت پایانی از `BEATRIS_SITE` می‌آیند. اگر تنظیم نشده باشد، نشانی پروداکشن روی Render به کار می‌رود.
- ساخت:
  ```
  node scripts/promo-film/dream.mjs                         # dream.html
  node scripts/promo-film/render.mjs dream --check          # یکسانی فریم‌ها
  node scripts/promo-film/render.mjs dream 60               # ۱۹۲۰ فریم و sfx.json در frames-dream
  python3 scripts/promo-film/music.py dream.wav 32
  python3 scripts/promo-film/sfx.py --kit kit/
  FFMPEG=… FILM=dream MUSIC=dream.wav KIT=kit node scripts/promo-film/encode-anatomy.mjs
  ```
- بازبینی را خود سازنده با عکس‌های صحنه انجام داده است؛ منتقد مستقل آن را نسنجیده است.

## تیزر «کالبد یک دفتر طلا» (۳۰ ثانیه، 1080p60) — `public/media/promo/beatris-anatomy.mp4` (spec 0031)
- `anatomy.html` و `anatomy.mjs`: دو شکل anatomy خود اپ را نشان می‌دهند. شکل‌ها با `{ manual: true }` سوار می‌شوند و ساعت این صفحه آن‌ها را می‌گرداند:
  - **دستگاه یک زنجیره (`/books/events`):** دستگاه خط‌به‌خط ساخته می‌شود و پرس دو سند را با سرعت خواندن مهر می‌کند. بعد شش سند با شتاب مهر می‌شوند. کشوی هر بخش روشن می‌شود. حلقه ۴ دستکاری می‌شود و زنجیره از همان‌جا قرمز می‌شود.
  - **دستگاه موج (`/books/elliott`):** نمونه درست می‌آید، بعد موج ۲ از شروع موج ۱ پایین می‌رود و ضامن ریل ۲ قرمز می‌شود، و دوباره نمونه درست.
  - **کارت پایانی:** «ورود با شماره موبایل».
- هر کد، شمارنده، حکم و امتیاز را ماژول‌های خود اپ حساب می‌کنند: `trade.mjs`، `sectionsOf`، قاعده SHA-256 دفتر رویداد و `ta.elliott`. پانویس فیلم می‌گوید داده نمونه است.
- ساخت:
  ```
  node scripts/promo-film/render.mjs anatomy --check          # شش فریم، هر کدام از دو مسیر: باید یکسان باشند
  node scripts/promo-film/render.mjs anatomy --stills=3.5,7,26.5 --out=dir   # عکس‌های بازبینی از همان ساعت
  node scripts/promo-film/render.mjs anatomy 60               # ۱۸۰۰ فریم و sfx.json در frames-anatomy
  python3 scripts/promo-film/sfx.py --kit kit/                # whoosh.wav، hit.wav، shimmer.wav
  FFMPEG=… MUSIC=nocturne.mp3 KIT=kit node scripts/promo-film/encode-anatomy.mjs
  ```
  `encode-anatomy.mjs` این‌ها را می‌سازد:
  - MP4 (H.264 High 4.2، faststart، AAC 48 kHz)، WebM (VP9 + Opus) و پوستر در ثانیه ۹؛
  - میکس: افکت‌ها هر کدام در زمان خودشان، موسیقی زیر آن‌ها، و بلندی ‎−14 LUFS.

  سپس بلندی، پیک واقعی و بخش‌های یخ‌زده را می‌سنجد. اگر هر کدام بیرون از حد spec باشد، اجرا شکست می‌خورد.

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
