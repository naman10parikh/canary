---
title: "canary ecosystem research — SYNTHESIS: trade-off matrix, version table, recommended stack, gaps"
type: research
created: 2026-06-16
tags: [canary, observability, synthesis, index, trade-off-matrix, version-table, recommended-stack, gaps]
researcher: ecosystem (CP123 Wave-R)
---

# 13 — Synthesis: the matrix, the versions, the recommended stack, the gaps

This is the index + synthesis over the full `ecosystem-*.md` bundle. Read this first for the map;
drill into the numbered files for the evidence. **All facts here trace to a numbered file with its
own citations.**

## 13.0 The file map

| File | Topic |
| --- | --- |
| ecosystem-00 | Boundary (canary vs agentmoney) + internal corpus (runs.jsonl, checklist) |
| ecosystem-01 | Sentry (errors, tracing, Seer AI triage) |
| ecosystem-02 | OpenTelemetry (traces/metrics/logs, semconv, GenAI split) |
| ecosystem-03 | Uptime/synthetic (Checkly, Better Stack, UptimeRobot) + AI-SRE |
| ecosystem-04 | Structured logging (pino) |
| ecosystem-05 | Grafana / Prometheus / Alertmanager |
| ecosystem-06 | Alerting & on-call (PagerDuty / Opsgenie sunset / Grafana OnCall) |
| ecosystem-07 | SLOs / error budgets / multi-window burn-rate alerting |
| ecosystem-08 | Source maps (the #1 footgun) |
| ecosystem-09 | **Agent-operability** (MCP / CLI / API) — the canary-critical file |
| ecosystem-10 | Release health (crash-free sessions/users) |
| ecosystem-11 | Real-world breakage (high-engagement GitHub issues) |
| ecosystem-12 | Best starter / template / example repos |
| ecosystem-13 | This file — synthesis, matrix, versions, gaps |
| ecosystem-14 | **Gap-closure + corrections (second pass)** — closes §13.5 gaps; corrects the on-call layer |

> **SECOND-PASS UPDATE (2026-06-16):** `ecosystem-14` closes the §13.5 GAPS below and records
> material corrections. The biggest: **Grafana OnCall OSS is archived/dead** (drop it from the
> recommended stack — see §13.3 note), and **PagerDuty + incident.io now have official MCPs**.
> Also: Sentry JS SDK is on **v10** (OTel-v2; `autoSessionTracking` removed in v9 — corrects the
> ecosystem-10 release-health grep), Prometheus **v3.11 is EOL**, and SLO tooling (Sloth 2.5k★ /
> Pyrra 1.5k★) is version-verified. Read ecosystem-14 alongside this file.

## 13.1 The canonical version table (all verified via `gh api` / WebFetch, 2026-06-16)

| Tool | Current version | Released | Stars | Source |
| --- | --- | --- | --- | --- |
| **OTel semantic-conventions** | **v1.42.0** (GenAI moved out) | 2026-06-12 | — | gh api (e-02) |
| OTel semconv-genai (new repo) | Development status | live | 72★ | gh api (e-02) |
| OTel JS SDK | **v2.8.0** stable / exp v0.219.0 | 2026-06-11 | — | gh api (e-13) |
| OTel Python SDK | **v1.42.1** | 2026-05-21 | — | gh api (e-13) |
| OTel Collector (core) | **v0.154.0** | 2026-06-08 | — | gh api (e-13) |
| OTel Collector-contrib | (tracks core) | 2026-06-17 | 4,738★ | gh api (e-12) |
| **Grafana** | **v13.0.2** / v12.4.4 | 2026-06-09 | 74,482★ | gh api (e-05) |
| **Prometheus** | **v3.12.0** / v3.5.3 LTS | 2026-05-28 | 64,591★ | gh api (e-05) |
| **Alertmanager** | **v0.33.0** | 2026-06-12 | 8,510★ | gh api (e-05) |
| **pino** | **v10.3.1** | 2026-02-09 | 17,941★ | gh api (e-04) |
| **Sentry MCP** | **v0.36.0** | 2026-06-08 | 726★ | gh api (e-09) |
| **Grafana MCP** | **v0.16.0** | 2026-06-16 | 3,155★ | gh api (e-05/09) |
| Prometheus MCP (community) | (active) | 2026-06-17 push | 474★ | gh api (e-09) |
| Checkly CLI | **v8.8.0** | 2026-06-15 | 94★ | gh api (e-03/12) |
| **Sentry Seer** | **GA** (Jan 2026), $40/contributor | 2026-01 | — | WebFetch (e-01) |

**Currency headlines (the things that changed in the last 6 months):**
1. **OTel v1.42.0 (Jun 12) moved ALL `gen_ai.*` to a separate repo** — the boundary-critical event
   (e-02 §2.3). An agent reading GenAI telemetry must know which semconv version produced it.
2. **Sentry Seer went GA + repriced to $40/active-contributor** (flat, unlimited) in Jan 2026 — a
   cost-model migration (e-01 §1.2). Plus Seer expanded to local-dev + AI code review (Jan 27).
3. **Opsgenie is being killed** — no new sales since Jun 4 2025, full shutdown + data deletion
   **April 5 2027** (e-06 §6.1). The biggest forced migration in the on-call space.
4. **Grafana 13** launched at GrafanaCON Apr 21 2026 (`enable_gzip` now ON by default — a breaking
   config change) (e-05 §5.2).

## 13.2 THE master trade-off matrix (which tool for which job)

| Question canary answers | Best tool | Why | Honest tradeoff |
| --- | --- | --- | --- |
| Did the app throw an exception? what stack trace? | **Sentry** | discrete events + symbolicated traces + Seer root-cause | needs source maps (e-08); SDK upgrades leak (e-11) |
| What's the p95/p99 latency / error rate trend? | **Prometheus** (+Grafana) | numeric time-series, histograms, `histogram_quantile()` | memory hog; WAL-replay OOM (e-11) |
| Is the endpoint up / is the checkout flow working? | **Checkly** | monitoring-as-code, `@playwright/test`, agent skill | priciest entry for pure uptime (e-03) |
| Cheapest "is it up" ping | **UptimeRobot** | 50 free monitors | no JS/SPA checks; free=non-commercial (e-03) |
| One platform: uptime + logs + on-call | **Better Stack** | consolidated incident lifecycle | Responders +$29/mo each; small free tier (e-03) |
| Did the deploy regress? | **Sentry Release Health** | crash-free sessions/users + adoption | mobile/web-first; needs sessions+release set (e-10) |
| Are we within the SLO / burning budget? | **Prometheus burn-rate rules** | MWMBR (14.4×/6×/1×) | needs recording rules; SLI-as-ratio discipline (e-07) |
| Who got paged / did they ack? | **PagerDuty** or **Grafana OnCall** | mature escalation / OSS + in Grafana MCP | PD priciest; Opsgenie dead (e-06) |
| Structured app logs | **pino** | JSON-to-stdout, fast, redaction, OTel correlation | async transport can drop chars under load (e-11) |
| Vendor-neutral instrumentation substrate | **OpenTelemetry** | one instrumentation → any backend | version/attribute drift; instrumentation can leak (e-02/11) |
| Self-host everything (OSS) | **openobserve** / LGTM stack | unified logs+metrics+traces, no vendor | you operate it (scaling, retention) (e-12) |
| AI debugging / auto root-cause | **Sentry Seer** | reads traces, drafts fix PRs, NL queries | $40/contributor; needs GitHub integration (e-01) |

## 13.3 The recommended canary stack (the opinionated answer)

Synthesizing the whole bundle, the stack canary should *default to* and recommend to the fleet:

1. **Instrument once in OpenTelemetry** (e-02). One instrumentation feeds everything; emit the
   GenAI spans so the canary/agentmoney split (e-00) works off shared spans. Pin a known semconv
   version and track the v1.42 GenAI-repo split.
2. **Errors + traces + release health + Seer → Sentry** (e-01, e-08, e-10). It's the checklist
   default, has the best AI-debugging (Seer GA), and a mature first-party MCP (e-09). Get source
   maps right in CI (debug IDs, e-08) — it's upstream of everything.
3. **Metrics + SLO burn-rate + dashboards → Prometheus + Grafana** (e-05, e-07). Self-host via
   dockprom (e-12) for canary's dogfood; emit OTel so it shares instrumentation with Sentry.
   Implement the MWMBR burn-rate rules (e-07) as the single "page/ticket/freeze" signal.
4. **Synthetic/uptime → Checkly** (e-03), monitoring-as-code, because it's the most agent-native
   (the agent authors `.spec.ts` checks + has an installable skill).
5. **On-call → Grafana OnCall** if on the Grafana stack (queryable via the Grafana MCP), else
   **PagerDuty** (e-06). Never Opsgenie (dead 2027).
6. **Logs → pino** (e-04), JSON-to-stdout + redaction + OTel trace correlation; canary's own
   internal trail stays `runs.jsonl`-shaped (e-00) — the hand-rolled pino it dogfoods.
7. **Operate it all as an agent through MCPs** (e-09): Sentry MCP + Grafana MCP give native query
   access; CLIs (`sentry-cli`, `checkly`, `amtool`, `promtool`) for config; REST APIs as fallback.

**The single most differentiating canary insight (from the breakage data, e-11):** the alert
*delivery* path is the most under-tested, most failure-prone link (AM #226 resolve-gap still open;
#2404 alerts-not-reaching-webhook open; #3920 Teams-webhook killed). **canary should heartbeat-
test each notification channel end-to-end**, not trust that a firing rule = a delivered page. No
competitor markets this; it falls straight out of reading the real issues.

## 13.4 The boundary, restated (so the two harnesses never fight)
**canary = app health** (errors, latency, uptime, release health, SLO burn, paging/MTTR). 
**agentmoney = cost** ($/call, tokens, cache savings, $/model). The seam is a **shared OTel GenAI
span**: canary reads `gen_ai.client.operation.duration` + `.exception` + `error.type`; agentmoney
reads `gen_ai.usage.*_tokens` + cache attrs (e-00, e-02 §2.3). LLM *latency/errors* are canary's;
LLM *spend* is agentmoney's. OTel itself drew the line (a dedicated GenAI exception/timeout event
exists separate from token-usage metrics).

## 13.5 GAPS-AND-DISPUTES (what I could NOT confirm)

> **STATUS after ecosystem-14 (second pass, 2026-06-16):** gaps #1 (JS-SDK + Prometheus + SLO
> versions), #2 (Grafana OnCall roadmap — **CLOSED: it's dead/archived**), and #3 (first-party
> MCPs — **PagerDuty + incident.io now have official MCPs**) are now CLOSED or corrected in
> ecosystem-14. The residual leftovers (non-JS Sentry SDK changelogs, exhaustive PagerDuty/
> incident.io MCP tool lists, AI-SRE competitor depth, Grafana 13 patch contents) are carried
> forward in **ecosystem-14 §14.8**. The original text is preserved below for the record.

