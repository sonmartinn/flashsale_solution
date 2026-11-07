---
phase: 01-foundation-infra-data-auth
reviewed: 2026-11-07T00:00:00Z
depth: standard
files_reviewed: 7
files_reviewed_list:
  - backend/.env.example
  - backend/package.json
  - backend/src/server.ts
  - backend/test/boot.test.ts
  - backend/test/build.test.ts
  - backend/test/helpers.ts
  - backend/test/integration/health.test.ts
findings:
  critical: 0
  warning: 4
  info: 7
  total: 11
  necessity: 1
status: issues_found
---

# Phase 01: Code Review Report

**Reviewed:** 2026-11-07T00:00:00Z
**Depth:** standard
**Files Reviewed:** 7
**Status:** issues_found

## Summary

Scope: the G-01-9 change set (diff base `e0e3c25`). `start:test` now goes through `dotenv run -q --override -f .env.test -- node dist/server.js` instead of `node --env-file=.env.test`. The changes also include a reworded near-miss warning in `server.ts`, a `launcher: "start:test"` mode plus `killProcessTree` in the test helpers, and new boot, build and health cases.

I read the installed dotenv 18.0.9 CLI (`node_modules/dotenv/dist/index.cjs`) to check the wrapper's behaviour. It parses `run -q --override -f <path> -- <cmd>`, resolves `-f` against `cwd`, and spawns `node` with `stdio: "inherit"`. It forwards the exit code with `process.exit(code)`. On Windows it kills the child tree with `taskkill /T /F`. When stdin is not a TTY on POSIX, it starts the child detached in a new process group and signals the group. So the core fix is correct: `--override` makes NODE_ENV=test win over a stale `"test "` in the shell, and `dotenv/config` in the server does not override, so `backend/.env` cannot undo it. `npm run typecheck` passes.

Remaining concerns:
- The new Windows kill path can hang the whole test run.
- The claimed guard against drift between the npm script and the helper only works in one direction.
- One warning in `server.ts` breaks the "exactly one stderr line" boot contract that the tests enforce.
- Test mode (an auth bypass) is served on every network interface.

`.env.test` was not read: the secret-read guard blocks it. Its size (15 bytes) matches a single `NODE_ENV=test` line, and IN-02 depends on that assumption.

## Narrative Findings (AI reviewer)

## Warnings

### WR-01: Kill path on Windows can hang the test run forever when `taskkill` fails

**File:** `backend/test/helpers.ts:187-194` (used at `:237-240` and `:379-383`)
**Issue:** `killProcessTree` used to be `child.kill()`, which calls TerminateProcess and is reliable. On win32 it now calls `spawnSync("taskkill", ...)` and ignores the result. If `taskkill` is missing from PATH, is denied, or returns non-zero, nothing has been killed. Both callers then wait with no bound:
- `spawnNodeAndCollect` resolves only on `'close'` (line 245), after the timeout has already "handled" the hang.
- `stop()` does `await exitedPromise` (line 382).

`node --test` has no default per-test timeout. So instead of a clear failure, a failed kill hangs `npm test` / `npm run test:int` indefinitely, and it does so exactly in the case meant to recover from a hung server.
**Fix:** Check the result and fall back, then bound the wait:
```ts
function killProcessTree(child: ChildProcess): void {
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === "win32") {
    const r = spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
    if (r.error !== undefined || r.status !== 0) child.kill(); // at least terminate the direct child
  } else {
    child.kill();
  }
}
// and in stop(): await Promise.race([exitedPromise, sleep(10_000).then(() => { throw new Error("process tree did not exit after kill"); })]);
```

### WR-02: The guard against drift between the `start:test` script and the helper is one-directional, so the tests can pass against a script that behaves differently

**File:** `backend/test/helpers.ts:131-136, 162-178`; `backend/test/build.test.ts:25-32`
**Issue:** The doc comment says the helper "khởi động server theo đúng các token của nó, nên test tích hợp không thể lệch khỏi script thật". That is not what the code does. `build.test` only checks `package.json` against the `START_TEST_SCRIPT` string. `serverArgv` never reads `START_TEST_SCRIPT`: it hard-codes `"run", "-q", "--override", "-f", ".env.test", "--", process.execPath, SERVER_ENTRY`.

