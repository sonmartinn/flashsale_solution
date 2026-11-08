# Phase 2: Buy Pipeline & Admin APIs - Context

**Gathered:** 2026-11-08
**Status:** Ready for planning

<domain>
## Phase Boundary

What this phase delivers:
- Public read APIs: `GET /api/products`, `GET /api/products/:id`, `GET /api/sales/active`, `GET /api/sales/:id` (with `remaining` read according to `sale.mode` and the server `now`)
- `GET /api/orders/me` for the logged-in user, newest first
- `POST /api/sales/:id/buy?mode=v0|v1|v2`: shared checks, one in-memory static sale cache, the three buy handlers, one shared order-creation function, compensation for V1 and V2, identical response codes in every mode
- `buy.lua` wired with `redis.defineCommand` at boot, plus the Lua smoke test (BUY-09)
- Admin HTTP routes: `POST /api/admin/sales/:id/reset` (optional `{ mode }`) and `GET /api/admin/sales/:id/stats`
- `npm run reconcile` (check Redis against MongoDB, `--fix` repairs Redis from MongoDB)

Not in this phase:
- Load scripts and experiments E1–E4, CSVs, warm-up and pool tuning: Phase 3
- Any frontend page or dev start/stop script: Phase 4
- Docs, chart, README: Phase 5

Requirements: READ-01..04, BUY-01..09, ADMIN-01..03.

</domain>

<decisions>
## Implementation Decisions

The user asked Claude to decide every gray area using its recommendations ("Oke bạn cứ tự quyết theo khuyến nghị đi"), the same as in Phase 1. The decisions below are Claude's choices and are now locked for planning. Anything SPECS §7–8, REQUIREMENTS or the PROJECT.md Key Decisions table already fixes is not repeated here. Read those directly.

### Buy input validation (order follows SPECS §8)
- **D-01:** The check order is: `requireAuth` → `mode` → `qty` → `saleId` format → sale exists → sale open → `buyHandlers[mode]`. Each step throws an `HttpError` and the next step never runs.
- **D-02:** `mode` comes only from the query string and is required. It must be a single string equal to `v0`, `v1` or `v2`. A missing value, an array (`?mode=v1&mode=v2`) or any other value gets 400 `INVALID_MODE`. There is no fallback to `sale.mode`: the Phase 4 UI passes `?mode=<sale.mode>` explicitly, and the load scripts pass the mode they measure.
- **D-03:** `?mode=` is allowed to differ from `sale.mode`. This follows SPECS ("script tải vẫn dùng `?mode=`"). The mode-mixing hazard is a documented risk (SPECS §8, Phase 5 docs), not something the API blocks. The Phase 3 harness must reset with `{ mode }` and check `stats.mode` before each run. — **Reversibility:** reversible — adding a mismatch guard later only touches the buy controller.
- **D-04:** `qty` comes from the JSON body. The body must be a JSON object, and `qty` must be `typeof === "number"` and `=== 1`. (JSON `1.0` parses to the number 1 and is accepted.) A string `"1"`, a missing `qty`, a missing body (`req.body === undefined`), `-5`, `2` and `0` all get 400 `VALIDATION_ERROR` with the message "Số lượng mua phải đúng bằng 1". Only the `qty` field is read; other keys are ignored.
- **D-05:** `saleId` that is not a 24-hex ObjectId gets 400 `INVALID_ID` (reuse `normalizeObjectId`). A well-formed id with no sale gets **404 `NOT_FOUND`** (SPECS allows 400 or 404; 404 matches READ-01). A sale whose `status !== "active"`, or where `now < startAt` or `now > endAt`, gets 400 `SALE_NOT_ACTIVE`, with different Vietnamese messages for "chưa bắt đầu" and "đã kết thúc".
- **D-06:** Final error-code table for the buy path, identical in every mode:

  | Result | Status | Code |
  |---|---|---|
  | Success | 201 | (body `{ order }`) |
  | Sold out | 409 | `SOLD_OUT` |
  | Already bought | 409 | `ALREADY_BOUGHT` |
  | Bad or missing `mode` | 400 | `INVALID_MODE` |
  | Bad `qty` / body | 400 | `VALIDATION_ERROR` |
  | Bad sale id | 400 | `INVALID_ID` |
  | Unknown sale | 404 | `NOT_FOUND` |
  | Sale not open / ended | 400 | `SALE_NOT_ACTIVE` |
  | V2 stock key missing | 503 | `STOCK_NOT_LOADED` |
  | Anything else (Mongo/Redis down, failed compensation) | 500 | `INTERNAL_ERROR` |

  Add `SOLD_OUT`, `ALREADY_BOUGHT`, `SALE_NOT_ACTIVE`, `STOCK_NOT_LOADED` and `INVALID_MODE` to the `ErrorCode` union in `utils/http-error.ts`. Exact Vietnamese wording is Claude's discretion. — **Reversibility:** costly — Phase 3 (E1/E2/E3 counting) and Phase 4 (UI messages) both key off these codes.
