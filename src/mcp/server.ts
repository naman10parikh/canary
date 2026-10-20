#!/usr/bin/env node
/**
 * canary's OWN MCP server (C13) — the agent-callable surface for what canary *does*.
 *
 * Exposes the 8 expertise operations (PLAN §4 MCP table) as MCP tools wrapping canary's
 * core functions: instrument_service · scaffold_slo · audit_observability · check_delivery ·
 * release_health · detect_cardinality · explain_pitfall · search_brain. This is canary's
 * OWN server — distinct from the *consumed* Sentry/Grafana/Prometheus query MCPs (C14).
 *
 * Dual-mode (Q5):
 *   - **stdio** (primary, default) — the dev-tool consumption pattern; register in .mcp.json
 *     as `{ "canary": { "command": "node", "args": ["dist/mcp/server.js"] } }`.
 *   - **Streamable-HTTP** (documented hosted path) — see renderHttpDocs() / the `--http` flag.
 *     The transport is StreamableHTTPServerTransport from the SDK; the hosted obligation is
 *     documented, not over-built for the local dev-tool default (Karpathy: simplicity first).
 *
 * Run: `node dist/mcp/server.js` (stdio). `node dist/mcp/server.js --http` prints the
 * documented hosted-mode wiring (it does not bind a port in the local default — the hosted
 * variant is a deploy concern, kept documented per the dual-mode obligation).
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerCanaryTools } from "./tools/index.js";

const SERVER_NAME = "canary";
const SERVER_VERSION = "0.1.0";

/** Build the canary MCP server with all 8 expertise tools registered. */
export function buildCanaryMcpServer(): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
  registerCanaryTools(server);
  return server;
}

/**
 * The documented Streamable-HTTP hosted path (the dual-mode obligation, Q5). Printed by
 * `--http`; the hosted variant binds StreamableHTTPServerTransport behind an auth proxy at
 * deploy time. Kept as documentation (not a bound port) for the local dev-tool default.
 */
function renderHttpDocs(): string {
  return [
    "canary MCP — Streamable-HTTP (hosted) mode is the documented dual-mode path (Q5).",
    "",
    "Local default is stdio (run with no flags). For the hosted variant, mount the SDK's",
    "StreamableHTTPServerTransport behind your auth proxy:",
    "",
    "  import { StreamableHTTPServerTransport } from",
    "    '@modelcontextprotocol/sdk/server/streamableHttp.js';",
    "  const server = buildCanaryMcpServer();",
    "  // wire transport to your HTTP framework's POST /mcp + GET /mcp (SSE) handlers,",
    "  // gate with OAuth / a bearer token (never expose unauthenticated mutating tools).",
    "",
    "Register the stdio server in .mcp.json:",
    '  { "canary": { "command": "node", "args": ["dist/mcp/server.js"] } }',
  ].join("\n");
}

/** Entry point: stdio by default; `--http` prints the documented hosted-mode wiring. */
async function main(): Promise<void> {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    process.stdout.write(
      "canary-mcp: canary's MCP server over stdio (8 tools). Register it in an MCP client; " +
        "`--http` prints the hosted-mode wiring, `--version` the version.\n",
    );
    return;
  }
  if (process.argv.includes("--version")) {
    process.stdout.write(`${SERVER_VERSION}\n`);
    return;
  }
  if (process.argv.includes("--http")) {
    process.stdout.write(`${renderHttpDocs()}\n`);
    return;
  }
  const server = buildCanaryMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stdio mode stays alive on the transport until the client disconnects.
}

// Run only when invoked directly or through the `canary-mcp` bin (npm links a bin under its own
// name, so argv[1] ends in "canary-mcp"); tests import buildCanaryMcpServer without booting.
const invokedPath = process.argv[1] ?? "";
if (invokedPath.endsWith("server.js") || invokedPath.endsWith("server.ts") || invokedPath.endsWith("canary-mcp")) {
  main().catch((err: unknown) => {
    process.stderr.write(
      `${JSON.stringify({ level: "error", msg: "mcp fatal", error: err instanceof Error ? err.message : String(err) })}\n`,
    );
    process.exitCode = 1;
  });
}
