---
phase: 01-foundation-infra-data-auth
plan: 10
subsystem: testing
tags: [node-test, dotenv, start-test, drift-guard, gap-closure]

requires:
  - phase: 01-foundation-infra-data-auth
    provides: "01-09 START_TEST_SCRIPT constant, dotenv run wrapper launcher, G-01-9 regression cases"
provides:
  - "Exported startTestArgv(script) that derives the start:test launcher argv from START_TEST_SCRIPT"
  - "serverArgv(\"start:test\") returns startTestArgv(START_TEST_SCRIPT), so integration and boot cases launch what the script says"
  - "build.test pins constant -> argv (token order, synthetic script, 4 rejected shapes) in addition to package.json -> constant"
  - "Mutation proof that a coordinated script + constant edit now turns the right test red"
  - "01-REVIEW-DISPOSITION WR-02 fixed by 01-10 (open 11 -> 10)"
affects: [phase-01-verification, start:test, test-helpers]

actuals:
  tokens: 2614
  tasks: 2
  commits: 3
plan_head_before: 354162ccae1281c24a0bb9ad9a3b8cb8f8f7891f
plan_head_after: 65290c59b7625054c1769f5a4337bd67ea7435e4

tech-stack:
  added: []
  patterns:
    - "Test launcher argv derived from the single script constant instead of a duplicated hard-coded list"
    - "Replay helper throws on any script shape it cannot replay faithfully (allowlisted token chars, fixed pre-step, required launcher and entry)"

key-files:
  created: []
  modified:
    - backend/test/helpers.ts
    - backend/test/build.test.ts
    - .planning/phases/01-foundation-infra-data-auth/01-REVIEW-DISPOSITION.md

key-decisions:
  - "startTestArgv maps only four tokens (first dotenv -> DOTENV_CLI, node -> process.execPath, .env.test and dist/server.js -> absolute paths); every other token, including every flag, passes through verbatim and in order"
  - "node -> process.execPath is a deliberate, documented divergence from npm's PATH lookup (REVIEW WR-02 second point)"
  - "build.test keeps its own expected-replacement table rather than importing one from helpers, so the mapping is checked independently"

patterns-established:
  - "Drift guard in both directions: package.json == constant, and constant -> launched argv checked token by token"

requirements-completed: [INFRA-02, INFRA-03, AUTH-05]

coverage:
  - id: D1
    description: "start:test launcher argv derived from START_TEST_SCRIPT via exported startTestArgv; serverArgv uses it"
    requirement: INFRA-02
    verification:
      - kind: unit
        ref: "backend/test/build.test.ts#startTestArgv(START_TEST_SCRIPT) giữ mọi token của script theo đúng thứ tự (WR-02)"
        status: pass
      - kind: unit
        ref: "backend/test/build.test.ts#startTestArgv đi theo script được đưa vào: bỏ -q và --override thì argv cũng không còn (WR-02)"
        status: pass
      - kind: unit
        ref: "backend/test/build.test.ts#startTestArgv từ chối script mà helper không phát lại trung thực (WR-02)"
        status: pass
      - kind: other
        ref: "sed -n '/^function serverArgv/,/^}/p' backend/test/helpers.ts | grep -c START_TEST_SCRIPT -> 1"
        status: pass
    human_judgment: false
  - id: D2
    description: "Every start:test integration and boot case runs green through the derived argv"
    requirement: AUTH-05
    verification:
      - kind: integration
        ref: "npm --prefix backend run test:int (59/59, includes G-01-9 describe)"
        status: pass
      - kind: unit
        ref: "npm --prefix backend test (154/154, includes boot.test start:test one-line case)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Coordinated script + constant mutations now caught: M1 (no override) fails G-01-9 case, M2 (no quiet flag) fails boot one-line case"
    requirement: INFRA-03
    verification:
      - kind: manual_procedural
        ref: "M1/M2 mutation runs recorded in this SUMMARY, restored with git checkout, git diff --quiet -- backend exit 0"
        status: pass
    human_judgment: false
  - id: D4
    description: "Helper doc comments describe the derivation, the skipped npm run build segment and the process.execPath substitution"
    verification:
      - kind: other
        ref: "grep gates: no false clause, startTestArgv named above START_TEST_SCRIPT, PATH in startTestArgv JSDoc"
        status: pass
    human_judgment: true
    rationale: "Grep gates prove presence of key terms; whether the Vietnamese prose is accurate and clear needs a reader"

duration: 10min
completed: 2026-11-07
status: complete
---

# Phase 01 Plan 10: start:test drift guard (G-01-V1, WR-02) Summary

**The start:test test launcher now derives its argv from START_TEST_SCRIPT through an exported `startTestArgv`, build.test pins the constant-to-argv link token by token, and two coordinated mutations prove that weakening start:test turns the right test red.**

## Performance

- **Duration:** about 10 min
- **Started:** 2026-11-07T10:14:40Z
- **Completed:** 2026-11-07T10:24:35Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- `startTestArgv(script)` in `backend/test/helpers.ts` replays the last `&&` segment of the script. Leading segments must be exactly `npm run build`. Tokens are restricted to `[A-Za-z0-9._/=-]`, the first token must be `dotenv`, and `dist/server.js` must be present. Any violation throws a Vietnamese Error that names the offending part and says serverArgv/startTestArgv must change together with the script.
- `serverArgv("start:test")` returns `startTestArgv(START_TEST_SCRIPT)`. The hard-coded 9-element list is gone, and helpers.ts has no quoted flag literals left.
- build.test has three new WR-02 cases: token order against the real constant, a synthetic script without -q and --override, and four rejected shapes (an unexpected pre-step, the pre-G-01-9 Node env-file form, a quoted token, and no dist/server.js).
- The comments on START_TEST_SCRIPT, startTestArgv and serverArgv now describe the mechanism, including the deliberate `process.execPath` substitution for the `node` that npm finds on PATH.
- WR-02 is recorded as fixed by 01-10 in 01-REVIEW-DISPOSITION.md. 10 findings remain open.

