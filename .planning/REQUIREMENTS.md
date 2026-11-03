# Requirements: Flash Sale chống bán quá số lượng (Redis + MongoDB)

**Defined:** 2026-11-03
**Core Value:** Dưới tải đồng thời, V1 và V2 **luôn** cho đúng `totalQty` đơn thành công, mỗi người tối đa 1 đơn, còn V0 bán quá. Điều này phải được chứng minh lặp lại bằng thí nghiệm E1 có số liệu.

Nguồn yêu cầu gốc: `docs/SPECS.md`. Chi tiết kỹ thuật (tên trường, mã lỗi, các bước) lấy theo SPECS; file này là danh sách kiểm tra được.
Định nghĩa xong chung cho mọi yêu cầu mã: `typecheck` và `build` đạt.

## v1 Requirements

### Hạ tầng & khởi động (INFRA)

- [ ] **INFRA-01**: `docker compose up -d --wait` chạy MongoDB 7 tại `127.0.0.1:27018` và Redis 7 bật AOF `appendfsync everysec` tại `127.0.0.1:6379`, có healthcheck; không chạy backend/frontend trong Docker
- [ ] **INFRA-02**: Backend TypeScript strict, ESM `NodeNext` (import đuôi `.js`), có `npm run dev`, `build` (chép `src/lua/` sang `dist/lua/`), `start`, `start:test` (nạp `.env.test`, chạy JS đã biên dịch), `typecheck`
- [ ] **INFRA-03**: Server thoát với thông báo tiếng Việt rõ ràng khi thiếu `JWT_SECRET`, không kết nối được MongoDB hoặc Redis (timeout ngắn, đặt tường minh), hoặc cổng bị chiếm (kiểm tra `err` trong callback `listen`); không có chuỗi kết nối mặc định ngầm trỏ về cổng 27017
- [ ] **INFRA-04**: `GET /api/health` trả `{ mongo, redis }`, 200 khi cả hai sống, 503 khi một trong hai chết
- [ ] **INFRA-05**: Middleware lỗi ánh xạ đúng bảng mã SPECS mục 7 (CastError/JSON hỏng/ValidationError → 400, E11000 → 409, 401, 403, 404, khác → 500 không lộ chi tiết), thông báo tiếng Việt; lỗi nghiệp vụ dùng `HttpError(status, message, code)`; JSON lỗi có trường `code` máy đọc được (ví dụ `SOLD_OUT`, `ALREADY_BOUGHT`, `SALE_NOT_ACTIVE`, `STOCK_NOT_LOADED`)
- [ ] **INFRA-06**: `maxPoolSize` của Mongoose đặt tường minh qua cấu hình và được in ra khi khởi động; `.env.example` có đủ biến SPECS mục 11

### Dữ liệu, seed, reset (DATA)

- [ ] **DATA-01**: 5 model đúng SPECS mục 6 với tên collection tường minh (`flash_sales`, `stock_movements`…), index đầy đủ: `users.email` unique chữ thường, `products.slug` unique, `flash_sales (status, startAt)`, `orders (saleId, userId)` unique và `(userId, createdAt desc)`, `stock_movements (saleId, at)`; `remainingQty` không có `min`
- [ ] **DATA-02**: Server và seed đều đảm bảo index tồn tại (`createIndexes`/`syncIndexes`) trước khi nhận request / chèn dữ liệu
- [ ] **DATA-03**: `npm run seed` xóa sạch database `flashsale` và Redis, tạo 1.000 user + 1 admin (một mật khẩu thử, băm bcrypt một lần), 6 sản phẩm thời trang với `attributes` khác nhau theo loại, 1 đợt sale active 7 ngày giá bằng nửa giá gốc; số lượng kho (mặc định 100) và `mode` nhận qua tham số; nạp `stock:<saleId>` vào Redis
- [ ] **DATA-04**: Service reset dùng chung (CLI và API admin): `remainingQty = totalQty`, xóa `orders` và `stock_movements` của đợt, Redis `stock = totalQty` và xóa `buyers` trong một `multi()` (kiểm tra từng kết quả `exec()`), mở lại đợt sale (`active`, `startAt = now`, `endAt = now + 7 ngày`), tùy chọn đặt `mode`, ghi `stock_movements` lý do reset, xóa cache đợt sale
- [ ] **DATA-05**: `npm run reset` (một hoặc mọi đợt, tùy chọn `--mode`) chạy được và in cảnh báo rằng nó không xóa được cache trong tiến trình server đang chạy (script tải phải reset qua API)

### Xác thực (AUTH)

