---
title: "canary ecosystem research — alerting & on-call (PagerDuty / Opsgenie / Grafana OnCall)"
type: research
created: 2026-06-16
tags: [canary, observability, alerting, on-call, pagerduty, opsgenie, grafana-oncall, incident-io, mtta, mttr]
researcher: ecosystem (CP123 Wave-R)
---

# 06 — Alerting & on-call: who gets paged, and did they ack?

This is canary's **incident-routing** pillar. Metrics: alert → ack latency (**MTTA**), time to
resolution (**MTTR**), escalation depth. It sits *downstream* of detection (Sentry/Prometheus/
Checkly fire an alert) and routes it to a human (or, increasingly, an AI-SRE agent — see
ecosystem-03 §3.3). The Energy checklist does NOT yet name an alerting tool by name (the
"Error/crash/uptime monitoring" line names Sentry/Better Stack for *detection*); on-call routing
is the gap canary fills. (`~/energy/audit/HARNESS-CHECKLIST-2026.md` lines 314-318,
read 2026-06-16.)

## 6.1 THE headline — Opsgenie is being killed (hard dates, real migration story)

This is the single biggest fact in the alerting space for mid-2026. **Atlassian is sunsetting
Opsgenie.** The dates (verbatim from citk.com/blog/opsgenie-migration-guide, fetched 2026-06-16):

- **June 4, 2025 — new Opsgenie sales stopped.** "Platform unavailable for new purchases or
  trials." (corroborated: WebSearch snippets from runframe.io, alert24.net, multiple 2026
  migration guides.)
- **April 5, 2027 — Opsgenie shuts down permanently.** "OpsGenie data is permanently deleted at
  12:00 AM PST." Existing customers must migrate data + config before this date.

**Atlassian's official migration path is a CONSOLIDATION FORK that users hate:** you must split
into **Jira Service Management (JSM)** for incident/change/IT *and* **Compass** for alerting +
on-call + software catalog. JSM's change-management is "locked behind the Premium tier, which
starts at $48+ per agent per month" (citk, 2026-06-16). User sentiment is "overwhelmingly
negative — teams that relied on Opsgenie's unified approach for years report frustration at being
forced into a fragmented solution managing incident response across multiple Atlassian
interfaces." (WebSearch synthesis of incident.io + pagerduty.com migration blogs, 2026-06-16.)

**Why this matters for canary:** any fleet product or external repo that *currently* uses
Opsgenie is on a death clock. canary, as the domain expert, must know to (a) flag Opsgenie usage
as deprecated, and (b) steer toward PagerDuty / incident.io / Grafana OnCall. This is exactly the
"version-specific cost cliff / migration gotcha" class of knowledge the mission demanded — and
it's not hypothetical, it has a hard April-2027 wall.

## 6.2 The honest alternative matrix (post-Opsgenie)

| | **PagerDuty** | **incident.io** | **Grafana OnCall** | **Better Stack** | **Squadcast** |
| --- | --- | --- | --- | --- | --- |
| **Category** | enterprise on-call + AIOps | on-call + incident lifecycle (Slack-native) | OSS / Grafana-stack on-call | uptime+logs+on-call (one platform) | budget on-call |
| **Opsgenie 1:1 replacement?** | ✅ "closest feature-for-feature" | partial (more incident-mgmt than pure alerting) | partial (OSS, Grafana-coupled) | partial | ✅ cheap 1:1-ish |
| **Entry price** | Professional **$21/user/mo** (annual); range $21–$41 | custom | **free / OSS** (in Grafana) | bundled (Responders +$29/mo each, see ecosystem-03) | **$9–$21/user/mo** |
| **AI agent** | **Bits-style AIOps / event intelligence** | ✅ incident.io AI SRE | (via Grafana stack) | ✅ Better Stack AI SRE | — |
| **MCP / agent surface** | REST API + Events API v2 | REST API | **Grafana MCP exposes OnCall** (ecosystem-05/09) | REST API | REST API |
| **Best for** | large eng orgs, mature escalation | Slack-first teams wanting incident lifecycle | already-on-Grafana / self-host / $0 | one-pane TCO consolidation | cost-sensitive |

Sources: incident.io/blog/pagerduty-vs-opsgenie-comparison-2026; pagerduty.com/blog/insights/
after-opsgenie-3-reasons…; citk.com/blog/opsgenie-migration-guide; onpage.com/opsgenie-
alternatives-2026; alert24.net/blog/opsgenie-alternatives (all fetched/surfaced 2026-06-16).

### Honest taste (not a feature list)
- **PagerDuty** is the safe enterprise default and the only one universally called the
  "closest feature-for-feature" Opsgenie replacement — but it's the priciest per-seat and its
  value (deep AIOps event-intelligence, mature escalation policies, hundreds of integrations) is
  overkill for a small fleet. Pay for it when you have a real on-call rotation across teams.
- **Grafana OnCall** is the canary-relevant pick *if the fleet is already on Grafana/Prometheus*
  (ecosystem-05): it's **OSS/free**, and crucially **the first-party Grafana MCP can query OnCall
  schedules** (ecosystem-09) — so an agent can answer "who's on call right now?" through the same
  MCP it uses for dashboards/alerts. That single-MCP coherence is worth a lot for an agent
  operator. ⚠️ GAP/RISK: Grafana OnCall's long-term roadmap should be re-verified — Grafana Labs
  has historically deprecated OSS features in favor of Cloud; confirm OnCall OSS is still
  maintained before betting on it. [flagged for GAPS]
