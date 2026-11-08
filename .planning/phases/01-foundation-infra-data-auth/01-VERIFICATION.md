---
phase: 01-foundation-infra-data-auth
verified: 2026-11-07T10:41:02Z
status: passed
score: 82/82 must-haves verified
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
  - .planning/phases/01-foundation-infra-data-auth/01-10-PLAN.md
  - .planning/phases/01-foundation-infra-data-auth/01-10-SUMMARY.md
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
covered_digest: "v4:sha256:6c4399f7125eae2a02fdb838fc8c6a4899385f24bd4f7e66caac6eac1a17659d"
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
  previous_status: gaps_found
  previous_score: 75/76
  gaps_closed:
    - "G-01-V1 (01-09 must-have 2, REVIEW WR-02): serverArgv(\"start:test\") now returns startTestArgv(START_TEST_SCRIPT) (helpers.ts:214); the VERIFICATION gate `sed -n '/^function serverArgv/,/^}/p' backend/test/helpers.ts | grep -c START_TEST_SCRIPT` prints 1 (was 0). build.test pins package.json -> constant and constant -> argv. The verifier reproduced both coordinated mutations in a scratch copy of the tree: dropping --override from both strings left build.test 7/7 green but failed the G-01-9 health.test case on testMode (false !== true); dropping -q failed the boot.test start:test one-line case (2 !== 1, extra line `◇ injected env (1) from ...`)"
  gaps_remaining: []
  regressions: []
advisory:
  - finding: "REVIEW WR-03 (was IN-03): the JWT_SECRET-shorter-than-32 [CẢNH BÁO] line prints before the port check and the store connections, so every boot failure with a short secret gives two stderr lines, not one"
    category: other
    reason: "Intended D-18 guidance line, carried from the previous rounds. No test covers a short secret (TEST_JWT_SECRET is 43 characters). Fix: move the warning after the stores connect."
    evidence_status: "none provided: no named test runs red"
  - finding: "REVIEW WR-04: test mode (identity from x-test-user) is served on every interface, because listen(cfg.port) has no host"
    category: security
    reason: "Carried forward. Fix: bind loopback, or reject non-loopback peers in the x-test-user branch."
    evidence_status: "none provided"
  - finding: "REVIEW IN-05 (previous round): runtime Redis has no per-command deadline"
    category: architectural
    reason: "The buy path does not exist yet. Belongs with the Phase 2 Lua buy call."
    evidence_status: "none provided"
  - finding: "REVIEW IN-08 (new, in the 01-10 code): startTestArgv rewrites only the exact tokens .env.test and dist/server.js, so a script spelling such as -f=.env.test or -f ./.env.test is either accepted verbatim (child resolves it against the empty temp cwd and fails loudly with ENOENT in boot/health tests, not in build.test) or rejected with a misleading reason"
    category: other
    reason: "Test-helper robustness. The current START_TEST_SCRIPT is replayed exactly, and the 01-10 must-have lists four rejected shapes, all of which throw (build.test green). The realistic failure is loud, only misattributed. Fix in REVIEW IN-08 (normalise path-like tokens, reject unmapped relative paths)."
    evidence_status: "none provided: no named test runs red on the real tree"
  - finding: "REVIEW IN-09 (new): the per-flag assertion in the build.test token-order case duplicates the line above it and can never fail independently"
    category: other
    reason: "Test code only; the token-order assertion itself is effective (the verifier saw the synthetic and mutation cases behave as expected)."
    evidence_status: "none provided"
human_verification:
  - test: "Prerequisite: backend/.env exists, created once in backend/ with the command in the backend/.env.example header (random 32-byte JWT_SECRET written straight into the file, never printed, never overwrites, gitignored, never committed). Env source: backend/.env only. Open a new cmd.exe window with Win+R then cmd, not from a terminal that may hold PowerShell $env: values, cd to backend/, and run `for %V in (MONGODB_URI REDIS_URL JWT_SECRET NODE_ENV PORT) do @if defined %V echo %V dang dat trong phien nay`. It must print nothing (it prints names only, never values). In that ONE window: `npm run build`, then `set NODE_ENV=test && npm run start` (this cmd idiom leaves NODE_ENV=\"test \" with a trailing space in the window). Open http://localhost:5000/api/health in a browser, then stop the server with Ctrl+C (answer Y if cmd asks to terminate the batch job). In the SAME window, without clearing NODE_ENV, run `npm run start:test`, open the health URL again, stop it with Ctrl+C, and open the URL once more. Finally run `set NODE_ENV=` to clear the variable."
    expected: "npm run start: banner NODE_ENV=\"test \", exactly one [CẢNH BÁO] NODE_ENV=\"test \" line that says npm run start:test always sets NODE_ENV=test, no CHẾ ĐỘ TEST line, health testMode false and nodeEnv \"test \". npm run start:test in the same window: build output, then the CHẾ ĐỘ TEST line, banner NODE_ENV=\"test\", no [CẢNH BÁO] NODE_ENV line and no dotenv injected-env line, health testMode true and nodeEnv \"test\". After the last Ctrl+C the health URL no longer answers (port 5000 freed: the server under the dotenv wrapper stopped too)."
    why_human: "Real cmd.exe `set VAR=x && ...` persistence, and real Ctrl+C through npm, the .cmd shim and the dotenv wrapper. Automated equivalent: health.test starts the server through the start:test launcher (now derived from START_TEST_SCRIPT by 01-10) with an inherited NODE_ENV \"test \" and checks that the port is freed after stop. This is the re-test of UAT round 2 test 2 (G-01-9); 01-UAT.md still shows it as an open issue."
  - test: "Acknowledge the two judgment-tier 01-10 prohibitions: (a) the plan signalled no process it did not spawn and did not stop, restart or remove flashsale-mongo / flashsale-redis; (b) no backend/.env was created, opened, printed or committed."
    expected: "Both hold. Verifier evidence (non-authoritative LLM judgment): `docker ps` shows both containers `Up 2 hours (healthy)`, an uptime that predates the 01-10 run (10:14-10:24Z); the 01-10 commits touch only backend/test/helpers.ts, backend/test/build.test.ts and planning files; backend/.env does not exist and .gitignore lists .env."
    why_human: "Judgment-tier prohibitions need explicit human resolution in interactive verify; absence of an action in a past session cannot be proven by a test."
---

# Phase 1: Foundation (Infra, Data, Auth) Verification Report

**Phase Goal:** A developer can bring up MongoDB and Redis, boot a backend that fails fast on bad configuration, seed and reset a fashion flash sale, and authenticate with JWT (or with `x-test-user` in test mode)
**Verified:** 2026-11-07T10:41:02Z
**Status:** human_needed. All automated must-haves are verified and gap G-01-V1 is closed. One carried-over manual re-test (G-01-9 in real cmd.exe) and one prohibition acknowledgement remain.
**Re-verification:** Yes. The previous report was gaps_found at 75/76 with one gap, G-01-V1. That gap got full 3-level verification. Gap-closure plan 01-10 got full depth. Everything else got a regression check.

## What changed since the previous verification

- `git diff --stat 354162c HEAD -- backend docker-compose.yml` lists only `backend/test/build.test.ts` (+54) and `backend/test/helpers.ts` (+52/-17).
- `git log 354162c..HEAD -- backend/src backend/scripts backend/package.json` is empty, so product code, scripts, `package.json` and the committed `.env.test` are byte-identical to the plan base.
- `git status --porcelain -- backend` is clean.

## Evidence the verifier produced itself (not from SUMMARY)

**Gate and wiring checks**
- The original gap gate, `sed -n '/^function serverArgv/,/^}/p' backend/test/helpers.ts | grep -c START_TEST_SCRIPT`, prints **1** (it printed 0 last round).
- `grep -c '"--override"'` and `grep -c '"-q"'` on helpers.ts print 0. The hard-coded argv is gone.
- The false comment clause `theo đúng các token của nó` is gone (count 0).
- Both spawn sites use `serverArgv`: `spawnServer` → `runNode` at line 298, and `startServerProcess` at line 397. Both then call `spawn(process.execPath, argv, ...)`.
- `serverArgv("start:test")` returns `startTestArgv(START_TEST_SCRIPT)` (line 214).
- The 3 launcher callers are `health.test.ts:126`, `health.test.ts:163` and `boot.test.ts:100`.

**Runs on the real tree**
- `npm run typecheck` (backend): exit 0.
- `node --import tsx --test test/build.test.ts`: 7/7 pass, including the three `(WR-02)` cases.

