---
phase: 01-foundation-infra-data-auth
reviewed: 2026-11-06T07:24:49Z
depth: standard
files_reviewed: 13
files_reviewed_list:
  - backend/src/app.ts
  - backend/src/config/env.ts
  - backend/src/config/redis.ts
  - backend/src/controllers/health.controller.ts
  - backend/src/server.ts
  - backend/test/boot.test.ts
  - backend/test/config.test.ts
  - backend/test/errors.test.ts
  - backend/test/helpers.ts
  - backend/test/integration/health.test.ts
  - backend/test/integration/models.test.ts
  - backend/test/integration/redis-boot.test.ts
  - backend/test/redis.test.ts
findings:
  critical: 0
  warning: 1
  info: 5
  total: 6
  necessity: 0
status: issues_found
---

# Phase 1: Code Review Report

**Reviewed:** 2026-11-06T07:24:49Z
**Depth:** standard
**Files Reviewed:** 13
**Status:** issues_found

## Summary

This is an incremental re-review of the gap-closure plans 01-06, 01-07 and 01-08 (diff base `c11552d`):
- 01-06: health `testMode`, raw `nodeEnv`, and the near-miss warning
- 01-07: the `express.json` `verify` guard that rejects zero-byte declared-JSON bodies
- 01-08: Redis startup prints one `[LỖI]` line, the whole startup has a 5 s deadline, and runtime disconnect logging is armed only after a successful connect

Checks run:
- `tsc --noEmit` passed.
- `node --import tsx --test test/config.test.ts test/errors.test.ts test/redis.test.ts` passed 50 of 50.
- I did not run the integration suite, because it needs Docker.

Source-level verification:
- **01-07.** I traced body-parser 2.x `read.js`. With `verify` set, the body is read as a raw Buffer after decompression, and `verify` runs before `parse`. That means the `{}` special case for empty bodies is never reached. `createError(403, err, …)` takes `err.status` (400) from the thrown `HttpError` and keeps its prototype, so `errorHandler` matches `instanceof HttpError` and returns `INVALID_JSON`. The comment block in `app.ts:17-27` is accurate.
- **01-08.** `withTimeout(client.connect().then(() => client.ping()), …)` is a single chain whose late rejection is still handled, so it cannot cause an unhandled rejection. The silent `"error"` listener in `createRedis` prevents ioredis `silentEmit` from falling back to `console.error("[ioredis] Unhandled error event")`. The runtime logger is attached only after `connectRedis` succeeds. All three callers (`server.ts:49-51`, `scripts/seed.ts:42-44`, `scripts/reset.ts:45-47`) call `redis.disconnect()` on failure.
- **01-06.** `isTestMode` is the only test-mode decision. `nodeEnv` is display-only and raw. Health reports `testMode`.

Earlier findings:
- **CR-01 is resolved.** `env.ts:132-142`, `health.controller.ts:22` and `server.ts:58-64` match the recommended fix, and `config.test.ts:141-150` plus `health.test.ts:159-191` pin it.
- **IN-02 is mostly resolved.** The near-miss warning now catches CR, trailing-space and wrong-case values. The BOM-in-file case (`\ufeffNODE_ENV` key) still fails closed with no message. That is unchanged and not re-raised here.
- **IN-01 is still present.** It is carried forward as IN-01 below.

New defects: one test-reliability warning, which I confirmed with a scratch reproduction, plus info items. I found no correctness or security blocker in the gap-closure source.

The necessity rubric (`.claude/gsd-core/references/necessity-review.md`) was read. There are no necessity findings, because:
- The near-miss and verify guards act on environment and HTTP input, which cross a trust boundary.
- The silent error listener prevents real ioredis console output.

## Narrative Findings (AI reviewer)

## Warnings

### WR-01: `connectTestStores` leaks a reconnecting Redis client on failure, so `npm run test:int` hangs forever when Redis is down

**File:** `backend/test/helpers.ts:346-351` (callers: `test/integration/health.test.ts:94`, `auth.test.ts:53`, `reset.test.ts:57`, `seed.test.ts:36`)
**Issue:** The 01-08 contract is that `connectRedis` rejects and leaves cleanup to the caller. The production callers clean up (`server.ts:51`, `seed.ts:44`, `reset.ts:47` all call `redis.disconnect()`), but the test helper does not:
```ts
const redis = createRedis(testRedisUrl(redisDb));
await connectRedis(redis);   // rejects -> `redis` is never returned, never disconnected
return { redis };
```
When Redis is not running (the most common way to run `test:int` by mistake), the rejection fails the `before` hook. The callers' `after` hooks then see `stores`/`redis` as `undefined`, so they cannot quit the client. ioredis keeps its default reconnect timers alive, so the test-file subprocess never exits. `package.json` sets neither `--test-timeout` nor `--test-force-exit`, so the whole run hangs instead of failing.

