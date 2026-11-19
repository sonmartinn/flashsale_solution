---
status: diagnosed
trigger: "redis-boot-extra-log-line: With only flashsale-redis stopped, `npm run start` exits 1 with a single Vietnamese [LỖI] line naming Redis 127.0.0.1:6379; the ioredis 'error' listener ('[Redis] mất kết nối: ...') must not add a second line during the startup connect, while still logging runtime disconnects after boot (rate-limited as today). User asked for a thorough fix: cover every startup failure path (Redis refused, Redis timeout, and Mongo/port failures if any listener logs there too) with a test that asserts exactly one stderr line."
created: 2026-11-05T04:46:50Z
updated: 2026-11-05T05:20:00Z
goal: find_root_cause_only
gap: G-01-2 (01-UAT.md test 2 case c)
---

## Current Focus

bug_class: Bohrbug (deterministic; reproduced 100% on every Redis connect-failure flavor)
hypothesis: CONFIRMED. createRedis() attaches its console.error "error" listener at construction, ungated by boot phase. ioredis 6 always emits "error" on the client BEFORE connect() rejects, so the listener prints "[Redis] mất kết nối: ..." and then server.ts's catch prints "[LỖI] ...".
test: done (live repro + 7 failure-flavor probes + runtime-preservation probe)
expecting: n/a
next_action: Return ROOT CAUSE FOUND to the orchestrator (diagnose-only). The fix goes to plan-phase --gaps for G-01-2.

reasoning_checkpoint:
  hypothesis: "The extra stderr line comes from the logging 'error' listener in createRedis() (backend/src/config/redis.ts:19-24). It is active from construction, so it fires during the startup connectRedis(). ioredis emits the socket error as an 'error' event first, then rejects connect() with a generic 'Connection is closed.' on the following 'close'. lastLoggedAt starts at 0, so that first startup error always passes the 10 s rate limiter and prints before fail() prints [LỖI]."
  confirming_evidence:
    - "Live repro (dist/server.js, real Mongo, REDIS_URL=redis://127.0.0.1:6390): exit 1, '819ms [Redis] mất kết nối: connect ECONNREFUSED' then '821ms [LỖI] Không kết nối được Redis ...'"
    - "ioredis 6.0.0 source: Redis.js _connect() registers connectionCloseHandler (reject) on 'close'; stream 'error' -> event_handler.errorHandler -> silentEmit('error') fires first; the connectTimeout branch calls errorHandler(ETIMEDOUT) before destroy/close"
    - "Same 2-line output for ETIMEDOUT (192.0.2.1), ENOTFOUND (no-such-host.invalid), ECONNRESET (fake server resets), RESP parse error (fake server sends HTTP) and NOAUTH (fake server)"
    - "Mongo-down, port-held, and missing-JWT paths print exactly 1 line, because createRedis() is only called at server.ts:47, after those steps"
  falsification_test: "If a client created with NO 'error' listener logging during connect (e.g. a no-op listener only) still printed a '[Redis]' line before [LỖI], the hypothesis would be wrong. The only other writer of '[Redis] mất kết nối' is redis.ts:23 (grep), and ioredis prints only '[ioredis] Unhandled error event' when there are zero listeners (Redis.js silentEmit), so no other source can produce that exact text."
  fix_rationale: "Gate the logging on boot completion (arm it only after connectRedis() resolves), and keep a silent listener attached from construction so ioredis never falls back to '[ioredis] Unhandled error event' + stack. This removes condition (1) of the AND-gate below at its source, for server, seed, and reset at once, and leaves runtime logging and rate limiting unchanged."
  blind_spots: "seed.ts/reset.ts double line was established by code identity, not executed (the auto-mode classifier blocked running reset against the shared demo DB). The listen-callback failure after Redis connected (server.ts:62-68) is reasoned, not triggered: the race window between isPortFree and listen. A real password-protected Redis and a paused container were not run (shared containers); fake servers stood in."
  candidate_causes:
    - "code: logging listener ungated by phase in createRedis() (CONFIRMED)"
    - "library (ioredis 6 design): 'error' event emitted before connect() rejects, and the rejection reason is a generic 'Connection is closed.' (CONTRIBUTING precondition, not changeable)"
    - "config: default retryStrategy reconnect producing a second error (ELIMINATED, see Eliminated)"
    - "environment: Docker Desktop / Windows port-forwarding artifact (ELIMINATED, see Eliminated)"
  and_gate: "yes. The symptom needs BOTH (1) a console.error listener active during the startup connect AND (2) ioredis emitting 'error' before rejecting connect(). (2) is fixed library behaviour, so the fix must remove (1)."

