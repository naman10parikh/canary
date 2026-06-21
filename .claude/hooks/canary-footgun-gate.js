#!/usr/bin/env node
/**
 * canary-footgun-gate — PreToolUse(Bash) hook · the dogfood gate (PLAN §3.5, B12).
 *
 * The observability employee obeys observability rules on its own repo: this hook blocks a
 * `git commit` that would introduce a footgun canary preaches against. It inspects the
 * STAGED ADDED LINES only (`git diff --cached`), so it gates exactly what is about to land —
 * not the working tree, not files canary already shipped.
 *
 * Footguns gated (each cites brain/KNOWN-PITFALLS.md §):
 *   §1b.3 / A-none  tracesSampleRate: 1.0 in a (non-test) config  → the Spans-quota bill bomb
 *   §4.1  / B8      a pino logger created with no `redact:` paths  → secrets leak into logs
 *   §5.1  / B3      an unbounded metric label (user_id/request_id) → 25B-series blowup + DoS
 *   §2.1  / A5      a rate/% alert with no `count(...) > N` floor   → the 3 AM page for nothing
 *
 * Self-reference guard: canary's OWN detector/test/brain/hook code legitimately contains these
 * strings (they are the detection patterns). Those paths are excluded so the gate never
 * self-blocks — it gates a *user's* footgun reaching a commit, not canary's description of it.
 *
 * Output contract (matches .claude/hooks/block-dangerous-commands.js):
 *   blocked  → { hookSpecificOutput: { hookEventName, permissionDecision: "deny", reason } }
 *   allowed  → "{}"
 * Log: ~/.claude/hooks-logs/canary-footgun-gate.log (JSONL).
 *
 * Wired in .claude/settings.json:
 *   "PreToolUse": [{ "matcher": "Bash",
 *     "hooks": [{ "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/canary-footgun-gate.js\"" }] }]
 */

import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";

const LOG_DIR = join(homedir(), ".claude", "hooks-logs");
const LOG_FILE = join(LOG_DIR, "canary-footgun-gate.log");

/** Append a JSONL record; never throw out of logging. */
function log(record) {
  try {
    mkdirSync(LOG_DIR, { recursive: true });
    appendFileSync(LOG_FILE, JSON.stringify({ ts: new Date().toISOString(), ...record }) + "\n");
  } catch {
    // Intentionally silent: logging must never block the commit path.
  }
}

/** Is this Bash command a `git commit` (the only thing this gate cares about)? */
function isGitCommit(cmd) {
  // matches `git commit`, `git -C x commit`, `git commit -m ...`, chained `&& git commit`.
  return /\bgit\b[^\n]*\bcommit\b/.test(cmd);
}

/**
 * Paths whose ADDED lines we ignore — canary's own footgun *descriptions* (detectors, tests,
 * fixtures, the brain corpus, hook source). These legitimately contain the trigger strings.
 */
function isSelfReference(file) {
  const f = file.toLowerCase();
  return (
    f.startsWith("src/audit/") ||
    f.startsWith("src/cardinality/") ||
    f.startsWith("src/delivery/") ||
    f.startsWith("src/slo/") ||
    f.startsWith(".claude/hooks/") ||
    f.startsWith("skills/") ||
    f.startsWith("brain/") ||
    f.startsWith("eval/") ||
    f.startsWith("tests/") ||
    f.includes(".test.") ||
    f.includes(".spec.") ||
    f.includes("/fixtures/") ||
    f.includes("/__fixtures__/")
  );
}

/** Test-ish file by name (within an otherwise-gated path) → skip. */
function looksLikeTest(file) {
  const f = file.toLowerCase();
  return f.includes(".test.") || f.includes(".spec.") || f.includes("/fixtures/");
}

/**
 * Collect staged ADDED lines, grouped by file, skipping self-reference paths.
 * Uses `git diff --cached --unified=0` and parses `+++ b/<file>` headers + `+`-prefixed adds.
 * Returns [] on any git failure (no repo, nothing staged) — fail-open, never block on infra.
 */
