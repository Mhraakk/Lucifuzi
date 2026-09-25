"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { Badge } from "@/components/ui/Feedback";
import { toPersianDigits } from "@/lib/format";
import { useAppState, useCurrentUser } from "@/lib/hooks";
import { assignCourse } from "@/lib/store";
import { JOB_ROLE_LABELS, WORK_AUTH_LABELS } from "@/lib/types";

export default function EmployeesClient() {
  const state = useAppState();
  const user = useCurrentUser();
  const params = useSearchParams();
  const focus = params.get("focus");
  const [selected, setSelected] = useState(focus ?? "user_emp_nima");
  const [courseId, setCourseId] = useState("course_03");
  const [reason, setReason] = useState("تمرین جبرانی محاسبات اجرت");
  const [msg, setMsg] = useState<string | null>(null);

  const employees = useMemo(
    () =>
      state.users.filter((u) => {
        if (u.systemRole !== "employee") return false;
        if (user.systemRole === "owner") return true;
        return u.branchId === user.branchId;
      }),
    [state.users, user]
  );

  const emp = employees.find((e) => e.id === selected) ?? employees[0];
  const profile = state.employeeProfiles.find((p) => p.userId === emp?.id);
  const comps = state.employeeCompetencies.filter((e) => e.userId === emp?.id);

  return (
    <AppShell title="کارکنان">
      <div className="mx-auto max-w-desk grid gap-5 lg:grid-cols-[280px_1fr]">
        <aside className="space-y-2">
          {employees.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => setSelected(e.id)}
              className="surface w-full p-3 text-right"
              style={{
                borderColor: emp?.id === e.id ? "var(--accent)" : "var(--line)",
              }}
            >
              <p className="font-semibold text-sm">{e.fullName}</p>
              <p className="faint text-xs mt-1">
                {state.branches.find((b) => b.id === e.branchId)?.name}
              </p>
            </button>
          ))}
        </aside>

        {emp ? (
          <section className="space-y-4">
            <div className="surface p-5">
              <h1 className="page-title !text-xl">{emp.fullName}</h1>
              <p className="muted text-sm mt-2">
                {profile ? JOB_ROLE_LABELS[profile.jobRole] : "—"} · {emp.phone}
              </p>
            </div>

            <div className="surface p-4">
              <h2 className="section-title mb-3">شایستگی و مجوز کار</h2>
              <div className="space-y-2">
                {comps.map((ec) => {
                  const c = state.competencies.find(
                    (x) => x.id === ec.competencyId
                  );
                  return (
                    <div
                      key={ec.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm"
                      style={{ background: "var(--bg-soft)" }}
                    >
                      <span>{c?.title}</span>
                      <span className="faint text-xs">
                        دانش {toPersianDigits(ec.knowledgeLevel)} ·{" "}
                        {WORK_AUTH_LABELS[ec.workAuthorization]}
                      </span>
                    </div>
                  );
                })}
              </div>
              <p className="text-xs faint mt-3 leading-6">
                حتی با آزمون ۹۰٪، تا ارزیابی عملی تأیید نشود مجوز مستقل صادر
                نمی‌شود.
              </p>
            </div>

            <div className="surface p-4 space-y-3">
              <h2 className="section-title">اختصاص آموزش</h2>
              <select
                className="field"
                value={courseId}
                onChange={(e) => setCourseId(e.target.value)}
              >
                {state.courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
              <input
                className="field"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="دلیل"
              />
              <button
                type="button"
                className="btn btn-primary w-full"
                onClick={() => {
                  assignCourse({
                    employeeUserId: emp.id,
                    courseId,
                    reason,
                    isMandatory: true,
                  });
                  setMsg("آموزش اختصاص داده شد.");
                }}
              >
                ثبت اختصاص
              </button>
              {msg ? (
                <p className="text-sm" style={{ color: "var(--success)" }}>
                  {msg}
                </p>
              ) : null}
            </div>
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}
