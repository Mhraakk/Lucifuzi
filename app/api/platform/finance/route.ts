import { NextResponse } from "next/server";
import { quoteGold, explainQuoteToCustomer } from "@/platform/finance/core";
import { requireNumber, requireString } from "@/platform/spec";
import { assertCan, servicePrincipal } from "@/platform/auth/rbac";
import { publish } from "@/platform/events/bus";
import { securityHeaders } from "@/platform/observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const org = requireString(body.orgId ?? "org_arya", "orgId");
    const weight = requireNumber(body.weightGrams, "weightGrams", { min: 0.01 });
    if (!org.ok) {
      return NextResponse.json({ error: org.error }, { status: 400 });
    }
    if (!weight.ok) {
      return NextResponse.json({ error: weight.error }, { status: 400 });
    }

    const principal = servicePrincipal(org.data);
    assertCan(principal, "finance:quote");

    const karatRaw = body.karat;
    const karat =
      karatRaw === 21 || karatRaw === 22 || karatRaw === 24 || karatRaw === 18
        ? karatRaw
        : 18;

    const result = quoteGold({
      orgId: org.data,
      branchId: typeof body.branchId === "string" ? body.branchId : undefined,
      weightGrams: weight.data,
      karat,
      makingFeePercent:
        typeof body.makingFeePercent === "number"
          ? body.makingFeePercent
          : undefined,
      profitPercent:
        typeof body.profitPercent === "number" ? body.profitPercent : undefined,
      vatPercent: typeof body.vatPercent === "number" ? body.vatPercent : undefined,
      goldPricePerGram18k:
        typeof body.goldPricePerGram18k === "number"
          ? body.goldPricePerGram18k
          : undefined,
    });

    await publish("finance.quote", org.data, {
      total: result.breakdown.total,
      weightGrams: weight.data,
      usedLiveMarket: result.usedLiveMarket,
    });

    return NextResponse.json(
      {
        ...result,
        customerScript: explainQuoteToCustomer(result),
      },
      { headers: securityHeaders() }
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "quote failed" },
      { status: 400, headers: securityHeaders() }
    );
  }
}
