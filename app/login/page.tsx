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
    <div data-theme={state.theme} className="portal-root">
      <div className="portal-world" aria-hidden>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="portal-world__stone"
          src={sculptureSrc("login")}
          alt=""
        />
        <div className="portal-world__fog" />
        <div className="portal-world__caustic" />
        <div className="portal-world__ray" />
        <div className="portal-world__vignette" />
      </div>

      <div className="portal-chrome">
        <Link href="/mail" className="portal-ghost-link">
          صندوق پیام
        </Link>
        <button
          type="button"
          className="portal-ghost-link"
          onClick={() => setTheme(state.theme === "light" ? "dark" : "light")}
          aria-label="تغییر تم"
        >
          {state.theme === "light" ? "شب" : "روز"}
        </button>
      </div>

      <main className="portal-stage">
        <div className="portal-brand portal-rise">
          <p className="portal-whisper">آتلیه · سنگ · نور · طلا</p>
          <h1 className="portal-name">Beatris</h1>
          <p className="portal-promise">ورود به فضای آموزش جواهر</p>
        </div>

        <form
          className="portal-membrane portal-rise portal-rise--late"
          onSubmit={(e) => {
            e.preventDefault();
            if (step === "email") void requestOtp();
            else void verifyOtp();
          }}
        >
          {step === "email" ? (
            <>
              <label className="portal-field">
                <span>ایمیل</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  dir="ltr"
                  required
                  placeholder="you@atelier.gold"
                />
              </label>
              <label className="portal-field">
                <span>نام — اولین ورود</span>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  autoComplete="name"
                  placeholder="اختیاری"
                />
              </label>
              {authError ? <p className="portal-err">{authError}</p> : null}
              <button
                type="submit"
                className="portal-enter"
                disabled={authLoading || !email.includes("@")}
              >
                <span>{authLoading ? "…" : "گشودن در"}</span>
                <em aria-hidden />
              </button>
            </>
          ) : (
            <>
              <p className="portal-mail" dir="ltr">
                {email}
              </p>
              {hint ? <p className="portal-hint">{hint}</p> : null}
              <Link
                href={`/mail?email=${encodeURIComponent(email.trim().toLowerCase())}`}
                className="portal-ghost-link portal-ghost-link--block"
              >
                خواندن کد از صندوق
              </Link>
              <label className="portal-field">
                <span>کد شش‌رقمی</span>
                <input
                  className="portal-code"
                  type="text"
                  inputMode="numeric"
                  value={code}
                  onChange={(e) =>
                    setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  autoComplete="one-time-code"
                  dir="ltr"
                  maxLength={6}
                  placeholder="······"
                  required
                />
              </label>
              {authError ? <p className="portal-err">{authError}</p> : null}
              <button
                type="submit"
                className="portal-enter"
                disabled={authLoading || code.length < 6}
              >
                <span>{authLoading ? "…" : "ورود به آتلیه"}</span>
                <em aria-hidden />
              </button>
              <div className="portal-alt">
                <button
                  type="button"
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
                  disabled={authLoading}
                  onClick={() => void requestOtp()}
                >
                  ارسال مجدد
                </button>
              </div>
            </>
          )}
        </form>
      </main>
    </div>
  );
}
