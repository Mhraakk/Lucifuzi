"use client";

import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { Badge } from "@/components/ui/Feedback";
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
        <section>
          <h1 className="page-title mb-2">تمرین عملی</h1>
          <p className="muted text-sm leading-7">
            شبیه‌سازی فروش، محاسبه قیمت و سناریوهای ریسک — برای کار واقعی شعبه.
          </p>
        </section>

        <Link href="/employee/quiz?calc=1" className="surface block p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="font-bold">شبیه‌ساز محاسبه قیمت</p>
            <Badge tone="accent">محاسبات</Badge>
          </div>
          <p className="muted text-sm leading-7">
            وزن، عیار، اجرت و سود را محاسبه کنید و با پاسخ صحیح مقایسه کنید.
          </p>
        </Link>

        <section>
          <h2 className="section-title mb-3">سناریوها</h2>
          <div className="space-y-3">
            {state.scenarios.map((sc) => (
              <Link
                key={sc.id}
                href={`/employee/scenario/${sc.id}`}
                className="surface block p-4"
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <p className="font-bold text-sm">{sc.title}</p>
                  <Badge>{sc.category}</Badge>
                </div>
                <p className="muted text-sm leading-7 line-clamp-2">{sc.intro}</p>
              </Link>
            ))}
          </div>
        </section>

        <Link
          href={`/employee/scenario/${daily?.scenarioId}`}
          className="btn btn-primary w-full"
        >
          سناریوی امروز
        </Link>

        <section>
          <h2 className="section-title mb-3">پیشنهاد بر اساس ضعف</h2>
          <div className="space-y-2">
            {recs.map((r) => (
              <Link
                key={r.id}
                href={
                  r.scenarioId
                    ? `/employee/scenario/${r.scenarioId}`
                    : r.lessonId
                      ? `/employee/lessons/${r.lessonId}`
                      : `/employee/courses/${r.courseId}`
                }
                className="surface block p-4"
              >
                <p className="font-semibold text-sm">{r.reason}</p>
                <p className="faint text-xs mt-2">
                  اولویت {r.priority} · حدود {r.estimatedMinutes} دقیقه
                </p>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
