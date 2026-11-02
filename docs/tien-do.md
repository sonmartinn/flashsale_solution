# Tiến độ dự án

Cập nhật lần cuối: 2/11/2026. Cập nhật file này vào cuối mỗi phiên làm việc.

Lộ trình đầy đủ nằm ở `de-tai-va-lo-trinh.md`, mục 10.

## Đang ở đâu

**Tuần 1 (2–8/11), hướng tới mốc M1.** Khung dự án và API đăng ký, đăng nhập đã chạy được. Việc còn lại của tuần 1 là middleware auth và bắt đầu Chương 1.

## Đã xong và đã chạy thử

- Docker Compose: MongoDB 7 (cổng 27018), Redis 7 có AOF, cả hai healthy
- 5 model Mongoose và index, đã xác nhận index `saleId_1_userId_1` trong MongoDB
- `npm run seed`: 1.000 user, 1 admin, 6 sản phẩm, 1 đợt sale 100 chiếc, Redis có `stock:<saleId>` = 100
- `npm run reset`: chạy không lỗi khi chưa có đơn
- API: `GET /api/health`, `/api/products`, `/api/products/:id`, `/api/sales/active`, `/api/sales/:id`
- Xử lý lỗi: mã sai trả 400, `mode` sai trả 400, route không tồn tại trả 404, thiếu CSDL thì server báo lỗi rồi thoát
- Frontend: build được, trang chủ tải dữ liệu qua proxy Vite, không có lỗi console
- `backend/src/lua/buy.lua`: đã chạy trực tiếp trên Redis qua `defineCommand` (ioredis 6): 1.000 lệnh song song trên kho 100 cho đúng 100 thành công. Chưa nối vào API, và cần sửa theo vấn đề 1 và 5 trong `review.md`
- `GET /api/products/:id`: mã đúng 200, mã sai 400, không tồn tại 404
- `npm run reset` khi đã có đơn và có `buyers:<saleId>`: xóa đơn và nhật ký, khôi phục kho ở cả hai bên, mở lại đợt sale đã hết hạn thêm 7 ngày
- `POST /api/auth/register`, `/api/auth/login`: đã kiểm thử trên database riêng, gồm email trùng, 8 request đồng thời, gửi `role: admin`, NoSQL injection, nội dung token
- TypeScript `strict` cho backend và frontend: `typecheck` và `build` đạt, kể cả trên bản cài sạch từ `npm ci`. `seed`, `reset` chạy qua `tsx`, API auth đạt 40/40 mục trên JS đã biên dịch
- `npm run dev` của backend và frontend: nhóm đã chạy thử sau khi chuyển TypeScript, cả hai hoạt động bình thường

## Đã viết nhưng chưa kiểm chứng

- `tsx watch` tự khởi động lại khi sửa file

## Việc tiếp theo

Danh sách vấn đề và thứ tự xử lý chi tiết ở `review.md` (review ngày 2/11).

### Tuần 1 (đến 8/11)

- [x] `git init`, commit đầu tiên
- [x] Tạo repo GitHub, push `main` và `develop`: https://github.com/sonmartinn/flashsale_solution
- [x] Sửa nhanh theo `review.md`: vấn đề 2, 6, 10, 13, 14, 15. Đợt sale trong dữ liệu hiện tại vẫn hết hạn 9/11 cho tới khi chạy `npm run reset`
- [x] Đăng ký, đăng nhập JWT (cài `jsonwebtoken`, thêm `JWT_SECRET` vào `.env.example`)
- [ ] Middleware `requireAuth`, `requireAdmin`, và `x-test-user` khi `NODE_ENV=test`
- [ ] Bắt đầu Chương 1

### Tuần 2 (9–15/11)

- [ ] Nối `userId` từ auth vào controller `buy`
- [ ] `buyV0` và `buyV1`
- [ ] Script bắn tải E1, chứng minh V0 bán quá (**mốc M2, quan trọng nhất**)
- [ ] Giao diện đăng nhập

### Tuần 3 trở đi

Xem lộ trình. Không cắt V0, V1, V2, E1, E2 và báo cáo 3 chương.

## Chờ nhóm xác nhận

- Ngày báo cáo chính thức (đang dự đoán 21–27/12/2026)
- Ai là Người A, ai là Người B
- Họ tên, MSSV, lớp, tên giáo viên hướng dẫn cho bìa và bảng phân công
- Tên trường trên bìa: mẫu ghi Trường ĐH Sư phạm Kỹ thuật – ĐH Đà Nẵng, cần đối chiếu với thông tin thật của nhóm

## Nhật ký quyết định

| Ngày | Quyết định | Lý do |
|---|---|---|
| 30/10 | Chọn đề tài flash sale Redis + MongoDB | Thể hiện rõ 2 loại NoSQL, có thực nghiệm định lượng, không phụ thuộc dữ liệu ngoài. Phương án dự phòng: app gacha quán ăn dùng MongoDB geospatial |
| 30/10 | Rút gọn phạm vi cho nhóm 2 người | Bỏ thanh toán, V3, WebSocket; dùng polling |
| 2/11 | Lộ trình 6 tuần, 2/11–13/12 | Đóng băng mã nguồn 6/12, từ 14/12 là thời gian đệm |
| 2/11 | MongoDB của dự án dùng cổng 27018 | Máy có dịch vụ Windows MongoDB chạy sẵn ở 27017, không động vào dịch vụ đó |
| 2/11 | V0 dùng `findOne` rồi `$inc` | Để tồn kho thật sự âm, khớp với mô tả đề tài. Nếu ghi đè `stock - 1` thì tồn kho không âm mà chỉ mất cập nhật |
| 2/11 | `develop` là nhánh làm việc chính, `main` chỉ có mã nguồn chạy được | Yêu cầu của nhóm. `docs/` và `CLAUDE.md` chỉ ở `develop`. Không merge `develop` vào `main`, cách đưa mã sang `main` ghi trong `CLAUDE.md` |
| 2/11 | Không thêm `Co-Authored-By` vào commit | Yêu cầu của nhóm, áp dụng cho mọi nhánh. Các commit đã có cũng đã được viết lại |
| 2/11 | Không dùng GSD trong dự án này | Yêu cầu của nhóm. Đã gỡ bản cài trong `.claude/`, kế hoạch vẫn theo `docs/` |
| 2/11 | Chuyển toàn bộ dự án sang TypeScript `strict` | Yêu cầu của nhóm. `dev`, `seed`, `reset` chạy bằng `tsx`. `npm start` biên dịch rồi chạy JS để số đo tải không đi qua trình biên dịch lúc chạy |
