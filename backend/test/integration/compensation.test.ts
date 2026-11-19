// Test tích hợp cho bù trừ kho của V1/V2 khi ghi đơn lỗi SAU khi đã trừ kho (BUY-05, BUY-07, BUY-08, D-08..D-12, D-14, D-35).
// Cần "docker compose up -d --wait". Dùng database flashsale_test_compensation_<pid> và Redis db 8 (không bao giờ db 0).
// Mỗi case tự tạo đợt sale riêng qua createSale nên không case nào phụ thuộc case khác.
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Request as ExpressRequest, Response as ExpressResponse } from "express";
import mongoose, { Types } from "mongoose";
import type { Redis } from "ioredis";
import { buyersKey, stockKey } from "../../src/config/redis.js";
import { errorHandler } from "../../src/middlewares/error.js";
import { FlashSale, Order, Product, SALE_MODES, StockMovement, ensureIndexes, type SaleMode } from "../../src/models/index.js";
import { registerBuyScript } from "../../src/services/lua.js";
import { createOrder as realCreateOrder, isDuplicateKeyError, type CreateOrderFn } from "../../src/services/order.service.js";
import {
  createPurchaseService,
  type BuyResult,
  type FindOrderFn,
  type PurchaseService,
} from "../../src/services/purchase.service.js";
import { createSaleCache } from "../../src/services/sale-cache.js";
import { connectTestStores, dropTestDatabaseAndDisconnect, startApp, testConfig, type StartedApp } from "../helpers.js";

const SALE_PRICE = 449_500;
const INSERT_FAILED = "Hoàn kho thất bại sau lỗi ghi đơn";
const DUPLICATE_FAILED = "Hoàn kho thất bại sau lỗi trùng đơn";
const REFUND_FAILED_LINE = "[Bù trừ] Hoàn kho thất bại";
/** Giá trị không phải số: INCRBY trên khóa này báo lỗi, dùng để giả lập hoàn kho V2 thất bại. */
const NOT_A_NUMBER = "khong-phai-so";

function newUserId(): string {
  return String(new Types.ObjectId());
}

/** Đợi promise reject và trả lỗi; resolve thì test fail. */
async function rejection(p: Promise<unknown>): Promise<unknown> {
  try {
    await p;
  } catch (e) {
    return e;
  }
  assert.fail("buy phải reject");
}

/**
 * Cho lỗi đi qua errorHandler THẬT với một response giả (chỉ trong test, D-14) và trả status + code.
 * errorHandler tự console.error khi trả 500, nên case nào cũng đếm console.error TRƯỚC khi gọi hàm này.
 */
function mapThroughErrorHandler(err: unknown): { status: number | undefined; code: unknown } {
  const rec: { status?: number; body?: { code?: unknown } } = {};
  const res = {
    headersSent: false,
    status(code: number) {
      rec.status = code;
      return res;
    },
    json(body: { code?: unknown }) {
      rec.body = body;
      return res;
    },
  };
  errorHandler(err, {} as ExpressRequest, res as unknown as ExpressResponse, () => {});
  return { status: rec.status, code: rec.body?.code };
}

/** Đặt validator cho một collection qua collMod (validator {} là gỡ). */
async function setValidator(collection: "flash_sales" | "stock_movements", validator: object): Promise<void> {
  const db = mongoose.connection.db;
  if (db === undefined) throw new Error("Chưa kết nối MongoDB");
  await db.command({ collMod: collection, validator });
}

