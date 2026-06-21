/**
 * `canary eval [--level 1|2|3] [--k <n>]` — the eval-pyramid runner (E19, PLAN §3 component 9).
 *
 * Runs the golden tasks lifted from brain/BATTLE-TESTED-SCENARIOS.md (S1–S18) under
 * eval/eval.config.ts:
 *   - L1 (structural assertions, eval/L1) + L2 (binary behavioral, eval/L2) are Vitest suites;
 *     each scenario's built-in VERIFY line is the objective gate (dsip noSelfGrading:true —
 *     never the agent's own opinion). This command shells out to `vitest run --config
 *     eval/eval.config.ts` so the eval grades the SHIPPED behavior, not a hand-wave.
 *   - L3 (trajectory, eval/L3) is plan-graded markdown rubrics (delivery-heartbeat design /
 *     alert-deletion plan / Datadog→Prometheus migration). `--level 3` lists them (they are
 *     process-graded by a reviewer, not machine-run — HARNESS-OVERRIDES "Evals").
 *
 * pass^k (k≥3): the checklist requires "a single passing trial is not evidence" on the
 * blocking set. With no `--level` (the full pyramid) or `--level 2`, the behavioral suite is
 * re-run `--k` times (default 3) and ALL k runs must pass. L1 is deterministic-structural →
 * run once. Exit 0 iff every required run passed.
 */

import { Command } from "commander";
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { emitResult, runCommand, type OutputOptions } from "../../lib/cli-result.js";
import { logger } from "../../lib/logger.js";

interface EvalFlags extends OutputOptions {
  level?: string;
  k?: string;
}

/** Where the repo root is, relative to dist/cli/commands/eval.js → ../../../ */
function repoRoot(): string {
  return resolve(dirnameOf(fileURLToPath(import.meta.url)), "..", "..", "..");
}
function dirnameOf(p: string): string {
  return p.slice(0, p.lastIndexOf("/"));
}

interface EvalRunResult {
  level: "1" | "2" | "3" | "all";
  k: number;
  /** per-run pass/fail for the behavioral re-runs (pass^k). */
  runs: { label: string; passed: boolean }[];
  /** the L3 trajectory rubrics (listed, not machine-run). */
  l3Tasks: string[];
  passed: boolean;
}

/**
 * Run vitest over the eval config with an optional path filter (L1 vs L2). When `quiet`
 * (i.e. `--json`), vitest's output goes to STDERR so the command's STDOUT stays a single
 * clean JSON object (the --json contract); otherwise it inherits to STDOUT so a human sees
 * the per-task S-ID lines.
 */
function runVitest(root: string, filter: string | undefined, quiet: boolean): boolean {
  const vitestBin = join(root, "node_modules", ".bin", "vitest");
  const args = ["run", "--config", "eval/eval.config.ts"];
  if (filter) args.push(filter);
  const bin = existsSync(vitestBin) ? vitestBin : "vitest";
  const res = spawnSync(bin, args, {
    cwd: root,
    encoding: "utf8",
    // quiet (json mode): route vitest's stdout to OUR stderr (fd 2) so our stdout stays a
    // clean single JSON object; otherwise inherit everything so a human sees the task lines.
    stdio: quiet ? ["ignore", 2, "inherit"] : "inherit",
    timeout: 180000,
  });
  return res.status === 0;
}

/** List the L3 trajectory rubric files (process-graded, not machine-run). */
function listL3(root: string): string[] {
  const l3Dir = join(root, "eval", "L3");
  if (!existsSync(l3Dir)) return [];
  return readdirSync(l3Dir)
    .filter((f) => f.endsWith(".md"))
    .sort();
}

function renderHuman(r: EvalRunResult): string {
  const lines = [`canary eval → level ${r.level} (pass^k k=${r.k})`];
  for (const run of r.runs) {
    lines.push(`  ${run.passed ? "✓" : "✗"} ${run.label}`);
  }
  if (r.l3Tasks.length > 0) {
    lines.push(`  L3 trajectory rubrics (process-graded — review, not machine-run):`);
    for (const t of r.l3Tasks) lines.push(`    · eval/L3/${t}`);
  }
  lines.push(`  result: ${r.passed ? "PASS" : "FAIL"}`);
  return lines.join("\n");
}

export function registerEval(program: Command): void {
  program
    .command("eval")
    .description("Run the eval pyramid (L1 structural / L2 behavioral / L3 trajectory) over the golden tasks (S1–S18).")
    .option("--level <1|2|3>", "run only one level (default: L1+L2 with pass^k)")
    .option("--k <n>", "pass^k repetitions for the behavioral suite (default 3)", "3")
    .option("--json", "emit the result as a single JSON object")
    .action(async (flags: EvalFlags) => {
      await runCommand("eval", async () => {
        const root = repoRoot();
        const level = (flags.level ?? "all") as EvalRunResult["level"];
        const k = Math.max(1, Number(flags.k ?? "3") || 3);
        const log = logger.child({ cmd: "eval", level, k });
        const quiet = Boolean(flags.json);
        const runs: { label: string; passed: boolean }[] = [];
        const l3Tasks = listL3(root);

        // L1 — structural, deterministic → run once.
        if (level === "1" || level === "all") {
          log.info("running L1 structural assertions");
          runs.push({ label: "L1 structural (eval/L1)", passed: runVitest(root, "eval/L1", quiet) });
        }

        // L2 — behavioral → pass^k (k≥3 on the blocking set; a single pass is not evidence).
        if (level === "2" || level === "all") {
          const reps = level === "2" || level === "all" ? k : 1;
          for (let i = 1; i <= reps; i++) {
            log.info("running L2 behavioral", { trial: i, of: reps });
            runs.push({ label: `L2 behavioral (eval/L2) — trial ${i}/${reps}`, passed: runVitest(root, "eval/L2", quiet) });
          }
        }

        // L3 — trajectory; plan-graded. `--level 3` just enumerates the rubrics.
        if (level === "3") {
          log.info("L3 trajectory rubrics are process-graded (review the markdown)", { count: l3Tasks.length });
        }

        const passed = runs.length > 0 ? runs.every((r) => r.passed) : level === "3";
        const result: EvalRunResult = { level, k, runs, l3Tasks, passed };
        emitResult(result, flags, renderHuman);
        if (!passed) process.exitCode = 1;
      });
    });
}
