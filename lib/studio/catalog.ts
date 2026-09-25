/** 3D jewellery atelier catalog — gold, gems, forms for staff ideation */

export type GoldKarat = 18 | 21 | 22 | 24;

export type StudioFormId =
  | "raw"
  | "ring"
  | "bracelet"
  | "chain"
  | "earring"
  | "pendant"
  | "bar"
  | "plaque";

export type GemId =
  | "diamond"
  | "ruby"
  | "emerald"
  | "sapphire"
  | "pearl"
  | "turquoise";

export type StudioTool =
  | "orbit"
  | "sculpt"
  | "place-gem"
  | "smooth"
  | "present";

export interface StudioForm {
  id: StudioFormId;
  titleFa: string;
  blurbFa: string;
  accent: string;
}

export interface StudioGem {
  id: GemId;
  titleFa: string;
  color: string;
  metalHint: string;
}

export interface GoldOption {
  karat: GoldKarat;
  titleFa: string;
  hex: string;
  metalness: number;
  roughness: number;
}

export const GOLD_OPTIONS: GoldOption[] = [
  {
    karat: 18,
    titleFa: "۱۸ عیار · زرد",
    hex: "#d4a84b",
    metalness: 0.92,
    roughness: 0.28,
  },
  {
    karat: 21,
    titleFa: "۲۱ عیار",
    hex: "#e0b24a",
    metalness: 0.94,
    roughness: 0.24,
  },
  {
    karat: 22,
    titleFa: "۲۲ عیار",
    hex: "#e8bc52",
    metalness: 0.95,
    roughness: 0.22,
  },
  {
    karat: 24,
    titleFa: "۲۴ عیار · خالص",
    hex: "#f0c65a",
    metalness: 0.98,
    roughness: 0.18,
  },
];

export const STUDIO_FORMS: StudioForm[] = [
  {
    id: "raw",
    titleFa: "ماده خام",
    blurbFa: "گلوله طلا — با انگشت شکل بدهید",
    accent: "#c4a35a",
  },
  {
    id: "ring",
    titleFa: "حلقه",
    blurbFa: "حلقه کلاسیک برای نگین مرکزی",
    accent: "#b8954a",
  },
  {
    id: "bracelet",
    titleFa: "دستبند",
    blurbFa: "حلقهٔ بزرگ مچ — قابل فرم‌دهی",
    accent: "#a67c3a",
  },
  {
    id: "chain",
    titleFa: "زنجیر",
    blurbFa: "حلقه‌های پیوسته گردن",
    accent: "#9a7032",
  },
  {
    id: "earring",
    titleFa: "گوشواره",
    blurbFa: "قطره یا حلقه گوش",
    accent: "#c9a24a",
  },
  {
    id: "pendant",
    titleFa: "آویز",
    blurbFa: "پلاک کوچک برای زنجیر",
    accent: "#8b6914",
  },
  {
    id: "bar",
    titleFa: "شمش زربد",
    blurbFa: "میله آموزشی سرمایه‌ای",
    accent: "#d4af37",
  },
  {
    id: "plaque",
    titleFa: "پلاک زردیس",
    blurbFa: "صفحه نمادین حکاکی‌پذیر",
    accent: "#b8860b",
  },
];

export const STUDIO_GEMS: StudioGem[] = [
  {
    id: "diamond",
    titleFa: "الماس",
    color: "#e8f4ff",
    metalHint: "برلیان بی‌رنگ",
  },
  {
    id: "ruby",
    titleFa: "یاقوت",
    color: "#c41e3a",
    metalHint: "قرمز آتشین",
  },
  {
    id: "emerald",
    titleFa: "زمرد",
    color: "#50c878",
    metalHint: "سبز زمردی",
  },
  {
    id: "sapphire",
    titleFa: "یاقوت کبود",
    color: "#0f52ba",
    metalHint: "آبی سلطنتی",
  },
  {
    id: "pearl",
    titleFa: "مروارید",
    color: "#f5f0e6",
    metalHint: "سفید صدفی",
  },
  {
    id: "turquoise",
    titleFa: "فیروزه",
    color: "#40e0d0",
    metalHint: "فیروزه ایرانی",
  },
];

export const STUDIO_TOOLS: Array<{
  id: StudioTool;
  titleFa: string;
  hintFa: string;
}> = [
  {
    id: "orbit",
    titleFa: "چرخش",
    hintFa: "یک انگشت بکشید تا قطعه بچرخد",
  },
  {
    id: "sculpt",
    titleFa: "شکل‌دهی",
    hintFa: "لمس کنید و بکشید — طلا نرم می‌شود",
  },
  {
    id: "smooth",
    titleFa: "صاف‌کاری",
    hintFa: "برجستگی‌ها را نرم کنید",
  },
  {
    id: "place-gem",
    titleFa: "نصب نگین",
    hintFa: "روی سطح ضربه بزنید تا نگین بنشیند",
  },
  {
    id: "present",
    titleFa: "ارائه",
    hintFa: "نمایش تمام‌صفحه برای هم‌تیمی‌ها",
  },
];
