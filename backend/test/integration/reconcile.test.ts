// Test tích hợp cho đối chiếu Redis–MongoDB (D-26 tới D-31): service gọi trong tiến trình và CLI chạy thật.
// Cần "docker compose up -d --wait". Dùng database flashsale_test_reconcile_<pid> và Redis db 11 (không bao giờ db 0).
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { Types } from "mongoose";
import type { Redis } from "ioredis";
import { buyersKey, stockKey } from "../../src/config/redis.js";
import { ensureIndexes, FlashSale, Order, Product, StockMovement } from "../../src/models/index.js";
import { createReconcileService, type ReconcileService } from "../../src/services/reconcile.service.js";
import { HttpError } from "../../src/utils/http-error.js";
import {
  connectTestStores,
  dropTestDatabaseAndDisconnect,
  spawnCli,
  testMongoUri,
  testRedisUrl,
  type SpawnResult,
} from "../helpers.js";

const REDIS_DB = 11;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const NOTE = "Chỉ chạy đối chiếu khi không có lượt mua";

function isHttpError(status: number, code: string) {
  return (err: unknown): boolean => {
    assert.ok(err instanceof HttpError, `phải là HttpError, nhận ${String(err)}`);
    assert.equal(err.status, status);
    assert.equal(err.code, code);
    return true;
  };
}

/**
 * Redis giả cho nhánh lỗi của --fix: get/smembers đọc Redis thật (để fixSale thấy lệch),
 * còn multi().set().del().sadd().exec() trả về kết quả cho trước.
 */
function fakeMultiRedis(real: Redis, execResult: [Error | null, unknown][] | null): Redis {
  const chain = {
    set: () => chain,
    del: () => chain,
    sadd: () => chain,
    exec: async () => execResult,
  };
  return {
    get: real.get.bind(real),
    smembers: real.smembers.bind(real),
    multi: () => chain,
  } as unknown as Redis;
}

/** Chạy npm run reconcile thật, KHÔNG có JWT_SECRET trong env (D-26). */
function runCli(args: string[]): Promise<SpawnResult> {
  return spawnCli("reconcile", {
    env: { MONGODB_URI: testMongoUri("reconcile"), REDIS_URL: testRedisUrl(REDIS_DB) },
    args,
  });
}

function assertNote(r: SpawnResult): void {
  assert.ok((r.stdout + r.stderr).includes(NOTE), `thiếu dòng lưu ý:\n${r.stdout}\n${r.stderr}`);
}

