---
phase: 01-foundation-infra-data-auth
plan: 06
subsystem: infra
tags: [health, test-mode, node-env, observability, express, gap-closure]

requires:
  - phase: 01-foundation-infra-data-auth
    provides: "01-05 single-site raw isTestMode gate (D-14, AUTH-05), GET /api/health (D-17), boot banner (D-19)"
provides:
  - "GET /api/health body { mongo, redis, nodeEnv, testMode, maxPoolSize }, where testMode = cfg.isTestMode"
  - "BaseConfig.nodeEnv holds the raw NODE_ENV (blank/unset -> development); BaseConfig.testModeNearMiss flag"
  - "Boot banner prints NODE_ENV JSON-quoted; near-miss NODE_ENV prints one [CẢNH BÁO] NODE_ENV=... line"
  - "D-17 amended: Phase 3 preflight (EXP-01) checks testMode === true"
affects: [phase-03-experiments, EXP-01, load-test-preflight]

actuals:
  tokens: 5500
  tasks: 3
  commits: 5
plan_head_before: 452a8fe60caaab2af5360bff474d9d43b42b83db
plan_head_after: 061f671

tech-stack:
  added: []
  patterns:
    - "Display value (raw, lossless) is separate from the decision (isTestMode); health exposes the decision itself"
    - "Near-miss detection only feeds a warning branch, never the decision"

key-files:
  created: []
  modified:
    - backend/src/config/env.ts
    - backend/src/controllers/health.controller.ts
    - backend/src/server.ts
    - backend/test/helpers.ts
    - backend/test/config.test.ts
    - backend/test/integration/health.test.ts
    - .planning/phases/01-foundation-infra-data-auth/01-CONTEXT.md
    - .planning/phases/01-foundation-infra-data-auth/01-VERIFICATION.md
    - .planning/phases/01-foundation-infra-data-auth/01-REVIEW-DISPOSITION.md

key-decisions:
  - "Health exposes testMode (= cfg.isTestMode); the Phase 3 preflight must check testMode === true and never infer test mode from nodeEnv (D-17 amended, UAT test 1 option b)"
  - "nodeEnv is the raw NODE_ENV for display only; the banner prints it JSON-quoted so padding is visible"
  - "testModeNearMiss uses /^test$/i on the trimmed value, adds no second \"test\" equality, and only drives the [CẢNH BÁO] boot line"

patterns-established:
  - "Observability fields report the decision, not a lossy re-derivation of its input"

requirements-completed: [INFRA-04, AUTH-05]

coverage:
  - id: D1
    description: "GET /api/health returns testMode = cfg.isTestMode: true under --env-file=.env.test, false with NODE_ENV unset and with NODE_ENV \"test \" (nodeEnv \"test \")"
    requirement: INFRA-04
    verification:
      - kind: integration
        ref: "backend/test/integration/health.test.ts#health trả testMode false và nodeEnv là giá trị thô \"test \" (không phải \"test\")"
        status: pass
      - kind: integration
        ref: "backend/test/integration/health.test.ts#health báo testMode true, nodeEnv test và server in cảnh báo CHẾ ĐỘ TEST"
        status: pass
      - kind: integration
        ref: "backend/test/integration/health.test.ts#GET /api/health trả 200 với mongo, redis, nodeEnv và maxPoolSize"
        status: pass
      - kind: integration
        ref: "backend/test/integration/health.test.ts#trả 503 { mongo: true, redis: false } trong vòng 3 giây"
        status: pass
    human_judgment: false
  - id: D2
    description: "loadBaseConfig: raw nodeEnv and the testModeNearMiss matrix; isTestMode still decided by the single unchanged raw comparison"
    requirement: AUTH-05
    verification:
      - kind: unit
        ref: "backend/test/config.test.ts#nodeEnv giữ giá trị thô của NODE_ENV; testModeNearMiss báo giá trị gần giống \"test\""
        status: pass
      - kind: unit
        ref: "backend/test/config.test.ts#testModeNearMiss chỉ bật khi NODE_ENV gần giống \"test\" (thừa khoảng trắng hoặc sai hoa thường)"
        status: pass
      - kind: other
        ref: "grep -rnE \"===? *['\\\"]test['\\\"]\" backend/src -> exactly env.ts:139 const isTestMode = env[\"NODE_ENV\"] === \"test\";"
        status: pass
    human_judgment: false
  - id: D3
    description: "Boot banner prints NODE_ENV JSON-quoted; NODE_ENV \"test \" prints one [CẢNH BÁO] NODE_ENV=\"test \" line and no CHẾ ĐỘ TEST; .env.test prints CHẾ ĐỘ TEST and no near-miss line"
    verification:
      - kind: integration
        ref: "backend/test/integration/health.test.ts#banner in NODE_ENV=\"test \" và stderr có đúng dòng [CẢNH BÁO], không có CHẾ ĐỘ TEST"
        status: pass
      - kind: integration
        ref: "backend/test/integration/health.test.ts#banner in NODE_ENV=\"test\" và không có dòng cảnh báo NODE_ENV gần giống"
        status: pass
      - kind: integration
        ref: "backend/test/integration/health.test.ts#banner in maxPoolSize và đích MongoDB, không in URI thô hay khóa JWT"
        status: pass
    human_judgment: false
  - id: D4
    description: "Real cmd.exe `set NODE_ENV=test && npm run start` on the dev machine shows NODE_ENV=\"test \", the [CẢNH BÁO] line and health testMode false"
    verification: []
    human_judgment: true
    rationale: "Task 2 <human-check>: real cmd.exe set/&& behaviour on the dev machine; the automated case passes the padded value through spawn instead"
  - id: D5
    description: "Planning records: D-17/D-19/Integration Points amended, two VERIFICATION overrides, REVIEW CR-01 fixed"
    verification:
      - kind: other
        ref: "gsd-tools query frontmatter.get 01-VERIFICATION.md --field overrides | grep -c accepted_by -> 2"
        status: pass
    human_judgment: false

