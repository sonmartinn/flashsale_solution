# Phase 2: Buy Pipeline & Admin APIs - Pattern Map

**Mapped:** 2026-11-08
**Files analyzed:** 30 (new + modified)
**Analogs found:** 28 / 30 (all analogs are git-tracked, verified with `git ls-files backend`)

All paths are relative to the repo root. Conventions that apply to every file: ESM NodeNext, relative imports end in `.js`, `import type` for type-only imports, Vietnamese comments and messages, no try/catch in Express handlers, business errors via `HttpError(status, message, code)`, **no logging on the buy path**.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `backend/src/utils/http-error.ts` (EDIT) | utility | n/a | itself | exact |
| `backend/src/types/ioredis.d.ts` (NEW) | type augmentation | n/a | `backend/src/types/express.d.ts` | exact (role) |
| `backend/src/services/lua.ts` (NEW) | service | file-I/O + request-response (Redis) | `backend/src/config/redis.ts` | role-match |
| `backend/src/services/sale-cache.ts` (NEW) | service/store | CRUD read, single-flight | `backend/src/services/sale-admin.service.ts` (factory shape) | partial |
| `backend/src/services/order.service.ts` (NEW) | service | CRUD write | `backend/src/services/sale-admin.service.ts` | role-match |
| `backend/src/services/purchase.service.ts` (NEW) | service | request-response, CRUD + Redis | `backend/src/services/sale-admin.service.ts` | exact (factory + Mongo + Redis multi) |
| `backend/src/services/stock.service.ts` (NEW) | service | read | `backend/src/services/sale-admin.service.ts` + `config/redis.ts` keys | role-match |
| `backend/src/services/catalog.service.ts` (NEW) | service | CRUD read | `backend/src/services/sale-admin.service.ts` (`.lean()` queries) | role-match |
| `backend/src/services/sale-admin.service.ts` (EDIT: `getStats`) | service | read | itself | exact |
| `backend/src/services/reconcile.service.ts` (NEW) | service | batch | `backend/src/services/sale-admin.service.ts` (multi + StockMovement) | role-match |
| `backend/src/utils/dto.ts` (NEW) | utility | transform | none (closest: `utils/object-id.ts` pure function style) | none |
| `backend/src/controllers/product.controller.ts` (NEW) | controller | request-response | `backend/src/controllers/auth.controller.ts` | exact |
| `backend/src/controllers/sale.controller.ts` (NEW, incl. buy) | controller | request-response | `backend/src/controllers/auth.controller.ts` | exact |
| `backend/src/controllers/order.controller.ts` (NEW) | controller | request-response | `backend/src/controllers/auth.controller.ts` | exact |
| `backend/src/controllers/admin.controller.ts` (NEW) | controller | request-response | `backend/src/controllers/auth.controller.ts` | exact |
| `backend/src/routes/product.routes.ts` (NEW) | route | request-response | `backend/src/routes/auth.routes.ts` | exact |
| `backend/src/routes/sale.routes.ts` (NEW) | route | request-response | `backend/src/routes/auth.routes.ts` | exact |
| `backend/src/routes/order.routes.ts` (NEW) | route | request-response | `backend/src/routes/auth.routes.ts` | exact |
| `backend/src/routes/admin.routes.ts` (EDIT) | route | request-response | itself | exact |
| `backend/src/routes/index.ts` (EDIT) | route | n/a | itself | exact |
| `backend/src/server.ts` (EDIT) | config/boot | n/a | itself (Redis boot block) | exact |
| `backend/scripts/cli-args.ts` (EDIT) | utility | n/a | itself (`parseResetArgs`) | exact |
| `backend/scripts/reconcile.ts` (NEW) | CLI script | batch | `backend/scripts/reset.ts` | exact |
| `backend/package.json` (EDIT) | config | n/a | `"reset"` script line | exact |
| `backend/test/helpers.ts` (EDIT) | test util | n/a | itself (`spawnCli`) | exact |
| `backend/test/cli-args.test.ts` (EDIT) | test (unit) | n/a | itself | exact |
| `backend/test/integration/lua.test.ts` (NEW, db 6) | test | n/a | `backend/test/integration/reset.test.ts` | exact |
| `backend/test/integration/buy.test.ts` (NEW, db 7) | test | HTTP | `backend/test/integration/auth.test.ts` (`startApp`) + reset.test | exact |
| `backend/test/integration/compensation.test.ts` (NEW, db 8) | test | service | `backend/test/integration/reset.test.ts` (`fakeRedis`, `isHttpError`) | exact |
| `backend/test/integration/read.test.ts` (9), `admin.test.ts` (10), `reconcile.test.ts` (11) (NEW) | test | HTTP / service / CLI | `reset.test.ts`, `auth.test.ts`, `seed.test.ts` (`spawnCli`) | exact |

