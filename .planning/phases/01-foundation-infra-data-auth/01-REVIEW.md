---
phase: 01-foundation-infra-data-auth
reviewed: 2026-11-04T23:00:00Z
depth: standard
files_reviewed: 3
files_reviewed_list:
  - backend/src/config/env.ts
  - backend/test/auth.test.ts
  - backend/test/config.test.ts
findings:
  critical: 1
  warning: 0
  info: 2
  total: 3
  necessity: 0
status: issues_found
---

# Phase 1: Code Review Report

**Reviewed:** 2026-11-04T23:00:00Z
**Depth:** standard
**Files Reviewed:** 3
**Status:** issues_found

## Summary

Scope: the exact-match `isTestMode` change (diff base `7550d39`). `env.ts` now sets `isTestMode` with a raw `env["NODE_ENV"] === "test"`. The new tests in `config.test.ts` and `auth.test.ts` pin that behaviour, both at unit level and end to end through `loadBaseConfig -> requireAuth -> HTTP`.

Checks run:
- `tsc --noEmit` passed.
- `node --import tsx --test test/config.test.ts test/auth.test.ts` passed 53 of 53.
- I tested the `--env-file` loader on Node 24.22.1 with scratch files. It strips CR and trailing spaces, so the CRLF checkout of `backend/.env.test` (`git ls-files --eol`: `w/crlf`) still gives exactly `"test"`.

The comparison itself is correct and fails closed, which matches SPECS §7 and AUTH-05. The defect is around it: the display/health value `nodeEnv` is still trimmed. So in the exact case this change targets (`set NODE_ENV=test && ...`), the server reports `NODE_ENV=test` while test mode is off. The new test at `config.test.ts:141-148` locks in that inconsistency.

Necessity rubric (`.claude/gsd-core/references/necessity-review.md`) was read. No necessity findings: the raw comparison guards environment input crossing a trust boundary.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: `nodeEnv` (banner + `/api/health`) reports "test" while `isTestMode` is false, which defeats the load-test preflight

**File:** `backend/src/config/env.ts:121-126` (consumers: `backend/src/controllers/health.controller.ts:18`, `backend/src/server.ts:56-71`; locked in by `backend/test/config.test.ts:141-144`)

**Issue:** After this change, the two fields come from different versions of the same variable:
- `nodeEnv = optionalVar(env, "NODE_ENV")`, which is **trimmed**
- `isTestMode = env["NODE_ENV"] === "test"`, which is **raw**

For `NODE_ENV="test "`, which is the cmd `set NODE_ENV=test && npm start` value that the comment on line 125 cites as the reason for the change:
- The startup banner prints `NODE_ENV=test` (`server.ts:70`).
- `GET /api/health` returns `{"nodeEnv":"test", ...}` (`health.controller.ts:18`).
- The `CHẾ ĐỘ TEST` warning is **not** printed (`server.ts:56`). Nothing tells the operator that the value was rejected.
- Every `x-test-user` request gets 401.

The health controller's own docstring (`health.controller.ts:10`) says `nodeEnv` exists so load scripts can confirm test mode. `01-CONTEXT.md:147` says Phase 3 depends on health `nodeEnv`. EXP-01 requires a preflight check that the "server ở chế độ test". A preflight written against that contract (`health.nodeEnv === "test"`) passes on a server that is not in test mode. E1 then fires its burst and gets only 401s. 4xx responses don't count as errors under the project's measurement rules (only 5xx and connection errors count), so the run records 0 orders. For V0 that reads as "did not oversell", the opposite of the result the experiment exists to show.

The test at `config.test.ts:141-144` ("nodeEnv vẫn trim để hiển thị nhưng không quyết định chế độ test") asserts `nodeEnv === "test"` together with `isTestMode === false`. That locks in the contradiction instead of catching it.

**Fix:** Have health report the actual decision, and make the display show the raw value so it can't look like `"test"`:
```ts
// env.ts: keep the raw value for display. JSON.stringify makes "test " visible.
const rawNodeEnv = env["NODE_ENV"];
const nodeEnv = rawNodeEnv === undefined || rawNodeEnv.trim() === "" ? "development" : rawNodeEnv;
const isTestMode = rawNodeEnv === "test";

// health.controller.ts: give scripts the boolean they actually need to check
res.status(...).json({ mongo, redis, nodeEnv: deps.cfg.nodeEnv, testMode: deps.cfg.isTestMode, maxPoolSize: ... });

// server.ts: tell the operator when a near-miss value was rejected
if (!cfg.isTestMode && process.env["NODE_ENV"]?.trim().toLowerCase() === "test") {
  console.warn(`[CẢNH BÁO] NODE_ENV=${JSON.stringify(process.env["NODE_ENV"])} có ký tự thừa: chế độ test KHÔNG bật. Dùng "npm run start:test".`);
}
```
(Or compute a `testModeNearMiss` flag in `env.ts`, so `env.ts` stays the only place that reads `NODE_ENV`.) Then change `config.test.ts:141-144` to assert that `nodeEnv` does not equal `"test"` (or that `testMode` is false in health) for `"test "`, and update the `health.test.ts` expectations (`nodeEnv`/`testMode`). Phase 3 preflight should check `testMode === true`, not `nodeEnv`.

## Info

### IN-01: The old case-sensitivity test is fully covered by the new exact-match test

**File:** `backend/test/config.test.ts:106-109`, `backend/test/config.test.ts:130`
**Issue:** The test at lines 106-109 checks `"test"` gives true and `"TEST"` gives false. The new test at 111-131 checks both again: `"TEST"` is in `notTest`, and line 130 re-asserts the positive case. Two tests pin one rule, so a future semantic change has to edit both.
**Fix:** Delete lines 106-109, or drop `"TEST"` and the line-130 assertion from the new test and keep the old one as the positive and case check.

### IN-02: Exact match now depends on loader normalisation that is only checked on the Node version in use

**File:** `backend/src/config/env.ts:126` (input: `backend/.env.test`, checked out CRLF on Windows; `package.json` `engines.node >=20.19.0`)
**Issue:** Before this change, `trim()` hid any `\r` or trailing space that the loader left in `NODE_ENV`. Now the comparison only works if the loader strips them. Node 24.22.1 does (I checked with a scratch CRLF file), and `health.test.ts:107-129` covers the `--env-file` path, but only on whatever Node runs the suite. Nothing in the repo shows the same behaviour on the 20.19 floor. There's also a related trap: a `.env.test` re-saved with a UTF-8 BOM gives key `\ufeffNODE_ENV`. I checked that on Node 24: `NODE_ENV` ends up `undefined`. That also fails closed with no message. It isn't a regression, but CR-01's near-miss warning would not catch it either.
**Fix:** Add the CR-01 near-miss warning. Optionally add `backend/.env.test text eol=lf` to `.gitattributes` so the file has no CR on any platform. Either run the integration suite once on Node 20.19, or note in README that it was tested on Node 24.

---

_Reviewed: 2026-11-04T23:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
