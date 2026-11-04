---
phase: 01-foundation-infra-data-auth
verified: 2026-11-04T16:30:00Z
status: human_needed
score: 49/53 must-haves verified
covered_files:
  - .planning/phases/01-foundation-infra-data-auth/01-01-PLAN.md
  - .planning/phases/01-foundation-infra-data-auth/01-01-SUMMARY.md
  - .planning/phases/01-foundation-infra-data-auth/01-02-PLAN.md
  - .planning/phases/01-foundation-infra-data-auth/01-02-SUMMARY.md
  - .planning/phases/01-foundation-infra-data-auth/01-03-PLAN.md
  - .planning/phases/01-foundation-infra-data-auth/01-03-SUMMARY.md
  - .planning/phases/01-foundation-infra-data-auth/01-04-PLAN.md
  - .planning/phases/01-foundation-infra-data-auth/01-04-SUMMARY.md
  - .planning/phases/01-foundation-infra-data-auth/01-05-PLAN.md
  - .planning/phases/01-foundation-infra-data-auth/01-05-SUMMARY.md
  - backend/.env.example
  - backend/package-lock.json
  - backend/package.json
  - backend/scripts/cli-args.ts
  - backend/scripts/reset.ts
  - backend/scripts/seed.ts
  - backend/src/app.ts
  - backend/src/config/db.ts
  - backend/src/config/env.ts
  - backend/src/config/redis.ts
  - backend/src/controllers/auth.controller.ts
  - backend/src/controllers/health.controller.ts
  - backend/src/lua/buy.lua
  - backend/src/middlewares/auth.ts
  - backend/src/middlewares/error.ts
  - backend/src/models/flash-sale.ts
  - backend/src/models/index.ts
  - backend/src/models/order.ts
  - backend/src/models/product.ts
  - backend/src/models/stock-movement.ts
  - backend/src/models/user.ts
  - backend/src/routes/admin.routes.ts
  - backend/src/routes/auth.routes.ts
  - backend/src/routes/index.ts
  - backend/src/server.ts
  - backend/src/services/auth.service.ts
  - backend/src/services/sale-admin.service.ts
  - backend/src/services/seed.service.ts
  - backend/src/types/express.d.ts
  - backend/src/utils/fail.ts
  - backend/src/utils/http-error.ts
  - backend/src/utils/object-id.ts
  - backend/src/utils/port.ts
  - backend/src/utils/validate.ts
  - backend/src/utils/with-timeout.ts
  - backend/test/auth.test.ts
  - backend/test/boot.test.ts
  - backend/test/build.test.ts
  - backend/test/cli-args.test.ts
  - backend/test/config.test.ts
  - backend/test/errors.test.ts
  - backend/test/helpers.ts
  - backend/test/integration/auth.test.ts
  - backend/test/integration/health.test.ts
  - backend/test/integration/models.test.ts
  - backend/test/integration/reset.test.ts
  - backend/test/integration/seed.test.ts
  - backend/test/object-id.test.ts
  - backend/test/validate.test.ts
  - backend/tsconfig.build.json
  - backend/tsconfig.json
  - docker-compose.yml
covered_digest: "v4:sha256:9a3f2003d463375bd926e96be4779f4d37388b214fa1d5c2ff801adc25253475"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 40/46
  gaps_closed:
    - "Only when cfg.isTestMode is true (NODE_ENV exactly \"test\") does x-test-user win (01-04.12, AUTH-05, ROADMAP SC5). isTestMode is now `env[\"NODE_ENV\"] === \"test\"` on the raw value; \"test \", \" test\", \"test\\t\" and 8 other near-miss values give false (config.test matrix and auth.test end-to-end 401, both run green by the verifier)"
  gaps_remaining: []
  regressions: []
deferred:
  - truth: "DATA-04 'xóa cache đợt sale': reset clears the server's in-process sale cache"
    addressed_in: "Phase 2"
    evidence: "Phase 2 SC4: 'all modes share one order-creation path and one static sale cache that reset clears'. Phase 1 provides the seam: createSaleAdminService({ onSaleReset }) calls the hook once per successful reset."
  - truth: "Admin reset over HTTP (POST /api/admin/sales/:id/reset) using the shared reset service"
    addressed_in: "Phase 2"
    evidence: "Phase 2 SC5: 'An admin can reset a sale over HTTP (optionally switching mode) and read stats'"
  - truth: "Load-test preflight correctly detects that the server is in test mode (D-17 purpose of health nodeEnv; affected by REVIEW CR-01)"
    addressed_in: "Phase 3"
    evidence: "Phase 3 SC1: 'It reports INVALID instead of a result if the server is not in test mode ... or any 401 appears'"
