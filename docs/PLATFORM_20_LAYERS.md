# Arya Platform — 20-Layer Skeleton

Runnable architecture for گالری طلای آریا: training ops + gold market/finance + AI.

| # | Layer | Path |
|---|-------|------|
| 1 | Spec Coach | `platform/spec` |
| 2 | Frontend | `app/ops` (+ existing employee/manager UI) |
| 3 | BFF / API Gateway | `platform/bff` + `app/api/platform/*` |
| 4 | Auth / RBAC / RLS | `platform/auth` + Supabase RLS migration |
| 5 | Financial Domain Core | `platform/finance` |
| 6 | Real-Time Market Data | `platform/market` |
| 7 | Quant / Market Intelligence | `platform/quant` |
| 8 | Event Bus / Queue | `platform/events` |
| 9 | AI Orchestrator | `platform/ai/orchestrator` |
| 10 | MCP | `platform/ai/mcp` |
| 11 | RAG | `platform/ai/rag` → training knowledge |
| 12 | Model Gateway | `platform/ai/gateway` |
| 13 | Guardrails | `platform/ai/guardrails` |
| 14 | State / Memory | `platform/memory` |
| 15 | Postgres / Vector / Cache / Object | `platform/storage` + `supabase/migrations` |
| 16 | Testing + AI Evals | `platform/evals` + `tests/platform` |
| 17 | Replay / Backtesting | `platform/replay` |
| 18 | Observability / Security / DR | `platform/observability` |
| 19 | CI/CD + Feature Flags + Gates | `platform/flags` + `.github/workflows` |
| 20 | GitHub + Supabase + Vercel + Worker | `workers/market-worker.ts` |

## Commands

```bash
npm run test:double          # platform tests ×2
npm run gates                # release gates
npm run worker:market        # persistent market worker
npm run build                # Next + API routes
```

## Product rule

AI **never** grants `WorkAuthorization`. Money totals come from finance formula + market ticks, not model hallucination.
