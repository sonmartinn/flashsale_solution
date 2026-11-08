---
phase: 02-buy-pipeline-admin-apis
plan: 04
subsystem: api
tags: [express, admin, mongoose, ioredis, stats, reset, cache]

requires:
  - phase: 01-foundation-infra-data-auth
    provides: createSaleAdminService.resetSale with the onSaleReset seam, admin guard router, signToken
  - phase: 02-buy-pipeline-admin-apis (02-01)
    provides: saleCache + purchase service in createApiRouter, POST /api/sales/:id/buy, registerBuyScript
  - phase: 02-buy-pipeline-admin-apis (02-02)
    provides: createReconcileService.checkSale
provides:
  - POST /api/admin/sales/:id/reset (optional { mode }) -> 200 { sale } with ISO dates; clears the running server's sale cache
  - GET /api/admin/sales/:id/stats -> 200 { stats } with the eleven D-25 fields
  - SaleStats type and getStats on SaleAdminService
  - admin.test.ts integration suite (Redis db 10) incl. E1-style V2 (with reconcile) and V0 runs
affects: [phase-03-loadtest, phase-04-frontend-admin, e1, e2, e3]

actuals:
  tokens: 6800
  tasks: 2
  commits: 3
plan_head_before: 9b18ba0a9e63ab9a70045a223b9a24baefe08f9f
plan_head_after: 31bf12dca66e564e0a05aedb794512f450e6d893

tech-stack:
  added: []
  patterns:
    - "Admin controller validates the body shape and mode before calling the shared service, so a bad mode answers INVALID_MODE instead of the service's VALIDATION_ERROR"
    - "Express 5 path params typed string | string[]: a paramId() helper forwards only strings, anything else becomes '' and the service answers INVALID_ID"
    - "Stats read Mongo and Redis in a single Promise.all; redisInSync is a count comparison, full set comparison stays in reconcile"

key-files:
  created:
    - backend/src/controllers/admin.controller.ts
    - backend/test/integration/admin.test.ts
  modified:
    - backend/src/services/sale-admin.service.ts
    - backend/src/routes/admin.routes.ts
    - backend/src/routes/index.ts

key-decisions:
  - "One saleAdmin per app, created in createApiRouter with onSaleReset: saleCache.invalidate, the same cache instance the purchase service reads (BUY-02, D-17)"
  - "getStats lives in createSaleAdminService (RESEARCH Open Question 2), so the admin router depends on one service"
  - "Unknown valid sale id on stats answers 404 NOT_FOUND from the service; resetSale and resetAllSales are unchanged, so the CLI keeps its behaviour"

patterns-established:
  - "E1-style in-process check: reset through the admin API, burst with distinct x-test-user ids, read stats, reconcile"

requirements-completed: [ADMIN-01, ADMIN-02, BUY-02]

