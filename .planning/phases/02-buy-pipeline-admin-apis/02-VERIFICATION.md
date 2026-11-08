---
phase: 02-buy-pipeline-admin-apis
verified: 2026-11-08T13:20:00Z
status: human_needed
score: 42/44 must-haves verified
covered_files:
  - .planning/phases/02-buy-pipeline-admin-apis/02-01-PLAN.md
  - .planning/phases/02-buy-pipeline-admin-apis/02-01-SUMMARY.md
  - .planning/phases/02-buy-pipeline-admin-apis/02-02-PLAN.md
  - .planning/phases/02-buy-pipeline-admin-apis/02-02-SUMMARY.md
  - .planning/phases/02-buy-pipeline-admin-apis/02-03-PLAN.md
  - .planning/phases/02-buy-pipeline-admin-apis/02-03-SUMMARY.md
  - .planning/phases/02-buy-pipeline-admin-apis/02-04-PLAN.md
  - .planning/phases/02-buy-pipeline-admin-apis/02-04-SUMMARY.md
  - .planning/phases/02-buy-pipeline-admin-apis/02-05-PLAN.md
  - .planning/phases/02-buy-pipeline-admin-apis/02-05-SUMMARY.md
  - backend/package.json
  - backend/scripts/cli-args.ts
  - backend/scripts/reconcile.ts
  - backend/src/controllers/admin.controller.ts
  - backend/src/controllers/order.controller.ts
  - backend/src/controllers/product.controller.ts
  - backend/src/controllers/sale.controller.ts
  - backend/src/lua/buy.lua
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
covered_digest: "v4:sha256:dd6c244370124e820fd655fb1b399bd226bf578514625169c8957aa6666fae6e"
behavior_unverified: 0
overrides_applied: 0
deferred:
  - truth: "Reset/refunds are not fenced against in-flight buys (02-REVIEW WR-03); a reset during in-flight requests can start the next run off-baseline"
    addressed_in: "Phase 3"
    evidence: "Phase 3 SC1: E1 'reports INVALID instead of a result if ... pre-run stats differ from totalQty'; SC2: 'reconcile is clean after each V2 run'"
human_verification:
  - test: "Decide on the prohibition 'V1/V2 compensation: ambiguous writes resolve to undersell, never oversell' (02-03 prohibition 1, 02-01 prohibition 1) given 02-REVIEW WR-01: on a non-E11000 insert error (e.g. MongoNetworkError after the insert reached mongod) compensate() refunds when findOne returns null, which can race a still-committing insert and yield totalQty+1 orders"
    expected: "Either accept as documented residual risk (implementation follows BUY-05/D-10 wording literally: 'chỉ hoàn kho khi Order.exists xác nhận đơn không tồn tại') and record it in Phase 5 risk docs, or open a gap to refund only on errors that prove no write happened"
    why_human: "Spec (BUY-05, D-10, roadmap SC4) and the plan prohibition conflict on network-ambiguous errors; tests cover only deterministic seams, so this is a scope decision, not a code defect against the written requirement"
  - test: "Decide on 02-REVIEW WR-02: ioredis default autoResendUnfulfilledCommands=true can replay the bare INCRBY refund (V2 E11000 branch) or the flashBuy EVALSHA after a reconnect"
    expected: "Accept as documented risk, or set autoResendUnfulfilledCommands:false in createRedis before Phase 3 E4 (which stops a store mid-sale)"
    why_human: "Only reachable under a Redis connection drop mid-command; no deterministic test exists and the phase SCs do not cover it"
  - test: "Decide on 02-REVIEW WR-04: buy handler is chosen from ?mode= only, so an authenticated user can buy a V2 sale with ?mode=v1/v0 and exceed totalQty across stores"
    expected: "Confirm D-03 (mode comes from the query, never from the sale) remains accepted and is stated in the report as 'V1/V2 guarantee holds when every buy uses the sale's mode', or add a non-test-mode mismatch check"
    why_human: "Behaviour is spec-mandated (SPECS buy?mode=, D-02/D-03); whether the Core Value claim needs the caveat is a product/report decision"
  - test: "READ-01 edge (backstop truth): product reads are side-effect free under concurrency"
    expected: "Confirm by review: catalog.service listProducts/getProduct issue only find/findById().lean(); no write path exists"
    why_human: "Truth tagged verification: backstop (non-inferable); presence and code reading do not qualify as evidence and no concurrency test exists"
  - test: "READ-03 edge (backstop truth): remaining is a point-in-time snapshot from the store selected by sale.mode, may lag during a burst but is never read from the wrong store"
    expected: "Confirm the read.test per-mode cases (v2 reads Redis, not remainingQty; v0/v1 read remainingQty) are sufficient, or run GET /api/sales/:id during a burst"
    why_human: "Truth tagged verification: backstop; the 'during a running burst' clause has no exercising test"
