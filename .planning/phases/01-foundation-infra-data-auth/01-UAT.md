---
status: testing
phase: 01-foundation-infra-data-auth
source: [01-VERIFICATION.md]
started: 2026-11-07T10:43:50Z
updated: 2026-11-07T10:43:50Z
---

<!-- Re-test round after gap-closure plan 01-10 (G-01-V1). The previous round (diagnosed: test 1 pass, test 2 issue G-01-9, closed in code by 01-09) is in git history at commit 2f05f2c. -->

## Current Test

number: 1
name: Real cmd.exe near-miss NODE_ENV, then start:test in the same window (re-test of UAT round 2 test 2, gap G-01-9)
expected: |
  npm run start: banner NODE_ENV="test ", exactly one [CẢNH BÁO] NODE_ENV="test " line that says npm run start:test always sets NODE_ENV=test, no CHẾ ĐỘ TEST line, health testMode false and nodeEnv "test ". npm run start:test in the same window: build output, then the CHẾ ĐỘ TEST line, banner NODE_ENV="test", no [CẢNH BÁO] NODE_ENV line and no dotenv injected-env line, health testMode true and nodeEnv "test". After the last Ctrl+C the health URL no longer answers (port 5000 freed: the server under the dotenv wrapper stopped too).
awaiting: user response

## Tests

### 1. Real cmd.exe near-miss NODE_ENV, then start:test in the same window (re-test of UAT round 2 test 2, gap G-01-9)
steps: Prerequisite: backend/.env exists, created once in backend/ with the command in the backend/.env.example header (random 32-byte JWT_SECRET written straight into the file, never printed, never overwrites, gitignored, never committed). Env source: backend/.env only. Open a new cmd.exe window with Win+R then cmd, not from a terminal that may hold PowerShell $env: values, cd to backend/, and run `for %V in (MONGODB_URI REDIS_URL JWT_SECRET NODE_ENV PORT) do @if defined %V echo %V dang dat trong phien nay`. It must print nothing (it prints names only, never values). In that ONE window: `npm run build`, then `set NODE_ENV=test && npm run start` (this cmd idiom leaves NODE_ENV="test " with a trailing space in the window). Open http://localhost:5000/api/health in a browser, then stop the server with Ctrl+C (answer Y if cmd asks to terminate the batch job). In the SAME window, without clearing NODE_ENV, run `npm run start:test`, open the health URL again, stop it with Ctrl+C, and open the URL once more. Finally run `set NODE_ENV=` to clear the variable.
expected: npm run start: banner NODE_ENV="test ", exactly one [CẢNH BÁO] NODE_ENV="test " line that says npm run start:test always sets NODE_ENV=test, no CHẾ ĐỘ TEST line, health testMode false and nodeEnv "test ". npm run start:test in the same window: build output, then the CHẾ ĐỘ TEST line, banner NODE_ENV="test", no [CẢNH BÁO] NODE_ENV line and no dotenv injected-env line, health testMode true and nodeEnv "test". After the last Ctrl+C the health URL no longer answers (port 5000 freed: the server under the dotenv wrapper stopped too).
result: [pending]

### 2. Acknowledge the two judgment-tier 01-10 prohibitions (no foreign process signalled, shared containers untouched; no backend/.env touched)
steps: Acknowledge the two judgment-tier 01-10 prohibitions: (a) the plan signalled no process it did not spawn and did not stop, restart or remove flashsale-mongo / flashsale-redis; (b) no backend/.env was created, opened, printed or committed.
expected: Both hold. Verifier evidence (non-authoritative LLM judgment): `docker ps` shows both containers `Up 2 hours (healthy)`, an uptime that predates the 01-10 run (10:14-10:24Z); the 01-10 commits touch only backend/test/helpers.ts, backend/test/build.test.ts and planning files; backend/.env does not exist and .gitignore lists .env.
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
