# Architecture Research

**Domain:** Flash-sale web app that prevents overselling (one Express API with 3 interchangeable buy strategies, MongoDB as source of truth, Redis as fast layer, plus a load-test harness)
**Researched:** 2026-11-03
**Confidence:** HIGH for structure and data flows (they follow docs/SPECS.md closely and use well-known patterns). MEDIUM for a few library details, which are flagged inline.

The high-level topology is fixed by SPECS section 5. This document covers what happens **inside** that topology: module boundaries, the shared buy pipeline, where each piece of state lives, how the stores are kept in sync, and the order to build things in.

---

## Standard Architecture

### System Overview

```
┌──────────────────────────────── Clients ─────────────────────────────────┐
│  React SPA (Vite :5173, /api proxy)     loadtest/ (E1 fetch, E2 autocannon)│
│  pages ─ components ─ services/api.ts   lib/{http,admin,ids,csv,hist}     │
└───────────────┬──────────────────────────────────┬────────────────────────┘
                │ HTTP JSON (Bearer JWT)           │ HTTP JSON (x-test-user in test mode,
                ▼                                  ▼  real admin JWT for reset/stats)
┌──────────────────────────── Express API (:5000) ─────────────────────────┐
│ app.ts: express.json → cors → /api router → notFound → errorHandler       │
│ ┌──────────── middlewares ────────────┐                                   │
│ │ requireAuth (JWT | x-test-user)     │  requireAdmin (router.use /admin) │
│ └─────────────────────────────────────┘                                   │
│ routes/ ──► controllers/ (HTTP in/out, validation, status mapping)        │
│                 │                                                         │
│                 ▼                                                         │
│ services/                                                                 │
│  ├ saleCache        in-memory static sale info (shared by V0/V1/V2)       │
│  ├ purchase         pre-checks + buyHandlers{v0,v1,v2} + createOrder      │
│  ├ stock            remaining-by-mode, Redis preload, Redis rebuild       │
│  ├ saleAdmin        resetSale(), getStats()   (also used by CLI scripts)  │
│  ├ reconcile        diff Redis vs orders (used by CLI script)             │
│  └ auth / product / order                                                 │
│                 │                                  │                      │
│ models/ (Mongoose)                       config/redis.ts + lua/buy.lua    │
└─────────────────┼──────────────────────────────────┼──────────────────────┘
                  ▼                                  ▼
        MongoDB 7 :27018 (truth)            Redis 7 :6379 (AOF everysec)
        users products flash_sales          stock:<saleId>  (string int)
        orders stock_movements              buyers:<saleId> (set of userId)
                  ▲                                  ▲
                  └──── backend/scripts/{seed,reset,reconcile}.ts ────┘
                        (import src/config, src/models, src/services)

scripts/start|stop.{ps1,sh} ──► docker compose (mongo, redis) + npm run dev (api, web) in background, .dev/ PIDs and logs
```

### Component Responsibilities

| Component | Responsibility (owns) | Talks to | Implementation |
|-----------|----------------------|----------|----------------|
| `config/env.ts` | Reads env once: `PORT`, `MONGODB_URI`, `REDIS_URL`, `CLIENT_ORIGIN`, `MONGO_MAX_POOL`, `isTestMode` (`process.env.NODE_ENV === "test"`, evaluated in this one place). Exposes `requireJwtSecret()` that throws. It does **not** throw at import time | Everyone (read-only) | `dotenv/config` + plain object |
| `config/db.ts` | `connectMongo()` with explicit `maxPoolSize` and a short `serverSelectionTimeoutMS`; `disconnectMongo()` | Mongoose | Function, no side effects on import |
| `config/redis.ts` | `createRedis()` builds the ioredis client, loads `lua/buy.lua` with `readFileSync(new URL("../lua/buy.lua", import.meta.url), "utf8")`, registers `defineCommand("buyFlash", { numberOfKeys: 2 })`. Exports the singleton and the typed wrapper `runBuyScript()` | ioredis | Function plus module singleton |
| `models/*` | Schemas, explicit collection names (`flash_sales`, `stock_movements`), all indexes from SPECS section 6. `index.ts` re-exports models and `allModels` for `createIndexes()` | Mongoose | One file per collection |
| `middlewares/auth.ts` | `requireAuth`: JWT verify, or `x-test-user` when `isTestMode`. Never touches MongoDB. `requireAdmin` checks `req.user.role` | `config/env`, jsonwebtoken | Express middleware |
| `middlewares/error.ts` | `notFound` and `errorHandler` turn `HttpError`, `CastError`, `ValidationError`, E11000, `entity.parse.failed` into the SPECS section 7 codes. 500 never leaks details | `utils/httpError` | Express 5 error middleware (4 args) |
| `utils/` | `HttpError`, `isObjectIdString`, `isNonEmptyString`, `epoch()` | (none) | Pure functions |
| `controllers/*` | Parse and validate input (every field must be a string, except `qty` which must be exactly the number 1). Call services and map service results to HTTP. No DB calls | services | Thin async handlers |
| `services/saleCache.ts` | Process-local `Map<saleId, Promise<SaleInfo \| null>>` holding only static fields. Single-flight load. `invalidate(id?)` | `FlashSale` model | Module-level Map |
| `services/purchase.service.ts` | `buy({saleId, userId, qty, mode})`: shared checks, then `buyHandlers[mode]`, shared `createOrder`, compensation. Returns a discriminated result, not HTTP codes | saleCache, models, redis | Strategy map |
| `services/stock.service.ts` | `getRemaining(sale)` by `sale.mode`; `preloadRedis(saleId, stock, buyers[])` in one `multi()`; key builders `stockKey()` and `buyersKey()` | redis, `Order` | Functions |
| `services/saleAdmin.service.ts` | `resetSale(id?, {mode?})` and `getStats(id)`. The single implementation used by both the admin route and `scripts/reset.ts` | models, stock.service, saleCache | Functions |
| `services/reconcile.service.ts` | `diffSale(id)` and `fixRedisFromMongo(id)` | models, stock.service | Functions |
| `app.ts` / `server.ts` | `app.ts` builds the Express app with no I/O. `server.ts` is the bootstrap that fails fast: JWT secret, then Mongo, then indexes, then Redis and script, then `listen` with the error checked in the callback | all config | Split so scripts and tests never start a server |
| `backend/scripts/*` | seed / reset / reconcile CLIs. Same models and services, own connect/disconnect, no JWT | config, models, services | `tsx scripts/x.ts` |
| `loadtest/` | Scenario runners, raw outputs, summary CSVs | API over HTTP only (never the DBs directly) | Separate package |
| `frontend/` | Pages, polling, buy button that uses `sale.mode`, admin monitor | API via `/api` proxy | React 19 + Router 7 |
| `scripts/start|stop` | Dev environment lifecycle only. Never used for measurement | docker, npm, `/api/health` | PS 5.1 and bash 3.2 |

---

## Recommended Project Structure

```
docker-compose.yml               # mongo:7 (127.0.0.1:27018:27017), redis:7 --appendonly yes --appendfsync everysec (127.0.0.1:6379)
.gitattributes                   # *.sh eol=lf, *.ps1 eol=crlf
.gitignore                       # .dev/, node_modules, dist, .env, loadtest/results/raw/
scripts/
├── start.ps1  stop.ps1          # Windows PS 5.1, UTF-8 with BOM, self-contained
└── start.sh   stop.sh           # macOS bash 3.2, same flags/behavior, self-contained
.dev/                            # api.pid, web.pid, logs/{api,web}.log (gitignored)
backend/
├── package.json                 # dev, build (tsc -p tsconfig.build.json && copy lua), start, start:test, typecheck, seed, reset, reconcile
├── tsconfig.json                # include: src, scripts (typecheck covers scripts)
├── tsconfig.build.json          # include: src only, outDir dist
├── .env.example  .env.test      # .env.test sets NODE_ENV=test (+ optional pool override), no secrets
├── src/
│   ├── config/   env.ts db.ts redis.ts
│   ├── models/   User.ts Product.ts FlashSale.ts Order.ts StockMovement.ts index.ts
│   ├── middlewares/ auth.ts error.ts
│   ├── utils/    httpError.ts validate.ts
│   ├── lua/      buy.lua
│   ├── services/ auth.service.ts product.service.ts saleCache.ts sale.service.ts
│   │             purchase.service.ts stock.service.ts order.service.ts
│   │             saleAdmin.service.ts reconcile.service.ts
│   ├── controllers/ auth product sale order admin health
│   ├── routes/   index.ts (mounts) + auth.routes.ts sale.routes.ts admin.routes.ts ...
│   ├── types/    express.d.ts (req.user), ioredis.d.ts (optional augmentation)
│   ├── app.ts
│   └── server.ts
└── scripts/      seed.ts reset.ts reconcile.ts   (import ../src/...js)
frontend/
└── src/
    ├── services/ api.ts (fetch wrapper, token, error → message), auth.ts (localStorage)
    ├── hooks/    usePolling.ts useCountdown.ts
    ├── components/ Layout ProtectedRoute Countdown BuyButton RemainingBadge StatsPanel E2Chart
    ├── pages/    HomePage SalePage LoginPage OrdersPage AdminPage
    ├── types.ts  App.tsx main.tsx
loadtest/
├── package.json                 # autocannon, tsx; scripts e1 e2 e3 e4
├── lib/          config.ts http.ts admin.ts ids.ts csv.ts histogram.ts env-info.ts
├── scenarios/    e1-correctness.ts e2-performance.ts e3-duplicate.ts e4-mongo-kill.ts
└── results/
    ├── raw/                     # per-run JSON (gitignored)
    └── e1.csv e2.csv e3.csv e4.csv   # summaries (committed)
docs/                            # SPECS.md, results analysis for the report
```

