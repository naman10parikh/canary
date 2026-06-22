import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { parseSearchOutput } from "../src/cli/commands/brain.js";

const CLI = resolve(__dirname, "..", "dist", "cli", "index.js");

describe("brain search-output parser (B10)", () => {
  it("extracts ranked hits with file, score, and the S-/§-/A- id from the heading", () => {
    const stdout = [
      "=== Memory Search: \"page never delivered\" ===",
      "",
      "[1] brain/BATTLE-TESTED-SCENARIOS.md (score: 1800)",
      "    ---",
      "    ## S5 — The page that never delivered: monitor your alert pipeline `[design]`",
      "    ---",
      "",
      "[2] brain/OPINIONS.md (score: 1440)",
      "    ---",
      "    ### A4. ALWAYS test the alert DELIVERY path end-to-end.",
      "    ---",
      "",
      "[3] brain/KNOWN-PITFALLS.md (score: 900)",
      "    ## §1b.3 tracesSampleRate footgun",
    ].join("\n");
    const hits = parseSearchOutput(stdout);
    expect(hits).toHaveLength(3);
    expect(hits[0]).toMatchObject({ rank: 1, file: "brain/BATTLE-TESTED-SCENARIOS.md", id: "S5" });
    expect(hits[1]).toMatchObject({ rank: 2, file: "brain/OPINIONS.md", id: "A4" });
    expect(hits[2]?.id).toBe("§1b.3");
  });

  it("returns an empty array when there are no hits", () => {
    expect(parseSearchOutput("=== Memory Search ===\n\nNo results.\n")).toEqual([]);
  });
});

describe("brain CLI empty-query guard (T-user)", () => {
  // Was: an empty/whitespace query leaked `TERMS[@]: unbound variable` as a cryptic EXTERNAL
  // error. Now it must be a clean BAD_INPUT (exit 2) BEFORE shelling out to memory-search.sh.
  it.runIf(existsSync(CLI))("rejects an empty query with BAD_INPUT (exit 2), not a shell crash", () => {
    const res = spawnSync("node", [CLI, "brain", "", "--json"], { encoding: "utf8" });
    expect(res.status).toBe(2);
    expect(res.stderr).toContain("BAD_INPUT");
    expect(res.stderr).not.toContain("unbound variable");
  });
});
