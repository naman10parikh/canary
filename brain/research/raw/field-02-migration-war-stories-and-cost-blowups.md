---
title: "canary FIELD INTEL — migration war stories + the cost-blowup canon"
type: research
created: 2026-06-16
tags: [canary, field-intelligence, migration, datadog, grafana, cost, cardinality, war-story]
researcher: field-intelligence (CP123 Wave-R)
---

# 02 — Migration war stories + the cost-blowup canon (provider A→B, what broke)

The hard-won lessons engineers only learn AFTER the bill arrives or the migration breaks. Cited.

## 02.1 THE canon: the $65M Datadog bill (the story everyone in this vertical knows)

The single most-cited cost-blowup in observability history. An agent in this domain MUST know it.

- **Customer: Coinbase. Amount: $65M for 2021, billed Q1 2022, settled Q1 2022.** Driven by the
  2021 crypto boom — 11.4M monthly transacting users, 4× YoY. Pragmatic Engineer's framing:
  > "Coinbase had an incredible 2021 and did not have to care about costs."
  — The Pragmatic Engineer, *Datadog's $65M/year customer mystery solved*
  (https://blog.pragmaticengineer.com/datadog-65m-year-customer-mystery/)
- **The HN thread went viral** and "unleashed a wave of similar complaints about complex,
  unpredictable billing" — one engineer reported "a single unexpected month costing $30,000 extra
  in overages." (https://thenewstack.io/datadogs-65m-bill-and-why-developers-should-care/)
- **The structural rule of thumb it produced:**
  > "Above $2–5M/year annual spend is where bringing a vendor in-house tends to come up."
  — Pragmatic Engineer (same URL). This is the build-vs-buy crossover the whole "we migrated off
  Datadog" genre is downstream of.

**The mechanism (this is the canary-actionable part) — the "custom metric tax":**
> "Datadog's billing for custom metrics is based on **cardinality**: the number of unique
> combinations of a metric name and its tags (e.g. host, customer_id, container_id). Custom metrics
> can account for **up to 52% of the total billing**."
> — SigNoz, *Beware these Surprises in Datadog Pricing* (https://dev.to/signoz/beware-these-surprises-in-datadog-pricing-172g)
> and SigNoz SigNal-24 (https://signoz.io/blog/community-update-24/)

→ **Lesson for canary:** cardinality is not an abstract "metrics best practice" — it is the line
item that becomes HALF your observability bill. A `customer_id` or `request_id` tag on a metric is
a financial decision, not a technical one. canary should be able to FLAG high-cardinality label
sets *before* they hit the backend (this is exactly what the OTel Collector `drop`/`transform`
processor is for — see ecosystem-02 and field-03).

## 02.2 Datadog → Grafana: the cost-savings claims (and the honest caveats)

The "we left Datadog" genre, with NUMBERS — but read the caveats, because the framing is vendor-
or convert-biased and the savings are real-but-conditional:

- **"Saved 10s of millions of dollars per year moving from Datadog to internally hosted Grafana."**
  — Team Blind ($DDOG price-target thread)
  (https://www.teamblind.com/post/ddog-price-target-5ffcn67b). Anonymous, big-company scale.
- **"$2,500/mo Datadog → Grafana + Prometheus, 95% of the functionality at zero [license] cost;
  migration took two weeks, saving $30K/year."** — dev.to convert story
  (https://dev.to/inboryn_99399f96579fcd705/7-free-devops-tools-that-replaced-my-5kmonth-saas-stack-2f8o).
  **Caveat canary must state:** "zero cost" ignores the operational cost of *running* Prometheus +
  Grafana yourself (storage, WAL OOMs, on-call for the obs stack itself — see ecosystem-11). The
  honest version is "license cost → operational cost," not "cost → zero."

**TASTE — the convert's reframe (Grafana Labs' own pitch, framing discounted, facts trusted):**
> SREs discover "Datadog becomes expensive when debugging through **unindexed log queries** or
> **high-cardinality custom metrics**." — as summarized for 2026
> (https://pandev-metrics.com/docs/blog/datadog-vs-honeycomb-2026)
The two cost-amplifiers named again: unindexed log search + high-cardinality metrics. Same two
levers, every story.

## 02.3 What actually BREAKS in an observability migration (the unglamorous reality)

This is the part marketing pages skip. Real failure modes from migration write-ups:

1. **Percentile math differs silently between platforms.**
   > "Subtle differences in how platforms calculate percentiles or handle missing data points
   > create **silent failures that take weeks to debug**." (Datadog→Grafana migration analysis,
   > surfaced via Grafana community + groundcover, 2025)
   → Your p99 dashboard can look "fine" post-migration while measuring something different. (Ties
   directly to field-04: percentiles are not portable — you can't average them, and different
   backends bucket histograms differently.)
2. **Label/tag schema mismatch at scale.**
   > "Your old platform stored labels as `env:production` while the new platform wants
   > `environment=production`, and with **10,000 monitors**, updating them all without breaking
   > something is challenging."
   (https://www.groundcover.com/blog/escaping-datadog-how-we-built-an-automated-observability-migration-tool)
3. **Dashboard widgets don't map 1:1.** "Datadog's dashboard widgets don't map cleanly to Grafana
   panels." Hand-rebuild, not auto-convert. (groundcover, same URL; Grafana community forum
   https://community.grafana.com/t/is-there-a-easy-way-to-migrate-datadog-dashboards-to-grafana/156751)
4. **"Took longer and was more difficult than expected"** — the universal migration refrain
   (multiple 2025 IBM/Medium write-ups). Budget 2–4× your estimate.

**canary lesson:** an observability *migration* is itself an incident-prone change that needs
canary-style verification: **run both systems in parallel, diff the p99 and error-rate on the same
traffic, and don't cut over until the numbers MATCH.** The silent-percentile-drift failure is the
exact class of bug canary exists to catch.

## 02.4 The DISPUTE (feeds GAPS-AND-DISPUTES): build vs buy / self-host vs SaaS

- **Self-host-it side:** save 10s of millions, own your data, no cardinality tax (Team Blind,
  dev.to converts above; Grafana Labs blog).
- **Don't-fool-yourself side:** "zero cost" is a lie — you inherit WAL-replay OOMs, retention
  scaling, and on-call for the obs stack (ecosystem-11 breakage data; the operational-cost caveat
  above). And Charity Majors' orthogonal take (field-05): self-hosting *metrics* is optimizing the
  wrong layer entirely — you should move to wide events, not re-host Prometheus.
- **canary's synthesis:** the $2–5M/yr crossover (Pragmatic Engineer) is the honest decision line;
  below it, SaaS + ruthless cardinality discipline beats self-hosting; above it, the math flips —
  but budget the operational tax explicitly. UNSETTLED as a universal rule; capture both sides.

## Sources
- https://blog.pragmaticengineer.com/datadog-65m-year-customer-mystery/ — Coinbase $65M, $2–5M
  in-house crossover (read 2026-06-16)
- https://thenewstack.io/datadogs-65m-bill-and-why-developers-should-care/ — viral HN, $30K overage
- https://dev.to/signoz/beware-these-surprises-in-datadog-pricing-172g + https://signoz.io/blog/community-update-24/ — custom-metric tax = up to 52% of bill, cardinality-priced
- https://www.teamblind.com/post/ddog-price-target-5ffcn67b — "10s of millions" saved self-hosting
- https://dev.to/inboryn_99399f96579fcd705/... — $2.5K/mo→$0 license, 2-wk migration, $30K/yr
- https://www.groundcover.com/blog/escaping-datadog-how-we-built-an-automated-observability-migration-tool — label-schema + 10k-monitor + percentile-drift breakage
- https://pandev-metrics.com/docs/blog/datadog-vs-honeycomb-2026 — unindexed-log + cardinality cost amplifiers
