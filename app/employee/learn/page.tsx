"use client";

import { AppShell } from "@/components/layout/AppShell";
import {
  AtelierMuseHero,
  AtelierWall,
  buildWallPins,
} from "@/components/training/AtelierWall";
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

  const wallData = recommended.map((c) => ({
    id: c.id,
    title: c.title,
    description: c.description,
    progress: courseProgressPercent(state, user.id, c.id),
  }));

  const overall = wallData.length
    ? Math.round(
        wallData.reduce((s, c) => s + c.progress, 0) / wallData.length
      )
    : 0;

  return (
    <AppShell title="آموزش">
      <div className="mx-auto max-w-app space-y-6">
        <section className="animate-in">
          <h1 className="page-title mb-2">آکادمی گالری</h1>
          <p className="muted text-sm leading-7">
            نقش «{path?.title ?? "عمومی"}» — آموزش روی دیوار ویترین، مثل ارائه
            محصول در بوتیک‌های معتبر جواهر.
          </p>
        </section>

        <AtelierMuseHero
          title="ارائه مثل برندهای لوکس"
          subtitle="هر درس یک تابلوی محصول است: روایت، نمایش، و تمرین عملی — بدون نردبان مصنوعی."
        />

        {wallData.length > 0 ? (
          <AtelierWall
            eyebrow="دیوار مسیر نقش شما"
            title={path?.title ?? "مسیر یادگیری"}
            overall={overall}
            pins={buildWallPins(wallData)}
            goalLabel="هر قطعه روی دیوار تا کار مستقل روی ویترین واقعی"
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
