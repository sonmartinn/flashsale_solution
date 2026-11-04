---
phase: 01-foundation-infra-data-auth
plan: 02
subsystem: database
tags: [express5, error-middleware, mongoose9, mongodb, indexes, node-test]

# Dependency graph
requires:
  - phase: 01-01
    provides: "createApp/AppDeps, connectMongo (autoIndex/autoCreate off), fail(), server.ts boot sequence, test/helpers.ts harness"
provides:
  - "utils/http-error.ts: HttpError(status, message, code) + ErrorCode union (10 Phase 1 codes)"
  - "utils/object-id.ts: normalizeObjectId(value) -> lowercase 24-hex string or null"
  - "middlewares/error.ts: notFound + errorHandler mapping SPECS §7 / D-15 to { message, code }"
  - "app.ts mounts notFound then errorHandler after /api"
  - "models: User (users), Product (products), FlashSale (flash_sales), Order (orders), StockMovement (stock_movements) + ROLES/SALE_MODES/SALE_STATUSES/ORDER_STATUSES and their types"
  - "models/index.ts: allModels + ensureIndexes() (sequential createIndexes, rejects on failure)"
  - "server.ts awaits ensureIndexes() after connectMongo and before Redis/listen; failure -> [LỖI] Không tạo được index MongoDB, exit 1"
affects: [01-03, 01-04, phase-02, phase-03, phase-04]

actuals:
  tokens: 7850       # chars/4 over the realized code diff (31403 chars, 14 files), SUMMARY/REQUIREMENTS excluded
  tasks: 2
  commits: 3         # MEASURED: git rev-list --count 6d449b3..HEAD at SUMMARY write
plan_head_before: 6d449b3f7ef2d01e6365d2f8ac8943221cd25049
plan_head_after: 6d868e2d9683a2bc0232f6d59b913dfac7a29acf

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Handlers throw HttpError(status, Vietnamese message, code); errorHandler is the single place that writes error bodies"
    - "500 body is always { message: 'Lỗi máy chủ, vui lòng thử lại sau', code: 'INTERNAL_ERROR' }; detail goes to console.error on the server only"
    - "Non-JSON body-parser 4xx (413, 415) keep their status with VALIDATION_ERROR / 'Yêu cầu không hợp lệ'"
    - "Single-field unique indexes at field level only, compound indexes only via schema.index() (no duplicates)"
    - "Explicit collection option on every schema; no Mongoose save middleware"
    - "ensureIndexes() is the only index-building path (autoIndex/autoCreate off); awaited before listen"

key-files:
  created:
    - backend/src/utils/http-error.ts
    - backend/src/utils/object-id.ts
    - backend/src/middlewares/error.ts
    - backend/src/models/user.ts
    - backend/src/models/product.ts
    - backend/src/models/flash-sale.ts
    - backend/src/models/order.ts
    - backend/src/models/stock-movement.ts
    - backend/src/models/index.ts
    - backend/test/errors.test.ts
    - backend/test/object-id.test.ts
    - backend/test/integration/models.test.ts
  modified:
    - backend/src/app.ts
    - backend/src/server.ts
    - .planning/REQUIREMENTS.md

key-decisions:
  - "Non-JSON body-parser errors (413/415) keep their HTTP status with code VALIDATION_ERROR (RESEARCH Open Question 1, locked by the plan)"
  - "An empty body with content-type application/json is NOT turned into 400 INVALID_JSON: body-parser parses it to {} and it reaches routing (404 on unknown routes). Forcing a 400 would break bodiless POSTs such as the Phase 2 buy endpoint under autocannon. It never returns 500 (tested)."
  - "stock_movements.reason is free text (no enum); orderId defaults to null"
  - "Index build failure at boot disconnects mongoose and exits 1 with '[LỖI] Không tạo được index MongoDB: <driver message>'"

patterns-established:
  - "Error contract: every API error leaves as JSON { message, code } with content-type application/json; charset=utf-8"
  - "Model files export their enum tuples as const + derived union types; models/index.ts re-exports everything"

requirements-completed: [INFRA-05, DATA-01, DATA-02]

