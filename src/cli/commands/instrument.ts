/**
 * `canary instrument <dir> [--otlp <endpoint>] [--sentry] [--json]`
 *
 * THE acceptance path (PLAN §5). Wires OpenTelemetry into a target service so a thrown
 * error → span `exception` event + `error.type` and latency → an http.server.request
 * .duration histogram, emitting to a LOCAL file exporter by default ($0, no creds).
 * `--sentry` additionally wires the source-map (Debug ID) path (OPINIONS B1).
 */

import { Command } from "commander";
import { instrumentService, type InstrumentResult } from "../../instrument/otel.js";
import { emitResult, runCommand, type OutputOptions } from "../../lib/cli-result.js";
import { logger } from "../../lib/logger.js";
import { withRunLog } from "../../observability/run-logger.js";

interface InstrumentFlags extends OutputOptions {
  otlp?: string;
  sentry?: boolean;
}

function renderHuman(r: InstrumentResult): string {
  const lines = [
    `canary instrument → ${r.dir}`,
    `  wired:    ${r.wired.join(", ")}`,
    r.exporter.kind === "file"
      ? `  exporter: local file sink → ${r.exporter.path} ($0, no creds)`
      : `  exporter: OTLP → ${r.exporter.endpoint}`,
    `  sentry:   ${r.sentry ? "source-map (Debug ID) path wired" : "not wired (pass --sentry)"}`,
    `  env attr: ${r.environmentAttribute}`,
    `  boundary: ${r.boundary}`,
    `  proof:    ${r.spanProof}`,
  ];
  return lines.join("\n");
}

export function registerInstrument(program: Command): void {
  program
    .command("instrument")
    .description(
      "Wire OpenTelemetry into a service (thrown error → span exception event + error.type; latency → histogram). Local file exporter by default — $0, no creds.",
    )
    .argument("<dir>", "the service directory to instrument")
    .option(
      "--otlp <endpoint>",
      "OTLP target: a file:// path (local sink) or http(s):// endpoint",
      "file://.otel-out",
    )
    .option("--sentry", "also wire the Sentry source-map (Debug ID) path")
    .option("--json", "emit the result as a single JSON object")
    .action(async (dir: string, flags: InstrumentFlags) => {
      await runCommand("instrument", async () => {
        const log = logger.child({ cmd: "instrument", dir });
        log.info("instrumenting service", { otlp: flags.otlp, sentry: Boolean(flags.sentry) });
        // Dogfood (OPINIONS D5): wrap the run so it appends a Majors-shaped wide event to
        // logs/runs.jsonl with a real trace.id + a measured durationMs (the Observability
        // component's layer-(a), E21). toolCalls = the count of files canary wired.
        const result = await withRunLog(
          "instrument",
          () => instrumentService({ dir, otlp: flags.otlp, sentry: flags.sentry }),
          (r) => ({ toolCalls: r.wired.length, summary: { wired: r.wired, exporter: r.exporter.kind } }),
        );
        log.info("instrument complete", { wired: result.wired });
        emitResult(result, flags, renderHuman);
      });
    });
}
