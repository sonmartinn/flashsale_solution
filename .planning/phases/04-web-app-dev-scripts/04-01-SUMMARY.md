---
phase: 04-web-app-dev-scripts
plan: "01"
subsystem: ui
tags: [react, vite, typescript, proxy, storefront, fixture]
requires:
  - phase: 02-buy-pipeline-admin-apis
    provides: DTO sản phẩm/sale và API đọc tồn theo mode
provides:
  - Frontend strict với trang chủ và tracer xem sale bằng API thật
  - Font/ảnh hero local, kit nguyên bản và báo cáo thiết kế
  - Fixture API cách ly MongoDB/Redis không đọc cấu hình thật
affects: [04-02, 04-03, 04-04, 04-05, 04-06, 04-07, 04-08, 04-09]
tech-stack:
  added: [React 19, React Router 7, Vite 8, TypeScript 7, Figtree]
  patterns: [relative-api, conditional-json-header, abortable-reads, isolated-ui-fixture]
key-files:
  created: [frontend/src/App.tsx, frontend/src/services/api.ts, frontend/vite.config.ts, frontend/DESIGN.md, scripts/test/ui-api-fixture.mjs]
  modified: [.gitignore]
key-decisions:
  - Người dùng đã xác nhận package trước cài đặt; không cài React Compiler optional
  - Giữ deal hợp lệ đầu tiên và chép nguyên bản 11 file kit
  - Người dùng đã duyệt tracer để tiếp tục 04-02; giữ các finding giao diện đã báo
requirements-completed: [WEB-01, WEB-03]
coverage:
  - id: D1
    description: Frontend strict và proxy đọc sale/sáu sản phẩm thật
    requirement: WEB-01
    verification:
      - {kind: other, ref: "npm.cmd --prefix frontend run typecheck", status: pass}
      - {kind: other, ref: "npm.cmd --prefix frontend run build", status: pass}
      - {kind: e2e, ref: "Browser /api/health, /api/sales/active, /api/products qua localhost:5173", status: pass}
    human_judgment: false
  - id: D2
    description: Fixture khởi động API thật trong database tạm và Redis DB15 trống
    verification:
      - {kind: integration, ref: "node scripts/test/ui-api-fixture.mjs; health.testMode=true; 6 products, 100 remaining", status: pass}
    human_judgment: false
  - id: D3
    description: Trang chủ, ảnh local và tương tác của tracer
    requirement: WEB-03
    verification:
      - {kind: automated_ui, ref: "agent-browser: ảnh decode, font local, không tài nguyên ngoài, điều hướng sale, no-sale, stale refresh", status: pass}
      - {kind: automated_ui, ref: "gate.mjs http://localhost:5174/ — OPEN 3, round 3/3", status: fail}
    human_judgment: true
    rationale: Tracer có human-check và ba finding giao diện còn mở; cần duyệt trước mở rộng.
duration: 85min
completed: 2026-11-17
status: complete
---

# Phase 4 Plan 01: Tracer trang chủ dùng API thật

**React 19 strict đọc sale, giá, tồn kho theo mode và sáu sản phẩm qua Vite proxy; dùng font/ảnh local và API fixture cách ly dữ liệu.**

## Tiến độ và commit

- Bắt đầu gate/triển khai: 2026-11-17T03:24:56Z; hoàn tất kiểm tra: khoảng 04:50Z. Thời lượng gồm chờ quyền công cụ.
- Task 1: người dùng xác nhận “oke tôi xác nhận” trước npm install. Audit 6 OK, 4 SUS latest-age có evidence repository/engines/peers; không biến SUS thành PASS.
- Task 2: đã triển khai và kiểm tra; **tracer feedback đã được duyệt** bằng phản hồi “Duyệt tracer, tiếp tục 04-02”.
- Code: `9dc87f4` — `feat(04-01): build real-sale storefront tracer and isolated API fixture` (30 file).
- Không có unit frontend ở lát cắt này; harness/test đầu tiên thuộc 04-02. Không chạy hoặc sửa số liệu thí nghiệm chính thức.

## Kiểm tra đã chạy

| Kiểm tra | Kết quả |
|---|---|
| Backend typecheck và build | PASS; dist/lua được chép |
| Frontend typecheck và build cuối | PASS; Vite 8.3.8, app bundle khoảng268KB trước gzip |
| node --check scripts/test/ui-api-fixture.mjs | PASS |
| API thật qua /api trên5173 | health200/testMode=true, sale449500đ/remaining100, 6 sản phẩm |
| Browser ảnh/font | JPEG1920×1080 decode; Figtree có glyph tiếng Việt; không request tài nguyên ngoài |
| Liên kết sale và ApiError | Sang đúng /sales/:id; INVALID_ID giữ400/code/message tiếng Việt |
| Không có sale | Kết thúc đúng sale trong DB fixture: báo trống, vẫn6 mặt hàng, không link sale giả; đã khôi phụcactive |
| Lỗi đọc khi refresh | Lỗi mạng tiêm có kiểm soát: giữ sale và6 sản phẩm, báo Dữ liệu đã cũ và Thử đọc lại |
| Layout lượt đầu | Không finding ở1440/1024/820/768/390; lượt này có trước các chỉnh sửa gate |
| Consistency đầy đủ | Đã chạy, gồm bàn phím/reduced motion/ảnh/font; các finding và xử lý trong DESIGN.md |
| Perf build preview5174 | 0FAIL/3WARN, ~421KiB transfer, 0 request hỏng, CLS0; cảnh báo CPU host bận và ảnh mobile lớn |
| Screenshot cuối | Đã chụp và nhìn ở1440×900,1024×768,820×1180,768×1024,390×844; mọi ảnh render |

