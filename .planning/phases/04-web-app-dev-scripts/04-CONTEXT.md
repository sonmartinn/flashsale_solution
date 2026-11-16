# Phase 4: Web App & Dev Scripts - Context

**Gathered:** 2026-11-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Xây dựng frontend React 19 + React Router 7 + Vite 8, TypeScript strict: `/`, `/sales/:id`, `/login`, `/orders`, `/admin`; nối vào API đã hoàn tất ở Phase 2–3 qua proxy `/api`. Cung cấp bốn script `scripts/start.ps1`, `stop.ps1`, `start.sh`, `stop.sh` theo SPECS §12.

Phạm vi: WEB-01..07, DEV-01..05. Giữ polling và trang admin trong kế hoạch; lập phần có thể cắt sau phần bắt buộc theo ROADMAP. Biểu đồ kết quả E2, README tổng thể và phân tích/rủi ro thuộc Phase 5. Phase 3 đã hoàn tất; không chạy lại lượt đo chính thức để làm UI.

</domain>

<decisions>
## Implementation Decisions

Người dùng chỉ định skill thiết kế và giao các lựa chọn còn lại cho agent: “về giao diện sử dụng skill $design-taste-frontend để thiết kế, còn bố cục và luồng giao diện cũng như các mục 2,3,4 tôi để bạn tự quyết định tốt nhất theo khuyến nghị”. Các quyết định dưới đây là khuyến nghị do agent chọn trong phạm vi đó, không phải những phương án người dùng đã trả lời riêng từng câu.

### Thiết kế với design-taste-frontend
- **D-01:** Bắt buộc dùng `.agents/skills/design-taste-frontend/SKILL.md` cho phần thiết kế và triển khai frontend. Researcher, UI researcher, planner và executor phải đọc skill này. Skill bổ sung cách thiết kế/kiểm tra; `docs/SPECS.md`, quy tắc dự án và hợp đồng API vẫn quyết định chức năng và stack.
- **D-02:** Trang chủ và sale là cửa hàng bán sản phẩm thời trang trực tuyến: hướng `product`, `site-kind=other`; không suy thành trang giới thiệu công nghệ vì backend dùng Redis/MongoDB. Dùng ảnh sản phẩm, nền phẳng, chữ rõ, mép trái/phải bằng nhau, một hệ thống nút và khoảng cách. Không dùng shader, WebGL, logo/review/số liệu quảng cáo bịa đặt. Tên hiển thị dùng “Flash Sale”, không cần tạo thương hiệu mới.
- **D-03:** Chưa khóa mã màu, cặp font hay biến thể hero. Bước thiết kế phải thực hiện các lệnh deal của skill và ghi kết quả, giữ palette/font đầu tiên hợp lệ theo quy tắc của skill. Đọc các reference bắt buộc trước trang đầu; arm gate trước khi tạo trang; giữ motion layer, reduced motion, focus bàn phím và kiểm tra các chiều rộng của skill. Font và ảnh phải dùng được khi demo không có mạng. Không bổ sung thư viện UI hay đổi framework chỉ vì starter của skill là HTML tĩnh.
- **D-04:** Áp dụng bố cục theo màn hình và photo/type moment cho phần trưng bày trên trang chủ/sale. `/login`, `/orders`, `/admin` là màn hình tác vụ thực: biểu mẫu, danh sách và bộ đếm nằm trong luồng đọc ngắn, không thêm nội dung tiếp thị hay kéo dài trang để đạt một công thức landing page. Nếu quy tắc/check của skill xung đột với chức năng bắt buộc, ghi lý do cụ thể bằng cơ chế waiver của skill; không sửa checker, giấu nội dung hay tuyên bố PASS khi chưa kiểm tra. Không coi polling số liệu hoặc countdown bắt buộc là hiệu ứng count-up trang trí.
- **D-05:** Ảnh cho sáu sản phẩm ở `frontend/public/images/products/<slug>.jpg`, khớp Phase 1 D-02. Ưu tiên ảnh thật có giấy phép phù hợp, tải về repo; ảnh đại diện phải cùng loại sản phẩm và được liệt kê trong báo cáo triển khai, credit chung ở footer. Không phụ thuộc host ảnh/font bên ngoài khi chạy app. Không khôi phục mã cũ ở `40dea55`. Product name, giá và thuộc tính là dữ liệu mua hàng cần đọc được; không loại chúng để né quy tắc caption của skill.

