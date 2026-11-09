# Phase 3: Experiments (E1-E4) - Context

**Gathered:** 2026-11-09
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase delivers a self-checking load-test harness in its own package, `loadtest/`, and four experiments that each run with one npm command:

- **E1, correctness.** V0 oversells. V1 and V2 always end with exactly `totalQty` orders, from distinct users.
- **E3, duplicate buys.** One user firing 10 concurrent requests on V1 or V2 gets exactly 1 order, and no stock leaks.
- **E2, performance.** V1 vs V2 throughput and p50/p95 latency at 100, 300 and 500 connections, with the in-stock and sold-out phases measured separately.
- **E4, Mongo outage on V2.** Optional, and the first item to cut.

Each experiment writes one committed summary CSV under `loadtest/results/`. Raw output stays out of git, and the measurement procedure is documented.

The harness talks to the system over HTTP only. The single exception is that it spawns the existing backend reconcile CLI to check V2 runs.

The phase also includes three small, additive backend changes the experiments need: reset can set `totalQty`, stats reports the unique index, and E4 may get a fast-fail setting if research shows it is needed.

The web chart (WEB-08) and the results analysis document (DOC-*) belong to Phase 5. This phase only produces the CSVs and the procedure those depend on.

</domain>

<decisions>
## Implementation Decisions

The user handed every gray area to Claude ("Bạn cứ tự quyết theo khuyến nghị"), as in Phases 1 and 2. The decisions below are Claude's choices and are now locked for planning. Anything already fixed by SPECS §10, REQUIREMENTS EXP-01..08, the PROJECT.md Key Decisions table, or Phase 1/2 CONTEXT is not repeated here. In particular, these are settled elsewhere: fetch + `Promise.all` for E1, autocannon `setupRequest` with a shared counter for E2, self-computed p95, `testMode` preflight, the D-06 code table, the D-25 stats fields, and the D-30 reconcile exit codes.

### Stock size, sale selection and server lifecycle
- **D-01:** `POST /api/admin/sales/:id/reset` accepts an optional **`totalQty`** next to `mode`: `{ mode?, totalQty? }`.
  - `totalQty`, when present, must be a number that is a safe integer with `1 <= totalQty <= 1_000_000`. Anything else gets 400 `VALIDATION_ERROR`. The `mode` check is unchanged.
  - The reset service sets `totalQty = remainingQty = <new value>`, sets Redis `stock:<id>` to the new value in the same checked `multi()`, and logs `stock_movements { reason: "reset", delta: <new totalQty> }`. Without the field, `totalQty` stays as it is (the Phase 1 D-07 behavior).
  - The sale cache already holds `totalQty` and is invalidated by `onSaleReset`, so nothing else changes.
  - The CLI `npm run reset` also gets `--qty <n>`, which reuses the same service option and the same validation.
  - This resolves the Phase 1/2 deferred idea. E1 and E3 use 100 and E2 uses ≥ 1,000 on the same sale, with no reseed and no server restart.
  - **Reversibility:** reversible. Removing the field only touches the reset route and service.
- **D-02:** The harness **does not start or stop the backend**. The person measuring runs `npm run start:test` in `backend/` in a separate terminal, and the harness only checks it with preflight. Reasons:
  - `start:test` runs a wrapper process, so stopping it cleanly needs a process-tree kill on Windows (Phase 1 D-20).
  - Build time must not leak into any measurement.
  - The Phase 4 dev scripts are a separate concern (dev mode, not test mode).
- **D-03:** Harness configuration comes from CLI flags (`node:util` `parseArgs`, the same style as the backend `cli-args.ts`) with environment fallbacks:
  - `--base-url`, env `LOADTEST_BASE_URL`, default `http://127.0.0.1:5000`
  - `--sale <saleId>`. When omitted, the harness calls `GET /api/sales/active` and requires **exactly one** active sale, otherwise the result is INVALID with a message saying to pass `--sale`.
  - Admin credentials: env `LOADTEST_ADMIN_EMAIL` / `LOADTEST_ADMIN_PASSWORD`, defaulting to the seed's `admin@flashsale.local` / `matkhau123` (Phase 1 D-04). Log in once per experiment.
  - `--runs` (default 5) and the experiment-specific flags listed below.
- **D-04:** At the end of every experiment, whatever its verdict, the harness resets the sale back to the `mode` and `totalQty` it found at the start. This is best-effort, and the harness prints what it restored. The demo sale is never left at 10,000 stock in V1 mode by accident.

