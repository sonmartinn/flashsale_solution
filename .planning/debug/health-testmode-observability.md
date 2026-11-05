---
status: diagnosed
trigger: "health-testmode-observability: Test mode must be observable and unambiguous: GET /api/health exposes `testMode: cfg.isTestMode`; nodeEnv shows the raw NODE_ENV value (or the server warns on a near-miss NODE_ENV such as \"test \"), so a padded NODE_ENV can no longer look like test mode while x-test-user is disabled; config.test ('nodeEnv vẫn trim để hiển thị...') and health.test updated accordingly."
created: 2026-11-05T00:00:00Z
updated: 2026-11-05T05:30:00Z
goal: find_root_cause_only
---

## Current Focus

bug_class: Bohrbug (deterministic: pure function of the NODE_ENV string; no timing involved)
known_pattern_candidate: none (no knowledge-base.md exists; .planning/debug/ was empty)
hypothesis: CONFIRMED - H1. The display value `cfg.nodeEnv` and the security flag `cfg.isTestMode` are derived from two different normalisations of the same variable (trimmed via optionalVar vs raw strict equality) in backend/src/config/env.ts:121-126; both observable surfaces (banner server.ts:70, health health.controller.ts:18) print only the trimmed form, health never exposes the flag, and nothing warns on a near-miss, so "test " renders exactly like "test" while isTestMode=false.
test: done - in-process repro (unit) + live differential boot of dist/server.js ("test " vs "test")
expecting: n/a (confirmed)
next_action: Return ROOT CAUSE FOUND to orchestrator (goal find_root_cause_only; no source changes)

reasoning_checkpoint:
  hypothesis: "GET /api/health and the boot banner look like test mode for NODE_ENV='test ' because env.ts:122 builds nodeEnv from the TRIMMED value (optionalVar) while env.ts:126 decides isTestMode from the RAW value, and the only surfaces (health.controller.ts:18, server.ts:70) emit nodeEnv, never isTestMode, with no near-miss branch in server.ts:56."
  confirming_evidence:
    - "Live: NODE_ENV='test ' -> banner '... | NODE_ENV=test | ...', health 200 {mongo:true,redis:true,nodeEnv:'test',maxPoolSize:100}, empty stderr, x-test-user -> 401; NODE_ENV='test' -> identical banner and byte-identical health body, CHẾ ĐỘ TEST on stderr, x-test-user -> 403."
    - "Unit: loadBaseConfig gives nodeEnv 'test' + isTestMode false for 'test ', ' test', 'test<TAB>', '<U+FEFF>test'; real health handler body has no testMode key for any input."
    - "config.test.ts:141-144 asserts padded.nodeEnv === 'test' with isTestMode false (pins the contradiction); 01-05 truth 5 mandated it; D-17 makes nodeEnv the test-mode signal for Phase 3."
  falsification_test: "If health (or banner) for NODE_ENV='test ' differed in any byte from the NODE_ENV='test' case, or carried a field revealing isTestMode, H1 would be false. Observed: identical."
  fix_rationale: "Expose the decision itself (testMode: cfg.isTestMode in health) and make the display lossless or self-flagging (raw nodeEnv, JSON-quoted in banner, and/or a near-miss boot warning computed in env.ts). This removes the lossy proxy instead of patching a consumer."
  blind_spots: "Did not re-run the --env-file=.env.test path (secret guard); relies on REVIEW:33 + passing health.test.ts:104-130 on Node 24.22.1 only (Node 20.19 floor unverified, REVIEW IN-02). Did not exercise a quoted NODE_ENV=\"test \" inside backend/.env via dotenv (dotenv keeps whitespace inside quotes, so it is another trigger of the same root cause, not a different one)."
  candidate_causes:
    - "code: env.ts trimmed-display vs raw-flag divergence; health/banner emit only nodeEnv; no near-miss warning (CONFIRMED)"
    - "design/spec: D-17 contract chose a display string as the test-mode signal; 01-05 truth 5 mandated trimmed display (CONFIRMED, upstream of the code)"
    - "test: config.test.ts:141 and health.test.ts:54/99/119 assert the misleading shape, so no gate could catch it (CONFIRMED contributing)"
    - "environment/data: operator shell padding (cmd `set NODE_ENV=test && ...`), quoted .env value - TRIGGER only, outside the system's control"
    - "environment: --env-file CRLF handling for start:test (ELIMINATED on Node 24, see Eliminated H-alt-2)"
  and_gate: "yes - the misleading state needs BOTH a near-miss NODE_ENV input (environment trigger) AND the lossy, flag-less observability in code (root cause). Only the code side is controllable; the root_cause below is the code/design set."

