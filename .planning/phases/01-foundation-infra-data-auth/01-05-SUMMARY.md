---
phase: 01-foundation-infra-data-auth
plan: 05
subsystem: auth
tags: [config, node-env, x-test-user, auth-05, gap-closure]

requires:
  - phase: 01-foundation-infra-data-auth (01-01)
    provides: loadBaseConfig, BaseConfig.isTestMode, backend/.env.test and start:test
  - phase: 01-foundation-infra-data-auth (01-04)
    provides: requireAuth/requireAdmin honoring x-test-user only when cfg.isTestMode
provides:
  - isTestMode computed from the raw NODE_ENV with exact equality to "test" (single site in env.ts)
  - end-to-end auth.test cases NODE_ENV -> loadBaseConfig -> requireAuth -> HTTP on /api/admin/thu
  - config.test exactness matrix for isTestMode (whitespace, trim-stripped Unicode, case, look-alike, empty)
affects: [phase-03-load-tests, E1, AUTH-05]

actuals:
  tokens: 6600      # chars/4 over the three changed files (26237 chars); realized diff alone is about 1500
  tasks: 2
  commits: 3        # MEASURED: git rev-list --count 7259933..HEAD before the SUMMARY commit
plan_head_before: 72599335915ef17f47ea697bd4c5d00eef3afadc
plan_head_after: 6cc032c84469760832897aa0292b150b4d97786b

tech-stack:
  added: []
  patterns:
    - "Security flags read the RAW env value with exact equality; trimmed values are for display only"
    - "Test-only config built via loadBaseConfig from an explicit env object, never process.env"

key-files:
  created: []
  modified:
    - backend/src/config/env.ts
    - backend/test/auth.test.ts
    - backend/test/config.test.ts

key-decisions:
  - "isTestMode = env[\"NODE_ENV\"] === \"test\" (raw, no trim, no case folding); nodeEnv stays trimmed for the banner and /api/health (D-14, D-17)"
  - "Display/flag divergence accepted: NODE_ENV \"test \" shows nodeEnv \"test\" while isTestMode is false, which fails closed"

patterns-established:
  - "Raw-value comparison for any env var that toggles a security bypass"

requirements-completed: [AUTH-05]

coverage:
  - id: D1
    description: "A server whose NODE_ENV is \"test \", \" test\" or \"test\\t\" ignores x-test-user end to end (401 on /api/admin/thu); NODE_ENV exactly \"test\" still honors it as role user (403)"
    requirement: AUTH-05
    verification:
      - kind: integration
        ref: "backend/test/auth.test.ts#NODE_ENV thô quyết định x-test-user (loadBaseConfig -> requireAuth)"
        status: pass
    human_judgment: false
  - id: D2
    description: "isTestMode is exact string equality to \"test\": 11 padded/case/look-alike values and empty/whitespace-only values give false; nodeEnv keeps its trimmed display value"
    requirement: AUTH-05
    verification:
      - kind: unit
        ref: "backend/test/config.test.ts#isTestMode chỉ bật khi NODE_ENV đúng chính xác \"test\" (không trim, không đổi hoa thường)"
        status: pass
      - kind: unit
        ref: "backend/test/config.test.ts#NODE_ENV rỗng hoặc chỉ có khoảng trắng: không bật chế độ test, nodeEnv là development"
        status: pass
      - kind: unit
        ref: "backend/test/config.test.ts#nodeEnv vẫn trim để hiển thị nhưng không quyết định chế độ test"
        status: pass
    human_judgment: false
  - id: D3
    description: "npm run start:test still runs in test mode through the committed CRLF backend/.env.test (NODE_ENV exactly \"test\" after --env-file parsing)"
    requirement: AUTH-05
    verification:
      - kind: integration
        ref: "backend/test/integration/health.test.ts#health báo nodeEnv test và server in cảnh báo CHẾ ĐỘ TEST"
        status: pass
    human_judgment: false

duration: 5min
completed: 2026-11-04
status: complete
---

# Phase 1 Plan 05: Exact NODE_ENV check for test mode Summary

**`cfg.isTestMode` is now `env["NODE_ENV"] === "test"` on the raw value, so a padded NODE_ENV such as `"test "` from cmd's `set NODE_ENV=test && npm start` no longer turns on the `x-test-user` identity bypass. This is pinned by end-to-end HTTP cases and an 11-value exactness matrix.**

## Performance

- **Duration:** about 5 min
- **Started:** 2026-11-04T15:37:12Z
- **Completed:** 2026-11-04T15:41:44Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Closed the only gap in 01-VERIFICATION (AUTH-05, ROADMAP Phase 1 SC5). The flag is computed from the raw NODE_ENV in its single site in `backend/src/config/env.ts`. `nodeEnv` stays trimmed for display.
- End-to-end proof through the real stack (`loadBaseConfig` -> `createApp` -> `requireAuth`). Padded values get 401 "Bạn chưa đăng nhập" on `/api/admin/thu`, and exact "test" still gets 403 (header honored as role user).
- Exactness matrix in `config.test`: `"test "`, `" test"`, `"test\t"`, `"\ttest"`, `"test\r"`, `"test\n"`, `"test "`, `"﻿test"`, `"TEST"`, `"Test"` and `"tеst"` all give false. Empty and whitespace-only give false with nodeEnv "development".
- Regression: `npm run start:test`'s path through the committed CRLF `.env.test` still gives NODE_ENV exactly "test" (health.test integration case passes).

## Task Commits

