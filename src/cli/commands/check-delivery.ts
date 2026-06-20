/**
 * `canary check-delivery [--channel pagerduty|slack|webhook] [--json]`
 *
 * THE differentiator (S5, A4). Fire a synthetic page through each configured notification
 * channel → confirm receipt → fail loudly if a channel is dead, and re-report the dead
 * channel via a DIFFERENT alive channel within one cycle. Reports {delivered, latencyMs,
 * dead:[...], escalations:[...]}.
 *
 * Channels come from CANARY_DELIVERY_CHANNELS (JSON) or .canary/delivery.json. A `mock`
 * channel is an in-process sink ($0, no creds — the default/demo + chaos lever); a
 * `webhook` channel does a real HTTP POST. Shipped as a capability, not a merge gate.
 */

import { Command } from "commander";
import {
  loadChannels,
  runHeartbeat,
  type DeliveryResult,
} from "../../delivery/heartbeat.js";
import { emitResult, runCommand, type OutputOptions } from "../../lib/cli-result.js";
import { logger } from "../../lib/logger.js";

interface DeliveryFlags extends OutputOptions {
  channel?: string;
}

function renderHuman(r: DeliveryResult): string {
  const lines = [
    `canary check-delivery → ${r.delivered ? "ALL DELIVERED ✓" : "DEAD CHANNEL(S) ✗"} (${r.latencyMs}ms)`,
  ];
  for (const c of r.channels) {
    const mark = c.delivered ? "✓" : "✗";
    const err = c.error ? `  (${c.error})` : "";
    lines.push(`  ${mark} ${c.name} [${c.type}] ${c.latencyMs}ms${err}`);
  }
  if (r.escalations.length > 0) {
    lines.push("  escalations (dead → reported via a different channel):");
    for (const e of r.escalations) lines.push(`    ${e.deadChannel} → via ${e.viaChannel}`);
  }
  if (r.dead.length > 0 && r.escalations.length === 0) {
    lines.push("  ⚠ no alive channel to escalate through — the page CANNOT be delivered (S5).");
  }
  return lines.join("\n");
}

export function registerCheckDelivery(program: Command): void {
  program
    .command("check-delivery")
    .description(
      "Fire a synthetic page through each notification channel → prove it delivers; a dead channel is re-reported via a different one (the differentiator, S5).",
    )
    .option("--channel <type>", "limit to one channel type/name (pagerduty|slack|webhook|<name>)")
    .option("--json", "emit the result as a single JSON object")
    .action(async (flags: DeliveryFlags) => {
      await runCommand("check-delivery", async () => {
        const log = logger.child({ cmd: "check-delivery" });
        const channels = loadChannels({ channelFilter: flags.channel });
        log.info("running delivery heartbeat", { channels: channels.map((c) => c.name) });
        const result = await runHeartbeat(channels);
        emitResult(result, flags, renderHuman);
        if (!result.delivered) {
          // fail loudly (non-zero) — but the JSON/human report is already on stdout.
          log.error("delivery heartbeat found a dead channel", {
            dead: result.dead,
            escalations: result.escalations,
          });
          process.exitCode = 1;
        }
      });
    });
}
