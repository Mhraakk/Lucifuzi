/**
 * Layer 7 — Market Intelligence / Quant Engines
 */

import type { Instrument, MarketTick } from "@/platform/market/feed";
import { tickHistory } from "@/platform/market/feed";

export type QuantSnapshot = {
  instrument: Instrument;
  n: number;
  last: number;
  mean: number;
  stdev: number;
  momentumPct: number;
  signal: "neutral" | "bid_soft" | "ask_soft" | "volatile";
  adviceFa: string;
};

function stats(prices: number[]): { mean: number; stdev: number } {
  if (prices.length === 0) return { mean: 0, stdev: 0 };
  const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
  const variance =
    prices.reduce((a, b) => a + (b - mean) ** 2, 0) / prices.length;
  return { mean, stdev: Math.sqrt(variance) };
}

export function analyzeInstrument(
  instrument: Instrument,
  window = 30
): QuantSnapshot {
  const hist = tickHistory(instrument, window);
  const prices = hist.map((t: MarketTick) => t.price);
  if (prices.length === 0) {
    return {
      instrument,
      n: 0,
      last: 0,
      mean: 0,
      stdev: 0,
      momentumPct: 0,
      signal: "neutral",
      adviceFa: "هنوز داده کافی برای تحلیل نیست.",
    };
  }
  const { mean, stdev } = stats(prices);
  const last = prices[0]!;
  const oldest = prices[prices.length - 1]!;
  const momentumPct = oldest === 0 ? 0 : ((last - oldest) / oldest) * 100;
  const volRatio = mean === 0 ? 0 : stdev / mean;

  let signal: QuantSnapshot["signal"] = "neutral";
  if (volRatio > 0.004) signal = "volatile";
  else if (momentumPct > 0.15) signal = "ask_soft";
  else if (momentumPct < -0.15) signal = "bid_soft";

  const adviceFa =
    signal === "volatile"
      ? "نوسان بالاست — اجرت را شفاف بگویید و از قول قیمت ثابت خودداری کنید."
      : signal === "ask_soft"
        ? "مومنتوم صعودی ملایم — توضیح اجزای قیمت کافی است، فشار نیاورید."
        : signal === "bid_soft"
          ? "مومنتوم نزولی — روی ارزش ماندگار و خدمات تمرکز کنید."
          : "بازار آرام — فرمول استاندارد شعبه را اعمال کنید.";

  return {
    instrument,
    n: prices.length,
    last,
    mean,
    stdev,
    momentumPct,
    signal,
    adviceFa,
  };
}

export function shopFloorIntel(): {
  xauirr: QuantSnapshot;
  headlineFa: string;
} {
  const xauirr = analyzeInstrument("XAUIRR", 40);
  return {
    xauirr,
    headlineFa: `هوش بازار: ${xauirr.signal} · ${xauirr.adviceFa}`,
  };
}
