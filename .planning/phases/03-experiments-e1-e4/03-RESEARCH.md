# Phase 3: Experiments (E1-E4) - Research

**Researched:** 2026-11-09
**Domain:** Load-test harness (Node fetch + autocannon 8) against Express 5 / Mongoose 9 / ioredis 6, on Windows with Docker Desktop
**Confidence:** HIGH for harness mechanics (source read + local probes). MEDIUM for E4 runtime behaviour (source read only; Docker daemon was not running, so no live outage probe).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

The user handed every gray area to Claude ("Bạn cứ tự quyết theo khuyến nghị"), as in Phases 1 and 2. The decisions below are Claude's choices and are now locked for planning. Anything already fixed by SPECS §10, REQUIREMENTS EXP-01..08, the PROJECT.md Key Decisions table, or Phase 1/2 CONTEXT is not repeated here. In particular, these are settled elsewhere: fetch + `Promise.all` for E1, autocannon `setupRequest` with a shared counter for E2, self-computed p95, `testMode` preflight, the D-06 code table, the D-25 stats fields, and the D-30 reconcile exit codes.

#### Stock size, sale selection and server lifecycle
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

#### Shared harness library (EXP-01)
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

#### Verdict rules and exit codes
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

#### E1, correctness (EXP-02, EXP-03)
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

#### E3, duplicate buys (EXP-04)
- **D-19:** E3 settings:
  - V1 and V2 only (V0 leaks by design, per Phase 2 D-09).
  - Stock 100. Each run uses one fresh user that sends 10 concurrent requests. 5 runs per mode, interleaved.
  - **Pass** requires all of these:
    - exactly one 201 and nine 409s (any 409 code counts; normally `ALREADY_BOUGHT`)
    - `stats.orders === 1` and `distinctUsers === 1`
    - **no stock leak**: v1 `mongoRemaining === totalQty − 1`; v2 `redisStock === totalQty − 1`, `redisBuyers === 1` and reconcile clean
- **D-20:** E3 CSV columns:
  `run, mode, requests, totalQty, s201, s409SoldOut, s409AlreadyBought, sOther, realErrors, userOrders, finalStock, expectedStock, stockLeak, reconcile, status, note`

#### E2, performance (EXP-05, EXP-06)
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

#### E4, Mongo outage on V2 (EXP-08, optional, first to cut)
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

#### Procedure and official runs (EXP-07)
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

### Deferred Ideas (OUT OF SCOPE)
- **Mode-mismatch guard** (Phase 2 deferred): still not needed. The harness always resets with `{ mode }` and checks `stats.mode` (D-06), so it never trips the hazard.
- **Rate-limiting 500 error logs during a Mongo outage**: accepted as-is for E4 (D-30). Revisit only if the E4 console flood makes the run unusable.
- **An aggregate E2 CSV** (median per mode × connections × phase): Phase 5 computes it from `e2.csv` when building the chart and analysis.
- **Varying `maxPoolSize` as an E2 dimension**: out of scope. SPECS asks only for an explicit, recorded pool size.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| EXP-01 | Shared harness library: admin login, reset via API (with mode), stats, ObjectId generator for `x-test-user`, CSV from Node (`.` decimal), preflight (test mode, unique index, initial stats = `totalQty`) | Login/stats/reset shapes verified (§Code Examples). D-07 `listIndexes` behaviour verified in Mongoose source. Reconcile spawn form probed live. CSV + gitCommit-dirty pathspec verified. New: TIME_WAIT guard (Pitfall 1) belongs here |
| EXP-02 | E1: separate Node script (`fetch` + `Promise.all`, all 1,000 promises built first), stock 100, 1,000 distinct users, 5 runs per V0/V1/V2, reset before each, self-check distinct users and no 401 | 1,000-concurrent `fetch` burst probed on this machine: 0 errors over 7 runs, including keep-alive reuse after 4.8–10 s idle. Phase 2 test already shows V0 oversells at 100 users on stock 10 |
| EXP-03 | E1 summary CSV + PASS/FAIL/INVALID; V0 oversells, V1/V2 exactly `totalQty` every run; reconcile clean after each V2 run | Reconcile exit codes and "skipped (mode ≠ v2) = exit 0" trap documented (Pitfall 6) |
| EXP-04 | E3: one user × 10 concurrent requests, V1 and V2 only, CSV, exactly 1 order, no stock leak | V1 refunds via compensate before responding, so stock is final when all 10 responses are in (purchase.service read) |
| EXP-05 | E2 autocannon with `setupRequest` + shared counter (no `workers`), one distinct user per request, stock ≥ 1,000 via a parameter, 100/300/500 connections, ≥ 5 runs, identical connection settings | autocannon 8.0.0 `amount` semantics verified from source and probe: exactly `amount` `setupRequest` calls and requests, 10,000 distinct ids at 500 connections. `amount < connections` throws synchronously |
| EXP-06 | E2 self-collected `responseTime` for p50/p95, counts 201/409/real errors, in-stock vs sold-out split, committed summary CSV, raw out of git | `onResponse(status, body)` gives the body for the `code` split. Callback fires ~0.45–0.5 s after the last response, so wall-clock around the call inflates duration (Pitfall 2). `errors` already includes `timeouts` (Pitfall 3) |
| EXP-07 | One npm command per experiment + documented procedure | npm 11 `npm.ps1` keeps `--` on PowerShell, so `npm run e1 -- --runs 1` works. README content fixed by D-31 |
| EXP-08 | (Optional) E4 Mongo outage on V2, reconcile, CSV | D-30 answered: **no `bufferCommands` change needed** on Mongoose 9.11.4. Predicted outcome is **drift (undersell)**, so the D-29 verdict will most likely be FAIL → `--fix` repairs. This conflicts with ROADMAP criterion 5 (Open Question 1). RESOLVED 2026-11-09 by the D-29 amendment: undersell drift repaired by `--fix` is PASS, and the post-`--fix` re-check meets criterion 5 |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- TypeScript `strict` everywhere. ESM NodeNext, relative imports end in `.js`. Default-import CJS packages (`import autocannon from "autocannon"`).
- "Done" means `typecheck` passes (tsx does not type-check). The backend also needs `build` to pass.
- Express 5: no try/catch in handlers. Business errors throw `HttpError(status, message, code)`. Vietnamese messages and comments.
- Measure only on `npm run start:test` (compiled JS), never on `dev`. Reset before every measurement. `maxPoolSize` explicit. No logging on the buy path. Oversold = `orders − totalQty`. Error rate counts only 5xx + connection errors.
- Security: every input field must be type-checked (NoSQL injection). Compose binds 127.0.0.1 only.
- Dev scripts: do not install software, do not kill unknown processes, never `docker compose down -v`. Do not change system configuration (this rules out raising the Windows ephemeral port range or `TcpTimedWaitDelay`; see Pitfall 1).
- Git: no `Co-Authored-By` lines in commits.
- Pinned stack: Node `>=20.19.0`, TS `~7.0.2`, autocannon `^8.0.0` + `@types/autocannon ^7.12.7`, tsx `^4.23.15`, `@types/node ^24`. MongoDB at `127.0.0.1:27018`, never `localhost:27017`.

