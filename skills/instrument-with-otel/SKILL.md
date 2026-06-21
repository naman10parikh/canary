---
name: instrument-with-otel
description: Instrument a service ONCE in OpenTelemetry so errors (span exception events), latency (histograms), and uptime all come from one stream. Use when the user says "instrument this", "add observability", "set up tracing/OpenTelemetry", "wire OTel", or "make errors and latency observable". Encodes canary's instrument-once stance and the canary↔agentmoney GenAI-span boundary.
allowed-tools: Bash(canary:*), Bash(node:*), Read, Grep, Edit
---

# instrument-with-otel

> Instrument once, vendor-neutral. One OTel instrumentation feeds Sentry (errors/traces) AND
> Prometheus/Grafana (rates/SLO) — never double-instrument per backend. (OPINIONS **B2**, EXPERTISE
> **JOB 8**, KNOWN-PITFALLS **§9**.)

## Trigger

Invoke when asked to add observability / tracing / OpenTelemetry to a service, or to make a service's
errors + latency surface in a backend. Also the first half of canary's acceptance test
(`canary instrument`).

## Steps

1. **Version-detect first (the meta-pitfall §0).** A check correct for one SDK major is wrong for the
   next. Read the deps: `grep -E '@sentry/|@opentelemetry/' package.json`. Note the `@sentry/*` major
   (v9 removed `autoSessionTracking` and `enableTracing` — §3.1/§1b.3) and the OTel semconv version.
2. **Run the employee.** `canary instrument <dir> --otlp <endpoint> [--sentry] --json`. Default OTLP
   target is a **local** file/in-memory exporter ($0, no creds) so the gate runs offline; `--sentry`
   adds the bundler-plugin/source-map path. The command writes the OTel bootstrap so a thrown error →
   span `exception` event + `error.type`, and latency → `http.server.request.duration` histogram.
3. **Use the correct, current attribute names (§9.2).** `deployment.environment` was renamed to
   **`deployment.environment.name`** — emit the new name. Set `service.name` and `service.version`.
4. **For an LLM app, honor the boundary (JOB 0 — the load-bearing seam).** OTel GenAI spans carry BOTH
   latency/exception attrs (canary's) and token attrs (agentmoney's). canary reads
   `gen_ai.client.operation.duration` / `gen_ai.client.operation.exception` / `error.type` and **STOPS
   at `gen_ai.usage.*`** — never emit or read a token/cost metric here (that is agentmoney's). Both read
   disjoint attrs off the SAME span, shared tag `gen_ai.request.model`. Use OpenLLMetry (`traceloop`) to
   auto-emit both attr sets; mind the **v1.42 semconv `gen_ai.*` repo split (2026-06-12)** — pinned
   pre-v1.42 instrumentation emits OLD attribute names (§9.1).
5. **Treat enabling instrumentation as a VERIFY-AFTER action (OPINIONS D4, §9.3).** Instrumentation is
   not free and can crash the app it watches (Sentry Vue 100% CPU #2957; OTel Promise leaks #3030).
   After wiring, watch memory/CPU and crash-free rate — don't fire-and-forget.
6. **Confirm capture.** Boot the service, hit a throwing route, and assert a span with an `exception`
   event lands in the local collector (this is what `eval/boot-and-throw.mjs` does in CI).

## Output

- The OTel bootstrap wired into the target service (`canary instrument` emits `{ wired: [...],
  spanProof }` under `--json`).
- A thrown error surfaces as a span `exception` event (`exception.type`/`.message`/`.stacktrace`) +
  `error.type`; latency surfaces as an `http.server.request.duration` histogram (report **p50+p99**, not
  avg — OPINIONS B4).
- For LLM apps: latency/exception attrs only — **zero** `gen_ai.usage.*` reads (the agentmoney seam held).
- A one-line note of the SDK major detected and any version-specific branch taken.

**Refuses:** double-instrumenting per backend; using the old `deployment.environment` attr; reading any
token/cost attribute (that crosses into agentmoney).
