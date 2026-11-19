import assert from "node:assert/strict";
import { it } from "node:test";
import { readSaleId, remainingByMode, syncStatus, type SaleStats } from "../src/services/admin-state.ts";
import { getSaleStats, resetSale } from "../src/services/admin.ts";
import { ApiError } from "../src/services/api.ts";
import { createSessionStore, safeReturnPath } from "../src/services/auth.ts";

const id = "abcdef0123456789abcdef01";
const stats: SaleStats = {
  saleId: id, mode: "v2", status: "active", totalQty: 100, mongoRemaining: 100, redisStock: 97,
  redisBuyers: 3, orders: 3, distinctUsers: 3, oversold: 0, redisInSync: true, uniqueOrderIndex: true,
};

function adminSession() {
  const store = createSessionStore();
  store.accept({ token: "test-admin-token", user: { id, role: "admin", name: "Quản trị viên", email: "admin@example.test" } });
  return store;
}

it("chọn đúng mã sale, giữ query admin hợp lệ khi đăng nhập và từ chối query khác", () => {
  assert.equal(readSaleId(` ${id.toUpperCase()} `), id);
  assert.equal(readSaleId("/sales/" + id), undefined);
  assert.equal(readSaleId(null), undefined);
  assert.equal(safeReturnPath(`/admin?saleId=${id}`), `/admin?saleId=${id}`);
  assert.equal(safeReturnPath(`/admin?saleId=${id}&url=//host.example`), "/");
});

it("tồn V0 âm và V2 chưa nạp giữ đúng giá trị, đồng bộ chỉ áp dụng V2", () => {
  assert.equal(remainingByMode({ ...stats, mode: "v0", mongoRemaining: -2 }), -2);
  assert.equal(remainingByMode({ ...stats, mode: "v1", mongoRemaining: 81 }), 81);
  assert.equal(remainingByMode({ ...stats, redisStock: null }), null);
  assert.equal(remainingByMode(stats), 97);
  assert.equal(syncStatus(stats), "Khớp số đếm");
  assert.equal(syncStatus({ ...stats, redisStock: null, redisInSync: false }), "Lệch số đếm");
  assert.equal(syncStatus({ ...stats, mode: "v1", redisInSync: null }), "Không áp dụng");
});

it("đọc stats bằng Bearer hiện hành, giữ signal và từ chối DTO sai sale", async t => {
  const controller = new AbortController();
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (url: string, options: RequestInit) => {
    assert.equal(url, `/api/admin/sales/${id}/stats`);
    assert.equal(new Headers(options.headers).get("Authorization"), "Bearer test-admin-token");
    assert.equal(options.signal, controller.signal);
    return Response.json({ stats: ++calls === 1 ? stats : { ...stats, saleId: "other" } });
  });
  const store = adminSession();
  assert.deepEqual(await getSaleStats(store, id, controller.signal), stats);
  await assert.rejects(getSaleStats(store, id, controller.signal), (error: unknown) => error instanceof ApiError && error.code === "INVALID_RESPONSE");
});

it("reset chỉ gửi mode và giữ lỗi rõ ràng mà không gửi lại", async t => {
  const fetch = t.mock.method(globalThis, "fetch", async (url: string, options: RequestInit) => {
    assert.equal(url, `/api/admin/sales/${id}/reset`);
    assert.equal(options.method, "POST");
    assert.deepEqual(JSON.parse(String(options.body)), { mode: "v1" });
    assert.equal(new Headers(options.headers).get("Authorization"), "Bearer test-admin-token");
    return Response.json({ code: "INTERNAL_ERROR", message: "Đọc lại số liệu" }, { status: 500 });
  });
  await assert.rejects(resetSale(adminSession(), id, "v1"), (error: unknown) => error instanceof ApiError && error.status === 500);
  assert.equal(fetch.mock.callCount(), 1);
});
