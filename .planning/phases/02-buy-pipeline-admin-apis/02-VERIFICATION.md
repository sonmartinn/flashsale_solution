---
phase: 02-buy-pipeline-admin-apis
verified: 2026-11-12T04:20:43Z
status: passed
score: 44/44 must-haves verified
covered_files: [".planning/phases/02-buy-pipeline-admin-apis/02-01-PLAN.md",".planning/phases/02-buy-pipeline-admin-apis/02-01-SUMMARY.md",".planning/phases/02-buy-pipeline-admin-apis/02-02-PLAN.md",".planning/phases/02-buy-pipeline-admin-apis/02-02-SUMMARY.md",".planning/phases/02-buy-pipeline-admin-apis/02-03-PLAN.md",".planning/phases/02-buy-pipeline-admin-apis/02-03-SUMMARY.md",".planning/phases/02-buy-pipeline-admin-apis/02-04-PLAN.md",".planning/phases/02-buy-pipeline-admin-apis/02-04-SUMMARY.md",".planning/phases/02-buy-pipeline-admin-apis/02-05-PLAN.md",".planning/phases/02-buy-pipeline-admin-apis/02-05-SUMMARY.md","backend/package.json","backend/scripts/cli-args.ts","backend/scripts/reconcile.ts","backend/src/app.ts","backend/src/config/redis.ts","backend/src/controllers/admin.controller.ts","backend/src/controllers/order.controller.ts","backend/src/controllers/product.controller.ts","backend/src/controllers/sale.controller.ts","backend/src/lua/buy.lua","backend/src/middlewares/auth.ts","backend/src/models/order.ts","backend/src/routes/admin.routes.ts","backend/src/routes/index.ts","backend/src/routes/order.routes.ts","backend/src/routes/product.routes.ts","backend/src/routes/sale.routes.ts","backend/src/server.ts","backend/src/services/catalog.service.ts","backend/src/services/lua.ts","backend/src/services/order.service.ts","backend/src/services/purchase.service.ts","backend/src/services/reconcile.service.ts","backend/src/services/sale-admin.service.ts","backend/src/services/sale-cache.ts","backend/src/services/stock.service.ts","backend/src/types/ioredis.d.ts","backend/src/utils/dto.ts","backend/src/utils/http-error.ts","backend/test/cli-args.test.ts","backend/test/helpers.ts","backend/test/integration/admin.test.ts","backend/test/integration/buy.test.ts","backend/test/integration/compensation.test.ts","backend/test/integration/harness-support.test.ts","backend/test/integration/lua.test.ts","backend/test/integration/read.test.ts","backend/test/integration/reconcile.test.ts"]
covered_digest: "v4:sha256:fb253a03da911046655bd3ecda525c93add33bdfd65d393b306866922bdc5bd8"
behavior_unverified: 0
overrides_applied: 0
human_verified: 2
human_verification: []
re_verification:
  previous_status: passed
  previous_score: 42/44
  gaps_closed:
    - "Đã đối chiếu 02-UAT complete 5/5: ba quyết định rủi ro và hai backstop đã được người dùng xác nhận."
    - "Năm file stale do mở rộng Phase 03 đã được kiểm tra lại; mặc định Phase 02 được giữ."
  gaps_remaining: []
  regressions: []
decision_coverage:
  honored: 35
  total: 35
  not_honored: []
accepted_risks:
  - finding: WR-01
    source: "02-UAT.md test 1, result pass; 02-REVIEW-DISPOSITION.md deferred"
    limitation: "Ghi đơn mơ hồ rồi lookup chưa thấy đơn có thể hoàn kho sai; chưa được sửa."
  - finding: WR-02
    source: "02-UAT.md test 2, result pass; 02-REVIEW-DISPOSITION.md deferred"
    limitation: "ioredis có thể gửi lại lệnh không idempotent sau mất kết nối; chưa được sửa."
  - finding: WR-04
    source: "02-UAT.md test 3, result pass; 02-REVIEW-DISPOSITION.md deferred"
    limitation: "Bảo đảm V1/V2 yêu cầu mọi lượt mua dùng đúng sale.mode; API vẫn cho trộn mode theo D-03."
