---
last_mapped_commit: 2c310436edd3b718349e11b11f80e93f3bb3b0b9
last_mapped_at: 2026-11-11
---
# Codebase Structure

**Analysis Date:** 2026-11-11

## Directory Layout

```text
flashsale/
├── AGENTS.md                 # Hướng dẫn Codex và ràng buộc dự án
├── .claude/CLAUDE.md         # Hướng dẫn đầy đủ, thuộc người dùng
├── .planning/               # Trạng thái, roadmap, phase và bản đồ mã nguồn
├── backend/                 # Package API và CLI dữ liệu độc lập
│   ├── package.json
│   ├── tsconfig.json
│   ├── tsconfig.build.json
│   ├── src/
│   │   ├── server.ts         # Bootstrap có I/O
│   │   ├── app.ts            # Factory dựng Express
│   │   ├── config/           # Cấu hình và kết nối
│   │   ├── routes/           # Định nghĩa endpoint, nối phụ thuộc
│   │   ├── controllers/      # HTTP validation và response
│   │   ├── middlewares/      # JWT, role, lỗi
│   │   ├── services/         # Nghiệp vụ và cache
│   │   ├── models/           # Schema và index Mongoose
│   │   ├── lua/              # Phép mua Redis nguyên tử
│   │   ├── types/            # Bổ sung kiểu Express/ioredis
│   │   └── utils/            # DTO, HttpError, validation, timeout
│   ├── scripts/              # Seed/reset/reconcile, phân tích CLI
│   └── test/
│       └── integration/      # Test cần dữ liệu/kết nối thật
├── loadtest/                 # Package thí nghiệm độc lập
│   ├── package.json
│   ├── tsconfig.json
│   ├── README.md
│   ├── scenarios/            # E1 đúng đắn, E2 hiệu năng, E3 mua trùng
│   ├── lib/                  # Harness và đo lường dùng chung
│   ├── test/                 # Test helper thuần, không chạy đo chính thức
│   └── results/              # CSV và bằng chứng JSON thô
├── docs/
│   └── SPECS.md              # Nguồn yêu cầu duy nhất
└── docker-compose.yml        # Hạ tầng MongoDB/Redis
```

- Không có package npm ở root; chạy lệnh trong `backend/` hoặc `loadtest/` theo manifest tương ứng.
- Không có thư mục frontend hay script dev Windows/macOS ở root trong cây mã được khảo sát. UI và script khởi động là phạm vi yêu cầu trong `docs/SPECS.md`, không phải file triển khai hiện hữu.

## Directory Purposes

**`backend/src/config/`:**
- Purpose: Tập trung việc đọc/kiểm tra môi trường và dựng kết nối.
- Contains: Config type, MongoDB connector, Redis client và key helpers.
- Key files: `backend/src/config/env.ts`, `backend/src/config/db.ts`, `backend/src/config/redis.ts`.
- Giữ việc truy cập biến môi trường ở lớp cấu hình; truyền kết quả vào app/service theo `backend/src/server.ts`.

**`backend/src/routes/`:**
- Purpose: Gắn endpoint, middleware và phụ thuộc.
- Contains: Một router gốc và router theo auth/product/sale/order/admin.
- Key files: `backend/src/routes/index.ts`, `backend/src/routes/sale.routes.ts`, `backend/src/routes/admin.routes.ts`.
- Dựng cache và service dùng chung tại router gốc; giữ đường HTTP trong router riêng.

**`backend/src/controllers/`:**
- Purpose: Biên HTTP và kiểm tra đầu vào.
- Contains: Factory controller và handler theo tài nguyên.
- Key files: `backend/src/controllers/sale.controller.ts`, `backend/src/controllers/admin.controller.ts`, `backend/src/controllers/auth.controller.ts`.

**`backend/src/services/`:**
- Purpose: Nghiệp vụ tái sử dụng giữa API, CLI và test.
- Contains: Purchase, order, stock, catalog, sale-cache, admin, auth, seed, reconcile, Lua wrapper.
- Key files: `backend/src/services/purchase.service.ts`, `backend/src/services/sale-admin.service.ts`, `backend/src/services/reconcile.service.ts`.
- Giữ service không phụ thuộc Request/Response; dùng interface input/output và factory như `backend/src/services/catalog.service.ts`.

