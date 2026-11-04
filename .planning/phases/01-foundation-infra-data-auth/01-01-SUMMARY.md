---
phase: 01-foundation-infra-data-auth
plan: 01
subsystem: infra
tags: [docker-compose, mongodb, redis, express5, mongoose9, ioredis6, typescript7, esm, node-test, fail-fast]

# Dependency graph
requires: []
provides:
  - "docker-compose.yml: flashsale-mongo (mongo:7.0, 127.0.0.1:27018) and flashsale-redis (redis:7.4, AOF everysec, 127.0.0.1:6379), both with healthchecks"
  - "backend/ ESM package: dev/typecheck/build/start/start:test/seed/reset/test/test:int scripts; build copies src/lua to dist/lua"
  - "config/env.ts: ConfigError, BaseConfig, parseMongoUri (27017 guard), parseRedisUrl, loadBaseConfig, loadJwtSecret; the single isTestMode check"
  - "config/db.ts: connectMongo (explicit maxPoolSize, 5 s selection timeout, autoIndex/autoCreate off), pingMongo"
  - "config/redis.ts: createRedis (lazyConnect, 5 s connect timeout, maxRetriesPerRequest 1, throttled error listener), connectRedis, pingRedis, stockKey, buyersKey"
  - "app.ts createApp(deps: AppDeps) with no I/O and no request logging; routes/index.ts createApiRouter mounted at /api"
  - "GET /api/health -> 200/503 { mongo, redis, nodeEnv, maxPoolSize }, each ping bounded to 1000 ms"
  - "server.ts fail-fast boot: config -> port probe -> MongoDB -> Redis -> test-mode warning -> listen (EADDRINUSE check) -> banner"
  - "utils: withTimeout, fail, isPortFree"
  - "src/lua/buy.lua verbatim from SPECS section 8 (not wired yet)"
  - "test/helpers.ts shared harness: BACKEND_ROOT, TEST_JWT_SECRET, testMongoUri, testRedisUrl, testConfig, getFreePort, startApp, spawnServer, startServerProcess, waitFor, connectTestStores, dropTestDatabaseAndDisconnect"
affects: [01-02, 01-03, 01-04, phase-02, phase-03, phase-04]

actuals:
  tokens: 33162      # chars/4 over the full realized diff (132649 chars incl. package-lock.json); ~12450 excluding the lockfile
  tasks: 3           # Task 1 checkpoint (approved), Task 2 tracer, Task 3 TDD
  commits: 3         # MEASURED: git rev-list --count 6cd2727..HEAD at SUMMARY write
plan_head_before: 6cd2727c2619b2f26aca10f81086abaaa1e05634
plan_head_after: ca6f0d5b75879f118a7408ceee4c52db206d7c07

# Tech tracking
tech-stack:
  added:
    - "express 5.3.0, mongoose 9.11.4, ioredis 6.0.0, jsonwebtoken 9.0.3, bcryptjs 3.0.3, cors 2.8.6, dotenv 18.0.9"
    - "dev: typescript 7.0.2, tsx 4.23.15, @types/node 24.19.2, @types/express, @types/jsonwebtoken, @types/cors"
    - "docker images mongo:7.0, redis:7.4"
  patterns:
    - "Config read only inside functions in config/env.ts (import 'dotenv/config' first); nothing else in src touches the environment"
    - "Dependencies injected through AppDeps { cfg, jwtSecret, redis }; createApp performs no I/O"
    - "Boot failures: one [LỖI] Vietnamese line via fail() then exit 1"
    - "Health pings: readiness gate + withTimeout(1000) + catch -> false, so the endpoint never hangs"
    - "Tests: node:test + node:assert/strict via --import tsx; one top-level describe('<file stem>') per file; per-file Mongo db flashsale_test_<name>_<pid>, Redis db 1..15 only"
    - "Boot tests spawn the compiled dist/server.js from a mkdtemp cwd so backend/.env is never loaded"

key-files:
  created:
    - docker-compose.yml
    - backend/package.json
    - backend/package-lock.json
    - backend/tsconfig.json
    - backend/tsconfig.build.json
    - backend/.env.example
    - backend/src/config/env.ts
    - backend/src/config/db.ts
    - backend/src/config/redis.ts
    - backend/src/utils/with-timeout.ts
    - backend/src/utils/fail.ts
    - backend/src/utils/port.ts
    - backend/src/controllers/health.controller.ts
    - backend/src/routes/index.ts
    - backend/src/app.ts
    - backend/src/server.ts
    - backend/src/lua/buy.lua
    - backend/test/helpers.ts
    - backend/test/integration/health.test.ts
    - backend/test/config.test.ts
    - backend/test/boot.test.ts
    - backend/test/build.test.ts
  modified:
    - .planning/REQUIREMENTS.md

