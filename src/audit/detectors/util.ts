/**
 * Shared helpers for line-oriented footgun detectors. Pure functions: each scans the
 * already-read file corpus (no I/O) so detectors stay fast, testable, and offline.
 */

import type { AuditContext, Finding, ScannedFile, Severity } from "../types.js";

/** Test whether a filename looks like a production/config file (vs a test fixture). */
export function looksProd(rel: string): boolean {
  const lower = rel.toLowerCase();
  if (lower.includes(".test.") || lower.includes(".spec.") || lower.includes("/test/")) {
    return false;
  }
  return true;
}

/** Find every line matching `re` across the corpus, building a finding via `make`. */
export function matchLines(
  ctx: AuditContext,
  re: RegExp,
  make: (file: ScannedFile, lineNo: number, lineText: string) => Finding | null,
): Finding[] {
  const findings: Finding[] = [];
  for (const file of ctx.files) {
    for (let i = 0; i < file.lines.length; i++) {
      const text = file.lines[i] ?? "";
      // reset lastIndex for global regexes used with .test()
      re.lastIndex = 0;
      if (re.test(text)) {
        const finding = make(file, i + 1, text);
        if (finding) findings.push(finding);
      }
    }
  }
  return findings;
}

/** True if any file in the corpus contains a regex match (file-level signal). */
export function corpusHas(ctx: AuditContext, re: RegExp): boolean {
  for (const file of ctx.files) {
    re.lastIndex = 0;
    if (re.test(file.content)) return true;
  }
  return false;
}

/** Build a finding helper with the common shape. */
export function finding(
  section: string,
  pitfall: string,
  file: ScannedFile,
  line: number,
  severity: Severity,
  message: string,
): Finding {
  return { section, pitfall, file: file.rel, line, severity, message };
}
