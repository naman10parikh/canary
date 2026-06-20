/**
 * Metrics footgun detectors (brain/KNOWN-PITFALLS.md §5 cardinality, §6 percentiles).
 *
 * §6.1 (averaging percentiles) is "the shibboleth that identifies someone who's been
 * burned" (OPINIONS B5). §5.1 (unbounded labels) reuses the shared cardinality core so
 * `canary audit` and `canary cardinality` agree on what an unbounded label is.
 */

import type { Detector, Finding } from "../types.js";
import { finding, matchLines } from "./util.js";
import { detectCardinality } from "../../cardinality/detect.js";

/** §5.1 — unbounded metric labels (user_id/request_id/url.path) → series explosion + DoS. */
const unboundedCardinality: Detector = {
  section: "§5.1",
  description: "Unbounded metric labels (user_id/request_id/url.path) → 25B-series blowup + DoS.",
  detect(ctx) {
    // Reuse the shared cardinality core over the same root, then map to audit findings.
    const result = detectCardinality(ctx.root);
    return result.unboundedLabels.map<Finding>((f) => ({
      section: "§5.1",
      pitfall: "unbounded-metric-label",
      file: f.file,
      line: f.line,
      severity: "critical",
      message: `Unbounded label '${f.label}' on a metric — move it to a trace/event and strip it at the Collector (attributes/filter processor). Unbounded values on metrics are a cost bomb AND a DoS surface.`,
    }));
  },
};

/**
 * §6.1 — averaging percentiles in PromQL: avg(per-pod p99) / mean(p95). Percentiles are
 * positions, not arithmetically combinable — aggregate the histogram first, then recompute.
 */
const averagedPercentiles: Detector = {
  section: "§6.1",
  description: "avg()/mean() over per-instance percentiles → under-reports the tail (the shibboleth).",
  detect(ctx) {
    return matchLines(
      ctx,
      // avg( ... p99 ... ) or avg(...quantile...) or mean(...p95...) — the averaged-percentile shape
      /\b(avg|mean)\s*\([^)]*(p9\d|p5\d|quantile|percentile|histogram_quantile)/i,
      (file, line) =>
        finding(
          "§6.1",
          "averaged-percentiles",
          file,
          line,
          "critical",
          "Averaging percentiles — `avg(per-pod p99)` is optimistically wrong (under-reports the tail). Use histogram_quantile(0.99, sum(rate(..._bucket[5m])) by (le)): aggregate the histogram first, then recompute.",
        ),
    );
  },
};

export const metricsDetectors: Detector[] = [unboundedCardinality, averagedPercentiles];
