---
phase: 03-experiments-e1-e4
plan: 03
subsystem: testing
tags: [loadtest, e1, e3, fetch-burst, reconcile, time-wait, csv, node-test]

requires:
  - phase: 03-01
    provides: "POST /api/admin/sales/:id/reset { mode, totalQty }, stats.uniqueOrderIndex, health.testMode/maxPoolSize"
  - phase: 03-02
    provides: "loadtest package: types, ids, csv, env-info, classify, config, verdict"
provides:
  - "lib/admin.ts: createAdminClient (health, login, activeSaleIds, reset, stats with narrowed JSON)"
  - "lib/preflight.ts: checkHealth, resolveSaleId, checkSaleIndex, checkPreRun"
  - "lib/reconcile.ts: runReconcile (shell-less tsx spawn, cwd backend/), classifyReconcile, BACKEND_DIR, TSX_LOADER"
  - "lib/http.ts: buyOnce, burst (all promises created before Promise.all)"
  - "lib/session.ts: openSession / closeSession / runExperiment, Session"
  - "lib/ports.ts: countTimeWait, readNetstat, waitForPortBudget, PORT_BUDGET"
  - "npm run e1 (scenarios/e1-correctness.ts) and npm run e3 (scenarios/e3-duplicate.ts)"
affects: [03-04, 03-05, 03-06, 05-report]

plan_head_before: 17c29e876f2c462dd0c912d1296909e38831c15b
plan_head_after: 617c00a650951b0ca8f2a65e3b2939c81707901d

actuals:
  tokens: 14900
  tasks: 3
  commits: 6

tech-stack:
  added: []
  patterns:
    - "Session skeleton: runExperiment(name, usage, main) + openSession/try/finally closeSession; process.exitCode, never process.exit"
    - "Per-run try/catch of InvalidError so an INVALID run still writes its CSV row and raw JSON before the session stops"
    - "Port guard before every burst: waitForPortBudget({ port: s.port, planned })"
    - "Child processes always spawn(process.execPath | netstat, argv[]) with no shell"

key-files:
  created:
    - loadtest/lib/admin.ts
    - loadtest/lib/preflight.ts
    - loadtest/lib/reconcile.ts
    - loadtest/lib/http.ts
    - loadtest/lib/session.ts
    - loadtest/lib/ports.ts
    - loadtest/scenarios/e1-correctness.ts
    - loadtest/scenarios/e3-duplicate.ts
    - loadtest/test/ports.test.ts
    - loadtest/test/checks.test.ts
  modified:
    - loadtest/package.json

key-decisions:
  - "runReconcile never rejects: spawn errors and timeouts resolve { code: null } so classifyReconcile yields invalid"
  - "waitForPortBudget reports waitedMs only when it actually slept (netstat runtime is not waiting time)"
  - "runExperiment also prints 'KẾT LUẬN EN: INVALID — ...' after the [LỖI] INVALID line so every exit has one final verdict line"
  - "E1/E3 rows stopped before the burst leave measured columns empty rather than 0 (not measured is not zero)"

patterns-established:
  - "Admin JSON narrowing: field(value, key) helper plus per-field typeof checks; missing stats field -> InvalidError naming the field"
  - "Raw JSON per run: <session>-<name>-run<k>-<mode>.json with statsBefore/statsAfter, counts, codes, reconcile output, judgement; no token or password"

requirements-completed: [EXP-01, EXP-02, EXP-03, EXP-04]

coverage:
  - id: D1
    description: "npm run e1 preflights the compiled test-mode server, resets with { mode, totalQty }, bursts 1,000 distinct users per mode, reconciles V2, writes e1.csv in frozen schema and prints the verdict"
    requirement: "EXP-02"
    verification:
      - kind: e2e
        ref: "npm --prefix loadtest run e1 -- --runs 1 (exit 0, KẾT LUẬN E1: PASS, 4-line CSV, v0 oversold 900, v1/v2 orders 100, v2 reconcile clean)"
        status: pass
      - kind: e2e
        ref: "npm --prefix loadtest run e1 -- --runs 2 (exit 0, 7 lines, modes v0 v1 v2 v0 v1 v2, 6 raw JSON files)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Unreachable or untrustworthy environment reports INVALID with exit 2 and never overwrites the previous CSV"
    requirement: "EXP-01"
    verification:
      - kind: e2e
        ref: "npm --prefix loadtest run e1 -- --runs 1 --base-url http://127.0.0.1:5999 (exit 2, [LỖI] INVALID line, e1.csv unchanged at 7 lines)"
        status: pass
      - kind: unit
        ref: "loadtest/test/checks.test.ts#checkHealth, checkPreRun, classifyReconcile"
        status: pass
    human_judgment: false
  - id: D3
    description: "TIME_WAIT port guard: counts sockets to the server port, waits at most 180 s in 5 s polls, skips with one warning when netstat is unavailable"
    requirement: "EXP-02"
    verification:
      - kind: unit
        ref: "loadtest/test/ports.test.ts (10 cases)"
        status: pass
    human_judgment: false
  - id: D4
    description: "npm run e3: one user, 10 concurrent requests, V1 and V2: one 201, nine 409, one order, finalStock 99, no leak, V2 reconcile clean"
    requirement: "EXP-04"
    verification:
      - kind: e2e
        ref: "npm --prefix loadtest run e3 -- --runs 1 (exit 0, KẾT LUẬN E3: PASS, 3-line CSV)"
        status: pass
    human_judgment: false
  - id: D5
    description: "The sale under test is restored to its original mode and totalQty after every session"
    requirement: "EXP-01"
    verification:
      - kind: e2e
        ref: "GET /api/sales/active after each smoke session shows mode v2, totalQty 100 (as found)"
        status: pass
    human_judgment: false

