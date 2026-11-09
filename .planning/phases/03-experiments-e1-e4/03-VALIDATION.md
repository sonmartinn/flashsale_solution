---
phase: "3"
slug: "experiments-e1-e4"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-09"
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `node:test` (Node 24) + tsx 4.23.15 loader |
| **Config file** | none — scripts in `package.json` (loadtest scaffold is Wave 0) |
| **Quick run command** | `cd loadtest && npm test` (pure units, no Docker) |
| **Full suite command** | `cd backend && npm run typecheck && npm test && npm run test:int` and `cd loadtest && npm run typecheck && npm test` |
| **Estimated runtime** | ~90 seconds (backend integration needs Docker Desktop running) |

---

## Sampling Rate

- **After every task commit:** Run `npm run typecheck` in the touched package + `cd loadtest && npm test`
- **After every plan wave:** Run backend `npm test && npm run test:int` (Docker up) + loadtest `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green, backend `build` green, smoke e1/e3/e2 (e4 if kept) exit as expected
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 3-xx-xx | — | — | EXP-01 | — | ids unique/24-hex lowercase; CSV escape + number format; classify(status, code); env-info git fallback; port-guard parsing | unit | `cd loadtest && npm test` | ❌ W0 | ⬜ pending |
| 3-xx-xx | — | — | EXP-01 (D-01) | — | reset `{totalQty}` accepts only integer 1..1000000; rejects `"100"`, 0, -1, 1.5, 1000001, true, null with 400 | integration + unit | `cd backend && npm run test:int` / `cd backend && npm test` | ❌ W0 | ⬜ pending |
| 3-xx-xx | — | — | EXP-01 (D-07) | — | `uniqueOrderIndex` true/false (dropped, non-unique, collection missing) | integration | `cd backend && npm run test:int` | ❌ W0 | ⬜ pending |
| 3-xx-xx | — | — | EXP-02/03 | — | E1 verdict rules (V0 oversells every run; V1/V2 exact; INVALID triggers) | unit | `cd loadtest && npm test` | ❌ W0 | ⬜ pending |
| 3-xx-xx | — | — | EXP-04 | — | E3 verdict rules | unit | `cd loadtest && npm test` | ❌ W0 | ⬜ pending |
| 3-xx-xx | — | — | EXP-05/06 | — | nearest-rank percentiles, rps from own timestamps, error arithmetic, E2 verdict | unit | `cd loadtest && npm test` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*
*Task IDs are filled in once plans exist.*

---

## Wave 0 Requirements

- [ ] `loadtest/package.json`, `loadtest/tsconfig.json`, `loadtest/test/` — framework scaffold
- [ ] `loadtest/test/ids.test.ts`, `csv.test.ts`, `histogram.test.ts`, `http-classify.test.ts`, `verdict.test.ts`, `env-info.test.ts`, `ports.test.ts`
- [ ] `backend/test/integration/<new>.test.ts` (Redis db 12) for D-01 + D-07
- [ ] Edits: `backend/test/cli-args.test.ts` (`--qty` now valid), `backend/test/integration/admin.test.ts` (`STATS_KEYS`)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| E1 end-to-end smoke | EXP-02/03 | Needs Docker + `npm run start:test` running | `cd loadtest && npm run e1 -- --runs 1` |
| E3 end-to-end smoke | EXP-04 | Needs Docker + server | `cd loadtest && npm run e3 -- --runs 1` |
| E2 end-to-end smoke | EXP-05/06 | Needs Docker + server; long-running | `cd loadtest && npm run e2 -- --smoke --runs 1` |
| Measurement procedure documented | EXP-07 | Documentation review | Check the procedure doc exists and lists reset, warm-up, start:test, pool size |
| E4 Mongo outage | EXP-08 | Stops a Docker container mid-sale | `cd loadtest && npm run e4` |
| Official runs | EXP-02..06 | Long runs on the operator machine; results committed | Run e1/e3/e2 full sessions, commit CSVs |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
