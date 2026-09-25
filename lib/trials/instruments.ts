/**
 * Real trial instruments — produce measurable outputs (not decorative toggles).
 * Uses live XAUIRR market feed + shop pricing formula.
 */

import {
  calculateGoldPrice,
  type GoldCalculationBreakdown,
} from "@/lib/calculation";
import type { PricingFormulaConfig } from "@/lib/types";
import {
  getLatest,
  simulateNextTick,
  type MarketTick,
} from "@/platform/market/feed";

export type InstrumentKind =
  | "fx_board"
  | "scale"
  | "price_sheet"
  | "caliper"
  | "melt_yield"
  | "xrf"
  | "orbit3d"
  | "dual_key"
  | "acid_kit"
  | "uv_lamp";

export type InstrumentSpec = {
  kind: InstrumentKind;
  /** Piece weight for scale / price / melt */
  weightGrams?: number;
  karat?: 18 | 21 | 22 | 24;
  /** Caliper target (mm) */
  expectedMm?: number;
  toleranceMm?: number;
  /** Melt: max acceptable loss % */
  maxLossPct?: number;
  /** XRF: claimed karat by seller */
  claimedKarat?: number;
  /** True assayed karat (hidden from trainee until they run XRF) */
  trueKarat?: number;
  /** Min degrees of 3D orbit before inspect answers unlock */
  minOrbitDeg?: number;
  /** Price quote must be within this % of formula total */
  tolerancePct?: number;
  /** Acid test expected result */
  acidExpect?: "pass_18k" | "fail" | "pass_21k";
  /** UV banknote expect */
  uvExpect?: "genuine" | "suspect";
};

export type InstrumentReading = {
  toolId: string;
  kind: InstrumentKind;
  at: string;
  stepId?: string;
  values: Record<string, number | string | boolean>;
  ok: boolean;
  detailFa: string;
};

export type InstrumentInput = {
  /** User-entered scale reading */
  measuredGrams?: number;
  /** User-entered caliper reading */
  measuredMm?: number;
  /** User-declared melt out weight */
  outGrams?: number;
  /** User-declared quote total (rial) */
  quotedTotal?: number;
  /** Orbit degrees accumulated in 3D */
  orbitDeg?: number;
  /** Dual-control second person present */
  secondPersonPresent?: boolean;
  /** Acid result user selected after running kit */
  acidResult?: "pass_18k" | "fail" | "pass_21k";
  /** UV result */
  uvResult?: "genuine" | "suspect";
};

function nowIso(): string {
  return new Date().toISOString();
}

/** Pull / advance market tick — real feed, not a static mirror. */
export function readFxBoard(): {
  tick: MarketTick;
  usd: MarketTick;
  detailFa: string;
} {
  const tick = simulateNextTick("XAUIRR");
  const usd = getLatest("USDIRR") as MarketTick;
  return {
    tick,
    usd,
    detailFa: `XAUIRR ${Math.round(tick.price).toLocaleString("fa-IR")} · bid ${Math.round(tick.bid).toLocaleString("fa-IR")} · ask ${Math.round(tick.ask).toLocaleString("fa-IR")} · USD ${Math.round(usd.price).toLocaleString("fa-IR")} · seq ${tick.seq}`,
  };
}

export function runScale(
  toolId: string,
  trueGrams: number,
  measuredGrams: number | undefined
): InstrumentReading {
  const reading = measuredGrams ?? trueGrams;
  const delta = Math.abs(reading - trueGrams);
  const ok = delta <= 0.02;
  return {
    toolId,
    kind: "scale",
    at: nowIso(),
    values: { trueGrams, measuredGrams: reading, deltaGrams: Number(delta.toFixed(3)) },
    ok,
    detailFa: ok
      ? `ترازو: ${reading.toFixed(2)}g (Δ ${delta.toFixed(3)}g ≤ ۰٫۰۲)`
      : `ترازو خارج تلرانس: ${reading.toFixed(2)}g در برابر ${trueGrams.toFixed(2)}g`,
  };
}

