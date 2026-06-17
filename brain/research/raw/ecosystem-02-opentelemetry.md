---
title: "canary ecosystem research — OpenTelemetry (traces/metrics/logs, semconv)"
type: research
created: 2026-06-16
tags: [canary, observability, opentelemetry, otel, semconv, genai, traces, metrics, logs]
researcher: ecosystem (CP123 Wave-R)
---

# 02 — OpenTelemetry: the vendor-neutral substrate

OTel is the *protocol layer* canary should emit in so it isn't locked to Sentry/Grafana/
Datadog. It defines three signals — **traces, metrics, logs** — plus **semantic conventions**
(standard attribute names) so that `http.request.method` means the same thing everywhere.

## 2.1 Current versions (verified via `gh api`, 2026-06-16)

The **semantic-conventions** repo (separate from the SDKs) release cadence — verbatim from
`gh api repos/open-telemetry/semantic-conventions/releases` (2026-06-16):

| Version | Released | Notes |
| --- | --- | --- |
| **v1.42.0** | **2026-06-12** | **GenAI conventions DEPRECATED + MOVED out** (see §2.3) |
| v1.41.1 | 2026-05-11 | patch |
| v1.41.0 | 2026-04-28 | GenAI: exception event, reasoning tokens, streaming, TTFC (see §2.3) |
| v1.40.0 | 2026-02-19 | GenAI: cache token attrs, retrieval spans, provider normalization |
| v1.39.0 | 2026-01-12 | |
| v1.38.0 | 2025-10-29 | |
| v1.36.0 | 2025-07-05 | **transition baseline** for GenAI stability opt-in |

The OTLP protocol + SDK component versions (collector, language SDKs) version independently.
[GAP: I did not pull per-language SDK (`@opentelemetry/sdk-node`, etc.) exact versions from
primary release pages this pass — semconv is the canary-relevant one and IS verified.]

## 2.2 The HTTP/general attributes canary cares about (stable)

The general, **stable** conventions (not GenAI) are the meat for app-health:
- **HTTP server**: `http.request.method`, `http.response.status_code`, `http.route`,
  `url.path`, `server.address`, `error.type`. Metric: `http.server.request.duration` (a
  histogram — this is your p50/p95/p99 latency source).
- **Errors**: `error.type` (stable) is the canonical error-classification attribute on spans and
  metrics. An exception is recorded as a span **event** named `exception` with
  `exception.type` / `exception.message` / `exception.stacktrace`.
- **Service identity**: `service.name`, `service.version`, `service.namespace`,
  `deployment.environment.name` (renamed from `deployment.environment`, a known migration
  gotcha).

These map directly onto the in-house `runs.jsonl` schema (see ecosystem-00): `actor`→
`service.name`, `action`→span name / `event.name`, `ts`→span start, `durationMs`→span duration.

## 2.3 GenAI semconv — THE June-2026 currency event (boundary-critical)

This is the single most important fresh finding for the canary/agentmoney boundary.

**As of v1.42.0 (2026-06-12), ALL `gen_ai.*` attributes, metrics, events, and spans were
DEPRECATED in the main semantic-conventions repo and MOVED to a dedicated repository:
`github.com/open-telemetry/semantic-conventions-genai`.** (Verified: WebFetch of
github.com/open-telemetry/semantic-conventions/releases 2026-06-16, verbatim "All `gen_ai.*`
attributes, metrics, events, and spans have been deprecated and moved to the dedicated
OpenTelemetry GenAI Semantic Conventions Repository"; new repo confirmed live via
`gh api repos/open-telemetry/semantic-conventions-genai` → 72 stars, pushed 2026-06-17.)

**Status: still DEVELOPMENT (not stable).** Greptime blog (2026-05-09,
greptime.com/blogs/2026-05-09-opentelemetry-genai-semantic-conventions) and the OTel docs both
confirm GenAI + MCP conventions remain in *Development* status as of May 2026. Stability opt-in
is via env var `OTEL_SEMCONV_STABILITY_OPT_IN=gen_ai_latest_experimental`; v1.36.0 is the
transition baseline (old format by default).

### v1.41.0 GenAI additions (2026-04-28) — note which side of the boundary each lands on:

From WebFetch of the releases page (2026-06-16):
- `gen_ai.usage.reasoning.output_tokens` — **agentmoney** (token/cost).
- **`gen_ai.client.operation.exception`** event (for API errors and timeouts) — **CANARY**
  (this is an *app-health error event* — an Anthropic 529 / a tool-call timeout). This is the
  cleanest possible proof of the boundary: OTel itself now has a dedicated GenAI *error/timeout*
  event distinct from the token-usage metrics.
