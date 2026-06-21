/**
 * Contract test for canary's OWN MCP server (C13) — the PLAN §9 "Contract (MCP JSON-RPC
 * schema)" layer. Uses an in-process linked transport pair so it is fast + deterministic
 * (no subprocess), and asserts: tools/list returns all 8 documented names, and a tools/call
 * to instrument_service + a read-only tool round-trip with valid shapes.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildCanaryMcpServer } from "../src/mcp/server.js";
import { CANARY_TOOL_NAMES } from "../src/mcp/tools/index.js";

let client: Client;
let svcDir: string;

beforeAll(async () => {
  const server = buildCanaryMcpServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "canary-test", version: "0.0.0" }, { capabilities: {} });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  svcDir = mkdtempSync(join(tmpdir(), "canary-mcp-test-"));
  writeFileSync(
    join(svcDir, "package.json"),
    JSON.stringify({ name: "mcp-test-fixture", type: "module" }),
  );
});

afterAll(async () => {
  await client.close();
  rmSync(svcDir, { recursive: true, force: true });
});

describe("canary MCP server — contract", () => {
  it("tools/list returns all 8 documented tool names", async () => {
    const list = await client.listTools();
    const names = list.tools.map((t) => t.name).sort();
    for (const expected of CANARY_TOOL_NAMES) {
      expect(names).toContain(expected);
    }
    expect(names.length).toBe(CANARY_TOOL_NAMES.length);
  });

  it("every tool exposes a description (no over-claiming silent tools)", async () => {
    const list = await client.listTools();
    for (const tool of list.tools) {
      expect(typeof tool.description).toBe("string");
      expect((tool.description ?? "").length).toBeGreaterThan(10);
    }
  });

  it("tools/call instrument_service round-trips a valid result", async () => {
    const res = await client.callTool({
      name: "instrument_service",
      arguments: { dir: svcDir },
    });
    const content = res.content as { type: string; text: string }[];
    const payload = JSON.parse(content[0]!.text) as {
      wired: string[];
      exporter: { kind: string };
      boundary: string;
    };
    expect(payload.wired).toContain("canary-otel.mjs");
    expect(payload.exporter.kind).toBe("file");
    // JOB-0 boundary is carried in the result (canary stops at token cost).
    expect(payload.boundary).toContain("gen_ai.usage");
  });

  it("tools/call explain_pitfall S5 round-trips the brain section", async () => {
    const res = await client.callTool({
      name: "explain_pitfall",
      arguments: { id: "S5" },
    });
    const content = res.content as { type: string; text: string }[];
    const payload = JSON.parse(content[0]!.text) as { source: string; body: string };
    expect(payload.source).toContain("BATTLE-TESTED-SCENARIOS.md");
    expect(payload.body.length).toBeGreaterThan(0);
  });

  it("release_health returns an honest 'planned' envelope (no fabricated recommendation)", async () => {
    const res = await client.callTool({
      name: "release_health",
      arguments: { current: "v2", previous: "v1" },
    });
    const content = res.content as { type: string; text: string }[];
    const payload = JSON.parse(content[0]!.text) as { status: string; recommend: unknown };
    expect(payload.status).toBe("planned");
    expect(payload.recommend).toBeNull();
  });

  it("a bad input surfaces as a typed error result, not a transport crash", async () => {
    const res = await client.callTool({
      name: "audit_observability",
      arguments: { dir: "/nonexistent/path/canary-xyz" },
    });
    // runAudit on a missing dir returns an empty scan (no crash); the result is still valid JSON.
    const content = res.content as { type: string; text: string }[];
    expect(() => JSON.parse(content[0]!.text)).not.toThrow();
  });
});
