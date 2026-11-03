# Project Research Summary

**Project:** Flash Sale chống bán quá số lượng (Redis + MongoDB)
**Domain:** Flash-sale web app with 3 interchangeable inventory strategies (V0 naive, V1 MongoDB atomic, V2 Redis + Lua) plus a load-test harness and academic results analysis (NoSQL course project)
**Researched:** 2026-11-03
**Confidence:** HIGH (stack and correctness patterns verified locally; scripting/platform details MEDIUM)

## Executive Summary

This is a measurement project dressed as a web app. The deliverable that matters is repeatable numeric proof that, under concurrency, V1 (conditional `findOneAndUpdate` with `$gte`) and V2 (single Lua script on Redis touching `stock:<id>` and `buyers:<id>`) always produce exactly `totalQty` successful orders with one order per user, while V0 (read, then `$inc`) oversells. A second deliverable is a fair V1 vs V2 performance comparison. Everything else, including the React UI, admin monitor and dev scripts, supports the demo and the report. The stack is fixed by `docs/SPECS.md` section 4. Research only pins versions and flags traps. MongoDB is the source of truth and Redis is the fast layer: stock is preloaded on seed or reset, and a reconcile script restores consistency afterwards.

Recommended approach: one Express buy pipeline with a shared prefix (auth, input validation, static sale checks from an in-memory cache shared by all modes) and a strategy map `buyHandlers[mode]`. Each handler returns a typed `BuyResult` that maps to the unified status table (201 / 409 sold out / 409 already bought / 400 / 503). All modes share one `createOrder()`, and each mode has its own compensation (V1 `$inc +qty`, V2 Redis `multi()`). The load harness is a separate package. E1 and E3 use a Node `fetch` + `Promise.all` burst with unique users. E2 uses autocannon with one request entry whose `setupRequest` reads a shared counter, plus a self-computed p95 histogram. Measure on compiled JS (`start:test`) and reset through the admin API before every run.

The main risks concern validity more than functionality. V0 may fail to oversell visibly: a stock pre-check, non-concurrent requests, repeated users, or a server not running in test mode can each mask the race. The `(saleId, userId)` unique index can be silently missing. V1 can leak or over-restore stock around insert failures. The sale cache cannot be cleared by a CLI reset running in another process. autocannon has no p95. The benchmark can turn unfair if one mode gets extra caching or logging. Mitigation: harnesses check themselves (distinct users, index present, pre-run stats equal `totalQty`, reconcile clean after each V2 run) and report PASS/FAIL/INVALID instead of trusting the setup.

## Key Findings

### Recommended Stack

The SPECS stack is confirmed current and compatible with Node 24 on the dev machine. Two installs need care: React Router must be pinned to v7, and the jsonwebtoken/bcryptjs ESM import forms are easy to get wrong.

**Core technologies:**
- Node 24.x runtime (keep `engines >=20.19.0`; README should say "tested on Node 24")
- TypeScript `~7.0.2`, the native tsc, verified with NodeNext tsconfigs. tsx and Vite do not type-check, so `typecheck` is the definition of done
- Express `^5.3.0`: async errors reach the error middleware, and the `listen` error callback works (useful for detecting a busy port)
- Mongoose `^9.11.4`: use `returnDocument: "after"`, never `new: true` (deprecated, and it emits a warning on every call in the hot path). Set collection names explicitly. No transactions (standalone mongod)
- ioredis `^6.0.0`: `defineCommand` + Lua + `multi()` verified on Redis 7.4.12 (exactly 100 successes out of 1000 on stock 100). It defaults to RESP3, so add a smoke test on Lua return types. Use `maxRetriesPerRequest: 1` plus a startup `ping()`
- React `^19.3.1`, **react-router `^7.18.5`** (declarative mode; `@latest` installs v8, which needs Node >=22.22), Vite `^8.3.5`, Recharts `^3.10.1` (lazy-load it, about 500 kB)
- Docker images `mongo:7.0` on `127.0.0.1:27018` and `redis:7.4` with AOF everysec on `127.0.0.1:6379`
- jsonwebtoken (default import only, because a named import crashes at runtime), bcryptjs 3 (bundled types, no `@types/bcryptjs`), dotenv 18 (`node --env-file=.env.test` for `start:test`), autocannon `^8.0.0` (no `workers`, no p95, count errors from `statusCodeStats`, not `non2xx`)

