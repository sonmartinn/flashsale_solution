---
last_mapped_commit: 2c310436edd3b718349e11b11f80e93f3bb3b0b9
last_mapped_at: 2026-11-11
---
# Testing Patterns

**Analysis Date:** 2026-11-11

## Test Framework

**Runner:**
- Node built-in `node:test`; runtime khai báo `>=20.19.0`, test TypeScript nạp bằng tsx `^4.23.15` ở `backend/package.json`, `loadtest/package.json`.
- Không có Jest/Vitest; cấu hình nằm trong script package, không có runner config riêng.

**Assertion Library:**
- `node:assert/strict`, ví dụ `backend/test/validate.test.ts`, `loadtest/test/classify.test.ts`.

**Run Commands:**
```bash
npm --prefix backend run typecheck
npm --prefix backend test                 # Build rồi test cấp test/*.test.ts
npm --prefix backend run test:int         # Build rồi integration, concurrency=1
npm --prefix backend run build
npm --prefix loadtest run typecheck
npm --prefix loadtest test
```
- Script chính xác ở `backend/package.json`, `loadtest/package.json`; không có script watch/coverage được cấu hình.
- Mapping này chỉ đọc file; không chạy các lệnh trên và không xác nhận bộ test hiện đạt.

## Test File Organization

**Location:**
- Test tách khỏi nguồn: `backend/test/`, `backend/test/integration/`, `loadtest/test/`.
- Helper backend dùng chung ở `backend/test/helpers.ts`; factory theo miền nằm trong từng suite như `backend/test/integration/buy.test.ts`.

**Naming:**
- `<module>.test.ts`; bọc suite cấp cao nhất bằng tên file không có `.ts`, ví dụ `describe("validate.test", ...)` ở `backend/test/validate.test.ts`. Quy tắc này được ghi rõ trong `backend/test/helpers.ts`.

**Structure:**
```text
backend/test/
  helpers.ts
  validate.test.ts
  build.test.ts
  integration/
    buy.test.ts
    compensation.test.ts
    harness-support.test.ts
loadtest/test/
  classify.test.ts
  histogram.test.ts
  csv.test.ts
  verdict.test.ts
```

## Test Structure

**Suite Organization:** Mẫu rút trực tiếp từ `backend/test/validate.test.ts`:
```typescript
describe("validate.test", () => {
  describe("parseRegisterInput", () => {
    it("nhận name đúng 100 ký tự sau khi cắt", () => {
      const out = parseRegisterInput({ ...VALID, name: ` ${"b".repeat(100)} ` });
      assert.equal(out.name.length, 100);
    });
  });
});
```

**Patterns:**
- Dùng before/after async cho kết nối và cleanup; `backend/test/integration/buy.test.ts` gọi `connectTestStores`, tạo index, mở app và đóng app/drop database sau suite.
- Dùng bảng ca rồi lặp `it` để kiểm tra malformed input và biên: `backend/test/validate.test.ts`, `loadtest/test/classify.test.ts`.
- Kiểm tra status, code và trạng thái lưu trữ sau request; không chỉ kiểm tra phản hồi HTTP (`backend/test/integration/buy.test.ts`).

## Mocking

**Framework:** `node:test` TestContext mock; dependency injection và server TCP giả trong `backend/test/helpers.ts`.

**Patterns:** Mẫu từ `backend/test/integration/compensation.test.ts`:
```typescript
const errors = t.mock.method(console, "error", () => {});
// ... gọi nhánh hoàn kho thất bại ...
assert.equal(errors.mock.callCount(), 1);
```
- `PurchaseDeps.createOrder/findOrder` trong `backend/src/services/purchase.service.ts` cho phép tiêm lỗi ghi và tra đơn; `backend/test/integration/compensation.test.ts` dùng các seam này với kho thật.
- `startFakeRedis("reset" | "garbage" | "silent")` trong `backend/test/helpers.ts` tạo endpoint TCP để kiểm tra lỗi kết nối/protocol/timeout, không cần dừng container.

**What to Mock:**
- Quan sát console/process warning và tiêm lỗi có chủ đích; theo `backend/test/integration/buy.test.ts`, `backend/test/integration/compensation.test.ts`.

**What NOT to Mock:**
- Khi chứng minh unique index, Lua, trừ kho nguyên tử và bù trừ, dùng MongoDB/Redis thật như `backend/test/integration/models.test.ts`, `backend/test/integration/lua.test.ts`, `backend/test/integration/compensation.test.ts`.

## Fixtures and Factories

**Test Data:** Mẫu factory từ `loadtest/test/checks.test.ts`:
```typescript
function health(overrides: Partial<HealthInfo> = {}): HealthInfo {
  return { httpStatus: 200, mongo: true, redis: true, testMode: true, maxPoolSize: 100, ...overrides };
}
```
- `backend/test/integration/buy.test.ts` tạo sale riêng mỗi case, ObjectId mới và giá trị ngày mặc định đang active; không phụ thuộc case trước.
- `backend/test/helpers.ts` cấp MongoDB `flashsale_test_<name>_<pid>` tại cổng 27018 và Redis db 1..15; db 0 dành cho demo. Integration chạy tuần tự theo `backend/package.json` vì các suite dùng tài nguyên Redis cố định.
- Helper subprocess trong `backend/test/helpers.ts` xóa biến môi trường server kế thừa, dùng thư mục tạm để tránh tự nạp file môi trường thật; không sao chép dữ liệu môi trường người dùng làm fixture.
- `loadtest/test/csv.test.ts` dùng `mkdtemp`, ghi/đọc CSV thật, cleanup trong after; kiểm tra UTF-8 không BOM, LF, thứ tự header và chống công thức spreadsheet.