## Summary

The phase is mostly harness engineering on top of a finished backend, plus two small additive backend changes (reset `totalQty`, stats `uniqueOrderIndex`). The backend surfaces the harness needs are already in place: health exposes `testMode` and `maxPoolSize`, login returns `{ token, user }`, reset and stats live under `/api/admin`, and the reconcile CLI exits 0/2/1. The Phase 2 test helpers already spawn `scripts/reconcile.ts` shell-less with `process.execPath --import <tsx URL>`. I re-ran that form from outside the backend across the Vietnamese path, and it works (≈0.9 s startup).

Four findings change how the plan should be written:

1. **Windows ephemeral-port exhaustion is real on this machine.** I measured it. The dynamic range is 16,384 ports and TIME_WAIT lasts about 120 s. After ~16k short-lived loopback connections, autocannon got **100% connection errors for about 60 s**. E2 at 500 connections opens about 12,000 new connections per level, and E1 can open up to 15,000. The harness needs a pacing guard that checks TIME_WAIT before each burst or invocation. Without it, E2 records fake connection errors and E1 goes INVALID.
2. **autocannon timing.** The `done` callback fires on the next 1 s sample tick, which I measured at ~0.45–0.5 s after the last response. Wall-clock around the call nearly doubled the measured duration in my probe. Duration has to run from just before the call to the last `response` event.
3. **Mongoose 9.11.4 does not buffer model operations after the initial connection.** `Collection.prototype.onClose` is a no-op and `buffer` only ever flips to `false`. During an outage each operation fails after the driver's 5 s `serverSelectionTimeoutMS`. A failing V2 buy takes ≈ 5 s (insert) + ≈ 5 s (the `findOne` in compensate) ≈ 10 s, then 500. **No `bufferCommands` change is needed.**
4. **E4's predicted result is drift, not PASS.** The current compensate path deliberately does *not* refund when the lookup also fails ("undersell, never oversell"). Every Lua-success-then-500 during the outage leaves Redis one unit low with one extra buyer.

**Primary recommendation:** Build `loadtest/` on `fetch` (E1/E3/E4) and autocannon 8.0.0 callback form (E2). Collect counts in `onResponse` and timestamps and latency in the instance `response` event. Add a TIME_WAIT pacing guard in `lib/`. Leave `connectMongo` unchanged for E4.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Load generation (E1 burst, E2 autocannon, E3, E4 loop) | Load-test client (`loadtest/`, own process) | — | Must never run inside the API process (STACK). Talks HTTP only |
| Preflight, verdicts, CSV/raw output | Load-test client | — | Pure logic, unit-testable with `node --test` |
| Reset with `totalQty` (D-01) | API / Backend (`sale-admin.service` + `admin.controller`) | Database (Mongo `$set`, Redis `multi()`) | Shared service already used by CLI and route. Validation lives in the controller, before the service |
| `uniqueOrderIndex` (D-07) | API / Backend (`getStats`) | Database (`listIndexes`) | The harness is HTTP-only, and only the backend can see indexes |
| Consistency check after V2 runs | Backend CLI (`scripts/reconcile.ts`) spawned by harness | API stats `redisInSync` | The single allowed non-HTTP touchpoint (CONTEXT boundary) |
| Mongo outage (E4) | Load-test client via `docker` CLI | — | Fixed container name `flashsale-mongo`, shell-less spawn |
| TIME_WAIT pacing guard | Load-test client (OS probe via `netstat`) | — | Client-side ephemeral ports are what run out |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| autocannon | `^8.0.0` (resolves 8.0.0, published 2024-10-14) | E2 load generation | Locked by D-05/SPECS. **Do not take 9.0.0** (published 2026-11-06, 3 days old; `^8` already excludes it) [VERIFIED: npm registry `npm view autocannon time`] |
| Node built-in `fetch` (undici) | Node 24.22.1 runtime | E1/E3/E4 requests | SPECS locks fetch + Promise.all for E1. Default dispatcher has no per-origin socket cap, so 1,000 requests ran in parallel in my probe [VERIFIED: local probe] |
| `node:test` | built-in | Harness unit tests | Same runner as the backend (`node --import tsx --test "test/*.test.ts"`) [VERIFIED: backend/package.json `"test": "npm run build && node --import tsx --test \"test/*.test.ts\""`] |
| `node:util` `parseArgs` | built-in | CLI flags (D-03) | Same style as `backend/scripts/cli-args.ts` [VERIFIED: cli-args.ts:3,40] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @types/autocannon | `^7.12.7` | Types | Types `setupRequest`, `onResponse(status, body, context, headers)`, instance `"response"` `(client, statusCode, resBytes, responseTime)` [VERIFIED: index.d.ts:288-326 in tarball] |
| tsx | `^4.23.15` | Run scenarios; also the `--import` loader for the reconcile spawn | Same version as backend [VERIFIED: backend/node_modules/tsx 4.23.15] |
| typescript | `~7.0.2` | `typecheck` | A skeleton of the harness patterns below type-checked clean on 7.0.2 with the backend tsconfig options [VERIFIED: local tsc run] |
| @types/node | `^24.19.2` | Node types | Match backend |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| autocannon `amount` | `duration` | Rejected by D-21: `amount` gives identical work per mode |
| Wall-clock around the autocannon call | autocannon `result.duration` | Both include the ~0.5 s tail. Use own timestamps (Pitfall 2) |
| `tsx scenarios/x.ts` | `node --import tsx scenarios/x.ts` | Both work. `tsx file` matches backend `seed`/`reset`/`reconcile` scripts; pick one and use it for all four |

