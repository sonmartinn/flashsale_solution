---
phase: 01-foundation-infra-data-auth
reviewed: 2026-11-11T09:44:33Z
depth: standard
files_reviewed: 66
files_reviewed_list:
  - .gitattributes
  - .gitignore
  - AGENTS.md
  - backend/package.json
  - backend/scripts/cli-args.ts
  - backend/scripts/reconcile.ts
  - backend/scripts/reset.ts
  - backend/src/controllers/admin.controller.ts
  - backend/src/controllers/order.controller.ts
  - backend/src/controllers/product.controller.ts
  - backend/src/controllers/sale.controller.ts
  - backend/src/routes/admin.routes.ts
  - backend/src/routes/index.ts
  - backend/src/routes/order.routes.ts
  - backend/src/routes/product.routes.ts
  - backend/src/routes/sale.routes.ts
  - backend/src/server.ts
  - backend/src/services/catalog.service.ts
  - backend/src/services/lua.ts
  - backend/src/services/order.service.ts
  - backend/src/services/purchase.service.ts
  - backend/src/services/reconcile.service.ts
  - backend/src/services/sale-admin.service.ts
  - backend/src/services/sale-cache.ts
  - backend/src/services/stock.service.ts
  - backend/src/types/ioredis.d.ts
  - backend/src/utils/dto.ts
  - backend/src/utils/http-error.ts
  - backend/test/cli-args.test.ts
  - backend/test/helpers.ts
  - backend/test/integration/admin.test.ts
  - backend/test/integration/buy.test.ts
  - backend/test/integration/compensation.test.ts
  - backend/test/integration/harness-support.test.ts
  - backend/test/integration/lua.test.ts
  - backend/test/integration/read.test.ts
  - backend/test/integration/reconcile.test.ts
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
  warning: 5
  info: 3
  total: 8
  necessity: 0
status: issues_found
---

# Phase 01: Code Review Report

**Reviewed:** 2026-11-11T09:44:33Z
**Depth:** standard
**Files Reviewed:** 66
**Status:** issues_found

## Summary

Đọc toàn bộ 66 file nguồn/cấu hình trong danh sách trên, kiểm tra các hàm được gọi liên quan và đối chiếu với `docs/SPECS.md`. Đây là rà soát mã ở độ sâu standard, không chạy lại test hoặc phép đo và không sửa mã nguồn.

**Giới hạn phạm vi:** các SUMMARY Phase 01 không đổi kể từ review trước. Lệnh chuẩn `node .claude/gsd-core/bin/gsd-tools.cjs check evaluation-scope --phase 01 --since cb16c6e1dd065b77c2b55c1c5dd670eab47078f6 --raw` trả `status: degraded`, `reason: no-task-commits-since`, `source: phase-range`. Bộ phân giải cung cấp 72 đường dẫn, có cả mã Phase 02/03. Loại `loadtest/package-lock.json`, `loadtest/README.md`, `loadtest/results/.gitkeep` và ba CSV kết quả, còn 66 file; không tự thay phạm vi bằng một khoảng commit khác. Không có file nào trong 66 đường dẫn bị gitignore; không có structural pre-pass hay external reviewer lane.

Có năm WARNING: ba vấn đề cũ WR-01/WR-03/WR-04 và hai vấn đề mới WR-05/WR-06. Ba mục Info cũ giữ lại vì ảnh hưởng chẩn đoán hoặc độ tin cậy của test. Các kiểm tra typecheck/build, unit 172/172 và integration 200/200 do orchestrator đã chạy là ngữ cảnh xác minh; chúng không chứng minh các nhánh lỗi nêu dưới đây đã được kiểm tra.

**Rủi ro đã chấp nhận, không phải lỗi mới:** `.planning/STATE.md` ghi nhận Phase 02 WR-01 (ghi đơn mơ hồ), WR-02 (gửi lại lệnh Redis không idempotent) và WR-04 (trộn mode sử dụng hai kho) đã được chấp nhận ở UAT và phải đưa vào tài liệu rủi ro Phase 05. Mã liên quan vẫn ở `purchase.service.ts:159-185`, `:109-114` và `sale.controller.ts:54-69`. Không đổi quyết định đó hoặc tạo ID Phase 01 trùng với các ID Phase 02. V0 bán quá và rò kho khi mua trùng là hành vi chủ ý, không báo lỗi.