## Pattern Assignments

### `backend/src/utils/http-error.ts` (EDIT)

Current union (lines 5-15), comment at line 3 already announces the five additions:
```ts
export type ErrorCode =
  | "VALIDATION_ERROR"
  | "INVALID_ID"
  | "INVALID_JSON"
  | "DUPLICATE"
  | "EMAIL_TAKEN"
  | "UNAUTHORIZED"
  | "INVALID_CREDENTIALS"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "INTERNAL_ERROR";
```
Add `"SOLD_OUT" | "ALREADY_BOUGHT" | "SALE_NOT_ACTIVE" | "STOCK_NOT_LOADED" | "INVALID_MODE"` and update the comment. `HttpError` class (lines 21-31) unchanged. First-wave edit (RESEARCH Pitfall 11).

---

### `backend/src/types/ioredis.d.ts` (NEW)

**Analog:** `backend/src/types/express.d.ts` (lines 1-12) — global augmentation + `export {}`:
```ts
import type { Role } from "../models/user.js";

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; role: Role };
    }
  }
}

export {};
```
For ioredis use module augmentation instead: `declare module "ioredis" { interface RedisCommander<Context> { flashBuy(stockKey: string, buyersKey: string, userId: string, qty: string | number): Result<number, Context>; } }` then `export {}`. Comment in Vietnamese on top.

---

### `backend/src/services/lua.ts` (NEW)

**Analog:** `backend/src/config/redis.ts` — Redis import style (line 1) and key helpers (lines 72-79):
```ts
import { Redis } from "ioredis";        // value import; use `import type { Redis }` if only typed
...
export function stockKey(saleId: string): string { return `stock:${saleId}`; }
export function buyersKey(saleId: string): string { return `buyers:${saleId}`; }
```
Lua file: `backend/src/lua/buy.lua` (returns `1 / 0 / -1 / -2`, KEYS[1]=stock, KEYS[2]=buyers, ARGV userId, qty). Read with `readFileSync(new URL("../lua/buy.lua", import.meta.url), "utf8")` (never `.pathname` — the repo path contains Vietnamese chars and spaces). `registerBuyScript(redis)` calls `redis.defineCommand("flashBuy", { numberOfKeys: 2, lua })`. `runBuyScript` checks result `∈ {1,0,-1,-2}` else `throw new Error(...)` (500).

**Boot failure pattern** to copy into `server.ts` (see server.ts section).

---

### `backend/src/services/purchase.service.ts` (NEW) — central file

**Analog:** `backend/src/services/sale-admin.service.ts`

**Imports** (lines 3-7):
```ts
import type { Redis } from "ioredis";
import { buyersKey, stockKey } from "../config/redis.js";
import { FlashSale, Order, SALE_MODES, StockMovement, type SaleMode } from "../models/index.js";
import { HttpError } from "../utils/http-error.js";
import { normalizeObjectId } from "../utils/object-id.js";
```

**Factory with injected deps and defaulted seam** (lines 29-39) — mirror for `createPurchaseService({ redis, saleCache, createOrder = defaultCreateOrder })`:
```ts
export interface SaleAdminDeps {
  redis: Redis;
  onSaleReset?: (saleId: string) => void;
}
export function createSaleAdminService({ redis, onSaleReset = () => {} }: SaleAdminDeps): SaleAdminService {
  async function resetSale(...) { ... }
  return { resetSale, resetAllSales };
}
```

**Mongo update style** (lines 56-67) — `updateOne` with `$set`; V1 uses `findOneAndUpdate({ _id, remainingQty: { $gte: qty } }, { $inc: { remainingQty: -qty } }, { returnDocument: "after" })` (never `new: true`); V1 refund `FlashSale.updateOne({ _id }, { $inc: { remainingQty: +qty } })`.

