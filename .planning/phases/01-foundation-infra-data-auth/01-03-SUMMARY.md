---
phase: 01-foundation-infra-data-auth
plan: 03
subsystem: database
tags: [seed, reset, cli, node-util-parseargs, mongoose9, ioredis6, redis-multi, bcryptjs, node-test]

# Dependency graph
requires:
  - phase: 01-01
    provides: "loadBaseConfig/ConfigError, connectMongo, createRedis/connectRedis/stockKey/buyersKey, fail(), test/helpers.ts (connectTestStores, dropTestDatabaseAndDisconnect)"
  - phase: 01-02
    provides: "5 models + SALE_MODES/SaleMode, ensureIndexes(), HttpError/ErrorCode, normalizeObjectId"
provides:
  - "scripts/cli-args.ts: CliArgsError, parseSeedArgs, parseResetArgs, SEED_USAGE, RESET_USAGE (pure, Vietnamese errors, before any I/O)"
  - "services/seed.service.ts: seedDatabase({ redis, qty, mode, now? }) -> SeedSummary; SEED_PASSWORD, ADMIN_EMAIL, SEED_USER_COUNT, SEED_PRODUCTS, SALE_PRODUCT_SLUG"
  - "scripts/seed.ts: npm run seed -- [--qty <1..1000000>] [--mode v0|v1|v2] with the D-08 handoff summary"
  - "services/sale-admin.service.ts: createSaleAdminService({ redis, onSaleReset? }) -> { resetSale(saleId, { mode? }), resetAllSales({ mode? }) }; ResetResult, SaleAdminService"
  - "scripts/reset.ts: npm run reset -- [--sale <id>] [--mode v0|v1|v2], cache warning on every run"
affects: [01-04, phase-02, phase-03, phase-04]

actuals:
  tokens: 10168      # chars/4 over the 8 changed code/test files (40671 chars); SUMMARY/REQUIREMENTS excluded
  tasks: 2
  commits: 3         # MEASURED: git rev-list --count 1d4c8ab..HEAD before the SUMMARY commit
plan_head_before: 1d4c8abec3f26c090af9a8fce0666d0aab955327
plan_head_after: a2aa51e06ad5c11e5a187e1220acd897bb40ba51

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "CLI scripts: parse args first (CliArgsError -> fail(message + usage)), loadBaseConfig only (never JWT), print targets, connect, work, disconnect both stores in finally"
    - "Every Redis multi().exec() result checked: null -> throw, any [err] pair -> throw (exec resolves per-command errors, Redis does not roll back)"
    - "Shared admin services are factories taking their side-effect seams (onSaleReset) instead of module-level hooks"

key-files:
  created:
    - backend/scripts/cli-args.ts
    - backend/scripts/seed.ts
    - backend/scripts/reset.ts
    - backend/src/services/seed.service.ts
    - backend/src/services/sale-admin.service.ts
    - backend/test/cli-args.test.ts
    - backend/test/integration/seed.test.ts
    - backend/test/integration/reset.test.ts
  modified:
    - .planning/REQUIREMENTS.md

key-decisions:
  - "Reset stock_movements row records delta = totalQty (the full stock restored after deleting every order of the sale), documented in a Vietnamese comment"
  - "--qty upper bound locked at 1000000; leading zeros (007) and empty values are rejected"
  - "Reset service is a factory createSaleAdminService({ redis, onSaleReset }) so the CLI (no-op hook) and the Phase 2 route (saleCache.invalidate) each pass their own seam"
  - "resetAllSales resets sequentially in _id order and stops at the first failing sale"
  - "When the multi() fails, the reset movement is not written and the hook is not called (Mongo-side changes already applied stay; re-running reset converges)"

patterns-established:
  - "Seed order: dropDatabase -> FLUSHDB (configured db only) -> ensureIndexes -> one bcrypt hash -> insertMany users -> products -> sale -> checked Redis multi"
  - "Seed summary counts come from countDocuments, not from constants"

