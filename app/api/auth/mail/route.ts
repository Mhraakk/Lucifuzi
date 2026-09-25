import { NextRequest, NextResponse } from "next/server";
import { listMailFor, listRecentMail } from "@/lib/auth/otp";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("email")?.trim().toLowerCase();
  if (email) {
    return NextResponse.json({ messages: listMailFor(email) });
  }
  return NextResponse.json({ messages: listRecentMail(30) });
}
