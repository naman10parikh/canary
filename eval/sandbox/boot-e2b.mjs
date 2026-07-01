#!/usr/bin/env node
/**
 * E2B sandbox-boot integration (E22, PLAN §3 component 11 + §5 step 7) — the REAL integration
 * point: boot the sample service inside an E2B Firecracker microVM, instrument it, throw an
 * error, and VERIFIABLY capture the span+exception against an IN-SANDBOX local OTLP file sink
 * ($0 — no Sentry creds for the gate). Measures cold-start; tears the sandbox down.
 *
 * This is the live-boot grade for the Sandbox/Infra component (HARNESS-OVERRIDES: ✅ requires
 * the boot to ACTUALLY run; 🟡 if E2B_API_KEY is absent). The MERGE gate does NOT depend on
 * this — the local-OTLP acceptance (E20/E23) gates the merge (D15/Q0). This proves the same
 * capture inside an isolated Firecracker VM, like wikimem's Sandbox.create LIVE-BOOT precedent.
 *
 * Secrets: reads E2B_API_KEY from the repo's gitignored .env into process.env WITHOUT printing
 * it (the E2B SDK reads process.env.E2B_API_KEY). If the key is absent OR E2B is unreachable at
 * runtime, prints an honest reason and exits 2 (= 🟡 infra-unavailable, distinct from exit 1 =
 * the span was NOT captured, a real failure).
 *
 * Usage: node eval/sandbox/boot-e2b.mjs
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));

/** Load KEY=VALUE pairs from .env into process.env WITHOUT echoing any value. */
function loadDotEnv() {
  const envPath = join(repoRoot, ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

function info(msg, extra) {
  process.stdout.write(`${JSON.stringify({ level: "info", check: "boot-e2b", msg, ...extra })}\n`);
}
function fail(msg, code) {
  process.stderr.write(`${JSON.stringify({ level: "error", check: "boot-e2b", msg })}\n`);
  process.exit(code ?? 1);
}

loadDotEnv();
if (!process.env.E2B_API_KEY) {
  // 🟡 — the Sandbox component is graded on the live boot; absent key = 🟡, NOT a merge blocker
  // (the local-OTLP acceptance still gates). Exit 2 so a caller can distinguish this from a fail.
  fail("E2B_API_KEY not set (in .env or env) — sandbox-boot SKIPPED (🟡). The local-OTLP acceptance (E20/E23) still gates the merge.", 2);
}

// The self-contained OTel bootstrap (mirrors what `canary instrument` generates) — inlined so
// the sandbox needs only the @opentelemetry/* packages, written to a local file sink the test
// reads back. register()s the ESM import-hook (the same ESM fix as the local path).
const SANDBOX_BOOTSTRAP = `import { register } from 'node:module';
register('@opentelemetry/instrumentation/hook.mjs', import.meta.url);
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { mkdirSync, appendFileSync } from 'node:fs';
mkdirSync('./.otel-out', { recursive: true });
const proc = {
  onStart() {}, async forceFlush() {}, async shutdown() {},
  onEnd(span) {
    try {
      appendFileSync('./.otel-out/spans.jsonl', JSON.stringify({
        name: span.name, attributes: span.attributes,
        events: (span.events || []).map((e) => ({ name: e.name, attributes: e.attributes })),
        traceId: span.spanContext().traceId,
      }) + '\\n');
    } catch {}
  },
};
const sdk = new NodeSDK({
  resource: resourceFromAttributes({ [ATTR_SERVICE_NAME]: 'sample-service' }),
  spanProcessors: [proc],
  instrumentations: [getNodeAutoInstrumentations({ '@opentelemetry/instrumentation-fs': { enabled: false } })],
});
sdk.start();
process.on('SIGTERM', () => sdk.shutdown().finally(() => process.exit(0)));
`;

// The sample service (mirrors eval/fixtures/sample-service/server.mjs) — /throw records the
// exception onto the active span; /health → 200.
const SANDBOX_SERVER = readFileSync(
  join(repoRoot, "eval/fixtures/sample-service/server.mjs"),
  "utf8",
);

const SANDBOX_PKG = JSON.stringify({ name: "sandbox-sample", version: "1.0.0", type: "module" });

async function main() {
  let Sandbox;
  try {
    ({ Sandbox } = await import("e2b"));
  } catch (err) {
    fail(`e2b SDK not importable: ${err instanceof Error ? err.message : String(err)}`, 2);
  }

  let sbx;
  const coldStart = Date.now();
  try {
    // The sandbox LIFETIME must outlive the whole boot+install+throw+read on the critical path.
    // The in-sandbox OTel npm install alone runs >60s (see step 2, timeoutMs:240_000), so a 60s
    // lifetime auto-expires the microVM mid-install ("reached its end of life while the request
    // was in flight"). `Sandbox.create({ timeoutMs })` sets the VM's total lifetime — distinct
    // from the per-command timeoutMs/requestTimeoutMs — so give it 300s headroom. We still
    // `sbx.kill()` in finally, so there is never a leaked microVM regardless of this ceiling.
    sbx = await Sandbox.create({ timeoutMs: 300_000 });
  } catch (err) {
    // Network / quota / auth at runtime → 🟡 infra-unavailable (exit 2), not a span failure.
    fail(`Sandbox.create failed (E2B unreachable/quota/auth): ${err instanceof Error ? err.message : String(err)}`, 2);
  }
  const coldStartMs = Date.now() - coldStart;
  info("sandbox created (Firecracker microVM)", { coldStartMs, sandboxId: sbx.sandboxId });

  try {
    // 1. write the service + bootstrap + package.json into the sandbox.
    await sbx.files.write("/home/user/app/server.mjs", SANDBOX_SERVER);
    await sbx.files.write("/home/user/app/canary-otel.mjs", SANDBOX_BOOTSTRAP);
    await sbx.files.write("/home/user/app/package.json", SANDBOX_PKG);

    // 2. install the OTel runtime deps in-sandbox (the base template has node+npm; this is NOT
    //    counted in cold-start — cold-start is the microVM boot above). NOTE the TWO timeouts:
    //    `timeoutMs` bounds the command's run-time; `requestTimeoutMs` (default 60s) bounds the
    //    HTTP request — npm install of the OTel tree runs >60s, so we DISABLE requestTimeoutMs
    //    (0) and give timeoutMs ample headroom, else the request 60s-deadlines mid-install.
    info("installing OTel deps in-sandbox (npm; not counted in cold-start)");
    const install = await sbx.commands.run(
      "cd /home/user/app && npm install --no-audit --no-fund --loglevel=error " +
        "@opentelemetry/sdk-node@0.219.0 @opentelemetry/auto-instrumentations-node@0.77.0 " +
        "@opentelemetry/resources@2.8.0 @opentelemetry/semantic-conventions@1.41.1 " +
        "@opentelemetry/instrumentation@0.219.0",
      { timeoutMs: 240_000, requestTimeoutMs: 0 },
    );
    if (install.exitCode !== 0) {
      fail(`in-sandbox npm install failed (exit ${install.exitCode}): ${(install.stderr || "").slice(0, 600)}`, 2);
    }
    info("OTel deps installed in-sandbox");

    // 3. boot the instrumented service as a TRUE background command (E2B `background:true`
    //    returns a handle immediately and does NOT hold the request open — a shell `&` would
    //    keep the command session alive past the 60s request deadline). PORT pinned for determinism.
    await sbx.commands.run(
      "cd /home/user/app && PORT=3000 NODE_ENV=production node --import ./canary-otel.mjs server.mjs > /home/user/app/server.log 2>&1",
      { background: true, timeoutMs: 30_000 },
    );
    // give it a moment to bind, then confirm it logged the listening line.
    await sbx.commands.run("sleep 3", { timeoutMs: 10_000 });
    const log = await sbx.commands.run("cat /home/user/app/server.log", { timeoutMs: 15_000 });
    const listening = /"event":"listening"/.test(log.stdout || "");
    if (!listening) {
      fail(`service did not report listening in-sandbox; log: ${(log.stdout || log.stderr || "").slice(0, 600)}`, 1);
    }

    // 4. hit /health (assert 200) + /throw (record the exception) from inside the sandbox.
    const health = await sbx.commands.run(
      "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/health",
      { timeoutMs: 15_000 },
    );
    if ((health.stdout || "").trim() !== "200") {
      fail(`/health returned '${(health.stdout || "").trim()}' in-sandbox, expected 200`, 1);
    }
    await sbx.commands.run("curl -s http://127.0.0.1:3000/throw > /dev/null", { timeoutMs: 15_000 });
    // give the per-span file exporter a beat to write.
    await sbx.commands.run("sleep 1", { timeoutMs: 5_000 });

    // 5. read the in-sandbox span sink back and ASSERT the exception span.
    const sink = await sbx.commands.run("cat /home/user/app/.otel-out/spans.jsonl", { timeoutMs: 15_000 });
    const records = (sink.stdout || "")
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean);
    if (records.length === 0) {
      fail("no spans in the in-sandbox sink — instrumentation did not export inside E2B", 1);
    }
    const withException = records.find(
      (r) =>
        Array.isArray(r.events) &&
        r.events.some((e) => e.name === "exception") &&
        r.attributes &&
        r.attributes["error.type"] !== undefined,
    );
    if (!withException) {
      fail("in-sandbox spans captured, but none carried an `exception` event + error.type", 1);
    }

    info("E2B sandbox-boot PASSED — span exception + error.type captured inside Firecracker", {
      coldStartMs,
      coldStartUnder500ms: coldStartMs <= 500,
      spans: records.length,
      errorType: withException.attributes["error.type"],
      sandboxId: sbx.sandboxId,
    });
  } finally {
    // 6. ALWAYS tear the sandbox down (no leaked microVM).
    try {
      await sbx.kill();
      info("sandbox torn down", { sandboxId: sbx.sandboxId });
    } catch (err) {
      process.stderr.write(`${JSON.stringify({ level: "warn", check: "boot-e2b", msg: "sandbox kill failed (will auto-expire)", error: err instanceof Error ? err.message : String(err) })}\n`);
    }
  }
  process.exit(0);
}

main().catch((err) => fail(err instanceof Error ? err.message : String(err), 1));
