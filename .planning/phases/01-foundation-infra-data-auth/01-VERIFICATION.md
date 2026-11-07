---
phase: 01-foundation-infra-data-auth
verified: 2026-11-07T09:41:34Z
status: gaps_found
score: 75/76 must-haves verified
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
  - .planning/phases/01-foundation-infra-data-auth/01-06-PLAN.md
  - .planning/phases/01-foundation-infra-data-auth/01-06-SUMMARY.md
  - .planning/phases/01-foundation-infra-data-auth/01-07-PLAN.md
  - .planning/phases/01-foundation-infra-data-auth/01-07-SUMMARY.md
  - .planning/phases/01-foundation-infra-data-auth/01-08-PLAN.md
  - .planning/phases/01-foundation-infra-data-auth/01-08-SUMMARY.md
  - .planning/phases/01-foundation-infra-data-auth/01-09-PLAN.md
  - .planning/phases/01-foundation-infra-data-auth/01-09-SUMMARY.md
  - backend/.env.example
  - backend/package.json
  - backend/scripts/reset.ts
  - backend/scripts/seed.ts
  - backend/src/app.ts
  - backend/src/config/env.ts
  - backend/src/config/redis.ts
  - backend/src/controllers/health.controller.ts
  - backend/src/middlewares/auth.ts
  - backend/src/middlewares/error.ts
  - backend/src/server.ts
  - backend/test/boot.test.ts
  - backend/test/build.test.ts
  - backend/test/helpers.ts
  - backend/test/integration/health.test.ts
  - docker-compose.yml
covered_digest: "v4:sha256:492cbe14c33f1f53e71b4144b893b58522ec00a0f535bc1c345ee71928bf83a4"
behavior_unverified: 0
overrides_applied: 2
overrides:
  - must_have: 'nodeEnv keeps its trimmed display value for the boot banner and GET /api/health (NODE_ENV "test " displays "test" while isTestMode is false); every other loadBaseConfig output is unchanged, and the CHẾ ĐỘ TEST boot warning still depends only on cfg.isTestMode'
    reason: "Superseded by the user's decision in 01-UAT test 1 (REVIEW CR-01 option b, gap G-01-1, plan 01-06): nodeEnv now shows the raw NODE_ENV (JSON-quoted in the banner), GET /api/health exposes testMode, and a near-miss NODE_ENV prints a [CẢNH BÁO] line. The rest of that must-have still holds: loadBaseConfig outputs are otherwise unchanged apart from the added testModeNearMiss field, and the CHẾ ĐỘ TEST warning still depends only on cfg.isTestMode."
    accepted_by: "Le Trung Son (01-UAT test 1)"
    accepted_at: "2026-11-05T04:57:29.000Z"
  - must_have: 'Register or login with a missing body, an empty object, an array, a JSON primitive, blank strings or any non-string field returns 400 (VALIDATION_ERROR, or INVALID_JSON for unparsable bodies), never 500 (AUTH-01 empty edge)'
    reason: "Accepted by the user in 01-UAT test 5: login with a blank password returns 401 INVALID_CREDENTIALS, as the 01-04 plan action and D-12 (uniform login failure) prescribe, and never 500. Register meets the truth fully."
    accepted_by: "Le Trung Son (01-UAT test 5)"
    accepted_at: "2026-11-05T04:57:29.000Z"
re_verification:
  previous_status: human_needed
  previous_score: 70/70
  gaps_closed:
    - "G-01-9 cause 2 (UAT round 2, test 2): npm run start:test now forces NODE_ENV=test over an inherited shell value. package.json start:test = npm run build && dotenv run -q --override -f .env.test -- node dist/server.js. health.test (inherited NODE_ENV \"test \" through the launcher) gives testMode true and nodeEnv \"test\". The verifier also probed the real node_modules/.bin/dotenv.cmd shim in cmd.exe after `set NODE_ENV=test && ...` and got \"test\" (plan 01-09)"
    - "G-01-9 cause 1: backend/.env is listed as a prerequisite with a non-printing, no-overwrite creation command in the backend/.env.example header (the verifier ran it in a scratch dir: no output, 64-hex JWT_SECRET, second run fails with EEXIST)"
    - "Previous coincidental-reliance item (CRLF .env.test relied on Node's --env-file stripping CR) no longer applies: start:test now parses .env.test through dotenv, and the verifier's CRLF probe file gave exactly \"test\""
  gaps_remaining: []
  regressions: []
