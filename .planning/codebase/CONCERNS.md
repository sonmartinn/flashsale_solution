---
last_mapped_commit: 2c310436edd3b718349e11b11f80e93f3bb3b0b9
last_mapped_at: 2026-11-11
---
# Codebase Concerns

**Analysis Date:** 2026-11-11

## Tech Debt

**WR-01 — bù trừ sau lỗi ghi đơn chưa xác định kết quả, rủi ro đã chấp nhận:**
- Issue: `compensate()` tra đơn sau lỗi không phải E11000; nếu kết quả là `null` thì hoàn kho. Lần ghi gốc có thể vẫn đang hoàn tất nên việc đọc chưa thấy đơn không chứng minh rằng đơn sẽ không được ghi.
- Files: `backend/src/services/purchase.service.ts`, `.planning/phases/02-buy-pipeline-admin-apis/02-UAT.md`, `.planning/STATE.md`.
- Impact: Có thể tạo thêm khả năng bán hàng sau một lần ghi mơ hồ, dẫn đến vượt `totalQty`; chú thích “không bao giờ bán quá” trong hàm không bao phủ trường hợp này. Đây là rủi ro tồn dư đã chấp nhận, không phải lỗi mới được tái hiện trong lần lập bản đồ.
- Fix approach: Ghi giới hạn vào tài liệu Phase 5 như `.planning/STATE.md` yêu cầu. Nếu mở rộng xử lý, phân loại lỗi chứng minh chưa ghi và lỗi không xác định; không tự hoàn kho cho nhóm không xác định. Không thêm transaction MongoDB standalone trái `docs/SPECS.md`.

**WR-02 — khả năng phát lại lệnh Redis khi kết nối lại, rủi ro đã chấp nhận:**
- Issue: `createRedis()` đặt `maxRetriesPerRequest: 1` nhưng không đặt `autoResendUnfulfilledCommands`; cấu hình chưa vô hiệu hóa việc phát lại lệnh chưa có phản hồi theo rủi ro được ghi nhận trong UAT.
- Files: `backend/src/config/redis.ts`, `backend/src/services/purchase.service.ts`, `.planning/phases/02-buy-pipeline-admin-apis/02-UAT.md`.
- Impact: Một lệnh hoàn kho `INCRBY` có thể được thực thi lại nếu phản hồi bị mất. Kết quả Lua không có phản hồi cũng cần được phân tích theo trạng thái buyers; không suy ra tính exactly-once từ tính nguyên tử của Lua.
- Fix approach: Trình bày rủi ro trong Phase 5; xem lại chính sách phát lại và xây dựng phép thử mất kết nối giữa lệnh trước khi khẳng định hành vi khi Redis lỗi. E4 ngắt MongoDB không tự chứng minh trường hợp ngắt Redis.

**Bằng chứng xác minh cần đồng bộ với trạng thái bàn giao:**
- Issue: `.planning/HANDOFF.json` yêu cầu xác minh lại Phase 01/02 và kiểm tra acceptance criteria của 03-05. Frontmatter của hai báo cáo xác minh hiện vẫn ghi `status: passed`; không dùng nó để khẳng định HEAD đã được kiểm tra lại.
- Files: `.planning/HANDOFF.json`, `.planning/STATE.md`, `.planning/phases/01-foundation-infra-data-auth/01-VERIFICATION.md`, `.planning/phases/02-buy-pipeline-admin-apis/02-VERIFICATION.md`, `.planning/phases/03-experiments-e1-e4/03-05-PLAN.md`.
- Impact: Báo cáo hoặc kế hoạch có thể tin vào số lượng plan và kết quả kiểm thử chưa đồng bộ với mã nguồn đang có. CSV đã có không đồng nghĩa checkpoint đã được agent xác nhận.
- Fix approach: Dùng acceptance criteria của 03-05 kiểm tra `loadtest/results/e1.csv`, `loadtest/results/e2.csv`, `loadtest/results/e3.csv`, viết summary qua GSD, rồi chạy lại các cổng xác minh cần thiết. Lần lập bản đồ này không chạy test hay phép đo.

## Known Bugs

