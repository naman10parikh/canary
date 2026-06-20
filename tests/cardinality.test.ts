import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectCardinality } from "../src/cardinality/detect.js";
import { CanaryError } from "../src/lib/cli-result.js";

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "canary-card-"));
  writeFileSync(
    join(dir, "metrics.ts"),
    `const h = new Histogram({ name: 'req', labelNames: ['user_id', 'method', 'status'] });\nh.labels({ user_id: id, method: 'GET' }).observe(d);\n`,
  );
  // a trace attribute carrying user_id is FINE (that is where it belongs) — must NOT flag
  writeFileSync(
    join(dir, "trace.ts"),
    `span.setAttribute('user.id', userId); logger.info({ user_id: userId });\n`,
  );
});

afterAll(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

describe("unbounded-cardinality detection (S8, OPINIONS B3)", () => {
  it("flags user_id on a metric label list", () => {
    const r = detectCardinality(dir);
    expect(r.unboundedLabels.some((f) => f.label === "user_id")).toBe(true);
  });

  it("does NOT flag user_id when it is a trace attribute / log field (belongs there)", () => {
    const r = detectCardinality(dir);
    const traceFile = r.unboundedLabels.filter((f) => f.file.endsWith("trace.ts"));
    expect(traceFile.length).toBe(0);
  });

  it("says the value belongs on a trace/event and emits a Collector strip config", () => {
    const r = detectCardinality(dir);
    const f = r.unboundedLabels.find((x) => x.label === "user_id");
    expect(f?.belongsOn).toBe("trace/event");
    expect(r.collectorConfig).toContain("attributes/strip-unbounded");
  });

  it("throws NOT_FOUND on a missing directory", () => {
    expect(() => detectCardinality(join(dir, "does-not-exist"))).toThrow(CanaryError);
  });
});
