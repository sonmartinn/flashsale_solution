---
status: diagnosed
trigger: "UAT 01 Test 2 (re-test of G-01-1): in cmd.exe from backend/, `set NODE_ENV=test && npm run start` / `npm run start:test` only print `[LỖI] Thiếu biến môi trường MONGODB_URI. Đặt MONGODB_URI=mongodb://127.0.0.1:27018/flashsale trong backend/.env (xem .env.example).`"
created: 2026-11-06T08:10:00Z
updated: 2026-11-06T08:20:00Z
mode: find_root_cause_only
---

## Current Focus

hypothesis: CONFIRMED (AND-gate, two causes). (1) Environment: backend/.env does not exist on this machine, so MONGODB_URI is unset in a fresh cmd.exe and BOTH commands stop at requireVar(MONGODB_URI) before any banner. (2) Latent code/design: once (1) is fixed, running `npm run start:test` in the same cmd window still fails the expectation, because cmd's `set` keeps NODE_ENV="test " in that window and `node --env-file=.env.test` never overrides an existing variable.
test: done (see Evidence)
expecting: n/a
next_action: return ROOT CAUSE FOUND to caller (diagnose-only mode)
bug_class: Bohrbug (deterministic, environment-dependent)
reasoning_checkpoint:
  hypothesis: "The reported line comes from env.ts:107 requireVar(MONGODB_URI), because backend/.env is absent, no MONGODB_URI exists in any Windows env scope, and .env.test holds only NODE_ENV. Separately, start:test cannot force NODE_ENV=test when the shell already has NODE_ENV set, because Node's --env-file gives inherited variables precedence."
  confirming_evidence:
    - "ls -la backend/ shows .env.example and .env.test only, no .env; root .gitignore ignores .env"
    - "MONGODB_URI/REDIS_URL/JWT_SECRET/NODE_ENV are not set in User, Machine or Process scope"
    - "Fresh cmd.exe without these vars: `set NODE_ENV=test && npm run start`, `npm run start:test`, plain `npm run start` and `npm run seed` all print exactly the reported [LỖI] line and exit 1"
    - "Same cmd commands with MONGODB_URI/REDIS_URL/JWT_SECRET/PORT supplied: near-miss start shows NODE_ENV=\"test \", one [CẢNH BÁO], health testMode false/nodeEnv \"test \"; start:test from clean env shows CHẾ ĐỘ TEST and testMode true"
    - "`set NODE_ENV=test && npm run start:test` with vars supplied: banner NODE_ENV=\"test \", near-miss [CẢNH BÁO], no CHẾ ĐỘ TEST, health testMode false"
  falsification_test: "If backend/.env existed or MONGODB_URI were set, the [LỖI] MONGODB_URI line would not appear. If --env-file overrode inherited values, start:test after `set NODE_ENV=test` would print CHẾ ĐỘ TEST. Both were tested and both went the predicted way."
  fix_rationale: "diagnose-only; direction: create backend/.env (environment) and make start:test independent of an inherited NODE_ENV or document clearing it (code/docs)"
  blind_spots: "Why Test 1 passed in the same UAT session is not explained: without backend/.env plain `npm run start` fails with the same MONGODB_URI line. Most likely Test 1 ran in a shell with session-only variables (for example PowerShell $env:), which a new cmd.exe window does not inherit. The user's exact Test 2 key sequence (one window or two) is unknown."
  candidate_causes:
    - "environment: backend/.env missing (CONFIRMED)"
    - "config/data: .env.test lacks MONGODB_URI (by design, D-20: NODE_ENV only; contributes, not a defect)"
    - "code: env.ts selects a different env file or skips .env when NODE_ENV starts with test (ELIMINATED)"
    - "code/design: start:test relies on --env-file, which does not override inherited NODE_ENV (CONFIRMED, latent)"
  and_gate: "yes. The observed MONGODB_URI line needs only cause (1). Passing Test 2 as written also needs cause (2) addressed, or the test run in a fresh window. Fixing (1) alone exposes (2) whenever both commands run in one cmd window."

## Symptoms

