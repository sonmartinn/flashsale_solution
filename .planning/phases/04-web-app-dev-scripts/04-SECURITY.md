---
phase: "04"
slug: web-app-dev-scripts
status: verified
threats_open: 0
asvs_level: 1
created: 2026-11-19
---

# Phase 04 — Xác minh kiểm soát bảo mật

| Ranh giới | Dữ liệu đi qua |
|---|---|
| Trình duyệt và API | Bearer token, mã đợt sale, DTO sản phẩm, đơn cá nhân, số liệu và yêu cầu reset |
| Script dev và hệ điều hành | PID, thời điểm tạo, nhóm tiến trình, cổng TCP, trạng thái Docker và cấu hình môi trường |
| Tài nguyên giao diện | Ảnh và font cục bộ, ghi nhận nguồn ảnh đại diện |

## Threat Register

| Threat ID | Thành phần | Mức | Kiểm soát và bằng chứng | Status |
|---|---|---|---|---|
| T-04-01 | API trang chủ, fixture | medium | Client chỉ gọi đường dẫn `/api`; React render chuỗi theo văn bản. Fixture dùng thư mục và cấu hình trống riêng. | closed |
| T-04-02 | Phiên, đường dẫn quay lại, role | high | `safeReturnPath` kiểm tra route nội bộ, phản hồi gắn generation. Unit test phiên cũ và trình duyệt kiểm tra vai trò. | closed |
| T-04-03 | Mua và đơn của tôi | high | Một POST cho một thao tác, lỗi chưa rõ yêu cầu kiểm tra đơn. Hồi quy hai tài khoản không áp phản hồi cũ. | closed |
| T-04-04 | Dừng tiến trình Windows | high | Kiểm PID, thời điểm tạo, token runner, đường dẫn và cây con. W05/W10/W11 và fixture kiểm tra tiến trình ngoài dự án, thiếu PID và bảng TCP thiếu listener. | closed |
| T-04-05 | Cấu hình và seed | high | Tạo độc quyền khi thiếu, seed theo số user hợp lệ hoặc `-Seed`. Fixture giữ nguyên cấu hình có sẵn và kiểm tra nội dung log. | closed |
| T-04-06 | Nhóm tiến trình Bash | high | Kiểm tra PGID, loại nhóm caller. Bộ kiểm thử stub đạt 57 kiểm tra, vòng đời đã chạy trên WSL ở 04-07. | closed |
| T-04-07 | Polling và phản hồi cũ | medium | Hủy signal, loại kết quả sau hủy, chỉ một lượt chạy mỗi vòng đời và dừng khi tab ẩn. 54 test frontend sau 04-08 và tracer trình duyệt đạt. | closed |
| T-04-08 | Stats và reset admin | high | Backend kiểm role bằng Bearer, xác nhận rõ tác động, latch khóa gửi lặp. Trình duyệt chứng minh 403 khi sửa role client, 0 POST khi hủy và 1 POST `{mode}` khi xác nhận hai lần. | closed |
| T-04-09 | Ảnh, font và tài nguyên ngoài | medium | Kiểm thử tài sản, sổ nguồn ảnh và audit trình duyệt chặn HTTPS xác nhận tài nguyên cục bộ. | closed |
| T-04-10 | Nội dung và liên kết sale | medium | React render theo DTO, trạng thái trống và URL nội bộ. Frontend test và trang chủ render với fixture xác nhận liên kết đúng sale. | closed |

## Security Audit Trail

| Ngày | Threats Total | Closed | Open |
|---|---:|---:|---:|
| 2026-11-19 | 10 | 10 | 0 |

Rủi ro đã chấp nhận và cảnh báo backend vẫn theo trạng thái Phase 02. Reset UI nhắc thực hiện giữa các lượt mua hoặc bắn tải theo WR-03. [STATE.md](../../STATE.md)

Bằng chứng kiểm tra script và UI. [04-DEV-UAT.md](04-DEV-UAT.md) · [04-UI-UAT.md](04-UI-UAT.md)
