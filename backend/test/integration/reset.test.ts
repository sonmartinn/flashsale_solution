// Test tích hợp cho service reset đợt sale (D-09) trên MongoDB + Redis thật.
// Cần "docker compose up -d --wait". Dùng database flashsale_test_reset_<pid> và Redis db 3 (không bao giờ db 0).
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { Types } from "mongoose";
import type { Redis } from "ioredis";
import { buyersKey, stockKey } from "../../src/config/redis.js";
import { FlashSale, Order, StockMovement, type SaleMode } from "../../src/models/index.js";
import { createSaleAdminService, type SaleAdminService } from "../../src/services/sale-admin.service.js";
import { seedDatabase } from "../../src/services/seed.service.js";
import { HttpError } from "../../src/utils/http-error.js";
import { connectTestStores, dropTestDatabaseAndDisconnect } from "../helpers.js";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function isHttpError(status: number, code: string) {
  return (err: unknown): boolean => {
    assert.ok(err instanceof HttpError, `phải là HttpError, nhận ${String(err)}`);
    assert.equal(err.status, status);
    assert.equal(err.code, code);
    return true;
  };
}

/** Redis giả: multi().set().del().exec() trả về kết quả cho trước, để thử nhánh lỗi của exec(). */
function fakeRedis(execResult: [Error | null, unknown][] | null): Redis {
  const chain = {
    set: () => chain,
    del: () => chain,
    exec: async () => execResult,
  };
  return { multi: () => chain } as unknown as Redis;
}

