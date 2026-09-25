/**
 * Layer 5 — Financial Domain Core (gold quotation invariants)
 */

import {
  calculateGoldPrice,
  type GoldCalculationBreakdown,
} from "@/lib/calculation";
import { pricingFormulaConfig } from "@/lib/demo-data";
import { goldPricePerGram18kFromMarket } from "@/platform/market/feed";

export type QuoteRequest = {
  orgId: string;
  branchId?: string;
  weightGrams: number;
  karat?: 18 | 21 | 22 | 24;
  makingFeePercent?: number;
  profitPercent?: number;
  vatPercent?: number;
  /** If omitted, pull live XAUIRR tick */
  goldPricePerGram18k?: number;
};

export type QuoteResult = {
  breakdown: GoldCalculationBreakdown;
  marketSourcePrice: number;
  usedLiveMarket: boolean;
  invariants: string[];
};

export function quoteGold(req: QuoteRequest): QuoteResult {
  if (req.weightGrams <= 0) {
    throw new Error("weightGrams must be > 0");
  }
  const live = goldPricePerGram18kFromMarket();
  const usedLive = req.goldPricePerGram18k === undefined;
  const price = req.goldPricePerGram18k ?? live;

  const breakdown = calculateGoldPrice(pricingFormulaConfig, {
    weightGrams: req.weightGrams,
    karat: req.karat ?? 18,
    goldPricePerGram18k: price,
    makingFeePercent: req.makingFeePercent,
    profitPercent: req.profitPercent,
    vatPercent: req.vatPercent,
  });

  const invariants = [
    "total >= goldValue",
    "AI cannot override formula totals",
    "WorkAuthorization never derived from quote",
  ];

  if (breakdown.total < breakdown.goldValue) {
    throw new Error("FINANCE_INVARIANT: total < goldValue");
  }

  return {
    breakdown,
    marketSourcePrice: live,
    usedLiveMarket: usedLive,
    invariants,
  };
}

export function explainQuoteToCustomer(result: QuoteResult): string {
  const b = result.breakdown;
  return [
    `وزن ${b.weightGrams} گرم · عیار ${b.karat}`,
    `ارزش طلا: ${Math.round(b.goldValue).toLocaleString("fa-IR")} ریال`,
    `اجرت: ${Math.round(b.makingFee).toLocaleString("fa-IR")} · سود: ${Math.round(b.profit).toLocaleString("fa-IR")}`,
    `مالیات: ${Math.round(b.vat).toLocaleString("fa-IR")}`,
    `جمع: ${Math.round(b.total).toLocaleString("fa-IR")} ریال`,
    result.usedLiveMarket
      ? "(نرخ از بازار زنده XAUIRR)"
      : "(نرخ دستی / override)",
  ].join("\n");
}
