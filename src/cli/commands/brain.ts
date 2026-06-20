/**
 * `canary brain <query>` — BM25 search over brain/ (the Memory CLI surface, A4b/B10).
 *
 * Thin wrapper over scripts/memory-search.sh (the BM25-style ranked search adapted to
 * index brain/ at weight 5, surfacing each hit's S-/§-/A- heading). HARNESS-OVERRIDES §2
 * requires a REAL ranked search layer — a MEMORY.md + grep alone is only 🟡. Returns ranked
 * hits with the file + the matched section ID.
 */

import { Command } from "commander";
import { spawnSync } from "node:child_process";
import { CanaryError, emitResult, runCommand, type OutputOptions } from "../../lib/cli-result.js";
import { findBrainRoot, brainSearchScript } from "../../lib/brain-paths.js";
import { logger } from "../../lib/logger.js";

interface BrainFlags extends OutputOptions {
  limit?: string;
}

/** One ranked search hit. */
export interface BrainHit {
  rank: number;
  file: string; // e.g. brain/BATTLE-TESTED-SCENARIOS.md
  score: number;
  /** the matched section ID (S5 / §1b.3 / A4), if a heading was surfaced. */
  id: string | null;
  /** the matched heading text. */
  heading: string | null;
}

export interface BrainResult {
  query: string;
  hits: BrainHit[];
}

/** Pull an S-/§-/A- ID out of a brain heading line. */
function extractId(heading: string): string | null {
  // S-IDs: "## S5 — ..."; §-IDs: "## §1b.3 ..." or "### 1b.3"; A-IDs: "### A4. ..."
  const s = /\bS(\d+)\b/.exec(heading);
  if (s) return `S${s[1]}`;
  const section = /§\s*([0-9][0-9a-z.]*)/i.exec(heading);
  if (section) return `§${section[1]}`;
  const letter = /\b([A-D]\d+)\b/.exec(heading); // A1..D7 opinion IDs
  if (letter && letter[1]) return letter[1];
  return null;
}

/** Parse the memory-search.sh stdout into ranked hits. */
export function parseSearchOutput(stdout: string): BrainHit[] {
  const hits: BrainHit[] = [];
  const lines = stdout.split("\n");
  let current: BrainHit | null = null;
  for (const line of lines) {
    const header = /^\[(\d+)\]\s+(\S+)\s+\(score:\s*([\d.]+)\)/.exec(line);
    if (header) {
      if (current) hits.push(current);
      current = {
        rank: Number(header[1] ?? "0"),
        file: header[2] ?? "",
        score: Number(header[3] ?? "0"),
        id: null,
        heading: null,
      };
      continue;
    }
    if (current && current.heading === null) {
      // first markdown heading after the header line is the matched section
      const h = /^\s*(#{1,4}\s+.+)$/.exec(line);
      if (h && h[1]) {
        current.heading = h[1].replace(/^#+\s+/, "").trim();
        current.id = extractId(current.heading);
      }
    }
  }
  if (current) hits.push(current);
  return hits;
}

function renderHuman(r: BrainResult): string {
  if (r.hits.length === 0) return `canary brain "${r.query}" → no hits`;
  const lines = [`canary brain "${r.query}" → ${r.hits.length} hit(s)`];
  for (const h of r.hits) {
    const id = h.id ? `${h.id} ` : "";
    lines.push(`  [${h.rank}] ${id}${h.file}  (score ${h.score})`);
    if (h.heading) lines.push(`       ${h.heading}`);
  }
  return lines.join("\n");
}

export function registerBrain(program: Command): void {
  program
    .command("brain")
    .description("BM25 search over brain/ — ranked pitfalls/scenarios/opinions (the Memory CLI).")
    .argument("<query...>", "the search query")
    .option("--limit <n>", "max hits to return", "5")
    .option("--json", "emit the ranked hits as a single JSON object")
    .action(async (queryParts: string[], flags: BrainFlags) => {
      await runCommand("brain", () => {
        const query = queryParts.join(" ");
        const root = findBrainRoot();
        const script = brainSearchScript(root);
        const limit = String(Number(flags.limit ?? "5") || 5);
        const res = spawnSync("bash", [script, query, "--limit", limit], {
          cwd: root,
          encoding: "utf8",
        });
        if (res.error || res.status !== 0) {
          throw new CanaryError("EXTERNAL", "brain search failed", {
            error: res.error?.message,
            stderr: res.stderr?.slice(0, 300),
          });
        }
        const hits = parseSearchOutput(res.stdout);
        logger.child({ cmd: "brain" }).info("brain search complete", {
          query,
          hits: hits.length,
        });
        emitResult({ query, hits }, flags, renderHuman);
      });
    });
}