### Expected Features

**Must have (table stakes / never cut):**
- Infra with fail-fast config, 5 models with correct indexes, seed (stock as a parameter) and a reset service shared by the CLI and the admin API
- JWT auth with `x-test-user` test mode gated by `NODE_ENV === "test"` in exactly one place
- Buy endpoint with shared checks and unified codes; V0, V1, V2 with compensation
- `GET /sales/:id` returning `remaining` according to `sale.mode`; `/orders/me`; admin reset and stats APIs
- Reconcile script with `--fix` and a non-zero exit code on mismatch
- E1 (5 runs x 3 modes, self-checking), E2 (100/300/500 connections, unique users, p50/p95, in-stock vs sold-out phases), E3, each producing a CSV committed to git; a V1 vs V2 chart built from the E2 CSV
- Frontend: home, sale page (countdown, 1–2 s polling, buy, messages per status code), login/register, my orders, admin monitor
- Dev start/stop scripts (.ps1 on PowerShell 5.1, .sh on bash 3.2); README; results analysis answering Q1–Q3

**Should have (differentiators, cheap):**
- Self-validating runners with PASS/FAIL/INVALID verdicts
- Latency split by status (201 vs 409) and by phase in E2, which explains why V2 is faster
- One-command runners per experiment (`npm run e1`, `npm run e2`)
- Consistency badge on the admin page; stats payload also returns `totalQty`, `mode`, `status`
- Server `now` in `GET /sales/:id` to correct countdown clock skew
- Redis crash-recovery runbook (documentation only)

**Defer / cut order (binding, SPECS §3):** E4 → live chart on the web → admin monitor page (keep the stats API) → automatic polling. Never build: payment, V3 reservation, WebSocket, queue, Redis Cluster, multiple concurrent sales, distributed locks, qty > 1, per-variant stock, admin CRUD, rate limiting, an artificial `sleep` in V0.

### Architecture Approach

A layered Express app (routes → controllers → services) with a pure service core. `saleCache` holds only static sale fields, uses single-flight loading, is shared by all modes, and is invalidated by `resetSale`. `stock.service` owns Redis keys and preload. `purchase.service` holds the shared prefix plus `buyHandlers[mode]` and maps a `BuyResult` to a status. A typed wrapper wraps the Lua custom command, and the Lua file is loaded via `new URL(..., import.meta.url)` and copied to `dist/lua` at build time. `saleAdmin` handles reset and stats. Scripts (seed/reset/reconcile) reuse the services. The loadtest package has its own lib (http, admin login/reset/stats, ids, csv, histogram).

**Major components:**
1. Bootstrap/config: fail fast on a missing `JWT_SECRET`, Mongo or Redis down, or a busy port; error middleware with `HttpError`
2. Data and sync layer: models and indexes, Redis preload, reset (Mongo + Redis `multi()` + cache invalidation), reconcile
3. Buy pipeline: shared checks, V0/V1/V2 strategies, shared `createOrder`, per-mode compensation (Redis first, then a best-effort `stock_movements` write)
4. Read and admin APIs: products, active sale, sale detail with remaining by mode, orders/me, stats
5. Load-test harness: E1/E3 burst runner, E2 autocannon runner with its own histogram, CSV writer, pre-run and post-run assertions
6. React SPA: api.ts client, pages, polling with cleanup, buy UI driven by `sale.mode`

### Critical Pitfalls

