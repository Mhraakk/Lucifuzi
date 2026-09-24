"use client";

import Link from "next/link";
import { toPersianDigits } from "@/lib/format";

export type LadderStep = {
  id: string;
  title: string;
  subtitle?: string;
  href: string;
  /** 0–100 */
  progress: number;
  status: "locked" | "current" | "done";
};

export function CareerLadder({
  title,
  eyebrow,
  overall,
  steps,
}: {
  title: string;
  eyebrow?: string;
  overall: number;
  steps: LadderStep[];
}) {
  const clamped = Math.min(100, Math.max(0, overall));

  return (
    <section className="ladder-panel animate-scale overflow-hidden">
      <div className="ladder-glow" aria-hidden />
      <div className="relative z-[1] p-5">
        <div className="mb-5 flex items-end justify-between gap-4">
          <div className="min-w-0">
            {eyebrow ? (
              <p className="mb-1 text-[11px] faint tracking-[0.06em]">{eyebrow}</p>
            ) : null}
            <h2 className="section-title leading-7">{title}</h2>
            <p className="muted mt-1 text-xs leading-6">
              هر پله یک شایستگی واقعی فروشگاه — نه فقط نمره آزمون
            </p>
          </div>
          <div className="ladder-score shrink-0">
            <span className="text-lg font-bold leading-none">
              {toPersianDigits(clamped)}
            </span>
            <span className="text-[10px] faint">٪ مسیر</span>
          </div>
        </div>

        <div className="progress-track mb-6">
          <div
            className="progress-fill"
            style={{ width: `${clamped}%` }}
            role="progressbar"
            aria-valuenow={clamped}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>

        <ol className="ladder-rail stagger">
          {steps.map((step, index) => {
            const done = step.status === "done";
            const current = step.status === "current";
            const locked = step.status === "locked";
            return (
              <li key={step.id} className="ladder-step">
                <div
                  className={`ladder-node ${done ? "is-done" : ""} ${current ? "is-current" : ""} ${locked ? "is-locked" : ""}`}
                  aria-hidden
                >
                  {done ? (
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.4">
                      <path d="m5 12 5 5L20 7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : (
                    <span className="text-[11px] font-bold">
                      {toPersianDigits(index + 1)}
                    </span>
                  )}
                </div>
                <Link
                  href={locked ? "#" : step.href}
                  aria-disabled={locked}
                  onClick={(e) => {
                    if (locked) e.preventDefault();
                  }}
                  className={`ladder-card ${current ? "is-current" : ""} ${locked ? "is-locked" : ""}`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold leading-6">{step.title}</p>
                    {step.subtitle ? (
                      <p className="muted mt-0.5 line-clamp-1 text-xs leading-5">
                        {step.subtitle}
                      </p>
                    ) : null}
                  </div>
                  <div className="shrink-0 text-left">
                    <p
                      className="text-xs font-semibold"
                      style={{
                        color: done
                          ? "var(--success)"
                          : current
                            ? "var(--accent-deep)"
                            : "var(--ink-faint)",
                      }}
                    >
                      {done
                        ? "تکمیل"
                        : locked
                          ? "قفل"
                          : `${toPersianDigits(step.progress)}٪`}
                    </p>
                    {!locked ? (
                      <div className="mt-1.5 w-14 progress-track !h-1.5">
                        <div
                          className="progress-fill"
                          style={{ width: `${step.progress}%` }}
                        />
                      </div>
                    ) : null}
                  </div>
                </Link>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

export function buildLadderSteps(
  courses: Array<{
    id: string;
    title: string;
    description: string;
    progress: number;
  }>
): LadderStep[] {
  let foundCurrent = false;
  return courses.map((c) => {
    const done = c.progress >= 100;
    let status: LadderStep["status"] = "locked";
    if (done) {
      status = "done";
    } else if (!foundCurrent) {
      status = "current";
      foundCurrent = true;
    }
    return {
      id: c.id,
      title: c.title,
      subtitle: c.description,
      href: `/employee/courses/${c.id}`,
      progress: c.progress,
      status,
    };
  });
}
