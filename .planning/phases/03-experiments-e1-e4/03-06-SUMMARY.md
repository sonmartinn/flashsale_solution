---
phase: 03-experiments-e1-e4
plan: "06"
subsystem: testing
tags: [loadtest, redis, mongodb, docker, reconcile, e4]
requires:
  - phase: 03-05
    provides: Official E1, E2, and E3 measurement artifacts and the shared load-test harness.
provides:
  - Reproducible E4 MongoDB-outage harness for V2 with reconciliation and recovery.
  - An operator-produced, committed PASS row documenting undersell-only drift and a clean repair.
affects: [phase-03-review, phase-05-results-chart, phase-05-analysis]
tech-stack:
  added: []
  patterns:
    - Docker control is allow-listed to stop/start only the flashsale-mongo container without a shell.
    - E4 treats MongoDB as the source of truth and records undersell-only Redis drift before the reconcile --fix runbook restores it.
key-files:
  created:
    - loadtest/lib/docker.ts
    - loadtest/scenarios/e4-mongo-outage.ts
    - loadtest/results/e4.csv
  modified:
    - loadtest/lib/config.ts
    - loadtest/lib/verdict.ts
    - loadtest/lib/reconcile.ts
    - loadtest/lib/csv.ts
    - loadtest/package.json
    - loadtest/test/verdict.test.ts
    - loadtest/test/config.test.ts
    - loadtest/test/checks.test.ts
    - loadtest/test/csv.test.ts
    - loadtest/README.md
key-decisions:
  - "D-29 amended: a pre-fix V2 drift is PASS only when it is undersell-only, has no missing Redis buyers, has no oversell, and --fix followed by a re-check is clean."
  - "D-33: the committed E4 result comes from the operator's machine; the agent technical smoke is evidence of harness execution, not the official measurement."
  - "judgeE4Run uses the configured E4 stock, so a stats snapshot cannot redefine the configured stock ceiling."
patterns-established:
  - "E4 records driftUnits beside 5xx counts and preserves a raw JSON evidence file for the session."
requirements-completed: [EXP-08]
actuals:
  tasks: 3
  commits: 5
plan_head_before: 3746cb1b5a611baa4d6792c9664920094e715a15
plan_head_after: 8f08e3ca48e6eebc9b93c2e5e8894ea0d5233223
coverage:
  - id: D1
    description: "E4 safely stops and starts MongoDB during a V2 sale, records the pre-fix drift, and restores consistency with reconcile --fix."
    requirement: EXP-08
    verification:
      - kind: manual_procedural
        ref: "operator session 20261113T161142Z-94ab; loadtest/results/e4.csv; commit 8f08e3c"
        status: pass
      - kind: other
        ref: "loadtest/results/raw/20261113T161142Z-94ab-e4-run1.json"
        status: pass
    human_judgment: true
    rationale: "D-33 requires the official destructive outage measurement to be performed on the operator's machine."
  - id: D2
    description: "E4 argument parsing, frozen CSV header, drift parsing, verdict rules, and recovery runbook are implemented and covered by automated checks."
    requirement: EXP-08
    verification:
      - kind: unit
        ref: "npm --prefix loadtest run typecheck && npm --prefix loadtest test (289/289, 2026-11-13)"
        status: pass
      - kind: other
        ref: "npm --prefix backend run typecheck && npm --prefix backend run build (2026-11-13)"
        status: pass
    human_judgment: false
duration: not-recorded
completed: 2026-11-13
status: complete
---

# Phase 03 Plan 06: E4 MongoDB Outage Summary

**V2 MongoDB-outage harness with an operator-committed PASS result: 408 orders from stock 1,000, 74 units of undersell-only Redis drift, and a clean reconcile repair.**

## Performance

- **Plan duration:** Not recorded; Tasks 1-3 spanned more than one day, so no synthetic elapsed duration is reported.
- **Official session:** `20261113T161142Z-94ab`, written to `loadtest/results/e4.csv` and committed by the operator in `8f08e3c`.
- **Official raw timing:** The matching ignored raw evidence reports `max5xxLatencyMs: 10826.1063` and scenario `durationMs: 29821.4897`.
- **Historical automated checks:** On 2026-11-13, loadtest typecheck and all 289 tests passed; backend typecheck and build also passed. No source code changed after those checks, so they were not rerun for this documentation closeout.

## Official E4 Evidence

