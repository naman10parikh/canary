/**
 * Honest stubs for commands whose owning cluster has not landed yet, so `canary --help`
 * lists the FULL command tree (PLAN §4) without over-claiming. Each stub prints what it
 * WILL do and exits non-zero (it is not yet implemented) — never a silent no-op that looks
 * like success. These are advertised as planned capabilities (A2A `plannedCapabilities`).
 *
 *   - release-health : Cluster-D/E surface (S7) — crash-free-users × adoption rollback call.
 *   - uptime         : Checkly monitoring-as-code (J2).
 *
 * (`eval` is now REAL — see commands/eval.ts, E19 — and is no longer a planned stub.)
 */

import { Command } from "commander";
import { CanaryError, runCommand } from "../../lib/cli-result.js";
import { logger } from "../../lib/logger.js";

interface PlannedStub {
  name: string;
  description: string;
  willDo: string;
}

const PLANNED: PlannedStub[] = [
  {
    name: "release-health",
    description:
      "[planned] Compare two releases' crash-free-users × adoption → go/rollback (S7).",
    willDo:
      "Pull crash-free-users rate + adoption for --current vs --previous (Sentry MCP/REST), weight by adoption, and version-branch the v9+ session-tracking check.",
  },
  {
    name: "uptime",
    description:
      "[planned] Author a Checkly monitoring-as-code check and run it (J2).",
    willDo:
      "Scaffold an ApiCheck/BrowserCheck (@playwright/test spec) for --url and `npx checkly test` it.",
  },
];

export function registerPlannedStubs(program: Command): void {
  for (const stub of PLANNED) {
    const cmd = program.command(stub.name).description(stub.description);
    if (stub.name === "release-health") {
      cmd.option("--current <rel>", "the current release");
      cmd.option("--previous <rel>", "the previous release");
      cmd.option("--json", "emit JSON");
    } else if (stub.name === "uptime") {
      cmd.option("--url <u>", "the URL to monitor");
      cmd.option("--flow <spec.ts>", "an optional Playwright flow spec");
      // Accept --json for contract parity with every other data command (release-health,
      // instrument, slo, audit, ...). Without it a user passing --json hits a hard
      // `unknown option` crash instead of the honest planned-capability message (T-user finding).
      cmd.option("--json", "emit JSON");
    }
    cmd.action(async () => {
      await runCommand(stub.name, () => {
        logger.child({ cmd: stub.name }).warn("planned capability — not yet implemented", {
          willDo: stub.willDo,
        });
        throw new CanaryError(
          "INTERNAL",
          `'${stub.name}' is a planned capability, not yet implemented. ${stub.willDo}`,
          { planned: true },
        );
      });
    });
  }
}
