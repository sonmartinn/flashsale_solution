---
phase: "03"
slug: "experiments-e1-e4"
status: verified
threats_open: 0
asvs_level: 1
register_authored_at_plan_time: true
created: "2026-11-13"
---

# Phase 03 Security

## Scope and Method

Applied the plan-authored STRIDE register at ASVS L1: inspect controls in implementation, tests and official CSV evidence. The recurring T-03-SC is one shared supply-chain threat across six plans, not six independent threats. All 22 unique entries have a planned mitigation or plan-authored acceptance. No additional risk acceptance was made by the agent.

## Trust Boundaries

Operator CLI to test-mode HTTP API; authenticated admin reset/stats; child git/reconcile processes; CSV/raw output; E4 Docker daemon and single-sale Redis repair.

## Threat Register

| ID | Category | Component | Severity | Disposition | Evidence | Status |
|----|----------|-----------|----------|-------------|----------|--------|
| T-03-01 | Tampering | reset body totalQty | high | mitigate | admin.controller.ts validates typeof number + safe integer + bounds; sale-admin.service.ts repeats bounds; harness-support tests reject malformed values | closed |
| T-03-02 | Elevation of privilege | reset/stats routes | high | mitigate | admin.routes.ts router.use(requireAuth, requireAdmin) precedes reset/stats routes; admin.test.ts 401/403 cases | closed |
| T-03-03 | Information disclosure | stats uniqueOrderIndex | low | accept | Admin-only uniqueOrderIndex boolean; listIndexes errors except namespace code26 propagate to generic 500 handler | closed |
| T-03-04 | Denial of service | totalQty up to 1,000,000 | low | accept | Admin-only numeric counter updates; no per-unit allocation in resetSale | closed |
| T-03-SC | Tampering | npm installs | high | mitigate | 03-02 user-approved package checkpoint and committed lockfile; autocannon8 pinned; no new installation during E4 or this closeout; README npm ci policy | closed |
| T-03-05 | Tampering | CSV cells (note, cpuModel, os) | low | mitigate | csv.ts formatCell prefixes formula-leading string cells and escapes CSV metacharacters; csv.test.ts | closed |
| T-03-06 | Information disclosure | admin password in config | medium | mitigate | config.ts loads env/seed account without logging password; config.test.ts checks errors | closed |
| T-03-07 | Elevation of privilege | git child process | medium | mitigate | env-info.ts spawnSync git with argv, default no shell, fileURLToPath root | closed |
| T-03-08 | Spoofing | load against a non-test server | high | mitigate | preflight.ts checkHealth requires testMode true, healthy dependencies; verdict.ts invalidates 401; checks.test.ts | closed |
| T-03-09 | Tampering | demo sale data | medium | mitigate | session.ts resetAndCheck targets one resolved sale; all scenario finalizers call closeSession to restore original mode/quantity | closed |
| T-03-10 | Elevation of privilege | reconcile spawn | high | mitigate | reconcile.ts spawn(process.execPath, args) with default no shell; config validates 24-hex sale ID | closed |
| T-03-11 | Information disclosure | admin JWT | medium | mitigate | admin.ts keeps JWT in private closure; raw scenario objects exclude credentials and token | closed |
| T-03-12 | Denial of service | --base-url pointing at another host | low | accept | config.ts allows only HTTP(S); preflight.ts checks explicit backend health contract and testMode | closed |
| T-03-13 | Denial of service | ephemeral-port exhaustion affecting other apps | medium | mitigate | ports.ts budget10000, bounded180s polling; ports.test.ts; no OS configuration mutation | closed |
| T-03-14 | Repudiation | E2 metrics integrity | medium | mitigate | autocannon-phase.ts cross-checks counters; histogram.ts computes own percentiles; e2-performance.ts appends every measured phase and raw evidence | closed |
| T-03-15 | Denial of service | sustained load on the local machine | low | accept | config.ts bounded parameters; autocannon request timeout10s; waitForPortBudget before each phase; operator-only compiled test server | closed |
| T-03-16 | Repudiation | official result CSVs | medium | mitigate | 03-05-SUMMARY.md verifies committed default CSVs and source revisions; 03-06-SUMMARY.md verifies official E4 row | closed |
| T-03-17 | Information disclosure | credentials in README | low | accept | README names documented seed-only account/env variable names and asks operator to set secret; no JWT secret value in document | closed |
| T-03-18 | Tampering | docker commands | high | mitigate | docker.ts constant MONGO_CONTAINER flashsale-mongo; stop/start typed action and argv; shell false; healthy containers inspected after official run | closed |
| T-03-19 | Denial of service | MongoDB left stopped after a crash | medium | mitigate | e4-mongo-outage.ts finally retries start when stop issued without successful start; README manual docker start command; abrupt termination still needs operator recovery | closed |
| T-03-20 | Tampering | reconcile --fix rewriting Redis | medium | mitigate | e4-mongo-outage.ts waits all workers, then starts MongoDB, waits health, and reconciles one sale; post-fix recheck required; official raw evidence | closed |
| T-03-21 | Information disclosure | 500 log flood during the outage | low | accept | D-30 acceptance documented in plan/README; generic error middleware returns generic 500; observed 74 expected 5xx | closed |

## Accepted Risks Log

| Threat | Rationale and authority |
|--------|-------------------------|
| T-03-03 | Existing accept disposition in plan threat register: Admin-only uniqueOrderIndex boolean; listIndexes errors except namespace code26 propagate to generic 500 handler |
| T-03-04 | Existing accept disposition in plan threat register: Admin-only numeric counter updates; no per-unit allocation in resetSale |
| T-03-12 | Existing accept disposition in plan threat register: config.ts allows only HTTP(S); preflight.ts checks explicit backend health contract and testMode |
| T-03-15 | Existing accept disposition in plan threat register: config.ts bounded parameters; autocannon request timeout10s; waitForPortBudget before each phase; operator-only compiled test server |
| T-03-17 | Existing accept disposition in plan threat register: README names documented seed-only account/env variable names and asks operator to set secret; no JWT secret value in document |
| T-03-21 | Existing accept disposition in plan threat register: D-30 acceptance documented in plan/README; generic error middleware returns generic 500; observed 74 expected 5xx |

## Limits

This L1 register check does not replace adversarial code review or a guarantee that no bugs exist. A finally block cannot execute after force termination, power loss or a killed harness; the operator recovery command remains necessary. Existing Phase 2 WR-01/WR-02/WR-04 risks remain in STATE.md and must be documented in Phase 5.

## Sign-Off

22 unique threats closed under the authored mitigations/acceptances, 0 blocking high/critical threats open. ASVS1 with a plan-authored register and no open threats uses the workflow short circuit; no deeper auditor dispatch is required.

## Security Audit 2026-11-13

| Metric | Count |
|---|---|
| Threats found | 22 |
| Closed | 22 |
| Open | 0 |
