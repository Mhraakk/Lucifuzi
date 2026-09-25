/**
 * Layer 17 — Replay / Backtesting
 */

import { ingestTick, resetMarketForTests, type Instrument } from "@/platform/market/feed";
import { quoteGold } from "@/platform/finance/core";
import { analyzeInstrument } from "@/platform/quant/engines";
import { publish } from "@/platform/events/bus";

export type ReplayTick = {
  instrument: Instrument;
  price: number;
  at: string;
};

export type ReplayReport = {
  ticks: number;
  finalSignal: string;
  sampleQuoteTotal: number;
  pnlProxyPct: number;
};

export function replayMarket(
  series: ReplayTick[],
  orgId = "org_arya"
): ReplayReport {
  if (series.length < 2) {
    throw new Error("Need at least 2 ticks to replay");
  }
  resetMarketForTests();
  for (const t of series) {
    ingestTick(t.instrument, t.price, "sim");
  }
  const instrument = series[0]!.instrument;
  const first = series[0]!.price;
  const last = series[series.length - 1]!.price;
  const snap = analyzeInstrument(instrument, series.length);
  const quote = quoteGold({
    orgId,
    weightGrams: 10,
    karat: 18,
  });
  const report: ReplayReport = {
    ticks: series.length,
    finalSignal: snap.signal,
    sampleQuoteTotal: quote.breakdown.total,
    pnlProxyPct: ((last - first) / first) * 100,
  };
  void publish("replay.completed", orgId, {
    ticks: report.ticks,
    signal: report.finalSignal,
    pnlProxyPct: report.pnlProxyPct,
  });
  return report;
}

/** Synthetic path for smoke backtest */
export function smokeBacktest(): ReplayReport {
  const base = 48_500_000;
  const series: ReplayTick[] = Array.from({ length: 25 }, (_, i) => ({
    instrument: "XAUIRR" as const,
    price: Math.round(base * (1 + Math.sin(i / 3) * 0.003 + i * 0.0002)),
    at: new Date(Date.now() - (25 - i) * 60_000).toISOString(),
  }));
  return replayMarket(series);
}