**multi() result checking** (lines 71-77) — copy verbatim for V2 `INCRBY + SREM` refund:
```ts
const results = await redis.multi().set(stockKey(saleId), String(totalQty)).del(buyersKey(saleId)).exec();
if (results === null) throw new Error("Redis multi() bị hủy");
for (const [err] of results) {
  if (err) throw err;
}
```

**StockMovement write** (line 81):
```ts
await StockMovement.create({ saleId, orderId: null, delta: totalQty, reason: "reset", at: now });
```
For compensation: `reason: "compensate_v1" | "compensate_v2"`, `delta: +qty`, wrapped in `.catch(err => console.error(...))` (D-12, failure path only).

**E11000 detection** — copy the check from `backend/src/middlewares/error.ts` line 37:
```ts
if (err instanceof mongoose.mongo.MongoServerError && err.code === 11000) { ... }
```
Put it in `order.service.ts` as `isDuplicateKeyError(err)` and map to `HttpError(409, ..., "ALREADY_BOUGHT")` (RESEARCH Pitfall 1: otherwise errorHandler returns `DUPLICATE`).

**Errors:** throw `HttpError` for `SOLD_OUT`/`ALREADY_BOUGHT`/`STOCK_NOT_LOADED`; rethrow original error for 500 (errorHandler logs stack, lines 53-54).

---

### `backend/src/services/order.service.ts` (NEW)

**Analog:** `backend/src/services/sale-admin.service.ts` + `backend/src/models/order.ts`.
Order schema fields (order.ts lines 9-15): `userId, saleId, productId, qty, price, status (default "success"), mode`; `timestamps: { createdAt: true, updatedAt: false }`; unique `(saleId, userId)` line 21; `(userId, createdAt -1)` line 23. `createOrder({ saleId, userId, productId, price, qty, mode })` → `Order.create({...})`.

---

### `backend/src/services/sale-cache.ts` (NEW)

**Analog (shape only):** `sale-admin.service.ts` factory (lines 38-98) — `createSaleCache()` returns `{ get, invalidate }`; one instance per app built in `routes/index.ts`. Query style from line 47:
```ts
const sale = await FlashSale.findById(saleId, { totalQty: 1, mode: 1 }).lean();
if (sale === null) throw new HttpError(404, "Không tìm thấy đợt sale", "NOT_FOUND");
```
Cache projection: `productId salePrice totalQty startAt endAt status` (no `mode`, no `remainingQty`, D-16). Body logic from RESEARCH Pattern 1 (lines 283-314); null and rejected loads are evicted (D-18).

---

### `backend/src/services/sale-admin.service.ts` (EDIT: `getStats`)

Add `getStats(saleId)` to `SaleAdminService` interface (lines 24-27) and the returned object (line 97). Reuse validation lines 41-42 and 404 at line 48. Field list per D-25. Note RESEARCH Pitfall 5: lines 43-45 throw `VALIDATION_ERROR` for bad mode; the admin route must validate mode first and throw `INVALID_MODE`.

---

### `backend/src/services/stock.service.ts`, `catalog.service.ts` (NEW)

**Analog:** `sale-admin.service.ts` line 88 for list queries:
```ts
const sales = await FlashSale.find({}, { _id: 1 }).sort({ _id: 1 }).lean();
```
Use `.lean()` everywhere; keys from `stockKey()`; `MGET` only when keys list non-empty (RESEARCH Pitfall 4).

---

### `backend/src/services/reconcile.service.ts` (NEW)

**Analog:** `sale-admin.service.ts` — multi() + `[err]` loop (lines 73-77) and StockMovement row (line 81, `reason: "reconcile_fix"`). Must not print; return a result object the CLI formats.

---

### Controllers (NEW): `product`, `sale` (incl. buy), `order`, `admin`

