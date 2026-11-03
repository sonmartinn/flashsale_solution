# Phase 1: Foundation (Infra, Data, Auth) - Context

**Gathered:** 2026-11-03
**Status:** Ready for planning

<domain>
## Phase Boundary

What this phase delivers:
- `docker-compose.yml` with MongoDB 7 and Redis 7.4 (AOF everysec), both healthy
- A TypeScript ESM backend skeleton that fails fast on bad configuration and serves `GET /api/health`
- The error middleware and `HttpError`
- 5 Mongoose models with every SPECS §6 index
- `npm run seed` and `npm run reset`, sharing one reset service that the Phase 2 admin API will also call
- Register and login with JWT, `requireAuth` (plus the `x-test-user` test mode) and `requireAdmin`

Not in this phase:
- Buy endpoints (V0/V1/V2), read APIs for products and sales, admin HTTP routes, the sale cache, reconcile. All of these are Phase 2.
- `buy.lua` must exist in Phase 1 only so that `build` copies `src/lua/` to `dist/lua/` (success criterion 2). It is the script from SPECS §8 verbatim. Wiring it with `defineCommand` belongs to Phase 2.

Requirements: INFRA-01..06, DATA-01..05, AUTH-01..05.

</domain>

<decisions>
## Implementation Decisions

The user asked Claude to choose reasonable defaults for a course project ("Không cần bàn gì nhiều, cứ chọn những gì mà bạn thấy hợp lí"). The decisions below are Claude's choices and are now locked for planning.

### Seed data
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

### Seed/reset CLI parameters
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

### Register and login
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

### Errors
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

### Health, config and startup
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

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements and scope
- `docs/SPECS.md` §4, §5, §6, §7, §11: the only requirements source (stack, folder layout, data design, seed/reset, API table, auth, test mode, error codes, env and fail-fast rules)
- `docs/SPECS.md` §8: `buy.lua` text (the file is created in Phase 1 for the build copy step)
- `.planning/REQUIREMENTS.md`: INFRA-01..06, DATA-01..05, AUTH-01..05 checklist
- `.planning/ROADMAP.md`: Phase 1 success criteria
- `.planning/PROJECT.md`: Key Decisions table (mode via reset, `code` field, shared reset service, cache cleared on reset)

### Stack and patterns (verified versions, import forms, config)
- `.claude/CLAUDE.md`: pinned versions, the `package.json`/tsconfig/compose essentials, what NOT to use (`new: true`, named jsonwebtoken imports, `localhost:27017`, `@types/bcryptjs`)
- `.planning/research/STACK.md`: full verified configuration (tsconfig, build copy step, `start:test`)
- `.planning/research/ARCHITECTURE.md`: layer responsibilities, `config/env.ts` must not throw at import (seed/reset run without `JWT_SECRET`), build order steps 1–3
- `.planning/research/PITFALLS.md`: wrong-Mongo guard, 30 s connect timeout, ObjectId normalization, single test-mode check, Mongoose 9 hook changes, compose healthchecks for `--wait`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None. This is a from-scratch rebuild; the repo contains only `docs/`, `.planning/`, `.gitignore`, and `.claude/CLAUDE.md`. The old code at `40dea55` must not be restored.

### Established Patterns
- `.gitignore` already ignores `node_modules/`, `dist/`, `.env`, `*.log`, and `loadtest/results/*` (except `.gitkeep`). `backend/.env.test` is not matched by `.env`, so it can be committed as intended.

### Integration Points
- Phase 2 hooks into: the reset service (admin route plus cache invalidation), `requireAuth`/`requireAdmin`, `HttpError` and the code table, models, the Redis singleton (Lua `defineCommand`), and `stock:`/`buyers:` key helpers.
- Phase 3 depends on: health `nodeEnv`/`maxPoolSize`, admin credentials from seed (D-04), `seed --qty`, and test-mode header semantics (D-14).
- Phase 4 depends on: the register/login response shape (D-12), the error `code` field, and image paths (D-02).

</code_context>

<specifics>
## Specific Ideas

- Seed output is the handoff to everyone else (demo and load scripts), so it should be readable and should list credentials and `saleId` at the end.
- Keep everything offline-capable: no external image hosts, no network calls in seed.

</specifics>

<deferred>
## Deferred Ideas

- **Phase 3:** `.gitignore` currently ignores all of `loadtest/results/*`, but SPECS needs the summary CSVs committed. Phase 3 must add an exception (for example `!loadtest/results/*.csv`, with raw output in a subfolder or under another extension).
- **Phase 3:** Consider letting the admin reset accept `totalQty` so E1 (100) and E2 (≥1000) can switch without a reseed. Not in SPECS, so only add it if reseeding between experiments turns out to be painful.
- **Phase 4:** Add `.dev/` to `.gitignore` (DEV-04). Provide product images or placeholders at `frontend/public/images/products/<slug>.jpg`.

</deferred>

---

*Phase: 01-foundation-infra-data-auth*
*Context gathered: 2026-11-03*
