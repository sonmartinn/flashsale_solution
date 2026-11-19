// Test đơn vị cho phân vị nearest-rank và trung vị do harness tự tính (D-23, D-26).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { median, nearestRank, summarize } from "../lib/histogram.js";

/** Mảng 1..n đã sắp xếp. */
function oneTo(n: number): Float64Array {
  return Float64Array.from({ length: n }, (_, i) => i + 1);
}

describe("histogram.test", () => {
  describe("nearestRank", () => {
    const sorted = oneTo(100);
    for (const [p, expected] of [
      [50, 50],
      [95, 95],
      [99, 99],
      [100, 100],
    ] as const) {
      it(`p${p} trên 1..100 là ${expected}`, () => {
        assert.equal(nearestRank(sorted, p), expected);
      });
    }

    it("một phần tử: mọi phân vị là phần tử đó", () => {
      const one = Float64Array.of(42.5);
      assert.equal(nearestRank(one, 50), 42.5);
      assert.equal(nearestRank(one, 95), 42.5);
      assert.equal(nearestRank(one, 100), 42.5);
    });

    it("mảng rỗng cho NaN", () => {
      assert.ok(Number.isNaN(nearestRank(new Float64Array(0), 95)));
    });

    it("p95 trên 1..20 là phần tử thứ ceil(19) = 19", () => {
      assert.equal(nearestRank(oneTo(20), 95), 19);
    });
  });

  describe("summarize", () => {
    it("sắp xếp theo số, không theo chuỗi: [10, 9, 100] -> p50 10, max 100, mean 39.67", () => {
      const s = summarize(Float64Array.of(10, 9, 100));
      assert.equal(s.n, 3);
      assert.equal(s.p50, 10);
      assert.equal(s.p95, 100);
      assert.equal(s.p99, 100);
      assert.equal(s.max, 100);
      assert.equal(Number(s.mean.toFixed(2)), 39.67);
    });

    it("không sửa mảng đầu vào", () => {
      const input = Float64Array.of(3, 1, 2);
      summarize(input);
      assert.deepEqual(Array.from(input), [3, 1, 2]);
    });

    it("mảng rỗng: n 0, mọi trường số là NaN", () => {
      const s = summarize(new Float64Array(0));
      assert.equal(s.n, 0);
      for (const v of [s.p50, s.p95, s.p99, s.mean, s.max]) assert.ok(Number.isNaN(v));
    });

    it("1..100 không theo thứ tự cho p50 50, p95 95, p99 99, max 100, mean 50.5", () => {
      const shuffled = Float64Array.from(oneTo(100)).reverse();
      const s = summarize(shuffled);
      assert.deepEqual([s.p50, s.p95, s.p99, s.max, s.mean], [50, 95, 99, 100, 50.5]);
    });
  });

  describe("median", () => {
    it("số phần tử lẻ: [3, 1, 2] -> 2", () => {
      assert.equal(median([3, 1, 2]), 2);
    });

    it("số phần tử chẵn: [4, 1, 3, 2] -> 2.5", () => {
      assert.equal(median([4, 1, 3, 2]), 2.5);
    });

    it("rỗng -> NaN", () => {
      assert.ok(Number.isNaN(median([])));
    });

    it("sắp xếp theo số: [100, 9, 10] -> 10", () => {
      assert.equal(median([100, 9, 10]), 10);
    });

    it("không sửa mảng đầu vào", () => {
      const input = [3, 1, 2];
      median(input);
      assert.deepEqual(input, [3, 1, 2]);
    });
  });
});
