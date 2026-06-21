/**
 * The dogfooded run-log — canary emits its OWN actions as a Majors-shaped wide event.
 *
 * This is the Observability component's layer (a): canary preaches "structured-from-birth
 * wide events, a TRACE not just a LOG" (brain/OPINIONS.md C1 + D5) — so its CLI dogfoods
 * exactly that. Every appended record is ONE append-only JSONL line carrying:
 *   - `trace.id`    — a real OTel-shaped 32-hex trace id (NOT an all-zero `field-00` marker)
 *   - `durationMs`  — the MEASURED wall-clock of the run (NOT a hardcoded 0)
 *   - `model`       — the model the run executed under (D14: opus-4.8; read from env)
 *   - `toolCalls`   — a count of the discrete operations the run performed
 *   - command + outcome + a small command-specific summary bag
 *
 * HARNESS-OVERRIDES "Observability": ✅ requires a real entry (model+duration+trace.id),
 * NOT the all-zero markers the seed scaffold shipped. The trail is append-only so a reader
 * (the cockpit Run-log view, G28) can `tail` it. Zero external deps — a logger that can
 * crash the thing it watches is the §9.3 footgun.
 */

import { appendFile, mkdir } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { resolve, dirname } from "node:path";

/** The append-only run-log path, relative to the repo root (resolved at call time). */
const RUNS_LOG_REL = "logs/runs.jsonl";

/** One run-log record — the wide event (a TRACE, per OPINIONS D5). */
export interface RunRecord {
  /** ISO-8601 timestamp of when the run completed. */
  ts: string;
  /** the canary command that ran (e.g. "instrument"). */
  command: string;
  /** a real OTel-shaped trace id (32 lowercase hex). Dotted key, the OTel convention. */
  "trace.id": string;
  /** the MEASURED wall-clock duration of the run, in milliseconds (> 0). */
  durationMs: number;
  /** the model the run executed under (D14: always opus-4.8; read from env). */
  model: string;
  /** the count of discrete operations the run performed. */
  toolCalls: number;
  /** "ok" | "error" — whether the wrapped action threw. */
  outcome: "ok" | "error";
  /** a small command-specific summary (e.g. {wired:[...]}) — bounded, no secrets. */
  summary?: Record<string, unknown>;
}

/** A real OTel-shaped trace id: 16 random bytes → 32 lowercase hex chars (never all-zero). */
export function newTraceId(): string {
  return randomBytes(16).toString("hex");
}

/**
 * The model this run executes under. Per D14 the fleet is always Opus 4.8; we read the
 * ambient `ANTHROPIC_MODEL` (set by the budget-manager tier) and fall back to the locked
 * default so the field is never empty. This is a recorded fact, not a routing decision.
 */
export function resolveRunModel(): string {
  const fromEnv = process.env.ANTHROPIC_MODEL;
  if (typeof fromEnv === "string" && fromEnv.trim().length > 0) return fromEnv.trim();
  return "claude-opus-4-8[1m]";
}

/** Resolve the absolute runs.jsonl path. Honors CANARY_RUNS_LOG for tests/CI isolation. */
function runsLogPath(): string {
  const override = process.env.CANARY_RUNS_LOG;
  if (typeof override === "string" && override.trim().length > 0) return resolve(override.trim());
  return resolve(process.cwd(), RUNS_LOG_REL);
}

/** Append one record to the run-log (append-only; creates logs/ if needed). */
export async function appendRunRecord(record: RunRecord): Promise<void> {
  const path = runsLogPath();
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, `${JSON.stringify(record)}\n`, "utf8");
}

/**
 * Wrap a command action with run-logging: start a high-resolution timer + a fresh trace id,
 * run the action, then append ONE wide-event record with the measured duration and outcome.
 * The action's return value is passed through unchanged; a throw is recorded as
 * `outcome:"error"` and re-thrown (so the CLI's typed-error handling still applies).
 *
 * `toolCalls` and `summary` are derived from the action's result via the optional `meta`
 * function, so the record carries real command-specific shape (e.g. how many files were wired).
 */
export async function withRunLog<T>(
  command: string,
  action: () => Promise<T>,
  meta?: (result: T) => { toolCalls: number; summary?: Record<string, unknown> },
): Promise<T> {
  const traceId = newTraceId();
  const startNs = process.hrtime.bigint();
  const model = resolveRunModel();
  try {
    const result = await action();
    const durationMs = elapsedMs(startNs);
    const derived = meta?.(result);
    await appendRunRecord({
      ts: new Date().toISOString(),
      command,
      "trace.id": traceId,
      durationMs,
      model,
      toolCalls: derived?.toolCalls ?? 1,
      outcome: "ok",
      summary: derived?.summary,
    });
    return result;
  } catch (err) {
    const durationMs = elapsedMs(startNs);
    await appendRunRecord({
      ts: new Date().toISOString(),
      command,
      "trace.id": traceId,
      durationMs,
      model,
      toolCalls: 1,
      outcome: "error",
      summary: { error: err instanceof Error ? err.message : String(err) },
    });
    throw err;
  }
}

/** Milliseconds elapsed since a hrtime.bigint() mark, clamped to a positive minimum. */
function elapsedMs(startNs: bigint): number {
  const deltaNs = process.hrtime.bigint() - startNs;
  const ms = Number(deltaNs) / 1e6;
  // A real run is never 0ms; guard the (impossible-in-practice) sub-nanosecond case so the
  // `durationMs > 0` invariant the verify asserts always holds.
  return ms > 0 ? ms : 0.001;
}

export { runsLogPath, RUNS_LOG_REL };