requirements-completed: [DATA-02, DATA-03, DATA-04, DATA-05]

coverage:
  - id: D1
    description: "Seed/reset argument parsing: defaults qty 100 / mode v2; rejects qty 0, -1, 1.5, abc, 1000001, 007, empty, mode V2/v3, unknown flags, positionals, malformed --sale, all before any DB connection"
    requirement: DATA-03
    verification:
      - kind: unit
        ref: "backend/test/cli-args.test.ts#cli-args.test"
        status: pass
      - kind: other
        ref: "npm --prefix backend run seed -- --qty 0 (exit 1, [LỖI] --qty ... + Cách dùng); npm run seed -- --bogus (exit 1)"
        status: pass
    human_judgment: false
  - id: D2
    description: "seedDatabase wipes only its Mongo db and its Redis db, rebuilds indexes, creates 1000 users + admin with one shared bcrypt hash of matkhau123, 6 products with distinct attribute key sets and local image paths, one active 7-day sale at 449500, stock:<saleId> = qty and no buyers key"
    requirement: DATA-03
    verification:
      - kind: integration
        ref: "backend/test/integration/seed.test.ts#seed.test"
        status: pass
      - kind: other
        ref: "MONGODB_URI=mongodb://127.0.0.1:27018/flashsale REDIS_URL=redis://127.0.0.1:6379 npm --prefix backend run seed -- --qty 100 --mode v2; mongosh users.countDocuments()=1001, salePrice=449500, orders indexes include saleId_1_userId_1; redis GET stock:<id>=100"
        status: pass
    human_judgment: false
  - id: D3
    description: "Seed rebuilds indexes after dropDatabase (saleId_1_userId_1 present on the demo database)"
    requirement: DATA-02
    verification:
      - kind: integration
        ref: "backend/test/integration/seed.test.ts#index được tạo lại sau khi xóa database (có saleId_1_userId_1 trên orders)"
        status: pass
    human_judgment: false
  - id: D4
    description: "resetSale/resetAllSales restore a sale per D-09: remainingQty = totalQty, active, startAt now, endAt +7 days, mode only when given, only that sale's orders/movements deleted, checked multi() SET stock + DEL buyers, one reset movement (delta totalQty, orderId null), hook called once; idempotent; 400 INVALID_ID / 404 NOT_FOUND / 400 VALIDATION_ERROR; rejects on a per-command multi error and on a null exec"
    requirement: DATA-04
    verification:
      - kind: integration
        ref: "backend/test/integration/reset.test.ts#reset.test"
        status: pass
    human_judgment: false
  - id: D5
    description: "npm run reset prints the in-process cache warning as its first line on every run (success and invalid-argument failure), keeps mode without --mode, never changes totalQty"
    requirement: DATA-05
    verification:
      - kind: other
        ref: "npm --prefix backend run reset -- --mode v1 (exit 0, warning + mode=v1; demo sale mode v1, remainingQty 100); npm run reset -- --sale abc (exit 1, warning + --sale); npm run reset -- --mode v2 (exit 0, demo sale mode v2)"
        status: pass
    human_judgment: false

# Metrics
duration: ~30 min active (wall clock 3h47m including a usage-limit pause and a Docker-down checkpoint)
completed: 2026-11-04
status: complete
---

# Phase 1 Plan 03: Seed and shared sale reset Summary

**`npm run seed -- [--qty] [--mode]` drops and recreates 1001 accounts (one bcrypt hash of `matkhau123`), 6 fashion products and one active 7-day sale at 449500, with Redis `stock:<saleId>` loaded. `createSaleAdminService().resetSale/resetAllSales` restores a sale through a fully checked Redis `multi()`. The CLI and the Phase 2 admin route share it, and `npm run reset` prints the in-process cache warning on every run.**

## Performance

