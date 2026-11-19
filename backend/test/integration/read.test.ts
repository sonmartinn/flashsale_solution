// Test tích hợp cho các API đọc (READ-01..READ-04, D-19..D-23): GET /api/sales/:id, /api/sales/active,
// /api/products, /api/products/:id và /api/orders/me.
// Cần "docker compose up -d --wait". Dùng database flashsale_test_read_<pid> và Redis db 9 (không bao giờ db 0).
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { Types } from "mongoose";
import type { Redis } from "ioredis";
import { stockKey } from "../../src/config/redis.js";
import { FlashSale, Order, Product, ensureIndexes, type SaleMode, type SaleStatus } from "../../src/models/index.js";
import { createAuthService } from "../../src/services/auth.service.js";
import { SEED_PRODUCTS } from "../../src/services/seed.service.js";
import {
  TEST_JWT_SECRET,
  connectTestStores,
  dropTestDatabaseAndDisconnect,
  startApp,
  testConfig,
  type StartedApp,
} from "../helpers.js";

const SALE_PRICE = 449_500;
const HOUR = 60 * 60 * 1000;
const SALE_KEYS = [
  "endAt",
  "id",
  "mode",
  "perUserLimit",
  "product",
  "productId",
  "remaining",
  "salePrice",
  "startAt",
  "status",
  "stockLoaded",
  "totalQty",
];
const PRODUCT_SUMMARY_KEYS = ["category", "id", "images", "name", "price", "slug"];
const ORDER_KEYS = ["createdAt", "id", "mode", "price", "productId", "qty", "saleId", "status"];

type Json = Record<string, unknown>;

/** Không phản hồi đọc nào được lộ trường nội bộ của MongoDB (D-20). */
function assertNoMongoInternals(body: unknown): void {
  const text = JSON.stringify(body);
  assert.ok(!text.includes('"_id"'), `có "_id" trong phản hồi: ${text}`);
  assert.ok(!text.includes('"__v"'), `có "__v" trong phản hồi: ${text}`);
}

/** Chuỗi phải là ngày ISO đầy đủ (toISOString cho lại đúng chuỗi đó). */
function assertIso(value: unknown, label: string): void {
  assert.equal(typeof value, "string", label);
  assert.equal(new Date(value as string).toISOString(), value, label);
}

