/**
 * Shared types for the version-specific footgun audit (PLAN §4, brain/KNOWN-PITFALLS.md).
 *
 * Each detector encodes one pitfall from the brain, keyed by its §-ID, and returns
 * findings with {pitfall, file, line, severity}. canary's job (the §0 meta-pitfall):
 * "the default configuration ships the footgun — detect when a user is standing on one."
 */

/** Severity of a finding. "critical" findings are the ones the acceptance test forbids. */
export type Severity = "critical" | "warning" | "info";

/** One audit finding. */
export interface Finding {
  /** the brain §-ID this maps to, e.g. "§1b.3". */
  section: string;
  /** a stable, short pitfall slug, e.g. "traces-sample-rate-1.0". */
  pitfall: string;
  /** the file the finding was detected in (relative to the audited dir). */
  file: string;
  /** 1-based line number, or 0 if file-level. */
  line: number;
  severity: Severity;
  /** a one-line human explanation + the fix pointer. */
  message: string;
}

/** A file the scanner surfaces to detectors. */
export interface ScannedFile {
  /** path relative to the audited root. */
  rel: string;
  /** absolute path. */
  abs: string;
  /** file contents (text). */
  content: string;
  /** content split into lines (1-based via index+1). */
  lines: string[];
}

/** The corpus a detector audits: every text file under the target dir. */
export interface AuditContext {
  /** the audited root (absolute). */
  root: string;
  /** all scanned text files. */
  files: ScannedFile[];
}

/** A footgun detector: pure — given the corpus, return findings. */
export interface Detector {
  /** the brain §-ID, for traceability. */
  section: string;
  /** what it looks for, one line. */
  description: string;
  detect(ctx: AuditContext): Finding[];
}
