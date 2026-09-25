import { NextRequest, NextResponse } from "next/server";
import { users } from "@/lib/demo-data";
import {
  deliverOtpEmail,
  generateOtpCode,
  putOtp,
} from "@/lib/auth/otp";

export const runtime = "nodejs";

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function resolveUser(email: string): {
  userId: string;
  fullName: string;
  isNew: boolean;
} {
  const existing = users.find((u) => u.email.toLowerCase() === email);
  if (existing) {
    return {
      userId: existing.id,
      fullName: existing.fullName,
      isNew: false,
    };
  }
  const local = email.split("@")[0] ?? "user";
  const fullName = local
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim() || "کاربر Beatris";
  return {
    userId: `user_email_${Buffer.from(email).toString("base64url").slice(0, 24)}`,
    fullName,
    isNew: true,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { email?: string; fullName?: string };
    const email = (body.email ?? "").trim().toLowerCase();
    if (!isValidEmail(email)) {
      return NextResponse.json({ error: "ایمیل معتبر نیست" }, { status: 400 });
    }

    const resolved = resolveUser(email);
    const fullName =
      body.fullName?.trim() || resolved.fullName;
    const code = generateOtpCode();
    const now = Date.now();

    putOtp({
      email,
      code,
      userId: resolved.userId,
      fullName,
      createdAt: now,
      expiresAt: now + 5 * 60 * 1000,
      attempts: 0,
    });

    const delivery = await deliverOtpEmail({ to: email, code });

    return NextResponse.json({
      ok: true,
      email,
      userId: resolved.userId,
      fullName,
      isNew: resolved.isNew,
      expiresInSec: 300,
      delivery: delivery.via,
      mail: {
        id: `mail_${now.toString(36)}`,
        to: email,
        subject: "کد ورود Beatris",
        body: `کد ورود شما به Beatris: ${code}\n\nاین کد ۵ دقیقه معتبر است.\nاگر درخواست نداده‌اید، نادیده بگیرید.`,
        code,
        createdAt: new Date(now).toISOString(),
      },
      hint: "کد در صندوق پیام Beatris ذخیره شد — /mail",
    });
  } catch {
    return NextResponse.json({ error: "ارسال کد ناموفق بود" }, { status: 500 });
  }
}