## Symptoms
<!-- prefilled by orchestrator from UAT; IMMUTABLE -->

expected: With NODE_ENV="test " (padded), the banner and GET /api/health must not report something that looks like test mode while isTestMode is false; health body carries an explicit testMode boolean; a near-miss NODE_ENV is either shown raw or produces a boot warning.
actual: With NODE_ENV="test " the banner and GET /api/health report nodeEnv "test" while isTestMode is false and no "CHẾ ĐỘ TEST" warning is printed. User chose option (b) on REVIEW CR-01 (rated critical).
errors: None reported (silent misleading state, fails closed).
reproduction: UAT Test 1 (.planning/phases/01-foundation-infra-data-auth/01-UAT.md); see 01-REVIEW.md CR-01 and 01-05-PLAN.md truth 5, which mandated trim-for-display.
started: Discovered during UAT 2026-11-05.

## Eliminated

- hypothesis: H-alt-1 (code, security) - the padded NODE_ENV actually enables the x-test-user bypass, i.e. isTestMode itself is wrong and the display is merely reflecting it
  evidence: Live run with NODE_ENV="test " returns 401 UNAUTHORIZED for an x-test-user request on /api/admin/sales, while the exact "test" control returns 403 FORBIDDEN (identity accepted as role user). unit repro: isTestMode false for "test ", " test", "test\t", "<U+FEFF>test". The flag is correct and fails closed; only its observability is broken.
  timestamp: 2026-11-05T05:20:00Z

- hypothesis: H-alt-2 (environment/config) - `npm run start:test` itself yields a padded NODE_ENV (CRLF checkout of backend/.env.test, `git ls-files --eol` = i/lf w/crlf), so the supported path is also affected
  evidence: Not re-run here (secret-file guard blocks reading .env.test; not bypassed). Prior evidence: 01-REVIEW.md:33 probed Node 24.22.1 --env-file with CRLF and trailing-space files -> exactly "test"; health.test.ts:104-130 (--env-file=.env.test) asserts nodeEnv "test" AND the CHẾ ĐỘ TEST warning and passed in 01-VERIFICATION (46/46 integration). The supported path is therefore not the trigger on Node 24; residual risk on Node 20.19 is REVIEW IN-02 (out of scope for this gap, noted as blind spot).
  timestamp: 2026-11-05T05:24:00Z

- hypothesis: H-alt-3 (data) - a BOM-prefixed .env.test (key "<U+FEFF>NODE_ENV") is part of this misleading-display bug
  evidence: Per REVIEW IN-02 that yields NODE_ENV undefined -> nodeEnv "development", isTestMode false. The display then says "development", which is not misleading about test mode (still silent fail-closed, but a different, already-tracked issue; a trim/lowercase near-miss check would not catch it either). Excluded from this root cause.
  timestamp: 2026-11-05T05:24:00Z

## Evidence

- timestamp: 2026-11-05T05:00:00Z
  checked: Phase 0 knowledge base (.planning/debug/knowledge-base.md); MemPalace not used
  found: No knowledge base file exists (debug dir did not exist before this session). No prior pattern.
  implication: Proceed with open investigation.

- timestamp: 2026-11-05T05:02:00Z
  checked: backend/src/config/env.ts:88-92 (optionalVar) and 121-128 (loadBaseConfig tail)
  found: |
    optionalVar returns value.trim() (or undefined for blank). Line 122:
      const nodeEnv = optionalVar(env, "NODE_ENV") ?? "development";   // TRIMMED, comment: "CHỈ dùng để hiển thị"
    Line 126:
      const isTestMode = env["NODE_ENV"] === "test";                    // RAW strict equality
    BaseConfig exposes both nodeEnv:string and isTestMode:boolean; no near-miss flag exists.
  implication: For NODE_ENV="test " the two fields disagree by construction (nodeEnv "test", isTestMode false). env.ts is documented as the ONLY place that reads env vars and decides test mode (line 6), so a near-miss signal can only be computed here without breaking that invariant.

