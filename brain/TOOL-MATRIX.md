---
title: "canary TOOL MATRIX — canonical tools, agent-access surface, required secrets"
type: brain
status: active
created: 2026-06-16
tags: [canary, observability, tool-matrix, mcp, cli, api, secrets, env-vars, required-secrets-manifest]
source: brain/research/raw/ecosystem-01..14 (esp. 09), brain/research/raw/field-05
related: ["[[EXPERTISE-MAP]]", "[[KNOWN-PITFALLS]]", "[[OPINIONS]]", "[[GAPS-AND-DISPUTES]]", "[[MOC - canary]]"]
---

# canary Tool Matrix

> The canonical tool per job, the alternative, when to pick which, the **agent-access surface**
> (MCP / CLI / API), and **the env vars / secrets each needs**. The secrets column feeds the
> **Required-Secrets manifest in Wave P** — every secret named here is a manifest entry.
>
> All versions/stars verified `gh api` / WebFetch on **2026-06-16** (the raw files carry the
> receipts). Versions move; re-verify before pinning. Stance: **MCP for queries → CLI for config →
> REST as fallback; never screen-scrape** (`ecosystem-09 §9.7`).

## 0. The opinionated default stack (the one-line answer)

`ecosystem-13 §13.3` + `ecosystem-14 §14.9` (corrected on-call):

1. **Instrument once in OpenTelemetry** → one instrumentation feeds everything; GenAI spans make the
   canary/agentmoney split work off shared spans.
2. **Errors + traces + release-health + AI-debug → Sentry** (checklist default, first-party MCP, Seer).
3. **Metrics + SLO burn-rate + dashboards → Prometheus + Grafana** (self-host via `dockprom` to dogfood).
4. **Synthetic/uptime → Checkly** (most agent-native: monitoring-as-code + installable skill).
5. **On-call → PagerDuty or incident.io** (both now have official MCPs). **Never Opsgenie** (dead
   Apr 2027). **Never self-hosted Grafana OnCall OSS** (archived Mar 2026).
6. **Logs → pino** (JSON-to-stdout + redaction + OTel correlation); canary's own trail stays
   `runs.jsonl`-shaped.

---

## 1. THE matrix — which tool for which job (`ecosystem-13 §13.2`)

| Question canary answers | Default | Why | Honest tradeoff | Alts |
| --- | --- | --- | --- | --- |
| Did the app throw? what stack trace? | **Sentry** | discrete events + symbolicated traces + Seer root-cause | needs source maps; SDK upgrades leak | Highlight.io (session replay), Bugsink (self-host) |
| What's the p95/p99 / error-rate trend? | **Prometheus** (+Grafana) | numeric time-series, histograms, `histogram_quantile()` | memory hog; WAL-replay OOM | Grafana Cloud, OpenObserve, Datadog |
| Is the endpoint up / is the flow working? | **Checkly** | monitoring-as-code, `@playwright/test`, agent skill | priciest entry for pure uptime | Better Stack, UptimeRobot |
| Cheapest "is it up" ping | **UptimeRobot** | 50 free monitors | no JS/SPA; **free = non-commercial** | Checkly free tier |
| One platform: uptime + logs + on-call | **Better Stack** | consolidated incident lifecycle | Responders +$29/mo each; small free tier | Grafana Cloud, Datadog |
| Did the deploy regress? | **Sentry Release Health** | crash-free sessions/users + adoption | mobile/web-first; needs sessions+release | SLO burn-rate (backend) |
| Are we within SLO / burning budget? | **Prometheus burn-rate rules** (gen via **Sloth**) | MWMBR 14.4×/6×/1× | needs recording rules; SLI-as-ratio | Pyrra, Nobl9, Grafana SLO |
| Who got paged / did they ack? | **PagerDuty** (or **incident.io**) | mature escalation, official MCP | PD priciest per-seat | Grafana Cloud IRM, Better Stack, Squadcast |
| Structured app logs | **pino** | JSON-to-stdout, fast, redaction, OTel correlation | async transport can drop chars under load | Winston, Bunyan, OTel Logs SDK |
| Vendor-neutral instrumentation | **OpenTelemetry** | one instrumentation → any backend | version/attribute drift; can leak | vendor SDKs (lock-in) |
| Who emits the GenAI spans? | **OpenLLMetry** | most-starred OTel GenAI auto-instrumentation | emits BOTH latency+token (shared) | OpenInference |
| Self-host everything (OSS) | **OpenObserve** / LGTM stack | unified logs+metrics+traces | you operate it (scaling, retention) | SigNoz, Highlight |
| AI debugging / auto root-cause | **Sentry Seer** + **Grafana Sift** | reads traces, drafts fix PRs, NL queries | $40/contributor; needs GitHub integration | Better Stack AI SRE, Datadog Bits AI |