### Structure Rationale

- **`services/` holds every business rule, and the CLIs import services rather than duplicating them.** Reset logic is the main case: the admin endpoint and `npm run reset` must behave identically (SPECS section 6). If the reset logic is duplicated, the two copies will drift and break the mixed-mode guarantee.
- **`app.ts` and `server.ts` are separate**, so scripts never start a server and the bootstrap order can fail fast at each step.
- **`config/env.ts` never throws at import time.** Seed and reset must run without `JWT_SECRET` (SPECS section 7), so only `server.ts` calls `requireJwtSecret()`.
- **`loadtest/` is its own package and reaches the system only over HTTP.** This keeps autocannon out of the backend dependencies, and the harness measures exactly what a client would see. It never reads MongoDB directly. Verification goes through `/admin/sales/:id/stats` plus the reconcile CLI.
- **The dev scripts are self-contained per OS.** SPECS section 12 allows a shared file but still requires 2 runnable files per OS. Duplicate a small constants block (ports 5000/5173, `.dev` paths) at the top of each file. That is cheaper than dot-sourcing across PS 5.1 and bash 3.2.

---

## Architectural Patterns

### Pattern 1: Shared buy pipeline + strategy map (`buyHandlers[mode]`)

**What:** One pipeline function runs the shared pre-checks in SPECS order, then dispatches to `buyHandlers[mode]`. Handlers return a **result union** instead of throwing HTTP errors. A single mapping table in the controller turns results into status codes, which guarantees identical codes across the three versions.

**When to use:** Always for this project. Uniform codes are a SPECS requirement, and comparisons are only fair if V0, V1 and V2 differ **only** in the inventory step.

**Trade-offs:** Slightly more types up front. In return the three versions cannot drift, and E1/E2 compare like with like.

```typescript
// services/purchase.service.ts
export type BuyResult =
  | { kind: "ok"; order: OrderDTO }
  | { kind: "sold_out" }          // 409 "Hết hàng"
  | { kind: "already_bought" }    // 409 "Bạn đã mua sản phẩm này"
  | { kind: "not_loaded" };       // 503 (V2 only)

type BuyCtx = { sale: SaleInfo; saleId: string; userId: string; qty: 1; mode: Mode };
const buyHandlers: Record<Mode, (c: BuyCtx) => Promise<BuyResult>> = { v0: buyV0, v1: buyV1, v2: buyV2 };

export async function buy(input: { saleId: string; userId: string; qty: 1; mode: Mode }) {
  const sale = await saleCache.get(input.saleId);                 // shared by all modes
  if (!sale) throw new HttpError(404, "Không tìm thấy đợt sale");
  const now = Date.now();
  if (sale.status !== "active" || now < sale.startAt || now > sale.endAt)
    throw new HttpError(400, "Đợt sale chưa mở hoặc đã kết thúc");
  return buyHandlers[input.mode]({ ...input, sale });
}

// shared by all three, so the order insert costs the same everywhere
async function createOrder(c: BuyCtx) {
  return Order.create({ userId: c.userId, saleId: c.saleId, productId: c.sale.productId,
                        qty: c.qty, price: c.sale.salePrice, status: "success", mode: c.mode });
}
```

Controller order (exactly SPECS section 8). `requireAuth` runs first. Then: `mode` is a string in `{v0,v1,v2}`, else 400. Note that Express 5 parses `?mode=a&mode=b` as an array, so check `typeof === "string"`. Then `req.body?.qty === 1`, else 400. Then `isObjectIdString(id)`, else 400. Then `purchase.buy()`. Then `STATUS[result.kind]`.

### Pattern 2: In-memory static sale cache with single-flight and explicit invalidation

**What:** `saleCache.get(id)` returns a cached `Promise<SaleInfo | null>`. `SaleInfo = { productId, salePrice, totalQty, startAt, endAt, status, mode }` with dates stored as epoch ms. `remainingQty` is **never** cached. The Promise itself is stored so that 1,000 simultaneous first requests trigger exactly one `findOne`. A rejected load is evicted. `invalidate(id?)` is called by `resetSale`.

**When to use:** On the buy path for all three modes, so they are compared fairly (Key Decision in PROJECT.md).

**Trade-offs:** The cache is process-local. **The CLI `npm run reset` runs in another process and cannot clear it.** Recommended handling:
1. The load-test harness always resets through `POST /api/admin/sales/:id/reset` with a real admin JWT. That path clears the cache in-process.
2. `scripts/reset.ts` prints a warning that a running server must be restarted, or that the admin endpoint should be used instead.
3. Optional safety net: a long TTL (e.g. 30 s) on entries. One `findOne` per 30 s is negligible and identical for all modes. Decide this in the requirements step.

