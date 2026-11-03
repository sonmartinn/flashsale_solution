# SPECS – Hệ thống flash sale chống bán quá số lượng

Đề tài: **Nghiên cứu Redis và MongoDB trong xây dựng hệ thống flash sale chống bán quá số lượng – ứng dụng cho shop thời trang.** Đồ án môn Cơ sở dữ liệu phi quan hệ, hướng "ứng dụng web + MongoDB" và "tìm hiểu NoSQL và ứng dụng".

File này là nguồn yêu cầu duy nhất của dự án. Mục 13 liệt kê các câu hỏi còn mở, cần hỏi trước khi tự quyết.

---

## 1. Bài toán

Một đợt flash sale có `totalQty` sản phẩm (ví dụ 100), hàng nghìn người cùng bấm "Mua". Nếu hệ thống đọc tồn kho rồi mới trừ, nhiều request cùng thấy "còn hàng" và cùng trừ, dẫn tới **bán quá số lượng** (tồn kho âm, số đơn lớn hơn `totalQty`).

Kết quả đúng: đúng `totalQty` đơn thành công, tồn kho về 0, mỗi người tối đa 1 đơn mỗi đợt.

## 2. Mục tiêu

1. Xây dựng ứng dụng flash sale có **3 cách xử lý tồn kho** (V0, V1, V2) cùng một API.
2. **Chứng minh bằng thực nghiệm:** V0 bán quá số lượng; V1 và V2 không bao giờ bán quá.
3. **Đo và so sánh hiệu năng** V1 (chỉ MongoDB) với V2 (Redis + MongoDB), nêu rõ đánh đổi.
4. Thể hiện hai loại NoSQL: **key-value (Redis)** và **document (MongoDB)**, với lý do chọn từng loại.

Câu hỏi cần trả lời bằng số liệu:

- Cách nào đảm bảo không bán quá khi nhiều người mua đồng thời?
- Redis cải thiện hiệu năng bao nhiêu so với chỉ dùng MongoDB?
- Đổi lại phải chấp nhận rủi ro gì (mất đồng bộ, mất dữ liệu khi Redis sập) và xử lý ra sao?

## 3. Phạm vi

### Trong phạm vi

- Đăng ký, đăng nhập (JWT), vai trò `user` và `admin`
- Danh sách sản phẩm, danh sách đợt sale đang mở
- Trang đợt sale: đếm ngược, số còn lại cập nhật bằng polling 1–2 giây, nút mua
- API mua hàng ở 3 chế độ V0, V1, V2
- Trang "Đơn hàng của tôi"
- Trang theo dõi cho admin: tồn kho MongoDB, tồn kho Redis, số đơn, số đơn vượt, nút reset đợt sale
- Script seed, reset, đối chiếu Redis–MongoDB
- Script bắn tải cho các thí nghiệm E1–E4 và file kết quả tổng hợp
- Script khởi chạy nhanh môi trường dev cho Windows và macOS (mục 12)

### Ngoài phạm vi

Thanh toán, giữ chỗ có thời hạn (V3), WebSocket, Redis Cluster, hàng đợi, nhiều đợt sale chạy song song, đóng gói backend và frontend vào Docker. Không làm những phần này nếu chưa được hỏi.

### Thứ tự ưu tiên

Không được cắt: **V0, V1, V2, E1, E2.**

Khi thiếu thời gian, cắt theo thứ tự: E4 → biểu đồ trực tiếp trên web → trang theo dõi (giữ API stats) → polling tự động (thay bằng nút làm mới).

### Mốc thời gian

Mã nguồn đóng băng ngày **6/12/2026**. Ngày báo cáo dự kiến 21–27/12/2026, chưa có lịch chính thức.

---

## 4. Công nghệ

| Phần | Lựa chọn |
|---|---|
| Ngôn ngữ | TypeScript `strict` cho cả backend và frontend |
| Backend | Node.js (`>=20.19.0`), Express 5, Mongoose 9, ioredis 6, jsonwebtoken, bcryptjs, cors, dotenv |
| Frontend | React 19, React Router 7, Vite 8 (Node `^20.19.0 \|\| >=22.12.0`) |
| CSDL | MongoDB 7 (nguồn dữ liệu gốc), Redis 7 bật AOF (`appendfsync everysec`) |
| Hạ tầng | Docker Compose chỉ chạy MongoDB và Redis. Backend và frontend chạy trực tiếp trên máy |
| Bắn tải | autocannon cho E2; script Node riêng (`fetch` + `Promise.all`) cho E1 |
| Biểu đồ | Thư viện biểu đồ React, ví dụ Recharts |

