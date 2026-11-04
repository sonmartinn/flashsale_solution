---
phase: 01-foundation-infra-data-auth
verified: 2026-11-04T12:55:00Z
status: gaps_found
score: 40/46 must-haves verified
covered_files:
  - .planning/phases/01-foundation-infra-data-auth/01-01-PLAN.md
  - .planning/phases/01-foundation-infra-data-auth/01-01-SUMMARY.md
  - .planning/phases/01-foundation-infra-data-auth/01-02-PLAN.md
  - .planning/phases/01-foundation-infra-data-auth/01-02-SUMMARY.md
  - .planning/phases/01-foundation-infra-data-auth/01-03-PLAN.md
  - .planning/phases/01-foundation-infra-data-auth/01-03-SUMMARY.md
  - .planning/phases/01-foundation-infra-data-auth/01-04-PLAN.md
  - .planning/phases/01-foundation-infra-data-auth/01-04-SUMMARY.md
  - backend/.env.example
  - backend/package-lock.json
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
covered_digest: "v4:sha256:a63b69d8b204439b31d3afee3f0eaf62eb88380c885e74ada4456c1ff3b6e7d2"
behavior_unverified: 0
overrides_applied: 0
gaps:
  - truth: "Only when cfg.isTestMode is true (NODE_ENV exactly \"test\", computed once in config/env.ts) does a present x-test-user header win (01-04); prohibition: x-test-user MUST NOT be honored unless NODE_ENV is exactly \"test\" (AUTH-05); ROADMAP SC5 'accepted only when NODE_ENV === \"test\"'"
    status: partial
    reason: "isTestMode is computed from the TRIMMED value of NODE_ENV (optionalVar trims), so NODE_ENV values 'test ', ' test' and 'test\\t' all switch on the x-test-user auth bypass. Reproduced: loadBaseConfig({..., NODE_ENV: 'test '}).isTestMode === true. Note the cmd.exe idiom `set NODE_ENV=test && npm start` produces exactly 'test '. Everything else about AUTH-05 holds (single computation site, ObjectId check, lowercase, role always user, admin needs a real token, header ignored outside test mode)."
    artifacts:
      - path: "backend/src/config/env.ts"
        issue: "lines ~121-123: `const nodeEnv = optionalVar(env, \"NODE_ENV\") ?? \"development\"; const isTestMode = nodeEnv === \"test\";` compares the trimmed value, not the raw env value"
      - path: "backend/test/config.test.ts"
        issue: "test 'NODE_ENV=test bật chế độ test, TEST (chữ hoa) thì không' does not cover whitespace-padded values"
    missing:
      - "Compute isTestMode from the raw value: `const isTestMode = env[\"NODE_ENV\"] === \"test\";` (keep the trimmed value only for display/health)"
      - "Add config.test cases asserting isTestMode is false for 'test ', ' test' and 'test\\t'"
deferred:
  - truth: "DATA-04 'xóa cache đợt sale' — reset clears the server's in-process sale cache"
    addressed_in: "Phase 2"
    evidence: "Phase 2 SC4: 'all modes share one order-creation path and one static sale cache that reset clears'. Phase 1 provides the seam: createSaleAdminService({ onSaleReset }) calls the hook exactly once per successful reset (reset.test 'nhận saleId viết hoa và gọi hook với id chữ thường')."
  - truth: "Admin reset over HTTP (POST /api/admin/sales/:id/reset) using the shared reset service"
    addressed_in: "Phase 2"
    evidence: "Phase 2 SC5: 'An admin can reset a sale over HTTP (optionally switching mode) and read stats'"
human_verification:
  - test: "Bad-boot matrix on the real dev setup (deferred end-of-phase check from 01-01 Task 3): (a) blank JWT_SECRET in backend/.env, (b) Docker Desktop stopped, (c) only flashsale-redis stopped, (d) another process holding port 5000 — run `npm run start` from backend/ each time"
    expected: "Each case exits with code 1 and a single Vietnamese `[LỖI] ...` line naming the cause (JWT_SECRET / MongoDB 127.0.0.1:27018/flashsale / Redis 127.0.0.1:6379 / Cổng 5000 đang bị chiếm); no stack trace, secret never printed"
    why_human: "Requires stopping Docker containers / Docker Desktop, which the verifier must not do. Automated equivalents (boot.test, health.test, verifier spot-checks with dead ports) all pass, but the real docker-stop path was not exercised."
  - test: "Health transition: with the backend running, `docker stop flashsale-redis`, GET /api/health, then `docker start flashsale-redis` and GET /api/health again (repeat for flashsale-mongo)"
    expected: "200 { mongo: true, redis: true } -> 503 with redis:false answered in under 3 s -> 200 again after the container is back (ioredis/Mongo driver reconnect without restarting the backend)"
    why_human: "Runtime reconnect behaviour across a real container stop/start is not covered by any test (health.test only uses a Redis client that never connected)."
  - test: "Decide on the empty-JSON-body deviation (01-02 truth: 'an empty, malformed or JSON-primitive body yields 400 INVALID_JSON')"
    expected: "Either accept via override (empty body with content-type JSON is parsed to {} by body-parser 2.x, reaches routing and never yields 500 — needed for body-less POSTs in Phase 2), or require a change"
    why_human: "Plan must-have literal is not met (empty body -> {} -> 404/400 VALIDATION_ERROR, not INVALID_JSON); the executor documented it as intentional. Roadmap SC5 / INFRA-05 do not require it. Needs a project decision."
  - test: "Decide on login with blank strings (01-04 truth lists 'blank strings' among inputs that return 400 for register OR login)"
    expected: "Either accept via override (login with password '' returns 401 INVALID_CREDENTIALS, exactly as the 01-04 plan action and D-12 prescribe), or require 400"
    why_human: "The must-have truth and the plan's own action text contradict each other; the code follows the action text. Register fully meets the truth (blank name/password -> 400)."
  - test: "Backstop truth (01-02): orders index userId_1_createdAt_-1 backs newest-first listing; equal-createdAt order unspecified"
    expected: "Confirm acceptable: index exists (observed in a freshly seeded DB) but no Phase 1 query consumes it; sort stability is owned by Phase 2 READ-04"
    why_human: "verification: backstop — non-inferable; presence of the index is not behavioural evidence"
  - test: "Backstop truth (01-04): requireAdmin holds no shared mutable state, so concurrent admin/user requests cannot leak a role"
    expected: "Confirm acceptable: requireAdmin is a pure closure reading only req.user; executor test 'request admin và user đồng thời không lẫn quyền của nhau' passes"
    why_human: "verification: backstop — the only test is executor-authored, not held-out"
  - test: "Prohibition review (flagged, non-authoritative LLM-judge verdicts): (1) JWT_SECRET never printed; (2) no per-request logging middleware; (3) MongoDB/Redis ports bound to 127.0.0.1 only; (4) seed only FLUSHDB on the configured db, never FLUSHALL; (5) reset CLI always prints the in-process cache warning"
    expected: "All five hold — see Prohibitions table for evidence"
    why_human: "Judgment-tier items need human resolution; items 3-5 are test-tier with no wired automated test (verifier observed them directly), so they fail closed to 'flagged'"
---

# Phase 1: Foundation (Infra, Data, Auth) Verification Report

**Phase Goal:** A developer can bring up MongoDB and Redis, boot a backend that fails fast on bad configuration, seed and reset a fashion flash sale, and authenticate with JWT (or with `x-test-user` in test mode)
**Verified:** 2026-11-04T12:55:00Z
**Status:** gaps_found (one narrow gap; plus human decisions)
**Re-verification:** No — initial verification

## Evidence the verifier produced itself (not from SUMMARY)

- `npm run typecheck` exit 0; `npm test` (includes `npm run build`) 126/126 pass; `npm run test:int` 46/46 pass (run once each, on develop HEAD).
- `dist/server.js` and `dist/lua/buy.lua` present, no `dist/src`.
- `docker ps`: flashsale-mongo `mongo:7.0` (7.0.45) healthy, flashsale-redis `redis:7.4` (7.4.12) healthy. `docker port`: `27017/tcp -> 127.0.0.1:27018`, `6379/tcp -> 127.0.0.1:6379`. `CONFIG GET appendfsync` = `everysec`, `appendonly` = `yes`.
- Compiled server fail-fast (each exit 1 with `[LỖI]` Vietnamese line): blank `JWT_SECRET`, blank/missing `MONGODB_URI`, implicit-27017 URI `mongodb://127.0.0.1/flashsale` (refused before connecting), Redis unreachable (`127.0.0.1:6390`).
- End-to-end CLI run against a scratch DB `flashsale_verify_cli` + Redis db 14 (both removed afterwards):
  - `npm run seed -- --qty 5 --mode v1` exit 0: 1000 users + 1 admin, 1 distinct passwordHash, 6 products with 6 different `attributes` key sets, sale `salePrice 449500`, `totalQty 5`, `remainingQty 5`, `active`, `mode v1`, endAt = startAt + 7 d; Redis `stock:<id>` = 5, `buyers:<id>` absent; collections `flash_sales, orders, products, stock_movements, users`; indexes `email_1(u)`, `slug_1(u)`, `status_1_startAt_1`, `saleId_1_userId_1(u)`, `userId_1_createdAt_-1`, `saleId_1_at_1`.
  - Dirtied the sale (an order, a movement, remainingQty -3, status ended, Redis stock 0, a buyer) then `npm run reset -- --sale <id> --mode v2`: warning printed first, exit 0, remainingQty 5, active, mode v2, new 7-day window, 0 orders, exactly one movement `{delta 5, reason reset, orderId null}`, Redis stock 5, buyers gone. Second `npm run reset` (all sales, no `--mode`) kept mode v2 and still exactly 1 reset movement.
  - Bad args: `reset --mode v9`, `seed --qty 0`, `seed --bogus` all exit 1 with `[LỖI]` + usage line before any connection; reset printed the cache warning first even on the failure path.
- `backend/.env.test`: committed in 7c0aaf0 with 1 added line (`git show --numstat`), and health.test boots with `--env-file=.env.test` and gets `nodeEnv: "test"` + the CHẾ ĐỘ TEST warning. Content not read directly (machine guard).

## Goal Achievement

### Roadmap Success Criteria (contract)

| # | Success Criterion | Status | Evidence |
|---|---|---|---|
| SC1 | Docker brings up Mongo 7 @127.0.0.1:27018 and Redis 7 AOF everysec @127.0.0.1:6379, healthy; health 200 when both up, 503 when either down | ✓ VERIFIED | docker ps/port/CONFIG GET above; health.test 200 (compiled server) and 503 `{mongo:true, redis:false}` < 3 s. Real container stop/start transition -> human item |
| SC2 | Exits with Vietnamese message on missing JWT_SECRET / Mongo or Redis unreachable / port 5000 taken; never 27017; prints maxPoolSize; typecheck + build pass; dist/lua exists | ✓ VERIFIED | server.ts boot sequence; verifier spot-checks; boot.test (JWT, REDIS_URL, 27017, port held, Mongo down); banner test asserts `maxPoolSize=100`, no raw URI, no secret |
| SC3 | `npm run seed` (qty, mode) wipes + creates 1000 users + 1 admin, 6 products with category attributes, 1 active 7-day half-price sale, stock loaded; every §6 index incl. unique (saleId,userId) | ✓ VERIFIED | Verifier CLI run on scratch DB (see above); seed.test |
| SC4 | `npm run reset` (one/all, --mode) restores remainingQty, deletes orders/movements, one checked multi() for stock+buyers, reopens 7 days, warns about in-process cache | ✓ VERIFIED | Verifier CLI run; sale-admin.service.ts checks every `[err]` and `null`; reset.test covers multi error + null exec |
| SC5 | Register (role user, dup 409, non-string 400), login 7-day JWT sub+role, 401/403, x-test-user only when `NODE_ENV === "test"`, §7 error table, 500 never leaks | ✗ PARTIAL | All clauses verified except `NODE_ENV === "test"`: whitespace-padded values also enable the bypass (Gap 1) |

