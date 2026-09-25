/**
 * Verifies trial instruments produce real numeric outputs (no decorative stubs).
 * Run: npx tsx scripts/verify-trials.ts
 */

import { calculateGoldPrice } from "../lib/calculation";
import { pricingFormulaConfig } from "../lib/demo-data";
import { scoreTrial, trialById } from "../lib/trials/catalog";
import {
  readFxBoard,
  runCaliper,
  runInstrument,
  runMeltYield,
  runPriceSheet,
  runScale,
  runXrf,
} from "../lib/trials/instruments";
import {
  getLatest,
  resetMarketForTests,
  simulateNextTick,
  type MarketTick,
} from "../platform/market/feed";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

function main() {
  resetMarketForTests();

  // 1) Market feed advances with distinct seq/prices
  const a = simulateNextTick("XAUIRR");
  const b = simulateNextTick("XAUIRR");
  assert(b.seq > a.seq, "FX seq must advance");
  assert(typeof b.price === "number" && b.price > 0, "FX price must be positive");

  const fx = readFxBoard();
  assert(fx.tick.instrument === "XAUIRR", "FX instrument");
  console.log("OK fx", fx.detailFa);

  // 2) Scale tolerance
  const scaleOk = runScale("scale_0_01", 12.4, 12.4);
  const scaleBad = runScale("scale_0_01", 12.4, 12.5);
  assert(scaleOk.ok, "exact scale must pass");
  assert(!scaleBad.ok, "0.1g error must fail");
  console.log("OK scale", scaleOk.values);

  // 3) Price sheet uses live market + formula
  const live = (getLatest("XAUIRR") as MarketTick).price;
  const sheet = runPriceSheet(
    "price_sheet",
    pricingFormulaConfig,
    4.2,
    18,
    undefined,
    1
  );
  const expected = calculateGoldPrice(pricingFormulaConfig, {
    weightGrams: 4.2,
    karat: 18,
    goldPricePerGram18k: live,
  });
  assert(
    sheet.breakdown.total === expected.total,
    `quote total ${sheet.breakdown.total} !== formula ${expected.total}`
  );
  assert(sheet.ok, "auto formula quote must pass");
  console.log("OK price", {
    total: sheet.breakdown.total,
    live: sheet.livePrice,
    goldValue: sheet.breakdown.goldValue,
  });

  // 4) Melt yield
  const meltOk = runMeltYield("furnace", 12.4, 12.36, 0.5);
  const meltBad = runMeltYield("furnace", 12.4, 12.0, 0.5);
  assert(meltOk.ok, "0.32% loss must pass");
  assert(!meltBad.ok, "3.2% loss must fail");
  console.log("OK melt", meltOk.values);

  // 5) Caliper + XRF
  assert(runCaliper("caliper", 17.3, 17.3, 0.2).ok, "caliper exact");
  assert(!runCaliper("caliper", 17.3, 17.6, 0.2).ok, "caliper 17.6 fail");
  const xrf = runXrf("xrf_gun", 21, 18);
  assert(xrf.values.assayedKarat === 18, "XRF must return true karat");
  console.log("OK xrf", xrf.detailFa);

  // 6) Sales trial scoring requires instrument ok
  const trial = trialById("trial_sales_consult");
  assert(trial, "trial exists");
  const answers: Record<string, string[]> = {
    s1: ["tray_velvet"],
    s2: ["loupe_check"],
    s3: ["sheet"],
    s4: ["top"],
    s5: ["two_opts"],
  };
  const failInst = scoreTrial(trial, answers, {
    s3: { ok: false },
    s4: { ok: true },
  });
  assert(!failInst.passed, "missing price instrument must fail pass");
  assert(failInst.instrumentFails.includes("s3"), "s3 instrument fail tracked");

  const s3 = runInstrument(
    "price_sheet",
    { kind: "price_sheet", weightGrams: 4.2, karat: 18, tolerancePct: 1 },
    {},
    pricingFormulaConfig
  );
  const passInst = scoreTrial(trial, answers, {
    s3: { ok: s3.ok },
    s4: { ok: true },
  });
  assert(passInst.passed, `full answers+instruments should pass got ${passInst.percent}%`);
  console.log("OK scoreTrial", {
    percent: passInst.percent,
    score: passInst.score,
    max: passInst.max,
  });

  console.log("\nALL TRIAL INSTRUMENT CHECKS PASSED — real outputs only.");
}

main();
