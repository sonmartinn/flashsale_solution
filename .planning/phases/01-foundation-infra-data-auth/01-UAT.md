---
status: diagnosed
phase: 01-foundation-infra-data-auth
source: [01-VERIFICATION.md]
started: 2026-11-04T15:52:57.986Z
updated: 2026-11-05T04:57:29.000Z
---

## Current Test

[testing complete]

## Tests

### 1. Decide on REVIEW CR-01 (open, rated critical by the reviewer): with NODE_ENV="test " the banner and GET /api/health report nodeEnv "test" while isTestMode is false and no CHẾ ĐỘ TEST warning is printed
expected: Either (a) accept for Phase 1, since 01-05 truth 5 mandates this exact behaviour, it fails closed, and Phase 3 SC1 already makes E1 INVALID when any 401 appears, and have the Phase 3 harness not rely on nodeEnv alone; or (b) require a small fix now: add `testMode: cfg.isTestMode` to the health body, make nodeEnv show the raw value (or warn on a near-miss NODE_ENV), and change config.test 'nodeEnv vẫn trim để hiển thị...' plus health.test accordingly
result: issue
reported: "chọn phương án b"
severity: major

### 2. Bad-boot matrix on the real dev setup (deferred end-of-phase check from 01-01 Task 3): (a) blank JWT_SECRET in backend/.env, (b) Docker Desktop stopped, (c) only flashsale-redis stopped, (d) another process holding port 5000. Run `npm run start` from backend/ each time
expected: Each case exits with code 1 and a single Vietnamese `[LỖI] ...` line naming the cause (JWT_SECRET / MongoDB 127.0.0.1:27018/flashsale / Redis 127.0.0.1:6379 / Cổng 5000 đang bị chiếm). No stack trace, and the secret is never printed
result: issue
reported: "Run by Claude at the user's request (node dist/server.js, built 2026-11-05 11:03, env vars passed inline, no backend/.env). (a) blank and unset JWT_SECRET: one [LỖI] Thiếu biến môi trường JWT_SECRET line, exit 1. (b) simulated by stopping both containers (Docker Desktop itself left running): one [LỖI] Không kết nối được MongoDB tại 127.0.0.1:27018/flashsale line after ~6 s, exit 1. (d) temp node process on port 5000: one [LỖI] Cổng 5000 đang bị chiếm line, exit 1. (c) only flashsale-redis stopped: exit 1 but TWO stderr lines: '[Redis] mất kết nối: connect ECONNREFUSED 127.0.0.1:6379' (client 'error' listener, src/config/redis.ts:23) followed by '[LỖI] Không kết nối được Redis tại 127.0.0.1:6379...'. No stack trace and the test secret never appeared in any output. User follow-up: sửa triệt để mục 2 c)"
severity: minor

### 3. Health transition: with the backend running, `docker stop flashsale-redis`, GET /api/health, then `docker start flashsale-redis` and GET /api/health again (repeat for flashsale-mongo)
expected: 200 { mongo: true, redis: true } -> 503 with redis:false answered in under 3 s -> 200 again after the container is back, without restarting the backend
result: pass
note: "Run by Claude: 200 -> stop redis 503 redis:false in 0.007 s -> start, 200 on first poll; stop mongo 503 mongo:false in 0.004 s -> start, 200 after 4 polls; same backend PID throughout"

### 4. Decide on the empty-JSON-body deviation (01-02 truth: 'an empty, malformed or JSON-primitive body yields 400 INVALID_JSON')
expected: Either accept via override (body-parser 2.x parses an empty JSON body to {}, which reaches routing and never yields 500, and is needed for body-less POSTs in Phase 2), or require a change
result: issue
reported: "sửa mục 4 theo hiểu biết của bạn để khắc phục (require a change; Claude's proposed behaviour recorded in gap G-01-4)"
severity: major