duration: 8min
completed: 2026-11-06
status: complete
---

# Phase 1 Plan 06: Health testMode and raw NODE_ENV (G-01-1) Summary

**GET /api/health now reports `testMode` (the D-14 decision itself), `nodeEnv` is the raw NODE_ENV shown JSON-quoted in the banner, and a near-miss value such as `"test "` prints a `[CẢNH BÁO]` line, so it can no longer look like test mode while `x-test-user` is rejected.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-11-06T06:48:13Z
- **Completed:** 2026-11-06T06:56:18Z
- **Tasks:** 3
- **Files modified:** 9

## Accomplishments
- Health body is now `{ mongo, redis, nodeEnv, testMode, maxPoolSize }`. The compiled server answers `testMode: true` under `--env-file=.env.test` and `testMode: false, nodeEnv: "test "` under `NODE_ENV="test "`.
- `env.ts` keeps `const isTestMode = env["NODE_ENV"] === "test";` and its three comment lines byte-identical. It is still the only `"test"` equality in `backend/src`, and `env.ts` is still the only `process.env` reader. The new `testModeNearMiss` flag only feeds a warning branch.
- The banner prints `NODE_ENV="development"` / `NODE_ENV="test"` / `NODE_ENV="test "`. A near-miss prints one `[CẢNH BÁO] NODE_ENV="test " ...` line after Mongo and Redis connect, so each boot-failure path still prints only its own `[LỖI]` line.
- D-17 is amended so the Phase 3 preflight (EXP-01) checks `testMode === true`. 01-VERIFICATION has overrides for the superseded 01-05 must-have 5 and the accepted login 401 (UAT test 5), and REVIEW CR-01 is marked fixed.

## Task Commits

1. **Task 1: Tracer, health reports testMode and raw nodeEnv.** RED `df5994c` (test), GREEN `63fa57b` (feat)
2. **Task 2: JSON-quoted banner, near-miss warning, near-miss matrix.** RED `5478c9a` (test), GREEN `e995c1f` (feat)
3. **Task 3: D-17 amended, UAT overrides, CR-01 fixed.** `061f671` (docs)

## TDD / RED Evidence

**Task 1 (tracer), RED at `df5994c`, before any src change:**
- `npm test`: 1 fail of 133. `nodeEnv giữ giá trị thô...` failed with `expected: 'test '`, `actual: 'test'`.
- `npm run test:int`: 4 fail of 47:
  - The deepEqual at the first describe got `{ mongo: true, redis: true, nodeEnv: 'development', maxPoolSize: 100 }` and expected the same object plus `testMode: false`.
  - The in-process 503 deepEqual failed the same way.
  - The `.env.test` case got `testMode` `undefined` and expected `true`.
  - The new padded describe got `testMode` `undefined` and expected `false`.
- Semantic assessment: every target test failed on its planned assertion, because the field was missing and the display value was trimmed. There were no load, fixture or syntax faults.
- GREEN: typecheck exit 0, unit 133/133, integration 47/47, and the "NODE_ENV có khoảng trắng thừa" describe passed. The tracer gate re-ran the verify command, which passed before Task 2 started.

