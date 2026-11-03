# Feature Research

**Domain:** Flash-sale web app built to show oversell prevention (Redis + MongoDB), with a load-test and benchmark harness and an academic report. Fashion-shop demo for a university NoSQL course.
**Researched:** 2026-11-03
**Confidence:** HIGH for scope (taken from `docs/SPECS.md`, the authoritative source). HIGH for autocannon capabilities (checked against the official README and a shipped result fixture). MEDIUM for UX and report-structure conventions (training knowledge plus vendor blogs, no authoritative UX research found).

> Scope rule: `docs/SPECS.md` sections 3, 8, 9, 10 and 14 define the feature set. This document does not add scope. Items marked **[RECOMMEND]** are low-cost refinements inside existing in-scope features. Items marked **[OPEN]** need a decision in requirements. Nothing here should be built unless SPECS covers it.

---

## Feature Landscape

The product has four audiences, and each has its own table stakes:

- (a) the shopper using the demo UI
- (b) the presenter or admin running the live demo
- (c) the experimenter producing numbers
- (d) the grader reading the report

"Users leave" here means "the demo is unconvincing" or "the report cannot answer the three questions".

### Table Stakes (Users Expect These)

#### (a) End-user flash-sale experience

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Home page: active sale card (product, original price struck through, sale price, remaining) + product list | First thing a grader sees. Every flash-sale UI (Shopee, Lazada) leads with the sale card | LOW | `GET /sales/active` + `GET /products`. Product list should render `attributes` as a generic key/value table, so the flexible document schema is visible (SPECS goal 4) |
| Sale page countdown to `endAt` | Core flash-sale affordance (SPECS §9) | LOW | Count down against a **server deadline** (`endAt` from the API), not a client-side duration. **[RECOMMEND]** Return server `now` in `GET /sales/:id` and correct for client clock skew. It costs one field and stops a wrong countdown on a badly set laptop clock |
| Pre-start / active / ended states | Sale can be `scheduled`, `active` or `ended` (SPECS §6). The UI must not offer a live buy button outside `[startAt, endAt]` | LOW | Button disabled with a label for each state. Server still enforces this with 400 |
| Remaining stock, polled every 1–2 s | SPECS §9. This is how the audience sees stock drain during the load test | LOW | Read `remaining` from `GET /sales/:id`, which already chooses Redis or Mongo by `sale.mode`. Clear the interval on unmount. Pause polling when `document.hidden`, so one idle tab does not skew a benchmark |
| Buy button with in-flight lock | Double-clicks send duplicate requests. Real flash-sale UIs disable the button immediately | LOW | Disable while the request is pending. The server still guarantees one order per user (unique index / Lua SISMEMBER). The UI lock only stops noise |
| Result messaging mapped from the status code | SPECS §8 defines unified codes. The user must tell "sold out" apart from "already bought" | LOW–MED | 201 success (show order), 409 sold out, 409 already bought, 400 not open or invalid, 401 send to `/login`, 503 V2 stock not loaded, 5xx generic error. **[RECOMMEND]** Add a machine-readable `code` field to error JSON (`SOLD_OUT`, `ALREADY_BOUGHT`, `SALE_NOT_ACTIVE`, `STOCK_NOT_LOADED`). Both outcomes are 409, and parsing Vietnamese message text is brittle. It stays compatible with SPECS (status codes unchanged, Vietnamese `message` kept) |
| Post-purchase state | After 201 the user should see "Đã mua" and not be able to try again | LOW | Switch the button to an "already bought" state and refresh remaining right away. On page load, `/orders/me` can show whether this user already bought in this sale (no new API needed) |
| Login / register (`/login`), token stored, `Authorization: Bearer` attached | Buying requires auth (SPECS §7) | LOW | Store the token in localStorage, which is fine for a course demo. Clear it on 401. This must handle the documented case where a token stays valid after a reseed: on a 401 or a missing-user error, log out cleanly |
| My orders (`/orders`) | SPECS §3 and §9 | LOW | `GET /orders/me` sorted by `createdAt desc` (matches the index). Show product, sale price, qty, status, `mode`, time. Showing `mode` helps the demo explain which strategy took the order |
| Vietnamese UI text | Course convention (SPECS §4: messages and comments in Vietnamese) | LOW | All user-facing strings in Vietnamese |