## Task Commits

1. **Task 1 (tracer), RED:** `766578b` (test). startTestArgv stub, serverArgv wired to it, three failing build.test cases.
2. **Task 1 (tracer), GREEN:** `4cd13f7` (feat). Real startTestArgv plus corrected doc comments.
3. **Task 2:** `65290c5` (docs). Mutation proof done, WR-02 disposition recorded.

## Task 1 RED evidence (stub = old hard-coded list)

`npm --prefix backend test` exited 1: tests 154, pass 152, fail 2. The token-order case passed, as expected, because the stub matched the current script.

- `startTestArgv đi theo script được đưa vào: bỏ -q và --override thì argv cũng không còn (WR-02)` failed with `AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal`. The actual argv had the extra `'-q'` and `'--override'` entries after `'run'`.
- `startTestArgv từ chối script mà helper không phát lại trung thực (WR-02)` failed with `AssertionError [ERR_ASSERTION]: Missing expected exception (Error): npm run lint && dotenv run -q --override -f .env.test -- node dist/server.js`.

GREEN: typecheck exited 0. `npm --prefix backend test` exited 0 (154/154, all three WR-02 cases pass). `npm --prefix backend run test:int` exited 0 (59/59, including `chạy như npm run start:test ...` and `npm run start:test khi shell còn giữ NODE_ENV="test " (G-01-9): chế độ test vẫn bật`). The tracer gate (interactive, end-of-phase, automated-only verify) re-ran green, so the plan continued to expansion.

## Task 2 mutation proof

**M1: removed `--override` from both `backend/package.json` start:test and START_TEST_SCRIPT, keeping them identical.**
- `npm --prefix backend test` exited 0: tests 154, pass 154, fail 0. build.test stays green under the coordinated edit, as expected.
- `node --import tsx --test --test-concurrency=1 test/integration/health.test.ts`, run from backend/, exited 1: tests 10, pass 9, fail 1. The one failure was `health báo testMode true, nodeEnv "test", có CHẾ ĐỘ TEST và không có cảnh báo NODE_ENV gần giống`, with `false !== true` on testMode. stderr showed the near-miss warning `[CẢNH BÁO] NODE_ENV="test " gần giống "test" nhưng không khớp chính xác ...`. The clean-env start:test describe stayed green.
- Restored with `git checkout -- backend/package.json backend/test/helpers.ts`. `git diff --quiet -- backend` exited 0.

**M2: removed `-q` from both strings, keeping them identical.**
- `npm --prefix backend test` exited 1: tests 154, pass 153, fail 1. The one failure was `npm run start:test khi MongoDB không chạy (shell còn NODE_ENV="test "): thoát mã 1 với đúng một dòng [LỖI] MongoDB`, with `2 !== 1` stderr lines. The extra line was the dotenv banner `◇ injected env (1) from <backend>\.env.test`, followed by the expected `[LỖI] Không kết nối được MongoDB tại 127.0.0.1:27999/flashsale_boot. ...`.
- Restored with the same git checkout. `git diff --quiet -- backend` exited 0, `git status --porcelain -- backend` printed nothing, and the start:test script reads exactly `npm run build && dotenv run -q --override -f .env.test -- node dist/server.js`.

Before this plan, both coordinated edits left every test green.

## Files Created/Modified

- `backend/test/helpers.ts`: new exported `startTestArgv`, serverArgv wired to it, three doc comments rewritten.
- `backend/test/build.test.ts`: imports startTestArgv, adds its own replacement table and three WR-02 cases. The existing package.json pin case is unchanged.
- `.planning/phases/01-foundation-infra-data-auth/01-REVIEW-DISPOSITION.md`: WR-02 marked `fixed` (01-10, VERIFICATION gap G-01-V1), `open: 10`.

## Decisions Made

- The rejected env-file case builds its flag from parts (`["--env", "file"].join("-")`) so the test source does not spell the old pre-G-01-9 command verbatim. The plan allowed either form.
- Error messages go through a local `fail(detail): never` helper, so every message has the same "update serverArgv/startTestArgv together with the script" suffix.

## Deviations from Plan

None. The plan was executed as written.

`backend/node_modules` was missing in the fresh worktree, so `npm --prefix backend ci` ran first, as the plan's step 1 allows. No new packages were installed and the lockfile is unchanged. npm reported that the esbuild postinstall was not on its allowScripts list. tsx still worked, and every suite ran.

## Issues Encountered

- The worktree isolation guard rejected compound Bash commands that touch git paths or pass sed a variable path. The work was split into plain commands. The plan ledger file in the git dir was not written; commits were measured directly against the known base `354162c`.

## Threat Flags

None. No new network, auth, file-access or schema surface. Changes are limited to test helpers and a planning record.

## User Setup Required

None.

## Next Phase Readiness

- The G-01-V1 gap (01-VERIFICATION gaps[0]) is closed in code. Phase verification can be re-run.
- The G-01-9 human re-test in 01-VERIFICATION `human_verification` still needs a person, as before.
- WR-01, WR-03, WR-04 and IN-01..IN-07 remain open in 01-REVIEW-DISPOSITION.md, out of this plan's scope.

---
*Phase: 01-foundation-infra-data-auth*
*Completed: 2026-11-07*
