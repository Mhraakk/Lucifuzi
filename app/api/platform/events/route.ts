import { NextResponse } from "next/server";
import { recentEvents } from "@/platform/events/bus";
import { assertCan, servicePrincipal } from "@/platform/auth/rbac";
import { securityHeaders } from "@/platform/observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const principal = servicePrincipal();
  assertCan(principal, "events:read");
  return NextResponse.json(
    { events: recentEvents(50) },
    { headers: securityHeaders() }
  );
}