1. **V0 doesn't visibly oversell.** Keep the shared pre-check to static fields only (never read or cache `remainingQty`). Build all 1,000 promises before `Promise.all`. Use unique users. Assert that the server is in test mode (a 401 storm counts as a silent false pass).
2. **Wrong user distribution / missing unique index.** Never use an autocannon `requests` array of users or `workers`. Harnesses print and assert the distinct user count. Seed runs `createIndexes()`, and harnesses assert `getIndexes()`.
3. **V1 leak or over-restore.** Await the compensating `$inc`. Where SPECS allows, skip compensation when the order actually exists after an ambiguous error. Use one shared `createOrder`.
4. **V2 state assumptions.** No TTL on `stock:*`. Confirm AOF is on. Normalize user ids to lowercase hex everywhere. Compensation runs Redis `multi()` first. Read `[err,res]` pairs from `exec()`. Run reconcile after every V2 run.
5. **Unfair or mislabelled benchmark.** Same cache and same insert for all modes, no logging in the buy path, explicit `maxPoolSize`, measure on `start:test`, reset via the API (the CLI cannot clear the in-process cache). Do not label autocannon `p97_5` as p95.
6. Also: connecting to the wrong MongoDB (27017 is the Windows service, always use `127.0.0.1:27018`); PowerShell 5.1 syntax and BOM; bash 3.2 checked only with Git Bash 5; overclaiming in the analysis (same-machine numbers are relative only).

## Implications for Roadmap

Coarse granularity: 5 phases. The critical path is Foundation → Buy core → Experiments. Frontend and dev scripts form a parallel track once the API contract exists.

### Phase 1: Foundation (infra, data, seed/reset, auth)
**Rationale:** Everything depends on it. Most environment traps (wrong Mongo port, fail-fast boot, Lua build copy, indexes) live here.
**Delivers:** docker-compose, backend skeleton with config/error middleware/health, 5 models and indexes, seed (`--qty`, possibly `--mode`), reset service + CLI, register/login, `requireAuth` with test mode, `requireAdmin`, ObjectId normalization, input validation that only accepts strings.
**Addresses:** infra, models, seed/reset, and auth table stakes.
**Avoids:** Pitfalls 3, 9, 10, 11 (build layout), 12, 13, security table.

### Phase 2: Buy core and APIs (V0/V1/V2, admin, reconcile)
**Rationale:** The core of the study and the contract that both the harness and the frontend consume. Build V0 first so oversell can be demonstrated early.
**Delivers:** read APIs plus `saleCache`, shared buy pipeline with the unified status table, V0, V1 with compensation, V2 Lua + `defineCommand` + `multi()` compensation + 503 path, `/orders/me`, admin reset/stats endpoints, reconcile script with `--fix`, smoke tests for the Lua return codes.
**Avoids:** Pitfalls 1 (pre-check design), 4, 5, 6, 7 (shared code).

### Phase 3: Experiments (E1, E3, E2, optional E4)
**Rationale:** Proves the Core Value. Do it before any polish so a broken result surfaces with time left.
**Delivers:** loadtest package and lib, E1 self-checking runner (5 runs x 3 modes), E3, E2 with shared-counter autocannon + custom p95 + phase/status split at 100/300/500 connections, frozen CSV schema, committed CSVs, E4 only if time allows (first to cut).
**Avoids:** Pitfalls 1, 2, 7, 8, plus pre-run assertions against the cache-reset pitfall.

### Phase 4: Frontend and dev scripts (parallel track after Phase 2 contract)
**Rationale:** Depends on the read/buy/admin API contract only. Can overlap with Phase 3. Sits lowest in the cut order.
**Delivers:** api.ts, auth pages, home, sale page (countdown from server `endAt`, polling with cleanup, buy disabled while in flight, messages per code), my orders, admin monitor (stats, mode, oversold in red); `scripts/start|stop.ps1` and `.sh`, `.gitattributes`, tests per SPECS §12.
**Avoids:** UX pitfalls (double click, interval leaks), Pitfalls 14 and 15.

### Phase 5: Charts, README and results analysis
**Rationale:** Needs final E1–E3 (E4) data and a frozen CSV schema.
**Delivers:** V1 vs V2 chart from the E2 CSV, README that works from a clean clone, analysis docs answering Q1–Q3 with numbers, trade-offs (false sold-out window in V1, ~1 s AOF loss, crash between Lua and insert → undersell + reconcile), explicit disclosure of the setup.
**Avoids:** Pitfall 16 (overclaiming, CSV locale, hidden setup facts).

### Phase Ordering Rationale
- Data and reset come before buy, and buy before experiments, because every experiment depends on reset, test mode, stats and reconcile.
- Frontend waits for `remaining`-by-mode and for the sale-mode switching decision (open question below), not for the experiments.
- The SPECS §3 cut order maps onto the tail: E4 (Phase 3), live chart, admin page, then polling (Phase 4).

