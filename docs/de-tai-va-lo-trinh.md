# Đồ án cuối kì – Cơ sở dữ liệu phi quan hệ

## Tên đề tài

**Nghiên cứu Redis và MongoDB trong xây dựng hệ thống flash sale chống bán quá số lượng – ứng dụng cho shop thời trang**

- Nhóm: 2 sinh viên
- Công nghệ: Node.js, TypeScript, MongoDB, Redis, React
- Hướng đề tài (theo `../instructions_docs/huong dan bai tap lon.docx`): *Mô phỏng ứng dụng web và MongoDB* + *Tìm hiểu NoSQL và ứng dụng*

> **Giả định cần xác nhận:** nhóm dự đoán báo cáo vào khoảng **21–27/12/2026** (chưa có lịch chính thức). Lộ trình ở mục 10 tính theo **6 tuần, từ 2/11 đến 13/12**, phần còn lại đến ngày báo cáo là thời gian đệm. Cập nhật lại các mốc khi giáo viên chốt ngày.

---

## 1. Bài toán và mục tiêu

### Bài toán
Trong một đợt flash sale, hàng nghìn người cùng bấm "Mua" cho một sản phẩm chỉ có vài chục hoặc vài trăm chiếc. Nếu hệ thống đọc tồn kho rồi mới trừ (đọc rồi ghi, không nguyên tử), nhiều request cùng thấy "còn hàng" và cùng trừ → **bán quá số lượng**, tồn kho âm.

### Mục tiêu
1. Trình bày cơ sở lý thuyết về NoSQL, đặc biệt **key-value (Redis)** và **document (MongoDB)**.
2. Thiết kế và xây dựng ứng dụng flash sale cho shop thời trang, với ba cách xử lý tồn kho (V0, V1, V2).
3. **Chứng minh bằng thực nghiệm**: V0 bán quá số lượng; V1 và V2 thì không; V2 nhanh hơn V1 bao nhiêu và đánh đổi điều gì.

### Câu hỏi nghiên cứu
- Cách nào đảm bảo không bán quá số lượng khi nhiều người mua đồng thời?
- Dùng Redis làm lớp xử lý nhanh cải thiện hiệu năng bao nhiêu so với chỉ dùng MongoDB?
- Đổi lại phải chấp nhận rủi ro gì (mất đồng bộ, mất dữ liệu khi Redis sập) và xử lý ra sao?

---

## 2. Phạm vi (đã rút gọn cho nhóm 2 người)

### Có làm
- Đăng ký/đăng nhập đơn giản (JWT), vai trò `user` và `admin`.
- Danh sách sản phẩm; trang đợt flash sale có đồng hồ đếm ngược và số còn lại (polling mỗi 1–2 giây).
- API mua hàng ở 3 chế độ: **V0, V1, V2** (chọn qua tham số `mode`).
- Trang "Đơn hàng của tôi".
- Trang theo dõi (admin): tồn kho MongoDB, tồn kho Redis, số đơn, số đơn vượt (oversold), nút reset đợt sale.
- Bộ script bắn tải + biểu đồ kết quả.

### Không làm (ghi vào "hướng phát triển")
- Thanh toán thật hoặc giả lập luồng thanh toán.
- Giữ chỗ có thời hạn tự hoàn kho (V3).
- WebSocket (dùng polling thay thế).
- Redis Cluster, hàng đợi (queue), nhiều đợt sale chạy song song.

---

## 3. Ba phiên bản xử lý mua hàng

