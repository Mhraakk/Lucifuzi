import { NextResponse } from "next/server";
import {
  listFlags,
  setFlag,
  type FlagKey,
  evaluateReleaseGates,
} from "@/platform/flags";
import { assertCan, servicePrincipal } from "@/platform/auth/rbac";
import { publish } from "@/platform/events/bus";
import { securityHeaders } from "@/platform/observability";
import { runAiEvals } from "@/platform/evals";
import { quoteGold } from "@/platform/finance/core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const principal = servicePrincipal();
  assertCan(principal, "flags:read");
  return NextResponse.json(
    { flags: listFlags() },
    { headers: securityHeaders() }
  );
}

export async function POST(req: Request) {
  const principal = servicePrincipal();
  assertCan(principal, "flags:write");
  const body = (await req.json()) as {
    key?: FlagKey;
    enabled?: boolean;
    gates?: boolean;
  };

  if (body.gates) {
    const evals = await runAiEvals();
    const quote = quoteGold({ orgId: "org_arya", weightGrams: 1 });
    const gate = evaluateReleaseGates({
      typecheck: true,
      unitTests: true,
      aiEvals: evals.failed === 0,
      financeInvariant: quote.breakdown.total >= quote.breakdown.goldValue,
    });
    return NextResponse.json(gate, { headers: securityHeaders() });
  }

  if (!body.key || typeof body.enabled !== "boolean") {
    return NextResponse.json({ error: "key+enabled required" }, { status: 400 });
  }
  const flag = setFlag(body.key, body.enabled);
  await publish("flag.changed", principal.orgId, {
    key: flag.key,
    enabled: flag.enabled,
  });
  return NextResponse.json({ flag }, { headers: securityHeaders() });
}