Perf dev từng FAIL do React dev/HMR và read bị StrictMode hủy; không dùng số đó làm báo cáo production. Perf UI là kiểm tra tài nguyên hiển thị, không phải E2 hoặc lượt đo chính thức. Bản build được đo ngay trước thay đổi CTA/text cuối; screenshot và gate cuối dùng build mới.

## Thiết kế và finish gate

Deal, voice, nguồn/license và cấu hình waiver đầy đủ ở `frontend/DESIGN.md`. Kit giữ nguyên byte11file. Hero product; mint-pink-accounts; Figtree; nav-split/footer-dark/close-type/brand-band/solid/ring; word-highlight. Moment pinned-chapters đầu tiên không hợp lát cắt một ảnh nên deal lại phần statement theo khả năng thật, giữ kết quả hợp lệ đầu tiên.

**`GATE: OPEN 3 (rounds used up)`**, không phải PASS. Bốn waiver có lý do cụ thể cho danh sách giá dạng chữ, khoảng giữa tên/giá, danh từ tiếng Việt và split cột9 của hero recipe. Không sửa checker, giấu nội dung hay reset rounds.

Finding còn mở: `cta` ở statement (checker đòi main action), `empty-area` footer khoảng50%, `one-section` phân loại button đóng trang rộng thành band chữ. Dừng chỉnh theo finish-gate; ghi lại để lát cắt catalog/layout tiếp theo xem xét. Screenshot1024 cuối cao3106px, hơn4×768px khoảng34px do catalog tự giãn; chưa coi nhịp tablet đã đạt hoàn toàn.

Ảnh đại diện sneaker: cottonbro studio/Pexels6322602, đã nhìn ảnh đầy đủ, lưu đúng path seed; thay bằng ảnh hàng thật khi có. Font Figtree variable và OFL được lưu local. Ảnh/font khác của catalog chưa làm, thuộc04-02.

## Fixture và an toàn

`node scripts/test/ui-api-fixture.mjs` yêu cầu backend build trước. Fixture chdir vào mkdtemp và trỏ DOTENV_CONFIG_PATH tới file rỗng trước import; cfg và JWT test được truyền tường minh. Quét phân công Redis hiện có, khóa fixture, chọn DB15 chỉ khi trống và không client khác; DB0 không bị sửa. Mongo hiện tại là `flashsale_test_ui_35164`, ở27018. Guard teardown so khớp đúng tên và chỉ xóa keys sale của fixture. Nhánh cleanup signal chưa được kiểm tra thực tế trong lượt này; fixture được giữ chạy để duyệt giao diện.

T-04-01: React render text từ API; requestJson dùng /api nội bộ, AbortSignal, không retry mutation và chỉ thêm JSON header khi có body; ảnh/font local. Không truy cập backend/.env, không sửa backend contract/CSV/worktree cũ. Không thấy threat HIGH trong phạm vi lát cắt qua rà soát code; chưa thay thế security/code review cuối phase.

## Deviations from Plan

- [Rule3 — chặn công cụ] Docker/npm-cache/Chrome/git bị sandbox chặn: chạy lại với quyền công cụ sau lỗi thật; không cài phần mềm mới ngoài dependency đã được duyệt.
- [Rule3 — tài sản] Commons trả429; dùng ảnh thật Pexels có nguồn/license. photos.mjs credits không hỗ trợ Pexels nên viết trang credit từ nguồn thật.
- [Rule2 — vận hành] Thêm CSS app, favicon, credits và ignore .taste-skill để trang/credit hoạt động, hồ sơ Chrome không đi vào git. 04-06 cần giữ dòng ignore này.
- Tracer xem sale chỉ đọc để link thật có đích; auth/countdown/buy đầy đủ vẫn ở04-04/05.

## Checkpoint và bước tiếp

Người dùng đã xem và duyệt tracer để tiếp tục 04-02. Đóng trạng thái halted; ba finding visual vẫn được ghi nhận, không đổi thành automated PASS. WEB-01/03 còn phụ thuộc các plan dùng chung nên chưa đánh dấu hoàn tất trong REQUIREMENTS.

Tiếp tục 04-02 từ code hiện tại, không cài lại package hoặc thực thi lại 04-01.

## Self-Check: PASSED

Các file nguồn, lock, ảnh, font/license, fixture và commit9dc87f4 tồn tại; typecheck/build đạt. Self-check artifact không đồng nghĩa visual gatePASS hoặc người dùng đã duyệt tracer.
