"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { JOB_ROLE_LABELS, SYSTEM_ROLE_LABELS } from "@/lib/types";
import { useAppState } from "@/lib/hooks";
import { setCurrentUser } from "@/lib/store";

export default function LoginPage() {
  const state = useAppState();
  const router = useRouter();
  const employees = state.users.filter((u) =>
    state.employeeProfiles.some((p) => p.userId === u.id)
  );
  const managers = state.users.filter(
    (u) => u.systemRole === "manager" || u.systemRole === "owner" || u.systemRole === "trainer"
  );

  function enter(userId: string, asManager: boolean) {
    setCurrentUser(userId);
    router.push(asManager ? "/manager/dashboard" : "/employee/home");
  }

  return (
    <div
      data-theme={state.theme}
      className="min-h-screen px-4 py-10"
      style={{ background: "var(--bg)", color: "var(--ink)" }}
    >
      <div className="mx-auto max-w-md animate-in">
        <p className="text-xs faint mb-2 tracking-wide">گالری طلای آریا</p>
        <h1 className="page-title mb-3">سامانه آموزش عملیاتی</h1>
        <p className="muted text-sm leading-7 mb-8">
          آموزش کارکنان طلافروشی برای کار واقعی روزانه — نه یک LMS عمومی.
          دانش آزمون با مجوز انجام کار یکی نیست.
        </p>

        <section className="mb-8">
          <h2 className="section-title mb-3">ورود کارمند</h2>
          <div className="space-y-3">
            {employees.map((u) => {
              const profile = state.employeeProfiles.find((p) => p.userId === u.id);
              const branch = state.branches.find((b) => b.id === u.branchId);
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => enter(u.id, false)}
                  className="surface w-full p-4 text-right transition hover:-translate-y-0.5"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="flex h-11 w-11 items-center justify-center rounded-full text-sm font-bold"
                      style={{ background: "var(--accent-soft)", color: "var(--accent-deep)" }}
                    >
                      {u.avatarInitials}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold">{u.fullName}</p>
                      <p className="muted text-xs mt-1">
                        {profile ? JOB_ROLE_LABELS[profile.jobRole] : "—"} · {branch?.name}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <section className="mb-8">
          <h2 className="section-title mb-3">ورود مدیر / مربی / مالک</h2>
          <div className="space-y-3">
            {managers.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => enter(u.id, true)}
                className="surface w-full p-4 text-right"
              >
                <p className="font-bold">{u.fullName}</p>
                <p className="muted text-xs mt-1">{SYSTEM_ROLE_LABELS[u.systemRole]}</p>
              </button>
            ))}
          </div>
        </section>

        <Link href="/onboarding" className="btn btn-secondary w-full">
          شبیه‌سازی آنبوردینگ نیروی جدید
        </Link>
      </div>
    </div>
  );
}
