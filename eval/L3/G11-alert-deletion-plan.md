# L3 · G11 (S4 / A2 / A3) — Alert fatigue: the deletion/consolidation plan

> **Hamel level:** L3 trajectory (process-graded). **CI-blocking:** no (plan-graded).
> **Brain:** `brain/BATTLE-TESTED-SCENARIOS.md` S4 · `brain/OPINIONS.md` A2 (the senior move
> is DELETION) + A3 (the metric is the on-call's BELIEF a page is real, not page count).

## The task (the EVAL TASK from S4)

> Given an alert ruleset producing ~50 pages/week with ~95% noise, propose a concrete
> deletion/consolidation plan (which rules to delete, which to convert to tickets, which to
> merge) and predict the effect on MTTA/MTTR.

## SETUP

On-call receives ~50 pages/week; ~5 are real. The team has started muting the app. MTTR is
creeping up because exhausted engineers respond slowly. Three noise classes are present:
threshold noise (static thresholds on normal variance), flapping (fire→resolve→fire),
auto-resolved (fixed itself before a human looked).

## What a PASSING trajectory does (the rubric — grade the PROCESS)

1. **Leads with DELETION, not addition** (A2): a junior adds an alert "to be safe"; a senior
   deletes to restore signal. The plan's first move is removing/demoting, not tuning thresholds
   up.
2. **Classifies each rule into delete / ticket / merge / keep-as-page:**
   - static-threshold-on-normal-variance → **delete** or convert to **burn-rate (MWMBR, S6)**.
   - self-healing / auto-resolved conditions → **ticket or drop** (never a human).
   - flapping → add `for:` duration + hysteresis (kill the flap), or merge.
   - N downstream alerts from ONE root cause → **dedup/correlate into ONE incident**.
3. **Sets the target explicitly:** ≤2 actionable pages per shift, both real (Google SRE
   Workbook) — and frames alert hygiene as an **MTTR lever** (the 400/night→8 turnaround
   *collapsed MTTR from 4h12m*), not a comfort feature.
4. **Predicts the MTTA/MTTR effect** with the causal mechanism (restored belief → faster
   response), not just "fewer pages."
5. **Re-frames the metric** (A3): the goal is the on-call's *belief* that a page is real, not
   the raw page count.

## Anti-patterns (a FAILING trajectory)

- Raising thresholds across the board (still static, still noisy).
- Keeping every rule "just in case" and only adding a digest.
- Predicting "fewer pages" without connecting it to MTTR via trust.

## Reference outcome (the bar)

A plan that DELETES the static-threshold noise, converts availability rules to MWMBR burn-rate,
tickets the self-healing conditions, dedups the downstream cascade, and predicts page volume →
single digits/week with MTTR *improving* because belief is restored. canary's `audit` (B8) and
`slo-burn-rate-alerting` skill (B11) are the tools the plan reaches for.
