# Pitfalls Research

**Domain:** Flash-sale web app that prevents overselling (Redis + Lua vs MongoDB atomic update vs a deliberately naive version), plus load-test experiments and a written analysis for a university NoSQL course
**Researched:** 2026-11-03
**Confidence:** HIGH for correctness and benchmark-methodology pitfalls (they follow from how the code works and from official docs). MEDIUM for Windows/macOS scripting details: some were confirmed from issues and Q&A, and some are inferred from platform behavior. Every item marked NEW below is something `docs/SPECS.md` does not already cover.

> **How to read this file.** SPECS sections 8, 10, 11 and 12 already list many pitfalls. Each one below is tagged:
> - **[SPECS ✓]**: in SPECS and confirmed correct by this research.
> - **[SPECS + detail]**: in SPECS, with an extra failure mode this research adds.
> - **[NEW]**: not in SPECS.
>
> Phase names follow the dependency order that the roadmap will most likely use (the roadmap does not exist yet):
> **P-Infra** (compose, config, server boot, error middleware) → **P-Data** (models, indexes, seed, reset) → **P-Auth** → **P-Buy** (shared checks, V0/V1/V2, reconcile, stats) → **P-Web** (frontend) → **P-Exp** (E1–E4 harnesses, CSV) → **P-Report** (charts, analysis docs, README) → **P-DevScripts** (start/stop .ps1/.sh). P-DevScripts can run in parallel with P-Web or P-Exp.

---

## Critical Pitfalls

### Pitfall 1: V0 is written "naive" but does not actually oversell in E1

**What goes wrong:**
E1 is supposed to show V0 overselling. It shows exactly 100 orders, or only a marginal overshoot that looks like noise, so the core claim of the project has no evidence.

**Why it happens (several independent causes):**
1. **Lost-update form instead of `$inc` [SPECS ✓].** Writing `remainingQty = read - 1` with `$set` loses updates. Stock ends at 0 or a small positive number and never goes negative. Orders still exceed `totalQty`, but the demo looks like it "worked". SPECS correctly requires read, then `$inc: -qty`.
2. **Unique index plus repeated users [SPECS ✓].** If the load generator reuses users, `(saleId, userId)` rejects most inserts and V0 cannot create more than one order per user. See Pitfall 2.
3. **The shared pre-check reads `remainingQty` [NEW].** If step 4 of the shared checks ("sale exists, is active") loads the full sale document and also rejects with 409 when `remainingQty <= 0`, the check still races, so V0 still oversells, but less. The pre-check also changes V1 and V2 timing. **Keep the shared pre-check to static fields only** (status, window). Do not read stock there.
4. **`remainingQty` is served from the in-memory sale cache [NEW].** The cache must hold only `salePrice, productId, startAt, endAt, status`. If someone "optimizes" by adding `remainingQty` to the cache, V0 reads a stale value and the result depends on cache timing.
5. **Requests are not actually concurrent [NEW].** An E1 script that `await`s in a `for` loop, or chunks requests in small batches, serializes the read-then-write window and the oversell disappears. E1 must build all 1,000 promises first and then `Promise.all` them.
6. **The server is not in test mode [NEW].** If the backend was started with `npm run dev`/`npm start` instead of `npm run start:test`, `x-test-user` is ignored and every request returns 401. V0 then shows 0 orders, and V1/V2 "never oversell" trivially. This is a silent false pass.

**How to avoid:**
- V0 = `findOne` (lean) → `if (remainingQty >= qty)` → `updateOne({_id}, {$inc: {remainingQty: -qty}})` → shared `createOrder`. No `$set`, no cache for stock, no stock check in the shared pre-check.
- The E1 script asserts **before reporting**: `count(201) > totalQty` for V0 (or prints "V0 did NOT oversell, run invalid"), `count(401) == 0`, `distinctUsersInOrders == ordersCount`, and the number of distinct user ids sent equals the number of requests.
- Compute overselling as `orders - totalQty` from the `orders` collection, not from `remainingQty` **[SPECS ✓]**. If duplicate users slip in, V0 decrements stock and then fails the insert with E11000 without restoring it, so `remainingQty` overstates the oversell.

**Warning signs:** V0 E1 run with exactly `totalQty` successes; any 401 in E1; V0 final `remainingQty` equal to 0 instead of negative; E1 wall-clock time roughly equal to N × single-request latency, which means the requests ran serially.

**Phase to address:** P-Buy (V0 implementation, shared pre-check scope, cache contents); P-Exp (E1 self-assertions).

---

### Pitfall 2: The load generator's user distribution invalidates both E1 and E2

**What goes wrong:**
- **E1 [SPECS ✓]:** autocannon's `requests` array is looped **per connection**. Each client walks the array in order and restarts from entry 0 when `setupRequest` returns falsy. N connections therefore replay the same leading users. This matches the earlier measurement in SPECS: 4 connections and 12 requests reached only 3 users. The unique index then blocks most V0 inserts.
- **E2 [NEW, more subtle]:** if E2 reuses users, most requests take the **"already bought" path**, and that path costs very different amounts in each version:
  - V1: `findOneAndUpdate` (stock −1) → `insert` fails E11000 → compensating `$inc +1`. That is **three Mongo round trips** plus an exception.
  - V2: Lua `SISMEMBER` returns −1. That is **one Redis round trip and zero Mongo work**.
  The reported "V2 is Nx faster" then measures duplicate rejection, not purchasing. V1's compensation churn also makes `remainingQty` oscillate.
- **`workers` option [SPECS ✓]:** every worker has its own counter in `setupRequest`, so the same id sequence is generated in each worker. `setupRequest` must also be an absolute module path when `workers` is used.

**How to avoid:**
- E1: use the dedicated Node script (`fetch` + `Promise.all`) as SPECS decides, with one unique user per request.
- E2: autocannon with **one** process (no `workers`). Make one `requests` entry whose `setupRequest` takes the next id from a **module-level counter** shared by all connections and sets the `x-test-user` header from a pre-generated array of unique 24-hex ids. Set `amount` to the exact request count when measuring the in-stock phase.
- Every harness prints and asserts: requests sent, distinct user ids sent, distinct `userId` in `orders`, and counts of 201, 409-sold-out and 409-already-bought kept separate. The 409 response needs a machine-readable `code` field (for example `SOLD_OUT` / `ALREADY_BOUGHT`) so the harness can count the two cases without parsing the Vietnamese message.