### Shared harness library (EXP-01)
- **D-05:** `loadtest/` is its own npm package (`"type": "module"`, `engines` `>=20.19.0`, TypeScript `~7.0.2` strict, NodeNext, `.js` import suffixes, the same tsconfig conventions as the backend).
  - Dependencies: `autocannon ^8.0.0`. Dev dependencies: `@types/autocannon`, `@types/node ^24`, `tsx`, `typescript`.
  - Scenarios run through `tsx`. The load generator is not the measured system, and tsx only transpiles at load time.
  - Scripts: `e1`, `e2`, `e3`, `e4`, `typecheck`, `test`.
  - Layout follows `.planning/research/ARCHITECTURE.md`: `lib/` (config, http, admin, ids, csv, histogram, env-info, preflight, reconcile, verdict) and `scenarios/` (e1-correctness, e2-performance, e3-duplicate, e4-mongo-outage).
  - Comments and console messages are in Vietnamese. CSV headers are English identifiers.
- **D-06:** Preflight runs before the first run of every experiment. Any failure means **INVALID** with a Vietnamese reason, and no run starts.
  1. `GET /api/health` returns 200 with `mongo && redis` and `testMode === true`. Never infer test mode from `nodeEnv` (Phase 1 D-17).
  2. Admin login succeeds.
  3. The sale exists, and the stats field `uniqueOrderIndex === true` (see D-07).
  4. After each reset, before each run: `stats.mode === <requested mode>`, `totalQty === <requested>`, `mongoRemaining === totalQty`, `orders === 0`, `redisBuyers === 0`, and for v2 also `redisStock === totalQty`. A mismatch makes that run INVALID.
- **D-07:** `GET /api/admin/sales/:id/stats` gets one **additive** field, `uniqueOrderIndex: boolean`. It is true only when the `orders` collection has an index with `unique: true` on exactly the key `{ saleId: 1, userId: 1 }`. It is read with `Order.listIndexes()` on each stats call; that is admin-only and outside the buy path, so the cost does not matter. The harness has no other way to see indexes over HTTP. The PITFALLS case where a reseed drops the DB while the server runs is real. The Phase 4 admin page may ignore the field.
  - **Reversibility:** reversible. The field is additive, and no existing consumer breaks.
- **D-08:** User ids are 24 lowercase hex characters that the harness generates.
  - Format: a random per-session prefix, then the run number, then a zero-padded counter. They are unique within a session by construction.
  - Before sending, every scenario asserts that `distinct ids sent === requests planned`.
  - `x-test-user` checks only the format (Phase 1 D-14), so no MongoDB access is needed and E2 can use more than 1,000 users.
- **D-09:** Each buy request is `POST /api/sales/:id/buy?mode=<v0|v1|v2>` with `content-type: application/json`, body `{"qty":1}` (Phase 2 D-04), and header `x-test-user: <id>`. The harness classifies each response by status plus the JSON `code`:
  - `201`
  - `409 SOLD_OUT`
  - `409 ALREADY_BOUGHT`
  - `401`
  - other 4xx
  - `5xx`
  - connection error or timeout

  **Real errors** are `5xx` + connection errors + timeouts only (SPECS §10).
- **D-10:** V2 runs are checked for consistency by spawning the backend reconcile CLI without `--fix`. The spawn uses `process.execPath` with the `tsx` loader and `scripts/reconcile.ts --sale <id>`, with `cwd` set to `backend/`. It uses **no shell** and no paths inside a command string, because the project path contains spaces and Vietnamese characters.
  - Only exit code **0** counts as clean, exit **2** is drift, and anything else is INVALID (Phase 2 D-30).
  - The stats field `redisInSync === true` is checked as well, as a cheap first signal.
  - The exact spawn form is Claude's discretion if research finds a simpler robust one, but it must not use a shell string with the path.
- **D-11:** CSV writer:
  - Comma separator, `.` decimal point, header row, UTF-8 **without** BOM, LF line endings, ISO-8601 UTC dates.
  - Values are quoted only when needed (comma, quote or newline), and numbers are never locale-formatted.
  - Every row carries the environment columns `session, date, gitCommit, nodeVersion, os, cpuModel, cpuCount, totalMemGB, maxPoolSize`. `maxPoolSize` comes from `/api/health`, and `gitCommit` from `git rev-parse --short HEAD` with a `-dirty` suffix when the working tree has changes; it is blank if git is unavailable.
