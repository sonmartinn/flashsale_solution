---
phase: 01-foundation-infra-data-auth
plan: 04
subsystem: auth
tags: [jwt, jsonwebtoken, bcryptjs, express5, mongoose9, nosql-injection, test-mode, node-test]

# Dependency graph
requires:
  - phase: 01-01
    provides: "AppDeps/createApp, BaseConfig.isTestMode (single NODE_ENV check), test/helpers.ts (startApp, testConfig, TEST_JWT_SECRET, connectTestStores, dropTestDatabaseAndDisconnect)"
  - phase: 01-02
    provides: "HttpError + ErrorCode, normalizeObjectId, notFound/errorHandler, User model (email unique, lowercase, trim), ensureIndexes()"
provides:
  - "utils/validate.ts: parseRegisterInput / parseLoginInput (string-only, trimmed, email lowercased, password 6 chars - 72 UTF-8 bytes, never reads role)"
  - "services/auth.service.ts: createAuthService({ jwtSecret }) -> register, login, signToken (HS256, 7d, subject = userId, payload { role })"
  - "POST /api/auth/register -> 201 { token, user: { id, name, email, role } }; POST /api/auth/login -> 200 same shape"
  - "middlewares/auth.ts: createAuthMiddleware({ cfg, jwtSecret }) -> requireAuth (token-only, no MongoDB read, x-test-user only when cfg.isTestMode) and requireAdmin"
  - "routes/admin.routes.ts: createAdminRouter(auth) with router.use(requireAuth, requireAdmin) before any route, mounted at /api/admin"
  - "types/express.d.ts: global Express.Request.user?: { id: string; role: Role }"
affects: [phase-02, phase-03, phase-04]

actuals:
  tokens: 9200       # chars/4 over the 11 realized files (36789 bytes by wc -c; Vietnamese text makes bytes > chars, so slightly high)
  tasks: 2
  commits: 3         # MEASURED: git rev-list --count 1d4c8ab..HEAD before the SUMMARY commit
plan_head_before: 1d4c8abec3f26c090af9a8fce0666d0aab955327
plan_head_after: 47148a58e06ed8cd7a66fb5e67f7a99fa7329cb2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Input parsers in utils/validate.ts return fresh objects with only the listed fields; every field typeof string before any query"
    - "Auth factories take injected deps (createAuthService({ jwtSecret }), createAuthMiddleware({ cfg, jwtSecret })); nothing reads the environment outside config/env.ts"
    - "Only local try/catch allowed is error translation (E11000 -> EMAIL_TAKEN, jsonwebtoken errors -> 401); handlers have none"
    - "Admin guard via router.use on the whole admin router; Phase 2 adds routes after it"

key-files:
  created:
    - backend/src/utils/validate.ts
    - backend/src/services/auth.service.ts
    - backend/src/controllers/auth.controller.ts
    - backend/src/routes/auth.routes.ts
    - backend/src/routes/admin.routes.ts
    - backend/src/middlewares/auth.ts
    - backend/src/types/express.d.ts
    - backend/test/validate.test.ts
    - backend/test/auth.test.ts
    - backend/test/integration/auth.test.ts
  modified:
    - backend/src/routes/index.ts
    - .planning/REQUIREMENTS.md

key-decisions:
  - "Login password over 72 bytes or empty returns 401 INVALID_CREDENTIALS without a DB lookup or compare (never truncated-and-matched)"
  - "Unknown email still runs one bcrypt.compare against a lazily memoized dummy hash (cost 10) to even out timing"
  - "parseLoginInput checks only object shape, string types and email normalization; email format and password length rules apply to register only"
  - "A JSON primitive body (\"abc\") is rejected by express.json strict mode as 400 INVALID_JSON before validation; missing/{}/[] bodies give 400 VALIDATION_ERROR"
  - "requireAdmin without req.user returns 401 UNAUTHORIZED 'Bạn chưa đăng nhập' (defensive; it is always mounted after requireAuth)"

patterns-established:
  - "Guarded-route tests run with no MongoDB connection and a 1 s fetch timeout, proving requireAuth never reads the database"
  - "Phase 2 mounts protected routes with the shared `auth` built once in createApiRouter"

requirements-completed: [AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05]

