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

Filled by the planner/executor from PLAN.md tasks. Requirement → test map from RESEARCH.md:

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | INFRA-01 | — | Compose ports bound to 127.0.0.1 | smoke | `docker compose up -d --wait && docker exec flashsale-redis redis-cli CONFIG GET appendfsync` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | INFRA-02 | — | N/A | unit | `npm run build` + `test/build.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | INFRA-03 | — | No JWT_SECRET default; refuse 27017 URI | unit | `npm test` → `test/boot.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | INFRA-03 | — | Redis down → exit 1 | integration | `npm run test:int` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | INFRA-04 | — | N/A | integration | `npm run test:int` (health 200/503) | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | INFRA-05 | — | 500 never leaks internals | unit | `npm test` → `test/errors.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | INFRA-06 | — | N/A | integration | `npm run test:int` (health JSON maxPoolSize) | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | DATA-01/02 | — | Unique `(saleId, userId)` index | integration | `test/integration/models.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | DATA-03 | — | Seed never touches 27017 | integration + unit | `test/integration/seed.test.ts`, `test/cli-args.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | DATA-04 | — | Checked `multi()` result | integration | `test/integration/reset.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | AUTH-01 | — | Role forced `user`; non-string → 400 | unit + integration | `npm test` + `npm run test:int` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | AUTH-02 | — | HS256 pinned, 7-day exp | unit | `npm test` → `test/auth.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | AUTH-03/04/05 | — | 401/403 matrix; x-test-user only in test mode | unit | `npm test` → `test/auth.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/package.json` — `test` + `test:int` scripts; `tsconfig.json` includes `test`
- [ ] `backend/test/helpers.ts` — `startApp(cfgOverrides)` on port 0; `spawnServer(env)` with `cwd: mkdtemp`
- [ ] Unit test files: `boot`, `errors`, `auth`, `cli-args`, `config` (URI guards), `build`
- [ ] Integration test files: `models`, `seed`, `reset`, `register-dup`, `health` (use `flashsale_test` DB + Redis db 1)
- [ ] Framework install: none (built-in `node:test`)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Reset CLI prints in-process cache warning | DATA-05 | CLI output text | Run `npm run reset` and read the warning |
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
