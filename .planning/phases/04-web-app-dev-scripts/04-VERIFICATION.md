---
phase: 04-web-app-dev-scripts
verified: 2026-11-19T11:37:18Z
status: passed
score: 6/6 verification groups verified
behavior_unverified: 0
overrides_applied: 0
covered_files:
  - .gitattributes
  - .gitignore
  - .planning/phases/04-web-app-dev-scripts/04-01-PLAN.md
  - .planning/phases/04-web-app-dev-scripts/04-01-SUMMARY.md
  - .planning/phases/04-web-app-dev-scripts/04-02-PLAN.md
  - .planning/phases/04-web-app-dev-scripts/04-02-SUMMARY.md
  - .planning/phases/04-web-app-dev-scripts/04-03-PLAN.md
  - .planning/phases/04-web-app-dev-scripts/04-03-SUMMARY.md
  - .planning/phases/04-web-app-dev-scripts/04-04-PLAN.md
  - .planning/phases/04-web-app-dev-scripts/04-04-SUMMARY.md
  - .planning/phases/04-web-app-dev-scripts/04-05-PLAN.md
  - .planning/phases/04-web-app-dev-scripts/04-05-SUMMARY.md
  - .planning/phases/04-web-app-dev-scripts/04-06-PLAN.md
  - .planning/phases/04-web-app-dev-scripts/04-06-SUMMARY.md
  - .planning/phases/04-web-app-dev-scripts/04-07-PLAN.md
  - .planning/phases/04-web-app-dev-scripts/04-07-SUMMARY.md
  - .planning/phases/04-web-app-dev-scripts/04-08-PLAN.md
  - .planning/phases/04-web-app-dev-scripts/04-08-SUMMARY.md
  - .planning/phases/04-web-app-dev-scripts/04-09-PLAN.md
  - .planning/phases/04-web-app-dev-scripts/04-09-SUMMARY.md
  - .planning/phases/04-web-app-dev-scripts/04-DEV-UAT.md
  - .planning/phases/04-web-app-dev-scripts/04-SECURITY.md
  - .planning/phases/04-web-app-dev-scripts/04-UAT.md
  - .planning/phases/04-web-app-dev-scripts/04-UI-REVIEW.md
  - .planning/phases/04-web-app-dev-scripts/04-UI-UAT.md
  - .planning/phases/04-web-app-dev-scripts/04-VALIDATION.md
  - backend/src/controllers/admin.controller.ts
  - backend/src/controllers/order.controller.ts
  - backend/src/routes/admin.routes.ts
  - backend/src/routes/index.ts
  - backend/src/services/catalog.service.ts
  - docker-compose.yml
  - docs/SPECS.md
  - frontend/ASSETS.md
  - frontend/DESIGN.md
  - frontend/index.html
  - frontend/package.json
  - frontend/public/assets/fonts/BeVietnamPro-Medium.ttf
  - frontend/public/assets/fonts/BeVietnamPro-OFL.txt
  - frontend/public/assets/fonts/BeVietnamPro-Regular.ttf
  - frontend/public/assets/fonts/fonts.css
  - frontend/public/credits.html
  - frontend/public/images/products/ao-khoac-gio.jpg
  - frontend/public/images/products/ao-thun-cotton-basic.jpg
  - frontend/public/images/products/giay-sneaker-trang.jpg
  - frontend/public/images/products/quan-jeans-slim-fit.jpg
  - frontend/public/images/products/tui-tote-canvas.jpg
  - frontend/public/images/products/vay-hoa-midi.jpg
  - frontend/src/App.tsx
  - frontend/src/auth/AuthProvider.tsx
  - frontend/src/components/Layout.tsx
  - frontend/src/components/ProtectedRoute.tsx
  - frontend/src/hooks/usePolling.ts
  - frontend/src/main.tsx
  - frontend/src/pages/AdminPage.tsx
  - frontend/src/pages/HomePage.tsx
  - frontend/src/pages/LoginPage.tsx
  - frontend/src/pages/OrdersPage.tsx
  - frontend/src/pages/SalePage.tsx
  - frontend/src/services/admin-state.ts
  - frontend/src/services/admin.ts
  - frontend/src/services/api.ts
  - frontend/src/services/auth.ts
  - frontend/src/services/catalog.ts
  - frontend/src/services/orders.ts
  - frontend/src/services/polling.ts
  - frontend/src/services/sale-state.ts
  - frontend/src/services/types.ts
  - frontend/src/styles/app.css
  - frontend/test/admin-state.test.ts
  - frontend/test/api.test.ts
  - frontend/test/assets.test.ts
  - frontend/test/auth.test.ts
  - frontend/test/polling.test.ts
  - frontend/test/sale-state.test.ts
  - frontend/tsconfig.app.json
  - frontend/vite.config.ts
  - scripts/README.md
  - scripts/dev-common.ps1
  - scripts/dev-common.sh
  - scripts/dev-runner.ps1
  - scripts/start.ps1
  - scripts/start.sh
  - scripts/stop.ps1
  - scripts/stop.sh
  - scripts/test/dev-scripts.test.mjs
  - scripts/test/run-backend-checks.mjs
  - scripts/test/ui-api-fixture.mjs
  - scripts/test/ui-browser/cdp.mjs
  - scripts/test/ui-browser/customer-audit.mjs
  - scripts/test/ui-browser/hook.js
  - scripts/test/ui-browser/purchase-orders.mjs
