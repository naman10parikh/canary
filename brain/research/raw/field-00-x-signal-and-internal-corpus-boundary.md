---
title: "canary FIELD INTEL — X/Twitter signal status + internal-corpus boundary (FIELD angle)"
type: research
created: 2026-06-16
tags: [canary, field-intelligence, x-twitter, runs-jsonl, agentmoney, boundary, methodology]
researcher: field-intelligence (CP123 Wave-R)
---

# 00 — X signal status + internal-corpus boundary (the FIELD-layer angle)

## X / Twitter signal — ATTEMPTED, partially skipped (honest status)

Per mission dimension (6), I attempted X via the energy harness:
`~/energy/scripts/x-content-intel/scrape.py` with the authed session at
`~/.claude/x-auth/x-session.json`.

- **Auth: VALID.** The session loaded and the **home-timeline** GraphQL endpoint returned **35
  tweets** (doc_id `HJFjzBgCs16TqxewQOeLNg`) — proving cookies (`auth_token` + 44 others) are live.
- **Targeted search: DOWN (HTTP 404).** The **search** GraphQL endpoint (doc_id
  `MJpyQGqgklrVl_6rYKQbow`) returned **404 — stopping**. Root cause: X rotates GraphQL query
  doc_ids frequently and the hard-coded `SEARCH_DOC_ID` in `scrape.py` is stale (a known failure
  mode of the X-GraphQL workflow). Repairing X's search doc_id is out of scope for this research
  pass (and changes again on X's schedule).
- **For-You timeline relevance: 0.** I scanned all 35 timeline tweets for 20 observability keywords
  (`observ|sentry|latency|p99|alert|on-call|incident|otel|datadog|grafana|prometheus|cardinality|
  mttr|sre|...`) → **0 hits.** The For You feed is general AI/agent content, not this vertical.

**Conclusion:** X signal is **skipped for the observability vertical** this pass — search is the
only path that would surface practitioner obs-takes and it's 404 on a stale doc_id, while the
timeline carries none. The field intelligence in `field-01..07` therefore rests on **HN threads,
GitHub maintainer trackers (gh-verified), SRE blogs, vendor postmortems, and forum discussions** —
which for THIS vertical are richer and more durable than X anyway (the war stories live in
issue trackers and HN, not in tweets). Flag for GAPS: a future pass should refresh the X search
doc_id (capture via browser-DOM → `--from-json`, per the X-GraphQL login-light pattern) and search
authors like @mipsytipsy (Charity Majors), @lizthegrey, @rakyll, @copyconstruct, @danluu.

## Internal-corpus boundary — the FIELD angle (quoting the mission's named references)

ecosystem-00 already drew the canary-vs-agentmoney boundary table and quoted `runs.jsonl` field-by-
field. The FIELD-layer addition: **the field intelligence VALIDATES that boundary as a noise-control
mechanism, not just a scoping nicety.**

### `energy/logs/runs.jsonl` — the append-only trail, re-read through the war stories
The trail (34 lines, re-verified 2026-06-16) carries BOTH health columns (`ts`, `actor`, `action`,
`durationMs`) and cost columns (`tokensIn`, `tokensOut`) in one record:
```json
{"ts":"2026-06-07T04:29:12.208Z","actor":"claude-code","action":"cp122-energy-cells","model":"opus","durationMs":0,"tokensIn":0,"tokensOut":0,"note":"energy 5-cell close build+test"}
```
**Field-intel read:** this is the in-house, hand-rolled version of the structured-event the whole
"logged everything, learned nothing" literature (field-03) says to emit — ONE wide event with
business context (`action`, `note`), not a thousand thin log lines. It's also already
Majors-shaped (field-06 A1): a wide structured event you can later project into either a health
metric (`durationMs`) or a cost metric (`tokensIn/Out`). The JSONL-append primitive is exactly
right; the only field-intel critique is the missing `trace.id`/`severity` and the all-zero
`durationMs` (markers, not measured spans) — i.e. it's a *log*, not yet a *trace*. canary's own
internal trail should keep this shape and add `trace.id` + real `durationMs` so it becomes the
substrate field-06 A1 prescribes.

### agentmoney — the cost-obs sibling, quoting the boundary
agentmoney's README (read 2026-06-16): *"Stop guessing what AI costs you. Real-time cost monitoring
for Claude, OpenAI, and Gemini APIs... agentmoney shows you exactly where every dollar goes."* Its
unit is **dollars/tokens/models/cache-hit-rate** via a proxy + `--alert 5.00` dollar threshold.
**Field-intel read of the seam:** field-03 §03.5 (LLM pipelines = 10–50× telemetry) is precisely
WHY the split must hold — if canary and agentmoney both ingested the full GenAI firehose, each would
drown. The boundary is a **load-shedding** decision: canary subscribes to `gen_ai.client.operation.
duration` + `.exception` + `error.type` (the health attributes); agentmoney subscribes to
`gen_ai.usage.*_tokens` + cache attrs (the cost attributes). The OTel v1.42 GenAI-repo split
(field-07 §07.4) is the upstream event that makes this clean — the attributes the two harnesses own
now live in a dedicated semconv repo. **The two harnesses never fight because they read disjoint
attribute sets off the SAME span.**

### Checklist Observability section — already quoted verbatim in ecosystem-00
The Energy checklist (`audit/HARNESS-CHECKLIST-2026.md`) separates "**Observability** — cost,
latency, trace per run (owner: agentmoney)" (line 33) from "**Error / crash / uptime monitoring**
(product-side, ≠ LLM observability) — Sentry / Better Stack — **GAP**" (line 75). canary fills the
line-75 GAP for the fleet. The field intelligence simply confirms the GAP is real and high-value:
the product-side error/uptime/alert layer is where the $65M bills (field-02), the 200-pages/week
alert fatigue (field-01), and the silent p99 drift (field-04) all live — none of which agentmoney's
cost lens would catch.

## Sources
- X: `~/energy/scripts/x-content-intel/scrape.py` run 2026-06-16 (timeline 35 OK, search
  404 stale doc_id); session `~/.claude/x-auth/x-session.json` (auth_token live)
- Internal: `~/energy/logs/runs.jsonl` (34 lines, re-read 2026-06-16)
- Internal: `~/agentmoney/README.md` (read 2026-06-16)
- Internal: `~/energy/audit/HARNESS-CHECKLIST-2026.md` (lines 33, 75 — quoted in ecosystem-00)
- Cross-refs: field-03 §03.5 (10–50× LLM telemetry), field-07 §07.4 (OTel v1.42 GenAI split)