**`backend/src/models/`:**
- Purpose: Collection, schema và index MongoDB.
- Contains: User, Product, FlashSale, Order, StockMovement và barrel.
- Key files: `backend/src/models/index.ts`, `backend/src/models/order.ts`, `backend/src/models/flash-sale.ts`.
- Đăng ký model mới trong `allModels` để `ensureIndexes()` chạy trước HTTP.

**`backend/src/lua/` và `backend/src/types/`:**
- Purpose: Tài nguyên Redis và phần mở rộng kiểu.
- Contains: `backend/src/lua/buy.lua`, `backend/src/types/ioredis.d.ts`, `backend/src/types/express.d.ts`.
- Giữ script ở thư mục Lua và tải qua URL tương đối tại `backend/src/services/lua.ts`; build đã chép cả thư mục.

**`backend/scripts/`:**
- Purpose: Entry point thao tác dữ liệu bằng CLI.
- Contains: Seed/reset/reconcile và parser tham số.
- Key files: `backend/scripts/seed.ts`, `backend/scripts/reset.ts`, `backend/scripts/reconcile.ts`, `backend/scripts/cli-args.ts`.
- CLI lo kết nối, tham số, in kết quả; service giữ thuật toán nghiệp vụ.

**`loadtest/scenarios/`:**
- Purpose: Điều phối từng thí nghiệm.
- Contains: `loadtest/scenarios/e1-correctness.ts`, `loadtest/scenarios/e2-performance.ts`, `loadtest/scenarios/e3-duplicate.ts`.
- Chưa có scenario E4 hay npm script E4 trong `loadtest/package.json`.

**`loadtest/lib/`:**
- Purpose: Hạ tầng đo chung và phán quyết.
- Contains: Session, admin client, HTTP burst, autocannon phase, config, preflight, TIME_WAIT guard, CSV/raw JSON, histogram, reconcile và verdict.
- Key files: `loadtest/lib/session.ts`, `loadtest/lib/http.ts`, `loadtest/lib/autocannon-phase.ts`, `loadtest/lib/verdict.ts`, `loadtest/lib/csv.ts`.
- Dùng lại Session cho vòng đời reset/khôi phục và output; tránh lặp preflight ở scenario.

## Key File Locations

**Entry Points:**
- `backend/src/server.ts`: API bootstrap.
- `backend/src/app.ts`: App factory dùng chung với test.
- `backend/scripts/seed.ts`: Tạo dữ liệu demo.
- `backend/scripts/reset.ts`: Đặt lại sale.
- `backend/scripts/reconcile.ts`: Đối soát hoặc sửa Redis.
- `loadtest/scenarios/e1-correctness.ts`: Burst và kiểm tra bán quá.
- `loadtest/scenarios/e2-performance.ts`: Warm-up, pha còn hàng/hết hàng, tổng hợp hiệu năng.
- `loadtest/scenarios/e3-duplicate.ts`: Kiểm tra một người gửi nhiều request.

**Configuration:**
- `backend/package.json`: Lệnh API/CLI/test/build; `start:test` dùng dotenv CLI override rồi chạy JS biên dịch.
- `backend/tsconfig.json`: Typecheck NodeNext/strict của backend.
- `backend/tsconfig.build.json`: Phạm vi emit backend.
- `loadtest/package.json`: Lệnh thí nghiệm và test helper.
- `loadtest/tsconfig.json`: Typecheck harness.
- `docker-compose.yml`: Định nghĩa dịch vụ dữ liệu; không dùng như nơi đặt nghiệp vụ.
- `.planning/config.json`: Thiết lập quy trình GSD.

**Core Logic:**
- `backend/src/services/purchase.service.ts`: Handler V0/V1/V2 và bù trừ.
- `backend/src/services/order.service.ts`: Đường ghi đơn chung.
- `backend/src/lua/buy.lua`: Kiểm tra buyer/kho và cập nhật Redis nguyên tử.
- `backend/src/services/sale-cache.ts`: Cache thông tin sale tĩnh mỗi app.
- `backend/src/services/stock.service.ts`: View tồn theo mode.
- `backend/src/services/catalog.service.ts`: API đọc.
- `backend/src/services/sale-admin.service.ts`: Reset/thống kê.
- `backend/src/services/reconcile.service.ts`: MongoDB → Redis đối soát/sửa.
- `backend/src/utils/dto.ts`: Ánh xạ document thành JSON.

