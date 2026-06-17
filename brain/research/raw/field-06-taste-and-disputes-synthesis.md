---
title: "canary FIELD INTEL — explicit TASTE + the live DISPUTES (the crown-jewel file)"
type: research
created: 2026-06-16
tags: [canary, field-intelligence, taste, disputes, opinions, observability-2.0, charity-majors, gaps]
researcher: field-intelligence (CP123 Wave-R)
---

# 06 — Explicit TASTE + the live DISPUTES

This is the highest-value file: the *opinions great practitioners hold that average ones don't*,
quoted, and the places credible sources **disagree** (both sides verbatim → this directly feeds
GAPS-AND-DISPUTES). An agent that absorbs THIS file will sound like a 10-year SRE, not a docs page.

═══════════════════════════════════════════════════════════════════════════════
## PART A — THE TASTE (opinions that separate senior from junior)
═══════════════════════════════════════════════════════════════════════════════

### A1. "Metrics are a terrible building block — you discard context at write time." (Charity Majors)
The single most important contrarian opinion in the field, from Honeycomb co-founder / ex-Parse,
ex-Facebook Charity Majors:
> "**Metrics are a terrible building block for understanding rich data, because you have to discard
> all that valuable context at write time.**"
> "**Datadog and Prometheus are the last, best metrics-backed tools that will ever be built. You
> can't catch up to them or beat them.**"
> "Many observability engineering teams have spent their entire careers **massaging cardinality to
> control costs. What if you just… didn't have to do that?**"
> — Honeycomb, *It's Time to Version Observability*
> (https://www.honeycomb.io/blog/time-to-version-observability-signs-point-to-yes) +
> charity.wtf observability-2.0 tag (https://charity.wtf/tag/observability-2-0/)

Why it's taste: the average engineer reaches for a metric/dashboard. Majors argues a metric is a
*lossy pre-aggregation* — you decide what to measure at write time and can never ask a new question
of old data. The senior move is to emit **one wide structured event per request** (hundreds of
fields incl. business context) and derive metrics/traces from it, so any question is answerable
post-hoc. canary should bias toward **events-as-substrate** for app health, while pragmatically
keeping metrics for the things that are genuinely numeric+bounded (uptime %, error rate).

### A2. "Page on symptoms, not causes. Every page must be actionable." (Google SRE / Rob Ewaschuk)
The ur-taste of alerting (field-01): if a human can't *do* something about it right now, it is not
a page — it's a ticket or a dashboard line. **The target is ≤2 actionable pages per shift** (Google
SRE Workbook). Junior adds alerts "to be safe"; senior **deletes** alerts to restore trust. The
metric that matters is not coverage, it's the on-call's *belief* that a page is real.

### A3. "Observability is not logging." / "Log business operations, not technical operations."
(field-03) The junior logs every HTTP call and function entry. The senior emits a few
high-information business events. "Instrumenting only technical operations provides technical
visibility but not business insight." (Pereira, Feb 2026). And: **design observability into the
system from the start, not bolted on after the first incident.**

### A4. "You cannot average percentiles." (field-04)
The shibboleth that instantly identifies someone who's been burned: the mean of per-host p99s is
NOT the fleet p99. "Percentiles are positions in a distribution, not values you can arithmetically
combine." (Last9). Aggregate the *histogram* (t-digest/HdrHistogram), then recompute. Anyone who
builds a "fleet p99" panel by `avg(p99)` has revealed they don't understand the math.

### A5. "Your p99 is your power-user's median." (Gil Tene, tail-at-scale) (field-04)
Junior treats p99 as "1-in-100, rare." Senior knows that under fan-out (a page making 100 calls,
or **an agent making 50 tool calls**), p99 fires on the *majority* of user actions (1 − 0.99^100 ≈
63%). Tail latency, not average, is what correlates with churn. Measure end-to-end tail, not
per-service tail.

### A6. "The default config ships the footgun." (field-05, from the maintainers' own trackers)
Flat sampling (not occurrence-aware: Sentry #84943), rate-alerts with no volume floor (Sentry
#66988), unbounded metric labels (OTel Cardinality Guardian #47368), self-host with no team-size
warning (HN). The senior instinct: **distrust defaults, and detect when a user is standing on a
footgun.** "Sensible non-footgun defaults" is itself a product thesis.

### A7. "Test the delivery path, not the rule." (canary's own derived taste, from breakage data)
A firing alert rule ≠ a delivered page. The most under-tested link is notification *delivery*
(webhook died, Teams connector killed, resolve-signal never sent). The senior move:
**heartbeat-test each notification channel end-to-end** on a schedule, so you discover a dead
PagerDuty/Slack/webhook integration BEFORE the real incident. (Derived in ecosystem-13 §13.3 from
the AM/Sentry issue corpus — no competitor markets this.)

### A8. "Self-hosting an error tracker is an availability risk." (field-05 §05.4)
Junior: "self-host Sentry, save money." Senior: that's ~30 stateful containers + ¼–½ an engineer,
and **now you need to monitor your monitoring.** Sentry's own docs say "we don't necessarily
recommend self-hosting to everyone." Buy the error tracker; hand-roll only the cheap local trail.

═══════════════════════════════════════════════════════════════════════════════
## PART B — THE LIVE DISPUTES (credible sources disagree — BOTH sides verbatim)
═══════════════════════════════════════════════════════════════════════════════

### DISPUTE 1 — "Three pillars" vs "one wide-event substrate" (THE defining schism)
**Anti-pillars (Majors / Honeycomb / observability 2.0):**
> "**There are no pillars.**" / storing each signal in a different pillar "is **catastrophic** for
> software-engineering use cases and will not serve for agentic validation." / "You cannot
> simultaneously store your data across both multiple pillars AND a single source of truth."
> (https://charity.wtf/tag/observability-2-0/)
**Pro-pillars / correlation camp:**
> "Metrics, logs, and traces each provide partial visibility individually, but **correlated across a
> unified platform, they provide the comprehensive view** needed to diagnose complex issues."
> (sherlocks.ai / general 2026 trend writeups)
**THE RESOLUTION that just happened (2026 currency):** Honeycomb itself shipped **Honeycomb Metrics
GA in March 2026** — the wide-events evangelist conceded you still need metrics.
(https://www.honeycomb.io/blog/honeycomb-advances-observability-for-ai-powered-software-development)
→ **canary's read:** the dispute is converging on "wide events as the *primary* substrate, metrics
as a *bounded-numeric* projection." Pure-pillars is dated; pure-no-metrics was an overreach even its
author walked back. UNSETTLED at the edges; capture all three positions.

### DISPUTE 2 — "Can AI fix alert fatigue, or just relayer it?" (field-01 §01.5)
**Pro-AI:** "Alert Fatigue Is Killing Your On-Call Team (And **How AI Can Fix It**)" — AI triages
the 95% noise. (https://oneuptime.com/blog/post/2026-03-05-alert-fatigue-ai-on-call/view)
**Skeptic:** "**Toil Rose 30% Despite AI**" — AI on a firehose adds a layer, doesn't remove noise.
(https://runframe.io/blog/state-of-incident-management-2025)
→ canary: reduce → correlate → THEN AI-summarize. AI on dirty signal = the runframe failure.

### DISPUTE 3 — "More data" vs "the problem was never data" (the 2026 reframe)
**Cheaper-stack / keep-it-all camp:** the fix is cheaper storage (ClickHouse, OpenObserve,
Hydrolix) + faster on-call tools — switch stacks. (https://clickhouse.com/resources/engineering/datadog-alternatives)
**Understanding-gap camp (sherlocks.ai, 2026, verbatim):**
> "Most teams **already have full visibility** across metrics, logs, and traces, yet incidents
> still take **20 to 40 minutes** to diagnose because the system shows **symptoms, not causes**."
> "The industry is **solving cost, tooling, and coordination. It is not solving understanding.**"
> "A chart shows rising observability costs from 2022–2026 with **flat MTTR improvement.**"
> (https://www.sherlocks.ai/blog/observability-trend-in-2026)
→ canary: the differentiator isn't cheaper data — it's **causality/understanding** (correlate the
deploy/release to the error spike, the cardinality bomb to the bill). Pure cost-cutting leaves MTTR
flat. UNSETTLED whether AI/causal-tooling actually closes the understanding gap — open question.

### DISPUTE 4 — sampling vs keep-it-all (field-03 §03.6)
**Sample aggressively** (Last9/OTel): you'll never miss the dropped info log; only thing that
scales. **Keep it all cheap** (columnar camp): sampling throws away the one event you needed; cheap
storage changes the math. → canary: MANDATORY for metric cardinality (can't keep 25B series),
CONTESTED for logs/events. Don't conflate.

### DISPUTE 5 — how high a percentile (p99 vs p99.9+) (field-04 §04.6)
**p99 is enough** (beyond it = sparse noise) vs **p99.9/p99.99 at fan-out** (Tene: at fan-out p99 IS
the median). → canary: pick the tail percentile as a function of call-count-per-user-action; an
agent doing 50 tool calls needs p99.9.

### DISPUTE 6 — build vs buy / self-host vs SaaS (field-02 §02.4, field-05 §05.4)
**Self-host saves 10s of millions** (Team Blind) vs **"zero cost" is a lie — ¼–½ eng + 30
containers + you monitor your monitoring** (HN). → canary: $2–5M/yr is the honest crossover
(Pragmatic Engineer); below it, SaaS + cardinality discipline wins.

### DISPUTE 7 (the financial-market proxy) — is Datadog's model durable?
Even Wall Street is split: **"Observability Outlook 2026: Goldman and Morgan Stanley CLASH over
Datadog's future."**
(https://markets.financialcontent.com/stocks/article/marketminute-2026-1-12-observability-outlook-2026-goldman-and-morgan-stanley-clash-over-datadogs-future)
→ The usage-based-pricing-vs-predictable-cost tension (the $65M-bill genre) is unresolved enough
that top banks disagree on the category leader's trajectory. Signal: the pricing-model dispute is
real and material, not just engineer grumbling.

## Sources
- https://www.honeycomb.io/blog/time-to-version-observability-signs-point-to-yes + https://charity.wtf/tag/observability-2-0/ — Majors taste + anti-pillars
- https://www.honeycomb.io/blog/honeycomb-advances-observability-for-ai-powered-software-development — Honeycomb Metrics GA Mar 2026 (dispute resolution)
- https://oneuptime.com/blog/post/2026-03-05-alert-fatigue-ai-on-call/view vs https://runframe.io/blog/state-of-incident-management-2025 — AI-fixes vs toil+30%
- https://www.sherlocks.ai/blog/observability-trend-in-2026 — understanding-gap, flat MTTR, "not solving understanding"
- https://clickhouse.com/resources/engineering/datadog-alternatives — keep-it-all-cheap camp
- https://markets.financialcontent.com/stocks/article/marketminute-2026-1-12-observability-outlook-2026-goldman-and-morgan-stanley-clash-over-datadogs-future — Goldman vs Morgan Stanley
- (cross-refs: field-01..05 each carry their own primary citations)
