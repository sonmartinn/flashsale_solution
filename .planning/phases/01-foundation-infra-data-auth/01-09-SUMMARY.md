---
phase: 01-foundation-infra-data-auth
plan: 09
subsystem: infra
tags: [dotenv, npm-scripts, node-test, test-mode, windows, cmd, gap-closure]

requires:
  - phase: 01-foundation-infra-data-auth
    provides: "01-06 health testMode/nodeEnv + near-miss warning (G-01-1); 01-08 one-line Redis boot failures (G-01-2); env.ts single isTestMode decision (D-14)"
provides:
  - "start:test = npm run build && dotenv run -q --override -f .env.test -- node dist/server.js (test mode regardless of the NODE_ENV the shell holds)"
  - "Test helper launcher \"start:test\" (START_TEST_SCRIPT, DOTENV_CLI, serverArgv) pinned to package.json by build.test"
  - "killProcessTree: helpers stop the whole wrapper+server tree (taskkill /T /F on Windows), only while the child is alive"
  - "Near-miss [CẢNH BÁO] advice that is true whatever the shell holds"
  - "Runnable human tests: backend/.env prerequisite, pinned env source with a names-only presence check"
affects: [phase-03-loadtest, phase-04-dev-scripts, DEV-01, DEV-04]

actuals:
  tokens: 7107
  tasks: 3
  commits: 4
plan_head_before: d3ee255ff01db28411eee3d4267d2684a12e1237
plan_head_after: 962e559062178f10e0c8b06df1ccd1b4c8ee42ee

tech-stack:
  added: []
  patterns:
    - "Env-file loading with override through the dotenv CLI that ships with the existing dotenv dependency"
    - "Test helpers launch the server through the same argv tokens as the npm script, and build.test pins the script string"
    - "Process-tree stop guarded by exitCode/signalCode so a reused PID is never signalled"

key-files:
  created: []
  modified:
    - backend/package.json
    - backend/test/helpers.ts
    - backend/test/build.test.ts
    - backend/test/integration/health.test.ts
    - backend/test/boot.test.ts
    - backend/src/server.ts
    - backend/.env.example
    - .planning/phases/01-foundation-infra-data-auth/01-CONTEXT.md
    - .planning/phases/01-foundation-infra-data-auth/01-VERIFICATION.md

key-decisions:
  - "start:test uses dotenv run -q --override -f .env.test (CLI of dotenv@18.0.9 already in the lockfile) because Node's env-file flag never overrides a variable the shell already holds"
  - "-q is required: without it the wrapper prints a '◇ injected env' stderr line and breaks the one-line boot-failure contract (proven by mutation)"
  - "Near-miss advice now reads: Muốn bật chế độ test, chạy npm run start:test (lệnh này luôn đặt NODE_ENV=test, kể cả khi shell đang giữ giá trị khác). It no longer suggests the set NODE_ENV=test cmd idiom"
  - "backend/.env stays hand-created in Phase 1 (non-printing, no-overwrite command in the .env.example header); DEV-01 automates it in Phase 4"

patterns-established:
  - "Background starters of start:test (Phase 3/4 scripts) must stop the process tree, not just the wrapper PID"

requirements-completed: [INFRA-02, INFRA-03, AUTH-05]

coverage:
  - id: D1
    description: "npm run start:test boots in test mode even when the shell holds NODE_ENV \"test \", and stopping it frees the port"
    requirement: INFRA-02
    verification:
      - kind: integration
        ref: "backend/test/integration/health.test.ts#npm run start:test khi shell còn giữ NODE_ENV=\"test \" (G-01-9): chế độ test vẫn bật"
        status: pass
      - kind: unit
        ref: "backend/test/build.test.ts#script start:test nạp .env.test bằng dotenv run --override (G-01-9) và khớp với helper"
        status: pass
    human_judgment: false
  - id: D2
    description: "start:test boot failure (MongoDB down, inherited NODE_ENV \"test \") exits 1 with exactly one [LỖI] line through the wrapper"
    requirement: INFRA-03
    verification:
      - kind: unit
        ref: "backend/test/boot.test.ts#npm run start:test khi MongoDB không chạy (shell còn NODE_ENV=\"test \"): thoát mã 1 với đúng một dòng [LỖI] MongoDB"
        status: pass
    human_judgment: false
  - id: D3
    description: "Near-miss [CẢNH BÁO] NODE_ENV line recommends npm run start:test and says it always sets NODE_ENV=test; single isTestMode decision unchanged"
    requirement: AUTH-05
    verification:
      - kind: integration
        ref: "backend/test/integration/health.test.ts#banner in NODE_ENV=\"test \" và stderr có đúng dòng [CẢNH BÁO], không có CHẾ ĐỘ TEST"
        status: pass
    human_judgment: false
  - id: D4
    description: "Real cmd.exe set NODE_ENV=test && npm run start, then npm run start:test in the same window, with real Ctrl+C freeing port 5000; real Redis-down boot with backend/.env as the only env source"
    verification: []
    human_judgment: true
    rationale: "Real cmd.exe set-and-persist behaviour, real Ctrl+C through npm, the .cmd shim and the dotenv wrapper, and stopping the shared Redis container cannot be automated by the verifier. Listed as the two human tests in 01-VERIFICATION.md"
  - id: D5
    description: "Human tests runnable as written: backend/.env prerequisite with a non-printing creation command, explicit env source, D-20 amendment"
    verification:
      - kind: other
        ref: "node .claude/gsd-core/bin/gsd-tools.cjs query frontmatter.get .planning/phases/01-foundation-infra-data-auth/01-VERIFICATION.md --field human_verification | grep -c \"Env source:\" -> 2"
        status: pass
    human_judgment: true
    rationale: "Whether a teammate can follow the documented steps without help is a judgment call; the grep only proves the text is present"

