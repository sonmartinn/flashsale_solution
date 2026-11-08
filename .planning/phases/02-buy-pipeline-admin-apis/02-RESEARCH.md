# Phase 2: Buy Pipeline & Admin APIs - Research

**Researched:** 2026-11-08
**Domain:** Express 5 + Mongoose 9 + ioredis 6 (Lua) buy pipeline, read/admin APIs, Redis–MongoDB reconcile CLI
**Confidence:** HIGH (every load-bearing mechanism was probed live this session against the installed packages and the running `flashsale-mongo` / `flashsale-redis` containers)

## Summary

Phase 2 adds no new dependencies. Everything it needs already exists in `backend/node_modules` and in Phase 1 code. The work is wiring: a single-flight static sale cache, a purchase service factory with three stock strategies and one shared `createOrder`, compensation on order-insert failure, read APIs with explicit DTO mappers, two admin routes, and a reconcile service with a CLI wrapper. CONTEXT.md (D-01..D-35) already locks almost every design choice, so this research is about how to implement those choices on the exact installed stack and where the traps are.

Live probes this session confirmed the risky assumptions. (1) The ioredis 6 module augmentation for a custom `flashBuy` command passes TS 7.0.2 `tsc` strict from a `.d.ts` picked up by `include`, with no runtime import. Without it, `tsc` fails with `TS2339`. (2) Over RESP3, `defineCommand` + `buy.lua` returns JS numbers `-2, 1, -1, 0`. 1,000 parallel calls on stock 100 gave exactly 100 ones, stock 0 and SCARD 100. It also survives `SCRIPT FLUSH` (NOSCRIPT fallback). (3) `findOneAndUpdate` without `new`/`returnDocument` emits no deprecation warning, and with `{ projection: { _id: 1 }, lean: true }` it returns `{ _id }` or `null`. (4) A duplicate `Model.create` throws `MongoServerError` with `code 11000`. (5) `MGET` with zero keys throws `ERR wrong number of arguments`. (6) An in-process V0 burst with pool 10 oversells on every attempt: stock 10 with 100 users gave 100 orders and `remainingQty -90` in all 3 attempts.

**Primary recommendation:** Build in this order: shared primitives (codes, Lua registration + typing, sale cache, mappers) → purchase service + buy route → read routes → admin routes + reconcile. Keep `AppDeps` unchanged and construct the sale cache, sale-admin service and purchase service once inside `createApiRouter`. Exercise compensation by calling `createPurchaseService` directly with an injected `createOrder`, not through HTTP.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

The user asked Claude to decide every gray area using its recommendations ("Oke bạn cứ tự quyết theo khuyến nghị đi"), the same as in Phase 1. The decisions below are Claude's choices and are now locked for planning. Anything SPECS §7–8, REQUIREMENTS or the PROJECT.md Key Decisions table already fixes is not repeated here. Read those directly.

#### Buy input validation (order follows SPECS §8)
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

#### Buy handlers and compensation
- **D-08:** A unique-index error (E11000) on the order insert maps to 409 `ALREADY_BOUGHT` in **all three** modes, never to the generic `DUPLICATE`.
- **D-09:** V0 has **no** compensation, by design (naive). With distinct users it never hits E11000. A repeat buyer in V0 leaks one unit, which is part of what V0 demonstrates. E3 only covers V1 and V2.
- **D-10:** V1 and V2 handle an order-insert error that is not E11000 the same way. They look the order up by `(saleId, userId)`:
  - If the order exists, the write actually succeeded, so return **201 with that order** and do not refund.
  - If the order does not exist, refund and then rethrow (500).
  - If the lookup itself throws, do **not** refund and rethrow (500). This means an undersell rather than an oversell. It is the "limit of compensation on ambiguous writes" that Phase 5 documents.

  (REQUIREMENTS says `Order.exists`. A `findOne(...).lean()` that returns the order satisfies the same check and lets us answer 201.)
- **D-11:** Refund operations: V1 `FlashSale.updateOne({ _id }, { $inc: { remainingQty: +qty } })`, awaited. V2 E11000 → `INCRBY` only. V2 other error with no order → `INCRBY` + `SREM` in one `multi()`, checking every `[err, res]` pair and treating `null` as aborted. The refund must finish before the `stock_movements` write.
- **D-12:** After a successful refund, write one `stock_movements` row: `reason` `"compensate_v1"` or `"compensate_v2"`, `delta: +qty`, `orderId: null`. A failure to write this row is caught and printed with one `console.error` line; it never blocks the refund or changes the response. When the refund itself fails, print one `console.error` line with `saleId`, `userId` and `mode` and rethrow the original error. These logs are on the failure path only. The success path writes no log and no `stock_movements` row (BUY-08).
- **D-13:** The Lua script is registered once at boot with `redis.defineCommand("flashBuy", { numberOfKeys: 2, lua })`, read with `readFileSync(new URL("../lua/buy.lua", import.meta.url), "utf8")`. Put this in a small module (for example `services/lua.ts` with `registerBuyScript(redis)`) that `server.ts` calls right after `connectRedis` and the test helpers call too. If the file cannot be read, boot fails with one `[LỖI]` line (Phase 1 convention). The command's result is checked to be one of `1, 0, -1, -2`; anything else throws (500). Use the module augmentation of `RedisCommander` (or a typed wrapper) so the custom command passes `tsc` strict.
- **D-14:** The purchase service is a factory, the same as Phase 1's `createSaleAdminService`: `createPurchaseService({ redis, saleCache, createOrder? })`. It returns a discriminated result, and the controller maps it to HTTP. The `createOrder` seam has the real shared implementation as its default. It exists so integration tests can force an E11000, a generic error, or an "error but the order was written" case to exercise D-10/D-11 without mocks in production code.
- **D-15:** The shared `createOrder({ saleId, userId, productId, price, qty, mode })` writes `{ userId, saleId, productId, qty, price: salePrice, status: "success", mode }`. `productId` and `price` come from the sale cache. `mode` is the requested `?mode`.

#### Static sale cache (BUY-02)
- **D-16:** The cache is a module-level `Map<saleId, Promise<SaleInfo>>` with single-flight loading. `SaleInfo = { productId, salePrice, totalQty, startAt, endAt, status }`, with dates stored as epoch ms. It deliberately leaves out **`mode`** (buy uses `?mode`, and a stale mode after a CLI `--mode` reset would cause wrong answers) and never holds `remainingQty`.
- **D-17:** There is **no TTL**. Only `invalidate(saleId?)` clears entries. Admin reset passes it as `onSaleReset` (the Phase 1 seam). A TTL would add periodic Mongo reads in the middle of a measurement and would not make CLI reset correct anyway, since the CLI already prints its cache warning.
- **D-18:** A load that finds no sale is **not** cached: the promise resolves to `null`, the entry is deleted, and the caller gets 404. A rejected load is evicted too. This prevents a stale 404 after `npm run seed` creates a new sale while the server is running.
- **D-19:** The read APIs (`GET /sales/:id`, `/sales/active`) read MongoDB fresh and do not use the cache. They need `remainingQty` and `mode` anyway, and they are not on the measured path.

#### Read API response shapes
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

