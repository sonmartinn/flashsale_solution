// Test đơn vị cho các kiểm tra thuần của harness: health trước khi đo, dữ liệu ngay sau reset (D-06)
// và phân loại kết quả đối soát (D-10, RESEARCH Pitfall 6).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkHealth, checkPreRun } from "../lib/preflight.js";
import { classifyReconcile } from "../lib/reconcile.js";
import { InvalidError, type HealthInfo, type SaleMode, type StatsSnapshot } from "../lib/types.js";

const SALE_ID = "65a1b2c3d4e5f60718293a4b";

/** Stats ngay sau reset đúng của mode cho trước, tồn kho 100. */
function fresh(mode: SaleMode, overrides: Partial<StatsSnapshot> = {}): StatsSnapshot {
  return {
    saleId: SALE_ID,
    mode,
    status: "active",
    totalQty: 100,
    mongoRemaining: 100,
    redisStock: mode === "v2" ? 100 : null,
    redisBuyers: 0,
    orders: 0,
    distinctUsers: 0,
    oversold: 0,
    redisInSync: mode === "v2" ? true : null,
    uniqueOrderIndex: true,
    ...overrides,
  };
}

function health(overrides: Partial<HealthInfo> = {}): HealthInfo {
  return { httpStatus: 200, mongo: true, redis: true, testMode: true, maxPoolSize: 100, ...overrides };
}

describe("checks.test", () => {
  describe("checkPreRun", () => {
    for (const mode of ["v0", "v1", "v2"] as const) {
      it(`stats đúng của ${mode} -> không có lý do`, () => {
        assert.deepEqual(checkPreRun(fresh(mode), { mode, totalQty: 100 }), []);
      });
    }

    const cases: { name: string; stats: StatsSnapshot }[] = [
      { name: "mode", stats: fresh("v1", { mode: "v0" }) },
      { name: "totalQty", stats: fresh("v1", { totalQty: 50, mongoRemaining: 100 }) },
      { name: "mongoRemaining", stats: fresh("v1", { mongoRemaining: 99 }) },
      { name: "orders", stats: fresh("v1", { orders: 1 }) },
      { name: "redisBuyers", stats: fresh("v1", { redisBuyers: 3 }) },
    ];
    for (const c of cases) {
      it(`${c.name} sai -> đúng một lý do nhắc tới ${c.name}`, () => {
        const reasons = checkPreRun(c.stats, { mode: "v1", totalQty: 100 });
        assert.equal(reasons.length, 1);
        assert.match(reasons[0] as string, new RegExp(c.name));
      });
    }

    it("redisStock ≠ totalQty là lý do với v2", () => {
      const reasons = checkPreRun(fresh("v2", { redisStock: 90 }), { mode: "v2", totalQty: 100 });
      assert.equal(reasons.length, 1);
      assert.match(reasons[0] as string, /redisStock/);
    });

    it("redisStock ≠ totalQty KHÔNG là lý do với v0/v1", () => {
      assert.deepEqual(checkPreRun(fresh("v1", { redisStock: 7 }), { mode: "v1", totalQty: 100 }), []);
      assert.deepEqual(checkPreRun(fresh("v0", { redisStock: null }), { mode: "v0", totalQty: 100 }), []);
    });
  });

  describe("classifyReconcile", () => {
    it("mã 0 có dòng (v2): KHỚP -> clean", () => {
      const out = "Đợt sale 65a1b2c3d4e5f60718293a4b (v2): KHỚP — stock 0 = 100 - 100 đơn, buyers 100";
      assert.equal(classifyReconcile(0, out), "clean");
    });

    it("mã 0 nhưng bỏ qua vì không phải v2 -> invalid (Pitfall 6)", () => {
      assert.equal(classifyReconcile(0, "Đợt sale 65a1b2c3d4e5f60718293a4b: bỏ qua (mode v1)"), "invalid");
    });

    it("mã 2 -> drift", () => {
      assert.equal(classifyReconcile(2, "(v2): LỆCH — ..."), "drift");
      assert.equal(classifyReconcile(2, ""), "drift");
    });

    it("mã 1 hoặc null (quá giờ, không chạy được) -> invalid", () => {
      assert.equal(classifyReconcile(1, "[LỖI] Không kết nối được MongoDB"), "invalid");
      assert.equal(classifyReconcile(null, "(v2): KHỚP"), "invalid");
    });
  });

  describe("checkHealth", () => {
    it("backend khỏe ở chế độ test -> không ném lỗi", () => {
      assert.doesNotThrow(() => checkHealth(health()));
    });

    it("testMode false -> InvalidError", () => {
      assert.throws(() => checkHealth(health({ testMode: false })), InvalidError);
    });

    it("mongo false -> InvalidError", () => {
      assert.throws(() => checkHealth(health({ mongo: false })), InvalidError);
    });

    it("redis false -> InvalidError", () => {
      assert.throws(() => checkHealth(health({ redis: false })), InvalidError);
    });

    it("HTTP 503 -> InvalidError", () => {
      assert.throws(() => checkHealth(health({ httpStatus: 503 })), InvalidError);
    });
  });
});
