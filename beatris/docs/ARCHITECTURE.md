# Beatris — معماری و جزئیات ماژول‌ها (منتقل‌شده از CLAUDE.md)

## پروژه
اپ آموزش کارکنان گالری طلا. Node 22، بدون وابستگی runtime سرور (`node:http` + `node:sqlite`)، SPA فارسی RTL.
- تست واحد: `npm test` (همه باید پاس شوند)
- آزمایشگاه سکه: مدل دامنه در `public/js/coins.mjs` (مشترک سرور/مرورگر، با تست در `tests/coins.test.mjs`)، موتور سه‌بعدی در `public/js/three/coins3d.mjs`، صفحه `/coins`. طرح‌ها «نمونه آموزشی» و سبک‌سازی‌شده‌اند؛ طرح رسمی ضرب را بازتولید نکنید. قطرها تقریبی‌اند؛ وزن و عیار رسمی از `calc.mjs`.
- موتور احتمال (بیز) و مدل پلمپ هم در `coins.mjs` است: `SEAL_TYPES`، سناریوهای `S0`–`S6`، `SEAL_TESTS` (حساسیت/هشدار کاذب)، `SEAL_ANOMALY`، `SEAL_CONTEXTS`، `makePack`، `bayes`، `rankTests`. بسته‌ها با همان نرخ‌های ناهنجاری ساخته می‌شوند تا پسین دقیق باشد؛ تست مونت‌کارلو کالیبراسیون را می‌سنجد. با تغییر ضرایب، تست‌ها و پاسخ‌های عددی درس‌های k9–k11 را دوباره اجرا کنید. ضرایب آموزشی‌اند، نه آمار رسمی.
- مجموعه سکه‌ها مطابق جدول بازار است (تمام قدیم/امامی، نیم قدیم/امامی، ربع قدیم/امامی و ۱۴۰۳، گرمی، پارسیان) با فیلد `years`؛ «جلو» در طرح قدیم = نشان بانک، «پشت» = بارگاه.
- سکه واقعی (عکس): `public/js/coinphoto.mjs` (یافتن دایره، برش، 4K، نقشه برجستگی؛ هرگز جزئیات ساختگی نمی‌سازد و وضوح واقعی منبع را اعلام می‌کند)، مدل سه‌بعدی `photoCoin` در `coins3d.mjs`. مجموعه داخلی از `assets/coin-photos/` با `node scripts/coin-photos.mjs` در `public/coins/photos/` ساخته می‌شود (مجوز CC BY-SA 4.0، اعتبار M.samei روی صفحه و خروجی‌ها). بارگذاری مدیر در `/coins/manage`؛ فایل‌ها در `$BEATRIS_DATA_DIR/media` و سرو از `/media/coins/` (نام فقط با `MEDIA_NAME`).
- آب‌شده و دفتر: `public/js/melt.mjs` (حساب، `PATTERNS`، `makeTrade`/`gradeTrade`)، دوره `content/courses-melt.mjs` (درس‌های h1–h6)، نمودارهای تعاملی درس در `public/js/viz.mjs` (بلوک `{ t: 'viz', kind }`)، صفحه‌های `/ledger` (تمرین‌گر) و `/tools/melt` (ثبت سریع + CSV با تاریخ شمسی). قاعده دفتر: اول معادل ۷۵۰ گرد به ۳ رقم، بعد مبلغ گرد به هزار تومان؛ `MAZANEH_TO_G750 = 4.331802`. پاسخ‌های عددی درس‌ها در `tests/content.test.mjs` با همین توابع وارسی می‌شوند.
- بازار (`/market`، مدیریت داده `/market/data`): تحلیل تکنیکال خالص و تست‌شده در `public/js/ta.mjs` (میانگین‌ها، RSI/MACD/ADX/ATR به روش وایلدر، بولینگر، ایچیموکو، سوپرترند، SAR، رنکو، سه‌خط شکست، پیوت، فیبوناچی، زیگزاگ، قواعد الیوت، آمار، تقویم شمسی، حباب سکه و دلار مستتر، `marketRead`)؛ نمادها و بازار نمونه در `public/js/market.mjs`؛ موتور نمودار کانواس بدون وابستگی در `public/js/charts.mjs`؛ فهرست شاخص‌های مشترک صفحه و درس در `public/js/indicators.mjs`. سرور: `server/market.mjs` (جدول `market_bars`، API `/api/market*`). تا اولین قیمت واقعی، «داده نمونه آموزشی» با برچسب سرو می‌شود. منبع پیش‌فرض تولید `owner` است (خواسته مالک): مظنه نقدی و حواله از کانال عمومی `t.me/s/abshdh` (منبع اپ goldsuite-price مالک)، دلار و سکه‌ها از استریم `chande.net/api/v1/sse/prices` (میانگین خرید و فروش، ریال ÷ ۱۰)، انس از `goldprice.org` و در نبودش `GOLD_24K.price_usd` چنده؛ گرم ۱۸ و ۲۴ از مظنه محاسبه می‌شوند؛ سابقه روزانه یک بار از tgju. در `NODE_ENV=test` پیش‌فرض `off` است. حباب و ارزش جهانی فقط با انس و دلار واقعیِ هم‌روز (حداکثر ۳ روز فاصله) حساب می‌شوند و در نبودشان عدد تخمینی نشان داده نمی‌شود. `json` فقط https عمومی. ورود دستی مدیر هرگز با فید بازنویسی نمی‌شود؛ پرش بیش از ۳۰٪ رد می‌شود. دوره `c-market` (درس‌های mk1–mk7) و بلوک `{ t: 'viz', kind: 'chart' }` روی بازار نمونه با روز ثابت.
- حسابداری فروشگاه (`/books`): موتور خالص و مشترک در `public/js/books.mjs` (همه مبالغ ذخیره‌شده ریال صحیح؛ نمایش تومان). قواعد: مالیات فقط بر اجرت ساخت + سود فروشنده + حق‌العمل (اصل طلا، سنگ و سکه معاف)؛ سود = درصد × (طلا + اجرت)؛ تخفیف اول از سود بعد از اجرت و هرگز از ارزش طلا؛ اجرت و «جمع اجرت، حق‌العمل و سود» عدد صحیح ریال (قاعده سامانه مودیان)؛ آب‌شده با همان قاعده دفتر `melt.mjs`. فاکتور الکترونیکی با الگوی ۳ (طلا، جواهر و پلاتین) و کالای غیرطلا در الگوی ۱ جدا (`moadianInvoices`)؛ شماره منحصربه‌فرد مالیاتی `taxId` با Verhoeff دقیقاً مطابق SDK رسمی (تست با خروجی کتابخانه پایتون). روش‌های پرداخت و کد `pmt` در `PAY_METHODS`. سرور: `server/books.mjs` (جدول‌های `bk_*`، اسناد نسخه‌دار در `bk_versions`، اثر هر سند قطعی در `bk_postings` که با هر ویرایش از نو ساخته می‌شود، چک‌ها با بازپخش تاریخچه، دفتر رویداد زنجیره‌ای `bk_log` با sha256). سند قطعی حذف نمی‌شود؛ ویرایش با دلیل = نسخه جدید، ابطال = وضعیت void؛ شماره سند هرگز تکرار نمی‌شود. کد اصالت = ۱۲ کاراکتر اول هش نسخه و صفحه عمومی `/verify/:code` بدون اطلاعات خریدار. QR (`public/js/qr.mjs`) با OpenCV و بارکد Code128 (`public/js/barcode.mjs`) با کتابخانه مرجع وارسی شده‌اند. تست‌ها: `tests/books.test.mjs` و `tests/booksapi.test.mjs`؛ با تغییر فرمول هر دو و مرحله «shop books» در E2E را اجرا کنید.
- نسخه پایه (سکه، آبشده، شمش پلمپ، ارز): موتور `public/js/trade.mjs` (سند `trade` با ردیف قیمت‌دار = تبدیل جنس↔ریال، بی‌قیمت = مانده جنسی روی حساب مشتری با واحدهای `IRR`، `G750`، `COIN:<نوع>`، `FX:<کد>`، `BAR:<سریال>`؛ `hawala` بین دو مشتری؛ `convert` مانده جنسی به ریال؛ سود و زیان میانگین موزون `positionReport`؛ تطبیق بانک `matchStatement`). مبالغ سند معامله ریالی‌اند (ورودی و ذخیره)؛ سند کامل هنوز ورودی تومانی می‌گیرد و UI با `K()` تبدیل می‌کند. نمایش پیش‌فرض ریال (`money` در تنظیمات). سریال شمش فقط یک بار در صندوق؛ آبشده شرطی با `/assay` نسخه جدید می‌گیرد. هم‌نام‌ها فقط با لقب/پدر/شهر/موبایل متفاوت (`partyLabel`). صفحه‌ها: `/books/desk` (میز معامله، `pages/desk.mjs`)، `/books/day` (روزنگار)، `/books/vault`، `/books/bars`، `/books/bank/:id` (`pages/deskmore.mjs`)، گزارش `?tab=pnl`. بانک هر پرداخت را ردیف جدا نشان می‌دهد (شناسه `src#i`). تست‌ها: `tests/trade.test.mjs`، `tests/tradeapi.test.mjs` و مرحله «base edition» در E2E.
  - تمرکز تأخیری میز (`focusFirst` در `desk.mjs`، یک فریم پس از کشیدن فرم) خانه‌ای را که کاربر خودش رفته نمی‌گیرد. پیش‌تر روی دستگاه کند، «۷۴۵»ِ عیار به وزن می‌رفت و «۵۰» گرم «۵۰۷۴۵» گرم ثبت می‌شد (e2e: «a field taken right after the kind button keeps the focus»).