advisory:
  - finding: "WR-03: reset/bù kho chưa đồng bộ với lượt mua đang xử lý"
    category: architectural
    reason: "Cảnh báo cũ; preflight Phase 03 giảm rủi ro nhưng không chứng minh server đã hết request. Không coi đã sửa."
    evidence_status: "Không chạy ca tái hiện mới; giữ WARNING trong review."
  - finding: "WR-06: reset lỗi sau khi dữ liệu đổi có thể giữ cache cũ"
    category: other
    reason: "Đã có trong review Phase 01 tại e382cbb; không phải regression mới. Test reset thành công không chứng minh nhánh này."
    evidence_status: "Không có test tái hiện red trong lượt này; giữ WARNING trong review."
---

# Phase 2: Buy Pipeline & Admin APIs Verification Report

**Phase Goal:** Users can read products and sales and buy through V0, V1 or V2 with identical response codes; an admin can reset and inspect a sale and reconcile Redis against MongoDB
**Verified:** 2026-11-12T04:20:43Z
**Status:** passed
**Re-verification:** Có — làm mới fingerprint sau Phase 03 và đối chiếu UAT đã hoàn tất.

Mục tiêu Phase 02 đạt trong phạm vi SPECS và các giới hạn đã được người dùng chấp nhận. Đã đọc mã triển khai, kiểm tra các kết nối và assertion; không dùng SUMMARY làm bằng chứng chạy thành công. Điểm 44/44 gồm 5 tiêu chí roadmap và 39 truth của PLAN, giữ cách đếm báo cáo trước: 42 có bằng chứng nguồn/test, 2 backstop được giải quyết bằng xác nhận người dùng tại UAT tests 4–5. Hai mục sau không được trình bày như đã có thêm test concurrency.

Báo cáo cũ có frontmatter `passed` nhưng phần thân còn `human_needed` và 42/44. `02-UAT.md` cập nhật 2026-11-09T07:11:32.948Z đã complete 5/5, không có issue/pending. Lần này đồng bộ lại báo cáo theo chấp thuận có sẵn, không tạo quyết định sản phẩm mới.

## Goal Achievement

### Observable Truths — Roadmap

| # | Truth | Status | Evidence |
|---|---|---|---|
| SC1 | Đọc sản phẩm/active sales; remaining theo sale.mode, giờ server; chỉ đơn của người gọi, mới nhất trước | ✓ VERIFIED | catalog/stock/dto và read.test: 400/404, active filter/sort, V0 âm, V2 Redis/missing key, JWT/x-test-user isolation, cap 100 |
| SC2 | Buy dùng mã 201/409/400/503 thống nhất; qty -5 không tăng kho | ✓ VERIFIED | sale.controller FAILURES và kiểm tra trước purchase.buy; buy.test chạy ma trận ba mode, snapshot kho không đổi; D-07 là ngoại lệ đã chốt |
| SC3 | V0 bán quá, V1 không vượt kho trong burst; Lua RESP3 có đủ 4 mã và đúng 100/1000; V2 không giảm kho Mongo | ✓ VERIFIED | buy.test burst 100/10 kiểm tra số đơn/kho/buyers; lua.test kiểm tra 1/0/-1/-2 và 100/1000, log hiện tại đều đạt |
| SC4 | Bù kho đúng nhánh trước audit; thành công im lặng; một createOrder/cache; reset xóa cache | ✓ VERIFIED | purchase.service await refund→movement; compensation.test kiểm tra nhánh lỗi/201/no-refund/refund-fail; admin.test cache ended→reset→201; giới hạn WR-01/02 giữ nguyên |
| SC5 | Admin reset/stats; reconcile exit 0/2/1 và --fix theo MongoDB | ✓ VERIFIED | admin router guard trước route; sale-admin/reconcile service và CLI có I/O thật; admin/reconcile tests kiểm tra giá trị, exit code, fix và bất biến MongoDB |

### Observable Truths — PLAN (39)

Các ID dưới đây theo thứ tự `must_haves.truths` trong từng PLAN. Bằng chứng test là kết quả thực thi được orchestrator lưu ngày 2026-11-11 trên mã hiện tại; đã đọc lại các assertion tương ứng.

