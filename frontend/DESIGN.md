product / site-kind other — cửa hàng thời trang trực tuyến, bước đầu 04-01.
Deal: hero product; palette mint-pink-accounts; nav-split; footer-dark; close-type; brand-band; solid; ring; moment word-highlight. Sau phản hồi UAT Phase 04, tiêu đề và nội dung dùng Be Vietnam Pro cục bộ ở độ đậm 400 và 500 để chữ tiếng Việt hiển thị nhất quán. Các lượt đo bên dưới ghi cấu hình tại thời điểm kiểm tra.

Nền #f8f8f8 giữ ảnh và giá dễ đọc; xanh #1f6b3a dành cho hành động xem sale. Giữ nguyên token do dealer xuất.

## Trang theo dõi và audit năm route 04-09

`/admin` dùng bố cục tác vụ D-04 đồng nhất với trang đơn hàng. Mã sale và bộ điều khiển ở trên, ba số liệu chính và nhóm chi tiết ở giữa, reset ở cuối. Xác nhận nằm cùng cụm reset và chuyển focus vào nút giữ nguyên. Màu đỏ dành cho tồn âm, số bán vượt và hành động xác nhận reset.

Admin đạt 22 ca trên trình duyệt. Kịch bản năm route đạt 35 ca. Ảnh desktop và mobile có trong `.taste-skill/phase04-zanh1B/route-contact-sheet.png`. Gate trả `GATE: OFF (no build active)` và lịch sử `OPEN 3` được giữ. Bảng kiểm thử từng route ghi rõ ảnh quá cỡ, khoảng trống footer, giới hạn công cụ với hồ sơ đã đăng nhập và lỗi `shoot.mjs`. [04-UI-UAT.md](../.planning/phases/04-web-app-dev-scripts/04-UI-UAT.md)

## Polling tồn kho 04-08

Nút “Làm mới tồn kho” giữ vị trí trong cụm mua. Khi lần đọc lỗi, cùng vùng thông báo giữ số tồn và giờ cập nhật cuối. Cụm mua khóa tới khi đọc lại thành công. Không kéo dài trang sale để thêm phần trình bày riêng cho polling.

Kiểm chứng trên bản build Vite và API fixture thật (MongoDB `flashsale_test_ui_12328`, Redis DB 15). `agent-browser` mở được trang sale. Edge headless đạt 10/10 ca, gồm khoảng cách 2.005 ms giữa hai lần đọc, gộp nhấn tay, request chậm, giả lập tab ẩn/hiện, hủy khi rời route, lỗi rồi phục hồi, tồn sau mua và sau reset. Báo cáo cục bộ ở `.taste-skill/phase04-oVYisS/evidence.json`.

## Audit route khách hàng 04-05 — Task 2

Người dùng đã duyệt tracer Task 1 (“approved”). Audit chạy trên bản build `vite preview --port 5174 --strictPort`, API thật qua `scripts/test/ui-api-fixture.mjs` (MongoDB `flashsale_test_ui_33640`, Redis DB 15, saleId `6afd8b8562f44dfa27c7b0ae`; fixture tự xóa DB/khóa khi dừng, đã kiểm tra DB 15 trống). agent-browser bị treo ở lượt trước nên dùng lại driver CDP Edge headless. **`GATE: OFF (no build active)`** khi gọi `gate.mjs` trong worktree; giữ lịch sử OPEN 3, không arm/reset vòng mới. Không chạy thí nghiệm tải.

**Chức năng trên trình duyệt** — `node scripts/test/ui-browser/customer-audit.mjs <saleId> .taste-skill/shots-0405-t2 <abs>/.taste-skill/chrome-0405-t2 400`: **63/63 PASS** ở lượt cuối (kết quả `.taste-skill/shots-0405-t2/04-05-task2-browser.json`, ảnh cùng thư mục, đều gitignored). Lỗi đều tiêm trong trang qua `hook.js`; dữ liệu thật chỉ là đơn của user0401–0410 trong DB fixture.

- Bàn phím: Tab đầu tiên ở `/login` là “Đến nội dung” có vòng focus; 7 Tab tới email, Tab sang mật khẩu, Enter đăng nhập và về đúng sale; Tab tới “Mua ngay” + Enter → đúng 1 POST, “Mua thành công…”; Tab + Enter “Xem đơn của tôi” → `/orders`; Enter “Làm mới đơn hàng” → đúng 1 GET. Menu 390: Enter mở (`aria-expanded=true`), Tab ở trong header, Escape đóng và trả focus về nút.
- Bố cục 1440/1024/820/768/390/320 cho `/login`, sale (khách và đã mua), `/orders`: không tràn ngang, mọi link/nút ≥44px, ô nhập 48px, một h1; nút “Mua ngay” rộng hết cụm ở 390/320.
- 12 đơn (DTO thật nhân bản, một tên rất dài) ở 1440/1024/820/390/320: danh sách nằm trong section, không đè footer, không tràn.
- Giảm chuyển động: h1 opacity 1, countdown vẫn đổi theo giây.
- Phiên: sai mật khẩu báo cạnh form (`aria-invalid`, `aria-describedby=auth-error`), không báo hết hạn, không tạo phiên; reload `/orders` và `/sales` giữ phiên, đọc lại đúng 1 lần; token hỏng ở `/orders` → 401, xóa phiên, `/login?returnTo=%2Forders` với “Phiên đăng nhập đã hết hạn…”, đăng nhập lại về `/orders`.
- Đơn trống: “Bạn chưa có đơn hàng” và “Về trang chủ” dẫn về `/`. `/sales/ffffffffffffffffffffffff` (404) và `/sales/khong-phai-ma` (400): “Không tìm thấy đợt sale.”, đúng 1 GET, “Xem sản phẩm” về `/#products`.
- Lỗi đọc: lần đầu “Không đọc được đợt sale.”/“Không đọc được đơn hàng.” + “Thử đọc lại” và thử lại tải được; lỗi khi làm mới giữ tồn đã đọc (“Còn 87 sản phẩm”, không về 0), báo “Dữ liệu đã cũ… Cập nhật lúc…”, khóa mua, nút làm mới vẫn dùng được; `/orders` giữ danh sách cũ.
- Đồng hồ: giờ server lệch −2 giờ so với máy. Trước `startAt` khóa “Đợt sale chưa mở…”, tự mở sau 3,9 s không đọc lại; còn 5 giây thì đồng hồ về “0 ngày 0 giờ 0 phút 0 giây” và khóa sau 4,9 s, không phát sinh GET, `aria-live="off"`, không POST nào.
- Phiên cũ: GET `/orders/me` của tài khoản trước trả 200 muộn 3 s (bỏ qua abort) sau khi tài khoản sau đăng nhập — không hiện trên trang mới. POST mua trả 201 muộn sau khi đăng xuất trên cùng trang sale — không báo thành công, không lộ mã đơn, nút trở lại; tài khoản sau đăng nhập thấy nút mua theo đơn của mình, tổng 1 POST, server có đúng 1 đơn cho người mua.
- Offline (chặn mọi `https://*`): ba route không tải tài nguyên ngoài, Figtree và Be Vietnam Pro `loaded`, ảnh sản phẩm giải mã. Không có lỗi console.

