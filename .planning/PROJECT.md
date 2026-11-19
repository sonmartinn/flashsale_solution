# Flash Sale chống bán quá số lượng (Redis + MongoDB)

## What This Is

Đồ án môn Cơ sở dữ liệu phi quan hệ với đề tài: **Nghiên cứu Redis và MongoDB trong xây dựng hệ thống flash sale chống bán quá số lượng, ứng dụng cho shop thời trang**. Sản phẩm là một ứng dụng web flash sale (Express 5 + React 19). API mua hàng có 3 cách xử lý tồn kho: V0 ngây thơ, V1 dùng MongoDB nguyên tử, V2 dùng Redis + Lua. Kèm theo là bộ script bắn tải để chứng minh bằng số liệu rằng V0 bán quá còn V1, V2 không bao giờ bán quá, và để so sánh hiệu năng V1 với V2. Người dùng là nhóm sinh viên làm đồ án và giảng viên chấm (demo + báo cáo).

Nguồn yêu cầu duy nhất là `docs/SPECS.md`. Dự án **làm lại từ đầu** theo file này. Mã cũ ở commit `40dea55` không được khôi phục.

## Core Value

Dưới tải đồng thời, V1 và V2 **luôn** cho đúng `totalQty` đơn thành công, mỗi người tối đa 1 đơn, còn V0 bán quá. Điều này phải được chứng minh lặp lại bằng thí nghiệm E1 có số liệu.

## Requirements

### Validated

- ✓ Hạ tầng: Docker Compose chỉ chạy MongoDB 7 (cổng `127.0.0.1:27018`) và Redis 7 bật AOF `everysec` (cổng `127.0.0.1:6379`) — Phase 1
- ✓ Backend TypeScript strict (Express 5, Mongoose 9, ioredis 6, ES modules NodeNext). Server thoát với thông báo rõ ràng khi thiếu `JWT_SECRET`, không kết nối được Mongo hoặc Redis, hoặc cổng bị chiếm — Phase 1
- ✓ 5 collection có index đúng theo SPECS mục 6 (`users`, `products`, `flash_sales`, `orders`, `stock_movements`). Unique `(saleId, userId)`. `remainingQty` không có `min` — Phase 1
- ✓ Script seed (1.000 user + 1 admin, 6 sản phẩm thời trang có `attributes` khác nhau, 1 đợt sale, kho nhận qua tham số) và script reset đợt sale (MongoDB + Redis `multi()` + xóa cache) — Phase 1
- ✓ Đăng ký, đăng nhập JWT (hạn 7 ngày, payload `sub` + `role`). `requireAuth` không tra MongoDB, có `requireAdmin`. Chế độ test nhận header `x-test-user` khi `NODE_ENV === "test"` — Phase 1
- ✓ API công khai: health, products, sales/active, sales/:id (`remaining` đọc theo `sale.mode`) — Phase 2
- ✓ API mua `POST /sales/:id/buy?mode=v0|v1|v2`: phần kiểm tra chung, mã trả về thống nhất giữa 3 phiên bản (201/409/409/400/503) — Phase 2
- ✓ V0 ngây thơ (đọc rồi `$inc`, tồn kho có thể âm), V1 `findOneAndUpdate` nguyên tử có hoàn kho, V2 Lua (`defineCommand`) có hoàn kho bằng `multi()` — Phase 2
- ✓ API `/orders/me`, admin reset, admin stats (tồn kho Mongo, tồn kho Redis, số đơn, số user khác nhau, số đơn vượt) — Phase 2
- ✓ Script đối chiếu Redis–MongoDB, có tùy chọn sửa Redis theo MongoDB — Phase 2
- ✓ Thư viện tải dùng chung và thí nghiệm E1–E4 tự kiểm tra; CSV chính thức do người dùng chạy và commit: 15 lượt E1 PASS, 10 lượt E3 PASS, 60 dòng E2 VALID, E4 PASS và đối soát sạch sau sửa — Phase 3 (EXP-01…EXP-08)
- ✓ Frontend React 19: trang chủ, đợt sale với đếm ngược và polling, đăng nhập/đăng ký, đơn cá nhân và trang theo dõi admin; giao diện được duyệt cho demo — Phase 4 (WEB-01…WEB-07)
- ✓ Script `start`/`stop` cho PowerShell 5.1 và Bash; Windows đạt 10 ca bắt buộc, Bash đã kiểm tra cú pháp và chạy vòng đời qua WSL. Chưa chạy trực tiếp trên macOS — Phase 4 (DEV-01…DEV-05)

### Active

- [ ] Biểu đồ so sánh V1 với V2 từ kết quả E2
- [ ] README chạy được từ đầu. Tài liệu phân tích kết quả E1–E4 trong `docs/` để dùng cho báo cáo (trả lời 3 câu hỏi ở SPECS mục 2 bằng số liệu, nêu đánh đổi và rủi ro)

### Out of Scope

