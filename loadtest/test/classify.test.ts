// Test đơn vị cho bộ phân loại phản hồi của request mua (D-09, SPECS §10, RESEARCH A3).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  BUCKETS,
  classifyFetchError,
  classifyStatus,
  emptyCounts,
  parseErrorCode,
  realErrors,
  type Bucket,
} from "../lib/classify.js";

describe("classify.test", () => {
  const statusCases: Array<[number, string | undefined, Bucket]> = [
    [201, undefined, "s201"],
    [409, "SOLD_OUT", "s409SoldOut"],
    [409, "ALREADY_BOUGHT", "s409AlreadyBought"],
    [409, "DUPLICATE", "sOther4xx"],
    [409, undefined, "sOther4xx"],
    [401, "UNAUTHORIZED", "s401"],
    [400, "SALE_NOT_ACTIVE", "sOther4xx"],
    [404, "NOT_FOUND", "sOther4xx"],
    [200, undefined, "sOther4xx"],
    [302, undefined, "sOther4xx"],
    [500, "INTERNAL_ERROR", "s5xx"],
    [503, "STOCK_NOT_LOADED", "s5xx"],
    [504, undefined, "s5xx"],
  ];
  for (const [status, code, bucket] of statusCases) {
    it(`classifyStatus(${status}, ${code ?? "không có mã"}) -> ${bucket}`, () => {
      assert.equal(classifyStatus(status, code), bucket);
    });
  }

  it("timeout của AbortSignal.timeout (TimeoutError) -> timeouts", () => {
    assert.equal(classifyFetchError(new DOMException("hết giờ", "TimeoutError")), "timeouts");
  });

  it("AbortError -> timeouts", () => {
    assert.equal(classifyFetchError(new DOMException("đã hủy", "AbortError")), "timeouts");
  });

  it("TypeError fetch failed có cause ECONNRESET -> connErrors", () => {
    const err = new TypeError("fetch failed", { cause: Object.assign(new Error("socket hang up"), { code: "ECONNRESET" }) });
    assert.equal(classifyFetchError(err), "connErrors");
  });

  it("TypeError fetch failed có cause ECONNREFUSED -> connErrors", () => {
    const err = new TypeError("fetch failed", { cause: { code: "ECONNREFUSED" } });
    assert.equal(classifyFetchError(err), "connErrors");
  });

  for (const other of [new Error("lạ"), "chuỗi", 42, null, undefined, {}]) {
    it(`lỗi khác (${String(other)}) -> connErrors`, () => {
      assert.equal(classifyFetchError(other), "connErrors");
    });
  }

  it("parseErrorCode đọc được mã trong JSON lỗi", () => {
    assert.equal(parseErrorCode('{"message":"x","code":"SOLD_OUT"}'), "SOLD_OUT");
  });

  for (const body of ["not json", "[]", '{"code":5}', "", "null", '"SOLD_OUT"', '{"message":"x"}', '["code"]']) {
    it(`parseErrorCode(${JSON.stringify(body)}) -> undefined, không ném lỗi`, () => {
      assert.equal(parseErrorCode(body), undefined);
    });
  }

  it("emptyCounts có đủ tám nhóm, tất cả bằng 0", () => {
    const counts = emptyCounts();
    assert.deepEqual(Object.keys(counts), [...BUCKETS]);
    for (const bucket of BUCKETS) assert.equal(counts[bucket], 0);
    // Mỗi lần gọi trả về object mới
    counts.s201 = 5;
    assert.equal(emptyCounts().s201, 0);
  });

  it("realErrors chỉ tính 5xx + lỗi kết nối + timeout, bỏ qua 4xx", () => {
    const counts = {
      ...emptyCounts(),
      s201: 100,
      s409SoldOut: 800,
      s409AlreadyBought: 50,
      s401: 3,
      sOther4xx: 7,
      s5xx: 2,
      connErrors: 4,
      timeouts: 1,
    };
    assert.equal(realErrors(counts), 7);
    assert.equal(realErrors({ ...emptyCounts(), s409SoldOut: 900, s401: 1, sOther4xx: 1 }), 0);
  });
});
