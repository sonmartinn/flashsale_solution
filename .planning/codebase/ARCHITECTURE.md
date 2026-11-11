---
last_mapped_commit: 2c310436edd3b718349e11b11f80e93f3bb3b0b9
last_mapped_at: 2026-11-11
---
<!-- refreshed: 2026-11-11 -->
# Architecture

**Analysis Date:** 2026-11-11

## System Overview

```text
HTTP client                         Bộ thí nghiệm E1/E2/E3
                                    loadtest/scenarios/
          |                                  |
          +----------------+-----------------+
                           v
Express app: backend/src/app.ts
Routes -> middleware -> controllers
backend/src/routes/ | middlewares/ | controllers/
                           |
                           v
Services: backend/src/services/
purchase | catalog | auth | sale-admin | reconcile
             |                         |
             v                         v
MongoDB / Mongoose                 Redis / ioredis + Lua
backend/src/models/                backend/src/config/redis.ts
orders, flash_sales, users,         backend/src/lua/buy.lua
products, stock_movements          stock:<id>, buyers:<id>
```

- Hệ thống thực thi gồm API Express và package bắn tải riêng: `backend/package.json`, `loadtest/package.json`.
- Chưa có thư mục frontend trong cây mã nguồn. React/Vite trong `docs/SPECS.md` là yêu cầu sản phẩm, không phải thành phần đã triển khai.
- MongoDB là nguồn sự thật của đơn hàng; Redis quản lý phép giữ kho và tập người mua ở V2: `backend/src/services/purchase.service.ts`, `backend/src/services/reconcile.service.ts`.

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| Bootstrap | Kiểm tra cấu hình/cổng, kết nối dữ liệu, tạo index, đăng ký Lua, mở HTTP | `backend/src/server.ts` |
| App factory | CORS, JSON parser, routing, middleware lỗi | `backend/src/app.ts` |
| Composition root | Tạo một cache và các service dùng chung trong mỗi app | `backend/src/routes/index.ts` |
| Purchase | Cửa sổ sale, chọn V0/V1/V2, ghi đơn và bù trừ | `backend/src/services/purchase.service.ts` |
| Catalog | Đọc sản phẩm, sale, đơn của người dùng và dựng DTO | `backend/src/services/catalog.service.ts` |
| Stock view | Đọc kho theo mode, dự phòng khi Redis thiếu khóa | `backend/src/services/stock.service.ts` |
| Sale admin | Reset MongoDB/Redis, vô hiệu cache, thống kê | `backend/src/services/sale-admin.service.ts` |
| Reconcile | So sánh Redis với đơn MongoDB và sửa Redis | `backend/src/services/reconcile.service.ts` |
| Harness | Quản lý phiên đo, reset, preflight, CSV/JSON, khôi phục sale | `loadtest/lib/session.ts` |

## Pattern Overview

**Overall:** Backend phân tầng router → controller → service → Mongoose/Redis, dùng factory và truyền phụ thuộc tường minh.

**Key Characteristics:**
- Dùng `createApp(deps)` không mở kết nối hay đọc biến môi trường: `backend/src/app.ts`.
- Dựng service/cache ở router gốc; không dựng lại theo từng request: `backend/src/routes/index.ts`.
- Dùng cùng đường kiểm tra, DTO và ghi đơn cho cả ba mode; chỉ thay bước trừ kho: `backend/src/services/purchase.service.ts`, `backend/src/services/order.service.ts`.
- Không có repository layer riêng: service gọi Mongoose trực tiếp, ví dụ `backend/src/services/catalog.service.ts`.

## Layers

**Khởi động và cấu hình:**
- Purpose: Kiểm tra điều kiện chạy và quản lý kết nối trước khi nhận request.
- Location: `backend/src/server.ts`, `backend/src/config/`.
- Contains: Nạp/kiểm tra cấu hình, MongoDB, Redis, key helpers.
- Depends on: Mongoose, ioredis, model index, Lua loader.
- Used by: HTTP server và CLI trong `backend/scripts/`.

**HTTP:**
- Purpose: Xác thực, phân quyền, kiểm tra đầu vào và chuyển kết quả thành HTTP.
- Location: `backend/src/routes/`, `backend/src/controllers/`, `backend/src/middlewares/`.
- Contains: Route factories, request handlers, JWT middleware, error mapping.
- Depends on: Interface service và tiện ích `backend/src/utils/`.
- Used by: `backend/src/app.ts`.