coincidental_reliance_items:
  - truth: "npm run start:test still runs in test mode: node --env-file=.env.test (CRLF checkout) yields NODE_ENV exactly \"test\" (01-05 truth 6)"
    reason: undeclared-precondition
    harden: "The exact comparison relies on Node's --env-file loader stripping the CR of the CRLF checkout (`git ls-files --eol`: w/crlf). Verified only on Node 24.22.1 (REVIEW IN-02). Declare it: add `backend/.env.test text eol=lf` to .gitattributes, or note in README that the suite was run on Node 24."
human_verification:
  - test: "Decide on REVIEW CR-01 (open, rated critical by the reviewer): with NODE_ENV=\"test \" the banner and GET /api/health report nodeEnv \"test\" while isTestMode is false and no CHẾ ĐỘ TEST warning is printed"
    expected: "Either (a) accept for Phase 1, since 01-05 truth 5 mandates this exact behaviour, it fails closed, and Phase 3 SC1 already makes E1 INVALID when any 401 appears, and have the Phase 3 harness not rely on nodeEnv alone; or (b) require a small fix now: add `testMode: cfg.isTestMode` to the health body, make nodeEnv show the raw value (or warn on a near-miss NODE_ENV), and change config.test 'nodeEnv vẫn trim để hiển thị...' plus health.test accordingly"
    why_human: "Behaviour is confirmed (verifier: loadBaseConfig({NODE_ENV:'test '}) gives nodeEnv 'test', isTestMode false). It breaks no Phase 1 roadmap SC or requirement, but it weakens the D-17 contract ('nodeEnv lets the Phase 3 harness confirm test mode'), and fixing it means changing a 01-05 must-have. That is a project decision."
  - test: "Bad-boot matrix on the real dev setup (deferred end-of-phase check from 01-01 Task 3): (a) blank JWT_SECRET in backend/.env, (b) Docker Desktop stopped, (c) only flashsale-redis stopped, (d) another process holding port 5000. Run `npm run start` from backend/ each time"
    expected: "Each case exits with code 1 and a single Vietnamese `[LỖI] ...` line naming the cause (JWT_SECRET / MongoDB 127.0.0.1:27018/flashsale / Redis 127.0.0.1:6379 / Cổng 5000 đang bị chiếm). No stack trace, and the secret is never printed"
    why_human: "Requires stopping Docker containers / Docker Desktop, which the verifier must not do. Automated equivalents (boot.test, health.test, earlier verifier spot-checks with dead ports) pass, but the real docker-stop path was not exercised."
  - test: "Health transition: with the backend running, `docker stop flashsale-redis`, GET /api/health, then `docker start flashsale-redis` and GET /api/health again (repeat for flashsale-mongo)"
    expected: "200 { mongo: true, redis: true } -> 503 with redis:false answered in under 3 s -> 200 again after the container is back, without restarting the backend"
    why_human: "Runtime reconnect behaviour across a real container stop/start is not covered by any test."
  - test: "Decide on the empty-JSON-body deviation (01-02 truth: 'an empty, malformed or JSON-primitive body yields 400 INVALID_JSON')"
    expected: "Either accept via override (body-parser 2.x parses an empty JSON body to {}, which reaches routing and never yields 500, and is needed for body-less POSTs in Phase 2), or require a change"
    why_human: "The plan's must-have wording is not met; the executor documented it as intentional. Roadmap SC5 / INFRA-05 do not require it. Needs a project decision."
  - test: "Decide on login with blank strings (01-04 truth lists 'blank strings' among inputs that return 400 for register OR login)"
    expected: "Either accept via override (login with password '' returns 401 INVALID_CREDENTIALS, exactly as the 01-04 plan action and D-12 prescribe), or require 400"
    why_human: "The must-have truth and the plan's own action text contradict each other, and the code follows the action text. Register fully meets the truth."
  - test: "Backstop truth (01-02): orders index userId_1_createdAt_-1 backs newest-first listing; equal-createdAt order unspecified"
    expected: "Confirm acceptable: the index exists (observed in a freshly seeded DB) but no Phase 1 query consumes it; sort stability is owned by Phase 2 READ-04"
    why_human: "verification: backstop (non-inferable); presence of the index is not behavioural evidence"
  - test: "Backstop truth (01-04): requireAdmin holds no shared mutable state, so concurrent admin/user requests cannot leak a role"
    expected: "Confirm acceptable: requireAdmin is a pure closure reading only req.user; executor test 'request admin và user đồng thời không lẫn quyền của nhau' passes"
    why_human: "verification: backstop; the only test is executor-authored, not held-out"
  - test: "Prohibition review (flagged, non-authoritative LLM-judge verdicts): (1) JWT_SECRET never printed; (2) no per-request logging middleware; (3) MongoDB/Redis ports bound to 127.0.0.1 only; (4) seed only FLUSHDB on the configured db, never FLUSHALL; (5) reset CLI always prints the in-process cache warning"
    expected: "All five hold (see Prohibitions table)"
    why_human: "Judgment-tier items need human resolution; items 3-5 are test-tier with no wired automated test (the verifier observed them directly), so they fail closed to 'flagged'"
