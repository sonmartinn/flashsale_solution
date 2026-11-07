---
phase: "1"
slug: "foundation-infra-data-auth"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: validated
nyquist_compliant: true
wave_0_complete: true
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

Filled by the planner from the 01-01…01-04 PLAN.md tasks; gap-closure rows 01-05…01-08 added by validate-phase on 2026-11-06, rows 01-09 on 2026-11-07. All commands run from the repo root. `npm --prefix backend test` = build + unit tests (`test/*.test.ts`, no Docker); `npm --prefix backend run test:int` = build + integration tests (`test/integration/*.test.ts`, `--test-concurrency=1`, needs `docker compose up -d --wait`). Integration tests use their own databases `flashsale_test_<name>_<pid>` and Redis db 1–4, never the demo `flashsale` db or Redis db 0.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-01-T1 | 01-01 | 1 | (all installs) | T-01-SC | Human verifies express/mongoose/dotenv/@types/node on npmjs.com before install | manual (blocking-human checkpoint) | — | n/a | ✅ green (human-approved) |
| 01-01-T2 | 01-01 | 1 | INFRA-01, INFRA-02, INFRA-04, INFRA-06 | T-01-01, T-01-04 | Compose ports bound to 127.0.0.1; health pings bounded | smoke + integration | `docker compose up -d --wait && docker exec flashsale-redis redis-cli CONFIG GET appendfsync`; `npm --prefix backend run typecheck && npm --prefix backend run build`; `npm --prefix backend run test:int` (health.test) | ✅ | ✅ green |
| 01-01-T3 | 01-01 | 1 | INFRA-02, INFRA-03, INFRA-04, INFRA-06 | T-01-02, T-01-03, T-01-05, T-01-07 | No JWT_SECRET default; refuse 27017 (explicit + implicit); port probe before connect | unit + integration | `npm --prefix backend test` (config, boot, build); `npm --prefix backend run test:int` (health: Redis-down exit, 503, start:test) | ✅ | ✅ green |
| 01-02-T1 | 01-02 | 2 | INFRA-05 | T-01-08, T-01-09, T-01-10 | 500 never leaks internals; ids normalized | unit | `npm --prefix backend test` (errors, object-id) | ✅ | ✅ green |
| 01-02-T2 | 01-02 | 2 | DATA-01, DATA-02 | T-01-11 | Unique `(saleId, userId)` and email indexes exist before listen | integration | `npm --prefix backend run test:int` (models) | ✅ | ✅ green |
| 01-03-T1 | 01-03 | 3 | DATA-03 | T-01-12, T-01-14 | Seed refuses 27017 / unnamed db; FLUSHDB only on configured index | unit + integration + CLI | `npm --prefix backend test` (cli-args); `npm --prefix backend run test:int` (seed); seed CLI against the demo db + mongosh/redis-cli checks | ✅ | ✅ green |
| 01-03-T2 | 01-03 | 3 | DATA-04, DATA-05 | T-01-13, T-01-15, T-01-16 | Checked `multi()` result; cache warning on every run | integration + CLI | `npm --prefix backend run test:int` (reset); reset CLI output grep for the warning | ✅ | ✅ green |
| 01-04-T1 | 01-04 | 3 | AUTH-01, AUTH-02 | T-01-17, T-01-18, T-01-22, T-01-23 | Role forced `user`; non-string → 400; 72-byte limit; identical 401 | unit + integration | `npm --prefix backend test` (validate); `npm --prefix backend run test:int` (auth) | ✅ | ✅ green |
| 01-04-T2 | 01-04 | 3 | AUTH-03, AUTH-04, AUTH-05 | T-01-19, T-01-20, T-01-21 | HS256 pinned; 401/403 matrix; x-test-user only in test mode, never admin | unit | `npm --prefix backend test` (auth) | ✅ | ✅ green |
| 01-05-T1 | 01-05 | 4 | AUTH-05 | T-01-25 | Padded NODE_ENV never honors x-test-user (exact `=== "test"`) | unit | `npm --prefix backend run typecheck && npm --prefix backend test` (auth) | ✅ | ✅ green |
| 01-05-T2 | 01-05 | 4 | AUTH-05 | T-01-25, T-01-26 | isTestMode exactness matrix; `.env.test` path still gives test mode | unit + integration | `npm --prefix backend test` (config); `npm --prefix backend run test:int` (health) | ✅ | ✅ green |
| 01-06-T1 | 01-06 | 5 | INFRA-04, AUTH-05 | — | Health reports `testMode` + raw `nodeEnv` | unit + integration | `npm --prefix backend run typecheck && npm --prefix backend test && npm --prefix backend run test:int` (config, health) | ✅ | ✅ green |
| 01-06-T2 | 01-06 | 5 | AUTH-05 | — | JSON-quoted NODE_ENV banner; near-miss `[CẢNH BÁO]` line; decision unchanged | unit + integration | same as 01-06-T1 (config, health banner) | ✅ | ✅ green |
| 01-06-T3 | 01-06 | 5 | — (docs) | — | D-17 amended, UAT overrides recorded, CR-01 fixed | doc check | `gsd-tools query frontmatter.get 01-VERIFICATION.md --field overrides | grep -c accepted_by` (= 2) | ✅ | ✅ green |
| 01-07-T1 | 01-07 | 6 | INFRA-05 | — | Zero-byte declared-JSON body → 400 INVALID_JSON | unit | `npm --prefix backend run typecheck && npm --prefix backend test` (errors) | ✅ | ✅ green |
| 01-07-T2 | 01-07 | 6 | INFRA-05 | — | Every zero-byte framing (CL 0, charset, chunked, gzip) → 400; body-less POST without Content-Type still routes | unit | `npm --prefix backend test` (errors) | ✅ | ✅ green |
| 01-08-T1 | 01-08 | 6 | INFRA-03 | — | Redis down at boot → exactly one `[LỖI]` line (runtime log armed after connect) | unit + integration | `npm --prefix backend test && npm --prefix backend run test:int` (boot, redis-boot) | ✅ | ✅ green |
| 01-08-T2 | 01-08 | 6 | INFRA-03, DATA-03, DATA-05 | — | 5 s startup deadline for a silent Redis; seed/reset with MongoDB down print one line | unit | `npm --prefix backend run typecheck && npm --prefix backend test` (redis, boot) | ✅ | ✅ green |
| 01-08-T3 | 01-08 | 6 | INFRA-03, DATA-03, DATA-05 | — | Server + both CLIs vs fake/silent Redis; runtime disconnect still logged | integration | `npm --prefix backend run test:int` (redis-boot, models, health) | ✅ | ✅ green |
| 01-09-T1 | 01-09 | 7 | INFRA-02, AUTH-05 | T-01-37, T-01-38, T-01-39, T-01-SC | `start:test` = `dotenv run -q --override -f .env.test` forces test mode even when the shell holds NODE_ENV `"test "`; stopping the wrapper tree frees the port; only the helper's own live child is signalled | unit + integration | `npm --prefix backend run typecheck && npm --prefix backend test && npm --prefix backend run test:int` (build: start:test pinned to START_TEST_SCRIPT; health: G-01-9 describe + isPortFree after stop) | ✅ | ✅ green |
| 01-09-T2 | 01-09 | 7 | INFRA-03, AUTH-05 | T-01-40 | start:test boot failure exits 1 with exactly one `[LỖI]` line through the wrapper; near-miss advice says start:test always sets NODE_ENV=test | unit + integration | same as 01-09-T1 (boot: start:test with MongoDB down; health: near-miss advice) | ✅ | ✅ green |
| 01-09-T3 | 01-09 | 7 | — (docs) | T-01-41 | Human tests runnable: backend/.env prerequisite (key never printed), pinned Env source, D-20 amended, `.env.example` header | doc check | `gsd-tools query frontmatter.get 01-VERIFICATION.md --field human_verification \| grep -c "Env source:"` (= 2) | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `backend/package.json` — `test` + `test:int` scripts; `tsconfig.json` includes `test` (01-01-T2)
- [x] `backend/test/helpers.ts` — `startApp`, `spawnServer` (cwd `mkdtemp`), `startServerProcess`, `testMongoUri`, `testRedisUrl`, `connectTestStores` (01-01-T2)
- [x] Unit test files (`backend/test/*.test.ts`): `config`, `boot`, `build` (01-01-T3), `errors`, `object-id` (01-02-T1), `cli-args` (01-03), `validate` (01-04-T1), `auth` (01-04-T2)
- [x] Integration test files (`backend/test/integration/*.test.ts`): `health` (01-01), `models` (01-02-T2), `seed`, `reset` (01-03), `auth` (01-04-T1); each uses `flashsale_test_<name>_<pid>` and its own Redis db (1–4)
- [x] Framework install: none (built-in `node:test`)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Reset CLI prints in-process cache warning | DATA-05 | Now also automated (01-03-T2 verify greps the CLI output); manual read is optional | Run `npm run reset` and read the warning |
| Boot fails fast in 4 real cases | INFRA-03 | Needs stopping Docker containers / holding a port | JWT_SECRET missing; Docker stopped; Redis container stopped; port 5000 held by `node -e "require('net').createServer().listen(5000,'127.0.0.1')"` |
| `set NODE_ENV=test && npm run start` in real cmd.exe shows quoted banner, `[CẢNH BÁO]` and `testMode: false`; then `npm run start:test` in the SAME window boots in test mode and a real Ctrl+C frees port 5000 | AUTH-05 | Needs a real cmd.exe session and a real Ctrl+C through npm, the .cmd shim and the dotenv wrapper (01-06 D4, 01-09 T1) | Prerequisite `backend/.env` (`.env.example` header command); follow UAT test 2 in 01-VERIFICATION.md `human_verification` |
| Server, `npm run seed`, `npm run reset` with the real Redis container stopped print one `[LỖI]` line each | INFRA-03, DATA-03, DATA-05 | Stopping the shared container is the user's call (01-08) | `docker stop flashsale-redis`; run the three; `docker start flashsale-redis` |
| Health flips to 503 when a container stops | INFRA-04 | Needs `docker stop` on a live server | `docker stop flashsale-redis`, then `GET /api/health` |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-11-07 (validate-phase re-audit after 01-09: all tasks automated and green — typecheck clean, unit 151/151, integration 59/59; frontmatter `nyquist_compliant` corrected to true, the 2026-11-06 audit had ticked the sign-off but left the field false)

## Validation Audit 2026-11-06

| Metric | Count |
|---|---|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |
