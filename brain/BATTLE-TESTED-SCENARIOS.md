---
title: "canary BATTLE-TESTED SCENARIOS — real failure/migration/production cases + resolution"
type: brain
status: active
created: 2026-06-16
tags: [canary, observability, scenarios, golden-eval-tasks, postmortems, war-stories, runbook]
source: brain/research/raw/ecosystem-01/05/07/08/09/10/11/14, brain/research/raw/field-01..05/07
related: ["[[EXPERTISE-MAP]]", "[[KNOWN-PITFALLS]]", "[[TOOL-MATRIX]]", "[[OPINIONS]]", "[[MOC - canary]]"]
---

# canary Battle-Tested Scenarios

> Real, specific failure / migration / production scenarios — each with **symptom → diagnosis →
> resolution → verify**, plus an **EVAL TASK** line (these become the golden tasks in Wave S). Every
> scenario is grounded in a cited GitHub issue, vendor doc, or war story — **not** a generic textbook
> case. If a fresh canary session can resolve these from the brain alone, it is dangerous in this
> vertical.
>
> Difficulty tags: `[detect]` (diagnose only) · `[fix]` (diagnose + remediate) · `[design]` (build
> the right thing) · `[migrate]` (move A→B safely).

---

## S1 — Minified stack traces in prod: "a.b.c is not a function" `[fix]`
**Source:** `ecosystem-08 §8.2`, sentry-javascript #5186 (51c).
**Symptom:** Every JS error in Sentry shows `a.b.c is not a function` at `chunk-7f3a.js:1:24601` —
minified garbage. Seer's root-cause analysis is also useless (it reads the same minified trace).
**Diagnosis:** Source maps not uploaded, or uploaded but not matched. Check **Settings > Projects >
[project] > Source Maps** for artifacts. Most likely the deployed JS contains **no Debug IDs** (the
"Sentry not part of build pipeline" error) — so Sentry can't match the bundle to any uploaded map.
**Resolution:**
1. Add a bundler plugin (`@sentry/vite-plugin`/`webpack-plugin`/`esbuild-plugin`) OR run
   `sentry-cli sourcemaps inject ./dist && sentry-cli sourcemaps upload ./dist`.
2. **Order is load-bearing:** inject BEFORE upload BEFORE deploy. Make it a CI build step, never a
   post-incident scramble.
3. Tie maps to a release + commits: `sentry-cli releases set-commits <rel> --auto` (so suspect-commits
   / Seer can blame the right PR).
4. Quick scaffold: `npx @sentry/wizard@latest -i sourcemaps`.
**Verify:** `sentry-cli sourcemaps upload --validate` passes; a NEW error (after upload) shows
`submitOrder is not a function at OrderForm.tsx:42`. **Past errors stay minified — symbolication only
applies to errors that occur AFTER the map upload.**
**EVAL TASK:** Given a repo with `Sentry.init` but no bundler plugin and minified prod traces, wire
source-map upload correctly into CI and prove a fresh error symbolicates.

---