#### (b) Admin monitoring dashboard (`/admin`)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Stats panel: Mongo `remainingQty`, Redis `stock:<id>`, success orders, distinct users, oversold (`orders - totalQty` if > 0) | SPECS §7 and §9. This is the live evidence during the demo | LOW (API) / LOW (UI) | `GET /admin/sales/:id/stats`. **[RECOMMEND]** Also return `totalQty`, `mode` and `status`, so the numbers can be read without a second call. Show oversold in red when > 0, which is the "aha" moment for V0 |
| Auto-refresh (1 s) so counters visibly drop to 0 during a load test | SPECS §9 wording: "cập nhật liên tục để lúc demo chạy test tải thấy bộ đếm tụt về 0" | LOW | Same polling hook as the sale page. Cut-order fallback: a manual refresh button (SPECS §3) |
| Reset button for the sale (with confirmation) | Needed between every run and every mode change (SPECS §6, §8 mixed-mode risk) | LOW | `POST /admin/sales/:id/reset`. Use a confirm dialog because reset deletes orders. Show the result toast |
| Admin-only access | `requireAdmin` on `/api/admin` (SPECS §7) | LOW | Frontend hides the link for non-admins. The server enforces 403 |
| Current sale mode visible | V2 does not decrement Mongo `remainingQty`. Without the mode shown, "Mongo stock = 100 while orders = 100" looks like a bug | LOW | Display `sale.mode` prominently. **[OPEN]** How the presenter switches V0/V1/V2 for the UI demo is not specified: no admin API changes `flash_sales.mode`. Options: (1) seed/reset takes a `mode` parameter, (2) reset body accepts optional `{ mode }`, since mode change already requires a reset per SPECS §8. Decide in requirements and do not invent a separate endpoint |