coverage:
  - id: D1
    description: "Every API error reaches the client as Vietnamese { message, code }: unknown route 404 NOT_FOUND, malformed/primitive JSON 400 INVALID_JSON, 200 kB body 413 VALIDATION_ERROR, HttpError keeps status/code, CastError 400 INVALID_ID, ValidationError 400 VALIDATION_ERROR, E11000 409 DUPLICATE, plain Error 500 INTERNAL_ERROR with no leaked text"
    requirement: INFRA-05
    verification:
      - kind: unit
        ref: "backend/test/errors.test.ts#errors.test"
        status: pass
    human_judgment: false
  - id: D2
    description: "normalizeObjectId accepts only 24-hex strings and lowercases them; rejects 23/25 chars, non-hex, joined headers, non-strings"
    requirement: INFRA-05
    verification:
      - kind: unit
        ref: "backend/test/object-id.test.ts#object-id.test"
        status: pass
    human_judgment: false
  - id: D3
    description: "5 SPECS §6 models with explicit collection names and every index (email_1 unique, slug_1 unique, status_1_startAt_1, saleId_1_userId_1 unique, userId_1_createdAt_-1, saleId_1_at_1); remainingQty -5 saves; (saleId, userId) duplicate rejected with 11000; orderId null default; email trimmed + lowercased before the unique index"
    requirement: DATA-01
    verification:
      - kind: integration
        ref: "backend/test/integration/models.test.ts#models.test"
        status: pass
    human_judgment: false
  - id: D4
    description: "Compiled server builds indexes before accepting requests (fresh database has saleId_1_userId_1 once health answers 200) and exits 1 with a Vietnamese message when index creation fails"
    requirement: DATA-02
    verification:
      - kind: integration
        ref: "backend/test/integration/models.test.ts#health 200 và database mới đã có index saleId_1_userId_1 trên orders"
        status: pass
      - kind: integration
        ref: "backend/test/integration/models.test.ts#tạo index thất bại: server thoát mã 1 với thông báo tiếng Việt, không listen"
        status: pass
    human_judgment: false

# Metrics
duration: 6min
completed: 2026-11-04
status: complete
---

# Phase 1 Plan 02: Error contract and MongoDB schema Summary

**Every API error now leaves as Vietnamese JSON `{ message, code }` through `HttpError` + `notFound`/`errorHandler`. The 5 SPECS §6 Mongoose models have explicit collections and every index, including unique `(saleId, userId)`. The server awaits `ensureIndexes()` before it listens and exits 1 if that fails.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-11-04T08:41:06Z
- **Completed:** 2026-11-04T08:47:14Z
- **Tasks:** 2 (Task 1 tracer, Task 2 TDD)
- **Files created/modified:** 14 code/test files + REQUIREMENTS.md

## Accomplishments

- `HttpError(status, message, code)` with the 10-code `ErrorCode` union from D-15, ready for Phase 2 to extend.
- `errorHandler` maps HttpError, CastError, ValidationError, E11000, `entity.parse.failed` and other body-parser 4xx errors. Everything else becomes a generic 500 `INTERNAL_ERROR` without stack, path or original text. It delegates to `next(err)` when headers have already been sent.
- `normalizeObjectId` gives 01-04 (`x-test-user`) and Phase 2 a strict 24-hex check.
- 5 models: `users`, `products`, `flash_sales`, `orders`, `stock_movements`. `remainingQty` has no `min`, so V0 can drive it negative. There is no save middleware.
- `ensureIndexes()` creates collections and indexes in sequence. With `autoIndex`/`autoCreate` off, this is the only index path. `server.ts` awaits it between `connectMongo` and Redis connect/listen.
- Tests: `npm test` 48/48 (adds errors.test and object-id.test). `npm run test:int` 13/13 (health.test and models.test, including both boot cases). No `Duplicate schema index` warnings. `listDatabases` shows only admin/config/local afterwards.

## Task Commits

1. **Task 1: Tracer, Vietnamese { message, code } through the real app** - `2ff7b66` (feat). The tracer gate re-ran `typecheck` + `npm test` (48/48 green) before expansion (interactive, end-of-phase, automated-only verify, so no checkpoint).
2. **Task 2: 5 models + ensureIndexes before listen** - `515d415` (test, RED) then `6d868e2` (feat, GREEN). No refactor commit.

## TDD Gate Compliance (Task 2)

- **RED** (`515d415`): `node --import tsx --test --test-reporter=tap test/integration/models.test.ts` exited 1 with 7 tests: 2 pass, 5 fail. The model schemas existed and `ensureIndexes()` was a no-op stub, so the test loaded and failed on its assertions, not on a missing module. Target test "một user chỉ một đơn mỗi sale: trùng (saleId, userId) bị E11000, sale khác thì được" failed with `Missing expected rejection (isDuplicateKey)`. The collection-name, index-list, email-unique and boot-index tests also failed (empty collection list, `ns does not exist`). Classifier `check tdd-red-evidence`: `RED_EVIDENCE_OK` (`target_test_failed`, format tap). **Semantic assessment:** valid RED. The target ran and failed on the planned assertion for the intended reason: no unique index, because indexes were never built. No load, syntax or fixture faults. The 2 passing tests (remainingQty -5, orderId null) cover schema-level behaviour that does not depend on indexes.
- **GREEN** (`6d868e2`): `ensureIndexes()` now runs `createIndexes()` for each model, and `server.ts` awaits it before listen. All 13 integration tests and 48 unit tests pass.
- **REFACTOR:** none needed.

## Files Created/Modified

