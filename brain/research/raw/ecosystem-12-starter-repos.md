---
title: "canary ecosystem research — best starter / template / example repos"
type: research
created: 2026-06-16
tags: [canary, observability, starter-repos, templates, examples, otel-demo, lgtm, dockprom, awesome-lists]
researcher: ecosystem (CP123 Wave-R)
---

# 12 — The best starter / template / example repos (verified 2026-06-16)

Mission item 2: "the 3-5 best starter/template/example repos (stars, last commit, why)." All
stats below are verified via `gh api repos/<repo>` on 2026-06-16 (stars + `pushed_at`). Picked for
**recency, activity, and direct relevance to canary** — an agent that wants to *stand up* an
observability stack or *learn the wiring* should clone one of these, not read a blog.

## 12.1 The top picks (the "clone this" tier)

### 1. `open-telemetry/opentelemetry-demo` — THE end-to-end reference ⭐ top pick
- **3,148★ · pushed 2026-06-16 (today) · Apache-2.0**
- The "OpenTelemetry Astronomy Shop": a real microservice app (Go/Java/Python/Node/.NET/etc.)
  fully instrumented with **traces + metrics + logs**, shipping to a **Collector** that fans out
  to **Grafana, Jaeger, Prometheus, OpenSearch**. Includes a load generator and feature-flag
  service to *create* failures you can observe.
- **Why for canary:** this is the single best artifact to learn the *whole* stack wiring
  (instrument → OTLP → Collector → backends) and to see how an agent's GenAI/HTTP spans (ecosystem-
  02) flow into dashboards. It is the canonical "what good looks like" — and it's updated daily.
  If canary needs a sandbox to dogfood its own monitoring against, this is it.

### 2. `getsentry/sentry-javascript` — the Sentry SDK + sample setups
- **8,668★ · pushed 2026-06-17 (today) · MIT**
- The monorepo for all `@sentry/*` JS SDKs. Its `dev-packages/` and per-framework `samples`
  (Next.js, Remix, SvelteKit, Node, browser) are *working reference integrations* — including the
  source-map / debug-ID setup (ecosystem-08) done correctly.
- **Why for canary:** the authoritative source for *how to wire Sentry right* per framework, and
  (via its issues, ecosystem-11) the authoritative source for how it breaks. An agent configuring
  Sentry should copy a sample, not improvise.

### 3. `checkly/checkly-cli` — monitoring-as-code starter ⭐ agent-native pick
- **94★ · pushed 2026-06-16 (today) · v8.8.0 · 98% TypeScript**
- The Monitoring-as-Code framework (ecosystem-03 §3.2): define `ApiCheck`/`BrowserCheck`/
  `MultiStepCheck` as TS in Git, `npx checkly test` / `npx checkly deploy`. BrowserChecks are
  plain `@playwright/test` `.spec.ts` — no proprietary DSL.
- **Why for canary:** the *most agent-native* tool in the entire bundle. It ships an **installable
  agent skill** (`npx skills add checkly/checkly-cli`) that teaches an agent to author checks. The
  low star count belies its fit — for an *agent* operating monitoring-as-code, this is the model.

### 4. `stefanprodan/dockprom` — the drop-in self-host Prometheus+Grafana stack
- **6,560★ · pushed 2026-03-06 · MIT**
- A docker-compose stack: Prometheus + Grafana + Alertmanager + cAdvisor + NodeExporter +
  pre-built dashboards + alert rules. `docker compose up` → a full self-hosted metrics+alerting
  stack in minutes.
- **Why for canary:** the fastest path to a *real* Prometheus/Alertmanager (ecosystem-05/06) for
  canary to dogfood against — including pre-written Alertmanager routing so an agent can see the
  config it should author. Note: ~3 months since last push (vs daily for the OTel/Grafana demos),
  so verify image versions, but the structure is the canonical self-host pattern.

### 5. `grafana/intro-to-mltp` — the LGTM-stack teaching demo
- **640★ · pushed 2026-06-16 (today) · Apache-2.0**
- "Metrics, Logs, Traces and Profiles" companion: a compose stack with the full **Grafana LGTM**
  (Loki/Grafana/Tempo/Mimir) + Pyroscope + an OTel-instrumented demo app + Beyla (eBPF
  auto-instrumentation). Shows all four signals in one Grafana.
