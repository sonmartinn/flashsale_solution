// Test tích hợp cho seedDatabase: xóa sạch rồi tạo lại dữ liệu flash sale thời trang trên MongoDB + Redis thật.
// Cần "docker compose up -d --wait". Dùng database flashsale_test_seed_<pid> và Redis db 2 (không bao giờ db 0).
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import type { Redis } from "ioredis";
import { buyersKey, stockKey } from "../../src/config/redis.js";
import { FlashSale, Order, Product, User } from "../../src/models/index.js";
import {
  ADMIN_EMAIL,
  SALE_PRODUCT_SLUG,
  SEED_PASSWORD,
  SEED_PRODUCTS,
  SEED_USER_COUNT,
  seedDatabase,
  type SeedSummary,
} from "../../src/services/seed.service.js";
import { connectTestStores, dropTestDatabaseAndDisconnect } from "../helpers.js";

const EXPECTED_SLUGS = [
  "ao-thun-cotton-basic",
  "quan-jeans-slim-fit",
  "vay-hoa-midi",
  "giay-sneaker-trang",
  "tui-tote-canvas",
  "ao-khoac-gio",
];
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

describe("seed.test", () => {
  let redis: Redis;
  let summary: SeedSummary;

  before(async () => {
    ({ redis } = await connectTestStores("seed", 2));
    // Dữ liệu rác phải biến mất sau khi seed
    await redis.set("rac:khoa", "1");
    const db = mongoose.connection.db;
    if (db === undefined) throw new Error("Chưa kết nối MongoDB");
    await db.collection("rac").insertOne({ a: 1 });
    summary = await seedDatabase({ redis, qty: 7, mode: "v1" });
  });

  after(async () => {
    await redis.flushdb();
    await dropTestDatabaseAndDisconnect(redis);
  });

  it("xóa dữ liệu cũ: khóa Redis rác và collection rác không còn", async () => {
    assert.equal(await redis.exists("rac:khoa"), 0);
    const names = (await mongoose.connection.db!.listCollections().toArray()).map((c) => c.name);
    assert.ok(!names.includes("rac"), `collection rác vẫn còn: ${names.join(",")}`);
  });

  it("tạo 1000 user và 1 admin admin@flashsale.local", async () => {
    assert.equal(await User.countDocuments({ role: "user" }), 1000);
    assert.equal(await User.countDocuments({ role: "admin" }), 1);
    const admin = await User.findOne({ email: "admin@flashsale.local" }).lean();
    assert.equal(admin?.role, "admin");
    assert.equal(ADMIN_EMAIL, "admin@flashsale.local");
    assert.equal(SEED_USER_COUNT, 1000);
  });

  it("mọi tài khoản dùng chung MỘT hash của matkhau123", async () => {
    const hashes = await User.distinct("passwordHash");
    assert.equal(hashes.length, 1);
    assert.equal(SEED_PASSWORD, "matkhau123");
    assert.equal(await bcrypt.compare("matkhau123", String(hashes[0])), true);
  });

  it("email và tên user đánh số 4 chữ số", async () => {
    const first = await User.findOne({ email: "user0001@flashsale.local" }).lean();
    const last = await User.findOne({ email: "user1000@flashsale.local" }).lean();
    assert.equal(first?.name, "Người dùng 0001");
    assert.equal(last?.name, "Người dùng 1000");
    assert.equal(first?.role, "user");
  });

  it("6 sản phẩm đúng slug, giá nguyên, ảnh cục bộ, attributes khác nhau theo loại", async () => {
    const products = await Product.find({}).lean();
    assert.equal(products.length, 6);
    assert.deepEqual(products.map((p) => p.slug).sort(), [...EXPECTED_SLUGS].sort());
    assert.deepEqual(SEED_PRODUCTS.map((p) => p.slug).sort(), [...EXPECTED_SLUGS].sort());
    for (const p of products) {
      assert.ok(Number.isInteger(p.price) && p.price > 0, `giá ${p.slug} phải là số nguyên dương`);
      assert.deepEqual(p.images, [`/images/products/${p.slug}.jpg`]);
      assert.match(p.slug, /^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
    const signatures = new Set(
      products.map((p) =>
        Object.keys((p.attributes ?? {}) as Record<string, unknown>)
          .sort()
          .join(","),
      ),
    );
    assert.equal(signatures.size, 6, "mỗi loại hàng phải có bộ khóa attributes riêng");
  });

  it("1 đợt sale đang mở cho giày sneaker, giá 449500, kho 7, mode v1, kéo dài 7 ngày", async () => {
    const sales = await FlashSale.find({}).lean();
    assert.equal(sales.length, 1);
    const sale = sales[0]!;
    const sneaker = await Product.findOne({ slug: SALE_PRODUCT_SLUG }).lean();
    assert.equal(SALE_PRODUCT_SLUG, "giay-sneaker-trang");
    assert.ok(sneaker !== null);
    assert.equal(String(sale.productId), String(sneaker._id));
    assert.equal(sale.salePrice, 449_500);
    assert.equal(sale.totalQty, 7);
    assert.equal(sale.remainingQty, 7);
    assert.equal(sale.perUserLimit, 1);
    assert.equal(sale.status, "active");
    assert.equal(sale.mode, "v1");
    assert.equal(sale.endAt.getTime() - sale.startAt.getTime(), SEVEN_DAYS_MS);
    assert.equal(summary.saleId, String(sale._id));
  });

  it("Redis: stock:<saleId> = 7 và không có buyers:<saleId>", async () => {
    assert.equal(await redis.get(stockKey(summary.saleId)), "7");
    assert.equal(await redis.exists(buyersKey(summary.saleId)), 0);
  });

  it("index được tạo lại sau khi xóa database (có saleId_1_userId_1 trên orders)", async () => {
    const names = ((await Order.collection.indexes()) as { name?: string }[]).map((i) => i.name);
    assert.ok(names.includes("saleId_1_userId_1"), `thiếu index: ${names.join(",")}`);
  });

  it("tóm tắt trả về khớp dữ liệu thật", () => {
    assert.equal(summary.userCount, 1000);
    assert.equal(summary.adminCount, 1);
    assert.equal(summary.productCount, 6);
    assert.equal(summary.saleCount, 1);
    assert.equal(summary.mode, "v1");
    assert.equal(summary.totalQty, 7);
    assert.equal(summary.salePrice, 449_500);
    assert.equal(summary.productSlug, "giay-sneaker-trang");
    assert.equal(summary.adminEmail, "admin@flashsale.local");
    assert.equal(summary.password, "matkhau123");
    assert.equal(summary.sampleUserEmail, "user0001@flashsale.local");
    assert.equal(summary.endAt.getTime() - summary.startAt.getTime(), SEVEN_DAYS_MS);
  });
});
