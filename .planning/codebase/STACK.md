---
last_mapped_commit: 2c310436edd3b718349e11b11f80e93f3bb3b0b9
last_mapped_at: 2026-11-11
---
# Technology Stack

**Analysis Date:** 2026-11-11

## Languages

**Primary:**
- TypeScript `~7.0.2`, khóa ở `7.0.2`: API, CLI quản trị và kiểm thử trong `backend/`; bộ thí nghiệm trong `loadtest/`. Xem `backend/package.json`, `loadtest/package.json` và hai lockfile tương ứng.
- Dùng `strict: true`, `verbatimModuleSyntax: true`, đích ES2023 và ESM NodeNext; import tương đối ghi đuôi `.js` theo `backend/tsconfig.json` và `loadtest/tsconfig.json`.

**Secondary:**
- Lua chạy trong Redis: thao tác mua V2 nguyên tử tại `backend/src/lua/buy.lua`.
- JavaScript là đầu ra biên dịch backend; điểm chạy là `dist/server.js` theo `backend/package.json`.
- YAML cho hạ tầng tại `docker-compose.yml`; JSON cho cấu hình compiler tại `backend/tsconfig.json`, `backend/tsconfig.build.json`, `loadtest/tsconfig.json`.

## Runtime

**Environment:**
- Node.js `>=20.19.0` được khai báo trong `backend/package.json` và `loadtest/package.json`; không đo phiên bản runtime đang cài trong lần mapping này.
- Backend chạy trực tiếp trên máy; Compose chỉ cung cấp MongoDB và Redis, theo `docker-compose.yml` và `docs/SPECS.md`.

**Package Manager:**
- npm; không phát hiện ghim phiên bản npm trong `backend/package.json` hoặc `loadtest/package.json`.
- Lockfile: có `backend/package-lock.json` và `loadtest/package-lock.json`, đều dùng `lockfileVersion: 3`.
- Hai package độc lập; không có manifest hoặc workspace npm ở thư mục gốc trong danh sách file git.

## Frameworks

**Core:**
- Express `^5.3.0`, khóa `5.3.0`: REST API tại `backend/src/app.ts` và `backend/src/routes/index.ts`.
- Mongoose `^9.11.4`, khóa `9.11.4`: schema và truy cập MongoDB tại `backend/src/models/` và `backend/src/config/db.ts`.
- Frontend React 19, React Router 7, Vite 8 và biểu đồ React là yêu cầu tại `docs/SPECS.md`; chưa có mã hoặc manifest frontend được git theo dõi. Không coi các công nghệ này là dependency đã triển khai.

**Testing:**
- Runner tích hợp `node:test`, assertion `node:assert/strict`, nạp TypeScript qua `node --import tsx --test`; xem `backend/package.json`, `backend/test/helpers.ts`, `loadtest/package.json`, `loadtest/test/classify.test.ts`.
- Kiểm thử integration backend chạy tuần tự bằng `--test-concurrency=1` tại `backend/package.json`.
- autocannon `^8.0.0`, khóa `8.0.0`: tải HTTP E2 trong `loadtest/lib/autocannon-phase.ts`; E1/E3 dùng HTTP Node tại `loadtest/lib/http.ts`.

**Build/Dev:**
- tsx `^4.23.15`, khóa `4.23.15`: watch server, CLI và kịch bản thí nghiệm theo `backend/package.json`, `loadtest/package.json`.
- TypeScript compiler phát backend theo `backend/tsconfig.build.json`; build xóa đầu ra rồi chép `backend/src/lua/` sang `dist/lua/` theo `backend/package.json`.
- Chạy riêng `npm run typecheck`: tsx không kiểm tra kiểu. Quy tắc hoàn thành gồm typecheck và build tại `AGENTS.md`.
- Docker Compose: hai dịch vụ MongoDB `mongo:7.0`, Redis `redis:7.4`, healthcheck và named volume tại `docker-compose.yml`.

## Key Dependencies