key-decisions:
  - "Task 1 package legitimacy gate approved by the user on 2026-11-04; installed exactly the approved 13 packages (resolved: express 5.3.0, mongoose 9.11.4, dotenv 18.0.9, @types/node 24.19.2)"
  - "Weak JWT_SECRET (< 32 chars) only warns, never refuses (RESEARCH Open Question 3)"
  - "Port probe isPortFree (127.0.0.1 + ::1, 1 s) runs before connectMongo; the listen-callback EADDRINUSE check is kept for the probe-to-listen window"
  - "dropTestDatabaseAndDisconnect refuses to drop any database whose name does not start with flashsale_test_"
  - "Compose project name pinned (name: flashsale); volumes are flashsale_mongo-data / flashsale_redis-data (the older flashsale_mongo_data / flashsale_redis_data volumes on this machine are left untouched)"

patterns-established:
  - "Fail-fast boot: every bad start condition is one [LỖI] line + exit 1, covered by spawn tests"
  - "Test isolation: per-file Mongo database + dedicated Redis db index; never the demo flashsale db or Redis db 0"

requirements-completed: [INFRA-01, INFRA-02, INFRA-03, INFRA-04, INFRA-06]

coverage:
  - id: D1
    description: "MongoDB 7 + Redis 7.4 (AOF everysec) healthy in Docker, published on 127.0.0.1 only"
    requirement: INFRA-01
    verification:
      - kind: other
        ref: "docker compose up -d --wait && docker exec flashsale-redis redis-cli CONFIG GET appendfsync (everysec), CONFIG GET appendonly (yes), docker port (127.0.0.1:27018 / 127.0.0.1:6379), docker compose ps (healthy)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Backend typechecks and builds; dist/server.js and dist/lua/buy.lua emitted, no dist/src"
    requirement: INFRA-02
    verification:
      - kind: unit
        ref: "backend/test/build.test.ts#build.test"
        status: pass
      - kind: other
        ref: "npm --prefix backend run typecheck && npm --prefix backend run build"
        status: pass
    human_judgment: false
  - id: D3
    description: "Server exits 1 with a [LỖI] Vietnamese message on missing JWT_SECRET/REDIS_URL, implicit 27017 URI, held port, dead MongoDB, dead Redis"
    requirement: INFRA-03
    verification:
      - kind: unit
        ref: "backend/test/boot.test.ts#boot.test"
        status: pass
      - kind: unit
        ref: "backend/test/config.test.ts#config.test"
        status: pass
      - kind: integration
        ref: "backend/test/integration/health.test.ts#Redis không chạy lúc khởi động: thoát mã 1 và nêu Redis"
        status: pass
    human_judgment: false
  - id: D4
    description: "GET /api/health returns 200 { mongo, redis, nodeEnv, maxPoolSize } with both stores up, 503 within 3 s when Redis is unreachable; start:test mode reports nodeEnv test with the CHẾ ĐỘ TEST warning"
    requirement: INFRA-04
    verification:
      - kind: integration
        ref: "backend/test/integration/health.test.ts#health.test"
        status: pass
    human_judgment: false
  - id: D5
    description: "Explicit maxPoolSize (MONGO_MAX_POOL_SIZE, default 100) passed to mongoose.connect, printed in the boot banner and exposed by health"
    requirement: INFRA-06
    verification:
      - kind: integration
        ref: "backend/test/integration/health.test.ts#banner in maxPoolSize và đích MongoDB, không in URI thô hay khóa JWT"
        status: pass
      - kind: unit
        ref: "backend/test/config.test.ts#loadBaseConfig"
        status: pass
    human_judgment: false
  - id: D6
    description: "Manual boot matrix on the developer machine: (a) blank JWT_SECRET, (b) Docker Desktop stopped, (c) only flashsale-redis stopped, (d) port 5000 held by another process; plus health 200 -> 503 -> 200 across docker stop/start flashsale-redis"
    requirement: INFRA-03
    verification: []
    human_judgment: true
    rationale: "Requires stopping Docker Desktop and containers on the developer machine, which automated tests must not do (Task 3 human-check, harvested at end of phase)"

# Metrics
duration: 10min
completed: 2026-11-04
status: complete
---

# Phase 1 Plan 01: Infra skeleton and fail-fast boot Summary

**Docker MongoDB 7 (127.0.0.1:27018) + Redis 7.4 AOF everysec, a TS 7 strict ESM Express 5 backend whose compiled server fails fast with Vietnamese [LỖI] messages on every bad boot condition and serves GET /api/health 200/503 with explicit maxPoolSize, plus a shared node:test harness**

## Performance

