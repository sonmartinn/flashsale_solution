# Stack Research

**Domain:** Flash-sale web app that prevents overselling (Express 5 API + React 19 SPA, MongoDB 7 as source of truth, Redis 7 + Lua as the fast path, autocannon load tests). University NoSQL course project.
**Researched:** 2026-11-03
**Confidence:** HIGH. Most claims were checked against the npm registry, the package source or types in the published tarballs, and throwaway runs in the scratchpad: `tsc` 7.0.2 type-checks, a Vite 8 build, ioredis 6 against a real `redis:7` container, an autocannon distribution test, and Express 5 runtime probes. Claims that rest only on web pages are marked MEDIUM or LOW.

> The stack is **fixed by `docs/SPECS.md` section 4**. This document does not propose another stack. It pins versions, flags compatibility traps, and gives the usage patterns that phases should follow.

**Confidence methodology.** The GSD `classify-confidence` seam rates `webfetch` and `websearch` as LOW, even when cross-checked. A claim is only raised to HIGH here when it was checked against package source, registry metadata, or a local run in this session. Claims based only on official docs read through WebFetch are MEDIUM.

---

## Recommended Stack

### Core Technologies

| Technology | Version (pin) | Purpose | Why / notes | Conf. |
|---|---|---|---|---|
| Node.js | runtime 24.x LTS (dev machine: 24.22.1); `engines: ">=20.19.0"` (backend), `"^20.19.0 \|\| >=22.12.0"` (frontend) | Runtime | Mongoose 9 and the MongoDB driver 7.7 need `>=20.19.0`. Vite 8 and `@vitejs/plugin-react` 6 need `^20.19.0 \|\| >=22.12.0`. ioredis 6 needs `>=20`. **Node 20 reached EOL on 2026-04-30**, so README should say "tested on Node 24" while keeping the spec's `engines`. | HIGH (engines) / MEDIUM (EOL date) |
| TypeScript | `~7.0.2` (both sides) | Type checking and backend emit | 7.0 is the native (Go) `tsc`, released 2026-07-08. The official `create-vite` 9.3.3 react-ts template pins `typescript: ~7.0.2`. The backend tsconfig below was verified on 7.0.2. Use `~`, because TS minors can add new errors. | HIGH |
| Express | `^5.3.0` | HTTP API | 5.3.0 released 2026-10-09. Async handler errors are forwarded to the error middleware, and `app.listen` passes `error` to its callback. Both were checked at runtime. | HIGH |
| Mongoose | `^9.11.4` (bundles `mongodb ~7.7`) | ODM for MongoDB | Required by spec. 9.x deprecates `new: true` and recommends `returnDocument`. Collection names must be set explicitly. | HIGH |
| ioredis | `^6.0.0` | Redis client, Lua via `defineCommand` | 6.0.0 released 2026-07-31. `defineCommand` + Lua + `multi()` were checked against Redis 7.4.12: 100 successes out of 1000 concurrent calls on stock 100. | HIGH |
| React / React DOM | `^19.3.1` | UI | Current, and the Vite template pins it. | HIGH |
| React Router | **`^7.18.5`** (package `react-router`, declarative mode) | SPA routing | `latest` on npm is **8.5.1**, which requires **Node >=22.22.0** and React >=19.2.7. That conflicts with the spec's `^20.19.0` engine and with "React Router 7". The v7 line is still maintained: 7.18.5 shipped 2026-10-27, the same day as 8.5.1. Install with `react-router@^7`, not `@latest`. | HIGH |
| Vite | `^8.3.5` | Dev server, `/api` proxy, build | Uses the Rolldown bundler. Engine `^20.19.0 \|\| >=22.12.0`. Proxy runs on `http-proxy-3`. | HIGH |
| MongoDB (Docker) | image `mongo:7.0` | Source of truth | Required by spec. Official lifecycle: 7.0 EOL **2027-08-31**, extended in 2025. Some third-party trackers still show 2026-08-31, which is out of date. | MEDIUM |
| Redis (Docker) | image `redis:7.4` (`redis:7` currently resolves to 7.4.12) | Stock counter + buyers set + Lua | AOF with `appendfsync everysec` was checked with `CONFIG GET`. Pin `7.4` so a re-pull can't move the version. | HIGH |

