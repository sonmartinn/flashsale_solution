<!-- GSD:project-start source:PROJECT.md -->

## Project

**Flash Sale chống bán quá số lượng (Redis + MongoDB)**

Đồ án môn Cơ sở dữ liệu phi quan hệ với đề tài: **Nghiên cứu Redis và MongoDB trong xây dựng hệ thống flash sale chống bán quá số lượng, ứng dụng cho shop thời trang**. Sản phẩm là một ứng dụng web flash sale (Express 5 + React 19). API mua hàng có 3 cách xử lý tồn kho: V0 ngây thơ, V1 dùng MongoDB nguyên tử, V2 dùng Redis + Lua. Kèm theo là bộ script bắn tải để chứng minh bằng số liệu rằng V0 bán quá còn V1, V2 không bao giờ bán quá, và để so sánh hiệu năng V1 với V2. Người dùng là nhóm sinh viên làm đồ án và giảng viên chấm (demo + báo cáo).

Nguồn yêu cầu duy nhất là `docs/SPECS.md`. Dự án **làm lại từ đầu** theo file này. Mã cũ ở commit `40dea55` không được khôi phục.

**Core Value:** Dưới tải đồng thời, V1 và V2 **luôn** cho đúng `totalQty` đơn thành công, mỗi người tối đa 1 đơn, còn V0 bán quá. Điều này phải được chứng minh lặp lại bằng thí nghiệm E1 có số liệu.

### Constraints

- **Timeline**: Mã nguồn đóng băng ngày **6/12/2026**. Báo cáo dự kiến 21–27/12/2026, chưa có lịch chính thức.
- **Ưu tiên**: Không được cắt V0, V1, V2, E1, E2. Khi thiếu thời gian thì cắt theo thứ tự: E4 → biểu đồ trực tiếp trên web → trang theo dõi (giữ API stats) → polling tự động (thay bằng nút làm mới).
- **Tech stack**: TypeScript `strict` cả hai phía. Node `>=20.19.0` (frontend `^20.19.0 || >=22.12.0`). Express 5, Mongoose 9, ioredis 6, jsonwebtoken, bcryptjs, cors, dotenv. React 19, React Router 7, Vite 8, Recharts. autocannon. MongoDB 7, Redis 7.
- **Quy ước mã**: Backend dùng ESM NodeNext, import ghi đuôi `.js`. Express 5 tự bắt lỗi async, không bọc try/catch. Lỗi nghiệp vụ ném `HttpError(status, message)`. Thông báo lỗi và chú thích bằng tiếng Việt.
- **Định nghĩa xong**: `tsx` và Vite không kiểm tra kiểu, nên một việc chỉ coi là xong khi `typecheck` đạt (và `build` đạt).
- **Đo lường**: Đo trên `npm run start:test` (JS đã biên dịch), không đo trên `dev`. Reset trước mỗi lần đo. `maxPoolSize` đặt tường minh. Không ghi log trong đường mua. Số đơn vượt tính bằng `số đơn - totalQty`. Tỷ lệ lỗi chỉ tính 5xx và lỗi kết nối.
- **Build**: Bước build phải chép `src/lua/` sang `dist/lua/`.
- **Bảo mật**: `JWT_SECRET` không có giá trị mặc định. Mọi trường đầu vào phải là chuỗi (chặn NoSQL injection). Client không được tự đặt `role`. Compose chỉ bind 127.0.0.1 vì không có mật khẩu.
- **Script dev**: `.ps1` chạy trên PowerShell 5.1 (không `&&`, `||`, `??`, toán tử ba ngôi), lưu UTF-8 có BOM. `.sh` dùng bash 3.2, `set -euo pipefail`. `.gitattributes` đặt LF cho `.sh`, CRLF cho `.ps1`. Không tự cài phần mềm, không tự kill tiến trình lạ, không `docker compose down -v`.
- **Git**: Không thêm dòng `Co-Authored-By` vào commit.

<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->

## Technology Stack

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

## Installation

# backend/

# frontend/  (start from `npm create vite@latest frontend -- --template react-ts`, then:)

# loadtest/  (own package.json, "type": "module")

## Prescriptive Configuration (verified)

### Backend `package.json` (ESM)

- The `cpSync` copy step was run through npm on Windows, which uses `cmd.exe` as the script shell, and produced `dist/lua/buy.lua`. `node -e` runs as CommonJS, so `require` works even with `"type": "module"`. It works the same in bash on macOS. HIGH.
- `start:test` uses `node --env-file=.env.test` (available since Node 20.6). This avoids `NODE_ENV=test npm start`, which doesn't work on PowerShell. If `src/config` also does `import "dotenv/config"`, dotenv **does not override** variables that are already set. So `.env.test` wins and `.env` only fills gaps such as `JWT_SECRET`. MEDIUM: documented behaviour of both tools. The runtime test was blocked by the secret-file guard.

### Backend `tsconfig.json` / `tsconfig.build.json`

- Leaving out `types: ["node"]` gives `TS2591 Cannot find name 'process'`.
- An import without `.js` gives `TS2835 ... Did you mean './a.js'?`.
- Set `rootDir` explicitly. In TS 6/7 it defaults to the tsconfig directory, which would emit `dist/src/server.js`.
- `strict` is now on by default, but keep it explicit.
- Don't enable `erasableSyntaxOnly` on the backend unless you also avoid constructor parameter properties and `enum`. Nothing requires it, because nothing uses Node's native type stripping.

