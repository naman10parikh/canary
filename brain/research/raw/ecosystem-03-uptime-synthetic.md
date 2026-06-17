---
title: "canary ecosystem research — uptime / synthetic monitoring"
type: research
created: 2026-06-16
tags: [canary, observability, uptime, synthetic, checkly, betterstack, uptimerobot, playwright, monitoring-as-code]
researcher: ecosystem (CP123 Wave-R)
---

# 03 — Uptime & synthetic monitoring

"Is the endpoint up / is the checkout flow working / what's the p95?" — canary's availability
pillar. Three canonical tools + the emerging AI-SRE layer.

## 3.1 The three tools — honest trade-off matrix

| | **Checkly** | **Better Stack** | **UptimeRobot** |
| --- | --- | --- | --- |
| **Category** | Monitoring-as-Code (MaC) | Full obs + incident platform | Simple uptime |
| **Synthetic / browser** | ✅ first-class native `@playwright/test` | ✅ Playwright transaction checks (real Chrome) | ❌ none ("keyword monitoring doesn't work on dynamically-loaded JS") |
| **Define checks as code** | ✅ TS constructs + `.spec.ts` + Terraform + Pulumi | partial | ❌ UI only |
| **Min check frequency** | sub-minute (browser on schedule) | 30s (paid) | 60s (Team), 30s (Enterprise only) |
| **On-call / incident mgmt** | alert channels only | ✅ built-in rotations, escalation, post-mortems | ❌ routes to PagerDuty/Opsgenie |
| **Logs/metrics/traces** | OTel ingest | ✅ logs (SQL/PromQL), metrics, eBPF traces, errors | ❌ none |
| **AI agent** | ✅ **Rocky** (early 2026) triages failures, analyzes packet captures/traceroutes | ✅ **AI SRE** (eBPF service maps + OTel + logs + metrics + errors) | ❌ none |
| **Free tier** | 10 uptime + 1k browser + 10k API + 6 locations + 1 user | 10 monitors, 3-min, 1 status page | **50 monitors, 5-min** — BUT 2025 ToS: *free = personal/non-commercial only* |
| **Entry paid** | Starter $24/mo annual ($288/yr) | $21/mo per 50 monitors; **Responders +$29/mo each** for on-call/SMS | Solo $7/mo (10 mon, 60s); Team $29/mo (100 mon, 3 seats) |
| **Best for** | **agents + dev teams** (code-native) | teams wanting one-pane incident lifecycle | cheapest "is it up" pings |

Sources: betterstack.com/community/comparisons/better-stack-vs-uptimerobot/ (fetched 2026-06-16);
stackscored.com/pricing/uptime-monitoring/checkly/ + europeanpurpose.com/tool/checkly (2026);
WebSearch betterstack-vs-uptimerobot + checkly-as-code (2026-06-16).

### Honest weaknesses (from the BetterStack comparison page, 2026-06-16 — note self-interest)
- **Better Stack:** smaller free tier (10 vs 50 monitors), no UDP monitoring, newer/smaller
  integration ecosystem (~20 vs ~100+). The comparison is BetterStack-authored → discount the
  framing, trust the feature facts.
- **UptimeRobot:** relies on external tools for on-call/incident (raises TCO), no observability
  beyond uptime, static keyword monitoring can't validate JS-rendered SPAs, SMS/voice credits
  deplete during incident storms. The 2025 ToS change (free tier = non-commercial) is a real
  gotcha: a fleet product using the free tier commercially is out of compliance.
- **Checkly:** priciest entry of the three for pure uptime; its value is the MaC/Playwright/agent
  story, not cheap pings.

## 3.2 Checkly = the agent-native choice (deep dive)

Checkly **pioneered "Monitoring as Code"** — checks live as TypeScript in Git, deploy via CI/CD.
Why it's the canary-relevant pick: **monitoring config is *code an LLM reads and writes
natively*, not opaque UI state.** (checkly/checkly-cli, fetched 2026-06-16.)

- **Constructs:** `ApiCheck` (URL + `AssertionBuilder.statusCode().equals(200)`), `BrowserCheck`
  (a plain `*.spec.ts` using `@playwright/test` — **no proprietary scripting language, no vendor
  lock-in**), `MultiStepCheck` (multi-request user journeys).
- **Workflow:** `npx checkly test` (run locally) → `npx checkly deploy` (publish to cloud, runs
  on schedule from 22 global locations). Versions in Git, deploys in CI.
- **THE agent feature:** `npx skills add checkly/checkly-cli` — Checkly ships an **installable
  Claude/agent skill** that gives an agent the docs, patterns, and examples to author and modify
  checks autonomously. This is exactly canary's pattern: an agent that owns monitoring-as-code.
