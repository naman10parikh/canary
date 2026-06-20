# canary — Heartbeat

> canary dogfoods its own preaching: a monitoring employee that goes silently dead is itself the
> worst incident (OPINIONS D5, `brain/BATTLE-TESTED-SCENARIOS.md` S18). So canary's HEARTBEAT is a
> **cron check-in / dead-man's-switch** — a *missed* check-in pages, because the absence of an
> expected event is invisible to error/uptime monitoring. This file is the spec; the enabled
> GitHub-Actions wiring is Cluster-D (`workflows/rsi.workflow.js` + `.github/workflows/rsi.yml`).

## Schedule

| Check | Frequency | Action on anomaly |
| --- | --- | --- |
| **Dogfood cron check-in** (canary emits a heartbeat to its own monitor) | Every scheduled RSI run | A *missed* check-in is an incident — the dead-man's-switch fires (S18) |
| **Deterministic RSI loop** (`workflows/rsi.workflow.js --deterministic`) | Nightly / `workflow_dispatch` | Re-verify tool-matrix pins + the death-watch (EOL/archived tools); re-run the eval pyramid; propose a gated diff |
| **Self-audit** (`canary audit` on canary's own repo) | Each RSI run | Block on any footgun canary preaches against (the dogfood hook also gates commits) |
| **Eval regression** (`canary eval` L1+L2) | Each RSI run | If the acceptance test or a CI-blocking golden task regresses → no propose/commit |

## Health indicators

- **Healthy**: last check-in within one cron cycle; `logs/runs.jsonl` tail has a real `trace.id` +
  measured `durationMs`; the acceptance test green in CI.
- **Warning**: a tool-matrix pin is stale, or an eval is flaky (passes <k of k trials).
- **Critical**: a missed check-in (dead-man's-switch fires), OR a death-watch hit (a pinned tool is
  now EOL / archived / shut-down — the Opsgenie / OnCall-OSS / Prometheus-EOL class) → page.

## Recovery

1. Read the last run from `logs/runs.jsonl` (the dogfooded wide event — a trace, not just a log).
2. Check `memory/LEARNINGS.md` + `brain/KNOWN-PITFALLS.md` for the known fix (keyed by §-ID).
3. If a death-watch hit: open the gated RSI PR that swaps the dead tool for its documented alt
   (`brain/TOOL-MATRIX.md`), evals must pass before merge.
4. If fixable: apply, re-run `canary eval`, resume.
5. If not: surface the incident (this is what canary is *for*) and preserve `logs/runs.jsonl`.

## Boundary

This HEARTBEAT watches **canary's own health** — app-health/observability only. It never tracks LLM
token spend or cost (agentmoney's seam, `gen_ai.usage.*`).