| Phiên bản | Cách làm | Kết quả kỳ vọng |
|---|---|---|
| **V0 – ngây thơ** | `findOne` đọc tồn kho → nếu đủ hàng thì `updateOne` với `$inc: { remainingQty: -qty }` → tạo đơn. Bước kiểm tra và bước trừ tách rời nên có race condition. | Bán quá số lượng, tồn kho âm. Dùng để chứng minh lỗi. |
| **V1 – MongoDB nguyên tử** | Một lệnh `findOneAndUpdate({ _id, remainingQty: { $gte: qty } }, { $inc: { remainingQty: -qty } })`; kết quả `null` = hết hàng. Chặn mua trùng bằng **unique index** `(saleId, userId)` trên `orders`. | Không bán quá. Mọi request cùng đè lên một document nên chậm hơn V2. |
| **V2 – Redis + Lua** | Script Lua kiểm tra người đã mua (Set) và trừ tồn kho trong một bước nguyên tử; thành công mới ghi đơn vào MongoDB. Nếu ghi MongoDB lỗi thì **hoàn kho Redis** (compensation). | Không bán quá, nhanh nhất. Cần đối chiếu lại với MongoDB. |

Script Lua cho V2 (tham khảo):

```lua
-- KEYS[1] = stock:<saleId>, KEYS[2] = buyers:<saleId>
-- ARGV[1] = userId, ARGV[2] = qty
if redis.call('SISMEMBER', KEYS[2], ARGV[1]) == 1 then return -1 end   -- đã mua
local stock = tonumber(redis.call('GET', KEYS[1]))
if stock == nil or stock < tonumber(ARGV[2]) then return 0 end         -- hết hàng
redis.call('DECRBY', KEYS[1], ARGV[2])
redis.call('SADD', KEYS[2], ARGV[1])
return 1                                                               -- thành công
```

Nguyên tắc: **MongoDB là nguồn dữ liệu gốc**, Redis chỉ là lớp xử lý nhanh. Khi bắt đầu đợt sale thì nạp tồn kho vào Redis; khi kết thúc thì đối chiếu lại.

Lưu ý: không dùng khóa phân tán tự chế (lock hết hạn dưới tải rồi bị nhả nhầm là lỗi hay gặp).

---

## 4. Thiết kế dữ liệu

### MongoDB (document, nguồn dữ liệu gốc)

| Collection | Trường chính | Ghi chú |
|---|---|---|
| `users` | `_id`, `name`, `email` (unique), `passwordHash`, `role`, `createdAt` | |
| `products` | `_id`, `name`, `slug`, `category`, `images[]`, `price`, `attributes` (size[], color[], chất liệu… linh hoạt theo loại hàng) | Thể hiện schema linh hoạt |
| `flash_sales` | `_id`, `productId`, `salePrice`, `totalQty`, `remainingQty`, `perUserLimit` (=1), `startAt`, `endAt`, `status`, `mode` | `remainingQty` dùng cho V0/V1 |
| `orders` | `_id`, `userId`, `saleId`, `productId`, `qty`, `price`, `status`, `mode`, `createdAt` | Unique index `(saleId, userId)` |
| `stock_movements` | `_id`, `saleId`, `orderId`, `delta`, `reason`, `at` | Nhật ký biến động kho, dùng kiểm chứng |

Index đề xuất: `orders(saleId, userId)` unique, `flash_sales(status, startAt)`, `orders(userId, createdAt)`.

### Redis (key-value)

| Key | Kiểu | Mục đích |
|---|---|---|
| `stock:<saleId>` | String (số nguyên) | Tồn kho cho V2 |
| `buyers:<saleId>` | Set | Người đã mua, chặn mua trùng |

> Mỗi lần chạy thí nghiệm cần reset cả Mongo và Redis về trạng thái ban đầu (script `reset`).

---

## 5. Kiến trúc và công nghệ

```
React (Vite)  ──HTTP──►  Node.js / Express API  ──►  MongoDB   (dữ liệu gốc)
 (user/admin)                  │
                               └──────────────────►  Redis     (stock, buyers)
Script bắn tải (autocannon/k6) ──HTTP──► API
```

- Backend: Node.js, TypeScript, Express, Mongoose, ioredis, JWT, bcrypt.
- Frontend: React (Vite), TypeScript, React Router, thư viện biểu đồ (ví dụ Recharts).
- Chạy hạ tầng: **Docker Compose** (MongoDB + Redis). Redis không chạy trực tiếp trên Windows, dùng Docker hoặc WSL.
- Bắn tải: autocannon (cài bằng npm, tiện với Node) hoặc k6.
- Quản lý mã nguồn: GitHub (cần để nộp link).