```typescript
const cache = new Map<string, Promise<SaleInfo | null>>();
export function get(id: string) {
  let p = cache.get(id);
  if (!p) {
    p = FlashSale.findById(id, STATIC_PROJECTION).lean().then(toSaleInfo);
    p.catch(() => cache.delete(id));
    cache.set(id, p);
  }
  return p;
}
export function invalidate(id?: string) { id ? cache.delete(id) : cache.clear(); }
```

### Pattern 3: Inventory step per mode with compensation (saga-lite, no transactions)

**What:** Each handler does "reserve inventory", then `createOrder`, then "compensate on failure". The reserve step and the compensation differ per mode:

| Mode | Reserve | On `createOrder` failure | Atomic? |
|------|---------|--------------------------|---------|
| V0 | `findOne` reads `remainingQty`; if `>= qty`, `updateOne {$inc: -qty}` | No compensation, by design (naive). E11000 still maps to `already_bought` | No (check and act are separate, which is the point) |
| V1 | `findOneAndUpdate({_id, remainingQty: {$gte: qty}}, {$inc: {remainingQty: -qty}}, {projection: {_id: 1}, lean})`; `null` means `sold_out` | `$inc: +qty`, then a best-effort `stock_movements {reason: "compensate_v1"}`. E11000 maps to `already_bought`, anything else rethrows (500) | Single document |
| V2 | `runBuyScript(stockKey, buyersKey, userId, qty)`: `1` ok, `0` sold_out, `-1` already_bought, `-2` not_loaded | `multi().incrby(stock, qty).srem(buyers, userId).exec()`, then a best-effort `stock_movements {reason: "compensate_v2"}` | Lua script |

**Rules for compensation (they matter for E3/E4):**
- **Compensate the inventory store first and write the log second.** The `stock_movements` insert must be wrapped in a `.catch()` and must never replace the original error. In E4 MongoDB is down, so the log write will fail too. The Redis compensation must still happen and the client must still get the original error.
- **V2 on E11000: do `INCRBY` but do NOT `SREM`.** E11000 means the user already has an order, so they legitimately belong in `buyers:<id>`. Removing them makes the buyers set disagree with `orders`, and reconcile then reports a false mismatch. This can only happen when the stores are already out of sync (for example a V1 run without reset), but the handler should still get it right.
- **Ambiguous writes are a known limitation for the report.** If `Order.create` times out after the server actually committed (possible in E4), compensation returns one unit that was in fact sold. Result: one extra sale is possible, i.e. oversell by 1. A standalone MongoDB has no retryable writes or transactions to close this gap. Document it, don't fix it (consistent with PROJECT.md Out of Scope).
- **Set Mongoose `bufferCommands: false`, or a short `bufferTimeoutMS`**, so that E4 failures come back fast instead of hanging ~10 s per request on Mongoose's buffering. (MEDIUM: verify the exact option interplay with Mongoose 9 during the E4 phase.)

### Pattern 4: Typed wrapper around the Lua custom command

**What:** Register the script once at startup with `redis.defineCommand("buyFlash", { numberOfKeys: 2, lua })` (SPECS requires this, and PROJECT.md notes it was already verified with ioredis 6). Hide it behind `runBuyScript(...): Promise<number>`, so the single type escape lives in one place.

**Trade-offs:** The idiomatic alternative is a `declare module "ioredis" { interface RedisCommander<Context> { buyFlash(...): Result<number, Context> } }` augmentation. It is cleaner, but the exact generic shape in ioredis 6 is not verified in this research (MEDIUM/LOW). The wrapper works either way.

```typescript
export async function runBuyScript(saleId: string, userId: string, qty: number): Promise<number> {
  const r = await (redis as unknown as BuyCmd).buyFlash(stockKey(saleId), buyersKey(saleId), userId, String(qty));
  return Number(r);
}
```

Note: **ioredis 6 defaults to RESP3 (`protocol: 3`)** (HIGH, ioredis releases/README). Integer replies from Lua are unaffected. If anything behaves oddly (e.g. `GET` of the stock key in stats), `protocol: 2` restores the v5 wire behavior.

### Pattern 5: Remaining stock read by `sale.mode` (display path only)

**What:** `stock.service.getRemaining(sale)`:
- `sale.mode === "v2"`: `GET stock:<id>`. If the key is missing, fall back to `totalQty - countDocuments({saleId, status: "success"})` and return `redisLoaded: false`, so the UI and admin can show "Redis chưa nạp kho".
- `v0` / `v1`: `sale.remainingQty` from MongoDB (can be negative for V0, which the UI should show as is; it is the visible proof of overselling).

It is used by `GET /sales/active` (use `MGET` for several v2 sales) and by `GET /sales/:id`. It is **not** used on the buy path. `GET /sales/:id` reads MongoDB fresh each time and does not use the cache, because it needs `remainingQty` and `mode` anyway, and it is not on the measured path.

