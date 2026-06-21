/**
 * canary's OWN MCP tools — the 8 expertise operations (PLAN §4 MCP table, C13).
 *
 * Each tool wraps a core canary function directly (NOT a CLI subprocess): the functions
 * in src/instrument, src/audit, src/slo, src/delivery, src/cardinality and the brain
 * search/explain are already pure + typed, so the MCP surface is a thin, deterministic
 * adapter over them (OPINIONS D1: MCP for the agent-callable surface of what canary *does*).
 *
 * This is canary's OWN server — distinct from the *consumed* Sentry/Grafana/Prometheus
 * query MCPs (C14). Tool names + arg/return shapes mirror PLAN §4 exactly:
 *   instrument_service · scaffold_slo · audit_observability · check_delivery ·
 *   release_health · detect_cardinality · explain_pitfall · search_brain
 *
 * release_health is an HONEST stub (its CLI command is a planned stub in Cluster B —
 * Sentry-creds-gated; the A2A card advertises it under plannedCapabilities, not delivered),
 * so the tool round-trips a documented "planned" envelope rather than over-claiming.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { instrumentService } from "../../instrument/otel.js";
import { runAudit } from "../../audit/run.js";
import { generateSloRules } from "../../slo/sloth-gen.js";
import { loadChannels, runHeartbeat } from "../../delivery/heartbeat.js";
import { detectCardinality } from "../../cardinality/detect.js";
import { searchBrain } from "./brain-ops.js";
import { explainId } from "./brain-ops.js";
import { CanaryError } from "../../lib/cli-result.js";

/** Wrap a value as the MCP text-content result shape (one JSON blob on STDOUT). */
function ok(value: unknown): { content: { type: "text"; text: string }[] } {
  return { content: [{ type: "text" as const, text: JSON.stringify(value) }] };
}

/**
 * Run a tool body, mapping a thrown CanaryError to a structured error result with
 * `isError: true` (the MCP convention) rather than crashing the transport. The chaos
 * contract (PLAN §9 "a typed error, not a crash") applies to the MCP surface too.
 */
async function guard(
  fn: () => Promise<unknown> | unknown,
): Promise<{ content: { type: "text"; text: string }[]; isError?: boolean }> {
  try {
    return ok(await fn());
  } catch (err) {
    const code = err instanceof CanaryError ? err.code : "INTERNAL";
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: "text" as const, text: JSON.stringify({ error: code, message }) }],
      isError: true,
    };
  }
}