So if someone edits both `package.json` and `START_TEST_SCRIPT` together, for example dropping `--override`, `build.test` stays green. Every `launcher: "start:test"` case still passes `--override` and stays green too. That includes the G-01-9 regression test at `health.test.ts:155-196`. Meanwhile the real `npm run start:test` would no longer force NODE_ENV=test.

The helper also runs `process.execPath` where the script runs `node` from PATH, which is a second, undocumented divergence.
**Fix:** Derive argv from `START_TEST_SCRIPT`, so the test exercises whatever the script says:
```ts
const runPart = START_TEST_SCRIPT.split("&&").at(-1)!.trim().split(/\s+/); // ["dotenv","run","-q",...,"node","dist/server.js"]
return runPart.map((tok, i) =>
  i === 0 && tok === "dotenv" ? DOTENV_CLI
  : tok === "node" ? process.execPath
  : tok === ".env.test" || tok === "dist/server.js" ? path.join(BACKEND_ROOT, tok)
  : tok,
);
```
At minimum, assert in `build.test` that `serverArgv("start:test")` contains every flag token of the script.

### WR-03: Short `JWT_SECRET` warning breaks the "exactly one stderr line" boot-failure contract

**File:** `backend/src/server.ts:23-26` (contract stated at `:10`, `:56-57`; enforced by `backend/test/boot.test.ts:5, 27-32`)
**Issue:** The near-miss and test-mode warnings were deliberately moved after the MongoDB and Redis connections (lines 56-57) so that every boot failure prints exactly one stderr line. The `JWT_SECRET < 32` warning still prints before the port check, the MongoDB connect and the Redis connect. With a short secret, every later boot failure prints two stderr lines (`[CẢNH BÁO] JWT_SECRET ...` plus `[LỖI] ...`). This violates D-18/D-19 as written in `boot.test.ts:5`. The tests never catch it, because `TEST_JWT_SECRET` is 43 characters.
**Fix:** Move the length warning into the block after line 54, next to the other startup warnings, and add a boot case with a 10-character secret and a dead MongoDB that asserts a single stderr line.

### WR-04: Test mode (identity taken from `x-test-user`, no auth) is served on every network interface

**File:** `backend/src/server.ts:58-59, 66-68`
**Issue:** `npm run start:test` now always turns test mode on (`--override`), and in test mode `requireAuth` accepts any ObjectId in `x-test-user` as an authenticated user (`src/middlewares/auth.ts:29-33`). `listen(cfg.port)` without a host binds dual-stack `::` on all interfaces. Anyone on the same network, such as a classroom or demo Wi-Fi, can therefore place orders as arbitrary users, provided the Windows firewall allows the port.

The project already restricts MongoDB and Redis to `127.0.0.1` "vì không có mật khẩu" (CLAUDE.md, SPECS §324). The unauthenticated API mode deserves the same treatment.
**Fix:** In test mode, reject non-loopback peers in the `x-test-user` branch:
```ts
const ra = req.socket.remoteAddress ?? "";
if (!(ra === "127.0.0.1" || ra === "::1" || ra === "::ffff:127.0.0.1")) throw new HttpError(403, "x-test-user chỉ nhận từ máy cục bộ", "FORBIDDEN");
```
Or bind to loopback when `cfg.isTestMode`, keeping the existing `isPortFree` reasoning.

## Info

### IN-01: `.env.example` gives two conflicting ways to generate the secret, and one of them prints it

**File:** `backend/.env.example:2-4, 15`
**Issue:** Lines 2-4 stress that the recommended one-liner "không bao giờ in khóa ra màn hình". Line 15, which sits directly above `JWT_SECRET=`, still recommends `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`, which prints the key to the terminal and the scrollback. `src/config/env.ts:179` repeats the printing variant in the missing-secret error.
**Fix:** Point line 15 (and the `env.ts` hint) to the no-print command on line 4, or drop the printing variant.

### IN-02: "start:test chỉ ép riêng NODE_ENV=test" holds only while `.env.test` has a single key

