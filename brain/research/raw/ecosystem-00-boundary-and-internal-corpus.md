---
title: "canary ecosystem research — boundary + internal corpus"
type: research
created: 2026-06-16
tags: [canary, observability, boundary, agentmoney, runs-jsonl]
researcher: ecosystem (CP123 Wave-R)
---

# 00 — Boundary, scope, and internal-corpus quotes

This is the anchor file. It pins WHAT canary owns vs. what its siblings own, and
quotes the three internal read-only references the mission named. All other
`ecosystem-*.md` files in this dir build on this.

## canary's domain (from skeleton)

`~/canary/CLAUDE.md` — "Forged from Energy via harness-forge (CP103). One repo =
one recursively self-improving agent-native harness." The `What this is` paragraph is still a
`TODO` in the skeleton. The fleet brief defines canary as the **Errors / uptime / app
observability domain-expert employee**. The 12-component harness formula it inherits:
`identity/ · memory/ + brain/ · tools/ · skills/ + .claude/skills · hooks/ + .claude/hooks ·
.claude/agents · .mcp.json · src/backend (dispatch+sandbox) · eval/`.

## THE BOUNDARY — canary (app health) vs agentmoney (cost/token obs)

This is the single most load-bearing scoping decision, and the mission states it explicitly:
**"app health/errors; cost/token observability is agentmoney's, not canary's."**

Direct quote from the sibling repo `~/agentmoney/README.md`:

> "**Stop guessing what AI costs you.** Real-time cost monitoring for Claude, OpenAI, and
> Gemini APIs. You run Claude Code overnight. You wake up. Your API bill is $247. You have no
> idea which session burned it, which model was used, or whether prompt caching saved you
> anything. agentmoney shows you exactly where every dollar goes."

agentmoney's mechanism (from its README quick-start): a **proxy** you point your API client at
(`ANTHROPIC_BASE_URL=http://localhost:8999`), a `calc` command for per-call $ math, a `models`
pricing table, and a `--alert 5.00` dollar threshold. Its unit of measurement is **dollars,
tokens, models, cache-hit-rate**.

**Drawn boundary (this is canary's north star):**

| Concern | Owner | Unit of measurement |
| --- | --- | --- |
| Did the app throw an exception? | **canary** | error events, issue groups, stack traces |
| Is the endpoint up / fast? | **canary** | uptime %, p50/p95/p99 latency, Apdex |
| Did the deploy regress crash-free sessions? | **canary** | release health, crash-free-users % |
| Are we within the latency/availability SLO? | **canary** | error-budget burn rate |
| Who got paged and did they ack? | **canary** | incident MTTA/MTTR |
| Did that LLM call cost $0.04 or $0.40? | **agentmoney** | $/call, $/session |
| Is prompt caching saving money? | **agentmoney** | cache-read tokens, $ saved |
| Which model burned the overnight budget? | **agentmoney** | $/model |

**The fuzzy seam (call it explicitly so the two harnesses don't fight):** LLM **latency** and
**error rate** are canary's (an Anthropic 529 overloaded error or a 60s tool-call timeout is an
*app health* event). LLM **token spend** is agentmoney's. OpenTelemetry's GenAI semantic
conventions emit BOTH `gen_ai.client.operation.duration` (latency → canary) and
`gen_ai.client.token.usage` / `gen_ai.usage.*_tokens` (tokens → agentmoney) on the same span —
so a shared OTel span is the natural handoff point. canary should read the duration/error
attributes and leave the token/cost attributes to agentmoney. (Source for the attribute split:
OTel GenAI semconv, see ecosystem-02.)

## The runtime append-only trail pattern — `energy/logs/runs.jsonl`

This is the in-house precedent the mission told me to mine. It is **33 lines** of newline-
delimited JSON (JSONL). Every record is one event with a fixed schema. Verbatim head and tail:

```json
{"ts":"2026-06-07T04:29:12.208Z","actor":"claude-code","action":"cp122-energy-cells","model":"opus","durationMs":0,"tokensIn":0,"tokensOut":0,"note":"energy 5-cell close build+test"}
{"ts":"2026-06-14T18:59:21.236Z","actor":"claude-code","action":"session-start","model":"claude-opus-4-8[1m]","durationMs":0,"tokensIn":0,"tokensOut":0,"note":"SessionStart hook"}
```

Schema, field by field:

- `ts` — ISO-8601 UTC timestamp (millisecond precision, `Z` suffix). This is the *event time*.
- `actor` — who/what emitted it (`claude-code`). Maps to OTel `service.name` / a log's `actor`.
- `action` — the event name (`session-start`, `cp122-energy-cells`). Maps to a log `event.name`
  or a span name.
- `model` — context tag (`opus`, `claude-opus-4-8[1m]`). Maps to `gen_ai.request.model`.
- `durationMs` — duration in ms (mostly 0 here = instantaneous markers). Maps to span duration.
- `tokensIn` / `tokensOut` — **these two fields are the agentmoney concern, not canary's.**
  Their presence in the same record is exactly the fuzzy-seam problem above: one append-only
  trail carries both health (`action`,`durationMs`) and cost (`tokensIn/Out`) fields.
- `note` — free-text human context.

**Why this matters for canary's design:**
1. **JSONL append-only is the right primitive for an agent-operated obs trail.** It is
   greppable (`grep '"action":"session-start"'`), tail-able, diff-able, and needs zero schema
   migration. This is the same shape as Sentry's structured-log model (a flat bag of
   attributes + `severity` + `timestamp` + `trace.id`) and OTel's log data model. canary's own
   internal event trail should follow this exact pattern.
2. **It is structured-from-birth.** No regex parsing later. This is the pino philosophy (JSON
   to stdout) applied by hand.
3. **The schema already separates `actor`/`action`/`ts`/`duration` (health) from
   `tokensIn/Out` (cost).** canary inherits the health columns; agentmoney inherits the token
   columns. A clean future refactor: emit ONE OTel-shaped event and let each harness project
   the attributes it owns.

## Checklist Observability section (read-only reference)

The mission cited "checklist Observability section." The canonical Energy harness checklist is
`~/energy/audit/HARNESS-CHECKLIST-2026.md`. There are TWO distinct entries — and the
distinction IS the canary/agentmoney boundary, drawn by the checklist itself:

**(A) The harness "Observability" component (line 33 + §10, lines 171-174)** — owned by
**agentmoney**. Verbatim (read 2026-06-16):
> line 33: "**Observability** — cost, latency, trace per run _(owner: agentmoney)_"
> §10 "Observability ... **Done =** token/cost per run (agentmoney proxy or equivalent); logs
> include model + duration + tool calls; append-only audit trail for any financial/state-mutating
> action."

**(B) The product-side "Error / crash / uptime monitoring" line (line 75 + §"Error/crash/uptime
monitoring (product-side)", lines 314-318)** — the **GAP canary fills.** Verbatim (read
2026-06-16):
> line 75: "**Error / crash / uptime monitoring** (product-side, ≠ LLM observability) — Sentry /
> Better Stack — **GAP**"
> §314-318: "Distinct from the harness's LLM-trace **Observability** — this is app-level stack
> traces, crashes, uptime, alerts. **Default:** **Sentry** (a Sentry MCP exists). Alts: **Better
> Stack** (uptime + logs), **Highlight.io** (full-stack session replay), **Grafana Cloud**
> (metrics). **GAP.**"
> line 394 (ownership map): "Product · C2 infra | Error/crash monitoring | ❌ **GAP** — no Sentry
> (≠ harness LLM-tracing observability)"

So the checklist explicitly separates **cost/latency/trace-per-run (agentmoney, line 33)** from
**app-level errors/crashes/uptime/alerts (canary's GAP, line 75 + §314-318)** — using the exact
phrase "**≠ LLM observability**." canary owns this product-side GAP for the *fleet* (it is the
domain expert other harnesses consume) while dogfooding it on itself. GAP CLOSED — verbatim text
above.

## Sources
- Internal: `~/canary/CLAUDE.md`, `~/canary/AGENTS.md`,
  `~/canary/brain/MOC - canary.md` (read 2026-06-16)
- Internal: `~/agentmoney/README.md` (read 2026-06-16)
- Internal: `~/energy/logs/runs.jsonl` (33 lines, read 2026-06-16)
- Internal: `~/energy/audit/HARNESS-CHECKLIST-2026.md` lines 33, 75, 171-174, 314-318,
  394 (read + quoted verbatim 2026-06-16) — the agentmoney-vs-canary component split.
- OTel GenAI attribute split corroborated in ecosystem-02 (OTel semconv 1.42.0)