- [ ] **AUTH-01**: User đăng ký bằng `POST /api/auth/register` (name, email, password), luôn nhận vai trò `user` dù client gửi `role`; email trùng trả 409; mọi trường đầu vào không phải chuỗi bị từ chối 400
- [ ] **AUTH-02**: User đăng nhập bằng `POST /api/auth/login` và nhận JWT ký bằng `JWT_SECRET`, hạn 7 ngày, payload `sub` + `role`
- [ ] **AUTH-03**: `requireAuth` chỉ xác minh token, không tra MongoDB, gắn `req.user = { id, role }`; thiếu hoặc sai token trả 401
- [ ] **AUTH-04**: `requireAdmin` áp chung cho mọi đường dẫn `/api/admin` bằng `router.use`; user thường trả 403
- [ ] **AUTH-05**: Chỉ khi `NODE_ENV === "test"` (kiểm tra ở đúng một chỗ), `requireAuth` nhận header `x-test-user` (kiểm tra định dạng ObjectId, chuẩn hóa chữ thường, luôn quyền `user`); thao tác admin vẫn cần token thật

### API đọc (READ)

- [ ] **READ-01**: `GET /api/products` và `GET /api/products/:id` trả sản phẩm (id sai định dạng 400, không có 404)
- [ ] **READ-02**: `GET /api/sales/active` trả đợt sale đang mở kèm thông tin sản phẩm
- [ ] **READ-03**: `GET /api/sales/:id` trả chi tiết đợt sale, `remaining` đọc theo `sale.mode` (V2 đọc Redis `stock:<id>`, thiếu key thì tính `totalQty - số đơn` và báo chưa nạp; V0/V1 đọc `remainingQty`, có thể âm) và giờ server `now`
- [ ] **READ-04**: User xem đơn của mình qua `GET /api/orders/me`, sắp xếp mới nhất trước

### Mua hàng (BUY)

- [ ] **BUY-01**: `POST /api/sales/:id/buy?mode=v0|v1|v2` chạy phần kiểm tra chung đúng thứ tự SPECS mục 8: auth → `mode` hợp lệ (chuỗi đơn) → `qty` đúng bằng 1 → đợt sale tồn tại, `active`, trong `[startAt, endAt]` → `buyHandlers[mode]`
- [ ] **BUY-02**: Thông tin tĩnh của đợt sale (`salePrice`, `productId`, `startAt`, `endAt`, `status`, `totalQty`) đọc qua cache trong bộ nhớ Node dùng chung cho cả ba chế độ, xóa khi reset; không bao giờ cache `remainingQty`
- [ ] **BUY-03**: Mã trả về thống nhất giữa ba phiên bản: 201 trả đơn, 409 hết hàng, 409 đã mua (thông báo và `code` khác), 400 đợt sale chưa mở/đã kết thúc, 503 khi V2 chưa nạp kho
- [ ] **BUY-04**: V0 đọc `remainingQty` bằng `findOne`, nếu đủ thì `updateOne` `$inc: -qty`, rồi tạo đơn; dưới tải đồng thời có thể bán quá và tồn kho âm (không ghi đè giá trị đọc được)
- [ ] **BUY-05**: V1 trừ kho nguyên tử bằng `findOneAndUpdate({ remainingQty: { $gte: qty } }, { $inc })`, `null` là hết hàng; tạo đơn; nếu tạo đơn lỗi thì hoàn kho `$inc +qty` (có `await`), riêng lỗi không phải E11000 thì chỉ hoàn kho khi `Order.exists` xác nhận đơn không tồn tại
- [ ] **BUY-06**: V2 chạy script Lua nguyên tử (nạp một lần bằng `redis.defineCommand`, đọc file bằng `readFileSync(new URL("../lua/buy.lua", import.meta.url))`) trả 1/0/-1/-2; chỉ khi 1 mới tạo đơn MongoDB; `flash_sales.remainingQty` không giảm ở V2
- [ ] **BUY-07**: V2 tạo đơn lỗi thì hoàn kho Redis trước (`INCRBY` + `SREM` trong một `multi()`, kiểm tra kết quả; với E11000 chỉ `INCRBY`, không `SREM` vì user thật sự có đơn; lỗi khác kiểm tra `Order.exists` trước), sau đó mới ghi `stock_movements` (lỗi khi ghi log không chặn bù trừ)
- [ ] **BUY-08**: Cả ba chế độ dùng chung một hàm tạo đơn; đường mua không ghi log và không ghi `stock_movements` khi thành công
- [ ] **BUY-09**: Có smoke test cho script Lua với ioredis 6 (RESP3) xác nhận đủ 4 mã trả về 1/0/-1/-2 và 1.000 lệnh song song trên kho 100 cho đúng 100 thành công

