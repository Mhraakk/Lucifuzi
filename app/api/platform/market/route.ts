import { NextResponse } from "next/server";
import { marketSnapshot } from "@/platform/bff";
import { simulateNextTick } from "@/platform/market/feed";
import { publish } from "@/platform/events/bus";
import { assertCan, workerPrincipal, servicePrincipal } from "@/platform/auth/rbac";
import { securityHeaders, log } from "@/platform/observability";
import { isEnabled } from "@/platform/flags";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const principal = servicePrincipal();
  assertCan(principal, "market:read");
  const url = new URL(req.url);
  if (url.searchParams.get("tick") === "1" && isEnabled("platform.live_market_worker")) {
    const worker = workerPrincipal();
    assertCan(worker, "market:write");
    const tick = simulateNextTick("XAUIRR");
    await publish("market.tick", worker.orgId, {
      instrument: tick.instrument,
      price: tick.price,
      seq: tick.seq,
      via: "cron",
    });
  }
  const snap = marketSnapshot();
  return NextResponse.json(snap, { headers: securityHeaders() });
}

export async function POST(req: Request) {
  if (!isEnabled("platform.live_market_worker")) {
    return NextResponse.json(
      { error: "market worker flag disabled" },
      { status: 403, headers: securityHeaders() }
    );
  }
  const principal = workerPrincipal();
  assertCan(principal, "market:write");
  const body = (await req.json().catch(() => ({}))) as {
    instrument?: "XAUIRR" | "XAUUSD" | "USDIRR";
  };
  const tick = simulateNextTick(body.instrument ?? "XAUIRR");
  await publish("market.tick", principal.orgId, {
    instrument: tick.instrument,
    price: tick.price,
    seq: tick.seq,
  });
  log("info", "market tick ingested", { seq: tick.seq }, "market");
  return NextResponse.json({ tick }, { headers: securityHeaders() });
}
