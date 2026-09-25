/**
 * Public-domain Italian sculptural atmospheres for Arya training.
 * Sources: Cleveland Museum of Art CC0, Met Museum Open Access.
 * Used as the visual filter that trains eye, judgment, and precision.
 */

export type SculptureSlot =
  | "intro"
  | "home"
  | "learn"
  | "theory"
  | "practice"
  | "skills"
  | "studio"
  | "products"
  | "wall"
  | "login";

export type SculptureWork = {
  id: string;
  file: string;
  src: string;
  artist: string;
  title: string;
  school: string;
  /** What this image trains in staff */
  trains: string;
};

const ROOT = "/atelier/sculptures";

export const SCULPTURE_WORKS: Record<string, SculptureWork> = {
  canova: {
    id: "canova",
    file: "canova.jpg",
    src: `${ROOT}/canova.jpg`,
    artist: "آنتونیو کانوا",
    title: "ترپسیکور",
    school: "نئوکلاسیک ایتالیا",
    trains: "نسبت‌های ایده‌آل، آرامش فرم، زیبایی‌شناسی کلاسیک",
  },
  bernini: {
    id: "bernini",
    file: "bernini.jpg",
    src: `${ROOT}/bernini.jpg`,
    artist: "جان لورنتسو برنینی",
    title: "سر پروسپرپینا",
    school: "باروک رم",
    trains: "حرکت در سنگ، بیان احساسی، دقت لمس سطح",
  },
  lorenzi: {
    id: "lorenzi",
    file: "david.jpg",
    src: `${ROOT}/david.jpg`,
    artist: "باتیستا دی دومنیکو لورنتزی",
    title: "آلفئوس و آرثوسا",
    school: "رنسانس فلورانس",
    trains: "روایت در فرم، تعادل دینامیک، خواندن ترکیب",
  },
  lombardo: {
    id: "lombardo",
    file: "pieta.jpg",
    src: `${ROOT}/pieta.jpg`,
    artist: "تولیو لومباردو",
    title: "جنگجوی جوان",
    school: "رنسانس ونیز",
    trains: "تشخیص حجم، تناسب آناتومی، نگاه دقیق",
  },
  sansovino: {
    id: "sansovino",
    file: "sansovino.jpg",
    src: `${ROOT}/sansovino.jpg`,
    artist: "یاکوپو سانسووینو",
    title: "مریم و کودک",
    school: "رنسانس عالی",
    trains: "نرمی سطح، مهربانی فرم، دقت جزئیات",
  },
  mino: {
    id: "mino",
    file: "mino.jpg",
    src: `${ROOT}/mino.jpg`,
    artist: "مینو دا فیسوله",
    title: "ژولیوس سزار",
    school: "کواتروچنتو فلورانس",
    trains: "وضوح پروفایل، نشانه‌گذاری دقیق، هویت قطعه",
  },
  giambologna: {
    id: "giambologna",
    file: "giambologna.jpg",
    src: `${ROOT}/giambologna.jpg`,
    artist: "جامبولونیا",
    title: "فاتا مورگانا",
    school: "مانریسم فلورانس",
    trains: "پیچش فرم، ظرافت خط، ارائه در فضا",
  },
  michelangelo: {
    id: "michelangelo",
    file: "mich-sistine.jpg",
    src: `${ROOT}/mich-sistine.jpg`,
    artist: "میکل‌آنژ بووناروتی",
    title: "مطالعهٔ پیکر برای سقف سیستین",
    school: "رنسانس عالی فلورانس",
    trains: "استدلال بصری، آناتومی، دقت طراحی پیش از ساخت",
  },
  michYouth: {
    id: "michYouth",
    file: "mich-youth.jpg",
    src: `${ROOT}/mich-youth.jpg`,
    artist: "میکل‌آنژ بووناروتی",
    title: "جوان برهنه — مطالعهٔ سیستین",
    school: "رنسانس عالی",
    trains: "مشاهدهٔ ساختاری، بینایی تحلیلی، دستِ دقیق",
  },
  michFigures: {
    id: "michFigures",
    file: "mich-figures.jpg",
    src: `${ROOT}/mich-figures.jpg`,
    artist: "میکل‌آنژ بووناروتی",
    title: "مطالعات پیکر سقف سیستین",
    school: "رنسانس عالی",
    trains: "تکرار مطالعه، اصلاح چشم، استدلال فرمی",
  },
  duccio: {
    id: "duccio",
    file: "moses.jpg",
    src: `${ROOT}/moses.jpg`,
    artist: "آگوستینو دی آنتونیو دوچو",
    title: "نقش‌برجستهٔ قدیسه بریگیت",
    school: "کواتروچنتو",
    trains: "عمق نقش، خواندن سطح، جزئیات روایی",
  },
  finelli: {
    id: "finelli",
    file: "night.jpg",
    src: `${ROOT}/night.jpg`,
    artist: "جولیانو فینلی (حلقه برنینی)",
    title: "کاردینال اسکیپیونه بورگزه",
    school: "باروک رم",
    trains: "شباهت چهره، بافت پارچه در سنگ، دقت پرتره",
  },
  parodi: {
    id: "parodi",
    file: "parodi.jpg",
    src: `${ROOT}/parodi.jpg`,
    artist: "فیلیپو پارودی",
    title: "کودک خفته",
    school: "باروک جنوا",
    trains: "نرمی لمسی، آرامش فرم، حس ماده",
  },
};

