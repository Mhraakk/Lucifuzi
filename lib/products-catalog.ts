/**
 * Product training catalog — worked gold, melted gold, Zarbed bars, Zardis plaques.
 * Visual layout mirrors luxury jewellery e-commerce landing (Shakuro-style).
 */

export type ProductCategory =
  | "worked"
  | "melted"
  | "zarbed"
  | "zardis";

export type ProductStyle =
  | "classic"
  | "modern"
  | "bridal"
  | "investment"
  | "gift";

export interface TrainingProduct {
  id: string;
  slug: string;
  nameFa: string;
  brandFa: string;
  category: ProductCategory;
  style: ProductStyle;
  karat: 18 | 21 | 22 | 24;
  weightGrams: number;
  image: string;
  hero?: boolean;
  taglineFa: string;
  designNotesFa: string;
  teachFa: string;
  talkingPoints: string[];
  cautionFa?: string;
  accent: string;
}

export const PRODUCT_CATEGORY_LABELS: Record<ProductCategory, string> = {
  worked: "طلای کارشده",
  melted: "طلای آب‌شده",
  zarbed: "شمش زربد",
  zardis: "پلاک زردیس",
};

export const PRODUCT_STYLE_LABELS: Record<ProductStyle, string> = {
  classic: "کلاسیک",
  modern: "مدرن",
  bridal: "عروس",
  investment: "سرمایه‌ای",
  gift: "هدیه",
};