- timestamp: 2026-11-05T05:03:00Z
  checked: backend/src/controllers/health.controller.ts (whole file, 23 lines)
  found: Body is exactly { mongo, redis, nodeEnv: deps.cfg.nodeEnv, maxPoolSize: deps.cfg.mongoMaxPoolSize }. No testMode field. Docstring line 10 says nodeEnv exists so "script đo tải xác nhận chế độ test" (load scripts confirm test mode) - i.e. the endpoint's own contract is to let callers infer test mode from the trimmed display string.
  implication: Health exposes only the lossy display value, never the decision (cfg.isTestMode). Any preflight written against D-17 (`nodeEnv === "test"`) gets a false positive for "test ".

- timestamp: 2026-11-05T05:04:00Z
  checked: backend/src/server.ts:56-58 and 69-71
  found: Boot warning `!!! CHẾ ĐỘ TEST ...` is gated solely on cfg.isTestMode (correctly silent for "test "). Banner prints `NODE_ENV=${cfg.nodeEnv}` (trimmed). There is no branch for "value is a near-miss of test" - nothing tells the operator the value was rejected.
  implication: Second observable surface (banner) shows the same misleading "test"; the absence of the CHẾ ĐỘ TEST line is the only (implicit, easily missed) hint.

- timestamp: 2026-11-05T05:05:00Z
  checked: Tests that lock the behaviour - backend/test/config.test.ts:141-148, backend/test/integration/health.test.ts:54, 99, 119-130, backend/test/helpers.ts:57-58
  found: |
    config.test.ts:141 "nodeEnv vẫn trim để hiển thị nhưng không quyết định chế độ test" asserts padded.nodeEnv === "test" AND padded.isTestMode === false - pins the contradiction as correct.
    health.test.ts:54 and :99 use assert.deepEqual on the whole body { mongo, redis, nodeEnv: "development", maxPoolSize: 100 } - adding a testMode key will fail these two exact-shape assertions (must be updated to include testMode: false).
    health.test.ts:119-130 (--env-file=.env.test) asserts body.nodeEnv === "test" and the CHẾ ĐỘ TEST warning; no testMode assertion and no padded-NODE_ENV server-level case.
    helpers.ts testConfig() builds BaseConfig literally (nodeEnv "development", isTestMode false) - any new BaseConfig field must be added there or typecheck fails.
  implication: The existing suite cannot catch the bug; it actively asserts it. Fix scope must include these tests.

- timestamp: 2026-11-05T05:06:00Z
  checked: Planning provenance - 01-05-PLAN.md truth (line 27), 01-CONTEXT.md D-17 (line 97) and line 147, docs/SPECS.md:156, ROADMAP Phase 3 SC1, REQUIREMENTS EXP-01, 01-REVIEW.md CR-01/IN-02
  found: |
    01-05 truth: "nodeEnv keeps its trimmed display value ... (NODE_ENV "test " displays "test" while isTestMode is false)" - the divergence was explicitly MANDATED by the gap-closure plan (it only fixed the flag, deliberately kept display trimmed).
    D-17: health returns { mongo, redis, nodeEnv, maxPoolSize }; "nodeEnv and maxPoolSize let the Phase 3 harness confirm test mode".
    CONTEXT:147: "Phase 3 depends on: health nodeEnv/maxPoolSize ...".
    SPECS §(line 156): GET /health -> `{ mongo, redis }` only (extra fields are a project decision, so adding testMode does not violate SPECS).
    EXP-01 preflight must check "server ở chế độ test"; ROADMAP P3 SC1 makes E1 INVALID if not in test mode or any 401.
  implication: Root cause is a design/spec-level decision (D-17 contract + 01-05 truth 5) implemented faithfully, not a coding slip. The contract chose a lossy proxy (display string) for a boolean decision.

