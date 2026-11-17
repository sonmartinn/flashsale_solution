# Tài sản local — Flash Sale

Giữ palette mint-pink-accounts, Figtree và hero product đã duyệt ở 04-01. Sáu ảnh dưới đây là **ảnh đại diện cùng loại hàng (stand-in)** cho đồ án; không phải ảnh xác nhận đúng hàng tồn, chất liệu, màu hay dáng của nhà bán. Không có người mẫu nào được giới thiệu là nhân viên/khách của Flash Sale. Cần thay bằng ảnh sản phẩm thật trước sử dụng thương mại. Tên, giá và thuộc tính vẫn lấy nguyên từ API.

Ảnh đã được mở và nhìn ở toàn bộ khung tải về. Tải JPEG qua CDN Pexels với `auto=compress&cs=tinysrgb&w=1200&q=80`; riêng váy hoa dùng `w=1000&q=72`. Giữ tỷ lệ ảnh gốc, không ghép, xóa logo hoặc tạo ảnh bằng AI. Ảnh sneaker 04-01 giữ nguyên byte và nguồn.

| File trong `public/images/products/` | Tác giả, trang gốc | Hình được dùng và ảnh cần thay |
|---|---|---|
| `ao-thun-cotton-basic.jpg` | [Marina Podrez · Pexels 11671964](https://www.pexels.com/photo/white-t-shirt-hanging-on-a-rack-11671964/) | Áo thun trắng trơn trên móc, ánh sáng sáng; thay bằng ảnh đủ thân áo cotton thật. |
| `quan-jeans-slim-fit.jpg` | [Castorly Stock · Pexels 4109759](https://www.pexels.com/photo/blue-denim-jeans-with-pockets-4109759/) | Jeans xanh gấp chồng, rõ đường may; không chứng minh slim fit, thay bằng ảnh quần thật đủ ống. |
| `vay-hoa-midi.jpg` | [Marcelo Verfe · Pexels 19895978](https://www.pexels.com/photo/dress-with-roses-on-cloth-hanger-19895978/) | Váy họa tiết hoa hồng treo trên móc, đủ thân váy; chiều dài midi không thể xác định tuyệt đối khi không có người mặc. |
| `giay-sneaker-trang.jpg` | [cottonbro studio · Pexels 6322602](https://www.pexels.com/photo/a-white-sneakers-6322602/) | Giữ ảnh hero đã duyệt, sneaker trắng đang sử dụng; thay bằng ảnh đôi giày thật. |
| `tui-tote-canvas.jpg` | [Stephanie Ho · Pexels 1214212](https://www.pexels.com/photo/black-tote-bag-1214212/) | Tote vải đen trơn trên giá gỗ, không logo; thay bằng ảnh túi thật và màu tương ứng. |
| `ao-khoac-gio.jpg` | [Ali Babajahdi · Pexels 16341730](https://www.pexels.com/photo/jacket-on-hanger-16341730/) | Cận cổ, vỏ áo và khóa kéo áo khoác đen có lớp lót; không chứng minh nylon/chống nước, cần ảnh toàn thân áo gió thật. |

Tất cả ảnh theo [giấy phép Pexels](https://www.pexels.com/license/), đối chiếu ngày 2026-11-17: cho tải, dùng và sửa ảnh; không ngụ ý người hay nhãn hiệu trong ảnh bảo chứng sản phẩm. Không phân phối như bộ stock độc lập. Credit chung ở footer dẫn đến `/credits.html`; không chèn credit riêng dưới từng ảnh.

Đã loại: Pexels 11482937 (biển giá/chữ trên áo), 18834779 và 19392705 (logo rõ/người mẫu không cần thiết). Tìm Commons bằng công cụ photos của skill cho áo thun cho ra ảnh in chữ hoặc có người; không chọn các kết quả đó. Không dùng ảnh khoác không có nguồn.

## Font

- `public/assets/fonts/Figtree-Variable.ttf`: Erik Kennedy, [Google Fonts — Figtree](https://github.com/google/fonts/tree/main/ofl/figtree), [SIL OFL 1.1 local](public/assets/fonts/OFL.txt). Giữ font chính đã duyệt, variable 300–900.
- Figtree hiện tại không có đủ tiếng Việt (kiểm tra cmap thất bại ở U+01A0 “Ơ”; metadata chính thức chỉ có latin/latin-ext). Khẳng định glyph đầy đủ ở ghi chép 04-01 không đúng. Không đổi palette hoặc deal lại vì sở thích.
- `public/assets/fonts/BeVietnamPro-Regular.ttf`: Lâm Bảo, Tony Le, ViệtAnh Nguyễn, [Google Fonts — Be Vietnam Pro](https://github.com/google/fonts/tree/main/ofl/bevietnampro), [SIL OFL 1.1 local](public/assets/fonts/BeVietnamPro-OFL.txt). Fallback tiếng Việt local đứng ngay sau Figtree, regular 400; weight khác dùng cơ chế chọn font của browser, không khai báo regular là variable. Chỉ tải một file fallback để tổng hai font không vượt 320 KiB. Đây là ngoại lệ chức năng theo D-03/D-05 và 04-02, thay cho glyph hệ thống không kiểm soát được.
- `src/styles/app.css` định nghĩa `@font-face`, `font-display: swap`; `index.html` preload cùng URL local. Không gọi Google Fonts hoặc CDN khi chạy ứng dụng.
- `test/assets.test.ts` kiểm tra cmap của chuỗi font local cho chữ Việt hoa/thường, U+1EA0–U+1EF9 và dấu kết hợp. Kiểm tra này xác minh glyph tồn tại; đọc/giải mã font và ảnh thật vẫn cần bằng chứng trình duyệt.

## Kiểm chứng

Native test kiểm tra sáu hợp đồng đường dẫn, chữ ký/SOF/EOI JPEG, kích thước tối thiểu, giới hạn dung lượng, glyph và tham chiếu local. Nó không được gọi là bộ giải mã JPEG; việc giải mã điểm ảnh được kiểm tra bằng `HTMLImageElement.decode()` trên các URL do Vite phục vụ.

Task 1 (2026-11-17): 8/8 native tests PASS; frontend/backend typecheck và build PASS. Edge thật đọc sản phẩm từ `/api/products` qua Vite 5173, giải mã đủ sáu ảnh bằng `decode()` và xác nhận MIME JPEG. Tổng sáu ảnh 745.725 byte (~728 KiB), từng ảnh dưới 250 KiB (hero cho phép 400 KiB). Hai font local tổng 195.660 byte (~191 KiB).

Ở 1440, 1024, 820, 768, 390 và 320px: cả sáu ảnh decode thành công; Figtree và Be Vietnam Pro có `status=loaded`, external resources `[]`, không tràn ngang. HTTPS ngoài bị chặn bằng route browser; không ngắt API local. Đây là bằng chứng không phụ thuộc CDN, chưa phải chạy app với server local bị tắt. Ảnh screenshot và kết quả JSON trong `.taste-skill/shots/assets-<width>.png` và `.taste-skill/assets-<width>.json` (ignored); đã nhìn sáu screenshot.

`GATE: OFF (no build active)` là kết quả hiện tại khi gọi skill gate ở root; marker 04-01 nằm trong `build.done.json`, lịch sử giữ OPEN 3. Không rearm/reset vòng cũ để biến thành PASS. Ba finding 04-01 chưa đóng; screenshot hiện tại còn khoảng trống footer/statement và menu tablet/mobile trông trống, ghi cho 04-03. Kiểm tra consistency/perf/offline đầy đủ của Task 2 còn chờ tracer feedback, không dùng kết quả cũ của 04-01 thay kết quả mới.

Catalog có ảnh trên trang chủ thuộc 04-03; 04-02 giữ danh sách văn bản hiện tại. Để duyệt ảnh bây giờ, mở từng đường dẫn `/images/products/<slug>.jpg` ở máy chủ Vite hoặc xem các file local trong bảng nguồn.

## Duyệt tracer và Task 2

Người dùng đã duyệt bằng “oke tôi duyệt bộ ảnh/font”. Không hỏi lại việc chọn ảnh/font. Task 2 chạy trên cùng bộ tài sản đã duyệt.

`perf.mjs http://localhost:5174/ --profile .taste-skill/chrome-perf-04-02 --json .taste-skill/perf-04-02.json` qua Edge headless (`CHROME_PATH`): **0 FAIL, 5 WARN**. 1440/390px truyền khoảng551KiB, JS parsed394KiB, font191.7KiB/2file/2family, ảnh hero173KiB, broken requests0, CLS0, WebGL0. Cảnh báo: CPU host100% ở hai lượt rộng (không dùng timing để kết luận tốc độ), font vượt mức WARN160KiB nhưng dưới FAIL320KiB, ảnh hero1920px lớn hơn mức cần trên390px. Không đổi ảnh hero đã duyệt chỉ để xóa WARN; responsive catalog/ảnh tiếp tục trong04-03. Đây là kiểm tra tài nguyên giao diện, không phải số liệu E2.

`consistency.mjs` đầy đủ (Edge, 1440/1024/820/768/390, rhythm1440/820/768/390) đã chạy: **20 FAIL, 21 WARN**, report `.taste-skill/consistency-04-02/report.json`. PASS: assets, font-load, empty-visual, photo-upscale, reduced-motion, hover-move, keyboard focus, tên control, contrast, links, overflow và lượt đi320px. FAIL lặp theo chiều rộng thuộc bảy nhóm: no-visual/hole ở catalog văn bản, copy-headings tiếng Việt, container-edges của recipe hero và cta/empty-area/one-section đã ghi ở04-01. Bốn waiver cũ giải thích bốn nhóm đầu; ba nhóm còn lại giữ OPEN cho04-03, không gọi report PASS và không reset gate.

Browser Task2 chạy lại trên5174 với HTTPS ngoài bị chặn: cả6ảnh decode/MIME/dimensions đạt, cả2font loaded, external=[] và overflow=false ở1440/1024/820/768/390/320. Kết quả mới `.taste-skill/assets-task2-<width>.json`; `agent-browser errors` rỗng. 8 native tests, typecheck và build chạy lại đạt. Task2 không thêm ảnh mới, không đổi hàng/giá và không cài dependency. Phạm vi tài sản của04-02 hoàn tất; giao diện đầy đủ chưa được gọi PASS.
