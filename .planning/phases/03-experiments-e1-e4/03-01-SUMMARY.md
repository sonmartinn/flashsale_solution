---
phase: 03-experiments-e1-e4
plan: 01
subsystem: api
tags: [express, mongoose, ioredis, admin, cli, git-policy, tdd]

requires:
  - phase: 02-buy-api-v0-v1-v2
    provides: "sale-admin.service (resetSale, getStats), admin routes behind requireAuth + requireAdmin, reset CLI, integration test helpers"
provides:
  - "POST /api/admin/sales/:id/reset accepts { mode?, totalQty? } (totalQty: safe integer 1..1000000, else 400 VALIDATION_ERROR)"
  - "createSaleAdminService().resetSale(id, { totalQty }) with the same service-level check (CLI path)"
  - "GET /api/admin/sales/:id/stats returns twelve fields: the eleven D-25 fields plus uniqueOrderIndex"
  - "npm run reset -- --qty <n> (reuses the seed parseQty, 1..1000000)"
  - "Git policy: loadtest/results/*.csv and .gitkeep committed, raw/ ignored, result CSVs pinned to LF"
affects: [03-experiments-e1-e4 harness/preflight, 04 admin page, 05 charts/analysis]

actuals:
  tokens: 7700
  tasks: 3
  commits: 5
plan_head_before: 360d3b5144c692a8ad3d00b583a5af74e2617be4
plan_head_after: 4cca3cd

tech-stack:
  added: []
  patterns:
    - "Optional reset options built with conditional spreads, validated in the controller (strict typeof number) and again in the service (CLI path)"
    - "Index existence probed with Model.listIndexes() inside the stats Promise.all; MongoServerError code 26 mapped to false"

key-files:
  created:
    - backend/test/integration/harness-support.test.ts
    - .gitattributes
    - loadtest/results/.gitkeep
  modified:
    - backend/src/services/sale-admin.service.ts
    - backend/src/controllers/admin.controller.ts
    - backend/scripts/cli-args.ts
    - backend/scripts/reset.ts
    - backend/test/cli-args.test.ts
    - backend/test/integration/admin.test.ts
    - .gitignore

key-decisions:
  - "totalQty over HTTP is accepted only as a JSON number that is a safe integer in 1..1000000; no string coercion, so \"100\", true, null, arrays and operator objects get 400 VALIDATION_ERROR. The mode check still runs first."
  - "uniqueOrderIndex is true only for a unique index whose key is exactly { saleId: 1, userId: 1 } in that order; a missing orders collection (code 26) answers false, any other listIndexes error is rethrown to the generic 500 handler"
  - "The CLI --qty reuses the seed parseQty (same MAX_QTY 1000000) instead of a second validator"

patterns-established:
  - "harness-support.test.ts owns Redis db 12 and database flashsale_test_harness_<pid>"

requirements-completed: [EXP-01]

