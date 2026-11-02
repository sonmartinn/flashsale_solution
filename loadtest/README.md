# Thí nghiệm tải

- `scenarios/`: kịch bản bắn tải E1–E4 (autocannon hoặc k6).
- `results/`: kết quả thô, không đưa lên git.

| Mã | Mục tiêu | Cách đo |
|---|---|---|
| E1 | Chứng minh V0 bán quá, V1 và V2 không | Kho 100, 1.000 người dùng khác nhau cùng mua |
| E2 | So sánh hiệu năng V1 và V2 | Kho 1.000, nhiều mức đồng thời. Ghi request/giây, độ trễ p50/p95, tỷ lệ lỗi |
| E3 | Kiểm tra giới hạn 1 đơn mỗi người | 1 người gửi 10 request cùng lúc, chạy trên V1 và V2 |
| E4 | Kiểm tra bù trừ của V2 (tùy chọn) | Ngắt MongoDB khi đang bán, đối chiếu Redis với đơn hàng |

Chạy backend bằng `npm start`, không dùng `npm run dev`. Mỗi cấu hình đo ít nhất 5 lần.

Trước mỗi lần chạy, reset đợt sale từ thư mục `backend`:

```bash
npm run reset
```
