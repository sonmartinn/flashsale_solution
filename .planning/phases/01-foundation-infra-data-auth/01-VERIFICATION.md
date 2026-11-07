---
phase: 01-foundation-infra-data-auth
verified: 2026-11-06T07:29:49Z
status: human_needed
score: 70/70 must-haves verified
covered_files:
  - .planning/phases/01-foundation-infra-data-auth/01-01-PLAN.md
  - .planning/phases/01-foundation-infra-data-auth/01-01-SUMMARY.md
  - .planning/phases/01-foundation-infra-data-auth/01-02-PLAN.md
  - .planning/phases/01-foundation-infra-data-auth/01-02-SUMMARY.md
  - .planning/phases/01-foundation-infra-data-auth/01-03-PLAN.md
  - .planning/phases/01-foundation-infra-data-auth/01-03-SUMMARY.md
  - .planning/phases/01-foundation-infra-data-auth/01-04-PLAN.md
  - .planning/phases/01-foundation-infra-data-auth/01-04-SUMMARY.md
  - .planning/phases/01-foundation-infra-data-auth/01-05-PLAN.md
  - .planning/phases/01-foundation-infra-data-auth/01-05-SUMMARY.md
  - .planning/phases/01-foundation-infra-data-auth/01-06-PLAN.md
  - .planning/phases/01-foundation-infra-data-auth/01-06-SUMMARY.md
  - .planning/phases/01-foundation-infra-data-auth/01-07-PLAN.md
  - .planning/phases/01-foundation-infra-data-auth/01-07-SUMMARY.md
  - .planning/phases/01-foundation-infra-data-auth/01-08-PLAN.md
  - .planning/phases/01-foundation-infra-data-auth/01-08-SUMMARY.md
  - backend/package.json
  - backend/scripts/reset.ts
  - backend/scripts/seed.ts
  - backend/src/app.ts
  - backend/src/config/env.ts
  - backend/src/config/redis.ts
  - backend/src/controllers/health.controller.ts
  - backend/src/middlewares/auth.ts
  - backend/src/middlewares/error.ts
  - backend/src/server.ts
  - backend/test/auth.test.ts
  - backend/test/boot.test.ts
  - backend/test/config.test.ts
  - backend/test/errors.test.ts
  - backend/test/helpers.ts
  - backend/test/integration/health.test.ts
  - backend/test/integration/models.test.ts
  - backend/test/integration/redis-boot.test.ts
  - backend/test/redis.test.ts
  - docker-compose.yml
covered_digest: "v4:sha256:3d754cdcbbd4795b78013b6a2c1a82d5563c256e7ceb55eca7289932838c6d3e"
behavior_unverified: 0
overrides_applied: 2
overrides:
  - must_have: 'nodeEnv keeps its trimmed display value for the boot banner and GET /api/health (NODE_ENV "test " displays "test" while isTestMode is false); every other loadBaseConfig output is unchanged, and the CHẾ ĐỘ TEST boot warning still depends only on cfg.isTestMode'
    reason: "Superseded by the user's decision in 01-UAT test 1 (REVIEW CR-01 option b, gap G-01-1, plan 01-06): nodeEnv now shows the raw NODE_ENV (JSON-quoted in the banner), GET /api/health exposes testMode, and a near-miss NODE_ENV prints a [CẢNH BÁO] line. The rest of that must-have still holds: loadBaseConfig outputs are otherwise unchanged apart from the added testModeNearMiss field, and the CHẾ ĐỘ TEST warning still depends only on cfg.isTestMode."
    accepted_by: "Le Trung Son (01-UAT test 1)"
    accepted_at: "2026-11-05T04:57:29.000Z"
  - must_have: 'Register or login with a missing body, an empty object, an array, a JSON primitive, blank strings or any non-string field returns 400 (VALIDATION_ERROR, or INVALID_JSON for unparsable bodies), never 500 (AUTH-01 empty edge)'
    reason: "Accepted by the user in 01-UAT test 5: login with a blank password returns 401 INVALID_CREDENTIALS, as the 01-04 plan action and D-12 (uniform login failure) prescribe, and never 500. Register meets the truth fully."
    accepted_by: "Le Trung Son (01-UAT test 5)"
    accepted_at: "2026-11-05T04:57:29.000Z"
