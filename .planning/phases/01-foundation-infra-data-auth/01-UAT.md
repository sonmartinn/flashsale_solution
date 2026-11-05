---
status: complete
phase: 01-foundation-infra-data-auth
source: [01-VERIFICATION.md]
started: 2026-11-04T15:52:57.986Z
updated: 2026-11-05T04:44:49.728Z
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
  artifacts: []
  missing: []

- gap_id: G-01-2
  truth: "With only flashsale-redis stopped, `npm run start` exits 1 with a single Vietnamese [LỖI] line naming Redis 127.0.0.1:6379; the ioredis 'error' listener ('[Redis] mất kết nối: ...') must not add a second line during the startup connect, while still logging runtime disconnects after boot (rate-limited as today). User asked for a thorough fix: cover every startup failure path (Redis refused, Redis timeout, and Mongo/port failures if any listener logs there too) with a test that asserts exactly one stderr line"
  status: failed
  reason: "Claude-run bad-boot matrix case (c): stderr had '[Redis] mất kết nối: connect ECONNREFUSED 127.0.0.1:6379' before the [LỖI] line"
  severity: minor
  test: 2
  artifacts: []
  missing: []

- gap_id: G-01-4
  truth: "A request that declares Content-Type: application/json but sends an empty body (Content-Length: 0, or an empty chunked body) yields 400 { code: INVALID_JSON } like any malformed body, never {} and never 500; a body-less POST that sends no Content-Type still reaches routing unchanged (req.body undefined, handlers treat it as no input), so Phase 2 buy/admin POSTs, the E1 harness and autocannon keep working as long as they omit Content-Type when sending no body; errors.test 'body rỗng với content-type JSON' asserts 400 INVALID_JSON exactly, plus a new test for the no-Content-Type body-less POST"
  status: failed
  reason: "User reported: sửa mục 4 theo hiểu biết của bạn để khắc phục (reject the {} override; enforce the 01-02 truth)"
  severity: major
  test: 4
  artifacts: []
  missing: []
