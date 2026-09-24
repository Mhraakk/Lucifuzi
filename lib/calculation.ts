import type { PricingFormulaConfig } from "./types";

export interface GoldCalculationInput {
  /** وزن به گرم */
  weightGrams: number;
  /**
   * عیار قطعه. پیش‌فرض ۱۸ (معادل ۷۵۰).
   * اگر ۲۴ یا ۹۹۹ بدهید، قیمت گرم نسبت به ۱۸ عیار تعدیل می‌شود.
   */
  karat?: 18 | 21 | 22 | 24;
  /** override قیمت هر گرم ۱۸ عیار (ریال) — وگرنه از config */
  goldPricePerGram18k?: number;
  makingFeePercent?: number;
  profitPercent?: number;
  vatPercent?: number;
  fixedFee?: number;
}

/** Payload shape used by interactive quiz calculator UI */
export interface QuotationPayload {
  weightGrams: number;
  karat: number;
  pricePerGram: number;
  makingChargePerGram: number;
  profitPercent: number;
  vatPercent?: number;
}

export interface GoldCalculationBreakdown {
  weightGrams: number;
  karat: number;
  goldPricePerGramUsed: number;
  goldValue: number;
  makingFee: number;
  profit: number;
  subtotalBeforeVat: number;
  vat: number;
  fixedFee: number;
  total: number;
}

const KARAT_TO_PURITY: Record<number, number> = {
  18: 750,
  21: 875,
  22: 916,
  24: 999,
};

/** قیمت هر گرم برای عیار داده‌شده نسبت به پایه ۱۸ عیار */
export function pricePerGramForKarat(price18k: number, karat: number): number {
  const purity = KARAT_TO_PURITY[karat] ?? 750;
  return (price18k * purity) / 750;
}

/**
 * محاسبه قیمت نهایی طلا طبق فرمول قابل پیکربندی فروشگاه.
 *
 * total = (goldValue + makingFee + profit) * (1 + vat%) + fixedFee
 * where makingFee = goldValue * makingFee%
 *       profit    = goldValue * profit%
 */
export function calculateGoldPrice(
  config: PricingFormulaConfig,
  input: GoldCalculationInput
): GoldCalculationBreakdown {
  if (input.weightGrams < 0) {
    throw new Error("وزن نمی‌تواند منفی باشد");
  }

  const karat = input.karat ?? 18;
  const price18k = input.goldPricePerGram18k ?? config.goldPricePerGram18k;
  const makingPct = input.makingFeePercent ?? config.makingFeePercent;
  const profitPct = input.profitPercent ?? config.profitPercent;
  const vatPct = input.vatPercent ?? config.vatPercent;
  const fixedFee = input.fixedFee ?? config.fixedFee;

  const goldPricePerGramUsed = pricePerGramForKarat(price18k, karat);
  const goldValue = input.weightGrams * goldPricePerGramUsed;
  const makingFee = goldValue * (makingPct / 100);
  const profit = goldValue * (profitPct / 100);
  const subtotalBeforeVat = goldValue + makingFee + profit;
  const vat = subtotalBeforeVat * (vatPct / 100);
  const total = subtotalBeforeVat + vat + fixedFee;

  return {
    weightGrams: input.weightGrams,
    karat,
    goldPricePerGramUsed,
    goldValue: Math.round(goldValue),
    makingFee: Math.round(makingFee),
    profit: Math.round(profit),
    subtotalBeforeVat: Math.round(subtotalBeforeVat),
    vat: Math.round(vat),
    fixedFee: Math.round(fixedFee),
    total: Math.round(total),
  };
}

function isQuotationPayload(
  value: GoldCalculationInput | QuotationPayload
): value is QuotationPayload {
  return (
    "pricePerGram" in value &&
    "makingChargePerGram" in value &&
    typeof value.pricePerGram === "number"
  );
}

/**
 * محاسبه از payload تعاملی UI:
 * ارزش طلا = وزن × قیمت هر گرم
 * اجرت = وزن × اجرت هر گرم
 * سود = (ارزش + اجرت) × درصد سود
 * مالیات اختیاری روی جمع
 */
export function calculateFromQuotationPayload(
  payload: QuotationPayload
): GoldCalculationBreakdown & { steps: string[] } {
  const goldValue = payload.weightGrams * payload.pricePerGram;
  const makingFee = payload.weightGrams * payload.makingChargePerGram;
  const profit = (goldValue + makingFee) * (payload.profitPercent / 100);
  const subtotalBeforeVat = goldValue + makingFee + profit;
  const vatPct = payload.vatPercent ?? 0;
  const vat = subtotalBeforeVat * (vatPct / 100);
  const total = subtotalBeforeVat + vat;
  const breakdown: GoldCalculationBreakdown = {
    weightGrams: payload.weightGrams,
    karat: payload.karat,
    goldPricePerGramUsed: payload.pricePerGram,
    goldValue: Math.round(goldValue),
    makingFee: Math.round(makingFee),
    profit: Math.round(profit),
    subtotalBeforeVat: Math.round(subtotalBeforeVat),
    vat: Math.round(vat),
    fixedFee: 0,
    total: Math.round(total),
  };
  return { ...breakdown, steps: explainCalculation(breakdown) };
}

/** بررسی پاسخ محاسبه کوییز با تلورانس */
export function isCalculationAnswerCorrect(
  expected: number,
  actual: number,
  tolerance: number
): boolean {
  return Math.abs(expected - actual) <= tolerance;
}

/** متن توضیح مرحله‌به‌مرحله برای آموزش */
export function explainCalculation(breakdown: GoldCalculationBreakdown): string[] {
  return [
    `وزن: ${breakdown.weightGrams} گرم — عیار ${breakdown.karat}`,
    `قیمت هر گرم استفاده‌شده: ${breakdown.goldPricePerGramUsed.toLocaleString("en-US")} ریال`,
    `ارزش طلا: ${breakdown.goldValue.toLocaleString("en-US")} ریال`,
    `اجرت ساخت: ${breakdown.makingFee.toLocaleString("en-US")} ریال`,
    `سود: ${breakdown.profit.toLocaleString("en-US")} ریال`,
    `جمع قبل از مالیات: ${breakdown.subtotalBeforeVat.toLocaleString("en-US")} ریال`,
    `مالیات: ${breakdown.vat.toLocaleString("en-US")} ریال`,
    `هزینه ثابت: ${breakdown.fixedFee.toLocaleString("en-US")} ریال`,
    `مبلغ نهایی: ${breakdown.total.toLocaleString("en-US")} ریال`,
  ];
}

/**
 * UI-friendly calculator.
 * Accepts either store formula config + input, or quiz quotation payload (+ optional unused config).
 */
export function calculateQuotation(
  inputOrPayload: GoldCalculationInput | QuotationPayload,
  config?: PricingFormulaConfig
): GoldCalculationBreakdown & { steps: string[]; final: number } {
  if (isQuotationPayload(inputOrPayload)) {
    const result = calculateFromQuotationPayload(inputOrPayload);
    return { ...result, final: result.total };
  }
  if (!config) {
    throw new Error("پیکربندی فرمول قیمت لازم است");
  }
  const breakdown = calculateGoldPrice(config, inputOrPayload);
  return {
    ...breakdown,
    steps: explainCalculation(breakdown),
    final: breakdown.total,
  };
}