- **D-07:** One accepted cross-mode difference: when a user who already bought tries again after the sale sold out, V2 answers `ALREADY_BOUGHT` (the Lua script checks `SISMEMBER` first) and V0/V1 answer `SOLD_OUT` (the stock check fails before the order insert). Making them identical would add an `Order.exists` read to the measured V0/V1 path, which skews the comparison. Tests must not assert identical codes for this one edge case, and Phase 5 docs mention it.

### Buy handlers and compensation
- **D-08:** A unique-index error (E11000) on the order insert maps to 409 `ALREADY_BOUGHT` in **all three** modes, never to the generic `DUPLICATE`.
- **D-09:** V0 has **no** compensation, by design (naive). With distinct users it never hits E11000. A repeat buyer in V0 leaks one unit, which is part of what V0 demonstrates. E3 only covers V1 and V2.
- **D-10:** V1 and V2 handle an order-insert error that is not E11000 the same way. They look the order up by `(saleId, userId)`:
  - If the order exists, the write actually succeeded, so return **201 with that order** and do not refund.
  - If the order does not exist, refund and then rethrow (500).
  - If the lookup itself throws, do **not** refund and rethrow (500). This means an undersell rather than an oversell. It is the "limit of compensation on ambiguous writes" that Phase 5 documents.

  (REQUIREMENTS says `Order.exists`. A `findOne(...).lean()` that returns the order satisfies the same check and lets us answer 201.)
- **D-11:** Refund operations: V1 `FlashSale.updateOne({ _id }, { $inc: { remainingQty: +qty } })`, awaited. V2 E11000 → `INCRBY` only. V2 other error with no order → `INCRBY` + `SREM` in one `multi()`, checking every `[err, res]` pair and treating `null` as aborted. The refund must finish before the `stock_movements` write.
- **D-12:** After a successful refund, write one `stock_movements` row: `reason` `"compensate_v1"` or `"compensate_v2"`, `delta: +qty`, `orderId: null`. A failure to write this row is caught and printed with one `console.error` line; it never blocks the refund or changes the response. When the refund itself fails, print one `console.error` line with `saleId`, `userId` and `mode` and rethrow the original error. These logs are on the failure path only. The success path writes no log and no `stock_movements` row (BUY-08).

  **Amended 2026-11-08 (plan-phase, user-approved):** when the refund itself fails, print the one `console.error` line (`saleId`, `userId`, `mode`) and throw a **new** `Error` with the original error as `cause` (`new Error(..., { cause })`), which the error handler answers with 500. This applies to every refund branch, not only E11000. Reason: rethrowing an original E11000 would reach `errorHandler` as 409 `DUPLICATE`, which contradicts D-06/D-08, and it would look like an ordinary business error while stock has leaked.
