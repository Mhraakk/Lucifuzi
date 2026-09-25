"use client";

import { AppShell } from "@/components/layout/AppShell";
import { AcademyShowcase } from "@/components/training/AcademyShowcase";
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
      <div className="mx-auto max-w-app pb-4 jx-page">
        <AcademyShowcase
          pathTitle={path?.title ?? "بسته شایستگی فروش"}
          pathDescription={
            path?.description ??
            "آموزش عملیاتی گالری با استاندارد آمریکا، سوئیس و اروپا."
          }
          recommended={recommended}
          others={others}
          progressOf={(id) => courseProgressPercent(state, user.id, id)}
        />
      </div>
    </AppShell>
  );
}
