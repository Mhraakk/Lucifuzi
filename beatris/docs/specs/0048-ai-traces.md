# 0048 — AI traces for Langfuse, OpenLLMetry and AgentOps

**Status:** done.

## What
The owner asked to use three tools «برای تست و بررسی اپ» (to test and review the app):
- AgentOps (agentops.ai);
- OpenLLMetry (Traceloop);
- Langfuse.

All three look at what a language model does: each call, its tokens and time, the tools it used, and where a run went
wrong. Every model call of the app goes through one door, the model gateway (spec 0001 #12). The assistant's questions,
its read-only tools and the rephrasing of finished texts all call it.

So the app writes each of those as an OpenTelemetry span, in the GenAI semantic conventions (`gen_ai.*`), and sends it
over OTLP/HTTP. That is the wire all three accept:

| Tool | How the app reaches it | Owner variables |
|---|---|---|
| **Langfuse** | `<base>/api/public/otel/v1/traces`, Basic auth of the public and secret keys, `x-langfuse-ingestion-version: 4` (from Langfuse's OpenTelemetry guide). | `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, optional `LANGFUSE_BASE_URL` (default `https://cloud.langfuse.com`). |
| **OpenLLMetry** | OpenLLMetry is OpenTelemetry instrumentation that writes these same `gen_ai.*` spans. Its cloud, Traceloop, takes them at `<base>/v1/traces` with `Authorization: Bearer <key>`. Any OpenLLMetry collector takes them through the generic endpoint. | `TRACELOOP_API_KEY`, optional `TRACELOOP_BASE_URL` (default `https://api.traceloop.com`). |
| **AgentOps** | The key buys a token at `POST <api>/v3/auth/token`. Spans then go to `https://otlp.agentops.ai/v1/traces` with `Authorization: Bearer <token>`. This is what AgentOps' own SDK does (`agentops/config.py`, `client/api/versions/v3.py`, `sdk/exporters.py`). Its public docs name only the SDK, so this path is the least certain of the three. | `AGENTOPS_API_KEY`, optional `AGENTOPS_API_ENDPOINT`, `AGENTOPS_EXPORTER_ENDPOINT`. |
| **Any OTLP collector** | `BEATRIS_OTEL_ENDPOINT` (the full traces URL) with `BEATRIS_OTEL_HEADERS` (`key=value,key=value`). | as named |

None of the three SDKs is installed. Each is a runtime dependency (Python, or npm packages with their own trees), and
the app has none (CLAUDE.md). The wire format is open, so the app speaks it itself: a small protobuf writer for the OTLP
trace message, `node:http(s)` through `fetch`, and `AsyncLocalStorage` to nest spans.

### The spans
- **`assistant <engine>`**, one per question (Langfuse type `agent`): the engine that answered, the engines skipped,
  the tools used, the guard flags, whether outside data was masked, the time.
- **`chat <model>`**, one per model call through the gateway (`generation`):
  - `gen_ai.operation.name`, `gen_ai.provider.name` (and the older `gen_ai.system`), `gen_ai.request.model`,
    `gen_ai.response.model`;
  - `gen_ai.usage.input_tokens` and `gen_ai.usage.output_tokens`;
  - `server.address`, the attempts, `error.type` on failure, and a skip when the circuit is open.
- **`execute_tool <name>`**, one per read-only tool the model calls (`tool`): `gen_ai.tool.name`, the time, the error.
- **`phrase <engine>`**, when a finished text is rephrased (`chain`).
- **The resource:** `service.name` = `beatris`, `service.version` = the build, `deployment.environment`.

### What leaves the server
- **By default:** no text of a question, an answer, a prompt or a tool result. Only names, numbers of tokens, times,
  flags and errors.
- **With `BEATRIS_OTEL_CONTENT=1`:** the prompts and answers are added. They are always masked first with the same
  redaction outside engines get, even when the shop's own model saw them unmasked. Each is cut at 8,000 characters.
- **Never:** keys, tokens, the `Authorization` of a model call, or a user's name or mobile. The user is a hash of the
  shop and the user id.

### Sending
- Spans wait in a queue and go out every 5 s or at 64, as one OTLP request per destination.
- One retry on 429, 5xx or a network failure; then the batch is dropped and counted.
- The queue holds at most 2,000 spans; older ones are dropped and counted.
- Nothing on the request path waits for an export, and an export error never reaches a user.
- On shutdown the queue is flushed once.
- `/api/health?deep=1` reports `otel`: on or off, the destinations by name only, and the spans sent, dropped and
  failed.

### Testing the app's AI with them
`node scripts/ai-trace.mjs` runs a fixed set of shop questions through the assistant of a fresh demo shop, with the
engines the environment sets (the books engine always). Each run becomes a trace with:
- the expected intent or tool;
- whether it was met;
- the tags `eval` and `pass` or `fail`, which Langfuse, Traceloop and AgentOps can filter on.

With `--stub` it sends to a local collector instead and prints what arrived. That is how this release checks it without
anyone's keys.

## Acceptance
- **Protobuf:** a decoder in the tests reads back what the encoder wrote:
  - resource, scope and span fields;
  - 16- and 8-byte ids;
  - times in nanoseconds;
  - string, int, double, bool and array attributes;
  - status and events.
- **Destinations from the environment:**
  - Langfuse's Basic header and ingestion version;
  - Traceloop's Bearer;
  - AgentOps' token exchange, a renewed token after a 401, and the Bearer;
  - the generic endpoint with its headers;
  - with nothing set, the tracer is off and costs nothing.
- **Through the real gateway and assistant, against stub models and a stub collector:** a question with a tool call
  gives the parent `assistant` span with its `chat` and `execute_tool` children in one trace, with the tokens, the
  model, the provider and the tool name.
- **Privacy:**
  - by default no question text, mobile or amount from the conversation is in the exported bytes;
  - with content on, the mobile is masked even for the shop's own model;
  - no key or header value of a model call is ever exported.
- **Failure:** a collector that is down, slow or returns 500 changes nothing for the user. The span is counted as failed
  and the queue stays bounded.
- **Health:** `/api/health?deep=1` shows `otel` without any secret.
- **The trace check:** `scripts/ai-trace.mjs --stub` runs and every question arrives as a trace.
- `npm run gate` passes.

## Constraints
- No runtime dependency. No key in the repository, a test or a log. The owner sets the keys on the host.
- The accounting logic is not touched.
- The gateway's behaviour (timeout, retry, circuit, metering) is unchanged; the span only watches it.
- Export is opt-in by environment and is off in tests unless a test turns it on.

## Verification
- `tests/otel.test.mjs`.
- `node scripts/ai-trace.mjs --stub`.
- `npm run gate`.
- The deep health check on the live service after deploy (it should read `otel: off` until the owner adds keys).

## Results
- **`tests/otel.test.mjs`, 6 tests, all passing:**
  - the protobuf read back field by field;
  - the four destinations, including the AgentOps token bought again after a 401;
  - one question as one trace: the `assistant` span, two `chat local-accounting` spans with 50/7 and 90/12 tokens,
    `execute_tool find_parties`, and an `eval` joined to it by `trace.otel`;
  - by default no question text, mobile, amount, key or `Bearer` in the exported bytes;
  - with content on, `0912***4567` in place of the mobile, even for the shop's own model;
  - a dead, a 500 and a hanging collector: the answer is unchanged, there is one retry and then 4 spans fail, and
    the queue holds at 5 with 3 dropped;
  - a failed model call: its span reads error `503`, 2 attempts, provider `openai` and a `retry` event, and the key
    is not in the export;
  - `/api/health?deep=1` reads `otel: off`.
- **`node scripts/ai-trace.mjs --stub`:**
  - 9 / 9 questions pass. Eight read the right intent (56–100% confidence), and the injection is flagged.
  - 18 spans arrive in one OTLP protobuf request on `/v1/traces`, and no trace is missing.
  - Without any destination the script stops with exit 2 and names the variables.
- **Gate:** `npm run gate` passes, 486 / 486.
  - The first run failed the POS bridge's six tests: PowerShell did not start within the test's 10 s while every test
    file ran at once. Alone they passed 6 / 6 in 10.9 s.
  - The test now waits up to 30 s for the bridge to start; nothing in it is skipped.
- **Not verified here:** sending to the real Langfuse, Traceloop or AgentOps. This session has none of their keys, and
  keys are never taken in chat. The owner adds them on Render, after which the deep health shows the destinations and
  their counts.
- **The least certain path is AgentOps.** It follows its SDK's source, not a documented API. If AgentOps changes it,
  `BEATRIS_OTEL_ENDPOINT` reaches an OpenTelemetry Collector in front of any of them.