gaps:
  - truth: "backend/package.json start:test is exactly \"npm run build && dotenv run -q --override -f .env.test -- node dist/server.js\". build.test pins that string against the constant the test helper launches from, so the integration case cannot drift from the real script (01-09 must-have 2)"
    status: partial
    reason: "The string pin holds: build.test asserts package.json start:test === START_TEST_SCRIPT, the dotenv CLI ships with dotenv@18.0.9, and no package was added. The drift guarantee does not hold. serverArgv() in backend/test/helpers.ts never reads START_TEST_SCRIPT; it hard-codes \"run\", \"-q\", \"--override\", \"-f\", .env.test, \"--\", process.execPath, SERVER_ENTRY (`sed -n '/^function serverArgv/,/^}/p' backend/test/helpers.ts | grep -c START_TEST_SCRIPT` gives 0). If someone edits package.json and START_TEST_SCRIPT together, for example dropping --override, build.test and every launcher:\"start:test\" case, including the G-01-9 regression test, stay green while the real npm run start:test stops forcing test mode. The helper's doc comment claims the opposite. REVIEW WR-02 reports the same problem, and it is still open. Today the helper tokens match the script exactly, so G-01-9 itself is closed. Only the guard that should keep it closed is weaker than the must-have says."
    artifacts:
      - path: "backend/test/helpers.ts"
        issue: "serverArgv('start:test') hard-codes the wrapper argv instead of deriving it from START_TEST_SCRIPT. The doc comment above START_TEST_SCRIPT says the helper starts the server from the script's own tokens, which is false"
      - path: "backend/test/build.test.ts"
        issue: "The pin is one-directional: it checks package.json against the constant, never the constant against the argv the helper actually launches"
    missing:
      - "Derive serverArgv('start:test') from START_TEST_SCRIPT: take the part after the last &&, map dotenv to DOTENV_CLI, node to process.execPath, and .env.test / dist/server.js to absolute paths under BACKEND_ROOT. Or export serverArgv and have build.test assert that its argv contains every flag token of START_TEST_SCRIPT in order"
      - "Correct the helper doc comment so it matches whatever mechanism is chosen"
deferred:
  - truth: "DATA-04 'xóa cache đợt sale': reset clears the server's in-process sale cache"
    addressed_in: "Phase 2"
    evidence: "Phase 2 SC4: 'all modes share one order-creation path and one static sale cache that reset clears'. Phase 1 provides the seam: createSaleAdminService({ onSaleReset }) calls the hook once per successful reset."
  - truth: "Admin reset over HTTP (POST /api/admin/sales/:id/reset) using the shared reset service"
    addressed_in: "Phase 2"
    evidence: "Phase 2 SC5: 'An admin can reset a sale over HTTP (optionally switching mode) and read stats'"
  - truth: "Load-test preflight checks health testMode === true (D-17 as amended by 01-06)"
    addressed_in: "Phase 3"
    evidence: "Phase 3 SC1: 'It reports INVALID instead of a result if the server is not in test mode ... or any 401 appears'. 01-CONTEXT D-17 now tells the EXP-01 preflight to check testMode === true."
advisory:
  - finding: "REVIEW WR-03 (was IN-03): the JWT_SECRET-shorter-than-32 [CẢNH BÁO] line prints before the port check and the store connections, so every boot failure with a short secret gives two stderr lines, not one"
    category: other
    reason: "This is the intended D-18 guidance line, and it was already recorded as advisory in the previous round. No test covers a short secret (TEST_JWT_SECRET is 43 characters). The fix is to move the warning after the store connects, next to the other startup warnings."
    evidence_status: "none provided: no named test runs red; every boot.test exact-one-line case is green with a valid secret"
  - finding: "REVIEW WR-04 / earlier review: test mode (identity from x-test-user) is served on every interface, because listen(cfg.port) has no host"
    category: security
    reason: "Carried forward. start:test now turns test mode on reliably, which makes the exposure more predictable. The fix is to bind loopback, or reject non-loopback peers in the x-test-user branch."
    evidence_status: "none provided"
  - finding: "REVIEW IN-05 (previous round): runtime Redis has no per-command deadline"
    category: architectural
    reason: "The buy path does not exist yet. This belongs with the Phase 2 Lua buy call."
    evidence_status: "none provided"
