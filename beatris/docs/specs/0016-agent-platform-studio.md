# 0016 — Shared agent platform and the Studio domain

## What
Spec 0015 had one agent runtime for accounting training. This spec turns it into one shared, modular agent platform that every domain uses. The domains are Accounting, Studio/CAD and Training. On top of the platform it adds a Studio domain where agents orchestrate and a deterministic engine computes.

- **Platform** (`server/agent-platform/`)
  - **Registry** (`registry.mjs`): each agent declares id, domain, instructions, `allowedTools`, `approvalPolicy`, `memoryScopes`, `canDelegateTo` and a plan. Unknown tools or delegation targets are refused at start-up.
  - **Runtime** (`runtime.mjs`):
    - Run states are `queued`, `running`, `waiting_for_tool`, `waiting_for_approval`, `paused`, `completed`, `failed` and `cancelled`.
    - Runs are durable by replay.
    - Tools are typed. An agent may only call the tools on its allowlist, and the person's own capabilities are checked on every call.
    - Approvals use four-eyes control. A tool can require approval, and so can an agent's policy.
    - Retries are bounded: at most 5, and only for errors the tool declares retryable.
    - Tool outputs can be validated against a schema.
    - Delegation is typed and bounded. The target must be allowed, depth is limited to 3, and cycles are refused. Each delegation is a child run, so it can be observed. A waiting child keeps its parent in `waiting_for_tool`, and a finished child wakes the parent.
    - Cancelling a parent cascades to its children.
    - Memory is scoped (`training`, `manager`, `preference`, `technical`).
    - Event names are shared: `agent.run.*`, `agent.tool.*`, `agent.approval.*` and `agent.delegation.*`, plus domain events (`studio.geometry.created`, `studio.validation.failed`, `studio.weight.exceeded`, `studio.project.completed`, `training.skill.updated`).
    - A stats view reports runs, tool calls, failures, retries, durations and delegations.
    - Databases from spec 0015 are migrated in place: state names and agent ids are renamed.
  - **Provider** (`provider.mjs`):
    - The `AgentModelProvider` interface is implemented over the assistant's engine chain.
    - `structured()` accepts JSON only, validates it against a schema, and allows at most N repair rounds that carry the validator's errors. After that the output is rejected.
- **Shared code** (`public/js/`)
  - `schema.mjs` is the validator shared by the browser and the server. It adds `oneOf` (a tagged union) and `const`.
  - `skillgraph.mjs` is one mastery model (a Beta posterior) and a graph factory used by both accounting and studio.
- **Studio engine** (`public/js/studio/`)
  - **Units and materials:** `units` gives typed quantities with checked conversion. `materials` holds alloy densities and minimum thicknesses.
  - **Geometry:** `geometry` covers closed meshes, revolve/extrude/sweep, voxel booleans, offset/fillet/shell, volume, area, bounds, closure, ray-cast wall thickness and solid connectivity.
  - **Design input and checks:**
    - `brief`: a Persian brief becomes a `JewelryDesignIntent`.
    - `ring`: shank and prong head.
    - `setting`: prong, bezel, channel, pavé, flush, tension and halo rules.
    - `design`: intent becomes parameters, then a program. It produces manufacturing findings, weight findings and an aesthetic critique, kept apart, and runs the constrained weight optimiser.
  - **CAD boundary:** `cad` validates the CadOperation IR and runs the local adapter.
  - **Editing and training:**
    - `instruct`: a Persian edit becomes typed parameter edits.
    - `exercises`: studio exercises with assessment and levelled hints.
    - `skills`: the studio skill graph on the shared infrastructure.
- **Studio server** (`server/studio/`)
  - `store` keeps projects, immutable model versions, exports, exercises and attempts.
  - `tools` is the typed tool registry.
  - `agents` defines the five studio and training agents and the curriculum's studio modes.
- **Agents**
  - Accounting: `accounting-tutor`, `audit` and `reconciliation` (a count against the book; the kernel computes the differences; it asks the auditor when the count does not match and never adjusts a balance).
  - Studio: `studio-design`, `rhino-cad` and `manufacturing`.
  - Training: `training-tutor`, `assessment` and `curriculum`.
