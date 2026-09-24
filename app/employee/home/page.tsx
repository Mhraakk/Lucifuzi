"use client";

import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { CourseCard } from "@/components/training/Cards";
import { Badge, ProgressRing } from "@/components/ui/Feedback";
import {
  formatJalaliDate,
  formatMinutes,
  toPersianDigits,
} from "@/lib/format";
import { useAppState, useCurrentUser, useEmployeeProfile } from "@/lib/hooks";
import {
  courseProgressPercent,
  getTodayDaily,
} from "@/lib/store";
import { JOB_ROLE_LABELS, WORK_AUTH_LABELS } from "@/lib/types";

export default function EmployeeHomePage() {
  const state = useAppState();
  const user = useCurrentUser();
  const profile = useEmployeeProfile();
  const daily = getTodayDaily(state);
  const path = state.learningPaths.find((p) => p.id === profile?.learningPathId);
  const continueLesson = state.lessonProgress
    .filter((p) => p.userId === user.id && p.status === "in_progress")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  const continueMeta = continueLesson
    ? state.lessons.find((l) => l.id === continueLesson.lessonId)
    : state.lessons.find((l) => l.id === "les_02_2_1");

  const mandatory = state.assignments.filter(
    (a) =>
      a.employeeUserId === user.id &&
      a.isMandatory &&
      a.status !== "completed"
  );

  const pendingSop = state.sops.filter((sop) => {
    if (!sop.requiresAcknowledgment) return false;
    return !state.sopAcknowledgments.some(
      (a) =>
        a.userId === user.id &&
        a.sopId === sop.id &&
        a.versionId === sop.currentVersionId
    );
  });

  const pathProgress =
    path && path.courseIds.length
      ? Math.round(
          path.courseIds.reduce(
            (sum, id) => sum + courseProgressPercent(state, user.id, id),
            0
          ) / path.courseIds.length
        )
      : 0;

  return (
    <AppShell title="خانه">
      <div className="mx-auto max-w-app space-y-5 pb-4">
        <section className="animate-in">
          <p className="faint text-xs mb-1">{formatJalaliDate(new Date())}</p>
          <h1 className="page-title">سلام، {user.fullName.split(" ")[0]}</h1>
          <p className="muted text-sm mt-2 leading-7">
            {profile ? JOB_ROLE_LABELS[profile.jobRole] : "—"} ·{" "}
            {state.branches.find((b) => b.id === user.branchId)?.name}
            {profile?.streakDays
              ? ` · پیوستگی ${toPersianDigits(profile.streakDays)} روز`
              : null}
          </p>
        </section>

        {pendingSop.length > 0 ? (
          <Link
            href={`/employee/sop/${pendingSop[0]!.id}`}
            className="surface block p-4"
            style={{ borderRight: "3px solid var(--warning)" }}
          >
            <p className="font-bold text-sm">تأیید دستورالعمل لازم است</p>
            <p className="muted text-sm mt-1 leading-7">
              {pendingSop[0]!.title} — نسخه جدید را بخوانید و تأیید کنید.
            </p>
          </Link>
        ) : null}

        <section className="surface p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs faint mb-1">ادامه آموزش</p>
              <p className="font-bold">{continueMeta?.title ?? "شروع مسیر یادگیری"}</p>
              <p className="muted text-sm mt-1 line-clamp-2">
                {continueMeta?.summary ?? path?.description}
              </p>
              <Link
                href={
                  continueMeta
                    ? `/employee/lessons/${continueMeta.id}`
                    : "/employee/learn"
                }
                className="btn btn-primary mt-4 !min-h-11 text-sm"
              >
                ادامه بده
              </Link>
            </div>
            <ProgressRing value={continueLesson?.percent ?? pathProgress} label="پیشرفت" />
          </div>
        </section>

        <section className="grid gap-3">
          <div className="surface p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="font-bold">آموزش امروز</p>
              <Badge tone="accent">۳–۵ دقیقه</Badge>
            </div>
            <p className="text-sm leading-7">{daily?.title}</p>
            <p className="muted text-sm mt-2 leading-7 line-clamp-3">
              {daily?.tip}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Link href={`/employee/quiz?daily=1`} className="surface p-4">
              <p className="text-xs faint mb-1">سؤال امروز</p>
              <p className="text-sm font-semibold leading-6">
                یک پرسش کوتاه برای تثبیت
              </p>
            </Link>
            <Link
              href={`/employee/scenario/${daily?.scenarioId ?? "sc_fraud_switch"}`}
              className="surface p-4"
            >
              <p className="text-xs faint mb-1">سناریوی امروز</p>
              <p className="text-sm font-semibold leading-6">
                تمرین موقعیت واقعی فروشگاه
              </p>
            </Link>
          </div>
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="section-title">مسیر من</h2>
            <Link href="/employee/learn" className="text-xs" style={{ color: "var(--accent-deep)" }}>
              همه دوره‌ها
            </Link>
          </div>
          <p className="muted text-sm mb-3">{path?.title}</p>
          <div className="grid gap-3">
            {(path?.courseIds ?? []).slice(0, 3).map((cid) => {
              const c = state.courses.find((x) => x.id === cid);
              if (!c) return null;
              return (
                <CourseCard
                  key={c.id}
                  id={c.id}
                  title={c.title}
                  description={c.description}
                  minutes={c.estimatedMinutes}
                  progress={courseProgressPercent(state, user.id, c.id)}
                  accent={c.coverAccent}
                />
              );
            })}
          </div>
        </section>

        <section>
          <h2 className="section-title mb-3">آموزش‌های اجباری</h2>
          {mandatory.length === 0 ? (
            <p className="muted text-sm">مورد بازی باقی نمانده.</p>
          ) : (
            <div className="space-y-2">
              {mandatory.map((a) => {
                const course = state.courses.find((c) => c.id === a.courseId);
                return (
                  <Link
                    key={a.id}
                    href={`/employee/courses/${a.courseId}`}
                    className="surface flex items-center justify-between gap-3 p-4"
                  >
                    <div>
                      <p className="font-semibold text-sm">
                        {course?.title ?? "تکلیف آموزشی"}
                      </p>
                      <p className="muted text-xs mt-1">
                        {a.priority === "high"
                          ? "الزامی و اولویت‌دار"
                          : "تکلیف آموزشی"}
                      </p>
                    </div>
                    <Badge tone="warning">اجباری</Badge>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        <section className="surface p-4">
          <h2 className="section-title mb-2">مهارت‌های من</h2>
          <p className="muted text-sm leading-7 mb-3">
            نمره آزمون نشان‌دهنده دانش است؛ مجوز کار مستقل فقط پس از ارزیابی عملی مدیر فعال می‌شود.
          </p>
          <div className="flex flex-wrap gap-2 mb-3">
            {state.employeeCompetencies
              .filter((e) => e.userId === user.id)
              .slice(0, 4)
              .map((ec) => {
                const c = state.competencies.find((x) => x.id === ec.competencyId);
                return (
                  <span key={ec.id} className="chip">
                    {c?.title}: دانش {toPersianDigits(ec.knowledgeLevel)} ·{" "}
                    {WORK_AUTH_LABELS[ec.workAuthorization]}
                  </span>
                );
              })}
          </div>
          <Link href="/employee/skills" className="btn btn-secondary w-full text-sm">
            نقشه شایستگی
          </Link>
        </section>

        <div className="grid grid-cols-2 gap-3">
          <Link href="/employee/certificates" className="surface p-4 text-center">
            <p className="font-bold text-sm">مدارک من</p>
            <p className="faint text-xs mt-1">
              {toPersianDigits(
                state.certificates.filter((c) => c.userId === user.id).length
              )}{" "}
              گواهی
            </p>
          </Link>
          <Link href="/employee/search" className="surface p-4 text-center">
            <p className="font-bold text-sm">جستجو</p>
            <p className="faint text-xs mt-1">اجرت، ویترین، تعمیر…</p>
          </Link>
        </div>

        <Link href="/employee/assistant" className="btn btn-secondary w-full">
          دستیار آموزشی آریا
        </Link>
        <p className="faint text-center text-xs">
          مدت تخمینی مسیر فعلی:{" "}
          {formatMinutes(
            (path?.courseIds ?? [])
              .map((id) => state.courses.find((c) => c.id === id)?.estimatedMinutes ?? 0)
              .reduce((a, b) => a + b, 0)
          )}
        </p>
      </div>
    </AppShell>
  );
}