### Quản trị & đối chiếu (ADMIN)

- [ ] **ADMIN-01**: Admin reset đợt sale qua `POST /api/admin/sales/:id/reset`, body tùy chọn `{ mode }` để đổi chế độ đợt sale
- [ ] **ADMIN-02**: Admin xem `GET /api/admin/sales/:id/stats`: tồn kho MongoDB, tồn kho Redis, số đơn, số user khác nhau, số đơn vượt (`số đơn - totalQty` nếu dương), kèm `totalQty`, `mode`, `status`
- [ ] **ADMIN-03**: Script đối chiếu kiểm tra `stock:<saleId> = totalQty - số đơn thành công` và tập `buyers:<saleId>` trùng tập `userId` trong `orders`, in chênh lệch, thoát mã khác 0 khi lệch, có tùy chọn `--fix` sửa Redis theo MongoDB

### Thí nghiệm (EXP)

- [ ] **EXP-01**: Thư viện dùng chung cho script tải: đăng nhập admin, reset qua API (kèm mode), đọc stats, sinh ObjectId cho `x-test-user`, ghi CSV từ Node (dấu thập phân `.`), kiểm tra điều kiện trước khi đo (server ở chế độ test, index unique tồn tại, stats ban đầu đúng `totalQty`)
- [ ] **EXP-02**: E1 chạy bằng script Node riêng (`fetch` + `Promise.all`, tạo đủ 1.000 promise trước khi chờ): kho 100, 1.000 user khác nhau, lặp 5 lần mỗi phiên bản V0/V1/V2, reset trước mỗi lần, tự kiểm tra số user khác nhau và không có 401
- [ ] **EXP-03**: E1 ghi CSV tổng hợp (ngày đo, cấu hình, pool, số đơn thành công, tồn kho cuối, số đơn vượt, số user khác nhau) và in kết luận PASS/FAIL/INVALID: V0 có đơn vượt, V1 và V2 đúng `totalQty` trong mọi lần; đối chiếu Redis–MongoDB sạch sau mỗi lần V2
- [ ] **EXP-04**: E3: một user gửi 10 request đồng thời, chỉ V1 và V2; ghi CSV và kiểm tra user đó có đúng 1 đơn, tồn kho không rò rỉ
- [ ] **EXP-05**: E2 dùng autocannon với `setupRequest` và biến đếm chung (không dùng `workers`), mỗi request một user khác nhau; kho ≥ 1.000 qua tham số; 100/300/500 kết nối, lặp ≥ 5 lần, cấu hình kết nối giống nhau giữa V1 và V2
- [ ] **EXP-06**: E2 tự thu `responseTime` từng request để tính p50 và p95, đếm riêng 201, 409 và lỗi thật (chỉ 5xx và lỗi kết nối) từ `statusCodeStats`, đo tách giai đoạn còn hàng và giai đoạn hết hàng; ghi CSV tổng hợp lên git, file thô không lên git
- [ ] **EXP-07**: Mỗi thí nghiệm chạy được bằng một lệnh npm và tài liệu hóa quy trình đo (`start:test`, reset trước mỗi lần, không log trong đường mua)
- [ ] **EXP-08** *(tùy chọn, cắt đầu tiên)*: E4: ngắt MongoDB khi đang bán V2, kiểm tra sau bù trừ Redis và `orders` khớp nhau (qua script đối chiếu), ghi CSV

### Giao diện (WEB)

- [ ] **WEB-01**: Frontend React 19 + React Router 7 (ghim `^7`) + Vite 8, TypeScript strict, gọi API qua proxy Vite `/api` → `http://localhost:5000`; `typecheck` và `build` đạt
- [ ] **WEB-02**: User đăng nhập/đăng ký ở `/login`; token lưu lại và gửi kèm `Authorization: Bearer`
- [ ] **WEB-03**: Trang chủ `/` hiển thị đợt sale đang mở (giá sale, số còn lại) và danh sách sản phẩm
- [ ] **WEB-04**: Trang `/sales/:id` có đếm ngược tới `endAt` (hiệu chỉnh theo `now` của server) và nút mua theo `sale.mode` (khóa khi đang gửi); hiển thị thông báo kết quả theo `code`/mã trả về
- [ ] **WEB-05** *(cắt thứ tư)*: Số còn lại trên trang đợt sale tự cập nhật bằng polling 1–2 giây, dọn interval khi rời trang; nếu cắt thì dùng nút làm mới
- [ ] **WEB-06**: User xem đơn của mình ở `/orders`
- [ ] **WEB-07** *(cắt thứ ba)*: Admin xem trang `/admin`: số liệu từ API stats (đơn vượt tô đỏ, huy hiệu đồng bộ Redis–MongoDB), nút reset có chọn mode, cập nhật liên tục để thấy bộ đếm tụt về 0 khi bắn tải, có thể tạm dừng cập nhật khi đo E2
- [ ] **WEB-08** *(cắt thứ hai)*: Trang web hiển thị biểu đồ so sánh V1 với V2 (Recharts, nạp lười) từ CSV của E2

