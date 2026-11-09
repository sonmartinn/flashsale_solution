// Test tích hợp cho hai bề mặt backend mà bộ đo Phase 3 cần (D-01, D-07):
// reset đặt lại cỡ kho (totalQty) qua HTTP và qua CLI, và trường stats uniqueOrderIndex.
// Cần "docker compose up -d --wait". Dùng database flashsale_test_harness_<pid> và Redis db 12 (không bao giờ db 0).
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { Types } from "mongoose";
import type { Redis } from "ioredis";
import { buyersKey, stockKey } from "../../src/config/redis.js";
import { FlashSale, Order, Product, StockMovement, ensureIndexes, type SaleMode } from "../../src/models/index.js";
import { createAuthService } from "../../src/services/auth.service.js";
import { createSaleAdminService } from "../../src/services/sale-admin.service.js";
import { HttpError } from "../../src/utils/http-error.js";
import {
  TEST_JWT_SECRET,
  connectTestStores,
  dropTestDatabaseAndDisconnect,
  startApp,
  testConfig,
  type StartedApp,
} from "../helpers.js";

const SALE_PRICE = 449_500;
/** Mười hai trường của stats (mười một trường D-25 cộng uniqueOrderIndex), đã sắp xếp; giống admin.test. */
const STATS_KEYS = [
  "distinctUsers",
  "mode",
  "mongoRemaining",
  "orders",
  "oversold",
  "redisBuyers",
  "redisInSync",
  "redisStock",
  "saleId",
  "status",
  "totalQty",
  "uniqueOrderIndex",
];
/**
 * totalQty sai, viết đúng như chữ trong body JSON (gửi thô để 9007199254740993 không bị JS làm tròn trước khi gửi).
 * Server parse 9007199254740993 thành 9007199254740992, lớn hơn Number.MAX_SAFE_INTEGER nên vẫn phải bị từ chối.
 */
const BAD_TOTAL_QTY = ['"100"', "0", "-1", "1.5", "1000001", "true", "null", '{"$gt":0}', "[100]", "9007199254740993"];

function newUserId(): string {
  return String(new Types.ObjectId());
}

function isHttpError(status: number, code: string) {
  return (err: unknown): boolean => {
    assert.ok(err instanceof HttpError, `phải là HttpError, nhận ${String(err)}`);
    assert.equal(err.status, status);
    assert.equal(err.code, code);
    return true;
  };
}

