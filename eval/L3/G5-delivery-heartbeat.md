# L3 · G5 (S5 / A4) — The page that never delivered: design a delivery heartbeat

> **Hamel level:** L3 trajectory (process-graded, NOT a binary unit gate). **CI-blocking:** no.
> **Brain:** `brain/BATTLE-TESTED-SCENARIOS.md` S5 · `brain/OPINIONS.md` A4 — *canary's single
> strongest differentiator; no competitor markets it.*

## The task (the EVAL TASK from S5)

> Design (and stub) a notification-channel heartbeat that proves a page can actually be
> delivered through each configured channel, and fails loudly when one is dead.

## SETUP

A team has Prometheus alerts firing into PagerDuty + a Slack webhook. During the last real
incident **nobody was paged** — every dashboard was green because the *pager itself* was down
(the PagerDuty Aug 28 2025 9h outage, ~95% of events rejected for 38 min). A firing alert rule
≠ a delivered page.

## What a PASSING trajectory does (the rubric — grade the PROCESS)

1. **Names the failure domain correctly:** alert DELIVERY is a separately-monitored failure
   domain, distinct from the detection rules. (Not "add more alerts.")
2. **Heartbeats EACH channel end-to-end on a schedule:** fire a synthetic page through
   PagerDuty, through Slack, through the webhook → confirm receipt within N seconds.
3. **Detects a dead channel via a DIFFERENT channel:** if channel X is dead, the failure is
   raised through channel Y within one cycle (never only through the dead path — that's the
   whole bug). Reasons about the false-positive rate.
4. **Covers the resolve path too:** `send_resolved` on, and the resolve actually arrives
   (Alertmanager #226 — the page that never clears).
5. **Uses a `dedup_key`** so a re-fired synthetic page doesn't open N incidents (PagerDuty
   Events API v2).
6. **Maps to canary's surface:** points at `canary check-delivery` (B9) as the implementation
   and the `test-alert-delivery` skill (B11) as the playbook.

## Anti-patterns (a FAILING trajectory)

- "Add a watchdog alert" with no delivery test (the alert pipeline is still untested).
- Detecting the dead channel *only* through the dead channel.
- Trusting that a firing rule = a delivered page.

## Reference trajectory (the bar)

canary's own `check-delivery` (B9) IS this design realized: it fires a synthetic page per
channel with a `dedup_key`; on a dead channel it re-reports via a different alive channel
within one cycle; mock channels for the $0 gate, real HTTP POST for live channels. The
`test-alert-delivery` skill encodes the PagerDuty-outage lesson + `send_resolved` + `dedup_key`.

**Verify (S5):** kill a channel (revoke the webhook); the heartbeat detects the dead channel
and alerts via a *different* channel within one cycle. (Exercised as a chaos test in
`tests/check-delivery.test.ts` — the real-HTTP S5 chaos case.)