### 5. Decide on login with blank strings (01-04 truth lists 'blank strings' among inputs that return 400 for register OR login)
expected: Either accept via override (login with password '' returns 401 INVALID_CREDENTIALS, exactly as the 01-04 plan action and D-12 prescribe), or require 400
result: pass
note: "User accepted the override: login with a blank password returns 401 INVALID_CREDENTIALS (oke chấp nhận login mật khẩu rỗng trả 401)"

### 6. Backstop truth (01-02): orders index userId_1_createdAt_-1 backs newest-first listing; equal-createdAt order unspecified
expected: Confirm acceptable: the index exists (observed in a freshly seeded DB) but no Phase 1 query consumes it; sort stability is owned by Phase 2 READ-04
result: pass

### 7. Backstop truth (01-04): requireAdmin holds no shared mutable state, so concurrent admin/user requests cannot leak a role
expected: Confirm acceptable: requireAdmin is a pure closure reading only req.user; executor test 'request admin và user đồng thời không lẫn quyền của nhau' passes
result: pass

### 8. Prohibition review (flagged, non-authoritative LLM-judge verdicts): (1) JWT_SECRET never printed; (2) no per-request logging middleware; (3) MongoDB/Redis ports bound to 127.0.0.1 only; (4) seed only FLUSHDB on the configured db, never FLUSHALL; (5) reset CLI always prints the in-process cache warning
expected: All five hold (see Prohibitions table)
result: pass
note: "Checked by Claude at the user's request. (1) JWT_SECRET only read in env.ts loadJwtSecret; no console.* prints it; banner prints port/targets/NODE_ENV/maxPoolSize only; secret absent from every output of the test 2/3 runs. (2) app.ts mounts only cors, express.json, /api router, notFound, errorHandler; no morgan/pino/winston dependency. (3) docker-compose.yml binds 127.0.0.1:27018 and 127.0.0.1:6379; docker port confirms the live bindings. (4) seed.service.ts:141 redis.flushdb(); no flushall anywhere in backend src/scripts. (5) reset.ts prints the [CẢNH BÁO] cache warning as its first statement before arg parsing; `tsx scripts/reset.ts --mode bad` printed it before the [LỖI] usage error (exit 1, no DB touched)."

## Summary

total: 8
passed: 5
issues: 3
pending: 0
skipped: 0
blocked: 0

## Gaps

- gap_id: G-01-1
  truth: "Test mode must be observable and unambiguous: GET /api/health exposes `testMode: cfg.isTestMode`; nodeEnv shows the raw NODE_ENV value (or the server warns on a near-miss NODE_ENV such as \"test \"), so a padded NODE_ENV can no longer look like test mode while x-test-user is disabled; config.test ('nodeEnv vẫn trim để hiển thị...') and health.test updated accordingly"
  status: failed
  reason: "User reported: chọn phương án b (require the CR-01 fix now instead of accepting it for Phase 1)"
  severity: major
  test: 1
  root_cause: "env.ts:122 builds nodeEnv from the TRIMMED NODE_ENV (optionalVar) while env.ts:126 decides isTestMode from the RAW value, and nothing exposes the decision: health.controller.ts:15-20 returns only { mongo, redis, nodeEnv, maxPoolSize }, the server.ts:69-71 banner prints NODE_ENV unquoted, and server.ts:56-58 warns only when test mode is ON. Locked in by D-17 (nodeEnv is the Phase 3 preflight field), 01-05 truth 5, config.test.ts:141-148 and health.test.ts:54,99,119-130. Live: NODE_ENV='test ' gives byte-identical banner and health to 'test' but x-test-user gets 401 instead of 403."
  artifacts:
    - path: "backend/src/config/env.ts"
      issue: "trimmed display nodeEnv vs raw isTestMode; no near-miss signal"
    - path: "backend/src/controllers/health.controller.ts"
      issue: "health body has no testMode field; docstring says confirm test mode via nodeEnv"
    - path: "backend/src/server.ts"
      issue: "banner prints NODE_ENV unquoted; no warning on near-miss NODE_ENV"
    - path: "backend/test/config.test.ts"
      issue: "lines 141-148 assert nodeEnv === 'test' with isTestMode false (pins the bug)"
    - path: "backend/test/integration/health.test.ts"
      issue: "exact body shape at 54/99 and nodeEnv-only check at 119-130"
    - path: "backend/test/helpers.ts"
      issue: "testConfig() (46-62) hand-builds BaseConfig; must gain any new field"
  missing:
    - "Read env['NODE_ENV'] once in env.ts; keep isTestMode = raw === 'test' as the ONLY === 'test' in backend/src (01-05 acceptance grep); no process.env reads outside env.ts"
    - "nodeEnv = raw value when non-blank, else 'development'; add a config field (e.g. testModeNearMiss) true when !isTestMode and raw.trim().toLowerCase() equals the shared 'test' constant"
    - "GET /api/health body gains testMode: cfg.isTestMode"
    - "Banner prints NODE_ENV JSON-quoted; server prints a [CẢNH BÁO] line when cfg.testModeNearMiss"
    - "Replace config.test 'nodeEnv vẫn trim để hiển thị...' with nodeEnv !== 'test' + nearMiss true for padded/case variants; add field to testConfig(); add testMode to health.test expectations (false at 54/99, true at 119-130); add a server-process case NODE_ENV='test ' -> testMode false + warning on stderr"
    - "Amend 01-CONTEXT D-17 (and note on 01-05 truth 5) so the Phase 3 preflight (EXP-01) checks health.testMode === true"
  debug_session: .planning/debug/health-testmode-observability.md