**Independent mutation proof**

I extracted the committed tree with `git archive HEAD backend` into the scratchpad and linked `node_modules` with a junction. The repo was not modified, and the junction was removed afterwards. In that copy:
- **M1**, with ` --override` dropped from both `package.json` start:test and `START_TEST_SCRIPT`:
  - After `npm run build`, build.test is still 7/7 green.
  - `node --import tsx --test --test-concurrency=1 test/integration/health.test.ts` exits 1 with 10 tests, 9 pass, 1 fail. The failing case is `health báo testMode true, nodeEnv "test", có CHẾ ĐỘ TEST và không có cảnh báo NODE_ENV gần giống` with `false !== true`.
  - The clean-env start:test case stays green.
- **M2**, with `-q` dropped from both strings:
  - `node --import tsx --test --test-name-pattern="start:test" test/boot.test.ts` exits 1.
  - The failing case is `npm run start:test khi MongoDB không chạy ...: thoát mã 1 với đúng một dòng [LỖI] MongoDB` with `2 !== 1`. The extra stderr line is `◇ injected env (1) from ...\.env.test`.
- Conclusion: editing the script and the constant together now changes what the tests launch, and weakening start:test turns the right test red. Before 01-10, every test stayed green under the same edits.

**gsd tool checks for 01-10**
- `verify.artifacts`: 3/3, exit 0.
- `verify.key-links`: 3/3, exit 0.

**Orchestrator evidence on the merged tree (consistent with the above)**
- typecheck exit 0.
- `npm test`: 154/154.
- `npm run test:int`: 59/59.
- Containers: `docker ps` shows flashsale-mongo `127.0.0.1:27018` and flashsale-redis `127.0.0.1:6379`, both healthy.

**Invariants**
- The only exact `"test"` comparison is `env.ts:139`.
- `process.env` is read only in `src/config/env.ts` (src + scripts).
- `backend/.env` is absent.

## Goal Achievement

### Roadmap Success Criteria (contract)

| # | Success Criterion | Status | Evidence |
|---|---|---|---|
| SC1 | Docker brings up Mongo 7 @127.0.0.1:27018 and Redis 7 AOF everysec @127.0.0.1:6379, healthy; health 200 when both up, 503 when either down | ✓ VERIFIED | Containers are healthy on loopback ports. health.test 200/503 passes (test:int 59/59). No infra change since the last round |
| SC2 | Clear Vietnamese exit on missing JWT_SECRET / Mongo or Redis unreachable / port taken; never 27017; prints maxPoolSize; typecheck + build pass; dist/lua exists | ✓ VERIFIED | typecheck exit 0. build.test confirms dist/server.js and dist/lua/buy.lua. The boot.test one-line cases pass, and the start:test case now runs through the derived argv |
| SC3 | `npm run seed` (qty, mode) recreates 1000 users + 1 admin, 6 products, 1 active 7-day half-price sale, Redis stock; every §6 index | ✓ VERIFIED | seed sources unchanged. seed/models tests pass |
| SC4 | `npm run reset` (one/all, --mode) restores, deletes, one checked multi(), reopens 7 days, warns about cache | ✓ VERIFIED | reset sources unchanged. reset.test passes. The cache clause is deferred to Phase 2 |
| SC5 | Register/login/JWT, 401/403, `x-test-user` only when `NODE_ENV === "test"`, §7 errors, no 500 leak | ✓ VERIFIED | Auth tests pass. Single raw site at env.ts:139. start:test forces `"test"`, and that is now guarded by a test that follows the real script |

### Gap G-01-V1 (full depth)

| # | Truth | Status | Evidence |
|---|---|---|---|
| 01-09.2 | package.json start:test is exactly the dotenv string; build.test pins it against the constant the helper launches from, so the integration case cannot drift; no new package | ✓ VERIFIED (gap closed) | The helper derives its argv from `START_TEST_SCRIPT` (gate count 1). build.test pins both links. The verifier's M1/M2 scratch-copy mutations turn the G-01-9 and boot cases red. No new dependency: the backend diff touches only test files |

### Plan 01-10 Must-Have Truths (full depth)

