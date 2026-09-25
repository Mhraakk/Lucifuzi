import { NextResponse } from "next/server";
import { orchestrateAsk } from "@/platform/ai/orchestrator";
import { requireString } from "@/platform/spec";
import { assertCan, servicePrincipal } from "@/platform/auth/rbac";
import { isEnabled } from "@/platform/flags";
import { securityHeaders } from "@/platform/observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!isEnabled("platform.ai_orchestrator")) {
    return NextResponse.json(
      { error: "AI orchestrator flag disabled" },
      { status: 403, headers: securityHeaders() }
    );
  }
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const question = requireString(body.question, "question", 3);
    const userId = requireString(body.userId ?? "user_demo", "userId");
    const orgId = requireString(body.orgId ?? "org_arya", "orgId");
    if (!question.ok) {
      return NextResponse.json({ error: question.error }, { status: 400 });
    }
    if (!userId.ok || !orgId.ok) {
      return NextResponse.json({ error: "invalid identity" }, { status: 400 });
    }

    const principal = servicePrincipal(orgId.data);
    assertCan(principal, "ai:ask");

    const result = await orchestrateAsk({
      orgId: orgId.data,
      userId: userId.data,
      question: question.data,
      correlationId:
        typeof body.correlationId === "string" ? body.correlationId : undefined,
    });

    return NextResponse.json(result, { headers: securityHeaders() });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "ai failed" },
      { status: 500, headers: securityHeaders() }
    );
  }
}
