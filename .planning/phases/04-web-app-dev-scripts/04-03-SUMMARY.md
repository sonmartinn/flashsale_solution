---
phase: 04-web-app-dev-scripts
plan: "03"
subsystem: ui
tags: [react, catalog, navigation, api, accessibility]
requires:
  - phase: 04-02
    provides: Sáu ảnh local/font đã duyệt và kiểm chứng offline
provides:
  - Trang chủ đầy đủ sáu sản phẩm có ảnh, giá và thuộc tính thật
  - Layout/nav dùng chung, menu mobile bằng bàn phím và extension point cho phiên
  - Public DTO/catalog service tách riêng, client tests cho lỗi/hủy request
affects: [04-04, 04-05, 04-06, 04-08, 04-09]
tech-stack:
  added: []
  patterns: [shared-layout, catalog-service, semantic-product-attributes, abortable-reads]
key-files:
  created: [frontend/src/pages/HomePage.tsx, frontend/src/components/Layout.tsx, frontend/src/services/types.ts, frontend/src/services/catalog.ts, frontend/test/api.test.ts]
  modified: [frontend/src/App.tsx, frontend/src/services/api.ts, frontend/src/styles/app.css, frontend/DESIGN.md]
key-decisions:
  - Giữ toàn bộ dealer choices và bộ ảnh/font04-02 đã được duyệt
  - Hiển thị object kích thước tote đầy đủ, không chỉ nhận thuộc tính scalar
  - Chờ HomePage tải xong trước khi cuộn anchor catalog từ route sale
  - Dừng tại tracer feedback trước Task2, không bắt đầu04-04/06
requirements-completed: [WEB-01, WEB-03]
coverage:
  - id: D1
    description: Sale-first home và sáu sản phẩm đúng dữ liệu API
    requirement: WEB-03
    verification:
      - {kind: automated_ui, ref: ".taste-skill/storefront-{1440,1024,820,768,390,320}.json", status: pass}
      - {kind: automated_ui, ref: ".taste-skill/storefront-states.json — 6 cases", status: pass}
      - {kind: unit, ref: "frontend/test/api.test.ts — 13 cases", status: pass}
    human_judgment: true
    rationale: Tracer có human-check, cần duyệt storefront trước audit mở rộng
  - id: D2
    description: Shared layout, menu bàn phím và strict client
    requirement: WEB-01
    verification:
      - {kind: unit, ref: "npm.cmd --prefix frontend test — 21/21", status: pass}
      - {kind: other, ref: "frontend typecheck/build", status: pass}
      - {kind: automated_ui, ref: "menu click/Tab/Escape; focus BUTTON, ariaExpanded=false; icon18px", status: pass}
    human_judgment: true
    rationale: Menu và bố cục mới cần phản hồi tracer; full checker/perf Task2 chưa chạy
duration: not-recorded
completed: 2026-11-17
status: halted
halt_reason: Awaiting human verification of 04-03 storefront tracer before Task 2
---

# Phase 4 Plan 03 — Tracer storefront đầy đủ

**HomePage đọc sale và sáu mặt hàng thật với ảnh/giá/thuộc tính; shared layout có menu bàn phím, client hủy request đúng và 21 test đạt.**

## Task và commit

1. Task1 — implemented, chờ tracer feedback: `57f3ffc` — `feat(04-03): build typed storefront catalog and accessible shared navigation` (9files).
2. Task2 — pending; chưa chạy full storefront checker/layout/perf hoặc sang04-04/06.

04-02 đã hoàn tất sau khi người dùng nói “oke tôi duyệt bộ ảnh/font”; Task2 audit commit52bf167, SUMMARY087cce7. Không hỏi lại bộ ảnh/font và không cài dependency mới. Requirement IDs theo template, chưa đánh dấu WEB-01/03 complete sớm vì còn plan dùng chung.

## Bằng chứng Task1