**WR-04 — trộn mode sử dụng hai nguồn tồn kho, giới hạn đã chấp nhận:**
- Symptoms: Tổng đơn có thể vượt `totalQty` dù từng nhánh V1/V2 trừ kho nguyên tử.
- Files: `backend/src/controllers/sale.controller.ts`, `backend/src/services/purchase.service.ts`, `backend/src/services/sale-cache.ts`, `.planning/phases/02-buy-pipeline-admin-apis/02-UAT.md`, `docs/SPECS.md`.
- Trigger: Gửi request mua cùng một sale với cả `?mode=v1` và `?mode=v2`, không reset giữa hai mode. Controller lấy mode từ query; cache tĩnh không chứa mode; V1 trừ MongoDB còn V2 trừ Redis.
- Workaround: Mọi lượt mua dùng đúng mode của đợt sale, reset khi đổi mode. Nêu điều kiện này trong báo cáo theo `.planning/STATE.md`; không tự đổi hợp đồng query đã được chấp nhận.

**V0 bán quá là hành vi thí nghiệm bắt buộc:**
- Symptoms: Nhiều request cùng đọc thấy còn hàng rồi `$inc` riêng, làm kho âm và số đơn vượt kho.
- Files: `backend/src/services/purchase.service.ts`, `backend/src/models/flash-sale.ts`, `loadtest/scenarios/e1-correctness.ts`, `docs/SPECS.md`.
- Trigger: Burst E1 dùng user khác nhau. Unique index vẫn chặn đơn trùng một người; V0 cố ý không hoàn kho khi tạo đơn lỗi.
- Workaround: Giữ nguyên mô hình đọc rồi trừ để làm đối chứng. Không “sửa” V0 thành nguyên tử và không đưa hành vi này vào danh sách lỗi cần khắc phục.

**Phạm vi kết luận lỗi:**
- Không xác nhận thêm lỗi chạy thực tế trong lần đọc mã này. Các tình huống lỗi mạng và tranh chấp dưới đây là giới hạn có căn cứ từ mã, chưa được tái hiện; xem `backend/test/integration/compensation.test.ts` và `.planning/HANDOFF.json` để phân biệt kiểm thử nhánh với bằng chứng vận hành.

## Security Considerations

**Backend ở chế độ test lắng nghe trên mọi interface:**
- Risk: `listen(cfg.port)` không giới hạn loopback. Nếu máy cho phép truy cập cổng API từ mạng, người khác có thể gửi `x-test-user` giả danh user khi testMode bật; CORS không ngăn client HTTP trực tiếp.
- Files: `backend/src/server.ts`, `backend/src/middlewares/auth.ts`, `backend/src/config/env.ts`, `.planning/phases/01-foundation-infra-data-auth/01-VERIFICATION.md`.
- Current mitigation: Cờ test chỉ bật khi cấu hình khớp chính xác; có cảnh báo lúc khởi động; danh tính từ header luôn là user, admin vẫn cần JWT. Docker bind loopback không giới hạn socket Express.
- Recommendations: Chỉ chạy phép đo trong môi trường cục bộ có kiểm soát như `docs/SPECS.md` yêu cầu; nếu thay đổi phạm vi mạng, xem xét bind riêng loopback cho testMode và kiểm tra lại IPv4/IPv6.

**JWT không kiểm tra lại user trong MongoDB:**
- Risk: Token đã ký vẫn được nhận sau khi seed lại hoặc thay đổi dữ liệu user, cho tới khi hết hạn hoặc đổi khóa.
- Files: `backend/src/middlewares/auth.ts`, `backend/src/services/auth.service.ts`, `docs/SPECS.md`.
- Current mitigation: Kiểm tra chữ ký HS256, định dạng ObjectId và role. Việc không đọc user là lựa chọn rõ ràng để tránh thêm một truy vấn vào đường đo.
- Recommendations: Đăng nhập lại sau seed; giữ và giải thích đánh đổi này trong tài liệu, không thêm truy vấn user vào đường mua làm lệch phép so sánh.

## Performance Bottlenecks

**Mỗi đơn thành công ở V2 vẫn ghi MongoDB:**
- Problem: Redis không loại bỏ chi phí ghi đơn MongoDB; không có bảo đảm V2 nhanh hơn nhiều trên một máy.
- Files: `backend/src/services/purchase.service.ts`, `backend/src/services/order.service.ts`, `backend/src/config/db.ts`, `loadtest/README.md`.
- Cause: Đường thành công chạy Lua rồi `createOrder`; pool MongoDB và Docker Desktop dùng chung tài nguyên với bộ phát tải.
- Improvement path: Giữ nguyên pool giữa V1/V2, dùng `npm run start:test`, phân tích riêng `in_stock` và `sold_out`. Không thêm queue hoặc bỏ ghi đơn để cải thiện số đo vì vượt phạm vi `docs/SPECS.md`.

