---
phase: 01-foundation-infra-data-auth
reviewed: 2026-11-04T12:47:14Z
depth: standard
files_reviewed: 50
files_reviewed_list:
  - backend/package.json
  - backend/scripts/cli-args.ts
  - backend/scripts/reset.ts
  - backend/scripts/seed.ts
  - backend/src/app.ts
  - backend/src/config/db.ts
  - backend/src/config/env.ts
  - backend/src/config/redis.ts
  - backend/src/controllers/auth.controller.ts
  - backend/src/controllers/health.controller.ts
  - backend/src/lua/buy.lua
  - backend/src/middlewares/auth.ts
  - backend/src/middlewares/error.ts
  - backend/src/models/flash-sale.ts
  - backend/src/models/index.ts
  - backend/src/models/order.ts
  - backend/src/models/product.ts
  - backend/src/models/stock-movement.ts
  - backend/src/models/user.ts
  - backend/src/routes/admin.routes.ts
  - backend/src/routes/auth.routes.ts
  - backend/src/routes/index.ts
  - backend/src/server.ts
  - backend/src/services/auth.service.ts
  - backend/src/services/sale-admin.service.ts
  - backend/src/services/seed.service.ts
  - backend/src/types/express.d.ts
  - backend/src/utils/fail.ts
  - backend/src/utils/http-error.ts
  - backend/src/utils/object-id.ts
  - backend/src/utils/port.ts
  - backend/src/utils/validate.ts
  - backend/src/utils/with-timeout.ts
  - backend/test/auth.test.ts
  - backend/test/boot.test.ts
  - backend/test/build.test.ts
  - backend/test/cli-args.test.ts
  - backend/test/config.test.ts
  - backend/test/errors.test.ts
  - backend/test/helpers.ts
  - backend/test/integration/auth.test.ts
  - backend/test/integration/health.test.ts
  - backend/test/integration/models.test.ts
  - backend/test/integration/reset.test.ts
  - backend/test/integration/seed.test.ts
  - backend/test/object-id.test.ts
  - backend/test/validate.test.ts
  - backend/tsconfig.build.json
  - backend/tsconfig.json
  - docker-compose.yml
findings:
  critical: 0
  warning: 3
  info: 10
  total: 13
  necessity: 3
status: issues_found
---

# Phase 1: Code Review Report

**Reviewed:** 2026-11-04T12:47:14Z
**Depth:** standard
**Files Reviewed:** 50
**Status:** issues_found

## Summary

I reviewed the Phase 1 backend foundation: config and env loading, the MongoDB/Redis connectors, the startup sequence, auth (register, login, JWT, test-mode header), the error contract, the five models, the seed and reset services and their CLIs, the Lua script, docker-compose, and the unit and integration tests. `tsc --noEmit` passes. I used `docs/SPECS.md` §6–§8, `.claude/CLAUDE.md`, and `01-CONTEXT.md` (D-01..D-13) as the reference for intended behaviour. I also read `cicd-review-patterns.md` and `necessity-review.md`.

Overall the implementation is careful:
- Inputs are string-typed, which blocks NoSQL operator injection.
- The JWT algorithm is pinned to HS256, and `sub`/`role` are validated.
- `role` is never taken from the client.
- The 27017 guard works, `multi()` results are checked pair by pair, and indexes are created explicitly before `listen`.
- `buy.lua` matches the spec text exactly.

I found no BLOCKER. The issues that matter:

1. The shared reset service runs non-atomic steps in an order that can leave V2 with more orders than `totalQty` if any buy is still in flight. A Redis failure part-way through leaves MongoDB and Redis inconsistent. Reset is the tool every E1/E2 run depends on (WR-01).
2. The test-mode auth bypass (`x-test-user`) is reachable from the network, because the server binds all interfaces. `/api/health` also tells any caller that test mode is on (WR-02).
3. The test helpers claim per-file and per-worktree isolation. That holds for MongoDB but not for Redis: fixed db numbers are shared and `FLUSHDB` is run on them (WR-03).

docker-compose.yml: none of the CI/CD checks apply. There are no workflows and no deploy steps, images are pinned to minor tags, both ports bind to 127.0.0.1, and both services have healthchecks.