### Bố cục và điều hướng
- **D-06:** Thanh đầu trang gọn: tên Flash Sale về `/`, liên kết sản phẩm trên trang chủ, “Đơn của tôi”, đăng nhập/đăng xuất; “Theo dõi” chỉ xuất hiện với admin. Mobile có menu mở bằng bàn phím, trạng thái rõ, mục tiêu chạm đủ lớn. Một hệ thống giao diện cho tất cả trang; admin dùng mật độ dữ liệu phù hợp.
- **D-07:** Trang chủ có hai phần chính: đợt sale đang mở với ảnh sản phẩm nổi bật, giá gốc/giá sale, số còn lại và nút “Xem đợt sale”; tiếp theo là danh sách sáu sản phẩm. Phần sale đứng đầu theo quy trình hero của skill. Không có sale thì nói rõ và vẫn hiển thị sản phẩm. Không bịa đợt sale, không thêm carousel, tìm kiếm, bộ lọc, giỏ hàng hoặc trang chi tiết sản phẩm ngoài roadmap. Sản phẩm không thuộc sale chỉ trưng bày thông tin, không có nút mua giả.
- **D-08:** `/sales/:id`: ảnh sản phẩm lớn và thông tin mua ở desktop, xếp một cột trên điện thoại. Giá VND theo `vi-VN`, giá gốc gạch ngang khi thực sự có giảm giá; countdown có ngày/giờ/phút/giây, dùng `endAt` và hiệu chỉnh theo `now` server. Thuộc tính sản phẩm chỉ để xem; không thêm lựa chọn size/màu làm thay đổi đơn hoặc kho.
- **D-09:** Trạng thái tải đầu, dữ liệu trống, không tìm thấy sale và lỗi mạng phải có nội dung tiếng Việt rõ ràng, có hành động thử đọc lại phù hợp. Lần đọc cập nhật lỗi giữ dữ liệu cuối kèm thông báo đã cũ và thời điểm cập nhật, không đổi thành số 0 hoặc huy hiệu thành công. Không ghi ID, mode hay thông tin kỹ thuật vào màn hình khách trừ khi giúp quyết định mua; admin hiển thị mode và saleId để trình diễn.

