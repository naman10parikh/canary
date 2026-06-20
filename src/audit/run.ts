/**
 * The audit runner — scan a directory, run every footgun detector, aggregate findings.
 *
 * Findings are keyed by §-ID with {pitfall, file, line, severity} (PLAN §4). The audit is
 * fully grep-based and offline (PLAN §9 chaos: no-network must work). The presence of any
 * `critical` finding is what the acceptance test's `assert-no-critical-footguns` gate reads.
 */

import { resolve } from "node:path";
import { scanDir } from "./scanner.js";
import { ALL_DETECTORS } from "./detectors/index.js";
import type { AuditContext, Finding } from "./types.js";

/** The structured audit result (the `--json` contract). */
export interface AuditResult {
  dir: string;
  /** every finding, sorted by §-ID then file then line. */
  findings: Finding[];
  /** count by severity. */
  summary: { critical: number; warning: number; info: number; total: number };
  /** the §-IDs that fired (deduped). */
  sectionsTriggered: string[];
  /** convenience: true if any critical finding was found. */
  hasCritical: boolean;
}

/** Run the full audit over `dir`. */
export function runAudit(dir: string): AuditResult {
  const root = resolve(dir);
  const files = scanDir(root);
  const ctx: AuditContext = { root, files };

  const findings: Finding[] = [];
  for (const detector of ALL_DETECTORS) {
    findings.push(...detector.detect(ctx));
  }

  findings.sort((a, b) => {
    if (a.section !== b.section) return a.section.localeCompare(b.section);
    if (a.file !== b.file) return a.file.localeCompare(b.file);
    return a.line - b.line;
  });

  const summary = { critical: 0, warning: 0, info: 0, total: findings.length };
  for (const f of findings) summary[f.severity]++;

  const sectionsTriggered = [...new Set(findings.map((f) => f.section))].sort();

  return {
    dir: root,
    findings,
    summary,
    sectionsTriggered,
    hasCritical: summary.critical > 0,
  };
}