- **D-13:** The Lua script is registered once at boot with `redis.defineCommand("flashBuy", { numberOfKeys: 2, lua })`, read with `readFileSync(new URL("../lua/buy.lua", import.meta.url), "utf8")`. Put this in a small module (for example `services/lua.ts` with `registerBuyScript(redis)`) that `server.ts` calls right after `connectRedis` and the test helpers call too. If the file cannot be read, boot fails with one `[LỖI]` line (Phase 1 convention). The command's result is checked to be one of `1, 0, -1, -2`; anything else throws (500). Use the module augmentation of `RedisCommander` (or a typed wrapper) so the custom command passes `tsc` strict.
- **D-14:** The purchase service is a factory, the same as Phase 1's `createSaleAdminService`: `createPurchaseService({ redis, saleCache, createOrder? })`. It returns a discriminated result, and the controller maps it to HTTP. The `createOrder` seam has the real shared implementation as its default. It exists so integration tests can force an E11000, a generic error, or an "error but the order was written" case to exercise D-10/D-11 without mocks in production code.
- **D-15:** The shared `createOrder({ saleId, userId, productId, price, qty, mode })` writes `{ userId, saleId, productId, qty, price: salePrice, status: "success", mode }`. `productId` and `price` come from the sale cache. `mode` is the requested `?mode`.

### Static sale cache (BUY-02)
- **D-16:** The cache is a module-level `Map<saleId, Promise<SaleInfo>>` with single-flight loading. `SaleInfo = { productId, salePrice, totalQty, startAt, endAt, status }`, with dates stored as epoch ms. It deliberately leaves out **`mode`** (buy uses `?mode`, and a stale mode after a CLI `--mode` reset would cause wrong answers) and never holds `remainingQty`.
- **D-17:** There is **no TTL**. Only `invalidate(saleId?)` clears entries. Admin reset passes it as `onSaleReset` (the Phase 1 seam). A TTL would add periodic Mongo reads in the middle of a measurement and would not make CLI reset correct anyway, since the CLI already prints its cache warning.
- **D-18:** A load that finds no sale is **not** cached: the promise resolves to `null`, the entry is deleted, and the caller gets 404. A rejected load is evicted too. This prevents a stale 404 after `npm run seed` creates a new sale while the server is running.
- **D-19:** The read APIs (`GET /sales/:id`, `/sales/active`) read MongoDB fresh and do not use the cache. They need `remainingQty` and `mode` anyway, and they are not on the measured path.

### Read API response shapes
- **D-20:** Every response body is a JSON **object**, never a top-level array. Documents are serialized by explicit mapper functions: `id` is a string (no `_id`, no `__v`) and dates are ISO strings, which matches the Phase 1 auth shape `{ id, ... }`. — **Reversibility:** costly — Phase 3 parses `order`/`stats`, and Phase 4 renders every shape.

  | Endpoint | 200/201 body |
  |---|---|
  | `GET /products` | `{ products: ProductDto[] }`, sorted by `_id` ascending, no pagination (6 products) |
  | `GET /products/:id` | `{ product: ProductDto }` |
  | `GET /sales/active` | `{ now, sales: SaleDto[] }` |
  | `GET /sales/:id` | `{ now, sale: SaleDto }`. Returns 200 for any existing sale, even one that has ended; the UI reads `status`/dates |
  | `POST /sales/:id/buy` | 201 `{ order: OrderDto }`. No `remaining` (that would add a read to the measured path) |
  | `GET /orders/me` | `{ orders: OrderDto[] }`, newest first, at most 100 |

  - `ProductDto = { id, name, slug, category, images, price, attributes, description? }`
  - `SaleDto = { id, productId, product: { id, name, slug, category, images, price }, salePrice, totalQty, perUserLimit, startAt, endAt, status, mode, remaining, stockLoaded }`
  - `OrderDto = { id, saleId, productId, qty, price, status, mode, createdAt }`. `/orders/me` adds `product: { id, name, slug, images }` from one extra `Product.find({ _id: { $in } })`. The buy response leaves it out.
- **D-21:** `remaining` and `stockLoaded`:
  - `v0`/`v1` → `remaining = remainingQty`, which can be negative and is shown as is, and `stockLoaded = true`.
  - `v2` with `stock:<id>` present → `remaining = Number(GET)`, `stockLoaded = true`.
  - `v2` with the key missing → `remaining = totalQty - countDocuments({ saleId, status: "success" })`, `stockLoaded = false`.

  `/sales/active` reads all v2 keys with one `MGET`.
