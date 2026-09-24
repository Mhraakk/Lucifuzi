"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { Badge } from "@/components/ui/Feedback";
import { formatMinutes } from "@/lib/format";
import { useAppState } from "@/lib/hooks";
import { completeLesson, saveLessonProgress } from "@/lib/store";
import { enrichLesson } from "@/lib/view";

export default function LessonPage() {
  const { id } = useParams<{ id: string }>();
  const state = useAppState();
  const router = useRouter();
  const raw = state.lessons.find((l) => l.id === id);
  if (!raw) {
    return (
      <AppShell title="درس" backHref="/employee/learn">
        <p className="muted">درس یافت نشد.</p>
      </AppShell>
    );
  }
  const lesson = enrichLesson(state, raw);
  const course = state.courses.find((c) => c.id === lesson.courseId);

  return (
    <AppShell
      title={lesson.title}
      backHref={`/employee/courses/${lesson.courseId}`}
    >
      <article className="mx-auto max-w-app space-y-5 animate-in">
        <header>
          <p className="text-xs faint mb-1">{course?.title}</p>
          <h1 className="page-title !text-xl mb-2">{lesson.title}</h1>
          <div className="flex flex-wrap gap-2">
            <Badge>{formatMinutes(lesson.estimatedMinutes)}</Badge>
            <Badge tone="accent">نسخه ۱</Badge>
          </div>
        </header>

        <section className="surface p-5">
          <p className="text-sm leading-8 whitespace-pre-wrap">
            {lesson.content.body}
          </p>
          {lesson.content.steps?.length ? (
            <ol className="mt-5 space-y-3">
              {lesson.content.steps.map((step, i) => (
                <li key={step} className="flex gap-3 text-sm leading-7">
                  <span
                    className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                    style={{
                      background: "var(--accent-soft)",
                      color: "var(--accent-deep)",
                    }}
                  >
                    {i + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          ) : null}
          {lesson.content.tips?.length ? (
            <div
              className="mt-5 rounded-xl p-4"
              style={{ background: "var(--bg-soft)" }}
            >
              <p
                className="text-xs font-bold mb-2"
                style={{ color: "var(--info)" }}
              >
                نکته
              </p>
              {lesson.content.tips.map((tip) => (
                <p key={tip} className="text-sm leading-7 muted">
                  {tip}
                </p>
              ))}
            </div>
          ) : null}
          {lesson.content.warnings?.length ? (
            <div
              className="mt-4 rounded-xl p-4"
              style={{ background: "rgba(143,61,61,0.08)" }}
            >
              <p
                className="text-xs font-bold mb-2"
                style={{ color: "var(--danger)" }}
              >
                هشدار
              </p>
              {lesson.content.warnings.map((w) => (
                <p key={w} className="text-sm leading-7">
                  {w}
                </p>
              ))}
            </div>
          ) : null}
        </section>

        <div className="flex flex-col gap-3">
          {lesson.quizQuestionIds.length > 0 ? (
            <Link
              href={`/employee/quiz?lesson=${lesson.id}`}
              className="btn btn-secondary w-full"
            >
              آزمونک این درس
            </Link>
          ) : null}
          <button
            type="button"
            className="btn btn-primary w-full"
            onClick={() => {
              saveLessonProgress(lesson.id, 100);
              completeLesson(lesson.id);
              router.push(`/employee/courses/${lesson.courseId}`);
            }}
          >
            علامت به‌عنوان تکمیل‌شده
          </button>
        </div>
      </article>
    </AppShell>
  );
}