coverage:
  - id: D1
    description: "Register returns 201 { token, user } with role always user (client role ignored), no passwordHash in the response, bcrypt hash stored; string-only, trimmed, byte-aware validation returns 400 and never 500 for missing/empty/array/primitive/operator bodies"
    requirement: AUTH-01
    verification:
      - kind: unit
        ref: "backend/test/validate.test.ts#validate.test"
        status: pass
      - kind: integration
        ref: "backend/test/integration/auth.test.ts#201 { token, user }, role luôn là user dù client gửi admin, không lộ passwordHash"
        status: pass
      - kind: integration
        ref: "backend/test/integration/auth.test.ts#body thiếu, rỗng, mảng, primitive hay trường không phải chuỗi đều trả 400, không bao giờ 500"
        status: pass
    human_judgment: false
  - id: D2
    description: "Duplicate email (also differing only in case or spaces) returns 409 EMAIL_TAKEN; two concurrent registrations give exactly [201, 409] and one stored user"
    requirement: AUTH-01
    verification:
      - kind: integration
        ref: "backend/test/integration/auth.test.ts#email trùng (kể cả khác hoa thường và khoảng trắng) trả 409 EMAIL_TAKEN"
        status: pass
      - kind: integration
        ref: "backend/test/integration/auth.test.ts#hai đăng ký đồng thời cùng email mới: đúng một 201, một 409 và một user"
        status: pass
    human_judgment: false
  - id: D3
    description: "Login returns 200 { token, user } with an HS256 token, exp - iat = 604800, sub = user id, role; wrong password and unknown email share one 401 body; > 72-byte password gets 401; 5 concurrent logins all 200; admin login carries role admin"
    requirement: AUTH-02
    verification:
      - kind: integration
        ref: "backend/test/integration/auth.test.ts#auth.test"
        status: pass
    human_judgment: false
  - id: D4
    description: "requireAuth verifies only the Bearer token (HS256 pinned, sub ObjectId lowercased, role user|admin) with no MongoDB read; missing, malformed, forged, expired, alg none and bad-claims tokens return 401"
    requirement: AUTH-03
    verification:
      - kind: unit
        ref: "backend/test/auth.test.ts#chế độ thường (isTestMode false)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Every /api/admin/* path runs requireAuth + requireAdmin: no token 401, user token 403 FORBIDDEN, admin token passes (404 in Phase 1); concurrent admin/user requests do not leak roles"
    requirement: AUTH-04
    verification:
      - kind: unit
        ref: "backend/test/auth.test.ts#token user hợp lệ trên /api/admin/*: 403 FORBIDDEN"
        status: pass
      - kind: unit
        ref: "backend/test/auth.test.ts#request admin và user đồng thời không lẫn quyền của nhau"
        status: pass
    human_judgment: false
  - id: D6
    description: "x-test-user honored only when cfg.isTestMode: valid id wins over any token as role user (lowercased), invalid or joined values 401, admin routes still need a real admin token; ignored outside test mode"
    requirement: AUTH-05
    verification:
      - kind: unit
        ref: "backend/test/auth.test.ts#chế độ test (isTestMode true)"
        status: pass
      - kind: unit
        ref: "backend/test/auth.test.ts#x-test-user bị bỏ qua ngoài chế độ test: không token thì 401"
        status: pass
      - kind: other
        ref: "grep -rnE \"===? *['\\\"]test['\\\"]\" backend/src -> only backend/src/config/env.ts:123"
        status: pass
    human_judgment: false

# Metrics
duration: 3h37m wall clock (includes a usage-limit pause; active work ~25 min)
completed: 2026-11-04
status: complete
---

# Phase 1 Plan 04: Register, login and route guards Summary

**JWT register/login on `/api/auth` (bcryptjs cost 10, HS256 7-day tokens with `sub` + `role`, race-free 409 `EMAIL_TAKEN` from E11000, one shared 401 body for bad credentials). `requireAuth` reads no database and honors `x-test-user` only in test mode. `requireAdmin` guards every `/api/admin/*` path through `router.use`.**

## Performance

- **Duration:** 3h37m wall clock. That includes a usage-limit pause between the RED commit and GREEN; active work was about 25 min.
- **Started:** 2026-11-04T08:51:56Z
- **Completed:** 2026-11-04T12:29:35Z
- **Tasks:** 2 (Task 1 tracer, Task 2 TDD)
- **Files modified:** 11 code/test files + REQUIREMENTS.md

## Accomplishments

- `parseRegisterInput` / `parseLoginInput`: every field must be a string, so `{ "$ne": null }` gets 400 before any query. Name is trimmed to 1-100 chars and email is trimmed and lowercased. Password must be at least 6 chars and at most 72 UTF-8 bytes (`"ư".repeat(40)` is rejected, `"a".repeat(72)` is accepted). `role` and unknown keys are never read.
- Auth service: hashes in the service, builds `{ name, email, passwordHash, role: "user" }` explicitly, and maps only E11000 to 409 `EMAIL_TAKEN`, with no pre-check. Login rejects empty or over-72-byte passwords before comparing, runs a dummy compare for unknown emails, and returns the same 401 `INVALID_CREDENTIALS` body in both cases.
- `requireAuth`: one `cfg.isTestMode` check. A present `x-test-user` wins and becomes `{ id: lowercase, role: "user" }` (invalid gives 401). Otherwise it needs a Bearer token verified with `algorithms: ["HS256"]`. An expired token gives "Phiên đăng nhập đã hết hạn" and anything else gives "Token không hợp lệ". `sub` must be an ObjectId and `role` must be user or admin. There is no MongoDB access.
- `createAdminRouter`: `router.use(auth.requireAuth, auth.requireAdmin)` before any route, mounted at `/api/admin`. Phase 2 adds reset/stats here.
- Tests: `npm test` 101/101 (adds validate.test and auth.test with both mode groups). `npm run test:int` 25/25 (adds integration/auth.test). `typecheck` and `build` pass.

## Task Commits