human_verification:
  - test: "Prerequisite: backend/.env exists, created once in backend/ with the command in the backend/.env.example header (random 32-byte JWT_SECRET written straight into the file, never printed, never overwrites, gitignored, never committed). Env source: backend/.env only. Open a new cmd.exe window with Win+R then cmd, not from a terminal that may hold PowerShell $env: values, cd to backend/, and run `for %V in (MONGODB_URI REDIS_URL JWT_SECRET NODE_ENV PORT) do @if defined %V echo %V dang dat trong phien nay`. It must print nothing (it prints names only, never values). In that ONE window: `npm run build`, then `set NODE_ENV=test && npm run start` (this cmd idiom leaves NODE_ENV=\"test \" with a trailing space in the window). Open http://localhost:5000/api/health in a browser, then stop the server with Ctrl+C (answer Y if cmd asks to terminate the batch job). In the SAME window, without clearing NODE_ENV, run `npm run start:test`, open the health URL again, stop it with Ctrl+C, and open the URL once more. Finally run `set NODE_ENV=` to clear the variable."
    expected: "npm run start: banner NODE_ENV=\"test \", exactly one [CẢNH BÁO] NODE_ENV=\"test \" line that says npm run start:test always sets NODE_ENV=test, no CHẾ ĐỘ TEST line, health testMode false and nodeEnv \"test \". npm run start:test in the same window: build output, then the CHẾ ĐỘ TEST line, banner NODE_ENV=\"test\", no [CẢNH BÁO] NODE_ENV line and no dotenv injected-env line, health testMode true and nodeEnv \"test\". After the last Ctrl+C the health URL no longer answers (port 5000 freed: the server under the dotenv wrapper stopped too)."
    why_human: "Real cmd.exe `set VAR=x && ...` persistence, and real Ctrl+C through npm, the .cmd shim and the dotenv wrapper. Automated equivalent: health.test starts the server through the start:test launcher with an inherited NODE_ENV \"test \" and checks that the port is freed after stop (taskkill /T). The verifier also ran the real dotenv.cmd shim in cmd.exe after `set NODE_ENV=test && ...` and got \"test\". This is the re-test of UAT round 2 test 2 (G-01-9)."
---

# Phase 1: Foundation (Infra, Data, Auth) Verification Report

**Phase Goal:** A developer can bring up MongoDB and Redis, boot a backend that fails fast on bad configuration, seed and reset a fashion flash sale, and authenticate with JWT (or with `x-test-user` in test mode)
**Verified:** 2026-11-07T09:41:34Z
**Status:** gaps_found (one narrow gap: a test drift guard. The phase goal itself is achieved in code)
**Re-verification:** Yes. This run follows plan 01-09, which closes UAT gap G-01-9. The previous report had no `gaps:` block, so I re-checked the whole phase and went into full depth on 01-09.

## What changed since the previous verification

`git diff d3ee255 HEAD --stat -- backend docker-compose.yml` lists 7 files:
- `package.json`: start:test
- `.env.example`: header
- `src/server.ts`: one advice sentence
- `test/helpers.ts`, `test/build.test.ts`, `test/boot.test.ts`, `test/integration/health.test.ts`

`src/config/env.ts`, `middlewares/auth.ts`, `config/redis.ts`, `app.ts`, and the seed and reset scripts have no diff.

## Evidence the verifier produced itself (not from SUMMARY)

- `npm run typecheck` (backend): exit 0.
- `npm test` (includes build): **151/151 pass**, including `npm run start:test khi MongoDB không chạy (shell còn NODE_ENV="test ")...` and `script start:test nạp .env.test bằng dotenv run --override (G-01-9) và khớp với helper`.
- `npm run test:int` against the live containers: **59/59 pass**, including both `start:test` launcher describes and `stop() dừng cả cây tiến trình: cổng được giải phóng trong 5 giây`.
- dotenv CLI probes, run from a scratch file with CRLF line endings and `NODE_ENV="test "` inherited:
  - The child sees exactly `"test"`.
  - No `DOTENV_*` variable leaks into the child, so the server's own `dotenv/config` keeps its no-override behaviour.
  - Exit code 3 from the child propagates.