Chạy lại harness Task 1 trên bản build cuối (fixture cùng lượt, user0001–0004): **22/22 PASS** — mọi mã nghiệp vụ (SOLD_OUT, ALREADY_BOUGHT, SALE_NOT_ACTIVE, STOCK_NOT_LOADED thật/tiêm, 500 và phản hồi mất), reset mở mua lại, token hỏng. Kiểm tra thêm bằng cách sửa JSON sale trong trang: V0 `remaining=-3` hiện “Tồn kho âm: -3 sản phẩm (đã bán vượt)” màu `rgb(163,33,33)` và khóa mua; `stockLoaded=false, remaining=42` hiện “Kho chưa sẵn sàng” và khóa mua.

`/admin` chưa có route (thuộc 04-09): trong app hiện tại mở `/admin` ra “Không tìm thấy trang”; API `/api/admin/sales/:id/stats` trả 403 FORBIDDEN cho user thường. Guard dùng chung được gắn tạm vào một trang Vite dev gitignored (`MemoryRouter` `/admin`, đã xóa sau khi chạy): khách → `/login`, user → “Không đủ quyền” + câu hướng dẫn của UI-SPEC, admin → nội dung. Kiểm tra route thật vẫn thuộc 04-09.

**Sửa trong Task 2 (app CSS, không sửa kit):** (1) link điều hướng desktop của kit cao 36px và logo 22–26px, trái UI-SPEC “link điều hướng tối thiểu 44px” — đặt `.nav__links .nav__link` 44px và logo `min-height: 44px`; menu mobile mở vẫn 56px. (2) Kit cố định `main > section` một màn hình từ 1280px nên 12 đơn ở 1440 tràn tới y=2457 trong khi section kết thúc ở 900 (đè footer; lượt trước sửa FAIL, lượt sau PASS) — `.task-screen` giữ tối thiểu một màn hình nhưng giãn theo nội dung. (3) “Thông tin sản phẩm” chỉ vài dòng bị kéo thành một màn hình (91% trống) — để chiều cao theo nội dung.

**Skill thiết kế** (`CHROME_PATH` = Edge, chạy tuần tự, kết quả trong `.taste-skill/`):

```text
node <skill>/scripts/consistency.mjs http://localhost:5174/login --profile .taste-skill/chrome-consistency-0405-login --page product --category giày --primary "Đăng nhập" --widths 1440,1024,820,768,390 --rhythm-widths 1440,820,768,390 --out .taste-skill/consistency-0405-login
node <skill>/scripts/consistency.mjs http://localhost:5174/sales/<id> --profile .taste-skill/chrome-consistency-0405-sale --page product --category giày --primary "Mua ngay" --widths 1440,1024,820,768,390 --rhythm-widths 1440,820,768,390 --out .taste-skill/consistency-0405-sale
node <skill>/scripts/consistency.mjs http://localhost:5174/sales/<id> --quick ... --widths 1440,390 --out .taste-skill/consistency-0405-sale-quick
node <skill>/assets/layout/check.mjs --url <route> --profile <dir> --sizes 1440x900,1024x768,820x1180,768x1024,390x844,320x640 --shots .taste-skill/layout-0405-<route> --json
node <skill>/scripts/shoot.mjs --url <route> --w 1440|390 --out .taste-skill/shoot-0405/<route>-<w>.png --profile <dir> --no-tiles
node <skill>/scripts/perf.mjs <route> --profile .taste-skill/chrome-perf-0405-<route> --json .taste-skill/perf-0405-<route>.json
node <skill>/scripts/copy-lint.mjs <rendered.html> --kind product
```

- Consistency `/login`: **32 FAIL / 11 WARN**, exit 1; sweep 1280/1152/896 và đi 320px 0 FAIL; tap-size, collide, focus-ring, field-label, contrast, reduced-motion, font-load PASS.
- Consistency `/sales/:id` trước sửa specs: **42 FAIL / 13 WARN** (5 width); quick sau sửa (1440, 390): **15 FAIL / 12 WARN**. Sửa làm mất empty-area/no-visual/section-air FAIL của “Thông tin sản phẩm” nhưng đổi sang section-height/one-section/one-heading/text-only vì section ngắn hơn một màn hình. Hai lượt khác bề rộng, không so số tổng như một cải thiện.
- Consistency `/orders`: **ERROR — không chạy được ở trạng thái đã đăng nhập** vì script tạo hồ sơ trình duyệt mới mỗi lượt nên route chuyển về `/login`. Thay bằng `check.mjs`/`shoot.mjs` với hồ sơ đã có phiên (xác nhận có “Cập nhật lúc…” và 1 đơn), harness CDP và copy-lint trên HTML đã render.
- Layout `check.mjs`: `/login` 0 finding ở cả 6 kích thước; sale 10/9/9/9/3/4 finding (edge-left/edge-right/one-sided của cột mua bên phải ảnh, screen-short/screen-height/sparse/neighbour của “Thông tin sản phẩm”, hero-fold ở 320); `/orders` 1 finding edge-left (“Cập nhật lúc…” cạnh nút làm mới) ở 1440/1024/820/768, 0 ở 390, hero-fold ở 320. `overflowX=false` mọi kích thước. Đã nhìn ảnh first-screen và ảnh toàn trang 1440/390/320.
- Perf: `/login` **0 FAIL / 2 WARN** (font 191,7 KiB), 382 KiB; sale **0 FAIL / 4 WARN** (font, ảnh 1920px cho khung 749/342px), 556 KiB, CLS 0, broken 0. Ảnh responsive vẫn là giới hạn mở từ 04-03.
- Copy-lint: `/login` 41 từ, sale 105 từ, `/orders` 69 từ — đều 0 FAIL / 0 WARN.

**Ngoại lệ D-04 cho màn hình tác vụ** (không quy đổi thành PASS): `/login` và `/orders` là tác vụ — no-visual, copy-headline/copy-fact (“Đăng nhập” không phải tên hàng), product-shown, container-edges của form 28rem ở giữa, empty-area dưới form ngắn, moment-none; sale giữ bố cục UI-SPEC “ảnh bên trái, cụm mua bên phải” nên split-pair/container-edges/edge-left/product-shown 58% chiều rộng là theo hợp đồng; “Thông tin sản phẩm” là dữ liệu thuộc tính, không phải section marketing (cta/text-only/section-height). loop-pause của countdown: đồng hồ đếm ngược là dữ liệu thật của D-08, `role="timer"` `aria-live="off"`, không phải chuyển động trang trí. Matcher copy-buttons/copy-headings/skip-link tiếng Anh không hiểu “Mua ngay”, “Thông tin sản phẩm”, “Đến nội dung” (skip link thật là Tab đầu tiên tới `#top`). form-fields WARN: form có `aria-busy`, lỗi dùng `role="alert"` cạnh trường.

**OPEN còn lại:** footer empty-area/one-section (lịch sử 04-01/03), ảnh 1920px không có biến thể responsive (perf/photo-weight WARN), khoảng trống giữa hero một màn hình và “Thông tin sản phẩm” ở 1440, consistency `/orders` chưa chạy được khi đăng nhập, `/admin` thật chờ 04-09. Có vài tiến trình agent-browser/Edge headless cũ từ phiên trước (14:49–14:56), không do lượt này khởi động nên không dừng.

## Tracer 04-05 Task 1 — đơn của tôi và kết quả mua (đã duyệt)

`/orders` là màn hình tác vụ D-04: h1 “Đơn của tôi”, thời điểm cập nhật và “Làm mới đơn hàng” cạnh tiêu đề, danh sách `ol` dùng ảnh/tên trong DTO của API, giá đã trả, giờ `vi-VN`, trạng thái, mã đơn và “Xem đợt sale”. Không có hero, moment hay ảnh marketing. Trống thì “Bạn chưa có đơn hàng” và “Về trang chủ”. Nav thêm “Đơn của tôi” với `aria-current`. Trang sale giữ SaleHero; vùng phản hồi `role="status"` có câu riêng cho từng kết quả theo bảng copy của 04-UI-SPEC. Tồn âm V0 hiện “Tồn kho âm: {n} sản phẩm (đã bán vượt)” bằng chữ và màu đỏ.

Sửa lỗi bố cục có từ trước: từ 1024px rule hero product của kit (specificity 0,5,0) đặt h1 chồng lên vùng mua của `/sales/:id`. App CSS thêm selector cùng điều kiện `:has` cho `.sale-detail` để h1, lead, giá, đồng hồ và nút nằm một cột bên phải ảnh. Đã đo: h1 x=852 y=120 ở 1440, offer bắt đầu dưới h1 ở 1024. Không sửa kit.

Kiểm chứng trình duyệt thật: Edge headless qua CDP (`scripts/test/ui-browser/purchase-orders.mjs`), bản build `vite preview` 5174, API fixture `scripts/test/ui-api-fixture.mjs` với dữ liệu seed riêng. Lỗi nghiệp vụ SOLD_OUT, SALE_NOT_ACTIVE, STOCK_NOT_LOADED và 500 được tiêm trong trang bằng hook fetch. ALREADY_BOUGHT và SOLD_OUT còn được tạo thật bằng API fixture (mua ở “tab khác”, reset totalQty=1 rồi người khác mua hết). Phản hồi bị mất được giả lập bằng cách gửi POST thật rồi trả lỗi mạng cho trang. Hai lượt cuối trên hai fixture mới đều 22/22 PASS:

- Khách bấm mua về `/login?returnTo=/sales/<id>`. Sai mật khẩu báo trên form, không xóa phiên.
- Sau đăng nhập trang đọc `/orders/me`; nút mua chờ lần đọc đầu tiên.
- Mất phản hồi: đúng 1 POST, “Chưa xác nhận được kết quả mua…”, khóa mua, link “Xem đơn của tôi”; bấm thêm không tạo POST thứ hai. “Làm mới tồn kho” đọc lại đơn và báo “Đơn của bạn đã được ghi nhận. Mã đơn …”. Server có đúng 1 đơn.
- Reload biết đã mua nhờ đọc đơn; localStorage chỉ có `flashsale.session`.
- user0001 thấy đơn của mình trên `/orders`. Đăng xuất ở `/orders` rồi đăng nhập user0002: trạng thái trống, không có mã đơn của user0001.
- SOLD_OUT, SALE_NOT_ACTIVE, STOCK_NOT_LOADED: mỗi mã một câu, mỗi lần đúng 1 POST. 500: chưa rõ và khóa; sau khi đọc đơn không thấy đơn, nút mở và lần mua người dùng tự bấm thành công thật.
- ALREADY_BOUGHT thật 409 và SOLD_OUT thật 409 hiện câu riêng, khóa mua; SOLD_OUT đọc lại “Còn 0 sản phẩm”.
- Reset qua API admin (startAt mới) làm trang đọc lại đơn và mở mua lại cho tài khoản đã mua ở lượt trước.
- Token hỏng: lần đọc đơn nhận 401, phiên bị xóa, bấm mua về `/login` có “Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.”
- Không có lỗi console.

Lượt thứ ba (trước khi sửa) bắt được lỗi thật: khung hình đầu sau khi sale tải bật nút mua trước khi effect đọc đơn chạy, nên một cú bấm có thể rơi vào lúc nút vừa bị khóa. Đã sửa bằng `awaitingMembership` (chờ lần đọc thành công hoặc lỗi của đúng phiên + lượt sale) và thêm test.

`npm.cmd --prefix frontend test` 48/48, `npm.cmd --prefix frontend run build` (gồm `tsc -b`) đạt. Kiểm tra checker/layout/perf của skill trên `/login`, `/sales/:id`, `/orders` thuộc Task 2 và chưa chạy. Route `/admin` thuộc 04-09 nên ca tài khoản thường mở `/admin` chưa kiểm tra được trên trình duyệt; ProtectedRoute đã dùng câu của 04-UI-SPEC. `GATE: OFF (no build active)` giữ nguyên.

## Thiết kế trước route 04-04

Giữ product/other, palette/type/buttons/nav/footer đã duyệt. `/login` là tác vụ xác thực D-04/D-10: waiver cụ thể cho hero dealer, moment, ảnh và screen-height marketing; một form ngắn có label/48px field/44px controls, chuyển đăng nhập/đăng ký thủ công, dùng endpoint auth thật. Không tạo mailto.example hoặc lời hứa gửi thư vì đây là form tài khoản đã có API. Không thêm khoảng trống/moment để làm chậm thao tác.

`/sales/:id` tiếp tục SaleHero product đã duyệt và cùng ảnh của đúng sale. Waiver route dealer riêng để giữ sự liên tục home→sale của cùng sản phẩm; không deal góc chụp giả/film thiếu. Bổ sung vùng mua/countdown và thuộc tính semantic ngay trong luồng D-04/D-08/D-12; waiver moment riêng trên tác vụ mua vì cuộn một màn hình marketing mới sẽ tách nút mua khỏi trạng thái kho. Hero data-enter và hover/reduced-motion giữ từ kit, usePageKit init/cleanup theo route. Countdown thật không phải count-up trang trí; không thêm mode/size picker. Footer chung không thay hoặc rearm gate. Full auth/customer-route checker của04-05/09 còn chờ; không lấy audit home làm PASS cho route mới.

## Kiểm thử luồng mua 04-04 — Task 1

`npm.cmd --prefix frontend test` đạt 30/30. Typecheck và build của frontend và backend đều đạt. `node --check scripts/test/ui-api-fixture.mjs` cũng đạt.

Edge đi từ trang chủ tới sale, bấm mua khi chưa đăng nhập, nhận lỗi với mật khẩu sai rồi đăng nhập thành công và quay lại đúng sale. Hai lần nhấp liên tiếp phát sinh một POST có Bearer, `mode=v2` và `qty: 1`. API trả 201, xác nhận mua giữ trên trang và tồn kho hiển thị giảm từ 100 xuống 99. Lượt đầu trả 500 do fixture chưa gọi `registerBuyScript`. Fixture đã được sửa theo cách khởi tạo của server và lượt chạy lại xác nhận kết quả 201.

Sau reload, localStorage giữ `token` và `user` với bốn trường. Đăng xuất xóa phiên. Đăng ký ở 320px lưu phiên mới và quay lại đúng đợt sale. Các trường có label và cao ít nhất 48px. Trang sale ở 390px có nút mua cao ít nhất 44px. Ở 1440px, ảnh và vùng mua nằm cạnh nhau. Ba kích thước đã thử đều không tràn ngang.

Ảnh kiểm tra sale và form đăng ký lưu trong `.taste-skill/shots/04-04-sale-phone.png` và `.taste-skill/shots/04-04-register-phone.png`. Kiểm tra toàn bộ giao diện khách hàng nằm ở 04-05/09. Sau reload, phiên vẫn còn và API tiếp tục chặn mua trùng. Đọc đơn để khôi phục trạng thái đã mua trên giao diện thuộc 04-05.

## Kiểm thử luồng mua 04-04 — Task 2

Người dùng duyệt Task 1. Edge trên bản build 5174 ở 390 px và chế độ giảm chuyển động đăng ký bằng Enter, quay lại đúng sale và mua V2 bằng một POST Bearer dù nhấp hai lần. API trả 201, tồn kho giảm từ 98 xuống 97 và xác nhận vẫn hiện. Khi tải thẳng trang đăng nhập, lần Tab đầu đi tới link bỏ qua nội dung.

Phiên còn sau reload. JSON phiên hỏng được xóa. Giả lập phản hồi sale trong Edge cho thấy đồng hồ về 0 và khóa mua khi hết hạn hoặc chưa nạp kho. Hai lần làm mới thủ công tương ứng hai GET. 30 test frontend, typecheck và build đạt.

## Audit storefront 04-03 — Task 2

**`GATE: OFF (no build active)`**; giữ lịch sử OPEN3, không reset/rearm hoặc chạy lại gate sau OFF. Người dùng đã duyệt “Duyệt storefront 04-03, tiếp tục Task 2”. Các đoạn chờ duyệt bên dưới là lịch sử Task1, được mục này thay thế.

Audit dùng bản build thật http://localhost:5174/ và Edge cài sẵn, mỗi script browser chạy tuần tự. Đặt `CHROME_PATH=C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe` cho process kiểm tra. Không sửa kit/checker, không đổi ảnh/font đã duyệt.

```text
node .agents/skills/design-taste-frontend/scripts/consistency.mjs http://localhost:5174/ --profile .taste-skill/chrome-consistency-04-03 --page product --category giày --primary "Xem đợt sale" --widths 1440,1024,820,768,390 --rhythm-widths 1440,820,768,390 --out .taste-skill/consistency-04-03
node .agents/skills/design-taste-frontend/assets/layout/check.mjs --url http://localhost:5174/ --profile .taste-skill/chrome-layout-04-03 --sizes 1440x900,1024x768,820x1180,768x1024,390x844 --shots .taste-skill/layout-04-03 --json
node .agents/skills/design-taste-frontend/scripts/copy-lint.mjs .taste-skill/consistency-04-03/rendered.html --kind product --json
```

Full consistency: **26FAIL/27WARN**, không probe error. Theo width:1440=6/8,1024=2/5,820=4/3,768=7/4,390=7/7. Sweep1280/1152/896 và đi320x640:0FAIL. CTA cũ đã đạt; no-visual/hole đã đạt sau khi có ảnh catalog nên hai waiver catalog văn bản cũ **hết áp dụng**. Assets/font-load/nav/menu/focus/contrast/links/hover/reduced-motion đạt. Copy-lint223words,0finding; các matcher heading/nút/skip-link tiếng Anh trong consistency vẫn không hiểu danh từ/động từ Việt. “Đến nội dung” thực sự là link đầu tiên đến#top.

Layout checker giữ stress mặc định, exit1:3finding screen-height của catalog tại1024 (1552px=2screen+16),768 (2056px=2screen+8),390 (3667px=4.35screen);1440/820 không finding. OverflowX=false ở cả5width. Đã mở/nhìn cả5first-screen PNG trong layout-04-03; ảnh và hamburger đều hiện. Full-page screenshot Task1 vẫn ở shots/storefront-<width>.png, thay đổi tải ảnh không thay bố cục.

Ngoại lệ D-04/D-07 cụ thể, không quy đổi raw FAIL thành automated PASS:

