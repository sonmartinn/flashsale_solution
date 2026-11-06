---
phase: 01-foundation-infra-data-auth
plan: 07
subsystem: api
tags: [express, body-parser, error-contract, invalid-json, gap-closure]

requires:
  - phase: 01-foundation-infra-data-auth
    provides: "createApp() with the single express.json(), HttpError, errorHandler INVALID_JSON mapping (01-02); startApp() test helper"
provides:
  - "express.json({ verify: rejectEmptyJson }) guard: any declared-JSON zero-byte body (CL 0, empty chunked, gzip-of-empty) -> 400 INVALID_JSON"
  - "errors.test framing matrix with a raw node:http rawPost helper"
  - "01-CONTEXT D-15 row and Phase 2/3/4 rule: body-less POSTs omit Content-Type; reset handler reads req.body ?? {}"
affects: [phase-02-admin-reset, phase-03-harness, phase-04-frontend-api-helper]

actuals:
  tokens: 2860
  tasks: 2
  commits: 3
plan_head_before: f8288fea89290438ba326dcc142a872709651443
plan_head_after: 33d908da18b754c464c6876544c36281ea1cd405

tech-stack:
  added: []
  patterns:
    - "body-parser verify hook as the guard for zero-byte JSON payloads (sees decoded buffer for every framing)"
    - "Clients send Content-Type: application/json only together with a body"

key-files:
  created: []
  modified:
    - backend/src/app.ts
    - backend/test/errors.test.ts
    - .planning/phases/01-foundation-infra-data-auth/01-CONTEXT.md

key-decisions:
  - "Zero-byte declared-JSON bodies are rejected in express.json's verify hook (not a Content-Length pre-check, not strict), per UAT test 4 / G-01-4"
  - "Body-less POSTs (Phase 2 admin reset without mode) must omit Content-Type; the reset handler reads req.body ?? {}"

patterns-established:
  - "rawPost(url, headers, body?) in errors.test for framings fetch cannot express (chunked, gzip)"

requirements-completed: [INFRA-05]

coverage:
  - id: D1
    description: "A declared-JSON zero-byte body (Content-Length 0, charset=utf-8, empty chunked, gzip of empty) answers 400 { message: 'Body JSON không hợp lệ', code: 'INVALID_JSON' } through the real createApp"
    requirement: INFRA-05
    verification:
      - kind: unit
        ref: "backend/test/errors.test.ts#body rỗng với content-type JSON (Content-Length: 0): 400 INVALID_JSON"
        status: pass
      - kind: unit
        ref: "backend/test/errors.test.ts#body rỗng với content-type JSON; charset=utf-8: 400 INVALID_JSON"
        status: pass
      - kind: unit
        ref: "backend/test/errors.test.ts#body rỗng gửi chunked (transfer-encoding: chunked) với content-type JSON: 400 INVALID_JSON"
        status: pass
      - kind: unit
        ref: "backend/test/errors.test.ts#body gzip của chuỗi rỗng với content-type JSON: 400 INVALID_JSON"
        status: pass
    human_judgment: false
  - id: D2
    description: "Body-less POSTs without Content-Type still reach routing (404 unknown path, 400 VALIDATION_ERROR from register); '{}' still routes; whitespace-only stays 400 INVALID_JSON; the rest of the error contract is unchanged"
    requirement: INFRA-05
    verification:
      - kind: unit
        ref: "backend/test/errors.test.ts#POST không body, không content-type vẫn tới routing: 404 NOT_FOUND"
        status: pass
      - kind: unit
        ref: "backend/test/errors.test.ts#POST không body, không content-type tới /api/auth/register: 400 VALIDATION_ERROR (handler nhận req.body undefined)"
        status: pass
      - kind: unit
        ref: "backend/test/errors.test.ts#body \"{}\" với content-type JSON vẫn tới routing: 404 NOT_FOUND"
        status: pass
      - kind: unit
        ref: "backend/test/errors.test.ts#body chỉ có khoảng trắng với content-type JSON: 400 INVALID_JSON"
        status: pass
      - kind: unit
        ref: "npm --prefix backend test (141/141 pass)"
        status: pass
    human_judgment: false
  - id: D3
    description: "01-CONTEXT records the D-15 amendment and the Phase 2/3/4 body-less POST rule"
    verification:
      - kind: other
        ref: "grep -c 'req.body ?? {}' and 'G-01-4' in 01-CONTEXT.md (both 1)"
        status: pass
    human_judgment: true
    rationale: "Planning prose for later phases; whether the wording is sufficient is a reader judgment"

duration: 4min
completed: 2026-11-06
status: complete
---

# Phase 1 Plan 07: Empty JSON body rejection (G-01-4) Summary

**`express.json({ verify: rejectEmptyJson })` turns every zero-byte declared-JSON body (Content-Length 0, empty chunked, gzip of empty) into 400 INVALID_JSON, while body-less POSTs without Content-Type still route with `req.body` undefined**