describe("reset.test", () => {
  let redis: Redis;
  let service: SaleAdminService;
  const resetCalls: string[] = [];
  let saleId: string;
  let otherSaleId: string;
  let productId: Types.ObjectId;

  /** Làm "bẩn" một đợt sale như sau một lần đo: đã bán bớt, đã đóng, có đơn, có biến động kho, Redis cạn. */
  async function dirtySale(id: string, mode: SaleMode): Promise<void> {
    await FlashSale.updateOne({ _id: id }, { $set: { remainingQty: 2, status: "ended" } });
    const u1 = new Types.ObjectId();
    const u2 = new Types.ObjectId();
    for (const userId of [u1, u2]) {
      await Order.create({ userId, saleId: id, productId, qty: 1, price: 449_500, mode });
    }
    await StockMovement.create({ saleId: id, orderId: null, delta: -1, reason: "test-ban", at: new Date() });
    await redis.set(stockKey(id), "0");
    await redis.sadd(buyersKey(id), String(u1), String(u2));
  }

  before(async () => {
    ({ redis } = await connectTestStores("reset", 3));
    const summary = await seedDatabase({ redis, qty: 5, mode: "v1" });
    saleId = summary.saleId;
    const sale = await FlashSale.findById(saleId).lean();
    if (sale === null) throw new Error("seed không tạo đợt sale");
    productId = sale.productId;
    const other = await FlashSale.create({
      productId,
      salePrice: 449_500,
      totalQty: 3,
      remainingQty: 3,
      perUserLimit: 1,
      status: "active",
      startAt: new Date(),
      endAt: new Date(Date.now() + SEVEN_DAYS_MS),
      mode: "v0",
    });
    otherSaleId = String(other._id);
    service = createSaleAdminService({ redis, onSaleReset: (id) => resetCalls.push(id) });
  });

  after(async () => {
    await redis.flushdb();
    await dropTestDatabaseAndDisconnect(redis);
  });

  it("resetSale khôi phục đợt sale bẩn, đổi mode, chỉ xóa đơn của đợt đó", async () => {
    await dirtySale(saleId, "v1");
    await Order.create({ userId: new Types.ObjectId(), saleId: otherSaleId, productId, qty: 1, price: 449_500, mode: "v0" });
    resetCalls.length = 0;

    const before = Date.now();
    const result = await service.resetSale(saleId, { mode: "v2" });

    const sale = await FlashSale.findById(saleId).lean();
    assert.ok(sale !== null);
    assert.equal(sale.remainingQty, 5);
    assert.equal(sale.totalQty, 5);
    assert.equal(sale.status, "active");
    assert.equal(sale.mode, "v2");
    assert.ok(Math.abs(sale.startAt.getTime() - before) < 5000, "startAt phải là thời điểm reset");
    assert.equal(sale.endAt.getTime() - sale.startAt.getTime(), SEVEN_DAYS_MS);

    assert.equal(await Order.countDocuments({ saleId }), 0);
    assert.equal(await Order.countDocuments({ saleId: otherSaleId }), 1, "đơn của đợt sale khác phải còn nguyên");

    const movements = await StockMovement.find({ saleId }).lean();
    assert.equal(movements.length, 1);
    assert.equal(movements[0]!.reason, "reset");
    assert.equal(movements[0]!.delta, 5);
    assert.equal(movements[0]!.orderId, null);

    assert.equal(await redis.get(stockKey(saleId)), "5");
    assert.equal(await redis.exists(buyersKey(saleId)), 0);

    assert.deepEqual(resetCalls, [saleId]);
    assert.deepEqual(result, { saleId, mode: "v2", totalQty: 5, startAt: sale.startAt, endAt: sale.endAt });
  });

  it("resetSale không truyền mode thì giữ mode hiện tại (v2)", async () => {
    const result = await service.resetSale(saleId);
    assert.equal(result.mode, "v2");
    const sale = await FlashSale.findById(saleId).lean();
    assert.equal(sale?.mode, "v2");
  });

  it("reset hai lần liên tiếp cho cùng trạng thái, vẫn đúng 1 biến động reset", async () => {
    await service.resetSale(saleId);
    const first = await FlashSale.findById(saleId).lean();
    await service.resetSale(saleId);
    const second = await FlashSale.findById(saleId).lean();
    assert.ok(first !== null && second !== null);
    for (const key of ["remainingQty", "totalQty", "status", "mode", "perUserLimit", "salePrice"] as const) {
      assert.deepEqual(second[key], first[key], `trường ${key} phải giống nhau`);
    }
    assert.equal(second.endAt.getTime() - second.startAt.getTime(), SEVEN_DAYS_MS);
    assert.equal(await StockMovement.countDocuments({ saleId }), 1);
    assert.equal(await StockMovement.countDocuments({ saleId, reason: "reset" }), 1);
    assert.equal(await redis.get(stockKey(saleId)), "5");
  });

  it("nhận saleId viết hoa và gọi hook với id chữ thường", async () => {
    resetCalls.length = 0;
    const result = await service.resetSale(saleId.toUpperCase());
    assert.equal(result.saleId, saleId);
    assert.deepEqual(resetCalls, [saleId]);
  });

  it("saleId không hợp lệ: 400 INVALID_ID", async () => {
    await assert.rejects(service.resetSale("abc"), isHttpError(400, "INVALID_ID"));
  });

  it("saleId hợp lệ nhưng không tồn tại: 404 NOT_FOUND", async () => {
    await assert.rejects(service.resetSale(String(new Types.ObjectId())), isHttpError(404, "NOT_FOUND"));
  });

  it("mode ngoài v0/v1/v2: 400 VALIDATION_ERROR", async () => {
    await assert.rejects(service.resetSale(saleId, { mode: "v9" as SaleMode }), isHttpError(400, "VALIDATION_ERROR"));
  });

  it("một lệnh trong multi() báo lỗi: resetSale reject, không ghi biến động reset, không gọi hook", async () => {
    await StockMovement.deleteMany({ saleId });
    const calls: string[] = [];
    const broken = createSaleAdminService({
      redis: fakeRedis([
        [null, "OK"],
        [new Error("boom"), null],
      ]),
      onSaleReset: (id) => calls.push(id),
    });
    await assert.rejects(broken.resetSale(saleId), /boom/);
    assert.equal(await StockMovement.countDocuments({ saleId, reason: "reset" }), 0);
    assert.deepEqual(calls, []);
  });

  it("exec() trả về null (multi bị hủy): resetSale reject", async () => {
    const aborted = createSaleAdminService({ redis: fakeRedis(null) });
    await assert.rejects(aborted.resetSale(saleId), /multi\(\) bị hủy/);
  });

  it("resetAllSales reset mọi đợt sale và giữ mode của từng đợt", async () => {
    await dirtySale(saleId, "v2");
    await dirtySale(otherSaleId, "v0");
    resetCalls.length = 0;

    const results = await service.resetAllSales({});

    assert.equal(results.length, 2);
    assert.deepEqual(results.map((r) => r.saleId).sort(), [saleId, otherSaleId].sort());
    const byId = new Map(results.map((r) => [r.saleId, r]));
    assert.equal(byId.get(saleId)?.mode, "v2");
    assert.equal(byId.get(otherSaleId)?.mode, "v0");
    for (const [id, qty] of [
      [saleId, 5],
      [otherSaleId, 3],
    ] as const) {
      const sale = await FlashSale.findById(id).lean();
      assert.equal(sale?.remainingQty, qty);
      assert.equal(sale?.status, "active");
      assert.equal(await Order.countDocuments({ saleId: id }), 0);
      assert.equal(await StockMovement.countDocuments({ saleId: id }), 1);
      assert.equal(await redis.get(stockKey(id)), String(qty));
      assert.equal(await redis.exists(buyersKey(id)), 0);
    }
    assert.equal(resetCalls.length, 2);
  });

  it("resetAllSales với mode đặt mode đó cho mọi đợt", async () => {
    const results = await service.resetAllSales({ mode: "v1" });
    assert.equal(results.length, 2);
    assert.ok(results.every((r) => r.mode === "v1"));
    assert.equal(await FlashSale.countDocuments({ mode: "v1" }), 2);
  });

  it("không có đợt sale nào: resetAllSales trả về mảng rỗng", async () => {
    await FlashSale.deleteMany({});
    assert.deepEqual(await service.resetAllSales(), []);
  });
});
