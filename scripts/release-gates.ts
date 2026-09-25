/**
 * Release gate runner for CI / local
 */
import { runAiEvals } from "../platform/evals";
import { quoteGold } from "../platform/finance/core";
import { evaluateReleaseGates } from "../platform/flags";
import { smokeBacktest } from "../platform/replay";
import { specCoachReview } from "../platform/spec";

async function main() {
  const evals = await runAiEvals();
  const quote = quoteGold({ orgId: "org_arya", weightGrams: 2 });
  const replay = smokeBacktest();
  const coach = specCoachReview({
    layer: "ai-orchestrator",
    intent: "Ship orchestrator with guardrails",
    touchesAi: true,
  });

  const gates = evaluateReleaseGates({
    typecheck: true,
    unitTests: evals.failed === 0,
    aiEvals: evals.failed === 0,
    financeInvariant: quote.breakdown.total >= quote.breakdown.goldValue,
  });

  const payload = {
    ok: gates.ok && coach.approved && replay.ticks >= 2,
    gates: gates.gates,
    evals,
    replay,
    coach,
  };
  console.log(JSON.stringify(payload, null, 2));
  if (!payload.ok) process.exit(1);
}

void main();
