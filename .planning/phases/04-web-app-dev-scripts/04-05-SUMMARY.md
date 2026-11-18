---
phase: 04-web-app-dev-scripts
plan: "05"
subsystem: ui
tags: [react-19, react-router-7, vite-8, edge-cdp, design-taste-frontend, orders, purchase-outcomes]
requires:
  - phase: 04-04
    provides: Phiên Bearer theo generation, luồng đăng nhập có returnTo và một POST mua theo sale.mode
provides:
  - Route /orders đọc /api/orders/me (tối đa 100), trạng thái đầu/lỗi/trống/có dữ liệu và cách ly theo phiên
  - Phản hồi mua phân biệt success, SOLD_OUT, ALREADY_BOUGHT, SALE_NOT_ACTIVE, STOCK_NOT_LOADED và kết quả chưa rõ, không tự gửi lại
  - Trạng thái đã mua đọc lại từ đơn hiện tại theo phiên + lượt sale (reset/đổi tài khoản), không lưu cờ
  - Harness CDP Edge headless và bộ audit route khách hàng (bàn phím, bề rộng, đồng hồ, phiên cũ, lỗi đọc, offline)
affects: [04-08, 04-09, 05-results-chart-readme-analysis]
actuals:
  tokens: 34500
  tasks: 2
  commits: 5
  plan_head_before: 099ccd1071e16f2dde7d9d25796f104b350d381f
  plan_head_after: acb39eb187309bcbf4c4419c1a63cdbdd52a898e
tech-stack:
  added: []
  patterns: [generation-bound-reads, single-flight-mutation, membership-reconciliation-by-sale-epoch, server-clock-offset, in-page-fault-injection]
key-files:
  created: [frontend/src/pages/OrdersPage.tsx, frontend/src/services/orders.ts, scripts/test/ui-browser/cdp.mjs, scripts/test/ui-browser/hook.js, scripts/test/ui-browser/purchase-orders.mjs, scripts/test/ui-browser/customer-audit.mjs]
  modified: [frontend/src/App.tsx, frontend/src/components/Layout.tsx, frontend/src/components/ProtectedRoute.tsx, frontend/src/pages/LoginPage.tsx, frontend/src/pages/SalePage.tsx, frontend/src/services/auth.ts, frontend/src/services/sale-state.ts, frontend/src/styles/app.css, frontend/test/api.test.ts, frontend/test/auth.test.ts, frontend/test/sale-state.test.ts, frontend/DESIGN.md]
key-decisions:
  - Trạng thái đã mua chỉ suy ra từ lần đọc /orders/me thành công của đúng phiên và lượt sale (id|startAt|mode); không lưu cờ đã mua.
  - Kết quả mua chưa rõ (5xx khác, lỗi mạng, 2xx hỏng) khóa mua đến khi một lần đọc đơn BẮT ĐẦU sau kết quả đó; mở lại chỉ bằng thao tác của người dùng.
  - Nút mua chờ lần đọc đơn đầu tiên của phiên + lượt sale (awaitingMembership) để không có khung hình bật nút trước khi biết đã mua.
  - Màn hình tác vụ (/login, /orders) giữ tối thiểu một màn hình nhưng giãn theo nội dung; link điều hướng 44px theo UI-SPEC; sửa ở app.css, không sửa kit.
requirements-completed: [WEB-02, WEB-04, WEB-06]
coverage:
  - id: D1
    description: /orders hiển thị đơn của đúng tài khoản (ảnh/tên từ DTO, giá đã trả, giờ vi-VN, trạng thái, mã đơn, link sale), trống/lỗi/đã cũ có hành động
    requirement: WEB-06
    verification:
      - kind: unit
        ref: "npm.cmd --prefix frontend test (api.test.ts, auth.test.ts) 48/48"
        status: pass
      - kind: e2e
        ref: "scripts/test/ui-browser/purchase-orders.mjs 22/22; customer-audit.mjs 63/63"
        status: pass
    human_judgment: false
  - id: D2
    description: Mỗi kết quả mua có thông báo riêng trong role=status, đúng 1 POST, không retry; phản hồi mất/500 là chưa rõ và chỉ mở lại sau khi đọc đơn
    requirement: WEB-04
    verification:
      - kind: unit
        ref: "frontend/test/sale-state.test.ts"
        status: pass
      - kind: e2e
        ref: "scripts/test/ui-browser/purchase-orders.mjs 22/22 (SOLD_OUT/ALREADY_BOUGHT thật, SALE_NOT_ACTIVE/STOCK_NOT_LOADED/500 tiêm, phản hồi mất)"
        status: pass
    human_judgment: false
  - id: D3
    description: Phiên/đồng hồ - reload giữ phiên, token hỏng về /login có thông báo hết hạn, phản hồi GET/POST của phiên cũ bị bỏ, ranh giới startAt/endAt theo giờ server
    requirement: WEB-02
    verification:
      - kind: e2e
        ref: "scripts/test/ui-browser/customer-audit.mjs 63/63"
        status: pass
    human_judgment: false
  - id: D4
    description: Audit thiết kế /login, /sales/:id, /orders theo skill (checker/layout/perf/copy-lint/screenshot) với waiver D-04 và OPEN còn lại
    verification:
      - kind: automated_ui
        ref: "consistency.mjs /login 32 FAIL/11 WARN; /sales 42 FAIL/13 WARN (quick sau sửa 15/12); /orders ERROR (không chạy được khi đăng nhập); check.mjs; perf.mjs 0 FAIL; copy-lint 0/0"
        status: fail
    human_judgment: true
    rationale: Checker báo FAIL thật trên màn hình tác vụ; waiver D-04 và các OPEN (footer, ảnh responsive, /orders consistency, /admin thật) cần người duyệt UI cuối phase
