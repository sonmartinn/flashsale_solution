# Roadmap: Flash Sale chống bán quá số lượng (Redis + MongoDB)

## Overview

This is a from-scratch rebuild driven only by `docs/SPECS.md`. First comes a fail-fast foundation: MongoDB and Redis in Docker, models and indexes, seed and reset, JWT auth with a test mode. Next is the buy pipeline, where V0, V1 and V2 share one API and one status table, along with the admin and reconcile tooling. The Core Value is proved right after that with self-checking experiments (E1 correctness, E3 duplicate buys, E2 V1-vs-V2 performance), early enough that a broken result can still be fixed. The browser demo and the one-command dev scripts come after the proof. The last phase covers the V1-vs-V2 chart, the README and the results analysis for the report. Code freeze is **2026-12-06**.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Foundation (Infra, Data, Auth)** - Docker Mongo/Redis, fail-fast backend, models + indexes, seed/reset, JWT + test mode
- [ ] **Phase 2: Buy Pipeline & Admin APIs** - Read APIs, V0/V1/V2 with unified codes and compensation, admin reset/stats, reconcile
- [ ] **Phase 3: Experiments (E1-E4)** - Self-checking load harness proving the Core Value and measuring V1 vs V2, summary CSVs committed
- [ ] **Phase 4: Web App & Dev Scripts** - React demo (home, sale, login, orders, admin monitor) and one-command start/stop for Windows and macOS
- [ ] **Phase 5: Results Chart, README & Analysis** - V1-vs-V2 chart, README from a clean clone, results analysis and risk docs for the report

## Phase Details

### Phase 1: Foundation (Infra, Data, Auth)
**Goal**: A developer can bring up MongoDB and Redis, boot a backend that fails fast on bad configuration, seed and reset a fashion flash sale, and authenticate with JWT (or with `x-test-user` in test mode)
**Depends on**: Nothing (first phase)
**Requirements**: INFRA-01, INFRA-02, INFRA-03, INFRA-04, INFRA-05, INFRA-06, DATA-01, DATA-02, DATA-03, DATA-04, DATA-05, AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05
**Success Criteria** (what must be TRUE):
  1. `docker compose up -d --wait` brings up MongoDB 7 on `127.0.0.1:27018` and Redis 7 with AOF `everysec` on `127.0.0.1:6379`, both healthy; `GET /api/health` returns 200 `{ mongo, redis }` when both are up and 503 when either is stopped
  2. The backend exits with a clear Vietnamese message when `JWT_SECRET` is missing, MongoDB or Redis is unreachable, or port 5000 is taken. It never falls back to the Windows MongoDB service on 27017 and prints its explicit `maxPoolSize` at startup. `typecheck` and `build` pass, and `dist/lua/` exists after the build
  3. `npm run seed` (stock quantity and `mode` as parameters) wipes and recreates 1,000 users + 1 admin, 6 fashion products with category-specific `attributes`, and one active 7-day half-price sale with `stock:<saleId>` loaded in Redis. Every SPECS §6 index exists, including unique `(saleId, userId)`
  4. `npm run reset` (one or all sales, optional `--mode`) restores `remainingQty = totalQty`, deletes the sale's orders and stock_movements, resets Redis stock and buyers in one checked `multi()`, reopens the sale for 7 days and warns that it cannot clear a running server's in-process cache
  5. A user can register (role always `user`, duplicate email → 409, any non-string field → 400) and log in to get a 7-day JWT (`sub` + `role`). A missing or bad token gets 401, a non-admin on `/api/admin/*` gets 403, and an `x-test-user` ObjectId is accepted only when `NODE_ENV === "test"`. Errors follow the SPECS §7 table with Vietnamese messages and a machine-readable `code`, and a 500 never leaks internals
**Plans**: TBD

