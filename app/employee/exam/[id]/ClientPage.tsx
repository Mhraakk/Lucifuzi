"use client";

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { toPersianDigits } from "@/lib/format";
import { useAppState } from "@/lib/hooks";
import { submitExam } from "@/lib/store";
import { getQuestions } from "@/lib/view";

export default function ExamPage() {
  const { id } = useParams<{ id: string }>();
  const state = useAppState();
  const router = useRouter();
  const course = state.courses.find((c) => c.id === id);
  const questions = useMemo(
    () => getQuestions(state).filter((q) => q.courseId === id).slice(0, 5),
    [state, id]
  );
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [done, setDone] = useState<{ score: number; passed: boolean } | null>(
    null
  );

  if (!course) {
    return (
      <AppShell title="آزمون" backHref="/employee/learn">
        <p className="muted">دوره یافت نشد.</p>
      </AppShell>
    );
  }

  const passing =
    state.organization.settings.passingScore ??
    state.organization.settings.defaultPassingScore;

  return (
    <AppShell title={`آزمون ${course.title}`} backHref={`/employee/courses/${id}`}>
      <div className="mx-auto max-w-app space-y-5">
        <p className="muted text-sm leading-7">
          حد نصاب: {toPersianDigits(passing)}٪ · در صورت قبولی با پاسخ‌های
          درجه‌بندی‌شده، گواهی دانش از همین آزمون صادر می‌شود؛ مجوز کار مستقل فقط
          با ارزیابی عملی.
        </p>
        {questions.map((q, i) => (
          <section key={q.id} className="surface p-4">
            <p className="font-semibold text-sm mb-3">
              {toPersianDigits(i + 1)}. {q.prompt}
            </p>
            <div className="space-y-2">
              {q.options?.map((opt) => (
                <label
                  key={opt.id}
                  className="flex min-h-[44px] items-center gap-2 rounded-xl border px-3 py-2 text-sm"
                  style={{
                    borderColor:
                      answers[q.id] === opt.id ? "var(--accent)" : "var(--line)",
                  }}
                >
                  <input
                    type="radio"
                    name={q.id}
                    disabled={!!done}
                    checked={answers[q.id] === opt.id}
                    onChange={() =>
                      setAnswers((a) => ({ ...a, [q.id]: opt.id }))
                    }
                  />
                  {opt.text}
                </label>
              ))}
            </div>
          </section>
        ))}
        {done ? (
          <div className="surface p-5 text-center">
            <p className="page-title !text-2xl">{toPersianDigits(done.score)}٪</p>
            <p className="muted text-sm mt-2 mb-4">
              {done.passed
                ? "قبول شدید"
                : "مردود — آموزش جبرانی ممکن است اختصاص یابد"}
            </p>
            <button
              type="button"
              className="btn btn-primary w-full"
              onClick={() => router.push(`/employee/courses/${id}`)}
            >
              بازگشت
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="btn btn-primary w-full"
            onClick={() => {
              const answered = Object.keys(answers).length;
              if (answered < questions.length) {
                window.alert(
                  "همه سؤال‌ها را پاسخ دهید — نمره بدون پاسخ واقعی ثبت نمی‌شود."
                );
                return;
              }
              const res = submitExam({
                courseId: id,
                questionIds: questions.map((q) => q.id),
                answers,
                examType: id === "course_06" ? "security" : "course",
              });
              setDone(res);
            }}
          >
            ارسال آزمون
          </button>
        )}
      </div>
    </AppShell>
  );
}
