"use client";

import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import {
  AtelierProductHero,
  AtelierProductStrip,
  AtelierWall,
  buildWallPins,
} from "@/components/training/AtelierWall";
import { FormulaStudio } from "@/components/training/FormulaStudio";
import { PedagogyJourney } from "@/components/training/PedagogyJourney";
import { VisualAtelierCanon } from "@/components/training/VisualAtelierCanon";
import { CareerPathfinder } from "@/components/career/CareerPathfinder";
import { ArsenalWorkbench } from "@/components/atelier/ArsenalWorkbench";
import { Badge } from "@/components/ui/Feedback";
import {
  formatJalaliDate,
  formatMinutes,
  toPersianDigits,
} from "@/lib/format";
import { useAppState, useCurrentUser, useEmployeeProfile } from "@/lib/hooks";
import { courseProgressPercent, getTodayDaily } from "@/lib/store";
import { JOB_ROLE_LABELS } from "@/lib/types";

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
    : undefined;

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

  const pathCourses = (path?.courseIds ?? [])
    .map((cid) => {
      const c = state.courses.find((x) => x.id === cid);
      if (!c) return null;
      return {
        id: c.id,
        title: c.title,
        description: c.description,
        progress: courseProgressPercent(state, user.id, c.id),
      };
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x));

  const pathProgress = pathCourses.length
    ? Math.round(
        pathCourses.reduce((sum, c) => sum + c.progress, 0) / pathCourses.length
      )
    : 0;

  const wallPins = buildWallPins(pathCourses);

  const firstName = user.fullName.split(" ")[0] ?? user.fullName;

  return (
    <AppShell title="خانه">
      <div className="mx-auto max-w-app space-y-6 pb-4">
        <section className="home-immersion portal-rise">
          <p className="home-immersion__date">{formatJalaliDate(new Date())}</p>
          <h1 className="home-immersion__hello">
            <span>سلام،</span> {firstName}
          </h1>
          <p className="home-immersion__meta">
            {profile ? JOB_ROLE_LABELS[profile.jobRole] : "—"}
            {" · "}
            {state.branches.find((b) => b.id === user.branchId)?.name}
            {profile?.streakDays
              ? ` · پیوستگی ${toPersianDigits(profile.streakDays)} روز`
              : null}
          </p>
        </section>

        <AtelierProductHero
          title="چشم سنگ‌تراش، دست گالری‌دار"
          subtitle="تئوری و عملی تنها منبع آموزش‌اند — بینایی، استدلال، زیبایی‌سنجی و دقت را مثل استادان ایتالیایی بیازمایید و بالا ببرید."
          ctaHref="/employee/learn"
          ctaLabel="ورود به آکادمی تئوری"
        />

        <VisualAtelierCanon />

        <CareerPathfinder compact />

        <ArsenalWorkbench compact />

        <Link
          href="/employee/trials"
          className="jx-cta tap-react !self-stretch text-center"
          style={{ display: "block" }}
        >
          آزمایش نقش · فروش · عملیات · ساخت · ذوب · ایده · نوسان · معامله · کیفی
        </Link>

        <Link
          href="/employee/products"
          className="jx-cta tap-react !self-stretch text-center"
          style={{ display: "block" }}
        >
          شمش زربد · پلاک زردیس · طلای کارشده و آب‌شده
        </Link>

        <PedagogyJourney />

        <FormulaStudio compact />

        {pendingSop.length > 0 ? (
          <Link
            href={`/employee/sop/${pendingSop[0]!.id}`}
            className="surface surface-interactive block p-4 animate-in"
            style={{ borderRight: "3px solid var(--warning)" }}
          >
            <p className="text-sm font-bold">تأیید دستورالعمل لازم است</p>
            <p className="muted mt-1 text-sm leading-7">
              {pendingSop[0]!.title} — نسخه جدید را بخوانید و تأیید کنید.
            </p>
          </Link>
        ) : null}

        <AtelierWall
          eyebrow="اطلس شایستگی US · CH · EU"
          title={path?.title ?? "ویترین مهارت‌های شما"}
          overall={pathProgress}
          pins={wallPins}
          goalLabel={
            path
              ? `${path.description} · حدود ${toPersianDigits(path.estimatedDays)} روز برای پوشش دامنه‌ها`
              : "هر دامنه یک شایستگی واقعی گالری است — دانش ≠ مجوز کار."
          }
        />

        <AtelierProductStrip />

        <section className="surface p-4 animate-in">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="mb-1 text-xs faint">ادامه از جایی که ماندید</p>
              <p className="font-bold leading-6">
                {continueMeta?.title ?? "شروع مسیر یادگیری"}
              </p>
              <p className="muted mt-1 line-clamp-2 text-sm leading-7">
                {continueMeta?.summary ?? path?.description}
              </p>
            </div>
            <div className="shrink-0 text-left">
              <p
                className="text-lg font-bold"
                style={{ color: "var(--accent-deep)" }}
              >
                {toPersianDigits(continueLesson?.percent ?? pathProgress)}٪
              </p>
            </div>
          </div>
          <Link
            href={
              continueMeta
                ? `/employee/lessons/${continueMeta.id}`
                : "/employee/learn"
            }
            className="btn btn-primary mt-4 w-full text-sm"
          >
            ادامه بده
          </Link>
        </section>

        <section className="stagger grid gap-3">
          <div className="surface p-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="font-bold">آموزش امروز</p>
              <Badge tone="accent">۳–۵ دقیقه</Badge>
            </div>
            <p className="text-sm leading-7">{daily?.title}</p>
            <p className="muted mt-2 line-clamp-3 text-sm leading-7">
              {daily?.tip}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Link
              href="/employee/quiz?daily=1"
              className="surface surface-interactive p-4"
            >
              <p className="mb-1 text-xs faint">سؤال امروز</p>
              <p className="text-sm font-semibold leading-6">
                یک پرسش کوتاه برای تثبیت
              </p>
            </Link>
            <Link
              href={`/employee/scenario/${daily?.scenarioId ?? "sc_fraud_switch"}`}
              className="surface surface-interactive p-4"
            >
              <p className="mb-1 text-xs faint">سناریوی امروز</p>
              <p className="text-sm font-semibold leading-6">
                تمرین موقعیت واقعی فروشگاه
              </p>
            </Link>
          </div>
        </section>

        <section>
          <h2 className="section-title mb-3">آموزش‌های اجباری</h2>
          {mandatory.length === 0 ? (
            <p className="muted text-sm">مورد بازی باقی نمانده.</p>
          ) : (
            <div className="stagger space-y-2">
              {mandatory.map((a) => {
                const course = state.courses.find((c) => c.id === a.courseId);
                return (
                  <Link
                    key={a.id}
                    href={`/employee/courses/${a.courseId}`}
                    className="surface surface-interactive flex items-center justify-between gap-3 p-4"
                  >
                    <div>
                      <p className="text-sm font-semibold">
                        {course?.title ?? "تکلیف آموزشی"}
                      </p>
                      <p className="muted mt-1 text-xs">
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

        <section className="surface p-4 animate-in">
          <h2 className="section-title mb-2">دانش ≠ مجوز کار</h2>
          <p className="muted mb-3 text-sm leading-7">
            نمره آزمون فقط سطح دانش است. کار مستقل فقط پس از ارزیابی عملی مدیر
            فعال می‌شود.
          </p>
          <Link href="/employee/skills" className="btn btn-secondary w-full text-sm">
            نقشه شایستگی و مجوزها
          </Link>
        </section>

        <div className="stagger grid grid-cols-2 gap-3">
          <Link
            href="/employee/certificates"
            className="surface surface-interactive p-4 text-center"
          >
            <p className="text-sm font-bold">مدارک من</p>
            <p className="faint mt-1 text-xs">
              {toPersianDigits(
                state.certificates.filter((c) => c.userId === user.id).length
              )}{" "}
              گواهی
            </p>
          </Link>
          <Link
            href="/employee/search"
            className="surface surface-interactive p-4 text-center"
          >
            <p className="text-sm font-bold">جستجو</p>
            <p className="faint mt-1 text-xs">اجرت، ویترین، تعمیر…</p>
          </Link>
        </div>

        <Link href="/employee/assistant" className="btn btn-secondary w-full">
          دستیار Beatris
        </Link>
        <p className="faint text-center text-xs">
          مدت تخمینی مسیر فعلی:{" "}
          {formatMinutes(
            pathCourses.reduce(
              (a, c) =>
                a +
                (state.courses.find((x) => x.id === c.id)?.estimatedMinutes ??
                  0),
              0
            )
          )}
        </p>
      </div>
    </AppShell>
  );
}