Quy ước mã:

- Backend dùng ES modules, `module: NodeNext`, nên import ghi đuôi `.js` dù file là `.ts`. Frontend ghi đúng đuôi `.ts`, `.tsx`.
- Express 5 tự bắt lỗi của handler async, không bọc try/catch. Lỗi nghiệp vụ ném `HttpError(status, message)`.
- Thông báo lỗi và chú thích bằng tiếng Việt.
- `tsx` và Vite không kiểm tra kiểu: một việc chỉ coi là xong khi `typecheck` đạt.

## 5. Kiến trúc

```
React (Vite :5173) ──/api proxy──► Express API (:5000) ──► MongoDB (:27018, dữ liệu gốc)
                                          │
                                          └──────────────► Redis (:6379, stock, buyers)
Script bắn tải ──HTTP──► Express API
```

Nguyên tắc: **MongoDB là nguồn dữ liệu gốc, Redis chỉ là lớp xử lý nhanh.** Khi bắt đầu đợt sale thì nạp tồn kho vào Redis; khi kết thúc thì đối chiếu lại với MongoDB.

Cấu trúc thư mục:

```
docker-compose.yml
.gitattributes    *.sh dùng LF, *.ps1 dùng CRLF
scripts/          start.ps1, stop.ps1 (Windows); start.sh, stop.sh (macOS)
.dev/             PID và log khi chạy nền (không lên git)
backend/
  src/{config,models,routes,controllers,services,middlewares,lua}/
  scripts/        seed, reset, đối chiếu
frontend/src/     pages, components, services
loadtest/
  scenarios/      E1–E4
  results/        file thô (không lên git) và CSV tổng hợp (lên git)
docs/
```

---

## 6. Thiết kế dữ liệu

### MongoDB

| Collection | Trường | Ràng buộc, index |
|---|---|---|
| `users` | `name`, `email`, `passwordHash`, `role` (`user` \| `admin`), `createdAt` | `email` unique, chữ thường |
| `products` | `name`, `slug`, `category`, `images[]`, `price`, `attributes` | `slug` unique. `attributes` là object tự do theo loại hàng (size, màu, chất liệu…), để thể hiện schema linh hoạt |
| `flash_sales` | `productId`, `salePrice`, `totalQty`, `remainingQty`, `perUserLimit` (=1), `startAt`, `endAt`, `status` (`scheduled` \| `active` \| `ended`), `mode` (`v0` \| `v1` \| `v2`) | Index `(status, startAt)`. `remainingQty` **không có `min`** để V0 có thể âm |
| `orders` | `userId`, `saleId`, `productId`, `qty`, `price`, `status` (`success` \| `cancelled`), `mode`, `createdAt` | Unique `(saleId, userId)`; index `(userId, createdAt desc)` |
| `stock_movements` | `saleId`, `orderId`, `delta`, `reason`, `at` | Index `(saleId, at)`. Nhật ký biến động kho |

Tên collection `flash_sales` và `stock_movements` phải đặt tường minh vì Mongoose tự đổi tên khác.

### Redis

| Key | Kiểu | Ý nghĩa |
|---|---|---|
| `stock:<saleId>` | String số nguyên | Tồn kho dùng cho V2 |
| `buyers:<saleId>` | Set các `userId` | Người đã mua, chặn mua trùng ở V2 |

Không có dấu `{}` trong tên khóa.

### Dữ liệu mẫu (seed)

- Xóa sạch database `flashsale` và Redis của container, rồi tạo lại
- 1.000 user và 1 admin, dùng chung một mật khẩu thử (băm bcrypt một lần)
- 6 sản phẩm thời trang với `attributes` khác nhau giữa các loại
- 1 đợt sale đang mở, mặc định 100 chiếc, giá bằng nửa giá gốc, kéo dài 7 ngày, đã nạp Redis
- Số lượng kho phải **nhận được qua tham số**, vì E2 cần kho lớn hơn

### Reset đợt sale

Dùng giữa các lần đo. Với một hoặc mọi đợt sale:

- `remainingQty = totalQty`
- Xóa `orders` và `stock_movements` của đợt
- Redis: đặt `stock:<saleId> = totalQty`, xóa `buyers:<saleId>`, trong một `multi()`
- Mở lại đợt sale: `status = active`, `startAt = bây giờ`, `endAt = bây giờ + 7 ngày`
- Xóa cache thông tin đợt sale trong bộ nhớ (nếu có, xem mục 13)

---

## 7. API

Tiền tố `/api`. Mọi phản hồi là JSON.

