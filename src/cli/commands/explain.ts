/**
 * `canary explain <S-id|§-id|A-id>` — print one scenario/pitfall/opinion by ID.
 *
 * Reads the matching section out of brain/ (detection + fix + source). The brain's three
 * ID families route to three files:
 *   - S1..S18  → BATTLE-TESTED-SCENARIOS.md (symptom/diagnosis/resolution/verify)
 *   - §N..     → KNOWN-PITFALLS.md (detect/avoid, version cutoffs)
 *   - A/B/C/D  → OPINIONS.md (the ALWAYS X / NEVER Y / because Z stances)
 * Read-only (PLAN §4).
 */

import { Command } from "commander";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { CanaryError, emitResult, runCommand, type OutputOptions } from "../../lib/cli-result.js";
import { findBrainRoot } from "../../lib/brain-paths.js";
import { logger } from "../../lib/logger.js";

export interface ExplainResult {
  id: string;
  source: string; // brain file the section came from
  heading: string;
  body: string; // the section text (heading → next sibling heading)
}

/** Which brain file(s) to search for a given ID, in priority order. */
function candidateFiles(id: string): string[] {
  const up = id.toUpperCase();
  if (/^S\d+$/.test(up)) return ["BATTLE-TESTED-SCENARIOS.md"];
  if (id.startsWith("§") || /^\d/.test(id)) return ["KNOWN-PITFALLS.md"];
  if (/^[A-D]\d+$/.test(up)) return ["OPINIONS.md"];
  // unknown shape: search all three, scenarios first
  return ["BATTLE-TESTED-SCENARIOS.md", "KNOWN-PITFALLS.md", "OPINIONS.md"];
}

/** Build a regex that matches a heading line introducing the given ID. */
function headingMatcher(id: string): RegExp {
  // strip a leading § for the numeric form; escape regex metachars in the remainder.
  const core = id.replace(/^§/, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // match e.g. "## S5 — ...", "### A4. ...", "## §1b.3 ...", "### 1b.3 ..."
  return new RegExp(`^#{1,4}\\s+§?${core}\\b`, "i");
}

/** Extract the section starting at a matching heading up to the next heading of ≤ level. */
function extractSection(content: string, matcher: RegExp): { heading: string; body: string } | null {
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

function renderHuman(r: ExplainResult): string {
  return [`canary explain ${r.id}  (${r.source})`, "", r.body].join("\n");
}

export function registerExplain(program: Command): void {
  program
    .command("explain")
    .description("Print a scenario/pitfall/opinion by ID (S5 | §1b.3 | A4) with detection + fix + source.")
    .argument("<id>", "the brain ID, e.g. S5, §1b.3, A4")
    .option("--json", "emit the result as a single JSON object")
    .action(async (id: string, flags: OutputOptions) => {
      await runCommand("explain", () => {
        const root = findBrainRoot();
        const matcher = headingMatcher(id);
        for (const file of candidateFiles(id)) {
          const path = join(root, "brain", file);
          if (!existsSync(path)) continue;
          const section = extractSection(readFileSync(path, "utf8"), matcher);
          if (section) {
            logger.child({ cmd: "explain" }).info("explained", { id, source: file });
            emitResult(
              { id, source: `brain/${file}`, heading: section.heading, body: section.body },
              flags,
              renderHuman,
            );
            return;
          }
        }
        throw new CanaryError("NOT_FOUND", `no brain section found for id: ${id}`, { id });
      });
    });
}