function stagedAddedLines(cwd) {
  let diff = "";
  try {
    diff = execFileSync("git", ["diff", "--cached", "--unified=0", "--no-color"], {
      cwd,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return []; // not a repo / nothing staged / git missing → fail open
  }

  const out = [];
  let currentFile = null;
  let skip = false;
  let hunkLine = 0;
  for (const raw of diff.split("\n")) {
    if (raw.startsWith("+++ ")) {
      // "+++ b/path" or "+++ /dev/null"
      const m = raw.match(/^\+\+\+ b\/(.+)$/);
      currentFile = m ? m[1] : null;
      skip = !currentFile || isSelfReference(currentFile) || looksLikeTest(currentFile);
      continue;
    }
    if (raw.startsWith("@@")) {
      // "@@ -a,b +c,d @@" — track the destination line number for added lines.
      const m = raw.match(/\+(\d+)/);
      hunkLine = m ? parseInt(m[1], 10) : 0;
      continue;
    }
    if (skip || !currentFile) continue;
    if (raw.startsWith("+") && !raw.startsWith("+++")) {
      out.push({ file: currentFile, line: hunkLine, text: raw.slice(1) });
      hunkLine++;
    }
    // context/removed lines don't advance the +counter under --unified=0 (0 context)
  }
  return out;
}

/**
 * The footgun detectors over staged added lines. Each returns a violation {section,id,reason}
 * or null. Mirrors src/audit/detectors so the gate and `canary audit` agree on what a footgun is.
 */
const DETECTORS = [
  // §1b.3 — tracesSampleRate: 1.0 (or 1) in a config. (canary audit src/audit/detectors/sentry-config.ts)
  {
    section: "§1b.3",
    id: "traces-sample-rate-1",
    reason:
      "tracesSampleRate: 1.0 captures every transaction → blows the Spans-quota bill in prod. Sample in prod (e.g. 0.1) or use tracesSampler; on SDK v9+ set 0 to disable.",
    test: (text) => /tracesSampleRate\s*:\s*1(?:\.0+)?\b/.test(text),
  },
  // §5.1 — an unbounded metric label (user_id/request_id/email/full path) on a metric.
  // Match common label-attribute shapes near a metric/label context to limit false positives.
  {
    section: "§5.1",
    id: "unbounded-metric-label",
    reason:
      "Unbounded metric label (user_id/request_id/email) → 25B-series blowup + a DoS surface. Move the value to a trace/event and strip it at the OTel Collector (attributes/filter processor).",
    test: (text) =>
      /\b(labelNames|labelnames|label_names)\b[^\n]*\b(user_id|request_id|userId|requestId|email|session_id|sessionId)\b/.test(
        text,
      ) ||
      /\b(?:labels|tags|attributes)\b[^\n]*[:=][^\n]*\b(user_id|request_id|email)\b/.test(text) ||
      /\b(counter|gauge|histogram|summary)\b[^\n]*\b(user_id|request_id|email)\b/i.test(text),
  },
  // §2.1 — a rate/percentage alert comparison with no volume floor *on the same added line*.
  {
    section: "§2.1",
    id: "rate-alert-no-volume-floor",
    reason:
      "Rate/percentage alert with no volume floor — at low volume 1 error in 3 = 33% = a page for nothing. Add `AND count(...) > N` (e.g. failure_rate > X% AND count(errors) > 100).",
    test: (text) => {
      const isRateCompare =
        /(failure_rate|error_rate|:ratio_rate)\s*[^\n]*[><]=?\s*0?\.\d+/i.test(text) ||
        /(failure_rate|error_rate)\b[^\n]*[><]=?\s*\d+\s*%/i.test(text);
      if (!isRateCompare) return false;
      const hasFloor =
        /count\s*\([^)]*\)\s*[><]=?\s*\d+/i.test(text) ||
        /_count\b[^\n]*[><]=?\s*\d+/i.test(text) ||
        /\band\b[\s\S]*[><]=?\s*\d+/i.test(text);
      return !hasFloor;
    },
  },
];

/**
 * §4.1 — a pino logger created with no `redact:` paths. This is a FILE-level check (the
 * `redact:` key may be on a different line than the `pino(` call), so it scans the whole
 * staged file's added lines: if any add introduces `pino(` and NO add in that file introduces
 * a `redact:` key, flag it.
 */
function checkPinoRedaction(added) {
  const byFile = new Map();
  for (const a of added) {
    if (!byFile.has(a.file)) byFile.set(a.file, []);
    byFile.get(a.file).push(a);
  }
  for (const [file, adds] of byFile) {
    const joined = adds.map((a) => a.text).join("\n");
    const createsPino = /\bpino\s*\(/.test(joined) || /from\s+["']pino["']/.test(joined);
    if (!createsPino) continue;
    const hasRedact = /\bredact\s*:/.test(joined);
    if (!hasRedact) {
      const at = adds.find((a) => /\bpino\s*\(/.test(a.text)) ?? adds[0];
      return {
        section: "§4.1",
        id: "pino-no-redaction",
        reason:
          "pino logger created with no `redact:` paths → auth tokens/cookies/passwords leak into logs (a security/GDPR incident). Add redact: ['req.headers.authorization','req.headers.cookie','*.password','*.token'].",
        file,
        line: at.line,
        text: at.text.trim(),
      };
    }
  }
  return null;
}

/** Scan all staged adds; return the FIRST violation (one block reason is enough). */
function findViolation(added) {
  for (const a of added) {
    for (const d of DETECTORS) {
      if (d.test(a.text)) {
        return { section: d.section, id: d.id, reason: d.reason, file: a.file, line: a.line, text: a.text.trim() };
      }
    }
  }
  return checkPinoRedaction(added);
}

async function main() {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;

  try {
    const data = JSON.parse(input || "{}");
    const { tool_name, tool_input, session_id, cwd } = data;
    if (tool_name !== "Bash") return process.stdout.write("{}");

    const cmd = tool_input?.command ?? "";
    if (!isGitCommit(cmd)) return process.stdout.write("{}");

    const workdir = cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
    const added = stagedAddedLines(workdir);
    if (added.length === 0) return process.stdout.write("{}");

    const violation = findViolation(added);
    if (violation) {
      log({ level: "BLOCKED", ...violation, session_id, cwd: workdir });
      return process.stdout.write(
        JSON.stringify({
          hookSpecificOutput: {
            hookEventName: "PreToolUse",
            permissionDecision: "deny",
            permissionDecisionReason: `🐤 canary footgun gate [${violation.id}] ${violation.file}:${violation.line} (${violation.section}) — ${violation.reason}`,
          },
        }),
      );
    }
    return process.stdout.write("{}");
  } catch (e) {
    log({ level: "ERROR", error: e?.message ?? String(e) });
    return process.stdout.write("{}"); // fail open — a hook bug must never block all commits
  }
}

main();