#### (c) Experiment / benchmark tooling

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Seed script with stock as a parameter | E2 needs stock ≥ 1,000. SPECS §6 | LOW | 1,000 users + 1 admin, bcrypt hashed once, 6 fashion products with different `attributes`, 1 active sale preloaded into Redis. Print the sale id and admin credentials at the end. **[RECOMMEND]** Accept the sale `mode` too (see [OPEN] above) |
| Reset script (one or all sales) | Reset before **every** measured run (SPECS §10) | LOW | Same logic as the admin reset API. Share one service function so the API and the script cannot drift |
| Reconciliation script (Redis vs Mongo) with `--fix` | SPECS §8 and §14: "after each V2 run, reconcile reports no difference" | MED | Checks `stock = totalQty - successOrders`, and that the `buyers` set equals the set of order `userId`s (both directions). `--fix` rewrites Redis from Mongo in `multi()`. **Must exit non-zero on mismatch**, so E1/E2/E4 runners can call it as an assertion |
| E1 correctness runner (Node script, `fetch` + `Promise.all`) | Core value of the project. Cannot be cut | MED | For each of V0/V1/V2 × 5 runs: reset, fire 1,000 requests from 1,000 **distinct** `x-test-user` ids at once, wait, then read results **directly from Mongo/Redis**, not through the API. Record success count, final Mongo stock, final Redis stock, oversold, distinct userIds in orders, and the 201/409/5xx/connection-error counts. **Self-check**: assert distinct users sent = 1,000 and distinct userIds in orders = success orders, else mark the run INVALID. Print PASS/FAIL per run against the expectation (V0 oversold > 0; V1/V2 orders = `totalQty`) |
| E2 performance runner (autocannon, programmatic) | Answers "how much faster is Redis". Cannot be cut | MED–HIGH | V1 vs V2 × {100, 300, 500} connections × ≥ 5 reps, reset before each. Unique users per request via `setupRequest` with a **module-level counter** generating ObjectIds, so each request gets a fresh `x-test-user`. Do not use `workers`: each worker would have its own counter. `idReplacement` only replaces `[<id>]` in the **body**, not headers, so it cannot be used for this. Keep connection config the same between V1 and V2 and record `maxPoolSize` |
| p50 **and p95** latency | SPECS §10 asks for p95 | MED | **autocannon does not report p95.** Its latency object has `p50, p75, p90, p97_5, p99` (verified in the autocannon 8 result fixture). Either compute p50/p95 yourself from the instance `response` event (`client, statusCode, resBytes, responseTime`), or report p97.5 and state the deviation. Recommend computing it yourself: the same hook also lets you split latency by status (201 vs 409) and by phase |
| Separate in-stock vs sold-out phases in E2 | SPECS §10: most requests after sell-out are 409 and would dominate the averages | MED | Easiest approach: run the in-stock measurement with stock ≥ number of requests (fixed `amount`) so it never sells out, and run a separate sold-out measurement (stock 0 or already drained). Report both. Expect V2's biggest advantage in the **sold-out phase**, because a 409 in V2 never touches Mongo |
| Correct status accounting | autocannon lumps every non-2xx into `non2xx` (SPECS §10) | LOW | Use `statusCodeStats` (per-code counts) for 201 and 409. Error rate = 5xx + `errors` + `timeouts` only, never 409 |
| E3 duplicate-purchase runner | SPECS §10, §14 | LOW | One user, 10 simultaneous requests, V1 and V2, 5 runs. Assert orders for that user = 1, stock = `totalQty - 1` in the relevant store, `buyers` size = 1 (V2), and no stock leak (V1 compensation `$inc +1` ran for the 9 rejected inserts) |
| Measurement hygiene built into runners | SPECS §10 rules | LOW | Refuse to run unless the API reports `NODE_ENV=test` (or the health payload exposes it). Reset before each run. Run one warm-up pass that is discarded. Never log in the buy path |
| One summary CSV per experiment, committed to git | SPECS §10, §14 | LOW | One row per run plus aggregate rows (mean, stddev, min, max). Metadata columns: ISO date, git commit, Node version, CPU/RAM, `maxPoolSize`, connections, duration/amount, stock, mode. Raw JSON goes to `loadtest/results/raw/` (gitignored) |
| V1 vs V2 comparison chart from E2 data | SPECS §14 completion criterion | LOW–MED | Throughput (req/s) grouped bar by connection level with error bars (stddev), and p50/p95 latency grouped bar. Make it reproducible from the committed CSV, not hand-drawn |

#### (d) Academic report deliverable (`docs/` results analysis)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Q1 answer: which approach prevents oversell | First research question (SPECS §2) | LOW (once E1/E3 exist) | E1 table: version × run → orders, final stock (Mongo, Redis), oversold, distinct users. Plus a summary row. Pair it with a **race interleaving diagram** for V0 (two requests both read 1 then both `$inc -1`, ending at -1) and a short explanation of why V1 (single-document conditional atomic update) and V2 (Lua runs atomically on single-threaded Redis) cannot interleave. Add E3 for the per-user limit |
| Q2 answer: how much Redis improves performance | Second research question | MED | E2 tables: mean ± stddev req/s, p50/p95, for each connection level and phase. State the **ratio V2/V1** per level. Honest framing: same machine, Docker Desktop network, `x-test-user` skips JWT verification (must be stated per SPECS §7), every V2 success still writes Mongo. A small gap is a valid result (SPECS §10) and should be explained, not hidden |
| Q3 answer: risks and mitigations | Third research question | MED | Must cover: (1) Redis–Mongo desync if Node dies between Lua and insert, which **undersells, never oversells**, fixed by reconciliation. (2) AOF `everysec` can lose about 1 s of writes on a Redis crash. That loss restores stock **higher** than the truth, which **can cause oversell** unless reconciliation `--fix` runs from Mongo before the sale reopens, so it needs a recovery procedure. Lost `buyers` entries are still caught by the Mongo unique `(saleId, userId)` index, followed by the V2 compensation (defense in depth). (3) V1 false "sold out" window before compensation. (4) Mixed-mode risk (always reset). (5) E4 evidence if done |
| NoSQL type justification | SPECS goal 4: key-value plus document, each with a reason | LOW | Redis for a hot atomic counter and set membership, in memory and single-threaded scripting. Mongo for the system of record, flexible `attributes` per product category (show 2–3 different product documents side by side), and unique indexes |
| Methodology and threats-to-validity section | Graders expect numbers to come with how they were obtained | LOW | Environment table, pool size, measurement rules from SPECS §10, why E1 does not use autocannon (the user-distribution trap: 4 connections × 12 requests gave only 3 users), and limitations |
| Reproduction instructions | SPECS §14: "runs from scratch via README" | LOW | Exact commands to seed, start in test mode, run E1–E4, regenerate CSV and charts |

