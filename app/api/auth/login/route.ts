import { NextRequest, NextResponse } from "next/server";
import {
  createSession,
  parseSessionToken,
  verifyPin,
} from "@/lib/auth/session";
import { users } from "@/lib/demo-data";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      email?: string;
      pin?: string;
      userId?: string;
    };

    // PIN login
    if (body.email && body.pin) {
      const email = body.email.trim().toLowerCase();
      if (!verifyPin(email, body.pin)) {
        return NextResponse.json(
          { error: "ایمیل یا PIN نادرست است" },
          { status: 401 }
        );
      }
      const user = users.find((u) => u.email.toLowerCase() === email);
      if (!user || !user.isActive) {
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

    // Quick demo enter by userId still issues a session
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

    return NextResponse.json({ error: "ورودی نامعتبر" }, { status: 400 });
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
  if (!user) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
  return NextResponse.json({
    authenticated: true,
    user: {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      systemRole: user.systemRole,
    },
  });
}
