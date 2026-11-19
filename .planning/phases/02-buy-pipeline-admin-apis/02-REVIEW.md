---
phase: 02-buy-pipeline-admin-apis
reviewed: 2026-11-12T04:13:18Z
depth: standard
files_reviewed: 39
files_reviewed_list:
  - .gitattributes
  - .gitignore
  - AGENTS.md
  - backend/scripts/cli-args.ts
  - backend/scripts/reset.ts
  - backend/src/controllers/admin.controller.ts
  - backend/src/services/sale-admin.service.ts
  - backend/test/cli-args.test.ts
  - backend/test/integration/admin.test.ts
  - backend/test/integration/harness-support.test.ts
  - loadtest/lib/admin.ts
  - loadtest/lib/autocannon-phase.ts
  - loadtest/lib/classify.ts
  - loadtest/lib/config.ts
  - loadtest/lib/csv.ts
  - loadtest/lib/env-info.ts
  - loadtest/lib/histogram.ts
  - loadtest/lib/http.ts
  - loadtest/lib/ids.ts
  - loadtest/lib/ports.ts
  - loadtest/lib/preflight.ts
  - loadtest/lib/reconcile.ts
  - loadtest/lib/session.ts
  - loadtest/lib/types.ts
  - loadtest/lib/verdict.ts
  - loadtest/package.json
  - loadtest/scenarios/e1-correctness.ts
  - loadtest/scenarios/e2-performance.ts
  - loadtest/scenarios/e3-duplicate.ts
  - loadtest/test/checks.test.ts
  - loadtest/test/classify.test.ts
  - loadtest/test/config.test.ts
  - loadtest/test/csv.test.ts
  - loadtest/test/env-info.test.ts
  - loadtest/test/histogram.test.ts
  - loadtest/test/ids.test.ts
  - loadtest/test/ports.test.ts
  - loadtest/test/verdict.test.ts
  - loadtest/tsconfig.json
findings:
  critical: 0
  warning: 3
  info: 0
  total: 3
  necessity: 0
status: issues_found
---

# Phase 02: Code Review Report

**Reviewed:** 2026-11-12T04:13:18Z

**Depth:** standard

**Files Reviewed:** 39

**Status:** issues_found

## Summary

Rà soát nguồn theo `docs/SPECS.md`, đối chiếu PLAN/SUMMARY/CONTEXT, review và disposition cũ, UAT, PROJECT và STATE. Có ba WARNING: một vấn đề cũ WR-03 và hai vấn đề lần đầu được ghi trong báo cáo Phase 02 là WR-06/WR-07. Hai vấn đề sau đã được phát hiện trong review Phase 01 tại commit `e382cbb`; lần này kiểm tra lại các dòng nguồn liên quan, không coi chúng là hai regression mới.

**Phạm vi dự phòng:** các SUMMARY Phase 02 không đổi từ commit review trước `3eed0d6024c3df89dfc84daa1775f95cea2e62f6`. Lệnh chuẩn `node .claude/gsd-core/bin/gsd-tools.cjs check evaluation-scope --phase 02 --since 3eed0d6024c3df89dfc84daa1775f95cea2e62f6 --raw` trả `status: degraded`, `reason: no-task-commits-since`, `source: phase-range`, gồm 45 đường dẫn có cả harness Phase 03. Loại lockfile, README thuần tài liệu và bốn file trong results, còn 39 file trên; không tự chọn khoảng commit khác. Không có file bị gitignore; không có structural pre-pass hoặc external reviewer lane.

Review Phase 01 tại `e382cbb` đã đọc tập 66 file bao trùm phạm vi hiện tại; nguồn trong phạm vi không đổi từ commit đó. Dùng kết quả này làm bằng chứng bổ trợ và đọc lại mã hiện tại, nhất là admin reset, cache, compensation và các điểm gọi harness. Kết quả backend typecheck/build đạt, unit 172/172 và integration 200/200 do orchestrator cung cấp chỉ là ngữ cảnh; lần review này không chạy lại test, dịch vụ hay phép đo. Không sửa nguồn, không đọc file env bí mật hoặc worktree cũ.

**Rủi ro đã chấp nhận:** `02-UAT.md` hoàn tất, tests 1–3 đều pass; PROJECT và STATE xác nhận giữ WR-01 (ghi đơn mơ hồ), WR-02 (ioredis gửi lại lệnh không idempotent) và WR-04 (trộn mode qua hai kho). Không mở lại hay tính ba mục đó thành lỗi mới; Phase 05 vẫn phải ghi giới hạn này, gồm điều kiện mọi lượt mua dùng đúng mode của đợt sale và cân nhắc WR-02 trước E4. V0 bán quá, V0 không bù kho và việc không dùng transaction là thiết kế chủ ý.

Đã đọc rubric necessity; không có phát hiện necessity được giữ lại.

## Narrative Findings (AI reviewer)

## Warnings

### WR-03: Reset and refunds are not fenced against in-flight buys, so a reset can start the next run already oversold

**Classification:** WARNING

**File:** `C:/Dữ liệu của ổ D/Vo Chep Bai/CSDL phi quan he/flashsale/backend/src/services/sale-admin.service.ts:102-130`; bù kho ở `backend/src/services/purchase.service.ts:104-118`.