---

# Phase 1: Foundation (Infra, Data, Auth) Verification Report

**Phase Goal:** A developer can bring up MongoDB and Redis, boot a backend that fails fast on bad configuration, seed and reset a fashion flash sale, and authenticate with JWT (or with `x-test-user` in test mode)
**Verified:** 2026-11-04T16:30:00Z
**Status:** human_needed
**Re-verification:** Yes, after gap closure (plan 01-05)

## What changed since the previous verification

`git diff 867b4a6 HEAD --stat -- backend docker-compose.yml` shows only 3 files: `backend/src/config/env.ts` (+5/-2), `backend/test/auth.test.ts` (+35), `backend/test/config.test.ts` (+39). Everything else has the same content as when it was fully verified, so passed items got a regression check only.

## Evidence the verifier produced itself (not from SUMMARY)

- `npm run typecheck`: exit 0.
- `npm test` (includes `npm run build`): **133/133 pass**. That is 126 before plus the 7 new cases: 4 in auth.test "NODE_ENV thô quyết định x-test-user" and 3 in config.test.
- `npm run test:int`: **46/46 pass**. This includes health.test "chạy với --env-file=.env.test (giống npm run start:test) > health báo nodeEnv test và server in cảnh báo CHẾ ĐỘ TEST". That warning is printed only when `cfg.isTestMode` is true, so the real `start:test` path is still in test mode after the exact match.
- Direct probe of `loadBaseConfig`: `"test"` gives `isTestMode true, nodeEnv test`. `"test "` gives `false, test`. `"test\r"` gives `false, test`. `"Test"` gives `false, Test`. Unset gives `false, development`.
- Single-site invariant: `grep process.env|NODE_ENV|isTestMode backend/src` finds NODE_ENV read only in `config/env.ts` (line 122 display, line 126 raw comparison). The only consumers of `isTestMode` are `middlewares/auth.ts:29` and `server.ts:56`.
- `gsd verify.artifacts 01-05-PLAN.md`: 3/3 pass. `verify.key-links`: 2/2 verified.
- Regression: `docker ps` shows flashsale-mongo `mongo:7.0` and flashsale-redis `redis:7.4`, both healthy, bound to `127.0.0.1:27018` and `127.0.0.1:6379`. `CONFIG GET appendfsync` = `everysec`. `backend/dist/server.js` and `dist/lua/buy.lua` are present.
- `git ls-files --eol backend/.env.test`: `i/lf w/crlf`, so it is a CRLF checkout on this machine. It still gives NODE_ENV exactly `"test"` on Node 24 (see coincidental-reliance item).

## Goal Achievement

### Roadmap Success Criteria (contract)