## Narrative Findings (AI reviewer)

## Warnings

### WR-01: Reset can leave MongoDB and Redis out of sync, letting V2 exceed `totalQty` when a buy is in flight or Redis fails part-way

**File:** `backend/src/services/sale-admin.service.ts:56-81`
**Issue:** `resetSale` runs five separate writes in this order:
1. `updateOne` reopens the sale (`status: "active"`, `remainingQty = totalQty`).
2. `Order.deleteMany`.
3. `StockMovement.deleteMany`.
4. Redis `SET stock` + `DEL buyers`.
5. Insert the `reset` movement.

The sale is already marked `active` at step 1, and the Redis reset (step 4) only happens after the orders are deleted. This causes two problems:

- **Race with in-flight buys.** This affects the Phase 2 admin route, which shares this function (D-09), and also a CLI reset run while the server is up. Suppose a V2 request runs its Lua script between step 2 and step 4. The script decrements the *old* `stock:<id>` and adds the user to the *old* `buyers:<id>`, and then the order is inserted. Step 4 then sets stock back to `totalQty` and deletes `buyers`. The new run therefore starts with full Redis stock *plus* a surviving order, so up to `totalQty + inFlight` orders can succeed, and the reconciliation check (§8) fails. For V1, an order inserted between steps 1 and 2 is deleted while its `$inc: -1` on `remainingQty` stays, so stock leaks by one. Stragglers from autocannon (E2) or from timed-out requests are a realistic source of in-flight buys. The Core Value ("V1/V2 never oversell, proven by repeated E1 runs") relies on reset producing a clean state.
- **Partial failure.** If the Redis `multi()` fails (as the test at `reset.test.ts:157` exercises), MongoDB has already been reset, the sale is already `active`, and the audit log in `stock_movements` has been wiped without a `reset` row. Meanwhile Redis still holds the previous run's stock and buyers. The function rejects, but the sale stays open in a mixed state.

**Fix:** Close the sale first, reset Redis before deleting the orders, and reopen only as the very last write:
```ts
// 1. đóng đợt sale để mọi request mới nhận "đã kết thúc" (400)
await FlashSale.updateOne({ _id: saleId }, { $set: { status: "ended" } });
// 2. Redis trước, kiểm tra từng [err, res]
const results = await redis.multi().set(stockKey(saleId), String(totalQty)).del(buyersKey(saleId)).exec();
/* ...kiểm tra lỗi như hiện tại... */
// 3. xóa dữ liệu của lần chạy trước
await Order.deleteMany({ saleId });
await StockMovement.deleteMany({ saleId });
await StockMovement.create({ saleId, orderId: null, delta: totalQty, reason: "reset", at: now });
// 4. mở lại cuối cùng
await FlashSale.updateOne({ _id: saleId }, { $set: { remainingQty: totalQty, status: "active", startAt: now, endAt, ...modeSet } });
```
Even with this order, a request that passed the `active` check just before step 1 can still slip through. Also state in the JSDoc and in the load-script docs that reset must only be called after every request of the previous run has finished.

### WR-02: Test-mode auth bypass is reachable from the whole network, and `/api/health` advertises it

**File:** `backend/src/server.ts:62`, `backend/src/middlewares/auth.ts:29-37`, `backend/src/controllers/health.controller.ts:15-20`
**Issue:** `listen(cfg.port)` is called with no host, so Node binds `::` dual-stack on all interfaces, including the LAN or Wi-Fi interface. Under `npm run start:test` (`isTestMode`), anyone who can reach the port can act as any user just by sending `x-test-user: <any 24-hex>`, without credentials. They can place orders and skew E1/E2 numbers during a measurement on a campus or shared network. The project treats exactly this exposure as a constraint for compose ("Compose chỉ bind 127.0.0.1 vì không có mật khẩu"), and test mode is effectively a server without passwords. On top of that, the public, unauthenticated `/api/health` returns `nodeEnv` and `maxPoolSize`. The spec defines the body as `{ mongo, redis }`, so this extra output tells any caller that the bypass is active.

