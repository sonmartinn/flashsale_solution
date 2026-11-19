---
phase: 04-web-app-dev-scripts
plan: "09"
subsystem: ui
tags: [admin, react, polling, reset, visual-audit]
requires:
  - phase: 04-08
    provides: Lịch đọc tuần tự có tạm dừng và chặn phản hồi đến muộn
  - phase: 02-buy-pipeline-admin-apis
    provides: API stats, reset và quyền admin
provides:
  - Theo dõi số liệu một đợt sale trong phiên admin
  - Tạm dừng cập nhật và xác nhận reset theo mode
  - Hồi quy năm route và runner backend dùng cấu hình tạm
affects: [05-results-chart-readme-analysis]
tech-stack:
  added: []
  patterns: [server-backed-admin-authorization, serial-polling, single-flight-reset]
key-files:
  created: [frontend/src/pages/AdminPage.tsx, frontend/src/services/admin.ts, frontend/src/services/admin-state.ts, frontend/test/admin-state.test.ts, scripts/test/run-backend-checks.mjs, .planning/phases/04-web-app-dev-scripts/04-UI-UAT.md]
  modified: [frontend/src/App.tsx, frontend/src/components/ProtectedRoute.tsx, frontend/src/pages/SalePage.tsx, frontend/src/styles/app.css, frontend/DESIGN.md]
key-decisions:
  - Giữ sale đã chọn trong query nội bộ đã xác thực và đưa về đúng trang sau login.
  - Reset gửi một POST mode, đọc lại hai DTO rồi phục hồi trạng thái cập nhật trước đó.
requirements-completed: [WEB-07, WEB-01]
coverage:
  - id: D1
    description: Admin kiểm tra stats và reset có xác nhận trong phiên được cấp quyền
    requirement: WEB-07
    verification:
      - kind: unit
        ref: frontend/test/admin-state.test.ts
        status: pass
      - kind: automated_ui
        ref: .taste-skill/phase04-UPTfcF/evidence.json
        status: pass
    human_judgment: false
  - id: D2
    description: Bản build demo chạy qua proxy và có bằng chứng render năm route
    requirement: WEB-01
    verification:
      - kind: automated_ui
        ref: .taste-skill/phase04-zanh1B/evidence.json
        status: pass
    human_judgment: true
    rationale: Kiểm tra hành vi đạt. Giao diện còn kết quả OPEN của cổng thiết kế và các findings cần duyệt.
completed: 2026-11-19
status: complete
---

# Phase 04 Plan 09 — Trang theo dõi, reset và kiểm thử hồi quy

**Admin xem số liệu từng đợt sale, tạm dừng cập nhật và reset với mode đã xác nhận. Hồi quy chức năng đạt trên năm route.**

| Thay đổi | Commit |
|---|---|
| Trang theo dõi, quyền, thống kê và reset | `5622949` |
| Đồng bộ lời nhắc mua lại với lần đọc tồn mới | `09986b3` |
| Runner backend dùng cấu hình riêng và cập nhật audit khách hàng | `bc55043` |

- Admin có 22 ca trình duyệt đạt. API thật trả 403 cho token user thường khi thử đổi role phía client. Reset từ chế độ tạm dừng xóa đơn, giữ `totalQty` và giữ lựa chọn tạm dừng sau khi đọc lại.
- Năm route đạt 35 kiểm tra render, đăng ký và mua. Audit khách hàng đạt 63 ca, kịch bản mua và mã nghiệp vụ cuối đạt 23 ca. Windows đạt 10/10 ca nghiệm thu bắt buộc.
- Backend và frontend đạt `typecheck` và `build`. Frontend đạt 58 test, backend đạt 172 test và 200 integration, loadtest đạt 289 test. Bộ fixture dev đạt 20 và bỏ qua một ca POSIX ở lượt Windows mặc định.
- Lịch sử thiết kế `OPEN 3` được giữ. Lượt hiện tại trả `GATE: OFF (no build active)`. Các ảnh quá cỡ, khoảng trống footer và giới hạn kiểm tra trang đã đăng nhập được ghi trong báo cáo. Phase chờ duyệt giao diện. [04-UI-UAT.md](04-UI-UAT.md)
