---
phase: 04-web-app-dev-scripts
plan: "08"
subsystem: ui
tags: [react, polling, abort-controller, visibility]
requires:
  - phase: 04-05
    provides: Trang sale, trạng thái mua và đọc đơn theo phiên
provides:
  - Đọc lại tồn kho 2 giây sau mỗi lần đọc hoàn tất
  - Vòng đời polling dùng lại cho trang theo dõi
affects: [04-09]
tech-stack:
  added: []
  patterns: [completion-scheduled-polling, visibilitychange, abort-controller]
key-files:
  created: [frontend/src/services/polling.ts, frontend/src/hooks/usePolling.ts, frontend/test/polling.test.ts]
  modified: [frontend/src/pages/SalePage.tsx, frontend/DESIGN.md]
key-decisions:
  - Lượt đọc thủ công gộp với lần đang chạy. Đọc sau mua bỏ kết quả của lần bắt đầu trước khi mua kết thúc.
  - Lỗi giữ số tồn cuối và khóa mua. Lượt sale mới kích hoạt đọc đơn của phiên hiện tại.
requirements-completed: [WEB-05]
coverage:
  - id: D1
    description: Polling tuần tự, hủy khi đổi phiên hoặc rời route, dừng lúc tab ẩn
    requirement: WEB-05
    verification:
      - kind: unit
        ref: frontend/test/polling.test.ts
        status: pass
      - kind: automated_ui
        ref: ".taste-skill/phase04-oVYisS/evidence.json"
        status: pass
    human_judgment: false
completed: 2026-11-19
status: complete
---

# Phase 04 Plan 08 — Cập nhật tồn kho trên trang sale

**Trang sale tự đọc tồn sau mỗi 2 giây khi tab hiện. Nút làm mới chia sẻ cùng cơ chế đọc và giữ dữ liệu cuối nếu lỗi.**

- Sáu kiểm thử polling đạt. Toàn bộ frontend có 54/54 ca đạt, `typecheck` và `build` đạt.
- `agent-browser` mở trang và thấy nút “Mua ngay”. Kịch bản Edge headless qua API thật có 10/10 kiểm tra đạt. Khoảng cách quan sát được giữa lượt đọc hoàn tất và lượt tiếp theo là khoảng 2.005 ms. Giả lập sự kiện ẩn/hiện và phản hồi đến muộn tại trình duyệt. Đơn mua và reset thực hiện qua API với dữ liệu MongoDB/Redis riêng.
- Rời trang trong lúc chờ đọc hủy signal và dừng các lượt kế tiếp. Phản hồi trước khi mua bị bỏ, một POST thành công làm tồn 100 xuống 99. Reset khôi phục 100, kích hoạt đúng một lần đọc đơn và mở lại nút mua.
- Thay đổi triển khai và kiểm thử nằm trong `1c4aa8e`. Báo cáo thiết kế ghi phạm vi kiểm chứng trên route hiện tại. Tiếp theo là 04-09.
