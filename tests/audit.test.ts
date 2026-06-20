import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runAudit } from "../src/audit/run.js";

let broken: string;
let clean: string;

beforeAll(() => {
  const root = mkdtempSync(join(tmpdir(), "canary-audit-"));
  broken = join(root, "broken");
  clean = join(root, "clean");
  mkdirSync(broken, { recursive: true });
  mkdirSync(clean, { recursive: true });

  // package.json pinning Sentry SDK v9 → activates the autoSessionTracking-removed trap.
  writeFileSync(
    join(broken, "package.json"),
    JSON.stringify({
      name: "broken",
      dependencies: { "@sentry/react": "^9.5.0" },
    }),
  );
  // §1b.3 tracesSampleRate 1.0 + §1b.2 no tunnel (browser) + §3.1 autoSessionTracking + §1.1 no plugin
  writeFileSync(
    join(broken, "sentry.client.ts"),
    `import * as Sentry from '@sentry/react';\nSentry.init({ dsn: 'x', tracesSampleRate: 1.0, autoSessionTracking: true });\n`,
  );
  // §5.1 unbounded label
  writeFileSync(
    join(broken, "metrics.ts"),
    `const h = new Histogram({ name: 'r', labelNames: ['user_id', 'method'] });\n`,
  );
  // §2.1 rate alert with no volume floor + §8 send_resolved off
  writeFileSync(
    join(broken, "alerts.yml"),
    `groups:\n  - rules:\n      - alert: X\n        expr: failure_rate > 0.05\nreceivers:\n  - webhook_configs:\n      - send_resolved: false\n`,
  );
  // §6.1 averaged percentiles
  writeFileSync(join(broken, "panel.promql"), `avg(p99_per_pod) by (job)\n`);
  // §7.2 EOL Prometheus + §10.3 dead tool
  writeFileSync(
    join(broken, "docker-compose.yml"),
    `services:\n  prometheus:\n    image: prom/prometheus:v3.11\n  oncall:\n    image: opsgenie/agent\n`,
  );

  // a clean service: a plain HTTP app, no footguns
  writeFileSync(
    join(clean, "server.ts"),
    `import { createServer } from 'node:http';\ncreateServer((req,res)=>{res.end('ok');}).listen(3000);\n`,
  );
});

afterAll(() => {
  // best-effort cleanup of the temp root (parent of broken/clean)
  try {
    rmSync(join(broken, ".."), { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

describe("footgun audit (brain/KNOWN-PITFALLS.md)", () => {
  it("finds every planted footgun class keyed by §-ID on the broken service", () => {
    const r = runAudit(broken);
    const sections = new Set(r.sectionsTriggered);
    for (const want of ["§1.1", "§1b.2", "§1b.3", "§2.1", "§3.1", "§5.1", "§6.1", "§7.2", "§8", "§10.3"]) {
      expect(sections.has(want), `expected a finding for ${want}`).toBe(true);
    }
  });

  it("flags tracesSampleRate: 1.0 as critical (§1b.3)", () => {
    const r = runAudit(broken);
    const f = r.findings.find((x) => x.pitfall === "traces-sample-rate-1.0");
    expect(f?.severity).toBe("critical");
  });

  it("flags the v9 autoSessionTracking trap only because the SDK is >= v9 (§3.1)", () => {
    const r = runAudit(broken);
    expect(r.findings.some((x) => x.pitfall === "auto-session-tracking-removed")).toBe(true);
  });

  it("flags the rate alert with no volume floor (§2.1)", () => {
    const r = runAudit(broken);
    expect(r.findings.some((x) => x.pitfall === "rate-alert-no-volume-floor")).toBe(true);
  });

  it("reports ZERO critical footguns on a clean service", () => {
    const r = runAudit(clean);
    expect(r.summary.critical).toBe(0);
    expect(r.hasCritical).toBe(false);
  });
});