/** Map app surfaces → sculpture atmosphere (marble stone, never cream chalk paper) */
export const SCULPTURE_SLOTS: Record<SculptureSlot, string> = {
  intro: "canova",
  login: "bernini",
  home: "finelli",
  learn: "lorenzi",
  theory: "duccio",
  practice: "bernini",
  skills: "mino",
  studio: "parodi",
  products: "giambologna",
  wall: "lombardo",
};

export function sculptureSrc(slot: SculptureSlot): string {
  const id = SCULPTURE_SLOTS[slot];
  return SCULPTURE_WORKS[id]?.src ?? `${ROOT}/canova.jpg`;
}

export function sculptureWork(slot: SculptureSlot): SculptureWork {
  const id = SCULPTURE_SLOTS[slot];
  return SCULPTURE_WORKS[id] ?? SCULPTURE_WORKS.canova!;
}

/** Resolve ambient backdrop from current employee route */
export function sculptureSlotFromPath(pathname: string): SculptureSlot {
  if (pathname.includes("/learn") || pathname.includes("/courses") || pathname.includes("/lessons")) {
    return "learn";
  }
  if (pathname.includes("/practice") || pathname.includes("/scenario") || pathname.includes("/quiz") || pathname.includes("/formula")) {
    return "practice";
  }
  if (pathname.includes("/studio")) return "studio";
  if (pathname.includes("/products")) return "products";
  if (pathname.includes("/skills") || pathname.includes("/certificates")) {
    return "skills";
  }
  if (pathname.includes("/home")) return "home";
  return "wall";
}

/** Five eye-training faculties this app filters staff through */
export const VISUAL_FACULTIES = [
  {
    id: "sight",
    title: "بینایی",
    body: "دیدن ساختار، نور، و نقص قبل از حرف زدن — مثل مطالعهٔ میکل‌آنژ.",
  },
  {
    id: "reason",
    title: "استدلال بصری",
    body: "چرا این فرم درست است؟ تناسب، تعادل، و روایت قطعه را توضیح دهید.",
  },
  {
    id: "aesthetic",
    title: "زیبایی‌سنجی",
    body: "تشخیص کیفیت ارائه روی سینی، ویترین، و نور — نه سلیقهٔ شخصی خام.",
  },
  {
    id: "precision",
    title: "دقت",
    body: "عیار، وزن، اجرت، و جزئیات ساخت را با همان سخت‌گیری نقش‌برجسته بخوانید.",
  },
  {
    id: "craft",
    title: "مهارت لمسی",
    body: "دست و چشم با هم: لمس استاندارد ویترین، ارائه، و ساخت ذهنی در استودیو.",
  },
] as const;

export const TRAINING_GENRES = [
  {
    id: "theory",
    title: "تئوری",
    sculpture: "duccio" as const,
    body: "درس، استاندارد US·CH·EU، و مطالعهٔ فرم — منبع دانش چشم و استدلال.",
    href: "/employee/learn",
  },
  {
    id: "practice",
    title: "عملی",
    sculpture: "bernini" as const,
    body: "سناریو، فرمول، ویترین، و ارزیابی مشاهده‌شده — منبع مهارت واقعی.",
    href: "/employee/practice",
  },
] as const;