---

# Phase 2: Buy Pipeline & Admin APIs Verification Report

**Phase Goal:** Users can read products and sales and buy through V0, V1 or V2 with identical response codes; an admin can reset and inspect a sale and reconcile Redis against MongoDB
**Verified:** 2026-11-08T13:20:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

The phase goal is achieved in the codebase. All five roadmap success criteria are backed by real implementation (no stubs) and by named integration tests that I ran myself (`npm run typecheck` exit 0; `npm run test:int` 175/175 pass, run once, output saved). The remaining items are human decisions: three review warnings that touch the oversell prohibitions in failure-only paths, and two `backstop` truths.

### Observable Truths — Roadmap Success Criteria

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| SC1 | Anyone lists products (400/404) and active sales with product info; `GET /api/sales/:id` returns `remaining` by `sale.mode` (Redis for V2, `stockLoaded:false` when missing; `remainingQty` for V0/V1, possibly negative) plus `now`; logged-in user gets own orders newest first | VERIFIED | `catalog.service.ts` + `stock.service.ts remainingFor` (one MGET, skipped with no v2), `dto.ts toSaleDto`; read.test: v1/v0-negative/v2-Redis/v2-missing cases, /active ordering + one MGET, products 400/404, orders/me isolation + 401 + limit 100. Live on compiled server: `/api/sales/active` 200 with product, `/api/products` 6 items, `/api/orders/me` without auth 401 |
| SC2 | `POST /api/sales/:id/buy?mode=v0|v1|v2` answers identically: 201 order, 409 SOLD_OUT, 409 ALREADY_BOUGHT, 400 bad mode / qty≠1 / sale not open, 503 STOCK_NOT_LOADED; `qty:-5` never increases stock | VERIFIED | `sale.controller.ts` single `FAILURES` table, D-01 check order before `purchase.buy`; buy.test runs the same matrix for each of v0/v1/v2 (INVALID_MODE incl. `mode[$ne]`, VALIDATION_ERROR incl. -5 with stock unchanged, D-01 order, 404 no-null-cache, SALE_NOT_ACTIVE both ways, 503, D-07 exception). Live: 401, 400 INVALID_MODE, 400 VALIDATION_ERROR for qty -5, 404 for all three modes |
| SC3 | V0 burst pushes `remainingQty` below zero; V1 never sells past `totalQty`; Lua smoke observes 1/0/-1/-2 and exactly 100 of 1,000 on stock 100; V2 leaves `remainingQty` unchanged | VERIFIED | buy.test "v0: bán quá (remainingQty < 0 và hơn 10 đơn)", "v1/v2: đúng 10 đơn, 90 SOLD_OUT" (V2 asserts remainingQty 10, stock "0", SCARD 10, buyers = order users); lua.test "client đã thương lượng RESP3", "bốn mã trả về", "1.000 lời gọi song song ... đúng 100 lần 1, kho \"0\", SCARD 100" |
| SC4 | Compensation restores stock (V1 `$inc`, non-E11000 only if order absent; V2 INCRBY+SREM, INCRBY only on E11000) before stock_movement; success writes no logs/movements; one createOrder; one static cache that reset clears | VERIFIED | `purchase.service.ts compensate/refundStock/recordCompensation`; `order.service.ts createOrder` is the only insert; `routes/index.ts` one `createSaleCache()` shared by purchase and `onSaleReset: saleCache.invalidate`; compensation.test full matrix (14 cases) + "không thêm stock_movements, không console.log/warn/error"; admin.test "reset xóa cache tĩnh của server đang chạy (BUY-02)" |
| SC5 | Admin resets over HTTP (optional mode) and reads stats; reconcile exits 0 in sync, prints diff and exits non-zero otherwise; `--fix` repairs Redis | VERIFIED | `admin.routes.ts` guard `router.use(requireAuth, requireAdmin)`; `admin.controller.ts` + `sale-admin.service.ts getStats` (11 keys); `scripts/reconcile.ts` exit 0/2/1 + `reconcile.service.ts fixSale` single multi(); admin.test (401/403, INVALID_MODE, E1-style V2 and V0 cycles), reconcile.test (CLI codes 0/2/1, --fix, P3 no Mongo writes). Live: stats without auth 401, with x-test-user 403 |