**Nghiệp vụ:**
- Purpose: Mua hàng, quản trị sale, đăng nhập, seed và đối soát.
- Location: `backend/src/services/`.
- Contains: Factory service, kiểu input/output, cache và hàm dùng chung.
- Depends on: `backend/src/models/`, Redis, DTO và lỗi nghiệp vụ.
- Used by: Controller và CLI `backend/scripts/`.

**Lưu trữ:**
- Purpose: Schema/index và phép cập nhật nguyên tử.
- Location: `backend/src/models/`, `backend/src/lua/`.
- Contains: Năm Mongoose model và script Lua mua hàng.
- Depends on: MongoDB và Redis.
- Used by: `backend/src/services/`.

**Bộ thí nghiệm:**
- Purpose: Điều phối và đánh giá tải qua HTTP, lưu bằng chứng đo.
- Location: `loadtest/scenarios/`, `loadtest/lib/`.
- Contains: E1/E2/E3, client admin, burst fetch, autocannon, histogram, verdict, CSV.
- Depends on: API đang chạy và CLI reconcile qua `loadtest/lib/reconcile.ts`.
- Used by: Lệnh npm trong `loadtest/package.json`.

## Data Flow

### Primary Request Path

1. `backend/src/app.ts` gắn API tại `/api`; `backend/src/routes/sale.routes.ts` gắn middleware đăng nhập cho POST mua.
2. `backend/src/middlewares/auth.ts` lấy danh tính JWT hoặc `x-test-user` khi cấu hình test cho phép; không tra MongoDB trên đường mua.
3. `backend/src/controllers/sale.controller.ts` kiểm tra mode chuỗi hợp lệ, body có `qty` đúng số `1`, rồi chuẩn hóa sale ID. Mode query là bắt buộc và không tự lấy từ sale.
4. `backend/src/services/purchase.service.ts` lấy dữ liệu sale tĩnh từ `backend/src/services/sale-cache.ts`, kiểm tra trạng thái và thời gian bằng một lần `Date.now()`.
5. Service chọn đúng handler theo mode, sau đó gọi chung `backend/src/services/order.service.ts` để ghi đơn MongoDB.
6. `backend/src/controllers/sale.controller.ts` trả `201 { order }`, hoặc chuyển kết quả thành `409 SOLD_OUT`, `409 ALREADY_BOUGHT`, `503 STOCK_NOT_LOADED`.

### V0 — đọc rồi trừ

1. Đọc `flash_sales.remainingQty` rồi so với qty trong `backend/src/services/purchase.service.ts`.
2. Thực hiện `$inc` âm bằng lệnh riêng, không có điều kiện tồn kho trong update.
3. Ghi đơn bằng service chung. Các request có thể cùng thấy còn kho và bán quá; không thêm khóa hay bù trừ vào V0 vì đây là đối chứng cố ý.

### V1 — MongoDB nguyên tử

1. `findOneAndUpdate` kết hợp `_id`, `remainingQty >= qty` và `$inc` âm trên cùng document trong `backend/src/services/purchase.service.ts`.
2. Không tìm thấy document thỏa điều kiện thì trả hết hàng; thành công thì ghi đơn MongoDB.
3. Lỗi ghi đơn đi qua bù trừ, không dùng transaction MongoDB: `backend/src/services/purchase.service.ts`.

### V2 — Redis và Lua

1. `backend/src/services/lua.ts` gọi script đăng ký trên Redis với khóa `stock:<saleId>` và `buyers:<saleId>`.
2. `backend/src/lua/buy.lua` kiểm tra người mua trước, kiểm tra có kho và đủ kho, rồi `DECRBY` + `SADD` nguyên tử.
3. Script trả `1`, `0`, `-1`, `-2` tương ứng thành công, hết hàng, đã mua, chưa nạp kho.
4. `backend/src/services/purchase.service.ts` ghi đơn MongoDB sau khi Lua thành công; V2 không cập nhật `flash_sales.remainingQty`.

### Bù trừ và đối soát

- Khi E11000, hoàn lượng kho vừa trừ; ở V2 giữ người mua trong buyers vì người đó đã có đơn: `backend/src/services/purchase.service.ts`.
- Với lỗi ghi khác, tra lại đơn. Nếu có đơn thì trả thành công; không có thì hoàn kho và giải phóng buyer V2; nếu không tra được thì giữ kho để tránh bán quá: `backend/src/services/purchase.service.ts`.
- Ghi `stock_movements` sau khi hoàn kho thành công; lỗi hoàn kho trả lỗi máy chủ có nguyên nhân gốc: `backend/src/services/purchase.service.ts`.
- Đối soát so cả lượng kho và thành viên buyers với các đơn thành công. Sửa bằng Redis MULTI rồi kiểm tra lại, không sửa đơn MongoDB: `backend/src/services/reconcile.service.ts`, `backend/scripts/reconcile.ts`.