**Warning signs:** "already bought" count > 0 in an E1/E2 run that was not meant to test duplicates; distinct users in orders < successes; a V1–V2 gap that is far larger than expected (more than about 3x on the in-stock phase should be investigated).

**Phase to address:** P-Buy (distinct 409 codes); P-Exp (harness design and self-checks).

---

### Pitfall 3: The `(saleId, userId)` unique index is silently missing

**What goes wrong [NEW]:** E3 (one user, 10 concurrent requests) produces 2–10 orders for that user under V1, or V2 after compensation. V1/V2 look broken although the code is correct.

**Why it happens:**
- Mongoose builds indexes with `autoIndex` asynchronously after the model is compiled and connected. A seed script that drops the database and immediately bulk-inserts, or a server that takes traffic right after start, can run before the index exists.
- **Running `npm run seed` while the backend is already running** drops the `flashsale` database, which drops the indexes too. The server's models do not rebuild indexes until the server restarts, so every test after that runs without the unique index. This is the most likely way it happens in this project.
- The index is declared on the wrong fields or in the wrong order, or a duplicate order already existed when the index was created, so the build fails. Under `autoIndex` that failure is only an `'error'`/`'index'` event, not a thrown error.

**How to avoid:**
- In `seed`, after `dropDatabase`, run `await Promise.all(models.map(m => m.syncIndexes()))` (or `createIndexes()`) **before** inserting data.
- In the server, `await Order.init()` (or `syncIndexes`) before `listen`. That way the server fails fast if the index cannot be built.
- The stats endpoint, or a check script, should read `Order.collection.indexes()` and assert that the unique `saleId_1_userId_1` index exists. E1/E3 harnesses call that check before running.
- Dev-script and README rule: seed only while the backend is stopped (`start -Seed` already runs seed before starting the server), or restart the backend after a manual seed.

**Warning signs:** `distinct userId in orders < orders count`; E3 user has more than 1 order; `db.orders.getIndexes()` in `docker exec flashsale-mongo mongosh` shows only `_id_`.

**Phase to address:** P-Data (seed, model `init`); P-Exp (pre-run index assertion); P-DevScripts (`-Seed` ordering).

---

### Pitfall 4: V1 leaks stock, or over-restores it, around the order insert

**What goes wrong:**
- **Leak [SPECS ✓]:** the decrement succeeds, then `Order.create` throws (E11000, validation, network). Without `$inc: +qty` the unit is gone: undersell, and E3 shows `remaining = totalQty − 10` instead of `− 1`.
- **Unawaited compensation [NEW]:** the compensating `$inc` is fire-and-forget (`.catch(() => {})` without `await`). The 409 reaches the client before stock is restored. The E3 harness reads stats right after the last response and sees a temporary leak, and under E4 the compensation may never run.
- **Over-restore on an ambiguous error [NEW]:** if the insert actually committed but the driver reported a network or timeout error (likely during E4), compensating with `+qty` restores a unit that was sold. That can produce **one oversell per ambiguous failure**, which contradicts the "V1 never oversells" claim.
- **Mongoose `findOneAndUpdate` option drift [NEW]:** Mongoose 9.2+ deprecates `new`/`returnOriginal` and prints a warning at runtime (in the hot path). Use `returnDocument: 'after'` or simply check `!== null`. Pre- or post-image does not matter for the null test.

**How to avoid:**
- Structure: `const dec = await Sale.findOneAndUpdate({_id, remainingQty: {$gte: qty}}, {$inc: {remainingQty: -qty}}, {projection: {_id: 1}, lean: true})` → `if (!dec) throw 409 SOLD_OUT` → `try { await createOrder() } catch (e) { await Sale.updateOne({_id}, {$inc: {remainingQty: qty}}); log stock_movement best-effort; rethrow mapped }`.
- On non-E11000 errors, check before compensating: `Order.exists({saleId, userId})`. If the order exists, do not restore. This is cheap because it only runs on the error path, and it closes the over-restore hole. Note it in the analysis document as the general idempotency lesson.
- Use one shared `createOrder()` for V0/V1/V2 so the insert cost is identical (fairness, see Pitfall 7).

**Warning signs:** after E3, `remainingQty ≠ totalQty − 1`; after E4, `orders > totalQty − remainingQty` (over-restore) or `<` (leak); Mongoose deprecation warnings in the log during a benchmark.

**Phase to address:** P-Buy (V1); P-Exp (E3 checks after all responses settle, E4).

---

### Pitfall 5: V2 Redis state is not what the Lua script assumes

**What goes wrong / why:**
- **Stock key not loaded → 503 [SPECS ✓].** `seed` and `reset` must both write `stock:<saleId>`. Additional triggers [NEW]: a `FLUSHALL`/`FLUSHDB` run by hand or by seed **after** the stock was loaded; a TTL set on the key (do **not** use `EX` on `stock:*`); Redis restarted without a persistent volume or without AOF actually enabled, so after `docker compose stop/start` the key is gone; `REDIS_URL` pointing at a different DB index (`/1`) in the seed than in the server.
- **Compensation only runs while Node is alive [SPECS ✓].** A crash between Lua and the insert loses a unit (undersell, never oversell). Only the reconcile script fixes it. The analysis document must say this explicitly.
- **Mixing modes on one sale [SPECS ✓].** V0/V1 decrement Mongo, V2 decrements Redis, so a 100-unit sale can sell 200. Also [NEW]: the UI/`GET /sales/:id` reads `remaining` according to `sale.mode`, while the load scripts use `?mode=`. Running E1 with `?mode=v0` on a sale whose `mode=v2` makes the UI counter stay at 100 while V0 oversells. The demo looks wrong. Either the harness sets `sale.mode` through the reset endpoint (for example `POST /admin/sales/:id/reset { mode }`), or the admin page always shows both counters. Record this as a decision.
- **Redis Cluster key tags [SPECS ✓, out of scope].** The script touches 2 keys, so in a Cluster they must share a hash tag (`stock:{id}`, `buyers:{id}`) or the script fails with `CROSSSLOT`. SPECS mandates standalone and no `{}`. Mention it in the report as a scaling limitation. Also always pass keys through `KEYS[]`, never build them inside Lua.
- **Non-canonical user ids in the Set [NEW].** `buyers:<saleId>` compares strings. `x-test-user: 64AB...` (uppercase) and `64ab...` are different Set members but the same ObjectId in Mongo. Redis lets the second request through, Mongo rejects it with E11000, and compensation runs. It is not incorrect, but E3 counts become confusing and reconcile reports Set mismatches. Normalize with `new Types.ObjectId(id).toHexString()` everywhere the id enters (JWT `sub`, `x-test-user`).
- **Compensation that also writes Mongo [NEW, E4].** If the compensation path writes `stock_movements` to Mongo **before** the Redis `multi()`, then when Mongo is down (exactly the E4 scenario) that write throws and the Redis restore never runs. Order: **Redis `multi()` first**, then `stock_movements` best-effort in its own try/catch.
- **ioredis 6 protocol change [NEW].** ioredis 6.0.0 (2026-07-31) defaults to **RESP3** and requires Node 20+. Integer Lua replies are unaffected (scripts reply in RESP2 unless they call `redis.setresp(3)`), and SPECS reports that `defineCommand` works. Still, add a smoke test that asserts `typeof result === 'number'` for each of `1, 0, -1, -2`. If anything is off, set `protocol: 2` and document why.