I reproduced this with a scratch test: `createRedis("redis://127.0.0.1:6391/3")` followed by `assert.rejects(connectRedis(c, 1000))`. The `it` passed in 12 ms, but the file was still running when my 25 s guard killed it. `connectMongo` has already succeeded at that point too, which adds a second open handle in files whose `after` does not drop the database.

**Fix:** Disconnect on failure inside the helper. Optionally make `connectRedis` self-cleaning so no future caller can forget:
```ts
export async function connectTestStores(name: string, redisDb: number): Promise<{ redis: Redis }> {
  await connectMongo(testMongoUri(name), 10);
  const redis = createRedis(testRedisUrl(redisDb));
  try {
    await connectRedis(redis);
  } catch (e) {
    redis.disconnect();
    await mongoose.disconnect().catch(() => {});
    throw e;
  }
  return { redis };
}
```
Also consider adding `--test-timeout=120000` to the `test:int` script, so any future handle leak fails the run instead of hanging it.

## Info

### IN-01: Duplicate case-sensitivity test (carried forward from the previous review, still open)

**File:** `backend/test/config.test.ts:106-109`
**Issue:** `"test"` gives true and `"TEST"` gives false. The test at 111-131 asserts both again (`"TEST"` is in `notTest`, and line 130 re-asserts the positive case). The block at 152-190 now asserts `"TEST"` a third time. One rule is pinned in three places.
**Fix:** Delete lines 106-109.

### IN-02: Near-miss test list uses literal invisible characters, contradicting its own comment

**File:** `backend/test/config.test.ts:153`, `:161`, `:162`, `:178`
**Issue:** Line 153 says invisible and non-ASCII characters "được viết bằng escape". Lines 161, 162 and 178 instead contain the raw bytes U+00A0, U+FEFF and U+0435 (checked with `od -c`: `302 240`, `357 273 277`, `320 265`). Line 161 looks the same as line 155 (`"test "`), and line 178 looks like `"test"`. A reviewer cannot see what is being tested. An editor or formatter that normalises NBSP or strips a BOM would silently turn these cases into duplicates (or turn 178 into the exact `"test"` value, which flips the expected result). The `notTest` list at 114-126 already does this correctly.
**Fix:** Use `"test\u00a0"`, `"\ufefftest"` and `"t\u0435st"`, the same as lines 121, 122 and 125.

### IN-03: Warnings printed before `listen` break the "exactly one stderr line" contract when listen then fails

**File:** `backend/src/server.ts:23-26`, `:58-64`, `:68-74`
**Issue:**
- The comment at 56-57 promises one `[LỖI]` line for every startup failure "ở trên". The `CHẾ ĐỘ TEST` and near-miss warnings (58-64) are printed before `listen`, though. So the EADDRINUSE race covered by the listen callback (69-73) produces two stderr lines in test mode or with a near-miss `NODE_ENV`.
- The short-`JWT_SECRET` warning (25) is printed before every failure path, including Mongo down and Redis down.
- The boot tests always use a 43-character secret and no `NODE_ENV`, so they never exercise these combinations.

This matters only if the one-line rule is meant literally for every combination.
**Fix:** Either move the two mode warnings (and optionally the JWT warning) into the successful-`listen` branch next to the banner, or narrow the documented contract to "exactly one `[LỖI]` line".

### IN-04: `mongoose.disconnect()` on startup-failure paths is not guarded, unlike in seed/reset

**File:** `backend/src/server.ts:43`, `:52`
**Issue:** If `mongoose.disconnect()` rejects, `fail(...)` is never reached. The top-level `await` then rejects and Node prints an uncaught error with a stack, which is multi-line stderr and no `[LỖI]` line. `scripts/seed.ts:45` and `scripts/reset.ts:48` already use `.catch(() => {})` for the same call. The chance is low, but the patterns are inconsistent on exactly the path 01-08 hardened.
**Fix:** Use `await mongoose.disconnect().catch(() => {});` on both lines.

### IN-05: Runtime Redis has no command deadline; a connected-but-unresponsive Redis hangs requests indefinitely

**File:** `backend/src/config/redis.ts:14-18`
**Issue:** 01-08 bounds the "accepts but never answers" case at startup (`REDIS_STARTUP_TIMEOUT_MS`), and `pingRedis` bounds health at 1 s. After startup, though, the client has no `commandTimeout`. `maxRetriesPerRequest: 1` (D-19, "từ chối nhanh") only applies when the connection drops. If Redis stays connected but stalls (`docker pause`, a long-running Lua script, `DEBUG SLEEP`), no `"error"` event fires, so nothing is logged, and every V2 buy command in Phase 2 waits forever. Health would turn 503, but buy requests would only end at the client's timeout. This isn't a Phase 1 defect, since there is no Redis command on a request path yet. It's a gap to settle before Phase 2 relies on the D-19 promise.
**Fix:** In Phase 2, decide whether to set `commandTimeout` (for example 2000 ms) in `createRedis`, and map the resulting `Command timed out` error explicitly in `errorHandler` (5xx). Or record in CONTEXT that a stalled Redis is accepted to hang V2 requests.

---

_Reviewed: 2026-11-06T07:24:49Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
