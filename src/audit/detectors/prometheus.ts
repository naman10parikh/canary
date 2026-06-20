/**
 * Prometheus + dead-tooling footgun detectors (brain/KNOWN-PITFALLS.md §7.2 EOL, §10.3 dead tools).
 *
 * This vertical's tools DIE (the death-watch class): Prometheus v3.11 EOL 2026-05-14,
 * Opsgenie shutdown Apr 2027, Grafana OnCall OSS archived 2026-03-24. A build that
 * hardcodes a dead recommendation ships a footgun (Risk 5). The `canary audit` contract
 * (§4) explicitly covers "dead on-call tools" and "EOL Prometheus".
 */

import type { Detector, Finding } from "../types.js";
import { finding, matchLines } from "./util.js";

/** §7.2 — running an EOL/CVE Prometheus (v3.11 EOL 2026-05-14). */
const eolPrometheus: Detector = {
  section: "§7.2",
  description: "Prometheus v3.11 is EOL (2026-05-14); v3.12 fixed a remote-write DoS + secret leak.",
  detect(ctx) {
    return matchLines(
      ctx,
      // prom/prometheus:v3.11 or prometheus version 3.11 in a compose/k8s/config file
      /prom(?:etheus)?[:/].*v?3\.11\b|prometheus.*[:=]\s*["']?v?3\.11\b/i,
      (file, line) =>
        finding(
          "§7.2",
          "eol-prometheus-3.11",
          file,
          line,
          "critical",
          "Prometheus v3.11 is EOL (2026-05-14) — run the 3.5 LTS or the 3.12 head (fixed a remote-write DoS + a STACKIT secret leak). Pull /api/v1/status/self_metrics (v3.12+) to monitor Prometheus itself.",
        ),
    );
  },
};

/** §10.3 — dead/dying on-call tools: Opsgenie (shutdown Apr 2027), OnCall OSS (archived). */
const deadOnCallTools: Detector = {
  section: "§10.3",
  description: "Opsgenie (shutdown Apr 2027) / Grafana OnCall OSS (archived 2026-03-24) — dead tooling.",
  detect(ctx) {
    const findings: Finding[] = [];
    findings.push(
      ...matchLines(ctx, /\bopsgenie\b/i, (file, line) =>
        finding(
          "§10.3",
          "dead-tool-opsgenie",
          file,
          line,
          "warning",
          "Opsgenie is shutting down (data deletion Apr 5 2027) — migrate to PagerDuty / incident.io.",
        ),
      ),
    );
    findings.push(
      ...matchLines(ctx, /oncall[-_ ]?oss|grafana[\/-]oncall/i, (file, line) =>
        finding(
          "§10.3",
          "dead-tool-oncall-oss",
          file,
          line,
          "warning",
          "Self-hosted Grafana OnCall OSS was archived 2026-03-24 (Cloud notif bridge severed) — use PagerDuty / incident.io / Grafana Cloud IRM (the managed OnCall is still alive).",
        ),
      ),
    );
    return findings;
  },
};

export const prometheusDetectors: Detector[] = [eolPrometheus, deadOnCallTools];