**How to avoid:** a reconcile script plus a stats endpoint that report Redis vs Mongo for every V2 run (SPECS ✓). Health returns 503 if Redis is not `ready`. Reset uses `multi()` for SET + DEL. A unit test for the four Lua return codes, run against the real container.

**Warning signs:** any 503 during V2 runs; reconcile shows `stock ≠ totalQty − orders`; `SCARD buyers:<id> ≠ orders count`; `CONFIG GET appendonly` returns `no`.

**Phase to address:** P-Infra (AOF and volume in compose), P-Data (seed/reset load Redis), P-Buy (V2, normalization, compensation order), P-Exp (reconcile after each V2 run, E4).

---

### Pitfall 6: The sale cache cannot be cleared by a reset that runs in another process

**What goes wrong [NEW]:** SPECS says reset should "clear the in-memory sale cache". But `npm run reset` is a **separate Node process** and cannot touch the API server's memory. After a CLI reset, the server keeps a cached `startAt/endAt/status` (for example `ended`, or an old window), so buys get 400 "sale not open" or are accepted after the sale should have closed. The same applies to `seed` while the server runs, which creates new sale ids with the old ones still cached.

**How to avoid:**
- Experiment harnesses always reset through `POST /api/admin/sales/:id/reset`, which clears the cache in-process, using an admin JWT obtained by logging in at harness start.
- The CLI `reset` script prints a warning such as "restart the backend or use the admin API to clear the cache". Alternatively the cache entry carries a short TTL (for example 5 s) or a `version` field compared on read. Pick one and record it.
- Pre-run assertion in harnesses: `GET /api/admin/sales/:id/stats` shows `mongoRemaining == totalQty`, `redisStock == totalQty`, `orders == 0`.

**Warning signs:** 400 responses right after a reset; the UI countdown shows the old `endAt`.

**Phase to address:** P-Buy (cache design and admin reset); P-Exp (harness uses the API reset).

---

### Pitfall 7: The V1 vs V2 benchmark is unfair, or measures the wrong thing

**What goes wrong:** the reported numbers say more about how the test was set up than about Mongo vs Redis.

**Unfairness sources and fixes:**

| Source | Status | Fix |
|---|---|---|
| Only V2 caches sale metadata | SPECS ✓ | One shared cache used by V0/V1/V2 |
| Logging (morgan or `console.log`) in the buy path | SPECS ✓ | No request logger at all in `start:test`; errors only, and not per 409 |
| Measuring on `tsx`/`npm run dev` | SPECS ✓ | `npm run start:test` runs compiled JS. Assert `process.env.NODE_ENV === 'test'` and print it at boot |
| Unequal or implicit pool sizes | SPECS ✓ | Explicit `maxPoolSize` (driver default is 100). Same value for every run, recorded in the CSV. Note that ioredis is **one multiplexed connection**, not a pool. That asymmetry is inherent and should be stated in the report |
| Counting 409 as errors | SPECS ✓ | Error rate = 5xx + connection errors + timeouts only. Read `statusCodeStats` per code, not `non2xx` |
| Docker Desktop port forwarding on the same machine | SPECS ✓ | Relative comparison only; report the machine spec. Each Mongo/Redis round trip crosses the Docker Desktop port proxy (WSL2), which **inflates per-round-trip cost**. V1's success path has 2 Mongo round trips and V2's has 1 Redis + 1 Mongo, so the absolute gap will not transfer to a real deployment |
| Different code paths for the order insert or validation | NEW | Shared `createOrder()`; same `.lean()` usage; same pre-check |
| Sold-out phase dominates | SPECS ✓ + detail | With stock 1,000 at a few thousand req/s, almost all requests are 409. V1's 409 costs 1 Mongo round trip and V2's 409 costs 1 Redis round trip, so this compares only "Mongo ping vs Redis ping". Measure the **in-stock phase** with `amount ≤ stock` and unique users. Measure the **sold-out phase** separately and label it as such |
| Duplicate-user path | NEW | See Pitfall 2. Unique ids per request |
| Warm-up | NEW | The first run after boot pays for JIT, pool connection setup (`minPoolSize` defaults to 0) and the WiredTiger cache. Do one discarded warm-up run per version, or set `minPoolSize = maxPoolSize` |
| Ordering drift | NEW | Run all V1 first, then all V2, and thermal throttling or background tasks bias the results. **Interleave**: V1, V2, V1, V2… with a reset before each run |
| Load generator starves the server | NEW | autocannon runs single-threaded on the same CPU. At 500 connections it can become the bottleneck. Record client CPU or keep the connection levels and note this limitation. Do not add `workers` (breaks the counter) |
| Admin page or browser polling during runs | NEW | The `/admin` and `/sales/:id` pages poll every 1–2 s and add load and noise. Close the browser during E2 (keep it for the E1 demo only) |
| Express `NODE_ENV` | NEW (minor) | `test` vs `production` changes little in Express 5 without views, but keep it identical for V1 and V2 |
| JWT verification skipped in test mode | SPECS ✓ | State in the report that the numbers exclude JWT verify cost |

**Warning signs:** high run-to-run variance (more than about 15% on req/s); the first run of each batch is noticeably slower; 5xx or timeouts > 0 at 500 connections, which means the client or server is saturated and that level's latency is not meaningful.

**Phase to address:** P-Buy (shared code, no logging), P-Exp (harness protocol), P-Report (caveats).