coverage:
  - id: D1
    description: "Admin reset over HTTP with optional { mode }, 200 { sale } with ISO dates, sale reopened and Redis stock reloaded"
    requirement: ADMIN-01
    verification:
      - kind: integration
        ref: "backend/test/integration/admin.test.ts#reset với { mode: \"v2\" } trả 200 { sale } có ngày ISO, đổi mode, mở lại đợt và nạp lại kho Redis"
        status: pass
      - kind: integration
        ref: "backend/test/integration/admin.test.ts#ADMIN-01: hai lần reset liên tiếp cùng body cho cùng mode và totalQty, chỉ còn một biến động reset"
        status: pass
    human_judgment: false
  - id: D2
    description: "Reset over HTTP clears the running server's static sale cache (stale ended sale becomes buyable right after reset)"
    requirement: BUY-02
    verification:
      - kind: integration
        ref: "backend/test/integration/admin.test.ts#reset xóa cache tĩnh của server đang chạy (BUY-02): đợt ended đã cache vẫn SALE_NOT_ACTIVE tới khi reset"
        status: pass
    human_judgment: false
  - id: D3
    description: "Reset input rules: [] VALIDATION_ERROR; v3/V2/null/2/[\"v1\"] INVALID_MODE with mode unchanged; INVALID_ID; NOT_FOUND"
    requirement: ADMIN-01
    verification:
      - kind: integration
        ref: "backend/test/integration/admin.test.ts#đầu vào của reset (D-24)"
        status: pass
    human_judgment: false
  - id: D4
    description: "GET stats returns exactly the eleven D-25 keys; redisStock null when key missing; redisInSync boolean for v2, null for v0/v1"
    requirement: ADMIN-02
    verification:
      - kind: integration
        ref: "backend/test/integration/admin.test.ts#stats (D-25)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Admin guard: 401 without token, 403 for user JWT and x-test-user, on reset and stats"
    requirement: ADMIN-01
    verification:
      - kind: integration
        ref: "backend/test/integration/admin.test.ts#guard AUTH-04: chỉ admin gọi được reset và stats"
        status: pass
    human_judgment: false
  - id: D6
    description: "E1-style runs: V2 burst 100 on stock 10 gives 10 orders, oversold 0, redisInSync true and reconcile inSync; V0 burst shows oversold > 0 and mongoRemaining < 0"
    requirement: ADMIN-02
    verification:
      - kind: integration
        ref: "backend/test/integration/admin.test.ts#chu trình kiểu E1: reset qua API, bắn song song, đọc stats, đối chiếu"
        status: pass
    human_judgment: false

duration: 11min
completed: 2026-11-08
status: complete
---

# Phase 2 Plan 04: Admin Reset and Stats APIs Summary

**Admin-only `POST /api/admin/sales/:id/reset` (optional `{ mode }`, clears the in-process sale cache through `onSaleReset: saleCache.invalidate`) and `GET /api/admin/sales/:id/stats` with the eleven D-25 fields, proven by an E1-style reset, burst, stats and reconcile cycle for V2 and visible overselling for V0.**

## Performance

- **Duration:** about 11 min
- **Started:** 2026-11-08T12:24:54Z
- **Completed:** 2026-11-08T12:35:13Z (code); SUMMARY written right after
- **Tasks:** 2
- **Files modified:** 5 (2 created, 3 modified)

## Accomplishments

- Admins reset a sale over HTTP with or without a mode switch. The response is `{ sale: { saleId, mode, totalQty, startAt, endAt } }` with ISO strings. The reset uses the same `resetSale` as `npm run reset`.
- The reset clears the running server's static sale cache. A sale cached as `ended` keeps answering `SALE_NOT_ACTIVE` after a direct DB change and answers 201 right after the HTTP reset.
- `GET /api/admin/sales/:id/stats` returns `saleId, mode, status, totalQty, mongoRemaining, redisStock, redisBuyers, orders, distinctUsers, oversold, redisInSync` from a single `Promise.all`.
- The E1-style V2 run (100 users, stock 10) ends with 10 orders, oversold 0, redisStock 0, redisBuyers 10, mongoRemaining 10 and redisInSync true, and `checkSale` reports in sync (D-34). The V0 run shows `oversold = orders - 10 > 0` with negative `mongoRemaining`.

## Task Commits

1. **Task 1: Tracer, admin reset over HTTP clears the sale cache** - `fafa3d9` (feat)
2. **Task 2 RED: failing stats, guard, input and E1-style cases** - `f78f459` (test)
3. **Task 2 GREEN: getStats + GET /sales/:id/stats** - `31bf12d` (feat)

No REFACTOR commit was needed.

## TDD Gate Compliance (Task 2)

- **RED:** `node --import tsx --test --test-reporter=tap test/integration/admin.test.ts` exited 1 with 16 tests, 9 passing and 7 failing. Target test: "ngay sau reset một đợt v2 kho 10: đúng mười một trường và giá trị ban đầu". `gsd-tools check tdd-red-evidence` returned `RED_EVIDENCE_OK` (`target_test_failed`, format tap). Semantic assessment: the target ran and failed on its first planned assertion (`404 !== 200`) because the stats route did not exist yet. There was no load, syntax or fixture failure. The guard, reset-input and repeat-reset cases already passed on RED, because Task 1 had implemented them. Requests to an unknown `/stats` route also already got a 404 from the guarded router's fallback.
- **GREEN:** after `getStats`, the controller handler and the route were added, all 16 admin cases pass.
- RED commit `f78f459` comes before GREEN commit `31bf12d`.

