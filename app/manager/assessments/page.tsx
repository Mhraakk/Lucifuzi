"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { PRACTICAL_STATUS_LABELS, type PracticalStatus } from "@/lib/types";
import { useAppState, useCurrentUser } from "@/lib/hooks";
import { recordPracticalAssessmentFromUi } from "@/lib/store";
import { suggestAssessmentCoach } from "@/lib/ai/assessmentCoach";

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
  const [notes, setNotes] = useState("");
  const [checks, setChecks] = useState<boolean[]>([]);
  const [done, setDone] = useState(false);
  const [coachApplied, setCoachApplied] = useState(false);

  const competency = state.competencies.find((c) => c.id === competencyId);
  const employee = state.users.find((u) => u.id === employeeId);
  const ec = state.employeeCompetencies.find(
    (e) => e.userId === employeeId && e.competencyId === competencyId
  );

  const coach = useMemo(() => {
    if (!competency || !employee) return null;
    const sopLag = state.sops.filter((sop) => {
      if (!sop.requiresAcknowledgment) return false;
      return !state.sopAcknowledgments.some(
        (a) =>
          a.userId === employeeId &&
          a.sopId === sop.id &&
          a.versionId === sop.currentVersionId
      );
    }).length;
    const failedExamRecently = state.examAttempts.some(
      (e) => e.userId === employeeId && !e.passed
    );
    return suggestAssessmentCoach({
      competency,
      employeeName: employee.fullName,
      knowledgeLevel: ec?.knowledgeLevel ?? 0,
      currentAuth: ec?.workAuthorization ?? "none",
      practicalStatus: ec?.practicalStatus,
      sopLagCount: sopLag,
      failedExamRecently,
    });
  }, [competency, employee, employeeId, ec, state]);

  const criteriaLabels =
    checks.length && coachApplied && coach
      ? coach.checklist
      : coach?.checklist ?? [
          "شمارش / کنترل",
          "ثبت مستندات",
          "نحوه کار با کالا",
          "رعایت رویه",
        ];

  function applyCoach() {
    if (!coach) return;
    setChecks(coach.checklist.map(() => false));
    setNotes(coach.suggestedNotes);
    setCoachApplied(true);
  }

  // Keep checks array length in sync when competency changes before coach apply
  const displayLabels = criteriaLabels;
  const displayChecks =
    checks.length === displayLabels.length
      ? checks
      : displayLabels.map((_, i) => checks[i] ?? false);

  return (
    <AppShell title="ارزیابی عملی">
      <div className="mx-auto max-w-lg space-y-5">
        <section>
          <h1 className="page-title mb-2">ارزیابی عملی شایستگی</h1>
          <p className="muted text-sm leading-7">
            این فرم تنها مسیر صدور «مجوز کار مستقل» است. مربی AI فقط چک‌لیست و
            یادداشت پیشنهاد می‌دهد — مجوز را انسان صادر می‌کند.
          </p>
          <Link
            href="/manager/responsibilities"
            className="btn btn-secondary mt-3 inline-flex text-sm"
          >
            محول مسئولیت از روی آزمایش نقش
          </Link>
        </section>

        {coach ? (
          <div className="surface p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="section-title !mb-0">مربی ارزیابی AI</p>
              <button
                type="button"
                className="btn btn-secondary !min-h-9 text-xs"
                onClick={applyCoach}
              >
                پر کردن چک‌لیست
              </button>
            </div>
            <p className="text-xs muted leading-6">{coach.suggestedNotes}</p>
            {coach.renewalHint ? (
              <p className="text-xs" style={{ color: "var(--warning)" }}>
                {coach.renewalHint}
              </p>
            ) : null}
            <ul className="space-y-1">
              {coach.evidenceNeeded.map((e) => (
                <li key={e} className="faint text-[0.7rem] leading-5">
                  · {e}
                </li>
              ))}
            </ul>
            <p className="faint text-[0.65rem]">
              دامنه: {coach.domainCodes.join(" · ") || "—"} · AI مجوز کار نمی‌دهد
            </p>
          </div>
        ) : null}

        <div className="surface p-4 space-y-3">
          <div>
            <label className="label">کارمند</label>
            <select
              className="field"
              value={employeeId}
              onChange={(e) => {
                setEmployeeId(e.target.value);
                setCoachApplied(false);
                setDone(false);
              }}
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
              onChange={(e) => {
                setCompetencyId(e.target.value);
                setCoachApplied(false);
                setDone(false);
              }}
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
              {displayLabels.map((label, i) => (
                <label
                  key={`${label}-${i}`}
                  className="flex min-h-[44px] items-center gap-2 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={!!displayChecks[i]}
                    onChange={(e) => {
                      const next = [...displayChecks];
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
              placeholder="یادداشت ساخت‌یافته یا پیشنهاد مربی AI را ویرایش کنید"
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
                notes:
                  notes ||
                  coach?.suggestedNotes ||
                  "ارزیابی عملی ثبت شد.",
                criteria: displayLabels.map((label, i) => ({
                  label,
                  met: !!displayChecks[i],
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