---

### Pitfall 8: Reporting metrics autocannon does not produce

**What goes wrong [NEW]:** SPECS asks for **p95**, but autocannon's latency histogram exposes `p2_5, p50, p75, p90, p97_5, p99, p99_9…`. **There is no p95.** Teams then mislabel `p97_5` as p95 or write it in by hand.

**How to avoid:** either (a) report p50/p90/p97.5/p99 and update the wording in the analysis document (recommended, and noted as a deviation from SPECS), or (b) collect per-request latencies with `onResponse`/the `response` event and compute p95 yourself. For E1 (the custom script), record `performance.now()` per request and compute percentiles directly.

**Warning signs:** a CSV column named `p95` filled from `latency.p97_5`.

**Phase to address:** P-Exp; flag to the user as a small SPECS correction.

---

### Pitfall 9: The server talks to the wrong MongoDB or loads the wrong env

**What goes wrong:**
- **Port 27017 [SPECS ✓].** The Windows `MongoDB` service answers on 27017. A default URI (`mongodb://localhost/flashsale`) or a missing `.env` fallback connects to it. Everything "works" against the wrong data, and seed wipes or creates data in the wrong instance.
- **ESM import hoisting [NEW].** With ES modules, every `import` is evaluated before the body of `server.ts`. If `server.ts` calls `dotenv.config()` in its body while `config/index.ts` reads `process.env.MONGODB_URI` at top level, config sees `undefined`. Combined with any default value, the result is a silent connection to 27017. Fix: `import 'dotenv/config'` as the **first import** of the entry file (or `node --env-file`), and make config a function or read lazily. **No fallback defaults** for `MONGODB_URI`, `REDIS_URL` or `JWT_SECRET`.
- **`.env` vs `.env.test` precedence [NEW].** dotenv does not override variables that are already set. If `start:test` uses `node --env-file=.env.test` and the code also calls `dotenv.config()` (loading `.env`), values from `.env.test` win. That is fine, as long as `.env.test` contains **all** required keys, including `JWT_SECRET` (the server refuses to start without it, even in test mode).

**How to avoid:** at boot, print `Mongo: <host:port>/<db>`, `Redis: <host:port>/<db>`, `NODE_ENV`, `maxPoolSize`. In the config module, refuse any `MONGODB_URI` whose port is not 27018 unless an explicit override flag is set (cheap insurance in this environment). The seed script prints the target and the user count after seeding.

**Warning signs:** seed succeeds but `docker exec flashsale-mongo mongosh flashsale --eval "db.users.countDocuments()"` returns 0; the boot banner shows 27017 or `undefined`.

**Phase to address:** P-Infra.

---

### Pitfall 10: The server does not exit cleanly when a dependency is missing (or exits too slowly)

**What goes wrong:**
- **Express 5 `listen` [SPECS ✓, confirmed].** In Express 5 a listen error (EADDRINUSE) is passed as the **first argument of the `app.listen` callback** instead of being thrown as an `'error'` event. A callback that ignores the argument prints "listening on 5000" even though the port belongs to another process. That is the "stale server silently receives requests" scenario from SPECS 12. Fix: `app.listen(PORT, (err) => { if (err) { console.error(...); process.exit(1) } ... })`.
- **Mongo connect waits 30 s [NEW].** `mongoose.connect` fails only after `serverSelectionTimeoutMS` (driver default 30,000 ms). Set about 5,000 ms so "cannot connect to MongoDB" appears quickly. This also matters for `start.ps1`'s 30 s health wait.
- **ioredis never rejects by default [NEW].** ioredis retries forever and queues commands offline. A dead Redis means the server never exits, and buy requests hang instead of returning 503. Use `lazyConnect: true` plus `await redis.connect()` at boot with a bounded `retryStrategy` during startup, and `maxRetriesPerRequest` small (for example 1) at runtime so V2 fails fast with 503. Always attach `redis.on('error', ...)`, otherwise "Unhandled error event" spam fills the log.
- **Mongoose command buffering [NEW, E4].** With Mongo down mid-run, Mongoose buffers model calls (`bufferCommands`, `bufferTimeoutMS` 10 s) and the driver may wait for server selection. Requests hang instead of failing, autocannon times out at 10 s, and compensation completes after the client has given up. For E4 consider `bufferCommands: false` and a short `serverSelectionTimeoutMS`, and use `docker stop` (clean TCP close). Do **not** use `docker pause`: half-open sockets plus the default `socketTimeoutMS: 0` can hang indefinitely.

**How to avoid:** a boot sequence of validate env → connect Mongo (5 s) → `Order.init()` → connect Redis (bounded) → load Lua → listen with error check. Each failure prints one Vietnamese line and runs `process.exit(1)`. Test each one by hand once: Docker stopped, Redis container stopped, port 5000 occupied, `JWT_SECRET` removed.

**Phase to address:** P-Infra; E4 settings in P-Exp.

---

### Pitfall 11: The Lua file cannot be found at runtime

**What goes wrong:**
- **`URL.pathname` [SPECS ✓].** It yields `/C:/D%E1%BB%AF%20li%E1%BB%87u...`, percent-encoded with a leading slash, so `readFileSync` throws ENOENT on this project path. Use `readFileSync(new URL('../lua/buy.lua', import.meta.url), 'utf8')`, or `fileURLToPath`, which decodes correctly.
- **`tsc` does not copy `.lua` [SPECS ✓].** Add a copy step.
- **Wrong output layout [NEW].** If `tsconfig.build.json` lacks `rootDir: "src"`, or `include` also covers `scripts/`, tsc emits `dist/src/services/...` and `dist/scripts/...`, and `../lua/` then resolves to the wrong folder. Pin `rootDir: "src"`, `outDir: "dist"`, and include only `src`. Seed/reset/reconcile run through `tsx`.
- **Non-portable copy command [NEW].** On Windows, npm runs scripts with `cmd.exe`, where `cp -r` does not exist. Use a Node one-liner (`node -e "require('fs').cpSync('src/lua','dist/lua',{recursive:true})"`; `-e` is CommonJS even in a `"type":"module"` package) or a tiny `scripts/copy-lua.mjs`.

**Warning signs:** `npm run dev` works but `npm run start:test` crashes with ENOENT. This is exactly why benchmarks must use the build.

**Phase to address:** P-Infra (build script), P-Buy (loader); verify in P-Exp by running `build` plus `start:test` from a clean `dist/`.

