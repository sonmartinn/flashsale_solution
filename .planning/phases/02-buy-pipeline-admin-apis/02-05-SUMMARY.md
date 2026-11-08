---
phase: 02-buy-pipeline-admin-apis
plan: 05
subsystem: api
tags: [express, mongoose, ioredis, mget, dto, read-api]

requires:
  - phase: 02-buy-pipeline-admin-apis
    provides: "02-01 buy pipeline, toOrderDto, sale router; 02-04 routes/index.ts wiring (saleCache, purchase, saleAdmin)"
  - phase: 01
    provides: "models, ensureIndexes, SEED_PRODUCTS, stockKey, normalizeObjectId, requireAuth, test helpers"
provides:
  - "GET /api/products ({ products }) and GET /api/products/:id ({ product })"
  - "GET /api/sales/active ({ now, sales }) and GET /api/sales/:id ({ now, sale })"
  - "GET /api/orders/me (requireAuth, { orders }, max 100, newest first)"
  - "remainingFor(redis, sales): remaining + stockLoaded by sale mode, one MGET for v2 keys"
  - "createCatalogService({ redis }) with listProducts, getProduct, getSale, listActiveSales, listMyOrders"
  - "DTO mappers toProductDto, toProductSummaryDto, toSaleDto, toMyOrderDto"
affects: [phase-03-loadtest, phase-04-frontend]

actuals:
  tokens: 10000
  tasks: 3
  commits: 5
plan_head_before: ebe2c1eae8f6eb7c27221b81a3e8b3978e005f18
plan_head_after: efadb3f8cbfd7b005fdd5638db67a7e999276157

tech-stack:
  added: []
  patterns:
    - "Read path reads MongoDB fresh through a catalog service, never the buy-path sale cache (D-19)"
    - "List-to-DTO helper does one Product $in query + one remainingFor call per list (no N+1, at most one MGET)"
    - "Structural parameter types on DTO mappers so lean results and hydrated documents both fit"

key-files:
  created:
    - backend/src/services/stock.service.ts
    - backend/src/services/catalog.service.ts
    - backend/src/controllers/product.controller.ts
    - backend/src/controllers/order.controller.ts
    - backend/src/routes/product.routes.ts
    - backend/src/routes/order.routes.ts
    - backend/test/integration/read.test.ts
  modified:
    - backend/src/utils/dto.ts
    - backend/src/controllers/sale.controller.ts
    - backend/src/routes/sale.routes.ts
    - backend/src/routes/index.ts

key-decisions:
  - "/orders/me product summaries come from one Product.find({ _id: { $in } }) plus a Map, not populate (populate would replace productId with an object)"
  - "A sale or order whose product document is missing is a data-integrity error and answers 500; product is never null in D-20 shapes"
  - "toSaleDtos takes a structural SaleRow type (toSaleDto input + remainingQty) instead of deriving the Mongoose lean type, which tsc resolved to {}"

patterns-established:
  - "GET /active registered before GET /:id on the sale router, with a Vietnamese comment explaining why"
  - "Controllers take now = new Date() once per request and return it as ISO next to data filtered by it"

requirements-completed: [READ-01, READ-02, READ-03, READ-04]

coverage:
  - id: D1
    description: "GET /api/sales/:id returns { now, sale } with product summary; remaining from remainingQty (v0/v1, negative passes through), Redis stock (v2 loaded) or totalQty - success orders (v2 missing, stockLoaded false); ended sale 200; 400 INVALID_ID; 404 NOT_FOUND"
    requirement: READ-03
    verification:
      - kind: integration
        ref: "backend/test/integration/read.test.ts#GET /api/sales/:id (READ-03)"
        status: pass
    human_judgment: false
  - id: D2
    description: "GET /api/sales/active lists only active in-window sales sorted by startAt, mixed remaining per mode with exactly one MGET, no MGET when no v2 sale, not captured by /:id"
    requirement: READ-02
    verification:
      - kind: integration
        ref: "backend/test/integration/read.test.ts#GET /api/sales/active (READ-02)"
        status: pass
    human_judgment: false
  - id: D3
    description: "GET /api/products (6 items, _id ascending, exact ProductDto keys) and GET /api/products/:id with 400/404 Vietnamese messages"
    requirement: READ-01
    verification:
      - kind: integration
        ref: "backend/test/integration/read.test.ts#GET /api/products, /api/products/:id (READ-01)"
        status: pass
    human_judgment: false
  - id: D4
    description: "GET /api/orders/me returns only the caller's orders newest first with product summary, works with x-test-user and JWT, 401 anonymous, capped at 100"
    requirement: READ-04
    verification:
      - kind: integration
        ref: "backend/test/integration/read.test.ts#GET /api/orders/me (READ-04)"
        status: pass
    human_judgment: false

duration: 11min
completed: 2026-11-08
status: complete
---

# Phase 2 Plan 05: Read APIs (products, sales, my orders) Summary

**Public product and sale reads with mode-aware `remaining` (MongoDB remainingQty for V0/V1, one Redis MGET for V2 with a `stockLoaded` flag and order-count fallback), plus a per-user `/orders/me` capped at 100**

## Performance

- **Duration:** 11 min
- **Started:** 2026-11-08T12:41:16Z
- **Completed:** 2026-11-08T12:52:23Z
- **Tasks:** 3
- **Files modified:** 11 (7 created, 4 modified)

