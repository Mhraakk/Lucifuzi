"use client";

import { AppShell } from "@/components/layout/AppShell";
import { toPersianDigits } from "@/lib/format";
import { useAppState } from "@/lib/hooks";
import { courseProgressPercent } from "@/lib/store";

export default function AnalyticsPage() {
  const state = useAppState();

  const byBranch = state.branches.map((b) => {
    const employees = state.users.filter(
      (u) => u.branchId === b.id && u.systemRole === "employee"
    );
    const completion =
      employees.length === 0
        ? 0
        : Math.round(
            employees.reduce((sum, e) => {
              const courses = state.courses.slice(0, 5);
              const avg =
                courses.reduce(
                  (s, c) => s + courseProgressPercent(state, e.id, c.id),
                  0
                ) / courses.length;
              return sum + avg;
            }, 0) / employees.length
          );
    const fails = state.examAttempts.filter(
      (ex) => !ex.passed && employees.some((e) => e.id === ex.userId)
    ).length;
    const gaps = state.employeeCompetencies.filter(
      (ec) =>
        employees.some((e) => e.id === ec.userId) && ec.knowledgeLevel < 60
    ).length;
    return { branch: b, completion, fails, gaps, headcount: employees.length };
  });

  const missed = [
    { q: "محاسبه اجرت", count: 8 },
    { q: "تأیید پرداخت سیستم", count: 5 },
    { q: "مغایرت وزن", count: 4 },
  ];

  return (
    <AppShell title="تحلیل" backHref="/manager/dashboard">
      <div className="mx-auto max-w-desk space-y-5">
        <section>
          <h1 className="page-title mb-2">تحلیل آموزش شعب</h1>
          <p className="muted text-sm leading-7">
            بدون رتبه‌بندی حساس کارکنان — تمرکز روی انطباق آموزشی و شکاف عملیاتی.
          </p>
        </section>

        <div className="grid gap-3 md:grid-cols-2">
          {byBranch.map((row) => (
            <div key={row.branch.id} className="surface p-5">
              <h2 className="font-bold mb-3">{row.branch.name}</h2>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="muted">تکمیل دوره‌ها</dt>
                  <dd>{toPersianDigits(row.completion)}٪</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="muted">مردودی آزمون</dt>
                  <dd>{toPersianDigits(row.fails)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="muted">شکاف مهارت</dt>
                  <dd>{toPersianDigits(row.gaps)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="muted">تعداد نیرو</dt>
                  <dd>{toPersianDigits(row.headcount)}</dd>
                </div>
              </dl>
            </div>
          ))}
        </div>

        <section className="surface p-5">
          <h2 className="section-title mb-3">پرسش‌های پرتکرار اشتباه</h2>
          <ul className="space-y-2">
            {missed.map((m) => (
              <li
                key={m.q}
                className="flex justify-between rounded-xl px-3 py-2 text-sm"
                style={{ background: "var(--bg-soft)" }}
              >
                <span>{m.q}</span>
                <span className="faint">{toPersianDigits(m.count)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </AppShell>
  );
}