- **Duration:** about 30 min of active work. Wall clock was 3h47m because of a usage-limit pause and a Docker Desktop outage (blocking-human checkpoint, resolved by the user).
- **Started:** 2026-11-04T08:51:21Z
- **Completed:** 2026-11-04T12:38:27Z
- **Tasks:** 2 (Task 1 tracer, Task 2 TDD)
- **Files created:** 8 code/test files, plus REQUIREMENTS.md updated

## Accomplishments

- Argument parsing is pure and runs before any database connection. Every bad input exits 1 with a Vietnamese `[LỖI]` line and the usage line.
- Seed follows D-01..D-05, D-08 and D-21 in the locked order. It only runs `FLUSHDB` on the configured db index and never `FLUSHALL`. It prints the handoff block: targets, counts, saleId, mode, totalQty, salePrice, admin credentials, a sample user, and the restart reminder.
- The reset service follows D-09 using a plain `$set` (no update pipeline). Every `exec()` pair is checked, a null exec result is rejected, and the hook runs only on success. Running reset twice converges to the same state with exactly one reset movement.
- `npm run reset` prints the DATA-05 cache warning on every run, including on argument errors.
- Tests: `npm test` 73/73 (cli-args.test added). `npm run test:int` 34/34 (seed.test and reset.test added).
- The demo database was seeded with `--qty 100 --mode v2` (saleId `6aeaf2c21e061018541557e3`) and is left in mode v2 with 100 in stock.

## Task Commits

1. **Task 1: Tracer, npm run seed** - `c83fbb0` (feat). Tracer gate: interactive, end-of-phase mode, automated-only verify. All three verify commands passed on the committed tree, so I moved on to Task 2 without a checkpoint.
2. **Task 2: Shared reset service + npm run reset** - `f98f2fe` (test, RED), then `a2aa51e` (feat, GREEN). No refactor commit.

## TDD Gate Compliance (Task 2)

- **RED** (`f98f2fe`): `node --import tsx --test --test-reporter=tap test/integration/reset.test.ts` exited 1 with 12 tests: 1 passed, 11 failed. The target "resetSale khôi phục đợt sale bẩn, đổi mode, chỉ xóa đơn của đợt đó" failed on `remainingQty` 2 !== 5 against a stub that had the right signatures and no behaviour. The classifier returned `RED_EVIDENCE_OK` (`target_test_failed`, tap). **Semantic assessment:** valid RED. The target ran and failed on its planned assertion because nothing was implemented yet. There were no load, syntax or fixture faults. The one test that passed ("no sales: empty array") passes trivially against a stub that returns `[]`. The parseResetArgs cases in cli-args.test already passed at RED, because the plan has Task 1 implement `parseResetArgs`.
- **GREEN** (`a2aa51e`): the real service and the reset CLI. reset.test is 12/12, and the full unit and integration suites pass.
- **REFACTOR:** none.

## Files Created/Modified

- `backend/scripts/cli-args.ts` - `parseSeedArgs`/`parseResetArgs` built on `node:util` `parseArgs` in strict mode, with `CliArgsError` and the usage strings
- `backend/scripts/seed.ts` - seed CLI
- `backend/scripts/reset.ts` - reset CLI with the always-printed cache warning
- `backend/src/services/seed.service.ts` - seed constants and `seedDatabase`
- `backend/src/services/sale-admin.service.ts` - `createSaleAdminService` → `resetSale`/`resetAllSales`
- `backend/test/cli-args.test.ts`, `backend/test/integration/seed.test.ts`, `backend/test/integration/reset.test.ts` - unit and integration proofs (Redis db 2 and 3, `flashsale_test_*` databases)
- `.planning/REQUIREMENTS.md` - DATA-02, DATA-03, DATA-04, DATA-05 checked (ready-ids: no sibling still declares them)

## Decisions Made