- نام خانه «خانه سکه و شمش تاج» (`SHOP_NAME` در `public/js/crown.mjs`) پیش‌فرض سربرگ، فاکتور و رسید است؛ نشان تاج مینیمال (جواهرش سکه، پایه‌اش شمش) در همان فایل. ته حساب با اصطلاح بازار: بدهکار/بستانکار «مالی» (ریالی) و «جنسی» (طلا، سکه، شمش، ارز) جدا، مطالبه و تعهد (`balBoard`، `balSentence` در `bk.mjs`).
- ممیز (`server/audit.mjs`، `/api/books/audit`، صفحه `/books/audit`): فقط‌خواندنی؛ زنجیره رویداد، موجودی/صندوق منفی، مظنه و قیمت سکه دور از تابلو، شماره پیگیری و سند تکراری، سقف اعتبار، مطالبه معوق، چک سررسیدگذشته، بانک تطبیق‌نشده، آبشده شرطی، معامله کلان بی‌هویت، سند با تاریخ گذشته، ریسک موقعیت طلا. آستانه‌ها در `AUDIT_DEFAULTS` و قابل تنظیم در تنظیمات. پس از ثبت هر سند در میز، هشدارها روی رسید.
- کلیدهای هوش مصنوعی هر فروشگاه (`/books/ai`، `server/providers.mjs`): Anthropic و هر سرویس سازگار با OpenAI (OpenAI، Gemini، Grok، Qwen، OpenCode، DeepSeek، OpenRouter، Mistral، Groq، نشانی دلخواه https عمومی). کلید با AES-GCM (`makeSealer` در `auth.mjs`، کلید مشتق از `BEATRIS_TOKEN_SECRET` و شناسه فروشگاه) ذخیره و هرگز برگردانده نمی‌شود؛ ترتیب = اولویت، خرابی یکی → بعدی → موتور دفاتر. نام مدل را کاربر از پنل سرویس می‌نویسد (در کد شناسه مدل نگذارید).
- دستیار حسابرس (`server/assistant.mjs`، `POST /api/books/assistant`): ابزارهای فقط‌خواندنی (هرگز ثبت/ویرایش نمی‌کند). موتور: مدل روی سیستم خود مغازه با `AGENT_LLM_URL` + `AGENT_LLM_MODEL` (سازگار با OpenAI: Ollama/LM Studio)، یا Claude با `ANTHROPIC_API_KEY` + `ANTHROPIC_MODEL`؛ بدون این‌ها موتور دفاتر (پاسخ مستقیم از دیتابیس). اگر مدل در دسترس نباشد خودکار به موتور دفاتر برمی‌گردد. کلیدها فقط در متغیرهای محیطی میزبان، هرگز در مخزن.
- رهگیری: هر سند کد `M1405-00012` (`B.trackCode`، پیشوند از `DOC_TYPES.prefix`)، هر ردیف `/L2` و هر پرداخت `/P1`. `GET /api/books/trace?q=` (کد رهگیری، کد اصالت، شماره پیگیری، سریال شمش، چک، کد/موبایل مشتری) کل سرگذشت سند را می‌دهد (`server/trace.mjs`)؛ چاپ و ارسال با `POST /api/books/docs/:id/event` در دفتر رویداد زنجیره‌ای ثبت می‌شود. صفحه `/books/trace`.
- اصلاح شفاف (spec 0024): `public/js/docdiff.mjs` (خالص) دو محتوای سند را فیلد به فیلد مقایسه می‌کند (ردیف‌ها و پرداخت‌ها با LCS جفت می‌شوند؛ ورودی تومانی نسخه کامل ×۱۰ به ریال)؛ فهرست `{at, n, field, from, to, kind}` در جزئیات `doc.amend`/`doc.update`/`doc.restore` دفتر رویداد زنجیره‌ای می‌نشیند و صفحه سند (`changes`، تغییر هر نسخه) و رهگیری آن را به فارسی نشان می‌دهند. برگرداندن: `POST /api/books/docs/:id/restore` (مدیر، دلیل اجباری) سند جایگزین‌شده را اصلاحیه سند زنده زنجیره و سند باطل را سند تازه با همان تاریخ (`restores`) می‌کند؛ اگر ارقام با اصل یکی نشود (مثلاً گام گرد کردن عوض شده) ۴۰۹ و هیچ ثبتی نمی‌شود؛ افتتاحیه و اصلاح موجودی برگردانده نمی‌شوند. شبیه‌ساز `basis` (روز، آخرین رویداد دفتر، قیمت‌ها) و `fingerprint` برمی‌گرداند؛ با `basis` در درخواست همان قیمت‌ها به کار می‌رود و `since` تعداد اسناد بعد از آن مبنا را می‌گوید. تست: `tests/docdiff.test.mjs`، `tests/restore.test.mjs`.
- جستجوی عدد در روزنگار (spec 0023): `public/js/daysearch.mjs` (خالص: `readQuery` عدد را با همان `readNumber` میز می‌خواند؛ `bandsOf` بازه را با قاعده ثابت می‌سازد: واحد نوشته‌شده، وگرنه واحد فروشگاه یا سوییچ صفحه؛ دقت ۰/۱/۵/۱۰٪ و «حدود» = ۵٪؛ `figuresOf` همه ارقام هر سند). `GET /api/books/daybook/find?q=&tol=&unit=`: نمایه ارقام همه اسناد (قطعی، باطل، جایگزین‌شده) مرتب برای هر واحد، یک بار برای هر ویرایش دفتر (`core.memo('dayfind')`)؛ هر بازه دو جستجوی دودویی؛ ترتیب: نزدیک‌ترین، بعد تازه‌ترین؛ دسترسی مثل روزنگار. در کادر جستجوی روزنگار، عدد همه روزها را می‌گردد؛ Ctrl+K عدد را به همان‌جا می‌برد. تست: `tests/daysearch.test.mjs`.
- کیفیت تصویر (spec 0025): `public/js/quality.mjs` (خالص و تست‌شده: `tierOf` از GPU، تراکم صفحه، هسته و حافظه؛ `canvasDensity` برای هر کانواس دوبعدی تا ۴× در سقف مساحت؛ `samplesFor`/`superFor` برای MSAA و ابرنمونه‌برداری). صحنه سه‌بعدی `three/stage.mjs` (تراکم کامل، MSAA خود GPU، بازتاب PMREM، سایه نرم، وضوح پویا هنگام حرکت و قاب ۲×۲ در سکون، خروجی تا 8K). تصویر نمودار بازار (`chart.toBlob({ width: 7680 })`) دوباره در همان چگالی کشیده می‌شود، نه بزرگ‌نمایی. تست: `tests/quality.test.mjs` و مرحله «visual quality» در E2E (۲×، ۳× و 1920×1080×4).
- هر اتفاق مغازه در یک زنجیره (spec 0026): فهرست رویدادها `public/js/shopevents.mjs` (۹۰ رویداد، ۱۰ گروه؛ منبع راهنمای `/books/events`، Ctrl+K و تست). سندهای تازه در `trade.mjs`/`books.mjs`: `income` (حساب `inc:<دسته>`)، `writeoff` سوخت یا بخشودگی مانده (حساب `wo`، مدیر، دلیل، هرگز بیش از مانده یا خلاف جهت؛ قاعده چهار چشم `writeoff`)، `transform` ذوب و تبدیل (ورودی/خروجی، افت، اجرت در `exp:ذوب و ری‌گیری`). یک منبع حرکت: `movesOf(e)` را هم میانگین موزون `positionReport` و هم FIFO `lots.mjs` بازپخش می‌کنند؛ موقعیت هر واحد = گاوصندوق + مانده جنسی مشتریان (شمش با معادل ۷۵۰ شناسنامه‌اش). مانده جنسی مشتری در افتتاحیه به میانگین بهای همان کالا در افتتاحیه. شمش با وزن و عیار شناسنامه‌اش خارج می‌شود (میز از شناسنامه پر می‌کند). چک سند ریالی (نسخه پایه) به ریال ذخیره می‌شود؛ چک‌های قدیمیِ ده‌برابر هنگام راه‌اندازی اصلاح و در دفتر رویداد ثبت می‌شوند (`cheque.repair`). شمارش هرگز موجودی یا صندوق را منفی نمی‌کند. سود و زیان: `result` = معاملات + درآمد − هزینه − سوخت ریالی. سندهای بی‌فرم (حواله، تبدیل، ذوب، شمارش، سوخت) با ابطال و ثبت دوباره اصلاح می‌شوند. تست: `tests/shopevents.test.mjs` (هر ۹۰ رویداد از راه API، پس از هر کدام زنجیره، موقعیت، روزنگار، جستجوی عدد و رهگیری)، `tests/chequefix.test.mjs`، `tests/fuzz.test.mjs`، `tests/trade.test.mjs`.
- سرنخ‌یاب (spec 0032): `public/js/clue.mjs` (خالص، مشترک سرور و تست). `readClues` هر سرنخ را با قاعده‌ای ثابت و نمایش‌دادنی می‌خواند: مبلغ با خواننده روزنگار (`amountAt` در `daysearch.mjs`)، «و خرده‌ای»، «بیشتر/کمتر از»، «بین/از … تا»، «آخرش/اولش»، تکه رقم (کد رهگیری، پیگیری، کارت، چک، صیادی، سریال، موبایل، کد ملی، کد مشتری، و رقم‌های هر مبلغ)، کد کامل و حرف‌وعدد، «سند ۱۲»، «کد مشتری ۳۴»، کلمه با تا کردن حروف و «هم‌آوا» (ت/ط، س/ص/ث، ز/ذ/ض/ظ، ه/ح، ق/غ)، کلمه‌ای که چیزی را نام می‌برد (نوع، روش، جهت، سکه، ارز، وضعیت) به‌صورت «یا»، روز (امروز تا پارسال، ماه، روز ماه، تاریخ کامل، روز هفته) و ساعت. `findClues` هر سند را با سندِ خودش، مشتری‌اش (و دو طرف حواله)، ثبت‌کننده، ارقام، نوع و روز می‌سنجد؛ اول سندهایی با همه سرنخ‌ها، وگرنه «نزدیک‌ترین‌ها» با سرنخِ جامانده؛ مشتریان جدا. `GET /api/books/find?q=&sec=&limit=` روی همان نمایه ارقام روزنگار (`clueIndex`، یک بار برای هر ویرایش دفتر؛ هر سند تا تغییر خودش، چک‌هایش یا مهرش کش می‌شود)؛ دسترسی مثل روزنگار و کد رهگیری کامل همیشه باز می‌شود. صفحه `/books/find`؛ Ctrl+K و دکمه جستجوی نوار بالا از راه `/api/books/control/find` همین موتور را می‌خوانند؛ روزنگار و رهگیری به آن پیوند می‌دهند. تست: `tests/clue.test.mjs` (خواندن، تطبیق، نزدیک‌ترین‌ها، پایداری، API، دسترسی، ۳۰۰۰ سند زیر ۱۵۰ میلی‌ثانیه)، مرحله «سرنخ‌یاب» E2E و بررسی سرنخ در هر دور `scripts/hundred.mjs`.
- شکل‌های anatomy (spec 0028، 0030): کیت `public/vendor/anatomy/iso-kit.mjs` (MIT، درون مخزن). `public/js/figures/onechain.mjs` با `onechain-model.mjs`: دستگاه یک زنجیره بالای `/books/events`؛ کد هر حلقه با قاعده SHA-256 دفتر رویداد (`verifyLog`) و بخش‌ها با `sectionsOf` حساب می‌شوند. `figures/wave.mjs` با `wave-model.mjs`: دستگاه موج زیر نمودار `/books/elliott`؛ حکم‌ها از `ta.elliott` می‌آیند. هر دو گزینه `{ manual: true }` دارند (بی‌ساعت، برای تیزر). تست: `tests/onechain.test.mjs` و `tests/elliottfig.test.mjs`. بررسی سر خط‌ها با `lines.mjs` مهارت anatomy انجام می‌شود (باید ۰ باشد).
- صد دور (spec 0029): `node scripts/hundred.mjs [--rounds=100]` اپ را روی سرور موقت صد بار مثل یک فروشگاه به کار می‌برد و هر خروجی را با مدلی می‌سنجد که فقط از ورودی‌ها و `trade.mjs` ساخته شده است. گزارش در `hundred-report.json` نوشته می‌شود. دور شکست‌خورده مرحله، پیام صفحه و عکس `hundred-rN.png` را می‌دهد.
- پوشش آزمون (spec 0033): `scripts/coverage.mjs` نشان می‌دهد هر صفحه (`route` در `app.mjs`) در آزمون مرورگر باز می‌شود و هر مسیر API با همان متد در یک آزمون صدا زده می‌شود. `npm run check` اگر یکی بی‌آزمون بماند شکست می‌خورد. آزمون مسیرهایی که پیش‌تر صدا زده نمی‌شدند در `tests/coverage.test.mjs` است. آزمون‌های PowerShell پل کارتخوان هر جا `pwsh` نصب باشد اجرا می‌شوند.
- پیوندها و فهم کد (spec 0039):
  - `scripts/links.mjs` در `npm run check` دو چیز را می‌سنجد: هر import نام‌دار در ماژول مقصد export شده باشد، و هر مسیر `/api` که صفحه‌ها صدا می‌زنند در سرور مسیری داشته باشد. `tests/links.test.mjs` با یک نمونه‌ی ساختگی نشان می‌دهد هر دو خطا گرفته می‌شود.
  - گراف کد با CodeGraphContext (بیرون از مخزن):
    1. `pip install codegraphcontext` در یک venv.
    2. یک کپی از `server`، `public/js`، `scripts` و `tests` (بی `public/vendor` و رسانه) با `DEFAULT_DATABASE=kuzudb cgc index .` نمایه می‌شود.
    3. توابع بی‌فراخواننده با `cgc query "MATCH (f:Function) WHERE NOT EXISTS { MATCH (g)-[:CALLS]->(f) } RETURN f.name, f.path, f.line_number"` پیدا می‌شوند.
    4. هر کدام با جست‌وجوی نامش در همه‌ی کد سنجیده می‌شود.
  - **قاعده‌ی کد مرده:** تابعی حذف می‌شود که نه فراخواننده دارد و نه نامش جای دیگری آمده است. callbackهای مرورگر، getterها و API عمومی موتورها (`books.mjs`، `acct/coa.mjs`، `studio/units.mjs`، `studio/materials.mjs`، `nurbs.mjs`، `elliott.mjs`) می‌مانند.
  - مهارت‌های طراحی پروژه در `.claude/skills/`:
    - `frontend-design`؛
    - `web-design-guidelines` (رونوشت بازبینی‌شده‌ی قواعد Vercel در `command.md`)؛
    - `accessibility-compliance`؛
    - `taste-skill`.
