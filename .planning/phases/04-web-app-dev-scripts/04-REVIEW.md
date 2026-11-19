---
phase: 04-web-app-dev-scripts
reviewed: 2026-11-19
depth: standard
files_reviewed: 14
files_reviewed_list:
  - frontend/src/App.tsx
  - frontend/src/components/Layout.tsx
  - frontend/src/components/ProtectedRoute.tsx
  - frontend/src/hooks/usePolling.ts
  - frontend/src/pages/AdminPage.tsx
  - frontend/src/pages/HomePage.tsx
  - frontend/src/pages/SalePage.tsx
  - frontend/src/services/admin-state.ts
  - frontend/src/services/admin.ts
  - frontend/src/services/auth.ts
  - frontend/src/services/polling.ts
  - frontend/src/styles/app.css
  - scripts/dev-common.ps1
  - scripts/test/run-backend-checks.mjs
findings:
  critical: 0
  warning: 1
  info: 0
  total: 1
status: issues_found
---

# Phase 04 — Rà soát mã

Phạm vi gồm thay đổi từ 04-07 đến 04-09 và các điểm kết nối trực tiếp của storefront, xác thực và API.

## Warning

### WR-01 — Trang chủ tải ảnh lớn hơn khung hiển thị

**Vị trí** `frontend/src/pages/HomePage.tsx:45`, `frontend/src/components/Layout.tsx:113`.

Các ảnh dùng một URL nguồn cho mọi kích thước. Audit `perf.mjs` phát hiện 6 ảnh lớn hơn 2,2 lần khung trên desktop và 7 ảnh trên mobile. Một số ảnh 1.200 px hiển thị khoảng 340–409 px. Bản ghi cổng thiết kế và phần đánh giá hình ảnh nằm trong báo cáo UAT. [04-UI-UAT.md](04-UI-UAT.md)

## Đã xử lý trong lượt xác minh

- Khi `/orders/me` trả trước lượt đọc tồn sau lỗi mua chưa rõ, lời nhắc mua lại từng xuất hiện lúc nút còn khóa. `SalePage.tsx` dùng cùng điều kiện khả dụng cho lời nhắc và nút.
- Bước kiểm tra cổng Windows lấy PID từ cặp endpoint khi bảng TCP bỏ sót listener và giữ yêu cầu xác minh quyền sở hữu trước khi dừng tiến trình.
- Rà soát hai luồng mutation cho thấy POST vẫn cần thao tác người dùng. Reset xác minh vai trò ở backend, gửi `mode` và đọc DTO stats riêng.