### Pattern 6: Test-mode identity, with a single check

```typescript
// middlewares/auth.ts
export const requireAuth: RequestHandler = (req, _res, next) => {
  if (env.isTestMode) {                       // computed once in config/env.ts
    const h = req.get("x-test-user");
    if (h !== undefined) {
      if (!isObjectIdString(h)) throw new HttpError(401, "x-test-user không hợp lệ");
      req.user = { id: h, role: "user" };     // always "user", never admin
      return next();
    }
  }
  // normal Bearer JWT path (still works in test mode, needed for admin reset/stats)
  ...
};
```

`server.ts` prints a clear startup banner when test mode is on. `JWT_SECRET` is still required in test mode, because admin calls need real tokens. Start test mode with `node --env-file=.env.test dist/server.js`. `dotenv/config` does not override variables that are already set, so `.env` then fills in `JWT_SECRET` and the URIs. This works the same on PowerShell and macOS (MEDIUM: check the `--env-file` behavior on Node 20.19 vs 24 when wiring `start:test`).

---

## Data Flow

### Request flow (all buy modes): shared prefix

```
POST /api/sales/:id/buy?mode=vX  {qty:1}
  → express.json (malformed JSON → errorHandler → 400 VN message)
  → requireAuth  (JWT verify | x-test-user)                     [no DB]
  → sale.controller.buy: mode ∈ {v0,v1,v2}? qty === 1? id is ObjectId?   [400s]
  → purchase.buy → saleCache.get(id)                            [0 DB reads when warm]
       null → 404 ; inactive / outside [startAt,endAt] → 400
  → buyHandlers[mode] ...
  → controller maps BuyResult: ok→201 {order} | sold_out→409 | already_bought→409 | not_loaded→503
  (thrown errors → errorHandler: E11000→409, Cast/Validation→400, other→500)
```

### V0: naive (expected to oversell)

```
handler v0
  1. FlashSale.findById(id, {remainingQty:1}).lean()        Mongo read
  2. remainingQty < qty ? → sold_out
  3. FlashSale.updateOne({_id}, {$inc:{remainingQty:-qty}})  Mongo write  ← race window between 1 and 3
  4. createOrder()                                           Mongo write (unique (saleId,userId))
       E11000 → already_bought (no compensation, intentionally naive)
  → ok
Net: 3 Mongo round-trips; remainingQty can go negative; orders > totalQty under E1.
```

### V1: MongoDB atomic

```
handler v1
  1. FlashSale.findOneAndUpdate({_id, remainingQty:{$gte:qty}}, {$inc:{remainingQty:-qty}},
                                {projection:{_id:1}, lean:true})   Mongo atomic write
       null → sold_out
  2. createOrder()                                                 Mongo write
       error → FlashSale.updateOne({_id}, {$inc:{remainingQty:+qty}})     compensate
             → StockMovement.create({reason:"compensate_v1"}).catch(noop)
             → E11000 ? already_bought : rethrow (500)
  → ok
Net: 2 Mongo round-trips on success. Duplicate buyer costs 3 writes + 1 log.
Brief "false sold-out" window between 1 and the compensation (accepted trade-off).
```

Mongoose 9.2+ deprecates `new: true` in favor of `returnDocument: "after"` (HIGH, Mongoose migration guide). V1 only needs to know whether the result is null, so pass neither and keep the default (pre-update doc), which avoids the deprecation warning altogether.

### V2: Redis + Lua

```
handler v2
  1. runBuyScript(stock:<id>, buyers:<id>, userId, qty)     1 Redis round-trip (EVALSHA)
       -1 → already_bought ; -2 → not_loaded (503) ; 0 → sold_out
  2. createOrder()                                           Mongo write
       error → redis.multi().incrby(stock, qty)[.srem(buyers, userId) unless E11000].exec()
             → StockMovement.create({reason:"compensate_v2"}).catch(noop)
             → E11000 ? already_bought : rethrow (500)
  → ok
Net: 1 Redis + 1 Mongo on success; sold-out and duplicate requests never touch Mongo.
flash_sales.remainingQty is NOT decremented in V2.
```

This is also why the V1/V2 gap may be small in the "in stock" phase (both do 1 Mongo insert per success) and large in the "sold out" phase (V2 answers from Redis alone). E2 must measure the two phases separately (SPECS section 10).

### Sale lifecycle and store synchronization

