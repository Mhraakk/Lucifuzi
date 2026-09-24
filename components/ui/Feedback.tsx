import type { ReactNode } from "react";
import { toPersianDigits } from "@/lib/format";

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="surface animate-in px-5 py-12 text-center">
      <div
        className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl"
        style={{ background: "var(--accent-soft)", color: "var(--accent-deep)" }}
        aria-hidden
      >
        <svg className="nav-icon" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="8" />
          <path d="M12 8v4M12 16h.01" />
        </svg>
      </div>
      <p className="section-title mb-2">{title}</p>
      {description ? (
        <p className="muted mx-auto max-w-xs text-sm leading-7">{description}</p>
      ) : null}
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  message = "دریافت اطلاعات با مشکل مواجه شد.",
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div
      className="surface animate-in motion-shake px-5 py-8 text-center"
      style={{ borderColor: "color-mix(in srgb, var(--danger) 35%, var(--line))" }}
      role="alert"
    >
      <p className="section-title mb-2" style={{ color: "var(--danger)" }}>
        خطا
      </p>
      <p className="muted mb-4 text-sm leading-7">{message}</p>
      {onRetry ? (
        <button type="button" className="btn btn-secondary" onClick={onRetry}>
          تلاش دوباره
        </button>
      ) : null}
    </div>
  );
}

export function SkeletonBlock({ className = "h-24" }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden />;
}

export function ProgressRing({
  value,
  size = 72,
  label,
}: {
  value: number;
  size?: number;
  label?: string;
}) {
  const r = (size - 10) / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(100, Math.max(0, value));
  const offset = circ - (pct / 100) * circ;
  return (
    <div className="relative inline-flex items-center justify-center animate-ring">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--bg-soft)"
          strokeWidth="6"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="url(#ringGrad)"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dashoffset 0.7s cubic-bezier(0.22, 1, 0.36, 1)" }}
        />
        <defs>
          <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="var(--accent)" />
            <stop offset="100%" stopColor="var(--metal)" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-sm font-bold">{toPersianDigits(Math.round(pct))}٪</span>
        {label ? <span className="text-[10px] faint">{label}</span> : null}
      </div>
    </div>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger" | "accent";
}) {
  const colors: Record<string, { bg: string; color: string }> = {
    neutral: { bg: "var(--bg-soft)", color: "var(--ink-muted)" },
    success: { bg: "rgba(45,106,79,0.12)", color: "var(--success)" },
    warning: { bg: "rgba(154,107,42,0.14)", color: "var(--warning)" },
    danger: { bg: "rgba(140,61,61,0.12)", color: "var(--danger)" },
    accent: { bg: "var(--accent-soft)", color: "var(--accent-deep)" },
  };
  const c = colors[tone]!;
  return (
    <span
      className="chip"
      style={{ background: c.bg, color: c.color, borderColor: "transparent" }}
    >
      {children}
    </span>
  );
}
