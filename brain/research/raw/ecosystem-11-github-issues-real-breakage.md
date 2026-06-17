---
title: "canary ecosystem research — real-world breakage (closed GitHub issues, high engagement)"
type: research
created: 2026-06-16
tags: [canary, observability, github-issues, breakage, postmortems, version-gotchas, memory-leak, anti-slop]
researcher: ecosystem (CP123 Wave-R)
---

# 11 — What actually breaks: high-engagement GitHub issues

This file is the anti-slop core of the research. The mission: "the top GitHub issues that reveal
real-world breakage (search closed issues with high engagement)." Every entry below is a real
issue with its real comment count, found via `gh search issues <q> --repo <repo> --sort comments`
(2026-06-16). High comment count = many people hit it = it's a real footgun an agent must know,
not a marketing-page feature. Each entry: **symptom → root cause → the lesson for canary.**

## 11.1 Sentry / sentry-javascript / sentry-cli

| # | Title | Comments | State |
| --- | --- | --- | --- |
| sentry-javascript **#13412** | "Sentry upgrade from 7.118.0 to 8.26.0 leak memory" | **52** | closed 2025-03-18 |
| sentry-javascript **#5186** | "Sourcemaps not showing correct file names in stack trace" | **51** | closed |
| sentry-javascript **#15100** | "Slow build-times and Webpack serialization perf warnings using `@sentry/nextjs`" | **49** | closed 2025-11-18 |
| sentry-javascript **#10468** | "OOM event during next build (Vercel)" | **55** | closed |
| sentry-javascript **#12077** | "Critical Dependency Warning After Upgrading to `@sentry/nextjs` v8" | **40** | closed 2024-10 |
| sentry-javascript **#2957** | "Sentry in Vue app causes freeze / 100% CPU (infinite recursion)" | **40** | closed |
| sentry-javascript **#12317** | "Memory leak in recent releases of Sentry (>= 8.6.0)" | **24** | closed |
| sentry-cli **#1929** | "sentry-cli >= 2.21.3 does not work with rootless docker" | **39** | closed |
| sentry-cli **#1728** | "Sourcemaps not working for server bundles" | **32** | closed |
| sentry-cli **#1710** | "inject debug id code making the process take a very long time" | **25** | closed |