### Differentiators (Competitive Advantage)

These are worth doing only after the table stakes, because they make the demo and the report noticeably stronger for little cost. They line up with the Core Value: repeatable, numeric proof.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Live consistency badge on the admin page | Shows "Redis = totalQty − orders" (V2) or "Mongo = totalQty − orders" (V0/V1) as a green or red indicator. The audience sees correctness, not just numbers | LOW | Derived purely from the stats payload. No new API |
| Live chart on admin page (remaining stock and orders over time) | Visually dramatic during the demo: V0 line crosses below 0 | MED | Recharts, client-side buffer of polled stats. **Second item in the SPECS cut order.** Build only after everything else |
| Self-validating runners (PASS/FAIL + INVALID verdicts) | The report can claim "all 15 runs passed" with machine-checked evidence. Catches the autocannon user-distribution trap automatically | LOW | Part of the E1/E3 runners. Nearly free once the checks exist |
| Phase-split and status-split latency (201 vs 409) in E2 | Explains *why* V2 is faster (cheap Redis-only rejections) instead of reporting one opaque number. Strong analytical content for Q2 | MED | Comes from the custom `response`-event histogram |
| Single "run all" orchestration per experiment | One command produces CSV + summary, so the grader or teammates can reproduce | LOW–MED | e.g. `npm run e1`, `npm run e2`. Each runs reset → warm-up → reps → reconcile → CSV |
| E4 failure-mid-sale experiment | Turns the risk discussion (Q3) from theory into evidence | MED–HIGH | **First item in the SPECS cut order.** Stop Mongo (`docker stop flashsale-mongo`) during a V2 run, observe 5xx and compensation, restart, run reconcile, and report whether Redis matched `orders`. Configure a short `serverSelectionTimeoutMS` so failures happen in seconds (see PITFALLS for Mongoose command buffering) |
| Redis crash-recovery demonstration (procedure, not code) | Directly answers the AOF `everysec` risk with a documented runbook: restart Redis → run `reconcile --fix` → reopen sale | LOW | Documentation plus the existing reconcile script. No new feature |
| E1 oversold distribution for V0 (min/mean/max across runs) | Shows the race is reliably reproducible, not a one-off | LOW | Aggregate rows in the E1 CSV |

### Anti-Features (Commonly Requested, Often Problematic)

**Explicitly excluded by SPECS §3 (and PROJECT.md Out of Scope).** Do not build these unless the user asks.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Payment / checkout | "Real" e-commerce flow | Outside the NoSQL course focus. Adds a state machine (pending → paid → expired) that blurs the oversell measurement | Order is `success` on creation |
| Timed reservation / hold (V3) | Industry pattern (reserve, then pay within N minutes) | Not in SPECS. Needs TTL expiry, restock jobs, more reconciliation states | Mention as future work in the report |
| WebSocket / SSE push | "Real-time" counters | Extra infra and connection load on the same machine as the benchmark. Polling at 1–2 s is enough for the demo | Polling (fallback: refresh button) |
| Redis Cluster / Sentinel | "Production-grade" HA | Multi-key Lua needs hash tags (`{}`), which SPECS forbids. Standalone only | Discuss HA in the report as future work |
| Message queue / async order creation (Kafka, RabbitMQ, BullMQ) | The common "seckill" architecture in Java tutorials | Not in the V0/V1/V2 comparison. Changes the consistency model (eventual order creation) and makes E1 counting ambiguous | Synchronous Mongo insert after the atomic decrement |
| Multiple concurrent sales | Realistic shop | Each measurement uses one sale. Concurrent sales confound the numbers | One active sale. Reset between runs |
| Dockerizing backend/frontend | "Deploy anywhere" | SPECS: Docker runs only Mongo and Redis | `scripts/start|stop` for dev |
| MongoDB multi-document transactions in V1 | "Make V1 fully atomic" | Standalone Mongo has no transactions (needs a replica set). SPECS treats the false sold-out window as a discussion point | Compensating `$inc +qty` on insert failure |