## Performance

- **Duration:** about 4 min
- **Started:** 2026-11-06T07:01:21Z
- **Completed:** 2026-11-06T07:04:57Z
- **Tasks:** 2
- **Files modified:** 3 (plus REQUIREMENTS.md tracking)

## Accomplishments

- Closed UAT gap G-01-4. `backend/src/app.ts` now has a module-level `rejectEmptyJson(_req, _res, buf)` that throws `HttpError(400, "Body JSON không hợp lệ", "INVALID_JSON")` when `buf.length === 0`. It is wired as the `verify` option of the single `express.json()`. No logging and no change to errorHandler.
- errors.test now pins the exact result for every framing and also proves that the supported body-less shape (no Content-Type) still routes.
- 01-CONTEXT: the D-15 `INVALID_JSON` row covers the zero-byte case (amended by G-01-4), and the Integration Points tell Phases 2, 3 and 4 how to send body-less POSTs.

## Task Commits

1. **Task 1 (tracer): empty declared-JSON body gives 400 through the real app**
   - RED `8f11f16` (test): tightened the Content-Length 0 case to exact 400 INVALID_JSON
   - GREEN `74c7664` (feat): verify guard in app.ts
2. **Task 2: every zero-byte framing gets 400, body-less POSTs still route, plus the client rule** - `33d908d` (test)

**Plan metadata:** recorded in the docs commit that adds this SUMMARY.

## TDD / Mutation Evidence

- **RED (Task 1):** with only the test change at HEAD `f8288fe`, `node --import tsx --test --test-reporter=tap test/errors.test.ts` exited 1: 13 tests, 12 pass, 1 fail. The failing test was the target, `body rỗng với content-type JSON (Content-Length: 0): 400 INVALID_JSON`, on its status assertion (`expected: 400`, `actual: 404`). Semantic assessment: valid RED. The target ran and failed on the planned assertion, because the empty body was parsed to `{}` and reached routing (404 NOT_FOUND). There was no load, syntax or fixture fault. The `gsd tdd-red-evidence` classifier was not run, because it needs the record file inside the project tree and this plan's file scope does not include one. The TAP output was kept in the scratchpad.
- **GREEN (Task 1):** after the app.ts change, typecheck passed and `npm --prefix backend test` passed 134/134.
- **Mutation (Task 2):** the parser line was temporarily set back to plain `express.json()`, and `npm --prefix backend test` then reported 141 tests, 137 pass, 4 fail. The four failures were Content-Length 0, charset=utf-8, chunked and gzip-of-empty, each with `expected: 400`, `actual: 404`. All other new cases (whitespace, no-CT 404, no-CT register 400, `{}` 404) passed either way, as expected, because they do not depend on the guard. app.ts was then restored with `git checkout -- backend/src/app.ts`, and `git diff 74c7664 -- backend/src/app.ts` was empty (byte-identical).
- **Final:** typecheck passed, and `npm --prefix backend test` passed 141/141 (build included, because `npm test` runs `npm run build` first).

## Files Created/Modified

- `backend/src/app.ts`: `rejectEmptyJson` verify guard with a Vietnamese comment; `app.use(express.json({ verify: rejectEmptyJson }))`
- `backend/test/errors.test.ts`: `rawPost` helper (node:http), the rewritten Content-Length 0 case, and seven new cases
- `.planning/phases/01-foundation-infra-data-auth/01-CONTEXT.md`: D-15 row, amendment line, and the Phase 2/3/4 integration notes
- `.planning/REQUIREMENTS.md`: INFRA-05 marked complete (`requirements.ready-ids` reported it ready)

## Decisions Made

- Followed the plan's mechanism exactly (verify hook, HttpError, no `strict`, no Content-Length pre-check).
- Split Task 1 into RED (`test`) and GREEN (`feat`) commits so the TDD gate log shows RED before GREEN.

## Deviations from Plan

None. The plan was executed exactly as written. The only procedural addition was the separate RED commit in Task 1.

## Issues Encountered

- `npm ci` warned that esbuild's postinstall script is not covered by allowScripts. tsx worked anyway (the platform binary ships as an optional dependency), so no action was taken.
- test:int was deliberately not run, as the plan scopes it out (01-08 uses the shared test databases in this wave). The phase verifier runs it after merge.

## User Setup Required

None.

## Next Phase Readiness

- G-01-4 is closed in code and tests. Phase 2's admin reset must read `req.body ?? {}`, and its callers must omit Content-Type when they send no body. The Phase 4 API helper must set Content-Type only together with a body.

## Self-Check: PASSED

- 01-07-SUMMARY.md exists. The commits 8f11f16, 74c7664, 33d908d and 84c4f03 are all on HEAD (`git log f8288fe..HEAD`), and the working tree is clean.

---
*Phase: 01-foundation-infra-data-auth*
*Completed: 2026-11-06*
