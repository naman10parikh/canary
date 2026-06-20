/**
 * Alerting/on-call footgun detectors (brain/KNOWN-PITFALLS.md §2 volume-floor, §8 Alertmanager).
 *
 * OPINIONS A5: "NEVER emit a percentage-threshold alert without a volume floor" — a
 * failure_rate > 5% alert is a lie at low volume (1 error in 3 = 33% = a 3 AM page for
 * nothing). §8.2: send_resolved off → the page never clears, on-call stays anxious on a
 * dead incident (Alertmanager #226, OPEN).
 */

import type { Detector, Finding } from "../types.js";
import { finding, matchLines } from "./util.js";

/**
 * §2.1 — a rate/percentage alert with no volume floor. We flag an alert expr containing a
 * `..._rate ... > <small fraction or N%>` (or an explicit failure_rate/error_rate) that
 * does NOT also contain a `count(...) > N` / `> N AND` volume guard on the SAME expr.
 */
const rateWithoutFloor: Detector = {
  section: "§2.1",
  description: "A failure_rate/error-rate alert with no `count(...) > N` volume floor → 3 AM noise.",
  detect(ctx) {
    const findings: Finding[] = [];
    for (const file of ctx.files) {
      // Only consider rule-ish files (yaml/yml or PromQL); cheap pre-filter.
      const isRuleFile = /\.(ya?ml|promql|rules)$/i.test(file.rel) || /alert\s*:/.test(file.content);
      if (!isRuleFile) continue;

      for (let i = 0; i < file.lines.length; i++) {
        const text = file.lines[i] ?? "";
        // A rate/percentage comparison: failure_rate/error_rate > X, or *_rate... > 0.0x
        const isRateCompare =
          /(failure_rate|error_rate|errors?\s*\/\s*total|:ratio_rate)\s*[^\n]*[><]=?\s*0?\.\d+/i.test(
            text,
          ) || /(failure_rate|error_rate)\b[^\n]*[><]=?\s*\d+\s*%/i.test(text);
        if (!isRateCompare) continue;

        // Look in a small window (this line ± 3) for a volume floor.
        const windowStart = Math.max(0, i - 3);
        const windowEnd = Math.min(file.lines.length, i + 4);
        const windowText = file.lines.slice(windowStart, windowEnd).join("\n");
        const hasFloor =
          /count\s*\([^)]*\)\s*[><]=?\s*\d+/i.test(windowText) ||
          /_count\b[^\n]*[><]=?\s*\d+/i.test(windowText) ||
          /\band\b[\s\S]*?[><]=?\s*\d+\s*$/im.test(windowText);
        if (!hasFloor) {
          findings.push(
            finding(
              "§2.1",
              "rate-alert-no-volume-floor",
              file,
              i + 1,
              "critical",
              "Rate/percentage alert with no volume floor — at low volume 1 error in 3 = 33% = a page for nothing. Add `AND count(...) > N` (e.g. failure_rate > X% AND count(errors) > 100).",
            ),
          );
        }
      }
    }
    return findings;
  },
};

/** §8.2 — a receiver with send_resolved: false → the page never clears. */
const sendResolvedOff: Detector = {
  section: "§8",
  description: "A receiver with send_resolved: false → the resolve never sends; on-call stays anxious.",
  detect(ctx) {
    return matchLines(ctx, /send_resolved\s*:\s*false\b/, (file, line) =>
      finding(
        "§8",
        "send-resolved-off",
        file,
        line,
        "warning",
        "send_resolved: false — the page never clears (Alertmanager #226). Set send_resolved: true where you want resolve notifications, and verify resolves actually arrive.",
      ),
    );
  },
};

export const alertingDetectors: Detector[] = [rateWithoutFloor, sendResolvedOff];