| # | Truth (abridged) | Status | Evidence |
|---|---|---|---|
| 01-10.1 | start:test argv is derived from START_TEST_SCRIPT through the 4-token mapping; the gate prints ≥1 | ✓ VERIFIED | `startTestArgv` (helpers.ts:174-199) does three things: it skips only segments exactly equal to `npm run build`; it maps index-0 `dotenv`→DOTENV_CLI, `node`→process.execPath, `.env.test`→absolute, `dist/server.js`→SERVER_ENTRY; and it passes the rest through verbatim. The gate prints 1 |
| 01-10.2 | build.test links both ways: token order, a synthetic script without -q/--override, and 4 rejected shapes throw | ✓ VERIFIED | build.test.ts:36-91. All 7 cases pass when run by the verifier. The rejected shapes are a lint pre-step, the pre-G-01-9 Node env-file form, a quoted token, and `dist/other.js`. The edge spellings outside those four are REVIEW IN-08 (advisory) |
| 01-10.3 | Gap scenario now caught: M1 fails G-01-9 health case on testMode while npm test stays green; M2 fails the boot one-line case; tree restored | ✓ VERIFIED | Reproduced independently by the verifier in a scratch copy (see evidence). The real tree is clean (`git status --porcelain -- backend` empty) and the start:test string is exact |
| 01-10.4 | Comments are true: START_TEST_SCRIPT comment names startTestArgv and both links; startTestArgv JSDoc states mapping, the skipped build step, the process.execPath/PATH divergence (WR-02), throw conditions; old false clause gone | ✓ VERIFIED | Read helpers.ts:131-136 and 157-173. The Vietnamese prose matches the code. "token đầu tiên dotenv" is equivalent to the code's `i === 0` mapping because of the `tokens[0] !== "dotenv"` guard. PATH appears in the JSDoc. The old clause has count 0 |
| 01-10.5 | Nothing outside the test helper changes; D-20/D-14 hold; every launcher case passes through the derived argv; typecheck, npm test, test:int exit 0 | ✓ VERIFIED | git diff/log evidence above. env.ts:139 is the single site. typecheck 0 (verifier). npm test 154/154 and test:int 59/59 (orchestrator, merged tree) |
| 01-10.6 | 01-REVIEW-DISPOSITION records WR-02 fixed by 01-10; the other 10 keep open | ✓ VERIFIED | Row `WR-02 \| warning \| fixed \| 01-10 (VERIFICATION gap G-01-V1)`. The later review run (cb16c6e/4433297) added IN-08 and IN-09, so it now reads `open: 12`. The original 10 (WR-01, WR-03, WR-04, IN-01..IN-07) are all still `open` |

### Plans 01-01 to 01-09 (regression)

| # | Truths | Status | Evidence |
|---|---|---|---|
| 01-01 to 01-09 plan truths + 5 roadmap SCs (76 previously, including 01-09.2 above) | 74 ✓ VERIFIED + 2 ✓ PASSED (override) | No product source changed since the last verification. Unit tests 154/154, integration 59/59, typecheck 0. The previous gsd artifact/key-link checks are unaffected (only test helpers changed) |

**Score:** 82/82 must-haves verified. That is 76 from the previous round (2 by override, and 01-09.2 now closed) plus 6 from 01-10. 0 are present but behavior-unverified.

### Deferred Items

| # | Item | Addressed In | Evidence |
|---|---|---|---|
| 1 | Reset clears the server's in-process sale cache (DATA-04 last clause) | Phase 2 | SC4 "one static sale cache that reset clears"; `onSaleReset` seam exists |
| 2 | Admin reset via HTTP | Phase 2 | SC5 "An admin can reset a sale over HTTP" |
| 3 | Preflight checks `health.testMode === true` | Phase 3 | SC1 "reports INVALID ... if the server is not in test mode" |

(Not gaps. They stay recorded for traceability.)

### Advisory (New Scope, Unevidenced)

| # | Finding | Category | Why Advisory |
|---|---|---|---|
| 1 | REVIEW WR-03: short JWT_SECRET warning prints before the boot checks | other | intended D-18 guidance; no red test |
| 2 | REVIEW WR-04: test mode served on all interfaces | security | carried forward; no evidence |
| 3 | REVIEW IN-05 (prev): no runtime per-command Redis deadline | architectural | buy path is Phase 2 |
| 4 | REVIEW IN-08: startTestArgv's exact-token mapping misses spellings like `-f=.env.test` / `./dist/server.js` | other | new scope in a file modified since the last verification, but Info severity and no test runs red; the current constant replays exactly |
| 5 | REVIEW IN-09: redundant per-flag assertion in build.test | other | test-code necessity nit; no behavioral impact |

