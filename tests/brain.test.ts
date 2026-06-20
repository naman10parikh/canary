import { describe, it, expect } from "vitest";
import { parseSearchOutput } from "../src/cli/commands/brain.js";

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
