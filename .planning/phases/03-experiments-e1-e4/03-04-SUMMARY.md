---
phase: 03-experiments-e1-e4
plan: 04
subsystem: testing
tags: [autocannon, loadtest, e2, percentiles, nearest-rank, csv, node-test]

requires:
  - phase: 03-02
    provides: "types, ids, csv (ENV_COLUMNS, writer, raw JSON), classify, config parser helpers, verdict exit codes, autocannon 8 installed"
  - phase: 03-03
    provides: "session (openSession/closeSession/runExperiment/resetAndCheck), ports.waitForPortBudget, reconcile runner, E1 scenario pattern"
provides:
  - "npm run e2: V1 vs V2 through autocannon at 100/300/500 connections, in_stock + sold_out phases per run"
  - "lib/autocannon-phase.ts runPhase: shared-counter setupRequest, onResponse classification, response-event latencies, harness-timed duration, autocannon cross-check"
  - "lib/histogram.ts: nearestRank, summarize, median"
  - "parseE2Args / E2_DEFAULTS / E2_WARMUP / E2_USAGE; judgeE2Run / combineE2 (amended D-25); frozen E2_COLUMNS"
  - "Warm-up per (level x mode), alternating mode order, TIME_WAIT guard before every autocannon call, console medians"
affects: [03-05, 05-report, WEB-08, DOC-02]

actuals:
  tokens: 16500
  tasks: 2
  commits: 3

plan_head_before: daa5e594ce91fe647147cb0b0684c5d334b9be13
plan_head_after: 25db7029e0d476decf2a486de51b9d763730e472

tech-stack:
  added: []
  patterns:
    - "One autocannon invocation per phase; setupRequest takes ids[counter++] from one shared counter; no worker-thread option"
    - "durationMs = last response event - performance.now() just before the call; rps = responses / durationMs x 1000"
    - "connErrors = errors - timeouts; realErrors = s5xx + connErrors + timeouts (no double counting)"
    - "Latency percentiles by nearest rank over Float64Array.sort (numeric), never autocannon histograms"

key-files:
  created:
    - loadtest/lib/histogram.ts
    - loadtest/lib/autocannon-phase.ts
    - loadtest/scenarios/e2-performance.ts
    - loadtest/test/histogram.test.ts
  modified:
    - loadtest/lib/config.ts
    - loadtest/lib/verdict.ts
    - loadtest/lib/csv.ts
    - loadtest/package.json
    - loadtest/test/verdict.test.ts
    - loadtest/test/config.test.ts
    - loadtest/test/csv.test.ts

key-decisions:
  - "Open Question 3: --connections exists for smoke only (needs --smoke); --stock < 1000 and --runs < 5 also need --smoke; stock and soldout-requests must be >= the largest connections value"
  - "Reconcile INVALID (v2, outcome other than clean/drift) is judged on the sold_out row only; the run status is the worse of the two rows"
  - "Sold_out relaxation uses realErrors(in_stock) + realErrors(sold_out), because a timed-out in_stock request may still have created an order server-side"
  - "Warm-up W = min(1000, stock, soldout-requests); a warm-up is never judged except 401 or a bad reset, which make the session INVALID (recorded as run 0)"
  - "Median table covers every measured row with a phase result; NaN values (phase with no responses) are skipped per cell, no run is dropped"

patterns-established:
  - "PacedPhase: waitForPortBudget({ port, planned: connections }) then runPhase; waitedMs goes to raw JSON and to the row note as 'chờ cổng <n> s'"
  - "Raw JSON per run c<c>-<mode>-run<k> and per warm-up c<c>-<mode>-warmup, with full latency arrays and the autocannon cross-check"

requirements-completed: [EXP-05, EXP-06]

coverage:
  - id: D1
    description: "npm run e2 drives autocannon through in_stock and sold_out phases for V1 and V2 and writes frozen-schema e2.csv rows"
    requirement: EXP-05
    verification:
      - kind: e2e
        ref: "npm --prefix loadtest run e2 -- --smoke --runs 1 --stock 1000 --soldout-requests 1000 --connections 100 (exit 0, KẾT LUẬN E2: VALID, header exact, 5 lines)"
        status: pass
      - kind: e2e
        ref: "npm --prefix loadtest run e2 -- --smoke --runs 2 --stock 1000 --soldout-requests 1000 --connections 100,500 (exit 0, 17 lines, order and warm-up files checked)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Harness-computed p50/p95/p99/mean/max by nearest rank and median"
    requirement: EXP-06
    verification:
      - kind: unit
        ref: "loadtest/test/histogram.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "E2 correctness verdict (amended D-25) and combineE2, never judging speed"
    requirement: EXP-06
    verification:
      - kind: unit
        ref: "loadtest/test/verdict.test.ts#judgeE2Run / combineE2"
        status: pass
    human_judgment: false
  - id: D4
    description: "parseE2Args smoke-only small configs and frozen E2 header"
    requirement: EXP-05
    verification:
      - kind: unit
        ref: "loadtest/test/config.test.ts#parseE2Args; loadtest/test/csv.test.ts#tiêu đề E2"
        status: pass
    human_judgment: false
  - id: D5
    description: "Official 5-run E2 session at 100/300/500 connections (numbers for the report)"
    requirement: EXP-05
    verification: []
    human_judgment: true
    rationale: "Per D-33 the official session is run by the user in plan 03-05; the executor only ran smoke sessions"

