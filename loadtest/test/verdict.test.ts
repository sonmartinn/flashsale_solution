// Test đơn vị cho luật PASS/FAIL/INVALID của E1 và E3 và mã thoát (D-13, D-14, D-15, D-16, D-19).
// Đây là phần lõi của Core Value: V0 bán quá, V1/V2 đúng totalQty đơn trong mọi lượt.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { emptyCounts, type ResponseCounts } from "../lib/classify.js";
import type { ReconcileOutcome, SaleMode, StatsSnapshot } from "../lib/types.js";
import {
  combineE2,
  combineRuns,
  exitCodeFor,
  judgeE1Run,
  judgeE2Run,
  judgeE3Run,
  worstStatus,
  type E2PhaseInput,
} from "../lib/verdict.js";

const SALE_ID = "65a1b2c3d4e5f60718293a4b";

/** Stats mẫu: mặc định là một lượt V1/V2 đúng (100 đơn, tồn kho về 0, không bán quá). */
function stats(overrides: Partial<StatsSnapshot> = {}): StatsSnapshot {
  return {
    saleId: SALE_ID,
    mode: "v1",
    status: "active",
    totalQty: 100,
    mongoRemaining: 0,
    redisStock: null,
    redisBuyers: 0,
    orders: 100,
    distinctUsers: 100,
    oversold: 0,
    redisInSync: null,
    uniqueOrderIndex: true,
    ...overrides,
  };
}

function counts(overrides: Partial<ResponseCounts> = {}): ResponseCounts {
  return { ...emptyCounts(), ...overrides };
}

/** Một lượt E1 đúng của mode cho trước (1000 user, tồn kho 100). */
function e1(
  mode: SaleMode,
  over: { stats?: Partial<StatsSnapshot>; counts?: Partial<ResponseCounts>; distinctIds?: number; reconcile?: ReconcileOutcome } = {},
) {
  const base: Partial<StatsSnapshot> =
    mode === "v2"
      ? { mode, redisStock: 0, redisBuyers: 100, redisInSync: true }
      : mode === "v0"
        ? { mode, mongoRemaining: -50, orders: 150, distinctUsers: 150, oversold: 50 }
        : { mode };
  const baseCounts: Partial<ResponseCounts> =
    mode === "v0" ? { s201: 150, s409SoldOut: 850 } : { s201: 100, s409SoldOut: 900 };
  return judgeE1Run({
    mode,
    users: 1000,
    distinctIds: over.distinctIds ?? 1000,
    counts: counts({ ...baseCounts, ...over.counts }),
    stats: stats({ ...base, ...over.stats }),
    reconcile: over.reconcile ?? (mode === "v2" ? "clean" : "n/a"),
  });
}

/** Một lượt E3 đúng: một user, 10 request, 1 đơn, tồn kho còn 99. */
function e3(
  mode: "v1" | "v2",
  over: { stats?: Partial<StatsSnapshot>; counts?: Partial<ResponseCounts>; distinctIds?: number; reconcile?: ReconcileOutcome } = {},
) {
  const base: Partial<StatsSnapshot> =
    mode === "v2"
      ? { mode, mongoRemaining: 99, redisStock: 99, redisBuyers: 1, orders: 1, distinctUsers: 1, redisInSync: true }
      : { mode, mongoRemaining: 99, orders: 1, distinctUsers: 1 };
  return judgeE3Run({
    mode,
    requests: 10,
    distinctIds: over.distinctIds ?? 1,
    counts: counts({ s201: 1, s409SoldOut: 3, s409AlreadyBought: 6, ...over.counts }),
    stats: stats({ ...base, ...over.stats }),
    reconcile: over.reconcile ?? (mode === "v2" ? "clean" : "n/a"),
  });
}

/** E2: S = 1000 tồn kho, M = 1000 request sold_out. */
const E2_S = 1000;
const E2_M = 1000;

type PhaseOver = { stats?: Partial<StatsSnapshot>; counts?: Partial<ResponseCounts>; setupCalls?: number; distinctIds?: number };

