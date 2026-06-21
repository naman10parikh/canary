/**
 * D16 — the internal routing loop ordering + output-feeds-next + halt-on-failure contract.
 *
 * The load-bearing property of the dispatch loop is the FIXED step order and that a failed
 * step halts the run (a half-instrumented run is never a success — PLAN §9 chaos #1). These
 * tests assert that contract deterministically against throwaway fixtures.
 */

import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runLoop, RUN_LOOP_STEPS } from "../src/dispatch/run-loop.js";

const dirs: string[] = [];
function fixture(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "canary-loop-"));
  dirs.push(dir);
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(dir, name), content);
  }
  return dir;
}

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

describe("dispatch run-loop — D16", () => {
  it("exports the fixed 5-step order", () => {
    expect([...RUN_LOOP_STEPS]).toEqual([
      "instrument",
      "emit",
      "assert-captured",
      "scaffold-slo",
      "audit",
    ]);
  });

  it("runs all 5 steps in the contract order on a clean fixture (emit/assert skip without OTel deps)", async () => {
    // A clean service shape with no footguns. Without @opentelemetry/* in the target, emit +
    // assert-captured skip honestly; instrument + scaffold-slo + audit run green → ok.
    const dir = fixture({
      "package.json": JSON.stringify({ name: "sample-service", type: "module", main: "server.js" }),
      "server.js": "// clean service\nconst x = 1;\n",
    });
    const result = await runLoop({ dir, service: "sample", target: 99.9 });
    expect(result.steps.map((s) => s.step)).toEqual([...RUN_LOOP_STEPS]);
    // a clean fixture has zero critical footguns → the audit step does not fail.
    const audit = result.steps.find((s) => s.step === "audit");
    expect(audit?.status).toBe("ok");
    // no step FAILED → the loop is ok (emit/assert may be skipped, that is allowed).
    expect(result.ok).toBe(true);
  });

  it("step 1's output (the bootstrap + sink) feeds the later steps", async () => {
    const dir = fixture({
      "package.json": JSON.stringify({ name: "feeds", type: "module" }),
    });
    const result = await runLoop({ dir, service: "feeds" });
    const instrument = result.steps.find((s) => s.step === "instrument");
    // the instrument step records the wired bootstrap + the sink dir the next steps consume.
    expect(instrument?.output?.wired).toContain("canary-otel.mjs");
    expect(typeof instrument?.output?.sinkDir).toBe("string");
  });

  it("HALTS on a failed step (a footgun-laden fixture fails the audit and the loop is not ok)", async () => {
    // Seed a footgun the audit flags critical (tracesSampleRate:1.0). No bootable entry, so
    // emit/assert skip; the audit step then FAILS → result.ok is false.
    const dir = fixture({
      "package.json": JSON.stringify({ name: "broken", type: "module" }),
      "sentry.config.js":
        'import * as Sentry from "@sentry/browser";\nSentry.init({ tracesSampleRate: 1.0 });\n',
    });
    const result = await runLoop({ dir, service: "broken" });
    const audit = result.steps.find((s) => s.step === "audit");
    expect(audit?.status).toBe("failed");
    expect(result.ok).toBe(false);
  });

  it("throws a typed NOT_FOUND on a missing target dir (not a crash — PLAN §9)", async () => {
    await expect(runLoop({ dir: "/nonexistent/canary-loop-xyz" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});
