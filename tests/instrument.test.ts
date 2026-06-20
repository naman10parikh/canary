import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  parseOtlpTarget,
  renderBootstrap,
  instrumentService,
  INSTRUMENT_BOOTSTRAP_FILENAME,
} from "../src/instrument/otel.js";
import { CanaryError } from "../src/lib/cli-result.js";

describe("OTel instrument generator (B6, the acceptance path)", () => {
  it("defaults --otlp to a local file sink ($0, no creds)", () => {
    expect(parseOtlpTarget(undefined)).toEqual({ kind: "file", dir: ".otel-out" });
    expect(parseOtlpTarget("file://./out")).toEqual({ kind: "file", dir: "./out" });
  });

  it("parses an http(s) endpoint as a real OTLP target", () => {
    expect(parseOtlpTarget("http://localhost:4318")).toEqual({
      kind: "otlp",
      endpoint: "http://localhost:4318",
    });
  });

  it("rejects a malformed --otlp value with a typed BAD_INPUT error", () => {
    expect(() => parseOtlpTarget("ftp://nope")).toThrow(CanaryError);
  });

  it("renders a bootstrap that records exception events + error.type + the latency histogram path", () => {
    const b = renderBootstrap({ kind: "file", dir: ".otel-out" }, "svc");
    expect(b).toContain("NodeSDK");
    expect(b).toContain("canarySpanProcessor");
    // an exception is a span EVENT; error.type is the classification attribute (§1.5)
    expect(b).toContain("exception");
    expect(b).toContain("error.type");
    expect(b).toContain("http.server.request.duration");
  });

  it("uses the un-renamed semconv attribute deployment.environment.name (§9.2)", () => {
    const b = renderBootstrap({ kind: "file", dir: ".otel-out" }, "svc");
    expect(b).toContain("deployment.environment.name");
    // it must NOT emit the legacy renamed-away attribute as a key it sets
    expect(b).not.toMatch(/'deployment\.environment'\s*:/);
  });

  it("never reads/writes a token-cost attribute (the agentmoney boundary — JOB 0)", () => {
    const b = renderBootstrap({ kind: "file", dir: ".otel-out" }, "svc");
    // gen_ai.usage may appear ONLY inside the boundary COMMENT, never as code that reads it.
    const codeLines = b
      .split("\n")
      .filter((l) => !l.trimStart().startsWith("//"))
      .join("\n");
    expect(codeLines).not.toContain("gen_ai.usage");
  });

  it("writes the bootstrap into a target dir and returns a structured result", async () => {
    const dir = mkdtempSync(join(tmpdir(), "canary-instr-"));
    try {
      writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "fixture-svc" }));
      const r = await instrumentService({ dir, otlp: "file://./.otel-out" });
      expect(r.wired).toContain(INSTRUMENT_BOOTSTRAP_FILENAME);
      expect(existsSync(join(dir, INSTRUMENT_BOOTSTRAP_FILENAME))).toBe(true);
      expect(r.exporter.kind).toBe("file");
      expect(r.environmentAttribute).toBe("deployment.environment.name");
      expect(r.boundary).toMatch(/agentmoney/);
      // the emitted bootstrap names the inferred service
      const bootstrap = readFileSync(join(dir, INSTRUMENT_BOOTSTRAP_FILENAME), "utf8");
      expect(bootstrap).toContain("fixture-svc");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("throws NOT_FOUND when the target dir does not exist", async () => {
    await expect(
      instrumentService({ dir: "/tmp/canary-nope-" + Date.now() }),
    ).rejects.toThrow(CanaryError);
  });

  it("wires the Sentry source-map path when --sentry is set", async () => {
    const dir = mkdtempSync(join(tmpdir(), "canary-instr-sentry-"));
    try {
      const r = await instrumentService({ dir, sentry: true });
      expect(r.sentry).toBe(true);
      expect(r.wired).toContain("canary-sentry.config.mjs");
      const cfg = readFileSync(join(dir, "canary-sentry.config.mjs"), "utf8");
      // OPINIONS B1: inject -> upload -> deploy order documented
      expect(cfg).toMatch(/inject.*upload.*deploy/i);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