/** Một pha E2 đúng: in_stock S lần 201 rồi S đơn; sold_out M lần 409 SOLD_OUT, vẫn S đơn. */
function e2Phase(mode: "v1" | "v2", phase: "in" | "out", over: PhaseOver = {}): E2PhaseInput {
  const requests = phase === "in" ? E2_S : E2_M;
  const base: Partial<StatsSnapshot> =
    mode === "v2"
      ? { mode, totalQty: E2_S, orders: E2_S, distinctUsers: E2_S, redisStock: 0, redisBuyers: E2_S, redisInSync: true }
      : { mode, totalQty: E2_S, orders: E2_S, distinctUsers: E2_S };
  const baseCounts: Partial<ResponseCounts> = phase === "in" ? { s201: E2_S } : { s409SoldOut: E2_M };
  return {
    requests,
    setupCalls: over.setupCalls ?? requests,
    distinctIds: over.distinctIds ?? requests,
    counts: counts({ ...baseCounts, ...over.counts }),
    stats: stats({ ...base, ...over.stats }),
  };
}

function e2(
  mode: "v1" | "v2",
  over: { inStock?: PhaseOver; soldOut?: PhaseOver; reconcile?: ReconcileOutcome } = {},
) {
  return judgeE2Run({
    mode,
    S: E2_S,
    inStock: e2Phase(mode, "in", over.inStock),
    soldOut: e2Phase(mode, "out", over.soldOut),
    reconcile: over.reconcile ?? (mode === "v2" ? "clean" : "n/a"),
  });
}