### Đăng nhập, mua và đơn hàng
- **D-10:** `/login` gộp đăng nhập/đăng ký bằng chuyển biểu mẫu thủ công. Đăng ký nhận name/email/password, không có trường role; dùng token + user từ response và đăng nhập ngay. Lưu token và thông tin user tối thiểu trong localStorage để qua reload, không lưu mật khẩu. User phía client chỉ quyết định hiển thị; API vẫn kiểm tra quyền. Đăng xuất xóa phiên và dữ liệu riêng của người dùng.
- **D-11:** Khách có thể xem trang chủ và sale. Bấm mua khi chưa đăng nhập dẫn đến `/login` và giữ đường dẫn sale nội bộ để quay lại sau đăng nhập/đăng ký. `/orders` và `/admin` cần phiên; tài khoản thường vào `/admin` nhận màn hình không đủ quyền. Chỉ cho phép return path nội bộ đã kiểm tra. `401 UNAUTHORIZED` từ API được bảo vệ xóa phiên và yêu cầu đăng nhập lại; `401 INVALID_CREDENTIALS` ngay trên form chỉ báo sai thông tin.
- **D-12:** Nút mua gửi đúng một request với `{ qty: 1 }` và `?mode=<sale.mode>` đã đọc; khóa ngay trong lúc chờ để chặn nhấp lặp. Không có bộ chọn mode ở phía khách. Khóa mua khi sale chưa mở/kết thúc, remaining <= 0, `stockLoaded=false`, hoặc đã biết user mua thành công. Sau thành công giữ ở trang sale, hiển thị xác nhận và liên kết “Xem đơn của tôi”, cập nhật lại tồn kho. Không thêm checkout/thanh toán.
- **D-13:** Kết quả hiển thị tại vùng mua, có thông báo cho trình đọc màn hình: thành công; `SOLD_OUT`; `ALREADY_BOUGHT`; `SALE_NOT_ACTIVE`; `STOCK_NOT_LOADED` là các trạng thái riêng. Hết hàng và đã mua không gộp thành lỗi máy chủ. `500`/lỗi kết nối không tự gửi lại lệnh mua: kết quả có thể chưa rõ, cho người dùng kiểm tra đơn của mình. Thay đổi tài khoản/reset phải làm mới trạng thái đã mua bằng dữ liệu hiện tại; không lưu vĩnh viễn cờ “đã mua” trong localStorage. Không sửa khác biệt mã lỗi V0/V1/V2 đã chấp nhận ở Phase 2 D-07.
- **D-14:** `/orders` đọc `/api/orders/me`, mới nhất trước; hiển thị ảnh/tên, giá đã trả, thời điểm, trạng thái và liên kết sale. Dùng DTO sản phẩm đi kèm API, không tự ghép sai sản phẩm. Tối đa 100 đơn theo hợp đồng sẵn có; không tự thêm phân trang hay hủy đơn. Trống thì có liên kết về trang chủ; không đưa dữ liệu giả để lấp trang.

### Cập nhật số liệu
- **D-15:** Sale và admin polling mỗi **2 giây**, không chồng request; dọn timer và hủy/loại response cũ khi rời trang, đổi sale hoặc đổi phiên. Dừng đọc định kỳ khi tab bị ẩn, đọc mới khi quay lại. Có nút làm mới thủ công. Trang chủ không cần polling liên tục. Countdown là đồng hồ cục bộ được đồng bộ lại khi nhận `now`, không cần gọi API mỗi giây.
- **D-16:** Hiển thị đúng `remaining` từ DTO, kể cả âm ở V0; tồn kho âm được đánh dấu, không ép thành 0. `stockLoaded=false` phải nói “Kho chưa sẵn sàng” ngay cả khi API có số suy ra từ orders. Không tự lấy `remainingQty` MongoDB thay cho Redis ở V2. Read failures không làm bật lại nút mua bằng dữ liệu giả.

### Trang theo dõi admin và reset
- **D-17:** `/admin` mặc định chọn sale đang mở. Cho phép nhập saleId hợp lệ hoặc nhận saleId từ liên kết/query nội bộ để truy cập lại sale đã kết thúc; giữ lựa chọn trong phiên trang. Khi không có sale đang mở, không tạo sale mới và không đòi thêm API liệt kê tất cả sale. Trình diễn một sale tại một thời điểm.
- **D-18:** Các số nổi bật: số đơn/totalQty, tồn theo mode và số bán vượt (đỏ khi > 0). Nhóm chi tiết có Mongo remaining, Redis stock, Redis buyers, distinct users, mode, status và uniqueOrderIndex. Redis stock thiếu hiển thị “Chưa nạp”, không phải 0. `redisInSync=true/false` chỉ có ý nghĩa ở V2; v0/v1 hiển thị “Không áp dụng”. Đây là so khớp nhanh theo số đếm của API, không gọi là bằng chứng reconcile đầy đủ; snapshot khi đang có lượt mua có thể biến động.
- **D-19:** Nút “Tạm dừng cập nhật” dễ thấy, luôn hiện trạng thái đang chạy/tạm dừng và thời điểm đọc gần nhất. Khi tạm dừng không có request polling stats; đọc lại khi người dùng tiếp tục. Nêu ngắn rằng trước E2 cần đóng/tạm dừng cả các trang sale/admin ở những tab khác. Tạm dừng trang này không tự tạm dừng cả hệ thống hoặc biến backend dev thành `start:test`. Không thêm biểu đồ live hoặc nút chạy bắn tải trong Phase 4.
- **D-20:** Reset có chọn v0/v1/v2, mặc định mode hiện tại, dùng API admin. Xác nhận ghi rõ sẽ xóa đơn/stock_movements của sale, khôi phục kho và mở lại 7 ngày; thay mode luôn đi cùng reset. Chỉ reset giữa các lượt mua/bắn tải; UI nhắc điều kiện này, không tuyên bố đã giải quyết reset chồng request WR-03. Khóa reset khi đang gửi, dừng polling trong thao tác và đọc lại khi xong. Không tự retry reset. Giữ totalQty hiện tại trong UI, không thêm form quản trị tồn kho chỉ vì API Phase 3 hỗ trợ totalQty.