The no-host listen comes from the stack guidance (so `localhost` resolves on both `::1` and `127.0.0.1`), so the fix needs to keep that property.
**Fix:** In test mode, bind loopback only, and do not reveal the mode to anonymous callers:
```ts
// server.ts
const app = createApp({ cfg, jwtSecret, redis });
if (cfg.isTestMode) {
  // chỉ máy cục bộ: header x-test-user thay cho đăng nhập
  app.listen(cfg.port, "127.0.0.1", onListen);
} else {
  app.listen(cfg.port, onListen);
}
```
Point the load scripts at `127.0.0.1` explicitly. For health, either drop `nodeEnv`/`maxPoolSize` from the public body or return them only when the request comes from loopback (`req.socket.remoteAddress`).

### WR-03: Test isolation claim is false for Redis — fixed db numbers are shared across files and across parallel worktrees, and are `FLUSHDB`ed

**File:** `backend/test/helpers.ts:7-9,32-44`, `backend/test/integration/seed.test.ts:36,46`, `backend/test/integration/reset.test.ts:57,79`, `backend/test/integration/models.test.ts:146,176`, `backend/test/integration/health.test.ts:32,82`
**Issue:** The helper header says each integration file "giữ một chỉ số db từ 1 đến 15", and `testMongoUri` adds `process.pid` so that "các worktree song song không đụng nhau". Redis gets neither guarantee:
- `testRedisUrl(db)` uses fixed numbers.
- `models.test` (spawned servers) and `seed.test` both use db 2. `health.test` and the default `startApp()` both use db 1.
- `seed.test` and `reset.test` run `seedDatabase`, which calls `redis.flushdb()` (`seed.service.ts:141`), and both run `redis.flushdb()` again in `after()`.

`--test-concurrency=1` only serialises files within a single run. If two worktrees run `npm run test:int` at the same time (the GSD workflow uses parallel executor worktrees; see the recent `merge executor worktree` commits), one run's `FLUSHDB` on db 2 or db 3 wipes `stock:<id>` and `buyers:<id>` mid-test in the other. The result is intermittent failures, for example `redis.get(stockKey(...))` returning `null` in `reset.test.ts:109`.
**Fix:** Give each file its own db number and document the allocation in one table in `helpers.ts`. To make parallel runs safe as well, either namespace the keys per pid (which needs a key-prefix seam in `stockKey`/`buyersKey`) or take a cross-process lock before integration tests run, for example a `SET test-lock:<db> <pid> NX EX 300` in `connectTestStores` that fails fast with a clear message. At a minimum, correct the comment so it does not claim isolation that does not exist.

## Info

### IN-01: Test-mode switch trims `NODE_ENV` before comparing, despite the spec's "exact comparison"

**File:** `backend/src/config/env.ts:88-92,121-123`
**Issue:** `optionalVar` trims, so `NODE_ENV="test "` or `" test"` turns on the `x-test-user` bypass. SPECS §7 requires `NODE_ENV === "test"` "so sánh chính xác" for this switch. The risk is low, but this is the one flag that disables authentication.
**Fix:** Read the raw value for this check, e.g. `const isTestMode = env["NODE_ENV"] === "test";`, and keep the trimmed value only for display.

### IN-02: Unguarded `await mongoose.disconnect()` in startup failure paths

**File:** `backend/src/server.ts:43,52`
**Issue:** If `disconnect()` rejects, the top-level await throws. The process then dies with a raw stack trace instead of the Vietnamese `[LỖI] ...` line that D-18/D-19 promise. The CLIs already use `.catch(() => {})` for the same call (`seed.ts:36`, `reset.ts:39`).
**Fix:** `await mongoose.disconnect().catch(() => {});`

### IN-03: `Authorization` scheme match is case-sensitive

**File:** `backend/src/middlewares/auth.ts:12`
**Issue:** `/^Bearer (...)$/` rejects `bearer <token>` as "Bạn chưa đăng nhập". The auth scheme is case-insensitive per RFC 7235 §2.1, and some clients and tools send it in lowercase.
**Fix:** `const BEARER_RE = /^Bearer ([^\s]+)$/i;`

### IN-04: No maximum length on email

