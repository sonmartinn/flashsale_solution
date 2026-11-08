---
phase: 02-buy-pipeline-admin-apis
plan: 01
subsystem: api
tags: [express5, mongoose9, ioredis6, lua, redis, flash-sale, concurrency, node-test]

requires:
  - phase: 01-foundation
    provides: "AppDeps/createApp, requireAuth with x-test-user test mode, models + unique (saleId, userId) index, buy.lua, stockKey/buyersKey, test helpers (connectTestStores, startApp, startServerProcess)"
provides:
  - "POST /api/sales/:id/buy?mode=v0|v1|v2 (requireAuth), body { qty: 1 }, 201 { order } (OrderDto)"
  - "ErrorCode additions: SOLD_OUT, ALREADY_BOUGHT, SALE_NOT_ACTIVE, STOCK_NOT_LOADED, INVALID_MODE"
  - "ioredis RedisCommander.flashBuy typing; registerBuyScript / runBuyScript / BuyScriptCode (services/lua.ts)"
  - "buy.lua registered at server boot with one [LỖI] line on failure"
  - "createSaleCache() -> { get, invalidate } single-flight static cache, one per app in createApiRouter"
  - "toOrderDto / OrderDto (utils/dto.ts)"
  - "createOrder / isDuplicateKeyError / CreateOrderFn / CreateOrderInput (services/order.service.ts)"
  - "createPurchaseService({ redis, saleCache, createOrder? }) with buyHandlers v0/v1/v2 and BuyResult union"
  - "createSaleController / createSaleRouter"
  - "buy.test (Redis db 7) and lua.test (Redis db 6) integration suites"
affects: [02-02, 02-03, 02-04, 02-05, phase-03-loadtest, phase-04-frontend]

actuals:
  tokens: 10100
  tasks: 2
  commits: 2
plan_head_before: 0a5b41de6ab57f85b1d42bc069faf60782f5f6b4
plan_head_after: fbaf6d5

tech-stack:
  added: []
  patterns:
    - "Service factory with injected deps and a defaulted seam (createOrder) for later fault injection"
    - "BuyResult discriminated union mapped to HTTP in ONE table in the controller (D-06)"
    - "Single-flight Promise cache: set before await, evict null/rejection only if the Map still holds that promise"
    - "Custom Redis command typed by module augmentation (src/types/ioredis.d.ts), script read inside the register function"

key-files:
  created:
    - backend/src/types/ioredis.d.ts
    - backend/src/services/lua.ts
    - backend/src/services/sale-cache.ts
    - backend/src/utils/dto.ts
    - backend/src/services/order.service.ts
    - backend/src/services/purchase.service.ts
    - backend/src/controllers/sale.controller.ts
    - backend/src/routes/sale.routes.ts
    - backend/test/integration/buy.test.ts
    - backend/test/integration/lua.test.ts
  modified:
    - backend/src/utils/http-error.ts
    - backend/src/server.ts
    - backend/src/routes/index.ts

key-decisions:
  - "Non-ok BuyResults map to pre-built HttpError instances in a FAILURES table thrown to errorHandler, so the 409/503 path does no stack capture under load"
  - "V0 and V1 share one insertOrder helper (E11000 -> already_bought, other errors rethrown); plan 02-03 adds the V1/V2 refund into that catch path"
  - "V0 on a sale deleted after caching answers 404 NOT_FOUND; V1 answers SOLD_OUT (no extra read), as the plan's discretion notes say"
  - "STOCK_NOT_LOADED test runs ?mode=v2 then ?mode=v0 on a sale of each stored mode, which also shows there is no mode-mismatch guard (D-03)"

patterns-established:
  - "Integration tests create a fresh sale per case through a file-local createSale helper instead of resetting"
  - "Rejected-request invariants checked with a snapshot (remainingQty, GET stock, SCARD buyers) before/after each request"
  - "Bursts build the array of fetch promises first, then Promise.all"

requirements-completed: [BUY-01, BUY-02, BUY-03, BUY-04, BUY-05, BUY-06, BUY-08, BUY-09]

