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
import { createSaleCache } from "../../src/services/sale-cache.js";
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

const QTY_MESSAGE = "Số lượng mua phải đúng bằng 1";
/** Đánh dấu "POST không body, không content-type" cho send(). */
const NO_BODY = Symbol("no-body");

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

  /**
   * POST tổng quát: query nguyên văn (có thể rỗng hoặc lặp tham số), userId null thì không gửi x-test-user,
   * body NO_BODY thì không gửi body lẫn content-type, body chuỗi thì gửi nguyên văn.
   */
  function send(
    saleId: string,
    query: string,
    opts: { userId?: string | null; body?: unknown } = {},
  ): Promise<Response> {
    const headers: Record<string, string> = {};
    const userId = opts.userId === undefined ? newUserId() : opts.userId;
    if (userId !== null) headers["x-test-user"] = userId;
    const body = "body" in opts ? opts.body : { qty: 1 };
    const init: RequestInit = { method: "POST", headers };
    if (body !== NO_BODY) {
      headers["content-type"] = "application/json";
      init.body = typeof body === "string" ? body : JSON.stringify(body);
    }
    return fetch(`${app.baseUrl}/api/sales/${saleId}/buy${query}`, init);
  }

  async function remainingQty(saleId: string): Promise<number | undefined> {
    return (await FlashSale.findById(saleId, { remainingQty: 1 }).lean())?.remainingQty;
  }

  /** Ba con số kho của một đợt sale: Mongo remainingQty, Redis stock, số người trong buyers. */
  async function snapshot(saleId: string): Promise<{ remaining: number | undefined; stock: string | null; buyers: number }> {
    return {
      remaining: await remainingQty(saleId),
      stock: await redis.get(stockKey(saleId)),
      buyers: await redis.scard(buyersKey(saleId)),
    };
  }

  /** Kiểm tra status + code (+ message nếu có) của một phản hồi lỗi. */
  async function expectError(res: Response, status: number, code: string, message?: string | RegExp): Promise<void> {
    const body = (await res.json()) as { code?: unknown; message?: unknown };
    assert.equal(res.status, status, JSON.stringify(body));
    assert.equal(body.code, code);
    if (typeof message === "string") assert.equal(body.message, message);
    else if (message !== undefined) assert.match(String(body.message), message);
  }

  /** Bắn n request song song với n user khác nhau: dựng mảng promise trước rồi Promise.all. */
  async function burst(saleId: string, mode: SaleMode, n: number): Promise<{ status: number; code: unknown }[]> {
    const users = Array.from({ length: n }, () => newUserId());
    const pending = users.map((u) => buy(saleId, mode, u));
    const responses = await Promise.all(pending);
    return Promise.all(
      responses.map(async (r) => {
        const body = (await r.json()) as { code?: unknown };
        return { status: r.status, code: body.code };
      }),
    );
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

  for (const mode of SALE_MODES) {
    describe(`mode ${mode}: kiểm tra đầu vào bị từ chối trước khi chạm kho`, () => {
      it("400 INVALID_MODE: thiếu mode, v3, V1, mode lặp, mode[$ne]; kho không đổi", async () => {
        const saleId = await createSale({ qty: 5, mode });
        for (const query of ["", "?mode=v3", "?mode=V1", "?mode=v1&mode=v2", "?mode[$ne]=x"]) {
          const before = await snapshot(saleId);
          await expectError(await send(saleId, query), 400, "INVALID_MODE");
          assert.deepEqual(await snapshot(saleId), before, `query "${query}" không được đổi kho`);
        }
        assert.equal(await Order.countDocuments({ saleId }), 0);
      });

      it("400 VALIDATION_ERROR cho mọi qty khác đúng số 1; kho không đổi (qty -5 không làm tăng kho)", async () => {
        const saleId = await createSale({ qty: 5, mode });
        const bodies: unknown[] = [{ qty: "1" }, {}, { qty: -5 }, { qty: 0 }, { qty: 2 }, { qty: 1.5 }, { qty: { $gt: 0 } }, [1], NO_BODY];
        for (const body of bodies) {
          const before = await snapshot(saleId);
          await expectError(await send(saleId, `?mode=${mode}`, { body }), 400, "VALIDATION_ERROR", QTY_MESSAGE);
          const label = body === NO_BODY ? "không body" : JSON.stringify(body);
          assert.deepEqual(await snapshot(saleId), before, `body ${label} không được đổi kho`);
        }
        assert.equal(await Order.countDocuments({ saleId }), 0);
      });

      it('JSON nguyên văn {"qty":1.0} được chấp nhận: 201', async () => {
        const saleId = await createSale({ qty: 5, mode });
        const res = await send(saleId, `?mode=${mode}`, { body: '{"qty":1.0}' });
        assert.equal(res.status, 201, await res.text());
      });

      it("thứ tự kiểm tra D-01: 401 -> INVALID_MODE -> VALIDATION_ERROR -> INVALID_ID", async () => {
        // Không danh tính: 401 dù mọi thứ khác đều sai
        await expectError(await send("abc", "?mode=v9", { userId: null, body: { qty: 2 } }), 401, "UNAUTHORIZED");
        // Sai mode + sai qty + sai id: INVALID_MODE
        await expectError(await send("abc", "?mode=v9", { body: { qty: 2 } }), 400, "INVALID_MODE");
        // Sai qty + sai id: VALIDATION_ERROR
        await expectError(await send("abc", `?mode=${mode}`, { body: { qty: 2 } }), 400, "VALIDATION_ERROR", QTY_MESSAGE);
        // Chỉ sai id: INVALID_ID
        await expectError(await send("abc", `?mode=${mode}`), 400, "INVALID_ID");
      });

      it("404 NOT_FOUND cho id chưa có; tạo sale đúng id đó rồi gọi lại thì 201 (không cache null)", async () => {
        const id = new Types.ObjectId();
        const userId = newUserId();
        await expectError(await buy(String(id), mode, userId), 404, "NOT_FOUND");
        await createSale({ qty: 5, mode, _id: id });
        const res = await buy(String(id), mode, userId);
        assert.equal(res.status, 201, await res.text());
      });

      it("400 SALE_NOT_ACTIVE: chưa bắt đầu (scheduled, startAt tương lai) và đã kết thúc (ended, endAt quá khứ)", async () => {
        const day = 24 * 60 * 60 * 1000;
        const scheduled = await createSale({
          qty: 5,
          mode,
          status: "scheduled",
          startAt: new Date(Date.now() + day),
          endAt: new Date(Date.now() + 2 * day),
        });
        const before = await snapshot(scheduled);
        await expectError(await buy(scheduled, mode), 400, "SALE_NOT_ACTIVE", /chưa bắt đầu/);
        assert.deepEqual(await snapshot(scheduled), before);

        const ended = await createSale({
          qty: 5,
          mode,
          status: "ended",
          startAt: new Date(Date.now() - 2 * day),
          endAt: new Date(Date.now() - day),
        });
        await expectError(await buy(ended, mode), 400, "SALE_NOT_ACTIVE", /đã kết thúc/);
      });
    });

    describe(`mode ${mode}: kết quả của bước trừ kho`, () => {
      it("kho 1: người A 201, người B 409 SOLD_OUT", async () => {
        const saleId = await createSale({ qty: 1, mode });
        const a = await buy(saleId, mode);
        assert.equal(a.status, 201, await a.text());
        await expectError(await buy(saleId, mode), 409, "SOLD_OUT", "Sản phẩm trong đợt sale đã hết hàng");
        assert.equal(await Order.countDocuments({ saleId }), 1);
      });

      it("kho 5: người A mua hai lần thì 201 rồi 409 ALREADY_BOUGHT", async () => {
        const saleId = await createSale({ qty: 5, mode });
        const userId = newUserId();
        const first = await buy(saleId, mode, userId);
        assert.equal(first.status, 201, await first.text());
        await expectError(await buy(saleId, mode, userId), 409, "ALREADY_BOUGHT", "Bạn đã mua sản phẩm này trong đợt sale");
        assert.equal(await Order.countDocuments({ saleId, userId }), 1);
        if (mode === "v0") {
          // D-09: V0 không hoàn kho khi đơn trùng, nên kho bị trừ hai lần (rò rỉ có chủ ý)
          assert.equal(await remainingQty(saleId), 3);
        }
        if (mode === "v2") {
          // Lua trả -1 TRƯỚC khi trừ kho
          assert.equal(await redis.get(stockKey(saleId)), "4");
          assert.equal(await remainingQty(saleId), 5);
        }
      });

      it("D-07: kho 1 đã bán cho A, A mua lại: V2 ALREADY_BOUGHT, V0/V1 SOLD_OUT", async () => {
        const saleId = await createSale({ qty: 1, mode });
        const userId = newUserId();
        const first = await buy(saleId, mode, userId);
        assert.equal(first.status, 201, await first.text());
        const expected = mode === "v2" ? "ALREADY_BOUGHT" : "SOLD_OUT";
        await expectError(await buy(saleId, mode, userId), 409, expected);
      });

      it("V2 thiếu khóa stock:<id> thì 503 STOCK_NOT_LOADED; cùng sale với ?mode=v0 vẫn 201", async () => {
        const saleId = await createSale({ qty: 5, mode });
        await redis.del(stockKey(saleId));
        await expectError(await buy(saleId, "v2"), 503, "STOCK_NOT_LOADED", "Kho của đợt sale chưa được nạp vào Redis");
        assert.equal(await redis.scard(buyersKey(saleId)), 0);
        const res = await buy(saleId, "v0");
        assert.equal(res.status, 201, await res.text());
      });
    });
  }

  describe("cache tĩnh của đợt sale (createSaleCache)", () => {
    it("hai lần get trước khi lần đầu xong trả CÙNG một promise (single-flight)", async () => {
      const saleId = await createSale({ qty: 5, mode: "v1" });
      const cache = createSaleCache();
      const p1 = cache.get(saleId);
      const p2 = cache.get(saleId);
      assert.equal(p1, p2);
      await p1;
    });

    it("id không tồn tại: hai lần get nối tiếp trả hai promise khác nhau, cả hai ra null", async () => {
      const cache = createSaleCache();
      const id = String(new Types.ObjectId());
      const p1 = cache.get(id);
      assert.equal(await p1, null);
      const p2 = cache.get(id);
      assert.notEqual(p1, p2);
      assert.equal(await p2, null);
    });

    it("SaleInfo có đúng sáu trường tĩnh, startAt/endAt là số", async () => {
      const saleId = await createSale({ qty: 5, mode: "v2" });
      const info = await createSaleCache().get(saleId);
      assert.ok(info !== null);
      assert.deepEqual(Object.keys(info).sort(), ["endAt", "productId", "salePrice", "startAt", "status", "totalQty"]);
      assert.equal(typeof info.startAt, "number");
      assert.equal(typeof info.endAt, "number");
      assert.equal(info.productId, String(productId));
      assert.equal(info.salePrice, SALE_PRICE);
      assert.equal(info.totalQty, 5);
      assert.equal(info.status, "active");
    });

    it("đổi status trong Mongo: get vẫn trả status cũ tới khi invalidate(id)", async () => {
      const saleId = await createSale({ qty: 5, mode: "v1" });
      const cache = createSaleCache();
      assert.equal((await cache.get(saleId))?.status, "active");
      await FlashSale.updateOne({ _id: saleId }, { $set: { status: "ended" } });
      assert.equal((await cache.get(saleId))?.status, "active");
      cache.invalidate(saleId);
      assert.equal((await cache.get(saleId))?.status, "ended");
    });

    it("invalidate() không đối số xóa mọi mục", async () => {
      const a = await createSale({ qty: 5, mode: "v1" });
      const b = await createSale({ qty: 5, mode: "v2" });
      const cache = createSaleCache();
      await cache.get(a);
      await cache.get(b);
      await FlashSale.updateMany({ _id: { $in: [a, b] } }, { $set: { status: "scheduled" } });
      cache.invalidate();
      assert.equal((await cache.get(a))?.status, "scheduled");
      assert.equal((await cache.get(b))?.status, "scheduled");
    });
  });

  describe("bắn song song 100 người vào kho 10 (D-34)", () => {
    for (const mode of ["v1", "v2"] as const) {
      it(`${mode}: đúng 10 đơn, 90 SOLD_OUT, không bán quá`, async (t) => {
        const emitWarning = t.mock.method(process, "emitWarning");
        const saleId = await createSale({ qty: 10, mode });
        const results = await burst(saleId, mode, 100);

        const ok = results.filter((r) => r.status === 201).length;
        const soldOut = results.filter((r) => r.status === 409 && r.code === "SOLD_OUT").length;
        assert.equal(ok, 10);
        assert.equal(soldOut, 90, `phân bố status: ${JSON.stringify(results.map((r) => r.status))}`);

        const orders = await Order.find({ saleId }, { userId: 1 }).lean();
        const orderUsers = orders.map((o) => String(o.userId)).sort();
        assert.equal(orders.length, 10);
        assert.equal(new Set(orderUsers).size, 10);

        if (mode === "v1") {
          assert.equal(await remainingQty(saleId), 0);
          assert.equal(emitWarning.mock.callCount(), 0, "V1 không được phát cảnh báo deprecated của Mongoose");
        } else {
          assert.equal(await remainingQty(saleId), 10, "V2 không được chạm flash_sales");
          assert.equal(await redis.get(stockKey(saleId)), "0");
          assert.equal(await redis.scard(buyersKey(saleId)), 10);
          assert.deepEqual((await redis.smembers(buyersKey(saleId))).sort(), orderUsers);
        }
      });
    }

    it("v0: bán quá (remainingQty < 0 và hơn 10 đơn) trong tối đa 3 lần thử", async () => {
      const attempts: { remaining: number | undefined; orders: number }[] = [];
      for (let i = 0; i < 3; i++) {
        const saleId = await createSale({ qty: 10, mode: "v0" });
        await burst(saleId, "v0", 100);
        const result = { remaining: await remainingQty(saleId), orders: await Order.countDocuments({ saleId }) };
        attempts.push(result);
        if (result.remaining !== undefined && result.remaining < 0 && result.orders > 10) return;
      }
      assert.fail(`V0 không bán quá sau 3 lần thử: ${JSON.stringify(attempts)}`);
    });
  });
});