**Installation (in `loadtest/`):**
```bash
npm install autocannon@^8.0.0
npm install -D @types/autocannon@^7.12.7 @types/node@^24.19.2 tsx@^4.23.15 typescript@~7.0.2
```

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| autocannon | npm | 8.0.0: ~2 yrs (9.0.0: 3 days) | ~887k/wk | github.com/mcollina/autocannon | [SUS] ("too-new" refers to the 9.0.0 latest tag) | Approved at `^8.0.0` (8.0.0 is the only 8.x and is mature). Planner: a light `checkpoint:human-verify` that `package-lock.json` resolved 8.0.0, not 9.x |
| @types/autocannon | npm | 7.12.7, 2025-05 | ~449k/wk | DefinitelyTyped | [OK] | Approved |
| tsx | npm | mature | ~139M/wk | github.com/privatenumber/tsx | [OK] | Approved |
| typescript | npm | mature | ~418M/wk | github.com/microsoft/TypeScript | [OK] | Approved |
| @types/node | npm | mature | very high | DefinitelyTyped | [SUS] ("too-new" refers to the latest major tag) | Approved at `^24.19.2`, the version the backend already installs |

No `postinstall` scripts on autocannon (`npm view autocannon@8.0.0 scripts.postinstall` → empty).
**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** autocannon, @types/node. Both flags come from the *latest* tag being days old, not from the pinned versions.

## Architecture Patterns

### System Architecture Diagram

```
 operator terminal A: backend/ npm run start:test  (compiled, NODE_ENV=test via .env.test)
 operator terminal B: loadtest/ npm run eN -- [flags]
        │
        ▼
 [config: parseArgs + env fallbacks] ──► [env-info: node/os/cpu/mem, git rev + dirty]
        │
        ▼
 [preflight] GET /api/health (200, mongo&&redis, testMode===true, maxPoolSize)
        │      POST /api/auth/login → token
        │      sale id (--sale or GET /api/sales/active → exactly 1)
        │      GET stats → uniqueOrderIndex===true ; remember original {mode,totalQty}
        │   fail ─► INVALID (exit 2)
        ▼
 ┌─ for each planned run ───────────────────────────────────────────────┐
 │ [port guard] netstat TIME_WAIT to :5000 + planned sockets ≤ budget?   │
 │      no → wait/poll (bounded)                                         │
 │ POST reset {mode,totalQty} ─► GET stats ─► pre-run checks (D-06.4)    │
 │      mismatch → INVALID, stop                                         │
 │ generate ids (assert distinct === planned)                            │
 │ LOAD: E1/E3 fetch burst │ E2 autocannon in_stock then sold_out │ E4   │
 │ classify (status+code), latencies, timestamps → raw JSON             │
 │ GET stats ; v2 → spawn reconcile.ts (no shell, cwd backend) exit 0/2  │
 │ verdict(run) → append CSV row                                         │
 │ INVALID → break                                                       │
 └──────────────────────────────────────────────────────────────────────┘
        ▼
 [restore] POST reset {original mode, original totalQty} (best-effort, print)
        ▼
 [summary] per-mode table (E2: medians) + one Vietnamese verdict line → exit 0/1/2

 E4 only: load loop ─(201s ≥ 30%)→ docker stop flashsale-mongo → load 5 s → stop issuing,
          await in-flight → docker start → poll /api/health ≤ 60 s → stats → reconcile
          → (drift) reconcile --fix → re-check
```

### Recommended Project Structure
```
loadtest/
├── package.json            # "type":"module", scripts e1 e2 e3 e4 typecheck test
├── tsconfig.json           # copy of backend/tsconfig.json, include lib scenarios test
├── README.md               # measurement procedure (D-31)
├── lib/
│   ├── config.ts           # parseArgs + LOADTEST_* env fallbacks
│   ├── http.ts             # buy() with fetch, classify(status, code), timeouts
│   ├── admin.ts            # login, reset({mode,totalQty}), stats, health, activeSale
│   ├── ids.ts              # session prefix + run + counter → 24 lowercase hex
│   ├── csv.ts              # escaping, number format, append-as-you-go writer
│   ├── histogram.ts        # nearest-rank percentiles on Float64Array
│   ├── env-info.ts         # node/os/cpu/mem, git short sha + dirty
│   ├── ports.ts            # TIME_WAIT count + pacing guard (Pitfall 1)
│   ├── preflight.ts        # D-06 checks
│   ├── reconcile.ts        # shell-less spawn of backend/scripts/reconcile.ts
│   └── verdict.ts          # per-experiment PASS/FAIL/INVALID rules, exit codes
├── scenarios/
│   ├── e1-correctness.ts
│   ├── e2-performance.ts
│   ├── e3-duplicate.ts
│   └── e4-mongo-outage.ts
├── test/                   # node --test units (D-32)
└── results/
    ├── .gitkeep
    ├── e1.csv e2.csv e3.csv (e4.csv)   # committed
    └── raw/                             # git-ignored
```

### Pattern 1: autocannon phase runner (counts in `onResponse`, timing in `response` event)
**What:** One autocannon invocation per phase. `setupRequest` takes the next id from a shared counter. `onResponse(status, body)` classifies by status plus JSON `code`. The instance `response` event records `responseTime` and a timestamp. Duration runs from just before the call to the last response.
**When to use:** Every E2 in_stock / sold_out phase and every warm-up.
**Verified facts this pattern relies on:**
- `amount` is split per connection (`url.responseMax = distributeNums(amount, i)`). Each client writes exactly its quota, so total `setupRequest` calls equal `amount`. Probe at 100 and 500 connections, amount 10,000: `setupCalls` 10000, server saw 10000 distinct ids, 0 duplicates [VERIFIED: run.js:193-197, httpClient.js `_doRequest`; local probe].
- `amount < connections` **throws synchronously** (`connections cannot be greater than amount`), even with a callback [VERIFIED: probe output].
- The body is always accumulated (`kOnBody → addBody`), and `recordBody → request.onResponse(status, body, context, headers)` runs synchronously right before `emit('response', …)` for the same response [VERIFIED: httpClient.js kOnMessageComplete].
- `responseTime` is `process.hrtime` from request write to message complete, in float ms [VERIFIED: pipelinedRequestsQueue.js `terminateRequest`].
- A timeout increments **both** `errors` and `timeouts`. A connection error increments `errors` only [VERIFIED: run.js `onTimeout`/`onError`].
- The result arrives only on the next `sampleInt` tick (default 1000 ms). Probe: last response → callback = 498 ms and 444 ms. autocannon's `duration` reported 1.03 s vs 0.54 s real [VERIFIED: probe].

