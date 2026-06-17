---
title: "canary ecosystem research — agent-operability layer (MCP servers, CLIs, APIs)"
type: research
created: 2026-06-16
tags: [canary, observability, mcp, cli, api, agent-operability, sentry-mcp, grafana-mcp, prometheus-mcp, seer]
researcher: ecosystem (CP123 Wave-R)
---

# 09 — Operating observability AS AN AGENT (MCP / CLI / API)

This is **the most important file for canary**, because canary is an *agent* operating these
tools, not a human staring at dashboards. The mission asked specifically: "what an agent (not a
human) operating these tools needs to know (CLIs, APIs, MCP servers that exist for them)." The
answer in mid-2026 is unusually good: the two anchor tools (Sentry, Grafana) both have **mature
first-party MCP servers**, so an agent gets native, structured access — no screen-scraping.

## 9.1 The MCP landscape for observability (verified 2026-06-16)

| Tool | MCP server | First-party? | Stars | Latest | Verified |
| --- | --- | --- | --- | --- | --- |
| **Sentry** | `getsentry/sentry-mcp` (hosted `mcp.sentry.dev`) | ✅ first-party | **726★** | v0.36.0 (2026-06-08) | `gh api` 2026-06-16 |
| **Grafana** | `grafana/mcp-grafana` | ✅ first-party | **3,155★** | v0.16.0 (2026-06-16) | `gh api` (ecosystem-05) |
| **Prometheus** | `pab1it0/prometheus-mcp-server` | ❌ community (de-facto) | **474★** | pushed 2026-06-17 | `gh api` 2026-06-16 |
| **Datadog** | `datadog-labs/mcp-server` (+ community) | ✅ official (newish) | 41★ | pushed 2026-06-12 | `gh search` 2026-06-16 |
| **PagerDuty** | — (REST + Events API v2) | n/a | — | — | ecosystem-06 |
| **Checkly** | installable **agent skill** (`npx skills add checkly/checkly-cli`) | ✅ (skill, not MCP) | — | — | ecosystem-03 |
| **OpenTelemetry** | none of note (consumed via backend MCP) | n/a | — | — | ecosystem-02 §2.5 |
| **pino** | none (write-path lib; query via log backend) | n/a | — | — | ecosystem-04 §4.6 |

**Takeaway:** an agent operating canary's default stack (Sentry + optional Grafana/Prometheus)
has full first-party MCP coverage. The community Prometheus MCP (474★, extremely active) closes
the GAP ecosystem-05 §5.5 flagged — there's no *first-party* Prometheus MCP, but `pab1it0`'s is
the standard.

## 9.2 The Sentry MCP — the authoritative tool catalog (39 tools, verbatim)

Enumerated directly from source: `gh api repos/getsentry/sentry-mcp/contents/
packages/mcp-core/src/tools/catalog` (2026-06-16). These are the actual tool names an agent
calls (TS files in the catalog dir, `.ts` stripped):

**Discovery / read:** `find-organizations`, `find-projects`, `find-teams`, `find-releases`,
`find-dsns`, `find-monitors`, `find-alert-rules`, `find-dashboards`, `whoami`.

**Issues (the core error workflow):** `search-issues`, `get-issue-details`, `get-issue-activity`,
`get-issue-tag-values`, `add-issue-note`, **`update-issue`** (resolve / ignore / assign), 
`search-issue-events`.

**Events / traces / replay / profiling (deep diagnosis):** `search-events`, `get-trace-details`,
`get-event-attachment`, `get-replay-details`, `get-profile` / `get-profile-details`,
`get-snapshot` / `get-snapshot-image` / `get-latest-base-snapshot`.

**Release health & monitoring:** `get-release-details` (crash-free rates + adoption per release →
ecosystem-10), `find-monitors` / `get-monitor-details` (cron + uptime checks), `find-alert-rules`
/ `get-alert-rule` (→ ecosystem-06).

**THE Seer tool — AI debugging:** **`analyze-issue-with-seer`** — this is the single most
important tool for canary: an agent passes an issue and gets Seer's root-cause analysis (and, with
the GitHub integration connected, a drafted fix PR — ecosystem-01). `get-ai-conversation-details`
reads an AI-monitoring conversation.