**Đối chiếu tải toàn bộ tập người mua:**
- Problem: Bộ nhớ và lưu lượng đối chiếu tăng theo số người mua; không có số đo giới hạn sức chứa trong repo.
- Files: `backend/src/services/reconcile.service.ts`.
- Cause: `Order.distinct`, `SMEMBERS`, các `Set` và mảng chênh lệch được giữ trong bộ nhớ; sửa Redis nạp lại toàn bộ buyers.
- Improvement path: Phù hợp quy mô đồ án; nếu mở rộng, đo trước rồi cân nhắc đọc theo lô. Luôn đối chiếu sau khi dừng tải để dữ liệu không đổi trong quá trình so sánh.

## Fragile Areas

**Reset và reconcile không khóa request mua đang chạy:**
- Files: `backend/src/services/sale-admin.service.ts`, `backend/src/services/reconcile.service.ts`, `backend/src/services/purchase.service.ts`, `loadtest/lib/preflight.ts`.
- Why fragile: Reset cập nhật sale, xóa đơn, đặt Redis và ghi biến động qua nhiều bước; reconcile đọc sự thật rồi ghi đè Redis. Không có hàng rào xuyên hai kho với request mua hoặc hoàn kho đang chạy.
- Safe modification: Dừng và chờ tải hoàn tất trước reset hoặc `reconcile --fix`; dùng reset qua HTTP trong harness, kiểm tra baseline trước từng lượt bằng `checkPreRun`. Kiểm tra baseline không thay thế khóa nếu request cũ vẫn còn chạy.
- Test coverage: `backend/test/integration/admin.test.ts` có reset nối tiếp và chu trình reset–burst–stats; chưa có bằng chứng kiểm thử đầy đủ reset đan xen mọi bước bù trừ.

**Cache tĩnh chỉ bị xóa trong đúng tiến trình server:**
- Files: `backend/src/services/sale-cache.ts`, `backend/src/services/sale-admin.service.ts`, `backend/scripts/reset.ts`, `backend/src/routes/index.ts`.
- Why fragile: Cache không TTL và lưu cả status, giá, thời gian. CLI không chạm được Map trong server; sửa trực tiếp MongoDB cũng không invalidation.
- Safe modification: Dùng admin API khi server đang chạy; khi sửa luồng quản trị, truyền đúng `saleCache.invalidate`. Không cache tồn kho và không dành cache riêng cho V2.
- Test coverage: `backend/test/integration/admin.test.ts` kiểm tra reset HTTP xóa cache; không suy ra CLI có khả năng xóa cache của tiến trình khác.

**Tiến trình chết giữa trừ kho và ghi đơn:**
- Files: `backend/src/services/purchase.service.ts`, `backend/src/services/reconcile.service.ts`, `docs/SPECS.md`.
- Why fragile: Bù trừ nằm trong cùng tiến trình Node; tiến trình chết không chạy được catch. V2 có thể bán thiếu và lệch buyers so với orders.
- Safe modification: Sau sự cố, ngừng tải và đối chiếu; chỉ sửa Redis theo MongoDB khi đã ổn định. Không tuyên bố nguyên tử xuyên Redis–MongoDB.
- Test coverage: `backend/test/integration/compensation.test.ts` kiểm tra lỗi được tiêm vào nhánh xử lý; không chứng minh phục hồi sau kill tiến trình ở mọi thời điểm.

## Scaling Limits

**Một môi trường demo, một đợt sale hoạt động:**
- Current capacity: Seed 1.000 user, 6 sản phẩm, mặc định kho 100 theo `docs/SPECS.md` và `backend/src/services/seed.service.ts`; không phải kết quả benchmark sức chứa tối đa.
- Limit: Không thiết kế Redis Cluster, nhiều sale chạy song song hoặc cache invalidation giữa nhiều Node instance; xem `docs/SPECS.md`, `backend/src/services/sale-cache.ts`, `backend/src/config/redis.ts`.
- Scaling path: Giữ phạm vi hiện tại. Mọi mở rộng đa instance cần cơ chế phối hợp invalidation/reset và thiết kế consistency riêng trước khi triển khai.

**Danh sách đọc giới hạn theo quy mô seed:**
- Current capacity: `/orders/me` trả tối đa 100 đơn; danh sách sản phẩm không phân trang trong `backend/src/services/catalog.service.ts`.
- Limit: User có hơn 100 đơn không xem được đơn cũ qua API này; tải toàn bộ sản phẩm không phù hợp catalog lớn. Đây là lựa chọn hiện tại, không phải lỗi trong dữ liệu seed.
- Scaling path: Chỉ thêm phân trang khi yêu cầu mở rộng; giữ thứ tự và index đã có trong `backend/src/models/order.ts`.