### Observable Truths — Plan must_haves (39)

| Plan | Truths | Status | Notes |
|------|--------|--------|-------|
| 02-01 (buy pipeline) | 10/10 | VERIFIED | Incl. compiled-server truth: buy.test "server đã biên dịch (node dist/server.js, NODE_ENV=test) đăng ký buy.lua lúc khởi động và trả 201 cho cả ba mode" passed; zero emitWarning on V1 burst; cache single-flight/invalidate tests |
| 02-02 (reconcile) | 5/5 | VERIFIED | Service + CLI tests in reconcile.test; CLI spawned without JWT_SECRET; NOTE line asserted |
| 02-03 (compensation) | 6/6 | VERIFIED | Every branch has a named passing test, including refund-failure → 500 not 409 DUPLICATE and E3 (10 concurrent same-user buys → 1 order, stock -1) |
| 02-04 (admin) | 8/8 | VERIFIED | All eight map to named admin.test cases (reset DTO, input validation, cache invalidation, guard, idempotent reset, V2 and V0 bursts with stats) |
| 02-05 (read) | 8/10 | 8 VERIFIED, 2 insufficient_spec | The two `verification: backstop` truths (READ-01 side-effect-free, READ-03 snapshot during burst) abstain per rule 5b → human verification |

**Score:** 42/44 truths verified (0 present-but-behavior-unverified; 2 backstop truths routed to human)

### Prohibitions (must-NOT)

| Plan | Statement (short) | Tier | Disposition |
|------|-------------------|------|-------------|
| 02-01 | V1/V2 must not sell beyond totalQty or give one user two orders under any concurrency | test | Enforcement tests pass (bursts, Lua 1000/100, E3). **Flagged**: review WR-04 (`?mode=` cross-store oversell, spec-accepted D-03) and WR-02 (ioredis auto-resend) are untested residual paths → human decision |
| 02-01 | No V0 delay/lock/clamp, no success-path log/movement/extra read only some modes pay | test | VERIFIED by V0 oversell test and zero console/emitWarning/movement assertions; code read confirms no clamp in V0 |
| 02-02 | reconcile --fix must not write orders/flash_sales | test | VERIFIED: reconcile.test "P3: fixSale không sửa FlashSale hay Order" |
| 02-03 | Compensation must not create stock never sold; ambiguous writes resolve to undersell | test | Deterministic branches VERIFIED (order-exists, lookup-throws, V2 E11000 keeps buyer). **Flagged**: review WR-01 — a network-ambiguous non-E11000 error with a not-yet-visible insert gets refunded → possible oversell; this is the literal BUY-05/D-10 behaviour → human decision |
| 02-03 | Success path gains no log line / stock_movements write | test | VERIFIED: compensation.test success case, all three modes |

### Deferred Items

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | WR-03: reset not fenced against in-flight buys | Phase 3 | SC1: E1 reports INVALID if pre-run stats differ from totalQty; SC2: reconcile clean after each V2 run |

### Required Artifacts

`gsd-tools verify.artifacts` on all five plans: 01 11/11, 02 5/5, 03 2/2, 04 5/5, 05 7/7 (exit 0). Every artifact read and found substantive (no placeholder returns, no TODO/FIXME/TBD/XXX in `backend/src`, `backend/scripts`, `backend/test`).

| Artifact | Status | Details |
|----------|--------|---------|
| `backend/src/services/purchase.service.ts` | VERIFIED | V0 findOne+$inc (no clamp), V1 atomic findOneAndUpdate `$gte` without `new:true`, V2 runBuyScript; compensation with multi() pair checks |
| `backend/src/lua/buy.lua` + `services/lua.ts` | VERIFIED | SISMEMBER → GET(-2) → compare(0) → DECRBY+SADD(1); `readFileSync(new URL("../lua/buy.lua", import.meta.url))`; build copies to `dist/lua` |
| `backend/src/controllers/sale.controller.ts` | VERIFIED | D-01 order, single FAILURES table, string-only mode, `qty !== 1` strict |
| `backend/src/services/sale-cache.ts` | VERIFIED | Single-flight Map, no null/error caching, stale-evict guard, `invalidate(id?)` |
| `backend/src/services/catalog.service.ts`, `stock.service.ts`, `utils/dto.ts` | VERIFIED | Explicit DTOs, no `_id`/`__v` (asserted in read.test), one MGET |
| `backend/src/services/sale-admin.service.ts`, `controllers/admin.controller.ts`, `routes/admin.routes.ts` | VERIFIED | getStats Promise.all of 5 reads, 11 keys; reset DTO ISO dates |
| `backend/src/services/reconcile.service.ts`, `scripts/reconcile.ts`, `scripts/cli-args.ts` | VERIFIED | No printing in service; CLI exit codes 0/2/1; `"reconcile": "tsx scripts/reconcile.ts"` in package.json |

