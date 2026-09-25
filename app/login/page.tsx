"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAppState } from "@/lib/hooks";
import { ensureAuthUser, setTheme } from "@/lib/store";
import { sculptureSrc } from "@/lib/atelier/sculptures";
import {
  clearSession,
  createSession,
  persistSession,
  pushMailMessage,
  readSession,
  upsertRegisteredUser,
} from "@/lib/auth/session";
import { syncEvent } from "@/lib/backend/persistence";

type Step = "email" | "code";

export default function LoginPage() {
  const state = useAppState();
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [fullName, setFullName] = useState("");
  const [challenge, setChallenge] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    const session = readSession();
    if (!session) return;
    const user = state.users.find((u) => u.id === session.userId);
    if (!user) return;
    router.replace(
      ["manager", "owner", "trainer"].includes(user.systemRole)
        ? "/manager/dashboard"
        : "/employee/home"
    );
  }, [router, state.users]);

  async function requestOtp() {
    setAuthLoading(true);
    setAuthError(null);
    setHint(null);
    try {
      const res = await fetch("/api/auth/otp/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          fullName: fullName.trim() || undefined,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        challenge?: string;
        mail?: {
          id: string;
          to: string;
          subject: string;
          body: string;
          code: string;
          createdAt: string;
        };
        hint?: string;
        fullName?: string;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "ارسال کد ناموفق");
      }
      if (data.challenge) setChallenge(data.challenge);
      if (typeof window !== "undefined" && data.challenge) {
        window.sessionStorage.setItem("beatris-otp-challenge", data.challenge);
      }
      if (data.mail) {
        pushMailMessage({
          id: data.mail.id,
          to: data.mail.to,
          subject: data.mail.subject,
          body: data.mail.body,
          code: data.mail.code,
          createdAt: data.mail.createdAt,
        });
      }
      if (data.fullName && !fullName.trim()) setFullName(data.fullName);
      setHint(data.hint ?? "کد در صندوق پیام ذخیره شد");
      setStep("code");
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : "ارسال کد ناموفق");
    } finally {
      setAuthLoading(false);
    }
  }

  async function verifyOtp() {
    setAuthLoading(true);
    setAuthError(null);
    try {
      const challengeToken =
        challenge ||
        (typeof window !== "undefined"
          ? window.sessionStorage.getItem("beatris-otp-challenge")
          : null);
      const res = await fetch("/api/auth/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          code: code.trim(),
          challenge: challengeToken || undefined,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        token?: string;
        error?: string;
        user?: {
          id: string;
          email: string;
          fullName: string;
          systemRole: "owner" | "manager" | "trainer" | "employee";
          branchId: string;
          organizationId: string;
          avatarInitials: string;
        };
      };
      if (!res.ok || !data.ok || !data.token || !data.user) {
        throw new Error(data.error ?? "کد نادرست است");
      }

      const user = ensureAuthUser({
        id: data.user.id,
        email: data.user.email,
        fullName: data.user.fullName,
        systemRole: data.user.systemRole,
        branchId: data.user.branchId,
        organizationId: data.user.organizationId,
        avatarInitials: data.user.avatarInitials,
      });

      upsertRegisteredUser({
        userId: user.id,
        email: user.email,
        fullName: user.fullName,
        createdAt: new Date().toISOString(),
      });

      persistSession(data.token || createSession(user));
      if (typeof window !== "undefined") {
        window.sessionStorage.removeItem("beatris-otp-challenge");
      }
      void syncEvent({
        type: "auth_login",
        userId: user.id,
        at: new Date().toISOString(),
        payload: { mode: "otp", role: user.systemRole },
      });

      const isMgr = ["manager", "owner", "trainer"].includes(user.systemRole);
      router.push(isMgr ? "/manager/dashboard" : "/employee/home");
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : "ورود ناموفق");
    } finally {
      setAuthLoading(false);
    }
  }

  return (
    <div
      data-theme={state.theme}
      className="relative min-h-screen overflow-hidden"
      style={{ color: "var(--ink)" }}
    >
      <div className="login-atelier login-atelier--marble" aria-hidden>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={sculptureSrc("login")} alt="" />
        <div className="login-atelier__veil" />
      </div>

      <div className="relative z-[1] mx-auto flex min-h-screen max-w-md flex-col px-5 pb-10 pt-6">
        <div className="mb-3 flex items-center justify-between gap-2">
          <Link
            href="/mail"
            className="btn btn-ghost tap-react !min-h-10 !px-3 text-xs"
          >
            صندوق پیام
          </Link>
          <button
            type="button"
            className="btn btn-ghost tap-react !min-h-10 !px-3 text-xs"
            onClick={() => setTheme(state.theme === "light" ? "dark" : "light")}
            aria-label="تغییر تم"
          >
            {state.theme === "light" ? "شب" : "روز"}
          </button>
        </div>

        <header className="login-hero-card mb-6 mt-auto">
          <h1 className="brand-mark mb-1">Beatris</h1>
          <p className="text-sm muted">آتلیه آموزش جواهر</p>
        </header>

        <section
          className="mb-4 surface p-4 animate-in space-y-3"
          style={{ animationDelay: "0.12s" }}
        >
          {step === "email" ? (
            <>
              <p className="section-title !mb-0">ورود با ایمیل</p>
              <p className="faint text-[0.7rem] leading-6">
                هر ایمیل یک کاربر است. کد ورود به صندوق پیام ارسال می‌شود.
              </p>
              <input
                className="field"
                type="email"
                placeholder="ایمیل"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                dir="ltr"
              />
              <input
                className="field"
                type="text"
                placeholder="نام (اختیاری — برای اولین ورود)"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                autoComplete="name"
              />
              {authError ? (
                <p className="text-xs" style={{ color: "var(--danger)" }}>
                  {authError}
                </p>
              ) : null}
              <button
                type="button"
                className="btn btn-primary w-full"
                disabled={authLoading || !email.includes("@")}
                onClick={() => void requestOtp()}
              >
                {authLoading ? "در حال ارسال…" : "ارسال کد ورود"}
              </button>
            </>
          ) : (
            <>
              <p className="section-title !mb-0">کد ورود</p>
              <p className="faint text-[0.7rem] leading-6" dir="ltr">
                {email}
              </p>
              {hint ? (
                <p className="text-xs muted leading-6">{hint}</p>
              ) : null}
              <Link
                href={`/mail?email=${encodeURIComponent(email.trim().toLowerCase())}`}
                className="btn btn-secondary w-full text-sm"
              >
                مشاهده صندوق پیام
              </Link>
              <input
                className="field text-center tracking-[0.35em] text-lg"
                type="text"
                inputMode="numeric"
                placeholder="______"
                value={code}
                onChange={(e) =>
                  setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                autoComplete="one-time-code"
                dir="ltr"
                maxLength={6}
              />
              {authError ? (
                <p className="text-xs" style={{ color: "var(--danger)" }}>
                  {authError}
                </p>
              ) : null}
              <button
                type="button"
                className="btn btn-primary w-full"
                disabled={authLoading || code.length < 6}
                onClick={() => void verifyOtp()}
              >
                {authLoading ? "در حال تأیید…" : "ورود"}
              </button>
              <button
                type="button"
                className="btn btn-ghost w-full text-xs"
                onClick={() => {
                  setStep("email");
                  setCode("");
                  setAuthError(null);
                  clearSession();
                }}
              >
                تغییر ایمیل
              </button>
              <button
                type="button"
                className="btn btn-ghost w-full text-xs"
                disabled={authLoading}
                onClick={() => void requestOtp()}
              >
                ارسال مجدد کد
              </button>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