```
seed.ts ──► dropDatabase + FLUSHDB
        ──► createIndexes() for ALL models   ← required: dropDatabase removes indexes, and a
        │                                       server that is already running will not rebuild them
        ──► insert users(1000+admin), products(6), 1 sale (qty from --qty, mode default)
        ──► preloadRedis: multi SET stock:<id> totalQty, DEL buyers:<id>

resetSale(id?, {mode?})  [admin route & reset.ts share it]
  Mongo: remainingQty=totalQty, status=active, startAt=now, endAt=now+7d, (mode if given)
         deleteMany orders{saleId}, deleteMany stock_movements{saleId}
         insert stock_movements {reason:"reset", delta:totalQty}
  Redis: multi SET stock:<id> totalQty, DEL buyers:<id>
  Cache: saleCache.invalidate(id)   (in-process only; CLI prints a warning)

During sale: V2 changes Redis only (+orders). V0/V1 change Mongo remainingQty (+orders).

After V2 run: reconcile.ts
  expected stock = totalQty - count(orders success)
  expected buyers = distinct(orders.userId)
  diff vs GET stock:<id> / SMEMBERS buyers:<id>; print; --fix → multi DEL buyers, SADD..., SET stock
  Warn if orders.mode is not all "v2" (mixed-mode run).
```

There is no scheduler for status transitions (out of scope). "Preload at sale start" is done by seed and reset. "Reconcile at end" is the manual script run after each V2 run, plus the stats check the harness performs. Do **not** auto-preload Redis on server boot: that would hide the designed 503 `not_loaded` signal and the "Redis lost data" story from the risk discussion. Rebuilding Redis is always an explicit `reconcile --fix`.

### Admin stats flow

`GET /admin/sales/:id/stats` → `findById` (remainingQty, totalQty) + `GET stock` + `SCARD buyers` + `countDocuments(orders success)` + `distinct("userId")`. It derives `oversold = max(0, orders - totalQty)`. The harness and the admin page both use it.

**The admin page must not poll during E2 measurements.** It adds Mongo load that skews V1/V2 numbers. Either close it, or have the page show a "pause polling" toggle.

### Frontend state flow

```
SalePage: usePolling(1500ms) → GET /sales/:id → {sale, remaining, redisLoaded}
          useCountdown(endAt)
          BuyButton → POST /sales/:id/buy?mode=${sale.mode} (Bearer) → message by status (201/409/400/503/401)
AdminPage: usePolling → GET stats ; Reset button → POST reset (optionally with mode)
api.ts: one fetch wrapper adds Authorization, parses {message}, on 401 clears token → /login
```

### Load-test harness flow

```
scenario run (per mode, per repetition):
  admin.login() → token
  admin.reset(saleId, {mode})  via HTTP (clears server cache; aligns sale.mode for display)
  assert stats: orders=0, redis stock/remaining = totalQty
  fire:
    E1  N=1000 distinct generated ObjectIds, Promise.all(fetch ... x-test-user) → count statuses
    E2  autocannon {connections:100|300|500, amount|duration, setupRequest: shared counter → unique x-test-user}
        setupClient: client.on("response", (status, bytes, ms) → own histogram + status counters)
    E3  1 user × 10 concurrent requests (v1, v2)
    E4  run E1-like load, docker stop flashsale-mongo mid-run, restart, reconcile
  wait until all in-flight responses settle
  stats → verify (distinct users == #201, oversold, final stock); v2 → reconcile check
  write raw JSON → results/raw/ ; append summary row → results/eN.csv
```

Harness facts that affect layout (HIGH, autocannon README):
- autocannon reports `p2_5, p50, p75, p90, p97_5, p99...` and **no p95**. SPECS asks for p95, so `lib/histogram.ts` must compute it from the per-response `responseTime` that the Client emits on its `response` event.
- Status counts come from `statusCodeStats` (`non2xx` lumps 409 together with 5xx). Count 201, 409, 5xx and connection errors separately.
- `setupRequest` context is per client. A module-level counter shared across clients works in single-process mode. **Do not use the `workers` option**, because it would break the shared counter.
- Generate user ids in the harness (`ids.ts`: run-prefixed counter → 24-hex ObjectId). `x-test-user` checks only the format, so the harness needs no MongoDB access, and E2 can exceed 1,000 users.

Each CSV row records: date, scenario, mode, run#, connections, totalQty, `maxPoolSize` (read from a stats/health config field, or from harness env), Node version, CPU model, counts, rps, p50/p95, oversold, distinct users.

---

## Scaling Considerations

This is a single-machine coursework system, so the numbers only need to be valid relative to each other.

| Scale | Architecture Adjustments |
|-------|--------------------------|
| E1 (1k concurrent, 100 stock) | Single Node process is fine. Ensure the Mongo pool and undici fetch don't cap concurrency unevenly between modes |
| E2 (100–500 connections, ≥1k stock) | Fix `maxPoolSize` explicitly and identically for V1/V2. No logging on the buy path. Compiled JS (`start:test`) |
| Real production (beyond scope) | Queue-based order writes after Redis reservation, Redis Cluster with `{saleId}` hash tags, multiple API instances (which would require replacing the in-process sale cache with a shared invalidation channel) |

