---
phase: "1"
slug: "foundation-infra-data-auth"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-04"
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node built-in `node:test` + `node:assert/strict`, TS via `--import tsx` (Node 24.22.1, tsx 4.23.15) |
| **Config file** | none — Wave 0 adds `test` / `test:int` scripts to `backend/package.json` and `test` to `tsconfig.json` `include` |
| **Quick run command** | `npm run typecheck && npm test` (in `backend/`, unit only, no Docker) |
| **Full suite command** | `npm run build && npm test && npm run test:int` (in `backend/`, needs `docker compose up -d --wait`) |
| **Estimated runtime** | ~5 seconds (unit), ~30 seconds (full) |

---

## Sampling Rate

- **After every task commit:** Run `npm run typecheck && npm test`
- **After every plan wave:** Run `npm run build && npm test && npm run test:int`
- **Before `/gsd-verify-work`:** Full suite must be green, plus the manual 4-case boot check below
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

Filled by the planner from the 01-01…01-04 PLAN.md tasks. All commands run from the repo root. `npm --prefix backend test` = build + unit tests (`test/*.test.ts`, no Docker); `npm --prefix backend run test:int` = build + integration tests (`test/integration/*.test.ts`, `--test-concurrency=1`, needs `docker compose up -d --wait`). Integration tests use their own databases `flashsale_test_<name>_<pid>` and Redis db 1–4, never the demo `flashsale` db or Redis db 0.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-01-T1 | 01-01 | 1 | (all installs) | T-01-SC | Human verifies express/mongoose/dotenv/@types/node on npmjs.com before install | manual (blocking-human checkpoint) | — | n/a | ⬜ pending |
| 01-01-T2 | 01-01 | 1 | INFRA-01, INFRA-02, INFRA-04, INFRA-06 | T-01-01, T-01-04 | Compose ports bound to 127.0.0.1; health pings bounded | smoke + integration | `docker compose up -d --wait && docker exec flashsale-redis redis-cli CONFIG GET appendfsync`; `npm --prefix backend run typecheck && npm --prefix backend run build`; `npm --prefix backend run test:int` (health.test) | ❌ W0 (created by task) | ⬜ pending |
| 01-01-T3 | 01-01 | 1 | INFRA-02, INFRA-03, INFRA-04, INFRA-06 | T-01-02, T-01-03, T-01-05, T-01-07 | No JWT_SECRET default; refuse 27017 (explicit + implicit); port probe before connect | unit + integration | `npm --prefix backend test` (config, boot, build); `npm --prefix backend run test:int` (health: Redis-down exit, 503, start:test) | ❌ W0 | ⬜ pending |
| 01-02-T1 | 01-02 | 2 | INFRA-05 | T-01-08, T-01-09, T-01-10 | 500 never leaks internals; ids normalized | unit | `npm --prefix backend test` (errors, object-id) | ❌ W0 | ⬜ pending |
| 01-02-T2 | 01-02 | 2 | DATA-01, DATA-02 | T-01-11 | Unique `(saleId, userId)` and email indexes exist before listen | integration | `npm --prefix backend run test:int` (models) | ❌ W0 | ⬜ pending |
| 01-03-T1 | 01-03 | 3 | DATA-03 | T-01-12, T-01-14 | Seed refuses 27017 / unnamed db; FLUSHDB only on configured index | unit + integration + CLI | `npm --prefix backend test` (cli-args); `npm --prefix backend run test:int` (seed); seed CLI against the demo db + mongosh/redis-cli checks | ❌ W0 | ⬜ pending |
| 01-03-T2 | 01-03 | 3 | DATA-04, DATA-05 | T-01-13, T-01-15, T-01-16 | Checked `multi()` result; cache warning on every run | integration + CLI | `npm --prefix backend run test:int` (reset); reset CLI output grep for the warning | ❌ W0 | ⬜ pending |
| 01-04-T1 | 01-04 | 3 | AUTH-01, AUTH-02 | T-01-17, T-01-18, T-01-22, T-01-23 | Role forced `user`; non-string → 400; 72-byte limit; identical 401 | unit + integration | `npm --prefix backend test` (validate); `npm --prefix backend run test:int` (auth) | ❌ W0 | ⬜ pending |
| 01-04-T2 | 01-04 | 3 | AUTH-03, AUTH-04, AUTH-05 | T-01-19, T-01-20, T-01-21 | HS256 pinned; 401/403 matrix; x-test-user only in test mode, never admin | unit | `npm --prefix backend test` (auth) | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/package.json` — `test` + `test:int` scripts; `tsconfig.json` includes `test` (01-01-T2)
- [ ] `backend/test/helpers.ts` — `startApp`, `spawnServer` (cwd `mkdtemp`), `startServerProcess`, `testMongoUri`, `testRedisUrl`, `connectTestStores` (01-01-T2)
- [ ] Unit test files (`backend/test/*.test.ts`): `config`, `boot`, `build` (01-01-T3), `errors`, `object-id` (01-02-T1), `cli-args` (01-03), `validate` (01-04-T1), `auth` (01-04-T2)
- [ ] Integration test files (`backend/test/integration/*.test.ts`): `health` (01-01), `models` (01-02-T2), `seed`, `reset` (01-03), `auth` (01-04-T1); each uses `flashsale_test_<name>_<pid>` and its own Redis db (1–4)
- [ ] Framework install: none (built-in `node:test`)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Reset CLI prints in-process cache warning | DATA-05 | Now also automated (01-03-T2 verify greps the CLI output); manual read is optional | Run `npm run reset` and read the warning |
| Boot fails fast in 4 real cases | INFRA-03 | Needs stopping Docker containers / holding a port | JWT_SECRET missing; Docker stopped; Redis container stopped; port 5000 held by `node -e "require('net').createServer().listen(5000,'127.0.0.1')"` |
| Health flips to 503 when a container stops | INFRA-04 | Needs `docker stop` on a live server | `docker stop flashsale-redis`, then `GET /api/health` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