**Location:** Không phát hiện thư mục fixture/factory tập trung; xem `backend/test/helpers.ts`, các suite integration và `loadtest/test/checks.test.ts`.

## Coverage

**Requirements:** Không có ngưỡng phần trăm hoặc script coverage trong `backend/package.json`, `loadtest/package.json`. Typecheck/build là gate riêng theo `AGENTS.md`; test chạy bằng tsx không thay thế typecheck.

**View Coverage:** Không có lệnh được cấu hình trong hai package; không có báo cáo coverage được xác minh bởi lần mapping này.

**Giới hạn có bằng chứng:**
- `loadtest/test/` kiểm tra thành phần như classify/config/CSV/checks/histogram/verdict; không có suite riêng mang tên scenario E2 hoặc autocannon-phase. Không suy ra toàn bộ vòng đời autocannon đã được kiểm tra chỉ từ histogram unit test (`loadtest/lib/autocannon-phase.ts`, `loadtest/test/histogram.test.ts`).
- `backend/test/integration/harness-support.test.ts` kiểm tra API hỗ trợ harness; nó không thay thế lượt đo E1/E2/E3 đầy đủ ở `loadtest/scenarios/`.
- Không có frontend trong cây nguồn hiện tại; không phát hiện browser E2E/Playwright/Cypress hoặc kiểm tra UI. Yêu cầu UI nằm ở `docs/SPECS.md`.
- Không có scenario E4 trong `loadtest/scenarios/`; test bù trừ có tiêm lỗi ở `backend/test/integration/compensation.test.ts` không tương đương thí nghiệm ngắt MongoDB giữa chừng theo `docs/SPECS.md`.

## Test Types

**Unit Tests:**
- Backend: config, validation, ObjectId, auth, lỗi, Redis config, CLI args, boot/build ở `backend/test/`. Một số suite cấp này mở HTTP/process/TCP tạm qua `backend/test/helpers.ts`, nên không phải mọi file đều là hàm thuần.
- Harness: config, phân loại phản hồi, percentile nearest-rank, verdict, ID, port, metadata và CSV ở `loadtest/test/`.

**Integration Tests:**
- MongoDB/Redis thật, API HTTP và process JS đã build; auth, model/index, Lua, seed/reset/reconcile, đọc dữ liệu, admin, mua và hoàn kho ở `backend/test/integration/`.
- Helper mở app tại cổng ngẫu nhiên 127.0.0.1, tự đóng kết nối; cleanup bảo vệ tên database test, drop MongoDB test và quit Redis. Không xem helper này là thao tác flush Redis; dữ liệu Redis được từng suite quản lý (`backend/test/helpers.ts`, `backend/test/integration/buy.test.ts`).

**E2E Tests:**
- Không phát hiện browser E2E. Thí nghiệm API có harness riêng: `loadtest/scenarios/e1-correctness.ts`, `loadtest/scenarios/e2-performance.ts`, `loadtest/scenarios/e3-duplicate.ts`.

## Common Patterns

**Async Testing:**
```typescript
// backend/test/integration/compensation.test.ts
const v1Results = await Promise.all(Array.from({ length: 10 }, () => buyVia(svc, v1Sale, "v1", v1User)));
assert.equal(v1Results.filter((r) => r.kind === "ok").length, 1);
assert.equal(v1Results.filter((r) => r.kind === "already_bought").length, 9);
```

**Error Testing:**
```typescript
// backend/test/validate.test.ts
assert.throws(() => parseRegisterInput(body), isValidationError);
```
- Kiểm tra lỗi HTTP cùng code và kho trước/sau trong `backend/test/integration/buy.test.ts`; kiểm tra `cause`, số log và stock movement trong `backend/test/integration/compensation.test.ts`.

**Quy tắc cho thí nghiệm chính thức:**
- `AGENTS.md` quy định D-33: chỉ chạy lượt đo chính thức trên máy người dùng. Không chạy benchmark trong mapping.
- Dùng backend JS đã biên dịch qua `npm run start:test`; script chuẩn ở `backend/package.json` là `npm run build && dotenv run -q --override -f .env.test -- node dist/server.js`. Không đo trên dev/tsx watch.
- Reset trước từng lượt và khi đổi mode, giữ maxPoolSize tường minh và ghi cấu hình máy; nguồn `docs/SPECS.md`, triển khai `loadtest/lib/preflight.ts`, `loadtest/lib/admin.ts`.
- E1 dùng 1.000 user khác nhau, kho 100, 5 lượt/mode; E3 một user 10 request đồng thời V1/V2. E2 so 100/300/500 kết nối, ít nhất 5 lượt, tách còn hàng/hết hàng (`docs/SPECS.md`, `loadtest/README.md`).
- Đếm lỗi thật bằng 5xx + lỗi kết nối + timeout; 409 nghiệp vụ không là lỗi thật (`loadtest/lib/classify.ts`, `loadtest/test/classify.test.ts`).
- Tự tính p95 từ từng response time, không dùng non2xx hoặc histogram thiếu p95 của autocannon; lưu CSV tổng hợp kèm metadata, reset khôi phục cuối session (`loadtest/lib/histogram.ts`, `loadtest/lib/session.ts`, `loadtest/README.md`).

---

*Testing analysis: 2026-11-11*