re_verification:
  previous_status: human_needed
  previous_score: 49/53
  gaps_closed:
    - "G-01-1 (UAT test 1): test mode is observable and unambiguous. GET /api/health has testMode = cfg.isTestMode, nodeEnv is the raw value, the banner prints NODE_ENV JSON-quoted, and a near-miss NODE_ENV prints one [CẢNH BÁO] line (plan 01-06)"
    - "G-01-4 (UAT test 4): a declared-JSON zero-byte body (Content-Length 0, empty chunked, gzip of empty) returns 400 INVALID_JSON. A body-less POST with no Content-Type still reaches routing (plan 01-07)"
    - "G-01-2 (UAT test 2c): every Redis startup failure (refused, reset, non-RESP, silent) in the server, seed and reset ends with exactly one [LỖI] Redis line, and a silent Redis fails within 5 s. Runtime disconnect logging is kept (plan 01-08)"
    - "01-02.2 empty-body wording: now met in code (closed by G-01-4), so no override is needed"
    - "01-02.10 and 01-04.11 backstops: confirmed by the user in UAT tests 6 and 7"
    - "Flagged prohibitions 1-5: confirmed by the user in UAT test 8"
  gaps_remaining: []
  regressions: []
deferred:
  - truth: "DATA-04 'xóa cache đợt sale': reset clears the server's in-process sale cache"
    addressed_in: "Phase 2"
    evidence: "Phase 2 SC4: 'all modes share one order-creation path and one static sale cache that reset clears'. Phase 1 provides the seam: createSaleAdminService({ onSaleReset }) calls the hook once per successful reset."
  - truth: "Admin reset over HTTP (POST /api/admin/sales/:id/reset) using the shared reset service"
    addressed_in: "Phase 2"
    evidence: "Phase 2 SC5: 'An admin can reset a sale over HTTP (optionally switching mode) and read stats'"
  - truth: "Load-test preflight checks health testMode === true (D-17 as amended by 01-06)"
    addressed_in: "Phase 3"
    evidence: "Phase 3 SC1: 'It reports INVALID instead of a result if the server is not in test mode ... or any 401 appears'. 01-CONTEXT D-17 now tells the EXP-01 preflight to check testMode === true."
advisory:
  - finding: "IN-03 (REVIEW): the CHẾ ĐỘ TEST / near-miss [CẢNH BÁO] line and the JWT_SECRET-shorter-than-32 warning print before app.listen, so a listen failure in the short window after the port probe (or any boot failure with a short JWT_SECRET) gives two stderr lines, not one"
    category: other
    reason: "The realistic port-taken case is caught by isPortFree before any warning (boot.test 'cổng đã bị chiếm' asserts exactly one line). The remaining path is a race between the probe and listen. Moving the warnings into the listen success callback would close it. The JWT-length warning is the intended D-18 guidance."
    evidence_status: "none provided: no reproducible command shows two lines on a realistic path; boot.test and redis-boot.test exact-line cases are green"
  - finding: "IN-05 (REVIEW): runtime Redis has no per-command deadline; a connected-but-unresponsive Redis could hang requests"
    category: architectural
    reason: "Health is bounded (pingRedis 1 s). The buy path does not exist yet. This belongs with the Phase 2 Lua buy call."
    evidence_status: "none provided"
coincidental_reliance_items:
  - truth: "npm run start:test still runs in test mode: node --env-file=.env.test (CRLF checkout) yields NODE_ENV exactly \"test\" (01-05 truth 6; 01-06 truth 1 'testMode true for a server started like npm run start:test')"
    reason: undeclared-precondition
    harden: "`git ls-files --eol backend/.env.test` is still `i/lf w/crlf`, and .gitattributes does not exist yet (Phase 5, DEV-04). The exact comparison relies on Node's --env-file loader stripping the CR. That is confirmed only on Node 24 (health.test '.env.test' case: testMode true). Add `backend/.env.test text eol=lf` when DEV-04 creates .gitattributes."