coverage:
  - id: D1
    description: "One buy per mode (v0/v1/v2) answers 201 with an eight-key OrderDto; V2 moves Redis stock only; successful buys print nothing and write no stock_movements"
    requirement: BUY-08
    verification:
      - kind: integration
        ref: "backend/test/integration/buy.test.ts#v0, v1, v2 đều trả 201 { order } đúng D-20; V2 chỉ trừ kho Redis; không log, không stock_movements"
        status: pass
    human_judgment: false
  - id: D2
    description: "Compiled server (node dist/server.js, NODE_ENV=test) registers buy.lua at boot and answers 201 in each mode"
    requirement: BUY-06
    verification:
      - kind: integration
        ref: "backend/test/integration/buy.test.ts#server đã biên dịch (node dist/server.js, NODE_ENV=test) đăng ký buy.lua lúc khởi động và trả 201 cho cả ba mode"
        status: pass
    human_judgment: false
  - id: D3
    description: "D-01 check order and rejections before any store write: INVALID_MODE, VALIDATION_ERROR (qty -5/0/2/'1'/1.5/{$gt}/[1]/no body), INVALID_ID, 401; stock unchanged; JSON 1.0 accepted"
    requirement: BUY-01
    verification:
      - kind: integration
        ref: "backend/test/integration/buy.test.ts#mode v0|v1|v2: kiểm tra đầu vào bị từ chối trước khi chạm kho"
        status: pass
    human_judgment: false
  - id: D4
    description: "Identical outcome codes across modes: 404 NOT_FOUND (not cached), SALE_NOT_ACTIVE, SOLD_OUT, ALREADY_BOUGHT, STOCK_NOT_LOADED, with the D-07 documented difference"
    requirement: BUY-03
    verification:
      - kind: integration
        ref: "backend/test/integration/buy.test.ts#mode v0|v1|v2: kết quả của bước trừ kho"
        status: pass
    human_judgment: false
  - id: D5
    description: "Single-flight static sale cache with six static fields, null not cached, invalidate(id) and invalidate()"
    requirement: BUY-02
    verification:
      - kind: integration
        ref: "backend/test/integration/buy.test.ts#cache tĩnh của đợt sale (createSaleCache)"
        status: pass
    human_judgment: false
  - id: D6
    description: "Bursts of 100 users on stock 10: V1 and V2 exactly 10 orders and 90 SOLD_OUT (V2 leaves remainingQty 10, stock 0, SCARD 10); V0 oversells within 3 attempts; V1 emits no process warning"
    requirement: BUY-05
    verification:
      - kind: integration
        ref: "backend/test/integration/buy.test.ts#bắn song song 100 người vào kho 10 (D-34)"
        status: pass
    human_judgment: false
  - id: D7
    description: "Lua smoke over ioredis 6 RESP3: codes -2/1/-1/0, 1,000 parallel calls on stock 100 give exactly 100 ones, stock 0, SCARD 100"
    requirement: BUY-09
    verification:
      - kind: integration
        ref: "backend/test/integration/lua.test.ts#lua.test"
        status: pass
    human_judgment: false

duration: 9min
completed: 2026-11-08
status: complete
---

# Phase 2 Plan 01: Buy Pipeline (V0/V1/V2) Summary

**`POST /api/sales/:id/buy?mode=v0|v1|v2` with one D-01 check sequence, one single-flight static sale cache and one `createOrder`. V0 does a naive read-then-`$inc`, V1 an atomic `findOneAndUpdate` with a `$gte` filter, V2 the `flashBuy` Lua script registered at boot. Tests show V0 overselling and V1/V2 stopping at exactly `totalQty` under a 100-user burst.**

## Performance

- **Duration:** about 9 min
- **Started:** 2026-11-08T08:38:14Z
- **Completed:** 2026-11-08T08:47Z
- **Tasks:** 2
- **Files modified:** 13 (10 created, 3 modified)

## Accomplishments

- Buy endpoint with the D-01 order (401, then INVALID_MODE, then VALIDATION_ERROR, then INVALID_ID, then NOT_FOUND, then SALE_NOT_ACTIVE, then the stock step) and a single `BuyResult`-to-HTTP table, so every mode answers with the same codes.
- Three stock handlers in `buyHandlers` that differ only in the stock step. All three insert through the shared `createOrder`. E11000 becomes `ALREADY_BOUGHT` in every mode, and V0 never refunds (D-09).
- `flashBuy` typing via module augmentation. `buy.lua` is read inside `registerBuyScript` and registered at server boot right after Redis connects, so a missing file still gives one `[LỖI]` line.
- A single-flight static cache with exactly six fields, no TTL and no cached nulls, eviction safe against the invalidate race, and one instance per app.
- `buy.test` (44 cases incl. a compiled-server smoke) and `lua.test` (4 cases). Full suites: 154/154 unit, 103/103 integration.

## Task Commits

1. **Task 1 (tracer): one buy per mode end-to-end, also on the compiled server**: `407f9ba` (feat)
2. **Task 2 (tdd): D-06 table per mode, bursts, Lua smoke**: `fbaf6d5` (test)

**Plan metadata:** recorded in the docs commit that adds this SUMMARY.

## Files Created/Modified