### Research Flags
Needs `/gsd-plan-phase --research-phase`:
- **Phase 3 (Experiments):** autocannon histogram/phase-split mechanics, warm-up policy, CSV schema, E4 failure timing (Mongoose buffering, `serverSelectionTimeoutMS`).
- **Phase 4 dev-scripts portion:** PowerShell 5.1 and bash 3.2 edge cases, idempotent background processes, port checks.

Standard patterns (skip research): Phase 1, Phase 2 (patterns already detailed in ARCHITECTURE.md and verified in STACK.md), Phase 5.

## Open Questions / Decisions Needing User Input

`docs/SPECS.md` is authoritative. The items below are research suggestions that deviate from or extend SPECS. None of them is decided yet.

1. **p95 vs autocannon:** compute p95 from per-response latencies (keeps the SPECS wording, more code), or report p90/p97.5 and record the deviation?
2. **Sale-mode switching:** no SPECS API changes `flash_sales.mode`. Options: seed/reset takes `--mode`, or `POST /admin/sales/:id/reset` accepts `{ mode }`. This blocks the V0-vs-V2 UI demo and keeps the UI counter consistent with harness runs.
3. **Machine-readable 409 codes:** add `code` (`SOLD_OUT`, `ALREADY_BOUGHT`, `SALE_NOT_ACTIVE`, `STOCK_NOT_LOADED`) to the error JSON so harnesses and the UI can tell the two 409s apart?
4. **V1 over-restore guard:** on a non-E11000 insert error, check `Order.exists` before the compensating `$inc`. SPECS only says "refund".
5. **react-router pinned `^7.18.5`:** confirm (SPECS says "React Router 7"; `@latest` is v8).
6. **CLI reset vs in-process cache:** harnesses reset only via the admin API; the CLI prints a warning or the cache gets a short TTL/version. Pick one.
7. Minor extras: server `now` in `GET /sales/:id`; `totalQty`/`mode`/`status` in the stats payload; pinning `redis:7.4` rather than `redis:7`.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Checked against the registry, tarball sources and local runs (tsc 7, Vite 8 build, ioredis 6 on Redis 7.4, autocannon distribution test) |
| Features | HIGH | Derived directly from SPECS §3/8/9/10/14; extras clearly tagged |
| Architecture | HIGH | Follows the SPECS topology with well-known patterns; a few library details MEDIUM |
| Pitfalls | HIGH / MEDIUM | Correctness and methodology HIGH; Windows/macOS scripting MEDIUM (no Mac available) |

**Overall confidence:** HIGH

### Gaps to Address
- The size of the V1–V2 gap on one machine through Docker Desktop is unknown and may be small. Frame it as relative, and treat a small gap as a valid result.
- macOS bash 3.2 cannot be tested without a Mac. Minimum check is `bash -n` plus a checklist and a README note.
- E4 timing behaviour (Mongoose command buffering, ambiguous insert errors) needs a spike if E4 is attempted.
- ioredis 6 RESP3 with Lua integer replies: verified for the happy path. Keep the smoke test for codes 1/0/-1/-2.

## Sources

### Primary (HIGH confidence)
- `docs/SPECS.md` (authoritative requirements), `.planning/PROJECT.md`
- npm registry metadata and published tarball sources/types for express, mongoose, mongodb, ioredis, jsonwebtoken, bcryptjs, dotenv, tsx, typescript, react, react-router, vite, @vitejs/plugin-react, recharts, autocannon
- Local scratchpad runs: tsc 7.0.2, Vite 8 build, ioredis 6 against redis:7.4.12, autocannon user-distribution test, Express 5 runtime probes
- autocannon README and v8 result fixture (no p95, `statusCodeStats`, `setupRequest`)

### Secondary (MEDIUM confidence)
- Official docs read through WebFetch: MongoDB lifecycle (7.0 EOL 2027-08-31), Node 20 EOL, Mongoose deprecations
- Issues and Q&A on PowerShell 5.1 and bash 3.2 behaviour

---
*Research completed: 2026-11-03*
*Ready for roadmap: yes*
