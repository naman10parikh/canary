/**
 * `canary audit <dir> [--json]`
 *
 * Run the version-specific footgun audit (brain/KNOWN-PITFALLS.md): source-map Debug IDs,
 * tracesSampleRate:1.0, the ad-blocker tunnel gap, the v9 autoSessionTracking trap,
 * rate-without-floor, averaged percentiles, unbounded cardinality, send_resolved, EOL
 * Prometheus, dead on-call tools. Findings keyed by §-ID (PLAN §4).
 *
 * Exit semantics: audit is a REPORT — it exits 0 when it runs successfully and emits the
 * findings. The merge GATE lives in the consumer (`eval/assert-no-critical-footguns.mjs`,
 * which reads this JSON and exits non-zero on any critical). That keeps the pipe
 * `canary audit <dir> --json | node eval/assert-no-critical-footguns.mjs` honest (PLAN §5).
 */

import { Command } from "commander";
import { runAudit, type AuditResult } from "../../audit/run.js";
import { emitResult, runCommand, type OutputOptions } from "../../lib/cli-result.js";
import { logger } from "../../lib/logger.js";

function renderHuman(r: AuditResult): string {
  if (r.findings.length === 0) {
    return `canary audit → ${r.dir}\n  clean — 0 footguns (0 critical). canary's own instrumentation passes canary's own audit.`;
  }
  const lines = [
    `canary audit → ${r.dir}`,
    `  ${r.summary.critical} critical · ${r.summary.warning} warning · ${r.summary.info} info (${r.summary.total} total)`,
    "",
  ];
  for (const f of r.findings) {
    const mark = f.severity === "critical" ? "✗" : f.severity === "warning" ? "!" : "·";
    lines.push(`  ${mark} [${f.section}] ${f.pitfall}  ${f.file}:${f.line}`);
    lines.push(`      ${f.message}`);
  }
  return lines.join("\n");
}

export function registerAudit(program: Command): void {
  program
    .command("audit")
    .description(
      "Run the version-specific footgun audit (source maps, tracesSampleRate, tunnel, autoSessionTracking, rate-without-floor, averaged percentiles, cardinality, send_resolved, EOL Prometheus, dead tools).",
    )
    .argument("<dir>", "the directory to audit")
    .option("--json", "emit the findings as a single JSON object")
    .action(async (dir: string, flags: OutputOptions) => {
      await runCommand("audit", () => {
        const result = runAudit(dir);
        logger.child({ cmd: "audit", dir }).info("audit complete", {
          critical: result.summary.critical,
          total: result.summary.total,
          sections: result.sectionsTriggered,
        });
        emitResult(result, flags, renderHuman);
        // Report mode: exit 0 even with findings; the gate is the consumer asserter.
      });
    });
}