- **Duration:** ~10 min (this continuation; Task 1 checkpoint handled by the previous executor)
- **Started:** 2026-11-04T07:51:36Z
- **Completed:** 2026-11-04T08:01:43Z
- **Tasks:** 3 (Task 1 checkpoint approved, Task 2 tracer, Task 3 TDD)
- **Files created:** 23 (22 committed + `backend/.env.test`, see Issues Encountered)

## Accomplishments

- `docker compose up -d --wait` brings up `flashsale-mongo` and `flashsale-redis` healthy, loopback-only, AOF `everysec`/`appendonly yes` confirmed with `CONFIG GET`.
- Backend package installed with exactly the user-approved ranges; `typecheck` and `build` pass, `dist/lua/buy.lua` is copied, no `dist/src`.
- Config module with the 27017 guard (explicit and implicit port), required `MONGODB_URI`/`REDIS_URL`/`JWT_SECRET`, validated `PORT` and `MONGO_MAX_POOL_SIZE`, and the single `isTestMode` comparison.
- Boot sequence: config, port probe, MongoDB (5 s), Redis (connect + PING), test-mode warning, listen with EADDRINUSE check, banner `API http://localhost:<port> | MongoDB host:port/db | Redis host:port | NODE_ENV=... | maxPoolSize=<n>` (never the raw URI or secret).
- Health endpoint with bounded pings: 200 with both stores, 503 `{ mongo: true, redis: false }` in ~12 ms with Redis unreachable.
- Test suites: `npm test` 29/29 (config.test, boot.test, build.test), `npm run test:int` 5/5 (health.test). All test databases dropped afterwards (`listDatabases` shows only admin/config/local).

## Task Commits

1. **Task 1: Package legitimacy gate** - no commit (checkpoint only). Approved by the user on 2026-11-04: install exactly `express@^5.3.0 mongoose@^9.11.4 ioredis@^6.0.0 jsonwebtoken@^9.0.3 bcryptjs@^3.0.3 cors@^2.8.6 dotenv@^18.0.9` and dev `typescript@~7.0.2 tsx@^4.23.15 @types/node@^24 @types/express@^5.0.6 @types/jsonwebtoken@^9.0.10 @types/cors@^2.8.19`. Resolved in package-lock: express 5.3.0, mongoose 9.11.4, dotenv 18.0.9, @types/node 24.19.2, ioredis 6.0.0, jsonwebtoken 9.0.3, bcryptjs 3.0.3, cors 2.8.6, typescript 7.0.2, tsx 4.23.15. `npm install-scripts approve` was not run (esbuild postinstall warning is harmless).
2. **Task 2: Tracer - compiled backend boots against Docker and answers GET /api/health 200** - `7fb0b07` (feat)
3. **Task 3: Fail fast on every bad boot condition** - `826160c` (test, RED) then `ca6f0d5` (feat, GREEN). No refactor commit (nothing to clean up).

## TDD Gate Compliance (Task 3)

- **RED** (`826160c`): `node --import tsx --test --test-reporter=tap test/boot.test.ts` exit 1; 5 tests, 4 pass, 1 fail. Target test "thoát mã 1 trong 3 giây với thông báo cổng đang bị chiếm" failed on its planned assertion (`/đang bị chiếm/`); actual stderr was the MongoDB connect failure after ~5.5 s because no port probe existed yet. Classifier `check tdd-red-evidence`: `RED_EVIDENCE_OK` (`target_test_failed`, format tap). Semantic assessment: valid RED, the target executed and failed for the intended reason (missing probe), no load/syntax/fixture faults. The other boot, config and build cases already passed at RED because Task 2 had implemented their behaviour (config guards, fail()).
- **GREEN** (`ca6f0d5`): `isPortFree` added and awaited before `connectMongo`; the port case now exits 1 in ~535 ms with "Cổng ... đang bị chiếm". Full `npm test` and `npm run test:int` green.
- **REFACTOR:** none.

## Files Created/Modified

- `docker-compose.yml` - MongoDB 7.0 + Redis 7.4 with healthchecks, loopback ports, named volumes, project name `flashsale`
- `backend/package.json`, `backend/package-lock.json` - ESM package, scripts, pinned dependency ranges
- `backend/tsconfig.json`, `backend/tsconfig.build.json` - strict NodeNext typecheck (src, scripts, test); emit `src` -> `dist` with explicit rootDir
- `backend/.env.example` - PORT, MONGODB_URI (27018), REDIS_URL, CLIENT_ORIGIN, empty JWT_SECRET, MONGO_MAX_POOL_SIZE=100 with Vietnamese comments
- `backend/.env.test` - `NODE_ENV=test` only (created, NOT committed - see Issues Encountered)
- `backend/src/config/env.ts` - config loading and URI guards
- `backend/src/config/db.ts` - connectMongo / pingMongo
- `backend/src/config/redis.ts` - createRedis / connectRedis / pingRedis / stockKey / buyersKey
- `backend/src/utils/with-timeout.ts`, `fail.ts`, `port.ts` - timeout wrapper, [LỖI] exit helper, loopback port probe
- `backend/src/controllers/health.controller.ts`, `backend/src/routes/index.ts`, `backend/src/app.ts` - health handler, /api router, createApp
- `backend/src/server.ts` - fail-fast boot sequence and banner
- `backend/src/lua/buy.lua` - SPECS section 8 script, byte-identical to SPECS lines 242-251
- `backend/test/helpers.ts` - shared harness for all later plans
- `backend/test/config.test.ts`, `boot.test.ts`, `build.test.ts`, `integration/health.test.ts` - unit and integration tests

