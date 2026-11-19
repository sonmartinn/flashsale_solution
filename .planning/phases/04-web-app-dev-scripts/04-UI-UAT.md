---
phase: 04-web-app-dev-scripts
plan: "09"
kind: ui-audit
date: 2026-11-19
---

# Kiểm chứng giao diện Phase 04

**`GATE: OFF (no build active)`** ở lượt cuối. Lịch sử `OPEN 3` từ 04-01 được giữ lại. Ba phát hiện gồm CTA ở phần “Giới hạn mỗi tài khoản”, khoảng trống trong footer và cách bộ kiểm tra phân loại dải CTA ở footer.

## Chức năng trên bản build

| Ca | Quan sát | Kết quả |
|---|---|---|
| Trang chủ, đăng ký, mua và đơn hàng | Trang chủ lấy 6 sản phẩm và sale thật. Tạo tài khoản bằng form, trở lại đúng sale, mua và xem đơn vừa tạo ở `/orders`. | PASS |
| Bố cục năm route | Kịch bản năm route đạt 35/35. Có một `h1` và không tràn ngang tại 1440, 1024, 820, 768, 390 và 320 px. Nguồn tài nguyên đều cục bộ khi chặn HTTPS. | PASS |
| Hồi quy khách hàng | 63/63 gồm bàn phím, menu, lỗi đọc, thời điểm sale, chuyển phiên và phản hồi muộn. Kiểm tra riêng đồng hồ cục bộ khi tạm dừng polling qua sự kiện visibility. | PASS |
| Kết quả mua và đơn | 23/23 sau bản sửa lời nhắc mua lại. Khi GET đơn trả trước GET tồn, nút mua vẫn khóa và chưa hiện lời mời mua. Kết quả mất phản hồi, 500, các mã nghiệp vụ, reset và hết hạn phiên đều đạt. | PASS |
| Quyền trang admin | Khách về login với `saleId` hợp lệ. User thường không thấy link “Theo dõi” và không gửi GET stats. Token của user thường vẫn bị API từ chối 403 khi role trong trình duyệt bị sửa. | PASS |
| Chọn và đọc sale | Sale đang mở được chọn lúc vào. Tồn kho và số đơn khớp API. Form chặn mã sai, lưu mã hợp lệ qua query. Phản hồi thử mô phỏng sale đã kết thúc, danh sách active trống, tồn âm, bán vượt và khóa Redis thiếu. | PASS |
| Tạm dừng và reset | Bỏ phản hồi đang đọc lúc tạm dừng. Escape hủy xác nhận, trả focus và phát sinh 0 POST. Bấm xác nhận hai lần chỉ gửi `{ "mode": "v1" }`. Đơn từ 1 về 0, tổng vẫn 100. Trang đọc lại stats và sale trước khi trở về tạm dừng. Lỗi 503 giả lập hiển thị kết quả chưa xác nhận, không POST lại. | PASS |
| Bố cục admin | Điều khiển chính cao ít nhất 44 px, có nhãn, không tràn ngang ở cả 6 kích thước. Font tiếng Việt tải cục bộ. | PASS |

Admin dùng API thật với MongoDB `flashsale_test_ui_23572` và Redis DB 15. Lượt kiểm tra năm route và khách hàng dùng MongoDB `flashsale_test_ui_2388` và Redis DB 15. Báo cáo và ảnh nằm trong `.taste-skill/phase04-UPTfcF/` và `.taste-skill/phase04-zanh1B/`. Kết quả mua trên bản build cuối nằm trong `.taste-skill/phase04-biVUE8/04-05-task1-browser.json`. Ca polling chi tiết nằm ở 04-08. [04-08-SUMMARY.md](04-08-SUMMARY.md)

## Công cụ thiết kế

Consistency dùng `--quick` tại 1440 và 390 px. Cột layout theo thứ tự 1440, 1024, 820, 768, 390, 320 px. Các lượt layout không phát hiện tràn ngang. `shoot.mjs` báo `Chrome did not start` trên cả năm route. Ảnh chụp Edge qua CDP có đủ sáu kích thước trên từng route, đã xem lại ảnh desktop và mobile.

| Route | Copy-lint | Consistency | Layout | Perf |
|---|---|---|---|---|
| `/` | PASS | 8 FAIL, 12 WARN | 0/1/0/1/1/2 | 2 FAIL ảnh quá kích thước, 4 WARN |
| `/sales/:id` | PASS | 15 FAIL, 12 WARN | 10/9/9/9/3/4 | 0 FAIL, 6 WARN |
| `/login` | PASS | 11 FAIL, 8 WARN | 0/0/0/0/0/0 | 0 FAIL, 4 WARN |
| `/orders` | PASS | ERROR với trạng thái đã đăng nhập | 1/1/1/1/0/0 | ERROR với trạng thái đã đăng nhập |
| `/admin` | 0 FAIL, 1 WARN | ERROR với trạng thái đã đăng nhập | 1/1/0/1/1/1 | ERROR với trạng thái đã đăng nhập |

Consistency và perf tạo hồ sơ mới, nên `/orders` và `/admin` chuyển về login. Layout dùng hồ sơ đã đăng nhập. Kiểm tra thiết bị và ảnh CDP của `/orders` có đơn và `/admin` có số liệu thật. Cảnh báo `copy-stat-strip` ở `/admin` phát sinh từ ba số liệu vận hành bắt buộc trong UI-SPEC. Các findings `hero-fold` ở trang admin phản ánh phần chọn sale, số liệu và reset dài hơn một màn hình của tác vụ D-04.

Các mục còn mở gồm dải CTA và khoảng trống footer, ảnh nguồn quá lớn, và bố cục khu thông tin sản phẩm so với quy tắc màn hình của checker. CPU host báo 100% trong lượt perf, nên chỉ số thời gian UI được ghi tham khảo. [04-UI-REVIEW.md](04-UI-REVIEW.md)

## Kiểm tra độc lập

- Frontend đạt 58/58 test, `typecheck` và `build`.
- Backend đạt 172/172 test, 200/200 integration, `typecheck` và `build`. Runner chuyển `DOTENV_CONFIG_PATH` tới file cấu hình trống dùng một lần.
- Loadtest đạt 289/289 test và `typecheck`. Đây là các kiểm thử hồi quy.
- Script dev đạt 20 ca, một ca POSIX bỏ qua ở lượt Windows mặc định. Nghiệm thu thật đạt 10/10 Windows. macOS chưa chạy runtime. [04-DEV-UAT.md](04-DEV-UAT.md)
