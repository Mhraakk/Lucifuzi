/**
 * Layer 6 — Real-Time Market Data (gold / FX ticks)
 */

export type Instrument = "XAUUSD" | "XAUIRR" | "USDIRR";

export type MarketTick = {
  instrument: Instrument;
  price: number;
  bid: number;
  ask: number;
  source: "sim" | "supabase" | "vendor";
  ts: string;
  seq: number;
};

let seq = 0;
const latest = new Map<Instrument, MarketTick>();
const history: MarketTick[] = [];
const MAX_HIST = 5000;

/** Seed realistic IR gold shop baseline (Rials / USD) */
const BASE: Record<Instrument, number> = {
  XAUUSD: 2650,
  XAUIRR: 48_500_000, // per gram 18k-ish shop display scale (demo)
  USDIRR: 620_000,
};

export function getLatest(instrument?: Instrument): MarketTick | MarketTick[] {
  if (instrument) {
    return (
      latest.get(instrument) ??
      makeTick(instrument, BASE[instrument], "sim")
    );
  }
  return (Object.keys(BASE) as Instrument[]).map(
    (i) => latest.get(i) ?? makeTick(i, BASE[i], "sim")
  );
}

function makeTick(
  instrument: Instrument,
  price: number,
  source: MarketTick["source"]
): MarketTick {
  const spread = price * 0.0008;
  return {
    instrument,
    price,
    bid: price - spread / 2,
    ask: price + spread / 2,
    source,
    ts: new Date().toISOString(),
    seq: ++seq,
  };
}

export function ingestTick(
  instrument: Instrument,
  price: number,
  source: MarketTick["source"] = "sim"
): MarketTick {
  const tick = makeTick(instrument, price, source);
  latest.set(instrument, tick);
  history.unshift(tick);
  if (history.length > MAX_HIST) history.length = MAX_HIST;
  return tick;
}

/** Simulated micro-move for persistent worker */
export function simulateNextTick(instrument: Instrument = "XAUIRR"): MarketTick {
  const prev =
    (latest.get(instrument) as MarketTick | undefined)?.price ??
    BASE[instrument];
  const shock = (Math.random() - 0.5) * 0.002; // ±0.2%
  const next = Math.max(1, prev * (1 + shock));
  return ingestTick(instrument, Math.round(next), "sim");
}

export function tickHistory(
  instrument: Instrument,
  limit = 100
): MarketTick[] {
  return history.filter((t) => t.instrument === instrument).slice(0, limit);
}

export function goldPricePerGram18kFromMarket(): number {
  const tick = getLatest("XAUIRR") as MarketTick;
  return tick.price;
}

export function resetMarketForTests(): void {
  latest.clear();
  history.length = 0;
  seq = 0;
}
