// SEEDED FOOTGUN (do NOT fix): §5.1 — an unbounded `user_id` label on a metric.
// method(5) × status(5) × pod(1k) = 25k series; + user_id(1M) → 25 BILLION series + a DoS
// surface. The value belongs on a TRACE/event, not a metric dimension (OPINIONS B3).
import client from "prom-client";

const requests = new client.Counter({
  name: "http_requests_total",
  help: "total HTTP requests",
  // user_id is unbounded — this is the cardinality bomb canary's §5.1 detector flags.
  labelNames: ["method", "status", "user_id"],
});

export function recordRequest(method, status, userId) {
  requests.labels({ method, status, user_id: userId }).inc();
}