### Cấu trúc thư mục đề xuất

```
flashsale/
├─ docker-compose.yml
├─ backend/
│  ├─ src/{config,models,routes,controllers,services,middlewares,lua}/
│  └─ scripts/{seed.ts,reset.ts}
├─ frontend/
│  └─ src/{pages,components,services}/
├─ loadtest/
│  ├─ scenarios/   (E1, E2, E3)
│  └─ results/     (csv/json, biểu đồ)
└─ docs/           (tài liệu dự án, báo cáo, slide, biểu đồ)
```

---

## 6. API chính

| Method | Đường dẫn | Mô tả |
|---|---|---|
| POST | `/api/auth/register`, `/api/auth/login` | Đăng ký, đăng nhập |
| GET | `/api/products`, `/api/products/:id` | Sản phẩm |
| GET | `/api/sales/active`, `/api/sales/:id` | Đợt sale và số còn lại |
| POST | `/api/sales/:id/buy?mode=v0\|v1\|v2` | Mua hàng |
| GET | `/api/orders/me` | Đơn của tôi |
| POST | `/api/admin/sales/:id/reset` | Nạp lại kho Mongo + Redis, xóa đơn của đợt |
| GET | `/api/admin/sales/:id/stats` | Tồn kho Mongo, Redis, số đơn, số đơn vượt |

Khi chạy test tải, bật chế độ test (`NODE_ENV=test`) cho phép gửi `x-test-user` để giả lập nhiều người dùng mà không cần đăng nhập thật.

---

## 7. Thí nghiệm (phần quan trọng nhất của Chương 3)

| Mã | Mục tiêu | Cách đo |
|---|---|---|
| **E1 – Tính đúng** | Chứng minh V0 bán quá, V1/V2 không | Kho 100, 1.000 người dùng khác nhau cùng mua. Ghi: số đơn thành công, tồn kho cuối, số đơn vượt (= đơn − 100). Lặp 5 lần mỗi phiên bản. |
| **E2 – Hiệu năng** | So V1 với V2 | Kho 1.000, nhiều mức đồng thời (ví dụ 100/300/500 kết nối). Ghi: request/giây, độ trễ p50/p95, tỷ lệ lỗi. |
| **E3 – Mua trùng** | Kiểm tra giới hạn 1 đơn/người | 1 người gửi 10 request cùng lúc. V1 dùng unique index, V2 dùng Set. |
| **E4 – Lỗi giữa chừng (tùy chọn)** | Kiểm tra bù trừ của V2 | Ngắt MongoDB khi đang bán, kiểm tra Redis và đơn hàng có khớp sau khi hoàn kho không. |

Lưu ý khi trình bày: số liệu đo trên một máy cá nhân chỉ để so sánh **tương đối** giữa các phiên bản, không so với con số trong blog.

---

## 8. Cấu trúc báo cáo (theo mẫu trong `Trang bia va huong dan noi dung.docx`)

- Bìa, Lời mở đầu, Mục lục
- **Chương 1. Cơ sở lý thuyết** – NoSQL là gì, 4 loại (key-value, column, document, graph), so sánh với RDBMS; Redis (kiểu dữ liệu, Lua, tính nguyên tử, lưu bền AOF/RDB); MongoDB (document, index, thao tác nguyên tử trên một document); CAP/BASE; race condition.
- **Chương 2. Phân tích thiết kế hệ thống (dùng NoSQL)** – bài toán, yêu cầu chức năng, kiến trúc, thiết kế dữ liệu MongoDB và Redis, thiết kế ba phiên bản V0/V1/V2, lý do chọn từng loại NoSQL.
- **Chương 3. Ứng dụng NoSQL trên hệ thống flash sale** – cài đặt, giao diện, thực nghiệm E1–E4, kết quả, bàn luận.
- **Kết luận và hướng phát triển** – V3 giữ chỗ có thời hạn, thanh toán, Redis Cluster, hàng đợi, WebSocket.
- **Bảng công việc** của từng thành viên.

