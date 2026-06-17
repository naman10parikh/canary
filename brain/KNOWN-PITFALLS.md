---
title: "canary KNOWN PITFALLS — version-specific gotchas with detection + avoidance"
type: brain
status: active
created: 2026-06-16
tags: [canary, observability, pitfalls, gotchas, version-specific, breakage, detection, avoidance]
source: brain/research/raw/ecosystem-01/02/04/05/06/08/10/11/14, brain/research/raw/field-02/03/04/05/07
related: ["[[EXPERTISE-MAP]]", "[[BATTLE-TESTED-SCENARIOS]]", "[[TOOL-MATRIX]]", "[[OPINIONS]]", "[[GAPS-AND-DISPUTES]]", "[[MOC - canary]]"]
---

# canary Known Pitfalls

> The version-specific gotcha list. Each entry: **the trap → how to DETECT it (a concrete,
> scriptable check) → how to AVOID/fix it**, with the version cutoff where it applies. These are the
> deterministic checks canary runs against a codebase/config before reasoning about it. **The meta-
> pattern (`field-05 §05.5`): the default configuration ships the footgun** — canary's job is to
> detect when a user is standing on one. All version facts verified 2026-06-16.

## §0 The cross-cutting meta-pitfall (read first)
**Version upgrades of monitoring tools are themselves incidents** (`ecosystem-11 §11.6`,
`ecosystem-14 §14.4`). The single cleanest proof: the very option an agent was told to grep for
(`autoSessionTracking`) got **removed two majors ago**. So: **always version-detect the tool before
reasoning about its config.** A check that's correct for Sentry SDK v8 is wrong for v10.

---

## §1 Source maps — the #1 footgun (Sentry/JS) — `ecosystem-08`

### 1.1 Deployed JS has no Debug IDs → traces stay minified
- **Detect:** grep the deployed bundle for the runtime snippet `e._sentryDebugIds` / `//# debugId=`.
  Absent → no debug IDs. Sentry shows the "Sentry not part of build pipeline" error;
  **Settings > Projects > [project] > Source Maps** has no artifacts.
- **Avoid:** bundler plugin (`@sentry/{webpack,vite,esbuild,rollup}-plugin`) OR `sentry-cli sourcemaps
  inject` → `upload`. **Inject BEFORE upload BEFORE deploy** (order is load-bearing). Make it a CI step.

### 1.2 SDK too old for `debug_meta` (hard cutoff: **7.47.0**)
- **Detect:** `@sentry/*` version in `package.json` **< 7.47.0** → events lack the `debug_meta` property
  → maps can't match.
- **Avoid:** upgrade to ≥ 7.47.0. (Full legacy cutoffs: JS SDK 7.46.0, `@sentry/webpack-plugin` 1.x,
  `sentry-cli` 2.16.1, self-hosted 23.6.1 → at/below = legacy release+path path, upgrade to debug-IDs.)

### 1.3 `sentry-cli >= 2.21.3` breaks in rootless Docker (sentry-cli #1929, 39c)
- **Detect:** CI uses rootless Docker AND `sentry-cli` ≥ 2.21.3.
- **Avoid:** pin a working `sentry-cli` version for rootless-Docker CI, or change the CI runtime.

### 1.4 `posthog-js` 1.207.4 → 1.229.0 corrupts symbolication (fixed 1.229.1)
- **Detect:** `posthog-js` version in the **1.207.4–1.229.0** range AND Sentry present (PostHog modifies
  errors before Sentry receives them). PostHog is the analytics tool the Energy checklist names for the
  adjacent gap — a fleet product running both is exactly the at-risk config.
- **Avoid:** upgrade `posthog-js` to ≥ 1.229.1.