| # | Truth | Status | Evidence |
|---|---|---|---|
| 02-01.1 | Auth buy ba mode → 201 với OrderDto đủ 8 trường | ✓ VERIFIED | buy.test: “v0, v1, v2 đều trả 201 { order } đúng D-20”; kiểm tra price/mode/createdAt và Order thật |
| 02-01.2 | Thứ tự D-01 và dừng ở lỗi đầu | ✓ VERIFIED | buy.test “thứ tự kiểm tra D-01: 401 -> INVALID_MODE -> VALIDATION_ERROR -> INVALID_ID”; controller/service kiểm tra sale trước stock |
| 02-01.3 | Input bị từ chối không sửa kho/buyers; qty sai không tăng kho | ✓ VERIFIED | buy.test hai ma trận INVALID_MODE/VALIDATION_ERROR, snapshot Mongo/GET/SCARD trước-sau, count order 0 |
| 02-01.4 | SOLD_OUT/ALREADY_BOUGHT/STOCK_NOT_LOADED, ngoại lệ D-07 | ✓ VERIFIED | buy.test kho 1/kho 5/missing key và ca D-07 từng mode; một FAILURES map |
| 02-01.5 | E11000 → ALREADY_BOUGHT, V0 không hoàn | ✓ VERIFIED | buy.test repeat buyer và V0 remainingQty=3 sau hai lần trên kho 5; compensation E11000 V1/V2 |
| 02-01.6 | Burst 100/10: V1/V2 đúng 10; V0 bán quá trong ≤3 lần | ✓ VERIFIED | buy.test assertions 10 orders/90 SOLD_OUT; V2 Mongo 10, Redis 0, SCARD 10 và tập buyers=order users |
| 02-01.7 | Lua RESP3 đủ 4 mã, đúng 100 thành công/1000 | ✓ VERIFIED | lua.test “client đã thương lượng RESP3”, “bốn mã trả về”, “1.000 lời gọi song song…” |
| 02-01.8 | Một cache single-flight, 6 trường tĩnh, không cache null; invalidate một/mọi mục | ✓ VERIFIED | sale-cache Map set trước await, guard đúng promise khi evict; buy.test single-flight/null/keys/invalidate |
| 02-01.9 | Thành công không log/warning/movement; chung createOrder | ✓ VERIFIED | buy.test tracer đếm console/emitWarning/movement bằng 0; routes và purchase dùng defaultCreateOrder |
| 02-01.10 | Compiled server đăng ký Lua và trả 201 cả ba mode | ✓ VERIFIED | buy.test “server đã biên dịch … đăng ký buy.lua … trả 201 cho cả ba mode” đạt; server gọi registerBuyScript sau connectRedis |
| 02-02.1 | Reconcile V2 stock và đúng tập buyers; thiếu key là drift | ✓ VERIFIED | reconcile.test service: stock 7=10-3, lệch stock, missing key/buyer, extra buyer; count success + distinct userIds |
| 02-02.2 | CLI in expected/actual, thiếu/thừa ≤10 mẫu; bỏ qua V0/V1 | ✓ VERIFIED | reconcile.ts describeCheck/sample(SAMPLE_IDS=10), CLI tests stock 9/missing key/extra buyer/skip v1 |
| 02-02.3 | Exit 0 sạch/sửa xong, 2 lệch, 1 lỗi | ✓ VERIFIED | reconcile.test CLI/CLI --fix spawn thật kiểm tra mã và Redis, parser từ chối input sai |
| 02-02.4 | --fix một checked multi, audit delta, recheck | ✓ VERIFIED | reconcile.test stock9→7/buyers sửa đúng, missing key delta7/no orders, exec null/per-command error; service await exec→movement→check |
| 02-02.5 | Không cần JWT, loadBaseConfig/cổng guard, cảnh báo no-inflight; service dùng chung | ✓ VERIFIED | CLI tests không cấp JWT, helper cwd tạm; reconcile.ts loadBaseConfig và cảnh báo đầu tiên; logic nằm createReconcileService |
| 02-03.1 | V1 E11000 hoàn $inc trước compensate_v1 và ALREADY_BOUGHT | ✓ VERIFIED | compensation.test tracer V1 kiểm tra remainingQty trở lại 5 và đúng movement delta1 |
| 02-03.2 | V2 E11000 chỉ INCRBY, giữ buyer, compensate_v2 | ✓ VERIFIED | compensation.test tracer V2 kiểm tra stock5, SISMEMBER1 và movement |
| 02-03.3 | Non-E11000: có đơn →201/no refund; vắng→refund/rethrow; lookup lỗi→no refund | ✓ VERIFIED | compensation.test hai nhóm V1/V2, exact order ID/kho/buyers/movement và error identity; không chứng minh mọi network-ambiguous schedule (WR-01 đã chấp nhận) |
| 02-03.4 | Refund lỗi → Error mới/cause/500 và một log; audit lỗi không đổi refund | ✓ VERIFIED | compensation.test bốn nhánh refund-fail + HTTP V1, cause/code/log IDs; ca StockMovement lỗi vẫn kho5 |
| 02-03.5 | Thành công im lặng; V0 không hoàn | ✓ VERIFIED | compensation.test “mua thành công một lần mỗi mode…” 0 console/movement; V0 repeat test |
| 02-03.6 | 10 lần đồng thời cùng user →1 đơn, chỉ trừ1 V1/V2 | ✓ VERIFIED | compensation.test E3 asserts 1 ok/9 already_bought, count1, V1 kho9, V2 stock9/SCARD1 |
| 02-04.1 | Reset HTTP chung service CLI, DTO ISO; mode tùy chọn | ✓ VERIFIED | admin.test tracer và reset không body trong ca cache; mode/qty mặc định giữ nguyên bằng opts ?? dữ liệu hiện tại |
| 02-04.2 | Reset input object/mode/id sai →400/404 | ✓ VERIFIED | admin.test []/v3/V2/null/2/array/abc/unknown; validation trước service |
| 02-04.3 | HTTP reset xóa cache của app đang chạy | ✓ VERIFIED | admin.test ended cached→direct DB active vẫn400→reset không body→buy201 |
| 02-04.4 | Stats giữ đủ D-25, null/sync đúng theo mode | ✓ VERIFIED | admin.test exact keys và giá trị, missing stock/v1/switch mode; 03-01 chủ ý thêm uniqueOrderIndex thành12 trường, 11 trường D-25 nguyên vẹn |
| 02-04.5 | Toàn admin guard401/403, test user không admin | ✓ VERIFIED | router.use(requireAuth,requireAdmin) trước cả hai route; admin.test user JWT/x-test-user/no token |
| 02-04.6 | Reset hai lần hội tụ mode/totalQty, một movement | ✓ VERIFIED | admin.test “hai lần reset liên tiếp…” exact hai kết quả và count reset=1 |
| 02-04.7 | Sau V2 burst stats đúng và reconcile sạch | ✓ VERIFIED | admin.test V2(D-34) asserts orders/users10, oversold0, Redis0/10, Mongo10, sync true, checkSale.inSync |
| 02-04.8 | Reset modeV0 rồi burst thấy oversold/kho âm | ✓ VERIFIED | admin.test V0 tối đa3 lần, asserts mode/oversold=orders-10/remaining<0/redisInSync null |
| 02-05.1 | SaleDto/now ISO, ended vẫn200, bad/unknown400/404 | ✓ VERIFIED | read.test GET /sales/:id exact key sets/product/ISO/now và ended/bad ID |
| 02-05.2 | remaining theo mode; âm giữ nguyên; thiếu V2 tính success count và flag | ✓ VERIFIED | read.test V0 -3, V1 4, V2 Redis7/Mongo10, missing2success+1cancelled→8/false |
| 02-05.3 | Active đúng status/time, sort, một now | ✓ VERIFIED | read.test active fixture mixed statuses/times, expected sorted IDs; controller lấy một Date |
| 02-05.4 | List V2 một MGET; không V2 thì không gọi | ✓ VERIFIED | read.test spy mget callCount1/0 và giá trị từng mode |
| 02-05.5 | Products sorted/DTO, detail400/404 | ✓ VERIFIED | read.test products6/keys/attributes/description/order và detail/error; catalog find/findById |
| 02-05.6 | Orders authenticated/own/newest/cap100 + product | ✓ VERIFIED | read.test x-test-user/JWT trả đúng IDs, anonymous401, 105→100 |
| 02-05.7 | Order isolation từ req.user.id | ✓ VERIFIED | controller không nhận userId ngoài request auth; read.test ba đơn caller và user khác không xuất hiện |
| 02-05.8 | JSON object, không _id/__v | ✓ VERIFIED | explicit DTO mappers; read.test assertNoMongoInternals trên endpoint, key sets cụ thể |
| 02-05.9 | Backstop READ-01: product read không có side effect khi đồng thời | ✓ VERIFIED (UAT) | Người dùng xác nhận 02-UAT test4 pass: chấp nhận review chỉ find/findById().lean(), không writer; không có concurrency test mới |
| 02-05.10 | Backstop READ-03: snapshot lấy từ đúng store trong burst | ✓ VERIFIED (UAT) | Người dùng xác nhận 02-UAT test5 pass: chấp nhận test per-mode là đủ; không tuyên bố vừa poll burst hay có test mới |