### Phase 2: Buy Pipeline & Admin APIs
**Goal**: Users can read products and sales and buy through V0, V1 or V2 with identical response codes; an admin can reset and inspect a sale and reconcile Redis against MongoDB
**Depends on**: Phase 1
**Requirements**: READ-01, READ-02, READ-03, READ-04, BUY-01, BUY-02, BUY-03, BUY-04, BUY-05, BUY-06, BUY-07, BUY-08, BUY-09, ADMIN-01, ADMIN-02, ADMIN-03
**Success Criteria** (what must be TRUE):
  1. Anyone can list products (bad id → 400, unknown → 404) and active sales with product info. `GET /api/sales/:id` returns `remaining` according to `sale.mode` (Redis for V2, flagged "not loaded" when the key is missing; `remainingQty` for V0/V1, possibly negative) together with server `now`. A logged-in user gets their own orders from `/api/orders/me`, newest first
  2. `POST /api/sales/:id/buy?mode=v0|v1|v2` answers identically in every mode: 201 with the order, 409 `SOLD_OUT`, 409 `ALREADY_BOUGHT`, 400 for an invalid mode, `qty` ≠ 1 or a sale that is not open, and 503 `STOCK_NOT_LOADED` when V2 stock is missing. `qty: -5` never increases stock
  3. A quick parallel burst can push V0's `remainingQty` below zero, while V1 never sells past `totalQty`. The Lua smoke test (ioredis 6, RESP3) observes all four return codes 1/0/-1/-2 and exactly 100 successes from 1,000 parallel calls on stock 100. V2 purchases leave `flash_sales.remainingQty` unchanged
  4. When order creation fails after stock was taken, the stock comes back: V1 restores `remainingQty` (after a non-E11000 error, only if the order really does not exist), and V2 restores Redis stock and buyer membership (stock only on E11000) before logging a stock_movement. Successful buys write no logs and no stock_movements, and all modes share one order-creation path and one static sale cache that reset clears
  5. An admin can reset a sale over HTTP (optionally switching `mode`) and read stats: Mongo stock, Redis stock, orders, distinct users, oversold count, `totalQty`, `mode` and `status`. The reconcile script exits 0 when Redis matches MongoDB, prints the diff and exits non-zero otherwise, and `--fix` repairs Redis from MongoDB
**Plans**: TBD

### Phase 3: Experiments (E1-E4)
**Goal**: Repeatable, self-checking experiments show with numbers that V0 oversells, V1 and V2 never do, each user gets at most one order, and how V1 and V2 compare on throughput and latency
**Depends on**: Phase 2
**Requirements**: EXP-01, EXP-02, EXP-03, EXP-04, EXP-05, EXP-06, EXP-07, EXP-08
**Success Criteria** (what must be TRUE):
  1. `npm run e1` against `npm run start:test` performs 5 runs each of V0, V1 and V2 with 1,000 distinct users on stock 100, resetting through the admin API before every run. It reports INVALID instead of a result if the server is not in test mode, the unique index is missing, pre-run stats differ from `totalQty`, the distinct-user count is wrong, or any 401 appears
  2. E1 prints PASS only when V0 oversells and V1 and V2 end with exactly `totalQty` orders in every run and reconcile is clean after each V2 run. It writes a committed summary CSV (date, config, pool size, successes, final stock, oversold, distinct users)
  3. `npm run e3` fires 10 concurrent requests from one user on V1 and on V2, confirms that user has exactly 1 order with no stock leak, and writes a committed CSV
  4. `npm run e2` runs autocannon at 100/300/500 connections, at least 5 runs each for V1 and V2 with identical connection settings, one distinct user per request and stock ≥ 1,000. Its committed summary CSV has req/s, self-computed p50/p95, and counts of 201, 409 and real errors (5xx and connection only), split into in-stock and sold-out phases. Raw output stays out of git, and the measurement procedure is documented
  5. *(Optional, cut first)* `npm run e4` stops MongoDB mid-sale on V2, and after compensation the reconcile script shows Redis and `orders` agree; the result is written to a committed CSV
**Plans**: TBD