expected: In cmd.exe, from backend/, `set NODE_ENV=test && npm run start` shows NODE_ENV="test " in the banner, exactly one [CẢNH BÁO] line, and GET /api/health returns testMode false with nodeEnv "test ". Then `npm run start:test` prints CHẾ ĐỘ TEST and GET /api/health returns testMode true.
actual: Only output is `[LỖI] Thiếu biến môi trường MONGODB_URI. Đặt MONGODB_URI=mongodb://127.0.0.1:27018/flashsale trong backend/.env (xem .env.example).`; server never starts. Unknown which of the two commands (or both).
errors: [LỖI] Thiếu biến môi trường MONGODB_URI. Đặt MONGODB_URI=mongodb://127.0.0.1:27018/flashsale trong backend/.env (xem .env.example).
reproduction: UAT 01 Test 2 (.planning/phases/01-foundation-infra-data-auth/01-UAT.md). Test 1 in the same session reportedly passed (plain npm run start with Redis stopped reached the Redis error).
started: Discovered 2026-11-06 during UAT re-test after gap-closure plans 01-06..01-08.

## Eliminated

- hypothesis: env.ts picks a different env file or skips backend/.env when NODE_ENV is "test"/"test "
  evidence: env.ts line 1 is a plain `import "dotenv/config"` (cwd .env, no NODE_ENV-based selection). Plain `npm run start` with NODE_ENV unset fails identically, so NODE_ENV plays no part in the error.
  timestamp: 2026-11-06T08:14:00Z

- hypothesis: G-01-1 fix (plans 01-06) regressed the near-miss path
  evidence: With MONGODB_URI/REDIS_URL/JWT_SECRET/PORT supplied, `cmd /d /c "set NODE_ENV=test && npm run start"` printed banner NODE_ENV="test ", exactly one [CẢNH BÁO] line, health {"nodeEnv":"test ","testMode":false}. start:test from a clean env printed CHẾ ĐỘ TEST and health testMode true.
  timestamp: 2026-11-06T08:15:00Z

- hypothesis: start:test file missing or gitignored
  evidence: backend/.env.test is tracked (git ls-files) and present (15 B, NODE_ENV only per D-20). --env-file loaded it fine in the probe.
  timestamp: 2026-11-06T08:15:00Z

## Evidence

- timestamp: 2026-11-06T08:05:00Z
  checked: backend/src/config/env.ts
  found: Line 1 `import "dotenv/config"` loads `.env` from process.cwd() only (no .env.test selection by NODE_ENV, no override). loadBaseConfig() calls requireVar(MONGODB_URI) FIRST, before REDIS_URL, NODE_ENV handling, banner or near-miss logic. The exact reported message is the requireVar hint at env.ts:107.
  implication: The reported line is produced whenever MONGODB_URI is absent/blank in process.env after dotenv runs, regardless of NODE_ENV.

- timestamp: 2026-11-06T08:06:00Z
  checked: `ls -la backend/` (existence only, no file contents read)
  found: backend/ contains .env.example (680 B) and .env.test (15 B) but NO .env. Root .gitignore line 3 `.env`; `git ls-files backend` tracks only .env.example and .env.test.
  implication: dotenv/config has nothing to load on this machine; MONGODB_URI can only come from the shell environment.

- timestamp: 2026-11-06T08:07:00Z
  checked: previous UAT round (git show 6710855:.../01-UAT.md, test 2 note)
  found: "Run by Claude at the user's request (node dist/server.js, built 2026-11-05 11:03, env vars passed inline, no backend/.env)."
  implication: backend/.env was already absent on 2026-11-05; earlier manual runs supplied env inline.

- timestamp: 2026-11-06T08:08:00Z
  checked: package.json scripts; CONTEXT D-20; .env.example key names
  found: start = `node dist/server.js`; start:test = `npm run build && node --env-file=.env.test dist/server.js`. D-20: .env.test contains only NODE_ENV=test; MONGODB_URI/REDIS_URL/JWT_SECRET must come from backend/.env via dotenv. .env.example keys: PORT, MONGODB_URI, REDIS_URL, CLIENT_ORIGIN, JWT_SECRET, MONGO_MAX_POOL_SIZE.
  implication: Without backend/.env, start:test fails exactly like start.

- timestamp: 2026-11-06T08:09:00Z
  checked: Windows env scopes User/Machine/Process for MONGODB_URI, REDIS_URL, JWT_SECRET, NODE_ENV, PORT (presence only)
  found: none set in any scope; no VS Code terminal env injection (user settings have no terminal.integrated.env / MONGODB_URI; no .vscode in repo)
  implication: a new cmd.exe window starts with none of the required variables.