## Decisions Made

- Weak `JWT_SECRET` (< 32 chars) prints a Vietnamese warning without the value and boots normally (locked choice from RESEARCH Open Question 3).
- `dropTestDatabaseAndDisconnect` refuses to drop any database not named `flashsale_test_*` (extra safety on top of per-file names).
- `spawnServer`/`startServerProcess` strip every server env var case-insensitively from the inherited environment before applying test values, so a developer's real `backend/.env` (loaded by dotenv in the test process) never leaks into boot tests.
- Added a small `waitFor` helper (not in the plan's export list, plan step 6 allows new helpers) because stdout from the spawned server arrives over a pipe asynchronously on Windows.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Safety guard in dropTestDatabaseAndDisconnect**
- **Found during:** Task 2
- **Issue:** The helper drops "the current mongoose database"; if a later test ever connected to the demo `flashsale` db by mistake, it would wipe demo data.
- **Fix:** It now throws unless the connected database name starts with `flashsale_test_`.
- **Files modified:** backend/test/helpers.ts
- **Verification:** test:int still green; `listDatabases` shows only admin/config/local after the run.
- **Committed in:** 7fb0b07

**2. [Rule 3 - Blocking] Added waitFor helper for asynchronous pipe output**
- **Found during:** Task 2
- **Issue:** Banner/warning assertions could race the child's stdout pipe on Windows.
- **Fix:** `waitFor(cond, timeoutMs)` polls until the text appears (max 3 s).
- **Files modified:** backend/test/helpers.ts, backend/test/integration/health.test.ts
- **Committed in:** 7fb0b07, 826160c

---

**Total deviations:** 2 auto-fixed (1 missing critical, 1 blocking)
**Impact on plan:** Test-harness hardening only; every plan export name and signature is unchanged.

## Issues Encountered

- **`backend/.env.test` is created but NOT committed.** The machine's PreToolUse secret-read guard blocks any Bash command that names a `.env.<suffix>` file, including `git add backend/.env.test` and even a commit message mentioning it. The file holds only `NODE_ENV=test` (no secret) and is not git-ignored (`git check-ignore backend/.env.test` exits 1), and the plan (D-20) requires it committed. The executor did not bypass the guard. **Action needed before the worktree is removed:** the orchestrator or user stages and commits it (`git add backend/.env.test`), or recreates it on the merged branch with the single line `NODE_ENV=test`. Without it, `npm run start:test` and the `--env-file` case of `npm run test:int` fail on a fresh checkout.
- The bookkeeping ledger file for this plan could not be written inside `.git/worktrees/...` (worktree isolation guard); the base `6cd2727` and start time were tracked in-session instead.
- Plan `<automated>` verify commands were run split into plain commands because the worktree guard rejects compound command lines that mention git or docker format templates; every check ran and passed.

## User Setup Required

None for automated runs. For running the server by hand, copy `backend/.env.example` to `backend/.env` and set `JWT_SECRET` (the Task 3 manual boot matrix does this).

## Next Phase Readiness

- Plans 01-02 / 01-03 / 01-04 can import `BaseConfig`, `AppDeps`, `createApp`, `connectMongo`, `createRedis`, `stockKey`/`buyersKey` and the test harness unchanged.
- Pending end-of-phase human check (D6): the manual 4-case boot matrix and the health 200 -> 503 -> 200 sequence with `docker stop/start flashsale-redis`.
- Blocker for merge: commit `backend/.env.test` (see Issues Encountered).

## Self-Check: PASSED

- Commits on this branch: 7fb0b07, 826160c, ca6f0d5 (code), dcc756f (SUMMARY + REQUIREMENTS).
- Files present: all 22 committed key files; `backend/.env.test` present on disk but uncommitted (guard-blocked, flagged above).
- No commit carries a `Co-Authored-By` line.
- Plan verification re-run: compose healthy + AOF everysec; typecheck + build; `npm test` 29/29; `npm run test:int` 5/5.

---
*Phase: 01-foundation-infra-data-auth*
*Completed: 2026-11-04*
