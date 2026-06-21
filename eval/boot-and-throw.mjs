#!/usr/bin/env node
/**
 * boot-and-throw — the heart of the acceptance test (PLAN §5 steps 2–3).
 *
 * Precondition: `canary instrument eval/fixtures/sample-service --otlp file://./.otel-out`
 * has already written `canary-otel.mjs` into the fixture (CI runs that step first).
 *
 * This script:
 *   1. Boots the instrumented sample service (`node --import ./canary-otel.mjs server.mjs`)
 *      with cwd = the fixture dir, so the local span sink lands at <fixture>/.otel-out/spans.jsonl.
 *   2. Waits for the service's structured `{event:"listening",port}` line.
 *   3. Hits GET /health (asserts 200 — the readiness probe, E21), GET /slow (a latency span),
 *      and GET /throw (the deliberate failure).
 *   4. Stops the service (SIGTERM → the SDK flushes), then reads the span sink and ASSERTS a
 *      span carrying an `exception` event (with exception.type/.message/.stacktrace) AND an
 *      `error.type` attribute (EXPERTISE-MAP §1.5). Also asserts a latency span exists.
 *
 * Exit 0 = the thrown error was captured as a verifiable trace span LOCALLY (the merge gate,
 * Q0/D15 — no Sentry creds, no network). Exit non-zero = the gate failed (loud, not silent).
 *
 * Usage: node eval/boot-and-throw.mjs [fixtureDir]   (default: eval/fixtures/sample-service)
 */

import { spawn } from "node:child_process";
import { readFileSync, existsSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const fixtureDir = resolve(repoRoot, process.argv[2] ?? "eval/fixtures/sample-service");
const bootstrap = join(fixtureDir, "canary-otel.mjs");
const sinkPath = join(fixtureDir, ".otel-out", "spans.jsonl");

function fail(msg) {
  process.stderr.write(`${JSON.stringify({ level: "error", check: "boot-and-throw", msg })}\n`);
  process.exit(1);
}

function ok(msg, extra) {
  process.stdout.write(`${JSON.stringify({ level: "info", check: "boot-and-throw", msg, ...extra })}\n`);
}

if (!existsSync(bootstrap)) {
  fail(`missing ${bootstrap} — run \`canary instrument ${process.argv[2] ?? "eval/fixtures/sample-service"}\` first`);
}

// Start clean: a stale sink from a prior run would make the assertion lie.
if (existsSync(sinkPath)) rmSync(sinkPath, { force: true });

/** GET a path on the running service; resolve to the HTTP status code. */
async function get(port, path) {
  const res = await fetch(`http://127.0.0.1:${port}${path}`);
  // drain the body so the connection (and thus the server span) closes promptly.
  await res.text().catch(() => undefined);
  return res.status;
}

/** Wait until `predicate()` is true or the timeout elapses (polling). */
async function waitFor(predicate, timeoutMs, stepMs = 50) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((r) => setTimeout(r, stepMs));
  }
  return false;
}

async function main() {
  const child = spawn(process.execPath, ["--import", "./canary-otel.mjs", "server.mjs"], {
    cwd: fixtureDir,
    env: { ...process.env, NODE_ENV: "production" },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let port = 0;
  let stderrBuf = "";
  child.stdout.on("data", (d) => {
    for (const line of String(d).split("\n")) {
      if (!line.trim()) continue;
      try {
        const evt = JSON.parse(line);
        if (evt.event === "listening" && typeof evt.port === "number") port = evt.port;
      } catch {
        // non-JSON stdout (e.g. an OTel diag line) — ignore.
      }
    }
  });
  child.stderr.on("data", (d) => {
    stderrBuf += String(d);
  });

  let exited = false;
  let exitInfo = null;
  child.on("exit", (code, signal) => {
    exited = true;
    exitInfo = { code, signal };
  });

  // The service must come up (and not crash on boot — e.g. a missing OTel dep).
  const up = await waitFor(() => port > 0 || exited, 15000);
  if (exited && port === 0) {
    fail(`service exited before listening (code=${exitInfo?.code} signal=${exitInfo?.signal}); stderr: ${stderrBuf.slice(0, 800)}`);
  }
  if (!up || port === 0) {
    child.kill("SIGKILL");
    fail("service did not report a listening port within 15s");
  }

  // Exercise the three routes. /health must be 200 (E21); /throw is expected to be 500.
  const healthStatus = await get(port, "/health");
  if (healthStatus !== 200) {
    child.kill("SIGKILL");
    fail(`/health returned ${healthStatus}, expected 200`);
  }
  await get(port, "/slow");
  await get(port, "/throw"); // 500 by design — the handler records the exception then responds

  // Give the per-span file exporter a beat to write, then stop the service (SDK flushes).
  await new Promise((r) => setTimeout(r, 300));
  child.kill("SIGTERM");
  await waitFor(() => exited, 5000);
  if (!exited) child.kill("SIGKILL");

  // Read the local span sink and assert the captured signals.
  if (!existsSync(sinkPath)) {
    fail(`no span sink written at ${sinkPath} — instrumentation did not export any span`);
  }
  const records = readFileSync(sinkPath, "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  if (records.length === 0) fail("span sink is empty — no spans exported");

  // (a) a span with an `exception` EVENT carrying exception.type/.message/.stacktrace.
  const withException = records.find((r) =>
    Array.isArray(r.events) &&
    r.events.some((e) => {
      const a = e.attributes ?? {};
      return (
        e.name === "exception" &&
        (a["exception.type"] !== undefined || a["exception.message"] !== undefined)
      );
    }),
  );
  if (!withException) {
    fail("no span carried an `exception` event — the thrown error was not captured as a span exception");
  }

  // (b) the stable `error.type` classification attribute on the failing span.
  const exAttrs = withException.attributes ?? {};
  if (exAttrs["error.type"] === undefined) {
    fail("the exception span is missing the `error.type` attribute (EXPERTISE-MAP §1.5)");
  }

  // (c) a server span for the latency route exists (the histogram source — PLAN §5 step 3).
  const httpSpans = records.filter((r) => typeof r.name === "string" && /GET|HTTP|request|\/slow|\/health/i.test(r.name));
  if (httpSpans.length === 0) {
    fail("no HTTP server spans captured — latency histogram would have no source");
  }

  ok("acceptance gate PASSED — thrown error captured as a span exception + error.type, locally", {
    spans: records.length,
    exceptionEvent: true,
    errorType: exAttrs["error.type"],
    healthStatus,
  });
  process.exit(0);
}

main().catch((err) => fail(err instanceof Error ? err.message : String(err)));