- Real shim probe: a `.cmd` batch ran `set NODE_ENV=test && call node_modules\.bin\dotenv run -q --override -f <file> -- node -e ...` in cmd.exe and printed `"test"`.
- `.env.example` header command, run in a scratch copy:
  - The first run prints nothing and writes `JWT_SECRET=<64 hex>`.
  - The second run fails with `EEXIST`.
  - `backend/.env` is absent in the repo, and `.gitignore` has `.env`.
- Invariants:
  - `grep '=== "test"' backend/src` finds only `env.ts:139 const isTestMode = env["NODE_ENV"] === "test";`.
  - `process.env` appears only in `src/config/env.ts` (src + scripts).
- `gsd verify.artifacts` passes for all plans (01-01 9/9, 01-02 7/7, 01-03 5/5, 01-04 5/5, 01-05 3/3, 01-06 6/6, 01-07 3/3, 01-08 5/5, 01-09 7/7). `verify.key-links` passes for all plans (01-09 3/3).
- Infra:
  - `docker ps` shows flashsale-mongo `mongo:7.0` on `127.0.0.1:27018` and flashsale-redis `redis:7.4` on `127.0.0.1:6379`, both healthy.
  - `CONFIG GET` returns `appendonly yes` and `appendfsync everysec`.
  - `dist/server.js` and `dist/lua/buy.lua` exist.

## Goal Achievement

### Roadmap Success Criteria (contract)

| # | Success Criterion | Status | Evidence |
|---|---|---|---|
| SC1 | Docker brings up Mongo 7 @127.0.0.1:27018 and Redis 7 AOF everysec @127.0.0.1:6379, healthy; health 200 when both up, 503 when either down | ✓ VERIFIED | docker ps / CONFIG GET re-checked. health.test 200/503 pass. The real stop/start passed in UAT |
| SC2 | Clear Vietnamese exit on missing JWT_SECRET / Mongo or Redis unreachable / port taken; never 27017; prints maxPoolSize; typecheck + build pass; dist/lua exists | ✓ VERIFIED | The boot.test exact-one-line cases pass, now also through the start:test wrapper. The real Redis-down boot passed in UAT round 2 test 1. typecheck and build exit 0, and dist/lua is present |
| SC3 | `npm run seed` (qty, mode) recreates 1000 users + 1 admin, 6 products, 1 active 7-day half-price sale, Redis stock; every §6 index | ✓ VERIFIED | seed.ts and seed.service unchanged. seed.test and models.test pass |
| SC4 | `npm run reset` (one/all, --mode) restores, deletes, one checked multi(), reopens 7 days, warns about cache | ✓ VERIFIED | reset.ts and sale-admin.service unchanged. reset.test passes. The cache clause is deferred to Phase 2 |
| SC5 | Register/login/JWT, 401/403, `x-test-user` only when `NODE_ENV === "test"`, §7 errors, no 500 leak | ✓ VERIFIED | auth tests pass. The single raw site is unchanged. start:test now reliably yields the exact `"test"` that test mode needs (G-01-9) |

### Plan 01-09 Must-Have Truths (full depth)

| # | Truth (abridged) | Status | Evidence |
|---|---|---|---|
| 01-09.1 | start:test launcher with inherited NODE_ENV "test " gives testMode true, nodeEnv "test", CHẾ ĐỘ TEST, no near-miss line, banner `NODE_ENV="test"`; NODE_ENV unset gives testMode true too | ✓ VERIFIED | health.test G-01-9 describe and the clean-env launcher describe pass (run by the verifier). The real-shim cmd.exe probe gives "test" |
| 01-09.2 | package.json start:test is exactly the dotenv string; build.test pins it against **the constant the helper launches from, so the integration case cannot drift**; no new package | ✗ PARTIAL (gap) | The string pin and "no new package" hold. `serverArgv` does not use `START_TEST_SCRIPT` (grep count 0), so a coordinated edit of package.json + constant that drops `--override` would leave every test green. Same as REVIEW WR-02 (open) |
| 01-09.3 | start:test boot failure (Mongo down, NODE_ENV "test ") exits 1 with exactly one [LỖI] MongoDB line; wrapper silent; exit code propagates | ✓ VERIFIED | boot.test case passes. The verifier's probe shows the exit code propagates and `-q` prints nothing. The SUMMARY's mutation run shows that removing `-q` turns the test red |
| 01-09.4 | stopping a start:test server frees its port; tree kill only while the child is alive | ✓ VERIFIED | health.test "cổng được giải phóng trong 5 giây" passes. `killProcessTree` returns early on `exitCode`/`signalCode`. The unbounded wait when taskkill fails (WR-01) is a test-helper warning |
| 01-09.5 | single test-mode site; env.ts the only process.env reader; near-miss keeps prefix and says start:test always sets NODE_ENV=test | ✓ VERIFIED | grep results above. server.ts:62 has the new advice. health.test asserts `luôn đặt NODE_ENV=test` on the warning line |
| 01-09.6 | human tests runnable: backend/.env prerequisite, non-printing no-overwrite command, env source fixed, names-only presence check, start then start:test in one window; D-20 amended; plan never touches backend/.env | ✓ VERIFIED | The human_verification item above keeps "Prerequisite:" and "Env source:". 01-CONTEXT D-20 records the amendment. The command was probed in scratch. backend/.env is absent and untracked |