- Thanh toán. Ngoài trọng tâm của môn CSDL phi quan hệ
- Giữ chỗ có thời hạn (V3). Không có trong SPECS, chỉ làm khi được hỏi
- WebSocket. Polling 1–2 giây là đủ cho demo
- Redis Cluster. Chạy standalone, tên khóa không dùng `{}`
- Hàng đợi (queue). Ngoài phạm vi so sánh V0/V1/V2
- Nhiều đợt sale chạy song song. Mỗi lần đo chỉ một đợt
- Đóng gói backend và frontend vào Docker. Docker chỉ chạy MongoDB và Redis
- MongoDB transaction. MongoDB chạy standalone. Khoảnh khắc "hết hàng giả" ở V1 là đánh đổi để bàn luận, không cần sửa

## Context

- Môn Cơ sở dữ liệu phi quan hệ, hướng "ứng dụng web + MongoDB" và "tìm hiểu NoSQL và ứng dụng". Đồ án cần thể hiện hai loại NoSQL: key-value (Redis) và document (MongoDB, `attributes` linh hoạt theo loại hàng), kèm lý do chọn từng loại.
- Nguyên tắc kiến trúc: MongoDB là nguồn dữ liệu gốc, Redis chỉ là lớp xử lý nhanh. Bắt đầu đợt sale thì nạp kho vào Redis, kết thúc thì đối chiếu lại.
- Ba câu hỏi phải trả lời bằng số liệu: cách nào không bán quá khi đồng thời; Redis nhanh hơn bao nhiêu so với chỉ dùng MongoDB; phải chấp nhận rủi ro gì (mất đồng bộ, mất khoảng 1 giây dữ liệu khi Redis sập với AOF `everysec`) và xử lý ra sao.
- Lần làm trước đã xác nhận một số điều: `redis.defineCommand` chạy được với ioredis 6; Lua cho đúng 100/1.000 trên kho 100; autocannon `requests` làm các kết nối lặp lại cùng user (4 kết nối, 12 request chỉ ra 3 user), nên E1 phải dùng script Node riêng.
- Môi trường: Windows 11, PowerShell, Node 24.22.1, npm 11.19.1, Docker 29.7.2. Docker Desktop không tự khởi động. Máy không có `mongosh` hay `redis-cli`, phải dùng qua `docker exec flashsale-mongo` / `flashsale-redis`.
- **Cổng 27017 là dịch vụ Windows `MongoDB` có sẵn.** Kết nối nhầm vào đó vẫn chạy nhưng sai dữ liệu. Không được động vào dịch vụ này.
- Đường dẫn dự án có dấu tiếng Việt và khoảng trắng (`C:\Dữ liệu của ổ D\...`). Đọc file Lua bằng `readFileSync(new URL(..., import.meta.url))`, không dùng `URL.pathname`.
- Bắn tải và server chạy chung một máy qua lớp mạng Docker Desktop, nên số liệu chỉ để so sánh tương đối. Khoảng cách V1–V2 có thể nhỏ, và đó vẫn là kết quả hợp lệ.

