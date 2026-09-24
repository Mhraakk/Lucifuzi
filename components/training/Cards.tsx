import Link from "next/link";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/Feedback";
import { formatMinutes, toPersianDigits } from "@/lib/format";

export function TrainingCard({
  title,
  subtitle,
  meta,
  href,
  accent,
  badge,
}: {
  title: string;
  subtitle?: string;
  meta?: string;
  href: string;
  accent?: string;
  badge?: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="surface block overflow-hidden transition hover:-translate-y-0.5 animate-in"
    >
      <div
        className="h-1.5 w-full"
        style={{ background: accent ?? "var(--accent)" }}
      />
      <div className="p-4">
        <div className="mb-2 flex items-start justify-between gap-2">
          <h3 className="font-bold leading-6">{title}</h3>
          {badge}
        </div>
        {subtitle ? (
          <p className="muted text-sm leading-7 line-clamp-2">{subtitle}</p>
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
}: {
  id: string;
  title: string;
  description: string;
  minutes: number;
  progress: number;
  accent: string;
}) {
  return (
    <TrainingCard
      href={`/employee/courses/${id}`}
      title={title}
      subtitle={description}
      accent={accent}
      meta={`${formatMinutes(minutes)} · پیشرفت ${toPersianDigits(progress)}٪`}
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
      className="surface block p-4 animate-in"
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
      <p className="font-bold text-sm mb-1">{title}</p>
      <p className="muted text-sm leading-7">{body}</p>
    </Link>
  );
}