1. **Granular per-minor SDK changelogs.** I have the *current versions* of every tool verified via
   `gh api`, but did NOT crawl month-by-month changelog deltas for: the `@sentry/node`/`nextjs`
   SDK minors, Prometheus v3.11→v3.12 specifics, Grafana 13.x patch contents. The *product-level*
   deltas (Seer GA/pricing, OTel GenAI move, Opsgenie sunset, Grafana 13 gzip) ARE primary-sourced;
   the SDK-minor granularity is the gap. (Flagged in e-01 §1.3, e-02 §2.1, e-05 §5.3.)
2. **Grafana OnCall OSS long-term maintenance.** I recommend Grafana OnCall as the agent-native
   on-call pick *if on Grafana* (queryable via the Grafana MCP), but Grafana Labs has historically
   deprecated OSS features toward Cloud. I could NOT confirm OnCall OSS's roadmap is safe through
   2027 — must be re-verified before the fleet bets on it. (Flagged e-06 §6.2.)
3. **First-party MCP servers for the non-anchor tools.** Confirmed first-party MCPs: Sentry (726★),
   Grafana (3,155★), Datadog (official, 41★). Confirmed *community* Prometheus MCP (474★). Could
   NOT confirm any first-party MCP for PagerDuty, incident.io, Checkly (it has a *skill*, not an
   MCP), Better Stack, or pino. These are REST-API-only for agents today. (e-09 §9.1.)

Two additional honest caveats (not full gaps, but disclosed bias):
- The Checkly vs Better Stack vs UptimeRobot matrix (e-03) leans on a *BetterStack-authored*
  comparison page — feature facts trusted, framing discounted.
- SLO tooling versions (Sloth/Pyrra/Nobl9, e-07 §7.5) were named but not version-verified this pass.

## Sources
- All facts trace to ecosystem-00 through ecosystem-12 (each with its own citations). Net-new
  verifications in this file: `gh api repos/open-telemetry/opentelemetry-js|...-python|...-collector
  /releases` (2026-06-16) — OTel JS v2.8.0, Python v1.42.1, Collector v0.154.0.
