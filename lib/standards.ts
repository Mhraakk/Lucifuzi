/**
 * Curriculum atlas aligned with US / Swiss / European jewelry retail standards.
 * Sources (industry reference — adapted for Arya gallery staff training):
 * - US: GIA retail product literacy, Jewelers of America store practices,
 *       FTC-style disclosure discipline, dual-control loss prevention
 * - CH: Swiss hallmark / maker-mark precision, service documentation, quiet luxury
 * - EU: CIBJO Blue Books (nomenclature & ethics), consumer price transparency,
 *       Responsible Jewellery Council awareness, precious-metal fineness literacy
 *
 * Pedagogy: competency-based (knowledge ≠ practical ≠ work authorization).
 * Chart is a domain atlas — not a staircase or forced linear path.
 */

export type StandardRegion = "us" | "ch" | "eu";

export type AssessmentGate =
  | "knowledge_only"
  | "scenario_practice"
  | "observed_practical"
  | "authorization_gate";

export interface StandardSource {
  id: string;
  region: StandardRegion;
  shortName: string;
  titleFa: string;
  focus: string;
}

export interface CurriculumDomain {
  id: string;
  code: string;
  titleFa: string;
  summaryFa: string;
  regions: StandardRegion[];
  sourceIds: string[];
  relatedCourseIds: string[];
  relatedCompetencyIds: string[];
  assessment: AssessmentGate;
  learningOutcomes: string[];
}

export interface PedagogyPrinciple {
  id: string;
  titleFa: string;
  bodyFa: string;
}

export const STANDARD_SOURCES: StandardSource[] = [
  {
    id: "gia",
    region: "us",
    shortName: "GIA",
    titleFa: "سواد محصول جواهر (مدل آموزشی GIA)",
    focus: "شناخت فلز/سنگ، زبان دقیق، بدون ادعاهای غیرمستند",
  },
  {
    id: "ja",
    region: "us",
    shortName: "JA",
    titleFa: "رویه فروشگاهی Jewelers of America",
    focus: "فروش مشورتی، انضباط شعبه، امانت کالا",
  },
  {
    id: "ftc",
    region: "us",
    shortName: "FTC Guides",
    titleFa: "افشاگری صادقانه (الگوی FTC Jewelry Guides)",
    focus: "شفافیت ادعا، عیار، نو/دست‌دوم، بدون اغراق",
  },
  {
    id: "us_lp",
    region: "us",
    shortName: "Dual Control",
    titleFa: "کنترل دوگانه و پیشگیری از زیان",
    focus: "باز/بسته دو نفره، ویترین قفل‌دار، گزارش سریع",
  },
  {
    id: "ch_hallmark",
    region: "ch",
    shortName: "Swiss Mark",
    titleFa: "دقت نشانه‌گذاری سوئیس",
    focus: "مهر عیار، شناسایی قطعه، دقت اسنادی",
  },
  {
    id: "ch_service",
    region: "ch",
    shortName: "Service Trace",
    titleFa: "اسناد خدمات سوئیسی",
    focus: "رسید پذیرش، ردیابی تعمیر، تحویل هویت‌سنجی‌شده",
  },
  {
    id: "ch_quiet",
    region: "ch",
    shortName: "Quiet Luxury",
    titleFa: "مهمان‌نوازی آرام لوکس",
    focus: "حریم خصوصی، صدای آرام، فضای بدون فشار",
  },
  {
    id: "cibjo",
    region: "eu",
    shortName: "CIBJO",
    titleFa: "CIBJO Blue Books",
    focus: "نام‌گذاری استاندارد فلزات گرانبها و اخلاق حرفه‌ای",
  },
  {
    id: "eu_price",
    region: "eu",
    shortName: "EU Transparency",
    titleFa: "شفافیت قیمت مصرف‌کننده اروپا",
    focus: "تجزیه قیمت، توضیح اجرت/مالیات، بدون ابهام",
  },
  {
    id: "rjc",
    region: "eu",
    shortName: "RJC",
    titleFa: "آگاهی Responsible Jewellery Council",
    focus: "منبع‌یابی مسئولانه و رفتار اخلاقی با مشتری",
  },
];

