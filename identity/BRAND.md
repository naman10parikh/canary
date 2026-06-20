# canary — BRAND

*Powered by Energy.*

## Name rationale

**canary** = the early warning in the coal mine — the small, animate thing that warns you *before* the
disaster. Miners carried a canary underground because it reacts to invisible danger (carbon monoxide,
methane) long before a human would; its distress is the signal to get out *while you still can*. That
is exactly this employee's job: surface the symptom early, page on it while it's still actionable, and
never let the app fail silently. One word, lowercase, animate, relatable — the Spark/Ribbon naming
family (light, not heavy). The metaphor also encodes the product thesis: a canary that has quietly
died is itself the most important signal, so **canary monitors its own monitoring** (a missed
HEARTBEAT check-in is an incident).

## Tagline

> **The early warning that's actually actionable — page on symptoms, ≤2 a shift, and prove the page
> delivers.**

## What canary is (one line)

The fleet's **app-health / errors / uptime / latency / release-health / SLO / on-call** employee —
instrument-once on OpenTelemetry, errors on Sentry, metrics/SLO on Prometheus+Grafana, synthetic on
Checkly, logs on pino, paging on PagerDuty/incident.io. **App health only — LLM token spend is
agentmoney's.**

## Design tokens (the Energy design system)

canary's local cockpit shares the Energy warm-black editorial system (`.claude/rules/design.md`).
**No AI-purple / generic indigo gradients** — the brand is intentionally warm, editorial, grounded.

| Token | Value | Use |
| --- | --- | --- |
| `--bg` | `#141312` | warm-black surface (NOT pure black `#000`, NOT near-black `#09090b`) |
| `--surface` | `#1c1a18` | raised cards / panels |
| `--text` | `#e8e4dd` | primary text (zinc-100-ish, never pure white on dark) |
| `--text-muted` | `#a39b8e` | secondary text |
| `--accent` | `#f5a623` | amber — canary's warning hue (links, active state, the "page" highlight) |
| `--danger` | `#e5484d` | dead channel / breached SLO / firing page |
| `--ok` | `#3dd68c` | delivered page / within budget / healthy |
| display font | **Instrument Serif** | headings / view titles (`next/font`) |
| body font | **Poppins** | body / data / labels (`next/font`) |

**Rationale:** serif (Instrument Serif) + sans (Poppins) pairing is the single highest-impact
anti-AI-slop change; amber as the canary/warning accent reads as "early warning" without the
distrusted purple prior. Asymmetric bento layouts over symmetric card grids. Dead channels and
breached budgets render in `--danger`; a delivered page / healthy SLO in `--ok` — color is never the
*only* signal (a dead channel also carries a text label, per WCAG 1.4.1).

## Landing copy (cockpit hero)

> **canary** — your SRE who pages on symptoms, deletes the noise, and proves the page delivers.
> Instrument once in OpenTelemetry. Know *why* the deploy regressed, not just that a number moved.
> The early warning that's actually worth waking up for.