- **D-22:** "Active" means `status === "active"` and `startAt <= now <= endAt`. The list is sorted by `startAt` ascending. `now` is the server time as an ISO string, taken once per request.
- **D-23:** `GET /orders/me` uses `requireAuth` (so it works with `x-test-user` in test mode). It queries `{ userId }` sorted `{ createdAt: -1 }`, which the existing `(userId, createdAt desc)` index covers.

### Admin routes and stats
- **D-24:** `POST /admin/sales/:id/reset` reads `req.body ?? {}`. The body must be an object if present. `mode`, if present, must be the string `v0`, `v1` or `v2`, otherwise 400 `INVALID_MODE` (checked in the route before calling the service). It calls the existing `createSaleAdminService({ redis, onSaleReset: saleCache.invalidate }).resetSale` and returns 200 `{ sale: ResetResult }` (with ISO dates). An unknown sale gets 404 (the service already throws it). The admin router guard stays as it is.
- **D-25:** `GET /admin/sales/:id/stats` returns 200 `{ stats }`:
  `{ saleId, mode, status, totalQty, mongoRemaining, redisStock: number | null, redisBuyers: number, orders, distinctUsers, oversold, redisInSync: boolean | null }`
  - `orders = countDocuments({ saleId, status: "success" })`; `distinctUsers = distinct("userId", …).length`; `oversold = max(0, orders - totalQty)`
  - `redisStock` is `null` when the key is missing; `redisBuyers = SCARD`
  - `redisInSync` is a cheap check for the Phase 4 badge: for a v2 sale it is `redisStock === totalQty - orders && redisBuyers === distinctUsers`; for v0/v1 it is `null` (Redis is not the stock source). Full set comparison is the reconcile script's job.
  - The stats logic lives in the sale-admin service (or a sibling service) so the route stays thin. — **Reversibility:** costly — E1 preflight/post checks and the admin page read these field names.

### Reconcile script (ADMIN-03)
- **D-26:** Usage is `npm run reconcile -- [--sale <saleId>] [--fix]` (`tsx scripts/reconcile.ts`), parsed with the existing `scripts/cli-args.ts` / `node:util` `parseArgs`. It does not need `JWT_SECRET`, and the 27017 guard and one-line `[LỖI]` startup failures apply as in seed/reset.
- **D-27:** Scope: without `--sale` it checks every sale whose `mode === "v2"` and prints one "bỏ qua (mode vX)" line for each v0/v1 sale. `--sale` on a v0/v1 sale prints the same skip line and exits 0. Redis is not the stock source for those modes, so they would always look out of sync.
- **D-28:** Per sale it checks `stock:<id> === totalQty - successOrders` (a missing key counts as drift) and `SMEMBERS buyers:<id>` against the set of `userId` in that sale's orders. It prints expected vs actual stock and the counts of missing and extra buyers with up to 10 sample ids each.
- **D-29:** `--fix` runs one `multi()`: `SET stock`, `DEL buyers`, and `SADD buyers ...userIds` when there are any. It checks every `[err, res]` pair, writes one `stock_movements` row `{ reason: "reconcile_fix", delta: newStock - oldStock (oldStock = 0 when the key was missing), orderId: null }`, and then re-checks.
- **D-30:** Exit codes: **0** means everything is in sync (or there was nothing to check, or `--fix` repaired it and the re-check passed). **2** means drift remains. **1** means a usage, config or connection error (the existing `fail()` path). The Phase 3 harness treats only 0 as clean. The script's help text says to run it only while no buys are in flight. — **Reversibility:** costly — the Phase 3 E1/E4 harness depends on these exit codes.
- **D-31:** Put the check/fix logic in a service function (for example `services/reconcile.service.ts`) that the CLI calls, so integration tests can run it in-process.