- card-layout, `.catalog-grid`: sáu thẻ hàng cần cùng một cấu trúc ảnh/tên/giá/thuộc tính để so sánh; không phải sáu feature marketing cần sáu composition.
- photo-repeat, ảnh thứ4 catalog: đúng cùng sản phẩm sneaker với active sale, cùng ảnh API; không bỏ hàng hoặc tạo góc chụp giả để tránh lặp.
- copy-headings, h2#products-h và h2#limit-h: gọi đúng danh mục và quy tắc trong SPECS, matcher danh từ Anh không nhận tiếng Việt. Giữ waiver cũ cho target#products-h trong lịch sử, không dùng một target bao phủ các lỗi không liên quan.
- container-edges, hero__lead x949: cột9..12 của recipe product nguyên bản được deal, không phải mép container lệch.
- section-height và one-section ở catalog/section sau: giữ đủ sáu sản phẩm và mọi thuộc tính bằng chữ dễ đọc, mobile4.35screen; tablet tự giãn16/8px. Không giấu dữ liệu hoặc cắt thành các mục quảng cáo.

**OPEN thực sự:** empty-area footer (50–67% tại1440/820/768), one-section phân loại nút close rộng thành band; không miễn trừ khoảng trống như thể đã sửa. WARN giữ: orphan cuối dòng thuộc tính, stranded-action trong statement, bộ ảnh stand-in khác độ sáng/màu (ảnh áo thun khác nhất), photo-credit cần thay bằng ảnh hàng thật; scroll-linked/reveal chỉ trong word-highlight đã deal và reduced-motion đạt. Không có fact/brand/form/contact giả mới, canonical domain vẫn chưa có vì demo local.

**OPEN mạng chậm:**1.6Mbit/s/400ms/no-cache phát hiện ảnh sneaker173KiB đến muộn1giây; cuối probe tải xong, không phải URL hỏng. Đã thử eager cho ảnh catalog cùng productId với hero nhưng lượt phone vẫn FAIL cùng ảnh, nên hoàn nguyên thử nghiệm; không giữ thay đổi không giải quyết vấn đề. Hero vẫn eager/high-priority, catalog lazy. Ảnh1920px cần biến thể responsive nhỏ hơn để đóng giới hạn này; không gọi là waiver hoặc PASS. Lượt phone riêng (consistency-04-03-phone, cùng command nhưng --widths390 --rhythm-widths390) có9FAIL/10WARN; checker cảnh báo không có desktop read trước nên các finding row/card/edges chỉ có giá trị tham khảo. Không thay thế lượt đầy đủ26/27 hoặc giấu slow-load failure.

Perf thật trên5174 (`node .agents/skills/design-taste-frontend/scripts/perf.mjs http://localhost:5174/ --profile .taste-skill/chrome-perf-04-03 --json .taste-skill/perf-04-03.json`): **2FAIL/4WARN**, exit1. FAIL oversized-images tại1440 (6ảnh) và390 (7img bao gồm ảnh sneaker lặp); natural1200/1000/1920px lớn hơn2.2×frame409/340/390px. Đây là giới hạn chưa đóng, không gọi asset/perf PASS. Transfer~1109KiB, ảnh730KiB/6file, lớn nhất206KiB, JSparsed397KiB, CSS49KiB, fonts191.7KiB/2file,26/25request, CLS0, broken0,WebGL0. WARN CPUhost96–98%/fontbytes; timing chỉ tham khảo, không phải E2. Ảnh cùng loại đã duyệt chưa có srcset; cần biến thể nhỏ hơn để xử lý cả oversized và slow-load trong một thay đổi tài sản có kiểm chứng.

Task2 acceptance chức năng kiểm tra lại trên build5174, HTTPS ngoài bị chặn:1440/1024/820/768/390/320 đều đủ6hàng,7img decode,giá/mọi thuộc tính khớp API,external=[],overflow=false; icon18px khi menu hiện. Browser loading có aria-busy, khóa refresh và giữ dữ liệu cuối;3vòng home→sale→home hủy moment cũ rồi chỉ mount1moment mới; footer/#products và credits.html200. 11kit files được so SHA256 với nguồn và giống hệt. 21native tests, frontend typecheck/build cuối đạt; không thay backend hoặc ghi số đo chính thức.

Danh sách public chính xác sau dealer và assets04-02 (không thêm file ngầm):

```text
assets/system.css
assets/system.js
assets/layout/layout.css
assets/layout/layout.js
assets/motion/motion.css
assets/motion/motion.js
assets/moments/lib.js
assets/moments/moments.js
assets/moments/word-highlight/moment.css
assets/moments/word-highlight/moment.js
assets/ui/ui.js
assets/fonts/Figtree-Variable.ttf
assets/fonts/OFL.txt
assets/fonts/BeVietnamPro-Regular.ttf
assets/fonts/BeVietnamPro-OFL.txt
images/products/ao-thun-cotton-basic.jpg
images/products/quan-jeans-slim-fit.jpg
images/products/vay-hoa-midi.jpg
images/products/giay-sneaker-trang.jpg
images/products/tui-tote-canvas.jpg
images/products/ao-khoac-gio.jpg
favicon.svg
credits.html
```

## Tracer storefront 04-03 — đã duyệt, ghi chép Task 1

Giữ product/other, hero product, palette mint-pink-accounts/Figtree (Be Vietnam Pro bổ sung chữ Việt), nav-split/footer-dark/close-type/brand-band/solid/ring và word-highlight. HomePage đọc sale trước, tiếp theo catalog6 sản phẩm thật có ảnh/tên/giá/thuộc tính và làm mới thủ công. Giá đọc API/vi-VN, không có link hoặc nút mua giả trên các thẻ không bán trực tiếp. Statement giữ quy tắc một sản phẩm và link sale thật. Không thêm route hàng, cart, filter hay thư viện UI.

Layout dùng chung giữ header qua route, có chỗ gắn sessionLinks cho04-04, skip link, menu44px với SVG thật, aria-controls/expanded, Escape trả focus và Tab trong menu mở. Padding của btn từng ép icon về0px dù SVG tồn tại: đã sửa app CSS padding0, kiểm tra chiều rộng icon18px ở820/768/390/320. Không sửa kit. Catalog3 cột desktop,2 cột tablet,1 cột mobile; tên/giá/attributes nằm trong padding card. Kích thước tote là object, hiển thị đủ rộng/cao/sâu, không bỏ mất dữ liệu linh hoạt của MongoDB. Anchor sản phẩm chờ HomePage tải xong khi quay từ sale.

21test native PASS (13client/catalog +8asset); frontend typecheck/build PASS. Client giữ /api, chỉ tự thêm JSONheader khi có body, bảo toàn ApiError và AbortError kể cả đang đọc response body, không retry mutation. Các path ngoài/backslash/control/whitespace/fragment bị từ chối trước fetch. Public DTO chuyển sang types.ts, tương ứng dto.ts backend; không import cấu hình backend vào frontend.

Browser qua API thật5173: sáu sản phẩm khớp tên/ảnh/giá/mọi thuộc tính (kể cả object),7img decode, không resource ngoài/tràn ngang tại1440/1024/820/768/390/320. `.taste-skill/storefront-<width>.json` lưu kết quả. Fault injection chỉ trong browser, khôi phục fetch thật trong finally: không active sale vẫn6 hàng/không sale linkgiả; products rỗng không hàng giả; lỗi refresh giữ hàng/sale/thời điểm cuối và báo stale; lỗi tải đầu có retry; retry phục hồi; sale link thật và quay về/#products sau fetch đều PASS. `.taste-skill/storefront-states.json` có6case. Không gọi đó là thay đổi/trạng thái DB thật. Menu click/Tab/Escape chạy, activeElement=BUTTON/ariaExpanded=false sau Escape, app console không lỗi.

Skill shoot qua Edge headless trên5174 đã chụp và nhìn1440/1024/820/768/390; bản tablet/mobile được chụp lại sau sửa icon. 1440=4500px (5screens),1024=3856px,768=5128px: tablet còn giãn16/8px so với5screen; không gọi nhịp mọi kích thước hoàn hảo. Mobile catalog giữ đầy đủ6 hàng và attributes nên dài hơn2screen (390:4.34screen), ngoại lệ chức năng D-04/D-07; không cắt thông tin hoặc ép chữ nhỏ để đạt công thức marketing. Sneaker xuất hiện hero và hàng catalog đúng cùng sản phẩm, cần waiver cụ thể photo-repeat nếu checker đòi ảnh khác; không tạo thêm ảnh hoặc giấu hàng. Footer/statement còn khoảng trống trong screenshot; sẽ được audit trong Task2.

**`GATE: OFF (no build active)`**, lịch sử04-01 OPEN3 còn nguyên. Không chạy lại gate sau OFF hoặc reset round. Full checker/layout/perf của04-03 **Task2 chưa chạy**, đang chờ tracer feedback theo execute-plan; không dùng audit04-02 làm PASS cho storefront mới. Bốn waiver cũ giữ lịch sử; no-visual/hole catalog sẽ phải đánh giá lại vì catalog hiện có ảnh. Giữ copy tiếng Việt và voice card trực tiếp đã chọn; không thêm assumed fact/canonical domain/form giả.

Public assets giữ đúng11file kit (system.css,system.js; layout/layout.css,layout/layout.js; moments/lib.js,moments/moments.js,moments/word-highlight/moment.css,moment.js; motion/motion.css,motion/motion.js; ui/ui.js) nguyên bản. Font files/license: fonts/Figtree-Variable.ttf,OFL.txt,BeVietnamPro-Regular.ttf,BeVietnamPro-OFL.txt. Sáu JPEG giữ nguyên04-02; nguồn và shot list thay bằng hàng thật vẫn ở ASSETS.md, credit chung /credits.html. Không tạo asset runtime ngoài danh sách này.

## Kết thúc kiểm chứng tài sản 04-02

Người dùng đã duyệt “oke tôi duyệt bộ ảnh/font”; Task2 hoàn tất sau phản hồi. Kết quả phần này cập nhật các ghi chép đang chờ trong mục tracer bên dưới.

`GATE: OFF (no build active)` giữ nguyên; lịch sử04-01 OPEN3 được giữ, không chạy lại gate sau OFF và không reset/rearm vòng cũ. Báo cáo consistency đầy đủ mới tại `.taste-skill/consistency-04-02/report.json`:20FAIL/21WARN trên1440/1024/820/768/390. Lượt đi320px0FAIL; assets/font-load/empty-visual/reduced-motion/contrast/links/focus/hover/overflow đạt. Bốn waiver04-01 cho no-visual/hole/copy-headings/container-edges còn đúng với catalog văn bản/recipe hiện tại. CTA/empty-area/one-section vẫn OPEN; các WARN scroll chỉ nằm trong word-highlight được deal, matcher động từ/skip-link tiếng Việt chưa hiểu nội dung tiếng Việt, photo-weight do hero1920px trênmobile. Không giấu finding hoặc sửa kit/checker. Đây là audit tài sản trên layout cũ, không phải full-storefront audit04-03.

Perf build5174 mới:0FAIL/5WARN, khoảng551KiB transfer, 191.7KiB fonts/2family/2file, 173KiB hero, CLS0, broken0. CPUhost100% nên timing chỉ tham khảo; font bytes và oversized mobile là WARN có lý do ở ASSETS.md. Browser Task2 qua5174 chặn HTTPS ngoài xác nhận6ảnh decode,2font local loaded, external=[]/overflow=false ở1440/1024/820/768/390/320;8test và strict typecheck/build chạy lại đạt. Không dùng số perf UI làm kết quả E2.

## Đính chính và tracer tài sản 04-02 (2026-11-17)

Thông tin trong phần này thay thế khẳng định glyph của ghi chép 04-01 bên dưới: Figtree 62.712 byte **không** có đầy đủ tiếng Việt. Test cmap thực tế bắt lỗi U+01A0 “Ơ”; metadata Google Fonts chỉ khai báo latin và latin-ext. Việc browser hiển thị được chữ không chứng minh glyph thuộc Figtree. Bổ sung Be Vietnam Pro Regular (132.948 byte, SIL OFL 1.1, nguồn Google Fonts chính thức) làm fallback local trong cả hai font token; giữ Figtree chính và toàn bộ màu/scale/kit. Ngoại lệ chức năng được cho phép bởi 04-02 và D-03/D-05, không phải chọn lại typography vì sở thích.

Đủ sáu ảnh JPEG tại đường dẫn seed. Giữ nguyên sneaker; áo thun Marina Podrez, jeans Castorly Stock, váy hoa Marcelo Verfe, tote Stephanie Ho, áo khoác Ali Babajahdi. Giấy phép/nguồn/giới hạn stand-in chi tiết ở ASSETS.md và credit chung `/credits.html`. Ảnh jeans gấp/áo khoác cận cổ không chứng minh dáng hoặc tính chống nước của hàng thật. Không sửa dữ liệu sản phẩm để hợp ảnh. Ảnh áo khoác có biển giá và các ảnh có logo đã bị loại.