### Required Artifacts (01-10)

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `backend/test/helpers.ts` | exported `startTestArgv`; serverArgv uses it; truthful comments | ✓ VERIFIED | exists, substantive (validation + mapping), wired into both spawn sites via serverArgv |
| `backend/test/build.test.ts` | constant→argv link: token order, synthetic, rejections | ✓ VERIFIED | 3 WR-02 cases with their own replacement table; all pass |
| `01-REVIEW-DISPOSITION.md` | WR-02 fixed by 01-10 | ✓ VERIFIED | row and frontmatter `disposition: fixed` |

### Key Link Verification (01-10, and the 01-09 link that was PARTIAL)

| From | To | Via | Status |
|---|---|---|---|
| helpers.ts | package.json | `serverArgv("start:test")` → `startTestArgv(START_TEST_SCRIPT)`; build.test pins constant == package.json | ✓ WIRED (both directions; was ⚠️ PARTIAL) |
| build.test.ts | helpers.ts | `startTestArgv(START_TEST_SCRIPT)` token-by-token, synthetic, rejections | ✓ WIRED |
| health.test.ts | helpers.ts | `startServerProcess({ env, launcher: "start:test" })` | ✓ WIRED (mutation M1 proves the derived argv reaches the spawned process) |
| package.json | config/env.ts | `dotenv run --override` sets NODE_ENV "test" before env.ts compares | ✓ WIRED |

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Real data | Status |
|---|---|---|---|---|
| start:test launcher argv in tests | flag tokens | `START_TEST_SCRIPT` → `startTestArgv` → `spawn(process.execPath, argv)` | yes (M1/M2 show the tokens change the launched process) | ✓ FLOWING |
| GET /api/health `testMode`/`nodeEnv` under start:test | NODE_ENV | dotenv `--override` from .env.test, then env.ts's single comparison | yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Typecheck | `npm run typecheck` (backend) | exit 0 | ✓ PASS |
| Drift guard unit cases | `node --import tsx --test test/build.test.ts` | 7/7 | ✓ PASS |
| M1: coordinated --override removal caught | scratch copy: build.test, then health.test | build.test 7/7 green; health.test 9/10, G-01-9 case `false !== true` | ✓ PASS (expected red) |
| M2: coordinated -q removal caught | scratch copy: `boot.test --test-name-pattern=start:test` | fail `2 !== 1`, extra `◇ injected env` line | ✓ PASS (expected red) |
| Repo untouched by probes | `git status --porcelain -- backend` | empty | ✓ PASS |

### Probe Execution

Step 7c: SKIPPED. No `scripts/*/tests/probe-*.sh` exist, and no plan declares a probe.

### Requirements Coverage

| Requirement | Source Plan | Status | Evidence |
|---|---|---|---|
| INFRA-01 | 01-01 | ✓ SATISFIED | compose, loopback ports, AOF |
| INFRA-02 | 01-01, 01-09, 01-10 | ✓ SATISFIED | start:test loads .env.test with override and runs compiled JS; tests now follow the real script; build copies lua |
| INFRA-03 | 01-01, 01-08, 01-09, 01-10 | ✓ SATISFIED | one-line fail-fast, also through the derived start:test launcher (M2 proves the guard) |
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
| AUTH-05 | 01-04, 01-05, 01-06, 01-09, 01-10 | ✓ SATISFIED | single raw site; start:test enables it, guarded by a test that follows the script (M1) |

There are no orphaned requirements: each of the 16 Phase 1 IDs is claimed by at least one plan.

REQUIREMENTS.md still has unchecked boxes for these IDs, and its traceability table still shows "Gaps Found" (for example INFRA-02, INFRA-03 and AUTH-05 at lines 132, 133 and 146). That bookkeeping is stale and the orchestrator should update it. The code satisfies these requirements.

### Prohibitions (01-10)

