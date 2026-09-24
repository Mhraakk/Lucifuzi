/** Topic visuals — 3D-style stills for each training domain */

export type IllustrationKey =
  | "onboarding"
  | "product"
  | "pricing"
  | "sales"
  | "care"
  | "security"
  | "inventory"
  | "repair"
  | "crm"
  | "fraud"
  | "practice"
  | "skills"
  | "home"
  | "assistant";

export type IllustrationMeta = {
  src: string;
  alt: string;
  caption: string;
  /** Soft motion variant */
  motion: "float" | "parallax" | "shine";
};

export const ILLUSTRATIONS: Record<IllustrationKey, IllustrationMeta> = {
  onboarding: {
    src: "/illustrations/topic-onboarding.png",
    alt: "ورودی گالری لوکس طلا",
    caption: "روز اول: استاندارد حضور در گالری‌های معتبر اروپا و آمریکا",
    motion: "parallax",
  },
  product: {
    src: "/illustrations/topic-product.png",
    alt: "شناخت مصنوعات طلا",
    caption: "سواد محصول: عیار، ساخت، و روایت درست برای مشتری",
    motion: "float",
  },
  pricing: {
    src: "/illustrations/topic-pricing.png",
    alt: "محاسبات قیمت طلا",
    caption: "شفافیت قیمت — اعتماد قبل از فروش",
    motion: "shine",
  },
  sales: {
    src: "/illustrations/topic-sales.png",
    alt: "فروش مشورتی لوکس",
    caption: "فروش بدون فشار؛ مشاوره سطح جواهرسازان بین‌المللی",
    motion: "float",
  },
  care: {
    src: "/illustrations/topic-care.png",
    alt: "مراقبت از مشتری",
    caption: "مهمان‌نوازی گالری: آرامش، حریم، و تجربه خرید ممتاز",
    motion: "parallax",
  },
  security: {
    src: "/illustrations/topic-security.png",
    alt: "امنیت شعبه",
    caption: "کنترل دوگانه، ویترین، و پروتکل اضطراری",
    motion: "shine",
  },
  inventory: {
    src: "/illustrations/topic-inventory.png",
    alt: "موجودی و ویترین",
    caption: "زنجیره امانت کالا از ویترین تا تحویل",
    motion: "float",
  },
  repair: {
    src: "/illustrations/topic-repair.png",
    alt: "پذیرش تعمیرات",
    caption: "ثبت، ردیابی، و تحویل امن قطعه مشتری",
    motion: "parallax",
  },
  crm: {
    src: "/illustrations/topic-crm.png",
    alt: "باشگاه مشتریان",
    caption: "Clienteling: سلیقه، مناسبت، و پیگیری محرمانه",
    motion: "shine",
  },
  fraud: {
    src: "/illustrations/topic-fraud.png",
    alt: "مدیریت ریسک و تقلب",
    caption: "تشخیص زودهنگام بدون توهین به مشتری درستکار",
    motion: "float",
  },
  practice: {
    src: "/illustrations/topic-sales.png",
    alt: "تمرین عملی",
    caption: "شبیه‌سازی واقعی قبل از کار مستقل روی ویترین",
    motion: "parallax",
  },
  skills: {
    src: "/illustrations/topic-product.png",
    alt: "مهارت‌ها",
    caption: "دانش آزمون ≠ مجوز کار — صلاحیت عملی جداست",
    motion: "float",
  },
  home: {
    src: "/illustrations/topic-onboarding.png",
    alt: "خانه آموزش",
    caption: "ویترین مهارت‌ها — هر تابلو مستقل، بدون مسیر اجباری",
    motion: "shine",
  },
  assistant: {
    src: "/illustrations/topic-care.png",
    alt: "دستیار آموزشی",
    caption: "پاسخ فقط از دانش‌نامه تأییدشده سازمان",
    motion: "float",
  },
};

const COURSE_ILLUSTRATION: Record<string, IllustrationKey> = {
  course_01: "onboarding",
  course_02: "product",
  course_03: "pricing",
  course_04: "sales",
  course_05: "care",
  course_06: "security",
  course_07: "inventory",
  course_08: "repair",
  course_09: "crm",
  course_10: "fraud",
};

export function illustrationForCourse(courseId: string): IllustrationMeta {
  const key = COURSE_ILLUSTRATION[courseId] ?? "product";
  return ILLUSTRATIONS[key];
}

export function illustrationSrcForCourse(courseId: string): string {
  return illustrationForCourse(courseId).src;
}
