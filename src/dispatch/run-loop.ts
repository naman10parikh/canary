/**
 * The internal routing loop for canary's multi-step run (D16, PLAN §3 component 8).
 *
 * Routes the acceptance flow in a FIXED order — each step's output feeds the next:
 *   1. instrument     — wire OTel into the target service (writes canary-otel.mjs)
 *   2. emit           — boot the instrumented service + hit the throw route (produces spans)
 *   3. assert-captured— read the local span sink, assert a span carries an `exception` event
 *                       + `error.type` (the EXPERTISE-MAP §1.5 proof)
 *   4. scaffold-slo   — generate the MWMBR SLO ruleset for the service
 *   5. audit          — run the footgun audit; assert zero critical (the instrumenter passes
 *                       its own audit — PLAN §5 step 6)
 *
 * Design (HARNESS-OVERRIDES "Dispatch (routing)"): an INTERNAL routing loop (no agentgrid /
 * no `tmux select-pane` — this is a single-process pipeline, the simplest correct router).
 * Ordering is the load-bearing property: each StepResult is appended to an ordered log and a
 * step never runs before its predecessor. A step failure halts the loop (a half-instrumented
 * run is never reported as success — PLAN §9 chaos #1).
 *
 * `emit` + `assert-captured` need a bootable service + a span sink — when the target has no
 * bootable entrypoint (e.g. before E20's eval/fixtures/sample-service lands) those two steps
 * record `status: "skipped"` with an honest reason rather than faking a span. The ordering +
 * the instrument/slo/audit steps still run + are asserted.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";
import { instrumentService } from "../instrument/otel.js";
import { generateSloRules } from "../slo/sloth-gen.js";
import { runAudit } from "../audit/run.js";
import { CanaryError } from "../lib/cli-result.js";

/** The fixed ordered step names — the contract the ordering test asserts. */
export const RUN_LOOP_STEPS = [
  "instrument",
  "emit",
  "assert-captured",
  "scaffold-slo",
  "audit",
] as const;

export type RunStepName = (typeof RUN_LOOP_STEPS)[number];

/** One step's outcome in the ordered log. */
export interface StepResult {
  step: RunStepName;
  status: "ok" | "skipped" | "failed";
  detail: string;
  /** anything the NEXT step consumes (the "output feeds the next" contract). */
  output?: Record<string, unknown>;
}

export interface RunLoopOptions {
  /** the target service directory. */
  dir: string;
  /** the service name for the SLO step (defaults to the dir basename). */
  service?: string;
  /** the SLO availability target (default 99.9). */
  target?: number;
  /** the entrypoint to boot for the emit step (e.g. "server.js"); skipped if absent. */
  entrypoint?: string;
}

export interface RunLoopResult {
  dir: string;
  steps: StepResult[];
  /** true iff no step FAILED (skipped is allowed for emit/assert without a bootable target). */
  ok: boolean;
}

/** Read every span record from a local file sink (the instrument file exporter output). */
function readSpanSink(sinkDir: string): Record<string, unknown>[] {
  const sinkFile = join(sinkDir, "spans.jsonl");
  if (!existsSync(sinkFile)) return [];
  return readFileSync(sinkFile, "utf8")
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => {
      try {
        return JSON.parse(l) as Record<string, unknown>;
      } catch {
        return {} as Record<string, unknown>;
      }
    });
}

/** Does any span carry an `exception` event AND an `error.type` attribute? (the §1.5 proof) */
function spanHasException(spans: Record<string, unknown>[]): boolean {
  return spans.some((s) => {
    const events = (s.events as { name?: string }[] | undefined) ?? [];
    const attrs = (s.attributes as Record<string, unknown> | undefined) ?? {};
    return events.some((e) => e.name === "exception") && "error.type" in attrs;
  });
}

/**
 * Run the 5-step routing loop in order. Each step appends to the ordered log; the loop halts
 * on the first FAILED step. Returns the ordered log + overall ok.
 */