## Symptoms

expected: Each bad-boot case exits with code 1 and a single Vietnamese `[LỖI] ...` line naming the cause. No stack trace, secret never printed.
actual: Case (c), only flashsale-redis stopped: exit 1 but TWO stderr lines: '[Redis] mất kết nối: connect ECONNREFUSED 127.0.0.1:6379' (client 'error' listener, backend/src/config/redis.ts:23) followed by '[LỖI] Không kết nối được Redis tại 127.0.0.1:6379. Chạy "docker compose up -d --wait" ở thư mục gốc.' Cases (a) blank JWT_SECRET, (b) both containers stopped (Mongo fails first after ~6 s), (d) port 5000 held all printed exactly one [LỖI] line.
errors: [Redis] mất kết nối: connect ECONNREFUSED 127.0.0.1:6379
reproduction: UAT test 2 case (c). `docker stop flashsale-redis`, then from backend/ `node dist/server.js` with env PORT=5000 MONGODB_URI=mongodb://127.0.0.1:27018/flashsale REDIS_URL=redis://127.0.0.1:6379 CLIENT_ORIGIN=http://localhost:5173 MONGO_MAX_POOL_SIZE=100 JWT_SECRET=<32+ chars>. Equivalent non-invasive repro: REDIS_URL=redis://127.0.0.1:6390 (nothing listening).
started: Discovered during UAT 2026-11-05 (present since redis.ts listener was written).

## Eliminated

- hypothesis: The extra line comes from ioredis reconnect retries (default retryStrategy) that fire after connect() has already rejected.
  evidence: The [Redis] line is printed BEFORE [LỖI] (819 ms vs 821 ms), and exactly one appears. In the source, the 'error' event precedes the 'close' that rejects connect(). server.ts's catch calls redis.disconnect(), which clears reconnectTimeout before the first retry delay of about 50 ms. The 10 s rate limiter would hide a second retry error anyway.
  timestamp: 2026-11-05T05:00:00Z

- hypothesis: The line is an ECONNREFUSED / Docker Desktop / Windows port-forwarding artifact (environment).
  evidence: Reproduced with a plain dead local port 6390 (no Docker involved), DNS failure ENOTFOUND, unroutable host ETIMEDOUT, and local fake servers (ECONNRESET, RESP parse error, NOAUTH). All give the same 2-line output.
  timestamp: 2026-11-05T05:05:00Z

- hypothesis: The Mongo-down, ensureIndexes-failure, or port-held boot paths also leak a Redis listener line.
  evidence: createRedis() is first called at server.ts:47, after isPortFree (29), connectMongo (34) and ensureIndexes (41), so no Redis listener exists on those paths. Probes: Mongo down (27999) with live Redis gives 1 line after 5579 ms. Port held (5098) gives 1 line after 548 ms. UAT (a) and (b) also gave 1 line.
  timestamp: 2026-11-05T05:10:00Z

- hypothesis: A listen() failure after Redis connected (server.ts:62-68, the EADDRINUSE race) leaks a Redis line.
  evidence: Reasoned, not triggered. Redis is healthy at that point, and fail() calls process.exit(1) synchronously, so ioredis gets no event-loop turn to emit. Mongoose has no logging listeners anywhere in src (grep).
  timestamp: 2026-11-05T05:10:00Z

## Evidence

- timestamp: 2026-11-05T04:46:50Z
  checked: .planning/debug/knowledge-base.md
  found: Does not exist (no prior resolved sessions). MemPalace not used.
  implication: No known-pattern candidate; investigate from scratch.

