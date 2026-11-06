---
status: diagnosed
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
  root_cause: "Two causes. (1) Observed failure: backend/.env does not exist locally (gitignored, never created in Phase 1, not listed as a UAT prerequisite); .env.test holds only NODE_ENV=test (D-20), so dotenv loads nothing and loadBaseConfig() stops at requireVar(MONGODB_URI) (env.ts:107) for every start command. With env vars supplied, the G-01-1 near-miss code behaves exactly as expected. (2) Latent code gap: start:test runs `node --env-file=.env.test`, which never overrides an inherited NODE_ENV; in the same cmd window after `set NODE_ENV=test && ...`, start:test runs with NODE_ENV=\"test \", testMode false, no CHẾ ĐỘ TEST, and the near-miss warning advises running start:test — the command just run. No test covers this because buildChildEnv in test/helpers.ts deletes NODE_ENV."
  artifacts:
    - path: "backend/.env"
      issue: "Missing locally; only source of MONGODB_URI/REDIS_URL/JWT_SECRET for start and start:test"
    - path: "backend/package.json"
      issue: "start:test = npm run build && node --env-file=.env.test dist/server.js cannot override inherited NODE_ENV"
    - path: "backend/src/server.ts"
      issue: "Near-miss warning advice ('hoặc chạy npm run start:test') is wrong when the shell still has NODE_ENV=\"test \""
    - path: "backend/test/helpers.ts"
      issue: "buildChildEnv/SERVER_ENV_KEYS strips NODE_ENV, so inherited NODE_ENV is never exercised against start:test"
    - path: ".planning/phases/01-foundation-infra-data-auth/01-VERIFICATION.md"
      issue: "Human test steps do not list backend/.env as a prerequisite nor say to clear NODE_ENV before start:test"
  missing:
    - "Document backend/.env (copied from .env.example, JWT_SECRET >= 32 random bytes) as a prerequisite for Phase 1 human tests / UAT"
    - "Make start:test force NODE_ENV=test regardless of inherited shell value, keeping the single isTestMode decision in env.ts (D-14) and no process.env reads outside env.ts"
    - "Fix or adjust near-miss warning advice so it is correct when the shell has NODE_ENV set"
    - "Integration test running the server as start:test does with an inherited NODE_ENV=\"test \""
  debug_session: .planning/debug/cmd-near-miss-node-env-missing-mongodb-uri.md
