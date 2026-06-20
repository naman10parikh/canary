/**
 * Honest stubs for commands whose owning cluster has not landed yet, so `canary --help`
 * lists the FULL command tree (PLAN §4) without over-claiming. Each stub prints what it
 * WILL do and exits non-zero (it is not yet implemented) — never a silent no-op that looks
 * like success. These are advertised as planned capabilities (A2A `plannedCapabilities`).
 *
 *   - release-health : Cluster-D/E surface (S7) — crash-free-users × adoption rollback call.
 *   - uptime         : Checkly monitoring-as-code (J2).
 *   - eval           : the eval pyramid runner (E19) — wired when eval/ lands.
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
  {
    name: "eval",
    description: "[planned] Run the eval pyramid (L1/L2/L3) over the golden tasks (E19).",
    willDo:
      "Run eval/ (L1 structural assertions + L2 binary behavioral gates + L3 trajectory), the scenario VERIFY lines as the objective gate (no self-grading).",
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
    } else {
      cmd.option("--level <1|2|3>", "which eval level to run");
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
