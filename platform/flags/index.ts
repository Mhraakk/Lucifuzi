/**
 * Layer 19 — Feature Flags + Release Gates
 */

export type FlagKey =
  | "platform.ops_console"
  | "platform.live_market_worker"
  | "platform.ai_orchestrator"
  | "platform.quant_signals"
  | "platform.supabase_persistence";

type Flag = {
  key: FlagKey;
  enabled: boolean;
  description: string;
};

const flags = new Map<FlagKey, Flag>([
  [
    "platform.ops_console",
    {
      key: "platform.ops_console",
      enabled: true,
      description: "Ops console UI",
    },
  ],
  [
    "platform.live_market_worker",
    {
      key: "platform.live_market_worker",
      enabled: true,
      description: "Persistent market tick worker",
    },
  ],
  [
    "platform.ai_orchestrator",
    {
      key: "platform.ai_orchestrator",
      enabled: true,
      description: "Layer 9 orchestrator",
    },
  ],
  [
    "platform.quant_signals",
    {
      key: "platform.quant_signals",
      enabled: true,
      description: "Quant engine signals on ops",
    },
  ],
  [
    "platform.supabase_persistence",
    {
      key: "platform.supabase_persistence",
      enabled: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
      description: "Use Supabase when configured",
    },
  ],
]);

export function isEnabled(key: FlagKey): boolean {
  return flags.get(key)?.enabled ?? false;
}

export function listFlags(): Flag[] {
  return Array.from(flags.values());
}

export function setFlag(key: FlagKey, enabled: boolean): Flag {
  const cur = flags.get(key);
  if (!cur) throw new Error(`Unknown flag ${key}`);
  const next = { ...cur, enabled };
  flags.set(key, next);
  return next;
}

export type ReleaseGate = {
  id: string;
  required: boolean;
  passed: boolean;
  detail: string;
};

export function evaluateReleaseGates(input: {
  typecheck: boolean;
  unitTests: boolean;
  aiEvals: boolean;
  financeInvariant: boolean;
}): { ok: boolean; gates: ReleaseGate[] } {
  const gates: ReleaseGate[] = [
    {
      id: "typecheck",
      required: true,
      passed: input.typecheck,
      detail: "tsc --noEmit",
    },
    {
      id: "unit-tests",
      required: true,
      passed: input.unitTests,
      detail: "platform double-test suite",
    },
    {
      id: "ai-evals",
      required: true,
      passed: input.aiEvals,
      detail: "guardrail + refuse evals",
    },
    {
      id: "finance-invariant",
      required: true,
      passed: input.financeInvariant,
      detail: "quote total >= goldValue",
    },
  ];
  return { ok: gates.every((g) => !g.required || g.passed), gates };
}