export function runPriceSheet(
  toolId: string,
  config: PricingFormulaConfig,
  weightGrams: number,
  karat: 18 | 21 | 22 | 24,
  quotedTotal: number | undefined,
  tolerancePct = 1
): InstrumentReading & { breakdown: GoldCalculationBreakdown; livePrice: number } {
  const live = (getLatest("XAUIRR") as MarketTick).price;
  const breakdown = calculateGoldPrice(config, {
    weightGrams,
    karat,
    goldPricePerGram18k: live,
  });
  const quoted = quotedTotal ?? breakdown.total;
  const errPct =
    breakdown.total === 0
      ? 100
      : (Math.abs(quoted - breakdown.total) / breakdown.total) * 100;
  const ok = errPct <= tolerancePct;
  return {
    toolId,
    kind: "price_sheet",
    at: nowIso(),
    values: {
      weightGrams,
      karat,
      liveXauIrr: live,
      goldValue: breakdown.goldValue,
      makingFee: breakdown.makingFee,
      profit: breakdown.profit,
      vat: breakdown.vat,
      formulaTotal: breakdown.total,
      quotedTotal: quoted,
      errorPct: Number(errPct.toFixed(3)),
    },
    ok,
    detailFa: ok
      ? `برگه قیمت: ${breakdown.total.toLocaleString("fa-IR")} ریال (نرخ زنده · خطای ${errPct.toFixed(2)}٪)`
      : `نقل‌قول خارج تلرانس: ${quoted.toLocaleString("fa-IR")} در برابر ${breakdown.total.toLocaleString("fa-IR")} (خطا ${errPct.toFixed(2)}٪)`,
    breakdown,
    livePrice: live,
  };
}

export function runCaliper(
  toolId: string,
  expectedMm: number,
  measuredMm: number | undefined,
  toleranceMm = 0.2
): InstrumentReading {
  const m = measuredMm ?? expectedMm;
  const delta = Math.abs(m - expectedMm);
  const ok = delta <= toleranceMm;
  return {
    toolId,
    kind: "caliper",
    at: nowIso(),
    values: { expectedMm, measuredMm: m, deltaMm: Number(delta.toFixed(3)), toleranceMm },
    ok,
    detailFa: ok
      ? `کولیس: ${m.toFixed(2)}mm (Δ ${delta.toFixed(2)} ≤ ${toleranceMm})`
      : `کولیس خارج تلرانس: ${m.toFixed(2)}mm در برابر ${expectedMm.toFixed(2)}mm`,
  };
}

export function runMeltYield(
  toolId: string,
  inGrams: number,
  outGrams: number | undefined,
  maxLossPct = 0.5
): InstrumentReading {
  const out = outGrams ?? inGrams * 0.997;
  const lossPct = inGrams === 0 ? 100 : ((inGrams - out) / inGrams) * 100;
  const ok = lossPct >= 0 && lossPct <= maxLossPct && out > 0 && out <= inGrams;
  return {
    toolId,
    kind: "melt_yield",
    at: nowIso(),
    values: {
      inGrams,
      outGrams: Number(out.toFixed(3)),
      lossPct: Number(lossPct.toFixed(3)),
      maxLossPct,
    },
    ok,
    detailFa: ok
      ? `ذوب: ورودی ${inGrams.toFixed(2)}g → خروجی ${out.toFixed(2)}g · افت ${lossPct.toFixed(2)}٪`
      : `افت ذوب غیرمجاز: ${lossPct.toFixed(2)}٪ (حد ${maxLossPct}٪)`,
  };
}

export function runXrf(
  toolId: string,
  claimedKarat: number,
  trueKarat: number
): InstrumentReading {
  const ok = trueKarat === claimedKarat;
  return {
    toolId,
    kind: "xrf",
    at: nowIso(),
    values: { claimedKarat, assayedKarat: trueKarat, match: ok },
    ok: true, // running the gun always succeeds; match is informational
    detailFa: `XRF: ادعای ${claimedKarat}k · سنجش ${trueKarat}k ${ok ? "· تطابق" : "· مغایرت — خرید مشروط"}`,
  };
}

export function runOrbit3d(
  toolId: string,
  orbitDeg: number,
  minOrbitDeg = 90
): InstrumentReading {
  const ok = orbitDeg >= minOrbitDeg;
  return {
    toolId,
    kind: "orbit3d",
    at: nowIso(),
    values: { orbitDeg: Math.round(orbitDeg), minOrbitDeg },
    ok,
    detailFa: ok
      ? `بازرسی ۳D کامل: ${Math.round(orbitDeg)}° چرخش`
      : `چرخش ناکافی: ${Math.round(orbitDeg)}° از ${minOrbitDeg}° لازم`,
  };
}

