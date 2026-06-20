/**
 * Sentry init/config footgun detectors (brain/KNOWN-PITFALLS.md §1, §1b, §3).
 *
 * The version-aware ones (§3.1) are the brain's signature: an agent must read the SDK
 * major FIRST — a check correct for v8 is wrong for v10 (the §0 meta-pitfall). "The
 * absence of data looks identical whether you're healthy or misconfigured" (§1b).
 */

import type { AuditContext, Detector, Finding } from "../types.js";
import { corpusHas, finding, looksProd, matchLines } from "./util.js";

/** Does the corpus initialize Sentry at all? Gates the source-map + tunnel checks. */
function usesSentry(ctx: AuditContext): boolean {
  return corpusHas(ctx, /Sentry\.init\s*\(|@sentry\//);
}

/** Does the corpus look like a browser/SPA app? Gates the ad-blocker tunnel check. */
function looksBrowserApp(ctx: AuditContext): boolean {
  return corpusHas(
    ctx,
    /@sentry\/(react|browser|vue|svelte|angular|nextjs)|browserTracingIntegration|BrowserClient/,
  );
}

/** §1b.3 — tracesSampleRate: 1.0 in a prod config → the Spans-quota bill explosion. */
const tracesSampleRate: Detector = {
  section: "§1b.3",
  description: "tracesSampleRate: 1.0 captures every transaction → blows the Spans budget in prod.",
  detect(ctx) {
    return matchLines(
      ctx,
      /tracesSampleRate\s*:\s*1(?:\.0+)?\b/,
      (file, line, _text) => {
        if (!looksProd(file.rel)) return null;
        return finding(
          "§1b.3",
          "traces-sample-rate-1.0",
          file,
          line,
          "critical",
          "tracesSampleRate: 1.0 in a prod config — sample in prod (e.g. 0.1) or use tracesSampler. On SDK v9+ set 0 to disable (enableTracing was removed).",
        );
      },
    );
  },
};

/** §1b.2 — a browser Sentry app with no `tunnel` → ad-blockers silently eat events. */
const adBlockerTunnel: Detector = {
  section: "§1b.2",
  description: "Browser Sentry app with no `tunnel` → events silently dropped by ad-blockers.",
  detect(ctx) {
    if (!usesSentry(ctx) || !looksBrowserApp(ctx)) return [];
    if (corpusHas(ctx, /tunnel\s*:/)) return []; // tunnel configured → not a footgun
    // file-level finding on the first Sentry.init we can locate.
    const findings: Finding[] = matchLines(ctx, /Sentry\.init\s*\(/, (file, line) =>
      looksProd(file.rel)
        ? finding(
            "§1b.2",
            "no-tunnel-browser",
            file,
            line,
            "critical",
            "Browser Sentry app with no `tunnel` — ad-blockers/uBlock silently drop events ('works locally, silent in prod'). Set tunnel: '/monitoring' so events POST through your domain.",
          )
        : null,
    );
    return findings.slice(0, 1); // one file-level finding is enough
  },
};

/** §3.1 — grepping for `autoSessionTracking` on SDK v9+ where it was REMOVED. */
const autoSessionTrackingTrap: Detector = {
  section: "§3.1",
  description:
    "autoSessionTracking was removed in SDK v9 (current line v10) — using it is a dead config.",
  detect(ctx) {
    // Only a footgun if the codebase is on SDK >= v9. Detect the major from package.json.
    if (!sdkMajorAtLeast(ctx, 9)) return [];
    return matchLines(ctx, /autoSessionTracking/, (file, line) =>
      finding(
        "§3.1",
        "auto-session-tracking-removed",
        file,
        line,
        "critical",
        "autoSessionTracking was REMOVED in Sentry SDK v9 (you're on v9+). Use browserSessionIntegration() (browser) / httpIntegration session tracking (server) instead — grepping for this flag wrongly concludes sessions are off.",
      ),
    );
  },
};

/** §1.1 — Sentry present but no bundler plugin / Debug-ID source-map wiring. */
const missingSourceMaps: Detector = {
  section: "§1.1",
  description: "Sentry present but no source-map (Debug ID) upload → traces stay minified.",
  detect(ctx) {
    if (!usesSentry(ctx)) return [];
    const hasUploadWiring = corpusHas(
      ctx,
      /@sentry\/(webpack|vite|esbuild|rollup)-plugin|sentryWebpackPlugin|sentryVitePlugin|sentry-cli\s+sourcemaps|sourcemaps\s+inject/,
    );
    if (hasUploadWiring) return [];
    const findings: Finding[] = matchLines(ctx, /Sentry\.init\s*\(/, (file, line) =>
      looksProd(file.rel)
        ? finding(
            "§1.1",
            "missing-source-map-debug-ids",
            file,
            line,
            "critical",
            "Sentry initialized but no bundler plugin / `sentry-cli sourcemaps inject→upload` — production stack traces stay minified (Seer reads garbage). Wire the upload into CI (inject BEFORE upload BEFORE deploy).",
          )
        : null,
    );
    return findings.slice(0, 1);
  },
};

/** Read the @sentry/* major from any package.json in the corpus; true if >= min. */
function sdkMajorAtLeast(ctx: AuditContext, min: number): boolean {
  for (const file of ctx.files) {
    if (!file.rel.endsWith("package.json")) continue;
    try {
      const parsed = JSON.parse(file.content) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const deps = { ...parsed.dependencies, ...parsed.devDependencies };
      for (const [name, range] of Object.entries(deps)) {
        if (!name.startsWith("@sentry/")) continue;
        const m = /(\d+)/.exec(range.replace(/^[^\d]*/, ""));
        if (m && m[1] && Number(m[1]) >= min) return true;
      }
    } catch {
      // ignore unparseable package.json
    }
  }
  return false;
}

export const sentryDetectors: Detector[] = [
  tracesSampleRate,
  adBlockerTunnel,
  autoSessionTrackingTrap,
  missingSourceMaps,
];
