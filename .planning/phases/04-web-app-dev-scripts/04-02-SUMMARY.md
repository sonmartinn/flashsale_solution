---
phase: 04-web-app-dev-scripts
plan: "02"
subsystem: ui
tags: [assets, fonts, offline, vietnamese, node-test]
requires:
  - phase: 04-01
    provides: Tracer trang chủ và fixture API đã được duyệt ở commit 92b3c95
provides:
  - Sáu đường dẫn ảnh seed phục vụ JPEG local có nguồn và giấy phép
  - Fallback Be Vietnam Pro local khắc phục glyph Việt thiếu của Figtree
  - Tám native test và bằng chứng browser cho tracer tài sản
affects: [04-03, 04-04, 04-05, 04-09]
tech-stack:
  added: [Be Vietnam Pro Regular, node:test]
  patterns: [local-font-fallback, jpeg-contract-check, browser-image-decode]
key-files:
  created: [frontend/ASSETS.md, frontend/test/assets.test.ts, frontend/public/assets/fonts/BeVietnamPro-Regular.ttf, frontend/public/assets/fonts/BeVietnamPro-OFL.txt]
  modified: [frontend/DESIGN.md, frontend/src/styles/app.css, frontend/public/credits.html]
key-decisions:
  - Giữ deal Figtree; bổ sung fallback local vì test cmap chứng minh thiếu U+01A0
  - Giữ nguyên hero sneaker, không thay dữ liệu hàng để khớp ảnh đại diện
  - Người dùng duyệt ảnh/font rồi Task 2 kiểm chứng đầy đủ; giữ kết quả visual OPEN trung thực
requirements-completed: [WEB-01, WEB-03]
coverage:
  - id: D1
    description: Sáu ảnh seed local có nguồn và đúng ngân sách
    requirement: WEB-03
    verification:
      - {kind: unit, ref: "frontend/test/assets.test.ts — 8/8 pass", status: pass}
      - {kind: automated_ui, ref: ".taste-skill/assets-1440.json — six Image.decode/MIME/dimensions", status: pass}
    human_judgment: true
    rationale: Người dùng đã duyệt ảnh/font bằng “oke tôi duyệt bộ ảnh/font” trước Task 2
  - id: D2
    description: Chuỗi font local có glyph tiếng Việt, không request CDN
    requirement: WEB-01
    verification:
      - {kind: unit, ref: "assets.test.ts — cmap Figtree/Be Vietnam Pro", status: pass}
      - {kind: automated_ui, ref: ".taste-skill/assets-{1440,1024,820,768,390,320}.json", status: pass}
      - {kind: other, ref: "frontend/backend typecheck and build", status: pass}
    human_judgment: true
    rationale: Font fallback là thay đổi nhìn thấy được và đã được người dùng duyệt
  - id: D3
    description: Task 2 — kiểm chứng offline/perf/consistency đầy đủ
    verification:
      - {kind: automated_ui, ref: ".taste-skill/assets-task2-{1440,1024,820,768,390,320}.json", status: pass}
      - {kind: automated_ui, ref: ".taste-skill/perf-04-02.json — 0 FAIL/5 WARN", status: pass}
      - {kind: automated_ui, ref: ".taste-skill/consistency-04-02/report.json — 20 FAIL/21 WARN", status: fail}
    human_judgment: true
    rationale: Asset contract đạt; layout cũ và matcher ngôn ngữ còn finding được báo OPEN theo acceptance của Task 2
duration: not-recorded
completed: 2026-11-17
status: complete
---

# Phase 4 Plan 02 — Tracer ảnh/font local

**Sáu JPEG local theo seed, sổ nguồn Pexels và fallback Be Vietnam Pro cho chữ Việt; 8 test và browser qua sáu chiều rộng đạt.**

## Tiến độ và commit

1. Task 1 — **đã duyệt**: `eeb9949` — `feat(04-02): add licensed local product assets and Vietnamese font fallback` (12 file). Phản hồi: “oke tôi duyệt bộ ảnh/font”.
2. Task 2 — **complete**: `52bf167` — `test(04-02): record offline asset and built-page audit evidence`. Kiểm chứng thực hiện sau phản hồi; phase vẫn đang thực thi.

04-01 đã được duyệt trong commit `92b3c95`; không hỏi lại package hoặc thực thi lại tracer cũ. Các requirement ID phía trên được giữ theo template GSD, chưa đánh dấu WEB-01/03 hoàn tất vì còn plan dùng chung.

## Bằng chứng Task 1

| Kiểm tra | Kết quả |
|---|---|
| `npm.cmd --prefix frontend test` | 8 tests PASS, 0 fail/skip, khoảng212ms ở lượt cuối |
| Frontend typecheck/build | PASS; strict test project được kiểm tra; dist có ảnh/font/credits |
| Backend typecheck/build | PASS; fixture import backend dist thật, không đọc .env |
| Browser API/Vite | Edge, `http://localhost:5173/`, đọc đúng6 sản phẩm từ API thật |
| Sáu ảnh | `Image.decode()` PASS, MIME image/jpeg; 1000–1920px rộng; tổng745.725 byte |
| Font | Figtree62.712 byte + Be Vietnam Pro132.948 byte; cả hai loaded; cmap chuỗi font đủ chữ Việt, U+1EA0..1EF9 và dấu kết hợp |
| Không CDN | Route HTTPS ngoài bị abort, external resource list=[]; API local tiếp tục hoạt động |
| Chiều rộng | 1440/1024/820/768/390/320: decode/font đạt, không tràn ngang; đã nhìn6 screenshot |
| Console | `agent-browser errors` không trả lỗi |
| Gate hiện tại | `GATE: OFF (no build active)`; marker04-01 ở build.done.json, lịch sử OPEN3 còn nguyên |