**Task 2 (tdd="true"), RED at `5478c9a`, before the server.ts change:**
- `npm run test:int`: 3 fail of 49. The failing tests were the first describe's banner case (`NODE_ENV="development"`), the `.env.test` banner case (`NODE_ENV="test"`) and the padded banner/`[CẢNH BÁO]` case. Each `waitFor` timed out because the banner printed NODE_ENV unquoted and there was no near-miss line.
- I re-ran the target file with `--test-reporter=tap` (8 tests, 5 pass, 3 fail) and passed it to `gsd-tools check tdd-red-evidence`. The verdict was **RED_EVIDENCE_OK** (`target_test_failed`, format tap, no report errors). Target test: `banner in NODE_ENV="test " và stderr có đúng dòng [CẢNH BÁO], không có CHẾ ĐỘ TEST`.
- Semantic assessment: the target test ran and failed on its planned output assertion for the intended reason. The server was already up and health had answered, so the cause was not startup.
- The config.test near-miss matrix passed in the RED run. That is expected: `testModeNearMiss` landed in Task 1's GREEN, and the plan lists only the banner and stderr assertions as Task 2 RED.
- GREEN at `e995c1f`: typecheck exit 0, build exit 0, unit 134/134 (including "testModeNearMiss chỉ bật khi"), integration 49/49.

## Files Created/Modified
- `backend/src/config/env.ts`: `BaseConfig.testModeNearMiss`, raw `nodeEnv`, `NEAR_MISS_TEST_MODE` regex. The `isTestMode` line is unchanged.
- `backend/src/controllers/health.controller.ts`: adds `testMode: deps.cfg.isTestMode` and a Vietnamese docstring stating that the preflight checks `testMode === true`.
- `backend/src/server.ts`: banner prints `NODE_ENV=${JSON.stringify(cfg.nodeEnv)}`, and a new `else if (cfg.testModeNearMiss)` branch prints the `[CẢNH BÁO]` line.
- `backend/test/helpers.ts`: `testConfig()` sets `testModeNearMiss: false`.
- `backend/test/config.test.ts`: the raw nodeEnv case replaces the trimmed-display case, and the full near-miss matrix is added.
- `backend/test/integration/health.test.ts`: `testMode` in every body assertion, the compiled-server `NODE_ENV: "test "` describe, and the banner and warning checks.
- `.planning/phases/01-foundation-infra-data-auth/01-CONTEXT.md`: D-17, D-19 and Integration Points amended.
- `.planning/phases/01-foundation-infra-data-auth/01-VERIFICATION.md`: frontmatter `overrides:` with two entries.
- `.planning/phases/01-foundation-infra-data-auth/01-REVIEW-DISPOSITION.md`: CR-01 is `fixed`, and `open` goes from 3 to 2.

## Decisions Made
- The banner and the warning print `JSON.stringify(cfg.nodeEnv)`, so invisible padding (`"test\t"`, `"test "`) shows up in a terminal.
- The near-miss warning wording follows the plan's suggestion: `[CẢNH BÁO] NODE_ENV="test " gần giống "test" nhưng không khớp chính xác (...): chế độ test KHÔNG bật, header x-test-user bị bỏ qua. Đặt đúng NODE_ENV=test hoặc chạy npm run start:test.`
- `testModeNearMiss: false` in `helpers.testConfig()` went into the GREEN commit, as the plan's step 5 places it, not into the RED commit.

## Deviations from Plan

None. The plan was executed as written.

## Issues Encountered
- The worktree had no `backend/node_modules`. `npm --prefix backend ci` installed from the lockfile, as action step 1 prescribes, with no new packages.

## Known Stubs

None.

## User Setup Required

None. No external service configuration is required.

## Next Phase Readiness
- G-01-1 is closed. Phase 3's E1 harness can treat `GET /api/health` → `testMode === true` as its only test-mode preflight signal.
- One human check remains for end-of-phase UAT (D4): run `set NODE_ENV=test && npm run start` in real cmd.exe.

## Self-Check: PASSED
- All 9 modified files exist, and the commits df5994c, 63fa57b, 5478c9a, e995c1f and 061f671 are on branch worktree-agent-a20a70b4179fea49d.
- I re-ran every acceptance criterion for Tasks 1, 2 and 3, and each gave its expected value.
- Plan-level verification: typecheck, build, `npm test` (134/134) and `npm run test:int` (49/49) exit 0. The single-site grep prints only env.ts:139, and `process.env` appears only in env.ts.

---
*Phase: 01-foundation-infra-data-auth*
*Completed: 2026-11-06*