### Trải nghiệm script dev và kiểm chứng
- **D-21:** Giữ nguyên thứ tự 10 bước start, 4 bước stop, tham số và điều kiện seed của SPECS §12. Mỗi bước in một dòng ngắn bằng tiếng Việt; kết thúc in frontend URL, API health URL, lệnh xem log và lệnh stop. Lỗi có nguyên nhân và cách khắc phục, exit khác 0. Không tự mở tab browser, không thêm chế độ đo tải hoặc cập nhật phần mềm vào start.
- **D-22:** `-Seed`/`--seed` là yêu cầu rõ ràng tạo lại dữ liệu; help và dòng trước seed nói việc xóa dữ liệu. Không thêm câu hỏi tương tác chặn script. Thiếu công cụ thì hướng dẫn cài và dừng, không cài hộ. Cổng bận thì báo PID/tên, không kill tiến trình lạ. Chỉ dừng cây tiến trình đã xác nhận thuộc dự án. `-KeepDb`/`--keep-db` giữ container, stop mặc định dùng compose stop; không xóa volume, không đụng Windows MongoDB 27017.
- **D-23:** Script được viết để khi người dùng chạy, nó tạo `backend/.env` từ `.env.example` với secret ngẫu nhiên nếu thiếu và giữ nguyên nếu đã có. Quy tắc agent vẫn tuyệt đối: không tạo/đọc/in/commit `backend/.env`, kể cả thông qua chạy start trên workspace khi chưa có file. Kiểm thử tự động dùng fixture dùng một lần với cấu hình giả; các ca tác động file thật/seed thật/Docker Desktop và đóng terminal thực tế là checkpoint cho người dùng. Không đọc secret để lập kế hoạch hoặc xác minh.
- **D-24:** `.ps1` PowerShell 5.1, UTF-8 BOM, CRLF; `.sh` bash 3.2, LF, executable trong git; `.dev/` ignored. PID và log không commit. Planner phải nghiên cứu cách chạy nền sống sau terminal và dừng cả cây/nhóm tiến trình đúng đường dẫn tiếng Việt; không giả định POSIX setsid có trên macOS. Khi start thất bại chỉ thu dọn tiến trình vừa khởi động, không tự xóa dữ liệu hay thay đổi dịch vụ lạ.
- **D-25:** Hoàn tất code khi backend/frontend typecheck và build đạt, cùng kiểm thử luồng mua/auth/admin và các ca Windows SPECS §12. Với UI thực hiện checker/layout/screenshots/perf/gate của design-taste-frontend trên trang render được, ghi đúng PASS/OPEN/ERROR và waiver; không arm hoặc tuyên bố gate trong bước thảo luận này vì chưa tạo trang. macOS tối thiểu bash -n, shellcheck nếu sẵn; nếu không có máy thì ghi chưa kiểm thử runtime. Không cài công cụ hộ hoặc nhận test smoke là lượt đo chính thức.

