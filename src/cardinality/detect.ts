/**
 * Unbounded-metric-label detection (brain/KNOWN-PITFALLS.md §5, S8, OPINIONS B3).
 *
 * "NEVER put unbounded cardinality (IDs, emails, URLs, paths) on a metric. Put it on a
 * trace/event." The canonical math: method(5) × status(5) × pod_id(1k) = 25k series; add
 * user_id(1M) → 25 BILLION series. An injectable unbounded label is also a DoS surface.
 *
 * This module is the shared core for BOTH `canary cardinality` (its own command) and the
 * audit's §5.1 detector. It is grep-based (offline, no network) and emits, per finding,
 * the OTel Collector processor config to strip the offending label + where the value
 * should live instead (a trace/event).
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { CanaryError } from "../lib/cli-result.js";

/** Label-name fragments whose value space is unbounded → must not be a metric dimension. */
const UNBOUNDED_LABELS = [
  "user_id",
  "userid",
  "request_id",
  "requestid",
  "trace_id", // on a METRIC (it belongs on the trace itself)
  "span_id", // OTel #44478
  "session_id",
  "email",
  "url.path",
  "url_path",
  "path", // full request path as a label
  "pod_id",
  "pod_name",
  "instance_id",
  "ip",
  "ip_address",
];

/** One unbounded-label finding. */
export interface CardinalityFinding {
  /** the offending label name as written. */
  label: string;
  file: string;
  line: number;
  /** where the value SHOULD live (always a trace/event). */
  belongsOn: "trace/event";
  /** the OTel Collector processor snippet to strip it. */
  collectorConfig: string;
}

/** Result of a cardinality scan. */
export interface CardinalityResult {
  dir: string;
  unboundedLabels: CardinalityFinding[];
  /** a single combined Collector config stripping all offenders (convenience). */
  collectorConfig: string;
}

/**
 * Heuristic: a line "declares a metric label" if it sets a label-like key to one of the
 * unbounded names in a metric/label context. We match:
 *   - `labelNames: ['user_id', ...]` / `labels: { user_id }` (prom-client style)
 *   - `.labels({ user_id: ... })` / `attributes: { 'user.id': ... }` on a counter/histogram
 *   - a PromQL `by (user_id)` / `{user_id="..."}` selector on a metric
 * To cut false positives we require the line to also look metric-related OR the label to
 * be inside an explicit label list.
 */
function lineFlagsLabel(line: string, label: string): boolean {
  const l = line.toLowerCase();
  const lab = label.toLowerCase();
  if (!l.includes(lab)) return false;
  // explicit label-list / labelNames / by(...) / {label="..."} contexts
  const labelContext =
    /labelnames\s*:|labels?\s*[:(]|by\s*\(|\{[^}]*=|histogram|counter|gauge|metric|\.observe\(|\.inc\(|\.labels\(/i.test(
      line,
    );
  // exclude obvious non-metric uses (a trace attribute, a log field, a SQL column)
  const traceOrLogContext =
    /span\.|setAttribute|trace|logger\.|console\.|select |insert |where /i.test(line);
  return labelContext && !traceOrLogContext;
}

function collectorSnippetFor(labels: string[]): string {
  const keys = labels.map((l) => `        - ${l}`).join("\n");
  return `# OTel Collector — strip unbounded label(s) BEFORE they exit the network (§5.1).
# Static drop-list is table stakes; for 2026 runtime defense add the Cardinality Guardian
# processor (HLL++) which surgically strips only the offending labels (§5.2).
processors:
  attributes/strip-unbounded:
    actions:
${keys.length > 0 ? keys.replace(/^        - /gm, "      - key: ").replace(/$/gm, "\n        action: delete").trimEnd() : "      # (no offenders)"}
# Move the high-cardinality value to a trace/event, where context belongs — not the metric.`;
}

/** Walk a dir (bounded) and collect text lines for the cardinality scan. */
function* iterLines(root: string): Generator<{ rel: string; line: number; text: string }> {
  const stack = [root];
  const skip = new Set(["node_modules", ".git", "dist", "build", ".next", ".otel-out"]);
  const exts = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".yml", ".yaml", ".promql", ".rules", ".json"]);
  let fileCount = 0;
  while (stack.length > 0 && fileCount < 5000) {
    const dir = stack.pop();
    if (dir === undefined) break;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      const abs = join(dir, entry);
      let st;
      try {
        st = statSync(abs);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        if (!skip.has(entry)) stack.push(abs);
        continue;
      }
      const dot = entry.lastIndexOf(".");
      if (dot < 0 || !exts.has(entry.slice(dot).toLowerCase())) continue;
      if (st.size > 2 * 1024 * 1024) continue;
      let content: string;
      try {
        content = readFileSync(abs, "utf8");
      } catch {
        continue;
      }
      fileCount++;
      const rel = relative(root, abs);
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        yield { rel, line: i + 1, text: lines[i] ?? "" };
      }
    }
  }
}

/** Detect unbounded metric labels under `dir`. */
export function detectCardinality(dir: string): CardinalityResult {
  let st;
  try {
    st = statSync(dir);
  } catch {
    throw new CanaryError("NOT_FOUND", `cardinality target does not exist: ${dir}`, { dir });
  }
  if (!st.isDirectory()) {
    throw new CanaryError("BAD_INPUT", `cardinality target is not a directory: ${dir}`, { dir });
  }

  const findings: CardinalityFinding[] = [];
  const seenLabels = new Set<string>();
  for (const { rel, line, text } of iterLines(dir)) {
    for (const label of UNBOUNDED_LABELS) {
      if (lineFlagsLabel(text, label)) {
        findings.push({
          label,
          file: rel,
          line,
          belongsOn: "trace/event",
          collectorConfig: collectorSnippetFor([label]),
        });
        seenLabels.add(label);
      }
    }
  }

  return {
    dir,
    unboundedLabels: findings,
    collectorConfig: collectorSnippetFor([...seenLabels]),
  };
}

export { UNBOUNDED_LABELS };
