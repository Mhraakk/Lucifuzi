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

function LadderIllustration({ progress }: { progress: number }) {
  const climb = Math.min(100, Math.max(0, progress));
  return (
    <div className="ladder-art" aria-hidden>
      <svg
        className="ladder-art-svg"
        viewBox="0 0 320 160"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="skyWash" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.18" />
            <stop offset="100%" stopColor="var(--info)" stopOpacity="0.08" />
          </linearGradient>
          <linearGradient id="stepFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--metal)" />
            <stop offset="100%" stopColor="var(--accent)" />
          </linearGradient>
        </defs>

        <rect width="320" height="160" rx="24" fill="url(#skyWash)" />

        <ellipse className="ladder-orb ladder-orb-a" cx="48" cy="42" rx="18" ry="10" fill="var(--accent)" fillOpacity="0.12" />
        <ellipse className="ladder-orb ladder-orb-b" cx="268" cy="36" rx="22" ry="12" fill="var(--info)" fillOpacity="0.14" />
        <ellipse className="ladder-orb ladder-orb-c" cx="290" cy="88" rx="14" ry="8" fill="var(--metal)" fillOpacity="0.16" />

        {/* Ascending stair blocks — coaching ladder silhouette */}
        <g className="ladder-stairs">
          <rect x="36" y="118" width="52" height="14" rx="4" fill="url(#stepFill)" opacity="0.35" />
          <rect x="78" y="100" width="52" height="14" rx="4" fill="url(#stepFill)" opacity="0.5" />
          <rect x="120" y="82" width="52" height="14" rx="4" fill="url(#stepFill)" opacity="0.65" />
          <rect x="162" y="64" width="52" height="14" rx="4" fill="url(#stepFill)" opacity="0.8" />
          <rect x="204" y="46" width="52" height="14" rx="4" fill="url(#stepFill)" opacity="0.95" />
        </g>

        {/* Climber marker rides the stairs based on progress */}
        <g
          className="ladder-climber"
          style={{
            transform: `translate(${36 + (climb / 100) * 168}px, ${118 - (climb / 100) * 72}px)`,
          }}
        >
          <circle cx="26" cy="-6" r="8" fill="var(--accent-deep)" />
          <rect x="20" y="2" width="12" height="16" rx="4" fill="var(--ink)" />
        </g>

        {/* Goal flag at the top */}
        <g className="ladder-flag animate-float">
          <line x1="262" y1="18" x2="262" y2="52" stroke="var(--accent-deep)" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M262 18h28l-6 10 6 10H262V18Z" fill="var(--accent)" />
        </g>
      </svg>

      <div className="ladder-art-caption">
        <span>شروع</span>
        <span style={{ color: "var(--accent-deep)", fontWeight: 700 }}>
          هدف: کار مستقل
        </span>
      </div>
    </div>
  );
}

export function CareerLadder({
  title,
  eyebrow,
  overall,
  steps,
  goalLabel,
}: {
  title: string;
  eyebrow?: string;
  overall: number;
  steps: LadderStep[];
  goalLabel?: string;
}) {
  const clamped = Math.min(100, Math.max(0, overall));
  const doneCount = steps.filter((s) => s.status === "done").length;
  const current = steps.find((s) => s.status === "current");
  const remaining = steps.filter((s) => s.status !== "done").length;
  const railFill = steps.length
    ? Math.round((doneCount / steps.length) * 100)
    : 0;

  return (
    <section className="ladder-panel animate-scale overflow-hidden">
      <div className="ladder-glow" aria-hidden />
      <div className="relative z-[1] p-4 sm:p-5">
        <LadderIllustration progress={clamped} />

        <div className="mb-4 mt-4 flex items-end justify-between gap-4">
          <div className="min-w-0">
            {eyebrow ? (
              <p className="mb-1 text-[11px] faint tracking-[0.06em]">{eyebrow}</p>
            ) : null}
            <h2 className="section-title leading-7">{title}</h2>
            <p className="muted mt-1 text-xs leading-6">
              {goalLabel ??
                "هر پله یک دوره عملیاتی — رسیدن به هدف با دادهٔ واقعی مسیر شما"}
            </p>
          </div>
          <div className="ladder-score shrink-0">
            <span className="text-lg font-bold leading-none">
              {toPersianDigits(clamped)}
            </span>
            <span className="text-[10px] faint">٪ مسیر</span>
          </div>
        </div>

        <div className="ladder-stats mb-5">
          <div>
            <p className="text-[10px] faint">تکمیل</p>
            <p className="text-sm font-bold">
              {toPersianDigits(doneCount)}
              <span className="faint font-medium">
                {" "}
                / {toPersianDigits(steps.length)}
              </span>
            </p>
          </div>
          <div>
            <p className="text-[10px] faint">پله فعلی</p>
            <p className="line-clamp-1 text-sm font-bold">
              {current?.title ?? "مسیر کامل"}
            </p>
          </div>
          <div>
            <p className="text-[10px] faint">باقی‌مانده</p>
            <p className="text-sm font-bold">{toPersianDigits(remaining)}</p>
          </div>
        </div>

        <div className="progress-track mb-5">
          <div
            className="progress-fill"
            style={{ width: `${clamped}%` }}
            role="progressbar"
            aria-valuenow={clamped}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>

        {current ? (
          <Link
            href={current.href}
            className="ladder-next mb-5 block animate-in"
          >
            <div className="min-w-0">
              <p className="text-[11px] faint mb-0.5">قدم بعدی</p>
              <p className="text-sm font-bold leading-6">{current.title}</p>
              {current.subtitle ? (
                <p className="muted mt-0.5 line-clamp-1 text-xs">
                  {current.subtitle}
                </p>
              ) : null}
            </div>
            <span className="btn btn-primary !min-h-10 shrink-0 !px-4 text-xs">
              ادامه · {toPersianDigits(current.progress)}٪
            </span>
          </Link>
        ) : null}

        <ol
          className="ladder-rail stagger"
          style={{ ["--rail-fill" as string]: `${railFill}%` }}
        >
          <span className="ladder-rail-fill" aria-hidden />
          {steps.map((step, index) => {
            const done = step.status === "done";
            const isCurrent = step.status === "current";
            const locked = step.status === "locked";
            return (
              <li key={step.id} className="ladder-step">
                <div
                  className={`ladder-node ${done ? "is-done" : ""} ${isCurrent ? "is-current" : ""} ${locked ? "is-locked" : ""}`}
                  aria-hidden
                >
                  {done ? (
                    <svg
                      viewBox="0 0 24 24"
                      className="h-3.5 w-3.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.4"
                    >
                      <path
                        d="m5 12 5 5L20 7"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
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
                  className={`ladder-card ${isCurrent ? "is-current" : ""} ${locked ? "is-locked" : ""}`}
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
                          : isCurrent
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
