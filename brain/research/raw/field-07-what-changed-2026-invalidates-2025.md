---
title: "canary FIELD INTEL — what changed in 2026 that invalidates 2025 conventional wisdom"
type: research
created: 2026-06-16
tags: [canary, field-intelligence, 2026, currency, invalidated-wisdom, genai-observability]
researcher: field-intelligence (CP123 Wave-R)
---

# 07 — What changed in 2026 that invalidates 2025 conventional wisdom

The mission demands June-2026 currency. These are the shifts where a 2025 answer is now WRONG.
Cited, with the old belief → the new reality.

## 07.1 "AI will reduce on-call toil" → toil ROSE 30% despite AI
**2025 belief:** bolt AI summarization/triage onto your alerts and toil drops.
**2026 reality:** "**Toil Rose 30% Despite AI**" — *State of Incident Management 2026*
(https://runframe.io/blog/state-of-incident-management-2025). LogicMonitor's 2026 SRE report:
**34% of engineers' time is toil** *despite* AI adoption (sherlocks.ai). And costs rose 2022→2026
while **MTTR stayed flat** (sherlocks.ai).
→ **Invalidated:** "AI is a toil silver bullet." canary's stance: AI is leverage on a *clean*
signal; on a noisy one it adds a layer. Reduce/correlate first. (field-01, field-06 DISPUTE 2/3.)

## 07.2 "Honeycomb is wide-events; metrics are the enemy" → Honeycomb shipped Metrics GA (Mar 2026)
**2025 belief (per Majors):** metrics are "a terrible building block"; "Datadog and Prometheus are
the last, best metrics-backed tools that will ever be built."
**2026 reality:** **Honeycomb announced Honeycomb Metrics GA in March 2026** — the wide-events
evangelist now sells metrics too.
(https://www.honeycomb.io/blog/honeycomb-advances-observability-for-ai-powered-software-development)
→ **Invalidated:** the absolutist "no metrics" position. The synthesis settled on **wide events as
primary substrate + metrics as a bounded-numeric projection.** canary should NOT adopt a
metrics-are-dead posture in 2026; it's even been walked back by its author. (field-06 DISPUTE 1.)

## 07.3 "Static drop-lists handle cardinality" → 2026 needs DYNAMIC probabilistic detection
**2025 belief:** control metric cardinality with the Collector `filter`/`metricstransform`
processors and a hand-maintained allow/deny list.
**2026 reality:** the OTel community ACCEPTED a new **Cardinality Guardian processor** (donation
2026-04-03) precisely because static lists are insufficient: they "rely on static allow/deny lists
and **drop the entire datapoint**," whereas the new one "**dynamically tracks dimensions
probabilistically (HLL++) and surgically strips only the offending labels.**"
(https://github.com/open-telemetry/opentelemetry-collector-contrib/issues/47368)
→ **Invalidated:** "a drop-list is enough." 2026 best practice = **runtime cardinality detection**.
canary capability target. (field-03, field-05 §05.3.)

## 07.4 "LLM telemetry is just more of the same" → it's 10–50× volume AND a new semconv split
**2025 belief:** instrument LLM calls like any HTTP call.
**2026 reality (two distinct shifts):**
1. **Volume:** "A single LLM pipeline can generate **10 to 50 times more telemetry** than a
   traditional service." (https://www.sherlocks.ai/blog/observability-trend-in-2026) → the
   noise-trap (field-03) and cardinality risk are 10–50× worse for agent workloads.
2. **Semconv split (the boundary-critical event):** **OTel semantic-conventions v1.42.0 (2026-06-12)
   moved ALL `gen_ai.*` conventions to a SEPARATE repo** (`semantic-conventions-genai`). (ecosystem-02
   §2.3; ecosystem-13 §13.1.) → An agent reading GenAI telemetry must now know **which semconv
   version produced it**, because the attribute namespace migrated. This is exactly the canary
   (latency/errors via `gen_ai.client.operation.duration` + `.exception`) vs agentmoney (tokens via
   `gen_ai.usage.*`) seam (ecosystem-00) — and the seam attributes now live in a different repo than
   they did in early 2026.
→ **Invalidated:** "LLM obs == HTTP obs" and "gen_ai.* lives in the main semconv repo." Both are
2025-true, 2026-false.

## 07.5 "Opsgenie is a safe on-call default" → it's being KILLED (data deletion Apr 2027)
**2025 belief:** Opsgenie is a mature, safe PagerDuty alternative.
**2026 reality:** **Atlassian stopped Opsgenie new sales (Jun 4 2025); full shutdown + data
deletion April 5 2027.** (ecosystem-06 §6.1.) The biggest forced migration in the on-call space.
→ **Invalidated:** recommending Opsgenie for anything new. canary must steer the fleet to
PagerDuty or Grafana OnCall, never Opsgenie. (field cross-ref ecosystem-06/13.)

## 07.6 "Sentry tracing is per-transaction priced; tune your txn sample rate" → spans + Seer GA repricing
**2025 belief:** Sentry performance = "transactions" quota; the lever is `tracesSampleRate`.
**2026 reality:** Sentry moved to a **Spans** model (you can exceed Spans quota independent of Errors
quota — see Sentry Help Center) AND **Seer (AI debugging) went GA Jan 2026, repriced to $40/active-
contributor flat-unlimited** + expanded to local-dev + AI code review (Jan 27). (ecosystem-01 §1.2;
ecosystem-13 §13.1.) Spike Protection + dynamic sampling are now the cost levers, not a single SDK
`tracesSampleRate`.
→ **Invalidated:** "tune one transaction sample rate." 2026 = spans-quota + dynamic sampling +
occurrence-aware error sampling (still a feature request, #84943) + Seer's new flat pricing. canary
should reason in spans, not transactions, and know Seer is the GA AI-triage layer. (field-05 §05.1.)

## 07.7 "Grafana config is stable across majors" → Grafana 13 flipped gzip ON by default
**2025 belief:** upgrade Grafana freely; config defaults are stable.
**2026 reality:** **Grafana 13 (GrafanaCON Apr 21 2026) turned `enable_gzip` ON by default** — a
breaking config change that can surprise reverse-proxy setups. (ecosystem-05 §5.2; ecosystem-13.)
→ **Invalidated:** "major-version Grafana upgrades are config-safe." Read the breaking-changes notes.

## 07.8 The meta-shift: "observability = collecting signals" → "observability = explaining causality"
The biggest conceptual 2026 reframe, verbatim:
> "The industry is **solving cost, tooling, and coordination. It is not solving understanding.**"
> "observability was **never designed to explain causality.**"
> (https://www.sherlocks.ai/blog/observability-trend-in-2026)
→ **Invalidated:** "if I collect all three pillars I'm done." 2026 truth: full visibility +
20–40min diagnosis + flat MTTR proves *collection ≠ understanding*. canary's north star in 2026 is
**causal explanation** (link release→error-spike, label→cost-bomb, fan-out→tail), not signal
volume. This is the single most important currency point for canary's product positioning.

## Sources
- https://runframe.io/blog/state-of-incident-management-2025 (2026) — toil +30% despite AI
- https://www.sherlocks.ai/blog/observability-trend-in-2026 (2026) — 34% toil, flat MTTR, 10–50× LLM telemetry, "not solving understanding"
- https://www.honeycomb.io/blog/honeycomb-advances-observability-for-ai-powered-software-development (Mar 2026) — Honeycomb Metrics GA
- https://github.com/open-telemetry/opentelemetry-collector-contrib/issues/47368 (2026-04-03) — Cardinality Guardian (dynamic HLL++)
- Cross-refs to gh/WebFetch-verified currency facts in ecosystem-01/02/05/06/13 (OTel v1.42 GenAI split 2026-06-12; Seer GA Jan 2026 $40/contributor; Opsgenie shutdown Apr 2027; Grafana 13 gzip Apr 2026)
