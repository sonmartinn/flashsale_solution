# Phase 1: Foundation (Infra, Data, Auth) - Research

**Researched:** 2026-11-04
**Domain:** Docker Compose infra (MongoDB 7 + Redis 7.4), a fail-fast Express 5 / Mongoose 9 / ioredis 6 TypeScript ESM backend, seed/reset CLIs, and JWT auth with a test-mode header
**Confidence:** HIGH. Almost every recommendation was checked this session in a scratch project (`p1probe`) that installed the exact pinned versions, passed `tsc` 7.0.2 typecheck and build, and ran runtime probes. Probes covered config fail-fast, Express error mapping, JWT and `x-test-user`, ioredis against a throwaway `redis:7` (7.4.12) container, `--env-file` + dotenv precedence, Windows port binding, and `node:test` + tsx. Only the MongoDB server behaviour (E11000 on register, index listing after seed) was not run live, because no `mongo` image is on this machine and this research did not pull one.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

The user asked Claude to choose reasonable defaults for a course project ("Không cần bàn gì nhiều, cứ chọn những gì mà bạn thấy hợp lí"). The decisions below are Claude's choices and are now locked for planning.

#### Seed data
- **D-01:** 6 fashion products. Prices are integer VND, slugs are ASCII kebab-case, names are Vietnamese. Each category uses a different `attributes` shape so the flexible document schema shows up in the data:

  | slug | name | category | price | attributes (shape) |
  |---|---|---|---|---|
  | `ao-thun-cotton-basic` | Áo thun cotton basic | `ao` | 199000 | `{ sizes: ["S","M","L","XL"], colors: [...], material: "Cotton 100%" }` |
  | `quan-jeans-slim-fit` | Quần jeans slim fit | `quan` | 499000 | `{ waistSizes: [28,29,30,31,32,34], colors: [...], material: "Denim co giãn", fit: "slim" }` |
  | `vay-hoa-midi` | Váy hoa midi | `vay` | 399000 | `{ sizes: ["S","M","L"], pattern: "hoa nhí", length: "midi", material: "Voan" }` |
  | `giay-sneaker-trang` | Giày sneaker trắng | `giay` | 899000 | `{ euSizes: [38,39,40,41,42,43], soleMaterial: "Cao su", upperMaterial: "Da tổng hợp" }` |
  | `tui-tote-canvas` | Túi tote canvas | `tui` | 249000 | `{ dimensionsCm: { w: 38, h: 42, d: 10 }, capacityLiters: 15, material: "Canvas", colors: [...] }` |
  | `ao-khoac-gio` | Áo khoác gió chống nước | `ao-khoac` | 599000 | `{ sizes: ["M","L","XL"], waterproof: true, hood: true, material: "Polyester" }` |

  The exact color lists and wording are up to the executor. What matters is that the shapes differ between categories.
- **D-02:** Each product's `images` holds relative paths `/images/products/<slug>.jpg` (one per product). Phase 4 provides the files or placeholders under `frontend/public/images/products/`. No external image URLs, so the demo works offline.
- **D-03:** The sale product is `giay-sneaker-trang`, with `salePrice = price / 2 = 449500`.
- **D-04:** Accounts. The admin is `admin@flashsale.local`. Users are `user0001@flashsale.local` … `user1000@flashsale.local`, named `Người dùng 0001` … `Người dùng 1000` (4 digits with leading zeros). All accounts share the test password **`matkhau123`**, which is defined once in the seed script and bcrypt-hashed once (cost 10). Users are inserted with `insertMany`.
- **D-05:** The sale document has `totalQty = remainingQty = <qty>`, `perUserLimit: 1`, `status: "active"`, `startAt = now`, `endAt = now + 7 days`, and `mode = <mode>`. Seed loads `stock:<saleId> = qty` and makes sure `buyers:<saleId>` does not exist (seed runs `FLUSHDB` first).

#### Seed/reset CLI parameters
- **D-06:** Seed usage is `npm run seed -- [--qty <n>] [--mode v0|v1|v2]`. The defaults are `--qty 100` and **`--mode v2`**, because V2 is the main approach and the UI demo follows `sale.mode`. `qty` must be a positive integer. Any invalid value exits non-zero with a Vietnamese message. Parse arguments with Node's built-in `node:util` `parseArgs` (no new dependency).
- **D-07:** Reset usage is `npm run reset -- [--sale <saleId>] [--mode v0|v1|v2]`. Without `--sale` it resets every sale. Without `--mode` it keeps each sale's current mode. Reset does not change `totalQty`; to get a different stock size, run seed again with `--qty`. Every run prints the warning that it cannot clear the in-process sale cache of a running server, so load scripts must reset through the admin API (DATA-05).
- **D-08:** When seed finishes it prints: the Mongo target (`host:port/db`), the Redis target, counts (users, products, sales), `saleId`, `mode`, `totalQty`, the admin email and password, and a sample user email. This is the handoff to the load scripts and the demo. The shared password is a throwaway test credential, so printing it is fine.
- **D-09:** The reset service (`resetSale(saleId, { mode? })`) does the following:
  - sets `remainingQty = totalQty` and reopens the sale (`active`, `startAt = now`, `endAt = now + 7d`), setting `mode` if one was given
  - deletes the sale's `orders` and `stock_movements`
  - runs a Redis `multi()` of `SET stock` + `DEL buyers` and checks every `[err, res]` pair
  - writes one `stock_movements` row with `reason: "reset"`, `delta: totalQty`, `orderId: null`
  - calls a cache-invalidate hook. Phase 1 leaves it as a no-op seam; Phase 2 wires it to `saleCache.invalidate`.

  The CLI and the Phase 2 admin route call the same function.

#### Register and login
- **D-10:** Input validation. Every field must be `typeof === "string"`; anything else gets 400 `VALIDATION_ERROR`.
  - `name`: trimmed, 1–100 characters
  - `email`: trimmed and lowercased, checked with a simple `x@y.z` regex
  - `password`: 6–72 characters (72 is bcrypt's byte limit)
  - A `role` sent by the client is ignored. The service builds `{ name, email, passwordHash, role: "user" }` explicitly.
  - Hashing happens in the service, not in a Mongoose `pre` hook.
- **D-11:** A duplicate email returns 409 `EMAIL_TAKEN`. The service catches the unique-index E11000 rather than doing a separate pre-check that could race.
- **D-12:** Register returns **201 `{ token, user: { id, name, email, role } }`**, so the user is logged in immediately and the Phase 4 UI needs no extra login call. Login returns 200 with the same shape. A wrong email and a wrong password both get the same 401 `INVALID_CREDENTIALS`, "Email hoặc mật khẩu không đúng", so the response never reveals whether an email exists.
- **D-13:** JWT: HS256, `expiresIn: "7d"`, payload `{ sub: userId, role }`. Use `import jwt from "jsonwebtoken"`, the default import only. `requireAuth` reads `Authorization: Bearer <token>` and verifies it. It also checks that `sub` is a valid ObjectId (normalized to lowercase) and that `role ∈ {user, admin}`. It then sets `req.user = { id, role }`, with no MongoDB lookup.
- **D-14:** Test mode. There is exactly one check, `config.isTestMode` (`NODE_ENV === "test"`, read once at boot).
  - When test mode is on and an `x-test-user` header is present, that header wins. An invalid ObjectId returns 401. A valid one, normalized to lowercase, becomes `req.user = { id, role: "user" }`.
  - When the header is absent, it falls back to the Bearer token, so the harness can still log in as admin and call `/api/admin/*`.
  - Outside test mode the header is ignored completely.
  - The server prints a loud warning at boot when test mode is on.

#### Errors
- **D-15:** The error JSON is always `{ message: <tiếng Việt>, code: <MACHINE_CODE> }`. Phase 1 codes:

  | Code | Status | Meaning |
  |---|---|---|
  | `VALIDATION_ERROR` | 400 | ValidationError or invalid input |
  | `INVALID_ID` | 400 | CastError or bad ObjectId |
  | `INVALID_JSON` | 400 | `entity.parse.failed` |
  | `DUPLICATE` | 409 | Generic E11000 |
  | `EMAIL_TAKEN` | 409 | Duplicate email on register |
  | `UNAUTHORIZED` | 401 | Missing or bad token. One code, different messages for missing, invalid and expired |
  | `INVALID_CREDENTIALS` | 401 | Wrong email or password |
  | `FORBIDDEN` | 403 | Not enough privileges |
  | `NOT_FOUND` | 404 | Includes unknown `/api/*` routes |
  | `INTERNAL_ERROR` | 500 | Generic message only; the server logs the stack, the client never sees it |

  Phase 2 adds `SOLD_OUT`, `ALREADY_BOUGHT`, `SALE_NOT_ACTIVE`, `STOCK_NOT_LOADED` and `INVALID_MODE`. The signature is `HttpError(status, message, code)`.

#### Health, config and startup
- **D-16:** Pool size is `MONGO_MAX_POOL_SIZE`, default **100** (the driver default, now explicit). It is read by config, passed to `mongoose.connect`, printed at boot, listed in `.env.example`, and exposed by health. `minPoolSize` and the warm-up policy belong to Phase 3.
- **D-17:** `GET /api/health` returns `{ mongo: boolean, redis: boolean, nodeEnv: string, maxPoolSize: number }`. It is 200 only when both stores are up, otherwise 503. The checks are a Mongo admin `ping` and a Redis `PING`, each with a short timeout so the endpoint never hangs. `nodeEnv` and `maxPoolSize` let the Phase 3 harness confirm test mode and record the pool size in the CSV without a new endpoint. This is safe because the server listens behind localhost-only infra and exposes no secrets.
- **D-18:** No implicit connection defaults. `MONGODB_URI`, `REDIS_URL` and (server only) `JWT_SECRET` are required, and a missing value means a Vietnamese error and `process.exit(1)`. `PORT` (5000) and `CLIENT_ORIGIN` (`http://localhost:5173`) may have defaults. Config **refuses a MongoDB URI whose port resolves to 27017** (including the implicit default port) with a message pointing to 27018. This guard applies to the server and to the seed/reset scripts.
- **D-19:** Fail-fast timeouts:
  - Mongo: `serverSelectionTimeoutMS: 5000`
  - Redis: `connectTimeout: 5000`, `maxRetriesPerRequest: 1`, plus a startup `ping()`. Do not use `retryStrategy: () => null`.
  - `listen` callback: check `error`; on `EADDRINUSE`, print "Cổng 5000 đang bị chiếm…" and exit 1.

  `app.listen(PORT)` takes no host. Boot prints: Mongo `host:port/db`, Redis `host:port`, `NODE_ENV`, `maxPoolSize`. Mongoose `bufferCommands` tuning is left to Phase 3 (E4).
- **D-20:** `backend/.env.test` contains only `NODE_ENV=test` and **is committed**. `node --env-file=.env.test` needs the file to exist, and the file holds no secret. `JWT_SECRET` still comes from `backend/.env` through `dotenv/config`, which does not override variables that are already set. `.env.example` lists `PORT`, `MONGODB_URI=mongodb://127.0.0.1:27018/flashsale`, `REDIS_URL=redis://127.0.0.1:6379`, `CLIENT_ORIGIN`, `JWT_SECRET=` (empty) and `MONGO_MAX_POOL_SIZE=100`.
- **D-21:** Indexes. The server awaits `createIndexes()` (or `Model.init()`) for all 5 models before `listen`. Seed calls `createIndexes()` after `dropDatabase` and before inserting.

### Claude's Discretion
- File and folder layout inside `backend/src/` follows `.planning/research/ARCHITECTURE.md` (config, models, services, controllers, routes, middlewares, lua, utils). Root has no `package.json`, and `backend/` is its own package.
- Exact Vietnamese message wording, color lists, product descriptions (an optional `description` field is fine), and boot log format.
- Whether the reset `stock_movements` row records the delta as `totalQty` or as the restored difference. Pick one and document it.
- Docker volume names and healthcheck intervals. Use the fixed container names `flashsale-mongo` and `flashsale-redis`.

### Deferred Ideas (OUT OF SCOPE)
- **Phase 3:** `.gitignore` currently ignores all of `loadtest/results/*`, but SPECS needs the summary CSVs committed. Phase 3 must add an exception (for example `!loadtest/results/*.csv`, with raw output in a subfolder or under another extension).
- **Phase 3:** Consider letting the admin reset accept `totalQty` so E1 (100) and E2 (≥1000) can switch without a reseed. Not in SPECS, so only add it if reseeding between experiments turns out to be painful.
- **Phase 4:** Add `.dev/` to `.gitignore` (DEV-04). Provide product images or placeholders at `frontend/public/images/products/<slug>.jpg`.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| INFRA-01 | `docker compose up -d --wait` brings up MongoDB 7 on `127.0.0.1:27018` and Redis 7 with AOF `everysec` on `127.0.0.1:6379`, with healthchecks, no app containers | Compose file validated with `docker compose config` (Compose v5.4.0); `mongo:7.0` and `redis:7.4` tags confirmed with `docker manifest inspect`; AOF `everysec` confirmed with `CONFIG GET` on 7.4.12. See Pattern 1 |
| INFRA-02 | TS strict ESM NodeNext backend with `dev`, `build` (copies `src/lua` → `dist/lua`), `start`, `start:test`, `typecheck` | tsconfig pair + build script ran on TS 7.0.2 and produced `dist/server.js` and `dist/lua/buy.lua` (no `dist/src/`). See Pattern 2 |
| INFRA-03 | Clear Vietnamese exit on missing `JWT_SECRET`, unreachable Mongo/Redis, port taken; no implicit 27017 | All paths run this session: missing secret, implicit/explicit 27017, Mongo down (exit after 5018 ms), Redis down (7 ms), EADDRINUSE in the callback. **New:** on Windows the listen callback misses an IPv4-only holder of port 5000; add a loopback connect probe (Pitfall 1) |
| INFRA-04 | `GET /api/health` → `{ mongo, redis }` 200/503 | Verified 503 `{"mongo":false,"redis":true,...}`; Redis outage detected in ≤207 ms, recovery in 253 ms after container restart. See Pattern 5 |
| INFRA-05 | Error middleware maps SPECS §7 table, Vietnamese message, `code` field, 500 leaks nothing | Verified: bad JSON → 400 `INVALID_JSON`, unknown route → 404, thrown `Error` → 500 generic (stack only in server log), oversized body → 413. See Pattern 4 |
| INFRA-06 | Explicit `maxPoolSize`, printed at boot; `.env.example` complete | `mongoose.connect(uri, { maxPoolSize, serverSelectionTimeoutMS, autoIndex, autoCreate })` typechecks; health also returns it (D-17) |
| DATA-01 | 5 models, explicit collection names, all §6 indexes, `remainingQty` without `min` | Model file typechecks on Mongoose 9.11.4 + TS 7. See Pattern 6. Avoid declaring an index twice (Mongoose warns, Pitfall 5) |
| DATA-02 | Indexes ensured before requests / inserts | Mongoose source read: `createIndexes()` → `ensureIndexes()` rejects on failure; connect option `autoIndex:false` stops background builds. Runtime check: a failing `createIndexes()` rejected cleanly. See Pattern 7 |
| DATA-03 | `npm run seed` wipes and recreates 1,000 users + admin, 6 products, 1 sale, loads Redis; `--qty`, `--mode` | `parseArgs` CLI verified on Windows npm/cmd **and** PowerShell 5.1 (`npm run seed -- --qty 5 --mode v1` passes args through). One bcrypt hash at cost 10 = 60–76 ms. See Pattern 8 |
| DATA-04 | Shared reset service: Mongo reset, delete orders + movements, Redis `multi()` checked, reopen, optional mode, log, cache hook | `multi().exec()` shape verified: `[[null,"OK"],[null,0]]`; a failing command inside `multi` resolves with `[Error, null]` and the earlier `SET` is **not** rolled back. See Pattern 9 |
| DATA-05 | `npm run reset` (one/all, `--mode`) + cache warning | Same CLI pattern as seed; reset service shared with Phase 2 |
| AUTH-01 | Register, role always `user`, duplicate → 409, non-string → 400 | Non-string body fields rejected (verified `{"name":{"$ne":null}}` → 400). E11000 class `mongoose.mongo.MongoServerError` typechecks (`MongoBulkWriteError` extends it). **New:** bcryptjs silently truncates past 72 **bytes**; check bytes, not characters (Pitfall 4) |
| AUTH-02 | Login → JWT 7 days, `sub` + `role` | Verified payload `{"role":"user","iat":…,"exp":…,"sub":"64ab…"}`, ttl = 7 days |
| AUTH-03 | `requireAuth` token-only, `req.user = { id, role }`, 401 | Verified: no token, junk, wrong secret, expired, `alg: none`, bad role → 401; uppercase `sub` normalized |
| AUTH-04 | `requireAdmin` on all `/api/admin` via `router.use`; user → 403 | Verified: user → 403 on **any** `/api/admin/*` path, even one that doesn't exist, because `router.use` runs before the 404 handler. So Phase 1 can test AUTH-04 with no admin endpoint yet |
| AUTH-05 | `x-test-user` only when `NODE_ENV === "test"`, ObjectId check, lowercase, role `user` | Verified: uppercase header normalized; 12-char string → 401; duplicate header (joined `a, b`) → 401; admin route with header → 403 |
</phase_requirements>

## Summary

Phase 1 is a greenfield backend foundation. The stack is fixed by SPECS §4 and was verified in an earlier session (`.planning/research/STACK.md`). This research re-confirmed each pinned version on the npm registry today. It then ran every Phase 1 pattern for real: config parsing and the 27017 guard, Mongo and Redis fail-fast timing, the Express 5 error middleware, the JWT and `x-test-user` matrix, `multi()` result handling, `--env-file`/dotenv precedence, `parseArgs` through npm on both shells, the build copy step, and `node:test` with tsx. The CONTEXT decisions (D-01…D-21) all hold up. The planner can follow them as written.

Three findings change or sharpen the plan. **(1)** On this Windows machine, Express's `listen` callback only reports `EADDRINUSE` when the other process bound the *same* address. A process on `127.0.0.1:5000` or `0.0.0.0:5000` is **not** detected when our server binds `::` (no host, D-19), and IPv4 requests then silently go to the other process. A loopback connect probe before `listen` detects every case in about 1–3 ms (Pitfall 1). **(2)** Mongoose compiles models at import time and starts automatic index builds and collection creation in the background. In seed, those race with `dropDatabase()`. Pass `autoIndex: false, autoCreate: false` to `mongoose.connect` and build indexes explicitly with `createIndexes()` (Pattern 7). This makes D-21 deterministic. **(3)** bcryptjs 3 silently truncates passwords longer than 72 **bytes**, and Vietnamese characters are 2–3 bytes each. D-10's "72 characters" must be checked as bytes (`Buffer.byteLength` or `bcrypt.truncates()`).

**Primary recommendation:** Build in 3 plans. Plan A: compose + backend skeleton + config + errors + health + models. Then Plans B (seed/reset service + CLIs) and C (auth) run in parallel on top of A. Use `node:test` + tsx for tests (no new dependency). Use the boot order: config → port probe → Mongo (5 s) → `createIndexes()` → Redis (connect + ping) → `listen` with an error callback.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| MongoDB/Redis processes, ports, AOF, healthchecks | Database / Storage (Docker Compose) | — | SPECS §4: Docker runs only the stores, bound to 127.0.0.1 |
| Env loading, URI guards, fail-fast boot | API / Backend (`config/`, `server.ts`) | — | Runs before any request; seed/reset reuse the same config functions without `JWT_SECRET` |
| Health check | API / Backend (`GET /api/health`) | Database (ping) | Must time-box each store ping so it never hangs |
| Error → HTTP mapping | API / Backend (`middlewares/error.ts`) | — | One place guarantees the `{ message, code }` shape |
| Schemas, indexes | Database / Storage (via Mongoose models) | API (ensures before listen) | Uniqueness (email, `(saleId,userId)`) must be enforced by MongoDB, not by app pre-checks |
| Seed / reset | Backend CLI (`backend/scripts/`) calling shared `services/` | Database + Redis | Reset logic must be one function shared with the Phase 2 admin route |
| Register / login / password hashing | API / Backend (`services/auth`, `controllers/auth`) | Database (unique email) | Hashing in the service (D-10); E11000 → 409 (D-11) |
| Token verification, test-mode identity, admin gate | API / Backend (`middlewares/auth.ts`) | — | Stateless, no DB read (AUTH-03); single test-mode check (D-14) |
| Browser token storage | Browser / Client | — | **Not in this phase** (Phase 4). Phase 1 only fixes the response shape (D-12) |

## Project Constraints (from CLAUDE.md)

Directives from `.claude/CLAUDE.md`. These carry the same authority as locked decisions:

- TypeScript `strict`; Node `engines: ">=20.19.0"` for the backend. Pins: Express `^5.3.0`, Mongoose `^9.11.4`, ioredis `^6.0.0`, jsonwebtoken `^9.0.3`, bcryptjs `^3.0.3`, cors `^2.8.6`, dotenv `^18.0.9`, TypeScript `~7.0.2`, tsx `^4.23.15`, `@types/node ^24`, `@types/express ^5.0.6`, `@types/jsonwebtoken ^9.0.10`, `@types/cors ^2.8.19`. Images: `mongo:7.0`, `redis:7.4`.
- Backend ESM NodeNext; relative imports end in `.js`. Express 5 catches async errors, so **no try/catch wrappers** in handlers. Business errors throw `HttpError(status, message[, code])`. Error messages and code comments are in **Vietnamese**.
- Definition of done: `typecheck` passes **and** `build` passes. tsx and Vite do not type-check.
- Measurement: `npm run start:test` (compiled JS). `maxPoolSize` must be explicit. No logging in the buy path.
- Build must copy `src/lua/` to `dist/lua/`.
- Security: `JWT_SECRET` has no default. Every input field must be a string. The client cannot set `role`. Compose binds only 127.0.0.1.
- Use **default imports** for CJS packages: `import jwt from "jsonwebtoken"`, `import cors from "cors"`, `import express from "express"`, `import bcrypt from "bcryptjs"`. Use the named `import { Redis } from "ioredis"`. Do **not** install `@types/bcryptjs`.
- Never use `{ new: true }` in `findOneAndUpdate` (use `returnDocument`). Never use `mongodb://localhost:27017`. No MongoDB transactions. Never `readFileSync(url.pathname)`; use `readFileSync(new URL(...), "utf8")`. No `retryStrategy: () => null`. Always iterate `multi().exec()` results.
- Scripts: never auto-install software, never kill unknown processes, never `docker compose down -v`.
- Git: **no `Co-Authored-By` line** in commits (also in the user's memory). This overrides any harness attribution reminder.
- GSD workflow enforcement: edit files only through GSD commands.

## Standard Stack

### Core
| Library | Version (verified 2026-11-04) | Purpose | Why Standard |
|---------|---------|---------|--------------|
| express | 5.3.0 (`engines >=18`) | HTTP API | SPECS-mandated; async errors forwarded; `listen` error goes to the callback [VERIFIED: npm registry + runtime probe] |
| mongoose | 9.11.4 (`engines >=20.19.0`, bundles mongodb 7.7.0) | ODM | SPECS-mandated [VERIFIED: npm registry, `npm ls mongodb`] |
| ioredis | 6.0.0 (`engines >=20.0.0`) | Redis client | SPECS-mandated; `multi()`, `defineCommand` (Phase 2) [VERIFIED: npm registry + runtime vs Redis 7.4.12] |
| jsonwebtoken | 9.0.3 | HS256 JWT | SPECS-mandated; default import only [VERIFIED: npm registry + runtime] |
| bcryptjs | 3.0.3 (ESM, bundled types, exports `truncates()`) | Password hashing | SPECS-mandated; pure JS, no node-gyp on Windows [VERIFIED: npm registry + `node_modules/bcryptjs/types.d.ts:138`] |
| cors | 2.8.6 | CORS for `CLIENT_ORIGIN` | SPECS-mandated [VERIFIED: npm registry] |
| dotenv | 18.0.9 | Load `backend/.env` | SPECS-mandated; does not override already-set vars [VERIFIED: runtime probe] |

### Supporting / Dev
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| typescript | 7.0.2 | `typecheck`, `build` | Always; `~7.0.2` pin [VERIFIED: npm registry, `npx tsc --version`] |
| tsx | 4.23.15 | `dev` (watch), seed/reset/tests | Never for measurement [VERIFIED: npm registry + runtime] |
| @types/node | 24.19.2 (latest of `^24`; registry `latest` is 26.6.6, **do not** take latest) | Node globals | `"types": ["node"]` required on TS 7 [VERIFIED: `npm view @types/node@24 version`] |
| @types/express | 5.0.6 | Express types | — [VERIFIED: npm registry] |
| @types/jsonwebtoken | 9.0.10 | JWT types | — [VERIFIED: npm registry] |
| @types/cors | 2.8.19 | cors types | — [VERIFIED: npm registry] |
| node:test + node:assert (built-in) | Node 24.22.1 | Test runner | `node --import tsx --test "test/**/*.test.ts"`, verified through npm in bash and PowerShell 5.1 [VERIFIED: runtime probe] |
| node:util `parseArgs` (built-in) | Node 24 | CLI flags (D-06) | Verified `strict: true` rejects unknown flags [VERIFIED: runtime probe] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `node:test` + tsx | vitest / jest | Adds a dependency (and a legitimacy check) for no Phase 1 benefit. `node:test` already runs TS through tsx |
| connect probe + listen callback | listen callback only | Callback alone misses IPv4-only holders of port 5000 on Windows (Pitfall 1) |
| explicit `createIndexes()` with `autoIndex:false` | `Model.init()` with default autoIndex | `init()` also works for the server, but background auto-builds race `dropDatabase()` in seed |
| supertest | `app.listen(0)` + global `fetch` | Verified that the fetch approach works; no new dependency |

**Installation (in `backend/`):**
```bash
npm install express@^5.3.0 mongoose@^9.11.4 ioredis@^6.0.0 jsonwebtoken@^9.0.3 bcryptjs@^3.0.3 cors@^2.8.6 dotenv@^18.0.9
npm install -D typescript@~7.0.2 tsx@^4.23.15 @types/node@^24 @types/express@^5.0.6 @types/jsonwebtoken@^9.0.10 @types/cors@^2.8.19
```
Commit `backend/package-lock.json`: Phase 4's start scripts use `npm ci`. npm 11.19.1 prints `npm warn install-scripts esbuild@0.28.2 (postinstall: node install.js)`. It is harmless: tsx ran without the postinstall [VERIFIED: runtime probe]. Do **not** run `npm install-scripts approve` as part of the plan.

## Package Legitimacy Audit

Run via `gsd-tools query package-legitimacy check --ecosystem npm` on 2026-11-04.

| Package | Registry | Latest published | Weekly downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| express | npm | 2026-10-09 | 194M | github.com/expressjs/express | [SUS] reason: `too-new` only | Flagged: planner adds one checkpoint before install (see note) |
| mongoose | npm | 2026-10-23 | 8.7M | github.com/Automattic/mongoose | [SUS] reason: `too-new` only | Flagged (same checkpoint) |
| dotenv | npm | 2026-10-22 | 256M | github.com/motdotla/dotenv | [SUS] reason: `too-new` only | Flagged (same checkpoint) |
| @types/node | npm | 2026-10-28 (that is v26; we pin `^24` → 24.19.2) | 611M | github.com/DefinitelyTyped/DefinitelyTyped | [SUS] reason: `too-new` only | Flagged (same checkpoint) |
| ioredis | npm | 2026-07-31 | 41.5M | github.com/redis/ioredis | [OK] | Approved |
| jsonwebtoken | npm | 2025-12-04 | 80.6M | github.com/auth0/node-jsonwebtoken | [OK] | Approved |
| bcryptjs | npm | 2025-11-02 | 19.6M | github.com/dcodeIO/bcrypt.js | [OK] | Approved |
| cors | npm | 2026-01-22 | 121M | github.com/expressjs/cors | [OK] | Approved |
| typescript | npm | 2026-07-08 | 403M | github.com/microsoft/TypeScript | [OK] | Approved |
| tsx | npm | 2026-09-20 | 132M | github.com/privatenumber/tsx | [OK] | Approved |
| @types/express | npm | 2025-12-01 | 86M | DefinitelyTyped | [OK] | Approved |
| @types/jsonwebtoken | npm | 2025-06-16 | 48M | DefinitelyTyped | [OK] | Approved |
| @types/cors | npm | 2025-06-07 | 39M | DefinitelyTyped | [OK] | Approved |

No package has a `postinstall` script (seam `postinstall: null` for all). The only install script in the tree is esbuild's (a tsx dependency), and npm 11 did not run it.

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** `express` [WARNING: flagged as suspicious — verify before using.], `mongoose` [WARNING: flagged as suspicious — verify before using.], `dotenv` [WARNING: flagged as suspicious — verify before using.], `@types/node` [WARNING: flagged as suspicious — verify before using.]. The only signal behind each flag is that the *latest* release is recent. All four are mandated by SPECS §4 / CLAUDE.md, have official repos, and have millions of weekly downloads. **One** `checkpoint:human-verify` before the `npm install` task is enough. Have the human confirm the resolved versions in `package-lock.json` (express 5.3.0, mongoose 9.11.4, dotenv 18.0.9, @types/node 24.x).

## Architecture Patterns

### System Architecture Diagram

```
                     docker compose up -d --wait
                                │
          ┌─────────────────────┴──────────────────────┐
          ▼                                            ▼
  flashsale-mongo (mongo:7.0)                 flashsale-redis (redis:7.4)
  127.0.0.1:27018 → 27017                     127.0.0.1:6379, AOF everysec
  healthcheck: mongosh ping                   healthcheck: redis-cli ping
          ▲   ▲                                        ▲   ▲
          │   │                                        │   │
          │   └──── backend/scripts/seed.ts ───────────┘   │   (tsx; config without JWT_SECRET)
          │         reset.ts → services/saleAdmin.resetSale│
          │                                                │
  npm run dev / start / start:test  (backend/)             │
          │                                                │
  server.ts boot:  loadBaseConfig + loadJwtSecret ──fail──► exit 1 (VN message)
          │        assertPortFree(5000)  ───────────busy──► exit 1
          │        connectMongo(5 s, maxPoolSize) ──fail──► exit 1
          │        ensureIndexes() (5 models) ──────fail──► exit 1
          │        redis.connect() + ping() ────────fail──► exit 1
          │        print banner (+ TEST MODE warning)
          ▼        app.listen(PORT, err => err ? exit 1 : banner)
  HTTP request ─► cors ─► express.json ─(bad JSON)─┐
                    │                              │
                    ▼                              │
                 /api router                       │
                  ├─ GET  /health ── ping Mongo ∥ ping Redis (1 s each) ─► 200 | 503
                  ├─ POST /auth/register ─► validate strings ─► bcrypt ─► User.create ─E11000─► 409 EMAIL_TAKEN
                  ├─ POST /auth/login ────► validate ─► findOne(email) ─► bcrypt.compare ─► 200 {token,user} | 401
                  └─ /admin/* ─► router.use(requireAuth, requireAdmin) ─► (Phase 2 routes) │
                                    │ test mode? x-test-user ─► {id,role:user}          │
                                    │ else Bearer ─► jwt.verify(HS256) ─► {id,role}       │
                                    ▼                                                   │
                 notFound (404) ─► errorHandler ◄────────────────────────────────────────┘
                                   HttpError | CastError | ValidationError | E11000 | entity.parse.failed | 5xx
                                   → { message (VN), code }
```

### Recommended Project Structure
```
docker-compose.yml
backend/
├── package.json            # "type":"module", engines, scripts (dev/typecheck/build/start/start:test/seed/reset/test)
├── package-lock.json
├── tsconfig.json           # typecheck: include src, scripts, test
├── tsconfig.build.json     # emit: rootDir src → dist
├── .env.example            # committed; JWT_SECRET= empty
├── .env.test               # committed; NODE_ENV=test only (D-20)
├── src/
│   ├── config/   env.ts (loadBaseConfig, loadJwtSecret, ConfigError), db.ts (connectMongo, pingMongo), redis.ts (createRedis, pingRedis, stockKey, buyersKey)
│   ├── models/   user.ts product.ts flash-sale.ts order.ts stock-movement.ts index.ts (allModels, ensureIndexes)
│   ├── middlewares/ auth.ts (requireAuth, requireAdmin), error.ts (notFound, errorHandler)
│   ├── services/ auth.service.ts, sale-admin.service.ts (resetSale, resetAllSales, setSaleResetHook), seed.service.ts (seedDatabase)
│   ├── controllers/ auth.controller.ts, health.controller.ts
│   ├── routes/   index.ts, auth.routes.ts, admin.routes.ts (router.use guard only)
│   ├── utils/    http-error.ts, object-id.ts, validate.ts, port.ts (assertPortFree)
│   ├── types/    express.d.ts (req.user augmentation)
│   ├── lua/      buy.lua (SPECS §8 verbatim; wired in Phase 2)
│   ├── app.ts    (createApp: no I/O)
│   └── server.ts (boot sequence)
├── scripts/      seed.ts, reset.ts (thin CLI: parseArgs → service → disconnect)
└── test/         *.test.ts (unit, no DB) + integration/*.test.ts (needs compose)
```
File names are Claude's discretion. ARCHITECTURE.md uses `httpError.ts`/`saleAdmin.service.ts`; either style is fine, but pick one and keep it.

### Pattern 1: docker-compose.yml (validated with `docker compose config`)
```yaml
# Source: validated locally (Compose v5.4.0); tags confirmed via docker manifest inspect
name: flashsale
services:
  mongo:
    image: mongo:7.0
    container_name: flashsale-mongo
    ports:
      - "127.0.0.1:27018:27017"
    volumes:
      - mongo-data:/data/db
    healthcheck:
      test: ["CMD", "mongosh", "--quiet", "--eval", "db.adminCommand('ping').ok"]
      interval: 5s
      timeout: 5s
      retries: 20
      start_period: 10s
  redis:
    image: redis:7.4
    container_name: flashsale-redis
    command: ["redis-server", "--appendonly", "yes", "--appendfsync", "everysec"]
    ports:
      - "127.0.0.1:6379:6379"
    volumes:
      - redis-data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 20
volumes:
  mongo-data:
  redis-data:
```
- Top-level `name: flashsale` pins the project name, so volume names don't depend on the folder.
- Leave out `restart:`. With the default (`no`), the dev scripts and E4 fully control when containers run.
- `--wait` waits only for containers that have a healthcheck [CITED: `docker compose up --help` lists `--wait` / `--wait-timeout`].
- That `mongosh` exists in `mongo:7.0` is [ASSUMED] (true for the 6.x/7.x official images). The first `docker compose up -d --wait` proves it: if the healthcheck command is missing, `--wait` exits non-zero.

### Pattern 2: package.json scripts + tsconfigs (verified on TS 7.0.2, Windows npm/cmd)
```jsonc
{
  "type": "module",
  "engines": { "node": ">=20.19.0" },
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "typecheck": "tsc --noEmit",
    "build": "node -e \"require('node:fs').rmSync('dist',{recursive:true,force:true})\" && tsc -p tsconfig.build.json && node -e \"require('node:fs').cpSync('src/lua','dist/lua',{recursive:true})\"",
    "start": "node dist/server.js",
    "start:test": "npm run build && node --env-file=.env.test dist/server.js",
    "seed": "tsx scripts/seed.ts",
    "reset": "tsx scripts/reset.ts",
    "test": "node --import tsx --test \"test/**/*.test.ts\""
  }
}
```
`tsconfig.json`: `target es2023`, `lib ["ES2023"]`, `module nodenext`, `types ["node"]`, `strict`, `verbatimModuleSyntax`, `skipLibCheck`, `noEmit`, `include ["src","scripts","test"]`. `tsconfig.build.json`: extends it with `noEmit:false`, `rootDir ./src`, `outDir ./dist`, `sourceMap`, `include ["src"]`. Build output verified: `dist/server.js`, `dist/config/*.js`, `dist/lua/buy.lua`, and no `dist/src` [VERIFIED: runtime probe].

### Pattern 3: Config that never throws at import, with URI guards (verified)
```ts
// src/config/env.ts — Source: p1probe, all branches executed this session
import "dotenv/config";               // first import; quiet by default in dotenv 18
export class ConfigError extends Error {}

export function parseMongoUri(uri: string): string {          // returns "host:port/db" for the banner
  let u: URL;
  try { u = new URL(uri); } catch { throw new ConfigError("MONGODB_URI không hợp lệ: chỉ hỗ trợ dạng mongodb://host:port/db."); }
  if (u.protocol !== "mongodb:") throw new ConfigError(`MONGODB_URI phải bắt đầu bằng mongodb:// (nhận ${u.protocol}).`);
  const port = u.port === "" ? 27017 : Number(u.port);        // implicit port = 27017
  if (port === 27017) throw new ConfigError("MONGODB_URI trỏ tới cổng 27017 (dịch vụ MongoDB của Windows). Dùng mongodb://127.0.0.1:27018/flashsale.");
  const db = u.pathname.replace(/^\//, "");
  if (db === "") throw new ConfigError("MONGODB_URI thiếu tên database (ví dụ /flashsale).");
  return `${u.hostname}:${port}/${db}`;
}
// loadBaseConfig(): MONGODB_URI, REDIS_URL required; PORT default 5000; CLIENT_ORIGIN default http://localhost:5173;
// MONGO_MAX_POOL_SIZE default 100 (positive-integer regex); nodeEnv; isTestMode = nodeEnv === "test"  (the ONE check)
// loadJwtSecret(): called by server.ts only — seed/reset never call it
```
Verified outcomes: `mongodb://localhost/flashsale` → refused (implicit 27017). A URI with no db → refused; without this guard Mongoose would silently use db `test`, and seed would drop `test`. Multi-host `mongodb://a:27018,b:27019/x` → `new URL` throws → refused. `MONGO_MAX_POOL_SIZE=abc` → refused. Missing `JWT_SECRET` → `[LỖI] Thiếu biến môi trường JWT_SECRET …`, exit 1 [VERIFIED: runtime probe].

### Pattern 4: Error middleware (verified mapping)
```ts
// src/middlewares/error.ts — Source: p1probe runtime matrix
import type { ErrorRequestHandler, RequestHandler } from "express";
import mongoose from "mongoose";
import { HttpError } from "../utils/http-error.js";

export const notFound: RequestHandler = () => { throw new HttpError(404, "Không tìm thấy", "NOT_FOUND"); };

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) { res.status(err.status).json({ message: err.message, code: err.code }); return; }
  if (err instanceof mongoose.Error.CastError) { res.status(400).json({ message: "Mã định danh không hợp lệ", code: "INVALID_ID" }); return; }
  if (err instanceof mongoose.Error.ValidationError) { res.status(400).json({ message: "Dữ liệu không hợp lệ", code: "VALIDATION_ERROR" }); return; }
  if (err instanceof mongoose.mongo.MongoServerError && err.code === 11000) { res.status(409).json({ message: "Dữ liệu bị trùng", code: "DUPLICATE" }); return; }
  const e = err as { type?: unknown; status?: unknown };
  if (e.type === "entity.parse.failed") { res.status(400).json({ message: "Body JSON không hợp lệ", code: "INVALID_JSON" }); return; }
  if (typeof e.status === "number" && e.status >= 400 && e.status < 500) { res.status(e.status).json({ message: "Yêu cầu không hợp lệ", code: "VALIDATION_ERROR" }); return; }
  console.error(err);                                   // stack to server log only
  res.status(500).json({ message: "Lỗi máy chủ", code: "INTERNAL_ERROR" });
};
```
The codes come from 01-CONTEXT.md:78-93 [VERIFIED: 01-CONTEXT.md:81-91, quoted verbatim: `VALIDATION_ERROR` 400, `INVALID_ID` 400, `INVALID_JSON` 400, `DUPLICATE` 409, `EMAIL_TAKEN` 409, `UNAUTHORIZED` 401, `INVALID_CREDENTIALS` 401, `FORBIDDEN` 403, `NOT_FOUND` 404, `INTERNAL_ERROR` 500]. Mount order: `app.use(cors(...))`, `app.use(express.json())`, `app.use("/api", api)`, `app.use(notFound)`, `app.use(errorHandler)`. The generic 4xx branch passes through other body-parser errors (oversized body → 413, verified) instead of turning them into 500s. Whether 413 keeps code `VALIDATION_ERROR` is an Open Question (minor).

### Pattern 5: Health with bounded pings (verified)
```ts
// Source: p1probe; Redis outage → false in 207 ms, then 0 ms while status === "reconnecting"
export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e: unknown) => { clearTimeout(t); reject(e); });
  });
}
export async function pingMongo(ms: number) {
  const db = mongoose.connection.db;                         // typed mongodb.Db | undefined in Mongoose 9
  if (mongoose.connection.readyState !== 1 || db === undefined) return false;
  return withTimeout(db.admin().ping().then(() => true), ms).catch(() => false);
}
export async function pingRedis(redis: Redis, ms: number) {
  if (redis.status !== "ready") return false;
  return withTimeout(redis.ping().then((r) => r === "PONG"), ms).catch(() => false);
}
// handler: const [mongo, redis] = await Promise.all([pingMongo(1000), pingRedis(r, 1000)]);
// res.status(mongo && redis ? 200 : 503).json({ mongo, redis, nodeEnv, maxPoolSize })
```
The Mongo side was verified only with Mongo down before boot (`readyState !== 1` → `false`). A Mongo outage *after* boot was not run live; the 1 s `withTimeout` bounds it whatever `readyState` reports [ASSUMED for the post-boot case].

### Pattern 6: Models (typechecked on Mongoose 9.11.4)
Collections and indexes per SPECS §6 [VERIFIED: docs/SPECS.md:111-117, quoted: `users` … "`email` unique, chữ thường"; `products` … "`slug` unique"; `flash_sales` … "Index `(status, startAt)`. `remainingQty` **không có `min`**"; `orders` … "Unique `(saleId, userId)`; index `(userId, createdAt desc)`"; `stock_movements` … "Index `(saleId, at)`"].
```ts
const userSchema = new Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true }, // unique here ONLY
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ["user", "admin"], required: true, default: "user" },
}, { collection: "users", timestamps: { createdAt: true, updatedAt: false } });

flashSaleSchema /* … */ ; // { collection: "flash_sales" }, remainingQty: { type: Number, required: true } — NO min
flashSaleSchema.index({ status: 1, startAt: 1 });
orderSchema.index({ saleId: 1, userId: 1 }, { unique: true });   // { collection: "orders", timestamps createdAt only }
orderSchema.index({ userId: 1, createdAt: -1 });
stockMovementSchema.index({ saleId: 1, at: 1 });                  // { collection: "stock_movements" }, orderId default null
// products: { collection: "products" }, slug unique, attributes: Schema.Types.Mixed, images: [String]
export const allModels = [User, Product, FlashSale, Order, StockMovement] as const;
```

### Pattern 7: Deterministic index creation (Mongoose source read)
```ts
// src/config/db.ts
await mongoose.connect(uri, {
  maxPoolSize,                     // explicit (D-16)
  serverSelectionTimeoutMS: 5000,  // D-19; verified exit after 5018 ms with Mongo down
  autoIndex: false,                // no background index builds at model compile time
  autoCreate: false,               // no background createCollection racing dropDatabase()
});
// src/models/index.ts
export async function ensureIndexes() { for (const m of allModels) await m.createIndexes(); }
```
Why: `mongoose.model()` calls `model.init().catch(noop)` immediately [VERIFIED: node_modules/mongoose/lib/mongoose.js:695 `model.init().catch(function $modelInitNoop() {});`]. `init()` waits for the connection, then runs `createCollection` and `ensureIndexes({ _automatic: true })` in the background [VERIFIED: lib/model.js:1131-1184]. Its errors are swallowed by that noop catch. Passing `autoIndex`/`autoCreate` to `connect` sets `conn.config` [VERIFIED: lib/drivers/node-mongodb-native/connection.js:258-267], and the automatic path then returns early [VERIFIED: lib/model.js:1769-1773]. The explicit `createIndexes()` → `ensureIndexes()` path ignores `autoIndex` and **rejects** on failure [VERIFIED: lib/model.js:1658-1691; runtime probe: a stubbed failing `createIndex` → `createIndexes()` rejected cleanly]. Server: `ensureIndexes()` before `listen`. Seed: `connect` → `dropDatabase()` → `ensureIndexes()` → inserts (D-21).

### Pattern 8: CLI scripts (verified on Windows bash + PowerShell 5.1)
```ts
// scripts/seed.ts
import { parseArgs } from "node:util";
const { values } = parseArgs({
  args: process.argv.slice(2),
  options: { qty: { type: "string", default: "100" }, mode: { type: "string", default: "v2" } },
  strict: true, allowPositionals: false,
});
if (!/^[1-9][0-9]*$/.test(values.qty)) fail(`--qty phải là số nguyên dương, nhận "${values.qty}"`);
// ... connect (loadBaseConfig — no JWT), seedDatabase({ qty, mode }), print D-08 summary,
// finally: await mongoose.disconnect(); await redis.quit();   // otherwise the process never exits
```
`parseArgs` throws English messages (`Unknown option '--bogus'`). Wrap the call in try/catch and print `[LỖI] Tham số không hợp lệ: …` plus a usage line, then exit 1. A CLI is not an Express handler, so the "no try/catch" rule does not apply here [VERIFIED: runtime probe]. In PowerShell 5.1, `npm` resolves to `npm.ps1`, and `npm run seed -- --qty 5 --mode v1` delivered both flags [VERIFIED: runtime probe].

### Pattern 9: Reset service with checked `multi()` (verified result shape)
```ts
// src/services/sale-admin.service.ts
let onSaleReset: (saleId: string) => void = () => {};             // Phase 2 wires saleCache.invalidate
export function setSaleResetHook(fn: (saleId: string) => void) { onSaleReset = fn; }

export async function resetSale(redis: Redis, saleId: string, opts: { mode?: Mode } = {}) {
  const sale = await FlashSale.findById(saleId, { totalQty: 1, mode: 1 }).lean();
  if (!sale) throw new HttpError(404, "Không tìm thấy đợt sale", "NOT_FOUND");
  const now = new Date(); const endAt = new Date(now.getTime() + 7 * 24 * 3600 * 1000);
  await FlashSale.updateOne({ _id: saleId }, { $set: { remainingQty: sale.totalQty, status: "active", startAt: now, endAt, ...(opts.mode ? { mode: opts.mode } : {}) } });
  await Order.deleteMany({ saleId });
  await StockMovement.deleteMany({ saleId });
  const res = await redis.multi().set(stockKey(saleId), sale.totalQty).del(buyersKey(saleId)).exec();
  if (res === null) throw new Error("Redis multi() bị hủy");
  for (const [err] of res) if (err) throw err;                    // exec() RESOLVES with per-command errors
  await StockMovement.create({ saleId, orderId: null, delta: sale.totalQty, reason: "reset", at: now });
  onSaleReset(saleId);
}
```
Verified `exec()` → `[[null,"OK"],[null,0]]`. A `WRONGTYPE` inside a `multi` resolved as `[[null,"OK"],["WRONGTYPE …",null]]`, and the first `SET` **stayed applied**, because Redis transactions don't roll back [VERIFIED: runtime probe vs 7.4.12]. Read `totalQty` first and then `$set`. Don't use an update pipeline (`[{ $set: { remainingQty: "$totalQty" } }]`): Mongoose 9 rejects pipelines unless `updatePipeline: true` [VERIFIED: lib/query.js:1824-1826, lib/mongoose.js:248]. Key names follow SPECS [VERIFIED: docs/SPECS.md:125-126, quoted: "`stock:<saleId>`", "`buyers:<saleId>`"].

### Pattern 10: Auth middleware (verified matrix)
```ts
// Source: p1probe — every branch hit at runtime
const requireAuth: RequestHandler = (req, _res, next) => {
  if (cfg.isTestMode) {                                  // the single test-mode check
    const h = req.get("x-test-user");
    if (h !== undefined) {
      const id = normalizeObjectId(h);                   // /^[0-9a-fA-F]{24}$/ then toLowerCase()
      if (id === null) throw new HttpError(401, "x-test-user không phải ObjectId hợp lệ", "UNAUTHORIZED");
      req.user = { id, role: "user" }; return next();
    }
  }
  const m = /^Bearer ([^\s]+)$/.exec(req.get("authorization") ?? "");
  if (m === null) throw new HttpError(401, "Bạn chưa đăng nhập", "UNAUTHORIZED");
  let payload: string | jwt.JwtPayload;
  try { payload = jwt.verify(m[1]!, jwtSecret, { algorithms: ["HS256"] }); }
  catch (e) {
    if (e instanceof jwt.TokenExpiredError) throw new HttpError(401, "Phiên đăng nhập đã hết hạn", "UNAUTHORIZED");
    throw new HttpError(401, "Token không hợp lệ", "UNAUTHORIZED");
  }
  const id = typeof payload === "object" ? normalizeObjectId(payload.sub) : null;
  const role = typeof payload === "object" ? (payload as { role?: unknown }).role : undefined;
  if (id === null || (role !== "user" && role !== "admin")) throw new HttpError(401, "Token không hợp lệ", "UNAUTHORIZED");
  req.user = { id, role }; next();
};
// sign: jwt.sign({ role }, secret, { algorithm: "HS256", expiresIn: "7d", subject: userId })
// admin router: adminRouter.use(requireAuth, requireAdmin); api.use("/admin", adminRouter)
```
The try/catch around `jwt.verify` is local error translation, not an async-handler wrapper, so it stays within the convention. `req.user` typing: `src/types/express.d.ts` with `declare global { namespace Express { interface Request { user?: { id: string; role: Role } } } } export {};` (typechecked). Use either `subject` in the options **or** `sub` in the payload, never both: jsonwebtoken rejects that combination [ASSUMED from jsonwebtoken option validation; the `subject` form was verified].

### Anti-Patterns to Avoid
- **Reading `process.env` at module top level in a non-entry module while calling `dotenv.config()` in `server.ts`'s body.** ESM hoists imports, so config sees `undefined`. Put `import "dotenv/config"` at the top of `config/env.ts` and read values inside functions.
- **Hashing in a Mongoose `pre("save")` hook.** D-10 forbids it, and Mongoose 9 removed `next()` from pre middleware.
- **Pre-checking email existence before `create`.** Races; D-11 requires catching E11000 instead.
- **Adding an admin-only test endpoint just to exercise `requireAdmin`.** Not needed: `/api/admin/<anything>` already returns 401/403 (verified).
- **Logging per request** (morgan etc.). Phase 1 sets the "no logs in the buy path" baseline.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CLI flag parsing | Manual `process.argv` loops | `node:util` `parseArgs` (`strict: true`) | Handles `--x=1` and `--x 1`, rejects unknown flags (verified) |
| URI parsing for the guard/banner | Regexes over `mongodb://…` | WHATWG `new URL()` | Handles credentials, query strings, and the implicit port (`port === ""`) (verified) |
| Password hashing | Custom crypto | `bcryptjs` cost 10, plus the `bcrypt.truncates()` check | Salted, constant-time compare; truncation detectable |
| Token signing/expiry | Custom HMAC | `jsonwebtoken` with `algorithms: ["HS256"]` | Rejects `alg: none`, expired tokens get a typed error (verified) |
| Test runner | Ad-hoc scripts that print PASS | `node:test` + `node:assert/strict` via `--import tsx` | Built in, exit codes work through npm on both shells (verified) |
| HTTP tests | supertest | `app.listen(0)` + global `fetch` | Zero dependencies; the probe used exactly this |
| Unique-email enforcement | `findOne` then `create` | Unique index + catch `MongoServerError` code 11000 | Race-free (D-11) |
| Env file for test mode | `NODE_ENV=test npm start` / cross-env | `node --env-file=.env.test` | Works in PowerShell; `--env-file` wins over dotenv (verified) |

**Key insight:** Every fail-fast behaviour in this phase depends on a library default that is wrong for this project: 30 s server selection, ioredis infinite retry, the listen callback missing IPv4 holders, background auto-indexing. Set each override explicitly in one config module and test it once by hand.

## Common Pitfalls

### Pitfall 1: Port 5000 "taken" is not detected on Windows when the other process bound IPv4 only (NEW)
**What goes wrong:** `app.listen(5000)` (no host, D-19) binds `::`. If another process holds `127.0.0.1:5000` or `0.0.0.0:5000`, Windows lets our bind succeed. The callback gets **no** error, the banner prints, and `127.0.0.1:5000` traffic goes to the other process.
**Evidence (this machine):** a bind matrix with a blocker on 127.0.0.1 / 0.0.0.0 / :: / ::1 against our bind with no host / 127.0.0.1 / 0.0.0.0 / ::. `EADDRINUSE` occurred **only** for identical addresses. Blocker `::` with ours unspecified → `EADDRINUSE` (this is the stale-copy-of-our-own-server case, which is still caught) [VERIFIED: runtime probe].
**How to avoid:** `assertPortFree(port)` before Mongo connect. It does `net.connect` to `127.0.0.1:port` and `::1:port` with a ~1 s timeout. Any successful connect → "Cổng 5000 đang bị chiếm…", exit 1. Any error (ECONNREFUSED, EADDRNOTAVAIL on IPv6-less hosts) → treat as free. Measured: refused in 3 ms, listener found in 0–1 ms for all four blocker types [VERIFIED: runtime probe]. **Keep** the listen-callback check as well (SPECS §11 requires it, and it covers the TOCTOU window). Running the probe before Mongo connect also gives a fast failure, and lets an automated test check the port case without Docker.
**Warning signs:** Server prints its banner, but `curl http://127.0.0.1:5000/api/health` answers with something else.

### Pitfall 2: Background index builds race `dropDatabase()` in seed
**What goes wrong:** Models compiled at import start `init()`, which creates collections and indexes as soon as the connection opens. Seed then drops the database at the same time. In-flight builds get aborted, and their errors are swallowed.
**How to avoid:** Pattern 7 (`autoIndex:false, autoCreate:false` + explicit `ensureIndexes()` after `dropDatabase()`). Seed should then print the `orders` index list (or at least assert `saleId_1_userId_1` exists via `Order.collection.indexes()`).
**Warning signs:** `docker exec flashsale-mongo mongosh flashsale --quiet --eval "db.orders.getIndexes()"` shows only `_id_`.

### Pitfall 3: Seeding while the backend is running
**What goes wrong:** Seed drops the DB (including indexes). The running server ran `ensureIndexes()` only at boot, so it now runs without unique indexes until restarted. Its in-memory state (Phase 2 sale cache) is also stale.
**How to avoid:** The seed output (D-08) should end with "Khởi động lại backend nếu đang chạy". The reset CLI already prints the cache warning (D-07). Do not try to detect a running server from seed.

### Pitfall 4: bcrypt 72-byte truncation vs. "72 characters" (NEW)
**What goes wrong:** `"ư".repeat(40)` is 40 characters but 80 bytes. bcryptjs hashes only the first 72 bytes, so a *different* password sharing the first 36 `ư` characters compares `true` [VERIFIED: runtime probe; `bcrypt.truncates(p)` returned `true`].
**How to avoid:** Validate `password.length >= 6 && Buffer.byteLength(password, "utf8") <= 72` (or `!bcrypt.truncates(password)`) → else 400 `VALIDATION_ERROR` "Mật khẩu 6–72 byte". This matches D-10's stated intent ("72 is bcrypt's byte limit").

### Pitfall 5: Duplicate index declarations
**What goes wrong:** Declaring `unique: true` on `email` **and** `userSchema.index({ email: 1 }, { unique: true })` makes Mongoose warn "Duplicate schema index", and options on the duplicate are ignored [VERIFIED: lib/model.js:1720-1734].
**How to avoid:** Field-level `unique: true` for single fields (`email`, `slug`). `schema.index()` only for compound indexes.

### Pitfall 6: Scripts that never exit
**What goes wrong:** ioredis keeps its socket open and Mongoose keeps its pool open, so `npm run seed` prints its summary and then hangs.
**How to avoid:** `finally { await mongoose.disconnect(); await redis.quit(); }` in every CLI. Use `redis.disconnect()` in failure paths where the connection may be dead.

### Pitfall 7: ioredis startup errors are vague
**What goes wrong:** With `lazyConnect: true`, `connect()` to a dead port rejects in ~7 ms with just `Connection is closed.` [VERIFIED: runtime probe]. Without an `error` listener, ioredis also prints "Unhandled error event" on every retry.
**How to avoid:** Always `redis.on("error", …)` (silent, or throttled logging). Wrap the startup `connect()`+`ping()` and print `Không kết nối được Redis tại 127.0.0.1:6379 …` with the target from config. Commands issued during an outage reject after ~670 ms with `Reached the max retries per request limit (which is 1)` [VERIFIED: runtime probe], which is the desired runtime fail-fast. The client reconnects on its own when Redis returns (253 ms after `docker start`) [VERIFIED: runtime probe].

### Pitfall 8: `.env` resolution depends on the working directory
**What goes wrong:** `import "dotenv/config"` reads `.env` from `process.cwd()`, and `--env-file=.env.test` is also cwd-relative. Running `node backend/dist/server.js` from the repo root finds neither. `--env-file` with a missing file is a hard error (`not found`, exit 9) [VERIFIED: runtime probe].
**How to avoid:** Always run through `npm run …` inside `backend/`. Commit `.env.test` (D-20; `git check-ignore` confirms `backend/.env.test` is not ignored, only `backend/.env` [VERIFIED: .gitignore:3 `.env`]).

### Pitfall 9: Request body edge cases
`req.body` is `undefined` when there is no JSON content-type, so destructuring it throws a 500. Bodies can be arrays or objects with `$`-operators. The probe's `(body ?? {})` + `typeof field === "string"` approach returned 400 for all of these [VERIFIED: runtime probe]. Duplicate `x-test-user` headers arrive joined as `"a, b"` and correctly fail the regex → 401 [VERIFIED].

## Code Examples

### Boot sequence (`src/server.ts`)
```ts
// Source: p1probe/src/server.ts (ran: missing JWT → exit 1; Mongo down → exit 1 after 5018 ms)
function fail(msg: string): never { console.error(`[LỖI] ${msg}`); process.exit(1); }
let cfg: BaseConfig, jwtSecret: string;
try { cfg = loadBaseConfig(); jwtSecret = loadJwtSecret(); }
catch (e) { if (e instanceof ConfigError) fail(e.message); throw e; }
if (!(await assertPortFree(cfg.port))) fail(`Cổng ${cfg.port} đang bị chiếm bởi tiến trình khác. Dừng tiến trình đó rồi chạy lại.`);
try { await connectMongo(cfg.mongoUri, cfg.mongoMaxPoolSize); }
catch { fail(`Không kết nối được MongoDB tại ${cfg.mongoTarget}. Chạy "docker compose up -d --wait" ở thư mục gốc.`); }
try { await ensureIndexes(); } catch (e) { fail(`Không tạo được index MongoDB: ${(e as Error).message}`); }
const redis = createRedis(cfg.redisUrl);           // { connectTimeout: 5000, maxRetriesPerRequest: 1, lazyConnect: true } + on("error")
try { await redis.connect(); await redis.ping(); }
catch { redis.disconnect(); await mongoose.disconnect(); fail(`Không kết nối được Redis tại ${cfg.redisTarget}.`); }
if (cfg.isTestMode) console.warn("!!! CHẾ ĐỘ TEST: header x-test-user được chấp nhận — KHÔNG dùng ngoài đo tải !!!");
createApp({ cfg, jwtSecret, redis }).listen(cfg.port, (err?: Error) => {
  if (err) fail((err as NodeJS.ErrnoException).code === "EADDRINUSE" ? `Cổng ${cfg.port} đang bị chiếm…` : `Không mở được cổng ${cfg.port}: ${err.message}`);
  console.log(`API http://localhost:${cfg.port} | Mongo ${cfg.mongoTarget} | Redis ${cfg.redisTarget} | NODE_ENV=${cfg.nodeEnv} | maxPoolSize=${cfg.mongoMaxPoolSize}`);
});
```

### Register service (E11000 → EMAIL_TAKEN)
```ts
// error class verified by typecheck; live E11000 not run (no mongo image) — see Assumptions A2
export async function register(input: { name: string; email: string; password: string }) {
  const passwordHash = await bcrypt.hash(input.password, 10);
  try {
    const u = await User.create({ name: input.name, email: input.email, passwordHash, role: "user" });
    return toAuthResponse(u);                       // { token, user: { id, name, email, role } }
  } catch (e) {
    if (e instanceof mongoose.mongo.MongoServerError && e.code === 11000) throw new HttpError(409, "Email đã được sử dụng", "EMAIL_TAKEN");
    throw e;
  }
}
```

### Seed users (one hash, `insertMany`)
```ts
const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);   // ~60–76 ms once
const users = Array.from({ length: 1000 }, (_, i) => {
  const n = String(i + 1).padStart(4, "0");
  return { name: `Người dùng ${n}`, email: `user${n}@flashsale.local`, passwordHash, role: "user" as const };
});
await User.insertMany([{ name: "Quản trị viên", email: "admin@flashsale.local", passwordHash, role: "admin" }, ...users]);
```
Values from D-04 [VERIFIED: 01-CONTEXT.md:45, quoted: "`admin@flashsale.local`", "`user0001@flashsale.local` … `user1000@flashsale.local`", "`Người dùng 0001` … `Người dùng 1000`", "**`matkhau123`**", "cost 10"]. The admin display name "Quản trị viên" is [ASSUMED] (wording is Claude's discretion).

### `buy.lua` (Phase 1 only needs the file to exist for the build copy)
Copy verbatim from SPECS [VERIFIED: docs/SPECS.md:241-252]. Do not wire `defineCommand` in Phase 1 (01-CONTEXT.md:19).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `serverSelectionTimeoutMS` default 30 s | Explicit 5 s | Project decision (D-19) | Boot fails in ~5 s (measured 5018 ms) |
| `pre('save', function(next){…})` | Async hooks, no `next` (Mongoose 9) | Mongoose 9.0 | Irrelevant here: hashing lives in the service |
| `findOneAndUpdate({new:true})` | `returnDocument: "after"` | Mongoose 9.2 | Phase 2 concern; listed so Phase 1 helpers don't copy old snippets |
| `FilterQuery` type | `QueryFilter` | Mongoose 9 | Use the new name if typing filters |
| `@types/bcryptjs` | Bundled types in bcryptjs 3 | bcryptjs 3.0 | Don't install it |
| npm runs every install script | npm 11 asks to approve install scripts (`npm install-scripts approve`) | npm 11.x (observed with 11.19.1) | esbuild postinstall skipped, tsx still works; don't approve in plans |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `mongo:7.0` image ships `mongosh` for the healthcheck | Pattern 1 | `--wait` fails; switch the healthcheck command. Caught on the first `docker compose up --wait` |
| A2 | `User.create` duplicate email throws `MongoServerError` with `code === 11000` (not run live; no mongo image locally) | Code Examples / AUTH-01 | 409 path would 500. The integration test must cover it |
| A3 | After boot, a Mongo outage makes `pingMongo` return `false` within the 1 s timeout | Pattern 5 | Health could report `mongo:true` falsely. The integration check (`docker stop flashsale-mongo` → 503) verifies it |
| A4 | jsonwebtoken rejects `sub` in the payload combined with the `subject` option | Pattern 10 | Only matters if both are used. Pick one form |
| A5 | Admin display name "Quản trị viên" | Code Examples | Cosmetic |
| A6 | `insertMany` applies `timestamps` (`createdAt`) to users | Code Examples | `createdAt` missing on seeded users. Cosmetic for Phase 1 |

## Open Questions

1. **What `code` do non-JSON body-parser errors get (413 too large, 415 charset)?**
   - What we know: they arrive with a numeric `status` and `type`. The generic branch keeps the status (413 verified).
   - What's unclear: the D-15 table has no code for them.
   - Recommendation: keep the HTTP status and use `VALIDATION_ERROR` with the message "Yêu cầu không hợp lệ". No new code is needed. The planner can lock this without asking.
2. **Where does the integration test point?**
   - What we know: seed drops the whole `flashsale` DB and `FLUSHDB`s Redis db 0.
   - Recommendation: integration tests use `MONGODB_URI=mongodb://127.0.0.1:27018/flashsale_test` and `REDIS_URL=redis://127.0.0.1:6379/1`, so running tests never destroys the demo data. This needs `seedDatabase()` and `resetSale()` to be importable services that take config, not code inlined in CLI files. Have `parseRedisUrl` also print the db index if non-zero.