coverage:
  - id: D1
    description: "Admin reset over HTTP sets totalQty (MongoDB totalQty/remainingQty, Redis stock, one reset movement, stats) and keeps the current value when the field is absent"
    requirement: EXP-01
    verification:
      - kind: integration
        ref: "backend/test/integration/harness-support.test.ts#tracer: reset đặt lại cỡ kho qua HTTP (D-01)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Ten bad totalQty values answer 400 VALIDATION_ERROR with the sale unchanged; { mode: v3, totalQty: 0 } answers INVALID_MODE; service rejects 0 and 1.5 and accepts 1000000"
    requirement: EXP-01
    verification:
      - kind: integration
        ref: "backend/test/integration/harness-support.test.ts#totalQty sai bị từ chối, đợt sale giữ nguyên (D-01)"
        status: pass
    human_judgment: false
  - id: D3
    description: "stats.uniqueOrderIndex true only for the exact unique (saleId, userId) index; false when dropped, non-unique, reversed key order, or the orders collection is missing; twelve stats keys"
    requirement: EXP-01
    verification:
      - kind: integration
        ref: "backend/test/integration/harness-support.test.ts#stats.uniqueOrderIndex chỉ true khi có đúng index unique { saleId: 1, userId: 1 } (D-07)"
        status: pass
      - kind: integration
        ref: "backend/test/integration/admin.test.ts#ngay sau reset một đợt v2 kho 10: đúng mười hai trường và giá trị ban đầu"
        status: pass
    human_judgment: false
  - id: D4
    description: "npm run reset -- --qty <n> sets the stock from the CLI; invalid --qty exits 1 with the usage line"
    requirement: EXP-01
    verification:
      - kind: unit
        ref: "backend/test/cli-args.test.ts#parseResetArgs"
        status: pass
      - kind: integration
        ref: "backend/test/integration/harness-support.test.ts#npm run reset -- --qty đặt lại cỡ kho từ CLI (D-01)"
        status: pass
    human_judgment: false
  - id: D5
    description: "loadtest/results/*.csv and .gitkeep tracked, raw/ ignored, result CSVs pinned to eol=lf"
    requirement: EXP-01
    verification:
      - kind: other
        ref: "git check-ignore -q loadtest/results/raw/x.json (0); git check-ignore -q loadtest/results/e1.csv (1); git check-ignore -q loadtest/results/.gitkeep (1); git check-attr eol -- loadtest/results/e1.csv = lf"
        status: pass
    human_judgment: false

duration: 12min
completed: 2026-11-09
status: complete
---

# Phase 3 Plan 01: Harness backend support (reset totalQty, uniqueOrderIndex, results git policy) Summary

**Admin reset and `npm run reset` can now set a sale's stock size (`totalQty`, safe integer 1..1,000,000), stats reports `uniqueOrderIndex` from `Order.listIndexes()`, and `loadtest/results/*.csv` is committed with LF endings while `raw/` stays ignored.**

## Performance

- **Duration:** about 12 min
- **Started:** 2026-11-09T12:14:46Z
- **Completed:** 2026-11-09T12:26:24Z
- **Tasks:** 3
- **Files modified:** 10

## Accomplishments
- `POST /api/admin/sales/:id/reset` takes `{ mode?, totalQty? }`. With `totalQty`, MongoDB `totalQty`/`remainingQty`, Redis `stock:<id>` (same checked `multi()`) and the single `reset` stock movement all carry the new value. Without it, the current value is kept.
- Bad `totalQty` is rejected in two places: the controller requires `typeof number` + `Number.isSafeInteger` + 1..1,000,000, and the service checks again for the CLI path. Tests cover ten bad values and confirm the sale is unchanged afterwards.
- `GET /api/admin/sales/:id/stats` has a twelfth field, `uniqueOrderIndex`, which reads indexes as a sixth parallel read in `getStats`. Five index states are tested.
- `npm run reset -- --qty <n>` reuses the seed's `parseQty`, and `RESET_USAGE` lists `[--qty <n>]`.
- Results git policy (D-12): `!loadtest/results/*.csv` in `.gitignore`, a new `.gitattributes` with `loadtest/results/*.csv text eol=lf`, and a new `loadtest/results/.gitkeep`.
- The buy path is untouched: there is no diff in purchase/stock/order services, sale-cache, buy.lua or config/db.ts.

## Task Commits

1. **Task 1: Tracer, HTTP reset with { mode, totalQty }**: `b7daab1` (feat)
2. **Task 2: Bad totalQty rejected, stats.uniqueOrderIndex**: `54e320b` (test, RED), `99acfef` (feat, GREEN)
3. **Task 3: reset --qty CLI and results git policy**: `ad609ac` (test, RED), `4cca3cd` (feat, GREEN)

## TDD Gate Compliance