- timestamp: 2026-11-05T05:07:00Z
  checked: diff -r main-checkout backend/src vs worktree backend/src; dist timestamps; Node version
  found: SRC_IDENTICAL. Main checkout has node_modules (tsx, dotenv) and dist built 2026-11-05 11:03. Node v24.22.1. Worktree backend has no node_modules.
  implication: Repro can import the main checkout's source (byte-identical) read-only.

- timestamp: 2026-11-05T05:15:00Z
  checked: In-process repro (scratchpad repro-health-testmode.mts) - real loadBaseConfig + real createHealthController handler, stub res, unconnected stores, cwd without .env
  found: |
    "test"       -> cfg.nodeEnv "test", isTestMode true,  health {"mongo":false,"redis":false,"nodeEnv":"test","maxPoolSize":100}, no testMode key
    "test "      -> cfg.nodeEnv "test", isTestMode false, health {"mongo":false,"redis":false,"nodeEnv":"test","maxPoolSize":100}, no testMode key
    " test"      -> cfg.nodeEnv "test", isTestMode false, same body as "test"
    "test\t"     -> cfg.nodeEnv "test", isTestMode false, same body as "test"
    "<U+FEFF>test" -> cfg.nodeEnv "test", isTestMode false, same body as "test" (String.prototype.trim strips U+FEFF)
    "TEST"       -> cfg.nodeEnv "TEST", isTestMode false (case differs, so display is NOT misleading)
    "production" -> "production"/false; unset -> "development"/false
  implication: For every trim-only near miss, the health body is byte-identical to the real test-mode body; the decision (isTestMode) is not observable via health at all. H1 confirmed at unit level.

- timestamp: 2026-11-05T05:20:00Z
  checked: Live differential repro (scratchpad live-repro.sh) - compiled backend/dist/server.js (built after last src commit) against the running flashsale-mongo/flashsale-redis, cwd without .env, NODE_ENV passed inline, free port, process started and stopped by this session only (verified gone, no listeners left)
  found: |
    NODE_ENV="test ":
      stdout: API http://localhost:62493 | MongoDB 127.0.0.1:27018/flashsale | Redis 127.0.0.1:6379 | NODE_ENV=test | maxPoolSize=100
      stderr: (empty - no CHẾ ĐỘ TEST, no near-miss warning)
      GET /api/health -> 200 {"mongo":true,"redis":true,"nodeEnv":"test","maxPoolSize":100}
      x-test-user GET /api/admin/sales -> 401 {"message":"Bạn chưa đăng nhập","code":"UNAUTHORIZED"}  (test mode OFF)
    NODE_ENV="test" (control):
      stdout: identical banner text "... | NODE_ENV=test | maxPoolSize=100"
      stderr: !!! CHẾ ĐỘ TEST: header x-test-user được chấp nhận thay cho đăng nhập. KHÔNG dùng ngoài đo tải !!!
      GET /api/health -> 200 {"mongo":true,"redis":true,"nodeEnv":"test","maxPoolSize":100}  (byte-identical to padded case)
      x-test-user GET /api/admin/sales -> 403 FORBIDDEN  (test mode ON, identity accepted as role user)
  implication: End-to-end confirmation. The two observable surfaces (banner, health) cannot distinguish test mode ON from OFF; the only differences are the absence of a stderr line and the auth behaviour. A preflight `health.nodeEnv === "test"` passes on a server that will 401 every x-test-user request. Security is fail-closed (correct); observability is wrong.

- timestamp: 2026-11-05T05:22:00Z
  checked: Invariants a fix must keep - `grep -rnE "===? *['\"]test['\"]" backend/src` and process.env reads outside env.ts
  found: Exactly one match, backend/src/config/env.ts:126 `env["NODE_ENV"] === "test"` (this is the 01-05 acceptance check for the AUTH-05/D-14 single-site rule). Zero process.env reads outside env.ts (env.ts:6 "nơi DUY NHẤT trong src đọc biến môi trường và quyết định chế độ test").
  implication: The REVIEW CR-01 sample for server.ts (`process.env["NODE_ENV"]?.trim().toLowerCase() === "test"`) would break BOTH invariants (2nd `=== "test"` site, env read outside env.ts). The near-miss signal must be computed inside loadBaseConfig and exposed as a BaseConfig field, and must not add a second `=== "test"` line (e.g. compare against a shared constant, or derive from a single raw variable).