**Score:** 44/44; 0 PRESENT_BEHAVIOR_UNVERIFIED. Hai backstop được đóng bởi human resolution đã lưu, không nâng từ presence checks đơn thuần. Các invariant chuyển trạng thái còn lại có test đã thực thi trong log hiện tại.

### Prohibitions và giới hạn đã chấp nhận

| Plan | Must-NOT | Evidence / disposition |
|---|---|---|
| 02-01 P1 | V1/V2 không vượt kho/không trùng đơn; ưu tiên undersell | Burst và Lua/E3 có exact assertions; **không phải bảo đảm vô điều kiện**. WR-01/02/04 vẫn tồn tại, người dùng đã chấp nhận tại UAT1–3; bảo đảm yêu cầu mua đúng sale.mode, không trộn kho |
| 02-01 P2 | Không delay/lock/clamp che race V0 hoặc thêm success log/movement | Test V0 thật sự bán quá, tracer zero console/emitWarning/movement; đọc handler không có delay/lock/clamp |
| 02-02 P1 | --fix không sửa orders/flash_sales | reconcile.test P3 deepEqual cả hai collection trước/sau fixSale; service chỉ sửa Redis và audit |
| 02-03 P1 | Không hoàn khi có đơn/lookup lỗi, không SREM buyer thật; ambiguous→undersell | Matrix test enforcement cho các nhánh xác định; WR-01 là ngoại lệ đã được người dùng chấp nhận, chưa được sửa |
| 02-03 P2 | Không thêm success log/movement | compensation.test success cả ba mode kiểm tra count trước/sau và 0 console calls |