- timestamp: 2026-11-05T04:50:00Z
  checked: backend/src/config/redis.ts, backend/src/server.ts (worktree == main checkout src, `diff -r` identical; main checkout dist/ built 11:03 contains the same listener)
  found: createRedis() attaches the logging "error" listener unconditionally at construction (redis.ts:19-24), with lastLoggedAt=0 so the FIRST error always prints. server.ts:47-54 calls createRedis() then connectRedis(); on reject it calls fail() which prints [LỖI]. There is no notion of "startup phase" in the listener.
  implication: Any error event ioredis emits during the startup connect will print one "[Redis] mất kết nối" line before [LỖI].

- timestamp: 2026-11-05T04:52:00Z
  checked: ioredis 6.0.0 built/Redis.js _connect() (lines 123-240), built/redis/event_handler.js closeHandler/errorHandler (294-361), silentEmit (561-584)
  found: When the TCP stream fails, stream "error" -> eventHandler.errorHandler -> silentEmit("error", err) -> our listener. THEN stream "close" -> closeHandler -> setStatus("close") -> the connect() promise's connectionCloseHandler rejects with "Connection is closed.", and closeHandler then schedules a reconnect via the default retryStrategy. The connectTimeout path (stream.setTimeout -> destroy + errorHandler(new Error("connect ETIMEDOUT"))) has the same order. Handshake failures (connectHandler -> recoverFromFatalError) also call silentEmit("error") first, then disconnect(true). silentEmit prints "[ioredis] Unhandled error event: <stack>" when the client has zero 'error' listeners.
  implication: The double line is deterministic ordering (error event, then reject), not a race. The rejection never carries the original error. A fix must keep at least one (silent) listener during startup, otherwise ioredis prints a stack trace.

- timestamp: 2026-11-05T04:55:00Z
  checked: Live repro with main-checkout dist/server.js, cwd=%TEMP% (no .env), PORT=5097, real Mongo 127.0.0.1:27018/flashsale, REDIS_URL=redis://127.0.0.1:6390 (nothing listening; shared flashsale-redis untouched). Harness: scratchpad/boot-probe.mjs
  found: exit=1 after 833 ms, 2 stderr lines: "819ms [Redis] mất kết nối: connect ECONNREFUSED 127.0.0.1:6390" then "821ms [LỖI] Không kết nối được Redis tại 127.0.0.1:6390. ..."
  implication: UAT case (c) reproduced exactly without stopping any container.

- timestamp: 2026-11-05T04:57:00Z
  checked: Same harness, REDIS_URL=redis://192.0.2.1:6379 (TEST-NET-1, unroutable -> connectTimeout) and REDIS_URL=redis://no-such-host.invalid:6379 (DNS failure)
  found: timeout: exit=1 after 5632 ms, 2 lines ("[Redis] mất kết nối: connect ETIMEDOUT" then [LỖI]). DNS: exit=1 after 687 ms, 2 lines ("[Redis] mất kết nối: getaddrinfo ENOTFOUND no-such-host.invalid" then [LỖI]).
  implication: Every Redis connect-failure flavor (refused / timeout / DNS) has the same extra line; the fix must be in the listener's startup gating, not per-error-code.

- timestamp: 2026-11-05T05:02:00Z
  checked: scratchpad/boot-probe2.mjs, a local fake "Redis" on an ephemeral port with real Mongo: (reset) accept then destroy; (garbage) reply with an HTTP line; (noauth) reply -NOAUTH to every RESP command
  found: reset: exit 1, "[Redis] mất kết nối: write ECONNRESET" + [LỖI]. garbage: exit 1, "[Redis] mất kết nối: Unknown RESP type 72 "H". Please report this." + [LỖI]. noauth: exit 1, "[Redis] mất kết nối: NOAUTH Authentication required." + [LỖI]. All 2 lines.
  implication: Handshake/protocol failures after TCP connects (via recoverFromFatalError) leak the same line. One gating fix covers all of them.

- timestamp: 2026-11-05T05:04:00Z
  checked: Fake server that accepts TCP and never replies (mode silent): ioredis sends HELLO 3 + CLIENT SETINFO x2 and waits
  found: exit=null after 15 s (killed by harness), 0 stderr lines, no banner. Boot hangs indefinitely. connectTimeout (5 s) only covers the TCP connect phase, and nothing bounds the HELLO/INFO/PING handshake (no commandTimeout, no withTimeout around connectRedis).
  implication: SEPARATE startup failure path, not the reported symptom: "Redis accepts but does not answer" (e.g. a frozen/paused Redis behind a live port forwarder) never fails fast and never prints [LỖI], which conflicts with D-19. If the gap fix adds a startup deadline (e.g. withTimeout around connectRedis), this becomes another "Redis timeout" case for the one-line assertion. (An earlier noauth hang was a fake-server artifact: one reply per chunk for 3 pipelined commands. Fixed in the probe; see the entry above.)