### Script môi trường dev (DEV)

- [ ] **DEV-01**: `scripts/start.ps1` (Windows PowerShell 5.1, UTF-8 có BOM, không `&&`/`||`/`??`/ba ngôi) thực hiện đủ 10 bước SPECS mục 12: về thư mục gốc, kiểm tra công cụ và phiên bản Node, mở Docker Desktop và chờ tối đa ~120 giây, kiểm tra PID/cổng 5000 và 5173 (không tự kill), `docker compose up -d --wait`, tạo `.env` có `JWT_SECRET` ngẫu nhiên (không in ra), `npm ci` khi cần, seed khi có `-Seed` hoặc database trống (không bao giờ tự seed khi đã có dữ liệu), chạy nền backend/frontend ghi PID và log vào `.dev/`, chờ health và in URL
- [ ] **DEV-02**: `scripts/stop.ps1` dừng cả cây tiến trình theo PID (`taskkill /T /F`), xử lý trường hợp mất file PID (chỉ kill `node` có dòng lệnh chứa đường dẫn dự án), `docker compose stop` trừ khi `-KeepDb`, kiểm tra cổng đã giải phóng, báo "không có gì để dừng" khi không chạy gì; cả hai script có `-Help`
- [ ] **DEV-03**: `scripts/start.sh` và `scripts/stop.sh` (bash 3.2, `set -euo pipefail`, `nohup`, nhóm tiến trình riêng, `</dev/null`) có cùng hành vi và tham số (`--seed`, `--keep-db`, `--help`)
- [ ] **DEV-04**: `.gitattributes` (`*.sh` LF, `*.ps1` CRLF), quyền thực thi git cho `.sh`, `.dev/` trong `.gitignore`; script idempotent, không đổi cấu hình hệ thống, không động vào dịch vụ MongoDB cổng 27017, không `docker compose down -v`
- [ ] **DEV-05**: Đạt danh sách kiểm thử Windows ở SPECS mục 12 trên đúng thư mục dự án (đường dẫn có dấu và khoảng trắng); macOS ít nhất `bash -n` (và `shellcheck` nếu có), README ghi rõ chưa chạy thử trên macOS nếu không có máy

### Tài liệu & báo cáo (DOC)

- [ ] **DOC-01**: README hướng dẫn chạy từ đầu trên máy vừa clone (`docker compose up -d`, cài đặt, seed, chạy backend và frontend, script start/stop, chạy thí nghiệm)
- [ ] **DOC-02**: Tài liệu phân tích kết quả trong `docs/` trả lời 3 câu hỏi SPECS mục 2 bằng số liệu E1–E3 (E4 nếu có), kèm biểu đồ V1 với V2, nêu rõ cấu hình máy, kích thước pool, việc chế độ test bỏ qua chi phí JWT, và rằng số liệu chỉ so sánh tương đối
- [ ] **DOC-03**: Tài liệu nêu đánh đổi và rủi ro: khoảnh khắc "hết hàng giả" ở V1, AOF `everysec` mất ~1 giây dữ liệu, Node chết giữa Lua và ghi đơn (bán thiếu, không bán quá), rủi ro trộn chế độ, giới hạn hoàn kho khi ghi đơn mơ hồ
- [ ] **DOC-04**: Runbook xử lý khi Redis sập: kiểm tra, chạy đối chiếu `--fix` trước khi mở lại đợt sale V2
- [ ] **DOC-05**: Tài liệu giải thích lựa chọn hai loại NoSQL: key-value (Redis) cho kho và tập người mua, document (MongoDB) cho dữ liệu gốc và `attributes` linh hoạt

## v2 Requirements

Ghi nhận nhưng không nằm trong roadmap hiện tại.

### Mở rộng thí nghiệm

- **EXPX-01**: Chạy thử đầy đủ script `.sh` trên máy macOS thật
- **EXPX-02**: Đo trên máy tách riêng bắn tải và server để có số tuyệt đối

## Out of Scope