| # | Success Criterion | Status | Evidence |
|---|---|---|---|
| SC1 | Docker brings up Mongo 7 @127.0.0.1:27018 and Redis 7 AOF everysec @127.0.0.1:6379, healthy; health 200 when both up, 503 when either down | ✓ VERIFIED | docker ps / CONFIG GET (re-checked); health.test 200 and 503 pass. The real container stop/start transition is a human item |
| SC2 | Exits with Vietnamese message on missing JWT_SECRET / Mongo or Redis unreachable / port 5000 taken; never 27017; prints maxPoolSize; typecheck + build pass; dist/lua exists | ✓ VERIFIED | Unchanged code; boot.test passes in this run; typecheck and build exit 0; dist/lua present |
| SC3 | `npm run seed` (qty, mode) wipes + creates 1000 users + 1 admin, 6 products, 1 active 7-day half-price sale, stock loaded; every §6 index | ✓ VERIFIED | Unchanged code; seed.test passes; previous verifier CLI run on a scratch DB |
| SC4 | `npm run reset` (one/all, --mode) restores, deletes, one checked multi(), reopens 7 days, warns about cache | ✓ VERIFIED | Unchanged code; reset.test passes; previous verifier CLI run |
| SC5 | Register/login/JWT, 401/403, `x-test-user` only when `NODE_ENV === "test"`, §7 errors, no 500 leak | ✓ VERIFIED (gap closed) | `env.ts:126` `const isTestMode = env["NODE_ENV"] === "test";`. auth.test end to end: "test" gives 403 (header honoured as user), and "test ", " test", "test\t" give 401 "Bạn chưa đăng nhập". The other clauses are unchanged and their tests pass |

### Plan Must-Have Truths

01-01 through 01-04 were fully verified previously. The code behind them is unchanged except `env.ts`, and all their tests pass in this run. Rows are abridged. The full evidence is in the earlier report (commit 867b4a6).

| # | Truth (abridged) | Status | Evidence |
|---|---|---|---|
| 01-01.1–8 | compose, AOF, typecheck/build, health 200/503 bounded, fail-fast, banner, .env files | ✓ VERIFIED (8) | regression: tests green; docker/AOF re-checked |
| 01-02.1, .3–.9, .11 | error table, utf-8, collection names, indexes, no min, unique pair, orderId null, email lowercase, index-before-listen | ✓ VERIFIED (9) | regression: errors.test, models.test green |
| 01-02.2 | plain Error → 500 no leak; **empty**, malformed, primitive body → 400 INVALID_JSON | ? UNCERTAIN | empty body is parsed to `{}` (documented deviation). Human decision / override |
| 01-02.10 | (backstop) userId_1_createdAt_-1 backs newest-first | ⚠️ insufficient_spec | human item |
| 01-03.1–10 | seed + reset semantics, CLI args, warning on both paths | ✓ VERIFIED (10) | regression: seed.test, reset.test, cli-args.test green |
| 01-04.1, .2, .4–.10 | register/login/JWT, validation limits, dup 409, concurrency, uniform 401, requireAuth, admin guard | ✓ VERIFIED (9) | regression: auth tests green |
| 01-04.3 | register **or login** with blank strings → 400 | ? UNCERTAIN | login blank password → 401 per plan action/D-12. Human decision / override |
| 01-04.11 | (backstop) requireAdmin no shared state | ⚠️ insufficient_spec | human item |
| 01-04.12 | x-test-user only when NODE_ENV **exactly** "test" | ✓ VERIFIED (gap closed) | raw comparison at env.ts:126; config.test matrix + auth.test e2e green |
| 01-05.1 | raw untrimmed NODE_ENV exactly "test" → header wins; "test ", " test", "test\t" → ignored | ✓ VERIFIED | env.ts:126; verifier probe; tests green |
| 01-05.2 | end to end loadBaseConfig → createApp → requireAuth: "test" → 403, padded → 401 "Bạn chưa đăng nhập" | ✓ VERIFIED | auth.test 4 cases pass (run by verifier) |
| 01-05.3 | exact UTF-16 equality: 11 near-miss values (whitespace, \r, \n, NBSP, BOM, case, Cyrillic e) false, only "test" true | ✓ VERIFIED | config.test "isTestMode chỉ bật khi NODE_ENV đúng chính xác..." passes; list matches the truth exactly |
| 01-05.4 | unset / "" / "   " → isTestMode false, nodeEnv "development" | ✓ VERIFIED | config.test case passes; verifier probe (unset) |
| 01-05.5 | nodeEnv keeps trimmed display; other outputs unchanged; CHẾ ĐỘ TEST warning depends only on isTestMode | ✓ VERIFIED | env.ts:122 unchanged expression; server.ts:56 `if (cfg.isTestMode)`. See CR-01 warning: this behaviour is what the reviewer flagged |
| 01-05.6 | npm run start:test still in test mode via CRLF .env.test | ✓ VERIFIED (coincidental-reliance) | health.test env-file case passes (warning printed, so isTestMode is true). Relies on Node 24's loader stripping CR |
| 01-05.7 | single-site: only test-mode comparison in src is env.ts; process.env read only there | ✓ VERIFIED | grep over backend/src |

