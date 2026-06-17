---
title: "canary EXPERTISE MAP — everything the errors/uptime/observability employee must master"
type: brain
status: active
created: 2026-06-16
tags: [canary, observability, expertise-map, jobs-to-be-done, errors, uptime, slo, release-health]
source: brain/research/raw/ecosystem-00..14, brain/research/raw/field-00..07
related: ["[[TOOL-MATRIX]]", "[[BATTLE-TESTED-SCENARIOS]]", "[[KNOWN-PITFALLS]]", "[[OPINIONS]]", "[[GAPS-AND-DISPUTES]]", "[[MOC - canary]]"]
---

# canary Expertise Map

> **Who canary is.** The fleet's **app health / errors / uptime / observability** domain-expert
> employee. canary answers: *did the app throw? is it up/fast? did the deploy regress? are we within
> SLO? who got paged and did they ack?* It does this **as an agent** (MCP/CLI/API), not a human at a
> dashboard, and it **dogfoods** its own pattern (its internal trail is `runs.jsonl`-shaped).
>
> This map is organized by **job-to-be-done**, not by tool — because the senior move is to pick the
> tool from the question (`field-04`, `field-06`), not start from a vendor. Every node cites the raw
> file it traces to. Read [[TOOL-MATRIX]] for the per-tool detail and the agent-access surface.

## 0. The single most load-bearing fact: THE BOUNDARY (canary vs agentmoney)

`ecosystem-00`, `field-00`. This scoping decision precedes everything.

| Concern | Owner | Unit |
| --- | --- | --- |
| Did the app throw an exception? what stack trace? | **canary** | error events, issue groups, traces |
| Is the endpoint up / fast? | **canary** | uptime %, p50/p95/p99, Apdex |
| Did the deploy regress crash-free sessions? | **canary** | release health, crash-free-users % |
| Are we within the latency/availability SLO? | **canary** | error-budget burn rate |
| Who got paged and did they ack? | **canary** | MTTA / MTTR |
| Did that LLM call cost $0.04 or $0.40? | **agentmoney** | $/call, $/session |
| Is prompt caching saving money? | **agentmoney** | cache-read tokens, $ saved |
| Which model burned the overnight budget? | **agentmoney** | $/model |

**The fuzzy seam, stated so the two harnesses never fight (`ecosystem-00`, `ecosystem-02 §2.3`):**
LLM **latency + errors** are canary's; LLM **token spend** is agentmoney's. They read **disjoint
attribute sets off the SAME OpenTelemetry GenAI span** —
- canary reads: `gen_ai.client.operation.duration` (latency histogram), `gen_ai.client.operation.exception` (the LLM API-error/timeout event, e.g. an Anthropic 529), `error.type`, `gen_ai.client.operation.time_to_first_chunk`.
- agentmoney reads: `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens`, `gen_ai.usage.reasoning.output_tokens`, cache-token attrs.
- shared tag: `gen_ai.request.model`.

The boundary is also a **load-shedding** decision (`field-00`, `field-03 §03.5`): LLM pipelines emit
**10–50× the telemetry** of a normal service; if both harnesses ingested the whole firehose each
would drown. The split is the noise-control mechanism. (Cross-checked against the Energy
`audit/HARNESS-CHECKLIST-2026.md`: line 33 "Observability — cost/latency/trace per run *(owner:
agentmoney)*" vs line 75 "Error/crash/uptime monitoring (product-side, ≠ LLM observability) — **GAP**"
which canary fills. `ecosystem-00`.)

---

## JOB 1 — "Did the app throw? What's the stack trace? What's the root cause?"

The errors/exceptions pillar. **Default tool: Sentry** (Energy checklist default; has a first-party
MCP + the best AI-debugging). `ecosystem-01`, `ecosystem-08`, `ecosystem-09`.

### 1.1 What Sentry is in mid-2026 (`ecosystem-01 §1.1`)
Not "just error tracking." One product spanning: Error Monitoring · Tracing (distributed traces +
spans) · Logs · Session Replay · Profiling · Uptime · Cron monitoring · Release Health. Seer reads
across all of them.