- **D-12:** File policy:
  - Each `npm run eN` **overwrites** `loadtest/results/eN.csv` with only that session's rows. Rows are appended as runs finish, so a crash keeps the rows written so far. History lives in git.
  - Raw data (per-run JSON with every status count, autocannon result objects, and latency arrays where useful) goes to `loadtest/results/raw/<session>-eN-....json`, which is git-ignored.
  - `.gitignore` changes from `loadtest/results/*` to ignoring `loadtest/results/raw/` while allowing `loadtest/results/*.csv` and `.gitkeep`.
  - Only a session whose verdict is PASS (E1/E3/E4) or VALID (E2) is committed as the official result.
  - **Reversibility:** costly. The Phase 5 chart and analysis read these file names and columns.

### Verdict rules and exit codes
- **D-13:** Each run gets a status of PASS, FAIL or INVALID. **INVALID** means the measurement cannot be trusted, for any of these reasons:
  - preflight or pre-run stats mismatch
  - any `401`
  - distinct ids sent ≠ requests
  - any real error (5xx, connection error or timeout) in E1 or E3
  - `stats.distinctUsers !== stats.orders`, which means duplicate users slipped in
  - reconcile exit code other than 0 or 2

  **FAIL** means the measurement is trustworthy and the claim is broken. It is judged per mode:
  - V0 FAIL: `oversold === 0`.
  - V1/V2 FAIL: `orders !== totalQty`, or `oversold > 0`, or (V2) reconcile drift.
  - E3 FAIL: user orders ≠ 1, or stock leak (D-17).
- **D-14:** The E1 verdict is **PASS** only when every run is valid **and** every V0 run oversells **and** every V1 and V2 run ends with exactly `totalQty` orders and a clean reconcile (V2).
  - "V0 oversells in every run" is stricter than SPECS §14 ("V0 có đơn vượt"). It makes the claim repeatable rather than lucky. With 1,000 concurrent distinct users and three round trips in V0, this is expected to hold. A V0 run that does not oversell is reported honestly as FAIL; it is never retried or replaced.
  - There are no automatic retries anywhere. Re-running is a manual decision.
- **D-15:** Stop and continue rules:
  - An **INVALID** run stops the experiment immediately, because the environment is broken and later runs would be meaningless. The harness writes the rows collected so far, restores the sale (D-04), and exits.
  - A **FAIL** run lets the experiment continue through every planned run, so the CSV shows the full picture, and the final verdict is FAIL.
- **D-16:** Exit codes for every experiment:
  - `0`: PASS (E1/E3/E4) or VALID (E2)
  - `1`: FAIL, meaning a correctness claim is broken
  - `2`: INVALID, meaning preflight or environment problems, including a server that cannot be reached

  The console ends with one clear Vietnamese summary line and a per-mode table.

### E1, correctness (EXP-02, EXP-03)
- **D-17:** E1 settings:
  - Stock 100 (reset with `{ mode, totalQty: 100 }`), 1,000 distinct users per run, 5 runs per mode.
  - Runs are **interleaved** round-robin (v0, v1, v2) × 5 to spread machine drift evenly. The run order is recorded.
  - All 1,000 fetch promises are created before `Promise.all`. Fresh ids are used per run.
  - Flags: `--users`, `--stock` and `--runs` exist for smoke runs. Non-default values are allowed but recorded in every row.
  - After each run the harness reads stats once, plus reconcile for V2.
  - E1 measures correctness, not speed. Wall-clock duration is recorded only to spot accidental serialization (PITFALLS 1).
- **D-18:** E1 CSV columns, frozen (after the D-11 environment columns):
  `run, mode, users, totalQty, s201, s409SoldOut, s409AlreadyBought, s401, sOther4xx, s5xx, connErrors, orders, distinctUsers, finalStock, oversold, reconcile, durationMs, status, note`
  - `finalStock` is `mongoRemaining` for v0/v1 and `redisStock` for v2.
  - `oversold` is taken from stats (`max(0, orders − totalQty)`, SPECS rule).
  - `reconcile` is `clean`, `drift` or `n/a`.
  - **Reversibility:** costly. Phase 5 analysis reads it.

### E3, duplicate buys (EXP-04)
- **D-19:** E3 settings:
  - V1 and V2 only (V0 leaks by design, per Phase 2 D-09).
  - Stock 100. Each run uses one fresh user that sends 10 concurrent requests. 5 runs per mode, interleaved.
  - **Pass** requires all of these:
    - exactly one 201 and nine 409s (any 409 code counts; normally `ALREADY_BOUGHT`)
    - `stats.orders === 1` and `distinctUsers === 1`
    - **no stock leak**: v1 `mongoRemaining === totalQty − 1`; v2 `redisStock === totalQty − 1`, `redisBuyers === 1` and reconcile clean