---

## 9. Phân công (2 người)

| Việc | Người A (backend + thí nghiệm) | Người B (giao diện + dữ liệu + báo cáo) |
|---|---|---|
| Hạ tầng Docker, repo | ✔ | |
| Seed dữ liệu, thiết kế schema | cùng làm | cùng làm |
| API auth, products, sales | ✔ | |
| API mua V0, V1, V2, script Lua, bù trừ | ✔ | |
| Script bắn tải, thu số liệu E1–E4 | ✔ | |
| Giao diện React (danh sách, trang sale, đơn hàng, trang theo dõi) | | ✔ |
| Biểu đồ kết quả | | ✔ |
| Chương 1, 2 | cùng viết | cùng viết |
| Chương 3, kết luận | ✔ (thực nghiệm) | ✔ (trình bày, hình) |
| Slide, video demo, README | | ✔ |

---

## 10. Lộ trình 6 tuần (2/11 – 13/12/2026)

Mục tiêu: **đóng băng mã nguồn ngày 6/12** và **có gói nộp đầy đủ ngày 13/12**. Thời gian từ 14/12 đến ngày báo cáo là đệm (tháng 12 thường trùng lịch thi các môn khác): chỉ tập thuyết trình và xử lý lỗi phát sinh, không thêm tính năng mới.

| Tuần | Ngày | Mục tiêu | Sản phẩm bàn giao (mốc) |
|---|---|---|---|
| **1** | 2–8/11 | Dựng Docker (MongoDB + Redis), khởi tạo repo backend và frontend, thiết kế schema, viết script seed, làm auth và API sản phẩm/sale. Bắt đầu Chương 1. | **M1:** hạ tầng chạy được, schema chốt, seed ~1.000 user và vài sản phẩm |
| **2** | 9–15/11 | **API mua V0**, script reset, script bắn tải đầu tiên, **V1** (findOneAndUpdate + unique index). Giao diện: đăng nhập, danh sách sản phẩm. | **M2:** E1 cho thấy **V0 bán quá số lượng** (điểm nhấn của báo cáo), V1 không bán quá |
| **3** | 16–22/11 | **V2** (Lua + bù trừ), API admin stats/reset. Giao diện: trang sale (đếm ngược, số còn lại), đơn hàng. Hoàn thành Chương 1. | **M3:** E1 đạt "không bán quá" ở V2, demo chạy trọn luồng mua |
| **4** | 23–29/11 | Chạy E1–E3 đủ số lần, thu số liệu, vẽ biểu đồ. Giao diện: trang theo dõi. E4 (tùy chọn). Viết Chương 2. | **M4:** đủ số liệu thực nghiệm chính |
| **5** | 30/11–6/12 | Sửa lỗi, đối chiếu Redis–Mongo, viết Chương 3 và kết luận. **Đóng băng mã nguồn 6/12.** | **M5:** báo cáo nháp đầy đủ, bản demo ổn định |
| **6** | 7–13/12 | Hoàn thiện báo cáo, làm slide, quay video demo, viết README, dump JSON, dọn repo, bảng phân công. Nhờ một người ngoài thử cài theo README. In tài liệu nộp ngày thi, tập thuyết trình. | **M6:** gói nộp đầy đủ, sẵn sàng báo cáo |

Lưu ý: V3 (giữ chỗ có thời hạn) không nằm trong lộ trình 6 tuần, chỉ ghi vào hướng phát triển.

### Nếu hạn nộp sớm hơn dự đoán (chỉ còn khoảng 4 tuần)
Gộp tuần 1–2 làm một, bỏ E4, bỏ trang theo dõi chi tiết (chỉ giữ reset và stats dạng JSON), dùng giao diện tối giản.

