# Flash Sale – Redis + MongoDB

Hệ thống flash sale chống bán quá số lượng cho shop thời trang, đồ án cuối kì môn Cơ sở dữ liệu phi quan hệ.

Khi hàng nghìn người cùng mua một sản phẩm có số lượng ít, cách đọc tồn kho rồi mới trừ sẽ làm bán vượt số hàng đang có. Dự án so sánh ba cách xử lý tồn kho:

| Chế độ | Cách xử lý |
|---|---|
| V0 | Đọc tồn kho rồi trừ ở một bước riêng, không nguyên tử. Dùng để chứng minh lỗi bán quá |
| V1 | Trừ kho nguyên tử bằng `findOneAndUpdate` của MongoDB, chặn mua trùng bằng unique index |
| V2 | Trừ kho nguyên tử bằng script Lua trên Redis rồi ghi đơn vào MongoDB, lỗi thì hoàn kho |

MongoDB là nguồn dữ liệu gốc, Redis là lớp xử lý nhanh.

## Tính năng

**Đã chạy được**

- Danh sách sản phẩm và đợt sale đang mở: `GET /api/products`, `/api/products/:id`, `/api/sales/active`, `/api/sales/:id`
- Kiểm tra kết nối: `GET /api/health`
- Trang chủ hiển thị đợt sale và sản phẩm
- Tạo dữ liệu mẫu và reset đợt sale

**Đang phát triển**

- Đăng ký, đăng nhập (API trả 501, giao diện là trang tạm)
- Mua hàng V0, V1, V2 (API trả 501)
- Đơn hàng của tôi, trang theo dõi và API admin (API trả 501, giao diện là trang tạm)
- Kịch bản bắn tải trong `loadtest/`

## Công nghệ

| Thành phần | Công nghệ |
|---|---|
| Backend | Node.js, Express 5, Mongoose 9, ioredis 6 |
| Frontend | React 19, React Router 7, Vite 8 |
| Cơ sở dữ liệu | MongoDB 7, Redis 7 (bật AOF), chạy bằng Docker Compose |

## Yêu cầu

- Node.js 20.19 trở lên. Nếu dùng nhánh 22 thì cần từ 22.12. Đã chạy trên Node.js 24
- Docker Desktop đang chạy

## Cài đặt và chạy

1. Khởi động MongoDB và Redis:

   ```bash
   docker compose up -d
   ```

2. Backend (cổng 5000):

   ```bash
   cd backend
   cp .env.example .env
   npm install
   npm run seed
   npm run dev
   ```

3. Frontend (cổng 5173), mở terminal khác:

   ```bash
   cd frontend
   npm install
   npm run dev
   ```

Mở http://localhost:5173. Kiểm tra kết nối tại http://localhost:5000/api/health.

## Biến môi trường

Đặt trong `backend/.env`, chép từ `backend/.env.example`:

| Biến | Giá trị mặc định | Ý nghĩa |
|---|---|---|
| `PORT` | `5000` | Cổng của API |
| `MONGODB_URI` | `mongodb://127.0.0.1:27018/flashsale` | Chuỗi kết nối MongoDB |
| `REDIS_URL` | `redis://127.0.0.1:6379` | Chuỗi kết nối Redis |
| `CLIENT_ORIGIN` | `http://localhost:5173` | Địa chỉ frontend được phép gọi API |

MongoDB trong Docker dùng cổng **27018** trên máy để không đụng MongoDB cài sẵn ở cổng 27017. Khi xem dữ liệu bằng Compass, kết nối tới `mongodb://127.0.0.1:27018`.

## Tài khoản

MongoDB và Redis trong Docker không đặt mật khẩu, chỉ dùng cho máy phát triển.

`npm run seed` tạo các tài khoản thử sau, dùng chung mật khẩu `flashsale-test`. Chức năng đăng nhập đang phát triển.

| Vai trò | Email |
|---|---|
| Admin | `admin@flashsale.test` |
| Người dùng | `user0001@flashsale.test` đến `user1000@flashsale.test` |

## Lệnh

Chạy trong thư mục `backend/`:

| Lệnh | Tác dụng |
|---|---|
| `npm run dev` | Chạy API, tự khởi động lại khi sửa mã |
| `npm start` | Chạy API, dùng khi đo tải |
| `npm run seed` | **Xóa toàn bộ dữ liệu** trong database `flashsale` và Redis, rồi tạo lại: 1.000 user, 1 admin, 6 sản phẩm, 1 đợt sale 100 chiếc |
| `npm run reset` | Đưa đợt sale về ban đầu, xóa các đơn của đợt |

Chạy trong thư mục `frontend/`: `npm run dev`, `npm run build`.

## Cấu trúc

```
backend/
  src/config       kết nối MongoDB, Redis
  src/models       5 collection
  src/routes       khai báo API
  src/controllers  xử lý request
  src/services     purchase (V0/V1/V2), sale (reset)
  src/lua          script mua hàng cho V2
  scripts          seed, reset
frontend/src       React: pages, components, services
loadtest           kịch bản và kết quả test tải
```
