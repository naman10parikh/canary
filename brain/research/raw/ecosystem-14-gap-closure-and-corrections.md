---
title: "canary ecosystem research — GAP-CLOSURE + version corrections (second pass)"
type: research
created: 2026-06-16
tags: [canary, observability, gap-closure, corrections, sentry-v10, grafana-oncall-dead, pagerduty-mcp, slo-tooling, agentic-obs]
researcher: ecosystem (CP123 Wave-R, second pass)
---

# 14 — Gap-closure + corrections to the ecosystem-00…13 bundle

This file is the **second-pass gap-closure** over the existing `ecosystem-00`…`ecosystem-13`
research bundle (a thorough, primary-sourced first pass also dated 2026-06-16). Per the
"consolidate, never expand" rule I did NOT recreate that work — I **verified it, closed every
item its own `ecosystem-13 §13.5 GAPS-AND-DISPUTES` flagged, and recorded the handful of facts
that have CHANGED or were WRONG.** Each item below: what the bundle said → what's actually true
now → the source → the lesson for canary. Everything verified 2026-06-16 via `gh api`, WebFetch,
WebSearch (firecrawl-backed). The corrections matter because canary is the *fleet's* obs domain
expert — stale version guidance propagates.

---

## 14.1 CORRECTION (load-bearing) — Grafana OnCall OSS is DEAD, not just "at risk"

**Bundle said** (ecosystem-06 §6.2, ecosystem-09 §9.3, flagged again in §13.5 gap #2):
"Grafana OnCall is the canary-relevant pick *if on Grafana* … OSS/free … ⚠️ RISK: re-verify the
OSS roadmap, Grafana Labs has historically deprecated OSS toward Cloud."

**Actually true now (gap closed → recommendation INVALIDATED):** Grafana OnCall OSS is
**archived and end-of-life**. Hard facts:
- The GitHub repo **moved to `grafana-cold-storage/oncall` and is `archived: true`** (verified
  `gh api repos/grafana/oncall` → redirects to `grafana-cold-storage/oncall`, `"archived":true`,
  3,888★). The literal last substantive commit is `docs: Change status of Grafana OnCall OSS to
  archived (#5651)` dated **2026-03-24** (`gh api .../commits`, 2026-06-16).
- **Maintenance mode started 2025-03-11. Repository archived 2026-03-24.** "**No new features
  will be developed**"; only "critical bug fixes and security patches (CVEs with a CVSS score of
  7.0 or higher) will still be addressed." (verbatim, WebFetch
  grafana.com/docs/oncall/latest/set-up/open-source/, 2026-06-16.)
- **Cloud Connection turned OFF 2026-03-24** — this is the killer: OSS OnCall's SMS, phone, and
  push notifications routed through Grafana Cloud, and that bridge is now gone. OSS users must
  wire **Twilio directly (SMS/phone)** and **Pushover/Gotify/ntfy (push)** themselves. (same
  source.)
- **Official successor = Grafana Cloud IRM** (Incident Response & Management — Grafana OnCall +
  Grafana Incident *merged* into one product). Migrate via Terraform or the OnCall API, in order:
  integrations → escalation chains → routes → schedules. (WebSearch synthesis of
  grafana.com/docs/grafana-cloud/alerting-and-irm/irm/set-up/migrate/oncall-oss/ +
  grafana.com/blog/grafana-oncall-maintenance-mode/, 2026-06-16.)

**Lesson for canary (corrected recommendation):**
- ❌ Do **NOT** recommend self-hosted Grafana OnCall OSS for any new fleet on-call setup. It is a
  dead-end as of March 2026 (no features, Cloud notif bridge severed).
- ✅ The on-call options that are actually alive: **PagerDuty** (now with an *official MCP* — see
  §14.2), **incident.io** (now with an *official MCP* — §14.2), **Grafana Cloud IRM** (managed,
  not OSS), **Better Stack** (consolidated), **Squadcast** (budget).