### Agent's Discretion
- Cấu trúc component/hook/API client và chi tiết đồng bộ giờ, hủy request, kiểm tra phiên; dùng fetch và React/Router sẵn có là mặc định, chỉ thêm dependency khi có lý do đã nghiên cứu.
- Kết quả deal của skill, câu chữ tiếng Việt cụ thể, ảnh có giấy phép, cách trình bày semantic product info, empty/loading states và responsive; tuân thủ D-01..09.
- Cách quản lý PID/log, kiểm tra npm ci khi lock đổi, fixture kiểm thử và cách chia plan/wave; các tiêu chí SPECS không được giảm.
- UI design contract có thể làm rõ các token/asset trước implementation; không cần hỏi lại các lựa chọn đã được giao ở trên.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Yêu cầu, phạm vi và quy tắc
- `docs/SPECS.md` §3–5, §7–9, §11–14 — nguồn yêu cầu duy nhất; frontend, API, mode, script và các ca kiểm thử.
- `.planning/REQUIREMENTS.md` — WEB-01..07, DEV-01..05; WEB-08 thuộc Phase 5.
- `.planning/ROADMAP.md` — mục tiêu/success criteria Phase 4 và thứ tự cắt.
- `.planning/PROJECT.md` — quyết định mode qua reset, token, dữ liệu mẫu và ranh giới phạm vi.
- `AGENTS.md` và `.claude/CLAUDE.md` — quy tắc repo/stack; không sửa CLAUDE.md, không truy cập backend/.env. Ghi chú start:test cũ trong CLAUDE.md đã lỗi thời; `backend/package.json` là chuẩn.
- `.planning/STATE.md` — rủi ro Phase 2 còn mở/đã chấp nhận, đặc biệt reset chồng mua và trộn mode; không coi UI là bản sửa backend.

### Skill được người dùng chỉ định
- `.agents/skills/design-taste-frontend/SKILL.md` — bắt buộc cho thiết kế/triển khai UI, deal, motion và gate; cần có bản skill này trên máy thực hiện (hiện là file local chưa commit).
- `.agents/skills/design-taste-frontend/references/copy.md`, `.agents/skills/design-taste-frontend/references/copy-voice.md` — nội dung, sự thật được dùng và giọng văn.
- `.agents/skills/design-taste-frontend/references/system.md`, `.agents/skills/design-taste-frontend/references/layout-v4.md`, `.agents/skills/design-taste-frontend/references/sections.md` — reference bắt buộc trước trang đầu. Đọc thêm reference theo asset family khi dùng, gồm photos/motion/moments/gate.

### Quyết định trước và API thật
- `.planning/phases/01-foundation-infra-data-auth/01-CONTEXT.md` — D-02 ảnh local, D-04 tài khoản mẫu, D-12 auth response, D-15 error JSON, D-20 start:test/process tree (đã sửa đổi).
- `.planning/phases/02-buy-pipeline-admin-apis/02-CONTEXT.md` — buy/query mode/body, bảng mã, khác biệt cross-mode, sale/orders DTO, reset và stats.
- `.planning/phases/03-experiments-e1-e4/03-CONTEXT.md` — reset totalQty, stats uniqueOrderIndex, dev/test tách biệt, tạm dừng admin khi E2, lượt đo chính thức chỉ do người dùng.
- `backend/src/utils/dto.ts` — ProductDto, SaleDto, MyOrderDto; remaining/stockLoaded và chuỗi ISO.
- `backend/src/controllers/auth.controller.ts`, `backend/src/controllers/sale.controller.ts`, `backend/src/controllers/admin.controller.ts`, `backend/src/controllers/order.controller.ts` — envelope JSON, lỗi và validation thực tế.
- `backend/src/services/sale-admin.service.ts` — SaleStats, redisInSync chỉ ở V2, reset options.
- `backend/package.json`, `backend/.env.example`, `docker-compose.yml`, `loadtest/README.md` — lệnh chuẩn, mẫu cấu hình được phép đọc, container và cách đo E2.
- `.planning/research/STACK.md` và `.planning/codebase/CONVENTIONS.md` — stack/import/pattern đã kiểm chứng. Bản đồ codebase ngày 2026-11-11 có thể chậm hơn Phase 3; manifest/code hiện tại là chuẩn.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Chưa có frontend, component UI hay `scripts/` start/stop ở root. Tạo package frontend riêng, không suy rằng repo trống để đổi sang static site hay Next.js.
- `.agents/skills/design-taste-frontend/` có kit và script kiểm tra để dùng trong React theo skill; không cần cài lại skill.
- Backend đã có auth/register/login, sản phẩm, active sale/chi tiết sale, orders/me, admin reset/stats, health và reconcile CLI. Không cần thêm API để dựng các màn hình đã chốt.

