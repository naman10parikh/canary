/**
 * The footgun-detector registry. Each detector encodes one brain pitfall, keyed by §-ID.
 * Order is by §-ID for stable output. (PLAN §4 `canary audit` + brain/KNOWN-PITFALLS.md.)
 */

import type { Detector } from "../types.js";
import { sentryDetectors } from "./sentry-config.js";
import { metricsDetectors } from "./metrics.js";
import { alertingDetectors } from "./alerting.js";
import { prometheusDetectors } from "./prometheus.js";

/** All detectors, in a stable order. */
export const ALL_DETECTORS: Detector[] = [
  ...sentryDetectors, // §1.1 §1b.2 §1b.3 §3.1
  ...alertingDetectors, // §2.1 §8
  ...metricsDetectors, // §5.1 §6.1
  ...prometheusDetectors, // §7.2 §10.3
];