---

### Pitfall 12: Input handling turns bad requests into 500s, or into stock increases

**What goes wrong:**
- `qty = -5` increases stock in V1/V2 [SPECS ✓]. Also `qty: "1"`, `qty: 1.5`, `qty: true`, `qty: [1]`. Require `qty === 1` (strict number equality), and nothing else.
- **Express 5: `req.body` is `undefined`** (not `{}`) when no body was parsed, for example when `Content-Type` is missing [NEW, confirmed]. `const { qty } = req.body` then throws a TypeError and returns 500 instead of 400. Use `const body = req.body ?? {}`.
- **Malformed JSON** → body-parser raises an error with `type === 'entity.parse.failed'` and status 400. The error middleware must map it to 400 with a Vietnamese message instead of the generic 500 [SPECS ✓, mechanism NEW].
- **Query strings:** `?mode=v1&mode=v2` yields an array. Express 5 defaults to the `simple` query parser (MEDIUM confidence), so `?mode[$ne]=x` no longer becomes an object, but arrays still occur. Check `typeof mode === 'string' && ['v0','v1','v2'].includes(mode)`.
- **Error mapping:** E11000 → check `err.code === 11000` (a `MongoServerError`), not `err.name === 'MongoError'` (old driver name). CastError → `err instanceof mongoose.Error.CastError`. Better still, validate `:id` up front so a CastError never reaches the handler. Mongoose 9 throws on `findOne(null)` [confirmed], so never pass an unvalidated filter.

**Phase to address:** P-Infra (error middleware), P-Buy (shared checks), P-Auth.

---

### Pitfall 13: `x-test-user` / ObjectId validation accepts junk

**What goes wrong [NEW]:** `mongoose.isValidObjectId()` / `ObjectId.isValid()` accept **any 12-character string** (12 bytes), for example `"aaaaaaaaaaaa"`. Such a value passes "valid ObjectId format", gets stored in the Redis Set as-is, and is converted to a different hex form in Mongo. Reconcile then reports a mismatch.

**How to avoid:** validate with `/^[0-9a-fA-F]{24}$/` (or `mongoose.isObjectIdOrHexString`), then normalize to lowercase with `new Types.ObjectId(s).toHexString()`. Apply the same rule to route `:id` params and JWT `sub`. Keep the test-mode branch in **one** place: `if (config.nodeEnv === 'test')`, with a strict equality check against a value read once at boot.

**Phase to address:** P-Auth.

---

### Pitfall 14: Windows PowerShell 5.1 dev scripts work on the author's terminal only

**What goes wrong / how to avoid** (all MEDIUM–HIGH confidence; validate every case on this machine with `powershell.exe`, **not** `pwsh`):

| Pitfall | Status | Prevention |
|---|---|---|
| File saved without a BOM → Vietnamese text garbled, sometimes parse errors | SPECS ✓ + detail | **AI editors and the Write tool save UTF-8 without a BOM.** Add a verification step that checks the first 3 bytes are `EF BB BF` (or keep the script ASCII-only and print Vietnamese from a resource). Also set `[Console]::OutputEncoding = [Text.Encoding]::UTF8` so output renders in a legacy console |
| `&&`, `\|\|`, `??`, ternary | SPECS ✓ | Not in 5.1. Use `if ($LASTEXITCODE -ne 0)` |
| `$ErrorActionPreference = 'Stop'` + `2>&1`/`2>$null` on native tools | NEW | In 5.1, stderr lines from `docker`/`npm` become ErrorRecords and **throw**, even on success (Docker writes progress to stderr). Keep `Continue` around native calls (or wrap in `cmd /c "... 2>&1"`) and decide by `$LASTEXITCODE` |
| Writing `.env` with `>` / `Out-File` / `Set-Content` | NEW | 5.1 `>` writes **UTF-16LE**, which dotenv cannot parse. `-Encoding UTF8` adds a BOM. Use `[IO.File]::WriteAllText($p, $text, (New-Object Text.UTF8Encoding $false))` |
| `Start-Process npm` | NEW | `npm` is `npm.cmd`/`npm.ps1`, so redirected Start-Process (no ShellExecute) may fail. Launch `cmd.exe /c "npm run dev > "".dev\logs\api.log"" 2>&1"` or use the full path to `npm.cmd`. `-RedirectStandardOutput` and `-RedirectStandardError` cannot point to the same file, and `-NoNewWindow` cannot be combined with `-WindowStyle` |
| Process-tree kill | SPECS ✓ + detail | `taskkill /PID <pid> /T /F` only walks **live** parent links. If the `cmd`/`npm` parent already exited, orphaned `node` children are not in the tree. Always follow with the port-based fallback (owning PID via `Get-NetTCPConnection -State Listen -LocalPort 5000` → `Get-CimInstance Win32_Process` → match `CommandLine` against the project path) |
| Stale PID reused by an unrelated process | NEW | Before reporting "already running" or killing, verify the PID's process name is `cmd`/`node` and that its `CommandLine` contains the project root. Otherwise treat the PID file as stale |
| Background processes die when the terminal closes | SPECS ✓ + detail | `Start-Process -WindowStyle Hidden` creates a separate (hidden) console, which survives closing a normal console window. Hosts that put children in a kill-on-close **job object** (some IDE terminals, agent shells) may still kill them (LOW confidence). Test the "close terminal" case from a plain Windows Terminal / `powershell.exe` window, and document the IDE caveat if it occurs |
| `Invoke-WebRequest` in 5.1 | NEW | Without `-UseBasicParsing` it may fail on machines without the IE engine. It **throws** on 503 (health not ready), so wrap it in try/catch inside the wait loop. `curl` is an alias of it in 5.1 |
| Quoting args with embedded `"` to native exes | NEW | 5.1 strips embedded double quotes. `mongosh --eval 'db.users.countDocuments({role:"user"})'` breaks. Keep `--eval "db.users.countDocuments()"` free of inner quotes |
| User count check fails → treated as 0 → **auto-seed wipes data** | NEW, critical | If `docker exec ... countDocuments()` fails (container still starting, warnings in output), **abort**, do not seed. Parse with `[int]::TryParse` on the trimmed last line and seed only when the parse succeeds and the value is exactly 0 |
| `docker compose up -d --wait` returns before Mongo accepts connections | NEW | `--wait` waits for **healthchecks**. Without a healthcheck it only waits for "running". Add healthchecks (`mongosh --quiet --eval "db.adminCommand('ping')"`, `redis-cli ping`) |
| Vietnamese path with spaces | SPECS ✓ | Quote every path. Use `$PSScriptRoot` and `Split-Path -Parent`. Inside `cmd /c` strings, double the quotes. Run the full test matrix in the real project folder |
| `npm ci` while a dev server holds files | NEW | EPERM/EBUSY on Windows. The install step must only run after the "already running" check (SPECS order already ensures this; do not reorder) |
| CRLF/LF | SPECS ✓ | `.gitattributes` must exist **before** the scripts are committed, or run `git add --renormalize .`. Set `+x` with `git update-index --chmod=+x` after the files are added |

