/**
 * L1 — structural-invariant assertions (E19). Pure, deterministic, no boot.
 *
 * These assert that canary's OUTPUTS have the right SHAPE — the shibboleths a senior SRE
 * checks. Each task cites its golden-task (G#) + brain scenario (S#) so the eval/ → S-ID
 * mapping is greppable (the verify counts ≥10 distinct S-IDs across eval/).
 *
 * Lifted from PLAN §6:
 *   G1  (S6)  — the MWMBR SLO ruleset structure: 3 tiers, SLI-as-ratio (not a raw quantile)
 *   G3  (S3)  — a rate alert MUST carry a volume floor (OPINIONS A5)
 *   G4  (S6)  — the 14.4× / 6× / 1× burn-rate tiers + severities (page/page/ticket)
 *   G7  (S9)  — aggregate histograms (histogram_quantile(sum(rate(_bucket)))), NEVER avg(p99)
 *
 * The S3 / S9 structural checks run canary's audit detectors over committed fixtures and
 * assert the §-ID the detector emits — the detector IS the structural invariant.
 */

import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { generateSloRules } from "../../src/slo/sloth-gen.js";
import { runAudit } from "../../src/audit/run.js";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const brokenFixture = resolve(repoRoot, "eval/fixtures/broken-service");
const sampleFixture = resolve(repoRoot, "eval/fixtures/sample-service");

describe("L1 · G1/G4 (S6) — MWMBR SLO ruleset structure", () => {
  const slo = generateSloRules({ service: "sample", target: 99.9 });

  it("SLI is a RATIO (good/total), never a raw quantile — the S6 footgun guard", () => {
    expect(slo.sliKind).toBe("ratio");
    // budget = 1 - SLO = 0.001 for 99.9% (rounded free of IEEE-754 noise).
    expect(slo.budget).toBe(0.001);
    // the recording rules express an error ratio, not a p99>Xms quantile.
    expect(slo.yaml).toMatch(/ratio_rate/);
    expect(slo.yaml).not.toMatch(/p99\s*>\s*\d/);
  });

  it("emits exactly the three MWMBR tiers with the right burn factors + severities (G4)", () => {
    expect(slo.alertRules).toEqual([
      "ErrorBudgetBurn_Fast",
      "ErrorBudgetBurn_Medium",
      "ErrorBudgetBurn_Slow",
    ]);
    // 14.4× fast/page, 6× medium/page, 1× slow/ticket (Google SRE Workbook Table 5-8).
    expect(slo.yaml).toMatch(/14\.4/);
    expect(slo.yaml).toMatch(/severity: page/);
    expect(slo.yaml).toMatch(/severity: ticket/);
  });

  it("each tier requires BOTH a long AND a short window to breach (precision + fast reset)", () => {
    // the Fast tier compares the 1h AND the 5m window.
    expect(slo.yaml).toMatch(/ratio_rate1h/);
    expect(slo.yaml).toMatch(/ratio_rate5m/);
    // a multi-window expr joins them with `and`.
    expect(slo.yaml).toMatch(/\n\s*and\s*\n/);
  });
});

describe("L1 · G3 (S3) — a rate alert MUST carry a volume floor (OPINIONS A5)", () => {
  it("flags the broken fixture's `failure_rate > 0.05` with no `AND count > N` floor (§2.1)", () => {
    const audit = runAudit(brokenFixture);
    const floorFindings = audit.findings.filter((f) => f.section === "§2.1");
    expect(floorFindings.length).toBeGreaterThanOrEqual(1);
    expect(floorFindings[0]?.pitfall).toBe("rate-alert-no-volume-floor");
    expect(floorFindings[0]?.severity).toBe("critical");
  });
});

describe("L1 · G7 (S9) — never average percentiles; aggregate the histogram first", () => {
  it("the SLO generator's PromQL aggregates with sum(rate(...)), never avg(p99)", () => {
    const slo = generateSloRules({ service: "sample", target: 99.9 });
    // canary's own generated PromQL must use sum(rate(...)) aggregation, not avg() over a quantile.
    expect(slo.yaml).toMatch(/sum\(rate\(/);
    expect(slo.yaml).not.toMatch(/avg\([^)]*p9\d/);
  });

  it("the clean fixture has ZERO critical footguns (canary's own output passes its own audit)", () => {
    // G1's audit half (PLAN §5 step 6): the instrumenter's target passes the audit.
    const audit = runAudit(sampleFixture);
    expect(audit.summary.critical).toBe(0);
  });
});
