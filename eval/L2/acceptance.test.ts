/**
 * L2 — binary behavioral golden tasks (E19): the acceptance core.
 *
 * These BOOT real things and assert a binary outcome — the scenario VERIFY line is the gate
 * (dsip noSelfGrading:true). CI-blocking set members live here.
 *
 *   G1 (S6, EXPERTISE §1.5) — THE acceptance test: `canary instrument` the sample service →
 *      boot it → a thrown error is captured as a span `exception` event + `error.type`
 *      LOCALLY (no creds). The single most load-bearing behavioral gate.
 *   G4 (S6) — `canary slo` produces a `promtool check rules`-valid MWMBR ruleset.
 *
 * Both run the REAL `canary` dist binary as a subprocess (the agent-facing surface), not an
 * in-process shortcut — the eval grades the product, not the library.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, existsSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const canary = resolve(repoRoot, "dist/cli/index.js");
const sampleFixture = "eval/fixtures/sample-service";

/** Run the canary CLI as a subprocess from the repo root; return {status, stdout, stderr}. */
function runCanary(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const res = spawnSync(process.execPath, [canary, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 60000,
  });
  return { status: res.status, stdout: res.stdout ?? "", stderr: res.stderr ?? "" };
}

beforeAll(() => {
  // The dist binary must be built (the eval grades the shipped artifact).
  expect(existsSync(canary), `dist binary missing at ${canary} — run \`pnpm build\` first`).toBe(true);
});

describe("L2 · G1 (S6 / EXPERTISE §1.5) — instrument → boot → throw → span exception captured", () => {
  it("the acceptance gate passes: a thrown error surfaces as a span exception + error.type, locally", () => {
    // 1. instrument the sample service (writes canary-otel.mjs).
    const instrument = runCanary(["instrument", sampleFixture, "--otlp", "file://./.otel-out", "--json"]);
    expect(instrument.status, instrument.stderr).toBe(0);
    // the --json contract: one parseable JSON object on stdout.
    const result = JSON.parse(instrument.stdout.trim());
    expect(result.wired).toContain("canary-otel.mjs");

    // 2. boot-and-throw: the canonical live-boot + span-capture harness (E20).
    const boot = spawnSync(process.execPath, ["eval/boot-and-throw.mjs", sampleFixture], {
      cwd: repoRoot,
      encoding: "utf8",
      timeout: 60000,
    });
    // exit 0 == the thrown error was captured as a verifiable trace span LOCALLY.
    expect(boot.status, `boot-and-throw failed:\n${boot.stderr}\n${boot.stdout}`).toBe(0);
    // the harness prints the proof line; assert the captured signals are present.
    const proof = boot.stdout.trim().split("\n").map((l) => {
      try { return JSON.parse(l); } catch { return null; }
    }).filter(Boolean).find((r: { msg?: string }) => /acceptance gate PASSED/.test(r?.msg ?? ""));
    expect(proof).toBeTruthy();
    expect(proof.exceptionEvent).toBe(true);
    expect(proof.errorType).toBe("TypeError");
    expect(proof.healthStatus).toBe(200);
  });
});

describe("L2 · G4 (S6) — canary slo produces a promtool-valid MWMBR ruleset", () => {
  let outDir: string;

  beforeAll(() => {
    outDir = mkdtempSync(join(tmpdir(), "canary-eval-slo-"));
  });

  it("`canary slo` writes rules; `promtool check rules` passes (skips if promtool absent)", () => {
    const slo = runCanary(["slo", "--service", "sample", "--target", "99.9", "--out", outDir, "--json"]);
    expect(slo.status, slo.stderr).toBe(0);
    const result = JSON.parse(slo.stdout.trim());
    // SLI-as-ratio is the S6 invariant.
    expect(result.sliKind).toBe("ratio");

    // find the generated rules file.
    const ruleFile = readdirSync(outDir).find((f) => f.endsWith(".yml"));
    expect(ruleFile).toBeTruthy();
    const rulesPath = join(outDir, ruleFile!);

    // promtool is the OBJECTIVE gate (no self-grading). If it isn't installed locally, the
    // command already validated shape; assert it didn't report INVALID. CI always has promtool.
    const probe = spawnSync("promtool", ["--version"], { stdio: "ignore" });
    if (probe.error || probe.status !== 0) {
      // promtool absent (some dev machines) — the command's own validity flag must not be false.
      expect(result.promtoolValid).not.toBe(false);
      return;
    }
    const check = spawnSync("promtool", ["check", "rules", rulesPath], { encoding: "utf8" });
    expect(check.status, check.stdout + check.stderr).toBe(0);
    expect(result.promtoolValid).toBe(true);
  });

  // best-effort cleanup; a leaked tmp dir is harmless but tidy up.
  it("cleans up the tmp rules dir", () => {
    if (outDir && existsSync(outDir)) rmSync(outDir, { recursive: true, force: true });
    expect(true).toBe(true);
  });
});