human_verification:
  - test: "Prerequisite: backend/.env exists, created once in backend/ with the command in the backend/.env.example header (random 32-byte JWT_SECRET written straight into the file, never printed, never overwrites, gitignored, never committed). Env source: backend/.env only. Open a new cmd.exe window with Win+R then cmd, not from a terminal that may hold PowerShell $env: values, cd to backend/, and run `for %V in (MONGODB_URI REDIS_URL JWT_SECRET NODE_ENV PORT) do @if defined %V echo %V dang dat trong phien nay`. It must print nothing (it prints names only, never values; PowerShell equivalent: 'MONGODB_URI','REDIS_URL','JWT_SECRET','NODE_ENV','PORT' | Where-Object { Test-Path \"Env:$_\" }). Then run `npm run build`, `docker stop flashsale-redis`, `npm run start`, `npm run seed`, `npm run reset`, and finally `docker start flashsale-redis`, waiting until `docker compose ps` shows it healthy."
    expected: "Each command exits 1. Server and seed print exactly one stderr line, `[LỖI] Không kết nối được Redis tại 127.0.0.1:6379...`, with no '[Redis] mất kết nối' line and no stack. Reset prints its [CẢNH BÁO] cache line and then that one [LỖI] line. Note: if backend/.env has a JWT_SECRET shorter than 32 characters, the server prints the short-secret [CẢNH BÁO] line first (intended, see advisory IN-03). If a command prints [LỖI] Thiếu biến môi trường MONGODB_URI, the prerequisite was skipped (no backend/.env in backend/); that is not a Redis result."
    why_human: "Needs the shared flashsale-redis container stopped, which the verifier must not do. Automated equivalent: health.test and redis-boot.test use an unused port (the same ECONNREFUSED as a stopped container) plus reset/garbage/silent fakes, and all assert exactly one line"
  - test: "Prerequisite: backend/.env exists (see the previous item). Env source: backend/.env only, in a fresh Win+R cmd.exe window where the `for %V ...` presence check from the previous item prints nothing. In that ONE window, from backend/: `npm run build`, then `set NODE_ENV=test && npm run start` (this cmd idiom leaves NODE_ENV=\"test \" with a trailing space in the window). Open http://localhost:5000/api/health in a browser, then stop the server with Ctrl+C (answer Y if cmd asks to terminate the batch job). In the SAME window, without clearing NODE_ENV, run `npm run start:test`, open the health URL again, stop it with Ctrl+C, and open the URL once more. Finally run `set NODE_ENV=` to clear the variable."
    expected: "npm run start: banner NODE_ENV=\"test \", exactly one [CẢNH BÁO] NODE_ENV=\"test \" line that recommends npm run start:test, no CHẾ ĐỘ TEST line, health testMode false and nodeEnv \"test \". npm run start:test in the same window: build output, then the CHẾ ĐỘ TEST line, banner NODE_ENV=\"test\", no [CẢNH BÁO] NODE_ENV line and no dotenv injected-env line, health testMode true and nodeEnv \"test\". After the last Ctrl+C the health URL no longer answers (port 5000 freed: the server under the start:test wrapper stopped too)."
    why_human: "Real cmd.exe `set VAR=x && ...` behaviour (a trailing space that persists in the window) and real Ctrl+C through npm, the .cmd shim and the start:test wrapper. Automated equivalent: health.test starts the server through the start:test launcher with an inherited NODE_ENV \"test \" and checks that the port is freed after stop."
---

# Phase 1: Foundation (Infra, Data, Auth) Verification Report

**Phase Goal:** A developer can bring up MongoDB and Redis, boot a backend that fails fast on bad configuration, seed and reset a fashion flash sale, and authenticate with JWT (or with `x-test-user` in test mode)
**Verified:** 2026-11-06T07:29:49Z
**Status:** human_needed
**Re-verification:** Yes. This run follows the UAT gap closure (plans 01-06, 01-07, 01-08 for G-01-1, G-01-4, G-01-2). The previous report had no `gaps:` block, so the whole phase was re-checked, with full depth on the three UAT gaps.

## What changed since the previous verification

`git diff 867b4a6 HEAD --stat -- backend docker-compose.yml` lists 14 files. In `src`, only 5 changed:
- `app.ts`: the `verify` guard
- `config/env.ts`: raw `nodeEnv` and `testModeNearMiss`
- `config/redis.ts`: silent listener, startup deadline, runtime logger
- `controllers/health.controller.ts`: `testMode`
- `server.ts`: quoted banner and near-miss warning

`middlewares/auth.ts`, `scripts/seed.ts` and `scripts/reset.ts` have no diff. The other 9 files are tests and helpers. Everything else has the same content as when it was last fully verified.

## Evidence the verifier produced itself (not from SUMMARY)

- `npm --prefix backend run typecheck`: exit 0.
- `npm --prefix backend test` (includes build): **149/149 pass**.
- `npm --prefix backend run test:int` against the live containers: **57/57 pass**.
- The named gap-closure tests appear as passing in the verifier's own logs:
  - every errors.test zero-byte case (Content-Length 0, charset, chunked, gzip, whitespace) and both no-Content-Type routing cases
  - all 4 redis.test silent-rejection cases
  - all 8 boot.test exact-one-line cases
  - all 8 redis-boot.test cases: 3 server fakes, 4 seed/reset CLI cases, and the runtime proxy-cut case
  - the 4 health.test testMode/banner cases
  - the models.test index-failure single-line case
- Direct probe of `loadBaseConfig` (`node --import tsx`), showing nodeEnv / isTestMode / testModeNearMiss:

  | NODE_ENV | nodeEnv | isTestMode | testModeNearMiss |
  |---|---|---|---|
  | `"test"` | `"test"` | true | false |
  | `"test "` | `"test "` | false | true |
  | `"Test"` | `"Test"` | false | true |
  | `"\ufefftest"` | (raw) | false | true |
  | `"t\u0435st"` | (raw) | false | false |
  | unset | `"development"` | false | false |
  | `""` | `"development"` | false | false |
  | `"production"` | `"production"` | false | false |