### Key Link Verification

`gsd-tools verify.key-links`: 01 5/5, 02 3/3, 03 3/3, 04 3/3, 05 4/4 — all WIRED. Manually confirmed: `server.ts:60 registerBuyScript(redis)`; `routes/index.ts` builds one `saleCache` used by both `createPurchaseService` and `createSaleAdminService({ onSaleReset: saleCache.invalidate })`; `/active` registered before `/:id`; `/orders/me` behind `auth.requireAuth`.

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Real data | Status |
|----------|------|--------|-----------|--------|
| GET /api/sales/:id `remaining` | stock view | `FlashSale.findById` + `redis.mget` / `Order.countDocuments` | Yes (live call returned remaining 100, stockLoaded true for the seeded v2 sale) | FLOWING |
| GET /api/admin/sales/:id/stats | stats | Mongo findById/countDocuments/distinct + Redis get/scard | Yes (admin.test burst asserts exact values) | FLOWING |
| POST buy `order` | OrderDto | `Order.create` via shared createOrder | Yes | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Typecheck | `npm run typecheck` (backend) | exit 0 | PASS |
| Full integration suite (run once) | `npm run test:int` | 175/175 pass, includes build | PASS |
| Compiled server via `npm run start:test` boots with Lua registered | start in background, `GET /api/health` | 200 `{mongo:true,redis:true,nodeEnv:"test",testMode:true,maxPoolSize:100}` | PASS |
| Buy pipeline on compiled server, all modes (non-mutating) | POST buy with x-test-user to an unknown sale id, `?mode=v0/v1/v2` | 404 NOT_FOUND in all three (passed auth, mode, qty, id checks) | PASS |
| Pre-checks on compiled server | no auth / `?mode=v3` / `qty:-5` | 401 / 400 INVALID_MODE / 400 VALIDATION_ERROR | PASS |
| Admin guard on compiled server | stats without token / with x-test-user | 401 / 403 | PASS |

The VALIDATION.md manual item ("one buy per mode on `npm run start:test`") was not executed with real 201 buys, because `start:test` points at the demo database `flashsale` and a buy would mutate demo data. The behaviour it guards (CJS named imports, `dist/lua` copy, Lua registration in compiled JS, 201 in every mode) is covered by the passing automated test that spawns `node dist/server.js` with `NODE_ENV=test` on an isolated database, and the `start:test` wrapper itself was confirmed to boot and route buys. The server I started was stopped afterwards (`taskkill /T` on its own npm tree; port 5000 no longer answers). Docker containers were not touched.

### Probe Execution

Step 7c: SKIPPED (no `scripts/*/tests/probe-*.sh` and no probes declared in the plans).

### Requirements Coverage

All 16 phase requirement IDs are claimed by at least one plan; no orphaned IDs.