**Score:** 49/53 truths verified (0 present-behavior-unverified; 2 insufficient_spec backstops and 2 uncertain plan-wording deviations, all routed to human decision)

### Deferred Items

| # | Item | Addressed In | Evidence |
|---|---|---|---|
| 1 | Reset clears the server's in-process sale cache (DATA-04 last clause) | Phase 2 | SC4 "one static sale cache that reset clears"; the `onSaleReset` seam exists and is called once |
| 2 | Admin reset via HTTP | Phase 2 | SC5 "An admin can reset a sale over HTTP" |
| 3 | Preflight must detect test mode reliably (CR-01 consequence) | Phase 3 | SC1 "reports INVALID ... if the server is not in test mode ... or any 401 appears" |

### Advisory (New Scope, Unevidenced)

None. The one new-scope finding (REVIEW CR-01) has deterministic evidence from the verifier's own probe, so it is reported as a Warning plus a human decision, not as an advisory.

### Required Artifacts

| Artifact | Status | Details |
|---|---|---|
| `backend/src/config/env.ts` | ✓ VERIFIED | contains `env["NODE_ENV"] === "test"`; nodeEnv trimmed for display |
| `backend/test/config.test.ts` | ✓ VERIFIED | exactness matrix (contains `u00a0`), empty/whitespace case, display case |
| `backend/test/auth.test.ts` | ✓ VERIFIED | `configFromNodeEnv` → `loadBaseConfig` → `startApp`; 4 HTTP cases |
| All 01-01..01-04 artifacts | ✓ VERIFIED (regression) | unchanged since previous full verification; their tests are green |

### Key Link Verification