## Constraints

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

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Làm lại từ đầu theo `docs/SPECS.md`, GSD dẫn dắt | SPECS là nguồn yêu cầu duy nhất. Mã cũ bỏ đi | — Pending |
| Giữ `flash_sales.mode` làm chế độ của đợt sale; `GET /sales/:id` trả `remaining` từ Redis hoặc MongoDB theo `sale.mode`; UI mua theo `sale.mode`; script tải vẫn dùng `?mode=` | V2 không giảm `remainingQty`, nên hiển thị phải biết đọc ở đâu | ✓ Good — Phase 2 (READ-03) |
| Cache phần tĩnh của đợt sale (`salePrice`, `productId`, `startAt`, `endAt`, `status`) trong bộ nhớ Node, dùng chung cho V0/V1/V2, xóa khi reset; không cache `remainingQty` | Nếu chỉ V2 được cache thì so sánh hiệu năng không công bằng | ✓ Good — Phase 2 (một cache dùng chung, reset qua API xóa cache) |
| `stock_movements` chỉ ghi khi bù trừ và khi reset, không ghi trong đường mua | Tránh thêm một lần ghi Mongo làm lệch số đo. Đơn thành công đã có trong `orders` | ✓ Good — Phase 2 |
| E1 dùng script Node riêng (`fetch` + `Promise.all`); E2 dùng autocannon | autocannon `requests` phân phối user sai, unique index che mất lỗi của V0 | ✓ Good — Phase 3: CSV chính thức E1/E2 đã xác minh |
| Không dùng MongoDB transaction ở V1 | MongoDB chạy standalone. Hoàn kho bằng `$inc` khi tạo đơn lỗi | ✓ Good — Phase 2 |
| GSD lập kế hoạch cả phần tài liệu phân tích kết quả cho báo cáo | Người dùng muốn GSD lo cả README và tài liệu kết quả E1–E4 | — Pending |
| E2 tự tính p95 từ `responseTime` của từng request | autocannon chỉ có p50/p90/p97.5/p99, không có p95; giữ đúng SPECS | ✓ Good — Phase 3: percentile nearest-rank, đo riêng còn hàng/hết hàng |
| Đổi `sale.mode` qua reset: `POST /admin/sales/:id/reset` nhận `{ mode }`, seed/CLI reset nhận `--mode` | SPECS không có cách đổi mode; cần cho demo UI và để `remaining` khớp với lần bắn tải | — Pending |
| JSON lỗi có thêm trường `code` máy đọc được (`SOLD_OUT`, `ALREADY_BOUGHT`…), HTTP status giữ theo SPECS | Hai trường hợp 409 chỉ khác nhau ở thông báo tiếng Việt | ✓ Good — Phase 2 |
| Lỗi tạo đơn không phải E11000 thì kiểm tra `Order.exists` trước khi hoàn kho (V1, V2); V2 gặp E11000 chỉ `INCRBY`, không `SREM` | Tránh hoàn kho dư khi ghi đơn mơ hồ (timeout nhưng đã ghi) | ⚠️ Revisit — Phase 2: chấp nhận là rủi ro còn lại (UAT WR-01), ghi vào tài liệu rủi ro Phase 5 |
| Script tải luôn reset qua API admin; CLI reset in cảnh báo về cache | Cache đợt sale nằm trong tiến trình server, CLI không xóa được | ✓ Good — Phase 3: preflight và reset trước mỗi lượt đo |
| Ghim `react-router@^7` | `@latest` là v8, cần Node ≥22.22, phá `engines` của SPECS | ✓ Good — Phase 4: trình duyệt và build đã xác minh |
| Đưa cả 4 mục có thể cắt (E4, biểu đồ web, trang admin, polling) vào v1, giữ thứ tự cắt của SPECS | Người dùng để Claude chọn; đúng phạm vi SPECS, cắt khi thiếu thời gian | — Pending |
| `start:test` dùng `dotenv run -q --override -f .env.test` thay cho `node --env-file` | `--env-file` không ghi đè biến shell đang giữ (cmd `set NODE_ENV=test && …` để lại `"test "`); `-q` giữ boot-failure một dòng | ✓ Good — Phase 1 (UAT G-01-9) |
| `isTestMode` so sánh thô `NODE_ENV === "test"`; `/api/health` có `testMode`, script tải kiểm tra `testMode === true` | Fail-closed khi NODE_ENV có dấu cách thừa; near-miss chỉ in `[CẢNH BÁO]` | ✓ Good — Phase 1 |
| Service reset là factory `createSaleAdminService({ redis, onSaleReset })` | CLI truyền hook rỗng, route Phase 2 truyền `saleCache.invalidate` | ✓ Good — Phase 2 (route admin truyền `saleCache.invalidate`) |
| `backend/.env` tạo tay bằng lệnh không in khóa trong header `.env.example`; DEV-01 tự động hóa ở Phase 4 | Không commit bí mật, không ghi đè | ✓ Good — Phase 4: fixture và nghiệm thu Windows xác nhận |
| `?mode=` lấy từ query, không chặn khi khác `sale.mode` (D-03) | Script tải cần chọn mode độc lập. Bảo đảm V1/V2 chỉ đúng khi mọi lượt mua dùng đúng mode của đợt sale | ⚠️ Revisit — chấp nhận ở UAT Phase 2 (WR-04); báo cáo phải nêu điều kiện này |
| Giữ mặc định ioredis `autoResendUnfulfilledCommands: true` | Chấp nhận ở UAT Phase 2 (WR-02); sau khi kết nối lại có thể gửi lại `INCRBY` hoàn kho hoặc `EVALSHA` | ⚠️ Revisit — cân nhắc trước E4, ghi vào tài liệu rủi ro Phase 5 |
| Lỗi nghiệp vụ 409/503 trong đường mua dùng `HttpError` dựng sẵn | Không chụp stack trace dưới tải | ✓ Good — Phase 2 |
| E2 kết luận theo tính đúng, không theo tốc độ; khi có lỗi thật chỉ yêu cầu không bán quá và ghi rõ kho chưa hết (D-25 sửa đổi) | Tránh dùng kết quả hiệu năng làm điều kiện PASS và tránh coi timeout là bằng chứng đơn chưa được tạo | ✓ Good — Phase 3: CSV chính thức đủ 60 dòng VALID, không có lỗi thật |
| E4 chấp nhận lệch trước sửa chỉ theo hướng bán thiếu, không thiếu buyer, không bán quá; phải `reconcile --fix` và kiểm tra lại sạch (D-29 sửa đổi) | MongoDB là nguồn dữ liệu gốc; sự cố có thể để lại lượt giữ kho Redis chưa tạo được đơn | ✓ Good — Phase 3: 408/1.000 đơn, lệch 74 đơn vị bán thiếu; sửa và đối soát lại sạch |
| Lượt đo chính thức do người dùng chạy trên máy của mình; smoke của agent không thay thế kết quả chính thức (D-33) | Giữ nguồn gốc số liệu và điều kiện đo thống nhất cho báo cáo | ✓ Good — Phase 3: E1/E2/E3 ở `e07e0db`, E4 ở `8f08e3c` |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-11-19 after Phase 4*