duration: 10min
completed: 2026-11-09
status: complete
---

# Phase 3 Plan 03: E1 and E3 harness Summary

**`npm run e1` and `npm run e3` run against the compiled test-mode server. They preflight the environment, reset the sale through the admin API with `{ mode, totalQty }`, fire fetch bursts with every request in flight at once, reconcile V2 without a shell, pace runs around Windows TIME_WAIT exhaustion, append one frozen-schema CSV row plus one raw JSON file per run, restore the sale, and exit 0/1/2.**

## Performance

- **Duration:** about 10 min
- **Started:** 2026-11-09T12:34:26Z
- **Completed:** 2026-11-09T12:44:54Z
- **Tasks:** 3
- **Files modified:** 11 (10 created, 1 modified)

## Accomplishments

- E1 smoke (`--runs 2`): PASS, exit 0. V0 oversold 234 and 513 (334 and 613 orders on stock 100). V1 and V2 got exactly 100 orders in every run. V2 reconcile was clean.
- E3 smoke (`--runs 1`): PASS, exit 0. V1 and V2 each got one 201 and nine `409 ALREADY_BOUGHT`, one order, and final stock 99 against an expected 99.
- When the server is unreachable, E1 exits 2 with `[LỖI] INVALID: ... (ECONNREFUSED)` and leaves the previous CSV untouched.
- The TIME_WAIT guard is unit-tested on Windows and macOS netstat formats. It only reads and waits: it never changes OS settings or kills processes.
- The test suite went from 179 to 208 tests, all passing. `typecheck` is clean.

## Task Commits

1. **Task 1: Tracer, `npm run e1` end to end** - `eca29ab` (feat)
2. **Task 2: TIME_WAIT pacing, raw JSON, INVALID/FAIL handling (TDD)**
   - RED `93a485b` (test). GREEN `030ce61` (feat). Rule 1 fix `db4754a` (fix). Wiring into E1 `9dea2cb` (feat).
3. **Task 3: `npm run e3`** - `617c00a` (feat)

## Files Created/Modified

- `loadtest/lib/admin.ts`: admin HTTP client. The JWT stays inside a closure. All JSON is narrowed field by field. Network failures become InvalidError with a hint to run `start:test`.
- `loadtest/lib/preflight.ts`: the D-06 checks (health/testMode, sale selection, unique index, pre-run stats).
- `loadtest/lib/reconcile.ts`: `spawn(process.execPath, ["--import", TSX_LOADER, backend/scripts/reconcile.ts, "--sale", id])` with `cwd: backend/`, no shell, and a 30 s kill.
- `loadtest/lib/http.ts`: `buyOnce` never throws or logs. `burst` creates every promise in one `map` before `Promise.all`.
- `loadtest/lib/session.ts`: opens the session. The CSV is created only after preflight passes. Also handles restore in `finally` and the exit codes.
- `loadtest/lib/ports.ts`: netstat TIME_WAIT counter and the bounded wait.
- `loadtest/scenarios/e1-correctness.ts`, `loadtest/scenarios/e3-duplicate.ts`: the experiment entry points.
- `loadtest/test/ports.test.ts`, `loadtest/test/checks.test.ts`: unit tests.
- `loadtest/package.json`: adds the `e1` and `e3` scripts.

## TDD Gate Compliance (Task 2)