Không còn prohibition chờ quyết định: các flag cũ đã có người dùng giải quyết trong UAT. Chấp thuận không chứng minh khả năng chống bán quá trong mọi lỗi mạng. Phase 05 cần ghi WR-01/02/04 và các đánh đổi SPECS §8; WR-02 cần được cân nhắc khi làm E4.

## Required Artifacts

Đã chạy owner `query verify.artifacts <PLAN>` và `query verify.key-links <PLAN>` lần này; mọi lệnh exit0.

| Plan | Artifacts | Key links |
|---|---:|---:|
| 02-01 | 11/11 | 5/5 |
| 02-02 | 5/5 | 3/3 |
| 02-03 | 2/2 | 3/3 |
| 02-04 | 5/5 | 3/3 |
| 02-05 | 7/7 | 4/4 |
| **Tổng** | **30/30** | **18/18** |

| Artifact/nhóm | Status | Substantive + wired |
|---|---|---|
| purchase.service, order.service, sale-cache | ✓ VERIFIED | Handler V0 find→$inc; V1 atomic $gte; V2 Lua; defaultCreateOrder một nơi; routes/index tạo một cache; refund await và kiểm tra Redis exec |
| lua.ts, buy.lua, types/ioredis.d.ts, server.ts | ✓ VERIFIED | Script thật SISMEMBER/GET/DECRBY/SADD; URL đọc file hợp lệ đường dẫn Unicode; defineCommand tại boot sau Redis; kiểu custom command, build copy Lua |
| sale/admin/product/order controllers + routes/index | ✓ VERIFIED | Handler gọi service có await; guard đúng chỗ, /active trước /:id; mapper explicit |
| catalog.service, stock.service, dto.ts | ✓ VERIFIED | Query Mongo và MGET, fallback success count; query orders chỉ req.user.id; không dữ liệu giả |
| sale-admin.service | ✓ VERIFIED | Reset Mongo/delete/Redis checked multi/audit/hook; stats 6 reads thật; totalQty tùy chọn và uniqueOrderIndex theo 03-01 |
| reconcile.service, scripts/reconcile, cli-args, package.json | ✓ VERIFIED | CLI parse/config/connect/service/exit; fix SET/DEL/SADD checked multi, no Mongo order/sale write; npm script thật |
| helpers, cli-args.test và sáu integration files | ✓ VERIFIED | Cwd/DB/Redis cách ly; spawn CLI/server thật và seam lỗi cục bộ; có trong package test/test:int, không skip |

