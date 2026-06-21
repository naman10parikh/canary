---
name: fix-source-maps
description: Make minified prod stack traces symbolicate — wire Debug-ID source-map upload into CI in the right order. Use when the user says "minified stack trace", "a.b.c is not a function", "source maps", "Debug IDs", "Seer reads garbage", "Sentry shows chunk-7f3a.js", or "errors are unreadable in prod". Source maps are load-bearing infrastructure and upstream of ALL AI-debugging.
allowed-tools: Bash(sentry-cli:*), Bash(canary:*), Read, Grep, Edit
---

# fix-source-maps

> **The #1 footgun, and upstream of the entire AI-debugging value chain** — Seer reads the stack trace;
> a minified trace → garbage AI root-cause. Wire upload into CI (inject→upload→deploy), never as a
> post-incident scramble. (BATTLE-TESTED **S1/S2**, OPINIONS **B1**, KNOWN-PITFALLS **§1**.)

## Trigger

Invoke when prod errors show minified frames (`a.b.c is not a function` at `chunk-7f3a.js:1:24601`),
when Seer's root-cause is useless, or when "Sentry not part of build pipeline" appears (Settings >
Projects > [project] > Source Maps shows no artifacts). Also G2 in the eval set.

## Steps

1. **Confirm the SDK is new enough (§1.2 hard cutoff).** `@sentry/*` **< 7.47.0** lacks the `debug_meta`
   property → maps can't match. Upgrade to ≥ 7.47.0 if below.
2. **Detect the absence (§1.1).** Grep the deployed bundle for the runtime markers `e._sentryDebugIds` /
   `//# debugId=`. Absent → no Debug IDs were injected.
3. **Wire injection.** Add a bundler plugin (`@sentry/{webpack,vite,esbuild,rollup}-plugin`) OR run
   `sentry-cli sourcemaps inject ./dist && sentry-cli sourcemaps upload ./dist`.
4. **Order is load-bearing (§1.1/§1.5):** **inject BEFORE upload BEFORE deploy**, and make it a CI build
   step. Symbolication applies **only to errors that occur AFTER upload** — past errors stay minified.
5. **Tie maps to a release + commits (S1, §3.2).** `sentry-cli releases set-commits <rel> --auto` so
   suspect-commits / Seer can blame the right PR; set `release` on `Sentry.init` (format
   `my-project@1.0.0`).
6. **Avoid the version-specific traps:**
   - **§1.6 / S2 — the build OOMs.** `next build` OOMs/balloons right after adding `@sentry/nextjs`:
     scope upload to needed assets, raise build memory, or move inject/upload to a `sentry-cli` step
     OUTSIDE the webpack pass; pin a current plugin version.
   - **§1.3 — rootless Docker.** `sentry-cli` ≥ 2.21.3 breaks in rootless-Docker CI (#1929) — pin a
     working version or change the CI runtime.
   - **§1.4 — PostHog corruption.** `posthog-js` 1.207.4–1.229.0 corrupts symbolication (it modifies
     errors before Sentry receives them) — upgrade to ≥ 1.229.1. (A fleet running both is the at-risk config.)
   - **§1.5 — gzipped/SSR artifacts.** Gzipped artifacts need `sentry-cli` ≥ 2.4.0 `--decompress`;
     missing `sourcesContent` → configure the bundler to emit it; server/SSR bundles need separate
     handling from client bundles.
7. **(Optional) Quick scaffold:** `npx @sentry/wizard@latest -i sourcemaps`. Then run
   `canary audit <dir>` to confirm no Debug-ID footgun remains (§1.1 finding gone).

## Output

- Source-map upload wired as a CI step in the correct inject→upload→deploy order, tied to a release +
  commits.
- `sentry-cli sourcemaps upload --validate` passes; a **new** error symbolicates (e.g. `submitOrder is
  not a function at OrderForm.tsx:42`) — with the explicit caveat that **past** errors stay minified.
- `canary audit` reports **zero** §1.1 (missing Debug IDs) findings.

**Refuses:** post-incident map uploads as a "fix"; an upload step that runs after deploy; an SDK below
7.47.0 left in place.
