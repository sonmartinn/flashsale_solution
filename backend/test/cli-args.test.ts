// Test đơn vị cho bộ phân tích tham số dòng lệnh của seed và reset (không đụng tới database).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CliArgsError, parseSeedArgs } from "../scripts/cli-args.js";

describe("cli-args.test", () => {
  describe("parseSeedArgs", () => {
    it("không có tham số: mặc định qty 100, mode v2", () => {
      assert.deepEqual(parseSeedArgs([]), { qty: 100, mode: "v2" });
    });

    it("nhận --qty và --mode dạng tách rời", () => {
      assert.deepEqual(parseSeedArgs(["--qty", "5", "--mode", "v1"]), { qty: 5, mode: "v1" });
    });

    it("nhận dạng --qty=5", () => {
      assert.deepEqual(parseSeedArgs(["--qty=5"]), { qty: 5, mode: "v2" });
    });

    it("nhận qty lớn nhất 1000000", () => {
      assert.deepEqual(parseSeedArgs(["--qty", "1000000", "--mode", "v0"]), { qty: 1_000_000, mode: "v0" });
    });

    for (const bad of ["0", "-1", "1.5", "abc", "1000001", "", "007"]) {
      it(`từ chối --qty "${bad}"`, () => {
        assert.throws(() => parseSeedArgs([`--qty=${bad}`]), CliArgsError);
      });
    }

    it("từ chối --qty -1 dạng tách rời", () => {
      assert.throws(() => parseSeedArgs(["--qty", "-1"]), CliArgsError);
    });

    it("thông báo lỗi qty bằng tiếng Việt và nêu --qty", () => {
      assert.throws(() => parseSeedArgs(["--qty", "0"]), (err: unknown) => {
        assert.ok(err instanceof CliArgsError);
        assert.match(err.message, /--qty phải là số nguyên dương từ 1 đến 1000000/);
        return true;
      });
    });

    it("từ chối mode viết hoa V2", () => {
      assert.throws(() => parseSeedArgs(["--mode", "V2"]), (err: unknown) => {
        assert.ok(err instanceof CliArgsError);
        assert.match(err.message, /--mode phải là v0, v1 hoặc v2/);
        return true;
      });
    });

    it("từ chối cờ lạ --bogus", () => {
      assert.throws(() => parseSeedArgs(["--bogus"]), (err: unknown) => {
        assert.ok(err instanceof CliArgsError);
        assert.match(err.message, /Tham số không hợp lệ/);
        return true;
      });
    });

    it("từ chối tham số vị trí", () => {
      assert.throws(() => parseSeedArgs(["x"]), CliArgsError);
    });

    it("từ chối --qty thiếu giá trị", () => {
      assert.throws(() => parseSeedArgs(["--qty"]), CliArgsError);
    });
  });
});