```typescript
// Source: verified against autocannon@8.0.0 lib/run.js, lib/httpClient.js; type-checked with TS 7.0.2 + @types/autocannon 7.12.7
import autocannon from "autocannon";

export function runPhase(o: { baseUrl: string; saleId: string; mode: "v1" | "v2"; connections: number; amount: number; nextId: () => string }) {
  if (o.amount < o.connections) throw new Error("amount phải >= connections"); // autocannon ném đồng bộ nếu không
  const latencies = new Float64Array(o.amount);
  let n = 0;
  let lastAt = 0;
  const codes = new Map<string, number>(); // "201:", "409:SOLD_OUT", "409:ALREADY_BOUGHT", "500:INTERNAL_ERROR"...
  const startedAt = performance.now();
  return new Promise<{ result: autocannon.Result; durationMs: number; latencies: Float64Array; codes: Map<string, number> }>((resolve, reject) => {
    const inst = autocannon(
      {
        url: o.baseUrl, connections: o.connections, pipelining: 1, timeout: 10, amount: o.amount,
        requests: [{
          method: "POST",
          path: `/api/sales/${o.saleId}/buy?mode=${o.mode}`,
          setupRequest: (req) => ({ ...req, headers: { ...req.headers, "content-type": "application/json", "x-test-user": o.nextId() }, body: '{"qty":1}' }),
          onResponse: (status, body) => {
            let code = "";
            try { const j: unknown = JSON.parse(body); if (typeof j === "object" && j !== null && typeof (j as { code?: unknown }).code === "string") code = (j as { code: string }).code; } catch { /* body không phải JSON */ }
            const k = `${status}:${code}`;
            codes.set(k, (codes.get(k) ?? 0) + 1);
          },
        }],
      },
      (err: unknown, result: autocannon.Result) => (err ? reject(err) : resolve({ result, durationMs: lastAt - startedAt, latencies: latencies.subarray(0, n), codes })),
    );
    inst.on("response", (_c, _s, _b, responseTime) => { if (n < latencies.length) latencies[n++] = responseTime; lastAt = performance.now(); });
  });
}
// connErrors = result.errors - result.timeouts ; realErrors = s5xx + result.errors   (errors already includes timeouts)
```