3. **Should a weak `JWT_SECRET` (< 32 chars) be refused?**
   - Recommendation: warn only (`console.warn`), don't refuse. SPECS only forbids a default, and Phase 4's start script generates 32 bytes.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | everything | ✓ | v24.22.1 | — |
| npm | install/scripts | ✓ | 11.19.1 | — |
| Docker Engine (Docker Desktop running) | INFRA-01 | ✓ | 29.7.2 | Start Docker Desktop manually (SPECS §11) |
| Docker Compose v2+ | `up -d --wait` | ✓ | v5.4.0 | — |
| `mongo:7.0` image | INFRA-01 | ✗ (not pulled; tag exists on Docker Hub) | — | Pulled automatically by first `docker compose up` (~network download) |
| `redis:7.4` image | INFRA-01 | ✗ locally as `7.4` (only `redis:7` present, which is 7.4.12); tag exists | — | Pulled by compose |
| Windows `MongoDB` service on 27017 | — (must be avoided) | running (pid listening on 127.0.0.1:27017) | — | Guarded by D-18 URI check |
| Ports 27018, 6379, 5000 | compose, backend | free at research time | — | — |
| PowerShell 5.1 | npm in PS | ✓ | 5.1.26100 | — |
| `mongosh` / `redis-cli` on host | manual checks | ✗ | — | `docker exec flashsale-mongo mongosh …`, `docker exec flashsale-redis redis-cli …` |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** both images get pulled on the first `docker compose up -d --wait`, which needs network access once.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Node built-in `node:test` + `node:assert/strict`, TS via `--import tsx` (Node 24.22.1, tsx 4.23.15) |
| Config file | none. The script glob is in `package.json`. Add `"test"` to `tsconfig.json` `include` so tests are typechecked |
| Quick run command | `npm run typecheck && npm test` (unit, no Docker, < 5 s) |
| Full suite command | `npm run build && npm test && npm run test:int` (`test:int` = `node --import tsx --test "test/integration/**/*.test.ts"`, needs `docker compose up -d --wait`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INFRA-01 | Both containers healthy, AOF everysec | smoke (manual-ish, scriptable) | `docker compose up -d --wait && docker exec flashsale-redis redis-cli CONFIG GET appendfsync` | ❌ Wave 0 (compose file) |
| INFRA-02 | build emits `dist/server.js` + `dist/lua/buy.lua` | unit | `npm run build` then `test/build.test.ts` asserts files exist | ❌ Wave 0 |
| INFRA-03 | exit 1 + VN message: no JWT / 27017 URI / Mongo down (port 27999) / port busy | unit (spawn `node dist/server.js`, cwd = tmp dir so no `.env` is loaded) | `npm test` → `test/boot.test.ts` | ❌ Wave 0 |
| INFRA-03 | Redis down exits 1 | integration (needs Mongo up, Redis URL to a dead port) | `npm run test:int` | ❌ Wave 0 |
| INFRA-04 | health 200 with both up; 503 when one is down | integration + manual `docker stop flashsale-redis` | `npm run test:int` (dead Redis URL → 503) | ❌ Wave 0 |
| INFRA-05 | error mapping table | unit (`createApp` on port 0 + fetch) | `npm test` → `test/errors.test.ts` | ❌ Wave 0 |
| INFRA-06 | `maxPoolSize` in banner + health | unit/integration | health JSON assertion in `test:int` | ❌ Wave 0 |
| DATA-01/02 | 5 collections named correctly, all indexes incl. unique `saleId_1_userId_1` | integration | `test/integration/models.test.ts` (`collection.indexes()`) | ❌ Wave 0 |
| DATA-03 | seed counts 1001 users, 6 products, 1 sale, `stock:<id>` = qty, no buyers key | integration | `test/integration/seed.test.ts` against `flashsale_test` / redis db 1 | ❌ Wave 0 |
| DATA-03 | CLI arg validation | unit | `test/cli-args.test.ts` (pure parse function) | ❌ Wave 0 |
| DATA-04 | reset restores qty, deletes orders/movements, Redis SET+DEL, reopens, writes reset movement, calls hook | integration | `test/integration/reset.test.ts` | ❌ Wave 0 |
| DATA-05 | reset CLI warning printed | manual | `npm run reset` output check | — |
| AUTH-01 | role forced `user`, non-string → 400, dup → 409 `EMAIL_TAKEN` | unit (validation) + integration (dup) | `npm test` + `npm run test:int` | ❌ Wave 0 |
| AUTH-02 | JWT HS256, 7 d, `sub`+`role` | unit | decode + assert `exp - iat === 604800` | ❌ Wave 0 |
| AUTH-03/04/05 | 401/403 matrix, x-test-user only in test mode | unit (`createApp` with `isTestMode` true/false, hit `/api/admin/x`) | `npm test` → `test/auth.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm run typecheck && npm test`
- **Per wave merge:** `npm run build && npm test && npm run test:int` (compose up)
- **Phase gate:** full suite green, plus a manual 4-case boot check (JWT missing, Docker stopped, Redis container stopped, port 5000 held by `node -e "require('net').createServer().listen(5000,'127.0.0.1')"`), before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `backend/package.json` `test` + `test:int` scripts; `tsconfig.json` include `test`
- [ ] `backend/test/helpers.ts`: `startApp(cfgOverrides)` on port 0 with a fake/real Redis; `spawnServer(env)` with `cwd: mkdtemp`
- [ ] Unit test files: `boot`, `errors`, `auth`, `cli-args`, `config` (URI guards)
- [ ] Integration test files: `models`, `seed`, `reset`, `register-dup`, `health` (use `flashsale_test` DB + Redis db 1)
- [ ] Framework install: none (built-in)

## Security Domain

`security_enforcement: true`, ASVS level 1, block on `high`.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | bcryptjs cost 10; password 6 chars – 72 bytes; generic `INVALID_CREDENTIALS` for unknown email and wrong password (D-12) |
| V3 Session Management | yes (stateless JWT) | HS256, 7-day `exp`, `algorithms: ["HS256"]` pinned (rejects `alg:none`, verified); no revocation, accepted by SPECS §7 ("token cũ vẫn hợp lệ") |
| V4 Access Control | yes | `requireAdmin` via `router.use` on `/api/admin`; role never taken from the client (D-10); `x-test-user` always `role:"user"` |
| V5 Input Validation | yes | `typeof === "string"` on every field; body may be `undefined`/array; ObjectId regex + lowercase; optional `mongoose.set("sanitizeFilter", true)` as defence in depth |
| V6 Cryptography | yes | No hand-rolled crypto; `JWT_SECRET` has no default, never printed |
| V7 Error Handling & Logging | yes | 500 → generic `{message, code:"INTERNAL_ERROR"}`; stack only on server stderr (verified no leak) |
| V14 Configuration | yes | Compose ports bound to 127.0.0.1; `.env` gitignored; `.env.test` holds no secret |

### Known Threat Patterns for Express + Mongoose + JWT

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| NoSQL operator injection in login (`{"email":{"$ne":null}}`) | Tampering / Elevation | String-type check before any query (verified 400) |
| Mass assignment of `role: "admin"` on register | Elevation | Service builds the document explicitly with `role: "user"` |
| JWT `alg: none` / algorithm confusion | Spoofing | `jwt.verify(..., { algorithms: ["HS256"] })` (verified 401) |
| Test-mode header active outside load tests | Spoofing | Single `isTestMode` flag from `NODE_ENV === "test"`; loud boot warning; never set `NODE_ENV=test` in `.env` |
| User enumeration via login/register | Information disclosure | Same 401 message for login. Register's 409 `EMAIL_TAKEN` does reveal existence; accepted (SPECS requires 409) |
| Timing-based user enumeration on login | Information disclosure | Optional: run `bcrypt.compare` against a dummy hash when the email is missing (LOW priority at ASVS L1) |
| Oversized JSON bodies | DoS | `express.json()` default 100 kB limit → 413 (verified) |
| Exposed passwordless DBs | Information disclosure | `127.0.0.1:` prefix on both compose ports |
| Connecting to the wrong DB (27017 service) and wiping it with seed | Tampering | D-18 guard runs before any connect in server **and** scripts (verified) |

## Sources

### Primary (HIGH confidence)
- npm registry (`npm view` version/time/engines, 2026-11-04) for all 13 backend packages, plus `npm view @types/node@24 version`
- `gsd-tools query package-legitimacy check --ecosystem npm` (2026-11-04)
- Package source in the scratch install: `mongoose@9.11.4` `lib/model.js` (init 1118-1194, ensureIndexes/createIndexes 1658-1691, `_ensureIndexes` 1698-1833, syncIndexes 1330-1357), `lib/mongoose.js:695`, `lib/drivers/node-mongodb-native/connection.js:254-271`, `lib/query.js:1824`, `types/connection.d.ts:109`; `bcryptjs@3.0.3` `types.d.ts:138`; `mongodb@7.7.0` `lib/error.js:167`, `lib/bulk/common.js:379`
- Runtime probes in `C:\Users\sonma\AppData\Local\Temp\claude\830e9a56351f8077\1facbcb0-54a1-4750-98d5-71c613d14a7d\scratchpad\p1probe` (TS 7.0.2 typecheck + build, server fail-fast, HTTP error/auth matrix, ioredis vs `redis:7` 7.4.12, env precedence, Windows bind matrix, connect probe, node:test via npm in bash and PowerShell 5.1)
- `docker compose config` validation and `docker manifest inspect` for `mongo:7.0`, `redis:7.4`
- Project files read this session: `docs/SPECS.md`, `01-CONTEXT.md`, `REQUIREMENTS.md`, `STATE.md`, `PROJECT.md` (Key Decisions), `.gitignore`, `.planning/research/{STACK,ARCHITECTURE,PITFALLS}.md`, `.claude/CLAUDE.md`

### Secondary (MEDIUM confidence)
- `.planning/research/STACK.md` / `PITFALLS.md` (earlier session; their runtime claims were re-confirmed here where they touch Phase 1)

### Tertiary (LOW confidence)
- None used. No web search was needed: all search providers are disabled in config, and every claim was checked locally.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH. Registry-verified today and installed and compiled together.
- Architecture: HIGH. The boot sequence, error mapping, and auth matrix were executed. The only remaining assumptions concern the MongoDB server (A1–A3).
- Pitfalls: HIGH. The Windows bind behaviour, bcrypt truncation, index race (source), and `multi` non-rollback were all reproduced.

**Research date:** 2026-11-04
**Valid until:** 2026-12-04 (stable pins; recheck only if `npm install` resolves different minors)
