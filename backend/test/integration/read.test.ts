// Test tích hợp cho các API đọc (READ-01..READ-04, D-19..D-23): GET /api/sales/:id, /api/sales/active,
// /api/products, /api/products/:id và /api/orders/me.
// Cần "docker compose up -d --wait". Dùng database flashsale_test_read_<pid> và Redis db 9 (không bao giờ db 0).
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { Types } from "mongoose";
import type { Redis } from "ioredis";
import { stockKey } from "../../src/config/redis.js";
import { FlashSale, Order, Product, ensureIndexes, type SaleMode, type SaleStatus } from "../../src/models/index.js";
import { SEED_PRODUCTS } from "../../src/services/seed.service.js";
import {
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
});
