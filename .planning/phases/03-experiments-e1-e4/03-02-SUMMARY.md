---
phase: 03-experiments-e1-e4
plan: 02
subsystem: testing
tags: [loadtest, node-test, typescript, csv, autocannon, verdict]

requires:
  - phase: 02-buy-api-v0-v1-v2
    provides: buy-path response codes (SOLD_OUT, ALREADY_BOUGHT, ...) and the SaleStats shape the verdict rules read
provides:
  - loadtest/ npm package (ESM, TypeScript ~7.0.2 strict, NodeNext) with autocannon 8.0.0 locked
  - 24-hex test-user id factory (session prefix + block + counter), unique by construction
  - frozen CSV writer (ENV_COLUMNS, E1_COLUMNS, E3_COLUMNS), UTF-8 no BOM, LF, formula guard, append-as-you-go
  - environment columns (colon-free session id, shell-less git short sha with -dirty that ignores loadtest/results)
  - response classifier (8 buckets, realErrors = 5xx + conn + timeouts)
  - E1/E3 CLI config parsing with env fallbacks (pure, env passed in)
  - PASS/FAIL/INVALID rules for E1 and E3, combineRuns, worstStatus, exit codes 0/1/2
affects: [03-03, 03-04, 03-05, 03-06, phase-05-report]

actuals:
  tokens: 16200      # chars/4 over hand-written files (64,731 chars); package-lock.json (54,606 chars, generated) excluded
  tasks: 3
  commits: 3
plan_head_before: 360d3b5144c692a8ad3d00b583a5af74e2617be4
plan_head_after: bee6b4e0b78de468742622585fac00a572903af6

tech-stack:
  added: [autocannon@8.0.0, "@types/autocannon@7.12.7", "@types/node@^24.19.2", "tsx@4.23.15", "typescript@~7.0.2"]
  patterns:
    - "Harness libraries are pure functions with injected dependencies (env object, GitRunner) so node:test needs no Docker"
    - "Frozen CSV schemas: formatRow throws on unknown or missing keys"
    - "INVALID is evaluated before FAIL in every judge function"

key-files:
  created:
    - loadtest/package.json
    - loadtest/package-lock.json
    - loadtest/tsconfig.json
    - loadtest/lib/ids.ts
    - loadtest/lib/csv.ts
    - loadtest/lib/env-info.ts
    - loadtest/lib/types.ts
    - loadtest/lib/config.ts
    - loadtest/lib/classify.ts
    - loadtest/lib/verdict.ts
    - loadtest/test/ids.test.ts
    - loadtest/test/csv.test.ts
    - loadtest/test/env-info.test.ts
    - loadtest/test/config.test.ts
    - loadtest/test/classify.test.ts
    - loadtest/test/verdict.test.ts
  modified: []

key-decisions:
  - "readGitCommit returns the bare sha (no -dirty) when the porcelain status call itself fails: unknown state is not reported as dirty"
  - "classifyFetchError also treats a TimeoutError/AbortError found in err.cause as a timeout; every other rejection is a connection error, so nothing escapes realErrors"
  - "For V0/V1 in E1, a reconcile outcome of 'invalid' is INVALID; 'n/a' is the normal value. For V2 only 'clean' and 'drift' are usable"
  - "E3 stockLeak for v2 = redisStock != totalQty-1 OR redisBuyers != 1 OR reconcile != clean (D-19); a two-201 run whose stats still show one order is FAIL, while orders != distinctUsers stays INVALID (D-13)"
  - "LOADTEST_ADMIN_PASSWORD is used verbatim (not trimmed); only an all-whitespace value falls back to the seed default"
  - "writeRawJson only accepts a bare file name (no directories, no . or ..)"

patterns-established:
  - "Test file shape: one top-level describe('<file>.test'), Vietnamese it() names, table-driven bad-value loops"
  - "Paths from import.meta.url always go through fileURLToPath (repo path has spaces and Vietnamese characters)"

requirements-completed: [EXP-01, EXP-02, EXP-03, EXP-04]