- `backend/src/utils/http-error.ts` - `HttpError` class and `ErrorCode` union
- `backend/src/utils/object-id.ts` - `normalizeObjectId`
- `backend/src/middlewares/error.ts` - `notFound`, `errorHandler`
- `backend/src/app.ts` - mounts `notFound` then `errorHandler` after `/api`
- `backend/src/models/{user,product,flash-sale,order,stock-movement}.ts` - the 5 SPECS §6 schemas with enum tuples/types
- `backend/src/models/index.ts` - re-exports, `allModels`, `ensureIndexes()`
- `backend/src/server.ts` - awaits `ensureIndexes()` after `connectMongo`, fail-fast on error
- `backend/test/errors.test.ts`, `backend/test/object-id.test.ts`, `backend/test/integration/models.test.ts` - unit and integration proofs
- `.planning/REQUIREMENTS.md` - INFRA-05 and DATA-01 checked off (DATA-02 is shared with 01-03, see below)

## Decisions Made

- Locked RESEARCH Open Question 1 as planned: 413/415 keep their status with `VALIDATION_ERROR`.
- Empty JSON body: keep body-parser's `{}` behaviour (see Deviations).
- On index failure, `server.ts` calls `mongoose.disconnect()` before `fail()`, matching how the Redis failure path cleans up.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Test for the index-failure exit path**
- **Found during:** Task 2
- **Issue:** The must_have truth "an index build failure exits 1 with a Vietnamese message" had no test in the plan.
- **Fix:** Added a models.test case. It pre-creates a non-unique index named `saleId_1_userId_1` in a fresh `flashsale_test_modelsbadidx_<pid>` database, then spawns the compiled server. It asserts exit 1, `Không tạo được index MongoDB` on stderr and no banner. The database is dropped in `finally`.
- **Files modified:** backend/test/integration/models.test.ts
- **Verification:** test:int 13/13
- **Committed in:** 6d868e2

**2. [Rule 1 - Spec wording] Empty JSON body is not 400 INVALID_JSON**
- **Found during:** Task 1
- **Issue:** One must_have truth says an empty body yields 400 INVALID_JSON. body-parser 2.x special-cases an empty JSON body to `{}` (`node_modules/body-parser/lib/types/json.js:77-80`), so no parse error is raised. The request reaches routing: unknown routes give 404 NOT_FOUND, and real handlers will validate fields and return 400 VALIDATION_ERROR.
- **Fix:** Kept body-parser's behaviour. Turning empty bodies into 400 would break bodiless POSTs (the Phase 2 buy endpoint, autocannon). errors.test asserts the part that matters for INFRA-05: an empty body never yields 500 and still returns a JSON `{ message, code }` error. The behaviour-list cases (malformed `{"a":` and primitive `abc` / `42` give 400 INVALID_JSON) are tested as planned.
- **Files modified:** backend/test/errors.test.ts
- **Committed in:** 2ff7b66

---

**Total deviations:** 2 (1 missing test added, 1 spec-wording clarification)
**Impact on plan:** No change to any export name or signature. Both affect test coverage and documentation only.

## Issues Encountered

- Plan verification item 2 (`mongosh flashsale ... db.orders.getIndexes()` on the **demo** database) was not run. It needs the dev server or seed (01-03) to have run against the demo `flashsale` database, and this plan only touches `flashsale_test_*` databases. The same property is proven on a fresh database by the models.test boot case.
- The per-plan commit ledger file was not written under `.git/worktrees/...` (worktree isolation guard, same as 01-01). The base `6d449b3` was tracked in-session, and `commits: 3` was measured with `git rev-list --count 6d449b3..HEAD`.
- **DATA-02 left unchecked in REQUIREMENTS.md on purpose.** `requirements.ready-ids` reported it as blocked because 01-03 (seed) also declares it. This plan's half of it (server awaits indexes before listen) is done and tested.
- `backend/.env.test` (from 01-01) is still a separate orchestrator item. This plan neither needs nor touches it.

## Known Stubs

None. The `ensureIndexes()` no-op existed only in the RED commit and was replaced in GREEN.

## User Setup Required

None.

## Next Phase Readiness

- 01-03 (seed/reset) can call `connectMongo` → `dropDatabase()` → `ensureIndexes()` → inserts, using the exported models and `normalizeObjectId`.
- 01-04 (auth) can throw `HttpError(..., "EMAIL_TAKEN" | "UNAUTHORIZED" | "INVALID_CREDENTIALS" | "FORBIDDEN")`, use `User` + `ROLES`, and use `normalizeObjectId` for `x-test-user`.
- Phase 2 extends `ErrorCode` with SOLD_OUT, ALREADY_BOUGHT, SALE_NOT_ACTIVE, STOCK_NOT_LOADED, INVALID_MODE.

---
*Phase: 01-foundation-infra-data-auth*
*Completed: 2026-11-04*