- Single-site invariant: `grep '=== "test"' backend/src` finds only `env.ts:139 const isTestMode = env["NODE_ENV"] === "test";`. `process.env` appears in no other file under `src`. `middlewares/auth.ts` has no diff since 867b4a6.
- `gsd verify.artifacts`: 01-06 6/6, 01-07 3/3, 01-08 5/5. `verify.key-links`: all verified (01-06 3/3, 01-07 2/2, 01-08 3/3).
- Infra regression: `docker ps` shows flashsale-mongo `mongo:7.0` on `127.0.0.1:27018` and flashsale-redis `redis:7.4` on `127.0.0.1:6379`, both healthy. `CONFIG GET appendfsync` returns `everysec`. `dist/server.js` and `dist/lua/buy.lua` exist.
- `config.test.ts` near-miss list: byte inspection (`cat -A`) shows real U+00A0, U+FEFF and U+0435 bytes. The cases are genuine, not duplicates (REVIEW IN-02 is about readability only).

## Goal Achievement

### Roadmap Success Criteria (contract)

| # | Success Criterion | Status | Evidence |
|---|---|---|---|
| SC1 | Docker brings up Mongo 7 @127.0.0.1:27018 and Redis 7 AOF everysec @127.0.0.1:6379, healthy; health 200 when both up, 503 when either down | ✓ VERIFIED | docker ps / CONFIG GET re-checked. health.test 200 and 503 pass. The real stop/start transition passed in UAT test 3. redis-boot.test proxy-cut shows a runtime 503 followed by recovery to 200 |
| SC2 | Exits with a Vietnamese message on missing JWT_SECRET / Mongo or Redis unreachable / port 5000 taken; never 27017; prints maxPoolSize; typecheck + build pass; dist/lua exists | ✓ VERIFIED | Every failure path now prints exactly one stderr line: boot.test (8), health.test Redis-down, redis-boot.test (7), models.test index failure. Typecheck and build exit 0, and dist/lua is present. The real `docker stop` re-check is a human item |
| SC3 | `npm run seed` (qty, mode) wipes and creates 1000 users + 1 admin, 6 products, 1 active 7-day half-price sale, stock loaded; every §6 index | ✓ VERIFIED | seed.ts and seed.service unchanged. seed.test passes. Seed with Redis or Mongo down prints exactly one [LỖI] line |
| SC4 | `npm run reset` (one/all, --mode) restores, deletes, one checked multi(), reopens 7 days, warns about cache | ✓ VERIFIED | reset.ts and sale-admin.service unchanged. reset.test passes. On a failed reset, the warning is the first stderr line, followed by exactly one [LỖI] line |
| SC5 | Register/login/JWT, 401/403, `x-test-user` only when `NODE_ENV === "test"`, §7 errors, no 500 leak | ✓ VERIFIED | auth tests pass. The raw single-site comparison is unchanged. §7 empty-body edge now gives 400 INVALID_JSON (01-07). Blank-password login returns 401, accepted by override |

### UAT Gap Closure

| Gap | Truth | Status | Code evidence | Test evidence (run by verifier) |
|---|---|---|---|---|
| G-01-1 | Test mode observable: health `testMode`, raw `nodeEnv`, quoted banner, near-miss warning; D-17 amended | ✓ CLOSED | `health.controller.ts:22` `testMode: deps.cfg.isTestMode`. `env.ts:135` raw nodeEnv. `env.ts:142` near-miss on trimmed value with `/^test$/i`, never feeding isTestMode. `server.ts:58-64` prints the warnings after both stores connect. `server.ts:76` uses `JSON.stringify(cfg.nodeEnv)`. 01-CONTEXT D-17 says "must check `testMode === true`" | health.test: `.env.test` server gives testMode true and nodeEnv "test", CHẾ ĐỘ TEST printed, no near-miss line. `NODE_ENV:"test "` server gives testMode false and nodeEnv "test ", banner `NODE_ENV="test "`, `[CẢNH BÁO]` on stderr, no CHẾ ĐỘ TEST. The default server gives testMode false. config.test near-miss matrix (11 true, 9 false) passes |
| G-01-4 | Declared-JSON zero-byte body gives 400 INVALID_JSON; no-CT body-less POST reaches routing | ✓ CLOSED | `app.ts:28-32` `rejectEmptyJson` throws `HttpError(400, "Body JSON không hợp lệ", "INVALID_JSON")` when `buf.length === 0`. `app.ts:42` `express.json({ verify: rejectEmptyJson })`. No log line. 01-CONTEXT:148 records `req.body ?? {}` and the omit-Content-Type rule | errors.test: Content-Length 0, charset=utf-8, chunked and gzip-of-empty each return exactly 400 + INVALID_JSON + message. No-CT POST returns 404 / register 400 VALIDATION_ERROR. `"{}"` returns 404. Whitespace returns 400. 200 kB returns 413. All pass |
| G-01-2 | Redis startup failure prints one [LỖI] line in server/seed/reset; silent Redis bounded; runtime logging kept | ✓ CLOSED | `redis.ts:19-23`: only a no-op `error` listener at creation. `redis.ts:52-60`: `withTimeout(connect().then(ping), 5000)`, then `attachRuntimeErrorLog`. The logger is armed only on success. Callers (`server.ts:47-54`, seed, reset) unchanged | redis.test: refused, reset, garbage and silent each reject with zero console output (silent in 1.3 s with a 1 s deadline). redis-boot.test: server with reset/garbage/silent fakes prints exactly one line (silent case 5.6 s). Seed/reset with refused or silent Redis print exactly one [LỖI] (reset also prints its warning first). The proxy cut prints exactly one `[Redis] mất kết nối` line, then 503 and back to 200 with no further line. health.test with Redis on unused port 6390 prints exactly one line |

