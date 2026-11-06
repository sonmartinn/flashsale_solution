---
status: testing
phase: 01-foundation-infra-data-auth
source: [01-VERIFICATION.md]
started: 2026-11-06T07:33:36Z
updated: 2026-11-06T07:33:36Z
---

<!-- Re-test round after gap-closure plans 01-06..01-08. The previous round (diagnosed: gaps G-01-1, G-01-2, G-01-4; tests 3, 5-8 passed) is in git history at commit 6710855. -->

## Current Test

number: 1
name: Real Redis-down startup (re-test of UAT 2c, gap G-01-2)
expected: |
  With only flashsale-redis stopped (docker stop flashsale-redis), each of npm run start, npm run seed and npm run reset (from backend/) exits 1 with exactly one [LỖI] ... Redis tại 127.0.0.1:6379 line. reset prints its [CẢNH BÁO] cache warning first. If the local JWT_SECRET is shorter than 32 characters the server also prints the short-secret warning first (intended). Afterwards run docker start flashsale-redis.
awaiting: user response

## Tests

### 1. Real Redis-down startup (re-test of UAT 2c, gap G-01-2)
expected: With only flashsale-redis stopped, npm run start / npm run seed / npm run reset each exit 1 with exactly one [LỖI] ... Redis tại 127.0.0.1:6379 line (reset prints its cache warning first; a short JWT_SECRET adds its own warning on the server). Restart the container afterwards with docker start flashsale-redis.
result: [pending]

### 2. Real cmd.exe near-miss NODE_ENV (re-test of UAT 1, gap G-01-1)
expected: In cmd.exe, from backend/, set NODE_ENV=test && npm run start shows NODE_ENV="test " in the banner, exactly one [CẢNH BÁO] line, and GET /api/health returns testMode false with nodeEnv "test ". Then npm run start:test prints CHẾ ĐỘ TEST and GET /api/health returns testMode true.
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