| Feature | Reason |
|---------|--------|
| Thanh toán | Ngoài trọng tâm môn CSDL phi quan hệ (SPECS mục 3) |
| Giữ chỗ có thời hạn (V3) | Không có trong SPECS, chỉ làm khi được hỏi |
| WebSocket | Polling 1–2 giây là đủ cho demo |
| Redis Cluster | Chạy standalone; tên khóa không dùng `{}` |
| Hàng đợi (queue) | Ngoài phạm vi so sánh V0/V1/V2 |
| Nhiều đợt sale chạy song song | Mỗi lần đo một đợt |
| Đóng gói backend/frontend vào Docker | Docker chỉ chạy MongoDB và Redis |
| MongoDB transaction | MongoDB standalone; khoảnh khắc hết hàng giả ở V1 là đánh đổi để bàn luận |
| Khóa phân tán, `sleep` nhân tạo trong V0 | Làm sai lệch phép đo / che giấu bản chất race condition |
| `qty > 1`, tồn kho theo biến thể (size/màu) | SPECS khóa `qty = 1`, một đợt một sản phẩm |
| CRUD sản phẩm/đợt sale cho admin, hủy đơn, rate limiting | Không có trong SPECS; dữ liệu tạo bằng seed |
| Cache `remainingQty` | Làm sai kết quả tính đúng và so sánh |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| INFRA-01 | Phase 1 | Pending |
| INFRA-02 | Phase 1 | Pending |
| INFRA-03 | Phase 1 | Pending |
| INFRA-04 | Phase 1 | Pending |
| INFRA-05 | Phase 1 | Pending |
| INFRA-06 | Phase 1 | Pending |
| DATA-01 | Phase 1 | Pending |
| DATA-02 | Phase 1 | Pending |
| DATA-03 | Phase 1 | Pending |
| DATA-04 | Phase 1 | Pending |
| DATA-05 | Phase 1 | Pending |
| AUTH-01 | Phase 1 | Pending |
| AUTH-02 | Phase 1 | Pending |
| AUTH-03 | Phase 1 | Pending |
| AUTH-04 | Phase 1 | Pending |
| AUTH-05 | Phase 1 | Pending |
| READ-01 | Phase 2 | Pending |
| READ-02 | Phase 2 | Pending |
| READ-03 | Phase 2 | Pending |
| READ-04 | Phase 2 | Pending |
| BUY-01 | Phase 2 | Pending |
| BUY-02 | Phase 2 | Pending |
| BUY-03 | Phase 2 | Pending |
| BUY-04 | Phase 2 | Pending |
| BUY-05 | Phase 2 | Pending |
| BUY-06 | Phase 2 | Pending |
| BUY-07 | Phase 2 | Pending |
| BUY-08 | Phase 2 | Pending |
| BUY-09 | Phase 2 | Pending |
| ADMIN-01 | Phase 2 | Pending |
| ADMIN-02 | Phase 2 | Pending |
| ADMIN-03 | Phase 2 | Pending |
| EXP-01 | Phase 3 | Pending |
| EXP-02 | Phase 3 | Pending |
| EXP-03 | Phase 3 | Pending |
| EXP-04 | Phase 3 | Pending |
| EXP-05 | Phase 3 | Pending |
| EXP-06 | Phase 3 | Pending |
| EXP-07 | Phase 3 | Pending |
| EXP-08 | Phase 3 | Pending |
| WEB-01 | Phase 4 | Pending |
| WEB-02 | Phase 4 | Pending |
| WEB-03 | Phase 4 | Pending |
| WEB-04 | Phase 4 | Pending |
| WEB-05 | Phase 4 | Pending |
| WEB-06 | Phase 4 | Pending |
| WEB-07 | Phase 4 | Pending |
| WEB-08 | Phase 5 | Pending |
| DEV-01 | Phase 4 | Pending |
| DEV-02 | Phase 4 | Pending |
| DEV-03 | Phase 4 | Pending |
| DEV-04 | Phase 4 | Pending |
| DEV-05 | Phase 4 | Pending |
| DOC-01 | Phase 5 | Pending |
| DOC-02 | Phase 5 | Pending |
| DOC-03 | Phase 5 | Pending |
| DOC-04 | Phase 5 | Pending |
| DOC-05 | Phase 5 | Pending |

**Coverage:**
- v1 requirements: 58 total
- Mapped to phases: 58
- Unmapped: 0 ✓

**Per phase:** Phase 1: 16 · Phase 2: 16 · Phase 3: 8 · Phase 4: 12 · Phase 5: 6

---
*Requirements defined: 2026-11-03*
*Last updated: 2026-11-03 after roadmap creation*