| Requirement | Source Plan | Status | Evidence |
|-------------|------------|--------|----------|
| READ-01 | 02-05 | SATISFIED | products list/get, 400/404 (read.test) |
| READ-02 | 02-05 | SATISFIED | /api/sales/active with product info, one MGET |
| READ-03 | 02-05 | SATISFIED | remaining by mode, stockLoaded, `now` |
| READ-04 | 02-05 | SATISFIED | /api/orders/me own orders, newest first, 401 |
| BUY-01 | 02-01 | SATISFIED | D-01 check order test per mode |
| BUY-02 | 02-01, 02-04 | SATISFIED | shared cache, static fields only, cleared by HTTP reset |
| BUY-03 | 02-01 | SATISFIED | unified codes table, per-mode matrix |
| BUY-04 | 02-01 | SATISFIED | V0 findOne + `$inc`, oversell test |
| BUY-05 | 02-01, 02-03 | SATISFIED | V1 atomic `$gte`, awaited refund, refund only if order absent (see WR-01 human item) |
| BUY-06 | 02-01 | SATISFIED | defineCommand + readFileSync(URL), V2 leaves remainingQty |
| BUY-07 | 02-03 | SATISFIED | INCRBY+SREM multi with pair checks; INCRBY only on E11000; movement after refund, failure non-blocking |
| BUY-08 | 02-01, 02-03 | SATISFIED | single createOrder; zero logs/movements on success |
| BUY-09 | 02-01 | SATISFIED | lua.test RESP3, 4 codes, 100/1000 |
| ADMIN-01 | 02-04 | SATISFIED | POST reset with optional mode |
| ADMIN-02 | 02-04 | SATISFIED | stats fields incl. oversold, totalQty, mode, status |
| ADMIN-03 | 02-02 | SATISFIED | reconcile check/diff/exit codes/--fix |

Note: REQUIREMENTS.md still shows READ-01..04, BUY-01, BUY-03, BUY-04, BUY-06, BUY-09 as unchecked/"Pending" in the traceability table although the code satisfies them; the orchestrator should update the tracking when the phase closes.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (all phase files) | - | TBD/FIXME/XXX/TODO | none found | - |
| `backend/src/services/purchase.service.ts` | 129, 146 | `console.error` | Info | Compensation-failure branches only (D-12), not the success path; tests assert zero output on success |
| `backend/src/services/purchase.service.ts` | 169-185 | refund after `findOne` null on any non-E11000 error | Warning (02-REVIEW WR-01) | Possible oversell on network-ambiguous writes; routed to human decision |
| `backend/src/config/redis.ts` | client options | ioredis auto-resend left on | Warning (02-REVIEW WR-02) | Refund/flashBuy replay after reconnect; routed to human decision |
| `backend/src/controllers/sale.controller.ts` | 56-58 | buy mode from query only | Warning (02-REVIEW WR-04, spec D-03) | Cross-store oversell by a real user; routed to human decision |
| `backend/src/services/purchase.service.ts` | 81, 175, 185 | rethrow original error may map to 4xx | Warning (02-REVIEW WR-05) | Affects Phase 3 error-rate accounting only for internal insert failures; not a phase-2 SC |

### Human Verification Required

1. **WR-01 vs the undersell prohibition.** Test: decide whether a non-E11000 insert error followed by `findOne` → null should still refund. Expected: either accept it as documented risk (it is the literal BUY-05/D-10 rule) and record it in the Phase 5 risk docs, or open a gap to refund only on errors that prove nothing was written. Why human: the spec and the plan prohibition disagree on network-ambiguous errors.
2. **WR-02 ioredis auto-resend.** Test: decide whether to set `autoResendUnfulfilledCommands: false`. Expected: accept as documented risk or fix before E4. Why human: only reachable on a mid-command Redis disconnect, and no deterministic test exists.
3. **WR-04 `?mode=` cross-store buys.** Test: confirm D-03 stays accepted and the report states the guarantee holds only when every buy uses the sale's mode. Why human: the behaviour is spec-mandated, so this is a report decision.
4. **READ-01 backstop.** Test: confirm product reads have no write path. Expected: catalog read functions use only `find`/`findById().lean()`. Why human: the truth is tagged `backstop`, so a code read does not count as evidence.
5. **READ-03 backstop.** Test: confirm the per-mode read tests are enough, or poll `GET /api/sales/:id` during a burst. Expected: the value comes from the mode's store and may lag. Why human: the truth is tagged `backstop`, and the "during a burst" part has no test.

### Gaps Summary

No blocking gaps. Every roadmap success criterion and requirement ID has a real implementation, the wiring is in place, and named integration tests pass. I ran the tests myself rather than relying on the SUMMARY claims. The phase goal is achieved. Status is `human_needed` for two reasons. Three open code-review warnings (WR-01, WR-02, WR-04) describe failure-only or misuse paths where V1/V2 could exceed `totalQty`. Those paths conflict with the plan prohibitions but match the written spec, so they need a scope decision. Two plan truths are tagged `backstop` and cannot be confirmed from code alone. WR-03 is deferred to Phase 3, whose E1 pre-run checks cover it.

---

_Verified: 2026-11-08T13:20:00Z_
_Verifier: Claude (gsd-verifier)_