- **RED** (`93a485b`): `test/ports.test.ts` was run against a signature-only `lib/ports.ts` stub, so the module loaded and failures were real assertions. Run: `node --import tsx --test --test-reporter=tap test/ports.test.ts` exited 1 with 9 tests, 2 pass, 7 fail. The classifier returned `RED_EVIDENCE_OK` (`target_test_failed`) for the target "chờ hai lần khi TIME_WAIT 9500 rồi 9200 rồi 100 với 1000 socket dự kiến". **Semantic assessment:** the target ran and failed on its planned `deepStrictEqual` over the sleep sequence (`[]` instead of `[5000, 5000]`) because the stub does not wait. There was no load, syntax or fixture fault. The two cases that passed in RED (the `PORT_BUDGET` constant and "empty output gives 0") are ones the stub satisfies trivially.
- `test/checks.test.ts` was also added in the RED commit. It already passed, because `checkPreRun`, `classifyReconcile` and `checkHealth` were built in the Task 1 tracer, as the plan orders. It is regression coverage, not a RED target.
- **GREEN** (`030ce61`): 9/9 ports tests pass.
- **REFACTOR:** none. Commit `db4754a` is a separate Rule 1 bug fix, listed below.

## Decisions Made

- `runReconcile` always resolves. A spawn error or timeout gives `code: null`, which classifies as `invalid`, so a broken reconcile becomes an INVALID run and never an unhandled rejection.
- `runExperiment` prints a `KẾT LUẬN EN: INVALID — ...` line after `[LỖI] INVALID: ...`, so every run ends with exactly one verdict line.
- When a run stops before its burst (guard, reset or stats INVALID), the measured CSV cells are left empty instead of written as 0.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] backend/.env missing in the fresh worktree**
- **Found during:** Task 1 precondition.
- **Issue:** `backend/.env` is gitignored, so the worktree had none. The secret guard blocks copying the main checkout's file, which is correct.
- **Fix:** Generated a new `backend/.env` with the command documented in `backend/.env.example`. It writes a random `JWT_SECRET` straight to the file and never prints it. The admin password comes from the seed constant, not from `.env`. The file is gitignored and was not committed.
- **Verification:** `start:test` health returned 200 with testMode true, and admin login worked.

**2. [Rule 1 - Bug] waitedMs counted netstat runtime as waiting**
- **Found during:** Task 2 smoke (`--runs 2`).
- **Issue:** `waitedMs` was measured from before the first netstat read. That read takes about 50 ms, so every row got a false `chờ cổng 0 s` note.
- **Fix:** `waitedMs` is now reported only when the guard actually slept. Added a regression test where the fake `read` advances the clock without any wait.
- **Files modified:** `loadtest/lib/ports.ts`, `loadtest/test/ports.test.ts`
- **Verification:** the new test failed first, then passed. The repeated `--runs 2` smoke notes show only `cấu hình không mặc định`.
- **Committed in:** `db4754a`

**3. [Plan inconsistency] Numbers in the waitForPortBudget behaviour example**
- **Issue:** the plan's example (counts 9500, 9000, 100 with planned 1000 "sleeps twice") contradicts its own threshold rule (wait while count + planned > 10,000). 9000 + 1000 = 10,000 already fits, so that sequence sleeps only once.
- **Fix:** The test follows the must_have rule. It uses 9500, 9200, 100 to get two sleeps, and adds an explicit "9000 + 1000 = 10000 → no wait" case.

**4. [Acceptance tweak] `grep -c maxBuffer` printed 2**
- **Fix:** reworded the doc comment so `maxBuffer` appears only in the spawn option. The grep now prints 1.

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug), plus 2 minor plan or acceptance alignments.
**Impact on plan:** None on scope. The fixes were needed for honest notes and for the run to work at all.

## Issues Encountered

- `npm ci` printed that the esbuild postinstall was not approved (install-scripts policy). tsx still works, using the platform binary from the optional dependency. Typecheck, tests and every smoke run passed.
- On this machine `netstat -ano` sometimes leaves out LISTENING rows. That doesn't matter to the harness, which counts only TIME_WAIT. The server PID was identified by its MongoDB pool connections before the process tree was stopped.
- Smoke environment (D-02, D-33): I started `npm --prefix backend run start:test` myself because nothing was listening on port 5000. The seed was not needed: one active sale existed (v2, totalQty 100). After the last smoke I stopped only that tree with `taskkill /PID 15852 /T /F`, and its npm parent exited. I deleted the smoke `e1.csv` and `e3.csv`. `git status --porcelain loadtest/results` prints nothing, because raw/ is ignored.

## User Setup Required

None. The official five-run sessions are run by the user in plan 03-05 (D-33).

## Next Phase Readiness

- Plans 03-04 (E2) and 03-06 can import `Session`, `openSession`, `closeSession`, `runExperiment`, `waitForPortBudget`, `runReconcile` and `createAdminClient` as they are.
- Every smoke run found the V0 oversell, the V1/V2 exact-count result and the E3 single-order result. Assumption A5 (V0 oversells every time at 1,000 users on stock 100) held in all 4 V0 smoke runs.

## Self-Check: PASSED

---
*Phase: 03-experiments-e1-e4*
*Completed: 2026-11-09*