describe("harness-support.test", () => {
  let redis: Redis;
  let app: StartedApp;
  let productId: Types.ObjectId;
  let adminToken: string;

  /** Tạo đợt sale mới đang mở và nạp kho Redis tương ứng; trả id chữ thường. */
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

  /** POST reset bằng token admin với body JSON cho trước. */
  function reset(saleId: string, body: unknown): Promise<Response> {
    return resetRaw(saleId, JSON.stringify(body));
  }

  /** POST reset bằng token admin với chuỗi body JSON thô (không qua JSON.stringify). */
  function resetRaw(saleId: string, rawBody: string): Promise<Response> {
    return fetch(`${app.baseUrl}/api/admin/sales/${saleId}/reset`, {
      method: "POST",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": "application/json" },
      body: rawBody,
    });
  }

  /** Kiểm tra status + code của một phản hồi lỗi. */
  async function expectError(res: Response, status: number, code: string): Promise<void> {
    const body = (await res.json()) as { code?: unknown };
    assert.equal(res.status, status, JSON.stringify(body));
    assert.equal(body.code, code);
  }

  /** GET stats bằng token admin, kiểm tra 200 và trả object stats. */
  async function stats(saleId: string): Promise<Record<string, unknown>> {
    const res = await fetch(`${app.baseUrl}/api/admin/sales/${saleId}/stats`, {
      headers: { authorization: `Bearer ${adminToken}` },
    });
    assert.equal(res.status, 200, await res.clone().text());
    const body = (await res.json()) as { stats: Record<string, unknown> };
    assert.deepEqual(Object.keys(body), ["stats"]);
    return body.stats;
  }

  /** Reset bằng token admin, kiểm tra 200 và trả object sale. */
  async function resetOk(saleId: string, body: unknown): Promise<Record<string, unknown>> {
    const res = await reset(saleId, body);
    assert.equal(res.status, 200, await res.clone().text());
    return ((await res.json()) as { sale: Record<string, unknown> }).sale;
  }

  /** totalQty, remainingQty, mode trong MongoDB và giá trị stock:<id> trong Redis. */
  async function snapshot(saleId: string): Promise<{
    totalQty: number | undefined;
    remainingQty: number | undefined;
    mode: SaleMode | undefined;
    stock: string | null;
  }> {
    const doc = await FlashSale.findById(saleId, { totalQty: 1, remainingQty: 1, mode: 1 }).lean();
    return {
      totalQty: doc?.totalQty,
      remainingQty: doc?.remainingQty,
      mode: doc?.mode,
      stock: await redis.get(stockKey(saleId)),
    };
  }

  before(async () => {
    ({ redis } = await connectTestStores("harness", 12));
    // connectTestStores không tạo index: cần unique (saleId, userId) cho stats uniqueOrderIndex
    await ensureIndexes();
    const product = await Product.create({
      name: "Áo khoác test harness",
      slug: `ao-khoac-test-harness-${process.pid}`,
      category: "ao-khoac",
      price: 899_000,
    });
    productId = product._id;
    app = await startApp({ redis, cfg: testConfig({ isTestMode: true }) });
    // requireAuth không tra MongoDB, nên một id bất kỳ ký với role admin là đủ
    adminToken = createAuthService({ jwtSecret: TEST_JWT_SECRET }).signToken(newUserId(), "admin");
  });

  after(async () => {
    await app?.close();
    await redis.flushdb();
    await dropTestDatabaseAndDisconnect(redis);
  });

  describe("tracer: reset đặt lại cỡ kho qua HTTP (D-01)", () => {
    let saleId: string;

    before(async () => {
      saleId = await createSale({ qty: 100, mode: "v1" });
    });

    it("reset { mode: \"v2\", totalQty: 5000 } đổi cỡ kho ở MongoDB, Redis, nhật ký kho và stats", async () => {
      const sale = await resetOk(saleId, { mode: "v2", totalQty: 5000 });
      assert.equal(sale["totalQty"], 5000);
      assert.equal(sale["mode"], "v2");

      assert.deepEqual(await snapshot(saleId), { totalQty: 5000, remainingQty: 5000, mode: "v2", stock: "5000" });

      const movements = await StockMovement.find({ saleId, reason: "reset" }).lean();
      assert.equal(movements.length, 1);
      assert.equal(movements[0]?.delta, 5000);

      const s = await stats(saleId);
      assert.equal(s["totalQty"], 5000);
      assert.equal(s["mongoRemaining"], 5000);
      assert.equal(s["redisStock"], 5000);
      assert.equal(s["orders"], 0);
      assert.equal(s["redisInSync"], true);
    });

    it("reset chỉ có { mode: \"v1\" } giữ nguyên totalQty 5000", async () => {
      const sale = await resetOk(saleId, { mode: "v1" });
      assert.equal(sale["totalQty"], 5000);
      assert.equal(sale["mode"], "v1");
      assert.deepEqual(await snapshot(saleId), { totalQty: 5000, remainingQty: 5000, mode: "v1", stock: "5000" });
    });

    it("reset chỉ có { totalQty: 100 } giữ mode v1 và đưa kho về 100", async () => {
      const sale = await resetOk(saleId, { totalQty: 100 });
      assert.equal(sale["totalQty"], 100);
      assert.equal(sale["mode"], "v1");
      assert.deepEqual(await snapshot(saleId), { totalQty: 100, remainingQty: 100, mode: "v1", stock: "100" });
    });
  });

  describe("totalQty sai bị từ chối, đợt sale giữ nguyên (D-01)", () => {
    let saleId: string;

    before(async () => {
      saleId = await createSale({ qty: 100, mode: "v1" });
    });

    for (const raw of BAD_TOTAL_QTY) {
      it(`HTTP totalQty = ${raw} -> 400 VALIDATION_ERROR, MongoDB và Redis không đổi`, async () => {
        const prev = await snapshot(saleId);
        assert.deepEqual(prev, { totalQty: 100, remainingQty: 100, mode: "v1", stock: "100" });
        await expectError(await resetRaw(saleId, `{"totalQty":${raw}}`), 400, "VALIDATION_ERROR");
        assert.deepEqual(await snapshot(saleId), prev);
      });
    }

    it("mode kiểm tra trước: { mode: \"v3\", totalQty: 0 } -> 400 INVALID_MODE", async () => {
      await expectError(await reset(saleId, { mode: "v3", totalQty: 0 }), 400, "INVALID_MODE");
      assert.deepEqual(await snapshot(saleId), { totalQty: 100, remainingQty: 100, mode: "v1", stock: "100" });
    });

    it("service (đường của CLI): resetSale(id, { totalQty: 0 }) ném HttpError 400 VALIDATION_ERROR", async () => {
      const service = createSaleAdminService({ redis });
      await assert.rejects(service.resetSale(saleId, { totalQty: 0 }), isHttpError(400, "VALIDATION_ERROR"));
      assert.deepEqual(await snapshot(saleId), { totalQty: 100, remainingQty: 100, mode: "v1", stock: "100" });
    });

    it("service: resetSale(id, { totalQty: 1.5 }) ném HttpError 400 VALIDATION_ERROR", async () => {
      const service = createSaleAdminService({ redis });
      await assert.rejects(service.resetSale(saleId, { totalQty: 1.5 }), isHttpError(400, "VALIDATION_ERROR"));
      assert.deepEqual(await snapshot(saleId), { totalQty: 100, remainingQty: 100, mode: "v1", stock: "100" });
    });

    it("service: resetSale(id, { totalQty: 1000000 }) thành công (cận trên được nhận)", async () => {
      const service = createSaleAdminService({ redis });
      const result = await service.resetSale(saleId, { totalQty: 1_000_000 });
      assert.equal(result.totalQty, 1_000_000);
      assert.deepEqual(await snapshot(saleId), {
        totalQty: 1_000_000,
        remainingQty: 1_000_000,
        mode: "v1",
        stock: "1000000",
      });
    });
  });

  // Các case dưới đây chạy THEO THỨ TỰ: case sau thấy trạng thái index mà case trước để lại.
  describe("stats.uniqueOrderIndex chỉ true khi có đúng index unique { saleId: 1, userId: 1 } (D-07)", () => {
    let saleId: string;

    before(async () => {
      saleId = await createSale({ qty: 10, mode: "v1" });
    });

    it("sau ensureIndexes: uniqueOrderIndex true và stats có đúng mười hai trường", async () => {
      const s = await stats(saleId);
      assert.deepEqual(Object.keys(s).sort(), STATS_KEYS);
      assert.equal(s["uniqueOrderIndex"], true);
    });

    it("xóa index saleId_1_userId_1 -> false", async () => {
      await Order.collection.dropIndex("saleId_1_userId_1");
      assert.equal((await stats(saleId))["uniqueOrderIndex"], false);
    });

    it("index { saleId: 1, userId: 1 } KHÔNG unique -> false", async () => {
      await Order.collection.createIndex({ saleId: 1, userId: 1 });
      try {
        assert.equal((await stats(saleId))["uniqueOrderIndex"], false);
      } finally {
        await Order.collection.dropIndex("saleId_1_userId_1");
      }
    });

    it("index unique nhưng khóa đảo thứ tự { userId: 1, saleId: 1 } -> false", async () => {
      await Order.collection.createIndex({ userId: 1, saleId: 1 }, { unique: true });
      try {
        assert.equal((await stats(saleId))["uniqueOrderIndex"], false);
      } finally {
        await Order.collection.dropIndex("userId_1_saleId_1");
      }
    });

    it("collection orders không tồn tại -> stats vẫn 200 với uniqueOrderIndex false", async () => {
      await Order.collection.drop();
      assert.equal((await stats(saleId))["uniqueOrderIndex"], false);
    });

    it("Order.createIndexes() tạo lại index unique -> true", async () => {
      await Order.createIndexes();
      assert.equal((await stats(saleId))["uniqueOrderIndex"], true);
    });
  });
});
