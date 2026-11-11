---
last_mapped_commit: 2c310436edd3b718349e11b11f80e93f3bb3b0b9
last_mapped_at: 2026-11-11
---
# Coding Conventions

**Analysis Date:** 2026-11-11

## Naming Patterns

**Files:**
- Dùng kebab-case cho module nhiều từ: `backend/src/services/sale-cache.ts`, `backend/src/utils/http-error.ts`, `loadtest/lib/env-info.ts`.
- Dùng hậu tố theo vai trò: `backend/src/controllers/sale.controller.ts`, `backend/src/services/purchase.service.ts`, `backend/src/routes/sale.routes.ts`; test dùng `.test.ts` như `backend/test/validate.test.ts`.

**Functions:**
- Dùng camelCase, tên động từ nêu hành vi: `createApp` trong `backend/src/app.ts`, `normalizeObjectId` trong `backend/src/utils/object-id.ts`.
- Factory dùng `create...`, nhận dependency rõ ràng; theo `createPurchaseService` ở `backend/src/services/purchase.service.ts` khi thêm service cần cô lập để test.

**Variables:**
- Dùng camelCase cho dữ liệu và dependency, UPPER_SNAKE_CASE cho bảng/hằng cố định: `FAILURES` trong `backend/src/controllers/sale.controller.ts`, `TEST_DB_PREFIX` trong `backend/test/helpers.ts`.

**Types:**
- Dùng PascalCase cho interface/type: `AppDeps` ở `backend/src/app.ts`, `BuyInput`, `PurchaseDeps`, `BuyResult` ở `backend/src/services/purchase.service.ts`.
- Kết quả nhiều nhánh dùng discriminated union với trường `kind`; giữ bộ giá trị nghiệp vụ ở `backend/src/services/purchase.service.ts` và ánh xạ HTTP tập trung ở `backend/src/controllers/sale.controller.ts`.

## Code Style

**Formatting:**
- Mẫu quan sát: thụt hai khoảng trắng, dấu nháy kép, dấu chấm phẩy, dấu phẩy cuối trong object nhiều dòng; xem `backend/src/app.ts`, `loadtest/lib/classify.ts`.
- Không phát hiện formatter hoặc cấu hình Prettier/Biome trong phạm vi file được git theo dõi. `backend/package.json` và `loadtest/package.json` không có script format.
- `.gitattributes` chỉ khai báo LF cho `loadtest/results/*.csv`; ràng buộc UTF-8 BOM/PowerShell 5.1 và bash 3.2 nằm trong `AGENTS.md`, không suy ra đã có script dev hiện thực các quy tắc đó.

**Linting:**
- Không phát hiện ESLint/oxlint hoặc script lint trong `backend/package.json`, `loadtest/package.json`.
- TypeScript strict và `verbatimModuleSyntax` được bật trong `backend/tsconfig.json`, `loadtest/tsconfig.json`. Chạy typecheck riêng vì tsx không kiểm tra kiểu; định nghĩa xong của dự án ở `AGENTS.md` yêu cầu typecheck và build đạt.

## Import Organization

**Order:**
1. Built-in `node:` khi có: `backend/test/helpers.ts`.
2. Thư viện ngoài như Express, Mongoose, ioredis: `backend/src/app.ts`.
3. Module tương đối theo tầng: `backend/src/controllers/sale.controller.ts`.

Đây là thứ tự quan sát, chưa có lint cưỡng chế. Dùng `import type` hoặc inline `type` cho kiểu; import tương đối phải có đuôi `.js` dù nguồn là TypeScript, theo `backend/tsconfig.json`, `backend/src/app.ts`.

**Path Aliases:**
- Không phát hiện alias trong `backend/tsconfig.json`, `loadtest/tsconfig.json`; dùng đường dẫn tương đối.
- Dùng default import với thư viện CommonJS như Express/jsonwebtoken/autocannon; mẫu ở `backend/src/app.ts`, `backend/src/services/auth.service.ts`, `loadtest/lib/autocannon-phase.ts`.