- gap_id: G-01-2
  truth: "With only flashsale-redis stopped, `npm run start` exits 1 with a single Vietnamese [LỖI] line naming Redis 127.0.0.1:6379; the ioredis 'error' listener ('[Redis] mất kết nối: ...') must not add a second line during the startup connect, while still logging runtime disconnects after boot (rate-limited as today). User asked for a thorough fix: cover every startup failure path (Redis refused, Redis timeout, and Mongo/port failures if any listener logs there too) with a test that asserts exactly one stderr line"
  status: failed
  reason: "Claude-run bad-boot matrix case (c): stderr had '[Redis] mất kết nối: connect ECONNREFUSED 127.0.0.1:6379' before the [LỖI] line"
  severity: minor
  test: 2
  root_cause: "createRedis() (backend/src/config/redis.ts:19-24) attaches the console.error('[Redis] mất kết nối: ...') 'error' listener at client creation with no boot gating, and lastLoggedAt starts at 0 so the first error always passes the 10 s rate limit. ioredis 6 always emits the connection error as an 'error' event BEFORE connect() rejects ('Connection is closed.'), so every Redis startup failure (ECONNREFUSED, ETIMEDOUT, ENOTFOUND, ECONNRESET, bad RESP, NOAUTH) prints that line and then fail() prints [LỖI]. Affects server.ts, scripts/seed.ts and scripts/reset.ts (shared createRedis/connectRedis). Mongo-down and port-taken paths are already one line (createRedis runs after them). Related: a Redis endpoint that accepts TCP but never answers makes boot hang silently (>15 s) because connectTimeout covers only the TCP open and connectRedis has no overall deadline (violates D-19 fail-fast). Tests only regex-match [LỖI] in stderr, never count lines."
  artifacts:
    - path: "backend/src/config/redis.ts"
      issue: "logging error listener (19-24) not gated on boot; connectRedis (29-32) has no overall startup deadline"
    - path: "backend/src/server.ts"
      issue: "47-54 create -> connect -> catch -> fail() sequence inherits the extra line"
    - path: "backend/scripts/seed.ts"
      issue: "40-47 same sequence"
    - path: "backend/scripts/reset.ts"
      issue: "43-50 same sequence"
    - path: "backend/test/integration/health.test.ts"
      issue: "68-74 only regex-matches [LỖI].*Redis; extra lines pass"
    - path: "backend/test/boot.test.ts"
      issue: "bad-boot cases match by pattern, never assert exactly one stderr line"
  missing:
    - "Attach only a SILENT 'error' listener from creation (one must exist or ioredis prints '[ioredis] Unhandled error event' with a stack); enable the rate-limited console.error logging only after connectRedis() completes connect() + ping(), fixing server, seed and reset in one place"
    - "Wrap connectRedis in a startup deadline (withTimeout, about 5 s) so a silent endpoint fails with one [LỖI] Redis line instead of hanging"
    - "health.test Redis-down case asserts stderr has exactly one non-empty line matching ^[LỖI] Không kết nối được Redis tại 127.0.0.1:6390"
    - "Integration cases with a local fake TCP server (reset / HTTP garbage / silent) each asserting exactly one stderr line"
    - "Runtime case: TCP proxy to real Redis cut after boot -> exactly one '[Redis] mất kết nối' line, process stays up"
    - "Tighten boot.test.ts (JWT, port held, Mongo down) to exactly one stderr line"
  debug_session: .planning/debug/redis-boot-extra-log-line.md