describe("read.test", () => {
  let redis: Redis;
  let app: StartedApp;
  let productId: Types.ObjectId;

  /** Tạo một đợt sale; redisStock là chuỗi thì SET stock:<id>, null/undefined thì bảo đảm khóa không tồn tại. */
  async function createSale(opts: {
    mode: SaleMode;
    totalQty: number;
    remainingQty?: number;
    status?: SaleStatus;
    startAt?: Date;
    endAt?: Date;
    redisStock?: string | null;
  }): Promise<string> {
    const sale = await FlashSale.create({
      productId,
      salePrice: SALE_PRICE,
      totalQty: opts.totalQty,
      remainingQty: opts.remainingQty ?? opts.totalQty,
      perUserLimit: 1,
      status: opts.status ?? "active",
      startAt: opts.startAt ?? new Date(Date.now() - HOUR),
      endAt: opts.endAt ?? new Date(Date.now() + 24 * HOUR),
      mode: opts.mode,
    });
    const id = String(sale._id);
    if (typeof opts.redisStock === "string") await redis.set(stockKey(id), opts.redisStock);
    else await redis.del(stockKey(id));
    return id;
  }

  async function getJson(path: string, headers: Record<string, string> = {}): Promise<{ status: number; body: Json }> {
    const res = await fetch(`${app.baseUrl}${path}`, { headers });
    return { status: res.status, body: (await res.json()) as Json };
  }

  async function getSale(id: string): Promise<{ now: string; sale: Json }> {
    const { status, body } = await getJson(`/api/sales/${id}`);
    assert.equal(status, 200, JSON.stringify(body));
    assertNoMongoInternals(body);
    return body as { now: string; sale: Json };
  }

  before(async () => {
    ({ redis } = await connectTestStores("read", 9));
    await ensureIndexes();
    const products = await Product.insertMany(SEED_PRODUCTS);
    const first = products[0];
    if (first === undefined) throw new Error("Seed không có sản phẩm nào");
    productId = first._id;
    app = await startApp({ redis, cfg: testConfig({ isTestMode: true }) });
  });

  after(async () => {
    await app?.close();
    await redis.flushdb();
    await dropTestDatabaseAndDisconnect(redis);
  });

  describe("GET /api/sales/:id (READ-03)", () => {
    it("v1: 200 { now, sale } đúng D-20, remaining = remainingQty, stockLoaded true", async () => {
      const id = await createSale({ mode: "v1", totalQty: 10, remainingQty: 4 });
      const body = await getSale(id);
      assert.deepEqual(Object.keys(body).sort(), ["now", "sale"]);
      const sale = body.sale;
      assert.deepEqual(Object.keys(sale).sort(), SALE_KEYS);
      assert.deepEqual(Object.keys(sale["product"] as Json).sort(), PRODUCT_SUMMARY_KEYS);
      assert.equal(sale["id"], id);
      assert.equal(sale["productId"], String(productId));
      assert.equal((sale["product"] as Json)["id"], String(productId));
      assert.equal((sale["product"] as Json)["slug"], SEED_PRODUCTS[0]?.slug);
      assert.equal(sale["salePrice"], SALE_PRICE);
      assert.equal(sale["totalQty"], 10);
      assert.equal(sale["perUserLimit"], 1);
      assert.equal(sale["status"], "active");
      assert.equal(sale["mode"], "v1");
      assert.equal(sale["remaining"], 4);
      assert.equal(sale["stockLoaded"], true);
      assertIso(sale["startAt"], "startAt");
      assertIso(sale["endAt"], "endAt");
      assertIso(body.now, "now");
      assert.ok(Math.abs(new Date(body.now).getTime() - Date.now()) < 5000, "now phải là giờ server hiện tại");
    });

    it("v0: remainingQty âm được hiện nguyên giá trị", async () => {
      const id = await createSale({ mode: "v0", totalQty: 10, remainingQty: -3 });
      const { sale } = await getSale(id);
      assert.equal(sale["remaining"], -3);
      assert.equal(sale["stockLoaded"], true);
    });

    it("v2 có stock:<id>: remaining đọc từ Redis, không từ remainingQty", async () => {
      const id = await createSale({ mode: "v2", totalQty: 10, remainingQty: 10, redisStock: "7" });
      const { sale } = await getSale(id);
      assert.equal(sale["remaining"], 7);
      assert.equal(sale["stockLoaded"], true);
    });

    it("v2 thiếu stock:<id>: remaining = totalQty - số đơn thành công, stockLoaded false", async () => {
      const id = await createSale({ mode: "v2", totalQty: 10, redisStock: null });
      for (let i = 0; i < 2; i++) {
        await Order.create({
          userId: new Types.ObjectId(),
          saleId: id,
          productId,
          qty: 1,
          price: SALE_PRICE,
          status: "success",
          mode: "v2",
        });
      }
      // Đơn đã hủy không được tính
      await Order.create({
        userId: new Types.ObjectId(),
        saleId: id,
        productId,
        qty: 1,
        price: SALE_PRICE,
        status: "cancelled",
        mode: "v2",
      });
      const { sale } = await getSale(id);
      assert.equal(sale["remaining"], 8);
      assert.equal(sale["stockLoaded"], false);
    });

    it("đợt sale đã kết thúc vẫn trả 200 với status ended", async () => {
      const id = await createSale({
        mode: "v1",
        totalQty: 5,
        status: "ended",
        startAt: new Date(Date.now() - 48 * HOUR),
        endAt: new Date(Date.now() - 24 * HOUR),
      });
      const { sale } = await getSale(id);
      assert.equal(sale["status"], "ended");
    });

    it("id sai định dạng -> 400 INVALID_ID; id hợp lệ không tồn tại -> 404 NOT_FOUND", async () => {
      const bad = await getJson("/api/sales/abc");
      assert.equal(bad.status, 400);
      assert.equal(bad.body["code"], "INVALID_ID");
      const missing = await getJson(`/api/sales/${String(new Types.ObjectId())}`);
      assert.equal(missing.status, 404);
      assert.equal(missing.body["code"], "NOT_FOUND");
    });
  });

  describe("GET /api/sales/active (READ-02)", () => {
    let a: string;
    let b: string;
    let c: string;
    let excluded: string[];

    before(async () => {
      // Chỉ giữ các đợt sale của nhóm case này trong danh sách đang mở
      await FlashSale.updateMany({}, { $set: { status: "ended" } });
      const now = Date.now();
      a = await createSale({ mode: "v2", totalQty: 10, redisStock: "5", startAt: new Date(now - 3 * HOUR) });
      b = await createSale({ mode: "v1", totalQty: 10, remainingQty: 6, startAt: new Date(now - HOUR) });
      c = await createSale({ mode: "v2", totalQty: 10, redisStock: null, startAt: new Date(now - 2 * HOUR) });
      await Order.create({
        userId: new Types.ObjectId(),
        saleId: c,
        productId,
        qty: 1,
        price: SALE_PRICE,
        status: "success",
        mode: "v2",
      });
      excluded = [
        await createSale({ mode: "v1", totalQty: 5, status: "scheduled", startAt: new Date(now - HOUR) }),
        await createSale({ mode: "v1", totalQty: 5, status: "ended", startAt: new Date(now - HOUR) }),
        await createSale({ mode: "v2", totalQty: 5, redisStock: "5", startAt: new Date(now + HOUR) }),
        await createSale({
          mode: "v1",
          totalQty: 5,
          startAt: new Date(now - 48 * HOUR),
          endAt: new Date(now - 24 * HOUR),
        }),
      ];
    });

    it("chỉ liệt kê đợt active trong khung giờ, theo startAt tăng dần, remaining đúng từng mode, một MGET", async (t) => {
      const mget = t.mock.method(redis, "mget");
      const { status, body } = await getJson("/api/sales/active");
      assert.equal(status, 200, JSON.stringify(body));
      assertNoMongoInternals(body);
      assert.deepEqual(Object.keys(body).sort(), ["now", "sales"]);
      assertIso(body["now"], "now");
      const sales = body["sales"] as Json[];
      assert.deepEqual(
        sales.map((s) => s["id"]),
        [a, c, b],
      );
      for (const id of excluded) assert.ok(!sales.some((s) => s["id"] === id), `không được liệt kê ${id}`);
      for (const s of sales) {
        assert.deepEqual(Object.keys(s).sort(), SALE_KEYS);
        assert.deepEqual(Object.keys(s["product"] as Json).sort(), PRODUCT_SUMMARY_KEYS);
      }
      const [sa, sc, sb] = sales;
      assert.equal(sa?.["remaining"], 5);
      assert.equal(sa?.["stockLoaded"], true);
      assert.equal(sc?.["remaining"], 9);
      assert.equal(sc?.["stockLoaded"], false);
      assert.equal(sb?.["remaining"], 6);
      assert.equal(sb?.["stockLoaded"], true);
      assert.equal(mget.mock.callCount(), 1, "mọi khóa v2 phải được đọc bằng đúng một MGET");
    });

    it("không còn đợt v2 nào: vẫn 200 và không gọi MGET", async (t) => {
      await FlashSale.updateMany({ _id: { $in: [a, c] } }, { $set: { status: "ended" } });
      const mget = t.mock.method(redis, "mget");
      const { status, body } = await getJson("/api/sales/active");
      assert.equal(status, 200, JSON.stringify(body));
      assert.deepEqual(
        (body["sales"] as Json[]).map((s) => s["id"]),
        [b],
      );
      assert.equal(mget.mock.callCount(), 0, "MGET không khóa là lỗi của Redis");
    });

    it("/active không bị route /:id bắt (không bao giờ trả 400 INVALID_ID)", async () => {
      const { status, body } = await getJson("/api/sales/active");
      assert.notEqual(body["code"], "INVALID_ID");
      assert.equal(status, 200);
    });
  });

  describe("GET /api/products, /api/products/:id (READ-01)", () => {
    it("liệt kê 6 sản phẩm theo _id tăng dần, mỗi sản phẩm đúng các khóa của ProductDto", async () => {
      const { status, body } = await getJson("/api/products");
      assert.equal(status, 200, JSON.stringify(body));
      assertNoMongoInternals(body);
      assert.deepEqual(Object.keys(body), ["products"]);
      const products = body["products"] as Json[];
      assert.equal(products.length, SEED_PRODUCTS.length);
      const ids = products.map((p) => String(p["id"]));
      assert.deepEqual(ids, [...ids].sort());
      for (const p of products) {
        const seed = SEED_PRODUCTS.find((s) => s.slug === p["slug"]);
        assert.ok(seed !== undefined, `sản phẩm lạ ${String(p["slug"])}`);
        const expected = ["attributes", "category", "id", "images", "name", "price", "slug"];
        if (seed.description !== undefined) expected.push("description");
        assert.deepEqual(Object.keys(p).sort(), expected.sort());
        assert.deepEqual(p["attributes"], seed.attributes);
        assert.equal(p["description"], seed.description);
        assert.equal(p["price"], seed.price);
      }
    });

    it("GET /api/products/:id trả { product }; 400 INVALID_ID; 404 NOT_FOUND", async () => {
      const ok = await getJson(`/api/products/${String(productId)}`);
      assert.equal(ok.status, 200, JSON.stringify(ok.body));
      assertNoMongoInternals(ok.body);
      assert.deepEqual(Object.keys(ok.body), ["product"]);
      const product = ok.body["product"] as Json;
      assert.equal(product["id"], String(productId));
      assert.equal(product["slug"], SEED_PRODUCTS[0]?.slug);

      const bad = await getJson("/api/products/abc");
      assert.equal(bad.status, 400);
      assert.equal(bad.body["code"], "INVALID_ID");
      assert.equal(bad.body["message"], "Mã sản phẩm không hợp lệ");

      const missing = await getJson(`/api/products/${String(new Types.ObjectId())}`);
      assert.equal(missing.status, 404);
      assert.equal(missing.body["code"], "NOT_FOUND");
      assert.equal(missing.body["message"], "Không tìm thấy sản phẩm");
    });
  });

  describe("GET /api/orders/me (READ-04)", () => {
    const userU = new Types.ObjectId();
    const userV = new Types.ObjectId();
    const userW = new Types.ObjectId();
    const base = Date.UTC(2026, 10, 1, 8, 0, 0);
    let uOrderIds: string[];
    let vOrderId: string;
    let wOrderIds: string[];

    /** Đơn chèn thẳng qua driver để giữ đúng createdAt (timestamps của Mongoose sẽ ghi đè nếu dùng create). */
    function rawOrder(userId: Types.ObjectId, createdAt: Date): Record<string, unknown> {
      return {
        _id: new Types.ObjectId(),
        userId,
        saleId: new Types.ObjectId(),
        productId,
        qty: 1,
        price: SALE_PRICE,
        status: "success",
        mode: "v1",
        createdAt,
      };
    }

    before(async () => {
      const uOrders = [1, 2, 3].map((i) => rawOrder(userU, new Date(base + i * 60_000)));
      const vOrder = rawOrder(userV, new Date(base + 10 * 60_000));
      const wOrders = Array.from({ length: 105 }, (_, i) => rawOrder(userW, new Date(base + i * 1000)));
      await Order.collection.insertMany([...uOrders, vOrder, ...wOrders]);
      uOrderIds = uOrders.map((o) => String(o["_id"]));
      vOrderId = String(vOrder["_id"]);
      wOrderIds = wOrders.map((o) => String(o["_id"]));
    });

    it("x-test-user: chỉ đơn của chính người gọi, mới nhất trước, đúng khóa OrderDto + product", async () => {
      const { status, body } = await getJson("/api/orders/me", { "x-test-user": String(userU) });
      assert.equal(status, 200, JSON.stringify(body));
      assertNoMongoInternals(body);
      assert.deepEqual(Object.keys(body), ["orders"]);
      const orders = body["orders"] as Json[];
      assert.deepEqual(
        orders.map((o) => o["id"]),
        [...uOrderIds].reverse(),
      );
      assert.ok(!orders.some((o) => o["id"] === vOrderId), "không được thấy đơn của người khác");
      for (const o of orders) {
        assert.deepEqual(Object.keys(o).sort(), [...ORDER_KEYS, "product"].sort());
        assert.deepEqual(Object.keys(o["product"] as Json).sort(), ["id", "images", "name", "slug"]);
        assert.equal((o["product"] as Json)["id"], String(productId));
        assert.equal(o["productId"], String(productId));
        assertIso(o["createdAt"], "createdAt");
      }
    });

    it("JWT của cùng người dùng trả đúng 3 đơn đó", async () => {
      const token = createAuthService({ jwtSecret: TEST_JWT_SECRET }).signToken(String(userU), "user");
      const { status, body } = await getJson("/api/orders/me", { authorization: `Bearer ${token}` });
      assert.equal(status, 200, JSON.stringify(body));
      assert.deepEqual(
        (body["orders"] as Json[]).map((o) => o["id"]),
        [...uOrderIds].reverse(),
      );
    });

    it("không có x-test-user lẫn token -> 401 UNAUTHORIZED", async () => {
      const { status, body } = await getJson("/api/orders/me");
      assert.equal(status, 401);
      assert.equal(body["code"], "UNAUTHORIZED");
    });

    it("giới hạn 100 đơn: người có 105 đơn nhận 100 đơn mới nhất", async () => {
      const { status, body } = await getJson("/api/orders/me", { "x-test-user": String(userW) });
      assert.equal(status, 200, JSON.stringify(body));
      const ids = (body["orders"] as Json[]).map((o) => o["id"]);
      assert.equal(ids.length, 100);
      assert.equal(ids[0], wOrderIds[104], "đơn đầu tiên phải là đơn mới nhất");
      assert.equal(ids[99], wOrderIds[5], "đơn cuối phải là đơn cũ thứ 6");
    });
  });
});
