---
title: "canary ecosystem research — SLOs, error budgets, burn-rate alerting"
type: research
created: 2026-06-16
tags: [canary, observability, slo, sli, error-budget, burn-rate, multi-window, sre, promql]
researcher: ecosystem (CP123 Wave-R)
---

# 07 — SLOs, error budgets, and burn-rate alerting

This is canary's **"are we within the contract?"** pillar — the math that turns raw latency/error
metrics (ecosystem-05) into a single actionable signal: *are we burning the budget too fast?*
This is the discipline that prevents both alert fatigue (alerting on every 5xx) and missed
outages (alerting too slowly). It is the canonical Google-SRE methodology and it is largely
*stable* (the math hasn't changed in years) — so this file's value is precision, not novelty.

## 7.1 The three terms (precise definitions)

- **SLI** (Service Level Indicator) — a measured ratio of good events / total events. Canonical
  forms: **availability** = `good_requests / total_requests`; **latency** = `requests_faster_than_threshold / total_requests`. (Latency SLIs are a *ratio*, not a raw p99 — "what fraction of requests were under 300ms," not "what was p99.")
- **SLO** (Service Level Objective) — the target for the SLI over a window. E.g. "99.9% of
  requests succeed over 30 days." The window is almost always **28 or 30 days** (rolling).
- **Error budget** = `1 − SLO`. A 99.9% SLO ⇒ a **0.1% error budget**. Over 30 days that's
  **~43.2 minutes** of allowed downtime (or 0.1% of requests allowed to fail). The budget is the
  *permission to fail* — it converts reliability from a binary into a quantity you spend.

## 7.2 Burn rate — the key concept

**Burn rate = how fast you're consuming the error budget, relative to the rate that would exactly
exhaust it over the SLO window.**

- Burn rate **1×** = you'll spend exactly 100% of the budget over the full window (e.g. 30 days).
- Burn rate **2×** = you'll exhaust the entire 30-day budget in 15 days.
- Burn rate **14.4×** = you'll exhaust the entire 30-day budget in ~50 hours.

The exact relationship (verbatim, sre.google/workbook/alerting-on-slos/, fetched 2026-06-16):
**"burn rate × alerting window size / period = the error budget consumed."** So a 14.4× burn rate
over a 1-hour window consumes `14.4 × 1h / 720h ≈ 2%` of a 30-day budget.

## 7.3 THE canonical recommendation — Multi-Window Multi-Burn-Rate (MWMBR)

This is the single most-cited operational pattern in SRE alerting, and it is what canary should
implement/recommend. **Source: Google SRE Workbook, "Alerting on SLOs," Table 5-8** (verbatim
values fetched from sre.google/workbook/alerting-on-slos/, 2026-06-16):

| Severity | Long window | Short window | Burn rate | Error budget consumed |
| --- | --- | --- | --- | --- |
| **Page** | 1 hour | 5 minutes | **14.4×** | **2%** |
| **Page** | 6 hours | 30 minutes | **6×** | **5%** |
| **Ticket** | 3 days (72h) | 6 hours | **1×** | **10%** |

(Corroborated by oneuptime.com/blog/post/2026-02-17-how-to-set-up-multi-window… and
novaaiops.com/blog/the-multi-window-multi-burn-rate-alert, both 2026 — same 14.4/6/1 tiers,
2%/5%/10% budgets.)

**The two ideas that make MWMBR work:**

1. **Multi-burn-rate (the tiers).** A *fast* burn (14.4×) pages immediately (an outage); a *slow*
   burn (1×) only opens a ticket (a chronic, non-urgent leak). This is what prevents both
   over- and under-alerting: you don't page a human for a slow leak, and you don't wait 3 days
   for a hard outage.
2. **Multi-window (the AND condition).** Each tier requires BOTH a long window AND a short window
   to exceed the threshold *simultaneously*. The long window gives precision (the burn is real,
   not a 30-second spike); the **short window gives a fast reset** — verbatim: "fire only once
   you've consumed 2% of the budget, but exhibit a better reset time by ceasing to fire five
   minutes later, rather than one hour later." Without the short window, a 1-hour-window alert
   keeps firing for an hour after the incident is fixed.

## 7.4 The PromQL implementation (the load-bearing flow for canary)

This is how the table above becomes a live alert in Prometheus/Alertmanager (ecosystem-05). The
SLI here is availability; `job:slo_errors:ratio_rate1h` is a *recording rule* computing the error
ratio over 1h (and similar for 5m, 6h, 30m, 3d, 6h).

```yaml
# The 14.4x / Page tier — both windows must breach (1h AND 5m)
- alert: ErrorBudgetBurn_Fast
  expr: |
    job:slo_errors:ratio_rate1h{job="api"}  > (14.4 * 0.001)   # 0.001 = 1 - 0.999 SLO
    and
    job:slo_errors:ratio_rate5m{job="api"}  > (14.4 * 0.001)
  labels: { severity: page }

# The 6x / Page tier (6h AND 30m)
- alert: ErrorBudgetBurn_Medium
  expr: |
    job:slo_errors:ratio_rate6h{job="api"}  > (6 * 0.001)
    and
    job:slo_errors:ratio_rate30m{job="api"} > (6 * 0.001)
  labels: { severity: page }

# The 1x / Ticket tier (3d AND 6h)
- alert: ErrorBudgetBurn_Slow
  expr: |
    job:slo_errors:ratio_rate3d{job="api"} > (1 * 0.001)
    and
    job:slo_errors:ratio_rate6h{job="api"} > (1 * 0.001)
  labels: { severity: ticket }
```

(Pattern from sre.google/workbook/alerting-on-slos/ + oneuptime.com 2026-01-30 burn-rate-alerts
guide; threshold = `burn_rate × error_budget` where `error_budget = 1 − SLO`.)

**The recording-rule footgun:** you must pre-compute the per-window error ratios as recording
rules — computing `rate(...[3d])` inline in an alert is expensive and slow. This is the standard
two-layer pattern: recording rules compute SLIs continuously; alert rules compare them to
`burn_rate × budget` thresholds. (See ecosystem-05 §5.3 for the underlying `rate()`/
`histogram_quantile()` primitives.)

## 7.5 Real-world breakage & honest caveats

- **The "alert fired but budget was fine" / "budget exhausted but no alert" complaints** trace
  almost always to *single-window* alerting (the thing MWMBR fixes) or to a mismatch between the
  SLI's window and the alert window. (github.com/google/slo-generator Discussion #376, "Multi-
  window, multi-burn-rate: is it achievable?", surfaced 2026-06-16 — practitioners struggling to
  implement MWMBR correctly on Google Cloud SLOs.)