1. **Task 1 (tracer), RED:** `f0d8415` test(01-05): add failing end-to-end cases for padded NODE_ENV and x-test-user
2. **Task 1 (tracer), GREEN:** `3fc7c19` fix(01-05): compute isTestMode from the raw NODE_ENV (exactly "test")
3. **Task 2 (tdd):** `6cc032c` test(01-05): pin exact-match isTestMode semantics in config.test

**Plan metadata:** see the docs(01-05) commit that adds this SUMMARY.

## RED / GREEN evidence

- **Task 1 RED (observed before the src change):** `npm --prefix backend test` gave 130 tests, 127 pass, 3 fail. The failures were exactly the three padded cases (`NODE_ENV "test "`, `" test"`, `"test\t"`), each `AssertionError: 403 !== 401` raised in `expectError` from auth.test. The `"test"` case passed (403). Semantic assessment: the target tests ran and failed on the planned status assertion for the intended reason. The trimmed flag honored the header, which reproduces the verifier's finding through HTTP. These are not load, syntax or fixture failures.
- **Task 1 GREEN:** after the env.ts change, 130/130 pass and typecheck is clean.
- **Task 2 (mutation check, because the fix had already landed):** I temporarily reverted env.ts to `const isTestMode = nodeEnv === "test";`. Result: 133 tests, 128 pass, 5 fail. The new case "isTestMode chỉ bật khi NODE_ENV đúng chính xác ..." failed with `AssertionError: "test "  true !== false`. "nodeEnv vẫn trim để hiển thị ..." also failed, along with the three Task 1 auth cases. I then restored env.ts with `git checkout -- backend/src/config/env.ts` and confirmed it is byte-identical to `3fc7c19`. Semantic assessment: the target case fails on its planned assertion and names the padded value.
- **Final:** typecheck clean; `npm test` 133/133; `npm run test:int` 46/46, including "health báo nodeEnv test và server in cảnh báo CHẾ ĐỘ TEST".

## Acceptance gates (final state)

- `grep -c 'env\["NODE_ENV"\] === "test"' backend/src/config/env.ts` -> 1
- `grep -rnE "===? *['\"]test['\"]" backend/src` -> exactly one line, `backend/src/config/env.ts:126:  const isTestMode = env["NODE_ENV"] === "test";`
- `grep -rln "process.env" backend/src` -> only `backend/src/config/env.ts`
- `grep -c "loadBaseConfig" backend/test/auth.test.ts` -> 5
- `u00a0`, `ufeff` and `NODE_ENV: "test "` are each present in config.test; the existing "NODE_ENV=test bật chế độ test, TEST (chữ hoa) thì không" case is preserved (count 1)
- Only `backend/src/config/env.ts` changed under `backend/src`

## Files Created/Modified

- `backend/src/config/env.ts`: `isTestMode` comes from the raw `env["NODE_ENV"]`; the Vietnamese comment explains the single-site rule and why there is no trim
- `backend/test/auth.test.ts`: local `configFromNodeEnv` helper plus the group "NODE_ENV thô quyết định x-test-user (loadBaseConfig -> requireAuth)" (4 cases)
- `backend/test/config.test.ts`: three new `loadBaseConfig` cases (exactness matrix, empty/whitespace, display versus flag)

## Decisions Made

- Followed the plan: compare the raw value and keep `nodeEnv` trimmed for display (D-14, D-17). No other `loadBaseConfig` output changed.
- Task 1 was committed as a RED `test(...)` commit followed by a GREEN `fix(...)` commit, so the failing-first evidence stays in history. The plan's tracer task would also have allowed a single commit.

## Deviations from Plan

None that change behavior. Two process notes:

- **[Rule 3 - Blocking] Tool escape mangling in config.test (fixed before commit).** The Edit tool wrote ` `, `﻿` and `е` as raw characters, and a follow-up `sed` fix then mangled them further (`\u` is an uppercase operator in GNU sed). I restored the three literals as escape sequences with a small Node script in the scratchpad. A grep for raw Cyrillic, NBSP, BOM, tab and CR bytes now finds nothing. The runtime values were identical throughout, and I re-ran the mutation check on the final escaped file. Committed in `6cc032c`.
- `npm --prefix backend ci` was run because the fresh worktree had no `node_modules` (allowed by the plan; lockfile only, no new packages). npm warned that esbuild's postinstall is not covered by allowScripts; tsx worked regardless.

**Total deviations:** 1 auto-fixed (Rule 3). **Impact:** none on behavior or scope.

## Issues Encountered

None beyond the escape-sequence mangling above.

## Known Stubs

None.

## Threat Flags

None. The change narrows an existing trust boundary (T-01-25 mitigated) and adds no new surface. T-01-26 is mitigated: test:int confirms that start:test's `.env.test` path still gives test mode.

## User Setup Required

None.

## Next Phase Readiness

- The AUTH-05 gap from 01-VERIFICATION is closed. Phase 3 E1 can rely on test mode turning on only through `npm run start:test` (exact "test").
- REQUIREMENTS.md was not edited in this worktree; the orchestrator owns shared-file writes after the wave.
- Accepted divergence (flagged in the plan): a padded NODE_ENV shows `nodeEnv: "test"` in the banner and health while test mode is off. This fails closed (401, and no CHẾ ĐỘ TEST warning).

---
*Phase: 01-foundation-infra-data-auth*
*Completed: 2026-11-04*

## Self-Check: PASSED

- FOUND: backend/src/config/env.ts, backend/test/auth.test.ts, backend/test/config.test.ts
- FOUND commits on this branch: f0d8415, 3fc7c19, 6cc032c
