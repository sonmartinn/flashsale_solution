// Test tích hợp cho bù trừ kho của V1/V2 khi ghi đơn lỗi SAU khi đã trừ kho (BUY-05, BUY-07, BUY-08, D-08..D-12, D-14, D-35).
// Cần "docker compose up -d --wait". Dùng database flashsale_test_compensation_<pid> và Redis db 8 (không bao giờ db 0).
// Mỗi case tự tạo đợt sale riêng qua createSale nên không case nào phụ thuộc case khác.
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { Types } from "mongoose";
import type { Redis } from "ioredis";
import { buyersKey, stockKey } from "../../src/config/redis.js";
import { FlashSale, Order, Product, StockMovement, ensureIndexes, type SaleMode } from "../../src/models/index.js";
import { registerBuyScript } from "../../src/services/lua.js";
import { connectTestStores, dropTestDatabaseAndDisconnect, startApp, testConfig, type StartedApp } from "../helpers.js";

const SALE_PRICE = 449_500;

function newUserId(): string {
  return String(new Types.ObjectId());
}

describe("compensation.test", () => {
  let redis: Redis;
  let app: StartedApp;
  let productId: Types.ObjectId;

  /** Tạo đợt sale đang mở và nạp kho Redis tương ứng; trả id chữ thường. */
  async function createSale(opts: { qty: number; mode: SaleMode }): Promise<string> {
    const sale = await FlashSale.create({
      productId,
      salePrice: SALE_PRICE,
      totalQty: opts.qty,
      remainingQty: opts.qty,
      perUserLimit: 1,
      status: "active",
      startAt: new Date(Date.now() - 60_000),
      endAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      mode: opts.mode,
    });
    const id = String(sale._id);
    await redis.set(stockKey(id), String(opts.qty));
    await redis.del(buyersKey(id));
    return id;
  }

  /** Ghi sẵn một đơn cho user trên đợt sale (không đi qua đường mua, không trừ kho). */
  async function seedOrder(saleId: string, userId: string, mode: SaleMode): Promise<void> {
    await Order.create({ userId, saleId, productId, qty: 1, price: SALE_PRICE, status: "success", mode });
  }

  function buy(saleId: string, mode: SaleMode, userId: string): Promise<Response> {
    return fetch(`${app.baseUrl}/api/sales/${saleId}/buy?mode=${mode}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-test-user": userId },
      body: JSON.stringify({ qty: 1 }),
    });
  }

  async function remainingQty(saleId: string): Promise<number | undefined> {
    return (await FlashSale.findById(saleId, { remainingQty: 1 }).lean())?.remainingQty;
  }

  /** Các dòng stock_movements của một đợt sale, dạng gọn để so sánh. */
  async function movements(saleId: string): Promise<{ reason: string; delta: number; orderId: unknown }[]> {
    const rows = await StockMovement.find({ saleId }).sort({ at: 1 }).lean();
    return rows.map((r) => ({ reason: r.reason, delta: r.delta, orderId: r.orderId }));
  }

  async function expectError(res: Response, status: number, code: string): Promise<void> {
    const body = (await res.json()) as { code?: unknown };
    assert.equal(res.status, status, JSON.stringify(body));
    assert.equal(body.code, code);
  }

  before(async () => {
    ({ redis } = await connectTestStores("compensation", 8));
    // Cần unique (saleId, userId) để có E11000, và collection stock_movements đã tồn tại
    await ensureIndexes();
    // startApp không đăng ký script Lua
    registerBuyScript(redis);
    const product = await Product.create({
      name: "Áo khoác test bù trừ",
      slug: `ao-khoac-bu-tru-${process.pid}`,
      category: "ao-khoac",
      price: 899_000,
    });
    productId = product._id;
    app = await startApp({ redis, cfg: testConfig({ isTestMode: true }) });
  });

  after(async () => {
    await app?.close();
    await redis.flushdb();
    await dropTestDatabaseAndDisconnect(redis);
  });

  describe("tracer: E11000 sau bước trừ kho", () => {
    it("V1: người đã có đơn mua lại -> 409 ALREADY_BOUGHT, remainingQty về 5, một dòng compensate_v1", async () => {
      const saleId = await createSale({ qty: 5, mode: "v1" });
      const userId = newUserId();
      await seedOrder(saleId, userId, "v1");

      await expectError(await buy(saleId, "v1", userId), 409, "ALREADY_BOUGHT");

      assert.equal(await remainingQty(saleId), 5);
      assert.deepEqual(await movements(saleId), [{ reason: "compensate_v1", delta: 1, orderId: null }]);
      assert.equal(await Order.countDocuments({ saleId, userId }), 1);
    });

    it("V2: người đã có đơn (không có trong buyers) mua lại -> 409 ALREADY_BOUGHT, stock về 5, vẫn giữ trong buyers, một dòng compensate_v2", async () => {
      const saleId = await createSale({ qty: 5, mode: "v2" });
      const userId = newUserId();
      await seedOrder(saleId, userId, "v2");
      assert.equal(await redis.sismember(buyersKey(saleId), userId), 0);

      await expectError(await buy(saleId, "v2", userId), 409, "ALREADY_BOUGHT");

      assert.equal(await redis.get(stockKey(saleId)), "5");
      // Người này thật sự có đơn nên E11000 KHÔNG được SREM
      assert.equal(await redis.sismember(buyersKey(saleId), userId), 1);
      assert.deepEqual(await movements(saleId), [{ reason: "compensate_v2", delta: 1, orderId: null }]);
      assert.equal(await remainingQty(saleId), 5, "V2 không được chạm flash_sales");
    });
  });
});