- **D-20:** E3 CSV columns:
  `run, mode, requests, totalQty, s201, s409SoldOut, s409AlreadyBought, sOther, realErrors, userOrders, finalStock, expectedStock, stockLeak, reconcile, status, note`

### E2, performance (EXP-05, EXP-06)
- **D-21:** Each E2 run is one reset followed by **two separate autocannon invocations** on the same sale:
  1. **in_stock**: reset `{ mode, totalQty: S }`, then exactly `amount = S` requests with S fresh distinct users. All of them are expected to be 201, and any 409 is recorded.
  2. **sold_out**: immediately after, stock is now 0. Send `amount = M` requests with M more fresh distinct users. All are expected to be `409 SOLD_OUT`.

  Defaults are `S = 5000` and `M = 5000`, overridable with `--stock` and `--soldout-requests`. S must be at least 1,000 (SPECS), and the harness refuses smaller values unless `--smoke` is passed; smoke rows are marked as such.

  Using a fixed `amount` (not `duration`) means every request is counted and both modes do identical work.
- **D-22:** autocannon settings are identical for V1 and V2:
  - One process, no `workers`.
  - `connections ∈ {100, 300, 500}`, `pipelining: 1`, the same `timeout` (10 s), `amount` as in D-21.
  - A single request template whose `setupRequest` takes the next id from a module-level counter (PROJECT Key Decision).
- **D-23:** Latency and throughput come from the harness's own per-response records (the Client `response` event's `responseTime` and status code), not from autocannon's histogram:
  - p50 and p95 use the nearest-rank method on the exact sorted array. Mean, p99 and max are recorded as well.
  - `rps = completed responses / phase wall-clock seconds`, measured by the harness around each autocannon call.
  - The same formulas apply to both modes, and they are written down in the procedure doc.
  - autocannon's own `errors`, `timeouts` and `statusCodeStats` are cross-checked against the harness counters, and a mismatch is noted in the raw JSON.
- **D-24:** Warm-up and ordering:
  - Before each (connections level × mode) block, there is one **unrecorded warm-up run** (`S = M = 1000`, same connections). This warms the JIT, the sale cache, keep-alive sockets and the Mongo pool.
  - No `minPoolSize` change: pooled connections stay open once created (`maxIdleTimeMS` defaults to unlimited). `maxPoolSize` stays at 100 (Phase 1 D-16) and is recorded.
  - Within each connections level, the measured runs alternate the starting mode (V1,V2 / V2,V1 / ...) to cancel drift.
  - Order: connections 100 → 300 → 500. At least 5 measured runs per mode per level.
- **D-25:** E2 validity per run:
  - distinct ids sent equal the requests sent
  - after in_stock, `orders === S` and `oversold === 0`
  - after sold_out, still `orders === S`
  - V2 reconcile is clean after the run
  - no `401`

  Real errors (5xx, connection errors, timeouts) do **not** invalidate an E2 run. They are part of the measurement and are counted.

  A broken correctness check (orders ≠ S, oversold > 0, drift) is FAIL (exit 1). Otherwise the verdict is VALID or INVALID; E2 never judges performance.
- **D-26:** E2 CSV has one row per (run × phase), with columns:
  `connections, mode, run, phase, requests, totalQty, durationMs, rps, p50Ms, p95Ms, p99Ms, meanMs, maxMs, s201, s409SoldOut, s409AlreadyBought, s5xx, connErrors, timeouts, realErrors, status, note`

  `phase` is `in_stock` or `sold_out`. Cross-run aggregation (median per mode × connections × phase) is printed to the console at the end. Phase 5 recomputes it from the CSV for the chart and analysis. No separate aggregate CSV file is written.
  - **Reversibility:** costly. The WEB-08 chart and the analysis read these columns.
- **D-27:** The procedure doc says to close the `/admin` page (or pause its polling) and other heavy apps during E2, because polling adds Mongo load (ARCHITECTURE).