### 1.5 Upload happened AFTER the errors occurred
- **Detect:** maps uploaded as a post-incident scramble; past errors stay minified.
- **Avoid:** **prevention only** — upload must be in the build/deploy step. Symbolication applies only
  to errors that occur after upload. Also: gzipped artifacts need `sentry-cli` ≥ 2.4.0 `--decompress`;
  missing `sourcesContent` → configure the bundler to emit it; server/SSR bundles need separate
  handling from client bundles (sentry-cli #1728).

### 1.6 Source-map plugin OOMs / slows the build (sentry-javascript #10468 55c, #15100 49c)
- **Detect:** `next build` OOMs or balloons in time right after adding `@sentry/nextjs`.
- **Avoid:** raise build memory, scope upload to needed assets, or move inject/upload to a `sentry-cli`
  step outside the webpack pass; pin a current plugin version (old inject code was a bottleneck,
  sentry-cli #1710). See [[BATTLE-TESTED-SCENARIOS]] S2.

---

## §1b Sentry init/config — the "nothing shows up" & "works locally, silent in prod" traps — `ecosystem-01 §1.4`

The three `Sentry.init` knobs that cause the most "where are my events?" tickets. **None of these are
visible in the dashboard — the absence of data looks identical whether you're healthy or misconfigured.**

### 1b.1 Wrong `environment` filter → events arrive but are hidden
- **Detect:** events are *sent* (the SDK shows no error) but the issue stream is empty — the dashboard's
  environment filter doesn't match what `Sentry.init({ environment })` set (e.g. app sends `prod`, you're
  filtering `production`).
- **Avoid:** confirm the `environment` string in init matches the dashboard filter exactly; check the
  "All Environments" view before concluding nothing is being sent.

### 1b.2 ⚠️ Browser events eaten by ad-blockers → "works locally, silent in prod"
- **The trap:** browser SDK events are **silently dropped by ad-blockers/uBlock/privacy extensions**
  unless you route them through your own domain via the `tunnel` option. This is the classic "errors show
  up on my machine but production is mysteriously quiet" — the highest-impact silent footgun because the
  *more privacy-conscious your users, the blinder you are.*
- **Detect:** a browser/SPA app with **no `tunnel` configured** in `Sentry.init`, and a suspiciously low
  browser-error volume vs server-error volume.
- **Avoid:** set `tunnel: '/monitoring'` (or similar same-origin path) so events POST through your domain,
  not directly to `*.ingest.sentry.io` (which adblock lists block).

### 1b.3 `tracesSampleRate: 1.0` in prod → the bill explosion
- **Detect:** `tracesSampleRate: 1.0` (or `tracesSampleRate: 1`) in a production config — every transaction
  is captured, and on the 2026 **Spans** quota model this can blow the Spans budget independent of Errors.
- **Avoid:** sample tracing in prod (e.g. `0.1`), or use `tracesSampler` for per-route rates; rely on
  Sentry's **Spike Protection** + dynamic sampling as the cost guardrails. The 2026 cost lever is
  **spans-quota + dynamic sampling**, NOT a single SDK `tracesSampleRate` you forgot to lower
  (`field-07 §07.6`). NOTE: `enableTracing` was *removed* in SDK v9 — on v9+ set `tracesSampleRate: 0`
  to disable (`ecosystem-14 §14.4`).

---

## §1c Cron / scheduled-job monitoring — the silent-stop trap — `ecosystem-01 §1.1`, `ecosystem-09 §9.2`

### 1c.1 A scheduled job stops running and NOTHING fires (the absence-of-signal blind spot)
- **The trap:** error monitoring catches jobs that *throw* — but a cron/worker that **silently stops
  running** (the scheduler died, the container wasn't redeployed, the queue consumer hung) produces **no
  error, no log, no metric** — only the *absence* of an expected event. Pure error/uptime monitoring is
  blind to "the thing that should have happened didn't."
- **Detect:** a scheduled job (nightly batch, billing run, data sync, an agent's HEARTBEAT loop) with **no
  check-in / dead-man's-switch monitor** — only error capture. Ask: "if this job never ran tonight, would
  anything page?"
- **Avoid:** wire a **cron check-in monitor** (Sentry Cron monitoring — `sentry-cli monitors`, queryable
  by the MCP `find-monitors` / `get-monitor-details`) that pages when an expected check-in is **missed**,
  not when an error occurs. This is the one monitoring class that fires on *absence*, and the only thing
  that catches a silently-dead scheduler. (Directly relevant to canary's own dogfood: its HEARTBEAT loop
  should self-monitor via a check-in.)

---

## §2 Alerting on ratios without a denominator — `field-05 §05.2`, `field-04 §04.5`

### 2.1 Rate alert fires at low volume (getsentry/sentry #66988, still active 2026)
- **Detect:** any alert of the form `failure_rate > X%` (or error-rate %) with **no `count(...) > N`
  guard**. 1 error in 3 requests = 33% = 3 AM page for nothing.
- **Avoid:** **never emit a percentage-threshold alert without a volume floor.**
  `failure_rate > X% AND count(errors) > N`. (Sentry's metric-alert UI ships this footgun by default.)

### 2.2 Computing p99/percentile alerts over tiny volume
- **Detect:** a percentile alert/panel evaluated over a window with few requests (p99 over 5 requests
  = noise).
- **Avoid:** guard percentile alerts with a request-volume floor too; don't extrapolate p99 from
  p50/p90 (the tail is non-linear — measure it directly).

---

## §3 Release Health — the `autoSessionTracking` trap — `ecosystem-10`, `ecosystem-14 §14.4`

### 3.1 ⚠️ `autoSessionTracking` was REMOVED in Sentry SDK v9 (current line is v10)
- **The trap:** older guidance (and `ecosystem-10`'s first pass) says "check if `autoSessionTracking`
  is on" for Release Health. **On SDK ≥ v9 that option does not exist** — an agent grepping for it in a
  modern codebase finds nothing and **wrongly concludes sessions are off.**
- **Detect:** read the `@sentry/*` major from `package.json` FIRST.
  - SDK **≥ v9** (incl. v10): check for `browserSessionIntegration()` (browser/SPA) or `httpIntegration`
    with session tracking (server) — NOT the flag.
  - SDK **≤ v8:** the `autoSessionTracking` boolean still applies (original guidance).
- **Avoid:** version-branch the check. Either way, a `release` set on `Sentry.init` + commits associated
  remain required.

### 3.2 Release Health empty because `release` unset or sessions never sent
- **Detect:** no `release` on `Sentry.init` (format `my-project@1.0.0`); or a manually-created client
  (sessions are auto for the global hub, **disabled by default for manual clients**); or no commit
  association.
- **Avoid:** set `release`, ensure sessions are sent (per §3.1 by SDK major),
  `sentry-cli releases set-commits <rel> --auto`.

### 3.3 Acting on a crash-free rate with no volume
- **Detect:** recommending a rollback on a release with a handful of sessions (a 12-session release has
  a noisy rate).
- **Avoid:** weight by adoption / session count before acting; don't roll back a beta on 3 sessions.

---

## §4 Logging — pino — `ecosystem-04`

### 4.1 No redaction → secrets leak into logs
- **Detect:** pino logger config with **no `redact:` paths** while logging `req`/headers/bodies.
- **Avoid:** mandatory `redact: ['req.headers.authorization', 'req.headers.cookie', '*.password',
  '*.token']` with a censor. Mirrors Energy `browser-agent-security.md` Rule 12.

### 4.2 `pino-pretty` in production
- **Detect:** `pino-pretty` transport active in a prod build → slow + unparseable JSON ("why are my
  prod logs unparseable").
- **Avoid:** pretty-print **only in dev**; emit raw JSON to stdout in prod.

### 4.3 Double-emitting HTTP details to both logs and traces
- **Detect:** logs carrying method/path/status/duration while tracing is also on.
- **Avoid:** put request-level detail on **spans**; reserve logs for business events an agent greps.

### 4.4 Async transport drops chars under extreme load (pino #1261); transport-target must be a string (#2272)
- **Detect:** missing log lines under very high throughput; worker-thread transport configured with a
  module ref instead of a string path (DX friction for the OTel transport).
- **Avoid:** be aware of backpressure limits at extreme volume; pass the transport target as a string.

---

## §5 Cardinality — the metrics meltdown — `field-03 §03.4`, `field-05 §05.3`, `field-02 §02.1`

### 5.1 Unbounded label values on a metric
- **Detect:** a metric label whose value space is unbounded — `user_id`, `request_id`, `email`, full
  `url.path`, `pod_id`, even `span_id` (OTel #44478). The math: 5 × 5 × 1,000 = 25k series; add a
  1M-value label → **25B series.**
- **Avoid:** **never put unbounded cardinality on a metric** (that's exactly the context metrics force
  you to discard at write time). Strip it at the OTel Collector (`filter`/`transform`/`attributes`
  processor) before it exits the network; move the value to a trace/event.

### 5.2 Static drop-lists are insufficient by 2026 (OTel Cardinality Guardian #47368)
- **Detect:** relying solely on a hand-maintained allow/deny list — by the time you add the label to
  the list, you've already paid; static lists "drop the entire datapoint."
- **Avoid:** for runtime defense, the dynamic **Cardinality Guardian** processor (HLL++) "surgically
  strips only the offending labels." Treat unbounded labels as a **DoS/security** surface (an attacker
  injecting unique values per request can bankrupt the obs bill), not just a cost line.

---

## §6 Percentile math — `field-04`

### 6.1 ⚠️ Averaging percentiles (the most-violated rule in latency monitoring)
- **Detect:** any panel/alert computing a service-wide percentile as `avg(per-pod p99)` /
  `mean(per-host p95)`.
- **Avoid:** percentiles are positions, not arithmetically combinable. Aggregate the **histogram**
  first, then recompute: `histogram_quantile(0.99, sum(rate(..._bucket[5m])) by (le))`. Usually the
  averaged number is *optimistically* wrong (under-reports the tail).

### 6.2 Classic histogram buckets chosen wrong → silent p99 error
- **Detect:** classic histogram with hand-picked `le` boundaries (e.g. boundary at 1s when real p99 is
  1.2s) → the reported p99 is garbage.
- **Avoid:** use Prometheus **native histograms** (3.x) — auto exponential bucketing, accurate
  high-quantile without guessing buckets, lower storage.

### 6.3 Reporting/alerting on `avg` latency
- **Detect:** the headline latency number is `avg` (1,000 fast + 50 slow → avg ~200ms hides the pain).
- **Avoid:** headline is **p50 + p99** and the **p99/p50 gap** (variance = unreliability). Never alert
  on avg.

### 6.4 ⚠️ Coordinated omission — the load-tester/measurement lie (Gil Tene)
- **The trap:** most latency measurements suffer **coordinated omission** — when a request stalls, the
  measurement harness (load tester, or a synchronous client) *also* stalls and **stops issuing new
  requests during the slow period**, so the slow requests that *would* have piled up are never recorded.
  The result: your measured p99 is wildly *optimistic* — it omits exactly the backlog the stall caused.
  (Gil Tene, "How NOT to Measure Latency" — the canonical ur-talk; `field-04 §04.4`, flagged older but
  still definitive.)
- **Detect:** latency numbers gathered by a closed-loop load tester (one that waits for each response
  before sending the next) or a synchronous client without back-pressure compensation; suspiciously clean
  tail latency under load that contradicts user reports.
- **Avoid:** use measurement tools that compensate for coordinated omission (HdrHistogram-based, e.g.
  wrk2, or correction in the client); when reading a vendor's p99, ask whether the *measurement* path can
  itself stall. This is *why* §6.1 (don't average percentiles) and a real fan-out tail (`[[BATTLE-TESTED-SCENARIOS]]` S13)
  matter — the headline tail is usually understated twice over.

---

## §7 Prometheus operational — `ecosystem-11 §11.2`, `ecosystem-14 §14.5`

### 7.1 WAL-replay OOM death spiral (prometheus #6934, 143c)
- **Detect:** Prometheus OOM-killed, then OOMs again on restart (replays WAL into memory, spiking
  *above* steady state). Root cause is usually high cardinality.
- **Avoid:** size memory for the **replay peak**, not the average; reduce cardinality (§5).

### 7.2 Running an EOL/CVE Prometheus
- **Detect:** Prometheus **v3.11** (EOL 2026-05-14) or any < current head — v3.12 fixed a remote-write
  DoS + a STACKIT secret leak.
- **Avoid:** run the **3.5 LTS** or **3.12** head, never 3.11. Pull `/api/v1/status/self_metrics`
  (v3.12+) to monitor Prometheus itself.

### 7.3 Recording-rule cost
- **Detect:** heavy `rate(...[3d])` over high-cardinality computed inline in an alert (slow/expensive).
- **Avoid:** pre-compute per-window SLIs as **recording rules**; `promtool check rules` before load.

---

## §8 Alertmanager / on-call — `ecosystem-05 §5.4`, `ecosystem-11 §11.3`, `ecosystem-06 §6.3`

### 8.1 Config reload without validation
- **Detect:** reloading `alertmanager.yml` without `amtool check-config` (a malformed config leaves AM
  silently running the OLD config).
- **Avoid:** **always `amtool check-config` (and `promtool check rules`) before reload.**

### 8.2 `send_resolved` off → the page never clears (Alertmanager #226, OPEN 71c)
- **Detect:** a receiver with `send_resolved: false` (defaults differ per integration) → you get the
  page but never the "resolved" → on-call stays anxious on a dead incident.
- **Avoid:** set `send_resolved: true` where you want resolve notifications; verify resolves actually
  arrive.

### 8.3 Duplicate pages after an AM upgrade (#1550) / grouping mis-tuned
- **Detect:** dupes after a version bump; `group_wait` too low (spam at onset) or too high (delayed
  paging).
- **Avoid:** re-check `group_wait`/`group_interval`/`repeat_interval` after any AM upgrade; `amtool` it.

### 8.4 Over-broad inhibition silently swallows a real alert
- **Detect:** an `inhibit_rule` like "if cluster-down fires, suppress everything" → a real *unrelated*
  incident is hidden ("the alert never fired but the service was down").
- **Avoid:** scope inhibition narrowly; audit inhibit rules.

### 8.5 Vendor kills the webhook format (Microsoft Teams #3920) / dedup_key unset
- **Detect:** a notification channel using a deprecated webhook (Teams legacy webhooks killed → new
  "Workflows" uses an incompatible schema); or PagerDuty events sent without `dedup_key` (→ 200-alert
  storm).
- **Avoid:** **heartbeat-test each channel end-to-end** (see [[BATTLE-TESTED-SCENARIOS]] S5); always
  set PagerDuty `dedup_key`.

### 8.6 Schedule gaps / timezone (the 3am page to an empty rotation)
- **Detect:** rotation handoffs across timezones with a gap window where nobody is on call.
- **Avoid:** validate schedule coverage has no gaps across the handoff boundary.

---

## §9 OpenTelemetry — `ecosystem-02 §2.5`, `ecosystem-11 §11.4`, `ecosystem-14`

### 9.1 ⚠️ semconv version drift on `gen_ai.*` (the boundary-critical trap)
- **Detect:** GenAI instrumentation pinned to a **pre-v1.42** semconv keeps emitting OLD attribute
  names; v1.42 (2026-06-12) moved all `gen_ai.*` to a separate repo. An agent reading the telemetry
  must know which semconv version produced it.
- **Avoid:** check `OTEL_SEMCONV_STABILITY_OPT_IN`; know that the canary/agentmoney seam attributes
  (`gen_ai.client.operation.duration`/`.exception` vs `gen_ai.usage.*`) migrated repos.

### 9.2 `deployment.environment` renamed → `deployment.environment.name`
- **Detect:** code/queries using the old `deployment.environment` attribute.
- **Avoid:** use `deployment.environment.name` (a known semconv migration gotcha).

### 9.3 Instrumentation leaks memory (it is not free)
- **Detect:** memory climbs after enabling OTel auto-instrumentation — browser ZoneContextManager +
  FetchInstrumentation leaks Promises (#3030, OPEN); Prometheus exporter leak (#3621); the worst case
  is the Sentry Vue 100% CPU infinite recursion (#2957 — *the monitoring crashed the app*).
- **Avoid:** treat enabling instrumentation as a **verify-after** action — watch memory/CPU after.
  Browser context propagation is the fragile part.

---

## §10 Build-vs-buy / self-host traps — `field-05 §05.4`, `field-02`

### 10.1 "Self-host Sentry to save money" ignores the operational tax
- **Detect:** a plan to self-host Sentry without budgeting ~30 stateful containers (sentry, relay,
  snuba, celery, redis, clickhouse, zookeeper, kafka), ≥8GB RAM / ≥4 cores, and **¼–½ an engineer**.
  Sentry's own docs: "we don't necessarily recommend self-hosting to everyone."
- **Avoid:** **buy the error tracker; hand-roll only the cheap local `runs.jsonl` trail.** Self-hosting
  an error tracker is itself an availability risk (now you must monitor your monitoring).

### 10.2 "Migrated to self-hosted = zero cost"
- **Detect:** a migration justified as "cost → zero."
- **Avoid:** it's "license cost → operational cost" (WAL OOMs, retention scaling, on-call for the obs
  stack). Honest crossover ≈ **$2–5M/yr** (Pragmatic Engineer); below it, SaaS + cardinality discipline.

### 10.3 Dead/dying on-call tools — `ecosystem-06 §6.1`, `ecosystem-14 §14.1`
- **Detect:** any use of **Opsgenie** (shutdown + data deletion **Apr 5 2027**) or **self-hosted
  Grafana OnCall OSS** (archived 2026-03-24; Cloud notif bridge severed).
- **Avoid:** Opsgenie → PagerDuty / incident.io. OnCall OSS → PagerDuty / incident.io / Grafana Cloud
  IRM. (The Grafana MCP's OnCall tools still work *if on Grafana Cloud IRM* — don't conflate the dead
  OSS product with the alive managed one.)

---

## §11 Migration silent-failures — `field-02 §02.3`

### 11.1 Percentile math differs silently across platforms
- **Detect:** post-migration p99 dashboards read differently than pre-migration on the same traffic.
- **Avoid:** run both systems in parallel; **diff the histogram, not the percentile**; don't cut over
  until they match.

### 11.2 Label/tag schema mismatch at scale
- **Detect:** old `env:production` vs new `environment=production` across thousands of monitors.
- **Avoid:** normalize the label schema before import; audit every monitor's equivalent exists.

### 11.3 Dashboard widgets don't map 1:1
- **Detect:** auto-converted dashboards look wrong.
- **Avoid:** hand-rebuild dashboards as code; budget the migration at 2–4× the estimate.

---

## §12 Grafana config — `ecosystem-05 §5.2`, `field-07 §07.7`

### 12.1 Grafana 13 flipped `enable_gzip` ON by default
- **Detect:** upgrading to Grafana 13 (GrafanaCON Apr 21 2026) behind a reverse proxy that doesn't
  expect gzip → surprising behavior change.
- **Avoid:** read the breaking-changes notes; an agent in mid-2026 may meet Grafana 11.x, 12.x, OR
  13.x — **version-detect.** Also: G13 made restore-deleted-dashboards GA (dashboards-as-state are now
  recoverable — good for snap-back).

## Sources
`brain/research/raw/ecosystem-01/02/04/05/06/08/10/11/14.md` + `field-02/03/04/05/07`. Every version
cutoff, issue number, init-knob footgun, and CVE/EOL date verified via gh/WebFetch on 2026-06-16 and
cited in those files. (§1b Sentry-init traps → `ecosystem-01 §1.4`; §1c cron check-in →
`ecosystem-01 §1.1`/`ecosystem-09 §9.2`; §6.4 coordinated omission → `field-04 §04.4`.)