### Đọc và reset

- Catalog đọc MongoDB mới, ghép sản phẩm bằng truy vấn `$in`; kho V2 đọc bằng MGET, thiếu khóa thì suy từ số đơn và đánh dấu `stockLoaded: false`: `backend/src/services/catalog.service.ts`, `backend/src/services/stock.service.ts`.
- Reset xóa đơn/biến động, đặt lại sale, SET stock + DEL buyers, ghi biến động reset rồi vô hiệu cache nếu gọi qua API: `backend/src/services/sale-admin.service.ts`, `backend/src/routes/index.ts`.
- CLI dùng cùng reset service nhưng không chạm được cache của server đang chạy: `backend/scripts/reset.ts`, `backend/src/services/sale-admin.service.ts`.

### Phiên thí nghiệm

1. `loadtest/lib/session.ts` kiểm tra health/test mode, đăng nhập admin, xác định sale, kiểm tra unique index và ghi thông tin môi trường.
2. Mỗi lượt canh ngân sách cổng, gọi API reset và kiểm tra stats trước khi bắn: `loadtest/lib/ports.ts`, `loadtest/lib/preflight.ts`.
3. E1 dùng burst người dùng khác nhau; E3 dùng người dùng lặp; E2 dùng autocannon cho pha còn hàng/hết hàng, có warm-up: `loadtest/scenarios/e1-correctness.ts`, `loadtest/scenarios/e3-duplicate.ts`, `loadtest/scenarios/e2-performance.ts`.
4. Phân loại response và tính histogram/verdict, đọc stats và reconcile phù hợp, ghi CSV cùng JSON thô: `loadtest/lib/classify.ts`, `loadtest/lib/histogram.ts`, `loadtest/lib/verdict.ts`, `loadtest/lib/csv.ts`.
5. `finally` khôi phục mode và tổng kho ban đầu; harness không khởi động hay dừng backend: `loadtest/lib/session.ts`.

**State Management:**
- Cache Map chứa Promise single-flight theo sale ID, chỉ có thông tin tĩnh, không tồn kho/mode, không TTL: `backend/src/services/sale-cache.ts`.
- Kết nối Mongoose dùng trạng thái module; Redis được truyền qua phụ thuộc: `backend/src/config/db.ts`, `backend/src/app.ts`.
- Phiên đo giữ admin client, ID factory, cấu hình và CSV writer trong Session riêng: `loadtest/lib/session.ts`.

## Key Abstractions

**AppDeps:**
- Purpose: Cấu hình đã kiểm tra, JWT key và Redis client dùng để dựng app.
- Examples: `backend/src/app.ts`, `backend/src/routes/index.ts`.
- Pattern: Factory với dependency injection tường minh.

**BuyResult và PurchaseService:**
- Purpose: Phân biệt kết quả nghiệp vụ với HTTP và thay thế thao tác ghi/tra đơn trong test.
- Examples: `backend/src/services/purchase.service.ts`, `backend/src/controllers/sale.controller.ts`.
- Pattern: Discriminated union và interface service.

**DTO:**
- Purpose: Chuyển document/lean result thành JSON có ID và trường tường minh.
- Examples: `backend/src/utils/dto.ts`, `backend/src/services/catalog.service.ts`.
- Pattern: Hàm ánh xạ dùng chung; không trả document Mongoose trực tiếp.

## Entry Points

**HTTP server:**
- Location: `backend/src/server.ts`.
- Triggers: `dev`, `start`, `start:test` trong `backend/package.json`.
- Responsibilities: Kết nối, index, Lua và listen; chế độ test chạy JS biên dịch qua dotenv CLI.

**CLI dữ liệu:**
- Location: `backend/scripts/seed.ts`, `backend/scripts/reset.ts`, `backend/scripts/reconcile.ts`.
- Triggers: Npm scripts trong `backend/package.json`.
- Responsibilities: Kiểm tra tham số, gọi service, hiển thị kết quả và đóng kết nối.

