#!/usr/bin/env node
/**
 * assert-no-critical-footguns — the audit half of the acceptance test (PLAN §5 step 6).
 *
 * Consumes `canary audit <dir> --json` on STDIN and exits:
 *   - 0  if the audit reports ZERO `critical` findings (canary's own instrumentation passes
 *        its own audit — the clean-fixture gate).
 *   - 1  if any `critical` finding is present (the broken-fixture case), printing them.
 *
 * Usage: canary audit eval/fixtures/sample-service --json | node eval/assert-no-critical-footguns.mjs
 */

function readStdin() {
  return new Promise((resolveStdin) => {
    let buf = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (d) => (buf += d));
    process.stdin.on("end", () => resolveStdin(buf));
  });
}

const raw = await readStdin();
let report;
try {
  report = JSON.parse(raw.trim());
} catch {
  process.stderr.write(`${JSON.stringify({ level: "error", msg: "stdin was not valid JSON from `canary audit --json`", got: raw.slice(0, 200) })}\n`);
  process.exit(1);
}

const findings = Array.isArray(report.findings) ? report.findings : [];
const critical = findings.filter((f) => f && f.severity === "critical");

if (critical.length > 0) {
  process.stderr.write(`${JSON.stringify({ level: "error", msg: "critical footguns present", count: critical.length, sections: [...new Set(critical.map((f) => f.section))] })}\n`);
  for (const f of critical) {
    process.stderr.write(`${JSON.stringify({ section: f.section, pitfall: f.pitfall, file: f.file, line: f.line })}\n`);
  }
  process.exit(1);
}

process.stdout.write(`${JSON.stringify({ level: "info", msg: "no critical footguns — clean", findings: findings.length })}\n`);
process.exit(0);