Native kiểm tra JPEG signature/SOF/EOI và ngân sách; không phải decoder điểm ảnh. Browser mới là bằng chứng decode thật. Không gọi “offline toàn bộ ứng dụng” khi API local vẫn cần chạy. Task2 có kết quả mới bên dưới, không lấy perf04-01 làm bằng chứng cho lần này.

## Task 2 sau khi duyệt

- Chạy lại frontend tests/typecheck/build: 8/8 PASS, strict build PASS.
- Browser build5174 chặn HTTPS ngoài, sáu chiều rộng1440/1024/820/768/390/320:6ảnh decode/MIME/dimensions PASS,2font loaded,external=[],overflow=false; console không lỗi. Evidence mới `.taste-skill/assets-task2-<width>.json`.
- Skill perf qua Edge headless:0FAIL/5WARN, khoảng551KiB transfer, JSparsed394KiB,2font191.7KiB, hero173KiB,CLS0,broken0,WebGL0. WARN doCPUhost100% ở hai width, fontbytes>160KiB và hero1920px ở390. Không dùng timing UI như E2.
- Skill consistency đầy đủ năm chiều rộng:20FAIL/21WARN;320px0FAIL. Assets,font-load,empty-visual,reduced-motion,hover,contrast,links,focus và overflow đạt.20FAIL lặp qua width ở7nhóm: no-visual,hole,copy-headings,container-edges (4waiver cũ có lý do) và cta/empty-area/one-section (OPEN cũ). Chấp nhận Task2 cho phép report OPEN trung thực; chưa gọi full-storefront PASS. Layout/catalog thuộc04-03. Không reset/rearm gate, giữOFF hiện tại vàOPEN3 lịch sử.

Ảnh thật đã mở/nhìn, nguồn và giới hạn stand-in ở `frontend/ASSETS.md`, footer chung `/credits.html`. Giữ nguyên sneaker04-01. Không chứng minh slim-fit/nylon/chống nước bằng ảnh đại diện. Không có API/route quảng cáo/giỏ hàng mới. Catalog hiện vẫn là danh sách văn bản, ảnh catalog thuộc04-03.

## Phát hiện và deviations

- [Rule1 — lỗi có bằng chứng] Khẳng định cũ “Figtree đủ glyph Việt” không đúng: native test FAIL ở U+01A0. Metadata Google Fonts chỉ có latin/latin-ext. Giữ deal và bổ sung fallback local Be Vietnam Pro Regular/OFL theo D-03/D-05; đính chính trong DESIGN.md. Tổng191KiB font có thể WARN ngân sách160KiB, dưới hard cap320KiB. Chưa đo perf mới.
- [Rule2 — credit] Cập nhật `public/credits.html` ngoài danh sách file plan để credit đủ ảnh/font đang thêm, giữ đúng chính sách một footer credit.
- [Rule3 — công cụ] Sandbox chặn Docker config, tải ảnh, tsx userInfo và Git index; lệnh cần thiết chạy lại qua quyền công cụ. Không cài phần mềm/dependency mới. Chrome không mở được CDP; Edge đã cài hoạt động. Chụp qua agent-browser, không gọi đó là screenshot/checker của design skill.
- Screenshot còn khoảng trống footer/statement và menu tablet/mobile trông trống (aria-label vẫn có). Ghi cho04-03, không sửa layout ngoài lát cắt hay gọi visual PASS. Ba finding và bốn waiver04-01 vẫn còn; không reset round.

## Fixture và dịch vụ đang chạy

Docker MongoDB27018/Redis6379 healthy sau `docker compose up -d --wait`. Lock fixture35164 cũ được chuyển thành `.taste-skill/ui-fixture-35164.stale.json` sau xác minh PID không tồn tại. Không xóa MongoDB cũ/Redis15; fixture mới tự chọn DB14 trống/chưa phân công.

- Fixture PID39704, Mongo `flashsale_test_ui_39704`, Redis14, sale `6afc68ea0d5332af9479f0ff`, exec session18915.
- Vite5173 session53075; preview5174 session62971.
- Browser session `flashsale-assets-edge`, Edge profile mặc định của session.
- Browser evidence ignored: `.taste-skill/assets-<width>.json`, `.taste-skill/shots/assets-<width>.png`; script kiểm tra `.taste-skill/verify-assets.js`.

Giữ chạy để duyệt. Khi dọn chỉ dùng tiến trình/DB/key đã xác nhận thuộc fixture; không kill tiến trình lạ. Không truy cập backend/.env, CSV chính thức, CLAUDE.md hay worktree cũ.

## Checkpoint và resume

Checkpoint ảnh/font04-02 đã được duyệt và Task2 hoàn tất. Tiếp tục04-03 theo wave/dependency; không hỏi lại ảnh/font hoặc cài lại dependency. WEB-01/03 còn plan dùng chung, không đánh dấu requirement hoàn tất sớm. Security/review/regression cuối phase chưa đến.

## Self-Check: PASSED

Đã kiểm tra commit eeb9949 và file nguồn/ảnh/font/giấy phép tồn tại, 8 tests và cả hai package typecheck/build đạt. Self-check này xác nhận tracer artifact, không thay human approval hoặc plan completion.
