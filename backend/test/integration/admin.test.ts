// Test tích hợp cho API quản trị: POST /api/admin/sales/:id/reset và GET /api/admin/sales/:id/stats
// (ADMIN-01, ADMIN-02, BUY-02, D-24, D-25, D-34).
// Cần "docker compose up -d --wait". Dùng database flashsale_test_admin_<pid> và Redis db 10 (không bao giờ db 0).
// Mỗi case tự tạo đợt sale riêng qua createSale nên không case nào phụ thuộc case khác.
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { Types } from "mongoose";
import type { Redis } from "ioredis";
import { buyersKey, stockKey } from "../../src/config/redis.js";
import { FlashSale, Product, StockMovement, ensureIndexes, type SaleMode, type SaleStatus } from "../../src/models/index.js";
import { createAuthService } from "../../src/services/auth.service.js";
import { registerBuyScript } from "../../src/services/lua.js";
import { createReconcileService } from "../../src/services/reconcile.service.js";
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
/** Mười một trường của stats (D-25), đã sắp xếp. Phase 3 và trang admin Phase 4 đọc đúng các tên này. */
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
];
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
  let userToken: string;

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

  /** GET stats. token null thì không gửi Authorization; headers thêm vào được gộp vào sau. */
  function getStats(
    saleId: string,
    opts: { token?: string | null; headers?: Record<string, string> } = {},
  ): Promise<Response> {
    const headers: Record<string, string> = { ...opts.headers };
    const token = opts.token === undefined ? adminToken : opts.token;
    if (token !== null) headers["authorization"] = `Bearer ${token}`;
    return fetch(`${app.baseUrl}/api/admin/sales/${saleId}/stats`, { headers });
  }

  /** GET stats bằng token admin, kiểm tra 200 và trả object stats. */
  async function stats(saleId: string): Promise<Record<string, unknown>> {
    const res = await getStats(saleId);
    assert.equal(res.status, 200, await res.clone().text());
    const body = (await res.json()) as { stats: Record<string, unknown> };
    assert.deepEqual(Object.keys(body), ["stats"]);
    return body.stats;
  }

  /** Reset bằng token admin với mode cho trước, kiểm tra 200. */
  async function resetOk(saleId: string, mode: SaleMode): Promise<void> {
    const res = await reset(saleId, { mode });
    assert.equal(res.status, 200, await res.clone().text());
  }

  /** Bắn n request song song với n user khác nhau: dựng mảng promise trước rồi Promise.all. */
  async function burst(saleId: string, mode: SaleMode, n: number): Promise<number[]> {
    const pending = Array.from({ length: n }, () => buy(saleId, mode, newUserId()));
    const responses = await Promise.all(pending);
    return Promise.all(
      responses.map(async (r) => {
        await r.arrayBuffer();
        return r.status;
      }),
    );
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
    const authService = createAuthService({ jwtSecret: TEST_JWT_SECRET });
    adminToken = authService.signToken(newUserId(), "admin");
    userToken = authService.signToken(newUserId(), "user");
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

  describe("guard AUTH-04: chỉ admin gọi được reset và stats", () => {
    it("401 khi không có token, cho cả reset và stats", async () => {
      const saleId = await createSale({ qty: 5, mode: "v1" });
      await expectError(await reset(saleId, { mode: "v2" }, { token: null }), 401, "UNAUTHORIZED");
      await expectError(await getStats(saleId, { token: null }), 401, "UNAUTHORIZED");
    });

    it("403 với JWT role user, cho cả reset và stats; đợt sale không bị đổi", async () => {
      const saleId = await createSale({ qty: 5, mode: "v1" });
      await expectError(await reset(saleId, { mode: "v2" }, { token: userToken }), 403, "FORBIDDEN");
      await expectError(await getStats(saleId, { token: userToken }), 403, "FORBIDDEN");
      assert.equal((await FlashSale.findById(saleId, { mode: 1 }).lean())?.mode, "v1");
    });

    it("403 với chỉ header x-test-user (danh tính chế độ test luôn là user)", async () => {
      const saleId = await createSale({ qty: 5, mode: "v1" });
      const headers = { "x-test-user": newUserId() };
      await expectError(await reset(saleId, { mode: "v2" }, { token: null, headers }), 403, "FORBIDDEN");
      await expectError(await getStats(saleId, { token: null, headers }), 403, "FORBIDDEN");
    });
  });

  describe("đầu vào của reset (D-24)", () => {
    it("body [] -> 400 VALIDATION_ERROR", async () => {
      const saleId = await createSale({ qty: 5, mode: "v1" });
      await expectError(await reset(saleId, []), 400, "VALIDATION_ERROR");
    });

    it("mode v3, V2, null, 2, [\"v1\"] -> 400 INVALID_MODE và mode của đợt không đổi", async () => {
      const saleId = await createSale({ qty: 5, mode: "v1" });
      for (const mode of ["v3", "V2", null, 2, ["v1"]]) {
        await expectError(await reset(saleId, { mode }), 400, "INVALID_MODE");
        assert.equal((await FlashSale.findById(saleId, { mode: 1 }).lean())?.mode, "v1", `mode ${JSON.stringify(mode)}`);
      }
    });

    it("id \"abc\" -> 400 INVALID_ID cho reset và stats", async () => {
      await expectError(await reset("abc", { mode: "v1" }), 400, "INVALID_ID");
      await expectError(await getStats("abc"), 400, "INVALID_ID");
    });

    it("id hợp lệ nhưng không có đợt nào -> 404 NOT_FOUND cho reset và stats", async () => {
      const missing = newUserId();
      await expectError(await reset(missing, { mode: "v1" }), 404, "NOT_FOUND");
      await expectError(await getStats(missing), 404, "NOT_FOUND");
    });

    it("ADMIN-01: hai lần reset liên tiếp cùng body cho cùng mode và totalQty, chỉ còn một biến động reset", async () => {
      const saleId = await createSale({ qty: 7, mode: "v2" });
      const results: { mode: unknown; totalQty: unknown }[] = [];
      for (let i = 0; i < 2; i++) {
        const res = await reset(saleId, { mode: "v1" });
        assert.equal(res.status, 200, await res.clone().text());
        const body = (await res.json()) as { sale: { mode: unknown; totalQty: unknown } };
        results.push({ mode: body.sale.mode, totalQty: body.sale.totalQty });
      }
      assert.deepEqual(results, [
        { mode: "v1", totalQty: 7 },
        { mode: "v1", totalQty: 7 },
      ]);
      assert.equal(await StockMovement.countDocuments({ saleId, reason: "reset" }), 1);
    });
  });

  describe("stats (D-25)", () => {
    it("ngay sau reset một đợt v2 kho 10: đúng mười một trường và giá trị ban đầu", async () => {
      const saleId = await createSale({ qty: 10, mode: "v2" });
      await resetOk(saleId, "v2");
      const s = await stats(saleId);
      assert.deepEqual(Object.keys(s).sort(), STATS_KEYS);
      assert.deepEqual(s, {
        saleId,
        mode: "v2",
        status: "active",
        totalQty: 10,
        mongoRemaining: 10,
        redisStock: 10,
        redisBuyers: 0,
        orders: 0,
        distinctUsers: 0,
        oversold: 0,
        redisInSync: true,
      });
    });

    it("đợt v2 mất khóa stock:<id>: redisStock null và redisInSync false", async () => {
      const saleId = await createSale({ qty: 10, mode: "v2" });
      await redis.del(stockKey(saleId));
      const s = await stats(saleId);
      assert.equal(s["redisStock"], null);
      assert.equal(s["redisInSync"], false);
    });

    it("đợt v1: redisInSync null (chỉ V2 dùng Redis làm kho)", async () => {
      const saleId = await createSale({ qty: 10, mode: "v1" });
      const s = await stats(saleId);
      assert.equal(s["mode"], "v1");
      assert.equal(s["redisInSync"], null);
    });

    it("reset { mode } đổi mode trong stats, redisInSync chuyển giữa boolean (v2) và null (v0/v1)", async () => {
      const saleId = await createSale({ qty: 10, mode: "v1" });
      for (const mode of ["v2", "v0", "v1", "v2"] as const) {
        await resetOk(saleId, mode);
        const s = await stats(saleId);
        assert.equal(s["mode"], mode);
        if (mode === "v2") assert.equal(s["redisInSync"], true);
        else assert.equal(s["redisInSync"], null);
      }
    });
  });

  describe("chu trình kiểu E1: reset qua API, bắn song song, đọc stats, đối chiếu", () => {
    it("V2 (D-34): 100 người vào kho 10 -> 10 đơn, không bán quá, Redis khớp MongoDB", async () => {
      const saleId = await createSale({ qty: 10, mode: "v1" });
      await resetOk(saleId, "v2");
      const statuses = await burst(saleId, "v2", 100);
      assert.equal(statuses.filter((s) => s === 201).length, 10, `phân bố status: ${JSON.stringify(statuses)}`);

      const s = await stats(saleId);
      assert.equal(s["mode"], "v2");
      assert.equal(s["orders"], 10);
      assert.equal(s["distinctUsers"], 10);
      assert.equal(s["oversold"], 0);
      assert.equal(s["redisStock"], 0);
      assert.equal(s["redisBuyers"], 10);
      assert.equal(s["mongoRemaining"], 10, "V2 không chạm flash_sales.remainingQty");
      assert.equal(s["redisInSync"], true);

      const check = await createReconcileService({ redis }).checkSale(saleId);
      assert.equal(check.inSync, true, JSON.stringify(check));
    });

    it("V0: 100 người vào kho 10 -> bán quá thấy được trong stats (tối đa 3 lần thử, reset trước mỗi lần)", async () => {
      const saleId = await createSale({ qty: 10, mode: "v1" });
      const attempts: Record<string, unknown>[] = [];
      for (let i = 0; i < 3; i++) {
        await resetOk(saleId, "v0");
        await burst(saleId, "v0", 100);
        const s = await stats(saleId);
        attempts.push(s);
        if (typeof s["oversold"] === "number" && s["oversold"] > 0) {
          assert.equal(s["mode"], "v0");
          assert.ok(typeof s["mongoRemaining"] === "number" && s["mongoRemaining"] < 0, JSON.stringify(s));
          assert.ok(typeof s["orders"] === "number" && s["orders"] > 10, JSON.stringify(s));
          assert.equal(s["oversold"], (s["orders"] as number) - 10);
          assert.equal(s["redisInSync"], null);
          return;
        }
      }
      assert.fail(`V0 không bán quá sau 3 lần thử: ${JSON.stringify(attempts)}`);
    });
  });
});
