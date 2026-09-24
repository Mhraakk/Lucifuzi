"use client";

import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { TopicVisual } from "@/components/training/TopicVisual";
import { Badge } from "@/components/ui/Feedback";
import { toPersianDigits } from "@/lib/format";
import { useAppState, useCurrentUser } from "@/lib/hooks";
import { getTodayDaily } from "@/lib/store";

export default function PracticePage() {
  const state = useAppState();
  const user = useCurrentUser();
  const daily = getTodayDaily(state);
  const recs = state.recommendations.filter(
    (r) => r.userId === user.id && !r.dismissed
  );

  return (
    <AppShell title="تمرین">
      <div className="mx-auto max-w-app space-y-5">
        <section className="animate-in">
          <h1 className="page-title mb-2">تمرین عملی</h1>
          <p className="muted text-sm leading-7">
            شبیه‌سازی فروش، محاسبه قیمت و سناریوهای ریسک — پله‌های تمرین تا کار
            واقعی شعبه، در سطح استاندارد گالری‌های معتبر.
          </p>
        </section>

        <TopicVisual topic="practice" className="animate-in" />

        <section className="ladder-panel animate-scale overflow-hidden">
          <div className="ladder-glow" aria-hidden />
          <div className="relative z-[1] p-4">
            <p className="mb-1 text-[11px] faint tracking-[0.06em]">
              تمرین امروز
            </p>
            <p className="section-title mb-2">{daily?.title ?? "تمرین روزانه"}</p>
            <p className="muted mb-4 line-clamp-2 text-sm leading-7">
              {daily?.tip}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Link
                href="/employee/quiz?daily=1"
                className="btn btn-secondary !min-h-11 text-xs"
              >
                سؤال کوتاه
              </Link>
              <Link
                href={`/employee/scenario/${daily?.scenarioId ?? "sc_fraud_switch"}`}
                className="btn btn-primary !min-h-11 text-xs"
              >
                سناریوی امروز
              </Link>
            </div>
          </div>
        </section>

        <Link
          href="/employee/quiz?calc=1"
          className="surface surface-interactive block p-4 animate-in"
        >
          <div className="mb-2 flex items-center justify-between">
            <p className="font-bold">شبیه‌ساز محاسبه قیمت</p>
            <Badge tone="accent">محاسبات</Badge>
          </div>
          <p className="muted text-sm leading-7">
            وزن، عیار، اجرت و سود را محاسبه کنید و با پاسخ صحیح مقایسه کنید.
          </p>
        </Link>

        <section>
          <h2 className="section-title mb-3">سناریوها</h2>
          <div className="stagger space-y-3">
            {state.scenarios.map((sc) => (
              <Link
                key={sc.id}
                href={`/employee/scenario/${sc.id}`}
                className="surface surface-interactive block p-4"
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <p className="text-sm font-bold">{sc.title}</p>
                  <Badge>{sc.category}</Badge>
                </div>
                <p className="muted line-clamp-2 text-sm leading-7">{sc.intro}</p>
              </Link>
            ))}
          </div>
        </section>

        <section>
          <h2 className="section-title mb-3">پیشنهاد بر اساس ضعف</h2>
          <div className="stagger space-y-2">
            {recs.length === 0 ? (
              <p className="muted text-sm">پیشنهاد فعالی باقی نمانده.</p>
            ) : (
              recs.map((r) => (
                <Link
                  key={r.id}
                  href={
                    r.scenarioId
                      ? `/employee/scenario/${r.scenarioId}`
                      : r.lessonId
                        ? `/employee/lessons/${r.lessonId}`
                        : `/employee/courses/${r.courseId}`
                  }
                  className="surface surface-interactive block p-4"
                >
                  <p className="text-sm font-semibold">{r.reason}</p>
                  <p className="faint mt-2 text-xs">
                    اولویت {toPersianDigits(r.priority)} · حدود{" "}
                    {toPersianDigits(r.estimatedMinutes)} دقیقه
                  </p>
                </Link>
              ))
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