### Frontend: keep the `create-vite` react-ts tsconfigs as generated

### `vite.config.ts`

- No `rewrite` is needed, because the backend already serves under `/api`.
- `strictPort: true` matters. Without it, Vite quietly moves to 5174 when 5173 is taken, and the start script's port check and URL output would be wrong.
- On the backend, call `app.listen(PORT)` **without a host**. Node then binds dual-stack `::`, so `localhost` works whether it resolves to `::1` or `127.0.0.1`. MEDIUM.

### `docker-compose.yml` essentials

## Usage Patterns by Library

### Express 5 (verified at runtime on 5.3.0)

### Mongoose 9 (verified against 9.11.4 source + `tsc`)

### ioredis 6 (verified against Redis 7.4.12)

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

- Import from `"react-router"`. In v7, `react-router-dom` is only a re-export shim.
- Don't use framework mode (`@react-router/dev` Vite plugin, route modules, SSR). It replaces the plain Vite SPA setup and adds a lot of concepts without helping this project.
- Data mode (`createBrowserRouter` + loaders) is optional. Polling every 1–2 s fits better in a `useEffect` + `setInterval` + `AbortController` loop than in loaders.
- Use `fetch(..., { cache: "no-store" })` for polling endpoints. This is defensive: it skips browser HTTP-cache revalidation (Express sends weak ETags), so every poll is a fresh read.

### autocannon 8 (verified locally against a counting HTTP server)

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

- npm registry (`npm view` versions, dist-tags, engines, peerDependencies, publish times) for express, mongoose, mongodb, ioredis, jsonwebtoken, bcryptjs, cors, dotenv, tsx, typescript, react, react-router(-dom), vite, @vitejs/plugin-react, recharts, autocannon, @types/*. HIGH.
- Package tarballs inspected: `express@5.3.0 lib/application.js` (`app.listen` → `server.once('error', done)`), `mongoose@9.11.4 lib/query.js` (`convertNewToReturnDocument` → `utils.warn` → `process.emitWarning`), `ioredis@6.0.0` README + `built/*.d.ts` (`defineCommand`, `RedisCommander`, `exec()` typing), `autocannon@8.0.0` README + `lib/requestIterator.js`, `dotenv@18.0.9` README, `create-vite@9.3.3` template-react-ts. HIGH.
- Local runs in the scratchpad: TS 7.0.2 typecheck/build of the backend patterns, runtime Express 5 probes (async throw → 409, bad JSON → 400, EADDRINUSE in the callback, `req.body`/`req.query` behaviour), ioredis 6 + Lua against `redis:7` (7.4.12, AOF everysec), autocannon distribution test, Vite 8 + React Router 7 + Recharts build, ESM named-import interop. HIGH.
- [Upgrading ioredis v5 → v6 (wiki)](https://github.com/redis/ioredis/wiki/Upgrading-from-v5-to-v6): HELLO 3, replyMapping, Node 20.
- [Mongoose: Migrating to 9](https://mongoosejs.com/docs/migrating_to_9.html): `returnDocument`, `QueryFilter`, middleware `next()` removal, update pipelines. Cross-checked with source.
- [Announcing TypeScript 6.0](https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/): `types: []`, `rootDir`, `strict` defaults, deprecations. `types`/extension behaviour reproduced locally.
- [Announcing TypeScript 7.0](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/): release 2026-07-08, no programmatic API, TS 6 alias setup.
- [Vite server options](https://vite.dev/config/server-options): `server.proxy` on `http-proxy-3`, `strictPort`.
- [React Router: Picking a mode](https://reactrouter.com/start/modes): declarative / data / framework (doc is v8, API identical for declarative mode in v7).
- [MongoDB lifecycle schedules](https://www.mongodb.com/legal/support-policy/lifecycles) and [Longer lifecycles for MongoDB 7.0 and 8.0](https://www.mongodb.com/products/updates/longer-lifecycles-for-mongodb-7-0-and-8-0/): 7.0 EOL 2027-08-31. MEDIUM.
- Secondary (LOW, context only): [Visual Studio Magazine on TS 6.0](https://visualstudiomagazine.com/Articles/2026/03/23/TypeScript-6-0-Ships-as-Final-JavaScript-Based-Release-Clears-Path-for-Go-Native-7-0.aspx), [endoflife.ai MongoDB 7.0](https://endoflife.ai/mongodb/7.0) (outdated EOL date, ignored).

<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->

## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->

## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->

## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-fast` for a trivial task inline, with no subagents and no PLAN.md
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->

## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->

## Cài GSD cho thành viên nhóm

Cả nhóm dùng chung GSD **phiên bản 1.20.0**. Kế hoạch (`.planning/`) và file này nằm trên git; bộ cài GSD thì không, vì nó ghi cứng đường dẫn tuyệt đối của từng máy.

Sau khi clone, chạy một lần ở thư mục gốc dự án:

```
npx -y @opengsd/gsd-core@1.20.0 --claude --local --profile=full
```

- Không nâng cấp GSD riêng lẻ. Khi cả nhóm thống nhất nâng cấp thì sửa số phiên bản ở đây trong cùng một commit.
- `.claude/settings.local.json` (hooks, quyền) do bộ cài tạo và là thiết lập riêng của từng máy, không đưa lên git.
- Không thêm dòng `Co-Authored-By` vào commit.