**Derived anti-features.** Not named in SPECS, but they would break measurement validity or scope.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Distributed lock (Redlock / SETNX) around stock | Popular blog answer to oversell | Slower and more fragile than an atomic Lua script. Lock expiry under slow downstream calls is a documented cause of oversell. Adds a fourth design nobody asked for | Lua script (V2) and conditional update (V1) |
| Quantity > 1, per-user limit > 1, cart | Normal shop behavior | SPECS fixes `qty = 1` and `perUserLimit = 1`. Anything else invalidates the "exactly `totalQty` orders" assertion | Validate `qty === 1` → 400 |
| Per-variant (size/colour) inventory | Fashion shops sell by size | `attributes` exists to show a flexible schema, not to model SKUs. Per-variant stock multiplies Redis keys and experiment dimensions | Render `attributes` as descriptive data only |
| Order cancellation / refund flow | `orders.status` has `cancelled` | No API in SPECS. Cancelling requires restock in both stores and makes reconciliation harder | Leave `cancelled` as a schema value for compensation and audit only |
| Admin CRUD for products and sales | "Complete admin" | Not in SPECS §7. Seed covers the data | Seed script parameters |
| Rate limiting, CAPTCHA, bot detection | Real flash sales need them | Would throttle the load test itself and distort E1/E2 | Mention in the report as production hardening |
| Caching `remainingQty` (or caching sale info only for V2) | "Faster reads" | SPECS §13: caching only V2 makes the comparison unfair, and caching stock breaks correctness | Cache only the static sale fields, shared by all three versions, cleared on reset |
| Request logging, `stock_movements` writes, or audit in the buy path | Observability | Adds I/O that skews measurements (SPECS §10, §13) | Log outside the hot path. `stock_movements` only on compensation and reset |
| Artificial `sleep` in V0 to "guarantee" oversell | Makes the demo deterministic | It misrepresents the race and graders may call it rigged | Rely on real concurrency (1,000 simultaneous). Report the oversold distribution honestly |
| autocannon for E1 | One tool for everything | The `requests` array reuses the same users per connection, the unique index hides V0's bug, and V0 appears correct | Separate Node `fetch` + `Promise.all` script |
| Benchmarking `npm run dev` or with the dev start scripts | Convenient | `tsx` watch overhead and Vite on the same machine distort the numbers (SPECS §10, §12) | `npm run start:test` on compiled JS |
| Email verification, password reset, profile pages | Standard auth | Not in scope. The user list is seeded | Register and login only |

## Feature Dependencies

```
Docker Compose (Mongo :27018, Redis AOF)
    └──> Config + fail-fast startup
            └──> Models + indexes (unique (saleId,userId), no min on remainingQty)
                    ├──> Seed script (stock param) ──> Reset service (API + script share it)
                    └──> Auth (JWT, requireAuth no-DB, requireAdmin, x-test-user in test mode)
                            └──> Buy endpoint common checks (mode, qty===1, sale window, unified codes)
                                    ├──> V0 naive
                                    ├──> V1 atomic + compensation
                                    └──> V2 Lua (defineCommand, build copies .lua) + multi() compensation
                                            └──> GET /sales/:id `remaining` by sale.mode
                                            └──> Admin stats (Mongo + Redis + orders + distinct + oversold)
                                            └──> Reconcile script (--fix, non-zero exit)

E1 runner ──requires──> V0,V1,V2 + reset + x-test-user + direct DB read-back
E3 runner ──requires──> V1,V2 + reset (+ reconcile for V2)
E2 runner ──requires──> V1,V2 + seed stock param + custom latency hook + start:test build
Chart ──requires──> E2 CSV
E4 runner ──requires──> V2 compensation + reconcile + short serverSelectionTimeoutMS
Report docs ──requires──> E1, E2 (+chart), E3 CSVs; E4 optional

Frontend sale page ──requires──> GET /sales/:id (remaining, endAt, [server now]) + buy endpoint + auth
Admin page ──requires──> stats API + reset API
Live chart ──enhances──> Admin page
Consistency badge ──enhances──> Admin page (needs totalQty + mode in stats)

Mixing modes on one sale ──conflicts──> correctness (always reset when mode changes)
Caching remainingQty ──conflicts──> V0/V1 correctness and fair comparison
Logging in buy path ──conflicts──> E2 validity
```