export const trainingProducts: TrainingProduct[] = [
  {
    id: "prod_hero_chain",
    slug: "chain-venezia-18",
    nameFa: "زنجیر ونیزی ۱۸ عیار",
    brandFa: "Beatris",
    category: "worked",
    style: "classic",
    karat: 18,
    weightGrams: 8.4,
    image: "/products/chain.svg",
    hero: true,
    taglineFa: "پیوند ظریف · نور یکنواخت روی گردن",
    designNotesFa:
      "بافت ونیزی تخت، قفل جعبه‌ای مخفی، پرداخت براق. مناسب گردن‌های متوسط؛ با پلاک ساده ست می‌شود.",
    teachFa:
      "قبل از نمایش: مهر ۷۵۰ را ببینید، وزن را از سیستم بخوانید، قفل را باز/بسته کنید. به مشتری بگویید اجرت جدا از ارزش فلز است.",
    talkingPoints: [
      "عیار ۱۸ (۷۵۰) — سه‌چهارم وزن طلای خالص",
      "قفل جعبه‌ای: دو بار چک شود قبل از تحویل",
      "نگهداری: از عطر و کلر دور نگه دارید",
    ],
    cautionFa: "کشیدن زنجیر برای اندازه‌گیری روی گردن مشتری ممنوع — از متر نرم استفاده کنید.",
    accent: "#c9a24a",
  },
  {
    id: "prod_ring_solitaire",
    slug: "ring-solitaire-18",
    nameFa: "انگشتر تک‌نگین کلاسیک",
    brandFa: "Beatris",
    category: "worked",
    style: "bridal",
    karat: 18,
    weightGrams: 3.2,
    image: "/products/ring.svg",
    taglineFa: "سینی مخمل · نور نقطه‌ای روی نگین",
    designNotesFa:
      "کاسه چهارچنگ، شانه باریک، پرداخت ترکیبی مات/براق. سایزبندی باید با حلقه اندازه تأیید شود.",
    teachFa:
      "هرگز اصالت سنگ را بدون گواهی ادعا نکنید. نگین را در برابر نور نقطه‌ای نشان دهید؛ اجرت ساخت را شفاف بگویید.",
    talkingPoints: [
      "سایز انگشت را با حلقه پلاستیکی چک کنید",
      "اگر سنگ گواهی ندارد: «اجازه بدهید با مسئول محصول چک کنم»",
      "حداکثر دو مدل همزمان روی سینی",
    ],
    accent: "#d4af37",
  },
  {
    id: "prod_bracelet",
    slug: "bracelet-tennis-18",
    nameFa: "دستبند تنیس ظریف",
    brandFa: "Beatris",
    category: "worked",
    style: "modern",
    karat: 18,
    weightGrams: 6.1,
    image: "/products/bracelet.svg",
    taglineFa: "خطوط پیوسته · درخشش یکدست",
    designNotesFa:
      "لینک‌های یکسان، قفل ایمنی دوبل، انعطاف ملایم روی مچ. سبک مدرن برای استفاده روزمره لوکس.",
    teachFa:
      "قفل ایمنی را جلوی مشتری باز و بسته کنید. وزن و عیار را بلند تکرار کنید. تفاوت نو و دست‌دوم را شفاف بگویید.",
    talkingPoints: [
      "قفل دوبل = نکته فروش امنیتی",
      "مناسب ست با گوشواره میخی ساده",
      "اجرت این مدل معمولاً بالاتر از زنجیر ساده است",
    ],
    accent: "#b8860b",
  },
  {
    id: "prod_earring",
    slug: "earring-hoop-18",
    nameFa: "گوشواره حلقه‌ای متوسط",
    brandFa: "Beatris",
    category: "worked",
    style: "gift",
    karat: 18,
    weightGrams: 4.5,
    image: "/products/earring.svg",
    taglineFa: "فرم بیضی · هدیه بدون ریسک سایز",
    designNotesFa:
      "حلقه بیضی، لولای مخفی، وزن متعادل برای استفاده روزانه. پرداخت براق آینه‌ای.",
    teachFa:
      "برای هدیه عالی است چون سایز انگشت نمی‌خواهد. لولا را چک کنید؛ جفت بودن دو گوشواره را نشان دهید.",
    talkingPoints: [
      "جفت بودن وزن دو طرف را بگویید",
      "مناسب مشتری عجله‌دار برای هدیه",
      "جعبه مخمل هدیه پیشنهاد شود",
    ],
    accent: "#daa520",
  },
  {
    id: "prod_set",
    slug: "set-bridal-21",
    nameFa: "سرویس عروس ۲۱ عیار",
    brandFa: "Beatris",
    category: "worked",
    style: "bridal",
    karat: 21,
    weightGrams: 42,
    image: "/products/set.svg",
    taglineFa: "سه قطعه هم‌سبک · روایت یک‌دست",
    designNotesFa:
      "گردنبند + گوشواره + دستبند با موتیف برگ. عیار ۲۱؛ رنگ زرد گرم‌تر از ۱۸.",
    teachFa:
      "سرویس را قطعه به قطعه روی سینی بچینید نه یک‌جا در دست. عیار ۲۱ را با ۱۸ مقایسه کنید: خلوص بالاتر، قیمت گرم بالاتر.",
    talkingPoints: [
      "۲۱ عیار ≈ ۸۷۵ خلوص",
      "اجرت سرویس معمولاً بسته‌ای اعلام می‌شود",
      "عکس خانوادگی فقط با مجوز مشتری",
    ],
    cautionFa: "سرویس را از ویترین فقط با کنترل دو نفره خارج کنید.",
    accent: "#cd9b1d",
  },
  {
    id: "prod_melted",
    slug: "melted-gram-24",
    nameFa: "طلای آب‌شده گرمی",
    brandFa: "Beatris",
    category: "melted",
    style: "investment",
    karat: 24,
    weightGrams: 1,
    image: "/products/melted.svg",
    taglineFa: "نرخ روز · بدون اجرت ساخت مدل",
    designNotesFa:
      "شمش/تکه ذوب‌شده با خلوص بالا. ظاهر صنعتی؛ ارزش روی وزن و عیار است نه طراحی.",
    teachFa:
      "آب‌شده اجرت مدل ندارد؛ کارمزد ذوب/تبدیل جداست. نرخ را از تابلو روز بگیرید. به مشتری بگویید این «زیور» نیست — سرمایه‌ای/تبدیلی است.",
    talkingPoints: [
      "تفاوت آب‌شده با کارشده را واضح توضیح دهید",
      "وزن روی ترازوی کالیبره اعلام شود",
      "فاکتور باید نوع «آب‌شده» را ذکر کند",
    ],
    cautionFa: "هرگز آب‌شده را با زبان «زیور لوکس» نفروشید — انتظارات اشتباه می‌سازد.",
    accent: "#e6c35c",
  },
  {
    id: "prod_zarbed_1",
    slug: "zarbed-1g",
    nameFa: "شمش زربد ۱ گرم",
    brandFa: "زربد",
    category: "zarbed",
    style: "investment",
    karat: 24,
    weightGrams: 1,
    image: "/products/bar-1g.svg",
    taglineFa: "بسته‌بندی کارت · ورود آسان به سرمایه‌گذاری",
    designNotesFa:
      "شمش ۲۴ عیار در کارت امنیتی زربد. شماره سریال روی کارت؛ مناسب هدیه و پس‌انداز خرد.",
    teachFa:
      "بسته را باز نکنید مگر مشتری بخرد. سریال کارت را با فاکتور مطابقت دهید. توضیح دهید اجرت ساخت زیور ندارد — پریمیوم بسته/ضرب است.",
    talkingPoints: [
      "برند: زربد — شمش رسمی آموزشی گالری",
      "۱ گرم ≈ ورود کم‌ریسک برای مشتری جدید",
      "نگهداری در کارت اصلی = نقدشوندگی بهتر",
    ],
    accent: "#f0d060",
  },
  {
    id: "prod_zarbed_5",
    slug: "zarbed-5g",
    nameFa: "شمش زربد ۵ گرم",
    brandFa: "زربد",
    category: "zarbed",
    style: "investment",
    karat: 24,
    weightGrams: 5,
    image: "/products/bar-5g.svg",
    taglineFa: "تعادل قیمت · محبوب‌ترین وزن آموزشی",
    designNotesFa:
      "شمش مستطیل در محفظه شفاف/کارت. سطح آینه‌ای؛ لوگو و وزن حک‌شده.",
    teachFa:
      "این وزن را برای تمرین محاسبه قیمت با مشتری استفاده کنید: وزن × نرخ گرم ۲۴. تفاوت با کارشده ۱۸ را روی کاغذ نشان دهید.",
    talkingPoints: [
      "۵ گرم = مثال کلاسیک آموزش قیمت",
      "سریال را بلند بخوانید",
      "مقایسه با انگشتر هم‌وزن کارشده (اجرت جدا)",
    ],
    accent: "#e8c040",
  },
  {
    id: "prod_zarbed_10",
    slug: "zarbed-10g",
    nameFa: "شمش زربد ۱۰ گرم",
    brandFa: "زربد",
    category: "zarbed",
    style: "investment",
    karat: 24,
    weightGrams: 10,
    image: "/products/bar-10g.svg",
    taglineFa: "وزن میانی · نقدشوندگی بالا",
    designNotesFa: "فرم استاندارد شمش ضرب‌شده؛ گوشه‌های پخ؛ بسته ضدجعل.",
    teachFa:
      "مشتری سرمایه‌ای اغلب ۱۰ و ۲۰ گرم می‌پرسد. موجودی گاوصندوق را بدون افشای عدد دقیق تأیید کنید؛ مدیر را برای خروج بزرگ صدا کنید.",
    talkingPoints: [
      "خروج از گاوصندوق = کنترل دوگانه",
      "فاکتور سرمایه‌ای جدا از فاکتور زیور",
      "پیشنهاد نگهداری کارت/بسته سالم",
    ],
    accent: "#d4af37",
  },
  {
    id: "prod_zarbed_50",
    slug: "zarbed-50g",
    nameFa: "شمش زربد ۵۰ گرم",
    brandFa: "زربد",
    category: "zarbed",
    style: "investment",
    karat: 24,
    weightGrams: 50,
    image: "/products/bar-50g.svg",
    taglineFa: "تراکنش بزرگ · پروتکل امنیتی کامل",
    designNotesFa: "شمش سنگین‌تر با حک وزن و عیار؛ فقط از گاوصندوق اصلی.",
    teachFa:
      "قبل از نمایش به مشتری، مدیر را مطلع کنید. مسیر دوربین را باز بگذارید. هرگز شمش ۵۰ گرم را در منطقه عمومی بدون نظارت رها نکنید.",
    talkingPoints: [
      "نیاز به تأیید مدیر برای نمایش",
      "احراز هویت مشتری برای خریدهای بزرگ",
      "ثبت دقیق سریال در فاکتور",
    ],
    cautionFa: "نمایش بدون کنترل دو نفره تخلف امنیتی است.",
    accent: "#c9a24a",
  },
  {
    id: "prod_zardis_sun",
    slug: "zardis-sun",
    nameFa: "پلاک زردیس طرح خورشید",
    brandFa: "زردیس",
    category: "zardis",
    style: "gift",
    karat: 18,
    weightGrams: 2.1,
    image: "/products/plaque-1.svg",
    taglineFa: "نقش برجسته · هدیه نمادین",
    designNotesFa:
      "پلاک دایره‌ای با نقش خورشید برجسته، حلقه اتصال بالا، پشت صاف برای حکاکی نام.",
    teachFa:
      "پلاک زردیس را از کارت برند جدا نکنید تا فروش قطعی. تفاوت پلاک با شمش: پلاک زیور/نماد است و اجرت نقش دارد؛ شمش سرمایه‌ای است.",
    talkingPoints: [
      "برند زردیس — پلاک‌های نمادین آموزشی",
      "امکان حکاکی پشت پلاک را بپرسید",
      "ست با زنجیر ونیزی ساده پیشنهاد شود",
    ],
    accent: "#d4af37",
  },
  {
    id: "prod_zardis_script",
    slug: "zardis-vanity",
    nameFa: "پلاک زردیس وانیتی",
    brandFa: "زردیس",
    category: "zardis",
    style: "modern",
    karat: 18,
    weightGrams: 1.8,
    image: "/products/plaque-2.svg",
    taglineFa: "فرم مستطیل · تایپوگرافی مدرن",
    designNotesFa:
      "پلاک مستطیل افقی با حروف برجسته؛ لبه‌های پخ؛ مناسب گردنبند کوتاه.",
    teachFa:
      "سبک مدرن را با زبان دقیق بگویید: «پلاک ۱۸ عیار با نقش برجسته» — نه «طلای خالص». وزن کم است؛ روی اجرت نقش تمرکز کنید.",
    talkingPoints: [
      "وزن کم ≠ ارزش کم — اجرت طراحی مهم است",
      "مناسب مشتری جوان / هدیه روزمره",
      "کارت اصالت زردیس را نشان دهید",
    ],
    accent: "#c9a24a",
  },
  {
    id: "prod_zardis_coin",
    slug: "zardis-coin",
    nameFa: "پلاک زردیس سکه‌ای",
    brandFa: "زردیس",
    category: "zardis",
    style: "classic",
    karat: 21,
    weightGrams: 3.5,
    image: "/products/plaque-3.svg",
    taglineFa: "فرم سکه · حس کلاسیک ایرانی",
    designNotesFa:
      "پلاک دایره‌ای ضخیم‌تر، حاشیه سکه‌ای، عیار ۲۱. رنگ زرد گرم‌تر از ۱۸.",
    teachFa:
      "عیار ۲۱ را با ۱۸ مقایسه کنید. بگویید این پلاک زیور است نه شمش زربد — حتی اگر فرم سکه دارد. مشتری نباید اشتباه بگیرد.",
    talkingPoints: [
      "فرم سکه ≠ شمش سرمایه‌ای",
      "۲۱ عیار خلوص بالاتر",
      "تفاوت با شمش زربد را صریح بگویید",
    ],
    cautionFa: "اشتباه گرفتن پلاک با شمش در توضیح فروش = خطای آموزشی جدی.",
    accent: "#b8860b",
  },
];

export function productsByCategory(category: ProductCategory | "all") {
  if (category === "all") return trainingProducts;
  return trainingProducts.filter((p) => p.category === category);
}

export function getProduct(idOrSlug: string) {
  return trainingProducts.find((p) => p.id === idOrSlug || p.slug === idOrSlug);
}

export function heroProduct() {
  return trainingProducts.find((p) => p.hero) ?? trainingProducts[0]!;
}
