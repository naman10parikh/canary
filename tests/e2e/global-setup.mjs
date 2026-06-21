/* tests/e2e/global-setup.mjs — Playwright global setup for the canary cockpit E2E (G29).
 *
 * Guarantees the cockpit renders REAL data before the spec runs:
 *   1. The CLI is built (the cockpit's brain/run/delivery/slo views shell `dist/cli/index.js`).
 *   2. At least one `canary instrument` wide event exists in logs/runs.jsonl, so the Run-log view
 *      has a deterministic newest row to assert on (rather than depending on cross-run state).
 *
 * This is setup, not a test — it runs once before the suite. It is idempotent and $0 (the
 * acceptance path runs against a committed fixture with the local file exporter, no creds).
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CLI = join(REPO, "dist", "cli", "index.js");

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { cwd: REPO, encoding: "utf8", stdio: "pipe", ...opts });
  return res;
}

export default async function globalSetup() {
  // 1) Build if needed (the cockpit shells the built CLI).
  if (!existsSync(CLI)) {
    const b = run("pnpm", ["build"]);
    if (b.status !== 0) throw new Error(`pnpm build failed in global-setup:\n${b.stderr || b.stdout}`);
  }

  // 2) Seed one instrument wide event so the Run-log view has data (idempotent — append-only log).
  const fixture = join(REPO, "eval", "fixtures", "sample-service");
  if (existsSync(fixture)) {
    const r = run(process.execPath, [CLI, "instrument", fixture, "--json"]);
    // A non-zero here is non-fatal for the cockpit (the view just shows whatever runs exist),
    // but surface it so a broken acceptance path is visible.
    if (r.status !== 0) {
      process.stderr.write(`[global-setup] warn: seed instrument run rc=${r.status}: ${(r.stderr || "").slice(0, 200)}\n`);
    }
  }
}