### Dependency Notes

- **Reset is a dependency of every experiment.** Build it as one service function used by the admin API and the CLI script, so the "reset before every run" rule cannot drift between them.
- **`x-test-user` test mode is a dependency of E1, E2 and E3.** Without it, the runners would need 1,000 logins and JWT cost would enter the numbers. It must be gated by `NODE_ENV === "test"` in exactly one place.
- **Reconcile must exist before E1 and E2 are trusted for V2.** SPECS §14 requires zero mismatch after each V2 run, so the runners should call it automatically.
- **`remaining` by `sale.mode` is required by both the sale page and the admin view.** V2 never decrements Mongo `remainingQty`, so a naive UI would show 100 forever.
- **Chart depends on the E2 CSV schema.** Freeze the CSV columns before building the chart.
- **Sale-mode switching ([OPEN]) blocks the UI demo of V0 vs V2.** Resolve it before the frontend phase.

## MVP Definition

### Launch With (v1), meaning code freeze 2026-12-06

These are the SPECS must-not-cut items plus everything they depend on.

- [ ] Infra, config fail-fast, models and indexes. Foundation for everything
- [ ] Seed (stock param) + reset (shared service) + auth with test mode. Needed by every experiment
- [ ] Buy endpoint with common checks and unified codes; V0, V1, V2. Core of the study, cannot be cut
- [ ] `GET /sales/:id` with `remaining` by mode; `/orders/me`; admin stats and reset APIs
- [ ] Reconcile script with `--fix` and non-zero exit. A SPECS §14 criterion
- [ ] E1 runner with self-check + CSV. Core Value proof, cannot be cut
- [ ] E2 runner (autocannon, unique users, p50/p95, phase split, status accounting) + CSV + chart. Cannot be cut, and a §14 criterion
- [ ] E3 runner + CSV. A §14 criterion
- [ ] Frontend: home, sale page (countdown, polling, buy, messages), login/register, my orders, admin page with polling
- [ ] Dev start/stop scripts (Windows verified, macOS `bash -n` at minimum)
- [ ] README + results analysis docs answering Q1–Q3

### Add After Validation (still before freeze if time allows)

- [ ] Consistency badge on admin page. Add once the stats payload includes `totalQty` and `mode`
- [ ] E4 failure-mid-sale experiment. First to cut per SPECS
- [ ] Live chart on admin page. Second to cut per SPECS

### Future Consideration (report "future work" only, never build)

- [ ] V3 timed reservation, message queue, Redis Cluster/Sentinel HA, rate limiting/CAPTCHA, payment. These are named as out of scope and belong only in the discussion section

### Cut order under time pressure (from SPECS §3, binding)

E4 → live chart on web → admin monitoring page (keep the stats API) → automatic polling (replace with refresh button). V0, V1, V2, E1 and E2 are never cut.

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| V0 / V1 / V2 buy handlers + unified codes | HIGH | MEDIUM | P1 |
| Seed (stock param) + shared reset | HIGH | LOW | P1 |
| Auth + `x-test-user` test mode | HIGH | LOW | P1 |
| E1 correctness runner with self-check | HIGH | MEDIUM | P1 |
| E2 runner with custom p95 + phase split | HIGH | MEDIUM–HIGH | P1 |
| Reconcile script (`--fix`, exit code) | HIGH | MEDIUM | P1 |
| E3 duplicate-purchase runner | HIGH | LOW | P1 |
| E2 comparison chart | HIGH | LOW–MEDIUM | P1 |
| Results analysis docs (Q1–Q3) + README | HIGH | MEDIUM | P1 |
| Sale page (countdown, polling, buy, messages) | HIGH | LOW–MEDIUM | P1 |
| Admin stats + reset API | HIGH | LOW | P1 |
| Home, login/register, my orders pages | MEDIUM | LOW | P1 |
| Dev start/stop scripts (ps1 + sh) | MEDIUM | HIGH (many edge cases) | P1 (SPECS §14) |
| Admin monitoring page with polling | MEDIUM | LOW | P2 (3rd in cut order) |
| Machine-readable error `code` field | MEDIUM | LOW | P2 |
| Server-time skew correction for countdown | LOW | LOW | P2 |
| Consistency badge | MEDIUM | LOW | P2 |
| E4 failure-mid-sale | MEDIUM | MEDIUM–HIGH | P3 (1st in cut order) |
| Live chart on admin page | MEDIUM | MEDIUM | P3 (2nd in cut order) |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

