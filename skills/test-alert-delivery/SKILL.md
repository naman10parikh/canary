---
name: test-alert-delivery
description: Prove a page can actually be DELIVERED — heartbeat each notification channel end-to-end and fail loudly when one is dead. Use when the user says "test the pager", "alert delivery", "will we actually get paged", "on-call heartbeat", "is our paging working", or after configuring a notification channel. This is canary's single strongest differentiator — a firing rule is NOT a delivered page.
allowed-tools: Bash(canary:*), Read, Edit
---

# test-alert-delivery

> **A firing alert rule ≠ a delivered page.** The day PagerDuty itself went down (Aug 28 2025, ~95% of
> events rejected for 38 min), every dashboard was "green" — because the *pager* was broken. Treat
> alert delivery as a monitored failure domain. (BATTLE-TESTED **S5**, OPINIONS **A4**, KNOWN-PITFALLS
> **§8.2/§8.5**.) **No competitor markets this — it is canary's differentiator.**

## Trigger

Invoke for any "test the pager / will we actually get paged / alert-delivery / on-call heartbeat"
request, after adding or changing a notification channel, or when designing on-call (G5 in the eval set).

## Steps

1. **Heartbeat each channel end-to-end.** `canary check-delivery [--channel pagerduty|slack|webhook]
   --json` fires a **synthetic page** through every configured channel → confirms receipt → reports
   `{ delivered, latencyMs, dead: [...] }`. Channels come from `CANARY_DELIVERY_CHANNELS` /
   `.canary/delivery.json` (mock = in-proc sink; webhook/slack/pagerduty = real HTTP POST, 2xx =
   delivered).
2. **Detect dead channels and route AROUND them (the S5 verify).** When a channel is dead, the synthetic
   page MUST surface via a **different** alive channel within one cycle — you cannot announce "the pager
   is down" *through the pager*. canary's `escalations` array records `{ deadChannel, viaChannel }`.
3. **Set `dedup_key` on PagerDuty (§8.5).** Always send Events API v2 with a `dedup_key` — without it a
   flapping condition becomes a 200-alert storm. canary's synthetic page carries one.
4. **Set `send_resolved: true` where you want a clear (§8.2, Alertmanager #226 OPEN).** Otherwise the
   page fires but never clears and on-call stays anxious on a dead incident. Verify resolves actually
   arrive — not just that they're configured.
5. **Watch for killed webhook formats (§8.5).** Microsoft Teams legacy webhooks were killed → new
   "Workflows" uses an incompatible schema. The heartbeat catches this because the dead format fails the
   receipt check.
6. **Schedule it (the routine, not a one-shot).** Wire the heartbeat into the dogfood cron / RSI routine
   so a channel that dies *later* is caught — and so canary's own HEARTBEAT self-monitors (a silently
   dead canary is itself an incident — S18, OPINIONS D5).
7. **Grade honestly:** delivery is a **capability**, NOT a merge-blocking claim — it is L3-graded in
   evals (Risk-2 / G5). Report what was actually delivered; don't assert "paging works" without the
   synthetic round-trip.

## Output

- A per-channel delivery report: `{ delivered, latencyMs, dead: [...], escalations: [{deadChannel,
  viaChannel}] }` (JSON under `--json`); non-zero exit when a channel is dead (fail loudly), but the
  JSON is emitted first.
- Confirmation that `dedup_key` is set (PagerDuty) and `send_resolved: true` where resolves are wanted.
- A recommendation to schedule the heartbeat (the routine), not just run it once.

**Refuses:** treating a firing rule as a delivered page; announcing a dead channel through that same
channel; a PagerDuty config with no `dedup_key`; claiming "paging works" without a synthetic round-trip.