- gap_id: G-01-4
  truth: "A request that declares Content-Type: application/json but sends an empty body (Content-Length: 0, or an empty chunked body) yields 400 { code: INVALID_JSON } like any malformed body, never {} and never 500; a body-less POST that sends no Content-Type still reaches routing unchanged (req.body undefined, handlers treat it as no input), so Phase 2 buy/admin POSTs, the E1 harness and autocannon keep working as long as they omit Content-Type when sending no body; errors.test 'body rỗng với content-type JSON' asserts 400 INVALID_JSON exactly, plus a new test for the no-Content-Type body-less POST"
  status: failed
  reason: "User reported: sửa mục 4 theo hiểu biết của bạn để khắc phục (reject the {} override; enforce the 01-02 truth)"
  severity: major
  test: 4
  root_cause: "AND-gate: (1) body-parser 2.4.0 (behind express.json in Express 5.3.0) returns {} for any zero-length JSON payload (lib/types/json.js:77-80 strict and 104-108 non-strict, before any strict check; no option disables it); (2) backend/src/app.ts:23 mounts plain express.json() with no guard. So CT json + Content-Length 0, empty chunked, and gzip-of-empty all reach routing as {}. errors.test.ts:72 was weakened to status < 500 during 01-02. The 'needed for body-less POSTs' rationale is wrong: buy always sends a qty body (SPECS:162, section 8) and the autocannon pattern sends a body; only admin reset has an optional body. verify IS called on the zero-length buffer (lib/read.js:174) for exactly the empty cases and skipped for no-CT / no-body requests."
  artifacts:
    - path: "backend/src/app.ts"
      issue: "line 23 plain express.json() without a verify guard"
    - path: "backend/test/errors.test.ts"
      issue: "72-76 asserts only status < 500"
    - path: "backend/test/integration/auth.test.ts"
      issue: "line 119 body-less POST without CT must keep returning 400 VALIDATION_ERROR (unchanged by fix)"
  missing:
    - "app.use(express.json({ verify: rejectEmptyJson })) where rejectEmptyJson throws new HttpError(400, 'Body JSON không hợp lệ', 'INVALID_JSON') when buf.length === 0 (Vietnamese comment); errorHandler needs no change"
    - "errors.test: 'body rỗng với content-type JSON' asserts exactly 400 + INVALID_JSON + message; add empty chunked case (node:http, transfer-encoding chunked + end()); add no-CT body-less POST reaching routing (404 NOT_FOUND on unknown path); keep whitespace-only -> 400 and literal {} -> routing (404)"
    - "Record for Phase 2/4: admin reset handler treats req.body === undefined as no mode (req.body ?? {}); frontend API helper sets Content-Type: application/json only when sending a body (fetch adds Content-Length: 0 to body-less POST)"
  debug_session: .planning/debug/empty-json-body-invalid-json.md
