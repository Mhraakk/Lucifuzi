"use client";

import { AppShell } from "@/components/layout/AppShell";
import { CourseCard } from "@/components/training/Cards";
import { useAppState, useCurrentUser, useEmployeeProfile } from "@/lib/hooks";
import { courseProgressPercent } from "@/lib/store";

export default function LearnPage() {
  const state = useAppState();
  const user = useCurrentUser();
  const profile = useEmployeeProfile();
  const path = state.learningPaths.find((p) => p.id === profile?.learningPathId);
  const pathCourses = new Set(path?.courseIds ?? []);

  const recommended = state.courses.filter((c) => pathCourses.has(c.id));
  const others = state.courses.filter((c) => !pathCourses.has(c.id));

  return (
    <AppShell title="آموزش">
      <div className="mx-auto max-w-app space-y-6">
        <section>
          <h1 className="page-title mb-2">آکادمی عملیاتی</h1>
          <p className="muted text-sm leading-7">
            مسیر شما بر اساس نقش «{path?.title ?? "عمومی"}» تنظیم شده است.
          </p>
        </section>

        <section>
          <h2 className="section-title mb-3">پیشنهادی برای نقش شما</h2>
          <div className="grid gap-3">
            {recommended.map((c) => (
              <CourseCard
                key={c.id}
                id={c.id}
                title={c.title}
                description={c.description}
                minutes={c.estimatedMinutes}
                progress={courseProgressPercent(state, user.id, c.id)}
                accent={c.coverAccent}
              />
            ))}
          </div>
        </section>

        <section>
          <h2 className="section-title mb-3">سایر دوره‌ها</h2>
          <div className="grid gap-3">
            {others.map((c) => (
              <CourseCard
                key={c.id}
                id={c.id}
                title={c.title}
                description={c.description}
                minutes={c.estimatedMinutes}
                progress={courseProgressPercent(state, user.id, c.id)}
                accent={c.coverAccent}
              />
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
