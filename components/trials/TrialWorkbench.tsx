"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Pressable } from "@/components/ui/Pressable";
import { MotionEnter } from "@/components/motion/Motion";
import { Badge } from "@/components/ui/Feedback";
import { InstrumentPanel } from "@/components/trials/InstrumentPanel";
import { toPersianDigits } from "@/lib/format";
import { completeRoleTrial } from "@/lib/store";
import {
  envById,
  toolsForEnv,
  trialsForEnv,
  type RoleTrial,
  type TrialEnvId,
  type TrialStep,
} from "@/lib/trials/catalog";
import type { InstrumentReading } from "@/lib/trials/instruments";
import type { TrialAttempt } from "@/lib/types";

const TrialScene3D = dynamic(
  () =>
    import("@/components/trials/TrialScene3D").then((m) => m.TrialScene3D),
  {
    ssr: false,
    loading: () => (
      <div className="trial-scene3d trial-scene3d--loading">
        <p>آماده‌سازی محیط ۳D…</p>
      </div>
    ),
  }
);

function StepOptions({
  step,
  selected,
  onToggle,
  locked,
}: {
  step: TrialStep;
  selected: string[];
  onToggle: (id: string) => void;
  locked: boolean;
}) {
  const multi = step.correctIds.length > 1;
  return (
    <div className="trial-options">
      {step.options.map((opt) => {
        const on = selected.includes(opt.id);
        return (
          <Pressable
            key={opt.id}
            className={`trial-option ${on ? "is-on" : ""}`}
            disabled={locked}
            feedback={{ label: opt.labelFa, tone: on ? "ok" : "info" }}
            onPress={() => onToggle(opt.id)}
          >
            <span className="trial-option__mark" aria-hidden>
              {multi ? (on ? "☑" : "☐") : on ? "●" : "○"}
            </span>
            <span>{opt.labelFa}</span>
          </Pressable>
        );
      })}
    </div>
  );
}

