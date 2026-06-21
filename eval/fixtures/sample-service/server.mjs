/**
 * The acceptance-test sample service (PLAN §5) — a small, REAL Node HTTP app.
 *
 * It exists so `canary instrument` has something real to wire OpenTelemetry into, and so
 * the acceptance test can prove the two load-bearing signals:
 *   - GET /throw  → the handler throws → recorded as a span `exception` event +
 *     `error.type` (EXPERTISE-MAP §1.5 / PLAN §5 step 2).
 *   - GET /slow   → an artificial delay → an `http.server.request.duration` histogram
 *     (PLAN §5 step 3; canary reports p50+p99, never avg — OPINIONS B4).
 *   - GET /health → 200 (the readiness probe the Observability component requires — E21).
 *
 * Zero external deps (plain `node:http`) so the fixture is genuinely "real" without dragging
 * a framework into the gate. OpenTelemetry is loaded SEPARATELY via `node --import
 * ./canary-otel.mjs` (canary writes that bootstrap) — the service code itself is un-aware of
 * the wire, which is the whole point of instrument-once (OPINIONS B2).
 *
 * The throw path uses the OTel API (if loaded) to attach the exception to the active HTTP
 * span and then responds 500 — a real service catches, records, and returns an error rather
 * than crashing the process (a span exporter must never crash the app it watches — §9.3).
 */

import http from "node:http";

const PORT = Number(process.env.PORT ?? 0); // 0 = let the OS pick a free port (CI-safe)

/**
 * Record the thrown error onto the active OTel span, if the SDK is loaded. Imported lazily so
 * the service runs fine WITHOUT instrumentation too (uninstrumented = no span, just a 500).
 */
async function recordOnActiveSpan(err) {
  try {
    const otel = await import("@opentelemetry/api");
    const span = otel.trace.getActiveSpan();
    if (!span) return;
    // An exception is a span EVENT named 'exception' with exception.type/.message/.stacktrace.
    span.recordException(err);
    // error.type is the stable classification attribute (EXPERTISE-MAP §1.5).
    span.setAttribute("error.type", err?.name ?? "Error");
    span.setStatus({ code: otel.SpanStatusCode.ERROR, message: err?.message ?? "error" });
  } catch {
    // No OTel loaded (uninstrumented run) — nothing to attach to. That's fine.
  }
}

const server = http.createServer(async (req, res) => {
  const url = req.url ?? "/";
  try {
    if (url.startsWith("/health")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }
    if (url.startsWith("/slow")) {
      // An artificial tail so the latency histogram has a non-trivial bucket.
      await new Promise((r) => setTimeout(r, 60));
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: "slow-ok" }));
      return;
    }
    if (url.startsWith("/throw")) {
      // The deliberate failure the acceptance test asserts is captured as a span exception.
      throw new TypeError("submitOrder is not a function");
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ status: "ok", route: url }));
  } catch (err) {
    await recordOnActiveSpan(err);
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: err?.name ?? "Error", message: err?.message }));
  }
});

server.listen(PORT, () => {
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : PORT;
  // A single structured line the harness parses to learn the chosen port (OPINIONS B7 —
  // structured, not prose). NOT a console.log narrative.
  process.stdout.write(`${JSON.stringify({ event: "listening", port })}\n`);
});

// Graceful shutdown so the harness can stop us and the OTel SDK can flush its spans.
function shutdown() {
  server.close(() => process.exit(0));
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