| Method | Đường dẫn | Quyền | Mô tả |
|---|---|---|---|
| GET | `/health` | công khai | `{ mongo, redis }`, 200 khi cả hai sống, ngược lại 503 |
| POST | `/auth/register` | công khai | Tạo tài khoản `user` |
| POST | `/auth/login` | công khai | Trả JWT |
| GET | `/products`, `/products/:id` | công khai | Sản phẩm |
| GET | `/sales/active` | công khai | Đợt sale đang mở, kèm thông tin sản phẩm |
| GET | `/sales/:id` | công khai | Chi tiết đợt sale và số còn lại |
| POST | `/sales/:id/buy?mode=v0\|v1\|v2` | user | Mua hàng, body `{ "qty": 1 }` |
| GET | `/orders/me` | user | Đơn của người đang đăng nhập |
| POST | `/admin/sales/:id/reset` | admin | Reset đợt sale như mục 6 |
| GET | `/admin/sales/:id/stats` | admin | Tồn kho MongoDB, tồn kho Redis, số đơn, số user khác nhau, số đơn vượt (`số đơn - totalQty` nếu dương) |

### Xác thực

- Token ký bằng `JWT_SECRET`, hạn 7 ngày, payload gồm `sub` (`userId`) và `role`.
- `JWT_SECRET` không có giá trị mặc định: thiếu thì server từ chối khởi động. `seed` và `reset` không cần biến này.
- `requireAuth` chỉ xác minh token, **không tra MongoDB**, để không thêm một lần đọc vào đường mua. Gắn `req.user = { id, role }`. Hệ quả cần chấp nhận: sau khi seed lại, token cũ vẫn hợp lệ nên phải đăng nhập lại.
- `requireAdmin` đặt sau `requireAuth`, áp chung cho mọi đường dẫn `/api/admin` bằng `router.use`.
- Đăng ký không cho phép client tự đặt `role`. Mọi trường đầu vào phải là chuỗi (chặn NoSQL injection). Email trùng trả 409.

### Chế độ test (bắn tải)

- Chỉ khi `NODE_ENV === "test"` (so sánh chính xác, kiểm tra ở một chỗ duy nhất), `requireAuth` nhận `userId` từ header `x-test-user` thay cho JWT.
- `x-test-user` chỉ kiểm tra định dạng ObjectId, không kiểm tra user tồn tại, luôn mang quyền `user`. Thao tác admin vẫn cần token thật.
- Chế độ này bỏ qua bước xác minh JWT, nên số đo không gồm chi phí đó. Phải nêu điều này khi trình bày kết quả.
- Bật bằng `npm run start:test`, nạp `backend/.env.test`. Cú pháp `NODE_ENV=test npm start` không chạy trên PowerShell.

### Mã lỗi

| Tình huống | Mã |
|---|---|
| ObjectId sai định dạng (`CastError`) | 400 |
| JSON hỏng trong body | 400, thông báo tiếng Việt |
| Dữ liệu không hợp lệ (`ValidationError`) | 400 |
| Trùng khóa unique (`E11000`) | 409 |
| Không có hoặc sai token | 401 |
| Không đủ quyền | 403 |
| Không tìm thấy | 404 |
| Lỗi khác | 500, không lộ chi tiết |

---

## 8. Mua hàng: V0, V1, V2

### Phần dùng chung (trước khi rẽ nhánh)

Thứ tự kiểm tra, giống nhau cho cả ba phiên bản:

1. `requireAuth` → có `userId`
2. `mode` thuộc `v0`, `v1`, `v2`, nếu không thì 400
3. `qty` phải đúng bằng `1`, nếu không thì 400. Không kiểm tra thì `qty = -5` làm **tăng** tồn kho ở cả V1 và V2
4. Đợt sale tồn tại (400 hoặc 404), đang `active` và nằm trong `[startAt, endAt]` (400)
5. Gọi `buyHandlers[mode]({ saleId, userId, qty })`

Mã trả về phải **thống nhất giữa ba phiên bản** để so sánh được:

| Kết quả | Mã |
|---|---|
| Thành công | 201, trả đơn hàng |
| Hết hàng | 409 |
| Đã mua rồi | 409, thông báo khác hết hàng |
| Đợt sale chưa mở hoặc đã kết thúc | 400 |
| V2: Redis chưa nạp kho | 503 |

### V0 – ngây thơ (cố ý sai để chứng minh lỗi)

1. `findOne` đọc `remainingQty`
2. Nếu `remainingQty >= qty` thì `updateOne` với `$inc: { remainingQty: -qty }`
3. Tạo đơn