**Docs / meta:** `search-docs`, `get-doc`, `get-sentry-resource`, `support`. **Provisioning:**
`create-project`, `create-team`, `create-dsn`, `update-project`.

### How the Sentry MCP runs + auth (the gotchas)
- **Remote hosted:** `https://mcp.sentry.dev/` — **OAuth** (Client ID/Secret). Easiest for a
  human-in-the-loop; the agent rides the user's OAuth grant.
- **Stdio / local:** `npx @sentry/mcp-server@latest --access-token=TOKEN` — uses a **User Auth
  Token** with explicit scopes: `org:read`, `project:read`, **`project:write`**, `team:read`,
  `team:write`, **`event:write`**. (raw README, fetched 2026-06-16.) For canary's autonomous
  operation, the **stdio + scoped token** path is the right one (deterministic, no interactive
  OAuth). Note `project:write` + `event:write` are what let the agent *resolve issues* and *send
  events* — read-only deployments omit them.
- **Seer can be disabled** via `--disable-skills=seer`, and "Seer may not be available on
  self-hosted instances." So an agent must not *assume* `analyze-issue-with-seer` exists — feature-
  detect it. (raw README, 2026-06-16.)
- **AI-search tools** (`search-events`, `search-issues`) "require LLM provider configuration" —
  they translate NL → Sentry query; without an LLM key configured on the MCP they degrade.

## 9.3 The Grafana MCP — query lens over metrics/logs/alerts/oncall

`grafana/mcp-grafana` (3,155★, v0.16.0 2026-06-16 — see ecosystem-05 §5.5 for full detail). Tool
categories an agent uses: search dashboards → fetch a dashboard's panels/queries → **run PromQL/
LogQL through Grafana datasources** → list/query **incidents** → manage **alert rules** + view
firing alerts → query **Grafana OnCall schedules** (this is the "who's on call?" answer,
ecosystem-06) → navigate resources. One MCP gives an agent the metrics + logs + alerting + on-call
picture. This is why, *for the Grafana-stack path*, canary should route through this MCP rather
than the Prometheus MCP + raw APIs separately.

## 9.4 The Prometheus MCP — 6 tools (when not on Grafana)

`pab1it0/prometheus-mcp-server` (474★, pushed 2026-06-17). Exact tools (raw README, 2026-06-16):
`health_check`, **`execute_query`** (PromQL instant), **`execute_range_query`** (PromQL range:
start/end/step), `list_metrics`, `get_metric_metadata`, `get_targets`. Config: `PROMETHEUS_URL`
(required) + auth (basic / `PROMETHEUS_TOKEN` bearer / mTLS) + optional `ORG_ID` for multi-tenant.
This is the agent's path to run the burn-rate / error-rate / p95 PromQL from ecosystem-05/07
directly against Prometheus when there's no Grafana in front of it.

## 9.5 The CLIs (the deterministic, scriptable surface — prefer over web UIs)

An agent should reach for a CLI before a UI: CLIs are deterministic, greppable, snap-back-able,
and don't require browser automation. The canary-relevant CLIs:

