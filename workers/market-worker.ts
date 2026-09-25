/**
 * Layer 20 — Persistent market worker
 * Run: npm run worker:market
 * Optionally posts heartbeats to /api/platform/market when ARYA_BFF_URL is set.
 */

import {
  simulateNextTick,
  getLatest,
  type Instrument,
} from "../platform/market/feed";
import { publish } from "../platform/events/bus";
import { log } from "../platform/observability";
import { isEnabled } from "../platform/flags";

const INTERVAL_MS = Number(process.env.MARKET_WORKER_INTERVAL_MS ?? 3000);
const INSTRUMENTS: Instrument[] = ["XAUIRR", "XAUUSD", "USDIRR"];
const BFF = process.env.ARYA_BFF_URL; // e.g. http://localhost:3000

let running = true;

async function tickOnce(): Promise<void> {
  if (!isEnabled("platform.live_market_worker")) {
    log("warn", "market worker flag off — idle", {}, "worker");
    return;
  }
  for (const instrument of INSTRUMENTS) {
    const t = simulateNextTick(instrument);
    await publish("market.tick", "org_arya", {
      instrument: t.instrument,
      price: t.price,
      seq: t.seq,
      source: "worker",
    });
  }
  await publish("worker.heartbeat", "org_arya", {
    at: new Date().toISOString(),
    latest: JSON.stringify(getLatest()),
  });
  log("info", "heartbeat", { instruments: INSTRUMENTS.length }, "worker");

  if (BFF) {
    try {
      await fetch(`${BFF}/api/platform/market`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instrument: "XAUIRR" }),
      });
    } catch (e) {
      log(
        "warn",
        "BFF push failed",
        { error: e instanceof Error ? e.message : "unknown" },
        "worker"
      );
    }
  }
}

async function main(): Promise<void> {
  log("info", "market worker started", { INTERVAL_MS, BFF: BFF ?? null }, "worker");
  process.on("SIGINT", () => {
    running = false;
  });
  process.on("SIGTERM", () => {
    running = false;
  });

  while (running) {
    try {
      await tickOnce();
    } catch (e) {
      log(
        "error",
        "tick failed",
        { error: e instanceof Error ? e.message : "unknown" },
        "worker"
      );
    }
    await new Promise((r) => setTimeout(r, INTERVAL_MS));
  }
  log("info", "market worker stopped", {}, "worker");
}

void main();