## Error Handling

**Patterns:**
- Handler Express async ném lỗi trực tiếp, để Express 5 chuyển tới middleware; không thêm try/catch chỉ để gọi next. Mẫu: `backend/src/controllers/sale.controller.ts`.
- `HttpError` thực tế nhận ba tham số `(status, message, code)` ở `backend/src/utils/http-error.ts`; giữ message tiếng Việt và mã máy đọc được ổn định.
- Middleware ở `backend/src/middlewares/error.ts` chuẩn hóa `{ message, code }`, xử lý CastError, ValidationError, E11000, JSON lỗi và lỗi 500; chi tiết nội bộ không đưa vào phản hồi 500.
- Try/catch trong service có mục đích nghiệp vụ được dùng để hoàn kho, xác nhận đơn hoặc ném lại lỗi gốc: `backend/src/services/purchase.service.ts`. Quy tắc handler không cấm xử lý bù trừ này.
- Kiểm tra dữ liệu chưa tin cậy dưới dạng `unknown`, rồi thu hẹp kiểu; không truyền body/query thẳng vào truy vấn. `backend/src/utils/validate.ts` kiểm tra trường auth là chuỗi, bỏ role client; `backend/src/controllers/sale.controller.ts` yêu cầu `qty` đúng số 1. Không áp quy tắc chuỗi máy móc cho trường số được đặc tả.

## Logging

**Framework:** console; không có logger riêng trong `backend/package.json`.

**Patterns:**
- Không gắn access logger trong `backend/src/app.ts`; đường mua thành công không log, không ghi stock movements theo `backend/src/services/purchase.service.ts`.
- Lỗi bất ngờ được `console.error` tại `backend/src/middlewares/error.ts`; nhánh hoàn kho thất bại có log riêng ở `backend/src/services/purchase.service.ts`.
- Khi sửa đường mua, giữ kiểm tra số lần gọi console và process warning trong `backend/test/integration/buy.test.ts`, `backend/test/integration/compensation.test.ts`.

## Comments

**When to Comment:**
- Viết tiếng Việt; giải thích thứ tự kiểm tra, lý do an toàn, tính công bằng phép đo và các nhánh bù trừ. Mẫu ở `backend/src/controllers/sale.controller.ts`, `backend/src/services/purchase.service.ts`.
- Chú thích có mã D-/BUY- để nối quyết định và acceptance criteria; không xem mã quyết định là thay thế cho logic hoặc test (`backend/test/integration/buy.test.ts`).

**JSDoc/TSDoc:**
- Dùng `/** ... */` cho factory, helper, DTO và hành vi không hiển nhiên; mẫu ở `backend/test/helpers.ts`, `backend/src/utils/dto.ts`.

## Function Design

**Size:** Không có giới hạn dòng được cưỡng chế. Tách helper theo thao tác; service mua giữ các hàm nội bộ cho insert/refund/compensate trong `backend/src/services/purchase.service.ts`.

**Parameters:** Dùng object tham số có kiểu cho dependency và tùy chọn; xem `AppDeps` trong `backend/src/app.ts`, `PurchaseDeps` trong `backend/src/services/purchase.service.ts`.

**Return Values:** Khai báo kiểu trả về cho API module; async trả Promise, service trả DTO hoặc union nghiệp vụ. Dùng mapper tường minh trong `backend/src/utils/dto.ts`, không trải nguyên document MongoDB vào JSON.

## Module Design

**Exports:** Ưu tiên named exports, factory và interface đặt cùng module: `backend/src/app.ts`, `backend/src/services/purchase.service.ts`.

**Barrel Files:** `backend/src/models/index.ts` gom model và enum; `backend/src/routes/index.ts` lắp router. Không có quy tắc buộc tạo barrel cho mọi thư mục.

---

*Convention analysis: 2026-11-11*
