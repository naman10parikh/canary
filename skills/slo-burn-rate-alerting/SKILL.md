---
name: slo-burn-rate-alerting
description: Turn metrics into ONE signal — an SLO with Multi-Window Multi-Burn-Rate (MWMBR) alerting that decides page vs ticket vs freeze. Use when the user says "SLO", "error budget", "burn rate", "alert on availability/reliability", or "how do I alert on my 99.9% target". Encodes the MWMBR recipe, SLI-as-ratio, generate-via-Sloth, and the volume-floor rule.
allowed-tools: Bash(canary:*), Bash(promtool:*), Bash(sloth:*), Read, Edit
---

# slo-burn-rate-alerting

> The highest-leverage synthesis: collapse a wall of metrics into one error-budget signal. Fast burn
> pages, slow burn tickets — each tier needs BOTH a long and a short window. (BATTLE-TESTED **S6**,
> EXPERTISE **JOB 6**, KNOWN-PITFALLS **§2/§7.3**, OPINIONS **A5**.)

## Trigger

Invoke for any "SLO / error budget / burn rate / alert on availability" request, or when replacing a
noisy static-threshold ruleset with burn-rate alerting (the senior fix for alert fatigue, S4).

## Steps

1. **Run the generator — do NOT hand-write the rules (S6 footgun).** `canary slo --service <name>
   --target <99.9> --out <dir> --json`. canary generates via **Sloth** (static YAML an agent commits),
   never by hand — practitioners get MWMBR subtly wrong (slo-generator Discussion #376).
2. **SLI MUST be a ratio, never a raw quantile (the #1 S6 footgun).** The SLI is `good / total`
   (e.g. non-5xx requests / total). A raw `p99 > 300ms` **cannot** be expressed as an error budget —
   if the request is "latency SLO", convert to a ratio: `fast_requests / total` against a threshold.
3. **Emit the three MWMBR tiers** (Google SRE Workbook Table 5-8; budget = `1 − SLO`, e.g. 0.001):
   - `ErrorBudgetBurn_Fast` — **14.4×** burn, **1h AND 5m** windows, `severity: page`.
   - `ErrorBudgetBurn_Medium` — **6×** burn, **6h AND 30m** windows, `severity: page`.
   - `ErrorBudgetBurn_Slow` — **1×** burn, **3d AND 6h** windows, `severity: ticket`.
   Each tier requires BOTH windows to breach (long = precision, short = fast reset).
4. **Pre-compute per-window ratios as recording rules (§7.3).** Inline `rate(...[3d])` over
   high-cardinality is slow/expensive — emit `job:slo_errors:ratio_rate{1h,5m,6h,30m,3d}` recording
   rules and have the alerts compare those.
5. **Never a rate/% alert without a volume floor (OPINIONS A5, §2.1).** A bare `failure_rate > X%` is a
   lie at low volume (1 error in 3 = 33% = a 3 AM page). The MWMBR long window supplies the real
   denominator; for any non-MWMBR rate alert add `AND count(...) > N` explicitly.
6. **Validate offline before reload (§7.3/§8.1).** `promtool check rules <dir>/*.yml` (and `amtool
   check-config` for Alertmanager). The whole flow is local/$0 — no running Prometheus needed.

## Output

- A `promtool`-valid ruleset in `<dir>`: recording rules (per-window error ratios) + the three MWMBR
  alert tiers (14.4× page / 6× page / 1× ticket), SLI expressed as `good/total`.
- `canary slo` returns `{ rulesPath, promtoolValid: boolean }` under `--json`.
- A one-line rationale per tier (why fast→page, slow→ticket) and the stated error budget (`1 − SLO`).

**Refuses:** a raw-quantile SLI; a single-window burn alert; any rate alert with no volume floor;
hand-written MWMBR rules.
