/**
 * Layer 3 — BFF helpers (shared by Next route handlers)
 */

import { LAYER_CATALOG, PLATFORM_VERSION } from "@/platform/spec";
import { getLatest, simulateNextTick } from "@/platform/market/feed";
import { shopFloorIntel } from "@/platform/quant/engines";
import { eventCount, recentEvents } from "@/platform/events/bus";
import { listFlags, isEnabled } from "@/platform/flags";
import { getStorage } from "@/platform/storage";
import { recentLogs, disasterRecoverySnapshot } from "@/platform/observability";
import { smokeBacktest } from "@/platform/replay";
import type { LayerHealth } from "@/platform/observability";

export function buildHealthMatrix(): {
  version: string;
  layers: LayerHealth[];
  flags: ReturnType<typeof listFlags>;
  events: number;
  storageDriver: string;
} {
  const storage = getStorage();
  const layers: LayerHealth[] = LAYER_CATALOG.map((l) => {
    let status: LayerHealth["status"] = "ok";
    let detail = "wired";
    if (l.id === "infra" && !process.env.NEXT_PUBLIC_SUPABASE_URL) {
      status = "degraded";
      detail = "Supabase env not set — memory adapters active";
    }
    if (l.id === "model-gateway" && !process.env.OPENAI_API_KEY) {
      status = "degraded";
      detail = "OPENAI_API_KEY missing — local provider";
    }
    if (l.id === "cicd-flags" && !isEnabled("platform.ops_console")) {
      status = "down";
      detail = "ops console flag off";
    }
    return { layer: `${l.n}.${l.title}`, status, detail };
  });

  return {
    version: PLATFORM_VERSION,
    layers,
    flags: listFlags(),
    events: eventCount(),
    storageDriver: storage.driver,
  };
}

export function marketSnapshot() {
  // Ensure at least one tick exists
  simulateNextTick("XAUIRR");
  simulateNextTick("XAUUSD");
  simulateNextTick("USDIRR");
  return {
    ticks: getLatest(),
    quant: shopFloorIntel(),
  };
}

export function opsBundle() {
  return {
    health: buildHealthMatrix(),
    market: marketSnapshot(),
    events: recentEvents(20),
    logs: recentLogs(20),
    dr: disasterRecoverySnapshot(),
    replaySmoke: smokeBacktest(),
  };
}
