"use client";

import { useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { PRACTICAL_STATUS_LABELS, type PracticalStatus } from "@/lib/types";
import { useAppState, useCurrentUser } from "@/lib/hooks";
import { recordPracticalAssessmentFromUi } from "@/lib/store";

const CRITERIA_DEFAULT = [
  "شمارش / دقت",
  "ثبت مستندات",
  "نحوه کار با کالا",
  "رعایت رویه",
];

export default function AssessmentsPage() {
  const state = useAppState();
  const user = useCurrentUser();
  const employees = state.users.filter((u) => {
    if (u.systemRole !== "employee") return false;
    if (user.systemRole === "owner") return true;
    return u.branchId === user.branchId;
  });

  const [employeeId, setEmployeeId] = useState(employees[0]?.id ?? "");
  const [competencyId, setCompetencyId] = useState("comp_security");
  const [status, setStatus] = useState<PracticalStatus>("supervised");
  const [notes, setNotes] = useState(
    "دانش آزمون خوب است؛ برای کار مستقل هنوز نیاز به نظارت دارد."
  );
  const [checks, setChecks] = useState<boolean[]>([true, true, true, false]);
  const [done, setDone] = useState(false);

  return (
    <AppShell title="ارزیابی عملی">
      <div className="mx-auto max-w-lg space-y-5">
        <section>
          <h1 className="page-title mb-2">ارزیابی عملی شایستگی</h1>
          <p className="muted text-sm leading-7">
            این فرم تنها مسیر صدور «مجوز کار مستقل» است. نمره آزمون اینجا به‌صورت
            خودکار مجوز نمی‌سازد.
          </p>
        </section>

        <div className="surface p-4 space-y-3">
          <div>
            <label className="label">کارمند</label>
            <select
              className="field"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
            >
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.fullName}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">شایستگی</label>
            <select
              className="field"
              value={competencyId}
              onChange={(e) => setCompetencyId(e.target.value)}
            >
              {state.competencies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">وضعیت عملی</label>
            <select
              className="field"
              value={status}
              onChange={(e) => setStatus(e.target.value as PracticalStatus)}
            >
              {(Object.keys(PRACTICAL_STATUS_LABELS) as PracticalStatus[]).map(
                (k) => (
                  <option key={k} value={k}>
                    {PRACTICAL_STATUS_LABELS[k]}
                  </option>
                )
              )}
            </select>
          </div>
          <div>
            <p className="label">معیارها</p>
            <div className="space-y-2">
              {CRITERIA_DEFAULT.map((label, i) => (
                <label key={label} className="flex min-h-[44px] items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={checks[i]}
                    onChange={(e) => {
                      const next = [...checks];
                      next[i] = e.target.checked;
                      setChecks(next);
                    }}
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="label">یادداشت مربی</label>
            <textarea
              className="field min-h-[100px]"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <button
            type="button"
            className="btn btn-primary w-full"
            onClick={() => {
              recordPracticalAssessmentFromUi({
                userId: employeeId,
                competencyId,
                status,
                notes,
                criteria: CRITERIA_DEFAULT.map((label, i) => ({
                  label,
                  met: !!checks[i],
                })),
              });
              setDone(true);
            }}
          >
            ثبت ارزیابی و به‌روزرسانی مجوز کار
          </button>
          {done ? (
            <p className="text-sm" style={{ color: "var(--success)" }}>
              ثبت شد. اگر وضعیت «شایسته/پیشرفته» باشد مجوز مستقل فعال می‌شود؛ در
              غیر این صورت supervised یا بدون مجوز.
            </p>
          ) : null}
        </div>

        <section>
          <h2 className="section-title mb-3">تاریخچه اخیر</h2>
          <div className="space-y-2">
            {state.practicalAssessments.slice(0, 5).map((pa) => (
              <div key={pa.id} className="surface p-3 text-sm">
                <p className="font-semibold">
                  {state.users.find((u) => u.id === pa.employeeUserId)?.fullName} ·{" "}
                  {
                    state.competencies.find((c) => c.id === pa.competencyId)
                      ?.title
                  }
                </p>
                <p className="muted text-xs mt-1">
                  {PRACTICAL_STATUS_LABELS[pa.practicalStatus]} → مجوز{" "}
                  {pa.workAuthorization}
                </p>
                <p className="faint text-xs mt-1">{pa.notes}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
