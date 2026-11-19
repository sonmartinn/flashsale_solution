---
phase: "03"
slug: "experiments-e1-e4"
status: validated
nyquist_compliant: true
wave_0_complete: true
created: "2026-11-09"
updated: "2026-11-13"
---

# Phase 03 Validation

## Test Infrastructure

Node 24 node:test with tsx, strict TypeScript NodeNext. Pure loadtest suite: npm.cmd --prefix loadtest run typecheck; npm.cmd --prefix loadtest test. Current run: 289/289 passed, zero skipped/failed. Backend unit/integration coverage is tracked below and was re-run by the phase regression gate before verifier dispatch.

## Per-Task Verification Map

| Task | Requirement | Kind | Evidence | Result |
|------|-------------|------|----------|--------|
| 03-01/1 | EXP-01 | tracer | backend/test/integration/harness-support.test.ts; backend/test/integration/admin.test.ts; backend/test/cli-args.test.ts | Current backend 172 unit + 200 integration tests passed |
| 03-01/2 | EXP-01 | auto | backend/test/integration/harness-support.test.ts; backend/test/integration/admin.test.ts; backend/test/cli-args.test.ts | Current backend 172 unit + 200 integration tests passed |
| 03-01/3 | EXP-01 | auto | backend/test/integration/harness-support.test.ts; backend/test/integration/admin.test.ts; backend/test/cli-args.test.ts | Current backend 172 unit + 200 integration tests passed |
| 03-02/1 | EXP-01 | checkpoint:human-verify | loadtest/test/{ids,csv,env-info,classify,config,verdict,ports}.test.ts | 289/289 loadtest tests green |
| 03-02/2 | EXP-01 | tracer | loadtest/test/{ids,csv,env-info,classify,config,verdict,ports}.test.ts | 289/289 loadtest tests green |
| 03-02/3 | EXP-01 | auto | loadtest/test/{ids,csv,env-info,classify,config,verdict,ports}.test.ts | 289/289 loadtest tests green |
| 03-03/1 | EXP-02, EXP-03, EXP-04 | tracer | loadtest/test/{verdict,config,checks}.test.ts; official e1.csv/e3.csv in e07e0db | Unit green; official 15 E1 PASS and 10 E3 PASS |
| 03-03/2 | EXP-02, EXP-03, EXP-04 | auto | loadtest/test/{verdict,config,checks}.test.ts; official e1.csv/e3.csv in e07e0db | Unit green; official 15 E1 PASS and 10 E3 PASS |
| 03-03/3 | EXP-02, EXP-03, EXP-04 | auto | loadtest/test/{verdict,config,checks}.test.ts; official e1.csv/e3.csv in e07e0db | Unit green; official 15 E1 PASS and 10 E3 PASS |
| 03-04/1 | EXP-05, EXP-06 | tracer | loadtest/test/{histogram,classify,config,verdict}.test.ts; official e2.csv in e07e0db | Unit green; official 60 VALID rows |
| 03-04/2 | EXP-05, EXP-06 | auto | loadtest/test/{histogram,classify,config,verdict}.test.ts; official e2.csv in e07e0db | Unit green; official 60 VALID rows |
| 03-05/1 | EXP-02..EXP-07 | tracer | loadtest/README.md; 03-05-SUMMARY.md; official CSVs e07e0db | Procedure and checkpoint verified |
| 03-05/2 | EXP-02..EXP-07 | checkpoint:human-action | loadtest/README.md; 03-05-SUMMARY.md; official CSVs e07e0db | Procedure and checkpoint verified |
| 03-06/1 | EXP-08 | tracer | loadtest/test/{verdict,config,checks,csv}.test.ts; e4.csv in 8f08e3c | Unit green; official PASS, post-fix clean |
| 03-06/2 | EXP-08 | auto | loadtest/test/{verdict,config,checks,csv}.test.ts; e4.csv in 8f08e3c | Unit green; official PASS, post-fix clean |
| 03-06/3 | EXP-08 | checkpoint:human-action | loadtest/test/{verdict,config,checks,csv}.test.ts; e4.csv in 8f08e3c | Unit green; official PASS, post-fix clean |

## Manual-Only Verifications

| Behavior | Evidence | Status |
|----------|----------|--------|
| Official E1/E2/E3 measurements on operator machine (D-33) | e07e0db; 03-05-SUMMARY.md verifies frozen headers, row counts, default settings and verdicts | Verified |
| Official E4 MongoDB outage and recovery (D-33) | 8f08e3c; exact 2-line E4 CSV, PASS/clean; matching raw session 20261113T161142Z-94ab | Verified |
| Measurement procedure | loadtest/README.md covers reset, compiled start:test, warm-up, maxPoolSize, error formulas, all columns, E4 recovery | Verified by document inspection |

## Sign-Off

- Framework scaffold and referenced test files exist; no missing test infrastructure remains.
- All EXP-01..EXP-08 have unit/integration or operator evidence. No unfulfilled manual checkpoint remains.
- Commands are one-shot and contain no watch flags. Official experiment durations are outside unit feedback targets.
- No new tests or source changes were needed for this retrospective audit. Backend regression was re-run after code review: 172 unit and 200 integration tests passed, zero skipped/failed.
- Existing backend support tests cover reset invalid values and exact unique-index detection; the final regression gate passed before verifier dispatch.

## Validation Audit 2026-11-13

| Metric | Count |
|---|---|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |
