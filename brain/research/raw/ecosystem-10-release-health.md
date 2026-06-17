---
title: "canary ecosystem research — release health (crash-free sessions/users, adoption)"
type: research
created: 2026-06-16
tags: [canary, observability, release-health, crash-free-sessions, crash-free-users, sessions, adoption, deploy-regression]
researcher: ecosystem (CP123 Wave-R)
---

# 10 — Release health: "did the deploy regress?"

This is canary's **deploy-regression** pillar — the metric that answers "is the new version
healthier or sicker than the last one?" Its units (from ecosystem-00's boundary table):
**crash-free-sessions %, crash-free-users %, adoption %**. This is distinct from raw error count
(an error spike could be one noisy user; a crash-free-rate *drop* means the *release* is bad). It
is the signal that should gate a rollback. The Sentry "Release Health" feature is the canonical
implementation. (sentry.io blog/release-health; docs.sentry.io/product/insights/mobile/
session-health/, surfaced 2026-06-16.)

## 10.1 The session model (the precise primitive)

Release health is built on **sessions**, not errors. A session tracks one "run" of the app and
ends in a state. Verbatim session states (develop.sentry.dev/sdk/telemetry/sessions/, fetched
2026-06-16):

- **`ok`** — "session is in progress and healthy"
- **`exited`** — "session terminated normally (duration is tracked)"
- **`crashed`** — "session terminated in a crash (process terminated)"
- **`abnormal`** — "session fate is unknown" (e.g. force-quit, OS-killed, lost connection)
- **`unhandled`** (since SDK spec v1.6.0) — "an unhandled error occurred but the process did not
  terminate"
- **errored** (derived) — "a session that is `ok` with `errors > 0` is considered errored.
  All `crashed` and `abnormal` sessions are also considered errored." (verbatim)

So the hierarchy is: every crashed/abnormal session is *also* errored, but an errored session is
not necessarily crashed (the app hit an error but kept running). This distinction is why
**crash-free** rate ≠ **error-free** rate.

### Crash-free rates (the two KPIs)
- **Crash-free sessions rate** = `(sessions − crashed_sessions) / total_sessions`. The fraction
  of app-runs that didn't crash.