- **incident.io** is the choice if you want the *whole incident lifecycle* (declare → coordinate
  in Slack → roles → comms → post-mortem → learnings), not just paging. Its AI-SRE is a direct
  canary-shaped competitor.
- **Better Stack** consolidates detection (uptime/logs) + on-call in one platform — attractive
  TCO for a fleet, but its on-call "Responders" cost +$29/mo each (ecosystem-03 §3.1) and the
  free tier is small.

## 6.3 The load-bearing on-call flows (what actually breaks)

These are the real-world footguns, mirroring the Alertmanager gotchas in ecosystem-05 §5.4 but
at the human-routing layer:

1. **Escalation policy depth vs alert fatigue.** Too few escalation steps → unacked pages drop
   silently (the incident festers); too many → everyone gets woken up (alert fatigue → people
   mute the app → next real page is ignored). The MTTA metric exists precisely to surface this.
2. **De-duplication / alert grouping.** A flapping service can fire 200 alerts in 5 minutes. If
   the on-call tool doesn't dedup by incident key (PagerDuty: the `dedup_key` on Events API v2),
   the responder gets a storm and can't see the signal. This is the human-side twin of
   Alertmanager's `group_wait`/`group_interval`.
3. **`send_resolved` / auto-resolve mismatch.** If the detection tool fires but never sends the
   resolve event (Alertmanager's `send_resolved: false`, ecosystem-05 §5.4 item 4), the on-call
   page never clears — the responder stays anxious / acks a dead incident.
4. **Schedule gaps / timezone bugs.** Rotation handoffs across timezones with a gap = a window
   where *nobody* is on call. Classic "the 3am page went to an empty schedule" postmortem.
5. **Notification-channel exhaustion.** SMS/voice credits deplete during an incident storm
   (ecosystem-03 flagged this for UptimeRobot/Better Stack) — the one page that matters never
   sends because the credit ran out mid-storm.

## 6.4 What an AGENT operating alerting needs

- **PagerDuty: Events API v2** is the deterministic ingestion surface — `POST` an event with
  `routing_key` + `dedup_key` + `severity` + `payload`. An agent firing a synthetic alert or
  acking on a human's behalf uses this + the **REST API** (incidents, escalation policies,
  schedules, on-call). Auth: API token. The `dedup_key` is the single most important field an
  agent must set correctly (it's what prevents the storm in §6.3 item 2).
- **Grafana OnCall via the Grafana MCP** — the cleanest agent path *if on Grafana*: the
  first-party `grafana/mcp-grafana` MCP (3,155★, v0.16.0, ecosystem-05 §5.5) exposes OnCall
  schedules + alert rules + firing alerts. An agent answers "who's on call, what's firing, page
  them" through one MCP. This is the recommendation for canary's own stack.
- **incident.io / Squadcast / Better Stack** all expose REST APIs (incidents, schedules,
  escalations). No first-party MCP confirmed for these as of 2026-06-16 [GAP].
- **The agent's real job here is restraint + correctness, not volume.** An agent that auto-pages
  on every blip recreates alert fatigue. The right pattern (borrowed from ecosystem-03's
  "remediation safety ladder"): an agent should *triage and enrich* an alert (correlate it with
  the Sentry issue + the burn-rate, attach a root-cause hypothesis) **before** escalating to a
  human — turning a raw page into an actionable one. Auto-*paging* is fine; auto-*remediation*
  stays gated behind human approval.
- **MTTA/MTTR are canary's KPIs here.** An agent operating on-call should *measure* these (they
  fall out of the REST API's incident timestamps: created → acknowledged → resolved) and feed
  them back into the self-improvement loop ("our MTTA regressed this week — why?").

## Sources
- citk.com/blog/opsgenie-migration-guide (fetched 2026-06-16) — Opsgenie sunset dates (Jun 4 2025
  sales stop, Apr 5 2027 shutdown + data deletion), JSM+Compass path, JSM Premium $48+/agent,
  PagerDuty $21–$41, Squadcast $9–$21, incident.io/Rootly custom.
- incident.io/blog/pagerduty-vs-opsgenie-comparison-2026 (surfaced 2026-06-16) — PD vs Opsgenie
  feature/price/migration; PD Professional $21/user/mo annual.
- pagerduty.com/blog/insights/after-opsgenie-3-reasons… (surfaced 2026-06-16) — "closest
  feature-for-feature replacement," negative JSM-fork sentiment.
- onpage.com/opsgenie-alternatives-2026; alert24.net/blog/opsgenie-alternatives;
  runframe.io/blog/opsgenie-migration-guide; xurrent.com/blog/opsgenie-migration-guide;
  adaptavist.com/blog/how-to-make-the-move-from-opsgenie (surfaced 2026-06-16) — alternative
  landscape incl. Grafana OnCall, Spike.sh, Better Stack as consolidation play.
- Internal: `~/energy/audit/HARNESS-CHECKLIST-2026.md` lines 314-318 (read 2026-06-16)
  — detection tools named, on-call routing not yet named.
- Cross-ref: ecosystem-05 §5.4 (Alertmanager grouping/inhibition/send_resolved), ecosystem-03
  §3.1 (Better Stack Responders pricing) + §3.3 (AI-SRE remediation ladder), ecosystem-09
  (Grafana MCP OnCall tools).