### Plans 01-01 to 01-08 (regression)

01-01 through 01-08 were fully verified in the previous round. 01-09 changed none of their source except one advice sentence in server.ts, and all their tests pass in this run.

| # | Truths | Status | Evidence |
|---|---|---|---|
| 01-01 to 01-08 plan truths (65) + 5 roadmap SCs, as itemised in the previous report | 68 ✓ VERIFIED + 2 ✓ PASSED (override) | 151/151 unit and 59/59 integration pass. gsd artifacts and key-links pass for every plan |
| 01-05.6 (start:test in test mode with CRLF .env.test) | ✓ VERIFIED (coincidental reliance removed) | Now parsed by dotenv with override. The verifier's CRLF probe gives "test". The health.test launcher case uses the real CRLF working-tree `.env.test` |

**Score:** 75/76 must-haves verified: 70 previous (2 by override) and 6 new from 01-09, of which 5 are verified and 1 is partial. 0 are present but behavior-unverified.

### Deferred Items

| # | Item | Addressed In | Evidence |
|---|---|---|---|
| 1 | Reset clears the server's in-process sale cache (DATA-04 last clause) | Phase 2 | SC4 "one static sale cache that reset clears"; `onSaleReset` seam exists |
| 2 | Admin reset via HTTP | Phase 2 | SC5 "An admin can reset a sale over HTTP" |
| 3 | Preflight checks `health.testMode === true` | Phase 3 | SC1 "reports INVALID ... if the server is not in test mode" |

### Advisory (New Scope, Unevidenced)

| # | Finding | Category | Why Advisory |
|---|---|---|---|
| 1 | REVIEW WR-03: short JWT_SECRET warning prints before the boot checks, so a failure gives 2 stderr lines | other | intended D-18 guidance; no red test |
| 2 | REVIEW WR-04: test mode (x-test-user) served on all interfaces | security | carried forward; no evidence of exploitation path within scope |
| 3 | REVIEW IN-05 (prev): no runtime per-command Redis deadline | architectural | buy path is Phase 2 |

### Required Artifacts (01-09)

| Artifact | Status | Details |
|---|---|---|
| `backend/package.json` | ✓ VERIFIED | `start:test` = `npm run build && dotenv run -q --override -f .env.test -- node dist/server.js` |
| `backend/test/helpers.ts` | ⚠️ VERIFIED with gap | START_TEST_SCRIPT, DOTENV_CLI, ServerLauncher, serverArgv and killProcessTree are present and used. serverArgv is not derived from START_TEST_SCRIPT (gap) |
| `backend/test/build.test.ts` | ✓ VERIFIED | pins package.json to START_TEST_SCRIPT; DOTENV_CLI exists |
| `backend/test/integration/health.test.ts` | ✓ VERIFIED | two `launcher: "start:test"` describes plus a port-freed case |
| `backend/test/boot.test.ts` | ✓ VERIFIED | start:test Mongo-down single-line case |
| `backend/src/server.ts` | ✓ VERIFIED | `luôn đặt NODE_ENV=test` advice |
| `backend/.env.example` | ✓ VERIFIED | non-printing `wx` creation header (probed) |
| `01-CONTEXT.md` D-20 | ✓ VERIFIED | amendment recorded |

### Key Link Verification (01-09)

