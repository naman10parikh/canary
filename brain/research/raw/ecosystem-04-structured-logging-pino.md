---
title: "canary ecosystem research — structured logging (pino)"
type: research
created: 2026-06-16
tags: [canary, observability, logging, pino, structured-logs, redaction, otel-correlation]
researcher: ecosystem (CP123 Wave-R)
---

# 04 — Structured logging with pino

Logs are the third OTel signal and the substrate canary's own `runs.jsonl`-style trail already
emits by hand (JSON to stdout). **pino is the canonical Node logger** for this; it embodies the
"structured-from-birth, JSON to stdout" philosophy that ecosystem-00 noted runs.jsonl follows
manually.

## 4.1 Version (verified via `gh api`, 2026-06-16)

**pino v10.3.1 (2026-02-09)** is the current release. 10.x line shipped through H1 2026 (v10.1.1
Jan 9 → v10.2.0 Jan 14 → v10.3.0 Jan 23 → v10.3.1 Feb 9). Repo: **pinojs/pino, 17,941★, pushed
2026-06-12** — extremely active and the de-facto standard. (`gh api repos/pinojs/pino` +
`/releases`, 2026-06-16.)

## 4.2 Why pino (the load-bearing properties)

- **High throughput, low overhead:** ~10,000+ logs/sec, asynchronous transports via **worker
  threads** so logging doesn't block the event loop. (signoz.io/guides/pino-logger…, 2026.)
- **Structured JSON output** = machine-parseable, the same shape as `runs.jsonl`. No regex
  parsing downstream — query/filter/correlate directly.
- **Child loggers** — `logger.child({ requestId })` attaches request-scoped context to every line
  in that request. This is the correlation primitive.
- **Native framework integration:** `pino-http` for Express/Fastify, NestJS adapters.

## 4.3 THE security gotcha — redaction (canary must enforce this)

pino has **built-in redaction**: `redact: ['req.headers.authorization', 'req.headers.cookie',
'*.password', '*.token']` with a custom censor (`'[REDACTED]'`). **Without this, auth tokens,
cookies, and passwords leak into logs** — a GDPR/security incident. (signoz.io/guides/pino-logger…
and dev.to/francoislp/nodejs-best-practices-redacting-secrets…, 2026.) This directly mirrors the
energy rule `browser-agent-security.md` Rule 12 ("Audit log must not include URL query params" —
strip tokens before writing). **canary's logging guidance MUST require pino redaction paths.**

## 4.4 THE flow that matters — pino ↔ OpenTelemetry trace correlation

This is the load-bearing integration (and the canary/agentmoney seam point): make every log line
carry the active `traceId`/`spanId` so a log can jump to its trace.

Two distinct mechanisms (don't conflate them):
1. **`@opentelemetry/instrumentation-pino`** — auto-injects the active trace context into every
   log entry (log↔trace correlation) AND can forward logs to the OTel Logs SDK.
2. **`pino-opentelemetry-transport`** — a pino *transport* (worker-thread) that ships logs to an
   OTLP endpoint **asynchronously, without blocking the event loop**. Use this for the *export*
   leg; use the instrumentation for the *correlation* leg.

(Sources: medium.com/@hadiyolworld007/node-js-structured-logging-with-pino-opentelemetry…, 2026;
dev.to/1xapi/how-to-add-structured-logging-to-nodejs-apis-with-pino-9-opentelemetry-2026-guide;
1xapi.com/blog/structured-logging-nodejs-pino-opentelemetry-2026.)

## 4.5 Taste — logs vs traces (a real design opinion, not a feature list)

Strong, repeated 2026 guidance: **"Request-level details like method, path, status code, and
duration are better captured in traces than in logs"** — if distributed tracing is in place, the
span already carries this. So logs should be for *events with context an agent will grep*, not a
duplicate of HTTP access logs. (signoz.io/guides/pino-logger…, 2026.) For canary this means:
emit the runs.jsonl-style *event* trail (what happened, by whom, when) as logs; push
latency/status to spans/metrics. Don't double-emit.

## 4.6 What an AGENT operating logging needs

- **Emit JSON to stdout, let the platform collect it.** pino's default (stdout JSON) is exactly
  the 12-factor / container-native pattern. Don't write log files from the app.
- **`runs.jsonl` is canary's hand-rolled pino.** The clean refactor: replace ad-hoc JSON appends
  with a pino logger configured to emit the same `{ts,actor,action,...}` shape, gaining redaction
  + transports + trace correlation for free. (See ecosystem-00 for the schema mapping.)
- **No pino "MCP server"** — logging is a write-path library, not a queryable service. The query
  side is the log backend (Better Stack, Grafana Loki, SigNoz) whose MCP/API an agent uses.
- **Pretty-print only in dev** (`pino-pretty`) — never in prod (it's slow + breaks JSON parsing).
  A common "why are my prod logs unparseable" footgun.

## Sources
- `gh api repos/pinojs/pino` + `/releases` (2026-06-16) — v10.3.1, 17.9k★, release cadence.
- signoz.io/guides/pino-logger-nodejs-logging-library/ (2026) — throughput, child loggers,
  redaction, logs-vs-traces taste.
- dev.to/francoislp/nodejs-best-practices-redacting-secrets-from-your-pino-logs (2026) — redaction.
- medium.com/@hadiyolworld007/node-js-structured-logging-with-pino-opentelemetry… +
  dev.to/1xapi/how-to-add-structured-logging-to-nodejs-apis-with-pino-9-opentelemetry-2026-guide +
  1xapi.com/blog/structured-logging-nodejs-pino-opentelemetry-2026 (2026) — OTel correlation
  via instrumentation-pino + pino-opentelemetry-transport.
- Internal corroboration: `energy/logs/runs.jsonl` schema (ecosystem-00),
  `.claude/rules/browser-agent-security.md` Rule 12 (token stripping in audit logs).