- timestamp: 2026-11-05T05:23:00Z
  checked: Downstream consumers of BaseConfig shape and health body
  found: BaseConfig literal built in backend/test/helpers.ts:46-62 (testConfig) and via loadBaseConfig in auth.test.ts configFromNodeEnv; health body consumed only by health.test.ts (deepEqual at :54 and :99, field check at :124-125). No frontend/loadtest packages exist yet (repo root: backend, docs, docker-compose.yml), so no Phase 3 preflight code depends on nodeEnv yet. Seed/reset CLIs call loadBaseConfig but never print nodeEnv.
  implication: Fix blast radius is small and contained to env.ts, health.controller.ts, server.ts (banner/warning), helpers.ts, config.test.ts, health.test.ts (+ D-17/CONTEXT wording). Cheapest moment to change the contract is now, before Phase 3 writes the preflight.

## Resolution

root_cause: |
  (1) backend/src/config/env.ts:122 derives the display field `nodeEnv` from the TRIMMED value (`optionalVar(env, "NODE_ENV") ?? "development"`) while env.ts:126 derives the security flag `isTestMode` from the RAW value (`env["NODE_ENV"] === "test"`), so for any trim-only near miss ("test ", " test", "test<TAB>", "<U+FEFF>test", "test<U+00A0>") nodeEnv is "test" while isTestMode is false;
  (2) the only observable surfaces emit the lossy display value and never the decision: GET /api/health (backend/src/controllers/health.controller.ts:15-20) returns { mongo, redis, nodeEnv, maxPoolSize } with no testMode field, and the banner (backend/src/server.ts:69-71) prints `NODE_ENV=${cfg.nodeEnv}` unquoted; server.ts:56-58 has no near-miss branch, so a rejected value produces no message at all;
  (3) this was by design and is locked in: 01-CONTEXT D-17 made `nodeEnv` the signal the Phase 3 harness uses to "confirm test mode", 01-05 truth 5 mandated "nodeEnv keeps its trimmed display value", and backend/test/config.test.ts:141-148 plus backend/test/integration/health.test.ts:54, 99, 119-130 assert exactly that shape, so no test could catch it.
fix: (not applied - goal find_root_cause_only)
verification: (not applicable - diagnosis only)
files_changed: []
suggested_fix_direction: |
  - env.ts: read `const rawNodeEnv = env["NODE_ENV"]` once; keep `isTestMode = rawNodeEnv === "test"` as the ONLY `=== "test"` literal in src (01-05 grep invariant: exactly one line, env.ts, containing env["NODE_ENV"] -> keep the expression on that line, or update the invariant deliberately); set `nodeEnv` to the raw value when non-blank (else "development"); add a BaseConfig field such as `testModeNearMiss: boolean` = !isTestMode && raw.trim().toLowerCase() equals the same "test" constant. Do NOT read process.env in server.ts (env.ts:6 invariant; the REVIEW CR-01 server.ts snippet violates both invariants).
  - health.controller.ts: add `testMode: deps.cfg.isTestMode`; update the D-17 docstring (scripts must check testMode, not nodeEnv).
  - server.ts: print nodeEnv JSON-quoted in the banner (e.g. NODE_ENV="test ") and `console.warn("[CẢNH BÁO] NODE_ENV=... có ký tự thừa hoặc sai hoa thường: chế độ test KHÔNG bật ...")` when cfg.testModeNearMiss.
  - tests: replace config.test.ts:141 'nodeEnv vẫn trim để hiển thị...' with a case asserting nodeEnv !== "test" (raw "test ") and testModeNearMiss true for the near-miss matrix, false for "test"/"production"/unset/""; keep whitespace-only -> "development"; add `testModeNearMiss`/new field to helpers.ts testConfig(); health.test.ts deepEqual at :54 and :99 must include `testMode: false`; :119-130 assert `testMode: true`; add a server-process case with NODE_ENV "test " asserting health testMode false, nodeEnv not "test", and the near-miss warning on stderr.
  - planning: amend D-17 (health shape adds testMode; Phase 3 preflight / EXP-01 checks testMode === true) and record the override of 01-05 truth 5.