## Dependencies at Risk

**TypeScript và tính tương thích của công cụ:**
- Risk: `tsx` không kiểm tra kiểu; backend build cần chép tài nguyên Lua. Không xác nhận lỗ hổng hay gói hết hỗ trợ từ phiên bản khai báo.
- Impact: Chạy dev thành công không chứng minh build production hoặc typecheck đạt.
- Files: `backend/package.json`, `backend/tsconfig.build.json`, `backend/src/services/lua.ts`, `loadtest/package.json`, `.claude/CLAUDE.md`.
- Migration plan: Giữ phiên bản theo dự án, chạy typecheck và build trong quy trình thực thi; không nâng thư viện chỉ để khắc phục cảnh báo suy đoán. `backend/package.json` là nguồn đúng cho lệnh `start:test`, khác ghi chú trong `.claude/CLAUDE.md` thuộc quyền người dùng.

## Missing Critical Features

**Giao diện và script dev nằm trong phần công việc chưa triển khai:**
- Problem: Chưa có `frontend/` hoặc `scripts/` cấp gốc. Trang React, router, polling, admin UI và start/stop đa nền tảng chưa có mã để phân tích.
- Blocks: Chưa thể thực hiện toàn bộ demo giao diện và quy trình khởi động một lệnh theo `docs/SPECS.md`; đây là phạm vi Phase 04, không ghi nhận là regression backend.
- Files: `docs/SPECS.md`, `.planning/ROADMAP.md`, `.planning/HANDOFF.json`.

**E4 và đóng checkpoint 03-05:**
- Problem: `loadtest/package.json` chỉ có lệnh e1/e2/e3; `loadtest/scenarios/` chưa có scenario E4. Bàn giao yêu cầu xác nhận CSV và tạo `03-05-SUMMARY.md`.
- Blocks: Chưa có bằng chứng hoàn tất E4 hoặc xác minh toàn bộ Phase 03. E4 là tùy chọn có thể cắt theo ưu tiên, không thay thế E1/E2 bắt buộc.
- Files: `loadtest/package.json`, `.planning/phases/03-experiments-e1-e4/03-05-PLAN.md`, `.planning/phases/03-experiments-e1-e4/03-06-PLAN.md`, `.planning/HANDOFF.json`.

**README, biểu đồ và phân tích rủi ro sản phẩm:**
- Problem: Chưa có README cấp gốc và frontend biểu đồ; `loadtest/README.md` hướng dẫn đo nhưng không thay thế tài liệu vận hành toàn dự án hoặc phần phân tích kết quả.
- Blocks: Chưa đạt toàn bộ tiêu chí README, biểu đồ E2 và trình bày WR-01/02/04 của Phase 05.
- Files: `loadtest/README.md`, `docs/SPECS.md`, `.planning/ROADMAP.md`, `.planning/STATE.md`.

## Test Coverage Gaps

**Sự cố mạng thật và lệnh ghi mơ hồ:**
- What's not tested: Mất phản hồi MongoDB trước khi đơn hiển thị, Redis thực thi lệnh nhưng mất phản hồi rồi kết nối lại, tiến trình chết giữa Lua và insert.
- Files: `backend/test/integration/compensation.test.ts`, `backend/test/integration/redis-boot.test.ts`, `.planning/phases/03-experiments-e1-e4/03-06-PLAN.md`.
- Risk: Kiểm thử nhánh bằng dependency injection chưa chứng minh tính đúng trong mọi lỗi phân tán. Không dùng PASS E1/E3 để phủ nhận các rủi ro đã chấp nhận.
- Priority: High cho diễn giải tính đúng và giới hạn của báo cáo; E4 tùy chọn theo `docs/SPECS.md`.

**Giao diện và dev scripts chưa có đối tượng kiểm thử:**
- What's not tested: Luồng đăng nhập–mua–xem đơn trên trình duyệt và ma trận start/stop trên Windows/macOS theo yêu cầu.
- Files: `docs/SPECS.md`, `.planning/ROADMAP.md`, `.planning/HANDOFF.json`.
- Risk: Chưa có bằng chứng trải nghiệm demo hoàn chỉnh. Không có máy macOS theo bàn giao, nên README phải nêu rõ nếu chỉ rà soát tĩnh script.
- Priority: High cho Phase 04; xác định rõ kiểm thử thật và rà soát tĩnh.

---

*Concerns audit: 2026-11-11*
