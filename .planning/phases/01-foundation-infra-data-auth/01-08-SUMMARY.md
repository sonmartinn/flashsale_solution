---
phase: 01-foundation-infra-data-auth
plan: 08
subsystem: infra
tags: [redis, ioredis, startup, fail-fast, stderr, node-test, gap-closure]

requires:
  - phase: 01-06
    provides: "server.ts boot sequence with test-mode warnings printed only after MongoDB and Redis connect; spawnServer/startServerProcess helpers"
provides:
  - "createRedis attaches only a silent error listener; the rate-limited [Redis] mất kết nối logger is armed by connectRedis after connect + PING succeed"
  - "REDIS_STARTUP_TIMEOUT_MS = 5000 and connectRedis(client, timeoutMs = REDIS_STARTUP_TIMEOUT_MS) bounding connect + handshake + PING"
  - "Test helpers stderrLines, startFakeRedis (reset/garbage/silent), spawnCli (seed/reset via node --import tsx in a temp cwd)"
  - "Exact stderr line-count tests for every server boot failure, seed/reset with MongoDB or Redis down, and runtime disconnect logging"
affects: [phase-02-buy-api, phase-03-loadtest, uat-01]

actuals:
  tokens: 8000
  tasks: 3
  commits: 4
plan_head_before: f8288fea89290438ba326dcc142a872709651443
plan_head_after: e597000080ae44970581823af854d3aa5b53c225

tech-stack:
  added: []
  patterns:
    - "Silent error listener from client creation, runtime logger armed only after a successful startup"
    - "Startup deadline via a single withTimeout chain (connect().then(ping)) so late rejections stay handled"
    - "Tests count stderr lines with stderrLines() instead of regex-matching anywhere in stderr"
    - "Redis failures simulated with an unused port, fake TCP servers and a TCP proxy; shared containers never stopped"

key-files:
  created:
    - backend/test/redis.test.ts
    - backend/test/integration/redis-boot.test.ts
  modified:
    - backend/src/config/redis.ts
    - backend/test/helpers.ts
    - backend/test/boot.test.ts
    - backend/test/integration/health.test.ts
    - backend/test/integration/models.test.ts

key-decisions:
  - "The G-01-2 fix lives only in backend/src/config/redis.ts; server.ts, seed.ts and reset.ts are unchanged and share the fix"
  - "redis.test.ts guards connectRedis with a 3000 ms race so a hang fails as an assertion (Missing expected rejection) instead of a test timeout, which the RED-evidence classifier rejects"
  - "redis.test.ts imports the module as a namespace (import * as redisConfig) so the RED run could load before REDIS_STARTUP_TIMEOUT_MS existed"

patterns-established:
  - "Exact stderr line-count oracle: every startup failure test asserts stderrLines(stderr).length plus an anchored pattern on each line"
  - "CLI tests run scripts/<name>.ts through spawnCli in a fresh temp cwd so backend/.env is never loaded"

requirements-completed: [INFRA-03, DATA-03, DATA-05]

coverage:
  - id: D1
    description: "With Redis unreachable at boot (127.0.0.1:6390) the compiled server exits 1 with exactly one [LỖI] Redis line and no [Redis]/ioredis line"
    requirement: INFRA-03
    verification:
      - kind: integration
        ref: "backend/test/integration/health.test.ts#Redis không chạy lúc khởi động: thoát mã 1 và nêu Redis"
        status: pass
    human_judgment: false
  - id: D2
    description: "Every Redis startup failure flavor (refused, reset, garbage, silent) rejects connectRedis with zero console output; silent fails within the startup deadline"
    requirement: INFRA-03
    verification:
      - kind: unit
        ref: "backend/test/redis.test.ts#redis.test"
        status: pass
      - kind: integration
        ref: "backend/test/integration/redis-boot.test.ts#server đã biên dịch với Redis hỏng lúc khởi động"
        status: pass
    human_judgment: false
  - id: D3
    description: "Every other server boot failure (JWT unset/blank, REDIS_URL unset, port 27017, held port, MongoDB down, index failure) prints exactly one stderr line and no banner"
    requirement: INFRA-03
    verification:
      - kind: unit
        ref: "backend/test/boot.test.ts#boot.test"
        status: pass
      - kind: integration
        ref: "backend/test/integration/models.test.ts#tạo index thất bại: server thoát mã 1 với thông báo tiếng Việt, không listen"
        status: pass
    human_judgment: false
  - id: D4
    description: "seed and reset exit 1 with exactly one [LỖI] line (reset: its [CẢNH BÁO] cache warning first) when MongoDB is down, Redis refuses or Redis never answers"
    requirement: DATA-05
    verification:
      - kind: unit
        ref: "backend/test/boot.test.ts#seed/reset CLI khi MongoDB không chạy"
        status: pass
      - kind: integration
        ref: "backend/test/integration/redis-boot.test.ts#CLI seed/reset với Redis hỏng (MongoDB chạy)"
        status: pass
    human_judgment: false
  - id: D5
    description: "After a successful boot, a cut Redis connection logs exactly one [Redis] mất kết nối line, health answers 503, and the server recovers to 200 without further stderr"
    requirement: INFRA-03
    verification:
      - kind: integration
        ref: "backend/test/integration/redis-boot.test.ts#ghi đúng một dòng [Redis] mất kết nối, vẫn chạy (health 503) và tự hồi phục"
        status: pass
    human_judgment: false
  - id: D6
    description: "UAT test 2 case (c) on the real setup: stop flashsale-redis, then npm run start / seed / reset each print exactly one [LỖI] Redis line (reset: warning first)"
    requirement: INFRA-03
    verification: []
    human_judgment: true
    rationale: "Stopping the shared flashsale-redis container is the user's call; the automated suite reproduces the same failure with an unused port, fake servers and a proxy"