- Task 2: RED `54e320b`, then GREEN `99acfef`. The RED evidence (TAP from `node --import tsx --test --test-reporter=tap test/integration/harness-support.test.ts`, exit 1, 6 of 23 failing) was classified `RED_EVIDENCE_OK`, target `xóa index saleId_1_userId_1 -> false`. Semantic assessment: the target ran and failed on the planned assertion (`undefined` vs `false`, because the field did not exist yet), with no load, fixture or syntax faults. The 17 passing cases were the Task 1 tracer and the reset-input guards that Task 1 already implemented, which is expected.
- Task 3: RED `ad609ac`, then GREEN `4cca3cd`. The RED evidence (TAP from `node --import tsx --test --test-reporter=tap test/cli-args.test.ts`, exit 1, 2 of 43 failing) was classified `RED_EVIDENCE_OK`, target `nhận --qty cho reset (đặt lại cỡ kho, D-01)`. Semantic assessment: the target failed because `parseResetArgs` rejected `--qty` as an unknown option, so the planned behaviour was absent. The seven rejection cases passed in RED as well, because the unknown-option error is also a `CliArgsError`. They stay as guardrails after GREEN.
- No REFACTOR commits were needed.

## Files Created/Modified
- `backend/src/services/sale-admin.service.ts`: `MAX_TOTAL_QTY`, `ResetOptions.totalQty` with service-level validation, `$set` of totalQty, `SaleStats.uniqueOrderIndex`, and the local `hasUniqueOrderIndex()` (code 26 maps to false)
- `backend/src/controllers/admin.controller.ts`: strict `totalQty` body check after the mode check, conditional-spread options, JSDoc for reset and the twelve-field stats
- `backend/scripts/cli-args.ts`: `ResetArgs.qty`, the `--qty` option through `parseQty`, `RESET_USAGE`
- `backend/scripts/reset.ts`: passes `totalQty: args.qty`, usage comment updated
- `backend/test/integration/harness-support.test.ts` (new, Redis db 12): tracer (3), bad input (10 HTTP + INVALID_MODE ordering + 3 service), CLI (2), uniqueOrderIndex (6)
- `backend/test/integration/admin.test.ts`: `STATS_KEYS` has twelve keys, and the full stats deep-equal includes `uniqueOrderIndex: true`
- `backend/test/cli-args.test.ts`: the Phase 1 "no --qty for reset" test is replaced with the accept and reject cases
- `.gitignore`, `.gitattributes`, `loadtest/results/.gitkeep`: results policy

## Decisions Made
- `9007199254740993` is sent as a raw JSON literal in the test, so JavaScript doesn't round it before sending. The server parses it to `9007199254740992`, which is not a safe integer and gets rejected.
- `STATS_KEYS` is duplicated locally in harness-support.test.ts. Importing it from admin.test.ts would also register that file's tests.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] admin.test full-object stats assertion broke with the new field**
- **Found during:** Task 2 (GREEN run of test:int)
- **Issue:** `admin.test` case "ngay sau reset một đợt v2 kho 10: đúng mười một trường…" deep-equals the whole stats object. RESEARCH Pitfall 10 listed only `STATS_KEYS`, so this case failed once `uniqueOrderIndex` existed.
- **Fix:** Added `uniqueOrderIndex: true` to the expected object and renamed the case to "mười hai trường".
- **Files modified:** backend/test/integration/admin.test.ts
- **Verification:** test:int 198/198, then 200/200 after Task 3
- **Committed in:** `99acfef`

---

**Total deviations:** 1 auto-fixed (1 bug in an existing test expectation)
**Impact on plan:** Required for D-32 (existing tests still pass). No scope creep.

## Issues Encountered
- The fresh worktree had no `backend/node_modules`. `npm --prefix backend ci` installed from the existing lockfile (plan step 0, no new package).

## User Setup Required
None. No external service configuration required.

## Next Phase Readiness
- The Phase 3 harness can reset any sale to the stock it needs (100 for E1/E3, at least 1,000 for E2) over HTTP without reseeding, and its preflight can refuse to measure when `stats.uniqueOrderIndex` is false.
- Summary CSVs written to `loadtest/results/` will be tracked with LF endings, and `loadtest/results/raw/` stays ignored.

---
*Phase: 03-experiments-e1-e4*
*Completed: 2026-11-09*
