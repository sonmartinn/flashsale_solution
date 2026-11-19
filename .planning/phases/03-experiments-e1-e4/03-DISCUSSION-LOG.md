# Phase 3: Experiments (E1-E4) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md. This log keeps the alternatives that were considered.

**Date:** 2026-11-09
**Phase:** 03-experiments-e1-e4
**Areas discussed:** none. The user handed every area to Claude.

---

## Area selection

| Option | Description | Selected |
|--------|-------------|----------|
| Kho E1 (100) và E2 (≥1.000) | How to change stock between experiments, who starts the server, where the saleId comes from | |
| Cách đo E2 | Splitting in-stock and sold-out phases, fixed amount or fixed duration, warm-up, V1/V2 ordering | |
| Luật PASS/FAIL/INVALID | Whether V0 must oversell in every run, retries, exit codes, stop or continue on failure | |
| File CSV và E4 | Overwrite or append, row granularity, when to stop MongoDB in E4, error-log flood | |

**User's choice:** "Bạn cứ tự quyết theo khuyến nghị" (free text). Claude decides every area using its recommendations, as in Phases 1 and 2.
**Notes:** No follow-up questions were asked.

---

## Claude's Discretion

All four areas were decided by Claude. The key choices are below; the full list is D-01..D-33 in 03-CONTEXT.md.

- **Stock:** admin reset (and the CLI) accepts an optional `totalQty`. This resolves the Phase 1/2 deferred idea. The harness does not start the server, and the saleId comes from `--sale` or from the single active sale.
- **E2:** each run is one reset followed by two autocannon calls with a fixed `amount`: in_stock (S = 5000) and sold_out (M = 5000). Latency is the harness's own nearest-rank p50/p95. Each block gets one unrecorded warm-up run, and the starting mode alternates between runs.
- **Verdicts:** a run is PASS, FAIL or INVALID. V0 must oversell in every run. There are no retries. An INVALID run stops the experiment, while a FAIL run lets it continue. Exit codes are 0/1/2.
- **CSV:** each session overwrites the file and appends one row per run. Environment columns are on every row. Raw output goes to `results/raw/`, which git ignores. E4 stops MongoDB once 201s reach 30% of stock, reconciles without `--fix`, and runs `--fix` only to show the runbook. The error-log flood during E4 is accepted.

## Deferred Ideas

- The mode-mismatch guard is still not needed.
- Rate-limiting the 500 logs during E4.
- An aggregate E2 CSV, which Phase 5 will compute instead.
- Varying `maxPoolSize` as an E2 dimension.