**Thí nghiệm:**
- Location: `loadtest/scenarios/e1-correctness.ts`, `loadtest/scenarios/e2-performance.ts`, `loadtest/scenarios/e3-duplicate.ts`.
- Triggers: `e1`, `e2`, `e3` trong `loadtest/package.json`.
- Responsibilities: Điều phối thí nghiệm; chưa có entry point E4 trong package này.

## Architectural Constraints

- **Threading:** API dùng async I/O trên Node; không có worker cho đường mua trong `backend/src/services/purchase.service.ts`. Nguyên tử dựa vào MongoDB/Lua, không dựa vào thứ tự event loop.
- **Global state:** Model Mongoose cấp module tại `backend/src/models/`; cache sale ở closure mỗi app tại `backend/src/services/sale-cache.ts`; dummy bcrypt hash được nhớ cấp module tại `backend/src/services/auth.service.ts`.
- **Circular imports:** Không phát hiện chuỗi vòng trong các đường runtime đã khảo sát; dùng `import type` cho `AppDeps` trong `backend/src/routes/index.ts`.
- **Nhất quán:** Redis và MongoDB không có transaction chung; bù trừ/đối soát là phần bắt buộc của V2 trong `backend/src/services/purchase.service.ts`, `backend/src/services/reconcile.service.ts`.
- **So sánh công bằng:** Không thêm I/O/log vào đường thành công riêng của một mode; giữ kiểm tra và ghi đơn dùng chung trong `backend/src/services/purchase.service.ts`.
- **Tài nguyên Lua:** Build phải chép `src/lua` sang `dist/lua` để URL tương đối hoạt động ở runtime: `backend/package.json`, `backend/src/services/lua.ts`.

## Anti-Patterns

### Dùng đọc-rồi-ghi làm thuật toán kho an toàn

**What happens:** V0 đọc tồn trước rồi trừ trong lệnh khác tại `backend/src/services/purchase.service.ts`.
**Why it's wrong:** Request đồng thời cùng vượt qua phép kiểm tra, dẫn tới tồn âm; đây là đối chứng của thí nghiệm.
**Do this instead:** Với luồng cần chống bán quá, giữ predicate trong update V1 hoặc Lua V2 ở `backend/src/services/purchase.service.ts`, `backend/src/lua/buy.lua`; giữ nguyên V0 để đo.

### Reset CLI khi API giữ cache sale

**What happens:** CLI reset cập nhật dữ liệu nhưng callback vô hiệu cache chỉ thuộc app đang chạy: `backend/src/services/sale-admin.service.ts`.
**Why it's wrong:** Cache không TTL có thể tiếp tục giữ thời gian/trạng thái cũ.
**Do this instead:** Dùng API admin reset khi server đang chạy, như `loadtest/lib/session.ts`; callback chung được nối tại `backend/src/routes/index.ts`.

## Error Handling

**Strategy:** Controller async ném lỗi và Express 5 chuyển tới middleware cuối; service chỉ bắt lỗi khi cần phân loại, bù trừ hoặc chuyển lỗi thư viện.

**Patterns:**
- Dùng `HttpError` với status/message/code cho lỗi nghiệp vụ: `backend/src/utils/http-error.ts`.
- Giữ một bảng đổi BuyResult sang HTTP: `backend/src/controllers/sale.controller.ts`.
- Ánh xạ lỗi JSON, Mongoose, duplicate key; che chi tiết lỗi 500: `backend/src/middlewares/error.ts`.
- Harness phân biệt PASS/FAIL/INVALID, đặt `process.exitCode` để finally được chạy: `loadtest/lib/session.ts`, `loadtest/lib/verdict.ts`.

## Cross-Cutting Concerns

**Logging:** Không có middleware log request trong `backend/src/app.ts`; chỉ log lỗi máy chủ/bù trừ và bootstrap trong `backend/src/middlewares/error.ts`, `backend/src/services/purchase.service.ts`, `backend/src/server.ts`.
**Validation:** Kiểm tra runtime tường minh ở controller/util và kiểm tra lại tham số nghiệp vụ mà CLI cũng gọi: `backend/src/utils/validate.ts`, `backend/src/utils/object-id.ts`, `backend/src/controllers/sale.controller.ts`, `backend/src/services/sale-admin.service.ts`.
**Authentication:** JWT HS256, role từ token; test header chỉ quyền user khi bật test mode; admin vẫn cần quyền admin: `backend/src/middlewares/auth.ts`.

---

*Architecture analysis: 2026-11-11*
