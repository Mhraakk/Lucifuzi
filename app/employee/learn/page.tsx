"use client";

import { AppShell } from "@/components/layout/AppShell";
import {
  CareerLadder,
  buildLadderSteps,
} from "@/components/training/CareerLadder";
import { CourseCard } from "@/components/training/Cards";
import { TopicVisual } from "@/components/training/TopicVisual";
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

  const ladderData = recommended.map((c) => ({
    id: c.id,
    title: c.title,
    description: c.description,
    progress: courseProgressPercent(state, user.id, c.id),
  }));

  const overall = ladderData.length
    ? Math.round(
        ladderData.reduce((s, c) => s + c.progress, 0) / ladderData.length
      )
    : 0;

  return (
    <AppShell title="آموزش">
      <div className="mx-auto max-w-app space-y-6">
        <section className="animate-in">
          <h1 className="page-title mb-2">آکادمی عملیاتی</h1>
          <p className="muted text-sm leading-7">
            مسیر شما بر اساس نقش «{path?.title ?? "عمومی"}» — استاندارد آموزش
            گالری‌های معتبر طلا، پله‌به‌پله تا کار مستقل.
          </p>
        </section>

        <TopicVisual topic="product" className="animate-in" />

        {ladderData.length > 0 ? (
          <CareerLadder
            eyebrow="نردبان مسیر"
            title={path?.title ?? "مسیر یادگیری"}
            overall={overall}
            steps={buildLadderSteps(ladderData)}
            goalLabel="از دادهٔ دوره‌های نقش شما — هر پله تا کار مستقل فروشگاه"
          />
        ) : null}

        <section>
          <h2 className="section-title mb-3">جزئیات دوره‌ها</h2>
          <div className="stagger grid gap-3">
            {recommended.map((c) => (
              <CourseCard
                key={c.id}
                id={c.id}
                title={c.title}
                description={c.description}
                minutes={c.estimatedMinutes}
                progress={courseProgressPercent(state, user.id, c.id)}
                accent={c.coverAccent}
                coverImage={c.coverImage}
              />
            ))}
          </div>
        </section>

        <section>
          <h2 className="section-title mb-3">سایر دوره‌ها</h2>
          <div className="stagger grid gap-3">
            {others.map((c) => (
              <CourseCard
                key={c.id}
                id={c.id}
                title={c.title}
                description={c.description}
                minutes={c.estimatedMinutes}
                progress={courseProgressPercent(state, user.id, c.id)}
                accent={c.coverAccent}
                coverImage={c.coverImage}
              />
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