- **SLIs must be ratios, not raw quantiles.** A common mistake: alerting on "p99 > 300ms"
  directly. The SLO-correct form is "the fraction of requests slower than 300ms exceeds the
  budget." Raw-quantile alerting can't be expressed as an error budget and reintroduces the
  noise MWMBR removes. (Yuri Grinshteyn, medium.com/google-cloud/how-to-alert-on-slos, classic
  reference; backendbytes.com SRE playbook 2026.)
- **The budget is a *decision tool*, not just an alert.** The cultural half of the SRE model:
  when the budget is healthy → ship fast; when it's exhausted → freeze features and fix
  reliability. (Yair Stark, "Error Budget Is All You Need," medium/dev.to 2026.) For canary's
  fleet, this maps to the snap-back/gate model — a product that's burned its budget shouldn't
  ship a risky deploy.
- **Tooling:** `google/slo-generator` (Python, generates SLO configs + alert rules + reports
  across backends), Pyrra, Sloth (Prometheus-native SLO generator), Nobl9 (commercial SLO
  platform), Grafana SLO (in Grafana Cloud). [GAP: did not pull exact current versions/stars of
  Sloth/Pyrra/Nobl9 this pass — flagged for GAPS.]

## 7.6 What an AGENT operating SLOs needs

- **The math is deterministic and scriptable** — burn rate, budget remaining, time-to-exhaustion
  are all simple arithmetic over the SLI ratio. An agent should *compute and report* "we've burned
  62% of this month's error budget; at the current 3× rate it exhausts in 4.1 days" — this is far
  more actionable than a raw error count.
- **Prefer recording rules + Alertmanager** (deterministic, in Git, snap-back-able) over a
  vendor's GUI SLO builder. An agent authors the recording + alert rules as code.
- **Read SLO state through the Grafana MCP** (`grafana/mcp-grafana`, ecosystem-05/09) — query the
  PromQL burn-rate expressions, read which burn-rate alerts are firing. One MCP, full SLO picture.
- **This is canary's highest-leverage synthesis output for the fleet:** it ties together errors
  (Sentry), latency (Prometheus), and paging (ecosystem-06) into one number — the burn rate —
  that decides whether to page, ticket, or freeze. canary's job is to compute it correctly and
  honestly.

## Sources
- sre.google/workbook/alerting-on-slos/ (fetched 2026-06-16) — Table 5-8 (14.4×/6×/1× tiers,
  2%/5%/10% budgets, 1h/5m, 6h/30m, 3d/6h windows), the "burn rate × window / period" formula,
  the short-window fast-reset rationale verbatim.
- oneuptime.com/blog/post/2026-02-17-how-to-set-up-multi-window-multi-burn-rate-alerting-for-slos-
  on-google-cloud/view (2026-02-17) — MWMBR on GCP, same tiers.
- oneuptime.com/blog/post/2026-01-30-sre-burn-rate-alerts/view (2026-01-30) — burn-rate alert
  construction, threshold = burn_rate × budget.
- novaaiops.com/blog/the-multi-window-multi-burn-rate-alert — MWMBR explainer, 2%/5%/10%.
- medium.com/@yairstark / dev.to/yairst "Error Budget Is All You Need - Part 1" (2026) — budget
  as decision tool.
- medium.com/google-cloud/how-to-alert-on-slos (Yuri Grinshteyn) — SLIs-as-ratios, alerting math.
- github.com/google/slo-generator Discussion #376 (surfaced 2026-06-16) — real practitioner
  difficulty implementing MWMBR; the slo-generator tool.
- backendbytes.com/articles/sre-slos-slis-error-budgets/ (2026) — SLO/SLI/budget production
  playbook.
- Cross-ref: ecosystem-05 §5.3 (PromQL rate/histogram_quantile), §5.4 (Alertmanager), ecosystem-06
  (paging the burn-rate alert).