### Key Link Verification

| From | To / via | Status |
|---|---|---|
| server | connectRedis → registerBuyScript → createApp/listen; ensureIndexes trước nhận request | ✓ WIRED |
| routes/index | một saleCache → purchase; cùng invalidate → saleAdmin; mount catalog cho products/sales/orders | ✓ WIRED |
| sale route/controller | requireAuth → validate → purchase.buy → mode handler → shared Order.create → OrderDto/FAILURES | ✓ WIRED |
| purchase | V2 runBuyScript; lỗi insert → compensate → awaited refund → StockMovement | ✓ WIRED |
| admin route/controller | requireAuth→requireAdmin→resetSale/getStats; reset callback xóa cache purchase đang dùng | ✓ WIRED |
| catalog | FlashSale/Product/Order query → remainingFor → DTO → res.json | ✓ WIRED |
| reconcile CLI | parseReconcileArgs→loadBaseConfig→stores→check/fix→diff/exitCode; helper spawnCli hỗ trợ reconcile | ✓ WIRED |

### Data-Flow Trace (Level 4)

| Đầu ra | Nguồn → biến → response | Status |
|---|---|---|
| Products/product summary | Product.find/findById/$in → explicit product mapper → controller JSON | ✓ FLOWING |
| Sale remaining/stockLoaded | FlashSale.mode → Mongo remainingQty hoặc Redis MGET; key thiếu→Order.countDocuments(success) → SaleDto | ✓ FLOWING |
| Own orders | req.user.id → Order.find sorted/limit100 → Product $in → MyOrderDto | ✓ FLOWING |
| Buy order | shared Order.create hoặc lookup đơn đã ghi → toOrderDto → 201 {order} | ✓ FLOWING |
| Admin stats | FlashSale.findById, Order count/distinct/listIndexes, Redis GET/SCARD → stats | ✓ FLOWING |
| Reset / reconcile CLI | stores thật → ResetResult / SaleCheck → DTO hoặc diff/exit; fix audit sau Redis exec | ✓ FLOWING |

## Behavioral Spot-Checks

| Hành vi | Lệnh / nguồn bằng chứng | Kết quả |
|---|---|---|
| Typecheck/build | Backend `npm.cmd run typecheck`; build trong `npm.cmd test` và `test:int`, orchestrator chạy ngoài sandbox | PASS, exit0 |
| Unit | `npm.cmd test`, log `C:/Users/sonma/AppData/Local/Temp/flashsale-reverify-unit.log` ngày 2026-11-11 | 172/172, fail/skipped/todo0 |
| Integration | `npm.cmd run test:int`, log `C:/Users/sonma/AppData/Local/Temp/flashsale-reverify-integration.log` | 200/200, fail/skipped/todo0; buy/compensation/admin/read/lua/reconcile/harness-support đều có mặt |
| Mã không drift sau lượt test | `git diff --name-only e382cbb -- backend/src backend/scripts backend/test backend/package.json`; `git status --porcelain -- backend` | Rỗng |
| CLI spot-check riêng trong sandbox | Trong backend: `node --import tsx --test --test-name-pattern='parseReconcileArgs&#124;mặc định: không sale, không mode, không qty' test/cli-args.test.ts` | Không chạy được assertion: tsx gọi os.userInfo lỗi uv_os_get_passwd ENOMEM trước load file. Cùng file đã PASS trong full unit ngoài sandbox; không phân loại thành product failure |

Không chạy lại suite, server, container hoặc phép đo chính thức. Bằng chứng hành vi ở trên lấy từ log thực thi của orchestrator trên nguồn không đổi, không từ con số trong SUMMARY.

**Bằng chứng lịch sử:** báo cáo 2026-11-08 từng ghi 175/175 integration, smoke wrapper start:test không đụng demo data. SUMMARY 02-01 ghi mutation 12/44 red, nhưng lần này không tái tạo hoặc dùng tuyên bố đó làm proof mới. Manual compiled-server gate của VALIDATION được kiểm tra bởi ca tự động spawn node dist/server.js thực hiện ba buy201 trên DB cách ly; wrapper start:test đã được reverify Phase01 (82/82). Không còn bước thủ công phải mua trên database demo.

