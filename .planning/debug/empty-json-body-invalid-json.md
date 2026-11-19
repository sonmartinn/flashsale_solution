---
status: diagnosed
trigger: "empty-json-body-invalid-json: A request that declares Content-Type: application/json but sends an empty body (Content-Length: 0, or an empty chunked body) yields 400 { code: INVALID_JSON } like any malformed body, never {} and never 500; a body-less POST that sends no Content-Type still reaches routing unchanged (req.body undefined, handlers treat it as no input), so Phase 2 buy/admin POSTs, the E1 harness and autocannon keep working as long as they omit Content-Type when sending no body; errors.test 'body rỗng với content-type JSON' asserts 400 INVALID_JSON exactly, plus a new test for the no-Content-Type body-less POST."
created: 2026-11-05T00:00:00Z
updated: 2026-11-05T00:15:00Z
goal: find_root_cause_only
---

## Current Focus

bug_class: Bohrbug (deterministic library behaviour, no concurrency)
hypothesis: CONFIRMED. body-parser 2.4.0 json() special-cases a zero-length payload to {} (lib/types/json.js:77-80 and 104-108), and backend/src/app.ts:23 mounts bare express.json() with no hook to reject it, so CT-json + zero-byte payloads (CL:0, empty chunked, compressed-empty) reach routing as {} instead of 400 INVALID_JSON.
test: done (Matrix A/B/C/D in exp.mjs, method edge cases in exp2.mjs)
expecting: n/a
next_action: Return ROOT CAUSE FOUND to orchestrator (goal find_root_cause_only); fixer applies express.json({ verify }) in backend/src/app.ts and tightens errors.test.

reasoning_checkpoint:
  hypothesis: "Empty JSON bodies yield {} because body-parser 2.4.0's json parse() returns {} for body.length === 0 before any strict check, and app.ts:23 uses express.json() without a verify hook, so no error with type entity.parse.failed (or HttpError INVALID_JSON) is ever raised for a zero-byte declared-JSON payload."
  confirming_evidence:
    - "Matrix A: CT json + CL 0, CT json + empty chunked, CT json + gzip(empty) all return 200 with req.body = {} on express 5.3.0 / body-parser 2.4.0"
    - "Source: lib/types/json.js:77-80 (strict) and 104-108 (non-strict) both `return {}` on empty; lib/read.js:174 runs verify on the empty Buffer before parse"
    - "Matrix C/D: adding verify that throws on buf.length === 0 turns exactly those cases into 400 INVALID_JSON while no-CT body-less POSTs, '{}' and '{\"qty\":1}' are unchanged"
  falsification_test: "If a CT-json + CL:0 request still returned {} with the verify hook installed, or if a no-CT body-less POST started returning 400, the hypothesis/fix location would be wrong. Neither happened."
  fix_rationale: "verify is the only body-parser hook that observes the decoded-length payload for every declared-JSON request (incl. chunked and compressed) and is skipped for no-CT / no-framing requests, so rejecting buf.length === 0 there addresses the hard-coded {} special case directly instead of guessing from headers."
  blind_spots: "Did not run the real backend test suite (worktree has no node_modules; source must not be modified). Scratch errorHandler is a faithful copy minus mongoose branches. Did not measure the verify-path overhead (Buffer read + iconv.decode instead of raw-body decoding) under autocannon; expected negligible for 9-byte bodies and identical for V0/V1/V2."
  candidate_causes:
    - "code: app.ts:23 bare express.json() with no verify/empty-body guard (CONFIRMED)"
    - "config/dependency: body-parser 2.4.0 hard-coded empty-body special case, not configurable via strict/type (CONFIRMED contributing, cannot be changed in-repo)"
    - "process/test: errors.test.ts:72 weakened to status < 500 during 01-02 execution, so the 01-02 truth was never enforced (CONFIRMED contributing: why it was not caught)"
    - "data/client: Phase 2 clients sending body-less POSTs with CT json (ELIMINATED as a reason to keep {}: buy sends {qty:1}; only optional-body admin reset is affected)"
  and_gate: "yes - the deviation needs both the library special case AND the app not adding a guard; the test weakening is why it shipped. The actionable in-repo cause is the missing guard in app.ts."

## Symptoms

