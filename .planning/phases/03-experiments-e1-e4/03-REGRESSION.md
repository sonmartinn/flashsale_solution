---
phase: "03"
status: passed
date: "2026-11-13"
unit_tests: 172
integration_tests: 200
loadtest_tests: 289
failures: 0
---

# Phase 03 Regression Gate

Prior reports: 01-VERIFICATION.md and 02-VERIFICATION.md. Used the backend package's own one-shot scripts because repository root has no package.json. Scripts executed under the GSD 600-second timeout and returned exit 0, with no skipped/cancelled tests.

| Check | Result |
|-------|--------|
| npm.cmd --prefix backend run typecheck | PASS |
| npm.cmd --prefix backend test (includes build) | 172/172 PASS; 25 suites; 48435.6438 ms |
| npm.cmd --prefix backend run test:int (includes build) | 200/200 PASS; 55 suites; 98148.4015 ms |
| npm.cmd --prefix loadtest run typecheck | PASS |
| npm.cmd --prefix loadtest test | 289/289 PASS; 33 suites; 822.5317 ms |

Backend build target was resolved and checked to be exactly backend/dist before execution; build copies src/lua to dist/lua. Integration helpers use isolated test databases/Redis namespaces and owned child servers, not the operator's sale. No official experiment was rerun or CSV rewritten by this gate.

## Test Files

- backend/test/auth.test.ts
- backend/test/boot.test.ts
- backend/test/build.test.ts
- backend/test/cli-args.test.ts
- backend/test/config.test.ts
- backend/test/errors.test.ts
- backend/test/object-id.test.ts
- backend/test/redis.test.ts
- backend/test/validate.test.ts
- backend/test/integration/admin.test.ts
- backend/test/integration/auth.test.ts
- backend/test/integration/buy.test.ts
- backend/test/integration/compensation.test.ts
- backend/test/integration/harness-support.test.ts
- backend/test/integration/health.test.ts
- backend/test/integration/lua.test.ts
- backend/test/integration/models.test.ts
- backend/test/integration/read.test.ts
- backend/test/integration/reconcile.test.ts
- backend/test/integration/redis-boot.test.ts
- backend/test/integration/reset.test.ts
- backend/test/integration/seed.test.ts

## Evidence Logs

Untracked temporary logs from this run: flashsale-phase03-regression-unit.log, flashsale-phase03-regression-integration.log, flashsale-phase03-final-loadtest.log in the operator Windows TEMP directory. They are diagnostic artifacts, not official measurement data. No regression found.