### Scaling Priorities

1. **First bottleneck:** the MongoDB `orders` insert on every successful purchase, which affects V1 and V2 equally, plus the Docker Desktop network hop. This is why V2's advantage shows mostly in the sold-out phase.
2. **Second bottleneck:** the single Node event loop (JSON parsing, JWT verify). Test mode removes JWT verify, and this must be stated with the results.

---

## Anti-Patterns

### Anti-Pattern 1: Mode-specific pre-checks or caching
**What people do:** Cache the sale only in V2, or let V0/V1 re-read the full sale document while V2 uses the cache.
**Why it's wrong:** The comparison then measures cache vs no cache, not Redis vs MongoDB atomicity.
**Do this instead:** One pipeline, one cache, one `createOrder`. Handlers differ only in the inventory step.

### Anti-Pattern 2: Throwing `HttpError` from inside handlers with per-handler messages
**What people do:** Each version throws its own status and message.
**Why it's wrong:** The codes drift (e.g. V2 returns 400 for duplicates and V1 returns 409), which breaks uniformity and the E2 counters.
**Do this instead:** Handlers return a `BuyResult`, and the controller has one `STATUS`/`MESSAGE` table.

### Anti-Pattern 3: V0 "fixed" by overwrite
**What people do:** `remainingQty = read - 1`.
**Why it's wrong:** Updates are lost instead of overselling. The stock never goes negative, and the demonstration fails (SPECS section 8).
**Do this instead:** Separate `findOne`, then `$inc: -qty`.

### Anti-Pattern 4: Seeding while the server runs, without re-creating indexes
**What people do:** `dropDatabase()` and then insert documents.
**Why it's wrong:** The unique `(saleId, userId)` index disappears and Mongoose `autoIndex` in the already-running server won't rebuild it. V1 then allows duplicate buys and E3 silently fails.
**Do this instead:** `await Promise.all(allModels.map(m => m.createIndexes()))` in seed. `server.ts` also awaits `Model.init()` before `listen`.

### Anti-Pattern 5: Logging or compensation that masks the original error
**What people do:** `await StockMovement.create(...)` inside the catch block, then throw whatever that call throws.
**Why it's wrong:** In E4 (Mongo down) the log write fails, the Redis compensation may be skipped, and the client sees the wrong error.
**Do this instead:** Compensate the inventory store first, log best-effort with `.catch`, and rethrow the original error.

### Anti-Pattern 6: Resetting via CLI between measured runs
**What people do:** `npm run reset` while `start:test` is running.
**Why it's wrong:** The in-process sale cache keeps stale `startAt`/`endAt`/`status` values, so requests get 400 or are judged against an old window.
**Do this instead:** The harness uses the admin HTTP reset. The CLI warns about this.

### Anti-Pattern 7: Auto-healing Redis on boot
**What people do:** Preload `stock:<id>` on startup if it is missing.
**Why it's wrong:** It hides the 503 path and the risk the report must discuss (Redis data loss with AOF everysec).
**Do this instead:** Explicit `reconcile --fix`.

---

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| MongoDB 7 (Docker, 127.0.0.1:27018) | Mongoose 9, one connection, explicit `maxPoolSize`, short `serverSelectionTimeoutMS` for fail-fast boot | **Never 27017** (Windows MongoDB service). Put the URI default in `.env.example` only. Mongoose 9: async pre hooks (no `next`), `FilterQuery` renamed `QueryFilter`, `returnDocument` replaces `new` |
| Redis 7 (Docker, 127.0.0.1:6379, AOF everysec) | ioredis 6 singleton, `defineCommand`, `multi()` for reset and compensation | ioredis 6 = RESP3 by default, Node ≥20. Consider `enableOfflineQueue: false` after the initial connect so V2 fails fast if Redis dies (MEDIUM) |
| Docker CLI (scripts, E4) | `docker compose up -d --wait`, `docker exec flashsale-mongo mongosh ...`, `docker stop/start flashsale-mongo` | Container names are fixed in compose (`container_name`) because scripts and E4 depend on them |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| controllers ↔ services | Direct calls; services return data or result unions, controllers own HTTP | Services never see `req`/`res` |
| services ↔ stores | Mongoose models + ioredis singleton | Redis key names only via `stockKey()`/`buyersKey()` (no `{}`) |
| admin route ↔ CLI scripts | Both call `saleAdmin.service` / `reconcile.service` | The CLI cannot invalidate the server cache (process boundary) |
| loadtest ↔ backend | HTTP only | Needs: test mode, admin credentials from seed, stats endpoint, reset endpoint (with optional `mode`) |
| frontend ↔ backend | `/api` via Vite proxy | Buy uses `sale.mode`; error messages come from the server's `message` |
| frontend ↔ E2 results | Build-time `?raw` import of `loadtest/results/e2.csv`, or a copy into `frontend/public/` | A raw import from outside the Vite root may need `server.fs.allow` (MEDIUM). Decide in the chart phase |
| dev scripts ↔ app | `npm run dev` processes, `GET /api/health`, `npm run seed`, `.env.example` | Scripts depend on these 4 contracts. Build them after these exist |