describe("verdict.test", () => {
  describe("judgeE2Run: VALID", () => {
    for (const mode of ["v1", "v2"] as const) {
      it(`${mode} sạch: S lần 201 rồi M lần 409 SOLD_OUT, S đơn -> hai dòng VALID`, () => {
        const j = e2(mode);
        assert.deepEqual(j.inStock, { status: "VALID", reasons: [] });
        assert.deepEqual(j.soldOut, { status: "VALID", reasons: [] });
        assert.equal(j.run, "VALID");
      });
    }

    it("in_stock có 3 timeout và S-3 đơn -> VALID kèm ghi chú kho chưa hết", () => {
      const j = e2("v1", {
        inStock: { counts: { s201: E2_S - 3, timeouts: 3 }, stats: { orders: E2_S - 3, distinctUsers: E2_S - 3 } },
      });
      assert.equal(j.inStock.status, "VALID");
      assert.ok(j.inStock.reasons.some((r) => r.includes("kho chưa hết")), j.inStock.reasons.join("; "));
      assert.equal(j.run, "VALID");
    });

    it("5xx chỉ ở pha sold_out, vẫn S đơn -> VALID (lỗi thật được đếm, không phán quyết)", () => {
      const j = e2("v1", { soldOut: { counts: { s409SoldOut: E2_M - 5, s5xx: 5 } } });
      assert.equal(j.inStock.status, "VALID");
      assert.equal(j.soldOut.status, "VALID");
      assert.equal(j.run, "VALID");
    });

    it("lỗi kết nối ở pha in_stock nới luật cho cả dòng sold_out", () => {
      const j = e2("v2", {
        inStock: { counts: { s201: E2_S - 2, connErrors: 2 }, stats: { orders: E2_S - 2, distinctUsers: E2_S - 2 } },
        soldOut: { stats: { orders: E2_S - 2, distinctUsers: E2_S - 2 } },
      });
      assert.equal(j.soldOut.status, "VALID");
      assert.ok(j.soldOut.reasons.some((r) => r.includes("kho chưa hết")));
    });
  });

  describe("judgeE2Run: FAIL", () => {
    it("in_stock không có lỗi thật mà chỉ S-1 đơn -> FAIL", () => {
      const j = e2("v1", { inStock: { stats: { orders: E2_S - 1, distinctUsers: E2_S - 1 } } });
      assert.equal(j.inStock.status, "FAIL");
      assert.equal(j.run, "FAIL");
    });

    it("in_stock có 3 timeout nhưng bán quá 1 đơn -> FAIL", () => {
      const j = e2("v1", {
        inStock: {
          counts: { s201: E2_S - 2, timeouts: 3 },
          stats: { orders: E2_S + 1, distinctUsers: E2_S + 1, oversold: 1 },
        },
      });
      assert.equal(j.inStock.status, "FAIL");
      assert.equal(j.run, "FAIL");
    });

    it("sold_out không có lỗi thật mà số đơn tăng thêm -> FAIL", () => {
      const j = e2("v1", { soldOut: { stats: { orders: E2_S + 1, distinctUsers: E2_S + 1, oversold: 1 } } });
      assert.equal(j.soldOut.status, "FAIL");
    });

    it("v2 đối soát sau sold_out báo lệch -> FAIL", () => {
      const j = e2("v2", { reconcile: "drift" });
      assert.equal(j.soldOut.status, "FAIL");
      assert.ok(j.soldOut.reasons.includes("reconcile báo lệch"));
      assert.equal(j.run, "FAIL");
    });

    it("v2 redisInSync false sau sold_out -> FAIL", () => {
      const j = e2("v2", { soldOut: { stats: { redisInSync: false } } });
      assert.equal(j.soldOut.status, "FAIL");
    });
  });

  describe("judgeE2Run: INVALID", () => {
    it("một 401 -> INVALID", () => {
      const j = e2("v1", { inStock: { counts: { s201: E2_S - 1, s401: 1 } } });
      assert.equal(j.inStock.status, "INVALID");
      assert.equal(j.run, "INVALID");
    });

    it("setupRequest chỉ gọi S-1 lần -> INVALID", () => {
      const j = e2("v1", { inStock: { setupCalls: E2_S - 1 } });
      assert.equal(j.inStock.status, "INVALID");
      assert.equal(j.run, "INVALID");
    });

    it("số id khác nhau ít hơn số request -> INVALID", () => {
      const j = e2("v2", { soldOut: { distinctIds: E2_M - 1 } });
      assert.equal(j.soldOut.status, "INVALID");
    });

    it("distinctUsers ≠ orders -> INVALID", () => {
      const j = e2("v1", { inStock: { stats: { distinctUsers: E2_S - 1 } } });
      assert.equal(j.inStock.status, "INVALID");
    });

    it("v2 reconcile n/a -> INVALID trên dòng sold_out", () => {
      const j = e2("v2", { reconcile: "n/a" });
      assert.equal(j.inStock.status, "VALID");
      assert.equal(j.soldOut.status, "INVALID");
      assert.equal(j.run, "INVALID");
    });

    it("INVALID được xét trước FAIL", () => {
      const j = e2("v1", {
        inStock: { counts: { s201: E2_S - 1, s401: 1 }, stats: { orders: E2_S + 1, distinctUsers: E2_S + 1, oversold: 1 } },
      });
      assert.equal(j.inStock.status, "INVALID");
    });
  });

  describe("combineE2", () => {
    it("rỗng -> INVALID", () => assert.equal(combineE2([]), "INVALID"));
    it("[VALID, FAIL] -> FAIL", () => assert.equal(combineE2(["VALID", "FAIL"]), "FAIL"));
    it("[VALID, INVALID] -> INVALID", () => assert.equal(combineE2(["VALID", "INVALID"]), "INVALID"));
    it("[FAIL, INVALID] -> INVALID", () => assert.equal(combineE2(["FAIL", "INVALID"]), "INVALID"));
    it("[VALID] -> VALID", () => assert.equal(combineE2(["VALID"]), "VALID"));
  });

  describe("judgeE1Run: biên PASS/FAIL", () => {
    for (const mode of ["v1", "v2"] as const) {
      it(`${mode}: orders đúng totalQty, không bán quá -> PASS`, () => {
        assert.deepEqual(e1(mode), { status: "PASS", reasons: [] });
      });

      it(`${mode}: orders = totalQty + 1 -> FAIL`, () => {
        const r = e1(mode, { stats: { orders: 101, distinctUsers: 101, oversold: 1 }, counts: { s201: 101, s409SoldOut: 899 } });
        assert.equal(r.status, "FAIL");
        assert.ok(r.reasons.length > 0);
      });

      it(`${mode}: orders = totalQty - 1 -> FAIL`, () => {
        const r = e1(mode, { stats: { orders: 99, distinctUsers: 99 }, counts: { s201: 99, s409SoldOut: 901 } });
        assert.equal(r.status, "FAIL");
        assert.ok(r.reasons.some((x) => x.includes("orders ≠ totalQty")));
      });
    }

    it("v1: oversold > 0 dù orders = totalQty -> FAIL", () => {
      assert.equal(e1("v1", { stats: { oversold: 1 } }).status, "FAIL");
    });

    it("v0: oversold 0 -> FAIL (V0 không bán quá)", () => {
      const r = e1("v0", { stats: { orders: 100, distinctUsers: 100, oversold: 0, mongoRemaining: 0 } });
      assert.equal(r.status, "FAIL");
      assert.ok(r.reasons.some((x) => x.includes("V0 không bán quá")));
    });

    it("v0: oversold 1 -> PASS", () => {
      const r = e1("v0", { stats: { orders: 101, distinctUsers: 101, oversold: 1, mongoRemaining: -1 } });
      assert.deepEqual(r, { status: "PASS", reasons: [] });
    });

    it("v0: bán quá 50 đơn -> PASS", () => {
      assert.equal(e1("v0").status, "PASS");
    });
  });

  describe("judgeE1Run: INVALID", () => {
    it("một 401 -> INVALID, kể cả khi V0 đã bán quá", () => {
      const r = e1("v0", { counts: { s401: 1, s409SoldOut: 849 } });
      assert.equal(r.status, "INVALID");
      assert.ok(r.reasons.some((x) => x.includes("401")));
    });

    it("một 500 -> INVALID", () => {
      assert.equal(e1("v1", { counts: { s5xx: 1, s409SoldOut: 899 } }).status, "INVALID");
    });

    it("một lỗi kết nối -> INVALID", () => {
      assert.equal(e1("v2", { counts: { connErrors: 1, s409SoldOut: 899 } }).status, "INVALID");
    });

    it("một timeout -> INVALID", () => {
      assert.equal(e1("v1", { counts: { timeouts: 1, s409SoldOut: 899 } }).status, "INVALID");
    });

    it("999 id khác nhau cho 1000 user -> INVALID", () => {
      assert.equal(e1("v1", { distinctIds: 999 }).status, "INVALID");
    });

    it("distinctUsers ≠ orders -> INVALID", () => {
      assert.equal(e1("v1", { stats: { distinctUsers: 99 } }).status, "INVALID");
    });

    it("stats.mode khác mode yêu cầu -> INVALID", () => {
      const r = judgeE1Run({
        mode: "v1",
        users: 1000,
        distinctIds: 1000,
        counts: counts({ s201: 100, s409SoldOut: 900 }),
        stats: stats({ mode: "v2", redisStock: 0, redisBuyers: 100, redisInSync: true }),
        reconcile: "n/a",
      });
      assert.equal(r.status, "INVALID");
    });

    for (const reconcile of ["invalid", "n/a"] as const) {
      it(`v2 với reconcile "${reconcile}" -> INVALID`, () => {
        assert.equal(e1("v2", { reconcile }).status, "INVALID");
      });
    }

    it("v1 với reconcile \"invalid\" -> INVALID", () => {
      assert.equal(e1("v1", { reconcile: "invalid" }).status, "INVALID");
    });

    it("INVALID được xét trước FAIL: V1 bán thiếu nhưng có 401 -> INVALID", () => {
      const r = e1("v1", { stats: { orders: 99, distinctUsers: 99 }, counts: { s201: 99, s401: 1, s409SoldOut: 900 } });
      assert.equal(r.status, "INVALID");
    });
  });

  describe("judgeE1Run: V2 FAIL", () => {
    it("reconcile drift -> FAIL", () => {
      assert.equal(e1("v2", { reconcile: "drift" }).status, "FAIL");
    });

    it("reconcile clean nhưng redisInSync false -> FAIL", () => {
      const r = e1("v2", { stats: { redisInSync: false } });
      assert.equal(r.status, "FAIL");
      assert.ok(r.reasons.some((x) => x.includes("Redis lệch MongoDB")));
    });
  });

  describe("judgeE3Run", () => {
    it("v1: một 201 + chín 409 (lẫn SOLD_OUT/ALREADY_BOUGHT), tồn kho 99 -> PASS", () => {
      const r = e3("v1");
      assert.equal(r.status, "PASS");
      assert.deepEqual(r.reasons, []);
      assert.equal(r.stockLeak, false);
      assert.equal(r.expectedStock, 99);
      assert.equal(r.finalStock, 99);
      assert.equal(r.sOther, 0);
      assert.equal(r.realErrors, 0);
    });

    it("v2: một 201 + chín ALREADY_BOUGHT, redisStock 99, redisBuyers 1, reconcile clean -> PASS", () => {
      const r = e3("v2", { counts: { s409SoldOut: 0, s409AlreadyBought: 9 } });
      assert.equal(r.status, "PASS");
      assert.equal(r.finalStock, 99);
      assert.equal(r.stockLeak, false);
    });

    it("hai 201 -> FAIL", () => {
      const r = e3("v1", { counts: { s201: 2, s409AlreadyBought: 5 } });
      assert.equal(r.status, "FAIL");
    });

    it("v1: mongoRemaining 98 -> FAIL, stockLeak true", () => {
      const r = e3("v1", { stats: { mongoRemaining: 98 } });
      assert.equal(r.status, "FAIL");
      assert.equal(r.stockLeak, true);
      assert.equal(r.finalStock, 98);
    });

    it("v2: redisBuyers 2 -> FAIL", () => {
      const r = e3("v2", { stats: { redisBuyers: 2 } });
      assert.equal(r.status, "FAIL");
      assert.equal(r.stockLeak, true);
    });

    it("v2: redisStock 98 -> FAIL", () => {
      assert.equal(e3("v2", { stats: { redisStock: 98 } }).status, "FAIL");
    });

    it("v2: reconcile drift -> FAIL", () => {
      const r = e3("v2", { reconcile: "drift" });
      assert.equal(r.status, "FAIL");
      assert.equal(r.stockLeak, true);
    });

    it("stats.orders 0 -> FAIL", () => {
      assert.equal(e3("v1", { stats: { orders: 0, distinctUsers: 0, mongoRemaining: 100 } }).status, "FAIL");
    });

    it("một 500 -> INVALID", () => {
      const r = e3("v1", { counts: { s5xx: 1, s409AlreadyBought: 5 } });
      assert.equal(r.status, "INVALID");
      assert.equal(r.realErrors, 1);
    });

    it("hai id khác nhau -> INVALID", () => {
      assert.equal(e3("v1", { distinctIds: 2 }).status, "INVALID");
    });

    it("một 401 -> INVALID", () => {
      const r = e3("v1", { counts: { s401: 1, s409AlreadyBought: 5 } });
      assert.equal(r.status, "INVALID");
      assert.equal(r.sOther, 1);
    });

    it("distinctUsers ≠ orders -> INVALID", () => {
      assert.equal(e3("v1", { stats: { orders: 2, distinctUsers: 1, mongoRemaining: 98 } }).status, "INVALID");
    });

    it("v2 với reconcile \"invalid\" -> INVALID", () => {
      assert.equal(e3("v2", { reconcile: "invalid" }).status, "INVALID");
    });
  });

  describe("combineRuns, worstStatus, exitCodeFor", () => {
    it("không có lượt nào -> INVALID", () => {
      assert.equal(combineRuns([]), "INVALID");
    });

    it("[PASS, FAIL, PASS] -> FAIL", () => {
      assert.equal(combineRuns(["PASS", "FAIL", "PASS"]), "FAIL");
    });

    it("[PASS, INVALID, FAIL] -> INVALID", () => {
      assert.equal(combineRuns(["PASS", "INVALID", "FAIL"]), "INVALID");
    });

    it("[PASS, PASS] -> PASS", () => {
      assert.equal(combineRuns(["PASS", "PASS"]), "PASS");
    });

    it("worstStatus xếp INVALID > FAIL > PASS", () => {
      assert.equal(worstStatus("PASS", "FAIL"), "FAIL");
      assert.equal(worstStatus("FAIL", "PASS"), "FAIL");
      assert.equal(worstStatus("FAIL", "INVALID"), "INVALID");
      assert.equal(worstStatus("PASS", "PASS"), "PASS");
    });

    it("mã thoát: PASS 0, VALID 0, FAIL 1, INVALID 2", () => {
      assert.equal(exitCodeFor("PASS"), 0);
      assert.equal(exitCodeFor("VALID"), 0);
      assert.equal(exitCodeFor("FAIL"), 1);
      assert.equal(exitCodeFor("INVALID"), 2);
    });
  });
});
