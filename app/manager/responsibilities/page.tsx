"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { Badge } from "@/components/ui/Feedback";
import { toPersianDigits } from "@/lib/format";
import { useAppState, useCurrentUser } from "@/lib/hooks";
import { assignResponsibilityFromTrial } from "@/lib/store";
import { envById, trialById, type TrialEnvId } from "@/lib/trials/catalog";
import {
  PRACTICAL_STATUS_LABELS,
  WORK_AUTHORIZATION_LABELS,
  type PracticalStatus,
} from "@/lib/types";

const PRACTICAL_CHOICES: PracticalStatus[] = [
  "supervised",
  "competent",
  "advanced",
  "training_required",
];

export default function ManagerResponsibilitiesPage() {
  const state = useAppState();
  const user = useCurrentUser();

  const employees = state.users.filter((u) => {
    if (u.systemRole !== "employee") return false;
    if (user.systemRole === "owner") return true;
    return u.branchId === user.branchId;
  });

  const [employeeId, setEmployeeId] = useState(employees[0]?.id ?? "");
  const [attemptId, setAttemptId] = useState("");
  const [practical, setPractical] = useState<PracticalStatus>("supervised");
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const passedAttempts = useMemo(
    () =>
      state.trialAttempts
        .filter((t) => t.userId === employeeId && t.passed)
        .sort((a, b) => b.completedAt.localeCompare(a.completedAt)),
    [state.trialAttempts, employeeId]
  );

  const selectedAttempt =
    passedAttempts.find((t) => t.id === attemptId) ?? passedAttempts[0];

  const activeForEmployee = state.responsibilityAssignments.filter(
    (r) => r.employeeUserId === employeeId && r.active
  );

  const pendingPool = useMemo(() => {
    return state.trialAttempts
      .filter((t) => t.passed)
      .filter((t) => {
        const has = state.responsibilityAssignments.some(
          (r) =>
            r.trialAttemptId === t.id ||
            (r.employeeUserId === t.userId &&
              r.envId === t.envId &&
              r.active)
        );
        return !has;
      })
      .sort((a, b) => b.completedAt.localeCompare(a.completedAt))
      .slice(0, 12);
  }, [state.trialAttempts, state.responsibilityAssignments]);

  function submit() {
    setError(null);
    setMessage(null);
    const attempt = selectedAttempt;
    if (!attempt) {
      setError("ابتدا آزمایش قبول‌شده‌ای انتخاب کنید.");
      return;
    }
    try {
      const assignment = assignResponsibilityFromTrial({
        employeeUserId: employeeId,
        trialAttemptId: attempt.id,
        practicalStatus: practical,
        notes,
      });
      setMessage(
        `مسئولیت «${assignment.responsibilityFa}» با مجوز ${WORK_AUTHORIZATION_LABELS[assignment.workAuthorization]} محول شد.`
      );
      setNotes("");
      setAttemptId("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطا در محول مسئولیت");
    }
  }

  return (
    <AppShell title="محول مسئولیت">
      <div className="mx-auto max-w-lg space-y-5 pb-8">
        <section>
          <h1 className="page-title mb-2">محول نقش و مسئولیت کف</h1>
          <p className="muted text-sm leading-7">
            آزمایش نقش فقط شواهد می‌سازد. اینجا با ارزیابی عملی، مسئولیت محیط
            (فروش، عملیات، ساخت، ذوب، ایده، نوسان، معامله، کیفی) واقعاً محول
            می‌شود و مجوز کار ثبت می‌گردد.
          </p>
          <Link
            href="/manager/assessments"
            className="muted text-xs underline mt-2 inline-block"
          >
            فرم ارزیابی عملی عمومی
          </Link>
        </section>

        {pendingPool.length > 0 ? (
          <section className="surface p-4 space-y-2">
            <p className="section-title">شواهد در انتظار محول</p>
            {pendingPool.map((t) => {
              const emp = state.users.find((u) => u.id === t.userId);
              const env = envById(t.envId as TrialEnvId);
              const trial = trialById(t.trialId);
              return (
                <button
                  key={t.id}
                  type="button"
                  className="trial-pending-row tap-react"
                  onClick={() => {
                    setEmployeeId(t.userId);
                    setAttemptId(t.id);
                  }}
                >
                  <div>
                    <strong>{emp?.fullName ?? t.userId}</strong>
                    <p className="muted text-xs mt-0.5">
                      {trial?.titleFa ?? t.trialId} · {env?.titleFa}
                    </p>
                  </div>
                  <Badge tone="success">{toPersianDigits(t.percent)}٪</Badge>
                </button>
              );
            })}
          </section>
        ) : (
          <section className="surface p-4">
            <p className="muted text-sm leading-7">
              فعلاً شواهد قبول‌شدهٔ بدون محول نیست. کارکنان از مسیر «آزمایش نقش»
              محیط‌ها را می‌زنند.
            </p>
          </section>
        )}

        <section className="surface p-4 space-y-4">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">کارمند</span>
            <select
              className="field w-full"
              value={employeeId}
              onChange={(e) => {
                setEmployeeId(e.target.value);
                setAttemptId("");
              }}
            >
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.fullName}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-1.5">
            <span className="text-sm font-medium">شواهد آزمایش قبول‌شده</span>
            <select
              className="field w-full"
              value={selectedAttempt?.id ?? ""}
              onChange={(e) => setAttemptId(e.target.value)}
              disabled={!passedAttempts.length}
            >
              {!passedAttempts.length ? (
                <option value="">آزمایش قبول‌شده‌ای نیست</option>
              ) : (
                passedAttempts.map((t) => {
                  const env = envById(t.envId as TrialEnvId);
                  const trial = trialById(t.trialId);
                  return (
                    <option key={t.id} value={t.id}>
                      {trial?.titleFa ?? t.trialId} · {env?.titleFa} ·{" "}
                      {t.percent}٪
                    </option>
                  );
                })
              )}
            </select>
          </label>

          {selectedAttempt ? (
            <div className="trial-evidence-box">
              <p className="text-xs leading-6">
                محیط:{" "}
                {envById(selectedAttempt.envId as TrialEnvId)?.titleFa ??
                  selectedAttempt.envId}
              </p>
              <p className="text-xs leading-6 muted">
                امتیاز {toPersianDigits(selectedAttempt.percent)}٪ · ابزار:{" "}
                {selectedAttempt.toolsUsed.join("، ") || "—"}
              </p>
              <p className="text-xs leading-6 muted mt-1">
                مسئولیت پیشنهادی:{" "}
                {envById(selectedAttempt.envId as TrialEnvId)
                  ?.responsibilityFa ?? "—"}
              </p>
            </div>
          ) : null}

          <label className="block space-y-1.5">
            <span className="text-sm font-medium">وضعیت ارزیابی عملی</span>
            <select
              className="field w-full"
              value={practical}
              onChange={(e) =>
                setPractical(e.target.value as PracticalStatus)
              }
            >
              {PRACTICAL_CHOICES.map((p) => (
                <option key={p} value={p}>
                  {PRACTICAL_STATUS_LABELS[p]}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-1.5">
            <span className="text-sm font-medium">یادداشت عملی</span>
            <textarea
              className="field w-full min-h-[88px]"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="مشاهده در کف، Dual Control، PPE، …"
            />
          </label>

          {error ? (
            <p className="trial-error text-sm" role="alert">
              {error}
            </p>
          ) : null}
          {message ? (
            <p className="text-sm leading-7" style={{ color: "var(--ok, #2d6a4f)" }}>
              {message}
            </p>
          ) : null}

          <button
            type="button"
            className="btn btn-primary w-full"
            onClick={submit}
            disabled={!selectedAttempt}
          >
            محول مسئولیت + ثبت مجوز کار
          </button>
        </section>

        {activeForEmployee.length > 0 ? (
          <section className="surface p-4 space-y-2">
            <p className="section-title">مسئولیت‌های فعال این کارمند</p>
            {activeForEmployee.map((r) => (
              <div key={r.id} className="trial-resp-row">
                <div>
                  <strong>{r.responsibilityFa}</strong>
                  <p className="muted text-xs mt-1">
                    {envById(r.envId as TrialEnvId)?.titleFa} ·{" "}
                    {WORK_AUTHORIZATION_LABELS[r.workAuthorization]}
                  </p>
                </div>
                <Badge tone="success">فعال</Badge>
              </div>
            ))}
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}