- The reset movement records `delta = totalQty` (the CONTEXT discretion item, now locked and commented in the code).
- `--qty` must be between 1 and 1000000 and must not have leading zeros.
- If the Redis `multi()` fails partway, the Mongo changes already made stay in place, no reset movement is written, and the hook is not called. Running reset again converges. MongoDB transactions are out of scope (standalone mongod).
- `resetAllSales` resets sales one at a time in `_id` order and stops at the first error.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] RED TAP output briefly written outside the worktree**
- **Found during:** Task 2 (RED step)
- **Issue:** I redirected the RED TAP output to `../../reset-red-tap.txt` from `backend/`. That path is one directory above the worktree (`.claude/worktrees/reset-red-tap.txt`).
- **Fix:** I moved it into a scratch `.gsd-red/` folder inside the worktree right away, built the evidence record there, and deleted `.gsd-red/` before the SUMMARY commit. Nothing outside the worktree remains, and nothing in the scratch folder was committed.
- **Files modified:** none committed
- **Verification:** `git status --short` was clean of scratch files before the SUMMARY commit

**2. [Rule 2 - Missing Critical] Extra edge-case tests**
- **Found during:** Tasks 1 and 2
- **Issue:** The behaviour list did not cover a few cases that matter for correctness.
- **Fix:** Added these cases:
  - cli-args: `--qty` with no value, leading zeros (`007`), an empty value, and `--qty` rejected for reset.
  - reset.test: a `multi()` failure writes no reset movement and does not call the hook; `resetAllSales({ mode })` changes every sale's mode; with no sales it returns `[]`.
- **Files modified:** backend/test/cli-args.test.ts, backend/test/integration/reset.test.ts
- **Committed in:** c83fbb0, f98f2fe

---

**Total deviations:** 2 (1 blocking, process only; 1 added test coverage)
**Impact on plan:** No change to any export name or signature.

## Issues Encountered

- **Docker Desktop went down mid-plan.** It happened during a usage-limit pause, after the RED commit. Every integration file then failed with about a 5 s connection timeout. I returned a blocking-human checkpoint, did not start Docker myself, and did not commit GREEN unverified. The user restarted Docker. The containers came back healthy with their volumes intact, the seeded demo sale was still there, and I finished GREEN after that.
- I did not write the per-plan ledger file under `.git/worktrees/...`, same as 01-01 and 01-02. I tracked the base `1d4c8ab` in-session, and `commits: 3` was measured with `git rev-list --count`.
- The plan's compound `<automated>` commands (command substitution around `docker exec`) are rejected by the worktree guard. I ran each check as a separate plain command, and all of them passed.
- `backend/.env.test` (from 01-01) is still an open orchestrator item. This plan doesn't need it.

## Known Stubs

None. The signature-only `sale-admin.service.ts` existed only in the RED commit `f98f2fe` and was replaced in GREEN `a2aa51e`.

## Threat Flags

None. No new network endpoints. Both CLIs act only on the configured targets, which `loadBaseConfig` guards against the 27017 port and a missing db name.

## User Setup Required

None.

## Next Phase Readiness

- Phase 2 admin route: `createSaleAdminService({ redis, onSaleReset: saleCache.invalidate }).resetSale(req.params.id, { mode })`. It may swap the mode error code to `INVALID_MODE`.
- Phase 3 load scripts: admin `admin@flashsale.local` / `matkhau123`, users `user0001..user1000@flashsale.local`, `npm run seed -- --qty <n>` for larger stock.
- Phase 4: product images expected at `frontend/public/images/products/<slug>.jpg` for the 6 slugs.

## Self-Check: PASSED

- All 8 created files are present. Code commits `c83fbb0`, `f98f2fe` and `a2aa51e` are ancestors of HEAD, and none has a `Co-Authored-By` line.
- Plan verification re-run after Docker came back: typecheck passes; `npm test` 73/73; `npm run test:int` 34/34. Seed demo checks: 1001 users, stock 100, salePrice 449500, `saleId_1_userId_1` present. Reset: `--mode v1`, then `--sale abc` (exit 1, warning shown), then `--mode v2`. The demo sale is in v2 with remainingQty 100 and 1 reset movement.

---
*Phase: 01-foundation-infra-data-auth*
*Completed: 2026-11-04*