/** Lời gọi console.error đầu tiên ở dạng chuỗi (để kiểm tra nội dung dòng log). */
function firstCallText(calls: readonly { arguments: readonly unknown[] }[]): string {
  return calls.map((c) => c.arguments.map(String).join(" "))[0] ?? "";
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

  /** Service với cache mới và các seam của case (mặc định là hàm thật). */
  function service(seams: { createOrder?: CreateOrderFn; findOrder?: FindOrderFn } = {}): PurchaseService {
    return createPurchaseService({ redis, saleCache: createSaleCache(), ...seams });
  }

  function buyVia(svc: PurchaseService, saleId: string, mode: SaleMode, userId: string): Promise<BuyResult> {
    return svc.buy({ saleId, userId, mode, qty: 1 });
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

  describe("V1: lỗi ghi đơn không phải E11000 (D-10)", () => {
    it("V1 chưa có đơn: hoàn kho, một dòng compensate_v1, ném lại đúng lỗi gốc, không log", async (t) => {
      const errors = t.mock.method(console, "error", () => {});
      const saleId = await createSale({ qty: 5, mode: "v1" });
      const userId = newUserId();
      const insertErr = new Error("ghi đơn lỗi giả");
      const svc = service({
        createOrder: async () => {
          throw insertErr;
        },
      });

      const err = await rejection(buyVia(svc, saleId, "v1", userId));

      assert.equal(err, insertErr);
      assert.equal(await remainingQty(saleId), 5);
      assert.deepEqual(await movements(saleId), [{ reason: "compensate_v1", delta: 1, orderId: null }]);
      assert.equal(await Order.countDocuments({ saleId }), 0);
      assert.equal(errors.mock.callCount(), 0);
    });

    it("V1 đơn đã ghi rồi mới báo lỗi: trả ok với đúng đơn đó, không hoàn kho", async () => {
      const saleId = await createSale({ qty: 5, mode: "v1" });
      const userId = newUserId();
      const svc = service({
        createOrder: async (input) => {
          await realCreateOrder(input);
          throw new Error("ghi đơn lỗi giả");
        },
      });

      const result = await buyVia(svc, saleId, "v1", userId);

      assert.equal(result.kind, "ok");
      const stored = await Order.findOne({ saleId, userId }).lean();
      assert.ok(stored);
      assert.equal(result.kind === "ok" ? result.order.id : undefined, String(stored._id));
      assert.equal(await remainingQty(saleId), 4);
      assert.deepEqual(await movements(saleId), []);
    });

    it("V1 tra cứu đơn cũng lỗi: không hoàn kho (bán thiếu), ném lại lỗi ghi đơn chứ không phải lỗi tra cứu", async () => {
      const saleId = await createSale({ qty: 5, mode: "v1" });
      const insertErr = new Error("ghi đơn lỗi giả");
      const svc = service({
        createOrder: async () => {
          throw insertErr;
        },
        findOrder: async () => {
          throw new Error("tra cứu lỗi");
        },
      });

      const err = await rejection(buyVia(svc, saleId, "v1", newUserId()));

      assert.equal(err, insertErr);
      assert.equal(await remainingQty(saleId), 4);
      assert.deepEqual(await movements(saleId), []);
    });

    it("V1 hoàn kho thất bại sau lỗi ghi đơn: Error mới có cause là lỗi gốc, một dòng log, 500 INTERNAL_ERROR", async (t) => {
      const errors = t.mock.method(console, "error", () => {});
      const saleId = await createSale({ qty: 5, mode: "v1" });
      const userId = newUserId();
      const insertErr = new Error("ghi đơn lỗi giả");
      const svc = service({
        createOrder: async () => {
          // Mọi cập nhật flash_sales từ đây đều bị validator từ chối, kể cả lệnh hoàn kho
          await setValidator("flash_sales", { remainingQty: { $type: "string" } });
          throw insertErr;
        },
      });

      try {
        const err = await rejection(buyVia(svc, saleId, "v1", userId));

        assert.ok(err instanceof Error);
        assert.equal(err.message, INSERT_FAILED);
        assert.equal(err.cause, insertErr);
        assert.equal(errors.mock.callCount(), 1);
        const line = firstCallText(errors.mock.calls);
        assert.ok(line.includes(saleId) && line.includes(userId) && line.includes("v1"), line);
        assert.deepEqual(mapThroughErrorHandler(err), { status: 500, code: "INTERNAL_ERROR" });
      } finally {
        await setValidator("flash_sales", {});
      }
      assert.equal(await remainingQty(saleId), 4);
      assert.deepEqual(await movements(saleId), []);
    });

    it("V1 ghi stock_movements lỗi: kho vẫn được hoàn, một dòng log nhắc stock_movements, ném lại lỗi gốc", async (t) => {
      const errors = t.mock.method(console, "error", () => {});
      const saleId = await createSale({ qty: 5, mode: "v1" });
      const insertErr = new Error("ghi đơn lỗi giả");
      const svc = service({
        createOrder: async () => {
          await setValidator("stock_movements", { delta: { $type: "string" } });
          throw insertErr;
        },
      });

      try {
        const err = await rejection(buyVia(svc, saleId, "v1", newUserId()));

        assert.equal(err, insertErr);
        assert.equal(errors.mock.callCount(), 1);
        assert.ok(firstCallText(errors.mock.calls).includes("stock_movements"));
      } finally {
        await setValidator("stock_movements", {});
      }
      assert.equal(await remainingQty(saleId), 5);
      assert.deepEqual(await movements(saleId), []);
    });
  });

  describe("hoàn kho thất bại sau E11000 (D-12 sửa đổi 2026-11-08)", () => {
    it("V1 (service): Error mới có cause là E11000, một dòng log, 500 INTERNAL_ERROR chứ không phải 409 DUPLICATE", async (t) => {
      const errors = t.mock.method(console, "error", () => {});
      const saleId = await createSale({ qty: 5, mode: "v1" });
      const userId = newUserId();
      await seedOrder(saleId, userId, "v1");
      // Validator xét document SAU cập nhật: trừ 5 -> 4 qua được, hoàn 4 -> 5 bị từ chối
      await setValidator("flash_sales", { remainingQty: { $lt: 5 } });

      try {
        const err = await rejection(buyVia(service(), saleId, "v1", userId));

        assert.ok(err instanceof Error);
        assert.equal(err.message, DUPLICATE_FAILED);
        assert.ok(isDuplicateKeyError(err.cause));
        assert.equal(errors.mock.callCount(), 1);
        const line = firstCallText(errors.mock.calls);
        assert.ok(line.includes(saleId) && line.includes(userId) && line.includes("v1"), line);
        assert.deepEqual(mapThroughErrorHandler(err), { status: 500, code: "INTERNAL_ERROR" });
      } finally {
        await setValidator("flash_sales", {});
      }
      assert.equal(await remainingQty(saleId), 4);
      assert.deepEqual(await movements(saleId), []);
    });

    it("V1 (HTTP, không seam): 500 INTERNAL_ERROR, đúng một dòng [Bù trừ] Hoàn kho thất bại", async (t) => {
      const errors = t.mock.method(console, "error", () => {});
      const saleId = await createSale({ qty: 5, mode: "v1" });
      const userId = newUserId();
      await seedOrder(saleId, userId, "v1");
      await setValidator("flash_sales", { remainingQty: { $lt: 5 } });

      try {
        await expectError(await buy(saleId, "v1", userId), 500, "INTERNAL_ERROR");
      } finally {
        await setValidator("flash_sales", {});
      }
      // Lời gọi console.error của chính errorHandler (cho lỗi 500) truyền đối tượng Error, không tính ở đây
      const lines = errors.mock.calls.map((c) => c.arguments[0]).filter((a): a is string => typeof a === "string");
      assert.equal(lines.length, 1, JSON.stringify(lines));
      assert.ok(lines[0]?.startsWith(REFUND_FAILED_LINE), lines[0]);
      assert.equal(await remainingQty(saleId), 4);
    });

    it("V2 (service): INCRBY lỗi -> Error mới có cause là E11000, một dòng log, 500; người mua vẫn trong buyers", async (t) => {
      const errors = t.mock.method(console, "error", () => {});
      const saleId = await createSale({ qty: 5, mode: "v2" });
      const userId = newUserId();
      await seedOrder(saleId, userId, "v2");
      const svc = service({
        createOrder: async (input) => {
          await redis.set(stockKey(saleId), NOT_A_NUMBER);
          return realCreateOrder(input);
        },
      });

      const err = await rejection(buyVia(svc, saleId, "v2", userId));

      assert.ok(err instanceof Error);
      assert.equal(err.message, DUPLICATE_FAILED);
      assert.ok(isDuplicateKeyError(err.cause));
      assert.equal(errors.mock.callCount(), 1);
      const line = firstCallText(errors.mock.calls);
      assert.ok(line.includes(saleId) && line.includes(userId) && line.includes("v2"), line);
      assert.deepEqual(mapThroughErrorHandler(err), { status: 500, code: "INTERNAL_ERROR" });
      assert.equal(await redis.sismember(buyersKey(saleId), userId), 1, "nhánh E11000 không bao giờ SREM");
      assert.deepEqual(await movements(saleId), []);
    });
  });

  describe("V2: lỗi ghi đơn không phải E11000 (D-10, D-11)", () => {
    it("V2 chưa có đơn: INCRBY + SREM, một dòng compensate_v2, ném lại đúng lỗi gốc", async () => {
      const saleId = await createSale({ qty: 5, mode: "v2" });
      const userId = newUserId();
      const insertErr = new Error("ghi đơn lỗi giả");
      const svc = service({
        createOrder: async () => {
          throw insertErr;
        },
      });

      const err = await rejection(buyVia(svc, saleId, "v2", userId));

      assert.equal(err, insertErr);
      assert.equal(await redis.get(stockKey(saleId)), "5");
      assert.equal(await redis.sismember(buyersKey(saleId), userId), 0);
      assert.deepEqual(await movements(saleId), [{ reason: "compensate_v2", delta: 1, orderId: null }]);
    });

    it("V2 đơn đã ghi rồi mới báo lỗi: trả ok với đúng đơn đó, không hoàn kho, giữ người mua", async () => {
      const saleId = await createSale({ qty: 5, mode: "v2" });
      const userId = newUserId();
      const svc = service({
        createOrder: async (input) => {
          await realCreateOrder(input);
          throw new Error("ghi đơn lỗi giả");
        },
      });

      const result = await buyVia(svc, saleId, "v2", userId);

      assert.equal(result.kind, "ok");
      const stored = await Order.findOne({ saleId, userId }).lean();
      assert.ok(stored);
      assert.equal(result.kind === "ok" ? result.order.id : undefined, String(stored._id));
      assert.equal(await redis.get(stockKey(saleId)), "4");
      assert.equal(await redis.sismember(buyersKey(saleId), userId), 1);
      assert.deepEqual(await movements(saleId), []);
    });

    it("V2 tra cứu đơn cũng lỗi: không hoàn kho, giữ người mua, ném lại lỗi ghi đơn", async () => {
      const saleId = await createSale({ qty: 5, mode: "v2" });
      const userId = newUserId();
      const insertErr = new Error("ghi đơn lỗi giả");
      const svc = service({
        createOrder: async () => {
          throw insertErr;
        },
        findOrder: async () => {
          throw new Error("tra cứu lỗi");
        },
      });

      const err = await rejection(buyVia(svc, saleId, "v2", userId));

      assert.equal(err, insertErr);
      assert.equal(await redis.get(stockKey(saleId)), "4");
      assert.equal(await redis.sismember(buyersKey(saleId), userId), 1);
      assert.deepEqual(await movements(saleId), []);
    });

    it("V2 hoàn kho thất bại (multi báo lỗi INCRBY): Error mới có cause là lỗi gốc, một dòng log, 500", async (t) => {
      const errors = t.mock.method(console, "error", () => {});
      const saleId = await createSale({ qty: 5, mode: "v2" });
      const userId = newUserId();
      const insertErr = new Error("ghi đơn lỗi giả");
      const svc = service({
        createOrder: async () => {
          await redis.set(stockKey(saleId), NOT_A_NUMBER);
          throw insertErr;
        },
      });

      const err = await rejection(buyVia(svc, saleId, "v2", userId));

      assert.ok(err instanceof Error);
      assert.equal(err.message, INSERT_FAILED);
      assert.equal(err.cause, insertErr);
      assert.equal(errors.mock.callCount(), 1);
      const line = firstCallText(errors.mock.calls);
      assert.ok(line.includes(saleId) && line.includes(userId) && line.includes("v2"), line);
      assert.deepEqual(mapThroughErrorHandler(err), { status: 500, code: "INTERNAL_ERROR" });
      assert.deepEqual(await movements(saleId), []);
    });
  });

  describe("đường thành công và E3", () => {
    it("mua thành công một lần mỗi mode qua service: không thêm stock_movements, không console.log/warn/error (BUY-08)", async (t) => {
      const logs = t.mock.method(console, "log");
      const warns = t.mock.method(console, "warn");
      const errors = t.mock.method(console, "error");
      const movementsBefore = await StockMovement.countDocuments();
      const svc = service();

      for (const mode of SALE_MODES) {
        const saleId = await createSale({ qty: 5, mode });
        const result = await buyVia(svc, saleId, mode, newUserId());
        assert.equal(result.kind, "ok", `mode ${mode}`);
      }

      assert.equal(await StockMovement.countDocuments(), movementsBefore);
      assert.equal(logs.mock.callCount(), 0);
      assert.equal(warns.mock.callCount(), 0);
      assert.equal(errors.mock.callCount(), 0);
    });

    it("E3: một user bắn 10 request song song -> đúng 1 đơn; V1 remainingQty 9; V2 stock 9 và SCARD 1", async () => {
      const svc = service();

      const v1Sale = await createSale({ qty: 10, mode: "v1" });
      const v1User = newUserId();
      const v1Results = await Promise.all(Array.from({ length: 10 }, () => buyVia(svc, v1Sale, "v1", v1User)));
      assert.equal(v1Results.filter((r) => r.kind === "ok").length, 1);
      assert.equal(v1Results.filter((r) => r.kind === "already_bought").length, 9);
      assert.equal(await Order.countDocuments({ saleId: v1Sale }), 1);
      assert.equal(await remainingQty(v1Sale), 9);

      const v2Sale = await createSale({ qty: 10, mode: "v2" });
      const v2User = newUserId();
      const v2Results = await Promise.all(Array.from({ length: 10 }, () => buyVia(svc, v2Sale, "v2", v2User)));
      assert.equal(v2Results.filter((r) => r.kind === "ok").length, 1);
      assert.equal(v2Results.filter((r) => r.kind === "already_bought").length, 9);
      assert.equal(await Order.countDocuments({ saleId: v2Sale }), 1);
      assert.equal(await redis.get(stockKey(v2Sale)), "9");
      assert.equal(await redis.scard(buyersKey(v2Sale)), 1);
    });
  });
});
