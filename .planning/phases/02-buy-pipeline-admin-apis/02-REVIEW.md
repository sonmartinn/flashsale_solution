---
phase: 02-buy-pipeline-admin-apis
reviewed: 2026-11-08T13:06:30Z
depth: standard
files_reviewed: 32
files_reviewed_list:
  - backend/package.json
  - backend/scripts/cli-args.ts
  - backend/scripts/reconcile.ts
  - backend/src/controllers/admin.controller.ts
  - backend/src/controllers/order.controller.ts
  - backend/src/controllers/product.controller.ts
  - backend/src/controllers/sale.controller.ts
  - backend/src/routes/admin.routes.ts
  - backend/src/routes/index.ts
  - backend/src/routes/order.routes.ts
  - backend/src/routes/product.routes.ts
  - backend/src/routes/sale.routes.ts
  - backend/src/server.ts
  - backend/src/services/catalog.service.ts
  - backend/src/services/lua.ts
  - backend/src/services/order.service.ts
  - backend/src/services/purchase.service.ts
  - backend/src/services/reconcile.service.ts
  - backend/src/services/sale-admin.service.ts
  - backend/src/services/sale-cache.ts
  - backend/src/services/stock.service.ts
  - backend/src/types/ioredis.d.ts
  - backend/src/utils/dto.ts
  - backend/src/utils/http-error.ts
  - backend/test/cli-args.test.ts
  - backend/test/helpers.ts
  - backend/test/integration/admin.test.ts
  - backend/test/integration/buy.test.ts
  - backend/test/integration/compensation.test.ts
  - backend/test/integration/lua.test.ts
  - backend/test/integration/read.test.ts
  - backend/test/integration/reconcile.test.ts
findings:
  critical: 0
  warning: 5
  info: 6
  total: 11
  necessity: 1
status: issues_found
---

# Phase 2: Code Review Report

**Reviewed:** 2026-11-08T13:06:30Z
**Depth:** standard
**Files Reviewed:** 32
**Status:** issues_found

## Summary

I reviewed the Phase 2 buy pipeline (V0/V1/V2, the shared sale cache, compensation), the admin reset/stats routes, the reconcile CLI and service, the read APIs, and the new tests. I also read the collaborators they call: `middlewares/auth.ts`, `middlewares/error.ts`, `config/redis.ts`, `config/db.ts`, `models/*`, `lua/buy.lua`, and the `ioredis` 6 reconnect code in `node_modules/ioredis/built/redis/event_handler.js`.

The main paths hold up:
- The atomic step is correct in both V1 (`findOneAndUpdate` with `remainingQty: { $gte }` + `$inc`) and V2 (Lua script that runs `SISMEMBER`, then `GET`, then `DECRBY` + `SADD`).
- Every input on the buy, admin and read paths is validated as a string or whitelisted: the `ObjectId` regex, the `SALE_MODES` lookup, and `qty === 1`.
- The admin guard is applied with `router.use` ahead of every `/api/admin/*` route.
- The buy success path writes no log.

No blocker was found. The remaining risks sit on the edges of the "V1/V2 never oversell" guarantee:
- Compensation treats "no order found" as proof that the write did not happen.
- Refunds in Redis are not idempotent under ioredis's automatic resend.
- Neither reset nor refunds are fenced against requests still in flight.
- `?mode=` lets any logged-in user pick a different stock store than the sale uses.

I also found an error-mapping mismatch that turns some internal write failures into 4xx responses. Phase 3 counts only 5xx as errors, so those failures would disappear from the error rate.

## Warnings

### WR-01: D-10 compensation can oversell on an ambiguous write, and can return another request's order

**File:** `backend/src/services/purchase.service.ts:169-185` (`defaultFindOrder` at line 52)
**Issue:** On any order-insert error other than E11000, `compensate` runs `findOne({ saleId, userId })`. If that returns `null`, it refunds stock (and for V2 removes the buyer). An empty lookup does not prove the insert failed. A `MongoNetworkError` or socket reset that arrives *after* the insert reached `mongod` leaves the insert running or committed on the server. The lookup goes out on a different pooled connection, so it can run before the insert commits. The refund then hands the unit to another user, and that is `totalQty + 1` orders: an oversell. Retryable writes do not cover this, because the deployment is a standalone `mongod`, which does not support them.

The opposite case also exists. In V1, two concurrent requests from the same user both decrement stock. If request B fails with a non-E11000 error, its lookup finds request A's order, so B returns 201 with A's order and never refunds its own decrement. That leaks one unit of stock (an undersell), which is exactly what E3 checks ("tồn kho không bị rò rỉ").