### Phase 4: Web App & Dev Scripts
**Goal**: The team and the grader can demo the flash sale in a browser (browse, log in, countdown, buy, my orders, admin monitor) and start or stop the whole dev environment with one command on Windows, with macOS scripts that behave the same
**Depends on**: Phase 2 (API contract; can run alongside Phase 3)
**Requirements**: WEB-01, WEB-02, WEB-03, WEB-04, WEB-05, WEB-06, WEB-07, DEV-01, DEV-02, DEV-03, DEV-04, DEV-05
**Success Criteria** (what must be TRUE):
  1. Frontend `typecheck` and `build` pass, and every API call goes through the Vite `/api` proxy. The home page `/` shows the active sale (sale price, remaining) and the product list; a user can register or log in at `/login` and stays authenticated through a stored Bearer token
  2. On `/sales/:id` the user sees a countdown to `endAt` corrected by server `now` and a Buy button that follows `sale.mode` and is disabled while a request is in flight. Success, sold out, already bought, sale not open and stock not loaded each get a distinct message. `/orders` lists the user's own orders
  3. The sale page's remaining count refreshes every 1–2 s and polling stops when the user leaves the page *(cut fourth: fall back to a refresh button)*. The `/admin` monitor *(cut third; the stats API stays)* shows live stats with oversold counts in red and a Redis–MongoDB sync badge, offers a reset with a mode picker, and can pause updates during E2
  4. On Windows PowerShell 5.1, in the real accented project path, `scripts/start.ps1` starts the dev environment in the background: it starts Docker Desktop if needed, refuses rather than kills on a busy port, creates `.env` with a random secret, runs `npm ci` only when needed, seeds only with `-Seed` or an empty DB, then prints URLs and log commands. `scripts/stop.ps1` kills the whole process tree, stops containers unless `-KeepDb`, and handles missing PID files. Every SPECS §12 Windows test case passes
  5. `scripts/start.sh` and `scripts/stop.sh` offer the same behavior and flags (`--seed`, `--keep-db`, `--help`) on bash 3.2 and pass `bash -n` (and `shellcheck` if available). `.gitattributes` enforces LF for `.sh` and CRLF for `.ps1`, the `.sh` files are executable in git, and `.dev/` is ignored
**Plans**: TBD
**UI hint**: yes

### Phase 5: Results Chart, README & Analysis
**Goal**: A fresh clone runs from the README alone, and the report has a results analysis that answers the three SPECS §2 questions with measured numbers, a V1-vs-V2 chart, trade-offs, risks and a Redis-crash runbook
**Depends on**: Phase 3, Phase 4
**Requirements**: WEB-08, DOC-01, DOC-02, DOC-03, DOC-04, DOC-05
**Success Criteria** (what must be TRUE):
  1. Following only the README on a freshly cloned machine, someone can start Docker Compose, install, seed, run backend and frontend (manually or through the start/stop scripts) and run each experiment. The README states plainly whether the macOS scripts were tested
  2. *(Cut second)* A web page shows a lazy-loaded Recharts comparison of V1 vs V2 (throughput and p50/p95 per connection level) built from the committed E2 CSV
  3. The analysis document in `docs/` answers the three SPECS §2 questions with E1–E3 numbers (E4 if done) and includes a V1-vs-V2 chart that does not depend on the web chart. It also discloses the machine, pool size, that test mode skips JWT cost, and that the numbers are only relative
  4. The documentation covers the trade-offs and risks: V1's false "sold out" window, the roughly 1 s AOF `everysec` loss, a Node crash between Lua and insert causing undersell that reconcile fixes, the mode-mixing hazard, and the limits of compensation on ambiguous writes. It also includes the Redis-crash runbook (check, then `reconcile --fix` before reopening a V2 sale) and explains why Redis was chosen as the key-value store and MongoDB as the document store
**Plans**: TBD
**UI hint**: yes

## Scope Guardrails

- **Never cut:** V0, V1, V2 (Phase 2), E1, E2 (Phase 3).
- **Cut order when time runs short (SPECS §3):** EXP-08 / E4 (Phase 3) → WEB-08 web chart (Phase 5) → WEB-07 admin monitor page (Phase 4, keep ADMIN-02 stats API) → WEB-05 auto-polling (Phase 4, replace with a refresh button). Each cuttable item is planned last within its phase; in Phase 4, WEB-07 comes after WEB-05.
- **Research flags:** Phase 3 (autocannon histogram and phase split, warm-up, frozen CSV schema, E4 failure timing) and the Phase 4 dev-script portion (PowerShell 5.1 / bash 3.2 edge cases, background processes, port checks). Phases 1, 2 and 5 use standard patterns.

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 (Phase 4 depends only on Phase 2 and may overlap Phase 3)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation (Infra, Data, Auth) | 0/TBD | Not started | - |
| 2. Buy Pipeline & Admin APIs | 0/TBD | Not started | - |
| 3. Experiments (E1-E4) | 0/TBD | Not started | - |
| 4. Web App & Dev Scripts | 0/TBD | Not started | - |
| 5. Results Chart, README & Analysis | 0/TBD | Not started | - |
