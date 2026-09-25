import { NextRequest, NextResponse } from "next/server";
import type { SyncEvent } from "@/lib/backend/persistence";

export const runtime = "nodejs";

/**
 * Lightweight operational event log for cloud deploys.
 * In-memory per warm instance — durable client state lives in IndexedDB.
 */
const events: SyncEvent[] = [];
const MAX = 500;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as SyncEvent;
    if (!body?.type || !body?.userId) {
      return NextResponse.json({ error: "invalid event" }, { status: 400 });
    }
    events.unshift({
      ...body,
      at: body.at || new Date().toISOString(),
    });
    if (events.length > MAX) events.length = MAX;
    return NextResponse.json({ ok: true, stored: events.length });
  } catch {
    return NextResponse.json({ error: "sync failed" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    count: events.length,
    recent: events.slice(0, 20),
  });
}