### Probe Execution

SKIPPED: không có thư mục scripts/ cấp repo hoặc probe shell convention; PLAN/SUMMARY Phase02 không khai báo probe-*.sh. Không thay probe bằng lời kể PASS.

## Requirements Coverage

| Requirement | Plan | Mô tả / bằng chứng | Status |
|---|---|---|---|
| READ-01 | 02-05 | Products list/detail400/404; read.test và UAT4 | ✓ SATISFIED |
| READ-02 | 02-05 | Active time/status/product, một MGET; read.test | ✓ SATISFIED |
| READ-03 | 02-05 | remaining theo mode/flag/now; read.test và UAT5 | ✓ SATISFIED |
| READ-04 | 02-05 | Own orders sort/cap/auth; read.test | ✓ SATISFIED |
| BUY-01 | 02-01 | D-01 thứ tự checks/input validation; buy.test | ✓ SATISFIED |
| BUY-02 | 02-01,04 | Một static cache, no remainingQty, HTTP reset invalidate; buy/admin tests | ✓ SATISFIED |
| BUY-03 | 02-01 | FAILURES code map và per-mode matrix, ngoại lệ D-07 | ✓ SATISFIED |
| BUY-04 | 02-01 | V0 findOne/$inc, burst âm, không clamp | ✓ SATISFIED |
| BUY-05 | 02-01,03 | V1 atomic $gte/await refund/lookup; giới hạn WR-01 đã chấp nhận | ✓ SATISFIED |
| BUY-06 | 02-01 | Lua defineCommand/result check, Mongo remaining giữ nguyên | ✓ SATISFIED |
| BUY-07 | 02-03 | Refund Redis đúng nhánh, kiểm tra exec, audit sau; WR-01/02 còn giới hạn | ✓ SATISFIED |
| BUY-08 | 02-01,03 | Chung createOrder, silent success, no movement | ✓ SATISFIED |
| BUY-09 | 02-01 | RESP3/4 mã/1000→100; lua.test | ✓ SATISFIED |
| ADMIN-01 | 02-04 | HTTP reset optional mode, no-body defaults; admin.test | ✓ SATISFIED |
| ADMIN-02 | 02-04 | Stats D-25 + trường bổ sung Phase03; admin/harness-support tests | ✓ SATISFIED |
| ADMIN-03 | 02-02 | Reconcile check/diff/codes/fix/Mongo invariant; cli/reconcile tests | ✓ SATISFIED |

Đủ 16 ID được PLAN nhận và REQUIREMENTS traceability gán Phase02; không orphan. REQUIREMENTS hiện đã đánh dấu Complete, nhận xét “còn Pending” của báo cáo cũ không còn đúng.

## Anti-Patterns và Advisory

Scan `backend/src`, `backend/scripts`, `backend/test` không có TBD/FIXME/XXX hoặc TODO/HACK/PLACEHOLDER; không có disabled/todo test. Các return [] khi query rỗng, DTO attributes mặc định và hook no-op CLI có đường dữ liệu thật hoặc lý do thiết kế; không phải stub.

| File / mục | Severity | Tác động |
|---|---|---|
| purchase.service console.error ở nhánh compensation | INFO | Có chủ đích D-12; test xác nhận im lặng khi mua thành công |
| purchase/redis/sale.controller: WR-01/02/04 | WARNING đã chấp nhận | UAT1–3 pass, disposition deferred; không mở lại, không tuyên bố đã sửa |
| sale-admin.service:102-130, purchase refund: WR-03 | WARNING / advisory | Reset khi còn request có thể sai baseline. Giữ cảnh báo cũ; preflight chỉ kiểm tra snapshot, không phải fence |
| sale-admin.service:102-130: WR-06 | WARNING / advisory | Lỗi sau khi dữ liệu đổi có thể bỏ qua invalidate. Đã có trong review Phase01, nguồn không đổi; không có ca red mới; không phủ nhận truth reset thành công |
| loadtest config/ports: WR-07 | WARNING ngoài Phase02 | Budget cổng E1 thuộc Phase03, không thay verdict API Phase02 |

Review mới: 39 files, 0 critical, 3 warning; disposition giữ lịch sử WR-05/IN-01..06, không tự đóng chúng vì suite xanh. Không có blocker mới có deterministic evidence trong phạm vi xác minh này.

