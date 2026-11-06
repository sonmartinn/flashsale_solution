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
> Register built from the `<threat_model>` blocks of 01-01…01-08 PLAN.md (authored at plan time). Verified at ASVS L1 (grep depth) on 2026-11-06 after gap-closure plans 01-06…01-08 merged; full suite green (unit 149/149, integration 57/57).

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Host network → Docker services | MongoDB and Redis have no passwords; published on 127.0.0.1 only | All application data |
| HTTP client → Express API | Untrusted request bodies, params and headers | Credentials, JWTs, ids, JSON bodies |
| Environment / `.env` → config | Process configuration read once in `config/env.ts` | `JWT_SECRET`, Mongo URI, `NODE_ENV` |
| Developer CLI → seed/reset | Destructive operations on the configured databases | Database targets, sale ids |
| npm registry → backend | Third-party packages | Supply chain |

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
| T-01-26 | Denial of service | npm run start:test | medium | mitigate | `node --env-file=.env.test` (package.json:14); test:int proves test mode | closed |
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
| T-01-SC | Tampering | npm installs | high | mitigate | Human legitimacy checkpoint (01-01-T1); lockfile committed; later plans only `npm ci` | closed |

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

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-06 | 37 | 37 | 0 | secure-phase (orchestrator, L1 grep verification) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-11-06
