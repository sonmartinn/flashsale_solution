---
status: testing
phase: 01-foundation-infra-data-auth
source: [01-VERIFICATION.md]
started: 2026-11-04T15:52:57.986Z
updated: 2026-11-04T15:52:57.986Z
---

## Current Test

number: 1
name: Decide on REVIEW CR-01 (open, rated critical by the reviewer): with NODE_ENV="test " the banner and GET /api/health report nodeEnv "test" while isTestMode is false and no CHẾ ĐỘ TEST warning is printed
expected: |
  Either (a) accept for Phase 1, since 01-05 truth 5 mandates this exact behaviour, it fails closed, and Phase 3 SC1 already makes E1 INVALID when any 401 appears, and have the Phase 3 harness not rely on nodeEnv alone; or (b) require a small fix now: add `testMode: cfg.isTestMode` to the health body, make nodeEnv show the raw value (or warn on a near-miss NODE_ENV), and change config.test 'nodeEnv vẫn trim để hiển thị...' plus health.test accordingly
awaiting: user response

## Tests

### 1. Decide on REVIEW CR-01 (open, rated critical by the reviewer): with NODE_ENV="test " the banner and GET /api/health report nodeEnv "test" while isTestMode is false and no CHẾ ĐỘ TEST warning is printed
expected: Either (a) accept for Phase 1, since 01-05 truth 5 mandates this exact behaviour, it fails closed, and Phase 3 SC1 already makes E1 INVALID when any 401 appears, and have the Phase 3 harness not rely on nodeEnv alone; or (b) require a small fix now: add `testMode: cfg.isTestMode` to the health body, make nodeEnv show the raw value (or warn on a near-miss NODE_ENV), and change config.test 'nodeEnv vẫn trim để hiển thị...' plus health.test accordingly
result: [pending]

### 2. Bad-boot matrix on the real dev setup (deferred end-of-phase check from 01-01 Task 3): (a) blank JWT_SECRET in backend/.env, (b) Docker Desktop stopped, (c) only flashsale-redis stopped, (d) another process holding port 5000. Run `npm run start` from backend/ each time
expected: Each case exits with code 1 and a single Vietnamese `[LỖI] ...` line naming the cause (JWT_SECRET / MongoDB 127.0.0.1:27018/flashsale / Redis 127.0.0.1:6379 / Cổng 5000 đang bị chiếm). No stack trace, and the secret is never printed
result: [pending]

### 3. Health transition: with the backend running, `docker stop flashsale-redis`, GET /api/health, then `docker start flashsale-redis` and GET /api/health again (repeat for flashsale-mongo)
expected: 200 { mongo: true, redis: true } -> 503 with redis:false answered in under 3 s -> 200 again after the container is back, without restarting the backend
result: [pending]

### 4. Decide on the empty-JSON-body deviation (01-02 truth: 'an empty, malformed or JSON-primitive body yields 400 INVALID_JSON')
expected: Either accept via override (body-parser 2.x parses an empty JSON body to {}, which reaches routing and never yields 500, and is needed for body-less POSTs in Phase 2), or require a change
result: [pending]

### 5. Decide on login with blank strings (01-04 truth lists 'blank strings' among inputs that return 400 for register OR login)
expected: Either accept via override (login with password '' returns 401 INVALID_CREDENTIALS, exactly as the 01-04 plan action and D-12 prescribe), or require 400
result: [pending]

### 6. Backstop truth (01-02): orders index userId_1_createdAt_-1 backs newest-first listing; equal-createdAt order unspecified
expected: Confirm acceptable: the index exists (observed in a freshly seeded DB) but no Phase 1 query consumes it; sort stability is owned by Phase 2 READ-04
result: [pending]

### 7. Backstop truth (01-04): requireAdmin holds no shared mutable state, so concurrent admin/user requests cannot leak a role
expected: Confirm acceptable: requireAdmin is a pure closure reading only req.user; executor test 'request admin và user đồng thời không lẫn quyền của nhau' passes
result: [pending]

### 8. Prohibition review (flagged, non-authoritative LLM-judge verdicts): (1) JWT_SECRET never printed; (2) no per-request logging middleware; (3) MongoDB/Redis ports bound to 127.0.0.1 only; (4) seed only FLUSHDB on the configured db, never FLUSHALL; (5) reset CLI always prints the in-process cache warning
expected: All five hold (see Prohibitions table)
result: [pending]

## Summary

total: 8
passed: 0
issues: 0
pending: 8
skipped: 0
blocked: 0

## Gaps
