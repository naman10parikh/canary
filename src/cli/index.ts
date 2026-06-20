#!/usr/bin/env node
/**
 * `canary` — the observability/SRE employee's hands.
 *
 * Every operation an agent needs has a deterministic, non-interactive, `--json` path
 * (brain/EXPERTISE-MAP.md JOB 9; OPINIONS D1). Exit 0 on success, non-zero on error.
 *
 * The command tree (PLAN §4) — instrument · slo · audit · check-delivery · release-health ·
 * uptime · cardinality · brain · explain · eval — is registered here. Each `register*`
 * adds one command; planned-but-unbuilt commands are honest stubs so `--help` lists the
 * full tree without over-claiming.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Command } from "commander";

import { registerInstrument } from "./commands/instrument.js";
import { registerSlo } from "./commands/slo.js";
import { registerAudit } from "./commands/audit.js";
import { registerCheckDelivery } from "./commands/check-delivery.js";
import { registerCardinality } from "./commands/cardinality.js";
import { registerBrain } from "./commands/brain.js";
import { registerExplain } from "./commands/explain.js";
import { registerPlannedStubs } from "./commands/stubs.js";

/** Resolve the version from package.json (dist/cli/index.js → ../../package.json). */
function resolveVersion(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const pkgPath = join(here, "..", "..", "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function buildProgram(): Command {
  const program = new Command();
  program
    .name("canary")
    .description(
      "The early warning that's actually actionable — instrument once, page on symptoms, prove the page delivers. Powered by Energy.",
    )
    .version(resolveVersion(), "-v, --version", "print the canary version");

  // Real, built commands (Cluster B CLI work stream).
  registerInstrument(program);
  registerSlo(program);
  registerAudit(program);
  registerCheckDelivery(program);
  registerCardinality(program);
  registerBrain(program);
  registerExplain(program);

  // Planned capabilities (full tree in --help; honest non-zero stubs).
  registerPlannedStubs(program);

  return program;
}

const program = buildProgram();
program.parseAsync(process.argv).catch((err: unknown) => {
  process.stderr.write(
    `${JSON.stringify({ level: "error", msg: "fatal", error: err instanceof Error ? err.message : String(err) })}\n`,
  );
  process.exitCode = 1;
});
