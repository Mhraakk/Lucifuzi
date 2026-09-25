/**
 * Atelier arsenal — real tools, bells/alarms, materials for design, melt,
 * coin pack/repair, gold assay, and dollar anti-counterfeit lighting.
 * Catalog facts for training — not fabricated inventory counts.
 */

export type ArsenalCategoryId =
  | "design"
  | "melt"
  | "coin_pack"
  | "coin_repair"
  | "gold_assay"
  | "dollar_auth"
  | "safety";

export type ArsenalItem = {
  id: string;
  categoryId: ArsenalCategoryId;
  titleFa: string;
  purposeFa: string;
  /** How staff use it on the floor / bench */
  howFa: string;
  /** Safety / integrity note */
  cautionFa: string;
  /** Typical materials / consumables */
  materialsFa: string[];
  /** US / CH / EU practice cue */
  standardCueFa: string;
};

export type ArsenalCategory = {
  id: ArsenalCategoryId;
  titleFa: string;
  shortFa: string;
  promiseFa: string;
  accent: string;
};

export const ARSENAL_CATEGORIES: ArsenalCategory[] = [
  {
    id: "design",
    titleFa: "طراحی و کارگاه فرم",
    shortFa: "قلم، گیره، فرم‌دهی",
    promiseFa:
      "ابزار طراحی و ساخت ذهنی/دستی قطعه — از اسکیس تا موم و فلز خام.",
    accent: "#b8954a",
  },
  {
    id: "melt",
    titleFa: "ذوب و ریخته‌گری",
    shortFa: "کوره، بوته، قالب",
    promiseFa:
      "لوازم ذوب طلای شکسته/آب‌شده و ریختن شمش یا شمشچه با کنترل عیار.",
    accent: "#8a5a2b",
  },
  {
    id: "coin_pack",
    titleFa: "بسته‌بندی سکه",
    shortFa: "کپسول، کارت، پلمب",
    promiseFa:
      "محافظت، نمایش و پلمب سکه بانکی/سرمایه‌ای برای ویترین و تحویل مشتری.",
    accent: "#6b5a3e",
  },
  {
    id: "coin_repair",
    titleFa: "تعمیر و احیای سکه",
    shortFa: "تمیزکاری کنترل‌شده",
    promiseFa:
      "ابزار محدود تعمیر ظاهری — بدون مخدوش کردن ارزش کلکسیونی یا عیار.",
    accent: "#7a6848",
  },
  {
    id: "gold_assay",
    titleFa: "صحت‌سنجی طلا",
    shortFa: "محک، اسید، XRF",
    promiseFa:
      "تشخیص طلا بودنِ شکسته، دست‌دوم یا هر محصول مشکوک — قبل از خرید/ذوب.",
    accent: "#c9a24a",
  },
  {
    id: "dollar_auth",
    titleFa: "صحت‌سنجی دلار و اسکناس",
    shortFa: "نور UV و مغناطیس",
    promiseFa:
      "نور مخصوص جعل دلار، ذره‌بین و آزمون لمسی — فقط برای اسکناس مشکوک روی میز.",
    accent: "#3d5a4a",
  },
  {
    id: "safety",
    titleFa: "ایمنی و هشدار",
    shortFa: "زنگ، تهویه، PPE",
    promiseFa:
      "زنگ اضطراری، تهویه اسید/ذوب، دستکش و پروتکل دو نفره کنار کوره و گاوصندوق.",
    accent: "#5c4033",
  },
];