**Critical:**
- ioredis `^6.0.0`, khóa `6.0.0`: client Redis, `defineCommand` Lua, `multi()` và tồn kho V2; `backend/src/config/redis.ts`, `backend/src/services/lua.ts`, `backend/src/services/purchase.service.ts`.
- jsonwebtoken `^9.0.3`, khóa `9.0.3`: ký/xác minh JWT HS256; `backend/src/services/auth.service.ts`, `backend/src/middlewares/auth.ts`.
- bcryptjs `^3.0.3`, khóa `3.0.3`: băm mật khẩu cost 10, không dùng native bcrypt; `backend/src/services/auth.service.ts`.
- autocannon `^8.0.0`: throughput và latency; `loadtest/package.json`, `loadtest/lib/autocannon-phase.ts`.

**Infrastructure:**
- dotenv `^18.0.9`, khóa `18.0.9`: `dotenv/config` và lệnh CLI `dotenv run`; `backend/src/config/env.ts`, `backend/package.json`, `backend/package-lock.json`.
- cors `^2.8.6`, khóa `2.8.6`: origin cấu hình tường minh tại `backend/src/app.ts`.
- `@types/node ^24.19.2`, các gói kiểu Express/CORS/JWT/autocannon: khai báo trong `backend/package.json` và `loadtest/package.json`.
- Node built-ins cung cấp fetch, filesystem, child process và test runner; `loadtest/lib/http.ts`, `loadtest/lib/csv.ts`, `loadtest/lib/reconcile.ts`, `backend/test/helpers.ts`.

## Configuration

**Environment:**
- Cấu hình backend tập trung ở `backend/src/config/env.ts`: `MONGODB_URI`, `REDIS_URL`, `JWT_SECRET`, `PORT`, `CLIENT_ORIGIN`, `MONGO_MAX_POOL_SIZE`, `NODE_ENV`.
- Chỉ giá trị thô `NODE_ENV === "test"` bật danh tính `x-test-user`; dùng cùng quyết định cho health và middleware tại `backend/src/config/env.ts`, `backend/src/middlewares/auth.ts`.
- `start:test` thực tế là `npm run build && dotenv run -q --override -f .env.test -- node dist/server.js` tại `backend/package.json`; dùng manifest này khi hướng dẫn khác lệch nhau.
- Các file cấu hình môi trường không được đọc trong mapping. Không suy luận giá trị bí mật từ tên file; quy tắc bảo vệ nằm ở `AGENTS.md`.
- CLI tải dùng argv và `LOADTEST_BASE_URL`, `LOADTEST_ADMIN_EMAIL`, `LOADTEST_ADMIN_PASSWORD` tại `loadtest/lib/config.ts`.

**Build:**
- `backend/tsconfig.json`: kiểm tra cả `src`, `scripts`, `test`.
- `backend/tsconfig.build.json`: chỉ phát `src`, `rootDir: ./src`, `outDir: ./dist`, có source map.
- `loadtest/tsconfig.json`: `noEmit`, kiểm tra `lib`, `scenarios`, `test`; các kịch bản chạy trực tiếp qua tsx theo `loadtest/package.json`.
- Chưa phát hiện cấu hình lint/format hoặc pipeline CI trong tập file git; các lệnh hiện hành nằm ở `backend/package.json` và `loadtest/package.json`.

## Platform Requirements

**Development:**
- Node theo engine khai báo, npm và Docker Compose cho hai database; `backend/package.json`, `loadtest/package.json`, `docker-compose.yml`.
- MongoDB dự án dùng `127.0.0.1:27018`; không dùng cổng Windows MongoDB 27017; kiểm tra tại `backend/src/config/env.ts` và ánh xạ tại `docker-compose.yml`.
- Tôn trọng đường dẫn có dấu/khoảng trắng: dùng URL/fileURLToPath và spawn mảng argv tại `backend/src/services/lua.ts`, `loadtest/lib/reconcile.ts`.
- Quy tắc script nền tảng: PowerShell 5.1, UTF-8 BOM; bash 3.2 và `set -euo pipefail` tại `AGENTS.md`. Chưa có script dev tương ứng được git theo dõi.

**Production:**
- Chưa phát hiện hosting production hoặc container ứng dụng; cấu hình triển khai hiện có là local Compose tại `docker-compose.yml` và chạy Node build tại `backend/package.json`.
- Đo chỉ trên backend đã build bằng `start:test`; lượt chính thức chỉ trên máy người dùng theo `AGENTS.md` và `loadtest/README.md`.

---

*Stack analysis: 2026-11-11*