#### Admin routes and stats
- **D-24:** `POST /admin/sales/:id/reset` reads `req.body ?? {}`. The body must be an object if present. `mode`, if present, must be the string `v0`, `v1` or `v2`, otherwise 400 `INVALID_MODE` (checked in the route before calling the service). It calls the existing `createSaleAdminService({ redis, onSaleReset: saleCache.invalidate }).resetSale` and returns 200 `{ sale: ResetResult }` (with ISO dates). An unknown sale gets 404 (the service already throws it). The admin router guard stays as it is.
- **D-25:** `GET /admin/sales/:id/stats` returns 200 `{ stats }`:
  `{ saleId, mode, status, totalQty, mongoRemaining, redisStock: number | null, redisBuyers: number, orders, distinctUsers, oversold, redisInSync: boolean | null }`
  - `orders = countDocuments({ saleId, status: "success" })`; `distinctUsers = distinct("userId", …).length`; `oversold = max(0, orders - totalQty)`
  - `redisStock` is `null` when the key is missing; `redisBuyers = SCARD`
  - `redisInSync` is a cheap check for the Phase 4 badge: for a v2 sale it is `redisStock === totalQty - orders && redisBuyers === distinctUsers`; for v0/v1 it is `null` (Redis is not the stock source). Full set comparison is the reconcile script's job.
  - The stats logic lives in the sale-admin service (or a sibling service) so the route stays thin. — **Reversibility:** costly — E1 preflight/post checks and the admin page read these field names.

#### Reconcile script (ADMIN-03)
- **D-26:** Usage is `npm run reconcile -- [--sale <saleId>] [--fix]` (`tsx scripts/reconcile.ts`), parsed with the existing `scripts/cli-args.ts` / `node:util` `parseArgs`. It does not need `JWT_SECRET`, and the 27017 guard and one-line `[LỖI]` startup failures apply as in seed/reset.
- **D-27:** Scope: without `--sale` it checks every sale whose `mode === "v2"` and prints one "bỏ qua (mode vX)" line for each v0/v1 sale. `--sale` on a v0/v1 sale prints the same skip line and exits 0. Redis is not the stock source for those modes, so they would always look out of sync.
- **D-28:** Per sale it checks `stock:<id> === totalQty - successOrders` (a missing key counts as drift) and `SMEMBERS buyers:<id>` against the set of `userId` in that sale's orders. It prints expected vs actual stock and the counts of missing and extra buyers with up to 10 sample ids each.
- **D-29:** `--fix` runs one `multi()`: `SET stock`, `DEL buyers`, and `SADD buyers ...userIds` when there are any. It checks every `[err, res]` pair, writes one `stock_movements` row `{ reason: "reconcile_fix", delta: newStock - oldStock (oldStock = 0 when the key was missing), orderId: null }`, and then re-checks.
- **D-30:** Exit codes: **0** means everything is in sync (or there was nothing to check, or `--fix` repaired it and the re-check passed). **2** means drift remains. **1** means a usage, config or connection error (the existing `fail()` path). The Phase 3 harness treats only 0 as clean. The script's help text says to run it only while no buys are in flight. — **Reversibility:** costly — the Phase 3 E1/E4 harness depends on these exit codes.
- **D-31:** Put the check/fix logic in a service function (for example `services/reconcile.service.ts`) that the CLI calls, so integration tests can run it in-process.

#### Tests
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

### Deferred Ideas (OUT OF SCOPE)
- **Mode-mismatch guard** (reject `?mode` ≠ `sale.mode`): not in SPECS. Revisit only if the Phase 3 harness keeps tripping over it. D-03 records that it is easy to add.
- **Phase 3 (E4):** During a MongoDB outage, every failed buy prints a stack through the generic 500 handler. Decide in Phase 3 whether to rate-limit that error logging so E4 does not flood the console or skew timing.
- **Phase 3:** The Phase 1 deferred idea of letting admin reset accept `totalQty` (E1 = 100, E2 ≥ 1,000 without reseeding) still stands. It is not added here.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| READ-01 | `GET /api/products`, `/api/products/:id` (bad id 400, unknown 404) | Pattern 6 (mappers), `normalizeObjectId` reuse; typed `Product.find().sort({_id:1}).lean()` verified with `tsc` |
| READ-02 | `GET /api/sales/active` with product info | Pattern 5 (`remaining` by mode, single `MGET`, guard for zero keys — Pitfall 4); active filter verified to typecheck |
| READ-03 | `GET /api/sales/:id`, `remaining` by `sale.mode`, `now` | Pattern 5; `GET` missing → `null`, `countDocuments` fallback verified |
| READ-04 | `GET /api/orders/me`, newest first | `Order.find({userId}).sort({createdAt:-1}).limit(100).lean()` + `$in` product query typechecks; index `(userId, createdAt -1)` exists |
| BUY-01 | Shared checks in SPECS order | Pattern 2 (controller check order); Express 5 query/body behavior probed live |
| BUY-02 | Static sale cache shared by all modes, cleared on reset | Pattern 1 (single-flight factory), Pitfall 2 (identity-guarded eviction), reset passes lowercase id to `onSaleReset` |
| BUY-03 | Identical codes across modes | D-06 table; Pattern 3 (result union → one mapping table) |
| BUY-04 | V0 naive oversell | Pattern 3 V0 skeleton (typechecked); live calibration: oversell on 9/9 attempts |
| BUY-05 | V1 atomic + refund | `findOneAndUpdate` with `{ projection, lean }` verified: returns `{_id}`/`null`, no deprecation warning |
| BUY-06 | V2 Lua via `defineCommand`, `remainingQty` untouched | Pattern 4 (augmentation verified with TS 7.0.2; runtime codes verified on Redis 7.4 RESP3) |
| BUY-07 | V2 compensation (`multi`, E11000 → `INCRBY` only, then `stock_movements`) | Pattern 3 compensation skeleton; `multi().exec()` shape `[[null,1],[null,1]]` verified |
| BUY-08 | One `createOrder`; no log / no `stock_movements` on success | Pattern 3; Anti-patterns list |
| BUY-09 | Lua smoke test: codes 1/0/-1/-2, 1,000 parallel → 100 | Reproduced live this session: `ones 100 zeros 900 stock 0 scard 100` |
| ADMIN-01 | Admin reset over HTTP with optional `{ mode }` | Reuse `createSaleAdminService`; route-level `INVALID_MODE` check (service throws `VALIDATION_ERROR` otherwise) |
| ADMIN-02 | Admin stats | Pattern 7 (stats computation); SCARD missing → 0, GET missing → null verified |
| ADMIN-03 | Reconcile CLI with `--fix`, non-zero exit on drift | Pattern 8; `multi().set().del().sadd(key, array)` verified with 5,000 members; `cli-args` needs a boolean option (Pitfall 9) |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- TypeScript `strict` on both sides. Done means `typecheck` passes **and** `build` passes. `tsx` does not type-check.
- Backend ESM NodeNext: relative imports end in `.js`. Use `import type` / inline `type` under `verbatimModuleSyntax`.
- Express 5 forwards async errors. Do not wrap handlers in try/catch. Business errors throw `HttpError(status, message, code)`. Local try/catch is allowed only to translate or compensate (Phase 1 precedent: `middlewares/auth.ts`, `scripts/cli-args.ts`).
- Messages and comments in Vietnamese.
- **No logging on the buy path.** No request logger. Logs only on failure paths.
- Mongoose 9: never `{ new: true }`. Use `returnDocument: "after"` or no option with a null check.
- `multi()`: check every `[err, res]` pair and treat `null` as aborted.
- `readFileSync(new URL("../lua/buy.lua", import.meta.url), "utf8")`. Never `URL.pathname` or `__dirname`.
- Build copies `src/lua/` → `dist/lua/` (already in `package.json`).
- Security: every input field must be a string (or, for `qty`, strictly the number 1). Client never sets `role`. `JWT_SECRET` has no default.
- MongoDB URI is `127.0.0.1:27018`, never 27017. MongoDB transactions are out of scope (standalone).
- Measure on `npm run start:test`, not `dev`. `maxPoolSize` explicit.
- Do not install software, kill foreign processes, or run `docker compose down -v`.
- Git: never add a `Co-Authored-By` line.
- GSD workflow: edits go through `/gsd-execute-phase`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Input validation (mode/qty/id) | API (controller) | — | Must run before any I/O, in SPECS order (D-01) |
| Static sale info | API (in-process cache) | Database (MongoDB load on miss) | Identical cost for all modes (BUY-02) |
| Stock reservation V0/V1 | Database (MongoDB `flash_sales`) | — | V1 atomicity is a single-document `$inc` with a filter |
| Stock reservation V2 | Database (Redis Lua) | — | Atomic script over `stock:` + `buyers:` |
| Order persistence + per-user uniqueness | Database (MongoDB unique `(saleId,userId)`) | API (`createOrder`) | Unique index is the last guard for every mode |
| Compensation | API (purchase service) | Both stores | Only Node knows that stock was taken and the insert failed |
| `remaining` display | API (read service) | Redis / MongoDB by `sale.mode` | V2 never touches `remainingQty` |
| Reset / stats | API (sale-admin service) | Both stores | Shared with the CLI (Phase 1 D-09) |
| Reconcile | CLI + service | Both stores | Explicit repair, never automatic on boot |

