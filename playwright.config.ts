// canary cockpit E2E — Playwright config (CP123 Cluster G, item G29).
//
// Drives the read-only cockpit (web/server.mjs) end-to-end + the CLI acceptance flow, and writes
// chairman-facing screenshots under content/screenshots/. Red-blocking the cockpit views render +
// the acceptance CLI flow completes (PLAN §9 E2E row, §10 design law).
//
// The webServer boots `scripts/serve.sh`, so the cockpit renders REAL data: the Run-log view shows
// the last `canary instrument` wide events, the SLO view scaffolds a live MWMBR ruleset, the
// Delivery view fires a synthetic heartbeat. The brain search shells the BM25 layer
// (scripts/memory-search.sh) which is genuinely slow (~7-15s over the full corpus), so the test
// timeout + expect timeout are deliberately generous — this is real CLI latency, not flake.

import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.CANARY_WEB_PORT || 7799);

export default defineConfig({
  testDir: "tests/e2e",
  outputDir: "test-results",
  globalSetup: "./tests/e2e/global-setup.mjs",
  fullyParallel: false, // one shared cockpit server
  forbidOnly: !!process.env.CI,
  retries: 1, // one retry everywhere — absorbs a transient BM25-search latency spike without masking a real fail
  workers: 1,
  reporter: [["list"]],
  timeout: 150_000, // the brain-search view shells the BM25 CLI (scripts/memory-search.sh) which can spike to 30s+
  expect: { timeout: 20_000 },
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1440, height: 960 },
    trace: "retain-on-failure",
    screenshot: "off", // we take explicit, named screenshots for the chairman
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "bash scripts/serve.sh",
    url: `http://localhost:${PORT}/api/health`,
    timeout: 60_000,
    reuseExistingServer: !process.env.CI,
    env: { CANARY_WEB_PORT: String(PORT) },
  },
});
