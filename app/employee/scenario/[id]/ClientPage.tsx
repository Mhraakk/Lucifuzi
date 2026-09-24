"use client";

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { TopicVisual } from "@/components/training/TopicVisual";
import { Badge } from "@/components/ui/Feedback";
import { toPersianDigits } from "@/lib/format";
import { useAppState } from "@/lib/hooks";
import { submitScenario } from "@/lib/store";
import { enrichScenario } from "@/lib/view";
import type { IllustrationKey } from "@/lib/illustrations";

export default function ScenarioPage() {
  const { id } = useParams<{ id: string }>();
  const state = useAppState();
  const router = useRouter();
  const raw = state.scenarios.find((s) => s.id === id);
  const scenario = raw ? enrichScenario(state, raw) : null;

  const [stepId, setStepId] = useState(scenario?.startStepId ?? "");
  const [path, setPath] = useState<{ stepId: string; choiceId: string }[]>([]);
  const [score, setScore] = useState(0);
  const [tagScores, setTagScores] = useState<Record<string, number>>({});
  const [finished, setFinished] = useState(false);

  const step = useMemo(
    () => scenario?.steps.find((s) => s.id === stepId),
    [scenario, stepId]
  );

  const maxScore = useMemo(() => {
    if (!scenario) return 0;
    return scenario.steps.reduce((sum, s) => {
      const best = Math.max(0, ...s.choices.map((c) => c.scoreDelta), 0);
      return sum + best;
    }, 0);
  }, [scenario]);

  if (!scenario) {
    return (
      <AppShell title="سناریو" backHref="/employee/practice">
        <p className="muted">سناریو یافت نشد.</p>
      </AppShell>
    );
  }

  function choose(choiceId: string) {
    if (!step || !scenario) return;
    const choice = step.choices.find((c) => c.id === choiceId);
    if (!choice) return;
    const nextPath = [...path, { stepId: step.id, choiceId }];
    const nextScore = score + choice.scoreDelta;
    const nextTags = { ...tagScores };
    for (const t of choice.tags) {
      nextTags[t] = (nextTags[t] ?? 0) + choice.scoreDelta;
    }
    setPath(nextPath);
    setScore(nextScore);
    setTagScores(nextTags);

    const next = choice.nextStepId
      ? scenario.steps.find((s) => s.id === choice.nextStepId)
      : undefined;

    if (!next || next.isTerminal || !choice.nextStepId) {
      if (next) setStepId(next.id);
      const strong = Object.entries(nextTags)
        .filter(([, v]) => v > 0)
        .map(([k]) => k);
      const weak = Object.entries(nextTags)
        .filter(([, v]) => v <= 0)
        .map(([k]) => k);
      submitScenario({
        scenarioId: scenario.id,
        path: nextPath,
        score: Math.max(0, nextScore),
        maxScore: maxScore || 1,
        strongTags: strong,
        weakTags: weak,
      });
      setFinished(true);
      return;
    }
    setStepId(choice.nextStepId);
  }

  const strong = Object.entries(tagScores)
    .filter(([, v]) => v > 0)
    .map(([k]) => k);
  const weak = Object.entries(tagScores)
    .filter(([, v]) => v <= 0)
    .map(([k]) => k);

  return (
    <AppShell title={scenario.title} backHref="/employee/practice">
      <div className="mx-auto max-w-app space-y-5">
        <TopicVisual
          topic={
            (id.includes("fraud")
              ? "fraud"
              : "sales") as IllustrationKey
          }
        />
        <section className="surface p-4">
          <Badge tone="accent">{scenario.category}</Badge>
          <p className="mt-3 text-sm leading-8">{scenario.intro}</p>
        </section>

        {step ? (
          <section className="surface p-4 animate-in">
            <p className="text-xs faint mb-2">موقعیت</p>
            <p className="font-semibold text-sm leading-7 mb-4 whitespace-pre-wrap">
              {step.situation}
            </p>
            {!finished && !step.isTerminal ? (
              <div className="space-y-2">
                {step.choices.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="w-full rounded-xl border p-4 text-right text-sm leading-7"
                    style={{
                      borderColor: "var(--line)",
                      background: "var(--bg)",
                    }}
                    onClick={() => choose(c.id)}
                  >
                    {c.text}
                  </button>
                ))}
              </div>
            ) : null}
            {finished ? (
              <div className="mt-2 space-y-2">
                {path.map((p) => {
                  const st = scenario.steps.find((s) => s.id === p.stepId);
                  const ch = st?.choices.find((c) => c.id === p.choiceId);
                  return (
                    <div
                      key={`${p.stepId}-${p.choiceId}`}
                      className="rounded-xl p-3 text-xs leading-6"
                      style={{ background: "var(--bg-soft)" }}
                    >
                      <p className="font-semibold mb-1">{ch?.text}</p>
                      <p className="muted">{ch?.feedback}</p>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </section>
        ) : null}

        {finished ? (
          <section className="surface p-5">
            <p className="page-title !text-xl mb-2">
              امتیاز: {toPersianDigits(Math.max(0, score))} /{" "}
              {toPersianDigits(maxScore || 1)}
            </p>
            <div className="mb-3 flex flex-wrap gap-2">
              {strong.map((t) => (
                <Badge key={t} tone="success">
                  {t}
                </Badge>
              ))}
              {weak.map((t) => (
                <Badge key={`w-${t}`} tone="warning">
                  {t}
                </Badge>
              ))}
            </div>
            {scenario.relatedLessonIds[0] ? (
              <button
                type="button"
                className="btn btn-primary w-full mb-2"
                onClick={() =>
                  router.push(
                    `/employee/lessons/${scenario.relatedLessonIds[0]}`
                  )
                }
              >
                درس پیشنهادی مرتبط
              </button>
            ) : null}
            <button
              type="button"
              className="btn btn-secondary w-full"
              onClick={() => router.push("/employee/practice")}
            >
              بازگشت
            </button>
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}