- `gen_ai.client.operation.time_to_first_chunk` + `gen_ai.client.operation.time_per_output_chunk`
  metrics — **CANARY** (latency/responsiveness).
- `gen_ai.request.stream`, `gen_ai.response.time_to_first_chunk` — **CANARY** (latency).
- split `invoke_agent` into separate client + internal spans — structural.

### The canonical canary-vs-agentmoney attribute split (on the SAME GenAI span)

| Attribute / metric | Owner | Why |
| --- | --- | --- |
| `gen_ai.client.operation.duration` (metric) | **canary** | latency histogram (p50/p95/p99) |
| `gen_ai.client.operation.exception` (event) | **canary** | LLM API error / timeout (529, 5xx) |
| `gen_ai.client.operation.time_to_first_chunk` | **canary** | responsiveness |
| `error.type` on the span | **canary** | did the call fail |
| `gen_ai.usage.input_tokens` | **agentmoney** | cost input |
| `gen_ai.usage.output_tokens` | **agentmoney** | cost output |
| `gen_ai.usage.reasoning.output_tokens` | **agentmoney** | cost (reasoning) |
| cache token attrs (v1.40.0) | **agentmoney** | cost (cache savings) |
| `gen_ai.request.model` / `.response.model` | shared tag | both project it |

This is the natural handoff: **one OTel span is emitted; canary reads the
duration/exception/error attributes, agentmoney reads the token/usage attributes.** They never
fight because OTel already drew the line for us. (Corroborates ecosystem-00 §boundary.)

## 2.4 Span types now defined for agents (the agentic-observability frontier)

GenAI semconv (now in the dedicated repo) defines: **model/inference spans** (the raw LLM call),
**agent spans** (`invoke_agent`, split client+internal as of v1.41), **tool spans** (`execute_tool`
— with span-naming rules tweaked in the Apr–May 2026 changelog), **workflow spans**, and
**retrieval spans** (added v1.40.0, for RAG). Sources: opentelemetry.io/docs/specs/semconv/
gen-ai/gen-ai-agent-spans/ + gen-ai-spans/ (WebSearch 2026-06-16); greptime blog 2026-05-09.

For canary this matters because the fleet's products ARE agents — so canary monitoring "is the
app healthy?" increasingly means reading agent/tool spans (did the tool call error? how long did
the agent loop take?) not just HTTP spans.

## 2.5 OTel for AN AGENT operating it

- **Collector** is the deployment workhorse: the OTel Collector (otelcol) receives OTLP, batches,
  and exports to any backend (Sentry, Grafana/Tempo, Datadog, etc.). An agent configuring obs
  edits `otel-collector-config.yaml` (receivers → processors → exporters). This is the
  vendor-neutral seam that lets canary stay backend-agnostic.
- **OTLP** (gRPC :4317 / HTTP :4318) is the wire protocol. Env-driven config:
  `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_SERVICE_NAME`, `OTEL_RESOURCE_ATTRIBUTES`,
  `OTEL_TRACES_SAMPLER`. An agent can stand up instrumentation with zero code via
  `OTEL_*` env vars + the language auto-instrumentation agent (e.g. `opentelemetry-instrument`
  for Python, the `--require @opentelemetry/auto-instrumentations-node/register` for Node).
- **No first-party "OTel MCP" of note** — OTel is consumed *through* the backend's MCP (Sentry
  MCP, Grafana MCP — see ecosystem-09). The agent's leverage point is the Collector config + env
  vars, both deterministic and greppable.
- **Gotcha for agents:** `gen_ai.*` instrumentation pinned to a pre-1.42 semconv version will
  keep emitting the *old* attribute names; an agent reading telemetry must know which semconv
  version produced it (check `OTEL_SEMCONV_STABILITY_OPT_IN`). Cross-version attribute drift is
  the silent breakage.

## Sources
- `gh api repos/open-telemetry/semantic-conventions/releases` (2026-06-16) — version table.
- `gh api repos/open-telemetry/semantic-conventions-genai` (2026-06-16) — new repo confirmed.
- WebFetch github.com/open-telemetry/semantic-conventions/releases (2026-06-16) — v1.42.0 move,
  v1.41.0 GenAI additions verbatim.
- greptime.com/blogs/2026-05-09-opentelemetry-genai-semantic-conventions (2026-05-09) — GenAI +
  MCP still Development; v1.41 span/metric coverage; v1.36 transition baseline.
- opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-agent-spans/ + /gen-ai-spans/ (WebSearch
  2026-06-16) — span type definitions.
- opentelemetry.io/blog/2026/genai-observability/ (linked) — GenAI observability narrative.
- Internal corroboration: ecosystem-00 boundary section, `energy/logs/runs.jsonl` schema.