**Analog:** `backend/src/controllers/auth.controller.ts` (lines 1-14):
```ts
import type { RequestHandler } from "express";
import type { AuthService } from "../services/auth.service.js";
import { parseLoginInput, parseRegisterInput } from "../utils/validate.js";

/** Express 5 tự chuyển lỗi async tới middleware lỗi, không cần try/catch. */
export function createAuthController(service: AuthService): { register: RequestHandler; login: RequestHandler } {
  const register: RequestHandler = async (req, res) => {
    res.status(201).json(await service.register(parseRegisterInput(req.body)));
  };
  ...
  return { register, login };
}
```
Second analog for deps-object factories: `backend/src/controllers/health.controller.ts` line 15 `createHealthController(deps: { cfg: BaseConfig; redis: Redis }): RequestHandler`.

Buy controller check order (D-01): `req.user` (set by `requireAuth`, type in `types/express.d.ts` line 7) → `mode` (`typeof req.query.mode === "string"` and in `SALE_MODES`, else `INVALID_MODE`) → `qty` (`req.body` object, `typeof qty === "number" && qty === 1`) → `normalizeObjectId(req.params.id)` (`utils/object-id.ts` lines 8-11) → cache get → open check → handler. Follow RESEARCH Pattern 2 (lines 315-336).

---

### Routes (NEW): `product.routes.ts`, `sale.routes.ts`, `order.routes.ts`

**Analog:** `backend/src/routes/auth.routes.ts` (lines 1-13):
```ts
import { Router } from "express";
import type { AppDeps } from "../app.js";
import { createAuthController } from "../controllers/auth.controller.js";
import { createAuthService } from "../services/auth.service.js";

export function createAuthRouter(deps: Pick<AppDeps, "jwtSecret">): Router {
  const controller = createAuthController(createAuthService({ jwtSecret: deps.jwtSecret }));
  const router = Router();
  router.post("/register", controller.register);
  router.post("/login", controller.login);
  return router;
}
```
In `sale.routes.ts` register `/active` **before** `/:id`; buy route `router.post("/:id/buy", auth.requireAuth, controller.buy)`.

### `backend/src/routes/admin.routes.ts` (EDIT)

Current (lines 9-13) — keep guard first, add routes after it; signature widens to take services:
```ts
export function createAdminRouter(auth: AuthMiddleware): Router {
  const router = Router();
  router.use(auth.requireAuth, auth.requireAdmin);
  return router;
}
```

### `backend/src/routes/index.ts` (EDIT)

Current (lines 9-17); the single `auth` instance (line 12) is reused. Build one `saleCache` here (keeps `AppDeps` unchanged, RESEARCH lines 556-573) and pass `saleCache.invalidate` as `onSaleReset`:
```ts
export function createApiRouter(deps: AppDeps): Router {
  const router = Router();
  const auth = createAuthMiddleware(deps);
  router.get("/health", createHealthController(deps));
  router.use("/auth", createAuthRouter(deps));
  router.use("/admin", createAdminRouter(auth));
  return router;
}
```

---

### `backend/src/server.ts` (EDIT)

Insert `registerBuyScript(redis)` right after the Redis boot block (lines 47-54), same one-line `[LỖI]` failure style:
```ts
const redis = createRedis(cfg.redisUrl);
try {
  await connectRedis(redis);
} catch {
  redis.disconnect();
  await mongoose.disconnect();
  fail(`Không kết nối được Redis tại ${cfg.redisTarget}. ...`);
}
```
`fail` from `backend/src/utils/fail.ts`.

---

### `backend/scripts/reconcile.ts` (NEW)

**Analog:** `backend/scripts/reset.ts` — copy whole skeleton:
- header usage comment (lines 1-3)
- args parse with `CliArgsError` → `fail(`${err.message}\n${USAGE}`)` (lines 18-24)
- `loadBaseConfig()` only, `ConfigError` → `fail` (lines 26-32) — no JWT_SECRET
- Mongo connect/fail (lines 36-41), Redis connect/fail (lines 43-50)
- work in `try`, `catch` → `console.error(`[LỖI] ...`)` + `process.exitCode = 1`, `finally` closes both connections (lines 52-71):
```ts
} finally {
  await mongoose.disconnect().catch(() => {});
  await redis.quit().catch(() => redis.disconnect());
}
```
Use `process.exitCode = 2` for remaining drift (D-30). Do not print the reset.ts cache warning (lines 14-16) — print the "chỉ chạy khi không có lượt mua" help text instead.