- تیزر «کالبد یک دفتر طلا» (spec 0031): `scripts/promo-film/anatomy.html` و `anatomy.mjs` (`seek(t)` خالص). `render.mjs anatomy` فریم‌ها را می‌سازد (`--check` برای یکسانی، `--stills` برای بازبینی) و `encode-anatomy.mjs` میکس می‌کند و بلندی، پیک و یخ‌زدگی را می‌سنجد. خروجی `public/media/promo/beatris-anatomy.{mp4,webm,jpg}` است.
- تیزر «رؤیای طلایی» (اصلاحیه‌ی spec 0031): `scripts/promo-film/dream.mjs` صفحه‌ی `dream.html` را می‌سازد (`seek(t)` خالص؛ هفت صحنه).
  - عددهای میز فروش را `sell.mjs` برای همان سبدی حساب می‌کند که در عکس‌های میز است.
  - موسیقی را `music.py` می‌سازد.
  - `render.mjs dream` فریم‌ها را می‌سازد و `FILM=dream encode-anatomy.mjs` با همان سنجه‌ها میکس و رمزگذاری می‌کند.
  - خروجی `public/media/promo/beatris-dream.{mp4,webm,jpg}` است و جای تیزر کالبد را در `/help` بالای فصل‌ها گرفته است. دلیلش این است که کارت پایانی تیزر کالبد هنوز ورود با موبایل را می‌گوید.