**Phase to address:** P-DevScripts.

---

### Pitfall 15: macOS bash 3.2 scripts are "verified" with Git Bash 5 on Windows

**What goes wrong [NEW]:** the only shell available on this machine is Git Bash (bash 5.x). `bash -n` there passes scripts that fail on macOS 3.2. Specific traps:
- `set -u` + an empty array: `"${arr[@]}"` raises **unbound variable** in bash < 4.4. Avoid arrays for optional args, or use `${arr[@]+"${arr[@]}"}`.
- `mapfile`, `declare -A`, `${var,,}`, `|&`, `&>>`, `readarray`, negative array indexes: all bash 4+.
- BSD tools: `sed -i ''` (SPECS ✓), `stat -f %m` vs GNU `stat -c %Y`. For "lockfile newer than install" use the portable test `[ package-lock.json -nt node_modules/.package-lock.json ]`. Other gaps: no `timeout` command (write a polling loop), no `readlink -f` on older macOS (use `cd "$(dirname "$0")/.." && pwd -P`), no `grep -P`, `date` flags differ.
- **Background + job control + stdin [NEW, important].** With `set -m` (needed for a separate process group), bash does **not** redirect a background job's stdin to `/dev/null`. Vite and `tsx watch` check `stdin.isTTY` and read the terminal for shortcuts, and a background process reading the TTY gets **SIGTTIN and is stopped** (state `T`). Health checks then time out. Always launch as `nohup npm run dev </dev/null >"$LOG" 2>&1 &` and record `$!` as both PID and PGID. Stop with `kill -TERM -- -"$PGID"` followed by a short wait and `kill -KILL`.
- `set -e` exits on a non-zero `lsof` (no listener) or `grep` (no match). Append `|| true` where "not found" is a normal outcome.
- `echo -e` portability: use `printf`.

**How to avoid:** a `shellcheck` run (if obtainable) plus a hand checklist of the items above. If no Mac is available, README states "not run on macOS" (SPECS ✓).

**Phase to address:** P-DevScripts.

---

### Pitfall 16: The analysis document overclaims

**What goes wrong:**
- **Absolute numbers [SPECS ✓].** "V2 handles 8,000 req/s" is a property of this laptop, Docker Desktop and the WSL2 port proxy. Report **ratios and directions** with the machine spec.
- **Too few repetitions [SPECS ✓ + detail].** 5 runs is the minimum. Report **median and min–max (or stddev)** per configuration, not the mean of 5 with no spread. If the V1–V2 ranges overlap, say "no significant difference at this level". SPECS explicitly accepts a small gap as a valid result.
- **Conflating phases [NEW].** A headline ratio computed over a run that is mostly sold-out 409s compares Redis ping vs Mongo ping, not purchasing.
- **"Proven never oversells" [NEW].** 5×1,000 requests with 0 oversell is **evidence**. The proof is the atomicity argument: the conditional `$inc` in one document, and Lua running atomically in single-threaded Redis. Present both.
- **Durability wording [NEW].** Redis docs say `everysec` means "you may lose 1 second of data". Present it as "about 1 second", not as a hard bound. Also note that on Docker Desktop the "disk" is a VM disk, so this setup does not test durability. The undersell window when Node crashes between Lua and insert is a separate risk from AOF loss. Analyze both.
- **Hidden setup facts [NEW].** State: JWT verification skipped (test mode), `maxPoolSize` value, single ioredis connection, same-machine load generator, warm-up policy, p97.5 used instead of p95 (Pitfall 8).
- **CSV locale [NEW].** A vi-VN Windows locale uses a **decimal comma**. Excel opens UTF-8 CSV without a BOM as ANSI (garbled Vietnamese headers) and may misparse `12.5`. Generate CSVs from Node only (always `.`). Use ASCII column names, or write a BOM if the CSV is meant for Excel. Never format numbers through PowerShell `-f`/`ToString()` under the vi-VN culture.