1. **Task 1 (tracer): register and log in over HTTP, get a 7-day JWT** - `8f05111` (feat). Tracer gate: interactive run, end-of-phase mode, automated-only verify. The verify re-run passed (typecheck, `npm test` 76/76, `npm run test:int` 25/25), so expansion continued with no checkpoint.
2. **Task 2 (TDD): requireAuth with x-test-user test mode and requireAdmin on /api/admin** - `778ee29` (test, RED), then `47148a5` (feat, GREEN). No refactor commit.

## TDD Gate Compliance (Task 2)

- **RED** (`778ee29`): `node --import tsx --test --test-reporter=tap test/auth.test.ts` exited 1, with 25 tests: 2 pass, 23 fail. The commit included a pass-through stub `createAuthMiddleware` and the `express.d.ts` augmentation, so the file loaded and failed on assertions. Target test "token user hợp lệ trên /api/admin/*: 403 FORBIDDEN" failed with `404 !== 403` (no admin router or guard yet). Classifier `check tdd-red-evidence`: `RED_EVIDENCE_OK` (`target_test_failed`, format tap). **Semantic assessment:** valid RED. The target ran and failed on its planned assertion for the intended reason (no guard). There were no load, syntax or fixture faults. The 2 passing tests are the "admin token reaches 404" cases, which a pass-through stub already satisfies.
- **GREEN** (`47148a5`): real middleware, admin router and `/admin` mount. auth.test 25/25, full `npm test` 101/101, `npm run test:int` 25/25, build OK.
- **REFACTOR:** none.

## Files Created/Modified

- `backend/src/utils/validate.ts` - string-only, byte-aware register/login input parsing
- `backend/src/services/auth.service.ts` - bcrypt + jsonwebtoken (default imports), register/login/signToken
- `backend/src/controllers/auth.controller.ts` - async handlers, no try/catch
- `backend/src/routes/auth.routes.ts` - POST /register, POST /login
- `backend/src/routes/admin.routes.ts` - guarded admin router
- `backend/src/routes/index.ts` - mounts `/auth` and `/admin` (shared `auth` built once)
- `backend/src/middlewares/auth.ts` - requireAuth / requireAdmin factory
- `backend/src/types/express.d.ts` - `req.user` typing
- `backend/test/validate.test.ts`, `backend/test/auth.test.ts`, `backend/test/integration/auth.test.ts` - unit and integration tests

## Decisions Made

- Login with an empty or over-72-byte password returns 401 `INVALID_CREDENTIALS` immediately. That is the plan's rule, extended to the empty password.
- `requireAdmin` without `req.user` returns 401 "Bạn chưa đăng nhập". This is a defensive branch, tested on a test-only route.
- A JSON primitive body is caught by `express.json` strict mode as 400 `INVALID_JSON` (consistent with 01-02). Missing, `{}` and `[]` bodies get 400 `VALIDATION_ERROR`.

## Deviations from Plan

None. The plan was executed as written. The extra tests (token without `sub`, malformed `Bearer a b`, an x-test-user header alongside a user token outside test mode, the 20-request concurrent role check, empty login password) only add cases to the planned matrix.

## Issues Encountered

- The RED test first failed typecheck: `HeadersInit` is a DOM type and `lib` is `ES2023` only. The test helper now takes `Record<string, string> | Array<[string, string]>`. This was fixed before the RED commit.
- The worktree guard blocks compound shell lines that mention git, so the plan-ledger file was not written. Base `1d4c8ab` was tracked in-session, and `commits: 3` was measured with `git rev-list --count 1d4c8ab..HEAD`.
- The temporary RED evidence record was written in the worktree for the classifier, then deleted (not committed).

## Known Stubs

None. The RED-step pass-through stub in `middlewares/auth.ts` was fully replaced in GREEN.

## User Setup Required

None.

## Next Phase Readiness

- Phase 2 can mount buy/orders behind `auth.requireAuth` (build `createAuthMiddleware(deps)` once in `createApiRouter`, as done here) and add `/sales/:id/reset` and `/sales/:id/stats` to `createAdminRouter`. Those routes inherit the guard.
- Phase 3 can log in as the seeded admin through `POST /api/auth/login` and use `x-test-user` under `npm run start:test`.
- Phase 4 can rely on `{ token, user: { id, name, email, role } }` from both register (201) and login (200).
- Accepted limitation (SPECS §7): tokens stay valid after a reseed until they expire. There is no revocation list.

## Self-Check: PASSED

- Commits on this branch: `8f05111`, `778ee29`, `47148a5` (all ancestors of HEAD; none carry a `Co-Authored-By` line).
- All 10 created files and `backend/src/routes/index.ts` exist.
- Plan verification re-run: `npm --prefix backend run typecheck` OK; `npm test` 101/101; `npm run test:int` 25/25; `npm run build` OK. The single-test-mode grep shows only `backend/src/config/env.ts:123`. `process.env` appears only in `backend/src/config/env.ts`. There are no named imports from jsonwebtoken.

---
*Phase: 01-foundation-infra-data-auth*
*Completed: 2026-11-04*
