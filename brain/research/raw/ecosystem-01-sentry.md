---
title: "canary ecosystem research — Sentry (errors + tracing + Seer)"
type: research
created: 2026-06-16
tags: [canary, observability, sentry, seer, errors, tracing, release-health, source-maps]
researcher: ecosystem (CP123 Wave-R)
---

# 01 — Sentry: errors, tracing, Seer AI triage

Sentry is canary's **default** error/crash/uptime tool. The Energy checklist names it
explicitly: line 317 — *"Default: **Sentry** (a Sentry MCP exists). Alts: **Better Stack**
(uptime + logs), **Highlight.io** (full-stack session replay), **Grafana Cloud** (metrics).
GAP."* (`~/energy/audit/HARNESS-CHECKLIST-2026.md`, read 2026-06-16). canary's job is
to own this GAP for the fleet.

## 1.1 What Sentry is in mid-2026 (scope)

Sentry is no longer "just error tracking." Its product surface (all of which Seer can read
across): **Error Monitoring, Tracing (distributed traces + spans), Logs, Session Replay,
Profiling, Uptime monitoring, Cron monitoring, Release Health.** Source: sentry.io/product/seer/
("Works across all Sentry products: Error Monitoring, Tracing, Logs, Session Replay,
Profiling.") — fetched 2026-06-16.

## 1.2 THE HEADLINE — Seer is GA and the pricing model changed (Jan 2026)

**Seer = Sentry's AI debugging agent. Status: GENERALLY AVAILABLE (GA).** Source:
sentry.io/product/seer/ (fetched 2026-06-16) — "Seer is GA (generally available)… Available to
all Sentry users on paid plans (Team, Business, Enterprise) or trials."

Seer's distinct capabilities, each named verbatim from sentry.io/product/seer/ (2026-06-16):

1. **Issue Scan** — "Intelligently determines whether issues are fixable via code changes."
   I.e. automatic triage/classification of which incoming issues are even worth an AI fix.
   *Billing note: Issue Scans are billed per run* (thenewstack.io/sentrys-seer-agent-debug/,
   Jan 2026).
2. **Autofix / Issue Fix** — "Seer Autofix reads the stack trace, traces the root cause through
   your codebase, and drafts a fix." Generates a **pull request** with the fix.
3. **Seer Agent** — natural-language debugging. "Describe what you're seeing in plain language.
   Seer pulls the relevant signals and answers the questions." This is the NL query layer over
   the *full observability stack*. (sentry.io/product/seer/; corroborated
   thenewstack.io/sentrys-seer-agent-debug/, "investigate production problems by querying across
   a company's full observability stack.")
4. **AI Code Review** — "Seer reviews your PRs against real production data — the errors,
   traces, and failure patterns Sentry has already seen from your app." (NEW Jan 2026 — see
   §1.3.)
5. **Root-cause analysis** — traces a stack trace → root cause through the codebase.

Seer integrates outward to: **Slack** (fix bugs from alerts, incident investigation),
**Claude / GitHub Copilot / Cursor** (send the drafted fix into your editor).
Source: sentry.io/product/seer/ (2026-06-16).

### Seer pricing (the migration story — a real version gotcha)

- **NEW model (Jan 2026): $40 per active contributor / month, unlimited usage.** An "active
  contributor" = anyone who **commits two or more PRs in a connected repo** that month.
  Sources: sentry.io/product/seer/ (2026-06-16, verbatim: "$40 per active contributor, per
  month. An active contributor is anyone who commits two or more PRs in a connected repo.");
  WebSearch snippet of sentry.zendesk.com Seer pricing article dated Jan 21 2026.
- **LEGACY model (pre-Jan-2026): $20/month per Sentry subscription + $25 of Seer event credits.**
  If you subscribed to Seer before Jan 2026 you are *grandfathered onto legacy pricing* unless
  you migrate. Source: WebSearch result citing sentry.zendesk.com "What is the pricing for Seer
  (January 21, 2026)".
- **MIGRATION GOTCHA:** the unit changed from *event-credit metered* → *per-active-contributor
  flat*. A team with few PRs but high error volume gets *cheaper*; a large eng org with many PR
  authors gets *more expensive*. This is the kind of version-specific cost cliff an agent
  operating Sentry must surface, not assume.

## 1.3 Last-6-months changelog deltas (Jan–Jun 2026)

- **Jan 27 2026 — Seer expanded to Local Development + Code Review.** Sentry press release
  "Sentry Expands Seer AI Debugging Agent to Local Development and Code Review"
  (sentry.io/about/press-releases/sentry-expands-seer-ai-debugging-agent) +
  finance.yahoo.com/news/sentry-adds-local-development-code-140000796.html (Jan 27 2026). Seer
  now debugs *before* prod (local dev) and reviews PRs against prod failure patterns.
- **Jan 2026 — Seer Agent (NL debugging) launched in open beta** for all customers with Seer
  enabled; the broader Seer offering went GA. (thenewstack.io/sentrys-seer-agent-debug/, Jan
  2026.)
- **Jan 2026 — flat pricing model introduced** ($40/active contributor, unlimited usage),
  replacing event-credit metering. (Same sources as §1.2.)

[GAP: I could not enumerate a granular month-by-month Sentry SDK changelog (e.g.
`@sentry/node`, `@sentry/nextjs` minor versions) from primary sources in this pass — the
sentry.io/changelog feed and the getsentry/sentry-javascript releases should be crawled in a
follow-up. The Seer product deltas above ARE primary-sourced.]

## 1.4 Load-bearing flows (what actually breaks / what an operator must know)

- **Source maps are THE #1 footgun.** Without correctly uploaded source maps, every JS stack
  trace is minified garbage (`a.b.c is not a function` at `chunk-XYZ.js:1:24601`). The modern
  fix is the `@sentry/cli sourcemaps inject` + `sourcemaps upload` pair, or the bundler plugins
  (`@sentry/webpack-plugin`, `@sentry/vite-plugin`, `@sentry/esbuild-plugin`) which run
  inject+upload automatically at build and tie maps to a **release** via `debug_id`. The legacy
  `release`+`~/dist`-path matching is deprecated in favor of debug-id matching. (See
  ecosystem-08 source-maps file for the breakage detail + the closed GitHub issues.)
- **Release Health** = crash-free-sessions % and crash-free-users % per release, plus adoption.
  This is canary's "did the deploy regress?" metric. It requires (a) setting `release` on init,
  (b) calling the session-tracking API (auto in browser/mobile SDKs), and (c) associating
  commits via `sentry-cli releases set-commits` so Seer/suspect-commits can blame the right PR.
- **DSN + environment + sample rates** are the three init knobs that most commonly cause
  "nothing shows up" (wrong env filter) or "my bill exploded" (`tracesSampleRate: 1.0` in prod).
- **Tunneling/ad-blockers**: browser SDK events get eaten by ad-blockers unless you set the
  `tunnel` option to route through your own domain. Classic "works locally, silent in prod."

## 1.5 Sentry for AN AGENT (not a human) — the operability layer

This is the most important section for canary, because canary is an *agent* operating Sentry.

- **Sentry MCP server EXISTS and is first-party.** `@sentry/mcp-server` / the hosted
  `https://mcp.sentry.dev` remote MCP. It lets an LLM agent query issues, list projects, pull a
  specific issue's details + stack trace, and (this is the key one) **invoke Seer / Autofix and
  read the root-cause analysis** programmatically. The checklist line 317 explicitly notes "a
  Sentry MCP exists" as the reason Sentry is the default. (Primary repo: getsentry/sentry-mcp;
  verify exact tool list in ecosystem-09 agent-operability file.)
- **CLI:** `sentry-cli` — releases, source-map upload, deploy markers, `send-event`,
  `send-metric`, `info`. This is the deterministic, scriptable surface an agent should prefer
  over the web UI.
- **API:** full REST API at `sentry.io/api/0/` — list issues, update issue (resolve/ignore/
  assign), list events, project stats. Auth via org/internal-integration auth tokens.
- **What an agent NEEDS to know:** (1) the auth-token scope model (org vs project tokens; Seer
  needs repo connection via the GitHub integration to write PRs); (2) Issue Scan is *per-run
  billed* so an agent should not blindly re-scan; (3) the issue *fingerprint/grouping* model —
  an agent triaging should reason about issue groups, not raw events; (4) Seer needs the GitHub
  (or GitLab) integration connected to a repo to draft a fix PR — without it, Seer can only
  analyze, not fix.

## Sources
- sentry.io/product/seer/ (fetched 2026-06-16) — Seer features, GA status, $40/contributor,
  cross-product list, editor integrations.
- thenewstack.io/sentrys-seer-agent-debug/ (Jan 2026) — Seer Agent NL debugging, full-stack
  query, Issue Scan per-run billing, open beta.
- sentry.io/about/press-releases/sentry-expands-seer-ai-debugging-agent +
  finance.yahoo.com/news/sentry-adds-local-development-code-140000796.html (Jan 27 2026) —
  local-dev + code-review expansion.
- sentry.zendesk.com "What is the pricing for Seer (January 21, 2026)" (via WebSearch snippet,
  page itself auth-walled) — legacy $20+$25-credits vs new $40/contributor.
- docs.sentry.io/pricing/ (linked, not fully crawled) — plan tiers.
- Internal: `~/energy/audit/HARNESS-CHECKLIST-2026.md` lines 317, 394 (read
  2026-06-16) — Sentry as default, Sentry MCP exists, current GAP.
