---
name: tame-cardinality-and-percentiles
description: Fix the two metric footguns that silently corrupt every downstream signal — unbounded label cardinality (the bill bomb / DoS) and averaged percentiles (the p99 that lies). Use when the user says "metrics bill blew up", "Prometheus OOM", "p99 lies / is wrong", "averaging percentiles", "cardinality bomb", "too many series", or "user_id on a metric". Encodes never-unbounded-labels and never-average-percentiles.
allowed-tools: Bash(canary:*), Bash(promtool:*), Read, Grep, Edit
---

# tame-cardinality-and-percentiles

> Two of the most-violated rules in metrics. Never put unbounded cardinality on a metric (it is up to
> **52% of a Datadog bill** AND a DoS surface), and never average percentiles (`avg(per-pod p99)` is the
> shibboleth that identifies someone who's been burned). (BATTLE-TESTED **S8/S9**, OPINIONS **B3/B5**,
> KNOWN-PITFALLS **§5/§6**.)

## Trigger

Invoke when the obs bill jumps, Prometheus OOMs, a "fleet p99" panel disagrees with user reports, or any
PromQL/metric config mentions `user_id`/`request_id` on a label or `avg(...p99...)`. Also G7 (percentiles)
and G8 (cardinality) in the eval set.

## Steps — cardinality (§5, S8, OPINIONS B3)

1. **Find the bomb.** `canary cardinality <dir> --json` flags unbounded label values — `user_id`,
   `request_id`, `email`, full `url.path`, `pod_id`, even `span_id` (OTel #44478). The math:
   `method`(5) × `status`(5) × `pod_id`(1,000) = 25k series; add `user_id`(1M) → **25 BILLION series.**
2. **Strip it before it exits the network.** Emit the OTel Collector `filter`/`transform`/`attributes`
   processor config to drop the offending label (canary's `cardinality` output includes this). A static
   drop-list is table stakes; by 2026 prefer the dynamic **Cardinality Guardian** (HLL++) processor —
   static lists "drop the entire datapoint" and only help *after* you know which label exploded (§5.2).
3. **Move the value where context belongs.** The high-cardinality value goes on a **trace/event**, never
   the metric — that unbounded value is exactly the context metrics force you to discard at write time.
4. **Treat it as a DoS/security surface (§5.2), not just cost** — an attacker injecting unique label
   values per request can bankrupt the obs bill.

## Steps — percentiles (§6, S9, OPINIONS B4/B5)

5. **Never average percentiles (§6.1 — the shibboleth).** Replace `avg(per-pod p99)` / `mean(per-host
   p95)` with `histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))` —
   aggregate the **histogram** buckets across instances FIRST, then recompute. Percentiles are positions
   in a distribution, not arithmetically combinable; the averaged number is *optimistically* wrong.
6. **Headline p50 + p99 + the gap, never `avg` (§6.3, B4).** Averages hide the pain (1,000 fast + 50 slow
   → avg ~200ms looks flat). Report p50, p99, and the **p99/p50 gap** (variance = unreliability).
7. **Use native histograms (§6.2).** Prometheus 3.x native histograms auto-bucket exponentially —
   hand-picked classic `le` boundaries silently mis-measure the tail (boundary at 1s when real p99 is 1.2s).
8. **Pick the tail by fan-out (OPINIONS C4, S13).** For an agent making ~50 tool calls, p99 fires on
   `1 − 0.99^50 ≈ 39%` of runs — watch **p99.9** end-to-end, not per-service p99. Beware **coordinated
   omission** (§6.4): closed-loop load testers under-report the tail; use HdrHistogram-based tools (wrk2).
9. **Validate.** `promtool check rules` on any changed rule; `canary audit <dir>` to confirm no §5.1
   (unbounded label) or §6.1 (averaged percentile) finding remains.

## Output

- The unbounded label identified, the Collector strip config to remove it, and a statement of where the
  value should live (a trace/event).
- The PromQL rewritten to aggregate histograms before computing the quantile; headline = p50 + p99 + gap.
- A tail-percentile recommendation as a function of fan-out (p99 for single-call, p99.9 for an agent loop).
- `canary audit` reports **zero** §5.1 and §6.1 findings.

**Refuses:** an unbounded label on a metric; `avg`/`mean` over per-instance percentiles; `avg` as the
headline latency; a static drop-list as the only cardinality defense.