### 1.2 The issue/event/grouping model (`ecosystem-09 §9.2`)
An agent triages **issue groups** (fingerprinted), not raw events. Core MCP workflow tools:
`search-issues` → `get-issue-details` (stack trace) → `update-issue` (resolve/ignore/assign) →
`add-issue-note`. Deep diagnosis: `search-events`, `get-trace-details`, `get-replay-details`,
`get-profile`.

### 1.3 Source maps — THE #1 footgun, upstream of everything (`ecosystem-08`, `ecosystem-01 §1.4`)
Without a correctly uploaded + correctly matched source map, every JS stack trace is minified
garbage (`a.b.c is not a function at chunk-7f3a.js:1:24601`). **Modern model = Debug IDs**, not
legacy release+path: a unique ID injected into BOTH the bundle and the source map, matched at
symbolication time (no path/release dependency). Get it via bundler plugin
(`@sentry/webpack-plugin` / `vite-plugin` / `esbuild-plugin`) or `sentry-cli sourcemaps inject` →
`upload` (**inject before upload before deploy** — order is load-bearing). **Source maps are upstream
of the entire AI-debugging value chain** — Seer reads the stack trace; if it's minified, the AI
root-cause is garbage too. See [[KNOWN-PITFALLS]] §1 for the seven named failure modes + version
cutoffs.

