/** Persian / Jalali formatting helpers — no external locale libs required */

const PERSIAN_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"] as const;

/** Convert Latin digits in a string to Persian digits */
export function toPersianDigits(value: string | number): string {
  return String(value).replace(/\d/g, (d) => PERSIAN_DIGITS[Number(d)] ?? d);
}

/** Convert Persian/Arabic digits to Latin */
export function toLatinDigits(value: string): string {
  return value
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - "۰".charCodeAt(0)))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - "٠".charCodeAt(0)));
}

/** Format integer/float with Persian digits and thousand separators */
export function formatNumber(
  value: number,
  optionsOrDecimals?: number | { decimals?: number; persianDigits?: boolean }
): string {
  const options =
    typeof optionsOrDecimals === "number"
      ? { decimals: optionsOrDecimals }
      : optionsOrDecimals;
  const decimals = options?.decimals ?? 0;
  const usePersian = options?.persianDigits ?? true;
  const fixed = value.toFixed(decimals);
  const [intPart, fracPart] = fixed.split(".");
  const withSep = (intPart ?? "0").replace(/\B(?=(\d{3})+(?!\d))/g, "٬");
  const combined = fracPart !== undefined ? `${withSep}.${fracPart}` : withSep;
  return usePersian ? toPersianDigits(combined) : combined;
}

/** Format Rial amount (ریال) with Persian digits */
export function formatRial(amount: number, options?: { persianDigits?: boolean }): string {
  return `${formatNumber(Math.round(amount), { persianDigits: options?.persianDigits })} ریال`;
}

/** UI alias for money display */
export function formatCurrency(amount: number): string {
  return `${formatNumber(Math.round(amount))} تومان`;
}

export function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Format Toman (amount in Rials ÷ 10) */
export function formatToman(rialAmount: number, options?: { persianDigits?: boolean }): string {
  const toman = Math.round(rialAmount / 10);
  return `${formatNumber(toman, { persianDigits: options?.persianDigits })} تومان`;
}

/** Format percent with Persian digits */
export function formatPercent(
  value: number,
  options?: { decimals?: number; persianDigits?: boolean }
): string {
  return `${formatNumber(value, {
    decimals: options?.decimals ?? 0,
    persianDigits: options?.persianDigits,
  })}٪`;
}

/** Format knowledge score 0–100 */
export function formatKnowledgeLevel(score: number): string {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  return `${toPersianDigits(clamped)} از ۱۰۰`;
}

/* ─── Jalali calendar (algorithmic, no deps) ─── */

interface JalaliDateParts {
  jy: number;
  jm: number;
  jd: number;
}

const JALALI_MONTHS = [
  "فروردین",
  "اردیبهشت",
  "خرداد",
  "تیر",
  "مرداد",
  "شهریور",
  "مهر",
  "آبان",
  "آذر",
  "دی",
  "بهمن",
  "اسفند",
] as const;

const WEEKDAYS = [
  "یکشنبه",
  "دوشنبه",
  "سه‌شنبه",
  "چهارشنبه",
  "پنجشنبه",
  "جمعه",
  "شنبه",
] as const;

function div(a: number, b: number): number {
  return Math.floor(a / b);
}

/** Gregorian → Jalali (standard algorithmic conversion) */
export function gregorianToJalali(gy: number, gm: number, gd: number): JalaliDateParts {
  const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  let jy: number;
  let days: number;

  const gy2 = gm > 2 ? gy + 1 : gy;
  const leapAdjust =
    div(gy2, 4) - div(gy2, 100) + div(gy2, 400) - 80 + gd + (g_d_m[gm - 1] ?? 0);

  if (gy > 1600) {
    jy = 979;
    days = 365 * (gy - 1600) + leapAdjust;
  } else {
    jy = 0;
    days = 365 * (gy - 621) + leapAdjust;
  }

  jy += 33 * div(days, 12053);
  days %= 12053;
  jy += 4 * div(days, 1461);
  days %= 1461;
  if (days > 365) {
    jy += div(days - 1, 365);
    days = (days - 1) % 365;
  }
  const jm = days < 186 ? 1 + div(days, 31) : 7 + div(days - 186, 30);
  const jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30);
  return { jy, jm, jd };
}

export function parseIsoDate(iso: string): Date {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid date: ${iso}`);
  }
  return d;
}

export function toJalaliParts(isoOrDate: string | Date): JalaliDateParts {
  const d = typeof isoOrDate === "string" ? parseIsoDate(isoOrDate) : isoOrDate;
  return gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

/** e.g. ۱۴۰۴/۰۶/۰۲ */
export function formatJalaliDate(
  isoOrDate: string | Date,
  options?: { persianDigits?: boolean }
): string {
  const { jy, jm, jd } = toJalaliParts(isoOrDate);
  const raw = `${jy}/${String(jm).padStart(2, "0")}/${String(jd).padStart(2, "0")}`;
  return options?.persianDigits === false ? raw : toPersianDigits(raw);
}

/** e.g. دوشنبه ۲ شهریور ۱۴۰۴ */
export function formatJalaliLong(
  isoOrDate: string | Date,
  options?: { persianDigits?: boolean }
): string {
  const d = typeof isoOrDate === "string" ? parseIsoDate(isoOrDate) : isoOrDate;
  const { jy, jm, jd } = gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate());
  const monthName = JALALI_MONTHS[jm - 1] ?? "";
  const weekday = WEEKDAYS[d.getDay()] ?? "";
  const raw = `${weekday} ${jd} ${monthName} ${jy}`;
  return options?.persianDigits === false ? raw : toPersianDigits(raw);
}

/** Relative-ish short time for lists */
export function formatJalaliDateTime(isoOrDate: string | Date): string {
  const d = typeof isoOrDate === "string" ? parseIsoDate(isoOrDate) : isoOrDate;
  const date = formatJalaliDate(d);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${date}، ساعت ${toPersianDigits(`${hh}:${mm}`)}`;
}

/** Format duration in minutes with Persian digits */
export function formatMinutes(minutes: number): string {
  if (minutes < 60) {
    return `${toPersianDigits(minutes)} دقیقه`;
  }
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return `${toPersianDigits(h)} ساعت`;
  return `${toPersianDigits(h)} ساعت و ${toPersianDigits(m)} دقیقه`;
}

export { JALALI_MONTHS, WEEKDAYS };