**File:** `backend/src/utils/validate.ts:49,55`
**Issue:** `name` is capped at 100 characters, but `email` is only regex-checked. A register body can store an email of up to about 100 kB (the `express.json` limit), and it ends up in the unique index.
**Fix:** Add `if (email.length > 254) throw invalid("Email không hợp lệ");`.

### IN-05: `parseRedisUrl` accepts db indexes outside 0–15

**File:** `backend/src/config/env.ts:72-76`
**Issue:** `redis://127.0.0.1:6379/99` passes config validation. The failure then shows up later as a `SELECT` error at connect time, and gets reported as the misleading "Không kết nối được Redis ... Chạy docker compose up".
**Fix:** Reject `db > 15` with a `ConfigError` (the default Redis has 16 databases).

### IN-06: Duplicated constants and CLI bootstrap

**File:** `backend/src/services/seed.service.ts:18-19`, `backend/src/services/sale-admin.service.ts:9`, `backend/src/services/auth.service.ts:26-27`, `backend/src/utils/validate.ts:22`, `backend/scripts/seed.ts:21-47`, `backend/scripts/reset.ts:26-50`
**Issue:** These constants are each defined twice:
- `SALE_DURATION_MS`: seed and reset. The two must stay equal for the 7-day rule.
- `BCRYPT_COST`: seed and auth.
- `PASSWORD_MAX_BYTES`: auth service and validate.

The config, MongoDB and Redis connect-or-fail block is also copied verbatim between the two CLIs. If one copy is edited and the other is not, they drift silently.
**Fix:** Export each constant once (for example from `models/flash-sale.ts`, `services/auth.service.ts`, `utils/validate.ts`), and move the CLI bootstrap into a shared `scripts/connect-stores.ts`.

### IN-07: `npm run reset` (all sales) does not report sales already reset when a later one fails

**File:** `backend/scripts/reset.ts:55-66`
**Issue:** `resetAllSales` stops at the first failing sale and throws. Results are only printed after the whole call succeeds, so the operator sees only `[LỖI] ...`. Sales that were already reset are not listed, and the failed sale may be in the half-reset state described in WR-01.
**Fix:** Loop over sales in the CLI, or have `resetAllSales` return partial results along with the error, and print each `Đã reset ...` line as it completes.

### IN-08: Generality without instantiation — `signToken` exposed on `AuthService` with no consumer

**File:** `backend/src/services/auth.service.ts:23,85`
**Category:** necessity
**Issue:** `signToken` is part of the public `AuthService` interface. A grep over `src/`, `scripts/` and `test/` finds only the internal use at line 52. Tests sign tokens with `jwt.sign` directly (`test/auth.test.ts:22-24`). Phase 2 might use it, so this rests on judgment.
**Fix:** Drop it from the interface and the returned object until there is a caller.

### IN-09: Already-defended-elsewhere — `qty` validation in `seedDatabase` duplicates (and disagrees with) the CLI parser

**File:** `backend/src/services/seed.service.ts:136`
**Category:** necessity
**Issue:** The only production caller (`scripts/seed.ts:51`) passes `args.qty` from `parseQty` (`scripts/cli-args.ts:51-55`). That parser already enforces `^[1-9][0-9]*$` and `<= 1_000_000`. The test callers pass literals (5 and 7). The service check repeats the positive-integer rule without the upper bound, so the two layers disagree on what a valid `qty` is.
**Fix:** Either remove the service check, or make it the single source of truth (with `MAX_QTY`) and have `parseQty` call it.

### IN-10: Impossible-state guard — non-integer sale price check on a compile-time constant

**File:** `backend/src/services/seed.service.ts:161-164`
**Category:** necessity
**Issue:** `sneaker.price` always comes from the module constant `SEED_PRODUCTS` (`price: 899_000`, line 78), so `price / 2` is always `449500`. `seed.test.ts:108` already asserts the exact value. The guard only protects against a future edit of the constant, which the test would catch. This is judgment, because someone could edit the constant.
**Fix:** Remove the runtime branch and rely on the existing test, or move the check into a test asserting `Number.isInteger(price / 2)` for the sale product.

---

_Reviewed: 2026-11-04T12:47:14Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
