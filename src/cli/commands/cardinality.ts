/**
 * `canary cardinality <dir> [--json]`
 *
 * Detect unbounded metric labels (user_id/request_id/url.path) → emit the OTel Collector
 * filter/transform config to strip them + state where the value belongs (a trace/event).
 * (PLAN §4, S8, OPINIONS B3.) Grep-based, offline.
 */

import { Command } from "commander";
import { detectCardinality, type CardinalityResult } from "../../cardinality/detect.js";
import { emitResult, runCommand, type OutputOptions } from "../../lib/cli-result.js";
import { logger } from "../../lib/logger.js";

function renderHuman(r: CardinalityResult): string {
  if (r.unboundedLabels.length === 0) {
    return `canary cardinality → ${r.dir}\n  clean — no unbounded metric labels found.`;
  }
  const lines = [`canary cardinality → ${r.dir}`, `  ${r.unboundedLabels.length} unbounded label(s):`];
  for (const f of r.unboundedLabels) {
    lines.push(`  ✗ '${f.label}'  ${f.file}:${f.line}  → belongs on a ${f.belongsOn}`);
  }
  lines.push("", "  Collector config to strip them:", r.collectorConfig);
  return lines.join("\n");
}

export function registerCardinality(program: Command): void {
  program
    .command("cardinality")
    .description(
      "Detect unbounded metric labels (user_id/request_id/url.path) → emit the Collector strip config + where the value belongs (S8).",
    )
    .argument("<dir>", "the directory to scan")
    .option("--json", "emit the result as a single JSON object")
    .action(async (dir: string, flags: OutputOptions) => {
      await runCommand("cardinality", () => {
        const result = detectCardinality(dir);
        logger.child({ cmd: "cardinality", dir }).info("cardinality scan complete", {
          unbounded: result.unboundedLabels.length,
        });
        emitResult(result, flags, renderHuman);
      });
    });
}
