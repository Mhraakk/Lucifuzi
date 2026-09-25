/**
 * Server-side OTP — signed challenge tokens (serverless-safe).
 * Codes also mirrored for /mail when same instance has memory;
 * primary verify path uses the signed challenge returned to the client.
 */

import { createHmac, timingSafeEqual } from "crypto";

export type OtpRecord = {
  email: string;
  code: string;
  userId: string;
  fullName: string;
  createdAt: number;
  expiresAt: number;
  attempts: number;
};

const g = globalThis as unknown as {
  __beatrisOtp?: Map<string, OtpRecord>;
  __beatrisMail?: Array<{
    id: string;
    to: string;
    subject: string;
    body: string;
    code: string;
    createdAt: string;
  }>;
};

function secret(): string {
  return (
    process.env.BEATRIS_OTP_SECRET ||
    process.env.RESEND_API_KEY ||
    "beatris-otp-atelier-v1-dev"
  );
}

function store(): Map<string, OtpRecord> {
  if (!g.__beatrisOtp) g.__beatrisOtp = new Map();
  return g.__beatrisOtp;
}

function mailStore() {
  if (!g.__beatrisMail) g.__beatrisMail = [];
  return g.__beatrisMail;
}

export function generateOtpCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export function signChallenge(payload: {
  email: string;
  code: string;
  userId: string;
  fullName: string;
  expiresAt: number;
}): string {
  const body = Buffer.from(
    JSON.stringify({
      e: payload.email.toLowerCase(),
      c: payload.code,
      u: payload.userId,
      n: payload.fullName,
      x: payload.expiresAt,
    }),
    "utf8"
  ).toString("base64url");
  const sig = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function readChallenge(token: string): {
  email: string;
  code: string;
  userId: string;
  fullName: string;
  expiresAt: number;
} | null {
  try {
    const [body, sig] = token.split(".");
    if (!body || !sig) return null;
    const expect = createHmac("sha256", secret()).update(body).digest("base64url");
    const a = Buffer.from(sig);
    const b = Buffer.from(expect);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const data = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8")
    ) as {
      e: string;
      c: string;
      u: string;
      n: string;
      x: number;
    };
    if (!data.e || !data.c || !data.u || !data.x) return null;
    return {
      email: data.e,
      code: data.c,
      userId: data.u,
      fullName: data.n,
      expiresAt: data.x,
    };
  } catch {
    return null;
  }
}

export function putOtp(record: OtpRecord): string {
  store().set(record.email.toLowerCase(), record);
  mailStore().unshift({
    id: `mail_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    to: record.email.toLowerCase(),
    subject: "کد ورود Beatris",
    body: `کد ورود شما به Beatris: ${record.code}\n\nاین کد ۵ دقیقه معتبر است.\nاگر درخواست نداده‌اید، نادیده بگیرید.`,
    code: record.code,
    createdAt: new Date().toISOString(),
  });
  if (mailStore().length > 200) {
    g.__beatrisMail = mailStore().slice(0, 200);
  }
  return signChallenge({
    email: record.email,
    code: record.code,
    userId: record.userId,
    fullName: record.fullName,
    expiresAt: record.expiresAt,
  });
}

export function getOtp(email: string): OtpRecord | undefined {
  return store().get(email.trim().toLowerCase());
}

export function clearOtp(email: string): void {
  store().delete(email.trim().toLowerCase());
}

export function consumeOtp(
  email: string,
  code: string,
  challenge?: string
): { ok: true; record: OtpRecord } | { ok: false; error: string } {
  const key = email.trim().toLowerCase();
  const trimmed = code.trim();

  if (challenge) {
    const ch = readChallenge(challenge);
    if (!ch) return { ok: false, error: "نشست کد نامعتبر است — دوباره درخواست کنید" };
    if (ch.email !== key) return { ok: false, error: "ایمیل با کد هم‌خوان نیست" };
    if (Date.now() > ch.expiresAt) {
      return { ok: false, error: "کد منقضی شده — دوباره درخواست کنید" };
    }
    if (ch.code !== trimmed) {
      return { ok: false, error: "کد نادرست است" };
    }
    store().delete(key);
    return {
      ok: true,
      record: {
        email: ch.email,
        code: ch.code,
        userId: ch.userId,
        fullName: ch.fullName,
        createdAt: ch.expiresAt - 5 * 60 * 1000,
        expiresAt: ch.expiresAt,
        attempts: 0,
      },
    };
  }

  const rec = store().get(key);
  if (!rec) return { ok: false, error: "کدی برای این ایمیل درخواست نشده" };
  if (Date.now() > rec.expiresAt) {
    store().delete(key);
    return { ok: false, error: "کد منقضی شده — دوباره درخواست کنید" };
  }
  rec.attempts += 1;
  if (rec.attempts > 8) {
    store().delete(key);
    return { ok: false, error: "تلاش بیش از حد — کد باطل شد" };
  }
  if (rec.code !== trimmed) {
    return { ok: false, error: "کد نادرست است" };
  }
  store().delete(key);
  return { ok: true, record: rec };
}

export function listMailFor(email: string) {
  const e = email.trim().toLowerCase();
  return mailStore().filter((m) => m.to === e);
}

export function listRecentMail(limit = 20) {
  return mailStore().slice(0, limit);
}

/** Optional Resend delivery when RESEND_API_KEY is configured */
export async function deliverOtpEmail(input: {
  to: string;
  code: string;
}): Promise<{ sent: boolean; via: string }> {
  const key = process.env.RESEND_API_KEY;
  const from =
    process.env.BEATRIS_MAIL_FROM ?? "Beatris <onboarding@resend.dev>";
  if (!key) {
    return { sent: false, via: "mailbox" };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: "کد ورود Beatris",
        text: `کد ورود شما به Beatris: ${input.code}\n\nاین کد ۵ دقیقه معتبر است.`,
      }),
    });
    if (!res.ok) {
      console.error("Resend failed", await res.text());
      return { sent: false, via: "mailbox" };
    }
    return { sent: true, via: "resend" };
  } catch (e) {
    console.error("Resend error", e);
    return { sent: false, via: "mailbox" };
  }
}