- **Also supports:** OpenTelemetry ingest, Terraform provider (`checkly/terraform-provider-checkly`,
  44★, pushed 2026-06-08), Pulumi provider (`checkly/pulumi-checkly`, 20★, 2026-04-24).
- **Rocky** (AI agent, early 2026): auto-triages failures, analyzes packet captures + traceroutes,
  surfaces root cause without manual digging. (europeanpurpose.com/tool/checkly, 2026.)
- **Repo:** checkly/checkly-cli — **94★, latest v8.8.0 (2026-06-15), 98% TS.** Very alive.

## 3.3 The AI-SRE layer (the 2026 frontier canary must track)

2026 is being called "the year of autonomous incident resolution" — AI agents that move through
**detection → correlation → investigation → remediation → verification → learning**, claiming up
to **70% MTTR reduction**. (medium.com/devops-ai-decoded …073807b2209d, Apr 2026;
augmentcode.com/guides/ai-sre-ai-powered-site-reliability-engineering, 2026.)

Players (each is a "canary-shaped" competitor — an agent operating obs tools):
- **Sentry Seer** (see ecosystem-01) — error-first, drafts fix PRs.
- **Better Stack AI SRE** — investigates across eBPF service maps + OTel traces + logs + metrics
  + errors + web events simultaneously. (betterstack.com/ai-sre.)
- **Datadog Bits AI SRE** — native access to Datadog's full dataset (infra metrics, APM traces,
  logs, RUM, DB monitoring, network paths, profiler).
- **incident.io AI SRE**, **Resolve AI** (multi-agent, parallel-hypothesis, generates PRs +
  kubectl + scripts), **Checkly Rocky**.
- **Remediation safety ladder** (important design pattern for canary): start with reversible
  low-risk actions (clear cache, restart hung instance, scale under load, collect diagnostic
  bundle); gate higher-risk actions behind demonstrated history + explicit human approval. This
  is the right autonomy model for canary too.

**Starter/reference repo for the whole category:** `agamm/awesome-ai-sre` — "100+ AI-powered
tools, platforms, and resources for SRE — agents, incident management, observability, AIOps,
chaos engineering." This is the single best map of canary's competitive landscape.
(github.com/agamm/awesome-ai-sre, surfaced 2026-06-16.)

## 3.4 What an AGENT operating uptime monitoring needs

- **Prefer monitoring-as-code (Checkly) over UI tools** — an agent can author a `BrowserCheck`
  `.spec.ts`, run `npx checkly test` to validate, and `npx checkly deploy`. Deterministic,
  reviewable, snap-back-able (fits canary's commit-convention model).
- **The `@playwright/test` substrate is shared** with the energy harness's own `playwright-cli`
  / `playwright-test` skills — so canary's synthetic checks and its UI-testing skill use the same
  engine. Reuse, don't reinvent.
- **APIs/CLIs:** Checkly CLI + REST API + Terraform/Pulumi; Better Stack REST API + Terraform
  provider; UptimeRobot REST API (v2/v3, API-key auth, simple monitor CRUD).
- **Don't use UptimeRobot free tier for a commercial fleet product** (2025 ToS). For canary's own
  dogfooding a paid Checkly or Better Stack tier, or self-hosted, is the compliant path.

## Sources
- betterstack.com/community/comparisons/better-stack-vs-uptimerobot/ (fetched 2026-06-16) —
  full pricing/feature/weakness matrix, UptimeRobot 2025 ToS, Playwright transaction checks.
- checkly/checkly-cli GitHub (fetched 2026-06-16) — MaC workflow, constructs, `skills add`,
  94★/v8.8.0/2026-06-15.
- stackscored.com/pricing/uptime-monitoring/checkly/ + europeanpurpose.com/tool/checkly (2026) —
  Checkly pricing tiers + Rocky AI agent.
- `gh search repos "checkly monitoring"` (2026-06-16) — Terraform/Pulumi providers + meta.
- medium.com/devops-ai-decoded/the-ai-sre-agent-revolution…073807b2209d (Apr 2026);
  augmentcode.com/guides/ai-sre… (2026) — AI-SRE category, 70% MTTR, remediation ladder.
- betterstack.com/ai-sre + betterstack.com/community/comparisons/ai-sre-tools/ +
  …/incidentio-ai-sre-alternatives/ + …/sentry-seer-alternatives/ (2026-06-16) — AI-SRE players.
- github.com/agamm/awesome-ai-sre (surfaced 2026-06-16) — category map / starter reference.