duration: 9min
completed: 2026-11-09
status: complete
---

# Phase 3 Plan 04: E2 performance harness (V1 vs V2 via autocannon) Summary

**`npm run e2` measures V1 against V2 with autocannon (one distinct user per request from a shared counter) at each connections level. Each run has a timed in_stock phase and a timed sold_out phase. The harness computes nearest-rank p50/p95/p99 and rps from its own response records, counts only 5xx and connection-level failures as real errors, and checks the stock invariants of the amended D-25 rule without ever judging speed.**

## Performance

- **Duration:** about 9 min of execution (timed from 2026-11-09T12:48:59Z, after the reading phase)
- **Started:** 2026-11-09T12:48:59Z
- **Completed:** 2026-11-09T12:58:00Z
- **Tasks:** 2
- **Files modified:** 11 (4 created, 7 modified)

## Accomplishments

- `runPhase` runs one autocannon invocation per phase: one process, pipelining 1, 10 s timeout, fixed `amount`. `setupRequest` takes `ids[counter++]` from one shared counter, and `onResponse` classifies each response by status and JSON code. The instance `"response"` event fills a `Float64Array` of latencies and stamps the last-response time. The result includes `setupCalls`, the ids actually sent, the autocannon counters, and a list of mismatches (none in either smoke session).
- `histogram.ts` provides nearest-rank percentiles on a numeric sort, plus summary statistics and the median.
- `judgeE2Run` implements the amended D-25 rule:
  - INVALID: any 401, `setupCalls` or distinct ids different from the request count, `distinctUsers` different from `orders`, wrong mode, or an unusable V2 reconcile.
  - FAIL: oversell, or (with no real errors) orders different from S.
  - With real errors the rule relaxes to "orders <= S" and the note says `kho chưa hết`.
  - V2 drift or `redisInSync` false is FAIL.
- The E2 scenario runs the full D-24 protocol: levels in the given order, one warm-up per mode per level with no CSV row, alternating start mode, and the TIME_WAIT guard before every autocannon call. It writes two rows per run in the frozen D-26 schema, raw JSON per run and per warm-up, a median table, and `KẾT LUẬN E2: VALID|FAIL|INVALID — ...`.
- Smoke results (environment check only, not report data):
  - V2 had higher rps than V1 in both phases at both levels.
  - Every run was VALID: 1000 × 201 in in_stock, 1000 × `409 SOLD_OUT` in sold_out, V2 reconcile clean, 0 real errors.

## Task Commits

1. **Task 1: Tracer npm run e2** - `8adacbd` (feat)
2. **Task 2: Matrix protocol + unit tests**
   - `9ba4391` (test): E2 percentile, verdict, config and header cases
   - `25db702` (feat): warm-up, alternation, pacing and medians

## TDD Gate Compliance (Task 2, tdd="true")

- **RED** (`9ba4391`): the new cases passed on their first run (266/266). This is the expected unexpected-GREEN: the plan had Task 1 (the tracer) implement these functions first, and Task 2 says "fix Task 1 code only where a case fails". No case failed, so no Task 1 fix was needed.
- **Evidence the tests are not vacuous:** I ran a mutation probe. With `summarize` changed to a lexicographic `Array.sort` and `e2StockCheck` made strict even when real errors exist, `node --import tsx --test --test-reporter=tap test/histogram.test.ts test/verdict.test.ts` exited 1 (79 tests, 75 pass, 4 fail). `gsd-tools check tdd-red-evidence` returned `RED_EVIDENCE_OK` (`target_test_failed`) for the target "sắp xếp theo số, không theo chuỗi: [10, 9, 100] -> p50 10, max 100, mean 39.67". **Semantic assessment:** the target ran and failed on its planned numeric-sort assertion. The other three failures were the planned "kho chưa hết" relaxation cases. There were no load, syntax or fixture faults. The mutations were reverted with `git checkout -- <file>` and never committed.
- **GREEN** (`25db702`): typecheck passes and 266/266 tests pass, including `histogram.test`, the E2 verdict and config cases, and the E2 header case.
- **REFACTOR:** none.