expected: 01-02 truth: "an empty, malformed or JSON-primitive body yields 400 INVALID_JSON, never 500".
actual: body-parser 2.x (via express.json() in backend/src/app.ts) parses an empty JSON body to {}, which reaches routing; the existing test backend/test/errors.test.ts:72 only asserts status < 500. User rejected the override: "sửa mục 4 theo hiểu biết của bạn để khắc phục".
errors: None (behavioural deviation, no crash).
reproduction: Test 4 in UAT. Confirm exactly how body-parser 2.x / Express 5.3 treat: (1) Content-Type: application/json + Content-Length: 0, (2) Content-Type: application/json + Transfer-Encoding: chunked with empty body, (3) no Content-Type, no body, (4) whitespace-only body. Determine where a check belongs (pre-parser middleware vs express.json options such as verify/strict, noting verify is not called for empty bodies) and which existing tests/routes depend on the {} behaviour. Also check docs/SPECS.md for requirements on body-less POSTs and how the frontend/loadtest will send them.
started: Discovered during UAT 2026-11-05.

## Eliminated

- hypothesis: Setting express.json({ strict: true/false }) can make an empty body fail
  evidence: body-parser 2.4.0 lib/types/json.js returns {} for body.length === 0 in BOTH the strict (line 77-80) and non-strict (line 104-108) parse functions, before any strict check. strict is already the default.
  timestamp: 2026-11-05T00:03:00Z

- hypothesis: express.json's verify option is not called for empty bodies, so the check must live in a pre-parser middleware
  evidence: lib/read.js:174 calls verify unconditionally after raw-body returns; Matrix B observed verify with buf.length=0 for CL:0, empty chunked and gzip(empty). verify is only skipped when hasBody is false (no CL/TE) or Content-Type is not JSON, which are the cases that must stay unchanged.
  timestamp: 2026-11-05T00:11:00Z

- hypothesis: A pre-parser middleware that rejects `Content-Type: json` + `Content-Length: 0` is sufficient
  evidence: Misses case (2) empty chunked body (no Content-Length header at all) and case (7) gzip-compressed empty body (Content-Length 20, payload decompresses to 0 bytes); both reach routing as {} in Matrix A and are only caught by verify (Matrix C).
  timestamp: 2026-11-05T00:12:00Z

- hypothesis: Keeping {} is required because the Phase 2 buy endpoint / autocannon / E1 send body-less POSTs (rationale in 01-02-SUMMARY.md:60,178 and UAT test 4 'expected')
  evidence: docs/SPECS.md:162 defines buy as POST /sales/:id/buy?mode=... with body { "qty": 1 }, and SPECS section 8 step 3 requires qty === 1 else 400, so buy always has a body. .planning/research/STACK.md:289 autocannon pattern sends content-type application/json + '{"qty":1}'. EXP-01 harness resets "kèm mode". The only optional-body POST is admin reset (ADMIN-01, body optional { mode }).
  timestamp: 2026-11-05T00:06:00Z

## Evidence

- timestamp: 2026-11-05T00:01:00Z
  checked: .planning/debug/knowledge-base.md (Phase 0) and MemPalace
  found: No knowledge base file exists yet; MemPalace not available in this worktree. No known-pattern candidate.
  implication: Proceed with fresh investigation.

- timestamp: 2026-11-05T00:02:00Z
  checked: backend/src/app.ts:23, backend/src/middlewares/error.ts:42-51, backend/package-lock.json:997-998, main checkout backend/node_modules/{body-parser,express,type-is,raw-body}/package.json, express/lib/express.js:77
  found: app uses bare express.json() (no options). Express 5.3.0 exports.json = bodyParser.json; lockfile and installed body-parser are 2.4.0 (type-is 2.1.0, raw-body 3.0.2). errorHandler maps err.type === "entity.parse.failed" to 400 { message: "Body JSON không hợp lệ", code: "INVALID_JSON" }; other body-parser 4xx -> VALIDATION_ERROR with original status.
  implication: Only a parse error with type entity.parse.failed (or an HttpError INVALID_JSON) can produce the required response; anything the parser accepts goes on to routing.