export function runDualKey(
  toolId: string,
  secondPersonPresent: boolean
): InstrumentReading {
  return {
    toolId,
    kind: "dual_key",
    at: nowIso(),
    values: { secondPersonPresent },
    ok: secondPersonPresent,
    detailFa: secondPersonPresent
      ? "Dual Control تأیید شد — نفر دوم حاضر است"
      : "Dual Control نقض — نفر دوم غایب؛ باز کردن ممنوع",
  };
}

export function runAcidKit(
  toolId: string,
  expect: InstrumentSpec["acidExpect"],
  result: InstrumentInput["acidResult"]
): InstrumentReading {
  const r = result ?? expect ?? "pass_18k";
  const ok = r === expect;
  return {
    toolId,
    kind: "acid_kit",
    at: nowIso(),
    values: { expect: expect ?? "", result: r, match: ok },
    ok,
    detailFa: ok
      ? `اسید محک: نتیجه ${r} مطابق انتظار`
      : `اسید محک: ${r} ≠ انتظار ${expect}`,
  };
}

export function runUvLamp(
  toolId: string,
  expect: InstrumentSpec["uvExpect"],
  result: InstrumentInput["uvResult"]
): InstrumentReading {
  const r = result ?? expect ?? "genuine";
  const ok = r === expect;
  return {
    toolId,
    kind: "uv_lamp",
    at: nowIso(),
    values: { expect: expect ?? "", result: r, match: ok },
    ok,
    detailFa: ok
      ? `UV: ${r === "genuine" ? "اسکناس معتبر" : "مشکوک — پروتکل جعل"}`
      : `UV نادرست ثبت شد`,
  };
}

/** Dispatch instrument by tool/spec — single entry for workbench + scorer. */
export function runInstrument(
  toolId: string,
  spec: InstrumentSpec,
  input: InstrumentInput,
  config: PricingFormulaConfig
): InstrumentReading {
  switch (spec.kind) {
    case "fx_board": {
      const fx = readFxBoard();
      return {
        toolId,
        kind: "fx_board",
        at: nowIso(),
        values: {
          xauIrr: fx.tick.price,
          bid: fx.tick.bid,
          ask: fx.tick.ask,
          usdIrr: fx.usd.price,
          seq: fx.tick.seq,
        },
        ok: true,
        detailFa: fx.detailFa,
      };
    }
    case "scale":
      return runScale(toolId, spec.weightGrams ?? 0, input.measuredGrams);
    case "price_sheet": {
      const { breakdown: _b, livePrice: _l, ...reading } = runPriceSheet(
        toolId,
        config,
        spec.weightGrams ?? 1,
        spec.karat ?? 18,
        input.quotedTotal,
        spec.tolerancePct ?? 1
      );
      return reading;
    }
    case "caliper":
      return runCaliper(
        toolId,
        spec.expectedMm ?? 0,
        input.measuredMm,
        spec.toleranceMm ?? 0.2
      );
    case "melt_yield":
      return runMeltYield(
        toolId,
        spec.weightGrams ?? 0,
        input.outGrams,
        spec.maxLossPct ?? 0.5
      );
    case "xrf":
      return runXrf(
        toolId,
        spec.claimedKarat ?? 18,
        spec.trueKarat ?? spec.claimedKarat ?? 18
      );
    case "orbit3d":
      return runOrbit3d(toolId, input.orbitDeg ?? 0, spec.minOrbitDeg ?? 90);
    case "dual_key":
      return runDualKey(toolId, Boolean(input.secondPersonPresent));
    case "acid_kit":
      return runAcidKit(toolId, spec.acidExpect, input.acidResult);
    case "uv_lamp":
      return runUvLamp(toolId, spec.uvExpect, input.uvResult);
    default:
      return {
        toolId,
        kind: spec.kind,
        at: nowIso(),
        values: {},
        ok: false,
        detailFa: "ابزار ناشناخته",
      };
  }
}

/** Map tool id → default instrument kind when step doesn't override */
export function defaultKindForTool(toolId: string): InstrumentKind | null {
  const map: Record<string, InstrumentKind> = {
    fx_board: "fx_board",
    scale_0_01: "scale",
    price_sheet: "price_sheet",
    caliper: "caliper",
    furnace: "melt_yield",
    crucible: "melt_yield",
    ingot_mold: "melt_yield",
    xrf_gun: "xrf",
    studio_orbit: "orbit3d",
    dual_key: "dual_key",
    acid_kit: "acid_kit",
    uv_lamp: "uv_lamp",
  };
  return map[toolId] ?? null;
}