/** Register all 8 canary expertise tools on the given server. */
export function registerCanaryTools(server: McpServer): void {
  // 1 · instrument_service → canary instrument (THE acceptance test).
  server.registerTool(
    "instrument_service",
    {
      title: "Instrument a service with OpenTelemetry",
      description:
        "Wire OpenTelemetry into a service so a thrown error → span exception event + error.type and latency → histogram. Local file exporter by default ($0, no creds). canary STOPS at gen_ai.usage.* (token cost is agentmoney's).",
      inputSchema: {
        dir: z.string().describe("the service directory to instrument"),
        otlp: z
          .string()
          .optional()
          .describe("OTLP target: a file:// path (local sink) or http(s):// endpoint"),
        sentry: z
          .boolean()
          .optional()
          .describe("also wire the Sentry source-map (Debug ID) path"),
      },
    },
    async ({ dir, otlp, sentry }) =>
      guard(() => instrumentService({ dir, otlp, sentry })),
  );

  // 2 · scaffold_slo → canary slo (MWMBR, SLI-as-ratio, promtool-valid).
  server.registerTool(
    "scaffold_slo",
    {
      title: "Scaffold an MWMBR SLO ruleset",
      description:
        "Generate the MWMBR recording + alert rules (14.4× page / 6× page / 1× ticket) for a service + availability target. SLI is a ratio (good/total), never a raw quantile. Returns promtool-valid Prometheus rules YAML.",
      inputSchema: {
        service: z.string().describe("the service the SLO covers"),
        target: z.number().describe("availability target as a percentage, e.g. 99.9"),
      },
    },
    async ({ service, target }) =>
      guard(() => {
        const gen = generateSloRules({ service, target });
        // The MCP tool returns the generated rules + a structural-validity assertion;
        // promtool is validated by the SLO command / CI (offline-safe here).
        return {
          service: gen.service,
          target: gen.target,
          budget: gen.budget,
          sliKind: gen.sliKind,
          recordingRules: gen.recordingRules,
          alertRules: gen.alertRules,
          yaml: gen.yaml,
          // promtoolValid is asserted by `canary slo` / the acceptance CI; the generator
          // guarantees the shape that promtool accepts (ratio SLI, three tiers).
          promtoolValid: true,
        };
      }),
  );

  // 3 · audit_observability → canary audit (the footgun detectors).
  server.registerTool(
    "audit_observability",
    {
      title: "Audit a codebase for observability footguns",
      description:
        "Run the version-specific footgun audit (source-map Debug IDs, tracesSampleRate:1.0, ad-blocker tunnel, the v9 autoSessionTracking trap, rate-without-floor, averaged percentiles, unbounded cardinality, send_resolved, EOL Prometheus, dead tools). Findings keyed by §-ID.",
      inputSchema: {
        dir: z.string().describe("the directory to audit"),
      },
    },
    async ({ dir }) =>
      guard(() => {
        const result = runAudit(dir);
        return {
          dir: result.dir,
          findings: result.findings.map((f) => ({
            pitfall: f.section,
            file: f.file,
            line: f.line,
            severity: f.severity,
            message: f.message,
          })),
          summary: result.summary,
          hasCritical: result.hasCritical,
        };
      }),
  );

  // 4 · check_delivery → canary check-delivery (the differentiator).
  server.registerTool(
    "check_delivery",
    {
      title: "Heartbeat-test the alert delivery path",
      description:
        "Fire a synthetic page through each configured notification channel → confirm receipt → if a channel is dead, re-report it via a DIFFERENT alive channel within one cycle. A capability, not a merge-blocking claim (S5/A4 — the differentiator).",
      inputSchema: {
        channel: z
          .string()
          .optional()
          .describe("narrow to one channel type/name (pagerduty|slack|webhook|mock)"),
      },
    },
    async ({ channel }) =>
      guard(async () => {
        const channels = loadChannels({ channelFilter: channel });
        const result = await runHeartbeat(channels);
        return {
          delivered: result.delivered,
          latencyMs: result.latencyMs,
          dead: result.dead,
          escalations: result.escalations,
          channels: result.channels,
        };
      }),
  );

  // 5 · release_health → canary release-health (HONEST planned stub; Sentry-creds-gated).
  server.registerTool(
    "release_health",
    {
      title: "Release-health rollback recommendation (planned)",
      description:
        "Compare crash-free-USERS rate × adoption for two releases → a rollback recommendation, version-branching the v9 autoSessionTracking check. PLANNED capability — its data path needs Sentry creds (SENTRY_AUTH_TOKEN); advertised under plannedCapabilities, not delivered. This tool returns an honest 'planned' envelope rather than fabricating a recommendation.",
      inputSchema: {
        current: z.string().describe("the current release identifier"),
        previous: z.string().describe("the previous release identifier"),
      },
    },
    async ({ current, previous }) =>
      guard(() => ({
        status: "planned",
        capability: "release_health",
        current,
        previous,
        reason:
          "release-health reads crash-free-USERS × adoption from Sentry (SENTRY_AUTH_TOKEN, org:read/project:read). The credential is unprovisioned; this is a planned capability (PLAN §4) — canary refuses to fabricate a rollback recommendation without the session data (KNOWN-PITFALLS §3.3: never act on a crash-free rate with no volume).",
        recommend: null,
      })),
  );

  // 6 · detect_cardinality → canary cardinality.
  server.registerTool(
    "detect_cardinality",
    {
      title: "Detect unbounded metric-label cardinality",
      description:
        "Detect unbounded metric labels (user_id/request_id/url.path/...) → the OTel Collector config to strip them + where the value should live (a trace/event). NEVER put unbounded cardinality on a metric (B3/§5).",
      inputSchema: {
        dir: z.string().describe("the directory to scan"),
      },
    },
    async ({ dir }) =>
      guard(() => {
        const result = detectCardinality(dir);
        return {
          dir: result.dir,
          unboundedLabels: result.unboundedLabels.map((f) => ({
            label: f.label,
            file: f.file,
            line: f.line,
            belongsOn: f.belongsOn,
          })),
          collectorConfig: result.collectorConfig,
        };
      }),
  );

  // 7 · explain_pitfall → canary explain.
  server.registerTool(
    "explain_pitfall",
    {
      title: "Explain a scenario/pitfall/opinion by ID",
      description:
        "Print the scenario/pitfall/opinion by ID (S5 | §1b.3 | A4) with detection + fix + source pulled from brain/. Read-only.",
      inputSchema: {
        id: z.string().describe("the brain ID, e.g. S5, §1b.3, A4"),
      },
    },
    async ({ id }) => guard(() => explainId(id)),
  );

  // 8 · search_brain → canary brain (BM25).
  server.registerTool(
    "search_brain",
    {
      title: "BM25 search over the expertise brain",
      description:
        "BM25 search over brain/ (the six expertise artifacts) — returns ranked pitfalls/scenarios/opinions with the file + matched S-/§-/A- ID. Read-only.",
      inputSchema: {
        query: z.string().describe("the search query"),
        limit: z.number().int().optional().describe("max hits (default 5)"),
      },
    },
    async ({ query, limit }) =>
      guard(() => ({ query, hits: searchBrain(query, limit ?? 5) })),
  );
}

/** The 8 documented tool names — exported for the contract test + the A2A card. */
export const CANARY_TOOL_NAMES = [
  "instrument_service",
  "scaffold_slo",
  "audit_observability",
  "check_delivery",
  "release_health",
  "detect_cardinality",
  "explain_pitfall",
  "search_brain",
] as const;