- بخش‌ها و مرتب‌سازی (spec 0027): `SECTIONS`، `sectionsOf`، `figureIn` در `daysearch.mjs` (آبشده، سکه، شمش، ارز، وجه)؛ روزنگار `?sec=&f=&sort=` (کاشی‌ها، فیلترها، جستجوی کلمه، خروجی و جستجوی عدد همه در همان بخش؛ `daybook/find?sec=`؛ `trace?sec=`). مرتب‌سازی: `public/js/sorting.mjs` (خالص: عدد با مقدار، تاریخ شمسی، نام با ترتیب فارسی، خالی آخر، پایدار؛ `wireSort` برای هر `table[data-sort]`، مقدار خام در `data-v`، ردیف جمع با `data-fixed`، انتخاب برای هر جدول در مرورگر). فهرست مشتریان `worth` (کل مانده به قیمت روز) را برای مرتب‌سازی می‌دهد. تست: `tests/sorting.test.mjs`، `tests/daysearch.test.mjs` و مرحله «every shop event» در E2E.
- پوسته‌ها: «شب آرام» پیش‌فرض، «روز»، «کلاسیک» (`data-theme` روی html، کلید `beatris.theme`). حالت روشن = «روز»: توکن‌های `:root[data-theme='day']` و یک لایه واحد در انتهای `app.css` که همه‌اش زیر `[data-theme='day']` است (عاج، سطح سفید، متن زغالی، طلا فقط تأکید). پوسته‌های تیره («شب آرام» و «کلاسیک») تأییدشده‌اند: هر تغییر ظاهری روشن را فقط زیر `[data-theme='day']` بنویسید و با مقایسه پیکسلی نسخه قبل/بعد مطمئن شوید تیره عوض نشده. توکن‌های معنایی (`--background`، `--surface`، `--positive`، `--chart-1`…) نام مشترک اجزاست. رنگ‌ها فقط با توکن‌ها (`--gold-rgb`، `--ink-rgb`، …)؛ رنگ سخت‌کد نگذارید. فونت بدنه Estedad، عنوان رسمی Noto Naskh (هر دو OFL، در `public/fonts/licenses`)؛ جداکننده‌های ٬ و ٫ عمداً از Vazirmatn می‌آیند.
- نبض (`/books/pulse`، صفحه اول نسخه پایه)؛ حافظه (`server/learn.mjs`، `/books/memory`): هارنس کنش اپراتور (`public/js/harness.mjs` → `POST /api/books/events`، فقط نام کنش، نه مقدار تایپ‌شده)، عادت مشتری از اسناد واقعی (`/api/books/learn/party/:id`)، یادداشت‌ها (`bk_memory`)، و دقت با بازپخش تاریخچه. یادگیری هرگز در دفاتر نمی‌نویسد.
- چاپ پیش‌فرض «قالب استاندارد رسمی» (`stdPaper` در `invoice.mjs`، A4 افقی، سیاه‌وسفید).
- داشبورد مدیریت (`/books/dashboard`، فقط مدیر/مالک، پوسته مستقل با `bare`): سرور `server/dashboard.mjs` → `GET /api/books/dashboard?range=today|7|30|90|custom` فقط تجمیع فقط‌خواندنی از `bk_postings` و گزارش‌های موجود (تراز، سود و زیان، روزنگار، ممیز)؛ منطق حسابداری را تغییر نمی‌دهد. سن مطالبات به روش اولین‌ورود. «تپش سال» (تقویم فعالیت ۵۳ هفته از اسناد قطعی و `calc_json`) و «کارنامه ماهانه» (همان `days` گزارش سود و زیان، گروه‌بندی ماه شمسی؛ هر ماه به گزارش همان بازه می‌رود) در `calendar`. کلاینت: `public/js/dash/` (types با JSDoc، adapters، نمودارهای SVG) و `pages/dashboard.mjs`؛ توکن‌های `--gd-*` از پوسته فعال. تست: `tests/dashboard.test.mjs` و بخش dashboard در E2E.
- تست سرتاسری مرورگر: `npm run e2e` (Playwright؛ سرور موقت با دیتابیس موقت می‌سازد؛ باید همه بررسی‌ها پاس و خطای مرورگر صفر باشد). فقط چند مرحله: `E2E_ONLY='melted|mobile pages' npm run e2e`. CSP اجازه eval نمی‌دهد؛ در تست کد را به‌صورت تابع به `page.evaluate` بدهید، نه رشته.
- PWA: `public/sw.js` — API هرگز کش نمی‌شود؛ با تغییر فهرست پیش‌کش یا راهبرد، نام `CACHE` را بالا ببرید.
- سه‌بعدی: three.js به‌صورت یک فایل باندل در `public/vendor/three.bundle.js` (ورودی: `scripts/three-entry.js`، ساخت با esbuild: `esbuild scripts/three-entry.js --bundle --format=esm --minify --outfile=public/vendor/three.bundle.js`). کد استودیو در `public/js/three/` و `public/js/pages/studio3d.mjs`؛ موتور قدیمی `public/js/gl/` فقط برای مدل‌های درون درس.
- فونت‌ها محلی در `public/fonts/` (بدون CDN؛ برای دسترس‌پذیری در ایران). روی متن فارسی letter-spacing نگذارید (اتصال حروف می‌شکند).
- اجرای محلی: `npm run dev` → http://localhost:3000 (دمو: 09120000001، رمز 1234)

- فروشگاه‌ها و حساب‌ها (`server/platform.mjs`، spec 0022): هر فروشگاه خریدار دیتابیس جدا در `$BEATRIS_DATA_DIR/tenants/<id>.db`؛ ثبت فروشگاه‌ها در دیتابیس اصلی (`tenants`). نشست حامل `tn` است و درخواست به همان فروشگاه می‌رود. **نام کاربری و رمز وجود ندارد:** حساب = نام + موبایل + ایمیل + نقش؛ **ورود با ایمیل (spec 0034):**
  - **جریان:** کد ۶ رقمی یا پیوندِ همان ایمیل را Supabase Auth می‌فرستد و می‌سنجد.
    - این کار را `server/supabase.mjs` انجام می‌دهد: REST بدون SDK، فقط از سرور، با `BEATRIS_SUPABASE_URL`/`_KEY`.
    - مسیرها: `/api/auth/code {email}` → `/api/auth/verify {email, code}` یا `{accessToken}` → در صورت نیاز `/api/auth/finish`.
  - **صفحه ورود:** فقط ایمیل.
  - **ایمیل‌ها:** کوچک‌حرف ذخیره می‌شوند و در هر فروشگاه یکتا هستند (`users.email`). ایمیل مالک اصلی از `BEATRIS_OWNER_EMAIL` می‌آید.
  - **در تولید بدون Supabase:** فقط `BEATRIS_OWNER_EMAIL` با `BEATRIS_OWNER_PIN` وارد می‌شود.
  - **مسیرهای پیامکی:** روی سرور مانده‌اند؛ کد امضای بستن روز هنوز پیامکی است.

Spec 0022 (پیامک) پیش‌تر: ورود با موبایل و کد ۶ رقمی پیامکی (`/api/auth/code` → `/api/auth/verify` → در صورت نیاز `/api/auth/finish` برای انتخاب فروشگاه یا ساخت فروشگاه تازه). شماره، فروشگاه خودش را پیدا می‌کند (بدون شناسه فروشگاه)؛ شماره چندفروشگاهی پس از کد انتخاب می‌کند؛ شماره ناشناس با «ثبت‌نام آزاد» فروشگاه خودش را می‌سازد. کد فقط HMAC در `otp_codes`؛ همه ارسال‌ها در `otp_sends` (محدودیت هر شماره، هر IP و کل سرور، پایدار پس از راه‌اندازی دوباره) — `server/otp.mjs`. پنل‌های پیامک ایران در `server/sms.mjs` (SMS.ir، کاوه‌نگار، IPPanel/فراز، قاصدک، ملی‌پیامک) دقیقاً مطابق SDK رسمی هر کدام؛ تنظیم از کنسول (`/vendor` ← «پیامک ورود»، کلید با AES-GCM) یا متغیرهای `BEATRIS_SMS_*` (متغیرها مقدم‌اند). حساب‌های نمایشی کد را روی صفحه می‌بینند؛ محیط توسعه کد را برمی‌گرداند؛ در تولید تا پیامک تنظیم نشده، فقط تلفن مالک (`BEATRIS_OWNER_PHONE`) با `BEATRIS_OWNER_PIN` وارد می‌شود. امضای بستن روز با «کد امضا» (`/api/auth/sign-code`). مدیر هر فروشگاه همکار را با موبایل اضافه می‌کند (سقف `max_users`، ۰ = نامحدود). درخواست حساب با کد فروشگاه (spec 0011) بازنشسته است (۴۱۰)؛ جدول‌هایش دست‌نخورده. فید قیمت، MCP، درخواست‌های نمایش و کتابخانه عکس سکه فقط در فروشگاه اصلی. تست: `tests/otp.test.mjs`، `tests/sms.test.mjs`، `tests/platform.test.mjs`، `tests/supabase.test.mjs` (Supabase بدلی محلی).
- راه‌اندازی فروشگاه (`/setup`، `server/setup.mjs`): مشخصات، صندوق و بانک، آبشده/سکه/شمش/ارز با بها، مانده مشتریان → یک سند افتتاحیه. مدیر فروشگاه تازه تا راه‌اندازی یا «دفتر خالی» به این صفحه هدایت می‌شود.
- محصولات (`/books/products`): کاتالوگ هر فروشگاه (`settings.products`: محصول سفارشی با وزن و عیار، ترتیب، نام، پنهان، ارزهای پنهان) با `TRADE_COINS`/`shownCoins` در `coins.mjs`؛ سرور کاتالوگ را برای هر درخواست با AsyncLocalStorage می‌گذارد. کم و زیاد کردن موجودی فقط با «سند اصلاح موجودی» (`adjust`، پیشوند A، دلیل اجباری): کسری با میانگین بها زیان همان روز. تست: `tests/products.test.mjs`.