**The pattern — version upgrades are where Sentry hurts.** The two biggest leaks (#13412 v7→v8,
#12317 ≥8.6.0) and the Next.js v8 dependency warning (#12077) are all **major/minor SDK upgrade
regressions**. Lesson for canary: when an agent bumps a Sentry SDK, that is a *risk event* — it
should check release-health crash-free rate AND memory after the bump, not assume the upgrade is
safe. The OOM (#10468) and slow-build (#15100) issues are **build-environment footguns** from the
source-map plugin (ecosystem-08) — an agent must know the Sentry webpack plugin can blow up a
Vercel build. The Vue infinite-recursion freeze (#2957) is the scariest: *the monitoring tool
itself crashed the app* — a reminder that instrumentation is not free and an agent should treat a
new integration as a thing to verify, not trust.

## 11.2 Prometheus

| # | Title | Comments | State |
| --- | --- | --- | --- |
| prometheus **#6934** | "Memory usage spikes during WAL replay to more than normal usage" | **143** | closed |
| prometheus **#455** | "Implement strategies to limit memory usage" | **90** | closed |
| prometheus **#1315** | "Add option to log slow queries and recording rules" | **86** | closed |
| prometheus **#4254** | "2.3.0 significant memory usage increase" | **77** | closed |
| prometheus **#3685** | "Prometheus version 2.0 memory leak?" | **53** | closed |

**The pattern — Prometheus is a memory hog, and WAL replay is the #1 operational pain
(143 comments).** On restart, Prometheus replays its write-ahead-log into memory and can spike
*above* steady-state usage — the classic "Prometheus OOM-killed on restart, now it can't come
back up" death spiral. Lesson for canary: an agent operating self-hosted Prometheus must size
memory for the *replay* peak, not the steady state, and know that high cardinality (too many label
values) is the usual root cause of the spike (#455, #4254). The "log slow queries/recording rules"
ask (#1315) is relevant to the SLO recording rules in ecosystem-07 — a heavy `rate(...[3d])` over
high cardinality can itself become the problem.

## 11.3 Alertmanager — the on-call breakage layer

| # | Title | Comments | State |
| --- | --- | --- | --- |
| alertmanager **#876** | "Time of day based alert routing/notification" | **98** | closed |
| alertmanager **#226** | "Send resolved notification for silenced alerts" | **71** | **OPEN** (long-standing) |
| alertmanager **#1550** | "Duplicate notifications after upgrading to Alertmanager 0.15" | **63** | closed |
| alertmanager **#3920** | "Microsoft deprecating Teams webhooks, new 'Workflows' uses incompatible schema" | **55** | closed |
| alertmanager **#2404** | "AlertManager not sending all alerts to Webhook endpoint" | **44** | **OPEN** |

**These directly validate the ecosystem-05 §5.4 / ecosystem-06 §6.3 footguns with real evidence:**
- **#226 (still OPEN, 71 comments)** — the `send_resolved` / silenced-alert resolution gap is a
  *years-long unsolved* pain. Confirms canary's rule: always verify resolve notifications fire, or
  on-call stays anxious on a dead incident.
- **#1550** — "duplicate notifications after upgrading to 0.15" is a concrete **version-upgrade
  alerting regression** — exactly why an agent must `amtool check-config` and watch for dupes
  after any Alertmanager bump.
- **#3920** — Microsoft killed the old Teams webhook ("From August 15th onwards it will not be
  possible to setup new webhooks"); the replacement "Workflows" uses an *incompatible schema*. A
  real integration-rot example: a notification channel an agent configured can silently die when
  the *vendor* deprecates the webhook format. Lesson: alert *delivery* is a thing to monitor, not
  assume (a test-alert heartbeat through each channel).
- **#2404 (OPEN)** — "not sending all alerts to webhook" — the nightmare: the alert fired,
  Alertmanager saw it, but it never reached the receiver. The strongest argument for canary
  *end-to-end testing* the alert path, not just the detection rule.

## 11.4 OpenTelemetry JS

| # | Title | Comments | State |
| --- | --- | --- | --- |
| opentelemetry-js **#2997** | "Ability to remove/flush unused attributes in metric instruments" | **25** | **OPEN** |
| opentelemetry-js **#3621** | "Potential memory leak with the prometheus metrics exporter" | **18** | closed |
| opentelemetry-js **#3030** | "ZoneContextManager + FetchInstrumentation in browser leaks Promises" | **13** | **OPEN** |

**The pattern — OTel instrumentation can leak.** The Prometheus exporter leak (#3621) and the
browser ZoneContextManager Promise leak (#3030, still open) are reminders that OTel's
auto-instrumentation is powerful but not free — context managers and exporters are stateful and
can accumulate. Lesson for canary: when it recommends OTel auto-instrumentation (ecosystem-02
§2.5), it should note that browser context propagation (ZoneContextManager) is the fragile part,
and an agent should watch memory after enabling instrumentation (same lesson as the Sentry Vue
freeze — monitoring is not free).

## 11.5 pino & Grafana (lighter, for completeness)

- **pino #1261** "Dropping chars" (33c, closed) — under extreme throughput pino's async transport
  could drop characters; a reminder that even the fast logger has backpressure limits. **pino
  #2272** (open, 30c) — the transport-target-must-be-a-string limitation (worker-thread transports
  can't take a module ref) is a real DX friction for the OTel transport in ecosystem-04.
- **Grafana** issues are dominated by *feature requests* (alerting #2209 with **294 comments**,
  "building alerting system for grafana") rather than breakage — Grafana's pain is historically
  "we want X," reflecting a mature, stable product. The signal: Grafana alerting was so wanted it
  drew 294 comments, which is why unified Grafana Alerting now exists.

## 11.6 The meta-lessons for canary (what the breakage data teaches)

1. **Version upgrades of monitoring tools are themselves incidents.** Sentry v7→v8 leak,
   Alertmanager 0.15 dupes, Next.js v8 dep warning. An agent bumping an obs dependency must verify
   *the obs tool didn't break* — this is the recursive case (canary monitoring its own monitoring).
2. **Instrumentation is not free and can crash the app it watches.** Sentry Vue 100% CPU,
   OTel Promise leaks, Prometheus exporter leak. Treat enabling instrumentation as a verify-after
   action, not fire-and-forget.
3. **The alert *delivery* path is the most under-tested and most failure-prone link.** AM #226
   (resolve gap, still open), #2404 (alerts not reaching webhook, open), #3920 (Teams webhook
   killed). canary should heartbeat-test each notification channel end-to-end, not trust that a
   firing rule = a delivered page. This is canary's strongest differentiating insight.
4. **Memory is the dominant operational failure for self-hosted (Prometheus WAL replay,
   exporters, SDK leaks).** An agent operating self-hosted obs must reason about the *peak* (replay,
   cardinality), not the average.
5. **High-engagement-but-OPEN issues are the durable footguns** (AM #226, #2404; OTel #3030,
   #2997). These aren't fixed — an agent must work *around* them, today. That's the most honest,
   non-slop knowledge in this whole research bundle.

## Sources
- `gh search issues <query> --repo <repo> --sort comments` (all 2026-06-16):
  - getsentry/sentry-javascript: #13412, #5186, #15100, #10468, #12077, #2957, #12317.
  - getsentry/sentry-cli: #1929, #1728, #1710.
  - prometheus/prometheus: #6934, #455, #1315, #4254, #3685.
  - prometheus/alertmanager: #876, #226, #1550, #3920, #2404.
  - open-telemetry/opentelemetry-js: #2997, #3621, #3030.
  - pinojs/pino: #1261, #2272.  grafana/grafana: #2209.
- `gh api repos/prometheus/alertmanager/issues/3920` (2026-06-16) — Teams webhook deprecation body
  verbatim ("From August 15th onwards it will not be possible to setup new webhooks").
- `gh api repos/prometheus/prometheus/issues/6934` (2026-06-16) — WAL replay, 143 comments.
- Cross-ref: ecosystem-05 §5.4 (Alertmanager footguns), ecosystem-06 §6.3 (on-call footguns),
  ecosystem-08 (source-map build breakage), ecosystem-02 §2.5 (OTel version drift).