The comment at line 151 ("Khi không chắc chắn thì chọn bán thiếu, không bao giờ bán quá") does not hold for the first case.
**Fix:** Refund only when the error proves no write happened. Treat everything else as ambiguous and do not refund:
```ts
import mongoose from "mongoose";
function isDefinitelyNotWritten(e: unknown): boolean {
  const m = mongoose.mongo;
  // Fails before the command is sent, or the server explicitly rejected the write
  return (
    e instanceof mongoose.Error.ValidationError ||
    e instanceof m.MongoServerSelectionError ||
    e instanceof m.MongoWaitQueueTimeoutError ||
    (e instanceof m.MongoServerError && e.code !== 11000)
  );
}
// in compensate, for non-E11000 errors:
if (!isDefinitelyNotWritten(err)) {
  const existing = await findOrder(...).catch(() => null);
  if (existing !== null) return { kind: "ok", order: toOrderDto(existing) };
  throw err; // ambiguous: do not refund (undersell)
}
```
Also record this limit in the Phase 5 docs. Replacing the D-10 wording "nếu không có đơn thì hoàn kho" (refund when no order exists) is a scope decision, so confirm it with the user first.

### WR-02: Redis refund is not idempotent; ioredis automatically resends unanswered commands, which can apply INCRBY twice

**File:** `backend/src/services/purchase.service.ts:108-110` (also `lua.ts:25`; client options in `backend/src/config/redis.ts:14-18`)
**Issue:** `createRedis` keeps ioredis's default `autoResendUnfulfilledCommands: true`. In `node_modules/ioredis/built/redis/event_handler.js:313-314` and `415-421`, commands that were sent but not answered when the connection closed are copied to `prevCommandQueue` and **sent again** after reconnecting. With `maxRetriesPerRequest: 1`, the queue is flushed only when `retryAttempts % 2 === 0`, so a reconnect that succeeds on the first attempt resends the commands.

Two consequences:
- **Refund double-applied:** the bare `redis.incrby(stockKey, qty)` in the V2 E11000 branch can run twice. Stock ends at `+2` instead of `+1`, which allows one extra sale (an oversell).
- **Buy replayed:** `flashBuy` (EVALSHA) can also be resent. The first run decremented stock and added the buyer. The resend sees `SISMEMBER == 1` and returns `-1`, so the user gets `ALREADY_BOUGHT` with no order, stays locked out, and one unit is leaked.
**Fix:** Turn off automatic resend for this client. A failed command should surface as an error, never be replayed:
```ts
new Redis(url, { connectTimeout: 5000, maxRetriesPerRequest: 1, lazyConnect: true, autoResendUnfulfilledCommands: false });
```
If the resend behaviour has to stay, put the V2 refund in a Lua script that is safe to run twice. For example, only `INCRBY` when the `SREM` of a per-request marker returns 1.

### WR-03: Reset and refunds are not fenced against in-flight buys, so a reset can start the next run already oversold

**File:** `backend/src/services/sale-admin.service.ts:81-108`; `backend/src/services/purchase.service.ts:104-118`
**Issue:** `resetSale` runs these steps one after another, with no lock and no epoch: `$set remainingQty`, then `Order.deleteMany`, then `MULTI SET stock / DEL buyers`, then invalidate the cache. Three races follow:
- A V2 request whose Lua script ran before the reset but whose `Order.create` lands after `deleteMany` leaves an order that the fresh Redis state (`stock = totalQty`, buyers empty) does not account for.
- A V1 or V2 refund (`$inc remainingQty` / `INCRBY`) that lands after the reset's `$set`/`SET` raises fresh stock to `totalQty + 1`.
- A V1 decrement that lands after the `$set` lowers it.

In the next run, `stats.oversold` or the `orders` count for V1/V2 is off. That contaminates E1/E2, which are the proof of the project's core value. E2 uses autocannon, which abandons slow requests on the client side at its timeout while the server keeps processing them. So "the harness finished" does not mean "the server is idle".
**Fix:** Pick at least one:
- (a) Keep an in-flight counter per sale in the purchase service, and have `resetSale` (via a new dep) return 409 while it is non-zero.
- (b) Have the Phase 3 harness wait for the server to go idle after each run, then reset, then require `stats.orders === 0 && stats.redisInSync !== false && mongoRemaining === totalQty` and a clean `npm run reconcile` before measuring.
- (c) At minimum, print the same "chỉ chạy khi không có lượt mua" warning that `reconcile` prints, and document it on the reset route.

### WR-04: `?mode=` lets any authenticated user bypass the sale's stock store and oversell a V1/V2 sale

**File:** `backend/src/controllers/sale.controller.ts:56-58`, `backend/src/services/purchase.service.ts:236`
**Issue:** The buy handler is chosen only from the query string. The sale's own `mode` is never compared. Example: on a V2 sale with `totalQty = 10`, ten buys with `?mode=v2` and then ten with `?mode=v1` (Mongo `remainingQty` is untouched by V2) produce 20 orders. `?mode=v0` also works. This needs no test mode, only a normal JWT, so any student or grader in the demo can break the "V2 never oversells" claim from the browser devtools. D-03 accepts this as a documented risk, but the guarantee in CLAUDE.md is stated without that exception.
**Fix:** Reject a mismatch with `cfg.isTestMode === false`. The UI always sends `sale.mode`, and the load scripts run in test mode:
```ts
if (!deps.isTestMode && mode !== sale.mode) throw new HttpError(400, "Chế độ mua không khớp với đợt sale", "INVALID_MODE");
```
This needs `mode` in a cache that only reset invalidates, or one extra projection. Alternatively, record in the report that the guarantee holds only when every buy uses the sale's mode.

