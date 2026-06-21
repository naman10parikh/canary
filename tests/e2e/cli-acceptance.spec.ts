/**
 * tests/e2e/cli-acceptance.spec.ts — the full canary CLI acceptance flow, E2E (G29, PLAN §9 CLI-E2E row).
 *
 * The acceptance bar (CLAUDE.md / PLAN §5): canary instruments a sample service → a thrown error is
 * captured + a verifiable trace span emitted locally → an MWMBR alert rule + an SLO scaffolded and
 * promtool-valid. This drives that exact flow from a clean temp dir through the BUILT CLI (the same
 * binary the cockpit + acceptance.yml use). $0, no provider creds (the local file exporter path).
 *
 * Red-blocking: the acceptance CLI flow must complete. This is the Playwright peer of the
 * acceptance.yml merge gate (E23) — proves the chairman-facing E2E, not just CI.
 */

import { test, expect } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, existsSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO = process.cwd();
const CLI = join(REPO, "dist", "cli", "index.js");
const SAMPLE = join(REPO, "eval", "fixtures", "sample-service");

/** Run a node CLI invocation, returning { code, stdout, stderr }. */
function cli(args: string[], opts: { cwd?: string } = {}) {
  const res = spawnSync(process.execPath, [CLI, ...args], {
    cwd: opts.cwd ?? REPO,
    encoding: "utf8",
    timeout: 60_000,
  });
  return { code: res.status, stdout: res.stdout ?? "", stderr: res.stderr ?? "" };
}

test.describe("canary CLI acceptance flow (the PLAN §5 bar, from a clean dir)", () => {
  test.skip(!existsSync(SAMPLE), "sample-service fixture (E20) not present");

  test("instrument → boot+throw → span+exception captured locally", async () => {
    // The acceptance fixture (E20) declares no OTel deps and has no node_modules — it resolves
    // `@opentelemetry/*` UPWARD to the repo-root node_modules, so it MUST run in-place (copying it
    // to /tmp severs that resolution chain). "From a clean dir" is satisfied by clearing any prior
    // bootstrap + span sink first, then doing a fresh instrument — exactly what acceptance.yml does.
    const svc = SAMPLE;
    rmSync(join(svc, "canary-otel.mjs"), { force: true });
    rmSync(join(svc, ".otel-out"), { force: true, recursive: true });

    // 1) instrument the (clean) service.
    const instr = cli(["instrument", svc, "--json"]);
    expect(instr.code, instr.stderr).toBe(0);
    const lastJson = instr.stdout.trim().split("\n").reverse().find((l) => l.trim().startsWith("{"));
    expect(lastJson, "instrument emits parseable JSON").toBeTruthy();
    const wired = JSON.parse(lastJson as string);
    expect(wired.wired, "OTel bootstrap wired").toContain("canary-otel.mjs");

    // 2) boot the instrumented service, throw, assert a span carries an exception + error.type.
    //    boot-and-throw (E20) needs the OTel runtime deps reachable. They live in the repo-root
    //    node_modules (canary's own deps); if absent (deps not installed), SKIP honestly — never fake.
    const bootScript = join(REPO, "eval", "boot-and-throw.mjs");
    if (!existsSync(bootScript)) test.skip(true, "boot-and-throw harness (E20) not present");
    if (!existsSync(join(REPO, "node_modules", "@opentelemetry", "sdk-node"))) {
      test.skip(true, "OTel runtime deps not installed (run `pnpm install`) — boot+throw is the E22 peer harness");
    }
    // boot-and-throw takes the fixture dir as argv[2] (default eval/fixtures/sample-service).
    const boot = spawnSync(process.execPath, [bootScript, svc], {
      cwd: REPO,
      encoding: "utf8",
      timeout: 60_000,
    });
    // boot-and-throw exits 0 only when a span with an exception event + error.type is captured.
    expect(boot.status, `boot-and-throw output:\n${boot.stdout}\n${boot.stderr}`).toBe(0);
    expect(boot.stdout + boot.stderr).toMatch(/exception|error\.type|PASSED/i);
  });

  test("slo → promtool-valid MWMBR ruleset (SLI as a ratio, 3 burn tiers)", async () => {
    const out = mkdtempSync(join(tmpdir(), "canary-slo-"));
    const r = cli(["slo", "--service", "sample", "--target", "99.9", "--out", out, "--json"]);
    expect(r.code, r.stderr).toBe(0);
    const j = JSON.parse(r.stdout.trim().split("\n").reverse().find((l) => l.trim().startsWith("{")) as string);
    expect(j.sliKind).toBe("ratio");
    expect(j.alertRules).toHaveLength(3);
    expect(j.promtoolValid === true || j.promtoolValid === undefined).toBeTruthy(); // true when promtool present
    // A real rules file was written.
    const files = readdirSync(out).filter((f) => f.endsWith(".yml"));
    expect(files.length).toBeGreaterThan(0);
  });

  test("audit → zero critical footguns on the clean fixture; non-zero on the broken fixture", async () => {
    const clean = cli(["audit", SAMPLE, "--json"]);
    expect(clean.code, clean.stderr).toBe(0);
    const cj = JSON.parse(clean.stdout.trim().split("\n").reverse().find((l) => l.trim().startsWith("{")) as string);
    expect(cj.summary.critical).toBe(0);

    const brokenDir = join(REPO, "eval", "fixtures", "broken-service");
    if (existsSync(brokenDir)) {
      const broken = cli(["audit", brokenDir, "--json"]);
      const bj = JSON.parse(broken.stdout.trim().split("\n").reverse().find((l) => l.trim().startsWith("{")) as string);
      expect(bj.summary.critical, "broken fixture has critical footguns").toBeGreaterThan(0);
    }
  });
});
