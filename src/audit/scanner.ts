/**
 * The audit file scanner — walks a target directory once and surfaces every text file to
 * the detectors. Skips node_modules/.git/dist/build and obvious binaries. Bounded so a
 * malformed input can't hang the audit (PLAN §9 chaos: "a typed error, not a crash";
 * "no-network: the audit is grep-based, fully local").
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { CanaryError } from "../lib/cli-result.js";
import type { ScannedFile } from "./types.js";

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "coverage",
  ".otel-out",
]);

const TEXT_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  ".yml",
  ".yaml",
  ".toml",
  ".env",
  ".example",
  ".md",
  ".promql",
  ".rules",
]);

const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2MB — skip anything larger (likely generated/binary)
const MAX_FILES = 5000; // bound the walk

function hasTextExtension(name: string): boolean {
  const dot = name.lastIndexOf(".");
  if (dot < 0) return false;
  return TEXT_EXTENSIONS.has(name.slice(dot).toLowerCase());
}

/** Recursively collect text files under `root`. */
export function scanDir(root: string): ScannedFile[] {
  let rootStat;
  try {
    rootStat = statSync(root);
  } catch {
    throw new CanaryError("NOT_FOUND", `audit target does not exist: ${root}`, { root });
  }
  if (!rootStat.isDirectory()) {
    throw new CanaryError("BAD_INPUT", `audit target is not a directory: ${root}`, { root });
  }

  const out: ScannedFile[] = [];
  const stack: string[] = [root];

  while (stack.length > 0 && out.length < MAX_FILES) {
    const dir = stack.pop();
    if (dir === undefined) break;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      continue; // unreadable dir — skip, don't crash
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
        if (!SKIP_DIRS.has(entry)) stack.push(abs);
        continue;
      }
      if (!st.isFile() || st.size > MAX_FILE_BYTES) continue;
      if (!hasTextExtension(entry)) continue;
      let content: string;
      try {
        content = readFileSync(abs, "utf8");
      } catch {
        continue;
      }
      out.push({
        rel: relative(root, abs),
        abs,
        content,
        lines: content.split("\n"),
      });
    }
  }
  return out;
}
