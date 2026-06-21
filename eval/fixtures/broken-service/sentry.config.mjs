// SEEDED FOOTGUNS (do NOT fix — this fixture exists to be flagged by `canary audit`).
// A browser Sentry app initialized with three planted pitfalls:
//   §1b.3 tracesSampleRate: 1.0  — captures every transaction → blows the Spans budget
//   §1b.2 no `tunnel`            — ad-blockers silently eat browser events ("silent in prod")
//   §1.1  no bundler plugin      — production stack traces stay minified (Seer reads garbage)
//   §3.1  autoSessionTracking    — REMOVED in SDK v9 (package.json pins @sentry/react ^9) → dead config
import * as Sentry from "@sentry/react";

Sentry.init({
  dsn: "https://examplePublicKey@o0.ingest.sentry.io/0",
  environment: "production",
  // §1b.3 — 1.0 in a prod config is the Spans-quota bomb.
  tracesSampleRate: 1.0,
  // §3.1 — autoSessionTracking was removed in v9 (this app is on @sentry/react ^9).
  autoSessionTracking: true,
  // NOTE: this init is missing the ad-blocker bypass path (§1b.2 — a browser app without it
  // has events silently eaten by uBlock) and has no @sentry/*-plugin source-map upload (§1.1).
});
