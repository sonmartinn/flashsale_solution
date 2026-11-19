---
phase: "2"
slug: "buy-pipeline-admin-apis"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: validated
nyquist_compliant: true
wave_0_complete: true
created: "2026-11-08"
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `node:test` + `node:assert/strict`, TS via `--import tsx` (Node 24.22.1) |
| **Config file** | none — scripts in `backend/package.json` (`test`, `test:int`) |
| **Quick run command** | `npm --prefix backend run typecheck && npm --prefix backend test` |
| **Full suite command** | `npm --prefix backend run build && npm --prefix backend test && npm --prefix backend run test:int` |
| **Estimated runtime** | ~120 seconds (full suite, Docker MongoDB + Redis up) |

---

## Sampling Rate

- **After every task commit:** Run `npm --prefix backend run typecheck && npm --prefix backend test`, plus the single integration file the task touched (from `backend/`: `node --import tsx --test test/integration/<file>.test.ts`)
- **After every plan wave:** Run `npm --prefix backend run build && npm --prefix backend test && npm --prefix backend run test:int`
- **Before `/gsd-verify-work`:** Full suite must be green, plus one manual smoke on `npm run start:test` (a buy in each mode)
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 02-01 | 1 | BUY-01, BUY-02, BUY-06, BUY-08 | T-02-01, T-02-05 | One buy per mode → 201 `{ order }` (in-process and compiled server); success path prints nothing, no `emitWarning`, no stock_movements | integration | `npm --prefix backend run typecheck && npm --prefix backend run build && test -f backend/dist/lua/buy.lua` then `npm --prefix backend run test:int` (buy.test) | ✅ | ✅ green |
| 02-01-02 | 02-01 | 1 | BUY-01, BUY-02, BUY-03, BUY-04, BUY-05, BUY-06, BUY-09 | T-02-01, T-02-02 | D-06 codes identical per mode (except D-07); arrays/operators/qty -5 rejected with stock unchanged; 404 not cached; V0 oversells, V1/V2 exact; Lua 1/0/-1/-2 and 100 of 1,000 | integration | `npm --prefix backend run test:int` (buy.test, lua.test) | ✅ | ✅ green |
| 02-02-01 | 02-02 | 1 | ADMIN-03 | T-02-06 | Reconcile check: exit 0 in sync, 2 on drift (incl. missing key, missing/extra buyers), 1 on bad/unknown --sale; v0/v1 skipped; no JWT_SECRET needed | integration | `npm --prefix backend run test:int` (reconcile.test) | ✅ | ✅ green |
| 02-02-02 | 02-02 | 1 | ADMIN-03 | T-02-07, T-02-08 | `--fix` repairs Redis in one checked multi(), reconcile_fix movement delta, MongoDB untouched; parseReconcileArgs strict | unit + integration | `npm --prefix backend test` (cli-args.test) and `npm --prefix backend run test:int` (reconcile.test) | ✅ | ✅ green |
| 02-03-01 | 02-03 | 2 | BUY-05, BUY-07 | T-02-13 | E11000 after the stock step → 409 ALREADY_BOUGHT, V1 `$inc` back, V2 INCRBY only (buyer kept), one compensate row | integration | `npm --prefix backend run test:int` (compensation.test) | ✅ | ✅ green |
| 02-03-02 | 02-03 | 2 | BUY-05, BUY-07, BUY-08 | T-02-10, T-02-11, T-02-12 | D-10 branches (order exists → 201 no refund; no order → refund + 500; lookup fails → no refund); one log line per failure; success silent; 10 same-user requests → 1 order | integration | `npm --prefix backend run test:int` (compensation.test) | ✅ | ✅ green |
| 02-04-01 | 02-04 | 2 | ADMIN-01, BUY-02 | T-02-15 | HTTP reset with `{ mode }` → 200 `{ sale }`; reset clears the running server's sale cache | integration | `npm --prefix backend run test:int` (admin.test) | ✅ | ✅ green |
| 02-04-02 | 02-04 | 2 | ADMIN-01, ADMIN-02 | T-02-14, T-02-15 | 401/403 for non-admin (incl. x-test-user); INVALID_MODE / VALIDATION_ERROR; D-25 stats keys; V2 burst stats + reconcile in sync; V0 burst oversold > 0 | integration | `npm --prefix backend run test:int` (admin.test) | ✅ | ✅ green |
| 02-05-01 | 02-05 | 3 | READ-03 | T-02-19, T-02-20 | `GET /sales/:id` → `{ now, sale }`, remaining by sale.mode (negative V0/V1, V2 Redis, V2 missing → count + stockLoaded false); 400/404 | integration | `npm --prefix backend run test:int` (read.test) | ✅ | ✅ green |
| 02-05-02 | 02-05 | 3 | READ-01, READ-02 | T-02-19, T-02-20 | Active filter + startAt order + one MGET (none for zero v2); products list/detail, 400/404 | integration | `npm --prefix backend run test:int` (read.test) | ✅ | ✅ green |
| 02-05-03 | 02-05 | 3 | READ-04 | T-02-18, T-02-21 | Own orders only, newest first, cap 100, product summary; 401 without credentials | integration | `npm --prefix backend run test:int` (read.test) | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky* — single-file runs during development: from `backend/`, `npm run build && node --import tsx --test test/integration/<file>.test.ts`.

---

## Wave 0 Requirements

- [x] `backend/test/integration/lua.test.ts` — BUY-09 (lands with `lua.ts` in 02-01 Task 2)
- [x] `backend/test/helpers.ts` — `spawnCli` union += `"reconcile"` (02-02 Task 1); no `registerBuyScript` helper: tests call it directly so 02-01 and 02-02 share no file in wave 1
- [x] `backend/test/cli-args.test.ts` — `parseReconcileArgs` cases (02-02 Task 2)

No separate Wave 0 plan: every test file is created by the task that needs it (tracer-first), and each task's `<verify>` runs it.

*Framework install: none — existing `node:test` infrastructure.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Compiled server buys in every mode | BUY-01 | Catches CJS named-import / `dist/lua` problems that `tsc` misses | `npm --prefix backend run build`, `npm --prefix backend run start:test`, then one buy each with `?mode=v0`, `v1`, `v2` |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 120s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-11-08 (full suite green after wave 3: unit 164/164, integration 175/175)

## Validation Audit 2026-11-08

| Metric | Count |
|---|---|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |
