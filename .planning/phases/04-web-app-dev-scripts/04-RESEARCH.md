# Phase 4: Web App & Dev Scripts — Research

**Researched:** 2026-11-16
**Scope:** WEB-01..07, DEV-01..05
**Confidence:** HIGH for repository contracts; MEDIUM for OS implementation proposals pending fixture/runtime verification.
**Method:** Research performed inline under the plan-phase adapter; no application code, packages or services were changed.

<user_constraints>
## User Constraints (from CONTEXT.md)

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


## Deferred Ideas

Không có ý tưởng mở rộng mới do người dùng yêu cầu. Các mục sẵn có vẫn ở Phase 5: biểu đồ E2/Recharts, README tổng thể, phân tích kết quả và tài liệu rủi ro/runbook. Không thêm checkout, variant stock, CRUD, biểu đồ live admin hay nút bắn tải vào Phase 4.


</user_constraints>

<phase_requirements>
## Phase Requirements

- [ ] **WEB-01**: Frontend React 19 + React Router 7 (ghim `^7`) + Vite 8, TypeScript strict, gọi API qua proxy Vite `/api` → `http://localhost:5000`; `typecheck` và `build` đạt
- [ ] **WEB-02**: User đăng nhập/đăng ký ở `/login`; token lưu lại và gửi kèm `Authorization: Bearer`
- [ ] **WEB-03**: Trang chủ `/` hiển thị đợt sale đang mở (giá sale, số còn lại) và danh sách sản phẩm
- [ ] **WEB-04**: Trang `/sales/:id` có đếm ngược tới `endAt` (hiệu chỉnh theo `now` của server) và nút mua theo `sale.mode` (khóa khi đang gửi); hiển thị thông báo kết quả theo `code`/mã trả về
- [ ] **WEB-05** *(cắt thứ tư)*: Số còn lại trên trang đợt sale tự cập nhật bằng polling 1–2 giây, dọn interval khi rời trang; nếu cắt thì dùng nút làm mới
- [ ] **WEB-06**: User xem đơn của mình ở `/orders`
- [ ] **WEB-07** *(cắt thứ ba)*: Admin xem trang `/admin`: số liệu từ API stats (đơn vượt tô đỏ, huy hiệu đồng bộ Redis–MongoDB), nút reset có chọn mode, cập nhật liên tục để thấy bộ đếm tụt về 0 khi bắn tải, có thể tạm dừng cập nhật khi đo E2
- [ ] **DEV-01**: `scripts/start.ps1` (Windows PowerShell 5.1, UTF-8 có BOM, không `&&`/`||`/`??`/ba ngôi) thực hiện đủ 10 bước SPECS mục 12: về thư mục gốc, kiểm tra công cụ và phiên bản Node, mở Docker Desktop và chờ tối đa ~120 giây, kiểm tra PID/cổng 5000 và 5173 (không tự kill), `docker compose up -d --wait`, tạo `.env` có `JWT_SECRET` ngẫu nhiên (không in ra), `npm ci` khi cần, seed khi có `-Seed` hoặc database trống (không bao giờ tự seed khi đã có dữ liệu), chạy nền backend/frontend ghi PID và log vào `.dev/`, chờ health và in URL
- [ ] **DEV-02**: `scripts/stop.ps1` dừng cả cây tiến trình theo PID (`taskkill /T /F`), xử lý trường hợp mất file PID (chỉ kill `node` có dòng lệnh chứa đường dẫn dự án), `docker compose stop` trừ khi `-KeepDb`, kiểm tra cổng đã giải phóng, báo "không có gì để dừng" khi không chạy gì; cả hai script có `-Help`
- [ ] **DEV-03**: `scripts/start.sh` và `scripts/stop.sh` (bash 3.2, `set -euo pipefail`, `nohup`, nhóm tiến trình riêng, `</dev/null`) có cùng hành vi và tham số (`--seed`, `--keep-db`, `--help`)
- [ ] **DEV-04**: `.gitattributes` (`*.sh` LF, `*.ps1` CRLF), quyền thực thi git cho `.sh`, `.dev/` trong `.gitignore`; script idempotent, không đổi cấu hình hệ thống, không động vào dịch vụ MongoDB cổng 27017, không `docker compose down -v`
- [ ] **DEV-05**: Đạt danh sách kiểm thử Windows ở SPECS mục 12 trên đúng thư mục dự án (đường dẫn có dấu và khoảng trắng); macOS ít nhất `bash -n` (và `shellcheck` nếu có), README ghi rõ chưa chạy thử trên macOS nếu không có máy

Research support and planned verification for each ID are mapped under Validation Architecture.
</phase_requirements>

## Summary

Build a Vite React SPA against the existing HTTP contracts, with a separate dev-script lifecycle. Do not change the purchase backend to accommodate UI assumptions. Complete mandatory browsing/auth/purchase/orders and scripts before adding sale polling and the admin monitor. These are implementation recommendations within the discretion already delegated in 04-CONTEXT.md.

The main risks are stale authenticated responses, ambiguous purchase results, Windows argument quoting/process ownership, and macOS process-group cleanup. Use fixture processes and disposable configuration to establish lifecycle behavior before touching real services. The agent must never read, create, print or commit backend/.env, including by executing the real start script.

## Project Constraints (from AGENTS.md)

- Read .claude/CLAUDE.md first; docs/SPECS.md is the sole functional authority. Preserve the user's CLAUDE.md.
- Work on develop through GSD; no push, Co-Authored-By, old-code restoration or worktree cleanup. Leave the existing .agents/, skills-lock.json and planning config/state changes alone.
- TypeScript strict; backend ESM NodeNext with .js imports. Errors/comments in Vietnamese; Express 5 async handlers use HttpError without blanket wrappers.
- No JWT secret fallback, client-assigned role, foreign-process termination, software installation or volume deletion. Compose stays loopback-only. MongoDB is 127.0.0.1:27018, never the Windows service on 27017.
- String validation applies to auth fields; existing purchase/reset numeric contracts remain authoritative: buy qty is the number 1, not the string "1".
- Completion requires backend/frontend typecheck and build. No logs in successful purchase paths. No official measurements in this phase; dev scripts cannot substitute for compiled start:test.
- PowerShell 5.1, UTF-8 BOM/CRLF; bash 3.2 with set -euo pipefail and LF. Preserve existing CSV attributes.

## Architectural Responsibility Map

| Capability | Primary owner | Secondary owner | Planning consequence |
|---|---|---|---|
| Browse, countdown, feedback, navigation | Browser | Existing public API | Client renders DTOs; no new catalog endpoints |
| Authentication and authorization | Existing API | Browser session presentation | Stored user controls navigation only; server enforces permission |
| Stock selection, duplicate limit, compensation | Existing API + stores | Browser buy state | UI supplies sale.mode and one qty; never implements stock arithmetic |
| Polling and request cancellation | Browser | Existing read API | Serial scheduler, visibility cleanup, generation guards |
| Reset and stats | Existing admin API | Browser monitor | Confirm destructive reset, pause reads, refetch current state |
| Start/stop, ownership and logging | OS scripts | Node/npm + Compose | Native Windows tree and POSIX group lifecycle; fixture isolation |
| Fonts and product photographs | Static local files | UI design skill | Six local product files and licence ledger; no runtime CDN |

## Standard Stack

Use the stack fixed by SPECS and CLAUDE, without adding a UI kit, state framework or chart library in this phase. Registry metadata was inspected with npm.cmd view; no dependencies were installed. Version ranges below are proposals for the new frontend manifest, grounded in those exact registry versions.

| Dependency | Range | Evidence |
|---|---|---|
| react, react-dom | ^19.3.1 | Registry versions 19.3.1; React DOM peer react ^19.3.1; official React docs |
| react-router | ^7.18.5 | Registry version 7.18.5, Node >=20.0.0, React/DOM >=18; official installation docs |
| vite | ^8.3.5 | Registry version 8.3.5, Node ^20.19.0 or >=22.12.0; official Vite guide |
| @vitejs/plugin-react | ^6.2.1 | Registry version 6.2.1, peer vite ^8.0.0; inspect optional peer metadata before install |
| typescript | ~7.0.2 | Registry version 7.0.2; already used by backend |
| @types/react, @types/react-dom | ^19.3.0 | Registry versions 19.3.0; React TypeScript docs name both packages |
| @types/node | ^24.19.2 | Registry version 24.19.2; same repository version as backend |
| tsx | ^4.23.15 | Existing backend manifest; official privatenumber/tsx project; native node:test runner for pure behavior tests |