### Plan Must-Have Truths

01-01 through 01-05 were fully verified earlier (commit 867b4a6 report). Their code is unchanged apart from the gap-closure edits above, and all their tests pass in this run. Rows are abridged.

| # | Truth (abridged) | Status | Evidence |
|---|---|---|---|
| 01-01.1–8 | compose, AOF, typecheck/build, health 200/503 bounded, fail-fast, banner, .env files | ✓ VERIFIED (8) | regression: tests green; docker/AOF re-checked. The banner now quotes NODE_ENV (01-06) |
| 01-02.1, .3–.9, .11 | error table, utf-8, collection names, indexes, no min, unique pair, orderId null, email lowercase, index-before-listen | ✓ VERIFIED (9) | errors.test, models.test green |
| 01-02.2 | plain Error gives 500 with no leak; **empty**, malformed or primitive body gives 400 INVALID_JSON | ✓ VERIFIED (was UNCERTAIN) | fixed by 01-07; errors.test exact assertions green |
| 01-02.10 | (backstop) userId_1_createdAt_-1 backs newest-first | ✓ VERIFIED (human) | UAT test 6 pass |
| 01-03.1–10 | seed + reset semantics, CLI args, warning on both paths | ✓ VERIFIED (10) | seed/reset/cli-args tests green |
| 01-04.1, .2, .4–.10, .12 | register/login/JWT, limits, 409, concurrency, uniform 401, requireAuth, admin guard, exact x-test-user | ✓ VERIFIED (10) | auth tests green |
| 01-04.3 | register **or login** with blank strings gives 400 | ✓ PASSED (override) | Override: login blank password returns 401 per D-12, accepted by Le Trung Son (01-UAT test 5) on 2026-11-05 |
| 01-04.11 | (backstop) requireAdmin has no shared state | ✓ VERIFIED (human) | UAT test 7 pass |
| 01-05.1–4, .7 | raw exact comparison, e2e 403/401, 11-value matrix, unset/blank, single site | ✓ VERIFIED (5) | env.ts:139 byte-identical; config.test and auth.test green |
| 01-05.5 | nodeEnv keeps trimmed display | ✓ PASSED (override) | Override: superseded by UAT test 1 option b (G-01-1), accepted by Le Trung Son on 2026-11-05 |
| 01-05.6 | npm run start:test still in test mode via CRLF .env.test | ✓ VERIFIED (coincidental-reliance) | health.test `.env.test` case: testMode true. Relies on Node 24 stripping CR |
| 01-06.1 | health `{ mongo, redis, nodeEnv, testMode, maxPoolSize }`, testMode = isTestMode; true via .env.test, false unset, false "test " | ✓ VERIFIED | health.test deepEqual bodies + 2 server-process cases |
| 01-06.2 | nodeEnv raw when non-blank, else "development" | ✓ VERIFIED | config.test + verifier probe |
| 01-06.3 | testModeNearMiss matrix (11 true / 9 false incl. unset) | ✓ VERIFIED | config.test lists match the truth exactly, real bytes confirmed |
| 01-06.4 | banner JSON-quoted; "test " gives one [CẢNH BÁO] and no CHẾ ĐỘ TEST; "test" gives the reverse; warnings only after both stores connect | ✓ VERIFIED | server.ts:58-64 placed after connectRedis; health.test cases green. Listen-race caveat in advisory IN-03 |
| 01-06.5 | single test-mode site; auth.ts unchanged; near-miss never enables test mode | ✓ VERIFIED | grep + `git diff 867b4a6 -- middlewares/auth.ts` empty |
| 01-06.6 | D-17 amended; overrides recorded; CR-01 fixed | ✓ VERIFIED | 01-CONTEXT:99; overrides block above; 01-REVIEW-DISPOSITION CR-01 `fixed` |
| 01-07.1 | zero-byte declared-JSON (CL 0, chunked, gzip, charset) gives exact 400 INVALID_JSON | ✓ VERIFIED | errors.test 4 cases green |
| 01-07.2 | body-less no-CT POST reaches routing (404 / register 400) | ✓ VERIFIED | errors.test 2 cases green |
| 01-07.3 | rest of JSON contract unchanged (`{}` gives 404, malformed/primitive/whitespace give 400, 200 kB gives 413) | ✓ VERIFIED | errors.test green; error.ts unchanged |
| 01-07.4 | guard is the verify hook of the single express.json; no log | ✓ VERIFIED | app.ts:28-42; no console call in app.ts |
| 01-07.5 | 01-CONTEXT records D-15 row and Phase 2/3/4 rule | ✓ VERIFIED | 01-CONTEXT:148 `req.body ?? {}` |
| 01-08.1 | refused Redis gives exactly one [LỖI] line, no [Redis]/ioredis/stack | ✓ VERIFIED | health.test Redis-down case green |
| 01-08.2 | reset/garbage/silent each give one line; silent within the 5 s deadline | ✓ VERIFIED | redis-boot.test 3 cases green; silent 5.6 s |
| 01-08.3 | seed/reset CLI: one [LỖI] Redis (refused/silent) and one [LỖI] Mongo; reset warning first | ✓ VERIFIED | redis-boot.test 4 + boot.test 2 cases green |
| 01-08.4 | every other server failure prints one line (JWT unset/blank, REDIS_URL unset, 27017, held port, Mongo down, index failure) | ✓ VERIFIED | boot.test 6 + models.test index case green |
| 01-08.5 | runtime cut gives one [Redis] line, process stays up (503), recovers to 200 with no more lines | ✓ VERIFIED | redis-boot.test proxy case green |
| 01-08.6 | fix lives only in redis.ts; callers unchanged; tests never stop containers | ✓ VERIFIED | git diff: seed.ts/reset.ts unchanged, server.ts Redis sequence unchanged; no `docker stop/restart` in backend/test |