### Plan Must-Have Truths

| # | Truth (abridged) | Status | Evidence |
|---|---|---|---|
| 01-01.1 | compose up healthy, ports 127.0.0.1:27018 / :6379 | ✓ VERIFIED | docker ps / docker port |
| 01-01.2 | appendfsync everysec, appendonly yes | ✓ VERIFIED | CONFIG GET |
| 01-01.3 | typecheck + build exit 0; dist/server.js, dist/lua/buy.lua, no dist/src | ✓ VERIFIED | verifier run; build.test |
| 01-01.4 | health 200 `{mongo,redis,nodeEnv,maxPoolSize:100}`; 503 redis:false | ✓ VERIFIED | health.test (both cases pass) |
| 01-01.5 | health never hangs, 1000 ms per ping | ✓ VERIFIED | health.controller `Promise.all([pingMongo(1000), pingRedis(.., 1000)])`, withTimeout; test < 3 s |
| 01-01.6 | exit 1 + [LỖI] for missing vars, 27017, store unreachable, port held | ✓ VERIFIED | boot.test, health.test, verifier spot-checks |
| 01-01.7 | banner host:port/db, Redis, NODE_ENV, maxPoolSize; never raw URI; start:test -> nodeEnv test + warning | ✓ VERIFIED | server.ts listen callback; health.test banner + env-file tests |
| 01-01.8 | .env.example vars; .env.test only NODE_ENV=test | ✓ VERIFIED | .env.example read; 7c0aaf0 numstat 1 line + runtime nodeEnv test |
| 01-02.1 | error table → JSON {message, code} Vietnamese | ✓ VERIFIED | middlewares/error.ts; errors.test (404, malformed, primitive, 413, HttpError, CastError, ValidationError, E11000, other Mongo error) |
| 01-02.2 | plain Error → 500 INTERNAL_ERROR no leak; **empty**, malformed, primitive body → 400 INVALID_JSON | ? UNCERTAIN | 500 path, malformed and primitive verified. Empty body is parsed to `{}` by body-parser 2.x → never 500 but not INVALID_JSON (documented deviation in 01-02-SUMMARY). Human decision / override |
| 01-02.3 | content-type application/json; charset=utf-8, Vietnamese decodes | ✓ VERIFIED | errors.test 404 case |
| 01-02.4 | explicit collection names | ✓ VERIFIED | models; observed collections in seeded DB |
| 01-02.5 | all §6 indexes after ensureIndexes | ✓ VERIFIED | observed index list; models.test |
| 01-02.6 | remainingQty no min, -5 saves | ✓ VERIFIED | flash-sale.ts; models.test |
| 01-02.7 | (saleId,userId) E11000, other sale ok | ✓ VERIFIED | models.test |
| 01-02.8 | stock_movements orderId default null | ✓ VERIFIED | schema default null; models.test; reset movement observed `orderId: null` |
| 01-02.9 | emails trimmed + lowercased before unique index | ✓ VERIFIED | user.ts; models.test |
| 01-02.10 | (backstop) userId_1_createdAt_-1 backs newest-first; tie order unspecified | ⚠️ insufficient_spec | index observed; no consumer in Phase 1 → human item |
| 01-02.11 | listen only after ensureIndexes; index failure exits 1; autoIndex/autoCreate off | ✓ VERIFIED | server.ts order; db.ts options; models.test (index failure exit 1, index present on fresh DB before first request) |
| 01-03.1 | seed CLI wipes + creates data, stock loaded, no buyers key | ✓ VERIFIED | verifier CLI run |
| 01-03.2 | one bcrypt hash, emails/names format | ✓ VERIFIED | distinct passwordHash = 1; seed.test |
| 01-03.3 | 6 products kebab slugs, images path, per-category attribute keys | ✓ VERIFIED | observed |
| 01-03.4 | integer VND, salePrice 449500 | ✓ VERIFIED | observed |
| 01-03.5 | invalid args exit non-zero before DB connect | ✓ VERIFIED | verifier spot-checks; cli-args.test |
| 01-03.6 | seed output contents | ✓ VERIFIED | observed output |
| 01-03.7 | resetSale semantics + hook once | ✓ VERIFIED | code; reset.test; verifier CLI run |
| 01-03.8 | multi error / null exec rejects; reset converges | ✓ VERIFIED | reset.test; two CLI resets → 1 movement |
| 01-03.9 | reset one/all, keeps mode without --mode, never changes totalQty | ✓ VERIFIED | verifier CLI run |
| 01-03.10 | warning first line on success and failure | ✓ VERIFIED | observed on both paths |
| 01-04.1 | register 201 shape, role ignored | ✓ VERIFIED | integration/auth.test |
| 01-04.2 | login 200, HS256, exp-iat 604800, sub+role | ✓ VERIFIED | integration/auth.test |
| 01-04.3 | register **or login** with missing/empty/array/primitive/**blank strings**/non-string → 400 | ? UNCERTAIN | Register: all cases 400. Login: missing/{}/[]/non-string → 400, primitive → INVALID_JSON, but blank password → 401 INVALID_CREDENTIALS, as the plan's action text and D-12 prescribe. Truth contradicts its own plan; human decision / override |
| 01-04.4 | password 6 chars – 72 bytes, name 1–100, email trim+lower | ✓ VERIFIED | validate.ts; validate.test |
| 01-04.5 | dup email (case/space) 201 then 409 EMAIL_TAKEN | ✓ VERIFIED | integration/auth.test |
| 01-04.6 | concurrent register → one 201, one 409, one user, no pre-check | ✓ VERIFIED | auth.service (no findOne before create); test passes |
| 01-04.7 | 5 concurrent logins all 200 | ✓ VERIFIED | test passes |
| 01-04.8 | identical 401 body for wrong password / unknown email; >72 bytes same 401 | ✓ VERIFIED | test passes |
| 01-04.9 | requireAuth: no Mongo read, HS256 pinned, sub ObjectId lowercase, role check, 401 cases | ✓ VERIFIED | middlewares/auth.ts; auth.test (missing, malformed, wrong secret, expired, alg none, bad role, bad sub, no sub) |
| 01-04.10 | /api/admin/* router.use(requireAuth, requireAdmin): 401 / 403 / pass | ✓ VERIFIED | admin.routes.ts; routes/index.ts; auth.test |
| 01-04.11 | (backstop) requireAdmin no shared state | ⚠️ insufficient_spec | pure closure; executor-authored concurrency test passes → human item |
| 01-04.12 | x-test-user only when NODE_ENV **exactly** "test" | ✗ FAILED (partial) | Gap 1: trimmed comparison |

**Score:** 40/46 truths verified (0 present-behavior-unverified; 2 insufficient_spec backstop; 2 uncertain pending human decision; 2 failed/partial from one root cause)

### Deferred Items

| # | Item | Addressed In | Evidence |
|---|---|---|---|
| 1 | Reset clears the server's in-process sale cache (DATA-04 last clause) | Phase 2 | SC4 "one static sale cache that reset clears"; `onSaleReset` seam exists and is called once |
| 2 | Admin reset via HTTP | Phase 2 | SC5 "An admin can reset a sale over HTTP" |

### Required Artifacts

| Artifact | Status | Details |
|---|---|---|
| `docker-compose.yml` | ✓ VERIFIED | 127.0.0.1 bindings, healthchecks, AOF everysec, pinned images |
| `backend/package.json` | ✓ VERIFIED | dev/typecheck/build(cpSync)/start/start:test(--env-file=.env.test)/seed/reset/test/test:int |
| `backend/src/config/env.ts` | ⚠️ VERIFIED w/ gap | all exports present; isTestMode trimmed comparison (Gap 1) |
| `backend/src/config/db.ts` | ✓ VERIFIED | maxPoolSize, 5 s selection, autoIndex/autoCreate false, bounded ping |
| `backend/src/config/redis.ts` | ✓ VERIFIED | createRedis/connectRedis/pingRedis/stockKey/buyersKey |
| `backend/src/app.ts`, `server.ts` | ✓ VERIFIED | no I/O in createApp; fail-fast sequence; EADDRINUSE in listen callback |
| `backend/src/lua/buy.lua` | ✓ VERIFIED | SPECS §8 script; copied to dist/lua |
| `backend/src/utils/http-error.ts`, `object-id.ts`, `middlewares/error.ts` | ✓ VERIFIED | wired in app.ts (notFound then errorHandler) |
| `backend/src/models/*` + `index.ts` | ✓ VERIFIED | 5 models, ensureIndexes used by server and seed |
| `backend/src/services/seed.service.ts`, `sale-admin.service.ts` | ✓ VERIFIED | used by scripts/seed.ts and scripts/reset.ts |
| `backend/scripts/cli-args.ts`, `seed.ts`, `reset.ts` | ✓ VERIFIED | exercised end to end |
| `backend/src/utils/validate.ts`, `services/auth.service.ts`, `middlewares/auth.ts`, `routes/admin.routes.ts`, `types/express.d.ts` | ✓ VERIFIED | wired via routes/index.ts |
| `backend/test/helpers.ts` + test files | ✓ VERIFIED | 172 tests pass |

### Key Link Verification

| From | To | Via | Status |
|---|---|---|---|
| server.ts | config/env.ts | loadBaseConfig + loadJwtSecret in try/catch ConfigError → fail | ✓ WIRED |
| server.ts | utils/port.ts | `await isPortFree(cfg.port)` before connectMongo | ✓ WIRED |
| config/db.ts | mongoose | `serverSelectionTimeoutMS: 5000`, explicit maxPoolSize | ✓ WIRED |
| health.controller.ts | db.ts / redis.ts | `Promise.all([pingMongo(1000), pingRedis(.., 1000)])` | ✓ WIRED |
| package.json | src/lua | `cpSync('src/lua','dist/lua')` | ✓ WIRED |
| app.ts | middlewares/error.ts | `app.use(notFound)` then `app.use(errorHandler)` | ✓ WIRED |
| server.ts | models/index.ts | `await ensureIndexes()` before listen | ✓ WIRED |
| error.ts | http-error.ts | `instanceof HttpError` | ✓ WIRED |
| scripts/seed.ts | seed.service.ts | `seedDatabase(...)` | ✓ WIRED (run) |
| scripts/reset.ts | sale-admin.service.ts | `createSaleAdminService({ redis })` | ✓ WIRED (run) |
| sale-admin.service.ts | config/redis.ts | `multi().set(stockKey).del(buyersKey).exec()` + per-pair check | ✓ WIRED |
| seed.service.ts | models/index.ts | dropDatabase → flushdb → ensureIndexes → insertMany | ✓ WIRED |
| routes/index.ts | auth.routes.ts / admin.routes.ts | `router.use("/auth", ...)`, `router.use("/admin", createAdminRouter(auth))` | ✓ WIRED |
| auth.service.ts | models/user.ts | `User.create(... role: "user")`, E11000 → EMAIL_TAKEN | ✓ WIRED |
| middlewares/auth.ts | config/env.ts | `cfg.isTestMode` | ✓ WIRED (source value defective, Gap 1) |

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Real data | Status |
|---|---|---|---|---|
| GET /api/health | mongo, redis | live `admin().ping()` / `client.ping()` | yes | ✓ FLOWING |
| POST /api/auth/* | token, user | `User.create` / `User.findOne` + bcrypt | yes | ✓ FLOWING |
| seed summary | counts | `countDocuments` on real collections | yes | ✓ FLOWING |
| reset result | totalQty, mode | `FlashSale.findById` | yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Typecheck/build/unit | `npm run typecheck`; `npm test` | exit 0; 126/126 | ✓ PASS |
| Integration | `npm run test:int` | 46/46 | ✓ PASS |
| Blank JWT_SECRET | `JWT_SECRET= ... node dist/server.js` | exit 1, `[LỖI] Thiếu biến môi trường JWT_SECRET...` | ✓ PASS |
| Implicit 27017 | `MONGODB_URI=mongodb://127.0.0.1/flashsale ...` | exit 1, 27017 message, no connection | ✓ PASS |
| Redis unreachable | `REDIS_URL=redis://127.0.0.1:6390 ...` | exit 1, `[LỖI] Không kết nối được Redis...` | ✓ PASS |
| Seed CLI | `npm run seed -- --qty 5 --mode v1` (scratch DB) | data as specified | ✓ PASS |
| Reset CLI | `npm run reset -- --sale <id> --mode v2`; `npm run reset` | restored, 1 movement, mode kept | ✓ PASS |
| CLI bad args | `reset --mode v9`, `seed --qty 0`, `seed --bogus` | exit 1 + usage | ✓ PASS |
| Test-mode exactness | `loadBaseConfig({NODE_ENV:'test '})` | `isTestMode: true` | ✗ FAIL (Gap 1) |

### Probe Execution

Step 7c: SKIPPED — no `scripts/*/tests/probe-*.sh` exist and no plan declares a probe.

### Requirements Coverage

| Requirement | Source Plan | Status | Evidence |
|---|---|---|---|
| INFRA-01 | 01-01 | ✓ SATISFIED | compose, docker port, CONFIG GET |
| INFRA-02 | 01-01 | ✓ SATISFIED | strict NodeNext tsconfig, scripts, build copies lua |
| INFRA-03 | 01-01 | ✓ SATISFIED | fail-fast tests + spot-checks; 27017 refused; listen callback checks err |
| INFRA-04 | 01-01 | ✓ SATISFIED | health 200/503 (body is a superset `{mongo, redis, nodeEnv, maxPoolSize}`) |
| INFRA-05 | 01-02 | ✓ SATISFIED | §7 mapping; codes; no-leak 500 (empty-body wording deviation is plan-level only) |
| INFRA-06 | 01-01 | ✓ SATISFIED | maxPoolSize explicit + printed; .env.example complete |
| DATA-01 | 01-02 | ✓ SATISFIED | models, names, indexes, no min |
| DATA-02 | 01-02, 01-03 | ✓ SATISFIED | ensureIndexes before listen and before insert |
| DATA-03 | 01-03 | ✓ SATISFIED | CLI run |
| DATA-04 | 01-03 | ✓ SATISFIED (cache clause deferred to Phase 2) | service + CLI run |
| DATA-05 | 01-03 | ✓ SATISFIED | CLI warning observed |
| AUTH-01 | 01-04 | ✓ SATISFIED | register tests |
| AUTH-02 | 01-04 | ✓ SATISFIED | JWT tests |
| AUTH-03 | 01-04 | ✓ SATISFIED | requireAuth tests, no DB read |
| AUTH-04 | 01-04 | ✓ SATISFIED | router.use guard tests |
| AUTH-05 | 01-04 | ✗ PARTIAL | `NODE_ENV === "test"` not exact (Gap 1); all other clauses met |

No orphaned requirements: all 16 IDs mapped to Phase 1 in REQUIREMENTS.md are claimed by a plan.

### Prohibitions

| Prohibition | Tier | Disposition | Evidence |
|---|---|---|---|
| No connection to 27017 (explicit or implicit) | test | ✓ VERIFIED | config.test + boot.test; verifier spot-check |
| Ports only on 127.0.0.1 | test | flagged (no wired test) | compose file + `docker port` observed 127.0.0.1 only |
| JWT_SECRET never printed | judgment | flagged — LLM-judge: holds | no code path logs it; length warning omits value; health.test asserts absence in banner |
| No per-request logging middleware | judgment | flagged — LLM-judge: holds | app.ts mounts only cors, json, router, notFound, errorHandler |
| remainingQty no min/clamp | test | ✓ VERIFIED | models.test -5 saves |
| Seed drops only named DB, FLUSHDB only | test | flagged (no wired test for "other dbs untouched") | config rejects URI without db (config.test); no FLUSHALL anywhere in src/scripts |
| Reset CLI always warns | test | flagged (no wired test) | verifier observed on success and failure paths |
| x-test-user only when NODE_ENV exactly "test", never admin | test | ✗ VIOLATED (partial) | never-admin holds (tests); exactness fails on whitespace (Gap 1) |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| backend/src/config/env.ts | ~121-123 | security switch compares trimmed NODE_ENV | 🛑 Blocker (narrow) | Gap 1 |
| backend/src/services/sale-admin.service.ts | 56-81 | reset reopens sale before Redis reset/order delete (REVIEW WR-01) | ⚠️ Warning | race with in-flight buys once the Phase 2 admin route exists; E1 harness must reset only after a run fully drains. Recommend fixing during Phase 2 |
| backend/src/server.ts | 62 | listen on all interfaces while test mode enables x-test-user (REVIEW WR-02) | ⚠️ Warning | test-mode bypass reachable from LAN; not a requirement violation |
| backend/test/helpers.ts | 7-9 | fixed Redis db numbers shared across files/worktrees (REVIEW WR-03) | ⚠️ Warning | flaky only under parallel worktree runs |
| backend/src/server.ts | 43,52 | unguarded `await mongoose.disconnect()` in fail paths (REVIEW IN-02) | ℹ️ Info | rare raw stack instead of `[LỖI]` |

No TBD/FIXME/XXX/TODO/HACK markers in phase files.

### Gaps Summary

The phase goal is substantially achieved: Docker infra, fail-fast boot, models/indexes, seed and reset (CLI exercised end to end by the verifier), JWT register/login, requireAuth/requireAdmin and the error contract all work and are covered by 172 passing tests.

One narrow gap blocks a clean pass: the single test-mode switch (`isTestMode`) treats whitespace-padded `NODE_ENV` values as `"test"`, so the `x-test-user` auth bypass turns on for `"test "` etc. AUTH-05, the 01-04 truth, the 01-04 prohibition and Roadmap SC5 all say `NODE_ENV === "test"` / "exactly". Fix: one line in `backend/src/config/env.ts` plus three config.test cases.

Separately, two plan-wording deviations need a human decision (accept via override or change code), and the deferred manual Docker stop/start checks from 01-01 Task 3 still need to be run. Suggested overrides, if accepted:

```yaml
overrides:
  - must_have: "A thrown plain Error (no status, no code) yields 500 with body exactly { message, code: \"INTERNAL_ERROR\" } and no stack, path or original error text; an empty, malformed or JSON-primitive body yields 400 INVALID_JSON, never 500 (INFRA-05 empty edge)"
    reason: "body-parser 2.x parses an empty JSON body to {}; keeping that allows body-less POSTs (Phase 2 buy, autocannon). Empty body never yields 500 (errors.test)."
    accepted_by: "{name}"
    accepted_at: "{ISO timestamp}"
  - must_have: "Register or login with a missing body, an empty object, an array, a JSON primitive, blank strings or any non-string field returns 400 (VALIDATION_ERROR, or INVALID_JSON for unparsable bodies), never 500 (AUTH-01 empty edge)"
    reason: "Login with a blank password returns 401 INVALID_CREDENTIALS per the 01-04 plan action and D-12 (uniform login failure); never 500. Register meets the truth fully."
    accepted_by: "{name}"
    accepted_at: "{ISO timestamp}"
```

---

_Verified: 2026-11-04T12:55:00Z_
_Verifier: Claude (gsd-verifier)_