coverage:
  - id: D1
    description: "loadtest package installs exactly the approved ranges; lockfile resolves autocannon 8.0.0; typecheck passes"
    requirement: EXP-01
    verification:
      - kind: other
        ref: "npm --prefix loadtest ls autocannon -> autocannon@8.0.0"
        status: pass
      - kind: other
        ref: "npm --prefix loadtest run typecheck"
        status: pass
    human_judgment: false
  - id: D2
    description: "Unique 24-hex test-user ids per session"
    requirement: EXP-01
    verification:
      - kind: unit
        ref: "loadtest/test/ids.test.ts#ids.test"
        status: pass
    human_judgment: false
  - id: D3
    description: "CSV writer: frozen E1/E3 headers, UTF-8 no BOM, LF, quoting, formula guard, overwrite then append; real e1.csv written and checked byte by byte"
    requirement: EXP-01
    verification:
      - kind: unit
        ref: "loadtest/test/csv.test.ts#csv.test"
        status: pass
    human_judgment: false
  - id: D4
    description: "Environment columns: session id without colon, git short sha with -dirty excluding loadtest/results"
    requirement: EXP-01
    verification:
      - kind: unit
        ref: "loadtest/test/env-info.test.ts#env-info.test"
        status: pass
    human_judgment: false
  - id: D5
    description: "Response classification into 8 buckets and realErrors"
    requirement: EXP-01
    verification:
      - kind: unit
        ref: "loadtest/test/classify.test.ts#classify.test"
        status: pass
    human_judgment: false
  - id: D6
    description: "E1/E3 CLI config with env fallbacks, bounds, users > stock, no password in errors"
    requirement: EXP-02
    verification:
      - kind: unit
        ref: "loadtest/test/config.test.ts#config.test"
        status: pass
    human_judgment: false
  - id: D7
    description: "judgeE1Run / judgeE3Run / combineRuns / exitCodeFor boundaries (V1/V2 totalQty +-1, V0 oversold 0/1, INVALID before FAIL)"
    requirement: EXP-03
    verification:
      - kind: unit
        ref: "loadtest/test/verdict.test.ts#verdict.test"
        status: pass
    human_judgment: false

duration: 8min
completed: 2026-11-09
status: complete
---

# Phase 3 Plan 02: Loadtest package and pure harness core Summary

**`loadtest/` ESM package with autocannon 8.0.0 locked. Its pure harness core (unique 24-hex test-user ids, frozen E1/E3 CSV writer with environment columns, response classifier, E1/E3 CLI config, and the PASS/FAIL/INVALID rules with exit codes) is pinned by 179 node:test cases that need no Docker.**

## Performance

- **Duration:** about 8 min for this continuation (Tasks 2-3)
- **Started:** 2026-11-09T12:18:15Z
- **Completed:** 2026-11-09T12:25:28Z
- **Tasks:** 3 (1 human-approved checkpoint + 2 executed)
- **Files created:** 16

## Accomplishments
- `loadtest/` is its own package (`"type": "module"`, engines `>=20.19.0`, scripts `typecheck` and `test`). It installs exactly the human-approved ranges, the lockfile resolves `autocannon@8.0.0`, and the tsconfig is the backend one with `include: ["lib", "scenarios", "test"]`.
- `lib/ids.ts`, `lib/csv.ts`, `lib/env-info.ts`: the tracer test writes a real `e1.csv` to a temp dir and checks it at byte level: no BOM, no CR, 3 lines, exact frozen header, a session-id prefix, a negative V0 `finalStock`, a quoted note with a comma, and overwrite on re-create.
- `lib/classify.ts`, `lib/config.ts`, `lib/verdict.ts`, `lib/types.ts`: every behavior case in the plan is a unit test, including the EXP-02 adjacency edges (V1/V2 at totalQty pass, totalQty plus or minus 1 fail; V0 at oversold 0 fails, oversold 1 passes) and the empty-input edges (`--runs 0`, `--users 0`, zero-padded values, users <= stock, `combineRuns([])` is INVALID).

## Task Commits

1. **Task 1: Package legitimacy gate before the first npm install**: no commit (checkpoint `gate="blocking-human"`). The **user approved** exactly `autocannon@^8.0.0`, `@types/autocannon@^7.12.7`, `@types/node@^24.19.2`, `tsx@^4.23.15`, `typescript@~7.0.2`. Nothing else was installed.
2. **Task 2: Tracer (package, ids, csv, env-info with tests)**: `2f6b59c` (feat)
3. **Task 3: E1/E3 config, classification and verdict rules (TDD)**
   - RED: `9cb5b75` (test)
   - GREEN: `bee6b4e` (feat)
   - REFACTOR: none needed

## TDD Record (Task 3)

- **RED:** three test files (`classify.test`, `config.test`, `verdict.test`, 130 cases) committed together with `lib/types.ts` and stubs that only carry signatures and throw `"chưa cài đặt"`. Typecheck passed and all modules loaded, so this was not a load or syntax failure. `npm --prefix loadtest test` exited 1 with 179 tests, 49 pass (the Task 2 suites), 130 fail. Every failure was a target case failing on its own assertion or on the stub's "chưa cài đặt" throw. Semantic assessment: valid RED, because each target ran and failed for lack of the planned behavior. The `tdd-red-evidence` classifier was not run: `workflow.tdd_mode` is not enabled in `.planning/config.json`.
- **GREEN:** I implemented the three modules. `npm --prefix loadtest test` then gave 179/179 pass, and typecheck passed.
- **REFACTOR:** none.