Đã đọc rubric necessity; không có phát hiện necessity đủ bằng chứng và tác động để giữ lại. Không đọc bất kỳ file env bí mật, nội dung node_modules hoặc worktree cũ.

## Narrative Findings (AI reviewer)

## Warnings

### WR-01: Kill path on Windows can hang the test run forever when `taskkill` fails

**Classification:** WARNING
**File:** `C:/Dữ liệu của ổ D/Vo Chep Bai/CSDL phi quan he/flashsale/backend/test/helpers.ts:224-231`; nơi chờ: `:274-285`, `:416-420`.
**Issue:** Vấn đề cũ, còn tồn tại. Kết quả `spawnSync("taskkill", ...)` bị bỏ qua. Khi lệnh không chạy được hoặc trả mã khác 0, timeout không bảo đảm đã dừng tiến trình; `spawnNodeAndCollect` vẫn chỉ resolve khi có `close`, còn `stop()` chờ `exitedPromise` vô hạn. Một lỗi dọn dẹp có thể treo cả suite thay vì báo thất bại.
**Fix:** Đặt timeout cho chính `spawnSync`, kiểm tra `error/status`, thử dừng trực tiếp child khi cần và giới hạn thời gian chờ `close`. Nếu hết hạn, reject bằng lỗi dọn dẹp rõ ràng; chỉ thao tác với child do helper tạo. Bổ sung ca giả lập `taskkill` thất bại, không cần dừng tiến trình ngoài test.

### WR-03: Short `JWT_SECRET` warning breaks the "exactly one stderr line" boot-failure contract

**Classification:** WARNING
**File:** `C:/Dữ liệu của ổ D/Vo Chep Bai/CSDL phi quan he/flashsale/backend/src/server.ts:24-27`; lỗi khởi động sau đó: `:30-37`, `:41-54`.
**Issue:** Vấn đề cũ, còn tồn tại. Cảnh báo khóa ngắn được in trước kiểm tra cổng và kết nối store. Với khóa ngắn và cổng bị chiếm hoặc MongoDB không kết nối được, stderr có cả dòng cảnh báo và dòng lỗi. Điều này lệch hợp đồng một dòng khi boot lỗi mà chính file mô tả ở dòng 11. Cảnh báo gần giống test/test-mode đã được đưa xuống sau các bước kết nối, còn cảnh báo này chưa được đưa xuống.
**Fix:** In cảnh báo độ dài khóa cùng nhóm cảnh báo sau khi khởi tạo store/script thành công. Kiểm tra một trường hợp khóa ngắn kết hợp MongoDB không truy cập được để bảo đảm chỉ có một dòng lỗi; không in giá trị khóa.

### WR-04: Test mode (identity taken from `x-test-user`, no auth) is served on every network interface

**Classification:** WARNING
**File:** `C:/Dữ liệu của ổ D/Vo Chep Bai/CSDL phi quan he/flashsale/backend/src/server.ts:69-79`.
**Issue:** Rủi ro bảo mật cũ, tiếp tục theo dõi; không phải regression của lần này. Server gọi `listen(cfg.port)` trên mọi interface, trong khi nhánh `requireAuth` ở `backend/src/middlewares/auth.ts:29-35` chấp nhận ObjectId bất kỳ trong test mode mà không kiểm tra peer. Nếu firewall cho phép truy cập cổng, máy khác có thể mua và đọc đơn của danh tính do mình chọn. D-19 hiện chủ ý yêu cầu listen không truyền host, nên đây là rủi ro triển khai test mode cần quyết định nhất quán với quy ước đó.
**Fix:** Giữ listen dual-stack nhưng kiểm tra địa chỉ peer là loopback trước khi nhận `x-test-user` (`127.0.0.1`, `::1`, `::ffff:127.0.0.1`); hoặc thống nhất lại quy ước bind riêng cho test mode. Kiểm tra nhánh peer không phải loopback bằng request/socket giả để không cần mở cổng mạng khi test.