describe("reconcile.test", () => {
  let redis: Redis;
  let service: ReconcileService;
  let productId: Types.ObjectId;
  /** Đợt v2 A: totalQty 10, 3 đơn thành công của u1, u2, u3 */
  let saleA: string;
  /** Đợt v1 B: totalQty 5, không có khóa Redis */
  let saleB: string;
  let u1: string;
  let u2: string;
  let u3: string;
  const x = String(new Types.ObjectId());

  /** Ghi lại stock:<id> (DEL khi null) và buyers:<id> cho một case. */
  async function setRedis(saleId: string, stock: string | null, members: string[]): Promise<void> {
    if (stock === null) await redis.del(stockKey(saleId));
    else await redis.set(stockKey(saleId), stock);
    await redis.del(buyersKey(saleId));
    if (members.length > 0) await redis.sadd(buyersKey(saleId), members);
  }

  async function createSale(totalQty: number, mode: "v1" | "v2"): Promise<string> {
    const sale = await FlashSale.create({
      productId,
      salePrice: 449_500,
      totalQty,
      remainingQty: totalQty,
      perUserLimit: 1,
      status: "active",
      startAt: new Date(),
      endAt: new Date(Date.now() + SEVEN_DAYS_MS),
      mode,
    });
    return String(sale._id);
  }

  before(async () => {
    ({ redis } = await connectTestStores("reconcile", REDIS_DB));
    await redis.flushdb();
    await ensureIndexes();
    const product = await Product.create({
      name: "Áo test đối chiếu",
      slug: "ao-test-doi-chieu",
      category: "ao",
      price: 899_000,
    });
    productId = product._id;
    saleA = await createSale(10, "v2");
    saleB = await createSale(5, "v1");
    const users = [new Types.ObjectId(), new Types.ObjectId(), new Types.ObjectId()];
    for (const userId of users) {
      await Order.create({ userId, saleId: saleA, productId, qty: 1, price: 449_500, mode: "v2" });
    }
    [u1, u2, u3] = users.map(String) as [string, string, string];
    service = createReconcileService({ redis });
  });

  after(async () => {
    await redis.flushdb();
    await dropTestDatabaseAndDisconnect(redis);
  });

  describe("service", () => {
    it("Redis khớp MongoDB: inSync, stock 7 = 10 - 3", async () => {
      await setRedis(saleA, "7", [u1, u2, u3]);
      const c = await service.checkSale(saleA);
      assert.equal(c.inSync, true);
      assert.equal(c.expectedStock, 7);
      assert.equal(c.actualStock, 7);
      assert.equal(c.successOrders, 3);
      assert.equal(c.totalQty, 10);
      assert.equal(c.mode, "v2");
      assert.deepEqual(c.missingBuyers, []);
      assert.deepEqual(c.extraBuyers, []);
    });

    it("stock lệch (9): không khớp", async () => {
      await setRedis(saleA, "9", [u1, u2, u3]);
      const c = await service.checkSale(saleA);
      assert.equal(c.inSync, false);
      assert.equal(c.actualStock, 9);
      assert.equal(c.expectedStock, 7);
    });

    it("thiếu khóa stock: actualStock null và tính là lệch (D-28)", async () => {
      await setRedis(saleA, null, [u1, u2, u3]);
      const c = await service.checkSale(saleA);
      assert.equal(c.actualStock, null);
      assert.equal(c.inSync, false);
    });

    it("buyers thiếu u3: missingBuyers [u3]", async () => {
      await setRedis(saleA, "7", [u1, u2]);
      const c = await service.checkSale(saleA);
      assert.deepEqual(c.missingBuyers, [u3]);
      assert.deepEqual(c.extraBuyers, []);
      assert.equal(c.inSync, false);
    });

    it("buyers thừa x: extraBuyers [x]", async () => {
      await setRedis(saleA, "7", [u1, u2, u3, x]);
      const c = await service.checkSale(saleA);
      assert.deepEqual(c.extraBuyers, [x]);
      assert.deepEqual(c.missingBuyers, []);
      assert.equal(c.inSync, false);
    });

    it("listSales trả mọi đợt sale kèm mode", async () => {
      const sales = await service.listSales();
      assert.deepEqual(
        sales,
        [
          { saleId: saleA, mode: "v2" },
          { saleId: saleB, mode: "v1" },
        ].sort((a, b) => a.saleId.localeCompare(b.saleId)),
      );
    });

    it("saleId không hợp lệ: 400 INVALID_ID", async () => {
      await assert.rejects(service.checkSale("abc"), isHttpError(400, "INVALID_ID"));
    });

    it("saleId hợp lệ nhưng không tồn tại: 404 NOT_FOUND", async () => {
      await assert.rejects(service.checkSale(String(new Types.ObjectId())), isHttpError(404, "NOT_FOUND"));
    });
  });

  describe("CLI", () => {
    it("--sale A khớp: mã 0, in KHỚP", async () => {
      await setRedis(saleA, "7", [u1, u2, u3]);
      const r = await runCli(["--sale", saleA]);
      assert.equal(r.code, 0, r.stderr);
      assert.match(r.stdout, /KHỚP/);
      assertNote(r);
    });

    it("stock 9: mã 2, in LỆCH và mong đợi 7", async () => {
      await setRedis(saleA, "9", [u1, u2, u3]);
      const r = await runCli(["--sale", saleA]);
      assert.equal(r.code, 2, r.stderr);
      assert.match(r.stdout, /LỆCH/);
      assert.match(r.stdout, /mong đợi 7/);
      assertNote(r);
    });

    it("thiếu khóa stock: mã 2, in thiếu khóa", async () => {
      await setRedis(saleA, null, [u1, u2, u3]);
      const r = await runCli(["--sale", saleA]);
      assert.equal(r.code, 2, r.stderr);
      assert.match(r.stdout, /thiếu khóa/);
      assertNote(r);
    });

    it("buyer thừa x: mã 2, in id x", async () => {
      await setRedis(saleA, "7", [u1, u2, u3, x]);
      const r = await runCli(["--sale", saleA]);
      assert.equal(r.code, 2, r.stderr);
      assert.ok(r.stdout.includes(x), r.stdout);
      assertNote(r);
    });

    it("--sale B (v1): mã 0, bỏ qua (mode v1)", async () => {
      const r = await runCli(["--sale", saleB]);
      assert.equal(r.code, 0, r.stderr);
      assert.match(r.stdout, /bỏ qua \(mode v1\)/);
      assertNote(r);
    });

    it("không có --sale, A khớp: mã 0, kèm dòng bỏ qua đợt B", async () => {
      await setRedis(saleA, "7", [u1, u2, u3]);
      const r = await runCli([]);
      assert.equal(r.code, 0, r.stderr);
      assert.match(r.stdout, /KHỚP/);
      assert.ok(r.stdout.includes(`Đợt sale ${saleB}: bỏ qua (mode v1)`), r.stdout);
      assertNote(r);
    });

    it("--sale abc: mã 1, [LỖI] kèm dòng cách dùng", async () => {
      const r = await runCli(["--sale", "abc"]);
      assert.equal(r.code, 1);
      assert.match(r.stderr, /\[LỖI\]/);
      assert.match(r.stderr, /Cách dùng: npm run reconcile/);
      assertNote(r);
    });

    it("--sale id hợp lệ nhưng không tồn tại: mã 1, [LỖI]", async () => {
      const r = await runCli(["--sale", String(new Types.ObjectId())]);
      assert.equal(r.code, 1);
      assert.match(r.stderr, /\[LỖI\]/);
      assertNote(r);
    });
  });

  describe("fixSale", () => {
    /** Các biến động reconcile_fix của một đợt sale. */
    function fixMoves(saleId: string) {
      return StockMovement.find({ saleId, reason: "reconcile_fix" }).lean();
    }

    it("stock 9, buyers {u1, u2, x}: sửa về stock 7, buyers {u1, u2, u3}, ghi 1 biến động delta -2", async () => {
      await StockMovement.deleteMany({ reason: "reconcile_fix" });
      await setRedis(saleA, "9", [u1, u2, x]);
      const result = await service.fixSale(saleA);
      assert.equal(result.before.inSync, false);
      assert.equal(result.after.inSync, true);
      assert.equal(result.oldStock, 9);
      assert.equal(result.newStock, 7);
      assert.equal(await redis.get(stockKey(saleA)), "7");
      assert.deepEqual((await redis.smembers(buyersKey(saleA))).sort(), [u1, u2, u3].sort());
      const moves = await fixMoves(saleA);
      assert.equal(moves.length, 1);
      assert.equal(moves[0]!.delta, -2);
      assert.equal(moves[0]!.orderId, null);
    });

    it("thiếu khóa stock: oldStock 0, newStock 7, delta 7", async () => {
      await StockMovement.deleteMany({ reason: "reconcile_fix" });
      await setRedis(saleA, null, [u1, u2, u3]);
      const result = await service.fixSale(saleA);
      assert.equal(result.oldStock, 0);
      assert.equal(result.newStock, 7);
      assert.equal(result.after.inSync, true);
      const moves = await fixMoves(saleA);
      assert.equal(moves.length, 1);
      assert.equal(moves[0]!.delta, 7);
    });

    it("đợt v2 không có đơn nào: stock 4, không còn khóa buyers (bỏ qua SADD), delta 3", async () => {
      const saleC = await createSale(4, "v2");
      try {
        await setRedis(saleC, "1", [x]);
        const result = await service.fixSale(saleC);
        assert.equal(result.after.inSync, true);
        assert.equal(await redis.get(stockKey(saleC)), "4");
        assert.equal(await redis.exists(buyersKey(saleC)), 0);
        const moves = await fixMoves(saleC);
        assert.equal(moves.length, 1);
        assert.equal(moves[0]!.delta, 3);
      } finally {
        await FlashSale.deleteOne({ _id: saleC });
        await StockMovement.deleteMany({ saleId: saleC });
        await redis.del(stockKey(saleC), buyersKey(saleC));
      }
    });

    it("một lệnh trong multi() báo lỗi: fixSale reject, không ghi biến động reconcile_fix", async () => {
      await StockMovement.deleteMany({ reason: "reconcile_fix" });
      await setRedis(saleA, "9", [u1, u2, u3]);
      const broken = createReconcileService({
        redis: fakeMultiRedis(redis, [
          [null, "OK"],
          [new Error("boom"), null],
        ]),
      });
      await assert.rejects(broken.fixSale(saleA), /boom/);
      assert.equal((await fixMoves(saleA)).length, 0);
    });

    it("exec() trả về null (multi bị hủy): fixSale reject, không ghi biến động", async () => {
      await StockMovement.deleteMany({ reason: "reconcile_fix" });
      await setRedis(saleA, "9", [u1, u2, u3]);
      const aborted = createReconcileService({ redis: fakeMultiRedis(redis, null) });
      await assert.rejects(aborted.fixSale(saleA), /multi\(\) bị hủy/);
      assert.equal((await fixMoves(saleA)).length, 0);
    });

    it("P3: fixSale không sửa FlashSale hay Order trong MongoDB", async () => {
      await setRedis(saleA, "9", [u1, x]);
      const saleBefore = await FlashSale.findById(saleA).lean();
      const ordersBefore = await Order.find({ saleId: saleA }).sort({ _id: 1 }).lean();
      await service.fixSale(saleA);
      const saleAfter = await FlashSale.findById(saleA).lean();
      const ordersAfter = await Order.find({ saleId: saleA }).sort({ _id: 1 }).lean();
      assert.deepEqual(saleAfter, saleBefore);
      assert.deepEqual(ordersAfter, ordersBefore);
      assert.equal(ordersAfter.length, 3);
    });
  });

  describe("CLI --fix", () => {
    it("stock 9 với --sale A --fix: mã 0, in Đã sửa và KHỚP, Redis đã được sửa", async () => {
      await setRedis(saleA, "9", [u1, u2, u3]);
      const r = await runCli(["--sale", saleA, "--fix"]);
      assert.equal(r.code, 0, r.stderr);
      assert.match(r.stdout, /Đã sửa/);
      assert.match(r.stdout, /KHỚP/);
      assert.equal(await redis.get(stockKey(saleA)), "7");
      assert.deepEqual((await redis.smembers(buyersKey(saleA))).sort(), [u1, u2, u3].sort());
      assertNote(r);
    });

    it("đợt đã khớp với --fix: mã 0, không ghi biến động mới", async () => {
      await setRedis(saleA, "7", [u1, u2, u3]);
      await StockMovement.deleteMany({ reason: "reconcile_fix" });
      const r = await runCli(["--sale", saleA, "--fix"]);
      assert.equal(r.code, 0, r.stderr);
      assert.doesNotMatch(r.stdout, /Đã sửa/);
      assert.equal(await StockMovement.countDocuments({ reason: "reconcile_fix" }), 0);
    });

    it("lệch mà không có --fix: vẫn mã 2 và Redis giữ nguyên", async () => {
      await setRedis(saleA, "9", [u1, u2, u3]);
      const r = await runCli(["--sale", saleA]);
      assert.equal(r.code, 2, r.stderr);
      assert.equal(await redis.get(stockKey(saleA)), "9");
    });
  });
});
