/**
 * The eval-pyramid Vitest config (E19) — distinct from the unit/integration `vitest.config.ts`.
 *
 * The unit suite (tests/) excludes eval/ to avoid double-ownership; THIS config is what
 * `canary eval` runs (and what CI's eval jobs run). It includes only the L1 (structural) and
 * L2 (behavioral) suites — L3 is trajectory/plan-graded (markdown rubrics in eval/L3/, not
 * machine-run here).
 *
 * Per HARNESS-OVERRIDES "Evals": the golden tasks are lifted from
 * brain/BATTLE-TESTED-SCENARIOS.md (S1–S18); each scenario's built-in VERIFY line is the
 * objective gate (dsip noSelfGrading:true — never the agent's own opinion). pass^k (k≥3) is
 * enforced by the `canary eval` runner re-running the behavioral suite, not by this config.
 */

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["eval/L1/**/*.test.ts", "eval/L2/**/*.test.ts"],
    exclude: ["node_modules/**", "dist/**", "eval/fixtures/**", "eval/L3/**"],
    environment: "node",
    // The L2 behavioral tasks boot a real service + hit routes — give them headroom.
    testTimeout: 60000,
    hookTimeout: 60000,
    // One reporter line per task so the S-ID mapping is legible in CI logs.
    reporters: ["default"],
  },
});