### Tests
- **D-32:** All new tests go in `backend/test/integration/*.test.ts` and run under `npm run test:int` with the existing helpers. Each file uses its own database `flashsale_test_<name>_<pid>` and its own Redis db index (Phase 1 used 2–5; Phase 2 files take 6 and up, one per file). Never use db 0.
- **D-33:** The BUY-09 Lua smoke test (`lua.test.ts`) uses the real `registerBuyScript` against Redis 7.4 over ioredis 6 RESP3. It asserts that all four codes `1/0/-1/-2` are observed and that 1,000 parallel calls with distinct users on stock 100 give exactly 100 ones, final stock 0 and `SCARD = 100`.
- **D-34:** The buy pipeline tests run the in-process app in test mode (`x-test-user`). They are table-driven over V0/V1/V2 for the D-06 codes (except the D-07 edge case). They burst in parallel with distinct users: V1 and V2 must end with exactly `totalQty` orders, V2 must leave `remainingQty` unchanged, and the V2 result must reconcile clean. For V0 the test makes up to 3 attempts (resetting between them) and passes when any attempt ends with `remainingQty < 0` and orders > `totalQty`. If none oversells, it fails with a clear message, so V0 overselling stays proven without a flaky single shot.
- **D-35:** Compensation tests use the D-14 `createOrder` seam. They cover V1 E11000, V1 generic error with no order, V1 generic error where the order was written (201, no refund), the V2 equivalents (E11000 = `INCRBY` only, buyer stays in the set), and a `stock_movements` row only on a refund. A `qty: -5` test confirms that stock never increases in any mode.

### Claude's Discretion
- File layout follows `.planning/research/ARCHITECTURE.md` (controllers, routes, services such as `sale-cache`, `purchase`, `stock`, `lua`, `reconcile`), adapted to the kebab-case file names Phase 1 already uses.
- Exact Vietnamese messages for every new code, and the reconcile output format.
- Whether the product summary in `/orders/me` uses `populate` or a separate `$in` query.
- V0 on a sale id that was deleted after it was cached (for example a reseed while the server runs): treat a `findOne` that returns `null` as 404. Pick and test whatever is simplest, consistent with D-18.
- How the in-process V0 burst is sized (users vs stock) to make overselling likely within D-34's 3 attempts.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements and scope
- `docs/SPECS.md` §6: data design, Redis keys, reset rules
- `docs/SPECS.md` §7: API table, auth, test mode, error table
- `docs/SPECS.md` §8: shared checks, response-code table, V0/V1/V2 algorithms, `buy.lua`, implementation notes, mode-mixing risk, reconcile
- `docs/SPECS.md` §13: proposals now adopted (`sale.mode`, static cache shared by all modes, where `stock_movements` are written)
- `.planning/REQUIREMENTS.md`: READ-01..04, BUY-01..09, ADMIN-01..03
- `.planning/ROADMAP.md`: Phase 2 success criteria
- `.planning/PROJECT.md`: Key Decisions table (`code` field, `Order.exists` before refund, V2 E11000 → `INCRBY` only, mode via reset, reset service factory)
- `.planning/phases/01-foundation-infra-data-auth/01-CONTEXT.md`: D-09 (reset service and `onSaleReset` seam), D-14 (test mode), D-15 (error JSON and codes), D-17 (health `testMode`), integration-point notes for body-less POSTs