Bước kiểm tra và bước trừ tách rời, nên dưới tải sẽ bán quá và tồn kho âm. **Không** ghi đè `remainingQty = giá trị đọc được - 1`: cách đó chỉ làm mất cập nhật, tồn kho không âm.

Unique index `(saleId, userId)` vẫn áp dụng cho V0, nên E1 phải dùng user khác nhau.

### V1 – MongoDB nguyên tử

1. `findOneAndUpdate({ _id: saleId, remainingQty: { $gte: qty } }, { $inc: { remainingQty: -qty } })`. Kết quả `null` nghĩa là hết hàng
2. Tạo đơn. Unique index `(saleId, userId)` chặn mua trùng
3. Nếu tạo đơn lỗi `E11000` hoặc lỗi khác thì **cộng lại kho** (`$inc: +qty`), nếu không kho bị rò rỉ

Thao tác nguyên tử chỉ trong một document. Trừ kho và tạo đơn là hai document, không dùng transaction vì MongoDB chạy standalone. Trong khoảnh khắc trước khi hoàn kho, người khác có thể nhận "hết hàng": đây là đánh đổi để bàn luận, không cần sửa.

### V2 – Redis + Lua

Script Lua chạy nguyên tử trên Redis:

```lua
-- KEYS[1] = stock:<saleId>, KEYS[2] = buyers:<saleId>
-- ARGV[1] = userId, ARGV[2] = qty
-- Trả về: 1 thành công, 0 hết hàng, -1 đã mua, -2 chưa nạp kho
if redis.call('SISMEMBER', KEYS[2], ARGV[1]) == 1 then return -1 end
local raw = redis.call('GET', KEYS[1])
if not raw then return -2 end
if tonumber(raw) < tonumber(ARGV[2]) then return 0 end
redis.call('DECRBY', KEYS[1], ARGV[2])
redis.call('SADD', KEYS[2], ARGV[1])
return 1
```

1. Chạy script. Chỉ khi trả `1` mới đi tiếp
2. Tạo đơn trong MongoDB
3. Nếu tạo đơn lỗi thì hoàn kho: `INCRBY stock:<saleId> qty` và `SREM buyers:<saleId> userId`, gộp trong một `multi()`

Chi tiết cài đặt:

- Nạp script một lần lúc khởi động bằng `redis.defineCommand` (đã chạy được với ioredis 6).
- Đọc file bằng `readFileSync(new URL("../lua/buy.lua", import.meta.url), "utf8")`. Không dùng `URL.pathname`: đường dẫn dự án có dấu tiếng Việt và khoảng trắng nên sẽ báo `ENOENT`.
- Bước build phải chép `src/lua/` sang `dist/lua/`, vì `tsc` không chép file `.lua`.
- `flash_sales.remainingQty` **không giảm** ở V2. Mọi chỗ hiển thị số còn lại phải đọc Redis khi đợt sale chạy V2, hoặc tính `totalQty - số đơn`.
- Giới hạn của bù trừ: chỉ chạy khi tiến trình Node còn sống. Nếu Node chết giữa bước Lua và bước ghi đơn thì kho Redis mất một đơn vị (bán thiếu, không bán quá). Chỉ script đối chiếu sửa được.

### Rủi ro trộn chế độ

V0/V1 trừ `remainingQty`, V2 trừ `stock:<saleId>`. Nếu trộn chế độ trên cùng một đợt sale mà không reset, đợt 100 chiếc có thể bán 200. Luôn reset khi đổi chế độ.

### Đối chiếu Redis–MongoDB

Script đối chiếu kiểm tra sau mỗi đợt V2:

- `stock:<saleId> = totalQty - số đơn thành công`
- Tập `buyers:<saleId>` trùng với tập `userId` trong `orders` của đợt
- Báo chênh lệch và có tùy chọn sửa Redis theo MongoDB

---

## 9. Giao diện

| Trang | Đường dẫn | Nội dung |
|---|---|---|
| Trang chủ | `/` | Đợt sale đang mở (giá sale, số còn lại), danh sách sản phẩm |
| Đợt sale | `/sales/:id` | Đếm ngược tới `endAt`, số còn lại polling 1–2 giây, nút mua, thông báo kết quả theo mã trả về |
| Đăng nhập, đăng ký | `/login` | Lưu token, gửi kèm header `Authorization: Bearer` |
| Đơn hàng | `/orders` | Đơn của người dùng |
| Theo dõi | `/admin` | Số liệu từ API stats, nút reset, cập nhật liên tục để lúc demo chạy test tải thấy bộ đếm tụt về 0 |

Frontend gọi API qua proxy Vite `/api` → `http://localhost:5000`.

---

## 10. Thí nghiệm