Frontend engines must retain the exact SPECS range. Test compilation and application compilation both belong in typecheck; tsx tests alone do not typecheck. Use declarative BrowserRouter/Routes/Route imports from react-router. [CITED: https://reactrouter.com/start/declarative/installation] [CITED: https://react.dev/learn/typescript]

### Package Legitimacy Audit

Ran `query package-legitimacy check --ecosystem npm` on all ten proposed packages. The seam checks package names/latest publication, while npm view above checked intended versions. Do not confuse a latest-package age warning with a finding about the intended version's contents.

| Package | Seam verdict | Disposition |
|---|---|---|
| react, react-dom, typescript, @types/react, @types/react-dom, tsx | OK | Keep; names are supported by official projects/docs and registry |
| react-router, vite, @vitejs/plugin-react, @types/node | SUS: too-new | Keep because required by the prescribed stack; record a package-legitimacy human verification checkpoint before installation, showing official repositories and the exact versions/peers |

The SUS rows carry the workflow warning: **[WARNING: flagged as suspicious — verify before using.]** No SLOP package was returned. No unrequested package should be installed as part of research. Bootstrap should write manifests directly rather than execute an unpinned create-vite download.

## Verified API Contract Inventory

These are direct source readings, not inferred field names.

- Sale modes: `"v0", "v1", "v2"`; sale statuses: `"scheduled", "active", "ended"`. [VERIFIED: backend/src/models/flash-sale.ts:3-7]
- Order statuses: `"success", "cancelled"`. [VERIFIED: backend/src/models/order.ts:4-5]
- Sale DTO fields include `product: ProductSummaryDto`, `remaining: number`, `stockLoaded: boolean`; product summary has `id`, `name`, `slug`, `category`, `images`, `price`. `MyOrderDto` adds `product: { id: string; name: string; slug: string; images: string[] }`. [VERIFIED: backend/src/utils/dto.ts:42-55,90-105,141-148]
- Sale reads return `{ now: now.toISOString(), sales }` and `{ now: now.toISOString(), sale }`. Detail returns ended sales too. [VERIFIED: backend/src/controllers/sale.controller.ts:32-46]
- Buy body requires `qty !== 1` to be false; `"1"` is invalid. Success is `res.status(201).json({ order: result.order })`. Query must explicitly specify one mode string. [VERIFIED: backend/src/controllers/sale.controller.ts:54-74]
- Business codes are `"SOLD_OUT"`, `"ALREADY_BOUGHT"`, `"STOCK_NOT_LOADED"` and `"SALE_NOT_ACTIVE"` (the last is documented in controller validation order). [VERIFIED: backend/src/controllers/sale.controller.ts:12-22]
- Auth response is `token: string; user: AuthUser`, where user has `id`, `name`, `email`, `role`. Wrong credentials produce `"INVALID_CREDENTIALS"`; registration always creates `role: "user"`. [VERIFIED: backend/src/services/auth.service.ts:8-18,29-32,55-65]
- Protected auth errors use `"UNAUTHORIZED"`; admin rejection uses `"FORBIDDEN"`. [VERIFIED: backend/src/middlewares/auth.ts:14-16,65-68]
- Orders response is `{ orders: await catalog.listMyOrders(user.id) }`; newest first, maximum 100. [VERIFIED: backend/src/controllers/order.controller.ts:8-13]
- Stats fields are `saleId`, `mode`, `status`, `totalQty`, `mongoRemaining`, `redisStock`, `redisBuyers`, `orders`, `distinctUsers`, `oversold`, `redisInSync`, `uniqueOrderIndex`. `redisStock: number | null`, `redisInSync: boolean | null`; the latter compares counts only in v2. [VERIFIED: backend/src/services/sale-admin.service.ts:35-59,166-170,186-203]
- Reset returns `{ sale: toResetDto(result) }`, not a full SaleDto. UI must reread detail/stats after reset. [VERIFIED: backend/src/controllers/admin.controller.ts:7-20,74-78]
- Seed image path creator returns `` `/images/products/${slug}.jpg` ``. The six slugs are `"ao-thun-cotton-basic"`, `"quan-jeans-slim-fit"`, `"vay-hoa-midi"`, `"giay-sneaker-trang"`, `"tui-tote-canvas"`, `"ao-khoac-gio"`. [VERIFIED: backend/src/services/seed.service.ts:31-34,40-105]
- The actual test launcher is `"npm run build && dotenv run -q --override -f .env.test -- node dist/server.js"`; do not copy the obsolete CLAUDE example. [VERIFIED: backend/package.json:14]

## Architecture Patterns

### R1. One typed HTTP client and session generation

Proposed new files: frontend/src/services/api.ts, types.ts, catalog.ts, auth.ts; frontend/src/auth/AuthProvider.tsx. Use relative /api URLs, typed DTOs mirroring the inventory, and an ApiError carrying HTTP status/code/message. Set Content-Type only when sending an actual JSON body. Centralize protected 401 handling, distinguishing INVALID_CREDENTIALS on the login form. Reject external/protocol-relative return URLs. Each auth change invalidates private results and all outstanding response generations; an old 401 must not log out a newly signed-in account. Keep only token and minimal user data, never passwords. Handle malformed/blocked localStorage without crashing. These are implementation recommendations implementing D-09..14; not a new auth contract.

### R2. Purchase state has a defined uncertain outcome

Implement one in-flight latch synchronously before awaiting fetch. Buy uses the current read sale mode, qty 1, and one request. On a 201, show confirmation, link orders, and refetch stock. Keep business-code messages distinct. On server/network failure show that the result is uncertain and link orders; do not automatically retry. Resolve known purchase state through fresh orders after account change, navigation or reset, never a permanent localStorage flag. Re-read orders when a new sale epoch (startAt/endAt/mode) is observed. Stale read failure retains data but cannot unlock purchase from fabricated values. Proposed: a sale state helper plus SalePage, with deterministic unit tests and real browser checks. [VERIFIED: 04-CONTEXT.md, D-11..16]

### R3. Countdown and serial read lifecycle

Estimate server offset at response receipt; use server now with elapsed local monotonic time for rendering. Resynchronize on every successful read; clamp the countdown at zero but preserve negative inventory. Start with a manual refresh control. Add a 2-second completion-scheduled polling loop later: at most one read in flight, clear timers and abort/invalidate on route/account changes, pause when hidden, refresh on return. Manual refresh joins or supersedes an outstanding read safely. Reset/pause invalidate outstanding stats responses before displaying new state. React's documented effect cleanup and StrictMode development replay require symmetric setup/cleanup. [CITED: https://react.dev/reference/react/useEffect] The exact scheduler is a project recommendation, to be validated with a controlled clock and delayed responses.

### R4. Design skill integration remains in React

The required skill was read at .agents/skills/design-taste-frontend/SKILL.md. Use product / site-kind other, with local fashion stand-in photography and local fonts supporting Vietnamese. Before creating the first page, read copy, voice, system, layout and sections references; arm the gate, run layout/palette/type/moment dealers, retain the first valid results and record them. Do not run dealers now: they arm the finish gate, and no page is being implemented in this planning run. Executor must preserve motion/reduced-motion/focus, use SPA route lifecycle for kit initialization/cleanup, and report checker/layout/screenshots/perf/gate evidence for all five routes. Task screens and semantic product text need explicit skill waivers where the landing-page formula conflicts with required function (D-04). No invented commercial claims, external runtime assets or decorative countdown substitution.

UI gate observation before planning: `frontend: true`, `hasFrontendEvidence: false`, `hasUiSpec: false`, `block: false`. The gate does not block this greenfield phase. Design/deal and per-route design notes must be a concrete first implementation task, before page creation; visual tokens are deliberately not invented in research. [VERIFIED: local check ui-plan-gate 4 output, 2026-11-16]

### R5. Windows lifecycle: explicit launcher and ownership

Use npm.cmd on Windows: the local `npm -v` probe hit a disabled-script policy, while npm.cmd returned 11.19.1. Do not modify execution policy. Use a hidden Start-Process wrapper with an explicitly quoted absolute wrapper path, stable working directory, and redirected logs; await npm inside that wrapper so the recorded root stays alive. A dedicated shared helper such as scripts/dev-common.ps1 and launcher scripts/dev-runner.ps1 makes start/stop use the same ownership rules. This is a proposed structure, not an existing source path.

Start-Process joins ArgumentList arrays into one command line, so array membership does not preserve quoting. Construct one properly quoted argument string and fixture-test the real accented path. [CITED: https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.management/start-process?view=powershell-5.1] It starts independently on Windows. [CITED: https://learn.microsoft.com/powershell/module/Microsoft.PowerShell.Management/Start-Process]

Before tree termination, verify root ownership using the absolute project/launcher path and current process creation identity in sidecar metadata; numeric PID files stay compatible with SPECS. Win32_Process exposes CommandLine, CreationDate and ParentProcessId. [CITED: https://learn.microsoft.com/en-us/windows/win32/cimwin32prov/win32-process] taskkill /T includes descendants; /F forces termination. [CITED: https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/taskkill] Those APIs are primitives, not proof that a particular wrapper is safe: validate the complete launcher in a fixture.

Never point stdout and stderr redirection to the same file blindly. Use wrapper-level merging into the canonical per-service log and separate temporary launcher diagnostics where required. Keep the wrapper path in the live command line for ownership checks. If PID metadata is stale/foreign, use only the SPECS fallback for node processes whose command line contains the exact normalized project path. Inspect both ports before changing state; report partial startup rather than claiming two healthy services from one live PID. On startup failure stop only this invocation's newly owned processes; retain data and containers.

### R6. macOS lifecycle: group isolation plus hangup protection

Use bash job control (`set -m`) only for launch, then nohup with stdin from /dev/null and both outputs redirected. Verify each launched job's PGID with ps; record a group only when it differs from the caller's group. Stop by negative PGID only after ownership verification. nohup ignores hangup but does not alone prove process-group isolation. [CITED: https://www.gnu.org/software/bash/manual/bash.html] [CITED: https://www.gnu.org/software/coreutils/manual/html_node/nohup-invocation.html]

Proposed launcher pattern: start a nohup bash -c wrapper that changes to the package folder and execs npm run dev; forward the path as a positional argument, not interpolated shell code. On stop, validate pid/group/start identity and project path, signal the group, wait, and force only surviving verified members. Missing-PID fallback follows SPECS node+project-path checks and never signals the caller's process group. Bash 3.2/macOS runtime remains unverified on this Windows host; require bash -n here and disclose that limitation. Do not assume setsid, GNU ps/stat/readlink/sed, associative arrays or mapfile exist on macOS. [VERIFIED: docs/SPECS.md:391-409]

### R7. Ten-step startup, four-step shutdown, disposable fixtures

Use the exact SPECS sequence, flags, paths, deadlines and seed rule. Emit a short Vietnamese line per step. Node engine check must implement the actual range, rejecting Node 21/22.0 rather than a loose major >=20 comparison. Count users using the named container; parse a successful nonnegative integer only. A failed Docker/mongosh command must never become empty DB and trigger seed. Use npm ci on missing modules or a changed lock marker; hash of lock plus last-success marker is more reliable than only timestamp. No arbitrary package update.

The user-run script may create .env exclusively from .env.example, replacing the empty JWT secret with crypto.randomBytes(32), and preserve an existing file byte-for-byte. The agent may test this branch only in a disposable fake repo, never via a real workspace start invocation. Fake docker/npm executables, fake DB counts, controlled listening child processes, and temporary logs cover failure/cleanup/idempotence. Real Docker Desktop launch, real seeding and terminal-close behavior belong to an explicit user checkpoint after implementation. [VERIFIED: docs/SPECS.md:369-426; 04-CONTEXT.md D-21..25]

## Don't Hand-Roll

| Problem | Use | Reason |
|---|---|---|
| Stock/compensation, user limit | Existing buy API | Browser counters cannot enforce concurrency |
| Routing | React Router declarative mode | Five routes need navigation and guarded return state |
| Secret randomness | Node crypto.randomBytes(32) | Already prescribed by the safe .env.example template |
| Windows process-tree teardown | Verified taskkill /PID /T /F | Killing npm alone leaves children |
| POSIX hangup protection | nohup plus explicit descriptors | Background ampersand alone is insufficient |
| Native UI motion and audit | The selected design skill's kit/scripts | Preserve its dealer and finish-gate contracts |
| VND formatting | Intl.NumberFormat with vi-VN | No currency-string arithmetic |

## Common Pitfalls

1. A reset response is not SaleDto; refetch detail and stats instead of overwriting state with incomplete data.
2. Missing Redis stock is null / stockLoaded false; it is never a reassuring zero or a successful sync badge. V0 negative remaining remains visible.
3. Role information in storage is presentation state; editing it never authorizes API calls. Expired-session responses must be tied to the session that sent them.
4. Auth/account changes during a pending buy must not show another user's success. Network cancellation does not prove a POST was not committed.
5. Admin pause must abort/invalidate already-started reads, not merely remove the next timer. A paused monitor does not pause other tabs or make dev suitable for E2.
6. Absolute accented paths require literal matching and quoting. PowerShell -like treats brackets as patterns; use normalized literal boundary checks.
7. Reused PIDs, partial startup and missing PID files need separate branches. Never use broad image-name kills or trust kill -0 as ownership proof.
8. When empty-DB detection fails, stop; destructive seed is not a fallback for uncertainty.
9. Do not mistake Git Bash 5.2 parsing for bash 3.2/macOS runtime validation.

## Code Examples

Proposed Vite configuration: `server.port = 5173`, `server.strictPort = true`, `server.proxy['/api'] = 'http://localhost:5000'`; retain /api in the forwarded path. Vite documents both prefix proxying and the exit-on-busy-port setting. [CITED: https://vite.dev/config/server-options]

Proposed countdown computation: `remainingMs = max(0, endAtMs - (serverNowAtReceiptMs + monotonicElapsedMs))`. It derives from server data and elapsed time, not a cosmetic decrementing number. Validate boundary zero, expired and server clock skew.

Existing runner to imitate: backend package uses `node --import tsx --test` for test files; its compiler step is separate. Proposed frontend test script uses the same native runner and a frontend tsx devDependency; behavioral browser evidence supplements pure unit tests.

## Environment Availability

| Dependency | Observation on 2026-11-16 | Planning disposition |
|---|---|---|
| Node | v24.22.1 | Available; do not raise SPECS minimum |
| npm | npm.cmd 11.19.1; npm.ps1 blocked | Use npm.cmd in PS code and Windows verification |
| Windows PowerShell | 5.1.26100.9818 | Parser/runtime fixture target available |
| Docker CLI / Compose | docker invocation reached config access denied; then unknown compose | Sandbox-limited observation, not evidence Compose is missing; verify with authorized execution before runtime tests |
| Git Bash | C:/Program Files/Git/bin/bash.exe, 5.2.37 | Available for bash -n; not macOS runtime proof |
| WSL bash | Found but launch returned E_ACCESSDENIED | Not the validation shell |
| shellcheck | No command found by Get-Command | Optional; do not install automatically |
| Chrome / Edge | Executables found in usual Program Files paths | Actual browser launch/audit still pending execution |
| Frontend | Directory absent | All frontend commands below are planned, not already runnable |
| Backend modules | Directory present | Existing regression commands available; no secret-file access |
| macOS / bash 3.2 | No host available in this session | Report runtime UNTESTED; only syntax/compatibility review here |

## Validation Architecture

Use native node:test via tsx for pure API/session/clock/scheduler behavior. Test the scheduler as the production scheduler with injectable time/visibility/fetch seams, then verify actual React route cleanup in a browser. Use a dependency-free Node fixture orchestrator for script tests plus PowerShell 5.1 AST parsing; mocked command fixtures must invoke production scripts/helpers, not a second implementation. No extra UI test framework is required. Proposed commands are not claimed executed.

| Req ID | Behavior | Planned automated check | Additional evidence |
|---|---|---|---|
| WEB-01 | Strict build, proxy | npm.cmd --prefix frontend run typecheck; npm.cmd --prefix frontend run build | Browser network shows /api and real backend responses |
| WEB-02 | Session, Bearer, return path | npm.cmd --prefix frontend test -- --test-name-pattern=auth (prefer dedicated file invocation if runner ordering requires it) | Register/login/reload/logout and old-session 401 browser scenarios |
| WEB-03 | Active sale + six products | API fixture contract tests and frontend build | Actual empty/error/success home states, six local images |
| WEB-04 | Single buy, clock and feedback | Direct native-runner test of sale-state.test.ts | Every business code, double click, unknown result, new account |
| WEB-05 | Poll lifecycle | Direct native-runner test of polling.test.ts | Delayed network, tab hiding, route/sale/auth changes |
| WEB-06 | Own newest orders | API/session tests | Two accounts, empty data and real DTO rendering |
| WEB-07 | Stats/reset/pause | Direct native-runner test of admin-state.test.ts | Admin/user/guest, null badge, destructive confirmation, pause races |
| DEV-01 | Startup order, seed guard, failure | node --test scripts/test/dev-scripts.test.mjs | User-run first start, Desktop off, accented root |
| DEV-02 | Ownership and teardown | Same fixture suite | User-run lost PID and terminal-close cases |
| DEV-03 | Bash parity and group identity | Git Bash bash -n; fixture/static checks | macOS runtime untested unless a machine becomes available |
| DEV-04 | Encoding, attributes, modes | node --test scripts/test/dev-scripts.test.mjs | git ls-files --stage, git check-attr, ignore check |
| DEV-05 | Windows checklist | Fixture suite plus recorded manual matrix | Every SPECS case individually PASS/OPEN/ERROR |

Wave 0 gaps: frontend manifest/tsconfigs/test command; frontend/test/api.test.ts, auth.test.ts, sale-state.test.ts, polling.test.ts, admin-state.test.ts; scripts/test/dev-scripts.test.mjs with disposable fake-repo fixtures. Implement each harness with its owning vertical slice, not as an empty test-only phase. Task feedback target under 30 seconds for focused tests; duration must be measured, not asserted. Full gate runs frontend/backend typecheck and build plus relevant behavior suites. Existing official experiments and committed CSVs are untouched.

## Security Domain

ASVS Level 1 is enabled in project config; block HIGH threats in plans. OWASP currently publishes ASVS 5.0.0; its chapter numbers differ from older V2/V3 shorthand, so name controls by purpose here rather than claim outdated identifiers. [CITED: https://asvs.owasp.org/]

| Area | Applies | Control to plan |
|---|---|---|
| Authentication/session | Yes | API checks JWT; client expiry handling, generation-bound responses and private-state clearing |
| Authorization | Yes | API rejects non-admin; UI guard supplements it |
| Input/output handling | Yes | Local return paths, typed form fields, React text rendering, literal process-path checks |
| Cryptography | Yes in dev launcher | crypto.randomBytes; secret never printed; existing files preserved |
| Process/system safety | Yes | Validate ownership before tree/group kill; cleanup only own new launches |

LocalStorage token persistence is already a user requirement, not a claim of XSS immunity. Keep tokens out of logs/URLs, render API text as text, and do not add unsafe HTML. Threat models should cover open redirects, stale account responses, foreign PID termination and accidental reseeding. Backend risk acceptances WR-01/02/04 and open reset risks remain for Phase 5; UI must not claim to fix them.

## Open Questions and Assumptions

- No new product choices need user clarification; D-01..25 and discretion cover them.
- Windows launcher log merging, tree ownership, and macOS group creation are **implementation proposals pending fixture validation**. A successful syntax check is not runtime confirmation.
- Font/photo selection and exact palette/type/moment dealers belong to the first UI implementation task. Check Vietnamese glyphs and offline operation before accepting assets.
- Package-age SUS results need the workflow's pre-install human verification checkpoint; no dependency installation occurred here.
- Codebase drift gate reported 10 modified loadtest structural elements since mapping; advisory only. Current manifests/controllers were read directly, so this research does not rely on the old loadtest map. Refresh command offered by the tool: `$gsd-map-codebase --paths loadtest`.

## Sources and Confidence

Primary source files and exact line ranges are cited above. Official documentation sources: React effects/TypeScript; React Router installation; Vite guide/server options; Microsoft Start-Process 5.1, Win32_Process and taskkill; GNU Bash/job control and nohup. Package checks used the GSD legitimacy seam and npm registry metadata. Confidence resolver returned MEDIUM for verified websearch and for context7; no Context7 tools were available. External documentation supports API primitives; complete OS lifecycle behavior remains to be tested.

**Valid until:** recheck package metadata before install; stable process primitives can be reused, but runtime evidence is required during execution.