### Supporting Libraries

| Library | Version | Purpose | When / how to use | Conf. |
|---|---|---|---|---|
| jsonwebtoken | `^9.0.3` (+ `@types/jsonwebtoken ^9.0.10`) | Sign/verify JWT (7 days, `sub` + `role`) | **Default import only**: `import jwt from "jsonwebtoken"`. A named import such as `import { sign }` passes `tsc` but **crashes at runtime** (`Named export 'sign' not found`), because the package is CommonJS. Verified. | HIGH |
| bcryptjs | `^3.0.3` | Password hashing | v3 is ESM and **ships its own types**. Do **not** install `@types/bcryptjs` (3.0.0 is a stub). Use `import bcrypt from "bcryptjs"`, cost 10. | HIGH |
| cors | `^2.8.6` (+ `@types/cors ^2.8.19`) | CORS for `CLIENT_ORIGIN` | `cors({ origin: config.clientOrigin })`. In dev the Vite proxy makes calls same-origin, so this only matters for direct calls. | HIGH |
| dotenv | `^18.0.9` | Load `backend/.env` | `import "dotenv/config"` is **quiet by default** in 17+/18. A bare `dotenv.config()` prints an "injecting env" line unless `{ quiet: true }`. Accepts `path` arrays (first value wins unless `override`). | HIGH (README in tarball) |
| recharts | `^3.10.1` | V1 vs V2 chart (E2) + admin live chart | Peers accept React 19. `react-is` is a peer that npm 7+ installs automatically. Builds on Vite 8. Adds about 500 kB to the bundle, so lazy-load the chart page or raise `build.chunkSizeWarningLimit`. | HIGH |
| autocannon | `^8.0.0` (+ `@types/autocannon ^7.12.7`) | E2 throughput/latency | Latest is 8.0.0 (2024-10). CommonJS, so `import autocannon from "autocannon"` works in ESM. The types lag one major but cover `setupRequest`, `statusCodeStats`, and `p97_5`. **No `p95` in its histograms.** See the patterns section. | HIGH |
| mongodb (transitive) | 7.7.0 via Mongoose | Driver | Do not add it as a direct dependency. Use `mongoose.mongo` or `mongoose.connection` if you need driver types. Defaults: `maxPoolSize 100`, `serverSelectionTimeoutMS 30000`, `waitQueueTimeoutMS 0` (unbounded). | HIGH |

### Development Tools

| Tool | Version | Purpose | Notes |
|---|---|---|---|
| tsx | `^4.23.15` | `dev` (`tsx watch src/server.ts`) and running `backend/scripts/*.ts` (seed, reset, reconcile) and loadtest scripts | Strips types with esbuild and **does not type-check**. Spec rule: done means `typecheck` passes. |
| @types/node | `^24` | Node globals | Matches the runtime and the Vite template (`^24.19.2`). Must be listed in `"types": ["node"]` (see TS 6/7 defaults). |
| @types/express | `^5.0.6` | Express 5 types | Typing `listen` as `(error?: Error) => void` was verified. |
| @vitejs/plugin-react | `^6.2.1` | React fast refresh | Peer is `vite ^8`. Uses Oxc, no Babel by default. |
| oxlint (optional) | `^1.89` | Lint | What the Vite template ships. Skip ESLint with type information, because typescript-eslint cannot use the TS 7 API yet. |

---

## Installation

```bash
# backend/
npm install express@^5.3.0 mongoose@^9.11.4 ioredis@^6.0.0 jsonwebtoken@^9.0.3 bcryptjs@^3.0.3 cors@^2.8.6 dotenv@^18.0.9
npm install -D typescript@~7.0.2 tsx@^4.23.15 @types/node@^24 @types/express@^5.0.6 @types/jsonwebtoken@^9.0.10 @types/cors@^2.8.19

# frontend/  (start from `npm create vite@latest frontend -- --template react-ts`, then:)
npm install react-router@^7.18.5 recharts@^3.10.1        # NOT react-router@latest (= v8)

# loadtest/  (own package.json, "type": "module")
npm install autocannon@^8.0.0
npm install -D tsx@^4.23.15 typescript@~7.0.2 @types/node@^24 @types/autocannon@^7.12.7
```