**Score:** 70/70 must-haves verified: 53 previous (48 plan truths + 5 roadmap SCs) and 17 new (01-06: 6, 01-07: 5, 01-08: 6). 2 of them pass by override, 0 are present but behavior-unverified, and 1 is verified with coincidental reliance.

### Deferred Items

| # | Item | Addressed In | Evidence |
|---|---|---|---|
| 1 | Reset clears the server's in-process sale cache (DATA-04 last clause) | Phase 2 | SC4 "one static sale cache that reset clears"; the `onSaleReset` seam exists |
| 2 | Admin reset via HTTP | Phase 2 | SC5 "An admin can reset a sale over HTTP" |
| 3 | Preflight checks `health.testMode === true` | Phase 3 | SC1 "reports INVALID ... if the server is not in test mode"; D-17 amended |

### Advisory (New Scope, Unevidenced)

| # | Finding | Category | Why Advisory |
|---|---|---|---|
| 1 | REVIEW IN-03: warnings printed before `listen` give 2 stderr lines if listen fails after the port probe, or with a short JWT_SECRET | other | new scope, no deterministic evidence on a realistic path; the held-port case is one line (boot.test) |
| 2 | REVIEW IN-05: no runtime per-command Redis deadline | architectural | new scope, no evidence; buy path not built yet (Phase 2) |

### Required Artifacts

| Artifact | Status | Details |
|---|---|---|
| `backend/src/config/env.ts` | ✓ VERIFIED | `testModeNearMiss`, raw `nodeEnv`, unchanged raw `isTestMode` line |
| `backend/src/controllers/health.controller.ts` | ✓ VERIFIED | `testMode: deps.cfg.isTestMode` |
| `backend/src/server.ts` | ✓ VERIFIED | `cfg.testModeNearMiss` warning, `JSON.stringify(cfg.nodeEnv)` banner |
| `backend/src/app.ts` | ✓ VERIFIED | `express.json({ verify: rejectEmptyJson })` |
| `backend/src/config/redis.ts` | ✓ VERIFIED | silent listener, `REDIS_STARTUP_TIMEOUT_MS = 5000`, `attachRuntimeErrorLog` after success |
| `backend/test/{config,errors,redis,boot}.test.ts`, `test/integration/{health,redis-boot,models}.test.ts`, `test/helpers.ts` | ✓ VERIFIED | substantive; all pass in this run |
| `01-CONTEXT.md` D-17 / Phase 2 note | ✓ VERIFIED | `testMode === true`, `req.body ?? {}` |
| All 01-01..01-05 artifacts | ✓ VERIFIED (regression) | tests green |

### Key Link Verification