export const CURRICULUM_DOMAINS: CurriculumDomain[] = [
  {
    id: "dom_onboard",
    code: "ARYA-ONB",
    titleFa: "انضباط ورود و کف شعبه",
    summaryFa:
      "تور امنیتی و Floor Walk قبل از هر تماس با ویترین — الگوی جذب همکار در گالری‌های معتبر آمریکا و اروپا.",
    regions: ["us", "ch", "eu"],
    sourceIds: ["ja", "us_lp", "ch_quiet"],
    relatedCourseIds: ["course_01"],
    relatedCompetencyIds: ["comp_security"],
    assessment: "scenario_practice",
    learningOutcomes: [
      "مناطق شعبه و مسیر اضطراری را نقشه‌برداری کند",
      "قفل موقت ویترین را بدون استثنا رعایت کند",
      "ظاهر و رفتار Dress & Demeanor سطح بوتیک لوکس را نشان دهد",
    ],
  },
  {
    id: "dom_product",
    code: "ARYA-PRD",
    titleFa: "سواد محصول و نشانه‌گذاری",
    summaryFa:
      "ترکیب سواد GIA، نام‌گذاری CIBJO Precious Metals، و دقت نشانه‌گذاری سوئیسی — بدون ادعاهای غیرمستند.",
    regions: ["us", "ch", "eu"],
    sourceIds: ["gia", "cibjo", "ch_hallmark", "ftc"],
    relatedCourseIds: ["course_02"],
    relatedCompetencyIds: ["comp_product"],
    assessment: "observed_practical",
    learningOutcomes: [
      "عیار و وزن را با زبان مشاور توضیح دهد",
      "مهر/پلاک را قبل از ادعا بررسی کند",
      "نو در برابر دست‌دوم را شفاف اعلام کند",
    ],
  },
  {
    id: "dom_pricing",
    code: "ARYA-PRC",
    titleFa: "شفافیت قیمت و محاسبه",
    summaryFa:
      "الگوی شفافیت مصرف‌کننده اروپا + افشاگری صادقانه آمریکایی: فلز، اجرت، سود، مالیات — رقم دقیق، توضیح آرام.",
    regions: ["us", "eu"],
    sourceIds: ["eu_price", "ftc", "ja"],
    relatedCourseIds: ["course_03"],
    relatedCompetencyIds: ["comp_pricing"],
    assessment: "authorization_gate",
    learningOutcomes: [
      "اجزای قیمت را به زبان مشتری تجزیه کند",
      "محاسبه زنده روی ترازو/سیستم بدون خطا انجام دهد",
      "هرگز مشتری را بابت بودجه شرمسار نکند",
    ],
  },
  {
    id: "dom_sales",
    code: "ARYA-SAL",
    titleFa: "فروش مشورتی",
    summaryFa:
      "Consultative selling به سبک JA/GIA retail و quiet luxury سوئیسی — حداکثر دو گزینه، بدون فشار.",
    regions: ["us", "ch"],
    sourceIds: ["ja", "gia", "ch_quiet"],
    relatedCourseIds: ["course_04", "course_05"],
    relatedCompetencyIds: ["comp_sales"],
    assessment: "observed_practical",
    learningOutcomes: [
      "نیازسنجی مناسبت و بودجه را کامل کند",
      "اعتراض قیمت را با ارزش‌آفرینی مدیریت کند",
      "فروش را بدون فشار ببندد یا محترمانه متوقف کند",
    ],
  },
  {
    id: "dom_security",
    code: "ARYA-SEC",
    titleFa: "امنیت عملیاتی",
    summaryFa:
      "Dual Control آمریکایی و انضباط گالری‌های اروپایی: باز/بسته دو نفره، ویترین قفل‌دار، واکنش اضطراری.",
    regions: ["us", "eu"],
    sourceIds: ["us_lp", "ja"],
    relatedCourseIds: ["course_06"],
    relatedCompetencyIds: ["comp_security"],
    assessment: "authorization_gate",
    learningOutcomes: [
      "SOP باز و بسته را دو نفره اجرا کند",
      "مناطق دسترسی محدود را رعایت کند",
      "امنیت را بدون رعب‌آفرینی برای مشتری درستکار حفظ کند",
    ],
  },
  {
    id: "dom_integrity",
    code: "ARYA-INT",
    titleFa: "صداقت، اخلاق و ضدتقلب",
    summaryFa:
      "اخلاق CIBJO/RJC + پیشگیری تقلب فروشگاهی آمریکایی — گزارش سریع بدون توهین به مشتری درستکار.",
    regions: ["us", "eu"],
    sourceIds: ["cibjo", "rjc", "us_lp", "ftc"],
    relatedCourseIds: ["course_10"],
    relatedCompetencyIds: ["comp_fraud"],
    assessment: "authorization_gate",
    learningOutcomes: [
      "نشانه‌های تعویض/پرداخت مشکوک را بشناسد",
      "مسیر گزارش به مدیر را فوری طی کند",
      "ادعاهای محصول را فقط از دانش‌نامه تأییدشده بگوید",
    ],
  },
  {
    id: "dom_service",
    code: "ARYA-SVC",
    titleFa: "خدمات و ردیابی تعمیر",
    summaryFa:
      "اسناد خدمات سطح سوئیس: ثبت قطعه، تخمین شفاف، رسید رسمی، تحویل با هویت‌سنجی.",
    regions: ["ch", "eu"],
    sourceIds: ["ch_service", "cibjo"],
    relatedCourseIds: ["course_08"],
    relatedCompetencyIds: ["comp_repair"],
    assessment: "observed_practical",
    learningOutcomes: [
      "فرم پذیرش را بدون ابهام تکمیل کند",
      "تخمین و ریسک را شفاف به مشتری بگوید",
      "تحویل را فقط با هویت‌سنجی انجام دهد",
    ],
  },
  {
    id: "dom_ops",
    code: "ARYA-OPS",
    titleFa: "امانت موجودی و ارتباط مشتری",
    summaryFa:
      "زنجیره امانت JA + Clienteling با احترام به حریم خصوصی (الگوی اروپایی).",
    regions: ["us", "eu", "ch"],
    sourceIds: ["ja", "ch_quiet", "rjc"],
    relatedCourseIds: ["course_07", "course_09"],
    relatedCompetencyIds: ["comp_product", "comp_sales"],
    assessment: "scenario_practice",
    learningOutcomes: [
      "تحویل شیفت ویترین را مغایرت‌گیری کند",
      "یادداشت مشتری را محرمانه و مفید ثبت کند",
      "پیشنهاد را هدفمند و غیرتهاجمی ارائه دهد",
    ],
  },
];

