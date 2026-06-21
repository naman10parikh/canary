#!/usr/bin/env node
/**
 * web/server.mjs — canary cockpit HTTP server (G28, PLAN §10, DECISIONS D3).
 *
 * Zero-dependency Node stdlib `node:http` server (NOT Python — canary is a pnpm/Node repo;
 * this is the faithful adaptation of the "proven sentinel/talent-intel stdlib pattern" to the
 * repo's actual toolchain, the same logic Cluster E used adapting npm→pnpm in acceptance.yml).
 * No build step. Serves the vanilla-JS SPA + routes read-only JSON endpoints that shell to the
 * SAME `canary` CLI the cockpit wraps.
 *
 * READ-MOSTLY (PLAN Q6): the server NEVER triggers instrument / audit / page from the browser.
 * The only CLI it shells is the read-only trio — `canary brain`, `canary explain`, and a
 * synthetic `canary check-delivery` heartbeat. SLO rules are scaffolded into a temp dir and
 * read back (a pure read of canary's generator output — no provider mutation). All other views
 * are plain file reads (brain/*.md, logs/runs.jsonl).
 *
 * Security:
 *   - Static files are served only from web/ (resolve + prefix-check → path-traversal guard).
 *   - The brain query + explain ID flow to the CLI as an argv ARRAY via spawnSync (never a shell
 *     string) and the explain ID is validated against a strict S-/§-/A- regex first.
 *   - Bound to 127.0.0.1 only; no auth (the chairman's eyes only, D3).
 *
 * Error contract: a typed JSON body {error} always; 400 bad input, 404 not found, 502 CLI failure,
 * 500 otherwise. The server boots even if dist/ is unbuilt — endpoints return an honest 502 telling
 * the chairman to run `pnpm build`, never a crash.
 */

import { createServer } from "node:http";
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync, readdirSync, mkdtempSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve, extname } from "node:path";
import { tmpdir } from "node:os";

// ----------------------------------------------------------------- bootstrap ---
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), ".."); // web/ → repo root
const WEB = join(REPO, "web");
const CLI = join(REPO, "dist", "cli", "index.js");
const PORT = Number(process.env.CANARY_WEB_PORT ?? "7799");
const HOST = "127.0.0.1";

/** The six brain artifacts, in the stable display order (mirrors src/lib/brain-paths.ts). */
const BRAIN_FILES = [
  "EXPERTISE-MAP.md",
  "OPINIONS.md",
  "KNOWN-PITFALLS.md",
  "BATTLE-TESTED-SCENARIOS.md",
  "TOOL-MATRIX.md",
  "GAPS-AND-DISPUTES.md",
];

const STATIC_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

/** A carried HTTP status for the error contract. */
class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// ------------------------------------------------------------------- helpers ---

/** Run the canary CLI with the given argv (array — never a shell string). Returns parsed JSON. */
function runCanaryJson(args) {
  if (!existsSync(CLI)) {
    throw new ApiError(502, `canary CLI not built — run \`pnpm build\` (looked for ${CLI})`);
  }
  const res = spawnSync(process.execPath, [CLI, ...args, "--json"], {
    cwd: REPO,
    encoding: "utf8",
    timeout: 20_000,
  });
  if (res.error) throw new ApiError(502, `canary CLI failed: ${res.error.message}`);
  // The CLI exits 0 even for the "no channels" delivery case; only treat a non-parseable
  // stdout as a failure. Some commands log pino lines to stdout, so take the LAST JSON line.
  const out = (res.stdout ?? "").trim();
  const jsonLine = out
    .split("\n")
    .reverse()
    .find((l) => l.trim().startsWith("{"));
  if (!jsonLine) {
    throw new ApiError(502, `canary CLI emitted no JSON (rc=${res.status}): ${(res.stderr ?? "").slice(0, 200)}`);
  }
  try {
    return JSON.parse(jsonLine);
  } catch {
    throw new ApiError(502, "canary CLI emitted unparseable JSON");
  }
}

/** Read a brain artifact's raw markdown (one of the six — never an arbitrary path). */
function readBrainFile(name) {
  if (!BRAIN_FILES.includes(name)) throw new ApiError(400, `not a brain artifact: ${name}`);
  const p = join(REPO, "brain", name);
  if (!existsSync(p)) throw new ApiError(404, `brain artifact missing: ${name}`);
  return readFileSync(p, "utf8");
}

/** Tail the last N lines of logs/runs.jsonl as parsed wide-events (newest first). */
function readRunLog(limit = 50) {
  const p = join(REPO, "logs", "runs.jsonl");
  if (!existsSync(p)) return [];
  const lines = readFileSync(p, "utf8").split("\n").filter((l) => l.trim().startsWith("{"));
  const tail = lines.slice(-limit).reverse();
  const rows = [];
  for (const line of tail) {
    try {
      rows.push(JSON.parse(line));
    } catch {
      /* skip a corrupt line — the run log is append-only but be defensive */
    }
  }
  return rows;
}

/**
 * Scaffold a sample MWMBR SLO into a throwaway temp dir and read it back. This is a pure read of
 * canary's deterministic generator output (S6) — no provider, no creds, no mutation of any target.
 */
function scaffoldSloPreview(service = "sample", target = 99.9) {
  const out = mkdtempSync(join(tmpdir(), "canary-slo-"));
  const result = runCanaryJson(["slo", "--service", service, "--target", String(target), "--out", out]);
  // result already carries { yaml, recordingRules, alertRules, sliKind, promtoolValid, ... }
  return result;
}