## Files Created/Modified

- `loadtest/lib/histogram.ts`: `nearestRank`, `summarize`, `median`
- `loadtest/lib/autocannon-phase.ts`: `runPhase` and `PhaseResult`
- `loadtest/scenarios/e2-performance.ts`: `npm run e2`, covering warm-up, measured runs, rows, raw JSON, medians and the verdict line
- `loadtest/lib/config.ts`: `E2Config`, `parseE2Args`, `E2_DEFAULTS`, `E2_WARMUP`, `E2_USAGE`. The strict parser now also accepts boolean flags.
- `loadtest/lib/verdict.ts`: `E2Status`, `E2PhaseInput`, `judgeE2Run`, `combineE2`. `exitCodeFor` now accepts `E2Status`.
- `loadtest/lib/csv.ts`: `E2_COLUMNS` (frozen D-26 header)
- `loadtest/package.json`: `e2` script
- `loadtest/test/histogram.test.ts` (new), plus `verdict.test.ts`, `config.test.ts` and `csv.test.ts` (E2 cases)

## Decisions Made

See `key-decisions` in the frontmatter. The most consequential one is that the sold_out row's relaxation counts real errors from both phases. A client timeout in in_stock can still have produced an order, and that order then shows up after sold_out.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] backend/.env missing in the fresh worktree**
- **Found during:** Task 1 precondition
- **Issue:** `backend/.env` is gitignored, so the worktree had none.
- **Fix:** I generated it with the command in `backend/.env.example`. The random `JWT_SECRET` is written straight to the file and never printed. The file is gitignored and not committed. This is the same approach 03-03 used.
- **Verification:** `start:test` health returned 200 with `testMode: true`, and admin login worked.

**2. [Rule 3 - Blocking] The strict CLI parser accepted only string flags**
- **Found during:** Task 1 (`--smoke` is a boolean flag)
- **Fix:** `OptionSpec` now also allows `{ type: "boolean" }`, and a present boolean flag maps to `"true"`. E1 and E3 behave exactly as before, and their tests are unchanged and pass.
- **Files modified:** `loadtest/lib/config.ts`
- **Committed in:** `8adacbd`

**3. [Rule 2 - Correctness] Additional `--connections` validation**
- **Fix:** Duplicate values and empty list items are rejected, in addition to the planned `100,abc`, `0` and out-of-range cases. Measuring the same level twice in one session would skew the medians.
- **Committed in:** `8adacbd` (code), `9ba4391` (tests)

---

**Total deviations:** 3 auto-fixed (2 blocking, 1 correctness). **Impact:** none on the frozen CSV schema or the console contract. No new packages.

## Issues Encountered

- `npm ci` printed that the esbuild postinstall was not approved (install-scripts policy). tsx still works, as in 03-03.
- Smoke environment (D-02, D-33):
  - Nothing was listening on port 5000, so I started `npm --prefix backend run start:test` in the background.
  - No seed was needed, because an active sale existed (v2, totalQty 100). `closeSession` restored it to that state after each session.
  - After the last smoke I stopped only that tree with `taskkill /PID 20568 /T /F`. The tree was npm → cmd → dotenv → server PID 23964, and that server was the only process holding DB connections.
  - I deleted both smoke `e2.csv` files. `git status --porcelain loadtest/results` prints nothing, because `raw/` is ignored.

## User Setup Required

None. The official 5-run E2 session is plan 03-05 (D-33).

## Next Phase Readiness

- Plan 03-05 can run `npm --prefix loadtest run e2` with defaults (5 runs, S = M = 5000, connections 100/300/500) against `npm run start:test`. Expect cool-down waits from the TIME_WAIT guard at the 500 level.
- Phase 5 (WEB-08 chart, DOC-02) reads `loadtest/results/e2.csv` with the frozen header. The README / procedure doc should state the formulas: nearest-rank percentiles, rps = responses / harness duration, and real errors = 5xx + connection errors + timeouts.

## Self-Check: PASSED

- All four created files exist on disk. Commits `8adacbd`, `9ba4391` and `25db702` are on this branch (3 commits since `daa5e59`).
- Re-ran the acceptance criteria:
  - frozen header exact
  - 5 lines (Task 1) and 17 lines (Task 2) with the correct level and mode order
  - 4 warm-up raw files
  - `grep -cE 'workers[[:space:]]*:'` prints 0
  - `import autocannon from "autocannon"` count is 1
  - `git status --porcelain loadtest/results` is empty
- Plan-level verification: typecheck exit 0, tests 266/266, both smoke sessions `KẾT LUẬN E2: VALID` with exit 0.

---
*Phase: 03-experiments-e1-e4*
*Completed: 2026-11-09*