Commit every `package-lock.json`. The start scripts use `npm ci`, which needs a lockfile.

---

## Prescriptive Configuration (verified)

### Backend `package.json` (ESM)

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
    "reconcile": "tsx scripts/reconcile.ts"
  }
}
```

- The `cpSync` copy step was run through npm on Windows, which uses `cmd.exe` as the script shell, and produced `dist/lua/buy.lua`. `node -e` runs as CommonJS, so `require` works even with `"type": "module"`. It works the same in bash on macOS. HIGH.
- `start:test` uses `node --env-file=.env.test` (available since Node 20.6). This avoids `NODE_ENV=test npm start`, which doesn't work on PowerShell. If `src/config` also does `import "dotenv/config"`, dotenv **does not override** variables that are already set. So `.env.test` wins and `.env` only fills gaps such as `JWT_SECRET`. MEDIUM: documented behaviour of both tools. The runtime test was blocked by the secret-file guard.

### Backend `tsconfig.json` / `tsconfig.build.json`

```jsonc
// tsconfig.json — typecheck everything (src + scripts), no emit
{
  "compilerOptions": {
    "target": "es2023",
    "lib": ["ES2023"],
    "module": "nodenext",            // implies moduleResolution nodenext
    "types": ["node"],               // REQUIRED on TS 6/7: default is now []
    "strict": true,
    "verbatimModuleSyntax": true,    // forces `import type` for type-only imports
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src", "scripts"]
}
// tsconfig.build.json — emit only src
{
  "extends": "./tsconfig.json",
  "compilerOptions": { "noEmit": false, "rootDir": "./src", "outDir": "./dist", "sourceMap": true },
  "include": ["src"]
}
```

Checked on TS 7.0.2:
- Leaving out `types: ["node"]` gives `TS2591 Cannot find name 'process'`.
- An import without `.js` gives `TS2835 ... Did you mean './a.js'?`.
- Set `rootDir` explicitly. In TS 6/7 it defaults to the tsconfig directory, which would emit `dist/src/server.js`.
- `strict` is now on by default, but keep it explicit.
- Don't enable `erasableSyntaxOnly` on the backend unless you also avoid constructor parameter properties and `enum`. Nothing requires it, because nothing uses Node's native type stripping.

### Frontend: keep the `create-vite` react-ts tsconfigs as generated

They use `moduleResolution: "bundler"`, `allowImportingTsExtensions`, `types: ["vite/client"]`, `noEmit`, and `build: "tsc -b && vite build"`. Add `"typecheck": "tsc -b"`.

### `vite.config.ts`

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true, // default is "try next port" — start scripts check 5173 specifically
    proxy: { "/api": { target: "http://localhost:5000", changeOrigin: true } },
  },
});
```

- No `rewrite` is needed, because the backend already serves under `/api`.
- `strictPort: true` matters. Without it, Vite quietly moves to 5174 when 5173 is taken, and the start script's port check and URL output would be wrong.
- On the backend, call `app.listen(PORT)` **without a host**. Node then binds dual-stack `::`, so `localhost` works whether it resolves to `::1` or `127.0.0.1`. MEDIUM.

### `docker-compose.yml` essentials

```yaml
services:
  mongo:
    image: mongo:7.0
    container_name: flashsale-mongo
    ports: ["127.0.0.1:27018:27017"]
    volumes: [mongo-data:/data/db]
    healthcheck: { test: ["CMD", "mongosh", "--quiet", "--eval", "db.adminCommand('ping')"], interval: 5s, timeout: 5s, retries: 20 }
  redis:
    image: redis:7.4
    container_name: flashsale-redis
    command: ["redis-server", "--appendonly", "yes", "--appendfsync", "everysec"]
    ports: ["127.0.0.1:6379:6379"]
    volumes: [redis-data:/data]
    healthcheck: { test: ["CMD", "redis-cli", "ping"], interval: 5s, timeout: 3s, retries: 20 }
volumes: { mongo-data: {}, redis-data: {} }
```

`docker compose up -d --wait` only waits for "healthy" if a `healthcheck` is defined. Without one it returns as soon as the containers are "running", and seed can race MongoDB startup. Always connect with `127.0.0.1`, never `localhost`: the ports are bound to IPv4 loopback only, and **27017 is the unrelated Windows MongoDB service**.

---

## Usage Patterns by Library

### Express 5 (verified at runtime on 5.3.0)

1. **Async errors are forwarded automatically.** `app.get(..., async () => { throw new HttpError(409, "...") })` reached the error middleware and returned 409. Don't use try/catch or an `asyncHandler` wrapper.
2. **`app.listen` callback receives the error.** Express 5 attaches `server.once('error', cb)`. With a naive `() => console.log("listening")` callback, an **EADDRINUSE still prints "listening" and the process stays alive**. Verified. Required pattern:
   ```ts
   app.listen(config.port, (err?: Error) => {
     if (err) { console.error(`Không mở được cổng ${config.port}: ${(err as NodeJS.ErrnoException).code}`); process.exit(1); }
     console.log(`API chạy tại http://localhost:${config.port}`);
   });
   ```
3. **Broken JSON:** `express.json()` raises an error with `type === "entity.parse.failed"` and `status 400`. Map it in the error handler to a Vietnamese 400 message. Verified.
4. **`req.body` is `undefined`, not `{}`,** when the request has no JSON content-type (body-parser 2). Verified. Read `req.body?.qty` and require `qty === 1`, a number. Verified: `{"qty":"1"}` arrives as the string `"1"`, and `{"qty":{"$gt":0}}` arrives as an object. Both must be rejected.
5. **`req.query` is a read-only getter.** Assigning it throws. The default query parser is now "simple": `?mode[$ne]=x` gives the key `"mode[$ne]"` and is **not** parsed into an object, but `?mode=v1&mode=v2` gives an **array**. Always check `typeof mode === "string"`.
6. **Route syntax (path-to-regexp 8):** wildcards must be named (`/*splat`) and optional segments use braces (`/:id{/:x}`). The backend needs neither. For the 404 fallback use a path-less `app.use((req, res) => ...)`.
7. Error middleware signature: `const onError: ErrorRequestHandler = (err, req, res, _next) => { ... }`, registered last. Map `CastError` → 400, `ValidationError` → 400, `err.code === 11000` → 409, `HttpError` → its status, everything else → 500 with no details.

### Mongoose 9 (verified against 9.11.4 source + `tsc`)

1. **V1 atomic decrement:** use `returnDocument`, not `new`:
   ```ts
   const sale = await FlashSale.findOneAndUpdate(
     { _id: saleId, remainingQty: { $gte: qty } },
     { $inc: { remainingQty: -qty } },
     { returnDocument: "after", projection: { remainingQty: 1 } },
   ).lean();
   if (!sale) throw new HttpError(409, "Hết hàng");
   ```
   `new: true` and `returnOriginal` still work but call `utils.warn` → `process.emitWarning` **on every call**. That would write to stderr on every V1 purchase, which breaks the "no logging in the buy path" rule and skews the measurement. The default is `returnDocument: "before"`.
2. **Explicit collection names:** the default pluralizer lower-cases and pluralizes, giving `flashsales` and `stockmovements`. Pass `{ collection: "flash_sales" }` and `{ collection: "stock_movements" }` in the schema options. Verified: `FlashSale.collection.collectionName === "flash_sales"`.
3. **Explicit pool and fail-fast connect:**
   ```ts
   await mongoose.connect(config.mongoUri, { maxPoolSize: config.mongoMaxPool, serverSelectionTimeoutMS: 5000 });
   ```
   The driver default `maxPoolSize` is 100 and `serverSelectionTimeoutMS` is 30 s. Without the shorter timeout, a down MongoDB hangs startup for 30 s. Read the pool size from an env var such as `MONGO_MAX_POOL_SIZE` (default 100), use the same value for V1 and V2, and write it into the E2 CSV. `waitQueueTimeoutMS` defaults to 0 (wait forever), so at 500 connections, time spent waiting for the pool is part of the measured latency. Note this in the report.
4. **Indexes before load:** seed drops the database, so in seed/reset run `await Promise.all([User, Product, FlashSale, Order, StockMovement].map(m => m.syncIndexes()))` and wait for it. The unique `(saleId, userId)` index must exist before E1/E3. Otherwise autoIndex builds it in the background while the first requests are already running.
5. **`remainingQty` with no `min`:** schema validators don't run on `$inc` updates anyway, but the spec rule still holds. Don't add `min: 0`.
6. **Type changes in 9:** `FilterQuery` was renamed to `QueryFilter`. `create()` no longer takes a generic. `doc.id` is typed `string`. Pre-middleware no longer receives `next`, so use `async` hooks. Update pipelines throw unless `{ updatePipeline: true }`.
7. Use `.lean()` on every hot-path read. Use `Types.ObjectId.isValid()` for the `x-test-user` format check. In 9 it returns `false` for numbers, which is fine because inputs are strings. Optionally `mongoose.set("sanitizeFilter", true)` for defense in depth. It does not replace the "every input must be a string" rule.

### ioredis 6 (verified against Redis 7.4.12)

1. **Import:** `import { Redis } from "ioredis"`. The README says the default import "will be deprecated in the next major". The named import works at runtime under ESM.
2. **Protocol:** v6 sends `HELLO 3` and negotiated **RESP3** with Redis 7.4 (`CLIENT INFO` → `resp=3`). `replyMapping` defaults to `"legacy"`, so reply shapes are the same as v5. Lua integer replies come back as JS `number` (verified: `typeof === "number"`, values 1/0/-1/-2). Don't set `replyMapping: "resp3"`. `protocol: 2` isn't needed.
3. **Lua via `defineCommand` + TS typing** (type-checks on TS 7.0.2):
   ```ts
   import { readFileSync } from "node:fs";
   import { Redis } from "ioredis";
   import type { Result, ClientContext } from "ioredis";

   declare module "ioredis" {
     interface RedisCommander<Context extends ClientContext = { type: "default" }> {
       buyStock(stockKey: string, buyersKey: string, userId: string, qty: number): Result<number, Context>;
     }
   }
   redis.defineCommand("buyStock", {
     numberOfKeys: 2,
     lua: readFileSync(new URL("../lua/buy.lua", import.meta.url), "utf8"),
   });
   // const code = await redis.buyStock(`stock:${saleId}`, `buyers:${saleId}`, userId, 1);
   ```
   ioredis uses `EVALSHA` and falls back to `EVAL` automatically after `NOSCRIPT`, for example after a Redis restart. `readFileSync(new URL(...))` worked under a path with Vietnamese characters and spaces. `readFileSync(url.pathname)` failed with `ENOENT` (verified). Name the command something other than an existing Redis command; `buyStock` is safe.
4. **`multi().exec()` resolves even when a command fails.** It returns `[Error | null, result][] | null`. Verified: a `WRONGTYPE` inside `multi` did not reject. The refund and reset code must check every entry:
   ```ts
   const res = await redis.multi().incrby(stockKey, qty).srem(buyersKey, userId).exec();
   if (!res) throw new Error("multi bị hủy");
   for (const [err] of res) if (err) throw err;
   ```
5. **Fail fast at startup but keep reconnecting at runtime:** `new Redis(config.redisUrl, { maxRetriesPerRequest: 1 })`, then `await redis.ping()` at startup, and `process.exit(1)` with a Vietnamese message if it rejects. With Redis down, the ping rejected after about 180 ms (verified). Always attach `redis.on("error", ...)`, otherwise ioredis prints "Unhandled error event" repeatedly. Don't use `retryStrategy: () => null`: it does fail fast, but it also kills the client permanently after any blip.
6. Standalone only. Key names `stock:<id>` and `buyers:<id>` have no `{}` hash tags, as the spec requires.

### TypeScript ESM with NodeNext (verified)

- Relative imports must end in `.js` even though the source file is `.ts` (`import { HttpError } from "./utils/http-error.js"`). `tsc` enforces this (TS2835). tsx does not, so run `typecheck` before calling anything done.
- With `verbatimModuleSyntax`, type-only imports must use `import type { ... }` or inline `type` (`import express, { type ErrorRequestHandler } from "express"`).
- CommonJS dependencies: default-import `jsonwebtoken`, `cors`, `autocannon`, and `express`. Named imports from `mongoose` (`Schema`, `model`, `Types`) and `ioredis` (`Redis`) work at runtime (verified). **`tsc` does not catch a broken named import from a CJS package**, so smoke-run `npm run build && npm start` once per phase.
- `tsc` does not copy non-TS assets. The build script copies `src/lua` to `dist/lua`, and the relative `new URL("../lua/buy.lua", import.meta.url)` then resolves the same way from `src/services/` under tsx and from `dist/services/` under node.

### Vite 8

- Engine `^20.19.0 || >=22.12.0` (registry). Proxy config is unchanged in shape from earlier versions and runs on `http-proxy-3`.
- `build.rollupOptions` is now `build.rolldownOptions`. Only relevant if you tune chunking, for example to split out Recharts.
- `vite` and `tsx` do not type-check. Frontend `build` = `tsc -b && vite build`.

### React Router 7: declarative ("library") mode (verified build)

```tsx
import { BrowserRouter, Routes, Route, Link, useParams, useNavigate } from "react-router";
<BrowserRouter>
  <Routes>
    <Route path="/" element={<HomePage />} />
    <Route path="/sales/:id" element={<SalePage />} />
    <Route path="/login" element={<LoginPage />} />
    <Route path="/orders" element={<OrdersPage />} />
    <Route path="/admin" element={<AdminPage />} />
    <Route path="*" element={<NotFound />} />
  </Routes>
</BrowserRouter>
```

- Import from `"react-router"`. In v7, `react-router-dom` is only a re-export shim.
- Don't use framework mode (`@react-router/dev` Vite plugin, route modules, SSR). It replaces the plain Vite SPA setup and adds a lot of concepts without helping this project.
- Data mode (`createBrowserRouter` + loaders) is optional. Polling every 1–2 s fits better in a `useEffect` + `setInterval` + `AbortController` loop than in loaders.
- Use `fetch(..., { cache: "no-store" })` for polling endpoints. This is defensive: it skips browser HTTP-cache revalidation (Express sends weak ETags), so every poll is a fresh read.

### autocannon 8 (verified locally against a counting HTTP server)

1. **User distribution:** a static `requests` array of different users makes each connection loop from index 0. This reproduced the earlier finding exactly: 4 connections × 12 requests gave **3 distinct users**. A single request entry whose `setupRequest` reads a **shared closure counter** gave **1000 sent / 1000 distinct** with 100 connections. `setupRequest` runs on every request when it is defined (`RequestIterator.nextRequest → rebuildRequest`). Return a new object instead of mutating the shared one:
   ```ts
   let next = 0;
   requests: [{ method: "POST", path: `/api/sales/${saleId}/buy?mode=${mode}`,
     setupRequest: (req) => ({ ...req, headers: { ...req.headers, "content-type": "application/json", "x-test-user": userIds[next++ % userIds.length]! }, body: '{"qty":1}' }) }]
   ```
2. **Don't use `workers`.** Functions must be file paths, each worker gets its own counter (duplicate users), and "overall" limits are applied per worker (README).
3. **No p95.** The histograms expose `p50, p75, p90, p97_5, p99, ...`. To report p95 as SPECS section 10 requires, collect `responseTime` yourself from the instance `response` event and compute p95. Use the **callback form**, because `@types/autocannon` types the promise form as a bare `Promise` with no `.on`:
   ```ts
   const latencies: number[] = [];
   const result = await new Promise<autocannon.Result>((resolve, reject) => {
     const inst = autocannon(opts, (err, res) => (err ? reject(err) : resolve(res)));
     inst.on("response", (_client, _status, _bytes, responseTime) => latencies.push(responseTime));
   });
   ```
4. **Counting:** use `result.statusCodeStats` (`{"201":{count}, "409":{count}, ...}`) for 201/409/5xx, and `result.errors` / `result.timeouts` for connection errors. Don't use `non2xx` as the error rate, because it includes every 409.
5. Run autocannon in its own process (loadtest script). Never run it inside the API process.

---

## Alternatives Considered

| Recommended | Alternative | When to use the alternative |
|---|---|---|
| TypeScript `~7.0.2` | `typescript@~6.0.3` (or the official alias setup `"typescript": "npm:@typescript/typescript6@^6.0.2"` plus `"@typescript/native": "npm:typescript@^7.0.2"`) | Only if a tool needs the TS compiler API (typescript-eslint with type info, ts-morph). TS 7.0 has no stable programmatic API until 7.1. Defaults and deprecations are the same as 7, so the tsconfigs above work on both. |
| React Router `^7.18.5` | React Router 8.x | Only if the spec's Node floor is raised to `>=22.22.0`. It isn't. |
| `node --env-file=.env.test` for `start:test` | `dotenv.config({ path: [".env.test", ".env"], quiet: true })` selected by a CLI flag | If you want a single loading mechanism. More code, same result. |
| autocannon for E2 | Separate Node `fetch` + `Promise.all` script (spec choice for E1/E3) | E1/E3 need a controlled one-request-per-user burst and full response capture. autocannon is for sustained throughput. |
| bcryptjs (pure JS) | `bcrypt` (native) | Never here. It needs node-gyp/prebuilt binaries on Windows, and login isn't on the measured path. |
| Recharts 3 | Chart.js / visx | Not needed. Recharts is the spec's example and builds cleanly. |

## What NOT to Use

| Avoid | Why | Use instead |
|---|---|---|
| `npm i react-router` (no range) / `react-router@latest` | Installs 8.5.1, which needs Node >=22.22 and breaks the spec's engine | `react-router@^7.18.5` |
| `react-router-dom`, framework mode, `@react-router/dev` | Redundant shim / SSR framework overhead | `react-router` declarative mode |
| `findOneAndUpdate(..., { new: true })` | Deprecated in Mongoose 9.2+, and `process.emitWarning` on **every** call logs inside the buy path | `{ returnDocument: "after" }` |
| `import { sign, verify } from "jsonwebtoken"` | Passes `tsc`, crashes at runtime under ESM | `import jwt from "jsonwebtoken"` |
| `@types/bcryptjs` | bcryptjs 3 bundles its own types | nothing |
| `readFileSync(new URL(...).pathname)` / `__dirname` | ENOENT on the Vietnamese/space path. `__dirname` doesn't exist in ESM | `readFileSync(new URL("../lua/buy.lua", import.meta.url), "utf8")` |
| `retryStrategy: () => null` on the main Redis client | Permanently dead client after one network blip | `maxRetriesPerRequest: 1` + startup `ping()` |
| Ignoring the `exec()` result of `multi()` | Per-command errors are returned, not thrown | Iterate `[err, res]` pairs |
| autocannon `requests` array of different users / `workers` | Wrong user distribution (3 users from 12 requests) | Single request + `setupRequest` with a shared counter |
| autocannon `non2xx` as "error rate" | Counts every 409 sold-out response | `statusCodeStats` 5xx + `errors` + `timeouts` |
| `mongodb://localhost:27017/...` | Hits the pre-installed Windows MongoDB service, wrong data, no error | `mongodb://127.0.0.1:27018/flashsale` |
| MongoDB transactions in V1 | Standalone `mongod` has no replica set, so transactions error. Out of scope by spec | `$inc` refund on order failure |
| `NODE_ENV=test npm start` in scripts | Doesn't work on PowerShell | `npm run start:test` → `node --env-file=.env.test ...` |
| Measuring on `npm run dev` (tsx watch) | Transpile-on-load + watcher overhead | `npm run start:test` (compiled JS) |

## Stack Patterns by Variant

**If E2 needs more than 1,000 users:** generate ObjectIds in the loadtest script (`new Types.ObjectId().toHexString()` or 24 hex characters) for `x-test-user`. The server only checks the format, by spec.

**If p95 must match autocannon's own numbers exactly:** report `p90` and `p97_5` from autocannon next to the self-computed p95, and state the method in the CSV header.

**If someone adds ESLint with type-aware rules later:** switch to the TS 6 alias setup from the official TS 7 announcement. Don't downgrade the tsconfig.

## Version Compatibility

| Package | Compatible with | Notes |
|---|---|---|
| mongoose@9.11.4 | mongodb driver ~7.7 (bundled), Node >=20.19.0, MongoDB server 7.0 | Driver 7 supports 7.0 servers. |
| ioredis@6.0.0 | Node >=20, Redis 7.4 (RESP3 via HELLO 3) | Verified live against 7.4.12. |
| express@5.3.0 | @types/express@5.0.6, Node >=18 | Listen error callback typed and working. |
| vite@8.3.5 | @vitejs/plugin-react@6.2.1 (peer vite ^8), Node ^20.19 \|\| >=22.12 | Vite also lists `tsx ^4.8.1` and `@types/node ^20.19 \|\| >=22.12` as optional peers. |
| react-router@7.18.5 | React >=18 (19.3.1 OK), Node >=20.0.0 | v8 needs Node >=22.22 and React >=19.2.7. |
| recharts@3.10.1 | React 16.8–19, react-is 19.3.1 (auto-installed peer) | Verified Vite 8 build. |
| typescript@7.0.2 | Vite template, tsx (independent, esbuild), Node 24 | No compiler API, so typescript-eslint can't use it. |
| autocannon@8.0.0 | @types/autocannon@7.12.7 | Types lag a major but cover the APIs we use (checked). |
| dotenv@18.0.9 | Node >=12 | `dotenv/config` is quiet by default. Supports `path` arrays. |

## Sources

Primary sources, verified in this session:
- npm registry (`npm view` versions, dist-tags, engines, peerDependencies, publish times) for express, mongoose, mongodb, ioredis, jsonwebtoken, bcryptjs, cors, dotenv, tsx, typescript, react, react-router(-dom), vite, @vitejs/plugin-react, recharts, autocannon, @types/*. HIGH.
- Package tarballs inspected: `express@5.3.0 lib/application.js` (`app.listen` → `server.once('error', done)`), `mongoose@9.11.4 lib/query.js` (`convertNewToReturnDocument` → `utils.warn` → `process.emitWarning`), `ioredis@6.0.0` README + `built/*.d.ts` (`defineCommand`, `RedisCommander`, `exec()` typing), `autocannon@8.0.0` README + `lib/requestIterator.js`, `dotenv@18.0.9` README, `create-vite@9.3.3` template-react-ts. HIGH.
- Local runs in the scratchpad: TS 7.0.2 typecheck/build of the backend patterns, runtime Express 5 probes (async throw → 409, bad JSON → 400, EADDRINUSE in the callback, `req.body`/`req.query` behaviour), ioredis 6 + Lua against `redis:7` (7.4.12, AOF everysec), autocannon distribution test, Vite 8 + React Router 7 + Recharts build, ESM named-import interop. HIGH.

Web sources (seam tier LOW, used for MEDIUM claims where official):
- [Upgrading ioredis v5 → v6 (wiki)](https://github.com/redis/ioredis/wiki/Upgrading-from-v5-to-v6): HELLO 3, replyMapping, Node 20.
- [Mongoose: Migrating to 9](https://mongoosejs.com/docs/migrating_to_9.html): `returnDocument`, `QueryFilter`, middleware `next()` removal, update pipelines. Cross-checked with source.
- [Announcing TypeScript 6.0](https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/): `types: []`, `rootDir`, `strict` defaults, deprecations. `types`/extension behaviour reproduced locally.
- [Announcing TypeScript 7.0](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/): release 2026-07-08, no programmatic API, TS 6 alias setup.
- [Vite server options](https://vite.dev/config/server-options): `server.proxy` on `http-proxy-3`, `strictPort`.
- [React Router: Picking a mode](https://reactrouter.com/start/modes): declarative / data / framework (doc is v8, API identical for declarative mode in v7).
- [MongoDB lifecycle schedules](https://www.mongodb.com/legal/support-policy/lifecycles) and [Longer lifecycles for MongoDB 7.0 and 8.0](https://www.mongodb.com/products/updates/longer-lifecycles-for-mongodb-7-0-and-8-0/): 7.0 EOL 2027-08-31. MEDIUM.
- Secondary (LOW, context only): [Visual Studio Magazine on TS 6.0](https://visualstudiomagazine.com/Articles/2026/03/23/TypeScript-6-0-Ships-as-Final-JavaScript-Based-Release-Clears-Path-for-Go-Native-7-0.aspx), [endoflife.ai MongoDB 7.0](https://endoflife.ai/mongodb/7.0) (outdated EOL date, ignored).

---
*Stack research for: flash-sale oversell prevention (Redis + MongoDB), course project*
*Researched: 2026-11-03*
