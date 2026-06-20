/**
 * The CLI result envelope + the typed-error contract shared by every `canary` command.
 *
 * Contract (PLAN §3 component 4): exit 0 on success, non-zero on error; data commands
 * support `--json` and emit ONE parseable JSON object on STDOUT. Diagnostics go to STDERR
 * via the logger — never mixed into the STDOUT data stream — so `... --json | jq` is safe.
 *
 * Errors are typed (a Result<T,E>-style discipline per .claude/rules/typescript.md): a
 * command throws a CanaryError with a stable `code`; runCommand maps it to a non-zero exit
 * and a structured stderr line. The chaos contract (PLAN §9) requires "a typed error, not
 * a crash" on malformed input — CanaryError is that type.
 */

import { logger } from "./logger.js";

/** Stable machine-readable failure codes (used in tests + the MCP error mapping). */
export type CanaryErrorCode =
  | "BAD_INPUT" // malformed args / unparseable config / missing required flag
  | "NOT_FOUND" // a referenced file/dir/id does not exist
  | "AUDIT_FAILED" // an audit/assertion gate found a blocking finding (non-zero by design)
  | "DELIVERY_DEAD" // a notification channel could not be reached
  | "EXTERNAL" // an external tool/process (promtool, a network call) failed
  | "INTERNAL"; // an unexpected internal condition

/** The one error type canary commands throw. Carries an exit code + optional details. */
export class CanaryError extends Error {
  readonly code: CanaryErrorCode;
  readonly exitCode: number;
  readonly details?: Record<string, unknown>;

  constructor(
    code: CanaryErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "CanaryError";
    this.code = code;
    this.details = details;
    // BAD_INPUT/NOT_FOUND are usage errors (exit 2); AUDIT_FAILED/DELIVERY_DEAD are
    // intentional gate failures (exit 1); everything else is exit 1.
    this.exitCode = code === "BAD_INPUT" || code === "NOT_FOUND" ? 2 : 1;
  }
}

/** Options shared by data commands. */
export interface OutputOptions {
  json?: boolean;
}

/**
 * Emit a command result. With `--json`, writes the value as a single JSON line to STDOUT.
 * Without `--json`, calls the provided human renderer (also STDOUT). The JSON form is the
 * agent-facing contract; the human form is for a person reading a terminal.
 */
export function emitResult<T>(
  value: T,
  opts: OutputOptions,
  renderHuman: (value: T) => string,
): void {
  if (opts.json) {
    process.stdout.write(`${JSON.stringify(value)}\n`);
    return;
  }
  process.stdout.write(`${renderHuman(value)}\n`);
}

/**
 * Wrap a command action so any thrown CanaryError becomes a structured stderr line + a
 * deterministic exit code, and any unexpected throw becomes an INTERNAL error (never a
 * raw stack dump to a user). This is the single place exit codes are set.
 */
export async function runCommand(
  cmd: string,
  action: () => Promise<void> | void,
): Promise<void> {
  const log = logger.child({ cmd });
  try {
    await action();
  } catch (err) {
    if (err instanceof CanaryError) {
      log.error(err.message, { code: err.code, details: err.details });
      process.exitCode = err.exitCode;
      return;
    }
    const message = err instanceof Error ? err.message : String(err);
    log.error("unexpected error", { code: "INTERNAL", error: message });
    process.exitCode = 1;
  }
}