| From | To | Via | Status |
|---|---|---|---|
| build.test.ts | package.json | `assert.equal(scripts["start:test"], START_TEST_SCRIPT)` | ⚠️ PARTIAL: wired one way only. The constant is not linked to the argv the helper launches |
| package.json | config/env.ts | `dotenv run --override` sets NODE_ENV "test" before env.ts compares | ✓ WIRED (integration test and shim probe) |
| health.test.ts | dist/server.js | `startServerProcess({ env: { ..., NODE_ENV: "test " }, launcher: "start:test" })` | ✓ WIRED |

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Real data | Status |
|---|---|---|---|---|
| GET /api/health `testMode`/`nodeEnv` under start:test | NODE_ENV | dotenv `--override` from .env.test, then env.ts's single comparison | yes | ✓ FLOWING |
| requireAuth x-test-user | cfg.isTestMode | the same single comparison | yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Typecheck | `npm run typecheck` | exit 0 | ✓ PASS |
| Unit + build | `npm test` | 151/151 | ✓ PASS |
| Integration | `npm run test:int` | 59/59 | ✓ PASS |
| Override beats inherited "test " (CRLF file) | `NODE_ENV="test " node <dotenv cli> run -q --override -f probe -- node -e ...` | `"test"`, no DOTENV_* in the child | ✓ PASS |
| Exit code propagation | the same command with `process.exit(3)` | exit=3 | ✓ PASS |
| Real .cmd shim in cmd.exe after `set NODE_ENV=test && ...` | batch probe | `"test"`, exit 0 | ✓ PASS |
| .env creation command | the header command in scratch | silent; 64-hex secret; EEXIST on rerun | ✓ PASS |

### Probe Execution

Step 7c: SKIPPED. No `scripts/*/tests/probe-*.sh` exist, and no plan declares a probe.

### Requirements Coverage

| Requirement | Source Plan | Status | Evidence |
|---|---|---|---|
| INFRA-01 | 01-01 | ✓ SATISFIED | compose, ports, AOF (re-checked) |
| INFRA-02 | 01-01, 01-09 | ✓ SATISFIED | `start:test` loads .env.test (now with override) and runs compiled JS; build copies lua |
| INFRA-03 | 01-01, 01-08, 01-09 | ✓ SATISFIED | one-line fail-fast, also through the start:test wrapper |
| INFRA-04 | 01-01, 01-06 | ✓ SATISFIED | health 200/503 plus testMode |
| INFRA-05 | 01-02, 01-07 | ✓ SATISFIED | §7 mapping |
| INFRA-06 | 01-01 | ✓ SATISFIED | maxPoolSize explicit and printed; .env.example complete |
| DATA-01 | 01-02 | ✓ SATISFIED | models and indexes |
| DATA-02 | 01-02, 01-03 | ✓ SATISFIED | indexes before listen/insert |
| DATA-03 | 01-03, 01-08 | ✓ SATISFIED | seed |
| DATA-04 | 01-03 | ✓ SATISFIED (cache clause deferred to Phase 2) | shared reset service |
| DATA-05 | 01-03, 01-08 | ✓ SATISFIED | reset CLI warning |
| AUTH-01 | 01-04 | ✓ SATISFIED | register tests |
| AUTH-02 | 01-04 | ✓ SATISFIED | JWT tests |
| AUTH-03 | 01-04 | ✓ SATISFIED | requireAuth tests |
| AUTH-04 | 01-04 | ✓ SATISFIED | admin guard tests |
| AUTH-05 | 01-04, 01-05, 01-06, 01-09 | ✓ SATISFIED | single raw site; start:test now reliably enables it |

No orphaned requirements: all 16 Phase 1 IDs are claimed by at least one plan. The REQUIREMENTS.md checkboxes and the traceability table still show "Gaps Found" or unchecked for 10 IDs (INFRA-01/02/06, DATA-01/02/04, AUTH-01..04). This is stale bookkeeping that the orchestrator should update. The code satisfies them.

### Prohibitions

