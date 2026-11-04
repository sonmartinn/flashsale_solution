// Test tích hợp cho 5 model SPECS mục 6: tên collection, index và các trường hợp biên, trên MongoDB thật.
// Cần "docker compose up -d --wait" (MongoDB 127.0.0.1:27018, Redis 127.0.0.1:6379).
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import mongoose, { Types } from "mongoose";
import { connectMongo } from "../../src/config/db.js";
import { FlashSale, Order, Product, StockMovement, User, ensureIndexes } from "../../src/models/index.js";
import {
  TEST_JWT_SECRET,
  dropTestDatabaseAndDisconnect,
  getFreePort,
  startServerProcess,
  testMongoUri,
  testRedisUrl,
  type ServerProcess,
} from "../helpers.js";

const BOOT_URI = testMongoUri("modelsboot");
const BOOT_DB = new URL(BOOT_URI).pathname.slice(1);

interface IndexInfo {
  name?: string;
  unique?: boolean;
}

function isDuplicateKey(err: unknown): boolean {
  return err instanceof mongoose.mongo.MongoServerError && err.code === 11000;
}

async function indexesOf(model: { collection: { indexes: () => Promise<unknown[]> } }): Promise<IndexInfo[]> {
  return (await model.collection.indexes()) as IndexInfo[];
}

function findIndex(list: IndexInfo[], name: string): IndexInfo | undefined {
  return list.find((i) => i.name === name);
}

function saleDoc(remainingQty: number) {
  const now = Date.now();
  return {
    productId: new Types.ObjectId(),
    salePrice: 99_000,
    totalQty: 10,
    remainingQty,
    perUserLimit: 1,
    startAt: new Date(now),
    endAt: new Date(now + 3_600_000),
    status: "active" as const,
    mode: "v0" as const,
  };
}

function orderDoc(saleId: Types.ObjectId, userId: Types.ObjectId) {
  return { userId, saleId, productId: new Types.ObjectId(), qty: 1, price: 99_000, mode: "v1" as const };
}

describe("models.test", () => {
  before(async () => {
    await connectMongo(testMongoUri("models"), 10);
    await mongoose.connection.dropDatabase();
    await ensureIndexes();
  });

  after(async () => {
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.useDb(BOOT_DB).dropDatabase();
    }
    await dropTestDatabaseAndDisconnect();
  });

  it("tên collection tường minh theo SPECS mục 6", async () => {
    const db = mongoose.connection.db;
    assert.ok(db);
    const names = (await db.listCollections().toArray()).map((c) => c.name).sort();
    assert.deepEqual(names, ["flash_sales", "orders", "products", "stock_movements", "users"]);
    assert.equal(User.collection.collectionName, "users");
    assert.equal(Product.collection.collectionName, "products");
    assert.equal(FlashSale.collection.collectionName, "flash_sales");
    assert.equal(Order.collection.collectionName, "orders");
    assert.equal(StockMovement.collection.collectionName, "stock_movements");
  });

  it("đủ mọi index của SPECS mục 6, đúng thuộc tính unique", async () => {
    const users = await indexesOf(User);
    assert.equal(findIndex(users, "email_1")?.unique, true);

    const products = await indexesOf(Product);
    assert.equal(findIndex(products, "slug_1")?.unique, true);

    const sales = await indexesOf(FlashSale);
    assert.ok(findIndex(sales, "status_1_startAt_1"), "thiếu index status_1_startAt_1");

    const orders = await indexesOf(Order);
    assert.equal(findIndex(orders, "saleId_1_userId_1")?.unique, true);
    const byUser = findIndex(orders, "userId_1_createdAt_-1");
    assert.ok(byUser, "thiếu index userId_1_createdAt_-1");
    assert.notEqual(byUser.unique, true);

    const movements = await indexesOf(StockMovement);
    assert.ok(findIndex(movements, "saleId_1_at_1"), "thiếu index saleId_1_at_1");
  });

  it("remainingQty không có min: sale với remainingQty -5 vẫn lưu được (V0 bán quá)", async () => {
    const sale = await FlashSale.create(saleDoc(-5));
    const stored = await FlashSale.findById(sale._id).lean();
    assert.equal(stored?.remainingQty, -5);
  });

  it("một user chỉ một đơn mỗi sale: trùng (saleId, userId) bị E11000, sale khác thì được", async () => {
    const saleA = new Types.ObjectId();
    const saleB = new Types.ObjectId();
    const userId = new Types.ObjectId();
    await Order.create(orderDoc(saleA, userId));
    await assert.rejects(Order.create(orderDoc(saleA, userId)), isDuplicateKey);
    const other = await Order.create(orderDoc(saleB, userId));
    assert.equal(other.status, "success");
    assert.ok(other.createdAt instanceof Date);
  });

  it("stock_movements tạo không có orderId thì lưu orderId null và có at", async () => {
    const mv = await StockMovement.create({ saleId: new Types.ObjectId(), delta: 10, reason: "reset" });
    const stored = await StockMovement.findById(mv._id).lean();
    assert.ok(stored);
    assert.equal(stored.orderId, null);
    assert.ok(stored.at instanceof Date);
  });

  it("email được trim + chữ thường trước khi index unique áp dụng", async () => {
    const u = await User.create({ name: "Người dùng", email: " User@Example.COM ", passwordHash: "x" });
    assert.equal(u.email, "user@example.com");
    assert.equal(u.role, "user");
    await assert.rejects(User.create({ name: "Bản sao", email: "user@example.com", passwordHash: "y" }), isDuplicateKey);
  });

  describe("server đã biên dịch tạo index trước khi nhận request", () => {
    let server: ServerProcess | undefined;

    before(async () => {
      await mongoose.connection.useDb(BOOT_DB).dropDatabase();
      server = await startServerProcess({
        env: {
          MONGODB_URI: BOOT_URI,
          REDIS_URL: testRedisUrl(2),
          JWT_SECRET: TEST_JWT_SECRET,
          PORT: String(await getFreePort()),
        },
      });
    });

    after(async () => {
      await server?.stop();
    });

    it("health 200 và database mới đã có index saleId_1_userId_1 trên orders", async () => {
      assert.ok(server);
      const res = await fetch(`${server.baseUrl}/api/health`);
      assert.equal(res.status, 200);
      const bootDb = mongoose.connection.useDb(BOOT_DB);
      const names = ((await bootDb.collection("orders").indexes()) as IndexInfo[]).map((i) => i.name);
      assert.ok(names.includes("saleId_1_userId_1"), `index của orders: ${names.join(", ")}`);
    });
  });
});
