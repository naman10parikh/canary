/**
 * Brain operations as reusable functions (search + explain) — the callable core that BOTH
 * the `canary brain`/`canary explain` CLI and the MCP `search_brain`/`explain_pitfall`
 * tools use. The CLI commands keep their own thin command wrappers (registerBrain /
 * registerExplain); this module is the function-level surface the MCP server wraps without
 * spawning a subprocess of itself.
 *
 * searchBrain reuses scripts/memory-search.sh (the BM25 layer, A4b) + the same hit parser
 * the CLI uses (parseSearchOutput); explainId reuses the same brain-file extraction the CLI
 * uses. Read-only over brain/ (HARNESS-OVERRIDES §2: the queryable layer indexes the
 * expertise brain, not code history).
 */

import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { CanaryError } from "../../lib/cli-result.js";
import { findBrainRoot, brainSearchScript } from "../../lib/brain-paths.js";
import { parseSearchOutput, type BrainHit } from "../../cli/commands/brain.js";

/** Run the BM25 brain search and return ranked hits (the search_brain MCP tool core). */
export function searchBrain(query: string, limit = 5): BrainHit[] {
  const root = findBrainRoot();
  const script = brainSearchScript(root);
  const safeLimit = String(Number(limit) || 5);
  const res = spawnSync("bash", [script, query, "--limit", safeLimit], {
    cwd: root,
    encoding: "utf8",
  });
  if (res.error || res.status !== 0) {
    throw new CanaryError("EXTERNAL", "brain search failed", {
      error: res.error?.message,
      stderr: res.stderr?.slice(0, 300),
    });
  }
  return parseSearchOutput(res.stdout);
}

/** One explained brain section (the explain_pitfall MCP tool return). */
export interface ExplainResult {
  id: string;
  source: string;
  heading: string;
  body: string;
}

/** Which brain file(s) to search for a given ID, in priority order (mirrors the CLI). */
function candidateFiles(id: string): string[] {
  const up = id.toUpperCase();
  if (/^S\d+$/.test(up)) return ["BATTLE-TESTED-SCENARIOS.md"];
  if (id.startsWith("§") || /^\d/.test(id)) return ["KNOWN-PITFALLS.md"];
  if (/^[A-D]\d+$/.test(up)) return ["OPINIONS.md"];
  return ["BATTLE-TESTED-SCENARIOS.md", "KNOWN-PITFALLS.md", "OPINIONS.md"];
}

/** Build a regex matching the heading line introducing the given ID. */
function headingMatcher(id: string): RegExp {
  const core = id.replace(/^§/, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^#{1,4}\\s+§?${core}\\b`, "i");
}

/** Extract the section from a matching heading up to the next heading of ≤ level. */
function extractSection(
  content: string,
  matcher: RegExp,
): { heading: string; body: string } | null {
  const lines = content.split("\n");
  let startIdx = -1;
  let startLevel = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (matcher.test(line)) {
      startIdx = i;
      startLevel = (/^(#+)/.exec(line)?.[1] ?? "#").length;
      break;
    }
  }
  if (startIdx < 0) return null;

  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    const m = /^(#{1,4})\s+/.exec(lines[i] ?? "");
    if (m && (m[1]?.length ?? 99) <= startLevel) {
      endIdx = i;
      break;
    }
  }
  const block = lines.slice(startIdx, endIdx);
  const heading = (block[0] ?? "").replace(/^#+\s+/, "").trim();
  const body = block.join("\n").trim();
  return { heading, body };
}

/** Explain a scenario/pitfall/opinion by ID (the explain_pitfall MCP tool core). */
export function explainId(id: string): ExplainResult {
  const root = findBrainRoot();
  const matcher = headingMatcher(id);
  for (const file of candidateFiles(id)) {
    const path = join(root, "brain", file);
    if (!existsSync(path)) continue;
    const section = extractSection(readFileSync(path, "utf8"), matcher);
    if (section) {
      return { id, source: `brain/${file}`, heading: section.heading, body: section.body };
    }
  }
  throw new CanaryError("NOT_FOUND", `no brain section found for id: ${id}`, { id });
}