| From | To | Via | Status |
|---|---|---|---|
| health.controller.ts | config/env.ts | `deps.cfg.isTestMode` | ✓ WIRED |
| server.ts | config/env.ts | `cfg.testModeNearMiss`, `JSON.stringify(cfg.nodeEnv)` | ✓ WIRED |
| health.test.ts | dist/server.js | `startServerProcess` (NODE_ENV "test ", --env-file) | ✓ WIRED |
| app.ts | middlewares/error.ts | HttpError from verify keeps 400; errorHandler's instanceof branch | ✓ WIRED (proven by exact 400 INVALID_JSON responses) |
| errors.test.ts | app.ts | `startApp()` + raw node:http | ✓ WIRED |
| server.ts / scripts/seed.ts / scripts/reset.ts | config/redis.ts | `createRedis` + `connectRedis(redis)` | ✓ WIRED (fix covers all three; CLI tests prove it) |
| helpers.ts | scripts/*.ts | `spawnCli` via `import.meta.resolve("tsx")` in a temp cwd | ✓ WIRED |
| middlewares/auth.ts | config/env.ts | `cfg.isTestMode` | ✓ WIRED (unchanged) |

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Real data | Status |
|---|---|---|---|---|
| GET /api/health | mongo, redis, nodeEnv, testMode, maxPoolSize | live pings; raw NODE_ENV; the single isTestMode decision | yes | ✓ FLOWING (testMode and the x-test-user decision now share one source) |
| Boot banner / warnings | NODE_ENV display, near-miss flag | loadBaseConfig | yes | ✓ FLOWING |
| requireAuth x-test-user | cfg.isTestMode | raw NODE_ENV === "test" | yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Typecheck | `npm --prefix backend run typecheck` | exit 0 | ✓ PASS |
| Unit + build | `npm --prefix backend test` | 149/149 | ✓ PASS |
| Integration | `npm --prefix backend run test:int` | 57/57 | ✓ PASS |
| Config matrix | `node --import tsx` probe of loadBaseConfig | see Evidence | ✓ PASS |
| Infra | `docker ps`, `redis-cli CONFIG GET appendfsync` | healthy, 127.0.0.1 only, everysec | ✓ PASS |

### Probe Execution

Step 7c: SKIPPED. No `scripts/*/tests/probe-*.sh` exist, and no plan declares a probe.

### Requirements Coverage

| Requirement | Source Plan | Status | Evidence |
|---|---|---|---|
| INFRA-01 | 01-01 | ✓ SATISFIED | compose, docker port, AOF (re-checked) |
| INFRA-02 | 01-01 | ✓ SATISFIED | strict NodeNext, scripts, build copies lua |
| INFRA-03 | 01-01, 01-08 | ✓ SATISFIED | one-line fail-fast on every path; silent Redis bounded at 5 s |
| INFRA-04 | 01-01, 01-06 | ✓ SATISFIED | health 200/503 plus testMode |
| INFRA-05 | 01-02, 01-07 | ✓ SATISFIED | §7 mapping incl. empty declared-JSON body |
| INFRA-06 | 01-01 | ✓ SATISFIED | maxPoolSize explicit and printed |
| DATA-01 | 01-02 | ✓ SATISFIED | models and indexes |
| DATA-02 | 01-02, 01-03 | ✓ SATISFIED | indexes ensured before listen/insert; index failure prints one line |
| DATA-03 | 01-03, 01-08 | ✓ SATISFIED | seed; one-line failure |
| DATA-04 | 01-03 | ✓ SATISFIED (cache clause deferred to Phase 2) | reset service |
| DATA-05 | 01-03, 01-08 | ✓ SATISFIED | warning printed first, even on failure |
| AUTH-01 | 01-04 | ✓ SATISFIED | register tests |
| AUTH-02 | 01-04 | ✓ SATISFIED | JWT tests |
| AUTH-03 | 01-04 | ✓ SATISFIED | requireAuth tests |
| AUTH-04 | 01-04 | ✓ SATISFIED | router.use guard tests |
| AUTH-05 | 01-04, 01-05, 01-06 | ✓ SATISFIED | single raw site; near-miss is display-only |

No orphaned requirements: all 16 Phase 1 IDs are claimed by at least one plan. The REQUIREMENTS.md traceability table still shows "Gaps Found" for 10 IDs (INFRA-01/02/06, DATA-01/02/04, AUTH-01..04), so the orchestrator should update it.

### Prohibitions

| Prohibition | Tier | Disposition | Evidence |
|---|---|---|---|
| No connection to 27017 | test | ✓ VERIFIED | config.test + boot.test |
| Ports only on 127.0.0.1 | test | ✓ VERIFIED (human, UAT 8) | compose and `docker port` re-checked |
| JWT_SECRET never printed | judgment | ✓ resolved (human, UAT 8) | health.test asserts absence in stdout/stderr |
| No per-request logging; buy path log-free | judgment | ✓ resolved (human, UAT 8) | app.ts: no logger; rejectEmptyJson logs nothing |
| Seed FLUSHDB only, never FLUSHALL | test | ✓ VERIFIED (human, UAT 8) | no flushall in src/scripts/test |
| Reset CLI always warns | test | ✓ VERIFIED | boot.test + redis-boot.test assert the warning as line 1 on failure paths |
| x-test-user only on raw exact "test", never admin; near-miss never enables it | test | ✓ VERIFIED | config.test, auth.test, health.test "test " server gives testMode false |
| Tests never stop/restart shared containers | judgment | ✓ holds | no docker stop/restart in backend/test |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| backend/test/helpers.ts | 346-351 | `connectTestStores` leaks a reconnecting Redis client when connectRedis rejects, so test:int hangs if Redis is down (REVIEW WR-01, open) | ⚠️ Warning | test-helper only; no product behavior; test:int is green while Redis is up |
| backend/src/server.ts | 23-26, 58-64 | warnings before listen (REVIEW IN-03) | ℹ️ Info / advisory | see Advisory 1 |
| backend/test/config.test.ts | 161-178 | literal invisible characters (REVIEW IN-02) | ℹ️ Info | bytes verified correct; readability only |
| backend/src/server.ts | 43, 52 | unguarded `mongoose.disconnect()` on failure paths (REVIEW IN-04) | ℹ️ Info | no observed failure |
| backend/src/services/sale-admin.service.ts | 56-81 | reset reopens the sale before the Redis reset / order delete (carried from the earlier review) | ⚠️ Warning | carried forward; to address with the Phase 2 admin route |
| backend/src/server.ts | 68 | listens on all interfaces while test mode enables x-test-user (carried from the earlier review) | ⚠️ Warning | carried forward |

No TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER markers in any file changed by 01-06..01-08.

### Human Verification Required

**Prerequisites and Env source:** `backend/.env` must exist. Create it once in `backend/` with the command in the `backend/.env.example` header: it writes a random 32-byte JWT_SECRET straight into the file, never prints it, refuses to overwrite an existing file, and the file stays gitignored and is never committed. Env source: `backend/.env` only. Run both items in a fresh cmd.exe window opened with Win+R then `cmd`, and first run the names-only presence check `for %V in (MONGODB_URI REDIS_URL JWT_SECRET NODE_ENV PORT) do @if defined %V echo %V dang dat trong phien nay`, which must print nothing. Why: the 2026-11-06 round failed test 2 because `backend/.env` was missing (every start stopped at `[LỖI] Thiếu biến môi trường MONGODB_URI`), and test 1 most likely passed only because session variables were set.

1. **Real Redis-down boot (G-01-2 re-check).** In that window, from `backend/`, run `npm run build`, `docker stop flashsale-redis`, then `npm run start`, `npm run seed` and `npm run reset`, then `docker start flashsale-redis` and wait until `docker compose ps` shows it healthy. Server and seed should exit 1 with exactly one `[LỖI] Không kết nối được Redis tại 127.0.0.1:6379...` line. Reset should print its cache warning, then that line. If the local JWT_SECRET is shorter than 32 characters, the server also prints the short-secret warning first; that is intended. A `[LỖI] Thiếu biến môi trường MONGODB_URI` line means the prerequisite was skipped, not a Redis result.
2. **Real cmd.exe near-miss, then start:test in the same window (G-01-1 and G-01-9 re-check).** In ONE fresh window, from `backend/`, run `npm run build`, then `set NODE_ENV=test && npm run start` (this leaves `NODE_ENV="test "` in the window). The banner should show `NODE_ENV="test "`, stderr should have exactly one `[CẢNH BÁO] NODE_ENV="test "` line recommending `npm run start:test`, and http://localhost:5000/api/health should show `testMode: false`. Stop it with Ctrl+C. In the SAME window, without clearing NODE_ENV, run `npm run start:test`: it should print CHẾ ĐỘ TEST and the banner `NODE_ENV="test"`, with no near-miss line and no dotenv injected-env line, and health should show `testMode: true`, `nodeEnv: "test"`. Stop it with Ctrl+C; the health URL should then no longer answer (port 5000 freed). Finally run `set NODE_ENV=`.

Both are real-environment confirmations of truths already proven by automated tests (an unused port standing in for a stopped container, and NODE_ENV "test " injected directly). The verifier cannot stop shared containers or drive cmd.exe.

### Gaps Summary

All three UAT gaps are closed in code and pinned by exact tests that the verifier ran green:
- **G-01-1:** health `testMode`, raw `nodeEnv`, quoted banner, near-miss warning; D-17 amended.
- **G-01-4:** a declared-JSON zero-byte body gives 400 INVALID_JSON in every framing, and no-Content-Type body-less POSTs still reach routing.
- **G-01-2:** one `[LỖI]` line on every Redis startup failure for server, seed and reset; a silent Redis is bounded by a 5 s deadline; runtime disconnect logging is kept.

The test-mode decision still lives at its single raw site, and `middlewares/auth.ts` and the CLI scripts are untouched. No regressions: typecheck passes, unit 149/149, integration 57/57, and the infra is unchanged.

The phase is at `human_needed` only for two real-environment re-checks of the UAT scenarios. The open warnings are REVIEW WR-01 (test helper hangs when Redis is down) and two carried-forward review warnings. None blocks the phase goal.

---

_Verified: 2026-11-06T07:29:49Z_
_Verifier: Claude (gsd-verifier)_
