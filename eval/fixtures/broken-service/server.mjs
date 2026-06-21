/**
 * The audit-test fixture (PLAN §12.20): the SAME shape as sample-service but SEEDED with the
 * version-specific footguns canary preaches against, so `canary audit` (B8) and the
 * `observability-auditor` / `alerting-reviewer` sub-agents (C15) have a real broken service
 * to find findings in. The acceptance test asserts `canary audit broken-service` exits
 * NON-ZERO (critical footguns present) while `sample-service` exits zero.
 *
 * The footguns live in the sibling config files (sentry.config.mjs, monitoring.mjs,
 * alerts.rules.yml, package.json); this server is just the realistic host. Zero deps.
 */

import http from "node:http";

const server = http.createServer((req, res) => {
  const url = req.url ?? "/";
  if (url.startsWith("/health")) {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ status: "ok", route: url }));
});

server.listen(Number(process.env.PORT ?? 0), () => {
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  process.stdout.write(`${JSON.stringify({ event: "listening", port })}\n`);
});
