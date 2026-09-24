import Link from "next/link";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/Feedback";
import { formatMinutes, toPersianDigits } from "@/lib/format";
import { illustrationSrcForCourse } from "@/lib/illustrations";

export function TrainingCard({
  title,
  subtitle,
  meta,
  href,
  accent,
  badge,
  progress,
  imageSrc,
}: {
  title: string;
  subtitle?: string;
  meta?: string;
  href: string;
  accent?: string;
  badge?: ReactNode;
  progress?: number;
  imageSrc?: string;
}) {
  return (
    <Link
      href={href}
      className="surface surface-interactive block overflow-hidden animate-in"
    >
      {imageSrc ? (
        <div className="topic-visual topic-visual--card-strip">
          <div className="topic-visual__frame h-28">
            <div className="topic-visual__shine" aria-hidden />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageSrc}
              alt=""
              className="topic-visual__img"
              loading="lazy"
              decoding="async"
            />
            <div className="topic-visual__veil" aria-hidden />
          </div>
        </div>
      ) : (
        <div
          className="h-1 w-full"
          style={{
            background: `linear-gradient(90deg, ${accent ?? "var(--accent)"}, var(--metal))`,
          }}
        />
      )}
      <div className="p-4">
        <div className="mb-2 flex items-start justify-between gap-2">
          <h3 className="font-bold leading-6">{title}</h3>
          {badge}
        </div>
        {subtitle ? (
          <p className="muted line-clamp-2 text-sm leading-7">{subtitle}</p>
        ) : null}
        {typeof progress === "number" ? (
          <div className="mt-3">
            <div className="mb-1.5 flex justify-between text-[11px]">
              <span className="faint">پیشرفت</span>
              <span className="font-medium" style={{ color: "var(--accent-deep)" }}>
                {toPersianDigits(progress)}٪
              </span>
            </div>
            <div className="progress-track">
              <div
                className="progress-fill"
                style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
              />
            </div>
          </div>
        ) : null}
        {meta ? <p className="faint mt-3 text-xs">{meta}</p> : null}
      </div>
    </Link>
  );
}

export function CourseCard({
  id,
  title,
  description,
  minutes,
  progress,
  accent,
  coverImage,
  academy,
}: {
  id: string;
  title: string;
  description: string;
  minutes: number;
  progress: number;
  accent: string;
  coverImage?: string;
  academy?: string;
}) {
  return (
    <TrainingCard
      href={`/employee/courses/${id}`}
      title={title}
      subtitle={description}
      accent={accent}
      progress={progress}
      imageSrc={coverImage ?? illustrationSrcForCourse(id)}
      meta={[academy, formatMinutes(minutes)].filter(Boolean).join(" · ")}
      badge={
        progress >= 100 ? (
          <Badge tone="success">تمام</Badge>
        ) : progress > 0 ? (
          <Badge tone="accent">ادامه</Badge>
        ) : (
          <Badge>شروع</Badge>
        )
      }
    />
  );
}

export function ManagerAlert({
  title,
  body,
  href,
  tone = "warning",
}: {
  title: string;
  body: string;
  href: string;
  tone?: "warning" | "danger" | "accent";
}) {
  return (
    <Link
      href={href}
      className="surface surface-interactive block p-4 animate-in"
      style={{
        borderRight: `3px solid ${
          tone === "danger"
            ? "var(--danger)"
            : tone === "accent"
              ? "var(--accent)"
              : "var(--warning)"
        }`,
      }}
    >
      <p className="mb-1 text-sm font-bold">{title}</p>
      <p className="muted text-sm leading-7">{body}</p>
    </Link>
  );
}
