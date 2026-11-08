---
phase: 02-buy-pipeline-admin-apis
plan: 02
subsystem: database
tags: [redis, mongodb, reconcile, cli, ioredis, mongoose, node-test]

requires:
  - phase: 01
    provides: "FlashSale/Order/StockMovement models, stockKey/buyersKey, loadBaseConfig, reset.ts CLI skeleton, spawnCli/connectTestStores test helpers"
provides:
  - "createReconcileService({ redis }) -> { listSales, checkSale, fixSale } (no printing)"
  - "npm run reconcile -- [--sale <saleId>] [--fix] with exit codes 0 / 2 / 1"
  - "parseReconcileArgs, RECONCILE_USAGE, ReconcileArgs in scripts/cli-args.ts"
  - "stock_movements reason reconcile_fix (delta newStock - oldStock, oldStock 0 when key missing)"
  - "spawnCli accepts \"reconcile\"; test Redis db 11"
affects: [02-04 stats end-to-end test, phase-03 E1/E4 harness, phase-05 Redis-crash runbook]

actuals:
  tokens: 8400
  tasks: 2
  commits: 3
plan_head_before: 0a5b41de6ab57f85b1d42bc069faf60782f5f6b4
plan_head_after: 0ac44ce2698c8c1437d8d66c879eec2f1f14c166

tech-stack:
  added: []
  patterns:
    - "Reconcile service shares one loadTruth() MongoDB read between check and fix, so the userId list is queried once"
    - "CLI arg parser for a new script calls node:util parseArgs directly (boolean option) instead of the string-only parseStrict"

key-files:
  created:
    - backend/src/services/reconcile.service.ts
    - backend/scripts/reconcile.ts
    - backend/test/integration/reconcile.test.ts
  modified:
    - backend/scripts/cli-args.ts
    - backend/package.json
    - backend/test/helpers.ts
    - backend/test/cli-args.test.ts

key-decisions:
  - "--sale with a valid but unknown id is an error (exit 1), per RESEARCH A2"
  - "No cache warning in reconcile (it never touches the sale cache); instead every run starts with a 'run only while no buys are in flight' note"
  - "CLI fixes only out-of-sync v2 sales; drift counts as remaining only when the post-fix re-check still fails, so a successful --fix exits 0"
  - "KHỚP line prints buyers as the success-order count (equal to the set size when in sync, given the unique (saleId, userId) index)"

patterns-established:
  - "Reconcile exit-code contract: 0 clean / nothing to check / fixed, 2 drift remains, 1 usage/unknown sale/config/connection"
  - "Fake Redis for multi() failure paths delegates get/smembers to the real client and stubs only the multi chain"

requirements-completed: [ADMIN-03]

coverage:
  - id: D1
    description: "reconcile checks stock:<id> = totalQty - success orders and buyers:<id> = order userIds for v2 sales; missing key counts as drift"
    requirement: ADMIN-03
    verification:
      - kind: integration
        ref: "backend/test/integration/reconcile.test.ts#service"
        status: pass
    human_judgment: false
  - id: D2
    description: "npm run reconcile CLI prints KHỚP/LỆCH with expected vs actual stock and buyer diffs, skips v0/v1, exits 0/2/1, needs no JWT_SECRET"
    requirement: ADMIN-03
    verification:
      - kind: integration
        ref: "backend/test/integration/reconcile.test.ts#CLI"
        status: pass
    human_judgment: false
  - id: D3
    description: "fixSale repairs Redis from MongoDB in one checked multi(), writes one reconcile_fix movement, re-checks, never writes orders or flash_sales"
    requirement: ADMIN-03
    verification:
      - kind: integration
        ref: "backend/test/integration/reconcile.test.ts#fixSale"
        status: pass
      - kind: integration
        ref: "backend/test/integration/reconcile.test.ts#CLI --fix"
        status: pass
    human_judgment: false
  - id: D4
    description: "parseReconcileArgs accepts --sale and boolean --fix, rejects --fix=yes, bad ids, unknown flags and positionals"
    requirement: ADMIN-03
    verification:
      - kind: unit
        ref: "backend/test/cli-args.test.ts#parseReconcileArgs"
        status: pass
    human_judgment: false

duration: 9min
completed: 2026-11-08
status: complete
---

# Phase 2 Plan 02: Redis–MongoDB Reconcile Summary

**`npm run reconcile` compares Redis `stock:<id>` and `buyers:<id>` with MongoDB success orders for every v2 sale, prints the diff, exits 0/2/1, and with `--fix` rewrites Redis from MongoDB in one checked `multi()` plus a `reconcile_fix` audit row.**

## Performance