## Competitor Feature Analysis

The "competitors" are typical oversell-prevention demo projects and tutorials, which is the genre graders will compare against.

| Feature | Typical Java "seckill" tutorial projects | Typical Node/Redis blog demos | Our Approach |
|---------|-------------------------------------------|-------------------------------|--------------|
| Stock control | Redis pre-decrement + MQ async order + distributed lock | `DECR` or Lua only, often no DB of record | Three strategies side by side (naive, Mongo atomic, Redis Lua) under one API with unified codes |
| Proof of correctness | Usually a single JMeter screenshot | Often none, or a single run | E1: 5 runs × 3 versions, self-validated distinct users, direct DB read-back, CSV in git |
| Performance comparison | Rarely against a DB-only baseline | Rarely | E2: V1 vs V2 at 3 concurrency levels, ≥ 5 reps, p50/p95, in-stock vs sold-out phases |
| Consistency between cache and DB | Often ignored | Ignored | Reconcile script with `--fix`, run after every V2 experiment. AOF `everysec` risk analysed |
| Failure handling | Compensation rarely tested | None | Compensation in V1 and V2. Optional E4 fault injection |
| Extra machinery (MQ, rate limit, CAPTCHA) | Heavy | Light | Deliberately excluded so the variable under study stays isolated |

## Sources

- `docs/SPECS.md` (authoritative scope, §3, §6–§10, §13–§14). HIGH
- `.planning/PROJECT.md` (out-of-scope list, prior-attempt findings on autocannon user distribution). HIGH
- autocannon README, https://github.com/mcollina/autocannon: `statusCodeStats`, instance `response` event `(client, statusCode, resBytes, responseTime)`, `setupRequest(request, context)`, `idReplacement` body-only, `workers` caveat, CLI-only `--warmup`. HIGH (official docs)
- autocannon 8.0.0 result fixture, https://app.unpkg.com/autocannon@8.0.0/files/test/fixtures/example-result.json: latency keys are `p0_001…p2_5, p10, p25, p50, p75, p90, p97_5, p99, p99_9…`, so **no p95**. Top-level `errors, timeouts, non2xx, resets, 2xx, 4xx, 5xx, statusCodeStats`. HIGH (shipped artifact)
- Flash-sale UX guidance (server-deadline countdown, explicit sold-out and ended states, no fake scarcity): https://vp0.com/blogs/shopee-flash-sale-timer-ui-clone, https://www.fudge.ai/features/flash-sale-landing-page/, https://marketingagency.sg/urgency-tactics-ecommerce. LOW–MEDIUM (vendor blogs, consistent with each other)
- Redis lock-based oversell post-mortems (lock expiry and non-atomic get-then-check cause oversell, atomic decrement or Lua recommended): https://www.besthub.dev/articles/why-redis-distributed-locks-fail-and-how-to-stop-overselling-in-flash-sales-618c94bafba1. LOW (aggregator, anecdotal. Used only to support excluding a lock-based design)
- Redis AOF `everysec` (up to about 1 s data loss) and Lua script atomicity: Redis persistence and scripting documentation, from training knowledge consistent with SPECS §10. MEDIUM

---
*Feature research for: flash-sale oversell-prevention demo (Redis + MongoDB), NoSQL course project*
*Researched: 2026-11-03*