| Mã | Mục tiêu | Thiết lập | Ghi nhận |
|---|---|---|---|
| **E1 – Tính đúng** | V0 bán quá, V1 và V2 không | Kho 100, 1.000 user **khác nhau** mua cùng lúc, lặp 5 lần mỗi phiên bản | Số đơn thành công, tồn kho cuối, số đơn vượt, số user khác nhau trong `orders` |
| **E2 – Hiệu năng** | So V1 với V2 | Kho ≥ 1.000, mức đồng thời 100 / 300 / 500 kết nối, lặp ≥ 5 lần | Request/giây, độ trễ p50 và p95, số 201, số 409, số lỗi thật |
| **E3 – Mua trùng** | Mỗi người tối đa 1 đơn | 1 user gửi 10 request cùng lúc, chỉ V1 và V2 | Số đơn của user đó (phải bằng 1), tồn kho không bị rò rỉ |
| **E4 – Lỗi giữa chừng (tùy chọn)** | Bù trừ của V2 hoạt động | Ngắt MongoDB khi đang bán | Redis và `orders` có khớp sau khi hoàn kho không |

Quy tắc đo:

- Backend chạy bằng `npm run start:test` (biên dịch rồi chạy JS). Không đo trên `npm run dev`.
- Reset trước **mỗi** lần đo.
- Số đơn vượt tính bằng `số đơn thành công - totalQty`, không chỉ nhìn tồn kho.
- **Phân phối user trong E1:** mảng `requests` của autocannon làm mọi kết nối lặp lại cùng các user đầu mảng (đo thực tế: 4 kết nối, 12 request chỉ ra 3 user). Unique index khi đó chặn phần lớn request và V0 sẽ không bán quá dù viết đúng. Dùng script Node riêng cho E1, hoặc `setupRequest` với biến đếm chung (không dùng tùy chọn `workers`). Script phải tự kiểm tra số user khác nhau trước khi tin kết quả.
- **Dữ liệu cho E2:** kho phải đặt được qua tham số. Có thể tự sinh ObjectId cho `x-test-user` khi cần hơn 1.000 user. Đo riêng giai đoạn còn hàng và giai đoạn hết hàng, vì phần lớn request sau khi hết hàng là 409.
- autocannon gộp mọi mã khác 2xx vào `non2xx`. Tỷ lệ lỗi chỉ tính 5xx và lỗi kết nối, đếm riêng 201 và 409.
- Giữ nguyên cấu hình kết nối khi so V1 với V2. Đặt `maxPoolSize` của Mongoose **tường minh** và ghi lại cùng cấu hình máy.
- Không ghi log trong đường mua khi đo.
- Mỗi thí nghiệm lưu một **file CSV tổng hợp** vào `loadtest/results/` và đưa lên git (kèm ngày đo, cấu hình, kích thước pool). File thô không lên git.
- Bắn tải và server chạy chung một máy, MongoDB và Redis đi qua lớp mạng của Docker Desktop: số liệu chỉ để so sánh tương đối giữa các phiên bản.
- Khoảng cách V1–V2 có thể nhỏ, vì mỗi đơn thành công ở V2 vẫn ghi MongoDB. Đó vẫn là kết quả hợp lệ.
- AOF `everysec` nghĩa là Redis có thể mất khoảng 1 giây dữ liệu khi sập: đây là con số cho câu hỏi về rủi ro.

---

## 11. Môi trường phát triển

- Windows 11, PowerShell; đã chạy trên Node 24.22.1, npm 11.19.1, Docker 29.7.2.
- **MongoDB của dự án ở cổng 27018.** Cổng 27017 là dịch vụ Windows `MongoDB` có sẵn trên máy, kết nối nhầm vẫn chạy nhưng sai dữ liệu. Không động vào dịch vụ đó.
- Docker Compose chỉ mở cổng cho máy cục bộ (`127.0.0.1:27018:27017`, `127.0.0.1:6379:6379`) vì không đặt mật khẩu.
- Docker Desktop không tự khởi động. Nếu `docker` không kết nối được, mở `%LOCALAPPDATA%\Programs\DockerDesktop\Docker Desktop.exe`.
- Máy không có `mongosh` hay `redis-cli`, dùng qua container: `docker exec flashsale-mongo mongosh flashsale ...`, `docker exec flashsale-redis redis-cli ...`.
- Biến môi trường backend (`.env`, không lên git; mẫu ở `.env.example`): `PORT=5000`, `MONGODB_URI=mongodb://127.0.0.1:27018/flashsale`, `REDIS_URL=redis://127.0.0.1:6379`, `CLIENT_ORIGIN=http://localhost:5173`, `JWT_SECRET`. Chế độ test dùng thêm `.env.test`.
- Server phải **thoát với thông báo rõ ràng** khi: thiếu `JWT_SECRET`, không kết nối được MongoDB hoặc Redis, hoặc cổng đã bị chiếm. Express 5 đưa lỗi `listen` vào callback, nên phải kiểm tra tham số lỗi trong callback.