## S2 — Source-map upload OOMs the Vercel build `[fix]`
**Source:** `ecosystem-08 §8.3`, sentry-javascript #10468 (55c), #15100 (49c, closed 2025-11-18).
**Symptom:** After adding `@sentry/nextjs`, the Vercel build fails with an OOM during `next build`
(and/or "Webpack serialization performance" warnings; build time balloons).
**Diagnosis:** The Sentry webpack plugin's source-map processing is memory- and CPU-heavy on large
Next.js apps — a build-environment footgun, not a runtime bug. This is "instrumentation is not free"
at build time.
**Resolution:** Reduce the plugin's work — scope source-map upload to only the needed assets, raise
the build container memory, or move the inject/upload to a `sentry-cli` step outside the webpack pass.
Pin a current plugin version (older inject code was itself a bottleneck — sentry-cli #1710, 25c).
**Verify:** `next build` completes within the Vercel memory limit; maps still upload (check artifacts).
**EVAL TASK:** Diagnose a failing Vercel build whose only change was adding `@sentry/nextjs`; restore
a green build while keeping source maps.

---

## S3 — The 3 AM page for nothing: rate alert at low volume `[design]`
**Source:** `field-05 §05.2`, getsentry/sentry #66988 (active 2026-06-03); `field-04 §04.5`.
**Symptom:** On-call gets paged at 3 AM: "failure rate 33% > 5% threshold." Reality: 1 error out of 3
total requests overnight. No customer affected.
**Diagnosis:** A *rate* alert (`failure_rate > 5%`) is a lie at low volume — the denominator is tiny,
so one failure spikes the ratio. Same class as a "fleet p99" computed over 5 requests = noise.
**Resolution:** **Never emit a percentage-threshold alert without a volume floor.** Gate it:
`failure_rate > 5% AND count(errors) > N` (or `AND count(requests) > M`). In Prometheus terms, this is
exactly why MWMBR (S6) uses both a long *and* short window — the long window supplies a real
denominator. (Sentry's own metric-alert UI still ships this footgun by default → an agent must add
the floor by hand.)
**Verify:** Replay the overnight traffic; the alert no longer fires at low volume but DOES fire when
volume is real and the rate is genuinely high.
**EVAL TASK:** Given an alert config that pages on `failure_rate > 5%`, rewrite it so it cannot fire
below a sane request-volume floor, and justify the floor.

---

## S4 — Alert fatigue: 200 pages/week, ~5 real `[design]`
**Source:** `field-01 §01.2/§01.4/§01.4b` (400/night→8, MTTR 4h12m→trustworthy), Google SRE 2/shift.
**Symptom:** On-call receives 200+ pages/week; ~5 are real. The team has started muting the app.
MTTR is creeping up because exhausted engineers respond slowly.
**Diagnosis:** Over-monitoring — "everything is P1." Three noise classes: **threshold noise** (static
thresholds firing on normal variance), **flapping** (fire→resolve→fire), **auto-resolved** (fixed
itself before a human looked). The real metric isn't page count, it's the on-call's *belief* that a
page is real — and that belief has collapsed.
**Resolution (the senior move is DELETION, not addition):**
1. Replace static thresholds with **burn-rate / MWMBR** (S6) — pages only on real budget burn.
2. Add `for:` duration + hysteresis to kill flapping.
3. **Don't page on self-healing conditions** — ticket or drop them.
4. Severity tiers that *actually differ*: P1 → phone; P3 → ticket; info → dashboard, never a human.
5. Correlate/dedup: one root cause firing 40 downstream alerts = ONE incident.
**Target:** ≤2 actionable pages per shift, both real (Google SRE Workbook). The 400→8 turnaround shows
this *collapses MTTR* — alert hygiene is an MTTR lever, not a comfort feature.
**Verify:** Page volume drops to single digits/week; sampled pages are all actionable; MTTR improves.
**EVAL TASK:** Given an alert ruleset producing ~50 pages/week with ~95% noise, propose a concrete
deletion/consolidation plan (which rules to delete, which to convert to tickets, which to merge) and
predict the effect on MTTA/MTTR.

---

## S5 — The page that never delivered: monitor your alert pipeline `[design]`
**Source:** `field-01 §01.4c` (PagerDuty 9h outage Aug 28 2025, ~95% events rejected for 38 min),
Alertmanager #226 (OPEN 71c), #2404 (OPEN), #3920 (Teams webhook killed), `field-06 A7`.
**Symptom:** A real incident happened but **nobody was paged.** Every dashboard was "green" — because
the *pager itself* was broken, not because nothing was wrong. (Or: the page fired but never cleared,
so on-call stayed anxious on a dead incident.)
**Diagnosis:** **A firing alert rule ≠ a delivered page.** The delivery path is the most under-tested
link: the paging vendor can be down (PagerDuty's own 38-min 95%-rejection window), a webhook can be
silently dropped (#2404), a vendor can kill the webhook format (Microsoft Teams #3920), or
`send_resolved` is off so the resolve never sends (#226).
**Resolution (canary's strongest differentiator — no competitor markets this):** **heartbeat-test each
notification channel end-to-end on a schedule** — fire a synthetic alert through PagerDuty/Slack/
webhook → confirm receipt → if not received within N seconds, raise *that* as an incident in its own
right. Treat alert delivery as a monitored failure domain.
**Verify:** Kill a channel (revoke the webhook); the heartbeat detects the dead channel and alerts via
a *different* channel within one cycle.
**EVAL TASK:** Design (and stub) a notification-channel heartbeat that proves a page can actually be
delivered through each configured channel, and fails loudly when one is dead.

---

## S6 — Implement SLO burn-rate alerting correctly (MWMBR) `[design]`
**Source:** `ecosystem-07 §7.3/§7.4` (Google SRE Workbook Table 5-8), `ecosystem-14 §14.6` (Sloth),
slo-generator Discussion #376 (practitioners struggling to get it right).
**Symptom:** Either "the alert fired but the budget was fine" or "the budget was exhausted but no
alert" — and the team wants a single signal that decides page vs ticket vs freeze.
**Diagnosis:** Single-window alerting. The fix is **Multi-Window Multi-Burn-Rate**: fast burn pages,
slow burn tickets; each tier needs BOTH a long and short window to breach (long = precision, short =
fast reset).
**Resolution:** Recording rules compute per-window error ratios; alert rules compare to `burn_rate ×
budget` (budget = `1 − SLO`). For a 99.9% SLO (`budget = 0.001`):
```yaml
- alert: ErrorBudgetBurn_Fast        # 14.4x / Page — 1h AND 5m
  expr: |
    job:slo_errors:ratio_rate1h{job="api"} > (14.4 * 0.001)
    and
    job:slo_errors:ratio_rate5m{job="api"} > (14.4 * 0.001)
  labels: { severity: page }
- alert: ErrorBudgetBurn_Medium      # 6x / Page — 6h AND 30m
  expr: |
    job:slo_errors:ratio_rate6h{job="api"}  > (6 * 0.001)
    and
    job:slo_errors:ratio_rate30m{job="api"} > (6 * 0.001)
  labels: { severity: page }
- alert: ErrorBudgetBurn_Slow        # 1x / Ticket — 3d AND 6h
  expr: |
    job:slo_errors:ratio_rate3d{job="api"} > (1 * 0.001)
    and
    job:slo_errors:ratio_rate6h{job="api"} > (1 * 0.001)
  labels: { severity: ticket }
```
**Footgun to avoid:** the SLI must be a **ratio** (`good/total`), NOT a raw quantile — "p99 > 300ms"
directly can't be expressed as an error budget. **Don't hand-write this** — generate via **Sloth**
(static YAML an agent commits). Pre-compute the per-window ratios as recording rules (inline
`rate(...[3d])` is expensive/slow).
**Verify:** `promtool check rules` passes; inject a synthetic error spike → the 14.4× tier fires
within minutes AND resets within 5 min of recovery; a slow leak fires only the ticket tier.
**EVAL TASK:** Given a service with a 99.9% availability SLO, produce the recording + MWMBR alert
rules (validated with `promtool`) and explain why each tier exists.

---

## S7 — Did the deploy regress? Crash-free drop → rollback decision `[fix]`
**Source:** `ecosystem-10 §10.1/§10.3/§10.4`, `ecosystem-14 §14.4` (autoSessionTracking removed).
**Symptom:** Error count looks roughly flat after a deploy, but users are complaining the app crashes.
Is the new release actually worse?
**Diagnosis:** Raw error count hides release regressions (a spike could be one noisy user). The honest
signal is **crash-free-users rate per release**. First confirm Release Health is even wired:
(a) `release` set on `Sentry.init` (format `my-project@1.0.0`), (b) sessions actually being sent,
(c) commits associated. **Version-branch the sessions check:** on Sentry SDK **≥ v9** (the current v10
line) the old `autoSessionTracking` flag is **removed** — check for `browserSessionIntegration()`
(browser) / `httpIntegration` (server) instead. An agent grepping for `autoSessionTracking` in a
modern codebase finds nothing and would wrongly conclude sessions are off.
**Resolution:** Pull crash-free-users rate for the new release vs the previous via the Sentry MCP
(`get-release-details`) / REST. If it dropped (e.g. 99.6% → 98.1%) **and** adoption is non-trivial →
recommend rollback. **Weight by adoption** — don't roll back a beta on 3 sessions (noisy rate).
**Verify:** Compare current vs previous release crash-free-users + adoption; the recommendation
matches the user-impact reality.
**EVAL TASK:** Given two consecutive releases' session data, decide go/rollback, correctly handling
the adoption weighting AND the v9+ session-tracking config check.

---

## S8 — The cardinality bomb that becomes half the bill (and a DoS) `[detect]`
**Source:** `field-02 §02.1` (Datadog custom metrics ≤52% of bill), `field-03 §03.4` (25B-series math),
`field-05 §05.3` (OTel Cardinality Guardian #47368), oneuptime DoS angle.
**Symptom:** The observability bill jumps; or Prometheus OOMs; or an attacker is injecting unique
label values per request and the obs cost is spiraling.
**Diagnosis:** **High-cardinality labels on metrics.** The canonical math: `method`(5) × `status`(5) ×
`pod_id`(1,000) = 25,000 series; add `user_id`(1,000,000) → **25 BILLION series.** A label whose value
space is unbounded (IDs, emails, URLs, full paths, `request_id`, `span_id`) does not belong on a
metric — Datadog prices custom metrics on cardinality (up to 52% of the bill), and an injectable
unbounded label is a **DoS surface**.
**Resolution:**
1. Identify the offending label (the unbounded-value one).
2. **Strip it before it exits the network** — OTel Collector `filter`/`transform`/`attributes`
   processor (static drop-list = table stakes). For 2026 best practice, the dynamic **Cardinality
   Guardian** processor (HLL++) "surgically strips only the offending labels" at runtime — static
   lists "drop the entire datapoint" and only help *after* you know which label exploded.
3. Move the high-cardinality value to a **trace/event** (where context belongs), not the metric.
**Verify:** Series count drops back to bounded; the bill/memory stabilizes; the unbounded label is no
longer ingested as a metric dimension.
**EVAL TASK:** Given a metric with a `user_id` label and an exploding series count, identify the bomb,
write the Collector processor config to strip it, and state where that value should live instead.

---

## S9 — The "fleet p99" panel that lies `[detect]`
**Source:** `field-04 §04.3` (Last9: cannot average percentiles), `field-02 §02.3` (silent percentile
drift across migrations), `ecosystem-05 §5.3` (native histograms).
**Symptom:** The service-wide p99 dashboard reads a comfortable 200 ms, but users report multi-second
latency. The panel computes the service p99 by **averaging per-pod p99s**.
**Diagnosis:** **You cannot average percentiles** — they're positions in a distribution, not
arithmetically combinable values. `avg(p99_per_pod)` is *usually optimistically wrong* (under-reports
the tail). To aggregate correctly you must merge the underlying **histograms** (t-digest /
HdrHistogram / Prometheus `histogram_quantile()`), then recompute.
**Resolution:** Replace `avg(per-pod p99)` with
`histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))` — aggregate
the histogram buckets across pods *first*, then compute the quantile. Prefer **native histograms**
(auto exponential bucketing) so the bucket boundaries don't silently mis-measure the tail.
**Verify:** The corrected panel reflects the real tail (now showing the multi-second p99); it matches
a t-digest/raw-data computation.
**EVAL TASK:** Given a Grafana panel computing service p99 via `avg()` over per-instance percentiles,
rewrite the PromQL to aggregate histograms correctly and explain why the old number was wrong.

---

## S10 — Sentry SDK upgrade leaks memory `[fix]`
**Source:** `ecosystem-11 §11.1` (sentry-javascript #13412 v7→v8 leak, 52c; #12317 ≥8.6.0 leak;
#12077 v8 dep warning; #2957 Vue 100% CPU), `ecosystem-14 §14.4` (current line is v10).
**Symptom:** After bumping `@sentry/*` (e.g. v7→v8, or into ≥8.6.0), the app's memory climbs over
hours until OOM — or (Vue) CPU pins at 100% from infinite recursion in the SDK.
**Diagnosis:** **A monitoring-SDK upgrade is itself an incident.** The two biggest leaks and the Vue
freeze were all major/minor SDK upgrade regressions — the monitoring tool degraded (or crashed) the
app it watches. The current line is **v10** (v8→v9 and v9→v10 each had breaking migrations).
**Resolution:** Treat the bump as a risk event — after upgrading, watch memory + release-health
crash-free rate, not just "it compiled." If a leak is confirmed, pin to a known-good version and check
the migration guide (v8→v9 removed `autoSessionTracking`/`Hub`/`enableTracing`; v9→v10 bumped OTel to
v2 — if you can't run OTel v2, use the `@sentry/node-core` escape hatch with widened OTel peer deps).
**Verify:** Memory is flat over a multi-hour soak after the bump; crash-free rate didn't regress.
**EVAL TASK:** Given a heap-growth incident whose only recent change was a Sentry SDK bump, confirm
the SDK as the cause, and produce a safe remediation (pin or migrate) with the right post-bump checks.

---

## S11 — Datadog → Grafana/Prometheus migration without silent drift `[migrate]`
**Source:** `field-02 §02.2/§02.3` (10s-of-millions saved BUT operational tax; silent percentile
drift; `env:production` vs `environment=production` label mismatch at 10k monitors; dashboards don't
map 1:1), `ecosystem-12` (dockprom), `ecosystem-05 §5.6`.
**Symptom:** Leadership wants off a $X/mo Datadog bill. The migration "looks done" but p99 dashboards
read differently and some alerts stopped firing.
**Diagnosis:** Observability migration is an incident-prone change. Three silent failures: (1)
**percentile math differs** between platforms (different histogram bucketing → "p99" means something
else); (2) **label/tag schema mismatch** (`env:production` → `environment=production` across thousands
of monitors); (3) **dashboard widgets don't map 1:1** (hand-rebuild, not auto-convert).
**Resolution:** **Run both systems in parallel on the same traffic; diff the p99 and error-rate; do
NOT cut over until the numbers MATCH.** When diffing latency, diff the **histogram**, not the
percentile (S9). Normalize the label schema before import. Budget 2–4× the estimate. Stand up the
target stack fast with `stefanprodan/dockprom`.
**Honest caveat to state:** "zero cost" is a lie — self-hosting trades license cost for operational
cost (WAL-replay OOMs, retention scaling, on-call for the obs stack). The honest crossover is
**$2–5M/yr** (Pragmatic Engineer); below it, SaaS + cardinality discipline usually wins.
**Verify:** Parallel-run p99/error-rate match within tolerance; every Datadog monitor has a verified
Prometheus/Grafana equivalent; no alert silently dropped.
**EVAL TASK:** Plan a Datadog→Prometheus/Grafana migration that guarantees no silent percentile/label
drift, with an explicit parallel-run + diff gate before cutover.

---

## S12 — Prometheus OOM-killed on restart (WAL replay death spiral) `[fix]`
**Source:** `ecosystem-11 §11.2` (prometheus #6934 WAL replay, **143 comments**; #455, #4254),
`ecosystem-14 §14.5` (v3.11 EOL; v3.12 `/status/self_metrics`).
**Symptom:** Self-hosted Prometheus gets OOM-killed; on restart it OOMs *again* during startup and
can't come back up — a death spiral.
**Diagnosis:** On restart Prometheus **replays its write-ahead log into memory** and can spike *above*
steady-state usage. The usual root cause of the high baseline is **high cardinality** (too many label
values). You sized memory for the steady state, not the replay peak.
**Resolution:** Size memory for the **replay peak**, not the average. Attack the root cause — reduce
cardinality (S8). Pull Prometheus's own health via `/api/v1/status/self_metrics` (v3.12+) to watch its
memory. Patch currency is also a *security* issue: **v3.11 is EOL (2026-05-14)** and v3.12 fixed a
remote-write DoS + a STACKIT secret leak — run the 3.5 LTS or 3.12 head, never 3.11.
**Verify:** Prometheus restarts cleanly within its memory limit; series count is bounded; version ≥
current LTS/feature head.
**EVAL TASK:** Given a Prometheus that OOMs on restart, diagnose the WAL-replay+cardinality cause and
produce a remediation (memory sizing + cardinality reduction + version check).

---

## S13 — Choosing the right tail percentile for an agent workload `[design]`
**Source:** `field-04 §04.4/§04.6` (tail-at-scale, p99 vs p99.9), `field-06 A5/DISPUTE 5`.
**Symptom:** An agent product makes ~50 tool calls per user action. The p99 latency panel looks fine,
yet users report most runs feel slow.
**Diagnosis:** **Your p99 is your power-user's median under fan-out.** With 50 calls, the chance a run
hits a p99-tail event is `1 − 0.99^50 ≈ 39%` — so p99 fires on ~39% of agent runs. p99 is the *common*
experience here, not the rare one. Per-service p99 dramatically understates user-perceived pain.
**Resolution:** Pick the tail percentile as a function of **call-count-per-user-action**:
single-call service → p99 is enough; heavy fan-out (an agent loop) → watch **p99.9** (`1 − 0.999^50 ≈
4.9%`). Reason about **end-to-end** tail, not per-service tail. Also surface the **p99/p50 gap** as a
first-class signal — a widening gap is an early warning of queueing/contention before the average moves.
**Verify:** The chosen percentile + end-to-end measurement reflects the real user experience for the
given fan-out.
**EVAL TASK:** For an agent that makes 50 tool calls per request, justify which tail percentile to
alert on and why per-service p99 is the wrong number.

---

## S14 — Alertmanager dropped/duplicated pages after an upgrade `[fix]`
**Source:** `ecosystem-11 §11.3` (alertmanager #1550 dupes after 0.15; #226 resolve-gap OPEN; #2404
not reaching webhook OPEN; #3920 Teams), `ecosystem-05 §5.4`.
**Symptom:** After bumping Alertmanager, on-call gets **duplicate** pages (or, separately, the
resolve notification never arrives so a page never clears).
**Diagnosis:** Version-upgrade alerting regression (#1550 was exactly "duplicate notifications after
0.15"). The resolve-gap (#226, still OPEN) is the `send_resolved` footgun. Both are config/version
issues, not detection issues.
**Resolution:** **Always `amtool check-config` before reloading** (a malformed config can leave AM
silently running the OLD config). Tune `group_wait`/`group_interval`/`repeat_interval` to stop dupes.
Verify each receiver has `send_resolved: true` where you want resolve notifications. Audit
`inhibit_rule`s — an over-broad one can silently swallow a real unrelated alert.
**Verify:** Post-reload, a synthetic alert fires once (no dupes) and its resolve notification arrives.
**EVAL TASK:** Given an Alertmanager that double-pages after an upgrade, fix the grouping/config and
prove single-delivery + working resolve notifications.

---

## S15 — "We logged everything and learned nothing" `[design]`
**Source:** `field-03 §03.1/§03.2/§03.3` (log business ops not technical ops; keep errors, sample
info), `ecosystem-04 §4.5` (logs vs traces).
**Symptom:** Terabytes of logs, a huge bill, and during the last incident nobody could find the
signal — log streams "might as well be white noise."
**Diagnosis:** Cargo-cult instrumentation — every HTTP call and function entry logged "for debugging."
Volume destroyed signal (the same failure as alert fatigue and dashboards-nobody-checks).
**Resolution:**
1. **Log business operations, not technical operations** — emit a few high-information events (order
   placed, payment failed, agent run completed) with rich context, not a thousand thin lines.
2. **Sample the boring, keep all the scary** — errors/warnings 100%, info/debug sampled hard.
3. **Don't double-emit** — request method/path/status/duration belong on **traces**, not logs (if
   tracing is in place the span already has them).
4. Enforce **pino redaction** so the high-value events don't leak secrets.
**Verify:** Log volume drops sharply, the signal (business events + all errors) is intact, and the
last-incident questions are now answerable.
**EVAL TASK:** Given a service that logs every function entry/exit, refactor to business-event logging
+ error-keep/info-sample, and show the questions you can still answer.

---

## S16 (bonus) — Occurrence-aware error sampling: keep the novel, sample the repeated `[design]`
**Source:** `field-05 §05.1` (getsentry/sentry #84943, OPEN — "100% for first 100 occurrences, 5%
after").
**Symptom:** A flat error sample rate either floods you with the 10,000th repeat of a known error or
(if cranked down) drops the **first** occurrence of a brand-new error (maybe pre-release).
**Diagnosis:** The regret isn't "we sampled," it's "we sampled **uniformly**." An error's information
value is wildly non-uniform — the first occurrence is worth ~100×, the 10,000th ~nothing.
**Resolution:** Occurrence-count-aware sampling: keep ~100% of the first N occurrences of each issue,
sample hard after. Sentry doesn't ship this by default — hand-roll via the SDK `error_sampler`
callback (Python). This is the "ship the non-footgun default" thesis in action.
**Verify:** Novel errors are always captured; high-frequency known errors are sampled; volume/cost is
controlled without losing the first sighting.
**EVAL TASK:** Implement occurrence-aware error sampling (keep first N, sample after) and demonstrate a
novel error is never dropped while a noisy repeat is.

---

## S17 — "Works locally, silent in prod": events vanish in production `[detect]`
**Source:** `ecosystem-01 §1.4` (DSN/environment/sample-rate + tunnel/ad-blocker init footguns),
`ecosystem-14 §14.4` (v9+ config).
**Symptom:** Errors show up perfectly in local dev and staging, but the **production** issue stream is
mysteriously quiet — far fewer events than the traffic implies. No SDK error, no obvious failure.
**Diagnosis:** The absence-of-data looks identical whether healthy or misconfigured. Three usual causes,
in order of likelihood for a *browser* app: (1) **ad-blockers silently eat browser events** because no
`tunnel` is configured (the more privacy-conscious your users, the blinder you are — the highest-impact
silent footgun); (2) the dashboard's **`environment` filter** doesn't match the string `Sentry.init`
set (app sends `prod`, you filter `production`); (3) events ARE arriving but the **DSN** points at the
wrong project. None of these throw — you only see *less data than expected.*
**Resolution:**
1. Set `tunnel: '/monitoring'` (same-origin path) so browser events POST through your domain, not directly
   to `*.ingest.sentry.io` (which adblock lists block).
2. Confirm the `environment` string in init matches the dashboard filter exactly; check "All Environments".
3. Verify the DSN targets the intended project.
**Verify:** Browser-error volume rises to match traffic after the `tunnel` fix; a test error from a
browser with uBlock enabled now lands in the prod project.
**EVAL TASK:** Given a browser app where prod errors are near-zero despite real traffic but local dev
works, diagnose the silent-drop cause (rank the three hypotheses) and fix it so events survive an
ad-blocked client.

---

## S18 — The cron that silently stopped (the absence-of-signal blind spot) `[design]`
**Source:** `ecosystem-01 §1.1` (Sentry Cron monitoring), `ecosystem-09 §9.2` (`find-monitors` /
`get-monitor-details`).
**Symptom:** The nightly billing job (or data sync, or an agent's HEARTBEAT loop) **didn't run for three
nights** and nobody noticed — until a downstream report came up empty. No error was ever logged, no alert
fired, every dashboard was "green."
**Diagnosis:** Error/uptime monitoring catches things that *throw* or *return 5xx* — but a scheduled job
that **silently stops running** (scheduler died, container not redeployed, queue consumer hung) emits **no
error, no log, no metric.** It is invisible to every signal-presence monitor because the failure IS the
*absence* of an expected event. This is the one blind spot pure error monitoring structurally cannot see.
**Resolution:** Wire a **cron check-in / dead-man's-switch monitor** (Sentry Cron monitoring via
`sentry-cli monitors`, queryable through the MCP `find-monitors` / `get-monitor-details`): the job emits a
check-in on each successful run, and the monitor **pages when an expected check-in is MISSED** — firing on
*absence*, not on error. This is also a canary dogfood target: its own HEARTBEAT loop should self-monitor
via a check-in so a silently-dead canary is itself an incident.
**Verify:** Disable the job's scheduler; the check-in monitor pages within one expected-interval +
grace-period, even though no error was ever thrown.
**EVAL TASK:** Given a scheduled job with only error capture, add a check-in/dead-man's-switch monitor that
pages on a missed run, and prove it fires when the scheduler is killed (no error path involved).

---

## How these map to Wave S evals
- **`[detect]`** scenarios → "given this state, diagnose it" (graded on correct root cause).
- **`[fix]`** → "given the broken config/repo, remediate + verify" (graded on the verify step passing).
- **`[design]`** → "build the right thing" (graded on the non-footgun design + justification).
- **`[migrate]`** → "move A→B with a no-silent-drift gate" (graded on the parallel-run/diff gate).
Each scenario's **EVAL TASK** line is the seed; the **Verify** line is the pass condition.

## Sources
`brain/research/raw/ecosystem-01/05/07/08/09/10/11/14.md` + `field-01..05/07`. Every issue number +
comment count + war-story stat verified in those files (gh/WebFetch, 2026-06-16). (S17 silent-prod →
`ecosystem-01 §1.4`; S18 cron check-in → `ecosystem-01 §1.1`/`ecosystem-09 §9.2`.)