- ✅ IMPORTANT nuance: the **first-party Grafana MCP still exposes OnCall tools** (schedules,
  teams/users, alert groups — verified in the MCP README, §14.3) because those query **Grafana
  *Cloud* OnCall/IRM**, which is alive. So "query who's on call through the Grafana MCP" still
  works *if you're on Grafana Cloud IRM* — it's the **self-hosted OSS** product that died, not the
  MCP surface. canary must not conflate the two.

This is the single most important correction in this pass: a tool the prior bundle recommended
(with a caveat) is now an anti-recommendation with a hard date.

---

## 14.2 CORRECTION — first-party MCPs NOW EXIST for PagerDuty AND incident.io

**Bundle said** (ecosystem-06 §6.4, ecosystem-09 §9.1, §13.5 gap #3): "Could NOT confirm any
first-party MCP for PagerDuty, incident.io, Checkly, Better Stack… these are REST-API-only for
agents today."

**Actually true now (gap closed → two corrections):**

### PagerDuty has an OFFICIAL MCP server
`PagerDuty/pagerduty-mcp-server` — **"PagerDuty's official local MCP server"**, MCP registry name
`io.github.PagerDuty/pagerduty-mcp`, **Apache-2.0, Python, 71★, pushed 2026-06-15** (verified
`gh api repos/PagerDuty/pagerduty-mcp-server` + README, 2026-06-16). It is genuinely first-party
(PagerDuty org, official docs at mcp-docs.fde.pagerduty.com). Notable: it ships **embedded React
"MCP Apps"** rendered in-IDE — *Incident Command Center* (ack/resolve/escalate, AI similar-incident
detection), *On-Call Manager* (schedule override CRUD), *On-Call Compensation Report*, *Service
Dependency Graph*, *Onboarding Wizard*. Auth: a PagerDuty **User API Token**; run via `uv run
pagerduty-mcp`. Tools cover incidents, services, schedules, **event orchestrations**, escalation
policies. This is a strong agent-native surface — the prior bundle's "PagerDuty = REST + Events
API v2 only" is now superseded.

### incident.io has an OFFICIAL MCP server (replaced its prototype)
"In **March 2026**, incident.io's prototype MCP server (`incident-io/incidentio-mcp-golang`) was
**superseded by an officially supported MCP Server**." The official one is a **remote MCP**
(Streamable HTTP) documented at **docs.incident.io/ai/remote-mcp** — connects for incident
management, alert handling, on-call scheduling, and investigation workflows; the old Golang
prototype is no longer maintained. (WebSearch + incident.io/blog/we-built-an-mcp-server-so-claude-
can-access-your-incidents + docs.incident.io, 2026-06-16.)

### Still community-or-none (the gap that remains)
- **Checkly:** still no MCP — but it ships an **installable agent *skill*** (`npx skills add
  checkly/checkly-cli`), which is arguably *better* for an agent than an MCP (it teaches the agent
  to author monitoring-as-code). (ecosystem-03 §3.2 — correct as written.)
- **Better Stack:** no first-party MCP. Only a tiny community `MxDui/betterstack-mcp` (0★,
  pushed 2025-04-29, stale). REST API + Terraform provider remain the agent path.
- **UptimeRobot:** no first-party MCP; community `84emllc/uptimerobot-mcp` (0★) / `thichcode/
  uptimerobot_mcp` (0★). REST API v2/v3 only.
- **Datadog:** `datadog-labs/mcp-server` = **"Official Datadog MCP Server"** (41★, pushed
  2026-06-12) — confirms the prior bundle (community `GeLi2001/datadog-mcp-server` at 68★ is the
  popular *unofficial* one). (`gh search repos "datadog mcp"`, 2026-06-16.)

**Corrected MCP landscape table for canary (supersedes ecosystem-09 §9.1 for the on-call rows):**

| Tool | MCP server | First-party? | Stars | Note |
| --- | --- | --- | --- | --- |
| Sentry | getsentry/sentry-mcp | ✅ | 726★ | unchanged (ecosystem-09) |
| Grafana | grafana/mcp-grafana | ✅ | 3,155★ | now incl. **Sift** AI investigations (§14.3) |
| Prometheus | pab1it0/prometheus-mcp-server | ❌ community | 474★ | unchanged |
| Datadog | datadog-labs/mcp-server | ✅ official | 41★ | confirmed |
| **PagerDuty** | **PagerDuty/pagerduty-mcp-server** | ✅ **official** | **71★** | **NEW vs bundle** |
| **incident.io** | official remote MCP (docs.incident.io/ai/remote-mcp) | ✅ **official** | — | **NEW vs bundle** |
| Checkly | — (installable *skill* instead) | ✅ skill | — | unchanged |
| Better Stack / UptimeRobot | community only (≤0★) | ❌ | ~0 | REST-API path |

**Lesson:** the agent-operability story for canary's *on-call* layer is now MUCH better than the
prior bundle concluded — two of the three live on-call tools (PagerDuty, incident.io) have
official MCPs. canary should route on-call queries through those MCPs, not raw REST.

---

## 14.3 NET-NEW — the Grafana MCP has **Sift** (AI investigations), missed by the bundle

The prior bundle (ecosystem-05 §5.5, ecosystem-09 §9.3) described the Grafana MCP as
"dashboards + PromQL/LogQL + incidents + alert rules + OnCall." It **omitted Sift**, which is the
most canary-relevant capability. From the live `grafana/mcp-grafana` README (verified 2026-06-16):

- **Sift investigations** — `list_sift_investigations`, `get_sift_investigation`,
  `get_sift_analysis`.
- **`find_error_pattern_logs`** — "Detect elevated error patterns in Loki logs using Sift."
- **`find_slow_requests`** — "Detect slow requests using Sift (Tempo)."

This is an **AI-assisted root-cause surface inside the Grafana MCP** — directly the "agent
operating obs" capability canary is about. An agent can ask the Grafana MCP to *find the error
pattern* / *find the slow request* rather than hand-writing the LogQL/Tempo query. Pair it with
Sentry's `analyze-issue-with-seer` (ecosystem-09 §9.2) and canary has **two first-party AI
root-cause tools** across the two anchor stacks.

RBAC gotcha (also from the README, agent-relevant): Grafana Incident + Sift tools use **basic
Grafana roles** (Viewer = read, Editor = write), NOT fine-grained RBAC. An agent provisioning its
token must grant Editor to create incidents / modify investigations.

---

## 14.4 GAP CLOSED — Sentry JS SDK is on **v10**, not v8; the bundle's breakage data is 2 majors stale

**Bundle said** (ecosystem-11 §11.1): the big Sentry pain is the **v7→v8** memory leak (#13412,
52c) and the v8 dependency warning. True historically — but **the current SDK line is v10**, so an
agent must know v8→v9 and v9→v10 each had their own breaking migrations, and (critically) one of
them **breaks a grep the bundle itself recommends**.

**Current version (verified `gh api repos/getsentry/sentry-javascript/releases`, 2026-06-16):**
**`@sentry/*` v10.58.0 (2026-06-15)**, shipping ~weekly minors (10.52 May 7 → 10.58 Jun 15). The
v7→v8 leak issues are now **two majors old**.

### v8 → v9 breaking changes (docs.sentry.io/platforms/javascript/migration/v8-to-v9/, 2026-06-16):
- **`autoSessionTracking` option REMOVED** → use `browserSessionIntegration` / `httpIntegration`.
  ⚠️ **This directly corrects ecosystem-10 §10.3/§10.5**, which tells an agent to "check if
  `autoSessionTracking` is on" for Release Health. **On v9+ SDKs (i.e. the current v10 line) that
  option does not exist** — an agent grepping for `autoSessionTracking` in a modern codebase finds
  nothing and would wrongly conclude sessions are off. The correct modern check is: is
  `browserSessionIntegration` (browser) / `httpIntegration` with session tracking (server)
  present? See "Release-Health correction" below.
- `getCurrentHub()`, `Hub`, the whole Hub API — **removed** (use the scope APIs).
- `enableTracing` option **removed** → `tracesSampleRate: 1` (or `0`).
- `captureUserFeedback()` **removed** → `captureFeedback()` (`message` field).
- `@sentry/utils` package **removed** → functionality folded into `@sentry/core`.
- `beforeSendSpan` can no longer drop spans by returning null; `samplingContext.request` →
  `samplingContext.normalizedRequest`.
- Min versions raised: **TypeScript ≥ 5.0.4**, browsers to **ES2020** (Chrome/Edge 80+, FF 74+,
  Safari 14+).

### v9 → v10 breaking changes (docs.sentry.io/platforms/javascript/migration/v9-to-v10/, 2026-06-16):
- **All OpenTelemetry deps bumped to v2.x** (OTel JS v2 — ties to ecosystem-13's OTel JS v2.8.0
  finding). If you can't run OTel v2, **stay on v9 OR use `@sentry/node-core`** (ships *widened*
  OTel peer deps). This is a real escape hatch an agent must know.
