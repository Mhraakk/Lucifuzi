"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { JOB_ROLE_LABELS, SYSTEM_ROLE_LABELS } from "@/lib/types";
import { useAppState } from "@/lib/hooks";
import { setCurrentUser, setTheme } from "@/lib/store";
import { persistSession, createSession } from "@/lib/auth/session";
import { syncEvent } from "@/lib/backend/persistence";

export default function LoginPage() {
  const state = useAppState();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [showRoles, setShowRoles] = useState(false);

  const employees = state.users.filter((u) =>
    state.employeeProfiles.some((p) => p.userId === u.id)
  );
  const managers = state.users.filter(
    (u) =>
      u.systemRole === "manager" ||
      u.systemRole === "owner" ||
      u.systemRole === "trainer"
  );

  async function enter(userId: string, asManager: boolean) {
    const user = state.users.find((u) => u.id === userId);
    if (!user) return;
    setCurrentUser(userId);
    const token = createSession(user);
    persistSession(token);
    void syncEvent({
      type: "auth_login",
      userId,
      at: new Date().toISOString(),
      payload: { mode: "persona", role: user.systemRole },
    });
    try {
      await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
    } catch {
      /* offline demo ok */
    }
    router.push(asManager ? "/manager/dashboard" : "/employee/home");
  }

  async function loginWithPin() {
    setAuthLoading(true);
    setAuthError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, pin }),
      });
      const data = (await res.json()) as {
        token?: string;
        user?: { id: string; systemRole: string };
        error?: string;
      };
      if (!res.ok || !data.token || !data.user) {
        throw new Error(data.error ?? "ورود ناموفق");
      }
      persistSession(data.token);
      setCurrentUser(data.user.id);
      void syncEvent({
        type: "auth_login",
        userId: data.user.id,
        at: new Date().toISOString(),
        payload: { mode: "pin", role: data.user.systemRole },
      });
      const isMgr = ["manager", "owner", "trainer"].includes(
        data.user.systemRole
      );
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
      <div className="login-atelier" aria-hidden>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/atelier/atelier-muse.png" alt="" />
        <div className="login-atelier__veil" />
      </div>

      <div className="relative z-[1] mx-auto flex min-h-screen max-w-md flex-col px-5 pb-10 pt-6">
        <div className="mb-3 flex justify-end">
          <button
            type="button"
            className="btn btn-ghost !min-h-10 !px-3 text-xs"
            onClick={() => setTheme(state.theme === "light" ? "dark" : "light")}
            aria-label="تغییر تم"
          >
            {state.theme === "light" ? "شب آتلیه" : "روز آتلیه"}
          </button>
        </div>

        {/* First viewport: brand-first composition on full-bleed atelier photo */}
        <header className="login-hero-copy mb-8 flex min-h-[48vh] flex-col justify-end text-center">
          <h1 className="brand-mark mb-3">آریا</h1>
          <p
            className="mb-4 text-[1.15rem] font-semibold leading-8"
            style={{ fontFamily: "var(--font-display)" }}
          >
            آموزش گالری
          </p>
          <p className="mx-auto max-w-[17rem] text-sm leading-7 muted">
            پشت ویترین واقعی یاد بگیرید — نور، روایت، دقت.
          </p>
        </header>

        <section
          className="mb-4 surface p-4 animate-in space-y-3"
          style={{ animationDelay: "0.12s" }}
        >
          <p className="section-title !mb-0">ورود به شیفت</p>
          <p className="faint text-[0.65rem]">دمو: PIN همه کاربران ۱۲۳۴</p>
          <input
            className="field"
            type="email"
            placeholder="ایمیل سازمانی"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
          />
          <input
            className="field"
            type="password"
            inputMode="numeric"
            placeholder="PIN چهار رقمی"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            autoComplete="current-password"
          />
          {authError ? (
            <p className="text-xs" style={{ color: "var(--danger)" }}>
              {authError}
            </p>
          ) : null}
          <button
            type="button"
            className="btn btn-primary w-full"
            disabled={authLoading || email.trim().length < 3 || pin.length < 4}
            onClick={() => void loginWithPin()}
          >
            {authLoading ? "در حال ورود..." : "ورود"}
          </button>
        </section>

        <button
          type="button"
          className="btn btn-ghost mb-4 w-full text-xs"
          onClick={() => setShowRoles((v) => !v)}
        >
          {showRoles ? "بستن ورود سریع دمو" : "ورود سریع نقش‌های دمو"}
        </button>

        {showRoles ? (
          <>
            <section className="mb-6 animate-in">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="section-title">کارکنان</h2>
                <span className="chip">دمو</span>
              </div>
              <div className="stagger space-y-2.5">
                {employees.map((u) => {
                  const profile = state.employeeProfiles.find(
                    (p) => p.userId === u.id
                  );
                  const branch = state.branches.find((b) => b.id === u.branchId);
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => void enter(u.id, false)}
                      className="surface surface-interactive flex w-full items-center gap-3 p-3.5 text-right"
                    >
                      <span
                        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-sm font-bold"
                        style={{
                          background: "var(--accent-soft)",
                          color: "var(--accent-deep)",
                        }}
                      >
                        {u.avatarInitials}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-bold leading-6">{u.fullName}</p>
                        <p className="muted mt-0.5 text-xs leading-5">
                          {profile ? JOB_ROLE_LABELS[profile.jobRole] : "—"}
                          {branch ? ` · ${branch.name}` : ""}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="mb-8 animate-in">
              <h2 className="section-title mb-3">مدیریت</h2>
              <div className="stagger space-y-2.5">
                {managers.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => void enter(u.id, true)}
                    className="surface surface-interactive w-full p-3.5 text-right"
                  >
                    <p className="font-bold">{u.fullName}</p>
                    <p className="muted mt-1 text-xs">
                      {SYSTEM_ROLE_LABELS[u.systemRole]}
                    </p>
                  </button>
                ))}
              </div>
            </section>
          </>
        ) : null}

        <Link
          href="/onboarding"
          className="btn btn-secondary mt-auto w-full animate-in"
          style={{ animationDelay: "0.2s" }}
        >
          آنبوردینگ نیروی جدید
        </Link>
      </div>
    </div>
  );
}
