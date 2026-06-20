/**
 * Locate canary's brain corpus + the BM25 search script at runtime.
 *
 * `canary brain` and `canary explain` read the six brain/ artifacts (the Memory component
 * over the expertise corpus, NOT code history — HARNESS-OVERRIDES §2). The dist runs from
 * dist/cli/commands/, so we walk up to the repo root (the dir holding brain/ + scripts/).
 */

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { CanaryError } from "./cli-result.js";

/** Walk up from the running module to find the dir containing `brain/`. */
export function findBrainRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, "brain", "BATTLE-TESTED-SCENARIOS.md"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // Fallback: the current working directory (when run in-repo via `node dist/...`).
  if (existsSync(join(process.cwd(), "brain", "BATTLE-TESTED-SCENARIOS.md"))) {
    return process.cwd();
  }
  throw new CanaryError(
    "NOT_FOUND",
    "could not locate canary's brain/ corpus (looked up the module tree and cwd)",
  );
}

/** Absolute path to the BM25 search script (scripts/memory-search.sh). */
export function brainSearchScript(root: string): string {
  const script = join(root, "scripts", "memory-search.sh");
  if (!existsSync(script)) {
    throw new CanaryError(
      "NOT_FOUND",
      `the BM25 search script is missing: ${script} (the 'canary brain' search layer)`,
      { script },
    );
  }
  return script;
}

/** The six brain artifacts, in a stable order. */
export const BRAIN_FILES = [
  "EXPERTISE-MAP.md",
  "OPINIONS.md",
  "KNOWN-PITFALLS.md",
  "BATTLE-TESTED-SCENARIOS.md",
  "TOOL-MATRIX.md",
  "GAPS-AND-DISPUTES.md",
] as const;