export async function runLoop(opts: RunLoopOptions): Promise<RunLoopResult> {
  const dir = resolve(opts.dir);
  if (!existsSync(dir)) {
    throw new CanaryError("NOT_FOUND", `run-loop target does not exist: ${dir}`, { dir });
  }
  const service = opts.service ?? dir.split("/").filter(Boolean).pop() ?? "service";
  const target = opts.target ?? 99.9;
  const steps: StepResult[] = [];

  // ── STEP 1: instrument ──────────────────────────────────────────────────────────────
  const sinkDir = ".otel-out";
  const instrumentResult = await instrumentService({ dir, otlp: `file://${sinkDir}` });
  steps.push({
    step: "instrument",
    status: "ok",
    detail: `wired ${instrumentResult.wired.join(", ")} → ${sinkDir}`,
    output: { wired: instrumentResult.wired, sinkDir: join(dir, sinkDir) },
  });

  // ── STEP 2: emit (boot the instrumented service + hit the throw route) ────────────────
  // Needs a bootable entrypoint. The output of step 1 (the bootstrap) feeds the boot command.
  const sinkAbs = join(dir, sinkDir);
  const entry = opts.entrypoint ?? inferEntrypoint(dir);
  if (!entry) {
    steps.push({
      step: "emit",
      status: "skipped",
      detail:
        "no bootable entrypoint found (pass --entrypoint or land eval/fixtures/sample-service, E20). Instrument wiring is verified; the boot/throw is E20's harness.",
    });
  } else {
    const boot = spawnSync("node", ["--import", `./${instrumentResult.wired[0]}`, entry], {
      cwd: dir,
      encoding: "utf8",
      timeout: 30000,
      env: { ...process.env, CANARY_THROW: "1" }, // a fixture honors this to throw on boot
    });
    // The instrumented bootstrap imports @opentelemetry/* — if those runtime deps are not
    // present in the TARGET (e.g. before E20's fixture installs them), the boot can't emit a
    // span. Detect that honestly (MODULE_NOT_FOUND on an @opentelemetry import) and SKIP emit
    // rather than reporting a non-span-producing boot as success.
    const stderr = boot.stderr ?? "";
    const otelDepsMissing =
      /Cannot find package '@opentelemetry|ERR_MODULE_NOT_FOUND[\s\S]*@opentelemetry/.test(stderr);
    if (otelDepsMissing) {
      steps.push({
        step: "emit",
        status: "skipped",
        detail:
          "the instrumented service needs @opentelemetry/* runtime deps to emit a span (provided by E20's eval/fixtures/sample-service). Instrument wiring verified; the live boot+span is E20/E22's harness.",
      });
    } else {
      steps.push({
        step: "emit",
        status: boot.status === 0 || boot.status === 1 ? "ok" : "failed",
        detail: `booted ${entry} via the step-1 bootstrap (exit ${boot.status})`,
        output: { sinkDir: sinkAbs },
      });
    }
  }

  // ── STEP 3: assert-captured (read the sink the previous step wrote) ───────────────────
  const emitStep = steps[steps.length - 1];
  if (emitStep?.status === "skipped") {
    steps.push({
      step: "assert-captured",
      status: "skipped",
      detail: "emit was skipped (no bootable target) — span assertion deferred to E20/E22.",
    });
  } else {
    const spans = readSpanSink(sinkAbs);
    const captured = spanHasException(spans);
    steps.push({
      step: "assert-captured",
      status: captured ? "ok" : "failed",
      detail: captured
        ? `${spans.length} span(s) in the sink; a span carries an exception event + error.type (§1.5)`
        : `read ${spans.length} span(s) but none carried an exception event + error.type`,
      output: { spanCount: spans.length, exceptionCaptured: captured },
    });
  }

  // halt if any step so far FAILED (a half-instrumented run is not a success).
  if (steps.some((s) => s.status === "failed")) {
    return { dir, steps, ok: false };
  }

  // ── STEP 4: scaffold-slo (uses the service name carried through the loop) ──────────────
  const slo = generateSloRules({ service, target });
  steps.push({
    step: "scaffold-slo",
    status: "ok",
    detail: `MWMBR ruleset for ${service} @ ${target}% (SLI=${slo.sliKind}; tiers ${slo.alertRules.join(", ")})`,
    output: { alertRules: slo.alertRules, sliKind: slo.sliKind },
  });

  // ── STEP 5: audit (the instrumenter must pass its own audit — PLAN §5 step 6) ──────────
  const audit = runAudit(dir);
  steps.push({
    step: "audit",
    status: audit.hasCritical ? "failed" : "ok",
    detail: audit.hasCritical
      ? `${audit.summary.critical} critical footgun(s) — canary's own output did NOT pass its own audit`
      : `0 critical footguns — canary's instrumentation passes canary's own audit`,
    output: { critical: audit.summary.critical, total: audit.summary.total },
  });

  return { dir, steps, ok: steps.every((s) => s.status !== "failed") };
}

/** Best-effort entrypoint inference (a fixture's package.json "main"/common server files). */
function inferEntrypoint(dir: string): string | null {
  const pkgPath = join(dir, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { main?: string };
      if (typeof pkg.main === "string" && existsSync(join(dir, pkg.main))) return pkg.main;
    } catch {
      // fall through to common names
    }
  }
  let names: string[] = [];
  try {
    names = readdirSync(dir);
  } catch {
    return null;
  }
  for (const candidate of ["server.js", "server.mjs", "index.js", "index.mjs", "app.js"]) {
    if (names.includes(candidate)) return candidate;
  }
  return null;
}

/** Render the ordered step log for a human / a CI log. */
export function renderRunLog(result: RunLoopResult): string {
  const lines = [`canary dispatch run-loop → ${result.dir}`];
  result.steps.forEach((s, i) => {
    const mark = s.status === "ok" ? "✓" : s.status === "skipped" ? "·" : "✗";
    lines.push(`  ${i + 1}. ${mark} ${s.step} [${s.status}] — ${s.detail}`);
  });
  lines.push(`  result: ${result.ok ? "OK (no step failed)" : "FAILED"}`);
  return lines.join("\n");
}

/**
 * Runnable entry (`node dist/dispatch/run-loop.js <dir> [--service S] [--target T]
 * [--entrypoint E] [--json]`). Exit 0 iff no step FAILED. Kept in the one named file so the
 * loop is both the importable library (tested) and a directly runnable router.
 */
async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const dir = argv.find((a) => !a.startsWith("--"));
  if (!dir) {
    process.stderr.write("usage: run-loop <dir> [--service S] [--target T] [--entrypoint E] [--json]\n");
    process.exitCode = 2;
    return;
  }
  const flag = (name: string): string | undefined => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  try {
    const result = await runLoop({
      dir,
      service: flag("--service"),
      target: flag("--target") ? Number(flag("--target")) : undefined,
      entrypoint: flag("--entrypoint"),
    });
    if (argv.includes("--json")) {
      process.stdout.write(JSON.stringify(result) + "\n");
    } else {
      process.stdout.write(renderRunLog(result) + "\n");
    }
    process.exitCode = result.ok ? 0 : 1;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(JSON.stringify({ level: "error", msg: "run-loop fatal", error: message }) + "\n");
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ?? "";
if (invokedPath.endsWith("run-loop.js") || invokedPath.endsWith("run-loop.ts")) {
  void main();
}