- **Why for canary:** the best way to learn the *Grafana-stack* path (the vendor-neutral
  self-hostable alternative to Sentry/Datadog, ecosystem-05) end to end, including how logs
  (ecosystem-04) and traces correlate in Grafana. Updated daily.

## 12.2 The map / landscape repos (the "read this to know the field" tier)

- **`agamm/awesome-ai-sre`** — **38★ · pushed 2026-06-14.** Curated list of *100+* AI-powered SRE
  tools (the list is large; the repo's star count is modest because it's new). **The single best
  map of canary's competitive landscape** — AI incident-resolution agents, AIOps, the exact
  "agent operating obs tools" category canary lives in. (ecosystem-03 §3.3.)
- **`adriannovegil/awesome-observability`** — **637★ · pushed 2026-05-11.** The broad curated map
  of the *whole* observability field (instrumentation, backends, visualization, tracing, logging).
  Use to discover any tool not covered in this bundle.
- **`open-telemetry/opentelemetry-collector-contrib`** — **4,738★ · pushed 2026-06-17 (today).**
  Not a "starter" but THE reference for every Collector receiver/processor/exporter (ecosystem-02
  §2.5). When an agent needs to wire OTLP → a specific backend, the component lives here.

## 12.3 OSS unified-platform alternatives (worth knowing as "self-host everything" options)

These are not starters but are the credible OSS "one platform instead of Sentry+Grafana+
Datadog" plays an agent should know exist:
- **`openobserve/openobserve`** — **19,319★ · pushed 2026-06-17 (today) · Rust.** OSS unified obs:
  logs, metrics, traces, frontend/RUM, in one platform. The most-starred OSS unified-obs platform;
  a serious self-host alternative to a Sentry+Grafana combo.
- **`highlight/highlight`** — **9,292★ · pushed 2026-04-16.** OSS full-stack monitoring with
  **session replay** + error monitoring + logs/traces. The Energy checklist names Highlight.io as
  an alt to Sentry (line 317) specifically for session replay. (TypeScript/Go.)

## 12.4 What canary should actually do with these
1. **For learning/wiring:** `opentelemetry-demo` (whole stack) + `grafana/intro-to-mltp` (Grafana
   path) — clone, run, watch real telemetry flow.
2. **For canary's own dogfood stack:** `stefanprodan/dockprom` (Prometheus+Alertmanager fast) and
   the `@sentry/*` samples for the error path; emit OTel so both work off one instrumentation.
3. **For agent-native monitoring-as-code:** `checkly/checkly-cli` + its skill — the closest thing
   to "canary, but a product you can buy" and the cleanest pattern to copy.
4. **For competitive/landscape awareness:** `agamm/awesome-ai-sre` (the AI-SRE field canary
   competes in) + `adriannovegil/awesome-observability` (the broad field).

## Sources
- `gh api repos/<repo>` (all 2026-06-16): open-telemetry/opentelemetry-demo (3,148★, 2026-06-16);
  getsentry/sentry-javascript (8,668★, 2026-06-17); checkly/checkly-cli (94★, 2026-06-16, v8.8.0);
  stefanprodan/dockprom (6,560★, 2026-03-06); grafana/intro-to-mltp (640★, 2026-06-16);
  agamm/awesome-ai-sre (38★, 2026-06-14); open-telemetry/opentelemetry-collector-contrib (4,738★,
  2026-06-17); openobserve/openobserve (19,319★, 2026-06-17); highlight/highlight (9,292★,
  2026-04-16).
- `gh search repos "awesome observability"` (2026-06-16) — adriannovegil/awesome-observability
  (637★, 2026-05-11).
- Cross-ref: ecosystem-02 (OTel demo/collector), -03 (Checkly, awesome-ai-sre), -05 (dockprom,
  LGTM), -08 (Sentry samples source-maps), -11 (Sentry/Prometheus breakage in the same repos).