duration: 24h 5m wall clock (includes the tracer checkpoint wait and a rate-limit pause)
completed: 2026-11-07
status: complete
---

# Phase 1 Plan 09: start:test forced test mode (G-01-9) Summary

**`npm run start:test` now runs `dotenv run -q --override -f .env.test -- node dist/server.js`, so a cmd window that still holds `NODE_ENV="test "` boots in test mode. The near-miss warning now gives advice that is actually true, start:test boot failures stay at one `[LỖI]` line, and the Phase 1 human tests list `backend/.env` and a pinned env source as prerequisites.**

## Performance

- **Duration:** 24h 5m wall clock. Active work was much shorter: the span includes the user's tracer checkpoint review and a rate-limit pause.
- **Started:** 2026-11-06T08:32:12Z
- **Completed:** 2026-11-07T08:37:37Z
- **Tasks:** 3/3
- **Files modified:** 9

## Accomplishments

- G-01-9 cause 2 removed. start:test applies `.env.test` with override, so `NODE_ENV` becomes exactly `test` whatever the shell holds. No new package was added: the dotenv CLI ships with dotenv@18.0.9. `env.ts` and its single `isTestMode` comparison are byte-identical.
- The test helper launches the server with the same tokens as the npm script, and build.test pins `package.json` start:test to `START_TEST_SCRIPT`. `killProcessTree` stops the whole wrapper and server tree, and health.test proves the port is freed after stop.
- A start:test boot failure with MongoDB down exits 1 through the wrapper with exactly one `[LỖI]` line. A mutation run proves this test needs `-q`.
- The near-miss `[CẢNH BÁO] NODE_ENV=` advice now says that `npm run start:test` always sets `NODE_ENV=test`, even when the shell holds another value.
- G-01-9 cause 1 is handled in the docs. The `.env.example` header has a non-printing, no-overwrite creation command. 01-VERIFICATION's human tests start with "Prerequisite:" and "Env source:", use a names-only presence check in a fresh Win+R cmd.exe window, and run start then start:test in one window. 01-CONTEXT D-20 is amended.

## Task Commits

1. **Task 1 (tracer): start:test boots in test mode with an inherited NODE_ENV "test "**: `3000b67` (fix). Committed by the previous executor. The user approved the tracer checkpoint ("approved").
2. **Task 2 (tdd): one [LỖI] line through the wrapper + correct near-miss advice**
   - RED: `2d92ced` (test)
   - GREEN: `17fd20c` (feat)
   - REFACTOR: none needed
3. **Task 3: runnable human tests, D-20 amendment, .env.example header**: `962e559` (docs)

**Plan metadata:** this SUMMARY commit (docs).

## TDD Evidence

**Task 1 RED** (previous executor, before the GREEN change). The build.test drift case failed because package.json still held the old Node env-file-flag script. The new health.test describe, started with the old mechanism, failed with `testMode` false and the near-miss `[CẢNH BÁO]` line on stderr. GREEN: typecheck 0, `npm --prefix backend test` 150/150, `test:int` 59/59.

**Task 2 RED.** The target was health.test `banner in NODE_ENV="test " và stderr có đúng dòng [CẢNH BÁO], không có CHẾ ĐỘ TEST`. The command was `node --import tsx --test --test-reporter=tap test/integration/health.test.ts` from backend/, which exited 1 with 10 tests, 9 passing and 1 failing. The classifier (`gsd-tools check tdd-red-evidence`) returned **RED_EVIDENCE_OK** (`target_test_failed`, format tap). Semantic assessment: the target ran and failed on the planned assertion at health.test.ts:232, `warning.includes("luôn đặt NODE_ENV=test")`. The actual line ended with the old advice "Đặt đúng NODE_ENV=test hoặc chạy npm run start:test.", and there was no setup or load fault. The boot.test start:test case was green at RED (151/151), as the plan expected for a regression pin.

