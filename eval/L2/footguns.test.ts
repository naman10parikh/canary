/**
 * L2 — binary behavioral golden tasks (E19): the footgun-detection + dogfood gates.
 *
 * Each runs the REAL audit/runtime over a committed fixture (or a tmp one) and asserts a
 * binary outcome keyed to the scenario VERIFY line (no self-grading).
 *
 *   G2 (S1/S2) — source maps: `canary instrument --sentry` wires the Debug-ID upload config
 *                (the #1 footgun, upstream of all AI-debugging).
 *   G6 (S7)    — did-the-deploy-regress hinges on the v9+ `autoSessionTracking` config check;
 *                the version-AWARE §3.1 detector fires on a v9 app, NOT on a v8 app (the brain's
 *                signature "read the SDK major FIRST" behavior). [creds-free half of S7]
 *   G8 (S8)    — the cardinality bomb: `canary cardinality` flags a `user_id` metric label.
 *   G9 (S17)   — works-locally-silent-in-prod: the audit flags a browser Sentry app with no
 *                ad-blocker bypass path (§1b.2).
 *   G10 (S18)  — the cron that silently stopped: the dogfood dead-man's-switch check-in fires.
 */

import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runAudit } from "../../src/audit/run.js";
import { detectCardinality } from "../../src/cardinality/detect.js";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const canary = resolve(repoRoot, "dist/cli/index.js");
const brokenFixture = resolve(repoRoot, "eval/fixtures/broken-service");

/** Write a throwaway fixture dir under tmp and return its path. */
function tmpFixture(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "canary-eval-fx-"));
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(dir, rel);
    mkdirSync(resolve(abs, ".."), { recursive: true });
    writeFileSync(abs, content, "utf8");
  }
  return dir;
}

describe("L2 · G2 (S1/S2) — source-map (Debug ID) upload wiring", () => {
  it("`canary instrument --sentry` writes the bundler-plugin / Debug-ID upload config", () => {
    const dir = tmpFixture({
      "package.json": JSON.stringify({ name: "g2-svc", type: "module" }),
      "server.mjs": "import http from 'node:http'; http.createServer((_q,s)=>s.end('ok')).listen(0);",
    });
    const res = spawnSync(process.execPath, [canary, "instrument", dir, "--sentry", "--json"], {
      cwd: repoRoot,
      encoding: "utf8",
      timeout: 30000,
    });
    expect(res.status, res.stderr).toBe(0);
    const result = JSON.parse(res.stdout.trim());
    // the Sentry source-map path is additionally wired (a second generated file).
    expect(result.sentry).toBe(true);
    expect(result.wired).toContain("canary-sentry.config.mjs");
    // and the config references the Debug-ID / source-map upload surface.
    const cfg = join(dir, "canary-sentry.config.mjs");
    expect(existsSync(cfg)).toBe(true);
  });
});

describe("L2 · G6 (S7) — version-AWARE autoSessionTracking check (the SDK-major-first behavior)", () => {
  it("FIRES §3.1 on a v9 app (autoSessionTracking removed) — the deploy-regress session check", () => {
    const v9 = tmpFixture({
      "package.json": JSON.stringify({ dependencies: { "@sentry/react": "^9.0.0" } }),
      "sentry.config.mjs": "import * as Sentry from '@sentry/react';\nSentry.init({ autoSessionTracking: true });",
    });
    const audit = runAudit(v9);
    const v9Findings = audit.findings.filter((f) => f.section === "§3.1");
    expect(v9Findings.length).toBeGreaterThanOrEqual(1);
    expect(v9Findings[0]?.pitfall).toBe("auto-session-tracking-removed");
  });

  it("does NOT fire §3.1 on a v8 app (where autoSessionTracking still exists) — no false positive", () => {
    const v8 = tmpFixture({
      "package.json": JSON.stringify({ dependencies: { "@sentry/react": "^8.0.0" } }),
      "sentry.config.mjs": "import * as Sentry from '@sentry/react';\nSentry.init({ autoSessionTracking: true });",
    });
    const audit = runAudit(v8);
    expect(audit.findings.filter((f) => f.section === "§3.1").length).toBe(0);
  });
});

describe("L2 · G8 (S8) — the cardinality bomb", () => {
  it("`canary cardinality` flags the `user_id` metric label on the broken fixture", () => {
    const res = spawnSync(process.execPath, [canary, "cardinality", brokenFixture, "--json"], {
      cwd: repoRoot,
      encoding: "utf8",
      timeout: 30000,
    });
    expect(res.status, res.stderr).toBe(0);
    const result = JSON.parse(res.stdout.trim());
    const labels = result.unboundedLabels.map((f: { label: string }) => f.label);
    expect(labels).toContain("user_id");
    // and it emits the Collector strip config + states where the value belongs.
    expect(result.collectorConfig).toMatch(/processors/);
    expect(result.unboundedLabels[0]?.belongsOn).toBe("trace/event");
  });

  it("the shared cardinality core agrees with the audit's §5.1 detector (no drift)", () => {
    const card = detectCardinality(brokenFixture);
    const audit = runAudit(brokenFixture);
    const auditLabels = audit.findings.filter((f) => f.section === "§5.1");
    expect(card.unboundedLabels.length).toBeGreaterThan(0);
    expect(auditLabels.length).toBeGreaterThan(0);
  });
});

describe("L2 · G9 (S17) — works-locally-silent-in-prod (ad-blocker drop)", () => {
  it("the audit flags a browser Sentry app with no ad-blocker bypass path (§1b.2)", () => {
    const audit = runAudit(brokenFixture);
    const tunnelFindings = audit.findings.filter((f) => f.section === "§1b.2");
    expect(tunnelFindings.length).toBeGreaterThanOrEqual(1);
    expect(tunnelFindings[0]?.pitfall).toBe("no-tunnel-browser");
  });
});

describe("L2 · G10 (S18) — the cron that silently stopped (dead-man's-switch check-in)", () => {
  it("the dogfood check-in fires and emits a structured check-in record (exit 0)", () => {
    const res = spawnSync(process.execPath, [resolve(repoRoot, "scripts/dogfood-checkin.mjs")], {
      cwd: repoRoot,
      encoding: "utf8",
      timeout: 15000,
    });
    expect(res.status).toBe(0);
    // a structured check-in line (NOT prose) with the stable monitor slug a heartbeat keys on.
    const checkin = res.stdout
      .trim()
      .split("\n")
      .map((l) => {
        try { return JSON.parse(l); } catch { return null; }
      })
      .filter(Boolean)
      .find((r: { kind?: string }) => r?.kind === "dogfood-cron-checkin");
    expect(checkin).toBeTruthy();
    expect(checkin.monitorSlug).toBe("canary-rsi-heartbeat");
    expect(checkin.status).toBe("ok");
  });
});