**Issue:** Vấn đề cũ còn tồn tại, khác ba rủi ro đã được UAT chấp nhận. Reset lần lượt đặt kho MongoDB, xóa đơn và đặt lại Redis, không chặn lượt mua đang xử lý. Một lượt V2 đã chạy Lua nhưng ghi đơn sau `Order.deleteMany` để lại đơn ngoài số kho vừa nạp; hoàn kho V1/V2 đến sau reset có thể nâng kho mới lên `totalQty + 1`. Hoàn tất request ở client không chứng minh server đã xử lý xong khi client timeout. Harness hiện kiểm tra stats sau reset (`loadtest/lib/session.ts:85-91`), nhưng snapshot đó không chặn thao tác cũ đến muộn; kết thúc phiên còn gọi reset (`:97-101`).

**Fix:** Đồng bộ reset với đường mua theo từng sale: khi reset bắt đầu, ngăn lượt mua mới và từ chối hoặc đợi các lượt đang xử lý kết thúc trước khi ghi dữ liệu; giải phóng trạng thái trong `finally`. Nếu giữ giới hạn vận hành chỉ reset khi không có lượt mua, phải có cách xác nhận server đã hết lượt đang xử lý, đặc biệt sau timeout. Kiểm tra bằng lượt mua được giữ tại bước ghi đơn/bù kho rồi gọi reset; không cần chạy phép đo tải.

### WR-06: Reset lỗi ở bước cuối để cache giữ trạng thái cũ dù dữ liệu đợt sale đã đổi

**Classification:** WARNING

**File:** `C:/Dữ liệu của ổ D/Vo Chep Bai/CSDL phi quan he/flashsale/backend/src/services/sale-admin.service.ts:102-130`; cache ở `backend/src/services/sale-cache.ts:25-36`, wiring ở `backend/src/routes/index.ts:21-24`.

**Issue:** Sau khi FlashSale đã đổi, bất kỳ lỗi nào ở xóa đơn, Redis hoặc ghi StockMovement đều thoát trước `onSaleReset` dòng 130. Ví dụ một sale ended đã được cache: reset đặt MongoDB thành active và nạp kho xong, nhưng ghi nhật ký reset thất bại; API trả 500, các API đọc mới thấy active, còn đường mua tiếp tục từ chối vì cache ended. Cache không TTL nên sai lệch không tự hết. Không cần có lượt mua đồng thời để tái hiện; đây là nhánh lỗi riêng với WR-03. Tương ứng Phase 01 WR-05.

**Fix:** Bảo đảm invalidate sau khi đã bắt đầu thao tác có thể thay đổi FlashSale, kể cả khi bước ghi hoặc bước sau báo lỗi; có thể dùng `try/finally` bao quanh các bước ghi. Giữ nguyên việc trả lỗi reset cho caller và yêu cầu reset khi server không còn lượt mua. Thêm ca làm `StockMovement.create` thất bại sau cập nhật, rồi xác nhận lần mua tiếp theo đọc lại sale hiện tại.

### WR-07: E1 nhận số user lớn hơn ngân sách cổng nên luôn chờ rồi INVALID trước khi bắn

**Classification:** WARNING

**File:** `C:/Dữ liệu của ổ D/Vo Chep Bai/CSDL phi quan he/flashsale/loadtest/lib/config.ts:81-84,179-184`; guard ở `loadtest/lib/ports.ts:14-16,90-98`; caller ở `loadtest/scenarios/e1-correctness.ts:114-120,240-254`.

**Issue:** Parser nhận tới 100000 user, trong khi E1 truyền toàn bộ `cfg.users` vào guard có ngân sách cố định 10000. Với `--users 10001 --stock 100`, nếu netstat hoạt động thì ngay cả TIME_WAIT bằng 0, điều kiện cho phép chạy vẫn không thể thỏa. Harness chờ 180 giây rồi INVALID mà không gửi request. Lúc này phiên đã mở và CSV cũ đã bị ghi đè (`loadtest/lib/session.ts:63-64`); `finally` còn reset sale. Đầu vào không thể chạy đáng lẽ phải bị từ chối trước các tác động đó. Tương ứng Phase 01 WR-06; nằm trong báo cáo này vì phạm vi dự phòng chứa harness Phase 03.

**Fix:** Dùng chung giới hạn ngân sách cho parser E1 và từ chối `users > PORT_BUDGET` trước `openSession`; guard cũng nên báo ngay khi `planned > budget`. Nếu cần hỗ trợ mức lớn hơn, cho phép ngân sách cấu hình nhất quán thay vì chờ một điều kiện không thể đạt. Kiểm tra biên 10000/10001 và guard bằng đồng hồ giả, không bắn tải.

## Dấu vết các phát hiện trước

Giữ nguyên ID/tiêu đề WR-03; dành WR-01/WR-02/WR-04 cho các rủi ro đã chấp nhận. Không sửa `02-REVIEW-DISPOSITION.md` trong lần review này; các dòng `open` cũ của file đó cần được đọc cùng UAT/PROJECT/STATE mới hơn.

WR-05 cũ không được tính lại: ví dụ trước cần dữ liệu sale bị sửa hỏng ngoài các writer hiện có để gây CastError/ValidationError ở Order.create; chưa chứng minh được trigger trong luồng đầu vào được hỗ trợ. Điều này không xác nhận mã đã sửa. IN-01..IN-06 cũ cũng không được tính lại: không chứng minh tác động hiện tại đủ để giữ thành phát hiện; riêng singleton HttpError (IN-03) là quyết định đã ghi trong PROJECT, và perUserLimit bằng 1 (IN-05) là yêu cầu SPECS. Không dùng giả định về middleware tương lai hoặc consumer quên bước khởi tạo bắt buộc để bổ sung lỗi mới.

---

_Reviewed: 2026-11-12T04:13:18Z_

_Reviewer: Codex (gsd-code-reviewer)_

_Depth: standard_