---

## 2. The agent-access surface + REQUIRED SECRETS (the Wave-P manifest source)

For each tool: does it have an MCP (first-party?), its CLI, its API, and **the exact env vars /
secrets an agent needs**. Status legend: ✅ first-party · ◐ community · ✗ none.

### 2.1 Sentry — `ecosystem-01`, `ecosystem-09 §9.2`
- **MCP:** ✅ `getsentry/sentry-mcp` (726★, v0.36.0). Hosted `https://mcp.sentry.dev/` (OAuth) OR
  stdio `npx @sentry/mcp-server@latest --access-token=TOKEN`. **39 tools** incl. `search-issues`,
  `get-issue-details`, **`update-issue`**, `get-trace-details`, `get-release-details`,
  **`analyze-issue-with-seer`**.
- **CLI:** `sentry-cli` — `sourcemaps inject`/`upload [--validate] [--decompress]`,
  `releases new/finalize/set-commits --auto`, `releases deploys new`, `send-event`, `send-metric`.
- **API:** `sentry.io/api/0/` — issues, events, project stats, releases, sessions (release-health rates).
- **SECRETS (manifest):**
  - `SENTRY_AUTH_TOKEN` — **required.** User Auth Token. Scopes: read-only = `org:read`,
    `project:read`, `team:read`. To mutate (resolve issues / send events / page) **also** need
    `project:write`, `event:write` (gate behind the autonomy ladder).
  - `SENTRY_ORG` (org slug), `SENTRY_PROJECT` (project slug) — for CLI/API targeting.
  - `SENTRY_DSN` — the product's ingestion endpoint (set in the *monitored app's* `Sentry.init`, not
    canary's own creds; canary reads it to verify config).
  - For hosted MCP OAuth instead of token: Client ID/Secret (interactive — prefer the stdio scoped
    token for autonomous canary).
  - `analyze-issue-with-seer` requires the **GitHub integration connected** to the repo to draft a
    fix PR; AI-search tools (`search-events`/`search-issues`) need an LLM provider configured on the MCP.

### 2.2 Grafana — `ecosystem-05 §5.5`, `ecosystem-09 §9.3`, `ecosystem-14 §14.3`
- **MCP:** ✅ `grafana/mcp-grafana` (3,155★, v0.16.0). Tools: search dashboards, run PromQL/LogQL via
  datasources, query incidents, manage alert rules + view firing alerts, query **OnCall** schedules,
  **Sift** AI investigations (`find_error_pattern_logs`, `find_slow_requests`, `list_sift_investigations`).
- **CLI:** `grafana-cli` (plugin/admin — minor). Dashboards-as-code = Foundation SDK / Grizzly / jsonnet.
- **API:** HTTP API — dashboards, alert rules, datasources, annotations.
- **SECRETS (manifest):**
  - `GRAFANA_URL` — **required.** Base URL of the Grafana instance.
  - `GRAFANA_API_KEY` (service-account token) — **required.** **RBAC gotcha:** Grafana Incident +
    Sift use *basic* roles — grant **Editor** to create incidents / modify investigations; Viewer is
    read-only.

### 2.3 Prometheus + Alertmanager — `ecosystem-05`, `ecosystem-09 §9.4`
- **MCP:** ◐ `pab1it0/prometheus-mcp-server` (474★, de-facto standard — no first-party). 6 tools:
  `health_check`, **`execute_query`** (instant PromQL), **`execute_range_query`** (start/end/step),
  `list_metrics`, `get_metric_metadata`, `get_targets`.
- **CLI:** `promtool` (`check rules`/`check config` — **always validate SLO recording+alert rules
  before load**; `query instant`). `amtool` (`check-config` — **always before AM reload**;
  `alert query`; `silence add/query`).
