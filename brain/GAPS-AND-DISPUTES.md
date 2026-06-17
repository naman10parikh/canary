---
title: "canary GAPS-AND-DISPUTES — where sources disagree, where none exists, what's unconfirmed"
type: brain
status: active
created: 2026-06-16
tags: [canary, observability, gaps, disputes, unsettled, experiments, both-sides]
source: brain/research/raw/field-06 (disputes), ecosystem-13 §13.5, ecosystem-14 §14.8, field-00
related: ["[[EXPERTISE-MAP]]", "[[OPINIONS]]", "[[BATTLE-TESTED-SCENARIOS]]", "[[KNOWN-PITFALLS]]", "[[TOOL-MATRIX]]", "[[MOC - canary]]"]
---

# canary Gaps and Disputes

> Three classes, kept honest:
> **PART 1 — Live disputes** (credible sources disagree; BOTH sides verbatim → don't pick prematurely).
> **PART 2 — No-good-source gaps** (canary must form its own view via experiment → each has a proposed experiment).
> **PART 3 — Unconfirmed** (facts the research could NOT verify this pass → re-verify before betting).
>
> Honesty rule: when canary advises on anything below, it must surface that it's contested/unverified,
> not present a side as settled. "I couldn't confirm X" is a valid, required answer here.

---

## PART 1 — LIVE DISPUTES (both sides credible, both verbatim)

### D1. "Three pillars" vs "one wide-event substrate" (THE defining schism) — `field-06 DISPUTE 1`, `field-07 §07.2`
- **Anti-pillars (Majors / Honeycomb / observability 2.0):** "**There are no pillars.**" Storing each
  signal in a different pillar is "**catastrophic** for software-engineering use cases and will not
  serve for agentic validation." "You cannot simultaneously store your data across both multiple
  pillars AND a single source of truth." (charity.wtf/tag/observability-2-0/)
- **Pro-pillars / correlation camp:** "Metrics, logs, and traces each provide partial visibility
  individually, but **correlated across a unified platform, they provide the comprehensive view**
  needed to diagnose complex issues." (sherlocks.ai + 2026 trend writeups)
- **What just happened (the convergence):** Honeycomb shipped **Metrics GA March 2026** — the
  wide-events evangelist conceded you still need metrics.
- **canary's working position (calibrated, not settled):** wide events as the *primary* substrate,
  metrics as a *bounded-numeric projection* (uptime %, error rate, saturation). Pure-pillars is dated;
  pure-no-metrics was an overreach even its author walked back. **UNSETTLED at the edges** — capture all
  three positions; don't adopt a metrics-are-dead posture. (See [[OPINIONS]] C1.)

### D2. "Can AI fix alert fatigue, or just relayer it?" — `field-01 §01.5`, `field-06 DISPUTE 2`
- **Pro-AI:** "Alert Fatigue Is Killing Your On-Call Team (**And How AI Can Fix It**)" — AI triages
  the 95% noise. (oneuptime, 2026-03-05)
- **Skeptic:** "**Toil Rose 30% Despite AI**" — AI on a firehose adds a layer, doesn't remove noise.
  (runframe.io, *State of Incident Management 2026*)
- **canary's position:** reduce → correlate → THEN AI-summarize. AI on a dirty signal = the runframe
  failure. **UNSETTLED** whether AI actually reduces toil net — depends entirely on signal cleanliness.

### D3. "More/cheaper data" vs "the problem was never data" (the 2026 reframe) — `field-06 DISPUTE 3`, `field-07 §07.8`
- **Cheaper-stack / keep-it-all camp:** the fix is cheaper storage (ClickHouse, OpenObserve, Hydrolix)
  + faster on-call tools — switch stacks. (clickhouse.com/resources/engineering/datadog-alternatives)
- **Understanding-gap camp (sherlocks.ai, verbatim):** "Most teams **already have full visibility** …
  yet incidents still take **20 to 40 minutes** to diagnose because the system shows **symptoms, not
  causes**." "The industry is **solving cost, tooling, and coordination. It is not solving
  understanding.**" "rising observability costs from 2022–2026 with **flat MTTR improvement.**"
- **canary's position:** the differentiator is causality/understanding, not cheaper data — pure
  cost-cutting leaves MTTR flat. **UNSETTLED** whether AI/causal-tooling actually closes the
  understanding gap (this is canary's own bet — see PART 2 P1). (See [[OPINIONS]] C2.)

### D4. Sampling vs keep-it-all — `field-03 §03.6`, `field-06 DISPUTE 4`
- **Sample aggressively** (Last9/OTel): drop info/debug, you'll never miss it; only thing that scales.
- **Keep it all cheap** (columnar camp): sampling throws away the one event you needed; cheap storage
  changes the math.
- **canary's position:** **MANDATORY for metric cardinality** (you cannot keep 25B series),
  **CONTESTED for logs/events** (cheap columnar genuinely changes the math). Don't conflate the two.
  The logs/events half is **UNSETTLED**. (See [[OPINIONS]] C7.)

### D5. How high a percentile — p99 vs p99.9+ — `field-04 §04.6`, `field-06 DISPUTE 5`
- **p99 is enough:** beyond it the data is sparse noise, you're chasing single-request artifacts.
- **p99.9 / p99.99 at fan-out (Tene):** at fan-out p99 IS the median, so the real tail is p99.9+.
- **canary's position:** the right tail percentile is a function of call-count-per-user-action.
  Single-call → p99; heavy fan-out (an agent's 50 tool calls) → p99.9. **UNSETTLED as a universal** —
  it depends on fan-out. (See [[OPINIONS]] C4.)

### D6. Build vs buy / self-host vs SaaS — `field-02 §02.4`, `field-05 §05.4`, `field-06 DISPUTE 6`
- **Self-host saves 10s of millions** (Team Blind, dev.to converts).
- **"Zero cost" is a lie** — ¼–½ eng + ~30 stateful containers + you monitor your monitoring (HN). And
  Majors' orthogonal take: self-hosting *metrics* optimizes the wrong layer (move to wide events).
- **canary's position:** **$2–5M/yr is the honest crossover** (Pragmatic Engineer); below it SaaS +
  cardinality discipline wins, above it the math flips — but budget the operational tax explicitly.
  **UNSETTLED as a universal rule** (depends on scale + in-house ops capacity).

### D7. Is the usage-based-pricing model durable? (the financial-market proxy) — `field-06 DISPUTE 7`
- Even Wall Street is split: "**Observability Outlook 2026: Goldman and Morgan Stanley CLASH over
  Datadog's future.**" The usage-based-pricing-vs-predictable-cost tension (the $65M-bill genre) is
  unresolved enough that top banks disagree on the category leader's trajectory.
- **Signal for canary:** the pricing-model dispute is real and material, not just engineer grumbling —
  a product angle (predictable cost) has a live market thesis behind it.

---

## PART 2 — NO-GOOD-SOURCE GAPS (canary must form its own view via experiment)

These are where the research found *no authoritative answer* — canary should run the experiment and
write the result back to `brain/` (this is the AutoLab/self-improvement loop).

### P1. ⭐ Does causal correlation actually close the "understanding gap"? (canary's core bet)
**The gap:** D3 says the 2026 problem is symptoms-not-causes and MTTR is flat despite full visibility —
but **no source proves** that automated causal linking (deploy→error-spike, label→cost-bomb,
fan-out→tail) actually reduces MTTR. It's the thesis canary is built on, and it's unproven.
**Experiment:** on canary's own dogfood stack, instrument a controlled set of incidents; measure MTTR
with vs without canary's causal-correlation enrichment. If it doesn't move MTTR, the positioning needs
rework. **This is the most important experiment canary owes itself.**

### P2. ⭐ Does notification-channel heartbeat-testing actually catch real delivery failures? (canary's differentiator)
**The gap:** A4/[[BATTLE-TESTED-SCENARIOS]] S5 is *derived* taste — the breakage data (PagerDuty
outage, AM #226/#2404/#3920) strongly implies it, but **no competitor markets it and no source
benchmarks it.** It's canary's strongest differentiator AND its least-validated.
**Experiment:** build the channel heartbeat (S5), then deliberately break each channel (revoke webhook,
expire SMS credit, kill the Teams connector) and measure detection latency. Quantify the false-
positive rate. If it's noisy or slow, it's a worse footgun than what it catches.

### P3. The right autonomy ceiling for canary's mutating actions
**The gap:** the "remediation safety ladder" (reversible-freely / high-risk-gated) is sound in
principle (`ecosystem-03 §3.3`) but **no source defines where exactly the line sits** for an
observability agent — is auto-resolving a Sentry issue low-risk? auto-paging? auto-rolling-back on a
crash-free drop?
**Experiment:** start fully read-only; promote one mutating action at a time (resolve → page → rollback
recommendation → auto-rollback) with a measured error/regret rate per rung before promoting the next.
Write the validated ladder back to [[OPINIONS]] D.

### P4. The canary/agentmoney seam under a REAL GenAI span (not a spec)
**The gap:** the boundary is clean *on paper* (`ecosystem-00`, `ecosystem-02 §2.3`) — canary reads
`gen_ai.client.operation.duration`/`.exception`, agentmoney reads `gen_ai.usage.*` — but it's never
been exercised against a real OpenLLMetry/OpenInference-emitted span post-v1.42 repo split.
**Experiment:** stand up `traceloop/openllmetry` against a real Anthropic call, emit a span, and verify
canary can read the latency/exception attrs and ignore the token attrs cleanly across the v1.42 semconv
boundary. Confirm an Anthropic 529 surfaces as `gen_ai.client.operation.exception`.

### P5. Release-health for AGENT backends specifically
**The gap:** release health is mobile/browser-first; for backend (request-mode) it overlaps the SLO
view (`ecosystem-10 §10.2`). But **no source addresses the agent-backend case** — what's the right
deploy-regression signal for a long-running agent loop (not an HTTP request, not a mobile session)?
**Experiment:** model an agent run as a "session," measure crash-free *agent-runs* vs SLO burn on the
same deploy, and decide which is the better rollback gate for agent workloads. Write the answer back to
[[EXPERTISE-MAP]] JOB 3.

### P6. Occurrence-aware sampling thresholds
**The gap:** C6 says "keep the novel, sample the repeated" but **no source gives the right N** (Sentry
#84943 hand-waves "100% for first 100, 5% after"). The right cutoff is workload-dependent.
**Experiment:** measure information-value-vs-cost at several N on canary's own error stream; find the
knee.

---

## PART 3 — UNCONFIRMED (re-verify before betting) — `ecosystem-13 §13.5`, `ecosystem-14 §14.8`, `field-00`

The research's own honest leftovers. None of these block canary's core stances, but each is a "don't
assert this as fact" item until verified.

### U1. Non-JS Sentry SDK per-language changelogs (Python / Go / etc.)
The **JS** SDK currency IS closed (v10.58.0 + v8→v9→v10 deltas). But `@sentry/python`, `sentry-go`,
etc. were NOT crawled per-minor. JS is the fleet's dominant surface (right one to close first), but
non-JS SDK currency is unverified. `ecosystem-14 §14.8`.

### U2. PagerDuty MCP exact tool list
Confirmed it's official + its embedded React "MCP-Apps" + that it covers incidents/services/schedules/
event-orchestrations — but the *full tool enumeration* (the way the 39 Sentry MCP tools were listed)
was NOT done. `ecosystem-14 §14.8`.

### U3. incident.io official MCP tool list + auth scopes
Confirmed it exists, is official (March 2026), is remote/Streamable-HTTP at docs.incident.io/ai/
remote-mcp — but tools + auth scopes NOT enumerated. (Affects the `INCIDENT_IO_API_KEY` manifest entry
in [[TOOL-MATRIX]] — scope unknown.) `ecosystem-14 §14.8`.

### U4. AI-SRE competitor depth (Better Stack AI SRE, Datadog Bits AI SRE, incident.io AI SRE, Resolve AI)
Named + landscape confirmed (`ecosystem-03 §3.3`, `agamm/awesome-ai-sre`), but **no hands-on
capability comparison** — and these are canary's *direct* competitors. Worth a dedicated competitive
deep-dive. `ecosystem-14 §14.8`.

### U5. Grafana 13.x per-patch contents (v13.0.0 → v13.0.2)
The G13 *feature* deltas (gzip-on, query sidebar, restore-dashboards GA) are primary-sourced; the
patch-level contents are not. `ecosystem-14 §14.8`.

### U6. Whether Grafana OnCall OSS death has a clean managed successor path for non-Cloud users
Confirmed OnCall OSS is archived + Cloud-IRM is the successor — but the *migration friction* for a team
that doesn't want Grafana Cloud (i.e. wiring Twilio/Pushover/ntfy directly) is described, not
walked-through. `ecosystem-14 §14.1`.

### U7. X/Twitter practitioner signal for this vertical (METHODOLOGY gap, not a fact gap)
The X scrape's **search** endpoint was 404 (stale GraphQL doc_id); the For-You timeline had **0**
observability hits. So the field intelligence rests on HN + GitHub trackers + SRE blogs + vendor
postmortems — which for THIS vertical are richer and more durable than X anyway. A future pass should
refresh the X search doc_id (browser-DOM → `--from-json`) and search @mipsytipsy (Charity Majors),
@lizthegrey, @rakyll, @copyconstruct, @danluu. `field-00`. (Low priority — the war stories live in
issue trackers, not tweets.)

### U8. Disclosed source bias (not gaps, but discount the framing)
- The Checkly vs Better Stack vs UptimeRobot matrix (`ecosystem-03`) leans on a **BetterStack-authored**
  comparison — feature facts trusted, framing discounted.
- Several "we left Datadog" cost-savings numbers (`field-02`) are convert/vendor-biased — the savings
  are real but conditional (license cost → operational cost).
- Some canonical ur-texts (Ewaschuk "Philosophy on Alerting," Gil Tene "How NOT to Measure Latency")
  are pre-2025 — still definitive, but flagged as older.

---

## How canary should USE this file
1. When advising on anything in PART 1, **present both sides** and state canary's calibrated position —
   never the dispute as settled.
2. When hitting a PART 2 gap, **run the experiment** and write the result back to the relevant
   brain/ file (this is the self-improvement loop; P1 and P2 are the highest-priority).
3. When a PART 3 item comes up, say **"unconfirmed — re-verify"** rather than asserting it.

## Sources
`brain/research/raw/field-06.md` (the dispute core, both-sides verbatim) + `ecosystem-13 §13.5` +
`ecosystem-14 §14.8` (the research's own honest gap-lists) + `field-00` (X methodology). All primary
citations live in those files (2026-06-16).
