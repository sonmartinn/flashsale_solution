---
phase: 02-buy-pipeline-admin-apis
plan: 03
subsystem: api
tags: [compensation, mongoose, ioredis, multi, stock_movements, node-test]

requires:
  - phase: 02-buy-pipeline-admin-apis
    provides: "02-01 purchase service (V0/V1/V2 handlers, createOrder seam), shared createOrder + isDuplicateKeyError, Lua buy script, test helpers"
provides:
  - "V1/V2 stock compensation when the order insert fails after the stock step (D-08, D-10, D-11, D-12 as amended)"
  - "optional findOrder seam on createPurchaseService (FindOrderFn type)"
  - "stock_movements reasons compensate_v1 / compensate_v2 (delta +qty, orderId null)"
  - "compensation.test integration suite (Redis db 8) covering every D-10/D-12 branch, the silent success path and the E3 precondition"
affects: [03-load-experiments, 05-docs, E3]

actuals:
  tokens: 8300
  tasks: 2
  commits: 3
plan_head_before: 9b18ba0a9e63ab9a70045a223b9a24baefe08f9f
plan_head_after: 1b497cf4ef064c7a1bac305ce4914337fa9b37dc

tech-stack:
  added: []
  patterns:
    - "compensate(mode, err, input): E11000 -> refund stock only; other error -> lookup, then ok / refund+rethrow / rethrow without refund"
    - "refundFailure helper: single console.error call site, new Error(message, { cause: original })"
    - "failure injection through real collection validators (collMod) and non-numeric Redis values instead of mocks"

key-files:
  created:
    - backend/test/integration/compensation.test.ts
  modified:
    - backend/src/services/purchase.service.ts

key-decisions:
  - "V0 keeps its own insertOrder (no refund, D-09); V1/V2 go through insertOrderOrCompensate"
  - "findOrder is a second optional seam (default Order.findOne({ saleId, userId }).lean()) so the lookup-throws branch is testable without breaking the database"
  - "compensate_v1/compensate_v2 are spelled out in a const map instead of a template string, so the reasons stay greppable"

patterns-established:
  - "Failure-path-only logging: exactly two console.error call sites in purchase.service.ts (refund failed, stock_movements write failed)"
  - "Test helper mapThroughErrorHandler(err): run the real errorHandler with a response stub to assert the HTTP status/code of a service rejection"

requirements-completed: [BUY-05, BUY-07, BUY-08]

coverage:
  - id: D1
    description: "E11000 after the stock step answers 409 ALREADY_BOUGHT in V1 and V2, refunds the unit (V2 INCRBY only, buyer kept) and writes one compensate row"
    requirement: BUY-05
    verification:
      - kind: integration
        ref: "backend/test/integration/compensation.test.ts#tracer: E11000 sau bước trừ kho"
        status: pass
    human_judgment: false
  - id: D2
    description: "Non-E11000 insert failure follows D-10 in V1 and V2: order exists -> ok with no refund, no order -> refund + compensate row + original error, lookup throws -> no refund"
    requirement: BUY-07
    verification:
      - kind: integration
        ref: "backend/test/integration/compensation.test.ts#V1: lỗi ghi đơn không phải E11000 (D-10)"
        status: pass
      - kind: integration
        ref: "backend/test/integration/compensation.test.ts#V2: lỗi ghi đơn không phải E11000 (D-10, D-11)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Every refund-failure branch (V1/V2 x E11000/other) throws a new Error with the original as cause, logs one line, maps to 500 INTERNAL_ERROR (never 409 DUPLICATE), also over HTTP"
    requirement: BUY-05
    verification:
      - kind: integration
        ref: "backend/test/integration/compensation.test.ts#hoàn kho thất bại sau E11000 (D-12 sửa đổi 2026-11-08)"
        status: pass
      - kind: integration
        ref: "backend/test/integration/compensation.test.ts#V1 hoàn kho thất bại sau lỗi ghi đơn"
        status: pass
      - kind: integration
        ref: "backend/test/integration/compensation.test.ts#V2 hoàn kho thất bại (multi báo lỗi INCRBY)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Successful buys in all three modes write no stock_movements row and no console output; a failed stock_movements write logs once and keeps the refund"
    requirement: BUY-08
    verification:
      - kind: integration
        ref: "backend/test/integration/compensation.test.ts#mua thành công một lần mỗi mode qua service"
        status: pass
      - kind: integration
        ref: "backend/test/integration/compensation.test.ts#V1 ghi stock_movements lỗi"
        status: pass
    human_judgment: false
  - id: D5
    description: "One user's 10 concurrent buys yield exactly one order: V1 remainingQty 9, V2 stock 9 and SCARD 1 (E3 precondition)"
    requirement: BUY-05
    verification:
      - kind: integration
        ref: "backend/test/integration/compensation.test.ts#E3: một user bắn 10 request song song"
        status: pass
    human_judgment: false

duration: 10min
completed: 2026-11-08
status: complete
---

# Phase 2 Plan 03: V1/V2 Stock Compensation Summary

**V1 and V2 now give stock back when the order insert fails after the stock step. E11000 refunds the unit and answers ALREADY_BOUGHT, and V2 keeps the buyer in the set. Any other error is resolved with an order lookup (D-10) and always errs toward underselling. A failed refund becomes a 500 that carries the original error as `cause`. Every successful refund leaves one `compensate_v1`/`compensate_v2` stock_movements row.**

## Performance

