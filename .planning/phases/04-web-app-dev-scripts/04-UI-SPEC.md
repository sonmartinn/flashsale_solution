---
phase: "04"
slug: "web-app-dev-scripts"
status: approved
shadcn_initialized: false
preset: none
created: "2026-11-18"
reviewed_at: "2026-11-18T10:23:48Z"
---

# Phase 04 — Hợp đồng thiết kế giao diện

Áp dụng cho `/`, `/sales/:id`, `/login`, `/orders` và `/admin` theo WEB-01 đến WEB-07. Hợp đồng ghi nhận thiết kế đã triển khai trong 04-01 đến 04-04 và hướng dẫn phần UI của 04-05, 04-08, 04-09. Script của 04-06 và 04-07 theo đặc tả riêng tại §12. Biểu đồ E2 thuộc Phase 05. [SPECS §9](../../../docs/SPECS.md#9-giao-diện) · [04-CONTEXT.md](04-CONTEXT.md) · [04-RESEARCH.md](04-RESEARCH.md)

## Design System

| Thuộc tính | Giá trị |
|---|---|
| Tool | none |
| Preset | Không áp dụng |
| Thư viện component | React và HTML ngữ nghĩa, CSS và kit `design-taste-frontend` đã chép cục bộ |
| Thư viện icon | Không có package icon. Giữ vòng `ring` và SVG menu hiện có |
| Font | Be Vietnam Pro cho tiêu đề và nội dung, sau cùng `sans-serif`. Bản Regular (400) và Medium (500) tải cục bộ |

React 19, React Router 7 và Vite 8 dùng cấu trúc dự án hiện tại. Kết quả thiết kế đã chốt là `product` với `site-kind=other`, hero `product`, palette `mint-pink-accounts`, `nav-split`, `footer-dark`, `close-type`, `brand-band`, nút `solid`, dấu `ring` và `word-highlight` ở trang chủ. Tái sử dụng `Layout`, `SaleHero`, `ErrorPanel`, `ProtectedRoute`, `.wrap`, `.task-screen` và cặp `.btn--primary` / `.btn--secondary` khi phù hợp. Quyết định D-03 và manifest hiện tại xác định kit cục bộ là hệ thống giao diện của Phase 04. Cây nguồn gốc và `frontend` không có `components.json`. [frontend/DESIGN.md](../../../frontend/DESIGN.md) · [frontend/package.json](../../../frontend/package.json) · [app.css](../../../frontend/src/styles/app.css)

Giữ sáu ảnh sản phẩm theo đường dẫn seed `/images/products/<slug>.jpg`. Dùng ảnh của đúng sản phẩm trong API, cùng tên sản phẩm dễ đọc khi ảnh thiếu hoặc tải lỗi. Tên, giá và thuộc tính là dữ liệu mua hàng. Giữ credit chung `/credits.html` và nguồn ảnh đại diện trong `frontend/ASSETS.md`. Demo tải ảnh và font từ app. [frontend/ASSETS.md](../../../frontend/ASSETS.md)

## Spacing Scale

| Mức | Giá trị | Cách dùng |
|---|---|---|
| xs | 4px | Khoảng cách sát giữa các phần của một nhãn |
| sm | 8px | Giữa nhãn và ô nhập, giữa các dòng ngắn trong một nhóm |
| md | 16px | Khoảng cách chuẩn trong form, danh sách và nhóm số liệu |
| lg | 24px | Padding thẻ sản phẩm, khoảng giữa các nhóm tác vụ |
| xl | 32px | Khoảng giữa các cụm nội dung lớn hoặc nhóm thẻ |
| 2xl | 48px | Khoảng ngắt phần chính, lề `.wrap` trên tablet |
| 3xl | 64px | Khoảng ngắt cấp trang của kit |

Ngoại lệ có căn cứ trong kit hiện hữu. Dùng khoảng 12px tại `.sale-offer`, `.sale-actions` và gutter mobile để giữ nội dung liên quan gần nhau. Lề `.wrap` là 24px dưới 640px, 48px từ 640px và 80px từ 1024px để giữ hai mép thẳng hàng theo lưới đã duyệt. Kích thước thao tác tối thiểu 44px cho nút, link điều hướng và nút menu, 48px cho ô nhập. Các nhóm mới dùng 8px, 16px hoặc 24px. [system.css](../../../frontend/public/assets/system.css) · [app.css](../../../frontend/src/styles/app.css)

## Typography

| Vai trò | Cỡ | Trọng lượng | Chiều cao dòng |
|---|---|---|---|
| Nhãn phụ và thời điểm cập nhật | 14px | 500 | 1.5 |
| Nội dung, giá, số liệu thường | 16px | 400 | 1.55 |
| Tiêu đề nhóm tác vụ và số liệu nổi bật trong admin | 24px | 400 | 1.2 |
| Tiêu đề trang và tên sản phẩm hero | `--t-h1` co giãn theo viewport | 400 | 1.04 ở màn hình tác vụ, 1.104 ở hero theo recipe |

Nút tái sử dụng cỡ nội dung với trọng lượng 500. Dùng chữ số tabular cho countdown và bộ đếm thay đổi. Bốn vai trò này hướng dẫn phần UI còn lại. Các biến thể hero, danh mục, footer và moment đã duyệt tiếp tục dùng đúng token responsive của kit. [system.css](../../../frontend/public/assets/system.css) · [layout.css](../../../frontend/public/assets/layout/layout.css)

## Color

| Vai trò | Giá trị | Cách dùng |
|---|---|---|
| Dominant (60%) | `#f8f8f8` | Nền trang và mặt thẻ sản phẩm |
| Secondary (30%) | `#eeeeee` | Bề mặt phụ của nhóm nội dung và trạng thái trung tính. Footer đảo nền `#0a0a0a` theo deal |
| Accent (10%) | `#1f6b3a` | Nút chính nền xanh, vòng focus trên nền sáng và dải danh mục `brand-band` đã duyệt |
| Destructive | `#a32121` | Xác nhận reset, bán vượt lớn hơn 0, tồn âm và chữ lỗi theo mẫu hiện có |

Accent reserved for: nút chính xem sale, mua, đăng nhập hoặc tạo tài khoản, vòng focus trên nền sáng và dải danh mục đã duyệt. Tỷ lệ 60/30/10 hướng dẫn phân cấp trên màn hình tác vụ. Dải danh mục và footer giữ màu nền theo bố cục storefront đã duyệt. Trên nền xanh dùng chữ/vòng focus sáng của kit. Chữ nội dung `#0a0a0a`, chữ phụ `#6a6a6a` trên nền sáng và chữ chính `#f8f8f8` trên footer. Huy hiệu đồng bộ, trạng thái kho, lỗi và bán vượt có chữ hoặc số bên cạnh màu. Kiểm tra tương phản chữ thường tối thiểu 4.5:1 và vòng focus dễ thấy trên nền đang dùng. [app.css](../../../frontend/src/styles/app.css) · [system.css](../../../frontend/public/assets/system.css)

## Bố cục và tương tác theo trang

| Trang và nguồn | Điểm nhìn chính và luồng sử dụng |
|---|---|
| `/` · D-02–D-07 | Ảnh đại diện của sản phẩm đang sale là điểm nhìn đầu, cùng tên, giá gốc gạch ngang khi có giảm, giá sale, số còn lại và “Xem đợt sale”. Tiếp theo là sáu thẻ tên/ảnh/giá/thuộc tính. Lưới 3 cột từ 1024px, 2 cột ở 640–1023px, 1 cột dưới 640px. Ảnh catalog 4:3. Giữ `word-highlight` cho quy tắc một sản phẩm mỗi tài khoản và nút thật đến sale khi có dữ liệu. Khi thiếu sale vẫn có danh mục và liên kết đến danh mục. Đọc lại bằng thao tác thủ công. |
| `/login` · D-10–D-11 | Form tác vụ ngắn, chiều rộng tối đa 28rem, tiêu đề và nút theo chế độ “Đăng nhập” hoặc “Tạo tài khoản”. Chuyển form thủ công. Đăng ký dùng tên, email và mật khẩu. Phiên từ response chứa token và thông tin người dùng tối thiểu, được phục hồi khi tải lại. Đăng xuất xóa phiên và dữ liệu riêng. Sau xác thực chỉ quay lại đường dẫn nội bộ đã kiểm tra. Lỗi `INVALID_CREDENTIALS` hiển thị cạnh form. `UNAUTHORIZED` trên API bảo vệ đưa người dùng đăng nhập lại. |
| `/sales/:id` · D-08–D-13, D-15–D-16 | Từ 768px ảnh bên trái, tên và cụm giá/tồn/thời gian/nút mua bên phải. Dưới 768px nội dung xếp một cột, nút rộng hết cụm dưới 640px. Định dạng giá VND `vi-VN`. Countdown ngày/giờ/phút/giây tới `endAt`, hiệu chỉnh bằng `now` server và tính giây tại máy khách. Giữ số tồn `remaining` do API chọn theo mode, kể cả âm ở V0. Hiện rõ “Kho chưa sẵn sàng” khi `stockLoaded=false` dù có tồn suy ra. Thuộc tính là thông tin xem. |
| `/orders` · D-11, D-14 | “Đơn của tôi” là tiêu đề, danh sách đơn là vùng chính. Mỗi dòng dùng ảnh và tên từ DTO sản phẩm kèm đơn, giá đã trả, thời điểm `vi-VN`, trạng thái và “Xem đợt sale” theo `saleId`. Đơn mới trước, tối đa 100 theo API. Dùng danh sách ngữ nghĩa, ảnh cạnh tên và giá ở màn rộng, dòng tự xuống hàng ở mobile. Tài khoản mới chỉ thấy dữ liệu của phiên mới. |
| `/admin` · D-06, D-11, D-17–D-20 | “Theo dõi” chỉ hiện trong điều hướng của admin. Route yêu cầu phiên admin và API kiểm quyền. Mở bằng sale đang chạy hoặc chọn một `saleId` hợp lệ từ ô nhập hoặc query nội bộ, kể cả sale đã hết. Giữ lựa chọn trong phiên trang. Cụm số chính gồm số đơn/`totalQty`, tồn theo mode và số bán vượt. Chi tiết gồm `mongoRemaining`, `redisStock`, `redisBuyers`, `distinctUsers`, `mode`, `status`, `uniqueOrderIndex` và `saleId`. Trên mobile các nhóm số và điều khiển xuống hàng theo thứ tự đọc. Cụm thời điểm cập nhật và nút tạm dừng nằm cạnh số liệu. Đặt cụm reset sau phần đọc số liệu. |

Điều hướng chung gồm Flash Sale về `/`, “Sản phẩm”, “Đơn của tôi”, đăng nhập/đăng xuất và “Theo dõi” theo quyền. Khách đọc được trang chủ và sale. Khi khách bấm mua, chuyển đến `/login` cùng đích trở về là sale hiện tại. Khách mở `/orders` hoặc `/admin` vào luồng đăng nhập, còn tài khoản thường mở thẳng `/admin` thấy trạng thái thiếu quyền. [04-CONTEXT.md](04-CONTEXT.md)

**Mua hàng.** Khóa ngay nút khi gửi một POST `{ qty: 1 }` theo `sale.mode`. Nút mua bị khóa khi sale chưa mở hoặc đã kết thúc, tồn không dương, kho chưa nạp, dữ liệu tồn đã cũ, đang gửi hoặc phiên hiện tại đã biết có đơn. Thành công giữ nguyên trang, hiện xác nhận và liên kết đơn, rồi đọc lại tồn. Phân biệt các mã nghiệp vụ trong bảng copy. Với lỗi máy chủ hoặc mạng chưa rõ kết quả, giữ thông báo và đường dẫn đến đơn, chỉ cho phép quyết định thử mua lần nữa sau khi kiểm tra dữ liệu hiện tại. Đọc lại đơn khi trở về phù hợp, đổi tài khoản hoặc phát hiện reset của sale. Cờ đã mua thuộc dữ liệu hiện thời của phiên, kết quả đến muộn chỉ áp dụng cho yêu cầu của phiên còn hiệu lực. [04-05-PLAN.md](04-05-PLAN.md)

**Cập nhật.** Sau 04-08 và 04-09, sale và admin đọc định kỳ mỗi 2 giây qua một vòng đời đọc tuần tự. Dừng khi tab ẩn, đọc mới khi hiện lại. Rời trang, đổi sale hay đổi phiên thì dọn timer, hủy hoặc loại phản hồi cũ. “Làm mới tồn kho” hoặc “Làm mới số liệu” vẫn dùng được để đọc thủ công. Khi đọc cập nhật lỗi, giữ số đã nhận gần nhất và thời điểm đọc thành công, gắn thông báo dữ liệu đã cũ. Countdown tiếp tục theo giờ server hiệu chỉnh và về 0 đúng hạn. [04-08-PLAN.md](04-08-PLAN.md)

**Theo dõi và reset.** `redisStock=null` hiện “Chưa nạp”. V2 có “Khớp số đếm” hoặc “Lệch số đếm” theo `redisInSync`; V0/V1 hiện “Không áp dụng”. Huy hiệu nói về khớp số đếm tại lúc đọc. Tạm dừng loại cả phản hồi stats đang chờ và dừng đọc tự động, tiếp tục thì đọc ngay. Nhắc người trình diễn trước E2 đóng các tab sale và đóng hoặc tạm dừng các tab admin khác. Reset chọn V0/V1/V2, mặc định mode hiện tại, hiện xác nhận ở cùng cụm. “Giữ nguyên đợt sale” đóng xác nhận. “Xác nhận reset đợt sale” chỉ gửi một POST `{ mode }`, giữ `totalQty`, khóa nút và dừng polling trong lúc xử lý. Sau phản hồi đọc lại sale và stats, rồi phục hồi trạng thái chạy/tạm dừng trước đó. Khi lỗi, hiển thị trạng thái chưa xác nhận và hành động đọc lại. Người dùng thực hiện reset giữa các lượt mua hoặc bắn tải theo WR-03. [04-09-PLAN.md](04-09-PLAN.md) · [STATE.md](../../STATE.md)

## Copywriting Contract

| Thành phần | Copy và hành động |
|---|---|
| Primary CTA · trang chủ | “Xem đợt sale” |
| Primary CTA · sale | “Mua ngay”, trong lúc gửi “Đang mua…” |
| Primary CTA · xác thực | “Đăng nhập” / “Tạo tài khoản”, trong lúc gửi “Đang gửi…” |
| Empty state · trang chủ | “Chưa có đợt sale” · “Hiện chưa có đợt sale đang mở. Bạn vẫn có thể xem sản phẩm bên dưới.” · “Xem sản phẩm”. Danh mục rỗng hiện “Chưa có sản phẩm.” cùng nút “Làm mới dữ liệu”. |
| Empty state · đơn | “Bạn chưa có đơn hàng” · “Về trang chủ để xem đợt sale đang mở.” · “Về trang chủ” |
| Empty state · admin | “Chưa có đợt sale đang mở” · “Nhập mã đợt sale để xem số liệu của đợt đó.” · “Xem số liệu”, trường “Mã đợt sale” |
| Loading | “Đang đọc đợt sale…”, “Đang đọc đơn hàng…”, “Đang đọc số liệu…” theo trang. Vùng mua báo “Đang đọc tồn kho…” khi làm mới thủ công. |
| Error state · đọc dữ liệu | “Không đọc được danh mục sản phẩm.” / “Không đọc được đợt sale.” / “Không đọc được đơn hàng.” / “Không đọc được số liệu.” · “Thử đọc lại”. Lỗi khi đã có dữ liệu dùng “Dữ liệu đã cũ” và “Cập nhật lúc {giờ}”, cùng nút làm mới tương ứng. |
| Error state · chọn sale | “Không tìm thấy đợt sale.” · Về “Xem sản phẩm” từ sale, hoặc kiểm tra “Mã đợt sale” và bấm “Xem số liệu” ở admin. Khi mã admin sai định dạng, hướng dẫn “Nhập mã đợt sale gồm 24 ký tự hệ thập lục phân.” |
| Error state · xác thực và quyền | “Email hoặc mật khẩu không đúng” trên form để sửa và gửi lại. Khi lỗi kết nối hoặc máy chủ, “Chưa hoàn tất được yêu cầu. Kiểm tra kết nối rồi gửi lại biểu mẫu.” · Nút hiện có “Đăng nhập” hoặc “Tạo tài khoản”. Với phiên hết hạn, “Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.” Với tài khoản thường vào admin, “Không đủ quyền” · “Tài khoản này không có quyền xem trang theo dõi. Chọn Flash Sale để về trang chủ.” · Liên kết “Flash Sale” trên thanh điều hướng. |
| Mua · thành công | “Mua thành công. Mã đơn {mã đơn}.” · “Xem đơn của tôi” |
| Mua · `SOLD_OUT` | “Sản phẩm đã hết hàng. Chọn Sản phẩm để xem các mặt hàng khác.” · Liên kết “Sản phẩm” trên thanh điều hướng. |
| Mua · `ALREADY_BOUGHT` | “Bạn đã mua sản phẩm trong đợt sale này.” · “Xem đơn của tôi” |
| Mua · `SALE_NOT_ACTIVE` | “Đợt sale chưa mở hoặc đã kết thúc. Chọn Flash Sale để xem đợt sale đang mở trên trang chủ.” · Liên kết “Flash Sale” trên thanh điều hướng. |
| Mua · `STOCK_NOT_LOADED` | “Kho chưa sẵn sàng.” · “Làm mới tồn kho” |
| Mua · kết quả chưa rõ | “Chưa xác nhận được kết quả mua. Kiểm tra đơn của bạn trước khi mua lại.” · “Xem đơn của tôi” |
| Theo dõi · cập nhật | “Đang cập nhật” / “Đã tạm dừng” · “Cập nhật lúc {giờ}” · “Tạm dừng cập nhật” / “Tiếp tục cập nhật” · “Làm mới số liệu” |
| Destructive confirmation · reset | Nút mở “Reset đợt sale”. Xác nhận “Reset sẽ xóa đơn và lịch sử thay đổi tồn kho của đợt sale này, khôi phục tồn kho và mở lại đợt sale trong 7 ngày ở chế độ {mode}. Chỉ reset giữa các lượt mua hoặc bắn tải.” · “Giữ nguyên đợt sale” / “Xác nhận reset đợt sale” |
| Reset · kết quả | “Đã reset đợt sale.” sau phản hồi thành công. Khi lỗi, “Chưa xác nhận được kết quả reset. Hãy làm mới số liệu để kiểm tra.” · “Làm mới số liệu” |

Giữ cách gọi “đợt sale”, “tồn kho” và “đơn” nhất quán. Trạng thái đơn `success` hiển thị “Thành công”, `cancelled` hiển thị “Đã hủy”. Sau khi mua, mã đơn trong lời xác nhận giúp đối chiếu với danh sách đơn. Số và mã nội bộ phục vụ demo nằm ở `/admin`. Mua và reset đều yêu cầu thao tác rõ ràng của người dùng cho mỗi lần gửi. Lỗi mạng hoặc máy chủ chỉ dẫn đến đọc lại dữ liệu theo bảng trên. [04-RESEARCH.md](04-RESEARCH.md) · [04-CONTEXT.md](04-CONTEXT.md)

## Khả năng tiếp cận và kiểm chứng

- Link đầu tiên khi Tab là “Đến nội dung”, dẫn vào `main`. Dùng một `h1` mỗi route và heading đúng cấp. Menu mobile dùng nút có tên, `aria-controls`, `aria-expanded`, Tab dùng được khi mở và Escape trả focus về nút. Giữ vòng focus hiện rõ và ở ngoài vùng header che khuất.
- Form có label nhìn thấy. Lỗi trường nối với ô nhập qua `aria-describedby` và `aria-invalid`. Nút của form thao tác được bằng Enter. Xác nhận reset có tên, nội dung và hành động hủy rõ ràng. Khi đóng vùng xác nhận, focus trở về nút mở.
- Vùng đọc/gửi có `aria-busy` hoặc trạng thái tải tương đương. Thông báo kết quả mua và thay đổi quan trọng dùng vùng `role="status"` hoặc `role="alert"` đúng mức. Countdown dùng `role="timer"` với `aria-live="off"`. Số liệu polling và từng giây countdown đọc được khi người dùng chủ động điều hướng tới, không phát thông báo ở mọi nhịp. Ảnh có alt phù hợp, ảnh đơn kề tên trùng nội dung có thể để alt rỗng.
- Giữ hover, hero entrance và hỗ trợ `prefers-reduced-motion` từ kit, khởi tạo và thu dọn theo route. Khi giảm chuyển động, nội dung hiển thị đầy đủ, countdown và đọc số liệu vẫn hoạt động theo hợp đồng.
- Kiểm chứng D-25 trên app render thật ở 1440, 1024, 820, 768, 390 và kiểm tra tràn, va chạm, vùng chạm ở 320px. Xem ảnh chụp, checker/layout/perf, thao tác bàn phím và tập trung focus, font/ảnh local khi chặn mạng ngoài. Kiểm chứng 04-05/08/09 dùng API thật trong fixture và phản hồi lỗi/trễ có kiểm soát, kèm `typecheck` và `build` backend/frontend. Ghi kết quả và waiver theo công cụ thật. Lịch sử storefront `OPEN 3` và `OFF (no build active)` cùng các lỗi footer, phân loại nút close, kích thước và tải ảnh chậm vẫn nằm trong `frontend/DESIGN.md`. Giữ nguyên lịch sử gate. Waiver storefront đã ghi nhận cho lưới catalog đồng dạng, ảnh trùng đúng sản phẩm, matcher tiếng Anh, cột hero và chiều cao catalog. Waiver tác vụ đăng nhập và mua giữ form/vùng mua ngắn. Các khu vực đơn/admin áp dụng D-04 và ghi lý do từng finding nếu phát sinh. [frontend/DESIGN.md](../../../frontend/DESIGN.md) · [04-CONTEXT.md](04-CONTEXT.md)

## UI Considerations

Probe kiểm tra chín vùng giao diện và cả tám loại trạng thái. Trong 55 cặp vùng và trạng thái, 36 có tiêu chí cụ thể trong hợp đồng và 19 cần bằng chứng từ trình duyệt. Bảng gộp các cặp có cùng tiêu chí. Kết quả thực thi thuộc các plan dẫn chiếu.

| Category | Element(s) | Status | Resolution / Reason |
|---|---|---|---|
| empty | Hero và danh mục | ✅ covered | Không có sale vẫn hiển thị danh mục, danh mục rỗng và sale rỗng dùng các dòng copy riêng. |
| empty | Danh sách đơn | ✅ covered | Mảng đơn rỗng hiện trạng thái trống và liên kết về trang chủ. |
| empty | Form đăng nhập và chọn sale admin | ✅ covered | Form đăng nhập chờ dữ liệu nhập và có label. Admin thiếu sale đang mở có hướng dẫn chọn một saleId. |
| loading | Danh sách, form và hành động mua/reset | ✅ covered | Hiện trạng thái đọc đầu riêng. Nút gửi bị khóa trong lúc chờ và form hiện rõ đang gửi. |
| error | Đọc sale, đơn, stats và xác thực | ✅ covered | Lỗi tải đầu, lỗi xác thực và dữ liệu đọc đã cũ có copy và hành động riêng. |
| error | Mua và reset | 🧪 backstop | Mỗi kết quả nghiệp vụ mua có copy riêng. Lỗi chưa rõ của mua/reset cho kiểm tra đơn hoặc số liệu trước quyết định tiếp theo. Kiểm tra bằng phản hồi lỗi có kiểm soát. |
| populated | Sáu thẻ sản phẩm, ảnh hero và danh sách đơn | ✅ covered | Dữ liệu và ảnh hiển thị từ DTO đúng sản phẩm, đơn mới trước và có giá đã trả cùng trạng thái. |
| populated | Stats của một sale | ✅ covered | Số đơn, tồn và số vượt hiển thị cạnh nhau, nhóm chi tiết đọc theo nhãn. |
| partial | Ảnh thiếu/lỗi, tồn chưa nạp và số liệu cũ | ✅ covered | Giữ tên hàng và thông tin đã nhận khi thiếu ảnh, phân biệt tồn âm, kho chưa nạp, Redis `null` và đã cũ. |
| partial | Form chuyển chế độ và reset | ✅ covered | Chỉ hiển thị trường theo chế độ xác thực. Reset khởi tạo từ mode hiện tại, xác nhận gắn với sale đã chọn. |
| overflow | Điều hướng, danh sách đơn, nhóm stats | 🧪 backstop | Tên/giá và điều khiển dài xuống hàng trong viewport. Kiểm chứng ở 320px bằng ca danh sách nhiều đơn, saleId 24 ký tự và menu mobile. |
| zero-one-many | Danh sách sản phẩm và đơn | ✅ covered | Một phần tử dùng cùng bố cục với danh sách nhiều phần tử. Số 0 dùng copy trống, danh sách đơn theo giới hạn 100 của API. |
| long-text | Tên hàng, thuộc tính, nhãn form và thông báo | 🧪 backstop | Cụm nội dung giãn theo dòng, tên/thuộc tính/lỗi dài còn đọc được. Kiểm tra glyph Việt và dữ liệu dài ở 320/390px. |

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|---|---|---|
| Không áp dụng | Không có block từ registry | Tool `none`, kit và tài sản đọc từ repo. |

## Checker Sign-Off

- [x] Dimension 1 Copywriting: PASS
- [x] Dimension 2 Visuals: PASS
- [x] Dimension 3 Color: PASS
- [x] Dimension 4 Typography: PASS
- [x] Dimension 5 Spacing: PASS
- [x] Dimension 6 Registry Safety: PASS
- [x] Dimension 7 Inventory Provenance: PASS

Checker đã duyệt hợp đồng vào ngày 2026-11-18. Kết quả audit trình duyệt tiếp tục được ghi ở các plan triển khai.
