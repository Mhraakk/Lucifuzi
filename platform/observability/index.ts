/**
 * Layer 18 — Observability / Security / DR
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogRecord = {
  level: LogLevel;
  msg: string;
  layer?: string;
  at: string;
  meta?: Record<string, unknown>;
};

const logs: LogRecord[] = [];
const MAX = 1000;

export function log(
  level: LogLevel,
  msg: string,
  meta?: Record<string, unknown>,
  layer?: string
): void {
  const rec: LogRecord = {
    level,
    msg,
    layer,
    at: new Date().toISOString(),
    meta,
  };
  logs.unshift(rec);
  if (logs.length > MAX) logs.length = MAX;
  if (level === "error" || level === "warn") {
    console[level === "error" ? "error" : "warn"](`[${layer ?? "app"}]`, msg, meta ?? "");
  } else if (layer === "worker" || process.env.ARYA_LOG_INFO === "1") {
    console.log(`[${layer ?? "app"}]`, msg, meta ?? "");
  }
}

export function recentLogs(limit = 50): LogRecord[] {
  return logs.slice(0, limit);
}

export type HealthStatus = "ok" | "degraded" | "down";

export type LayerHealth = {
  layer: string;
  status: HealthStatus;
  detail?: string;
};

export function securityHeaders(): Record<string, string> {
  return {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Arya-Platform": "1",
  };
}

/** DR: export critical snapshots */
export function disasterRecoverySnapshot(): {
  exportedAt: string;
  logCount: number;
  note: string;
} {
  return {
    exportedAt: new Date().toISOString(),
    logCount: logs.length,
    note: "In demo mode snapshot is in-process; production ships to object storage + Supabase PITR.",
  };
}

export function clearLogsForTests(): void {
  logs.length = 0;
}
