# AGENTS.md — how to operate canary (for coding agents)

> canary is the Energy fleet's **app-health / errors / uptime / observability** domain-expert
> **employee** — a coding agent's senior SRE. This file tells an agent (Claude Code, the energy hub, a
> sibling employee) what canary does, how to call it (CLI + MCP), the one boundary it never crosses, and
> what it refuses. Powered by Energy. (Read `CLAUDE.md` for the operating creed, `identity/SOUL.md` for
> the persona, and the six `brain/` files for the expertise.)

## What canary is

A **tool-employee**, not a dashboard a human stares at. Its surfaces are a **CLI** (`canary`) + an **MCP
server** (for agents) + a local **cockpit** (the chairman's eyes). Reachability — phone / email / Slack /
SMS — is **N/A**: canary is *consumed by agents*, not messaged like a person. It instruments the services
the other fleet employees produce; it does not own their verticals.

## THE BOUNDARY (the single most load-bearing fact)

**App health ONLY. LLM token spend is agentmoney's.** canary reads
`gen_ai.client.operation.duration` / `gen_ai.client.operation.exception` / `error.type` off a GenAI span
and **stops** at `gen_ai.usage.*`. canary and agentmoney read **disjoint attribute sets off the SAME
OpenTelemetry GenAI span** (shared tag `gen_ai.request.model`). It is also load-shedding — LLM pipelines
emit 10–50× normal telemetry. **canary never holds a cost or token metric.** (`brain/EXPERTISE-MAP.md`
JOB 0.)

## The default stack (locked — `brain/TOOL-MATRIX.md`)

**OpenTelemetry** (instrument-once substrate) · **Sentry** (errors + traces + release-health + Seer) ·
**Prometheus + Grafana** (metrics + SLO/MWMBR burn-rate) · **Checkly** (synthetic / uptime,
monitoring-as-code) · **pino** (structured logs) · **PagerDuty / incident.io** (on-call) ·
**BetterStack** (uptime alt). Defaults are wired; alts are documented, not wired.

## How to call canary

### CLI (the deterministic surface — `canary --help`)

| Command | What it does | Encodes |
| --- | --- | --- |
| `canary instrument <dir> [--otlp <ep>] [--sentry] [--json]` | Wires OpenTelemetry into a target service so a thrown error → span `exception` event + `error.type`, latency → `http.server.request.duration` histogram. Default OTLP = a local file/in-memory exporter ($0, no creds). | B2 / JOB8 / §9 — instrument once |
| `canary slo --service <name> --target <99.9> [--out <dir>] [--json]` | Scaffolds a `promtool`-valid MWMBR SLO ruleset (14.4× page / 6× page / 1× ticket) via Sloth — SLI as a **ratio** `good/total`, never a raw quantile. | S6 / JOB6 / §2 — burn-rate alerting |
| `canary audit <dir> [--json]` | Detects the version-specific footguns (`brain/KNOWN-PITFALLS.md`) keyed by §-ID: missing source-map Debug IDs, `tracesSampleRate:1.0` in prod, the ad-blocker silent-drop (no `tunnel`), the v9 `autoSessionTracking`-removed trap, rate-alerts with no volume floor, averaged percentiles, unbounded metric labels, `send_resolved` off, EOL Prometheus. | §1/§1b/§2/§3/§5/§6/§7/§8/§10 |
| `canary check-delivery [--channel pagerduty\|slack\|webhook] [--json]` | Fires a synthetic page through each configured channel → confirms receipt → fails loudly if a channel is dead, re-surfacing via a *different* channel within one cycle. **canary's single strongest differentiator.** | S5 / A4 / §8 — test the delivery path |
| `canary cardinality <dir> [--json]` | Flags unbounded metric labels (`user_id`/`request_id`/`url.path`) → emits the Collector strip config + states where the value belongs (a trace/event). | S8 / B3 / §5 — tame cardinality |
| `canary brain "<query>"` | BM25-ranked search over the six `brain/` expertise files; returns ranked S-/§-/A- IDs. | the Memory layer |
| `canary explain <S-id\|§-id\|A-id>` | Prints one scenario / pitfall / opinion by ID with detection + fix + source. | read-only lookup |
| `canary eval [--level <1\|2\|3>] [--k <n>] [--json]` | Runs the eval pyramid over the golden tasks: L1 structural, L2 behavioral with pass^k (k=3 by default), and lists the L3 trajectory rubrics for review. | the Evals layer |

Honest stubs (advertised in `--help`, not yet delivered — their owning cluster lands them): `canary
release-health`, `canary uptime`. **Exit 0 on success, non-zero on error;** `--json` on
every data command for agent consumption.

Run the CLI straight from GitHub with `npx -y -p github:naman10parikh/canary canary --help`, or from a
clone with `pnpm install && pnpm build && node dist/cli/index.js --help`.

### MCP (the structured surface — canary's OWN server)

canary ships its own MCP server (stdio local + a documented Streamable-HTTP path) exposing the expertise
operations: `instrument_service`, `scaffold_slo`, `audit_observability`, `check_delivery`,
`release_health`, `detect_cardinality`, `explain_pitfall`, `search_brain`. Start it with
`npx -y -p github:naman10parikh/canary canary-mcp` (the root `.mcp.json` does this), or `node
dist/mcp/server.js` from a built clone. This is **distinct** from the
*consumed* obs-query MCPs (`sentry`, `grafana`, `prometheus`) that canary uses as query lenses (OPINIONS
D1) — those are registered in `.mcp.dev.json` with **env refs only**, never live keys; load them with
`claude --mcp-config .mcp.dev.json`.

### Operating order (OPINIONS D1)

**MCP for queries · CLI for config · REST as the never-give-up fallback. NEVER screen-scrape a
dashboard.** Author all monitoring **as code** (Checkly `.spec.ts`, Sloth SLO YAML, Grafana-as-code) —
never click it into a UI. **Feature-detect** capability; never hardcode that a tool/feature exists
(Seer can be disabled, semconv version drift renames attributes — D2). Treat enabling instrumentation /
bumping an obs dep as a **verify-after** action, never fire-and-forget (D4).

## The creed (`brain/OPINIONS.md`)

Page on symptoms, ≤2/shift, and **test that the page actually delivers**. Instrument once in OTel, buy
the error tracker, never average a percentile or put an unbounded label on a metric, never alert on a
rate without a volume floor. Bias to wide events + causality over signal volume; AI only on a clean
signal. Ship the non-footgun default and detect the footgun. Dogfood the `runs.jsonl` trail you preach.

## What canary REFUSES

- **LLM token spend / $/call / which-model-burned-the-budget** — that is **agentmoney's** (the disjoint-attr split).
- **Un-gated auto-remediation** — auto-*triage* and auto-*enrich* freely; auto-*page* per policy; auto-*mutate*
  (resolve, roll back, restart) only behind the **remediation safety ladder** + human approval (OPINIONS A6).
- **Adding an alert "to be safe"** — the senior move is *deletion* and *consolidation* (A2/A3).
- **Dead tooling** — never Opsgenie (shutdown Apr 2027), never self-hosted Grafana OnCall OSS (archived 2026-03-24),
  never an EOL Prometheus (v3.11 EOL 2026-05-14). (`brain/KNOWN-PITFALLS.md` §10.3/§7.2.)
- **Self-hosting an error tracker below ~$2–5M/yr** — it is itself an availability risk (B6/§10).
- The other employees' verticals (pixel/turbo/acorn/badge/penny/rocket/…). canary *instruments* their output.

## The expertise brain (search it; don't reinvent it) — `brain/`

| File | What it holds |
| --- | --- |
| `brain/EXPERTISE-MAP.md` | the 10 JOBS — **start here**; JOB 0 = the agentmoney boundary |
| `brain/TOOL-MATRIX.md` | per-tool default vs alt, the agent-access surface (MCP/CLI/REST), required secrets |
| `brain/BATTLE-TESTED-SCENARIOS.md` | S1–S18 — real failure/migration cases, each a golden eval with a binary VERIFY |
| `brain/KNOWN-PITFALLS.md` | §1–§12 — version-specific gotchas, each with detection + avoidance |
| `brain/OPINIONS.md` | the taste layer — A/B/C/D stances, "ALWAYS X / NEVER Y — because Z" |
| `brain/GAPS-AND-DISPUTES.md` | live disputes (both sides), what's unconfirmed (say "re-verify") |

Query: `canary brain "page never delivered"` → `BATTLE-TESTED-SCENARIOS.md S5` + `OPINIONS.md A4`.

## Secrets

canary reads keys from a gitignored `.env` (see `.env.example` for the surface). The consumed obs-query
MCPs are registered with **env refs only** (`${SENTRY_AUTH_TOKEN}`, `${GRAFANA_URL}`/`${GRAFANA_API_KEY}`,
`${PROMETHEUS_URL}`) — **never a literal key in `.mcp.json`, `.mcp.dev.json` or any committed file.** Read-only canary uses
`*:read` scopes; the gated mutating path needs `project:write`+`event:write` (TOOL-MATRIX §3).

## Commit convention

`feat(skill):` · `feat(employee):` · `feat(company):` — so git snap-back works at all 3 granularities.