- **IP-address inference now gated on `sendDefaultPii`** — if `sendDefaultPii: true`, browser SDKs
  infer user IPs on all events; if false/unset, no IP collection. (A privacy/PII behavior change.)
- `BaseClient` **removed** → use `Client`. `hasTracingEnabled` **removed** → `hasSpansEnabled`.
- **FID (First Input Delay) web vital no longer reported** (it's deprecated in favor of INP).
- Self-hosted compatibility: **≥ 24.4.2** (unchanged from v9).

### The corrected Release-Health check (supersedes ecosystem-10 §10.3 item 2 + §10.5)
An agent verifying Sentry Release Health is wired must branch on SDK major:
- **SDK ≥ v9 (incl. current v10):** session tracking is via **integrations**, not the
  `autoSessionTracking` flag. Check for `browserSessionIntegration()` (browser/SPA) or
  `httpIntegration` server-side; the flag is gone. A `release` on `Sentry.init()` is still
  required (unchanged).
- **SDK ≤ v8:** the `autoSessionTracking` boolean still applies (the bundle's original guidance).
- Either way: a `release` set + commits associated (`sentry-cli releases set-commits --auto`)
  remain the load-bearing setup (ecosystem-10 §10.3 — still correct).

**Lesson:** "version upgrades of monitoring tools are themselves incidents" (ecosystem-11 §11.6
meta-lesson #1) is *even more* true than the bundle showed — the very option an agent was told to
grep for got removed two majors ago. canary must version-detect the Sentry SDK major before
reasoning about its config. This is the cleanest possible proof of the bundle's own thesis.

---

## 14.5 GAP CLOSED — Prometheus v3.11 is EOL; v3.12 specifics; the dual-track is now 3.5-LTS + 3.12

**Bundle said** (ecosystem-05 §5.3, §13.5 gap #1): "did not crawl per-minor Prometheus CHANGELOG
for v3.11→v3.12 specifics; dual-line LTS/feature fact IS verified."

**Actually true now (gap closed):**
- **Prometheus v3.11 reached EOL 2026-05-14.** (eosl.date/eol/product/prometheus/ via WebSearch,
  2026-06-16.) So the "dual-track" the bundle described is now **3.5 LTS + 3.12 feature** — NOT
  3.11. An agent must not pin to 3.11 (unsupported).
- **v3.12.0 (2026-05-28) specifics** (WebSearch of
  github.com/prometheus/prometheus/releases/tag/v3.12.0, 2026-06-16):
  - **NEW agent-relevant API: `/api/v1/status/self_metrics`** — returns Prometheus's own metrics
    about itself as JSON. This is directly useful for canary "monitoring its own monitoring"
    (ecosystem-11 §11.6 meta-lesson #1) — an agent can pull Prometheus's self-health via one API
    call.
  - **PromQL: experimental `start()`, `end()`, `range()`, `step()` functions** + `resets()` now
    considers start-timestamp resets. (Relevant to the SLO recording rules in ecosystem-07 —
    these give rule authors access to the query window bounds.)
  - **Service discovery:** DigitalOcean Managed Databases + Outscale VM (`outscale_sd_configs`).
  - **Security fixes (an agent must patch past these):** a **remote-write DoS** (snappy
    decompression limit) and a **secret-exposure leak in STACKIT service discovery**. → an agent
    operating Prometheus should treat <v3.12 / <v3.5.x-latest as carrying known CVEs.
- The **3.x feature set the bundle named is correct** (UTF-8 names, native histograms, OTLP
  ingest `/api/v1/otlp/v1/metrics`, remote-write 2.0). The native-histograms-for-accurate-p99
  point (ecosystem-05 §5.3) stands.

**Lesson:** version currency is a *security* concern, not just a feature one — v3.11 EOL + the two
v3.12 CVEs mean canary should flag any Prometheus older than the current LTS/feature heads as a
patch-now item.

---

## 14.6 GAP CLOSED — SLO tooling: stars + current versions (Sloth / Pyrra / slo-generator / OpenSLO)

**Bundle said** (ecosystem-07 §7.5, §13.5 caveat): "named Sloth/Pyrra/Nobl9 but did not
version-verify."

**Actually true now (all verified `gh api repos/<repo>` + `/releases/latest`, 2026-06-16):**

| Tool | Repo | Latest | Released | Stars | Status |
| --- | --- | --- | --- | --- | --- |
| **Sloth** | slok/sloth | **v0.16.0** | 2026-04-04 | **2,504★** | alive (pushed 2026-06-08) |
| **Pyrra** | pyrra-dev/pyrra | **v0.10.0** | 2026-04-30 | **1,521★** | very alive (pushed 2026-06-16) |
| **slo-generator** | google/slo-generator | v2.6.0 | **2024-02-19** | 562★ | ⚠️ **stale releases** (no tag since Feb 2024, though repo pushed 2026-06-03) |
| **OpenSLO** (spec) | OpenSLO/OpenSLO | (no GH releases) | — | 1,500★ | spec, pushed 2025-11-25 |

**Taste / corrected recommendation for canary's SLO tooling pick:**
- **Sloth (2,504★) and Pyrra (1,521★) are the two living Prometheus-native SLO generators** — both
  turn a simple SLO spec into the recording + multi-burn-rate alert rules (ecosystem-07 §7.3/§7.4)
  so canary doesn't hand-write the MWMBR PromQL. **Sloth** = generate-rules-at-CI (static YAML
  output, fits the snap-back/commit model perfectly). **Pyrra** = a running operator + UI
  (Kubernetes-native, also generates rules). For canary's agent-authors-config-as-code model,
  **Sloth is the cleaner fit** (deterministic YAML an agent commits); Pyrra if a live SLO UI/
  operator is wanted.
- ⚠️ **google/slo-generator caution:** the bundle cited it prominently (ecosystem-07 §7.5), but its
  **last *release* is Feb 2024** (v2.6.0) despite recent commits. Prefer Sloth/Pyrra for new work;
  treat slo-generator as reference, not a fresh dependency.
- **OpenSLO** is the vendor-neutral *spec* (1,500★) — useful as the portable SLO definition format,
  but it's a spec not a tool (no releases). Sloth/Pyrra consume SLO definitions.

---

## 14.7 NET-NEW — the agentic-observability instrumentation libraries (who actually EMITS the GenAI spans)

The bundle (ecosystem-02) thoroughly covered the OTel GenAI *semantic conventions* (the attribute
*names*) and the v1.42 move to a dedicated repo — but didn't name the **instrumentation libraries
that actually produce those spans**. For canary this matters: the canary/agentmoney boundary
(ecosystem-00) depends on *something* emitting `gen_ai.client.operation.duration` (canary) and
`gen_ai.usage.*_tokens` (agentmoney) on the same span. The two leading OTel-based emitters
(verified `gh api`, 2026-06-16):

- **`traceloop/openllmetry`** — **7,202★, pushed 2026-06-17.** "Open-source observability for your
  GenAI/LLM application, based on OpenTelemetry." The most-starred GenAI-instrumentation library;
  auto-instruments LLM SDK calls into OTel GenAI spans. This is the de-facto way to *get* the spans
  the boundary reads.
- **`Arize-ai/openinference`** — **1,032★, pushed 2026-06-15.** "OpenTelemetry Instrumentation for
  AI Observability." The other major OTel-native GenAI instrumentation set (Arize/Phoenix
  ecosystem).

**Lesson for canary:** the boundary with agentmoney is only operable if GenAI spans are actually
emitted. The recommended substrate is **OTel + an instrumentation lib (OpenLLMetry being the
popular one)** → both canary (latency/exception attrs) and agentmoney (token attrs) project off
one span (ecosystem-02 §2.3 split). This closes the practical "but who emits the span?" question
the boundary discussion left implicit. NOTE the boundary itself: OpenLLMetry/OpenInference emit
*both* latency and token attributes — canary consumes the former, agentmoney the latter; neither
library is "owned" by either harness, they're the shared producer.

---

## 14.8 Residual gaps after this pass (the honest leftover for GAPS-AND-DISPUTES)

These I still could NOT fully close and they should carry forward:

1. **Sentry product SDK *per-language* changelogs (Python/Go/etc.).** I closed the **JS** SDK
   currency (v10.58.0 + v8→v9→v10 deltas) but did not crawl `@sentry/python`, `sentry-go`, etc.
   per-minor. JS is the fleet's dominant surface, so this is the right one to have closed first,
   but the non-JS SDK currency remains unverified.
2. **PagerDuty MCP exact tool *list*.** Confirmed it's official + its embedded MCP-Apps + that it
   covers incidents/services/schedules/event-orchestrations, but did not enumerate every tool name
   the way ecosystem-09 §9.2 did for the 39 Sentry MCP tools. (The Sentry MCP catalog enumeration
   stands; PagerDuty's is described, not exhaustively listed.)
3. **incident.io official MCP tool list + auth model.** Confirmed it exists, is official (March
   2026), is remote/Streamable-HTTP at docs.incident.io/ai/remote-mcp — but did not enumerate its
   tools or pin its auth scopes.
4. **Better Stack AI SRE + Datadog Bits AI SRE depth.** The bundle (ecosystem-03 §3.3) named them;
   I confirmed the landscape but did not do a hands-on capability comparison of the AI-SRE agents
   (they're canary's direct competitors — worth a dedicated competitive deep-dive later).
5. **Grafana 13.x per-patch contents** (v13.0.0→v13.0.2). The G13 *feature* deltas (gzip-on,
   query sidebar, restore-dashboards GA) are primary-sourced (ecosystem-05 §5.2); the patch-level
   contents are not.

---

## 14.9 The corrected one-paragraph stance (what changed for canary's recommendation)

The prior bundle's recommended stack (ecosystem-13 §13.3) is **still right on the anchors**
(OTel substrate → Sentry for errors/traces/release-health/Seer → Prometheus+Grafana for
metrics/SLO → Checkly for synthetic). The **only material change is the on-call layer**: drop
"Grafana OnCall OSS" (dead, §14.1) and replace with **PagerDuty (official MCP, §14.2)** or
**incident.io (official MCP, §14.2)** for new setups, or **Grafana Cloud IRM** if staying in the
Grafana ecosystem (queryable via the still-alive Grafana MCP OnCall tools, §14.3). Two bonus
upgrades to the agent story: the Grafana MCP's **Sift** AI-investigation tools (§14.3) and Sentry's
move to **OTel v2** in SDK v10 (§14.4) — and a caution that the `autoSessionTracking` grep in the
release-health guidance is **dead on v9+ SDKs** (§14.4), which must be version-branched.

## Sources (this pass — all 2026-06-16)
- `gh api repos/grafana/oncall` (→ `grafana-cold-storage/oncall`, archived:true) + `/commits` —
  OnCall archived, last commit the archival doc-change 2026-03-24.
- WebFetch grafana.com/docs/oncall/latest/set-up/open-source/ — maintenance 2025-03-11, archived
  2026-03-24, Cloud Connection off 2026-03-24, "no new features," Twilio/Pushover fallback, IRM
  successor (verbatim).
- WebSearch grafana.com/docs/grafana-cloud/.../migrate/oncall-oss/ + grafana.com/blog/grafana-
  oncall-maintenance-mode/ — IRM migration order, OnCall+Incident merge.
- `gh api repos/PagerDuty/pagerduty-mcp-server` + README — official MCP, Apache-2.0, Python, 71★,
  `io.github.PagerDuty/pagerduty-mcp`, embedded MCP-Apps, User API Token, `uv run pagerduty-mcp`.
- WebSearch + incident.io/blog/we-built-an-mcp-server… + docs.incident.io/ai/remote-mcp — official
  incident.io MCP (March 2026, remote Streamable-HTTP, superseded the Golang prototype).
- `gh api repos/grafana/mcp-grafana` README — Sift tools (`find_error_pattern_logs`,
  `find_slow_requests`, sift investigations), OnCall tools, Incident RBAC (Viewer/Editor).
- `gh search repos "datadog mcp"` — datadog-labs/mcp-server "Official" (41★).
- `gh api repos/getsentry/sentry-javascript/releases` — v10.58.0 (2026-06-15), weekly minor cadence.
- docs.sentry.io/platforms/javascript/migration/v8-to-v9/ (WebFetch) — autoSessionTracking removed,
  Hub removed, enableTracing→tracesSampleRate, captureUserFeedback→captureFeedback, @sentry/utils→
  core, TS≥5.0.4, ES2020.
- docs.sentry.io/platforms/javascript/migration/v9-to-v10/ (WebSearch) — OTel v2 bump,
  @sentry/node-core escape hatch, sendDefaultPii IP gating, BaseClient→Client,
  hasTracingEnabled→hasSpansEnabled, FID removed, self-hosted ≥24.4.2.
- WebSearch github.com/prometheus/prometheus/releases/tag/v3.12.0 + eosl.date/eol/product/
  prometheus — v3.11 EOL 2026-05-14; v3.12 self_metrics API, experimental start/end/range/step
  PromQL, DO/Outscale SD, remote-write DoS + STACKIT secret-leak security fixes.
- `gh api repos/{slok/sloth,pyrra-dev/pyrra,google/slo-generator,OpenSLO/OpenSLO}` + releases —
  Sloth v0.16.0/2,504★, Pyrra v0.10.0/1,521★, slo-generator v2.6.0 (Feb 2024, stale)/562★,
  OpenSLO 1,500★ (no releases).
- `gh api repos/{traceloop/openllmetry,Arize-ai/openinference}` — OpenLLMetry 7,202★, OpenInference
  1,032★ (the OTel GenAI span emitters behind the canary/agentmoney boundary).
- Cross-ref (corrects/extends): ecosystem-05 §5.3, ecosystem-06 §6.2, ecosystem-07 §7.5,
  ecosystem-09 §9.1, ecosystem-10 §10.3/§10.5, ecosystem-11 §11.1, ecosystem-13 §13.5.
