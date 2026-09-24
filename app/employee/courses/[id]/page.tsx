"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { Badge, ProgressRing } from "@/components/ui/Feedback";
import { formatMinutes, toPersianDigits } from "@/lib/format";
import { useAppState, useCurrentUser } from "@/lib/hooks";
import { courseProgressPercent } from "@/lib/store";
import { getQuestions } from "@/lib/view";

export default function CourseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const state = useAppState();
  const user = useCurrentUser();
  const course = state.courses.find((c) => c.id === id);
  if (!course) {
    return (
      <AppShell title="دوره" backHref="/employee/learn">
        <p className="muted">دوره یافت نشد.</p>
      </AppShell>
    );
  }
  const modules = state.courseModules
    .filter((m) => m.courseId === course.id)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const progress = courseProgressPercent(state, user.id, course.id);
  const examQs = getQuestions(state)
    .filter((q) => q.courseId === course.id)
    .slice(0, 4);

  return (
    <AppShell title={course.title} backHref="/employee/learn">
      <div className="mx-auto max-w-app space-y-5">
        <section className="surface overflow-hidden">
          <div className="h-2" style={{ background: course.coverAccent }} />
          <div className="p-5 flex items-start justify-between gap-4">
            <div>
              <p className="text-xs faint mb-1">{course.category}</p>
              <h1 className="page-title !text-xl mb-2">{course.title}</h1>
              <p className="muted text-sm leading-7">{course.description}</p>
              <p className="faint text-xs mt-3">
                {formatMinutes(course.estimatedMinutes)} · نسخه ۱
              </p>
            </div>
            <ProgressRing value={progress} />
          </div>
        </section>

        {modules.map((m) => {
          const lessonIds = state.lessons
            .filter((l) => l.moduleId === m.id)
            .sort((a, b) => a.sortOrder - b.sortOrder);
          return (
            <section key={m.id}>
              <h2 className="section-title mb-3">{m.title}</h2>
              <div className="space-y-2">
                {lessonIds.map((lesson) => {
                  const lp = state.lessonProgress.find(
                    (p) => p.userId === user.id && p.lessonId === lesson.id
                  );
                  return (
                    <Link
                      key={lesson.id}
                      href={`/employee/lessons/${lesson.id}`}
                      className="surface flex items-center justify-between gap-3 p-4"
                    >
                      <div>
                        <p className="font-semibold text-sm">{lesson.title}</p>
                        <p className="muted text-xs mt-1">{lesson.summary}</p>
                      </div>
                      <Badge
                        tone={
                          lp?.status === "completed"
                            ? "success"
                            : lp?.status === "in_progress"
                              ? "accent"
                              : "neutral"
                        }
                      >
                        {lp?.status === "completed"
                          ? "تمام"
                          : lp?.status === "in_progress"
                            ? `${toPersianDigits(lp.percent)}٪`
                            : formatMinutes(lesson.estimatedMinutes)}
                      </Badge>
                    </Link>
                  );
                })}
              </div>
            </section>
          );
        })}

        {examQs.length > 0 ? (
          <Link
            href={`/employee/exam/${course.id}`}
            className="btn btn-primary w-full"
          >
            آزمون دوره (دانش — نه مجوز کار)
          </Link>
        ) : null}
      </div>
    </AppShell>
  );
}