Task 1: 8/8 test PASS, frontend/backend typecheck/build PASS. Edge đọc sáu URL thật từ API fixture qua5173, `Image.decode()`/MIME/dimensions đạt. Cả hai font load local, HTTPS ngoài bị chặn, không có resource ngoài và không tràn ngang ở1440/1024/820/768/390/320. Đã chụp/nhìn sáu screenshot `.taste-skill/shots/assets-<width>.png`. Menu tablet/mobile còn trông trống và khoảng trống statement/footer vẫn có; chúng thuộc lát cắt layout04-03, không gọi visual PASS.

Lượt gate hiện tại: **`GATE: OFF (no build active)`**. Marker giai đoạn04-01 đã ở `build.done.json`; `gate.json` vẫn giữ lịch sử **OPEN3**. Không reset/rearm để vượt vòng sửa. Kiểm tra consistency/perf/offline Task2 chưa thực thi vì tracer có human-check; chờ duyệt ảnh/font rồi tiếp tục. Không lấy perf04-01 làm kết quả mới và không tuyên bố gate đầy đủ năm route.

## Ghi nhận trước trang đầu

- Package checkpoint 04-01 Task 1: người dùng xác nhận “oke tôi xác nhận” ngày 2026-11-17, trước npm install. Manifest có 10 package theo plan. Audit trước đó: 6 OK; react-router, vite, @vitejs/plugin-react, @types/node SUS chỉ vì too-new của latest; không gọi SUS là PASS. Đã đối chiếu phiên bản cụ thể, engines, peers và repository chính thức trong cuộc hội thoại. React Compiler là optional, không thêm.
- Gate đã arm trước tạo trang: `--start http://localhost:5173/ --kind product --category fashion --primary "Xem đợt sale"`, 3 rounds.
- Hero dealer lần đầu: `product (Product stage with one object)`; `--type product --has photo`.
- Trade `fashion` bị dealer từ chối (không có trade này); dùng trade hợp lệ `retail`. Kết quả: mint-pink-accounts, plaster-rose, steel-orange; type figtree, instrument-serif, fraunces. Giữ palette/type đầu tiên.
- Moment seed b018d5f8: pinned-chapters; cần ba ảnh chương khác nhau, chưa có trong lát cắt một ảnh của 04-01. Deal lại với `--fits statement --exclude pinned-chapters,photo-chapters`: seed a2356b4a, word-highlight. Không thêm ảnh hay câu chuyện sản phẩm bịa để điền các chương.
- Option dealer lần đầu: nav-split / footer-dark / close-type / brand-band / solid / ring.
- Kit files dùng được chép nguyên bản vào public/assets; CSS app ở src/styles/app.css, không sửa kit/checker.

## Sự thật và giọng văn

Tên Flash Sale từ brief. Người xem chọn sản phẩm thời trang và đọc đợt sale thật. Giá/tên/số còn lại lấy từ API, không cố định theo seed. Mỗi tài khoản tối đa một sản phẩm trong một đợt sale (SPECS). Không có review, số khách, lời hứa vận chuyển hoặc địa chỉ tự tạo.

Voice card: trực tiếp, tiếng Việt, gọi đúng tên hàng và thao tác; câu ngắn ở trạng thái lỗi. H1 theo tên hàng; CTA “Xem đợt sale”. Device budget: không slogan/đối lập/ẩn dụ, không nhãn in hoa trang trí.

## Kế hoạch màn hình

- home hero: 1 screen ở mọi chiều rộng; tên và giá sale, số còn lại; một ảnh sneaker thật trên stage, ảnh hiện ngay; hero entrance giúp đọc tên rồi tới hành động.
- home products: danh sách văn bản sáu sản phẩm thật, không ảnh thiếu/khung giả; 1 screen; layout/ảnh catalog hoàn thiện ở 04-02/03.
- home statement: word-highlight nhấn quy tắc mua một sản phẩm, 1 screen; hiệu ứng trong section của nó, có reduced motion và cleanup.
- footer: close-type, footer-dark, một credit chung; chỉ dẫn đến trang/anchor đã có.
- sale detail: tracer chỉ đọc đúng sale theo id, có quay về danh sách; auth/mua thuộc 04-04/05, không thêm nút mua chưa hoạt động.

## Tài sản và giới hạn đang mở

Font Figtree variable từ google/fonts/ofl/figtree, SIL OFL 1.1, lưu cả OFL.txt. Phải kiểm tra glyph tiếng Việt trước chấp nhận.
Đã tìm ảnh bằng photos.mjs search “white sneakers”: 5 ứng viên Commons. Download Commons bị HTTP429, đang đối chiếu ảnh thật Unsplash; ảnh có logo hoặc sai màu sẽ bị loại. Nguồn cuối và credit sẽ ghi sau khi nhìn ảnh đầy đủ.

## Kiểm tra

Chưa chạy browser/checker/layout/perf/gate cuối. Chưa tuyên bố frontend typecheck/build PASS. Danh sách ảnh còn lại, catalog và các màn hình khác theo plan riêng.

## B?ng ch?ng tri?n khai 2026-11-17