Lệnh dự kiến:

| Thư mục | Lệnh |
|---|---|
| gốc | `docker compose up -d`; hoặc khởi động toàn bộ môi trường dev bằng `scripts/start.ps1` / `scripts/start.sh` và dừng bằng `scripts/stop.ps1` / `scripts/stop.sh` (mục 12) |
| `backend/` | `npm run dev`, `npm run build`, `npm start`, `npm run start:test`, `npm run typecheck`, `npm run seed`, `npm run reset` |
| `frontend/` | `npm run dev`, `npm run build`, `npm run typecheck` |

---

## 12. Script khởi chạy nhanh môi trường dev

Mục đích: một lệnh khởi động toàn bộ môi trường dev, một lệnh dừng toàn bộ. Dùng được cả trên máy vừa clone lẫn máy đã cài, trên Windows và macOS.

| File | Hệ điều hành | Cách chạy |
|---|---|---|
| `scripts/start.ps1` | Windows, PowerShell 5.1 trở lên | `powershell -ExecutionPolicy Bypass -File scripts\start.ps1` |
| `scripts/stop.ps1` | Windows | `powershell -ExecutionPolicy Bypass -File scripts\stop.ps1` |
| `scripts/start.sh` | macOS, bash 3.2 mặc định của máy | `./scripts/start.sh` |
| `scripts/stop.sh` | macOS | `./scripts/stop.sh` |

Cặp script Windows và cặp script macOS có **cùng hành vi và cùng tham số**:

| Script | Windows | macOS | Ý nghĩa |
|---|---|---|---|
| start | (không có) | (không có) | Dựng và khởi động môi trường dev |
| start | `-Seed` | `--seed` | Chạy `npm run seed` trước khi khởi động (xóa và tạo lại dữ liệu) |
| stop | (không có) | (không có) | Dừng backend, frontend và container |
| stop | `-KeepDb` | `--keep-db` | Chỉ dừng backend và frontend, để MongoDB và Redis tiếp tục chạy |
| cả hai | `-Help` | `--help` | In hướng dẫn sử dụng |

### Cách chạy nền

`start` khởi động backend và frontend **ở chế độ nền**, in thông tin rồi trả lại terminal. Không giữ terminal, không mở thêm cửa sổ. `stop` là cách duy nhất để dừng.

- Mã tiến trình (PID) của backend và frontend ghi vào `.dev/api.pid` và `.dev/web.pid` ở thư mục gốc.
- Log ghi vào `.dev/logs/api.log` và `.dev/logs/web.log`. `start` in sẵn lệnh để xem log trực tiếp (`Get-Content -Wait` trên Windows, `tail -f` trên macOS).
- Thêm `.dev/` vào `.gitignore`.

### Các bước của `start`

Chạy theo thứ tự, mỗi bước in một dòng trạng thái ngắn bằng tiếng Việt:

1. **Về thư mục gốc dự án** theo vị trí của file script, không phụ thuộc thư mục đang đứng khi gọi.
2. **Kiểm tra công cụ:** `node`, `npm`, `docker`, `docker compose` (v2). Node phải là 20.19+ (nhánh 20) hoặc 22.12+, theo `engines` của frontend và backend. Thiếu hoặc sai phiên bản thì in cách cài rồi dừng. **Không tự cài phần mềm.**
3. **Docker daemon:** nếu `docker info` lỗi thì mở Docker Desktop, chờ tối đa khoảng 120 giây, quá hạn thì báo lỗi và dừng.
   - Windows: `%LOCALAPPDATA%\Programs\DockerDesktop\Docker Desktop.exe`, nếu không có thì `%ProgramFiles%\Docker\Docker\Docker Desktop.exe`.
   - macOS: `open -a Docker`.
4. **Kiểm tra đã chạy chưa và kiểm tra cổng 5000, 5173.**
   - Nếu PID trong `.dev/` vẫn còn sống: báo "đang chạy", in lại URL rồi thoát với mã 0.
   - Nếu file PID còn nhưng tiến trình đã chết: xóa file PID cũ rồi chạy tiếp.
   - Nếu cổng bị một tiến trình khác chiếm: in PID và tên tiến trình rồi dừng. **Không tự kill**: một server cũ còn chạy sẽ âm thầm nhận request (xem mục 11).
