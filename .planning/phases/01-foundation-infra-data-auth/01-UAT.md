---
status: complete
phase: 01-foundation-infra-data-auth
source: [01-VERIFICATION.md]
started: 2026-11-06T07:33:36Z
updated: 2026-11-06T07:59:17.112Z
---

<!-- Re-test round after gap-closure plans 01-06..01-08. The previous round (diagnosed: gaps G-01-1, G-01-2, G-01-4; tests 3, 5-8 passed) is in git history at commit 6710855. -->

## Current Test

[testing complete]

## Tests

### 1. Real Redis-down startup (re-test of UAT 2c, gap G-01-2)
expected: With only flashsale-redis stopped, npm run start / npm run seed / npm run reset each exit 1 with exactly one [LỖI] ... Redis tại 127.0.0.1:6379 line (reset prints its cache warning first; a short JWT_SECRET adds its own warning on the server). Restart the container afterwards with docker start flashsale-redis.
result: pass

### 2. Real cmd.exe near-miss NODE_ENV (re-test of UAT 1, gap G-01-1)
expected: In cmd.exe, from backend/, set NODE_ENV=test && npm run start shows NODE_ENV="test " in the banner, exactly one [CẢNH BÁO] line, and GET /api/health returns testMode false with nodeEnv "test ". Then npm run start:test prints CHẾ ĐỘ TEST and GET /api/health returns testMode true.
result: issue
reported: "chỉ hiện [LỖI] Thiếu biến môi trường MONGODB_URI. Đặt MONGODB_URI=mongodb://127.0.0.1:27018/flashsale trong backend/.env (xem .env.example)."
severity: major

## Summary

total: 2
passed: 1
issues: 1
pending: 0
skipped: 0
blocked: 0

## Gaps

- gap_id: G-01-9
  truth: "In cmd.exe, from backend/, set NODE_ENV=test && npm run start shows NODE_ENV=\"test \" in the banner, exactly one [CẢNH BÁO] line, and GET /api/health returns testMode false with nodeEnv \"test \". Then npm run start:test prints CHẾ ĐỘ TEST and GET /api/health returns testMode true."
  status: failed
  reason: "User reported: chỉ hiện [LỖI] Thiếu biến môi trường MONGODB_URI. Đặt MONGODB_URI=mongodb://127.0.0.1:27018/flashsale trong backend/.env (xem .env.example)."
  severity: major
  test: 2
  artifacts: []  # Filled by diagnosis
  missing: []    # Filled by diagnosis