## Standard Stack

### Core (all already installed; versions read from `backend/node_modules` this session)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| express | 5.3.0 | Routes, async error forwarding | Locked by CLAUDE.md [VERIFIED: node_modules/express/package.json] |
| mongoose | 9.11.4 (driver mongodb 7.7.0) | `findOneAndUpdate`, `create`, `distinct`, `countDocuments` | Locked [VERIFIED: node_modules/mongoose/package.json] |
| ioredis | 6.0.0 | `defineCommand`, `multi`, `mget`, `smembers` | Locked [VERIFIED: node_modules/ioredis/package.json] |
| typescript | 7.0.2 | `typecheck` | Locked [VERIFIED: `npx tsc --version` → `Version 7.0.2`] |
| node:test / node:assert | Node 24.22.1 | Integration tests | Phase 1 harness [VERIFIED: `node --version`] |
| tsx | 4.23.x | `npm run reconcile` and test loader | Phase 1 pattern [VERIFIED: backend/package.json:34] |

### Supporting
None new. `node:util` `parseArgs` (already used by `scripts/cli-args.ts`) handles `--fix` as `type: "boolean"`.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Module augmentation of `RedisCommander` | Typed wrapper with a cast (`(redis as unknown as BuyCmd).flashBuy`) | Both work. Augmentation was verified with TS 7.0.2 and gives typed `multi()` too. Use augmentation |
| `Order.findOne(...).lean()` for the D-10 lookup | `Order.exists` | `exists` cannot return the order for the 201 response. D-10 already picks `findOne` |
| Separate `$in` product query in `/orders/me` | `populate("productId")` | `populate` rewrites `productId` into an object, which breaks `OrderDto.productId: string` and needs a second mapper branch. Use `$in` + `Map` |

**Installation:** none. `npm install` is not needed in Phase 2.

## Package Legitimacy Audit

No external packages are installed in this phase. Every import resolves to a dependency that Phase 1 already installed and audited (01-01-T1 human checkpoint).

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| (none new) | — | — | — | — | — | — |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
POST /api/sales/:id/buy?mode=vX  {qty:1}
   │
   ▼
express.json (rejectEmptyJson) ──bad JSON──► errorHandler 400 INVALID_JSON
   │
   ▼
requireAuth (JWT | x-test-user in test mode) ──► 401
   │  req.user.id (lowercase hex)
   ▼
buy controller: mode string ∈ SALE_MODES? ──no──► 400 INVALID_MODE
                body object && qty===1?    ──no──► 400 VALIDATION_ERROR
                normalizeObjectId(id)?     ──no──► 400 INVALID_ID
   │
   ▼
purchase.buy({saleId,userId,mode,qty})
   │
   ├─► saleCache.get(saleId) ──(miss, single-flight)──► FlashSale.findById(static fields).lean()
   │        null ──► 404 NOT_FOUND          status/window ──► 400 SALE_NOT_ACTIVE
   │
   ├─► handlers[mode]
   │     v0: findById(remainingQty) → updateOne $inc -qty → createOrder        (no compensation)
   │     v1: findOneAndUpdate {$gte} $inc -qty → createOrder → [fail] refund $inc +qty
   │     v2: redis.flashBuy(stock,buyers,userId,qty) → createOrder → [fail] multi INCRBY(+SREM)
   │                                  -1/0/-2 ──► already_bought / sold_out / not_loaded
   │
   ▼
BuyResult union ──► controller STATUS table ──► 201 {order} | 409 SOLD_OUT | 409 ALREADY_BOUGHT | 503 STOCK_NOT_LOADED
thrown errors ──► errorHandler (500 INTERNAL_ERROR, stack logged)

