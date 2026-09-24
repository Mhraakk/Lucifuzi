import type { ReactNode } from "react";

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
    <div className="surface px-5 py-10 text-center animate-in">
      <p className="section-title mb-2">{title}</p>
      {description ? <p className="muted text-sm leading-7">{description}</p> : null}
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
    <div className="surface px-5 py-8 text-center border-[color:var(--danger)]">
      <p className="section-title mb-2" style={{ color: "var(--danger)" }}>
        خطا
      </p>
      <p className="muted text-sm leading-7 mb-4">{message}</p>
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
  const offset = circ - (Math.min(100, Math.max(0, value)) / 100) * circ;
  return (
    <div className="relative inline-flex items-center justify-center animate-ring">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--bg-soft)"
          strokeWidth="7"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-sm font-bold">{Math.round(value)}٪</span>
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
    success: { bg: "rgba(47,107,79,0.12)", color: "var(--success)" },
    warning: { bg: "rgba(154,107,47,0.14)", color: "var(--warning)" },
    danger: { bg: "rgba(143,61,61,0.12)", color: "var(--danger)" },
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