covered_digest: "v4:sha256:7ba0cbaa3bf2a510b6db7cdb7273edc023734e41ea641b51146d26b0d226f51f"
re_verification:
  previous_status: human_needed
  previous_score: 5/6
  gaps_closed:
    - "Người dùng xác nhận giao diện sau các thay đổi về giá, liên kết đơn hàng và font."
  gaps_remaining: []
  regressions: []
---

# Phase 04 — Xác minh mục tiêu

Nhóm có thể trình diễn trang chủ, tài khoản, luồng mua, đơn cá nhân và màn hình admin trên trình duyệt. Cặp script Windows đã qua nghiệm thu trên đường dẫn có dấu và khoảng trắng. Cặp script Bash đã qua kiểm tra tương thích, cú pháp và vòng đời trên WSL. [04-UI-UAT.md](04-UI-UAT.md) · [04-DEV-UAT.md](04-DEV-UAT.md)

## Mục tiêu và bằng chứng

| Nhóm | Kết quả | Bằng chứng |
|---|---|---|
| Trang chủ, tài khoản và API | Đạt | `App` nối các route với `AuthProvider` và các dịch vụ gọi `requestJson`. Vite chuyển `/api` tới cổng 5000. Audit trình duyệt ghi nhận sáu sản phẩm, sale đang mở, đăng ký và đăng nhập nhìn thấy sau reload. |
| Xem sale, mua và xem đơn | Đạt | `SalePage` đồng bộ `now` với đồng hồ đơn điệu, dùng `sale.mode`, chống bấm lặp và gửi `qty: 1`. Kiểm thử kết quả mua và đơn đạt 23/23 trên trình duyệt. Mỗi mã nghiệp vụ có phản hồi riêng. Link “Xem đơn của tôi” đi tới `/orders`, nơi API lọc theo người dùng đã xác thực. |
| Polling và trang admin | Đạt | `usePolling` dùng bộ lập lịch tuần tự 2 giây và hủy lần đọc, timer, listener khi vòng đời kết thúc. Audit polling đạt 10/10 và admin 22/22. Admin tạm dừng, phân biệt bán vượt và trạng thái Redis, xác nhận gửi một reset với `{ mode }` rồi đọc lại. |
| Vòng đời dev Windows | Đạt | `start.ps1` thực hiện 10 bước và chạy runner ẩn. `stop.ps1` dùng kiểm tra quyền sở hữu tiến trình trước khi dừng cây, có đường dự phòng khi thiếu PID và hỗ trợ `-KeepDb`. Nghiệm thu 10/10 ca bắt buộc theo SPECS §12, gồm đóng terminal và giải phóng cổng. |
| Vòng đời Bash và quy tắc tệp | Đạt | `start.sh` và `stop.sh` dùng nhóm tiến trình riêng và `nohup`, cùng hành vi và cờ tương ứng. `bash -n` đạt, Git ghi `100755` cho hai entry point, LF/CRLF đúng theo loại tệp và bỏ qua `.dev/`. |
| Duyệt thiết kế cuối | Đạt | Người dùng xác nhận `pass` sau khi xem phần giá sale, liên kết đơn hàng, chữ tiếng Việt và bố cục desktop/mobile. `04-UAT.md` ghi 1/1 ca đạt, commit `8391819`. |

## Đối chiếu yêu cầu

