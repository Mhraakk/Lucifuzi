"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { ManagerAlert } from "@/components/training/Cards";
import { Badge } from "@/components/ui/Feedback";
import { toPersianDigits } from "@/lib/format";
import { useAppState, useCurrentUser } from "@/lib/hooks";
import {
  getFloorReadiness,
  runSopRemediationSweep,
} from "@/lib/store";
import { WORK_AUTH_LABELS } from "@/lib/types";

export default function ManagerDashboard() {
  const state = useAppState();
  const user = useCurrentUser();
  const [sweepMsg, setSweepMsg] = useState<string | null>(null);

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

  const floorNotReady = useMemo(() => {
    return getFloorReadiness(state).filter((row) =>
      branchEmployees.some((e) => e.id === row.userId)
    );
  }, [state, branchEmployees]);

  function runSweep() {
    const n = runSopRemediationSweep(user.id);
    setSweepMsg(
      n > 0
        ? `${toPersianDigits(n)} اقدام remediation ثبت شد (تکلیف/اعلان — بدون مجوز کار).`
        : "مورد جدیدی برای remediation نبود."
    );
  }

  return (
    <AppShell title="داشبورد مدیر">
      <div className="mx-auto max-w-desk space-y-5">
        <section className="animate-in">
          <h1 className="page-title mb-2">آمادگی عملیاتی کارکنان</h1>
          <p className="muted max-w-2xl text-sm leading-7">
            تمرکز روی اقدام: آموزش ناتمام، مردودی، تأیید SOP، شکاف مهارت و کسانی
            که واقعاً برای کار مستقل آماده‌اند (ارزیابی عملی — نه فقط نمره آزمون).
          </p>
        </section>

        <div className="stagger grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "آموزش ناتمام", value: unfinished.length },
            { label: "مردودی آزمون", value: failedExams.length },
            { label: "SOP بدون تأیید", value: pendingAck.length },
            { label: "فردا روی ویترین آماده نیست", value: floorNotReady.length },
          ].map((m) => (
            <div key={m.label} className="surface p-4">
              <p className="mb-1 text-xs faint">{m.label}</p>
              <p
                className="text-2xl font-bold"
                style={{ color: "var(--accent-deep)" }}
              >
                {toPersianDigits(m.value)}
              </p>
            </div>
          ))}
        </div>

        <section className="surface p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="section-title !mb-1">چه کسی فردا روی ویترین آماده نیست؟</h2>
              <p className="faint text-xs leading-5">
                مجوز کار، تکلیف اجباری، دانش پایین، SOP بدون ack — remediation خودکار مجوز نمی‌دهد.
              </p>
            </div>
            <button
              type="button"
              className="btn btn-secondary !min-h-10 text-xs"
              onClick={runSweep}
            >
              جارو remediation
            </button>
          </div>
          {sweepMsg ? (
            <p className="text-xs" style={{ color: "var(--accent-deep)" }}>
              {sweepMsg}
            </p>
          ) : null}
          <div className="space-y-2">
            {floorNotReady.length === 0 ? (
              <p className="muted text-sm">همه کارکنان شاخه از نظر چک‌لیست آماده‌اند.</p>
            ) : (
              floorNotReady.slice(0, 8).map((row) => (
                <Link
                  key={row.userId}
                  href={`/manager/employees?focus=${row.userId}`}
                  className="surface flex flex-col gap-1 p-3 sm:flex-row sm:items-center sm:justify-between"
                  style={{ background: "var(--bg-soft)" }}
                >
                  <p className="font-semibold text-sm">{row.fullName}</p>
                  <p className="muted text-xs leading-6">
                    {row.reasons.slice(0, 3).join(" · ")}
                  </p>
                </Link>
              ))
            )}
          </div>
          <p className="faint text-[0.65rem]">
            مجوز مستقل فعال در شایستگی‌ها: {toPersianDigits(readyIndependent.length)}
          </p>
        </section>

        <section className="grid gap-3 md:grid-cols-2">
          {failedExams[0] ? (
            <ManagerAlert
              title="مردودی آزمون واقعی"
              body={`${
                state.users.find((u) => u.id === failedExams[0]!.userId)
                  ?.fullName ?? "کارمند"
              } در آزمون دوره با نمره ${toPersianDigits(
                failedExams[0]!.score
              )}٪ مردود شد — از پاسخ‌های درجه‌بندی‌شده. نمره آزمون مجوز کار نیست.`}
              href="/manager/assessments"
              tone="warning"
            />
          ) : (
            <ManagerAlert
              title="مردودی آزمون"
              body="هیچ مردودی آزمون با پاسخ واقعی در این شعبه ثبت نشده است."
              href="/manager/assessments"
              tone="warning"
            />
          )}
          {pendingAck[0] ? (
            <ManagerAlert
              title="دستورالعمل بدون تأیید"
              body={`«${pendingAck[0]!.title}» برای بخشی از کارکنان هنوز تأیید نشده است — از داده ack واقعی.`}
              href="/manager/sops"
              tone="danger"
            />
          ) : (
            <ManagerAlert
              title="دستورالعمل‌ها"
              body="همه SOPهای اجباری این شعبه تأیید شده‌اند — یا مورد معلقی نیست."
              href="/manager/sops"
              tone="danger"
            />
          )}
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

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Link href="/manager/training" className="btn btn-secondary justify-center">
            اختصاص آموزش
          </Link>
          <Link href="/manager/assessments" className="btn btn-secondary justify-center">
            ارزیابی عملی
          </Link>
          <Link href="/manager/analytics" className="btn btn-secondary justify-center">
            تحلیل شعب
          </Link>
          <Link href="/ops" className="btn btn-primary justify-center">
            اسکلت ۲۰ لایه
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