| Prohibition | Tier | Disposition | Evidence |
|---|---|---|---|
| Mutation proofs leave no mutated start:test / START_TEST_SCRIPT in the tree or any commit | test | ✓ VERIFIED | `git log 354162c..HEAD -- backend/package.json` is empty, `git status --porcelain -- backend` is empty, and the start:test string is exact. The verifier's own mutations ran in a scratch copy only |
| No signalling foreign processes; no stop/restart/remove of shared containers | judgment | holds (LLM judgment, non-authoritative), flagged for human acknowledgement | the containers' uptime predates the run, and no docker commands appear in the 01-10 changes |
| No change to backend/src, scripts, package.json, .env.test; no backend/.env created/opened/printed/committed | test (src/scripts/package.json/.env.test) + judgment (.env) | ✓ VERIFIED (test part); holds, flagged for human acknowledgement (.env part) | the backend diff since the base touches only the 2 test files; backend/.env is absent |

The phase-wide prohibitions are unchanged from the previous round:
- no 27017;
- loopback-only ports;
- JWT_SECRET is never printed;
- no per-request logging;
- FLUSHDB only;
- the exact-"test" single site;
- tests never stop the containers.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| backend/test/helpers.ts | 154-155, 186-198 | exact-token path mapping vs dotenv grammar (REVIEW IN-08) | ℹ️ Info / Advisory | edge spellings fail loudly in boot/health tests instead of in build.test; the current script is replayed exactly |
| backend/test/build.test.ts | 51 | redundant per-flag assertion (REVIEW IN-09) | ℹ️ Info | no coverage loss |
| backend/test/helpers.ts | killProcessTree | taskkill result ignored; unbounded stop wait (REVIEW WR-01) | ⚠️ Warning | test-helper only; carried forward, still open |
| backend/src/server.ts | listen | all interfaces while test mode is on (REVIEW WR-04) | ⚠️ Warning | carried forward |
| backend/.env.example | JWT_SECRET comment | second, printing generation command (REVIEW IN-01) | ℹ️ Info | header command is the documented path |

There are no TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER markers in `backend/test/helpers.ts` or `backend/test/build.test.ts`. The grep exit was 1, meaning no matches. The other phase files are unchanged since the previous clean scan.

### Human Verification Required

1. **Real cmd.exe near-miss, then start:test in the same window (G-01-9 re-test, carried over).** 01-UAT.md still records round 2 test 2 as an open issue, and no human re-test has run since 01-09/01-10.
   - Prerequisite: `backend/.env`, created with the non-printing command in the `.env.example` header.
   - Use a fresh Win+R cmd.exe window, and run the names-only presence check first. It must print nothing.
   - From `backend/`, run `npm run build`, then `set NODE_ENV=test && npm run start`. Expect the banner `NODE_ENV="test "`, one `[CẢNH BÁO]` line saying start:test always sets NODE_ENV=test, and health showing `testMode: false`. Stop it with Ctrl+C.
   - In the same window, run `npm run start:test`. Expect the CHẾ ĐỘ TEST line, the banner `NODE_ENV="test"`, no near-miss line, no injected-env line, and health showing `testMode: true`, `nodeEnv: "test"`.
   - Stop it with Ctrl+C. The health URL should no longer answer.
   - Run `set NODE_ENV=` to clear the variable.

   The full steps are in the frontmatter.
2. **Acknowledge the 01-10 judgment-tier prohibitions.** These are: no foreign process was signalled, the shared containers were not touched, and no backend/.env was involved. The verifier's evidence supports both, but a judgment-tier item needs explicit human resolution.

### Gaps Summary

G-01-V1 is closed:
- `serverArgv("start:test")` now launches whatever `START_TEST_SCRIPT` says.
- build.test checks the constant against `package.json` and against the derived argv.
- I reproduced the gap scenario myself, outside the repo. A coordinated edit that drops `--override` now fails the G-01-9 integration case, and one that drops `-q` fails the one-line boot case.

No product code changed, and there are no regressions:
- typecheck 0;
- unit tests 154/154;
- integration tests 59/59.

The new review findings IN-08 and IN-09 concern edge spellings and test redundancy in the new helper. They are Info-level and advisory, and they do not block.

The phase goal is achieved in code. Status is `human_needed` only because two items remain: the carried-over real cmd.exe re-test (G-01-9), and acknowledgement of the judgment-tier prohibitions.

---

_Verified: 2026-11-07T10:41:02Z_
_Verifier: Claude (gsd-verifier)_
