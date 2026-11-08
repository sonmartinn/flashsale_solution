// Test tích hợp cho đường mua POST /api/sales/:id/buy?mode=v0|v1|v2 (BUY-01..BUY-06, BUY-08, D-01..D-20).
// Cần "docker compose up -d --wait". Dùng database flashsale_test_buy_<pid> và Redis db 7 (không bao giờ db 0).
// Mỗi case tự tạo đợt sale riêng qua createSale nên không case nào phụ thuộc case khác và không cần reset.
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { Types } from "mongoose";
import type { Redis } from "ioredis";
import { buyersKey, stockKey } from "../../src/config/redis.js";
import { FlashSale, Order, Product, SALE_MODES, StockMovement, ensureIndexes, type SaleMode, type SaleStatus } from "../../src/models/index.js";
import { registerBuyScript } from "../../src/services/lua.js";
import {
  TEST_JWT_SECRET,
  connectTestStores,
  dropTestDatabaseAndDisconnect,
  getFreePort,
  startApp,
  startServerProcess,
  testConfig,
  testMongoUri,
  testRedisUrl,
  type StartedApp,
} from "../helpers.js";

const SALE_PRICE = 449_500;
const ORDER_KEYS = ["createdAt", "id", "mode", "price", "productId", "qty", "saleId", "status"];

function newUserId(): string {
  return String(new Types.ObjectId());
}

describe("buy.test", () => {
  let redis: Redis;
  let app: StartedApp;
  let productId: Types.ObjectId;

  /** Tạo đợt sale mới (mặc định đang mở) và nạp kho Redis tương ứng; trả id chữ thường. */
  async function createSale(opts: {
    qty: number;
    mode: SaleMode;
    status?: SaleStatus;
    startAt?: Date;
    endAt?: Date;
    _id?: Types.ObjectId;
  }): Promise<string> {
    const sale = await FlashSale.create({
      ...(opts._id !== undefined ? { _id: opts._id } : {}),
      productId,
      salePrice: SALE_PRICE,
      totalQty: opts.qty,
      remainingQty: opts.qty,
      perUserLimit: 1,
      status: opts.status ?? "active",
      startAt: opts.startAt ?? new Date(Date.now() - 60_000),
      endAt: opts.endAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000),
      mode: opts.mode,
    });
    const id = String(sale._id);
    await redis.set(stockKey(id), String(opts.qty));
    await redis.del(buyersKey(id));
    return id;
  }

  /** POST mua với x-test-user. body là chuỗi thì gửi nguyên văn (để thử JSON mà JSON.stringify không tạo được). */
  function buy(
    saleId: string,
    mode: string,
    userId: string = newUserId(),
    body: unknown = { qty: 1 },
    baseUrl: string = app.baseUrl,
  ): Promise<Response> {
    return fetch(`${baseUrl}/api/sales/${saleId}/buy?mode=${mode}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-test-user": userId },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });
  }

  async function remainingQty(saleId: string): Promise<number | undefined> {
    return (await FlashSale.findById(saleId, { remainingQty: 1 }).lean())?.remainingQty;
  }

  before(async () => {
    ({ redis } = await connectTestStores("buy", 7));
    // connectTestStores không tạo index: cần unique (saleId, userId) cho ALREADY_BOUGHT
    await ensureIndexes();
    // startApp không đăng ký script Lua (RESEARCH Pitfall 3)
    registerBuyScript(redis);
    const product = await Product.create({
      name: "Áo khoác test",
      slug: `ao-khoac-test-${process.pid}`,
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

  describe("tracer: mỗi mode mua thành công một lần", () => {
    it("v0, v1, v2 đều trả 201 { order } đúng D-20; V2 chỉ trừ kho Redis; không log, không stock_movements", async (t) => {
      const logs = t.mock.method(console, "log");
      const warns = t.mock.method(console, "warn");
      const errors = t.mock.method(console, "error");
      const emitWarning = t.mock.method(process, "emitWarning");
      const movementsBefore = await StockMovement.countDocuments();

      for (const mode of SALE_MODES) {
        const saleId = await createSale({ qty: 5, mode });
        const userId = newUserId();
        const res = await buy(saleId, mode, userId);
        assert.equal(res.status, 201, `mode ${mode}`);
        const body = (await res.json()) as { order: Record<string, unknown> };
        assert.deepEqual(Object.keys(body), ["order"]);
        const order = body.order;
        assert.deepEqual(Object.keys(order).sort(), ORDER_KEYS);
        assert.equal(order["qty"], 1);
        assert.equal(order["price"], SALE_PRICE);
        assert.equal(order["status"], "success");
        assert.equal(order["mode"], mode);
        assert.equal(order["saleId"], saleId);
        assert.equal(order["productId"], String(productId));
        assert.equal(typeof order["id"], "string");
        assert.equal(new Date(order["createdAt"] as string).toISOString(), order["createdAt"]);
        assert.equal(await Order.countDocuments({ saleId, userId }), 1);

        if (mode === "v2") {
          assert.equal(await remainingQty(saleId), 5, "V2 không được chạm flash_sales");
          assert.equal(await redis.get(stockKey(saleId)), "4");
          assert.equal(await redis.sismember(buyersKey(saleId), userId), 1);
        } else {
          assert.equal(await remainingQty(saleId), 4);
        }
      }

      assert.equal(logs.mock.callCount(), 0, "đường mua không được console.log");
      assert.equal(warns.mock.callCount(), 0, "đường mua không được console.warn");
      assert.equal(errors.mock.callCount(), 0, "đường mua không được console.error");
      assert.equal(emitWarning.mock.callCount(), 0, "đường mua không được phát process warning");
      assert.equal(await StockMovement.countDocuments(), movementsBefore, "mua thành công không ghi stock_movements");
    });

    it("server đã biên dịch (node dist/server.js, NODE_ENV=test) đăng ký buy.lua lúc khởi động và trả 201 cho cả ba mode", async () => {
      const server = await startServerProcess({
        env: {
          MONGODB_URI: testMongoUri("buy"),
          REDIS_URL: testRedisUrl(7),
          JWT_SECRET: TEST_JWT_SECRET,
          PORT: String(await getFreePort()),
          NODE_ENV: "test",
        },
      });
      try {
        const saleId = await createSale({ qty: 5, mode: "v1" });
        for (const mode of SALE_MODES) {
          const res = await buy(saleId, mode, newUserId(), { qty: 1 }, server.baseUrl);
          assert.equal(res.status, 201, `mode ${mode}: ${await res.clone().text()}\nstderr:\n${server.stderr()}`);
        }
      } finally {
        await server.stop();
      }
    });
  });
});