duration: 11min
completed: 2026-11-06
status: complete
---

# Phase 1 Plan 08: Redis startup single-line failure (G-01-2) Summary

**Redis startup failures now end in exactly one Vietnamese [LỖI] line for the server, seed and reset: the runtime disconnect logger is armed only after connect + PING succeed, and a 5 s REDIS_STARTUP_TIMEOUT_MS deadline stops a silent Redis from hanging the boot.**

## Performance

- **Duration:** about 11 min
- **Started:** 2026-11-06T07:02:04Z
- **Completed:** 2026-11-06T07:12:52Z
- **Tasks:** 3
- **Files modified:** 7 (2 created, 5 modified)

## Accomplishments

- `backend/src/config/redis.ts`: `createRedis` keeps only a silent `error` listener (so ioredis never prints its unhandled-error stack). The private `attachRuntimeErrorLog` (same text, same 10 s rate limit) is attached by `connectRedis` after success. `connectRedis(client, timeoutMs = REDIS_STARTUP_TIMEOUT_MS)` wraps `connect().then(ping)` in one `withTimeout`.
- New helpers in `backend/test/helpers.ts`: `stderrLines`, `startFakeRedis("reset" | "garbage" | "silent")`, and `spawnCli("seed" | "reset", ...)`. `spawnServer` and `spawnCli` share one private `spawnNodeAndCollect`, and `spawnServer`'s signature and behaviour are unchanged.
- A Docker-free in-process matrix (`redis.test.ts`) plus exact-line boot cases (`boot.test.ts`, with a new blank-JWT case and seed/reset with MongoDB down).
- An integration matrix (`redis-boot.test.ts`) covers the compiled server against reset/garbage/silent fakes, both CLIs against refused/silent Redis, and the runtime proxy-cut case. The index-failure case in `models.test.ts` was tightened to exactly one line.

## Task Commits

1. **Task 1 (tracer): logging armed only after a successful connect.** `2352665` (fix). Covers the redis.ts listener change, stderrLines, and the tightened health.test case.
2. **Task 2 (tdd): startup deadline plus the Docker-free matrix.** RED `e82cb8b` (test), GREEN `b8c390d` (feat).
3. **Task 3 (tdd): integration matrix.** `e597000` (test). The behaviour already existed, so the RED proof is the mutation run below.

## TDD / RED evidence

- **Task 1 RED** (before the redis.ts change): `node --import tsx --test test/integration/health.test.ts` failed `Redis không chạy lúc khởi động` with `2 !== 1`. The stderr was:
  `[Redis] mất kết nối: connect ECONNREFUSED 127.0.0.1:6390` followed by `[LỖI] Không kết nối được Redis tại 127.0.0.1:6390. Chạy "docker compose up -d --wait" ở thư mục gốc.`
- **Task 2 RED** (`e82cb8b`, before the deadline): `node --import tsx --test --test-reporter=tap test/redis.test.ts` failed 2 of 5.
  - `REDIS_STARTUP_TIMEOUT_MS là 5000 ms`: `undefined !== 5000`.
  - The silent case: `Missing expected rejection (Error): connectRedis không reject trong 3000 ms (treo)`.
  - `gsd-tools check tdd-red-evidence` returned **RED_EVIDENCE_OK** (`target_test_failed`).
  - Semantic assessment: the target ran and failed on its planned assertion, which is that connectRedis must reject within the deadline. It was not a load or fixture fault.
  - A first attempt that relied on the node:test 10 s timeout was classified INVALID_RED (a timeout is not an assertion), so the test now races against a 3000 ms guard. See Decisions.