duration: 63min
completed: 2026-11-18
status: complete
---

# Phase 04 Plan 05: Đơn của tôi, kết quả mua và audit route khách hàng Summary

**Route /orders đọc đơn thật theo phiên, phản hồi mua phân biệt từng mã nghiệp vụ và kết quả chưa rõ không tự gửi lại, trạng thái đã mua đọc lại sau reset/đổi tài khoản, cùng audit trình duyệt Edge CDP 63/63 + 22/22 trên ba route khách hàng**

## Performance

- **Duration:** ~63 phút (Task 1 do executor trước, Task 2 tiếp tục sau checkpoint)
- **Started:** 2026-11-18T10:50:52Z
- **Completed:** 2026-11-18T11:54Z
- **Tasks:** 2/2
- **Files modified:** 18 (6 mới, 12 sửa)

## Accomplishments

- `/orders` (ProtectedRoute) dùng `listMyOrders` → `/api/orders/me`, ảnh/tên từ DTO sản phẩm kèm đơn, giá đã trả, giờ `vi-VN`, “Thành công”/“Đã hủy”, mã đơn và “Xem đợt sale”; đổi key theo generation nên dữ liệu riêng không sang tài khoản khác.
- Trang sale: thông báo riêng cho success, SOLD_OUT, ALREADY_BOUGHT, SALE_NOT_ACTIVE, STOCK_NOT_LOADED; 500/mất mạng là “Chưa xác nhận được kết quả mua…” kèm “Xem đơn của tôi”, khóa mua, không gửi lại; tồn âm V0 và “Kho chưa sẵn sàng” hiển thị trung thực.
- Task 2: audit thật trên bản build — bàn phím, 1440→320, giảm chuyển động, reload, sai mật khẩu, token hết hạn, đơn trống, sale 404/400, lỗi đọc, ranh giới giờ server lệch 2 giờ, phản hồi muộn của phiên cũ, offline. Phát hiện và sửa 3 lỗi bố cục.

## Task Commits

1. **Task 1: Own orders and unambiguous purchase feedback across accounts and resets** — `aa9dfcd` (feat), `ab6e66a` (fix), `1df268f` (fix), `e8238b3` (test/docs). Người dùng duyệt tracer: “approved”.
2. **Task 2: Audit customer routes and session/clock edge cases in the browser** — `acb39eb` (fix)

**Plan metadata:** commit SUMMARY này (docs).

## Files Created/Modified

- `frontend/src/pages/OrdersPage.tsx` — route đơn của tôi, trạng thái đầu/lỗi/trống/đã cũ.
- `frontend/src/services/orders.ts` — `listMyOrders`, `parseMyOrder`, `findSaleOrder`, `MY_ORDERS_LIMIT = 100`.
- `frontend/src/services/sale-state.ts` — `classifyPurchaseError`, `resolvePurchase`, `awaitingMembership`, `saleEpoch`, `PURCHASE_COPY`.
- `frontend/src/pages/SalePage.tsx` — POST một lần, đọc lại đơn khi vào trang/đổi phiên/thấy lượt sale mới/làm mới/quay lại tab.
- `frontend/src/services/auth.ts`, `LoginPage.tsx`, `ProtectedRoute.tsx`, `Layout.tsx`, `App.tsx` — cờ `expired`, thông báo hết hạn, link “Đơn của tôi”, guard admin dùng chung.
- `frontend/src/styles/app.css` — bố cục /orders, sửa hero sale một cột, nav 44px, task-screen giãn theo nội dung, specs theo nội dung.
- `frontend/test/{api,auth,sale-state}.test.ts` — fixture cho từng mã, phản hồi muộn, lỗi storage, lượt sale mới.
- `scripts/test/ui-browser/{cdp.mjs,hook.js,purchase-orders.mjs,customer-audit.mjs}` — driver CDP Edge, tiêm lỗi trong trang (network, status, passthrough-lost, passthrough-delayed có/không bỏ abort, patch-json), hai kịch bản audit.
- `frontend/DESIGN.md` — bằng chứng Task 1 và Task 2, lệnh skill, waiver và OPEN.