- هفت ابزار (`server/ideas.mjs`، صفحه `/books/smart`): قیمت قفل‌شده (`bk_quotes`، کد Q، ردیف معامله با `quote` باید دقیقاً همان قیمت/جهت/مشتری/مقدار باشد و یک بار)، هشدار نوسان (`/api/books/risk`، پوشش و قیمت شکست)، شناسنامه شمش (`bk_bar_cards`، dHash ۶۴بیتی + نقشه ۱۶×۱۶، اثر انگشت در مرورگر: `fingerprint` در `pages/smart.mjs`)، شمارش (`bk_counts`، ترازو با Web Serial و `public/js/scale.mjs`)، برگه ته حساب اشتراکی (`bk_shares`، توکن `<shop>~<rand>`، صفحه عمومی `/s/:token`، API `/api/public/statement/:token`)، پیش‌بینی نقدینگی (برداشت درون‌روزی روزهای هم‌نام هفته، چندک وزنی، بک‌تست)، بستن روز (`bk_closes`، رمز امضاکننده، زنجیره هش، امضای Ed25519 با کلید مهرشده فروشگاه؛ روز بسته سند نمی‌پذیرد تا مالک با دلیل باز کند). تست: `tests/ideas.test.mjs`.

- تطبیق با همکار (`server/peers.mjs`، صفحه `/books/peers`، API `/api/peers*` در سطح پلتفرم): دو فروشگاه روی همین سرور حسابی را که برای هم نگه می‌دارند با کد یک‌بارمصرف ۸ حرفی (۲۴ ساعت) وصل می‌کنند؛ ثبت در `peer_invites`/`peer_links` دیتابیس اصلی. قاعده: برای هر واحد مانده من + مانده او = ۰ (`comparePeer`؛ تلورانس گرم ۰٫۰۰۱۵)؛ ردیف‌های ۹۰ روز اخیر با واحد یکسان، مقدار قرینه و حداکثر ۳ روز فاصله جفت می‌شوند و باقی‌مانده «فقط در دفتر ما/همکار» است. فقط‌خواندنی؛ فقط مدیر/مالک. تست: `tests/peers.test.mjs`.
- راهنمای تصویری (`/help`، `pages/help.mjs`): ۲۲ فصل ویدیو از صفر تا صد در `public/media/tutorial/` (`NN.mp4`، `NN.webm`، `NN.jpg`، `chapters.json` با `width`/`height`/`codec` هر فصل). ساخت: `FILM=1 FFMPEG=… node scripts/tutorial.mjs` (`--only=3,4` برای چند فصل) مرورگر را با چگالی واقعی باز می‌کند (`--force-device-scale-factor`؛ میز ۱۹۲۰×۱۰۸۰، گوشی ۱۰۸۰×۲۳۳۸) و `scripts/screencast.mjs` هر فریم را تقریباً بی‌افت در `RAW` ضبط می‌کند؛ بعد `scripts/tutorial-film.mjs` کارت‌ها، صدا و یک بار کدگذاری H.264 و VP9 (spec 0025، اصلاحیه ۲؛ `tests/tutorial.test.mjs` سرآیند هر فیلم را با فهرست می‌سنجد). روایت با زیرنویس روی صفحه؛ داده نمونه فقط در سرور موقت اسکریپت ساخته می‌شود. سرور mp4/webm را با Range (206) سرو می‌کند (`parseRange`). با تغییر ظاهر صفحه‌های اصلی، فصل‌های مربوط را دوباره بسازید.

## لایه‌های پلتفرم (spec `docs/specs/0001-platform-layers.md`)
- **Gateway** (`server/index.mjs`): `x-request-id` (ورودی معتبر برگردانده می‌شود)، `Server-Timing`، سقف هر IP در دقیقه (`rateLimit`، پیش‌فرض ۱۵۰۰؛ `/api/health` معاف)، `requestId` در بدنه هر خطا، لاگ JSON برای ۵xx و درخواست کند (> ۱٫۵ ثانیه) و همه درخواست‌ها با `BEATRIS_ACCESS_LOG=1`.
- **Bus و صف** (`server/bus.mjs`، جدول `ops_jobs` در دیتابیس اصلی): `publish/subscribe` درون فرایند؛ `enqueue` با کلید یکتا، backoff نمایی ۲ ثانیه تا ۱۰ دقیقه، `dead` پس از آخرین تلاش، `every` با کلید بازه (اجرای تکراری ندارد). کارهای ثابت: `market.poll` هر دقیقه (فید با دوره خودش) که `market.tick` منتشر می‌کند، `ops.backup` روزانه. `server.startWorkers()` فقط در اجرای اصلی (نه تست).
- **متریک** (`server/metrics.mjs`): هر مسیر (شناسه‌ها به `:id`) تعداد، ۴xx، ۵xx، p50/p95 از مخزن ۵۱۲ تایی؛ شمارنده‌ها (`ai.*`، `market.poll.*`، `backup.ok`، `stream.opened`، `bus.errors`).
- **سلامت**: `/api/health` ساده؛ `/api/health?deep=1` دیتابیس، فید (`off|ok|stale` = ساکت‌تر از ۳ برابر دوره + ۲ دقیقه)، صف و آخرین پشتیبان؛ ۵۰۳ اگر دیتابیس قطع باشد.
- **پشتیبان و بازیابی** (`server/backup.mjs`): `VACUUM INTO` همه دیتابیس‌ها (اصلی + `tenants/*.db`) در `$BEATRIS_DATA_DIR/backups/<stamp>/`، بررسی `integrity_check`، ۱۴ نسخه آخر. بازیابی: سرویس را متوقف کنید، فایل `<stamp>/main.db` را روی `beatris-v2.db` و `<stamp>/t_….db` را روی `tenants/t_….db` کپی کنید، دوباره راه بیندازید و `/api/health?deep=1` و «وارسی دفتر» را ببینید.
- **عملیات** (`/ops`، فقط ارائه‌دهنده): `/api/ops/metrics`، `POST /api/ops/backup`، `POST /api/ops/jobs/:id/retry`، `GET/PUT /api/ops/flags`.
- **RBAC** (`server/rbac.mjs`): `capsOf(role, {main})` تنها جدول قابلیت‌ها؛ `caps` در `/api/me`. جداسازی فروشگاه‌ها = دیتابیس جدا.
- **پرچم‌ها** (`server/flags.mjs`، کلید `flags` در دیتابیس اصلی): `ai.external`، `ai.knowledge`، `peers`، `market.stream`، `books.replay`؛ ترتیب: فروشگاه ← همه ← پیش‌فرض؛ `flags` در `/api/me`.
- **قیمت زنده**: `GET /api/market/stream` (SSE، توکن در هدر؛ کلاینت `public/js/stream.mjs` با اتصال دوباره؛ میز معامله استفاده می‌کند و نظرسنجی دقیقه‌ای پشتیبان می‌ماند). حداکثر ۵۰۰ اتصال.
- **هوش مصنوعی**: `server/gateway.mjs` (timeout، یک تلاش دوباره روی 429/5xx، قطع‌کن مدار ۳ خطا → ۵ دقیقه، جدول `ai_usage` هر فروشگاه)؛ `server/guardrails.mjs` (پوشاندن موبایل/کارت/شبا/کد ملیِ نام‌دار برای سرویس بیرونی — مبلغ‌ها هرگز؛ نشانه تزریق؛ حذف کلید از خروجی)؛ `server/rag.mjs` (BM25 فارسی روی درس‌ها، SOPها، واژه‌نامه و فصل‌های راهنما؛ ابزار `search_knowledge` در دستیار و MCP)؛ پاسخ دستیار `trace` دارد (`tools`، `flags`، `redacted`).
- **بازپخش و بک‌تست**: `GET /api/books/replay` (مدیر؛ بازسازی ثبت‌ها از اسناد قطعی و مقایسه، فقط‌خواندنی)؛ `public/js/backtest.mjs` (اجرای سیگنال در باز شدن روز بعد، کارمزد هر طرف) → `GET /api/market/backtest` و ابزار MCP `strategy_backtest`.
- **CI** (`.github/workflows/beatris.yml` در ریشه مخزن): `npm run gate` سپس E2E با Playwright. **Evals**: `tests/evals.test.mjs` (بازیابی ≥ ۹۰٪، پوشاندن و تشخیص تزریق ۱۰۰٪).