5. **`docker compose up -d --wait`.** Nếu lỗi vì cổng 27018 hoặc 6379 đã bị tiến trình khác chiếm, in gợi ý rõ ràng.
6. **File `.env`:** nếu `backend/.env` chưa có thì chép từ `.env.example` và thay `JWT_SECRET` bằng chuỗi ngẫu nhiên tối thiểu 32 byte. Không in secret ra màn hình. Nếu `.env` đã có thì giữ nguyên.
7. **Cài thư viện:** chạy `npm ci` trong `backend/` và `frontend/` khi chưa có `node_modules`, hoặc khi `package-lock.json` mới hơn lần cài trước (ví dụ so thời gian sửa với `node_modules/.package-lock.json`). Ngược lại thì bỏ qua.
8. **Seed:** chạy khi có `-Seed`/`--seed`, hoặc khi database chưa có user nào (đếm bằng `docker exec flashsale-mongo mongosh flashsale --quiet --eval "db.users.countDocuments()"`). **Không bao giờ tự seed khi đã có dữ liệu**, vì seed xóa sạch.
9. **Khởi động nền** `npm run dev` của backend và frontend, ghi PID và log vào `.dev/`. Tiến trình nền phải tiếp tục chạy sau khi `start` kết thúc và sau khi đóng terminal đã gọi nó.
10. **Chờ** `GET http://localhost:5000/api/health` trả 200 và cổng 5173 mở (tối đa khoảng 30 giây), rồi in URL frontend, URL API, lệnh xem log và lệnh `stop`. Quá hạn thì in 20 dòng cuối của log tương ứng, dừng những gì vừa khởi động rồi thoát với mã khác 0.

### Các bước của `stop`

1. **Dừng backend và frontend** theo PID trong `.dev/`, rồi xóa file PID.
   - Phải dừng **cả cây tiến trình**: `npm` sinh ra tiến trình `node` con (`tsx watch`, Vite), chỉ kill PID của `npm` thì tiến trình con vẫn giữ cổng. Windows dùng `taskkill /PID <pid> /T /F`. macOS chạy tiến trình nền thành một nhóm tiến trình riêng ngay từ lúc `start`, rồi kill cả nhóm.
   - Nếu không có file PID (ví dụ đã bị xóa) mà cổng 5000 hoặc 5173 vẫn bị giữ: chỉ dừng tiến trình đó khi nó là `node` và dòng lệnh chứa đường dẫn của dự án này (Windows đọc `CommandLine` qua `Get-CimInstance Win32_Process`, macOS dùng `ps`). Tiến trình khác thì chỉ báo, không kill.
2. **Dừng container** bằng `docker compose stop`, trừ khi có `-KeepDb`/`--keep-db`. Không dùng `docker compose down -v`: lệnh đó xóa volume và mất dữ liệu.
3. **Kiểm tra lại** cổng 5000 và 5173 đã được giải phóng, in kết quả.
4. Chạy `stop` khi không có gì đang chạy thì báo "không có gì để dừng" và thoát với mã 0.

### Ràng buộc kỹ thuật

- **Đường dẫn dự án có dấu tiếng Việt và khoảng trắng** (`C:\Dữ liệu của ổ D\...`). Mọi đường dẫn phải đặt trong ngoặc kép, và phải chạy thử đúng trên thư mục này.
- Các file `.ps1` phải chạy trên **Windows PowerShell 5.1**: không dùng `&&`, `||`, toán tử ba ngôi, `??`. Kiểm tra lỗi của lệnh ngoài bằng `$LASTEXITCODE`.
- Các file `.ps1` phải lưu **UTF-8 có BOM**. Nếu không có BOM, PowerShell 5.1 đọc file theo bảng mã ANSI và chữ tiếng Việt trong thông báo bị lỗi. Cách khác là chỉ dùng ký tự ASCII trong script.
- Windows: khởi động nền bằng `Start-Process` với `-WindowStyle Hidden` và chuyển hướng log ra file. Tiến trình phải sống tiếp sau khi `start.ps1` kết thúc.
- Các file `.sh`: dòng đầu `#!/usr/bin/env bash`, dùng `set -euo pipefail`. Tương thích **bash 3.2** của macOS: không dùng mảng kết hợp, `mapfile`, `${var,,}`. Chỉ dùng công cụ có sẵn trên macOS: `lsof -nP -iTCP:<port> -sTCP:LISTEN`, `openssl rand -hex 32`, `curl`, `ps`. macOS không có `setsid`, nên tạo nhóm tiến trình bằng cách khác (ví dụ `set -m`). `sed -i` trên macOS cần đối số rỗng (`sed -i ''`), nên tránh hoặc xử lý riêng.
- macOS: tiến trình nền phải dùng `nohup` hoặc tương đương để không bị dừng khi đóng terminal.
- Thêm `.gitattributes` với `*.sh text eol=lf` và `*.ps1 text eol=crlf`. Nhóm commit từ Windows, mà file `.sh` có ký tự xuống dòng CRLF thì không chạy được trên macOS. Đặt quyền thực thi trong git cho cả hai file `.sh` bằng `git update-index --chmod=+x`.
- Logic dùng chung giữa `start` và `stop` (đường dẫn `.dev/`, danh sách cổng) phải khớp nhau. Nếu tách ra file dùng chung thì vẫn giữ đúng 2 file chạy được cho mỗi hệ điều hành.
- Chạy lại nhiều lần không gây hỏng gì (idempotent).
- Không đổi cấu hình hệ thống, không đổi execution policy của cả máy, không động vào dịch vụ Windows `MongoDB` ở cổng 27017.
- Lỗi thì in nguyên nhân và cách khắc phục, thoát với mã khác 0.
- Chỉ dùng cho dev. **Không dùng để đo tải**: đo tải chạy `npm run start:test` (mục 10).

