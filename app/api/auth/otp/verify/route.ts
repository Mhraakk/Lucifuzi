import { NextRequest, NextResponse } from "next/server";
import { createSession } from "@/lib/auth/session";
import { consumeOtp } from "@/lib/auth/otp";
import { users } from "@/lib/demo-data";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      email?: string;
      code?: string;
    };
    const email = (body.email ?? "").trim().toLowerCase();
    const code = (body.code ?? "").trim();
    if (!email || !code) {
      return NextResponse.json({ error: "ایمیل و کد لازم است" }, { status: 400 });
    }

    const result = consumeOtp(email, code);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 401 });
    }

    const { record } = result;
    const demo = users.find((u) => u.id === record.userId);
    const token = createSession({
      id: record.userId,
      email: record.email,
    });

    return NextResponse.json({
      ok: true,
      token,
      user: {
        id: record.userId,
        email: record.email,
        fullName: record.fullName,
        systemRole: demo?.systemRole ?? "employee",
        branchId: demo?.branchId ?? "branch_central",
        organizationId: demo?.organizationId ?? "org_beatris",
        isNew: !demo,
        avatarInitials: record.fullName
          .split(/\s+/)
          .slice(0, 2)
          .map((p) => p[0] ?? "")
          .join(""),
      },
    });
  } catch {
    return NextResponse.json({ error: "تأیید کد ناموفق بود" }, { status: 500 });
  }
}