## Lệnh và kết quả Task 2

Môi trường: `node scripts/test/ui-api-fixture.mjs` (MongoDB `flashsale_test_ui_33640`, Redis DB 15, saleId `6afd8b8562f44dfa27c7b0ae`), `vite preview --port 5174 --strictPort`, Edge headless qua CDP.

| Lệnh | Kết quả |
|---|---|
| `node scripts/test/ui-browser/customer-audit.mjs <saleId> .taste-skill/shots-0405-t2 <abs>/.taste-skill/chrome-0405-t2 400` | 63/63 PASS (lượt cuối). Lượt đầu bắt 20 FAIL vùng chạm nav 36px/logo 22–26px; lượt 300 bắt 12 đơn tràn y=2457 qua footer ở 1440 |
| `node scripts/test/ui-browser/purchase-orders.mjs <saleId> ... chrome-0405-t1` (chạy lại trên build cuối) | 22/22 PASS — mọi mã nghiệp vụ, phản hồi mất (1 POST), đổi tài khoản, reset, token hỏng |
| Sửa JSON sale trong trang | V0 `remaining=-3` → “Tồn kho âm: -3 sản phẩm (đã bán vượt)” màu đỏ, khóa mua; `stockLoaded=false, remaining=42` → “Kho chưa sẵn sàng”, khóa mua |
| Guard admin gắn tạm trong trang Vite dev gitignored (đã xóa) | khách → /login; user → “Không đủ quyền”; admin → nội dung. App hiện tại `/admin` = “Không tìm thấy trang” (route thuộc 04-09); API stats trả 403 cho user |
| `consistency.mjs` `/login` (5 width) | 32 FAIL / 11 WARN; sweep và đi 320px 0 FAIL |
| `consistency.mjs` `/sales/:id` (5 width) / `--quick` 1440,390 sau sửa | 42 FAIL / 13 WARN → 15 FAIL / 12 WARN (khác bề rộng, không so như cải thiện) |
| `consistency.mjs` `/orders` | ERROR: hồ sơ mới mỗi lượt nên chuyển về /login; thay bằng check/shoot với hồ sơ đã có phiên |
| `check.mjs` 6 kích thước | /login 0 finding; sale 10/9/9/9/3/4; /orders 1/1/1/1/0/1; overflowX=false mọi kích thước |
| `perf.mjs` | /login 0 FAIL/2 WARN (382 KiB); sale 0 FAIL/4 WARN (556 KiB, CLS 0, ảnh 1920px) |
| `copy-lint.mjs` | /login, sale, /orders: 0 FAIL / 0 WARN |
| `gate.mjs` | `GATE: OFF (no build active)` — không arm/reset |
| `npm.cmd --prefix frontend test` | 48/48 PASS |
| `npm.cmd --prefix frontend run typecheck` | exit 0 |
| `npm.cmd --prefix frontend run build` | exit 0 |

Ảnh chụp và báo cáo nằm trong `.taste-skill/` (gitignored): `shots-0405-t2/`, `layout-0405-*/`, `shoot-0405/`, `consistency-0405-*/`, `perf-0405-*.json`. Đã nhìn ảnh sale/orders/login ở 1440, 768, 390, 320 và danh sách 12 đơn.

## Decisions Made

- Xem `key-decisions`. Waiver D-04 cho màn hình tác vụ (no-visual, copy-headline/copy-fact, product-shown, empty-area dưới form ngắn, moment-none), bố cục UI-SPEC ảnh trái/cụm mua phải (split-pair, edge-left), countdown là dữ liệu D-08 (loop-pause) — ghi trong DESIGN.md, không gọi là PASS.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Hero sale chồng h1 lên vùng mua từ 1024px** — Task 1, `frontend/src/styles/app.css`, `ab6e66a`. Rule hero product của kit (0,5,0) đặt h1 hai hàng cột 1–7; thêm selector `:has` cho `.sale-detail` để một cột bên phải ảnh. Đo h1 x=852 ở 1440.

**2. [Rule 1 - Bug] Nút mua bật trước lần đọc đơn đầu tiên** — Task 1, `sale-state.ts`/`SalePage.tsx` + test, `1df268f`. Lượt trình duyệt thứ ba bắt khung hình đầu bật nút; thêm `awaitingMembership`.