### WR-05: Reset lỗi ở bước cuối để cache giữ trạng thái cũ dù dữ liệu đợt sale đã đổi

**Classification:** WARNING
**File:** `C:/Dữ liệu của ổ D/Vo Chep Bai/CSDL phi quan he/flashsale/backend/src/services/sale-admin.service.ts:102-130`.
**Issue:** Phát hiện mới trong phạm vi dự phòng. `resetSale` sửa FlashSale, xóa đơn, sửa Redis rồi ghi StockMovement; callback xóa cache chỉ chạy ở dòng 130. Nếu Redis hoặc thao tác ghi nhật ký lỗi sau khi FlashSale đã đổi, hàm ném lỗi và không invalidate. Ví dụ một đợt ended đã được cache: reset cập nhật MongoDB thành active và nạp kho thành công, nhưng `StockMovement.create` thất bại; HTTP báo 500, API đọc thấy active, còn mọi lượt mua vẫn bị cache ended từ chối cho đến reset thành công hoặc restart. Cache không TTL (`sale-cache.ts:25-28`, `:34-36`), nên sai lệch không tự hết. Đây là nhánh reset thất bại, khác rủi ro reset đồng thời với lượt mua ở Phase 02 WR-03.
**Fix:** Xóa mục cache ngay khi thao tác cập nhật FlashSale đã có thể thay đổi dữ liệu, kể cả khi một bước sau thất bại, chẳng hạn bằng `finally` có theo dõi đã bắt đầu ghi. Tiếp tục trả lỗi reset cho caller và giữ yêu cầu không có lượt mua trong lúc reset. Thêm kiểm tra lỗi ghi StockMovement sau reset để xác nhận lần mua tiếp theo đọc lại trạng thái hiện tại, không dùng cache cũ.

### WR-06: E1 nhận số user lớn hơn ngân sách cổng nên luôn chờ rồi INVALID trước khi bắn

**Classification:** WARNING
**File:** `C:/Dữ liệu của ổ D/Vo Chep Bai/CSDL phi quan he/flashsale/loadtest/lib/config.ts:81-84,179-184`; guard: `loadtest/lib/ports.ts:14-16,90-98`; caller: `loadtest/scenarios/e1-correctness.ts:114-120`.
**Issue:** Phát hiện mới trong phạm vi dự phòng. Parser nhận `--users` tới 100000, nhưng E1 truyền nguyên số user vào `planned` của guard ngân sách cố định 10000. Với `--users 10001 --stock 100`, khi netstat chạy được thì ngay cả TIME_WAIT bằng 0, điều kiện `timeWait + planned > budget` vẫn luôn đúng. Harness chờ đủ 180 giây rồi ghi INVALID mà không gửi request. Lỗi đầu vào được phát hiện quá muộn, sau khi mở phiên và ghi đè CSV; khối finally còn reset lại đợt sale.
**Fix:** Chia sẻ giới hạn ngân sách với parser và từ chối `users > PORT_BUDGET` bằng ConfigError trước `openSession`; đồng thời cho guard từ chối ngay `planned > budget`. Nếu thật sự cần hỗ trợ nhiều hơn, thiết kế ngân sách cấu hình được và kiểm tra tương thích thay vì chờ điều kiện không thể thỏa. Kiểm tra hai biên 10000/10001 bằng đồng hồ giả, không bắn tải.

## Info

### IN-05: Boot catch blocks drop the underlying error, so non-"not running" failures are misreported

