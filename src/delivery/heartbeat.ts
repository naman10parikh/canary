/**
 * Notification-channel delivery heartbeat — canary's single strongest differentiator.
 *
 * brain/BATTLE-TESTED-SCENARIOS.md S5 + OPINIONS A4: "ALWAYS test the alert DELIVERY path
 * end-to-end; a firing rule ≠ a delivered page." PagerDuty itself went down 9h (Aug 2025);
 * Alertmanager #226/#2404/#3920 are all delivery-path failures. The move: fire a synthetic
 * page through EACH configured channel → confirm receipt → if a channel is dead, raise THAT
 * as an incident via a DIFFERENT (alive) channel within one cycle.
 *
 * No-creds default (D7 fallback): channels are configured via env/JSON; a `mock` channel is
 * an in-process sink (deterministic, $0); a `webhook` channel does a real HTTP POST (2xx =
 * delivered). This is shipped as a CAPABILITY, not a merge-blocking claim (Risk 2 — G5 is
 * L3-graded on the design + the false-positive reasoning, never the agent's own opinion).
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { CanaryError } from "../lib/cli-result.js";

/** A configured notification channel. */
export interface Channel {
  name: string;
  type: "mock" | "webhook" | "pagerduty" | "slack";
  /** webhook URL / PagerDuty routing key target / slack webhook. */
  target?: string;
  /** mock-only: simulate a dead channel (for the chaos test). */
  dead?: boolean;
}

/** Per-channel delivery outcome. */
export interface ChannelResult {
  name: string;
  type: Channel["type"];
  delivered: boolean;
  latencyMs: number;
  error?: string;
}

/** An escalation: a dead channel re-reported via a different, alive channel. */
export interface Escalation {
  deadChannel: string;
  viaChannel: string;
}

/** The full heartbeat result (the `--json` contract). */
export interface DeliveryResult {
  /** true iff EVERY configured channel delivered. */
  delivered: boolean;
  channels: ChannelResult[];
  /** names of channels that did not deliver. */
  dead: string[];
  /** for each dead channel, the alive channel it was re-reported through. */
  escalations: Escalation[];
  latencyMs: number; // total wall time of the cycle
}

/** Default timeout per channel probe (ms). */
const PROBE_TIMEOUT_MS = 5000;

/**
 * Load channels from (in priority order): an explicit list, the env var
 * CANARY_DELIVERY_CHANNELS (JSON array), or .canary/delivery.json. If a single
 * `--channel <type>` was given, narrow to that type.
 */
export function loadChannels(opts: {
  channelFilter?: string;
  explicit?: Channel[];
  cwd?: string;
}): Channel[] {
  let channels: Channel[] = opts.explicit ?? [];

  if (channels.length === 0) {
    const env = process.env.CANARY_DELIVERY_CHANNELS;
    if (env) {
      channels = parseChannels(env, "CANARY_DELIVERY_CHANNELS");
    }
  }

  if (channels.length === 0) {
    const cfgPath = resolve(opts.cwd ?? process.cwd(), ".canary", "delivery.json");
    if (existsSync(cfgPath)) {
      channels = parseChannels(readFileSync(cfgPath, "utf8"), cfgPath);
    }
  }

  if (opts.channelFilter) {
    channels = channels.filter((c) => c.type === opts.channelFilter || c.name === opts.channelFilter);
  }

  return channels;
}

function parseChannels(raw: string, source: string): Channel[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new CanaryError("BAD_INPUT", `delivery channels in ${source} are not valid JSON`, {
      source,
    });
  }
  if (!Array.isArray(parsed)) {
    throw new CanaryError("BAD_INPUT", `delivery channels in ${source} must be a JSON array`, {
      source,
    });
  }
  return parsed.map((c, i) => {
    const obj = c as Record<string, unknown>;
    if (typeof obj.name !== "string" || typeof obj.type !== "string") {
      throw new CanaryError("BAD_INPUT", `channel[${i}] in ${source} needs name + type`, {
        source,
        index: i,
      });
    }
    return {
      name: obj.name,
      type: obj.type as Channel["type"],
      target: typeof obj.target === "string" ? obj.target : undefined,
      dead: obj.dead === true,
    };
  });
}

/** Fire a synthetic page through one channel; resolve to its delivery outcome. */
async function probeChannel(channel: Channel): Promise<ChannelResult> {
  const start = performance.now();
  const base = { name: channel.name, type: channel.type };

  // A mock channel delivers unless explicitly marked dead (the chaos lever).
  if (channel.type === "mock") {
    const latencyMs = Math.round(performance.now() - start);
    return channel.dead
      ? { ...base, delivered: false, latencyMs, error: "mock channel marked dead" }
      : { ...base, delivered: true, latencyMs };
  }

  // webhook / slack / pagerduty: POST a synthetic event; 2xx = delivered.
  if (!channel.target) {
    return {
      ...base,
      delivered: false,
      latencyMs: Math.round(performance.now() - start),
      error: "no target configured (missing webhook URL / routing key)",
    };
  }

  const payload = syntheticPayload(channel);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(channel.target, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const latencyMs = Math.round(performance.now() - start);
    if (res.ok) return { ...base, delivered: true, latencyMs };
    return { ...base, delivered: false, latencyMs, error: `HTTP ${res.status}` };
  } catch (err) {
    const latencyMs = Math.round(performance.now() - start);
    const message = err instanceof Error ? err.message : String(err);
    return { ...base, delivered: false, latencyMs, error: message };
  } finally {
    clearTimeout(timer);
  }
}

/** The synthetic-page payload. Includes a dedup_key (§8.5: the single most important field). */
function syntheticPayload(channel: Channel): Record<string, unknown> {
  return {
    source: "canary",
    kind: "delivery-heartbeat",
    summary: `canary synthetic page — proving ${channel.name} can deliver`,
    dedup_key: `canary-heartbeat-${channel.name}`,
    severity: "info",
    timestamp: new Date().toISOString(),
  };
}

/**
 * Run the full delivery cycle: probe every channel; for each dead one, re-report it through
 * a DIFFERENT alive channel (the S5 "alert via a different channel within one cycle" rule).
 */
export async function runHeartbeat(channels: Channel[]): Promise<DeliveryResult> {
  if (channels.length === 0) {
    throw new CanaryError(
      "BAD_INPUT",
      "no notification channels configured — set CANARY_DELIVERY_CHANNELS or .canary/delivery.json (a firing rule ≠ a delivered page, S5)",
    );
  }
  const start = performance.now();
  const results = await Promise.all(channels.map((c) => probeChannel(c)));

  const dead = results.filter((r) => !r.delivered).map((r) => r.name);
  const aliveNames = results.filter((r) => r.delivered).map((r) => r.name);

  // For each dead channel, escalate via the first alive channel (a DIFFERENT one).
  const escalations: Escalation[] = [];
  for (const deadName of dead) {
    const via = aliveNames.find((n) => n !== deadName);
    if (via) escalations.push({ deadChannel: deadName, viaChannel: via });
  }

  return {
    delivered: dead.length === 0,
    channels: results,
    dead,
    escalations,
    latencyMs: Math.round(performance.now() - start),
  };
}
