/**
 * Deep career tracks for Arya gallery — after theory + practice + design + exams,
 * a candidate should know: salesperson, accountant, designer, or ideator.
 */

import type { JobRole } from "@/lib/types";

export type CareerTrackId =
  | "salesperson"
  | "accountant"
  | "designer"
  | "ideator";

export type CareerPillarId =
  | "theory"
  | "reasoning"
  | "practice"
  | "design"
  | "exam";

export type CareerPillar = {
  id: CareerPillarId;
  titleFa: string;
  bodyFa: string;
  href: string;
  ctaFa: string;
};

export type CareerTrack = {
  id: CareerTrackId;
  titleFa: string;
  shortFa: string;
  promiseFa: string;
  outcomeFa: string;
  /** Maps to employee jobRole when committing to a path */
  jobRole: JobRole;
  learningPathId: string;
  accent: string;
  sculptureSlot: "practice" | "theory" | "studio" | "products" | "skills";
  faculties: string[];
  pillars: CareerPillar[];
  signals: string[];
};

export const CAREER_TRACKS: CareerTrack[] = [
  {
    id: "salesperson",
    titleFa: "فروشنده گالری",
    shortFa: "فروش مشورتی روی کف",
    promiseFa:
      "دوره عمیق: محصول، قیمت، سناریوی فروش و مهمان‌نوازی — تا بدانید فروشندهٔ ویترین هستید.",
    outcomeFa:
      "اگر از گفت‌وگو با مشتری، نیازسنجی و بستن بدون فشار انرژی می‌گیرید، مسیر فروش برای شماست.",
    jobRole: "sales_associate",
    learningPathId: "path_newhire",
    accent: "#c9a24a",
    sculptureSlot: "practice",
    faculties: ["ارتباط", "استدلال فروش", "زیبایی‌سنجی ارائه", "دقت ویترین"],
    pillars: [
      {
        id: "theory",
        titleFa: "تئوری فروش",
        bodyFa: "دامنه‌های PRD · SAL · ONB — سواد محصول و فروش مشورتی US/CH/EU.",
        href: "/employee/learn",
        ctaFa: "دوره‌های فروش",
      },
      {
        id: "reasoning",
        titleFa: "استدلال روی کف",
        bodyFa: "چرا این قطعه برای این مشتری؟ حداکثر دو گزینه، بدون فشار.",
        href: "/employee/scenario/sc_sales_budget",
        ctaFa: "سناریوی بودجه",
      },
      {
        id: "practice",
        titleFa: "عملی فروش",
        bodyFa: "نقش‌آفرینی، اعتراض قیمت، و ارائه روی سینی مخمل.",
        href: "/employee/practice",
        ctaFa: "تمرین عملی",
      },
      {
        id: "design",
        titleFa: "ارائه بصری",
        bodyFa: "ایده‌پردازی ۳D واریانت برای کمک به انتخاب مشتری.",
        href: "/employee/studio?product=ring-solitaire-18",
        ctaFa: "ایده‌پردازی انگشتر",
      },
      {
        id: "exam",
        titleFa: "آزمون دانش فروش",
        bodyFa: "آزمونک و آزمون دوره — فقط دانش؛ مجوز کار جداست.",
        href: "/employee/quiz",
        ctaFa: "آزمونک",
      },
    ],
    signals: [
      "انرژی از گفت‌وگوی رودررو",
      "راحتی در روایت محصول",
      "تحمل ابهام بودجه مشتری",
    ],
  },
  {
    id: "accountant",
    titleFa: "حسابدار / صندوق دقیق",
    shortFa: "عدد، شفافیت، کنترل",
    promiseFa:
      "دوره عمیق: فرمول قیمت، شفافیت اجزا، ریسک و صداقت عملیاتی — تا بدانید مسیر حساب و صندوق مال شماست.",
    outcomeFa:
      "اگر دقت رقم، تجزیه قیمت و کنترل دوگانه به شما آرامش می‌دهد، مسیر حسابداری/صندوق برای شماست.",
    jobRole: "accountant",
    learningPathId: "path_cashier",
    accent: "#d4af37",
    sculptureSlot: "skills",
    faculties: ["دقت عددی", "استدلال مالی", "شفافیت", "کنترل ریسک"],
    pillars: [
      {
        id: "theory",
        titleFa: "تئوری قیمت و ریسک",
        bodyFa: "دامنه‌های PRC · INT — شفافیت اروپا/آمریکا و ضدتقلب.",
        href: "/employee/learn",
        ctaFa: "بسته صندوق",
      },
      {
        id: "reasoning",
        titleFa: "استدلال مالی",
        bodyFa: "تجزیه فلز · اجرت · سود · مالیات را برای مشتری توضیح دهید.",
        href: "/employee/formula",
        ctaFa: "کارگاه فرمول",
      },
      {
        id: "practice",
        titleFa: "عملی محاسبه",
        bodyFa: "آزمون محاسبه زنده و سناریوی تقلب/ریسک.",
        href: "/employee/quiz?calc=1",
        ctaFa: "آزمون محاسبه",
      },
      {
        id: "design",
        titleFa: "مدل ذهنی عدد",
        bodyFa: "شمش زربد را در ۳D ببینید — ارزش روی وزن و عیار است نه تزئین.",
        href: "/employee/studio?product=zarbed-5g",
        ctaFa: "ایده شمش ۵گ",
      },
      {
        id: "exam",
        titleFa: "آزمون شفافیت",
        bodyFa: "دانش PRC/INT را بسنجید — مجوز کار فقط با ارزیابی عملی مدیر.",
        href: "/employee/courses/course_03",
        ctaFa: "دوره قیمت",
      },
    ],
    signals: [
      "لذت از رقم درست",
      "آرامش در قوانین و کنترل",
      "حساسیت به ابهام مالی",
    ],
  },
  {
    id: "designer",
    titleFa: "طراح قطعه",
    shortFa: "فرم، نور، ساخت ذهنی",
    promiseFa:
      "دوره عمیق: چشم مجسمه‌ساز، کارگاه ۳D، واریانت فرم و نگین — تا بدانید طراح گالری هستید.",
    outcomeFa:
      "اگر دست و چشم‌تان با فرم، تناسب و نور زنده‌تر می‌شود تا با چانه‌زنی فروش، مسیر طراحی برای شماست.",
    jobRole: "designer",
    learningPathId: "path_designer",
    accent: "#b8954a",
    sculptureSlot: "studio",
    faculties: ["بینایی فرمی", "مهارت لمسی", "زیبایی‌سنجی", "دقت ساخت"],
    pillars: [
      {
        id: "theory",
        titleFa: "تئوری فرم و محصول",
        bodyFa: "سواد فلز/سنگ + نگاه استادان ایتالیایی برای چشم طراح.",
        href: "/employee/courses/course_02",
        ctaFa: "سواد محصول",
      },
      {
        id: "reasoning",
        titleFa: "استدلال بصری",
        bodyFa: "چرا این شانه باریک است؟ تناسب حلقه را مثل مطالعهٔ میکل‌آنژ بخوانید.",
        href: "/employee/skills",
        ctaFa: "نقشه شایستگی",
      },
      {
        id: "practice",
        titleFa: "عملی ساخت ذهنی",
        bodyFa: "شکل‌دهی لمسی طلا، نگین، صاف‌کاری و ارائه ۳D.",
        href: "/employee/studio",
        ctaFa: "استودیو ۳D",
      },
      {
        id: "design",
        titleFa: "طراحی روی SKU",
        bodyFa: "هر محصول کاتالوگ یک بوم brainstorm دارد — واریانت بسازید.",
        href: "/employee/products",
        ctaFa: "ویترین → ۳D",
      },
      {
        id: "exam",
        titleFa: "سنجش چشم",
        bodyFa: "آزمون محصول + ارائه کارت ایده — دانش و دقت بصری.",
        href: "/employee/quiz",
        ctaFa: "آزمونک محصول",
      },
    ],
    signals: [
      "لذت از شکل و نور",
      "صبر روی جزئیات ساخت",
      "ترجیح کارگاه به چانه‌زنی",
    ],
  },
  {
    id: "ideator",
    titleFa: "ایده‌پرداز فروشگاه",
    shortFa: "واریانت، ست، روایت",
    promiseFa:
      "دوره عمیق: brainstorm سه‌مسیره هر محصول، ست‌سازی، و روایت ارائه — تا بدانید ایده‌پرداز کف گالری هستید.",
    outcomeFa:
      "اگر ذهن‌تان سریع واریانت، ست و داستان می‌سازد و به تیم فروش ایده می‌دهد، مسیر ایده‌پردازی برای شماست.",
    jobRole: "ideator",
    learningPathId: "path_ideator",
    accent: "#6b5a3e",
    sculptureSlot: "products",
    faculties: ["خلاقیت کاربردی", "استدلال ست", "روایت", "هم‌افزایی تیم"],
    pillars: [
      {
        id: "theory",
        titleFa: "تئوری روایت محصول",
        bodyFa: "سبک، سیاق و زبان ویترین — ایده باید قابل‌فروش باشد.",
        href: "/employee/products",
        ctaFa: "کاتالوگ آموزشی",
      },
      {
        id: "reasoning",
        titleFa: "استدلال ست",
        bodyFa: "چرا این پلاک با آن زنجیر؟ ارتقا بدون فشار.",
        href: "/employee/studio?product=zardis-sun",
        ctaFa: "ایده پلاک زردیس",
      },
      {
        id: "practice",
        titleFa: "عملی brainstorm",
        bodyFa: "سه مسیر هر SKU: واریانت · ارائه · ست — برای کمک به فروشگاه.",
        href: "/employee/studio",
        ctaFa: "لیست ایده‌پردازی",
      },
      {
        id: "design",
        titleFa: "ساخت و ارائه ایده",
        bodyFa: "عکس کارت ایده بگیرید و برای هم‌تیمی ارائه ۳D دهید.",
        href: "/employee/studio?product=chain-venezia-18",
        ctaFa: "ایده زنجیر ونیزی",
      },
      {
        id: "exam",
        titleFa: "سنجش ایده کاربردی",
        bodyFa: "سناریوی فروش + آزمونک — ایده باید به بستن کمک کند.",
        href: "/employee/scenario/sc_sales_budget",
        ctaFa: "سناریو + ایده",
      },
    ],
    signals: [
      "ذهن پر از «چه می‌شود اگر»",
      "لذت از کمک به تیم فروش",
      "ترکیب خلاقیت و کاربرد",
    ],
  },
];

export function getCareerTrack(id: CareerTrackId): CareerTrack {
  return CAREER_TRACKS.find((t) => t.id === id) ?? CAREER_TRACKS[0]!;
}

export function trackByJobRole(role: JobRole): CareerTrack | undefined {
  return CAREER_TRACKS.find((t) => t.jobRole === role);
}

export const CAREER_TRACK_LABELS: Record<CareerTrackId, string> = {
  salesperson: "فروشنده",
  accountant: "حسابدار",
  designer: "طراح",
  ideator: "ایده‌پرداز",
};