export const ARSENAL_ITEMS: ArsenalItem[] = [
  /* —— Design —— */
  {
    id: "des_sketch",
    categoryId: "design",
    titleFa: "کاغذ اسکیس / قلم طراحی جواهر",
    purposeFa: "ثبت ایده فرم، نگین و تناسب قبل از ورود به فلز.",
    howFa:
      "نسبت حلقه/شانه را مثل مطالعه فرم مجسمه بکشید؛ سپس به موم یا استودیو ۳D ببرید.",
    cautionFa: "اسکیس جایگزین اندازه‌گیری وزن و عیار نیست.",
    materialsFa: ["کاغذ گرم‌رنگ", "مداد سخت/نرم", "خط‌کش حلقه"],
    standardCueFa: "نگاه طراحی ایتالیایی + سواد محصول GIA/CIBJO",
  },
  {
    id: "des_ring_stick",
    categoryId: "design",
    titleFa: "میله سایز انگشتر (Ring Stick) و گیج",
    purposeFa: "اندازه‌گیری دقیق سایز برای ساخت یا اصلاح.",
    howFa: "سایز را دو بار بگیرید؛ برای دست‌دوم با مشتری در حضور ثبت کنید.",
    cautionFa: "سایز اشتباه = بازگشت و شکایت — سند پذیرش لازم است.",
    materialsFa: ["میله فولادی مدرج", "گیج پلاستیکی/فلزی"],
    standardCueFa: "ISO ring size mapping در دفاتر گالری",
  },
  {
    id: "des_files",
    categoryId: "design",
    titleFa: "سوهان جواهر (Needle files) و سمباده",
    purposeFa: "صاف‌کاری لبه، پخ، و آماده‌سازی جوش.",
    howFa: "از درشت به نرم؛ روی مخمل تمیز کار کنید تا خراش اضافه نماند.",
    cautionFa: "سوهان روی سکه بانکی کلکسیونی ممنوع مگر دستور مدیر.",
    materialsFa: ["سوهان نیم‌گرد", "سمباده ۴۰۰–۱۲۰۰", "پارچه جلا"],
    standardCueFa: "Swiss bench discipline — حداقل براده، حداکثر کنترل",
  },
  {
    id: "des_pliers",
    categoryId: "design",
    titleFa: "انبردست جواهر (flat / round / chain-nose)",
    purposeFa: "خم زنجیر، باز کردن حلقه اتصال، تنظیم قفل.",
    howFa: "فک را با نوار محافظ بپوشانید تا اثر گاز روی طلا نماند.",
    cautionFa: "فشار زیاد = ترک روی کارشده نازک.",
    materialsFa: ["انبردست سه‌تایی", "نوار محافظ فک"],
    standardCueFa: "ابزار نیمکت استاندارد جواهرسازی",
  },
  {
    id: "des_mandrel",
    categoryId: "design",
    titleFa: "ماندرل حلقه و چکش فرم",
    purposeFa: "گرد کردن و سایز کردن حلقه روی ماندرل.",
    howFa: "ضربه یکنواخت؛ بعد از فرم، وزن و عیار را دوباره ثبت کنید.",
    cautionFa: "چکش سخت روی نگین‌دار ممنوع.",
    materialsFa: ["ماندرل فولادی", "چکش پلاستیکی/برنجی"],
    standardCueFa: "کارگاه اروپا — فرم قبل از جلا نهایی",
  },
  {
    id: "des_wax",
    categoryId: "design",
    titleFa: "موم مدل‌سازی و کاتر موم",
    purposeFa: "پروتوتایپ سه‌بعدی قبل از ریخته‌گری.",
    howFa: "مدل موم را با وزن تقریبی تخمین بزنید؛ سپس به ذوب/ریخته‌گری بسپارید.",
    cautionFa: "موم قابل احتراق — دور از شعله باز ذوب نگهداری شود.",
    materialsFa: ["موم سخت/نرم", "تیغ موم", "چراغ الکلی کوچک"],
    standardCueFa: "مسیر lost-wax در کارگاه‌های معتبر",
  },
  {
    id: "des_loupe",
    categoryId: "design",
    titleFa: "ذره‌بین ۱۰× جواهر (Loupe)",
    purposeFa: "بررسی جوش، خراش، نگین، مهر عیار.",
    howFa: "نور روز یا لامپ سفید؛ مهر را قبل از خرید دست‌دوم بخوانید.",
    cautionFa: "لوپ جایگزین XRF یا اسید محک نیست.",
    materialsFa: ["لوپ ۱۰×", "پارچه میکروفایبر"],
    standardCueFa: "GIA loupe discipline",
  },

  /* —— Melt —— */
  {
    id: "melt_furnace",
    categoryId: "melt",
    titleFa: "کوره ذوب رومیزی / القایی",
    purposeFa: "ذوب طلای شکسته، آب‌شده و قراضه برای شمش.",
    howFa:
      "فقط با مجوز مدیر و کنترل دو نفره؛ وزن ورودی/خروجی و عیار هدف ثبت شود.",
    cautionFa: "بدون PPE و تهویه روشن نکنید؛ فلز مذاب خطر سوختگی شدید دارد.",
    materialsFa: ["کوره", "بوته گرافیت/سرامیک", "انبر بوته", "قالب شمش"],
    standardCueFa: "Dual control + وزن‌کشی دوبل قبل/بعد ذوب",
  },
  {
    id: "melt_crucible",
    categoryId: "melt",
    titleFa: "بوته ذوب و انبر نسوز",
    purposeFa: "نگهداری مذاب هنگام ریختن در قالب.",
    howFa: "بوته خشک و پیش‌گرم؛ انبر فقط با دستکش نسوز.",
    cautionFa: "بوته ترک‌دار = نشت مذاب — قبل از هر شیفت بازرسی کنید.",
    materialsFa: ["بوته", "انبر بلند", "دستکش آلومینیومی/نسوز"],
    standardCueFa: "چک‌لیست ایمنی روزانه کارگاه",
  },
  {
    id: "melt_flux",
    categoryId: "melt",
    titleFa: "فلاکس ذوب (بوراکس و مواد کمکی)",
    purposeFa: "جداسازی ناخالصی و روان کردن مذاب.",
    howFa: "مقدار طبق دستور کارگاه؛ باقی‌مانده سرباره را جدا و ثبت کنید.",
    cautionFa: "استنشاق دود فلاکس ممنوع — هود روشن باشد.",
    materialsFa: ["بوراکس", "ظرف دوزینگ", "ماسک"],
    standardCueFa: "مستندسازی مواد مصرفی ذوب",
  },
  {
    id: "melt_mold",
    categoryId: "melt",
    titleFa: "قالب شمش / شمشچه",
    purposeFa: "شکل‌دهی خروجی ذوب برای توزین و فروش.",
    howFa: "قالب گرم و تمیز؛ پس از سرد شدن، وزن و برچسب عیار بزنید.",
    cautionFa: "ریختن در قالب مرطوب = پاشش خطرناک.",
    materialsFa: ["قالب چدنی/گرافیت", "روغن قالب در صورت نیاز"],
    standardCueFa: "برچسب وزن+عیار روی هر شمش خروجی",
  },
  {
    id: "melt_scale",
    categoryId: "melt",
    titleFa: "ترازوی دقیق کارگاه (۰٫۰۱g)",
    purposeFa: "توزین ورودی قراضه و خروجی شمش.",
    howFa: "کالیبراسیون صبحگاهی؛ اختلاف وزن را در دفتر ذوب بنویسید.",
    cautionFa: "ترازوی ویترین با ترازوی ذوب قاطی نشود.",
    materialsFa: ["ترازو", "وزنه‌های کالیبر", "دفتر ثبت"],
    standardCueFa: "قابلیت ردیابی وزن — FTC-style transparency",
  },

  /* —— Coin packaging —— */
  {
    id: "pack_capsule",
    categoryId: "coin_pack",
    titleFa: "کپسول سکه (Coin capsule)",
    purposeFa: "محافظت از سطح سکه بانکی در برابر خراش و رطوبت.",
    howFa: "سایز کپسول = قطر سکه؛ با دستکش نخی ببندید.",
    cautionFa: "کپسول تنگ ممکن است لبه را فشار دهد — سایز درست انتخاب کنید.",
    materialsFa: ["کپسول شفاف", "دستکش نخی"],
    standardCueFa: "بسته‌بندی سرمایه‌ای استاندارد صرافی/گالری",
  },
  {
    id: "pack_card",
    categoryId: "coin_pack",
    titleFa: "کارت / هولدر سکه و پلمب",
    purposeFa: "نمایش ویترین + پلمب فروشگاهی برای اطمینان مشتری.",
    howFa: "برچسب وزن، عیار/نقش، شماره پلمب؛ پلمب فقط با مهر شعبه.",
    cautionFa: "پلمب بازشده = سکه از چرخه ویترین خارج تا بررسی مدیر.",
    materialsFa: ["هولدر مقوایی", "پلمب پلاستیکی/سربی", "برچسب"],
    standardCueFa: "زنجیره امانت — شماره پلمب در سیستم",
  },
  {
    id: "pack_foam",
    categoryId: "coin_pack",
    titleFa: "فوم و جعبه تحویل سکه",
    purposeFa: "حمل امن تا صندوق یا مشتری.",
    howFa: "سکه کپسول‌شده داخل فوم؛ فاکتور جدا در جیب بیرونی.",
    cautionFa: "هرگز سکه و وجه نقد را در یک پاکت بدون تفکیک نگذارید.",
    materialsFa: ["فوم برش‌خورده", "جعبه هدیه‌ای", "برچسب شکننده"],
    standardCueFa: "SOP تحویل سرمایه‌ای",
  },
  {
    id: "pack_gloves",
    categoryId: "coin_pack",
    titleFa: "دستکش نخی / لاتکس بدون پودر",
    purposeFa: "جلوگیری از اثر انگشت روی سکه براق.",
    howFa: "قبل از لمس سکه بانکی همیشه دستکش؛ تعویض بین مشتری‌ها.",
    cautionFa: "دستکش آلوده اسید محک را نزدیک سکه نبرید.",
    materialsFa: ["دستکش نخی", "دستکش نیتریل"],
    standardCueFa: "پروتکل هندلینگ سکه بانکی",
  },

  /* —— Coin repair —— */
  {
    id: "crep_cloth",
    categoryId: "coin_repair",
    titleFa: "پارچه جلای مخصوص سکه",
    purposeFa: "تمیزکاری سطحی ملایم بدون سایش مخرب.",
    howFa: "فقط روی سکه‌های غیرکلکسیونی طبق دستور مدیر؛ یک جهت بکشید.",
    cautionFa: "پولیش تهاجمی ارزش کلکسیون را نابود می‌کند — ممنوع بدون مجوز.",
    materialsFa: ["پارچه میکروفایبر جواهر", "محلول ملایم تأییدشده"],
    standardCueFa: "حداقل مداخله روی سکه بانکی",
  },
  {
    id: "crep_ultrasonic",
    categoryId: "coin_repair",
    titleFa: "حمام اولتراسونیک ملایم (در صورت تجهیز شعبه)",
    purposeFa: "زدودن چربی سطحی از سکه غیرحساس.",
    howFa: "زمان کوتاه، محلول تأیید کارگاه؛ بعد خشک‌کردن کامل قبل از کپسول.",
    cautionFa: "برای سکه‌های پتینه‌دار/کلکسیونی خاموش بماند.",
    materialsFa: ["دستگاه اولتراسونیک", "محلول خنثی", "سینی خشک‌کن"],
    standardCueFa: "فقط با چک‌لیست نوع سکه",
  },
  {
    id: "crep_edge",
    categoryId: "coin_repair",
    titleFa: "گیره نرم و ابزار لبه",
    purposeFa: "صاف کردن خم جزئی لبه (غیر بانکی حساس) با مجوز.",
    howFa: "فشار کم؛ قبل/بعد عکس و ثبت در پذیرش تعمیر.",
    cautionFa: "هرگونه حک یا سوهان روی سکه بانکی = تخلف داخلی.",
    materialsFa: ["گیره روکش‌دار", "چکش پلاستیکی کوچک"],
    standardCueFa: "پذیرش تعمیر اسنادی قبل از هر کار فیزیکی",
  },

  /* —— Gold assay —— */
  {
    id: "assay_stone",
    categoryId: "gold_assay",
    titleFa: "سنگ محک (Touchstone)",
    purposeFa: "آزمون اولیه عیار روی قطعه شکسته/دست‌دوم.",
    howFa:
      "خط محک بکشید؛ با اسید متناظر مقایسه کنید؛ نتیجه را «تخمینی» اعلام کنید تا XRF/ذوب.",
    cautionFa: "اسید روی پوست/چشم خطرناک است — فقط کنار هود و با دستکش.",
    materialsFa: ["سنگ محک سیاه", "سوزن‌های مرجع عیار", "اسید محک ۱۸/۲۱/۲۴"],
    standardCueFa: "روش سنتی تکمیل‌شده با دستگاه — نه تنها منبع خرید عمده",
  },
  {
    id: "assay_acid",
    categoryId: "gold_assay",
    titleFa: "ست اسید محک عیار",
    purposeFa: "تمایز تقریبی بین عیارهای رایج و غیرطلا.",
    howFa:
      "قطره‌ای روی خط محک؛ واکنش رنگ را با کارت مرجع بخوانید؛ قطعه را آبکشی/خنثی کنید.",
    cautionFa: "اسید نیتریک/تیزاب — انبارداری قفل‌دار و ثبت مصرف.",
    materialsFa: ["اسیدهای عیار", "قطره‌چکان", "خنثی‌کننده", "کارت رنگ"],
    standardCueFa: "PPE اجباری + برگه ایمنی مواد (MSDS)",
  },
  {
    id: "assay_xrf",
    categoryId: "gold_assay",
    titleFa: "دستگاه XRF دستی (در شعب مجهز)",
    purposeFa: "آنالیز غیرمخرب ترکیب سطحی فلز مشکوک.",
    howFa:
      "سطح تمیز؛ چند نقطه اندازه‌گیری؛ گزارش را به فاکتور خرید ضمیمه کنید.",
    cautionFa: "XRF سطح را می‌خواند — روکش طلا روی فلز پایه را ممکن است اشتباه نشان دهد؛ با محک/وزن چگالی تکمیل کنید.",
    materialsFa: ["XRF", "استاندارد کالیبر", "گزارش چاپ"],
    standardCueFa: "شفافیت آزمایشگاهی برای خرید قراضه",
  },
  {
    id: "assay_density",
    categoryId: "gold_assay",
    titleFa: "کیت چگالی / ترازوی غوطه‌وری",
    purposeFa: "تشخیص اختلاف چگالی طلا با فلزات تقلبی حجیم.",
    howFa: "وزن خشک و غوطه‌ور؛ محاسبه چگالی؛ مقایسه با جدول عیار.",
    cautionFa: "حفره داخلی یا نگین، محاسبه را منحرف می‌کند — قطعه را جدا کنید.",
    materialsFa: ["ترازوی چگالی", "بشر آب مقطر", "جدول مرجع"],
    standardCueFa: "روش فیزیکی مکمل اسید/XRF",
  },
  {
    id: "assay_magnet",
    categoryId: "gold_assay",
    titleFa: "آهن‌ربای نئودیمیوم قوی",
    purposeFa: "رد سریع فلزات مغناطیسی جا زده‌شده به‌جای طلا.",
    howFa: "اگر جذب شد، طلای خالص نیست؛ ادامه آزمون اسید/XRF.",
    cautionFa: "عدم جذب = لزوماً طلا نیست (مثلاً برنج/تنگستن).",
    materialsFa: ["آهن‌ربا", "سینی تست"],
    standardCueFa: "اسکرین اولیه خرید دست‌دوم",
  },
  {
    id: "assay_stamp",
    categoryId: "gold_assay",
    titleFa: "ذره‌بین مهر عیار و پانچ مرجع",
    purposeFa: "خواندن مهر ۷۵۰/۹۱۶/۹۹۹ و مقایسه با الگوی جعلی.",
    howFa: "مهر کمرنگ یا ناهمگون = پرچم قرمز؛ بدون تأیید مدیر خرید نکنید.",
    cautionFa: "مهر جعلی روی روکش رایج است — مهر به‌تنهایی کافی نیست.",
    materialsFa: ["لوپ", "کارت نمونه مهر"],
    standardCueFa: "CIBJO Precious Metals marking literacy",
  },
  {
    id: "assay_file_spot",
    categoryId: "gold_assay",
    titleFa: "سوهان نقطه تست (Spot file)",
    purposeFa: "کنار زدن لایه روکش برای دیدن فلز زیرین قبل از خرید.",
    howFa: "فقط روی محل توافق‌شده با فروشنده قراضه؛ سپس اسید/XRF.",
    cautionFa: "بدون رضایت کتبی روی زیور مشتری سوهان نزنید.",
    materialsFa: ["سوهان ریز", "الکل تمیزکننده"],
    standardCueFa: "رضایت آگاهانه قبل از آزمون مخرب",
  },

  /* —— Dollar authenticity —— */
  {
    id: "usd_uv",
    categoryId: "dollar_auth",
    titleFa: "چراغ UV تشخیص اسکناس (نور فرابنفش)",
    purposeFa:
      "آشکار کردن نخ امنیتی، نوار و جوهر فلورسنت دلار اصل — تشخیص جعل رایج.",
    howFa:
      "اتاق نیمه‌تاریک؛ اسکناس را زیر UV بگیرید؛ نخ و نوار باید در محل استاندارد بدرخشند. هر مشکوک را جدا و به مدیر بدهید.",
    cautionFa:
      "UV به چشم آسیب می‌زند — مستقیم نگاه نکنید. نتیجه UV را با لمس و واترمارک تکمیل کنید؛ تنها منبع قضاوت نباشد.",
    materialsFa: ["چراغ UV 365nm رومیزی یا دستی", "پایه ضدلغزش"],
    standardCueFa: "US Secret Service / currency education — چند لایه امنیت",
  },
  {
    id: "usd_magnifier",
    categoryId: "dollar_auth",
    titleFa: "ذره‌بین و لامپ سفید سرد",
    purposeFa: "بررسی میکرچاپ، طرح زمینه و کیفیت کاغذ.",
    howFa: "میکرچاپ باید خوانا باشد نه لکه‌ای؛ کاغذ پارچه‌ای باشد نه براق پلاستیکی.",
    cautionFa: "اسکناس خیس/پاره‌شده را جداگانه ثبت کنید.",
    materialsFa: ["ذره‌بین ۱۰×–۲۰×", "لامپ LED سفید"],
    standardCueFa: "Checklist چندحسی اسکناس",
  },
  {
    id: "usd_magnet_pen",
    categoryId: "dollar_auth",
    titleFa: "قلم مغناطیسی / حسگر جوهر مغناطیسی",
    purposeFa: "بررسی جوهر مغناطیسی روی تصویر و اعداد دلار.",
    howFa: "طبق دستورالعمل قلم؛ عدم واکنش = مشکوک.",
    cautionFa: "قلم کهنه کالیبر نیست — هر ماه تست با اسکناس شاهد.",
    materialsFa: ["قلم مغناطیسی", "اسکناس شاهد اصل در گاوصندوق تست"],
    standardCueFa: "ابزار کمکی صرافی کنار UV",
  },
  {
    id: "usd_watermarks",
    categoryId: "dollar_auth",
    titleFa: "کارت راهنمای واترمارک و رشته امنیتی",
    purposeFa: "آموزش سریع محل نخ، واترمارک و تغییر رنگ جوهر.",
    howFa: "کارت را کنار اسکناس بگذارید؛ آموزش شیفت جدید اجباری است.",
    cautionFa: "کارت جایگزین دستگاه نیست — فقط کمک حافظه.",
    materialsFa: ["کارت مرجع دلار", "پوستر آموزش صندوق"],
    standardCueFa: "آموزش مداوم صندوق طبق بهروزرسانی اسکناس",
  },
  {
    id: "usd_detector",
    categoryId: "dollar_auth",
    titleFa: "دستگاه تشخیص اسکناس رومیزی (UV + MG)",
    purposeFa: "ترکیب نور UV و حسگر مغناطیسی برای صف صندوق.",
    howFa: "کالیبر صبح؛ اسکناس‌های مشکوک را دستگاه + چشم انسان بررسی کنید.",
    cautionFa: "دستگاه خطا دارد — تصمیم نهایی با مسئول صندوق/مدیر.",
    materialsFa: ["دتکتور رومیزی", "کابل برق پایدار"],
    standardCueFa: "لایه دفاعی صندوق ارزی",
  },

  /* —— Safety —— */
  {
    id: "safe_alarm",
    categoryId: "safety",
    titleFa: "زنگ اضطراری کارگاه / دکمه پنیک",
    purposeFa: "هشدار سریع آتش، نشت اسید، یا تهدید امنیتی کنار ذوب و گاوصندوق.",
    howFa: "محل دکمه را همه شیفت‌ها بدانند؛ تست هفتگی ثبت شود.",
    cautionFa: "تست بدون هماهنگی نگهبانی ممنوع.",
    materialsFa: ["دکمه پنیک", "آژیر محلی", "دفتر تست"],
    standardCueFa: "Dual control + پروتکل اضطراری شعبه",
  },
  {
    id: "safe_hood",
    categoryId: "safety",
    titleFa: "هود تهویه اسید و دود ذوب",
    purposeFa: "خروج بخارات اسید محک و دود فلاکس.",
    howFa: "قبل از باز کردن اسید یا روشن کردن کوره، هود را روشن و جریان را چک کنید.",
    cautionFa: "هود خاموش = توقف کامل آزمون اسید و ذوب.",
    materialsFa: ["هود", "فیلتر", "نشانگر جریان هوا"],
    standardCueFa: "ایمنی شغلی کارگاه فلزات گرانبها",
  },
  {
    id: "safe_ppe",
    categoryId: "safety",
    titleFa: "PPE کارگاه: عینک، پیش‌بند، دستکش نسوز",
    purposeFa: "محافظت فردی در ذوب، اسید و جلا.",
    howFa: "قبل از ورود به زون ذوب/محک بپوشید؛ بعد ضدعفونی/شستشو.",
    cautionFa: "PPE آسیب‌دیده را از چرخه خارج کنید.",
    materialsFa: ["عینک ایمنی", "پیش‌بند چرمی/نسوز", "دستکش", "ماسک"],
    standardCueFa: "حداقل تجهیزات حفاظت فردی کارگاه",
  },
  {
    id: "safe_extinguisher",
    categoryId: "safety",
    titleFa: "کپسول آتش‌نشانی مناسب فلز/الکتریکی",
    purposeFa: "مهار آتش احتمالی کنار کوره و برق کارگاه.",
    howFa: "محل و نوع کپسول را بشناسید؛ آب روی مذاب فلز نریزید.",
    cautionFa: "آموزش اطفاء برای همه اپراتورهای ذوب اجباری است.",
    materialsFa: ["کپسول پودر/CO₂ مناسب", "تابلو راهنما"],
    standardCueFa: "بازرسی ماهانه تجهیزات اطفاء",
  },
  {
    id: "safe_lock_acid",
    categoryId: "safety",
    titleFa: "کابینت قفل‌دار مواد شیمیایی",
    purposeFa: "نگهداری اسید محک و حلال‌ها جدا از ویترین مشتری.",
    howFa: "ورود/خروج مواد با امضای دو نفر؛ موجودی هفتگی.",
    cautionFa: "اسید هرگز کنار مواد غذایی یا اسکناس شاهد نباشد.",
    materialsFa: ["کابینت مقاوم اسید", "سینی نشت‌گیر", "برچسب خطر"],
    standardCueFa: "انبارداری مواد خطرناک شعب",
  },
];

export function itemsByCategory(id: ArsenalCategoryId): ArsenalItem[] {
  return ARSENAL_ITEMS.filter((i) => i.categoryId === id);
}

export function getArsenalCategory(
  id: ArsenalCategoryId
): ArsenalCategory | undefined {
  return ARSENAL_CATEGORIES.find((c) => c.id === id);
}

export function getArsenalItem(id: string): ArsenalItem | undefined {
  return ARSENAL_ITEMS.find((i) => i.id === id);
}

export const ARSENAL_STATS = {
  categories: ARSENAL_CATEGORIES.length,
  items: ARSENAL_ITEMS.length,
};