### `backend/scripts/cli-args.ts` (EDIT)

Copy `parseResetArgs` (lines 76-93) and `RESET_USAGE` (line 16) for `parseReconcileArgs` / `RECONCILE_USAGE`. `OptionSpec` (line 31) is string-only and `parseStrict` (lines 38-49) drops non-strings: widen to `{ type: "boolean" }` or call `parseArgs` directly with `strict: true, allowPositionals: false` and the same `CliArgsError` wrap (RESEARCH Pitfall 9).

### `backend/package.json` (EDIT)

After line 16 `"reset": "tsx scripts/reset.ts",` add `"reconcile": "tsx scripts/reconcile.ts",`.

---

### Tests

**Integration skeleton analog:** `backend/test/integration/reset.test.ts` lines 1-60:
```ts
// Cần "docker compose up -d --wait". Dùng database flashsale_test_<name>_<pid> và Redis db N (không bao giờ db 0).
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { Types } from "mongoose";
import type { Redis } from "ioredis";
import { connectTestStores, dropTestDatabaseAndDisconnect } from "../helpers.js";

describe("reset.test", () => {
  before(async () => {
    ({ redis } = await connectTestStores("reset", 3));
    const summary = await seedDatabase({ redis, qty: 5, mode: "v1" });
    saleId = summary.saleId;
  });
  ...
});
```
Also reusable from the same file: `isHttpError(status, code)` assertion helper (lines 16-23) and `fakeRedis(execResult)` multi() stub (lines 26-33) for V2 compensation multi-failure branches.

**Helpers** (`backend/test/helpers.ts`): `connectTestStores(name, redisDb)` line 457, `dropTestDatabaseAndDisconnect(redis)` line 465, `startApp(deps)` line 92 (in-process app on 127.0.0.1, pass `redis` and `cfg: testConfig({ ... isTestMode true })` for `x-test-user`), `testConfig` line 48, `spawnCli` lines 313-325 — widen union `"seed" | "reset"` to include `"reconcile"` (RESEARCH Pitfall 10). Lua tests must call `registerBuyScript(redis)` after `connectTestStores` (Pitfall 3).

Redis db assignments: lua 6, buy 7, compensation 8, read 9, admin 10, reconcile 11.

## Shared Patterns

### Error handling
**Source:** `backend/src/middlewares/error.ts` lines 14-55. **Apply to:** all controllers/services. Throw `HttpError`; anything else becomes 500 `INTERNAL_ERROR` with stack logged. E11000 must be caught inside the buy path (line 37 maps it to `DUPLICATE` otherwise).

### Auth
**Source:** `backend/src/middlewares/auth.ts` `createAuthMiddleware(deps)` → `{ requireAuth, requireAdmin }`, built once in `routes/index.ts` line 12. **Apply to:** buy, `/orders/me`, admin router (guard via `router.use` first).

### ObjectId validation
**Source:** `backend/src/utils/object-id.ts` lines 8-11 + `sale-admin.service.ts` lines 41-42 (`INVALID_ID` 400). **Apply to:** every `:id` param and `--sale`.

### Redis multi() result checking
**Source:** `sale-admin.service.ts` lines 71-77. **Apply to:** V2 compensation, reconcile `--fix`.

### Factory services with injected deps
**Source:** `sale-admin.service.ts` lines 29-39. **Apply to:** purchase, sale-cache, reconcile, catalog services.

### Mode validation
**Source:** `SALE_MODES` in `backend/src/models/flash-sale.ts` line 3; `parseMode` in `scripts/cli-args.ts` (`SALE_MODES.find((m) => m === raw)`). **Apply to:** buy `?mode`, admin reset body `mode` (code `INVALID_MODE`).

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `backend/src/utils/dto.ts` | utility | transform | No DTO mappers exist yet; follow RESEARCH Pattern 6 and D-20 shapes (`id` string, ISO dates, no `_id`/`__v`). |
| `backend/src/services/sale-cache.ts` (single-flight logic) | store | read cache | No caching code exists; use RESEARCH Pattern 1 (lines 283-314). |

## Metadata

**Analog search scope:** `backend/src`, `backend/scripts`, `backend/test` (all tracked)
**Files scanned:** 22
**Pattern extraction date:** 2026-11-08
