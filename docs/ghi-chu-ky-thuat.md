# Ghi chú kỹ thuật

Những điều không đọc được từ mã nguồn: môi trường, hướng cài đặt phần còn lại và các cạm bẫy đã biết. Thiết kế tổng thể nằm ở `de-tai-va-lo-trinh.md`.

## Môi trường

- Đã chạy trên Windows 11, Node.js 24.22.1, npm 11.19.1, Docker 29.7.2
- Backend chạy trực tiếp trên máy, cổng 5000. Frontend Vite cổng 5173, proxy `/api` sang 5000
- MongoDB và Redis chạy trong Docker. Máy không có `mongosh` hay `redis-cli`, dùng qua container:

```bash
docker exec flashsale-mongo mongosh flashsale --quiet --eval "db.orders.countDocuments()"
```

```bash
docker exec flashsale-redis redis-cli GET stock:<saleId>
```

- **Cổng MongoDB của dự án là 27018.** Cổng 27017 là dịch vụ Windows `MongoDB` có sẵn, kết nối nhầm vào đó vẫn chạy được nhưng sai dữ liệu
- Docker Desktop không tự khởi động. Nếu `docker` báo không kết nối được thì mở `%LOCALAPPDATA%\Programs\DockerDesktop\Docker Desktop.exe`
- `npm run seed` xóa toàn bộ database `flashsale` và Redis trong container, rồi tạo lại. Tài khoản thử nằm trong `backend/scripts/seed.ts`
- `backend/.env` không lên git, máy mới phải chép từ `.env.example`

## Hợp đồng API mua hàng

Controller gọi `buyHandlers[mode]({ saleId, userId, qty })` trong `src/services/purchase.service.ts`. Hiện controller **chưa truyền `userId`** vì chưa có middleware auth, nên `BuyInput.userId` đang tạm là tùy chọn. Đổi thành bắt buộc khi nối auth.

Đề xuất mã trả về, nhớ dùng thống nhất cho cả ba phiên bản để so sánh được:

| Tình huống | Mã |
|---|---|
| Thành công | 201 |
| Hết hàng | 409 |
| Đã mua rồi | 409, khác thông báo |
| Đợt sale chưa mở hoặc đã kết thúc | 400 |

Chỉ cho `qty = 1` vì `perUserLimit = 1`.

## Hướng cài đặt và cạm bẫy

### V0

- `findOne`, kiểm tra `remainingQty >= qty`, rồi `updateOne` với `$inc`, rồi tạo đơn
- Nếu không thấy bán quá, xem mục rủi ro trong lộ trình trước khi thêm khoảng trễ
- Unique index `(saleId, userId)` vẫn áp dụng cho V0, nên E1 phải dùng user khác nhau. E3 chỉ chạy V1 và V2

### V1

- `findOneAndUpdate` trừ kho **trước**, tạo đơn **sau**
- Nếu tạo đơn lỗi vì trùng index (mã `E11000`) thì **phải cộng lại kho**, nếu không kho bị rò rỉ và người khác không mua được. E3 kiểm tra đúng chỗ này
- Thao tác nguyên tử chỉ trong một document. Trừ kho và tạo đơn là hai document, không có transaction vì MongoDB đang chạy standalone

### V2

- Nạp `src/lua/buy.lua` một lần lúc khởi động bằng `redis.defineCommand`, đã chạy thử với ioredis 6
- Đọc file bằng `readFileSync(new URL("../lua/buy.lua", import.meta.url), "utf8")`. `npm run build` chép Lua sang `dist/lua/` nên đường dẫn đúng cho cả `src` và `dist`. Không dùng `URL.pathname`: đường dẫn dự án có dấu tiếng Việt và khoảng trắng nên sẽ báo `ENOENT`
- Script trả về `1` thành công, `0` hết hàng, `-1` đã mua
- Ghi đơn MongoDB lỗi thì hoàn kho: `INCRBY stock:<saleId>` và `SREM buyers:<saleId> <userId>`
- `flash_sales.remainingQty` **không giảm** ở V2. Vì vậy trang sale và API stats phải đọc Redis khi chạy V2, hoặc tính bằng `totalQty - số đơn`. Trang chủ hiện đọc `remainingQty` nên sẽ hiện sai với V2
- Khóa thật là `stock:<saleId>`, không có dấu `{}`. Dấu ngoặc nhọn chỉ có nghĩa khi dùng Redis Cluster

### Trường `flash_sales.mode`

Hiện chưa dùng. Chế độ mua lấy từ `?mode=`. Khi cài xong, hoặc dùng nó làm mặc định cho giao diện, hoặc bỏ đi.

### `stock_movements`

Ghi nhật ký tốn thời gian. Nếu chỉ ghi ở một phiên bản thì E2 mất công bằng, nên ghi ở cả ba hoặc ghi ngoài đường đo.

## Auth và chế độ test

- Token ký bằng `JWT_SECRET`, sống 7 ngày, chứa `sub` là `userId` và `role`. `requireAuth` chỉ cần xác minh token, không tra MongoDB, để không thêm một lần đọc vào đường mua
- `JWT_SECRET` không có giá trị mặc định. Server từ chối chạy nếu thiếu, còn `seed` và `reset` không cần biến này
- Khi `NODE_ENV=test`, `requireAuth` nhận `userId` từ header `x-test-user` để bắn tải không cần đăng nhập. Tuyệt đối không bật ngoài chế độ test
- Bắn tải cần danh sách `_id` của user: viết một script xuất ra file trong `loadtest/`, chạy lại sau mỗi lần seed

## Đo tải

- Chạy backend bằng `npm start`, không dùng `npm run dev`. `npm start` biên dịch lại rồi chạy JS trong `dist/`, còn `npm run dev` biên dịch TypeScript lúc chạy qua `tsx` và làm sai số đo
- `autocannon` và `k6` chưa được cài. `loadtest/` chưa có `package.json`
- Chạy `npm run reset` trước mỗi lần đo, mỗi cấu hình ít nhất 5 lần
- Đo số đơn bán quá bằng `số đơn thành công - totalQty`, đừng chỉ nhìn tồn kho
- Giữ nguyên cấu hình kết nối của Mongoose và Redis khi so sánh V1 với V2. Ghi lại cấu hình máy và kích thước pool trong báo cáo
- Số liệu chỉ dùng để so sánh tương đối giữa các phiên bản