- The committed CSV has exactly two lines and its header exactly matches `E4_COLUMNS`; the working-tree file matches commit `8f08e3c` byte-for-byte.
- The one data row is `PASS`, with `stopAfter201=300`, `s201=408`, `s5xx=74`, `driftUnits=74`, `connErrors=0`, `ordersAfter=408`, `redisStockAfter=518`, `redisBuyersAfter=482`, `reconcile=drift`, `fixApplied=yes`, and `reconcileAfterFix=clean`.
- The matching raw JSON confirms 482 distinct requests, zero 401s, zero oversell, zero missing buyers, and 74 extra Redis buyers. Its re-check reports Redis stock 592 equals `1000 - 408` orders with 408 buyers.
- The CSV records source revision `a0da86d`; its tree contains every required E4 implementation, test, and README file. The only delta from that revision to the official data commit is `loadtest/results/e4.csv`.
- Commit `8f08e3c` changes only the official CSV. There is no backend diff since that official result.

## Smoke versus Official Measurement

The technical smoke on 2026-11-12 (`loadtest/results/raw/20261112T060225Z-b87b-e4-run1.json`) proved the compiled harness could stop MongoDB, recover it, and repair the expected drift. It was intentionally not retained as `e4.csv` and does not satisfy D-33. The official finding above comes solely from the operator's 2026-11-13 session and its committed CSV.

## Accomplishments

- Added the E4 scenario that resets V2 stock, stops only `flashsale-mongo` after 30% of stock is sold, waits for in-flight requests, restarts MongoDB, and performs reconcile, `--fix`, and a re-check.
- Added strict E4 configuration, verdict, CSV, drift-parsing, and recovery-runbook coverage, including the frozen `driftUnits` column.
- Preserved the operator's PASS measurement as the official E4 result, including the pre-fix undersell-only evidence and post-fix clean state.

## Task Commits

1. **Task 1: E4 tracer and recovery runbook** — `6eaa9d2` (`feat`)
2. **Task 2: RED tests then configured-stock fix and README** — `df532cd` (`test`), `0e4c7d5` (`feat`)
3. **Task 3: Official E4 operator result** — `8f08e3c` (`data`)

Checkpoint context was recorded in `a0da86d` before the operator committed the official CSV.

## Files Created/Modified

- `loadtest/scenarios/e4-mongo-outage.ts` — E4 outage, recovery, reconciliation, and verdict workflow.
- `loadtest/lib/docker.ts` — shell-free, fixed-container MongoDB start/stop helpers.
- `loadtest/lib/{config,verdict,reconcile,csv}.ts` — E4 flags, safety verdict, drift parsing, and fixed CSV schema.
- `loadtest/test/{verdict,config,checks,csv}.test.ts` — E4 contract tests.
- `loadtest/README.md` — E4 procedure, expected outage behaviour, safety limits, and manual recovery command.
- `loadtest/results/e4.csv` — official PASS data.

## Decisions Made

- Treat 500 responses during the deliberate MongoDB outage as expected recorded evidence, not an invitation to change backend purchase logic in this plan.
- Record a PASS only after the drift is shown to be undersell-only and `reconcile --fix` followed by a fresh check returns clean.
- Preserve D-33 by separating the agent's technical smoke from the operator's official CSV session.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Judged E4 against the configured stock quantity**
- **Found during:** Task 2 RED/GREEN cycle.
- **Issue:** The verdict compared orders against stats.totalQty, allowing a stats snapshot to redefine the stock ceiling. The RED case used 1,001 orders on configured stock 1,000 and a misleading higher stats total.
- **Fix:** Passed the configured total quantity into `judgeE4Run` and added regression cases.
- **Files modified:** `loadtest/lib/verdict.ts`, `loadtest/scenarios/e4-mongo-outage.ts`, `loadtest/test/verdict.test.ts`.
- **Verification:** 289/289 loadtest tests passed on 2026-11-13.
- **Committed in:** `0e4c7d5`.

**Total deviations:** 1 auto-fixed (Rule 1).

## Issues Encountered

None blocking. The intentional MongoDB outage produces a burst of backend 500 responses; the official row records 74 and the documented recovery path completed successfully.

## Next Phase Readiness

EXP-08 now has an official committed PASS artifact. Phase-level review and verification remain for the parent workflow; this Summary does not declare the overall phase complete.

## Self-Check: PASSED

- Summary exists at the expected phase path.
- Task commits `6eaa9d2`, `df532cd`, `0e4c7d5`, and official-data commit `8f08e3c` are ancestors of `HEAD`.
- `e4.csv` has the exact frozen header, exactly two lines, the expected PASS/clean row, and no diff from `8f08e3c`.

---
*Phase: 03-experiments-e1-e4*
*Plan: 06*
*Completed: 2026-11-13*
