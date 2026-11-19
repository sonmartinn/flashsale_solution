---
phase: 04-web-app-dev-scripts
plan: "04"
subsystem: ui
tags: [react, auth, jwt, flash-sale, browser]
requires:
  - phase: 04-03
    provides: Layout, giao diện cửa hàng và client API dùng chung
provides:
  - Đăng nhập và đăng ký qua API thật, giữ phiên tối thiểu qua reload
  - Trang sale dùng giờ server và gửi một yêu cầu mua theo sale.mode
  - Fixture giao diện nạp lệnh Lua V2 giống server chính
affects: [04-05, 04-08, 04-09]
tech-stack:
  added: []
  patterns: [session-generation, monotonic-server-clock, synchronous-submit-lock]
key-files:
  created: [frontend/src/pages/LoginPage.tsx, frontend/src/pages/SalePage.tsx, frontend/src/services/auth.ts, frontend/src/services/sale-state.ts, frontend/test/auth.test.ts, frontend/test/sale-state.test.ts]
  modified: [frontend/src/App.tsx, frontend/src/components/Layout.tsx, frontend/src/services/catalog.ts, frontend/src/styles/app.css, frontend/DESIGN.md, scripts/test/ui-api-fixture.mjs]
key-decisions:
  - Phiên chỉ giữ token và hồ sơ tối thiểu. Phản hồi của phiên cũ bị bỏ qua.
  - Dùng đồng hồ monotonic từ now của API và đọc lại kho sau khi mua.
  - Giữ bố cục tác vụ xác thực và dùng ảnh của cùng sản phẩm ở trang sale theo D-04.
requirements-completed: [WEB-02, WEB-04]
coverage:
  - id: D1
    description: Xác thực thật, quay lại sale và khôi phục phiên an toàn
    requirement: WEB-02
    verification:
      - {kind: unit, ref: "frontend/test/auth.test.ts", status: pass}
      - {kind: automated_ui, ref: "Edge trên bản build 5174, đăng ký bằng Enter, quay lại sale và reload", status: pass}
    human_judgment: true
    rationale: Người dùng duyệt Task 1 trước khi tiếp tục Task 2.
  - id: D2
    description: Đồng hồ theo giờ server và một POST mua hàng
    requirement: WEB-04
    verification:
      - {kind: unit, ref: "frontend/test/sale-state.test.ts", status: pass}
      - {kind: automated_ui, ref: "Edge trên bản build 5174, V2 trả 201, tồn kho 98 xuống 97, khóa mua khi hết giờ hoặc thiếu kho", status: pass}
    human_judgment: true
    rationale: Người dùng duyệt luồng mua. Kiểm tra đủ kết quả nghiệp vụ thuộc 04-05.
duration: not-recorded
completed: 2026-11-18
status: complete
---

# Phase 04 Plan 04 — Đăng nhập và mua một lần

Khách bấm mua, đăng nhập hoặc đăng ký rồi quay lại đúng đợt sale. Phiên giữ qua reload. Trang sale đếm ngược theo giờ server và gửi một POST có Bearer, đúng `sale.mode` và `qty: 1`.

## Task và commit

- Task 1: `45af959` triển khai luồng và sửa fixture V2. Người dùng duyệt với “duyệt task 1”.
- Task 2: kiểm chứng lại commit đã duyệt trên bản build và ghi kết quả trong summary này. Mã sản phẩm giữ nguyên như bản đã duyệt.

## Kiểm chứng

| Kiểm tra | Kết quả |
|---|---|
| `npm.cmd --prefix frontend test` | 30/30 đạt, gồm storage hỏng hoặc bị chặn, đường dẫn quay lại, 401 muộn, dữ liệu phiên cũ, mốc endAt và khóa nhấp lặp. |
| `npm.cmd --prefix frontend run typecheck` và `npm.cmd --prefix frontend run build` | Đạt. Có `frontend/dist/index.html`. |
| `npm.cmd --prefix backend run typecheck`, `npm.cmd --prefix backend run build` và `node --check scripts/test/ui-api-fixture.mjs` | Đạt ở Task 1. |
| Edge với API fixture thật | Task 1 đăng nhập rồi mua V2 trả 201, tồn kho 100 xuống 99. Task 2 đăng ký ở 390 px trên bản build 5174, gửi bằng Enter và về đúng sale. Hai lần nhấp gửi một POST V2 có Bearer đúng và số lượng 1. API trả 201, tồn kho 98 xuống 97 và xác nhận vẫn hiện. |
| Edge với phiên và giờ điều khiển trong trang | Phiên giữ qua reload. Storage hỏng được xóa sau reload. Khi giả lập đọc sale sắp hết hạn, đồng hồ dừng ở 0 và nút mua bị khóa. Kho chưa nạp cũng khóa mua. Ca này có hai GET ứng với hai lần làm mới thủ công. |
| Bố cục và bàn phím | Task 1 kiểm tra sale ở 390/1440 px và form ở 320 px, không tràn ngang. Task 2 bật giảm chuyển động, xác nhận link bỏ qua nội dung nhận Tab đầu khi tải thẳng trang đăng nhập và Enter gửi form đăng ký. |

## Thiết kế và phạm vi

Giữ palette mint-pink-accounts, font Figtree và Be Vietnam Pro local, nav-split, footer-dark và ảnh sneaker đã duyệt. Trang sale dùng hình và thuộc tính sản phẩm từ API. Trang đăng nhập là form ngắn, áp dụng ngoại lệ D-04 cho hero và moment. Ảnh chụp và kiểm tra bố cục ghi trong `frontend/DESIGN.md`.

Lượt thử Task 1 ban đầu trả 500 vì fixture chưa nạp Lua. Fixture đã bổ sung `registerBuyScript`, cùng hàm server chính dùng khi khởi động. Các lượt mua thật sau sửa trả 201. Dữ liệu chính thức E1–E4 ở ngoài fixture.

04-05 còn đọc đơn, khôi phục trạng thái đã mua sau reload, hiển thị đầy đủ kết quả nghiệp vụ và kiểm tra các route khách hàng. WEB-02 và WEB-04 vẫn có kiểm tra chung ở 04-05. Các phát hiện thiết kế từ 04-03 vẫn mở và gate ở trạng thái OFF.

## Tiếp theo

04-06 là kế hoạch còn lại của Wave 4. Sau đó tiếp tục 04-05 theo thứ tự wave. Phase 04 đã hoàn tất 4/9 kế hoạch.