### Test Quality Audit

| Test file | Linked requirements | Active / skipped | Circular | Assertion mạnh nhất | Verdict |
|---|---|---|---|---|---|
| buy.test, lua.test | BUY-01..06,08,09 | Có / 0 | Không | Exact codes/keys, before-after kho, số đơn và buyers sau burst, compiled server | Đạt |
| compensation.test | BUY-05,07,08 | Có / 0 | Không | Error identity/cause, no-refund/refund, stock/buyer/audit/log counts, E3 | Đạt trong lỗi xác định; WR-01 không có proof mạng mơ hồ |
| admin.test, harness-support.test | ADMIN-01,02; BUY-02 | Có / 0 | Không | ended→reset→201, idempotent reset, exact stats, input bất biến, real index | Đạt; không chứng minh nhánh failed reset cache WR-06 |
| read.test | READ-01..04 | Có / 0 | Không | Exact IDs/order/DTO/remaining, batching counts, auth isolation, cap100 | Đạt; hai backstop còn dựa human resolution UAT |
| cli-args.test, reconcile.test | ADMIN-03 | Có / 0 | Không | Arg rejection, spawned exit/stdout, exact set/stock/audit, Mongo deepEqual | Đạt ngoài sandbox |

Không có helper ghi golden fixture lấy từ chính output đang kiểm tra. Snapshot trước-sau dùng để chứng minh bảo toàn dữ liệu. Expected số lượng/mã/khóa xuất phát từ SPECS/CONTEXT; không chỉ assert status/tồn tại.

**Phản chứng:** test lỗi insert dùng seam xác định không bao phủ insert còn commit ở mạng mơ hồ; test reset thành công không thử lỗi audit sau update; hai backstop không có test concurrency riêng. Các giới hạn này được giữ rõ qua UAT/risk/advisory, không suy từ “suite xanh” ra bảo đảm mạnh hơn.

### Decision Coverage

Owner `query check.decision-coverage-verify`: **35/35 honored**, `not_honored: []`, `blocking: false`.

D-01..07 có checks/codes/ngoại lệ; D-08..15 shared insert/compensation/Lua; D-16..19 cache và read fresh; D-20..23 DTO/read; D-24..25 reset/stats; D-26..31 reconcile; D-32..35 isolation và matrix/bursts. Gate heuristic được đối chiếu với mã thật. Mở rộng stats từ11 thành12 trường là yêu cầu 03-01, không phải rơi mất D-25.

Nyquist validated/compliant, 22 threat closed/0 open trong security L1 và UI N/A đã được hook kiểm tra. Kết quả này bổ trợ, không thay proof nguồn/hành vi.

### Deferred Items và phạm vi sau

Không lọc một failed must-have nào khỏi verdict bằng roadmap tương lai. Phase03 sở hữu thí nghiệm/load harness, Phase04 sở hữu giao diện, Phase05 sở hữu phân tích rủi ro/runbook. WR-01/02/04 đã chấp nhận và cần ghi ở Phase05; WR-03 vẫn còn WARNING, không coi preflight Phase03 đã sửa được race reset. WR-06 cũng chưa được sửa.

### Human Verification Required

Không còn mục chờ. `02-UAT.md` tests1–5 đều pass: người dùng đã giải quyết WR-01/02/04 và chấp nhận review/test per-mode cho hai backstop. Không yêu cầu phê duyệt lại các quyết định này. Không có human-check deferred mới hoặc truth PRESENT_BEHAVIOR_UNVERIFIED.

### Gaps Summary

Không có gap chặn hoặc regression Phase02. Thay đổi Phase03 chỉ mở rộng reset số lượng tùy chọn và stats index; reset không truyền tùy chọn vẫn giữ cỡ kho/mode, reconcile parser giữ nguyên. Bảo đảm V1/V2 có các điều kiện/rủi ro đã nêu, không phải tuyên bố xử lý đúng mọi lỗi mạng hay trộn mode.

Fingerprint lấy nguyên `covered_files`/`covered_digest` từ owner; PLAN/SUMMARY được thêm tự động, báo cáo không tự tham gia digest. Chỉ sửa báo cáo này; không sửa nguồn/test/config/tracking, không commit.

---

_Verified: 2026-11-12T04:20:43Z_
_Verifier: Codex (gsd-verifier)_