## Files Created/Modified
- `loadtest/package.json`, `loadtest/package-lock.json`, `loadtest/tsconfig.json`: package, lock, strict NodeNext config
- `loadtest/lib/ids.ts`: `createIdFactory`, `countDistinct`, `isTestUserId`
- `loadtest/lib/csv.ts`: `formatCell`, `formatRow`, `createCsvWriter`, `resultPath`, `writeRawJson`, `RESULTS_DIR`, `ENV_COLUMNS`, `E1_COLUMNS`, `E3_COLUMNS`
- `loadtest/lib/env-info.ts`: `newSessionId`, `readGitCommit` (injectable `GitRunner`), `collectEnvInfo`, `envColumns`
- `loadtest/lib/types.ts`: `SALE_MODES`, `SaleMode`, `StatsSnapshot`, `HealthInfo`, `ReconcileOutcome`, `RunStatus`, `InvalidError`
- `loadtest/lib/classify.ts`: `BUCKETS`, `emptyCounts`, `classifyStatus`, `classifyFetchError`, `parseErrorCode`, `realErrors`
- `loadtest/lib/config.ts`: `ConfigError`, `parseE1Args`, `parseE3Args`, `E1_DEFAULTS`, `E3_STOCK`, `E3_REQUESTS`, `E1_USAGE`, `E3_USAGE` (plus the `EnvSource` type)
- `loadtest/lib/verdict.ts`: `judgeE1Run`, `judgeE3Run`, `combineRuns`, `worstStatus`, `exitCodeFor` (plus the `E1RunInput`, `E3RunInput`, `E3Judgement` types)
- `loadtest/test/*.test.ts`: six node:test files, 179 cases

## Decisions Made
See `key-decisions` in the frontmatter. All of them fill in details the plan left open. None of them changes a contract named in the plan's interfaces block. The only additions are the `EnvSource`, `E1RunInput`, `E3RunInput` and `E3Judgement` type exports.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] `writeRawJson` rejects non-bare file names**
- **Found during:** Task 2
- **Issue:** A file name containing a directory or `..` could write outside `results/raw/`.
- **Fix:** It now throws a Vietnamese Error unless `path.basename(fileName) === fileName` and the name is not `.` or `..`.
- **Files modified:** loadtest/lib/csv.ts
- **Committed in:** 2f6b59c

**2. [Plan detail] The RED commit includes `lib/types.ts` and signature-only stubs**
- **Found during:** Task 3
- **Issue:** Tests that import missing modules fail on load (INVALID_RED per tdd.md), not on an assertion.
- **Fix:** The RED commit added `types.ts` (pure types plus `InvalidError`) and stubs that throw `"chưa cài đặt"`. GREEN then replaced the stubs.
- **Committed in:** 9cb5b75 / bee6b4e

---

**Total deviations:** 2 (1 Rule 2 hardening, 1 TDD mechanics)
**Impact on plan:** None on contracts or scope.

## Issues Encountered
- `npm audit` reports 3 moderate advisories: `uuid <11.1.1` via `hyperid` via `autocannon@8.0.0` (GHSA-w5hq-g745-h8pq, a buffer bounds check that only applies when a `buf` argument is passed). The only offered fix is `autocannon@9.0.0`, which the approved range excludes on purpose. autocannon is a dev-side load generator and is not part of the measured system, so I accepted this and did not change it.
- npm warned that `esbuild@0.28.2` has a postinstall script not covered by `allowScripts`. The platform binary `@esbuild/win32-x64` was installed as an optional dependency, and `tsx` runs fine (`tsx v4.23.15`, all tests run through it).
- Git prints "LF will be replaced by CRLF" warnings because `core.autocrlf` is on for this machine. There is no `.gitattributes` in the repo yet. The CSV output itself is written with LF by the code and verified byte by byte.

## User Setup Required
None.

## Next Phase Readiness
- Plans 03-03 to 03-06 can import `lib/{ids,csv,env-info,types,config,classify,verdict}.js` using the names in the plan's interfaces block.
- The scenario plans add the `e1` to `e4` npm scripts. `.gitignore` still ignores all of `loadtest/results/*`. The D-12 change (commit `*.csv`, ignore `raw/`) is not part of this plan.

## Self-Check: PASSED
- All 16 files in key-files.created exist on disk.
- Commits 2f6b59c, 9cb5b75 and bee6b4e are on this branch (`git rev-list --count 360d3b5..HEAD` = 3).
- Acceptance checks re-run. The lockfile exists. `"type": "module"` count is 1, and the include line count is 1. `npm ls` shows `autocannon@8.0.0` and no 9.x. Tests: 179/179 pass. `process.env` count in config.ts is 0. `judgeE1Run` count is 1 and `judgeE3Run` count is 1.
- Plan-level verification: `npm --prefix loadtest run typecheck` exit 0, `npm --prefix loadtest test` exit 0, `npm --prefix loadtest ls autocannon` shows 8.0.0.

---
*Phase: 03-experiments-e1-e4*
*Completed: 2026-11-09*