- `backend/src/utils/http-error.ts`: five Phase 2 buy codes added to `ErrorCode`.
- `backend/src/types/ioredis.d.ts`: `RedisCommander.flashBuy` augmentation.
- `backend/src/services/lua.ts`: `registerBuyScript`, `runBuyScript` (throws on any reply other than 1/0/-1/-2), `BuyScriptCode`.
- `backend/src/server.ts`: `registerBuyScript(redis)` after `connectRedis`. On failure it disconnects both stores and prints one `[LỖI]` line.
- `backend/src/services/sale-cache.ts`: `createSaleCache()` returning `{ get, invalidate }`.
- `backend/src/utils/dto.ts`: `OrderDto`, `toOrderDto`.
- `backend/src/services/order.service.ts`: shared `createOrder`, `isDuplicateKeyError`.
- `backend/src/services/purchase.service.ts`: `createPurchaseService`, `buyHandlers` v0/v1/v2, `BuyResult`.
- `backend/src/controllers/sale.controller.ts`: buy handler with the D-01 checks and the `FAILURES` table.
- `backend/src/routes/sale.routes.ts`: `POST /:id/buy` behind `requireAuth`.
- `backend/src/routes/index.ts`: one `saleCache` and one `purchase` per app, mounted at `/sales`. `AppDeps` is unchanged.
- `backend/test/integration/buy.test.ts`: buy pipeline suite (Redis db 7).
- `backend/test/integration/lua.test.ts`: Lua smoke suite (Redis db 6).

## Decisions Made

- Non-ok results throw pre-built `HttpError` instances from one `FAILURES` table. errorHandler renders them, and the 409/503 path skips per-request stack capture.
- V0 and V1/V2 share an `insertOrder` helper (E11000 becomes `already_bought`, anything else is rethrown). Plan 02-03 adds the V1/V2 refund at that catch site.
- The "user A buys twice" case does not assert V1 `remainingQty`. Without the 02-03 refund it currently leaks one unit (3 instead of 4). The assertion belongs to plan 02-03's compensation tests.

## Deviations from Plan

None. The plan was executed as written. The TDD note below is about commit order, not code.

## TDD Gate Compliance

Task 2 is `tdd="true"`. The RED commit `fbaf6d5` (`test(02-01)`) exists, but there is **no `feat(02-01)` GREEN commit after it**. The only feat commit (`407f9ba`, Task 1) comes before it.

- **RED run:** `node --import tsx --test --test-reporter=tap test/integration/buy.test.ts test/integration/lua.test.ts` returned exit 0 with 44/44 passing. That is an **unexpected GREEN**, so this is not valid RED evidence.
- **Investigation (fail-fast rule 1):** the plan's Task 1 action spelled out the whole D-01..D-09 implementation (check order, messages, window, the three handlers, E11000 mapping, cache eviction). The tracer therefore already contained every behavior Task 2 specifies, and Task 2 needed no implementation change.
- **Showing the tests are not vacuous:** a mutation run temporarily broke four things: loose `qty != 1`, the V1 `$gte` filter removed, null results kept in the cache, and V2 `-1` mapped to `sold_out`. **12 of 44 cases failed**, each on its targeted assertion: VALIDATION_ERROR in all three modes, 404-then-201 in all three modes, the cache null case, V1 stock-1 SOLD_OUT, V1 D-07, the V1 burst, V2 ALREADY_BOUGHT and V2 D-07. The mutations were reverted with `git checkout -- <file>` on the three source files and never committed. Afterwards the full suites passed (unit 154/154, integration 103/103).
- **Semantic assessment:** the tests do discriminate, but the gate order (RED before GREEN) is not met. The cause is how the plan was structured (a tracer that implements everything, then a TDD expansion task), not a skipped step. A reviewer should flag this as advisory.

## Issues Encountered

- A fresh worktree had no `backend/node_modules`. `npm --prefix backend ci` ran from the lockfile, as the plan's action step 1 says, and no new packages were added.
- The parallel 02-02 executor shared Docker MongoDB/Redis during the full `test:int` runs. No intermittent failures were seen.
- REQUIREMENTS.md was not updated from this worktree. The executor prompt reserves post-wave shared-file writes for the orchestrator, and plan 02-03 shares BUY-05, so `requirements.mark-complete` is left to the orchestrator.

## User Setup Required

None. No external service configuration is required.

## Next Phase Readiness

- Plan 02-03 can add the D-10/D-11/D-12 refunds into the `insertOrder` catch path (V1/V2) and inject a failing `createOrder` through `PurchaseDeps.createOrder`.
- Plan 02-04 should pass `saleCache.invalidate` as `onSaleReset`. Today `saleCache` is a local in `createApiRouter`, so 02-04 needs to wire the admin router there.
- Plan 02-05 can extend `utils/dto.ts` and add the read routes to `createSaleRouter`. Any `/sales/active` route must be registered before `/:id` routes.

---
*Phase: 02-buy-pipeline-admin-apis*
*Completed: 2026-11-08*
