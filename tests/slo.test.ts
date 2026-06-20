import { describe, it, expect } from "vitest";
import { generateSloRules } from "../src/slo/sloth-gen.js";
import { CanaryError } from "../src/lib/cli-result.js";

describe("MWMBR SLO generator (S6)", () => {
  it("computes a clean error budget free of IEEE-754 noise", () => {
    const r = generateSloRules({ service: "api", target: 99.9 });
    expect(r.budget).toBe(0.001);
  });

  it("emits the three MWMBR tiers with the 14.4x / 6x / 1x burn rates", () => {
    const r = generateSloRules({ service: "api", target: 99.9 });
    expect(r.alertRules).toEqual([
      "ErrorBudgetBurn_Fast",
      "ErrorBudgetBurn_Medium",
      "ErrorBudgetBurn_Slow",
    ]);
    expect(r.yaml).toContain("14.4");
    expect(r.yaml).toContain("(6 * 0.001)");
    expect(r.yaml).toContain("(1 * 0.001)");
  });

  it("makes the SLI a RATIO (good/total), never a raw quantile", () => {
    const r = generateSloRules({ service: "api", target: 99.9 });
    expect(r.sliKind).toBe("ratio");
    expect(r.yaml).toContain("job:slo_errors:ratio_rate1h");
    // a raw quantile SLI would look like `p99 > 0.3` — assert it is NOT present
    expect(r.yaml).not.toMatch(/p99\s*>/);
  });

  it("renders label values unquoted so `severity: ticket` is greppable", () => {
    const r = generateSloRules({ service: "api", target: 99.9 });
    expect(r.yaml).toContain("severity: ticket");
    expect(r.yaml).toContain("severity: page");
  });

  it("each alert tier requires BOTH a long AND a short window (precision + fast reset)", () => {
    const r = generateSloRules({ service: "api", target: 99.9 });
    // the Fast tier must reference both 1h and 5m joined by `and`
    expect(r.yaml).toMatch(/ratio_rate1h[\s\S]*?\n\s*and\s*\n[\s\S]*?ratio_rate5m/);
  });

  it("rejects an out-of-range target with a typed BAD_INPUT error", () => {
    expect(() => generateSloRules({ service: "api", target: 150 })).toThrow(CanaryError);
    expect(() => generateSloRules({ service: "api", target: 0 })).toThrow(/0, 100/);
  });

  it("rejects an empty service name", () => {
    expect(() => generateSloRules({ service: "  ", target: 99.9 })).toThrow(CanaryError);
  });
});
