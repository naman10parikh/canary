---
title: "canary FIELD INTEL — p99 vs p50: the percentile lessons that bite"
type: research
created: 2026-06-16
tags: [canary, field-intelligence, percentiles, p99, p50, latency, tail-latency, sre-math]
researcher: field-intelligence (CP123 Wave-R)
---

# 04 — p99 vs p50: the percentile lessons engineers learn the hard way

Latency is where averages lie and where most dashboards are subtly, expensively wrong. Cited.

## 04.1 The foundational taste: averages are a lie, and watching only them makes you blind

> "If your team only watches averages, you are **blind to the part of the system that causes the
> most pain.**"
> — One2N, *Percentiles in SRE: Why averages lie about latency*
> (https://one2n.io/blog/sre-math-percentiles-in-sre-why-averages-lie-about-latency)

The worked example every SRE should have memorized:
> "Your system handles 1,000 requests in 100 ms. At the same time, 50 requests take between 2 and 5
> seconds. The math produces an average of about **200 ms**. ... The dashboard shows a stable, flat
> number. But those 50 requests still matter. Each one represents a frustrated user who waited
> seconds instead of milliseconds." — One2N (same URL)

> "P99 can run **100× slower than P50** on the same dataset." — multiple sources
> (https://medium.com/@subodh.shetty87/not-all-slowness-is-equal-... ; web-alert.io guide)

**canary lesson:** never alert on or report `avg` latency as the headline number. The headline is
**p50 (typical) + p99 (tail)**, and the *gap between them* (next section).

## 04.2 THE most informative single signal: the p50↔p99 gap (variance = unreliability)

> "The gap between P50 and P99 is often the **most informative single signal.** A tight gap means
> the system is stable. ... a wide gap means something is introducing variance, and **variance is
> what makes a system feel unreliable even when the average says otherwise.**"
> — web-alert.io latency-percentiles guide (2026)
> (https://web-alert.io/blog/latency-percentiles-p50-p95-p99-explained-monitoring-guide)

> "Use p50 to describe the typical case. Use p95 to check if a minority of users are degraded. Use
> p99 to protect against tail latency that destroys trust." — same guide.

→ **canary product instinct:** don't just plot p50 and p99 separately — surface the **ratio/gap**
as a first-class health signal. A widening p99/p50 ratio is an early warning of queueing/contention
*before* the average moves. This is a differentiator most dashboards miss.

## 04.3 The error 9 in 10 engineers make: YOU CANNOT AVERAGE PERCENTILES

This is the single most important and most-violated rule in latency monitoring.

> "**You can't average percentiles across instances** — if 10 servers each report their own p95,
> the mean of those values is **not** a valid fleet-wide p95. You need to **aggregate the
> underlying histogram data first, then recompute.**"
> — Last9, *Your Percentiles are Incorrect P99 of the Times*
> (https://last9.io/blog/your-percentiles-are-incorrect-p99-of-the-times/)

> "Percentiles represent **positions in a distribution, not values you can arithmetically
> combine.**" — same source.

The correct mechanism:
> "To aggregate correctly you must either keep the raw data or use a **mergeable structure
> (histograms, t-digest, HdrHistogram).**" — Last9 (same).

→ **canary lesson, and a migration-bug detector:** any dashboard that computes a service-wide p99
by averaging per-pod p99s is **wrong** — usually optimistically wrong (it under-reports the tail).
This is *also* the silent-failure class from the migration war stories (field-02 §02.3): two
backends bucket histograms differently, so a "p99" panel can change meaning across a migration
while looking identical. canary should: (a) compute percentiles from histograms/`histogram_quantile()`
not from pre-aggregated percentiles, and (b) when verifying a migration, diff the *histogram*, not
the percentile.

## 04.4 The "tail at scale" insight: your p99 is your power-user's MEDIAN

The counterintuitive truth that reframes why the tail matters more than the headline number:

> "Across microservice architectures, a 1% slow-request probability per service snowballs until
> **most end-to-end calls touch at least one bottleneck. Your p99 backend latency becomes your
> users' median experience** — this is why tail latency, not average latency, is the number that
> correlates with **churn, abandoned carts, and angry tickets.**"
> — synthesized across percentile literature, 2025–2026 (web-alert.io; redis.io p99 blog
> https://redis.io/blog/p99-latency/ ; reliablepenguin 2025-12-27)

> "Even if just 1% of requests are slow, those could affect **thousands of users** ... at high
> traffic volumes, a 'rare' 1% occurrence happens frequently." — same synthesis.

This is the Gil Tene "tail at scale" argument (the canonical talk "How NOT to Measure Latency"):
a page that makes 100 backend calls hits a p99 event on ~63% of page loads (1 − 0.99^100). So the
p99 is not "1 in 100 users occasionally" — at fan-out it's the *common* experience. **canary should
reason about end-to-end tail, not per-service tail**, because per-service p99 dramatically
under-states user-perceived pain under fan-out.

## 04.5 Where to alert: the practitioner consensus (and the nuance)

- **Alert on p95 or p99, never avg.** "Rising p95 or p99 latency as throughput grows indicates
  **queues forming**" / "A spike in p99 latency often coincides with budget burn." — One2N.
- **But guard the percentile alert with a volume floor** — same footgun as field-05 §05.2: at low
  request volume a single slow request spikes p99 to meaningless heights. p99 over 5 requests is
  noise. (This is why Sentry #66988 exists.)
- **The hockey-stick warning:** "p50 to p90 might be close together, then shoot up sharply at p99
  and beyond." Don't extrapolate p99 from p50/p90 — measure it directly; the tail is non-linear.

## 04.6 The DISPUTE (feeds GAPS-AND-DISPUTES): how high do you go? p99 vs p99.9 vs p99.99
- **p99 is enough** (most teams): beyond p99 the data gets too sparse to be stable, and you're
  chasing single-request noise.
- **p99.9 / p99.99 matter at scale** (Tene/large-fan-out camp): at fan-out, p99 IS the median
  (§04.4), so the *real* tail you must protect is p99.9+. Amazon/Google historically targeted
  p99.9.
- **canary's read:** the right tail percentile is a function of your fan-out. Single-call service →
  p99. Heavy fan-out (an agent making 50 tool calls — exactly canary's own workload!) → you must
  watch p99.9 because 1 − 0.99^50 ≈ 0.39 means p99 fires on 39% of agent runs. UNSETTLED as a
  universal — it depends on call-count-per-user-action. Capture both.

## Sources
- https://one2n.io/blog/sre-math-percentiles-in-sre-why-averages-lie-about-latency — averages-lie, queues-forming, budget-burn
- https://last9.io/blog/your-percentiles-are-incorrect-p99-of-the-times/ — CANNOT average percentiles; t-digest/HdrHistogram fix
- https://web-alert.io/blog/latency-percentiles-p50-p95-p99-explained-monitoring-guide (2026) — p50↔p99 gap = variance = unreliability
- https://medium.com/@subodh.shetty87/not-all-slowness-is-equal-a-developers-guide-to-p50-p95-and-p99-latencies-c473b9ea6fb9 — p99 100× p50
- https://redis.io/blog/p99-latency/ ; https://blogs.reliablepenguin.com/2025/12/27/... — tail-at-scale, when-to-use-which
- Gil Tene "How NOT to Measure Latency" — canonical tail-at-scale + coordinated-omission ur-talk (older, still definitive; flagged)
