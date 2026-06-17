---
title: "canary FIELD INTEL — alert fatigue: the postmortems, the stats, the taste"
type: research
created: 2026-06-16
tags: [canary, field-intelligence, alert-fatigue, on-call, postmortem, taste, sre]
researcher: field-intelligence (CP123 Wave-R)
---

# 01 — Alert fatigue: what practitioners learned the hard way

This is the FIELD layer (war stories + opinion + dispute), NOT the tooling layer (that's
`ecosystem-*.md`). Every claim cited with URL + date. The single most repeated practitioner
lesson in this whole vertical is: **the failure mode is rarely "we didn't have monitoring" — it's
"we had so much monitoring nobody believed it anymore."**

## 01.1 The headline numbers (the stats that quantify the pain)

These are the load-bearing data points an agent should cite when justifying *alert hygiene over
alert coverage*:

- **83% of organizations report their teams are ignoring alerts.** — NeuBird, *2026 State of
  Production Reliability* report, cited 2026-03-05.
  (https://oneuptime.com/blog/post/2026-03-05-alert-fatigue-ai-on-call/view)
- **The average on-call engineer receives ~50 alerts/week, but only 2–5% require human
  intervention.** — PagerDuty *2025 State of Digital Operations*, as cited 2026-03-05 (same URL).
  → The implication: **95–98% of pages are noise.** This is the number that justifies canary's
  whole "test the delivery path, not the rule count" thesis.
- **73% of organizations experienced outages linked to *ignored* alerts.** — Splunk 2025 study,
  cited via oneuptime 2026-03-05. This is the cruel irony: alert fatigue doesn't just annoy, it
  *causes the very outages monitoring was meant to prevent* (the real alert was buried in noise).
- **Toil ROSE 30% despite AI adoption** — runframe.io, *State of Incident Management 2026*
  (https://runframe.io/blog/state-of-incident-management-2025). The 2026 currency point: bolting
  AI summarization onto a noisy alert stream did NOT reduce toil — it rose. (See field-06 for the
  2026-invalidates-2025 angle.)

## 01.2 The verbatim war story (a real VP-of-Eng postmortem quote)

> "Our on-call engineers get 200+ pages per week. Maybe 5 are real. The rest? Threshold noise,
> flapping alerts, things that auto-resolved."
> — healthcare-SaaS VP of Engineering, quoted in oneuptime 2026-03-05
> (https://oneuptime.com/blog/post/2026-03-05-alert-fatigue-ai-on-call/view)

Decode for canary: **200 pages/wk, ~5 real = ~2.5% signal.** Three named noise classes the
practitioner calls out — and canary should be able to detect/suppress each:
1. **Threshold noise** — static thresholds that fire on normal variance (the fix is burn-rate /
   multi-window, see ecosystem-07, not a tighter static number).
2. **Flapping alerts** — fire→resolve→fire (the fix is `for:` duration + hysteresis).
3. **Auto-resolved** — the thing fixed itself before a human looked (the fix is: don't page on
   self-healing conditions; ticket them or drop them).

## 01.3 The TASTE — the canonical opinion great SREs hold (and average ones don't)

**Google SRE Workbook: a maximum of 2 actionable incidents per on-call shift is the sustainable
baseline.** Cited repeatedly across the 2026 alert-fatigue literature (NeuBird, oneuptime,
uptimelabs). This is the number that reframes the goal: **the target is not "catch everything,"
it's "page a human ≤2×/shift, and have both be real."**
- Source restating it: https://www.uptimelabs.io/learn/reduce-on-call-burnout (2026)

The deeper taste, stated bluntly by practitioners:

> "Alert fatigue is not just a notification problem. It is a **trust** problem."
> — oneuptime alert-fatigue analysis (2026)

This is the opinion that separates senior from junior: **the metric that matters is not page
count, it's the on-call engineer's *belief* that a page is real.** Once belief drops below a
threshold, MORE alerting makes reliability WORSE (the 73%-ignored-outage stat above). A junior
adds an alert "to be safe"; a senior *deletes* alerts to restore signal. canary's product instinct
should bias toward **deletion and consolidation**, never "add another check."

The corollary taste (Rob Ewaschuk's "My Philosophy on Alerting", the ur-text every SRE cites):
**page on symptoms, not causes; every page must be actionable, novel, and require intelligence —
if a human can't *do* anything, it's not a page.** (The Google SRE book canonized this; it's the
intellectual root of the "2 per shift" rule.)

## 01.4 The over-monitoring root cause (why teams get here)

> "Over-monitoring occurs when every metric, log line, or warning state is configured to alert,
> and lack of prioritization means all alerts look equally urgent."
> — incident.io, *Alert fatigue solutions for DevOps teams in 2025*
> (https://incident.io/blog/alert-fatigue-solutions-for-dev-ops-teams-in-2025-what-works)

The structural fix practitioners converge on (icinga, incident.io, uptimelabs, 2025–2026):
1. **Severity tiers that actually differ** — P1 pages a phone; P3 opens a ticket; info-level goes
   to a dashboard, never a human. The failure is "everything is P1."
2. **Correlation/dedup** — one root cause firing 40 downstream alerts should be ONE incident.
3. **Routing to the right person**, not broadcast to a channel everyone mutes.
4. **Auto-remediation for the known-self-healing class** — never page for what a runbook script
   fixes deterministically.

## 01.4b The concrete before/after postmortem (a real team, with numbers)

The best-documented alert-fatigue turnaround, with hard before/after metrics (dimension-1 anchor):
> "From **400 alerts/night to 8** — the SRE playbook that saved my team's sanity." Starting state:
> **38% false-positive rate**, **MTTR 4h 12m** "because engineers were exhausted." January 2024 →
> September 2024: down to **8 actionable PagerDuty alerts/night, none waking anyone unless a real
> customer was affected.**
> — senior DevOps engineer write-up, dev.to (2025)
> (https://dev.to/meena_nukala_1154d49b984d/-from-400-alertsnight-to-8-the-sre-playbook-that-saved-my-teams-sanity-36f1)

→ **The causal chain canary should internalize:** noise (400/night, 38% false) → exhaustion → slow
response → **MTTR 4h+**. Cutting noise to 8/night didn't just improve morale, it *collapsed MTTR* —
because a rested on-call who trusts the page responds fast. **Alert hygiene is an MTTR lever, not a
comfort feature.** This is the quantified proof of the field-01 thesis.

## 01.4c "Who watches the watcher?" — PagerDuty itself went down 9+ hours (Aug 28 2025)

The war story that proves canary's "test the delivery path" thesis (field-06 A7):
> PagerDuty suffered a **major outage on August 28, 2025**, with service degradations lasting
> **more than nine hours**, during which **~95% of events were rejected over a 38-minute period.**
> — InfoQ, *PagerDuty Kafka outage* (2025-09)
> (https://www.infoq.com/news/2025/09/pagerduty-kafka-outage)

→ **The lesson:** the alerting/paging layer is ITSELF a failure domain. For 38 minutes, 95% of
pages silently never delivered — every monitored system was "green" only because the pager was
broken, not because nothing was wrong. **A firing rule ≠ a delivered page.** canary should
heartbeat-test the *delivery* path end-to-end (synthetic page → confirm receipt) so a dead
PagerDuty/Slack/webhook is detected as an incident in its own right. No competitor markets this; it
falls straight out of this incident.

## 01.5 The DISPUTE (feeds GAPS-AND-DISPUTES)

**Can AI fix alert fatigue, or does it just move the problem?** Credible sources disagree:

- **Pro-AI side (oneuptime, 2026-03-05):** AI on-call agents can triage, correlate, and
  auto-resolve the 95% noise so humans only see the 5% — "Alert Fatigue Is Killing Your On-Call
  Team (And How AI Can Fix It)" is literally the title.
  (https://oneuptime.com/blog/post/2026-03-05-alert-fatigue-ai-on-call/view)
- **Skeptic side (runframe.io, 2026):** *State of Incident Management 2026* found **toil rose 30%
  despite AI.** Their framing: "Toil Rose 30% Despite AI." If AI summarizes a firehose instead of
  *reducing* it, you've added a layer, not removed the noise.
  (https://runframe.io/blog/state-of-incident-management-2025)

**canary's position (synthesizing both, for GAPS doc):** AI is leverage on a *clean* signal and a
multiplier on a *dirty* one. The order of operations is **reduce → correlate → THEN summarize with
AI.** Putting an LLM on a noisy stream is the runframe failure mode. This is a live, unsettled
dispute as of mid-2026 — capture both verbatim.

## Sources
- https://oneuptime.com/blog/post/2026-03-05-alert-fatigue-ai-on-call/view (2026-03-05) — 83%
  ignore alerts; PagerDuty 50/wk @ 2–5% actionable; Splunk 73% ignored-outage; VP-Eng 200/wk quote
- https://runframe.io/blog/state-of-incident-management-2025 (2026) — toil +30% despite AI
- https://incident.io/blog/alert-fatigue-solutions-for-dev-ops-teams-in-2025-what-works (2025) —
  over-monitoring root cause
- https://www.uptimelabs.io/learn/reduce-on-call-burnout (2026) — Google SRE 2-per-shift baseline
- https://icinga.com/blog/alert-fatigue-monitoring/ (2026) — severity-tier + noise-cut structure
- Rob Ewaschuk "My Philosophy on Alerting" / Google SRE book ch.6 — page-on-symptoms ur-text
  (canonical, pre-2025 but still the cited intellectual root; flagged as older-but-trusted)