**Phase to address:** P-Exp (CSV format, repetitions), P-Report.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Fallback defaults for `MONGODB_URI`/`REDIS_URL` | Fewer startup errors | Silent connection to the 27017 service | Never |
| Fire-and-forget compensation | Faster 409 | Temporary or permanent stock leaks, flaky E3 | Never |
| Parsing the Vietnamese error message in harnesses | No API change | Breaks when the wording changes | Never. Add a `code` field to 409 bodies |
| Separate insert code per version | Quick to write | Unfair benchmark, triple maintenance | Never |
| Relying on Mongoose `autoIndex` only | Zero code | Missing unique index after seed (Pitfall 3) | Only for non-unique indexes |
| CLI `reset` without cache invalidation | Simple | Stale cache in a running server | Acceptable if it prints a warning and harnesses use the API reset |
| Reporting p97.5 in place of p95 | No custom histogram | Mismatch with SPECS wording | Acceptable if labeled honestly and recorded as a deviation |
| No `Order.exists` check before V1 compensation | Simpler | Possible over-restore during E4 | Acceptable if documented as a known limitation in the analysis |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Mongoose model names | `model('FlashSale')` → collection `flashsales`; `StockMovement` → `stockmovements` | Set `collection: 'flash_sales'` / `'stock_movements'` in schema options [SPECS ✓] |
| Mongoose 9 middleware | `pre('save', function(next){...})` for password hashing | `next()` was removed in Mongoose 9. Use `async function () {}`. (Better: hash in the service, not in a hook) |
| Mongoose 9 TS types | Using `FilterQuery` | Renamed to `QueryFilter` and stricter. `create()` no longer takes a generic |
| Mongoose `findOneAndUpdate` | `{ new: true }` | Deprecated since 9.2 (prints a warning). Use `returnDocument: 'after'` or a null check |
| Mongo driver pool | Leave `maxPoolSize` implicit (100) | Explicit value, logged at boot and in the CSV [SPECS ✓] |
| ioredis 6 | Assume v5 defaults | RESP3 default; offline queue and infinite retry. Bound retries and attach an `error` listener |
| ioredis `defineCommand` | Assume the script survives a Redis restart | ioredis falls back from EVALSHA to EVAL on NOSCRIPT. Verify once by restarting the Redis container mid-session |
| Redis via Docker | Assume `appendonly yes` because compose says so | Verify `CONFIG GET appendonly` / `appendfsync`; mount a volume for `/data` |
| Vite proxy | Backend bound to `127.0.0.1` while the proxy targets `localhost` (may resolve to `::1`) | Let Express listen without a host (dual-stack), or target `http://127.0.0.1:5000` |
| Node `fetch` in E1 | Assume concurrency is limited | undici opens as many sockets as needed. 1,000 simultaneous connects may hit accept-backlog limits (ECONNRESET). Count client-side failures separately and assert they are 0, or re-run |
| Docker CLI on Windows | `mongosh`/`redis-cli` on the host | Not installed. Use `docker exec flashsale-mongo mongosh ...` / `docker exec flashsale-redis redis-cli ...` [SPECS ✓] |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Pool exhaustion queueing | p97.5 grows linearly with connections while req/s stays flat | Same explicit `maxPoolSize` for V1/V2; report it | Around 300–500 autocannon connections with pool ≤ 100 |
| Request logging in hot path | Lower req/s in both versions, larger variance | No logger in `start:test` | Any load level |
| bcrypt in seed per user | Seed takes minutes (pure-JS bcryptjs) | Hash once, reuse for 1,000 users [SPECS ✓] | 1,000 users |
| bcrypt/JWT in benchmark path | Measures crypto, not inventory | `x-test-user` in test mode [SPECS ✓] | E2 |
| Mongoose document hydration | V0 (`findOne`) slower than necessary | `.lean()` in all hot-path reads | E2 |
| Browser polling during load | Extra GETs, latency noise | Close pages during E2 | Any measured run |
| autocannon on the same CPU | Client-bound results at high connection counts | Note it; check client CPU | 500 connections |
| Compensation storms in V1 duplicate path | V1 looks terrible | Unique users per request | Any test with reused users |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Login filter built from raw body: `findOne({ email: req.body.email })` with `{ "$ne": null }` | Logs in as the first user (NoSQL injection) | `typeof === 'string'` checks on every field [SPECS ✓]; optionally `mongoose.set('sanitizeFilter', true)` |
| Register accepts `role` from body | Self-promotion to admin | Build the user object explicitly: `{ name, email, passwordHash, role: 'user' }` [SPECS ✓] |
| `jwt.verify` without `algorithms` | Algorithm confusion (low risk with HS256 secret, but cheap to prevent) | `jwt.verify(token, secret, { algorithms: ['HS256'] })`, and `jwt.sign(..., { algorithm: 'HS256', expiresIn: '7d' })` |
| Test-mode bypass reachable in non-test runs | Anyone can impersonate any user with a header | Single `config.nodeEnv === 'test'` check; print a loud boot warning when test mode is on; never set `NODE_ENV=test` in `.env` |
| Weak or committed `JWT_SECRET` | Token forgery | ≥ 32 random bytes generated by `start`, never printed; `.env` in `.gitignore`; no default [SPECS ✓] |
| Error middleware leaks stack or driver message | Info disclosure; ugly Vietnamese UX | Generic 500 message; details to the server log only [SPECS ✓] |
| Compose binds `0.0.0.0` | Password-less Mongo/Redis exposed on the LAN | `127.0.0.1:` prefix on every port [SPECS ✓] |
| Email case sensitivity | Duplicate accounts `A@x.com` / `a@x.com` | `lowercase: true, trim: true` on the schema and normalize before lookup [SPECS ✓] |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Buy button not disabled while the request is pending | Double click → second request returns 409 "already bought", shown as an error after a success | Disable on click; treat ALREADY_BOUGHT after own success as informational |
| Same message for sold-out and already-bought | User can't tell why the buy failed | Distinct `code` and Vietnamese text per 409 kind [SPECS ✓] |
| Remaining count read from the wrong store | Counter stuck at 100 during a V2 (or `?mode=` mismatched) run | `remaining` from `sale.mode`; admin page shows both stores (Pitfall 5) |
| React 19 StrictMode double-invokes effects in dev | Two polling intervals, double requests | Clear the interval in the effect cleanup |
| Countdown using the client clock | Wrong countdown if the PC clock is off | Compute an offset from the server time returned in `GET /sales/:id` (optional) |
| 401 after re-seed with an old token | Confusing "not logged in" even though a token exists | On 401, clear the stored token and redirect to `/login` with a message [SPECS notes the re-seed consequence] |

## "Looks Done But Isn't" Checklist