- timestamp: 2026-11-05T05:08:00Z
  checked: Runtime behaviour to preserve. boot-probe2.mjs proxy mode: transparent TCP proxy to real 127.0.0.1:6379; after the banner, cut all proxied sockets and stop listening for 4 s, then listen again
  found: banner at 721 ms; cut at 1234 ms; exactly ONE line "1391ms [Redis] mất kết nối: connect ECONNREFUSED 127.0.0.1:<proxy>" (from the first reconnect attempt; the clean remote close itself emits no 'error'); further reconnect failures in the 4 s outage suppressed by the 10 s rate limiter; reconnect after relisten was silent; process stayed up.
  implication: Runtime logging works today and must be kept. This proxy technique is a working, non-invasive way to test "still logs after boot" in an integration test.

- timestamp: 2026-11-05T05:10:00Z
  checked: Mongo-down (MONGODB_URI 127.0.0.1:27999, Redis live) and port-held (HOLD_PORT=5098) probes; grep of all console.* / .on("error") writers in src, scripts, test
  found: Mongo-down: 1 line "[LỖI] Không kết nối được MongoDB tại 127.0.0.1:27999/flashsale_boot ..." after 5579 ms. Port-held: 1 line "[LỖI] Cổng 5098 đang bị chiếm ..." after 548 ms. The only '[Redis]' writer is redis.ts:23. No mongoose connection listeners exist.
  implication: Mongo and port paths are already clean; the defect is Redis-only.

- timestamp: 2026-11-05T05:12:00Z
  checked: backend/scripts/seed.ts:40-47 and backend/scripts/reset.ts:43-50 (identical to main checkout)
  found: Both CLIs use the same createRedis() -> connectRedis() -> catch { redis.disconnect(); mongoose.disconnect(); fail("Không kết nối được Redis ...") } sequence. Running reset was blocked by the auto-mode classifier (shared demo DB), so this is established by code identity, not execution.
  implication: `npm run seed` and `npm run reset` with Redis down print the same 2 lines. A fix inside createRedis/connectRedis covers all three entry points.

- timestamp: 2026-11-05T05:14:00Z
  checked: Why existing tests did not catch it: backend/test/integration/health.test.ts:68-74 ("Redis không chạy lúc khởi động") and backend/test/boot.test.ts
  found: The Redis-down integration test asserts only `assert.match(r.stderr, /\[LỖI\].*Redis/)` and `/127\.0\.0\.1:6390/`, i.e. a regex over the whole stderr. Extra lines pass. boot.test.ts cases (JWT, REDIS_URL, 27017, port held, Mongo down) use the same "match anywhere" oracle. No test asserts a line count, and no test covers the timeout/handshake/runtime-log behaviours.
  implication: A gate existed but its oracle was too weak (partial match instead of the specified "exactly one [LỖI] line"). The regression test must assert the exact stderr line count.

## Resolution

root_cause: "backend/src/config/redis.ts createRedis() attaches its logging 'error' listener (console.error '[Redis] mất kết nối: ...', lines 19-24) at construction, with no boot-phase gating and lastLoggedAt=0. ioredis 6 always emits the connection error as an 'error' event BEFORE connectRedis()'s client.connect() rejects (with a generic 'Connection is closed.'). So during the startup connect the listener prints one line, then the caller's catch prints the [LỖI] line via fail(). Contributing precondition (AND-gate): that ioredis event-before-reject order is fixed library behaviour, so the listener gating is the only fixable cause. Affects every Redis startup failure flavor (ECONNREFUSED, ETIMEDOUT, ENOTFOUND, ECONNRESET, RESP parse error, NOAUTH) and all three entry points that share createRedis/connectRedis: server.ts, scripts/seed.ts, scripts/reset.ts."
fix: "(diagnose-only, not applied) See Suggested Fix Direction in the return."
verification: "(not applicable: diagnose-only)"
files_changed: []