- **Routines and triggers**
  - Studio routines: daily CAD, weekly design, weekly review, weekly manufacturing and unfinished work. They run only for people who work in the studio.
  - Studio triggers: three failed attempts, weight over target, a repeated manufacturing error, a completed project and mastery reached.
- **UI**
  - `/studio/coach`: brief, measured design, edit in a sentence, export, and exercises with hints. It uses no engine vocabulary.
  - `/agents`: the admin's view of the registry, statistics and run steps and events.
  - The team view gains a column for the other competencies.

- **A trainee's own CAD steps:** `POST /api/studio/projects/:id/ops` sends typed CadOperations. `rhino-cad` runs them with `cad.modifyGeometry`, which tries them on a copy first and stores a new version only if they succeed. It then delegates to `manufacturing`, which delegates to `training-tutor` for the explanation (depth 2). `GET …/review` gives the calm summary through `studio.inspectDesign`.
- **Events:** `agent.step.started`, `studio.geometry.modified`, `training.exercise.completed`, and `studio.project.completed` on finalisation.
- **Wall-thickness rule:** it covers every measured metal body, not only an untouched shank. A shelled or edited body is checked the same way.

## Acceptance
- Registry and permissions:
  - The registry refuses unknown tools and targets.
  - An agent cannot call a tool outside its list, or one the person lacks the capability for.
- Approvals:
  - Approval pauses a run, and the requester cannot approve it.
  - A denial means the tool does not run.
- Delegation:
  - Delegation to an unlisted agent, a cycle, or depth above 3 fails.
  - A child that waits on approval keeps its parent waiting, and both finish once the child is approved.
- Robustness:
  - Retries stop at the declared maximum.
  - Invalid tool output fails the run.
  - A structured model answer is repaired with the validator's errors, then rejected after N attempts.
- Memory: an agent cannot read or write a scope it did not declare.
- Studio engine:
  - Cube volume is 1000 mm³ and area 600 mm².
  - A revolved ring and a cylinder are within 0.5 % of their formulas.
  - Wall thickness is measured as 2 mm.
  - The boolean difference is within 3 %.
  - Weight = volume × alloy density, and units never mix.
- Design from a brief:
  - The brief «انگشتر ۱۸ عیار مینیمال، سنگ بیضی ۸×۶، زیر ۴ گرم، ریخته‌گری» gives a single closed solid of about 2.5 g with no blocking finding.
  - A 0.5 mm floor gives a critical `WALL_TOO_THIN` finding with measured evidence.
- Weight optimisation:
  - Only the floor of the shank changes. The setting and the shoulders stay untouched.
  - The weight is measured again afterwards.
  - An impossible target is reported along with the minimums that block it.
- Studio over HTTP:
  - Every edit creates a new model version.
  - A production export, deletion or finalisation waits for a manager.
  - An exercise is graded on the engine and updates the shared mastery once per key.
  - Hints come in levels and never contain the final numbers.
  - Another person gets 404 on someone else's project or exercise.
- Gate: `npm run gate` passes, and the trainer and studio coach e2e steps pass.

## Constraints
- No runtime dependencies or CDN. The LLM is never the source of truth: a model may only add style words or an aesthetic sentence through `structured()`, never a number.
- There is no fake Rhino. `rhino-cad` talks to a CAD adapter boundary, and today that boundary has only the local engine (STL/OBJ). `.3dm` is still exported by the vendored rhino3dm worker in the browser studio. A RhinoCommon, Compute or Grasshopper adapter would sit behind the same `createGeometry`/`inspectGeometry`/`exportModel` calls and is not implemented.
- The accounting logic is unchanged. Only agent ids, state names and event names change, and a migration covers them.
- Every shop keeps its own database, so tenants stay isolated. An agent acts as the person who started the run and is checked against that person's permissions.

## Not done
- Stone settings other than prong are checked by rules but not modelled as geometry (`E_UNSUPPORTED`).
- The geometry engine is voxel-based for booleans, offset and fillet, with about 1–2 % error. It is not a NURBS kernel.