### WR-05: Rethrowing the original insert error can produce a 4xx, so internal write failures leave the error-rate metric

**File:** `backend/src/services/purchase.service.ts:81, 175, 185`; mapping in `backend/src/middlewares/error.ts:29-36`
**Issue:** D-10 and the comments say the non-E11000 branch "ném lại lỗi gốc (500)" (rethrows the original error as a 500). `errorHandler` maps `mongoose.Error.ValidationError` to **400 VALIDATION_ERROR** and `CastError` to **400 INVALID_ID**. If `Order.create` fails validation because of a cache or data defect (for example a bad `productId`/`salePrice` in `flash_sales`), the client gets "Dữ liệu không hợp lệ" (400) for a server fault. The same happens on V0 (`insertOrder`, line 81). Under CLAUDE.md, Phase 3 counts only 5xx and connection errors in the error rate, so these failures (each of which leaks or refunds stock) would not show up in E2. The D-12 amendment already fixed the same problem for the refund branch by wrapping the error in `new Error(..., { cause })`.
**Fix:** Wrap the original error before rethrowing on every compensation and V0 path:
```ts
throw new Error("Ghi đơn thất bại", { cause: err });
```
Keep `isDuplicateKeyError` checks on the original `err`.

## Info

### IN-01: Generality without instantiation: `SaleCache.invalidate()` with no argument

**File:** `backend/src/services/sale-cache.ts:19-20, 68-71`
**Category:** necessity
**Issue:** The only production caller is `onSaleReset: saleCache.invalidate` (`routes/index.ts:24`). `sale-admin.service.ts:108` always passes a `saleId`. The "clear everything" branch is used only by `buy.test.ts:397`. No production path ever invalidates the whole cache, and `resetAllSales` resets one sale at a time.
**Fix:** Make `saleId` required and drop the `entries.clear()` branch, or leave a comment explaining what it is kept for.

### IN-02: `createApp` builds a V2 buy path that depends on a script registration it does not do

**File:** `backend/src/routes/index.ts:22`, `backend/src/server.ts:59-60`, `backend/src/types/ioredis.d.ts:9`
**Issue:** `redis.flashBuy` exists only after `registerBuyScript(redis)` has been called on that exact client. The type augmentation makes it look always present. Any `createApp` consumer that forgets the call gets `TypeError: redis.flashBuy is not a function`, which surfaces as a 500 on every V2 buy. That includes the `startApp` test helper, so each test file has to remember the call.
**Fix:** Call `registerBuyScript(deps.redis)` inside `createApiRouter`/`createPurchaseService`. `defineCommand` is idempotent, so calling it there is safe. Keep the early startup read in `server.ts` for the one-line `[LỖI]` message.

### IN-03: Shared `HttpError` singletons are thrown for SOLD_OUT, ALREADY_BOUGHT and STOCK_NOT_LOADED

**File:** `backend/src/controllers/sale.controller.ts:12-16, 74`
**Issue:** The same three `Error` instances are thrown for every request. Their `stack` points at module load, not the request. Any future middleware that annotates `err` (adding a request id, for example) would leak that field across requests.
**Fix:** Store factories (`() => new HttpError(...)`) in the table, or freeze the instances.

### IN-04: The V1 refund ignores `matchedCount` but still logs a compensation row

**File:** `backend/src/services/purchase.service.ts:104-106, 166, 184`
**Issue:** If the sale document is gone, `FlashSale.updateOne(... $inc ...)` matches nothing. `recordCompensation` still writes a `compensate_v1` row with `delta: +qty`, so the audit log says stock was refunded when it was not.
**Fix:** Check `(await FlashSale.updateOne(...)).matchedCount === 1`, and throw (going through `refundFailure`) when it is not.

### IN-05: `perUserLimit` is exposed but never enforced

**File:** `backend/src/utils/dto.ts:96, 131`
**Issue:** `SaleDto.perUserLimit` is returned to the UI. The buy path always enforces exactly one order per user through the unique `(saleId, userId)` index and the Lua `SISMEMBER` check. A sale stored with `perUserLimit: 2` would advertise a limit the API never applies. Today every writer sets 1 (`seed.service.ts:174` and the schema default), so the issue is latent.
**Fix:** Drop the field from the DTO, or add a comment or assertion that it must be 1.

### IN-06: Admin reset silently ignores a non-JSON body

**File:** `backend/src/controllers/admin.controller.ts:47`
**Issue:** `req.body ?? {}` turns any body without a JSON content type (for example form-encoded `mode=v1`) into `{}`. The sale is reset with its *current* mode and the API returns 200, so a harness that sent the wrong content type believes the mode changed.
**Fix:** When `req.headers["content-length"]` is non-zero or `transfer-encoding` is set, and `req.body === undefined`, return 400 `VALIDATION_ERROR`. Alternatively, make sure the Phase 3 harness checks `sale.mode` in the response.

---

_Reviewed: 2026-11-08T13:06:30Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
