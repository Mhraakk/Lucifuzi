"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { JOB_ROLE_LABELS, SYSTEM_ROLE_LABELS } from "@/lib/types";
import { useAppState } from "@/lib/hooks";
import { setCurrentUser, setTheme } from "@/lib/store";

export default function LoginPage() {
  const state = useAppState();
  const router = useRouter();
  const employees = state.users.filter((u) =>
    state.employeeProfiles.some((p) => p.userId === u.id)
  );
  const managers = state.users.filter(
    (u) =>
      u.systemRole === "manager" ||
      u.systemRole === "owner" ||
      u.systemRole === "trainer"
  );

  function enter(userId: string, asManager: boolean) {
    setCurrentUser(userId);
    router.push(asManager ? "/manager/dashboard" : "/employee/home");
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

      <div className="relative z-[1] mx-auto flex min-h-screen max-w-md flex-col px-5 pb-10 pt-8">
        <div className="mb-2 flex justify-end">
          <button
            type="button"
            className="btn btn-ghost !min-h-10 !px-3 text-xs"
            onClick={() => setTheme(state.theme === "light" ? "dark" : "light")}
            aria-label="تغییر تم"
          >
            {state.theme === "light" ? "تاریک" : "روشن"}
          </button>
        </div>

        <header className="mb-10 animate-in text-center">
          <p className="mb-4 text-[11px] faint tracking-[0.18em]">
            گالری طلای آریا
          </p>
          <h1 className="brand-mark mb-4">آریا آموزش</h1>
          <p className="mx-auto max-w-xs muted text-sm leading-7">
            آموزش روی دیوار ویترین — ارائه محصول مثل گالری‌های معتبر، نه نردبان
            مصنوعی.
          </p>
        </header>

        <section className="mb-7 animate-in" style={{ animationDelay: "0.08s" }}>
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
                  onClick={() => enter(u.id, false)}
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
                  <svg
                    className="nav-icon faint shrink-0"
                    viewBox="0 0 24 24"
                    aria-hidden
                  >
                    <path d="M15 6l-6 6 6 6" />
                  </svg>
                </button>
              );
            })}
          </div>
        </section>

        <section className="mb-8 animate-in" style={{ animationDelay: "0.14s" }}>
          <h2 className="section-title mb-3">مدیریت</h2>
          <div className="stagger space-y-2.5">
            {managers.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => enter(u.id, true)}
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