### E4, Mongo outage on V2 (EXP-08, optional, first to cut)
- **D-28:** E4 is planned as the **last** plan of the phase and is cut first.
  - Setup: reset `{ mode: "v2", totalQty: 1000 }`, then a sustained load of distinct users at moderate concurrency (default 50 in-flight, fetch loop or autocannon, Claude's discretion).
  - When the harness has counted 201s ≥ 30% of stock, it runs `docker stop flashsale-mongo`, keeps the load going for about 5 s, then stops the load.
  - It then runs `docker start flashsale-mongo` and waits until `/api/health` is 200 again (bounded wait, INVALID on timeout). It reads stats and runs reconcile **without** `--fix`.
  - Only the Mongo container is stopped, never Redis. It never runs `docker compose down -v` and never kills any other process.
- **D-29:** The E4 verdict is **PASS** when reconcile exits 0 after recovery.
  - If reconcile shows drift, the verdict is FAIL. The harness records the diff, then runs reconcile `--fix` and a re-check, records whether the repair worked, and prints that this is the SPECS §8 runbook in action. This is a finding for the Phase 5 risk docs, not a crash.
  - CSV columns: `stopAfter201, s201, s409, s5xx, connErrors, ordersAfter, redisStockAfter, redisBuyersAfter, reconcile, fixApplied, reconcileAfterFix, status, note`
- **D-30:** Backend behavior during the outage is a **research item**. Each failed buy must return 500 within a bounded time, about the 5 s `serverSelectionTimeoutMS`, rather than hanging on Mongoose buffering. Research decides whether `bufferCommands: false` or a short `bufferTimeoutMS` is needed on Mongoose 9. Any change must leave the healthy buy path untouched, and it is verified by re-running the Phase 2 tests.
  - The 500 handler's `console.error(err)` flood during E4 is **accepted**, not rate-limited. E4 measures consistency, not speed. The procedure doc warns about it.
  - WR-02 (`autoResendUnfulfilledCommands`) does not apply to E4, because Redis stays up. It stays a Phase 5 documented risk.

### Procedure and official runs (EXP-07)
- **D-31:** `loadtest/README.md` is the measurement procedure. It covers:
  - prerequisites (Docker up, `npm run seed` done, `backend/.env` present)
  - starting `npm run start:test` in a separate terminal
  - one command per experiment, with every flag
  - that every run resets through the admin API
  - that the buy path does no logging
  - closing `/admin` during E2
  - the meaning of each CSV column, the verdict and exit-code table, and the "relative numbers only, same machine, Docker Desktop network" disclaimer

  The Phase 5 README links to it.
- **D-32:** Tests:
  - The harness's pure logic gets `node --test` unit tests in `loadtest/test/`: id generation and uniqueness, percentile (nearest-rank), CSV escaping and number format, response classification, verdict rules for each experiment, and the gitCommit/env-info fallback.
  - The backend changes D-01, D-07 (and D-30 if made) get integration tests in `backend/test/integration/`. They follow Phase 2 D-32: own db name and own Redis db index, never db 0. The next free indices are after the ones Phase 2 used.
  - `typecheck` must pass in both packages.
- **D-33:** The executor runs **smoke** sessions (`--runs 1`, small sizes with `--smoke`) to prove the scripts work end to end, and it does not commit their CSVs as official results.
  - The **official** E1, E3 and E2 sessions (and E4 if kept) are a final `checkpoint:human-action`. The user runs them on their machine with other heavy apps closed, then commits the CSVs.
  - Plan priority: harness lib + backend changes, then E1 + E3 (Core Value, never cut), then E2 (never cut), then E4 (cut first).

### Claude's Discretion
- Exact module boundaries inside `loadtest/lib`, and the Vietnamese wording of console output.
- The id layout inside the 24 hex characters, as long as ids are lowercase, unique per session and asserted.
- Whether E4 load uses a fetch loop or autocannon.
- The exact reconcile spawn form (D-10), within the "no shell string with the path" rule.
- How median/summary tables are printed to the console.
- The upper bound for `totalQty` in D-01, if research shows a reason to choose something other than 1,000,000.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements and scope
- `docs/SPECS.md` §10: the experiment table and measurement rules (start:test, reset before each run, oversold = orders − totalQty, real errors = 5xx + connection, CSV per experiment, relative numbers only)
- `docs/SPECS.md` §8: buy semantics, mode-mixing hazard, reconcile rules (what E1/E3/E4 check)
- `docs/SPECS.md` §13–§14: E1 tool choice and completion criteria for E1, E2, E3
- `.planning/REQUIREMENTS.md`: EXP-01..EXP-08
- `.planning/ROADMAP.md`: Phase 3 success criteria and the scope guardrails / cut order
- `.planning/PROJECT.md`: Key Decisions (E1 fetch script, E2 autocannon, self-computed p95, WR-01/WR-02 risks)

### Prior decisions this phase builds on
- `.planning/phases/01-foundation-infra-data-auth/01-CONTEXT.md`: D-04 seed accounts and password, D-07 reset CLI, D-14 test mode, D-16 `maxPoolSize`, D-17 health fields and the `testMode` preflight rule, D-20 `start:test` wrapper process
- `.planning/phases/02-buy-pipeline-admin-apis/02-CONTEXT.md`: D-04 buy body, D-06 code table, D-07 cross-mode edge case, D-09 V0 no compensation, D-24 reset route, D-25 stats fields, D-26..D-31 reconcile CLI and exit codes, D-32 test db/Redis index convention

### Research
- `.planning/research/ARCHITECTURE.md`: `loadtest/` layout, HTTP-only boundary, E1–E4 flow, why the V1/V2 gap shows mainly in the sold-out phase, the bufferCommands note for E4
- `.planning/research/PITFALLS.md`: Pitfall 1 (V0 not overselling / serialized requests), Pitfall 2 (user distribution in E1 and E2)
- `.planning/research/STACK.md` and `.claude/CLAUDE.md`: autocannon 8 notes (no p95, `statusCodeStats`, `setupRequest`, no `workers`, `non2xx` is not the error rate)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `backend/src/services/sale-admin.service.ts`: `createSaleAdminService` with `resetSale(saleId, { mode? })` and `getStats`. D-01 extends `ResetOptions` with `totalQty`, and D-07 adds `uniqueOrderIndex` to `SaleStats`.
- `backend/src/controllers/admin.controller.ts` + `routes/admin.routes.ts`: the reset body validation (D-24 of Phase 2) gets the `totalQty` check.
- `backend/scripts/reset.ts` + `scripts/cli-args.ts`: `parseArgs` helpers. The `--qty` flag is added here.
- `backend/scripts/reconcile.ts`: the CLI the harness spawns for V2 checks (exit 0/2/1).
- `backend/src/controllers/health.controller.ts`: health already exposes `testMode` and `maxPoolSize` for preflight and the CSV.
- `backend/src/config/db.ts`: `connectMongo(uri, maxPoolSize)` with `serverSelectionTimeoutMS: 5000`. This is where any D-30 E4 fast-fail option would go.
- `docker-compose.yml`: fixed container names `flashsale-mongo` / `flashsale-redis`, used by E4.

### Established Patterns
- TypeScript strict ESM NodeNext with `.js` suffixes, default imports for CJS packages (`autocannon`), and "done means typecheck passes".
- Vietnamese console and error messages. A one-line `[LỖI]` on fatal CLI errors (Phase 1 D-08 style) fits the harness too.
- Body-less POSTs omit Content-Type (Phase 1). Buy requests do send a JSON body with `qty: 1`. A reset with a body sends JSON.
- Integration tests: per-file database `flashsale_test_<name>_<pid>`, per-file Redis db index, never db 0.

### Integration Points
- `.gitignore`: change the `loadtest/results/*` rule as described in D-12.
- The Phase 5 chart and analysis consume `loadtest/results/e1.csv`, `e2.csv`, `e3.csv` (and `e4.csv`).
- The Phase 4 admin page reads stats. The new `uniqueOrderIndex` field is additive.

</code_context>

<specifics>
## Specific Ideas

- The CSVs are evidence for the report, so honesty beats prettiness. No retries, no replaced runs, and FAIL and INVALID runs are recorded as they happened.
- The project path contains spaces and Vietnamese characters (`C:\Dữ liệu của ổ D\...`). Anything that spawns a process or builds a file URL must survive that path.

</specifics>

<deferred>
## Deferred Ideas

- **Mode-mismatch guard** (Phase 2 deferred): still not needed. The harness always resets with `{ mode }` and checks `stats.mode` (D-06), so it never trips the hazard.
- **Rate-limiting 500 error logs during a Mongo outage**: accepted as-is for E4 (D-30). Revisit only if the E4 console flood makes the run unusable.
- **An aggregate E2 CSV** (median per mode × connections × phase): Phase 5 computes it from `e2.csv` when building the chart and analysis.
- **Varying `maxPoolSize` as an E2 dimension**: out of scope. SPECS asks only for an explicit, recorded pool size.

</deferred>

---

*Phase: 03-experiments-e1-e4*
*Context gathered: 2026-11-09*