**Classification:** WARNING
**File:** `C:/Dữ liệu của ổ D/Vo Chep Bai/CSDL phi quan he/flashsale/backend/src/server.ts:34-37,49-54`.
**Issue:** Vấn đề chẩn đoán cũ, còn tồn tại. Hai catch bỏ hoàn toàn lỗi gốc và chỉ hướng dẫn bật Compose. Lỗi xác thực hoặc cấu hình kết nối sai cũng cho cùng lời khuyên, nên người chạy thiếu thông tin để tìm nguyên nhân. Giữ mức Info vì tiến trình vẫn từ chối khởi động.
**Fix:** Giữ một dòng tiếng Việt, thêm tên hoặc mã lỗi đã lọc; không in URI, thông tin đăng nhập hoặc JWT secret.

### IN-06: Helper does not clear `DOTENV_*` variables, so a developer shell can break test isolation

**Classification:** WARNING
**File:** `C:/Dữ liệu của ổ D/Vo Chep Bai/CSDL phi quan he/flashsale/backend/test/helpers.ts:117-126`.
**Issue:** Rủi ro cách ly test cũ, chưa được xử lý trong bộ lọc env: helper chỉ xóa bảy tên biến của backend, còn toàn bộ `DOTENV_*` vẫn được kế thừa vào child. Child tiếp tục import cấu hình dùng `dotenv/config`. Một shell tùy chỉnh đường dẫn/override của dotenv có thể khiến các giá trị test không còn là nguồn cấu hình duy nhất như chú thích khẳng định. Không chạy probe với đường dẫn env thật trong lần review này.
**Fix:** Xóa cả các tên bắt đầu bằng `DOTENV_` không phân biệt hoa thường trước khi áp env test. Kiểm tra env truyền cho child bằng seam giả, không mở file env của người dùng.

### IN-08: `startTestArgv` accepts spellings it cannot replay and rejects others with a wrong reason, because the allowlist and the exact-token mapping do not match dotenv's argument grammar

**Classification:** WARNING
**File:** `C:/Dữ liệu của ổ D/Vo Chep Bai/CSDL phi quan he/flashsale/backend/test/helpers.ts:186-197`.
**Issue:** Vấn đề độ tin cậy helper cũ, còn tồn tại. Token `-f=.env.test` thỏa allowlist nhưng không được chuyển thành đường dẫn tuyệt đối; chỉ token bằng chính xác `.env.test` được đổi ở dòng 195. Child chạy ở thư mục tạm (`:260-266`), nên cách viết tương đương của script làm helper đọc sai vị trí. Script hiện tại dùng cách viết được ánh xạ đúng; lỗi chỉ xuất hiện khi đổi cách viết script.
**Fix:** Chuẩn hóa và ánh xạ các dạng cờ chứa đường dẫn, hoặc từ chối ngay các dạng chưa phát lại được với thông báo đúng. Kiểm tra argv với `-f=.env.test` bằng hàm thuần.

## Dấu vết các phát hiện trước

Giữ nguyên ID và tiêu đề tiếng Anh của các vấn đề cũ được đưa vào mục Findings để bộ đối chiếu disposition nhận diện đúng. Không sửa `01-REVIEW-DISPOSITION.md`.

- WR-02 vẫn được ghi fixed bởi plan 01-10; `helpers.ts:214` tiếp tục suy argv từ `START_TEST_SCRIPT`. CR-01 cũ về nodeEnv/testMode cũng không được mở lại.
- IN-01/IN-02 liên quan env template/test không nằm trong phạm vi đọc của lần này; không kết luận đã sửa hoặc đóng.
- IN-03 về Node tối thiểu không được xác nhận lại trên runtime Node 20; không đưa giả thuyết đó vào số đếm hiện tại.
- IN-04/IN-07/IN-09 không giữ trong số đếm lần này: các nhận xét về API helper chưa dùng, thời điểm báo thiếu dependency và assertion lặp không chứng minh suy giảm độ tin cậy của các test đang chạy. Đây không phải xác nhận các dòng đó đã được sửa. IN-09 nằm ngoài phạm vi file thay đổi hiện tại.

---

_Reviewed: 2026-11-11T09:44:33Z_
_Reviewer: Codex (gsd-code-reviewer)_
_Depth: standard_
