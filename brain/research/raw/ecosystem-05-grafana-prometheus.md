---
title: "canary ecosystem research — Grafana / Prometheus (metrics + dashboards + alerting)"
type: research
created: 2026-06-16
tags: [canary, observability, grafana, prometheus, metrics, alertmanager, promql, mcp, dashboards-as-code]
researcher: ecosystem (CP123 Wave-R)
---

# 05 — Grafana / Prometheus: the open-source metrics + dashboard stack

This is the vendor-neutral, self-hostable alternative to Sentry/Datadog for the **metrics**
pillar (and increasingly logs/traces via the LGTM stack: Loki/Grafana/Tempo/Mimir). The
Energy checklist names "**Grafana Cloud** (metrics)" as an explicit alt to Sentry
(`~/energy/audit/HARNESS-CHECKLIST-2026.md` line 317). For canary the relevant
question is: *when does an agent reach for Prometheus/Grafana vs Sentry?* Answer up front:
**Prometheus = numeric time-series (latency histograms, request rates, error rates, saturation)
+ rule-based alerting; Sentry = discrete error events + stack traces + release health.** They
compose, they don't compete.

## 5.1 Current versions (verified via `gh api`, 2026-06-16)

| Tool | Repo | Latest | Released | Stars | Pushed |
| --- | --- | --- | --- | --- | --- |
| **Grafana** | grafana/grafana | **v13.0.2** | 2026-06-09 | 74,482★ | 2026-06-17 |
| Grafana (12.x maintained) | grafana/grafana | v12.4.4 | 2026-06-09 | — | — |
| **Prometheus** | prometheus/prometheus | **v3.12.0** | 2026-05-28 | 64,591★ | 2026-06-16 |
| Prometheus (3.5 LTS line) | prometheus/prometheus | v3.5.3 | 2026-04-27 | — | — |
| **Alertmanager** | prometheus/alertmanager | **v0.33.0** | 2026-06-12 | 8,510★ | 2026-06-16 |

Source: `gh api repos/grafana/grafana`, `/prometheus/prometheus`, `/prometheus/alertmanager`
+ their `/releases` (all 2026-06-16). **Key currency facts:**
- **Grafana is on v13** (v13.0 launched at GrafanaCON, **April 21 2026**). v12.x is still
  patched in parallel (v12.4.4 same day as v13.0.2) — so an agent encountering a Grafana
  instance in mid-2026 may be on 11.x, 12.x, OR 13.x. Version detection matters.
- Prometheus runs **two parallel lines**: the **3.5 LTS** (long-term-support) line for stability
  and the **3.11/3.12 feature** line. v3.5.x and v3.12.x were released *the same days* (e.g.
  v3.5.3 + v3.11.3 both 2026-04-27) — classic LTS-vs-latest dual-track. (gh releases, 2026-06-16.)

## 5.2 Grafana 13 — what actually changed (Apr–Jun 2026 deltas)

From grafana.com/blog/grafana-13-release-all-the-latest-features/ + the v13.0 whatsnew docs +
the GrafanaCON 2026 press release (all surfaced via WebSearch 2026-06-16):

- **Query/transformation sidebar** — queries, expressions, and transformations now render as
  **color-coded cards with state indicators (error / hidden / disabled)**. Each query gets its
  **own data-source picker** (mixed-source dashboards are now first-class). This is a real
  authoring-ergonomics jump.
