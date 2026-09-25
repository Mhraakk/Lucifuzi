import { NextResponse } from "next/server";
import { buildHealthMatrix } from "@/platform/bff";
import { securityHeaders } from "@/platform/observability";
import { runAiEvals } from "@/platform/evals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const withEvals = url.searchParams.get("evals") === "1";
  const health = buildHealthMatrix();
  const body: Record<string, unknown> = { ok: true, ...health };
  if (withEvals) {
    body.evals = await runAiEvals();
  }
  return NextResponse.json(body, { headers: securityHeaders() });
}