## کنترل (spec `docs/specs/0002-control.md`)
- **موتورهای خالص** (`public/js`): `typed.mjs` (تصمیم نوع‌دار: softmax، `confidence` = (max−1/n)/(1−1/n)، `coverage`)، `calibration.mjs` (Platt با هدف هموار، AUC با رتبه میانگین، ECE، Brier؛ `calibrate` تقسیم قطعی و `helped` فقط اگر ECE نیمه آزمون بهتر شود)، `karat.mjs` (عیار ← خالص، ۷۵۰، مثقال ۷۰۵)، `lots.mjs` (سری‌ها و تخصیص FIFO هر فروش).
- **سرور** (`server/control.mjs`، ساخته در `books.mjs`): همه زیر `/api/books/control/`: `pulse`، `changes`(+`/seen`)، `exceptions`(+`/label`، `/calibration`؛ کالیبراسیون به `RULES_VERSION` بسته است)، `simulate`، `twin?day&compare`، `lots`، `story?party|unit`، `trial`، `forecast10`، `explain?metric`، `find`، `periods`(+`/lock`، `/unlock` فقط مالک با دلیل)، `approvals`(+`/rules`، `/:id/approve|reject`)، `autoclose`، `recon`. جداول `ctl_seen`، `ctl_exc`، `ctl_locks`، `ctl_approvals`، `ctl_recon`.
- **قلاب‌ها در ثبت سند**: `hooks.check` پیش از ذخیره (قفل ماه جلالی ← 423 برای ثبت، ویرایش، ابطال و پیش‌نویس؛ قاعده تأیید ← 428 با `approval {id,status,kind}`)، `hooks.commit` مصرف یک‌باره تأیید، `hooks.voiding` (ابطال؛ `dryRun` پیش از تراکنش تا درخواست تأیید rollback نشود). چهار چشم: تأییدکننده ≠ درخواست‌کننده؛ تأیید به هش محتوا بسته و ۲۴ ساعت معتبر؛ تکرار همان محتوا پس از تأیید خودکار عبور می‌کند.
- **بستن خودکار**: کار `books.autoclose` هر ۵ دقیقه روی همه فروشگاه‌ها؛ تطبیق و ثبت `ctl_recon`؛ اگر مغایرت نبود و روشن بود، `ideas.closeSystem` روز را با امضای «بستن خودکار» می‌بندد.
- **UI**: داشبورد `.gd-sig` (نبض + «چه تغییر کرد؟») بالای `.gd-charts`؛ صفحه `/books/control` (`pages/control.mjs`، زبانه‌ها با خط هدف و فیلم ۱۳–۱۷)؛ `explain.mjs` (هر `[data-explain]`)؛ `palette.mjs` (Ctrl/⌘+K یا «/»).

## استودیوی الیوت (spec `docs/specs/0003-elliott-studio.md`)
- `public/js/elliott.mjs` (خالص): `waveMap(bars, {degree, format})` → درجه بزرگ (بهترین شمارش معتبر `T.elliott` روی نردبان آستانه زیگزاگ ×۱٫۸ تا ×۷ پایه)، `subdivide` (کوچک‌ترین آستانه‌ای که دقیقاً ۴ یا ۲ نقطه درونی بدهد و قواعد را پاس کند)، فیبو از شروع شمارش تا اوج آن، کانال ۲–۴ و موازی از ۳، سناریوهای `typedChoice(['primary','alternative'])`، ناحیه‌ها و یادداشت‌ها؛ `resample(bars, 'W'|'M')` (هفته شنبه، ماه جلالی).
- `public/js/elliott-view.mjs`: canvas ترمینالی (DPR ≤ ۳، کشیدن، چرخ، دو انگشت، دوبار کلیک، کلیدها، `inset` برای کارت راهنما).
- `pages/elliott.mjs`: مسیرهای `/books/elliott` (با منوی حساب) و `/market/elliott`؛ پوسته تیره ثابت با توکن‌های `--ew-*`؛ حجم رسم نمی‌شود چون داده‌اش نیست. فیلم فصل ۱۸.

## هسته واحد و کیفیت (spec `docs/specs/0004-quality-core.md`)
- `core` در `server/books.mjs`: `rev/bump/memo`؛ هر مسیر نوشتنی books (جز `NO_LEDGER`) پس از اجرا `bump`؛ `core.events(upto, from)` اسناد قطعی پارس‌شده افزایشی (بر اساس `version|updated_at`)، `core.positions(day)`، `core.partyLabels()`، `core.priceKey()` (قیمت‌ها + `market.rev()`). اشیای مشترک را تغییر ندهید.
- مصرف‌کننده‌ها: `control.mjs` (`ctl.*`)، `dashboard.mjs` (`dash.*`)، ممیز سیستمی مشترک (`auditShared`). گرم‌کردن پس از نوشتن (۱٫۵ ثانیه، `BEATRIS_WARM`، در تست خاموش).
- `server/tz.mjs`: قالب‌بندهای تاریخ تهران یک بار ساخته می‌شوند. `replayLedger(db, cache)` افزایشی؛ `verifyLog({ full })`.
- دستیار: `intentOf` → `typedChoice` روی `INTENTS`؛ `localTyped` پاسخ و `intent` را می‌دهد.
- ابزار: `tests/fuzz.test.mjs` (مدل مستقل)، `scripts/bench.mjs` (بنچمارک ۲۰k سند).

## کارتخوان / PC-POS (spec `docs/specs/0005-pos-bridge.md`)
- **پل محلی** `desktop/windows/pos-bridge.ps1` (PowerShell 5.1 داخلی ویندوز): HTTP روی `127.0.0.1:8765`، فقط origin اپ (از `beatris.ini`) و Host محلی؛ هر تراکنش در runspace جدا، `pos-journal.jsonl` در `%LOCALAPPDATA%\Beatris`؛ شناسه تکراری = همان تراکنش. راه‌اندازها: `sep` (SSP1126 سامان، TCP ۱۱۹۷، ISO-8583 + MAC DES-CBC)، `command` (سداد/PSP دیگر با برنامه رابط رسمی)، `sim`.
- **مرورگر** `public/js/pos.mjs`: تنظیم هر رایانه در localStorage؛ میز (`desk.mjs` → `chargeModal`) پیش از ثبت، ردیف «کارتخوان» بی‌پیگیری را می‌فرستد؛ تأیید → RRN/کارت/پایانه روی پرداخت، سپس ثبت سند و اتصال تراکنش. وضعیت نامعلوم → ورود دستی شماره پیگیری از رسید.
- **سرور** `server/pos.mjs`: `bk_pos` و `GET/POST /api/books/pos` برای تطبیق؛ تأییدشده بی‌سند = هشدار در میز؛ سند با همان RRN خودکار وصل می‌شود. منطق حسابداری دست نخورده.
- آزمون: `tests/pos.test.mjs` (فریم واقعی سامان، پل واقعی با `pwsh` در برابر پایانه شبیه‌سازی‌شده `tests/helpers/ssp1126.mjs`)، e2e مرحله `pos`.
- **پرداخت یک‌کلیکی و پیشخوان (spec `0035`):**
  - **دکمه:** «پرداخت با کارتخوان» در میز (`#bar` و `.dk-save`، `Alt+K`) و فاکتور فروش، `calc.credit` (ریال صحیح) را روی ردیف کارتخوانِ باز می‌گذارد، شارژ می‌کند و ثبت می‌کند.
  - **پنجره:** پنجره کارتخوان یکی است: `cardWindow` در `pos.mjs`.
  - **حالت‌های دستگاه:**
    - `on`: پل همین رایانه؛
    - `station`: همین رایانه پرداخت گوشی‌ها را هم می‌گیرد؛ حلقه `initPosStation` هر حدود ۱ ثانیه `POST /api/books/pos/station` می‌زند، درخواست را برمی‌دارد، به پل می‌دهد و هر گام را به `/api/books/pos/requests/:id/result` گزارش می‌کند؛ نشان `.pos-station` وضعیت را نشان می‌دهد؛
    - `relay`: دستگاه بی‌کارتخوان `POST /api/books/pos/requests` می‌سازد و همان پنجره را دنبال می‌کند.
  - **سرور:** جدول‌های `bk_pos_req` و `bk_pos_station`.
    - پیشخوانِ روشن یعنی دیده‌شده در ۸ ثانیه اخیر؛
    - درخواستِ برداشته‌نشده پس از ۶۰ ثانیه منقضی می‌شود؛
    - درخواستِ ساکت پس از ۴۵ ثانیه «نامعلوم» می‌شود، هرگز «رد»؛
    - فقط پیشخوانِ برداشته گزارش می‌دهد و تأیید نهایی است؛
    - حالت نهایی در `bk_pos` به نام درخواست‌کننده ثبت می‌شود.
  - **آزمون:** `tests/posrelay.test.mjs` و e2e مرحله `pos` (یک‌کلیک، گوشی از راه پیشخوان، فاکتور).

