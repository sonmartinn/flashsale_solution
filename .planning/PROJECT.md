# Flash Sale chống bán quá số lượng (Redis + MongoDB)

## What This Is

Đồ án môn Cơ sở dữ liệu phi quan hệ với đề tài: **Nghiên cứu Redis và MongoDB trong xây dựng hệ thống flash sale chống bán quá số lượng, ứng dụng cho shop thời trang**. Sản phẩm là một ứng dụng web flash sale (Express 5 + React 19). API mua hàng có 3 cách xử lý tồn kho: V0 ngây thơ, V1 dùng MongoDB nguyên tử, V2 dùng Redis + Lua. Kèm theo là bộ script bắn tải để chứng minh bằng số liệu rằng V0 bán quá còn V1, V2 không bao giờ bán quá, và để so sánh hiệu năng V1 với V2. Người dùng là nhóm sinh viên làm đồ án và giảng viên chấm (demo + báo cáo).

Nguồn yêu cầu duy nhất là `docs/SPECS.md`. Dự án **làm lại từ đầu** theo file này. Mã cũ ở commit `40dea55` không được khôi phục.

## Core Value

Dưới tải đồng thời, V1 và V2 **luôn** cho đúng `totalQty` đơn thành công, mỗi người tối đa 1 đơn, còn V0 bán quá. Điều này phải được chứng minh lặp lại bằng thí nghiệm E1 có số liệu.

## Requirements

### Validated

(Chưa có. Cần ship để xác nhận)

### Active

- [ ] Hạ tầng: Docker Compose chỉ chạy MongoDB 7 (cổng `127.0.0.1:27018`) và Redis 7 bật AOF `everysec` (cổng `127.0.0.1:6379`)
- [ ] Backend TypeScript strict (Express 5, Mongoose 9, ioredis 6, ES modules NodeNext). Server thoát với thông báo rõ ràng khi thiếu `JWT_SECRET`, không kết nối được Mongo hoặc Redis, hoặc cổng bị chiếm
- [ ] 5 collection có index đúng theo SPECS mục 6 (`users`, `products`, `flash_sales`, `orders`, `stock_movements`). Unique `(saleId, userId)`. `remainingQty` không có `min`
- [ ] Script seed (1.000 user + 1 admin, 6 sản phẩm thời trang có `attributes` khác nhau, 1 đợt sale, kho nhận qua tham số) và script reset đợt sale (MongoDB + Redis `multi()` + xóa cache)
- [ ] Đăng ký, đăng nhập JWT (hạn 7 ngày, payload `sub` + `role`). `requireAuth` không tra MongoDB, có `requireAdmin`. Chế độ test nhận header `x-test-user` khi `NODE_ENV === "test"`
- [ ] API công khai: health, products, sales/active, sales/:id (`remaining` đọc theo `sale.mode`)
- [ ] API mua `POST /sales/:id/buy?mode=v0|v1|v2`: phần kiểm tra chung, mã trả về thống nhất giữa 3 phiên bản (201/409/409/400/503)
- [ ] V0 ngây thơ (đọc rồi `$inc`, tồn kho có thể âm), V1 `findOneAndUpdate` nguyên tử có hoàn kho, V2 Lua (`defineCommand`) có hoàn kho bằng `multi()`
- [ ] API `/orders/me`, admin reset, admin stats (tồn kho Mongo, tồn kho Redis, số đơn, số user khác nhau, số đơn vượt)
- [ ] Script đối chiếu Redis–MongoDB, có tùy chọn sửa Redis theo MongoDB
- [ ] Frontend: trang chủ, trang đợt sale (đếm ngược, polling 1–2 giây, nút mua, thông báo theo mã), đăng nhập/đăng ký, đơn của tôi, trang theo dõi admin cập nhật liên tục
- [ ] Thí nghiệm E1 (tính đúng, script Node riêng, tự kiểm tra số user khác nhau), E2 (hiệu năng V1 với V2 bằng autocannon, 100/300/500 kết nối), E3 (mua trùng), E4 tùy chọn (ngắt MongoDB giữa chừng). Mỗi thí nghiệm có CSV tổng hợp được đưa lên git
- [ ] Biểu đồ so sánh V1 với V2 từ kết quả E2
- [ ] Script khởi chạy nhanh môi trường dev `scripts/start|stop.ps1` (Windows PowerShell 5.1) và `scripts/start|stop.sh` (macOS bash 3.2), cùng hành vi, chạy nền, idempotent, đạt các ca kiểm thử ở SPECS mục 12
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
| Giữ `flash_sales.mode` làm chế độ của đợt sale; `GET /sales/:id` trả `remaining` từ Redis hoặc MongoDB theo `sale.mode`; UI mua theo `sale.mode`; script tải vẫn dùng `?mode=` | V2 không giảm `remainingQty`, nên hiển thị phải biết đọc ở đâu | — Pending |
| Cache phần tĩnh của đợt sale (`salePrice`, `productId`, `startAt`, `endAt`, `status`) trong bộ nhớ Node, dùng chung cho V0/V1/V2, xóa khi reset; không cache `remainingQty` | Nếu chỉ V2 được cache thì so sánh hiệu năng không công bằng | — Pending |
| `stock_movements` chỉ ghi khi bù trừ và khi reset, không ghi trong đường mua | Tránh thêm một lần ghi Mongo làm lệch số đo. Đơn thành công đã có trong `orders` | — Pending |
| E1 dùng script Node riêng (`fetch` + `Promise.all`); E2 dùng autocannon | autocannon `requests` phân phối user sai, unique index che mất lỗi của V0 | — Pending |
| Không dùng MongoDB transaction ở V1 | MongoDB chạy standalone. Hoàn kho bằng `$inc` khi tạo đơn lỗi | — Pending |
| GSD lập kế hoạch cả phần tài liệu phân tích kết quả cho báo cáo | Người dùng muốn GSD lo cả README và tài liệu kết quả E1–E4 | — Pending |
| E2 tự tính p95 từ `responseTime` của từng request | autocannon chỉ có p50/p90/p97.5/p99, không có p95; giữ đúng SPECS | — Pending |
| Đổi `sale.mode` qua reset: `POST /admin/sales/:id/reset` nhận `{ mode }`, seed/CLI reset nhận `--mode` | SPECS không có cách đổi mode; cần cho demo UI và để `remaining` khớp với lần bắn tải | — Pending |
| JSON lỗi có thêm trường `code` máy đọc được (`SOLD_OUT`, `ALREADY_BOUGHT`…), HTTP status giữ theo SPECS | Hai trường hợp 409 chỉ khác nhau ở thông báo tiếng Việt | — Pending |
| Lỗi tạo đơn không phải E11000 thì kiểm tra `Order.exists` trước khi hoàn kho (V1, V2); V2 gặp E11000 chỉ `INCRBY`, không `SREM` | Tránh hoàn kho dư khi ghi đơn mơ hồ (timeout nhưng đã ghi) | — Pending |
| Script tải luôn reset qua API admin; CLI reset in cảnh báo về cache | Cache đợt sale nằm trong tiến trình server, CLI không xóa được | — Pending |
| Ghim `react-router@^7` | `@latest` là v8, cần Node ≥22.22, phá `engines` của SPECS | — Pending |
| Đưa cả 4 mục có thể cắt (E4, biểu đồ web, trang admin, polling) vào v1, giữ thứ tự cắt của SPECS | Người dùng để Claude chọn; đúng phạm vi SPECS, cắt khi thiếu thời gian | — Pending |

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
*Last updated: 2026-11-03 after initialization*