export function TrialWorkbench({ envId }: { envId: TrialEnvId }) {
  const env = envById(envId);
  const tools = useMemo(() => toolsForEnv(envId), [envId]);
  const trials = useMemo(() => trialsForEnv(envId), [envId]);
  const [trialId, setTrialId] = useState(trials[0]?.id ?? "");
  const trial: RoleTrial | undefined = trials.find((t) => t.id === trialId);

  const [activeTools, setActiveTools] = useState<Set<string>>(new Set());
  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [started, setStarted] = useState(false);
  const [result, setResult] = useState<TrialAttempt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [orbitDeg, setOrbitDeg] = useState(0);
  const [readings, setReadings] = useState<InstrumentReading[]>([]);

  if (!env) {
    return (
      <div className="surface p-4">
        <p className="muted text-sm">محیط آزمایش یافت نشد.</p>
        <Link href="/employee/trials" className="btn btn-secondary mt-3">
          بازگشت به فهرست
        </Link>
      </div>
    );
  }

  const step = trial?.steps[stepIndex];
  const toolReady =
    !step?.requiresToolId || activeTools.has(step.requiresToolId);
  const selected = step ? answers[step.id] ?? [] : [];
  const isLast = trial ? stepIndex >= trial.steps.length - 1 : true;
  const inspectMode = step?.kind === "3d_inspect" || step?.kind === "measure";
  const stepReading = step
    ? [...readings].reverse().find((r) => r.stepId === step.id)
    : undefined;
  const instrumentReady = !step?.instrument || Boolean(stepReading?.ok);

  function toggleTool(id: string) {
    setActiveTools((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAnswer(optionId: string) {
    if (!step || result) return;
    if (step.requiresToolId && !activeTools.has(step.requiresToolId)) {
      setError(
        `ابتدا ابزار «${tools.find((t) => t.id === step.requiresToolId)?.titleFa ?? step.requiresToolId}» را فعال کنید.`
      );
      return;
    }
    if (step.instrument && !stepReading?.ok) {
      setError("ابتدا کنسول ابزار را اجرا کنید تا خوانش قبول ثبت شود.");
      return;
    }
    setError(null);
    setAnswers((prev) => {
      const cur = prev[step.id] ?? [];
      const multi = step.correctIds.length > 1;
      if (multi) {
        const has = cur.includes(optionId);
        return {
          ...prev,
          [step.id]: has
            ? cur.filter((x) => x !== optionId)
            : [...cur, optionId],
        };
      }
      return { ...prev, [step.id]: [optionId] };
    });
  }

  function startTrial() {
    setStarted(true);
    setStepIndex(0);
    setAnswers({});
    setActiveTools(new Set());
    setResult(null);
    setError(null);
    setOrbitDeg(0);
    setReadings([]);
  }

  function goNext() {
    if (!step || !trial) return;
    if (!(answers[step.id]?.length)) {
      setError("یک گزینه را انتخاب کنید.");
      return;
    }
    if (!toolReady) {
      setError("ابزار لازم این گام فعال نیست.");
      return;
    }
    if (!instrumentReady) {
      setError("خوانش ابزار برای این گام ناقص یا رد شده است.");
      return;
    }
    setError(null);
    if (isLast) {
      try {
        const attempt = completeRoleTrial({
          trialId: trial.id,
          answers,
          toolsUsed: Array.from(activeTools),
          instrumentLog: readings,
        });
        setResult(attempt);
      } catch (e) {
        setError(e instanceof Error ? e.message : "خطا در ثبت آزمایش");
      }
      return;
    }
    setStepIndex((i) => i + 1);
  }

  if (result) {
    return (
      <MotionEnter>
        <section className="trial-result surface p-5 space-y-4">
          <p className="atelier-kicker">نتیجه واقعی · شواهد ثبت‌شده</p>
          <h2 className="page-title !text-xl">
            {result.passed ? "قبول — شواهد + خروجی ابزار" : "رد — خوانش/پاسخ ناقص"}
          </h2>
          <p className="muted text-sm leading-7">
            امتیاز {toPersianDigits(result.percent)}٪ از{" "}
            {toPersianDigits(result.maxScore)} ·{" "}
            {toPersianDigits(result.instrumentLog.length)} خوانش ابزار · محیط «
            {env.titleFa}»
          </p>
          <div className="trial-result__banner" data-pass={result.passed}>
            {result.passed ? (
              <p>
                این قبول فقط <strong>شواهد</strong> است. مجوز کار و مسئولیت کف را
                مدیر پس از ارزیابی عملی محول می‌کند — خودکار صادر نمی‌شود.
              </p>
            ) : (
              <p>
                گام‌های از دست‌رفته:{" "}
                {toPersianDigits(result.missedStepIds.length)}. بدون خوانش صحیح
                ابزار، امتیاز کامل داده نمی‌شود.
              </p>
            )}
          </div>
          {result.instrumentLog.length > 0 ? (
            <div className="trial-outputs">
              <p className="section-title">خروجی‌های ثبت‌شده</p>
              <ul className="space-y-2">
                {result.instrumentLog.map((r, i) => (
                  <li key={`${r.at}-${i}`} className="text-xs leading-6">
                    <Badge tone={r.ok ? "success" : "warning"}>
                      {r.kind}
                    </Badge>{" "}
                    {r.detailFa}
                  </li>
                ))}
              </ul>
              <pre className="trial-outputs__json text-xs mt-3 overflow-auto">
                {JSON.stringify(result.outputs, null, 2)}
              </pre>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Badge tone={result.passed ? "success" : "warning"}>
              {result.passed ? "شواهد آماده" : "نیاز به تکرار"}
            </Badge>
            <Badge tone="accent">
              ابزار: {toPersianDigits(result.toolsUsed.length)}
            </Badge>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              className="btn btn-primary"
              onClick={startTrial}
            >
              تکرار آزمایش
            </button>
            <Link href="/employee/floor" className="btn btn-secondary">
              کف مسئولیت‌ها
            </Link>
            <Link href="/employee/trials" className="btn btn-ghost">
              محیط‌های دیگر
            </Link>
          </div>
        </section>
      </MotionEnter>
    );
  }

  return (
    <div className="trial-workbench space-y-4">
      <MotionEnter>
        <header className="trial-env-head surface p-4">
          <p className="atelier-kicker" style={{ color: env.accent }}>
            {env.roomFa}
          </p>
          <h1 className="page-title mb-2">{env.titleFa}</h1>
          <p className="muted text-sm leading-7 mb-3">{env.conditionFa}</p>
          <div className="trial-hazards">
            <span>خطر:</span> {env.hazardFa}
          </div>
          <p className="muted text-xs mt-3 leading-6">
            مسئولیت هدف: {env.responsibilityFa} · حد قبولی{" "}
            {toPersianDigits(env.passScore)}٪ · ابزارها خروجی عددی واقعی می‌دهند
          </p>
        </header>
      </MotionEnter>

      <div className="trial-stage surface overflow-hidden">
        <TrialScene3D
          scene={env.scene3d}
          accent={env.accent}
          inspect={inspectMode && started}
          onOrbitDegrees={setOrbitDeg}
        />
        <p className="trial-stage__hint muted text-xs px-3 py-2">
          محیط ۳D را بکشید تا بچرخد · چرخش انباشته:{" "}
          {toPersianDigits(Math.round(orbitDeg))}°
          {inspectMode ? " · حالت بازرسی" : ""}
        </p>
      </div>

      {!started ? (
        <section className="surface p-4 space-y-3">
          <p className="section-title">انتخاب آزمایش</p>
          <div className="trial-pick">
            {trials.map((t) => (
              <Pressable
                key={t.id}
                className={`trial-pick__item ${trialId === t.id ? "is-on" : ""}`}
                onPress={() => setTrialId(t.id)}
                feedback={{ label: t.titleFa, tone: "info" }}
              >
                <strong>{t.titleFa}</strong>
                <span className="muted text-xs">
                  {toPersianDigits(t.estimatedMinutes)} دقیقه ·{" "}
                  {t.difficulty === "beginner"
                    ? "مبتدی"
                    : t.difficulty === "advanced"
                      ? "پیشرفته"
                      : "متوسط"}
                  {" · "}
                  {toPersianDigits(
                    t.steps.filter((s) => s.instrument).length
                  )}{" "}
                  ابزار اندازه‌گیری
                </span>
                <em className="text-xs leading-6 block mt-1">{t.briefFa}</em>
              </Pressable>
            ))}
          </div>
          <button
            type="button"
            className="btn btn-primary w-full"
            disabled={!trial}
            onClick={startTrial}
          >
            ورود به محیط و شروع آزمایش
          </button>
        </section>
      ) : (
        <>
          <section className="surface p-4 space-y-3">
            <p className="section-title">جعبه‌ابزار محیط</p>
            <p className="muted text-xs leading-6">
              ابزار را فعال کنید؛ اگر گام کنسول اندازه‌گیری دارد، باید خوانش قبول
              ثبت شود.
            </p>
            <div className="trial-tools">
              {tools.map((tool) => {
                const on = activeTools.has(tool.id);
                const needed = step?.requiresToolId === tool.id;
                return (
                  <Pressable
                    key={tool.id}
                    className={`trial-tool ${on ? "is-on" : ""} ${needed ? "is-needed" : ""}`}
                    onPress={() => toggleTool(tool.id)}
                    feedback={{
                      label: on ? `${tool.titleFa} فعال` : tool.titleFa,
                      tone: on ? "ok" : "info",
                    }}
                    style={
                      on
                        ? {
                            borderColor: env.accent,
                            background: `${env.accent}18`,
                          }
                        : undefined
                    }
                  >
                    <strong>{tool.titleFa}</strong>
                    <span className="muted text-xs leading-5">{tool.howFa}</span>
                  </Pressable>
                );
              })}
            </div>
          </section>

          {step && trial ? (
            <section className="surface p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="section-title !mb-0">
                  گام {toPersianDigits(stepIndex + 1)} از{" "}
                  {toPersianDigits(trial.steps.length)}
                </p>
                <Badge tone="accent">{step.kind}</Badge>
              </div>
              <p className="text-sm leading-7 font-medium">{step.promptFa}</p>
              {step.requiresToolId ? (
                <p
                  className={`trial-tool-gate text-xs ${toolReady ? "is-ready" : ""}`}
                >
                  {toolReady
                    ? "ابزار لازم فعال است"
                    : `ابزار لازم: ${tools.find((t) => t.id === step.requiresToolId)?.titleFa ?? step.requiresToolId}`}
                </p>
              ) : null}
              {step.hintFa ? (
                <p className="muted text-xs leading-6">{step.hintFa}</p>
              ) : null}

              {step.instrument && toolReady ? (
                <InstrumentPanel
                  toolId={step.requiresToolId ?? step.instrument.kind}
                  stepId={step.id}
                  spec={step.instrument}
                  orbitDeg={orbitDeg}
                  lastReading={stepReading}
                  onReading={(r) =>
                    setReadings((prev) => [
                      ...prev.filter((x) => x.stepId !== step.id),
                      r,
                    ])
                  }
                />
              ) : null}

              {step.instrument && !instrumentReady ? (
                <p className="trial-tool-gate text-xs">
                  قبل از انتخاب گزینه، کنسول ابزار را با خروجی قبول اجرا کنید.
                </p>
              ) : null}

              <StepOptions
                step={step}
                selected={selected}
                onToggle={toggleAnswer}
                locked={Boolean(result) || !instrumentReady}
              />
              {error ? (
                <p className="trial-error text-sm" role="alert">
                  {error}
                </p>
              ) : null}
              <button
                type="button"
                className="btn btn-primary w-full"
                onClick={goNext}
              >
                {isLast ? "ثبت شواهد + خروجی ابزار" : "گام بعد"}
              </button>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