**Testing:**
- `backend/test/*.test.ts`: Unit, HTTP và kiểm tra build/boot theo từng file.
- `backend/test/integration/*.test.ts`: MongoDB/Redis, Lua, mua, bù trừ, seed/reset/reconcile.
- `backend/test/helpers.ts`: Tiện ích test chung.
- `loadtest/test/*.test.ts`: Parser, classifier, histogram, verdict, CSV và preflight helpers.

## Naming Conventions

**Files:**
- Service theo `<domain>.service.ts`: `backend/src/services/purchase.service.ts`.
- HTTP theo `<domain>.controller.ts` và `<domain>.routes.ts`: `backend/src/controllers/sale.controller.ts`, `backend/src/routes/sale.routes.ts`.
- Model/utility dùng kebab-case khi có nhiều từ: `backend/src/models/flash-sale.ts`, `backend/src/utils/object-id.ts`.
- Test dùng `<topic>.test.ts`: `backend/test/integration/compensation.test.ts`.
- Scenario dùng mã thí nghiệm và tên nội dung: `loadtest/scenarios/e2-performance.ts`.
- Backend import tương đối ghi đuôi `.js` dù nguồn là `.ts`: `backend/src/routes/index.ts`.

**Directories:**
- Phân theo trách nhiệm ở backend: `backend/src/controllers/`, `backend/src/services/`, `backend/src/models/`.
- Tách kịch bản, thư viện và bằng chứng đo: `loadtest/scenarios/`, `loadtest/lib/`, `loadtest/results/`.

## Where to Add New Code

**New Feature:**
- Primary code: Thêm service tại `backend/src/services/`, controller tại `backend/src/controllers/`, router tại `backend/src/routes/`; nối tại `backend/src/routes/index.ts`.
- Tests: Helper thuần ở `backend/test/`; hành vi dữ liệu/HTTP thực ở `backend/test/integration/`.
- Không tự thêm package frontend dựa trên bản đồ; dùng yêu cầu `docs/SPECS.md` và phase UI tương ứng trong `.planning/`.

**New Component/Module:**
- Implementation: Model ở `backend/src/models/` rồi thêm barrel/`allModels` tại `backend/src/models/index.ts`.
- Redis logic nguyên tử ở `backend/src/lua/`; wrapper/đăng ký tại `backend/src/services/lua.ts`, kiểu client tại `backend/src/types/ioredis.d.ts`.
- Middleware HTTP ở `backend/src/middlewares/`; nối theo thứ tự tại `backend/src/app.ts` hoặc router tài nguyên.
- Scenario đo ở `loadtest/scenarios/`, npm entry tại `loadtest/package.json`; dùng lại `loadtest/lib/session.ts`.

**Utilities:**
- Shared helpers: `backend/src/utils/` cho ID, lỗi, DTO và validation; `loadtest/lib/` cho đo lường.
- Chỉ chia sẻ nghiệp vụ API/CLI qua `backend/src/services/`; tránh import CLI có side effect vào service.

## Special Directories

**`.planning/`:**
- Purpose: Roadmap, trạng thái, phase, kết quả xác minh và bản đồ code.
- Generated: Tài liệu do quy trình GSD và người dùng duy trì.
- Committed: Có; các bản đồ nằm ở `.planning/codebase/`.

**`backend/dist/`:**
- Purpose: JS biên dịch và bản sao Lua, xác định bởi `backend/package.json`.
- Generated: Có, build xóa rồi tạo lại.
- Committed: Không; không sửa bằng tay.

**`loadtest/results/`:**
- Purpose: CSV thí nghiệm và `raw/` chứa JSON bằng chứng, do `loadtest/lib/csv.ts` ghi.
- Generated: Có; `.gitkeep` giữ thư mục và dữ liệu chính thức được lưu theo quy trình dự án.
- Committed: Có đối với kết quả chính thức; không tự tạo lượt đo để lập bản đồ.

**`.codex/` và `.claude/worktrees/`:**
- Purpose: Bộ công cụ cục bộ và worktree của agent, theo `AGENTS.md`.
- Generated: Có, thuộc môi trường công cụ.
- Committed: Không; không đưa nội dung vào bản đồ ứng dụng, không sửa/xóa worktree của người dùng.

---

*Structure analysis: 2026-11-11*