### 1.4 AI root-cause: Sentry Seer (`ecosystem-01 §1.2`, `ecosystem-09 §9.2`)
**Seer is GA (Jan 2026), $40/active-contributor/mo flat-unlimited** (an "active contributor" = anyone
who commits ≥2 PRs in a connected repo that month). Capabilities: Issue Scan (triage — *billed
per-run*), Autofix/Issue Fix (drafts a **PR**), Seer Agent (NL debugging over the full stack), AI
Code Review (reviews PRs against real prod failure patterns). The agent surface is the single MCP
tool **`analyze-issue-with-seer`**. Requires the GitHub integration connected to write a fix PR;
**feature-detect it** (can be `--disable-skills=seer`'d, may be absent on self-hosted). `ecosystem-09 §9.2`.

### 1.5 Errors as OTel (the vendor-neutral form) (`ecosystem-02 §2.2`)
An exception is a span **event** named `exception` with `exception.type`/`.message`/`.stacktrace`;
`error.type` is the stable error-classification attribute on spans + metrics. This is what lets the
same instrumentation feed Sentry AND Prometheus error-rate.

### 1.6 Init/config hygiene — the "nothing shows up" / "silent in prod" knobs (`ecosystem-01 §1.4`)
Three `Sentry.init` knobs cause most "where are my events?" tickets, and **the absence of data looks
identical whether you're healthy or misconfigured**: (1) wrong `environment` → events arrive but the
dashboard filter hides them; (2) **browser events eaten by ad-blockers** unless `tunnel` routes them
through your domain — the classic "works locally, silent in prod" (the more privacy-conscious your
users, the blinder you are); (3) `tracesSampleRate: 1.0` in prod → blows the 2026 **Spans** quota (the
cost lever is spans-quota + Spike Protection + dynamic sampling, NOT one forgotten sample rate —
`field-07 §07.6`). See [[KNOWN-PITFALLS]] §1b + [[BATTLE-TESTED-SCENARIOS]] S17.

### 1.7 The absence-of-signal blind spot: cron / scheduled-job check-ins (`ecosystem-01 §1.1`, `ecosystem-09 §9.2`)
Error/uptime monitoring catches what *throws*; it is **structurally blind to a job that silently stops
running** (dead scheduler, un-redeployed container, hung consumer) — that failure IS the *absence* of an
expected event, so no error/log/metric fires. The one monitoring class that catches it is a **cron
check-in / dead-man's-switch** (Sentry Cron monitoring; MCP `find-monitors`/`get-monitor-details`) that
pages on a **missed** check-in. canary's own HEARTBEAT loop should self-monitor this way. See
[[BATTLE-TESTED-SCENARIOS]] S18.

---

## JOB 2 — "Is the endpoint up? Is the checkout/user flow working? What's the p95?"

The availability + synthetic pillar. **Default tool: Checkly** (most agent-native: monitoring-as-code
+ installable skill). `ecosystem-03`, `ecosystem-12`.

### 2.1 The three tools, by job (`ecosystem-03 §3.1`)
- **Checkly** — Monitoring-as-Code: `ApiCheck` + `BrowserCheck` (a plain `@playwright/test`
  `.spec.ts`, **no proprietary DSL**) + `MultiStepCheck`, all TS in Git. The agent-native pick.
- **UptimeRobot** — cheapest "is it up" ping (50 free monitors) BUT no JS/SPA checks and **free tier
  = non-commercial only** (2025 ToS) — a fleet product on free tier is out of compliance.
- **Better Stack** — one platform: uptime + logs + on-call (Responders +$29/mo each).

### 2.2 Why monitoring-as-code is the agent move (`ecosystem-03 §3.2/§3.4`, `ecosystem-12`)
An agent **reads and writes** `.spec.ts` checks natively, runs `npx checkly test` to validate, and
`npx checkly deploy` — deterministic, reviewable, snap-back-able (fits canary's commit-convention
model). Checkly ships an **installable agent skill** (`npx skills add checkly/checkly-cli`) that
teaches the agent to author checks — arguably better than an MCP. The `@playwright/test` substrate is
**shared** with the energy harness's `playwright-cli`/`playwright-test` skills — reuse, don't
reinvent.

### 2.3 Latency math is JOB 5's; uptime % is here.
"What's the p95 trend" is a numeric-time-series question → Prometheus (JOB 5). "Is the endpoint
responding 200 right now / is the login flow passing" → Checkly synthetic. Don't conflate.

---

## JOB 3 — "Did the deploy regress? Should we roll back?"

The release-health pillar. **Tool: Sentry Release Health.** Units: crash-free-sessions %,
crash-free-users %, adoption %. `ecosystem-10`.

### 3.1 Built on SESSIONS, not errors (`ecosystem-10 §10.1`)
A session ends in a state: `ok` · `exited` · `crashed` · `abnormal` (force-quit/OS-killed) ·
`unhandled` (error but process survived). **Every crashed/abnormal session is also errored, but an
errored session is not necessarily crashed** — which is why **crash-free rate ≠ error-free rate**.
- crash-free **sessions** = `(sessions − crashed)/total` (sensitive to crash *frequency*).
- crash-free **users** = `(users − users_with_a_crash)/total` (the honest *user-impact* metric — one
  user crashing 50× is one unhappy user, not 50). canary reports both, knows which to trust per Q.

### 3.2 Two session modes — a critical boundary (`ecosystem-10 §10.2`)
- **application-mode** (mobile/desktop/CLI/**browser**): one session = one app run. Release health is
  most meaningful here ("crashed" = the app actually died on a device).
- **request-mode** (backend): each HTTP request is a session → "crash-free sessions" ≈ success rate,
  overlapping the SLO view. **For the Energy fleet (web + agent backends): use release health for the
  client/browser deploy-regression view, SLO burn-rate (JOB 6) for the backend availability view —
  don't double-count.**

### 3.3 The rollback gate + adoption weighting (`ecosystem-10 §10.4`)
A new release whose crash-free-users rate drops below the prior release's → roll back. **But weight
by adoption/session count** — a release with 12 sessions has a noisy rate; don't roll back a beta on
3 sessions. Read both crash-free-rate AND adoption %.

### 3.4 The version-branch every agent must do here → see [[KNOWN-PITFALLS]] §3
The old `autoSessionTracking` flag was **removed in Sentry SDK v9** (current line is v10). On v9+ the
check is `browserSessionIntegration()` / `httpIntegration`, not the flag. `ecosystem-14 §14.4`.

---

## JOB 4 — "What happened, by whom, when?" (the structured trail / logs)

The logging pillar. **Tool: pino** (JSON-to-stdout). canary's own internal trail is the hand-rolled
version of this: `runs.jsonl`. `ecosystem-04`, `ecosystem-00`, `field-00`.

### 4.1 Why pino (`ecosystem-04 §4.2`)
Structured JSON to stdout (machine-parseable, no regex parsing downstream), high throughput
(~10k+/sec via worker-thread transports so logging doesn't block the event loop), child loggers
(`logger.child({ requestId })` = the correlation primitive), `pino-http` for Express/Fastify.

### 4.2 Redaction is mandatory (`ecosystem-04 §4.3`)
`redact: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.token']` with a censor.
**Without it, auth tokens/cookies/passwords leak into logs** — a security/GDPR incident. Mirrors the
Energy `browser-agent-security.md` Rule 12 (strip tokens from audit logs). canary's logging guidance
**must** require redaction paths.

### 4.3 pino ↔ OTel trace correlation — two distinct mechanisms (`ecosystem-04 §4.4`)
Don't conflate: `@opentelemetry/instrumentation-pino` injects active `traceId`/`spanId` into every
log line (the **correlation** leg) — vs `pino-opentelemetry-transport`, a worker-thread transport
that ships logs to an OTLP endpoint async (the **export** leg). Use the instrumentation for
correlation, the transport for export.

### 4.4 Taste: logs vs traces — don't double-emit (`ecosystem-04 §4.5`)
"Request-level details like method, path, status, duration are better captured in **traces** than in
logs." If tracing is in place, the span already carries this. Logs = events-with-context an agent
greps (order placed, agent run completed), NOT a duplicate of HTTP access logs.

### 4.5 canary's own trail = `runs.jsonl` (`ecosystem-00`, `field-00`)
33–34 lines of newline-delimited JSON, fixed schema `{ts, actor, action, model, durationMs, tokensIn,
tokensOut, note}`. JSONL-append is the right primitive for an agent-operated obs trail: greppable,
tailable, diffable, zero schema migration. It already separates health columns (`action`/`durationMs`
→ canary) from cost columns (`tokensIn/Out` → agentmoney) — the boundary in microcosm. The field
critique (`field-00`): it's a *log*, not yet a *trace* — add `trace.id` + real measured `durationMs`
(today's are all-zero markers) and it becomes the wide-event substrate [[OPINIONS]] A1 prescribes.

---

## JOB 5 — "What's the latency/error-rate trend? Is something saturating?"

The numeric-time-series pillar. **Tool: Prometheus (+ Grafana for dashboards/alerts).** `ecosystem-05`.

### 5.1 The model + four metric types (`ecosystem-05 §5.3`)
Prometheus is **pull-based** (scrapes `/metrics` on a schedule). **counter** (monotonic — request/
error totals) · **gauge** (point-in-time — memory, queue depth) · **histogram** (latency buckets →
`_bucket`/`_sum`/`_count` → `histogram_quantile()` gives p50/p95/p99) · **summary** (client-side
quantiles, mostly legacy). **Native histograms** (3.x) use auto exponential bucketing → accurate
high-quantile latency without pre-choosing buckets (kills the "my p99 bucket boundary was wrong"
silent error).

### 5.2 The load-bearing PromQL canary must know cold (`ecosystem-05 §5.3`)
- **Error rate:** `rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m])`
- **p95 latency:** `histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))`
- **Burn rate:** see JOB 6.

### 5.3 Dashboards-as-code (`ecosystem-05 §5.5`)
Author dashboards via the **Grafana Foundation SDK** (TS/Go/Python/Java) or Grizzly/jsonnet — in Git,
snap-back-able. **An agent authors dashboards as code, never clicks them.**

### 5.4 When to pick Prometheus/Grafana vs Sentry (`ecosystem-05 §5.6`)
- **Prometheus/Grafana** when the question is *numeric + continuous*: p99 trend, error-rate-per-route
  over 24h, SLO burn, CPU/memory saturation. It owns rates, histograms, saturation.
- **Sentry** when *discrete + diagnostic*: which exception, what stack trace, which release, which
  users. It owns the *event* and the *root cause*; Prometheus only knows the *count* went up.
- **Mature stance:** emit **OTel** so the SAME instrumentation feeds BOTH; Grafana MCP + Sentry MCP =
  two query lenses over one stream. Don't double-instrument.

### 5.5 The latency-measurement shibboleths (read before trusting any p99) (`field-04`)
Three things separate a real latency read from a comforting-but-wrong one — all in [[KNOWN-PITFALLS]] §6:
**(a)** never report `avg` (1,000 fast + 50 slow → avg ~200ms hides the pain) — headline is **p50 + p99 +
the p99/p50 gap** (variance = unreliability, the most informative single signal); **(b)** **never average
percentiles** across instances (`avg(per-pod p99)` is optimistically wrong — aggregate the *histogram*,
then `histogram_quantile()`); **(c)** beware **coordinated omission** (Gil Tene) — a stalled request stalls
the *measurement harness* too, so the backlog the stall caused is never recorded and your p99 is doubly
understated. Under fan-out (an agent's 50 tool calls) your p99 is the user's *median* — watch p99.9
(JOB 13 in [[BATTLE-TESTED-SCENARIOS]], `field-04 §04.4`).

---

## JOB 6 — "Are we within the contract? Page, ticket, or freeze?"

The SLO / error-budget pillar — the math that turns raw metrics into ONE actionable signal. This is
**canary's highest-leverage synthesis output for the fleet.** `ecosystem-07`.

### 6.1 The three terms, precise (`ecosystem-07 §7.1`)
- **SLI** = good events / total events. Availability = `good/total`; **latency SLI is a RATIO**
  ("fraction of requests under 300ms"), **not a raw p99**.
- **SLO** = the target over a window (almost always 28–30 days rolling). "99.9% over 30 days."
- **Error budget = `1 − SLO`.** 99.9% ⇒ 0.1% budget ⇒ **~43.2 min/30 days**. The budget is the
  *permission to fail* — it makes reliability a quantity you spend.

### 6.2 Burn rate (`ecosystem-07 §7.2`)
How fast you're spending the budget vs the rate that exactly exhausts it over the window. 1× = spend
100% over the full window; 14.4× = exhaust a 30-day budget in ~50h. Relationship: **burn rate ×
window / period = budget consumed.**

### 6.3 THE canonical pattern — Multi-Window Multi-Burn-Rate (MWMBR) (`ecosystem-07 §7.3`)
Google SRE Workbook Table 5-8 (verbatim):

| Severity | Long window | Short window | Burn rate | Budget consumed |
| --- | --- | --- | --- | --- |
| **Page** | 1 hour | 5 minutes | **14.4×** | **2%** |
| **Page** | 6 hours | 30 minutes | **6×** | **5%** |
| **Ticket** | 3 days | 6 hours | **1×** | **10%** |

Two ideas make it work: **multi-burn-rate** (fast burn pages, slow burn only tickets — prevents over-
AND under-alerting), and **multi-window** (BOTH windows must breach simultaneously — long window =
precision, **short window = fast reset** so the alert stops firing 5 min after the fix, not an hour).
The PromQL implementation (recording rules + `burn_rate × budget` thresholds) is in
[[BATTLE-TESTED-SCENARIOS]] S6.

### 6.4 The budget is a decision tool, not just an alert (`ecosystem-07 §7.5`)
Budget healthy → ship fast; budget exhausted → **freeze features, fix reliability.** For the fleet
this maps to the snap-back/gate model: a product that's burned its budget shouldn't ship a risky
deploy. canary computes & reports "we've burned 62% of this month's budget; at 3× it exhausts in
4.1 days" — far more actionable than a raw error count.

### 6.5 SLO-rule generators (`ecosystem-14 §14.6`)
Don't hand-write the MWMBR PromQL — generate it. **Sloth** (2,504★, generate-rules-at-CI → static
YAML an agent commits — the cleaner fit for canary's config-as-code model) or **Pyrra** (1,521★,
running operator + UI). ⚠️ `google/slo-generator`'s last *release* is Feb 2024 — reference, not a
fresh dependency. OpenSLO is the portable *spec*, not a tool.

---

## JOB 7 — "Who got paged, did they ack, and did the page actually deliver?"

The incident-routing / on-call pillar. Sits *downstream* of detection. Units: MTTA, MTTR, escalation
depth. `ecosystem-06`, `ecosystem-14 §14.1-§14.2`.

### 7.1 The 2026 landscape — Opsgenie is DEAD, OnCall OSS is DEAD (`ecosystem-06 §6.1`, `ecosystem-14 §14.1`, `field-07`)
- **Opsgenie** — Atlassian stopped new sales Jun 4 2025; full shutdown + **data deletion April 5
  2027.** Never recommend it for anything new. Migration path (JSM + Compass) is widely hated.
- **Grafana OnCall OSS** — **archived 2026-03-24** (repo moved to `grafana-cold-storage/oncall`); "no
  new features"; **Cloud notification bridge severed 2026-03-24** (SMS/phone/push now need
  self-wired Twilio/Pushover). Do NOT recommend self-hosted OnCall OSS. (Subtle: the Grafana MCP's
  OnCall tools still work *if on Grafana Cloud IRM* — the managed product is alive; the OSS one died.)

### 7.2 The live options (`ecosystem-06 §6.2`, `ecosystem-14 §14.2`)
- **PagerDuty** — enterprise default, "closest feature-for-feature" Opsgenie replacement, priciest
  per-seat. **Now has an OFFICIAL MCP** (`PagerDuty/pagerduty-mcp-server`, Apache-2.0, embedded React
  "MCP-Apps" for incident command / on-call management). Route on-call queries through it, not raw REST.
- **incident.io** — whole incident lifecycle (declare → Slack coordinate → roles → post-mortem).
  **Now has an OFFICIAL remote MCP** (March 2026, Streamable-HTTP, `docs.incident.io/ai/remote-mcp`).
- **Grafana Cloud IRM** — if staying in the Grafana ecosystem (queryable via the still-alive Grafana
  MCP OnCall tools).
- **Better Stack** (consolidated) / **Squadcast** (budget).

### 7.3 The load-bearing on-call footguns (`ecosystem-06 §6.3`)
Escalation depth vs fatigue · de-dup by incident key (PagerDuty `dedup_key` — the single most
important field) · `send_resolved` mismatch (page never clears) · schedule gaps/timezone (the 3am
page to an empty schedule) · notification-channel credit exhaustion mid-storm.

### 7.4 An agent's real job here is RESTRAINT, not volume (`ecosystem-06 §6.4`)
An agent that auto-pages on every blip recreates alert fatigue. Right pattern: **triage + enrich**
(correlate the page with the Sentry issue + the burn-rate + a root-cause hypothesis) **before**
escalating to a human — turn a raw page into an actionable one. **Auto-paging is fine; auto-
remediation stays gated behind human approval** (the safety ladder, JOB 9). Measure MTTA/MTTR from
the REST API's created→acked→resolved timestamps and feed them back into self-improvement.

---

## JOB 8 — "Instrument once, stay vendor-neutral" (the substrate)

**OpenTelemetry** is the protocol layer canary emits in so it isn't locked to any backend.
`ecosystem-02`, `ecosystem-14 §14.7`.

### 8.1 Three signals + semantic conventions (`ecosystem-02`)
Traces · metrics · logs, plus **semconv** (standard attribute names so `http.request.method` means
the same everywhere). The general stable attrs canary cares about: `http.request.method`,
`http.response.status_code`, `http.route`, `error.type`, metric `http.server.request.duration`
(histogram → p50/p95/p99). Service identity: `service.name`, `service.version`,
`deployment.environment.name` (renamed from `deployment.environment` — a migration gotcha).

### 8.2 THE June-2026 currency event (`ecosystem-02 §2.3`, `field-07 §07.4`)
**semconv v1.42.0 (2026-06-12) DEPRECATED + MOVED all `gen_ai.*` to a dedicated repo**
(`semantic-conventions-genai`, still *Development* status). An agent reading GenAI telemetry **must
know which semconv version produced it** — attribute namespaces migrated. Stability opt-in:
`OTEL_SEMCONV_STABILITY_OPT_IN=gen_ai_latest_experimental`; v1.36 is the transition baseline.

### 8.3 Agent/tool spans — the agentic-obs frontier (`ecosystem-02 §2.4`)
GenAI semconv defines model/inference spans, **agent spans** (`invoke_agent`, split client+internal
as of v1.41), **tool spans** (`execute_tool`), workflow spans, retrieval spans (RAG, v1.40). **The
fleet's products ARE agents** — so "is the app healthy?" increasingly means reading agent/tool spans
(did the tool call error? how long did the agent loop take?), not just HTTP spans.

### 8.4 Who actually EMITS the GenAI spans (`ecosystem-14 §14.7`)
The boundary is only operable if something emits the span. The two leading OTel-based emitters:
**`traceloop/openllmetry`** (7,202★ — the de-facto way to get the spans) and
**`Arize-ai/openinference`** (1,032★). **NOTE:** both emit *both* latency AND token attrs — neither is
"owned" by either harness; they're the shared producer. canary consumes the latency/exception attrs.

### 8.5 Operating OTel as an agent (`ecosystem-02 §2.5`)
The **Collector** (`otelcol`) is the workhorse: receivers → processors → exporters in
`otel-collector-config.yaml` — the vendor-neutral seam. OTLP wire protocol (gRPC :4317 / HTTP :4318).
Zero-code instrumentation via `OTEL_*` env vars + auto-instrument agents
(`opentelemetry-instrument` Python / `--require @opentelemetry/auto-instrumentations-node/register`).
No first-party "OTel MCP" — consumed *through* the backend's MCP. The agent's leverage point is the
Collector config + env vars (deterministic, greppable).

---

## JOB 9 — "Operate ALL of it as an agent" (MCP / CLI / API)

The most important capability for canary, because canary is an *agent*, not a human. `ecosystem-09`,
`ecosystem-14 §14.2-§14.3`. Full table + secrets in [[TOOL-MATRIX]].

### 9.1 The agent-operating stance (`ecosystem-09 §9.7`)
1. **Default to MCP for queries** (Sentry MCP for errors/traces/Seer/release-health; Grafana MCP for
   metrics/logs/alerts/oncall). Structured, native, no scraping.
2. **Default to CLI for config + build-time actions** (`sentry-cli sourcemaps`, `checkly deploy`,
   `amtool check-config`, `promtool check rules`). Deterministic + snap-back-able.
3. **Fall back to REST API** only when MCP/CLI can't. **Never screen-scrape a dashboard.**
4. **Feature-detect, don't assume.** Seer may be disabled/self-hosted-absent; AI-search tools need an
   LLM key; semconv version drift changes attribute names. Probe capability, don't hardcode.
5. **Mind the write-scopes.** Read-only canary = `*:read`. To resolve issues / send events / page it
   needs `project:write` + `event:write` (Sentry) — gate behind the autonomy ladder.

### 9.2 The remediation safety ladder (`ecosystem-03 §3.3`, `ecosystem-06 §6.4`)
The right autonomy model for canary's *mutating* actions: start with reversible low-risk (clear
cache, restart hung instance, scale under load, collect diagnostic bundle); gate higher-risk actions
behind demonstrated history + explicit human approval. **Auto-triage/enrich freely; auto-mutate
(resolve, page, remediate) behind policy.**

### 9.3 The two first-party AI root-cause surfaces (`ecosystem-01`, `ecosystem-14 §14.3`)
Across the two anchor stacks: Sentry's `analyze-issue-with-seer` AND the Grafana MCP's **Sift** tools
(`find_error_pattern_logs` "detect elevated error patterns in Loki via Sift",
`find_slow_requests` "detect slow requests via Sift/Tempo", `list_sift_investigations`). An agent can
ask "find the error pattern / find the slow request" rather than hand-writing LogQL/Tempo. (RBAC
gotcha: Grafana Incident + Sift use basic roles — grant **Editor** to create incidents.)

---

## JOB 10 — "Monitor the monitoring; ship the non-footgun default" (canary's product thesis)

The differentiating layer that falls straight out of the field intelligence. `field-01`, `field-05`,
`ecosystem-11`, `ecosystem-13 §13.3`.

### 10.1 Test the DELIVERY path, not just the rule (`field-01 §01.4c`, `ecosystem-11 §11.3`, `field-06 A7`)
**A firing alert rule ≠ a delivered page.** The alert-*delivery* link is the most under-tested,
most failure-prone — proven by: PagerDuty's own **9+ hour outage (Aug 28 2025), ~95% of events
rejected for 38 min** (everything looked "green" only because the pager was broken); Alertmanager
**#226** (resolve-gap, still OPEN, 71c), **#2404** (alerts not reaching webhook, OPEN), **#3920**
(Microsoft killed Teams webhooks, incompatible schema). **canary should heartbeat-test each
notification channel end-to-end** (synthetic page → confirm receipt). **No competitor markets this.**

### 10.2 Ship the non-footgun default + DETECT the footgun (`field-05 §05.5`)
Every classic breakage is "the default config ships the footgun": flat (not occurrence-aware)
sampling (Sentry #84943), rate alerts with no volume floor (#66988), unbounded metric labels
(OTel Cardinality Guardian #47368), self-host with no team-size warning. canary's thesis: ship the
sensible non-footgun default AND detect when a user is standing on one. See [[KNOWN-PITFALLS]].

### 10.3 Monitor your own monitoring (`ecosystem-11 §11.6`, `ecosystem-14 §14.5`)
**Version upgrades of monitoring tools are themselves incidents** (Sentry v7→v8 memory leak #13412
52c; Alertmanager 0.15 dupes #1550; the `autoSessionTracking` flag an agent was told to grep got
removed two majors ago). **Instrumentation is not free and can crash the app it watches** (Sentry Vue
100% CPU #2957; OTel Promise leaks; Prometheus exporter leak). Treat enabling instrumentation /
bumping an obs dep as a **verify-after** action. Prometheus v3.12 even ships
`/api/v1/status/self_metrics` precisely so an agent can monitor Prometheus's own health.

### 10.4 The 2026 north star: causality, not signal volume (`field-07 §07.8`, `field-06 DISPUTE 3`)
"Most teams already have full visibility, yet incidents take 20–40 min to diagnose because the system
shows **symptoms, not causes**." Costs rose 2022→2026 with **flat MTTR.** canary's positioning is
**causal explanation** (link release→error-spike, label→cost-bomb, fan-out→tail), not more data.
*Collection ≠ understanding.*

---

## Reading order for a fresh canary session
1. This map (JOB 0 boundary first, then the JOB matching the question).
2. [[TOOL-MATRIX]] — pick the tool + its agent surface + the env vars/secrets it needs.
3. [[KNOWN-PITFALLS]] — before touching any config, check the version-specific gotchas.
4. [[BATTLE-TESTED-SCENARIOS]] — the worked examples (these are the eval golden tasks).
5. [[OPINIONS]] — the taste layer (what to default to, what to never do).
6. [[GAPS-AND-DISPUTES]] — where to form your own view via experiment.

## Sources
All nodes trace to `brain/research/raw/ecosystem-00…14.md` and `brain/research/raw/field-00…07.md`
(cited inline by file + section). Those raw files carry the primary URLs / `gh api` verifications,
all dated 2026-06-16.
