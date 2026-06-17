---
title: "canary FIELD INTEL — 'logged everything, learned nothing' + cardinality meltdown"
type: research
created: 2026-06-16
tags: [canary, field-intelligence, logging, noise, cardinality, sampling, signal-vs-noise]
researcher: field-intelligence (CP123 Wave-R)
---

# 03 — "Logged everything, learned nothing": the noise trap + cardinality meltdown

The most expensive observability mistake isn't under-instrumenting — it's drowning the signal.
Every claim cited.

## 03.1 The thesis, in practitioners' own words

> "The more you log, the less you can find — if you log too many trivial details, your important
> signals get buried in noise."
> — recurring framing across the 2025–2026 logging-hygiene literature (Last9, bettrsw, levelup)

> "Some teams spend millions on observability tools only to end up with **dashboards nobody checks,
> alerts nobody trusts, and log streams so noisy they might as well be white noise.**"
> — *The Dark Side of Observability: When Metrics, Logs, and Traces Become Noise*, Medium (2025)
> (https://medium.com/@logic_and_life/the-dark-side-of-observability-when-metrics-logs-and-traces-become-noise-b1c3b0bae0e4)

This is the "logged everything, learned nothing" failure stated three ways: dashboards nobody
checks, alerts nobody trusts (= field-01 alert fatigue), logs that are white noise. **The three
failures are the same failure** — signal destroyed by volume.

## 03.2 The TASTE — log business operations, not technical operations

The opinion that separates good instrumentation from cargo-cult instrumentation:

> "Instrumenting only technical operations like HTTP calls provides technical visibility but not
> business insight; **logging business operations is far more useful than logging low-level
> technical details.**"
> — *Observability is not logging*, Diego Pereira, Medium (Feb 2026)
> (https://dianper.medium.com/observability-is-not-logging-lessons-from-running-microservices-in-production-a289b39c76b6)

> "Observability should be **designed as part of the system from the beginning, not added later as
> a reaction to incidents.**"
> — same source (Pereira, Feb 2026)

→ The junior move: log every function entry/exit "for debugging." The senior move: emit a small
number of *high-information* events tied to business meaning (order placed, payment failed, agent
run completed) with rich context attached. This is the bridge to field-05 (wide events): one fat
event > a thousand thin log lines.

## 03.3 Sampling is the answer the average engineer resists

> "Keeping every info log is wasteful at scale, but **retaining all errors and warnings while
> compressing/sampling info aggressively** keeps the signal while cutting noise."
> — logging-best-practices synthesis (Last9, 2025 https://last9.io/blog/logging-best-practices/)

The taste: **sample the boring, keep all the scary.** Errors/warnings = keep 100%. Info/debug =
sample hard (head-based or tail-based). The resistance comes from the fear of "what if I needed
that one log line" — which the data says almost never pays off relative to the noise/cost it
creates. (Connects to the Sentry sampling-regret discussion in field-04.)

## 03.4 The cardinality meltdown — the metrics version of the same trap

If logging-everything is the logs failure, **cardinality explosion is the metrics failure** — and
it is *the* observability cost driver (field-02 showed it's up to 52% of a Datadog bill).

The canonical worked example (memorize the multiplication — it's how you explain it to a PM):
> "Tracking a `method` (5 values), a `status_code` (5 values), and a `pod_id` (1,000 values)
> results in **25,000 unique time series** — and adding a `user_id` (1,000,000 values) turns this
> into **25 BILLION series.**"
> — *OpenTelemetry Cardinality Meltdown*, tech-champion.com (2026)
> (https://tech-champion.com/cloud-computing/opentelemetry-cardinality-meltdown-navigating-the-observability-tax-crisis/)

> "Cardinality explosion ... can cause surprisingly high costs in the observability system, or even
> be **leveraged by hackers to launch a denial-of-service attack.**"
> — *Handle High-Cardinality Metrics in OpenTelemetry Without Blowing Your Budget*, oneuptime
> (2026-02-06) (https://oneuptime.com/blog/post/2026-02-06-handle-high-cardinality-metrics-opentelemetry/view)
> ← The under-appreciated angle: high-cardinality labels are a **security/DoS surface**, not just a
> cost surface. An attacker who can inject a unique label value per request can bankrupt your obs
> bill. canary should treat unbounded label values as a vuln class.

**The fix practitioners converge on (the OTel-native move):**
> Use **"Drop" processor configurations within the OpenTelemetry Collector to prune these
> dimensions before they exit the private network.**
> — oneuptime (2026-02-06, same URL)

→ **canary-actionable:** the Collector `transform`/`filter`/`attributes` processors are the
cardinality firewall. canary's value-add: detect which label is the cardinality bomb (the
`user_id`/`request_id`/`pod_id`-shaped one) and recommend dropping/bucketing it BEFORE the bill.
The rule of thumb: **a label whose value space is unbounded (IDs, emails, URLs, full paths) does
not belong on a metric** — put it on a trace/event instead (field-05). NEVER put unbounded
cardinality on a metric; that's exactly the context metrics force you to discard at write time.

## 03.5 The 2026 amplifier: AI pipelines explode telemetry volume

> "A single LLM pipeline can generate **10 to 50 times more telemetry** than a traditional
> service."
> — sherlocks.ai, *Observability in 2026: More Data, Fewer Answers* (2026)
> (https://www.sherlocks.ai/blog/observability-trend-in-2026)

This is the canary/agentmoney-era twist on the noise trap: agent/LLM workloads produce 10–50× the
telemetry, so the "logged everything" failure mode is now 10–50× more expensive and 10–50× more
likely to bury the signal. The boundary discipline (canary reads latency/errors, agentmoney reads
tokens/cost — ecosystem-00) is partly a *noise-control* mechanism: split the firehose by owner so
neither harness drowns.

## 03.6 The DISPUTE (feeds GAPS-AND-DISPUTES): retention vs sampling vs "keep it all cheap"
- **Sample aggressively** (Last9, OTel community): drop info/debug, you'll never miss it, and it's
  the only thing that scales.
- **Keep it all, just store it cheap** (ClickHouse/OpenObserve/Hydrolix camp, 2026): with
  columnar cheap storage you DON'T have to sample — sampling throws away the one event you needed.
  "The industry is solving cost" by going to cheaper stacks. (https://clickhouse.com/resources/engineering/datadog-alternatives)
- **canary's read:** sampling is mandatory for *metrics cardinality* (you literally cannot keep
  25B series), optional-and-contested for *logs/events* (cheap columnar storage genuinely changes
  the math). Don't conflate the two: "keep it all cheap" works for events, NOT for high-cardinality
  metric series. UNSETTLED for logs — capture both.

## Sources
- https://medium.com/@logic_and_life/the-dark-side-of-observability-when-metrics-logs-and-traces-become-noise-b1c3b0bae0e4 (2025)
- https://dianper.medium.com/observability-is-not-logging-lessons-from-running-microservices-in-production-a289b39c76b6 (Feb 2026) — log business ops not technical ops
- https://last9.io/blog/logging-best-practices/ (2025) — keep errors, sample info
- https://tech-champion.com/cloud-computing/opentelemetry-cardinality-meltdown-... (2026) — 25B-series math
- https://oneuptime.com/blog/post/2026-02-06-handle-high-cardinality-metrics-opentelemetry/view (2026-02-06) — drop-processor fix + DoS angle
- https://www.sherlocks.ai/blog/observability-trend-in-2026 (2026) — LLM pipeline 10–50× telemetry
- https://clickhouse.com/resources/engineering/datadog-alternatives (2026) — keep-it-all-cheap counter-camp