- Frontend `npm.cmd --prefix frontend test`:21/21 PASS (13api/catalog +8asset), không skip. Typecheck/build cuối PASS; Vite26modules, JS~271KB trước gzip. Backend không đổi; typecheck/build đã đạt ở04-02/04-01.
- Browser5173 với backend fixture thật:6thẻ khớp API về tên/giá/ảnh/tất cả thuộc tính,7img decode. 1440/1024/820/768/390/320:external=[],overflow=false. Catalog3/2/1cột theo desktop/tablet/mobile, không CTA mua giả.
- Menu click/Tab/Escape thực thi; Escape đóng menu, focus BUTTON và ariaExpanded=false. SVG ban đầu bị padding btn ép0px; đã sửa padding0 ở app CSS và đo icon18px ở820/768/390/320. Không sửa kit/motion.
- Fault injection chỉ trong browser, có finally khôi phục fetch thật:6case PASS — no-active-sale giữ6hàng/không sale linkgiả, empty-products không bịa hàng, failed-refresh giữsale/hàng/thời điểm và báo stale, initial-error có retry/không dữ liệu giả, retry khôi phục dữ liệu thật, sale link thật và quay về/#products sau tải async. Không tuyên bố DB fixture đã trống hoặc bị sửa.
- Skill `shoot.mjs` qua Edge headless5174 chụp/đã nhìn1440/1024/820/768/390; tablet/mobile được chụp lại sau sửa padding. Toàn bộ ảnh render, không có khung lazy còn trống trong screenshot cuối. Screenshot1440=4500px,1024=3856px,820=5900px,768=5128px,390=6199px. Tablet còn giãn16/8px, chưa gọi screen rhythm hoàn hảo.
- Console app không lỗi. PowerShell5.1 pipe stdin làm hỏng chuỗi Việt trong script QA: đã dùng UTF-8 base64, không sửa dữ liệu app để vượt test. Ca decode ảnh lazy cần cuộn ảnh vào viewport; helper đã sửa theo hành vi browser thật, không tắt lazy loading trong sản phẩm.

## Thiết kế và giới hạn

Giữ product/other, mint-pink-accounts/Figtree + fallbackBeVietnamPro, hero product, nav-split/footer-dark/close-type/brand-band/solid/ring và word-highlight. Voice card, 11kit files nguyên bản và15font/kit assets được liệt kê ở DESIGN.md. Không có form/canonical domain/brand/review/số liệu giả mới. Ảnh đều là stand-in đã duyệt; ASSETS.md ghi nguồn/license/ảnh cần thay bằng hàng thật.

**`GATE: OFF (no build active)`**, lịch sử04-01 OPEN3 còn nguyên. Không rearm/reset, không chạy lại gate sau OFF. Audit20FAIL/21WARN và perf0FAIL/5WARN của04-02 là layout cũ, không thay full audit04-03 Task2. Footer/statement còn khoảng trống, tablet tăng nhẹ chiều cao. Catalog mobile cần đọc đủ6hàng và thuộc tính nên dài4.34screen: ngoại lệ chức năng D-04/D-07, không cắt dữ liệu để đạt công thức marketing. Cùng sneaker xuất hiện hero/catalog đúng dữ liệu, cần waiver photo-repeat cụ thể nếu checker đòi ảnh khác. Waiver no-visual/hole catalog cũ phải đánh giá lại vì catalog hiện có ảnh.

## Deviations

- [Rule1] Browser đối chiếu API thật phát hiện dimensionsCm là object, đã bổ sung formatter đệ quy, nhãn Việt đúng key seed và test cho kích thước/cỡ giày/vòng eo.
- [Rule1] Hash anchor từ sale về home phải đợi dữ liệu bất đồng bộ mới có section; HomePage thực hiện lại scroll khi ready.
- [Rule1] Sửa icon menu bị co0px bằng app padding0, giữ nguyên giao diện kit và motion.
- [Rule2] Chặn path control/whitespace/fragment trướcfetch và giữ AbortError khi hủy trong lúc đọc JSONbody; có test hành vi, không thay backend contract.
- Không khôi phục mã cũ, không sửa backend/.env/CLAUDE.md/CSV/worktree cũ, không thêm package hoặc push.

## Resume

Chờ người dùng duyệt storefront04-03 hoặc nêu chỉnh sửa. Sau duyệt, tiếp tục **04-03 Task2** để chạy checker/layout/perf/empty-error/reduced-motion đầy đủ; chưa sang04-04/06 trước khi04-03 complete. Giữ WEB-01/03 chưa tick. Full phase security/review/regression chưa đến.

Fixture PID39704/session18915, Mongo flashsale_test_ui_39704 tại27018, RedisDB14, sale6afc68ea0d5332af9479f0ff. Vite5173/preview5174 đang phục vụ. Browser session flashsale-assets-edge. Không dọn tiến trình/dữ liệu cũ nếu chưa xác minh ownership.

Evidence ignored: `.taste-skill/storefront-<width>.json`, `storefront-states.json`, `shots/storefront-<width>.png`; helpers verify-storefront.js/storefront-states.js. Native API tests nằm trong repo và được tsconfig.node kiểm tra kiểu.

## Self-Check: PASSED

9file nguồn/doc tồn tại,21tests/typecheck/build và browser acceptance Task1 đạt, commit57f3ffc trên develop. Đây là xác nhận artifact tracer; human approval/Task2/full phase còn chờ.
