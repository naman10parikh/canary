/**
 * canary's own structured logger — the dogfood.
 *
 * Per brain/OPINIONS.md B7 ("structured wide events, not console.log prose") and D5
 * (canary dogfoods the discipline it preaches), canary's CLI never emits prose to a
 * data stream. Diagnostics go to STDERR as structured JSON lines; the command RESULT
 * goes to STDOUT (see emitJson) so `--json` output is always cleanly parseable.
 *
 * Per OPINIONS B8 ("never ship a logger that can leak tokens"), this logger redacts a
 * fixed set of sensitive key names before serializing — mirroring Energy's
 * browser-agent-security.md Rule 12. Zero external deps (a logger that can crash the
 * thing it watches is the §9.3 footgun); this is the cheap local trail, not pino itself.
 */

/** Log levels, ordered low→high severity. */
export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

/** Key-name fragments whose values are redacted before serialization (OPINIONS B8). */
const REDACT_FRAGMENTS = [
  "token",
  "secret",
  "password",
  "authorization",
  "cookie",
  "apikey",
  "api_key",
  "dsn",
  "routing_key",
];

const REDACTED = "[REDACTED]";

/** A structured field bag attached to a log line. */
export type Fields = Record<string, unknown>;

function shouldRedact(key: string): boolean {
  const lower = key.toLowerCase();
  return REDACT_FRAGMENTS.some((frag) => lower.includes(frag));
}

/** Deep-redact sensitive values by key name; bounded depth to avoid pathological input. */
function redact(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = shouldRedact(k) ? REDACTED : redact(v, depth + 1);
  }
  return out;
}

function resolveThreshold(): LogLevel {
  const raw = (process.env.CANARY_LOG_LEVEL ?? "info").toLowerCase();
  if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") return raw;
  return "info";
}

/**
 * A minimal structured logger. One method per level; every line is a single JSON
 * object on STDERR with a timestamp, level, message, and any redacted fields.
 */
export class Logger {
  private readonly threshold: number;
  private readonly base: Fields;

  constructor(base: Fields = {}) {
    this.threshold = LEVEL_RANK[resolveThreshold()];
    this.base = base;
  }

  /** Return a child logger carrying additional base fields (e.g. the command name). */
  child(fields: Fields): Logger {
    return new Logger({ ...this.base, ...fields });
  }

  private write(level: LogLevel, msg: string, fields?: Fields): void {
    if (LEVEL_RANK[level] < this.threshold) return;
    const line = {
      ts: new Date().toISOString(),
      level,
      msg,
      ...(redact(this.base) as Fields),
      ...(fields ? (redact(fields) as Fields) : {}),
    };
    process.stderr.write(`${JSON.stringify(line)}\n`);
  }

  debug(msg: string, fields?: Fields): void {
    this.write("debug", msg, fields);
  }
  info(msg: string, fields?: Fields): void {
    this.write("info", msg, fields);
  }
  warn(msg: string, fields?: Fields): void {
    this.write("warn", msg, fields);
  }
  error(msg: string, fields?: Fields): void {
    this.write("error", msg, fields);
  }
}

/** The default process logger. Commands derive children via `logger.child({ cmd })`. */
export const logger = new Logger();
