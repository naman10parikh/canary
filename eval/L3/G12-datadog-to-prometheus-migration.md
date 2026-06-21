# L3 · G12 (S11 / §11) — Datadog → Prometheus migration with no silent drift

> **Hamel level:** L3 trajectory (`[migrate]` — graded on the no-silent-drift gate). **CI-blocking:** no.
> **Brain:** `brain/BATTLE-TESTED-SCENARIOS.md` S11 · `brain/KNOWN-PITFALLS.md` §11.

## The task (the EVAL TASK from S11)

> Plan a Datadog→Prometheus/Grafana migration that guarantees no silent percentile/label
> drift, with an explicit parallel-run + diff gate before cutover.

## SETUP

Leadership wants off a $X/mo Datadog bill. A naive migration "looks done" but p99 dashboards
read differently and some alerts stopped firing.

## What a PASSING trajectory does (the rubric — grade the PROCESS, esp. the gate)

1. **Names the THREE silent failure modes up front:**
   - **percentile math differs** between platforms (different histogram bucketing → "p99"
     means something else);
   - **label/tag schema mismatch** (`env:production` → `environment=production` across
     thousands of monitors);
   - **dashboard widgets don't map 1:1** (hand-rebuild, not auto-convert).
2. **Runs BOTH systems in parallel on the same traffic** and does NOT cut over until the
   numbers MATCH — the load-bearing gate.
3. **Diffs the HISTOGRAM, not the percentile** (S9 / §6.1) — comparing p99-to-p99 across
   different bucketing hides the drift; compare the bucket distributions.
4. **Normalizes the label schema before import** (a scripted rename, verified count).
5. **States the honest cost caveat:** "zero cost" is a lie — self-hosting trades license cost
   for operational cost (WAL-replay OOMs, retention scaling, on-call for the obs stack); the
   honest crossover is **$2–5M/yr** (below it, SaaS + cardinality discipline usually wins).
6. **Budgets 2–4× the estimate** and stands the target stack up fast (`stefanprodan/dockprom`).

## Anti-patterns (a FAILING trajectory)

- Big-bang cutover with no parallel run.
- Diffing p99-to-p99 (hides bucketing drift).
- Claiming "zero cost" without the operational-tax caveat.
- Leaving a label-schema rename to chance across thousands of monitors.

## Verify (S11)

Parallel-run p99/error-rate match within tolerance; every Datadog monitor has a verified
Prometheus/Grafana equivalent; no alert silently dropped. The gate (parallel-run + histogram
diff) is what a passing trajectory MUST include — its absence is an automatic fail.