- **Duration:** about 10 min
- **Started:** 2026-11-08T12:24:27Z
- **Completed:** 2026-11-08T12:33:51Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- `compensate(mode, err, input)` in `purchase.service.ts`, used by both V1 and V2:
  - On E11000 it refunds stock only (V1 `$inc`, V2 `INCRBY`, no `SREM`) and returns `already_bought`.
  - On any other error it looks the order up. If the order exists it returns `ok`. If there is no order it refunds and rethrows. If the lookup itself throws it rethrows without refunding.
- The V2 refund for the "no order" case runs `INCRBY` + `SREM` in one `multi()`. Every `[err, res]` pair is checked, and a `null` result is treated as an aborted transaction.
- `refundFailure` is the only place that logs a failed refund. It prints one `[Bù trừ] Hoàn kho thất bại saleId=… userId=… mode=…` line and returns `new Error("Hoàn kho thất bại sau lỗi trùng đơn" | "Hoàn kho thất bại sau lỗi ghi đơn", { cause })`. `errorHandler` answers that with 500 INTERNAL_ERROR.
- `recordCompensation` writes the audit row only after a successful refund. If the write fails it prints one line and the refund and response are unchanged.
- New optional `findOrder?: FindOrderFn` seam. The default is `Order.findOne({ saleId, userId }).lean()`, and existing callers are unaffected.
- `compensation.test.ts` has 16 cases on real MongoDB and Redis db 8. Failures are injected through `collMod` validators and a non-numeric `stock:<id>`, and every refund-failure case is also run through the real `errorHandler`.

## Task Commits

1. **Task 1 (tracer): E11000 refund in V1/V2 with one compensate row**: `019544e` (feat)
2. **Task 2 RED: failing D-10 / refund-failure / success-path / E3 cases**: `64dc718` (test)
3. **Task 2 GREEN: findOrder seam and D-10 non-E11000 branch**: `1b497cf` (feat)

No REFACTOR commit was needed.

## TDD Gate Compliance

- **RED** (`64dc718`): `node --import tsx --test --test-reporter=tap test/integration/compensation.test.ts` exited 1 with 7 of 16 tests failing. The classifier `check tdd-red-evidence` returned `RED_EVIDENCE_OK` (`target_test_failed`) for the target test "V1 chưa có đơn: hoàn kho, một dòng compensate_v1, ném lại đúng lỗi gốc, không log".
  - Semantic assessment: all 7 failures were assertions on the planned D-10/D-12 behavior, with no load or fixture errors. The failures were remainingQty 4 vs 5 and Redis stock "4" vs "5" (no refund), the original error thrown where `ok` was expected, the old message instead of "Hoàn kho thất bại sau lỗi ghi đơn", and 0 vs 1 `console.error` call.
  - The 9 tests that already passed cover behavior Task 1 had already built: the E11000 branches, the success path and E3. The two "lookup throws" cases also passed, because the pre-GREEN code already rethrew without refunding.
- **GREEN** (`1b497cf`): 16 of 16 pass. The full `test:int` run (144 tests) and the unit run (164 tests) pass.
- **REFACTOR:** none.

## Files Created/Modified
- `backend/src/services/purchase.service.ts`: compensation for V1 and V2, the `findOrder` seam and `FindOrderFn` type, and the `refundStock`, `recordCompensation` and `refundFailure` helpers. V0 is unchanged and still has no refund.
- `backend/test/integration/compensation.test.ts`: the compensation matrix, run both over HTTP and directly through the service seams.

## Decisions Made
- V0 keeps its own `insertOrder` (E11000 maps to ALREADY_BOUGHT, nothing is refunded, D-09). V1 and V2 use `insertOrderOrCompensate`.
- The reasons are spelled out in a `COMPENSATE_REASON` map instead of being built with `"compensate_" + mode`, so the literal `compensate_v1`/`compensate_v2` strings stay greppable (plan key_link pattern `compensate_v`).
- If the V1 refund `updateOne` matches no document (the sale was deleted), that is not treated as a refund failure. A deleted sale has no stock left to restore.

## Deviations from Plan

None. The plan was executed as written.

## Issues Encountered
- The worktree had no `backend/node_modules`. I ran `npm ci` from the existing lockfile, which the plan's T-02-SC mitigation allows. No new packages were added.

## Known Stubs
None.

## Threat Flags
None. No new endpoints or trust boundaries were added. The log lines carry only saleId, userId, mode and the error message (T-02-12).

## User Setup Required
None. No external service configuration is required.

## Next Phase Readiness
- Phase 3 E3 (one user, 10 concurrent requests) has its precondition proven at service level: one order, with no leak in V1 or V2.
- Known limits, for the Phase 5 docs:
  - V1's refund is not atomic with the failed insert. Another buyer can briefly see a false SOLD_OUT, and a crash between the decrement and the refund leaves an undersell.
  - A V2 `multi()` whose INCRBY fails still runs SREM. That case is reported as a 500, and `reconcile --fix` repairs the state.
  - D-10's "order exists" check may find an older order from a repeat buyer (RESEARCH Pitfall 12), which means an undersell, never an oversell.

## Self-Check: PASSED
- FOUND: backend/src/services/purchase.service.ts
- FOUND: backend/test/integration/compensation.test.ts
- FOUND commits: 019544e, 64dc718, 1b497cf (ancestors of HEAD)
- Verification re-run: `typecheck` 0 errors, `npm test` 164/164, `test:int` 144/144 with compensation.test, buy.test and lua.test listed

---
*Phase: 02-buy-pipeline-admin-apis*
*Completed: 2026-11-08*
