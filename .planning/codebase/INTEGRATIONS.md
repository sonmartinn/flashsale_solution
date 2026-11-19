---
last_mapped_commit: 2c310436edd3b718349e11b11f80e93f3bb3b0b9
last_mapped_at: 2026-11-11
---
# External Integrations

**Analysis Date:** 2026-11-11

## APIs & External Services

**HTTP nội bộ:**
- Express REST API: auth, danh mục, đợt sale, đơn hàng và quản trị được mount tại `/api`; xem `backend/src/routes/index.ts`.
  - Client: Node fetch cho E1/E3 và quản trị tại `loadtest/lib/http.ts`, `loadtest/lib/admin.ts`; autocannon cho E2 tại `loadtest/lib/autocannon-phase.ts`.
  - Auth: Bearer JWT cho admin; danh tính `x-test-user` chỉ khi chế độ test được bật tại `backend/src/middlewares/auth.ts`.
- Chưa phát hiện dịch vụ bên thứ ba cho thanh toán, email, object storage hoặc analytics trong dependency và mã tích hợp tại `backend/package.json`, `loadtest/package.json`, `backend/src/routes/index.ts`.
- Frontend gọi qua proxy Vite là yêu cầu tại `docs/SPECS.md`; chưa có frontend hoặc proxy được triển khai trong file git.

## Data Storage

**Databases:**
- MongoDB 7.0 standalone trong image `mongo:7.0` tại `docker-compose.yml`.
  - Connection: `MONGODB_URI`, cấu hình trong `backend/src/config/env.ts`; dịch vụ local ở `127.0.0.1:27018`, không dùng 27017.
  - Client: Mongoose `^9.11.4` tại `backend/package.json` và `backend/src/config/db.ts`.
  - Pool: `MONGO_MAX_POOL_SIZE`, mặc định trong code là 100; `serverSelectionTimeoutMS: 5000`; tắt auto-index/auto-create tại `backend/src/config/db.ts`.
  - Collections: `users`, `products`, `flash_sales`, `orders`, `stock_movements`; tên tường minh tại `backend/src/models/user.ts`, `backend/src/models/product.ts`, `backend/src/models/flash-sale.ts`, `backend/src/models/order.ts`, `backend/src/models/stock-movement.ts`.
  - Index được tạo tường minh khi khởi động qua `ensureIndexes()` ở `backend/src/models/index.ts`; đơn hàng duy nhất theo `(saleId,userId)` tại `backend/src/models/order.ts`.
- Redis 7.4 trong image `redis:7.4` tại `docker-compose.yml`.
  - Connection: `REDIS_URL`, đọc/kiểm tra tại `backend/src/config/env.ts`.
  - Client: ioredis `^6.0.0`, lazy connect, connect timeout 5 giây, `maxRetriesPerRequest: 1`, giữ retry mặc định tại `backend/src/config/redis.ts`.
  - Lưu tồn kho `stock:<saleId>` và tập đã mua `buyers:<saleId>` theo helper tại `backend/src/config/redis.ts`.
  - Lệnh `flashBuy` đăng ký bằng `defineCommand`, hai key, script tại `backend/src/lua/buy.lua` và `backend/src/services/lua.ts`.
  - V2 ghi đơn MongoDB sau khi giữ kho Redis, bù trừ khi lỗi; không có transaction xuyên hai hệ thống, xem `backend/src/services/purchase.service.ts`.
  - Đối soát dùng `backend/scripts/reconcile.ts`, `backend/src/services/reconcile.service.ts`; harness gọi CLI qua child process tại `loadtest/lib/reconcile.ts`.

**File Storage:**
- Named volumes `mongo-data:/data/db`, `redis-data:/data`; Redis bật AOF với `appendfsync everysec` tại `docker-compose.yml`.
- Kết quả thí nghiệm là CSV và metadata JSON local do `loadtest/lib/csv.ts` ghi; CSV được git theo dõi tại `loadtest/results/e1.csv`, `loadtest/results/e2.csv`, `loadtest/results/e3.csv`.
- Lua là asset local được copy khi build theo `backend/package.json` và đọc bằng URL tại `backend/src/services/lua.ts`.
- Chưa phát hiện tích hợp upload hoặc cloud file storage trong `backend/package.json` và `backend/src/routes/index.ts`.

**Caching:**
- Redis là nguồn tồn kho vận hành V2; MongoDB giữ đơn hàng và dữ liệu nền, xem `backend/src/services/purchase.service.ts`.
- Cache metadata sale bằng `Map<string, Promise<SaleInfo | null>>`, một instance mỗi app, single-flight, không TTL; reset vô hiệu hóa cache tại `backend/src/services/sale-cache.ts`, `backend/src/routes/index.ts`.
- Không thêm tồn kho vào cache metadata; `SaleInfo` chỉ giữ trường tĩnh tại `backend/src/services/sale-cache.ts`.

## Authentication & Identity