- Font: ki?m tra tr?c ti?p cmap TrueType cho c?c k? t? ti?ng Vi?t (?/?, ?/?, ?/?, ?/?, ?/?, ?/?, ?/? v? d?u thanh), kh?ng c? glyph thi?u; browser t?i Figtree t? local, kh?ng c? request t?i nguy?n ra ngo?i.
- ?nh cu?i: cottonbro studio, Pexels 6322602, https://www.pexels.com/photo/a-white-sneakers-6322602/, https://www.pexels.com/license/. ?? nh?n ?nh g?c v? b?n crop CDN ? k?ch th??c ??y ??; ??i sneaker tr?ng ?ang s? d?ng, kh?ng c? ch?/logo th??ng hi?u ??c ???c trong crop. ??y l? ?nh ??i di?n c?ng lo?i h?ng; c?n thay b?ng ?nh h?ng th?t khi c?. File JPEG local 1920?1080, ~173 KiB. Credit chung tr? t?i /credits.html. C?ng c? photos.mjs credits ch? c? Commons/Unsplash n?n trang credits Pexels ???c vi?t t? ngu?n th?t, kh?ng ghi credit sai.
- B? sung .taste-skill/ v?o .gitignore ?? h? s? Chrome v? ?nh audit kh?ng ?i v?o git; Task 04-06 gi? quy t?c n?y khi c?p nh?t ignore dev scripts.
- Root React g?n v?o body#root ?? gi? tr?c ti?p header/main/footer, tr?nh wrapper sai c?u tr?c theo checker.
- Gate category ?? ??i t? fashion sang gi?y: matcher ti?ng Anh c?a checker kh?ng nh?n t?n h?ng ti?ng Vi?t; ch? gi?y l? category th?t c?a hero. Kh?ng ??i kind ho?c n?i dung ?? gi?u sai s?t.
- Layout l??t ??u: 1440/1024/820/768/390 kh?ng c? finding; consistency ??y ?? ph?t hi?n kho?ng tr?ng/footer, c?u tr?c root v? ki?m tra t? kh?a ti?ng Anh. ?? s?a root, footer, menu, m?u statement v? k?ch th??c v?ng statement; final gate c?n ?ang ch?y, kh?ng g?i l??t n?y PASS.
- Browser: /api/health 200 testMode=true; /api/sales/active tr? 449500?, remaining100; /api/products c?6 m?t h?ng. ?nh decode1920?1080; fonts=true; external resources=[]; kh?ng overflow ? snapshot desktop.
- ?i?u h??ng th?c s? t?i /sales/<id> hi?n th? t?n h?ng v? n?t Xem danh s?ch. ApiError t? /sales/invalid gi? status400, codeINVALID_ID v? th?ng b?o ti?ng Vi?t th?t.
- Tr?ng th?i kh?ng c? sale ?? th? b?ng c?ch k?t th?c ??ng sale trong database fixture: b?o Ch?a c? ??t sale, v?n c?6 s?n ph?m, kh?ng t?o link sale gi?. Sau ?? kh?i ph?c tr?ng th?i active c?a fixture.
- Th? l?i m?ng c? ki?m so?t tr?n l?n refresh: v?n c?6 m?t h?ng v? t?n sale, hi?n D? li?u ?? c? v? n?t Th? ??c l?i.
- Performance l??t dev: FAIL transfer/JS do React dev v? HMR; request h?y b?i StrictMode b? t?nh broken. ??y kh?ng ph?i b?o c?o production ho?c th? nghi?m E2. S? ??i chi?u build preview tr??c k?t lu?n.

- Waivers gate (4, gi? c? l? do trong t?i li?u ?? t?i t?o): no-visual section#products (danh s?ch v?n b?n ??ng Task2; ?nh ho?n thi?n ?04-02/03), hole section#products (c?t t?n/gi? t?ch nhau, kh?ng ph?i slot tr?ng), copy-headings h2#products-h (t? ?i?n ch? nh?n danh t? ti?ng Anh, c?c danh t? ti?ng Vi?t ??ng brief), container-edges hero__lead (recipe product nguy?n b?n c?t9..12 x949, checker t?ng qu?t ch? cho split5/6/7). Kh?ng s?a checker/kit, kh?ng gi?u ph?n t? kh?i audit.
- Gate round1 FAIL7; round2 FAIL3 sau4 waiver. L??t round2 t?i s? d?ng k?t qu? v? URL Vite gi?ng nhau, ch?a x?t thay ??i module src; chuy?n v?ng cu?i sang build preview5174 ?? ki?m tra ??ng artifact m?i, kh?ng reset rounds. ?? s?a CTA cu?i section v? button footer r?ng theo class btn--wide c?a kit.
- Perf build preview5174: 0FAIL/3WARN, t?ng421KiB, JS parsed394.3KiB, kh?ng request h?ng, CLS0 ?1440/390. WARN CPU100% c?a host v? ?nh1920px tr?n mobile; timing l? s? t??ng ??i c?a UI, kh?ng ph?i k?t qu? t?i E2. ?nh responsive ho?n thi?n ?04-02.

## K?t qu? gate cu?i

`GATE: OPEN 3 (rounds used up)` ? build preview http://localhost:5174/, round3, k?t qu? m?i (reused=false), 2026-11-17T04:43:25.995Z. D?ng ch?nh giao di?n theo finish-gate; kh?ng g?i ??y l? PASS.

Ba finding ch?a ??ng: (1) cta t?i section.statement: checker kh?ng nh?n CTA ph? Xem s?n ph?m l? main action Xem ??t sale; (2) empty-area t?i footer#contact, b?o50% tr?ng ?1440; (3) one-section: button ??ng trang r?ng89% b? ph?n lo?i th?nh band ch?. Gi? trong b?n giao cho l?t c?t catalog/layout04-02/03; kh?ng gi?u n?i dung ho?c s?a checker. C?c c?nh b?o kh?ng ch?n c?n g?m nav, motion trong moment (???c ph?p), matcher ??ng t? ti?ng Vi?t, action ?footer, ngu?n ?nh ??i di?n.

B?n waiver ?p d?ng nh? ?? ghi ph?a tr?n; c?u h?nh t?i t?o:

```json
[
  {
    "check": "no-visual",
    "target": "section#products",
    "reason": "04-01 Task 2 yêu cầu danh sách văn bản sáu sản phẩm thật; ảnh catalog thuộc 04-02/03. Đây là danh sách hàng/giá chức năng, không phải feature marketing cần visual. Không thêm ảnh thiếu hoặc ảnh bịa."
  },
  {
    "check": "hole",
    "target": "section#products",
    "reason": "Khoảng giữa tên hàng và giá là cột trống của danh sách giá sáu dòng; mỗi dòng thực sự có nội dung hai đầu. Không phải slot visual hoặc nội dung bị giấu. Giữ giá trên mép phải để đọc so sánh."
  },
  {
    "check": "copy-headings",
    "target": "h2#products-h",
    "reason": "Các heading tiếng Việt Sản phẩm thời trang và Giới hạn mỗi tài khoản gọi đúng hàng và quy tắc trong SPECS/D-07/D-12; từ điển danh từ tiếng Anh của checker không nhận chúng."
  },
  {
    "check": "container-edges",
    "target": "div.hero-text.hero__in > div.hero__head > div:nth-of-type(1) > p.hero__lead",
    "reason": "Hero product được dealer chọn và layout.css nguyên bản đặt lead/CTA trên cột 9..12 ở desktop (x949), đúng hero-product và layout-v4 §3. Kiểm tra tổng quát chỉ chấp nhận split cột 5/6/7 nên xung đột với chính recipe được deal."
  }
]

```