## Accomplishments
- `GET /api/sales/:id` and `GET /api/sales/active` return the D-20/D-21/D-22 `SaleDto` shape (12 keys, product summary, ISO dates, server `now`), with `remaining` read from the store that matches `sale.mode`.
- `remainingFor` reads every V2 stock key of a list with one `MGET` and skips `MGET` entirely when there is no V2 sale (RESEARCH Pitfall 4). Tests spy on `redis.mget` to prove 1 call and 0 calls.
- `GET /api/products` and `GET /api/products/:id` serve the seed catalog through an explicit `ProductDto` whitelist. `description` is included only when stored.
- `GET /api/orders/me` filters only by `req.user.id`, sorts by `createdAt` desc, caps at 100, and joins product summaries with one `$in` query. Anonymous calls get 401.
- No read response contains `_id` or `__v`. Every case asserts this.

## Task Commits

1. **Task 1 (tracer): GET /api/sales/:id with remaining by sale mode** - `c465649` (feat)
2. **Task 2: active sales + product catalog** - `e4322e6` (test, RED), `3f3a7f2` (feat, GREEN)
3. **Task 3: GET /api/orders/me** - `2026966` (test, RED), `efadb3f` (feat, GREEN)

## TDD Gate Compliance

- **Task 2 RED:** 5 new cases failed on planned assertions. `/api/sales/active` was captured by `/:id` and returned 400 INVALID_ID. `/api/products` was not mounted and returned 404. `gsd-tools check tdd-red-evidence` returned `RED_EVIDENCE_OK` (target "chỉ liệt kê đợt active trong khung giờ...", TAP, 11 tests, 5 failing). Semantic assessment: target executed and failed on the planned status assertion, not on setup.
- **Task 3 RED:** 4 new cases failed because `/api/orders` was not mounted (404 instead of 200/401). `RED_EVIDENCE_OK` (TAP, 15 tests, 4 failing). Semantic assessment: target executed and failed on the planned status assertion.
- **GREEN:** each `feat` commit follows its `test` commit. No REFACTOR commits were needed.
- Task 1 is `type="tracer"` (not TDD). Its tests were committed together with the implementation. The tracer gate (end-of-phase mode, automated-only verify) re-ran typecheck, unit and integration suites, all green, before expansion.

## Files Created/Modified
- `backend/src/services/stock.service.ts` - `remainingFor`, `SaleStockInput`, `StockView`
- `backend/src/services/catalog.service.ts` - `createCatalogService` (getSale, listActiveSales, listProducts, getProduct, listMyOrders) and the private `toSaleDtos` helper
- `backend/src/utils/dto.ts` - `ProductDto`, `ProductSummaryDto`, `SaleDto`, `MyOrderDto` and their mappers next to `toOrderDto`
- `backend/src/controllers/sale.controller.ts` - adds `getById`, `getActive`. `buy` is unchanged.
- `backend/src/routes/sale.routes.ts` - `GET /active` before `GET /:id`, then `POST /:id/buy`
- `backend/src/controllers/product.controller.ts`, `backend/src/routes/product.routes.ts` - public product reads
- `backend/src/controllers/order.controller.ts`, `backend/src/routes/order.routes.ts` - `GET /me` behind `requireAuth`
- `backend/src/routes/index.ts` - builds `catalog` once, mounts `/products` and `/orders`, passes `catalog` to the sale router. All 02-01/02-04 wiring is kept.
- `backend/test/integration/read.test.ts` - 15 cases (database `flashsale_test_read_<pid>`, Redis db 9)

## Decisions Made
- See key-decisions in the frontmatter. All follow the plan's recorded discretion choices.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Lean sale type derivation resolved to `{}`**
- **Found during:** Task 1
- **Issue:** Deriving the lean type through `ReturnType<typeof FlashSale.findById>["lean"]` gave `{}` under tsc, which broke `toSaleDtos`.
- **Fix:** Typed `toSaleDtos` with a structural `SaleRow = Parameters<typeof toSaleDto>[0] & { remainingQty: number }`. Lean results fit it directly.
- **Files modified:** backend/src/services/catalog.service.ts
- **Verification:** typecheck passes
- **Committed in:** c465649

---

**Total deviations:** 1 auto-fixed (1 blocking type issue)
**Impact on plan:** Typing only. No behaviour or scope change.

## Issues Encountered
- In this worktree, git warns that LF will be replaced by CRLF on new `.ts` files (core.autocrlf). The repo index stores LF, so behaviour matches the existing files.

## Verification
- `npm --prefix backend run typecheck`: pass
- `npm --prefix backend run build`: pass (`dist/lua/buy.lua` present)
- `npm --prefix backend test`: 164 pass, 0 fail
- `npm --prefix backend run test:int`: 175 pass, 0 fail. All 12 files ran: admin, auth, buy, compensation, health, lua, models, read, reconcile, redis-boot, reset, seed.
- The compiled module graph, including the new routes, loads in the health/redis-boot tests that run `dist/server.js`. The manual `start:test` phase gate in VALIDATION.md (one buy and one `GET /api/sales/:id` per mode) is left for end-of-phase verification.

## User Setup Required

None. No external service configuration is required.

## Next Phase Readiness
- Phase 4 can render the home, sale and orders pages from these shapes. Phase 3 can read `remaining` and `stockLoaded` per mode.
- Flagged assumptions carried from the plan: a V2 read while Redis is down answers 500 with no fallback (RESEARCH A3). `remaining` for a v2 sale reads Redis even while a script buys it with `?mode=v0|v1` (Pitfall 7, by design).

## Self-Check: PASSED

- All 7 created source/test files and this SUMMARY exist on disk.
- Commits c465649, e4322e6, 3f3a7f2, 2026966, efadb3f are on this branch (5 code commits since ebe2c1e).
- Acceptance greps: `createCatalogService(` in index.ts = 1, `remainingFor(` in catalog.service.ts = 1, `router.use("/products"` = 1, `router.use("/orders"` = 1, `auth.requireAuth` in order.routes.ts = 1, `/active` line before `/:id` line.

---
*Phase: 02-buy-pipeline-admin-apis*
*Completed: 2026-11-08*