- timestamp: 2026-11-06T08:10:00Z
  checked: reproduction in cmd.exe (cwd backend/, inherited env stripped of the app vars)
  found: `cmd /d /c "set NODE_ENV=test && npm run start"` -> only the reported [LỖI] MONGODB_URI line, exit 1. `cmd /d /c "npm run start:test"` -> build output then the same [LỖI] line, exit 1.
  implication: exact symptom reproduced for BOTH commands.

- timestamp: 2026-11-06T08:12:00Z
  checked: differential, same conditions: plain `npm run start` and `npm run seed`
  found: both print the same [LỖI] MONGODB_URI line, exit 1
  implication: NODE_ENV is irrelevant; the Test 1 "pass" cannot have been observed in a shell like this one, so Test 1 most likely ran with session-only variables.

- timestamp: 2026-11-06T08:13:00Z
  checked: counter-test with MONGODB_URI (scratch db flashsale_dbg_g019), REDIS_URL (db 14), random 64-hex JWT_SECRET (never printed), PORT=5099 supplied to cmd
  found: near-miss start -> stdout `NODE_ENV="test "` banner, stderr exactly one `[CẢNH BÁO] NODE_ENV="test " ...` line, health `{"mongo":true,"redis":true,"nodeEnv":"test ","testMode":false,"maxPoolSize":100}`. start:test (clean env) -> stderr `!!! CHẾ ĐỘ TEST ...`, banner NODE_ENV="test", health testMode true. Process trees stopped with taskkill /T on the cmd PIDs I started; scratch DB dropped; Redis db 14 empty.
  implication: the G-01-1 code fix works; the UAT failure is the missing env, not the near-miss code.

- timestamp: 2026-11-06T08:16:00Z
  checked: `cmd /d /c "set NODE_ENV=test && npm run start:test"` with the same supplied vars (simulates running start:test in the same cmd window after the first command, since cmd `set` persists in an interactive window)
  found: banner NODE_ENV="test ", stderr near-miss [CẢNH BÁO] (whose advice says "hoặc chạy npm run start:test"), NO CHẾ ĐỘ TEST, health testMode false
  implication: Node's --env-file does not override variables already in the environment. start:test is not self-sufficient: an inherited NODE_ENV silently defeats it. Latent second cause for Test 2 once backend/.env exists.

- timestamp: 2026-11-06T08:17:00Z
  checked: backend/test/helpers.ts buildChildEnv (SERVER_ENV_KEYS) and health.test '--env-file=.env.test' case
  found: buildChildEnv deletes NODE_ENV (and the other server keys) from the inherited env before spawning, so the .env.test case always starts with NODE_ENV unset
  implication: no automated test covers start:test under an inherited NODE_ENV; that is why cause (2) was not caught.

- timestamp: 2026-11-06T08:18:00Z
  checked: docs/SPECS.md section 12 step 6, REQUIREMENTS DEV-01 (Phase 4), 01-VERIFICATION human test 2 text
  found: automatic creation of backend/.env from .env.example (random JWT_SECRET) is DEV-01 step 6, Phase 4 (pending). No README. The Phase 1 human-verification step for Test 2 does not list backend/.env as a prerequisite.
  implication: In Phase 1 nothing creates backend/.env and the UAT steps never told the user to create it.

## Resolution

root_cause: "(1) Environment, observed: backend/.env does not exist on this machine (gitignored; Phase 1 has no bootstrap, which is DEV-01 step 6 in Phase 4; the UAT steps don't list it as a prerequisite). No MONGODB_URI is set in any Windows env scope, and .env.test holds only NODE_ENV (D-20). So `import \"dotenv/config\"` loads nothing, and loadBaseConfig() fails at its first check, requireVar(MONGODB_URI) (env.ts:107), for BOTH `set NODE_ENV=test && npm run start` and `npm run start:test` (and also for plain start/seed). The G-01-1 near-miss code is not at fault. (2) Latent code/design gap that Test 2 will hit next: start:test relies on `node --env-file=.env.test`, and Node never lets --env-file override a variable already in the environment. After `set NODE_ENV=test && ...` in an interactive cmd window, NODE_ENV=\"test \" stays set, so `npm run start:test` in that same window boots with testMode false and a near-miss warning that tells the user to run npm run start:test. helpers.ts buildChildEnv strips NODE_ENV before spawning, so no test covers this."
fix:
verification:
files_changed: []
