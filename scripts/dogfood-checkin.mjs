#!/usr/bin/env node
/**
 * canary's dogfood cron check-in — the S18 dead-man's-switch HEARTBEAT (OPINIONS D5).
 *
 * The class this guards (brain/BATTLE-TESTED-SCENARIOS.md S18, KNOWN-PITFALLS §1c): a
 * scheduled job that SILENTLY STOPS running fires NO error, NO log, NO metric — only the
 * ABSENCE of an expected event. Pure error/uptime monitoring is blind to "the thing that
 * should have happened didn't." The only thing that catches it is a check-in / dead-man's-
 * switch that pages when an expected check-in is MISSED.
 *
 * canary dogfoods its own preaching (OPINIONS D5): its OWN scheduled RSI loop emits a
 * check-in here. A real deployment points CANARY_HEARTBEAT_URL at a Sentry Cron monitor /
 * Better Stack heartbeat that pages if this check-in is missed. Offline / no URL → it emits
 * the check-in locally to logs/runs.jsonl-shaped stdout and exits 0 ($0, no creds).
 *
 * This is also the positive half of G10 (the cron that silently stopped): the check-in fires
 * on success; the page fires on absence (configured at the heartbeat provider, not here).
 */

import { hostname } from "node:os";

const checkin = {
  ts: new Date().toISOString(),
  source: "canary",
  kind: "dogfood-cron-checkin",
  job: "rsi.workflow",
  host: hostname(),
  // a stable monitor slug so a Sentry Cron / Better Stack heartbeat can key on it.
  monitorSlug: "canary-rsi-heartbeat",
  status: "ok",
};

async function postIfConfigured() {
  const url = process.env.CANARY_HEARTBEAT_URL;
  if (!url) {
    // No heartbeat provider wired — emit the check-in locally (the $0 dogfood path). A real
    // deployment sets CANARY_HEARTBEAT_URL; the provider pages when this check-in is MISSED.
    process.stdout.write(JSON.stringify({ ...checkin, delivered: "local-only (no CANARY_HEARTBEAT_URL)" }) + "\n");
    return;
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(checkin),
      signal: controller.signal,
    });
    clearTimeout(timer);
    process.stdout.write(
      JSON.stringify({ ...checkin, delivered: res.ok, httpStatus: res.status }) + "\n",
    );
  } catch (err) {
    // The check-in itself failing is non-fatal to the loop (the PROVIDER pages on the missed
    // check-in); log it loudly and exit 0 so the loop's primary work is not red-blocked.
    process.stdout.write(
      JSON.stringify({ ...checkin, delivered: false, error: err instanceof Error ? err.message : String(err) }) + "\n",
    );
  }
}

await postIfConfigured();
process.stdout.write("[canary] dogfood cron check-in fired (S18 dead-man's-switch — a missed run is an incident)\n");
process.exit(0);