---

## Suggested Build Order (dependency-driven)

Each step lists what it depends on. Steps marked **∥** can run in parallel with the step before them.

1. **Infra and backend skeleton.** Compose (container names, 127.0.0.1 binds, AOF), `.gitattributes`/`.gitignore`, backend package with build-copies-lua, `config/*`, `HttpError` + `errorHandler`, `app.ts`/`server.ts` fail-fast bootstrap, `GET /health`. *Depends on: nothing. Everything else depends on it.*
2. **Data layer and seed/reset.** All 5 models + indexes, `stock.service` (keys, `preloadRedis`), `saleAdmin.resetSale` (without cache invalidation yet), `scripts/seed.ts` (`--qty`, `createIndexes`), `scripts/reset.ts`. *Depends on 1. Seeded data is needed by every later step.*
3. **Auth.** register/login, `requireAuth` with test mode, `requireAdmin`. *Depends on 2 (User model, seeded admin).*
4. **Read APIs + sale cache.** products, `sales/active`, `sales/:id` with `getRemaining` by mode, `saleCache` with `invalidate` wired into `resetSale`. *Depends on 2. Its contract unblocks the frontend.*
5. **Buy pipeline: V0, then V1.** Shared checks, `BuyResult` → status table, `createOrder`, V0, V1 with compensation. Admin reset endpoint + **stats endpoint** (the harness needs them). *Depends on 3 and 4.* Getting V0 working early lets oversell be demonstrated as soon as possible.
6. **V2.** `buy.lua`, `defineCommand` at boot, `runBuyScript`, V2 compensation via `multi()`, 503 path. `scripts/reconcile.ts` (+ `--fix`). *Depends on 5 (pipeline) and 2 (preload).*
7. **Load-test harness core + E1 + E3.** `loadtest/lib`, admin HTTP reset/stats, id generator, CSV writer, E1 (5 runs × 3 modes), E3. *Depends on 5 and 6. This proves Core Value, so do it before any polish.*
8. **E2 performance.** autocannon with shared counter + own histogram (p95), in-stock vs sold-out phases, 100/300/500 connections, CSV. *Depends on 7 (harness lib).*
9. **Frontend ∥ (may start after 4, finish after 6).** api.ts, auth pages, Home, Sale (countdown, polling, buy by `sale.mode`), Orders (`/orders/me`, which can be added in step 5), Admin monitor, then the E2 chart (after 8).
10. **Dev start/stop scripts ∥ (after 1–4 and the frontend skeleton exist).** Depend on `npm run dev` in both packages, `/api/health`, `npm run seed`, `.env.example`. Windows test matrix from SPECS section 12; macOS `bash -n` at minimum.
11. **E4 (optional, first to cut).** Depends on 6 + 7 + compensation robustness (best-effort logging, fast Mongo failure).
12. **Docs.** README from scratch, results analysis answering the 3 SPECS questions with E1–E4 numbers. Depends on 7, 8 (and 11).

**Critical path to the code freeze (6/12/2026):** 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8. The frontend (9) and the dev scripts (10) are the parallel tracks. When time runs short, the cut order in SPECS section 3 maps to steps 11 → the chart part of 9 → the admin page in 9 → the polling in 9.

---

## Sources

- docs/SPECS.md and .planning/PROJECT.md (authoritative project requirements): HIGH
- Mongoose "Migrating from 8.x to 9.x" (https://mongoosejs.com/docs/migrating_to_9.html): `new`/`returnOriginal` deprecated in 9.2 in favor of `returnDocument`; async pre hooks; `QueryFilter`; update pipelines throw: HIGH
- ioredis GitHub releases (https://github.com/redis/ioredis/releases): v6.0.0 requires Node 20 and defaults to RESP3: HIGH
- ioredis README (https://github.com/redis/ioredis/blob/main/README.md): `defineCommand`, `scripts` constructor option, custom commands in pipelines/transactions: HIGH. Exact TS augmentation shape for v6 not shown: MEDIUM/LOW
- autocannon README (https://github.com/mcollina/autocannon/blob/master/README.md): percentile set without p95, `statusCodeStats`, `setupRequest` per-client context, Client `response` event, `amount`: HIGH
- Express 5 behavior (async errors, `listen` error in callback, `req.query` as getter, simple query parser producing arrays for repeated keys): from SPECS + general knowledge, MEDIUM
- Node `--env-file` for `start:test`: general knowledge, MEDIUM (verify on Node 20.19 and 24)

---
*Architecture research for: flash-sale oversell prevention (Redis + MongoDB)*
*Researched: 2026-11-03*