| Prohibition | Tier | Disposition | Evidence |
|---|---|---|---|
| No connection to 27017 | test | ✓ VERIFIED | config.test + boot.test |
| Ports only on 127.0.0.1 (compose) | test | ✓ VERIFIED | docker ps |
| JWT_SECRET never printed; plan never reads/prints/commits backend/.env | judgment | ✓ holds | the creation command is silent (probed); backend/.env is absent and gitignored |
| No per-request logging | judgment | ✓ holds (human, UAT 8) | unchanged |
| Seed FLUSHDB only, never FLUSHALL | test | ✓ VERIFIED | no `flushall` in src/scripts/test |
| x-test-user only on raw exact "test"; near-miss never enables it | test | ✓ VERIFIED | single site; health.test "test " direct-node case gives testMode false |
| Tests never stop/restart shared containers | judgment | ✓ holds | no `docker stop/restart/compose down` in backend/test |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| backend/test/helpers.ts | serverArgv / START_TEST_SCRIPT doc comment | hard-coded argv plus a comment that claims derivation (REVIEW WR-02) | ⚠️ Warning (gap) | the drift guard is weaker than stated; see gap |
| backend/test/helpers.ts | killProcessTree | taskkill result ignored; `stop()` awaits exit unbounded (REVIEW WR-01) | ⚠️ Warning | a failed taskkill would hang the test run; no product impact |
| backend/src/server.ts | 23-26 | short-secret warning before boot checks (REVIEW WR-03) | ℹ️ Advisory | see Advisory 1 |
| backend/src/server.ts | listen | all interfaces while test mode is on (REVIEW WR-04) | ⚠️ Warning | carried forward |
| backend/.env.example | JWT_SECRET comment | second, printing generation command conflicts with the header (REVIEW IN-01) | ℹ️ Info | the header's non-printing command is the documented path |
| backend/package.json | test scripts | quoted glob in `--test` may not expand on Node 20.19 (REVIEW IN-03) | ℹ️ Info | dev tooling only; the runtime is Node 24 |

There are no TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER markers in `backend/src`, `backend/scripts`, `backend/test`, `package.json` or `.env.example`.

### Human Verification Required

UAT round 2 test 1 (real Redis-down boot) passed, and 01-09 did not touch that path, so it is not repeated. UAT round 2 test 2 must be re-run after the G-01-9 fix:

1. **Real cmd.exe near-miss, then start:test in the same window (G-01-9 re-test).** The prerequisite is `backend/.env`, created with the non-printing command in the `.env.example` header. The env source is `backend/.env` only, in a fresh Win+R cmd.exe window where the names-only presence check prints nothing.
   - From `backend/`, run `npm run build`, then `set NODE_ENV=test && npm run start`. Expect the banner `NODE_ENV="test "`, one `[CẢNH BÁO]` line saying start:test always sets NODE_ENV=test, and health showing `testMode: false`. Stop it with Ctrl+C.
   - In the same window, run `npm run start:test`. Expect the CHẾ ĐỘ TEST line, the banner `NODE_ENV="test"`, no near-miss line, no injected-env line, and health showing `testMode: true`, `nodeEnv: "test"`.
   - Stop it with Ctrl+C. The health URL should no longer answer.
   - Run `set NODE_ENV=` to clear the variable.

   The full steps are in the `human_verification` frontmatter.

### Gaps Summary

G-01-9 is closed in code. `npm run start:test` now forces `NODE_ENV=test` over whatever the shell holds, and three things show it works:
- the verifier ran the integration test green;
- the verifier probed the real `.cmd` shim in cmd.exe;
- start:test boot failures keep one `[LỖI]` line and exit code 1.

The near-miss advice is now true, `backend/.env` is a documented prerequisite with a silent, no-overwrite creation command, and the single test-mode decision in `env.ts` is untouched. No regressions: typecheck passes, unit tests pass 151/151, and integration tests pass 59/59.

There is one narrow gap, in the regression guard rather than the behavior. The 01-09 must-have promises that the integration case "cannot drift" from the real script, but the helper hard-codes the wrapper argv instead of deriving it from `START_TEST_SCRIPT`. If the script and the constant are later edited together, all tests stay green while the real start:test loses `--override`. The fix is about 10 lines in `backend/test/helpers.ts`: derive the argv from the constant, or assert token containment in build.test. If you would rather accept the current guard, add this override:

```yaml
overrides:
  - must_have: "backend/package.json start:test is exactly \"npm run build && dotenv run -q --override -f .env.test -- node dist/server.js\". build.test pins that string against the constant the test helper launches from, so the integration case cannot drift from the real script"
    reason: "The helper tokens match the script today (verified); the one-directional guard (REVIEW WR-02) is accepted as test-robustness debt"
    accepted_by: "{name}"
    accepted_at: "{ISO timestamp}"
```

After the gap is closed or overridden, the phase still needs the single human re-test above before it can pass.

---

_Verified: 2026-11-07T09:41:34Z_
_Verifier: Claude (gsd-verifier)_
