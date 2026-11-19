---
phase: "1"
slug: "foundation-infra-data-auth"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-11-06"
---

# Phase 1 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Register built from the `<threat_model>` blocks of 01-01…01-09 PLAN.md (authored at plan time). Verified at ASVS L1 (grep depth) on 2026-11-06 after gap-closure plans 01-06…01-08 merged (unit 149/149, integration 57/57), and re-verified on 2026-11-07 after gap-closure plan 01-09 merged (T-01-37…T-01-41 added, T-01-26 evidence updated; typecheck clean, unit 151/151, integration 59/59), and again on 2026-11-07 after gap-closure plan 01-10 merged (T-01-42…T-01-45 added, T-01-40 and T-01-SC evidence updated; typecheck clean, unit 154/154, integration 59/59).

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Host network → Docker services | MongoDB and Redis have no passwords; published on 127.0.0.1 only | All application data |
| HTTP client → Express API | Untrusted request bodies, params and headers | Credentials, JWTs, ids, JSON bodies |
| Environment / `.env` → config | Process configuration read once in `config/env.ts` | `JWT_SECRET`, Mongo URI, `NODE_ENV` |
| Developer CLI → seed/reset | Destructive operations on the configured databases | Database targets, sale ids |
| npm registry → backend | Third-party packages | Supply chain |
| Parent shell → `start:test` wrapper → server | Shell variables reach the server; the wrapper applies the committed `.env.test` over the shell for `NODE_ENV` only (01-09) | `NODE_ENV` |
| Test suite → spawned process trees | Tests spawn a dotenv wrapper plus a server and must stop exactly the tree they spawned (01-09) | Process signals, ports |
| Developer terminal → `backend/.env` | Secret file created by hand on each machine; never printed or committed (01-09) | `JWT_SECRET` |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-01-01 | Information disclosure | docker-compose.yml ports | high | mitigate | `127.0.0.1:27018:27017` and `127.0.0.1:6379:6379` (docker-compose.yml:10) | closed |
| T-01-02 | Tampering | config/env.ts parseMongoUri | high | mitigate | `WINDOWS_MONGO_PORT = 27017` refusal + db-name check (backend/src/config/env.ts:42) | closed |
| T-01-03 | Spoofing | JWT_SECRET handling | high | mitigate | No default in env.ts; `backend/.env` git-ignored (`git check-ignore`) | closed |
| T-01-04 | Denial of service | health.controller pings | medium | mitigate | `pingMongo(1000)`, `pingRedis(…, 1000)`; 503 when either fails (health.controller.ts:17-18) | closed |
| T-01-05 | Spoofing | port 5000 bind on Windows | medium | mitigate | `isPortFree` probe before connect (server.ts:8) + EADDRINUSE handling | closed |
| T-01-06 | Information disclosure | GET /api/health body | low | accept | See Accepted Risks AR-01 | closed |
| T-01-07 | Denial of service | boot against dead stores | low | mitigate | `serverSelectionTimeoutMS` 5 s (config/db.ts:7); Redis 5 s startup deadline (T-01-33) | closed |
| T-01-08 | Information disclosure | middlewares/error.ts 500 branch | high | mitigate | Generic message + `INTERNAL_ERROR` only (error.ts:54) | closed |
| T-01-09 | Tampering | ObjectId inputs | medium | mitigate | `normalizeObjectId` 24-hex; CastError → 400 `INVALID_ID` (error.ts:30) | closed |
| T-01-10 | Denial of service | express.json body size | low | mitigate | Default 100 kB limit; body-parser 4xx (413) status preserved (error.ts:47) | closed |
| T-01-11 | Tampering | missing unique indexes at boot | high | mitigate | autoIndex/autoCreate off + awaited `ensureIndexes()` before listen (config/db.ts:8) | closed |
| T-01-12 | Tampering | seed.service dropDatabase / flushdb | high | mitigate | `loadBaseConfig` guards; FLUSHDB only on configured index (seed.service.ts:133) | closed |
| T-01-13 | Tampering | sale-admin.service multi() | medium | mitigate | Every `exec()` pair checked (sale-admin.service.ts:71) | closed |
| T-01-14 | Information disclosure | seed summary prints matkhau123 | low | accept | See Accepted Risks AR-02 | closed |
| T-01-15 | Tampering | reset --sale argument | low | mitigate | `normalizeObjectId` in `parseResetArgs` (scripts/cli-args.ts:84) and service (sale-admin.service.ts:41) | closed |
| T-01-16 | Repudiation | stale in-process cache after CLI reset | low | mitigate | `[CẢNH BÁO]` cache warning printed by every reset run (scripts/reset.ts:15) | closed |
| T-01-17 | Elevation of privilege | register role mass assignment | high | mitigate | `role: "user"` set explicitly (auth.service.ts:59) | closed |
| T-01-18 | Tampering | NoSQL operator injection | high | mitigate | `typeof value !== "string"` → 400 (utils/validate.ts:37) | closed |
| T-01-19 | Spoofing | JWT verification | high | mitigate | HS256 pinned (middlewares/auth.ts:46) | closed |
| T-01-20 | Spoofing | x-test-user header | high | mitigate | Honored only under `cfg.isTestMode` (middlewares/auth.ts:27) | closed |
| T-01-21 | Elevation of privilege | /api/admin/* | high | mitigate | `requireAuth` + `requireAdmin` on the whole admin router (admin.routes.ts) | closed |
| T-01-22 | Information disclosure | login user enumeration | medium | mitigate | Dummy bcrypt compare + identical 401 (auth.service.ts:36); register 409 per SPECS — AR-03 | closed |
| T-01-23 | Tampering | bcrypt 72-byte truncation | medium | mitigate | UTF-8 byte limit (utils/validate.ts:21) | closed |
| T-01-24 | Denial of service | bcrypt cost on login floods | low | accept | See Accepted Risks AR-04 | closed |
| T-01-25 | Spoofing | env.ts isTestMode | high | mitigate | Exact `env["NODE_ENV"] === "test"` (env.ts:139); the only `"test"` equality in backend/src | closed |
| T-01-26 | Denial of service | npm run start:test | medium | mitigate | `dotenv run -q --override -f .env.test -- node dist/server.js` (package.json:14, 01-09 replaced Node's env-file flag); test:int proves test mode, also with an inherited NODE_ENV `"test "` (health.test G-01-9) | closed |
| T-01-27 | Repudiation | health + banner test-mode observability | high | mitigate | `testMode` in health body (health.controller.ts:10), JSON-quoted banner, near-miss warning | closed |
| T-01-28 | Elevation of privilege | env.ts near-miss flag | high | mitigate | `testModeNearMiss` feeds only a warning; decision line unchanged (env.ts:34) | closed |
| T-01-29 | Information disclosure | health body, boot banner | low | accept | See Accepted Risks AR-05 | closed |
| T-01-30 | Tampering | app.ts empty declared-JSON body | medium | mitigate | `rejectEmptyJson` verify guard → 400 `INVALID_JSON` (app.ts:28) | closed |
| T-01-31 | Denial of service | body-less POST clients (Phases 2-4) | medium | mitigate | Client rule recorded in 01-CONTEXT.md:84; errors.test pins body-less routing | closed |
| T-01-32 | Denial of service | verify hook on every JSON request | low | accept | See Accepted Risks AR-06 | closed |
| T-01-33 | Denial of service | connectRedis silent Redis | medium | mitigate | `REDIS_STARTUP_TIMEOUT_MS = 5000` (config/redis.ts:46) | closed |
| T-01-34 | Repudiation | startup diagnostics on stderr | low | mitigate | Runtime log armed after connect; exact line-count tests (boot, redis-boot) | closed |
| T-01-35 | Information disclosure | ioredis unhandled-error stack | low | mitigate | Silent error listener from creation (config/redis.ts:19) | closed |
| T-01-36 | Denial of service | integration tests vs shared containers | medium | mitigate | Unused port 6390, fake TCP servers, proxy (test/boot.test.ts:3) | closed |
| T-01-37 | Elevation of privilege | `start:test` (`dotenv run --override`) | medium | mitigate | Override only from the committed `.env.test` (unchanged by 01-09); plain `start` = `node dist/server.js` never loads it (package.json:13); single raw `"test"` comparison stays env.ts:139; `process.env` read only in env.ts | closed |
| T-01-38 | Denial of service | orphaned server under the start:test wrapper | medium | mitigate | `killProcessTree` → `taskkill /pid <child> /T /F` on Windows (test/helpers.ts:187-190), used on timeout and `stop()` (helpers.ts:239, 381); health.test waits for `isPortFree(port)` after stop (health.test.ts:189) | closed |
| T-01-39 | Tampering | killProcessTree signalling a reused PID | low | mitigate | Returns early when `child.exitCode !== null \|\| child.signalCode !== null` (test/helpers.ts:188) | closed |
| T-01-40 | Repudiation | start:test stderr diagnostics | low | mitigate | `-q` in START_TEST_SCRIPT (test/helpers.ts:137), which the launcher argv is now derived from (`startTestArgv`, helpers.ts:174; `serverArgv` returns it, helpers.ts:214); 01-10 M2 mutation (drop `-q` in both places) turns this case red; boot.test start:test case asserts exit 1 with exactly one `[LỖI]` line (boot.test.ts:100) | closed |
| T-01-41 | Information disclosure | `backend/.env` creation and env-source checks | medium | mitigate | `.env.example` header command writes the 32-byte key straight into the file with `flag:'wx'` (line 4); `JWT_SECRET=` stays empty (line 16); presence checks print names only (01-VERIFICATION.md `human_verification`); `.env` ignored (.gitignore:3); no 01-09 commit touches `backend/.env` | closed |
| T-01-SC | Tampering | npm installs | high | mitigate | Human legitimacy checkpoint (01-01-T1); lockfile committed; later plans only `npm ci`; 01-09 adds no package (dotenv CLI ships with dotenv 18.0.9, lockfile unchanged); 01-10 adds no package (`git log 354162c..HEAD -- backend/package.json backend/package-lock.json` empty; worktree used `npm ci` only) | closed |
| T-01-42 | Tampering | test/helpers.ts serverArgv/startTestArgv (start:test drift guard) | medium | mitigate | `serverArgv("start:test")` returns `startTestArgv(START_TEST_SCRIPT)` (helpers.ts:214); build.test pins package.json to the constant and the constant to the argv token by token (build.test.ts:42, :55); 01-10 M1 mutation (drop `--override` in both places) turns the G-01-9 case red (health.test.ts:155) | closed |
| T-01-43 | Spoofing | startTestArgv replaying a script it cannot represent | low | mitigate | Token allowlist `/^[A-Za-z0-9._/=-]+$/` (helpers.ts:155); pre-step must be exactly `npm run build` (helpers.ts:184); first token dotenv and `dist/server.js` required; build.test rejects four shapes with `assert.throws` (build.test.ts:69-82) | closed |
| T-01-44 | Tampering | 01-10 Task 2 mutations left in the tree | medium | mitigate | Restored with `git checkout`; `git diff --quiet -- backend` exit 0 recorded in 01-10-SUMMARY; `git log --format= --name-only 354162c..HEAD -- backend/src backend/scripts backend/package.json` prints nothing; start:test unchanged (helpers.ts:137) | closed |
| T-01-45 | Denial of service | Server processes left by the mutation runs | low | accept | See AR-07; killProcessTree acts only on the helper's own child (helpers.ts:224-227); unbounded wait when taskkill fails is REVIEW WR-01 (open in 01-REVIEW-DISPOSITION.md) | closed |

*Status: open · closed · open — below {block_on} threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-01 | T-01-06 | Health exposes only booleans, `nodeEnv`, `maxPoolSize`; localhost dev server (D-17) | Plan 01-01 threat model | 2026-11-04 |
| AR-02 | T-01-14 | `matkhau123` is a throwaway shared test credential, printed on purpose as the demo/load-test handoff (D-08) | Plan 01-03 threat model | 2026-11-04 |
| AR-03 | T-01-22 | Register 409 `EMAIL_TAKEN` reveals account existence because SPECS requires it | Plan 01-04 threat model | 2026-11-04 |
| AR-04 | T-01-24 | No login rate limiting — out of scope per REQUIREMENTS; localhost course project | Plan 01-04 threat model | 2026-11-04 |
| AR-05 | T-01-29 | `testMode` boolean and raw `NODE_ENV` string in health/banner; no secret involved, 127.0.0.1 only | Plan 01-06 threat model | 2026-11-05 |
| AR-06 | T-01-32 | One Buffer length check per JSON request; identical for V0/V1/V2 so E2 stays fair | Plan 01-07 threat model | 2026-11-05 |
| AR-07 | T-01-45 | Mutation runs reuse the regular suite helpers; health.test asserts the port is freed; the taskkill-failure wait is tracked as REVIEW WR-01 | Plan 01-10 threat model | 2026-11-07 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-06 | 37 | 37 | 0 | secure-phase (orchestrator, L1 grep verification) |
| 2026-11-07 | 42 | 42 | 0 | secure-phase (orchestrator, L1 grep verification after 01-09) |
| 2026-11-07 | 46 | 46 | 0 | secure-phase (orchestrator, L1 grep verification after 01-10) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-11-06; re-verified 2026-11-07 after 01-09 and again after 01-10

*Note (non-blocking, outside the register):* `backend/.env.example` line 15 still carries the older 01-01 comment that generates a key with `console.log(...)`, which prints it in the developer's own terminal. Plan 01-09 deliberately changed nothing below its new header. The header command (line 4) is the documented path and never prints the key.

## Security Audit 2026-11-07

| Metric | Count |
|---|---|
| Threats found | 42 |
| Closed | 42 |
| Open | 0 |

## Security Audit 2026-11-07

| Metric | Count |
|---|---|
| Threats found | 46 |
| Closed | 46 |
| Open | 0 |
