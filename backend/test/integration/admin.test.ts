// Test tích hợp cho API quản trị: POST /api/admin/sales/:id/reset và GET /api/admin/sales/:id/stats
// (ADMIN-01, ADMIN-02, BUY-02, D-24, D-25, D-34).
// Cần "docker compose up -d --wait". Dùng database flashsale_test_admin_<pid> và Redis db 10 (không bao giờ db 0).
// Mỗi case tự tạo đợt sale riêng qua createSale nên không case nào phụ thuộc case khác.
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { Types } from "mongoose";
import type { Redis } from "ioredis";
import { buyersKey, stockKey } from "../../src/config/redis.js";
import { FlashSale, Product, ensureIndexes, type SaleMode, type SaleStatus } from "../../src/models/index.js";
import { createAuthService } from "../../src/services/auth.service.js";
import { registerBuyScript } from "../../src/services/lua.js";
import {
  TEST_JWT_SECRET,
  connectTestStores,
  dropTestDatabaseAndDisconnect,
  startApp,
  testConfig,
  type StartedApp,
} from "../helpers.js";

const SALE_PRICE = 449_500;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const RESET_KEYS = ["endAt", "mode", "saleId", "startAt", "totalQty"];
/** Đánh dấu "POST không body, không content-type" cho reset(). */
const NO_BODY = Symbol("no-body");

function newUserId(): string {
  return String(new Types.ObjectId());
}

describe("admin.test", () => {
  let redis: Redis;
  let app: StartedApp;
  let productId: Types.ObjectId;
  let adminToken: string;

  /** Tạo đợt sale mới (mặc định đang mở) và nạp kho Redis tương ứng; trả id chữ thường. */
  async function createSale(opts: {
    qty: number;
    mode: SaleMode;
    status?: SaleStatus;
    startAt?: Date;
    endAt?: Date;
  }): Promise<string> {
    const sale = await FlashSale.create({
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

  /**
   * POST reset. token null thì không gửi Authorization; body NO_BODY thì không gửi body lẫn content-type;
   * headers thêm vào (ví dụ x-test-user) được gộp vào sau.
   */
  function reset(
    saleId: string,
    body: unknown = NO_BODY,
    opts: { token?: string | null; headers?: Record<string, string> } = {},
  ): Promise<Response> {
    const headers: Record<string, string> = { ...opts.headers };
    const token = opts.token === undefined ? adminToken : opts.token;
    if (token !== null) headers["authorization"] = `Bearer ${token}`;
    const init: RequestInit = { method: "POST", headers };
    if (body !== NO_BODY) {
      headers["content-type"] = "application/json";
      init.body = JSON.stringify(body);
    }
    return fetch(`${app.baseUrl}/api/admin/sales/${saleId}/reset`, init);
  }

  /** POST mua với x-test-user (chế độ test). */
  function buy(saleId: string, mode: SaleMode, userId: string = newUserId()): Promise<Response> {
    return fetch(`${app.baseUrl}/api/sales/${saleId}/buy?mode=${mode}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-test-user": userId },
      body: JSON.stringify({ qty: 1 }),
    });
  }

  /** Kiểm tra status + code của một phản hồi lỗi. */
  async function expectError(res: Response, status: number, code: string): Promise<void> {
    const body = (await res.json()) as { code?: unknown };
    assert.equal(res.status, status, JSON.stringify(body));
    assert.equal(body.code, code);
  }

  before(async () => {
    ({ redis } = await connectTestStores("admin", 10));
    // connectTestStores không tạo index: cần unique (saleId, userId) cho đường mua
    await ensureIndexes();
    // startApp không đăng ký script Lua (RESEARCH Pitfall 3)
    registerBuyScript(redis);
    const product = await Product.create({
      name: "Áo khoác test admin",
      slug: `ao-khoac-test-admin-${process.pid}`,
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

  describe("tracer: reset qua HTTP", () => {
    it("reset với { mode: \"v2\" } trả 200 { sale } có ngày ISO, đổi mode, mở lại đợt và nạp lại kho Redis", async () => {
      const saleId = await createSale({ qty: 10, mode: "v1" });
      await redis.set(stockKey(saleId), "3");

      const res = await reset(saleId, { mode: "v2" });
      assert.equal(res.status, 200, await res.clone().text());
      const body = (await res.json()) as { sale: Record<string, unknown> };
      assert.deepEqual(Object.keys(body), ["sale"]);
      const sale = body.sale;
      assert.deepEqual(Object.keys(sale).sort(), RESET_KEYS);
      assert.equal(sale["saleId"], saleId);
      assert.equal(sale["mode"], "v2");
      assert.equal(sale["totalQty"], 10);
      const startAt = sale["startAt"] as string;
      const endAt = sale["endAt"] as string;
      assert.equal(new Date(startAt).toISOString(), startAt);
      assert.equal(new Date(endAt).toISOString(), endAt);
      assert.equal(new Date(endAt).getTime() - new Date(startAt).getTime(), SEVEN_DAYS_MS);

      const doc = await FlashSale.findById(saleId, { mode: 1, status: 1, remainingQty: 1 }).lean();
      assert.equal(doc?.mode, "v2");
      assert.equal(doc?.status, "active");
      assert.equal(doc?.remainingQty, 10);
      assert.equal(await redis.get(stockKey(saleId)), "10");
    });

    it("reset xóa cache tĩnh của server đang chạy (BUY-02): đợt ended đã cache vẫn SALE_NOT_ACTIVE tới khi reset", async () => {
      const saleId = await createSale({ qty: 5, mode: "v1", status: "ended" });

      // Lần mua đầu đọc MongoDB và cất thông tin tĩnh vào cache
      await expectError(await buy(saleId, "v1"), 400, "SALE_NOT_ACTIVE");
      // Sửa thẳng database: cache vẫn giữ bản cũ, chứng tỏ có cache
      await FlashSale.updateOne({ _id: saleId }, { $set: { status: "active" } });
      await expectError(await buy(saleId, "v1"), 400, "SALE_NOT_ACTIVE");

      // Reset không body, không content-type: giữ mode v1 và xóa mục cache
      const res = await reset(saleId);
      assert.equal(res.status, 200, await res.clone().text());
      const body = (await res.json()) as { sale: { mode: unknown } };
      assert.equal(body.sale.mode, "v1");

      const after = await buy(saleId, "v1");
      assert.equal(after.status, 201, await after.text());
    });
  });
});