## ظاهر و کاتالوگ (spec `docs/specs/0006-calm-ui.md`)
- لایه‌های آخر `app.css`: «نظام یکدست» و «ساده و تخت» (یک سطح کادر). منوی حسابداری `booksNav` در `pages/books.mjs`.
- حرکت یکدست (spec 0039):
  - **توکن‌ها** در نخستین `:root` از `app.css`:
    - مدت: `--t-press` ۱۴۰، `--t-hover` ۱۸۰، `--t-ui` ۲۴۰، `--t-page` ۲۸۰، `--t-panel` ۳۲۰، `--t-reveal` ۵۶۰ و `--t-slow` ۹۰۰ میلی‌ثانیه، و گام پلکانی `--t-stagger` ۳۰ (حداکثر ۱۲ گام)؛
    - منحنی: `--ease-out`، `--ease-in-out` و `--ease-exit`. `--ease`، `--spring`، `--lt-spring` و `--lt-soft` همه همان `--ease-out` بی‌جهش‌اند.
  - **لایه‌ی آخر `app.css`** («یکپارچگی حرکت»):
    - ورود دیالوگ (`u-veil` و `u-dialog`)، و پالت و منوی کار (`u-drop`)؛
    - پیام کوتاه در زمان پنل، و تاشوها با `::details-content`؛
    - یک فشار (`--press`)؛
    - نشستن رقمِ عوض‌شده (`u-snap`): `desk.mjs` و `sell.mjs` کلاس `snap` را فقط وقتی خالص یا مبلغ قابل پرداخت عوض شود می‌گذارند؛
    - یک قاعده‌ی سراسری «حرکت کمتر».
  - **hover:** hoverی که خودِ عنصر را تغییر می‌دهد درون `@media (hover: hover)` است. hoverی که چیزی را نشان می‌دهد بیرون می‌ماند.
  - **آزمون‌ها:**
    - `tests/motion.test.mjs` همه را نگه می‌دارد. حلقه‌ها، منحنی‌های ویژه و حرکت‌های چیدمانی هر کدام فهرستی بسته با دلیل دارند.
    - e2e: «motion (spec 0039)» و «every route at both widths in both skins».
- بلوک‌های تعاملی (spec 0040): `public/js/blocks.mjs`، با بخش خالصش در `blockmath.mjs` (`tests/blocks.test.mjs`):
  - `dropzone(input)`: فایلِ رهاشده همان `files` و رویداد `change` ورودی می‌شود. جاها: عکس مرجع سکه، و فایل CSV/TXT صورتحساب در `/books/bank/:id` (UTF-8، وگرنه windows-1256).
  - `initHold()` در `app.mjs` و `held(b)`: دکمه‌ی `data-hold` فقط با نگه داشتن ۹۰۰ میلی‌ثانیه‌ای (`--t-hold`) یا نگه داشتن Enter/Space کار می‌کند. ضربه‌ی کوتاه پیام «نگه دارید» می‌دهد و کلیک دست به صفحه نمی‌رسد. هر حذفی که پیش‌تر `confirmBox` داشت و دلیل نمی‌خواست، حالا `data-hold` است.
  - `slideConfirm(btn)`: روی `(pointer: coarse) and (max-width: 700px)` دکمه پنهان می‌شود و دستگیره جایش می‌نشیند؛ کشیدن تا ۹۰٪ همان دکمه را می‌زند. جاها: «ثبت سند» میز (و «ثبت» نوار پایینش فقط دستگیره را نشان می‌دهد) و «ثبت فروش».
  - `signaturePad(canvas)` و `public/js/signdoc.mjs`: امضای مشتری روی سند قطعی، `PUT /api/books/docs/:id/signature` (PNG تا ۲۰۰KB، بدنه تا ۴۰۰KB)، جدول `bk_signatures`، رویداد `doc.sign` با هش PNG در زنجیره. جایگزینی فقط با مدیر. در چاپ (`invoice.mjs`، `sigImg`) در کادر مشتری می‌آید. آزمون: `tests/signature.test.mjs`.
  - `rollTo(el, figure)`: فقط رقم‌های عوض‌شده می‌غلتند. عدد کامل در `.sr` است و واحد بیرون از آن.
  - کد امضای بستن روز در `smart.mjs` همان `codeBox` ورود است (`#clCode`).
- ویترین سکه‌ها (spec 0041)، `/coins/showcase`:
  - **بخش خالص** `public/js/showcasemath.mjs` (`tests/showcase.test.mjs`):
    - `ringPos`: جای کارت روی حلقه؛ طول حلقه دقیقاً N گام است.
    - `pose`: وضع کارت؛ در RTL با `dir = -1`.
    - `entrance`: ورود پلکانی از وسط.
    - `step`: لختی و جاافتادن، مستقل از نرخ فریم. هر فریم برای طول واقعی خودش حل می‌شود، تا نیم ثانیه؛ دستگاه کند هم در همان زمان می‌رسد (اصلاحیه‌ی spec 0041).
    - `copiesFor`: تعداد تکرار کارت‌ها برای پر کردن صفحه.
    - `cardSize`: اندازه‌ی کارت با جای زیر هیرو؛ گوشی اندازه‌ی خود را نگه می‌دارد.
    - `flipFrom`: پرواز کارت به پنجره.
    - `COIN_SYMBOL` و `alertFor`: نماد قیمت سکه و هشدار.
  - **صفحه** `pages/coinshowcase.mjs`:
    - عکس‌ها از `/api/coin-photos` می‌آیند: عکس کوچک گرد `-s.webp`، و برای عکس بارگذاری‌شده `c2` با ماسک گرد. قیمت از `/api/market` است.
    - حرکت با rAF است و فقط وقتی چیزی حرکت می‌کند و صفحه دیده می‌شود.
    - `.cs-ring` ضربه نمی‌گیرد (`pointer-events: none`). کارت وسط در صفحه‌ی خود حلقه (z = 0) است و حلقه‌ای که ضربه بگیرد گاهی ضربه‌ی روی آن کارت را می‌گیرد.
    - «خبرم کن» هشدار را در `beatris.market.alerts` می‌گذارد، همان فهرست صفحه‌ی بازار.
  - **عکس کوچک:** `node scripts/coin-photos.mjs --thumbs` فقط `-s.webp` می‌سازد و کلید `s` را به manifest می‌افزاید. خط لوله‌ی کامل هم `s` را می‌سازد.
  - **e2e:** مرحله‌ی «coin showcase (spec 0041)» در بلوک گوشی است. کارت با `mouse.click` روی جای خودش زده می‌شود، نه با locator، چون اسکرول نرم و تلاش دوباره‌ی Playwright روی عنصر سه‌بعدی ضربه را جابه‌جا می‌کند.
- `public/js/deskproducts.mjs`: جستجو، ساخت/ویرایش/حذف و قالب‌ساز محصول در میز؛ داده از `/api/books/products` (فیلد `group`).
- `scripts/compare-video.mjs`: ویدیوی مقایسه با نسخه پایه مارکیز (فقط منابع عمومی؛ «ذکر نشده» به‌جای «ندارد»).

## استودیو جواهرسازی (spec `docs/specs/0007-jewel-cad.md`)
- `public/js/three/jewelcad.mjs` روی `jewelry.mjs`: قطعه‌های تازه (کتدرال، سه‌نگین، رکاب پیشرفته، پاوه رکابی/سطحی، آویزگیر، مهره، طنابی، راهگاه، میل‌گرین)، تحلیل (`thickness` جزء‌به‌جزء، `stonesOf`/`collisions`، `ringSize`). `jewelry.mjs`: تراش‌های باگت/کابوشن/مروارید، ۱۰ نوع نشاندن (`SETTINGS`)، `pipeVar` (لوله با مقطع متغیر).
- `pages/studio3d.mjs`: گروه «ابزارهای ساخت» (تکثیر، جفت، آرایه دایره‌ای/خطی، ضخامت، برخورد، راهگاه، گزارش CSV، جبران انقباض در STL).

## پلتفرم عامل‌ها و استودیو (spec `docs/specs/0015-agentic-accounting-training.md` و `0016-agent-platform-studio.md`)
- پلتفرم مشترک `server/agent-platform/`: رجیستری (ابزار مجاز، سیاست تأیید، حوزه حافظه، مقصد واگذاری؛ تعریف نادرست هنگام شروع رد می‌شود)، runtime (حالت‌های `queued…cancelled`، بازپخش گام‌ها، تأیید چهارچشم، تلاش دوباره محدود، واگذاری با عمق ۳ و بدون چرخه به‌صورت اجرای فرزند، رویدادهای `agent.*`)، provider و `structured()` (JSON معتبر، ترمیم محدود، رد).
- عامل‌ها: `server/agents/agents.mjs` (حسابداری و curriculum)، `server/studio/agents.mjs` (studio-design، rhino-cad، manufacturing، training-tutor، assessment)؛ ترکیب و روال/ماشه در `server/agents/index.mjs`.
- موتور استودیو قطعی در `public/js/studio/` (واحد، هندسه، آلیاژ، بریف، نگین، یافته ساخت جدا از نقد زیبایی، بهینه‌سازی وزن، مرز CAD)؛ مدل زبانی هرگز عدد نمی‌دهد. Rhino واقعی فقط خروجی `.3dm` مرورگر است؛ آداپتور RhinoCommon/Compute پیاده نشده.
- صفحه‌ها: `/train/accounting`، `/train/team`، `/studio/coach`، `/agents` (مدیر). تست‌ها: `agents`، `studio-engine`، `studioapi`، `trainingapi`.

