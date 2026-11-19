# Phase 04 — Rà soát giao diện

**Ngày kiểm tra** 2026-11-19. **Hợp đồng** 04-UI-SPEC. Đã xem ảnh chụp trang thật trên desktop và mobile ở cả năm route. Các tương tác mua, reset và menu được kiểm tra riêng bằng trình duyệt. [04-UI-SPEC.md](04-UI-SPEC.md) · [04-UI-UAT.md](04-UI-UAT.md)

| Tiêu chí | Điểm | Quan sát |
|---|---:|---|
| Nội dung | 3/4 | Form và hành động có tên rõ. Bộ kiểm tra báo một cảnh báo cụm chỉ số ở trang admin. |
| Hình ảnh | 2/4 | Dùng ảnh sản phẩm có nguồn, tải cục bộ. Ảnh trang chủ vẫn quá lớn so với một số khung hiển thị. |
| Màu | 3/4 | Nút xanh nhất quán. Tồn âm và đơn vượt dùng đỏ kèm số và nhãn. |
| Kiểu chữ | 3/4 | Font cục bộ render dấu tiếng Việt. Các route có tiêu đề chính nhất quán. |
| Khoảng cách | 2/4 | Các route không tràn ngang khi thử từ 320 đến 1440 px. Khoảng trống footer và chiều cao hero hẹp còn trong báo cáo. |
| Tương tác | 3/4 | Đăng ký, đăng nhập, xem đơn, mua, xác nhận reset và tạm dừng đạt các ca hành vi. Kiểm tra design ở hồ sơ sạch không qua được màn đăng nhập để đo trang riêng tư. |

**Tổng** 16/24.

## Mục còn mở

1. Ảnh hero và catalog dùng một kích thước nguồn. Bộ kiểm tra perf ghi 6 ảnh quá cỡ ở desktop và 7 ảnh ở mobile.
2. Footer dùng cùng dải CTA trên năm route và còn nhiều khoảng trống. Lịch sử cổng thiết kế giữ các mục `empty-area` và `one-section`.
3. Hero trang sale ở 320 px còn cắt một phần ảnh qua nếp gấp. Khu thông tin sản phẩm có chiều cao theo thuộc tính, tạo chênh lệch với quy tắc chiều cao màn hình.

Màn hình đăng nhập, đơn hàng và admin ưu tiên biểu mẫu và dữ liệu tác vụ theo D-04. Trang sale giữ bố cục ảnh bên trái và cụm mua bên phải theo UI-SPEC. Các lý do này giải thích findings `no-visual` và `split-pair` tương ứng. Kết quả độc lập của công cụ và các mục chưa xử lý được ghi theo từng route. [04-UI-UAT.md](04-UI-UAT.md)
