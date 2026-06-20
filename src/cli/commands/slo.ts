/**
 * `canary slo --service <name> --target <99.9> [--out <dir>] [--json]`
 *
 * Scaffold the MWMBR recording + alert rules (14.4× page / 6× page / 1× ticket) — SLI as a
 * RATIO, `promtool check rules`-valid (PLAN §4, S6). Writes <out>/<service>-slo.yml.
 */

import { Command } from "commander";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";
import { generateSloRules, type SloGenResult } from "../../slo/sloth-gen.js";
import {
  CanaryError,
  emitResult,
  runCommand,
  type OutputOptions,
} from "../../lib/cli-result.js";
import { logger } from "../../lib/logger.js";

interface SloFlags extends OutputOptions {
  service?: string;
  target?: string;
  out?: string;
}

interface SloCommandResult extends SloGenResult {
  rulesPath: string;
  promtoolValid: boolean | null; // null = promtool not on PATH (validated offline by shape)
}

function renderHuman(r: SloCommandResult): string {
  const validLine =
    r.promtoolValid === null
      ? "  promtool: not on PATH (rules written; run `promtool check rules` in CI)"
      : `  promtool: ${r.promtoolValid ? "valid ✓" : "INVALID ✗"}`;
  return [
    `canary slo → ${r.service} @ ${r.target}% (budget ${r.budget})`,
    `  rules:    ${r.rulesPath}`,
    `  SLI:      ${r.sliKind} (good/total — never a raw quantile)`,
    `  tiers:    ${r.alertRules.join(", ")}`,
    validLine,
  ].join("\n");
}

/** Run `promtool check rules` if promtool is installed; null if absent (offline-safe). */
function checkWithPromtool(rulesPath: string): boolean | null {
  const probe = spawnSync("promtool", ["--version"], { stdio: "ignore" });
  if (probe.error || probe.status !== 0) return null;
  const res = spawnSync("promtool", ["check", "rules", rulesPath], {
    encoding: "utf8",
  });
  if (res.status !== 0) {
    logger.child({ cmd: "slo" }).warn("promtool reported invalid rules", {
      stderr: res.stderr?.slice(0, 500),
    });
    return false;
  }
  return true;
}

export function registerSlo(program: Command): void {
  program
    .command("slo")
    .description(
      "Scaffold MWMBR SLO rules (14.4×/6×/1×), SLI-as-ratio, promtool-valid (S6).",
    )
    .requiredOption("--service <name>", "the service the SLO covers")
    .requiredOption("--target <pct>", "availability target, e.g. 99.9")
    .option("--out <dir>", "output directory for the rules YAML", ".slo")
    .option("--json", "emit the result as a single JSON object")
    .action(async (flags: SloFlags) => {
      await runCommand("slo", async () => {
        const service = flags.service ?? "";
        const target = Number(flags.target);
        if (!Number.isFinite(target)) {
          throw new CanaryError("BAD_INPUT", `--target must be numeric, got: ${flags.target}`, {
            target: flags.target,
          });
        }
        const log = logger.child({ cmd: "slo", service });
        const gen = generateSloRules({ service, target });
        const outDir = resolve(flags.out ?? ".slo");
        await mkdir(outDir, { recursive: true });
        const rulesPath = join(outDir, `${service.replace(/[^a-zA-Z0-9_-]/g, "_")}-slo.yml`);
        await writeFile(rulesPath, gen.yaml, "utf8");
        log.info("slo rules written", { rulesPath, tiers: gen.alertRules });
        const promtoolValid = checkWithPromtool(rulesPath);
        emitResult({ ...gen, rulesPath, promtoolValid }, flags, renderHuman);
      });
    });
}