- **Crash-free users rate** = `(users − users_with_a_crashed_session) / total_users`. The
  fraction of *people* who never experienced a crash. (Per Sentry help-center summary via
  WebSearch 2026-06-16: setting up releases makes Sentry "start tracking release health through
  sessions, and therefore start tracking crashes through a crash free session rate and a crash
  free user rate.")

The **users** rate is usually the more honest user-impact metric (one user crashing 50 times
inflates the session-rate damage but is one unhappy user); the **sessions** rate is more
sensitive to crash *frequency*. canary should report both and know which to trust per question.

## 10.2 Two session modes — a critical boundary distinction

(develop.sentry.dev, fetched 2026-06-16):

- **User-mode / application-mode** — "a single session spans the full application run. Typical
  for **mobile apps, desktop apps, CLI tools, and browser sessions.**" One session = one app run.
- **Server-mode / request-mode** — "**each HTTP request or RPC call is a separate session.** High
  volume, short-lived."

**Why this matters for canary:** release health / crash-free rate is most meaningful for
**client/mobile** apps (application-mode), where "crashed" = the app actually died on a user's
device. For **backend** services (request-mode), each request is a session, so "crash-free
sessions" is closer to a success-rate and overlaps heavily with the SLO/error-budget view
(ecosystem-07). The industry framing reflects this: nearly all "Release Health" marketing
(opsmatters, sentry.io/resources/track-crash-free-users…, theusefulapps.com) is **mobile-first**
("Keeping Crash-Free Sessions Above 99%"). For the Energy fleet (largely web + agent backends),
release health's biggest payoff is on the **web frontend** (browser sessions = application-mode)
and any mobile apps; for agent backends, the SLO burn-rate view is the better deploy-regression
signal.

## 10.3 What you must configure (the load-bearing setup)

Release health does NOT work out of the box without two things wired:

1. **A `release` set on `Sentry.init()`** — format `my-project-name@1.0.0`
   (develop.sentry.dev, verbatim "Release version (suggested format: `my-project-name@1.0.0`)").
   Without a release, there's nothing to compute *per-release* health against.
2. **Session tracking enabled.** "Sessions are enabled automatically for the global hub
   initialized by `Sentry.init()` but disabled by default for manually created clients."
   (develop.sentry.dev.) The SDK option is **`autoSessionTracking`** (boolean, "default varies by
   SDK"). Browser/mobile SDKs auto-track; if you create a manual client or a server-side setup you
   often must enable it explicitly. **This is the #1 "why is my Release Health empty" cause** —
   release set but sessions never sent.
3. **(Strongly recommended) commit association** — `sentry-cli releases set-commits <release>
   --auto` — so a crash-free-rate drop can be blamed on the right commit / PR (suspect commits +
   Seer). Without it, you see *that* the release regressed but not *which change* did it
   (links to ecosystem-08 §8.4 + ecosystem-01 Seer).

## 10.4 What canary uses release health FOR (the decision)

- **The rollback gate.** A new release whose crash-free-users rate drops below the prior
  release's (e.g. 99.6% → 98.1%) is a regression → roll back / halt rollout. This is the cleanest
  "did the deploy break things?" signal and it should gate the fleet's snap-back/deploy model.
- **Adoption tracking.** "Release Adoption" = the % of sessions on each release. canary must read
  adoption alongside crash-free rate: a low-adoption release with a scary crash rate may just be
  a few canary users on a beta; a high-adoption release regressing is an emergency. (Sentry
  Session Health charts: Crash Free Sessions, Total Sessions by Release, Release Adoption,
  Session Health, Session Counts, User Health, User Counts — docs/product/insights/mobile/
  session-health/, 2026-06-16.)
- **The release-health → SLO bridge.** For backend (request-mode), crash-free sessions ≈
  success rate ≈ the availability SLI (ecosystem-07). canary should *not* double-count: use
  release health for the client deploy-regression view, SLO burn-rate for the backend
  availability view. (This mirrors the ecosystem-04 "don't double-emit logs vs traces" taste.)

## 10.5 What an AGENT operating release health needs

- **Deterministic checks an agent can run:** is `release` set in the SDK init? is
  `autoSessionTracking` on (or sessions otherwise sent)? are commits associated? These are
  greppable in code + verifiable via the Sentry API (the "sessions" / "release health" endpoints
  return crash-free rates + adoption per release).
- **Query path:** via the **Sentry MCP** (ecosystem-09) / Sentry REST API — pull crash-free
  rates + adoption per release, compare current vs previous. An agent can answer "is the release
  we shipped 2 hours ago healthier than the last one?" programmatically and recommend a rollback.
- **Release health is the agent's clearest deploy-go/no-go signal** — more interpretable than a
  raw error stream. Pair it with the SLO burn-rate (ecosystem-07) and you have a complete
  "should this deploy stay or roll back?" decision, which is exactly what canary owes the fleet's
  deploy pipeline.
- **Gotcha:** crash-free rates need *volume* to be meaningful — a release with 12 sessions has a
  noisy rate. An agent must weight by adoption / session count before acting (don't roll back a
  beta on 3 sessions).

## Sources
- develop.sentry.dev/sdk/telemetry/sessions/ (fetched 2026-06-16) — session states
  (ok/exited/crashed/abnormal/unhandled), errored-session definition, user-mode vs server-mode,
  release attr format, autoSessionTracking + global-hub-auto / manual-client-off.
- docs.sentry.io/product/insights/mobile/session-health/ (surfaced 2026-06-16) — Session Health
  charts list (Crash Free Sessions, Adoption, etc.), mobile-first framing.
- sentry.io blog/release-health + blog/crash-free-sessions-carefree-users-with-release-health +
  sentry.io/resources/track-crash-free-users-sessions-and-adoption-mobile-release-health
  (surfaced 2026-06-16) — crash-free + adoption narrative.
- sentry.zendesk.com/hc/.../How-can-I-track-crash-free-rate (referenced; page auth-walled, summary
  via WebSearch 2026-06-16) — releases+sessions enable crash-free session + user rates.
- theusefulapps.com/news/crash-free-mobile-apps-crashlytics-sentry (2026) — "above 99%" playbook,
  Crashlytics-vs-Sentry mobile framing.
- Cross-ref: ecosystem-00 (boundary: crash-free is canary's), ecosystem-01 (Seer reads the trace),
  ecosystem-07 (release-health↔SLO bridge for backend), ecosystem-08 (commit association),
  ecosystem-09 (Sentry MCP/API query path).