| From | To | Via | Status |
|---|---|---|---|
| middlewares/auth.ts | config/env.ts | `cfg.isTestMode` (now raw comparison) | ✓ WIRED |
| test/auth.test.ts | config/env.ts | `loadBaseConfig({ MONGODB_URI, REDIS_URL, NODE_ENV })` → `startApp({ cfg })` | ✓ WIRED |
| server.ts | config/env.ts | `if (cfg.isTestMode)` warning; banner `cfg.nodeEnv` | ✓ WIRED |
| health.controller.ts | config/env.ts | `nodeEnv: deps.cfg.nodeEnv` (trimmed; see CR-01) | ✓ WIRED |
| All 01-01..01-04 links | | | ✓ WIRED (unchanged) |

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Real data | Status |
|---|---|---|---|---|
| requireAuth x-test-user branch | `cfg.isTestMode` | raw `env["NODE_ENV"]` read once in loadBaseConfig | yes | ✓ FLOWING |
| GET /api/health | mongo, redis, nodeEnv | live pings; trimmed NODE_ENV | yes | ✓ FLOWING (nodeEnv can diverge from isTestMode, CR-01) |
| POST /api/auth/*, seed summary, reset result | as before | real Mongo/Redis | yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Typecheck | `npm run typecheck` | exit 0 | ✓ PASS |
| Unit + build | `npm test` | 133/133 | ✓ PASS |
| Integration | `npm run test:int` | 46/46 | ✓ PASS |
| Test-mode exactness | `loadBaseConfig({..., NODE_ENV})` for "test", "test ", "test\r", "Test", unset | true / false / false / false / false | ✓ PASS |
| start:test still in test mode | health.test `--env-file=.env.test` case | nodeEnv test + CHẾ ĐỘ TEST warning | ✓ PASS |
| Display vs flag divergence | `loadBaseConfig({NODE_ENV:"test "})` | nodeEnv "test", isTestMode false | ⚠️ as designed by 01-05.5; CR-01 |

### Probe Execution

Step 7c: SKIPPED. No `scripts/*/tests/probe-*.sh` exist and no plan declares a probe.

### Requirements Coverage

| Requirement | Source Plan | Status | Evidence |
|---|---|---|---|
| INFRA-01 | 01-01 | ✓ SATISFIED | compose, docker port, CONFIG GET (re-checked) |
| INFRA-02 | 01-01 | ✓ SATISFIED | strict NodeNext, scripts, build copies lua |
| INFRA-03 | 01-01 | ✓ SATISFIED | boot.test; earlier spot-checks |
| INFRA-04 | 01-01 | ✓ SATISFIED | health 200/503 |
| INFRA-05 | 01-02 | ✓ SATISFIED | §7 mapping (empty-body wording deviation is plan-level only) |
| INFRA-06 | 01-01 | ✓ SATISFIED | maxPoolSize explicit + printed |
| DATA-01 | 01-02 | ✓ SATISFIED | models, indexes |
| DATA-02 | 01-02, 01-03 | ✓ SATISFIED | ensureIndexes before listen/insert |
| DATA-03 | 01-03 | ✓ SATISFIED | seed |
| DATA-04 | 01-03 | ✓ SATISFIED (cache clause deferred to Phase 2) | reset service |
| DATA-05 | 01-03 | ✓ SATISFIED | CLI warning |
| AUTH-01 | 01-04 | ✓ SATISFIED | register tests |
| AUTH-02 | 01-04 | ✓ SATISFIED | JWT tests |
| AUTH-03 | 01-04 | ✓ SATISFIED | requireAuth tests |
| AUTH-04 | 01-04 | ✓ SATISFIED | router.use guard tests |
| AUTH-05 | 01-04, 01-05 | ✓ SATISFIED (was PARTIAL) | exact raw `NODE_ENV === "test"` at a single site; ObjectId check, lowercase, role user, admin needs a real token |

No orphaned requirements: all 16 IDs mapped to Phase 1 in REQUIREMENTS.md are claimed by a plan. The traceability table in REQUIREMENTS.md still says "Gaps Found" for all 16, so the orchestrator should update it.

### Prohibitions

| Prohibition | Tier | Disposition | Evidence |
|---|---|---|---|
| No connection to 27017 (explicit or implicit) | test | ✓ VERIFIED | config.test + boot.test green |
| Ports only on 127.0.0.1 | test | flagged (no wired test) | compose file + `docker port` observed 127.0.0.1 only |
| JWT_SECRET never printed | judgment | flagged (LLM-judge: holds) | no code path logs it; health.test asserts absence in banner |
| No per-request logging middleware | judgment | flagged (LLM-judge: holds) | app.ts mounts only cors, json, router, notFound, errorHandler |
| remainingQty no min/clamp | test | ✓ VERIFIED | models.test -5 saves |
| Seed drops only named DB, FLUSHDB only | test | flagged (no wired test for "other dbs untouched") | no FLUSHALL in src/scripts |
| Reset CLI always warns | test | flagged (no wired test) | earlier verifier observation on both paths |
| x-test-user only when raw NODE_ENV exactly "test", never admin | test | ✓ VERIFIED | wired enforcement: config.test exactness matrix, auth.test e2e padded → 401, 01-04 admin-route cases (x-test-user never admin) all green |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| backend/src/config/env.ts | 122, 126 | display `nodeEnv` (trimmed) and security flag `isTestMode` (raw) come from different forms of the same variable; config.test locks this in (REVIEW CR-01, open) | ⚠️ Warning | For a near-miss NODE_ENV ("test "), banner/health say "test" while test mode is off and nothing tells the operator. It fails closed, so it is not a security problem. Phase 3 SC1's "any 401 → INVALID" guard stops a false E1 result, but the D-17 "confirm test mode via nodeEnv" contract is weakened. Human decision |
| backend/test/config.test.ts | 106-109 | duplicate positive/case assertion (REVIEW IN-01) | ℹ️ Info | maintenance only |
| backend/.env.test / .gitattributes | n/a | exact match depends on the loader stripping CR; checked only on Node 24 (REVIEW IN-02) | ℹ️ Info | see coincidental_reliance_items |
| backend/src/services/sale-admin.service.ts | 56-81 | reset reopens the sale before the Redis reset / order delete (earlier REVIEW WR-01) | ⚠️ Warning | carried forward. Fix during Phase 2, when the admin reset route exists |
| backend/src/server.ts | 62 | listens on all interfaces while test mode enables x-test-user (WR-02) | ⚠️ Warning | carried forward |
| backend/test/helpers.ts | 7-9 | fixed Redis db numbers shared across worktrees (WR-03) | ⚠️ Warning | carried forward |

No TBD/FIXME/XXX/TODO/HACK markers in the files changed by 01-05.

### Human Verification Required

1. **REVIEW CR-01 decision.** Today `NODE_ENV="test "` shows `nodeEnv: "test"` in the banner and `/api/health`, but test mode is off. Choose one:
   - Accept for Phase 1, and make the Phase 3 harness check something other than `nodeEnv` (for example a `testMode` field, or a probe request that must not get 401).
   - Fix now with a short gap plan: add `testMode` to the health body, make the display show the raw value or warn on a near-miss, and update config.test and health.test.
2. **Bad-boot matrix** on the real setup: blank JWT_SECRET, Docker Desktop stopped, only Redis stopped, port 5000 held. Each should exit 1 with one `[LỖI]` line.
3. **Health transition:** `docker stop`/`start` each container while the backend runs. Expect 200 → 503 (in under 3 s) → 200, with no restart.
4. **Empty JSON body deviation (01-02.2):** accept via override or change.
5. **Login with blank strings (01-04.3):** accept 401 via override or require 400.
6. **Backstop 01-02.10:** confirm the orders index is enough for Phase 1.
7. **Backstop 01-04.11:** confirm requireAdmin statelessness.
8. **Flagged prohibitions:** confirm items 1-5 in the Prohibitions table.

Suggested overrides for items 4 and 5, if accepted:

```yaml
overrides:
  - must_have: "A thrown plain Error (no status, no code) yields 500 with body exactly { message, code: \"INTERNAL_ERROR\" } and no stack, path or original error text; an empty, malformed or JSON-primitive body yields 400 INVALID_JSON, never 500 (INFRA-05 empty edge)"
    reason: "body-parser 2.x parses an empty JSON body to {}; keeping that allows body-less POSTs (Phase 2 buy, autocannon). Empty body never yields 500 (errors.test)."
    accepted_by: "{name}"
    accepted_at: "{ISO timestamp}"
  - must_have: "Register or login with a missing body, an empty object, an array, a JSON primitive, blank strings or any non-string field returns 400 (VALIDATION_ERROR, or INVALID_JSON for unparsable bodies), never 500 (AUTH-01 empty edge)"
    reason: "Login with a blank password returns 401 INVALID_CREDENTIALS per the 01-04 plan action and D-12 (uniform login failure); never 500. Register meets the truth fully."
    accepted_by: "{name}"
    accepted_at: "{ISO timestamp}"
```

### Gaps Summary

The previous gap is closed. `isTestMode` now compares the raw `NODE_ENV` to `"test"` at its single site in `env.ts`. The verifier ran the end-to-end HTTP tests and the 11-value exactness matrix and saw them pass, and `npm run start:test` still runs in test mode. AUTH-05 and ROADMAP SC5 are satisfied. No regressions: typecheck passes, 133/133 unit and 46/46 integration tests pass, and Docker infra is unchanged.

No automated check fails. The phase is at `human_needed` because of items carried over from the first verification: real Docker stop/start checks, two plan-wording deviations awaiting an override decision, two backstop truths, and flagged prohibitions. There is also one new decision: REVIEW CR-01, where the displayed `nodeEnv` can say "test" while test mode is off. The verifier rates CR-01 a Warning, not a Blocker, for three reasons:
- it fails closed;
- it is the behaviour 01-05 must-have 5 asked for;
- Phase 3 SC1 already invalidates any E1 run that sees a 401.

It still weakens the D-17 contract that Phase 3 relies on. The user should either accept it for now or schedule a small fix before Phase 3.

---

_Verified: 2026-11-04T16:30:00Z_
_Verifier: Claude (gsd-verifier)_