## میز فروش زنده و فضای کار هر نقش (spec `docs/specs/0037-live-sales-desk.md` و `0038-role-workspaces.md`)
- **موتور خالص** `public/js/sell.mjs` (بی‌DOM، روی `calcLine`/`calcDoc` همان موتور حسابداری):
  - `lineFromItem`، `priceOf`، `totals`، `docOf`؛
  - سناریوهای «اگر…؟» (`SCENARIOS`: ۳٪ تخفیف، اجرت نصف، بدون سود، گرد به میلیون پایین، طلا ±۱٪). تخفیف فقط از اجرت و سود کم می‌شود و ارزش طلا دست نمی‌خورد. بی‌اجازه‌ی تخفیف، سناریو `needsManager` دارد و اعمال نمی‌شود؛
  - `budget` (کمترین تخفیف تا بودجه‌ی مشتری، یا کف ممکن)؛
  - `suggest` (مکمل از `COMPLEMENT`، جایگزین هم‌قالب ±۲۵٪ وزن، سلیقه‌ی مشتری اول)؛
  - `compare` (تا ۴ قطعه)؛
  - `customerView` و `shareText` (بی‌درصد سود).
  - آزمون: `tests/sell.test.mjs`.
- **صفحه** `/books/sell` (`pages/sell.mjs`):
  - مشتری با `F3` و پرونده‌ی سریع از `GET /api/books/parties/:id/profile` (خرید، جمع، میانگین، سلیقه‌ی گروه‌ها، وزن معمول، مانده، آخرین قطعه‌ها)؛
  - ویترین با نام یا بارکد (`F2`، Enter)، مقایسه، سبد با اجرت/سود/تخفیف طبق `staffCanEditPrice`/`staffCanDiscount`، معاوضه (خط `used` سمت `in`)، بودجه و پرداخت چندروشی؛
  - ثبت با `Ctrl+Enter` از همان outbox (`submit`) و کارتخوان spec 0035؛ رزرو = پیش‌فاکتور (`proforma`) که قطعه را `reserved` می‌کند.
  - پیش‌نویس سبد در `drafts('sell')` می‌ماند.
- **صفحه‌ی مشتری** `/books/sell/screen` (`pages/sellscreen.mjs`، عمومی و بی‌قاب): فقط از `BroadcastChannel('beatris-sell')` همین دستگاه می‌خواند (`ask` → `cart`/`idle`/`done`)؛ چیزی نمی‌گیرد و نگه نمی‌دارد. پس از فروش، «سپاس» تا قطعه‌ی بعدی یا ۴۵ ثانیه می‌ماند.
- **فضای کار** `public/js/workspace.mjs` (مشترک سرور و مرورگر):
  - `ACTIONS` و `PROFILES` (رئیس، اپراتور، فروشنده، کارمند)؛
  - `DEFAULT_BY_ROLE`، `normalizeWorkspace`، `cleanWorkspace`، `reachable` (میان‌برِ مدیریتی برای غیرمدیر هرگز نشان داده نمی‌شود).
  - سرور: ستون `users.workspace_json`؛ `GET /api/me` کلید `workspace` را برمی‌گرداند؛ `PUT /api/me/workspace`؛ `PUT /api/team/:id/workspace` (مدیر؛ فضای مالک فقط با خود مالک).
  - مرورگر: ورود به `/start` می‌رود و آن به `workspace.start`؛ `/work` (`pages/work.mjs`) خانه‌ی هر نیمرخ است؛ منوی `.tb-work` در نوار بالا؛ `body.dense` برای تراکم فشرده؛ انتخابگر `wsform.mjs` در «من» و «تیم».
  - نیمرخ هیچ مجوزی نمی‌دهد. آزمون: `tests/workspace.test.mjs` و e2e مرحله‌ی `live sales desk`.

## پیش‌نویس و صف ارسال (spec `docs/specs/0013-operator-flow.md`)
- `public/js/outbox.mjs`: `drafts` (IndexedDB، و localStorage اگر نبود) و `submit` با `clientKey`. سرور همان کلید را همان سند برمی‌گرداند (`replayed`).
- فرم سند (`pages/bookdoc.mjs`):
  - کلید یکتا از شروع سند در حالت فرم است و با پیش‌نویس `doc:<type>` ذخیره می‌شود. «شروع تازه» کلید تازه می‌گیرد.
  - پس از ثبت، فرم منتظر می‌ماند تا پیش‌نویس پاک شود و بعد به صفحه‌ی سند می‌رود (اصلاحیه‌ی 2026-10-22).
  - پیش‌نویسی که پس از ثبت برگردد، سند دوم نمی‌سازد. آزمون: مرحله‌ی «drafts» در E2E.

## نسخه‌ی تازه روی صفحه‌های باز (spec `docs/specs/0036-fresh-build.md`)
- `server/build.mjs`: `BUILD` از `BEATRIS_BUILD`، `RAILWAY_GIT_COMMIT_SHA`، `RENDER_GIT_COMMIT` یا `RAILWAY_DEPLOYMENT_ID`؛ در `/api/health` (ساده و `deep=1`).
- `public/js/fresh.mjs`: هنگام آمدن به صفحه، بازگشت به برگه و هر ۵ دقیقه مقایسه می‌کند. صفحه‌ی ورودِ دست‌نخورده خودش بازخوانی می‌شود؛ صفحه‌ی کاری فقط نوار «به‌روزرسانی» نشان می‌دهد.

## استقرار (سرور دائمی، نه serverless)
- **پروداکشن روی Render** (از ۳۰ مهر ۱۴۰۵؛ Railway دیگر commitهای تازه را دیپلوی نمی‌کرد):
  - https://beatris-6u77.onrender.com، service `beatris` (`srv-dbd36u7avr4c7399qkf0`)، فرانکفورت، پلن starter؛
  - شاخه `claude/vercel-deployment-pj3uux`. سرویس با نشانی عمومی مخزن ساخته شد و Render برای چنین سرویسی با push دیپلوی نمی‌کند («Auto-deploys require a connected Git provider»). تا GitHub در Account Settings ← Git Deployment Credentials وصل و برای سرویس انتخاب نشده، دیپلوی دستی است (Manual Deploy، یا `trigger_deploy` در connector)؛
  - با connector ساخته شد، نه Blueprint: build `cd beatris && npm install --omit=dev --no-audit --no-fund`، start `cd beatris && npm start`؛
  - دیسک `/data` و Health Check Path را فقط داشبورد Render می‌گذارد. تا دیسک وصل نشده، `BEATRIS_DATA_DIR=/opt/render/project/src/beatris-data` است و هر دیپلوی داده را پاک می‌کند؛
  - نشانی و QR تیزر و اینفوگرافیک، و نصب‌کننده‌ی ویندوز (`desktop/windows`) به همین نشانی اشاره می‌کنند.
- **Railway (پیشین)**: ساخت `600938a` را با داده‌ی خودش نگه می‌دارد.
- project `goldsuite`: `5fe1b94c-fe29-469e-83d0-4bc600a92d69`، service `beatris`: `f9c9c93a-747c-42df-96c6-64ad1c69e08d`
- سرویس به ریپوی `Mhraakk/Lucifuzi` با Root Directory `/beatris` وصل است؛ هر push روی شاخه متصل خودکار دیپلوی می‌شود.
- Volume دائمی روی `/data` (دیتابیس `beatris-v2.db`)؛ هرگز حذف نشود.
- متغیرها: `BEATRIS_DATA_DIR=/data`، `BEATRIS_TOKEN_SECRET`، `NODE_ENV=production`، `PORT=8080`.
- **Blueprint برای Render** (`render.yaml` در ریشه‌ی مخزن): همان سرویس با `rootDir: beatris`، `npm start`، سلامت `/api/health`، دیسک پایدار ۲ گیگابایتی روی `/data` (نیازمند پلن پولی) و Node 22.
  - `BEATRIS_TOKEN_SECRET` را Render خودش می‌سازد.
  - `BEATRIS_SUPABASE_URL`، `_KEY`، `BEATRIS_OWNER_EMAIL`، `BEATRIS_OWNER_PHONE` و `BEATRIS_OWNER_NAME` یک بار هنگام ساخت Blueprint پرسیده می‌شوند. حساب مالک اصلی از `BEATRIS_OWNER_PHONE` ساخته می‌شود (`seedUsers`)؛ بدون آن سرویس تازه هیچ کاربری ندارد.
  - شناسه‌ی نسخه از `RENDER_GIT_COMMIT` می‌آید (spec 0036).
  - سرویس تازه با دیسک خالی شروع می‌شود؛ داده‌ی Railway روی volume خود Railway می‌ماند.

## قواعد
- UI کاملاً فارسی و RTL؛ ارقام فارسی در نمایش.
- مالیات ۱۴۰۵ = ۱۰٪ فقط روی اجرت + سود؛ اصل طلا معاف.
- وابستگی runtime اضافه نکن مگر ضروری.
