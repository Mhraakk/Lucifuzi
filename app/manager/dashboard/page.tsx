"use client";

import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { ManagerAlert } from "@/components/training/Cards";
import { Badge } from "@/components/ui/Feedback";
import { toPersianDigits } from "@/lib/format";
import { useAppState, useCurrentUser } from "@/lib/hooks";
import { WORK_AUTH_LABELS } from "@/lib/types";

export default function ManagerDashboard() {
  const state = useAppState();
  const user = useCurrentUser();
  const branchEmployees = state.users.filter((u) => {
    if (u.systemRole !== "employee") return false;
    if (user.systemRole === "owner") return true;
    return u.branchId === user.branchId;
  });

  const unfinished = state.assignments.filter(
    (a) =>
      a.status !== "completed" &&
      branchEmployees.some((e) => e.id === a.employeeUserId)
  );
  const failedExams = state.examAttempts.filter(
    (e) =>
      !e.passed && branchEmployees.some((u) => u.id === e.userId)
  );
  const pendingAck = state.sops.filter((sop) => {
    if (!sop.requiresAcknowledgment) return false;
    return branchEmployees.some(
      (e) =>
        !state.sopAcknowledgments.some(
          (a) =>
            a.userId === e.id &&
            a.sopId === sop.id &&
            a.versionId === sop.currentVersionId
        )
    );
  });

  const weakSkills = state.employeeCompetencies
    .filter(
      (ec) =>
        branchEmployees.some((e) => e.id === ec.userId) &&
        (ec.knowledgeLevel < 60 || ec.workAuthorization === "none")
    )
    .slice(0, 6);

  const readyIndependent = state.employeeCompetencies.filter(
    (ec) =>
      branchEmployees.some((e) => e.id === ec.userId) &&
      ec.workAuthorization === "independent"
  );

  const expiringCerts = state.certificates.filter((c) => {
    if (!c.expiresAt) return false;
    if (!branchEmployees.some((e) => e.id === c.userId)) return false;
    const days =
      (new Date(c.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    return days < 60;
  });

  return (
    <AppShell title="داشبورد مدیر">
      <div className="mx-auto max-w-desk space-y-5">
        <section>
          <h1 className="page-title mb-2">آمادگی عملیاتی کارکنان</h1>
          <p className="muted text-sm leading-7 max-w-2xl">
            تمرکز روی اقدام: آموزش ناتمام، مردودی، تأیید SOP، شکاف مهارت و کسانی
            که واقعاً برای کار مستقل آماده‌اند (ارزیابی عملی — نه فقط نمره آزمون).
          </p>
        </section>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "آموزش ناتمام", value: unfinished.length },
            { label: "مردودی آزمون", value: failedExams.length },
            { label: "SOP بدون تأیید", value: pendingAck.length },
            { label: "مجوز مستقل فعال", value: readyIndependent.length },
          ].map((m) => (
            <div key={m.label} className="surface p-4">
              <p className="text-xs faint mb-1">{m.label}</p>
              <p className="text-2xl font-bold">{toPersianDigits(m.value)}</p>
            </div>
          ))}
        </div>

        <section className="grid gap-3 md:grid-cols-2">
          <ManagerAlert
            title="نیاز به بازآموزی محاسبات"
            body="سارا محمدی در محاسبه اجرت ضعف تکراری دارد. نمره آزمون مجوز کار مستقل نیست."
            href="/manager/assessments"
            tone="warning"
          />
          <ManagerAlert
            title="دستورالعمل تحویل ویترین"
            body="نسخه ۲ برای بخشی از کارکنان هنوز تأیید نشده است."
            href="/manager/sops"
            tone="danger"
          />
        </section>

        <section className="grid gap-5 lg:grid-cols-2">
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="section-title">کارکنان با آموزش باز</h2>
              <Link href="/manager/employees" className="text-xs" style={{ color: "var(--accent-deep)" }}>
                همه
              </Link>
            </div>
            <div className="space-y-2">
              {branchEmployees.map((e) => {
                const open = unfinished.filter((a) => a.employeeUserId === e.id);
                const profile = state.employeeProfiles.find((p) => p.userId === e.id);
                return (
                  <Link
                    key={e.id}
                    href={`/manager/employees?focus=${e.id}`}
                    className="surface flex items-center justify-between p-4"
                  >
                    <div>
                      <p className="font-semibold text-sm">{e.fullName}</p>
                      <p className="muted text-xs mt-1">
                        {state.branches.find((b) => b.id === e.branchId)?.name}
                        
                      </p>
                    </div>
                    <Badge tone={open.length ? "warning" : "success"}>
                      {open.length
                        ? `${toPersianDigits(open.length)} مورد باز`
                        : "به‌روز"}
                    </Badge>
                  </Link>
                );
              })}
            </div>
          </div>

          <div>
            <h2 className="section-title mb-3">شکاف مهارت / مجوز</h2>
            <div className="space-y-2">
              {weakSkills.map((ec) => {
                const emp = state.users.find((u) => u.id === ec.userId);
                const comp = state.competencies.find((c) => c.id === ec.competencyId);
                return (
                  <div key={ec.id} className="surface p-4">
                    <p className="font-semibold text-sm">
                      {emp?.fullName} · {comp?.title}
                    </p>
                    <p className="muted text-xs mt-2">
                      دانش {toPersianDigits(ec.knowledgeLevel)}٪ · مجوز:{" "}
                      {WORK_AUTH_LABELS[ec.workAuthorization]}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-3">
          <Link href="/manager/training" className="btn btn-secondary justify-center">
            اختصاص آموزش
          </Link>
          <Link href="/manager/assessments" className="btn btn-secondary justify-center">
            ارزیابی عملی
          </Link>
          <Link href="/manager/analytics" className="btn btn-secondary justify-center">
            تحلیل شعب
          </Link>
        </section>

        {expiringCerts.length ? (
          <section className="surface p-4">
            <h2 className="section-title mb-2">گواهی‌های نزدیک به انقضا</h2>
            {expiringCerts.map((c) => (
              <p key={c.id} className="text-sm muted leading-7">
                {state.users.find((u) => u.id === c.userId)?.fullName} — {c.title}
              </p>
            ))}
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}