- **API:** Prometheus `/api/v1/query`, `/query_range`, `/rules`, `/alerts`, and (v3.12+)
  `/api/v1/status/self_metrics` (monitor Prometheus's own health). Alertmanager API for silences/alerts.
- **SECRETS (manifest):**
  - `PROMETHEUS_URL` — **required** (for the MCP + API).
  - Auth (optional, deployment-dependent): basic auth, OR `PROMETHEUS_TOKEN` (bearer), OR mTLS certs.
  - `ORG_ID` — optional, for multi-tenant (Mimir/Cortex).
  - Alertmanager: `ALERTMANAGER_URL` (+ same auth options).

### 2.4 Checkly — `ecosystem-03 §3.2`, `ecosystem-09 §9.5`
- **MCP:** ✗ — but ✅ **installable agent skill** `npx skills add checkly/checkly-cli` (teaches the
  agent to author monitoring-as-code; arguably better than an MCP).
- **CLI:** `checkly` — `npx checkly test` (run locally), `npx checkly deploy` (publish). Authors
  `ApiCheck`/`BrowserCheck`(`.spec.ts`)/`MultiStepCheck`. Also Terraform + Pulumi providers.
- **API:** REST API.
- **SECRETS (manifest):**
  - `CHECKLY_API_KEY` — **required.**
  - `CHECKLY_ACCOUNT_ID` — **required** (account targeting).

### 2.5 PagerDuty — `ecosystem-06`, `ecosystem-14 §14.2`
- **MCP:** ✅ **`PagerDuty/pagerduty-mcp-server`** (official, Apache-2.0, Python, 71★). Run via
  `uv run pagerduty-mcp`. Covers incidents, services, schedules, **event orchestrations**, escalation
  policies; ships embedded React "MCP-Apps" (Incident Command Center, On-Call Manager).
- **CLI:** (no canonical first-party CLI — use the MCP or API).
- **API:** **Events API v2** (`POST` w/ `routing_key` + **`dedup_key`** + `severity` + `payload` —
  `dedup_key` is THE most important field, prevents the alert storm) + REST API (incidents,
  escalation policies, schedules, on-call).
- **SECRETS (manifest):**
  - `PAGERDUTY_USER_API_TOKEN` — **required** for the MCP + REST API (a User API Token).
  - `PAGERDUTY_ROUTING_KEY` (a.k.a. integration/routing key) — **required** to send events via Events
    API v2 (per-service).

### 2.6 incident.io — `ecosystem-14 §14.2`
- **MCP:** ✅ official **remote MCP** (Streamable-HTTP, `docs.incident.io/ai/remote-mcp`, March 2026;
  superseded the old Golang prototype). Incident management, alert handling, on-call scheduling,
  investigation workflows.
- **API:** REST API.
- **SECRETS (manifest):** `INCIDENT_IO_API_KEY` — **required** (exact scopes not yet pinned — see
  [[GAPS-AND-DISPUTES]] residual gap).

### 2.7 pino (logging) — `ecosystem-04`
- **MCP:** ✗ (write-path library; query side is the log backend's MCP/API).
- **Library:** `pino` v10.3.1 + `pino-http` + `@opentelemetry/instrumentation-pino` (correlation) +
  `pino-opentelemetry-transport` (export).
- **SECRETS (manifest):** none of its own. If shipping logs to an OTLP backend, reuses
  `OTEL_EXPORTER_OTLP_ENDPOINT` (§2.8). **Config requirement, not a secret:** redaction paths MUST be
  set (`redact: [...]`) — see [[KNOWN-PITFALLS]] §4.

### 2.8 OpenTelemetry (substrate) — `ecosystem-02 §2.5`
- **MCP:** ✗ (consumed via the backend's MCP).
- **CLI/agent:** `opentelemetry-instrument` (Python) / `--require @opentelemetry/auto-instrumentations-node/register` (Node). Collector = `otelcol` editing `otel-collector-config.yaml`.
- **ENV (manifest — these are config, mostly not secret):**
  - `OTEL_EXPORTER_OTLP_ENDPOINT` (gRPC :4317 / HTTP :4318) — **required** to export.
  - `OTEL_SERVICE_NAME`, `OTEL_RESOURCE_ATTRIBUTES`, `OTEL_TRACES_SAMPLER`.
  - `OTEL_SEMCONV_STABILITY_OPT_IN=gen_ai_latest_experimental` — **load-bearing** for GenAI attrs
    post-v1.42 (controls which attribute namespace is emitted).
  - `OTEL_EXPORTER_OTLP_HEADERS` — **may carry a secret** (e.g. `Authorization=Bearer <token>` for a
    backend that authenticates OTLP ingest).
- **Span emitter (if monitoring LLM apps):** `traceloop/openllmetry` (7,202★) or
  `Arize-ai/openinference` (1,032★) — emits both latency (canary) + token (agentmoney) attrs.

### 2.9 Datadog (alt, named for completeness) — `ecosystem-14 §14.2`
- **MCP:** ✅ `datadog-labs/mcp-server` (official, 41★). Popular *unofficial*: `GeLi2001/datadog-mcp-server` (68★).
- **SECRETS (manifest):** `DD_API_KEY`, `DD_APP_KEY` (if/when used — Datadog is the cost-blowup
  cautionary tale, not a default; see [[OPINIONS]] B6).

### 2.10 Better Stack / UptimeRobot (alts) — `ecosystem-03`, `ecosystem-14 §14.2`
- **MCP:** ✗ first-party (Better Stack: tiny stale community 0★; UptimeRobot: community 0★). REST API
  + Terraform path.
- **SECRETS (manifest, if used):** `BETTERSTACK_API_TOKEN`; `UPTIMEROBOT_API_KEY` (v2/v3).
  ⚠️ UptimeRobot free tier = **non-commercial only** — do not use for a fleet product.

---

## 3. Consolidated Required-Secrets manifest (Wave P input)

The minimal secret set for the **default stack** (canary operating its own dogfood + the fleet's
products). Tiered by "read-only canary" vs "mutating canary."

**Tier A — read-only canary (query + report only):**
| Secret | Tool | Required? |
| --- | --- | --- |
| `SENTRY_AUTH_TOKEN` (scopes `org:read`,`project:read`,`team:read`) | Sentry MCP/CLI/API | ✅ |
| `SENTRY_ORG`, `SENTRY_PROJECT` | Sentry targeting | ✅ |
| `GRAFANA_URL`, `GRAFANA_API_KEY` (Viewer) | Grafana MCP/API | ◐ if on Grafana |
| `PROMETHEUS_URL` (+ optional `PROMETHEUS_TOKEN`) | Prometheus MCP/API | ◐ if self-host metrics |
| `CHECKLY_API_KEY`, `CHECKLY_ACCOUNT_ID` | Checkly | ◐ if synthetic |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTel export | ◐ if emitting |

**Tier B — mutating canary (resolve / page / deploy config) — gate behind autonomy ladder:**
| Secret | Tool | Why |
| --- | --- | --- |
| `SENTRY_AUTH_TOKEN` **+ `project:write`,`event:write`** | Sentry | resolve issues, send events |
| Sentry **GitHub integration** connected | Seer Autofix | draft fix PRs |
| `GRAFANA_API_KEY` **(Editor)** | Grafana | create incidents, modify Sift investigations |
| `PAGERDUTY_USER_API_TOKEN`, `PAGERDUTY_ROUTING_KEY` | PagerDuty | page / ack / orchestrate |
| `INCIDENT_IO_API_KEY` | incident.io | declare/manage incidents |

**Already present in canary's `.mcp.json` (reuse, don't re-add):** `github`
(`GITHUB_PERSONAL_ACCESS_TOKEN` — also what Seer needs for the repo integration), `context7`,
`memory`, `obsidian`. The obs MCPs above (sentry/grafana/prometheus/pagerduty) are NEW entries to add
to `.mcp.json` in Wave P.

---

## 4. Starter/dogfood repos (clone these, don't read a blog) (`ecosystem-12`)
| Repo | Stars | Use |
| --- | --- | --- |
| `open-telemetry/opentelemetry-demo` | 3,148★ | learn the WHOLE stack wiring (instrument→OTLP→Collector→backends) |
| `stefanprodan/dockprom` | 6,560★ | fastest self-host Prometheus+Grafana+Alertmanager to dogfood against |
| `grafana/intro-to-mltp` | 640★ | learn the Grafana LGTM path (logs+metrics+traces+profiles) |
| `getsentry/sentry-javascript` (samples) | 8,668★ | copy a per-framework Sentry+source-map setup done right |
| `checkly/checkly-cli` | 94★ | the agent-native monitoring-as-code model (+ its skill) |
| `agamm/awesome-ai-sre` | 38★ | the map of canary's competitive landscape (AI-SRE agents) |
| `openobserve/openobserve` | 19,319★ | OSS "one platform instead of Sentry+Grafana" option |

## Sources
`brain/research/raw/ecosystem-01…14.md` (esp. 03/05/06/09/12/14) + `field-05`. All versions, stars,
tool lists, and secret/scope facts verified via `gh api` / WebFetch / raw README on 2026-06-16 and
cited inline in those files.