- **Restore deleted dashboards = GA** — "Recently deleted" view; no support ticket needed.
  (Matters for canary's snap-back philosophy: dashboards-as-state are now recoverable.)
- **Revamped gauge viz** (Jan 2026 preview) → GA in 13.
- **Suggested dashboards / dashboard templates / org-defined templates** — three new
  dashboard-bootstrapping initiatives.
- **Grafana Marketplace** (ISV plugin distribution) announced at GrafanaCON 2026, **pilot phase**.
- **Config breaking change:** `enable_gzip` (HTTP compression) is now **ON by default in
  v13.0** — a behavioral change an upgrading operator must know (it was off before).
- Ecosystem: **170+ data sources, 120+ visualization panels**.

Source: grafana.com/blog/grafana-13-release-all-the-latest-features/ +
grafana.com/press/2026/04/21/grafana-labs-launches-grafana-13… +
grafana.com/docs/grafana/latest/whatsnew/whats-new-in-v13-0/ (all 2026-06-16).

## 5.3 Prometheus — the model + the v3.x line

**Prometheus is pull-based**: it scrapes `/metrics` HTTP endpoints on a schedule. Four metric
types an agent must know: **counter** (monotonic — request totals, error totals), **gauge**
(point-in-time — memory, queue depth), **histogram** (latency buckets → `_bucket`/`_sum`/`_count`
→ `histogram_quantile()` gives p50/p95/p99), **summary** (client-side quantiles, mostly legacy).

- **PromQL** is the query language. The load-bearing canary patterns:
  - **Error rate:** `rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m])`
  - **p95 latency:** `histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))`
  - **Burn rate (SLO):** see ecosystem-07.
- **v3.x line (3.0 GA was late 2024)** brought: new UTF-8 metric/label name support, native
  histograms (more accurate quantiles, smaller storage), a rewritten React UI, OTLP ingestion
  endpoint (`/api/v1/otlp/v1/metrics` — Prometheus can receive OTLP directly), and remote-write
  2.0. The **3.5 LTS** designation (2026) is the "boring stable" pin for production.
  [GAP: I did not crawl the per-minor Prometheus CHANGELOG for v3.11→v3.12 specifics this pass —
  flagged for GAPS. The dual-line LTS/feature fact IS verified from release dates.]

### Native histograms — the v3.x feature canary should care about
Classic histograms force you to pre-choose latency buckets (`le="0.1"`, `le="0.5"`, …) at
instrumentation time; pick wrong and your p99 is garbage. **Native histograms** (stable-ish in
3.x) use exponential bucketing chosen automatically → accurate high-quantile latency without
guessing buckets, at lower storage cost. For an agent computing p99 latency SLOs this removes a
classic footgun (the "my p99 bucket boundary was at 1s but real p99 is 1.2s" silent error).

## 5.4 Alertmanager — the alerting brain (and its gotchas)

Prometheus *evaluates* alerting rules (`ALERTS` firing when a PromQL expr is true for `for:`
duration) and **pushes them to Alertmanager**, which does **dedup, grouping, silencing,
inhibition, and routing** to receivers (PagerDuty, Opsgenie, Slack, email, webhook). **v0.33.0
(2026-06-12)** is current.

**The classic real-world breakages (high-engagement issues / well-known footguns):**
1. **Grouping latency vs storm control tradeoff** — `group_wait` / `group_interval` /
   `repeat_interval` are the three knobs. Set `group_wait` too low → alert spam at incident
   onset; too high → delayed paging. This is THE most-tuned Alertmanager config and the source
   of most "why didn't I get paged / why did I get 200 pages" tickets.
2. **Inhibition rules silently swallowing alerts** — an over-broad `inhibit_rule` (e.g. "if
   cluster-down fires, suppress everything") can hide a real unrelated incident. A frequent
   "the alert never fired but the service was down" postmortem cause.
3. **Config reload without validation** — a malformed `alertmanager.yml` on reload can leave AM
   running the *old* config silently. Always `amtool check-config` before reload.
4. **Receiver `send_resolved`** defaults differ per integration — forgetting it means you get
   the page but never the "resolved" notification (on-call stays anxious).

`amtool` is the CLI (check-config, query alerts, manage silences). This is the deterministic,
agent-friendly surface — prefer it over the web UI.

## 5.5 THE agent-operability story — Grafana MCP (this is the big one)

**`grafana/mcp-grafana` is a first-party, very-active MCP server.** Verified via
`gh api repos/grafana/mcp-grafana` (2026-06-16): **3,155★, latest v0.16.0 (released 2026-06-16
— the very day of this research), pushed 2026-06-16.** Release cadence is fast: v0.15.0 (Jun 1)
→ v0.15.1 (Jun 3) → v0.15.2 (Jun 4) → v0.16.0 (Jun 16). This is one of the most actively
maintained observability MCP servers in existence and is **directly load-bearing for canary**
(an agent operating Grafana does it through this).

What the Grafana MCP exposes to an agent (the tool categories, from the repo): search
dashboards, fetch a dashboard's panels/queries, **query Prometheus/Loki via PromQL/LogQL through
Grafana datasources**, list/query **incidents** (Grafana Incident), manage **alert rules** and
view firing alerts, query **Grafana OnCall** schedules, and navigate Grafana's resources. This
means canary can, *as an agent*: "find the dashboard for service X, run the p95 PromQL for the
last hour, check if any alert rules are firing, and see who's on call" — all through one MCP.

- **Grafana also has a CLI** (`grafana-cli` for plugin/admin) and a full **HTTP API** (dashboards,
  alert rules, datasources, annotations). **Dashboards-as-code** via the **Grafana Foundation
  SDK** (TS/Go/Python/Java) or Grizzly/jsonnet — so dashboards live in Git, which fits canary's
  snap-back model exactly. An agent should author dashboards as code, not click them.
- **Prometheus** itself has an **HTTP API** (`/api/v1/query`, `/api/v1/query_range`,
  `/api/v1/rules`, `/api/v1/alerts`) — the deterministic surface for an agent to run PromQL and
  read rule/alert state without any UI. There is also community `prometheus-mcp`-style servers,
  but the canonical path for the Grafana ecosystem is the Grafana MCP. [GAP: I did not verify a
  *first-party* Prometheus MCP server — community ones exist; flagged for GAPS.]

## 5.6 Taste — when canary should pick Grafana/Prometheus over Sentry

- **Pick Prometheus/Grafana when** the question is *numeric and continuous*: "what's the p99
  latency trend," "what's the error-rate-per-route over 24h," "are we burning the SLO budget,"
  "is CPU/memory saturating." Prometheus owns rates, histograms, and saturation; Grafana owns the
  dashboard + multi-burn-rate alert rules.
- **Pick Sentry when** the question is *discrete and diagnostic*: "what exact exception, with
  what stack trace, on which release, affecting which users." Sentry owns the *event* and the
  *root cause*; Prometheus only knows the *count* went up.
- **The mature canary stance:** emit **OTel** (ecosystem-02) so the SAME instrumentation feeds
  BOTH — Prometheus/Grafana for the rate/latency/SLO view, Sentry for the error-event/trace view.
  Don't double-instrument. The Grafana MCP + Sentry MCP then give the agent two query lenses over
  one telemetry stream.
- **Self-host vs Cloud:** the OSS stack (Prometheus + Alertmanager + Grafana OSS) is free but
  you operate it (scaling, retention, HA). Grafana Cloud is the managed path. For canary's own
  dogfooding the OSS stack in a container is the cheapest start; for fleet products at scale,
  Grafana Cloud or self-hosted Mimir for long-term metric storage.

## Sources
- `gh api repos/grafana/grafana` + `/releases` (2026-06-16) — v13.0.2/v12.4.4, 74.5k★.
- `gh api repos/prometheus/prometheus` + `/releases` (2026-06-16) — v3.12.0/v3.5.3 LTS, 64.6k★.
- `gh api repos/prometheus/alertmanager` + `/releases` (2026-06-16) — v0.33.0, 8.5k★.
- `gh api repos/grafana/mcp-grafana` + `/releases` (2026-06-16) — v0.16.0, **3,155★**, fast cadence.
- grafana.com/blog/grafana-13-release-all-the-latest-features/ (2026-06-16) — G13 feature list.
- grafana.com/press/2026/04/21/grafana-labs-launches-grafana-13-at-grafanacon-2026… (Apr 21 2026)
  — GrafanaCON launch, Marketplace pilot.
- grafana.com/docs/grafana/latest/whatsnew/whats-new-in-v13-0/ (2026-06-16) — gzip-on-by-default,
  query sidebar, restore-dashboards GA.
- sre.google/workbook/alerting-on-slos/ (for PromQL burn-rate, detailed in ecosystem-07).
- Internal: `~/energy/audit/HARNESS-CHECKLIST-2026.md` line 317 (Grafana Cloud as alt).