### Kiểm thử

- Windows, trên đúng thư mục dự án hiện tại:
  - `start` lần đầu: chưa có `.env`, chưa có `node_modules`, database trống;
  - `start` lần hai khi đang chạy: báo "đang chạy", không khởi động thêm bản thứ hai;
  - `start` sau khi `stop`: bỏ qua bước cài và bước seed;
  - `start` khi Docker Desktop đang tắt;
  - `start` khi cổng 5000 bị tiến trình khác chiếm;
  - đóng terminal đã chạy `start`, backend và frontend vẫn hoạt động;
  - `stop`: cổng 5000 và 5173 được giải phóng, không còn tiến trình `node` nào của dự án, container đã dừng;
  - `stop -KeepDb`: container vẫn chạy;
  - `stop` khi không có gì đang chạy;
  - `stop` khi file PID đã bị xóa nhưng dịch vụ vẫn chạy.
- macOS: chạy các trường hợp tương tự nếu có máy. Nếu không có máy macOS, ít nhất chạy `bash -n` cho cả hai file `.sh` (và `shellcheck` nếu có), rồi **ghi rõ trong README là chưa chạy thử trên macOS**.

---

## 13. Câu hỏi còn mở (đề xuất, chưa chốt)

| Câu hỏi | Đề xuất |
|---|---|
| Giữ `flash_sales.mode` không? | Giữ làm chế độ của đợt sale. `GET /sales/:id` trả thêm `remaining` đọc từ Redis hoặc MongoDB theo `sale.mode`. Giao diện mua theo `sale.mode`; script tải vẫn dùng `?mode=` |
| Đọc thông tin đợt sale thế nào khi mua? | Cache phần tĩnh (`salePrice`, `productId`, `startAt`, `endAt`, `status`) trong bộ nhớ Node, **dùng chung cho cả ba phiên bản**, xóa khi reset. Không cache `remainingQty`. Nếu chỉ V2 được cache thì so sánh không công bằng |
| Ghi `stock_movements` ở đâu? | Ngoài đường đo: chỉ ghi khi bù trừ và reset. Đơn thành công đã có trong `orders` |
| E1 dùng công cụ gì? | Script Node riêng; E2 dùng autocannon |

## 14. Tiêu chí hoàn thành

- Chạy được từ đầu bằng README: `docker compose up -d`, cài đặt, seed, chạy backend và frontend.
- Trên Windows, `scripts/start.ps1` khởi động và `scripts/stop.ps1` dừng toàn bộ môi trường dev, mỗi việc một lệnh, đạt các trường hợp kiểm thử ở mục 12. `start.sh` và `stop.sh` đạt tương tự trên macOS, hoặc README ghi rõ là chưa chạy thử trên macOS.
- `typecheck` và `build` đạt ở cả backend và frontend.
- E1: V0 có đơn vượt; V1 và V2 có đúng `totalQty` đơn trong **mọi** lần chạy; số user khác nhau đúng như kỳ vọng.
- E3: mỗi user đúng 1 đơn, tồn kho không rò rỉ.
- E2: có CSV tổng hợp và biểu đồ so sánh V1 với V2.
- Sau mỗi đợt V2, script đối chiếu không báo chênh lệch.
- Mã trả về của ba phiên bản thống nhất theo mục 8.
