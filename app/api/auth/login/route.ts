import { NextRequest, NextResponse } from "next/server";
import { createSession, parseSessionToken } from "@/lib/auth/session";
import { users } from "@/lib/demo-data";

export const runtime = "nodejs";

/** Session issue by userId (internal) or GET session check. OTP is /api/auth/otp/*. */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { userId?: string };
    if (body.userId) {
      const user = users.find((u) => u.id === body.userId);
      if (!user) {
        return NextResponse.json({ error: "کاربر یافت نشد" }, { status: 404 });
      }
      const token = createSession(user);
      return NextResponse.json({
        token,
        user: {
          id: user.id,
          fullName: user.fullName,
          email: user.email,
          systemRole: user.systemRole,
          branchId: user.branchId,
        },
      });
    }
    return NextResponse.json(
      { error: "از /api/auth/otp/request استفاده کنید" },
      { status: 400 }
    );
  } catch {
    return NextResponse.json({ error: "خطای ورود" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const header = req.headers.get("authorization");
  const token = header?.replace(/^Bearer\s+/i, "") ?? null;
  const session = parseSessionToken(token);
  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
  const user = users.find((u) => u.id === session.userId);
  return NextResponse.json({
    authenticated: true,
    session,
    user: user
      ? {
          id: user.id,
          fullName: user.fullName,
          email: user.email,
          systemRole: user.systemRole,
        }
      : { id: session.userId, email: session.email },
  });
}