### Pattern 2: E1/E3 burst with fetch (all promises first)
**What:** Build the id array, assert distinct, create every `fetch` promise in a synchronous loop, then `Promise.all`. Always consume the body (`await res.text()`), which also releases the socket. Use `AbortSignal.timeout(30_000)` per request so a hang becomes a counted timeout instead of a stuck run.
**Evidence:** Probe with 1,000 concurrent `fetch` POSTs against a separate-process Node HTTP server on this machine: 7 runs, all `201`, including runs after 4.8, 4.95, 5.05, 5.2, 6 and 10 s idle (keep-alive reuse around Node's 5 s `keepAliveTimeout`) [VERIFIED: local probe]. Phase 2 already shows V0 overselling with 100 concurrent users on stock 10 within ≤ 3 attempts [VERIFIED: backend/test/integration/buy.test.ts:432-441].
**Error classification:** `fetch` rejects with `TypeError("fetch failed")` and a `cause.code` (`ECONNRESET`, `ECONNREFUSED`, `UND_ERR_*`) → connErrors. An abort from `AbortSignal.timeout` rejects with a `TimeoutError` DOMException → timeout [ASSUMED: standard undici/WHATWG behaviour, not probed].

### Pattern 3: Reconcile spawn (D-10), shell-less, survives the Vietnamese path
```typescript
// Source: same form as backend/test/helpers.ts spawnCli (["--import", TSX_LOADER, entry, ...args]); re-probed from outside backend/
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BACKEND_DIR = fileURLToPath(new URL("../../backend/", import.meta.url)); // fileURLToPath, never URL.pathname
const TSX_LOADER = import.meta.resolve("tsx");                                  // file:// URL of loadtest's tsx

export function runReconcile(saleId: string, fix = false): Promise<{ code: number | null; out: string }> {
  const args = ["--import", TSX_LOADER, path.join(BACKEND_DIR, "scripts", "reconcile.ts"), "--sale", saleId, ...(fix ? ["--fix"] : [])];
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd: BACKEND_DIR, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let out = "";
    child.stdout.setEncoding("utf8").on("data", (d: string) => (out += d));
    child.stderr.setEncoding("utf8").on("data", (d: string) => (out += d));
    const timer = setTimeout(() => child.kill(), 30_000);
    child.once("error", (e) => { clearTimeout(timer); reject(e); });
    child.once("close", (code) => { clearTimeout(timer); resolve({ code, out }); });
  });
}
```
- `cwd: BACKEND_DIR` matters. `src/config/env.ts` does `import "dotenv/config"` (loads `.env` from cwd), so reconcile reads the same `MONGODB_URI` as the server. `.env.test` only injects `NODE_ENV` ("injected env (1) from …\.env.test") [VERIFIED: env.ts:1; 01-01-SUMMARY.md:189 "`backend/.env.test` - `NODE_ENV=test` only"; 01-10-SUMMARY.md:142].
- Probe from the scratchpad using the backend tsx loader, with `--sale khong-hop-le`: exit 1 in 917 ms, Vietnamese stderr decoded correctly [VERIFIED: probe]. The tsx package export `"."` is `"./dist/loader.mjs"` [VERIFIED: tsx package.json].

### Pattern 4: TIME_WAIT pacing guard (new, required)
**What:** Before each E1/E3 burst and each autocannon invocation, count TCP sockets in TIME_WAIT whose endpoint is the server port. If `count + plannedNewSockets > budget`, poll every ~5 s until it fits, with a bounded wait of ≥ 150 s. Record waited ms in raw JSON and a short `note`.
- Windows: `netstat -an -p tcp`, lines with `TIME_WAIT` and `127.0.0.1:5000`. macOS prints `127.0.0.1.5000`, so match both forms.
- Spawn with a **large `maxBuffer`** (≥ 64 MiB) or stream stdout. With the default 1 MiB, `execFileSync` died with `ENOBUFS` at ~15k lines [VERIFIED: probe crash].
- Budget suggestion: 10,000. The dynamic range here is 16,384 starting at 49152, and other apps need headroom [VERIFIED: `netsh int ipv4 show dynamicport tcp`].
- Planned sockets: E2 = `connections`. E1 = `users`, worst case (undici reuses idle keep-alive sockets when the gap between runs is short, but that is not guaranteed). E3 = 10.

### Pattern 5: Preflight and per-run stats contract
Use the stats fields exactly as defined. Quoted from `backend/src/services/sale-admin.service.ts:27-46` [VERIFIED]:
`saleId: string; mode: SaleMode; status: SaleStatus; totalQty: number; mongoRemaining: number; redisStock: number | null; redisBuyers: number; orders: number; distinctUsers: number; oversold: number; redisInSync: boolean | null;` (plus new `uniqueOrderIndex: boolean`).
Health body, quoted from `health.controller.ts:18-24` [VERIFIED]: `mongo, redis, nodeEnv: deps.cfg.nodeEnv, testMode: deps.cfg.isTestMode, maxPoolSize: deps.cfg.mongoMaxPoolSize`, with status `mongo && redis ? 200 : 503`.
Login response, quoted from `auth.service.ts:15-18` [VERIFIED]: `export interface AuthResponse { token: string; user: AuthUser; }`. Route `router.post("/login", controller.login)` under `/api/auth` [VERIFIED: auth.routes.ts:11].
Active sales: `GET /api/sales/active` → `{ now, sales }`. Each sale has `id: string`, `mode`, `totalQty` [VERIFIED: sale.controller.ts:36; dto.ts:90-105].
Response codes the classifier must know, quoted from `http-error.ts:8-23` [VERIFIED]: `"SOLD_OUT"`, `"ALREADY_BOUGHT"`, `"INVALID_MODE"`, `"VALIDATION_ERROR"`, `"UNAUTHORIZED"`, `"INTERNAL_ERROR"`, `"STOCK_NOT_LOADED"`, `"SALE_NOT_ACTIVE"`, `"NOT_FOUND"`. Generic 500 sends `"INTERNAL_ERROR"` [VERIFIED: error.ts:53-54].

### Pattern 6: Backend D-01 / D-07 changes
- **D-01 controller:** keep the existing `mode` check first, then `raw = body.totalQty`; if `raw !== undefined` require `typeof raw === "number" && Number.isSafeInteger(raw) && raw >= 1 && raw <= 1_000_000`, else `HttpError(400, …, "VALIDATION_ERROR")`. Pass `{ mode?, totalQty? }` to `resetSale`.
- **D-01 service:** `const totalQty = opts.totalQty ?? sale.totalQty;`, then `$set: { totalQty, remainingQty: totalQty, … }`. The existing `multi().set(stockKey, String(totalQty))` and `StockMovement.create({ … delta: totalQty, reason: "reset" })` then carry the new value automatically [VERIFIED: sale-admin.service.ts:72-106]. Keep the service-level validation too, because the CLI calls the service directly.
- **Upper bound:** keep 1,000,000. It matches the seed's existing `const MAX_QTY = 1_000_000;` [VERIFIED: cli-args.ts:19], so `parseQty` can be reused for reset `--qty`. No reason found to change it.
- **D-07:** add `Order.listIndexes()` to the `Promise.all` in `getStats`. Return type is `Promise<Array<any>>` [VERIFIED: mongoose types/indexes.d.ts:41], so narrow it. True when some index has `unique === true` and `key` has exactly the keys `saleId`, `userId` (in that order) with value `1`. Existing tests confirm listIndexes reports `unique: true` on `saleId_1_userId_1` [VERIFIED: models.test.ts:98]. Catch `MongoServerError` code 26 (NamespaceNotFound, collection missing) → `false`, and rethrow anything else [ASSUMED: server returns 26 for a missing collection; MongoDB docs page is silent]. `Model.listIndexes` only waits on a queue while `$__collection.buffer` is true, which is never the case after connect [VERIFIED: model.js:1617-1630].

### Anti-Patterns to Avoid
- **Timing autocannon with wall-clock around the call:** adds ~0.5 s per phase (Pitfall 2).
- **`realErrors = errors + timeouts`:** double counts, because `errors` already includes timeouts.
- **`Array.prototype.sort()` without a comparator on latencies:** sorts lexicographically. Use `Float64Array.prototype.sort()` (numeric) or `(a, b) => a - b`.
- **Spawning `npm run reconcile` / `npx`:** `.cmd` shims need a shell on Windows. Use `process.execPath`.
- **Passing paths via `URL.pathname`:** ENOENT on the Vietnamese path. Use `fileURLToPath`.
- **Session ids with `:` in file names:** invalid on Windows. Use a compact UTC stamp like `20261109T103000Z-ab12`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Redis–Mongo consistency check | Own Redis/Mongo reads in the harness | Spawn `backend/scripts/reconcile.ts` (+ stats `redisInSync`) | Single source of truth, already tested (exit 0/2/1). Harness is HTTP-only by decision |
| High-concurrency keep-alive load | Custom socket pool / `http.Agent` loop for E2 | autocannon 8 | Locked. Its per-connection `amount` quota is exactly what D-21 needs |
| CLI parsing | Hand-written argv parsing | `node:util` `parseArgs` strict | Same as backend, rejects unknown flags |
| Percentiles | autocannon histogram (`p97_5`, no `p95`) | Nearest-rank on own `Float64Array` | SPECS requires p95. HDR buckets are approximate |
| Process-tree kill / server lifecycle | Starting/stopping backend from the harness | Operator runs `start:test` (D-02) | Windows wrapper needs `taskkill /T`, out of scope |

**Key insight:** The harness's job is to *not* distort the measurement. Every piece of custom code on the hot path (logging, sorting, JSON parsing beyond the tiny body) runs in the same CPU budget as the server under test.

## Runtime State Inventory

Not a rename/refactor phase. Omitted except for one relevant item: the official CSVs will be written by the operator's machine. `core.autocrlf=true` is set globally there, so committed LF CSVs check out as CRLF on Windows clones [VERIFIED: `git config --show-origin core.autocrlf` → `file:C:/Users/sonma/.gitconfig true`; no `.gitattributes` in repo]. See Pitfall 8.

## Common Pitfalls

### Pitfall 1: Windows ephemeral-port exhaustion (TIME_WAIT)
**What goes wrong:** After ~16k short-lived loopback connections within ~2 min, new connects fail. E2 then records thousands of `connErrors`, and E1 goes INVALID.
**Evidence:** 30 back-to-back autocannon invocations (500 connections each) built 14,976 TIME_WAIT sockets on the target port with 0 errors. A second session started while ~16,200 were still in TIME_WAIT: invocations 1–24 got `errors=1000` of 1000, recovering only after ~70 s. TIME_WAIT sockets cleared after ~110–120 s [VERIFIED: local probe]. `TcpTimedWaitDelay` is unset, so the OS default applies [VERIFIED: reg query].
**Why it happens:** autocannon destroys all its sockets at the end of each invocation (active close on the client), so every connection leaves a client-side TIME_WAIT for ~120 s.
**How to avoid:** Pattern 4 pacing guard. Do not change system settings (CLAUDE.md). Mention in README that E2 includes cool-down waits.
**Warning signs:** `connErrors` > 0 clustered in the 500-connection level; errors like `EADDRINUSE`/`ECONNREFUSED`.

### Pitfall 2: autocannon duration includes up to ~1 s of idle tail
**What goes wrong:** rps is understated by up to ~2× for short phases (5,000 requests at a few thousand rps last ~1–3 s).
**Why:** Results are emitted on the next `sampleInt` (1000 ms) tick after all clients finish [VERIFIED: run.js `tickInterval` + probe 444–498 ms].
**How to avoid:** `durationMs = lastResponseAt − startedAt`, both from `performance.now()` in the harness. This still matches D-23's "measured by the harness". Document the definition in README.

### Pitfall 3: Double-counting timeouts
`result.errors` already includes `result.timeouts` [VERIFIED: run.js `onTimeout` does `errors++; timeouts++`]. Use `connErrors = errors − timeouts`, `realErrors = s5xx + errors`.

### Pitfall 4: `amount < connections` crashes the run
autocannon throws synchronously. Smoke runs with small `--stock` at 500 connections hit this. Validate up front, or let smoke mode use a `--connections` override.

### Pitfall 5: E2 correctness check vs real errors (D-25 edge)
If any in_stock request hits a connection error or timeout, stock may not be exhausted (`orders < S`). D-25 would then call it FAIL (exit 1), which blames an environment fault on correctness. A client timeout can also leave an order the harness never saw as 201. See Open Question 2 (RESOLVED by the D-25 amendment 2026-11-09). The pacing guard makes this unlikely, but the rule needs a defined outcome.

### Pitfall 6: Reconcile exit 0 when the sale is not v2
`reconcile.ts` skips non-v2 sales (`bỏ qua (mode …)`) and still exits 0 [VERIFIED: reconcile.ts:89-92,110-111]. Only spawn after stats confirmed `mode === "v2"`. For robustness, also require stdout to contain `(v2): KHỚP` for "clean" [VERIFIED: reconcile.ts:65 text `Đợt sale ${c.saleId} (v2): KHỚP`].

### Pitfall 7: E4 hangs and ordering
Each failing V2 buy during the outage takes ~10 s (two 5 s server-selection waits). Use a per-request timeout ≥ 30 s. **Await all in-flight requests before `docker start`.** Otherwise some compensate `findOne` calls succeed after restart and refund, which makes the result timing-dependent. After `docker start`, `/api/health` stays 503 until the driver's next heartbeat, up to `heartbeatFrequencyMS` 10,000 ms default. `pingMongo` returns false without issuing an op while `readyState !== 1`, so polling health does not speed it up. Use a ≥ 60 s health wait [VERIFIED: db.ts:20-22; mongodb connection_string.js:661-663; mongoose connection.js `_setClient` Single-topology handler].

### Pitfall 8: CRLF on checkout / Excel and the Vietnamese `note`
`core.autocrlf=true` turns the committed LF CSVs into CRLF in Windows working trees, so Phase 5 parsers must split on `/\r?\n/`, or add `.gitattributes` with `loadtest/results/*.csv text eol=lf` (Phase 4 DEV-04 creates `.gitattributes` anyway). UTF-8 without BOM (D-11) makes Excel misread Vietnamese `note` text. README should say to import as UTF-8.

### Pitfall 9: gitCommit `-dirty` from the experiment's own outputs
Running E1 then E3 before committing marks E3 rows `-dirty`, because `e1.csv` changed. Compute dirty as `git status --porcelain --untracked-files=no -- backend loadtest ":(exclude)loadtest/results"`. Verified to work on git 2.49 without a shell [VERIFIED: probe]. Capture once at session start.

### Pitfall 10: Existing tests that must change with D-01/D-07
- `backend/test/cli-args.test.ts:103-105`: `it("không có --qty cho reset (reset không đổi totalQty)", … assert.throws(() => parseResetArgs(["--qty", "5"]), CliArgsError))` will fail once `--qty` exists. Replace it [VERIFIED].
- `backend/test/integration/admin.test.ts:26-38`: `STATS_KEYS` deep-equals the sorted key list (`"distinctUsers", "mode", "mongoRemaining", "orders", "oversold", "redisBuyers", "redisInSync", "redisStock", "saleId", "status", "totalQty"`). Add `"uniqueOrderIndex"` and fix the "Mười một trường" comment [VERIFIED].
- `RESET_USAGE` string at cli-args.ts:16 needs `[--qty <n>]` [VERIFIED].

## Code Examples

### Nearest-rank percentile
```typescript
// p in (0,100]; sorted ascending (Float64Array.sort is numeric)
export function nearestRank(sorted: Float64Array, p: number): number {
  if (sorted.length === 0) return Number.NaN;
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(Math.max(rank, 1), sorted.length) - 1]!;
}
```

### Shell-less docker / git (E4, env-info)
```typescript
// Verified: spawnSync("docker", ["--version"]) and spawnSync("git", ["rev-parse","--short","HEAD"]) succeed without a shell
// (docker.exe / git.exe resolve via PATH; only .cmd/.bat need a shell)
spawnSync("docker", ["stop", "flashsale-mongo"], { encoding: "utf8" });
spawnSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" });
```
Container name quoted from `docker-compose.yml`: `container_name: flashsale-mongo` [VERIFIED].

### .gitignore change (D-12)
```
loadtest/results/*
!loadtest/results/.gitkeep
!loadtest/results/*.csv
```
Verified in a throwaway repo: `e1.csv` and `.gitkeep` tracked, `raw/*.json` and even `raw/x.csv` ignored [VERIFIED: probe]. Current rules quoted: `loadtest/results/*` / `!loadtest/results/.gitkeep` [VERIFIED: .gitignore].

### Backend integration test placement (D-32)
Redis db indices already used by integration tests: 1 (health), 2 (seed, models), 3 (reset), 4 (auth), 5 (redis-boot), 6 (lua), 7 (buy), 8 (compensation), 9 (read), 10 (admin), 11 (reconcile) [VERIFIED: grep of `connectTestStores(`/`testRedisUrl(` across test/integration]. **Next free: 12** (13–15 also free). Use `connectTestStores("<name>", 12)` and `testMongoUri("<name>")`. For the D-07 false cases, drop `saleId_1_userId_1`, then create a non-unique index with the same key (pattern already in models.test.ts:169-171), then drop the `orders` collection (NamespaceNotFound path).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| ARCHITECTURE.md: "set `bufferCommands: false` or short `bufferTimeoutMS` for E4" | Not needed: Mongoose 9.11.4 never re-enables collection buffering after the first open (`Collection.prototype.onClose = function() {}`; only `onOpen` sets `buffer = false`) | Mongoose source as installed | D-30 needs no backend change. The bound is the driver's `serverSelectionTimeoutMS: 5000` already in db.ts:13 |
| autocannon 8 | autocannon 9.0.0 released 2026-11-06 | 3 days ago | Stay on `^8.0.0` (locked). 9.x not evaluated |

**Deprecated/outdated:** the ARCHITECTURE.md bufferCommands note (above).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `listIndexes` on a missing collection returns MongoServerError code 26 (NamespaceNotFound) | Pattern 6 | The stats endpoint 500s instead of returning `uniqueOrderIndex:false`. The integration test (drop collection) will reveal it |
| A2 | E4 runtime behaviour (≈5 s + 5 s per failing buy, then 500, no refund) matches the source reading | Summary, Pitfall 7, Open Q1 | E4 outcome or timing differs. The executor smoke run must confirm with Docker running |
| A3 | `fetch` timeout via `AbortSignal.timeout` surfaces as `TimeoutError`, connection failures as `TypeError` with `cause.code` | Pattern 2 | Misclassified error buckets. Unit-test the classifier with constructed errors and smoke-check |
| A4 | Windows TIME_WAIT default ≈120 s on the operator's machine (observed ~110–120 s here) | Pitfall 1 | The guard waits too short or too long. Guard measures live counts, so impact is low |
| A5 | 1,000-concurrent E1 bursts behave the same against the real Express server as against the probe `http` server (same Node `net` accept path) | Pattern 2 | Rare connection resets → E1 INVALID. Executor smoke run with `--users 1000 --runs 1` confirms |

## Open Questions (RESOLVED)

1. **E4 success criterion vs designed behaviour — RESOLVED 2026-11-09:** user accepted the recommendation; see 03-CONTEXT.md D-29 (amended): PASS = no oversell + reconcile `--fix` and re-check exit 0, drift before `--fix` is the expected undersell finding (`driftUnits` recorded next to `s5xx`), backend unchanged. Implemented by 03-06-PLAN (`judgeE4Run`, `driftUnits` column).
   - What we know: with Mongo stopped, V2 runs Lua (stock −1, buyer added), then `Order.create` fails, then compensate's `findOrder` also fails → *no refund*, 500 [VERIFIED: purchase.service.ts compensate, lines 170-176 "Không biết đơn có được ghi hay không: không hoàn kho (bán thiếu)"]. Reconcile will report drift ≈ number of such 500s (stock low by k, k extra buyers, no missing buyers, no oversell).
   - What's unclear: ROADMAP criterion 5 says "after compensation the reconcile script shows Redis and orders agree". D-29 would mark this FAIL (exit 1), then `--fix` repairs it.
   - Recommendation: keep D-29's mechanics and add a `driftUnits` vs `s5xx` comparison in raw/note. Ask the user, at the E4 plan's checkpoint, to accept "drift (undersell only) → `--fix` restores sync" as the expected E4 finding. If not, change the verdict wording to PASS = "no oversell and `--fix` restores sync". Do not change the backend: refunding on an unknown write would reintroduce the WR-01 oversell risk.

2. **D-25 when an in_stock phase has real errors — RESOLVED 2026-11-09:** user accepted the recommendation; see 03-CONTEXT.md D-25 (amended): with `realErrors > 0` the in_stock check is `oversold === 0 && orders <= S && distinctUsers === orders` plus note `kho chưa hết`; with `realErrors === 0`, `orders !== S` stays FAIL. Implemented by 03-04-PLAN (`judgeE2Run`).
   - What we know: real errors are counted, not invalidating. But with errors, `orders === S` may legitimately fail.
   - Recommendation: if `realErrors > 0` in in_stock, judge correctness as `oversold === 0 && orders <= S && distinctUsers === orders`, and note `kho chưa hết`. Only `orders !== S` with `realErrors === 0` is FAIL. Planner should confirm with the user, since it refines a locked rule.

3. **Smoke at 500 connections — RESOLVED (planner's discretion, as recommended):** 03-04-PLAN `parseE2Args` accepts `--connections <list>` only with `--smoke` (smoke rows marked "smoke"), and rejects any amount below the largest connections value; no silent clamping.
   - `amount ≥ connections` is required. Recommend `--connections <list>` for smoke only (rows marked smoke), rather than silently clamping.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | everything | ✓ | v24.22.1 | — |
| npm | install/scripts | ✓ | 11.19.1 (`npm.ps1` reparses the line, so `--` survives in PowerShell) | — |
| Docker CLI | E4, backend integration tests, smoke runs | ✓ | 29.7.2 | — |
| Docker daemon (Docker Desktop) | Mongo/Redis for tests and all experiments | ✗ at research time ("failed to connect to the docker API … dockerDesktopLinuxEngine") | — | **None.** The user must start Docker Desktop before integration tests or smoke runs (blocking for verification, not for writing code) |
| git | gitCommit column | ✓ | 2.49.0.windows.1 | blank column (D-11) |
| netstat | TIME_WAIT guard | ✓ (Windows built-in) | — | skip guard with a warning if spawn fails |
| backend/node_modules | reconcile spawn, backend tests | ✓ | mongoose 9.11.4, mongodb 7.7.0, tsx 4.23.15, typescript 7.0.2 | — |

**Missing dependencies with no fallback:** Docker daemon must be running for backend integration tests (D-01/D-07), smoke sessions (D-33) and official runs.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `node:test` (Node 24) + tsx 4.23.15 loader |
| Config file | none. Scripts in `package.json` |
| Quick run command | `cd loadtest && npm test` (pure units, no Docker) |
| Full suite command | `cd backend && npm run typecheck && npm test && npm run test:int` and `cd loadtest && npm run typecheck && npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| EXP-01 | ids unique/24-hex lowercase; CSV escape + number format; classify(status, code); env-info git fallback; port-guard parsing (Windows + macOS netstat lines) | unit | `cd loadtest && npm test` | ❌ Wave 0 |
| EXP-01 (D-01) | reset `{totalQty}` sets totalQty/remainingQty/Redis stock/stock_movements delta; 400 for `"100"`, 0, -1, 1.5, 1000001, true, null; mode-first ordering; CLI `--qty` | integration + unit | `cd backend && npm run test:int` / `npm test` (cli-args) | ❌ new file (Redis db 12); edit cli-args.test.ts |
| EXP-01 (D-07) | `uniqueOrderIndex` true / false (dropped, non-unique same key, collection missing) | integration | `cd backend && npm run test:int` | ❌ new; edit admin.test.ts STATS_KEYS |
| EXP-02/03 | E1 verdict rules (V0 must oversell every run; V1/V2 exact; INVALID triggers) | unit | `cd loadtest && npm test` | ❌ Wave 0 |
| EXP-02/03 | E1 end-to-end | smoke (needs Docker + start:test) | `cd loadtest && npm run e1 -- --runs 1` | manual/executor |
| EXP-04 | E3 verdict rules + smoke | unit + smoke | `npm test`; `npm run e3 -- --runs 1` | ❌ Wave 0 |
| EXP-05/06 | nearest-rank percentiles, rps from own timestamps, errors/timeouts arithmetic, E2 verdict | unit | `cd loadtest && npm test` | ❌ Wave 0 |
| EXP-05/06 | E2 end-to-end | smoke | `npm run e2 -- --smoke --runs 1 --stock 1000 --soldout-requests 1000` (connections override if adopted) | manual/executor |
| EXP-07 | README procedure present, scripts exist | manual review | — | ❌ |
| EXP-08 | E4 end-to-end | smoke (stops Mongo) | `npm run e4` | manual/executor |

### Sampling Rate
- **Per task commit:** `npm run typecheck` in the touched package + `cd loadtest && npm test`
- **Per wave merge:** backend `npm test && npm run test:int` (Docker up) + loadtest `npm test`
- **Phase gate:** both packages typecheck/test green, backend `build` green, smoke e1/e3/e2 (e4 if kept) exit as expected, then official runs as `checkpoint:human-action`

### Wave 0 Gaps
- [ ] `loadtest/package.json`, `tsconfig.json`, `test/` folder: framework scaffold
- [ ] `loadtest/test/ids.test.ts`, `csv.test.ts`, `histogram.test.ts`, `http-classify.test.ts`, `verdict.test.ts`, `env-info.test.ts`, `ports.test.ts`
- [ ] `backend/test/integration/<new>.test.ts` (Redis db 12) for D-01 + D-07
- [ ] Edits: `backend/test/cli-args.test.ts` (`--qty` now valid), `backend/test/integration/admin.test.ts` (`STATS_KEYS`)

## Security Domain

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (harness logs in as admin) | Credentials from env with seed defaults. Never print the token. Admin calls use `Authorization: Bearer` |
| V3 Session Management | no | — |
| V4 Access Control | yes | Reset/stats stay behind `requireAuth` + `requireAdmin` (unchanged router guard) |
| V5 Input Validation | yes | `totalQty`: `typeof === "number"` + `Number.isSafeInteger` + range. Rejects strings and objects (`{"$gt":0}`), matching existing `qty`/`mode` style. CLI `--qty` reuses `parseQty` regex |
| V6 Cryptography | no | — |
| V12/V14 (files, config) | yes | No shell spawns (docker, git, reconcile). Fixed container name. Validate `--sale` as 24-hex before use. `--base-url` must parse as `http(s):` URL |

### Known Threat Patterns
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| NoSQL operator injection via `totalQty` | Tampering | Strict number type check in controller (no coercion) |
| Command injection through spawned paths/args | Elevation | argv arrays with `shell: false`. No path inside a command string |
| Load-testing a non-test server (x-test-user ignored → floods of 401 / real logins) | DoS / Spoofing | Preflight `testMode === true`, any 401 → INVALID |
| Destroying demo data | Tampering | Harness only resets the chosen sale and restores mode/totalQty (D-04). E4 never touches Redis and never runs `down -v` |
| CSV formula injection | Tampering | Columns are numbers/identifiers. Harness-generated `note` must not start with `= + - @` |

## Sources

### Primary (HIGH confidence)
- autocannon@8.0.0 tarball: `lib/run.js`, `lib/httpClient.js`, `lib/requestIterator.js`, `lib/pipelinedRequestsQueue.js`, `lib/defaultOptions.js`, `lib/init.js`. @types/autocannon@7.12.7 `index.d.ts`
- Installed mongoose 9.11.4: `lib/collection.js`, `lib/drivers/node-mongodb-native/collection.js`, `lib/drivers/node-mongodb-native/connection.js`, `lib/connection.js`, `lib/model.js` (listIndexes). mongodb 7.7.0 `connection_string.js` (heartbeat default), `utils.js` (`supportsRetryableWrites`: Standalone → false)
- Repo files read this session: backend `src/config/{env,db,redis}.ts`, `server.ts`, `app.ts`, controllers (health, admin, sale, auth), `services/{sale-admin,purchase,order,sale-cache,auth}.service.ts`, `models/{order,flash-sale,index}.ts`, `middlewares/{error,auth}.ts`, `utils/{http-error,object-id}.ts`, `scripts/{cli-args,reset,reconcile}.ts`, `test/helpers.ts`, `test/integration/{admin,buy,reconcile,models}.test.ts`, `package.json`, `tsconfig*.json`, `docker-compose.yml`, `.gitignore`
- Local probes (scratchpad): 1,000-concurrent fetch; autocannon amount/setupRequest/onResponse/timing at 100 and 500 connections; TIME_WAIT exhaustion and decay; reconcile spawn across the Vietnamese path; TS 7.0.2 typecheck of the harness skeleton; gitignore negation; git pathspec exclude; shell-less docker/git spawn
- npm registry: `npm view autocannon time/dependencies`, versions of tsx/typescript/@types/*; gsd package-legitimacy check

### Secondary (MEDIUM confidence)
- `.planning/research/STACK.md`, `ARCHITECTURE.md`, `PITFALLS.md` (project research). The ARCHITECTURE bufferCommands note is superseded above

### Tertiary (LOW confidence)
- MongoDB `listIndexes` docs page: silent on missing-collection behaviour (hence A1)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH. Versions locked and verified in the registry; skeleton type-checks on TS 7.0.2
- Architecture/harness mechanics: HIGH. autocannon semantics from source plus probe; reconcile spawn probed
- E4 behaviour: MEDIUM. Source-level reasoning only; Docker daemon was down
- Pitfalls: HIGH for TIME_WAIT/timing (measured), MEDIUM for D-25 edge (logic)

**Research date:** 2026-11-09
**Valid until:** 2026-12-06 (code freeze). Re-check if autocannon is bumped past 8.x
