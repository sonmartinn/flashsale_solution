---
phase: "2"
slug: "buy-pipeline-admin-apis"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
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
| 2-xx-xx | TBD | TBD | BUY-09 | — | Lua returns only 1/0/-1/-2; 1,000 parallel → exactly 100 | integration | `node --import tsx --test test/integration/lua.test.ts` | ❌ W0 | ⬜ pending |
| 2-xx-xx | TBD | TBD | BUY-01, BUY-03 | — | Same response codes in v0/v1/v2; non-string/array input rejected | integration | `node --import tsx --test test/integration/buy.test.ts` | ❌ W0 | ⬜ pending |
| 2-xx-xx | TBD | TBD | BUY-04, BUY-05, BUY-06 | — | V0 oversells; V1/V2 never exceed `totalQty` | integration | `node --import tsx --test test/integration/buy.test.ts` | ❌ W0 | ⬜ pending |
| 2-xx-xx | TBD | TBD | BUY-02 | — | 404 not cached; reset clears sale cache | integration | `node --import tsx --test test/integration/admin.test.ts` | ❌ W0 | ⬜ pending |
| 2-xx-xx | TBD | TBD | BUY-07, BUY-08 | — | Stock restored on order failure; `qty:-5` never increases stock | integration | `node --import tsx --test test/integration/compensation.test.ts` | ❌ W0 | ⬜ pending |
| 2-xx-xx | TBD | TBD | READ-01..04 | — | Bad id → 400, unknown → 404; own orders only | integration | `node --import tsx --test test/integration/read.test.ts` | ❌ W0 | ⬜ pending |
| 2-xx-xx | TBD | TBD | ADMIN-01, ADMIN-02 | — | 401/403 for non-admin; `INVALID_MODE` | integration | `node --import tsx --test test/integration/admin.test.ts` | ❌ W0 | ⬜ pending |
| 2-xx-xx | TBD | TBD | ADMIN-03 | — | Reconcile exit codes 0/2/1; `--fix` repairs Redis | integration + unit | `node --import tsx --test test/integration/reconcile.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky* — Task IDs are filled in once plans exist.

---

## Wave 0 Requirements

- [ ] `backend/test/integration/lua.test.ts` — BUY-09 (can land with `lua.ts` itself)
- [ ] `backend/test/helpers.ts` — `spawnCli` union += `"reconcile"`; optional `registerBuyScript` convenience
- [ ] `backend/test/cli-args.test.ts` — `parseReconcileArgs` cases

*Framework install: none — existing `node:test` infrastructure.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Compiled server buys in every mode | BUY-01 | Catches CJS named-import / `dist/lua` problems that `tsc` misses | `npm --prefix backend run build`, `npm --prefix backend run start:test`, then one buy each with `?mode=v0`, `v1`, `v2` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