Admin: /api/admin/* ─► requireAuth ─► requireAdmin ─► reset (saleAdmin.resetSale → onSaleReset = saleCache.invalidate)
                                                    └► stats (Mongo counts + Redis GET/SCARD)
CLI:   npm run reconcile ─► reconcile.service (Mongo truth vs Redis) ─► [--fix] multi SET/DEL/SADD ─► exit 0/2/1
```

### Recommended Project Structure (kebab-case, following Phase 1)
```
backend/src/
├── types/ioredis.d.ts            # NEW: RedisCommander augmentation for flashBuy
├── utils/http-error.ts           # EDIT: +5 ErrorCodes
├── services/
│   ├── lua.ts                    # NEW: registerBuyScript(redis), runBuyScript(...) result check
│   ├── sale-cache.ts             # NEW: createSaleCache() → { get, invalidate }
│   ├── order.service.ts          # NEW: createOrder (shared), isDuplicateKeyError
│   ├── purchase.service.ts       # NEW: createPurchaseService({ redis, saleCache, createOrder? })
│   ├── stock.service.ts          # NEW: remaining/stockLoaded by mode (+ MGET batch)
│   ├── catalog.service.ts        # NEW (or product/sale read services): products, sales, orders/me
│   ├── sale-admin.service.ts     # EDIT: + getStats(saleId)
│   └── reconcile.service.ts      # NEW: checkSale / fixSale / reconcileAll
├── utils/dto.ts                  # NEW: toProductDto, toSaleDto, toOrderDto (explicit mappers)
├── controllers/ product, sale (incl. buy), order, admin
├── routes/ product.routes.ts sale.routes.ts order.routes.ts admin.routes.ts (EDIT) index.ts (EDIT)
└── server.ts                     # EDIT: registerBuyScript right after connectRedis
backend/scripts/
├── cli-args.ts                   # EDIT: boolean option support + parseReconcileArgs + RECONCILE_USAGE
└── reconcile.ts                  # NEW: copy of reset.ts skeleton
backend/test/
├── helpers.ts                    # EDIT: spawnCli script union += "reconcile"; optional test-data helpers
├── cli-args.test.ts              # EDIT: parseReconcileArgs cases (unit)
└── integration/ lua.test.ts(6) buy.test.ts(7) compensation.test.ts(8) read.test.ts(9) admin.test.ts(10) reconcile.test.ts(11)
```

### Pattern 1: Single-flight static sale cache (factory instance per app)
**What:** D-16 calls for "a module-level `Map`". The code_context also asks for "a single cache instance per app". Satisfy both with a factory whose `Map` lives in the closure, created **once** in `createApiRouter`. Its `invalidate` is a closure (not a class method), so passing it as `onSaleReset` cannot lose `this`. If the planner prefers a literal module-level `Map`, the behavior is the same, but test files that start several apps in one process then share entries. That is harmless only because reset always invalidates.
```typescript
// services/sale-cache.ts
import { FlashSale, type SaleStatus } from "../models/index.js";

export interface SaleInfo { productId: string; salePrice: number; totalQty: number; startAt: number; endAt: number; status: SaleStatus }
export interface SaleCache { get(saleId: string): Promise<SaleInfo | null>; invalidate(saleId?: string): void }

export function createSaleCache(): SaleCache {
  const entries = new Map<string, Promise<SaleInfo | null>>();
  const get = (saleId: string): Promise<SaleInfo | null> => {
    const hit = entries.get(saleId);
    if (hit !== undefined) return hit;
    const p = FlashSale.findById(saleId, { productId: 1, salePrice: 1, totalQty: 1, startAt: 1, endAt: 1, status: 1 })
      .lean()
      .then((s) => s === null ? null : {
        productId: String(s.productId), salePrice: s.salePrice, totalQty: s.totalQty,
        startAt: s.startAt.getTime(), endAt: s.endAt.getTime(), status: s.status,
      });
    entries.set(saleId, p);
    // D-18: không cache null và không cache lỗi. Chỉ xóa khi entry vẫn là promise này (Pitfall 2).
    const evict = (): void => { if (entries.get(saleId) === p) entries.delete(saleId); };
    p.then((v) => { if (v === null) evict(); }, evict);
    return p;
  };
  const invalidate = (saleId?: string): void => { if (saleId === undefined) entries.clear(); else entries.delete(saleId); };
  return { get, invalidate };
}
```
The projection and the `s.startAt.getTime()` / `String(s.productId)` accesses were typechecked against the real `FlashSale` model with TS 7.0.2 this session [VERIFIED: tsc probe]. `SaleStatus` is exported from `models/index.ts:9` as `type SaleStatus` [VERIFIED: backend/src/models/index.ts:9 `export { FlashSale, SALE_MODES, SALE_STATUSES, type SaleMode, type SaleStatus } from "./flash-sale.js";`].

### Pattern 2: Buy controller check order (D-01..D-05)
```typescript
// controllers/sale.controller.ts (trích)
const buy: RequestHandler = async (req, res) => {
  const userId = req.user!.id;                         // requireAuth đã chạy trước trên route
  const rawMode: unknown = req.query["mode"];
  const mode = SALE_MODES.find((m) => m === rawMode);  // mảng hoặc undefined đều không khớp
  if (mode === undefined) throw new HttpError(400, "Chế độ mua phải là v0, v1 hoặc v2", "INVALID_MODE");
  const body: unknown = req.body;
  if (typeof body !== "object" || body === null || Array.isArray(body) || (body as { qty?: unknown }).qty !== 1) {
    throw new HttpError(400, "Số lượng mua phải đúng bằng 1", "VALIDATION_ERROR");
  }
  const saleId = normalizeObjectId(req.params["id"]);
  if (saleId === null) throw new HttpError(400, "Mã đợt sale không hợp lệ", "INVALID_ID");
  const result = await purchase.buy({ saleId, userId, mode, qty: 1 });
  // ánh xạ result → HTTP ở MỘT bảng duy nhất
};
```
`(body).qty !== 1` with strict equality rejects `"1"`, `true`, `[1]`, `1.5`, `-5`, `0` and `2`, and accepts JSON `1.0`. Express 5 behavior was probed live: `?mode=v1&mode=v2` gives an array, `?mode[$ne]=x` gives `mode === undefined`, a body-less POST gives `req.body === undefined`, and a JSON `[1]` body gives an array (`express.json` strict mode accepts arrays) [VERIFIED: live probe]. `SALE_MODES` is `["v0", "v1", "v2"] as const` [VERIFIED: backend/src/models/flash-sale.ts:3 `export const SALE_MODES = ["v0", "v1", "v2"] as const;`].

The window check runs inside `purchase.buy` after `saleCache.get`: `status !== "active"` or `now < startAt` → "Đợt sale chưa bắt đầu". `now > endAt` or `status === "ended"` → "Đợt sale đã kết thúc". Both use `SALE_NOT_ACTIVE`. `SALE_STATUSES` is `["scheduled", "active", "ended"] as const` [VERIFIED: backend/src/models/flash-sale.ts:6].

### Pattern 3: Purchase service with shared `createOrder` and compensation
```typescript
// services/purchase.service.ts (khung)
export type BuyResult =
  | { kind: "ok"; order: OrderDto }
  | { kind: "sold_out" } | { kind: "already_bought" } | { kind: "not_loaded" };

export interface CreateOrderInput { saleId: string; userId: string; productId: string; price: number; qty: number; mode: SaleMode }
export type CreateOrderFn = (i: CreateOrderInput) => Promise<OrderDto>;

// V0 — cố ý ngây thơ
const s = await FlashSale.findById(saleId, { remainingQty: 1 }).lean();
if (s === null) throw new HttpError(404, "Không tìm thấy đợt sale", "NOT_FOUND"); // cache còn, sale bị xóa
if (s.remainingQty < qty) return { kind: "sold_out" };
await FlashSale.updateOne({ _id: saleId }, { $inc: { remainingQty: -qty } });
try { return { kind: "ok", order: await createOrder(input) }; }
catch (e) { if (isDuplicateKeyError(e)) return { kind: "already_bought" }; throw e; } // KHÔNG hoàn kho

// V1 — nguyên tử một document
const dec = await FlashSale.findOneAndUpdate(
  { _id: saleId, remainingQty: { $gte: qty } }, { $inc: { remainingQty: -qty } },
  { projection: { _id: 1 }, lean: true });                // không truyền new/returnDocument → không cảnh báo
if (dec === null) return { kind: "sold_out" };
try { return { kind: "ok", order: await createOrder(input) }; }
catch (e) { return compensateV1(e, input); }             // D-10/D-11/D-12

// V2 — Lua
const code = await runBuyScript(redis, saleId, userId, qty); // ném nếu không thuộc {1,0,-1,-2}
if (code === -1) return { kind: "already_bought" };
if (code === 0) return { kind: "sold_out" };
if (code === -2) return { kind: "not_loaded" };
try { return { kind: "ok", order: await createOrder(input) }; }
catch (e) { return compensateV2(e, input); }
```
Compensation flow shared by V1 and V2 (D-10..D-12):
```
catch (e):
  if isDuplicateKeyError(e):
      refund(onlyStock = true)        // V1: $inc +qty ; V2: INCRBY only (buyer is real)
      logMovement best-effort         // StockMovement.create(...).catch(err => console.error(1 line))
      return { kind: "already_bought" }
  let existing
  try { existing = await Order.findOne({ saleId, userId }).lean() }
  catch { throw e }                   // lookup failed: no refund (undersell), rethrow ORIGINAL error
  if existing !== null: return { kind: "ok", order: toOrderDto(existing) }   // no refund
  refund(onlyStock = false)           // V1: $inc +qty ; V2: multi INCRBY + SREM, check pairs
  logMovement best-effort
  throw e
refund failure → console.error(`[Bù trừ] thất bại saleId=… userId=… mode=…`) then throw e (original)
```
Verified facts: a duplicate `create` throws `MongoServerError` with `code 11000` and `instanceof mongoose.mongo.MongoServerError === true` [VERIFIED: live probe]. The existing error middleware already uses that exact test [VERIFIED: backend/src/middlewares/error.ts:37 `if (err instanceof mongoose.mongo.MongoServerError && err.code === 11000) {`]. `findOneAndUpdate(..., { projection: { _id: 1 }, lean: true })` returns `{"_id":"…"}` on a hit and `null` on a miss, and emits no process warning [VERIFIED: live probe + node_modules/mongoose/lib/query.js:4026-4049 — warnings only when `'new' in options` or `'returnOriginal' in options`].

### Pattern 4: Lua registration and typing
```typescript
// src/types/ioredis.d.ts — được include bởi tsconfig ("src"), không cần import ở runtime
import type { ClientContext, Result } from "ioredis";
declare module "ioredis" {
  interface RedisCommander<Context extends ClientContext = { type: "default" }> {
    flashBuy(stockKey: string, buyersKey: string, userId: string, qty: string): Result<number, Context>;
  }
}

// src/services/lua.ts
import { readFileSync } from "node:fs";
import type { Redis } from "ioredis";
import { buyersKey, stockKey } from "../config/redis.js";
export type BuyScriptCode = 1 | 0 | -1 | -2;
export function registerBuyScript(redis: Redis): void {
  // Đọc file BÊN TRONG hàm (không ở cấp module): lỗi ENOENT để server.ts in đúng một dòng [LỖI]
  const lua = readFileSync(new URL("../lua/buy.lua", import.meta.url), "utf8");
  redis.defineCommand("flashBuy", { numberOfKeys: 2, lua });
}
export async function runBuyScript(redis: Redis, saleId: string, userId: string, qty: number): Promise<BuyScriptCode> {
  const r = await redis.flashBuy(stockKey(saleId), buyersKey(saleId), userId, String(qty));
  if (r === 1 || r === 0 || r === -1 || r === -2) return r;
  throw new Error(`Script Lua trả giá trị lạ: ${String(r)}`);
}
```
Verified this session:
- With the `.d.ts` in the compilation, `tsc` exits 0. When it is removed, the error is `TS2339: Property 'flashBuy' does not exist on type 'Redis<"legacy">'`. The README-style `<Context>` form without a constraint also compiles [VERIFIED: TS 7.0.2 probe]. `RedisCommander`, `Result` and `ClientContext` are exported from `ioredis` [VERIFIED: node_modules/ioredis/built/index.d.ts `export { default as RedisCommander, Result, ClientContext, } from "./utils/RedisCommander";`].
- `defineCommand` sets per-instance properties, so calling it twice is harmless [VERIFIED: node_modules/ioredis/built/utils/Commander.js:46-51].
- Runtime replies are JS numbers: `{ notLoaded: -2, ok: 1, dup: -1, sold: 0 }`. 1,000 parallel calls gave `ones 100 zeros 900 stock 0 scard 100`. `options.protocol` is `3`. After `SCRIPT FLUSH` the command still returned `1` (EVALSHA → EVAL fallback) [VERIFIED: live probe on redis:7.4].
- Script return codes [VERIFIED: backend/src/lua/buy.lua:3 `-- Trả về: 1 thành công, 0 hết hàng, -1 đã mua, -2 chưa nạp kho`]. Keys [VERIFIED: backend/src/config/redis.ts:72-74 `export function stockKey(saleId: string): string {` … `` return `stock:${saleId}`; ``; :77-79 `export function buyersKey(saleId: string): string {` … `` return `buyers:${saleId}`; ``].

`server.ts` placement: after the `connectRedis` try/catch block (server.ts:47-54), add:
```typescript
try { registerBuyScript(redis); }
catch (e) { redis.disconnect(); await mongoose.disconnect(); fail(`Không đọc được script Lua: ${e instanceof Error ? e.message : String(e)}`); }
```

### Pattern 5: `remaining` by mode (read path only)
```typescript
// services/stock.service.ts
export async function remainingFor(redis: Redis, sales: { id: string; mode: SaleMode; remainingQty: number; totalQty: number }[]) {
  const v2 = sales.filter((s) => s.mode === "v2");
  const raw = v2.length === 0 ? [] : await redis.mget(v2.map((s) => stockKey(s.id))); // MGET 0 khóa → lỗi
  // map lại theo id; key thiếu → totalQty - countDocuments({ saleId, status: "success" }), stockLoaded=false
}
```
`mget([])` throws `ERR wrong number of arguments for 'mget' command`. `mget(["s:t","nope"])` returns `["7",null]` [VERIFIED: live probe].

### Pattern 6: Explicit DTO mappers
`toOrderDto(doc)` must accept both a hydrated document (from `Order.create`) and a lean object (from `findOne().lean()` in D-10 and from `/orders/me`). Type the parameter structurally: `{ _id: unknown; saleId: unknown; productId: unknown; qty: number; price: number; status: OrderStatus; mode: SaleMode; createdAt: Date }`. Then `String(x._id)` and `x.createdAt.toISOString()` work for both. `doc.createdAt` on a created document and `mine[0]!.createdAt` on a lean result are both typed `Date` [VERIFIED: tsc probe against backend/src/models/order.ts]. `ORDER_STATUSES` is `["success", "cancelled"] as const` [VERIFIED: backend/src/models/order.ts:4].

### Pattern 7: Stats (D-25)
Run five independent reads with `Promise.all`: `FlashSale.findById(id).lean()` (404 if null), `redis.get(stockKey)`, `redis.scard(buyersKey)`, `Order.countDocuments({ saleId, status: "success" })`, `Order.distinct("userId", { saleId, status: "success" })`. `scard` on a missing key returns `0` and `get` returns `null` [VERIFIED: live probe]. `distinct` returns `ObjectId[]` [VERIFIED: live probe `[ new ObjectId('…') ]`]. Bad id → 400 `INVALID_ID` via `normalizeObjectId` (same as `resetSale`, sale-admin.service.ts:41-42).

### Pattern 8: Reconcile service + CLI
- Service: `checkSale(redis, saleId)` → `{ saleId, mode, expectedStock, actualStock: number|null, missingBuyers: string[], extraBuyers: string[], inSync }`. `fixSale(...)` runs `redis.multi().set(stock, String(expected)).del(buyers)` plus `.sadd(buyers, userIds)` when non-empty, checks pairs, writes the `reconcile_fix` movement, then calls `checkSale` again.
- `sadd(key, array)` is a typed overload (`sadd(...args: [key: RedisKey, members: (string | Buffer | number)[]])`) and handled 5,000 members in one `multi()`: `[[null,"OK"],[null,0],[null,5000]]` [VERIFIED: node_modules/ioredis/built/utils/RedisCommander.d.ts:3045 + live probe]. Pass the array, not `...spread`, so large E2 runs don't hit argument-count limits.
- `smembers` returns a JS array under RESP3 with the default "legacy" reply mapping [VERIFIED: live probe `smembers isArray true 5000`].
- Buyer-set members are lowercase hex, because `normalizeObjectId` lowercases every id at the edge [VERIFIED: backend/src/utils/object-id.ts:8-11 `return value.toLowerCase();`]. Compare against `String(objectId)` from `distinct`, which is also lowercase hex.
- CLI: copy `scripts/reset.ts` exactly (warning line optional, `loadBaseConfig`, `connectMongo`/`connectRedis` with one-line `fail`, `finally` closes both). Set `process.exitCode = 2` when drift remains, and keep `1` for errors.

### Anti-Patterns to Avoid
- **Reading `remainingQty` (or anything mode-specific) in the shared pre-check.** It slows V0's race window and adds a read to V1/V2. Only the cache's static fields are allowed.
- **`{ new: true }` / `returnOriginal`.** Mongoose 9.11.4 prints a deprecation warning on every call (query.js:4027-4041).
- **Reading `buy.lua` at module top level.** An ENOENT then becomes an uncaught import error with a stack, not one `[LỖI]` line.
- **Letting E11000 from `createOrder` reach `errorHandler`.** It would answer 409 `DUPLICATE` instead of `ALREADY_BOUGHT` (error.ts:37-39).
- **Writing `stock_movements` before the refund**, or letting its failure replace the original error.
- **`populate` in `/orders/me`.** It replaces `productId` with an object (see Alternatives).
- **Adding new required fields to `AppDeps`.** `test/helpers.ts` `startApp(deps: Partial<AppDeps>)` builds `AppDeps` from three fields (helpers.ts:92-98). Build services inside `createApiRouter` instead.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Atomic check-and-decrement | read-then-write with retries | `findOneAndUpdate` with `$gte` filter (V1) / Lua (V2) | Exactly the point of the experiment |
| Lua loading/caching | `SCRIPT LOAD` + `EVALSHA` bookkeeping | `redis.defineCommand` | Handles NOSCRIPT fallback (verified after `SCRIPT FLUSH`) |
| CLI parsing | manual `process.argv` scanning | `node:util` `parseArgs` via `cli-args.ts` | Strict mode already rejects unknown flags |
| ObjectId validation | regex per route | `normalizeObjectId` | Lowercases, so cache keys, buyer members and `onSaleReset` ids agree |
| Reset | a new reset in the admin route | `createSaleAdminService(...).resetSale` | Phase 1 D-09: CLI and route must be identical |
| Admin JWT in tests | hand-built tokens | `createAuthService({ jwtSecret }).signToken(id, "admin")` | Same HS256/7d settings as production (auth.service.ts:47-48) |

## Common Pitfalls

### Pitfall 1: E11000 mapped to `DUPLICATE` instead of `ALREADY_BOUGHT`
**What goes wrong:** `createOrder` throws E11000, nothing catches it in the service, and `errorHandler` answers `409 DUPLICATE`.
**How to avoid:** every handler catches around `createOrder` and checks `isDuplicateKeyError(e)` (`e instanceof mongoose.mongo.MongoServerError && e.code === 11000`).
**Warning signs:** a test for a repeat buyer gets `code: "DUPLICATE"`.

### Pitfall 2: Cache eviction race
**What goes wrong:** `invalidate(id)` runs while a load is in flight, a new request starts a fresh load, and then the **old** promise resolves `null`/rejects and deletes the **new** entry. Or the implementation sets the entry only after `await`, which breaks single-flight.
**How to avoid:** `entries.set` synchronously before awaiting, and evict only `if (entries.get(id) === p)`.

### Pitfall 3: `redis.flashBuy is not a function` in tests
**What goes wrong:** `startApp()` without a `redis` creates its own **unconnected** client and never registers the script (helpers.ts:93). V2 requests then return 500.
**How to avoid:** buy tests call `connectTestStores(name, db)` and then `registerBuyScript(redis)`, and pass `{ redis, cfg: testConfig({ isTestMode: true }) }` to `startApp`. Consider a helper parameter so the Lua test and buy tests can't forget it.

### Pitfall 4: `MGET` with zero keys
**What goes wrong:** `/sales/active` with no v2 sale (for example after `reset --mode v1`) calls `mget([])` → `ERR wrong number of arguments` → 500.
**How to avoid:** skip `MGET` when the key list is empty (verified failure above).

### Pitfall 5: Admin reset with a bad mode returns the wrong code
**What goes wrong:** `resetSale` throws `400 VALIDATION_ERROR` for a bad mode [VERIFIED: backend/src/services/sale-admin.service.ts:43-45 `throw new HttpError(400, "mode phải là v0, v1 hoặc v2", "VALIDATION_ERROR");`], but D-24 wants `INVALID_MODE`.
**How to avoid:** the route validates `mode` (`typeof === "string"` and in `SALE_MODES`) before calling the service, and also rejects a non-object body (`[]` passes `express.json`, verified live).

### Pitfall 6: Compensation masks the original error
**What goes wrong:** the refund or the `stock_movements` write throws inside `catch`, and that new error is what reaches the client and the log, or the refund is skipped.
**How to avoid:** order is refund (awaited) → movement (`.catch` + one `console.error`) → `throw e` with the **original** `e`. If the refund throws, log one line with `saleId`, `userId`, `mode` and rethrow the original `e`.

### Pitfall 7: Stale `mode` or wrong-store `remaining` during mixed-mode runs
**What goes wrong:** buying with `?mode=v0` on a `mode=v2` sale is allowed (D-03), but `GET /sales/:id` shows Redis stock that never moves.
**How to avoid:** this is by design. Tests that burst V0/V1 should reset with `{ mode }` first so `remaining` checks read the right store.

### Pitfall 8: V0 test flakiness / V1–V2 burst sizing
**Calibration (live this session, pool 10, in-process Express + `fetch`):** stock 10 / 100 users → 100 orders, `remainingQty -90` on 3/3 attempts. Stock 5 / 50 → 3/3. Stock 20 / 200 → 176–200 orders.
**Recommendation:** V0 burst with stock 10 and 100 distinct `x-test-user` ids, built as an array of promises and passed to `Promise.all`, up to 3 attempts per D-34. V1/V2 burst with stock 10–20 and 100 users, then assert exactly `totalQty` orders, `distinctUsers === orders` and `oversold === 0`.

### Pitfall 9: `cli-args.ts` only supports string options
**What goes wrong:** `--fix` is a boolean flag, but `OptionSpec` is string-only [VERIFIED: backend/scripts/cli-args.ts:31 `type OptionSpec = Record<string, { type: "string"; default?: string }>;`], and `parseStrict` maps every non-string value to `undefined` (cli-args.ts:42-44).
**How to avoid:** widen `OptionSpec` to allow `{ type: "boolean" }` and return `boolean` for those keys, or add a separate `parseReconcileArgs` that calls `parseArgs` directly with the same strict settings and `CliArgsError` wrapping. Add unit cases to `test/cli-args.test.ts`: `--fix`, `--fix=yes` (must be rejected), `--sale bad`, and an unknown flag.

### Pitfall 10: `spawnCli` type excludes `reconcile`
**What goes wrong:** the reconcile exit-code tests need the CLI as a child process, but `spawnCli(script: "seed" | "reset", …)` [VERIFIED: backend/test/helpers.ts:313-316].
**How to avoid:** widen the union to include `"reconcile"`. Run the exit-code tests (0 / 2 / `--fix` → 0 / bad args → 1) through `spawnCli` with `MONGODB_URI`/`REDIS_URL` pointed at the file's own test db. Test the service logic in-process per D-31.

### Pitfall 11: Parallel plans colliding on shared files
**What goes wrong:** with `use_worktrees: true`, several plans edit `routes/index.ts`, `http-error.ts`, `admin.routes.ts` or `test/helpers.ts` and conflict at merge time.
**How to avoid:** put all `ErrorCode` additions, `ioredis.d.ts`, `lua.ts` and helper edits in the first wave. Give `routes/index.ts` mounting to one plan per wave, or sequence the plans that touch it.

### Pitfall 12: D-10 "order exists" may be an older order
**What goes wrong:** for a repeat buyer whose insert fails with a non-E11000 error, `findOne` finds their **earlier** order. The handler answers 201 and skips the refund.
**Effect:** undersell by one unit, never oversell. This is consistent with D-10's "undersell rather than oversell". Mention it in the Phase 5 limitations, and don't try to fix it.

## Code Examples

### Integration test skeleton (Phase 1 conventions)
```typescript
// test/integration/buy.test.ts — Redis db 7, database flashsale_test_buy_<pid>
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { Types } from "mongoose";
import type { Redis } from "ioredis";
import { registerBuyScript } from "../../src/services/lua.js";
import { seedDatabase } from "../../src/services/seed.service.js";
import { connectTestStores, dropTestDatabaseAndDisconnect, startApp, testConfig, type StartedApp } from "../helpers.js";

describe("buy.test", () => {
  let redis: Redis; let app: StartedApp; let saleId: string;
  before(async () => {
    ({ redis } = await connectTestStores("buy", 7));
    registerBuyScript(redis);
    ({ saleId } = await seedDatabase({ redis, qty: 10, mode: "v1" }));
    app = await startApp({ redis, cfg: testConfig({ isTestMode: true }) });
  });
  after(async () => { await app.close(); await redis.flushdb(); await dropTestDatabaseAndDisconnect(redis); });

  const buy = (mode: string, userId = String(new Types.ObjectId()), body: unknown = { qty: 1 }) =>
    fetch(`${app.baseUrl}/api/sales/${saleId}/buy?mode=${mode}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-test-user": userId },
      body: JSON.stringify(body),
    });
  // ...
});
```
Helper signatures used above [VERIFIED: backend/test/helpers.ts:457-462 `connectTestStores(name: string, redisDb: number): Promise<{ redis: Redis }>`; :48 `testConfig(overrides: Partial<BaseConfig> = {})`; :92 `startApp(deps: Partial<AppDeps> = {})`; seed.service.ts:135 `seedDatabase({ redis, qty, mode, now = new Date() }: SeedOptions): Promise<SeedSummary>` with `saleId: string` at :112]. Note that `seedDatabase` hashes one bcrypt password and inserts 1,001 users. That is acceptable once per file. For files that don't need users, creating a `Product` + `FlashSale` directly (as reset.test.ts:63-73 does) is faster.

### Wiring in `createApiRouter` (keeps `AppDeps` unchanged)
```typescript
export function createApiRouter(deps: AppDeps): Router {
  const router = Router();
  const auth = createAuthMiddleware(deps);
  const saleCache = createSaleCache();
  const saleAdmin = createSaleAdminService({ redis: deps.redis, onSaleReset: saleCache.invalidate });
  const purchase = createPurchaseService({ redis: deps.redis, saleCache });
  router.get("/health", createHealthController(deps));
  router.use("/auth", createAuthRouter(deps));
  router.use("/products", createProductRouter());
  router.use("/sales", createSaleRouter({ auth, purchase, redis: deps.redis })); // /active trước /:id
  router.use("/orders", createOrderRouter(auth));
  router.use("/admin", createAdminRouter(auth, { saleAdmin, redis: deps.redis }));
  return router;
}
```
The current file mounts `router.use("/admin", createAdminRouter(auth));` [VERIFIED: backend/src/routes/index.ts:15]. `AppDeps` is `{ cfg: BaseConfig; jwtSecret: string; redis: Redis }` [VERIFIED: backend/src/app.ts:11-15]. `onSaleReset?: (saleId: string) => void` [VERIFIED: backend/src/services/sale-admin.service.ts:35].

### ErrorCode union after the edit
Current [VERIFIED: backend/src/utils/http-error.ts:5-15]: `"VALIDATION_ERROR" | "INVALID_ID" | "INVALID_JSON" | "DUPLICATE" | "EMAIL_TAKEN" | "UNAUTHORIZED" | "INVALID_CREDENTIALS" | "FORBIDDEN" | "NOT_FOUND" | "INTERNAL_ERROR"`. Append `"SOLD_OUT" | "ALREADY_BOUGHT" | "SALE_NOT_ACTIVE" | "STOCK_NOT_LOADED" | "INVALID_MODE"` (names from D-06).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `findOneAndUpdate(..., { new: true })` | `returnDocument: "after"` or no option | Mongoose 9.2 | Old option warns on every call |
| ioredis v5 RESP2 | ioredis 6 defaults to RESP3 (`protocol: 3`) | ioredis 6.0.0 | Lua integer replies are still JS numbers (verified). Set replies are still arrays under legacy mapping (verified) |
| Express 4 `req.query` (qs, extended) | Express 5 "simple" parser | Express 5.0 | `mode[$ne]` no longer becomes an object, but arrays still occur (verified) |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Constructing services inside `createApiRouter` instead of a literal module-level `Map` satisfies D-16's intent ("single instance per app" in code_context) | Pattern 1 | Low: behavior is the same; only test-isolation details differ |
| A2 | Reconcile with `--sale <unknown id>` should exit 1 (treated as a usage error) | Pattern 8 | Low: D-30 doesn't name this case; the Phase 3 harness only treats 0 as clean either way |
| A3 | `GET /sales/:id` for a v2 sale while Redis is down returns 500 (no fallback) | Pattern 5 | Low: read path only; Phase 4 shows a generic error |
| A4 | Proposed Redis db numbers 6–11 per test file are free (Phase 1 uses 1–5) | Structure | Low: verified Phase 1 uses 1, 2, 3, 4 (real) and 5 (a fake-server URL); no file uses 6+ [VERIFIED by grep, but allocation is a proposal] |

## Open Questions

1. **Should the reconcile CLI print the cache warning like `reset.ts`?**
   - What we know: `--fix` changes only Redis plus `stock_movements`. The sale cache holds static fields only, so reconcile never makes it stale.
   - Recommendation: don't print the cache warning. Print the "run only while no buys are in flight" note from D-30 instead.
2. **Where do stats live?**
   - D-25 allows the sale-admin service or a sibling. Recommendation: add `getStats` to `createSaleAdminService` so the admin router depends on one service.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | all | ✓ | 24.22.1 | — |
| TypeScript (`tsc`) | typecheck/build | ✓ | 7.0.2 | — |
| MongoDB container `flashsale-mongo` | integration tests, reconcile | ✓ | mongo:7.0, `127.0.0.1:27018` (healthy) | — |
| Redis container `flashsale-redis` | Lua smoke, V2, reconcile | ✓ | redis:7.4, `127.0.0.1:6379` (healthy) | — |
| Docker CLI | `docker exec … redis-cli` manual checks | ✓ | — | — |

**Missing dependencies with no fallback:** none.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `node:test` + `node:assert/strict`, TS via `--import tsx` (Node 24.22.1) |
| Config file | none. Scripts are in `backend/package.json:17-18` |
| Quick run command | `npm --prefix backend run typecheck && npm --prefix backend test` (unit, no Docker) |
| Single integration file | from `backend/`: `node --import tsx --test test/integration/buy.test.ts` (no build needed unless the file spawns `dist/server.js`) |
| Full suite command | `npm --prefix backend run build && npm --prefix backend test && npm --prefix backend run test:int` |

Scripts [VERIFIED: backend/package.json:17 `"test": "npm run build && node --import tsx --test \"test/*.test.ts\""`, :18 `"test:int": "npm run build && node --import tsx --test --test-concurrency=1 \"test/integration/*.test.ts\""`]. New `test/integration/*.test.ts` files are picked up by the glob automatically.

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BUY-09 | 4 codes; 1,000 parallel → 100, stock 0, SCARD 100 | integration | `node --import tsx --test test/integration/lua.test.ts` | ❌ Wave 0 |
| BUY-01, BUY-03 | D-06 table across v0/v1/v2 (bad mode/array, qty matrix, bad id, 404, not started/ended, 503 V2 key missing) | integration | `… test/integration/buy.test.ts` | ❌ |
| BUY-04 | V0 oversells within 3 attempts | integration | `… buy.test.ts` | ❌ |
| BUY-05, BUY-06 | V1/V2 bursts = exactly `totalQty`; V2 leaves `remainingQty` | integration | `… buy.test.ts` | ❌ |
| BUY-02 | cache: 404 not cached (seed new sale → 201), reset over HTTP clears window | integration | `… buy.test.ts` / `admin.test.ts` | ❌ |
| BUY-07, BUY-08 | compensation matrix via `createOrder` seam; no movement on success; `qty:-5` never increases stock | integration | `… compensation.test.ts` | ❌ |
| READ-01..04 | shapes (D-20), `remaining`/`stockLoaded` (D-21), active filter (D-22), orders newest first | integration | `… read.test.ts` | ❌ |
| ADMIN-01, ADMIN-02 | reset `{mode}`, `INVALID_MODE`, 401/403 guard, stats fields | integration | `… admin.test.ts` | ❌ |
| ADMIN-03 | service in-process + CLI exit codes 0/2/1, `--fix` | integration + unit | `… reconcile.test.ts`; `npm --prefix backend test` (cli-args) | ❌ / ✅ (extend) |
| (all) | typecheck + build | static | `npm --prefix backend run typecheck && npm --prefix backend run build` | ✅ |

### Sampling Rate
- **Per task commit:** `npm --prefix backend run typecheck && npm --prefix backend test`, plus the single integration file the task touched.
- **Per wave merge:** full suite.
- **Phase gate:** full suite green, plus one manual smoke: `npm run build && npm run start:test`, then a buy in each mode with `x-test-user` (to catch CJS named-import or `dist/lua` problems that `tsc` misses).

### Wave 0 Gaps
- [ ] `test/integration/lua.test.ts` — BUY-09 (can land with `lua.ts` itself)
- [ ] `test/helpers.ts` — `spawnCli` union += `"reconcile"`; optional `registerBuyScript` convenience
- [ ] `test/cli-args.test.ts` — `parseReconcileArgs` cases
- Framework install: none.

## Security Domain

### Applicable ASVS Categories (level 1)

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (reuse) | Phase 1 `requireAuth` (HS256 pinned, no DB read); `x-test-user` only when `cfg.isTestMode` |
| V3 Session Management | no | Stateless JWT (Phase 1) |
| V4 Access Control | yes | `/admin/*` guard via `router.use(requireAuth, requireAdmin)` before every route (admin.routes.ts:11); `/orders/me` filters only by `req.user.id` (no client-supplied user id → no IDOR) |
| V5 Input Validation | yes | `mode` string allow-list; `qty === 1` strict; ids via `normalizeObjectId`; body must be a non-array object; only `qty`/`mode` read (no mass assignment) |
| V6 Cryptography | no | none new |
| V7 Error Handling & Logging | yes | 500 returns generic message (error.ts:53-54); failure-path `console.error` lines carry ids only, never tokens/secrets |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| NoSQL operator injection via query/body (`mode[$ne]`, `{qty:{$gt:0}}`) | Tampering | Express 5 simple parser (verified `mode[$ne]` → undefined); strict `=== 1`; ids regex-validated |
| Negative quantity inflating stock (`qty:-5`) | Tampering | `qty === 1` before any store call; test in all modes (D-35) |
| Privilege escalation via `x-test-user` | Elevation | Identity always `role: "user"`; only in exact test mode (auth.ts:29-37) |
| Overselling through compensation on ambiguous writes | Tampering/Integrity | D-10 lookup before refund; no refund when lookup fails (undersell) |
| Resource exhaustion via large lists | DoS | `/orders/me` capped at 100; products unpaginated but fixed at 6 |
| Reconcile run during live traffic corrupts Redis | Integrity | Help text warning (D-30); CLI only, never automatic |

## Sources

### Primary (HIGH confidence)
- Live probes this session (scratchpad, junction to `backend/node_modules`): TS 7.0.2 typecheck of the `RedisCommander` augmentation (positive and negative); ioredis 6.0.0 + redis:7.4 Lua codes, 1,000-call burst, `SCRIPT FLUSH` fallback, `mget([])` error, `multi/sadd(array)/smembers/scard/get` reply shapes; Mongoose 9.11.4 + mongo:7.0 E11000 class/code, `findOneAndUpdate` lean projection, no warning, `distinct`; Express 5.3.0 query/body behavior and `/active` vs `/:id` routing; in-process V0 oversell calibration.
- Package source read: `mongoose/lib/query.js:4026-4049`, `ioredis/built/utils/Commander.js:46-51`, `ioredis/built/index.d.ts`, `ioredis/built/utils/RedisCommander.d.ts`, `ioredis/built/Redis.d.ts`.
- Repo files read this session: all of `backend/src/**`, `backend/scripts/{cli-args,reset}.ts`, `backend/test/helpers.ts`, `backend/test/integration/reset.test.ts`, `backend/package.json`, `docs/SPECS.md` §6–8/§13, `.planning/research/{ARCHITECTURE,PITFALLS}.md`, `02-CONTEXT.md`, `REQUIREMENTS.md`, `STATE.md`, `PROJECT.md`.

### Secondary / Tertiary
- None needed. No web sources were relied on.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH, all installed and version-checked
- Architecture: HIGH, locked by CONTEXT; wiring verified against existing signatures
- Pitfalls: HIGH, each risky mechanism reproduced live

**Research date:** 2026-11-08
**Valid until:** 2026-12-08 (stack pinned; code freeze 2026-12-06)