- timestamp: 2026-11-05T00:03:00Z
  checked: body-parser 2.4.0 lib/types/json.js:71-120 (createJsonParser)
  found: Both strict and non-strict parse functions start with `if (body.length === 0) return {}` ("special-case empty json body, as it's a common client-side mistake"). strict only rejects a non-empty body whose first non-whitespace char is not { or [. Whitespace-only body: firstNonWhitespaceChar returns undefined, createStrictSyntaxError(body, undefined) -> JSON.parse('') throws SyntaxError -> read() wraps as 400 type entity.parse.failed.
  implication: The {} for an empty body is hard-coded and not configurable by `strict` or `type`; whitespace-only is already rejected. The `strict` option cannot fix this.

- timestamp: 2026-11-05T00:04:00Z
  checked: body-parser 2.4.0 lib/read.js:45-205 and type-is 2.1.0 hasbody (index.js:98-101)
  found: read() order: (a) req.body = undefined if absent; (b) skip if !hasBody(req), where hasBody = transfer-encoding present OR content-length numeric (so CL:0 counts as HAS a body); (c) skip if !shouldParse(req) (type-is match on content-type; no CT -> false); (d) raw-body read; (e) `if (verify) verify(req, res, body, encoding)` is called UNCONDITIONALLY after the read, including for a zero-length Buffer, wrapped as createError(403, err, { body, type: err.type || 'entity.verify.failed' }); (f) parse(). With verify set, raw-body is called with encoding null (Buffer) and decoding happens via iconv afterwards.
  implication: The orchestrator note "verify is not called for empty bodies" is FALSE for body-parser 2.4.0: verify runs for CL:0 and empty chunked bodies (they pass hasBody). It is only skipped when there is no framing at all (no CL, no TE) or no JSON content-type, which is exactly the set of requests that must stay untouched. A pre-parser middleware cannot see an empty chunked body without reading the stream.

- timestamp: 2026-11-05T00:05:00Z
  checked: http-errors createError (index.js:49-105) as used by read.js verify wrapper
  found: createError(403, err, props): when err has its own numeric .status, the loop sets status = err.status (overrides the 403); only sets err.status/expose if err is not an http-errors instance of that status; then copies props (body, type) onto err except status/statusCode.
  implication: Throwing our own HttpError(400, "Body JSON không hợp lệ", "INVALID_JSON") from verify survives the wrapper as the same instance with status 400 (gains harmless body/type/expose/statusCode props); errorHandler's `err instanceof HttpError` branch sends 400 INVALID_JSON. Throwing a plain Error with `type = "entity.parse.failed"` also works (status 403 internally, but errorHandler checks type before generic status).

- timestamp: 2026-11-05T00:06:00Z
  checked: docs/SPECS.md section 7 (API table, line 162-164) and section 8; .planning/REQUIREMENTS.md ADMIN-01, EXP-01; .planning/research/STACK.md:190, 289; .planning/phases/01-.../01-02-SUMMARY.md:60,175-178
  found: SPECS: `POST /sales/:id/buy?mode=...` takes body `{ "qty": 1 }` and qty must be exactly 1 else 400 (section 8 step 3) -- the buy endpoint is NOT body-less. STACK.md:289 autocannon pattern sends content-type application/json + body '{"qty":1}'. ADMIN-01: reset body is OPTIONAL `{ mode }` -- this is the only planned POST that may legitimately be body-less. EXP-01 harness resets "kèm mode" (with a body). 01-02-SUMMARY justified keeping {} with "would break bodiless POSTs such as the Phase 2 buy endpoint under autocannon", which contradicts SPECS.
  implication: The original deviation rationale is wrong for buy. The only body-less client case is admin reset without mode (frontend admin page / ad-hoc curl); those must omit Content-Type (or send `{}`), and the Phase 2 reset handler must treat req.body undefined as "no mode".

- timestamp: 2026-11-05T00:07:00Z
  checked: backend/test/errors.test.ts:30-32,72-76; backend/test/integration/auth.test.ts:39-43,117-135; backend/test/auth.test.ts (GET only); backend/src/utils/validate.ts asObject; backend/src/routes/*
  found: errors.test:72 'body rỗng với content-type JSON' only asserts status < 500 and code != INTERNAL_ERROR (currently 404 NOT_FOUND via routing). integration/auth.test:119 case [undefined body, undefined CT] expects 400 VALIDATION_ERROR (body-less POST, no CT -> req.body undefined -> asObject throws). No test posts an empty body WITH content-type json to /api/auth/*. No Phase 1 route accepts a body-less POST (admin router has guard only; auth routes require an object). asObject already rejects undefined/{} via field checks.
  implication: Only errors.test:72 encodes the {} behaviour (weakly). The no-CT body-less case in integration/auth.test:119 must keep passing, so any fix must be scoped to requests whose Content-Type matches application/json.

- timestamp: 2026-11-05T00:10:00Z
  checked: Scratch experiment exp.mjs (scratchpad, deleted afterwards) on Node v24.22.1 using the main checkout's installed express 5.3.0 + body-parser 2.4.0, raw TCP requests to POST /echo, errorHandler replicated from backend/src/middlewares/error.ts. Matrix A = bare express.json() (current app.ts).
  found: |
    (1)  CT json + Content-Length: 0                -> 200, req.body = {}   (reaches routing)
    (1b) CT json; charset=utf-8 + CL 0              -> 200, req.body = {}
    (2)  CT json + Transfer-Encoding: chunked, empty -> 200, req.body = {}
    (3)  no CT, no CL, no TE                         -> 200, req.body undefined
    (3b) no CT + CL 0                                -> 200, req.body undefined
    (3c) no CT + chunked empty                       -> 200, req.body undefined
    (4)  CT json + whitespace "  \n"                 -> 400 INVALID_JSON (already correct)
    (4b) CT json + chunked whitespace                -> 400 INVALID_JSON (already correct)
    (5)  CT json, no CL, no TE (no body framing)     -> 200, req.body undefined (hasBody false)
    (6)  CT json + "{}"                              -> 200, req.body = {}
    (6b) CT json + {"qty":1}                         -> 200, req.body = {qty:1}
    (7)  CT json + Content-Encoding gzip of empty    -> 200, req.body = {}  (CL is 20, decompresses to 0 bytes)
    (8)  CT text/plain + CL 0                        -> 200, undefined
    (10) CT json; charset=latin1 + CL 0              -> 415 VALIDATION_ERROR
    fetch (undici) headers seen by server: POST no body no headers -> CL "0", no CT; POST CT json no body -> CL "0"; POST CT json body "" -> CL "0".
  implication: Confirms the reported deviation for (1) and (2) and adds (7). Node fetch ALWAYS sends Content-Length: 0 on a body-less POST, so "fetch POST with CT json and no body" lands in case (1). Whitespace-only is not part of the bug.

- timestamp: 2026-11-05T00:11:00Z
  checked: Matrix B = express.json({ verify: record buf.length only })
  found: verify called with buf.length=0 for (1), (1b), (2), (7) and for fetch POST CT json with no body / body ""; called with real lengths for (4) 3, (4b) 2, (6) 2, (6b) 9. NOT called for (3), (3b), (3c), (5), (8), (9), (10), fetch POST without CT.
  implication: verify is exactly the hook that sees every "declared-JSON, zero-byte payload" case (including chunked and compressed ones a header pre-check cannot see) and never sees the no-CT body-less POST.

- timestamp: 2026-11-05T00:12:00Z
  checked: Matrix C = express.json({ verify: throw new HttpError(400, "Body JSON không hợp lệ", "INVALID_JSON") when buf.length === 0 }); Matrix D = same but throw SyntaxError with type "entity.parse.failed"
  found: C and D give identical results: (1), (1b), (2), (7), fetch CT-json-no-body and CT-json-body-"" -> 400 { message: "Body JSON không hợp lệ", code: "INVALID_JSON" }; (3), (3b), (3c), (5), (8), (9), fetch no-CT POST -> unchanged 200 with req.body undefined; (4)/(4b) still 400 INVALID_JSON; (6) "{}" and (6b) {"qty":1} still parsed and routed; (10) still 415.
  implication: The candidate fix satisfies every clause of the G-01-4 truth and changes nothing else in the matrix.

- timestamp: 2026-11-05T00:13:00Z
  checked: exp2.mjs under candidate C: fetch with CT json and no body for GET/DELETE/PATCH/PUT/POST; raw GET and POST with CT json + CL 0; instanceof/status of the error reaching errorHandler
  found: fetch GET and DELETE send no Content-Length -> body skipped, 200. fetch PATCH, PUT, POST send CL 0 -> 400 INVALID_JSON. Raw GET with CT json + CL 0 -> 400 INVALID_JSON. The error reaching errorHandler is still `instanceof HttpError` with status 400 after body-parser's createError(403, err, ...) wrapper.
  implication: Clients that put Content-Type: application/json on a body-less POST/PUT/PATCH will start receiving 400 after the fix; GET polling with a stray JSON content-type header is unaffected (fetch sends no CL on GET). HttpError thrown from verify is safe (http-errors keeps the error's own status 400).

## Resolution

root_cause: "body-parser 2.4.0 (express.json in Express 5.3.0) hard-codes `if (body.length === 0) return {}` in both strict and non-strict JSON parsers (node_modules/body-parser/lib/types/json.js:77-80, 104-108); backend/src/app.ts:23 mounts bare `express.json()` with no `verify` guard, so any request with Content-Type application/json and a zero-byte payload (Content-Length: 0, empty chunked body, or compressed-empty body) is parsed to {} and routed instead of raising 400 INVALID_JSON; errors.test.ts:72 was weakened to `status < 500`, so the 01-02 truth was never enforced."
fix: "(not applied - diagnose only) Suggested: app.use(express.json({ verify })) where verify(_req, _res, buf) throws new HttpError(400, 'Body JSON không hợp lệ', 'INVALID_JSON') when buf.length === 0. Do not use `strict` (no effect) or a Content-Length pre-check (misses chunked/compressed)."
verification: "Scratch reproduction only (Matrix A reproduces; Matrix C/D shows the verify guard gives 400 INVALID_JSON for CL:0, empty chunked, gzip-empty and fetch CT-json-no-body, while no-CT body-less POST, whitespace-only (already 400), '{}', '{\"qty\":1}' and 415 charset cases are unchanged)."
files_changed: []
oracle_type: specified (01-02 truth / G-01-4 truth: exact status 400 and code INVALID_JSON)
