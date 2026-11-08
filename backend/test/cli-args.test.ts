// Test đơn vị cho bộ phân tích tham số dòng lệnh của seed, reset và reconcile (không đụng tới database).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CliArgsError, parseReconcileArgs, parseResetArgs, parseSeedArgs } from "../scripts/cli-args.js";

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

  describe("parseResetArgs", () => {
    it("không có tham số: trả về object rỗng (reset mọi sale, giữ mode)", () => {
      assert.deepEqual(parseResetArgs([]), {});
    });

    it("--sale viết hoa được chuẩn hóa về chữ thường", () => {
      assert.deepEqual(parseResetArgs(["--sale", "64AB64AB64AB64AB64AB64AB"]), { saleId: "64ab64ab64ab64ab64ab64ab" });
    });

    it("nhận --sale và --mode cùng lúc", () => {
      assert.deepEqual(parseResetArgs(["--sale=64ab64ab64ab64ab64ab64ab", "--mode", "v0"]), {
        saleId: "64ab64ab64ab64ab64ab64ab",
        mode: "v0",
      });
    });

    it("chỉ có --mode thì không có khóa saleId", () => {
      assert.deepEqual(parseResetArgs(["--mode", "v1"]), { mode: "v1" });
    });

    it("từ chối --sale không phải ObjectId", () => {
      assert.throws(() => parseResetArgs(["--sale", "abc"]), (err: unknown) => {
        assert.ok(err instanceof CliArgsError);
        assert.match(err.message, /--sale phải là ObjectId 24 ký tự hex/);
        return true;
      });
    });

    it("từ chối --mode v3", () => {
      assert.throws(() => parseResetArgs(["--mode", "v3"]), CliArgsError);
    });

    it("từ chối cờ lạ --bogus", () => {
      assert.throws(() => parseResetArgs(["--bogus"]), CliArgsError);
    });

    it("không có --qty cho reset (reset không đổi totalQty)", () => {
      assert.throws(() => parseResetArgs(["--qty", "5"]), CliArgsError);
    });
  });

  describe("parseReconcileArgs", () => {
    const ID = "64ab64ab64ab64ab64ab64ab";

    it("không có tham số: đối chiếu mọi đợt, không sửa", () => {
      assert.deepEqual(parseReconcileArgs([]), { fix: false });
    });

    it("--fix bật chế độ sửa", () => {
      assert.deepEqual(parseReconcileArgs(["--fix"]), { fix: true });
    });

    it("--sale viết hoa được chuẩn hóa về chữ thường, fix mặc định false", () => {
      assert.deepEqual(parseReconcileArgs(["--sale", ID.toUpperCase()]), { saleId: ID, fix: false });
    });

    it("nhận --sale và --fix cùng lúc", () => {
      assert.deepEqual(parseReconcileArgs(["--sale", ID, "--fix"]), { saleId: ID, fix: true });
    });

    it("từ chối --fix=yes (cờ boolean không nhận giá trị)", () => {
      assert.throws(() => parseReconcileArgs(["--fix=yes"]), CliArgsError);
    });

    it("từ chối --sale không phải ObjectId", () => {
      assert.throws(() => parseReconcileArgs(["--sale", "abc"]), (err: unknown) => {
        assert.ok(err instanceof CliArgsError);
        assert.match(err.message, /--sale phải là ObjectId 24 ký tự hex/);
        return true;
      });
    });

    it("từ chối --sale thiếu giá trị", () => {
      assert.throws(() => parseReconcileArgs(["--sale"]), CliArgsError);
    });

    it("không có --mode cho reconcile", () => {
      assert.throws(() => parseReconcileArgs(["--mode", "v1"]), CliArgsError);
    });

    it("từ chối cờ lạ --bogus", () => {
      assert.throws(() => parseReconcileArgs(["--bogus"]), CliArgsError);
    });

    it("từ chối tham số vị trí", () => {
      assert.throws(() => parseReconcileArgs(["x"]), CliArgsError);
    });
  });
});
