/**
 * tests/e2e/cockpit.spec.ts — canary cockpit E2E (G29, PLAN §9 E2E row + §10 design law).
 *
 * Drives the read-only cockpit (web/server.mjs) through all five views and asserts each renders
 * REAL data, then writes a chairman-facing screenshot per view under content/screenshots/.
 * Red-blocking: the cockpit views must render. (PLAN §9 verify: brain-browser returns a query,
 * run-log shows the last `canary instrument` run, the SLO/alert view renders the MWMBR rules,
 * ask-the-employee returns a scenario by ID. Plus the §10 warm-black design law: #141312, no
 * AI-purple.)
 */

import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const SHOTS = join(process.cwd(), "content", "screenshots");
test.beforeAll(() => mkdirSync(SHOTS, { recursive: true }));

const shot = (name: string) => join(SHOTS, name);

test.describe("canary cockpit (read-mostly, warm-black)", () => {
  test("masthead + brain browser default view loads with warm-black design (no AI-purple)", async ({ page }) => {
    await page.goto("/");
    // Masthead + the agentmoney boundary pill (JOB-0).
    await expect(page.locator(".brand .logo")).toHaveText("canary");
    await expect(page.locator(".boundary")).toContainText("token cost");
    // Design law: warm-black #141312 is the actual page background (not pure black, not AI-purple).
    const bg = await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);
    expect(bg).toBe("rgb(20, 19, 18)"); // #141312
    // The accent token is amber, NOT purple/indigo.
    const amber = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--amber").trim(),
    );
    expect(amber.toLowerCase()).toBe("#f5a623");
    // The six brain artifacts are listed.
    await expect(page.locator("#artifact-list button")).toHaveCount(6);
    await page.screenshot({ path: shot("01-brain-default.png"), fullPage: true });
  });

  test("brain browser returns a query → S5 (the page never delivered), click reads the scenario", async ({ page }) => {
    await page.goto("/");
    await page.fill("#brain-q", "page never delivered");
    await page.click("#brain-go");
    // The BM25 CLI is slow (~15s) — the generous expect timeout covers it.
    const hits = page.locator("#brain-hits .hit");
    await expect(hits.first()).toBeVisible({ timeout: 30_000 });
    // The top hit is S5 (the differentiator scenario).
    await expect(hits.first().locator(".id")).toHaveText("S5");
    await page.screenshot({ path: shot("02-brain-search.png"), fullPage: true });
    // Click the S5 hit → the reader renders the scenario body (symptom→diagnosis→resolution→verify).
    await hits.first().click();
    await expect(page.locator("#brain-reader")).toContainText("nobody was paged", { timeout: 20_000 });
    await expect(page.locator("#brain-reader")).toContainText("Verify");
    await page.screenshot({ path: shot("03-brain-read-S5.png"), fullPage: true });
  });

  test("run log shows the last `canary instrument` run (model + duration + trace.id)", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("tab", { name: "Run log" }).click();
    const rows = page.locator("#runs-wrap table tbody tr");
    await expect(rows.first()).toBeVisible({ timeout: 20_000 });
    // The newest run is an instrument run on the model D14 pins, with a measured duration + trace.id.
    await expect(rows.first()).toContainText("instrument");
    await expect(rows.first()).toContainText("claude-opus-4-8[1m]");
    await expect(rows.first()).toContainText("ms"); // measured duration column
    // trace.id column is non-empty (truncated hex + ellipsis).
    const trace = await rows.first().locator("td").nth(4).innerText();
    expect(trace.replace("…", "").trim().length).toBeGreaterThan(6);
    await page.screenshot({ path: shot("04-runs.png"), fullPage: true });
  });

  test("SLO & alerts view renders the MWMBR rules (3 burn-rate tiers, SLI as a ratio, promtool ✓)", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("tab", { name: "SLO & alerts" }).click();
    const yaml = page.locator(".rules-yaml pre");
    await expect(yaml).toBeVisible({ timeout: 20_000 });
    // The 3 multi-window multi-burn-rate tiers (14.4× fast / 6× medium / 1× slow).
    await expect(yaml).toContainText("ErrorBudgetBurn_Fast");
    await expect(yaml).toContainText("ErrorBudgetBurn_Medium");
    await expect(yaml).toContainText("ErrorBudgetBurn_Slow");
    await expect(yaml).toContainText("14.4");
    // SLI is a ratio, and promtool validated it.
    await expect(page.locator("#slo-wrap")).toContainText("ratio");
    await expect(page.locator("#slo-wrap")).toContainText("promtool");
    await page.screenshot({ path: shot("05-slo.png"), fullPage: true });
  });

  test("delivery health renders per-channel heartbeat with a DEAD channel + escalation (the differentiator)", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("tab", { name: "Delivery health" }).click();
    const channels = page.locator(".channel");
    await expect(channels.first()).toBeVisible({ timeout: 20_000 });
    // At least one channel is shown, and a dead channel is surfaced in red (the differentiator).
    await expect(page.locator(".channel.dead")).toHaveCount(1);
    await expect(page.locator(".channel.dead")).toContainText("DEAD");
    // The dead channel is re-reported via a different channel within one cycle (S5 verify).
    await expect(page.locator(".escalation").filter({ hasText: "re-reported via" })).toBeVisible();
    await page.screenshot({ path: shot("06-delivery.png"), fullPage: true });
  });

  test("ask-the-employee returns a scenario by ID (S5) + surfaces the agentmoney boundary", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("tab", { name: "Ask the employee" }).click();
    await page.fill("#ask-q", "S5");
    await page.click("#ask-go");
    const answer = page.locator("#ask-answer");
    await expect(answer).toContainText("S5", { timeout: 20_000 });
    await expect(answer).toContainText("nobody was paged");
    // The boundary: token cost is agentmoney's, not canary's (JOB-0).
    await expect(answer.locator(".boundary-note")).toContainText("agentmoney");
    await expect(answer.locator(".boundary-note")).toContainText("gen_ai.usage");
    await page.screenshot({ path: shot("07-ask-S5.png"), fullPage: true });
  });

  test("read-mostly: a POST to a data endpoint is rejected (no mutate-from-browser, Q6)", async ({ request }) => {
    const res = await request.post("/api/brain");
    expect(res.status()).toBe(405);
  });
});