- **Duration:** about 9 min
- **Started:** 2026-11-08T08:38:08Z
- **Completed:** 2026-11-08T08:47:00Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- `createReconcileService({ redis })` with `listSales`, `checkSale` and `fixSale`. It does no printing, so 02-04 and the tests call it in-process.
- The `reconcile` CLI prints one KHỚP or LỆCH line per v2 sale. A LỆCH line shows actual stock (or "thiếu khóa") against expected stock, plus missing and extra buyer counts with up to 10 sample ids each. v0/v1 sales get a "bỏ qua (mode vX)" line.
- Exit codes follow D-30, which the Phase 3 harness branches on: 0 means in sync, nothing to check, or fixed; 2 means drift remains; 1 means bad arguments, an unknown sale, or a config or connection error. These are proven by spawning the real CLI with no `JWT_SECRET`.
- `--fix` sends SET stock, DEL buyers and SADD with the userId array (skipped when there are no orders) in one `multi()`. It checks a null exec and every `[err, res]` pair, writes the `reconcile_fix` movement only after a clean exec, then re-checks. A test confirms the MongoDB FlashSale and Order documents are deep-equal before and after.

## Task Commits

1. **Task 1 (tracer): reconcile CLI check with exit codes 0/2/1**: `c940091` (feat)
2. **Task 2 RED: failing tests for --fix**: `b090642` (test)
3. **Task 2 GREEN: reconcile --fix**: `0ac44ce` (feat)

No REFACTOR commit was needed.

## TDD Gate Compliance (Task 2)

- **RED** (`b090642`): `node --import tsx --test --test-reporter=tap test/cli-args.test.ts` exited 1 with 35 tests, 2 failing: "--fix bật chế độ sửa" and "nhận --sale và --fix cùng lúc". Both failed with `CliArgsError: Unknown option '--fix'`. The classifier `check tdd-red-evidence` returned `RED_EVIDENCE_OK` (target_test_failed, tap). Semantic assessment: the target test ran and failed because the planned behaviour (a boolean `--fix`) was missing. It was not a setup or load fault. In the integration file, the 6 fixSale cases failed with `service.fixSale is not a function`, and 2 `--fix` CLI cases exited 1 because the flag was unknown. The control case (drift without `--fix` stays at code 2) passed as expected.
- **GREEN** (`0ac44ce`): cli-args 35/35 pass, reconcile.test 25/25 pass.

## Files Created/Modified
- `backend/src/services/reconcile.service.ts`: check and fix logic. Defines the SaleCheck, SaleFixResult and ReconcileService types.
- `backend/scripts/reconcile.ts`: the CLI. Prints the note first, then parses args, then calls loadBaseConfig, then connects. Formats the output and sets the exit code.
- `backend/scripts/cli-args.ts`: `RECONCILE_USAGE`, `ReconcileArgs`, and `parseReconcileArgs`, which calls parseArgs directly. Seed/reset parsing is untouched.
- `backend/package.json`: `"reconcile": "tsx scripts/reconcile.ts"`.
- `backend/test/helpers.ts`: `spawnCli` now also accepts `"reconcile"`.
- `backend/test/cli-args.test.ts`: `parseReconcileArgs` cases.
- `backend/test/integration/reconcile.test.ts`: service, CLI, fixSale and `--fix` cases. Uses database `flashsale_test_reconcile_<pid>` and Redis db 11.

## Decisions Made
- RESEARCH A2 adopted: `--sale <unknown valid id>` exits 1 with `[LỖI] Không tìm thấy đợt sale <id>`.
- RESEARCH Open Question 1 adopted: there is no cache warning. Every run starts with the "chỉ chạy khi không có lượt mua" note on stderr, and the same text is in `RECONCILE_USAGE`.
- The fix message prints the old stock as "thiếu khóa" when the key was missing. The audit delta still uses oldStock 0 (D-29).

## Deviations from Plan

None. The plan was executed as written.

## Issues Encountered
- `npm ci` warned that the esbuild postinstall is not yet covered by allowScripts. tsx still works, because the platform binary comes from the optional dependency. No new packages were installed.
- The full integration suite passed while plan 02-01 was running in parallel against the same Docker stores. No test was flaky.

## User Setup Required

None. No external service configuration is required.

## Next Phase Readiness
- 02-04 can import `createReconcileService` for its end-to-end stats check.
- The Phase 3 E1 harness can run `npm run reconcile` after each V2 run and treat only exit 0 as clean.
- Operating rule, documented and not enforced in code: run reconcile only while no buys are in flight.

---
*Phase: 02-buy-pipeline-admin-apis*
*Completed: 2026-11-08*

## Self-Check: PASSED

- All 3 created files exist on disk, and so does the SUMMARY.
- Commits c940091, b090642 and 0ac44ce are on HEAD.
- Plan verification: `npm run typecheck` exit 0. `npm test` exit 0 (164 pass, includes the build and parseReconcileArgs). `npm run test:int` exit 0 (84 pass, includes reconcile.test).