export const PEDAGOGY_PRINCIPLES: PedagogyPrinciple[] = [
  {
    id: "p_separate",
    titleFa: "جداسازی سه لایه صلاحیت",
    bodyFa:
      "دانش آزمون (Knowledge) ≠ وضعیت عملی (Practical) ≠ مجوز کار (Work Authorization). فقط ارزیابی عملی مشاهده‌شده مجوز می‌دهد — اصل مشترک آموزش حرفه‌ای آمریکا و اروپا.",
  },
  {
    id: "p_outcomes",
    titleFa: "اهداف رفتاری قابل مشاهده",
    bodyFa:
      "هر دامنه با Learning Outcomes نوشته می‌شود؛ موفقیت یعنی انجام درست کار روی ویترین، نه حفظ طوطی‌وار متن.",
  },
  {
    id: "p_formative",
    titleFa: "تمرین قبل از مجوز",
    bodyFa:
      "کوییز تکوینی و سناریو برای یادگیری است؛ مجوز مستقل فقط پس از Observed Practical و Authorization Gate.",
  },
  {
    id: "p_atlas",
    titleFa: "چارت دامنه‌ای نه پلکانی",
    bodyFa:
      "چارت آموزشی یک اطلس شایستگی است: دامنه‌ها موازی و نقش‌محورند. ترتیب اجباری پلکانی وجود ندارد — هر دامنه وقتی نقش ایجاب کند باز است.",
  },
];

export const REGION_LABELS: Record<
  StandardRegion,
  { fa: string; en: string; accent: string }
> = {
  us: { fa: "آمریکا", en: "United States", accent: "#6B4423" },
  ch: { fa: "سوئیس", en: "Switzerland", accent: "#8B6914" },
  eu: { fa: "اروپا", en: "Europe", accent: "#4A3728" },
};

export const ASSESSMENT_LABELS: Record<AssessmentGate, string> = {
  knowledge_only: "دانش (کوییز)",
  scenario_practice: "تمرین سناریو",
  observed_practical: "ارزیابی عملی مشاهده‌شده",
  authorization_gate: "دروازه مجوز کار",
};

export function sourcesForDomain(domain: CurriculumDomain): StandardSource[] {
  return STANDARD_SOURCES.filter((s) => domain.sourceIds.includes(s.id));
}

export function domainsForCourse(courseId: string): CurriculumDomain[] {
  return CURRICULUM_DOMAINS.filter((d) =>
    d.relatedCourseIds.includes(courseId)
  );
}

export function domainsForCompetency(
  competencyId: string
): CurriculumDomain[] {
  return CURRICULUM_DOMAINS.filter((d) =>
    d.relatedCompetencyIds.includes(competencyId)
  );
}
