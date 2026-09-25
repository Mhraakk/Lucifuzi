/**
 * Layer 1 — Spec Coach / Spec-driven development
 * Canonical contracts that every other layer must honor.
 */

export const PLATFORM_VERSION = "1.0.0" as const;

export type LayerId =
  | "spec"
  | "frontend"
  | "bff"
  | "auth"
  | "finance"
  | "market"
  | "quant"
  | "events"
  | "ai-orchestrator"
  | "mcp"
  | "rag"
  | "model-gateway"
  | "guardrails"
  | "memory"
  | "storage"
  | "evals"
  | "replay"
  | "observability"
  | "cicd-flags"
  | "infra";

export const LAYER_CATALOG: Array<{
  id: LayerId;
  n: number;
  title: string;
  path: string;
}> = [
  { id: "spec", n: 1, title: "Spec Coach", path: "platform/spec" },
  { id: "frontend", n: 2, title: "Frontend", path: "app/ops" },
  { id: "bff", n: 3, title: "BFF / API Gateway", path: "platform/bff" },
  { id: "auth", n: 4, title: "Auth / RBAC / RLS", path: "platform/auth" },
  { id: "finance", n: 5, title: "Financial Domain Core", path: "platform/finance" },
  { id: "market", n: 6, title: "Real-Time Market Data", path: "platform/market" },
  { id: "quant", n: 7, title: "Market Intelligence / Quant", path: "platform/quant" },
  { id: "events", n: 8, title: "Event Bus / Queue", path: "platform/events" },
  { id: "ai-orchestrator", n: 9, title: "AI Orchestrator", path: "platform/ai/orchestrator" },
  { id: "mcp", n: 10, title: "MCP", path: "platform/ai/mcp" },
  { id: "rag", n: 11, title: "RAG", path: "platform/ai/rag" },
  { id: "model-gateway", n: 12, title: "Model Gateway", path: "platform/ai/gateway" },
  { id: "guardrails", n: 13, title: "Guardrails", path: "platform/ai/guardrails" },
  { id: "memory", n: 14, title: "State / Memory", path: "platform/memory" },
  { id: "storage", n: 15, title: "Postgres / Vector / Cache / Object", path: "platform/storage" },
  { id: "evals", n: 16, title: "Testing + AI Evals", path: "platform/evals" },
  { id: "replay", n: 17, title: "Replay / Backtesting", path: "platform/replay" },
  { id: "observability", n: 18, title: "Observability / Security / DR", path: "platform/observability" },
  { id: "cicd-flags", n: 19, title: "CI/CD + Feature Flags + Gates", path: "platform/flags" },
  { id: "infra", n: 20, title: "GitHub + Supabase + Vercel + Worker", path: "workers" },
];

/** Zod-free lightweight validators (no extra deps) */
export type SpecResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; field?: string };

export function requireString(
  value: unknown,
  field: string,
  min = 1
): SpecResult<string> {
  if (typeof value !== "string" || value.trim().length < min) {
    return { ok: false, error: `${field} must be a non-empty string`, field };
  }
  return { ok: true, data: value.trim() };
}

export function requireNumber(
  value: unknown,
  field: string,
  opts?: { min?: number; max?: number }
): SpecResult<number> {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return { ok: false, error: `${field} must be a number`, field };
  }
  if (opts?.min !== undefined && value < opts.min) {
    return { ok: false, error: `${field} < ${opts.min}`, field };
  }
  if (opts?.max !== undefined && value > opts.max) {
    return { ok: false, error: `${field} > ${opts.max}`, field };
  }
  return { ok: true, data: value };
}

/** Spec Coach — validates a change request against layer contracts */
export type SpecChangeRequest = {
  layer: LayerId;
  intent: string;
  touchesAuth?: boolean;
  touchesMoney?: boolean;
  touchesAi?: boolean;
};

export type SpecCoachVerdict = {
  approved: boolean;
  gates: string[];
  blockers: string[];
  checklist: string[];
};

export function specCoachReview(req: SpecChangeRequest): SpecCoachVerdict {
  const gates: string[] = ["unit-test", "typecheck"];
  const blockers: string[] = [];
  const checklist: string[] = [
    `Layer ${req.layer}: ${req.intent}`,
    "Update contract tests if public types change",
  ];

  if (req.touchesAuth) {
    gates.push("auth-rbac-review", "rls-policy-check");
    checklist.push("Verify RLS policies for tenant/branch scope");
  }
  if (req.touchesMoney) {
    gates.push("finance-invariant", "replay-smoke");
    checklist.push("Price formulas must remain deterministic given inputs");
    if (!req.intent.toLowerCase().includes("audit")) {
      checklist.push("Emit finance.audit event on mutations");
    }
  }
  if (req.touchesAi) {
    gates.push("ai-eval", "guardrail-pass");
    checklist.push("AI must not grant WorkAuthorization");
    checklist.push("Ground answers in RAG citations or refuse");
  }

  if (!req.intent.trim()) {
    blockers.push("intent is required");
  }
  if (!LAYER_CATALOG.some((l) => l.id === req.layer)) {
    blockers.push(`unknown layer: ${String(req.layer)}`);
  }

  return {
    approved: blockers.length === 0,
    gates,
    blockers,
    checklist,
  };
}

export const OPENAPI_SKETCH = {
  openapi: "3.1.0",
  info: { title: "Arya Platform BFF", version: PLATFORM_VERSION },
  paths: {
    "/api/platform/health": { get: { summary: "Layer health matrix" } },
    "/api/platform/market": { get: { summary: "Latest gold/FX ticks" } },
    "/api/platform/finance/quote": { post: { summary: "Deterministic gold quote" } },
    "/api/platform/ai/ask": { post: { summary: "Orchestrated RAG+guardrails" } },
    "/api/platform/events": { get: { summary: "Recent domain events" } },
    "/api/platform/flags": { get: { summary: "Feature flags" } },
  },
} as const;