| Yêu cầu | Plan | Bằng chứng |
|---|---|---|
| WEB-01 | 04-01, 04-02, 04-03, 04-09 | React 19, React Router 7, Vite 8 và TypeScript strict. `vite.config.ts` đặt cổng 5173 cố định với proxy `/api`. Build và typecheck đạt. |
| WEB-02 | 04-04, 04-05 | `LoginPage` và `AuthProvider` nối API auth với phiên lưu cục bộ và Bearer của phiên hiện tại. Test 401, phản hồi của phiên cũ và đường quay lại đạt. |
| WEB-03 | 04-01, 04-02, 04-03 | `HomePage` lấy sale và sản phẩm qua `getHome`. Giá sale, số còn lại và danh sách lên giao diện từ API. Sáu ảnh và hai độ đậm Be Vietnam Pro tải cục bộ, có ghi nguồn và ảnh đại diện. |
| WEB-04 | 04-04, 04-05 | `SalePage`, `sale-state.ts` và các ca mua trên trình duyệt xác nhận đồng hồ theo server, chế độ mua, khóa thao tác và phản hồi theo mã. |
| WEB-05 | 04-08 | Các test của `polling.ts` và audit trình duyệt xác nhận chu kỳ 2 giây, gộp yêu cầu làm mới, dừng đọc khi tab ẩn và dọn khi rời route hoặc đổi phiên. |
| WEB-06 | 04-05 | `OrdersPage` gọi `listMyOrders` với Bearer. Controller lấy `user.id` để lọc và trả từ mới đến cũ. Test chuyển tài khoản và phản hồi đến muộn đạt. |
| WEB-07 | 04-09 | `AdminPage` hiển thị stats, số đơn vượt, huy hiệu đồng bộ, chế độ và xác nhận reset. Audit ghi nhận 0 POST khi hủy, 1 POST khi xác nhận hai lần và API trả 403 cho token user thường. |
| DEV-01 | 04-06 | `start.ps1`, `dev-common.ps1`, `dev-runner.ps1` và các ca W01–W06 xác nhận startup, kiểm tra cổng, cấu hình, seed và tiến trình nền. |
| DEV-02 | 04-06 | `stop.ps1` và các ca W07–W10 xác nhận dừng cây tiến trình đã xác minh, `-KeepDb`, không có tiến trình và thiếu PID. |
| DEV-03 | 04-07 | `start.sh`, `stop.sh`, `dev-common.sh`, kiểm tra cú pháp và ca vòng đời WSL chứng minh cờ lệnh và quản lý nhóm tiến trình. |
| DEV-04 | 04-06, 04-07 | Git xác nhận quyền thực thi, EOL và quy tắc bỏ qua `.dev/`. Kiểm tra PS5.1 AST/BOM và ca start/stop lặp đã đạt. |
| DEV-05 | 04-07 | `04-DEV-UAT.md` ghi mã thoát và quan sát cho 10 ca Windows bắt buộc. README ghi rõ trạng thái chạy thử macOS. |

## Kiểm tra lại

- Lượt hồi quy hiện tại đạt 58/58 frontend, 172/172 backend, 200/200 tích hợp MongoDB và Redis, 289/289 loadtest. Backend và frontend đạt `typecheck` và `build`, loadtest đạt `typecheck`. Xác nhận có `frontend/dist/index.html` và `backend/dist/lua/buy.lua`.
- Kiểm tra đích bằng Node chạy trực tiếp xác nhận dọn polling, đồng hồ theo server, phiên cũ, Bearer cho đơn và admin, reset chỉ gửi mode và bộ glyph tiếng Việt. Ba kiểm tra đích cho script xác nhận AST PowerShell 5.1, BOM/EOL, `bash -n` và bằng chứng nghiệm thu.
- Dùng bộ fixture 20 đạt, 1 ca POSIX bỏ qua trên Windows đã ghi trong nghiệm thu Phase 04 để đối chiếu các script phát hành. Bằng chứng WSL được ghi riêng. [04-DEV-UAT.md](04-DEV-UAT.md)
- Lượt chạy lại toàn bộ fixture trong phiên này gặp demo đang dùng cổng 5000 và 5173. Các ca cần khởi động tiến trình riêng bị chặn ở bước kiểm tra cổng. Xác minh vòng đời dùng kết quả Windows và WSL đã ghi cho cùng phiên bản script. [04-DEV-UAT.md](04-DEV-UAT.md)
- Đối chiếu liên kết thực tế qua `main → App → route → service → /api`, import bộ polling, và điểm gọi runner/Compose của script. Kiểm tra chuỗi của GSD không nhận ra liên kết qua module trung gian, import tương đối và thư mục font. Các tệp font và giấy phép được kiểm tra trực tiếp.
- Rà soát ASVS L1 ghi 10 mối đe dọa đã đóng. Lượt rà soát mã gia tăng giữ cảnh báo ảnh quá kích thước. [04-SECURITY.md](04-SECURITY.md) · [04-REVIEW.md](04-REVIEW.md)

## Giới hạn còn ghi nhận

- Lịch sử cổng thiết kế là `OPEN 3`. Lượt audit công cụ ghi `OFF`, ảnh quá kích thước, khoảng trống footer và giới hạn hồ sơ trình duyệt chưa đăng nhập. Kết quả UAT xác nhận giao diện phù hợp cho demo. [04-UI-UAT.md](04-UI-UAT.md) · [04-UI-REVIEW.md](04-UI-REVIEW.md) · [04-UAT.md](04-UAT.md)
- macOS chưa được chạy thử trực tiếp và máy không có `shellcheck`. Ca Windows bổ sung W12 vẫn mở. [04-DEV-UAT.md](04-DEV-UAT.md) · [scripts/README.md](../../../scripts/README.md)