### Thứ tự cắt bỏ khi thiếu thời gian (cắt từ trên xuống)
1. E4 (lỗi giữa chừng)
2. Biểu đồ trực tiếp trên web (chỉ xuất biểu đồ từ kết quả đo)
3. Trang theo dõi (giữ API stats)
4. Polling tự động (làm nút làm mới)

**Không được cắt:** V0 (chứng minh lỗi), V1, V2, thí nghiệm E1 và E2, báo cáo 3 chương.

---

## 11. Rủi ro và cách xử lý

| Rủi ro | Xử lý |
|---|---|
| Không tái hiện được bán quá ở V0 | Tăng mức đồng thời, thêm một khoảng trễ nhỏ giữa bước đọc và ghi (ghi rõ trong báo cáo), chạy lặp nhiều lần |
| Mất đồng bộ Redis–MongoDB sau lỗi | Bù trừ khi ghi MongoDB lỗi; viết script đối chiếu; ghi `stock_movements` |
| Redis mất dữ liệu khi sập | Bật AOF khi chạy Docker; MongoDB là nguồn gốc nên nạp lại được. Trình bày trong bàn luận |
| Số liệu đo dao động | Chạy mỗi cấu hình ít nhất 5 lần, báo cáo trung bình và độ lệch |
| Thiếu giao diện | Dựng trang theo dõi để lúc demo chạy test tải sẽ thấy bộ đếm tụt về 0 |
| Thiếu thời gian | Dùng thứ tự cắt bỏ ở mục 10 |

---

## 12. Gói nộp ngày thi (theo `File in ra nop trong ngay thi...docx`)

- [ ] Bảng phân công chức năng theo từng thành viên (MSSV, họ tên, email, SĐT, chức năng đã làm)
- [ ] Link GitHub (mã nguồn)
- [ ] Link video demo
- [ ] Dữ liệu mẫu: dump JSON của MongoDB (`mongoexport`/`mongodump`) và script seed
- [ ] Hướng dẫn cài đặt và chạy (file `README.md`, ghi rõ biến môi trường, lệnh Docker, cách chạy test tải)
- [ ] Báo cáo (bìa, 3 chương, bảng công việc) và slide

---

## 13. Tiêu chí hoàn thành

- Ứng dụng chạy được từ đầu đến cuối bằng hướng dẫn trong README.
- E1 cho thấy V0 vượt số lượng và V1, V2 không vượt trong tất cả các lần chạy.
- Có biểu đồ so sánh hiệu năng V1 và V2 kèm giải thích.
- Báo cáo nêu rõ lý do chọn Redis và MongoDB, thiết kế dữ liệu, các đánh đổi và hạn chế.
- Cả hai thành viên đều giải thích được toàn bộ luồng mua hàng và script Lua.

---

## 14. Tài liệu tham khảo ban đầu

- Redis + Lua trừ kho nguyên tử: https://oneuptime.com/blog/post/2026-01-21-redis-flash-sale-systems/view
- Dự án mẫu Node.js + Redis + Lua: https://github.com/SushanthMusham/flashflow
- Phòng tránh overbooking: https://yennj12.js.org/CS_basics/faqs/backend_overbooking_prevention.html
- Khóa phân tán Redis và lỗi bán quá: https://www.besthub.dev/articles/why-redis-distributed-locks-still-let-flash-sales-oversell-and-how-to-fix-it-73c037579597
- MongoDB thao tác nguyên tử: https://oneuptime.com/blog/post/2026-03-31-mongodb-atomic-operations-avoid-race-conditions/view
- Thiết kế hệ thống flash sale: https://nitinkc.github.io/SystemDesign-Revision/medium/37-flash-sale/
- Tài liệu nhóm đã có: `../instructions_docs/tham khao.rar` (4 PDF về NoSQL/MongoDB/Node.js), `demotham khao.rar` (Laptopshop MERN)

> Các nguồn trên là bài hướng dẫn cộng đồng, nên đối chiếu với tài liệu chính thức của Redis và MongoDB khi viết báo cáo.
