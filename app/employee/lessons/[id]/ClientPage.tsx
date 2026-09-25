"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { FormulaStudio } from "@/components/training/FormulaStudio";
import { CourseCover } from "@/components/training/TopicVisual";
import { Pressable } from "@/components/ui/Pressable";
import { Badge } from "@/components/ui/Feedback";
import { formatMinutes, toPersianDigits } from "@/lib/format";
import { useAppState } from "@/lib/hooks";
import { completeLesson, saveLessonProgress } from "@/lib/store";
import type { LessonContentBlock } from "@/lib/types";

function BlockView({ block }: { block: LessonContentBlock }) {
  if (block.type === "checklist") {
    return (
      <div className="lesson-block">
        {block.title ? <p className="lesson-block__title">{block.title}</p> : null}
        {block.body ? (
          <p className="text-sm leading-8 mb-3">{block.body}</p>
        ) : null}
        <ol className="space-y-3">
          {(block.items ?? []).map((step, i) => (
            <li key={step} className="flex gap-3 text-sm leading-7">
              <span
                className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                style={{
                  background: "var(--accent-soft)",
                  color: "var(--accent-deep)",
                }}
              >
                {toPersianDigits(i + 1)}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </div>
    );
  }

  if (block.type === "warning") {
    return (
      <div className="lesson-block lesson-block--warning">
        {block.title ? (
          <p className="lesson-block__title" style={{ color: "var(--danger)" }}>
            {block.title}
          </p>
        ) : null}
        <p className="text-sm leading-8">{block.body}</p>
      </div>
    );
  }

  if (block.type === "example") {
    return (
      <div className="lesson-block lesson-block--example">
        {block.title ? (
          <p className="lesson-block__title" style={{ color: "var(--info)" }}>
            {block.title}
          </p>
        ) : null}
        <p className="text-sm leading-8">{block.body}</p>
      </div>
    );
  }

  if (block.type === "formula") {
    return (
      <div className="lesson-block lesson-block--formula">
        {block.title ? <p className="lesson-block__title">{block.title}</p> : null}
        <p className="text-sm leading-8 font-semibold mb-3">{block.body}</p>
        <FormulaStudio compact />
      </div>
    );
  }

  return (
    <div className="lesson-block">
      {block.title ? <p className="lesson-block__title">{block.title}</p> : null}
      <p className="text-sm leading-8 whitespace-pre-wrap">{block.body}</p>
    </div>
  );
}

export default function LessonPage() {
  const { id } = useParams<{ id: string }>();
  const state = useAppState();
  const router = useRouter();
  const lesson = state.lessons.find((l) => l.id === id);
  if (!lesson) {
    return (
      <AppShell title="درس" backHref="/employee/learn">
        <p className="muted">درس یافت نشد.</p>
      </AppShell>
    );
  }
  const course = state.courses.find((c) => c.id === lesson.courseId);
  const content = state.lessonContents.find((c) => c.lessonId === lesson.id);
  const blocks = content?.blocks ?? [];
  const quizIds = state.quizQuestions
    .filter((q) => q.lessonId === lesson.id)
    .map((q) => q.id);
  const hasFormula = blocks.some((b) => b.type === "formula");

  return (
    <AppShell
      title={lesson.title}
      backHref={`/employee/courses/${lesson.courseId}`}
    >
      <article className="mx-auto max-w-app space-y-5 animate-in">
        <CourseCover
          courseId={lesson.courseId}
          size="inline"
          showCaption={false}
        />

        <header className="surface p-4">
          <p className="text-xs faint mb-1">{course?.title}</p>
          <h1 className="page-title !text-xl mb-2">{lesson.title}</h1>
          <p className="text-sm leading-7 muted mb-3">{lesson.summary}</p>
          <div className="flex flex-wrap gap-2">
            <Badge>{formatMinutes(lesson.estimatedMinutes)}</Badge>
            <Badge tone="accent">محتوای عملیاتی</Badge>
          </div>
        </header>

        {blocks.length > 0 ? (
          <section className="surface p-5">
            {blocks.map((block) => (
              <BlockView key={block.id} block={block} />
            ))}
          </section>
        ) : (
          <section className="surface p-5">
            <p className="text-sm leading-8">{lesson.summary}</p>
          </section>
        )}

        {!hasFormula && lesson.courseId === "course_03" ? (
          <FormulaStudio />
        ) : null}

        <div className="flex flex-col gap-3">
          {quizIds.length > 0 ? (
            <Link
              href={`/employee/quiz?lesson=${lesson.id}`}
              className="btn btn-secondary tap-react w-full"
            >
              آزمونک این درس
            </Link>
          ) : null}
          {lesson.courseId === "course_03" ? (
            <Link
              href="/employee/formula"
              className="btn btn-secondary tap-react w-full"
            >
              کارگاه فرمول زنده
            </Link>
          ) : null}
          <Pressable
            className="btn btn-primary w-full"
            feedback={{ label: "درس تکمیل شد", tone: "ok" }}
            onPress={() => {
              saveLessonProgress(lesson.id, 100);
              completeLesson(lesson.id);
              window.setTimeout(() => {
                router.push(`/employee/courses/${lesson.courseId}`);
              }, 500);
            }}
          >
            علامت به‌عنوان تکمیل‌شده
          </Pressable>
        </div>
      </article>
    </AppShell>
  );
}