**3. [Rule 2 - Missing critical] Harness trình duyệt ngoài danh sách file** — Task 1/2, `scripts/test/ui-browser/*`, `e8238b3`, `acb39eb`. Cần bằng chứng trình duyệt lặp lại được (số POST, phản hồi muộn); Task 2 thêm `customer-audit.mjs` và hai kiểu lỗi `passthrough-delayed` (tùy chọn `ignoreAbort`) và `patch-json` trong `hook.js`.

**4. [Rule 3 - Blocking] Khóa Redis cũ trong DB 15** — Task 1. Xóa một khóa `stock:6afbceaeef5cc41522970052` của fixture đã chết `flashsale_test_ui_35164`; không đụng DB 13/14 và các MongoDB `flashsale_test_ui_13440/35164/39704`.

**5. [Rule 1 - Bug] Link điều hướng và logo dưới 44px** — Task 2, `app.css`, `acb39eb`. Kit để nav desktop 36px, logo 22–26px, trái UI-SPEC; đặt 44px (menu mobile mở vẫn 56px). Audit 1440/1024/820/768 từ FAIL thành PASS.

**6. [Rule 1 - Bug] Danh sách đơn dài đè footer từ 1280px** — Task 2, `app.css`, `acb39eb`. Kit cố định section một màn hình; 12 đơn ở 1440 kết thúc y=2457 trong khi section/footer ở 900. `main#top > section.task-screen` giãn theo nội dung, tối thiểu một màn hình; lượt sau section kết thúc 2529, PASS ở 5 bề rộng.

**7. [Rule 1 - Bug] “Thông tin sản phẩm” thành một màn hình 91% trống** — Task 2, `app.css`, `acb39eb`. Để chiều cao theo nội dung; checker đổi empty-area/section-air FAIL sang section-height/one-section (ghi là waiver D-04).

**8. [Công cụ] agent-browser treo** — dùng driver CDP riêng. Vài tiến trình agent-browser/Edge headless từ phiên trước (14:49–14:56 giờ máy) vẫn chạy, không do lượt này khởi động nên không dừng.

**9. [Không kiểm được] /admin của user thường trên route thật** — route thuộc 04-09; chỉ kiểm được guard dùng chung trong trang tạm và API 403.

---

**Total deviations:** 7 auto-fixed (5 Rule 1, 1 Rule 2, 1 Rule 3) + 2 giới hạn công cụ/phạm vi được ghi lại.
**Impact on plan:** Các sửa đều cần cho đúng giao diện và bằng chứng; không đổi backend, không cài package, không chạy thí nghiệm tải.

## Issues Encountered

- Harness lượt đầu: phản hồi GET muộn bị trang hủy (AbortController) trước khi về, nên chỉ thử được lớp abort; thêm `ignoreAbort` để thử lớp generation. POST muộn: sau đăng xuất trang khách không còn “Mua ngay” trong lúc chờ, kịch bản đổi sang kiểm tra trên cùng trang rồi mới đăng nhập tài khoản khác.
- Render server của guard bằng `react-dom/server` không chạy được vì `useSyncExternalStore` thiếu `getServerSnapshot`; chuyển sang trang Vite dev tạm.

## Known Stubs

Không có. `/admin` chưa có route là phạm vi 04-09, không phải stub của plan này.

## OPEN còn lại

- Footer empty-area/one-section (lịch sử 04-01/03); ảnh 1920px chưa có biến thể responsive (perf/photo-weight WARN); khoảng trống giữa hero một màn hình và “Thông tin sản phẩm” ở 1440.
- Consistency của `/orders` khi đã đăng nhập chưa chạy được bằng script skill.
- `/admin` thật và ca tài khoản thường bị từ chối trên route thật: 04-09.
- Gate: `GATE: OFF (no build active)`.

## User Setup Required

None - không cần cấu hình dịch vụ ngoài.

## Next Phase Readiness

WEB-02/04/06 sẵn sàng cho polling 04-08 (vòng đời đọc đã gắn generation/epoch, lỗi đọc giữ số cũ) và admin 04-09 (guard dùng chung đã có câu “Không đủ quyền”). UAT giao diện cuối phase cần duyệt waiver D-04 và các OPEN ở trên.

## Self-Check: PASSED

- File tồn tại: `frontend/src/pages/OrdersPage.tsx`, `frontend/src/services/orders.ts`, `scripts/test/ui-browser/customer-audit.mjs`, `frontend/DESIGN.md`.
- Commit có trên nhánh: `aa9dfcd`, `ab6e66a`, `1df268f`, `e8238b3`, `acb39eb`.
- Mọi tiến trình do lượt này khởi động (fixture, vite preview 5174, vite dev 5173, Edge headless) đã dừng; MongoDB fixture đã xóa, Redis DB 15 trống, không còn `ui-fixture.lock`.

---
*Phase: 04-web-app-dev-scripts*
*Completed: 2026-11-18*