/**
 * Run the delivery heartbeat. With no channels configured the CLI exits BAD_INPUT (honest: "a
 * firing rule ≠ a delivered page"). To make the differentiator view legible the cockpit injects a
 * representative SYNTHETIC channel set via the env the CLI already reads (mock channels, $0, S5),
 * unless the chairman has configured real channels. This is a read-only synthetic probe (S5's
 * whole point — fire a synthetic page, confirm receipt), never a real page.
 */
function deliveryHeartbeat() {
  const configured = process.env.CANARY_DELIVERY_CHANNELS || (existsSync(join(REPO, ".canary", "delivery.json")));
  const env = { ...process.env };
  let synthetic = false;
  if (!configured) {
    synthetic = true;
    env.CANARY_DELIVERY_CHANNELS = JSON.stringify([
      { name: "pagerduty", type: "mock" },
      { name: "slack", type: "mock" },
      { name: "webhook", type: "mock", dead: true },
    ]);
  }
  const res = spawnSync(process.execPath, [CLI, "check-delivery", "--json"], {
    cwd: REPO,
    encoding: "utf8",
    timeout: 20_000,
    env,
  });
  if (!existsSync(CLI)) throw new ApiError(502, "canary CLI not built — run `pnpm build`");
  const out = (res.stdout ?? "").trim();
  const jsonLine = out.split("\n").reverse().find((l) => l.trim().startsWith("{"));
  if (!jsonLine) throw new ApiError(502, "delivery heartbeat emitted no JSON");
  const parsed = JSON.parse(jsonLine);
  return { ...parsed, synthetic };
}

// -------------------------------------------------------------------- routes ---

function apiBrain(query) {
  const q = (query ?? "").trim();
  if (!q) throw new ApiError(400, "missing query (?q=)");
  if (q.length > 200) throw new ApiError(400, "query too long");
  // argv array — the query never touches a shell.
  return runCanaryJson(["brain", q]);
}

function apiExplain(id) {
  const raw = (id ?? "").trim();
  // Strict ID shapes: S<n> | §?<n[a-z.]> | [A-D]<n>. Reject anything else (no shell, no path).
  if (!/^(S\d+|§?[0-9][0-9a-z.]*|[A-Da-d]\d+)$/.test(raw)) {
    throw new ApiError(400, `not a valid brain ID: ${raw} (expected S5, §1b.3, or A4)`);
  }
  return runCanaryJson(["explain", raw]);
}

function apiBrainFile(name) {
  return { name, markdown: readBrainFile(name) };
}

function serveStatic(req, res, pathname) {
  // Map "/" → index.html; resolve and confine to web/.
  const rel = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const target = resolve(WEB, rel);
  if (target !== WEB && !target.startsWith(WEB + "/")) {
    res.writeHead(403, { "content-type": "text/plain" });
    res.end("forbidden");
    return;
  }
  if (!existsSync(target)) {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found");
    return;
  }
  const type = STATIC_TYPES[extname(target)] ?? "application/octet-stream";
  res.writeHead(200, { "content-type": type, "cache-control": "no-store" });
  res.end(readFileSync(target));
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(payload);
}

const server = createServer((req, res) => {
  try {
    // Read-only surface: only GET (+HEAD) is accepted (Q6 — no mutate-from-browser).
    if (req.method !== "GET" && req.method !== "HEAD") {
      throw new ApiError(405, "read-only cockpit — only GET is allowed (PLAN Q6)");
    }
    const url = new URL(req.url ?? "/", `http://${HOST}:${PORT}`);
    const p = url.pathname;

    if (p === "/api/health") return sendJson(res, 200, { ok: true, repo: "canary", cli: existsSync(CLI) });
    if (p === "/api/brain-files") return sendJson(res, 200, { files: BRAIN_FILES });
    if (p === "/api/brain-file") return sendJson(res, 200, apiBrainFile(url.searchParams.get("name")));
    if (p === "/api/brain") return sendJson(res, 200, apiBrain(url.searchParams.get("q")));
    if (p === "/api/explain") return sendJson(res, 200, apiExplain(url.searchParams.get("id")));
    if (p === "/api/runs") return sendJson(res, 200, { runs: readRunLog(Number(url.searchParams.get("limit") ?? "50")) });
    if (p === "/api/slo")
      return sendJson(
        res,
        200,
        scaffoldSloPreview(url.searchParams.get("service") ?? "sample", Number(url.searchParams.get("target") ?? "99.9")),
      );
    if (p === "/api/delivery") return sendJson(res, 200, deliveryHeartbeat());

    // Anything else is a static asset request.
    return serveStatic(req, res, p);
  } catch (err) {
    const status = err instanceof ApiError ? err.status : 500;
    const message = err instanceof Error ? err.message : String(err);
    sendJson(res, status, { error: message });
  }
});

server.listen(PORT, HOST, () => {
  // One structured line (canary preaches structured logs, not prose — dogfood OPINIONS C1).
  process.stdout.write(
    JSON.stringify({ event: "cockpit.listening", url: `http://${HOST}:${PORT}`, cli: existsSync(CLI) }) + "\n",
  );
});

// Honest shutdown on SIGINT/SIGTERM (the serve.sh launcher + Playwright webServer both send these).
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    server.close(() => process.exit(0));
  });
}
