product / site-kind other — cửa hàng thời trang trực tuyến, bước đầu 04-01.
Deal: hero product; palette mint-pink-accounts; Figtree; nav-split; footer-dark; close-type; brand-band; solid; ring; moment word-highlight.

Nền #f8f8f8 giữ ảnh và giá dễ đọc; xanh #1f6b3a dành cho hành động xem sale. Giữ nguyên token do dealer xuất.

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
