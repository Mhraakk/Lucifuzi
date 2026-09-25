/**
 * Server-side OTP store — real codes, one email = one pending challenge.
 * Codes also mirrored to client mailbox via API response for /mail.
 */

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

export function putOtp(record: OtpRecord): void {
  store().set(record.email.toLowerCase(), record);
  mailStore().unshift({
    id: `mail_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    to: record.email.toLowerCase(),
    subject: "کد ورود Beatris",
    body: `کد ورود شما به Beatris: ${record.code}\n\nاین کد ۵ دقیقه معتبر است.\nاگر درخواست نداده‌اید، نادیده بگیرید.`,
    code: record.code,
    createdAt: new Date().toISOString(),
  });
  // keep last 200
  if (mailStore().length > 200) {
    g.__beatrisMail = mailStore().slice(0, 200);
  }
}

export function getOtp(email: string): OtpRecord | undefined {
  return store().get(email.trim().toLowerCase());
}

export function clearOtp(email: string): void {
  store().delete(email.trim().toLowerCase());
}

export function consumeOtp(
  email: string,
  code: string
): { ok: true; record: OtpRecord } | { ok: false; error: string } {
  const key = email.trim().toLowerCase();
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
  if (rec.code !== code.trim()) {
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