**Task 2 GREEN.** I replaced only the advice sentence in server.ts. Results: typecheck 0, `npm --prefix backend test` 151/151 (output contains "npm run start:test khi MongoDB không chạy"), `npm --prefix backend run test:int` 59/59.

**Task 2 mutation.** With `"-q"` removed from `serverArgv`, the boot.test start:test case failed (150 pass, 1 fail). The extra stderr line was `◇ injected env (1) from ...\backend\.env.test`. I restored helpers.ts from a byte-for-byte backup (`git diff --quiet` was clean).

## Files Created/Modified

- `backend/package.json`: start:test now uses `dotenv run -q --override` (Task 1).
- `backend/test/helpers.ts`: adds `START_TEST_SCRIPT`, `DOTENV_CLI`, `ServerLauncher`, `serverArgv` and `killProcessTree` (Task 1).
- `backend/test/build.test.ts`: drift guard comparing package.json start:test with `START_TEST_SCRIPT`, and checks that `DOTENV_CLI` exists (Task 1).
- `backend/test/integration/health.test.ts`: start:test describes now use the launcher, plus the inherited `NODE_ENV "test "` case with a port-freed check (Task 1) and the near-miss advice assertions (Task 2).
- `backend/test/boot.test.ts`: start:test with MongoDB down must give exit 1 and one `[LỖI]` line (Task 2).
- `backend/src/server.ts`: only the near-miss advice sentence changed (Task 2).
- `backend/.env.example`: 6-line Vietnamese header with the creation command (Task 3). CRLF is kept on all lines and `JWT_SECRET=` stays empty.
- `01-CONTEXT.md`: D-20 amendment (Task 3).
- `01-VERIFICATION.md`: `human_verification` frontmatter entries and the "Human Verification Required" body rewritten (Task 3). status, score and overrides are unchanged.

## Decisions Made

- I kept the planned wording for the advice sentence word for word, because it fits the limits the plan set.
- The RED evidence record lives in the session scratchpad and is not committed. Its verdict and assessment are recorded above.

## Deviations from Plan

### Flag (not edited): stale project instructions

**`.claude/CLAUDE.md` still describes start:test with Node's env-file flag** (`node --env-file=.env.test`), both in the "What NOT to Use" table and in the backend package.json / `start:test` notes. That file holds user-owned project instructions, so this plan left it alone, as the plan required. The user should update those notes to `npm run build && dotenv run -q --override -f .env.test -- node dist/server.js` and mention that Node's env-file flag does not override variables the shell already holds.

### Environment issue handled during execution

- **[Rule 3 - Blocking] Docker containers were stopped after the rate-limit pause.** The first Task 2 `test:int` run failed broadly with `ECONNREFUSED 127.0.0.1:27018`, and `docker compose ps` showed no containers. Following the plan's precondition, I ran `docker compose up -d --wait` from the repo root. Both containers became healthy, and the RED run was repeated cleanly. No code changed, and no `down -v` or foreign-process kill was used.

**Total deviations:** 1 environment fix (Rule 3), plus 1 flag for user-owned docs. **Impact:** none on scope.

## Issues Encountered

- When Task 1 was executed, `npm --prefix backend ci` printed an install-scripts warning for esbuild's postinstall. tsx still works and every suite passes.

## Known Stubs

None.

## User Setup Required

Before re-running UAT tests 1 and 2, create `backend/.env` once using the command in the `backend/.env.example` header, as described in 01-VERIFICATION "Human Verification Required". This plan never creates, reads, prints or commits that file.

## Next Phase Readiness

- G-01-9 is closed in code and docs. Phase 1 still needs the two human tests (`status: human_needed`) re-run as now written.
- Phase 3/4 scripts that start start:test in the background must stop the process tree (`taskkill /T` on Windows). This is recorded in D-20.
- The CRLF coincidental-reliance item in 01-VERIFICATION (Node's env-file loader stripping CR) is out of date, because the dotenv parser now loads `.env.test`. The verifier should reassess it.

## Self-Check: PASSED

- Files exist: all 9 modified files are present, and `git diff --name-only d3ee255..HEAD` lists exactly those 9.
- Commits on this branch: `3000b67`, `2d92ced`, `17fd20c`, `962e559` (`git rev-list --count d3ee255..HEAD` = 4 before this SUMMARY commit).
- Plan verification: start:test prints the expected string. The only file changed under backend/src and backend/scripts is server.ts. The `=== "test"` grep finds only env.ts:139, and only env.ts reads `process.env`. typecheck, test (151/151) and test:int (59/59) exit 0. Task 3's frontmatter `Env source:` count is 2, its why_human count is 2, the file-wide count is 3, status is `human_needed` and overrides_applied is 2.

---
*Phase: 01-foundation-infra-data-auth*
*Completed: 2026-11-07*