**File:** `backend/.env.example:5-6`; `backend/package.json:14`
**Issue:** `--override` applies to every key in `.env.test`, not just NODE_ENV. Suppose someone later adds, for example, `MONGO_MAX_POOL_SIZE` or `PORT` to `.env.test` to pin measurement settings. That value would then silently beat both the shell and `backend/.env`, and the documented precedence would no longer be true.
**Fix:** Add a comment in `.env.test` saying it must contain only `NODE_ENV=test` because it is loaded with `--override`. Alternatively, add a build-test assertion that its parsed keys are exactly `["NODE_ENV"]`.

### IN-03: Quoted glob in `--test` may not work on the declared minimum Node (20.19)

**File:** `backend/package.json:17-18`
**Issue:** `node --test "test/*.test.ts"` depends on the test runner expanding the glob itself, which arrived in Node 21. `engines` declares `>=20.19.0`. On Node 20 the quoted pattern is not expanded by cmd.exe or bash, so it would be treated as a literal path. This is not verified locally because only Node 24 is installed, and Node 20 is EOL. The point is the mismatch between the `engines` claim and the test tooling.
**Fix:** Either document "tests require Node >=22", or list directories or files explicitly.

### IN-04: Generality without instantiation: `args` option of the spawn helpers has no caller

**File:** `backend/test/helpers.ts:162-166, 196-199, 353-357`
**Category:** necessity
**Issue:** This diff removed the only caller that passed `args` (the old `--env-file=` case in `health.test.ts`). A grep of `backend/test` shows that no call to `spawnServer` or `startServerProcess` passes `args` any more. The option is now dead surface, and so is the guard that rejects `args` with `launcher: "start:test"`. Kept at Info because it lives in test code.
**Fix:** Remove `args` from `SpawnOptions`, `startServerProcess` and `serverArgv`, and re-add it when a case needs node flags.

### IN-05: Boot catch blocks drop the underlying error, so non-"not running" failures are misreported

**File:** `backend/src/server.ts:33-37, 48-54`
**Issue:** Bare `catch {}` turns every `connectMongo` and `connectRedis` failure into "Chạy docker compose up -d --wait". That includes DNS errors, auth failures, a bad replica set name and a wrong db. In those cases the advice is wrong, and the only diagnostic has been thrown away.
**Fix:** Append a short reason while keeping the single line, for example `... tại ${cfg.mongoTarget} (${e instanceof Error ? e.name : "lỗi"}).`, without the URI.

### IN-06: Helper does not clear `DOTENV_*` variables, so a developer shell can break test isolation

**File:** `backend/test/helpers.ts:117-127`
**Issue:** `buildChildEnv` clears only the server's own keys. dotenv 18 reads `DOTENV_PATH`, `DOTENV_OVERRIDE`, `DOTENV_QUIET` and the `DOTENV_CONFIG_*` fallbacks from the environment. A shell with `DOTENV_CONFIG_PATH=.../backend/.env` plus `DOTENV_CONFIG_OVERRIDE=true` would let `dotenv/config` in the child load real values over the test values. `DOTENV_CONFIG_QUIET=false` would add an "injected env" stderr line and fail every single-line assertion. The temporary `cwd` defends against neither.
**Fix:** Also delete keys matching `/^DOTENV_/i` in `buildChildEnv`.

### IN-07: `DOTENV_CLI` is resolved eagerly at import, so the dedicated `build.test` assertion is unreachable on failure

**File:** `backend/test/helpers.ts:142-151`; `backend/test/build.test.ts:31`
**Issue:** `resolveDotenvCli()` runs at module load and throws if `bin.dotenv` is missing. Every test file that imports `helpers.ts` then fails at import, and `assert.ok(existsSync(DOTENV_CLI))` never runs. The check also does not verify what the npm script actually uses, which is the `node_modules/.bin/dotenv` shim.
**Fix:** Resolve lazily (a function called from `serverArgv`), and in `build.test` also assert that `node_modules/.bin/dotenv` (or `dotenv.cmd` on win32) exists.

---

_Reviewed: 2026-11-07T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