- **`sentry-cli`** — the workhorse. Key verbs for an agent: `sourcemaps inject` + `sourcemaps
  upload [--validate] [--decompress]` (ecosystem-08), `releases new/finalize`, `releases
  set-commits --auto` (commit association → suspect commits/Seer, ecosystem-10), `releases deploys
  new` (deploy markers), `send-event`, `send-metric`, `info`. ⚠️ version gotcha: `sentry-cli >=
  2.21.3` breaks in rootless Docker (issue #1929, ecosystem-08) — an agent in CI must know this.
- **`checkly` CLI** — `npx checkly test` (run checks locally) / `npx checkly deploy` (publish).
  Monitoring-as-code; the agent authors `.spec.ts` BrowserChecks + ApiChecks (ecosystem-03). Plus
  the installable **agent skill** `npx skills add checkly/checkly-cli` — Checkly ships docs +
  patterns *to the agent*. This is the gold-standard agent-native monitoring pattern.
- **`amtool`** (Alertmanager) — `amtool check-config` (ALWAYS before reload, ecosystem-05 §5.4),
  `amtool alert query`, `amtool silence add/query`. The deterministic alerting-config surface.
- **`promtool`** (Prometheus) — `promtool check rules` / `check config` (validate recording +
  alert rules before load — the SLO recording rules in ecosystem-07), `promtool query instant`.
- **`grafana-cli`** — plugin/admin (less load-bearing for canary; dashboards-as-code goes through
  the Foundation SDK / Grizzly, not this CLI).
- **`opentelemetry-instrument`** (Python) / `--require @opentelemetry/auto-instrumentations-node/
  register` (Node) — zero-code auto-instrumentation an agent can wire via env vars (ecosystem-02).

## 9.6 The REST APIs (the universal fallback)

When no MCP/CLI fits, every tool has a REST API — the never-give-up fallback (per the harness's
"use the browser/API like a human would" rule):
- **Sentry:** `sentry.io/api/0/` — list/update issues, list events, project stats, releases,
  sessions (release health rates), monitors. Auth: org / internal-integration auth tokens.
- **Prometheus:** `/api/v1/query`, `/api/v1/query_range`, `/api/v1/rules`, `/api/v1/alerts` —
  run PromQL + read rule/alert state without any UI (ecosystem-05 §5.5).
- **Grafana:** HTTP API — dashboards, alert rules, datasources, annotations.
- **PagerDuty:** Events API v2 (`POST` event w/ `routing_key`+`dedup_key`) + REST API (incidents,
  schedules, escalations, on-call) — ecosystem-06.
- **Checkly / Better Stack / UptimeRobot:** REST APIs (+ Checkly/Better-Stack Terraform & Pulumi
  providers for IaC) — ecosystem-03.

## 9.7 The synthesized "agent operating canary" stance

1. **Default to MCP** for *queries* (Sentry MCP for errors/traces/Seer/release-health; Grafana
   MCP for metrics/logs/alerts/oncall). Structured, native, no scraping.
2. **Default to CLI** for *config + build-time actions* (`sentry-cli sourcemaps`, `checkly
   deploy`, `amtool check-config`, `promtool check rules`). Deterministic + snap-back-able + fits
   canary's commit-convention model.
3. **Fall back to REST API** only when MCP/CLI can't do it. Never screen-scrape a dashboard.
4. **Feature-detect, don't assume.** Seer may be disabled/self-hosted-absent; AI-search tools
   need an LLM key; semconv version drift changes attribute names (ecosystem-02 §2.5). An agent
   must probe capability, not hardcode it.
5. **Mind the write-scopes.** Read-only canary = `*:read`. To resolve issues / send events / page,
   it needs `project:write` + `event:write` (Sentry) — gate these behind the autonomy ladder
   (ecosystem-03 §3.3): auto-triage/enrich freely; auto-mutate (resolve, page, remediate) behind
   policy.
6. **canary's own internal trail = `runs.jsonl`** (ecosystem-00) — the agent emits its own
   actions as append-only JSONL (greppable, the hand-rolled pino), separate from the product
   telemetry it monitors. Dogfood the pattern it preaches.

## Sources
- `gh api repos/getsentry/sentry-mcp` + `/releases` + `/contents/.../tools/catalog` (2026-06-16)
  — 726★, v0.36.0, the 39-tool catalog verbatim incl. `analyze-issue-with-seer`, `update-issue`,
  `find-releases`, `find-monitors`, `find-alert-rules`, `get-trace-details`, `search-events`.
- raw.githubusercontent.com/getsentry/sentry-mcp/main/README.md (2026-06-16) — remote OAuth vs
  stdio `--access-token`, scopes (project:write/event:write), `--disable-skills=seer`,
  self-hosted Seer caveat, AI-search needs LLM provider.
- `gh api repos/grafana/mcp-grafana` (2026-06-16, via ecosystem-05) — 3,155★, v0.16.0, tool
  categories incl. OnCall.
- `gh api repos/pab1it0/prometheus-mcp-server` + raw README (2026-06-16) — 474★, 6 tools
  (execute_query/execute_range_query/list_metrics/get_metric_metadata/get_targets/health_check),
  PROMETHEUS_URL config.
- `gh search repos "datadog mcp server"` (2026-06-16) — datadog-labs/mcp-server official (41★).
- Cross-ref: ecosystem-01 (Seer), -02 (OTel/semconv), -03 (Checkly skill, AI-SRE ladder),
  -05 (Grafana MCP, amtool/promtool), -06 (PagerDuty API), -07 (PromQL burn-rate), -08
  (sentry-cli sourcemaps), -10 (release health API).