**Auth Provider:**
- Custom: user MongoDB và bcryptjs cost 10 tại `backend/src/models/user.ts`, `backend/src/services/auth.service.ts`.
  - JWT HS256, hạn 7 ngày, `sub` là user ID, payload có `role`; `backend/src/services/auth.service.ts`.
  - Secret: `JWT_SECRET`, bắt buộc và không có mặc định tại `backend/src/config/env.ts`.
  - Xác minh token không tra MongoDB trong đường mua; chỉ chấp nhận HS256 và role `user`/`admin` tại `backend/src/middlewares/auth.ts`.
  - Đăng ký ép role `user`; admin middleware kiểm tra role tại `backend/src/services/auth.service.ts`, `backend/src/middlewares/auth.ts`.
  - Test header không cấp quyền admin và chỉ hoạt động với `NODE_ENV` đúng chính xác `test`; `backend/src/config/env.ts`, `backend/src/middlewares/auth.ts`.

## Monitoring & Observability

**Error Tracking:**
- Chưa phát hiện dịch vụ error tracking ngoài; lỗi HTTP tập trung tại `backend/src/middlewares/error.ts`.
- `GET /api/health`: ping MongoDB và Redis song song, timeout mỗi ping 1 giây, trả 200/503 kèm `testMode`, `nodeEnv`, `maxPoolSize`; `backend/src/controllers/health.controller.ts`.

**Logs:**
- Console cho khởi động/lỗi tại `backend/src/server.ts`; không gắn request logger trong `backend/src/app.ts`.
- Lỗi kết nối Redis khi runtime được giới hạn một dòng mỗi 10 giây tại `backend/src/config/redis.ts`.
- Lỗi hoàn kho và ghi nhật ký bù trừ có console riêng tại `backend/src/services/purchase.service.ts`; không thêm log thường xuyên vào đường mua.
- Đo tải và phân loại lỗi/đúng sai nằm trong `loadtest/lib/classify.ts`, `loadtest/lib/verdict.ts`; xuất kết quả tại `loadtest/lib/csv.ts`.

## CI/CD & Deployment

**Hosting:**
- Local Node cho API, local Docker Compose cho database; `backend/package.json`, `docker-compose.yml`.
- Các cổng database chỉ bind loopback `127.0.0.1`; Compose không chạy backend/frontend tại `docker-compose.yml`.
- Chưa phát hiện cấu hình hosting cloud hoặc deploy production trong tập file git; tài liệu giới hạn phạm vi ở `docs/SPECS.md`.

**CI Pipeline:**
- Chưa phát hiện pipeline CI được git theo dõi; các lệnh kiểm tra nằm tại `backend/package.json`, `loadtest/package.json`.
- Backend có `typecheck`, `build`, `test`, `test:int`; harness có `typecheck`, `test`, `e1`, `e2`, `e3` theo hai manifest này.

## Environment Configuration

**Required env vars:**
- `MONGODB_URI`, `REDIS_URL`: bắt buộc cho cấu hình chung server/CLI tại `backend/src/config/env.ts`.
- `JWT_SECRET`: bắt buộc khi server khởi động; seed/reset có thể chỉ dùng cấu hình chung tại `backend/src/config/env.ts`.
- Tùy chọn `PORT` (mặc định code 5000), `CLIENT_ORIGIN` (mặc định code `http://localhost:5173`), `MONGO_MAX_POOL_SIZE` (mặc định code 100), `NODE_ENV` (quyết định test bằng so sánh chính xác); `backend/src/config/env.ts`.
- Harness tùy chọn `LOADTEST_BASE_URL`, `LOADTEST_ADMIN_EMAIL`, `LOADTEST_ADMIN_PASSWORD`; argv có thể chọn base URL, sale, runs và kích thước tải tại `loadtest/lib/config.ts`.
- `start:test` build trước rồi dùng `dotenv run -q --override -f .env.test -- node dist/server.js`; xem `backend/package.json`.

**Secrets location:**
- Code dotenv nạp cấu hình local theo cwd backend tại `backend/src/config/env.ts`; agent không đọc, tạo hoặc in `backend/.env`, theo `AGENTS.md`.
- Tên file môi trường được git theo dõi gồm `backend/.env.example` và `backend/.env.test`; nội dung không được đọc trong mapping. Không đưa giá trị token/mật khẩu/khóa vào tài liệu này.
- Chưa phát hiện secret manager bên ngoài trong `backend/package.json` và `backend/src/config/env.ts`.

## Webhooks & Callbacks

**Incoming:**
- Chưa phát hiện webhook từ dịch vụ bên ngoài; router hiện có tại `backend/src/routes/index.ts` là REST API cho ứng dụng và harness.

**Outgoing:**
- Chưa phát hiện callback/webhook ngoài; HTTP outbound của harness gọi backend tại `loadtest/lib/admin.ts`, `loadtest/lib/http.ts`, `loadtest/lib/autocannon-phase.ts`.
- Callback nội bộ `onSaleReset` nối reset với cache invalidation, không phải webhook mạng; `backend/src/routes/index.ts`, `backend/src/services/sale-cache.ts`.

---

*Integration audit: 2026-11-11*
