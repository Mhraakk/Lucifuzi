"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { Badge } from "@/components/ui/Feedback";
import { calculateQuotation } from "@/lib/calculation";
import { formatCurrency, formatNumber, toPersianDigits } from "@/lib/format";
import { useAppState } from "@/lib/hooks";
import { getTodayDaily, submitQuiz } from "@/lib/store";
import { enrichLesson, getQuestions } from "@/lib/view";

export default function QuizClient() {
  const state = useAppState();
  const params = useSearchParams();
  const router = useRouter();
  const lessonId = params.get("lesson");
  const daily = params.get("daily");
  const calc = params.get("calc");

  const questions = useMemo(() => {
    const all = getQuestions(state);
    if (calc) return all.filter((q) => q.type === "calculation");
    if (daily) {
      const d = getTodayDaily(state);
      const q = all.find((x) => x.id === d?.questionId);
      return q ? [q] : all.slice(0, 1);
    }
    if (lessonId) {
      const lesson = state.lessons.find((l) => l.id === lessonId);
      if (!lesson) return [];
      const enriched = enrichLesson(state, lesson);
      return all.filter((q) => enriched.quizQuestionIds.includes(q.id));
    }
    return all.slice(0, 3);
  }, [state, lessonId, daily, calc]);

  const [answers, setAnswers] = useState<Record<string, string | number>>({});
  const [result, setResult] = useState<{
    score: number;
    passed: boolean;
    breakdowns: Record<string, string[]>;
  } | null>(null);

  function onSubmit() {
    const breakdowns: Record<string, string[]> = {};
    for (const q of questions) {
      if (q.type === "calculation" && q.calculationAnswer != null) {
        const payload = {
          weightGrams: 5,
          karat: 18,
          pricePerGram: state.pricingFormulaConfig.goldPricePerGram18k,
          makingChargePerGram: Math.round(
            (state.pricingFormulaConfig.goldPricePerGram18k *
              state.pricingFormulaConfig.makingFeePercent) /
              100
          ),
          profitPercent: state.pricingFormulaConfig.profitPercent,
        };
        const b = calculateQuotation(payload);
        breakdowns[q.id] = b.steps;
      }
    }
    const attempt = submitQuiz({
      questionIds: questions.map((q) => q.id),
      answers,
      context: daily ? "daily" : "lesson_quiz",
      lessonId: lessonId ?? undefined,
      courseId: lessonId
        ? state.lessons.find((l) => l.id === lessonId)?.courseId
        : questions[0]?.courseId,
    });
    setResult({
      score: attempt.score,
      passed: attempt.passed,
      breakdowns,
    });
  }

  return (
    <AppShell title="آزمونک" backHref="/employee/practice">
      <div className="mx-auto max-w-app space-y-5">
        <header>
          <h1 className="page-title !text-xl mb-2">
            {calc ? "شبیه‌ساز محاسبه" : daily ? "سؤال امروز" : "آزمونک"}
          </h1>
          <p className="muted text-sm leading-7">
            نتیجه فقط سطح دانش را به‌روز می‌کند و مجوز کار مستقل ایجاد نمی‌کند.
          </p>
        </header>

        {questions.map((q, idx) => (
          <section key={q.id} className="surface p-4">
            <div className="mb-3 flex items-center gap-2">
              <Badge>سؤال {toPersianDigits(idx + 1)}</Badge>
              <Badge tone="accent">{q.difficulty}</Badge>
            </div>
            <p className="font-semibold text-sm leading-7 mb-4">{q.prompt}</p>

            {q.type === "calculation" ? (
              <div className="space-y-3">
                <div
                  className="rounded-xl p-3 text-xs leading-6"
                  style={{ background: "var(--bg-soft)" }}
                >
                  وزن نمونه: {formatNumber(5, { decimals: 0 })} گرم · عیار ۱۸ ·
                  قیمت پایه:{" "}
                  {formatCurrency(
                    state.pricingFormulaConfig.goldPricePerGram18k
                  )}
                </div>
                <label className="label">پاسخ شما (ریال/تومان طبق عرف شعبه)</label>
                <input
                  className="field"
                  inputMode="numeric"
                  disabled={!!result}
                  value={answers[q.id] ?? ""}
                  onChange={(e) =>
                    setAnswers((a) => ({
                      ...a,
                      [q.id]: Number(e.target.value.replace(/,/g, "")),
                    }))
                  }
                />
                {result?.breakdowns[q.id] ? (
                  <div className="mt-3 space-y-1 text-xs muted">
                    {result.breakdowns[q.id]!.map((s) => (
                      <p key={s}>{s}</p>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="space-y-2">
                {q.options?.map((opt) => (
                  <label
                    key={opt.id}
                    className="flex min-h-[48px] cursor-pointer items-center gap-3 rounded-xl border px-3 py-2"
                    style={{
                      borderColor:
                        answers[q.id] === opt.id
                          ? "var(--accent)"
                          : "var(--line)",
                      background:
                        answers[q.id] === opt.id
                          ? "var(--accent-soft)"
                          : "transparent",
                    }}
                  >
                    <input
                      type="radio"
                      name={q.id}
                      className="sr-only"
                      disabled={!!result}
                      checked={answers[q.id] === opt.id}
                      onChange={() =>
                        setAnswers((a) => ({ ...a, [q.id]: opt.id }))
                      }
                    />
                    <span className="text-sm leading-6">{opt.text}</span>
                  </label>
                ))}
              </div>
            )}
            {result ? (
              <p className="mt-3 text-xs muted leading-6">{q.explanation}</p>
            ) : null}
          </section>
        ))}

        {result ? (
          <div className="surface p-5 text-center">
            <p className="page-title !text-2xl mb-2">
              {toPersianDigits(result.score)}٪
            </p>
            <p className="muted text-sm mb-4">
              {result.passed ? "قبول — دانش به‌روز شد" : "نیاز به تمرین بیشتر"}
            </p>
            <p className="text-xs faint mb-4">
              این نتیجه مجوز انجام مستقل کار نیست.
            </p>
            <button
              type="button"
              className="btn btn-primary w-full"
              onClick={() => router.push("/employee/practice")}
            >
              بازگشت به تمرین
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="btn btn-primary w-full"
            onClick={onSubmit}
          >
            ثبت پاسخ
          </button>
        )}
      </div>
    </AppShell>
  );
}