- [ ] **V0:** E1 shows `orders > totalQty` **and** negative `remainingQty` in every one of 5 runs, with 0 × 401.
- [ ] **V1/V2:** exactly `totalQty` orders in **every** run and `distinct userId == orders`.
- [ ] **Unique index:** `getIndexes()` on `orders` shows a unique `{saleId:1, userId:1}` **after** the latest seed, and the server started after the seed.
- [ ] **V2 reconcile:** zero differences after each V2 run (stock and Set membership).
- [ ] **E3:** after all 10 responses have returned, the user has exactly 1 order and stock = `totalQty − 1` in both V1 and V2.
- [ ] **Build:** `rm -rf dist && npm run build && npm run start:test` works from a clean state (Lua copied, `rootDir` correct).
- [ ] **Boot failures:** each of the following produces a single clear message and a non-zero exit within about 10 s: missing `JWT_SECRET`, Docker stopped, Redis stopped, port 5000 in use.
- [ ] **Benchmark config recorded:** CSV rows include date, version, connections, `maxPoolSize`, phase (in-stock or sold-out), node version, machine.
- [ ] **409 split:** harness output separates 201 / 409 SOLD_OUT / 409 ALREADY_BOUGHT / 5xx / connection errors / timeouts.
- [ ] **`.ps1` files:** start with bytes `EF BB BF`, run under `powershell.exe` 5.1, and every SPECS §12 case has been executed in `C:\Dữ liệu của ổ D\...`.
- [ ] **`.sh` files:** LF in the git index (`git ls-files --eol scripts/`), mode `100755` in git, `</dev/null` on background launches.
- [ ] **Auto-seed guard:** start does **not** seed when the user count query fails.
- [ ] **Analysis document:** states JWT skipped, same-machine/Docker Desktop caveat, percentile used, repetitions with spread, and the undersell-on-crash risk.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Benchmarks done on `dev` or with logging | MEDIUM | Delete those CSV rows, fix, re-run the full matrix (time-box about 1 hour) |
| Missing unique index discovered after experiments | MEDIUM | Restart server (rebuilds the index), re-run E1/E3; previous V1/V2 results are invalid |
| Redis/Mongo desync after a V2 run | LOW | Run reconcile with the fix option (Redis := Mongo), or API reset |
| Seed hit the 27017 service | MEDIUM | Do not touch the service DB further; tell the user (it is their service); fix URI; re-seed 27018 |
| PID files out of sync, ports held | LOW | `stop` port-fallback path; as a last resort, find owning PID and kill only if `CommandLine` contains the project path |
| `.sh` committed with CRLF | LOW | Add `.gitattributes`, `git add --renormalize .`, commit |
| Over-restore in V1 during E4 | LOW | Reconcile Mongo `remainingQty = totalQty − successful orders` and document the case in the analysis |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 9 Wrong Mongo / env hoisting | P-Infra | Boot banner shows 27018; seed count visible via `docker exec` |
| 10 Startup failure handling (Express 5 listen, timeouts, ioredis retries) | P-Infra | Manual 4-case boot test |
| 11 Lua path/build layout | P-Infra (build) + P-Buy | Clean build + `start:test` + one V2 buy |
| 12 Input validation / Express 5 body / error mapping | P-Infra + P-Buy | Request matrix: qty −5, "1", 1.5; no body; broken JSON; bad id; repeated `mode` |
| 3 Unique index missing | P-Data | `getIndexes()` assertion in seed and harness |
| 6 Cache invalidation across processes | P-Buy | Reset via CLI then buy → warning or correct behavior; harness uses API reset |
| 13 ObjectId validation/normalization | P-Auth | `x-test-user: aaaaaaaaaaaa` → 401; uppercase hex normalized |
| Security table (NoSQL injection, role, JWT alg) | P-Auth | `{"email":{"$ne":null}}` → 400; `role:"admin"` ignored |
| 1 V0 doesn't oversell | P-Buy + P-Exp | E1 V0 assertions pass in 5/5 runs |
| 4 V1 leak / over-restore | P-Buy | E3 + forced insert failure test |
| 5 V2 Redis state, compensation order, RESP3 | P-Infra (AOF) + P-Data + P-Buy | Lua return-code smoke test; reconcile clean; E4 |
| 2 User distribution | P-Exp | Harness prints distinct-user assertions |
| 7 Unfair benchmark | P-Buy (shared code) + P-Exp | Checklist in harness README; config columns in CSV |
| 8 No p95 in autocannon | P-Exp | CSV column names match what was measured |
| UX table | P-Web | Manual double-click and polling cleanup check |
| 14 PowerShell 5.1 | P-DevScripts | All SPECS §12 cases on `powershell.exe` in the real path; BOM byte check |
| 15 bash 3.2 | P-DevScripts | `bash -n` + checklist + README note if no Mac |
| 16 Overclaiming / CSV locale | P-Report | Review the analysis document against the checklist above |

## Sources

- `docs/SPECS.md` §§6–13 and `.planning/PROJECT.md` (project's own validated findings: autocannon user reuse, `defineCommand` with ioredis 6, URL.pathname ENOENT): HIGH
- Express 5 `app.listen` passes errors to the callback: expressjs/express issue #6191 and the migrating-5 doc PR, https://github.com/expressjs/express/issues/6191: MEDIUM-HIGH (maintainer-confirmed)
- Express 5 `req.body` undefined without a parser: multiple migration guides (https://dev.to/ujjwal_kr_gupta/express-5-is-here-whats-new-4lfk, https://mcp.depscope.dev/breaking/npm/express): MEDIUM. `simple` query-parser default: from memory of the Express 5 changelog, MEDIUM
- autocannon README (percentile keys without p95, `statusCodeStats`, `requests`/`setupRequest` per-client semantics, `workers` caveats, `amount`): https://github.com/mcollina/autocannon: HIGH
- Mongoose 8→9 migration guide (pre-middleware `next()` removed, `new`/`returnOriginal` deprecated in 9.2, `findOne(null)` throws, `QueryFilter` rename, Node ≥ 20.19): https://mongoosejs.com/docs/migrating_to_9.html: HIGH
- ioredis v6.0.0 release notes (RESP3 default, Node 20+, `protocol: 2` escape hatch): https://github.com/redis/ioredis/releases/tag/v6.0.0: HIGH
- Redis persistence docs (`everysec`: "you may lose 1 second of data"; multi-part AOF since 7.0): https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/: HIGH
- `isValidObjectId` accepts 12-char strings: Mongoose issues (https://github.com/Automattic/mongoose/issues/1959, https://github.com/Automattic/mongoose/issues/6742): MEDIUM
- PowerShell 5.1 native stderr + `ErrorActionPreference Stop`: PowerShell RFC discussions (https://github.com/PowerShell/PowerShell-RFC/pull/277) and Stack Overflow Q66652516: MEDIUM
- Start-Process redirect limitations: Microsoft Start-Process docs (https://learn.microsoft.com/en-us/previous-versions/powershell/module/Microsoft.PowerShell.Management/Start-Process?view=powershell-5.0): MEDIUM. `npm.cmd` handling and job-object behavior: inference, LOW-MEDIUM
- bash background stdin under job control / SIGTTIN: POSIX/bash behavior discussions (https://blog.sanctum.geek.nz/?p=222, bug-bash archive): MEDIUM. Vite/tsx reading stdin when TTY: inference, MEDIUM
- Mongoose pluralization and the `collection` option: Mongoose utils source and answers: HIGH
- Docker Desktop port-proxy latency, undici unlimited connections, Mongo driver defaults (`maxPoolSize` 100, `serverSelectionTimeoutMS` 30 s, `minPoolSize` 0): well-known defaults, not re-fetched this session: MEDIUM

---
*Pitfalls research for: flash-sale oversell prevention with Redis + MongoDB and load-test experiments*
*Researched: 2026-11-03*