- **Task 2 mutation** (runtime logger also attached inside createRedis): redis.test failed refused (`[Redis] mất kết nối: connect ECONNREFUSED 127.0.0.1:49730`), reset (`[Redis] mất kết nối: write ECONNABORTED`) and garbage (`[Redis] mất kết nối: Unknown RESP type 72 "H". Please report this.`). Silent and the constant case still passed. Reverted with `git checkout`.
- **Task 3 mutation** (arming call removed from connectRedis): the redis-boot runtime case failed. No `[Redis] mất kết nối` line appeared within 5 s, and stderr was empty. The other 7 redis-boot cases passed. Reverted. `grep -c MUTATION` gives 0.
- **GREEN**: `npm --prefix backend run typecheck` passed, `npm --prefix backend test` passed 142/142, and `npm --prefix backend run test:int` passed 57/57 (redis-boot.test, health, models, auth, reset and seed all green).

## Files Created/Modified

- `backend/src/config/redis.ts`: silent listener, `attachRuntimeErrorLog`, `REDIS_STARTUP_TIMEOUT_MS`, and the deadline in `connectRedis`
- `backend/test/helpers.ts`: `stderrLines`, `spawnNodeAndCollect` (private), `spawnCli`, `FakeRedis`, `startFakeRedis`
- `backend/test/redis.test.ts` (new): in-process refused/reset/garbage/silent matrix with console collectors
- `backend/test/boot.test.ts`: exact-one-line assertions, the blank-JWT case, and seed/reset with MongoDB down
- `backend/test/integration/health.test.ts`: the Redis-down case asserts exactly one anchored [LỖI] line
- `backend/test/integration/models.test.ts`: the index-failure case asserts exactly one `[LỖI] Không tạo được index MongoDB: ` line
- `backend/test/integration/redis-boot.test.ts` (new): compiled server, CLIs, and runtime proxy-cut cases

## Decisions Made

- The silent-hang check in `redis.test.ts` races `connectRedis(client, 1000)` against a 3000 ms guard. A hang then fails fast as an assertion instead of waiting for the node:test timeout. The plan's `{ timeout: 10_000 }` and `< 2500 ms` bound are kept.
- `redis.test.ts` uses a namespace import of `src/config/redis.js`. A named import of the not-yet-existing constant would have been an ESM link error at RED, which is a load failure and not a valid RED.
- `assertSingleLineExit(r, stderrLines(r.stderr), pattern)` in boot.test keeps the server cases compact while each call site still counts lines explicitly.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The RED for the silent case had to be assertion-based**
- **Found during:** Task 2 RED
- **Issue:** The plan's RED was "the silent case times out". The TDD RED-evidence classifier rejects a test timeout as INVALID_RED (`invalid_record`, "Test run interrupted by cancellation, hook failure, or timeout").
- **Fix:** Added a 3000 ms `Promise.race` guard inside the redis.test helper, so a hang surfaces as `Missing expected rejection`. The behaviour tested is the same.
- **Files modified:** backend/test/redis.test.ts
- **Verification:** RED_EVIDENCE_OK on the RED run, and green after the GREEN commit
- **Committed in:** e82cb8b

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Test-harness detail only. No scope change. The src diff since the plan base is still only `backend/src/config/redis.ts`, and the index-message server.ts deviation allowed in Task 3 step 2 was not needed (MongoDB's index error is a single line).

## Issues Encountered

- `npm --prefix backend ci` warned that the esbuild postinstall script is not approved (npm install-scripts policy). tsx still ran correctly through the platform package, so no action was taken.
- No cross-run data interference was seen. Every integration run passed on the first attempt.

## Human Check Pending (end-of-phase UAT)

Re-run UAT test 2 case (c) on the real setup. Run `docker stop flashsale-redis`, then from backend/ run `npm run start`, `npm run seed` and `npm run reset`. Finally run `docker start flashsale-redis` and wait for healthy. Expected: each command exits 1. start and seed print exactly one `[LỖI] Không kết nối được Redis tại 127.0.0.1:6379. ...` line. reset prints its `[CẢNH BÁO]` cache warning, then that same line. No `[Redis] mất kết nối`, no stack trace, no secret.

## User Setup Required

None. No external service configuration required.

## Next Phase Readiness

- G-01-2 is closed in code and pinned by exact line-count tests. Phase 1 can go to UAT re-verification once plan 01-07 also lands.
- Phase 2 buy-path code that uses `createRedis` + `connectRedis` inherits fail-fast startup and runtime-only disconnect logging automatically.

## Self-Check: PASSED

- FOUND: backend/test/redis.test.ts, backend/test/integration/redis-boot.test.ts, backend/src/config/redis.ts
- FOUND commits: 2352665, e82cb8b, b8c390d, e597000 (all ancestors of HEAD)
- Acceptance greps re-run: lastLoggedAt in createRedis gives 0; `[Redis] mất kết nối: ` count 1; REDIS_STARTUP_TIMEOUT_MS count 2; startFakeRedis/spawnCli/import.meta.resolve("tsx") each 1; stderrLines( in boot.test 8, in health.test 1, in models.test 1; spawnCli( in redis-boot 1, startFakeRedis( 2; no container stop commands in backend/test; src/scripts diff since base = backend/src/config/redis.ts only

---
*Phase: 01-foundation-infra-data-auth*
*Completed: 2026-11-06*
