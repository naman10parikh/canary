---
title: "canary FIELD INTEL — real breakage from GitHub issues + maintainer threads (verbatim)"
type: research
created: 2026-06-16
tags: [canary, field-intelligence, github-issues, sentry, opentelemetry, sampling, cardinality, verbatim]
researcher: field-intelligence (CP123 Wave-R)
---

# 05 — Real breakage, in the maintainers' own trackers (verbatim, gh-verified)

These are NOT listicles — they are open/closed issues pulled live via `gh search/view` on
2026-06-16. Each is a real pain point the maintainers themselves track. (Complements
ecosystem-11, which catalogued high-engagement issues; THIS file pulls the *practitioner language*
that reveals the taste/regret/dispute.)

## 05.1 Sentry: the sampling-regret nuance, stated by a real user

**getsentry/sentry #84943 — "Feature request: apply sampling only after N occurrences"**
(opened 2025-02-11, 9 comments, still open as of 2026-06-16)
(https://github.com/getsentry/sentry/issues/84943)

Verbatim problem statement (this is the single best articulation of WHY flat sampling is a regret):
> "The sample rate applies to all error events. However, **the first occurrence of an error is
> often very useful to know about** — for example, if an error occurs during internal testing
> before a feature is released. It would be really useful if we could configure different sampling
> rates based on the number of times the error has occurred (e.g. **100% for the first 100
> occurrences and 5% after that**)."

→ **The lesson:** the regret with sampling isn't "we sampled," it's "we sampled UNIFORMLY." The
information value of an error event is NOT uniform — the **first** occurrence (novel error, maybe
pre-release) is worth ~100×, the 10,000th is worth ~nothing. canary should encode: **keep the
novel, sample the repeated** (occurrence-count-aware sampling). The maintainer's reply points to
the SDK-side `error_sampler` callback (Python) as today's workaround — i.e. you must hand-roll it.

## 05.2 Sentry: the low-volume false-positive footgun (and the correct fix)

**getsentry/sentry #66988 — "Metric Alerts: Prevent failure rate triggers during periods of low
volume"** (opened 2024-03-14, reopened/active 2026-06-03)
(https://github.com/getsentry/sentry/issues/66988)

Verbatim:
> "These aggregates only support a single threshold, which can result in **noisy alerts during
> periods of low volume where a single failure could trigger the alert.** ... We need a way to
> separately define a **minimum number of users, or minimum number of failures, before triggering
> the alert.** One way ... add the ability to define formulas which use multiple aggregate (such
> as `failure_rate()` and `count(errors)`)."

→ **The lesson (textbook SRE, confirmed in the vendor's own tracker):** a *rate* alert
(`failure_rate > 5%`) is a lie at low volume — 1 error out of 3 requests = 33% failure rate = page
at 3 AM for nothing. **The fix is a minimum-volume gate** (`failure_rate > 5% AND count > N`).
This is the SAME discipline as multi-window burn-rate (ecosystem-07): never alert on a ratio
without a denominator floor. canary should NEVER emit a percentage-threshold alert without a
volume guard. (That this is still open in 2026 in Sentry shows even mature tools ship this footgun
by default.)

## 05.3 OpenTelemetry: the cardinality meltdown is real enough to need a dedicated processor

**open-telemetry/opentelemetry-collector-contrib #47368 — "Component donation:
[processor/cardinality] Donate Cardinality Guardian processor"** (Accepted Component, 2026-04-03)
(https://github.com/open-telemetry/opentelemetry-collector-contrib/issues/47368)
Upstream impl: https://github.com/YElayyat/otel-cardinality-processor

Verbatim — why existing tools are insufficient (this is the 2026 state-of-the-art on the fix):
> "There is **no direct equivalent** in the Collector ecosystem. The closest alternatives are the
> filterprocessor or metricstransformprocessor. However, **those rely on static allow/deny lists
> and drop the entire datapoint.** Cardinality Guardian is unique because it **dynamically tracks
> dimensions probabilistically (HLL++) and surgically strips only the offending labels.**"

→ **The lesson:** the community has CONVERGED that static drop-lists (the field-03 fix) are table
stakes but insufficient — by the time you know which label exploded, you've already paid. The
2026 move is **dynamic, probabilistic cardinality detection (HyperLogLog++) that strips the
offending label automatically.** This is a direct canary capability target: don't just let users
configure a drop-list, *detect* the cardinality bomb at runtime and quarantine the label. (Also
#44478 "Drop exemplars/span_id (high cardinality fixes)", open 2026-06-01 — even span_id leaks
into metric cardinality.) (https://github.com/open-telemetry/opentelemetry-collector-contrib/issues/44478)

## 05.4 Self-hosted Sentry: the operational-tax war story (HN, verbatim)

**HN: "I gave up on self-hosted Sentry (2024)"** (https://news.ycombinator.com/item?id=43725815)
and the Bugsink write-up it's discussing
(https://www.bugsink.com/blog/why-i-gave-up-on-self-hosted-sentry/)

The concrete operational reality (the numbers that kill the "just self-host it" reflex):
- **~30 Docker containers; ≥8 GB RAM, ≥4 cores minimum.** Components: sentry, sentry-relay, snuba,
  celery, redis, clickhouse, zookeeper, kafka — "require continuous care and feeding, and will
  inevitably break down at some point."
- Verbatim user comments (HN):
  > "It's a ton of docker containers. Things will fail randomly or maybe with a lot of traffic.
  > Hard to upgrade or it would upgrade automatically and break."
  > "If you can dedicate like 1/4 to 1/2 an engineer on it then i think its worth it, keeping in
  > mind that it is an **absolute bear with an ungodly amount of stateful dependencies.**"
- **Sentry's OWN docs hedge:** "we don't necessarily recommend self-hosting to everyone."
  (https://news.ycombinator.com/item?id=43726421)

→ **The lesson:** the self-host-to-save-money story (field-02) has a hidden line item: **¼–½ an
engineer** + an 8-component stateful stack that breaks on upgrade. For canary's *own dogfood*, this
is why the recommended pattern is hosted Sentry + a hand-rolled `runs.jsonl`-shaped local trail
(ecosystem-00), NOT self-hosted Sentry. The operational tax of self-hosting an error tracker is
itself an availability risk — you'd need canary to monitor your canary.

## 05.5 The meta-lesson across all four

Every one of these is the SAME shape: **the default configuration ships the footgun.** Flat
sampling (not occurrence-aware), rate alerts (no volume floor), unbounded labels (no cardinality
guard), self-host (no sized-team warning). canary's differentiator is to ship the *non-footgun*
default and to DETECT when a user is standing on one. "Sensible defaults that resist the four
classic footguns" is a product thesis straight out of the maintainers' own trackers.

## Sources (all gh/HN-verified 2026-06-16)
- https://github.com/getsentry/sentry/issues/84943 (2025-02-11) — occurrence-aware sampling regret
- https://github.com/getsentry/sentry/issues/66988 (2024-03 / active 2026-06-03) — low-volume rate-alert footgun + the `failure_rate() AND count()` fix
- https://github.com/open-telemetry/opentelemetry-collector-contrib/issues/47368 (2026-04-03) — Cardinality Guardian (HLL++ dynamic stripping)
- https://github.com/open-telemetry/opentelemetry-collector-contrib/issues/44478 (2026-06-01) — span_id cardinality leak
- https://news.ycombinator.com/item?id=43725815 + https://www.bugsink.com/blog/why-i-gave-up-on-self-hosted-sentry/ + https://news.ycombinator.com/item?id=43726421 — self-host operational tax (30 containers, ¼–½ eng)