### Established Patterns
- Auth trả `{ token, user: { id, name, email, role } }`; lỗi `{ message, code }`, thông báo tiếng Việt. Client chỉ đặt Content-Type JSON khi thực sự gửi body.
- GET sale trả `{ now, sale }`, active trả `{ now, sales }`; DTO dùng `id`, không `_id`; remaining đã theo sale.mode. Buy thành công `{ order }`; stats `{ stats }`; orders `{ orders }`.
- Backend ESM NodeNext với import .js; frontend theo React/Vite/TypeScript strict của SPECS, React Router package `react-router` ghim v7. Không dùng framework/SSR mode.
- Không có npm package ở root; `backend/`, `loadtest/` độc lập. `.gitattributes` hiện có quy tắc CSV; thêm shell/PowerShell mà giữ quy tắc cũ.

### Integration Points
- `frontend/src/pages`, `components`, `services`; proxy Vite `/api` -> `http://localhost:5000`, strictPort để script kiểm tra đúng 5173.
- `backend/src/services/catalog.service.ts` cung cấp sản phẩm/sale/orders thật; orders có product summary, không cần truy vấn từng sản phẩm từ client.
- `backend/src/services/sale-admin.service.ts` cung cấp các số admin và reset xóa cache; client không tự ghi Redis/Mongo hay đổi mode qua buy.
- `scripts/`, `.dev/`, `.gitignore`, `.gitattributes` cho vòng đời dev; dùng `docker-compose.yml` với MongoDB 27018/Redis 6379 bind loopback.
- Trong lúc thảo luận có thay đổi của người dùng ở `.planning/config.json`, `.planning/state.json`, `.agents/`, `skills-lock.json`. Chỉ commit artifact của cuộc thảo luận, không gom các file đó. Không sửa worktree cũ.

</code_context>

<specifics>
## Specific Ideas

- Người dùng chủ động chọn design-taste-frontend; đây là quyết định bắt buộc, không được thay bằng một frontend template chung.
- Demo cần trông như cửa hàng thời trang ở phía khách, và đọc được các số liệu cốt lõi từ xa khi chiếu trang admin.
- Giữ trải nghiệm mua một sản phẩm/mỗi người/mỗi sale; ảnh, font và nội dung hoạt động khi không có internet, sau khi đã chuẩn bị môi trường.

</specifics>

<deferred>
## Deferred Ideas

Không có ý tưởng mở rộng mới do người dùng yêu cầu. Các mục sẵn có vẫn ở Phase 5: biểu đồ E2/Recharts, README tổng thể, phân tích kết quả và tài liệu rủi ro/runbook. Không thêm checkout, variant stock, CRUD, biểu đồ live admin hay nút bắn tải vào Phase 4.

</deferred>

---

*Phase: 04-web-app-dev-scripts*
*Context gathered: 2026-11-16*