### Stack and patterns
- `.claude/CLAUDE.md`: pinned versions, `returnDocument: "after"` instead of `new: true`, `exec()` result checking for `multi()`, ESM `.js` imports, no logs on the buy path
- `.planning/research/ARCHITECTURE.md`: layer responsibilities, Pattern 2 (single-flight sale cache), the V0/V1/V2 table, Pattern 5 (remaining by mode), the data-flow walkthroughs, the stats computation
- `.planning/research/PITFALLS.md`: buy-path pitfalls (logging, `new: true` warning, `multi()` errors, path handling for `buy.lua`)
- `.planning/research/STACK.md`: ioredis 6 `defineCommand` + RESP3 verification, Mongoose 9 query options

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `backend/src/services/sale-admin.service.ts`: `createSaleAdminService({ redis, onSaleReset })` with `resetSale`/`resetAllSales`. The admin route reuses it and passes `saleCache.invalidate`. Stats can be added here.
- `backend/src/config/redis.ts`: `stockKey()`, `buyersKey()`, `createRedis`/`connectRedis` (`maxRetriesPerRequest: 1`, runtime error logging armed after boot).
- `backend/src/utils/http-error.ts`: `HttpError(status, message, code)` and the `ErrorCode` union, which needs the five new codes.
- `backend/src/utils/object-id.ts`: `normalizeObjectId()` for `:id` params and `--sale`.
- `backend/src/middlewares/auth.ts`: `createAuthMiddleware(deps)` → `requireAuth` / `requireAdmin`; `req.user = { id, role }`.
- `backend/src/middlewares/error.ts`: maps `HttpError`, `CastError`, `ValidationError`, E11000 → `DUPLICATE` (the buy path must catch E11000 itself and throw `ALREADY_BOUGHT`), body-parser errors; a 500 logs the stack.
- `backend/src/models/*`: `FlashSale` (`remainingQty` without `min`, `SALE_MODES`), `Order` (unique `(saleId, userId)`, `(userId, createdAt -1)`), `Product`, `StockMovement` (free-form `reason`).
- `backend/scripts/cli-args.ts`, `scripts/reset.ts`: CLI argument parsing and the one-line `[LỖI]` startup pattern to copy for `scripts/reconcile.ts`.
- `backend/src/lua/buy.lua`: the SPECS §8 script, already copied to `dist/lua/` by `build`.
- `backend/test/helpers.ts`: per-file test databases, Redis db index helper, in-process app helpers.

### Established Patterns
- Factory services with injected deps (`createXService({ ... })`), so no module-level hooks.
- `createApp(deps)` does no I/O, and `server.ts` owns boot order (config → port → Mongo → indexes → Redis → listen). `registerBuyScript` goes right after `connectRedis`.
- Routers are built by `createXRouter(deps/auth)` and mounted in `routes/index.ts`. Register `/sales/active` **before** `/sales/:id`.
- No request logging middleware: keep the buy path log-free.
- Every test file wraps its cases in one top-level `describe("<file>.test", ...)`.

### Integration Points
- `routes/index.ts`: mount `/products`, `/sales`, `/orders`, and add the reset and stats routes to `admin.routes.ts` (the router currently receives only `auth`, so it needs `deps` or the services too).
- `AppDeps` (`cfg`, `jwtSecret`, `redis`) may need to carry the sale cache and services, or the router builds them from `redis`. Decide this in planning, keeping a single cache instance per app.
- `backend/package.json`: add `"reconcile": "tsx scripts/reconcile.ts"`.
- Phase 3 depends on: the D-06 codes, `{ order }` / `{ stats }` shapes, reconcile exit codes (D-30), admin reset with `{ mode }`, and `stats.mode`.
- Phase 4 depends on: the D-20/D-21 shapes (`now`, `remaining`, `stockLoaded`, `product` summary), `redisInSync` for the badge, and the error codes for distinct messages.

</code_context>

<specifics>
## Specific Ideas

- Keep the buy path minimal and identical in structure across modes: same cache read, same validation, same `createOrder`. The only difference is the stock step, so the V1-vs-V2 numbers compare the stock strategy only.
- Undersell is preferable to oversell whenever compensation is ambiguous (D-10).

</specifics>

<deferred>
## Deferred Ideas

- **Mode-mismatch guard** (reject `?mode` ≠ `sale.mode`): not in SPECS. Revisit only if the Phase 3 harness keeps tripping over it. D-03 records that it is easy to add.
- **Phase 3 (E4):** During a MongoDB outage, every failed buy prints a stack through the generic 500 handler. Decide in Phase 3 whether to rate-limit that error logging so E4 does not flood the console or skew timing.
- **Phase 3:** The Phase 1 deferred idea of letting admin reset accept `totalQty` (E1 = 100, E2 ≥ 1,000 without reseeding) still stands. It is not added here.

</deferred>

---

*Phase: 02-buy-pipeline-admin-apis*
*Context gathered: 2026-11-08*