## Files Created/Modified

- `backend/src/controllers/admin.controller.ts`: `createAdminController({ saleAdmin })` returns `resetSale` (D-24 body and mode checks, explicit ISO DTO) and `getStats`.
- `backend/src/routes/admin.routes.ts`: `createAdminRouter(auth, { saleAdmin })`. The guard comes first, then `POST /sales/:id/reset` and `GET /sales/:id/stats`.
- `backend/src/routes/index.ts`: `saleAdmin = createSaleAdminService({ redis: deps.redis, onSaleReset: saleCache.invalidate })`, mounted at `/admin`.
- `backend/src/services/sale-admin.service.ts`: `SaleStats` interface and `getStats` added. `resetSale` and `resetAllSales` are untouched.
- `backend/test/integration/admin.test.ts`: 16 integration cases on database `flashsale_test_admin_<pid>` and Redis db 10.

## Decisions Made

- `paramId()` in the controller narrows Express 5's `string | string[]` param type. Non-strings become `""`, so the service answers `INVALID_ID`.
- `redisInSync` compares counts only (`redisStock === totalQty - orders && redisBuyers === distinctUsers`), as D-25 specifies. The member-by-member check stays in reconcile.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Express 5 param type `string | string[]`**
- **Found during:** Task 1 (typecheck)
- **Issue:** `req.params["id"]` is typed `string | string[]` in `@types/express` 5, so passing it to `resetSale(saleId: string)` failed with TS2345.
- **Fix:** Added a `paramId()` helper that forwards strings and maps anything else to `""`. The service's normalizer then answers 400 INVALID_ID.
- **Files modified:** backend/src/controllers/admin.controller.ts
- **Verification:** typecheck passes; the `id "abc"` case passes for reset and stats.
- **Committed in:** fafa3d9

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Type narrowing only, no behaviour change. No scope creep.

## Issues Encountered

- `backend/node_modules` was missing in the fresh worktree. Ran `npm ci` from the existing lockfile; no new packages (T-02-SC). npm skipped the esbuild postinstall under its install-scripts policy, and tsx still works.
- One full `test:int` run had a transient failure in `reconcile.test`: "lệch mà không có --fix" got `null !== '9'` on Redis db 11. This plan does not touch that db or that file. The sibling 02-03 worktree runs the same suite against the same shared Redis, and its `after()` `flushdb` on db 11 can wipe keys during this worktree's run. `reconcile.test` passed alone (25/25), and the next full `test:int` run passed 144/144.
- The session scratchpad is shared with the sibling executor. A first RED log was overwritten, so this plan's logs use a `p0204-` prefix.

## Verification

- `npm --prefix backend run typecheck`: pass
- `npm --prefix backend test`: 164/164 pass
- `npm --prefix backend run test:int`: 144/144 pass, including admin.test (16), auth.test and reset.test
- `npm --prefix backend run build`: pass; `dist/lua/buy.lua` is copied. buy.test's compiled-server case exercises the new router wiring from `dist/`.
- Acceptance greps: `onSaleReset: saleCache.invalidate` = 1, `router.post("/sales/:id/reset"` = 1, `getStats` in the service = 3, `router.get("/sales/:id/stats"` = 1.

## User Setup Required

None. No external service configuration is required.

## Next Phase Readiness

- The Phase 3 E1/E2/E3 harness can reset through `POST /api/admin/sales/:id/reset` (the only way to clear the in-process cache) and read `stats` before and after each run.
- Phase 4's admin monitor can read the same D-25 fields and the `redisInSync` badge.
- Known flagged assumption: `npm run reset` (CLI) still cannot clear a running server's cache, so load scripts must reset through the API. A reset that runs while buys are in flight is not guarded (admin-only, documented risk).

---
*Phase: 02-buy-pipeline-admin-apis*
*Completed: 2026-11-08*
